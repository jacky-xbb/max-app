# OA 系统对接实施方案

本文档提供基于 `oa-implementation.md` 的完整对接方案，包括实施步骤、代码实现和测试方法。

## 📋 方案概览

### 核心功能
1. **按需获取 OA Token**：仅在检测到工作证明相关请求时获取
2. **自动设置 Bot 变量**：将 OA Token 设置到 Coze Bot 的变量中
3. **非阻断式处理**：Token 获取失败不影响正常聊天流程

### 技术架构
```
用户聊天请求
    ↓
工作证明检测器 (workProofDetector)
    ↓
外部 Token 服务 (externalTokenService)
    ↓
Coze SDK 适配器 (setBotVariables)
    ↓
Bot 使用 Token 变量
```

---

## 🚀 实施步骤

### 第一步：配置环境变量

在 `.env` 文件中添加以下配置：

```bash
# OA 系统 Token 获取接口配置
EXTERNAL_TOKEN_API_URL=https://serviceonline.bshg.com.cn/seeyon/rest/token
EXTERNAL_TOKEN_USERNAME=MAX
EXTERNAL_TOKEN_PASSWORD=89f2fe6a-9ef4-48ca-b45d-fd320b1a56cc
```

**⚠️ 安全提示**：
- 不要将 `.env` 文件提交到代码仓库
- 生产环境使用密钥管理服务（如 AWS Secrets Manager、Azure Key Vault）

---

### 第二步：更新配置文件

修改 `server/config/config.js`，在 `config` 对象中添加外部 Token 配置：

```javascript
const config = {
    // ... 现有配置 ...
    
    // 外部Token服务配置
    externalToken: {
        apiUrl: process.env.EXTERNAL_TOKEN_API_URL || '',
        username: process.env.EXTERNAL_TOKEN_USERNAME || '',
        password: process.env.EXTERNAL_TOKEN_PASSWORD || ''
    }
};
```

---

### 第三步：创建工作证明检测器

创建文件 `server/utils/workProofDetector.js`：

```javascript
/**
 * 工作证明请求检测器
 * 用于识别用户输入是否为工作证明相关请求
 */

const logger = require('./logger');

/**
 * 工作证明相关关键词列表
 */
const WORK_PROOF_KEYWORDS = [
    '工作证明',
    '在职证明',
    '开具证明',
    '证明用途',
    '开具工作证明',
    '申请证明',
    '需要证明',
    'employment certificate',
    'work certificate',
    'proof of employment'
];

/**
 * 检测用户输入是否为工作证明请求
 * @param {string} query - 用户输入的查询文本
 * @returns {boolean} 是否为工作证明请求
 */
function isWorkProofRequest(query) {
    if (!query || typeof query !== 'string') {
        return false;
    }

    // 转换为小写并去除空格，提高匹配准确性
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, '');

    // 检查是否包含任何关键词
    const matched = WORK_PROOF_KEYWORDS.some(keyword => {
        const normalizedKeyword = keyword.toLowerCase().replace(/\s+/g, '');
        return normalizedQuery.includes(normalizedKeyword);
    });

    if (matched) {
        logger.info('[WorkProofDetector] 检测到工作证明请求', {
            query: query.substring(0, 100), // 仅记录前100字符
            matched: true
        });
    }

    return matched;
}

/**
 * 获取所有关键词（用于测试和调试）
 * @returns {string[]} 关键词列表
 */
function getKeywords() {
    return [...WORK_PROOF_KEYWORDS];
}

module.exports = {
    isWorkProofRequest,
    getKeywords
};
```

---

### 第四步：创建外部 Token 服务

创建文件 `server/utils/externalTokenService.js`：

