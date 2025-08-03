// Тест обновления профиля
// Создатель: ebluffy

const fetch = require('node-fetch');

async function testProfileUpdate() {
    const baseUrl = 'http://localhost:3000';
    
    // Тестовые данные (нужно подставить реальный токен)
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGltYTJfMDVAbWFpbC5ydSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1NDE5MjI4MywiZXhwIjoxNzU0Mjc4NjgzfQ.UHf3mDkxQyXrZImok_gderXVqvcHZf2VDXJmndImAcI';
    
    console.log('🧪 Тестирование обновления профиля...\n');
    
    try {
        // Тест 1: Обновление возраста и био
        console.log('1️⃣ Тест обновления возраста и био:');
        const updateData = {
            age: 25,
            bio: 'Тестовая биография пользователя'
        };
        
        const response = await fetch(`${baseUrl}/api/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testToken}`
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('  ✅ Профиль успешно обновлен');
            console.log(`  📊 Обновленные поля: возраст=${result.user.age}, био=${result.user.bio ? 'установлена' : 'не установлена'}`);
        } else {
            const error = await response.json();
            console.log('  ❌ Ошибка обновления:', error.error);
            console.log('  📝 Детали:', error.details || 'нет');
        }
        
    } catch (error) {
        console.log('  ❌ Ошибка сети:', error.message);
    }
    
    console.log('\n💡 Для полного тестирования замените YOUR_AUTH_TOKEN_HERE на реальный токен из localStorage');
}

testProfileUpdate();
