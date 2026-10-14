<#
  start-local-test-stack.ps1 —— 本地测试栈一键启动
  链路：浏览器 -> local-pages-server(5900) -> 本地 Worker(8787) -> 飞书 base
  目标 base 由 worker/.dev.vars 决定（当前 = 测试台账 WZLJbFxpvarTWWsXWj8cOc1jnkh）。
  生产 Worker / 生产 Pages 完全不碰。
  停止：关掉弹出的两个窗口即可。

  注意：所有提示同时写一份 .stack_start.log（UTF-8，无 BOM 依赖问题），
  便于启动器窗口被秒关后仍能回查；显示用的编码由 bat 的 chcp 65001 保证。
#>
$ErrorActionPreference = 'Stop'
$LogFile = Join-Path $PSScriptRoot '.stack_start.log'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
try { $OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

function Log([string]$Msg, [string]$Color = 'Gray') {
  Write-Host $Msg -ForegroundColor $Color
  try { [IO.File]::AppendAllText($LogFile, $Msg + "`r`n", (New-Object System.Text.UTF8Encoding($false))) } catch {}
}

try { Remove-Item $LogFile -ErrorAction SilentlyContinue } catch {}
Log "启动时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 'DarkGray'

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

if (-not (Test-Path $wrangler)) { Log "缺 $wrangler  ->  先执行: cd worker ; npm install" 'Red'; exit 1 }
if (-not (Test-Path $pages))    { Log "缺 $pages" 'Red'; exit 1 }

if (Test-Port 8787) {
  Log '8787 已在跑，跳过 Worker 启动' 'DarkYellow'
  Log '  （注意：若你刚改过 worker/.dev.vars，需要先关掉旧的 Wrangler 窗口再启动，否则跑的还是旧配置）' 'DarkYellow'
}
else {
  Log '[1/2] 启动本地 Worker（8787，读 worker/.dev.vars）...' 'Cyan'
  Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit','-Command',
    "`$env:NO_PROXY='127.0.0.1,localhost'; `$env:HTTP_PROXY=''; `$env:HTTPS_PROXY=''; `$env:http_proxy=''; `$env:https_proxy=''; Set-Location '$workerDir'; & '$wrangler' dev --port 8787 --ip 127.0.0.1"
  ) | Out-Null
}

$n = 0
while (-not (Test-Port 8787) -and $n -lt 40) { Start-Sleep -Milliseconds 700; $n++ }
if (-not (Test-Port 8787)) { Log "Worker 等待 $WORKER_WAIT 秒仍未就绪 —— 看新窗口里的报错" 'Red'; exit 1 }
Log '      Worker OK  ->  http://127.0.0.1:8787' 'Green'

if (Test-Port 5900) { Log '5900 已在跑，跳过 Pages 启动' 'DarkYellow' }
else {
  Log '[2/2] 启动本地 Pages（5900 -> 8787）...' 'Cyan'
  Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit','-Command',
    "`$env:NO_PROXY='127.0.0.1,localhost'; `$env:HTTP_PROXY=''; `$env:HTTPS_PROXY=''; `$env:http_proxy=''; `$env:https_proxy=''; `$env:WORKER_ORIGIN='http://127.0.0.1:8787'; `$env:PORT='5900'; node '$pages'"
  ) | Out-Null
}

$n = 0
while (-not (Test-Port 5900) -and $n -lt 30) { Start-Sleep -Milliseconds 500; $n++ }
Log ''
if (Test-Port 5900) {
  Log '=== 本地测试栈已就绪 ===' 'Green'
  Log '  测试入口（测试台账）：  http://127.0.0.1:5900/check' 'Yellow'
  Log '  生产入口（9月台账）：   http://127.0.0.1:5899/check' 'DarkGray'
  Log ''
  Log '  三个测试账号，密码均为 123456：' 'DarkGray'
  Log '    13800000003 测试公司管理 / 13800000001 测试经理甲 / 13800000002 测试管理员乙' 'DarkGray'
} else {
  Log 'Pages 未就绪 —— 看新窗口里的报错' 'Red'
  exit 1
}

# 直接双击 .ps1 运行（没人帮它 pause）时也让窗口停住，避免一闪就没。
# 从 bat 启动时 bat 自己会 pause，这里跳过。
if (-not $env:HSE_STACK_FROM_BAT) {
  Log ''
  Log '按回车键关闭本窗口 ...' 'DarkGray'
  [void](Read-Host)
}
