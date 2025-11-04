// routes/api.js
const express = require('express');
const router = express.Router();
const userUtils = require('../utils/user');
const multer = require('multer');
const ChatService = require('../services/chatService');
const logger = require('../utils/logger');
const { retryHandler } = require('../utils/retryHandler');
const { streamOptimizer } = require('../utils/streamOptimizer');
const { rateLimiter } = require('../utils/rateLimiter');
const { cozeConversationManager } = require('../utils/cozeConversationManager');
const { requireLogin } = require('../middleware/auth');
const { jwtService } = require('../utils/jwtService');
const {
    validateChatRequest,
    validateChatPostRequest,
    validateConversationId,
    validateCreateConversation,
    validateAudioToText,
    validateUpdateToken,
    validatePagination
} = require('../middleware/validation');

const upload = multer();

// 初始化Coze专用聊天服务
const chatService = new ChatService();

// 流量限制中间件 - 使用优化的限流器
const rateLimit = async (req, res, next) => {
    try {
        const requestId = logger.generateRequestId();
        
        // 使用限流器执行请求
        await rateLimiter.executeRequest(
            async () => {
                next();
                return Promise.resolve();
            },
            { requestId, userId: req.userId || 'anonymous' },
            { priority: 'normal', timeout: 5000 }
        );
    } catch (error) {
        logger.warn('请求被限流', {
            type: 'rate_limit_exceeded',
            error: error.message,
            userId: req.userId || 'anonymous',
            path: req.path
        });
        
        res.status(429).json({
            error: '请求过于频繁，请稍后重试',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: 60
        });
    }
};




