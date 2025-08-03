-- Обновление таблицы player_stats для детальной статистики
-- Добавляем новые поля для Minecraft статистики

-- Добавляем Minecraft статистику игрока
ALTER TABLE player_stats 
ADD COLUMN IF NOT EXISTS minecraft_stats JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_session_duration INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_session_duration INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP,
ADD COLUMN IF NOT EXISTS blocks_broken INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS blocks_placed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS distance_walked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS deaths_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS mobs_killed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS items_crafted INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_dealt INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS damage_taken INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS food_eaten INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS jumps_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS online_time_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS online_time_week INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS online_time_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS favorite_play_hour INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS active_days_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_ip_address INET,
ADD COLUMN IF NOT EXISTS stats_last_updated TIMESTAMP DEFAULT NOW();

-- Создаем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_last_seen ON player_stats(last_seen);
CREATE INDEX IF NOT EXISTS idx_player_stats_updated ON player_stats(stats_last_updated);

-- Добавляем комментарии к полям
COMMENT ON COLUMN player_stats.minecraft_stats IS 'JSON с детальной статистикой из Minecraft';
COMMENT ON COLUMN player_stats.session_count IS 'Количество игровых сессий';
COMMENT ON COLUMN player_stats.average_session_duration IS 'Средняя продолжительность сессии в минутах';
COMMENT ON COLUMN player_stats.longest_session_duration IS 'Самая длинная сессия в минутах';
COMMENT ON COLUMN player_stats.last_seen IS 'Последний раз был в сети';
COMMENT ON COLUMN player_stats.blocks_broken IS 'Количество сломанных блоков';
COMMENT ON COLUMN player_stats.blocks_placed IS 'Количество поставленных блоков';
COMMENT ON COLUMN player_stats.distance_walked IS 'Пройденное расстояние в блоках';
COMMENT ON COLUMN player_stats.deaths_count IS 'Количество смертей';
COMMENT ON COLUMN player_stats.mobs_killed IS 'Количество убитых мобов';
COMMENT ON COLUMN player_stats.items_crafted IS 'Количество скрафченных предметов';
COMMENT ON COLUMN player_stats.damage_dealt IS 'Нанесенный урон';
COMMENT ON COLUMN player_stats.damage_taken IS 'Полученный урон';
COMMENT ON COLUMN player_stats.food_eaten IS 'Съедено еды';
COMMENT ON COLUMN player_stats.jumps_count IS 'Количество прыжков';
COMMENT ON COLUMN player_stats.online_time_today IS 'Время онлайн сегодня в минутах';
COMMENT ON COLUMN player_stats.online_time_week IS 'Время онлайн за неделю в минутах';
COMMENT ON COLUMN player_stats.online_time_month IS 'Время онлайн за месяц в минутах';
COMMENT ON COLUMN player_stats.favorite_play_hour IS 'Любимый час для игры (0-23)';
COMMENT ON COLUMN player_stats.active_days_count IS 'Количество активных дней';
COMMENT ON COLUMN player_stats.last_ip_address IS 'Последний IP адрес';
COMMENT ON COLUMN player_stats.stats_last_updated IS 'Время последнего обновления статистики';

-- Создаем таблицу для детализированной истории сессий
CREATE TABLE IF NOT EXISTS player_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    session_start TIMESTAMP NOT NULL,
    session_end TIMESTAMP,
    duration_minutes INTEGER,
    ip_address INET,
    minecraft_version VARCHAR(20),
    blocks_broken INTEGER DEFAULT 0,
    blocks_placed INTEGER DEFAULT 0,
    distance_walked INTEGER DEFAULT 0,
    deaths_count INTEGER DEFAULT 0,
    mobs_killed INTEGER DEFAULT 0,
    damage_dealt INTEGER DEFAULT 0,
    damage_taken INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для player_sessions
CREATE INDEX IF NOT EXISTS idx_player_sessions_user_id ON player_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_start ON player_sessions(session_start);
CREATE INDEX IF NOT EXISTS idx_player_sessions_duration ON player_sessions(duration_minutes);

-- Комментарии для player_sessions
COMMENT ON TABLE player_sessions IS 'История игровых сессий игроков';
COMMENT ON COLUMN player_sessions.duration_minutes IS 'Продолжительность сессии в минутах';
COMMENT ON COLUMN player_sessions.minecraft_version IS 'Версия Minecraft клиента';

-- Создаем таблицу для ежедневной статистики
CREATE TABLE IF NOT EXISTS daily_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    stat_date DATE NOT NULL,
    playtime_minutes INTEGER DEFAULT 0,
    logins_count INTEGER DEFAULT 0,
    blocks_broken INTEGER DEFAULT 0,
    blocks_placed INTEGER DEFAULT 0,
    distance_walked INTEGER DEFAULT 0,
    deaths_count INTEGER DEFAULT 0,
    mobs_killed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, stat_date)
);

-- Индексы для daily_stats
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stat_date);

-- Комментарии для daily_stats
COMMENT ON TABLE daily_stats IS 'Ежедневная статистика игроков для графиков';

-- Обновляем существующие записи, устанавливая базовые значения
UPDATE player_stats 
SET 
    session_count = GREATEST(total_logins, 1),
    active_days_count = GREATEST(EXTRACT(DAY FROM (NOW() - created_at))::INTEGER, 1),
    last_seen = updated_at,
    stats_last_updated = NOW()
WHERE session_count = 0 OR session_count IS NULL;
