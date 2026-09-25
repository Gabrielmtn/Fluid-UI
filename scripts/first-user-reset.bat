@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem ===================================================================
rem  first-user-reset.bat  --  Swirl Together / Fluid-UI
rem  See the desktop app exactly as a first-time user does, then put
rem  your own presets, brushes and settings back.
rem
rem  Close the app, then double-click this. It shows which mode you are
rem  in and offers the next step:
rem
rem   Your data is live  ->  start a first-user test:
rem     1. a verified backup of your data (backup-local-data.bat, label
rem        before-first-user-reset) into the backup root;
rem     2. every app profile (%APPDATA%\fluid-ui-multiplayer, \Swirl
rem        Together, \Swirl Together Demo, \Swirl Together Playtest) and
rem        every Preset Vault (<Documents>\<Title>\Presets) that exists is
rem        renamed to <name>.before-first-user-<stamp>, where it is.
rem     The next launch is a first launch: PhotoSafe warning, the Simple or
rem     Everything choice, the first-run hint, the first-open question in
rem     Presets, no presets of yours, default brushes, a new empty vault.
rem
rem   A test is running  ->  U  put your data back, exactly as it was
rem                          A  start the first-time experience again
rem     Either way the test session's folders move to
rem     <backup root>\first-user-tests\<stamp>\ and presets saved during
rem     the test are bundled there for Import. Nothing is deleted.
rem
rem  USAGE   first-user-reset.bat            asks what to do
rem          first-user-reset.bat /start     start a test, or start over
rem          first-user-reset.bat /undo      put your data back
rem          first-user-reset.bat /status    show the mode, change nothing
rem          add /nobackup to skip the backup, /nopause to not wait for a key
rem
rem  ROOT    Z:\New folder\FluidUI-Preset-Backups  (or FLUIDUI_BACKUP_ROOT)
rem  Needs node on PATH and local-data-helper.js next to this script.
rem  The web app: an Incognito or InPrivate window is a first-time visitor.
rem  FLUIDUI_APPDATA and FLUIDUI_DOCS override %APPDATA% and Documents.
rem ===================================================================

set "ROOT=%FLUIDUI_BACKUP_ROOT%"
if not defined ROOT set "ROOT=Z:\New folder\FluidUI-Preset-Backups"
set "APPROOT=%FLUIDUI_APPDATA%"
if not defined APPROOT set "APPROOT=%APPDATA%"
set "DOCS=%FLUIDUI_DOCS%"
if not defined DOCS for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%D"
set "HERE=%~dp0"
set "HELPER=%HERE%local-data-helper.js"

set "ACTION="
set "NOBACKUP="
set "NOPAUSE="
set "BADARG="
:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="/start" (set "ACTION=start") else if /i "%~1"=="/undo" (set "ACTION=undo") else if /i "%~1"=="/status" (set "ACTION=status") else if /i "%~1"=="/nobackup" (set "NOBACKUP=1") else if /i "%~1"=="/nopause" (set "NOPAUSE=1") else (set "BADARG=%~1")
shift /1
goto :args
:argsdone

set "CODE=0"
echo.
echo  Swirl Together first-time-user test
echo  -----------------------------------
if defined BADARG (
    echo  Unknown option: !BADARG!
    echo  Usage: first-user-reset.bat [/start ^| /undo ^| /status] [/nobackup] [/nopause]
    goto :fail
)
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: node was not found on PATH.
    goto :fail
)
if not exist "%HELPER%" (
    echo  ERROR: missing %HELPER%
    goto :fail
)

