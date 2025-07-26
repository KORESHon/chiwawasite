# Chiwawa Server System v2.1
# Приватный Minecraft сервер с веб-интерфейсом

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13%2B-blue)](https://postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🚀 Быстрый старт

### Установка на VPS
```bash
# Клонирование репозитория
git clone <your-repo-url> chiwawa-server
cd chiwawa-server

# Установка зависимостей
npm install

# Настройка окружения
cp .env.example .env
nano .env

# Создание базы данных
psql -U postgres -f database/schema.sql

# Запуск сервера
npm start
```

## 📁 Структура проекта

```
chiwawa-server/
├── 📱 Frontend (public/)
│   ├── index.html          # Главная страница
│   ├── profile.html        # Профиль пользователя
│   ├── admin.html          # Админ-панель
│   ├── assets/            # Статические файлы
│   └── js/                # JavaScript модули
├── 🔧 Backend (src/)
│   ├── routes/            # API маршруты
│   ├── middleware/        # Промежуточное ПО
│   ├── models/           # Модели данных
│   └── utils/            # Утилиты
├── 🗄️ Database
│   ├── schema.sql         # Схема БД
│   ├── migrations/        # Миграции
│   └── seeds/            # Начальные данные
├── 🔌 Plugins
│   └── minecraft/         # Minecraft плагин
├── 🤖 Discord Bot
│   └── discord-bot/       # Discord интеграция
└── 📚 Documentation
    ├── API.md            # API документация
    ├── SETUP.md          # Инструкции по установке
    └── DEPLOYMENT.md     # Развертывание
```

## 🛠️ Технологии

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Frontend**: HTML5 + CSS3 + Vanilla JS
- **Auth**: JWT + bcrypt
- **Minecraft**: Spigot/Paper Plugin
- **Discord**: Discord.js Bot

## 📋 Возможности

### 🌐 Веб-интерфейс
- ✅ Регистрация через заявки
- ✅ Личный кабинет игрока
- ✅ Админ-панель управления
- ✅ Trust Level система (0-5)
- ✅ Discord OAuth интеграция
- ✅ Email верификация

### 🎮 Minecraft интеграция
- ✅ Синхронизация игрового времени
- ✅ Автоматический whitelist
- ✅ Статистика игроков
- ✅ Система достижений

### 👑 Администрирование
- ✅ Управление пользователями
- ✅ Рассмотрение заявок
- ✅ Логи действий
- ✅ Статистика сервера

## ⚙️ Установка

### Требования
- Node.js 18+
- PostgreSQL 13+
- Minecraft Server (Spigot/Paper)
- Discord Bot Token (опционально)

### Конфигурация
Создайте файл `.env`:
```env
# База данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chiwawa
DB_USER=chiwawa
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret

# Email (SMTP)
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=your_email@yandex.ru
SMTP_PASSWORD=your_password

# Discord (опционально)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token

# Сервер
PORT=3000
NODE_ENV=production
```

### Команды

```bash
# Разработка
npm run dev           # Запуск в режиме разработки
npm run build         # Сборка для продакшена
npm test             # Запуск тестов

# Продакшен
npm start            # Запуск сервера
npm run pm2:start    # Запуск через PM2
npm run pm2:stop     # Остановка PM2

# База данных
npm run db:create    # Создание БД
npm run db:migrate   # Миграции
npm run db:seed      # Заполнение данными
npm run db:backup    # Резервная копия
```

## 🔧 Развертывание на VPS

### Nginx конфигурация
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
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
```

### PM2 конфигурация
```json
{
  "name": "chiwawa-server",
  "script": "src/server.js",
  "instances": 2,
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "PORT": 3000
  }
}
```

### Systemd сервис
```ini
[Unit]
Description=Chiwawa Server
After=network.target

[Service]
Type=simple
User=chiwawa
WorkingDirectory=/opt/chiwawa-server
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 📚 Документация

- [📖 API Reference](docs/API.md)
- [🔧 Setup Guide](docs/SETUP.md)
- [🚀 Deployment Guide](docs/DEPLOYMENT.md)
- [🔌 Plugin Development](docs/PLUGIN.md)
- [🤖 Discord Bot](docs/DISCORD.md)

## 🤝 Участие в разработке

1. Fork проекта
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📝 Лицензия

Распространяется под лицензией MIT. См. `LICENSE` для деталей.

## 👥 Авторы

- **ebluffy** - *Основной разработчик* - [@ebluffy](https://github.com/ebluffy)

## 📞 Поддержка

- **Discord**: [Ссылка на сервер](https://discord.gg/your-invite)
- **Email**: dima2_05@mail.ru
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)

---

⭐ **Поставьте звезду, если проект вам понравился!**
