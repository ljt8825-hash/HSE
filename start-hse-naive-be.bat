@echo off
REM ============================================================
REM  HSE Dashboard - Backend-only Launcher (port :5800)
REM  Double-click to start only the backend.
REM  Pass "stop" to stop it:  start-hse-naive-be.bat stop
REM ============================================================

NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs; exit"
    EXIT /B
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hse-naive-be.ps1" %*
EXIT /B
