/**
 * Coze SDK 适配器
 * 基于官方 @coze/api SDK 的封装，提供统一的接口
 */

const { CozeAPI, RoleType } = require('@coze/api');
const cozeSDKConfig = require('../config/cozeSDKConfig');
const logger = require('./logger');

class CozeSDKAdapter {
    constructor() {
        this.config = cozeSDKConfig.getFullConfig();
        this.sdkConfig = cozeSDKConfig.getSDKConfig();
        this.authConfig = cozeSDKConfig.getAuthConfig();
        this.botConfig = cozeSDKConfig.getBotConfig();

        // 初始化适配器（JWT模式）
        this.initializeSDK();

        // 用户搜索模式缓存
        this.userSearchModes = new Map();  // userId -> searchMode
        
        // 统计信息
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            totalResponseTime: 0,
            lastRequestTime: null,
            lastSuccessTime: null,
            lastErrorTime: null
        };
    }

    /**
     * 创建动态SDK客户端
     * @param {string} token - 用户特定的访问令牌
     * @returns {CozeAPI} 配置好的SDK客户端实例
     */
    createClient(token) {
        if (!token) {
            throw new Error('Access token is required for API calls');
        }

        try {
            // 为每个请求创建独立的SDK客户端
            const client = new CozeAPI({
                token: token,
                baseURL: this.sdkConfig.baseURL,
                timeout: this.sdkConfig.timeout,
                // 全局错误处理
                onApiError: (error) => {
                    logger.error('Coze SDK API错误', {
                        type: 'sdk_api_error',
                        name: error.name,
                        message: error.message,
                        code: error.code,
                        status: error.status
                    });
                },
                debug: false // 关闭详细调试日志以减少输出
            });

            logger.debug('动态SDK客户端创建成功', {
                type: 'dynamic_client_created',
                baseURL: this.sdkConfig.baseURL,
                timeout: this.sdkConfig.timeout,
                authMethod: this.authConfig.type,
                tokenLength: token ? token.length : 0
            });

            return client;
        } catch (error) {
            logger.error('动态SDK客户端创建失败', {
                type: 'dynamic_client_create_error',
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * 初始化适配器（保持向后兼容）
     */
    initializeSDK() {
        logger.info('Coze SDK适配器初始化成功（JWT模式）', {
            type: 'sdk_init_success',
            baseURL: this.sdkConfig.baseURL,
            timeout: this.sdkConfig.timeout,
            authMethod: this.authConfig.type,
            mode: 'dynamic_tokens'
        });
    }

    /**
     * 创建会话 - 使用原生 API 调用 v1/conversation/create
     * @param {Object} options - 会话选项
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 会话信息
     */
    async createConversation(options = {}, token = null) {
        try {
            this.updateMetrics('start');

            // 构建会话配置，使用正确的 API 参数格式
            const conversationData = {
                bot_id: options.botId || this.botConfig.botId
            };

            // 添加可选参数
            if (options.name) {
                conversationData.name = options.name;
            }
            if (options.metadata) {
                conversationData.meta_data = options.metadata;
            }
            if (options.connectorId) {
                conversationData.connector_id = options.connectorId;
            } else {
                conversationData.connector_id = "1024"; // 默认 API 渠道
            }

            // 使用原生 HTTPS 调用正确的 API 端点
            const https = require('https');
            const url = new URL('https://api.coze.cn/v1/conversation/create');
            const postData = JSON.stringify(conversationData);

            logger.info('[CozeSDKAdapter] 创建会话请求', {
                url: url.href,
                data: conversationData,
                tokenLength: token ? token.length : 0
            });

            const response = await new Promise((resolve, reject) => {
                const req = https.request({
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const jsonData = JSON.parse(data);

                            logger.debug('创建会话API响应', {
                                status: res.statusCode,
                                code: jsonData.code,
                                msg: jsonData.msg
                            });

                            if ((res.statusCode === 200 || res.statusCode === 201) && jsonData.code === 0) {
                                resolve(jsonData);
                            } else {
                                logger.error('创建会话API返回错误', {
                                    status: res.statusCode,
                                    code: jsonData.code,
                                    msg: jsonData.msg,
                                    data: jsonData
                                });
                                reject(new Error(jsonData.msg || `API错误: ${res.statusCode}`));
                            }
                        } catch (e) {
                            logger.error('解析API响应失败', {
                                error: e.message,
                                response: data
                            });
                            reject(new Error('Invalid JSON response: ' + data));
                        }
                    });
                });

                req.on('error', (e) => {
                    logger.error('创建会话请求失败', {
                        error: e.message
                    });
                    reject(e);
                });

                req.write(postData);
                req.end();
            });

            // 检查响应
            if (!response.data || !response.data.id) {
                throw new Error('创建会话响应缺少必要数据');
            }

            this.updateMetrics('success');

            logger.info('会话创建成功', {
                type: 'conversation_created',
                conversationId: response.data.id,
                botId: conversationData.bot_id,
                lastSectionId: response.data.last_section_id
            });

            return {
                success: true,
                data: response.data,
                conversationId: response.data.id,
                lastSectionId: response.data.last_section_id
            };

        } catch (error) {
            this.updateMetrics('error');

            logger.error('会话创建失败', {
                type: 'conversation_create_error',
                error: error.message,
                botId: options.botId,
                stack: error.stack
            });

            throw this.handleSDKError(error);
        }
    }

    /**
     * 清理用户搜索模式缓存（可定期调用防止内存泄漏）
     * @param {number} maxAge - 最大缓存时间（毫秒），默认24小时
     */
    cleanupSearchModeCache(maxAge = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        // 这里简单地清理所有缓存，实际使用中可以加入时间戳判断
        if (this.userSearchModes.size > 1000) {  // 如果缓存太多，清理一半
            const entries = Array.from(this.userSearchModes.entries());
            const halfSize = Math.floor(entries.length / 2);
            this.userSearchModes = new Map(entries.slice(halfSize));
            logger.info('[CozeSDKAdapter] 清理搜索模式缓存', {
                cleanedCount: halfSize,
                remainingCount: this.userSearchModes.size
            });
        }
    }

    /**
     * 设置机器人变量
     * @param {string} botId - 机器人ID
     * @param {Array} variables - 变量数组，格式：[{keyword: 'var_name', value: 'var_value'}]
     * @param {string} userId - 用户ID
     * @param {string} token - 用户访问令牌
     * @returns {Promise<boolean>}
     */
    async setBotVariables(botId, variables, userId = 'default', token = null) {
        try {
            const axios = require('axios');
            const https = require('https');
            
            // 创建 HTTPS Agent 确保使用 HTTPS
            const httpsAgent = new https.Agent({
                rejectUnauthorized: true,
                keepAlive: true
            });
            
            // 构建符合 Coze API 规范的请求体
            const requestData = {
                bot_id: botId,
                connector_id: "1024",  // API 渠道
                connector_uid: userId,  // 用户 ID
                data: variables
            };
            
            logger.info('[CozeSDKAdapter] 使用原生 API 设置变量', {
                botId: botId,
                userId: userId,
                variables: variables
            });
            
            // 创建专用的 axios 实例，避免代理问题
            const axiosInstance = axios.create({
                httpsAgent: httpsAgent,
                proxy: false,  // 禁用代理
                timeout: this.config.timeout
            });
            
            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for setBotVariables');
            }

            // 直接调用 Coze API
            const response = await axiosInstance.put(
                `${this.config.baseURL}/v1/variables`,
                requestData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );


            // 检查响应
            if (response.data.code === 0) {
                logger.info('[CozeSDKAdapter] 变量设置成功', {
                    logid: response.data.detail?.logid
                });
                return true;
            } else {
                logger.warn('[CozeSDKAdapter] 变量设置失败', {
                    code: response.data.code,
                    msg: response.data.msg,
                    logid: response.data.detail?.logid
                });
                return false;
            }
            
        } catch (error) {
            // 详细的错误处理
            if (error.response) {
                // API 返回了错误响应
                if (error.response.status === 400) {
                    logger.debug('[CozeSDKAdapter] Bot可能未配置此变量', {
                        status: error.response.status,
                        data: error.response.data,
                        botId: botId,
                        userId: userId
                    });
                } else {
                    logger.warn('[CozeSDKAdapter] API 调用失败', {
                        status: error.response.status,
                        data: error.response.data,
                        botId: botId,
                        userId: userId
                    });
                }
            } else if (error.request) {
                // 请求发送失败
                logger.error('[CozeSDKAdapter] 请求发送失败', {
                    message: error.message
                });
            } else {
                // 其他错误
                logger.error('[CozeSDKAdapter] 设置变量时发生错误', {
                    message: error.message
                });
            }
            
            // 不抛出错误，返回 false 让调用方知道设置失败
            return false;
        }
    }

    /**
     * 发送消息（流式响应）
     * @param {Object} options - 消息选项
     * @param {Function} onMessage - 消息回调
     * @param {Function} onError - 错误回调
     * @param {Function} onComplete - 完成回调
     * @returns {Promise<void>}
     */
    async sendStreamingMessage(options, onMessage, onError, onComplete, token = null) {
        try {
            this.updateMetrics('start');

            const messageData = {
                conversation_id: options.conversationId,
                bot_id: options.botId || this.botConfig.botId,
                user_id: options.userId || 'anonymous',
                query: options.query || options.message,
                stream: true,
                auto_save_history: options.autoSaveHistory !== false,
                additional_messages: options.additionalMessages || []
            };

            // 使用SDK的流式方法

            // 构建正确的请求参数 - 使用正确的消息格式
            const streamParams = {
                conversation_id: messageData.conversation_id,
                bot_id: messageData.bot_id,
                user_id: messageData.user_id,
                query: messageData.query,
                auto_save_history: messageData.auto_save_history,
                stream: true,
                // 关键：添加additional_messages参数，这是Bot正常工作的必需参数
                additional_messages: [
                    {
                        role: 'user',
                        content: messageData.query,
                        content_type: 'text'
                    }
                ]
            };

            // 添加工作空间ID（如果配置了的话）
            if (this.botConfig.workspaceId) {
                streamParams.space_id = this.botConfig.workspaceId;
            }

            // 如果用户提供了额外的消息，合并到additional_messages中
            if (messageData.additional_messages && messageData.additional_messages.length > 0) {
                streamParams.additional_messages = [
                    ...streamParams.additional_messages,
                    ...messageData.additional_messages
                ];
            }

            // 移除undefined字段
            Object.keys(streamParams).forEach(key => {
                if (streamParams[key] === undefined) {
                    delete streamParams[key];
                }
            });
            
            // 处理搜索模式（包括缓存逻辑）
            const userId = options.userId || 'anonymous';
            const cachedMode = this.userSearchModes.get(userId);
            let searchModeToUse = options.searchMode;
            
            // 如果没有提供searchMode，尝试使用缓存的值
            if (!searchModeToUse && cachedMode) {
                searchModeToUse = cachedMode;
                logger.info('[CozeSDKAdapter] 使用缓存的searchMode', {
                    userId: userId,
                    cachedMode: searchModeToUse
                });
            }
            
            // 如果有searchMode（新提供的或缓存的），检查是否需要更新
            if (searchModeToUse) {
                // 只在模式真正改变时更新（首次或切换）
                if (searchModeToUse !== cachedMode) {
                    logger.info('[CozeSDKAdapter] 搜索模式改变，需要更新', {
                        userId: userId,
                        oldMode: cachedMode || 'NONE',
                        newMode: searchModeToUse
                    });
                    
                    // 尝试通过变量API设置搜索模式（非阻塞），即使失败也不影响对话开启
                    (async () => {
                        try {
                            const success = await this.setBotVariables(
                                streamParams.bot_id,
                                [
                                    {
                                        keyword: 'search_mode',
                                        value: searchModeToUse
                                    }
                                ],
                                userId,  // 传递用户ID
                                token    // 传递访问令牌
                            );
                            if (success) {
                                logger.info('[CozeSDKAdapter] 成功通过变量API设置搜索模式');
                            } else {
                                logger.debug('[CozeSDKAdapter] 搜索模式设置失败，继续聊天流程');
                            }
                        } catch (setBotVarError) {
                            // 变量设置失败不影响聊天功能
                            logger.debug('[CozeSDKAdapter] 变量设置出错，继续聊天流程', {
                                errorName: setBotVarError.name,
                                searchMode: searchModeToUse
                            });
                        }
                    })();
                    
                    // 更新缓存
                    this.userSearchModes.set(userId, searchModeToUse);
                    
                    logger.info('[CozeSDKAdapter] 缓存已更新', {
                        userId: userId,
                        newMode: searchModeToUse,
                        cacheSize: this.userSearchModes.size,
                        allCachedUsers: Array.from(this.userSearchModes.keys())
                    });
                } else {
                    logger.info('[CozeSDKAdapter] 搜索模式未改变，使用现有设置', {
                        userId: userId,
                        currentMode: searchModeToUse
                    });
                }
            } else {
                logger.warn('[CozeSDKAdapter] 无searchMode且无缓存，使用默认值', {
                    userId: userId
                });
            }

            logger.info('发送流式消息请求', {
                type: 'stream_request_params',
                params: streamParams,
                searchMode: options.searchMode
            });

            logger.info('[CozeSDKAdapter] 开始调用Coze SDK...');
            // 创建动态客户端并进行流式请求
            const client = this.createClient(token);
            const stream = await client.chat.stream(streamParams);
            logger.info('[CozeSDKAdapter] Coze SDK流创建成功，开始处理数据...');

            let chatId = null;
            
            try {
                for await (const chunk of stream) {

                    // 记录收到的数据块
                    // logger.debug('[CozeSDKAdapter] 收到Coze SDK数据块:', {
                    //     event: chunk.event,
                    //     hasData: !!chunk.data,
                    //     dataKeys: chunk.data ? Object.keys(chunk.data) : [],
                    //     role: chunk.data?.role,
                    //     type: chunk.data?.type,
                    //     hasContent: !!chunk.data?.content
                    // });
                    
                    // 捕获 chat_id
                    if (chunk.data?.chat_id) {
                        chatId = chunk.data.chat_id;
                        logger.debug('[CozeSDKAdapter] 捕获到 chat_id:', chatId);
                    }

                    if (onMessage) {
                        onMessage(chunk);
                    }
                }

                this.updateMetrics('success');

                if (onComplete) {
                    onComplete({ chatId });
                }

            } catch (streamError) {
                this.updateMetrics('error');

                if (onError) {
                    onError(this.handleSDKError(streamError));
                }
            }

        } catch (error) {
            this.updateMetrics('error');

            logger.error('流式消息发送失败', {
                type: 'streaming_message_error',
                error: error.message,
                conversationId: options.conversationId
            });

            if (onError) {
                onError(this.handleSDKError(error));
            }
        }
    }

    /**
     * 获取聊天消息列表（包括follow_up消息）
     * @param {string} conversationId - 会话ID
     * @param {string} chatId - 聊天ID
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 包含follow_up问题的消息列表
     */
    async getChatMessages(conversationId, chatId, token = null) {
        try {
            logger.info('[CozeSDKAdapter] 获取聊天消息列表', {
                conversationId,
                chatId
            });

            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for getChatMessages');
            }

            // 使用原生 https 模块调用 v3 API
            const https = require('https');

            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.coze.cn',
                    path: `/v3/chat/message/list?conversation_id=${conversationId}&chat_id=${chatId}`,
                    method: 'GET',
                    timeout: parseInt(process.env.COZE_TIMEOUT) || 300000, // 使用配置的超时时间
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            console.log('[CozeSDKAdapter] Chat messages API 响应:', {
                                statusCode: res.statusCode,
                                code: parsed.code,
                                msg: parsed.msg,
                                dataLength: parsed.data?.length || 0,
                                messageTypes: parsed.data?.map(m => m.type) || []
                            });
                            if (res.statusCode === 200 && parsed.code === 0) {
                                resolve(parsed);
                            } else {
                                reject(new Error(`API error: ${parsed.msg || 'Unknown error'}`));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                
                // 使用配置的超时时间，默认5分钟
                const timeout = parseInt(process.env.COZE_TIMEOUT) || 300000;
                req.setTimeout(timeout, () => {
                    req.destroy();
                    reject(new Error(`Request timeout after ${timeout/1000} seconds`));
                });
                
                req.on('error', reject);
                req.end();
            });

            // 从消息列表中提取 follow_up 类型的消息
            let followUpQuestions = [];
            if (response.data && Array.isArray(response.data)) {
                console.log('[CozeSDKAdapter] 遍历消息查找 follow_up:', {
                    totalMessages: response.data.length
                });
                
                for (const message of response.data) {
                    console.log('[CozeSDKAdapter] 检查消息:', {
                        id: message.id,
                        type: message.type,
                        role: message.role,
                        hasContent: !!message.content,
                        contentPreview: message.content ? message.content.substring(0, 100) : null
                    });
                    
                    if (message.type === 'follow_up' && message.content) {
                        try {
                            let parsedContent;
                            
                            // 首先尝试直接解析为 JSON
                            try {
                                if (typeof message.content === 'string') {
                                    parsedContent = JSON.parse(message.content);
                                } else {
                                    parsedContent = message.content;
                                }
                            } catch (jsonError) {
                                // 如果不是 JSON，可能是直接的问题文本
                                console.log('[CozeSDKAdapter] content 不是 JSON，尝试作为纯文本处理:', message.content);
                                
                                // 检查是否是问题文本
                                if (typeof message.content === 'string' && message.content.trim().length > 0) {
                                    // 只按换行符分割，不按逗号分割（保留句子完整性）
                                    const questions = message.content
                                        .split(/\n/)
                                        .map(q => q.trim())
                                        .filter(q => q.length > 0);
                                    
                                    if (questions.length > 0) {
                                        // 将新问题添加到现有列表中，而不是替换
                                        followUpQuestions.push(...questions);
                                        // console.log('[CozeSDKAdapter] 从纯文本中提取到 follow_up 问题:', {
                                        //     messageId: message.id,
                                        //     questions: questions,
                                        //     totalSoFar: followUpQuestions.length
                                        // });
                                        // 不要 break，继续处理其他 follow_up 消息
                                        continue;
                                    }
                                }
                            }
                            
                            // 如果成功解析为 JSON，查找 follow_up_questions 字段
                            if (parsedContent && parsedContent.follow_up_questions) {
                                // 将新问题添加到现有列表中
                                if (Array.isArray(parsedContent.follow_up_questions)) {
                                    followUpQuestions.push(...parsedContent.follow_up_questions);
                                } else {
                                    followUpQuestions.push(parsedContent.follow_up_questions);
                                }
                                console.log('[CozeSDKAdapter] 从 JSON 中找到 follow_up 问题:', {
                                    messageId: message.id,
                                    questions: parsedContent.follow_up_questions,
                                    totalSoFar: followUpQuestions.length
                                });
                                // 不要 break，继续处理其他 follow_up 消息
                            }
                        } catch (parseError) {
                            console.error('[CozeSDKAdapter] 处理 follow_up 内容失败:', parseError.message);
                        }
                    }
                }
            }
            
            // 输出最终收集到的所有 follow_up 问题
            if (followUpQuestions.length > 0) {
                console.log('[CozeSDKAdapter] 总共收集到 follow_up 问题:', {
                    total: followUpQuestions.length,
                    questions: followUpQuestions
                });
            }

            return {
                success: true,
                messages: response.data || [],
                followUpQuestions: followUpQuestions
            };

        } catch (error) {
            console.error('[CozeSDKAdapter] 获取聊天消息失败:', error.message);
            return {
                success: false,
                error: error.message,
                messages: [],
                followUpQuestions: []
            };
        }
    }

    /**
     * 获取用户变量值
     * @param {string} userId - 用户ID
     * @param {Array<string>} keywords - 变量名数组，默认获取 follow_up 变量
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 变量值结果
     */
    async getUserVariables(userId, keywords = ['follow_up_q1', 'follow_up_q2', 'follow_up_q3'], token = null) {
        try {
            const axios = require('axios');
            const https = require('https');
            
            // 创建 HTTPS Agent 确保使用 HTTPS
            const httpsAgent = new https.Agent({
                rejectUnauthorized: true,
                keepAlive: true
            });
            
            logger.info('[CozeSDKAdapter] 获取用户变量', {
                userId,
                keywords
            });

            // 创建专用的 axios 实例，避免代理问题
            const axiosInstance = axios.create({
                httpsAgent: httpsAgent,
                proxy: false,  // 禁用代理
                timeout: this.config.timeout || 30000
            });

            // 构建查询参数
            const params = {
                bot_id: this.config.botId,
                connector_id: '1024', // API 渠道
                connector_uid: userId,
                keywords: keywords.join(',')
            };

            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for getUserVariables');
            }
            

            // 调用 Coze API
            const response = await axiosInstance.get(
                `${this.config.baseURL}/v1/variables`,
                {
                    params: params,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('[CozeSDKAdapter] Variables API 响应:', {
                code: response.data.code,
                msg: response.data.msg,
                itemsCount: response.data.data?.items?.length || 0
            });

            // 检查响应
            if (response.data.code !== 0) {
                throw new Error(`API error: ${response.data.msg || 'Unknown error'}`);
            }

            // 提取 follow_up 变量值
            const followUpQuestions = [];
            if (response.data.data?.items && Array.isArray(response.data.data.items)) {
                console.log('[CozeSDKAdapter] 遍历用户变量:', {
                    totalItems: response.data.data.items.length
                });
                
                // 先打印所有变量看看
                console.log('[CozeSDKAdapter] 所有变量详情:');
                response.data.data.items.forEach(item => {
                    console.log('  - 变量:', {
                        keyword: item.keyword,
                        value: item.value,
                        hasValue: !!item.value,
                        valueLength: item.value ? item.value.length : 0
                    });
                });
                
                // 按照 q1, q2, q3 的顺序排序
                const sortedItems = response.data.data.items
                    .filter(item => {
                        const matches = item.keyword.startsWith('follow_up_q');
                        const hasValue = item.value && item.value.trim();
                        if (!matches) {
                            console.log(`[CozeSDKAdapter] 变量 ${item.keyword} 不匹配 follow_up_q 前缀`);
                        }
                        if (!hasValue) {
                            console.log(`[CozeSDKAdapter] 变量 ${item.keyword} 没有值或值为空`);
                        }
                        return matches && hasValue;
                    })
                    .sort((a, b) => {
                        const numA = parseInt(a.keyword.replace('follow_up_q', ''));
                        const numB = parseInt(b.keyword.replace('follow_up_q', ''));
                        return numA - numB;
                    });

                console.log(`[CozeSDKAdapter] 过滤后的 follow_up 变量数量: ${sortedItems.length}`);

                for (const item of sortedItems) {
                    console.log('[CozeSDKAdapter] 找到 follow_up 变量:', {
                        keyword: item.keyword,
                        value: item.value
                    });
                    followUpQuestions.push(item.value.trim());
                }
            }

            if (followUpQuestions.length > 0) {
                console.log('[CozeSDKAdapter] 总共收集到 follow_up 问题:', {
                    total: followUpQuestions.length,
                    questions: followUpQuestions
                });
            }

            return {
                success: true,
                followUpQuestions: followUpQuestions
            };

        } catch (error) {
            // 详细的错误处理
            if (error.response) {
                logger.error('[CozeSDKAdapter] API 返回错误', {
                    status: error.response.status,
                    data: error.response.data,
                    userId: userId
                });
            } else if (error.request) {
                logger.error('[CozeSDKAdapter] 请求失败', {
                    message: error.message,
                    userId: userId
                });
            } else {
                logger.error('[CozeSDKAdapter] 获取用户变量失败', {
                    message: error.message,
                    userId: userId
                });
            }
            
            return {
                success: false,
                error: error.message,
                followUpQuestions: []
            };
        }
    }

    /**
     * 获取会话列表 (v1/conversations API)
     * @param {string} botId - Bot ID
     * @param {Object} options - 查询选项
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 会话列表
     */
    async getConversationList(botId, options = {}, token = null) {
        try {
            this.updateMetrics('start');

            const targetBotId = botId || this.botConfig.botId;

            if (!targetBotId) {
                throw new Error('Bot ID is required');
            }

            // 使用Node.js原生https模块调用v1/conversations API
            const https = require('https');
            const queryParams = new URLSearchParams({
                bot_id: targetBotId,
                page_num: options.pageNum || 1,
                page_size: options.pageSize || 50,
                sort_order: options.sortOrder ? options.sortOrder.toLowerCase() : 'desc',
                connector_id: options.connectorId || '1024' // API渠道
            });

            logger.info('获取会话列表', {
                type: 'get_conversation_list',
                botId: targetBotId,
                params: Object.fromEntries(queryParams)
            });

            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for getConversationList');
            }

            const accessToken = token;

            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.coze.cn',
                    path: `/v1/conversations?${queryParams.toString()}`,
                    method: 'GET',
                    timeout: parseInt(process.env.COZE_TIMEOUT) || 30000,
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            if (res.statusCode === 200 && parsed.code === 0) {
                                resolve(parsed);
                            } else {
                                reject(new Error(`API error: ${parsed.msg || 'Unknown error'}`));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                req.setTimeout(30000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.on('error', reject);
                req.end();
            });

            this.updateMetrics('success');

            logger.info('会话列表获取成功', {
                type: 'conversation_list_success',
                hasMore: response.data?.has_more,
                conversationCount: response.data?.conversations?.length || 0
            });

            return {
                success: true,
                hasMore: response.data?.has_more || false,
                conversations: response.data?.conversations || [],
                total: response.data?.conversations?.length || 0
            };

        } catch (error) {
            this.updateMetrics('error');

            logger.error('获取会话列表失败', {
                type: 'get_conversation_list_error',
                error: error.message
            });

            throw this.handleSDKError(error);
        }
    }

    /**
     * 获取会话消息列表 (v1/conversation/message/list API)
     * @param {string} conversationId - 会话ID
     * @param {Object} options - 查询选项
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 消息列表
     */
    async getConversationMessages(conversationId, options = {}, token = null) {
        try {
            this.updateMetrics('start');

            // 使用Node.js原生https模块调用v1/conversation/message/list API
            const https = require('https');

            const requestData = {
                order: options.order || 'desc',
                chat_id: options.chatId,
                before_id: options.beforeId,
                after_id: options.afterId,
                limit: options.limit || 50
            };

            // 移除undefined字段
            Object.keys(requestData).forEach(key => {
                if (requestData[key] === undefined) {
                    delete requestData[key];
                }
            });

            logger.info('获取会话消息列表', {
                type: 'get_conversation_messages',
                conversationId,
                options: requestData
            });

            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for getConversationMessages');
            }

            const accessToken = token;

            const response = await new Promise((resolve, reject) => {
                const postData = JSON.stringify(requestData);

                const options = {
                    hostname: 'api.coze.cn',
                    path: `/v1/conversation/message/list?conversation_id=${conversationId}`,
                    method: 'POST',
                    timeout: parseInt(process.env.COZE_TIMEOUT) || 30000,
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            if (res.statusCode === 200 && parsed.code === 0) {
                                resolve(parsed);
                            } else {
                                reject(new Error(`API error: ${parsed.msg || 'Unknown error'}`));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                req.setTimeout(30000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            this.updateMetrics('success');

            logger.info('消息列表获取成功', {
                type: 'messages_retrieved',
                conversationId,
                messageCount: response.data?.length || 0,
                hasMore: response.has_more
            });

            return {
                success: true,
                data: response.data || [],
                hasMore: response.has_more || false,
                firstId: response.first_id,
                lastId: response.last_id,
                total: response.data?.length || 0
            };

        } catch (error) {
            this.updateMetrics('error');

            logger.error('获取会话消息失败', {
                type: 'get_conversation_messages_error',
                conversationId,
                error: error.message
            });

            throw this.handleSDKError(error);
        }
    }

    /**
     * 获取会话的第一条用户消息（用于生成会话标题）
     * @param {string} conversationId - 会话ID
     * @param {string} token - 用户访问令牌
     * @returns {Promise<string|null>} 第一条用户消息的内容，如果没有则返回null
     */
    async getFirstMessage(conversationId, token) {
        try {
            logger.debug('获取首条消息', {
                type: 'get_first_message',
                conversationId
            });

            // 调用 getConversationMessages 获取历史消息，只取10条确保能找到用户消息
            const result = await this.getConversationMessages(
                conversationId,
                {
                    limit: 10,
                    order: 'asc' // 升序，最早的在前
                },
                token
            );

            if (result.success && result.data && result.data.length > 0) {
                // 找到第一条用户消息
                const firstUserMessage = result.data.find(msg => msg.role === 'user' && msg.content && msg.type === 'answer');

                if (firstUserMessage && firstUserMessage.content) {
                    logger.debug('找到首条用户消息', {
                        conversationId,
                        contentLength: firstUserMessage.content.length
                    });
                    return firstUserMessage.content.trim();
                }
            }

            logger.debug('未找到用户消息', { conversationId });
            return null;

        } catch (error) {
            logger.error('获取首条消息失败', {
                type: 'get_first_message_error',
                conversationId,
                error: error.message
            });
            // 不抛出错误，返回null让调用者使用默认标题
            return null;
        }
    }

    /**
     * 重命名会话
     * @param {string} conversationId - 会话ID
     * @param {string} newName - 新会话名称
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 更新后的会话信息
     */
    async renameConversation(conversationId, newName, token = null) {
        try {
            this.updateMetrics('start');

            if (!conversationId) {
                throw new Error('Conversation ID is required');
            }

            if (!newName || newName.trim() === '') {
                throw new Error('Conversation name cannot be empty');
            }

            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for renameConversation');
            }

            const trimmedName = newName.trim();

            logger.info('重命名会话', {
                type: 'rename_conversation',
                conversationId,
                newName: trimmedName
            });

            // 使用Node.js原生https模块调用 PUT /v1/conversations/:id API
            const https = require('https');
            const requestData = JSON.stringify({
                name: trimmedName
            });

            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.coze.cn',
                    path: `/v1/conversations/${conversationId}`,
                    method: 'PUT',
                    timeout: parseInt(process.env.COZE_TIMEOUT) || 30000,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(requestData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);

                            logger.debug('重命名会话API响应', {
                                status: res.statusCode,
                                code: parsed.code,
                                msg: parsed.msg
                            });

                            if (res.statusCode === 200 && parsed.code === 0) {
                                resolve(parsed);
                            } else {
                                reject(new Error(parsed.msg || `API error: ${res.statusCode}`));
                            }
                        } catch (e) {
                            logger.error('解析重命名响应失败', {
                                error: e.message,
                                response: data
                            });
                            reject(new Error('Invalid JSON response: ' + data));
                        }
                    });
                });

                req.setTimeout(30000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.on('error', (e) => {
                    logger.error('重命名会话请求失败', {
                        error: e.message
                    });
                    reject(e);
                });

                req.write(requestData);
                req.end();
            });

            this.updateMetrics('success');

            logger.info('会话重命名成功', {
                type: 'rename_conversation_success',
                conversationId,
                newName: trimmedName
            });

            return {
                success: true,
                data: response.data,
                conversationId: conversationId,
                name: trimmedName
            };

        } catch (error) {
            this.updateMetrics('error');

            logger.error('重命名会话失败', {
                type: 'rename_conversation_error',
                conversationId,
                error: error.message,
                stack: error.stack
            });

            throw this.handleSDKError(error);
        }
    }

    /**
     * 获取当前用户信息
     * @returns {Promise<Object>} 用户信息
     */
    async getCurrentUser(token = null) {
        try {
            this.updateMetrics('start');

            // 创建动态客户端并获取用户信息
            const client = this.createClient(token);
            const response = await client.users.me();

            this.updateMetrics('success');

            return {
                success: true,
                data: response
            };

        } catch (error) {
            this.updateMetrics('error');
            throw this.handleSDKError(error);
        }
    }

    /**
     * 获取Bot信息，包括开场白和预置问题
     * @param {string} botId - Bot ID (可选，默认使用配置的botId)
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} Bot信息
     */
    async getBotInfo(botId, token = null) {
        try {
            this.updateMetrics('start');

            const targetBotId = botId || this.botConfig.botId;
            
            if (!targetBotId) {
                throw new Error('Bot ID is required');
            }

            logger.info('获取Bot信息', {
                type: 'get_bot_info_start',
                botId: targetBotId
            });

            // 使用Node.js原生https模块调用API，避免axios的proxy问题
            const https = require('https');
            
            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for getBotInfo');
            }

            logger.info('调用Coze v1 API获取Bot信息', {
                type: 'coze_v1_api_call',
                botId: targetBotId,
                hasToken: !!token
            });

            try {
                const response = await new Promise((resolve, reject) => {
                    const options = {
                        hostname: 'api.coze.cn',
                        path: `/v1/bots/${targetBotId}`,
                        method: 'GET',
                        timeout: parseInt(process.env.COZE_TIMEOUT) || 300000, // 使用配置的超时时间，默认5分钟
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    };
                    
                    const req = https.request(options, (res) => {
                        let data = '';
                        
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                if (res.statusCode === 200 && parsed.code === 0) {
                                    resolve(parsed.data);
                                } else {
                                    reject(new Error(`API error: ${parsed.msg || 'Unknown error'}`));
                                }
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                    
                    // Set timeout handler
                    const timeout = parseInt(process.env.COZE_TIMEOUT) || 300000;
                    req.setTimeout(timeout, () => {
                        req.destroy();
                        reject(new Error(`Request timeout after ${timeout/1000} seconds`));
                    });
                    
                    req.on('error', reject);
                    req.end();
                });
                
                logger.info('Coze v1 API响应成功', {
                    type: 'coze_v1_api_success',
                    botId: targetBotId,
                    hasOnboarding: !!response.onboarding_info
                });

                this.updateMetrics('success');

                logger.info('Bot信息获取成功', {
                    type: 'get_bot_info_success',
                    botId: targetBotId,
                    hasPrologue: !!response.onboarding_info?.prologue,
                    suggestedQuestionsCount: response.onboarding_info?.suggested_questions?.length || 0
                });

                return {
                    success: true,
                    botId: response.bot_id,
                    name: response.name,
                    description: response.description,
                    iconUrl: response.icon_url,
                    onboarding: {
                        prologue: response.onboarding_info?.prologue || '',
                        suggestedQuestions: response.onboarding_info?.suggested_questions || []
                    },
                    prompt: response.prompt_info?.prompt || ''
                };
            } catch (apiError) {
                // 记录API调用错误信息
                logger.error('Coze API调用失败', {
                    type: 'coze_api_error',
                    error: apiError.message,
                    botId: targetBotId
                });
                throw apiError;
            }

        } catch (error) {
            this.updateMetrics('error');

            logger.error('获取Bot信息失败', {
                type: 'get_bot_info_error',
                botId: botId || this.botConfig.botId,
                error: error.message,
                stack: error.stack
            });

            throw this.handleSDKError(error);
        }
    }

    /**
     * 处理SDK错误
     * @param {Error} error - 原始错误
     * @returns {Error} 处理后的错误
     */
    handleSDKError(error) {
        // 根据SDK的错误类型进行分类处理
        if (error instanceof CozeAPI.BadRequestError) {
            return {
                type: 'bad_request_error',
                name: error.name,
                message: error.message,
                code: error.code,
                status: error.status,
                retryable: false
            };
        }

        if (error instanceof CozeAPI.AuthenticationError) {
            return {
                type: 'authentication_error',
                name: error.name,
                message: error.message,
                code: error.code,
                status: error.status,
                retryable: false
            };
        }

        if (error instanceof CozeAPI.PermissionDeniedError) {
            return {
                type: 'permission_denied_error',
                name: error.name,
                message: error.message,
                code: error.code,
                status: error.status,
                retryable: false
            };
        }

        if (error instanceof CozeAPI.NotFoundError) {
            return {
                type: 'not_found_error',
                name: error.name,
                message: error.message,
                code: error.code,
                status: error.status,
                retryable: false
            };
        }

        if (error instanceof CozeAPI.APIError) {
            return {
                type: 'api_error',
                name: error.name,
                message: error.message,
                code: error.code,
                status: error.status,
                retryable: error.status >= 500 || error.status === 429
            };
        }

        // 网络错误等其他错误
        return {
            type: 'unknown_error',
            message: error.message,
            stack: error.stack,
            retryable: true
        };
    }

    /**
     * 更新统计指标
     * @param {string} type - 指标类型
     */
    updateMetrics(type) {
        const now = Date.now();
        
        switch (type) {
            case 'start':
                this.metrics.totalRequests++;
                this.metrics.lastRequestTime = now;
                break;
            case 'success':
                this.metrics.successfulRequests++;
                this.metrics.lastSuccessTime = now;
                if (this.metrics.lastRequestTime) {
                    const responseTime = now - this.metrics.lastRequestTime;
                    this.metrics.totalResponseTime += responseTime;
                    this.metrics.averageResponseTime = 
                        this.metrics.totalResponseTime / this.metrics.successfulRequests;
                }
                break;
            case 'error':
                this.metrics.failedRequests++;
                this.metrics.lastErrorTime = now;
                break;
        }
    }

    /**
     * 获取统计指标
     * @returns {Object} 统计信息
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalRequests > 0 
                ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
                : '0%',
            errorRate: this.metrics.totalRequests > 0
                ? (this.metrics.failedRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
                : '0%',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 健康检查
     * @returns {Promise<Object>} 健康状态
     */
    async healthCheck() {
        try {
            const startTime = Date.now();
            await this.getCurrentUser();
            const responseTime = Date.now() - startTime;

            return {
                healthy: true,
                responseTime,
                timestamp: new Date().toISOString(),
                metrics: this.getMetrics()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                metrics: this.getMetrics()
            };
        }
    }

    /**
     * 语音转文字
     * @param {Buffer} audioBuffer - 音频数据
     * @param {Object} options - 选项
     * @param {string} token - 用户访问令牌
     * @returns {Promise<Object>} 转换结果
     */
    async speechToText(audioBuffer, options = {}, token = null) {
        try {
            console.log('[CozeSDKAdapter] 开始Coze语音转文字:', {
                audioSize: audioBuffer ? `${(audioBuffer.length / 1024).toFixed(2)}KB` : '0KB',
                format: options.format || 'unknown',
                language: options.language || 'zh-CN'
            });

            // 验证音频数据
            if (!audioBuffer || audioBuffer.length === 0) {
                throw new Error('音频数据为空或无效');
            }

            // 创建FormData用于文件上传
            const FormData = require('form-data');
            const formData = new FormData();
            
            // 添加音频文件 - Coze接口要求字段名为 'file'
            // 处理音频格式，确保 Coze 支持
            const audioFormat = this.normalizeAudioFormat(options.format || 'mp3');
            const filename = `audio_${Date.now()}.${audioFormat}`;
            
            // 验证文件大小限制 (Coze 限制: 512 MB)
            const maxSize = 512 * 1024 * 1024; // 512 MB
            if (audioBuffer.length > maxSize) {
                throw new Error(`音频文件过大: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB，Coze限制最大512MB`);
            }
            
            // 根据Coze API错误提示，字段名应该是 'file'
            formData.append('file', audioBuffer, {
                filename: filename,
                contentType: this.getAudioContentType(audioFormat)
            });

            console.log('[CozeSDKAdapter] 音频文件信息:', {
                filename: filename,
                format: audioFormat,
                contentType: this.getAudioContentType(audioFormat),
                size: `${(audioBuffer.length / 1024).toFixed(2)}KB`,
                cozeSupported: ['ogg', 'mp3', 'wav'].includes(audioFormat)
            });

            console.log('[CozeSDKAdapter] 发送语音识别请求到Coze...');

            // 确保必须提供token
            if (!token) {
                throw new Error('Access token is required for speechToText');
            }

            // 发送语音识别请求到Coze接口
            const axios = require('axios');
            const https = require('https');

            // 创建 HTTPS Agent 确保使用 HTTPS
            const httpsAgent = new https.Agent({
                rejectUnauthorized: true,
                keepAlive: true
            });

            // 创建专用的 axios 实例，避免代理问题
            const axiosInstance = axios.create({
                httpsAgent: httpsAgent,
                proxy: false, // 禁用代理
                timeout: parseInt(process.env.COZE_TIMEOUT) || 300000, // 使用配置的超时时间
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });

            const response = await axiosInstance.post('https://api.coze.cn/v1/audio/transcriptions', formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...formData.getHeaders()
                }
            });

            console.log('[CozeSDKAdapter] 收到Coze响应:', {
                status: response.status,
                hasData: !!response.data,
                responseData: response.data
            });

            // 处理Coze API响应
            return this.processCozeSpeechRecognitionResponse(response.data, options.language || 'zh-CN');

        } catch (error) {
            console.error('[CozeSDKAdapter] Coze语音转文字失败:', error.message);
            
            // 获取更详细的错误信息
            let detailedError = error.message;
            if (error.response) {
                console.error('[CozeSDKAdapter] HTTP错误详情:', {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                });
                detailedError = `HTTP ${error.response.status}: ${error.response.statusText}`;
                if (error.response.data && error.response.data.msg) {
                    detailedError += ` - ${error.response.data.msg}`;
                }
            }
            
            return {
                success: false,
                error: `[Coze] ${detailedError}`,
                text: '',
                confidence: 0,
                language: options.language || 'zh-CN',
                provider: 'coze'
            };
        }
    }

    /**
     * 标准化音频格式，确保 Coze 接口支持
     * @param {string} format - 原始音频格式
     * @returns {string} 标准化后的格式
     */
    normalizeAudioFormat(format) {
        // Coze 语音转文字接口只支持 ogg、mp3 和 wav 格式
        const formatMap = {
            'audio/webm': 'wav',  // webm 转换为 wav，因为 Coze 不支持 webm
            'audio/mp3': 'mp3',
            'audio/wav': 'wav',
            'audio/ogg': 'ogg',
            'audio/opus': 'wav',  // opus 转换为 wav
            'webm': 'wav',        // webm 转换为 wav
            'mp3': 'mp3',
            'wav': 'wav',
            'ogg': 'ogg',
            'opus': 'wav'         // opus 转换为 wav
        };
        
        const normalized = formatMap[format.toLowerCase()];
        if (!normalized) {
            console.warn(`[CozeSDKAdapter] 不支持的音频格式: ${format}，使用默认格式 wav`);
            return 'wav';
        }
        
        console.log(`[CozeSDKAdapter] 音频格式转换: ${format} -> ${normalized} (Coze支持: ogg, mp3, wav)`);
        return normalized;
    }

    /**
     * 获取音频文件的Content-Type
     * @param {string} format - 音频格式
     * @returns {string} Content-Type
     */
    getAudioContentType(format) {
        // Coze 语音转文字接口只支持 ogg、mp3 和 wav 格式
        const contentTypes = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg'
        };
        
        const contentType = contentTypes[format.toLowerCase()];
        if (!contentType) {
            console.warn(`[CozeSDKAdapter] 不支持的音频格式: ${format}，使用默认 Content-Type: audio/wav`);
            return 'audio/wav';
        }
        
        return contentType;
    }

    /**
     * 处理Coze语音转文字API响应
     * @param {Object} responseData - Coze API响应数据
     * @param {string} language - 语言代码
     * @returns {Object} 处理后的识别结果
     */
    processCozeSpeechRecognitionResponse(responseData, language) {
        try {
            console.log('[CozeSDKAdapter] 处理Coze语音识别响应:', {
                hasResult: !!responseData,
                code: responseData?.code,
                msg: responseData?.msg,
                data: responseData?.data
            });
            
            // 检查API调用是否成功
            if (!responseData) {
                throw new Error('Coze语音识别API返回空响应');
            }
            
            // Coze API成功响应格式检查 (code: 0 表示成功)
            if (responseData.code !== 0) {
                throw new Error(`Coze语音识别API错误: ${responseData.msg || '未知错误'} (错误码: ${responseData.code})`);
            }
            
            // 提取识别结果
            let recognizedText = '';
            let confidence = 1.0; // Coze接口默认置信度为1.0
            
            if (responseData.data && typeof responseData.data.text === 'string') {
                recognizedText = responseData.data.text;
                
                if (recognizedText) {
                    console.log('[CozeSDKAdapter] 语音识别成功:', {
                        text: recognizedText,
                        textLength: recognizedText.length,
                        language: language
                    });
                } else {
                    // 空文本也是合法的响应，可能是没有识别到清晰的语音
                    console.log('[CozeSDKAdapter] 语音识别返回空文本，可能未识别到清晰语音');
                }
            }
            
            // 无论文本是否为空，都返回成功（因为API调用本身是成功的）
            return {
                success: true,
                text: recognizedText,
                confidence: recognizedText ? confidence : 0, // 空文本时置信度为0
                language: language,
                provider: 'coze',
                logId: responseData.detail?.logid || null
            };
            
        } catch (error) {
            console.error('[CozeSDKAdapter] 处理Coze语音识别响应失败:', error.message);
            
            return {
                success: false,
                error: `[Coze] ${error.message}`,
                text: '',
                confidence: 0,
                language: language,
                provider: 'coze'
            };
        }
    }

    /**
     * 清除模块缓存并重新加载
     * 用于开发环境下的热重载
     */
    static reload() {
        // 清除 require 缓存
        delete require.cache[require.resolve('./cozeSDKAdapter')];
        
        // 重新创建实例
        const newAdapter = new CozeSDKAdapter();
        
        // 更新全局实例
        Object.assign(cozeSDKAdapter, newAdapter);
        
        console.log('[CozeSDKAdapter] 模块已重新加载');
        
        return cozeSDKAdapter;
    }
}

// 创建全局实例
const cozeSDKAdapter = new CozeSDKAdapter();

module.exports = cozeSDKAdapter;