/**
 * Coze SDK 配置管理
 * 基于官方 @coze/api SDK 的配置封装
 */

// 加载环境配置文件
// 如果设置了 NODE_ENV，加载对应的 .env.{NODE_ENV} 文件
// 否则加载默认的 .env 文件
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env';
require('dotenv').config({
    path: envFile
});

class CozeSDKConfig {
    constructor() {
        this.validateEnvironment();
        this.config = this.buildConfig();
    }

    /**
     * 验证环境变量
     */
    validateEnvironment() {
        // 基础必需变量
        const requiredVars = ['COZE_BOT_ID'];

        // 根据认证方法添加不同的必需变量
        const authMethod = process.env.COZE_AUTH_METHOD || 'jwt';

        if (authMethod === 'pat') {
            requiredVars.push('COZE_API_KEY');
        } else if (authMethod === 'jwt') {
            requiredVars.push('COZE_OAUTH_CLIENT_ID', 'COZE_OAUTH_KID', 'COZE_OAUTH_PRIVATE_KEY_PATH');
        }

        const missingVars = requiredVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
    }

    /**
     * 构建SDK配置
     */
    buildConfig() {
        return {
            // 基础配置
            apiKey: process.env.COZE_API_KEY,
            botId: process.env.COZE_BOT_ID,
            workspaceId: process.env.COZE_WORKSPACE_ID,
            
            // API配置
            baseURL: process.env.COZE_API_BASE_URL || 'https://api.coze.cn',
            version: process.env.COZE_API_VERSION || 'v1',
            timeout: parseInt(process.env.COZE_TIMEOUT) || 30000,
            
            // 认证方式
            authMethod: process.env.COZE_AUTH_METHOD || 'jwt',
            
            // OAuth配置
            oauth: {
                clientId: process.env.COZE_CLIENT_ID,
                clientSecret: process.env.COZE_CLIENT_SECRET,
                redirectUri: process.env.COZE_REDIRECT_URI
            },
            
            // JWT OAuth配置
            jwt: {
                clientId: process.env.COZE_OAUTH_CLIENT_ID,
                audience: process.env.COZE_OAUTH_AUDIENCE || 'api.coze.cn',
                privateKeyPath: process.env.COZE_OAUTH_PRIVATE_KEY_PATH || './server/private_key.pem',
                keyId: process.env.COZE_OAUTH_KID,
                tokenUrl: process.env.COZE_OAUTH_TOKEN_URL || 'https://api.coze.cn/api/permission/oauth2/token',
                grantType: process.env.COZE_OAUTH_GRANT_TYPE || 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                tokenTtlMinutes: parseInt(process.env.TOKEN_TTL_MINUTES) || 45,
                tokenRequestSeconds: parseInt(process.env.TOKEN_REQUEST_SECONDS) || 3600
            },
            
            // 性能配置
            performance: {
                maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
                retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
                requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000
            },
            
            // 日志配置
            logging: {
                logLevel: process.env.LOG_LEVEL || 'info'
            },
            
            // 健康监控配置
            health: {
                checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
                cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 300000
            }
        };
    }

    /**
     * 获取SDK初始化配置
     */
    getSDKConfig() {
        return {
            token: this.config.apiKey,
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            // 添加其他SDK特定配置
        };
    }

    /**
     * 获取认证配置
     */
    getAuthConfig() {
        switch (this.config.authMethod) {
            case 'pat':
                return {
                    type: 'pat',
                    token: this.config.apiKey
                };
            case 'oauth':
                return {
                    type: 'oauth',
                    clientId: this.config.oauth.clientId,
                    clientSecret: this.config.oauth.clientSecret,
                    redirectUri: this.config.oauth.redirectUri
                };
            case 'jwt':
                return {
                    type: 'jwt',
                    clientId: this.config.jwt.clientId,
                    audience: this.config.jwt.audience,
                    privateKeyPath: this.config.jwt.privateKeyPath,
                    keyId: this.config.jwt.keyId,
                    tokenUrl: this.config.jwt.tokenUrl,
                    grantType: this.config.jwt.grantType,
                    tokenTtlMinutes: this.config.jwt.tokenTtlMinutes,
                    tokenRequestSeconds: this.config.jwt.tokenRequestSeconds
                };
            default:
                throw new Error(`Unsupported auth method: ${this.config.authMethod}`);
        }
    }

    /**
     * 获取机器人配置
     */
    getBotConfig() {
        return {
            botId: this.config.botId,
            workspaceId: this.config.workspaceId
        };
    }

    /**
     * 获取性能配置
     */
    getPerformanceConfig() {
        return this.config.performance;
    }

    /**
     * 获取诊断配置
     * 返回日志配置作为诊断配置
     */
    getDiagnosticConfig() {
        return {
            logLevel: this.config.logging.logLevel,
            healthCheck: this.config.health
        };
    }

    /**
     * 获取健康监控配置
     */
    getHealthConfig() {
        return this.config.health;
    }

    /**
     * 获取完整配置
     */
    getFullConfig() {
        return { ...this.config };
    }

    /**
     * 更新配置
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }

    /**
     * 验证配置完整性
     */
    validateConfig() {
        const errors = [];

        // 验证基础配置
        if (!this.config.apiKey) {
            errors.push('API Key is required');
        }

        if (!this.config.botId) {
            errors.push('Bot ID is required');
        }

        // 验证认证配置
        if (this.config.authMethod === 'oauth') {
            if (!this.config.oauth.clientId || !this.config.oauth.clientSecret) {
                errors.push('OAuth client ID and secret are required');
            }
        }

        if (this.config.authMethod === 'jwt') {
            if (!this.config.jwt.clientId) {
                errors.push('JWT OAuth client ID is required');
            }
            if (!this.config.jwt.keyId) {
                errors.push('JWT OAuth key ID (kid) is required');
            }
            if (!this.config.jwt.privateKeyPath) {
                errors.push('JWT OAuth private key path is required');
            }
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }

        return true;
    }

    /**
     * 打印配置摘要（隐藏敏感信息）
     */
    printConfigSummary() {
        const summary = {
            botId: this.config.botId,
            baseURL: this.config.baseURL,
            authMethod: this.config.authMethod,
            timeout: this.config.timeout,
            diagnosticEnabled: this.config.diagnostic.enabled,
            debugMode: this.config.diagnostic.debugMode
        };

        console.log('Coze SDK Configuration Summary:', JSON.stringify(summary, null, 2));
        return summary;
    }
}

// 创建全局配置实例
const cozeSDKConfig = new CozeSDKConfig();

module.exports = cozeSDKConfig;