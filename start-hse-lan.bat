@echo off
REM ============================================================
REM  HSE Safety Dashboard - LAN Launcher (entry point)
REM  Double-click this file. It asks for Administrator, then
REM  hands off to start-hse-lan.ps1 which does the real work.
REM
REM  Usage:
REM    start-hse-lan.bat          -> start (asks for Admin)
REM    start-hse-lan.bat stop     -> stop both services
REM ============================================================

REM Self-elevate to Administrator
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Requesting administrator privileges...
    IF /I "%~1"=="stop" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'stop' -Verb RunAs; exit $LASTEXITCODE"
    ) ELSE (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs; exit $LASTEXITCODE"
    )
    EXIT /B
)

REM Already admin: run the PowerShell launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hse-lan.ps1" %*
EXIT /B
