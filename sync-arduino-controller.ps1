# Sync esp32-controller/main.ino → Arduino sketch folder (main/main.ino)
$src = Join-Path $PSScriptRoot "esp32-controller\main.ino"
$destDir = Join-Path $PSScriptRoot "esp32-controller\main"
$dest = Join-Path $destDir "main.ino"

if (-not (Test-Path $src)) {
  Write-Error "Source not found: $src"
  exit 1
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Force $src $dest

$configSrc = Join-Path $PSScriptRoot "esp32-controller\config.h"
$configDest = Join-Path $destDir "config.h"
if (Test-Path $configSrc) {
  Copy-Item -Force $configSrc $configDest
  Write-Host "Synced main.ino + config.h"
} else {
  Write-Host "Synced main.ino (copy config.h manually if needed)"
}
