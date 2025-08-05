// Общие функции для работы с пользователем и навигацией
// Создатель: ebluffy

// Функция для обновления информации пользователя в навигации
window.updateUserNavigation = function(userData) {
    const userProfile = document.getElementById('user-profile');
    const userNickname = document.getElementById('user-nickname');
    const adminDropdownLink = document.getElementById('admin-dropdown-link');
    const navbarAvatar = document.getElementById('navbar-avatar');

    if (userProfile && userData && userData.user) {
        userProfile.classList.remove('hidden');
        
        // Устанавливаем никнейм
        if (userNickname) {
            userNickname.textContent = userData.user.nickname || userData.user.email || 'Пользователь';
        }
        
        // Устанавливаем аватарку
        if (navbarAvatar) {
            navbarAvatar.src = userData.user.avatar_url || '/assets/images/default-avatar.png';
            navbarAvatar.alt = `Аватар ${userData.user.nickname || 'пользователя'}`;
        }
        
        // Показываем админ панель для админов и модераторов
        if ((userData.user.role === 'admin' || userData.user.role === 'moderator') && adminDropdownLink) {
            adminDropdownLink.classList.remove('hidden');
        }
    }
};

// Функция для создания dropdown меню профиля
window.initProfileDropdown = function() {
    const profileDropdownBtn = document.getElementById('profile-dropdown-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    
    if (profileDropdownBtn && profileDropdown) {
        profileDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });

        // Закрытие при клике вне меню
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !profileDropdownBtn.contains(e.target)) {
                profileDropdown.classList.add('hidden');
            }
        });
    }
};

// Функция для проверки авторизации и обновления навигации
window.checkAuthAndUpdateNav = async function() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        return null;
    }

    try {
        const response = await fetch('/api/auth/validate', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const userData = await response.json();
            updateUserNavigation(userData);
            return userData;
        } else {
            // Токен недействителен
            localStorage.removeItem('auth_token');
            localStorage.removeItem('remember_me');
            localStorage.removeItem('token_expires');
            return null;
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        return null;
    }
};

// Функция для выхода из системы
window.logout = function() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('remember_me');
    localStorage.removeItem('token_expires');
    window.location.href = '/login';
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем dropdown
    initProfileDropdown();
    
    // Проверяем авторизацию
    checkAuthAndUpdateNav();
    
    // Добавляем обработчик для кнопки выхода
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});
