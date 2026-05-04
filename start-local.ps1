param(
  [int]$ServerPort = 5000,
  [int]$WebPort = 3000
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $repoRoot "server"
$webDir = Join-Path $repoRoot "web"

Write-Host "Starting backend on http://localhost:$ServerPort and frontend on http://localhost:$WebPort"
Write-Host "If either port is already in use, stop that process first."

$serverCommand = "Set-Location '$serverDir'; `$env:PORT='$ServerPort'; node server.js"
$webCommand = "Set-Location '$webDir'; `$env:PORT='$WebPort'; node .\scripts\serve-build.mjs"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $serverCommand | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCommand | Out-Null

Write-Host "Two PowerShell windows were opened."
