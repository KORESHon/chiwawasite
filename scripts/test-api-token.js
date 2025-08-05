// Тест нового API токена
const axios = require('axios');

async function testApiToken() {
    const token = 'f5b92bb14934744b58fb0745b7a462c2caea5069fba26edb7baa5fa95db68f7dbbe317333d5fb8826934262421723e52c96df15ef8b0f89bdd21025d2710e678';
    
    try {
        console.log('🧪 Тестируем новый долгосрочный API токен...');
        
        const response = await axios.get('http://localhost:3000/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('✅ Токен действительный!');
        console.log(`👤 Пользователь: ${response.data.user.nickname}`);
        console.log(`🔑 Роль: ${response.data.user.role}`);
        console.log(`📊 Trust Level: ${response.data.user.trust_level}`);
        
        // Тестируем доступ к API админа
        console.log('\n🔧 Тестируем доступ к административному API...');
        const usersResponse = await axios.get('http://localhost:3000/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log(`✅ Доступ к API админа работает! Найдено пользователей: ${usersResponse.data.users.length}`);
        
    } catch (error) {
        console.error('❌ Ошибка:', error.response ? error.response.data : error.message);
    }
}

testApiToken();
