// Chiwawa Server Backend v2.0
// Создатель: ebluffy
// Полная система с PostgreSQL, авторизацией и многостраничной архитектурой

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const db = require('./database/connection');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const applicationRoutes = require('./routes/applications');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const serverRoutes = require('./routes/server');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
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
    max: 100, // Максимум 100 запросов с одного IP
    message: {
        error: 'Слишком много запросов с вашего IP. Попробуйте позже.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Для чувствительных операций
    message: {
        error: 'Слишком много попыток. Попробуйте позже.'
    }
});

app.use('/api/', limiter);
app.use('/api/auth/login', strictLimiter);
app.use('/api/applications', strictLimiter);

// Статические файлы
app.use(express.static(path.join(__dirname, '../website'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0'
}));

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/server', serverRoutes);

// Маршруты для страниц
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../website/index.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../website/profile.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../website/admin.html'));
});

// Проверка здоровья системы
app.get('/health', async (req, res) => {
    try {
        // Проверяем подключение к базе данных
        await db.query('SELECT 1');
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
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
        name: 'Chiwawa Server API',
        version: '2.0.0',
        description: 'API для управления Minecraft сервером и сообществом',
        author: 'ebluffy',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            applications: '/api/applications',
            profile: '/api/profile',
            admin: '/api/admin',
            server: '/api/server'
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
    res.sendFile(path.join(__dirname, '../website/index.html'));
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
    console.log(`🚀 Chiwawa Server Backend v2.0 запущен на порту ${PORT}`);
    console.log(`🌐 Frontend доступен по адресу: http://localhost:${PORT}`);
    console.log(`📋 API документация: http://localhost:${PORT}/api`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`👨‍💻 Создатель: ebluffy`);
    
    // Проверяем подключение к базе данных
    try {
        await db.query('SELECT NOW() as server_time');
        console.log('✅ Подключение к PostgreSQL установлено');
    } catch (error) {
        console.error('❌ Ошибка подключения к PostgreSQL:', error.message);
        console.log('📝 Убедитесь, что PostgreSQL запущен и настройки в .env корректны');
    }
});

module.exports = app;
