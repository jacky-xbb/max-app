/**
 * 请求限流和队列机制
 * 防止API配额超限，优化并发处理
 */
const logger = require('./logger');

class RateLimiter {
    constructor(options = {}) {
        this.maxRequestsPerSecond = options.maxRequestsPerSecond || 10;
        this.maxRequestsPerMinute = options.maxRequestsPerMinute || 100;
        this.maxConcurrentRequests = options.maxConcurrentRequests || 5;
        this.queueMaxSize = options.queueMaxSize || 100;
        
        // 请求计数器
        this.requestsThisSecond = 0;
        this.requestsThisMinute = 0;
        this.currentConcurrentRequests = 0;
        
        // 请求队列
        this.requestQueue = [];
        this.isProcessingQueue = false;
        
        // 时间窗口重置
        this.lastSecondReset = Date.now();
        this.lastMinuteReset = Date.now();
        
        // 统计信息
        this.stats = {
            totalRequests: 0,
            queuedRequests: 0,
            rejectedRequests: 0,
            completedRequests: 0,
            averageWaitTime: 0,
            totalWaitTime: 0,
            maxQueueSize: 0
        };

        // 定期重置计数器
        this.resetInterval = setInterval(() => {
            this.resetCounters();
        }, 1000);

        logger.info('请求限流器初始化完成', {
            type: 'rate_limiter_init',
            maxRequestsPerSecond: this.maxRequestsPerSecond,
            maxRequestsPerMinute: this.maxRequestsPerMinute,
            maxConcurrentRequests: this.maxConcurrentRequests,
            queueMaxSize: this.queueMaxSize
        });
    }

    /**
     * 执行带限流的请求
     * @param {Function} requestFunction - 要执行的请求函数
     * @param {Object} context - 请求上下文
     * @param {Object} options - 选项
     * @returns {Promise} 请求结果
     */
    async executeRequest(requestFunction, context = {}, options = {}) {
        const requestId = context.requestId || this.generateRequestId();
        const priority = options.priority || 'normal';
        const timeout = options.timeout || 30000;

        this.stats.totalRequests++;

        // 检查是否需要排队
        if (this.shouldQueue()) {
            return this.queueRequest(requestFunction, { ...context, requestId }, { ...options, priority, timeout });
        }

        // 直接执行请求
        return this.executeImmediately(requestFunction, { ...context, requestId }, timeout);
    }

    /**
     * 检查是否需要排队
     * @returns {boolean}
     */
    shouldQueue() {
        // 检查并发限制
        if (this.currentConcurrentRequests >= this.maxConcurrentRequests) {
            return true;
        }

        // 检查每秒限制
        if (this.requestsThisSecond >= this.maxRequestsPerSecond) {
            return true;
        }

        // 检查每分钟限制
        if (this.requestsThisMinute >= this.maxRequestsPerMinute) {
            return true;
        }

        return false;
    }

    /**
     * 将请求加入队列
     * @param {Function} requestFunction - 请求函数
     * @param {Object} context - 请求上下文
     * @param {Object} options - 选项
     * @returns {Promise} 请求结果
     */
    async queueRequest(requestFunction, context, options) {
        // 检查队列是否已满
        if (this.requestQueue.length >= this.queueMaxSize) {
            this.stats.rejectedRequests++;
            const error = new Error('请求队列已满，请稍后重试');
            error.code = 'QUEUE_FULL';
            
            logger.warn('请求被拒绝，队列已满', {
                type: 'rate_limit_rejected',
                requestId: context.requestId,
                queueSize: this.requestQueue.length,
                maxQueueSize: this.queueMaxSize
            });
            
            throw error;
        }

        const queuedAt = Date.now();
        this.stats.queuedRequests++;
        this.stats.maxQueueSize = Math.max(this.stats.maxQueueSize, this.requestQueue.length + 1);

        logger.debug('请求加入队列', {
            type: 'rate_limit_queued',
            requestId: context.requestId,
            queuePosition: this.requestQueue.length + 1,
            priority: options.priority
        });

        return new Promise((resolve, reject) => {
            const queueItem = {
                requestFunction,
                context,
                options,
                resolve,
                reject,
                queuedAt,
                timeout: options.timeout
            };

            // 根据优先级插入队列
            if (options.priority === 'high') {
                this.requestQueue.unshift(queueItem);
            } else {
                this.requestQueue.push(queueItem);
            }

            // 启动队列处理
            this.processQueue();
        });
    }

