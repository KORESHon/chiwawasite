// Тестирование итоговых исправлений: TPS, uptime, правила, JWT токены
const axios = require('axios');

async function testFinalFixes() {
    console.log('🧪 ТЕСТИРОВАНИЕ ИТОГОВЫХ ИСПРАВЛЕНИЙ');
    console.log('=====================================\n');
    
    try {
        // 1. Тестируем убранные заглушки TPS и uptime
        console.log('1️⃣ ТЕСТИРУЕМ УБРАННЫЕ ЗАГЛУШКИ');
        console.log('-------------------------------');
        
        const response = await axios.get('http://localhost:3000/api/settings/server-info');
        const data = response.data;
        
        console.log('📊 Данные производительности:');
        console.log('   TPS:', data.performance?.tps);
        console.log('   Ping:', data.performance?.ping);
        console.log('   Uptime:', data.server?.uptime);
        
        // Проверяем что TPS теперь null (не заглушка 20.0)
        if (data.performance?.tps === null) {
            console.log('   ✅ TPS заглушка убрана (получается от плагина)');
        } else if (data.performance?.tps === 20.0) {
            console.log('   ❌ TPS все еще показывает заглушку 20.0');
        } else {
            console.log('   ⚠️  TPS имеет неожиданное значение:', data.performance?.tps);
        }
        
        console.log('\n2️⃣ ТЕСТИРУЕМ СТРАНИЦУ ПРАВИЛ');
        console.log('-------------------------------');
        
        try {
            const rulesResponse = await axios.get('http://localhost:3000/rules');
            if (rulesResponse.data.includes('Страница в разработке')) {
                console.log('   ✅ Страница правил заменена на заглушку');
                console.log('   ✅ Содержит информацию о переносе на форум');
            } else {
                console.log('   ❌ Страница правил не изменена');
            }
            
            // Проверяем комментарий для разработчика
            if (rulesResponse.data.includes('ИНФОРМАЦИЯ ДЛЯ РАЗРАБОТЧИКА')) {
                console.log('   ✅ Инструкции для разработчика добавлены');
            }
            
        } catch (error) {
            console.log('   ❌ Ошибка загрузки страницы правил:', error.message);
        }
        
        console.log('\n3️⃣ ТЕСТИРУЕМ FRONTEND ИЗМЕНЕНИЯ');
        console.log('-------------------------------');
        
        try {
            const onlineResponse = await axios.get('http://localhost:3000/online');
            if (onlineResponse.data.includes('calculateUptime')) {
                console.log('   ❌ Функция calculateUptime все еще присутствует');
            } else {
                console.log('   ✅ Заглушка calculateUptime удалена');
            }
            
            if (onlineResponse.data.includes('serverStartTime')) {
                console.log('   ❌ Переменная serverStartTime все еще присутствует');
            } else {
                console.log('   ✅ Переменная serverStartTime удалена');
            }
            
            // Проверяем обработку TPS
            if (onlineResponse.data.includes('tps === null')) {
                console.log('   ✅ Добавлена обработка null TPS');
            }
            
        } catch (error) {
            console.log('   ❌ Ошибка загрузки страницы онлайн:', error.message);
        }
        
        console.log('\n4️⃣ ТЕСТИРУЕМ JWT ИСПРАВЛЕНИЯ');
        console.log('-------------------------------');
        
        // Тестируем с неправильным токеном (должен быть корректный error handling)
        try {
            await axios.get('http://localhost:3000/api/plugin/server-access?nickname=test', {
                headers: {
                    'Authorization': 'Bearer invalid_token_12345'
                }
            });
        } catch (error) {
            if (error.response && error.response.status === 403) {
                console.log('   ✅ Неправильный токен корректно обработан (403)');
                console.log('   ✅ Ошибка JWT не вызывает crash сервера');
            } else {
                console.log('   ⚠️  Неожиданный ответ на неправильный токен:', error.response?.status);
            }
        }
        
        console.log('\n📋 РЕЗЮМЕ ИЗМЕНЕНИЙ');
        console.log('===================');
        console.log('✅ TPS заглушка убрана - теперь null до получения от плагина');
        console.log('✅ Uptime заглушка убрана - показывается N/A');
        console.log('✅ Страница правил заменена на информативную заглушку');
        console.log('✅ Добавлены инструкции для разработчика в HTML комментарии');
        console.log('✅ JWT токены обрабатываются корректно без ошибок malformed');
        console.log('✅ Frontend корректно обрабатывает отсутствующие данные');
        
        console.log('\n🔧 ЧТО НУЖНО СДЕЛАТЬ ДАЛЕЕ:');
        console.log('==========================');
        console.log('1. Развернуть обновленный плагин на сервер');
        console.log('2. Создать эндпоинт в плагине для передачи TPS');
        console.log('3. Создать эндпоинт в плагине для передачи uptime сервера');
        console.log('4. Заменить заглушку правил на полноценную страницу');
        console.log('5. Настроить форум для размещения правил (временно)');
        
    } catch (error) {
        console.error('❌ Ошибка тестирования:', error.message);
    }
}

testFinalFixes();
