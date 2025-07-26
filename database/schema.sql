-- Схема базы данных для Chiwawa Server v2.1
-- Создатель: ebluffy
-- Оптимизированная версия с учетом всех обновлений

-- Создание базы данных (выполнить отдельно если нужно)
-- CREATE DATABASE chiwawa;
-- CREATE USER chiwawa WITH PASSWORD 'mtU-PSM-cFP-2D6';
-- GRANT ALL PRIVILEGES ON DATABASE chiwawa TO chiwawa;

-- Подключиться к базе chiwawa и выполнить следующие команды:

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Главная таблица пользователей (объединяет всю основную информацию)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    -- Основная информация
    nickname VARCHAR(32) NOT NULL UNIQUE, -- Minecraft ник обязателен и уникален
    email VARCHAR(128) NOT NULL UNIQUE, -- Email обязателен
    password_hash VARCHAR(128) NOT NULL, -- Пароль обязателен
    
    -- Персональная информация (опционально)
    first_name VARCHAR(50), -- Имя пользователя
    last_name VARCHAR(50), -- Фамилия (может быть убрана)
    age VARCHAR(20), -- Возраст
    display_name VARCHAR(50), -- Отображаемое имя
    bio TEXT, -- Биография
    avatar_url VARCHAR(255), -- Аватар
    
    -- Интеграции
    discord_id VARCHAR(32), -- Discord user ID
    discord_tag VARCHAR(64), -- Discord username
    
    -- Статусы и роли
    role VARCHAR(32) DEFAULT 'user', -- user, admin, moderator
    trust_level INTEGER DEFAULT 0, -- 0-5 уровни доверия
    status VARCHAR(32) DEFAULT 'active', -- active, banned, pending, rejected
    
    -- Флаги
    is_active BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    
    -- Временные метки
    registered_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    
    -- Дополнительно
    ban_reason TEXT,
    
    -- Ограничения
    CONSTRAINT check_role CHECK (role IN ('user', 'admin', 'moderator')),
    CONSTRAINT check_status CHECK (status IN ('active', 'banned', 'pending', 'rejected')),
    CONSTRAINT check_trust_level CHECK (trust_level >= 0 AND trust_level <= 5)
);

-- 2. Заявки на сервер
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Данные заявки
    minecraft_nick VARCHAR(16) NOT NULL,
    age VARCHAR(20) NOT NULL,
    discord VARCHAR(100) NOT NULL,
    email VARCHAR(128) NOT NULL,
    experience VARCHAR(50) NOT NULL,
    motivation TEXT NOT NULL,
    plans TEXT NOT NULL,
    
    -- Статус заявки
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id),
    review_comment TEXT,
    
    -- Мета информация
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    CONSTRAINT check_application_status CHECK (status IN ('pending', 'approved', 'rejected', 'banned'))
);

-- 3. Игровая статистика и лимиты
CREATE TABLE player_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Игровое время
    total_minutes INTEGER DEFAULT 0,
    daily_limit_minutes INTEGER DEFAULT 600, -- 10 часов для новичков
    is_time_limited BOOLEAN DEFAULT TRUE, -- снимается при подтверждении email
    
    -- Trust Level прогресс
    current_level INTEGER DEFAULT 0,
    time_played_minutes INTEGER DEFAULT 0,
    email_verified BOOLEAN DEFAULT FALSE,
    discord_verified BOOLEAN DEFAULT FALSE,
    minecraft_verified BOOLEAN DEFAULT FALSE,
    reputation INTEGER DEFAULT 0,
    achievements_count INTEGER DEFAULT 0,
    
    -- Статистика
    total_logins INTEGER DEFAULT 0,
    warnings_count INTEGER DEFAULT 0,
    
    -- Временные метки
    last_update TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Логи входа
CREATE TABLE login_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    login_time TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE
);

-- 5. Сессии пользователей (для JWT токенов)
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

-- 6. Токены верификации email
CREATE TABLE email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE
);

