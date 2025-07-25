// Создатель: ebluffy

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы (для обслуживания frontend)
app.use(express.static(path.join(__dirname, '../website')));

// Файл для логирования заявок
const APPLICATIONS_LOG = path.join(__dirname, 'applications.log');

// Утилиты для валидации
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateApplicationData(data) {
    const { minecraft_nick, discord, email, reason } = data;
    
    if (!minecraft_nick || !discord || !email || !reason) {
        return { valid: false, error: 'Все поля обязательны для заполнения' };
    }
    
    if (minecraft_nick.trim().length < 3 || minecraft_nick.trim().length > 16) {
        return { valid: false, error: 'Ник в Minecraft должен быть от 3 до 16 символов' };
    }
    
    if (!validateEmail(email.trim())) {
        return { valid: false, error: 'Введите корректный email адрес' };
    }
    
    if (reason.trim().length < 10) {
        return { valid: false, error: 'Опишите причину более подробно (минимум 10 символов)' };
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
    
    const logLine = `${timestamp} | ${applicationData.minecraft_nick} | ${applicationData.discord} | ${applicationData.email} | ${applicationData.reason}\n`;
    
    try {
        fs.appendFileSync(APPLICATIONS_LOG, logLine, 'utf8');
        console.log('✅ Новая заявка:', {
            timestamp,
            minecraft_nick: applicationData.minecraft_nick,
            discord: applicationData.discord,
            email: applicationData.email
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
            discord: req.body.discord.trim(),
            email: req.body.email.trim().toLowerCase(),
            reason: req.body.reason.trim()
        };
        
        // Логируем заявку
        logApplication(applicationData);
        
        res.json({
            success: true,
            message: 'Заявка успешно отправлена! Мы рассмотрим её в ближайшее время.'
        });
        
    } catch (error) {
        console.error('❌ Ошибка обработки заявки:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/status - Статус сервера
app.get('/api/status', (req, res) => {
    // Заглушка - пока возвращаем случайный статус
    // В будущем здесь будет реальная проверка статуса Minecraft сервера
    const isOnline = Math.random() > 0.3; // 70% вероятность что сервер онлайн
    
    res.json({
        online: isOnline,
        timestamp: new Date().toISOString(),
        // Дополнительные поля для будущего расширения
        players: isOnline ? Math.floor(Math.random() * 20) : 0,
        maxPlayers: 20
    });
    
    console.log(`🔍 Проверка статуса сервера: ${isOnline ? 'онлайн' : 'оффлайн'}`);
});

// GET /api/applications (бонус) - Просмотр заявок (только для админов)
app.get('/api/applications', (req, res) => {
    try {
        if (!fs.existsSync(APPLICATIONS_LOG)) {
            return res.json({ applications: [] });
        }
        
        const logContent = fs.readFileSync(APPLICATIONS_LOG, 'utf8');
        const lines = logContent.trim().split('\n').filter(line => line.length > 0);
        
        const applications = lines.map(line => {
            const parts = line.split(' | ');
            return {
                timestamp: parts[0],
                minecraft_nick: parts[1],
                discord: parts[2],
                email: parts[3],
                reason: parts[4]
            };
        });
        
        res.json({ applications: applications.reverse() }); // Новые заявки сверху
    } catch (error) {
        console.error('❌ Ошибка чтения заявок:', error);
        res.status(500).json({
            error: 'Ошибка чтения заявок'
        });
    }
});

// Обслуживание frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../website/index.html'));
});

// 404 для API
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'API endpoint не найден'
    });
});

// 404 для всех остальных маршрутов
app.use('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../website/index.html'));
});

// Обработка ошибок
app.use((error, req, res, next) => {
    console.error('❌ Серверная ошибка:', error);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера'
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Chiwawa Server Backend запущен на порту ${PORT}`);
    console.log(`🌐 Frontend доступен по адресу: http://localhost:${PORT}`);
    console.log(`📋 API endpoints:`);
    console.log(`   POST /api/apply - Подача заявки`);
    console.log(`   GET /api/status - Статус сервера`);
    console.log(`   GET /api/applications - Просмотр заявок`);
    console.log(`📝 Заявки логируются в: ${APPLICATIONS_LOG}`);
    console.log(`👨‍💻 Создатель: ebluffy`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал остановки сервера...');
    console.log('✅ Сервер корректно остановлен');
    process.exit(0);
});
