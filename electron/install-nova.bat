@echo off
echo Installing Nova to C:\Program Files\Nova...
mkdir "C:\Program Files\Nova" 2>nul
if not exist "C:\Program Files\Nova" (
    echo ERROR: Could not create folder. Right-click this file and select "Run as Administrator"
    pause
    exit /b 1
)

echo Copying files...
xcopy /E /I /Y "%~dp0*" "C:\Program Files\Nova\" >nul

echo Creating Desktop shortcut...
powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $shortcut = $wshell.CreateShortcut([System.Environment]::GetFolderPath('Desktop') + '\Nova HUD.lnk'); $shortcut.TargetPath = 'C:\Program Files\Nova\node_modules\electron\dist\electron.exe'; $shortcut.WorkingDirectory = 'C:\Program Files\Nova'; $shortcut.Arguments = 'C:\Program Files\Nova'; $shortcut.WindowStyle = 1; $shortcut.Save()"

echo Creating Startup entry (auto-launch on boot)...
powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $shortcut = $wshell.CreateShortcut([System.Environment]::GetFolderPath('Startup') + '\Nova HUD.lnk'); $shortcut.TargetPath = 'C:\Program Files\Nova\node_modules\electron\dist\electron.exe'; $shortcut.WorkingDirectory = 'C:\Program Files\Nova'; $shortcut.Arguments = 'C:\Program Files\Nova'; $shortcut.WindowStyle = 7; $shortcut.Save()"

echo Creating tray icon only config...
echo. > "C:\Program Files\Nova\.production"

echo.
echo Done! Nova is installed at C:\Program Files\Nova
echo   - Desktop shortcut: Nova HUD (double-click to open)
echo   - Auto-starts when you log in
echo   - Right-click Nova tray icon (bottom-right) to quit
echo.
echo FIRST TIME: Double-click the "Nova HUD" shortcut on your desktop
echo or restart your laptop to see it auto-launch.
echo.
pause
