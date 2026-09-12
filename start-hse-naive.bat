@echo off
REM ============================================================
REM  HSE Dashboard - Naive UI LAN Launcher
REM  Double-click this file to start backend + Naive UI frontend.
REM ============================================================

NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs; exit"
    EXIT /B
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hse-naive.ps1" %*
EXIT /B