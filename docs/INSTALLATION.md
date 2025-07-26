# 🚀 Руководство по установке Chiwawa Server

## 📋 Требования

### Системные требования
- **OS**: Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **RAM**: Минимум 2GB, рекомендуется 4GB+
- **CPU**: 2 ядра, рекомендуется 4+
- **Диск**: Минимум 10GB свободного места
- **Сеть**: Статический IP адрес

### Программное обеспечение
- **Node.js**: 18.0.0+
- **PostgreSQL**: 13.0+
- **Nginx**: 1.18+ (опционально)
- **PM2**: Для продакшена
- **Git**: Для развертывания

## 🛠️ Установка на VPS

### 1. Подготовка сервера

```bash
# Обновление системы (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y

# Установка необходимых пакетов
sudo apt install -y curl wget git nginx postgresql postgresql-contrib

# Установка Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2 глобально
sudo npm install -g pm2

# Проверка версий
node --version    # должно быть 18+
npm --version
psql --version
```

### 2. Настройка PostgreSQL

```bash
# Переключение на пользователя postgres
sudo -u postgres psql

# Создание пользователя и базы данных
CREATE USER chiwawa WITH PASSWORD 'mtU-PSM-cFP-2D6';
CREATE DATABASE chiwawa OWNER chiwawa;
GRANT ALL PRIVILEGES ON DATABASE chiwawa TO chiwawa;

# Выход из psql
\q
```

### 3. Клонирование и настройка проекта

```bash
# Создание директории и клонирование
sudo mkdir -p /opt/chiwawa-server
sudo chown $USER:$USER /opt/chiwawa-server
cd /opt/chiwawa-server

# Клонирование репозитория
git clone <your-repo-url> .

# Установка зависимостей
npm install --production

# Копирование и настройка окружения
cp .env.example .env
nano .env
```

### 4. Конфигурация .env

```env
# База данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chiwawa
DB_USER=chiwawa
DB_PASSWORD=mtU-PSM-cFP-2D6

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_in_production

# Email (настройте свой SMTP)
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=your_email@yandex.ru
SMTP_PASSWORD=your_smtp_password

# Сервер
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Discord (опционально)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

### 5. Инициализация базы данных

```bash
# Создание базы данных и таблиц
npm run db:create

# Проверка подключения
node -e "
const db = require('./database/connection');
db.query('SELECT COUNT(*) FROM users').then(r => {
  console.log('✅ База данных работает, пользователей:', r.rows[0].count);
  process.exit(0);
}).catch(e => {
  console.error('❌ Ошибка БД:', e.message);
  process.exit(1);
});
"
```

### 6. Настройка Nginx

```bash
# Создание конфигурации Nginx
sudo nano /etc/nginx/sites-available/chiwawa-server
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
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
    
    # Статические файлы
    location /assets/ {
        alias /opt/chiwawa-server/public/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Активация конфигурации
sudo ln -s /etc/nginx/sites-available/chiwawa-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Запуск через PM2

```bash
# Запуск приложения
npm run pm2:start

# Проверка статуса
pm2 list
pm2 logs chiwawa-server

# Автозапуск при перезагрузке
pm2 startup
pm2 save
```

### 8. Настройка SSL (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL сертификата
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Автообновление сертификата
sudo crontab -e
# Добавить строку:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🐳 Установка через Docker

### 1. Установка Docker

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Запуск через Docker Compose

```bash
# Клонирование проекта
git clone <your-repo-url> chiwawa-server
cd chiwawa-server

# Настройка окружения
cp .env.example .env
nano .env

# Запуск всех сервисов
npm run docker:run

# Проверка логов
docker-compose logs -f app
```

## ⚙️ Администрирование

### Полезные команды

```bash
# Мониторинг PM2
pm2 monit

# Перезапуск приложения
npm run pm2:restart

# Просмотр логов
npm run pm2:logs

# Резервное копирование БД
npm run db:backup

# Обновление из Git
git pull origin main
npm install --production
npm run pm2:restart
```

### Логи

```bash
# Логи приложения
tail -f logs/chiwawa.log

# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Логи PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*-main.log
```

### Мониторинг

```bash
# Использование ресурсов
htop

# Статус сервисов
sudo systemctl status nginx
sudo systemctl status postgresql

# Проверка портов
sudo netstat -tlnp | grep :3000
sudo netstat -tlnp | grep :80
```

## 🔧 Автоматический деплой

### Настройка

```bash
# На локальной машине
npm run deploy:configure

# Ввести данные сервера:
# - IP адрес VPS
# - Пользователь SSH
# - Порт SSH
# - Путь на сервере
```

### Деплой

```bash
# Автоматический деплой
npm run deploy

# Или вручную:
# 1. git push origin main
# 2. На сервере: git pull
# 3. npm install --production
# 4. npm run pm2:restart
```

## 🚨 Решение проблем

### Проблемы с базой данных

```bash
# Проверка подключения
sudo -u postgres psql -c "SELECT version();"

# Проверка пользователя
sudo -u postgres psql -c "SELECT usename FROM pg_user WHERE usename='chiwawa';"

# Сброс пароля
sudo -u postgres psql -c "ALTER USER chiwawa PASSWORD 'new_password';"
```

### Проблемы с портами

```bash
# Проверка занятых портов
sudo lsof -i :3000
sudo lsof -i :80

# Убить процесс на порту
sudo kill -9 $(sudo lsof -t -i:3000)
```

### Проблемы с правами

```bash
# Исправление прав на файлы
sudo chown -R $USER:$USER /opt/chiwawa-server
chmod +x scripts/*.js
```

## 📞 Поддержка

Если возникли проблемы:

1. **Проверьте логи**: `npm run pm2:logs`
2. **Статус сервисов**: `pm2 list`
3. **Подключение к БД**: проверьте `.env`
4. **Файрвол**: убедитесь что порты 80, 443, 3000 открыты

**Контакты:**
- Email: dima2_05@mail.ru
- Discord: [Ссылка на сервер]

---

⭐ **Готово! Ваш Chiwawa Server работает на VPS!**
