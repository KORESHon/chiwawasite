// Маршруты для системы репутации и траст левелов
// Создатель: ebluffy

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../database/connection');
const { authenticateToken, requireRole } = require('./auth');

const router = express.Router();

// GET /api/reputation/:userId - Получить репутацию пользователя
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Получаем данные репутации
        const reputationResult = await db.query(`
            SELECT ur.*, u.nickname, u.trust_level
            FROM user_reputation ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.user_id = $1
        `, [userId]);
        
        if (reputationResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const reputation = reputationResult.rows[0];
        
        // Получаем историю изменений репутации
        const historyResult = await db.query(`
            SELECT rl.*, u.nickname as admin_nickname
            FROM reputation_log rl
            LEFT JOIN users u ON rl.admin_id = u.id
            WHERE rl.user_id = $1
            ORDER BY rl.created_at DESC
            LIMIT 20
        `, [userId]);
        
        reputation.history = historyResult.rows;
        
        res.json(reputation);
        
    } catch (error) {
        console.error('Ошибка получения репутации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/reputation/:userId/vote - Проголосовать за пользователя
router.post('/:userId/vote', [
    authenticateToken,
    body('type').isIn(['positive', 'negative']),
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
        
        const { userId } = req.params;
        const { type, reason } = req.body;
        const voterId = req.user.id;
        
        // Нельзя голосовать за себя
        if (userId == voterId) {
            return res.status(400).json({ error: 'Нельзя голосовать за себя' });
        }
        
        // Проверяем, не голосовал ли уже этот пользователь
        const existingVote = await db.query(`
            SELECT id FROM reputation_log 
            WHERE user_id = $1 AND admin_id = $2 AND reason LIKE 'vote_%'
            AND created_at > NOW() - INTERVAL '24 hours'
        `, [userId, voterId]);
        
        if (existingVote.rows.length > 0) {
            return res.status(400).json({ error: 'Можно голосовать только раз в сутки' });
        }
        
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');
            
            // Обновляем счетчики голосов
            const column = type === 'positive' ? 'positive_votes' : 'negative_votes';
            await client.query(`
                INSERT INTO user_reputation (user_id, ${column})
                VALUES ($1, 1)
                ON CONFLICT (user_id) 
                DO UPDATE SET ${column} = user_reputation.${column} + 1
            `, [userId]);
            
            // Логируем голос
            const changeAmount = type === 'positive' ? 2 : -1;
            await client.query(`
                INSERT INTO reputation_log (user_id, change_amount, reason, details, admin_id)
                VALUES ($1, $2, $3, $4, $5)
            `, [userId, changeAmount, `vote_${type}`, reason || null, voterId]);
            
            // Пересчитываем репутацию
            const newReputationResult = await client.query(`
                SELECT calculate_user_reputation($1) as new_reputation
            `, [userId]);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `Голос ${type === 'positive' ? 'за' : 'против'} учтен`,
                new_reputation: newReputationResult.rows[0].new_reputation
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Ошибка голосования:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// PUT /api/reputation/:userId/admin - Изменить репутацию (только для админов)
router.put('/:userId/admin', [
    authenticateToken,
    requireRole(['admin', 'moderator']),
    body('change').isInt({ min: -100, max: 100 }),
    body('reason').isLength({ min: 5, max: 200 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }
        
        const { userId } = req.params;
        const { change, reason } = req.body;
        const adminId = req.user.id;
        
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');
            
            // Добавляем изменение к штрафам/бонусам
            if (change > 0) {
                await client.query(`
                    INSERT INTO user_reputation (user_id, community_contributions)
                    VALUES ($1, 1)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET community_contributions = user_reputation.community_contributions + 1
                `, [userId]);
            } else {
                await client.query(`
                    INSERT INTO user_reputation (user_id, reputation_penalties)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET reputation_penalties = user_reputation.reputation_penalties + $2
                `, [userId, Math.abs(change)]);
            }
            
            // Логируем изменение
            await client.query(`
                INSERT INTO reputation_log (user_id, change_amount, reason, admin_id)
                VALUES ($1, $2, $3, $4)
            `, [userId, change, reason, adminId]);
            
            // Пересчитываем репутацию
            const newReputationResult = await client.query(`
                SELECT calculate_user_reputation($1) as new_reputation
            `, [userId]);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `Репутация изменена на ${change}`,
                new_reputation: newReputationResult.rows[0].new_reputation
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Ошибка изменения репутации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/trust-level/check/:userId/:targetLevel - Проверить возможность повышения траст левела
router.get('/check/:userId/:targetLevel', authenticateToken, async (req, res) => {
    try {
        const { userId, targetLevel } = req.params;
        
        // Проверяем права доступа
        if (req.user.id != userId && req.user.role !== 'admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Нет прав для просмотра' });
        }
        
        const result = await db.query(`
            SELECT can_apply_for_trust_level($1, $2) as check_result
        `, [userId, parseInt(targetLevel)]);
        
        res.json(result.rows[0].check_result);
        
    } catch (error) {
        console.error('Ошибка проверки траст левела:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// POST /api/trust-level/apply - Подать заявку на повышение траст левела
router.post('/apply', [
    authenticateToken,
    body('target_level').isInt({ min: 2, max: 3 }),
    body('reason').isLength({ min: 50, max: 1000 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Ошибка валидации',
                details: errors.array()
            });
        }
        
        const { target_level, reason } = req.body;
        const userId = req.user.id;
        
        // Проверяем возможность подачи заявки
        const checkResult = await db.query(`
            SELECT can_apply_for_trust_level($1, $2) as check_result
        `, [userId, target_level]);
        
        const canApply = checkResult.rows[0].check_result;
        if (!canApply.can_apply) {
            return res.status(400).json({
                error: 'Не выполнены требования для этого уровня',
                requirements: canApply.requirements,
                current_status: canApply.current_status
            });
        }
        
        // Проверяем, нет ли уже активной заявки
        const existingApplication = await db.query(`
            SELECT id FROM trust_level_applications 
            WHERE user_id = $1 AND status = 'pending'
        `, [userId]);
        
        if (existingApplication.rows.length > 0) {
            return res.status(400).json({ error: 'У вас уже есть активная заявка' });
        }
        
        // Создаем заявку
        const applicationResult = await db.query(`
            INSERT INTO trust_level_applications 
            (user_id, current_level, requested_level, reason, hours_played, reputation_score, email_verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            userId,
            canApply.current_status.current_level,
            target_level,
            reason,
            canApply.current_status.hours_played,
            canApply.current_status.reputation,
            canApply.current_status.email_verified
        ]);
        
        res.json({
            success: true,
            message: 'Заявка на повышение траст левела подана',
            application_id: applicationResult.rows[0].id
        });
        
    } catch (error) {
        console.error('Ошибка подачи заявки:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// GET /api/trust-level/applications - Получить заявки на повышение (для админов)
router.get('/applications', authenticateToken, requireRole(['admin', 'moderator']), async (req, res) => {
    try {
        const status = req.query.status || 'all';
        const limit = parseInt(req.query.limit) || 20;
        
        let whereClause = '';
        let queryParams = [limit];
        
        if (status !== 'all') {
            whereClause = 'WHERE tla.status = $2';
            queryParams.push(status);
        }
        
        const result = await db.query(`
            SELECT 
                tla.*,
                u.nickname,
                u.email,
                ur.reputation_score as current_reputation,
                ps.total_minutes,
                reviewer.nickname as reviewer_nickname
            FROM trust_level_applications tla
            JOIN users u ON tla.user_id = u.id
            LEFT JOIN user_reputation ur ON u.id = ur.user_id
            LEFT JOIN player_stats ps ON u.id = ps.user_id
            LEFT JOIN users reviewer ON tla.reviewed_by = reviewer.id
            ${whereClause}
            ORDER BY tla.created_at DESC
            LIMIT $1
        `, queryParams);
        
        res.json({
            applications: result.rows,
            pagination: {
                limit,
                total: result.rows.length
            }
        });
        
    } catch (error) {
        console.error('Ошибка получения заявок:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// PUT /api/trust-level/applications/:id/review - Рассмотреть заявку на повышение
router.put('/applications/:id/review', [
    authenticateToken,
    requireRole(['admin', 'moderator']),
    body('status').isIn(['approved', 'rejected']),
    body('comment').optional().isLength({ max: 500 })
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
        const reviewerId = req.user.id;
        
        const client = await db.getClient();
        
        try {
            await client.query('BEGIN');
            
            // Получаем данные заявки
            const applicationResult = await client.query(`
                SELECT * FROM trust_level_applications WHERE id = $1 AND status = 'pending'
            `, [id]);
            
            if (applicationResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Заявка не найдена или уже рассмотрена' });
            }
            
            const application = applicationResult.rows[0];
            
            // Обновляем заявку
            await client.query(`
                UPDATE trust_level_applications 
                SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_comment = $3
                WHERE id = $4
            `, [status, reviewerId, comment, id]);
            
            // Если заявка одобрена, повышаем траст левел
            if (status === 'approved') {
                await client.query(`
                    UPDATE users SET trust_level = $1 WHERE id = $2
                `, [application.requested_level, application.user_id]);
                
                // Логируем изменение
                await client.query(`
                    INSERT INTO admin_logs (admin_id, action, details, target_user_id)
                    VALUES ($1, $2, $3, $4)
                `, [
                    reviewerId,
                    'trust_level_upgraded',
                    `Траст левел повышен до ${application.requested_level}`,
                    application.user_id
                ]);
            }
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: `Заявка ${status === 'approved' ? 'одобрена' : 'отклонена'}`
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Ошибка рассмотрения заявки:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;