```javascript
/**
 * 外部Token获取服务（简化版 - 无缓存）
 * 用于从 OA 系统获取用户session token
 *
 * 设计理念：
 * - 每次登录时调用一次，获取新token
 * - 不使用缓存（token存储在session中）
 * - 简单、可靠、易维护
 */
const axios = require('axios');
const https = require('https');
const config = require('../config/config');
const logger = require('./logger');

class ExternalTokenService {
    constructor() {
        // 配置HTTPS agent
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: true,
            keepAlive: true
        });

        // 配置axios实例
        this.axiosInstance = axios.create({
            httpsAgent: this.httpsAgent,
            proxy: false,
            timeout: 10000 // 10秒超时
        });

        logger.info('[ExternalTokenService] 服务初始化完成（无缓存模式）', {
            apiUrl: config.externalToken.apiUrl
        });
    }

    /**
     * 获取用户Token
     * @param {string} userId - 用户ID（对应loginName）
     * @returns {Promise<string|null>} sessionId 或 null
     */
    async acquireToken(userId) {
        if (!userId) {
            logger.warn('[ExternalTokenService] userId为空，无法获取token');
            return null;
        }

        try {
            // 构建请求体
            const requestBody = {
                userName: config.externalToken.username,
                password: config.externalToken.password,
                loginName: userId
            };

            logger.info('[ExternalTokenService] 请求外部Token API', {
                url: config.externalToken.apiUrl,
                loginName: userId
            });

            // 调用外部API
            const response = await this.axiosInstance.post(
                config.externalToken.apiUrl,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // 解析响应
            if (response.data && response.data.id) {
                const sessionId = response.data.id;
                const bindingUser = response.data.bindingUser;

                logger.info('[ExternalTokenService] Token获取成功', {
                    userId,
                    sessionId: sessionId,
                    userName: bindingUser?.name || 'N/A',
                    loginState: bindingUser?.loginState || 'N/A'
                });

                return sessionId;
            } else {
                logger.error('[ExternalTokenService] API响应缺少id字段', {
                    userId,
                    responseKeys: Object.keys(response.data || {})
                });
                return null;
            }

        } catch (error) {
            // 详细的错误日志
            if (error.response) {
                logger.error('[ExternalTokenService] API返回错误响应', {
                    userId,
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                });
            } else if (error.request) {
                logger.error('[ExternalTokenService] API请求无响应', {
                    userId,
                    message: error.message
                });
            } else {
                logger.error('[ExternalTokenService] 请求构建失败', {
                    userId,
                    message: error.message
                });
            }
            return null;
        }
    }

    /**
     * 脱敏Token用于日志输出
     * @param {string} token - 原始token
     * @returns {string} 脱敏后的token
     */
    maskToken(token) {
        if (!token || token.length < 8) return '***';
        return token.substring(0, 8) + '***' + token.substring(token.length - 4);
    }
}

// 创建并导出单例
const externalTokenService = new ExternalTokenService();

module.exports = externalTokenService;
```

---

### 第五步：集成到 API 路由

修改 `server/routes/api.js`，在文件顶部添加导入：

```javascript
const externalTokenService = require('../utils/externalTokenService');
const { isWorkProofRequest } = require('../utils/workProofDetector');
const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
```

在 `GET /api/chat` 路由中，在获取 `cozeAccessToken` 之后、调用 `chatService.sendMessage` 之前添加以下代码：

