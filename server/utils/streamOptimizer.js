/**
 * 流式响应处理和传输效率优化器
 * 优化流式数据的处理、缓冲和传输
 */
const { Transform } = require('stream');
const logger = require('./logger');

class StreamOptimizer {
    constructor(options = {}) {
        this.bufferSize = options.bufferSize || 8192; // 8KB缓冲区
        this.flushInterval = options.flushInterval || 100; // 100ms刷新间隔
        this.compressionEnabled = options.compressionEnabled !== false;
        this.maxChunkSize = options.maxChunkSize || 64 * 1024; // 64KB最大块大小
        this.minChunkSize = options.minChunkSize || 1024; // 1KB最小块大小
        
        // 统计信息
        this.stats = {
            totalStreams: 0,
            activeStreams: 0,
            bytesProcessed: 0,
            chunksProcessed: 0,
            compressionRatio: 0,
            averageLatency: 0,
            totalLatency: 0,
            errors: 0
        };

        logger.info('流式优化器初始化完成', {
            type: 'stream_optimizer_init',
            bufferSize: this.bufferSize,
            flushInterval: this.flushInterval,
            compressionEnabled: this.compressionEnabled,
            maxChunkSize: this.maxChunkSize
        });
    }

    /**
     * 创建优化的流式处理器
     * @param {Object} options - 流处理选项
     * @returns {Transform} 优化的Transform流
     */
    createOptimizedStream(options = {}) {
        const streamId = this.generateStreamId();
        const startTime = Date.now();
        
        this.stats.totalStreams++;
        this.stats.activeStreams++;

        const optimizer = new StreamProcessor({
            streamId,
            bufferSize: options.bufferSize || this.bufferSize,
            flushInterval: options.flushInterval || this.flushInterval,
            compressionEnabled: options.compressionEnabled ?? this.compressionEnabled,
            maxChunkSize: options.maxChunkSize || this.maxChunkSize,
            minChunkSize: options.minChunkSize || this.minChunkSize,
            onStats: (stats) => this.updateStats(stats),
            onError: (error) => this.handleStreamError(streamId, error),
            onEnd: () => this.handleStreamEnd(streamId, startTime)
        });

        logger.debug('创建优化流处理器', {
            type: 'stream_created',
            streamId,
            activeStreams: this.stats.activeStreams
        });

        return optimizer;
    }

    /**
     * 优化Server-Sent Events流
     * @param {Object} response - HTTP响应对象
     * @param {Object} options - SSE选项
     * @returns {Object} 优化的SSE处理器
     */
    createOptimizedSSE(response, options = {}) {
        const streamId = this.generateStreamId();
        const startTime = Date.now();
        
        // 设置SSE头部
        response.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        // 立即发送SSE注释行以确保连接建立
        response.write(`: SSE connection established at ${new Date().toISOString()}\n\n`);

        const sseProcessor = new SSEProcessor({
            response,
            streamId,
            bufferSize: options.bufferSize || this.bufferSize,
            flushInterval: options.flushInterval || this.flushInterval,
            onStats: (stats) => this.updateStats(stats),
            onError: (error) => this.handleStreamError(streamId, error),
            onEnd: () => this.handleStreamEnd(streamId, startTime)
        });

        this.stats.totalStreams++;
        this.stats.activeStreams++;

        logger.debug('创建优化SSE处理器', {
            type: 'sse_created',
            streamId,
            activeStreams: this.stats.activeStreams
        });

        return sseProcessor;
    }

    /**
     * 更新统计信息
     * @param {Object} stats - 流统计信息
     */
    updateStats(stats) {
        this.stats.bytesProcessed += stats.bytesProcessed || 0;
        this.stats.chunksProcessed += stats.chunksProcessed || 0;
        
        if (stats.compressionRatio) {
            this.stats.compressionRatio = 
                (this.stats.compressionRatio + stats.compressionRatio) / 2;
        }
    }

    /**
     * 处理流错误
     * @param {string} streamId - 流ID
     * @param {Error} error - 错误对象
     */
    handleStreamError(streamId, error) {
        this.stats.errors++;
        this.stats.activeStreams = Math.max(0, this.stats.activeStreams - 1);

        logger.error('流处理错误', {
            type: 'stream_error',
            streamId,
            error: error.message,
            activeStreams: this.stats.activeStreams
        });
    }

