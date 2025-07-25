// Маршруты профиля пользователя
// Создатель: ebluffy

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const { authenticateToken } = require('./auth');

const router = express.Router();

// GET /api/profile - Получение данных профиля
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Получаем основные данные пользователя
        const userResult = await db.query(`
            SELECT u.id, u.nickname, u.discord_id, u.discord_tag, u.email, 
                   u.display_name, u.bio, u.trust_level, u.is_email_verified,
                   u.last_login, u.registered_at, u.avatar_url,
                   pl.total_minutes, pl.daily_limit_minutes, pl.is_limited,
                   tlp.time_played_minutes, tlp.email_verified, tlp.discord_verified,
                   tlp.minecraft_verified, tlp.reputation, tlp.achievements_count
            FROM users u
            LEFT JOIN play_limits pl ON u.id = pl.user_id
            LEFT JOIN trust_level_progress tlp ON u.id = tlp.user_id
            WHERE u.id = $1 AND u.is_active = true
        `, [req.user.id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        // Получаем последнюю активность
        const activityResult = await db.query(`
            SELECT activity_type, description, created_at 
            FROM user_activity 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [req.user.id]);

        // Получаем достижения пользователя
        const achievementsResult = await db.query(`
            SELECT a.name, a.description, a.icon, a.points, ua.earned_at
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = $1
            ORDER BY ua.earned_at DESC
        `, [req.user.id]);

        // Формируем статистику
        const stats = {
            playtime: user.time_played_minutes || 0,
            days_registered: Math.floor((new Date() - new Date(user.registered_at)) / (1000 * 60 * 60 * 24)),
            reputation: user.reputation || 0,
            friends: 0, // Пока заглушка
            achievements_count: user.achievements_count || 0,
            total_logins: 0 // Можно добавить подсчет из login_logs
        };

        // Формируем прогресс Trust Level
        const trustProgress = {
            current: user.trust_level || 0,
            required: getTrustLevelRequirements(user.trust_level || 0),
            type: 'минут игры'
        };

        // Проверяем статус заявки
        const applicationResult = await db.query(`
            SELECT status, submitted_at, reviewed_at, review_comment
            FROM applications 
            WHERE user_id = $1 
            ORDER BY submitted_at DESC 
            LIMIT 1
        `, [req.user.id]);

        const application = applicationResult.rows[0] || null;

        res.json({
            id: user.id,
            minecraft_nick: user.nickname,
            display_name: user.display_name || user.nickname,
            email: user.email,
            discord: user.discord_tag,
            bio: user.bio,
            trust_level: user.trust_level || 0,
            is_email_verified: user.is_email_verified,
            avatar_url: user.avatar_url,
            registered_at: user.registered_at,
            last_login: user.last_login,
            stats,
            trust_progress: trustProgress,
            activity: activityResult.rows,
            achievements: achievementsResult.rows,
            application,
            play_limits: {
                total_minutes: user.total_minutes || 0,
                daily_limit: user.daily_limit_minutes || 600,
                is_limited: user.is_limited !== false
            }
        });

    } catch (error) {
        console.error('Ошибка получения профиля:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// PUT /api/profile - Обновление профиля
router.put('/', [
    authenticateToken,
    body('email').optional().isEmail().normalizeEmail(),
    body('discord').optional().isLength({ max: 64 }),
    body('bio').optional().isLength({ max: 1000 }),
    body('display_name').optional().isLength({ min: 2, max: 50 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { email, discord, bio, display_name } = req.body;
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        // Строим динамический запрос обновления
        if (email !== undefined) {
            updateFields.push(`email = $${paramIndex++}`);
            updateValues.push(email);
        }
        if (discord !== undefined) {
            updateFields.push(`discord_tag = $${paramIndex++}`);
            updateValues.push(discord);
        }
        if (bio !== undefined) {
            updateFields.push(`bio = $${paramIndex++}`);
            updateValues.push(bio);
        }
        if (display_name !== undefined) {
            updateFields.push(`display_name = $${paramIndex++}`);
            updateValues.push(display_name);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateValues.push(req.user.id);

        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')} 
            WHERE id = $${paramIndex} AND is_active = true
            RETURNING id, nickname, email, discord_tag, bio, display_name
        `;

        const result = await db.query(updateQuery, updateValues);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Логируем действие
        await db.query(`
            INSERT INTO action_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'profile_update',
            `Обновлен профиль: ${updateFields.join(', ')}`,
            req.ip
        ]);

        res.json({
            success: true,
            message: 'Профиль успешно обновлен',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ 
                error: 'Email уже используется другим пользователем' 
            });
        }
        
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/profile/verify-email - Запрос подтверждения email
router.post('/verify-email', authenticateToken, async (req, res) => {
    try {
        // В будущем здесь будет отправка email с кодом подтверждения
        // Пока просто помечаем как подтвержденный для демонстрации
        
        await db.query(`
            UPDATE users 
            SET is_email_verified = true 
            WHERE id = $1
        `, [req.user.id]);

        await db.query(`
            UPDATE trust_level_progress 
            SET email_verified = true 
            WHERE user_id = $1
        `, [req.user.id]);

        // Логируем действие
        await db.query(`
            INSERT INTO action_logs (user_id, action, details)
            VALUES ($1, $2, $3)
        `, [req.user.id, 'email_verified', 'Email адрес подтвержден']);

        res.json({
            success: true,
            message: 'Email успешно подтвержден'
        });

    } catch (error) {
        console.error('Ошибка подтверждения email:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/profile/activity - Получение расширенной активности
router.get('/activity', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const result = await db.query(`
            SELECT activity_type, description, metadata, created_at
            FROM user_activity
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [req.user.id, limit, offset]);

        // Получаем общее количество записей
        const countResult = await db.query(`
            SELECT COUNT(*) as total
            FROM user_activity
            WHERE user_id = $1
        `, [req.user.id]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({
            activities: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Ошибка получения активности:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Функция для определения требований Trust Level
function getTrustLevelRequirements(currentLevel) {
    const requirements = {
        0: { time: 0, name: 'Новичок' },
        1: { time: 60, name: 'Игрок' },        // 1 час
        2: { time: 300, name: 'Проверенный' }, // 5 часов
        3: { time: 1200, name: 'Ветеран' },    // 20 часов
        4: { time: 3000, name: 'Модератор' },  // 50 часов
        5: { time: 6000, name: 'Администратор' } // 100 часов
    };

    return requirements[currentLevel + 1] || requirements[5];
}

module.exports = router;
