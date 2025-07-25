$(document).ready(function() {
    // Скрываем прелоадер
    setTimeout(function() {
        $('#preloader').fadeOut(500, function() {
            $(this).remove();
        });
    }, 1000);
    
    // Мобильное меню
    $('#mobile-menu-button').click(function() {
        $('#mobile-menu').slideToggle(300);
        $(this).find('i').toggleClass('fa-bars fa-times');
    });
    
    // Плавный скролл для ссылок
    $('a[href^="#"]').on('click', function(e) {
        e.preventDefault();
        const target = $(this.getAttribute('href'));
        if (target.length) {
            $('html, body').animate({
                scrollTop: target.offset().top - 80
            }, 800);
        }
    });
    
    // Анимация карточек при появлении в viewport
    const animateOnScroll = function() {
        $('.feature-card, .team-card, .vote-card').each(function() {
            const cardPosition = $(this).offset().top;
            const scrollPosition = $(window).scrollTop() + $(window).height();
            
            if (scrollPosition > cardPosition + 100) {
                $(this).addClass('animate__animated animate__fadeInUp');
            }
        });
    };
    
    $(window).on('scroll', animateOnScroll);
    animateOnScroll(); // Инициализация при загрузке
    
    // Параллакс эффект для героя
    $(window).on('scroll', function() {
        const scroll = $(window).scrollTop();
        $('.hero-bg').css('transform', `translateY(${scroll * 0.3}px)`);
    });
    
    // Подсветка активного раздела в навигации
    const sections = $('section');
    $(window).on('scroll', function() {
        const currentPos = $(this).scrollTop();
        
        sections.each(function() {
            const top = $(this).offset().top - 100;
            const bottom = top + $(this).outerHeight();
            
            if (currentPos >= top && currentPos <= bottom) {
                const id = $(this).attr('id');
                $('a.nav-link').removeClass('text-secondary');
                $(`a.nav-link[href="#${id}"]`).addClass('text-secondary');
            }
        });
    });
});