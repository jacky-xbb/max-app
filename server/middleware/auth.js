/**
 * 认证中间件
 * 处理用户登录状态验证
 */

const logger = require('../utils/logger');

/**
 * 要求用户登录的中间件
 * 验证用户是否已通过WeChat OAuth认证（优先检查session，兼容token模式）
 */
function requireLogin(req, res, next) {
    logger.info('检查用户登录状态...');

    // 开发模式下跳过认证
    if (process.env.NODE_ENV === 'development') {
        logger.debug('开发模式，自动设置测试用户');
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
    logger.debug('未找到用户认证信息', {
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
function optionalLogin(req, res, next) {
    // 开发模式下跳过认证
    if (process.env.NODE_ENV === 'development') {
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