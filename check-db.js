// Скрипт для проверки структуры базы данных
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'chiwawa',
    host: process.env.DB_HOST || '212.15.49.139',
    database: process.env.DB_NAME || 'chiwawa',
    password: process.env.DB_PASS,
    port: process.env.DB_PORT || 5432,
});

async function checkDatabase() {
    try {
        console.log('🔍 Проверка подключения к базе данных...');
        
        // Проверяем подключение
        const client = await pool.connect();
        console.log('✅ Подключение к базе данных успешно!');
        
        // Получаем список всех таблиц
        console.log('\n📋 Список таблиц в базе данных:');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        
        tablesResult.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });
        
        // Проверяем структуру таблицы applications
        console.log('\n🔍 Структура таблицы applications:');
        const appColumnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'applications' 
            ORDER BY ordinal_position;
        `);
        
        if (appColumnsResult.rows.length > 0) {
            appColumnsResult.rows.forEach(row => {
                console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
            });
        } else {
            console.log('  ❌ Таблица applications не найдена!');
        }
        
        // Проверяем структуру таблицы trust_level_applications
        console.log('\n🔍 Структура таблицы trust_level_applications:');
        const trustColumnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'trust_level_applications' 
            ORDER BY ordinal_position;
        `);
        
        if (trustColumnsResult.rows.length > 0) {
            trustColumnsResult.rows.forEach(row => {
                console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
            });
        } else {
            console.log('  ❌ Таблица trust_level_applications не найдена!');
        }
        
        // Проверяем структуру таблицы users
        console.log('\n🔍 Структура таблицы users:');
        const usersColumnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position;
        `);
        
        if (usersColumnsResult.rows.length > 0) {
            usersColumnsResult.rows.forEach(row => {
                console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
            });
        } else {
            console.log('  ❌ Таблица users не найдена!');
        }
        
        // Проверяем есть ли данные в таблицах
        console.log('\n📊 Количество записей в таблицах:');
        
        const appCountResult = await client.query('SELECT COUNT(*) FROM applications');
        console.log(`  - applications: ${appCountResult.rows[0].count} записей`);
        
        const trustCountResult = await client.query('SELECT COUNT(*) FROM trust_level_applications');
        console.log(`  - trust_level_applications: ${trustCountResult.rows[0].count} записей`);
        
        const usersCountResult = await client.query('SELECT COUNT(*) FROM users');
        console.log(`  - users: ${usersCountResult.rows[0].count} записей`);
        
        // Проверяем user_reputation таблицу
        try {
            const reputationColumnsResult = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'user_reputation' 
                ORDER BY ordinal_position;
            `);
            
            if (reputationColumnsResult.rows.length > 0) {
                console.log('\n🔍 Структура таблицы user_reputation:');
                reputationColumnsResult.rows.forEach(row => {
                    console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
                });
            }
        } catch (err) {
            console.log('\n❌ Таблица user_reputation не найдена или недоступна');
        }
        
        client.release();
        console.log('\n✅ Проверка завершена!');
        
    } catch (error) {
        console.error('❌ Ошибка при проверке базы данных:', error);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('💡 Проверьте:');
            console.error('   - Запущен ли PostgreSQL сервер');
            console.error('   - Правильность настроек подключения в .env файле');
        } else if (error.code === '28P01') {
            console.error('💡 Ошибка аутентификации - проверьте пароль в .env файле');
        }
    } finally {
        await pool.end();
    }
}

checkDatabase();
