-- Миграция: Упрощение регистрации
-- Дата: 2025-07-26
-- Описание: Убираем обязательность полей при регистрации

-- 1. Делаем имя необязательным (если таблица уже существует)
ALTER TABLE users ALTER COLUMN first_name DROP NOT NULL;

-- 2. Добавляем поле last_name если его нет
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(50);

-- 3. Делаем nickname уникальным если еще не сделали
ALTER TABLE users ADD CONSTRAINT unique_nickname UNIQUE (nickname);

-- 4. Делаем password_hash обязательным если еще не сделали
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;

-- 5. Добавляем поля бана если их нет
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- 6. Создаем индексы для лучшей производительности
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
CREATE INDEX IF NOT EXISTS idx_users_trust_level ON users(trust_level);
CREATE INDEX IF NOT EXISTS idx_users_registered_at ON users(registered_at);

-- 7. Добавляем комментарии к таблице
COMMENT ON TABLE users IS 'Пользователи системы с упрощенной регистрацией';
COMMENT ON COLUMN users.nickname IS 'Minecraft ник (обязательный, уникальный)';
COMMENT ON COLUMN users.first_name IS 'Имя пользователя (необязательное)';
COMMENT ON COLUMN users.email IS 'Email адрес (обязательный, уникальный)';
COMMENT ON COLUMN users.password_hash IS 'Хеш пароля (обязательный)';
COMMENT ON COLUMN users.age IS 'Возраст (настраивается в профиле)';
COMMENT ON COLUMN users.discord_tag IS 'Discord тег (настраивается в профиле)';

-- Выводим информацию о миграции
SELECT 'Миграция успешно применена! Регистрация упрощена.' as status;