rem -- Which mode are we in? --
set "MODE="
set "SINCE="
for /f "tokens=2,3" %%a in ('node "%HELPER%" firstuser status "%APPROOT%" "%DOCS%" ^| findstr /b "MODE"') do (
    set "MODE=%%a"
    set "SINCE=%%b"
)
if not defined MODE (
    echo  ERROR: could not read the current state.
    goto :fail
)
if "%ACTION%"=="status" (
    node "%HELPER%" firstuser status "%APPROOT%" "%DOCS%" | findstr /v /b "MODE"
    goto :finish
)
if /i "%MODE%"=="MIXED" (
    node "%HELPER%" firstuser status "%APPROOT%" "%DOCS%" | findstr /v /b "MODE"
    goto :fail
)

rem -- The app must be closed --
set "LOCKED="
for %%P in ("fluid-ui-multiplayer" "Swirl Together" "Swirl Together Demo" "Swirl Together Playtest") do (
    if exist "%APPROOT%\%%~P\Local Storage\leveldb\LOCK" (
        copy /y "%APPROOT%\%%~P\Local Storage\leveldb\LOCK" nul >nul 2>&1
        if errorlevel 1 (
            echo  IN USE: %APPROOT%\%%~P
            set "LOCKED=1"
        )
    )
)
if defined LOCKED (
    echo.
    echo  ERROR: Swirl Together is running. Close it and run this again.
    echo  Nothing was changed.
    goto :fail
)

rem -- No option given: show the state and ask --
if not defined ACTION (
    node "%HELPER%" firstuser status "%APPROOT%" "%DOCS%" | findstr /v /b "MODE"
    echo.
    if /i "%MODE%"=="NORMAL" (
        echo  Start a first-user test? Your data is backed up and set aside, so the
        echo  next launch of the app is exactly what a brand-new user sees.
        echo  Run this again afterwards to put your data back.
        echo.
        set "ANSWER="
        set /p "ANSWER=  Type YES to start: "
        if /i "!ANSWER!"=="YES" (
            set "ACTION=start"
        ) else (
            echo  Cancelled. Nothing was changed.
            goto :finish
        )
    ) else (
        echo    U  put your data back, exactly as it was
        echo    A  start the first-time experience again
        echo    Q  quit, change nothing
        echo.
        set "ANSWER="
        set /p "ANSWER=  Your choice: "
        if /i "!ANSWER!"=="U" set "ACTION=undo"
        if /i "!ANSWER!"=="A" set "ACTION=start"
        if not defined ACTION (
            echo  Nothing was changed.
            goto :finish
        )
    )
    echo.
)

if "%ACTION%"=="undo" goto :undo
if /i "%MODE%"=="FIRSTUSER" goto :again

rem -- Start: back up, then set aside --
if defined NOBACKUP (
    echo  [1/2] backup skipped
) else (
    echo  [1/2] backing up your data
    call "%HERE%backup-local-data.bat" before-first-user-reset /nopause
    if errorlevel 1 (
        echo  ERROR: the backup failed, so nothing was set aside.
        goto :fail
    )
)
echo  [2/2] setting your data aside
node "%HELPER%" firstuser setaside "%APPROOT%" "%DOCS%"
if errorlevel 1 goto :fail
echo.
echo  READY. Launch Swirl Together now: it starts like a brand-new install.
echo  When you are done, close it and run this again to put your data back.
goto :finish

:again
echo  Starting the first-time experience over. Your own data stays set aside.
node "%HELPER%" firstuser again "%APPROOT%" "%DOCS%" "%ROOT%"
if errorlevel 1 goto :fail
echo.
echo  READY. Launch Swirl Together now: it starts like a brand-new install again.
echo  When you are done, close it and run this again to put your data back.
goto :finish

:undo
if /i "%MODE%"=="NORMAL" (
    echo  No first-user test is running: your own data is already live.
    goto :finish
)
echo  Putting your data back.
node "%HELPER%" firstuser undo "%APPROOT%" "%DOCS%" "%ROOT%"
if errorlevel 1 goto :fail
echo.
echo  DONE. Your own data is back. Launch Swirl Together as usual.
goto :finish

:fail
set "CODE=1"
:finish
echo.
if defined NOPAUSE exit /b %CODE%
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b %CODE%
