<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo SERVER_NAME; ?> - Премиум Minecraft сервер</title>
    <meta name="description" content="Присоединяйтесь к лучшему Minecraft серверу <?php echo SERVER_NAME; ?> с уникальными режимами и дружным комьюнити">
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#6d28d9',
                        secondary: '#f59e0b',
                        dark: '#1f2937',
                        darker: '#111827'
                    },
                    fontFamily: {
                        'title': ['"Tektur"', 'sans-serif'],
                        'main': ['"Exo 2"', 'sans-serif']
                    },
                    animation: {
                        'float': 'float 6s ease-in-out infinite',
                        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    },
                    keyframes: {
                        float: {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-20px)' }
                        }
                    }
                }
            }
        }
    </script>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Tektur:wght@400;700&family=Exo+2:wght@300;400;600;700&display=swap" rel="stylesheet">
    
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- Custom CSS -->
    <link href="/assets/css/main.css" rel="stylesheet">
    
    <!-- jQuery -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body class="bg-darker font-main text-gray-100 antialiased">
    <!-- Preloader -->
    <div id="preloader" class="fixed inset-0 z-50 flex items-center justify-center bg-darker transition-opacity duration-500">
        <div class="text-center">
            <div class="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
            <h2 class="text-2xl font-title text-primary"><?php echo SERVER_NAME; ?></h2>
            <p class="text-secondary mt-2">Загрузка...</p>
        </div>
    </div>
    
    <div class="min-h-screen flex flex-col">