# ============================================================
# WPS-PG-SYNC-05-G-2  production recovery drill (admin)  v2
# Purpose: prove the HSE-Backend SYSTEM watchdog REALLY recovers
#          production 5876 after a hard kill.
# Identity strategy (v2): on this machine the ELEVATED session's
#          TCP table (netstat AND Get-NetTCPConnection) reports a
#          GHOST pid (49, nonexistent) for :5876 - verified 2 runs
#          2026-09-12. So we NEVER trust the TCP table for identity.
#          Production identity = the node.exe whose CommandLine runs
#          prod-launch.cjs (process tree, elevated CIM), plus
#          /api/health polling (environment-independent).
# Usage  : right-click -> Run with PowerShell (allow UAC)
# Safety : kills ONLY the verified prod-launch node.exe PID;
#          re-verified immediately before kill; any anomaly ->
#          [BLOCKED_...] + stop. Manual recovery:
#            Start-ScheduledTask -TaskName 'HSE-Backend'
# ============================================================

$ErrorActionPreference = 'Stop'

# ---- self-elevate ----
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '[INFO] not elevated, relaunching with UAC prompt ...'
    $ps = (Get-Process -Id $PID).Path
    Start-Process -FilePath $ps -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$log = 'G:\hse-dashboard\server\logs\05g2-drill-transcript.log'
Start-Transcript -Path $log -Append | Out-Null

$summary = [ordered]@{
    stage = 'WPS-PG-SYNC-05-G-2-DRILL-V2'
    startedAt = (Get-Date -Format o)
    task = $null
    tcpTableReports = $null
    oldPid = $null
    newPid = $null
    newOwner = $null
    killAt = $null
    recoveredAt = $null
    recoverySeconds = $null
    healthChecks = @()
    result = 'DRILL_INCOMPLETE'
}

function Save-Summary {
    $summary | ConvertTo-Json -Depth 5 | Out-File 'G:\hse-dashboard\server\scripts\output\wpssync05g2-drill-run.json' -Encoding utf8
}

function Get-Health {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5876/api/health' -UseBasicParsing -TimeoutSec 5
        return $r.StatusCode
    } catch { return 'ERR' }
}

function Get-ProdPid {
    # identity via process tree: node.exe running prod-launch.cjs
    $nodes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    $prod = @($nodes | Where-Object { $_.CommandLine -match 'prod-launch\.cjs' })
    if ($prod.Count -eq 1) { return @{ pid = [int]$prod[0].ProcessId; src = 'proctree'; ppid = $prod[0].ParentProcessId } }
    # fallback: exactly one node.exe process system-wide
    $all = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($all.Count -eq 1) { return @{ pid = [int]$all[0].Id; src = 'single-node-fallback'; ppid = $null } }
    return @{ pid = $null; src = "ambiguous: proctree=$($prod.Count) allnode=$($all.Count)"; ppid = $null }
}

