<#
.SYNOPSIS
    HSE 本地 AI —— Ollama 启动脚本（AI-12 配套）
.DESCRIPTION
    用途：start-hse-ai.ps1 的 [3/7 Ollama 检查] 要求 http://127.0.0.1:11434/api/tags 可达，
          本脚本负责在需要时把 Ollama 拉起来（一键启动脚本自身只检查、不拉起）。

    端口契约（见 docs\AI智能分析\AI本地一键启动运行说明.md §1.3 与 AI-12 冻结决策）：
      Ollama 固定 127.0.0.1:11434；后端 server\.env 的 OLLAMA_BASE_URL 亦指向 11434。

    【本机已知坑】User 环境变量存在 OLLAMA_PORT=11438（历史遗留，曾被其他工具写入）。
      它会让 ollama serve 监听 11438 而不是 11434，导致一键启动第 3 步恒失败。
      本脚本在「进程级」注入 OLLAMA_PORT=11434 覆盖它，**不修改任何全局环境变量**。
      如需根治（让裸 `ollama serve` 也走 11434），请手动清理该用户环境变量，详见脚本结尾提示。

    幂等：11434 已可达时输出 Already running（复用）并返回 0，不重复拉起。
.PARAMETER Port
        Ollama 监听端口，默认 11434（契约值，一般不要改）。
.PARAMETER ModelsPath
        模型库目录，默认取环境变量 OLLAMA_MODELS，缺省 D:\ollama。
.PARAMETER WaitSeconds
        拉起后等待 HTTP 就绪的最长秒数，默认 60。
.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File G:\hse-dashboard\scripts\start-ollama.ps1
#>
param(
    [int]$Port = 11434,
    [string]$ModelsPath = '',
    [int]$WaitSeconds = 60
)

$ErrorActionPreference = 'Continue'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logOut = Join-Path $scriptDir '_ollama_serve_out.log'
$logErr = Join-Path $scriptDir '_ollama_serve_err.log'
$REQUIRED_MODELS = @('qwen2.5:7b', 'nomic-embed-text')
$apiUrl = 'http://127.0.0.1:' + $Port + '/api/tags'

function Write-Title($text) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ('  ' + $text) -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ''
}
function Write-Ok($text)   { Write-Host ('  [OK] ' + $text) -ForegroundColor Green }
function Write-Warn2($text){ Write-Host ('  [WARN] ' + $text) -ForegroundColor Yellow }
function Write-Err2($text) { Write-Host ('  [ERROR] ' + $text) -ForegroundColor Red }
function Write-Step2($text){ Write-Host ('  [..] ' + $text) -ForegroundColor Gray }

function Get-OllamaTags($port) {
    try {
        return Invoke-RestMethod -Uri ('http://127.0.0.1:' + $port + '/api/tags') -TimeoutSec 5
    } catch {
        return $null
    }
}

