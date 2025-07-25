<!-- Волнообразный разделитель -->
<div class="wave-divider rotate-180">
    <svg data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" class="fill-dark"></path>
    </svg>
</div>

<footer class="bg-dark pt-20 pb-10">
    <div class="container mx-auto px-4">
        <!-- Голосование -->
        <section class="mb-16">
            <h2 class="text-3xl font-title font-bold mb-8 text-center">
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">ПРОГОЛОСУЙ</span> ЗА СЕРВЕР!
            </h2>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
                <?php foreach(VOTE_LINKS as $index => $link): ?>
                <a href="<?php echo $link; ?>" target="_blank" class="vote-card">
                    <div class="vote-card-icon">
                        <?php echo $index + 1; ?>
                    </div>
                    <div class="vote-card-body">
                        <h3 class="text-lg font-bold">Голосовать</h3>
                        <p class="text-sm text-gray-400">На сайте <?php echo parse_url($link, PHP_URL_HOST); ?></p>
                    </div>
                    <div class="vote-card-arrow">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </a>
                <?php endforeach; ?>
            </div>
        </section>
        
        <!-- Информация -->
        <div class="text-center pt-10 border-t border-gray-800">
            <div class="mb-6">
                <a href="/" class="inline-flex items-center space-x-2">
                    <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                        <i class="fas fa-cube text-white text-xl"></i>
                    </div>
                    <span class="text-2xl font-title text-white"><?php echo SERVER_NAME; ?></span>
                </a>
            </div>
            
            <p class="text-gray-500 max-w-2xl mx-auto mb-6">
                Самый инновационный Minecraft сервер с уникальными режимами и дружным комьюнити. Присоединяйся к нам и получи незабываемый игровой опыт!
            </p>
            
            <div class="flex justify-center space-x-6 mb-8">
                <a href="<?php echo DISCORD_LINK; ?>" target="_blank" class="text-gray-500 hover:text-white transition-colors text-2xl">
                    <i class="fab fa-discord"></i>
                </a>
                <a href="#" class="text-gray-500 hover:text-white transition-colors text-2xl">
                    <i class="fab fa-vk"></i>
                </a>
                <a href="#" class="text-gray-500 hover:text-white transition-colors text-2xl">
                    <i class="fab fa-youtube"></i>
                </a>
            </div>
            
            <p class="text-gray-600">
                Copyright &copy; <?php echo SERVER_NAME . ' ' . CURRENT_YEAR; ?>. Все права защищены.
            </p>
        </div>
    </div>
</footer>

<!-- Скрипты -->
<script src="/assets/js/main.js"></script>
<script src="/assets/js/online-counter.js"></script>

</div> <!-- закрывающий тег для flex container из header -->
</body>
</html>