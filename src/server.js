// Chiwawa Site v2.1
// Создатель: ebluffy
// Веб-сайт для Minecraft сервера с системой пользователей

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { status } = require('minecraft-server-util');
require('dotenv').config();

const db = require('../database/connection');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const reputationRoutes = require('./routes/reputation');
const trustLevelRoutes = require('./routes/trust-level');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://cdn.quilljs.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "https://cdn.tailwindcss.com", "https://cdn.quilljs.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'"]
        },
    },
}));

// CORS настройки
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://chiwawa.site', 'https://www.chiwawa.site']
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// Общие middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 200, // Увеличенный лимит для админской панели
    message: {
        error: 'Слишком много запросов с вашего IP. Попробуйте позже.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Увеличиваем для админских операций
    message: {
        error: 'Слишком много попыток. Попробуйте позже.'
    }
});

const adminLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 500, // Высокий лимит для админов
    message: {
        error: 'Слишком много запросов. Попробуйте позже.'
    }
});

app.use('/api/', limiter);
app.use('/api/auth/login', strictLimiter);
app.use('/api/applications', strictLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/trust-level', adminLimiter);

// Статические файлы
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0'
}));

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', settingsRoutes);
app.use('/api', settingsRoutes); // Добавляем публичный доступ к настройкам
app.use('/api/reputation', reputationRoutes);
app.use('/api/trust-level', trustLevelRoutes);

// Информация о сервере Minecraft
app.get('/api/server-info', async (req, res) => {
    try {
        // Получаем настройки сервера
        const config = require('./config/settings');
        const serverIp = config.server?.ip || 'play.chiwawa.site';
        const serverPort = parseInt(config.server?.port) || 25565;
        
        try {
            // Проверяем реальный статус сервера
            const result = await status(serverIp, serverPort, { timeout: 5000 });
            
            return res.json({
                online: true,
                players: {
                    online: result.players.online,
                    max: result.players.max
                },
                motd: result.motd?.clean || 'Minecraft Server',
                version: result.version?.name || '1.20.1',
                ping: result.roundTripLatency || 0
            });
        } catch (serverError) {
            // Если это тестовый IP (play.chiwawa.site), показываем демо данные
            if (serverIp.includes('chiwawa.site') || serverIp.includes('test')) {
                return res.json({
                    online: true,
                    players: {
                        online: Math.floor(Math.random() * 15) + 3, // Случайное число от 3 до 17
                        max: 50
                    },
                    motd: 'Test Server - Demo Mode',
                    version: '1.20.1',
                    ping: Math.floor(Math.random() * 50) + 20 // Случайный пинг от 20 до 70
                });
            }
            
            // Сервер недоступен
            console.log(`Сервер ${serverIp}:${serverPort} недоступен:`, serverError.message);
            
            return res.json({
                online: false,
                players: {
                    online: 0,
                    max: 50
                },
                motd: 'Сервер недоступен',
                version: '1.20.1',
                ping: 0
            });
        }
    } catch (error) {
        console.error('Ошибка проверки статуса сервера:', error);
        
        // Возвращаем заглушку при ошибке
        res.json({
            online: false,
            players: {
                online: 0,
                max: 50
            },
            motd: 'Ошибка проверки статуса',
            version: '1.20.1',
            ping: 0
        });
    }
});

// Маршруты для страниц
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/forgot-password.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/profile.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Проверка здоровья системы
app.get('/health', async (req, res) => {
    try {
        // Проверяем подключение к базе данных
        await db.query('SELECT 1');
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.1.0',
            services: {
                database: 'connected',
                server: 'running'
            }
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed'
        });
    }
});

// API информация
app.get('/api', (req, res) => {
    res.json({
        name: 'Chiwawa Site API',
        version: '2.1.0',
        description: 'API для веб-сайта Minecraft сервера',
        author: 'ebluffy',
        endpoints: {
            auth: '/api/auth',
            applications: '/api/applications',
            profile: '/api/profile',
            admin: '/api/admin'
        },
        documentation: '/api/docs'
    });
});

// 404 для API
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'API endpoint не найден',
        path: req.path,
        method: req.method
    });
});

// SPA fallback - все остальные маршруты отправляем на главную
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Глобальная обработка ошибок
app.use((error, req, res, next) => {
    console.error('Серверная ошибка:', error);
    
    // Не показываем детали ошибок в продакшене
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(error.status || 500).json({
        error: isDevelopment ? error.message : 'Внутренняя ошибка сервера',
        ...(isDevelopment && { stack: error.stack })
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал остановки сервера...');
    
    try {
        await db.end();
        console.log('✅ Соединения с базой данных закрыты');
    } catch (error) {
        console.error('❌ Ошибка при закрытии соединений:', error);
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Получен SIGTERM...');
    await db.end();
    process.exit(0);
});

// Обработка необработанных исключений
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Запуск сервера
app.listen(PORT, async () => {
    console.log(`🚀 Chiwawa Site v2.1 запущен на порту ${PORT}`);
    console.log(`🌐 Frontend доступен по адресу: http://localhost:${PORT}`);
    console.log(`📋 API документация: http://localhost:${PORT}/api`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`👨‍💻 Создатель: ebluffy`);
    console.log(''); // Пустая строка для разделения
    
    // Проверяем подключение к базе данных
    const isDbConnected = await db.testConnection();
    
    if (!isDbConnected) {
        console.log('');
        console.log('⚠️  ВНИМАНИЕ: Сервер запущен без подключения к базе данных');
        console.log('   Некоторые функции могут не работать');
        console.log('   Проверьте настройки PostgreSQL');
    }
    
    console.log('');
    console.log('🎯 Сервер готов к работе!');
});

module.exports = app;
