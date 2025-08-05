const axios = require('axios');

console.log('🧪 Тестируем логику отображения данных сервера');
console.log('==============================================');

async function testServerData() {
    try {
        console.log('📡 Проверяем публичный endpoint...');
        
        const response = await axios.get('http://localhost:3000/api/settings/server-info');
        const data = response.data;
        
        console.log('✅ Статус ответа:', response.status);
        console.log('🔍 Анализируем данные:');
        console.log('');
        
        console.log('📊 ОСНОВНАЯ ИНФОРМАЦИЯ:');
        console.log('   Статус:', data.status);
        console.log('   Онлайн:', data.online);
        console.log('   Название:', data.server?.name);
        console.log('   IP:', data.server?.ip + ':' + data.server?.port);
        console.log('   Версия:', data.server?.version);
        console.log('   MOTD:', data.server?.motd);
        console.log('');
        
        console.log('⚡ ПРОИЗВОДИТЕЛЬНОСТЬ:');
        console.log('   Ping:', data.performance?.ping + 'ms');
        console.log('   TPS:', data.performance?.tps);
        console.log('');
        
        console.log('👥 ИГРОКИ:');
        console.log('   Онлайн:', data.players?.online + '/' + data.players?.max);
        console.log('   Список игроков:', data.players?.list?.length || 0);
        console.log('');
        
        // Логика проверки
        console.log('🔍 ПРОВЕРКА ЛОГИКИ:');
        
        if (data.online === false) {
            console.log('✅ Сервер offline - проверяем что показываются правильные данные:');
            
            if (data.performance.ping === 0 && data.performance.tps === 0) {
                console.log('   ✅ Производительность обнулена');
            } else {
                console.log('   ❌ Производительность показывает ложные данные');
            }
            
            if (data.players.online === 0) {
                console.log('   ✅ Игроки offline');
            } else {
                console.log('   ❌ Показывает игроков когда сервер выключен');
            }
            
            if (data.server.version === 'Unknown') {
                console.log('   ✅ Версия показана как Unknown');
            } else {
                console.log('   ⚠️  Версия показывается даже когда сервер выключен');
            }
            
        } else {
            console.log('✅ Сервер online - показываются актуальные данные:');
            console.log('   📡 Ping:', data.performance.ping + 'ms');
            console.log('   📈 TPS:', data.performance.tps);
            console.log('   👥 Игроки:', data.players.online);
            console.log('   🎮 Версия:', data.server.version);
        }
        
        console.log('');
        console.log('🕐 Время обновления:', data.timestamp);
        
    } catch (error) {
        console.log('❌ Ошибка:', error.message);
    }
}

testServerData();
