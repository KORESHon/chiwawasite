-- Схема базы данных для Chiwawa Server
-- Создатель: ebluffy
-- Обновлено согласно предоставленной схеме

-- Создание базы данных (выполнить отдельно если нужно)
-- CREATE DATABASE chiwawa;
-- CREATE USER chiwawa WITH PASSWORD 'mtU-PSM-cFP-2D6';
-- GRANT ALL PRIVILEGES ON DATABASE chiwawa TO chiwawa;

-- Подключиться к базе chiwawa и выполнить следующие команды:

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Таблица пользователей (основа личного кабинета)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nickname VARCHAR(32) NOT NULL,
    discord_id VARCHAR(32), -- discord user id, если есть
    discord_tag VARCHAR(64), -- discord#tag
    email VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(128), -- если есть локальная авторизация
    registered_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    -- Дополнительные поля для расширенной функциональности
    display_name VARCHAR(50),
    bio TEXT,
    trust_level INTEGER DEFAULT 0, -- 0-5 уровни доверия
    is_email_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    avatar_url VARCHAR(255)
);

-- 2. Таблица заявок на сервер (расширенная)
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- Расширенные поля заявки согласно новой форме
    minecraft_nick VARCHAR(16) NOT NULL,
    age VARCHAR(20) NOT NULL,
    discord VARCHAR(100) NOT NULL,
    email VARCHAR(128) NOT NULL,
    experience VARCHAR(50) NOT NULL,
    motivation TEXT NOT NULL,
    plans TEXT NOT NULL,
    reason TEXT, -- оставляем для совместимости
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, banned
    submitted_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id),
    review_comment TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- 3. Таблица игровых лимитов (например, время на сервере)
CREATE TABLE play_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    total_minutes INTEGER DEFAULT 0,
    daily_limit_minutes INTEGER DEFAULT 600, -- 10 часов для новичков
    last_update TIMESTAMP DEFAULT NOW(),
    is_limited BOOLEAN DEFAULT TRUE -- снимается при подтверждении email
);

-- 4. Таблица логов входа
CREATE TABLE login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    login_time TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE
);

-- 5. Таблица Discord OAuth (если потребуется связка)
CREATE TABLE discord_oauth (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    access_token VARCHAR(128),
    refresh_token VARCHAR(128),
    expires_at TIMESTAMP,
    discord_username VARCHAR(64),
    discord_discriminator VARCHAR(4)
);

-- 6. Таблица администраторов сайта/сервера
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT NOW(),
    role VARCHAR(32) DEFAULT 'admin', -- admin, moderator
    granted_by INTEGER REFERENCES users(id)
);

-- 7. Таблица для хранения сообщений/логов действий (на будущее)
CREATE TABLE action_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45),
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Таблица для статуса сервера (заполняется из плагина или вручную)
CREATE TABLE server_status (
    id SERIAL PRIMARY KEY,
    is_online BOOLEAN DEFAULT FALSE,
    online_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 20,
    updated_at TIMESTAMP DEFAULT NOW(),
    server_version VARCHAR(32),
    motd TEXT
);