// 更新Coze API Token
router.post('/admin/update-coze-token', requireLogin, async (req, res) => {
    try {
        const { newToken } = req.body;
        
        if (!newToken) {
            return res.status(400).json({
                error: '缺少新的token',
                code: 'MISSING_TOKEN'
            });
        }

        const { cozeTokenManager } = require('../utils/cozeTokenManager');
        
        // 验证token格式
        if (!cozeTokenManager.validateTokenFormat(newToken)) {
            return res.status(400).json({
                error: 'Token格式无效',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }

        // 更新token
        const success = cozeTokenManager.updateToken(newToken);
        
        if (success) {
            const tokenInfo = cozeTokenManager.getTokenInfo(newToken);
            res.json({
                success: true,
                message: 'Token更新成功',
                tokenInfo: {
                    type: tokenInfo.type,
                    length: tokenInfo.length,
                    prefix: tokenInfo.prefix
                }
            });
        } else {
            res.status(500).json({
                error: 'Token更新失败',
                code: 'UPDATE_FAILED'
            });
        }
    } catch (error) {
        console.error('更新Coze token失败:', error);
        res.status(500).json({
            error: '服务器内部错误',
            code: 'INTERNAL_ERROR'
        });
    }
});

// 获取当前Coze Token信息
router.get('/admin/coze-token-info', requireLogin, async (req, res) => {
    try {
        const { cozeTokenManager } = require('../utils/cozeTokenManager');
        const currentToken = cozeTokenManager.getCurrentToken();
        
        if (!currentToken) {
            return res.json({
                hasToken: false,
                message: '未找到Coze API Token'
            });
        }

        const tokenInfo = cozeTokenManager.getTokenInfo(currentToken);
        
        res.json({
            hasToken: true,
            tokenInfo: {
                valid: tokenInfo.valid,
                type: tokenInfo.type,
                length: tokenInfo.length,
                prefix: tokenInfo.prefix
            }
        });
    } catch (error) {
        console.error('获取Coze token信息失败:', error);
        res.status(500).json({
            error: '服务器内部错误',
            code: 'INTERNAL_ERROR'
        });
    }
});

// JWT Token管理端点

// 签发Coze JWT访问令牌
router.post('/coze-token/issue', requireLogin, async (req, res) => {
    try {
        logger.info('开始为用户签发Coze JWT令牌', {
            type: 'jwt_token_issue_start',
            userId: req.userId
        });

        // 生成用户专用的JWT令牌
        const tokenData = await jwtService.generateUserToken(req.userId);

        logger.info('Coze JWT令牌签发成功', {
            type: 'jwt_token_issue_success',
            userId: req.userId,
            tokenType: tokenData.token_type,
            expiresIn: tokenData.expires_in
        });

        res.json({
            success: true,
            access_token: tokenData.access_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_in: tokenData.expires_in,
            user_id: tokenData.user_id,
            generated_at: tokenData.generated_at,
            scope: tokenData.scope
        });

    } catch (error) {
        logger.error('Coze JWT令牌签发失败', {
            type: 'jwt_token_issue_error',
            userId: req.userId,
            error: error.message,
            stack: error.stack
        });

        // 根据错误类型返回不同的错误信息
        if (error.message.includes('私钥')) {
            return res.status(500).json({
                error: '服务器配置错误',
                code: 'SERVER_CONFIG_ERROR',
                message: '认证服务暂时不可用'
            });
        }

        if (error.response && error.response.status === 401) {
            return res.status(401).json({
                error: 'JWT认证失败',
                code: 'JWT_AUTH_FAILED',
                message: '无法获取API访问权限'
            });
        }

        res.status(500).json({
            error: '令牌签发失败',
            code: 'TOKEN_ISSUE_FAILED',
            message: '请稍后重试'
        });
    }
});

// 刷新Coze JWT访问令牌
router.post('/coze-token/refresh', requireLogin, async (req, res) => {
    try {
        logger.info('开始为用户刷新Coze JWT令牌', {
            type: 'jwt_token_refresh_start',
            userId: req.userId
        });

        // 生成新的JWT令牌（与issue逻辑相同）
        const tokenData = await jwtService.generateUserToken(req.userId);

        logger.info('Coze JWT令牌刷新成功', {
            type: 'jwt_token_refresh_success',
            userId: req.userId,
            tokenType: tokenData.token_type,
            expiresIn: tokenData.expires_in
        });

        res.json({
            success: true,
            access_token: tokenData.access_token,
            token_type: tokenData.token_type || 'Bearer',
            expires_in: tokenData.expires_in,
            user_id: tokenData.user_id,
            generated_at: tokenData.generated_at,
            scope: tokenData.scope,
            refreshed: true
        });

    } catch (error) {
        logger.error('Coze JWT令牌刷新失败', {
            type: 'jwt_token_refresh_error',
            userId: req.userId,
            error: error.message,
            stack: error.stack
        });

        // 根据错误类型返回不同的错误信息
        if (error.message.includes('私钥')) {
            return res.status(500).json({
                error: '服务器配置错误',
                code: 'SERVER_CONFIG_ERROR',
                message: '认证服务暂时不可用'
            });
        }

        if (error.response && error.response.status === 401) {
            return res.status(401).json({
                error: 'JWT认证失败',
                code: 'JWT_AUTH_FAILED',
                message: '无法获取API访问权限'
            });
        }

        res.status(500).json({
            error: '令牌刷新失败',
            code: 'TOKEN_REFRESH_FAILED',
            message: '请稍后重试'
        });
    }
});

// 获取用户详细信息
router.get('/user/:userId', requireLogin, async (req, res) => {
    try {
        // 验证请求的用户ID与令牌中的用户ID是否匹配
        if (req.params.userId !== req.userId) {
            return res.status(403).json({error: '无权访问此用户信息'});
        }

        const userDetail = await userUtils.getUserDetail(req.userId);

        if (userDetail) {
            // 返回必要的用户信息
            res.json({
                userId: userDetail.userid,
                name: userDetail.name,
                department: userDetail.department ? userDetail.department.join(',') : '',
                position: userDetail.position || '',
                email: userDetail.email || '',
                mobile: userDetail.mobile || '',
                gender: userDetail.gender || '',
                // 可以根据需要添加更多字段
            });
        } else {
            res.status(404).json({error: '未找到用户信息'});
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({error: '服务器错误'});
    }
});

// 获取Bot信息，包括开场白和预置问题
router.get('/bot/info', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        logger.info('获取Bot信息请求', {
            type: 'bot_info_request',
            requestId: requestId,
            userId: req.userId,
            botId: req.query.botId || 'default',
            timestamp: new Date().toISOString()
        });

        // 生成JWT令牌并交换访问令牌
        const tokenData = await jwtService.generateUserToken(req.userId);
        const cozeAccessToken = tokenData.access_token;

        // 调用ChatService获取Bot信息，传递访问令牌
        const botInfo = await chatService.getBotInfo(req.query.botId, cozeAccessToken);
        
        logger.info('Bot信息获取成功', {
            type: 'bot_info_success',
            requestId: requestId,
            hasPrologue: !!botInfo.onboarding?.prologue,
            suggestedQuestionsCount: botInfo.onboarding?.suggestedQuestions?.length || 0,
            timestamp: new Date().toISOString()
        });
        
        // 设置响应头，防止任何形式的缓存
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.json({
            success: true,
            requestId: requestId,
            data: {
                botId: botInfo.botId,
                name: botInfo.name,
                description: botInfo.description,
                iconUrl: botInfo.iconUrl,
                onboarding: botInfo.onboarding,
                prompt: botInfo.prompt
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('获取Bot信息失败', {
            type: 'bot_info_error',
            requestId: requestId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({
            success: false,
            requestId: requestId,
            error: '获取Bot信息失败',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 与Coze API通信 - GET方式用于EventSource SSE连接
router.get('/chat', rateLimit, requireLogin, validateChatRequest, async (req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        // 从查询参数获取请求数据
        const requestData = {
            query: req.query.query,
            user: req.query.user,
            inputs: req.query.inputs ? JSON.parse(req.query.inputs) : {},
            response_mode: req.query.response_mode || 'streaming',
            conversation_id: req.query.conversation_id,
            searchMode: req.query.searchMode
        };

        const userId = req.userId; // 从企微鉴权获取的用户ID

        // 为用户生成Coze API访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;

            logger.info('为用户生成Coze API令牌成功', {
                type: 'coze_token_generated_for_chat',
                requestId: requestId,
                userId: userId,
                access_token: cozeAccessToken,  // 打印完整的access token
                tokenType: tokenData.token_type,
                expiresIn: tokenData.expires_in
            });
        } catch (tokenError) {
            logger.error('为用户生成Coze API令牌失败', {
                type: 'coze_token_generation_failed',
                requestId: requestId,
                userId: userId,
                error: tokenError.message
            });

            return res.status(500).json({
                error: '服务暂时不可用',
                code: 'TOKEN_GENERATION_FAILED',
                message: '请稍后重试'
            });
        }

        // 验证请求数据
        if (!requestData.query) {
            logger.warn('聊天请求缺少必要参数', {
                type: 'chat_request_validation_error',
                requestId: requestId,
                userId: userId,
                issue: 'missing_query'
            });
            return res.status(400).json({error: '缺少必要参数'});
        }

        logger.info('收到Coze聊天请求 (GET/SSE)', {
            type: 'chat_request_received_sse',
            requestId: requestId,
            query: requestData.query?.substring(0, 100) + (requestData.query?.length > 100 ? '...' : ''),
            queryLength: requestData.query?.length || 0,
            userId: userId,
            conversation_id: requestData.conversation_id || '新会话'
        });

        // 创建优化的SSE处理器（它会自动设置响应头）
        const sseProcessor = streamOptimizer.createOptimizedSSE(res, {
            bufferSize: 4096,
            flushInterval: 50
        });

        // 发送初始连接确认
        sseProcessor.sendMessage('connected', { message: 'SSE连接已建立' });

        // 定义回调函数处理Coze响应
        const callbacks = {
            onMessage: (response) => {
                sseProcessor.sendMessage(response.event, response);
            },
            
            onEnd: async (response) => {
                logger.info('聊天会话结束', {
                    type: 'chat_session_end',
                    requestId: requestId,
                    userId: userId,
                    responseLength: response.answer?.length || 0,
                    hasFollowUp: !!(response.followUpQuestions && response.followUpQuestions.length > 0),
                    followUpQuestions: response.followUpQuestions
                });
                
                // 如果有 follow-up questions，先作为单独的 message 事件发送
                if (response.followUpQuestions && response.followUpQuestions.length > 0) {
                    console.log('[API] 发送包含 follow-up questions 的 message 事件');
                    sseProcessor.sendMessage('message', {
                        event: 'message',
                        answer: response.answer,
                        conversation_id: response.conversation_id,
                        user_id: response.user_id,
                        followUpQuestions: response.followUpQuestions,
                        isFollowUp: true
                    });
                    
                    // 刷新确保发送
                    if (sseProcessor.response && typeof sseProcessor.response.flush === 'function') {
                        sseProcessor.response.flush();
                    }
                    
                    // 小延迟确保前端接收
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // 然后发送 message_end 事件
                sseProcessor.sendMessage('message_end', response);
                
                // 强制刷新缓冲区，确保数据发送
                if (sseProcessor.response && typeof sseProcessor.response.flush === 'function') {
                    sseProcessor.response.flush();
                }
                
                // 给前端更多时间处理消息后关闭连接
                setTimeout(() => {
                    logger.info('关闭SSE连接', {
                        type: 'sse_connection_close',
                        requestId: requestId
                    });
                    sseProcessor.end();
                }, 500); // 增加到500ms延迟，确保前端有足够时间处理消息
            },
            
            onError: (error) => {
                logger.error('聊天会话错误', {
                    type: 'chat_session_error',
                    requestId: requestId,
                    userId: userId,
                    error: error.message
                });
                sseProcessor.sendMessage('error', error);
                sseProcessor.end();
            }
        };

        // 处理客户端断开连接
        req.on('close', () => {
            logger.info('客户端断开连接', {
                type: 'client_disconnect',
                requestId: requestId,
                userId: userId
            });
            setTimeout(() => {
                sseProcessor.end();
            }, 1000);
        });

        // 处理客户端错误
        req.on('error', (error) => {
            // 对于客户端主动断开连接（aborted），降级为info日志
            if (error.message === 'aborted' || error.code === 'ECONNRESET') {
                logger.info('客户端主动断开连接', {
                    type: 'client_normal_disconnect',
                    requestId: requestId,
                    userId: userId,
                    reason: error.message
                });
            } else {
                logger.error('客户端连接错误', {
                    type: 'client_connection_error',
                    requestId: requestId,
                    userId: userId,
                    error: error.message
                });
            }
        });

        // 使用Coze专用ChatService发送消息
        await chatService.sendMessage(requestData, userId, callbacks, cozeAccessToken);

    } catch (error) {
        logger.error('Coze聊天请求失败', {
            type: 'chat_request_error',
            requestId: requestId,
            userId: req.userId,
            error: error.message,
            stack: error.stack
        });

        // 如果响应头尚未发送，返回JSON错误
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Coze聊天请求失败',
                message: error.message,
                provider: 'coze',
                requestId: requestId
            });
        } else {
            // 如果已经开始发送SSE响应，发送错误事件
            try {
                res.write(`data: ${JSON.stringify({
                    event: 'error',
                    message: error.message,
                    provider: 'coze',
                    requestId: requestId
                })}\n\n`);
                res.end();
            } catch (sseError) {
                logger.error('发送SSE错误消息失败', {
                    type: 'sse_error_send_failed',
                    requestId: requestId,
                    error: sseError.message
                });
                res.end();
            }
        }
    }
});

// 与Coze API通信 - POST方式保持向后兼容
router.post('/chat', rateLimit, requireLogin, validateChatPostRequest, async (req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        const requestData = req.body;
        const userId = req.userId; // 从企微鉴权获取的用户ID

        // 为用户生成Coze API访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;

            logger.info('为用户生成Coze API令牌成功', {
                type: 'coze_token_generated_for_chat',
                requestId: requestId,
                userId: userId,
                access_token: cozeAccessToken,  // 打印完整的access token
                tokenType: tokenData.token_type,
                expiresIn: tokenData.expires_in
            });
        } catch (tokenError) {
            logger.error('为用户生成Coze API令牌失败', {
                type: 'coze_token_generation_failed',
                requestId: requestId,
                userId: userId,
                error: tokenError.message
            });

            return res.status(500).json({
                error: '服务暂时不可用',
                code: 'TOKEN_GENERATION_FAILED',
                message: '请稍后重试'
            });
        }

        // 验证请求数据
        if (!requestData.query) {
            logger.warn('聊天请求缺少必要参数', {
                type: 'chat_request_validation_error',
                requestId: requestId,
                userId: userId,
                issue: 'missing_query'
            });
            return res.status(400).json({error: '缺少必要参数'});
        }

        logger.info('收到Coze聊天请求', {
            type: 'chat_request_received',
            requestId: requestId,
            query: requestData.query?.substring(0, 100) + (requestData.query?.length > 100 ? '...' : ''),
            queryLength: requestData.query?.length || 0,
            userId: userId,
            conversation_id: requestData.conversation_id || '新会话'
        });

        // 创建优化的SSE处理器
        const sseProcessor = streamOptimizer.createOptimizedSSE(res, {
            bufferSize: 4096,
            flushInterval: 50
        });

        // 定义回调函数处理Coze响应
        const callbacks = {
            onMessage: (response) => {
                // 使用优化的SSE处理器发送消息
                logger.debug('发送SSE消息', {
                    type: 'sse_message_sent',
                    requestId: requestId,
                    event: response.event,
                    hasAnswer: !!response.answer
                });
                console.log('[API] 准备发送SSE消息:', {
                    event: response.event,
                    hasAnswer: !!response.answer,
                    answerLength: response.answer?.length || 0
                });
                sseProcessor.sendMessage(response.event, response);
                console.log('[API] SSE消息已发送');
            },
            
            onEnd: async (response) => {
                // 发送结束事件
                logger.info('聊天会话结束', {
                    type: 'chat_session_end',
                    requestId: requestId,
                    userId: userId,
                    responseLength: response.answer?.length || 0,
                    hasFollowUp: !!(response.followUpQuestions && response.followUpQuestions.length > 0)
                });
                
                // 如果有 follow-up questions，先作为单独的 message 事件发送
                if (response.followUpQuestions && response.followUpQuestions.length > 0) {
                    console.log('[API POST] 发送包含 follow-up questions 的 message 事件');
                    sseProcessor.sendMessage('message', {
                        event: 'message',
                        answer: response.answer,
                        conversation_id: response.conversation_id,
                        user_id: response.user_id,
                        followUpQuestions: response.followUpQuestions,
                        isFollowUp: true
                    });
                    
                    // 小延迟确保前端接收
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                sseProcessor.sendMessage('message_end', response);
                sseProcessor.end();
            },
            
            onError: (error) => {
                // 发送错误事件
                logger.error('聊天会话错误', {
                    type: 'chat_session_error',
                    requestId: requestId,
                    userId: userId,
                    error: error.message
                });
                sseProcessor.sendMessage('error', error);
                sseProcessor.end();
            }
        };

        // 处理客户端断开连接
        req.on('close', () => {
            logger.info('客户端断开连接', {
                type: 'client_disconnect',
                requestId: requestId,
                userId: userId
            });
            // 不要立即结束SSE处理器，给一些时间让正在进行的请求完成
            setTimeout(() => {
                sseProcessor.end();
            }, 1000);
        });

        // 处理客户端错误
        req.on('error', (error) => {
            // 对于客户端主动断开连接（aborted），降级为info日志
            if (error.message === 'aborted' || error.code === 'ECONNRESET') {
                logger.info('客户端主动断开连接', {
                    type: 'client_normal_disconnect',
                    requestId: requestId,
                    userId: userId,
                    reason: error.message
                });
            } else {
                logger.error('客户端连接错误', {
                    type: 'client_connection_error',
                    requestId: requestId,
                    userId: userId,
                    error: error.message
                });
            }
        });

        // 使用Coze专用ChatService发送消息
        await chatService.sendMessage(requestData, userId, callbacks, cozeAccessToken);

    } catch (error) {
        logger.error('Coze聊天请求失败', {
            type: 'chat_request_error',
            requestId: requestId,
            userId: req.userId,
            error: error.message,
            stack: error.stack
        });

        // 如果响应头尚未发送，返回JSON错误
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Coze聊天请求失败',
                message: error.message,
                provider: 'coze',
                requestId: requestId
            });
        } else {
            // 如果已经开始发送SSE响应，使用SSE处理器发送错误事件
            try {
                sseProcessor.sendMessage('error', {
                    event: 'error',
                    message: error.message,
                    provider: 'coze',
                    requestId: requestId
                });
                sseProcessor.end();
            } catch (sseError) {
                // 如果SSE处理器不可用，回退到原始方式
                res.write(`data: ${JSON.stringify({
                    event: 'error',
                    message: error.message,
                    provider: 'coze',
                    requestId: requestId
                })}\n\n`);
                res.end();
            }
        }
    }
});

// 重新加载适配器端点（开发环境使用）
router.post('/reload-adapter', requireLogin, async (_req, res) => {
    try {
        const result = chatService.reloadAdapter();
        res.json({
            success: result,
            message: result ? '适配器重新加载成功' : '适配器重新加载失败',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 语音转文字接口（使用Coze服务）
router.post('/audio-to-text', requireLogin, upload.single('file'), async (req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        const userId = req.userId; // 从企微鉴权获取的用户ID
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;

        // 添加更详细的请求日志
        logger.info('收到Coze语音转文字请求', {
            type: 'coze_speech_to_text_request',
            requestId: requestId,
            userId: userId,
            fileName: fileName,
            mimetype: req.file.mimetype,
            size: req.file.size,
            hasAuthHeader: !!req.headers.authorization,
            authHeader: req.headers.authorization ? req.headers.authorization.substring(0, 20) + '...' : 'none'
        });

        // 验证音频文件
        if (!fileBuffer || fileBuffer.length === 0) {
            logger.warn('音频文件验证失败', {
                type: 'speech_validation_error',
                requestId: requestId,
                userId: userId,
                issue: 'empty_file'
            });
            return res.status(400).json({ 
                error: '音频文件为空或无效',
                requestId: requestId
            });
        }

        // 准备语音转文字选项
        const options = {
            format: req.file.mimetype,
            filename: fileName,
            contentType: req.file.mimetype,
            language: 'zh-CN' // 默认中文
        };

        // 生成JWT令牌并交换访问令牌
        const tokenData = await jwtService.generateUserToken(userId);
        const cozeAccessToken = tokenData.access_token;

        // 使用Coze专用ChatService进行语音转文字，传递访问令牌
        const result = await chatService.convertSpeechToText(fileBuffer, options, cozeAccessToken);

        if (result.success) {
            logger.info('Coze语音转文字成功', {
                type: 'coze_speech_to_text_success',
                requestId: requestId,
                userId: userId,
                textLength: result.text ? result.text.length : 0,
                confidence: result.confidence || 0
            });
            
            res.json({ 
                text: result.text || '',
                confidence: result.confidence || 0,
                language: result.language || 'zh-CN',
                provider: 'coze',
                requestId: requestId
            });
        } else {
            logger.error('Coze语音转文字失败', {
                type: 'coze_speech_to_text_error',
                requestId: requestId,
                userId: userId,
                error: result.error
            });
            
            res.status(500).json({ 
                error: '语音转文字失败', 
                message: result.error,
                provider: 'coze',
                requestId: requestId
            });
        }
    } catch (err) {
        logger.error('Coze语音转文字异常', {
            type: 'coze_speech_to_text_exception',
            requestId: requestId,
            userId: req.userId,
            error: err.message,
            stack: err.stack
        });
        
        res.status(500).json({ 
            error: '语音转文字失败', 
            message: err.message,
            provider: 'coze',
            requestId: requestId
        });
    }
});

/**
 * 健康检查端点
 * GET /api/health
 */
router.get('/health', async (_req, res) => {
    const requestId = logger.generateRequestId();
    const startTime = Date.now();
    
    try {
        logger.debug('执行健康检查', {
            type: 'health_check_start',
            requestId: requestId,
            timestamp: new Date().toISOString()
        });
        
        // 获取各个组件的健康状态
        const [chatServiceHealth, retryHandlerHealth] = await Promise.allSettled([
            chatService.getHealthStatus(),
            Promise.resolve(retryHandler.getHealthStatus())
        ]);

        // 处理健康检查结果
        const services = {
            chat: chatServiceHealth.status === 'fulfilled' ? chatServiceHealth.value : {
                status: 'unhealthy',
                error: chatServiceHealth.reason?.message || 'Unknown error'
            },
            retryHandler: retryHandlerHealth.status === 'fulfilled' ? retryHandlerHealth.value : {
                status: 'unhealthy',
                error: retryHandlerHealth.reason?.message || 'Unknown error'
            }
        };

        // 确定整体状态
        const serviceStatuses = Object.values(services).map(s => s.status);
        let overallStatus = 'ok';
        
        if (serviceStatuses.includes('unhealthy')) {
            overallStatus = 'error';
        } else if (serviceStatuses.includes('degraded')) {
            overallStatus = 'degraded';
        }

        const duration = Date.now() - startTime;
        
        const healthResponse = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            requestId: requestId,
            duration,
            services,
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform
            }
        };
        
        logger.logHealthStatus({
            requestId: requestId,
            status: overallStatus,
            duration,
            services: Object.keys(services).reduce((acc, key) => {
                acc[key] = services[key].status;
                return acc;
            }, {})
        });
        
        // 根据状态设置HTTP状态码
        const httpStatus = overallStatus === 'ok' ? 200 : 
                          overallStatus === 'degraded' ? 200 : 503;
        
        res.status(httpStatus).json(healthResponse);
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error('健康检查失败', {
            type: 'health_check_error',
            requestId: requestId,
            error: error.message,
            stack: error.stack,
            duration,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            duration,
            error: error.message
        });
    }
});


/**
 * 错误监控端点
 * GET /api/errors
 */
router.get('/errors', (_req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        logger.debug('获取错误监控信息', {
            type: 'error_monitoring_request',
            requestId: requestId,
            timestamp: new Date().toISOString()
        });
        
        const metrics = logger.getMetrics();
        const retryStatus = retryHandler.getHealthStatus();
        
        // 构建错误监控响应
        const errorResponse = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            errorMetrics: {
                totalApiCalls: metrics.apiCalls,
                totalApiErrors: metrics.apiErrors,
                errorRate: metrics.errorRate,
                averageResponseTime: metrics.averageResponseTime
            },
            retryHandler: retryStatus,
            recommendations: []
        };

        // 添加建议
        if (parseFloat(metrics.errorRate) > 10) {
            errorResponse.recommendations.push('错误率过高，建议检查API配置和网络连接');
        }
        
        if (metrics.averageResponseTime > 5000) {
            errorResponse.recommendations.push('平均响应时间过长，建议优化API调用或增加超时设置');
        }
        
        if (retryStatus.status === 'degraded') {
            errorResponse.recommendations.push('重试处理器状态异常，建议检查服务健康状态');
        }
        
        logger.logBusinessEvent('error_monitoring_accessed', {
            requestId: requestId,
            errorRate: metrics.errorRate,
            recommendationCount: errorResponse.recommendations.length
        });
        
        res.json(errorResponse);
        
    } catch (error) {
        logger.error('获取错误监控信息失败', {
            type: 'error_monitoring_error',
            requestId: requestId,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});

/**
 * 日志级别控制端点
 * POST /api/log-level
 */
router.post('/log-level', (req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        const { level } = req.body;
        
        if (!level || !['error', 'warn', 'info', 'debug'].includes(level)) {
            return res.status(400).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                error: '无效的日志级别，支持: error, warn, info, debug'
            });
        }
        
        const oldLevel = logger.logLevel;
        logger.logLevel = level;
        
        logger.info('日志级别已更新', {
            type: 'log_level_changed',
            requestId: requestId,
            oldLevel: oldLevel,
            newLevel: level,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            message: `日志级别已从 ${oldLevel} 更新为 ${level}`,
            oldLevel: oldLevel,
            newLevel: level
        });
        
    } catch (error) {
        logger.error('更新日志级别失败', {
            type: 'log_level_error',
            requestId: requestId,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});





/**
 * 获取用户会话列表 - 调用 Coze API
 * GET /api/conversations
 */
router.get('/conversations', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        const userId = req.userId;
        const pageSize = parseInt(req.query.limit) || 50;
        const pageNum = parseInt(req.query.page) || 1;

        logger.info('获取用户会话列表', {
            type: 'get_user_conversations_request',
            requestId: requestId,
            userId: userId,
            pageSize: pageSize,
            pageNum: pageNum
        });

        // 生成用户的 Coze API 访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;
        } catch (tokenError) {
            logger.error('生成Coze API令牌失败', {
                type: 'token_generation_failed',
                requestId: requestId,
                userId: userId,
                error: tokenError.message
            });
            return res.status(500).json({
                status: 'error',
                error: '服务暂时不可用',
                code: 'TOKEN_GENERATION_FAILED',
                message: '请稍后重试'
            });
        }

        // 调用 cozeSDKAdapter 获取会话列表
        const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
        const result = await cozeSDKAdapter.getConversationList(
            null, // 使用默认 botId
            {
                pageSize: pageSize,
                pageNum: pageNum,
                sortOrder: 'DESC' // 最新的在前
            },
            cozeAccessToken
        );

        if (result.success) {
            logger.info('会话列表获取成功', {
                type: 'conversation_list_success',
                requestId: requestId,
                count: result.conversations.length,
                hasMore: result.hasMore
            });

            // 转换数据格式，并为没有name的会话生成智能标题
            const conversations = await Promise.all(
                result.conversations.map(async (conv) => {
                    let title = conv.name;

                    // 如果name为空或为"新对话"，尝试用首条用户消息作为标题
                    if (!title || title === '新对话' || title.trim() === '') {
                        try {
                            const firstMessage = await cozeSDKAdapter.getFirstMessage(conv.id, cozeAccessToken);
                            if (firstMessage) {
                                // 截取前30个字符作为标题
                                title = firstMessage.substring(0, 30);
                                if (firstMessage.length > 30) {
                                    title += '...';
                                }
                                logger.debug('使用首条消息作为标题', {
                                    conversationId: conv.id,
                                    title: title
                                });
                            } else {
                                // 没有消息，保持"新对话"
                                title = '新对话';
                            }
                        } catch (error) {
                            logger.warn('获取首条消息失败，使用默认标题', {
                                conversationId: conv.id,
                                error: error.message
                            });
                            title = '新对话';
                        }
                    }

                    return {
                        conversationId: conv.id,
                        title: title,
                        createdAt: conv.created_at,
                        updatedAt: conv.updated_at,
                        messageCount: 0 // Coze API 不返回消息数量
                    };
                })
            );

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                userId: userId,
                count: conversations.length,
                conversations: conversations,
                hasMore: result.hasMore
            });
        } else {
            throw new Error('获取会话列表失败');
        }

    } catch (error) {
        logger.error('获取用户会话列表失败', {
            type: 'get_user_conversations_error',
            requestId: requestId,
            userId: req.userId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});

/**
 * 获取会话历史
 * GET /api/conversations/:conversationId/messages
 */
router.get('/conversations/:conversationId/messages', requireLogin, (req, res) => {
    const requestId = logger.generateRequestId();
    
    try {
        const userId = req.userId;
        const conversationId = req.params.conversationId;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        logger.debug('获取会话历史', {
            type: 'get_conversation_history_request',
            requestId: requestId,
            userId: userId,
            conversationId: conversationId,
            limit: limit,
            offset: offset
        });
        
        const messages = cozeConversationManager.getConversationHistory(conversationId, {
            limit: limit,
            offset: offset,
            includeSystem: req.query.includeSystem === 'true'
        });
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            conversationId: conversationId,
            count: messages.length,
            limit: limit,
            offset: offset,
            messages: messages
        });
        
    } catch (error) {
        logger.error('获取会话历史失败', {
            type: 'get_conversation_history_error',
            requestId: requestId,
            userId: req.userId,
            conversationId: req.params.conversationId,
            error: error.message
        });
        
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});

/**
 * 获取会话历史消息（分页）
 * GET /api/conversations/:conversationId/history
 * Query params: afterId, limit
 */
router.get('/conversations/:conversationId/history', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        const userId = req.userId;
        const conversationId = req.params.conversationId;
        const afterId = req.query.afterId;
        const limit = parseInt(req.query.limit) || 10; // 默认10条

        logger.info('获取会话历史消息', {
            type: 'get_conversation_history',
            requestId: requestId,
            userId: userId,
            conversationId: conversationId,
            afterId: afterId,
            limit: limit
        });

        // 为用户生成Coze API访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;
        } catch (tokenError) {
            logger.error('生成Coze API令牌失败', {
                type: 'token_generation_failed',
                requestId: requestId,
                userId: userId,
                error: tokenError.message
            });
            return res.status(500).json({
                error: '服务暂时不可用',
                code: 'TOKEN_GENERATION_FAILED',
                message: '请稍后重试'
            });
        }

        // 获取历史消息
        const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
        const messagesResult = await cozeSDKAdapter.getConversationMessages(
            conversationId,
            {
                order: 'desc',
                afterId: afterId,  // 使用 afterId 获取更旧的消息
                limit: limit
            },
            cozeAccessToken
        );

        if (messagesResult.success) {
            // 反转消息数组，使其按时间升序
            const messages = messagesResult.data.reverse();

            // 过滤消息，只保留有效内容
            const filteredMessages = messages.filter(msg => {
                // 严格只保留 question 和 answer 类型的消息
                const messageType = msg.type || (msg.role === 'user' ? 'question' : 'answer');
                if (messageType !== 'question' && messageType !== 'answer') {
                    return false;
                }

                // 过滤 assistant 的中间状态消息
                if (msg.role === 'assistant' && msg.content) {
                    const content = msg.content.trim();

                    // 过滤空内容
                    if (!content) {
                        return false;
                    }

                    // 更全面的中间状态消息模式匹配
                    const intermediatePatterns = [
                        '正在思考中',
                        '正在为你搜索',
                        '正在处理',
                        '正在生成',
                        '思考中...',
                        '搜索中...',
                        '处理中...',
                        'thinking',
                        'searching',
                        'processing'
                    ];

                    if (intermediatePatterns.some(pattern => content.includes(pattern))) {
                        return false;
                    }
                }

                return true;
            });

            // 去重：如果多个 assistant 消息内容完全相同，只保留最后一条（最新的）
            const assistantMessagesByContent = new Map(); // content -> { message, originalIndex }

            filteredMessages.forEach((msg, index) => {
                if (msg.role === 'assistant') {
                    const contentKey = msg.content.trim();
                    // 记录每个内容的最新消息和索引
                    if (!assistantMessagesByContent.has(contentKey) ||
                        assistantMessagesByContent.get(contentKey).originalIndex < index) {
                        assistantMessagesByContent.set(contentKey, { message: msg, originalIndex: index });
                    }
                }
            });

            // 构建最终消息列表，保持原始顺序
            const finalMessages = [];
            filteredMessages.forEach((msg, index) => {
                if (msg.role === 'user') {
                    finalMessages.push(msg);
                } else if (msg.role === 'assistant') {
                    const contentKey = msg.content.trim();
                    const latestEntry = assistantMessagesByContent.get(contentKey);
                    // 只有当前消息是该内容的最新版本时才添加
                    if (latestEntry && latestEntry.originalIndex === index) {
                        finalMessages.push(msg);
                    }
                }
            });

            // 获取正确的firstId：去重后数组的第一条消息（最早的消息）
            const correctFirstId = finalMessages.length > 0 ? finalMessages[0].id : null;

            logger.info('获取历史消息成功', {
                type: 'history_messages_retrieved',
                requestId: requestId,
                conversationId: conversationId,
                originalCount: messages.length,
                filteredCount: filteredMessages.length,
                deduplicatedCount: finalMessages.length,
                hasMore: messagesResult.hasMore,
                originalFirstId: messagesResult.firstId,
                correctFirstId: correctFirstId
            });

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                messages: finalMessages.map(msg => ({
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    contentType: msg.content_type,
                    createdAt: msg.created_at,
                    type: msg.type || (msg.role === 'user' ? 'question' : 'answer')
                })),
                hasMore: messagesResult.hasMore || false,
                firstId: correctFirstId,  // 使用过滤后的第一条消息ID
                messageCount: filteredMessages.length
            });
        } else {
            throw new Error('获取消息失败');
        }

    } catch (error) {
        logger.error('获取会话历史失败', {
            type: 'get_conversation_history_error',
            requestId: requestId,
            userId: req.userId,
            conversationId: req.params.conversationId,
            error: error.message
        });

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});

