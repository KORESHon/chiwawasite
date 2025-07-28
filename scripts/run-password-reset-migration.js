const db = require('../database/connection');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('🔄 Применение миграции для токенов сброса пароля...');
        
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, '../database/migrations/003_add_password_reset_tokens.sql'), 
            'utf8'
        );
        
        await db.query(migrationSQL);
        
        console.log('✅ Миграция успешно применена!');
        console.log('📋 Создана таблица password_reset_tokens');
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка применения миграции:', error);
        process.exit(1);
    }
}

runMigration();
