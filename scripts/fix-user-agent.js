const { Pool } = require('pg');

// Конфигурация базы данных
const pool = new Pool({
    user: 'chiwawa',
    host: '212.15.49.139',
    database: 'chiwawa',
    password: 'mtU-PSM-cFP-2D6',
    port: 5432,
});

async function fixUserAgent() {
    try {
        console.log('🔧 Исправляем тип поля user_agent...');
        
        // Проверяем текущий тип поля
        const checkResult = await pool.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'user_sessions' AND column_name = 'user_agent'
        `);
        
        if (checkResult.rows.length === 0) {
            console.log('❌ Поле user_agent не найдено');
            return;
        }
        
        const field = checkResult.rows[0];
        console.log(`📊 Текущий тип поля: ${field.data_type}(${field.character_maximum_length || 'без ограничений'})`);
        
        if (field.data_type === 'text') {
            console.log('✅ Поле user_agent уже имеет тип TEXT');
            return;
        }
        
        // Изменяем тип поля
        await pool.query('ALTER TABLE user_sessions ALTER COLUMN user_agent TYPE TEXT');
        console.log('✅ Поле user_agent успешно изменено на TEXT');
        
        // Проверяем результат
        const verifyResult = await pool.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'user_sessions' AND column_name = 'user_agent'
        `);
        
        console.log(`✅ Новый тип поля: ${verifyResult.rows[0].data_type}`);
        
    } catch (error) {
        console.error('❌ Ошибка при исправлении:', error.message);
    } finally {
        await pool.end();
    }
}

fixUserAgent();
