/**
 * API调用重试机制和优雅降级处理
 */
const logger = require('./logger');

class RetryHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.baseDelay = options.baseDelay || 1000; // 基础延迟时间（毫秒）
        this.maxDelay = options.maxDelay || 10000; // 最大延迟时间（毫秒）
        this.backoffFactor = options.backoffFactor || 2; // 退避因子
        this.jitter = options.jitter || true; // 是否添加随机抖动
    }

    /**
     * 执行带重试的异步操作
     * @param {Function} operation - 要执行的异步操作
     * @param {Object} context - 操作上下文（用于日志记录）
     * @param {Object} options - 重试选项
     * @returns {Promise} 操作结果
     */
    async executeWithRetry(operation, context = {}, options = {}) {
        const maxRetries = options.maxRetries || this.maxRetries;
        const timeout = options.timeout || 30000; // 30秒默认超时
        const fallbackOperation = options.fallback;
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // 第一次尝试不需要延迟
                if (attempt > 0) {
                    const delay = this.calculateDelay(attempt);
                    logger.logRetryAttempt(context, attempt, lastError);
                    await this.sleep(delay);
                }

                // 执行操作（带超时）
                const result = await this.withTimeout(operation(), timeout, `操作超时 (${timeout}ms)`);
                
                // 如果成功且之前有重试，记录恢复日志
                if (attempt > 0) {
                    logger.info('操作重试成功', {
                        type: 'retry_success',
                        requestId: context.requestId,
                        totalAttempts: attempt + 1,
                        timestamp: new Date().toISOString()
                    });
                }

                return result;

            } catch (error) {
                lastError = error;

                // 记录重试详情
                logger.warn('操作执行失败，准备重试', {
                    type: 'operation_retry',
                    requestId: context.requestId,
                    attempt: attempt + 1,
                    maxRetries: maxRetries + 1,
                    error: error.message,
                    errorType: error.name,
                    shouldRetry: this.shouldRetry(error),
                    timestamp: new Date().toISOString()
                });

                // 检查是否应该重试
                if (attempt >= maxRetries || !this.shouldRetry(error)) {
                    // 尝试优雅降级
                    if (fallbackOperation && typeof fallbackOperation === 'function') {
                        try {
                            logger.info('执行优雅降级操作', {
                                type: 'graceful_degradation',
                                requestId: context.requestId,
                                originalError: error.message,
                                timestamp: new Date().toISOString()
                            });
                            
                            const fallbackResult = await fallbackOperation(error, context);
                            
                            logger.info('优雅降级成功', {
                                type: 'degradation_success',
                                requestId: context.requestId,
                                timestamp: new Date().toISOString()
                            });
                            
                            return fallbackResult;
                        } catch (fallbackError) {
                            logger.error('优雅降级失败', {
                                type: 'degradation_failed',
                                requestId: context.requestId,
                                fallbackError: fallbackError.message,
                                originalError: error.message,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }

                    logger.error('操作最终失败', {
                        type: 'operation_failed',
                        requestId: context.requestId,
                        totalAttempts: attempt + 1,
                        finalError: error.message,
                        errorType: error.name,
                        shouldRetry: this.shouldRetry(error),
                        hasFallback: !!fallbackOperation,
                        timestamp: new Date().toISOString()
                    });
                    throw error;
                }
            }
        }

        // 理论上不会到达这里，但为了类型安全
        throw lastError;
    }

    /**
     * 判断错误是否应该重试
     * @param {Error} error - 错误对象
     * @returns {boolean}
     */
    shouldRetry(error) {
        // 网络错误应该重试
        if (error.code === 'ECONNRESET' || 
            error.code === 'ENOTFOUND' || 
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNREFUSED') {
            return true;
        }

        // HTTP状态码错误
        if (error.response) {
            const status = error.response.status;
            
            // 5xx服务器错误应该重试
            if (status >= 500) {
                return true;
            }
            
            // 429限流错误应该重试
            if (status === 429) {
                return true;
            }
            
            // 408请求超时应该重试
            if (status === 408) {
                return true;
            }
            
            // 4xx客户端错误（除了429和408）不应该重试
            if (status >= 400 && status < 500) {
                return false;
            }
        }

        // 其他错误默认不重试
        return false;
    }

    /**
     * 计算延迟时间（指数退避 + 随机抖动）
     * @param {number} attempt - 重试次数
     * @returns {number} 延迟时间（毫秒）
     */
    calculateDelay(attempt) {
        // 指数退避
        let delay = this.baseDelay * Math.pow(this.backoffFactor, attempt - 1);
        
        // 限制最大延迟
        delay = Math.min(delay, this.maxDelay);
        
        // 添加随机抖动（±25%）
        if (this.jitter) {
            const jitterRange = delay * 0.25;
            const jitterOffset = (Math.random() - 0.5) * 2 * jitterRange;
            delay += jitterOffset;
        }
        
        return Math.max(delay, 0);
    }

    /**
     * 睡眠指定时间
     * @param {number} ms - 毫秒数
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 创建带超时的Promise
     * @param {Promise} promise - 原始Promise
     * @param {number} timeout - 超时时间（毫秒）
     * @param {string} timeoutMessage - 超时错误消息
     * @returns {Promise}
     */
    withTimeout(promise, timeout, timeoutMessage = '操作超时') {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    const timeoutError = new Error(timeoutMessage);
                    timeoutError.code = 'TIMEOUT';
                    timeoutError.timeout = timeout;
                    reject(timeoutError);
                }, timeout);
            })
        ]);
    }

    /**
     * 获取重试处理器健康状态
     * @returns {Object} 健康状态信息
     */
    getHealthStatus() {
        return {
            service: 'RetryHandler',
            status: 'healthy',
            config: {
                maxRetries: this.maxRetries,
                baseDelay: this.baseDelay,
                maxDelay: this.maxDelay,
                backoffFactor: this.backoffFactor,
                jitter: this.jitter
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 执行带优雅降级的操作
     * @param {Function} primaryOperation - 主要操作
     * @param {Function} fallbackOperation - 降级操作
     * @param {Object} context - 操作上下文
     * @param {Object} options - 选项
     * @returns {Promise} 操作结果
     */
    async executeWithFallback(primaryOperation, fallbackOperation, context = {}, options = {}) {
        try {
            return await this.executeWithRetry(primaryOperation, context, options);
        } catch (primaryError) {
            logger.warn('主要操作失败，执行降级操作', {
                type: 'fallback_execution',
                requestId: context.requestId,
                primaryError: primaryError.message,
                timestamp: new Date().toISOString()
            });

            try {
                const fallbackResult = await fallbackOperation(primaryError, context);
                
                logger.info('降级操作成功', {
                    type: 'fallback_success',
                    requestId: context.requestId,
                    timestamp: new Date().toISOString()
                });
                
                return fallbackResult;
            } catch (fallbackError) {
                logger.error('降级操作也失败', {
                    type: 'fallback_failed',
                    requestId: context.requestId,
                    primaryError: primaryError.message,
                    fallbackError: fallbackError.message,
                    timestamp: new Date().toISOString()
                });
                
                // 抛出原始错误
                throw primaryError;
            }
        }
    }

    /**
     * 断路器模式实现
     */
    createCircuitBreaker(options = {}) {
        return new CircuitBreaker(options);
    }
}

/**
 * 断路器实现
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5; // 失败阈值
        this.resetTimeout = options.resetTimeout || 60000; // 重置超时（毫秒）
        this.monitoringPeriod = options.monitoringPeriod || 10000; // 监控周期（毫秒）
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }

    /**
     * 执行操作（带断路器保护）
     * @param {Function} operation - 要执行的操作
     * @returns {Promise}
     */
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
                logger.info('断路器进入半开状态', {
                    type: 'circuit_breaker',
                    state: 'HALF_OPEN'
                });
            } else {
                throw new Error('断路器开启，拒绝执行操作');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * 处理成功情况
     */
    onSuccess() {
        this.failureCount = 0;
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= 3) { // 连续3次成功后关闭断路器
                this.state = 'CLOSED';
                logger.info('断路器关闭', {
                    type: 'circuit_breaker',
                    state: 'CLOSED'
                });
            }
        }
    }

    /**
     * 处理失败情况
     */
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            logger.warn('断路器开启', {
                type: 'circuit_breaker',
                state: 'OPEN',
                failureCount: this.failureCount
            });
        }
    }

    /**
     * 获取断路器状态
     * @returns {Object}
     */
    getStatus() {
        const now = Date.now();
        const timeSinceLastFailure = this.lastFailureTime ? now - this.lastFailureTime : null;
        const timeUntilReset = this.state === 'OPEN' && this.lastFailureTime ? 
            Math.max(0, this.resetTimeout - timeSinceLastFailure) : null;

        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
            successCount: this.successCount,
            timeSinceLastFailure,
            timeUntilReset,
            config: {
                failureThreshold: this.failureThreshold,
                resetTimeout: this.resetTimeout,
                monitoringPeriod: this.monitoringPeriod
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 重置断路器状态
     */
    reset() {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        
        logger.info('断路器手动重置', {
            type: 'circuit_breaker_reset',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 获取断路器健康状态
     * @returns {Object}
     */
    getHealthStatus() {
        const status = this.getStatus();
        const isHealthy = status.state === 'CLOSED' || 
                         (status.state === 'HALF_OPEN' && status.successCount > 0);

        return {
            service: 'CircuitBreaker',
            status: isHealthy ? 'healthy' : 'degraded',
            details: status
        };
    }
}

// 创建全局重试处理器实例
const retryHandler = new RetryHandler();

module.exports = {
    RetryHandler,
    CircuitBreaker,
    retryHandler
};