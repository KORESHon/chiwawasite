# База данных настроек сервера - Исправления

## Проблема
В базе данных `server_settings` были дублированные записи с разными форматами ключей:
- **kebab-case** (правильный): `server-name`, `discord-invite`, `smtp-host`
- **snake_case** (неправильный): `server_name`, `discord_invite`, `smtp_host`

Это приводило к тому, что:
1. Админка сохраняла настройки с snake_case ключами
2. API для главной страницы читал kebab-case ключи
3. Настройки не синхронизировались между админкой и главной страницей

## Решение

### 1. Пересоздана таблица `server_settings`
- Удалены все дублированные записи (было 75, стало 37 настроек)
- Все ключи теперь в формате **kebab-case**
- Добавлены правильные категории и описания

### 2. Исправлена админка (`src/routes/admin.js`)

#### POST `/api/admin/settings` - Сохранение настроек:
```javascript
// БЫЛО (неправильно):
const settingsMapping = {
    server_name: { value: req.body.serverName, ... },
    discord_invite: { value: req.body.discordInvite, ... }
};

// СТАЛО (правильно):
const settingsMapping = {
    'server-name': { value: req.body.serverName, ... },
    'discord-invite': { value: req.body.discordInvite, ... }
};
```

#### GET `/api/admin/settings` - Чтение настроек:
```javascript
// БЫЛО (неправильно):
const camelKey = setting_key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

// СТАЛО (правильно):
const camelKey = setting_key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
```

### 3. Исправлена типизация данных
- `boolean` значения правильно парсятся из строк
- `integer` значения конвертируются в числа
- Добавлена обработка разных типов данных

## Структура базы данных

### Таблица `server_settings`
```sql
CREATE TABLE server_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,    -- kebab-case ключи
    setting_value TEXT,                          -- значение как строка
    setting_type VARCHAR(20) DEFAULT 'string',   -- string, integer, boolean
    category VARCHAR(50) DEFAULT 'general',      -- группировка настроек
    description TEXT,                            -- описание настройки
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);
```

### Категории настроек:
- **general**: `server-name`, `server-description`, `server-ip`, `discord-invite`, etc.
- **system**: `maintenance-mode`, `registration-enabled`, `auto-backup-enabled`
- **applications**: `applications-enabled`, `min-motivation-length`, etc.
- **trust**: `trust-points-email`, `trust-level-1-required`, etc.
- **security**: `max-login-attempts`, `jwt-expires-days`, etc.
- **email**: `smtp-host`, `smtp-port`, `smtp-user`, etc.

## API Endpoints

### GET `/api/settings/public`
Возвращает публичные настройки для главной страницы:
```json
{
  "serverName": "ChiwawaMine",
  "serverDescription": "Лучший Minecraft сервер...",
  "serverIp": "play.chiwawa.site",
  "serverPort": "25565",
  "discordInvite": "https://discord.gg/chiwawa",
  "telegramInvite": "https://t.me/chiwawa"
}
```

### GET `/api/admin/settings`
Возвращает все настройки для админки с группировкой по категориям и конвертацией в camelCase.

### POST `/api/admin/settings`
Сохраняет настройки, конвертируя camelCase в kebab-case для базы данных.

## Результат
✅ База данных очищена от дубликатов  
✅ Админка корректно сохраняет настройки  
✅ Главная страница получает актуальные данные  
✅ Полная синхронизация между компонентами системы  

**Количество настроек**: 37 (было 75 с дубликатами)  
**Формат ключей**: Единый kebab-case во всей системе  
**Совместимость**: API конвертирует ключи для совместимости с фронтендом  

## Тестирование
Система полностью протестирована на:
- Сохранение настроек через админку
- Чтение настроек в админке
- Получение публичных настроек
- Конвертацию форматов ключей
- Типизацию данных (string, integer, boolean)
- Полный цикл изменений

Все тесты пройдены успешно ✅
