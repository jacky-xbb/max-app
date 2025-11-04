/**
 * JWT认证服务
 * 用于生成和验证Coze API的JWT认证令牌
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class JwtService {
    constructor() {
        this.privateKey = null;
        this.loadPrivateKey();
    }

    /**
     * 加载私钥文件
     * @private
     */
    loadPrivateKey() {
        try {
            const privateKeyPath = process.env.COZE_OAUTH_PRIVATE_KEY_PATH || './server/private_key.pem';
            const absolutePath = path.resolve(privateKeyPath);

            if (!fs.existsSync(absolutePath)) {
                throw new Error(`私钥文件不存在: ${absolutePath}`);
            }

            this.privateKey = fs.readFileSync(absolutePath, 'utf8');
            logger.info('JWT私钥加载成功', {
                type: 'jwt_private_key_loaded',
                keyPath: absolutePath
            });
        } catch (error) {
            logger.error('JWT私钥加载失败', {
                type: 'jwt_private_key_load_error',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * 构建OAuth JWT令牌
     * @param {string} userId - 用户ID
     * @returns {string} 签名的JWT令牌
     */
    buildOAuthJWT(userId) {
        if (!this.privateKey) {
            throw new Error('私钥未加载');
        }

        if (!userId) {
            throw new Error('用户ID不能为空');
        }

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + (parseInt(process.env.TOKEN_REQUEST_SECONDS) || 3600); // 默认1小时

        const payload = {
            iss: process.env.COZE_OAUTH_CLIENT_ID, // 签发者 (OAuth应用ID)
            aud: process.env.COZE_OAUTH_AUDIENCE || 'api.coze.cn', // 受众
            iat: now, // 签发时间
            exp: expiration, // 过期时间
            jti: uuidv4(), // JWT ID，确保唯一性
            session_name: userId // 会话标识，用于区分不同用户的对话历史
        };

        const options = {
            algorithm: 'RS256',
            header: {
                kid: process.env.COZE_OAUTH_KID // Key ID
            }
        };

        try {
            const token = jwt.sign(payload, this.privateKey, options);

            logger.info('JWT令牌生成成功', {
                type: 'jwt_generated',
                userId: userId,
                sessionName: userId, // 添加session_name日志
                iat: now,
                exp: expiration,
                jti: payload.jti
            });

            return token;
        } catch (error) {
            logger.error('JWT令牌生成失败', {
                type: 'jwt_generation_error',
                userId: userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * 使用JWT交换Coze访问令牌
     * @param {string} assertion - JWT断言令牌
     * @returns {Promise<Object>} 包含access_token和expires_in的对象
     */
    async exchangeForAccessToken(assertion) {
        const tokenUrl = process.env.COZE_OAUTH_TOKEN_URL || 'https://api.coze.cn/api/permission/oauth2/token';
        const grantType = process.env.COZE_OAUTH_GRANT_TYPE || 'urn:ietf:params:oauth:grant-type:jwt-bearer';
        const durationSeconds = parseInt(process.env.TOKEN_EXPIRATION_SECONDS) || 86400; // 默认24小时

        // 根据官方文档，JWT应该在Authorization header中，而不是在请求体中
        const requestBody = {
            grant_type: grantType,
            duration_seconds: durationSeconds
        };

        try {
            // 使用node原生https模块发送请求
            const url = new URL(tokenUrl);
            const postData = JSON.stringify(requestBody);

            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'Authorization': `Bearer ${assertion}`,
                    'Accept': 'application/json'
                }
            };

            const response = await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        if (res.statusCode === 200 || res.statusCode === 201) {
                            try {
                                const jsonData = JSON.parse(data);
                                resolve({ data: jsonData, status: res.statusCode });
                            } catch (e) {
                                reject(new Error('Invalid JSON response: ' + data));
                            }
                        } else {
                            reject({
                                response: {
                                    status: res.statusCode,
                                    statusText: res.statusMessage,
                                    data: data,
                                    headers: res.headers
                                },
                                message: `Request failed with status code ${res.statusCode}`
                            });
                        }
                    });
                });

                req.on('error', (e) => {
                    reject(e);
                });

                req.write(postData);
                req.end();
            });

            if (response.data && response.data.access_token) {
                logger.info('JWT交换访问令牌成功', {
                    type: 'jwt_exchange_success',
                    access_token: response.data.access_token,  // 打印完整的access token
                    tokenType: response.data.token_type,
                    expiresIn: response.data.expires_in
                });

                return {
                    access_token: response.data.access_token,
                    token_type: response.data.token_type || 'Bearer',
                    expires_in: response.data.expires_in || 86400, // 默认24小时
                    scope: response.data.scope
                };
            } else {
                throw new Error('响应中缺少access_token');
            }
        } catch (error) {
            logger.error('JWT交换访问令牌失败', {
                type: 'jwt_exchange_error',
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers
            });
            throw error;
        }
    }

    /**
     * 验证JWT令牌有效性
     * @param {string} token - 要验证的JWT令牌
     * @returns {Object|null} 解码的payload或null（如果无效）
     */
    verifyJWT(token) {
        if (!this.privateKey) {
            throw new Error('私钥未加载');
        }

        try {
            // 提取公钥用于验证（从私钥中）
            const decoded = jwt.verify(token, this.privateKey, {
                algorithms: ['RS256'],
                audience: process.env.COZE_OAUTH_AUDIENCE || 'api.coze.cn',
                issuer: process.env.COZE_OAUTH_CLIENT_ID
            });

            logger.debug('JWT令牌验证成功', {
                type: 'jwt_verification_success',
                userId: decoded.session_name || decoded.sub, // 兼容session_name和旧的sub字段
                jti: decoded.jti
            });

            return decoded;
        } catch (error) {
            logger.warn('JWT令牌验证失败', {
                type: 'jwt_verification_failed',
                error: error.message
            });
            return null;
        }
    }

    /**
     * 解码JWT令牌（不验证签名）
     * @param {string} token - 要解码的JWT令牌
     * @returns {Object|null} 解码的payload或null
     */
    decodeJWT(token) {
        try {
            const decoded = jwt.decode(token, { complete: true });

            if (!decoded) {
                return null;
            }

            return {
                header: decoded.header,
                payload: decoded.payload,
                signature: decoded.signature
            };
        } catch (error) {
            logger.warn('JWT令牌解码失败', {
                type: 'jwt_decode_error',
                error: error.message
            });
            return null;
        }
    }

    /**
     * 检查JWT令牌是否即将过期
     * @param {string} token - JWT令牌
     * @param {number} bufferMinutes - 缓冲时间（分钟），默认5分钟
     * @returns {boolean} 是否即将过期
     */
    isTokenExpiringSoon(token, bufferMinutes = 5) {
        const decoded = this.decodeJWT(token);
        if (!decoded || !decoded.payload.exp) {
            return true; // 无法解码或没有过期时间，认为需要刷新
        }

        const now = Math.floor(Date.now() / 1000);
        const bufferSeconds = bufferMinutes * 60;
        const expirationWithBuffer = decoded.payload.exp - bufferSeconds;

        return now >= expirationWithBuffer;
    }

    /**
     * 获取JWT令牌的剩余有效时间（秒）
     * @param {string} token - JWT令牌
     * @returns {number} 剩余秒数，-1表示已过期或无效
     */
    getTokenRemainingTime(token) {
        const decoded = this.decodeJWT(token);
        if (!decoded || !decoded.payload.exp) {
            return -1;
        }

        const now = Math.floor(Date.now() / 1000);
        const remainingTime = decoded.payload.exp - now;

        return Math.max(0, remainingTime);
    }

    /**
     * 为用户生成完整的JWT认证流程
     * @param {string} userId - 用户ID
     * @returns {Promise<Object>} 包含access_token等信息的对象
     */
    async generateUserToken(userId) {
        try {
            // 1. 生成JWT断言
            const assertion = this.buildOAuthJWT(userId);

            // 2. 交换访问令牌
            const tokenData = await this.exchangeForAccessToken(assertion);

            // 3. 添加用户信息
            return {
                ...tokenData,
                user_id: userId,
                generated_at: Date.now(),
                assertion: assertion
            };
        } catch (error) {
            logger.error('用户令牌生成失败', {
                type: 'user_token_generation_error',
                userId: userId,
                error: error.message
            });
            throw error;
        }
    }
}

// 创建单例实例
const jwtService = new JwtService();

module.exports = { jwtService, JwtService };