```javascript
// 与Coze API通信 - GET方式用于EventSource SSE连接
router.get('/chat', rateLimit, requireLogin, validateChatRequest, async (req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        // ... 现有代码：获取请求数据、生成 cozeAccessToken ...

        const userId = req.userId; // 从企微鉴权获取的用户ID

        // 为用户生成Coze API访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;
            // ... 现有日志代码 ...
        } catch (tokenError) {
            // ... 现有错误处理 ...
        }

        // ========== 【新增】外部Token处理逻辑（按需获取）==========
        // 检测是否为工作证明请求
        const isWorkProof = isWorkProofRequest(requestData.query);

        if (isWorkProof) {
            logger.info('[API] 检测到工作证明请求，获取外部Token', {
                userId,
                query: requestData.query.substring(0, 50) + '...'
            });

            try {
                // 实时获取外部token（不使用缓存）
                const externalToken = await externalTokenService.acquireToken(userId);

                if (externalToken) {
                    logger.info('[API] 外部Token获取成功，设置到Bot变量', { userId });

                    // 直接设置到Bot变量
                    await cozeSDKAdapter.setBotVariables(
                        cozeSDKAdapter.botConfig.botId,
                        [{ keyword: 'token', value: externalToken }],
                        userId,
                        cozeAccessToken
                    );

                    logger.info('[API] 外部Token已设置到Bot变量', { userId });
                } else {
                    logger.warn('[API] 外部Token获取失败，工作证明功能可能受影响', { userId });
                }
            } catch (tokenError) {
                // Token获取/设置失败不阻断聊天流程
                logger.error('[API] 处理外部Token异常，继续聊天流程', {
                    userId,
                    error: tokenError.message
                });
            }
        } else {
            logger.debug('[API] 非工作证明请求，跳过外部Token获取', {
                userId,
                query: requestData.query.substring(0, 50) + '...'
            });
        }
        // ========== 外部Token处理结束 ==========

        // ... 继续现有代码：处理聊天请求 ...
        await chatService.sendMessage(requestData, userId, callbacks, cozeAccessToken);
    } catch (error) {
        // ... 现有错误处理 ...
    }
});
```

**同样需要在 `POST /api/chat` 路由中添加相同的逻辑。**

---

## 🧪 测试方案

### 1. 单元测试

#### 测试工作证明检测器

创建测试文件 `server/tests/workProofDetector.spec.js`：

```javascript
const { isWorkProofRequest, getKeywords } = require('../utils/workProofDetector');

describe('WorkProofDetector', () => {
    test('应该检测到工作证明请求', () => {
        expect(isWorkProofRequest('我需要开具工作证明')).toBe(true);
        expect(isWorkProofRequest('申请在职证明')).toBe(true);
        expect(isWorkProofRequest('需要 employment certificate')).toBe(true);
    });

    test('不应该检测到非工作证明请求', () => {
        expect(isWorkProofRequest('今天天气怎么样')).toBe(false);
        expect(isWorkProofRequest('帮我查一下资料')).toBe(false);
    });

    test('应该返回所有关键词', () => {
        const keywords = getKeywords();
        expect(keywords.length).toBeGreaterThan(0);
        expect(keywords).toContain('工作证明');
    });
});
```

#### 测试外部 Token 服务

创建测试文件 `server/tests/externalTokenService.spec.js`：

```javascript
const externalTokenService = require('../utils/externalTokenService');

describe('ExternalTokenService', () => {
    test('应该成功获取Token', async () => {
        const token = await externalTokenService.acquireToken('test_user_001');
        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
    });

    test('userId为空时应返回null', async () => {
        const token = await externalTokenService.acquireToken('');
        expect(token).toBeNull();
    });
});
```

### 2. 集成测试

#### 测试完整流程

```bash
# 1. 启动开发服务器
SKIP_OAUTH=true pnpm run dev

# 2. 发送工作证明请求
curl -X GET "http://localhost:8892/api/chat?query=我需要开具工作证明" \
  -H "Authorization: Bearer test_token"

# 3. 检查日志输出
# 应该看到：
# - [WorkProofDetector] 检测到工作证明请求
# - [ExternalTokenService] Token获取成功
# - [CozeSDKAdapter] 变量设置成功
```

### 3. 手动测试步骤

1. **测试工作证明检测**
   - 发送消息："我需要开具工作证明"
   - 检查日志是否检测到关键词

2. **测试 Token 获取**
   - 确认环境变量已配置
   - 发送工作证明相关消息
   - 检查日志中的 Token 获取结果

3. **测试 Bot 变量设置**
   - 发送工作证明相关消息
   - 检查 Coze Bot 是否收到 token 变量
   - 验证 Bot 能否使用该 token 调用 OA 系统

---

## 📊 监控和日志

### 关键日志点

1. **工作证明检测**
   ```javascript
   logger.info('[WorkProofDetector] 检测到工作证明请求', { query, matched: true });
   ```

