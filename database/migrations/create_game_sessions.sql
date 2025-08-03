-- Создание таблицы для игровых сессий
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_uuid VARCHAR(36) NOT NULL,
    nickname VARCHAR(16) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_game_sessions_player_uuid ON game_sessions(player_uuid);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_expires_at ON game_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_active ON game_sessions(is_active);

-- Уникальный индекс: один активный UUID на пользователя
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_unique_active 
ON game_sessions(user_id, player_uuid, is_active) 
WHERE is_active = TRUE;

-- Комментарии
COMMENT ON TABLE game_sessions IS 'Игровые сессии для авторизованных игроков на сервере';
COMMENT ON COLUMN game_sessions.player_uuid IS 'UUID игрока в Minecraft';
COMMENT ON COLUMN game_sessions.nickname IS 'Никнейм игрока на момент создания сессии';
COMMENT ON COLUMN game_sessions.is_active IS 'Активна ли сессия';
COMMENT ON COLUMN game_sessions.last_login IS 'Время последнего входа с этой сессией';