-- 7. Discord OAuth интеграция
CREATE TABLE discord_oauth (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    access_token VARCHAR(128),
    refresh_token VARCHAR(128),
    expires_at TIMESTAMP,
    discord_username VARCHAR(64),
    discord_discriminator VARCHAR(4),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Активность пользователей
CREATE TABLE user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- login, logout, join_server, achievement, etc.
    description TEXT NOT NULL,
    metadata JSONB, -- дополнительные данные в JSON
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Логи действий администраторов
CREATE TABLE admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 10. Достижения
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    points INTEGER DEFAULT 0,
    category VARCHAR(50) DEFAULT 'general',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 11. Пользовательские достижения
CREATE TABLE user_achievements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- 12. Статус сервера
CREATE TABLE server_status (
    id SERIAL PRIMARY KEY,
    is_online BOOLEAN DEFAULT FALSE,
    online_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 20,
    server_version VARCHAR(32),
    motd TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 13. Правила сервера
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

-- 14. Настройки сайта
CREATE TABLE site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Создание индексов для оптимизации
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_nickname ON users(nickname);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_trust_level ON users(trust_level);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_registered_at ON users(registered_at);
CREATE INDEX idx_users_discord_id ON users(discord_id);

CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_submitted_at ON applications(submitted_at);
CREATE INDEX idx_applications_user_id ON applications(user_id);

CREATE INDEX idx_player_stats_user_id ON player_stats(user_id);
CREATE INDEX idx_player_stats_current_level ON player_stats(current_level);

CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_login_logs_login_time ON login_logs(login_time);
CREATE INDEX idx_login_logs_ip_address ON login_logs(ip_address);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

CREATE INDEX idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX idx_user_activity_created_at ON user_activity(created_at);
CREATE INDEX idx_user_activity_type ON user_activity(activity_type);

CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_target_user_id ON admin_logs(target_user_id);
CREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement_id ON user_achievements(achievement_id);

-- Триггеры для автоматического обновления временных меток
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

CREATE TRIGGER update_player_stats_updated_at 
    BEFORE UPDATE ON player_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_server_status_updated_at 
    BEFORE UPDATE ON server_status 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Добавляем начальные настройки сайта
INSERT INTO site_settings (key, value, description, category) VALUES
('server_name', 'Chiwawa Server', 'Название сервера', 'general'),
('server_description', 'Приватный Minecraft сервер для своих.<br><span class="text-chiwawa-primary font-semibold">Вход только по заявку.</span>', 'Описание сервера', 'general'),
('discord_invite', 'https://discord.gg/your-invite', 'Ссылка на Discord сервер', 'social'),
('color_scheme', 'orange', 'Цветовая схема сайта', 'appearance'),
('registration_enabled', 'true', 'Разрешена ли подача заявок', 'registration'),
('max_applications_per_day', '10', 'Максимум заявок в день с одного IP', 'registration'),
('email_notifications', 'true', 'Включены ли email уведомления', 'notifications'),
('trust_level_system', 'true', 'Включена ли система Trust Level', 'gameplay'),
('time_limit_for_newcomers', '600', 'Лимит времени для новичков в минутах', 'gameplay'),
('smtp_host', 'smtp.yandex.ru', 'SMTP сервер для отправки email', 'email'),
('smtp_port', '465', 'Порт SMTP сервера', 'email'),
('smtp_user', 'chiwawa.helper@yandex.ru', 'Пользователь SMTP', 'email'),
('maintenance_mode', 'false', 'Режим технических работ', 'system');

-- Создаём администратора по умолчанию
-- Пароль: admin123 (хэш bcrypt rounds=12)
INSERT INTO users (
    nickname, 
    email, 
    password_hash, 
    first_name,
    display_name, 
    role, 
    trust_level, 
    status,
    is_active, 
    is_email_verified
) VALUES (
    'ebluffy', 
    'dima2_05@mail.ru', 
    '$2a$12$Wp8pSrr9R1tPyaT7BUW4RuIT2Kdt1YdEWdsrL.J3vvSs6p/am39o2',
    'Дмитрий',
    'Администратор', 
    'admin', 
    5, 
    'active',
    true, 
    true
);

-- Добавляем статистику для администратора
INSERT INTO player_stats (
    user_id, 
    current_level, 
    email_verified, 
    discord_verified, 
    minecraft_verified, 
    reputation,
    is_time_limited
) SELECT 
    id, 
    5, 
    true, 
    true, 
    true, 
    1000,
    false
FROM users WHERE nickname = 'ebluffy';

-- Добавляем начальные правила сервера
INSERT INTO server_rules (title, content, category, order_index) VALUES
('Уважение к игрокам', 'Будьте вежливы и дружелюбны. Оскорбления и токсичность недопустимы.', 'behavior', 1),
('Запрет на гриферство', 'Не разрушайте чужие постройки без разрешения. Уважайте труд других игроков.', 'gameplay', 2),
('Честная игра', 'Использование читов, дюпов и эксплойтов запрещено. Играйте честно.', 'gameplay', 3),
('Активность в сообществе', 'Участвуйте в жизни сервера, общайтесь в Discord, помогайте новичкам.', 'community', 4),
('Возрастные ограничения', 'Сервер предназначен для игроков от 16 лет. Исключения только с разрешения администрации.', 'general', 5);

-- Добавляем базовые достижения
INSERT INTO achievements (name, description, icon, points, category) VALUES
('Первый вход', 'Впервые зашли на сервер', 'star', 10, 'milestone'),
('Новичок', 'Играли 1 час', 'clock', 20, 'playtime'),
('Активный игрок', 'Играли 10 часов', 'trophy', 50, 'playtime'),
('Ветеран', 'Играли 100 часов', 'crown', 100, 'playtime'),
('Подтвержденный', 'Подтвердили email адрес', 'check-circle', 30, 'verification'),
('Социальный', 'Привязали Discord аккаунт', 'discord', 25, 'social'),
('Строитель', 'Построили свой первый дом', 'home', 40, 'building'),
('Исследователь', 'Прошли 10,000 блоков', 'map', 60, 'exploration');

-- Добавляем начальный статус сервера
INSERT INTO server_status (is_online, online_players, max_players, server_version, motd) VALUES
(false, 0, 20, '1.20.4', 'Добро пожаловать на Chiwawa Server!');

-- Комментарии к оптимизации:
-- 1. Убрана таблица admins - роли теперь в users.role
-- 2. Убрана таблица play_limits - объединена с trust_level_progress в player_stats
-- 3. Убрана таблица action_logs - заменена на admin_logs (более специфично)
-- 4. Добавлены ограничения (constraints) для валидации данных
-- 5. Улучшена структура индексов
-- 6. Добавлены категории для настроек и достижений
-- 7. Более логичная организация полей в таблицах
