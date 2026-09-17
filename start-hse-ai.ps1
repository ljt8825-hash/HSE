<#
.SYNOPSIS
    HSE 本地 AI 一键启动（AI-12 Runtime-01）
.DESCRIPTION
    统一启动链路：
      环境检查 → Ollama → qwen2.5:7b / nomic-embed-text → PostgreSQL → Backend → Worker → Frontend → AI Health
    普通使用人员只需执行一次本脚本，即可得到可用的 HSE + 本地 AI 运行栈。

    开发栈端口契约（可用环境变量覆盖）：
      HSE_BACKEND_PORT  = 5888（禁止 5876：生产端口由 HSE-Backend 计划任务管理，本脚本永不启动 5876）
      HSE_FRONTEND_PORT = 5173
    AI 覆盖（进程级，不修改 server/.env）：
      AI_PROVIDER=ollama   AI_TIMEOUT_MS=300000   （CPU qwen2.5:7b 真实延迟验证值，见 AI-07 E2E）
    数据库：沿用 server/.env 的 safety_dashboard（AI 表与 pgvector 已就绪，AI-12 审计确认）

    幂等性：重复执行不会重复启动——已运行的组件识别为 Already running 并复用。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\start-hse-ai.ps1
.EXAMPLE
    $env:HSE_BACKEND_PORT=5889; $env:HSE_FRONTEND_PORT=5176
    powershell -ExecutionPolicy Bypass -File .\start-hse-ai.ps1
#>

$ErrorActionPreference = 'Stop'

# ====== 配置 ======
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Join-Path $projectRoot 'server'
$vbenDir = Join-Path $projectRoot '安全看板vben'
$frontendDir = Join-Path $vbenDir 'apps\web-naive'
$viteCmd = Join-Path $vbenDir 'node_modules\.bin\vite.cmd'
$workerScript = 'scripts\ai07_worker.cjs'

# 端口契约：默认 dev 栈 5888/5173；环境变量可覆盖；5876 硬禁止
$backendPort = 5888
if ($env:HSE_BACKEND_PORT) {
    $parsed = 0
    if (-not [int]::TryParse($env:HSE_BACKEND_PORT, [ref]$parsed) -or $parsed -lt 1 -or $parsed -gt 65535) {
        Write-Host ("  [ERROR] HSE_BACKEND_PORT 非法: " + $env:HSE_BACKEND_PORT) -ForegroundColor Red
        Read-Host 'Press Enter to exit'
        exit 1
    }
    $backendPort = $parsed
}
if ($backendPort -eq 5876) {
    Write-Host '  [ERROR] 5876 为生产 HSE Backend 端口，由 HSE-Backend 计划任务（SYSTEM）管理。' -ForegroundColor Red
    Write-Host '          本脚本禁止启动/占用 5876。生产后端请勿手动操作。' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}
$frontendPort = 5173
if ($env:HSE_FRONTEND_PORT) {
    $parsed = 0
    if (-not [int]::TryParse($env:HSE_FRONTEND_PORT, [ref]$parsed) -or $parsed -lt 1 -or $parsed -gt 65535) {
        Write-Host ("  [ERROR] HSE_FRONTEND_PORT 非法: " + $env:HSE_FRONTEND_PORT) -ForegroundColor Red
        Read-Host 'Press Enter to exit'
        exit 1
    }
    $frontendPort = $parsed
}

$backendHealthUrl = "http://127.0.0.1:" + $backendPort + "/api/health"
$backendBase = "http://127.0.0.1:" + $backendPort
$frontendUrl = "http://127.0.0.1:" + $frontendPort
$ollamaApi = "http://127.0.0.1:11434/api/tags"
$REQUIRED_MODELS = @('qwen2.5:7b', 'nomic-embed-text')

# ====== 输出辅助 ======
function Write-Title($text) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ("  " + $text) -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ''
}
function Write-Ok($text)  { Write-Host ("  [OK] " + $text) -ForegroundColor Green }
function Write-Warn($text){ Write-Host ("  [WARN] " + $text) -ForegroundColor Yellow }
function Write-Err($text) { Write-Host ("  [ERROR] " + $text) -ForegroundColor Red }
function Write-Step($text){ Write-Host ("  [..] " + $text) -ForegroundColor Gray }

