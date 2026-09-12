# ============================================================
# WPS-PG-SYNC-05-G-1C  one-click admin cutover script
# Purpose: register HSE-Backend (SYSTEM watchdog) then switch
#          production 5876 from current (TRAE-era) PID.
# Usage  : right-click -> Run with PowerShell (allow UAC),
#          or run from an elevated PowerShell:
#          powershell -ExecutionPolicy Bypass -File "G:\hse-dashboard\server\scripts\05g1c-admin-run.ps1"
# Safety : every step verifies before proceeding; on ANY failure
#          it prints [BLOCKED_...] and STOPS (no auto-rollback).
#          Rollback manual: server\scripts\prod-rollback.md
# ============================================================

$ErrorActionPreference = 'Stop'

# ---- 0. self-elevate (UAC prompt shown to YOU, the runner) ----
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '[INFO] not elevated, relaunching with UAC prompt ...'
    $ps = (Get-Process -Id $PID).Path
    Start-Process -FilePath $ps -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$log = 'G:\hse-dashboard\server\logs\05g1c-admin-run-transcript.log'
Start-Transcript -Path $log -Append | Out-Null

try {
    Write-Host '===== STEP 1: register HSE-Backend ====='

    $existing = Get-ScheduledTask -TaskName 'HSE-Backend' -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host ('[SKIP] HSE-Backend already registered, State=' + $existing.State)
    } else {
        $a = New-ScheduledTaskAction `
            -Execute 'C:\Program Files\nodejs\node.exe' `
            -Argument '"G:\hse-dashboard\server\scripts\prod-launch.cjs"' `
            -WorkingDirectory 'G:\hse-dashboard\server'

        $tBoot = New-ScheduledTaskTrigger -AtStartup

        # indefinite 1-minute watchdog trigger (PS 5.1 safe pattern,
        # empirically verified 2026-09-12: leaving Repetition.Duration EMPTY
        # registers as <Repetition><Interval>PT1M</Interval></Repetition> = repeat indefinitely.
        # NOTE: [TimeSpan]::MaxValue serializes to P99999999DT23H59M59S which Task XML REJECTS)
        $tpl = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
            -RepetitionInterval (New-TimeSpan -Minutes 1) `
            -RepetitionDuration ([TimeSpan]::MaxValue)
        $tRep = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
        $tRep.Repetition = $tpl.Repetition
        $tRep.Repetition.Duration = ''
        $tRep.Repetition.StopAtDurationEnd = $false

        $s = New-ScheduledTaskSettingsSet `
            -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -MultipleInstances IgnoreNew `
            -StartWhenAvailable `
            -RestartCount 3 `
            -RestartInterval (New-TimeSpan -Minutes 1) `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries

        Register-ScheduledTask `
            -TaskName 'HSE-Backend' `
            -Action $a `
            -Trigger $tBoot, $tRep `
            -Settings $s `
            -User 'NT AUTHORITY\SYSTEM' `
            -RunLevel Highest `
            -Description 'HSE 5876 production node (SYSTEM; boot+1min watchdog)' | Out-Null
        Write-Host '[OK] HSE-Backend registered'
    }

    # ---- verify registration BEFORE touching production ----
    $t = Get-ScheduledTask -TaskName 'HSE-Backend'
    Write-Host ('[VERIFY] State=' + $t.State +
                ' Principal=' + $t.Principal.UserId +
                ' RunLevel=' + $t.Principal.RunLevel +
                ' MultiInstances=' + $t.Settings.MultipleInstances +
                ' RestartCount=' + $t.Settings.RestartCount)
    $t.Actions | ForEach-Object {
        Write-Host ('[VERIFY] Execute=' + $_.Execute)
        Write-Host ('[VERIFY] Arguments=' + $_.Arguments)
        Write-Host ('[VERIFY] WorkingDirectory=' + $_.WorkingDirectory)
    }
    $t.Triggers | ForEach-Object {
        Write-Host ('[VERIFY] Trigger=' + $_.CimClass.CimClassName + ' Enabled=' + $_.Enabled)
    }
    if ($t.State -ne 'Ready' -and $t.State -ne 'Running') { throw 'BLOCKED_TASK_NOT_READY' }
    if ($t.Principal.UserId -notmatch 'SYSTEM') { throw 'BLOCKED_TASK_NOT_SYSTEM' }

    # XML-level verification of the watchdog repetition (indefinite, 1-min)
    $xml = [string](Export-ScheduledTask -TaskName 'HSE-Backend')
    ($xml -split "`n" | Select-String -Pattern '<Repetition>|<Interval>|<StopAtDurationEnd>' |
        ForEach-Object { '[VERIFY-XML] ' + $_.Line.Trim() }) | Write-Host
    if ($xml -notmatch '<Repetition>') { throw 'BLOCKED_NO_REPETITION_IN_XML' }
    if ($xml -match 'P9999') { throw 'BLOCKED_BAD_DURATION_XML' }

    Write-Host '===== STEP 2: preflight ====='
    & 'C:\Program Files\nodejs\node.exe' --check 'G:\hse-dashboard\server\scripts\prod-launch.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'BLOCKED_PROD_LAUNCH_SYNTAX' }
    $pre = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5876/api/health' -TimeoutSec 5
    if ($pre.StatusCode -ne 200) { throw 'BLOCKED_PRE_HEALTH_NOT_200' }
    Write-Host '[OK] prod-launch.cjs syntax PASS, current 5876 healthy'

    Write-Host '===== STEP 3: cutover (kill old PID -> start service task) ====='
    $conn = Get-NetTCPConnection -LocalPort 5876 -State Listen -ErrorAction Stop |
        Select-Object -First 1
    $oldPid = $conn.OwningProcess
    Write-Host ('[CUTOVER] old production PID = ' + $oldPid + '  (owner: ' +
        (Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" |
            ForEach-Object { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner; $o.Domain + '\' + $o.User }) + ')')
    taskkill /F /PID $oldPid
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName 'HSE-Backend'
    Write-Host '[CUTOVER] Start-ScheduledTask issued'

    Write-Host '===== STEP 4: post-cutover verification ====='
    Start-Sleep -Seconds 10

    $conns = Get-NetTCPConnection -LocalPort 5876 -State Listen -ErrorAction SilentlyContinue
    $conns | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table | Out-Host
    $newPid = ($conns | Select-Object -First 1).OwningProcess
    if (-not $newPid) { throw 'BLOCKED_NO_LISTENER' }
    if (($conns | Measure-Object).Count -gt 2) { throw 'BLOCKED_SECOND_LISTENER' }

    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$newPid"
    $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner
    Write-Host ('[VERIFY] newPID=' + $newPid +
                ' owner=' + $o.Domain + '\' + $o.User +
                ' ppid=' + $p.ParentProcessId +
                ' created=' + $p.CreationDate)
    Write-Host ('[VERIFY] exe=' + $p.ExecutablePath)
    Write-Host ('[VERIFY] cmd=' + $p.CommandLine)
    if (-not ($o.Domain -eq 'NT AUTHORITY' -and $o.User -eq 'SYSTEM')) {
        throw 'BLOCKED_WRONG_OWNER'
    }

    foreach ($round in 1, 2, 3) {
        Start-Sleep -Seconds 30
        $resp = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5876/api/health' -TimeoutSec 5
        $c2 = Get-NetTCPConnection -LocalPort 5876 -State Listen -ErrorAction SilentlyContinue
        $still = $c2 | Select-Object -First 1
        Write-Host ('[T+' + (30 * $round + 10) + 's] health=' + $resp.StatusCode +
                    ' listenerPid=' + $still.OwningProcess)
        if ($resp.StatusCode -ne 200) { throw 'BLOCKED_HEALTH_NOT_200' }
        if ($still.OwningProcess -ne $newPid) { throw 'BLOCKED_PID_CHANGED' }
    }

    Write-Host ''
    Write-Host '================= CUTOVER SUCCESS =================' -ForegroundColor Green
    Write-Host ('new production PID = ' + $newPid + ' (SYSTEM, HSE-Backend)')
    Write-Host 'svc console log : server\logs\prod-service-console.log'
    Write-Host 'rollback manual : server\scripts\prod-rollback.md'
    Write-Host 'next            : agent-side 05-G-1D full re-verification (status/baseline)'
    Write-Host '===================================================='
} catch {
    Write-Host ''
    Write-Host ('[BLOCKED] ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'No automatic rollback was performed.'
    Write-Host 'Recovery / rollback steps: G:\hse-dashboard\server\scripts\prod-rollback.md'
    Write-Host 'Current 5876 state:'
    Get-NetTCPConnection -LocalPort 5876 -State Listen -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table | Out-Host
    try {
        $h = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5876/api/health' -TimeoutSec 5
        Write-Host ('health=' + $h.StatusCode)
    } catch {
        Write-Host 'health=UNREACHABLE (use wps05e3-launch emergency launcher if down)'
    }
} finally {
    Stop-Transcript | Out-Null
}
