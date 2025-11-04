/**
 * 企业微信回调相关路由
 * 处理URL验证和消息接收
 */
const express = require('express');
const router = express.Router();
const { verifyURL, decryptMsg, encryptMsg } = require('../utils/crypto');

/**
 * 处理回调URL验证请求
 * 当在企业微信后台配置回调URL时，企业微信会发送GET请求验证URL
 */
router.all('/callback', async (req, res) => {
    try {
        const { msg_signature, timestamp, nonce, echostr } = req.query;

        // 处理URL验证请求
        if (req.method === 'GET') {
            if (cryptoUtil.verifySignature(msg_signature, timestamp, nonce, echostr)) {
                // 解密echostr
                const decryptedEchostr = cryptoUtil.decryptMessage(echostr);
                return res.send(decryptedEchostr);
            } else {
                return res.status(401).send('签名验证失败');
            }
        }

        // 处理POST消息
        if (req.method === 'POST') {
            // 解析XML消息
            const xmlData = req.body.toString();
            const parsedXml = await parseXml(xmlData);
            const encrypt = parsedXml.xml.Encrypt;

            // 验证签名
            if (!cryptoUtil.verifySignature(msg_signature, timestamp, nonce, encrypt)) {
                return res.status(401).send('消息签名验证失败');
            }

            // 解密消息
            const decryptedXml = cryptoUtil.decryptMessage(encrypt);
            const message = await parseXml(decryptedXml);

            console.log('收到企业微信消息:', message);

            // 处理不同类型的消息
            const msgType = message.xml.MsgType;

            // 简单回复，实际应用中可能需要更复杂的处理
            let replyContent = '';

            if (msgType === 'text') {
                // 文本消息，可以转发到Coze API处理
                replyContent = `您的消息已收到，请访问 ${req.protocol}://${req.get('host')} 与智能助手对话`;
            } else {
                replyContent = '目前只支持文本消息，请发送文字与我对话';
            }

            // 构建回复XML
            const replyTimestamp = Math.floor(Date.now() / 1000).toString();
            const replyXml = `
                <xml>
                    <ToUserName><![CDATA[${message.xml.FromUserName}]]></ToUserName>
                    <FromUserName><![CDATA[${message.xml.ToUserName}]]></FromUserName>
                    <CreateTime>${replyTimestamp}</CreateTime>
                    <MsgType><![CDATA[text]]></MsgType>
                    <Content><![CDATA[${replyContent}]]></Content>
                </xml>
            `;

            // 加密回复消息
            const encryptedReply = cryptoUtil.encryptMessage(replyXml, replyTimestamp, nonce);

            // 构建加密回复XML
            const replyEncryptXml = `
                <xml>
                    <Encrypt><![CDATA[${encryptedReply.encrypt}]]></Encrypt>
                    <MsgSignature><![CDATA[${encryptedReply.signature}]]></MsgSignature>
                    <TimeStamp>${encryptedReply.timestamp}</TimeStamp>
                    <Nonce><![CDATA[${encryptedReply.nonce}]]></Nonce>
                </xml>
            `;

            res.type('application/xml');
            res.send(replyEncryptXml);
        }
    } catch (error) {
        console.error('处理回调请求失败:', error);
        res.status(500).send('服务器错误');
    }
});

module.exports = router;
