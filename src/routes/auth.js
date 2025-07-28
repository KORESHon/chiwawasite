// Маршруты авторизации
// Создатель: ebluffy

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../../database/connection');
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
        
        // Роль уже есть в таблице users, больше не нужно запрашивать отдельно
        if (!req.user.role) {
            req.user.role = 'user'; // Значение по умолчанию
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

// POST /api/auth/register - Регистрация нового пользователя
router.post('/register', [
    body('minecraft_nick')
        .isLength({ min: 3, max: 32 })
        .withMessage('Minecraft ник должен быть от 3 до 32 символов')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Minecraft ник может содержать только буквы, цифры и подчеркивания'),
    body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Пароль должен быть минимум 8 символов')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Пароль должен содержать строчные, заглавные буквы и цифры'),
    body('first_name').optional().isLength({ max: 50 }).withMessage('Имя не должно превышать 50 символов')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Ошибка валидации',
            details: errors.array()
        });
    }

    try {
        const { minecraft_nick, email, password, first_name } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;

        // Проверяем, не существует ли уже пользователь с таким email или ником
        const existingUser = await db.query(
            'SELECT id, email, nickname FROM users WHERE email = $1 OR nickname = $2',
            [email, minecraft_nick]
        );

        if (existingUser.rows.length > 0) {
            const existing = existingUser.rows[0];
            if (existing.email === email) {
                return res.status(400).json({
                    error: 'Пользователь с таким email уже существует'
                });
            }
            if (existing.nickname === minecraft_nick) {
                return res.status(400).json({
                    error: 'Пользователь с таким Minecraft ником уже существует'
                });
            }
        }

        // Хешируем пароль
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Создаем пользователя
        const result = await db.query(
            `INSERT INTO users (nickname, email, password_hash, first_name, registered_at) 
             VALUES ($1, $2, $3, $4, NOW()) 
             RETURNING id, nickname, email, first_name, registered_at`,
            [minecraft_nick, email, passwordHash, first_name || null]
        );

        const newUser = result.rows[0];

        // Создаем начальную статистику игрока
        await db.query(`
            INSERT INTO player_stats (
                user_id, total_minutes, daily_limit_minutes, is_time_limited,
                current_level, email_verified, discord_verified, 
                minecraft_verified, reputation, total_logins, warnings_count
            ) VALUES ($1, 0, 600, true, 0, false, false, false, 0, 0, 0)
        `, [newUser.id]);

        // Логируем успешную регистрацию
        await logLoginAttempt(newUser.id, clientIp, req.get('User-Agent'), true);

        // Автоматически отправляем email подтверждения
        try {
            const verificationToken = uuidv4();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

            await db.query(
                'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
                [newUser.id, verificationToken, expiresAt]
            );

            console.log(`📧 Токен подтверждения email для ${email}: ${verificationToken}`);
            console.log(`🌐 Ссылка: ${req.protocol}://${req.get('host')}/verify-email?token=${verificationToken}`);
        } catch (emailError) {
            console.error('Ошибка создания токена подтверждения email:', emailError);
            // Не прерываем регистрацию из-за ошибки отправки email
        }

        console.log(`✅ Новая регистрация: ${minecraft_nick} (${email})`);

        res.status(201).json({
            message: 'Регистрация прошла успешно! Проверьте email для подтверждения адреса.',
            user: {
                id: newUser.id,
                nickname: newUser.nickname,
                email: newUser.email,
                first_name: newUser.first_name,
                registered_at: newUser.registered_at
            }
        });

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        
        if (error.code === '23505') { // Нарушение уникальности
            return res.status(400).json({
                error: 'Пользователь с таким email или ником уже существует'
            });
        }

        res.status(500).json({
            error: 'Внутренняя ошибка сервера при регистрации'
        });
    }
});

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
            'SELECT * FROM users WHERE id = $1 AND is_active = true',
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

