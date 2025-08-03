-- Создание таблицы для игровых токенов авторизации
CREATE TABLE IF NOT EXISTS game_tokens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_game_tokens_token_hash ON game_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_game_tokens_user_id ON game_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_game_tokens_expires_at ON game_tokens(expires_at);

-- Комментарии
COMMENT ON TABLE game_tokens IS 'Токены для авторизации игроков на игровом сервере';
COMMENT ON COLUMN game_tokens.token_hash IS 'Хеш токена для безопасности';
COMMENT ON COLUMN game_tokens.is_used IS 'Был ли токен использован для входа';
COMMENT ON COLUMN game_tokens.used_at IS 'Время использования токена';
