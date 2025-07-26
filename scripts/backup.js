#!/usr/bin/env node

/**
 * Скрипт резервного копирования базы данных
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function backupDatabase() {
    console.log('💾 Создание резервной копии базы данных...\n');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups');
    const backupFile = path.join(backupDir, `chiwawa-backup-${timestamp}.sql`);
    
    // Создаем папку для бэкапов
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log('✅ Папка для бэкапов создана');
    }
    
    // Параметры подключения
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'chiwawa',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'chiwawa'
    };
    
    // Команда pg_dump
    const pgDumpArgs = [
        '-h', dbConfig.host,
        '-p', dbConfig.port,
        '-U', dbConfig.user,
        '-d', dbConfig.database,
        '--no-password',
        '--verbose',
        '--clean',
        '--if-exists',
        '--create',
        '--format=custom',
        '--file', backupFile
    ];
    
    return new Promise((resolve, reject) => {
        console.log(`📦 Экспорт в файл: ${backupFile}`);
        
        const pgDump = spawn('pg_dump', pgDumpArgs, {
            env: { ...process.env, PGPASSWORD: dbConfig.password }
        });
        
        pgDump.stdout.on('data', (data) => {
            console.log(data.toString());
        });
        
        pgDump.stderr.on('data', (data) => {
            console.log(data.toString());
        });
        
        pgDump.on('close', (code) => {
            if (code === 0) {
                const stats = fs.statSync(backupFile);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                
                console.log(`✅ Резервная копия создана успешно!`);
                console.log(`📁 Файл: ${backupFile}`);
                console.log(`📊 Размер: ${sizeInMB} MB`);
                console.log(`🕒 Время: ${new Date().toLocaleString('ru-RU')}`);
                
                resolve(backupFile);
            } else {
                reject(new Error(`pg_dump завершился с кодом ${code}`));
            }
        });
        
        pgDump.on('error', (error) => {
            reject(new Error(`Ошибка запуска pg_dump: ${error.message}`));
        });
    });
}

async function restoreDatabase(backupFile) {
    console.log(`🔄 Восстановление базы данных из ${backupFile}...\n`);
    
    if (!fs.existsSync(backupFile)) {
        throw new Error(`Файл бэкапа не найден: ${backupFile}`);
    }
    
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'chiwawa',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'chiwawa'
    };
    
    const pgRestoreArgs = [
        '-h', dbConfig.host,
        '-p', dbConfig.port,
        '-U', dbConfig.user,
        '-d', dbConfig.database,
        '--no-password',
        '--verbose',
        '--clean',
        '--if-exists',
        backupFile
    ];
    
    return new Promise((resolve, reject) => {
        const pgRestore = spawn('pg_restore', pgRestoreArgs, {
            env: { ...process.env, PGPASSWORD: dbConfig.password }
        });
        
        pgRestore.stdout.on('data', (data) => {
            console.log(data.toString());
        });
        
        pgRestore.stderr.on('data', (data) => {
            console.log(data.toString());
        });
        
        pgRestore.on('close', (code) => {
            if (code === 0) {
                console.log('✅ База данных восстановлена успешно!');
                resolve();
            } else {
                reject(new Error(`pg_restore завершился с кодом ${code}`));
            }
        });
        
        pgRestore.on('error', (error) => {
            reject(new Error(`Ошибка запуска pg_restore: ${error.message}`));
        });
    });
}

// CLI интерфейс
if (require.main === module) {
    const command = process.argv[2];
    const file = process.argv[3];
    
    if (command === 'backup') {
        backupDatabase().catch(console.error);
    } else if (command === 'restore' && file) {
        restoreDatabase(file).catch(console.error);
    } else {
        console.log('Использование:');
        console.log('  npm run db:backup                    # Создать бэкап');
        console.log('  node scripts/backup.js restore <file> # Восстановить из файла');
    }
}

module.exports = { backupDatabase, restoreDatabase };