// POST /api/auth/send-verification - Отправка письма с подтверждением email
router.post('/send-verification', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        
        if (user.is_email_verified) {
            return res.status(400).json({ error: 'Email уже подтвержден' });
        }

        // Генерируем токен для подтверждения
        const verificationToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

        // Сохраняем токен в базе данных
        await db.query(`
            INSERT INTO email_verification_tokens (user_id, token, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) 
            DO UPDATE SET token = $2, expires_at = $3, created_at = NOW()
        `, [user.id, verificationToken, expiresAt]);

        // Здесь будет отправка email через SMTP
        // Пока просто возвращаем успех
        res.json({ 
            message: 'Письмо с подтверждением отправлено',
            verification_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`
        });

    } catch (error) {
        console.error('Ошибка отправки письма верификации:', error);
        res.status(500).json({ error: 'Ошибка отправки письма' });
    }
});

// GET /api/auth/verify-email - Подтверждение email по токену
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Токен подтверждения отсутствует' });
        }

        // Проверяем токен
        const tokenResult = await db.query(`
            SELECT ev.*, u.email 
            FROM email_verification_tokens ev
            JOIN users u ON ev.user_id = u.id
            WHERE ev.token = $1 AND ev.expires_at > NOW()
        `, [token]);

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Недействительный или истёкший токен' });
        }

        const tokenData = tokenResult.rows[0];

        // Обновляем статус подтверждения email
        await db.query(`
            UPDATE player_stats 
            SET email_verified = true
            WHERE user_id = $1
        `, [tokenData.user_id]);

        // Удаляем использованный токен
        await db.query(`
            DELETE FROM email_verification_tokens WHERE token = $1
        `, [token]);

        res.json({ message: 'Email успешно подтвержден' });

    } catch (error) {
        console.error('Ошибка подтверждения email:', error);
        res.status(500).json({ error: 'Ошибка подтверждения email' });
    }
});

// GET /api/auth/discord - Переадресация на Discord OAuth
router.get('/discord', (req, res) => {
    const discordClientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/discord/callback`);
    const scope = encodeURIComponent('identify email');
    
    if (!discordClientId) {
        return res.status(500).json({ error: 'Discord OAuth не настроен' });
    }
    
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${discordClientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    
    res.redirect(discordAuthUrl);
});

// GET /api/auth/discord/callback - Обработка ответа от Discord
router.get('/discord/callback', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            return res.redirect('/?error=discord_auth_failed');
        }

        // Обмениваем код на токен
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/discord/callback`
            })
        });

        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
            return res.redirect('/?error=discord_token_failed');
        }

        // Получаем информацию о пользователе Discord
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        const discordUser = await userResponse.json();
        
        // Здесь нужно связать с авторизованным пользователем
        // Пока просто перенаправляем с успехом
        res.redirect(`/profile?discord_linked=${discordUser.username}%23${discordUser.discriminator}`);

    } catch (error) {
        console.error('Ошибка Discord OAuth:', error);
        res.redirect('/?error=discord_oauth_error');
    }
});

// POST /api/auth/forgot-password - Отправка ссылки для сброса пароля
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Некорректный email адрес'
            });
        }

        const { email } = req.body;

        // Проверяем, существует ли пользователь
        const userResult = await db.query(
            'SELECT id, nickname FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            // В целях безопасности возвращаем тот же ответ
            return res.json({
                message: 'Если email существует в системе, ссылка для сброса пароля была отправлена'
            });
        }

        const user = userResult.rows[0];
        const resetToken = uuidv4();
        const expiresAt = new Date(Date.now() + 3600000); // 1 час

        // Удаляем старые токены для этого пользователя
        await db.query(
            'DELETE FROM password_reset_tokens WHERE user_id = $1',
            [user.id]
        );

        // Создаем новый токен
        await db.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, resetToken, expiresAt]
        );

        // Отправляем email (пока заглушка)
        console.log(`🔐 Токен сброса пароля для ${email}: ${resetToken}`);
        console.log(`🌐 Ссылка: ${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`);

        res.json({
            message: 'Если email существует в системе, ссылка для сброса пароля была отправлена'
        });

    } catch (error) {
        console.error('Ошибка создания токена сброса пароля:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// POST /api/auth/reset-password - Сброс пароля по токену
router.post('/reset-password', [
    body('token').notEmpty(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Некорректные данные'
            });
        }

        const { token, password } = req.body;

        // Проверяем токен
        const tokenResult = await db.query(
            'SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used = false',
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({
                error: 'Недействительный или просроченный токен'
            });
        }

        const userId = tokenResult.rows[0].user_id;

        // Хешируем новый пароль
        const hashedPassword = await bcrypt.hash(password, 12);

        // Обновляем пароль пользователя
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [hashedPassword, userId]
        );

        // Помечаем токен как использованный
        await db.query(
            'UPDATE password_reset_tokens SET used = true WHERE token = $1',
            [token]
        );

        // Удаляем все активные сессии пользователя для безопасности
        await db.query(
            'UPDATE user_sessions SET is_active = false WHERE user_id = $1',
            [userId]
        );

        res.json({
            message: 'Пароль успешно изменен'
        });

    } catch (error) {
        console.error('Ошибка сброса пароля:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/auth/verify-reset-token - Проверка токена сброса пароля
router.get('/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                error: 'Токен не указан'
            });
        }

        // Проверяем токен
        const tokenResult = await db.query(
            'SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used = false',
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({
                error: 'Недействительный или просроченный токен'
            });
        }

        res.json({
            valid: true
        });

    } catch (error) {
        console.error('Ошибка проверки токена:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/auth/verify-email-token - Подтверждение email по токену
router.get('/verify-email-token', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                error: 'Токен не указан'
            });
        }

        // Проверяем токен верификации
        const tokenResult = await db.query(
            'SELECT user_id FROM email_verification_tokens WHERE token = $1 AND expires_at > NOW() AND used = false',
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({
                error: 'Недействительный или просроченный токен'
            });
        }

        const userId = tokenResult.rows[0].user_id;

        // Активируем пользователя
        await db.query(
            'UPDATE users SET email_verified = true WHERE id = $1',
            [userId]
        );

        // Помечаем токен как использованный
        await db.query(
            'UPDATE email_verification_tokens SET used = true WHERE token = $1',
            [token]
        );

        res.json({
            message: 'Email успешно подтвержден'
        });

    } catch (error) {
        console.error('Ошибка подтверждения email:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Экспорт middleware
router.authenticateToken = authenticateToken;
router.requireRole = requireRole;

module.exports = router;
