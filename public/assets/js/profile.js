// Профиль пользователя для Chiwawa Server
// Создатель: ebluffy

class ProfileManager {
    constructor() {
        this.baseURL = '/api';
        this.currentProfile = null;
        this.init();
    }

    async init() {
        // Проверяем авторизацию
        const isAuthenticated = await window.authSystem.checkAuth();
        if (!isAuthenticated) {
            document.getElementById('authError').classList.remove('hidden');
            document.getElementById('loadingState').classList.add('hidden');
            return;
        }

        // Загружаем профиль
        await this.loadProfile();
        this.setupEventListeners();
    }

    async loadProfile() {
        try {
            const response = await fetch(`${this.baseURL}/profile`);
            
            if (response.ok) {
                this.currentProfile = await response.json();
                this.renderProfile();
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('profileContent').classList.remove('hidden');
            } else {
                throw new Error('Ошибка загрузки профиля');
            }
        } catch (error) {
            console.error('Ошибка загрузки профиля:', error);
            this.showError('Не удалось загрузить профиль');
        }
    }

    renderProfile() {
        const profile = this.currentProfile;
        
        // Основная информация
        document.getElementById('userName').textContent = profile.display_name || profile.minecraft_nick;
        document.getElementById('userNick').textContent = `@${profile.minecraft_nick}`;
        
        // Trust Level
        this.renderTrustLevel(profile.trust_level, profile.trust_progress);
        
        // Статистика
        this.renderStats(profile.stats);
        
        // Последняя активность
        this.renderActivity(profile.activity);
        
        // Форма настроек
        this.fillSettingsForm(profile);
    }

    renderTrustLevel(level, progress) {
        const trustLevels = [
            { name: 'Проходимец', color: 'gray', description: 'Новый пользователь' },
            { name: 'Новичок', color: 'yellow', description: 'Подтвержденный email' },
            { name: 'Проверенный', color: 'blue', description: 'Доверенный участник' },
            { name: 'Ветеран', color: 'purple', description: 'Опытный игрок' }
        ];

        const currentLevel = trustLevels[level] || trustLevels[0];
        const nextLevel = trustLevels[level + 1];

        // Обновляем индикатор уровня
        const trustLevelDot = document.getElementById('trustLevelDot');
        const trustLevelText = document.getElementById('trustLevelText');
        
        trustLevelDot.className = `w-3 h-3 rounded-full bg-${currentLevel.color}-500`;
        trustLevelText.textContent = `${currentLevel.name} (Trust Level ${level})`;
        trustLevelText.className = `text-sm font-semibold text-${currentLevel.color}-600`;

        // Прогресс
        const progressHTML = `
            <div class="bg-gradient-to-r from-${currentLevel.color}-50 to-${currentLevel.color}-100 border border-${currentLevel.color}-200 rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-semibold text-gray-800">Текущий уровень: ${currentLevel.name}</h4>
                    <span class="text-sm text-gray-600">Уровень ${level} из 3</span>
                </div>
                
                <div class="space-y-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 bg-${currentLevel.color}-500 rounded-full flex items-center justify-center">
                            <span class="text-white font-bold text-sm">${level}</span>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between items-center">
                                <span class="font-semibold text-${currentLevel.color}-700">${currentLevel.name}</span>
                                ${progress ? `<span class="text-sm text-gray-600">${progress.current}/${progress.required} ${progress.type}</span>` : ''}
                            </div>
                            ${progress ? `
                                <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                                    <div class="bg-${currentLevel.color}-500 h-2 rounded-full" style="width: ${(progress.current / progress.required) * 100}%"></div>
                                </div>
                            ` : '<div class="text-sm text-green-600 mt-1">✅ Уровень достигнут</div>'}
                        </div>
                    </div>
                    
                    ${nextLevel ? `
                        <div class="mt-4 p-3 bg-gray-50 rounded-lg">
                            <div class="text-sm font-semibold text-gray-700 mb-2">
                                <i class="fas fa-arrow-up mr-1"></i>
                                Следующий уровень: ${nextLevel.name}
                            </div>
                            <div class="text-xs text-gray-600">${nextLevel.description}</div>
                        </div>
                    ` : '<div class="text-sm text-green-600 mt-2">🎉 Максимальный уровень достигнут!</div>'}
                </div>
            </div>
        `;

        document.getElementById('trustLevelProgress').innerHTML = progressHTML;
    }

