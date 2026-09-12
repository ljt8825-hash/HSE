# ============================================================
# HSE Dashboard 开发环境一键启动脚本
# 用法: 右键 start-dev.ps1 → "使用 PowerShell 运行"
#       或在终端中: .\start-dev.ps1
# ============================================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  HSE Dashboard 开发环境启动" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 后端端口
$backendPort = 5666
# 前端端口
$frontendPort = 5173
# 项目根目录
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $rootDir "server"
$frontendDir = Join-Path $rootDir "安全看板vben"

# 检查端口是否被占用
$backendBusy = netstat -ano | Select-String ":$backendPort " | Select-String "LISTENING"
if ($backendBusy) {
    Write-Host "[警告] 端口 $backendPort 已被占用，后端可能已在运行" -ForegroundColor Yellow
}

$frontendBusy = netstat -ano | Select-String ":$frontendPort " | Select-String "LISTENING"
if ($frontendBusy) {
    Write-Host "[警告] 端口 $frontendPort 已被占用，前端可能已在运行" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[1/2] 启动后端 (Express)..." -ForegroundColor Green
Write-Host "     目录: $serverDir" -ForegroundColor Gray
Write-Host "     端口: $backendPort" -ForegroundColor Gray
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host '=== HSE 后端服务 (端口 $backendPort) ===' -ForegroundColor Green; cd '$serverDir'; node app.js"
) -WindowStyle Normal
Write-Host "     后端已在独立窗口中启动" -ForegroundColor Gray

Write-Host ""
Write-Host "[2/2] 启动前端 (Vite)..." -ForegroundColor Green
Write-Host "     目录: $frontendDir" -ForegroundColor Gray
Write-Host "     端口: $frontendPort" -ForegroundColor Gray
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Write-Host '=== HSE 前端 (端口 $frontendPort) ===' -ForegroundColor Green; cd '$frontendDir'; pnpm dev"
) -WindowStyle Normal
Write-Host "     前端已在独立窗口中启动" -ForegroundColor Gray

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  启动完成！" -ForegroundColor Cyan
Write-Host "  前端: http://localhost:$frontendPort" -ForegroundColor White
Write-Host "  后端: http://localhost:$backendPort" -ForegroundColor White
Write-Host ""
Write-Host "  提示: 关闭对应的 PowerShell 窗口即可停止服务" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan

# 等待 3 秒后自动打开浏览器
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "正在打开浏览器..." -ForegroundColor Gray
Start-Process "http://localhost:$frontendPort"