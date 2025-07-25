# Chiwawa Server - Backend API
*Создатель: ebluffy*

## Описание

Express.js сервер для обработки заявок и предоставления API для сайта Chiwawa Server.

## API Endpoints

### POST /api/apply
Подача заявки на вступление в сервер.

**Параметры:**
- `minecraft_nick` - Ник в Minecraft (3-16 символов)
- `discord` - Discord пользователя
- `email` - Email адрес
- `reason` - Причина желания присоединиться (минимум 10 символов)

### GET /api/status
Получение статуса сервера (заглушка).

### GET /api/applications
Просмотр всех поданных заявок.

## Установка и запуск

```bash
cd backend
npm install
npm start
```

## Логирование

Заявки сохраняются в файл `applications.log`.