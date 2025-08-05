// Маршруты профиля пользователя
// Создатель: ebluffy

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../database/connection');
const { authenticateToken, authenticateLongTermApiToken } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const router = express.Router();

// Настройка multer для загрузки аватаров
const avatarStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/avatars');
        try {
            await fs.mkdir(uploadPath, { recursive: true });
            cb(null, uploadPath);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, `avatar-${req.user.id}-${uniqueSuffix}${extension}`);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Разрешены только изображения (JPEG, JPG, PNG, GIF, WebP). Максимальный размер: 20MB'));
        }
    }
});

// Функция для расчета оставшегося времени бана
function calculateTimeRemaining(banUntil) {
    const now = new Date();
    const until = new Date(banUntil);
    const diffMs = until.getTime() - now.getTime();
    
    if (diffMs <= 0) {
        return { expired: true };
    }
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        expired: false,
        total_minutes: Math.floor(diffMs / (1000 * 60)),
        days,
        hours,
        minutes,
        formatted: `${days > 0 ? days + 'д ' : ''}${hours > 0 ? hours + 'ч ' : ''}${minutes}м`
    };
}

// GET /api/profile/detailed-stats - Получение детальной статистики игрока
router.get('/detailed-stats', authenticateToken, async (req, res) => {
    try {
        // Получаем детальную статистику
        const statsResult = await db.query(`
            SELECT 
                ps.*,
                u.nickname,
                u.registered_at,
                u.last_login
            FROM player_stats ps
            JOIN users u ON ps.user_id = u.id
            WHERE ps.user_id = $1
        `, [req.user.id]);

        if (statsResult.rows.length === 0) {
            return res.status(404).json({ error: 'Статистика не найдена' });
        }

        const stats = statsResult.rows[0];

        // Получаем последние 30 дней активности
        const activityResult = await db.query(`
            SELECT 
                stat_date,
                playtime_minutes,
                logins_count,
                blocks_broken,
                blocks_placed
            FROM daily_stats 
            WHERE user_id = $1 
                AND stat_date >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY stat_date DESC
        `, [req.user.id]);

        // Получаем последние игровые активности из daily_stats
        const sessionsResult = await db.query(`
            SELECT 
                stat_date as session_date,
                playtime_minutes as duration_minutes,
                blocks_broken,
                blocks_placed,
                logins_count
            FROM daily_stats 
            WHERE user_id = $1 
            ORDER BY stat_date DESC 
            LIMIT 10
        `, [req.user.id]);

        // Вычисляем статистику
        const totalPlaytime = stats.time_played_minutes || 0;
        const playtimeHours = Math.floor(totalPlaytime / 60);
        const playtimeMinutes = totalPlaytime % 60;
        
        const avgSessionDuration = stats.average_session_duration || 0;
        const longestSession = stats.longest_session_duration || 0;
        
        const registrationDate = new Date(stats.registered_at);
        const daysSinceRegistration = Math.floor((Date.now() - registrationDate.getTime()) / (1000 * 60 * 60 * 24));

        res.json({
            success: true,
            stats: {
                // Основная статистика
                total_playtime_minutes: totalPlaytime,
                total_playtime_hours: playtimeHours,
                total_playtime_formatted: `${playtimeHours}ч ${playtimeMinutes}м`,
                
                // Сессии
                total_sessions: stats.session_count || 0,
                average_session_duration: avgSessionDuration,
                longest_session_duration: longestSession,
                average_session_formatted: formatMinutesToTime(avgSessionDuration),
                longest_session_formatted: formatMinutesToTime(longestSession),
                
                // Активность
                total_logins: stats.total_logins || 0,
                active_days: stats.active_days_count || 0,
                days_since_registration: daysSinceRegistration,
                last_seen: stats.last_seen,
                
                // Игровая статистика
                blocks_broken: stats.blocks_broken || 0,
                blocks_placed: stats.blocks_placed || 0,
                distance_walked: stats.distance_walked || 0,
                deaths_count: stats.deaths_count || 0,
                mobs_killed: stats.mobs_killed || 0,
                items_crafted: stats.items_crafted || 0,
                damage_dealt: stats.damage_dealt || 0,
                damage_taken: stats.damage_taken || 0,
                food_eaten: stats.food_eaten || 0,
                jumps_count: stats.jumps_count || 0,
                
                // Временная статистика
                online_time_today: stats.online_time_today || 0,
                online_time_week: stats.online_time_week || 0,
                online_time_month: stats.online_time_month || 0,
                
                // Репутация и достижения
                reputation: stats.reputation || 0,
                achievements_count: stats.achievements_count || 0,
                
                // Дополнительная информация
                last_ip_address: stats.last_ip_address,
                stats_last_updated: stats.stats_last_updated,
                minecraft_stats: stats.minecraft_stats || {}
            },
            activity_chart: activityResult.rows,
            recent_sessions: sessionsResult.rows
        });

    } catch (error) {
        console.error('Ошибка получения детальной статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/profile/update-stats - Обновление статистики с сервера Minecraft (только для плагина)
router.post('/update-stats', authenticateLongTermApiToken, async (req, res) => {
    try {
        const {
            minecraft_nick,
            stats
        } = req.body;

        if (!minecraft_nick || !stats) {
            return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
        }

        // Находим пользователя по никнейму Minecraft
        const userResult = await db.query(`
            SELECT u.id, u.nickname 
            FROM users u 
            WHERE u.nickname = $1 AND u.is_active = true
        `, [minecraft_nick]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        // Обновляем статистику игрока
        const updateResult = await db.query(`
            UPDATE player_stats 
            SET 
                time_played_minutes = COALESCE($2, time_played_minutes),
                total_logins = COALESCE($3, total_logins),
                session_count = COALESCE($4, session_count),
                average_session_duration = COALESCE($5, average_session_duration),
                longest_session_duration = COALESCE($6, longest_session_duration),
                last_seen = COALESCE($7::timestamp, last_seen),
                blocks_broken = COALESCE($8, blocks_broken),
                blocks_placed = COALESCE($9, blocks_placed),
                distance_walked = COALESCE($10, distance_walked),
                deaths_count = COALESCE($11, deaths_count),
                mobs_killed = COALESCE($12, mobs_killed),
                items_crafted = COALESCE($13, items_crafted),
                damage_dealt = COALESCE($14, damage_dealt),
                damage_taken = COALESCE($15, damage_taken),
                food_eaten = COALESCE($16, food_eaten),
                jumps_count = COALESCE($17, jumps_count),
                current_level = COALESCE($18, current_level),
                minecraft_stats = COALESCE($19::jsonb, minecraft_stats),
                last_ip_address = COALESCE($20::inet, last_ip_address),
                stats_last_updated = NOW(),
                updated_at = NOW()
            WHERE user_id = $1
            RETURNING *
        `, [
            user.id,
            stats.time_played_minutes,
            stats.total_logins, 
            stats.session_count,
            stats.average_session_duration,
            stats.longest_session_duration,
            stats.last_seen,
            stats.blocks_broken,
            stats.blocks_placed,
            stats.distance_walked,
            stats.deaths_count || stats.deaths, // поддерживаем оба варианта
            stats.mobs_killed || stats.mob_kills, // поддерживаем оба варианта
            stats.items_crafted,
            stats.damage_dealt,
            stats.damage_taken,
            stats.food_eaten,
            stats.jumps_count,
            stats.player_level || stats.current_level, // поддерживаем оба варианта
            JSON.stringify(stats.minecraft_stats || {}),
            stats.last_ip_address
        ]);

        // Если статистика не существует, создаем новую запись
        if (updateResult.rows.length === 0) {
            await db.query(`
                INSERT INTO player_stats (
                    user_id, time_played_minutes, total_logins, session_count,
                    average_session_duration, longest_session_duration, last_seen,
                    blocks_broken, blocks_placed, distance_walked, deaths_count,
                    mobs_killed, items_crafted, damage_dealt, damage_taken,
                    food_eaten, jumps_count, current_level, minecraft_stats, last_ip_address,
                    stats_last_updated, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7::timestamp, $8, $9, $10, $11, $12, 
                    $13, $14, $15, $16, $17, $18, $19::jsonb, $20::inet, NOW(), NOW(), NOW()
                )
            `, [
                user.id,
                stats.time_played_minutes || 0,
                stats.total_logins || 0,
                stats.session_count || 0,
                stats.average_session_duration || 0,
                stats.longest_session_duration || 0,
                stats.last_seen,
                stats.blocks_broken || 0,
                stats.blocks_placed || 0,
                stats.distance_walked || 0,
                stats.deaths_count || stats.deaths || 0,
                stats.mobs_killed || stats.mob_kills || 0,
                stats.items_crafted || 0,
                stats.damage_dealt || 0,
                stats.damage_taken || 0,
                stats.food_eaten || 0,
                stats.jumps_count || 0,
                stats.player_level || stats.current_level || 1,
                JSON.stringify(stats.minecraft_stats || {}),
                stats.last_ip_address
            ]);
        }

        // Обновляем ежедневную статистику
        if (stats.daily_stats) {
            await db.query(`
                INSERT INTO daily_stats (
                    user_id, stat_date, playtime_minutes, logins_count,
                    blocks_broken, blocks_placed, distance_walked, deaths_count, mobs_killed
                ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (user_id, stat_date) 
                DO UPDATE SET 
                    playtime_minutes = daily_stats.playtime_minutes + EXCLUDED.playtime_minutes,
                    logins_count = EXCLUDED.logins_count,
                    blocks_broken = daily_stats.blocks_broken + EXCLUDED.blocks_broken,
                    blocks_placed = daily_stats.blocks_placed + EXCLUDED.blocks_placed,
                    distance_walked = daily_stats.distance_walked + EXCLUDED.distance_walked,
                    deaths_count = daily_stats.deaths_count + EXCLUDED.deaths_count,
                    mobs_killed = daily_stats.mobs_killed + EXCLUDED.mobs_killed,
                    updated_at = NOW()
            `, [
                user.id,
                stats.daily_stats.playtime_minutes || 0,
                stats.daily_stats.logins_count || 0,
                stats.daily_stats.blocks_broken || 0,
                stats.daily_stats.blocks_placed || 0,
                stats.daily_stats.distance_walked || 0,
                stats.daily_stats.deaths_count || 0,
                stats.daily_stats.mobs_killed || 0
            ]);
        }

        res.json({
            success: true,
            message: `Статистика игрока ${minecraft_nick} обновлена`,
            user_id: user.id
        });

    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Функция для форматирования минут в читаемый формат
function formatMinutesToTime(minutes) {
    if (!minutes || minutes === 0) return '0м';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) return `${mins}м`;
    if (mins === 0) return `${hours}ч`;
    return `${hours}ч ${mins}м`;
}

// GET /api/profile - Получение данных профиля
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Получаем основные данные пользователя
        const userResult = await db.query(`
            SELECT u.id, u.nickname, u.first_name, u.email, u.role, 
                   u.discord_username, u.trust_level, u.bio, u.avatar_url,
                   u.age, u.is_email_verified, u.is_banned, u.status,
                   u.ban_reason, u.ban_until, u.last_login, u.registered_at,
                   ps.time_played_minutes, ps.is_time_limited,
                   ps.reputation, ps.achievements_count, ps.total_logins
            FROM users u
            LEFT JOIN player_stats ps ON u.id = ps.user_id
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

        // Если активности нет, создадим базовую запись
        if (activityResult.rows.length === 0) {
            await db.query(`
                INSERT INTO user_activity (user_id, activity_type, description, created_at)
                VALUES ($1, 'registration', 'Регистрация на сайте', $2)
            `, [req.user.id, user.registered_at]);
            
            // Получаем активность снова
            const newActivityResult = await db.query(`
                SELECT activity_type, description, created_at 
                FROM user_activity 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 10
            `, [req.user.id]);
            
            activityResult.rows = newActivityResult.rows;
        }

        // Получаем достижения пользователя (пока заглушка, так как таблица удалена)
        const achievementsResult = { rows: [] };

        // Получаем репутацию пользователя
        const reputationResult = await db.query(`
            SELECT reputation_score, positive_votes, negative_votes
            FROM user_reputation 
            WHERE user_id = $1
        `, [req.user.id]);
        
        const reputation = reputationResult.rows[0] || { reputation_score: 0, positive_votes: 0, negative_votes: 0 };

        // Формируем статистику
        const stats = {
            playtime: user.time_played_minutes || 0,
            days_registered: Math.floor((new Date() - new Date(user.registered_at)) / (1000 * 60 * 60 * 24)),
            reputation: reputation.reputation_score || 0,
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
            display_name: user.nickname,
            first_name: user.first_name,
            age: user.age,
            email: user.email,
            discord: user.discord_username,
            bio: user.bio,
            role: user.role || 'user',
            trust_level: user.trust_level || 0,
            trust_level_name: getTrustLevelName(user.trust_level || 0),
            reputation: reputation.reputation_score || 0,
            reputation_votes: {
                positive: reputation.positive_votes || 0,
                negative: reputation.negative_votes || 0
            },
            is_email_verified: user.is_email_verified,
            is_banned: user.is_banned || false,
            ban_info: user.is_banned ? {
                reason: user.ban_reason,
                until: user.ban_until,
                is_permanent: !user.ban_until,
                time_remaining: user.ban_until ? calculateTimeRemaining(user.ban_until) : null
            } : null,
            status: user.status || 'active',
            avatar_url: user.avatar_url,
            registered_at: user.registered_at,
            last_login: user.last_login,
            stats,
            trust_progress: trustProgress,
            activity: activityResult.rows,
            achievements: achievementsResult.rows,
            application,
            player_stats: {
                time_played_minutes: user.time_played_minutes || 0,
                is_time_limited: user.is_time_limited !== false,
                total_logins: user.total_logins || 0
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
    body('first_name').optional().isLength({ max: 50 }),
    body('age').optional().isInt({ min: 10, max: 120 }),
    body('discord_username').optional().isLength({ max: 100 }),
    body('bio').optional().isLength({ max: 1000 }),
    body('current_password').optional().isLength({ min: 1 }),
    body('new_password').optional().isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { email, first_name, age, discord_username, bio, current_password, new_password } = req.body;
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        // Проверка смены пароля
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({ 
                    error: 'Для смены пароля необходимо указать текущий пароль' 
                });
            }

            // Получаем текущий пароль пользователя
            const userResult = await db.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [req.user.id]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }

            // Проверяем текущий пароль
            const bcrypt = require('bcryptjs');
            const isCurrentPasswordValid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
            
            if (!isCurrentPasswordValid) {
                return res.status(400).json({ 
                    error: 'Неверный текущий пароль' 
                });
            }

            // Хешируем новый пароль
            const saltRounds = 12;
            const hashedNewPassword = await bcrypt.hash(new_password, saltRounds);
            
            updateFields.push(`password_hash = $${paramIndex++}`);
            updateValues.push(hashedNewPassword);
        }

        // Строим динамический запрос обновления остальных полей
        if (email !== undefined) {
            updateFields.push(`email = $${paramIndex++}`);
            updateValues.push(email);
        }
        if (first_name !== undefined) {
            updateFields.push(`first_name = $${paramIndex++}`);
            updateValues.push(first_name);
        }
        if (age !== undefined) {
            updateFields.push(`age = $${paramIndex++}`);
            updateValues.push(age);
        }
        if (discord_username !== undefined) {
            updateFields.push(`discord_username = $${paramIndex++}`);
            updateValues.push(discord_username);
        }
        if (bio !== undefined) {
            updateFields.push(`bio = $${paramIndex++}`);
            updateValues.push(bio);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        updateValues.push(req.user.id);

        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex} AND is_active = true
            RETURNING id, nickname, email, first_name, age, discord_username, bio
        `;

        const result = await db.query(updateQuery, updateValues);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Логируем действие
        const actionDetails = [];
        if (new_password) actionDetails.push('пароль');
        if (email !== undefined) actionDetails.push('email');
        if (first_name !== undefined) actionDetails.push('имя');
        if (age !== undefined) actionDetails.push('возраст');
        if (discord_username !== undefined) actionDetails.push('Discord');
        if (bio !== undefined) actionDetails.push('биография');
        
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'profile_update',
            `Обновлен профиль: ${actionDetails.join(', ')}`,
            req.user.id
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
            UPDATE users 
            SET is_email_verified = true 
            WHERE id = $1
        `, [req.user.id]);

        // Логируем действие
        await db.query(`
            INSERT INTO user_activity (user_id, activity_type, description)
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
        0: { time: 0, name: 'Проходимец' },
        1: { time: 0, name: 'Новичок' },        // Только подтверждение email
        2: { time: 25*60, name: 'Проверенный' }, // 25 часов + репутация
        3: { time: 50*60, name: 'Ветеран' },    // 50 часов + репутация
    };

    return requirements[currentLevel + 1] || requirements[3];
}

// Функция для получения названия Trust Level на русском
function getTrustLevelName(level) {
    const names = {
        0: 'Проходимец',
        1: 'Новичок', 
        2: 'Проверенный',
        3: 'Ветеран',
    };
    return names[level] || 'Неизвестно';
}

module.exports = router;

// POST /api/profile/avatar - Загрузка аватара
router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const originalPath = req.file.path;
        
        // Получаем данные о кропе если они есть
        let cropData = null;
        if (req.body.cropData) {
            try {
                cropData = JSON.parse(req.body.cropData);
            } catch (e) {
                console.log('Ошибка парсинга данных кропа:', e.message);
            }
        }
        
        // Проверяем размеры изображения
        const metadata = await sharp(originalPath).metadata();
        
        // Создаем финальное изображение
        const finalFileName = `avatar-${req.user.id}-${Date.now()}-final.png`;
        const finalPath = path.join(path.dirname(originalPath), finalFileName);
        
        let sharpInstance = sharp(originalPath);
        
        // Если есть данные кропа, применяем их
        if (cropData) {
            const { scale, rotation, flipX, offsetX, offsetY, cropSize } = cropData;
            
            // Вычисляем размеры для кропа
            const scaledWidth = Math.round(metadata.width * scale);
            const scaledHeight = Math.round(metadata.height * scale);
            
            // Начальная обработка: масштабирование и поворот
            sharpInstance = sharpInstance.resize(scaledWidth, scaledHeight);
            
            if (rotation !== 0) {
                sharpInstance = sharpInstance.rotate(rotation);
            }
            
            if (flipX < 0) {
                sharpInstance = sharpInstance.flop();
            }
            
            // Получаем метаданные после трансформаций
            const processedBuffer = await sharpInstance.toBuffer();
            const processedMetadata = await sharp(processedBuffer).metadata();
            
            // Вычисляем область кропа (256x256 из центра с учетом смещения)
            const centerX = Math.round(processedMetadata.width / 2);
            const centerY = Math.round(processedMetadata.height / 2);
            const cropRadius = 128; // половина от 256
            
            const cropLeft = Math.max(0, centerX - cropRadius - Math.round(offsetX));
            const cropTop = Math.max(0, centerY - cropRadius - Math.round(offsetY));
            const cropWidth = Math.min(256, processedMetadata.width - cropLeft);
            const cropHeight = Math.min(256, processedMetadata.height - cropTop);
            
            // Применяем кроп и финальный ресайз до 512x512
            sharpInstance = sharp(processedBuffer)
                .extract({ 
                    left: cropLeft, 
                    top: cropTop, 
                    width: cropWidth, 
                    height: cropHeight 
                })
                .resize(512, 512, { fit: 'cover' });
        } else {
            // Если нет данных кропа, просто ресайзим
            sharpInstance = sharpInstance.resize(512, 512, { fit: 'cover' });
        }
        
        // Сохраняем финальное изображение
        await sharpInstance
            .png({ quality: 90 })
            .toFile(finalPath);
        
        // Удаляем оригинальный файл
        await fs.unlink(originalPath);

        const avatarUrl = `/uploads/avatars/${finalFileName}`;

        // Получаем старый аватар для удаления
        const oldAvatarResult = await db.query(
            'SELECT avatar_url FROM users WHERE id = $1',
            [req.user.id]
        );

        // Обновляем аватар в БД
        await db.query(
            'UPDATE users SET avatar_url = $1 WHERE id = $2',
            [avatarUrl, req.user.id]
        );

        // Удаляем старый аватар (если он есть и не дефолтный)
        if (oldAvatarResult.rows[0]?.avatar_url && 
            oldAvatarResult.rows[0].avatar_url.includes('/uploads/avatars/')) {
            try {
                const oldPath = path.join(__dirname, '../../public', oldAvatarResult.rows[0].avatar_url);
                await fs.unlink(oldPath);
            } catch (error) {
                console.log('Не удалось удалить старый аватар:', error.message);
            }
        }

        // Логируем активность
        await db.query(`
            INSERT INTO user_activity (user_id, activity_type, description)
            VALUES ($1, 'avatar_update', 'Обновлен аватар профиля')
        `, [req.user.id]);

        res.json({
            success: true,
            message: 'Аватар успешно загружен',
            avatar_url: avatarUrl,
            original_size: `${metadata.width}x${metadata.height}`,
            final_size: '512x512',
            crop_applied: !!cropData
        });

    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        
        // Удаляем файл при ошибке
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Ошибка удаления файла при ошибке:', unlinkError);
            }
        }
        
        res.status(500).json({ error: 'Ошибка загрузки аватара' });
    }
});

// DELETE /api/profile/avatar - Удаление аватара
router.delete('/avatar', authenticateToken, async (req, res) => {
    try {
        // Получаем текущий аватар
        const avatarResult = await db.query(
            'SELECT avatar_url FROM users WHERE id = $1',
            [req.user.id]
        );

        const currentAvatar = avatarResult.rows[0]?.avatar_url;

        // Удаляем аватар из БД
        await db.query(
            'UPDATE users SET avatar_url = NULL WHERE id = $1',
            [req.user.id]
        );

        // Удаляем файл аватара (если он кастомный)
        if (currentAvatar && currentAvatar.includes('/uploads/avatars/')) {
            try {
                const avatarPath = path.join(__dirname, '../../public', currentAvatar);
                await fs.unlink(avatarPath);
            } catch (error) {
                console.log('Не удалось удалить файл аватара:', error.message);
            }
        }

        // Логируем активность
        await db.query(`
            INSERT INTO user_activity (user_id, activity_type, description)
            VALUES ($1, 'avatar_delete', 'Удален аватар профиля')
        `, [req.user.id]);

        res.json({
            success: true,
            message: 'Аватар успешно удален'
        });

    } catch (error) {
        console.error('Ошибка удаления аватара:', error);
        res.status(500).json({ error: 'Ошибка удаления аватара' });
    }
});

// GET /api/profile/ban-status - Проверка статуса бана
router.get('/ban-status', authenticateToken, async (req, res) => {
    try {
        const userResult = await db.query(`
            SELECT is_banned, ban_reason, ban_until 
            FROM users 
            WHERE id = $1
        `, [req.user.id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        if (!user.is_banned) {
            return res.json({
                is_banned: false,
                message: 'Пользователь не забанен'
            });
        }

        const banInfo = {
            is_banned: true,
            reason: user.ban_reason,
            until: user.ban_until,
            is_permanent: !user.ban_until
        };

        if (user.ban_until) {
            const timeRemaining = calculateTimeRemaining(user.ban_until);
            banInfo.time_remaining = timeRemaining;
            
            // Если бан истек, автоматически снимаем его
            if (timeRemaining.expired) {
                await db.query(`
                    UPDATE users 
                    SET is_banned = FALSE, ban_reason = NULL, ban_until = NULL 
                    WHERE id = $1
                `, [req.user.id]);
                
                return res.json({
                    is_banned: false,
                    message: 'Бан автоматически снят (время истекло)'
                });
            }
        }

        res.json(banInfo);

    } catch (error) {
        console.error('Ошибка проверки статуса бана:', error);
        res.status(500).json({ error: 'Ошибка проверки статуса бана' });
    }
});
