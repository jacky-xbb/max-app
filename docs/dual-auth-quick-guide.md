# 双认证模式快速指南

## 1. 环境检测方案

### 1.1 如何判断是企微还是浏览器？

**核心原理：检测 User-Agent**

```javascript
// server/utils/envDetector.js

/**
 * 检测是否在企业微信环境中
 */
function isWeComEnvironment(userAgent) {
    if (!userAgent) return false;
    
    // 企业微信的 User-Agent 特征
    const wecomPatterns = [
        /wxwork/i,           // 企业微信标识
        /WeCom/i,            // 企业微信英文版
        /MicroMessenger/i    // 微信/企业微信通用标识
    ];
    
    return wecomPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * 从请求中检测环境
 */
function detectEnvironment(req) {
    const userAgent = req.headers['user-agent'] || '';
    const isWeCom = isWeComEnvironment(userAgent);
    
    return {
        isWeCom,                    // 是否企微环境
        isMobile: /Mobile|Android|iPhone|iPad/i.test(userAgent),
        userAgent,
        platform: isWeCom ? 'wecom' : 'browser'
    };
}

module.exports = { isWeComEnvironment, detectEnvironment };
```

### 1.2 User-Agent 示例

**企业微信内打开：**
```
Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) 
AppleWebKit/605.1.15 (KHTML, like Gecko) 
Mobile/15E148 
wxwork/4.0.16 
MicroMessenger/8.0.5
```

**浏览器打开：**
```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) 
AppleWebKit/537.36 (KHTML, like Gecko) 
Chrome/120.0.0.0 Safari/537.36
```

**关键区别：**
- 企微有 `wxwork` 或 `WeCom` 标识
- 浏览器没有这些标识

---

## 2. 现有企微 H5 认证流程

### 2.1 流程图

```
用户在企微中打开应用
        ↓
访问 GET /
        ↓
重定向到 GET /auth/login
        ↓
检测到企微环境
        ↓
重定向到企微 OAuth 授权页面
https://open.weixin.qq.com/connect/oauth2/authorize?
  appid=CORP_ID
  &redirect_uri=https://your-domain.com/auth/callback
  &response_type=code
  &scope=snsapi_base
        ↓
用户点击"确认授权"
        ↓
企微回调 GET /auth/callback?code=xxx
        ↓
后端用 code 换取用户信息
- 调用企微 API: /cgi-bin/user/getuserinfo
- 使用 access_token + code
        ↓
获取到用户信息 { UserId, name, ... }
        ↓
存入 Session
req.session.userId = userInfo.UserId
req.session.userName = userInfo.name
        ↓
重定向到聊天页面
/chat.html?userId=xxx&userName=xxx
        ↓
用户开始使用
```

### 2.2 关键代码

**1. 登录入口** (`server/routes/auth.js`)
```javascript
router.get('/login', (req, res) => {
    // 构建回调URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/auth/callback`;
    
    // 构建企微授权URL
    const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?` +
        `appid=${config.corpId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=snsapi_base` +
        `&state=STATE#wechat_redirect`;
    
    // 重定向到企微授权页
    res.redirect(authUrl);
});
```

**2. OAuth 回调** (`server/routes/auth.js`)
```javascript
router.get('/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).send('缺少授权码');
    }
    
    try {
        // 用 code 换取用户信息
        const userInfo = await userUtils.getUserInfoByCode(code);
        
        if (userInfo && userInfo.UserId) {
            // 存入 Session
            req.session.userId = userInfo.UserId;
            req.session.userName = userInfo.name || userInfo.UserId;
            req.session.userInfo = userInfo;
            req.session.loginTime = Date.now();
            
            // 跳转到聊天页面
            res.redirect(`/chat.html?userId=${userInfo.UserId}&userName=${encodeURIComponent(userInfo.name)}`);
        } else {
            res.status(401).send('获取用户信息失败');
        }
    } catch (error) {
        console.error('授权回调处理错误:', error);
        res.status(500).send('服务器错误');
    }
});
```

**3. 获取用户信息** (`server/utils/user.js`)
```javascript
async function getUserInfoByCode(code) {
    try {
        // 1. 先获取企业的 access_token
        const accessToken = await tokenUtils.getValidAccessToken();
        
        // 2. 用 code 获取用户票据
        const ticketResponse = await axios.get(
            `${config.apiBase}/user/getuserinfo?access_token=${accessToken}&code=${code}`
        );
        
        if (ticketResponse.data.errcode === 0) {
            // 3. 如果获取到了用户ID，再获取详细信息
            if (ticketResponse.data.UserId) {
                const userDetailResponse = await axios.get(
                    `${config.apiBase}/user/get?access_token=${accessToken}&userid=${ticketResponse.data.UserId}`
                );
                
                if (userDetailResponse.data.errcode === 0) {
                    return {
                        ...ticketResponse.data,
                        ...userDetailResponse.data
                    };
                }
            }
            return ticketResponse.data;
        }
        
        return null;
    } catch (error) {
        console.error('获取用户信息错误:', error);
        return null;
    }
}
```

**4. 鉴权中间件** (`server/middleware/auth.js`)
```javascript
async function requireLogin(req, res, next) {
    // 开发模式跳过
    if (process.env.SKIP_OAUTH === 'true') {
        req.userId = process.env.TEST_USER_ID || 'test_user_001';
        req.userName = process.env.TEST_USER_NAME || '测试用户';
        return next();
    }
    
    // 检查 Session
    if (req.session && req.session.userId) {
        req.userId = req.session.userId;
        req.userName = req.session.userName;
        req.userInfo = req.session.userInfo;
        return next();
    }
    
    // 未登录
    return res.status(401).json({
        error: '未授权访问',
        code: 'UNAUTHORIZED',
        message: '请先登录'
    });
}
```

### 2.3 Session 配置

**Session 存储** (`app.js`)
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',  // 生产环境用 HTTPS
        httpOnly: true,                                  // 防止 XSS
        maxAge: 24 * 60 * 60 * 1000                     // 24 小时
    }
}));
```

