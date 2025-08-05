// Тестовый скрипт для проверки редактора аватара
console.log('Тестируем редактор аватара...');

// Проверяем, что модальное окно существует
const modal = document.getElementById('avatar-editor-modal');
console.log('Модальное окно найдено:', modal !== null);

// Проверяем, что изображение существует
const image = document.getElementById('cropper-image');
console.log('Элемент изображения найден:', image !== null);

// Проверяем, что все кнопки существуют
const buttons = [
    'close-avatar-editor',
    'cancel-avatar-edit', 
    'save-avatar-edit',
    'rotate-left',
    'rotate-right',
    'flip-horizontal',
    'reset-crop'
];

buttons.forEach(id => {
    const btn = document.getElementById(id);
    console.log(`Кнопка ${id} найдена:`, btn !== null);
});

// Проверяем слайдер зума
const zoomSlider = document.getElementById('zoom-slider');
console.log('Слайдер зума найден:', zoomSlider !== null);

// Проверяем функции
console.log('Функция openAvatarEditor:', typeof openAvatarEditor);
console.log('Функция closeAvatarEditor:', typeof closeAvatarEditor);
console.log('Функция saveAvatar:', typeof saveAvatar);

console.log('Тест завершён!');