-- 9. Таблица для хранения правил сервера (если планируются страницы с правилами)
CREATE TABLE server_rules (
    id SERIAL PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(64) DEFAULT 'general',
    order_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 10. Таблица сессий пользователей (для JWT токенов)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 11. Таблица для Trust Level прогресса
CREATE TABLE trust_level_progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_level INTEGER DEFAULT 0,
    time_played_minutes INTEGER DEFAULT 0,
    email_verified BOOLEAN DEFAULT FALSE,
    discord_verified BOOLEAN DEFAULT FALSE,
    minecraft_verified BOOLEAN DEFAULT FALSE,
    reputation INTEGER DEFAULT 0,
    achievements_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 12. Таблица настроек сайта
CREATE TABLE site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 13. Таблица активности пользователей
CREATE TABLE user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- login, logout, join_server, achievement, etc.
    description TEXT NOT NULL,
    metadata JSONB, -- дополнительные данные в JSON
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 14. Таблица достижений
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    points INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 15. Таблица пользовательских достижений
CREATE TABLE user_achievements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- Индексы для оптимизации
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_nickname ON users(nickname);
CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_registered_at ON users(registered_at);

CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_submitted_at ON applications(submitted_at);
CREATE INDEX idx_applications_user_id ON applications(user_id);

CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_login_logs_login_time ON login_logs(login_time);
CREATE INDEX idx_login_logs_ip_address ON login_logs(ip_address);

CREATE INDEX idx_action_logs_user_id ON action_logs(user_id);
CREATE INDEX idx_action_logs_created_at ON action_logs(created_at);
CREATE INDEX idx_action_logs_action ON action_logs(action);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX idx_user_activity_created_at ON user_activity(created_at);
CREATE INDEX idx_user_activity_type ON user_activity(activity_type);

-- Триггеры для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_server_rules_updated_at 
    BEFORE UPDATE ON server_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trust_level_progress_updated_at 
    BEFORE UPDATE ON trust_level_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Добавляем начальные настройки сайта
INSERT INTO site_settings (key, value, description) VALUES
('server_name', 'Chiwawa Server', 'Название сервера'),
('server_description', 'Приватный Minecraft сервер для своих.<br><span class="text-chiwawa-primary font-semibold">Вход только по заявку.</span>', 'Описание сервера'),
('discord_invite', 'https://discord.gg/your-invite', 'Ссылка на Discord сервер'),
('color_scheme', 'orange', 'Цветовая схема сайта'),
('registration_enabled', 'true', 'Разрешена ли подача заявок'),
('max_applications_per_day', '10', 'Максимум заявок в день с одного IP'),
('email_notifications', 'true', 'Включены ли email уведомления'),
('trust_level_system', 'true', 'Включена ли система Trust Level'),
('time_limit_for_newcomers', '600', 'Лимит времени для новичков в минутах');

-- Создаём администратора по умолчанию (пароль: admin123)
-- Хэш для пароля "admin123" с bcrypt rounds=12
INSERT INTO users (nickname, email, password_hash, display_name, trust_level, is_active, is_email_verified) VALUES
('ChiwawaAdmin', 'admin@chiwawa.site', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8.1ewyJ3WKxWfV1KWXG', 'Администратор', 5, true, true);

-- Добавляем администратора в таблицу админов
INSERT INTO admins (user_id, role) 
SELECT id, 'admin' FROM users WHERE email = 'admin@chiwawa.site';

-- Добавляем прогресс Trust Level для администратора
INSERT INTO trust_level_progress (user_id, current_level, email_verified, discord_verified, minecraft_verified, reputation)
SELECT id, 5, true, true, true, 1000 FROM users WHERE email = 'admin@chiwawa.site';

-- Добавляем начальные правила сервера
INSERT INTO server_rules (title, content, category, order_index) VALUES
('Уважение к игрокам', 'Будьте вежливы и дружелюбны. Оскорбления и токсичность недопустимы.', 'behavior', 1),
('Запрет на гриферство', 'Не разрушайте чужие постройки без разрешения. Уважайте труд других игроков.', 'gameplay', 2),
('Честная игра', 'Использование читов, дюпов и эксплойтов запрещено. Играйте честно.', 'gameplay', 3),
('Активность в сообществе', 'Участвуйте в жизни сервера, общайтесь в Discord, помогайте новичкам.', 'community', 4);

-- Добавляем базовые достижения
INSERT INTO achievements (name, description, icon, points) VALUES
('Первый вход', 'Впервые зашли на сервер', 'star', 10),
('Новичок', 'Играли 1 час', 'clock', 20),
('Активный игрок', 'Играли 10 часов', 'trophy', 50),
('Ветеран', 'Играли 100 часов', 'crown', 100),
('Подтвержденный', 'Подтвердили email адрес', 'check-circle', 30),
('Социальный', 'Привязали Discord аккаунт', 'discord', 25);

-- Добавляем начальный статус сервера
INSERT INTO server_status (is_online, online_players, max_players, server_version, motd) VALUES
(false, 0, 20, '1.20.4', 'Добро пожаловать на Chiwawa Server!');
