-- Создание таблицы для игровых сессий (авторизации в игре)
CREATE TABLE IF NOT EXISTS player_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    minecraft_nickname VARCHAR(32) NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    client_identifier VARCHAR(255) NOT NULL, -- UUID клиента + хардверный ID
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_player_sessions_user_id ON player_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_minecraft_nickname ON player_sessions(minecraft_nickname);
CREATE INDEX IF NOT EXISTS idx_player_sessions_session_token ON player_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_player_sessions_client_identifier ON player_sessions(client_identifier);
CREATE INDEX IF NOT EXISTS idx_player_sessions_expires_at ON player_sessions(expires_at);

-- Комментарии
COMMENT ON TABLE player_sessions IS 'Сессии игроков в Minecraft (долгосрочные авторизации)';
COMMENT ON COLUMN player_sessions.session_token IS 'Уникальный токен сессии для игрока';
COMMENT ON COLUMN player_sessions.client_identifier IS 'Идентификатор клиента (UUID + хардверный ID)';
COMMENT ON COLUMN player_sessions.expires_at IS 'Время истечения сессии (7 дней)';
COMMENT ON COLUMN player_sessions.last_activity IS 'Время последней активности игрока';
