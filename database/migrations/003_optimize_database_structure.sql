-- Миграция для оптимизации структуры базы данных
-- Цель: удалить неиспользуемые таблицы и колонки, привести к стандартной схеме
-- Дата: 2025-07-28

BEGIN;

-- 1. Добавляем недостающие колонки в существующие таблицы

-- Добавляем created_by в email_templates если её нет
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'email_templates' AND column_name = 'created_by') THEN
        ALTER TABLE email_templates ADD COLUMN created_by INTEGER REFERENCES users(id);
    END IF;
END $$;

-- 2. Создаем недостающие таблицы если их нет

-- Таблица site_settings (если server_settings используется по-другому)
CREATE TABLE IF NOT EXISTS site_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Унифицируем настройки сервера
-- Переносим данные из server_settings в site_settings если нужно
INSERT INTO site_settings (key, value, description, category, updated_at)
SELECT 
    setting_key,
    setting_value,
    'Настройка сервера',
    CASE 
        WHEN setting_key LIKE 'smtp%' THEN 'email'
        WHEN setting_key LIKE 'server%' THEN 'general'
        WHEN setting_key LIKE 'discord%' OR setting_key LIKE 'telegram%' THEN 'social'
        ELSE 'system'
    END,
    NOW()
FROM server_settings
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = server_settings.setting_key);

-- 4. Удаляем неиспользуемые таблицы (осторожно!)
-- Закомментированы для безопасности - раскомментируйте если уверены

-- DROP TABLE IF EXISTS reputation_log CASCADE;
-- DROP TABLE IF EXISTS user_reputation CASCADE; 
-- DROP TABLE IF EXISTS trust_level_applications CASCADE;

-- 5. Добавляем индексы для оптимизации производительности

-- Индексы для server_settings
CREATE INDEX IF NOT EXISTS idx_server_settings_key ON server_settings(setting_key);

-- Индексы для site_settings  
CREATE INDEX IF NOT EXISTS idx_site_settings_category ON site_settings(category);
CREATE INDEX IF NOT EXISTS idx_site_settings_updated_at ON site_settings(updated_at);

-- Индексы для email_templates
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(template_name);

-- 6. Обновляем статистику таблиц
ANALYZE users;
ANALYZE server_settings;
ANALYZE email_templates;
ANALYZE applications;

-- 7. Добавляем начальные настройки если их нет
INSERT INTO site_settings (key, value, description, category) VALUES
('maintenance_mode', 'false', 'Режим технических работ', 'system'),
('email_templates_enabled', 'true', 'Включена ли система шаблонов email', 'email'),
('user_registration_enabled', 'true', 'Разрешена ли регистрация новых пользователей', 'general'),
('max_users_per_day', '50', 'Максимум регистраций в день', 'limits')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Лог выполнения
DO $$
BEGIN
    INSERT INTO admin_logs (admin_id, action, details) VALUES
    (1, 'database_migration', 'Выполнена миграция 003: оптимизация структуры БД');
EXCEPTION WHEN OTHERS THEN
    -- Игнорируем ошибку если admin_logs не существует
    NULL;
END $$;

-- Вывод статистики
SELECT 
    'Миграция 003 завершена' as status,
    (SELECT count(*) FROM users) as total_users,
    (SELECT count(*) FROM server_settings) as server_settings_count,
    (SELECT count(*) FROM email_templates) as email_templates_count;
