# 由 schtasks 计划任务在用户会话内运行，确保前后端独立常驻（不被工具会话回收）
$ErrorActionPreference = 'Continue'

$node = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
$root = "g:\hse-dashboard"
$logs = Join-Path $root "server\logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

Start-Transcript (Join-Path $logs "start-dev_transcript.log") -Append -ErrorAction SilentlyContinue
Write-Output "=== start-dev at $(Get-Date) node=$node ==="

# ---------- 后端 5800 ----------
try {
    $p1 = Start-Process -FilePath $node `
        -ArgumentList (Join-Path $root "server\app.js") `
        -WorkingDirectory (Join-Path $root "server") `
        -WindowStyle Hidden -PassThru
    Write-Output "backend started pid=$($p1.Id)"
} catch { Write-Output "backend start failed: $($_.Exception.Message)" }

# ---------- 前端 5173 (web-antd dev) ----------
$env:CI = 'true'
$env:FRONTEND_PORT = '5173'
$env:VITE_PROXY_TARGET = 'http://127.0.0.1:5800'
$wd = Join-Path $root "安全看板vben\apps\web-antd"
$viteBase = Join-Path $root "安全看板vben\node_modules\vite\bin\vite.js"
if (-not (Test-Path $viteBase)) {
    $viteBase = (Get-ChildItem (Join-Path $root "安全看板vben\node_modules\.pnpm") -Directory -ErrorAction SilentlyContinue |
        Where-Object Name -like 'vite@*' | Select-Object -First 1).FullName | ForEach-Object { Join-Path $_ "node_modules\vite\bin\vite.js" }
}
Write-Output "vite=$viteBase exists=$(Test-Path $viteBase)"
try {
    $p2 = Start-Process -FilePath $node `
        -ArgumentList @($viteBase, "--mode", "development", "--host", "127.0.0.1", "--strictPort") `
        -WorkingDirectory $wd `
        -RedirectStandardOutput (Join-Path $logs "frontend_dev_out.log") `
        -RedirectStandardError (Join-Path $logs "frontend_dev_err.log") `
        -WindowStyle Hidden -PassThru
    Write-Output "frontend started pid=$($p2.Id)"
} catch { Write-Output "frontend start failed: $($_.Exception.Message)" }

Stop-Transcript -ErrorAction SilentlyContinue