2. **Token 获取**
   ```javascript
   logger.info('[ExternalTokenService] Token获取成功', { userId, sessionId });
   logger.error('[ExternalTokenService] API返回错误响应', { userId, status, data });
   ```

3. **Bot 变量设置**
   ```javascript
   logger.info('[CozeSDKAdapter] 变量设置成功', { logid });
   logger.warn('[CozeSDKAdapter] 变量设置失败', { code, msg });
   ```

### 监控指标

建议监控以下指标：
- 工作证明请求检测率
- Token 获取成功率
- Bot 变量设置成功率
- Token 获取平均响应时间

---

## 🔧 故障排查

### 常见问题

#### 1. Token 获取失败

**症状**：日志显示 `[ExternalTokenService] API返回错误响应`

**排查步骤**：
1. 检查环境变量是否正确配置
2. 验证 OA 系统 API 地址是否可访问
3. 检查用户名和密码是否正确
4. 确认用户 ID 格式是否符合 OA 系统要求

#### 2. Bot 变量设置失败

**症状**：日志显示 `[CozeSDKAdapter] 变量设置失败`

**排查步骤**：
1. 确认 Coze Bot 已配置 `token` 变量
2. 检查 Coze Access Token 是否有效
3. 验证 Bot ID 是否正确
4. 查看 Coze API 返回的错误信息

#### 3. 工作证明检测不生效

**症状**：发送工作证明相关消息但未触发 Token 获取

**排查步骤**：
1. 检查关键词列表是否包含用户使用的词汇
2. 验证 `isWorkProofRequest` 函数是否被正确调用
3. 查看日志确认检测逻辑是否执行

---

## 🔒 安全注意事项

1. **敏感信息保护**
   - 不要在日志中输出完整的 Token
   - 使用 `maskToken` 方法脱敏
   - 环境变量不要提交到代码仓库

2. **HTTPS 通信**
   - 确保与 OA 系统的通信使用 HTTPS
   - 验证 SSL 证书有效性

3. **错误处理**
   - Token 获取失败不应暴露敏感信息
   - 返回给用户的错误消息应通用化

---

## 📝 实施检查清单

- [ ] 环境变量已配置（`EXTERNAL_TOKEN_API_URL`, `EXTERNAL_TOKEN_USERNAME`, `EXTERNAL_TOKEN_PASSWORD`）
- [ ] `server/config/config.js` 已添加 `externalToken` 配置
- [ ] `server/utils/workProofDetector.js` 已创建
- [ ] `server/utils/externalTokenService.js` 已创建
- [ ] `server/routes/api.js` 已集成 Token 处理逻辑（GET 和 POST 路由）
- [ ] 单元测试已编写
- [ ] 集成测试已通过
- [ ] 日志记录已验证
- [ ] 错误处理已测试
- [ ] 安全措施已实施

---

## 🎯 后续优化建议

1. **缓存机制**（可选）
   - 如果 Token 有效期较长，可以考虑添加短期缓存
   - 避免频繁请求 OA 系统

2. **关键词扩展**
   - 根据实际使用情况扩展关键词列表
   - 支持正则表达式匹配

3. **多场景支持**
   - 不仅限于工作证明，可以支持其他 OA 系统功能
   - 通过配置化的方式管理不同场景

4. **性能优化**
   - 异步处理 Token 获取，不阻塞主流程
   - 使用连接池优化 HTTP 请求

---

## 📚 相关文档

- [OA 系统集成实现文档](./oa-implementation.md)
- [认证流程文档](./authentication-flow.md)
- [Coze SDK 适配器文档](../server/utils/cozeSDKAdapter.js)

---

## ✅ 完成标准

对接完成的标准：
1. ✅ 所有代码文件已创建并集成
2. ✅ 环境变量已正确配置
3. ✅ 单元测试通过率 100%
4. ✅ 集成测试验证完整流程正常
5. ✅ 日志记录完整且可追踪
6. ✅ 错误处理覆盖所有异常情况
7. ✅ 安全措施已实施

---

**最后更新**：2024-01-XX
**维护者**：开发团队

