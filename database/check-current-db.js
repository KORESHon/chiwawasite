// Скрипт для полной проверки структуры базы данных
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
        
        // Получаем общую информацию о БД
        console.log('\n📊 Общая информация о базе данных:');
        const dbInfoResult = await client.query(`
            SELECT 
                current_database() as database_name,
                current_user as current_user,
                version() as postgres_version,
                pg_size_pretty(pg_database_size(current_database())) as database_size;
        `);
        
        const dbInfo = dbInfoResult.rows[0];
        console.log(`  📂 База данных: ${dbInfo.database_name}`);
        console.log(`  👤 Пользователь: ${dbInfo.current_user}`);
        console.log(`  🐘 Версия PostgreSQL: ${dbInfo.postgres_version.split(' ')[1]}`);
        console.log(`  💾 Размер БД: ${dbInfo.database_size}`);
        
        // Получаем список всех таблиц с количеством записей
        console.log('\n📋 Список всех таблиц в базе данных:');
        const tablesResult = await client.query(`
            SELECT 
                t.table_name,
                pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) as table_size
            FROM information_schema.tables t
            WHERE t.table_schema = 'public' 
            ORDER BY t.table_name;
        `);
        
        console.log(`  Найдено таблиц: ${tablesResult.rows.length}`);
        console.log('  ┌─────────────────────────────┬──────────────┐');
        console.log('  │ Название таблицы            │ Размер       │');
        console.log('  ├─────────────────────────────┼──────────────┤');
        
        for (const table of tablesResult.rows) {
            try {
                const countResult = await client.query(`SELECT COUNT(*) as count FROM "${table.table_name}"`);
                const count = countResult.rows[0].count;
                console.log(`  │ ${table.table_name.padEnd(27)} │ ${table.table_size.padEnd(12)} │ (${count} записей)`);
            } catch (err) {
                console.log(`  │ ${table.table_name.padEnd(27)} │ ${table.table_size.padEnd(12)} │ (ошибка подсчета)`);
            }
        }
        console.log('  └─────────────────────────────┴──────────────┘');
        
        // Получаем структуру ключевых таблиц
        const keyTables = ['users', 'applications', 'admin_logs', 'server_settings', 'email_templates', 'user_sessions'];
        
        for (const tableName of keyTables) {
            console.log(`\n🔍 Структура таблицы "${tableName}":`);
            
            const columnsResult = await client.query(`
                SELECT 
                    column_name, 
                    data_type, 
                    character_maximum_length,
                    is_nullable, 
                    column_default,
                    ordinal_position
                FROM information_schema.columns 
                WHERE table_name = $1 
                ORDER BY ordinal_position;
            `, [tableName]);
            
            if (columnsResult.rows.length > 0) {
                console.log('  ┌─────────────────────────┬─────────────────┬──────────┬─────────────────┐');
                console.log('  │ Колонка                 │ Тип данных      │ Nullable │ По умолчанию    │');
                console.log('  ├─────────────────────────┼─────────────────┼──────────┼─────────────────┤');
                
                columnsResult.rows.forEach(row => {
                    const dataType = row.character_maximum_length 
                        ? `${row.data_type}(${row.character_maximum_length})`
                        : row.data_type;
                    const defaultValue = row.column_default || '-';
                    
                    console.log(`  │ ${row.column_name.padEnd(23)} │ ${dataType.padEnd(15)} │ ${row.is_nullable.padEnd(8)} │ ${(defaultValue.length > 15 ? defaultValue.substring(0, 12) + '...' : defaultValue).padEnd(15)} │`);
                });
                console.log('  └─────────────────────────┴─────────────────┴──────────┴─────────────────┘');
                
                // Получаем количество записей
                const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
                console.log(`  📊 Количество записей: ${countResult.rows[0].count}`);
                
                // Проверяем индексы
                const indexesResult = await client.query(`
                    SELECT 
                        indexname,
                        indexdef
                    FROM pg_indexes 
                    WHERE tablename = $1;
                `, [tableName]);
                
                if (indexesResult.rows.length > 0) {
                    console.log(`  🔑 Индексы (${indexesResult.rows.length}):`);
                    indexesResult.rows.forEach(idx => {
                        console.log(`    - ${idx.indexname}`);
                    });
                }
            } else {
                console.log(`  ❌ Таблица "${tableName}" не найдена!`);
            }
        }
        
        // Проверяем внешние ключи
        console.log('\n🔗 Внешние ключи:');
        const foreignKeysResult = await client.query(`
            SELECT
                tc.table_name, 
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            ORDER BY tc.table_name, kcu.column_name;
        `);
        
        if (foreignKeysResult.rows.length > 0) {
            foreignKeysResult.rows.forEach(fk => {
                console.log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
            });
        } else {
            console.log('  ⚠️ Внешние ключи не найдены');
        }
        
        // Проверяем настройки сервера
        console.log('\n⚙️ Настройки сервера:');
        const settingsResult = await client.query(`
            SELECT setting_key, setting_value, category 
            FROM server_settings 
            ORDER BY category, setting_key
            LIMIT 10;
        `);
        
        if (settingsResult.rows.length > 0) {
            settingsResult.rows.forEach(setting => {
                console.log(`  [${setting.category}] ${setting.setting_key}: ${setting.setting_value}`);
            });
            if (settingsResult.rows.length === 10) {
                console.log('  ... (показаны первые 10 настроек)');
            }
        } else {
            console.log('  ⚠️ Настройки сервера не найдены');
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

        // Проверяем player_stats таблицу
        try {
            const statsColumnsResult = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'player_stats' 
                ORDER BY ordinal_position;
            `);
            
            if (statsColumnsResult.rows.length > 0) {
                console.log('\n🔍 Структура таблицы player_stats:');
                statsColumnsResult.rows.forEach(row => {
                    console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
                });
                
                // Показываем количество записей в player_stats
                const statsCountResult = await client.query('SELECT COUNT(*) FROM player_stats');
                console.log(`\n📊 Количество записей в player_stats: ${statsCountResult.rows[0].count}`);
            }
        } catch (err) {
            console.log('\n❌ Таблица player_stats не найдена или недоступна');
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
