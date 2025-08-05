// Маршруты авторизации
// Создатель: ebluffy

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../../database/connection');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

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

// Middleware для проверки API токена (для плагинов)
const authenticateApiToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Токен доступа отсутствует' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Для API токенов просто проверяем пользователя в базе
        const userResult = await db.query(
            'SELECT * FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        req.user = userResult.rows[0];
        
        // Роль уже есть в таблице users
        if (!req.user.role) {
            req.user.role = 'user'; // Значение по умолчанию
        }
        
        next();
    } catch (error) {
        console.error('Ошибка проверки API токена:', error);
        return res.status(403).json({ error: 'Недействительный токен' });
    }
};

// Middleware для проверки долгосрочных API токенов (для плагинов и внешних приложений)
const authenticateLongTermApiToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Также проверяем заголовок X-API-Key
    if (!token) {
        token = req.headers['x-api-key'];
    }

    if (!token) {
        return res.status(401).json({ error: 'API токен отсутствует' });
    }

    try {
        // Сначала пытаемся проверить как долгосрочный API токен
        const crypto = require('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        
        const apiTokenResult = await db.query(`
            SELECT at.*, u.* 
            FROM api_tokens at
            JOIN users u ON at.user_id = u.id
            WHERE at.token_hash = $1 
                AND at.is_active = true 
                AND (at.expires_at IS NULL OR at.expires_at > NOW())
        `, [tokenHash]);

        if (apiTokenResult.rows.length > 0) {
            // Найден долгосрочный API токен
            const tokenData = apiTokenResult.rows[0];
            
            // Обновляем время последнего использования
            await db.query(
                'UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1',
                [tokenData.id]
            );

            req.user = {
                id: tokenData.user_id,
                nickname: tokenData.nickname,
                email: tokenData.email,
                role: tokenData.role || 'user',
                trust_level: tokenData.trust_level
            };
            
            req.apiToken = {
                id: tokenData.id,
                name: tokenData.token_name,
                permissions: tokenData.permissions || []
            };
            
            return next();
        }

        // Если не долгосрочный токен, пытаемся проверить как JWT
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            const userResult = await db.query(
                'SELECT * FROM users WHERE id = $1',
                [decoded.userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(401).json({ error: 'Пользователь не найден' });
            }

            req.user = userResult.rows[0];
            
            if (!req.user.role) {
                req.user.role = 'user';
            }
            
            return next();
        } catch (jwtError) {
            // JWT токен тоже невалидный
            console.error('Ошибка проверки токена:', jwtError.message);
            return res.status(403).json({ error: 'Недействительный токен' });
        }
    } catch (error) {
        console.error('Ошибка проверки API токена:', error);
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
        .withMessage('Пароль должен быть минимум 8 символов'),
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
                user_id, time_played_minutes, is_time_limited,
                current_level, u.is_email_verified, reputation, total_logins
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
router.get('/verify', authenticateApiToken, async (req, res) => {
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

        // Удаляем старые токены пользователя
        await db.query(`
            DELETE FROM email_verification_tokens WHERE user_id = $1
        `, [user.id]);

        // Сохраняем новый токен в базе данных
        await db.query(`
            INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at, used)
            VALUES ($1, $2, $3, NOW(), false)
        `, [user.id, verificationToken, expiresAt]);

        // Отправляем письмо через emailService
        const emailService = require('../utils/emailService');
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
        try {
            await emailService.sendVerificationEmail(user.email, user.nickname || user.minecraft_nick, verificationUrl);
            res.json({
                message: 'Письмо с подтверждением отправлено',
                verification_url: verificationUrl
            });
        } catch (mailError) {
            console.error('Ошибка отправки письма через SMTP:', mailError);
            res.status(500).json({ error: 'Ошибка отправки письма (SMTP)' });
        }

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
            SET is_email_verified = true
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
        
        // Формируем новый Discord username (без дискриминатора, так как Discord его убрал)
        const discordUsername = discordUser.username;
        
        // Временно сохраняем в сессии для связывания с пользователем
        req.session.pendingDiscordLink = {
            id: discordUser.id,
            username: discordUsername,
            email: discordUser.email,
            avatar: discordUser.avatar,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: new Date(Date.now() + (tokenData.expires_in * 1000))
        };
        
        res.redirect(`/profile?discord_ready=true&username=${encodeURIComponent(discordUsername)}`);

    } catch (error) {
        console.error('Ошибка Discord OAuth:', error);
        res.redirect('/?error=discord_oauth_error');
    }
});

// POST /api/auth/link-discord - Привязка Discord аккаунта к профилю
router.post('/link-discord', authenticateToken, async (req, res) => {
    try {
        if (!req.session.pendingDiscordLink) {
            return res.status(400).json({ 
                error: 'Нет ожидающей привязки Discord аккаунта. Пройдите авторизацию через Discord заново.' 
            });
        }

        const discordData = req.session.pendingDiscordLink;

        // Проверяем, не привязан ли этот Discord к другому пользователю
        const existingLink = await db.query(`
            SELECT user_id FROM discord_oauth WHERE discord_id = $1
        `, [discordData.id]);

        if (existingLink.rows.length > 0 && existingLink.rows[0].user_id !== req.user.id) {
            return res.status(400).json({
                error: 'Этот Discord аккаунт уже привязан к другому пользователю'
            });
        }

        // Обновляем пользователя
        await db.query(`
            UPDATE users 
            SET discord_username = $1 
            WHERE id = $2
        `, [discordData.username, req.user.id]);

        // Сохраняем OAuth данные
        await db.query(`
            INSERT INTO discord_oauth (
                user_id, discord_id, discord_username, discord_avatar,
                access_token, refresh_token, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (discord_id) 
            DO UPDATE SET 
                user_id = $1,
                discord_username = $3,
                discord_avatar = $4,
                access_token = $5,
                refresh_token = $6,
                expires_at = $7,
                updated_at = NOW()
        `, [
            req.user.id, 
            discordData.id, 
            discordData.username,
            discordData.avatar,
            discordData.access_token,
            discordData.refresh_token,
            discordData.expires_at
        ]);

        // Логируем активность
        await db.query(`
            INSERT INTO user_activity (user_id, activity_type, description)
            VALUES ($1, 'discord_linked', $2)
        `, [req.user.id, `Привязан Discord аккаунт: ${discordData.username}`]);

        // Очищаем временные данные
        delete req.session.pendingDiscordLink;

        res.json({
            success: true,
            message: 'Discord аккаунт успешно привязан',
            discord_username: discordData.username
        });

    } catch (error) {
        console.error('Ошибка привязки Discord:', error);
        res.status(500).json({ error: 'Ошибка привязки Discord аккаунта' });
    }
});

// POST /api/auth/unlink-discord - Отвязка Discord аккаунта
router.post('/unlink-discord', authenticateToken, async (req, res) => {
    try {
        // Удаляем привязку Discord
        await db.query(`
            UPDATE users 
            SET discord_username = NULL 
            WHERE id = $1
        `, [req.user.id]);

        // Удаляем OAuth данные
        await db.query(`
            DELETE FROM discord_oauth 
            WHERE user_id = $1
        `, [req.user.id]);

        // Логируем активность
        await db.query(`
            INSERT INTO user_activity (user_id, activity_type, description)
            VALUES ($1, 'discord_unlinked', 'Отвязан Discord аккаунт')
        `, [req.user.id]);

        res.json({
            success: true,
            message: 'Discord аккаунт успешно отвязан'
        });

    } catch (error) {
        console.error('Ошибка отвязки Discord:', error);
        res.status(500).json({ error: 'Ошибка отвязки Discord аккаунта' });
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
            'UPDATE users SET is_email_verified = true WHERE id = $1',
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
// POST /api/auth/generate-game-token - Генерация токена для входа в игру
router.post('/generate-game-token', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userAgent = req.headers['user-agent'] || '';
        const ipAddress = req.ip || req.connection.remoteAddress;

        // Проверяем, что у пользователя есть доступ к серверу
        const applicationResult = await db.query(`
            SELECT status FROM applications 
            WHERE user_id = $1 AND status = 'approved'
            ORDER BY submitted_at DESC 
            LIMIT 1
        `, [userId]);

        if (applicationResult.rows.length === 0) {
            return res.status(403).json({ 
                error: 'У вас нет доступа к серверу. Подайте заявку на доступ.' 
            });
        }

        // Генерируем уникальный токен
        const gameToken = uuidv4() + '-' + Date.now().toString(36);
        const tokenHash = require('crypto').createHash('sha256').update(gameToken).digest('hex');

        // Время жизни токена - 15 минут
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        // Деактивируем старые неиспользованные токены пользователя
        await db.query(`
            UPDATE game_tokens 
            SET is_used = true, used_at = NOW() 
            WHERE user_id = $1 AND is_used = false AND expires_at > NOW()
        `, [userId]);

        // Создаем новый токен
        await db.query(`
            INSERT INTO game_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5)
        `, [userId, tokenHash, expiresAt, ipAddress, userAgent]);

        res.json({
            success: true,
            token: gameToken,
            expires_at: expiresAt,
            expires_in: 15 * 60, // секунды
            message: 'Токен для входа в игру создан. Используйте команду /login ' + gameToken + ' в игре.'
        });

    } catch (error) {
        console.error('Ошибка генерации игрового токена:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/verify-game-token - Проверка игрового токена (для плагина)
router.post('/verify-game-token', authenticateLongTermApiToken, async (req, res) => {
    try {
        const { token, nickname } = req.body;

        if (!token || !nickname) {
            return res.status(400).json({ error: 'Токен и никнейм обязательны' });
        }

        // Хешируем токен для поиска
        const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');

        // Ищем токен и проверяем его валидность
        const tokenResult = await db.query(`
            SELECT gt.*, u.nickname, u.id as user_id, u.role, u.trust_level, u.is_banned
            FROM game_tokens gt
            JOIN users u ON gt.user_id = u.id
            WHERE gt.token_hash = $1 AND gt.expires_at > NOW() AND gt.is_used = false
        `, [tokenHash]);

        if (tokenResult.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Недействительный или истекший токен',
                valid: false 
            });
        }

        const tokenData = tokenResult.rows[0];

        // Проверяем, что никнейм соответствует владельцу токена
        if (tokenData.nickname.toLowerCase() !== nickname.toLowerCase()) {
            return res.status(403).json({ 
                error: 'Токен не принадлежит данному игроку',
                valid: false 
            });
        }

        // Проверяем, что пользователь не забанен
        if (tokenData.is_banned) {
            return res.status(403).json({ 
                error: 'Пользователь заблокирован',
                valid: false 
            });
        }

        // Отмечаем токен как использованный
        await db.query(`
            UPDATE game_tokens 
            SET is_used = true, used_at = NOW() 
            WHERE id = $1
        `, [tokenData.id]);

        res.json({
            valid: true,
            user: {
                id: tokenData.user_id,
                nickname: tokenData.nickname,
                role: tokenData.role,
                trust_level: tokenData.trust_level
            },
            message: 'Токен действителен'
        });

    } catch (error) {
        console.error('Ошибка проверки игрового токена:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/auth/game-tokens - Получение списка игровых токенов пользователя
router.get('/game-tokens', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const tokensResult = await db.query(`
            SELECT id, expires_at, is_used, used_at, created_at, ip_address
            FROM game_tokens 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [userId]);

        res.json({
            tokens: tokensResult.rows.map(token => ({
                id: token.id,
                expires_at: token.expires_at,
                is_used: token.is_used,
                used_at: token.used_at,
                created_at: token.created_at,
                ip_address: token.ip_address,
                status: token.is_used ? 'used' : (new Date(token.expires_at) < new Date() ? 'expired' : 'active')
            }))
        });

    } catch (error) {
        console.error('Ошибка получения игровых токенов:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/create-game-session - Создание игровой сессии после авторизации токеном
router.post('/create-game-session', authenticateLongTermApiToken, async (req, res) => {
    try {
        const { nickname, player_uuid, ip_address, user_agent } = req.body;

        if (!nickname || !player_uuid || !ip_address) {
            return res.status(400).json({ error: 'Nickname, player_uuid и ip_address обязательны' });
        }

        // Найдем пользователя по никнейму
        const userResult = await db.query(
            'SELECT id FROM users WHERE nickname = $1',
            [nickname]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;

        // Деактивируем старые сессии этого игрока
        await db.query(`
            UPDATE game_sessions 
            SET is_active = false 
            WHERE user_id = $1 AND player_uuid = $2 AND is_active = true
        `, [userId, player_uuid]);

        // Создаем новую сессию на 7 дней
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const sessionResult = await db.query(`
            INSERT INTO game_sessions (user_id, player_uuid, nickname, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [userId, player_uuid, nickname, expiresAt, ip_address, user_agent]);

        res.json({
            success: true,
            session_id: sessionResult.rows[0].id,
            expires_at: expiresAt,
            message: 'Игровая сессия создана'
        });

    } catch (error) {
        console.error('Ошибка создания игровой сессии:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/check-game-session - Проверка активной игровой сессии
router.post('/check-game-session', authenticateLongTermApiToken, async (req, res) => {
    try {
        const { nickname, player_uuid, ip_address } = req.body;

        if (!nickname || !player_uuid || !ip_address) {
            return res.status(400).json({ error: 'Nickname, player_uuid и ip_address обязательны' });
        }

        // Ищем активную сессию
        const sessionResult = await db.query(`
            SELECT gs.*, u.id as user_id, u.role, u.trust_level, u.is_banned
            FROM game_sessions gs
            JOIN users u ON gs.user_id = u.id
            WHERE gs.nickname = $1 
            AND gs.player_uuid = $2 
            AND gs.ip_address = $3 
            AND gs.is_active = true 
            AND gs.expires_at > NOW()
        `, [nickname, player_uuid, ip_address]);

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ 
                session_valid: false,
                error: 'Активная сессия не найдена' 
            });
        }

        const session = sessionResult.rows[0];

        // Проверяем, что пользователь не забанен
        if (session.is_banned) {
            return res.status(403).json({ 
                session_valid: false,
                error: 'Пользователь заблокирован' 
            });
        }

        // Обновляем время последнего входа
        await db.query(`
            UPDATE game_sessions 
            SET last_login = NOW() 
            WHERE id = $1
        `, [session.id]);

        res.json({
            session_valid: true,
            user: {
                id: session.user_id,
                nickname: session.nickname,
                role: session.role,
                trust_level: session.trust_level
            },
            session: {
                id: session.id,
                expires_at: session.expires_at,
                created_at: session.created_at
            },
            message: 'Сессия действительна'
        });

    } catch (error) {
        console.error('Ошибка проверки игровой сессии:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/auth/game-sessions - Получение активных игровых сессий пользователя
router.get('/game-sessions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const sessionsResult = await db.query(`
            SELECT id, player_uuid, nickname, expires_at, ip_address, is_active, created_at, last_login
            FROM game_sessions 
            WHERE user_id = $1 AND is_active = true
            ORDER BY last_login DESC 
            LIMIT 10
        `, [userId]);

        res.json({
            sessions: sessionsResult.rows.map(session => ({
                id: session.id,
                player_uuid: session.player_uuid,
                nickname: session.nickname,
                expires_at: session.expires_at,
                ip_address: session.ip_address,
                created_at: session.created_at,
                last_login: session.last_login,
                status: new Date(session.expires_at) < new Date() ? 'expired' : 'active'
            }))
        });

    } catch (error) {
        console.error('Ошибка получения игровых сессий:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/auth/terminate-game-sessions - Завершение всех игровых сессий пользователя
router.post('/terminate-game-sessions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await db.query(`
            UPDATE game_sessions 
            SET is_active = false 
            WHERE user_id = $1 AND is_active = true
            RETURNING id
        `, [userId]);

        res.json({
            success: true,
            terminated_sessions: result.rows.length,
            message: `Завершено сессий: ${result.rows.length}`
        });

    } catch (error) {
        console.error('Ошибка завершения игровых сессий:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

router.authenticateToken = authenticateToken;
router.authenticateApiToken = authenticateApiToken;
router.authenticateLongTermApiToken = authenticateLongTermApiToken;
router.requireRole = requireRole;

module.exports = router;
