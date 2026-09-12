@echo off
REM ============================================================
REM  HSE Dashboard - Naive UI Frontend-only Launcher (port :5173)
REM  Double-click to start only the Naive UI frontend.
REM  Pass "stop" to stop it:  start-hse-naive-fe.bat stop
REM ============================================================

NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs; exit"
    EXIT /B
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hse-naive-fe.ps1" %*
EXIT /B
