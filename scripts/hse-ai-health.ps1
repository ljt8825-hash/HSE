<#
.SYNOPSIS
    HSE 本地 AI 统一健康检查（AI-12 Runtime-02）
.DESCRIPTION
    十项检查 + 真实 AI 冒烟测试（不写业务数据库、不创建 generation record / 分析任务）：
      [1] Node             [2] PostgreSQL      [3] Ollama
      [4] qwen2.5:7b       [5] nomic-embed-text [6] Backend
      [7] AI v2 Health     [8] RAG capability  [9] AI Analysis API
      [10] Frontend        [11] AI Generate Smoke（真实 qwen2.5:7b 极短 Prompt）
    输出类似：
      Node              [OK]
      ...
      ========================================
       HSE LOCAL AI READY
      ========================================
    退出码：0=全部 OK；1=部分 SKIP/WARN；2=存在 FAIL。
    端口可通过环境变量 HSE_BACKEND_PORT / HSE_FRONTEND_PORT 覆盖（默认 5888 / 5173）。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\hse-ai-health.ps1
#>

$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$serverDir = Join-Path $projectRoot 'server'

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

$backendBase = "http://127.0.0.1:" + $backendPort
$backendHealthUrl = $backendBase + "/api/health"
$frontendUrl = "http://127.0.0.1:" + $frontendPort
$ollamaBase = "http://127.0.0.1:11434"

$results = @()   # @{ Name; Status(OK/FAIL/SKIP/WARN); Detail }
$now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

function Add-Result($name, $status, $detail) {
    $script:results += [PSCustomObject]@{ Name = $name; Status = $status; Detail = $detail }
}

function Test-TcpPort($port, $hostName = '127.0.0.1') {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect($hostName, $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(1500)
        if ($ok) { $c.EndConnect($iar); $c.Close(); return $true }
        $c.Close(); return $false
    } catch { return $false }
}

function Get-Token {
    # 生成只读探测用 JWT（与 AI-07 E2E 同一方式：generateAccessToken + users.id=1 真实用户）
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe -and (Test-Path 'C:\Program Files\nodejs\node.exe')) { $nodeExe = 'C:\Program Files\nodejs\node.exe' }
    if (-not $nodeExe) { return $null }
    try {
        # 独立辅助脚本输出 token（避免 -e 内联引号被命令行解析破坏）
        $helper = Join-Path $serverDir 'scripts\_ai12_token.cjs'
        $token = & $nodeExe $helper 2>$null
        if ($token -and $token.Length -gt 20) { return $token.Trim() }
    } catch { }
    return $null
}

# ====== 表头 ======
Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ' HSE LOCAL AI HEALTH CHECK' -ForegroundColor Cyan
Write-Host (' ' + $now) -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

# [1] Node
$nodeVer = $null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $nodeVer = (& $nodeCmd.Source --version 2>$null) }
if ($nodeVer) { Add-Result 'Node' 'OK' $nodeVer } else { Add-Result 'Node' 'FAIL' 'node 不在 PATH 或未安装' }

# [2] PostgreSQL（TCP 5432；后端可达时再叠加 /api/health 的 database.status）
if (Test-TcpPort 5432) {
    Add-Result 'PostgreSQL' 'OK' '127.0.0.1:5432 监听中'
} else {
    Add-Result 'PostgreSQL' 'FAIL' '127.0.0.1:5432 不可达'
}

# [3] Ollama + [4][5] 模型
$ollamaModels = @()
try {
    $tags = Invoke-RestMethod -Uri ($ollamaBase + '/api/tags') -TimeoutSec 5
    $ollamaModels = @($tags.models | ForEach-Object { $_.name })
    Add-Result 'Ollama' 'OK' '127.0.0.1:11434 可达'
} catch {
    Add-Result 'Ollama' 'FAIL' ('127.0.0.1:11434 unreachable: ' + $_.Exception.Message)
}
foreach ($m in @('qwen2.5:7b', 'nomic-embed-text')) {
    if ($ollamaModels | Where-Object { $_ -like $m + '*' }) {
        Add-Result $m 'OK' '已安装'
    } elseif ($ollamaModels.Count -eq 0) {
        Add-Result $m 'SKIP' 'Ollama unavailable'
    } else {
        Add-Result $m 'FAIL' '模型缺失，请执行 ollama pull'
    }
}

