const { Pool } = require('pg');
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

async function testMainPageSettings() {
    try {
        console.log('🏠 Тестируем настройки для главной страницы...\n');

        // Проверяем настройки, которые использует главная страница
        const publicSettings = ['server-name', 'server-description', 'server-ip', 'server-port', 'discord-invite', 'telegram-invite'];
        
        console.log('📋 Публичные настройки для главной страницы:');
        for (const settingKey of publicSettings) {
            try {
                const result = await pool.query('SELECT setting_value FROM server_settings WHERE setting_key = $1', [settingKey]);
                if (result.rows.length > 0) {
                    console.log(`✅ ${settingKey}: ${result.rows[0].setting_value}`);
                } else {
                    console.log(`❌ ${settingKey}: НЕ НАЙДЕНО`);
                }
            } catch (error) {
                console.log(`❌ ${settingKey}: ОШИБКА - ${error.message}`);
            }
        }

        // Симулируем API endpoint /api/settings/public
        console.log('\n🌐 Симуляция /api/settings/public:');
        const publicSettingsQuery = await pool.query(`
            SELECT setting_key, setting_value 
            FROM server_settings 
            WHERE setting_key IN ('server-name', 'server-description', 'server-ip', 'server-port', 'discord-invite', 'telegram-invite')
        `);

        const publicSettingsResult = {};
        publicSettingsQuery.rows.forEach(row => {
            publicSettingsResult[row.setting_key] = row.setting_value;
        });

        console.log('API ответ:', JSON.stringify(publicSettingsResult, null, 2));

        // Проверяем, что название сервера можно изменить
        console.log('\n🔄 Тестируем изменение названия сервера...');
        const testName = 'ChiwawaMine-Updated-' + Date.now();
        
        await pool.query('UPDATE server_settings SET setting_value = $1 WHERE setting_key = $2', [testName, 'server-name']);
        console.log(`💾 Название изменено на: ${testName}`);

        const updatedResult = await pool.query('SELECT setting_value FROM server_settings WHERE setting_key = $1', ['server-name']);
        console.log(`📖 Прочитано из базы: ${updatedResult.rows[0].setting_value}`);

        if (updatedResult.rows[0].setting_value === testName) {
            console.log('✅ Изменение успешно!');
        } else {
            console.log('❌ Ошибка изменения!');
        }

        // Восстанавливаем
        await pool.query('UPDATE server_settings SET setting_value = $1 WHERE setting_key = $2', ['ChiwawaMine', 'server-name']);
        console.log('🔄 Название восстановлено');

        console.log('\n🎉 Тест завершен! База данных готова для работы с главной страницей и админкой.');

        await pool.end();
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

testMainPageSettings();
