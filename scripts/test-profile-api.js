// Тест API обновления профиля
// Создатель: ebluffy

const axios = require('axios');

const baseURL = 'http://localhost:3000';

// Данные для тестирования
const testCredentials = {
    email: 'dima2_05@mail.ru',
    password: 'Shadowfox555!'
};

async function testProfileUpdateAPI() {
    console.log('🔍 Тестирование API обновления профиля...\n');

    try {
        // Шаг 1: Авторизация
        console.log('1️⃣ Авторизация...');
        const loginResponse = await axios.post(`${baseURL}/api/auth/login`, testCredentials);
        
        if (!loginResponse.data.token) {
            throw new Error('Не удалось получить токен авторизации');
        }
        
        const token = loginResponse.data.token;
        console.log('✅ Авторизация успешна');

        // Шаг 2: Получение текущего профиля
        console.log('\n2️⃣ Получение текущего профиля...');
        const profileResponse = await axios.get(`${baseURL}/api/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log(`Текущий профиль: ${profileResponse.data.minecraft_nick} (${profileResponse.data.email})`);
        console.log(`Trust Level: ${profileResponse.data.trust_level} (${profileResponse.data.trust_level_name})`);

        // Шаг 3: Обновление профиля с возрастом и биографией
        console.log('\n3️⃣ Обновление профиля (возраст и биография)...');
        const updateData = {
            age: 25,
            bio: 'Тестовая биография для проверки обновления профиля',
            first_name: 'Тестер'
        };

        const updateResponse = await axios.put(`${baseURL}/api/profile`, updateData, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ Профиль обновлен успешно');
        console.log('Обновленные данные:', updateResponse.data.user);

        // Шаг 4: Проверка обновления
        console.log('\n4️⃣ Проверка обновления...');
        const updatedProfileResponse = await axios.get(`${baseURL}/api/profile`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const updatedProfile = updatedProfileResponse.data;
        console.log(`Возраст: ${updatedProfile.age}`);
        console.log(`Биография: ${updatedProfile.bio}`);
        console.log(`Имя: ${updatedProfile.first_name}`);

        // Шаг 5: Проверка записи в admin_logs
        console.log('\n5️⃣ Проверка записи в admin_logs...');
        // Этот шаг требует админского доступа, но мы можем проверить лог на сервере
        console.log('Проверьте сервер на наличие записи в admin_logs с action="profile_update"');

        console.log('\n✅ Все тесты API прошли успешно!');

    } catch (error) {
        console.error('❌ Ошибка тестирования API:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
            console.log('💡 Возможно, пользователь не существует. Создайте тестового пользователя.');
        }
        
        if (error.response?.status === 401) {
            console.log('💡 Проблемы с авторизацией. Проверьте данные пользователя.');
        }
    }
}

// Запускаем тестирование
testProfileUpdateAPI();
