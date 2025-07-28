-- Обновление базы данных для новой системы настроек Chiwawa Server
-- Выполните этот SQL в вашей базе данных PostgreSQL

-- 1. Создаем новую таблицу server_settings (заменяет site_settings)
DROP TABLE IF EXISTS server_settings CASCADE;
CREATE TABLE server_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(50) NOT NULL DEFAULT 'text',
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    description TEXT,
    is_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

-- 2. Создаем таблицу email_templates для шаблонов писем
DROP TABLE IF EXISTS email_templates CASCADE;
CREATE TABLE email_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL UNIQUE,
    template_subject VARCHAR(500) NOT NULL,
    template_html TEXT NOT NULL,
    template_variables TEXT, -- JSON массив доступных переменных
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

-- 3. Создаем индексы для оптимизации
CREATE INDEX idx_server_settings_category ON server_settings(category);
CREATE INDEX idx_server_settings_key ON server_settings(setting_key);
CREATE INDEX idx_email_templates_name ON email_templates(template_name);
CREATE INDEX idx_email_templates_active ON email_templates(is_active);

-- 4. Добавляем триггеры для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_server_settings_updated_at 
    BEFORE UPDATE ON server_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at 
    BEFORE UPDATE ON email_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Переносим данные из старой таблицы site_settings (если существует)
INSERT INTO server_settings (setting_key, setting_value, setting_type, category, description)
SELECT 
    key as setting_key,
    value as setting_value,
    'text' as setting_type,
    COALESCE(category, 'general') as category,
    description
FROM site_settings
ON CONFLICT (setting_key) DO NOTHING;

-- 6. Добавляем базовые настройки
INSERT INTO server_settings (setting_key, setting_value, setting_type, category, description, is_required) VALUES
-- Основные настройки
('server-name', 'Test', 'text', 'general', 'Название сервера', true),
('server-description', 'Приватный Minecraft сервер с дружелюбным сообществом', 'textarea', 'general', 'Описание сервера', false),
('server-ip', 'play.chiwawa.site', 'text', 'general', 'IP адрес сервера', true),
('server-port', '25565', 'number', 'general', 'Порт сервера', true),
('max-players', '100', 'number', 'general', 'Максимум игроков онлайн', true),
('discord-invite', 'https://discord.gg/chiwawa', 'url', 'general', 'Discord приглашение', false),
('telegram-invite', 'https://t.me/chiwawa', 'url', 'general', 'Telegram канал', false),

-- Системные настройки
('maintenance-mode', 'false', 'boolean', 'general', 'Режим обслуживания', false),
('registration-enabled', 'true', 'boolean', 'general', 'Регистрация разрешена', false),
('auto-backup-enabled', 'true', 'boolean', 'general', 'Автоматические бэкапы', false),

-- Настройки заявок
('applications-enabled', 'true', 'boolean', 'applications', 'Прием заявок', false),
('min-motivation-length', '50', 'number', 'applications', 'Минимум символов в мотивации', false),
('min-plans-length', '30', 'number', 'applications', 'Минимум символов в планах', false),
('max-applications-per-day', '3', 'number', 'applications', 'Лимит заявок с одного IP в день', false),
('auto-approve-trust-level', '0', 'select', 'applications', 'Автоматическое одобрение по Trust Level', false),

-- Trust Level система
('trust-points-email', '10', 'number', 'trust', 'Очки за подтверждение email', false),
('trust-points-discord', '15', 'number', 'trust', 'Очки за связку с Discord', false),
('trust-points-hour', '1', 'number', 'trust', 'Очки за час игры на сервере', false),
('trust-level-1-required', '25', 'number', 'trust', 'Trust Level 1 (очков)', false),
('trust-level-2-required', '100', 'number', 'trust', 'Trust Level 2 (очков)', false),
('trust-level-3-required', '500', 'number', 'trust', 'Trust Level 3 (очков)', false),

-- Настройки безопасности
('max-login-attempts', '5', 'number', 'security', 'Максимум попыток входа', false),
('login-lockout-duration', '15', 'number', 'security', 'Время блокировки (минуты)', false),
('rate-limit-requests', '100', 'number', 'security', 'Rate Limiting (запросов в минуту)', false),
('jwt-expires-days', '7', 'number', 'security', 'Время жизни JWT токена (дни)', false),
('require-email-verification', 'true', 'boolean', 'security', 'Требовать подтверждение email', false),

-- Email настройки
('smtp-host', 'smtp.yandex.ru', 'text', 'email', 'SMTP хост', true),
('smtp-port', '465', 'number', 'email', 'SMTP порт', true),
('smtp-secure', 'true', 'boolean', 'email', 'Использовать SSL/TLS', true),
('smtp-from', 'chiwawa.helper@yandex.ru', 'email', 'email', 'Email отправителя', true),
('smtp-user', 'chiwawa.helper@yandex.ru', 'text', 'email', 'SMTP пользователь', true),
('smtp-password', '', 'password', 'email', 'SMTP пароль', true),
('email-from-name', 'Chiwawa Server', 'text', 'email', 'Имя отправителя', false),
('email-reply-to', 'chiwawa.helper@yandex.ru', 'email', 'email', 'Адрес для ответов', false)

ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    setting_type = EXCLUDED.setting_type,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    is_required = EXCLUDED.is_required;

