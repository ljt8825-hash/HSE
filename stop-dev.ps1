# ============================================================
# HSE Dashboard 开发环境停止脚本
# 用法: .\stop-dev.ps1
# ============================================================

$backendPort = 5666
$frontendPort = 5173

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  HSE Dashboard 开发环境停止" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 停止后端 (占用端口 5666 的 node 进程)
$backend = netstat -ano | Select-String ":$backendPort " | Select-String "LISTENING"
if ($backend) {
    $pid = ($backend -split "\s+")[-1]
    Write-Host "[1/2] 停止后端 (PID: $pid)..." -ForegroundColor Green
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Write-Host "     后端已停止" -ForegroundColor Gray
} else {
    Write-Host "[1/2] 后端未运行" -ForegroundColor Gray
}

# 停止前端 (占用端口 5173 的 node 进程)
$frontend = netstat -ano | Select-String ":$frontendPort " | Select-String "LISTENING"
if ($frontend) {
    $pid = ($frontend -split "\s+")[-1]
    Write-Host "[2/2] 停止前端 (PID: $pid)..." -ForegroundColor Green
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Write-Host "     前端已停止" -ForegroundColor Gray
} else {
    Write-Host "[2/2] 前端未运行" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  所有服务已停止" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan