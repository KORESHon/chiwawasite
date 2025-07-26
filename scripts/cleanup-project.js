const fs = require('fs');
const path = require('path');

console.log('🧹 Очистка проекта для chiwawasite...');

// Папки и файлы, которые нужно удалить (не связанные с сайтом)
const toDelete = [
    // Старые папки после реорганизации
    'backend/',
    'website/',
    
    // Minecraft плагин - не нужен для сайта
    'chiwawa-plugin/',
    'plugins/',
    
    // Discord бот - отдельный проект
    'discord-bot/',
    'integrations/',
    
    // Временные файлы и скрипты реорганизации
    'temp/',
    'reorganize.js',
    
    // Документация старая
    'TZ.txt',
    'REORGANIZATION_COMPLETE.md',
    'PROJECT_STRUCTURE.md',
    'NEW_README.md',
    
    // Тестовые файлы
    'tests/',
];

// Функция для безопасного удаления
function safeDelete(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            
            if (stats.isDirectory()) {
                // Рекурсивно удаляем папку
                fs.rmSync(filePath, { recursive: true, force: true });
                console.log(`📁 Удалена папка: ${filePath}`);
            } else {
                // Удаляем файл
                fs.unlinkSync(filePath);
                console.log(`📄 Удален файл: ${filePath}`);
            }
        } else {
            console.log(`⚠️ Не найдено: ${filePath}`);
        }
    } catch (error) {
        console.error(`❌ Ошибка удаления ${filePath}:`, error.message);
    }
}

// Удаляем ненужные файлы и папки
console.log('🗑️ Удаляем ненужные файлы и папки...');
toDelete.forEach(item => {
    safeDelete(item);
});

console.log('');
console.log('✅ Очистка завершена!');
console.log('');
console.log('📋 Оставшаяся структура проекта:');

// Показываем что осталось
function showDirectory(dirPath, prefix = '') {
    try {
        const items = fs.readdirSync(dirPath)
            .filter(item => !item.startsWith('.') && item !== 'node_modules')
            .sort((a, b) => {
                const aIsDir = fs.statSync(path.join(dirPath, a)).isDirectory();
                const bIsDir = fs.statSync(path.join(dirPath, b)).isDirectory();
                if (aIsDir && !bIsDir) return -1;
                if (!aIsDir && bIsDir) return 1;
                return a.localeCompare(b);
            });
        
        items.forEach((item, index) => {
            const itemPath = path.join(dirPath, item);
            const isLast = index === items.length - 1;
            const currentPrefix = prefix + (isLast ? '└── ' : '├── ');
            const nextPrefix = prefix + (isLast ? '    ' : '│   ');
            
            const stats = fs.statSync(itemPath);
            if (stats.isDirectory()) {
                console.log(currentPrefix + item + '/');
                if (prefix.length < 12) { // Ограничиваем глубину
                    showDirectory(itemPath, nextPrefix);
                }
            } else {
                console.log(currentPrefix + item);
            }
        });
    } catch (error) {
        console.error(`Ошибка чтения директории ${dirPath}:`, error.message);
    }
}

showDirectory('.');

console.log('');
console.log('🎯 Проект готов к переименованию в chiwawasite!');
console.log('');
console.log('📁 Финальная структура:');
console.log('├── src/              # Backend (Express.js сервер)');
console.log('├── public/           # Frontend (HTML/CSS/JS)');
console.log('├── database/         # PostgreSQL схема и подключения');
console.log('├── scripts/          # Скрипты автоматизации');
console.log('├── docs/             # Документация');
console.log('├── logs/             # Логи приложения');
console.log('├── uploads/          # Загрузки пользователей');
console.log('└── Конфигурации      # .env, package.json, docker, nginx');
console.log('');
console.log('✨ Проект оптимизирован только для веб-сайта!');