    /**
     * 处理流结束
     * @param {string} streamId - 流ID
     * @param {number} startTime - 开始时间
     */
    handleStreamEnd(streamId, startTime) {
        const latency = Date.now() - startTime;
        this.stats.activeStreams = Math.max(0, this.stats.activeStreams - 1);
        this.stats.totalLatency += latency;
        this.stats.averageLatency = this.stats.totalLatency / this.stats.totalStreams;

        logger.debug('流处理完成', {
            type: 'stream_ended',
            streamId,
            latency,
            activeStreams: this.stats.activeStreams
        });
    }

    /**
     * 生成流ID
     * @returns {string}
     */
    generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取优化器状态
     * @returns {Object}
     */
    getStatus() {
        return {
            service: 'StreamOptimizer',
            status: 'healthy',
            config: {
                bufferSize: this.bufferSize,
                flushInterval: this.flushInterval,
                compressionEnabled: this.compressionEnabled,
                maxChunkSize: this.maxChunkSize,
                minChunkSize: this.minChunkSize
            },
            stats: {
                ...this.stats,
                throughput: this.stats.totalStreams > 0 ? 
                    (this.stats.bytesProcessed / this.stats.totalStreams).toFixed(0) + ' bytes/stream' : '0 bytes/stream',
                errorRate: this.stats.totalStreams > 0 ? 
                    (this.stats.errors / this.stats.totalStreams * 100).toFixed(2) + '%' : '0%'
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 获取健康状态
     * @returns {Object}
     */
    getHealthStatus() {
        const status = this.getStatus();
        const errorRate = this.stats.errors / Math.max(this.stats.totalStreams, 1);
        const isHealthy = errorRate < 0.1 && this.stats.activeStreams < 100;

        return {
            service: 'StreamOptimizer',
            status: isHealthy ? 'healthy' : 'degraded',
            details: status,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * 流处理器类
 */
class StreamProcessor extends Transform {
    constructor(options) {
        super({ objectMode: false });
        
        this.streamId = options.streamId;
        this.bufferSize = options.bufferSize;
        this.flushInterval = options.flushInterval;
        this.compressionEnabled = options.compressionEnabled;
        this.maxChunkSize = options.maxChunkSize;
        this.minChunkSize = options.minChunkSize;
        this.onStats = options.onStats;
        this.onError = options.onError;
        this.onEnd = options.onEnd;
        
        // 内部缓冲区
        this.buffer = Buffer.alloc(0);
        this.lastFlush = Date.now();
        this.bytesProcessed = 0;
        this.chunksProcessed = 0;
        
        // 定期刷新缓冲区
        this.flushTimer = setInterval(() => {
            this.flushBuffer();
        }, this.flushInterval);

        this.on('error', (error) => {
            if (this.onError) {
                this.onError(error);
            }
        });

        this.on('end', () => {
            this.flushBuffer(true);
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
            }
            if (this.onEnd) {
                this.onEnd();
            }
        });
    }

    /**
     * Transform流的_transform方法
     * @param {Buffer} chunk - 数据块
     * @param {string} encoding - 编码
     * @param {Function} callback - 回调函数
     */
    _transform(chunk, encoding, callback) {
        try {
            this.bytesProcessed += chunk.length;
            this.chunksProcessed++;
            
            // 将数据添加到缓冲区
            this.buffer = Buffer.concat([this.buffer, chunk]);
            
            // 如果缓冲区达到最大大小，立即刷新
            if (this.buffer.length >= this.maxChunkSize) {
                this.flushBuffer();
            }
            
            // 更新统计信息
            if (this.onStats) {
                this.onStats({
                    bytesProcessed: chunk.length,
                    chunksProcessed: 1
                });
            }
            
            callback();
        } catch (error) {
            callback(error);
        }
    }

    /**
     * 刷新缓冲区
     * @param {boolean} force - 是否强制刷新
     */
    flushBuffer(force = false) {
        const now = Date.now();
        const shouldFlush = force || 
                           this.buffer.length >= this.minChunkSize || 
                           (now - this.lastFlush) >= this.flushInterval;

        if (shouldFlush && this.buffer.length > 0) {
            let outputBuffer = this.buffer;
            
            // 如果启用压缩，尝试压缩数据
            if (this.compressionEnabled && this.buffer.length > 1024) {
                outputBuffer = this.compressBuffer(this.buffer);
            }
            
            this.push(outputBuffer);
            this.buffer = Buffer.alloc(0);
            this.lastFlush = now;
            
            logger.debug('缓冲区已刷新', {
                type: 'buffer_flushed',
                streamId: this.streamId,
                bufferSize: outputBuffer.length,
                compressed: outputBuffer !== this.buffer
            });
        }
    }

    /**
     * 压缩缓冲区数据
     * @param {Buffer} buffer - 原始缓冲区
     * @returns {Buffer} 压缩后的缓冲区
     */
    compressBuffer(buffer) {
        try {
            const zlib = require('zlib');
            const compressed = zlib.gzipSync(buffer);
            
            // 只有在压缩效果明显时才使用压缩数据
            if (compressed.length < buffer.length * 0.8) {
                if (this.onStats) {
                    this.onStats({
                        compressionRatio: compressed.length / buffer.length
                    });
                }
                return compressed;
            }
        } catch (error) {
            logger.warn('数据压缩失败', {
                type: 'compression_error',
                streamId: this.streamId,
                error: error.message
            });
        }
        
        return buffer;
    }
}

/**
 * SSE处理器类
 */
class SSEProcessor {
    constructor(options) {
        this.response = options.response;
        this.streamId = options.streamId;
        this.bufferSize = options.bufferSize;
        this.flushInterval = options.flushInterval;
        this.onStats = options.onStats;
        this.onError = options.onError;
        this.onEnd = options.onEnd;
        
        // 内部缓冲区
        this.buffer = [];
        this.lastFlush = Date.now();
        this.bytesProcessed = 0;
        this.messagesProcessed = 0;
        this.isEnded = false;
        this.isConnected = true;  // 添加连接状态标志
        
        // 定期刷新缓冲区
        this.flushTimer = setInterval(() => {
            this.flushBuffer();
        }, this.flushInterval);
        
        // 在构造函数中启动心跳机制
        // 5秒后发送第一个心跳
        this.firstHeartbeatTimer = setTimeout(() => {
            if (this.isConnectionAlive()) {
                logger.info('发送首个心跳', {
                    type: 'sse_first_heartbeat',
                    streamId: this.streamId
                });
                this.sendHeartbeat();
            }
        }, 5000);
        
        // 每5秒发送一次心跳（更频繁以确保连接保持活跃）
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnectionAlive()) {
                logger.debug('发送定期心跳', {
                    type: 'sse_heartbeat',
                    streamId: this.streamId,
                    timestamp: new Date().toISOString()
                });
                this.sendHeartbeat();
                
                // 同时发送SSE注释行以保持连接活跃
                // SSE规范中的注释行以冒号开头，不会被客户端处理
                this.response.write(`: keepalive ${new Date().toISOString()}\n\n`);
            } else {
                // 连接已关闭，清理心跳定时器
                clearInterval(this.heartbeatInterval);
                logger.debug('停止心跳：连接已关闭', {
                    type: 'sse_heartbeat_stopped',
                    streamId: this.streamId
                });
            }
        }, 5000);

        // 处理连接关闭
        this.response.on('close', () => {
            logger.debug('SSE连接关闭', {
                type: 'sse_connection_closed',
                streamId: this.streamId
            });
            this.isConnected = false;
            this.end();
        });

        this.response.on('error', (error) => {
            logger.debug('SSE连接错误', {
                type: 'sse_connection_error',
                streamId: this.streamId,
                error: error.message
            });
            this.isConnected = false;
            this.handleError(error);
        });
    }

    /**
     * 发送SSE消息
     * @param {string} event - 事件类型
     * @param {Object|string} data - 消息数据
     * @param {string} id - 消息ID
     */
    sendMessage(event, data, id = null) {
        if (this.isEnded || !this.isConnected) {
            logger.debug('跳过发送消息：连接已关闭', {
                type: 'sse_message_skipped',
                streamId: this.streamId,
                event: event,
                isEnded: this.isEnded,
                isConnected: this.isConnected
            });
            return;
        }

        try {
            const message = this.formatSSEMessage(event, data, id);
            // console.log('[SSE] 准备发送消息:', {
            //     event: event,
            //     dataLength: typeof data === 'string' ? data.length : JSON.stringify(data).length,
            //     messageLength: message.length,
            //     hasFollowUp: event === 'message_end' ? !!(data.followUpQuestions && data.followUpQuestions.length > 0) : 'N/A',
            //     followUpCount: event === 'message_end' && data.followUpQuestions ? data.followUpQuestions.length : 0
            // });
            
            this.buffer.push(message);
            this.bytesProcessed += message.length;
            this.messagesProcessed++;
            
            // 立即刷新缓冲区，确保数据及时发送
            this.flushBuffer(true);
            
            // 更新统计信息
            if (this.onStats) {
                this.onStats({
                    bytesProcessed: message.length,
                    chunksProcessed: 1
                });
            }
        } catch (error) {
            console.error('[SSE] 发送消息失败:', error);
            this.handleError(error);
        }
    }

    /**
     * 格式化SSE消息
     * @param {string} event - 事件类型
     * @param {Object|string} data - 消息数据
     * @param {string} id - 消息ID
     * @returns {string} 格式化的SSE消息
     */
    formatSSEMessage(event, data, id) {
        let message = '';
        
        if (id) {
            message += `id: ${id}\n`;
        }
        
        if (event) {
            message += `event: ${event}\n`;
        }
        
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
        message += `data: ${dataStr}\n\n`;
        
        // 调试：记录message_end事件的完整消息
        if (event === 'message_end') {
            console.log('[SSE] message_end事件的完整消息:', message.substring(0, 500));
        }
        
        return message;
    }

    /**
     * 获取缓冲区总大小
     * @returns {number}
     */
    getTotalBufferSize() {
        return this.buffer.reduce((total, message) => total + message.length, 0);
    }

    /**
     * 刷新缓冲区
     * @param {boolean} force - 是否强制刷新
     */
    flushBuffer(force = false) {
        const now = Date.now();
        const shouldFlush = force || 
                           this.buffer.length > 0 && 
                           ((now - this.lastFlush) >= this.flushInterval || 
                            this.getTotalBufferSize() >= this.bufferSize);

        if (shouldFlush && this.buffer.length > 0 && !this.isEnded && this.isConnected) {
            try {
                const messages = this.buffer.join('');
                console.log('[SSE] 刷新缓冲区:', {
                    messageCount: this.buffer.length,
                    dataSize: messages.length,
                    messages: messages.substring(0, 200) + (messages.length > 200 ? '...' : '')
                });
                
                this.response.write(messages);
                this.buffer = [];
                this.lastFlush = now;
                
                logger.debug('SSE缓冲区已刷新', {
                    type: 'sse_buffer_flushed',
                    streamId: this.streamId,
                    messageCount: this.buffer.length,
                    dataSize: messages.length
                });
            } catch (error) {
                console.error('[SSE] 刷新缓冲区失败:', error);
                this.handleError(error);
            }
        }
    }

    /**
     * 处理错误
     * @param {Error} error - 错误对象
     */
    handleError(error) {
        if (this.onError) {
            this.onError(error);
        }
        this.end();
    }

    /**
     * 结束SSE流
     */
    end() {
        if (this.isEnded) {
            return;
        }

        this.isEnded = true;
        this.isConnected = false;
        
        // 刷新剩余缓冲区
        this.flushBuffer(true);
        
        // 清理所有定时器
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        if (this.firstHeartbeatTimer) {
            clearTimeout(this.firstHeartbeatTimer);
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // 结束响应
        try {
            this.response.end();
        } catch (error) {
            // 忽略连接已关闭的错误
        }
        
        if (this.onEnd) {
            this.onEnd();
        }
        
        logger.debug('SSE流已结束', {
            type: 'sse_ended',
            streamId: this.streamId,
            messagesProcessed: this.messagesProcessed,
            bytesProcessed: this.bytesProcessed
        });
    }

    /**
     * 发送心跳消息
     */
    sendHeartbeat() {
        this.sendMessage('heartbeat', { 
            timestamp: Date.now(),
            status: 'alive',
            streamId: this.streamId
        });
    }

    /**
     * 检查连接是否仍然活跃
     */
    isConnectionAlive() {
        return this.isConnected && !this.isEnded;
    }

    /**
     * 安全地关闭连接（close方法的别名，保持向后兼容）
     */
    close() {
        this.end();
    }
}

// 创建全局流优化器实例
const streamOptimizer = new StreamOptimizer({
    bufferSize: parseInt(process.env.STREAM_BUFFER_SIZE) || 1024, // 减少缓冲区大小
    flushInterval: parseInt(process.env.STREAM_FLUSH_INTERVAL) || 50, // 减少刷新间隔
    compressionEnabled: process.env.STREAM_COMPRESSION !== 'false',
    maxChunkSize: parseInt(process.env.STREAM_MAX_CHUNK_SIZE) || 64 * 1024,
    minChunkSize: parseInt(process.env.STREAM_MIN_CHUNK_SIZE) || 512 // 减少最小块大小
});

module.exports = {
    StreamOptimizer,
    StreamProcessor,
    SSEProcessor,
    streamOptimizer
};