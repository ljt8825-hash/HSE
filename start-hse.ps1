<#
.SYNOPSIS
    Compatibility entry for the HSE system launcher.

.DESCRIPTION
    The only supported startup flow is start-hse-v2.ps1. This file remains
    as a compatibility alias so older shortcuts cannot launch a different
    frontend.
#>

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$launcher = Join-Path $projectRoot 'start-hse-v2.ps1'

if (-not (Test-Path -LiteralPath $launcher)) {
    Write-Error "Launcher not found: $launcher"
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher
exit $LASTEXITCODE
