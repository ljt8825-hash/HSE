@echo off
setlocal enabledelayedexpansion

REM ============================================
REM  HSE Dashboard - Start Dev Server (Windows)
REM  Frontend: Vben Admin v5.7 (http://localhost:5666)
REM  Backend:  Node.js Express (http://localhost:3000)
REM ============================================

title HSE Dashboard Dev Launcher
cls

echo.
echo ============================================
echo         HSE Dashboard Dev Launcher
echo ============================================
echo.

set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%..\server"
set "FRONTEND_DIR=%PROJECT_DIR%apps\web-antd"
set "FRONTEND_URL=http://localhost:5666"
set "BACKEND_URL=http://localhost:3000"

echo [CHECK ENVIRONMENT]
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Node.js is not installed
    echo      Please install Node.js first: https://nodejs.org/
    goto :error_exit
)
echo   OK: Node.js is installed

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: npm is not installed
    goto :error_exit
)
echo   OK: npm is installed

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo   WARN: pnpm is not installed, trying to install...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo   ERROR: Failed to install pnpm. Please run: npm install -g pnpm
        goto :error_exit
    )
)
echo   OK: pnpm is installed

echo.
echo ============================================
echo.

echo [1/2] Starting Backend Service...
echo        Directory: %BACKEND_DIR%
echo        Port: 3000
echo.

if exist "%BACKEND_DIR%\package.json" (
    start "[BACKEND] HSE Server" /d "%BACKEND_DIR%" cmd /k "npm run dev"
    timeout /t 3 /nobreak >nul 2>&1
) else (
    echo   WARN: Backend not found, skipping...
)

echo.

echo [2/2] Starting Frontend Service...
echo        Directory: %FRONTEND_DIR%
echo        Port: 5666 (auto-switch if occupied)
echo.

if exist "%FRONTEND_DIR%\package.json" (
    start "[FRONTEND] Vben Admin" /d "%FRONTEND_DIR%" cmd /k "pnpm dev"
) else (
    echo   ERROR: Frontend project not found
    goto :error_exit
)

echo.
echo ============================================
echo.
echo [3/3] Waiting for services to initialize...
timeout /t 12 /nobreak >nul 2>&1

echo   Opening browser...
start "" "%FRONTEND_URL%"

echo.
echo ============================================
echo              START COMPLETE
echo ============================================
echo   Frontend: %FRONTEND_URL%
echo   Backend:  %BACKEND_URL%
echo ============================================
echo   Login: vben / 123456
echo ============================================
echo   Tips:
echo   - Services started in new windows
echo   - Closing this window won't stop services
echo   - Close service windows to stop
echo ============================================
echo.
pause
goto :eof

:error_exit
echo.
echo ============================================
echo               START FAILED
echo ============================================
echo   Please check the error messages above.
echo ============================================
echo.
pause
exit /b 1
