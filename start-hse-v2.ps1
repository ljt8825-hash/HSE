<#
.SYNOPSIS
    HSE Safety Management System - One Click Start v2.0
.DESCRIPTION
    Auto clean ports, check dependencies, start backend and frontend.
    Backend: Node.js Express on http://localhost:5876
    Frontend: Naive UI (web-naive) on http://localhost:5888
#>

$ErrorActionPreference = "Stop"

# ====== Configuration ======
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Join-Path $projectRoot "server"
$vbenDir = Join-Path $projectRoot "安全看板vben"
$frontendDir = Join-Path $vbenDir "apps\web-naive"
$viteCmd = Join-Path $vbenDir "node_modules\.bin\vite.cmd"
# 统一后端端口契约：默认 5876（与 server/.env 的 PORT 及 web-naive vite 代理一致），
# 可通过环境变量 HSE_BACKEND_PORT 覆盖；
# 合法性校验在下方 Main 之前执行（需要 Write-Err 函数）。
$backendPortRaw = $env:HSE_BACKEND_PORT
if ($backendPortRaw) {
    $backendPort = 0
} else {
    $backendPort = 5876
}
$frontendPort = 5888
$backendHealthUrl = "http://127.0.0.1:" + $backendPort + "/api/health"
$frontendUrl = "http://127.0.0.1:" + $frontendPort

function Write-Title($text) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ("  " + $text) -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Ok($text) {
    Write-Host ("  [OK] " + $text) -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host ("  [WARN] " + $text) -ForegroundColor Yellow
}

function Write-Err($text) {
    Write-Host ("  [ERROR] " + $text) -ForegroundColor Red
}

function Get-ListeningPidsOnPort($port) {
    $pids = @()
    try {
        $lines = netstat -ano -p tcp 2>$null
        foreach ($line in $lines) {
            $parts = $line.ToString().Trim() -split '\s+'
            if ($parts.Count -ge 5 -and $parts[3] -eq 'LISTENING' -and $parts[1] -match (':' + $port + '$')) {
                $pids += $parts[4]
            }
        }
    } catch {
        # ignore
    }
    return @($pids | Sort-Object -Unique)
}

function Stop-ProcessOnPort($port) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
            $pids = @(
                @($conns | Select-Object -ExpandProperty OwningProcess)
                @(Get-ListeningPidsOnPort $port)
            ) | Where-Object { $_ } | Sort-Object -Unique
            if (-not $pids) {
                Write-Ok ("Port " + $port + " is free")
                return $true
            }
            foreach ($processId in $pids) {
                if ($processId -eq 0) { continue }
                $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Warn ("Killing process on port " + $port + ": " + $proc.ProcessName + " (PID: " + $processId + ")")
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {
            # ignore
        }
        Start-Sleep -Seconds 1
        try {
            $stillThere = @(
                @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)
                @(Get-ListeningPidsOnPort $port)
            ) | Where-Object { $_ } | Sort-Object -Unique
            if ($stillThere.Count -eq 0) {
                Write-Ok ("Port " + $port + " is free")
                return $true
            }
        } catch { }
    }
    Write-Warn ("Port " + $port + " still busy after 3 attempts (fallback sweep will handle it)")
    return $false
}

# Fallback sweep: kill orphaned HSE node processes that may no longer hold the
# port (e.g. zombies left behind when a terminal window was force-closed).
# Patterns are scoped to this project's known entry points to avoid killing
# unrelated node processes.
function Stop-StaleNodeByCmd($pattern) {
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            if ($p.CommandLine -and $p.CommandLine.Contains($pattern)) {
                Write-Warn ("Killing stale node matched '" + $pattern + "': PID " + $p.ProcessId)
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        # ignore (reading CommandLine may require elevation)
    }
}

# ====== Main ======
Write-Title "Ningjin HSE Safety Management System - One Click Start v2.0"

