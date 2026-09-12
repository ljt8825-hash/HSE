$src = 'G:\hse-dashboard\server\scripts'
$dst = 'G:\hse-dashboard\server\scripts\_archive'
Get-ChildItem -Path $src -Filter '_*' | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    Move-Item -Path $_.FullName -Destination $dst -Force
}
Write-Output '--- archive content ---'
Get-ChildItem -Path $dst | Select-Object Name
Write-Output '--- remaining underscore files in scripts ---'
$left = Get-ChildItem -Path $src -Filter '_*' | Where-Object { -not $_.PSIsContainer }
if ($left) { $left | Select-Object Name } else { Write-Output '(none)' }
