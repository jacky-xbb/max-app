# Task: 实现延迟登录模式

**Stage**: 1 - 登录页面与登出功能
**Priority**: P0 (必须)
**Estimated Time**: 4-6 hours
**Status**: Not Started

---

## 目标

实现延迟登录模式,允许用户访问聊天界面而无需立即登录,仅在发送消息时要求登录。

## 背景

当前应用强制用户在访问时立即进行企业微信OAuth认证。新需求要求改为"延迟登录"模式:
- 用户可以访问聊天界面
- 用户可以输入消息
- 仅在点击发送时检查登录状态
- 未登录时弹出登录模态框

## 成功标准

- [ ] 未登录用户可以访问 `/chat.html` 页面
- [ ] 未登录用户可以在输入框中输入消息
- [ ] 点击发送按钮时检查登录状态
- [ ] 未登录时弹出登录模态框
- [ ] 已登录用户正常发送消息

## 技术实现

### 1. 后端调整

#### 1.1 移除强制登录中间件
**文件**: `server/middleware/auth.js` (如存在) 或路由文件

**修改**:
- 移除聊天页面 (`/chat.html`) 的强制认证中间件
- 保留 API 端点的认证检查 (`/api/chat`, `/api/conversations` 等)

```javascript
// 示例: server/routes/api.js
// 移除前
app.get('/chat.html', requireAuth, (req, res) => {...});

// 移除后
app.get('/chat.html', (req, res) => {...});

// API 端点保持认证
app.get('/api/chat', requireAuth, (req, res) => {...});
```

#### 1.2 增强会话检查端点
**文件**: `server/routes/auth.js`

**现有端点**: `GET /auth/session`

**修改**:
```javascript
router.get('/auth/session', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({
      authenticated: true,
      userId: req.session.userId,
      userName: req.session.userName || '',
      userInfo: req.session.userInfo || {}
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});
```

### 2. 前端调整

#### 2.1 登录状态检查
**文件**: `public/js/chat.js`

**新增函数**:
```javascript
async function checkLoginStatus() {
  try {
    const response = await fetch('/auth/session');
    const data = await response.json();
    return data.authenticated;
  } catch (error) {
    console.error('检查登录状态失败:', error);
    return false;
  }
}
```

#### 2.2 发送消息前的登录检查
**文件**: `public/js/chat.js`

**修改发送消息函数**:
```javascript
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // 检查登录状态
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) {
    showLoginModal(); // 下一个任务实现
    return;
  }

  // 原有的发送逻辑
  // ...
}
```

#### 2.3 页面加载时的状态初始化
**文件**: `public/js/chat.js`

**新增初始化逻辑**:
```javascript
// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', async () => {
  const isLoggedIn = await checkLoginStatus();
  updateUIForLoginState(isLoggedIn);

  // 其他初始化逻辑...
});

function updateUIForLoginState(isLoggedIn) {
  if (isLoggedIn) {
    // 显示用户信息/头像
    // 显示侧边栏 (Stage 2 实现)
  } else {
    // 显示"登录"按钮
    // 隐藏侧边栏或显示空状态
  }
}
```

### 3. 错误处理

#### 3.1 API 401 响应处理
**文件**: `public/js/chat.js` 或 `public/js/cozeClient.js`

**全局错误处理**:
```javascript
// 在所有 API 调用中添加错误处理
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      // 未登录
      showLoginModal();
      throw new Error('需要登录');
    }

    return response;
  } catch (error) {
    console.error('API请求失败:', error);
    throw error;
  }
}
```

## 测试清单

### 功能测试
- [ ] 未登录访问 `/chat.html` 不会跳转
- [ ] 未登录可以在输入框输入文本
- [ ] 未登录点击发送按钮触发登录检查
- [ ] 已登录用户可以正常发送消息
- [ ] 刷新页面后登录状态保持

### 边界测试
- [ ] Session 过期时的处理
- [ ] 网络错误时的处理
- [ ] 并发请求时的状态一致性

### 兼容性测试
- [ ] Chrome 浏览器
- [ ] Safari 浏览器
- [ ] 移动端浏览器

## 依赖

**前置任务**: 无

**后续任务**:
- `stage1-task2-login-modal.md` - 实现登录模态框
- `stage1-task3-logout-feature.md` - 实现登出功能

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 2.2.1 登录流程
- [CLAUDE.md](../CLAUDE.md) - Authentication Flow
- Express Session 文档: https://github.com/expressjs/session

## 注意事项

1. **不要修改企业微信 OAuth 回调逻辑** - `/auth/callback` 保持原样
2. **保留所有 API 端点的认证检查** - 仅移除页面访问的强制登录
3. **Session 配置保持不变** - 使用现有的 Express session 配置
4. **渐进增强** - 确保已登录用户的体验不受影响

## 验收标准

1. 代码通过 ESLint 检查 (`npm run lint`)
2. 所有测试清单项通过
3. 提交前运行 `npm run format`
4. 提交信息格式: `feat(auth): implement delayed login mode`