# Validate backend port (HSE_BACKEND_PORT override must be a legal TCP port)
if ($backendPortRaw) {
    $parsedPort = 0
    if (-not [int]::TryParse($backendPortRaw, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
        Write-Err ('HSE_BACKEND_PORT is not a valid TCP port: ' + $backendPortRaw)
        Read-Host 'Press Enter to exit'
        exit 1
    }
    $backendPort = $parsedPort
    $backendHealthUrl = "http://127.0.0.1:" + $backendPort + "/api/health"
    Write-Ok ('Backend port overridden by HSE_BACKEND_PORT: ' + $backendPort)
}

# Path check
Write-Host '[Path Check]' -ForegroundColor Yellow
Write-Host ('  Project Root: ' + $projectRoot)
Write-Host ('  Backend:      ' + $serverDir)
Write-Host ('  Frontend:     ' + $frontendDir)

if (-not (Test-Path (Join-Path $serverDir "app.js"))) {
    Write-Err ('Backend entry not found: ' + $serverDir + '\app.js')
    Read-Host 'Press Enter to exit'
    exit 1
}
if (-not (Test-Path (Join-Path $vbenDir "package.json"))) {
    Write-Err ('Frontend project not found: ' + $vbenDir)
    Read-Host 'Press Enter to exit'
    exit 1
}
if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    Write-Err ('Frontend app not found: ' + $frontendDir)
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Ok 'Path check passed'

# Find Node.js
Write-Host ''
Write-Host '[Environment Check]' -ForegroundColor Yellow
$nodeExe = $null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeExe = $nodeCmd.Source
}
# 不硬编码用户/个人工具目录（保持脚本可移植）。如需指定备用 Node 路径，
# 可设置环境变量 HSE_ALT_NODE_PATH 指向可执行文件。
$altNodePath = $env:HSE_ALT_NODE_PATH
if (-not $nodeExe -and $altNodePath -and (Test-Path $altNodePath)) {
    $nodeExe = $altNodePath
}
if (-not $nodeExe -and (Test-Path 'C:\Program Files\nodejs\node.exe')) {
    $nodeExe = 'C:\Program Files\nodejs\node.exe'
}
if (-not $nodeExe) {
    Write-Err 'Node.js not found'
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Ok ('Node.js: ' + $nodeExe)
& $nodeExe --version

# Find pnpm
$pnpmCmd = $null
$pnpmArgs = $null
$candidates = @(
    (Join-Path $vbenDir 'tools\node_modules\.bin\pnpm.cmd'),
    (Join-Path $vbenDir 'tools\pnpm.exe'),
    'pnpm.cmd',
    'pnpm'
)
foreach ($c in $candidates) {
    if (Test-Path $c) {
        $pnpmCmd = $c
        break
    }
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) {
        $pnpmCmd = $cmd.Source
        break
    }
}
# 不硬编码用户/个人工具目录。如需指定备用 pnpm 入口（cjs 脚本路径），
# 可设置环境变量 HSE_ALT_PNPM_PATH，此时通过 node 执行。
$altPnpmPath = $env:HSE_ALT_PNPM_PATH
if (-not $pnpmCmd -and $altPnpmPath -and (Test-Path $altPnpmPath)) {
    $pnpmCmd = $nodeExe
    $pnpmArgs = $altPnpmPath
}
if (-not $pnpmCmd) {
    Write-Err 'pnpm not found. Please install: npm install -g pnpm@10.33.4'
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Ok ('pnpm: ' + $pnpmCmd)

# Check/Install dependencies
Write-Host ''
Write-Host '[Dependency Check]' -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
    Write-Host '  [INSTALL] Backend dependencies missing, installing...' -ForegroundColor Yellow
    Push-Location $serverDir
    npm install
    Pop-Location
    if (Test-Path (Join-Path $serverDir 'node_modules')) {
        Write-Ok 'Backend dependencies installed'
    } else {
        Write-Warn 'Backend dependency install may have failed'
    }
} else {
    Write-Ok 'Backend dependencies ready'
}

$frontendModulesReady = (Test-Path (Join-Path $vbenDir 'node_modules\.modules.yaml')) -and
    (Test-Path (Join-Path $vbenDir 'node_modules\.bin\vite.cmd'))
if (-not $frontendModulesReady) {
    Write-Host '  [INSTALL] Frontend dependencies missing, installing...' -ForegroundColor Yellow
    Push-Location $vbenDir
    $env:CI = 'true'
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    if ($pnpmArgs) {
        & $pnpmCmd $pnpmArgs install
    } else {
        & $pnpmCmd install
    }
    Pop-Location
    $frontendModulesReady = (Test-Path (Join-Path $vbenDir 'node_modules\.modules.yaml')) -and
        (Test-Path (Join-Path $vbenDir 'node_modules\.bin\vite.cmd'))
    if ($frontendModulesReady) {
        Write-Ok 'Frontend dependencies installed'
    } else {
        Write-Err 'Frontend dependency install incomplete: Vite executable not found'
        Read-Host 'Press Enter to close this window'
        exit 1
    }
} else {
    Write-Ok 'Frontend dependencies ready'
}

# Clean ports and cache
Write-Host ''
Write-Host '[Clean Ports & Cache]' -ForegroundColor Yellow
Write-Host '  Releasing any process holding the service ports (this also cleans' -ForegroundColor Gray
Write-Host '  up orphaned node processes left behind when a window was closed)...' -ForegroundColor Gray
Stop-ProcessOnPort -port $backendPort
Stop-ProcessOnPort -port $frontendPort
Stop-ProcessOnPort -port 3000
# Belt-and-suspenders: sweep orphaned HSE node processes that may not yet show
# on the port (e.g. zombies from a force-closed terminal window).
Stop-StaleNodeByCmd "app.js"
Stop-StaleNodeByCmd "web-naive"

