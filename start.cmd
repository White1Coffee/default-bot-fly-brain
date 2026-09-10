@echo off
setlocal
cd /d "%~dp0"
if not exist bot-settings.json copy /y bot-settings.example.json bot-settings.json >nul
if not exist node_modules (
  echo node_modules ontbreekt. Voer eerst setup.cmd uit.
  exit /b 1
)
if not defined PORT set "PORT=3000"
set "HUD_URL=http://127.0.0.1:%PORT%"
echo Bot dashboard wordt geopend op %HUD_URL%
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%HUD_URL%'"
node bot.js
endlocal
