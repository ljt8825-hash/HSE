@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local-test-stack.ps1"
if errorlevel 1 pause