# [6] Backend（/api/health；v4.1 安全设计：仅带 token 才返回 db/ai 详情，匿名仅存活字段）
$token = Get-Token
$backendDbStatus = 'unknown'
try {
    $headers = @{}
    if ($token) { $headers['Authorization'] = 'Bearer ' + $token }
    $h = Invoke-RestMethod -Uri $backendHealthUrl -Headers $headers -TimeoutSec 5
    if ($h.code -eq 0 -and $h.data -and $h.data.status) {
        $dbField = $h.data.database.status
        if (-not $dbField) { $dbField = 'n/a(匿名)' }
        $aiField = $h.data.ai.provider
        if (-not $aiField) { $aiField = 'n/a(匿名)' }
        $backendDbStatus = $dbField
        Add-Result 'Backend' 'OK' ('HTTP 200, db=' + $dbField + ', ai=' + $aiField)
    } else {
        Add-Result 'Backend' 'FAIL' ('响应异常: ' + ($h | ConvertTo-Json -Compress -Depth 4))
    }
} catch {
    Add-Result 'Backend' 'FAIL' ($backendHealthUrl + ' 不可达: ' + $_.Exception.Message)
}

# [7] AI v2 Health（需 JWT）
$aiV2Detail = $null
if ($token) {
    try {
        $v2 = Invoke-RestMethod -Uri ($backendBase + '/api/hse/ai/v2/health') -Headers @{ Authorization = 'Bearer ' + $token } -TimeoutSec 10
        if ($v2.success) {
            $active = $v2.activeProvider
            if (-not $active) { $active = '(未标定)' }
            $aiV2Detail = 'activeProvider=' + $active
            # providers 位于顶层（health 控制器直接 ok(res, {...})，无 data 包装）
            $anyAvail = @($v2.providers | Where-Object { $_.available -eq $true }).Count -gt 0
            if ($anyAvail) {
                $aiV2Detail += ', available=true'
                Add-Result 'AI v2 Health' 'OK' $aiV2Detail
            } else {
                Add-Result 'AI v2 Health' 'FAIL' ($aiV2Detail + ', 无可用 Provider')
            }
        } else {
            Add-Result 'AI v2 Health' 'FAIL' ('success=false: ' + ($v2 | ConvertTo-Json -Compress -Depth 3))
        }
    } catch {
        Add-Result 'AI v2 Health' 'FAIL' ('请求失败: ' + $_.Exception.Message)
    }
} else {
    Add-Result 'AI v2 Health' 'SKIP' '无法生成探测 Token（node/auth 不可用）'
}

# [8] RAG capability（知识库只读接口 + DB 探针）
$ragParts = @()
if ($token -and $backendDbStatus -eq 'connected') {
    try {
        $ks = Invoke-RestMethod -Uri ($backendBase + '/api/hse/ai/v2/knowledge/sources') -Headers @{ Authorization = 'Bearer ' + $token } -TimeoutSec 10
        if ($ks.success) { $ragParts += 'sources API OK' } else { $ragParts += 'sources API FAIL' }
    } catch { $ragParts += 'sources API 不可达' }
}
try {
    $probe = & node (Join-Path $serverDir 'scripts\ai12_runtime_probe.cjs') 2>$null
    $probeMap = @{}
    foreach ($line in $probe) {
        if ($line -match '^([^=]+)=(.*)$') { $probeMap[$matches[1]] = $matches[2] }
    }
    if ($probeMap['db_ok'] -eq '1' -and $probeMap['vector_ok'] -eq '1' -and $probeMap['tables_ok'] -eq '1') {
        $ragParts += ('pgvector ' + $probeMap['vector_ver'] + ' + 7 AI 表 OK')
        Add-Result 'RAG capability' 'OK' ($ragParts -join '; ')
    } else {
        Add-Result 'RAG capability' 'FAIL' (($ragParts -join '; ') + '; missing=' + $probeMap['missing_tables'])
    }
} catch {
    if ($ragParts.Count -gt 0) {
        Add-Result 'RAG capability' 'WARN' (($ragParts -join '; ') + '; DB 探针执行失败: ' + $_.Exception.Message)
    } else {
        Add-Result 'RAG capability' 'FAIL' 'DB 探针执行失败'
    }
}

