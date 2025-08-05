const axios = require('axios');

async function testApiToken() {
    const token = 'f5b92bb14934744b58fb0745b7a462c2caea5069fba26edb7baa5fa95db68f7dbbe317333d5fb8826934262421723e52c96df15ef8b0f89bdd21025d2710e678';
    
    try {
        console.log('🔍 Тестируем API токен для плагина...');
        
        const response = await axios.get('http://localhost:3000/api/plugin/server-info', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Токен работает!');
        console.log('📊 Данные сервера:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('❌ Ошибка:', error.response ? error.response.data : error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Headers:', error.response.headers);
        }
    }
}

testApiToken();