try {
    # ---------- STEP 0: task verify ----------
    Write-Host '===== STEP 0: verify HSE-Backend task ====='
    $t = Get-ScheduledTask -TaskName 'HSE-Backend' -ErrorAction Stop
    $i = $t | Get-ScheduledTaskInfo
    Write-Host ('[VERIFY] State=' + $t.State +
                ' Principal=' + $t.Principal.UserId +
                ' RunLevel=' + $t.Principal.RunLevel +
                ' MultiInstances=' + $t.Settings.MultipleInstances +
                ' RestartCount=' + $t.Settings.RestartCount +
                ' ExecutionTimeLimit=' + $t.Settings.ExecutionTimeLimit)
    Write-Host ('[VERIFY] LastRunTime=' + $i.LastRunTime + ' LastTaskResult=' + $i.LastTaskResult + ' NextRunTime=' + $i.NextRunTime +
                '  (LastTaskResult=2147946720/0x800710E0 = instance-running & IgnoreNew refused trigger: NORMAL)')
    if ($t.Principal.UserId -notmatch 'SYSTEM') { throw 'TASK_PRINCIPAL_NOT_SYSTEM' }
    $summary.task = @{ state = [string]$t.State; principal = [string]$t.Principal.UserId; lastTaskResult = [string]$i.LastTaskResult; lastRunTime = [string]$i.LastRunTime }

    # ---------- STEP 1: preflight ----------
    Write-Host '===== STEP 1: preflight (process-tree identity) ====='
    $id = Get-ProdPid
    if (-not $id.pid) { throw "PROD_PID_AMBIGUOUS: $($id.src)" }
    $oldPid = $id.pid
    $pname = (Get-Process -Id $oldPid -ErrorAction Stop).ProcessName
    if ($pname -ne 'node') { throw "PID $oldPid IS $pname NOT node" }
    $h = Get-Health
    if ($h -ne 200) { throw "HEALTH_NOT_200: $h" }
    # TCP table view: forensic only (known to ghost on this machine)
    try {
        $tcp = Get-NetTCPConnection -LocalPort 5876 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique
        $summary.tcpTableReports = ($tcp -join ',')
        Write-Host "[INFO] TCP table says: $($tcp -join ',')  (forensic only; known ghost-pid issue on elevated sessions)"
    } catch { $summary.tcpTableReports = 'query-failed' }
    $summary.oldPid = $oldPid
    Write-Host "[OK] prodPid=$oldPid (src=$($id.src) ppid=$($id.ppid)) name=$pname health=200"

    # ---------- STEP 2: drill kill ----------
    Write-Host '===== STEP 2: DRILL kill (hard kill production node) ====='
    $id2 = Get-ProdPid
    if (-not $id2.pid -or [int]$id2.pid -ne $oldPid) { throw "PROD_PID_CHANGED_BEFORE_KILL: $($id2.src)" }
    $summary.killAt = (Get-Date -Format o)
    $out = taskkill /F /PID $oldPid 2>&1
    Write-Host ('[KILL] ' + ($out -join ' '))
    if ($LASTEXITCODE -ne 0) { throw "TASKKILL_FAILED exit=$LASTEXITCODE" }
    Start-Sleep -Seconds 3
    $gone = $true
    try { Get-Process -Id $oldPid -ErrorAction Stop | Out-Null; $gone = $false } catch { $gone = $true }
    if (-not $gone) { throw 'KILL_FAILED_PID_STILL_ALIVE' }
    Write-Host "[OK] $oldPid terminated"

    # ---------- STEP 3: recovery watch (<=150s) ----------
    Write-Host '===== STEP 3: watching watchdog recovery (every 5s, max 150s) ====='
    $deadline = (Get-Date).AddSeconds(150)
    $newPid = $null
    $streak = 0
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        $h = Get-Health
        if ($h -eq 200) {
            $streak++
            if ($streak -ge 2) {
                $id3 = Get-ProdPid
                if ($id3.pid -and [int]$id3.pid -ne $oldPid) {
                    $newPid = $id3.pid
                    $summary.newPid = $newPid
                    $summary.recoveredAt = (Get-Date -Format o)
                    $summary.recoverySeconds = [int]((Get-Date) - [datetime]$summary.killAt).TotalSeconds
                    Write-Host "[RECOVERED] newPid=$newPid after $($summary.recoverySeconds)s (health 200 x2, proctree src=$($id3.src))"
                    break
                } else {
                    Write-Host '[WARN] health 200 but prod pid not resolved yet; keep polling'
                }
            }
        } else { $streak = 0 }
    }
    if (-not $newPid) {
        Write-Host '[BLOCKED_RECOVERY_TIMEOUT] watchdog did not recover in 150s.'
        Write-Host 'MANUAL RECOVERY: Start-ScheduledTask -TaskName ''HSE-Backend''  (or see prod-rollback.md)'
        $summary.result = 'DRILL_BLOCKED_RECOVERY_TIMEOUT'
        Save-Summary
        throw 'RECOVERY_TIMEOUT'
    }

    # owner must be SYSTEM
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$newPid"
    $o = $p | Invoke-CimMethod -MethodName GetOwner
    $owner = if ($o.Domain) { "$($o.Domain)\$($o.User)" } else { '<unknown>' }
    $summary.newOwner = $owner
    Write-Host "[VERIFY] newPid=$newPid owner=$owner ppid=$($p.ParentProcessId) created=$($p.CreationDate)"
    if ($owner -notmatch 'SYSTEM') {
        Write-Host "[ALERT_PORT_TAKEN_BY_$owner] NOT killing anything. Something else grabbed the port; watchdog will keep failing with EADDRINUSE."
        $summary.result = 'DRILL_ALERT_PORT_TAKEN'
        Save-Summary
        throw 'PORT_TAKEN'
    }

    # ---------- STEP 4: stability ----------
    Write-Host '===== STEP 4: stability T+20/50/80s ====='
    $elapsed = 0
    foreach ($wait in 20, 30, 30) {
        Start-Sleep -Seconds $wait
        $elapsed += $wait
        $h = Get-Health
        $idn = Get-ProdPid
        $stable = ($idn.pid -and [int]$idn.pid -eq $newPid)
        Write-Host ("[T+${elapsed}s] health=$h prodPid=$($idn.pid) stable=$stable")
        $summary.healthChecks += @{ at = "T+${elapsed}s"; health = $h; pid = "$($idn.pid)"; stable = $stable }
        if ($h -ne 200 -or -not $stable) {
            $summary.result = 'DRILL_FAIL_UNSTABLE'
            Save-Summary
            throw "UNSTABLE at T+${elapsed}s"
        }
    }

    # ---------- STEP 5: final task info ----------
    $i2 = $t | Get-ScheduledTaskInfo
    Write-Host ('[VERIFY] post-drill LastRunTime=' + $i2.LastRunTime + ' LastTaskResult=' + $i2.LastTaskResult)
    $summary.task.lastTaskResultPost = [string]$i2.LastTaskResult
    $summary.result = 'DRILL_PASS'
    Save-Summary
    Write-Host '================= DRILL PASS ================='
    Write-Host ("kill=$($summary.oldPid) -> recovered=$($summary.newPid) (SYSTEM) in $($summary.recoverySeconds)s")
    Write-Host 'next: agent-side zero-drift verification'
} catch {
    Write-Host ('[BLOCKED] ' + $_.Exception.Message)
    if ($summary.result -eq 'DRILL_INCOMPLETE') { $summary.result = 'DRILL_BLOCKED' }
    Save-Summary
    Write-Host 'Recovery manual: server\scripts\prod-rollback.md'
} finally {
    Stop-Transcript | Out-Null
}
