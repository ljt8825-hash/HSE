# ============================================================
#  HSE Dashboard - Naive UI Backend-only Launcher (PowerShell)
#  Starts only the backend (:5800).
#  Usage: start-hse-naive-be.bat          -> start backend
#         start-hse-naive-be.bat stop     -> stop backend
# ============================================================

param([string]$Mode = "start")

$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-ServerWindow {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName  = "cmd.exe"
    $psi.Arguments = "/k", "title $Title && chcp 65001 >nul && $Command"
    $psi.WorkingDirectory = (Resolve-Path $WorkDir).Path
    $psi.WindowStyle = 'Normal'
    [System.Diagnostics.Process]::Start($psi) | Out-Null
}

function Kill-Port {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}

function Wait-ForUrl {
    param([string]$Url, [int]$TimeoutSec, [string]$Label)
    $ok = $false
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ok = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if ($ok) { Write-Host "       OK: $Label is up" }
    else     { Write-Host "       WARN: $Label not ready - check its window" }
}

# ---------- self-elevate ----------
if (-not (Test-Admin)) {
    Write-Host "Requesting administrator privileges..."
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName  = "powershell.exe"
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" $Mode"
        $psi.Verb = "RunAs"
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        exit
    } catch {
        Write-Warning "Administrator privileges are required."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

try {
    $root        = Split-Path $MyInvocation.MyCommand.Path -Parent
    $backend     = Join-Path $root "server"
    $backendPort = 5800

    # ---------- STOP mode ----------
    if ($Mode -eq "stop") {
        Write-Host "Stopping HSE backend (port $backendPort)..."
        Kill-Port $backendPort
        Write-Host "Done."
        Read-Host "Press Enter to exit"
        exit
    }

    # ---------- sanity checks ----------
    if (-not (Test-Path $backend)) { throw "Backend not found: $backend" }

    # ---------- Locate Node.js ----------
    $node = $null
    $managedNode = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    if (Test-Path $managedNode) { $node = $managedNode }
    if (-not $node) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if (-not $node -or -not (Test-Path $node)) { throw "Node.js not found." }

    Write-Host "============================================================"
    Write-Host " HSE Dashboard - Backend-only Launcher"
    Write-Host " Backend : http://localhost:$backendPort"
    Write-Host "============================================================"
    Write-Host ""

    # ---------- [1/3] Firewall ----------
    Write-Host "[1/3] Configuring Windows Firewall (backend port $backendPort)..."
    try {
        netsh advfirewall firewall delete rule name="HSE-Naive-Backend" 2>$null
        netsh advfirewall firewall add rule name="HSE-Naive-Backend" dir=in action=allow protocol=TCP localport="$backendPort" 2>$null
        Write-Host "       OK: port $backendPort"
    } catch {
        Write-Host "       WARN: could not add firewall rule"
    }

    # ---------- [2/3] Release port ----------
    Write-Host "[2/3] Releasing port $backendPort..."
    Kill-Port $backendPort
    Start-Sleep -Seconds 2
    Write-Host "       OK"

    # ---------- [3/3] Start backend ----------
    $managedNodeDir = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2"
    $envPrep = "set PATH=$managedNodeDir;%PATH% && "

    Write-Host "[3/3] Starting backend (port $backendPort)..."
    Start-ServerWindow -Title "HSE Backend :$backendPort" -WorkDir $backend -Command "$($envPrep)node app.js"
    Wait-ForUrl -Url "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 90 -Label "backend"

    Write-Host ""
    Write-Host "============================================================"
    Write-Host " BACKEND STARTED"
    Write-Host " Backend : http://localhost:$backendPort"
    Write-Host " Health  : http://localhost:$backendPort/api/health"
    Write-Host "------------------------------------------------------------"
    Write-Host " Close the backend cmd window to stop the service."
    Write-Host "============================================================"

    Read-Host "Press Enter to close (server keeps running)"
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
