const nodemailer = require('nodemailer');
const db = require('../../database/connection');

// Создаем транспортер для отправки email
const createTransporter = () => {
    // Конфигурация SMTP (можно вынести в .env)
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.yandex.ru',
        port: process.env.SMTP_PORT || 465,
        secure: true, // true для 465, false для других портов
        auth: {
            user: process.env.SMTP_USER || 'chiwawa.helper@yandex.ru',
            pass: process.env.SMTP_PASS || 'hoiigazkhichljfz'
        }
    });
};

// Функция получения шаблона из базы данных
const getEmailTemplate = async (id) => {
    try {
        const result = await db.query(`
            SELECT template_subject, template_html, template_variables FROM email_templates WHERE id = $1
        `, [id]);
        // Если шаблон не найден, выбрасываем ошибку   
        if (result.rows.length === 0) {
            throw new Error(`Email template with ID '${id}' not found`);
        }

        // template_variables может быть строкой (CSV) или JSON-массивом
        let variables = [];
        if (result.rows[0].template_variables) {
            try {
                if (result.rows[0].template_variables.trim().startsWith('[')) {
                    variables = JSON.parse(result.rows[0].template_variables);
                } else {
                    variables = result.rows[0].template_variables.split(',').map(v => v.trim());
                }
            } catch (e) {
                variables = [];
            }
        }

        return {
            subject: result.rows[0].template_subject,
            html: result.rows[0].template_html,
            variables: variables
        };
    } catch (error) {
        console.error('Ошибка получения шаблона email:', error);
        throw error;
    }
};

// Функция замены переменных в шаблоне
const replaceTemplateVariables = (template, variables) => {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value || '');
    }
    
    return result;
};

// Функция получения настроек сервера для переменных
const getServerSettings = async () => {
    try {
        const result = await db.query(`
            SELECT setting_key, setting_value FROM server_settings
        `);
        
        const settings = {};
        for (const row of result.rows) {
            settings[row.setting_key] = row.setting_value;
        }
        
        return {
            serverName: settings['server-name'] || 'Chiwawa',
            serverIp: settings['server-ip'] || 'play.chiwawa.site',
            discordInvite: settings['discord-invite'] || 'https://discord.gg/chiwawa',
            telegramInvite: settings['telegram-invite'] || 'https://t.me/chiwawa',
            currentDate: new Date().toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        };
    } catch (error) {
        console.error('Ошибка получения настроек сервера:', error);
        // Возвращаем значения по умолчанию
        return {
            serverName: 'Chiwawa',
            serverIp: 'play.chiwawa.site',
            discordInvite: 'https://discord.gg/chiwawa',
            telegramInvite: 'https://t.me/chiwawa',
            currentDate: new Date().toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        };
    }
};

// Основная функция отправки email
const sendEmail = async (to, id, customVariables = {}) => {
    try {
        console.log(`📧 Отправка email '${id}' на ${to}`);
        
        // Получаем шаблон
        const template = await getEmailTemplate(id);
        
        // Получаем настройки сервера
        const serverSettings = await getServerSettings();
        
        // Объединяем переменные
        const variables = {
            ...serverSettings,
            ...customVariables
        };

        // Валидация: проверяем, что все переменные из шаблона переданы
        if (template.variables && template.variables.length > 0) {
            const missing = template.variables.filter(v => !(v in variables));
            if (missing.length > 0) {
                console.warn(`⚠️ Не переданы переменные для шаблона: ${missing.join(', ')}`);
            }
        }

        // Заменяем переменные в шаблоне
        const subject = replaceTemplateVariables(template.subject, variables);
        const html = replaceTemplateVariables(template.html, variables);
        
        // Создаем транспортер
        const transporter = createTransporter();
        
        // Проверяем, настроены ли SMTP данные
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.log('⚠️ SMTP не настроен. Email симулируется.');
            console.log(`📧 Кому: ${to}`);
            console.log(`📋 Тема: ${subject}`);
            console.log(`🔗 Ссылка верификации: ${customVariables.verificationLink || 'не указана'}`);
            
            // Возвращаем успех для симуляции
            return {
                success: true,
                messageId: 'simulated-' + Date.now(),
                simulated: true
            };
        }
        
        // Отправляем email
        const info = await transporter.sendMail({
            from: `"${serverSettings.serverName}" <${process.env.SMTP_USER}>`,
            to: to,
            subject: subject,
            html: html
        });
        
        console.log('✅ Email отправлен:', info.messageId);
        
        return {
            success: true,
            messageId: info.messageId,
            simulated: false
        };
        
    } catch (error) {
        console.error('❌ Ошибка отправки email:', error);
        throw error;
    }
};

// Специализированные функции для разных типов писем
const sendVerificationEmail = async (email, nickname, verificationLink) => {
    return await sendEmail(email, 2, {
        nickname: nickname,
        verificationLink: verificationLink
    });
};

const sendWelcomeEmail = async (email, nickname) => {
    return await sendEmail(email, 1, {
        nickname: nickname
    });
};

const sendApplicationApprovedEmail = async (email, nickname) => {
    return await sendEmail(email, 3, {
        nickname: nickname
    });
};

const sendApplicationRejectedEmail = async (email, nickname, reason) => {
    return await sendEmail(email, 4, {
        nickname: nickname,
        rejectionReason: reason || 'Не указана'
    });
};

const sendPasswordResetEmail = async (email, nickname, resetLink) => {
    return await sendEmail(email, 5, {
        nickname: nickname,
        resetLink: resetLink
    });
};

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendWelcomeEmail,
    sendApplicationApprovedEmail,
    sendApplicationRejectedEmail,
    sendPasswordResetEmail
};
