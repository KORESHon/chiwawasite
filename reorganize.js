#!/usr/bin/env node

/**
 * Скрипт реорганизации проекта Chiwawa Server
 * Создаёт оптимизированную структуру для VPS развертывания
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const OLD_STRUCTURE = {
    'backend/': 'src/',
    'website/': 'public/',
    'docs/': 'docs/',
    'chiwawa-plugin/': 'plugins/minecraft/',
    'discord-bot/': 'integrations/discord-bot/'
};

console.log('🔄 Реорганизация структуры проекта Chiwawa Server...\n');

// Создаём новую структуру папок
function createNewStructure() {
    console.log('📁 Создание новой структуры папок...');
    
    const newDirs = [
        'src',
        'src/routes',
        'src/middleware', 
        'src/models',
        'src/utils',
        'src/config',
        'public',
        'public/assets',
        'public/assets/css',
        'public/assets/js',
        'public/assets/images',
        'public/assets/fonts',
        'database',
        'database/migrations',
        'database/seeds',
        'scripts',
        'tests',
        'docs',
        'plugins',
        'plugins/minecraft',
        'integrations',
        'integrations/discord-bot',
        'logs',
        'uploads',
        'temp'
    ];
    
    newDirs.forEach(dir => {
        const dirPath = path.join(ROOT_DIR, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`✅ Создана папка: ${dir}`);
        }
    });
}

// Перемещение файлов
function moveFiles() {
    console.log('\n📦 Перемещение файлов...');
    
    const moves = [
        // Backend files
        { from: 'backend/server.js', to: 'src/server.js' },
        { from: 'backend/routes/', to: 'src/routes/' },
        { from: 'backend/database/', to: 'database/' },
        { from: 'backend/.env', to: '.env' },
        { from: 'backend/package.json', to: 'package.json' },
        { from: 'backend/package-lock.json', to: 'package-lock.json' },
        
        // Frontend files  
        { from: 'website/index.html', to: 'public/index.html' },
        { from: 'website/login.html', to: 'public/login.html' },
        { from: 'website/register.html', to: 'public/register.html' },
        { from: 'website/profile.html', to: 'public/profile.html' },
        { from: 'website/admin.html', to: 'public/admin.html' },
        { from: 'website/forgot-password.html', to: 'public/forgot-password.html' },
        { from: 'website/styles.css', to: 'public/assets/css/styles.css' },
        { from: 'website/script.js', to: 'public/assets/js/main.js' },
        { from: 'website/js/', to: 'public/assets/js/' },
        
        // Plugins
        { from: 'chiwawa-plugin/', to: 'plugins/minecraft/' },
        
        // Discord bot
        { from: 'discord-bot/', to: 'integrations/discord-bot/' },
        
        // Documentation
        { from: 'docs/', to: 'docs/' },
        { from: 'README.md', to: 'docs/OLD_README.md' },
        { from: 'NEW_README.md', to: 'README.md' }
    ];
    
    moves.forEach(move => {
        const fromPath = path.join(ROOT_DIR, move.from);
        const toPath = path.join(ROOT_DIR, move.to);
        
        if (fs.existsSync(fromPath)) {
            try {
                // Создаём папку если её нет
                const toDir = path.dirname(toPath);
                if (!fs.existsSync(toDir)) {
                    fs.mkdirSync(toDir, { recursive: true });
                }
                
                // Перемещаем файл/папку
                if (fs.statSync(fromPath).isDirectory()) {
                    copyDir(fromPath, toPath);
                } else {
                    fs.copyFileSync(fromPath, toPath);
                }
                
                console.log(`✅ Перемещено: ${move.from} → ${move.to}`);
            } catch (error) {
                console.log(`❌ Ошибка при перемещении ${move.from}: ${error.message}`);
            }
        }
    });
}

// Рекурсивное копирование папок
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// Очистка старых файлов
function cleanupOldFiles() {
    console.log('\n🧹 Очистка устаревших файлов...');
    
    const filesToRemove = [
        'website/admin_old.html',
        'website/profile_broken.html', 
        'website/profile_fixed.html',
        'website/profile_old.html',
        'website/index.old',
        'website/test.html',
        'backend/check_table.js',
        'backend/check_tables.js',
        'backend/create_email_table.js',
        'backend/migrate.js',
        'backend/test-api-compatibility.js',
        'backend/test-db-compatibility.js',
        'AUTH_SYSTEM.md',
        'REGISTRATION_UPDATE.md',
        'DATABASE_COMPATIBILITY_REPORT.md',
        'QUICK_START.md',
        'start.bat'
    ];
    
    filesToRemove.forEach(file => {
        const filePath = path.join(ROOT_DIR, file);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Удален: ${file}`);
            } catch (error) {
                console.log(`❌ Не удалось удалить ${file}: ${error.message}`);
            }
        }
    });
}

// Создание конфигурационных файлов
function createConfigFiles() {
    console.log('\n⚙️ Создание конфигурационных файлов...');
    
    // .env.example
    const envExample = `# Chiwawa Server Configuration

# База данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chiwawa
DB_USER=chiwawa
DB_PASSWORD=mtU-PSM-cFP-2D6

# JWT
JWT_SECRET=your_super_secret_jwt_key_here_change_in_production

# Email (SMTP)
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=chiwawa.helper@yandex.ru
SMTP_PASSWORD=your_smtp_password

# Discord OAuth (опционально)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_BOT_TOKEN=your_discord_bot_token

# Сервер
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# Minecraft сервер
MINECRAFT_SERVER_HOST=localhost
MINECRAFT_SERVER_PORT=25565

# Безопасность
SESSION_SECRET=your_session_secret_here
BCRYPT_ROUNDS=12

# Лимиты
MAX_LOGIN_ATTEMPTS=5
LOGIN_TIMEOUT=15

# Файлы
UPLOAD_MAX_SIZE=5242880
ALLOWED_FILE_TYPES=png,jpg,jpeg,gif

# Логирование
LOG_LEVEL=info
LOG_FILE=logs/chiwawa.log
`;

    // ecosystem.config.js для PM2
    const pm2Config = `module.exports = {
  apps: [{
    name: 'chiwawa-server',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
`;

    // nginx.conf
    const nginxConfig = `server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Редирект на HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;
    
    # SSL сертификаты
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/private.key;
    
    # Статические файлы
    location /assets/ {
        alias /opt/chiwawa-server/public/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API запросы
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Основное приложение
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;

    // Dockerfile
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Создание пользователя
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Установка прав
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
`;

    // docker-compose.yml
    const dockerCompose = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
    depends_on:
      - postgres
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: chiwawa
      POSTGRES_USER: chiwawa
      POSTGRES_PASSWORD: mtU-PSM-cFP-2D6
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./public:/usr/share/nginx/html
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
`;

    const files = [
        { name: '.env.example', content: envExample },
        { name: 'ecosystem.config.js', content: pm2Config },
        { name: 'nginx.conf', content: nginxConfig },
        { name: 'Dockerfile', content: dockerfile },
        { name: 'docker-compose.yml', content: dockerCompose }
    ];
    
    files.forEach(file => {
        const filePath = path.join(ROOT_DIR, file.name);
        fs.writeFileSync(filePath, file.content);
        console.log(`✅ Создан: ${file.name}`);
    });
}

// Обновление package.json
function updatePackageJson() {
    console.log('\n📦 Обновление package.json...');
    
    const packageJsonPath = path.join(ROOT_DIR, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Обновляем скрипты
        packageJson.scripts = {
            "start": "node src/server.js",
            "dev": "nodemon src/server.js",
            "build": "echo 'Building for production...'",
            "test": "jest",
            "lint": "eslint src/",
            "format": "prettier --write src/",
            "db:create": "node scripts/create-database.js",
            "db:migrate": "node scripts/migrate.js", 
            "db:seed": "node scripts/seed.js",
            "db:backup": "node scripts/backup.js",
            "pm2:start": "pm2 start ecosystem.config.js",
            "pm2:stop": "pm2 stop chiwawa-server",
            "pm2:restart": "pm2 restart chiwawa-server",
            "pm2:logs": "pm2 logs chiwawa-server",
            "docker:build": "docker build -t chiwawa-server .",
            "docker:run": "docker-compose up -d",
            "docker:stop": "docker-compose down"
        };
        
        // Обновляем main файл
        packageJson.main = "src/server.js";
        
        // Добавляем метаданные
        packageJson.name = "chiwawa-server";
        packageJson.version = "2.1.0";
        packageJson.description = "Приватный Minecraft сервер с веб-интерфейсом";
        packageJson.author = "ebluffy <dima2_05@mail.ru>";
        packageJson.license = "MIT";
        packageJson.repository = {
            "type": "git",
            "url": "https://github.com/your-username/chiwawa-server.git"
        };
        packageJson.keywords = [
            "minecraft",
            "server",
            "nodejs",
            "postgresql", 
            "discord",
            "whitelist"
        ];
        
        // Добавляем dev зависимости
        if (!packageJson.devDependencies) {
            packageJson.devDependencies = {};
        }
        packageJson.devDependencies.nodemon = "^3.0.1";
        packageJson.devDependencies.jest = "^29.7.0";
        packageJson.devDependencies.eslint = "^8.50.0";
        packageJson.devDependencies.prettier = "^3.0.3";
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log('✅ package.json обновлен');
    }
}

// Создание .gitignore
function createGitignore() {
    const gitignorePath = path.join(ROOT_DIR, '.gitignore');
    
    const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.production

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Uploads
uploads/
temp/

# Database backups
*.sql.backup
*.dump

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# PM2
.pm2/

# Docker
.docker/

# Build outputs
dist/
build/

# Cache
.cache/
.tmp/
`;

    fs.writeFileSync(gitignorePath, gitignoreContent);
    console.log('✅ .gitignore создан');
}

// Основная функция
function main() {
    try {
        createNewStructure();
        moveFiles();
        cleanupOldFiles();
        createConfigFiles();
        updatePackageJson();
        createGitignore();
        
        console.log('\n🎉 Реорганизация завершена успешно!');
        console.log('\n📋 Следующие шаги:');
        console.log('1. Скопируйте .env.example в .env и настройте');
        console.log('2. Установите зависимости: npm install');
        console.log('3. Создайте базу данных: npm run db:create');
        console.log('4. Запустите сервер: npm start');
        console.log('\n🚀 Готов к развертыванию на VPS!');
        
    } catch (error) {
        console.error('❌ Ошибка при реорганизации:', error);
    }
}

// Запуск
if (require.main === module) {
    main();
}

module.exports = { main };