-- 7. Добавляем базовые email шаблоны
INSERT INTO email_templates (template_name, template_subject, template_html, template_variables) VALUES
('welcome', 
 'Добро пожаловать на {{serverName}}!',
 '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Добро пожаловать</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8b500; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .button { display: inline-block; background: #f8b500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Добро пожаловать на {{serverName}}!</h1>
        </div>
        <div class="content">
            <p>Привет, {{nickname}}!</p>
            <p>Добро пожаловать в наше сообщество! Мы рады видеть тебя среди нас.</p>
            <p><strong>Информация о сервере:</strong></p>
            <ul>
                <li>IP: {{serverIp}}</li>
                <li>Порт: {{serverPort}}</li>
                <li>Версия: {{serverVersion}}</li>
            </ul>
            <p>Не забудь присоединиться к нашему Discord серверу:</p>
            <p><a href="{{discordInvite}}" class="button">Присоединиться к Discord</a></p>
        </div>
        <div class="footer">
            <p>С уважением, команда {{serverName}}</p>
        </div>
    </div>
</body>
</html>',
 '["serverName", "nickname", "serverIp", "serverPort", "serverVersion", "discordInvite"]'),

('verification', 
 'Подтверждение email для {{serverName}}',
 '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Подтверждение email</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Подтверждение email</h1>
        </div>
        <div class="content">
            <p>Привет, {{nickname}}!</p>
            <p>Для завершения регистрации на {{serverName}} подтвердите ваш email адрес.</p>
            <p><a href="{{verificationLink}}" class="button">Подтвердить email</a></p>
            <p>Если кнопка не работает, скопируйте эту ссылку в браузер:</p>
            <p>{{verificationLink}}</p>
            <p><small>Ссылка действительна 24 часа.</small></p>
        </div>
        <div class="footer">
            <p>С уважением, команда {{serverName}}</p>
        </div>
    </div>
</body>
</html>',
 '["serverName", "nickname", "verificationLink"]'),

('application-approved', 
 'Ваша заявка одобрена - {{serverName}}',
 '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Заявка одобрена</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Заявка одобрена!</h1>
        </div>
        <div class="content">
            <p>Поздравляем, {{nickname}}!</p>
            <p>Ваша заявка на присоединение к {{serverName}} была рассмотрена и <strong>одобрена</strong>!</p>
            <p><strong>Данные для подключения:</strong></p>
            <ul>
                <li>IP: {{serverIp}}</li>
                <li>Порт: {{serverPort}}</li>
            </ul>
            <p>Добро пожаловать в наше сообщество!</p>
            <p>
                <a href="{{discordInvite}}" class="button">Discord сервер</a>
                <a href="{{telegramInvite}}" class="button">Telegram канал</a>
            </p>
        </div>
        <div class="footer">
            <p>С уважением, команда {{serverName}}</p>
        </div>
    </div>
</body>
</html>',
 '["serverName", "nickname", "serverIp", "serverPort", "discordInvite", "telegramInvite"]'),

('application-rejected', 
 'По вашей заявке - {{serverName}}',
 '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Решение по заявке</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f44336; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Решение по заявке</h1>
        </div>
        <div class="content">
            <p>Привет, {{nickname}}!</p>
            <p>К сожалению, ваша заявка на присоединение к {{serverName}} не была одобрена.</p>
            <p><strong>Причина:</strong> {{rejectionReason}}</p>
            <p>Вы можете подать новую заявку через некоторое время, учтя замечания.</p>
        </div>
        <div class="footer">
            <p>С уважением, команда {{serverName}}</p>
        </div>
    </div>
</body>
</html>',
 '["serverName", "nickname", "rejectionReason"]'),

('password-reset', 
 'Сброс пароля - {{serverName}}',
 '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Сброс пароля</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .button { display: inline-block; background: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Сброс пароля</h1>
        </div>
        <div class="content">
            <p>Привет, {{nickname}}!</p>
            <p>Получен запрос на сброс пароля для вашего аккаунта на {{serverName}}.</p>
            <p><a href="{{resetLink}}" class="button">Сбросить пароль</a></p>
            <p>Если кнопка не работает, скопируйте эту ссылку в браузер:</p>
            <p>{{resetLink}}</p>
            <p><small>Ссылка действительна 1 час.</small></p>
            <p><strong>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</strong></p>
        </div>
        <div class="footer">
            <p>С уважением, команда {{serverName}}</p>
        </div>
    </div>
</body>
</html>',
 '["serverName", "nickname", "resetLink"]'),

('newsletter', 
 'Новости {{serverName}} - {{newsletterSubject}}',
 '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Новости сервера</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; color: #666; }
        .button { display: inline-block; background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{newsletterSubject}}</h1>
        </div>
        <div class="content">
            <p>Привет, {{nickname}}!</p>
            <div>{{newsletterContent}}</div>
            <p><a href="{{serverWebsite}}" class="button">Посетить сайт</a></p>
        </div>
        <div class="footer">
            <p>С уважением, команда {{serverName}}</p>
            <p><small>Чтобы отписаться от рассылки, <a href="{{unsubscribeLink}}">нажмите сюда</a></small></p>
        </div>
    </div>
</body>
</html>',
 '["serverName", "nickname", "newsletterSubject", "newsletterContent", "serverWebsite", "unsubscribeLink"]')

ON CONFLICT (template_name) DO UPDATE SET
    template_subject = EXCLUDED.template_subject,
    template_html = EXCLUDED.template_html,
    template_variables = EXCLUDED.template_variables;

-- 8. Удаляем старую таблицу site_settings (если больше не нужна)
-- DROP TABLE IF EXISTS site_settings CASCADE;

-- Готово! База данных обновлена для новой системы настроек.
