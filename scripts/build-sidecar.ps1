# build-sidecar.ps1 — Build the Octave Python sidecar binary for Windows.
#
# The compiled binary is NOT committed to git (see src-python/.gitignore).
# Run this script once before `npm run tauri dev` or `npm run tauri build`.
#
# Prerequisites:
#   pip install pyinstaller
#
# Usage:
#   .\scripts\build-sidecar.ps1
#   .\scripts\build-sidecar.ps1 -SkipInstall   # skip pip install step

param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$SrcPython = Join-Path $RepoRoot "src-python"
$DestName  = "main-x86_64-pc-windows-msvc"
$DestPath  = Join-Path $SrcPython "$DestName.exe"

Write-Host "==> Building Octave Python sidecar (Windows x64)" -ForegroundColor Cyan

# Step 1: install / upgrade PyInstaller
if (-not $SkipInstall) {
    Write-Host "--> Installing PyInstaller..." -ForegroundColor Gray
    python -m pip install --quiet --upgrade pyinstaller
}

# Step 2: build one-file executable
Write-Host "--> Running PyInstaller..." -ForegroundColor Gray
Push-Location $SrcPython
try {
    python -m PyInstaller --onefile --name main main.py
} finally {
    Pop-Location
}

# Step 3: copy dist/main.exe → src-python/main-x86_64-pc-windows-msvc.exe
$Built = Join-Path $SrcPython "dist\main.exe"
if (-not (Test-Path $Built)) {
    Write-Error "PyInstaller output not found at $Built"
    exit 1
}

Copy-Item -Force $Built $DestPath
Write-Host "==> Binary written to $DestPath" -ForegroundColor Green
Write-Host "    You can now run: npm run tauri dev" -ForegroundColor Green
