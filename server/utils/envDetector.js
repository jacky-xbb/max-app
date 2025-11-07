/**
 * 环境检测工具
 * 用于识别用户是在企业微信内还是普通浏览器中访问应用
 */

/**
 * 检测是否在企业微信环境中
 * @param {string} userAgent - User-Agent 字符串
 * @returns {boolean} 是否在企业微信环境中
 */
function isWeComEnvironment(userAgent) {
    if (!userAgent) return false;
    
    // 企业微信的 User-Agent 特征
    const wecomPatterns = [
        /wxwork/i,           // 企业微信标识
        /WeCom/i,            // 企业微信英文版
        /MicroMessenger/i    // 微信/企业微信通用标识
    ];
    
    return wecomPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * 从请求中检测环境
 * @param {Object} req - Express 请求对象
 * @returns {Object} 环境信息
 */
function detectEnvironment(req) {
    const userAgent = req.headers['user-agent'] || '';
    const isWeCom = isWeComEnvironment(userAgent);
    
    return {
        isWeCom,                    // 是否企微环境
        isMobile: /Mobile|Android|iPhone|iPad/i.test(userAgent),
        userAgent,
        platform: isWeCom ? 'wecom' : 'browser'
    };
}

module.exports = { isWeComEnvironment, detectEnvironment };

