/**
 * Coze会话管理器
 * 专门管理Coze API的会话和消息，支持持久化和上下文保持
 */
const logger = require('./logger');

class CozeConversationManager {
    constructor(options = {}) {
        this.conversationTTL = options.conversationTTL || 24 * 60 * 60 * 1000; // 24小时
        this.maxMessagesPerConversation = options.maxMessagesPerConversation || 100;
        this.maxConversationsPerUser = options.maxConversationsPerUser || 10;
        this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1小时
        
        // 会话存储：userId -> { conversationId, messages, createdAt, updatedAt, metadata }
        this.conversations = new Map();
        
        // 用户会话映射：userId -> [conversationIds]
        this.userConversations = new Map();
        
        // 会话元数据：conversationId -> { userId, title, summary, tags }
        this.conversationMetadata = new Map();
        
        // 统计信息
        this.stats = {
            totalConversations: 0,
            activeConversations: 0,
            totalMessages: 0,
            averageMessagesPerConversation: 0,
            lastCleanupTime: Date.now()
        };

        // 启动定期清理
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);

        logger.info('Coze会话管理器初始化完成', {
            type: 'coze_conversation_manager_init',
            conversationTTL: this.conversationTTL,
            maxMessagesPerConversation: this.maxMessagesPerConversation,
            maxConversationsPerUser: this.maxConversationsPerUser
        });
    }

    /**
     * 获取或创建用户的当前会话
     * @param {string} userId - 用户ID
     * @param {Object} options - 选项
     * @returns {Object} 会话信息
     */
    async getCurrentConversation(userId, options = {}) {
        try {
            // 获取用户的会话列表
            const userConvs = this.userConversations.get(userId) || [];
            
            // 查找最近的活跃会话
            let currentConversation = null;
            for (const convId of userConvs) {
                const conv = this.conversations.get(convId);
                if (conv && this.isConversationActive(conv)) {
                    currentConversation = conv;
                    break;
                }
            }

            // 如果没有活跃会话或需要创建新会话，则创建
            if (!currentConversation || options.forceNew) {
                currentConversation = await this.createNewConversation(userId, options);
            }

            // 更新会话访问时间
            currentConversation.updatedAt = Date.now();
            currentConversation.accessCount = (currentConversation.accessCount || 0) + 1;

            logger.debug('获取当前会话', {
                type: 'get_current_conversation',
                userId: userId,
                conversationId: currentConversation.conversationId,
                messageCount: currentConversation.messages.length,
                isNew: options.forceNew || false
            });

            return currentConversation;

        } catch (error) {
            logger.error('获取当前会话失败', {
                type: 'get_current_conversation_error',
                userId: userId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * 创建新会话
     * @param {string} userId - 用户ID
     * @param {Object} options - 会话选项
     * @returns {Object} 新会话信息
     */
    async createNewConversation(userId, options = {}) {
        try {
            const conversationId = this.generateConversationId();
            const now = Date.now();

            const conversation = {
                conversationId: conversationId,
                userId: userId,
                messages: [],
                createdAt: now,
                updatedAt: now,
                accessCount: 0,
                metadata: {
                    title: options.title || '新对话',
                    summary: '',
                    tags: options.tags || [],
                    context: options.context || {},
                    settings: {
                        maxMessages: this.maxMessagesPerConversation,
                        enableContext: options.enableContext !== false,
                        autoSummary: options.autoSummary !== false
                    }
                }
            };

            // 存储会话
            this.conversations.set(conversationId, conversation);

            // 更新用户会话映射
            const userConvs = this.userConversations.get(userId) || [];
            userConvs.unshift(conversationId); // 最新的在前面
            
            // 限制用户会话数量
            if (userConvs.length > this.maxConversationsPerUser) {
                const removedConvIds = userConvs.splice(this.maxConversationsPerUser);
                // 清理超出限制的会话
                removedConvIds.forEach(convId => {
                    this.conversations.delete(convId);
                    this.conversationMetadata.delete(convId);
                });
            }
            
            this.userConversations.set(userId, userConvs);

            // 存储会话元数据
            this.conversationMetadata.set(conversationId, {
                userId: userId,
                title: conversation.metadata.title,
                summary: conversation.metadata.summary,
                tags: conversation.metadata.tags,
                createdAt: now
            });

            // 更新统计信息
            this.stats.totalConversations++;
            this.stats.activeConversations = this.conversations.size;

            logger.info('创建新会话', {
                type: 'create_new_conversation',
                userId: userId,
                conversationId: conversationId,
                title: conversation.metadata.title,
                userConversationCount: userConvs.length
            });

            return conversation;

        } catch (error) {
            logger.error('创建新会话失败', {
                type: 'create_new_conversation_error',
                userId: userId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * 添加消息到会话
     * @param {string} conversationId - 会话ID
     * @param {Object} message - 消息对象
     * @returns {Object} 更新后的会话
     */
    addMessageToConversation(conversationId, message) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                throw new Error(`会话不存在: ${conversationId}`);
            }

            // 创建标准化的消息对象
            const standardMessage = {
                id: this.generateMessageId(),
                conversationId: conversationId,
                role: message.role || 'user', // user, assistant, system
                content: message.content || '',
                contentType: message.contentType || 'text',
                timestamp: Date.now(),
                metadata: {
                    source: message.source || 'chat',
                    processingTime: message.processingTime || 0,
                    tokens: message.tokens || 0,
                    ...message.metadata
                }
            };

            // 添加消息到会话
            conversation.messages.push(standardMessage);
            conversation.updatedAt = Date.now();

            // 限制消息数量
            if (conversation.messages.length > this.maxMessagesPerConversation) {
                const removedMessages = conversation.messages.splice(
                    0, 
                    conversation.messages.length - this.maxMessagesPerConversation
                );
                
                logger.debug('会话消息数量超限，清理旧消息', {
                    type: 'conversation_message_cleanup',
                    conversationId: conversationId,
                    removedCount: removedMessages.length,
                    remainingCount: conversation.messages.length
                });
            }

            // 更新统计信息
            this.stats.totalMessages++;
            this.stats.averageMessagesPerConversation = 
                this.stats.totalMessages / this.stats.totalConversations;

            // 自动生成会话摘要
            if (conversation.metadata.settings.autoSummary && 
                conversation.messages.length % 10 === 0) {
                this.generateConversationSummary(conversationId);
            }

            logger.debug('添加消息到会话', {
                type: 'add_message_to_conversation',
                conversationId: conversationId,
                messageId: standardMessage.id,
                role: standardMessage.role,
                contentLength: standardMessage.content.length,
                totalMessages: conversation.messages.length
            });

            return conversation;

        } catch (error) {
            logger.error('添加消息到会话失败', {
                type: 'add_message_error',
                conversationId: conversationId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * 获取会话历史
     * @param {string} conversationId - 会话ID
     * @param {Object} options - 选项
     * @returns {Array} 消息历史
     */
    getConversationHistory(conversationId, options = {}) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                logger.warn('会话不存在', {
                    type: 'conversation_not_found',
                    conversationId: conversationId
                });
                return [];
            }

            const limit = options.limit || 50;
            const offset = options.offset || 0;
            const includeSystem = options.includeSystem !== false;

            let messages = conversation.messages;

            // 过滤系统消息
            if (!includeSystem) {
                messages = messages.filter(msg => msg.role !== 'system');
            }

            // 应用分页
            const paginatedMessages = messages.slice(offset, offset + limit);

            logger.debug('获取会话历史', {
                type: 'get_conversation_history',
                conversationId: conversationId,
                totalMessages: messages.length,
                returnedMessages: paginatedMessages.length,
                limit: limit,
                offset: offset
            });

            return paginatedMessages;

        } catch (error) {
            logger.error('获取会话历史失败', {
                type: 'get_conversation_history_error',
                conversationId: conversationId,
                error: error.message
            });
            return [];
        }
    }

    /**
     * 获取用户的所有会话
     * @param {string} userId - 用户ID
     * @param {Object} options - 选项
     * @returns {Array} 用户会话列表
     */
    getUserConversations(userId, options = {}) {
        try {
            const userConvIds = this.userConversations.get(userId) || [];
            const conversations = [];

            for (const convId of userConvIds) {
                const conv = this.conversations.get(convId);
                if (conv) {
                    const conversationSummary = {
                        conversationId: conv.conversationId,
                        title: conv.metadata.title,
                        summary: conv.metadata.summary,
                        messageCount: conv.messages.length,
                        createdAt: conv.createdAt,
                        updatedAt: conv.updatedAt,
                        isActive: this.isConversationActive(conv),
                        lastMessage: conv.messages.length > 0 ? 
                            conv.messages[conv.messages.length - 1] : null
                    };
                    conversations.push(conversationSummary);
                }
            }

            // 排序：最近更新的在前
            conversations.sort((a, b) => b.updatedAt - a.updatedAt);

            // 应用限制
            const limit = options.limit || 20;
            const result = conversations.slice(0, limit);

            logger.debug('获取用户会话列表', {
                type: 'get_user_conversations',
                userId: userId,
                totalConversations: conversations.length,
                returnedConversations: result.length
            });

            return result;

        } catch (error) {
            logger.error('获取用户会话列表失败', {
                type: 'get_user_conversations_error',
                userId: userId,
                error: error.message
            });
            return [];
        }
    }

    /**
     * 删除会话
     * @param {string} conversationId - 会话ID
     * @param {string} userId - 用户ID（用于验证权限）
     * @returns {boolean} 是否删除成功
     */
    deleteConversation(conversationId, userId) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation) {
                return false;
            }

            // 验证用户权限
            if (conversation.userId !== userId) {
                logger.warn('用户无权删除会话', {
                    type: 'delete_conversation_unauthorized',
                    conversationId: conversationId,
                    requestUserId: userId,
                    conversationUserId: conversation.userId
                });
                return false;
            }

            // 从存储中删除
            this.conversations.delete(conversationId);
            this.conversationMetadata.delete(conversationId);

            // 从用户会话列表中删除
            const userConvs = this.userConversations.get(userId) || [];
            const index = userConvs.indexOf(conversationId);
            if (index > -1) {
                userConvs.splice(index, 1);
                this.userConversations.set(userId, userConvs);
            }

            // 更新统计信息
            this.stats.activeConversations = this.conversations.size;

            logger.info('删除会话', {
                type: 'delete_conversation',
                conversationId: conversationId,
                userId: userId,
                messageCount: conversation.messages.length
            });

            return true;

        } catch (error) {
            logger.error('删除会话失败', {
                type: 'delete_conversation_error',
                conversationId: conversationId,
                userId: userId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * 检查会话是否活跃
     * @param {Object} conversation - 会话对象
     * @returns {boolean} 是否活跃
     */
    isConversationActive(conversation) {
        const now = Date.now();
        const timeSinceUpdate = now - conversation.updatedAt;
        return timeSinceUpdate < this.conversationTTL;
    }

    /**
     * 生成会话摘要
     * @param {string} conversationId - 会话ID
     */
    async generateConversationSummary(conversationId) {
        try {
            const conversation = this.conversations.get(conversationId);
            if (!conversation || conversation.messages.length < 5) {
                return;
            }

            // 简单的摘要生成逻辑
            const recentMessages = conversation.messages.slice(-10);
            const userMessages = recentMessages.filter(msg => msg.role === 'user');
            const assistantMessages = recentMessages.filter(msg => msg.role === 'assistant');

            let summary = '';
            if (userMessages.length > 0) {
                const firstUserMessage = userMessages[0].content.substring(0, 50);
                summary = `关于"${firstUserMessage}..."的对话`;
            }

            // 更新会话元数据
            conversation.metadata.summary = summary;
            const metadata = this.conversationMetadata.get(conversationId);
            if (metadata) {
                metadata.summary = summary;
            }

            logger.debug('生成会话摘要', {
                type: 'generate_conversation_summary',
                conversationId: conversationId,
                summary: summary,
                messageCount: conversation.messages.length
            });

        } catch (error) {
            logger.error('生成会话摘要失败', {
                type: 'generate_conversation_summary_error',
                conversationId: conversationId,
                error: error.message
            });
        }
    }

    /**
     * 清理过期会话
     */
    cleanup() {
        try {
            const now = Date.now();
            let cleanedCount = 0;

            // 清理过期会话
            for (const [conversationId, conversation] of this.conversations.entries()) {
                if (!this.isConversationActive(conversation)) {
                    this.conversations.delete(conversationId);
                    this.conversationMetadata.delete(conversationId);

                    // 从用户会话列表中删除
                    const userConvs = this.userConversations.get(conversation.userId) || [];
                    const index = userConvs.indexOf(conversationId);
                    if (index > -1) {
                        userConvs.splice(index, 1);
                        this.userConversations.set(conversation.userId, userConvs);
                    }

                    cleanedCount++;
                }
            }

            // 更新统计信息
            this.stats.activeConversations = this.conversations.size;
            this.stats.lastCleanupTime = now;

            if (cleanedCount > 0) {
                logger.info('会话清理完成', {
                    type: 'conversation_cleanup',
                    cleanedCount: cleanedCount,
                    activeConversations: this.stats.activeConversations,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            logger.error('会话清理失败', {
                type: 'conversation_cleanup_error',
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * 生成会话ID
     * @returns {string} 会话ID
     */
    generateConversationId() {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 生成消息ID
     * @returns {string} 消息ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取管理器状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            service: 'CozeConversationManager',
            status: 'healthy',
            config: {
                conversationTTL: this.conversationTTL,
                maxMessagesPerConversation: this.maxMessagesPerConversation,
                maxConversationsPerUser: this.maxConversationsPerUser,
                cleanupInterval: this.cleanupInterval
            },
            stats: {
                ...this.stats,
                memoryUsage: this.calculateMemoryUsage(),
                userCount: this.userConversations.size
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 计算内存使用量
     * @returns {number} 内存使用量（字节）
     */
    calculateMemoryUsage() {
        let totalSize = 0;
        
        for (const conversation of this.conversations.values()) {
            totalSize += JSON.stringify(conversation).length * 2; // UTF-16编码
        }
        
        return totalSize;
    }

    /**
     * 销毁管理器
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.conversations.clear();
        this.userConversations.clear();
        this.conversationMetadata.clear();

        logger.info('Coze会话管理器已销毁', {
            type: 'coze_conversation_manager_destroy',
            finalStats: this.stats,
            timestamp: new Date().toISOString()
        });
    }
}

// 创建全局会话管理器实例
const cozeConversationManager = new CozeConversationManager({
    conversationTTL: parseInt(process.env.COZE_CONVERSATION_TTL) || 24 * 60 * 60 * 1000,
    maxMessagesPerConversation: parseInt(process.env.COZE_MAX_MESSAGES_PER_CONVERSATION) || 100,
    maxConversationsPerUser: parseInt(process.env.COZE_MAX_CONVERSATIONS_PER_USER) || 10,
    cleanupInterval: parseInt(process.env.COZE_CONVERSATION_CLEANUP_INTERVAL) || 60 * 60 * 1000
});

module.exports = {
    CozeConversationManager,
    cozeConversationManager
};