@echo off
cd /d "%~dp0"
set ELECTRON_DEV=1
echo Launching Nova HUD...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
echo Nova should be on your screen - transparent HUD on the right side.
echo Press any key to close this window.
pause >nul