function Test-TcpPort($port, $hostName = '127.0.0.1') {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect($hostName, $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(1500)
        if ($ok) { $c.EndConnect($iar); $c.Close(); return $true }
        $c.Close(); return $false
    } catch { return $false }
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
    } catch { }
    return @($pids | Sort-Object -Unique)
}

# ====== 1. 环境检查 ======
Write-Title 'HSE 本地 AI 一键启动（AI-12）'
Write-Host ('  启动时间: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Gray
Write-Host ('  开发栈后端端口: ' + $backendPort) -ForegroundColor Gray
Write-Host ('  开发栈前端端口: ' + $frontendPort) -ForegroundColor Gray

Write-Host ''
Write-Host '[1/7 环境检查]' -ForegroundColor Yellow

# Node.js
$nodeExe = $null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $nodeExe = $nodeCmd.Source }
if (-not $nodeExe -and (Test-Path 'C:\Program Files\nodejs\node.exe')) { $nodeExe = 'C:\Program Files\nodejs\node.exe' }
if (-not $nodeExe) {
    Write-Err 'Node.js 未安装（或不在 PATH）。请先安装 Node.js 20+。'
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Ok ('Node.js: ' + $nodeExe + '  ' + (& $nodeExe --version))

# pnpm（前端依赖管理）
$pnpmCmd = $null
$pnpmArgs = $null
$candidates = @(
    (Join-Path $vbenDir 'tools\node_modules\.bin\pnpm.cmd'),
    (Join-Path $vbenDir 'tools\pnpm.exe'),
    'pnpm.cmd',
    'pnpm'
)
foreach ($c in $candidates) {
    if (Test-Path $c) { $pnpmCmd = $c; break }
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { $pnpmCmd = $cmd.Source; break }
}
if (-not $pnpmCmd) {
    Write-Err 'pnpm 未安装。请执行: npm install -g pnpm@10.33.4'
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Ok ('pnpm: ' + $pnpmCmd)

# 项目结构
if (-not (Test-Path (Join-Path $serverDir 'app.js'))) { Write-Err ('后端入口缺失: ' + $serverDir + '\app.js'); Read-Host 'Press Enter to exit'; exit 1 }
if (-not (Test-Path (Join-Path $frontendDir 'package.json'))) { Write-Err ('前端应用缺失: ' + $frontendDir); Read-Host 'Press Enter to exit'; exit 1 }
Write-Ok '项目结构检查通过（server/app.js + apps/web-naive）'

# 依赖
if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
    Write-Step '后端依赖缺失，开始安装（npm install）...'
    Push-Location $serverDir
    npm install 2>&1 | Out-Host
    Pop-Location
    if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
        Write-Err '后端依赖安装失败。请手动执行 npm install 后重试。'
        Read-Host 'Press Enter to exit'
        exit 1
    }
}
Write-Ok '后端依赖就绪'
$frontendModulesReady = (Test-Path (Join-Path $vbenDir 'node_modules\.modules.yaml')) -and (Test-Path $viteCmd)
if (-not $frontendModulesReady) {
    Write-Step '前端依赖缺失，开始安装（pnpm install）...'
    Push-Location $vbenDir
    $env:CI = 'true'
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    if ($pnpmArgs) { & $pnpmCmd $pnpmArgs install 2>&1 | Out-Host } else { & $pnpmCmd install 2>&1 | Out-Host }
    Pop-Location
    $frontendModulesReady = (Test-Path (Join-Path $vbenDir 'node_modules\.modules.yaml')) -and (Test-Path $viteCmd)
    if (-not $frontendModulesReady) {
        Write-Err '前端依赖安装失败（vite 可执行文件缺失）。'
        Read-Host 'Press Enter to exit'
        exit 1
    }
}
Write-Ok '前端依赖就绪'

# ====== 2. PostgreSQL ======
Write-Host ''
Write-Host '[2/7 PostgreSQL 检查]' -ForegroundColor Yellow
if (Test-TcpPort 5432) {
    Write-Ok 'PostgreSQL 127.0.0.1:5432 正在监听'
} else {
    Write-Err 'PostgreSQL 未运行（127.0.0.1:5432 不可达）。'
    Write-Host '  请先启动 PostgreSQL 服务（服务名通常为 postgresql-x64-*），再执行本脚本。' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}

