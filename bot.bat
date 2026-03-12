@echo off
title Naukri Bot 🤖
color 0A

echo.
echo  ╔══════════════════════════════════════╗
echo  ║         NAUKRI JOB BOT               ║
echo  ║     Running until 6 PM...            ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check if node exists
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. Install it first.
    pause
    exit /b 1
)

:: Check .env exists
if not exist ".env" (
    echo ❌ .env file not found.
    echo    Create .env with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
    pause
    exit /b 1
)

:: Create data folder if missing
if not exist "data" mkdir data

:: Make sure ollama is running
echo 🤖 Starting Ollama...
start /min ollama serve

:: Small wait for ollama to start
timeout /t 3 /nobreak >nul

echo 🚀 Starting Naukri Bot in Live mode...
echo    Will run until 6:00 PM and stop automatically
echo    Check Telegram for job alerts!
echo.

node index.js --mode=live

echo.
echo ✅ Bot finished for today!
pause
