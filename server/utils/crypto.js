/**
 * 企业微信消息加解密工具
 * 用于验证URL、消息解密和加密
 */
const crypto = require('../utils/crypto');
const config = require('../config/config');

/**
 * 验证URL有效性
 * @param {string} signature 企业微信加密签名
 * @param {string} timestamp 时间戳
 * @param {string} nonce 随机数
 * @param {string} echostr 随机字符串
 * @returns {string} 验证通过返回echostr，否则返回空字符串
 */
function verifyURL(signature, timestamp, nonce, echostr) {
    // 1. 将token、timestamp、nonce三个参数进行字典序排序
    const array = [config.token, timestamp, nonce];
    array.sort();

    // 2. 将三个参数字符串拼接成一个字符串进行sha1加密
    const str = array.join('');
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const sha1Str = sha1.digest('hex');

    // 3. 开发者获得加密后的字符串可与signature对比，标识该请求来源于微信
    if (sha1Str === signature) {
        return echostr;
    } else {
        return '';
    }
}

/**
 * 消息解密
 * @param {string} msgSignature 消息签名
 * @param {string} timestamp 时间戳
 * @param {string} nonce 随机数
 * @param {string} encryptedMsg 加密的消息
 * @returns {string} 解密后的消息
 */
function decryptMsg(msgSignature, timestamp, nonce, encryptedMsg) {
    // 1. 验证签名
    const array = [config.token, timestamp, nonce, encryptedMsg];
    array.sort();

    const str = array.join('');
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const calculatedSignature = sha1.digest('hex');

    if (calculatedSignature !== msgSignature) {
        throw new Error('消息签名验证失败');
    }

    // 2. 对消息进行解密
    const encoded = Buffer.from(config.encodingAESKey + '=', 'base64');
    const key = encoded.slice(0, 32);
    const iv = encoded.slice(0, 16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedMsg, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // 3. 去除填充
    const content = decrypted.slice(20);
    const length = content.slice(0, 4).readUInt32BE(0);
    const message = content.slice(4, length + 4);
    const receivedCorpId = content.slice(length + 4);

    // 4. 验证企业ID是否匹配
    if (receivedCorpId !== config.corpId) {
        throw new Error('接收到的企业ID不匹配');
    }

    return message;
}

/**
 * 消息加密
 * @param {string} message 要加密的消息
 * @param {string} timestamp 时间戳
 * @param {string} nonce 随机数
 * @returns {Object} 加密结果，包含encrypt、msg_signature、timestamp、nonce
 */
function encryptMsg(message, timestamp, nonce) {
    // 1. 生成随机字符串(16字节)
    const randomString = crypto.randomBytes(16).toString('hex');

    // 2. 构造明文
    const msgLength = Buffer.alloc(4);
    msgLength.writeUInt32BE(message.length, 0);

    const content = randomString + msgLength.toString('binary') + message + config.corpId;

    // 3. 加密
    const encoded = Buffer.from(config.encodingAESKey + '=', 'base64');
    const key = encoded.slice(0, 32);
    const iv = encoded.slice(0, 16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(content, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // 4. 生成签名
    const array = [config.token, timestamp, nonce, encrypted];
    array.sort();

    const str = array.join('');
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const signature = sha1.digest('hex');

    return {
        encrypt: encrypted,
        msg_signature: signature,
        timestamp,
        nonce
    };
}

module.exports = {
    verifyURL,
    decryptMsg,
    encryptMsg
};
