// Маршруты авторизации
// Создатель: ebluffy

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Middleware для проверки токена
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Токен доступа отсутствует' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Проверяем, что сессия активна
        const sessionResult = await db.query(
            'SELECT s.*, u.* FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW() AND s.is_active = true',
            [Buffer.from(token).toString('base64')]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Недействительная сессия' });
        }

        req.user = sessionResult.rows[0];
        
        // Проверяем роль пользователя из таблицы admins
        const adminResult = await db.query(
            'SELECT role FROM admins WHERE user_id = $1',
            [req.user.id]
        );
        
        if (adminResult.rows.length > 0) {
            req.user.role = adminResult.rows[0].role;
        } else {
            req.user.role = 'user';
        }
        
        next();
    } catch (error) {
        console.error('Ошибка проверки токена:', error);
        return res.status(403).json({ error: 'Недействительный токен' });
    }
};

// Middleware для проверки роли
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Не авторизован' });
        }

        const userRoles = Array.isArray(roles) ? roles : [roles];
        if (!userRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        next();
    };
};

// Функция для записи попытки входа
const logLoginAttempt = async (email, ip, userAgent, success) => {
    try {
        await db.query(
            'INSERT INTO login_logs (user_id, ip_address, user_agent, success) VALUES ((SELECT id FROM users WHERE email = $1), $2, $3, $4)',
            [email, ip, userAgent, success]
        );
    } catch (error) {
        console.error('Ошибка записи попытки входа:', error);
    }
};

// Функция для проверки ограничений на попытки входа
const checkLoginAttempts = async (ip, email) => {
    const result = await db.query(
        `SELECT COUNT(*) as attempts FROM login_logs 
         WHERE (ip_address = $1 OR user_id = (SELECT id FROM users WHERE email = $2)) 
         AND login_time > NOW() - INTERVAL '1 hour' 
         AND success = false`,
        [ip, email]
    );

    return parseInt(result.rows[0].attempts);
};

// POST /api/auth/login - Вход в систему
router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
    body('password').isLength({ min: 6 }).withMessage('Пароль должен быть минимум 6 символов')
], async (req, res) => {
    try {
        // Проверка валидации
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { email, password, remember = false } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';

        // Проверяем количество неудачных попыток
        const failedAttempts = await checkLoginAttempts(ip, email);
        if (failedAttempts >= 5) {
            await logLoginAttempt(email, ip, userAgent, false);
            return res.status(429).json({
                error: 'Слишком много неудачных попыток входа. Попробуйте через час.'
            });
        }

        // Находим пользователя
        const userResult = await db.query(
            'SELECT * FROM users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (userResult.rows.length === 0) {
            await logLoginAttempt(email, ip, userAgent, false);
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = userResult.rows[0];

        // Проверяем пароль
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            await logLoginAttempt(email, ip, userAgent, false);
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Создаём JWT токен
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role
        };

        const expiresIn = remember ? '30d' : '24h';
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn });

        // Сохраняем сессию в базе данных
        const sessionId = uuidv4();
        const expiresAt = new Date();
        expiresAt.setTime(expiresAt.getTime() + (remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));

        await db.query(
            'INSERT INTO user_sessions (id, user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
            [sessionId, user.id, Buffer.from(token).toString('base64'), expiresAt, ip, userAgent]
        );

        // Обновляем время последнего входа
        await db.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        // Записываем успешную попытку входа
        await logLoginAttempt(email, ip, userAgent, true);

        // Записываем активность
        await db.query(
            'INSERT INTO user_activity (user_id, activity_type, description, ip_address) VALUES ($1, $2, $3, $4)',
            [user.id, 'login', 'Вход в систему', ip]
        );

        // Возвращаем данные пользователя (без пароля)
        const { password_hash, ...userWithoutPassword } = user;

        res.json({
            success: true,
            message: 'Успешная авторизация',
            token,
            user: userWithoutPassword
        });

    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/logout - Выход из системы
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (token) {
            // Деактивируем сессию
            await db.query(
                'UPDATE user_sessions SET is_active = false WHERE token_hash = $1',
                [Buffer.from(token).toString('base64')]
            );

            // Записываем активность
            await db.query(
                'INSERT INTO user_activity (user_id, activity_type, description, ip_address) VALUES ($1, $2, $3, $4)',
                [req.user.id, 'logout', 'Выход из системы', req.ip]
            );
        }

        res.json({ success: true, message: 'Успешный выход из системы' });
    } catch (error) {
        console.error('Ошибка выхода:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/auth/verify - Проверка токена
router.get('/verify', authenticateToken, async (req, res) => {
    try {
        // Получаем актуальные данные пользователя
        const userResult = await db.query(
            'SELECT u.*, s.playtime_seconds, s.reputation, s.friends_count FROM users u LEFT JOIN user_stats s ON u.id = s.user_id WHERE u.id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const { password_hash, ...userWithoutPassword } = userResult.rows[0];

        res.json({
            success: true,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Ошибка проверки токена:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/refresh - Обновление токена
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const tokenPayload = {
            userId: req.user.id,
            email: req.user.email,
            role: req.user.role
        };

        const newToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
        
        // Обновляем сессию
        const authHeader = req.headers['authorization'];
        const oldToken = authHeader && authHeader.split(' ')[1];
        
        await db.query(
            'UPDATE user_sessions SET token_hash = $1, expires_at = NOW() + INTERVAL \'24 hours\' WHERE token_hash = $2',
            [Buffer.from(newToken).toString('base64'), Buffer.from(oldToken).toString('base64')]
        );

        res.json({
            success: true,
            token: newToken
        });
    } catch (error) {
        console.error('Ошибка обновления токена:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Экспорт middleware
router.authenticateToken = authenticateToken;
router.requireRole = requireRole;

module.exports = router;
