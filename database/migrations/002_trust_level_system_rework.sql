-- Миграция: Полный пересмотр системы траст левелов
-- Создатель: ebluffy
-- Дата: 2025-07-26

-- Сначала создаем таблицу для заявок на повышение траст левела
CREATE TABLE IF NOT EXISTS trust_level_applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_level INTEGER NOT NULL,
    requested_level INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    
    -- Автоматически рассчитываемые требования на момент подачи заявки
    hours_played DECIMAL(10,2) NOT NULL DEFAULT 0,
    reputation_score INTEGER NOT NULL DEFAULT 0,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    
    -- Обработка заявки
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создаем таблицу для системы репутации
CREATE TABLE IF NOT EXISTS user_reputation (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Основные показатели репутации
    reputation_score INTEGER DEFAULT 0,
    positive_votes INTEGER DEFAULT 0,
    negative_votes INTEGER DEFAULT 0,
    
    -- Бонусы за активность
    forum_posts INTEGER DEFAULT 0,
    helpful_posts INTEGER DEFAULT 0,
    reported_bugs INTEGER DEFAULT 0,
    community_contributions INTEGER DEFAULT 0,
    
    -- Штрафы
    warnings_received INTEGER DEFAULT 0,
    temporary_bans INTEGER DEFAULT 0,
    reputation_penalties INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id)
);

-- Создаем таблицу для логирования изменений репутации
CREATE TABLE IF NOT EXISTS reputation_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    change_amount INTEGER NOT NULL,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    admin_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Добавляем функцию для автоматического расчета репутации
CREATE OR REPLACE FUNCTION calculate_user_reputation(user_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
    base_score INTEGER := 0;
    bonus_score INTEGER := 0;
    penalty_score INTEGER := 0;
    final_score INTEGER := 0;
    rep_record RECORD;
BEGIN
    -- Получаем данные репутации пользователя
    SELECT * INTO rep_record FROM user_reputation WHERE user_id = user_id_param;
    
    IF rep_record IS NULL THEN
        -- Создаем запись репутации если её нет
        INSERT INTO user_reputation (user_id) VALUES (user_id_param);
        RETURN 0;
    END IF;
    
    -- Базовая репутация от голосов
    base_score := (rep_record.positive_votes * 2) - rep_record.negative_votes;
    
    -- Бонусы за активность
    bonus_score := (rep_record.forum_posts / 10) + 
                   (rep_record.helpful_posts * 3) + 
                   (rep_record.reported_bugs * 5) + 
                   (rep_record.community_contributions * 10);
    
    -- Штрафы
    penalty_score := (rep_record.warnings_received * 5) + 
                     (rep_record.temporary_bans * 20) + 
                     rep_record.reputation_penalties;
    
    -- Итоговый счет (не может быть меньше 0)
    final_score := GREATEST(base_score + bonus_score - penalty_score, 0);
    
    -- Обновляем репутацию
    UPDATE user_reputation 
    SET reputation_score = final_score, updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = user_id_param;
    
    RETURN final_score;
END;
$$ LANGUAGE plpgsql;

-- Функция для проверки возможности повышения траст левела
CREATE OR REPLACE FUNCTION can_apply_for_trust_level(user_id_param INTEGER, target_level INTEGER)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    stats_record RECORD;
    reputation_score INTEGER;
    hours_played DECIMAL(10,2);
    result JSON;
    requirements JSON;
    met_requirements JSON;
BEGIN
    -- Получаем данные пользователя
    SELECT * INTO user_record FROM users WHERE id = user_id_param;
    SELECT * INTO stats_record FROM player_stats WHERE user_id = user_id_param;
    
    IF user_record IS NULL THEN
        RETURN '{"error": "Пользователь не найден"}'::JSON;
    END IF;
    
    -- Рассчитываем репутацию
    reputation_score := calculate_user_reputation(user_id_param);
    hours_played := COALESCE(stats_record.total_minutes, 0) / 60.0;
    
    -- Определяем требования для каждого уровня
    CASE target_level
        WHEN 1 THEN -- Новичок
            requirements := '{"email_verified": true, "hours_played": 0, "reputation": 0}'::JSON;
        WHEN 2 THEN -- Проверенный
            requirements := '{"email_verified": true, "hours_played": 25, "reputation": 10}'::JSON;
        WHEN 3 THEN -- Ветеран
            requirements := '{"email_verified": true, "hours_played": 50, "reputation": 20}'::JSON;
        ELSE
            RETURN '{"error": "Неверный уровень"}'::JSON;
    END CASE;
    
    -- Проверяем выполнение требований
    met_requirements := json_build_object(
        'email_verified', user_record.is_email_verified,
        'hours_played', hours_played >= (requirements->>'hours_played')::INTEGER,
        'reputation', reputation_score >= (requirements->>'reputation')::INTEGER,
        'level_lower', user_record.trust_level < target_level
    );
    
    result := json_build_object(
        'can_apply', 
        (met_requirements->>'email_verified')::BOOLEAN AND 
        (met_requirements->>'hours_played')::BOOLEAN AND 
        (met_requirements->>'reputation')::BOOLEAN AND 
        (met_requirements->>'level_lower')::BOOLEAN,
        'requirements', requirements,
        'current_status', json_build_object(
            'email_verified', user_record.is_email_verified,
            'hours_played', hours_played,
            'reputation', reputation_score,
            'current_level', user_record.trust_level
        ),
        'met_requirements', met_requirements
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_trust_level_applications_user_id ON trust_level_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_level_applications_status ON trust_level_applications(status);
CREATE INDEX IF NOT EXISTS idx_user_reputation_user_id ON user_reputation(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_log_user_id ON reputation_log(user_id);

-- Инициализируем репутацию для существующих пользователей
INSERT INTO user_reputation (user_id)
SELECT id FROM users 
WHERE id NOT IN (SELECT user_id FROM user_reputation);

-- Обновляем описания траст левелов в комментариях
COMMENT ON COLUMN users.trust_level IS 'Trust Level: 0=Проходимец(10ч лимит), 1=Новичок(стандарт), 2=Проверенный(25ч+почта+10реп), 3=Ветеран(50ч+почта+20реп)';

-- Сбрасываем все траст левелы до 0 (Проходимец) для переоценки
UPDATE users SET trust_level = 0 WHERE trust_level IS NULL OR trust_level < 0;

-- Автоматически повышаем до Новичка тех, у кого подтверждена почта
UPDATE users SET trust_level = 1 WHERE is_email_verified = true AND trust_level = 0;
