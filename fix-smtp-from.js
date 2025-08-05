// Скрипт для исправления smtp-from настройки
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'chiwawa',
    host: process.env.DB_HOST || '212.15.49.139',
    database: process.env.DB_NAME || 'chiwawa',
    password: process.env.DB_PASS,
    port: process.env.DB_PORT || 5432,
});

async function fixSmtpFrom() {
    try {
        console.log('🔧 Исправление настройки smtp-from...');
        
        const client = await pool.connect();
        
        // Получаем текущий smtp-user
        const userResult = await client.query(`
            SELECT setting_value FROM server_settings 
            WHERE setting_key = 'smtp-user'
        `);
        
        if (userResult.rows.length > 0) {
            const smtpUser = userResult.rows[0].setting_value;
            console.log('📧 Текущий SMTP user:', smtpUser);
            
            // Получаем текущий smtp-from
            const fromResult = await client.query(`
                SELECT setting_value FROM server_settings 
                WHERE setting_key = 'smtp-from'
            `);
            
            if (fromResult.rows.length > 0) {
                const currentFrom = fromResult.rows[0].setting_value;
                console.log('📧 Текущий SMTP from:', currentFrom);
                
                if (currentFrom !== smtpUser) {
                    // Обновляем smtp-from чтобы он совпадал с smtp-user
                    await client.query(`
                        UPDATE server_settings 
                        SET setting_value = $1, updated_at = CURRENT_TIMESTAMP 
                        WHERE setting_key = 'smtp-from'
                    `, [smtpUser]);
                    
                    console.log('✅ Обновлен smtp-from с', currentFrom, 'на', smtpUser);
                } else {
                    console.log('✅ smtp-from уже корректный');
                }
            } else {
                console.log('⚠️ Настройка smtp-from не найдена');
            }
        } else {
            console.log('⚠️ Настройка smtp-user не найдена');
        }
        
        client.release();
        await pool.end();
        console.log('🎉 Готово!');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

fixSmtpFrom();
