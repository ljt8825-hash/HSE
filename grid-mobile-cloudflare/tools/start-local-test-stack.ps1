<#
  start-local-test-stack.ps1 —— 本地测试栈一键启动
  链路：浏览器 -> local-pages-server(5900) -> 本地 Worker(8787) -> 飞书 base
  目标 base 由 worker/.dev.vars 决定（当前 = 测试台账 WZLJbFxpvarTWWsXWj8cOc1jnkh）。
  生产 Worker / 生产 Pages 完全不碰。
  停止：关掉弹出的两个窗口即可。
#>
$ErrorActionPreference = 'Stop'
# 控制台默认 GBK，会把 UTF-8 中文打成乱码；显式切成 UTF-8 输出。
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {}
# 探测等待上限（秒）
$WORKER_WAIT = 45
$PAGES_WAIT  = 30
$root      = Split-Path -Parent $PSScriptRoot
$workerDir = Join-Path $root 'worker'
$wrangler  = Join-Path $workerDir 'node_modules\.bin\wrangler.cmd'
$pages     = Join-Path $root 'tools\local-pages-server.mjs'

function Test-Port($p) {
  try {
    $c  = New-Object System.Net.Sockets.TcpClient
    $ar = $c.BeginConnect('127.0.0.1', $p, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne(300)
    if ($ok) { $c.EndConnect($ar); $c.Close(); return $true }
    $c.Close(); return $false
  } catch { return $false }
}

if (-not (Test-Path $wrangler)) { Write-Host "缺 $wrangler  ->  先执行: cd worker ; npm install" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $pages))    { Write-Host "缺 $pages" -ForegroundColor Red; exit 1 }

if (Test-Port 8787) { Write-Host '8787 已在跑，跳过 Worker 启动' -ForegroundColor DarkYellow }
else {
  Write-Host '[1/2] 启动本地 Worker（8787，读 worker/.dev.vars）...' -ForegroundColor Cyan
  Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit','-Command',
    "`$env:NO_PROXY='127.0.0.1,localhost'; Set-Location '$workerDir'; & '$wrangler' dev --port 8787 --ip 127.0.0.1"
  ) | Out-Null
}

$n = 0
while (-not (Test-Port 8787) -and $n -lt 40) { Start-Sleep -Milliseconds 700; $n++ }
if (-not (Test-Port 8787)) { Write-Host "Worker 等待 $WORKER_WAIT 秒仍未就绪 —— 看新窗口里的报错" -ForegroundColor Red; exit 1 }
Write-Host '      Worker OK  ->  http://127.0.0.1:8787' -ForegroundColor Green

if (Test-Port 5900) { Write-Host '5900 已在跑，跳过 Pages 启动' -ForegroundColor DarkYellow }
else {
  Write-Host '[2/2] 启动本地 Pages（5900 -> 8787）...' -ForegroundColor Cyan
  Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit','-Command',
    "`$env:NO_PROXY='127.0.0.1,localhost'; `$env:WORKER_ORIGIN='http://127.0.0.1:8787'; `$env:PORT='5900'; node '$pages'"
  ) | Out-Null
}

$n = 0
while (-not (Test-Port 5900) -and $n -lt 30) { Start-Sleep -Milliseconds 500; $n++ }
Write-Host ''
if (Test-Port 5900) {
  Write-Host '=== 本地测试栈已就绪 ===' -ForegroundColor Green
  Write-Host '  测试入口（测试台账）：  http://127.0.0.1:5900/check' -ForegroundColor Yellow
  Write-Host '  生产入口（9月台账）：   http://127.0.0.1:5899/check' -ForegroundColor DarkGray
  Write-Host ''
  Write-Host '  三个测试账号，密码均为 123456：' -ForegroundColor DarkGray
  Write-Host '    13800000003 测试公司管理 / 13800000001 测试经理甲 / 13800000002 测试管理员乙' -ForegroundColor DarkGray
} else {
  Write-Host 'Pages 未就绪 —— 看新窗口里的报错' -ForegroundColor Red
  exit 1
}