/**
 * 创建新会话 - 调用 Coze API
 * POST /api/conversations
 */
router.post('/conversations', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        const userId = req.userId;
        const { title } = req.body;

        // 处理标题：如果为空字符串或null，则不传name参数让Coze决定
        const conversationName = title && title.trim() ? title.trim() : undefined;

        logger.info('创建新会话请求', {
            type: 'create_conversation_request',
            requestId: requestId,
            userId: userId,
            title: conversationName || '(由Coze生成或首条消息决定)'
        });

        // 生成用户的 Coze API 访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;
        } catch (tokenError) {
            logger.error('生成Coze API令牌失败', {
                type: 'token_generation_failed',
                requestId: requestId,
                userId: userId,
                error: tokenError.message
            });
            return res.status(500).json({
                status: 'error',
                error: '服务暂时不可用',
                code: 'TOKEN_GENERATION_FAILED',
                message: '请稍后重试'
            });
        }

        // 调用 cozeSDKAdapter 创建会话
        const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
        const conversationOptions = {};

        // 只有当有明确的标题时才传name参数，否则让Coze根据对话内容生成
        if (conversationName) {
            conversationOptions.name = conversationName;
        }

        const result = await cozeSDKAdapter.createConversation(conversationOptions, cozeAccessToken);

        if (result.success && result.data) {
            logger.info('Coze会话创建成功', {
                type: 'conversation_created',
                requestId: requestId,
                conversationId: result.data.id,
                conversationName: result.data.name
            });

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                conversation: {
                    conversationId: result.data.id,
                    title: result.data.name || conversationName || '新对话',
                    createdAt: result.data.created_at || Date.now(),
                    messageCount: 0
                }
            });
        } else {
            throw new Error('创建会话失败：' + (result.error || '未知错误'));
        }

    } catch (error) {
        logger.error('创建新会话失败', {
            type: 'create_conversation_error',
            requestId: requestId,
            userId: req.userId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});

/**
 * 重命名会话
 * PUT /api/conversations/:conversationId
 */
router.put('/conversations/:conversationId', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        const userId = req.userId;
        const conversationId = req.params.conversationId;
        const { name } = req.body;

        // 验证参数
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                error: '会话名称不能为空'
            });
        }

        const trimmedName = name.trim();

        // 验证名称长度
        if (trimmedName.length > 50) {
            return res.status(400).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                error: '会话名称不能超过50个字符'
            });
        }

        logger.info('重命名会话请求', {
            type: 'rename_conversation_request',
            requestId: requestId,
            userId: userId,
            conversationId: conversationId,
            newName: trimmedName
        });

        // 生成用户的 Coze API 访问令牌
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(userId);
            cozeAccessToken = tokenData.access_token;
        } catch (tokenError) {
            logger.error('生成Coze API令牌失败', {
                type: 'token_generation_failed',
                requestId: requestId,
                userId: userId,
                error: tokenError.message
            });
            return res.status(500).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                error: '服务暂时不可用',
                code: 'TOKEN_GENERATION_FAILED'
            });
        }

        // 调用 cozeSDKAdapter 重命名会话
        const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
        const result = await cozeSDKAdapter.renameConversation(
            conversationId,
            trimmedName,
            cozeAccessToken
        );

        if (result.success) {
            logger.info('会话重命名成功', {
                type: 'conversation_renamed',
                requestId: requestId,
                userId: userId,
                conversationId: conversationId,
                newName: trimmedName
            });

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                message: '会话重命名成功',
                conversation: {
                    conversationId: conversationId,
                    title: trimmedName
                }
            });
        } else {
            throw new Error('重命名会话失败：返回数据格式错误');
        }

    } catch (error) {
        logger.error('重命名会话失败', {
            type: 'rename_conversation_error',
            requestId: requestId,
            userId: req.userId,
            conversationId: req.params.conversationId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message || '重命名会话失败'
        });
    }
});

