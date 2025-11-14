# OA 系统集成实现文档

本文档包含所有与 OA 系统相关的代码实现，包括认证流程、外部 Token 服务、工作证明检测和接口调用。

## 目录

1. [环境变量配置](#环境变量配置)
2. [配置文件](#配置文件)
3. [认证中间件](#认证中间件)
4. [认证路由](#认证路由)
5. [外部 Token 服务](#外部-token-服务)
6. [工作证明检测器](#工作证明检测器)
7. [Coze SDK 适配器 - Bot 变量设置](#coze-sdk-适配器---bot-变量设置)
8. [API 路由集成](#api-路由集成)
9. [完整流程说明](#完整流程说明)

---

## 环境变量配置

### 必需的环境变量

```bash
# OA 系统 Token 获取接口配置
EXTERNAL_TOKEN_API_URL=https://serviceonline.bshg.com.cn/seeyon/rest/token
EXTERNAL_TOKEN_USERNAME=MAX
EXTERNAL_TOKEN_PASSWORD=89f2fe6a-9ef4-48ca-b45d-fd320b1a56cc

# 企业微信配置（用于用户认证）
CORP_ID=your_corp_id
CORP_SECRET=your_corp_secret
AGENT_ID=your_agent_id

# 开发环境跳过认证（可选）
SKIP_OAUTH=true  # 开发环境可设置为 true
TEST_USER_ID=test_user_001
TEST_USER_NAME=测试用户
```

---

## 配置文件

### `server/config/config.js`

```javascript
/**
 * 企业微信应用配置文件
 * 在实际使用中，建议使用.env文件和dotenv库来管理敏感配置
 */

// 加载环境配置文件
// 如果设置了 NODE_ENV，加载对应的 .env.{NODE_ENV} 文件
// 否则加载默认的 .env 文件
try {
    const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env';
    require('dotenv').config({
        path: envFile
    });
    console.log(`已加载配置文件: ${envFile}`);
} catch (e) {
    console.log('未找到dotenv，使用默认配置');
}

/**
 * 验证Coze配置参数的完整性
 * @returns {Object} 验证结果 {isValid: boolean, errors: string[]}
 */
function validateConfig() {
    const errors = [];

    // 验证Coze必要配置
    if (!process.env.COZE_API_KEY) {
        errors.push('COZE_API_KEY is required');
    }
    if (!process.env.COZE_BOT_ID) {
        errors.push('COZE_BOT_ID is required');
    }

    // 语音识别配置验证（可选）
    if (process.env.VOLCANO_SPEECH_API_KEY && !process.env.VOLCANO_SPEECH_APP_ID) {
        console.warn('VOLCANO_SPEECH_APP_ID is recommended when using Volcano Speech API');
    }

    // 验证企业微信必要配置
    if (!process.env.CORP_ID) {
        errors.push('CORP_ID is required');
    }
    if (!process.env.CORP_SECRET) {
        errors.push('CORP_SECRET is required');
    }
    if (!process.env.AGENT_ID) {
        errors.push('AGENT_ID is required');
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

const config = {
    // 企业信息
    corpId: process.env.CORP_ID, // 企业ID - 必须通过环境变量设置
    corpSecret: process.env.CORP_SECRET, // 应用的凭证密钥 - 必须通过环境变量设置
    agentId: process.env.AGENT_ID, // 应用ID - 必须通过环境变量设置

    // 安全配置
    token: process.env.TOKEN, // 用于验证URL的Token - 必须通过环境变量设置
    encodingAESKey: process.env.ENCODING_AES_KEY, // 用于消息加解密的Key - 必须通过环境变量设置

    // Coze API v3配置
    coze: {
        apiKey: process.env.COZE_API_KEY || '',
        apiEndpoint: 'https://api.coze.cn/v3/chat',
        botId: process.env.COZE_BOT_ID || '',
        stream: true,
        // Coze语音转文字配置
        speech: {
            apiKey: process.env.COZE_API_KEY || '',
            apiEndpoint: 'https://api.coze.cn/v1/audio/transcriptions',
            supportedFormats: ['ogg', 'mp3', 'wav'], // Coze 只支持这三种格式
            maxFileSize: 512 * 1024 * 1024, // 512MB (Coze 限制)
            defaultLanguage: 'zh-CN',
            defaultSampleRate: 16000
        }
    },

    // 应用配置
    app: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },

    // 日志配置
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableStructuredLogging: process.env.ENABLE_STRUCTURED_LOGGING !== 'false',
        enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false'
    },

    // 重试配置
    retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
        baseDelay: parseInt(process.env.RETRY_BASE_DELAY) || 1000,
        maxDelay: parseInt(process.env.RETRY_MAX_DELAY) || 10000,
        enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER !== 'false'
    },

    // 路径配置
    callbackPath: '/callback', // 回调路径
    oauthPath: '/oauth_callback', // OAuth回调路径
    loginPath: '/login', // 登录入口路径

    // 其他配置
    tokenFile: 'access_token.json', // access_token保存的文件名
    port: process.env.PORT || 8889, // 服务器端口

    // API地址
    apiBase: 'https://qyapi.weixin.qq.com/cgi-bin',

    // 外部Token服务配置
    externalToken: {
        apiUrl: process.env.EXTERNAL_TOKEN_API_URL || '',
        username: process.env.EXTERNAL_TOKEN_USERNAME || '',
        password: process.env.EXTERNAL_TOKEN_PASSWORD || ''
    }
};

// 验证Coze配置
const validation = validateConfig();

if (!validation.isValid) {
    console.error('Coze配置验证失败:');
    validation.errors.forEach(error => console.error(`  - ${error}`));

    if (process.env.NODE_ENV === 'production') {
        console.error('生产环境下配置验证失败，程序退出');
        process.exit(1);
    } else {
        console.warn('开发环境下配置验证失败，程序继续运行');
    }
}

module.exports = {
    ...config,
    validateConfig
};
```

---

## 认证中间件

### `server/middleware/auth.js`

```javascript
/**
 * 认证中间件
 * 处理用户登录状态验证
 */

const logger = require('../utils/logger');

/**
 * 要求用户登录的中间件
 * 验证用户是否已通过WeChat OAuth认证（优先检查session，兼容token模式）
 */
async function requireLogin(req, res, next) {
    logger.info('检查用户登录状态...');

    // 跳过认证模式（开发环境）
    if (process.env.SKIP_OAUTH === 'true') {
        logger.debug('跳过认证模式，自动设置测试用户');
        req.userId = process.env.TEST_USER_ID || 'test_user_001';
        req.userName = process.env.TEST_USER_NAME || '测试用户';
        return next();
    }

    // 检查session
    if (req.session && req.session.userId) {
        logger.debug('从session获取用户信息');
        req.userId = req.session.userId;
        req.userName = req.session.userName || req.session.userId;
        req.userInfo = req.session.userInfo;

        logger.info('用户session验证成功', {
            type: 'user_session_verified',
            userId: req.userId,
            userName: req.userName,
            loginTime: req.session.loginTime
        });

        return next();
    }

    // 没有session，返回未授权错误
    logger.warn('未找到用户认证信息', {
        type: 'missing_user_auth',
        path: req.path,
        method: req.method
    });

    return res.status(401).json({
        error: '未授权访问',
        code: 'UNAUTHORIZED',
        message: '请先登录'
    });
}

/**
 * 可选登录中间件
 * 如果有token则验证，没有则继续（用于公开接口）
 */
async function optionalLogin(req, res, next) {
    // 跳过认证模式
    if (process.env.SKIP_OAUTH === 'true') {
        req.userId = process.env.TEST_USER_ID || 'test_user_001';
        req.userName = process.env.TEST_USER_NAME || '测试用户';
        return next();
    }

    // 如果有session，设置用户信息
    if (req.session && req.session.userId) {
        req.userId = req.session.userId;
        req.userName = req.session.userName || req.session.userId;
        req.userInfo = req.session.userInfo;
    }

    next();
}

module.exports = {
    requireLogin,
    optionalLogin
};
```

---

## 认证路由

### `server/routes/auth.js`

```javascript
// routes/auth.js
const express = require('express');
const router = express.Router();
const config = require('../config/config');
const userUtils = require('../utils/user');
const tokenUtils = require('../utils/token');

// 获取网页授权链接
function getAuthUrl(redirectUri) {
    const encodedRedirectUri = encodeURIComponent(redirectUri);
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${config.corpId}&redirect_uri=${encodedRedirectUri}&response_type=code&scope=snsapi_base&state=STATE#wechat_redirect`;
}

/**
 * 获取企业微信授权URL
 * GET /auth/url
 */
router.get('/url', (req, res) => {
    const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/auth/callback`);
    const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${config.corpId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=STATE#wechat_redirect`;

    res.json({ url: authUrl });
});

// 登录路由 - 直接重定向到企业微信授权页面
router.get('/login', (req, res) => {
    // 构建回调URL (确保是完整的URL，包含协议和域名)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/auth/callback`;

    // 获取授权URL并重定向
    const authUrl = getAuthUrl(redirectUri);
    res.redirect(authUrl);
});

/**
 * 获取用户信息API端点
 */


// 网页授权回调处理 - 建立用户会话后跳转到聊天页面
router.get('/callback', async (req, res) => {
    const {code} = req.query;

    if (!code) {
        return res.status(400).send('缺少授权码');
    }

    try {
        // 获取用户信息
        const userInfo = await userUtils.getUserInfoByCode(code);

        if (userInfo && userInfo.UserId) {
            // 在session中保存用户信息，用于JWT生成
            req.session.userId = userInfo.UserId;
            req.session.userName = userInfo.name || userInfo.UserId;
            req.session.userInfo = userInfo;
            req.session.loginTime = Date.now();

            // 重定向到聊天页面，并传递用户信息
            res.redirect(`/chat.html?userId=${userInfo.UserId}&userName=${encodeURIComponent(userInfo.name || userInfo.UserId)}`);
        } else {
            res.status(401).send('获取用户信息失败');
        }
    } catch (error) {
        console.error('授权回调处理错误:', error);
        res.status(500).send('服务器错误');
    }
});

/**
 * 用户登出
 * GET /auth/logout
 */
router.get('/logout', (req, res) => {
    if (req.session) {
        // 销毁session
        req.session.destroy((err) => {
            if (err) {
                console.error('会话销毁失败:', err);
                return res.status(500).json({
                    error: '登出失败',
                    message: '服务器错误'
                });
            }

            // 清除cookie
            res.clearCookie('connect.sid');

            // 返回成功响应或重定向到登录页
            if (req.query.redirect === 'json') {
                res.json({
                    success: true,
                    message: '登出成功'
                });
            } else {
                res.redirect('/auth/login');
            }
        });
    } else {
        // 没有session，直接重定向
        if (req.query.redirect === 'json') {
            res.json({
                success: true,
                message: '已登出'
            });
        } else {
            res.redirect('/auth/login');
        }
    }
});

/**
 * 获取当前用户会话信息
 * GET /auth/session
 */
router.get('/session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            userId: req.session.userId,
            userName: req.session.userName,
            loginTime: req.session.loginTime
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});

module.exports = router;
```

---

## 外部 Token 服务

### `server/utils/externalTokenService.js`

```javascript
/**
 * 外部Token获取服务（简化版 - 无缓存）
 * 用于从 serviceonline-test.bshg.com.cn 获取用户session token
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

### API 请求格式

**请求 URL**: `EXTERNAL_TOKEN_API_URL` (例如: `https://serviceonline.bshg.com.cn/seeyon/rest/token`)

**请求方法**: `POST`

**请求头**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "userName": "MAX",
  "password": "89f2fe6a-9ef4-48ca-b45d-fd320b1a56cc",
  "loginName": "用户ID"
}
```

**响应格式**:
```json
{
  "id": "session_token_string",
  "bindingUser": {
    "name": "用户名称",
    "loginState": "登录状态"
  }
}
```

---

## 工作证明检测器

### `server/utils/workProofDetector.js`

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

## Coze SDK 适配器 - Bot 变量设置

### `server/utils/cozeSDKAdapter.js` (相关方法)

```javascript
/**
 * 设置机器人变量
 * @param {string} botId - 机器人ID
 * @param {Array} variables - 变量数组，格式：[{keyword: 'var_name', value: 'var_value'}]
 * @param {string} userId - 用户ID
 * @param {string} token - 用户访问令牌
 * @returns {Promise<boolean>}
 */
async setBotVariables(botId, variables, userId = 'default', token = null) {
    try {
        const axios = require('axios');
        const https = require('https');
        
        // 创建 HTTPS Agent 确保使用 HTTPS
        const httpsAgent = new https.Agent({
            rejectUnauthorized: true,
            keepAlive: true
        });
        
        // 构建符合 Coze API 规范的请求体
        const requestData = {
            bot_id: botId,
            connector_id: "1024",  // API 渠道
            connector_uid: userId,  // 用户 ID
            data: variables
        };
        
        logger.info('[CozeSDKAdapter] 使用原生 API 设置变量', {
            botId: botId,
            userId: userId,
            variables: variables
        });
        
        // 创建专用的 axios 实例，避免代理问题
        const axiosInstance = axios.create({
            httpsAgent: httpsAgent,
            proxy: false,  // 禁用代理
            timeout: this.config.timeout
        });
        
        // 确保必须提供token
        if (!token) {
            throw new Error('Access token is required for setBotVariables');
        }

        // 直接调用 Coze API
        const response = await axiosInstance.put(
            `${this.config.baseURL}/v1/variables`,
            requestData,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 检查响应
        if (response.data.code === 0) {
            logger.info('[CozeSDKAdapter] 变量设置成功', {
                logid: response.data.detail?.logid
            });
            return true;
        } else {
            logger.warn('[CozeSDKAdapter] 变量设置失败', {
                code: response.data.code,
                msg: response.data.msg,
                logid: response.data.detail?.logid
            });
            return false;
        }
        
    } catch (error) {
        // 详细的错误处理
        if (error.response) {
            // API 返回了错误响应
            if (error.response.status === 400) {
                logger.debug('[CozeSDKAdapter] Bot可能未配置此变量', {
                    status: error.response.status,
                    data: error.response.data
                });
            } else {
                logger.error('[CozeSDKAdapter] 设置变量API错误', {
                    status: error.response.status,
                    data: error.response.data
                });
            }
        } else if (error.request) {
            logger.error('[CozeSDKAdapter] 设置变量请求无响应', {
                message: error.message
            });
        } else {
            logger.error('[CozeSDKAdapter] 设置变量请求构建失败', {
                message: error.message
            });
        }
        return false;
    }
}
```

### Coze API 请求格式

**请求 URL**: `https://api.coze.cn/v1/variables`

**请求方法**: `PUT`

**请求头**:
```
Authorization: Bearer {coze_access_token}
Content-Type: application/json
```

**请求体**:
```json
{
  "bot_id": "bot_id",
  "connector_id": "1024",
  "connector_uid": "user_id",
  "data": [
    {
      "keyword": "token",
      "value": "oa_session_token"
    }
  ]
}
```

**响应格式**:
```json
{
  "code": 0,
  "msg": "success",
  "detail": {
    "logid": "log_id"
  }
}
```

---

## API 路由集成

### `server/routes/api.js` (相关部分)

```javascript
// routes/api.js
const express = require('express');
const router = express.Router();
const userUtils = require('../utils/user');
const multer = require('multer');
const ChatService = require('../services/chatService');
const logger = require('../utils/logger');
const { retryHandler } = require('../utils/retryHandler');
const { streamOptimizer } = require('../utils/streamOptimizer');
const { rateLimiter } = require('../utils/rateLimiter');
const { cozeConversationManager } = require('../utils/cozeConversationManager');
const { requireLogin } = require('../middleware/auth');
const { jwtService } = require('../utils/jwtService');
const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
const externalTokenService = require('../utils/externalTokenService');
const { isWorkProofRequest } = require('../utils/workProofDetector');
const {
    validateChatRequest,
    validateChatPostRequest,
    validateConversationId,
    validateCreateConversation,
    validateAudioToText,
    validateUpdateToken,
    validatePagination
} = require('../middleware/validation');

// ... 其他代码 ...

// 与Coze API通信 - GET方式用于EventSource SSE连接
router.get('/chat', rateLimit, requireLogin, validateChatRequest, async (req, res) => {
    const requestId = logger.generateRequestId();
    const userId = req.userId;
    
    // ... 获取 Coze Access Token 的代码 ...

    // ========== 外部Token处理逻辑（按需获取）==========
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

    // ... 继续处理聊天请求 ...
});
```

---

## 完整流程说明

### 1. 用户认证流程

```
用户访问应用
    ↓
GET /auth/login
    ↓
重定向到企业微信授权页面
    ↓
用户授权后回调
    ↓
GET /auth/callback?code=xxx
    ↓
调用企业微信API获取用户信息
    ↓
保存用户信息到 session
    ↓
重定向到聊天页面
```

### 2. 工作证明请求处理流程

```
用户发送聊天消息
    ↓
GET /api/chat?query=工作证明...
    ↓
requireLogin 中间件验证 session
    ↓
工作证明检测器检查 query
    ↓
检测到工作证明关键词
    ↓
调用 externalTokenService.acquireToken(userId)
    ↓
向 OA 系统发送 POST 请求获取 session token
    ↓
获取到 token 后，调用 cozeSDKAdapter.setBotVariables()
    ↓
将 token 设置为 Bot 变量 (keyword: 'token')
    ↓
继续处理聊天请求，Bot 可以使用 token 变量
```

### 3. 关键组件交互

```
┌─────────────────┐
│   用户请求      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  requireLogin   │ 验证 session
│   中间件        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ workProofDetector│ 检测关键词
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│externalTokenService│ 获取 OA token
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ cozeSDKAdapter  │ 设置 Bot 变量
│ setBotVariables │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Chat Service  │ 处理聊天请求
└─────────────────┘
```

### 4. 数据流

**Session 数据结构**:
```javascript
req.session = {
    userId: "user_id_from_wechat",
    userName: "用户名称",
    userInfo: {
        UserId: "user_id",
        name: "用户名称",
        // ... 其他用户信息
    },
    loginTime: 1234567890
}
```

**OA Token 请求数据**:
```javascript
{
    userName: "MAX",
    password: "89f2fe6a-9ef4-48ca-b45d-fd320b1a56cc",
    loginName: "user_id_from_wechat"
}
```

**Bot 变量数据**:
```javascript
[
    {
        keyword: "token",
        value: "oa_session_token_from_response"
    }
]
```

---

## 错误处理

### 1. 认证失败
- 用户未登录：返回 401 状态码
- Session 过期：需要重新登录

### 2. Token 获取失败
- API 请求失败：记录错误日志，但不阻断聊天流程
- 响应格式错误：记录错误日志，返回 null

### 3. Bot 变量设置失败
- API 调用失败：记录错误日志，但不阻断聊天流程
- Bot 未配置变量：记录警告日志

---

## 注意事项

1. **安全性**
   - 环境变量中的密码不应提交到代码仓库
   - 使用 `.env` 文件管理敏感配置
   - 生产环境应使用安全的密钥管理服务

2. **性能**
   - Token 获取是实时进行的，不使用缓存
   - 仅在检测到工作证明请求时才获取 Token
   - 超时设置为 10 秒

3. **可维护性**
   - 工作证明关键词列表可扩展
   - 错误处理不阻断主流程
   - 详细的日志记录便于调试

4. **扩展性**
   - 可以添加更多检测关键词
   - 可以支持其他类型的请求检测
   - Bot 变量可以设置多个值

---

## 相关文件清单

- `server/config/config.js` - 配置文件
- `server/middleware/auth.js` - 认证中间件
- `server/routes/auth.js` - 认证路由
- `server/routes/api.js` - API 路由（包含 Token 处理逻辑）
- `server/utils/externalTokenService.js` - 外部 Token 服务
- `server/utils/workProofDetector.js` - 工作证明检测器
- `server/utils/cozeSDKAdapter.js` - Coze SDK 适配器（包含 setBotVariables 方法）

---

## 更新日志

- 初始版本：实现基本的 OA Token 获取和 Bot 变量设置功能
- 支持按需获取 Token（仅在检测到工作证明请求时获取）
- 完善的错误处理和日志记录

