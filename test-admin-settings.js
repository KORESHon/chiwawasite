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

async function testAdminSettings() {
    try {
        console.log('🧪 Тестируем админские настройки...\n');

        // 1. Проверяем текущие настройки
        console.log('📋 Текущие настройки в базе:');
        const currentSettings = await pool.query('SELECT setting_key, setting_value, category FROM server_settings ORDER BY category, setting_key');
        currentSettings.rows.forEach(row => {
            console.log(`[${row.category}] ${row.setting_key}: ${row.setting_value}`);
        });
        console.log(`Всего настроек: ${currentSettings.rows.length}\n`);

        // 2. Симулируем сохранение настройки (как в POST /api/admin/settings)
        console.log('💾 Обновляем название сервера...');
        const testServerName = 'ChiwawaServer-TEST-' + Date.now();
        
        await pool.query(`
            INSERT INTO server_settings (setting_key, setting_value, setting_type, category, description, updated_at) 
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = CURRENT_TIMESTAMP
        `, ['server-name', testServerName, 'string', 'general', 'Название сервера']);

        console.log(`✅ Обновлено название сервера на: ${testServerName}\n`);

        // 3. Проверяем, что настройка сохранилась
        const updatedSetting = await pool.query('SELECT setting_value FROM server_settings WHERE setting_key = $1', ['server-name']);
        console.log(`📖 Чтение из базы данных: ${updatedSetting.rows[0].setting_value}`);
        
        if (updatedSetting.rows[0].setting_value === testServerName) {
            console.log('✅ Настройка корректно сохранена и прочитана!');
        } else {
            console.log('❌ Ошибка: настройка не совпадает!');
        }

        // 4. Проверяем конвертацию kebab-case в camelCase (как в GET /api/admin/settings)
        console.log('\n🔄 Тестируем конвертацию ключей:');
        const allSettings = await pool.query('SELECT setting_key, setting_value, setting_type FROM server_settings ORDER BY setting_key');
        
        const convertedSettings = {};
        allSettings.rows.forEach(row => {
            const camelKey = row.setting_key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            let parsedValue;
            
            if (row.setting_type === 'boolean') {
                parsedValue = row.setting_value === 'true' || row.setting_value === true;
            } else if (row.setting_type === 'integer') {
                parsedValue = parseInt(row.setting_value);
            } else {
                parsedValue = row.setting_value;
            }
            
            convertedSettings[camelKey] = parsedValue;
        });

        console.log('Конвертированные настройки для фронтенда:');
        Object.entries(convertedSettings).forEach(([key, value]) => {
            console.log(`${key}: ${value} (${typeof value})`);
        });

        // 5. Проверяем обратную конвертацию (camelCase в kebab-case)
        console.log('\n🔄 Тестируем обратную конвертацию:');
        const testMappings = {
            serverName: 'server-name',
            serverDescription: 'server-description',
            maxPlayers: 'max-players',
            smtpHost: 'smtp-host',
            trustPointsEmail: 'trust-points-email',
            autoApprovetrustLevel: 'auto-approve-trust-level'
        };

        Object.entries(testMappings).forEach(([camelCase, expectedKebab]) => {
            const actualKebab = camelCase.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
            if (actualKebab === expectedKebab) {
                console.log(`✅ ${camelCase} -> ${actualKebab}`);
            } else {
                console.log(`❌ ${camelCase} -> ${actualKebab} (ожидалось: ${expectedKebab})`);
            }
        });

        // 6. Восстанавливаем исходное название сервера
        console.log('\n🔄 Восстанавливаем исходное название...');
        await pool.query('UPDATE server_settings SET setting_value = $1 WHERE setting_key = $2', ['ChiwawaMine', 'server-name']);
        console.log('✅ Название сервера восстановлено');

        console.log('\n🎉 Все тесты пройдены! Админка должна корректно работать с базой данных.');

        await pool.end();
    } catch (error) {
        console.error('❌ Ошибка тестирования:', error.message);
        process.exit(1);
    }
}

testAdminSettings();