/**
 * 删除会话 - 调用 Coze API 删除远程会话
 * DELETE /api/conversations/:conversationId
 */
router.delete('/conversations/:conversationId', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        const userId = req.userId;
        const conversationId = req.params.conversationId;

        logger.debug('删除会话请求', {
            type: 'delete_conversation_request',
            requestId: requestId,
            userId: userId,
            conversationId: conversationId
        });

        // 获取用户的 Coze token
        const tokenData = await jwtService.generateUserToken(userId);

        // 调用 Coze API 删除会话
        const https = require('https');
        const url = new URL(`https://api.coze.cn/v1/conversations/${conversationId}`);

        const deleteResponse = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const jsonData = data ? JSON.parse(data) : {};

                        logger.debug('Coze API删除响应', {
                            status: res.statusCode,
                            data: jsonData
                        });

                        if (res.statusCode === 200 || res.statusCode === 204 || (jsonData.code === 0)) {
                            resolve({ success: true, data: jsonData });
                        } else if (res.statusCode === 404) {
                            resolve({ success: false, notFound: true, data: jsonData });
                        } else {
                            resolve({ success: false, status: res.statusCode, data: jsonData });
                        }
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        // 同时删除本地缓存的会话
        cozeConversationManager.deleteConversation(conversationId, userId);

        // 清除 chatService 中的会话缓存（使用已创建的实例）
        chatService.clearUserConversationCache(userId);

        if (deleteResponse.success) {
            logger.info('会话删除成功', {
                type: 'conversation_deleted',
                requestId: requestId,
                userId: userId,
                conversationId: conversationId
            });

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                message: '会话删除成功',
                conversationId: conversationId
            });
        } else if (deleteResponse.notFound) {
            // 即使远程不存在，也清除本地缓存
            logger.info('会话在远程不存在，清除本地缓存', {
                type: 'conversation_not_found_clear_cache',
                requestId: requestId,
                userId: userId,
                conversationId: conversationId
            });

            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                message: '会话已删除',
                conversationId: conversationId
            });
        } else {
            logger.error('Coze API删除会话失败', {
                type: 'coze_delete_failed',
                requestId: requestId,
                status: deleteResponse.status,
                data: deleteResponse.data
            });

            res.status(500).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                error: deleteResponse.data?.msg || '远程删除失败'
            });
        }

    } catch (error) {
        logger.error('删除会话失败', {
            type: 'delete_conversation_error',
            requestId: requestId,
            userId: req.userId,
            conversationId: req.params.conversationId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});

/**
 * 会话管理状态
 * GET /api/conversations/status
 */
router.get('/conversations/status', requireLogin, (req, res) => {
    const requestId = logger.generateRequestId();

    try {
        logger.debug('获取会话管理状态', {
            type: 'conversation_status_request',
            requestId: requestId,
            userId: req.userId
        });

        const status = cozeConversationManager.getStatus();

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            conversationManager: status
        });

    } catch (error) {
        logger.error('获取会话管理状态失败', {
            type: 'conversation_status_error',
            requestId: requestId,
            userId: req.userId,
            error: error.message
        });

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            error: error.message
        });
    }
});


