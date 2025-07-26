// Система авторизации для Chiwawa Server
// Создатель: ebluffy

class AuthSystem {
    constructor() {
        this.baseURL = '/api';
        this.currentUser = null;
        this.init();
    }

    init() {
        // Проверяем авторизацию при загрузке страницы
        this.checkAuth();
        
        // Настраиваем перехватчик для axios или fetch
        this.setupInterceptors();
    }

    async checkAuth() {
        try {
            const token = localStorage.getItem('chiwawa_token');
            if (!token) {
                this.redirectToLogin();
                return false;
            }

            const response = await fetch(`${this.baseURL}/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.currentUser = userData.user;
                this.updateAuthUI();
                return true;
            } else {
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('Ошибка проверки авторизации:', error);
            this.logout();
            return false;
        }
    }

    async login(credentials) {
        try {
            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('chiwawa_token', data.token);
                this.currentUser = data.user;
                this.updateAuthUI();
                this.showNotification('Успешная авторизация!', 'success');
                return { success: true, user: data.user };
            } else {
                this.showNotification(data.message || 'Ошибка авторизации', 'error');
                return { success: false, error: data.message };
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            this.showNotification('Ошибка соединения с сервером', 'error');
            return { success: false, error: 'Ошибка соединения' };
        }
    }

    logout() {
        localStorage.removeItem('chiwawa_token');
        this.currentUser = null;
        this.redirectToLogin();
    }

    redirectToLogin() {
        // Если мы уже на главной странице, показываем модальное окно входа
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            this.showLoginModal();
        } else {
            // Иначе перенаправляем на главную
            window.location.href = '/';
        }
    }

    showLoginModal() {
        // Создаём модальное окно входа, если его нет
        if (!document.getElementById('loginModal')) {
            this.createLoginModal();
        }
        document.getElementById('loginModal').style.display = 'block';
    }

    createLoginModal() {
        const modalHTML = `
            <div id="loginModal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <span class="close" id="closeLoginModal">&times;</span>
                    <h2 class="text-2xl font-title font-bold text-center mb-6 text-chiwawa-gradient">Вход в систему</h2>
                    
                    <form id="loginForm" class="space-y-4">
                        <div class="form-group">
                            <label for="loginEmail">Email</label>
                            <input type="email" id="loginEmail" name="email" required 
                                   placeholder="ваш@email.com">
                        </div>
                        
                        <div class="form-group">
                            <label for="loginPassword">Пароль</label>
                            <input type="password" id="loginPassword" name="password" required 
                                   placeholder="Введите пароль">
                        </div>
                        
                        <div class="flex items-center justify-between">
                            <label class="flex items-center">
                                <input type="checkbox" id="rememberMe" class="mr-2">
                                <span class="text-sm text-gray-600">Запомнить меня</span>
                            </label>
                            <a href="#" class="text-sm text-chiwawa-primary hover:text-chiwawa-dark">
                                Забыли пароль?
                            </a>
                        </div>
                        
                        <button type="submit" class="btn-chiwawa w-full">
                            <i class="fas fa-sign-in-alt mr-2"></i>
                            <span>Войти</span>
                        </button>
                    </form>
                    
                    <div class="text-center mt-4">
                        <p class="text-gray-600 text-sm">
                            Нет аккаунта? 
                            <button id="showRegisterBtn" class="text-chiwawa-primary hover:text-chiwawa-dark font-semibold">
                                Подайте заявку
                            </button>
                        </p>
                    </div>
                    
                    <div id="loginMessage" class="form-message mt-4" style="display: none;"></div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Обработчики событий
        document.getElementById('closeLoginModal').addEventListener('click', () => {
            document.getElementById('loginModal').style.display = 'none';
        });
        
        document.getElementById('loginForm').addEventListener('submit', this.handleLogin.bind(this));
        
        document.getElementById('showRegisterBtn').addEventListener('click', () => {
            document.getElementById('loginModal').style.display = 'none';
            // Показываем форму заявки
            if (typeof openModal === 'function') {
                openModal('application');
            }
        });
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const credentials = {
            email: formData.get('email'),
            password: formData.get('password'),
            remember: formData.get('rememberMe') === 'on'
        };
        
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Вход...';
        
        const result = await this.login(credentials);
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        
        if (result.success) {
            document.getElementById('loginModal').style.display = 'none';
            // Обновляем страницу или перенаправляем в зависимости от роли
            if (result.user.role === 'admin') {
                window.location.href = '/admin';
            } else {
                window.location.href = '/profile';
            }
        }
    }

    updateAuthUI() {
        if (!this.currentUser) return;
        
        // Обновляем элементы интерфейса
        const userNameElements = document.querySelectorAll('[data-user-name]');
        userNameElements.forEach(el => {
            el.textContent = this.currentUser.minecraft_nick || this.currentUser.email;
        });
        
        // Показываем/скрываем элементы в зависимости от роли
        if (this.currentUser.role === 'admin') {
            const adminElements = document.querySelectorAll('[data-admin-only]');
            adminElements.forEach(el => el.classList.remove('hidden'));
        }
        
        // Обработчик выхода
        const logoutButtons = document.querySelectorAll('#logoutBtn');
        logoutButtons.forEach(btn => {
            btn.addEventListener('click', () => this.logout());
        });
    }

    setupInterceptors() {
        // Перехватчик для добавления токена ко всем запросам
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const token = localStorage.getItem('chiwawa_token');
            if (token && args[1]) {
                args[1].headers = {
                    ...args[1].headers,
                    'Authorization': `Bearer ${token}`
                };
            } else if (token) {
                args[1] = {
                    ...args[1],
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                };
            }
            
            const response = await originalFetch(...args);
            
            // Если получили 401, перенаправляем на вход
            if (response.status === 401) {
                this.logout();
            }
            
            return response;
        };
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type} fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
        
        const icon = type === 'success' ? 'check-circle' : 
                    type === 'error' ? 'exclamation-circle' : 'info-circle';
        
        notification.innerHTML = `
            <div class="flex items-center space-x-3">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-auto">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Анимация появления
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Автоудаление через 5 секунд
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // Проверка прав доступа
    hasPermission(permission) {
        if (!this.currentUser) return false;
        
        const permissions = {
            'admin': ['view_admin', 'manage_users', 'manage_server', 'view_applications'],
            'moderator': ['view_applications', 'moderate_users'],
            'user': ['view_profile']
        };
        
        const userPermissions = permissions[this.currentUser.role] || [];
        return userPermissions.includes(permission);
    }

    requirePermission(permission) {
        if (!this.hasPermission(permission)) {
            this.showNotification('У вас нет прав для выполнения этого действия', 'error');
            return false;
        }
        return true;
    }
}

// Создаём глобальный экземпляр
window.authSystem = new AuthSystem();

// Экспортируем для использования в модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthSystem;
}
