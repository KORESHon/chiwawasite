<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PostgreSQL Panel - ChiwawaShop</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #336791, #2d5a87);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            color: white;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 40px;
            color: #333;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .info-box {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #336791;
        }
        .btn {
            background: linear-gradient(135deg, #336791, #2d5a87);
            color: white;
            padding: 12px 25px;
            text-decoration: none;
            border-radius: 8px;
            display: inline-block;
            margin: 10px 10px 10px 0;
            border: none;
            cursor: pointer;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .status {
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
        }
        textarea {
            width: 100%;
            height: 100px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐘 PostgreSQL Management Panel</h1>
            <p>ChiwawaShop PostgreSQL Database Interface</p>
        </div>
        
        <?php
        // Конфигурация подключения
        $host = 'localhost';
        $port = '5432';
        $user = 'root';
        $password = 'Jorketin1488';
        $dbname = 'postgres';
        
        try {
            $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
            $pdo = new PDO($dsn, $user, $password);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            echo '<div class="status success">✅ Подключение к PostgreSQL успешно</div>';
            
            // Получаем информацию о сервере
            $version = $pdo->query("SELECT version()")->fetchColumn();
            echo '<div class="info-box">';
            echo '<h3>📊 Информация о сервере:</h3>';
            echo '<p><strong>Версия:</strong> ' . htmlspecialchars($version) . '</p>';
            echo '</div>';
            
            // Список баз данных
            $stmt = $pdo->query("
                SELECT datname, 
                       pg_size_pretty(pg_database_size(datname)) as size,
                       datallowconn
                FROM pg_database 
                WHERE datistemplate = false 
                ORDER BY datname
            ");
            $databases = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo '<div class="info-box">';
            echo '<h3>🗄️ Базы данных:</h3>';
            echo '<table>';
            echo '<tr><th>Название</th><th>Размер</th><th>Подключения</th><th>Действия</th></tr>';
            foreach ($databases as $db) {
                $allowed = $db['datallowconn'] ? 'Разрешены' : 'Запрещены';
                echo '<tr>';
                echo '<td>' . htmlspecialchars($db['datname']) . '</td>';
                echo '<td>' . htmlspecialchars($db['size']) . '</td>';
                echo '<td>' . $allowed . '</td>';
                echo '<td><a href="?db=' . urlencode($db['datname']) . '" class="btn">Подключиться</a></td>';
                echo '</tr>';
            }
            echo '</table>';
            echo '<p><strong>Всего баз данных:</strong> ' . count($databases) . '</p>';
            echo '</div>';
            
            // Если выбрана конкретная база данных
            if (isset($_GET['db']) && !empty($_GET['db'])) {
                $selected_db = $_GET['db'];
                
                try {
                    $db_dsn = "pgsql:host=$host;port=$port;dbname=$selected_db";
                    $db_pdo = new PDO($db_dsn, $user, $password);
                    $db_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    
                    echo '<div class="info-box">';
                    echo '<h3>📋 База данных: ' . htmlspecialchars($selected_db) . '</h3>';
                    
                    // Список таблиц
                    $tables = $db_pdo->query("
                        SELECT tablename, schemaname 
                        FROM pg_tables 
                        WHERE schemaname = 'public' 
                        ORDER BY tablename
                    ")->fetchAll(PDO::FETCH_ASSOC);
                    
                    if ($tables) {
                        echo '<h4>Таблицы:</h4>';
                        echo '<ul>';
                        foreach ($tables as $table) {
                            echo '<li>' . htmlspecialchars($table['tablename']) . '</li>';
                        }
                        echo '</ul>';
                    } else {
                        echo '<p>В базе данных нет таблиц в схеме public.</p>';
                    }
                    echo '</div>';
                    
                } catch (Exception $e) {
                    echo '<div class="status error">❌ Ошибка подключения к базе ' . htmlspecialchars($selected_db) . ': ' . htmlspecialchars($e->getMessage()) . '</div>';
                }
            }
            
            // Форма для выполнения SQL
            if ($_POST['sql']) {
                echo '<div class="info-box">';
                echo '<h3>📝 Результат запроса:</h3>';
                try {
                    $query_db = $_POST['query_db'] ?: 'postgres';
                    $query_dsn = "pgsql:host=$host;port=$port;dbname=$query_db";
                    $query_pdo = new PDO($query_dsn, $user, $password);
                    $query_pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    
                    $stmt = $query_pdo->prepare($_POST['sql']);
                    $stmt->execute();
                    
                    if (stripos($_POST['sql'], 'SELECT') === 0) {
                        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                        if ($results) {
                            echo '<table>';
                            echo '<tr>';
                            foreach (array_keys($results[0]) as $column) {
                                echo '<th>' . htmlspecialchars($column) . '</th>';
                            }
                            echo '</tr>';
                            foreach ($results as $row) {
                                echo '<tr>';
                                foreach ($row as $value) {
                                    echo '<td>' . htmlspecialchars($value ?? 'NULL') . '</td>';
                                }
                                echo '</tr>';
                            }
                            echo '</table>';
                            echo '<p><strong>Строк:</strong> ' . count($results) . '</p>';
                        } else {
                            echo '<p>Запрос выполнен, но результатов нет.</p>';
                        }
                    } else {
                        $rowCount = $stmt->rowCount();
                        echo '<p class="status success">Запрос выполнен успешно. Затронуто строк: ' . $rowCount . '</p>';
                    }
                } catch (Exception $e) {
                    echo '<p class="status error">Ошибка выполнения запроса: ' . htmlspecialchars($e->getMessage()) . '</p>';
                }
                echo '</div>';
            }
            
        } catch (Exception $e) {
            echo '<div class="status error">❌ Ошибка подключения: ' . htmlspecialchars($e->getMessage()) . '</div>';
        }
        ?>
        
        <div class="info-box">
            <h3>🔑 Данные для подключения:</h3>
            <p><strong>Хост:</strong> localhost</p>
            <p><strong>Порт:</strong> 5432</p>
            <p><strong>Пользователь:</strong> root</p>
            <p><strong>Пароль:</strong> Jorketin1488</p>
        </div>
        
        <form method="post" style="margin: 20px 0;">
            <h3>📝 Выполнить SQL запрос:</h3>
            <p>
                <label>База данных:</label>
                <select name="query_db">
                    <option value="postgres">postgres</option>
                    <?php
                    if (isset($databases)) {
                        foreach ($databases as $db) {
                            if ($db['datname'] !== 'postgres') {
                                echo '<option value="' . htmlspecialchars($db['datname']) . '">' . htmlspecialchars($db['datname']) . '</option>';
                            }
                        }
                    }
                    ?>
                </select>
            </p>
            <textarea name="sql" placeholder="Например: SELECT * FROM pg_tables WHERE schemaname = 'public';"><?php echo htmlspecialchars($_POST['sql'] ?? ''); ?></textarea>
            <br><br>
            <input type="submit" value="Выполнить" class="btn">
        </form>
        
        <div class="info-box">
            <h3>📋 Полезные запросы:</h3>
            <p><strong>Версия PostgreSQL:</strong> <code>SELECT version();</code></p>
            <p><strong>Список таблиц:</strong> <code>SELECT * FROM pg_tables WHERE schemaname = 'public';</code></p>
            <p><strong>Размер БД:</strong> <code>SELECT pg_size_pretty(pg_database_size(current_database()));</code></p>
            <p><strong>Активные соединения:</strong> <code>SELECT * FROM pg_stat_activity;</code></p>
            <p><strong>Создать БД:</strong> <code>CREATE DATABASE myapp_db;</code></p>
            <p><strong>Создать пользователя:</strong> <code>CREATE USER myapp_user WITH PASSWORD 'password123';</code></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://chiwawashop.ru" class="btn">← Назад к главной</a>
            <a href="https://phpmyadmin.chiwawashop.ru" class="btn">MySQL (phpMyAdmin)</a>
        </div>
    </div>
</body>
</html>
