-- Создание таблицы для хранения статистики игроков
CREATE TABLE IF NOT EXISTS player_statistics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    minecraft_uuid VARCHAR(36) NOT NULL,
    
    -- Основная статистика
    total_playtime INTEGER DEFAULT 0, -- в секундах
    total_logins INTEGER DEFAULT 0,
    first_join TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    
    -- Детальная игровая статистика
    blocks_broken INTEGER DEFAULT 0,
    blocks_placed INTEGER DEFAULT 0,
    distance_walked INTEGER DEFAULT 0, -- в блоках
    distance_sprinted INTEGER DEFAULT 0, -- в блоках
    jumps INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    
    -- PvP статистика
    player_kills INTEGER DEFAULT 0,
    mob_kills INTEGER DEFAULT 0,
    damage_dealt INTEGER DEFAULT 0,
    damage_taken INTEGER DEFAULT 0,
    
    -- Предметы и крафт
    items_crafted INTEGER DEFAULT 0,
    items_dropped INTEGER DEFAULT 0,
    items_picked_up INTEGER DEFAULT 0,
    
    -- Взаимодействие с миром
    animals_bred INTEGER DEFAULT 0,
    fish_caught INTEGER DEFAULT 0,
    treasures_fished INTEGER DEFAULT 0,
    
    -- Достижения и прогресс
    achievements_unlocked INTEGER DEFAULT 0,
    experience_gained INTEGER DEFAULT 0,
    levels_gained INTEGER DEFAULT 0,
    
    -- Статистика сессий
    longest_session INTEGER DEFAULT 0, -- в секундах
    average_session INTEGER DEFAULT 0, -- в секундах
    sessions_count INTEGER DEFAULT 0,
    
    -- Временные метки
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id),
    UNIQUE(minecraft_uuid)
);

-- Создание индексов для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_player_statistics_user_id ON player_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_player_statistics_minecraft_uuid ON player_statistics(minecraft_uuid);
CREATE INDEX IF NOT EXISTS idx_player_statistics_last_seen ON player_statistics(last_seen);

-- Создание таблицы для хранения ежедневной активности
CREATE TABLE IF NOT EXISTS daily_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    playtime_seconds INTEGER DEFAULT 0,
    logins_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, activity_date)
);

-- Создание индексов для daily_activity
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_id ON daily_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(activity_date);

-- Создание таблицы для достижений
CREATE TABLE IF NOT EXISTS player_achievements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_key VARCHAR(100) NOT NULL,
    achievement_name VARCHAR(255) NOT NULL,
    achievement_description TEXT,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, achievement_key)
);

-- Создание индекса для player_achievements
CREATE INDEX IF NOT EXISTS idx_player_achievements_user_id ON player_achievements(user_id);

-- Функция для обновления updated_at в player_statistics
CREATE OR REPLACE FUNCTION update_player_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера для автоматического обновления updated_at
DROP TRIGGER IF EXISTS trigger_update_player_statistics_updated_at ON player_statistics;
CREATE TRIGGER trigger_update_player_statistics_updated_at
    BEFORE UPDATE ON player_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_player_statistics_updated_at();

-- Добавление комментариев к таблицам
COMMENT ON TABLE player_statistics IS 'Статистика игроков с Minecraft сервера';
COMMENT ON TABLE daily_activity IS 'Ежедневная активность игроков';
COMMENT ON TABLE player_achievements IS 'Достижения игроков';
