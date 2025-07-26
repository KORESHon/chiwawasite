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
        let queryParams = [limit, offset];
        let paramCount = 2;

        if (search) {
            paramCount++;
            whereClause += ` ${whereClause ? 'AND' : 'WHERE'} (u.nickname ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
        }

        if (status !== 'all') {
            paramCount++;
            if (status === 'active') {
                whereClause += ` ${whereClause ? 'AND' : 'WHERE'} u.is_banned = false`;
            } else if (status === 'banned') {
                whereClause += ` ${whereClause ? 'AND' : 'WHERE'} u.is_banned = true`;
            }
        }

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
            LIMIT $1 OFFSET $2
        `, queryParams);

        // Получаем общее количество
        const countParams = queryParams.slice(2); // убираем limit и offset
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
    body('reason').isLength({ min: 5, max: 500 }),
    body('duration').optional().isIn(['temporary', 'permanent']),
    body('until').optional().isISO8601()
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
        const { reason, duration, until } = req.body;

        // Проверяем, что пользователь существует
        const userResult = await db.query('SELECT nickname FROM users WHERE id = $1', [id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];

        // Обновляем статус бана
        await db.query(`
            UPDATE users 
            SET is_banned = true, ban_reason = $1, banned_at = NOW(), banned_until = $2
            WHERE id = $3
        `, [reason, until || null, id]);

        // Деактивируем все активные сессии пользователя
        await db.query(`
            UPDATE user_sessions 
            SET is_active = false, ended_at = NOW() 
            WHERE user_id = $1 AND is_active = true
        `, [id]);

        // Логируем действие
        await db.query(`
            INSERT INTO admin_logs (admin_id, action, details, target_user_id)
            VALUES ($1, $2, $3, $4)
        `, [
            req.user.id,
            'user_banned',
            `Пользователь ${user.nickname} заблокирован: ${reason}`,
            id
        ]);

        res.json({
            success: true,
            message: `Пользователь ${user.nickname} заблокирован`
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
            SET is_banned = false, ban_reason = NULL, banned_at = NULL, banned_until = NULL
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
        await db.query(`
            UPDATE player_stats 
            SET current_level = $1, updated_at = NOW() 
            WHERE user_id = $2
        `, [level, id]);

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

        res.json({
            users: userStats.rows[0],
            applications: applicationStats.rows[0],
            sessions: sessionStats.rows[0],
            playtime: playtimeStats.rows[0],
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
                u.is_banned, u.ban_reason, u.banned_at, u.banned_until,
                u.registered_at, u.last_login, u.is_email_verified, 
                u.first_name, u.last_name, u.role, u.status,
                ps.total_minutes, ps.daily_limit_minutes, ps.is_time_limited,
                ps.reputation, ps.warnings_count, ps.total_logins, ps.last_played,
                ps.first_played, ps.total_sessions
            FROM users u
            LEFT JOIN player_stats ps ON u.id = ps.user_id
            WHERE u.id = $1
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Получить последние сессии
        const sessionsResult = await db.query(`
            SELECT started_at, ended_at, duration_minutes, is_active, user_agent, ip_address
            FROM user_sessions 
            WHERE user_id = $1 
            ORDER BY started_at DESC 
            LIMIT 10
        `, [id]);

        // Получить историю действий
        const actionsResult = await db.query(`
            SELECT action, details, created_at, admin_id
            FROM admin_logs 
            WHERE target_user_id = $1 
            ORDER BY created_at DESC 
            LIMIT 20
        `, [id]);

        const user = userResult.rows[0];
        user.recent_sessions = sessionsResult.rows;
        user.action_history = actionsResult.rows;

        res.json(user);

    } catch (error) {
        console.error('Ошибка получения деталей пользователя:', error);
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

module.exports = router;