$viteCache = Join-Path $frontendDir '.vite'
$nodeCache = Join-Path $vbenDir 'node_modules\.cache'
if (Test-Path $viteCache) {
    Remove-Item $viteCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok 'Cleaned .vite cache'
}
if (Test-Path $nodeCache) {
    Remove-Item $nodeCache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok 'Cleaned node_modules/.cache'
}
Start-Sleep -Seconds 2
Write-Ok 'Ports and cache cleaned'

# Start backend
Write-Title ('1/3 Starting Backend Service (Port ' + $backendPort + ')')
# 显式 set PORT=<finalPort>：cmd 子进程内环境变量优先级高于 server/.env，
# 确保后端无论 .env 中是否有旧 PORT 配置，都启动在本脚本统一的端口上。
$backendCmd = 'chcp 65001 >nul && set PORT=' + $backendPort + ' && cd /d "' + $serverDir + '" && title HSE Backend - Port ' + $backendPort + ' && echo === HSE Backend starting, do not close this window === && echo === Port: ' + $backendPort + ' ^| Ctrl+C to stop === && "' + $nodeExe + '" app.js'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $backendCmd -WindowStyle Normal

Write-Host '  Waiting for backend initialization...' -ForegroundColor Gray
$backendOk = $false
$backendDeadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $backendDeadline) {
    try {
        $resp = Invoke-WebRequest -Uri $backendHealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $backendOk = $true
            break
        }
    } catch {
        # Backend imports and database initialization can take several seconds.
    }
    Start-Sleep -Seconds 2
}
if ($backendOk) {
    Write-Ok ('Backend started: ' + $backendHealthUrl)
} else {
    Write-Err ('Backend did not become ready: ' + $backendHealthUrl)
    Write-Host '  Check the HSE Backend window for database or environment errors.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close this window'
    exit 1
}

# Start frontend
Write-Title ('2/3 Starting Frontend Service (Port ' + $frontendPort + ')')
$env:CI = 'true'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
$env:FRONTEND_PORT = [string]$frontendPort
# 前端代理目标与后端端口保持一致（派生自同一 $backendPort），
# 覆盖 .env.* 中可能存在的旧代理目标。
$env:VITE_PROXY_TARGET = "http://127.0.0.1:" + $backendPort
$frontendArgs = @('/k', ('"' + $viteCmd + '" --mode development --host 127.0.0.1 --port ' + $frontendPort + ' --strictPort'))
Start-Process -FilePath 'cmd.exe' -WorkingDirectory $frontendDir -ArgumentList $frontendArgs -WindowStyle Normal

Write-Host '  Waiting for frontend compilation (first start may take up to 3 minutes)...' -ForegroundColor Gray
$frontendOk = $false
# Cold start in CI mode runs full dependency pre-bundling, which can exceed 60s.
# Poll up to 180s (90 * 2s) to match the documented 1-3 minute window and avoid
# a false "Frontend did not become ready" while Vite is still compiling.
for ($i = 0; $i -lt 90; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $frontendOk = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if ($frontendOk) {
    Write-Ok ('Frontend started: ' + $frontendUrl)
} else {
    Write-Err ('Frontend did not become ready: ' + $frontendUrl)
    Write-Host '  Check the HSE Frontend window for dependency or compile errors.' -ForegroundColor Yellow
    Read-Host 'Press Enter to close this window'
    exit 1
}

# Open browser
Write-Title '3/3 Opening Browser'
try {
    Start-Process $frontendUrl -ErrorAction Stop
} catch {
    Write-Warn ('Browser auto-open failed. Open this URL manually: ' + $frontendUrl)
}

# Done
Write-Title 'Start Complete'
Write-Host ('  Frontend: ' + $frontendUrl) -ForegroundColor White
Write-Host ('  Backend:  http://localhost:' + $backendPort) -ForegroundColor White
Write-Host ('  Health:   ' + $backendHealthUrl) -ForegroundColor White
Write-Host ''
Write-Host '  Default Login:' -ForegroundColor White
Write-Host '  Username: admin' -ForegroundColor White
Write-Host '  Password: admin123' -ForegroundColor White
Write-Host ''
Write-Host '  Notes:' -ForegroundColor Gray
Write-Host '  - Backend and Frontend run in separate windows.' -ForegroundColor Gray
Write-Host '  - Close the corresponding window to stop each service.' -ForegroundColor Gray
Write-Host '  - If page not accessible, check service windows for errors.' -ForegroundColor Gray
Write-Host '  - Auto cleaned ports: 5876 / 5888 / 3000.' -ForegroundColor Gray
Write-Host ''

Read-Host 'Press Enter to close this window'
