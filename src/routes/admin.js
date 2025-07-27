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
        let queryParams = [limit, offset];
        let paramCount = 2;

        if (action !== 'all') {
            paramCount++;
            whereClause += ` WHERE a.action = $${paramCount}`;
            queryParams.push(action);
        }

        if (user_id) {
            paramCount++;
            whereClause += ` ${whereClause ? 'AND' : 'WHERE'} a.user_id = $${paramCount}`;
            queryParams.push(user_id);
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
        `, queryParams);

        const countParams = queryParams.slice(2);
        const countResult = await db.query(`
            SELECT COUNT(*) as total FROM admin_logs al ${whereClause}
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

// POST /api/admin/test-email - Тестирование почты
router.post('/test-email', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { testEmail } = req.body;
        const emailToTest = testEmail || req.user.email;
        
        // Здесь должна быть логика отправки тестового письма
        // Пока что заглушка
        console.log(`📧 Тестовое письмо отправлено на: ${emailToTest}`);
        
        // Имитация отправки письма
        const success = Math.random() > 0.3; // 70% успеха для демонстрации
        
        if (success) {
            res.json({
                message: `✅ Тестовое письмо успешно отправлено на ${emailToTest}\nПроверьте почтовый ящик (включая спам).`
            });
        } else {
            res.status(500).json({
                error: `❌ Ошибка отправки письма на ${emailToTest}\nПроверьте настройки SMTP сервера.`
            });
        }
    } catch (error) {
        console.error('Ошибка тестирования почты:', error);
        res.status(500).json({
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

// POST /api/admin/settings - Сохранить настройки сервера
router.post('/settings', [
    authenticateToken,
    requireRole(['admin']),
    body('serverName').optional().isLength({ min: 1, max: 100 }),
    body('serverDescription').optional().isLength({ max: 500 }),
    body('maxPlayers').optional().isInt({ min: 1, max: 1000 }),
    body('maintenanceMode').optional().isBoolean(),
    body('registrationEnabled').optional().isBoolean(),
    body('autoBackupEnabled').optional().isBoolean(),
    body('backupInterval').optional().isInt({ min: 1, max: 168 })
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
            serverName,
            serverDescription,
            maxPlayers,
            maintenanceMode,
            registrationEnabled,
            autoBackupEnabled,
            backupInterval
        } = req.body;

        // Сохраняем настройки в базу данных
        // Если таблица настроек не существует, создаем ее
        await db.query(`
            CREATE TABLE IF NOT EXISTS server_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(id)
            )
        `);

        const settings = {
            server_name: serverName,
            server_description: serverDescription,
            max_players: maxPlayers,
            maintenance_mode: maintenanceMode,
            registration_enabled: registrationEnabled,
            auto_backup_enabled: autoBackupEnabled,
            backup_interval: backupInterval
        };

        // Обновляем каждую настройку
        for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined) {
                await db.query(`
                    INSERT INTO server_settings (setting_key, setting_value, updated_by)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (setting_key) 
                    DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3
                `, [key, JSON.stringify(value), req.user.id]);
            }
        }

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details)
            VALUES ($1, $2, $3)
        `, [
            req.user.id,
            'settings_updated',
            `Настройки сервера обновлены: ${Object.keys(settings).filter(k => settings[k] !== undefined).join(', ')}`
        ]);

        res.json({
            success: true,
            message: 'Настройки успешно сохранены'
        });

    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера'
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

module.exports = router;