// 简单SSE测试端点
router.post('/test-sse', requireLogin, async (req, res) => {
    console.log('[API] 收到SSE测试请求');
    
    // 设置SSE头部
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 立即发送一条测试消息
    const testMessage = {
        event: 'message',
        answer: '这是一条测试消息',
        conversation_id: 'test-123',
        user_id: req.userId
    };

    console.log('[API] 发送测试SSE消息:', testMessage);
    
    res.write(`event: message\ndata: ${JSON.stringify(testMessage)}\n\n`);
    
    // 等待1秒后发送第二条消息
    setTimeout(() => {
        const testMessage2 = {
            event: 'message',
            answer: '这是第二条测试消息',
            conversation_id: 'test-123',
            user_id: req.userId
        };
        
        console.log('[API] 发送第二条测试SSE消息:', testMessage2);
        res.write(`event: message\ndata: ${JSON.stringify(testMessage2)}\n\n`);
        
        // 发送结束消息
        setTimeout(() => {
            const endMessage = {
                event: 'message_end',
                answer: '测试完成',
                conversation_id: 'test-123',
                user_id: req.userId
            };
            
            console.log('[API] 发送结束SSE消息:', endMessage);
            res.write(`event: message_end\ndata: ${JSON.stringify(endMessage)}\n\n`);
            res.end();
        }, 1000);
    }, 1000);
});

