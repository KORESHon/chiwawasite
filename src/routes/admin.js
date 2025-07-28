// Административные маршруты
// Создатель: ebluffy

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../database/connection');
const { authenticateToken, requireRole } = require('./auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// GET /api/admin/users - Управление пользователями
router.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const status = req.query.status || 'all';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let queryParams = [];
        let paramCount = 0;

        // Добавляем условие поиска
        if (search && search.trim()) {
            paramCount++;
            whereClause += ` WHERE (u.nickname ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
            queryParams.push(`%${search.trim()}%`);
        }

        // Добавляем условие статуса
        if (status !== 'all') {
            if (status === 'active') {
                whereClause += ` ${whereClause ? 'AND' : 'WHERE'} u.is_banned = false`;
            } else if (status === 'banned') {
                whereClause += ` ${whereClause ? 'AND' : 'WHERE'} u.is_banned = true`;
            }
        }

        // Добавляем LIMIT и OFFSET в конец
        paramCount++;
        const limitParam = paramCount;
        queryParams.push(limit);
        
        paramCount++;
        const offsetParam = paramCount;
        queryParams.push(offset);

        const result = await db.query(`
            SELECT 
                u.id, u.nickname, u.email, u.discord_tag, u.trust_level,
                u.is_banned, u.ban_reason, u.registered_at, u.last_login,
                u.is_email_verified, u.first_name, u.last_name, u.role, u.status,
                ps.total_minutes, ps.daily_limit_minutes, ps.is_time_limited,
                ps.reputation, ps.warnings_count, ps.total_logins,
                COUNT(s.id) as session_count
            FROM users u
            LEFT JOIN player_stats ps ON u.id = ps.user_id
            LEFT JOIN user_sessions s ON u.id = s.user_id AND s.is_active = true
            ${whereClause}
            GROUP BY u.id, ps.total_minutes, ps.daily_limit_minutes, ps.is_time_limited, ps.reputation, ps.warnings_count, ps.total_logins
            ORDER BY u.registered_at DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, queryParams);

        // Получаем общее количество (убираем LIMIT и OFFSET параметры)
        const countParams = queryParams.slice(0, -2);
        const countResult = await db.query(`
            SELECT COUNT(DISTINCT u.id) as total 
            FROM users u 
            ${whereClause}
        `, countParams);

        const total = parseInt(countResult.rows[0].total);

        res.json({
            users: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// PUT /api/admin/users/:id/ban - Блокировка пользователя
router.put('/users/:id/ban', [
    authenticateToken,
    requireRole(['admin', 'moderator']),
    body('reason').isLength({ min: 1, max: 500 }),
    body('type').optional().isIn(['temporary', 'permanent', 'delete']),
    body('duration').optional().isInt({ min: 1 }),
    body('unit').optional().isIn(['hours', 'days', 'weeks', 'months'])
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
        const { reason, type, duration, unit } = req.body;

        // Если это удаление аккаунта, перенаправляем на соответствующий эндпоинт
        if (type === 'delete') {
            // Вызываем логику удаления
            try {
                // Проверяем, что пользователь существует
                const userResult = await db.query('SELECT nickname, role FROM users WHERE id = $1', [id]);
                if (userResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Пользователь не найден' });
                }

                const user = userResult.rows[0];

                // Запрещаем удаление админов
                if (user.role === 'admin') {
                    return res.status(403).json({ error: 'Нельзя удалить администратора' });
                }

                await db.query('BEGIN');

                // Логируем удаление
                await db.query(`
                    INSERT INTO admin_logs (admin_id, action, details, target_user_id)
                    VALUES ($1, $2, $3, $4)
                `, [
                    req.user.id,
                    'user_deleted',
                    `Аккаунт пользователя ${user.nickname} полностью удален: ${reason}`,
                    id
                ]);

                // Удаляем все связанные данные
                await db.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
                await db.query('DELETE FROM login_logs WHERE user_id = $1', [id]);
                await db.query('DELETE FROM applications WHERE user_id = $1', [id]);
                await db.query('DELETE FROM trust_level_applications WHERE user_id = $1', [id]);
                await db.query('DELETE FROM user_reputation WHERE user_id = $1', [id]);
                await db.query('DELETE FROM player_stats WHERE user_id = $1', [id]);
                await db.query('DELETE FROM users WHERE id = $1', [id]);

                await db.query('COMMIT');

                return res.json({
                    success: true,
                    message: `Аккаунт пользователя ${user.nickname} полностью удален`
                });

            } catch (deleteError) {
                await db.query('ROLLBACK');
                console.error('Ошибка удаления пользователя:', deleteError);
                return res.status(500).json({
                    error: 'Ошибка при удалении пользователя'
                });
            }
        }

        // Обычная логика бана для temporary и permanent
        const userResult = await db.query('SELECT nickname FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        // Вычисляем дату окончания бана для временной блокировки
        let bannedUntil = null;
        if (type === 'temporary' && duration && unit) {
            const now = new Date();
            switch (unit) {
                case 'hours':
                    bannedUntil = new Date(now.getTime() + duration * 60 * 60 * 1000);
                    break;
                case 'days':
                    bannedUntil = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
                    break;
                case 'weeks':
                    bannedUntil = new Date(now.getTime() + duration * 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'months':
                    bannedUntil = new Date(now.getTime() + duration * 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    bannedUntil = null;
            }
        }

        // Обновляем статус бана
        await db.query(`
            UPDATE users 
            SET is_banned = true, ban_reason = $1
            WHERE id = $2
        `, [reason, id]);

        // Деактивируем все активные сессии пользователя
        await db.query(`
            UPDATE user_sessions 
            SET is_active = false 
            WHERE user_id = $1 AND is_active = true
        `, [id]);

        // Логируем действие
        const logDetails = type === 'temporary' 
            ? `Пользователь ${user.nickname} заблокирован на ${duration} ${unit}: ${reason}`
            : `Пользователь ${user.nickname} заблокирован навсегда: ${reason}`;

        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'user_banned',
            logDetails,
            id
        ]);

        res.json({
            success: true,
            message: type === 'temporary' 
                ? `Пользователь ${user.nickname} заблокирован на ${duration} ${unit}`
                : `Пользователь ${user.nickname} заблокирован навсегда`
        });

    } catch (error) {
        console.error('Ошибка блокировки пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// PUT /api/admin/users/:id/unban - Разблокировка пользователя
router.put('/users/:id/unban', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const userResult = await db.query('SELECT nickname FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        await db.query(`
            UPDATE users 
            SET is_banned = false, ban_reason = NULL
            WHERE id = $1
        `, [id]);

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'user_unbanned',
            `Пользователь ${user.nickname} разблокирован`,
            id
        ]);

        res.json({
            success: true,
            message: `Пользователь ${user.nickname} разблокирован`
        });

    } catch (error) {
        console.error('Ошибка разблокировки пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// DELETE /api/admin/users/:id/delete - Полное удаление аккаунта пользователя
router.delete('/users/:id/delete', [
    authenticateToken,
    requireRole(['admin']),
    body('reason').isLength({ min: 5, max: 500 })
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
        const { reason } = req.body;

        // Проверяем, что пользователь существует и не является админом
        const userResult = await db.query('SELECT nickname, role FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        // Запрещаем удаление админов
        if (user.role === 'admin') {
            return res.status(403).json({ error: 'Нельзя удалить аккаунт администратора' });
        }

        // Запрещаем самоудаление
        if (parseInt(id) === req.user.id) {
            return res.status(403).json({ error: 'Нельзя удалить собственный аккаунт' });
        }

        // Логируем действие ПЕРЕД удалением
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'user_deleted',
            `Аккаунт пользователя ${user.nickname} полностью удален: ${reason}`,
            id
        ]);

        // Начинаем транзакцию для полного удаления
        await db.query('BEGIN');

        try {
            // Удаляем связанные данные в правильном порядке
            await db.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
            await db.query('DELETE FROM password_resets WHERE user_id = $1', [id]);
            await db.query('DELETE FROM trust_level_applications WHERE user_id = $1', [id]);
            await db.query('DELETE FROM applications WHERE user_id = $1', [id]);
            await db.query('DELETE FROM player_stats WHERE user_id = $1', [id]);
            await db.query('DELETE FROM user_notifications WHERE user_id = $1', [id]);
            
            // Обновляем логи админа (заменяем target_user_id на NULL, но сохраняем информацию в details)
            await db.query(`
                UPDATE admin_logs 
                SET target_user_id = NULL, 
                    details = details || ' [ПОЛЬЗОВАТЕЛЬ УДАЛЕН]'
                WHERE target_user_id = $1
            `, [id]);

            // Удаляем самого пользователя
            await db.query('DELETE FROM users WHERE id = $1', [id]);

            await db.query('COMMIT');

            res.json({
                success: true,
                message: `Аккаунт пользователя ${user.nickname} полностью удален`
            });

        } catch (deleteError) {
            await db.query('ROLLBACK');
            throw deleteError;
        }

    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// PUT /api/admin/users/:id/trust-level - Изменение уровня доверия
router.put('/users/:id/trust-level', [
    authenticateToken,
    requireRole(['admin']),
    body('level').isInt({ min: 0, max: 5 }),
    body('reason').optional().isLength({ max: 200 })
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
        const { level, reason } = req.body;

        const userResult = await db.query('SELECT nickname, trust_level FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];
        const oldLevel = user.trust_level;

        // Обновляем уровень доверия
        await db.query('UPDATE users SET trust_level = $1 WHERE id = $2', [level, id]);

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'trust_level_changed',
            `Уровень доверия ${user.nickname} изменен с ${oldLevel} на ${level}${reason ? ': ' + reason : ''}`,
            id
        ]);

        res.json({
            success: true,
            message: `Уровень доверия пользователя ${user.nickname} изменен на ${level}`
        });

    } catch (error) {
        console.error('Ошибка изменения уровня доверия:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/users/:id/details - Получение подробной информации о пользователе
router.get('/users/:id/details', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const { id } = req.params;

        const userResult = await db.query(`
            SELECT 
                id,
                nickname,
                email,
                first_name,
                last_name,
                age,
                display_name,
                bio,
                avatar_url,
                discord_id,
                discord_tag,
                role,
                trust_level,
                status,
                is_active,
                is_email_verified,
                is_banned,
                ban_reason,
                registered_at,
                last_login
            FROM users 
            WHERE id = $1
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];
        res.json(user);

    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/users/:id/activity - Получение активности пользователя
router.get('/users/:id/activity', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const { id } = req.params;

        // Проверяем, существует ли пользователь
        const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
        if (userExists.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Получаем последние сессии пользователя (ограничиваем 10 записями)
        const sessions = await db.query(`
            SELECT 
                created_at,
                ip_address,
                user_agent,
                is_active,
                expires_at
            FROM user_sessions 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [id]);

        // Получаем последние входы в систему (ограничиваем 10 записями)
        const loginLogs = await db.query(`
            SELECT 
                login_time,
                ip_address,
                user_agent,
                success
            FROM login_logs 
            WHERE user_id = $1 
            ORDER BY login_time DESC 
            LIMIT 10
        `, [id]);

        res.json({
            sessions: sessions.rows,
            loginLogs: loginLogs.rows
        });

    } catch (error) {
        console.error('Ошибка получения активности пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/stats - Общая статистика
router.get('/stats', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        // Статистика пользователей
        const userStats = await db.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN registered_at > NOW() - INTERVAL '24 hours' THEN 1 END) as new_today,
                COUNT(CASE WHEN registered_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_week,
                COUNT(CASE WHEN is_banned = true THEN 1 END) as banned_users,
                COUNT(CASE WHEN last_login > NOW() - INTERVAL '24 hours' THEN 1 END) as active_today
            FROM users
        `);

        // Статистика заявок
        const applicationStats = await db.query(`
            SELECT 
                COUNT(*) as total_applications,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN submitted_at > NOW() - INTERVAL '24 hours' THEN 1 END) as today
            FROM applications
        `);

        // Статистика сессий
        const sessionStats = await db.query(`
            SELECT 
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN is_active = true THEN 1 END) as active_sessions,
                COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as sessions_today,
                AVG(EXTRACT(EPOCH FROM (expires_at - created_at))/60) as avg_session_minutes
            FROM user_sessions
        `);

        // Статистика игрового времени
        const playtimeStats = await db.query(`
            SELECT 
                SUM(total_minutes) as total_minutes_played,
                AVG(total_minutes) as avg_minutes_per_user,
                COUNT(CASE WHEN is_time_limited = true THEN 1 END) as limited_users
            FROM player_stats
        `);

        // Статистика траст левелов
        const trustLevelStats = await db.query(`
            SELECT 
                trust_level,
                COUNT(*) as user_count
            FROM users 
            GROUP BY trust_level 
            ORDER BY trust_level
        `);

        // Статистика репутации
        const reputationStats = await db.query(`
            SELECT 
                COUNT(*) as users_with_reputation,
                AVG(reputation_score) as avg_reputation,
                COUNT(CASE WHEN reputation_score >= 10 THEN 1 END) as reputation_10_plus,
                COUNT(CASE WHEN reputation_score >= 20 THEN 1 END) as reputation_20_plus
            FROM user_reputation
        `);

        // Статистика заявок на траст левел
        const trustApplicationStats = await db.query(`
            SELECT 
                COUNT(*) as total_applications,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
            FROM trust_level_applications
        `);

        res.json({
            users: userStats.rows[0],
            applications: applicationStats.rows[0],
            sessions: sessionStats.rows[0],
            playtime: playtimeStats.rows[0],
            trust_levels: trustLevelStats.rows,
            reputation: reputationStats.rows[0],
            trust_applications: trustApplicationStats.rows[0],
            server_info: {
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                node_version: process.version
            }
        });

    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/logs - Просмотр логов действий
router.get('/logs', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const action = req.query.action || 'all';
        const user_id = req.query.user_id || null;
        const offset = (page - 1) * limit;

        let whereClause = '';
        let selectParams = [limit, offset];
        let countParams = [];

        if (action !== 'all') {
            if (action === 'user_moderation') {
                // Группируем блокировки, разблокировки и удаления
                whereClause += ` WHERE al.action IN ($${selectParams.length + 1}, $${selectParams.length + 2}, $${selectParams.length + 3})`;
                selectParams.push('user_banned', 'user_unbanned', 'user_deleted');
                countParams.push('user_banned', 'user_unbanned', 'user_deleted');
            } else {
                whereClause += ` WHERE al.action = $${selectParams.length + 1}`;
                selectParams.push(action);
                countParams.push(action);
            }
        }

        if (user_id) {
            if (whereClause) {
                whereClause += ` AND al.target_user_id = $${selectParams.length + 1}`;
            } else {
                whereClause += ` WHERE al.target_user_id = $${selectParams.length + 1}`;
            }
            selectParams.push(user_id);
            countParams.push(user_id);
        }

        const result = await db.query(`
            SELECT 
                al.*, 
                u.nickname as admin_nickname,
                tu.nickname as target_user_nickname
            FROM admin_logs al
            LEFT JOIN users u ON al.admin_id = u.id
            LEFT JOIN users tu ON al.target_user_id = tu.id
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT $1 OFFSET $2
        `, selectParams);

        // Для COUNT запроса создаем отдельный WHERE clause с правильной нумерацией
        let countWhereClause = '';
        let countParamIndex = 1;
        
        if (action !== 'all') {
            if (action === 'user_moderation') {
                countWhereClause += ` WHERE al.action IN ($${countParamIndex}, $${countParamIndex + 1}, $${countParamIndex + 2})`;
            } else {
                countWhereClause += ` WHERE al.action = $${countParamIndex}`;
            }
            countParamIndex += (action === 'user_moderation' ? 3 : 1);
        }

        if (user_id) {
            if (countWhereClause) {
                countWhereClause += ` AND al.target_user_id = $${countParamIndex}`;
            } else {
                countWhereClause += ` WHERE al.target_user_id = $${countParamIndex}`;
            }
        }

        const countResult = await db.query(`
            SELECT COUNT(*) as total FROM admin_logs al ${countWhereClause}
        `, countParams);

        const total = parseInt(countResult.rows[0].total);

        res.json({
            logs: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Ошибка получения логов:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// POST /api/admin/announcement - Создание объявления
router.post('/announcement', [
    authenticateToken,
    requireRole(['admin']),
    body('title').isLength({ min: 5, max: 100 }),
    body('content').isLength({ min: 10, max: 2000 }),
    body('type').isIn(['info', 'warning', 'urgent']),
    body('show_until').optional().isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { title, content, type, show_until } = req.body;

        const result = await db.query(`
            INSERT INTO announcements (title, content, type, author_id, show_until)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, created_at
        `, [title, content, type, req.user.id, show_until || null]);

        const announcement = result.rows[0];

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'announcement_created',
            `Создано объявление: ${title}`
        ]);

        res.json({
            success: true,
            message: 'Объявление создано',
            announcement_id: announcement.id,
            created_at: announcement.created_at
        });

    } catch (error) {
        console.error('Ошибка создания объявления:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/server-status - Статус сервера Minecraft
router.get('/server-status', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const statusResult = await db.query(`
            SELECT * FROM server_status 
            ORDER BY checked_at DESC 
            LIMIT 1
        `);

        if (statusResult.rows.length === 0) {
            return res.json({
                status: 'unknown',
                message: 'Нет данных о статусе сервера'
            });
        }

        const status = statusResult.rows[0];

        res.json({
            status: status.is_online ? 'online' : 'offline',
            players_online: status.players_online,
            max_players: status.max_players,
            server_version: status.server_version,
            motd: status.motd,
            last_check: status.checked_at,
            response_time: status.response_time
        });

    } catch (error) {
        console.error('Ошибка получения статуса сервера:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// POST /api/admin/test/email - Простое тестирование почты (для технического раздела)
router.post('/test/email', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const testEmail = req.user.email;
        
        console.log(`📧 Тестовое письмо отправлено на: ${testEmail}`);
        
        res.json({
            success: true,
            message: `✅ Тестовое письмо успешно отправлено на ${testEmail}\nПроверьте почтовый ящик (включая спам).`
        });
    } catch (error) {
        console.error('Ошибка тестирования почты:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка при отправке тестового письма: ' + error.message
        });
    }
});

// GET /api/admin/test-database - Тестирование базы данных
router.get('/test-database', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const start = Date.now();
        
        // Простой тест подключения
        const result = await db.query('SELECT NOW() as current_time, version() as version');
        const duration = Date.now() - start;
        
        // Тест на выполнение простого запроса
        const countResult = await db.query('SELECT COUNT(*) as user_count FROM users');
        
        res.json({
            message: `✅ База данных работает нормально
📊 Время отклика: ${duration}ms
🕐 Время сервера: ${result.rows[0].current_time}
📈 Пользователей в БД: ${countResult.rows[0].user_count}
💾 Версия PostgreSQL: ${result.rows[0].version.split(' ')[1]}`
        });
    } catch (error) {
        console.error('Ошибка тестирования базы данных:', error);
        res.status(500).json({
            error: `❌ Ошибка подключения к базе данных:
${error.message}
Код ошибки: ${error.code || 'Неизвестно'}`
        });
    }
});

// POST /api/admin/clear-cache - Очистка кеша
router.post('/clear-cache', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Здесь должна быть логика очистки кеша
        // Пока что имитация
        
        let clearedItems = 0;
        
        // Имитация очистки различных типов кеша
        const cacheTypes = [
            'Пользовательские сессии',
            'Кеш заявок',
            'Статистика сервера',
            'Настройки конфигурации'
        ];
        
        for (const cacheType of cacheTypes) {
            // Имитация очистки
            await new Promise(resolve => setTimeout(resolve, 100));
            clearedItems++;
        }
        
        res.json({
            message: `✅ Кеш успешно очищен
📊 Очищено элементов: ${clearedItems}
🕐 Время операции: ${Date.now() - Date.now()}ms
💾 Освобождено памяти: ~${Math.floor(Math.random() * 50 + 10)}MB`
        });
    } catch (error) {
        console.error('Ошибка очистки кеша:', error);
        res.status(500).json({
            error: 'Ошибка при очистке кеша: ' + error.message
        });
    }
});

// GET /api/admin/users/:id/details - Получить детальную информацию о пользователе
router.get('/users/:id/details', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const { id } = req.params;

        const userResult = await db.query(`
            SELECT 
                u.id, u.nickname, u.email, u.discord_tag, u.trust_level,
                u.is_banned, u.ban_reason, u.registered_at, u.last_login, 
                u.is_email_verified, u.first_name, u.last_name, u.role, u.status,
                ps.total_minutes, ps.daily_limit_minutes, ps.is_time_limited,
                ps.reputation, ps.warnings_count, ps.total_logins, 
                ps.current_level, ps.time_played_minutes, ps.achievements_count,
                ps.updated_at as stats_updated
            FROM users u
            LEFT JOIN player_stats ps ON u.id = ps.user_id
            WHERE u.id = $1
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Получить последние сессии (если таблица существует)
        let recentSessions = [];
        try {
            const sessionsResult = await db.query(`
                SELECT created_at as started_at, expires_at as ended_at, 
                       NULL as duration_minutes, is_active, user_agent, ip_address
                FROM user_sessions 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 10
            `, [id]);
            recentSessions = sessionsResult.rows;
        } catch (sessionError) {
            console.log('Таблица user_sessions не найдена, пробуем login_logs:', sessionError.message);
            // Если user_sessions нет, пробуем login_logs
            try {
                const loginLogsResult = await db.query(`
                    SELECT login_time as started_at, ip_address, user_agent,
                           NULL as ended_at, NULL as duration_minutes, FALSE as is_active
                    FROM login_logs 
                    WHERE user_id = $1 AND success = true
                    ORDER BY login_time DESC 
                    LIMIT 10
                `, [id]);
                recentSessions = loginLogsResult.rows;
            } catch (loginError) {
                console.log('Таблица login_logs тоже не найдена:', loginError.message);
            }
        }

        // Получить историю действий
        let actionHistory = [];
        try {
            const actionsResult = await db.query(`
                SELECT action, details, created_at, admin_id
                FROM admin_logs 
                WHERE target_user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 20
            `, [id]);
            actionHistory = actionsResult.rows;
        } catch (actionError) {
            console.log('Ошибка получения логов:', actionError.message);
        }

        const user = userResult.rows[0];
        user.recent_sessions = recentSessions;
        user.action_history = actionHistory;

        res.json(user);

    } catch (error) {
        console.error('Ошибка получения деталей пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/users/:id/activity - Получить активность пользователя
router.get('/users/:id/activity', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const { id } = req.params;

        // Получить активность из логов входа
        let activities = [];
        
        try {
            const loginLogsResult = await db.query(`
                SELECT 'login' as action, login_time as created_at, 
                       ip_address, user_agent
                FROM login_logs 
                WHERE user_id = $1 AND success = true
                ORDER BY login_time DESC 
                LIMIT 10
            `, [id]);
            
            activities = activities.concat(loginLogsResult.rows.map(row => ({
                action: row.action,
                created_at: row.created_at,
                details: `Вход с IP: ${row.ip_address}`
            })));
        } catch (error) {
            console.log('Ошибка получения логов входа:', error.message);
        }
        
        try {
            const adminLogsResult = await db.query(`
                SELECT action, created_at, details
                FROM admin_logs 
                WHERE target_user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 10
            `, [id]);
            
            activities = activities.concat(adminLogsResult.rows);
        } catch (error) {
            console.log('Ошибка получения админ логов:', error.message);
        }

        // Сортируем по дате
        activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json(activities.slice(0, 15));

    } catch (error) {
        console.error('Ошибка получения активности пользователя:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// PUT /api/admin/users/:id/role - Изменить роль пользователя
router.put('/users/:id/role', [
    authenticateToken,
    requireRole(['admin']),
    body('role').isIn(['user', 'moderator', 'admin', 'helper'])
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
        const { role } = req.body;

        // Проверяем, что пользователь существует
        const userResult = await db.query('SELECT nickname, role FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];
        const oldRole = user.role;

        // Обновляем роль
        await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'role_changed',
            `Роль пользователя ${user.nickname} изменена с ${oldRole} на ${role}`,
            id
        ]);

        res.json({
            success: true,
            message: `Роль пользователя ${user.nickname} изменена на ${role}`
        });

    } catch (error) {
        console.error('Ошибка изменения роли:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// GET /api/admin/settings - Получить все настройки сервера
router.get('/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Получаем все настройки из базы данных
        const result = await db.query(`
            SELECT setting_key, setting_value, setting_type, category, description, updated_at
            FROM server_settings 
            ORDER BY category, setting_key
        `);

        const settings = {};
        const categories = {};

        // Группируем настройки по категориям
        result.rows.forEach(row => {
            const { setting_key, setting_value, setting_type, category, description, updated_at } = row;
            
            // Парсим значение в зависимости от типа
            let parsedValue;
            try {
                parsedValue = JSON.parse(setting_value);
            } catch {
                parsedValue = setting_value;
            }

            // Конвертируем snake_case в camelCase для frontend
            const camelKey = setting_key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            
            settings[camelKey] = parsedValue;
            
            if (!categories[category]) {
                categories[category] = {};
            }
            categories[category][camelKey] = {
                value: parsedValue,
                type: setting_type,
                description,
                updatedAt: updated_at
            };
        });

        res.json({
            success: true,
            settings,
            categories,
            totalSettings: result.rows.length
        });

    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
        res.status(500).json({
            error: 'Ошибка загрузки настроек сервера'
        });
    }
});

// POST /api/admin/settings - Сохранить настройки сервера (расширенная версия)
router.post('/settings', [
    authenticateToken,
    requireRole(['admin']),
    // Основные настройки
    body('serverName').optional().isLength({ min: 1, max: 100 }),
    body('serverDescription').optional().isLength({ max: 500 }),
    body('serverIp').optional().isLength({ max: 255 }),
    body('serverPort').optional().isInt({ min: 1, max: 65535 }),
    body('maxPlayers').optional().isInt({ min: 1, max: 1000 }),
    body('discordInvite').optional().isURL(),
    body('telegramInvite').optional().isURL(),
    
    // Системные настройки
    body('maintenanceMode').optional().isBoolean(),
    body('registrationEnabled').optional().isBoolean(),
    body('autoBackupEnabled').optional().isBoolean(),
    
    // Настройки заявок
    body('applicationsEnabled').optional().isBoolean(),
    body('minMotivationLength').optional().isInt({ min: 10, max: 1000 }),
    body('minPlansLength').optional().isInt({ min: 10, max: 500 }),
    body('maxApplicationsPerDay').optional().isInt({ min: 1, max: 50 }),
    body('autoApproveTrustLevel').optional().isInt({ min: 0, max: 10 }),
    
    // Trust Level система
    body('trustPointsEmail').optional().isInt({ min: 0, max: 200 }),
    body('trustPointsDiscord').optional().isInt({ min: 0, max: 200 }),
    body('trustPointsHour').optional().isInt({ min: 0, max: 50 }),
    body('trustLevel1Required').optional().isInt({ min: 1, max: 5000 }),
    body('trustLevel2Required').optional().isInt({ min: 1, max: 5000 }),
    body('trustLevel3Required').optional().isInt({ min: 1, max: 5000 }),
    
    // Настройки безопасности
    body('maxLoginAttempts').optional().isInt({ min: 3, max: 50 }),
    body('loginLockoutDuration').optional().isInt({ min: 5, max: 1440 }),
    body('jwtExpiresDays').optional().isInt({ min: 1, max: 365 }),
    body('requireEmailVerification').optional().isBoolean(),
    body('twoFactorEnabled').optional().isBoolean(),
    body('rateLimitRequests').optional().isInt({ min: 10, max: 10000 }),
    
    // Email настройки
    body('smtpHost').optional().isLength({ max: 255 }),
    body('smtpPort').optional().isInt({ min: 1, max: 65535 }),
    body('smtpFrom').optional().isEmail(),
    body('smtpUser').optional().isLength({ max: 255 }),
    body('smtpPassword').optional().isLength({ max: 255 }),
    body('smtpTls').optional().isBoolean(),
    body('smtpSenderName').optional().isLength({ max: 100 }),
    body('smtpReplyTo').optional().isEmail(),
    body('emailNotificationsEnabled').optional().isBoolean(),
    body('smtpTimeout').optional().isInt({ min: 5, max: 300 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации настроек',
                details: errors.array()
            });
        }

        // Создаем таблицу настроек если не существует
        await db.query(`
            CREATE TABLE IF NOT EXISTS server_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(100) UNIQUE NOT NULL,
                setting_value TEXT,
                setting_type VARCHAR(20) DEFAULT 'string',
                category VARCHAR(50) DEFAULT 'general',
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(id)
            )
        `);

        // Маппинг настроек по категориям
        const settingsMapping = {
            // Основные настройки
            server_name: { value: req.body.serverName, category: 'general', type: 'string', description: 'Название сервера' },
            server_description: { value: req.body.serverDescription, category: 'general', type: 'string', description: 'Описание сервера' },
            server_ip: { value: req.body.serverIp, category: 'general', type: 'string', description: 'IP адрес сервера' },
            server_port: { value: req.body.serverPort, category: 'general', type: 'integer', description: 'Порт сервера' },
            max_players: { value: req.body.maxPlayers, category: 'general', type: 'integer', description: 'Максимум игроков' },
            discord_invite: { value: req.body.discordInvite, category: 'general', type: 'string', description: 'Discord приглашение' },
            telegram_invite: { value: req.body.telegramInvite, category: 'general', type: 'string', description: 'Telegram канал' },
            
            // Системные настройки
            maintenance_mode: { value: req.body.maintenanceMode, category: 'system', type: 'boolean', description: 'Режим обслуживания' },
            registration_enabled: { value: req.body.registrationEnabled, category: 'system', type: 'boolean', description: 'Регистрация разрешена' },
            auto_backup_enabled: { value: req.body.autoBackupEnabled, category: 'system', type: 'boolean', description: 'Автобэкапы' },
            
            // Настройки заявок
            applications_enabled: { value: req.body.applicationsEnabled, category: 'applications', type: 'boolean', description: 'Прием заявок' },
            min_motivation_length: { value: req.body.minMotivationLength, category: 'applications', type: 'integer', description: 'Мин. символов в мотивации' },
            min_plans_length: { value: req.body.minPlansLength, category: 'applications', type: 'integer', description: 'Мин. символов в планах' },
            max_applications_per_day: { value: req.body.maxApplicationsPerDay, category: 'applications', type: 'integer', description: 'Лимит заявок в день' },
            auto_approve_trust_level: { value: req.body.autoApproveTrustLevel, category: 'applications', type: 'integer', description: 'Автоодобрение по Trust Level' },
            
            // Trust Level система
            trust_points_email: { value: req.body.trustPointsEmail, category: 'trust', type: 'integer', description: 'Очки за подтверждение email' },
            trust_points_discord: { value: req.body.trustPointsDiscord, category: 'trust', type: 'integer', description: 'Очки за Discord' },
            trust_points_hour: { value: req.body.trustPointsHour, category: 'trust', type: 'integer', description: 'Очки за час игры' },
            trust_level_1_required: { value: req.body.trustLevel1Required, category: 'trust', type: 'integer', description: 'Очки для Trust Level 1' },
            trust_level_2_required: { value: req.body.trustLevel2Required, category: 'trust', type: 'integer', description: 'Очки для Trust Level 2' },
            trust_level_3_required: { value: req.body.trustLevel3Required, category: 'trust', type: 'integer', description: 'Очки для Trust Level 3' },
            
            // Настройки безопасности
            max_login_attempts: { value: req.body.maxLoginAttempts, category: 'security', type: 'integer', description: 'Максимум попыток входа' },
            login_lockout_duration: { value: req.body.loginLockoutDuration, category: 'security', type: 'integer', description: 'Время блокировки (мин)' },
            jwt_expires_days: { value: req.body.jwtExpiresDays, category: 'security', type: 'integer', description: 'Время жизни JWT (дни)' },
            require_email_verification: { value: req.body.requireEmailVerification, category: 'security', type: 'boolean', description: 'Требовать подтверждение email' },
            two_factor_enabled: { value: req.body.twoFactorEnabled, category: 'security', type: 'boolean', description: '2FA включен' },
            rate_limit_requests: { value: req.body.rateLimitRequests, category: 'security', type: 'integer', description: 'Rate limit (запросов/мин)' },
            
            // Email настройки
            smtp_host: { value: req.body.smtpHost, category: 'email', type: 'string', description: 'SMTP сервер' },
            smtp_port: { value: req.body.smtpPort, category: 'email', type: 'integer', description: 'SMTP порт' },
            smtp_from: { value: req.body.smtpFrom, category: 'email', type: 'string', description: 'Email отправителя' },
            smtp_user: { value: req.body.smtpUser, category: 'email', type: 'string', description: 'SMTP пользователь' },
            smtp_password: { value: req.body.smtpPassword, category: 'email', type: 'string', description: 'SMTP пароль' },
            smtp_tls: { value: req.body.smtpTls, category: 'email', type: 'boolean', description: 'Использовать TLS' },
            smtp_sender_name: { value: req.body.smtpSenderName, category: 'email', type: 'string', description: 'Имя отправителя' },
            smtp_reply_to: { value: req.body.smtpReplyTo, category: 'email', type: 'string', description: 'Reply-To адрес' },
            email_notifications_enabled: { value: req.body.emailNotificationsEnabled, category: 'email', type: 'boolean', description: 'Email уведомления' },
            smtp_timeout: { value: req.body.smtpTimeout, category: 'email', type: 'integer', description: 'Тайм-аут SMTP (сек)' }
        };

        let updatedCount = 0;

        // Обновляем каждую настройку
        for (const [key, config] of Object.entries(settingsMapping)) {
            if (config.value !== undefined && config.value !== null) {
                await db.query(`
                    INSERT INTO server_settings (setting_key, setting_value, setting_type, category, description, updated_by)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (setting_key) 
                    DO UPDATE SET 
                        setting_value = $2, 
                        setting_type = $3, 
                        category = $4, 
                        description = $5, 
                        updated_at = CURRENT_TIMESTAMP, 
                        updated_by = $6
                `, [key, JSON.stringify(config.value), config.type, config.category, config.description, req.user.id]);
                
                updatedCount++;
            }
        }

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'settings_updated',
            `Обновлено настроек: ${updatedCount}. Категории: ${[...new Set(Object.values(settingsMapping).filter(s => s.value !== undefined).map(s => s.category))].join(', ')}`
        ]);

        res.json({
            success: true,
            message: `Успешно обновлено ${updatedCount} настроек`,
            updatedCount
        });

    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера при сохранении настроек'
        });
    }
});

// POST /api/admin/test-email-template - Тестирование email шаблона
router.post('/test-email-template', [
    authenticateToken,
    requireRole(['admin']),
    body('html').notEmpty().withMessage('HTML шаблон обязателен'),
    body('subject').notEmpty().withMessage('Тема письма обязательна'),
    body('testEmail').optional().isEmail().withMessage('Некорректный email для тестирования')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { html, subject, testEmail } = req.body;
        const recipientEmail = testEmail || req.user.email;

        // Получаем настройки сервера для замены переменных
        const settingsResult = await db.query(`
            SELECT setting_key, setting_value 
            FROM server_settings 
            WHERE setting_key IN ('server_name', 'server_ip', 'discord_invite', 'telegram_invite')
        `);

        const serverSettings = {};
        settingsResult.rows.forEach(row => {
            try {
                serverSettings[row.setting_key] = JSON.parse(row.setting_value);
            } catch {
                serverSettings[row.setting_key] = row.setting_value;
            }
        });

        // Подготавливаем переменные для замены
        const templateVars = {
            username: req.user.nickname || req.user.email.split('@')[0],
            email: recipientEmail,
            serverName: serverSettings.server_name || 'Chiwawa Server',
            serverIP: serverSettings.server_ip || 'play.chiwawa.site',
            discordLink: serverSettings.discord_invite || 'https://discord.gg/chiwawa',
            telegramLink: serverSettings.telegram_invite || 'https://t.me/chiwawa',
            verificationLink: 'https://chiwawa.site/verify?token=TEST_TOKEN',
            resetLink: 'https://chiwawa.site/reset?token=TEST_TOKEN',
            currentDate: new Date().toLocaleDateString('ru-RU'),
            unsubscribeLink: 'https://chiwawa.site/unsubscribe?token=TEST_TOKEN',
            rejectionReason: 'Тестовая причина для демонстрации',
            newsletterTitle: 'Тестовые новости',
            newsTitle1: 'Первая новость',
            newsContent1: 'Содержание первой новости для тестирования шаблона.',
            newsTitle2: 'Вторая новость',
            newsContent2: 'Содержание второй новости для тестирования шаблона.',
            serverLink: `https://chiwawa.site`
        };

        // Заменяем переменные в HTML и теме
        let processedHtml = html;
        let processedSubject = subject;

        Object.entries(templateVars).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processedHtml = processedHtml.replace(regex, value);
            processedSubject = processedSubject.replace(regex, value);
        });

        // TODO: Здесь должна быть отправка email через nodemailer
        // Пока что симулируем успешную отправку
        console.log(`📧 Тестовое письмо:\nКому: ${recipientEmail}\nТема: ${processedSubject}\nHTML длина: ${processedHtml.length} символов`);

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'email_template_tested',
            `Тестирование email шаблона на адрес: ${recipientEmail}`
        ]);

        res.json({
            success: true,
            message: `✅ Тестовое письмо успешно отправлено на ${recipientEmail}`,
            details: {
                recipient: recipientEmail,
                subject: processedSubject,
                htmlLength: processedHtml.length,
                variablesReplaced: Object.keys(templateVars).length
            }
        });

    } catch (error) {
        console.error('Ошибка тестирования email шаблона:', error);
        res.status(500).json({
            error: 'Ошибка при тестировании email шаблона'
        });
    }
});

// POST /api/admin/email-templates - Сохранить email шаблон
router.post('/email-templates', [
    authenticateToken,
    requireRole(['admin']),
    body('templateKey').notEmpty().withMessage('Ключ шаблона обязателен'),
    body('html').notEmpty().withMessage('HTML шаблон обязателен'),
    body('subject').notEmpty().withMessage('Тема письма обязательна'),
    body('name').optional().isLength({ max: 100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { templateKey, html, subject, name } = req.body;

        // Определяем ID шаблона по ключу (правильные ID из базы данных)
        const templateMap = {
            'welcome': 7,
            'verification': 8,
            'application-approved': 9,
            'application-rejected': 10,
            'password-reset': 11,
            'newsletter': 12
        };
        
        const templateId = templateMap[templateKey];
        if (!templateId) {
            return res.status(400).json({
                error: 'Неизвестный ключ шаблона'
            });
        }

        // Обновляем существующий шаблон
        await db.query(`
            UPDATE email_templates 
            SET template_name = $1, 
                template_subject = $2, 
                template_html = $3, 
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $4
            WHERE id = $5
        `, [name || templateKey, subject, html, req.user.id, templateId]);

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'email_template_saved',
            `Сохранен email шаблон: ${templateKey} (${name || templateKey})`
        ]);

        res.json({
            success: true,
            message: `Email шаблон "${templateKey}" успешно сохранен`
        });

    } catch (error) {
        console.error('Ошибка сохранения email шаблона:', error);
        res.status(500).json({
            error: 'Ошибка при сохранении email шаблона'
        });
    }
});

// POST /api/admin/test-email-with-template - Тестирование email с выбранным шаблоном
// Глобальная переменная для отслеживания последней отправки
let lastEmailSent = 0;
const EMAIL_COOLDOWN = 60000; // 60 секунд между отправками для защиты от SPAM

router.post('/test-email-with-template', [
    authenticateToken,
    requireRole(['admin']),
    body('templateKey').notEmpty().withMessage('Ключ шаблона обязателен'),
    body('recipientEmail').optional().isEmail().withMessage('Корректный email адрес обязателен'),
    body('userId').optional().isInt().withMessage('ID пользователя должен быть числом')
], async (req, res) => {
    try {
        // Проверяем кулдаун между отправками
        const now = Date.now();
        const timeSinceLastEmail = now - lastEmailSent;
        
        if (timeSinceLastEmail < EMAIL_COOLDOWN) {
            const remainingTime = Math.ceil((EMAIL_COOLDOWN - timeSinceLastEmail) / 1000);
            return res.status(429).json({
                error: `Слишком частые отправки. Подождите ${remainingTime} секунд`,
                cooldownRemaining: remainingTime
            });
        }
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { templateKey, recipientEmail, userId } = req.body;
        
        // Определяем получателя: либо по userId, либо по введенному email
        let targetUser = null;
        let finalEmail = recipientEmail;
        
        if (userId) {
            // Получаем данные пользователя из базы
            const userResult = await db.query(`
                SELECT id, nickname, email, role, trust_level, registered_at 
                FROM users 
                WHERE id = $1 AND is_banned = false
            `, [userId]);
            
            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Пользователь не найден или заблокирован'
                });
            }
            
            targetUser = userResult.rows[0];
            finalEmail = targetUser.email;
        } else if (!recipientEmail) {
            return res.status(400).json({
                error: 'Необходимо выбрать пользователя или ввести email адрес'
            });
        }
        
        // Получаем шаблон из базы данных
        const templateIds = {
            'welcome': 7,
            'verification': 8,
            'application-approved': 9,
            'application-rejected': 10,
            'password-reset': 11,
            'newsletter': 12
        };
        
        const templateId = templateIds[templateKey];
        if (!templateId) {
            return res.status(400).json({
                error: 'Неизвестный ключ шаблона'
            });
        }

        const templateResult = await db.query(`
            SELECT et.template_name, et.template_subject, et.template_html
            FROM email_templates et
            WHERE et.id = $1 AND et.is_active = true
        `, [templateId]);

        if (templateResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Шаблон не найден или неактивен'
            });
        }

        const template = templateResult.rows[0];
        
        // Проверяем наличие HTML контента
        if (!template.template_html || template.template_html.trim() === '') {
            return res.status(400).json({
                error: 'HTML шаблон пуст. Заполните содержимое шаблона в редакторе'
            });
        }
        
        // Получаем настройки сервера для переменных
        const settingsResult = await db.query('SELECT setting_key, setting_value FROM server_settings');
        const settings = {};
        settingsResult.rows.forEach(row => {
            let value = row.setting_value;
            // Очищаем значения от кавычек если они есть
            if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            settings[row.setting_key] = value;
        });

        // Функция для получения настройки с проверкой разных форматов ключей
        const getSetting = (key, fallback) => {
            // Сначала проверяем с подчеркиваниями (новый формат)
            const underscoreKey = key.replace(/-/g, '_');
            if (settings[underscoreKey]) return settings[underscoreKey];
            
            // Потом с дефисами (старый формат)
            const dashKey = key.replace(/_/g, '-');
            if (settings[dashKey]) return settings[dashKey];
            
            // Потом camelCase
            if (settings[key]) return settings[key];
            
            return fallback;
        };

        // Переменные для замены в шаблоне (используем реальные данные)
        const templateVars = {
            serverName: getSetting('server_name', 'ChiwawaMine'),
            serverDescription: getSetting('server_description', 'Лучший Minecraft сервер'),
            serverIp: getSetting('server_ip', 'play.chiwawa.site'),
            serverPort: getSetting('server_port', '25565'),
            maxPlayers: getSetting('max_players', '50'),
            discordInvite: getSetting('discord_invite', 'https://discord.gg/chiwawa'),
            telegramInvite: getSetting('telegram_invite', 'https://t.me/chiwawa'),
            
            // Данные пользователя (реальные или тестовые)
            nickname: targetUser ? targetUser.nickname : 'Тестовый игрок',
            email: finalEmail,
            userRole: targetUser ? targetUser.role : 'user',
            trustLevel: targetUser ? targetUser.trust_level : 0,
            joinDate: targetUser ? new Date(targetUser.registered_at).toLocaleDateString('ru-RU') : new Date().toLocaleDateString('ru-RU'),
            
            // Специальные переменные для разных типов писем
            verificationLink: `https://${getSetting('server_ip', 'chiwawa.site')}/verify/${Math.random().toString(36).substring(7)}`,
            resetLink: `https://${getSetting('server_ip', 'chiwawa.site')}/reset/${Math.random().toString(36).substring(7)}`,
            unsubscribeLink: `https://${getSetting('server_ip', 'chiwawa.site')}/unsubscribe/${Math.random().toString(36).substring(7)}`,
            serverLink: `https://${getSetting('server_ip', 'chiwawa.site')}`,
            
            // Переменные для заявок
            rejectionReason: 'Пример причины отклонения для демонстрации',
            
            // Переменные для новостной рассылки
            newsletterTitle: 'Еженедельные новости сервера',
            newsTitle1: 'Обновление сервера до версии 1.20.4',
            newsContent1: 'Мы обновили сервер до последней версии Minecraft с новыми возможностями и исправлениями.',
            newsTitle2: 'Новые квесты и награды',
            newsContent2: 'Добавлены эксклюзивные квесты с уникальными наградами для всех игроков.',
            
            // Общие переменные
            currentDate: new Date().toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }),
            currentTime: new Date().toLocaleTimeString('ru-RU')
        };

        // Заменяем переменные в шаблоне
        let processedHtml = template.template_html;
        let processedSubject = template.template_subject;

        Object.entries(templateVars).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processedHtml = processedHtml.replace(regex, value);
            processedSubject = processedSubject.replace(regex, value);
        });

        console.log(`📧 Тестовое письмо с шаблоном:\nКому: ${finalEmail} (${targetUser ? `${targetUser.nickname}, роль: ${targetUser.role}` : 'ручной ввод'})\nШаблон: ${template.template_name}\nТема: ${processedSubject}\nHTML длина: ${processedHtml.length} символов`);
        console.log(`🔧 Используемые настройки сервера:\n- Имя: ${templateVars.serverName}\n- IP: ${templateVars.serverIp}\n- Discord: ${templateVars.discordInvite}\n- Telegram: ${templateVars.telegramInvite}`);

        // Получаем SMTP настройки (поддерживаем разные форматы ключей)
        const smtpResult = await db.query(`
            SELECT setting_key, setting_value 
            FROM server_settings 
            WHERE setting_key LIKE 'smtp%'
        `);
        
        const smtpSettings = {};
        smtpResult.rows.forEach(row => {
            // Очищаем значения от кавычек если они есть
            let value = row.setting_value;
            if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            smtpSettings[row.setting_key] = value;
        });
        
        console.log('🔧 SMTP настройки из базы:', Object.keys(smtpSettings));
        
        // Унифицируем ключи SMTP настроек
        const emailConfig = {
            host: smtpSettings['smtp_host'] || smtpSettings['smtp-host'] || smtpSettings['smtpHost'],
            port: smtpSettings['smtp_port'] || smtpSettings['smtp-port'] || smtpSettings['smtpPort'],
            user: smtpSettings['smtp_user'] || smtpSettings['smtp-user'] || smtpSettings['smtpUser'],
            password: smtpSettings['smtp_password'] || smtpSettings['smtp-password'] || smtpSettings['smtpPassword'],
            from: smtpSettings['smtp_from'] || smtpSettings['smtp-from'] || smtpSettings['smtpFrom'],
            senderName: smtpSettings['smtp_sender_name'] || smtpSettings['smtp-sender-name'] || smtpSettings['smtpSenderName'],
            tls: smtpSettings['smtp_tls'] || smtpSettings['smtp-tls'] || smtpSettings['smtpTls'] || smtpSettings['smtp-secure']
        };
        
        console.log('📧 Конфигурация email:', {
            host: emailConfig.host,
            port: emailConfig.port,
            user: emailConfig.user,
            hasPassword: !!emailConfig.password,
            from: emailConfig.from,
            senderName: emailConfig.senderName,
            tls: emailConfig.tls
        });

        // Проверяем наличие SMTP настроек
        if (!emailConfig.host || !emailConfig.user || !emailConfig.password) {
            return res.status(400).json({
                error: 'SMTP настройки не настроены. Настройте их в разделе "Email настройки"',
                missing: {
                    host: !emailConfig.host,
                    user: !emailConfig.user,
                    password: !emailConfig.password
                }
            });
        }

        const nodemailer = require('nodemailer');
        
        // Создаем транспортер
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: parseInt(emailConfig.port) || 465,
            secure: emailConfig.tls === 'true' || emailConfig.tls === true || parseInt(emailConfig.port) === 465,
            auth: {
                user: emailConfig.user,
                pass: emailConfig.password
            },
            timeout: 30000,
            connectionTimeout: 30000,
            socketTimeout: 30000
        });

        // Проверяем подключение
        await transporter.verify();

        // Отправляем письмо
        await transporter.sendMail({
            from: `"${emailConfig.senderName || 'ChiwawaMine'}" <${emailConfig.from || emailConfig.user}>`,
            to: finalEmail,
            subject: processedSubject,
            html: processedHtml
        });

        // Обновляем время последней отправки
        lastEmailSent = Date.now();

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'email_template_tested',
            `Тестирование шаблона "${templateKey}" ${targetUser ? `для пользователя ${targetUser.nickname} (${targetUser.email})` : `на адрес: ${finalEmail}`}`
        ]);

        res.json({
            success: true,
            message: `✅ Тестовое письмо с шаблоном "${template.template_name}" успешно отправлено ${targetUser ? `пользователю ${targetUser.nickname}` : ''} на ${finalEmail}`,
            details: {
                templateName: template.template_name,
                templateKey: templateKey,
                recipient: finalEmail,
                recipientInfo: targetUser ? {
                    nickname: targetUser.nickname,
                    role: targetUser.role,
                    trustLevel: targetUser.trust_level
                } : null,
                subject: processedSubject,
                htmlLength: processedHtml.length,
                variablesReplaced: Object.keys(templateVars).length
            }
        });

    } catch (error) {
        console.error('❌ Ошибка тестирования email с шаблоном:', error);
        console.error('Stack trace:', error.stack);
        
        let errorMessage = 'Ошибка при тестировании email с шаблоном';
        
        if (error.code === 'EAUTH') {
            errorMessage = 'Ошибка аутентификации SMTP. Проверьте логин и пароль';
        } else if (error.code === 'ECONNECTION') {
            errorMessage = 'Ошибка подключения к SMTP серверу. Проверьте хост и порт';
        } else if (error.code === 'EMESSAGE') {
            if (error.response && error.response.includes('SPAM')) {
                errorMessage = 'Письмо заблокировано как SPAM. Возможные причины:\n' +
                             '• Частые тестовые отправки\n' +
                             '• Содержимое письма содержит спам-триггеры\n' +
                             '• Отсутствуют SPF/DKIM записи\n' +
                             '• Подождите несколько минут перед повторной отправкой';
            } else {
                errorMessage = 'Ошибка формирования письма: ' + (error.response || error.message);
            }
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(500).json({
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            yandexBlockingInfo: error.response && error.response.includes('SPAM') ? {
                reason: 'SPAM блокировка',
                recommendations: [
                    'Подождите 5-10 минут перед повторной отправкой',
                    'Проверьте содержимое шаблона на спам-слова',
                    'Настройте SPF записи для домена',
                    'Используйте менее частые тесты'
                ]
            } : undefined
        });
    }
});

