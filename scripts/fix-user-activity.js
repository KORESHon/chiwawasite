const { Pool } = require('pg');

const pool = new Pool({
    user: 'chiwawa',
    host: '212.15.49.139',
    database: 'chiwawa',
    password: 'mtU-PSM-cFP-2D6',
    port: 5432,
});

async function fixUserActivityTable() {
    try {
        console.log('🔧 Проверяем таблицу user_activity...');
        
        // Проверяем существует ли колонка created_at
        const checkResult = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_activity' AND column_name = 'created_at'
        `);
        
        if (checkResult.rows.length === 0) {
            console.log('➕ Добавляем колонку created_at...');
            await pool.query(`
                ALTER TABLE user_activity 
                ADD COLUMN created_at TIMESTAMP DEFAULT NOW()
            `);
            console.log('✅ Колонка created_at добавлена');
        } else {
            console.log('✅ Колонка created_at уже существует');
        }
        
        // Проверяем другие необходимые колонки
        const allColumns = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_activity'
            ORDER BY column_name
        `);
        
        console.log('📊 Колонки в таблице user_activity:');
        allColumns.rows.forEach(row => {
            console.log(`  - ${row.column_name}`);
        });
        
        // Проверяем что необходимые индексы существуют
        const indexes = await pool.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'user_activity'
        `);
        
        console.log('📊 Индексы в таблице user_activity:');
        indexes.rows.forEach(row => {
            console.log(`  - ${row.indexname}`);
        });
        
        // Создаём индекс если его нет
        const createdAtIndex = indexes.rows.find(row => row.indexname.includes('created_at'));
        if (!createdAtIndex) {
            console.log('➕ Создаём индекс для created_at...');
            await pool.query('CREATE INDEX idx_user_activity_created_at ON user_activity(created_at)');
            console.log('✅ Индекс создан');
        }
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
    } finally {
        await pool.end();
    }
}

fixUserActivityTable();