// 提交消息反馈端点
router.post('/feedback', requireLogin, async (req, res) => {
    const requestId = logger.generateRequestId();
    const { conversation_id, message_id, feedback_type } = req.body;

    try {
        // 验证必需参数
        if (!conversation_id || !message_id || !feedback_type) {
            return res.status(400).json({
                code: 400,
                msg: '缺少必需参数',
                detail: { requestId }
            });
        }

        // 验证反馈类型
        if (!['like', 'unlike'].includes(feedback_type)) {
            return res.status(400).json({
                code: 400,
                msg: '无效的反馈类型',
                detail: { requestId }
            });
        }

        logger.info('收到消息反馈', {
            type: 'message_feedback',
            requestId,
            userId: req.userId,
            conversationId: conversation_id,
            messageId: message_id,
            feedbackType: feedback_type
        });

        // 为当前用户生成新的 JWT token（与聊天端点保持一致）
        let cozeAccessToken;
        try {
            const tokenData = await jwtService.generateUserToken(req.userId);
            cozeAccessToken = tokenData.access_token;

            logger.info('为反馈请求生成新token', {
                type: 'feedback_token_generated',
                requestId,
                userId: req.userId,
                tokenType: tokenData.token_type,
                expiresIn: tokenData.expires_in
            });
        } catch (tokenError) {
            logger.error('生成反馈token失败', {
                type: 'feedback_token_error',
                requestId,
                userId: req.userId,
                error: tokenError.message
            });
            return res.status(500).json({
                code: 500,
                msg: '认证服务暂时不可用',
                detail: { requestId }
            });
        }

        const response = await fetch(
            `https://api.coze.cn/v1/conversations/${conversation_id}/messages/${message_id}/feedback`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cozeAccessToken}`,  // 使用后端生成的 token
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    feedback_type: feedback_type
                    // 可以根据需要添加 reason_types 和 comment
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            logger.error('Coze反馈API调用失败', {
                type: 'coze_feedback_error',
                requestId,
                status: response.status,
                error: errorData
            });

            return res.status(response.status).json({
                code: response.status,
                msg: errorData.msg || '反馈提交失败',
                detail: { requestId }
            });
        }

        const result = await response.json();

        logger.info('反馈提交成功', {
            type: 'feedback_success',
            requestId,
            result
        });

        res.json({
            code: 0,
            msg: '',
            detail: {
                requestId,
                logid: result.detail?.logid
            }
        });

    } catch (error) {
        logger.error('反馈处理失败', {
            type: 'feedback_error',
            requestId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            code: 500,
            msg: '反馈处理失败',
            detail: { requestId }
        });
    }
});

// 获取前端配置 (公开的配置信息)
router.get('/config', (req, res) => {
    const config = require('../config/config');

    // 只返回前端需要的非敏感配置
    res.json({
        corpId: config.corpId,
        agentId: config.agentId,
        // 不要返回 corpSecret 等敏感信息
    });
});

module.exports = router;
