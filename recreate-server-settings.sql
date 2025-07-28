-- Скрипт для пересоздания таблицы server_settings с правильной структурой

-- Проверяем текущее состояние
SELECT 'Текущие настройки:' as info;
SELECT setting_key, setting_value FROM server_settings ORDER BY setting_key;

-- Создаем резервную копию
CREATE TABLE IF NOT EXISTS server_settings_backup AS 
SELECT * FROM server_settings;

-- Удаляем старую таблицу
DROP TABLE IF EXISTS server_settings;

-- Создаем новую таблицу с правильной структурой
CREATE TABLE server_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'string',
    category VARCHAR(50) DEFAULT 'general',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- Вставляем базовые настройки с правильными ключами (kebab-case)
INSERT INTO server_settings (setting_key, setting_value, setting_type, category, description) VALUES
-- Основные настройки сервера
('server-name', 'ChiwawaMine', 'string', 'general', 'Название сервера'),
('server-description', 'Лучший Minecraft сервер с дружелюбным сообществом', 'string', 'general', 'Описание сервера'),
('server-ip', 'play.chiwawa.site', 'string', 'general', 'IP адрес сервера'),
('server-port', '25565', 'integer', 'general', 'Порт сервера'),
('max-players', '100', 'integer', 'general', 'Максимальное количество игроков'),
('discord-invite', 'https://discord.gg/chiwawa', 'string', 'general', 'Ссылка на Discord сервер'),
('telegram-invite', 'https://t.me/chiwawa', 'string', 'general', 'Ссылка на Telegram канал'),

-- Системные настройки
('maintenance-mode', 'false', 'boolean', 'system', 'Режим технического обслуживания'),
('registration-enabled', 'true', 'boolean', 'system', 'Разрешена ли регистрация новых пользователей'),
('auto-backup-enabled', 'true', 'boolean', 'system', 'Автоматическое создание резервных копий'),

-- Настройки заявок
('applications-enabled', 'true', 'boolean', 'applications', 'Прием заявок включен'),
('min-motivation-length', '50', 'integer', 'applications', 'Минимальная длина мотивации'),
('min-plans-length', '30', 'integer', 'applications', 'Минимальная длина планов'),
('max-applications-per-day', '3', 'integer', 'applications', 'Максимум заявок в день с одного IP'),
('auto-approve-trust-level', '2', 'integer', 'applications', 'Автоматическое одобрение при Trust Level'),

-- Trust Level система
('trust-points-email', '50', 'integer', 'trust', 'Очки за подтверждение email'),
('trust-points-discord', '30', 'integer', 'trust', 'Очки за привязку Discord'),
('trust-points-hour', '5', 'integer', 'trust', 'Очки за час игры'),
('trust-level-1-required', '100', 'integer', 'trust', 'Очки для достижения Trust Level 1'),
('trust-level-2-required', '500', 'integer', 'trust', 'Очки для достижения Trust Level 2'),
('trust-level-3-required', '1500', 'integer', 'trust', 'Очки для достижения Trust Level 3'),

-- Настройки безопасности
('max-login-attempts', '5', 'integer', 'security', 'Максимум попыток входа'),
('login-lockout-duration', '15', 'integer', 'security', 'Время блокировки в минутах'),
('jwt-expires-days', '30', 'integer', 'security', 'Время жизни JWT токена в днях'),
('require-email-verification', 'true', 'boolean', 'security', 'Требовать подтверждение email'),
('two-factor-enabled', 'false', 'boolean', 'security', 'Двухфакторная аутентификация'),
('rate-limit-requests', '100', 'integer', 'security', 'Лимит запросов в минуту'),

-- Email настройки
('smtp-host', 'smtp.yandex.ru', 'string', 'email', 'SMTP сервер'),
('smtp-port', '465', 'integer', 'email', 'SMTP порт'),
('smtp-from', 'noreply@chiwawa.site', 'string', 'email', 'Email отправителя'),
('smtp-user', '', 'string', 'email', 'SMTP пользователь'),
('smtp-password', '', 'string', 'email', 'SMTP пароль'),
('smtp-tls', 'true', 'boolean', 'email', 'Использовать TLS/SSL'),
('smtp-sender-name', 'ChiwawaMine', 'string', 'email', 'Имя отправителя'),
('smtp-reply-to', '', 'string', 'email', 'Reply-To адрес'),
('email-notifications-enabled', 'true', 'boolean', 'email', 'Email уведомления включены'),
('smtp-timeout', '30', 'integer', 'email', 'Тайм-аут SMTP в секундах');

-- Показываем результат
SELECT 'Новые настройки:' as info;
SELECT setting_key, setting_value, category FROM server_settings ORDER BY category, setting_key;