    /**
     * 立即执行请求
     * @param {Function} requestFunction - 请求函数
     * @param {Object} context - 请求上下文
     * @param {number} timeout - 超时时间
     * @returns {Promise} 请求结果
     */
    async executeImmediately(requestFunction, context, timeout) {
        this.currentConcurrentRequests++;
        this.requestsThisSecond++;
        this.requestsThisMinute++;

        const startTime = Date.now();

        try {
            logger.debug('立即执行请求', {
                type: 'rate_limit_execute',
                requestId: context.requestId,
                concurrentRequests: this.currentConcurrentRequests
            });

            // 执行请求（带超时）
            const result = await this.withTimeout(requestFunction(), timeout);
            
            const duration = Date.now() - startTime;
            this.stats.completedRequests++;
            
            logger.debug('请求执行完成', {
                type: 'rate_limit_complete',
                requestId: context.requestId,
                duration,
                concurrentRequests: this.currentConcurrentRequests - 1
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            
            logger.error('请求执行失败', {
                type: 'rate_limit_error',
                requestId: context.requestId,
                error: error.message,
                duration,
                concurrentRequests: this.currentConcurrentRequests - 1
            });

            throw error;

        } finally {
            this.currentConcurrentRequests--;
            // 处理队列中的下一个请求
            this.processQueue();
        }
    }

    /**
     * 处理请求队列
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.requestQueue.length > 0 && !this.shouldQueue()) {
                const queueItem = this.requestQueue.shift();
                
                // 检查请求是否超时
                const waitTime = Date.now() - queueItem.queuedAt;
                if (waitTime > queueItem.timeout) {
                    const timeoutError = new Error(`请求在队列中等待超时 (${waitTime}ms)`);
                    timeoutError.code = 'QUEUE_TIMEOUT';
                    queueItem.reject(timeoutError);
                    continue;
                }

                // 更新等待时间统计
                this.stats.totalWaitTime += waitTime;
                this.stats.averageWaitTime = this.stats.totalWaitTime / this.stats.queuedRequests;

                logger.debug('从队列中取出请求', {
                    type: 'rate_limit_dequeue',
                    requestId: queueItem.context.requestId,
                    waitTime,
                    remainingQueue: this.requestQueue.length
                });

                // 异步执行请求
                this.executeImmediately(queueItem.requestFunction, queueItem.context, queueItem.timeout)
                    .then(queueItem.resolve)
                    .catch(queueItem.reject);
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * 重置计数器
     */
    resetCounters() {
        const now = Date.now();

        // 重置每秒计数器
        if (now - this.lastSecondReset >= 1000) {
            this.requestsThisSecond = 0;
            this.lastSecondReset = now;
        }

        // 重置每分钟计数器
        if (now - this.lastMinuteReset >= 60000) {
            this.requestsThisMinute = 0;
            this.lastMinuteReset = now;
        }
    }

    /**
     * 创建带超时的Promise
     * @param {Promise} promise - 原始Promise
     * @param {number} timeout - 超时时间
     * @returns {Promise}
     */
    withTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    const timeoutError = new Error(`请求超时 (${timeout}ms)`);
                    timeoutError.code = 'REQUEST_TIMEOUT';
                    reject(timeoutError);
                }, timeout);
            })
        ]);
    }

    /**
     * 生成请求ID
     * @returns {string}
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取限流器状态
     * @returns {Object}
     */
    getStatus() {
        return {
            service: 'RateLimiter',
            status: 'healthy',
            config: {
                maxRequestsPerSecond: this.maxRequestsPerSecond,
                maxRequestsPerMinute: this.maxRequestsPerMinute,
                maxConcurrentRequests: this.maxConcurrentRequests,
                queueMaxSize: this.queueMaxSize
            },
            current: {
                requestsThisSecond: this.requestsThisSecond,
                requestsThisMinute: this.requestsThisMinute,
                currentConcurrentRequests: this.currentConcurrentRequests,
                queueLength: this.requestQueue.length,
                isProcessingQueue: this.isProcessingQueue
            },
            stats: {
                ...this.stats,
                queueUtilization: this.stats.maxQueueSize > 0 ? 
                    (this.requestQueue.length / this.queueMaxSize * 100).toFixed(2) + '%' : '0%',
                successRate: this.stats.totalRequests > 0 ? 
                    (this.stats.completedRequests / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%'
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 清空队列
     * @param {string} reason - 清空原因
     */
    clearQueue(reason = '手动清空') {
        const queueSize = this.requestQueue.length;
        
        // 拒绝所有排队的请求
        this.requestQueue.forEach(queueItem => {
            const error = new Error(`队列被清空: ${reason}`);
            error.code = 'QUEUE_CLEARED';
            queueItem.reject(error);
        });

        this.requestQueue = [];
        this.stats.rejectedRequests += queueSize;

        logger.warn('请求队列已清空', {
            type: 'rate_limit_queue_cleared',
            reason,
            clearedRequests: queueSize,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 获取健康状态
     * @returns {Object}
     */
    getHealthStatus() {
        const status = this.getStatus();
        const queueUtilization = this.requestQueue.length / this.queueMaxSize;
        const isHealthy = queueUtilization < 0.8 && this.stats.rejectedRequests < this.stats.totalRequests * 0.1;

        return {
            service: 'RateLimiter',
            status: isHealthy ? 'healthy' : 'degraded',
            details: status,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 销毁限流器
     */
    destroy() {
        if (this.resetInterval) {
            clearInterval(this.resetInterval);
        }

        this.clearQueue('限流器销毁');

        logger.info('请求限流器已销毁', {
            type: 'rate_limiter_destroy',
            finalStats: this.stats,
            timestamp: new Date().toISOString()
        });
    }
}

// 创建全局限流器实例
const rateLimiter = new RateLimiter({
    maxRequestsPerSecond: parseInt(process.env.RATE_LIMIT_PER_SECOND) || 10,
    maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 100,
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5,
    queueMaxSize: parseInt(process.env.QUEUE_MAX_SIZE) || 100
});

module.exports = {
    RateLimiter,
    rateLimiter
};