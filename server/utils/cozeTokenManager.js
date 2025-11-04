/**
 * Coze API Token管理器
 * 用于管理和更新Coze API的访问令牌
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class CozeTokenManager {
    constructor() {
        this.envPath = path.join(__dirname, '../../.env');
        this.tokenUpdateCallbacks = [];
    }

    /**
     * 从.env文件读取当前token
     * @returns {string|null} 当前的API token
     */
    getCurrentToken() {
        try {
            const envContent = fs.readFileSync(this.envPath, 'utf8');
            const match = envContent.match(/COZE_API_KEY=(.+)/);
            return match ? match[1].trim() : null;
        } catch (error) {
            logger.error('读取.env文件失败', {
                type: 'env_read_error',
                error: error.message
            });
            return null;
        }
    }

    /**
     * 更新.env文件中的token
     * @param {string} newToken - 新的API token
     * @returns {boolean} 是否更新成功
     */
    updateToken(newToken) {
        try {
            let envContent = fs.readFileSync(this.envPath, 'utf8');
            
            // 替换现有的COZE_API_KEY
            if (envContent.includes('COZE_API_KEY=')) {
                envContent = envContent.replace(/COZE_API_KEY=.+/, `COZE_API_KEY=${newToken}`);
            } else {
                // 如果不存在，添加到文件末尾
                envContent += `\nCOZE_API_KEY=${newToken}\n`;
            }
            
            fs.writeFileSync(this.envPath, envContent);
            
            logger.info('Coze API Token已更新到.env文件', {
                type: 'token_updated_to_env',
                tokenLength: newToken.length
            });

            // 通知所有注册的回调
            this.notifyTokenUpdate(newToken);
            
            return true;
        } catch (error) {
            logger.error('更新.env文件失败', {
                type: 'env_update_error',
                error: error.message
            });
            return false;
        }
    }

    /**
     * 注册token更新回调
     * @param {function} callback - 当token更新时调用的回调函数
     */
    onTokenUpdate(callback) {
        this.tokenUpdateCallbacks.push(callback);
    }

    /**
     * 通知所有注册的回调token已更新
     * @param {string} newToken - 新的token
     */
    notifyTokenUpdate(newToken) {
        this.tokenUpdateCallbacks.forEach(callback => {
            try {
                callback(newToken);
            } catch (error) {
                logger.error('Token更新回调执行失败', {
                    type: 'token_callback_error',
                    error: error.message
                });
            }
        });
    }

    /**
     * 验证token格式
     * @param {string} token - 要验证的token
     * @returns {boolean} token格式是否有效
     */
    validateTokenFormat(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        
        // Coze API token通常以特定前缀开始
        return token.startsWith('cztei_') || token.startsWith('cztek_') || token.startsWith('cztep_');
    }

    /**
     * 获取token信息
     * @param {string} token - 要分析的token
     * @returns {Object} token信息
     */
    getTokenInfo(token) {
        if (!token) {
            return { valid: false, type: 'missing' };
        }

        const info = {
            valid: this.validateTokenFormat(token),
            length: token.length,
            prefix: token.substring(0, 6),
            type: 'unknown'
        };

        // 根据前缀判断token类型
        if (token.startsWith('cztei_')) {
            info.type = 'temporary'; // 临时token
        } else if (token.startsWith('cztek_')) {
            info.type = 'permanent'; // 永久token
        } else if (token.startsWith('cztep_')) {
            info.type = 'project'; // 项目token
        }

        return info;
    }
}

// 创建单例实例
const cozeTokenManager = new CozeTokenManager();

module.exports = { cozeTokenManager };