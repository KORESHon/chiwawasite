<?php
// Строгая проверка безопасности
header('Content-Type: application/json');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('X-XSS-Protection: 1; mode=block');

// Проверяем метод запроса
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Получаем данные
$input = json_decode(file_get_contents('php://input'), true);
$code = $input['code'] ?? '';

// Логирование попыток
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$timestamp = date('Y-m-d H:i:s');
$logEntry = "[$timestamp] IP: $ip, Code attempt: " . substr($code, 0, 3) . "***\n";
file_put_contents('/var/log/chiwawamine-auth.log', $logEntry, FILE_APPEND | LOCK_EX);

// Проверка лимита попыток (защита от брут-форса)
$logFile = '/var/log/chiwawamine-auth.log';
$recentAttempts = 0;
$timeLimit = time() - 300; // 5 минут

if (file_exists($logFile)) {
    $lines = file($logFile);
    foreach (array_reverse($lines) as $line) {
        if (strpos($line, $ip) !== false) {
            $lineTime = strtotime(substr($line, 1, 19));
            if ($lineTime > $timeLimit) {
                $recentAttempts++;
            } else {
                break;
            }
        }
    }
}

// Если слишком много попыток
if ($recentAttempts > 5) {
    http_response_code(429);
    echo json_encode([
        'error' => 'Too many attempts',
        'message' => 'Слишком много попыток. Попробуйте через 5 минут.',
        'wait_time' => 300
    ]);
    exit;
}

// Проверяем код
$correctCode = 'Papamajor4';
if ($code === $correctCode) {
    // Генерируем временный токен
    $token = bin2hex(random_bytes(32));
    $tokenFile = '/tmp/chiwawamine_token_' . md5($ip);
    file_put_contents($tokenFile, $token . '|' . (time() + 3600)); // Токен на 1 час
    
    echo json_encode([
        'success' => true,
        'token' => $token,
        'message' => 'Доступ разрешен'
    ]);
} else {
    http_response_code(401);
    echo json_encode([
        'error' => 'Invalid code',
        'message' => 'Неверный код доступа'
    ]);
}
?>
