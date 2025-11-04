// public/js/cozeClient.js
// 初始化 Coze 客户端
const cozeClient = {
    // 通过代理服务器访问Coze API
    apiEndpoint: '/api/chat',
    
    // 连接状态监控
    connectionStatus: {
        isOnline: navigator.onLine,
        lastSuccessTime: null,
        consecutiveFailures: 0,
        totalRequests: 0,
        successfulRequests: 0
    },

    // EventSource连接管理
    eventSourceManager: {
        activeConnections: new Map(),
        reconnectAttempts: new Map(),
        maxReconnectAttempts: 3,
        reconnectDelay: [1000, 2000, 5000], // 递增延迟
        
        /**
         * 创建EventSource连接
         */
        createConnection: function(url, requestId, callbacks) {
            console.log('[EventSourceManager] 创建新连接:', { url, requestId });
            
            const eventSource = new EventSource(url);
            this.activeConnections.set(requestId, eventSource);
            this.reconnectAttempts.set(requestId, 0);
            
            return eventSource;
        },
        
        /**
         * 清理连接
         */
        cleanupConnection: function(requestId) {
            console.log('[EventSourceManager] 清理连接:', requestId);
            
            const eventSource = this.activeConnections.get(requestId);
            if (eventSource) {
                eventSource.close();
                this.activeConnections.delete(requestId);
            }
            this.reconnectAttempts.delete(requestId);
        },
        
        /**
         * 尝试重连 - 禁用自动重连，避免重复请求
         */
        attemptReconnect: function(url, requestId, callbacks) {
            console.log('[EventSourceManager] 连接断开，不进行自动重连以避免重复请求');
            
            // 不进行自动重连，让上层处理决定如何处理连接断开
            // Pass additional info to indicate this is a normal closure, not an error
            callbacks.onError(new Error('EventSource连接已关闭'), { 
                isNormalClosure: true, 
                readyState: EventSource.CLOSED 
            });
            return false;
        },
        
        /**
         * 设置事件处理器
         */
        setupEventHandlers: function(eventSource, url, requestId, callbacks) {
            const self = this;
            
            eventSource.onopen = (event) => {
                console.log('[EventSourceManager] 连接已建立:', requestId);
                callbacks.onStart();
            };
            
            // 默认的message事件处理器
            eventSource.onmessage = (event) => {
                callbacks.onMessage(event);
            };
            
            // 添加自定义事件监听器
            // 监听心跳事件
            eventSource.addEventListener('heartbeat', (event) => {
                console.log('[EventSourceManager] 💓 收到heartbeat事件:', {
                    requestId,
                    data: event.data,
                    timestamp: new Date().toISOString()
                });
                // 将heartbeat事件传递给onMessage处理
                callbacks.onMessage(event);
            });
            
            // 监听processing事件
            eventSource.addEventListener('processing', (event) => {
                console.log('[EventSourceManager] ⏳ 收到processing事件:', {
                    requestId,
                    data: event.data
                });
                callbacks.onMessage(event);
            });
            
            // 监听message事件（自定义的message事件）
            eventSource.addEventListener('message', (event) => {
                console.log('[EventSourceManager] 📩 收到message事件:', {
                    requestId,
                    dataLength: event.data ? event.data.length : 0
                });
                callbacks.onMessage(event);
            });
            
            // 监听done事件
            eventSource.addEventListener('done', (event) => {
                console.log('[EventSourceManager] ✅ 收到done事件:', {
                    requestId,
                    data: event.data
                });
                callbacks.onMessage(event);
            });
            
            // 监听error事件（自定义的error事件）
            eventSource.addEventListener('error', (event) => {
                console.log('[EventSourceManager] ❌ 收到error事件:', {
                    requestId,
                    data: event.data
                });
                callbacks.onMessage(event);
            });
            
            // 监听message_end事件
            eventSource.addEventListener('message_end', (event) => {
                console.log('[EventSourceManager] 🏁 收到message_end事件:', {
                    requestId,
                    data: event.data
                });
                callbacks.onMessage(event);
            });
            
            // 监听connected事件
            eventSource.addEventListener('connected', (event) => {
                console.log('[EventSourceManager] 🔗 收到connected事件:', {
                    requestId,
                    data: event.data
                });
                callbacks.onMessage(event);
            });
            
            // 错误处理（系统错误）
            eventSource.onerror = (event) => {
                console.error('[EventSourceManager] 连接错误:', { 
                    requestId, 
                    readyState: eventSource.readyState,
                    eventType: event.type,
                    target: event.target
                });
                
                // Check if this is a normal closure (readyState 2) after successful data transmission
                // or an actual connection error (readyState 0 or other error states)
                const isNormalClosure = eventSource.readyState === EventSource.CLOSED;
                const errorMessage = isNormalClosure ? 
                    'EventSource连接已正常关闭' : 
                    'EventSource连接错误';
                
                // 不要立即清理连接，让上层处理器决定何时关闭
                // self.cleanupConnection(requestId);
                
                // Pass connection state info to upper layer for better error handling
                callbacks.onError(new Error(errorMessage), { 
                    isNormalClosure,
                    readyState: eventSource.readyState 
                });
            };
        },
        
        /**
         * 获取连接状态
         */
        getConnectionStatus: function() {
            return {
                activeConnections: this.activeConnections.size,
                connectionIds: Array.from(this.activeConnections.keys()),
                reconnectAttempts: Object.fromEntries(this.reconnectAttempts)
            };
        }
    },

    /**
     * 初始化网络状态监听
     */
    initNetworkMonitoring: function() {
        // 存储事件处理器引用以便后续清理
        this.networkHandlers = {
            online: () => {
                this.connectionStatus.isOnline = true;
                console.log('网络连接已恢复');
            },
            offline: () => {
                this.connectionStatus.isOnline = false;
                console.log('网络连接已断开');
            }
        };
        
        // 监听网络状态变化
        window.addEventListener('online', this.networkHandlers.online);
        window.addEventListener('offline', this.networkHandlers.offline);
    },
    
    /**
     * 清理网络监听器（防止内存泄漏）
     */
    cleanupNetworkMonitoring: function() {
        if (this.networkHandlers) {
            window.removeEventListener('online', this.networkHandlers.online);
            window.removeEventListener('offline', this.networkHandlers.offline);
            this.networkHandlers = null;
        }
    },

    /**
     * 检查网络连接状态
     */
    checkNetworkStatus: function() {
        if (!navigator.onLine) {
            throw new Error('网络连接已断开，请检查网络后重试');
        }
    },

    /**
     * 更新连接统计
     */
    updateConnectionStats: function(success) {
        this.connectionStatus.totalRequests++;
        
        if (success) {
            this.connectionStatus.successfulRequests++;
            this.connectionStatus.lastSuccessTime = Date.now();
            this.connectionStatus.consecutiveFailures = 0;
        } else {
            this.connectionStatus.consecutiveFailures++;
        }
    },

    /**
     * 获取连接健康状态
     */
    getConnectionHealth: function() {
        const total = this.connectionStatus.totalRequests;
        const successful = this.connectionStatus.successfulRequests;
        const successRate = total > 0 ? (successful / total) * 100 : 100;
        
        return {
            isOnline: this.connectionStatus.isOnline,
            successRate: successRate.toFixed(1),
            consecutiveFailures: this.connectionStatus.consecutiveFailures,
            lastSuccessTime: this.connectionStatus.lastSuccessTime,
            status: successRate > 80 && this.connectionStatus.consecutiveFailures < 3 ? 'healthy' : 'degraded'
        };
    },

    // Token 管理已移至后端
    // 前端不再管理 Coze API token
    // 所有需要 token 的 API 调用都由后端自行生成

    /**
     * 获取用户ID
     * @returns {string} 用户ID
     */
    getUserId: function () {
        // 优先从localStorage获取
        let userId = localStorage.getItem('userId');

        // 如果没有，尝试从URL参数获取
        if (!userId) {
            const urlParams = new URLSearchParams(window.location.search);
            userId = urlParams.get('userId');

            if (userId) {
                localStorage.setItem('userId', userId);
            }
        }

        // 如果还是没有，生成一个临时ID
        if (!userId) {
            userId = 'guest-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('userId', userId);
        }

        return userId;
    },


    /**
     * 获取用户身份token (用于后端认证)
     * @returns {string|null} 用户身份token
     */
    getUserToken: function() {
        // 优先从localStorage获取
        let token = localStorage.getItem('userToken');

        // 如果没有token，尝试从URL参数获取
        if (!token) {
            const urlParams = new URLSearchParams(window.location.search);
            token = urlParams.get('token');

            // 如果从URL获取到token，保存到localStorage
            if (token) {
                localStorage.setItem('userToken', token);
            }
        }

        return token;
    },


    /**
     * 发送聊天消息 - 使用EventSource替代fetch+ReadableStream
     * @param {Object} params - 请求参数
     * @param {string} params.query - 用户查询内容
     * @param {string} params.user - 用户ID
     * @param {Object} params.inputs - 额外输入参数
     * @param {string} params.conversation_id - 会话ID(可选)
     * @param {function} callbacks - 回调函数对象
     * @returns {Promise} - 请求Promise
     */
    sendChatMessage: async function (params, callbacks = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                // 检查网络状态
                this.checkNetworkStatus();
                
                // 默认回调函数
                const defaultCallbacks = {
                    onStart: () => {},
                    onToken: (token) => {},
                    onMessage: (message) => {},
                    onError: (error) => {},
                    onFinish: (message) => {}
                };

                // 合并回调
                const cb = { ...defaultCallbacks, ...callbacks };

                // 构建请求体
                const requestBody = {
                    query: params.query,
                    user: params.user,
                    inputs: params.inputs || {},
                    response_mode: 'streaming'
                };

                // 如果有会话ID，添加到请求中
                if (params.conversation_id) {
                    requestBody.conversation_id = params.conversation_id;
                }

                // 获取用户身份token（用于后端认证）
                const userToken = this.getUserToken();

                // 构建SSE URL，将请求参数作为查询参数
                const sseUrl = new URL(this.apiEndpoint, window.location.origin);
                sseUrl.searchParams.set('query', requestBody.query);
                sseUrl.searchParams.set('user', requestBody.user);
                sseUrl.searchParams.set('response_mode', 'streaming');

                if (requestBody.conversation_id) {
                    sseUrl.searchParams.set('conversation_id', requestBody.conversation_id);
                }

                if (requestBody.inputs) {
                    sseUrl.searchParams.set('inputs', JSON.stringify(requestBody.inputs));
                }

                // 添加searchMode参数（如果存在）
                if (params.searchMode) {
                    sseUrl.searchParams.set('searchMode', params.searchMode);
                }

                // EventSource不支持自定义请求头，所以通过查询参数传递用户身份token
                // 后端会使用用户身份来获取相应的Coze API token
                if (userToken) {
                    sseUrl.searchParams.set('authorization', `Bearer ${userToken}`);
                }

                console.log('[CozeClient] 🚀 创建EventSource连接:', {
                    url: sseUrl.toString(),
                    hasUserToken: !!userToken,
                    conversationId: requestBody.conversation_id
                });

                // 生成请求ID用于连接管理
                const requestId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
                
                let fullAnswer = '';
                let hasReceivedData = false;
                let connectionStartTime = Date.now();
                let savedFollowUpQuestions = null; // 保存message事件中的follow-up questions
                let isFinished = false;

                // 设置超时处理 - 改为5分钟，并支持心跳重置
                let timeoutId = null;
                const resetTimeout = () => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    timeoutId = setTimeout(() => {
                        if (!isFinished) {
                            console.warn('[CozeClient] ⏰ EventSource连接超时（5分钟）');
                            this.eventSourceManager.cleanupConnection(requestId);
                            cb.onError(new Error('请求超时，请检查网络连接后重试'));
                            reject(new Error('请求超时'));
                        }
                    }, 300000); // 5分钟超时，支持长时间思考
                    console.log('[CozeClient] ⏱️ 超时计时器已重置，下次超时时间:', new Date(Date.now() + 300000).toISOString());
                };
                
                // 初始化超时计时器
                resetTimeout()

                // 定义事件处理回调
                const eventCallbacks = {
                    onStart: () => {
                        console.log('[CozeClient] ✅ EventSource连接已建立:', {
                            requestId: requestId,
                            connectionTime: Date.now() - connectionStartTime
                        });
                        
                        cb.onStart();
                        
                        // 10秒后如果还没收到数据，显示等待提示
                        setTimeout(() => {
                            if (!hasReceivedData && !isFinished) {
                                console.log('[CozeClient] ⏳ 10秒后仍未收到数据，可能需要耐心等待');
                            }
                        }, 10000);
                    },
                    
                    onMessage: (event) => {
                        hasReceivedData = true;
                        
                        console.log('[CozeClient] 📨 收到SSE消息:', {
                            data: event.data,
                            dataLength: event.data ? event.data.length : 0,
                            dataPreview: event.data ? event.data.substring(0, 200) + '...' : 'null',
                            timestamp: new Date().toISOString()
                        });

                        try {
                            // 跳过心跳包和空消息
                            if (!event.data || event.data.trim() === '' || event.data === '[DONE]') {
                                console.log('[CozeClient] 💓 跳过心跳包或空消息');
                                return;
                            }

                            const data = JSON.parse(event.data);
                            console.log('[CozeClient] 📦 解析SSE数据成功:', {
                                event: data.event,
                                hasAnswer: !!data.answer,
                                answerLength: data.answer ? data.answer.length : 0,
                                answerPreview: data.answer ? data.answer.substring(0, 100) + '...' : 'null',
                                conversationId: data.conversation_id,
                                fullData: data
                            });

                            // 根据事件类型处理数据
                            if (data.event) {
                                console.log('[CozeClient] 🎯 处理事件类型:', data.event);
                                switch (data.event) {
                                    case 'connected':
                                        console.log('[CozeClient] 🔗 收到连接确认');
                                        break;
                                    
                                    case 'heartbeat':
                                        console.log('[CozeClient] 💓 收到心跳消息', {
                                            timestamp: new Date().toISOString(),
                                            data: data
                                        });
                                        // 重置cozeClient的超时计时器
                                        resetTimeout();
                                        // 收到心跳时，可以触发一个回调来重置前端超时
                                        if (cb.onHeartbeat) {
                                            console.log('[CozeClient] 调用 onHeartbeat 回调');
                                            cb.onHeartbeat();
                                        }
                                        break;
                                        
                                    case 'message':
                                        console.log('[CozeClient] 💬 处理message事件', {
                                            hasFollowUp: !!data.followUpQuestions,
                                            isFollowUp: data.isFollowUp,
                                            followUpCount: data.followUpQuestions?.length || 0
                                        });
                                        
                                        if (data.answer) {
                                            fullAnswer = data.answer;
                                            console.log('[CozeClient] 🔄 调用onToken回调:', {
                                                answer: data.answer.substring(0, 100) + '...',
                                                fullAnswerLength: fullAnswer.length
                                            });
                                            cb.onToken(data.answer);
                                            cb.onMessage(fullAnswer);
                                        }

                                        // 保存会话ID
                                        if (data.conversation_id) {
                                            this.conversationId = data.conversation_id;
                                        }
                                        
                                        // 如果这个message包含follow-up questions，保存它们但不结束连接
                                        if (data.followUpQuestions && data.followUpQuestions.length > 0) {
                                            console.log('[CozeClient] 🎯 在message中发现follow-up questions，保存备用:', data.followUpQuestions);
                                            // 保存follow-up questions，但继续处理流
                                            savedFollowUpQuestions = data.followUpQuestions;
                                        }
                                        break;

                                    case 'message_end':
                                        console.log('[CozeClient] 🏁 处理message_end事件，原始data:', data);
                                        console.log('[CozeClient] 🏁 followUpQuestions详情:', {
                                            hasFollowUpQuestions: !!data.followUpQuestions,
                                            followUpCount: data.followUpQuestions?.length || 0,
                                            followUpQuestions: data.followUpQuestions,
                                            savedFollowUpQuestions: savedFollowUpQuestions,
                                            dataKeys: Object.keys(data)
                                        });
                                        
                                        // 如果 message_end 中包含 answer，更新 fullAnswer（可能包含完整的图片链接等）
                                        if (data.answer) {
                                            console.log('[CozeClient] 🏁 message_end中包含answer，更新fullAnswer', {
                                                oldLength: fullAnswer.length,
                                                newLength: data.answer.length,
                                                hasImage: data.answer.includes('![')
                                            });
                                            fullAnswer = data.answer;
                                        }
                                        
                                        isFinished = true;
                                        clearTimeout(timeoutId);

                                        // 延迟关闭连接，给服务端更多时间完成后续操作（如获取follow-up questions）
                                        setTimeout(() => {
                                            console.log('[CozeClient] 延迟关闭SSE连接:', requestId);
                                            this.eventSourceManager.cleanupConnection(requestId);
                                        }, 2000); // 延迟2秒关闭
                                        
                                        // 优先使用 message_end 中的 followUpQuestions，如果没有则使用之前保存的
                                        const finalFollowUpQuestions = data.followUpQuestions || savedFollowUpQuestions || [];

                                        const result = {
                                            answer: fullAnswer,
                                            conversation_id: data.conversation_id || this.conversationId,
                                            message_id: data.message_id, // 添加消息ID
                                            followUpQuestions: finalFollowUpQuestions
                                        };

                                        console.log('[CozeClient] 准备调用 onFinish，result:', {
                                            answerLength: result.answer?.length || 0,
                                            hasAnswer: !!result.answer,
                                            answerPreview: result.answer?.substring(0, 200),
                                            conversationId: result.conversation_id,
                                            messageId: result.message_id
                                        });
                                        cb.onFinish(result);
                                        this.updateConnectionStats(true);
                                        resolve(result);
                                        return;

                                    case 'error':
                                        console.log('[CozeClient] ❌ 处理error事件:', data.message);
                                        isFinished = true;
                                        clearTimeout(timeoutId);

                                        // 错误时立即关闭连接
                                        this.eventSourceManager.cleanupConnection(requestId);
                                        
                                        const error = new Error(data.message || '未知错误');
                                        cb.onError(error);
                                        this.updateConnectionStats(false);
                                        reject(error);
                                        return;

                                    default:
                                        console.log('[CozeClient] ❓ 未处理的事件类型:', data.event, data);
                                }
                            } else if (data.answer !== undefined) {
                                console.log('[CozeClient] 📝 处理无event字段但有answer的数据', {
                                    answerLength: data.answer.length,
                                    hasImage: data.answer.includes('!['),
                                    answerPreview: data.answer.substring(0, 200)
                                });
                                fullAnswer = data.answer;
                                cb.onToken(data.answer);
                                cb.onMessage(fullAnswer);
                            } else {
                                console.log('[CozeClient] ⚠️ 数据既没有event也没有answer字段:', data);
                            }

                        } catch (parseError) {
                            console.error('[CozeClient] 💥 解析SSE数据失败:', parseError, '原始数据:', event.data);
                            
                            // 提供更友好的错误信息
                            let errorMessage = '数据解析失败';
                            if (parseError.message.includes('JSON')) {
                                errorMessage = '服务器返回了无效的数据格式';
                            }
                            
                            const error = new Error(errorMessage);
                            cb.onError(error);
                            
                            // 不要因为单个消息解析失败就终止整个连接
                        }
                    },
                    
                    onError: (error, errorInfo) => {
                        // 判断是否真的是错误还是正常关闭
                        const isNormalClosure = errorInfo && errorInfo.isNormalClosure;
                        const hasCompleteData = hasReceivedData && fullAnswer && fullAnswer.length > 0;
                        
                        // 如果已经收到完整数据，不记录为错误
                        if (hasCompleteData) {
                            console.log('[CozeClient] ✅ 连接关闭，但已收到完整数据');
                        } else {
                            console.error('[CozeClient] 💥 EventSource连接错误:', error, errorInfo);
                        }

                        if (!isFinished) {
                            isFinished = true;
                            clearTimeout(timeoutId);
                            
                            // 如果是正常关闭且已收到完整数据，视为正常完成
                            if (isNormalClosure && hasCompleteData) {
                                console.log('[CozeClient] 🔄 连接正常关闭且已收到完整数据，视为正常完成');
                                const result = {
                                    answer: fullAnswer,
                                    conversation_id: this.conversationId,
                                    followUpQuestions: [] // 如果没有在message中收到follow-up，就是空数组
                                };
                                cb.onFinish(result);
                                this.updateConnectionStats(true);
                                
                                // Delay cleanup to allow any pending messages to process
                                setTimeout(() => {
                                    this.eventSourceManager.cleanupConnection(requestId);
                                }, 500);
                                
                                resolve(result);
                            } else if (hasCompleteData) {
                                // Even if not explicitly normal closure, if we have complete data, treat as success
                                console.log('[CozeClient] 🔄 连接断开但已收到完整数据，视为正常完成');
                                const result = {
                                    answer: fullAnswer,
                                    conversation_id: this.conversationId,
                                    followUpQuestions: []
                                };
                                cb.onFinish(result);
                                this.updateConnectionStats(true);
                                
                                setTimeout(() => {
                                    this.eventSourceManager.cleanupConnection(requestId);
                                }, 500);
                                
                                resolve(result);
                            } else {
                                // Actual error - no data received or connection failed early
                                console.log('[CozeClient] ❌ 真正的连接错误，未收到有效数据');
                                
                                // 只有在真正的错误情况下才调用onError
                                // 避免因为正常关闭而触发错误显示
                                if (!isNormalClosure) {
                                    this.eventSourceManager.cleanupConnection(requestId);
                                    cb.onError(error);
                                    this.updateConnectionStats(false);
                                    reject(error);
                                } else {
                                    // 正常关闭但没有数据，可能是空响应
                                    console.log('[CozeClient] ⚠️ 连接正常关闭但没有数据');
                                    const emptyResult = {
                                        answer: '',
                                        conversation_id: this.conversationId,
                                        followUpQuestions: []
                                    };
                                    cb.onFinish(emptyResult);
                                    this.updateConnectionStats(true);
                                    
                                    setTimeout(() => {
                                        this.eventSourceManager.cleanupConnection(requestId);
                                    }, 500);
                                    
                                    resolve(emptyResult);
                                }
                            }
                        }
                    }
                };

                // 创建EventSource连接
                const eventSource = this.eventSourceManager.createConnection(sseUrl.toString(), requestId, eventCallbacks);
                this.eventSourceManager.setupEventHandlers(eventSource, sseUrl.toString(), requestId, eventCallbacks);

                // 清理函数
                const cleanup = () => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    this.eventSourceManager.cleanupConnection(requestId);
                };

                // 页面卸载时清理连接 - 存储引用以便后续移除
                const beforeUnloadHandler = () => {
                    cleanup();
                    // 移除事件监听器防止内存泄漏
                    window.removeEventListener('beforeunload', beforeUnloadHandler);
                };
                window.addEventListener('beforeunload', beforeUnloadHandler);
                
                // 增强清理函数，确保移除事件监听器
                const enhancedCleanup = () => {
                    cleanup();
                    window.removeEventListener('beforeunload', beforeUnloadHandler);
                };
                
                // 返回增强的清理函数供外部调用
                return enhancedCleanup;

            } catch (error) {
                console.error('[CozeClient] 💥 初始化EventSource失败:', error);
                
                // 增强错误信息
                let enhancedError = error;
                if (error.message.includes('Failed to fetch')) {
                    enhancedError = new Error('网络连接失败，请检查网络后重试');
                } else if (error.message.includes('NetworkError')) {
                    enhancedError = new Error('网络错误，请检查连接后重试');
                }
                
                this.updateConnectionStats(false);
                callbacks.onError?.(enhancedError);
                reject(enhancedError);
            }
        });
    },


    /**
     * 初始化cozeClient
     * 启动必要的服务
     */
    initialize: function() {
        console.log('[CozeClient] 初始化开始...');

        // 初始化网络监控
        this.initNetworkMonitoring();

        // 清理旧的 token 存储（如果存在）
        localStorage.removeItem('cozeApiToken');
        localStorage.removeItem('cozeTokenExpiry');
        console.log('[CozeClient] 已清理旧的 token 存储');

        console.log('[CozeClient] 初始化完成');
    },

    /**
     * 清理cozeClient
     * 停止所有服务
     */
    cleanup: function() {
        console.log('[CozeClient] 开始清理...');

        // 停止网络监控
        this.cleanupNetworkMonitoring();

        // 不再需要停止自动刷新（已移除）

        // 清理EventSource连接
        for (const [requestId, eventSource] of this.eventSourceManager.activeConnections) {
            this.eventSourceManager.cleanupConnection(requestId);
        }

        console.log('[CozeClient] 清理完成');
    }
};