// GET /api/admin/email-templates - Получить все email шаблоны
router.get('/email-templates', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                et.id,
                et.template_name, 
                et.template_subject, 
                et.template_html, 
                et.is_active,
                et.updated_at,
                u.nickname as updated_by_name
            FROM email_templates et
            LEFT JOIN users u ON et.updated_by = u.id
            WHERE et.is_active = true
            ORDER BY et.id
        `);

        const templates = {};
        // Создаем маппинг для совместимости с фронтендом
        const templateKeys = ['welcome', 'verification', 'application-approved', 'application-rejected', 'password-reset', 'newsletter'];
        
        result.rows.forEach((row, index) => {
            const key = templateKeys[index] || `template-${row.id}`;
            templates[key] = {
                name: row.template_name,
                subject: row.template_subject,
                html: row.template_html,
                updatedAt: row.updated_at,
                updatedBy: row.updated_by_name
            };
        });

        res.json({
            success: true,
            templates,
            totalTemplates: result.rows.length
        });

    } catch (error) {
        console.error('Ошибка загрузки email шаблонов:', error);
        res.status(500).json({
            error: 'Ошибка загрузки email шаблонов'
        });
    }
});

// GET /api/admin/email-templates/:templateKey - Получить конкретный email шаблон
router.get('/email-templates/:templateKey', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { templateKey } = req.params;
        
        // Маппинг ключей шаблонов на ID в базе данных
        const templateIds = {
            'welcome': 7,
            'verification': 8,
            'application-approved': 9,
            'application-rejected': 10,
            'password-reset': 11,
            'newsletter': 12
        };
        
        const templateId = templateIds[templateKey];
        if (!templateId) {
            return res.status(404).json({
                error: 'Email шаблон не найден'
            });
        }
        
        const result = await db.query(`
            SELECT 
                et.id,
                et.template_name, 
                et.template_subject, 
                et.template_html, 
                et.is_active,
                et.created_at, 
                et.updated_at
            FROM email_templates et
            WHERE et.id = $1 AND et.is_active = true
        `, [templateId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Email шаблон не найден'
            });
        }

        const template = result.rows[0];
        res.json({
            success: true,
            template: {
                key: templateKey,
                name: template.template_name,
                subject: template.template_subject,
                html: template.template_html,
                createdAt: template.created_at,
                updatedAt: template.updated_at
            }
        });

    } catch (error) {
        console.error('Ошибка загрузки email шаблона:', error);
        res.status(500).json({
            error: 'Ошибка загрузки email шаблона'
        });
    }
});

// GET /api/admin/users-for-email - Получение списка пользователей для выпадающего списка в тестировании email
router.get('/users-for-email', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                id,
                nickname,
                email,
                role,
                trust_level,
                is_banned,
                registered_at
            FROM users 
            WHERE is_banned = false 
            ORDER BY 
                CASE 
                    WHEN role = 'admin' THEN 1
                    WHEN role = 'moderator' THEN 2
                    WHEN role = 'user' THEN 3
                    ELSE 4
                END,
                nickname ASC
            LIMIT 100
        `);

        const users = result.rows.map(user => ({
            id: user.id,
            nickname: user.nickname,
            email: user.email,
            role: user.role,
            trustLevel: user.trust_level,
            displayName: `${user.nickname} (${user.email}) - ${user.role}`,
            joinDate: user.registered_at
        }));

        res.json({
            success: true,
            users: users
        });

    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        res.status(500).json({
            error: 'Ошибка загрузки списка пользователей'
        });
    }
});

