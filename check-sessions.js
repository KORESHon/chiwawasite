const db = require('./database/connection');

async function checkSessions() {
    try {
        console.log('🔍 Проверяем сессии пользователей...\n');
        
        // Получаем всех пользователей с их сессиями
        const result = await db.query(`
            SELECT 
                u.id, u.nickname, u.email, u.is_banned, u.is_active,
                s.id as session_id, s.token_hash, s.expires_at, s.is_active as session_active,
                s.created_at as session_created, s.ip_address
            FROM users u
            LEFT JOIN user_sessions s ON u.id = s.user_id
            WHERE u.nickname = 'ebluffy'
            ORDER BY s.created_at DESC
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ Пользователь не найден');
            return;
        }
        
        const user = result.rows[0];
        console.log(`👤 Пользователь: ${user.nickname} (ID: ${user.id})`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`🚫 Забанен: ${user.is_banned}`);
        console.log(`✅ Активен: ${user.is_active}`);
        console.log('');
        
        if (user.session_id) {
            console.log('🔐 Сессии:');
            result.rows.forEach((row, index) => {
                if (row.session_id) {
                    const now = new Date();
                    const expires = new Date(row.expires_at);
                    const isExpired = expires < now;
                    
                    console.log(`  ${index + 1}. ID: ${row.session_id}`);
                    console.log(`     Token hash: ${row.token_hash.substring(0, 20)}...`);
                    console.log(`     Создана: ${row.session_created}`);
                    console.log(`     Истекает: ${row.expires_at} ${isExpired ? '(ИСТЕКЛА)' : '(Активна)'}`);
                    console.log(`     Активна: ${row.session_active}`);
                    console.log(`     IP: ${row.ip_address}`);
                    console.log('');
                }
            });
        } else {
            console.log('🔐 Сессий не найдено');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка:', error);
        process.exit(1);
    }
}

checkSessions();
