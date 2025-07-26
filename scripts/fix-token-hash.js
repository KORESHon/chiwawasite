const { Pool } = require('pg');

const pool = new Pool({
    user: 'chiwawa',
    host: '212.15.49.139',
    database: 'chiwawa',
    password: 'mtU-PSM-cFP-2D6',
    port: 5432,
});

async function checkTokenHashField() {
    try {
        console.log('🔧 Проверяем поле token_hash...');
        
        const result = await pool.query(`
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'user_sessions' AND column_name = 'token_hash'
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ Поле token_hash не найдено');
            return;
        }
        
        const field = result.rows[0];
        console.log(`📊 Текущий тип поля token_hash: ${field.data_type}(${field.character_maximum_length || 'без ограничений'})`);
        
        if (field.data_type === 'text' || field.character_maximum_length >= 500) {
            console.log('✅ Поле token_hash имеет достаточную длину');
            return;
        }
        
        console.log('🔧 Изменяем поле token_hash на TEXT...');
        await pool.query('ALTER TABLE user_sessions ALTER COLUMN token_hash TYPE TEXT');
        console.log('✅ Поле token_hash успешно изменено на TEXT');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        await pool.end();
    }
}

checkTokenHashField();
