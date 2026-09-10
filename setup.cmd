@echo off
setlocal
cd /d "%~dp0"
if not exist bot-settings.json copy /y bot-settings.example.json bot-settings.json >nul
echo Dependencies installeren...
call npm ci
if errorlevel 1 (
  echo Installatie mislukt.
  exit /b 1
)
echo Default bot is gereed. Pas bot-settings.json aan en gebruik start.cmd.
endlocal
