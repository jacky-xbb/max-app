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
// 支持自建应用扫码登录和OAuth2网页授权两种方式
router.get('/callback', async (req, res) => {
    const { code, appid, state } = req.query;

    if (!code) {
        console.error('回调缺少code参数');
        return res.status(400).send('缺少授权码');
    }

    try {
        console.log('收到登录回调:', {
            code: code.substring(0, 10) + '...',
            appid: appid,
            state: state,
            url: req.url
        });

        // 获取用户信息 - 自建应用统一使用 getUserInfoByCode
        const userInfo = await userUtils.getUserInfoByCode(code);

        console.log('getUserInfoByCode 返回结果:', userInfo ? { UserId: userInfo.UserId } : null);

        if (userInfo && userInfo.UserId) {
            // 在session中保存用户信息，用于JWT生成
            req.session.userId = userInfo.UserId;
            req.session.userName = userInfo.name || userInfo.UserId;
            req.session.userInfo = userInfo;
            req.session.loginTime = Date.now();

            console.log('用户登录成功:', {
                userId: userInfo.UserId,
                userName: req.session.userName,
                sessionId: req.sessionID
            });

            // 重定向到 callback.html 页面（包含服务同意书）
            res.redirect('/callback.html');
        } else {
            console.error('获取用户信息失败 - userInfo为空或缺少UserId，详细信息见上方日志');
            res.status(401).send('获取用户信息失败，请查看服务器日志获取详细错误信息');
        }
    } catch (error) {
        console.error('授权回调处理错误:', error);
        res.status(500).send('服务器错误: ' + error.message);
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
    // 开发模式下返回测试用户信息
    if (process.env.NODE_ENV === 'development') {
        return res.json({
            authenticated: true,
            userId: process.env.TEST_USER_ID || 'test_user_001',
            userName: process.env.TEST_USER_NAME || '测试用户',
            loginTime: Date.now()
        });
    }

    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            userId: req.session.userId,
            userName: req.session.userName,
            avatar: req.session.userInfo?.avatar || req.session.userInfo?.thumb_avatar,
            loginTime: req.session.loginTime
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});

module.exports = router;
