@echo off
title Job Bot - All Platforms
color 0A

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║           JOB BOT - MULTI PLATFORM          ║
echo  ║     Naukri + YC   Running until 6 PM...     ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Check if node exists
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

:: Check .env exists
if not exist ".env" (
    echo [ERROR] .env file not found.
    echo    Copy .env.example to .env and fill in your tokens
    pause
    exit /b 1
)

:: Create data folder if missing
if not exist "data" mkdir data

:: Make sure ollama is running
echo [*] Starting Ollama...
start /min ollama serve
timeout /t 3 /nobreak >nul

echo.
echo [*] Launching platforms...
echo     - Naukri Bot  ^(Naukri.com^)
echo     - YC Bot      ^(workatastartup.com^)
echo.
echo [!] Each bot has its own Telegram channel
echo [!] Both will run until 6:00 PM
echo.

:: Run both platforms in separate windows simultaneously
start "Naukri Bot" cmd /k "node index.js --platform=naukri --mode=live"
timeout /t 2 /nobreak >nul
start "YC Bot" cmd /k "node index.js --platform=yc --mode=live"

echo.
echo [OK] Both bots launched in separate windows!
echo      Check Telegram for job alerts.
echo.
pause
