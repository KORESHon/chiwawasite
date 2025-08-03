// Генерация JWT токена для плагина
// Создатель: GitHub Copilot

const axios = require('axios');

async function generatePluginToken() {
    try {
        console.log('🔧 Генерируем JWT токен для Minecraft плагина...');
        
        // Авторизуемся как администратор
        console.log('🔐 Авторизация администратора...');
        const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'dima2_05@mail.ru',
            password: 'Shadowfox555!'
        });
        
        if (loginResponse.status === 200) {
            const token = loginResponse.data.token;
            console.log('✅ Авторизация успешна!');
            console.log('🎫 JWT токен для плагина:');
            console.log(token);
            console.log('');
            console.log('📋 Скопируйте этот токен в config.yml плагина в поле admin_token');
            console.log('');
            
            // Проверим токен
            console.log('🧪 Проверяем токен...');
            const verifyResponse = await axios.get('http://localhost:3000/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (verifyResponse.status === 200) {
                console.log('✅ Токен действительный!');
                console.log(`👤 Пользователь: ${verifyResponse.data.user.nickname}`);
                console.log(`🔑 Роль: ${verifyResponse.data.user.role}`);
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

// Запускаем генерацию
generatePluginToken();