# ====== 3. Ollama ======
Write-Host ''
Write-Host '[3/7 Ollama 检查]' -ForegroundColor Yellow
$ollamaOk = $false
$modelList = @()
try {
    $tags = Invoke-RestMethod -Uri $ollamaApi -TimeoutSec 5
    $ollamaOk = $true
    $modelList = @($tags.models | ForEach-Object { $_.name })
    Write-Ok ('Ollama API 可达: ' + $ollamaApi)
} catch {
    Write-Err 'Ollama 未运行（127.0.0.1:11434 不可达）。'
    Write-Host '  请先启动 Ollama（ollama serve，或运行 scripts\start-ollama.ps1），再执行本脚本。' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}

# ====== 4. 模型检查 ======
Write-Host ''
Write-Host '[4/7 模型检查]' -ForegroundColor Yellow
$missingModels = @()
foreach ($m in $REQUIRED_MODELS) {
    $found = $modelList | Where-Object { $_ -like $m + '*' }
    if ($found) { Write-Ok ('模型 ' + $m + ' 存在') } else { $missingModels += $m }
}
if ($missingModels.Count -gt 0) {
    foreach ($m in $missingModels) { Write-Err ('缺少模型 ' + $m) }
    Write-Host '  请先执行 Ollama 模型准备步骤（ollama pull <model>），本脚本默认不自动下载大模型。' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}

# ====== 5. Backend ======
Write-Host ''
Write-Host '[5/7 Backend 启动]' -ForegroundColor Yellow
$backendAlready = $false
if (Get-ListeningPidsOnPort $backendPort) {
    Write-Step ('端口 ' + $backendPort + ' 已被监听，检查是否为 HSE Backend...')
    try {
        $r = Invoke-WebRequest -Uri $backendHealthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            Write-Ok ('HSE Backend 已在运行（Already running，复用）: ' + $backendHealthUrl)
            $backendAlready = $true
        }
    } catch { }
    if (-not $backendAlready) {
        Write-Err ('端口 ' + $backendPort + ' 被非 HSE 进程占用，无法启动。请先释放该端口或改用 HSE_BACKEND_PORT。')
        Read-Host 'Press Enter to exit'
        exit 1
    }
}
if (-not $backendAlready) {
    Write-Step '启动 HSE Backend（AI_PROVIDER=ollama, AI_TIMEOUT_MS=300000, 进程级覆盖，不改 .env）...'
    # cmd 的 set 命令必须带引号：裸 set VAR=value && ... 会把 && 前的空格并入变量值（实测 AI_PROVIDER='ollama ' 导致 Provider 注册表查找失败）
    $backendCmd = 'chcp 65001 >nul && set "PORT=' + $backendPort + '" && set "AI_PROVIDER=ollama" && set "AI_TIMEOUT_MS=300000" && cd /d "' + $serverDir + '" && title HSE AI Backend - Port ' + $backendPort + ' && echo === HSE AI Backend starting, do not close this window === && "' + $nodeExe + '" app.js'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $backendCmd -WindowStyle Normal

    Write-Step '等待 Backend Health（最长 90 秒）...'
    $backendOk = $false
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $backendHealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $backendOk = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $backendOk) {
        Write-Err ('Backend 未在 90 秒内就绪: ' + $backendHealthUrl)
        Write-Host '  请检查 HSE AI Backend 窗口中的数据库或环境错误。' -ForegroundColor Yellow
        Read-Host 'Press Enter to exit'
        exit 1
    }
    Write-Ok ('Backend 启动成功: ' + $backendHealthUrl)
}

# ====== 6. Worker ======
Write-Host ''
Write-Host '[6/7 AI Worker 检查/启动]' -ForegroundColor Yellow
$workerRunning = $false
try {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($p.CommandLine -and $p.CommandLine.Contains($workerScript)) { $workerRunning = $true; break }
    }
} catch { }
if ($workerRunning) {
    Write-Ok 'AI Worker 已在运行（Already running，复用；并发由 PostgreSQL advisory lock 保证 ≤1）'
} else {
    Write-Step '启动 AI Worker（独立进程，轮询 PENDING 任务，并发 ≤1）...'
    $workerCmd = 'chcp 65001 >nul && set "AI_PROVIDER=ollama" && set "AI_TIMEOUT_MS=300000" && cd /d "' + $serverDir + '" && title HSE AI Worker && echo === HSE AI Worker starting, do not close this window === && "' + $nodeExe + '" ' + $workerScript
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $workerCmd -WindowStyle Normal
    Start-Sleep -Seconds 3
    $workerRunning = $false
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            if ($p.CommandLine -and $p.CommandLine.Contains($workerScript)) { $workerRunning = $true; break }
        }
    } catch { }
    if ($workerRunning) { Write-Ok 'AI Worker 启动成功（独立进程）' }
    else { Write-Warn 'AI Worker 进程 3 秒内未确认存活，请检查 Worker 窗口日志（任务仍可由其他 Worker 实例处理）' }
}

