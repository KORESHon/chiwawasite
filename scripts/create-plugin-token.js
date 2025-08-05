// Создание долгосрочного API токена для плагина
// Создатель: GitHub Copilot

const axios = require('axios');

async function createPluginToken() {
    try {
        console.log('🔧 Создаем долгосрочный API токен для Minecraft плагина...');
        
        // Авторизуемся как администратор
        console.log('🔐 Авторизация администратора...');
        const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'dima2_05@mail.ru',
            password: 'Shadowfox555!'
        });
        
        if (loginResponse.status === 200) {
            const authToken = loginResponse.data.token;
            console.log('✅ Авторизация успешна!');
            
            // Создаем долгосрочный токен для плагина
            console.log('🎫 Создание долгосрочного токена...');
            const tokenResponse = await axios.post('http://localhost:3000/api/admin/api-tokens/plugin', {
                name: 'Minecraft Plugin Token (ChiwawaPlugin)'
            }, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (tokenResponse.status === 200) {
                const tokenData = tokenResponse.data.token;
                console.log('✅ Долгосрочный токен создан успешно!');
                console.log('');
                console.log('🎫 API ТОКЕН ДЛЯ ПЛАГИНА:');
                console.log(tokenData.full_token);
                console.log('');
                console.log('📋 ИНСТРУКЦИИ:');
                console.log('1. Скопируйте токен выше');
                console.log('2. Откройте config.yml плагина');
                console.log('3. Замените значение admin_token на новый токен');
                console.log('4. Перезапустите плагин или сервер');
                console.log('');
                console.log('ℹ️  ОСОБЕННОСТИ:');
                console.log('- Токен НЕ ИСТЕКАЕТ (бессрочный)');
                console.log('- Токен можно отозвать через админ-панель');
                console.log('- Токен имеет ограниченные права только для плагина');
                console.log('');
                console.log(`📊 Информация о токене:`);
                console.log(`   Название: ${tokenData.name}`);
                console.log(`   ID: ${tokenData.id}`);
                console.log(`   Префикс: ${tokenData.prefix}...`);
                console.log(`   Создан: ${new Date(tokenData.created_at).toLocaleString()}`);
                console.log(`   Права: ${tokenData.permissions.join(', ')}`);
                
            } else {
                console.log('❌ Ошибка создания токена');
            }
            
        } else {
            console.log('❌ Ошибка авторизации');
        }
        
    } catch (error) {
        if (error.response) {
            console.error(`❌ HTTP Error ${error.response.status}:`, error.response.data);
        } else {
            console.error('❌ Ошибка соединения:', error.message);
        }
    }
}

// Запускаем создание токена
createPluginToken();
