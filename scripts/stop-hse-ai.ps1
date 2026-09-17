<#
.SYNOPSIS
    HSE 本地 AI 开发栈一键停止（AI-12）
.DESCRIPTION
    仅停止本脚本启动的开发栈组件：
      - AI Worker（命令行含 scripts\ai07_worker.cjs 的 node 进程）
      - 开发栈 Backend（HSE_BACKEND_PORT，默认 5888；禁止 5876）
      - 开发栈 Frontend（HSE_FRONTEND_PORT，默认 5173）
    不停止（生产边界）：
      - 生产 Backend 5876（HSE-Backend 计划任务管理，永不触碰）
      - PostgreSQL 5432
      - Ollama 11434
    执行前会列出将停止的进程并请求确认（-Force 跳过确认）。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\stop-hse-ai.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\stop-hse-ai.ps1 -Force
#>
param(
    [switch]$Force
)

$ErrorActionPreference = 'Continue'

$backendPort = 5888
if ($env:HSE_BACKEND_PORT) {
    $parsed = 0
    if ([int]::TryParse($env:HSE_BACKEND_PORT, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) { $backendPort = $parsed }
}
$frontendPort = 5173
if ($env:HSE_FRONTEND_PORT) {
    $parsed = 0
    if ([int]::TryParse($env:HSE_FRONTEND_PORT, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) { $frontendPort = $parsed }
}

if ($backendPort -eq 5876) {
    Write-Host '  [ERROR] 禁止停止 5876（生产 HSE Backend，由 HSE-Backend 计划任务管理）。' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ' HSE 本地 AI 开发栈停止' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

$targets = @()

# Worker
try {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($p.CommandLine -and $p.CommandLine.Contains('scripts\ai07_worker.cjs')) {
            $targets += [PSCustomObject]@{ Kind = 'AI Worker'; Pid = $p.ProcessId; Info = $p.CommandLine.Substring(0, [Math]::Min(120, $p.CommandLine.Length)) }
        }
    }
} catch { }

# Backend（指定端口监听者 + 命令行含 app.js 且非生产 5876 者不做端口盲杀，仅按端口找）
try {
    $conns = Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
            $p = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $c.OwningProcess) -ErrorAction SilentlyContinue
            $targets += [PSCustomObject]@{ Kind = ('Backend :' + $backendPort); Pid = $c.OwningProcess; Info = $p.CommandLine.Substring(0, [Math]::Min(120, $p.CommandLine.Length)) }
        }
    }
} catch { }

# Frontend（指定端口监听者）
try {
    $conns = Get-NetTCPConnection -LocalPort $frontendPort -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
            $p = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $c.OwningProcess) -ErrorAction SilentlyContinue
            $targets += [PSCustomObject]@{ Kind = ('Frontend :' + $frontendPort); Pid = $c.OwningProcess; Info = $p.CommandLine.Substring(0, [Math]::Min(120, $p.CommandLine.Length)) }
        }
    }
} catch { }

$unique = $targets | Sort-Object Pid -Unique

if ($unique.Count -eq 0) {
    Write-Host '  没有发现需要停止的开发栈进程（Worker / Backend / Frontend 均未运行）。' -ForegroundColor Green
    Write-Host '  生产 5876 / PostgreSQL / Ollama 保持不动。' -ForegroundColor Gray
    exit 0
}

Write-Host ''
Write-Host '  以下进程将被停止：' -ForegroundColor Yellow
foreach ($t in $unique) {
    Write-Host ("    - [" + $t.Kind + "] PID " + $t.Pid + "  " + $t.Info) -ForegroundColor Gray
}
Write-Host ''
Write-Host '  生产 5876 / PostgreSQL / Ollama 不会被停止。' -ForegroundColor Gray
Write-Host ''

if (-not $Force) {
    $ans = Read-Host '  确认停止以上开发栈进程？(y/N)'
    if ($ans -notmatch '^[yY]') {
        Write-Host '  已取消。' -ForegroundColor Yellow
        exit 0
    }
}

foreach ($t in $unique) {
    Stop-Process -Id $t.Pid -Force -ErrorAction SilentlyContinue
    Write-Host ("  [STOP] " + $t.Kind + " PID " + $t.Pid) -ForegroundColor Green
}

Start-Sleep -Seconds 2
Write-Host ''
Write-Host '  开发栈已停止。生产 5876 / PostgreSQL / Ollama 保持运行。' -ForegroundColor Green
Write-Host '  再次启动：执行 start-hse-ai.ps1' -ForegroundColor Gray
