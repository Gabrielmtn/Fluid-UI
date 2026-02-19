@echo off
cd /d "%~dp0"

echo Killing Electron...
taskkill /F /IM electron.exe 1>nul 2>nul

if not "%1"=="--reset" goto skip_reset
echo Clearing file cache only (settings preserved)...
rmdir /s /q "%APPDATA%\Electron\Cache" 2>nul
rmdir /s /q "%LOCALAPPDATA%\electron\Cache" 2>nul
:skip_reset

if not "%1"=="--nuke" goto skip_nuke
echo FULL RESET: Clearing ALL data including settings...
rmdir /s /q "%APPDATA%\Electron" 2>nul
rmdir /s /q "%LOCALAPPDATA%\electron" 2>nul
:skip_nuke

echo Starting Electron...
call npm run electron

echo.
echo === Shortcuts ===
echo   restart-electron.bat          - Restart (keeps settings)
echo   restart-electron.bat --reset  - Restart + clear file cache
echo   restart-electron.bat --nuke   - Restart + clear EVERYTHING
echo   F5 in app                     - Reload (keeps settings)
echo   Ctrl+Shift+R in app           - Hard reload (clear file cache)
echo   Ctrl+Shift+D in app           - Nuclear reset (clear all)
echo.
pause
