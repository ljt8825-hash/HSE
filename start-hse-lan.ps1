# ============================================================
#  HSE Safety Dashboard - LAN Launcher (PowerShell core)
#  - Self-elevates to Administrator
#  - Starts backend (Node :5876) + frontend (Vite :5888)
#  - Binds frontend to 0.0.0.0 and opens the Windows Firewall
#    so every PC on the same router can open the dashboard.
#
#  Usage:
#    start-hse-lan.ps1          -> start (asks for Admin)
#    start-hse-lan.ps1 stop     -> stop both services
#
#  Double-click start-hse-lan.bat (it just calls this script).
# ============================================================

param([string]$Mode = "start")

$ErrorActionPreference = 'Stop'

# ---------- helpers ----------
function Test-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-ServerWindow {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    # Always use -WorkingDirectory (most reliable way to set CWD for child process).
    # No need to embed "cd /d" in the command string — that was causing module resolution issues.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName  = "cmd.exe"
    $psi.Arguments = "/k", "title $Title && chcp 65001 >nul && $Command"
    $psi.WorkingDirectory = (Resolve-Path $WorkDir -ErrorAction SilentlyContinue).Path
    if (-not $psi.WorkingDirectory) { $psi.WorkingDirectory = $WorkDir }
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
    } catch { /* ignore */ }
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
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
        if ($Mode -eq "stop") { $psi.Arguments += " stop" }
        $psi.Verb = "RunAs"
        [System.Diagnostics.Process]::Start($psi) | Out-Null
        exit
    } catch {
        Write-Warning "Administrator privileges are required."
        Write-Warning "Please right-click start-hse-lan.bat and choose 'Run as administrator'."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

try {
    $root        = Split-Path $MyInvocation.MyCommand.Path -Parent
    $backend     = Join-Path $root "server"
    $frontendItem = Resolve-Path (Join-Path $root "*\apps\web-naive")
    $frontend    = $frontendItem.Path
    $viteBin     = Join-Path $frontend "node_modules\.bin\vite.cmd"

    $backendPort = 5876
    $frontendPort = 5888

    # ---------- STOP mode ----------
    if ($Mode -eq "stop") {
        Write-Host "Stopping HSE services (ports $backendPort / $frontendPort)..."
        Kill-Port $backendPort
        Kill-Port $frontendPort
        Write-Host "Done. Firewall rule 'HSE-Dashboard-LAN' was left in place (harmless)."
        Read-Host "Press Enter to exit"
        exit
    }

    # ---------- sanity checks ----------
    if (-not (Test-Path $backend)) { throw "Backend directory not found: $backend" }
    if (-not (Test-Path $frontend)) { throw "Frontend directory not found: $frontend" }

    # ---------- Locate Node.js ----------
    # Priority: managed Node (where project deps are installed via pnpm) > system Node.
    # System Node (e.g. C:\Program Files\nodejs\node.exe, often v24) does NOT share
    # node_modules with the managed version, so using it causes "Cannot find module 'express'".
    $node = $null
    $managedNode = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    if (Test-Path $managedNode) { $node = $managedNode }
    if (-not $node) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if (-not $node -or -not (Test-Path $node)) { throw "Node.js not found. Install Node 22+ or fix the path in this script." }
    if (-not (Test-Path $viteBin)) { throw "vite not found at $viteBin. Run 'pnpm install' in the frontend project first." }

    Write-Host "============================================================"
    Write-Host " HSE Safety Dashboard - LAN Launcher (Administrator)"
    Write-Host " Project : $root"
    Write-Host " Backend : http://localhost:$backendPort   (node app.js)"
    Write-Host " Frontend: http://localhost:$frontendPort   (vite --host 0.0.0.0)"
    Write-Host "============================================================"
    Write-Host ""

    # ---------- [1/5] Firewall ----------
    Write-Host "[1/5] Configuring Windows Firewall for LAN access..."
    try {
        netsh advfirewall firewall delete rule name="HSE-Dashboard-LAN" 2>$null
        netsh advfirewall firewall add rule name="HSE-Dashboard-LAN" dir=in action=allow protocol=TCP localport="$frontendPort,$backendPort" 2>$null
        Write-Host "       OK: firewall rule added for ports $frontendPort and $backendPort"
    } catch {
        Write-Host "       WARN: could not add firewall rule. Allow ports $frontendPort/$backendPort manually."
    }

    # ---------- [2/5] Release ports ----------
    Write-Host "[2/5] Releasing ports $backendPort and $frontendPort..."
    Kill-Port $backendPort
    Kill-Port $frontendPort
    Start-Sleep -Seconds 2
    Write-Host "       OK"

    # Prepend managed Node to PATH in child cmd windows so `node`/`npx` resolve to v22
    # instead of the system Node (v24), whose node_modules are not shared.
    $managedNodeDir = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2"
    $envPrep = "set PATH=$managedNodeDir;%PATH% && "

    # ---------- [3/5] Start backend ----------
    Write-Host "[3/5] Starting backend (port $backendPort)..."
    Start-ServerWindow -Title "HSE Backend :$backendPort" -WorkDir $backend -Command "$($envPrep)node app.js"
    Wait-ForUrl -Url "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 90 -Label "backend"

    # ---------- [4/5] Start frontend ----------
    Write-Host "[4/5] Starting frontend (port $frontendPort, bound to 0.0.0.0)..."
    $feCommand = "$($envPrep)set CI=true && set NODE_OPTIONS= && npx vite --mode development --host 0.0.0.0 --port $frontendPort --strictPort"
    Start-ServerWindow -Title "HSE Frontend :$frontendPort" -WorkDir $frontend -Command $feCommand
    Write-Host "       Waiting for frontend to compile (first start can take ~1-3 min)..."
    Wait-ForUrl -Url "http://127.0.0.1:$frontendPort/" -TimeoutSec 180 -Label "frontend"

    # ---------- [5/5] Show access URLs ----------
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
              Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and
                             $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } |
              Select-Object -First 1).IPAddress

    Write-Host ""
    Write-Host "============================================================"
    Write-Host " STARTUP COMPLETE"
    Write-Host " Local : http://localhost:$frontendPort"
    if ($lanIp) {
        Write-Host " LAN   : http://$lanIp`:$frontendPort   (other PCs on this router)"
    } else {
        Write-Host " LAN   : (could not detect LAN IP; run: ipconfig)"
    }
    Write-Host " Backend API : http://localhost:$backendPort"
    Write-Host " Login : admin / admin123"
    Write-Host "------------------------------------------------------------"
    Write-Host " Two windows are now running: 'HSE Backend' and 'HSE Frontend'."
    Write-Host " Close them to stop the services, or run: start-hse-lan.bat stop"
    Write-Host "============================================================"

    # Open the dashboard in the local default browser.
    try { Start-Process "http://localhost:$frontendPort/" } catch { }

    Read-Host "Press Enter to close this launcher (the servers keep running in their own windows)"
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
