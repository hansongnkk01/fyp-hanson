# Push latest FYP code to GitHub (triggers Vercel auto-deploy)
# Usage: Right-click -> Run with PowerShell, OR in terminal:
#   cd "c:\Users\esthe\Downloads\FYP HANSON"
#   .\push-to-github.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$msg = $args[0]
if (-not $msg) { $msg = "Update FYP project" }

Write-Host "=== Git status ===" -ForegroundColor Cyan
git status

Write-Host "`n=== Adding all changes ===" -ForegroundColor Cyan
git add -A

$status = git status --porcelain
if (-not $status) {
    Write-Host "Nothing to commit — already up to date." -ForegroundColor Yellow
    exit 0
}

Write-Host "`n=== Commit: $msg ===" -ForegroundColor Cyan
git commit -m $msg

Write-Host "`n=== Push to origin main ===" -ForegroundColor Cyan
git push origin main

Write-Host "`nDone! Vercel will redeploy in ~1 minute." -ForegroundColor Green
Write-Host "Repo: https://github.com/hansongnkk01/fyp-hanson" -ForegroundColor Gray
