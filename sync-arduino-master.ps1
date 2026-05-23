# Run after: git pull origin main
# Copies esp32-master/main.ino into Arduino sketch folder main/main.ino

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$master = Join-Path $root "esp32-master"
$sketchDir = Join-Path $master "main"

New-Item -ItemType Directory -Force -Path $sketchDir | Out-Null
Copy-Item (Join-Path $master "main.ino") (Join-Path $sketchDir "main.ino") -Force

if (Test-Path (Join-Path $master "config.h")) {
  Copy-Item (Join-Path $master "config.h") (Join-Path $sketchDir "config.h") -Force
  Write-Host "Synced main.ino + config.h to esp32-master\main\"
} else {
  Write-Host "Synced main.ino. Create esp32-master\config.h from config.example.h first."
}
