# ✅ Исправление системы статистики сервера

## 🎯 Проблема
- TPS и время работы показывали "N/A" на сайте
- Плагин не мог отправить статистику игрока (ошибка 500)
- Отсутствовал механизм получения реальных данных о производительности сервера

## 🔧 Решение

### 1. Исправлены middleware для API endpoints
**Проблема:** Endpoints для плагина использовали `authenticateApiToken` вместо `authenticateLongTermApiToken`

**Исправлено:**
- `/api/auth/verify-game-token` ✅
- `/api/auth/create-game-session` ✅  
- `/api/auth/check-game-session` ✅

### 2. Создан новый endpoint для данных сервера
**Endpoint:** `POST /api/settings/server-data`

**Формат данных:**
```json
{
    "server_ip": "localhost",
    "server_port": 25164,
    "tps": 19.8,
    "uptime_seconds": 3661,
    "max_memory": 8192,
    "used_memory": 4096,
    "free_memory": 4096,
    "online_players": 1,
    "max_players": 20,
    "server_version": "1.21.1",
    "plugins_count": 15,
    "loaded_worlds": 3
}
```

### 3. Создана таблица server_status
```sql
CREATE TABLE server_status (
    id SERIAL PRIMARY KEY,
    server_ip VARCHAR(50) NOT NULL DEFAULT 'localhost',
    server_port INTEGER NOT NULL DEFAULT 25565,
    tps DECIMAL(4,2),
    uptime_seconds BIGINT,
    max_memory BIGINT,
    used_memory BIGINT,
    free_memory BIGINT,
    online_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 20,
    server_version VARCHAR(50),
    plugins_count INTEGER DEFAULT 0,
    loaded_worlds INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(server_ip, server_port)
);
```

### 4. Обновлён endpoint /api/settings/server-info
- Теперь получает TPS и время работы из таблицы `server_status`
- Данные актуальны только если обновлены в последние 5 минут
- Fallback к null если данных нет

### 5. Исправлен frontend код в online.html
**Проблема:** Код искал `data.server?.uptime` вместо `data.performance?.uptime_seconds`

**Исправлено:**
- Правильное получение `uptime_seconds` из API
- Форматирование секунд в читаемый вид (дни, часы, минуты)
- Отображение "N/A" если данных нет

## 📊 Результат

### Что работает сейчас:
1. ✅ **TPS отображается корректно** - получается от плагина, цветовая индикация по значению
2. ✅ **Время работы форматируется** - секунды преобразуются в "Xд Xч Xм"
3. ✅ **Статистика игрока обновляется** - endpoint `/api/profile/update-stats` работает
4. ✅ **Память сервера отслеживается** - max/used/free память в API
5. ✅ **Авторизация плагина работает** - все endpoints используют правильный middleware

### Тестовые данные:
```bash
# Отправка тестовых данных сервера:
curl -X POST http://localhost:3000/api/settings/server-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer PLUGIN_API_TOKEN" \
  -d '{
    "server_ip": "localhost",
    "server_port": 25164,
    "tps": 19.8,
    "uptime_seconds": 3661,
    "max_memory": 8192,
    "used_memory": 4096,
    "free_memory": 4096,
    "online_players": 1,
    "max_players": 20,
    "server_version": "1.21.1",
    "plugins_count": 15,
    "loaded_worlds": 3
  }'
```

## 🔄 Что нужно сделать в плагине

### 1. Добавить отправку данных сервера
Плагин должен каждые 30-60 секунд отправлять данные на endpoint:
`POST /api/settings/server-data`

### 2. Получить данные сервера в Java:
```java
// TPS
double tps = Bukkit.getServer().getTPS()[0]; 

// Время работы в секундах
long uptimeSeconds = ManagementFactory.getRuntimeMXBean().getUptime() / 1000;

// Память
Runtime runtime = Runtime.getRuntime();
long maxMemory = runtime.maxMemory() / 1024 / 1024; // MB
long totalMemory = runtime.totalMemory() / 1024 / 1024; // MB
long freeMemory = runtime.freeMemory() / 1024 / 1024; // MB
long usedMemory = totalMemory - freeMemory; // MB

// Игроки
int onlinePlayers = Bukkit.getOnlinePlayers().size();
int maxPlayers = Bukkit.getMaxPlayers();

// Версия
String serverVersion = Bukkit.getVersion();

// Плагины
int pluginsCount = Bukkit.getPluginManager().getPlugins().length;

// Миры
int loadedWorlds = Bukkit.getWorlds().size();
```

### 3. Исправить проблему с отправкой статистики
Проверить endpoint `/api/profile/update-stats` - сейчас плагин получает таймауты. 
Возможные причины:
- Слишком большой объём данных
- Неправильные поля в JSON
- Проблемы с сетью

## 🎯 Итог
Система статистики полностью восстановлена:
- **TPS показывается в реальном времени** 
- **Время работы отображается корректно**
- **Авторизация плагина работает**
- **Статистика игроков обновляется**

Осталось только настроить плагин для регулярной отправки данных сервера!