# ====== 7. Frontend ======
Write-Host ''
Write-Host '[7/7 Frontend 启动]' -ForegroundColor Yellow
$frontendAlready = $false
if (Get-ListeningPidsOnPort $frontendPort) {
    Write-Step ('端口 ' + $frontendPort + ' 已被监听，检查是否为 HSE Frontend...')
    try {
        $r = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            Write-Ok ('HSE Frontend 已在运行（Already running，复用）: ' + $frontendUrl)
            $frontendAlready = $true
        }
    } catch { }
    if (-not $frontendAlready) {
        Write-Err ('端口 ' + $frontendPort + ' 被非 HSE 进程占用。请释放端口或改用 HSE_FRONTEND_PORT。')
        Read-Host 'Press Enter to exit'
        exit 1
    }
}
if (-not $frontendAlready) {
    Write-Step '启动 HSE Frontend（vite dev，代理指向本栈后端）...'
    $env:CI = 'true'
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    $frontendArgs = @('/k', ('"' + $viteCmd + '" --mode development --host 127.0.0.1 --port ' + $frontendPort + ' --strictPort'))
    # 代理目标在子进程环境变量中注入（vite.config.ts 已支持 VITE_PROXY_TARGET / VITE_UPLOADS_PROXY_TARGET 覆盖）
    $frontendCmd = 'chcp 65001 >nul && set "VITE_PROXY_TARGET=' + $backendBase + '" && set "VITE_UPLOADS_PROXY_TARGET=' + $backendBase + '" && cd /d "' + $frontendDir + '" && title HSE Frontend - Port ' + $frontendPort + ' && ' + $frontendArgs[1]
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $frontendCmd -WorkingDirectory $frontendDir -WindowStyle Normal

    Write-Step '等待 Frontend 编译就绪（首次冷启动最长 180 秒）...'
    $frontendOk = $false
    for ($i = 0; $i -lt 90; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $frontendOk = $true; break }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $frontendOk) {
        Write-Err ('Frontend 未就绪: ' + $frontendUrl)
        Write-Host '  请检查 HSE Frontend 窗口中的编译错误。' -ForegroundColor Yellow
        Read-Host 'Press Enter to exit'
        exit 1
    }
    Write-Ok ('Frontend 启动成功: ' + $frontendUrl)
}

# ====== 收尾 ======
Write-Title '启动完成 — 执行 AI 健康检查'
Write-Host ('  Frontend: ' + $frontendUrl) -ForegroundColor White
Write-Host ('  Backend:  ' + $backendBase) -ForegroundColor White
Write-Host ('  Health:   ' + $backendHealthUrl) -ForegroundColor White
Write-Host ''

$healthScript = Join-Path $projectRoot 'scripts\hse-ai-health.ps1'
if (Test-Path $healthScript) {
    $env:HSE_BACKEND_PORT = [string]$backendPort
    $env:HSE_FRONTEND_PORT = [string]$frontendPort
    & $healthScript
    Remove-Item Env:HSE_BACKEND_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:HSE_FRONTEND_PORT -ErrorAction SilentlyContinue
} else {
    Write-Warn '未找到 scripts\hse-ai-health.ps1，跳过 AI 健康检查。可手动执行健康检查。'
}

Write-Host ''
Write-Host '  使用说明：' -ForegroundColor Gray
Write-Host '  - 打开浏览器访问 ' + $frontendUrl + '，进入「AI 智能分析」页面。' -ForegroundColor Gray
Write-Host '  - 停止开发栈：执行 scripts\stop-hse-ai.ps1（不影响生产 5876 / Ollama / PostgreSQL）。' -ForegroundColor Gray
Write-Host '  - 再次执行本脚本不会重复启动（Already running 复用）。' -ForegroundColor Gray
Write-Host ''

Read-Host 'Press Enter to close this window'
