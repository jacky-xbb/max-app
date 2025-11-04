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
    apiBase: 'https://qyapi.weixin.qq.com/cgi-bin'
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
