#!/usr/bin/env node

// Скрипт для выполнения миграции базы данных
// Запуск: node scripts/run-migration.js

const fs = require('fs');
const path = require('path');
const db = require('../database/connection');

async function runMigration() {
    console.log('🔄 Запуск миграции базы данных...');
    
    try {
        // Читаем SQL файл миграции
        const migrationPath = path.join(__dirname, '../database/migrations/003_optimize_database_structure.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📖 Читаем миграцию:', migrationPath);
        
        // Выполняем миграцию
        console.log('⚡ Выполняем SQL команды...');
        const result = await db.query(migrationSQL);
        
        console.log('✅ Миграция успешно выполнена!');
        console.log('📊 Результат:', result);
        
        // Проверяем результат
        const stats = await db.query(`
            SELECT 
                'После миграции' as status,
                (SELECT count(*) FROM users) as total_users,
                (SELECT count(*) FROM server_settings) as server_settings_count,
                (SELECT count(*) FROM email_templates) as email_templates_count,
                (SELECT count(*) FROM site_settings) as site_settings_count
        `);
        
        console.log('\n📈 Статистика после миграции:');
        console.table(stats.rows);
        
    } catch (error) {
        console.error('❌ Ошибка выполнения миграции:', error);
        console.error('💡 Проверьте подключение к базе данных и права доступа');
        process.exit(1);
    } finally {
        // Закрываем соединение
        await db.end();
        console.log('🔌 Соединение с базой данных закрыто');
        process.exit(0);
    }
}

// Запускаем миграцию
runMigration().catch(console.error);