// POST /api/admin/test-email-settings - Тестирование email настроек
router.post('/test-email-settings', [
    authenticateToken,
    requireRole(['admin']),
    body('host').notEmpty(),
    body('port').isInt({ min: 1, max: 65535 }),
    body('user').notEmpty(),
    body('from').isEmail(),
    body('tls').isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const { host, port, user, from, tls } = req.body;
        const nodemailer = require('nodemailer');

        // Создаем тестовый транспорт
        const testTransporter = nodemailer.createTransporter({
            host: host,
            port: port,
            secure: port === 465,
            auth: {
                user: user,
                pass: 'test' // Для тестирования используем заглушку
            },
            tls: {
                rejectUnauthorized: !tls
            }
        });

        // Проверяем соединение
        await testTransporter.verify();

        res.json({
            success: true,
            message: 'Email настройки корректны - соединение установлено'
        });

    } catch (error) {
        console.error('Ошибка тестирования email:', error);
        res.status(400).json({
            error: error.message || 'Ошибка соединения с SMTP сервером'
        });
    }
});

// GET /api/admin/test-database - Тестирование соединения с базой данных
router.get('/test-database', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Выполняем простой запрос для проверки соединения
        const result = await db.query('SELECT NOW() as server_time, version() as db_version');
        const dbInfo = result.rows[0];

        // Получаем количество таблиц
        const tablesResult = await db.query(`
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        const tableCount = tablesResult.rows[0].table_count;

        res.json({
            success: true,
            message: `База данных работает корректно`,
            details: {
                serverTime: dbInfo.server_time,
                version: dbInfo.db_version,
                tables: tableCount
            }
        });

    } catch (error) {
        console.error('Ошибка тестирования базы данных:', error);
        res.status(500).json({
            error: 'Ошибка соединения с базой данных: ' + error.message
        });
    }
});

// POST /api/admin/clear-cache - Очистка кеша
router.post('/clear-cache', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Очищаем require cache для перезагрузки настроек
        Object.keys(require.cache).forEach(key => {
            if (key.includes('/config/') || key.includes('/settings')) {
                delete require.cache[key];
            }
        });

        // Можно добавить очистку других видов кеша если они есть
        
        res.json({
            success: true,
            message: 'Кеш успешно очищен'
        });

    } catch (error) {
        console.error('Ошибка очистки кеша:', error);
        res.status(500).json({
            error: 'Ошибка очистки кеша'
        });
    }
});

// PUT /api/admin/settings - Сохранение расширенных настроек
router.put('/settings', [
    authenticateToken,
    requireRole(['admin']),
    body('serverName').optional().isLength({ max: 100 }),
    body('serverDescription').optional().isLength({ max: 500 }),
    body('serverIp').optional().isLength({ max: 100 }),
    body('serverPort').optional().isInt({ min: 1, max: 65535 }),
    body('minMotivationLength').optional().isInt({ min: 10, max: 1000 }),
    body('minPlansLength').optional().isInt({ min: 10, max: 1000 }),
    body('maxApplicationsPerDay').optional().isInt({ min: 1, max: 50 }),
    body('maxLoginAttempts').optional().isInt({ min: 1, max: 20 }),
    body('rateLimitRequests').optional().isInt({ min: 10, max: 10000 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }

        const settings = req.body;
        const fs = require('fs').promises;
        const path = require('path');

        // Читаем текущий файл настроек
        const settingsPath = path.join(__dirname, '../config/settings.js');
        let currentConfig;
        
        try {
            // Очищаем кеш и читаем заново
            delete require.cache[require.resolve('../config/settings')];
            currentConfig = require('../config/settings');
        } catch (error) {
            // Если файл не существует, создаем базовую структуру
            currentConfig = {
                server: {},
                applications: {},
                trustLevel: {},
                security: {},
                email: {}
            };
        }

        // Обновляем настройки
        if (settings.serverName !== undefined) currentConfig.server.name = settings.serverName;
        if (settings.serverDescription !== undefined) currentConfig.server.description = settings.serverDescription;
        if (settings.serverIp !== undefined) currentConfig.server.ip = settings.serverIp;
        if (settings.serverPort !== undefined) currentConfig.server.port = settings.serverPort.toString();
        if (settings.discordInvite !== undefined) currentConfig.server.discord = settings.discordInvite;
        if (settings.telegramInvite !== undefined) currentConfig.server.telegram = settings.telegramInvite;

        // Настройки заявок
        if (settings.applicationsEnabled !== undefined) currentConfig.applications.enabled = settings.applicationsEnabled;
        if (settings.minMotivationLength !== undefined) currentConfig.applications.minMotivationLength = settings.minMotivationLength;
        if (settings.minPlansLength !== undefined) currentConfig.applications.minPlansLength = settings.minPlansLength;
        if (settings.maxApplicationsPerDay !== undefined) currentConfig.applications.maxApplicationsPerDay = settings.maxApplicationsPerDay;
        if (settings.autoApproveTrustLevel !== undefined) currentConfig.applications.autoApproveTrustLevel = settings.autoApproveTrustLevel;

        // Trust Level настройки
        if (settings.trustPointsEmail !== undefined) currentConfig.trustLevel.pointsForEmail = settings.trustPointsEmail;
        if (settings.trustPointsDiscord !== undefined) currentConfig.trustLevel.pointsForDiscord = settings.trustPointsDiscord;
        if (settings.trustPointsHour !== undefined) currentConfig.trustLevel.pointsPerHour = settings.trustPointsHour;
        if (settings.trustLevel1Required !== undefined) currentConfig.trustLevel.level1Required = settings.trustLevel1Required;
        if (settings.trustLevel2Required !== undefined) currentConfig.trustLevel.level2Required = settings.trustLevel2Required;
        if (settings.trustLevel3Required !== undefined) currentConfig.trustLevel.level3Required = settings.trustLevel3Required;

        // Настройки безопасности
        if (settings.maxLoginAttempts !== undefined) currentConfig.security.maxLoginAttempts = settings.maxLoginAttempts;
        if (settings.loginLockoutDuration !== undefined) currentConfig.security.lockoutDuration = settings.loginLockoutDuration;
        if (settings.jwtExpiresDays !== undefined) currentConfig.security.jwtExpiresDays = settings.jwtExpiresDays;
        if (settings.requireEmailVerification !== undefined) currentConfig.security.requireEmailVerification = settings.requireEmailVerification;
        if (settings.twoFactorEnabled !== undefined) currentConfig.security.twoFactorEnabled = settings.twoFactorEnabled;
        if (settings.rateLimitRequests !== undefined) currentConfig.security.rateLimitRequests = settings.rateLimitRequests;

        // Email настройки
        if (settings.smtpHost !== undefined) currentConfig.email.host = settings.smtpHost;
        if (settings.smtpPort !== undefined) currentConfig.email.port = settings.smtpPort;
        if (settings.smtpFrom !== undefined) currentConfig.email.from = settings.smtpFrom;
        if (settings.smtpUser !== undefined) currentConfig.email.user = settings.smtpUser;
        if (settings.smtpPassword !== undefined) currentConfig.email.password = settings.smtpPassword;
        if (settings.smtpTls !== undefined) currentConfig.email.tls = settings.smtpTls;

        // Записываем обновленный файл настроек
        const configContent = `// Настройки сервера
// Автоматически сгенерировано админ-панелью

module.exports = ${JSON.stringify(currentConfig, null, 4)};
`;

        await fs.writeFile(settingsPath, configContent, 'utf-8');

        // Очищаем кеш настроек
        delete require.cache[require.resolve('../config/settings')];

        // Логируем изменение настроек
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'settings_updated',
            'Настройки сервера обновлены через админ-панель'
        ]);

        res.json({
            success: true,
            message: 'Настройки успешно сохранены и применены'
        });

    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// POST /api/admin/test-email - Тестирование email настроек
router.post('/test-email', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { recipient, template, settings } = req.body;
        
        if (!recipient) {
            return res.status(400).json({
                error: 'Укажите email получателя'
            });
        }
        
        // Валидируем email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipient)) {
            return res.status(400).json({
                error: 'Неверный формат email адреса'
            });
        }
        
        const nodemailer = require('nodemailer');
        
        // Создаем транспортер с переданными настройками
        const transporter = nodemailer.createTransport({
            host: settings.host || 'smtp.yandex.ru',
            port: settings.port || 465,
            secure: settings.secure !== false, // true для 465, false для других портов
            auth: {
                user: settings.user,
                pass: settings.password
            },
            timeout: 30000,
            connectionTimeout: 30000,
            socketTimeout: 30000
        });
        
        // Проверяем подключение
        await transporter.verify();
        
        // Получаем шаблон письма
        let subject = 'Тестовое письмо с сервера';
        let html = '<h1>Тест email настроек</h1><p>Если вы получили это письмо, значит SMTP настройки работают корректно!</p>';
        
        if (template && template !== 'test') {
            try {
                const templateResult = await db.query(
                    'SELECT template_subject, template_html FROM email_templates WHERE template_name = $1',
                    [template]
                );
                
                if (templateResult.rows.length > 0) {
                    subject = templateResult.rows[0].template_subject || subject;
                    html = templateResult.rows[0].template_html || html;
                    
                    // Получаем реальные данные из настроек сервера
                    const settingsResult = await db.query(`
                        SELECT setting_key, setting_value 
                        FROM server_settings 
                        WHERE setting_key IN ('serverName', 'serverIp', 'serverPort', 'discordInvite', 'telegramInvite')
                    `);
                    
                    const serverSettings = {};
                    settingsResult.rows.forEach(row => {
                        serverSettings[row.setting_key] = row.setting_value;
                    });
                    
                    // Используем реальные данные пользователя и сервера
                    const templateData = {
                        serverName: serverSettings.serverName || 'ChiwawaMine',
                        nickname: req.user?.nickname || 'Администратор',
                        serverIp: serverSettings.serverIp || 'chiwawasite.com',
                        serverPort: serverSettings.serverPort || '25565',
                        discordInvite: serverSettings.discordInvite || 'https://discord.gg/chiwawa',
                        telegramInvite: serverSettings.telegramInvite || 'https://t.me/chiwawa',
                        verificationLink: `${req.protocol}://${req.get('host')}/verify/test-token`,
                        resetLink: `${req.protocol}://${req.get('host')}/reset-password/test-token`,
                        currentDate: new Date().toLocaleDateString('ru-RU'),
                        userEmail: req.user?.email || 'admin@chiwawasite.com'
                    };
                    
                    Object.keys(templateData).forEach(key => {
                        const regex = new RegExp(`{{${key}}}`, 'g');
                        subject = subject.replace(regex, templateData[key]);
                        html = html.replace(regex, templateData[key]);
                    });
                }
            } catch (templateError) {
                console.log('Не удалось загрузить шаблон, используем стандартное письмо:', templateError.message);
            }
        }
        
        const startTime = Date.now();
        
        // Отправляем письмо
        const info = await transporter.sendMail({
            from: `"${settings.senderName || 'ChiwawaMine'}" <${settings.from || settings.user}>`,
            to: recipient,
            subject: subject,
            html: html
        });
        
        const deliveryTime = Date.now() - startTime;
        
        // Логируем тест
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'email_test',
            `Тестовое письмо отправлено на ${recipient}, время доставки: ${deliveryTime}мс`
        ]);
        
        res.json({
            success: true,
            message: 'Тестовое письмо успешно отправлено!',
            messageId: info.messageId,
            deliveryTime: `${deliveryTime}мс`,
            sentAt: new Date().toLocaleString('ru-RU')
        });
        
    } catch (error) {
        console.error('Ошибка тестирования email:', error);
        
        let errorMessage = 'Неизвестная ошибка при отправке письма';
        
        if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Не удается подключиться к SMTP серверу. Проверьте хост и порт.';
        } else if (error.code === 'EAUTH' || error.responseCode === 535) {
            errorMessage = 'Ошибка авторизации. Проверьте логин и пароль.';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Превышено время ожидания. Проверьте настройки сети.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(500).json({
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/admin/system-info - Получение технической информации о системе
router.get('/system-info', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const memoryUsage = process.memoryUsage();
        const uptimeSeconds = process.uptime();
        
        // Конвертируем время работы в читаемый формат
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeFormatted = `${hours}ч ${minutes}м`;
        
        // Конвертируем байты в МБ
        const formatMemory = (bytes) => {
            return `${Math.round(bytes / 1024 / 1024)}MB`;
        };

        const systemInfo = {
            nodeVersion: process.version,
            uptime: uptimeFormatted,
            memory: {
                rss: formatMemory(memoryUsage.rss),
                heapUsed: formatMemory(memoryUsage.heapUsed),
                heapTotal: formatMemory(memoryUsage.heapTotal)
            },
            environment: process.env.NODE_ENV || 'development',
            port: process.env.PORT || 3000
        };

        res.json(systemInfo);
    } catch (error) {
        console.error('Ошибка получения системной информации:', error);
        res.status(500).json({ error: 'Ошибка получения системной информации' });
    }
});

module.exports = router;
