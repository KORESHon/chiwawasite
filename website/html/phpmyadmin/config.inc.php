<?php
/**
 * phpMyAdmin configuration for ChiwawaShop
 */

// Основные настройки
$cfg['blowfish_secret'] = 'ChiwawaShop2025SecretKeyForEncryption!';
$cfg['DefaultLang'] = 'ru';
$cfg['ServerDefault'] = 1;

// Настройки MySQL сервера
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;

// Настройки интерфейса
$cfg['UploadDir'] = '/tmp/';
$cfg['SaveDir'] = '/tmp/';
$cfg['MaxRows'] = 50;
$cfg['ProtectBinary'] = 'blob';
$cfg['DefaultTabServer'] = 'welcome';
$cfg['DefaultTabDatabase'] = 'structure';
$cfg['DefaultTabTable'] = 'browse';

// Безопасность
$cfg['ForceSSL'] = true; // Будет включено после SSL
$cfg['CheckConfigurationPermissions'] = false;

// Настройки темы
$cfg['ThemeDefault'] = 'pmahomme';
$cfg['NavigationDisplayLogo'] = true;
$cfg['NavigationLogoLink'] = 'https://chiwawashop.ru';
$cfg['NavigationLogoLinkWindow'] = 'main';

// Настройки для загрузки файлов
$cfg['TempDir'] = '/tmp/';
$cfg['Export']['compression'] = 'gzip';
$cfg['Import']['charset'] = 'utf-8';

// Автовход для root (будет отключен в продакшене)
$cfg['LoginCookieValidity'] = 3600;
$cfg['LoginCookieStore'] = 0;
$cfg['LoginCookieDeleteAll'] = true;

// Настройки сессии
$cfg['MemoryLimit'] = '512M';
$cfg['ExecTimeLimit'] = 300;

// Настройки для MySQL 8
$cfg['Servers'][$i]['auth_swekey_config'] = '';
$cfg['Servers'][$i]['user'] = '';
$cfg['Servers'][$i]['password'] = '';
$cfg['Servers'][$i]['only_db'] = '';
$cfg['Servers'][$i]['hide_db'] = '';
$cfg['Servers'][$i]['verbose'] = 'ChiwawaShop MySQL Server';

// Отключаем проверки версий
$cfg['VersionCheck'] = false;
$cfg['SendErrorReports'] = 'never';
?>
