const { Pool } = require('pg');
const fs = require('fs');

require('dotenv').config();

const getDbHost = () => {
    if (process.env.NODE_ENV === 'production') {
        return process.env.DB_HOST || 'localhost';
    } else {
        return process.env.DB_HOST || '212.15.49.139';
    }
}

const pool = new Pool({
    host: getDbHost(),
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'chiwawa',
    user: process.env.DB_USER || 'chiwawa',
    password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 30000,
    query_timeout: 20000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function recreateServerSettings() {
  try {
    console.log('🔍 Проверяем текущее состояние базы данных...');
    
    // Проверяем текущие настройки
    try {
      const currentSettings = await pool.query('SELECT setting_key, setting_value FROM server_settings ORDER BY setting_key');
      console.log('=== ТЕКУЩИЕ НАСТРОЙКИ ===');
      currentSettings.rows.forEach(row => {
        console.log(`${row.setting_key}: ${row.setting_value}`);
      });
      console.log(`Всего записей: ${currentSettings.rows.length}\n`);
    } catch (error) {
      console.log('Таблица server_settings не существует или недоступна\n');
    }

    console.log('💾 Создаем резервную копию...');
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS server_settings_backup AS SELECT * FROM server_settings');
      console.log('✅ Резервная копия создана\n');
    } catch (error) {
      console.log('ℹ️ Резервная копия не создана (таблица может не существовать)\n');
    }

    console.log('🗑️ Удаляем старую таблицу...');
    await pool.query('DROP TABLE IF EXISTS server_settings');
    console.log('✅ Старая таблица удалена\n');

    console.log('🏗️ Создаем новую таблицу...');
    await pool.query(`
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
      )
    `);
    console.log('✅ Новая таблица создана\n');

    console.log('📝 Вставляем базовые настройки...');
    const settings = [
      // Основные настройки сервера (kebab-case)
      ['server-name', 'ChiwawaMine', 'string', 'general', 'Название сервера'],
      ['server-description', 'Лучший Minecraft сервер с дружелюбным сообществом', 'string', 'general', 'Описание сервера'],
      ['server-ip', 'play.chiwawa.site', 'string', 'general', 'IP адрес сервера'],
      ['server-port', '25565', 'integer', 'general', 'Порт сервера'],
      ['max-players', '100', 'integer', 'general', 'Максимальное количество игроков'],
      ['discord-invite', 'https://discord.gg/chiwawa', 'string', 'general', 'Ссылка на Discord сервер'],
      ['telegram-invite', 'https://t.me/chiwawa', 'string', 'general', 'Ссылка на Telegram канал'],

      // Системные настройки
      ['maintenance-mode', 'false', 'boolean', 'system', 'Режим технического обслуживания'],
      ['registration-enabled', 'true', 'boolean', 'system', 'Разрешена ли регистрация новых пользователей'],
      ['auto-backup-enabled', 'true', 'boolean', 'system', 'Автоматическое создание резервных копий'],

      // Настройки заявок
      ['applications-enabled', 'true', 'boolean', 'applications', 'Прием заявок включен'],
      ['min-motivation-length', '50', 'integer', 'applications', 'Минимальная длина мотивации'],
      ['min-plans-length', '30', 'integer', 'applications', 'Минимальная длина планов'],
      ['max-applications-per-day', '3', 'integer', 'applications', 'Максимум заявок в день с одного IP'],
      ['auto-approve-trust-level', '2', 'integer', 'applications', 'Автоматическое одобрение при Trust Level'],

      // Trust Level система
      ['trust-points-email', '50', 'integer', 'trust', 'Очки за подтверждение email'],
      ['trust-points-discord', '30', 'integer', 'trust', 'Очки за привязку Discord'],
      ['trust-points-hour', '5', 'integer', 'trust', 'Очки за час игры'],
      ['trust-level-1-required', '100', 'integer', 'trust', 'Очки для достижения Trust Level 1'],
      ['trust-level-2-required', '500', 'integer', 'trust', 'Очки для достижения Trust Level 2'],
      ['trust-level-3-required', '1500', 'integer', 'trust', 'Очки для достижения Trust Level 3'],

      // Настройки безопасности
      ['max-login-attempts', '5', 'integer', 'security', 'Максимум попыток входа'],
      ['login-lockout-duration', '15', 'integer', 'security', 'Время блокировки в минутах'],
      ['jwt-expires-days', '30', 'integer', 'security', 'Время жизни JWT токена в днях'],
      ['require-email-verification', 'true', 'boolean', 'security', 'Требовать подтверждение email'],
      ['two-factor-enabled', 'false', 'boolean', 'security', 'Двухфакторная аутентификация'],
      ['rate-limit-requests', '100', 'integer', 'security', 'Лимит запросов в минуту'],

      // Email настройки
      ['smtp-host', 'smtp.yandex.ru', 'string', 'email', 'SMTP сервер'],
      ['smtp-port', '465', 'integer', 'email', 'SMTP порт'],
      ['smtp-from', 'noreply@chiwawa.site', 'string', 'email', 'Email отправителя'],
      ['smtp-user', '', 'string', 'email', 'SMTP пользователь'],
      ['smtp-password', '', 'string', 'email', 'SMTP пароль'],
      ['smtp-tls', 'true', 'boolean', 'email', 'Использовать TLS/SSL'],
      ['smtp-sender-name', 'ChiwawaMine', 'string', 'email', 'Имя отправителя'],
      ['smtp-reply-to', '', 'string', 'email', 'Reply-To адрес'],
      ['email-notifications-enabled', 'true', 'boolean', 'email', 'Email уведомления включены'],
      ['smtp-timeout', '30', 'integer', 'email', 'Тайм-аут SMTP в секундах']
    ];

    for (const [key, value, type, category, description] of settings) {
      await pool.query(`
        INSERT INTO server_settings (setting_key, setting_value, setting_type, category, description) 
        VALUES ($1, $2, $3, $4, $5)
      `, [key, value, type, category, description]);
    }

    console.log(`✅ Вставлено ${settings.length} настроек\n`);

    console.log('📊 Результат:');
    const result = await pool.query('SELECT setting_key, setting_value, category FROM server_settings ORDER BY category, setting_key');
    result.rows.forEach(row => {
      console.log(`[${row.category}] ${row.setting_key}: ${row.setting_value}`);
    });
    console.log(`\n🎉 Успешно пересоздана таблица с ${result.rows.length} настройками!`);

    await pool.end();
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

recreateServerSettings();
