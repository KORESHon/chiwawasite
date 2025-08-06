const db = require('./database/connection');

async function fixUserSessions() {
    try {
        console.log('🔧 Исправляем сессии пользователя ebluffy...\n');
        
        // Активируем последнюю сессию
        const result = await db.query(`
            UPDATE user_sessions 
            SET is_active = true 
            WHERE user_id = 1 
            AND expires_at > NOW()
            AND id = (
                SELECT id FROM user_sessions 
                WHERE user_id = 1 AND expires_at > NOW()
                ORDER BY created_at DESC 
                LIMIT 1
            )
            RETURNING id, expires_at, ip_address
        `);
        
        if (result.rows.length > 0) {
            const session = result.rows[0];
            console.log('✅ Активирована сессия:');
            console.log(`   ID: ${session.id}`);
            console.log(`   Истекает: ${session.expires_at}`);
            console.log(`   IP: ${session.ip_address}`);
            console.log('\n🎉 Теперь профиль должен загружаться!');
        } else {
            console.log('❌ Не найдено активных сессий для активации');
            console.log('💡 Пользователю нужно войти заново');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

fixUserSessions();
