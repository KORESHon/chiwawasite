const { Pool } = require('pg');

// Подключение к базе данных (как в основном проекте)
const pool = new Pool({
    host: process.env.DB_HOST || '212.15.49.139',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'chiwawa',
    user: process.env.DB_USER || 'chiwawa',
    password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function checkEmailTemplatesTable() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Проверяем структуру таблицы email_templates...');
        
        // Проверяем существующую структуру
        const result = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'email_templates' 
            ORDER BY ordinal_position
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ Таблица email_templates не найдена');
        } else {
            console.log('✅ Структура таблицы email_templates:');
            result.rows.forEach(row => {
                console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
            });
        }
        
        // Проверяем данные в таблице
        const dataResult = await client.query('SELECT COUNT(*) as count FROM email_templates');
        console.log(`📊 В таблице ${dataResult.rows[0].count} записей`);
        
        if (dataResult.rows[0].count > 0) {
            const sampleResult = await client.query('SELECT * FROM email_templates LIMIT 3');
            console.log('📝 Примеры записей:');
            sampleResult.rows.forEach((row, index) => {
                console.log(`  ${index + 1}. ID: ${row.id}, Название: ${row.template_name || 'N/A'}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка при проверке таблицы:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkEmailTemplatesTable();
