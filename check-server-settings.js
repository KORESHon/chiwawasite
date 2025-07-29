// Скрипт для проверки настроек сервера в базе данных
const db = require('./database/connection');

async function checkServerSettings() {
    try {
        console.log('Проверяем настройки сервера в базе данных...');
        
        // Получаем все настройки
        const result = await db.query('SELECT setting_key, setting_value FROM server_settings ORDER BY setting_key');
        
        console.log('\n=== Все настройки в таблице server_settings ===');
        if (result.rows.length === 0) {
            console.log('❌ Таблица server_settings пуста!');
        } else {
            result.rows.forEach(row => {
                console.log(`${row.setting_key}: ${row.setting_value}`);
            });
        }
        
        // Проверяем конкретно server-name
        const nameResult = await db.query('SELECT setting_value FROM server_settings WHERE setting_key = $1', ['server-name']);
        
        console.log('\n=== Проверка server-name ===');
        if (nameResult.rows.length === 0) {
            console.log('❌ Настройка "server-name" не найдена в базе данных!');
            console.log('Добавляем настройку по умолчанию...');
            
            // Добавляем настройку
            await db.query(
                'INSERT INTO server_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2',
                ['server-name', 'Chiwawa']
            );
            console.log('✅ Настройка "server-name" добавлена со значением "Chiwawa"');
        } else {
            console.log(`✅ server-name: ${nameResult.rows[0].setting_value}`);
        }
        
        // Проверяем другие важные настройки
        const importantSettings = [
            ['server-description', 'Приватный Minecraft сервер с дружелюбным сообществом'],
            ['server-ip', 'play.chiwawa.site'],
            ['server-port', '25565'],
            ['discord-invite', 'https://discord.gg/chiwawa'],
            ['telegram-invite', 'https://t.me/chiwawa']
        ];
        
        console.log('\n=== Проверка важных настроек ===');
        for (const [key, defaultValue] of importantSettings) {
            const settingResult = await db.query('SELECT setting_value FROM server_settings WHERE setting_key = $1', [key]);
            
            if (settingResult.rows.length === 0) {
                console.log(`❌ Настройка "${key}" не найдена, добавляем...`);
                await db.query(
                    'INSERT INTO server_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2',
                    [key, defaultValue]
                );
                console.log(`✅ ${key}: ${defaultValue} (добавлено)`);
            } else {
                console.log(`✅ ${key}: ${settingResult.rows[0].setting_value}`);
            }
        }
        
        console.log('\n=== Тест API endpoint ===');
        console.log('Симуляция ответа /api/settings/public:');
        
        const finalResult = await db.query('SELECT setting_key, setting_value FROM server_settings');
        const settings = {};
        
        finalResult.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        const apiResponse = {
            serverName: settings['server-name'] || 'Test',
            serverDescription: settings['server-description'] || 'Приватный Minecraft сервер с дружелюбным сообществом',
            serverIp: settings['server-ip'] || 'play.chiwawa.site',
            serverPort: settings['server-port'] || '25565',
            discordInvite: settings['discord-invite'] || 'https://discord.gg/chiwawa',
            telegramInvite: settings['telegram-invite'] || 'https://t.me/chiwawa'
        };
        
        console.log(JSON.stringify(apiResponse, null, 2));
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        process.exit(0);
    }
}

checkServerSettings();
