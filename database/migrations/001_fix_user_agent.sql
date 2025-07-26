-- Обновление схемы user_sessions для исправления ошибки с user_agent

-- Изменяем тип поля user_agent с VARCHAR(255) на TEXT для поддержки длинных user agent строк
ALTER TABLE user_sessions ALTER COLUMN user_agent TYPE TEXT;
