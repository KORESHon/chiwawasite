// Финальная проверка всех исправлений
// Создатель: ebluffy

require('dotenv').config();
const pool = require('../database/connection');

async function finalCheck() {
    try {
        console.log('🔍 Финальная проверка исправлений...\n');

        // 1. Проверяем исправления в таблице users
        console.log('1️⃣ Проверка колонок в таблице users:');
        const userColumns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('discord_username', 'total_minutes', 'age', 'bio', 'avatar_url', 'ban_reason', 'ban_until')
            ORDER BY column_name
        `);
        
        userColumns.rows.forEach(col => {
            console.log(`  ✅ ${col.column_name}: ${col.data_type}`);
        });

        // 2. Проверяем наличие всех необходимых таблиц
        console.log('\n2️⃣ Проверка необходимых таблиц:');
        const requiredTables = ['users', 'applications', 'trust_level_applications', 'player_stats', 'game_sessions', 'discord_oauth'];
        
        for (const tableName of requiredTables) {
            const tableCheck = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = $1
            `, [tableName]);
            
            if (tableCheck.rows.length > 0) {
                console.log(`  ✅ ${tableName}`);
            } else {
                console.log(`  ❌ ${tableName} - отсутствует!`);
            }
        }

        // 3. Проверяем структуру trust_level_applications
        console.log('\n3️⃣ Проверка колонок в trust_level_applications:');
        const tlaColumns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'trust_level_applications'
            AND column_name IN ('submitted_at', 'reviewed_at')
            ORDER BY column_name
        `);
        
        tlaColumns.rows.forEach(col => {
            console.log(`  ✅ ${col.column_name}: ${col.data_type}`);
        });

        // 4. Проверяем тригgerы
        console.log('\n4️⃣ Проверка тригgerов:');
        const triggers = await pool.query(`
            SELECT trigger_name, event_object_table 
            FROM information_schema.triggers 
            WHERE trigger_name IN ('trigger_check_ban_expiry', 'trigger_save_age_from_application', 'trigger_sync_user_total_minutes')
        `);
        
        triggers.rows.forEach(trigger => {
            console.log(`  ✅ ${trigger.trigger_name} на таблице ${trigger.event_object_table}`);
        });

        // 5. Проверяем функции
        console.log('\n5️⃣ Проверка функций:');
        const functions = await pool.query(`
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_name IN ('check_ban_expiry', 'save_age_from_application', 'sync_user_total_minutes')
        `);
        
        functions.rows.forEach(func => {
            console.log(`  ✅ ${func.routine_name}()`);
        });

        // 6. Тестируем несколько запросов
        console.log('\n6️⃣ Тестирование запросов:');
        
        try {
            // Тест запроса пользователей из admin.js
            await pool.query(`
                SELECT u.id, u.nickname, u.email, u.discord_username, u.trust_level 
                FROM users u 
                LIMIT 1
            `);
            console.log('  ✅ Запрос пользователей (admin.js)');
        } catch (error) {
            console.log('  ❌ Запрос пользователей (admin.js):', error.message);
        }

        try {
            // Тест запроса daily_stats из profile.js (исправленный)
            await pool.query(`
                SELECT stat_date, playtime_minutes, blocks_broken 
                FROM daily_stats 
                WHERE user_id = 1 
                LIMIT 1
            `);
            console.log('  ✅ Запрос игровых статистик (profile.js)');
        } catch (error) {
            console.log('  ❌ Запрос игровых статистик (profile.js):', error.message);
        }

        try {
            // Тест запроса trust_level_applications
            await pool.query(`
                SELECT * FROM trust_level_applications 
                WHERE user_id = 1 
                ORDER BY submitted_at DESC 
                LIMIT 1
            `);
            console.log('  ✅ Запрос заявок на повышение уровня');
        } catch (error) {
            console.log('  ❌ Запрос заявок на повышение уровня:', error.message);
        }

        await pool.end();
        console.log('\n🎉 Финальная проверка завершена!');

    } catch (error) {
        console.error('❌ Ошибка проверки:', error.message);
        await pool.end();
    }
}

// Запускаем проверку
finalCheck();
