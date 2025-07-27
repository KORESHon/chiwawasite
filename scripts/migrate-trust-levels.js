// Скрипт миграции: Пересмотр системы траст левелов
// Создатель: ebluffy

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({
    host: '212.15.49.139',
    port: 5432,
    database: 'chiwawa',
    user: 'chiwawa',
    password: 'mtU-PSM-cFP-2D6',
    ssl: false
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Начинаем миграцию системы траст левелов...');
        
        const migrationPath = path.join(__dirname, '../database/migrations/002_trust_level_system_rework.sql');
        const migrationSql = await fs.readFile(migrationPath, 'utf8');
        
        // Выполняем миграцию
        await client.query(migrationSql);
        
        console.log('✅ Миграция успешно выполнена!');
        
        // Проверяем результат
        const usersResult = await client.query('SELECT count(*) as total, trust_level FROM users GROUP BY trust_level ORDER BY trust_level');
        console.log('📊 Распределение пользователей по траст левелам:');
        usersResult.rows.forEach(row => {
            const levelName = ['Проходимец', 'Новичок', 'Проверенный', 'Ветеран'][row.trust_level] || 'Неизвестно';
            console.log(`   Level ${row.trust_level} (${levelName}): ${row.total} пользователей`);
        });
        
        const reputationResult = await client.query('SELECT count(*) as total FROM user_reputation');
        console.log(`💎 Создано записей репутации: ${reputationResult.rows[0].total}`);
        
    } catch (error) {
        console.error('❌ Ошибка миграции:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    runMigration().catch(console.error);
}

module.exports = { runMigration };
