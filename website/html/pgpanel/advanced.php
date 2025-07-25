<?php
// Улучшенная версия PostgreSQL панели
session_start();

// Конфигурация
$config = [
    'host' => 'localhost',
    'port' => '5432',
    'user' => 'root',
    'password' => 'Jorketin1488',
    'default_db' => 'postgres'
];

// Функция безопасного подключения
function connectPG($host, $port, $user, $password, $dbname) {
    try {
        $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
        $pdo = new PDO($dsn, $user, $password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $pdo;
    } catch (Exception $e) {
        return false;
    }
}

// Обработка действий
$action = $_GET['action'] ?? '';
$message = '';
$error = '';

if ($_POST) {
    $pdo = connectPG($config['host'], $config['port'], $config['user'], $config['password'], $_POST['database'] ?? $config['default_db']);
    
    if ($pdo) {
        try {
            if ($_POST['create_db']) {
                $dbname = $_POST['new_db_name'];
                $pdo->exec("CREATE DATABASE " . $pdo->quote($dbname));
                $message = "База данных '$dbname' создана успешно";
            }
            
            if ($_POST['sql_query']) {
                $query = $_POST['sql_query'];
                $_SESSION['last_query'] = $query;
                $stmt = $pdo->query($query);
                
                if (stripos($query, 'SELECT') === 0) {
                    $_SESSION['query_result'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $message = "Запрос выполнен. Строк: " . count($_SESSION['query_result']);
                } else {
                    $rowCount = $stmt->rowCount();
                    $message = "Запрос выполнен. Затронуто строк: $rowCount";
                }
            }
        } catch (Exception $e) {
            $error = "Ошибка: " . $e->getMessage();
        }
    } else {
        $error = "Ошибка подключения к базе данных";
    }
}

// Получаем список баз данных
$pdo = connectPG($config['host'], $config['port'], $config['user'], $config['password'], $config['default_db']);
$databases = [];
if ($pdo) {
    try {
        $stmt = $pdo->query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname");
        $databases = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Exception $e) {
        $error = "Ошибка получения списка БД: " . $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PostgreSQL Advanced Panel - ChiwawaShop</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism.min.css" rel="stylesheet">
    <style>
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { background: white; border-radius: 15px; margin: 20px auto; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .sql-editor { font-family: 'Courier New', monospace; font-size: 14px; }
        .result-table { max-height: 400px; overflow-y: auto; }
        .navbar-brand { font-weight: bold; }
    </style>
</head>
<body>
    <nav class="navbar navbar-dark bg-primary">
        <div class="container">
            <span class="navbar-brand">🐘 PostgreSQL Advanced Panel</span>
            <span class="text-white">ChiwawaShop VPS</span>
        </div>
    </nav>

    <div class="container mt-4">
        <?php if ($message): ?>
            <div class="alert alert-success"><?= htmlspecialchars($message) ?></div>
        <?php endif; ?>
        
        <?php if ($error): ?>
            <div class="alert alert-danger"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <div class="row">
            <div class="col-md-3">
                <div class="card">
                    <div class="card-header">
                        <h5>🗄️ Базы данных</h5>
                    </div>
                    <div class="card-body">
                        <?php foreach ($databases as $db): ?>
                            <div class="mb-2">
                                <button class="btn btn-outline-primary btn-sm w-100" onclick="selectDatabase('<?= htmlspecialchars($db) ?>')">
                                    <?= htmlspecialchars($db) ?>
                                </button>
                            </div>
                        <?php endforeach; ?>
                        
                        <hr>
                        <form method="post">
                            <div class="mb-2">
                                <input type="text" name="new_db_name" class="form-control form-control-sm" placeholder="Имя новой БД" required>
                            </div>
                            <button type="submit" name="create_db" class="btn btn-success btn-sm w-100">Создать БД</button>
                        </form>
                    </div>
                </div>
                
                <div class="card mt-3">
                    <div class="card-header">
                        <h6>📋 Быстрые запросы</h6>
                    </div>
                    <div class="card-body">
                        <button class="btn btn-link btn-sm p-0 mb-1" onclick="insertQuery('SELECT version();')">Версия PostgreSQL</button><br>
                        <button class="btn btn-link btn-sm p-0 mb-1" onclick="insertQuery('SELECT * FROM pg_tables WHERE schemaname = \'public\';')">Список таблиц</button><br>
                        <button class="btn btn-link btn-sm p-0 mb-1" onclick="insertQuery('SELECT * FROM information_schema.columns WHERE table_schema = \'public\';')">Структура таблиц</button><br>
                        <button class="btn btn-link btn-sm p-0 mb-1" onclick="insertQuery('SELECT * FROM pg_stat_activity;')">Активные соединения</button><br>
                    </div>
                </div>
            </div>
            
            <div class="col-md-9">
                <div class="card">
                    <div class="card-header">
                        <h5>📝 SQL Редактор</h5>
                    </div>
                    <div class="card-body">
                        <form method="post">
                            <div class="mb-3">
                                <label>База данных:</label>
                                <select name="database" class="form-select" id="databaseSelect">
                                    <?php foreach ($databases as $db): ?>
                                        <option value="<?= htmlspecialchars($db) ?>" <?= $db === 'postgres' ? 'selected' : '' ?>>
                                            <?= htmlspecialchars($db) ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            
                            <div class="mb-3">
                                <textarea name="sql_query" id="sqlEditor" class="form-control sql-editor" rows="8" placeholder="Введите SQL запрос..."><?= htmlspecialchars($_SESSION['last_query'] ?? '') ?></textarea>
                            </div>
                            
                            <button type="submit" class="btn btn-primary">▶️ Выполнить запрос</button>
                            <button type="button" class="btn btn-secondary" onclick="clearEditor()">🗑️ Очистить</button>
                        </form>
                    </div>
                </div>
                
                <?php if (isset($_SESSION['query_result']) && $_SESSION['query_result']): ?>
                <div class="card mt-3">
                    <div class="card-header">
                        <h5>📊 Результат запроса</h5>
                    </div>
                    <div class="card-body">
                        <div class="result-table">
                            <table class="table table-striped table-sm">
                                <thead>
                                    <tr>
                                        <?php foreach (array_keys($_SESSION['query_result'][0]) as $column): ?>
                                            <th><?= htmlspecialchars($column) ?></th>
                                        <?php endforeach; ?>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($_SESSION['query_result'] as $row): ?>
                                        <tr>
                                            <?php foreach ($row as $value): ?>
                                                <td><?= htmlspecialchars($value ?? 'NULL') ?></td>
                                            <?php endforeach; ?>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                        <p class="text-muted">Строк: <?= count($_SESSION['query_result']) ?></p>
                    </div>
                </div>
                <?php unset($_SESSION['query_result']); endif; ?>
            </div>
        </div>
        
        <div class="row mt-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <h5>📊 Информация о системе</h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6>🔑 Подключение:</h6>
                                <ul class="list-unstyled">
                                    <li><strong>Хост:</strong> <?= $config['host'] ?></li>
                                    <li><strong>Порт:</strong> <?= $config['port'] ?></li>
                                    <li><strong>Пользователь:</strong> <?= $config['user'] ?></li>
                                </ul>
                            </div>
                            <div class="col-md-6">
                                <h6>🌐 Навигация:</h6>
                                <a href="https://chiwawashop.ru" class="btn btn-outline-primary btn-sm">← Главная</a>
                                <a href="https://phpmyadmin.chiwawashop.ru" class="btn btn-outline-success btn-sm">MySQL</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        function selectDatabase(dbname) {
            document.getElementById('databaseSelect').value = dbname;
        }
        
        function insertQuery(query) {
            document.getElementById('sqlEditor').value = query;
        }
        
        function clearEditor() {
            document.getElementById('sqlEditor').value = '';
        }
    </script>
</body>
</html>
