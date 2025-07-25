<section class="relative overflow-hidden">
    <!-- Фоновые элементы -->
    <div class="absolute inset-0 z-0">
        <div class="absolute inset-0 bg-gradient-to-b from-primary/10 to-darker"></div>
        <div class="absolute top-0 left-0 w-full h-full opacity-20">
            <div class="grid-pattern"></div>
        </div>
        
        <!-- Плавающие элементы -->
        <div class="absolute top-1/4 left-1/4 w-16 h-16 rounded-full bg-primary/20 blur-xl animate-float"></div>
        <div class="absolute top-1/3 right-1/4 w-24 h-24 rounded-full bg-secondary/20 blur-xl animate-float animation-delay-2000"></div>
        <div class="absolute bottom-1/4 left-1/2 w-20 h-20 rounded-full bg-purple-500/20 blur-xl animate-float animation-delay-3000"></div>
    </div>
    
    <div class="container mx-auto px-4 py-32 relative z-10">
        <div class="max-w-3xl mx-auto text-center">
            <h1 class="text-4xl md:text-6xl font-title font-bold mb-6 text-white">
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">ВАС ПРИВЕТСТВУЕТ</span><br>
                <?php echo SERVER_NAME; ?>
            </h1>
            
            <p class="text-xl md:text-2xl mb-8 leading-relaxed">
                Премиальный Minecraft сервер с уникальными режимами<br>
                <span class="inline-block mt-2">
                    Онлайн: <span id="hero-online-number" class="font-bold text-secondary">296</span> игроков
                </span>
            </p>
            
            <div class="flex flex-col sm:flex-row justify-center gap-4">
                <a href="minecraft://<?php echo SERVER_IP; ?>" 
                   class="bg-gradient-to-r from-primary to-purple-700 hover:from-primary/90 hover:to-purple-700/90 text-white font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105 shadow-lg hover:shadow-primary/30 flex items-center justify-center space-x-2">
                    <i class="fas fa-gamepad"></i>
                    <span>Подключиться</span>
                </a>
                
                <a href="<?php echo DISCORD_LINK; ?>" target="_blank" 
                   class="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-600/90 hover:to-indigo-700/90 text-white font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105 shadow-lg hover:shadow-blue-500/30 flex items-center justify-center space-x-2">
                    <i class="fab fa-discord"></i>
                    <span>Наш Discord</span>
                </a>
            </div>
        </div>
    </div>
    
    <!-- Волнообразный разделитель -->
    <div class="wave-divider">
        <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" class="fill-dark"></path>
        </svg>
    </div>
</section>