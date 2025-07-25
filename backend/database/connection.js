const { Pool } = require('pg');
require('dotenv').config();

// Функция для определения хоста базы данных
const getDbHost = () => {
    // Проверяем, запущены ли мы локально или на VPS
    const isLocal = process.env.NODE_ENV === 'development' || 
                   process.env.DB_HOST === 'localhost' ||
                   !process.env.DB_HOST;
    
    return isLocal ? 'localhost' : '212.15.49.139';
};

// Конфигурация подключения к PostgreSQL
const pool = new Pool({
    host: getDbHost(),
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'chiwawa',
    user: process.env.DB_USER || 'chiwawa',
    password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
    max: 20, // Максимальное количество соединений в пуле
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Увеличиваем таймаут для VPS
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Обработка ошибок подключения
pool.on('error', (err, client) => {
    console.error('Ошибка PostgreSQL:', err);
});

// Функция для выполнения запросов
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Функция для получения клиента из пула
async function getClient() {
    return await pool.connect();
}

// Функция для завершения работы с пулом
async function end() {
    await pool.end();
}

module.exports = {
    query,
    getClient,
    end,
    pool
};