---

## 3. 双认证改造方案（简化版）

### 3.1 改造思路

**只需要在登录入口加一个判断：**

```javascript
// 修改 server/routes/auth.js 的 /login 路由

router.get('/login', (req, res) => {
    // 【新增】检测环境
    const env = detectEnvironment(req);
    
    // 【新增】如果在浏览器中，显示扫码页面
    if (!env.isWeCom) {
        return res.redirect('/auth/qrcode');  // 跳转到扫码页面
    }
    
    // 【保持不变】企微环境，走原有 OAuth 流程
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/auth/callback`;
    const authUrl = getAuthUrl(redirectUri);
    res.redirect(authUrl);
});
```

### 3.2 核心改动点

**只需要 3 个文件：**

1. **新增** `server/utils/envDetector.js` - 环境检测工具
2. **修改** `server/routes/auth.js` - 登录路由加判断
3. **新增** 扫码登录相关路由（如果需要浏览器扫码功能）

**企微内的流程完全不变！**

---

## 4. 测试方法

### 4.1 测试企微环境检测

```javascript
// 测试代码
const { detectEnvironment } = require('./server/utils/envDetector');

// 模拟企微请求
const wecomReq = {
    headers: {
        'user-agent': 'Mozilla/5.0 (iPhone) wxwork/4.0.16 MicroMessenger/8.0.5'
    }
};
console.log(detectEnvironment(wecomReq));
// 输出: { isWeCom: true, platform: 'wecom', ... }

// 模拟浏览器请求
const browserReq = {
    headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0 Safari/537.36'
    }
};
console.log(detectEnvironment(browserReq));
// 输出: { isWeCom: false, platform: 'browser', ... }
```

### 4.2 实际测试

1. **企微内测试：**
   - 在企微中打开应用
   - 应该自动跳转到企微 OAuth 授权
   - 授权后正常进入聊天页面

2. **浏览器测试：**
   - 在 Chrome/Safari 中打开应用
   - 应该显示"不在企微环境"或跳转到扫码页面

---

## 5. 配置说明

### 5.1 必需的环境变量

```bash
# 企业微信配置
CORP_ID=你的企业ID
CORP_SECRET=你的应用密钥
AGENT_ID=你的应用ID

# Session 配置
SESSION_SECRET=随机密钥（生产环境必须修改）

# 开发模式（可选）
SKIP_OAUTH=true          # 跳过认证
TEST_USER_ID=test_001    # 测试用户ID
TEST_USER_NAME=测试用户   # 测试用户名
```

### 5.2 企微应用配置

在企业微信管理后台配置：
- **可信域名**：你的应用域名（如 `your-domain.com`）
- **OAuth 回调域**：同上
- **网页授权**：启用

---

## 总结

**核心就 2 点：**

1. **环境检测**：通过 User-Agent 判断是企微还是浏览器
   - 有 `wxwork` 或 `WeCom` → 企微
   - 没有 → 浏览器

2. **现有流程**：企微 OAuth 三步走
   - 重定向到企微授权页
   - 用户授权后回调带 code
   - 用 code 换用户信息，存 Session

**改造只需要在登录入口加个判断，企微内的流程完全不动！**

