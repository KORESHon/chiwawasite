@echo off
REM Создатель: ebluffy
REM Скрипт для запуска Chiwawa Server

echo.
echo ===============================================
echo    Chiwawa Server - Запуск проекта
echo    Создатель: ebluffy
echo ===============================================
echo.

cd /d "%~dp0backend"

echo Проверка установки Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Node.js не установлен!
    echo Скачайте и установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js найден!
echo.

echo Проверка зависимостей...
if not exist "node_modules" (
    echo Установка зависимостей...
    npm install
    if %errorlevel% neq 0 (
        echo ОШИБКА: Не удалось установить зависимости!
        pause
        exit /b 1
    )
    echo Зависимости установлены успешно!
    echo.
)

echo Запуск сервера...
echo.
echo ===============================================
echo  Сервер будет доступен по адресу:
echo  http://localhost:3000
echo.
echo  Для остановки нажмите Ctrl+C
echo ===============================================
echo.

npm start
