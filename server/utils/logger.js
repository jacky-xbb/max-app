/**
 * 结构化日志记录工具
 * 支持不同日志级别、格式化输出和性能监控
 */

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        // 性能监控数据
        this.metrics = {
            apiCalls: 0,
            apiErrors: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
    }

    /**
     * 检查是否应该记录指定级别的日志
     * @param {string} level - 日志级别
     * @returns {boolean}
     */
    shouldLog(level) {
        return this.logLevels[level] <= this.logLevels[this.logLevel];
    }

    /**
     * 格式化日志消息
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     * @returns {string}
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta
        };
        
        return JSON.stringify(logEntry, null, process.env.NODE_ENV === 'development' ? 2 : 0);
    }

    /**
     * 错误级别日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    error(message, meta = {}) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, meta));
            
            // 记录错误指标
            if (meta.type === 'api_error') {
                this.metrics.apiErrors++;
            }
        }
    }

    /**
     * 警告级别日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    warn(message, meta = {}) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, meta));
        }
    }

    /**
     * 信息级别日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    info(message, meta = {}) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, meta));
        }
    }

    /**
     * 调试级别日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    debug(message, meta = {}) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, meta));
        }
    }

    /**
     * 记录API调用开始
     * @param {string} method - HTTP方法
     * @param {string} url - 请求URL
     * @param {Object} params - 请求参数
     * @returns {Object} 包含开始时间的上下文对象
     */
    logApiStart(method, url, params = {}) {
        const context = {
            startTime: Date.now(),
            method,
            url,
            requestId: this.generateRequestId()
        };

        this.info('API调用开始', {
            type: 'api_start',
            method,
            url,
            requestId: context.requestId,
            params: this.sanitizeParams(params),
            timestamp: new Date().toISOString(),
            service: 'coze',
            operation: 'api_call'
        });

        this.metrics.apiCalls++;
        return context;
    }

    /**
     * 记录API调用成功
     * @param {Object} context - API调用上下文
     * @param {Object} response - 响应数据
     */
    logApiSuccess(context, response = {}) {
        const duration = Date.now() - context.startTime;
        this.updateResponseTimeMetrics(duration);

        this.info('API调用成功', {
            type: 'api_success',
            method: context.method,
            url: context.url,
            requestId: context.requestId,
            duration,
            responseSize: JSON.stringify(response).length,
            timestamp: new Date().toISOString(),
            service: 'coze',
            operation: 'api_call',
            status: 'success'
        });
    }

    /**
     * 记录API调用失败
     * @param {Object} context - API调用上下文
     * @param {Error} error - 错误对象
     */
    logApiError(context, error) {
        const duration = Date.now() - context.startTime;
        this.updateResponseTimeMetrics(duration);

        this.error('API调用失败', {
            type: 'api_error',
            method: context.method,
            url: context.url,
            requestId: context.requestId,
            duration,
            error: error.message,
            stack: error.stack,
            status: error.status || error.response?.status,
            timestamp: new Date().toISOString(),
            service: 'coze',
            operation: 'api_call',
            errorCode: error.code,
            errorType: error.name || 'Error',
            retryable: this.isRetryableError(error)
        });
    }

    /**
     * 记录重试尝试
     * @param {Object} context - API调用上下文
     * @param {number} attempt - 重试次数
     * @param {Error} error - 导致重试的错误
     */
    logRetryAttempt(context, attempt, error) {
        this.warn('API调用重试', {
            type: 'api_retry',
            method: context.method,
            url: context.url,
            requestId: context.requestId,
            attempt,
            error: error.message,
            status: error.status || error.response?.status
        });
    }

    /**
     * 更新响应时间指标
     * @param {number} duration - 响应时间（毫秒）
     */
    updateResponseTimeMetrics(duration) {
        this.metrics.totalResponseTime += duration;
        this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.apiCalls;
    }

    /**
     * 生成请求ID
     * @returns {string}
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 清理敏感参数
     * @param {Object} params - 原始参数
     * @returns {Object} 清理后的参数
     */
    sanitizeParams(params) {
        const sanitized = { ...params };
        const sensitiveKeys = ['apiKey', 'token', 'password', 'secret'];
        
        sensitiveKeys.forEach(key => {
            if (sanitized[key]) {
                sanitized[key] = '***';
            }
        });
        
        return sanitized;
    }

    /**
     * 获取性能指标
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...this.metrics,
            errorRate: this.metrics.apiCalls > 0 ? (this.metrics.apiErrors / this.metrics.apiCalls * 100).toFixed(2) + '%' : '0%',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 重置指标
     */
    resetMetrics() {
        this.metrics = {
            apiCalls: 0,
            apiErrors: 0,
            totalResponseTime: 0,
            averageResponseTime: 0
        };
    }

    /**
     * 判断错误是否可重试
     * @param {Error} error - 错误对象
     * @returns {boolean}
     */
    isRetryableError(error) {
        // 网络错误可重试
        if (error.code === 'ECONNRESET' || 
            error.code === 'ENOTFOUND' || 
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNREFUSED') {
            return true;
        }

        // HTTP状态码错误
        if (error.response) {
            const status = error.response.status;
            // 5xx服务器错误可重试
            if (status >= 500) return true;
            // 429限流错误可重试
            if (status === 429) return true;
            // 408请求超时可重试
            if (status === 408) return true;
        }

        return false;
    }

    /**
     * 记录系统健康状态
     * @param {Object} healthData - 健康状态数据
     */
    logHealthStatus(healthData) {
        this.info('系统健康状态检查', {
            type: 'health_check',
            timestamp: new Date().toISOString(),
            ...healthData
        });
    }

    /**
     * 记录性能指标
     * @param {string} operation - 操作名称
     * @param {number} duration - 持续时间
     * @param {Object} metadata - 额外元数据
     */
    logPerformance(operation, duration, metadata = {}) {
        this.info('性能指标记录', {
            type: 'performance_metric',
            operation,
            duration,
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * 记录业务事件
     * @param {string} event - 事件名称
     * @param {Object} data - 事件数据
     */
    logBusinessEvent(event, data = {}) {
        this.info(`业务事件: ${event}`, {
            type: 'business_event',
            event,
            timestamp: new Date().toISOString(),
            ...data
        });
    }
}

// 创建全局日志实例
const logger = new Logger();

module.exports = logger;