# [9] AI Analysis API（只读列表）
if ($token) {
    try {
        $tl = Invoke-RestMethod -Uri ($backendBase + '/api/hse/ai/v2/analysis-tasks?page=1&pageSize=1') -Headers @{ Authorization = 'Bearer ' + $token } -TimeoutSec 10
        if ($tl.success -and $null -ne $tl.total) {
            Add-Result 'AI Analysis API' 'OK' ('total=' + $tl.total)
        } else {
            Add-Result 'AI Analysis API' 'FAIL' '接口响应异常'
        }
    } catch {
        Add-Result 'AI Analysis API' 'FAIL' ('请求失败: ' + $_.Exception.Message)
    }
} else {
    Add-Result 'AI Analysis API' 'SKIP' '无法生成探测 Token'
}

# [10] Frontend
try {
    $f = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($f.StatusCode -eq 200) { Add-Result 'Frontend' 'OK' ($frontendUrl + ' HTTP 200') }
    else { Add-Result 'Frontend' 'FAIL' ('HTTP ' + $f.StatusCode) }
} catch {
    Add-Result 'Frontend' 'FAIL' ($frontendUrl + ' 不可达')
}

# [11] AI Generate Smoke（真实 qwen2.5:7b；直接调 Ollama，不写业务库/不建记录）
if ($ollamaModels | Where-Object { $_ -like 'qwen2.5:7b*' }) {
    $smokeBody = @{
        model = 'qwen2.5:7b'
        prompt = '请仅返回：HSE_AI_OK'
        stream = $false
        options = @{ num_predict = 24 }
    } | ConvertTo-Json -Depth 4
    Write-Host '  [..] 真实 qwen2.5:7b 冒烟测试（CPU 环境可能耗时 10~60 秒，请稍候）...' -ForegroundColor Gray
    try {
        $smoke = Invoke-RestMethod -Uri ($ollamaBase + '/api/generate') -Method Post -Body $smokeBody -ContentType 'application/json' -TimeoutSec 120
        $respText = [string]$smoke.response
        if ($respText -match 'HSE_AI_OK') {
            Add-Result 'AI Generate Smoke' 'OK' ('model=qwen2.5:7b, response 含 HSE_AI_OK')
        } else {
            Add-Result 'AI Generate Smoke' 'FAIL' ('response 未包含 HSE_AI_OK: ' + $respText.Substring(0, [Math]::Min(80, $respText.Length)))
        }
    } catch {
        Add-Result 'AI Generate Smoke' 'FAIL' ('generate 失败: ' + $_.Exception.Message)
    }
} else {
    Add-Result 'AI Generate Smoke' 'SKIP' 'Ollama/qwen2.5:7b 不可用'
}

# ====== 输出 ======
Write-Host ''
$pad = 20
foreach ($r in $results) {
    $name = $r.Name.PadRight($pad, ' ')
    switch ($r.Status) {
        'OK'   { Write-Host ('  ' + $name + '[OK]  ' + $r.Detail) -ForegroundColor Green; break }
        'SKIP' { Write-Host ('  ' + $name + '[SKIP] ' + $r.Detail) -ForegroundColor Yellow; break }
        'WARN' { Write-Host ('  ' + $name + '[WARN] ' + $r.Detail) -ForegroundColor Yellow; break }
        default { Write-Host ('  ' + $name + '[FAIL] ' + $r.Detail) -ForegroundColor Red }
    }
}

$fails = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$skips = @($results | Where-Object { $_.Status -in @('SKIP', 'WARN') }).Count

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
if ($fails -eq 0) {
    if ($skips -eq 0) {
        Write-Host ' HSE LOCAL AI READY' -ForegroundColor Green
    } else {
        Write-Host ' HSE LOCAL AI READY (WITH SKIPS)' -ForegroundColor Yellow
    }
} else {
    Write-Host (' HSE LOCAL AI DEGRADED (FAIL=' + $fails + ')') -ForegroundColor Red
    Write-Host ' 故障诊断参见 docs\AI智能分析\AI本地一键启动运行说明.md §常见故障' -ForegroundColor Yellow
}
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if ($fails -gt 0) { exit 2 }
if ($skips -gt 0) { exit 1 }
exit 0
