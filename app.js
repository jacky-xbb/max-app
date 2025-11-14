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
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 86400000 // 静态资源缓存1天（86400秒）
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 安全响应头中间件
app.use((req, res, next) => {
    // 移除 X-Powered-By 头
    res.removeHeader('X-Powered-By');
    
    // 设置安全响应头
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    
    // 为 HTML 页面设置不缓存策略
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    next();
});

// 配置session
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction, // 生产环境使用HTTPS
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax', // 生产环境跨站场景需要 none，开发环境使用 lax
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

// POST 根路由 - 处理从 SAP Portal 等跨站 POST 请求，重定向到 GET /
app.post('/', (req, res) => {
    logger.info('收到 POST / 请求，重定向到 GET /', {
        type: 'post_root_redirect',
        query: req.query,
        timestamp: new Date().toISOString()
    });
    
    // 构建重定向 URL，保留查询参数
    const queryString = Object.keys(req.query).length > 0
        ? '?' + new URLSearchParams(req.query).toString()
        : '';
    const redirectUrl = '/' + queryString;
    
    // 302 重定向，浏览器会自动将后续请求改为 GET
    res.redirect(302, redirectUrl);
});

// 根路由 - 根据环境自动选择认证方式
app.get('/', (req, res) => {
    // 开发模式直接跳转到聊天页面(带测试用户参数)
    if (process.env.NODE_ENV === 'development') {
        const testUserId = process.env.TEST_USER_ID || 'test_user_001';
        const testUserName = process.env.TEST_USER_NAME || '测试用户';
        return res.redirect(`/chat.html?userId=${testUserId}&userName=${encodeURIComponent(testUserName)}`);
    }
    
    // 生产模式 - 先检查登录状态
    // 如果已登录，直接跳转到聊天页面
    if (req.session && req.session.userId) {
        console.log('用户已登录，直接跳转到聊天页面', {
            userId: req.session.userId,
            userName: req.session.userName
        });
        return res.redirect('/chat.html');
    }
    
    // 未登录 - 检测环境
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
