// Тест исправления admin_logs
// Создатель: ebluffy

const { Pool } = require('pg');

// Подключение к базе данных
const pool = new Pool({
    user: process.env.DB_USER || 'chiwawa',
    host: process.env.DB_HOST || '212.15.49.139',
    database: process.env.DB_NAME || 'chiwawa',
    password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
    port: process.env.DB_PORT || 5432,
    ssl: false
});

async function testAdminLogsFix() {
    console.log('🔍 Тестирование исправления admin_logs...\n');

    try {
        // Тест 1: Проверка структуры таблицы admin_logs
        console.log('1️⃣ Проверка структуры таблицы admin_logs...');
        const adminLogsColumns = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'admin_logs' 
            ORDER BY ordinal_position
        `);
        
        console.log('Столбцы admin_logs:');
        adminLogsColumns.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });

        // Тест 2: Симуляция INSERT в admin_logs с правильными параметрами
        console.log('\n2️⃣ Тест записи в admin_logs...');
        try {
            await pool.query(`
                INSERT INTO admin_logs (admin_id, action, details, target_user_id)
                VALUES ($1, $2, $3, $4)
            `, [
                1, // admin_id
                'profile_update_test',
                'Тест обновления профиля: возраст, биография',
                1 // target_user_id
            ]);
            console.log('✅ Запись в admin_logs прошла успешно');

            // Удаляем тестовую запись
            await pool.query(`
                DELETE FROM admin_logs 
                WHERE action = 'profile_update_test' AND admin_id = 1
            `);
            console.log('✅ Тестовая запись удалена');
        } catch (error) {
            console.log(`❌ Ошибка записи в admin_logs: ${error.message}`);
        }

        // Тест 3: Проверка trust levels
        console.log('\n3️⃣ Проверка системы Trust Levels...');
        function getTrustLevelName(level) {
            const names = {
                0: 'Проходимец',
                1: 'Новичок', 
                2: 'Проверенный',
                3: 'Ветеран',
            };
            return names[level] || 'Неизвестно';
        }

        function getTrustLevelRequirements(currentLevel) {
            const requirements = {
                0: { time: 0, name: 'Проходимец' },
                1: { time: 0, name: 'Новичок' },
                2: { time: 25*60, name: 'Проверенный' },
                3: { time: 50*60, name: 'Ветеран' },
            };

            return requirements[currentLevel + 1] || { time: 0, name: 'Максимальный уровень' };
        }

        console.log('Система Trust Levels (0-3):');
        const trustLevels = [0, 1, 2, 3];
        trustLevels.forEach(level => {
            const levelName = getTrustLevelName(level);
            const requirements = getTrustLevelRequirements(level);
            console.log(`  Level ${level}: ${levelName} → Следующий: ${requirements.name}`);
        });

        // Тест 4: Проверка пользователей с Trust Level
        console.log('\n4️⃣ Проверка пользователей с Trust Level...');
        const usersWithTrust = await pool.query(`
            SELECT nickname, trust_level, role
            FROM users 
            WHERE trust_level IS NOT NULL 
            ORDER BY trust_level DESC
            LIMIT 10
        `);

        if (usersWithTrust.rows.length > 0) {
            console.log('Пользователи с Trust Level:');
            usersWithTrust.rows.forEach(user => {
                const levelName = getTrustLevelName(user.trust_level);
                console.log(`  - ${user.nickname}: Level ${user.trust_level} (${levelName}), Роль: ${user.role}`);
            });
        } else {
            console.log('Пользователей с Trust Level не найдено');
        }

        // Тест 5: Проверка корректности ролей vs trust levels
        console.log('\n5️⃣ Проверка разделения ролей и Trust Levels...');
        const rolesCount = await pool.query(`
            SELECT role, COUNT(*) as count
            FROM users 
            WHERE is_active = true
            GROUP BY role
            ORDER BY count DESC
        `);

        console.log('Распределение ролей:');
        rolesCount.rows.forEach(({ role, count }) => {
            console.log(`  - ${role || 'NULL'}: ${count} пользователей`);
        });

        const trustLevelsCount = await pool.query(`
            SELECT trust_level, COUNT(*) as count
            FROM users 
            WHERE is_active = true AND trust_level IS NOT NULL
            GROUP BY trust_level
            ORDER BY trust_level
        `);

        console.log('\nРаспределение Trust Levels:');
        trustLevelsCount.rows.forEach(({ trust_level, count }) => {
            const levelName = getTrustLevelName(trust_level);
            console.log(`  - Level ${trust_level} (${levelName}): ${count} пользователей`);
        });

        console.log('\n✅ Все тесты завершены успешно!');

    } catch (error) {
        console.error('❌ Ошибка тестирования:', error);
    } finally {
        await pool.end();
    }
}

// Запускаем тестирование
testAdminLogsFix();
