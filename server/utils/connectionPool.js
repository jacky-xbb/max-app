/**
 * HTTP连接池管理器
 * 优化API调用性能，减少连接建立开销
 */
const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('./logger');

class ConnectionPool {
    constructor(options = {}) {
        this.maxSockets = options.maxSockets || 50;
        this.maxFreeSockets = options.maxFreeSockets || 10;
        this.timeout = options.timeout || 30000;
        this.keepAlive = options.keepAlive !== false;
        this.keepAliveMsecs = options.keepAliveMsecs || 1000;
        
        // 创建HTTP和HTTPS代理
        this.httpAgent = new http.Agent({
            keepAlive: this.keepAlive,
            keepAliveMsecs: this.keepAliveMsecs,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.timeout
        });

        this.httpsAgent = new https.Agent({
            keepAlive: this.keepAlive,
            keepAliveMsecs: this.keepAliveMsecs,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.timeout
        });

        // 连接池统计
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            freeConnections: 0,
            requestsServed: 0,
            connectionReuses: 0,
            lastResetTime: Date.now()
        };

        // 定期更新统计信息
        this.statsInterval = setInterval(() => {
            this.updateStats();
        }, 5000);

        logger.info('HTTP连接池初始化完成', {
            type: 'connection_pool_init',
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            keepAlive: this.keepAlive,
            timeout: this.timeout
        });
    }

    /**
     * 创建优化的axios实例
     * @param {Object} config - axios配置
     * @returns {Object} 配置了连接池的axios实例
     */
    createAxiosInstance(config = {}) {
        const instance = axios.create({
            ...config,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            timeout: config.timeout || this.timeout
        });

        // 添加请求拦截器统计
        instance.interceptors.request.use(
            (requestConfig) => {
                this.stats.requestsServed++;
                return requestConfig;
            },
            (error) => Promise.reject(error)
        );

        // 添加响应拦截器统计
        instance.interceptors.response.use(
            (response) => {
                // 检查是否复用了连接
                if (response.request.reusedSocket) {
                    this.stats.connectionReuses++;
                }
                return response;
            },
            (error) => Promise.reject(error)
        );

        return instance;
    }

    /**
     * 更新连接池统计信息
     */
    updateStats() {
        // HTTP代理统计
        const httpSockets = this.httpAgent.sockets;
        const httpFreeSockets = this.httpAgent.freeSockets;
        
        // HTTPS代理统计
        const httpsSockets = this.httpsAgent.sockets;
        const httpsFreeSockets = this.httpsAgent.freeSockets;

        // 计算活跃和空闲连接数
        let activeConnections = 0;
        let freeConnections = 0;

        // HTTP连接统计
        Object.values(httpSockets).forEach(socketArray => {
            activeConnections += socketArray.length;
        });
        Object.values(httpFreeSockets).forEach(socketArray => {
            freeConnections += socketArray.length;
        });

        // HTTPS连接统计
        Object.values(httpsSockets).forEach(socketArray => {
            activeConnections += socketArray.length;
        });
        Object.values(httpsFreeSockets).forEach(socketArray => {
            freeConnections += socketArray.length;
        });

        this.stats.activeConnections = activeConnections;
        this.stats.freeConnections = freeConnections;
        this.stats.totalConnections = activeConnections + freeConnections;

        // 记录统计信息（仅在调试模式下）
        if (process.env.LOG_LEVEL === 'debug') {
            logger.debug('连接池统计更新', {
                type: 'connection_pool_stats',
                ...this.stats,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * 获取连接池状态
     * @returns {Object} 连接池状态信息
     */
    getStatus() {
        this.updateStats();
        
        const uptime = Date.now() - this.stats.lastResetTime;
        const reuseRate = this.stats.requestsServed > 0 ? 
            (this.stats.connectionReuses / this.stats.requestsServed * 100).toFixed(2) : 0;

        return {
            service: 'ConnectionPool',
            status: 'healthy',
            config: {
                maxSockets: this.maxSockets,
                maxFreeSockets: this.maxFreeSockets,
                keepAlive: this.keepAlive,
                timeout: this.timeout
            },
            stats: {
                ...this.stats,
                uptime,
                reuseRate: `${reuseRate}%`,
                avgRequestsPerSecond: uptime > 0 ? 
                    (this.stats.requestsServed / (uptime / 1000)).toFixed(2) : 0
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            totalConnections: this.stats.totalConnections,
            activeConnections: this.stats.activeConnections,
            freeConnections: this.stats.freeConnections,
            requestsServed: 0,
            connectionReuses: 0,
            lastResetTime: Date.now()
        };

        logger.info('连接池统计信息已重置', {
            type: 'connection_pool_reset',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 优雅关闭连接池
     */
    destroy() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }

        // 销毁所有代理
        this.httpAgent.destroy();
        this.httpsAgent.destroy();

        logger.info('连接池已销毁', {
            type: 'connection_pool_destroy',
            finalStats: this.stats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 获取健康状态
     * @returns {Object} 健康状态信息
     */
    getHealthStatus() {
        const status = this.getStatus();
        const isHealthy = status.stats.totalConnections <= this.maxSockets;

        return {
            service: 'ConnectionPool',
            status: isHealthy ? 'healthy' : 'degraded',
            details: status,
            timestamp: new Date().toISOString()
        };
    }
}

// 创建全局连接池实例
const connectionPool = new ConnectionPool({
    maxSockets: parseInt(process.env.HTTP_MAX_SOCKETS) || 50,
    maxFreeSockets: parseInt(process.env.HTTP_MAX_FREE_SOCKETS) || 10,
    timeout: parseInt(process.env.HTTP_TIMEOUT) || 30000,
    keepAlive: process.env.HTTP_KEEP_ALIVE !== 'false',
    keepAliveMsecs: parseInt(process.env.HTTP_KEEP_ALIVE_MSECS) || 1000
});

module.exports = {
    ConnectionPool,
    connectionPool
};