function Find-OllamaExe {
    $candidates = @(
        'G:\Ollama\ollama.exe',
        'G:\ollama\ollama.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
        'C:\Program Files\Ollama\ollama.exe'
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    $cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if (-not $cmd) { $cmd = Get-Command ollama -ErrorAction SilentlyContinue }
    if ($cmd) { return $cmd.Source }
    return $null
}

Write-Title 'HSE 本地 AI —— Ollama 启动'
Write-Host ('  目标地址: http://127.0.0.1:' + $Port) -ForegroundColor Gray
Write-Host ('  时间: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Gray

# ====== 1. 环境变量漂移检测（只报告，不改全局）======
Write-Host ''
Write-Host '[1/4 环境变量检查]' -ForegroundColor Yellow

$userPort = [Environment]::GetEnvironmentVariable('OLLAMA_PORT', 'User')
$machPort = [Environment]::GetEnvironmentVariable('OLLAMA_PORT', 'Machine')
$drift = $false
foreach ($pair in @(@('User', $userPort), @('Machine', $machPort))) {
    $scope = $pair[0]; $val = $pair[1]
    if ($val) {
        $n = 0
        if ([int]::TryParse($val, [ref]$n)) {
            if ($n -ne $Port) {
                $drift = $true
                Write-Warn2 ($scope + ' 环境变量 OLLAMA_PORT=' + $n + '（契约值应为 ' + $Port + '）—— 裸 `ollama serve` 会监听 ' + $n)
            } else {
                Write-Ok ($scope + ' 环境变量 OLLAMA_PORT=' + $n + ' 与契约一致')
            }
        }
    }
}
if ($drift) {
    Write-Host '  本脚本用「进程级」OLLAMA_PORT 覆盖上述值，不影响全局环境变量。' -ForegroundColor Yellow
} else {
    Write-Ok '未发现端口漂移'
}

if (-not $ModelsPath) {
    if ($env:OLLAMA_MODELS) { $ModelsPath = $env:OLLAMA_MODELS } else { $ModelsPath = 'D:\ollama' }
}
if (Test-Path $ModelsPath) {
    Write-Ok ('模型库: ' + $ModelsPath)
} else {
    Write-Warn2 ('模型库目录不存在: ' + $ModelsPath + '（若 Ollama 用默认目录可忽略）')
}

# ====== 2. 幂等检查 ======
Write-Host ''
Write-Host '[2/4 幂等检查]' -ForegroundColor Yellow
$tags = Get-OllamaTags $Port
if ($tags) {
    Write-Ok ('Ollama 已在运行（Already running，复用）: ' + $apiUrl)
    $names = @($tags.models | ForEach-Object { $_.name })
    Write-Host ('  已安装模型 ' + $names.Count + ' 个: ' + ($names -join ', ')) -ForegroundColor Gray
    $missing = @()
    foreach ($m in $REQUIRED_MODELS) { if (-not ($names | Where-Object { $_ -like $m + '*' })) { $missing += $m } }
    if ($missing.Count -gt 0) {
        foreach ($m in $missing) { Write-Warn2 ('缺少必需模型 ' + $m + ' → 请执行: ollama pull ' + $m) }
    } else {
        Write-Ok '必需模型齐备（qwen2.5:7b / nomic-embed-text）'
    }
    Write-Host ''
    Write-Host '  可继续执行 start-hse-ai.bat（或 start-hse-ai.ps1）。' -ForegroundColor Green
    exit 0
}
Write-Step2 '11434 未就绪，准备拉起 Ollama...'

# ====== 3. 拉起 Ollama ======
Write-Host ''
Write-Host '[3/4 启动 Ollama]' -ForegroundColor Yellow
$exe = Find-OllamaExe
if (-not $exe) {
    Write-Err2 '未找到 ollama.exe（已查 G:\Ollama、G:\ollama、%LOCALAPPDATA%\Programs\Ollama、C:\Program Files\Ollama 与 PATH）'
    Write-Host '  请安装 Ollama（winget install Ollama.Ollama.Portable）或修正 PATH。' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}
Write-Ok ('ollama.exe: ' + $exe)

# 进程级覆盖（子进程继承）；不改任何全局/用户环境变量
$env:OLLAMA_PORT = [string]$Port
$env:OLLAMA_MODELS = $ModelsPath

Write-Step2 ('拉起 ollama serve（进程级 OLLAMA_PORT=' + $Port + '），日志: ' + $logErr)
try {
    Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput $logOut -RedirectStandardError $logErr -ErrorAction Stop
} catch {
    Write-Err2 ('启动失败: ' + $_.Exception.Message)
    Read-Host 'Press Enter to exit'
    exit 1
}

# ====== 4. 等待就绪 ======
Write-Host ''
Write-Host '[4/4 等待就绪]' -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ready = $null
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 1500
    $ready = Get-OllamaTags $Port
    if ($ready) { break }
    Write-Host '.' -NoNewline -ForegroundColor Gray
}
Write-Host ''

if (-not $ready) {
    Write-Err2 ('Ollama 未能在 ' + $WaitSeconds + ' 秒内就绪: ' + $apiUrl)
    $driftTags = $null
    foreach ($p in @(11438, 11435, 11433)) {
        $driftTags = Get-OllamaTags $p
        if ($driftTags) {
            Write-Warn2 ('检测到 Ollama 实际监听的端口是 ' + $p + '（端口漂移）。')
            Write-Host ('  根因通常是环境变量 OLLAMA_PORT=' + $p + '。根治方法（需自行确认无其他工具依赖该端口）:' ) -ForegroundColor Yellow
            Write-Host ('    [Environment]::SetEnvironmentVariable("OLLAMA_PORT", $null, "User")' ) -ForegroundColor Yellow
            Write-Host '  执行后需重开终端，再运行本脚本。' -ForegroundColor Yellow
            break
        }
    }
    if (Test-Path $logErr) {
        Write-Host '  --- 日志尾部 ---' -ForegroundColor Gray
        Get-Content $logErr -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor DarkGray }
    }
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Ok ('Ollama 已就绪: ' + $apiUrl)
$names = @($ready.models | ForEach-Object { $_.name })
Write-Host ('  已安装模型 ' + $names.Count + ' 个: ' + ($names -join ', ')) -ForegroundColor Gray
$missing = @()
foreach ($m in $REQUIRED_MODELS) { if (-not ($names | Where-Object { $_ -like $m + '*' })) { $missing += $m } }
if ($missing.Count -gt 0) {
    foreach ($m in $missing) { Write-Warn2 ('缺少必需模型 ' + $m + ' → 请执行: ollama pull ' + $m) }
    Write-Host ''
    Write-Host '  模型补齐后即可执行 start-hse-ai.bat。' -ForegroundColor Yellow
    exit 0
}
Write-Ok '必需模型齐备（qwen2.5:7b / nomic-embed-text）'

Write-Host ''
Write-Host '  下一步: 执行 G:\hse-dashboard\start-hse-ai.bat' -ForegroundColor Green
Write-Host '  说明: 本脚本不会随终端关闭而停止 Ollama（独立进程）；停止请用 taskkill 或重启系统。' -ForegroundColor Gray
exit 0
