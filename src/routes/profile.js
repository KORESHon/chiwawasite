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

// GET /api/profile/detailed-stats - Получение упрощенной статистики игрока
router.get('/detailed-stats', authenticateToken, async (req, res) => {
    try {
        // Получаем базовую статистику
        const statsResult = await db.query(`
            SELECT 
                ps.time_played_minutes,
                ps.last_seen,
                ps.deaths_count,
                ps.mobs_killed,
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

        // Вычисляем статистику
        const totalPlaytime = stats.time_played_minutes || 0;
        const playtimeHours = Math.floor(totalPlaytime / 60);
        const playtimeMinutes = totalPlaytime % 60;

        res.json({
            success: true,
            stats: {
                // Основная статистика - только то что нужно
                total_playtime_minutes: totalPlaytime,
                total_playtime_hours: playtimeHours,
                total_playtime_formatted: `${playtimeHours}ч ${playtimeMinutes}м`,
                
                // Последний вход
                last_seen: stats.last_seen,
                
                // Игровая статистика - только убийства и смерти
                deaths_count: stats.deaths_count || 0,
                mobs_killed: stats.mobs_killed || 0
            }
        });

    } catch (error) {
        console.error('Ошибка получения статистики:', error);
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

        // Специальная обработка инкремента входов
        if (stats.increment_login) {
            // Увеличиваем счетчик входов на 1
            await db.query(`
                UPDATE player_stats 
                SET 
                    total_logins = COALESCE(total_logins, 0) + 1,
                    last_seen = COALESCE($2::timestamp, last_seen),
                    stats_last_updated = NOW(),
                    updated_at = NOW()
                WHERE user_id = $1
            `, [user.id, stats.last_seen]);
            
            // Если записи не существует, создаем её
            const checkExists = await db.query(`SELECT id FROM player_stats WHERE user_id = $1`, [user.id]);
            if (checkExists.rows.length === 0) {
                await db.query(`
                    INSERT INTO player_stats (
                        user_id, total_logins, last_seen, stats_last_updated, created_at, updated_at
                    ) VALUES ($1, 1, $2::timestamp, NOW(), NOW(), NOW())
                `, [user.id, stats.last_seen]);
            }
            
            res.json({
                success: true,
                message: `Счетчик входов увеличен для игрока ${minecraft_nick}`,
                user_id: user.id
            });
            return;
        }

        // Обычное обновление статистики игрока - только основные поля
        const updateResult = await db.query(`
            UPDATE player_stats 
            SET 
                time_played_minutes = COALESCE($2, time_played_minutes),
                last_seen = COALESCE($3::timestamp, last_seen),
                deaths_count = COALESCE($4, deaths_count),
                mobs_killed = COALESCE($5, mobs_killed),
                stats_last_updated = NOW(),
                updated_at = NOW()
            WHERE user_id = $1
            RETURNING *
        `, [
            user.id,
            stats.time_played_minutes,
            stats.last_seen,
            stats.deaths_count || stats.deaths,
            stats.mobs_killed || stats.mob_kills
        ]);

        // Если статистика не существует, создаем новую запись - только основные поля
        if (updateResult.rows.length === 0) {
            await db.query(`
                INSERT INTO player_stats (
                    user_id, time_played_minutes, last_seen, deaths_count, mobs_killed,
                    stats_last_updated, created_at, updated_at
                ) VALUES (
                    $1, $2, $3::timestamp, $4, $5, NOW(), NOW(), NOW()
                )
            `, [
                user.id,
                stats.time_played_minutes || 0,
                stats.last_seen,
                stats.deaths_count || stats.deaths || 0,
                stats.mobs_killed || stats.mob_kills || 0
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
        // Получаем основные данные пользователя - упрощенно
        const userResult = await db.query(`
            SELECT u.id, u.nickname, u.first_name, u.email, u.role, 
                   u.discord_username, u.trust_level, u.bio, u.avatar_url,
                   u.age, u.is_email_verified, u.is_banned, u.status,
                   u.ban_reason, u.ban_until, u.last_login, u.registered_at,
                   ps.time_played_minutes, ps.last_seen, ps.deaths_count, ps.mobs_killed, ps.total_logins,
                   ur.reputation_score
            FROM users u
            LEFT JOIN player_stats ps ON u.id = ps.user_id
            LEFT JOIN user_reputation ur ON u.id = ur.user_id
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

        // Достижения убраны - слишком сложно реализовать корректно
        // const achievementsResult = { rows: [] };

        // Получаем репутацию убрана - упрощаем
        // const reputationResult = { rows: [] };
        // const reputation = { reputation_score: 0, positive_votes: 0, negative_votes: 0 };

        // Формируем упрощенную статистику - только основное
        const stats = {
            playtime: user.time_played_minutes || 0,
            days_registered: Math.floor((new Date() - new Date(user.registered_at)) / (1000 * 60 * 60 * 24)),
            last_seen: user.last_seen,
            deaths_count: user.deaths_count || 0,
            mobs_killed: user.mobs_killed || 0,
            total_logins: user.total_logins || 0
        };

        // Формируем прогресс Trust Level
        const trustProgress = {
            current: user.trust_level || 0,
            required: getTrustLevelRequirements(user.trust_level || 0),
            type: 'минут игры',
            reputation: user.reputation_score || 0
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
            // achievements убраны - слишком сложно реализовать корректно
            application,
            player_stats: {
                time_played_minutes: user.time_played_minutes || 0,
                last_seen: user.last_seen,
                deaths_count: user.deaths_count || 0,
                mobs_killed: user.mobs_killed || 0,
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

// POST /api/profile/update-stats - Обновление статистики игрока (для плагина)
router.post('/update-stats', authenticateLongTermApiToken, async (req, res) => {
    try {
        const { minecraft_nick, stats, increment_login } = req.body;

        if (!minecraft_nick) {
            return res.status(400).json({ error: 'Требуется minecraft_nick' });
        }

        // Находим пользователя по никнейму
        const userResult = await db.query(
            'SELECT id FROM users WHERE LOWER(nickname) = LOWER($1) AND is_active = true',
            [minecraft_nick]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;

        // Если нужно увеличить счётчик входов
        if (increment_login) {
            await db.query(`
                INSERT INTO player_stats (user_id, total_logins, last_seen, created_at, updated_at)
                VALUES ($1, 1, NOW(), NOW(), NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET 
                    total_logins = COALESCE(player_stats.total_logins, 0) + 1,
                    last_seen = NOW(),
                    updated_at = NOW()
            `, [userId]);
            
            console.log(`✅ Увеличен счётчик входов для ${minecraft_nick} (ID: ${userId})`);
        }

        // Обновляем остальную статистику если передана
        if (stats && typeof stats === 'object') {
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            // Обрабатываем поля статистики
            if (stats.time_played_minutes !== undefined) {
                updateFields.push(`time_played_minutes = $${paramIndex++}`);
                updateValues.push(stats.time_played_minutes);
            }
            if (stats.last_seen !== undefined) {
                updateFields.push(`last_seen = $${paramIndex++}`);
                updateValues.push(stats.last_seen);
            }
            if (stats.deaths_count !== undefined) {
                updateFields.push(`deaths_count = $${paramIndex++}`);
                updateValues.push(stats.deaths_count);
            }
            if (stats.mobs_killed !== undefined) {
                updateFields.push(`mobs_killed = $${paramIndex++}`);
                updateValues.push(stats.mobs_killed);
            }

            // Если есть поля для обновления
            if (updateFields.length > 0) {
                updateFields.push(`updated_at = NOW()`);
                updateValues.push(userId);

                const updateQuery = `
                    INSERT INTO player_stats (user_id, ${updateFields.map(f => f.split(' = ')[0]).join(', ')}, created_at, updated_at)
                    VALUES ($${paramIndex}, ${updateFields.map((_, i) => `$${i + 1}`).join(', ')}, NOW(), NOW())
                    ON CONFLICT (user_id)
                    DO UPDATE SET ${updateFields.join(', ')}
                `;

                await db.query(updateQuery, updateValues);
                
                console.log(`✅ Обновлена статистика для ${minecraft_nick} (ID: ${userId}):`, Object.keys(stats));
            }
        }

        res.json({ 
            success: true, 
            message: 'Статистика обновлена',
            user_id: userId
        });

    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
        res.status(500).json({ error: 'Ошибка обновления статистики' });
    }
});
