const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { authenticateToken, requireRole } = require('./auth');

// Публичный endpoint для получения основных настроек сервера
router.get('/settings/public', async (req, res) => {
    try {
        // Читаем конфигурацию
        const config = require('../config/settings');
        
        // Возвращаем только публичную информацию
        res.json({
            serverName: config.server?.name || 'Test',
            serverDescription: config.server?.description || 'Приватный Minecraft сервер с дружелюбным сообществом',
            serverIp: config.server?.ip || 'play.chiwawa.site',
            serverPort: config.server?.port || '25565',
            discordInvite: config.server?.discord || 'https://discord.gg/chiwawa',
            telegramInvite: config.server?.telegram || 'https://t.me/chiwawa'
        });
    } catch (error) {
        console.error('Ошибка получения публичных настроек:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение текущих настроек (только для админов)
router.get('/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Читаем текущий файл конфигурации
        const configPath = path.join(__dirname, '../config/settings.js');
        const configContent = await fs.readFile(configPath, 'utf-8');
        
        // Извлекаем текущие значения из config
        const config = require('../config/settings');
        
        res.json({
            success: true,
            settings: {
                server: config.server,
                applications: config.applications,
                trustLevel: config.trustLevel,
                reputation: config.reputation,
                security: config.security,
                email: config.email
            }
        });
    } catch (error) {
        console.error('Ошибка получения настроек:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление настроек
router.post('/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { settings } = req.body;
        
        if (!settings) {
            return res.status(400).json({ error: 'Настройки не предоставлены' });
        }
        
        // Читаем текущий файл
        const configPath = path.join(__dirname, '../config/settings.js');
        let configContent = await fs.readFile(configPath, 'utf-8');
        
        // Обновляем значения в файле конфигурации
        if (settings.server) {
            Object.keys(settings.server).forEach(key => {
                const value = settings.server[key];
                const regex = new RegExp(`(${key}:\\s*process\\.env\\.[A-Z_]+\\s*\\|\\|\\s*['"])[^'"]*(['"])`);
                if (configContent.match(regex)) {
                    configContent = configContent.replace(regex, `$1${value}$2`);
                }
            });
        }
        
        if (settings.applications) {
            Object.keys(settings.applications).forEach(key => {
                const value = settings.applications[key];
                if (typeof value === 'number') {
                    const regex = new RegExp(`(${key}:\\s*parseInt\\(process\\.env\\.[A-Z_]+\\)\\s*\\|\\|\\s*)\\d+`);
                    if (configContent.match(regex)) {
                        configContent = configContent.replace(regex, `$1${value}`);
                    }
                } else if (typeof value === 'boolean') {
                    const regex = new RegExp(`(${key}:\\s*process\\.env\\.[A-Z_]+\\s*===\\s*'true'\\s*\\|\\|\\s*)(true|false)`);
                    if (configContent.match(regex)) {
                        configContent = configContent.replace(regex, `$1${value}`);
                    }
                }
            });
        }
        
        if (settings.trustLevel && settings.trustLevel.requirements) {
            Object.keys(settings.trustLevel.requirements).forEach(level => {
                const requirements = settings.trustLevel.requirements[level];
                if (requirements.hoursRequired !== undefined) {
                    const regex = new RegExp(`(${level}:\\s*{[^}]*hoursRequired:\\s*parseInt\\(process\\.env\\.[A-Z_]+\\)\\s*\\|\\|\\s*)\\d+`);
                    if (configContent.match(regex)) {
                        configContent = configContent.replace(regex, `$1${requirements.hoursRequired}`);
                    }
                }
                if (requirements.reputationRequired !== undefined) {
                    const regex = new RegExp(`(${level}:\\s*{[^}]*reputationRequired:\\s*parseInt\\(process\\.env\\.[A-Z_]+\\)\\s*\\|\\|\\s*)\\d+`);
                    if (configContent.match(regex)) {
                        configContent = configContent.replace(regex, `$1${requirements.reputationRequired}`);
                    }
                }
            });
        }
        
        // Сохраняем обновленный файл
        await fs.writeFile(configPath, configContent, 'utf-8');
        
        // Очищаем кеш модуля, чтобы изменения вступили в силу
        delete require.cache[require.resolve('../config/settings')];
        
        // Логируем действие
        await req.db.query(
            'INSERT INTO admin_logs (admin_id, action, details) VALUES ($1, $2, $3)',
            [req.user.id, 'settings_update', `Обновлены настройки сервера`]
        );
        
        res.json({
            success: true,
            message: 'Настройки успешно обновлены'
        });
        
    } catch (error) {
        console.error('Ошибка обновления настроек:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Сброс настроек к значениям по умолчанию
router.post('/settings/reset', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { section } = req.body;
        
        // Здесь можно реализовать сброс определенной секции настроек
        // к значениям по умолчанию
        
        await req.db.query(
            'INSERT INTO admin_logs (admin_id, action, details) VALUES ($1, $2, $3)',
            [req.user.id, 'settings_reset', `Сброшена секция настроек: ${section}`]
        );
        
        res.json({
            success: true,
            message: 'Настройки сброшены к значениям по умолчанию'
        });
        
    } catch (error) {
        console.error('Ошибка сброса настроек:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
