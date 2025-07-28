-- Заполнение таблицы email_templates базовыми шаблонами
-- Выполнить после создания таблицы email_templates

-- Создаем таблицу если не существует
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    template_key VARCHAR(50) UNIQUE NOT NULL,
    template_name VARCHAR(100),
    subject_template TEXT NOT NULL,
    html_template TEXT NOT NULL,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Очищаем существующие шаблоны (если нужно обновить)
DELETE FROM email_templates;

-- Вставляем базовые шаблоны
INSERT INTO email_templates (template_key, template_name, subject_template, html_template, created_by, updated_by) VALUES

-- Приветственное письмо
('welcome', 'Приветственное письмо', 'Добро пожаловать на {{serverName}}!', 
'<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Приватный Minecraft сервер</p>
    </div>
    <h2 style="color: #f59e0b; text-align: center; margin-bottom: 25px; font-size: 24px;">Добро пожаловать, {{nickname}}!</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">🎉 Поздравляем! Ваша регистрация на нашем Minecraft сервере была успешно завершена. Мы рады приветствовать вас в нашем дружелюбном сообществе!</p>
    <div style="background: rgba(248, 181, 0, 0.1); border-left: 4px solid #f8b500; padding: 20px; margin: 25px 0; border-radius: 5px;">
        <h3 style="margin: 0 0 15px 0; color: #f8b500; font-size: 18px;">📍 Информация для подключения:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #e2e8f0;">
            <li style="margin-bottom: 8px;"><strong>IP сервера:</strong> {{serverIp}}:{{serverPort}}</li>
            <li style="margin-bottom: 8px;"><strong>Версия:</strong> Java Edition 1.20+</li>
            <li style="margin-bottom: 8px;"><strong>Режим:</strong> Выживание с улучшениями</li>
            <li><strong>Whitelist:</strong> Включен (вы уже добавлены)</li>
        </ul>
    </div>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{discordInvite}}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 0 10px 10px 0; box-shadow: 0 4px 12px rgba(88, 101, 242, 0.3);">🎮 Discord сервер</a>
        <a href="{{telegramInvite}}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #0088cc 0%, #006bb3 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 0 10px 10px 0; box-shadow: 0 4px 12px rgba(0, 136, 204, 0.3);">💬 Telegram чат</a>
    </div>
    <hr style="border: none; border-top: 2px solid #f8b500; margin: 40px 0; opacity: 0.5;">
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0;"><strong>С наилучшими пожеланиями,</strong></p>
        <p style="margin: 5px 0; color: #f8b500;">Команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">Дата отправки: {{currentDate}}</p>
    </div>
</div>', 1, 1),

-- Подтверждение email
('verification', 'Подтверждение email', 'Подтверждение email адреса - {{serverName}}',
'<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Подтверждение регистрации</p>
    </div>
    <h2 style="color: #10b981; text-align: center; margin-bottom: 25px; font-size: 24px;">🔐 Подтвердите ваш email</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Для завершения регистрации на сервере <strong>{{serverName}}</strong> необходимо подтвердить ваш email адрес.</p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{verificationLink}}" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);">✅ Подтвердить email адрес</a>
    </div>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #10b981;">Команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', 1, 1),

-- Заявка одобрена
('application-approved', 'Заявка одобрена', '🎉 Ваша заявка одобрена - {{serverName}}',
'<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Заявка рассмотрена</p>
    </div>
    <h2 style="color: #16a34a; text-align: center; margin-bottom: 25px; font-size: 24px;">🎉 Поздравляем! Заявка одобрена!</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">🌟 Отличные новости! Ваша заявка на присоединение к серверу <strong>{{serverName}}</strong> была одобрена!</p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{discordInvite}}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 0 10px 10px 0;">💬 Discord сообщество</a>
    </div>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #22c55e;">Команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', 1, 1),

-- Заявка отклонена
('application-rejected', 'Заявка отклонена', '❌ О вашей заявке - {{serverName}}',
'<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #fff; font-weight: bold;">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #fff; font-weight: 500;">Результат рассмотрения заявки</p>
    </div>
    <h2 style="color: #dc2626; text-align: center; margin-bottom: 25px; font-size: 24px;">❌ Заявка не одобрена</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">К сожалению, ваша заявка на присоединение к серверу <strong>{{serverName}}</strong> не была одобрена.</p>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #dc2626;">Администрация {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', 1, 1),

-- Сброс пароля
('password-reset', 'Сброс пароля', '🔑 Восстановление пароля - {{serverName}}',
'<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Восстановление доступа</p>
    </div>
    <h2 style="color: #f59e0b; text-align: center; margin-bottom: 25px; font-size: 24px;">🔑 Восстановление пароля</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Мы получили запрос на восстановление пароля для вашего аккаунта на сервере <strong>{{serverName}}</strong>.</p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{resetLink}}" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">🔐 Создать новый пароль</a>
    </div>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #f59e0b;">Команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', 1, 1),

-- Новостная рассылка
('newsletter', 'Новостная рассылка', '📰 Новости {{serverName}} - {{newsletterTitle}}',
'<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Новости и обновления</p>
    </div>
    <h2 style="color: #8b5cf6; text-align: center; margin-bottom: 25px; font-size: 24px;">📰 {{newsletterTitle}}</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <div style="text-align: center; margin: 40px 0;">
        <a href="{{discordInvite}}" style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 0 10px 10px 0;">💬 Discord</a>
    </div>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #8b5cf6;">Команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>', 1, 1);

-- Обновляем updated_at для всех записей
UPDATE email_templates SET updated_at = CURRENT_TIMESTAMP;

SELECT 'Шаблоны email успешно добавлены!' as message;
