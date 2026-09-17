@echo off
rem ============================================================
rem HSE 本地 AI 一键启动入口（AI-12）
rem 调用 start-hse-ai.ps1（BOM/UTF-8 由 ps1 内部保证）
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hse-ai.ps1"
