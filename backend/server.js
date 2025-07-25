// Создатель: ebluffy

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const applicationRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');

// Безопасность
app.use(helmet());

// Общий лимит запросов
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов на IP
    message: 'Слишком много запросов с вашего IP, попробуйте позже'
});

app.use(generalLimiter);

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware для получения IP адреса
app.use((req, res, next) => {
    req.ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null);
    next();
});

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

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

// API для получения информации о сервере (совместимость)
app.get('/api/server-info', async (req, res) => {
    try {
        res.json({
            name: "Chiwawa Server",
            version: "1.20.1",
            online: true,
            players: {
                online: 5,
                max: 50
            },
            description: "Выживание с модификациями и отличным сообществом!",
            ip: "212.15.49.139",
            port: 25565,
            last_updated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Ошибка получения информации о сервере:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 404 для API маршрутов
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint не найден' });
});

// Утилиты для валидации
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateApplicationData(data) {
    const { minecraft_nick, age, discord, email, experience, motivation, plans } = data;
    
    // Проверка обязательных полей
    if (!minecraft_nick || !age || !discord || !email || !experience || !motivation || !plans) {
        return { valid: false, error: 'Все поля обязательны для заполнения' };
    }
    
    // Валидация Minecraft ника
    if (minecraft_nick.trim().length < 3 || minecraft_nick.trim().length > 16) {
        return { valid: false, error: 'Minecraft ник должен быть от 3 до 16 символов' };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(minecraft_nick.trim())) {
        return { valid: false, error: 'Minecraft ник может содержать только латинские буквы, цифры и подчеркивания' };
    }
    
    // Валидация email
    if (!validateEmail(email.trim())) {
        return { valid: false, error: 'Введите корректный email адрес' };
    }
    
    // Валидация возраста
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 10 || ageNum > 99) {
        return { valid: false, error: 'Возраст должен быть от 10 до 99 лет' };
    }
    
    // Валидация мотивации
    if (motivation.trim().length < 50) {
        return { valid: false, error: 'Описание мотивации должно содержать минимум 50 символов' };
    }
    
    if (motivation.trim().length > 800) {
        return { valid: false, error: 'Описание мотивации слишком длинное (максимум 800 символов)' };
    }
    
    // Валидация планов
    if (plans.trim().length < 30) {
        return { valid: false, error: 'Опишите ваши планы более подробно (минимум 30 символов)' };
    }
    
    if (plans.trim().length > 600) {
        return { valid: false, error: 'Описание планов слишком длинное (максимум 600 символов)' };
    }
    
    return { valid: true };
}

// Функция для логирования заявок
function logApplication(applicationData) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        ...applicationData
    };
    
    const logLine = `${timestamp} | ${applicationData.minecraft_nick} | ${applicationData.age} | ${applicationData.discord} | ${applicationData.email} | ${applicationData.experience} | ${applicationData.motivation} | ${applicationData.plans}\n`;
    
    try {
        fs.appendFileSync(APPLICATIONS_LOG, logLine, 'utf8');
        console.log('✅ Новая заявка:', {
            timestamp,
            minecraft_nick: applicationData.minecraft_nick,
            age: applicationData.age,
            discord: applicationData.discord,
            email: applicationData.email,
            experience: applicationData.experience
        });
    } catch (error) {
        console.error('❌ Ошибка записи в лог:', error);
    }
}

// API Routes

// POST /api/apply - Подача заявки
app.post('/api/apply', (req, res) => {
    console.log('📝 Получена заявка:', req.body);
    
    try {
        const validation = validateApplicationData(req.body);
        
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }
        
        // Очищаем данные
        const applicationData = {
            minecraft_nick: req.body.minecraft_nick.trim(),
            age: parseInt(req.body.age),
            discord: req.body.discord.trim(),
            email: req.body.email.trim().toLowerCase(),
            experience: req.body.experience,
            motivation: req.body.motivation.trim(),
            plans: req.body.plans.trim()
        };
        
        // Логируем заявку
        logApplication(applicationData);
        
        res.json({
            success: true,
            message: 'Заявка успешно отправлена! Мы рассмотрим её в ближайшее время.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Ошибка обработки заявки:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка сервера. Попробуйте позже.'
        });
    }
});

// Статические файлы (для обслуживания frontend)
app.use(express.static(path.join(__dirname, '../website')));

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера'
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🌐 Веб-интерфейс: http://localhost:${PORT}`);
    console.log(`� Профиль: http://localhost:${PORT}/profile`);
    console.log(`⚙️ Админ-панель: http://localhost:${PORT}/admin`);
    console.log(`📋 API документация:`);
    console.log(`   Auth: /api/auth/*`);
    console.log(`   Profile: /api/profile/*`);
    console.log(`   Applications: /api/applications/*`);
    console.log(`   Admin: /api/admin/*`);
});
