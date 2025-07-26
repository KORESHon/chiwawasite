#!/usr/bin/env node

/**
 * Скрипт создания базы данных Chiwawa Server
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function createDatabase() {
    console.log('🗄️ Создание базы данных Chiwawa Server...\n');
    
    // Подключение к PostgreSQL (к базе postgres для создания новой БД)
    const adminClient = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'chiwawa',
        password: process.env.DB_PASSWORD,
        database: 'postgres' // Подключаемся к стандартной БД
    });
    
    try {
        await adminClient.connect();
        console.log('✅ Подключение к PostgreSQL установлено');
        
        // Проверяем существование базы данных
        const dbName = process.env.DB_NAME || 'chiwawa';
        const checkResult = await adminClient.query(
            'SELECT 1 FROM pg_database WHERE datname = $1',
            [dbName]
        );
        
        if (checkResult.rows.length === 0) {
            // Создаем базу данных
            await adminClient.query(`CREATE DATABASE "${dbName}"`);
            console.log(`✅ База данных "${dbName}" создана`);
        } else {
            console.log(`ℹ️ База данных "${dbName}" уже существует`);
        }
        
        await adminClient.end();
        
        // Подключаемся к созданной базе данных
        const dbClient = new Client({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'chiwawa',
            password: process.env.DB_PASSWORD,
            database: dbName
        });
        
        await dbClient.connect();
        console.log(`✅ Подключение к базе "${dbName}" установлено`);
        
        // Загружаем и выполняем схему
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Файл схемы не найден: ${schemaPath}`);
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        console.log('📋 Применение схемы базы данных...');
        
        await dbClient.query(schema);
        console.log('✅ Схема базы данных применена успешно');
        
        // Проверяем созданные таблицы
        const tablesResult = await dbClient.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        
        console.log('\n📊 Созданные таблицы:');
        tablesResult.rows.forEach(row => {
            console.log(`  ✅ ${row.table_name}`);
        });
        
        // Проверяем данные администратора
        const adminResult = await dbClient.query(
            'SELECT nickname, email, role FROM users WHERE role = $1',
            ['admin']
        );
        
        if (adminResult.rows.length > 0) {
            console.log('\n👑 Администраторы:');
            adminResult.rows.forEach(admin => {
                console.log(`  ✅ ${admin.nickname} (${admin.email})`);
            });
        }
        
        await dbClient.end();
        
        console.log('\n🎉 База данных успешно создана и настроена!');
        console.log('\n📋 Следующие шаги:');
        console.log('1. Запустите сервер: npm start');
        console.log('2. Откройте браузер: http://localhost:3000');
        console.log('3. Войдите как администратор: ebluffy / admin123');
        
    } catch (error) {
        console.error('❌ Ошибка при создании базы данных:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    createDatabase();
}

module.exports = { createDatabase };
