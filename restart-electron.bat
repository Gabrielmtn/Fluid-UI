@echo off
echo Killing Electron...
taskkill /F /IM electron.exe >nul 2>&1

echo Clearing cache...
rmdir /s /q "%APPDATA%\Electron" >nul 2>&1
rmdir /s /q "%LOCALAPPDATA%\electron" >nul 2>&1

echo Generating new cache-bust version...
powershell -Command "Get-Date -UFormat '%%s' | Out-File -FilePath 'build-version.txt' -NoNewline -Encoding ASCII"

echo Starting Electron with fresh cache...
cd /d "%~dp0"
call npm run electron

echo.
echo === Development Tips ===
echo Press F5 or Ctrl+Shift+R in Electron to hard reload
echo Run this .bat file anytime to completely restart fresh
echo.
pause
