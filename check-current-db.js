const { Pool } = require('pg');

const pool = new Pool({
  user: 'chiwawa_user',
  password: 'secure_password_2023',
  host: 'localhost',
  port: 5432,
  database: 'chiwawa_db'
});

async function checkCurrentSettings() {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM server_settings ORDER BY setting_key');
    console.log('=== ТЕКУЩИЕ НАСТРОЙКИ В БАЗЕ ===');
    result.rows.forEach(row => {
      console.log(`${row.setting_key}: ${row.setting_value}`);
    });
    console.log(`Всего записей: ${result.rows.length}`);
    
    console.log('\n=== СТРУКТУРА ТАБЛИЦЫ ===');
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'server_settings' 
      ORDER BY ordinal_position
    `);
    structure.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

checkCurrentSettings();
