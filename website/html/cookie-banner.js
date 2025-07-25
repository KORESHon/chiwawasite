// Cookie Banner JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, согласился ли пользователь уже на куки
    if (!getCookie('cookie_consent')) {
        showCookieBanner();
    }
    
    // Показать баннер куки
    function showCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }
    
    // Скрыть баннер куки
    function hideCookieBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    
    // Принять куки
    function acceptCookies() {
        setCookie('cookie_consent', 'accepted', 365);
        hideCookieBanner();
        console.log('Cookies accepted');
    }
    
    // Отклонить куки
    function declineCookies() {
        setCookie('cookie_consent', 'declined', 365);
        hideCookieBanner();
        // Удаляем все куки кроме consent
        clearNonEssentialCookies();
        console.log('Cookies declined');
    }
    
    // Установить куки
    function setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/';
    }
    
    // Получить куки
    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
    
    // Очистить не необходимые куки
    function clearNonEssentialCookies() {
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            
            // Оставляем только необходимые куки
            if (name !== 'cookie_consent' && name !== 'PHPSESSID') {
                document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
            }
        }
    }
    
    // Привязываем обработчики к кнопкам
    const acceptBtn = document.getElementById('accept-cookies');
    const declineBtn = document.getElementById('decline-cookies');
    
    if (acceptBtn) {
        acceptBtn.addEventListener('click', acceptCookies);
    }
    
    if (declineBtn) {
        declineBtn.addEventListener('click', declineCookies);
    }
});
