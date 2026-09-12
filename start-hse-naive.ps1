# ============================================================
#  HSE Dashboard - Naive UI LAN Launcher (PowerShell)
#  Starts backend (:5800) + Naive UI frontend (:5888)
#  Binds to 0.0.0.0 so LAN colleagues can access.
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
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
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
    $frontendItem = Resolve-Path (Join-Path $root "*\apps\web-naive")
    $frontend    = $frontendItem.Path
    $viteBin     = Join-Path $frontend "node_modules\.bin\vite.cmd"

    $backendPort  = 5800
    $frontendPort = 5173

    # ---------- STOP mode ----------
    if ($Mode -eq "stop") {
        Write-Host "Stopping HSE services (ports $backendPort / $frontendPort)..."
        Kill-Port $backendPort
        Kill-Port $frontendPort
        Write-Host "Done."
        Read-Host "Press Enter to exit"
        exit
    }

    # ---------- sanity checks ----------
    if (-not (Test-Path $backend))  { throw "Backend not found: $backend" }
    if (-not (Test-Path $frontend)) { throw "Naive UI frontend not found: $frontend" }
    if (-not (Test-Path $viteBin))  { throw "vite not found at $viteBin. Run 'pnpm install' in web-naive first." }

    # ---------- Locate Node.js ----------
    $node = $null
    $managedNode = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2\node.exe"
    if (Test-Path $managedNode) { $node = $managedNode }
    if (-not $node) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if (-not $node -or -not (Test-Path $node)) { throw "Node.js not found." }

    Write-Host "============================================================"
    Write-Host " HSE Dashboard - Naive UI LAN Launcher"
    Write-Host " Backend : http://localhost:$backendPort"
    Write-Host " Frontend: http://localhost:5173  (Naive UI)"
    Write-Host "============================================================"
    Write-Host ""

    # ---------- [1/5] Firewall ----------
    Write-Host "[1/5] Configuring Windows Firewall..."
    try {
        netsh advfirewall firewall delete rule name="HSE-Naive-LAN" 2>$null
        netsh advfirewall firewall add rule name="HSE-Naive-LAN" dir=in action=allow protocol=TCP localport="$frontendPort,$backendPort" 2>$null
        Write-Host "       OK: ports $frontendPort, $backendPort"
    } catch {
        Write-Host "       WARN: could not add firewall rule"
    }

    # ---------- [2/5] Release ports ----------
    Write-Host "[2/5] Releasing ports..."
    Kill-Port $backendPort
    Kill-Port $frontendPort
    Start-Sleep -Seconds 2
    Write-Host "       OK"

    # ---------- [3/5] Start backend ----------
    $managedNodeDir = "C:\Users\honey\.workbuddy\binaries\node\versions\22.22.2"
    $envPrep = "set PATH=$managedNodeDir;%PATH% && "

    Write-Host "[3/5] Starting backend (port $backendPort)..."
    Start-ServerWindow -Title "HSE Backend :$backendPort" -WorkDir $backend -Command "$($envPrep)node app.js"
    Wait-ForUrl -Url "http://127.0.0.1:$backendPort/api/health" -TimeoutSec 90 -Label "backend"

    # ---------- [4/5] Start Naive UI frontend ----------
    Write-Host "[4/5] Starting Naive UI frontend (port $frontendPort)..."
    $feCommand = "$($envPrep)set CI=true && set NODE_OPTIONS= && npx vite --host 0.0.0.0 --port $frontendPort --strictPort"
    Start-ServerWindow -Title "HSE Naive UI :$frontendPort" -WorkDir $frontend -Command $feCommand
    Write-Host "       Waiting for Vite to compile..."
    Wait-ForUrl -Url "http://127.0.0.1:$frontendPort/" -TimeoutSec 180 -Label "frontend"

    # ---------- [5/5] Show URLs ----------
    # 选取真实局域网 IP：仅考虑已连接的网络，并排除虚拟/回环网卡。
    # 此前正则会误选 Hyper-V 虚拟交换机(vEthernet Default Switch 172.31.128.1)，
    # 导致局域网地址提示错误。
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
    Write-Host " STARTUP COMPLETE  (Naive UI)"
    Write-Host " Local : http://localhost:$frontendPort"
    if ($lanIp) {
        Write-Host " LAN   : http://$lanIp`:$frontendPort"
    }
    Write-Host " Backend : http://localhost:$backendPort"
    Write-Host " Login   : admin / admin123"
    Write-Host "------------------------------------------------------------"
    Write-Host " Close the two cmd windows to stop services."
    Write-Host "============================================================"

    try { Start-Process "http://localhost:$frontendPort/" } catch { }

    Read-Host "Press Enter to close (servers keep running)"
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}