    renderStats(stats) {
        const statsHTML = [
            {
                icon: 'clock',
                value: this.formatTime(stats.playtime || 0),
                label: 'Время в игре',
                color: 'blue'
            },
            {
                icon: 'calendar',
                value: stats.days_registered || 0,
                label: 'Дней на сервере',
                color: 'green'
            },
            {
                icon: 'star',
                value: stats.reputation || 0,
                label: 'Репутация',
                color: 'yellow'
            },
            {
                icon: 'users',
                value: stats.friends || 0,
                label: 'Друзей',
                color: 'purple'
            }
        ].map(stat => `
            <div class="text-center p-4 bg-gray-50 rounded-lg">
                <div class="w-12 h-12 bg-${stat.color}-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <i class="fas fa-${stat.icon} text-${stat.color}-600"></i>
                </div>
                <div class="text-2xl font-bold text-gray-800">${stat.value}</div>
                <div class="text-sm text-gray-600">${stat.label}</div>
            </div>
        `).join('');

        document.getElementById('userStats').innerHTML = statsHTML;
    }

    renderActivity(activities) {
        if (!activities || activities.length === 0) {
            document.getElementById('userActivity').innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-history text-2xl mb-2"></i>
                    <p>Пока нет активности</p>
                </div>
            `;
            return;
        }

        const activityHTML = activities.map(activity => `
            <div class="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div class="w-8 h-8 bg-chiwawa-gradient rounded-full flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-${this.getActivityIcon(activity.type)} text-white text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-800">${activity.description}</p>
                    <p class="text-xs text-gray-500">${this.formatDate(activity.timestamp)}</p>
                </div>
            </div>
        `).join('');

        document.getElementById('userActivity').innerHTML = activityHTML;
    }

    fillSettingsForm(profile) {
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profileDiscord').value = profile.discord || '';
        document.getElementById('profileBio').value = profile.bio || '';
    }

    setupEventListeners() {
        // Форма настроек профиля
        document.getElementById('profileSettingsForm').addEventListener('submit', this.handleSettingsUpdate.bind(this));
        
        // Счетчик символов для биографии
        const bioField = document.getElementById('profileBio');
        bioField.addEventListener('input', () => {
            const remaining = 500 - bioField.value.length;
            const counter = bioField.parentElement.querySelector('.char-counter') || 
                          this.createCharCounter(bioField.parentElement);
            counter.textContent = `${bioField.value.length}/500`;
            counter.className = `char-counter text-xs ${remaining < 50 ? 'text-red-500' : 'text-gray-500'}`;
        });
    }

    createCharCounter(parent) {
        const counter = document.createElement('small');
        counter.className = 'char-counter text-xs text-gray-500';
        parent.appendChild(counter);
        return counter;
    }

    async handleSettingsUpdate(event) {
        event.preventDefault();

        const formData = new FormData(event.target);
        const updateData = {
            email: formData.get('email'),
            discord: formData.get('discord'),
            bio: formData.get('bio')
        };

        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Сохранение...';

        try {
            const response = await fetch(`${this.baseURL}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                window.authSystem.showNotification('Профиль успешно обновлён', 'success');
                // Обновляем текущий профиль
                Object.assign(this.currentProfile, updateData);
            } else {
                const error = await response.json();
                window.authSystem.showNotification(error.message || 'Ошибка обновления профиля', 'error');
            }
        } catch (error) {
            console.error('Ошибка обновления профиля:', error);
            window.authSystem.showNotification('Ошибка соединения с сервером', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}ч ${minutes}м`;
        }
        return `${minutes}м`;
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 60) {
            return `${minutes} мин назад`;
        } else if (hours < 24) {
            return `${hours} ч назад`;
        } else if (days < 7) {
            return `${days} дн назад`;
        } else {
            return date.toLocaleDateString('ru-RU');
        }
    }

    getActivityIcon(type) {
        const icons = {
            'login': 'sign-in-alt',
            'logout': 'sign-out-alt',
            'join_server': 'server',
            'leave_server': 'door-open',
            'achievement': 'trophy',
            'level_up': 'arrow-up',
            'build': 'hammer',
            'chat': 'comment',
            'trade': 'exchange-alt',
            'event': 'calendar-check'
        };
        return icons[type] || 'circle';
    }

    showError(message) {
        document.getElementById('loadingState').innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-3xl text-red-500 mb-4"></i>
                <h2 class="text-xl font-bold text-gray-800 mb-2">Ошибка загрузки</h2>
                <p class="text-gray-600 mb-6">${message}</p>
                <button onclick="location.reload()" class="btn-chiwawa">
                    <i class="fas fa-redo mr-2"></i>
                    <span>Попробовать снова</span>
                </button>
            </div>
        `;
    }
}

// Инициализируем при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new ProfileManager();
});
