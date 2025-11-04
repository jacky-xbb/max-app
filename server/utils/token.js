/**
 * access_token相关工具函数
 * 负责获取、缓存和刷新企业微信API调用凭证
 * 使用内存缓存，进程重启后需要重新获取
 */
const axios = require('axios');
const config = require('../config/config');

// 内存缓存 token（进程重启后丢失）
let tokenCache = {
    accessToken: null,
    expiresAt: 0
};

/**
 * 获取新的access_token
 * @returns {Promise<string>} access_token字符串
 */
async function getAccessToken() {
    try {
        console.log('正在获取新的access_token...');
        const url = `${config.apiBase}/gettoken?corpid=${config.corpId}&corpsecret=${config.corpSecret}`;
        const response = await axios.get(url);
        console.log("corpid is:" + config.corpId.toString())
        console.log("corpsecret is:" + config.corpSecret.toString())

        if (response.data.errcode === 0) {
            const accessToken = response.data.access_token;
            const expiresIn = response.data.expires_in;

            // 将token保存到内存中，记录过期时间
            tokenCache = {
                accessToken,
                expiresAt: Date.now() + expiresIn * 1000
            };

            console.log(`Access token获取成功，有效期为${expiresIn}秒`);
            return accessToken;
        } else {
            throw new Error(`获取access_token失败: ${response.data.errmsg}`);
        }
    } catch (error) {
        console.error('获取access_token出错:', error.message);
        throw error;
    }
}

/**
 * 获取有效的access_token（如果已缓存且未过期则使用缓存）
 * @returns {Promise<string>} 有效的access_token
 */
async function getValidAccessToken() {
    try {
        // 检查内存缓存是否有效（提前5分钟刷新）
        if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 300000) {
            console.log('使用缓存的access_token');
            return tokenCache.accessToken;
        }

        if (tokenCache.accessToken) {
            console.log('缓存的token已过期或即将过期，重新获取');
        } else {
            console.log('首次获取access_token');
        }

        // 重新获取
        return await getAccessToken();
    } catch (error) {
        console.error('获取有效access_token出错:', error.message);
        return await getAccessToken(); // 出错时，尝试重新获取
    }
}

module.exports = {
    getAccessToken,
    getValidAccessToken
};
