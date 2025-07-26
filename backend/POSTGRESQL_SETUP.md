# Установка и настройка PostgreSQL

## Для Windows

### 1. Скачайте PostgreSQL
Скачайте PostgreSQL с официального сайта: https://www.postgresql.org/download/windows/

### 2. Установите PostgreSQL
- Запустите установщик
- Выберите порт 5432 (по умолчанию)
- Установите пароль для пользователя postgres
- Запомните пароль!

### 3. Создайте базу данных и пользователя

Откройте psql (SQL Shell) или pgAdmin и выполните:

```sql
-- Создаем пользователя
CREATE USER chiwawa WITH PASSWORD 'mtU-PSM-cFP-2D6';

-- Создаем базу данных
CREATE DATABASE chiwawa OWNER chiwawa;

-- Даем права пользователю
GRANT ALL PRIVILEGES ON DATABASE chiwawa TO chiwawa;
GRANT CREATE ON SCHEMA public TO chiwawa;
```

### 4. Настройте подключения (опционально)

Если нужны внешние подключения, отредактируйте файлы:

**postgresql.conf:**
```
listen_addresses = '*'
port = 5432
```

**pg_hba.conf:** (добавьте в конец)
```
host    all             all             0.0.0.0/0               md5
```

### 5. Запустите сервер

Запустите сервер с локальной БД:
```bash
npm run dev:local
```

## Быстрая команда для создания БД

```bash
# В psql под пользователем postgres
psql -U postgres -c "CREATE USER chiwawa WITH PASSWORD 'mtU-PSM-cFP-2D6';"
psql -U postgres -c "CREATE DATABASE chiwawa OWNER chiwawa;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE chiwawa TO chiwawa;"
```

## Структура БД

После подключения к БД запустите создание таблиц:
```bash
npm run db:setup
```
