<header class="bg-dark/90 backdrop-blur-md sticky top-0 z-40 shadow-lg shadow-primary/10">
    <div class="container mx-auto px-4">
        <nav class="flex items-center justify-between py-4">
            <!-- Логотип -->
            <a href="/" class="flex items-center space-x-2 group">
                <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform">
                    <i class="fas fa-cube text-white text-xl"></i>
                </div>
                <span class="text-2xl font-title text-white"><?php echo SERVER_NAME; ?></span>
            </a>
            
            <!-- Основное меню -->
            <div class="hidden md:flex items-center space-x-8">
                <a href="/" class="nav-link hover:text-secondary">
                    <i class="fas fa-home mr-2"></i> Главная
                </a>
                <a href="/forum" class="nav-link hover:text-secondary">
                    <i class="fas fa-comments mr-2"></i> Форум
                </a>
                <a href="<?php echo DISCORD_LINK; ?>" target="_blank" class="nav-link hover:text-secondary">
                    <i class="fab fa-discord mr-2"></i> Дискорд
                </a>
                <a href="/rules" class="nav-link hover:text-secondary">
                    <i class="fas fa-book mr-2"></i> Правила
                </a>
                
                <!-- Онлайн счетчик -->
                <div id="online-counter" class="bg-gradient-to-r from-green-600 to-emerald-500 px-4 py-1 rounded-full text-sm font-semibold flex items-center">
                    <span class="relative flex h-3 w-3 mr-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                    </span>
                    <span id="online-number">296</span> онлайн
                </div>
            </div>
            
            <!-- Мобильное меню -->
            <button id="mobile-menu-button" class="md:hidden text-gray-300 hover:text-white focus:outline-none">
                <i class="fas fa-bars text-2xl"></i>
            </button>
        </nav>
        
        <!-- Мобильное меню (скрытое) -->
        <div id="mobile-menu" class="hidden md:hidden pb-4">
            <div class="flex flex-col space-y-3">
                <a href="/" class="nav-link hover:text-secondary px-2 py-1">
                    <i class="fas fa-home mr-2"></i> Главная
                </a>
                <a href="/forum" class="nav-link hover:text-secondary px-2 py-1">
                    <i class="fas fa-comments mr-2"></i> Форум
                </a>
                <a href="<?php echo DISCORD_LINK; ?>" target="_blank" class="nav-link hover:text-secondary px-2 py-1">
                    <i class="fab fa-discord mr-2"></i> Дискорд
                </a>
                <a href="/rules" class="nav-link hover:text-secondary px-2 py-1">
                    <i class="fas fa-book mr-2"></i> Правила
                </a>
                
                <div class="pt-2 border-t border-gray-700">
                    <div id="mobile-online-counter" class="bg-gradient-to-r from-green-600 to-emerald-500 px-4 py-1 rounded-full text-sm font-semibold inline-flex items-center">
                        <span class="relative flex h-3 w-3 mr-2">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                        </span>
                        <span id="mobile-online-number">296</span> онлайн
                    </div>
                </div>
            </div>
        </div>
    </div>
</header>