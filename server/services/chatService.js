/**
 * Coze专用聊天服务接口
 * 专注于火山引擎Coze智能体API v3的集成
 */
const config = require('../config/config');
const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
const logger = require('../utils/logger');

/**
 * Coze专用聊天服务类
 */
class ChatService {
    /**
     * 构造函数
     */
    constructor() {
        logger.info('初始化Coze聊天服务', {
            type: 'service_init',
            service: 'ChatService'
        });

        // 使用新的Coze SDK适配器
        this.adapter = cozeSDKAdapter;

        // 添加会话缓存：userId -> conversationId
        this.conversationCache = new Map();

        // 缓存统计
        this.cacheStats = {
            hits: 0,
            misses: 0,
            creates: 0,
            errors: 0
        };

        // 记录初始化信息
        this.logInitialization();
    }
    
    /**
     * 记录初始化信息
     */
    logInitialization() {
        logger.info('Coze服务初始化完成', {
            type: 'service_init_complete',
            provider: 'coze',
            adapterType: this.adapter.constructor.name,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * 获取当前使用的AI服务提供商
     * @returns {string} 提供商名称
     */
    getProvider() {
        return 'coze';
    }

    /**
     * 获取或创建用户的单一会话
     * @param {string} userId - 用户ID
     * @param {string} accessToken - Coze访问令牌
     * @returns {Promise<string>} 会话ID
     */
    async getOrCreateConversation(userId, accessToken) {
        logger.info('===== 开始获取或创建会话 =====', {
            type: 'get_or_create_conversation_start',
            userId: userId,
            hasAccessToken: !!accessToken,
            cacheSize: this.conversationCache.size
        });

        // 1. 检查内存缓存
        if (this.conversationCache.has(userId)) {
            const cachedId = this.conversationCache.get(userId);
            this.cacheStats.hits++;

            logger.info('从缓存获取会话ID', {
                type: 'conversation_cache_hit',
                userId: userId,
                conversationId: cachedId,
                cacheSize: this.conversationCache.size,
                hitRate: this.getCacheHitRate()
            });

            return cachedId;
        }

        this.cacheStats.misses++;
        logger.info('缓存未命中，需要从API获取', {
            type: 'cache_miss',
            userId: userId,
            cacheStats: this.cacheStats
        });

        try {
            // 2. 尝试获取用户最近的会话
            logger.info('正在调用API获取会话列表...', {
                type: 'calling_conversation_list',
                userId: userId,
                botId: this.adapter.botConfig.botId
            });

            const conversations = await this.adapter.getConversationList(
                this.adapter.botConfig.botId,
                {
                    pageSize: 1,
                    sortOrder: 'desc',
                    connectorId: '1024' // API渠道
                },
                accessToken
            );

            logger.info('会话列表API响应', {
                type: 'conversation_list_response',
                userId: userId,
                success: conversations.success,
                hasConversations: !!(conversations.conversations && conversations.conversations.length > 0),
                conversationCount: conversations.conversations ? conversations.conversations.length : 0
            });

            let conversationId;

            if (conversations.success && conversations.conversations.length > 0) {
                // 3. 复用已存在的会话
                conversationId = conversations.conversations[0].id;

                logger.info('复用已存在的会话', {
                    type: 'conversation_reused',
                    userId: userId,
                    conversationId: conversationId
                });
            } else {
                // 4. 创建新会话
                this.cacheStats.creates++;

                logger.info('准备创建新会话...', {
                    type: 'creating_new_conversation',
                    userId: userId,
                    botId: this.adapter.botConfig.botId,
                    name: `${userId}_${new Date().toISOString().split('T')[0]}`
                });

                try {
                    const newConversation = await this.adapter.createConversation({
                        botId: this.adapter.botConfig.botId,
                        name: `${userId}_${new Date().toISOString().split('T')[0]}`
                        // 移除 connectorId 和 metadata，只保留必需参数
                    }, accessToken);

                    logger.info('新会话创建响应', {
                        type: 'new_conversation_response',
                        userId: userId,
                        response: newConversation,
                        hasConversationId: !!newConversation.conversationId,
                        hasId: !!newConversation.id,
                        hasConversation_id: !!newConversation.conversation_id
                    });

                    // 尝试从不同字段获取会话ID
                    conversationId = newConversation.conversationId || newConversation.id || newConversation.conversation_id;

                    if (!conversationId) {
                        throw new Error('创建会话成功但未返回会话ID');
                    }

                    logger.info('创建新会话成功', {
                        type: 'conversation_created',
                        userId: userId,
                        conversationId: conversationId
                    });
                } catch (createError) {
                    logger.error('创建会话失败', {
                        type: 'conversation_creation_failed',
                        userId: userId,
                        error: createError.message,
                        errorName: createError.name,
                        errorStatus: createError.status || createError.response?.status
                    });
                    throw createError;
                }
            }

            // 5. 更新缓存
            this.conversationCache.set(userId, conversationId);

            logger.info('会话ID已缓存', {
                type: 'conversation_cached',
                userId: userId,
                conversationId: conversationId,
                cacheSize: this.conversationCache.size,
                cacheStats: this.cacheStats
            });

            return conversationId;

        } catch (error) {
            this.cacheStats.errors++;

            logger.error('获取或创建会话失败', {
                type: 'get_or_create_conversation_error',
                userId: userId,
                error: error.message,
                stack: error.stack,
                cacheStats: this.cacheStats
            });
            throw error;
        }
    }

    /**
     * 获取缓存命中率
     * @returns {string} 命中率百分比
     */
    getCacheHitRate() {
        const total = this.cacheStats.hits + this.cacheStats.misses;
        if (total === 0) return '0%';
        return `${(this.cacheStats.hits / total * 100).toFixed(2)}%`;
    }

    /**
     * 清除用户的会话缓存
     * @param {string} userId - 用户ID
     * @returns {boolean} 是否清除成功
     */
    clearUserConversationCache(userId) {
        if (this.conversationCache.has(userId)) {
            const conversationId = this.conversationCache.get(userId);
            this.conversationCache.delete(userId);

            logger.info('清除用户会话缓存', {
                type: 'clear_user_conversation_cache',
                userId: userId,
                conversationId: conversationId,
                remainingCacheSize: this.conversationCache.size
            });

            return true;
        }
        return false;
    }

    /**
     * 获取缓存状态
     * @returns {Object} 缓存状态信息
     */
    getCacheStatus() {
        return {
            cacheSize: this.conversationCache.size,
            stats: {
                ...this.cacheStats,
                hitRate: this.getCacheHitRate()
            },
            entries: Array.from(this.conversationCache.entries()).map(([userId, convId]) => ({
                userId,
                conversationId: convId
            }))
        };
    }
    
    /**
     * 清理回答中的后端提示文案
     * 目前用于移除“已为你生成一张…的图片。”这类确认句
     * @param {string} text
     * @returns {string}
     */
    sanitizeAnswerText(text) {
        if (!text || typeof text !== 'string') return text;
        const shouldRemove = (line) => /^已为你生成一张.*?的图片。?$/.test(line.trim());
        const cleaned = text
            .split('\n')
            .filter((line) => !shouldRemove(line))
            .join('\n');
        return cleaned;
    }
    
    /**
     * Coze消息发送接口
     * @param {Object} params - 消息参数
     * @param {string} params.query - 用户消息内容
     * @param {string} userId - 从企微鉴权获取的用户ID
     * @param {Object} callbacks - 回调函数
     * @param {Function} callbacks.onMessage - 接收消息时的回调
     * @param {Function} callbacks.onEnd - 消息结束时的回调
     * @param {Function} callbacks.onError - 错误时的回调
     * @returns {Promise<Object>} 聊天响应
     */
    async sendMessage(params, userId, callbacks = {}, accessToken = null) {
        try {
            // 验证必要参数
            if (!params.query || params.query.trim() === '') {
                throw new Error('消息内容不能为空');
            }

            if (!userId) {
                throw new Error('用户ID不能为空');
            }

            // 获取或使用传入的 conversationId
            let conversationId = params.conversation_id;

            // 如果没有 conversationId，自动获取或创建
            if (!conversationId) {
                logger.info('未提供conversationId，自动获取或创建', {
                    type: 'auto_manage_conversation',
                    userId: userId
                });

                conversationId = await this.getOrCreateConversation(userId, accessToken);
            } else {
                // 如果提供了 conversationId，也缓存起来
                if (!this.conversationCache.has(userId)) {
                    this.conversationCache.set(userId, conversationId);
                    logger.info('缓存前端提供的conversationId', {
                        type: 'cache_frontend_conversation',
                        userId: userId,
                        conversationId: conversationId
                    });
                }
            }

            logger.info('[ChatService] 发送Coze消息', {
                query: params.query?.substring(0, 100) + (params.query?.length > 100 ? '...' : ''),
                userId: userId,
                conversationId: conversationId // 现在一定有值
            });
            
            // 添加服务层的回调包装，用于统一日志记录
            const wrappedCallbacks = this.wrapCallbacks(callbacks, params, userId);
            
            // 使用新的SDK适配器发送流式消息
            // 使用数组收集消息片段，避免字符串连接的性能问题
            const answerParts = [];
            let fullAnswer = '';
            let followUpQuestions = []; // 收集推荐问题
            let messageId = null; // 用于存储messageId供反馈功能使用
            let chatId = null; // 用于获取follow_up消息
            
            // 使用Promise包装回调式的sendStreamingMessage
            return new Promise(async (resolve, reject) => {
                // 添加进度消息定时器
                let progressInterval = null;
                let progressCounter = 0;
                let followUpSent = false; // 标记是否已发送 follow-up
                
                // 开始发送进度消息
                const startProgressMessages = () => {
                    progressInterval = setInterval(() => {
                        progressCounter++;
                        if (wrappedCallbacks.onMessage) {
                            wrappedCallbacks.onMessage({
                                event: 'processing',
                                message: '正在处理您的请求，请稍候...',
                                progress: progressCounter * 3, // 每3秒增加一次
                                user_id: userId
                            });
                            
                            logger.debug('[ChatService] 发送进度消息', {
                                type: 'progress_message',
                                progressSeconds: progressCounter * 3,
                                userId: userId
                            });
                        }
                    }, 3000); // 每3秒发送一次进度消息
                };
                
                // 清理进度定时器
                const clearProgressMessages = () => {
                    if (progressInterval) {
                        clearInterval(progressInterval);
                        progressInterval = null;
                        logger.debug('[ChatService] 停止进度消息', {
                            type: 'progress_stopped',
                            totalProgressSeconds: progressCounter * 3,
                            userId: userId
                        });
                    }
                };
                
                // 启动进度消息
                startProgressMessages();
                
                // Follow-up变量改为获取后立即清除，不在聊天开始时清除
                // 这样可以避免旧值持久化问题，确保每次都是最新的follow-up

                this.adapter.sendStreamingMessage({
                    conversationId: conversationId, // 现在使用获取到的conversationId
                    userId: userId,
                    query: params.query,
                    autoSaveHistory: true,
                    searchMode: params.searchMode
                }, 
                // onMessage callback
                async (chunk) => {
                    // 收到第一个实际消息时停止进度消息
                    if (progressInterval && chunk.event === 'conversation.message.delta') {
                        clearProgressMessages();
                    }
                    // logger.debug('[ChatService] 收到SDK回调:', {
                    //     event: chunk.event,
                    //     hasData: !!chunk.data,
                    //     dataKeys: chunk.data ? Object.keys(chunk.data) : [],
                    //     role: chunk.data?.role,
                    //     type: chunk.data?.type,
                    //     hasContent: !!chunk.data?.content
                    // });
                    
                    // 处理不同类型的Coze SDK事件
                    logger.debug('[ChatService] 🎯 处理事件类型:', chunk.event);
                    
                    // 捕获 chat_id
                    if (chunk.data?.chat_id) {
                        chatId = chunk.data.chat_id;
                        logger.debug('[ChatService] 捕获到 chat_id:', chatId);
                    }
                    
                    if (chunk.event === 'conversation.message.delta') {
                        // 检查是否是助手的回答内容
                        if (chunk.data && chunk.data.role === 'assistant' && chunk.data.type === 'answer' && chunk.data.content) {
                            // 对于delta事件，使用数组收集内容片段（性能优化）
                            answerParts.push(chunk.data.content);
                            fullAnswer = answerParts.join('');
                            // 统一移除后端不需要的确认文案
                            const sanitized = this.sanitizeAnswerText(fullAnswer);
                            
                            const messageResponse = {
                                event: 'message',
                                answer: sanitized, // 发送累积的完整内容
                                conversation_id: chunk.data.conversation_id || conversationId,
                                user_id: userId
                            };
                            
                            logger.debug('[ChatService] 发送累积消息响应', {
                                deltaContent: chunk.data.content,
                                fullAnswerLength: fullAnswer.length,
                                event: messageResponse.event
                            });
                            
                            if (wrappedCallbacks.onMessage) {
                                wrappedCallbacks.onMessage(messageResponse);
                            }
                        }
                    } else if (chunk.event === 'conversation.message.completed') {
                        // 检查是否是助手的回答内容
                        if (chunk.data && chunk.data.role === 'assistant' && chunk.data.type === 'answer' && chunk.data.content) {
                            // 对于completed事件，比较累积内容和完整内容，使用更长的版本
                            // 这样可以避免因为completed事件内容被截断而丢失数据
                            const completedContent = chunk.data.content;
                            const accumulatedContent = answerParts.join('');

                            // 使用更长的内容版本，避免丢失数据
                            if (completedContent.length >= accumulatedContent.length) {
                                // completed事件的内容更完整，使用它
                                answerParts.length = 0;
                                answerParts.push(completedContent);
                                fullAnswer = completedContent;
                            } else {
                                // 累积的内容更完整，保留它
                                logger.warn('[ChatService] completed事件内容比累积内容短，保留累积内容', {
                                    completedLength: completedContent.length,
                                    accumulatedLength: accumulatedContent.length
                                });
                                fullAnswer = accumulatedContent;
                            }
                            
                            const messageResponse = {
                                event: 'message',
                                answer: this.sanitizeAnswerText(fullAnswer),
                                conversation_id: chunk.data.conversation_id || conversationId,
                                user_id: userId,
                                isFinal: true // 标记为最终消息
                            };
                            
                            // 记录messageId供反馈功能使用
                            if (chunk.data && chunk.data.id) {
                                messageId = chunk.data.id;
                            }

                            console.log('[ChatService] 发送最终完整消息响应:', {
                                finalAnswerLength: fullAnswer.length,
                                event: messageResponse.event,
                                messageId: messageId
                            });
                            
                            if (wrappedCallbacks.onMessage) {
                                wrappedCallbacks.onMessage(messageResponse);
                            }
                        }
                    } else if (chunk.event === 'conversation.chat.completed') {
                        // 对话完成事件
                        if (chunk.data && chunk.data.conversation_id) {
                            conversationId = chunk.data.conversation_id;
                        }
                        
                        // 对话完成时获取chatId
                        if (chunk.data && chunk.data.id) {
                            chatId = chunk.data.id;
                            console.log('[ChatService] 对话完成，获取到chatId:', chatId);
                        }

                        // 对话完成 - follow-up questions 将在 onComplete 回调中统一处理
                        console.log('[ChatService] 对话完成事件 - follow-up 将在 onComplete 中获取');
                    }
                },
                // onError callback
                (error) => {
                    // 错误时清理进度定时器
                    clearProgressMessages();
                    
                    const errorResponse = {
                        event: 'error',
                        message: error.message || '未知错误',
                        user_id: userId
                    };
                    
                    if (wrappedCallbacks.onError) {
                        wrappedCallbacks.onError(errorResponse);
                    }
                    
                    // 发生错误时reject Promise
                    reject(new Error(error.message || '未知错误'));
                },
                // onComplete callback
                async (result) => {
                    // 完成时清理进度定时器
                    clearProgressMessages();
                    
                    // 获取最终的 follow-up questions
                    let finalFollowUpQuestions = followUpQuestions;
                    
                    // 如果还没有获取到 follow-up，再尝试一次
                    if (!finalFollowUpQuestions.length && userId && !followUpSent) {
                        console.log('[ChatService] 在 onComplete 中尝试获取 follow-up 变量');
                        try {
                            const variableResult = await this.adapter.getUserVariables(
                                userId,
                                ['follow_up_q1', 'follow_up_q2', 'follow_up_q3'],
                                accessToken
                            );
                            
                            if (variableResult.success && variableResult.followUpQuestions && variableResult.followUpQuestions.length > 0) {
                                finalFollowUpQuestions = variableResult.followUpQuestions;
                                console.log('[ChatService] 在 onComplete 中获取到 follow-up 问题:', {
                                    count: finalFollowUpQuestions.length,
                                    questions: finalFollowUpQuestions
                                });

                                // 立即清除follow-up变量，避免下次读到旧值
                                try {
                                    console.log('[ChatService] [onComplete] 开始清除follow-up变量...');
                                    const clearResult = await this.adapter.setBotVariables(
                                        this.adapter.config.botId,
                                        [
                                            { keyword: 'follow_up_q1', value: '' },
                                            { keyword: 'follow_up_q2', value: '' },
                                            { keyword: 'follow_up_q3', value: '' }
                                        ],
                                        userId,
                                        accessToken
                                    );
                                    console.log('[ChatService] [onComplete] 成功清除follow-up变量:', clearResult);
                                } catch (clearError) {
                                    console.error('[ChatService] [onComplete] 清除follow-up变量失败:', clearError.message);
                                    // 重试一次
                                    try {
                                        await this.adapter.setBotVariables(
                                            this.adapter.config.botId,
                                            [
                                                { keyword: 'follow_up_q1', value: '' },
                                                { keyword: 'follow_up_q2', value: '' },
                                                { keyword: 'follow_up_q3', value: '' }
                                            ],
                                            userId,
                                            accessToken
                                        );
                                        console.log('[ChatService] [onComplete] 重试清除成功');
                                    } catch (retryError) {
                                        console.error('[ChatService] [onComplete] 重试清除仍失败:', retryError.message);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('[ChatService] 在 onComplete 中获取变量失败:', error.message);
                        }
                    }

                    
                    // 构建包含 follow-up 的 end 响应
                    const endResponse = {
                        event: 'message_end',
                        answer: this.sanitizeAnswerText(fullAnswer),
                        conversation_id: conversationId,
                        user_id: userId,
                        message_id: messageId, // 添加消息ID用于反馈功能
                        followUpQuestions: finalFollowUpQuestions // 包含在 end 响应中
                    };
                    
                    // 发送end事件
                    if (wrappedCallbacks.onEnd) {
                        wrappedCallbacks.onEnd(endResponse);
                    }
                    
                    console.log('[ChatService] 流式响应完成:', {
                        hasAnswer: !!fullAnswer,
                        answerLength: fullAnswer.length,
                        userId: userId
                    });
                    
                    // 在onComplete回调中resolve Promise
                    const finalResult = {
                        answer: this.sanitizeAnswerText(fullAnswer),
                        user_id: userId,
                        conversation_id: conversationId
                    };
                    
                    resolve(finalResult);
                }, accessToken);
            });
            
        } catch (error) {
            console.error('[ChatService] 发送Coze消息失败:', error.message);
            
            // 统一错误处理
            const errorResponse = {
                event: 'error',
                message: `[Coze] ${error.message}`,
                user_id: userId,
                provider: 'coze'
            };
            
            if (callbacks.onError) {
                callbacks.onError(errorResponse);
            }
            
            throw error;
        }
    }
    
    /**
     * Coze语音转文字接口
     * @param {Buffer} audioBuffer - 音频文件缓冲区
     * @param {Object} options - 转换选项
     * @param {string} options.format - 音频格式
     * @param {string} options.language - 语言代码
     * @param {string} options.filename - 文件名
     * @param {string} options.contentType - 内容类型
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 转换结果
     */
    async convertSpeechToText(audioBuffer, options = {}, token = null) {
        try {
            console.log('[ChatService] 开始Coze语音转文字:', {
                audioSize: audioBuffer ? `${(audioBuffer.length / 1024).toFixed(2)}KB` : '0KB',
                format: options.format || 'unknown',
                language: options.language || 'zh-CN',
                provider: 'coze'
            });

            // 验证音频数据
            if (!audioBuffer || audioBuffer.length === 0) {
                throw new Error('音频数据为空或无效');
            }

            // 调用Coze适配器的语音转文字方法，传递token
            const result = await this.adapter.speechToText(audioBuffer, options, token);
            
            console.log('[ChatService] Coze语音转文字完成:', {
                success: result.success,
                textLength: result.text ? result.text.length : 0,
                confidence: result.confidence || 0
            });
            
            // 添加提供商信息到结果中
            return {
                ...result,
                provider: 'coze'
            };
            
        } catch (error) {
            console.error('[ChatService] Coze语音转文字失败:', error.message);
            
            return {
                success: false,
                error: `[Coze] ${error.message}`,
                text: '',
                confidence: 0,
                language: options.language || 'zh-CN',
                provider: 'coze'
            };
        }
    }
    
    /**
     * 包装回调函数，添加统一的日志记录
     * @param {Object} callbacks - 原始回调函数
     * @param {Object} params - 请求参数
     * @param {string} userId - 用户ID
     * @returns {Object} 包装后的回调函数
     */
    wrapCallbacks(callbacks, params, userId) {
        return {
            onMessage: (response) => {
                logger.debug('收到Coze消息', {
                    type: 'chat_message_received',
                    event: response.event,
                    hasAnswer: !!response.answer,
                    answerLength: response.answer ? response.answer.length : 0,
                    userId: userId
                });
                
                if (callbacks.onMessage) {
                    callbacks.onMessage(response);
                }
            },
            
            onEnd: (response) => {
                logger.info('Coze消息结束', {
                    type: 'chat_message_end',
                    event: response.event,
                    totalLength: response.answer ? response.answer.length : 0,
                    userId: response.user_id || userId,
                    followUpQuestions: response.followUpQuestions,
                    followUpCount: response.followUpQuestions?.length || 0
                });
                
                if (callbacks.onEnd) {
                    callbacks.onEnd(response);
                }
            },
            
            onError: (error) => {
                logger.error('Coze消息错误', {
                    type: 'chat_message_error',
                    event: error.event,
                    message: error.message,
                    userId: error.user_id || userId
                });
                
                if (callbacks.onError) {
                    callbacks.onError(error);
                }
            }
        };
    }

    /**
     * 重新加载适配器
     * 用于开发环境下的热重载
     */
    reloadAdapter() {
        try {
            // 重新加载 cozeSDKAdapter
            const cozeSDKAdapter = require('../utils/cozeSDKAdapter');
            if (cozeSDKAdapter.reload) {
                this.adapter = cozeSDKAdapter.reload();
                console.log('[ChatService] 适配器已重新加载');
                return true;
            } else {
                // 如果没有 reload 方法，直接重新 require
                delete require.cache[require.resolve('../utils/cozeSDKAdapter')];
                this.adapter = require('../utils/cozeSDKAdapter');
                console.log('[ChatService] 适配器已重新加载（通过清除缓存）');
                return true;
            }
        } catch (error) {
            console.error('[ChatService] 重新加载适配器失败:', error.message);
            return false;
        }
    }
    
    /**
     * 获取Coze服务健康状态
     * @returns {Promise<Object>} 健康状态信息
     */
    async getHealthStatus() {
        const startTime = Date.now();
        
        try {
            // 获取SDK适配器健康状态
            const adapterHealth = await this.adapter.healthCheck();
            
            // 获取综合性能指标
            const performanceMetrics = this.adapter.getMetrics();
            
            const duration = Date.now() - startTime;
            
            const healthStatus = {
                service: 'ChatService',
                provider: 'coze',
                adapterType: this.adapter.constructor.name,
                status: adapterHealth.status === 'healthy' ? 'healthy' : 'degraded',
                timestamp: new Date().toISOString(),
                duration: duration,
                config: {
                    hasApiKey: !!(this.adapter.sdkConfig && this.adapter.sdkConfig.token),
                    hasBotId: !!(this.adapter.botConfig && this.adapter.botConfig.botId),
                    hasWorkspaceId: !!(this.adapter.botConfig && this.adapter.botConfig.workspaceId),
                    endpoint: 'https://api.coze.cn/v3/chat',
                    streamEnabled: true
                },
                adapter: adapterHealth,
                performance: performanceMetrics
            };

            logger.logHealthStatus({
                service: 'ChatService',
                status: healthStatus.status,
                duration: duration,
                adapterStatus: adapterHealth.status
            });
            
            return healthStatus;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            logger.error('获取健康状态失败', {
                type: 'health_check_error',
                service: 'ChatService',
                error: error.message,
                stack: error.stack,
                duration: duration,
                timestamp: new Date().toISOString()
            });
            
            return {
                service: 'ChatService',
                provider: 'coze',
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                duration: duration,
                error: error.message
            };
        }
    }
    
    /**
     * 获取Bot信息，包括开场白和预置问题
     * @param {string} botId - Bot ID (可选)
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} Bot信息
     */
    async getBotInfo(botId, token = null) {
        try {
            logger.info('获取Bot信息请求', {
                type: 'get_bot_info_request',
                service: 'ChatService',
                botId: botId || 'default',
                timestamp: new Date().toISOString()
            });

            // 调用适配器的getBotInfo方法，传递token
            const result = await this.adapter.getBotInfo(botId, token);
            
            logger.info('Bot信息获取成功', {
                type: 'get_bot_info_success',
                service: 'ChatService',
                hasPrologue: !!result.onboarding?.prologue,
                suggestedQuestionsCount: result.onboarding?.suggestedQuestions?.length || 0,
                timestamp: new Date().toISOString()
            });
            
            return result;
            
        } catch (error) {
            logger.error('获取Bot信息失败', {
                type: 'get_bot_info_error',
                service: 'ChatService',
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            
            throw error;
        }
    }
}

module.exports = ChatService;