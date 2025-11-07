// app.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./server/config/config');

// 引入路由
const callbackRoutes = require('./server/routes/callback');
const authRoutes = require('./server/routes/auth');
const apiRoutes = require('./server/routes/api');

const logger = require('./server/utils/logger');

// 创建Express应用
const app = express();
const port = config.port || 3000;

// 引入环境检测工具
const { detectEnvironment } = require('./server/utils/envDetector');

// 设置中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // 生产环境使用HTTPS
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7天
    }
}));


// 专门处理XML格式的中间件
app.use((req, res, next) => {
    if (req.is('text/xml') || req.is('application/xml')) {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            req.rawBody = data;
            next();
        });
    } else {
        next();
    }
});

// 注册路由
app.use('/callback', callbackRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// 添加聊天页面路由
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// 开发环境测试路由
app.get('/dev', (req, res) => {
    if (process.env.NODE_ENV === 'development') {
        const testUserId = process.env.TEST_USER_ID || 'test_user_001';
        const testUserName = process.env.TEST_USER_NAME || '测试用户';
        res.redirect(`/chat.html?userId=${testUserId}&userName=${encodeURIComponent(testUserName)}`);
    } else {
        res.status(403).send('此路由仅在开发环境可用');
    }
});

// 根路由 - 根据环境自动选择认证方式
app.get('/', (req, res) => {
    // 开发模式直接跳转到聊天页面(带测试用户参数)
    if (process.env.NODE_ENV === 'development') {
        const testUserId = process.env.TEST_USER_ID || 'test_user_001';
        const testUserName = process.env.TEST_USER_NAME || '测试用户';
        return res.redirect(`/chat.html?userId=${testUserId}&userName=${encodeURIComponent(testUserName)}`);
    }
    
    // 生产模式 - 检测环境
    const env = detectEnvironment(req);
    
    if (env.isWeCom) {
        // 企微环境,重定向到登录路由(触发OAuth)
        console.log('企微环境访问首页,重定向到登录流程');
        res.redirect('/auth/login');
    } else {
        // 浏览器环境,显示QR码登录页面
        console.log('浏览器环境访问首页,显示扫码页面');
        res.sendFile(path.join(__dirname, 'public', 'qrcode.html'));
    }
});

// 404处理
app.use((req, res) => {
    res.status(404).send('页面不存在');
});

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error('应用错误:', err);
    res.status(500).json({
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
    });
});

// 启动服务器 - Fixed message pairing
app.listen(port, () => {
    logger.info(`服务器运行在端口 ${port}`);

    // 应用启动完成
    if (process.env.NODE_ENV !== 'test') {
        setTimeout(() => {
            logger.info('应用启动完成', {
                type: 'app_startup_complete',
                port: port,
                timestamp: new Date().toISOString()
            });
        }, 5000); // 延迟5秒，确保所有组件初始化完成
    }
});

// 优雅关闭处理
process.on('SIGTERM', () => {
    logger.info('收到SIGTERM信号，开始优雅关闭', {
        type: 'app_shutdown_start',
        timestamp: new Date().toISOString()
    });


    setTimeout(() => {
        logger.info('应用已优雅关闭', {
            type: 'app_shutdown_complete',
            timestamp: new Date().toISOString()
        });
        process.exit(0);
    }, 1000);
});

process.on('SIGINT', () => {
    logger.info('收到SIGINT信号，开始优雅关闭', {
        type: 'app_shutdown_start',
        timestamp: new Date().toISOString()
    });


    setTimeout(() => {
        logger.info('应用已优雅关闭', {
            type: 'app_shutdown_complete',
            timestamp: new Date().toISOString()
        });
        process.exit(0);
    }, 1000);
});
