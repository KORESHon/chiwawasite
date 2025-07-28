const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Подключение к базе данных (как в основном проекте)
const pool = new Pool({
    host: process.env.DB_HOST || '212.15.49.139',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'chiwawa',
    user: process.env.DB_USER || 'chiwawa',
    password: process.env.DB_PASS || 'mtU-PSM-cFP-2D6',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const templates = [
    {
        key: 'welcome',
        name: 'Приветственное письмо',
        subject: 'Добро пожаловать на {{serverName}}!',
        html: `<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">{{serverName}}</h1>
        <p style="margin: 8px 0 0 0; color: #000; font-weight: 500;">Приватный Minecraft сервер</p>
    </div>
    <h2 style="color: #f59e0b; text-align: center; margin-bottom: 25px; font-size: 24px;">Добро пожаловать, {{nickname}}!</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">🎉 Поздравляем! Ваша регистрация на нашем Minecraft сервере была успешно завершена.</p>
    <div style="text-align: center; color: #94a3b8; font-size: 14px;">
        <p style="margin: 5px 0; color: #f8b500;">Команда {{serverName}}</p>
        <p style="margin: 15px 0 5px 0; font-size: 12px; opacity: 0.7;">{{currentDate}}</p>
    </div>
</div>`
    },
    {
        key: 'verification',
        name: 'Подтверждение email',
        subject: 'Подтверждение email адреса - {{serverName}}',
        html: `<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <div style="text-align: center; margin-bottom: 40px; padding: 25px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 10px;">
        <h1 style="margin: 0; font-size: 28px; color: #000; font-weight: bold;">{{serverName}}</h1>
    </div>
    <h2 style="color: #10b981; text-align: center; margin-bottom: 25px; font-size: 24px;">🔐 Подтвердите ваш email</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{verificationLink}}" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold;">✅ Подтвердить email</a>
    </div>
</div>`
    },
    {
        key: 'application-approved',
        name: 'Заявка одобрена',
        subject: '🎉 Ваша заявка одобрена - {{serverName}}',
        html: `<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <h2 style="color: #16a34a; text-align: center; margin-bottom: 25px; font-size: 24px;">🎉 Заявка одобрена!</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
</div>`
    },
    {
        key: 'application-rejected',
        name: 'Заявка отклонена',
        subject: '❌ О вашей заявке - {{serverName}}',
        html: `<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <h2 style="color: #dc2626; text-align: center; margin-bottom: 25px; font-size: 24px;">❌ Заявка не одобрена</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
</div>`
    },
    {
        key: 'password-reset',
        name: 'Сброс пароля',
        subject: '🔑 Восстановление пароля - {{serverName}}',
        html: `<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <h2 style="color: #f59e0b; text-align: center; margin-bottom: 25px; font-size: 24px;">🔑 Восстановление пароля</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
    <div style="text-align: center; margin: 35px 0;">
        <a href="{{resetLink}}" style="display: inline-block; padding: 18px 36px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold;">🔐 Создать новый пароль</a>
    </div>
</div>`
    },
    {
        key: 'newsletter',
        name: 'Новостная рассылка',
        subject: '📰 Новости {{serverName}}',
        html: `<div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px; padding: 40px; font-family: Arial, sans-serif; color: #ffffff;">
    <h2 style="color: #8b5cf6; text-align: center; margin-bottom: 25px; font-size: 24px;">📰 Новости</h2>
    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Привет, <strong style="color: #f8b500;">{{nickname}}</strong>!</p>
</div>`
    }
];

async function populateEmailTemplates() {
    const client = await pool.connect();
    
    try {
        console.log('🔄 Очищаем таблицу email_templates...');
        
        // Очищаем существующие шаблоны
        await client.query('DELETE FROM email_templates');
        console.log('🗑️ Старые шаблоны удалены');
        
        // Вставляем новые шаблоны
        for (const template of templates) {
            await client.query(`
                INSERT INTO email_templates (template_name, template_subject, template_html, is_active, updated_by)
                VALUES ($1, $2, $3, true, 1)
            `, [template.name, template.subject, template.html]);
            
            console.log(`✅ Добавлен шаблон: ${template.name}`);
        }
        
        console.log('🎉 Все шаблоны успешно добавлены!');
        
    } catch (error) {
        console.error('❌ Ошибка при заполнении шаблонов:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

populateEmailTemplates();
