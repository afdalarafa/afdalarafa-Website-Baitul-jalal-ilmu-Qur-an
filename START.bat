@echo off
setlocal
cd /d "%~dp0"
title Baitul Jalal Ilmu Quran

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 atau lebih baru belum terpasang.
  echo Silakan instal Node.js 22 LTS atau lebih baru.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 22 (
  echo Node.js yang terpasang terlalu lama: %NODEMAJOR%
  echo Website membutuhkan Node.js 22 atau lebih baru.
  pause
  exit /b 1
)

echo.
echo ================================================
echo   BAITUL JALAL ILMU QURAN
echo ================================================
echo.
echo Website berjalan tanpa npm install tambahan.
echo Firebase dan Google Drive bersifat opsional.
echo.

start "Baitul Jalal Ilmu Quran Server" cmd /k "cd /d ""%~dp0"" && node --env-file=.env server.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
endlocal
