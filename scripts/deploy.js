#!/usr/bin/env node

/**
 * Скрипт деплоя на VPS сервер
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEPLOY_CONFIG = {
    // Настройки сервера
    server: {
        host: 'your-vps-ip',
        user: 'root',
        port: 22,
        path: '/opt/chiwawa-server'
    },
    
    // Что исключить при копировании
    exclude: [
        'node_modules/',
        '.git/',
        'logs/',
        'temp/',
        'uploads/',
        'backups/',
        '.env',
        '*.log'
    ],
    
    // Команды для выполнения на сервере
    commands: [
        'npm install --production',
        'npm run db:migrate',
        'pm2 restart chiwawa-server || pm2 start ecosystem.config.js'
    ]
};

function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const levels = {
        info: '📋',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    
    console.log(`${levels[level]} [${timestamp}] ${message}`);
}

async function checkPrerequisites() {
    log('Проверка предварительных условий...');
    
    // Проверяем наличие git
    try {
        execSync('git --version', { stdio: 'ignore' });
        log('Git установлен', 'success');
    } catch {
        throw new Error('Git не установлен');
    }
    
    // Проверяем наличие rsync
    try {
        execSync('rsync --version', { stdio: 'ignore' });
        log('rsync установлен', 'success');
    } catch {
        throw new Error('rsync не установлен');
    }
    
    // Проверяем состояние git
    try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        if (status.trim()) {
            log('У вас есть незакоммиченные изменения', 'warning');
            log('Рекомендуется сделать commit перед деплоем', 'warning');
        }
    } catch {
        log('Не git репозиторий или ошибка git', 'warning');
    }
    
    // Проверяем package.json
    if (!fs.existsSync('package.json')) {
        throw new Error('package.json не найден');
    }
    
    log('Все проверки пройдены', 'success');
}

async function buildProject() {
    log('Сборка проекта...');
    
    try {
        // Проверяем package.json на наличие build скрипта
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        
        if (packageJson.scripts && packageJson.scripts.build) {
            execSync('npm run build', { stdio: 'inherit' });
            log('Проект собран', 'success');
        } else {
            log('Скрипт build не найден, пропускаем сборку', 'warning');
        }
    } catch (error) {
        throw new Error(`Ошибка сборки: ${error.message}`);
    }
}

async function deployToServer() {
    log('Деплой на сервер...');
    
    const { host, user, port, path: serverPath } = DEPLOY_CONFIG.server;
    
    // Формируем команду rsync
    const excludeArgs = DEPLOY_CONFIG.exclude.map(pattern => `--exclude=${pattern}`).join(' ');
    const rsyncCommand = `rsync -avz --delete ${excludeArgs} ./ ${user}@${host}:${serverPath}/`;
    
    try {
        log(`Копирование файлов на ${host}...`);
        execSync(rsyncCommand, { stdio: 'inherit' });
        log('Файлы скопированы', 'success');
    } catch (error) {
        throw new Error(`Ошибка копирования: ${error.message}`);
    }
}

async function runServerCommands() {
    log('Выполнение команд на сервере...');
    
    const { host, user, path: serverPath } = DEPLOY_CONFIG.server;
    
    for (const command of DEPLOY_CONFIG.commands) {
        try {
            log(`Выполнение: ${command}`);
            const sshCommand = `ssh ${user}@${host} "cd ${serverPath} && ${command}"`;
            execSync(sshCommand, { stdio: 'inherit' });
            log(`Команда выполнена: ${command}`, 'success');
        } catch (error) {
            log(`Ошибка выполнения команды "${command}": ${error.message}`, 'error');
            throw error;
        }
    }
}

async function checkDeployment() {
    log('Проверка развертывания...');
    
    const { host, user, path: serverPath } = DEPLOY_CONFIG.server;
    
    try {
        // Проверяем статус PM2
        const checkCommand = `ssh ${user}@${host} "cd ${serverPath} && pm2 list | grep chiwawa-server"`;
        execSync(checkCommand, { stdio: 'inherit' });
        log('Приложение запущено', 'success');
    } catch (error) {
        log('Не удалось проверить статус приложения', 'warning');
    }
}

async function deploy() {
    const startTime = Date.now();
    
    try {
        log('🚀 Начало деплоя Chiwawa Server');
        
        await checkPrerequisites();
        await buildProject();
        await deployToServer();
        await runServerCommands();
        await checkDeployment();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        log(`🎉 Деплой завершен успешно за ${duration}с`, 'success');
        
        console.log('\n📋 Что дальше:');
        console.log(`1. Проверьте сайт: http://${DEPLOY_CONFIG.server.host}`);
        console.log(`2. Проверьте логи: ssh ${DEPLOY_CONFIG.server.user}@${DEPLOY_CONFIG.server.host} "pm2 logs chiwawa-server"`);
        console.log(`3. Мониторинг: ssh ${DEPLOY_CONFIG.server.user}@${DEPLOY_CONFIG.server.host} "pm2 monit"`);
        
    } catch (error) {
        log(`Ошибка деплоя: ${error.message}`, 'error');
        process.exit(1);
    }
}

// Конфигурация через CLI
function configure() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const questions = [
        'IP адрес VPS сервера: ',
        'Пользователь SSH (по умолчанию root): ',
        'Порт SSH (по умолчанию 22): ',
        'Путь на сервере (по умолчанию /opt/chiwawa-server): '
    ];
    
    let answers = [];
    let currentQuestion = 0;
    
    function askQuestion() {
        if (currentQuestion < questions.length) {
            rl.question(questions[currentQuestion], (answer) => {
                answers.push(answer || getDefaultValue(currentQuestion));
                currentQuestion++;
                askQuestion();
            });
        } else {
            rl.close();
            saveConfig(answers);
        }
    }
    
    function getDefaultValue(index) {
        const defaults = ['', 'root', '22', '/opt/chiwawa-server'];
        return defaults[index];
    }
    
    function saveConfig(answers) {
        const config = {
            server: {
                host: answers[0],
                user: answers[1],
                port: parseInt(answers[2]),
                path: answers[3]
            }
        };
        
        fs.writeFileSync('deploy.config.json', JSON.stringify(config, null, 2));
        log('Конфигурация сохранена в deploy.config.json', 'success');
    }
    
    askQuestion();
}

// CLI команды
if (require.main === module) {
    const command = process.argv[2];
    
    // Загружаем конфигурацию если есть
    if (fs.existsSync('deploy.config.json')) {
        const userConfig = JSON.parse(fs.readFileSync('deploy.config.json', 'utf8'));
        Object.assign(DEPLOY_CONFIG, userConfig);
    }
    
    switch (command) {
        case 'configure':
            configure();
            break;
        case 'deploy':
            deploy();
            break;
        default:
            console.log('Использование:');
            console.log('  node scripts/deploy.js configure  # Настройка деплоя');
            console.log('  node scripts/deploy.js deploy     # Деплой на сервер');
            console.log('  npm run deploy                    # Быстрый деплой');
    }
}

module.exports = { deploy, configure };
