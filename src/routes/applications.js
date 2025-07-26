// Маршруты для заявок на whitelist
// Создатель: ebluffy

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../database/connection');
const { authenticateToken, requireRole } = require('./auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// POST /api/applications - Подача заявки
router.post('/', [
    body('minecraft_nick').isLength({ min: 3, max: 16 }).matches(/^[a-zA-Z0-9_]+$/),
    body('age').isIn(['under_16', '16_20', '21_25', '26_30', 'over_30']),
    body('discord').isLength({ min: 3, max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('experience').isIn(['beginner', 'intermediate', 'advanced', 'expert']),
    body('motivation').isLength({ min: 50, max: 800 }),
    body('plans').isLength({ min: 30, max: 600 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const {
            minecraft_nick,
            age,
            discord,
            email,
            experience,
            motivation,
            plans
        } = req.body;

        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';

        // Проверяем, есть ли уже заявка с таким email или ником
        const existingApplication = await db.query(`
            SELECT id, status FROM applications 
            WHERE email = $1 OR minecraft_nick = $2
            ORDER BY submitted_at DESC LIMIT 1
        `, [email, minecraft_nick]);

        if (existingApplication.rows.length > 0) {
            const existing = existingApplication.rows[0];
            if (existing.status === 'pending') {
                return res.status(400).json({
                    error: 'У вас уже есть заявка на рассмотрении'
                });
            }
            if (existing.status === 'approved') {
                return res.status(400).json({
                    error: 'Вы уже были одобрены для игры на сервере'
                });
            }
        }

        // Проверяем лимит заявок с одного IP (10 в день)
        const ipLimitResult = await db.query(`
            SELECT COUNT(*) as count 
            FROM applications 
            WHERE ip_address = $1 AND submitted_at > NOW() - INTERVAL '24 hours'
        `, [ip]);

        if (parseInt(ipLimitResult.rows[0].count) >= 10) {
            return res.status(429).json({
                error: 'Превышен лимит заявок с вашего IP адреса'
            });
        }

        // Создаем заявку
        const insertResult = await db.query(`
            INSERT INTO applications (
                minecraft_nick, age, discord, email, experience, 
                motivation, plans, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, submitted_at
        `, [
            minecraft_nick, age, discord, email, experience,
            motivation, plans, ip, userAgent
        ]);

        const application = insertResult.rows[0];

        // Логируем действие
        await db.query(`
            INSERT INTO user_activity (user_id, activity_type, description, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [
            null,
            'application_submitted',
            `Подана заявка от ${minecraft_nick} (${email})`,
            ip
        ]);

        console.log(`✅ Новая заявка от ${minecraft_nick}:`, {
            id: application.id,
            email,
            experience,
            motivation: motivation.substring(0, 100) + '...'
        });

        res.json({
            success: true,
            message: 'Заявка успешно отправлена! Мы рассмотрим её в ближайшее время.',
            application_id: application.id,
            submitted_at: application.submitted_at
        });

    } catch (error) {
        console.error('Ошибка при обработке заявки:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/applications/status/:email - Проверка статуса заявки
router.get('/status/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const result = await db.query(`
            SELECT id, minecraft_nick, status, submitted_at, reviewed_at, review_comment
            FROM applications
            WHERE email = $1
            ORDER BY submitted_at DESC
            LIMIT 1
        `, [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Заявка не найдена'
            });
        }

        const application = result.rows[0];

        res.json({
            id: application.id,
            minecraft_nick: application.minecraft_nick,
            status: application.status,
            submitted_at: application.submitted_at,
            reviewed_at: application.reviewed_at,
            review_comment: application.review_comment,
            status_text: getStatusText(application.status)
        });

    } catch (error) {
        console.error('Ошибка проверки статуса заявки:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/applications - Получение всех заявок (только для админов)
router.get('/', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || 'all';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let queryParams = [limit, offset];

        if (status !== 'all') {
            whereClause = 'WHERE status = $3';
            queryParams.push(status);
        }

        const result = await db.query(`
            SELECT a.*, u.nickname as reviewed_by_nickname
            FROM applications a
            LEFT JOIN users u ON a.reviewed_by = u.id
            ${whereClause}
            ORDER BY a.submitted_at DESC
            LIMIT $1 OFFSET $2
        `, queryParams);

        // Получаем общее количество
        const countParams = status !== 'all' ? [status] : [];
        const countResult = await db.query(`
            SELECT COUNT(*) as total FROM applications ${whereClause}
        `, countParams);

        const total = parseInt(countResult.rows[0].total);

        res.json({
            applications: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Ошибка получения заявок:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// PUT /api/applications/:id/review - Рассмотрение заявки (только для админов)
router.put('/:id/review', [
    authenticateToken,
    requireRole(['admin', 'moderator']),
    body('status').isIn(['approved', 'rejected']),
    body('comment').optional().isLength({ max: 1000 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const { status, comment } = req.body;

        // Получаем данные заявки
        const applicationResult = await db.query(`
            SELECT * FROM applications WHERE id = $1
        `, [id]);

        if (applicationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }

        const application = applicationResult.rows[0];

        if (application.status !== 'pending') {
            return res.status(400).json({
                error: 'Заявка уже была рассмотрена'
            });
        }

        // Обновляем статус заявки
        await db.query(`
            UPDATE applications 
            SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_comment = $3
            WHERE id = $4
        `, [status, req.user.id, comment, id]);

        // Если заявка одобрена, создаем пользователя
        if (status === 'approved') {
            await createUserFromApplication(application);
        }

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'application_reviewed',
            `Заявка ${application.minecraft_nick} ${status === 'approved' ? 'одобрена' : 'отклонена'}${comment ? ': ' + comment : ''}`,
            application.user_id
        ]);

        res.json({
            success: true,
            message: `Заявка ${status === 'approved' ? 'одобрена' : 'отклонена'}`,
            application_id: id,
            status
        });

    } catch (error) {
        console.error('Ошибка рассмотрения заявки:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/applications/stats - Статистика заявок (для админов)
router.get('/stats', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const statsResult = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN submitted_at > NOW() - INTERVAL '24 hours' THEN 1 END) as today,
                COUNT(CASE WHEN submitted_at > NOW() - INTERVAL '7 days' THEN 1 END) as this_week
            FROM applications
        `);

        res.json(statsResult.rows[0]);

    } catch (error) {
        console.error('Ошибка получения статистики заявок:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Функция создания пользователя из одобренной заявки
async function createUserFromApplication(application) {
    try {
        // Генерируем временный пароль
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        // Создаем пользователя
        const userResult = await db.query(`
            INSERT INTO users (
                nickname, email, discord_tag, password_hash, 
                is_email_verified, trust_level
            ) VALUES ($1, $2, $3, $4, false, 0)
            RETURNING id
        `, [
            application.minecraft_nick,
            application.email,
            application.discord,
            hashedPassword
        ]);

        const userId = userResult.rows[0].id;

        // Связываем заявку с пользователем
        await db.query(`
            UPDATE applications SET user_id = $1 WHERE id = $2
        `, [userId, application.id]);

        // Создаем записи в связанных таблицах
        await db.query(`
            INSERT INTO player_stats (
                user_id, total_minutes, daily_limit_minutes, is_time_limited,
                current_level, email_verified, discord_verified, 
                minecraft_verified, reputation, total_logins, warnings_count
            ) VALUES ($1, 0, 600, true, 0, false, false, false, 0, 0, 0)
        `, [userId]);

        // Добавляем достижение "Первый вход"
        const achievementResult = await db.query(`
            SELECT id FROM achievements WHERE name = 'Первый вход' LIMIT 1
        `);

        if (achievementResult.rows.length > 0) {
            await db.query(`
                INSERT INTO user_achievements (user_id, achievement_id)
                VALUES ($1, $2)
            `, [userId, achievementResult.rows[0].id]);
        }

        console.log(`✅ Создан пользователь для ${application.minecraft_nick}, временный пароль: ${tempPassword}`);

        return { userId, tempPassword };

    } catch (error) {
        console.error('Ошибка создания пользователя из заявки:', error);
        throw error;
    }
}

// Функция получения текста статуса
function getStatusText(status) {
    const statusTexts = {
        'pending': 'На рассмотрении',
        'approved': 'Одобрена',
        'rejected': 'Отклонена',
        'banned': 'Заблокирована'
    };
    return statusTexts[status] || 'Неизвестно';
}

module.exports = router;
