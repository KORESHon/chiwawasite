const { Pool } = require('pg');
require('dotenv').config();

// Функция для определения хоста базы данных
const getDbHost = () => {
    if (process.env.NODE_ENV === 'production') {
        return process.env.DB_HOST || 'localhost';
    } else {
        return process.env.DB_HOST || '212.15.49.139';
    }
}

// Конфигурация подключения к PostgreSQL
const pool = new Pool({
    host: getDbHost(),
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'chiwawa',
    user: process.env.DB_USER || 'chiwawa',
    password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
    max: 10, // Уменьшаем количество соединений
    idleTimeoutMillis: 60000, // Увеличиваем время жизни соединения
    connectionTimeoutMillis: 30000, // Увеличиваем таймаут подключения
    query_timeout: 20000, // Таймаут запроса
    keepAlive: true,
    keepAliveInitialDelayMillis: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Обработка ошибок подключения
pool.on('error', (err, client) => {
    console.error('Ошибка PostgreSQL:', err);
});

// Функция для выполнения запросов с повторными попытками
async function query(text, params, retries = 3) {
    // Режим работы без БД (заглушка)
    if (process.env.NO_DATABASE === 'true') {
        console.log('🔶 Running in NO_DATABASE mode - query skipped:', text.substring(0, 50) + '...');
        return { rows: [], rowCount: 0 };
    }
    
    const start = Date.now();
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;
            console.log('✅ Query executed successfully', { 
                attempt, 
                duration: `${duration}ms`, 
                rows: res.rowCount 
            });
            return res;
        } catch (error) {
            console.error(`❌ Query attempt ${attempt}/${retries} failed:`, {
                error: error.message,
                code: error.code,
                host: getDbHost()
            });
            
            if (attempt === retries) {
                console.error('🚨 All query attempts failed:', error);
                throw error;
            }
            
            // Ждем перед повторной попыткой (экспоненциальная задержка)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Функция для получения клиента из пула
async function getClient() {
    return await pool.connect();
}

// Функция тестирования подключения
async function testConnection(fallbackToLocal = true) {
    let client;
    try {
        console.log('🔄 Testing database connection...');
        console.log(`📍 Host: ${getDbHost()}:${process.env.DB_PORT || 5432}`);
        console.log(`🗄️ Database: ${process.env.DB_NAME || 'chiwawa'}`);
        console.log(`👤 User: ${process.env.DB_USER || 'chiwawa'}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        
        client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time, version() as version');
        
        console.log('✅ Database connection successful!');
        console.log(`🕐 Server time: ${result.rows[0].current_time}`);
        console.log(`📊 PostgreSQL version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
        
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', {
            message: error.message,
            code: error.code,
            host: getDbHost(),
            port: process.env.DB_PORT || 5432
        });
        
        // Подсказки для решения проблем
        if (error.code === 'ENOTFOUND') {
            console.log('💡 Возможные решения:');
            console.log('   1. Проверьте правильность адреса сервера');
            console.log('   2. Проверьте доступность сети');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('💡 Возможные решения:');
            console.log('   1. Убедитесь, что PostgreSQL запущен');
            console.log('   2. Проверьте порт PostgreSQL (обычно 5432)');
        } else if (error.code === 'ECONNRESET') {
            console.log('💡 Подключение сброшено сервером:');
            console.log('   1. Возможно, сервер БД блокирует внешние подключения');
            console.log('   2. Проверьте настройки pg_hba.conf на сервере');
            console.log('   3. Проверьте настройки файрвола');
            if (fallbackToLocal && getDbHost() !== 'localhost') {
                console.log('   4. Попробуем подключиться к локальной БД...');
                return await testLocalConnection();
            }
        } else if (error.code === '28P01') {
            console.log('💡 Ошибка аутентификации - проверьте логин и пароль');
        } else if (error.code === '3D000') {
            console.log('💡 База данных не найдена - создайте базу "chiwawa"');
        }
        
        return false;
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Функция для тестирования локального подключения
async function testLocalConnection() {
    console.log('🔄 Trying local database connection...');
    
    const localPool = new Pool({
        host: 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'chiwawa',
        user: process.env.DB_USER || 'chiwawa',
        password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });
    
    let client;
    try {
        client = await localPool.connect();
        console.log('✅ Local database connection successful!');
        return true;
    } catch (error) {
        console.error('❌ Local database connection also failed:', error.message);
        return false;
    } finally {
        if (client) client.release();
        await localPool.end();
    }
}

// Функция для завершения пула соединений
async function end() {
    await pool.end();
}

module.exports = {
    query,
    getClient,
    testConnection,
    testLocalConnection,
    end,
    pool
};