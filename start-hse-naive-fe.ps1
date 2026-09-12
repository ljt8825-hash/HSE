# ============================================================
#  HSE Dashboard - Naive UI Frontend-only Launcher (PowerShell)
#  Starts only the Naive UI frontend (:5173).
#  Usage: start-hse-naive-fe.bat          -> start frontend
#         start-hse-naive-fe.bat stop     -> stop frontend
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
    $root         = Split-Path $MyInvocation.MyCommand.Path -Parent
    $frontendItem = Resolve-Path (Join-Path $root "*\apps\web-naive")
    $frontend     = $frontendItem.Path
    $viteBin      = Join-Path $frontend "node_modules\.bin\vite.cmd"

    $frontendPort = 5173
    $backendPort  = 5800   # only used for display hint, not started here

    # ---------- STOP mode ----------
    if ($Mode -eq "stop") {
        Write-Host "Stopping HSE Naive UI frontend (port $frontendPort)..."
        Kill-Port $frontendPort
        Write-Host "Done."
        Read-Host "Press Enter to exit"
        exit
    }

    # ---------- sanity checks ----------
    if (-not (Test-Path $frontend)) { throw "Naive UI frontend not found: $frontend" }
    if (-not (Test-Path $viteBin))  { throw "vite not found at $viteBin. Run 'pnpm install' in web-naive first." }

    # ---------- Locate Node.js ----------
    $node = $null
    $managedNode = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    if (Test-Path $managedNode) { $node = $managedNode }
    if (-not $node) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if (-not $node -or -not (Test-Path $node)) { throw "Node.js not found." }

    Write-Host "============================================================"
    Write-Host " HSE Dashboard - Naive UI Frontend-only Launcher"
    Write-Host " Frontend: http://localhost:$frontendPort  (Naive UI)"
    Write-Host "============================================================"
    Write-Host ""

    # ---------- [1/3] Firewall ----------
    Write-Host "[1/3] Configuring Windows Firewall (frontend port $frontendPort)..."
    try {
        netsh advfirewall firewall delete rule name="HSE-Naive-Frontend" 2>$null
        netsh advfirewall firewall add rule name="HSE-Naive-Frontend" dir=in action=allow protocol=TCP localport="$frontendPort" 2>$null
        Write-Host "       OK: port $frontendPort"
    } catch {
        Write-Host "       WARN: could not add firewall rule"
    }

    # ---------- [2/3] Release port ----------
    Write-Host "[2/3] Releasing port $frontendPort..."
    Kill-Port $frontendPort
    Start-Sleep -Seconds 2
    Write-Host "       OK"

    # ---------- [3/3] Start Naive UI frontend ----------
    $managedNodeDir = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2"
    $envPrep = "set PATH=$managedNodeDir;%PATH% && "
    $feCommand = "$($envPrep)set CI=true && set NODE_OPTIONS= && npx vite --host 0.0.0.0 --port $frontendPort --strictPort"

    Write-Host "[3/3] Starting Naive UI frontend (port $frontendPort)..."
    Start-ServerWindow -Title "HSE Naive UI :$frontendPort" -WorkDir $frontend -Command $feCommand
    Write-Host "       Waiting for Vite to compile..."
    Wait-ForUrl -Url "http://127.0.0.1:$frontendPort/" -TimeoutSec 180 -Label "frontend"

    # ---------- Show URLs ----------
    $lanProfiles = Get-NetConnectionProfile |
                       Where-Object { $_.IPv4Connectivity -and $_.IPv4Connectivity -ne 'Disconnected' }
    $lanIp = ($lanProfiles | ForEach-Object {
                  Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue
              } |
              Where-Object {
                  $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' -and
                  $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Default Switch|WSL|Hyper-V|VirtualBox|VMware|vmnet|VPN|Tunnel'
              } |
              Select-Object -First 1).IPAddress
    if (-not $lanIp) { $lanIp = '未知（请用 ipconfig 查询本机以太网 IP）' }

    Write-Host ""
    Write-Host "============================================================"
    Write-Host " FRONTEND STARTED  (Naive UI)"
    Write-Host " Local : http://localhost:$frontendPort"
    if ($lanIp) {
        Write-Host " LAN   : http://$lanIp`:$frontendPort"
    }
    Write-Host " Login : admin / admin123"
    Write-Host " NOTE  : This launcher starts ONLY the frontend."
    Write-Host "         Backend must be running on :$backendPort separately."
    Write-Host "------------------------------------------------------------"
    Write-Host " Close the frontend cmd window to stop the service."
    Write-Host "============================================================"

    try { Start-Process "http://localhost:$frontendPort/" } catch { }

    Read-Host "Press Enter to close (server keeps running)"
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
