// Скрипт для отображения онлайн игроков
document.addEventListener('DOMContentLoaded', function() {
    const onlineCounter = document.getElementById('online-counter');
    const onlineNumber = document.getElementById('online-number');
    
    // Функция для обновления онлайн-статуса
    function updateOnlineStatus() {
        // Добавляем класс загрузки
        onlineCounter.classList.add('loading');
        onlineCounter.textContent = 'Загрузка...';
        
        // Здесь должен быть реальный запрос к API сервера
        // Это примерная реализация с заглушкой
        
        // Для реального проекта используйте API Minecraft сервера
        // Например, через mcapi.us или аналогичные сервисы
        
        // Заглушка - случайное число для демонстрации
        const randomOnline = Math.floor(Math.random() * 50) + 250;
        
        // Имитация задержки запроса
        setTimeout(() => {
            onlineCounter.textContent = `Онлайн: ${randomOnline}`;
            onlineNumber.textContent = randomOnline;
            onlineCounter.classList.remove('loading');
        }, 1000);
    }
    
    // Обновляем статус при загрузке
    updateOnlineStatus();
    
    // Обновляем каждые 2 минуты
    setInterval(updateOnlineStatus, 120000);
});