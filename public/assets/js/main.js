// Создатель: ebluffy

document.addEventListener('DOMContentLoaded', function() {
    // Элементы DOM
    const applyBtn = document.getElementById('applyBtn');
    const discordBtn = document.getElementById('discordBtn');
    const modal = document.getElementById('applicationModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const applicationForm = document.getElementById('applicationForm');
    const formMessage = document.getElementById('formMessage');
    const serverStatus = document.getElementById('serverStatus');

    // Настройки
    const DISCORD_INVITE = 'https://discord.gg/your-invite'; // Замените на вашу ссылку Discord
    const API_BASE_URL = '/api'; // Базовый URL для API

    // Инициализация
    init();

    function init() {
        setupEventListeners();
        checkServerStatus();
    }

    function setupEventListeners() {
        // Открытие модального окна
        applyBtn.addEventListener('click', openModal);
        
        // Ссылка на Discord
        discordBtn.href = DISCORD_INVITE;
        
        // Закрытие модального окна
        closeModal.addEventListener('click', closeModalWindow);
        cancelBtn.addEventListener('click', closeModalWindow);
        
        // Закрытие по клику вне модального окна
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeModalWindow();
            }
        });
        
        // Обработка формы
        applicationForm.addEventListener('submit', handleFormSubmit);
        
        // Закрытие модального окна по ESC
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && modal.style.display === 'block') {
                closeModalWindow();
            }
        });
    }

    function openModal() {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Предотвращаем прокрутку фона
        hideMessage();
        applicationForm.reset();
    }

    function closeModalWindow() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // Восстанавливаем прокрутку
        hideMessage();
    }

    function hideMessage() {
        formMessage.style.display = 'none';
        formMessage.className = 'form-message';
    }

    function showMessage(text, type = 'success') {
        formMessage.textContent = text;
        formMessage.className = `form-message ${type}`;
        formMessage.style.display = 'block';
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        
        const formData = new FormData(applicationForm);
        const data = {
            minecraft_nick: formData.get('minecraft_nick').trim(),
            discord: formData.get('discord').trim(),
            email: formData.get('email').trim(),
            reason: formData.get('reason').trim()
        };

        // Простая валидация на фронтенде
        if (!data.minecraft_nick || !data.discord || !data.email || !data.reason) {
            showMessage('Пожалуйста, заполните все поля', 'error');
            return;
        }

        if (!isValidEmail(data.email)) {
            showMessage('Пожалуйста, введите корректный email', 'error');
            return;
        }

        // Отключаем кнопку отправки
        const submitBtn = applicationForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляется...';

        try {
            const response = await fetch(`${API_BASE_URL}/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showMessage('Заявка успешно отправлена! Мы рассмотрим её в ближайшее время.', 'success');
                applicationForm.reset();
                
                // Автоматически закрыть модальное окно через 3 секунды
                setTimeout(() => {
                    closeModalWindow();
                }, 3000);
            } else {
                showMessage(result.error || 'Произошла ошибка при отправке заявки', 'error');
            }
        } catch (error) {
            console.error('Ошибка при отправке заявки:', error);
            showMessage('Не удалось отправить заявку. Проверьте подключение к интернету.', 'error');
        } finally {
            // Восстанавливаем кнопку
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    async function checkServerStatus() {
        const statusDot = serverStatus.querySelector('.status-dot');
        const statusText = serverStatus.querySelector('.status-text');

        try {
            const response = await fetch(`${API_BASE_URL}/status`);
            const data = await response.json();

            if (data.online) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Сервер онлайн';
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Сервер оффлайн';
            }
        } catch (error) {
            console.error('Ошибка при проверке статуса сервера:', error);
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Статус недоступен';
        }
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Периодическая проверка статуса сервера (каждые 30 секунд)
    setInterval(checkServerStatus, 30000);
});
