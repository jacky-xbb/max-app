// utils/user.js
const axios = require('axios');
const config = require('../config/config');
const tokenUtils = require('./token');
const logger = require('./logger');

/**
 * 通过授权码获取用户信息（自建应用扫码登录或OAuth2网页授权）
 * 使用企业微信自建应用API: GET /cgi-bin/user/getuserinfo
 * @param {string} code 授权码
 * @returns {Promise<Object>} 用户信息
 */
async function getUserInfoByCode(code) {
    try {
        const accessToken = await tokenUtils.getValidAccessToken();

        logger.info('开始获取用户信息', {
            code: code.substring(0, 10) + '...',
            accessToken: accessToken.substring(0, 20) + '...'
        });

        // 调用自建应用API获取用户基本信息
        const apiUrl = `${config.apiBase}/user/getuserinfo?access_token=${accessToken}&code=${code}`;
        logger.info('调用API:', apiUrl);

        const ticketResponse = await axios.get(apiUrl);

        logger.info('API响应:', JSON.stringify(ticketResponse.data, null, 2));

        // 检查API返回
        if (ticketResponse.data.errcode !== undefined && ticketResponse.data.errcode !== 0) {
            logger.error('API返回错误:', {
                errcode: ticketResponse.data.errcode,
                errmsg: ticketResponse.data.errmsg
            });
            return null;
        }

        if (ticketResponse.data.errcode === 0) {
            logger.info('成功获取用户基本信息:', {
                UserId: ticketResponse.data.UserId,
                DeviceId: ticketResponse.data.DeviceId
            });

            // 如果获取到了用户ID，再获取详细信息
            if (ticketResponse.data.UserId) {
                try {
                    logger.info('开始获取用户详细信息...');
                    const userDetailResponse = await axios.get(
                        `${config.apiBase}/user/get?access_token=${accessToken}&userid=${ticketResponse.data.UserId}`
                    );

                    if (userDetailResponse.data.errcode === 0) {
                        logger.info('成功获取用户详细信息:', {
                            name: userDetailResponse.data.name,
                            department: userDetailResponse.data.department
                        });
                        return {
                            ...ticketResponse.data,
                            ...userDetailResponse.data
                        };
                    } else {
                        logger.warn('获取用户详细信息失败，使用基本信息:', userDetailResponse.data);
                    }
                } catch (detailError) {
                    logger.warn('获取用户详细信息出错，使用基本信息:', {
                        message: detailError.message,
                        response: detailError.response?.data
                    });
                }
            }
            return ticketResponse.data;
        } else {
            logger.error('获取用户票据失败:', ticketResponse.data);
            return null;
        }
    } catch (error) {
        logger.error('获取用户信息错误:', {
            message: error.message,
            code: error.code,
            response: error.response?.data,
            stack: error.stack
        });
        return null;
    }
}


/**
 * 获取用户详细信息
 * @param {string} userId 用户ID
 * @returns {Promise<Object|null>} 用户详细信息
 */
async function getUserDetail(userId) {
    try {
        const accessToken = await tokenUtils.getValidAccessToken();

        const response = await axios.get(
            `${config.apiBase}/user/get?access_token=${accessToken}&userid=${userId}`
        );

        if (response.data.errcode === 0) {
            return response.data;
        } else {
            logger.error('获取用户详情失败:', response.data);
            return null;
        }
    } catch (error) {
        logger.error('获取用户详情错误:', error);
        return null;
    }
}

module.exports = {
    getUserInfoByCode,
    getUserDetail
};
