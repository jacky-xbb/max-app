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

            logger.info('=======> [ExternalTokenService] 请求外部Token API', {
                url: config.externalToken.apiUrl,
                requestBody: JSON.stringify(requestBody)
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

