@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem ===================================================================
rem  backup-local-data.bat  --  Swirl Together / Fluid-UI
rem  Back up the desktop app's local data into a new dated folder.
rem
rem  WHAT IT COPIES (byte for byte; every file is then SHA256-compared
rem  with its source and the hashes are written to SHA256SUMS.txt):
rem
rem   1. Each app profile's localStorage store, which is where user
rem      presets, brush presets, brush shapes, palettes, hotkeys and
rem      settings live:
rem          %APPDATA%\<profile>\Local Storage\leveldb\
rem      plus that profile's photo-safe.json (the PhotoSafe ack mirror).
rem      Profiles looked for: fluid-ui-multiplayer (npm start / dev),
rem      Swirl Together, Swirl Together Demo, Swirl Together Playtest.
rem      Ones that do not exist are skipped.
rem
rem   2. The Preset Vault on disk: one <name>.fluidpreset per preset,
rem      the brush-library.json sidecar, .history\ and .trash\:
rem          <Documents>\<Title>\Presets
rem      for Title = Swirl Together, A Small Good Thing, Fluid Simulation
rem      (the app's current and two former names, js/12b-preset-vault.js).
rem      <Documents> is the Windows Documents folder; on this PC that is
rem      under OneDrive. Missing ones are skipped.
rem
rem   3. One portable fluid-presets-<Title>-ALL.fluidpresets per vault,
rem      for Settings > Saved Presets > Import in the desktop OR web app.
rem
rem  OUTPUT   <root>\<yyyy-MM-dd-HHmmss>[-label]\   (a new folder each run)
rem  ROOT     Z:\New folder\FluidUI-Preset-Backups
rem           (override: set FLUIDUI_BACKUP_ROOT=<dir> before running)
rem
rem  USAGE    backup-local-data.bat [label] [/nopause] [/allow-empty]
rem           backup-local-data.bat pre-first-user-test
rem
rem  Needs node on PATH (verification + bundle) and the helper file
rem  local-data-helper.js next to this script.
rem  The app must be CLOSED: the script refuses to run while any profile's
rem  LevelDB LOCK file is held. The sources are never modified.
rem  Undo / restore: restore-local-data.bat in this folder.
rem
rem  For tests or another PC, FLUIDUI_APPDATA and FLUIDUI_DOCS override
rem  the %APPDATA% and Documents roots the sources are looked up in.
rem ===================================================================

set "ROOT=%FLUIDUI_BACKUP_ROOT%"
if not defined ROOT set "ROOT=Z:\New folder\FluidUI-Preset-Backups"
set "APPROOT=%FLUIDUI_APPDATA%"
if not defined APPROOT set "APPROOT=%APPDATA%"
set "DOCS=%FLUIDUI_DOCS%"
if not defined DOCS for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%D"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmmss"`) do set "STAMP=%%T"
set "HERE=%~dp0"
set "HELPER=%HERE%local-data-helper.js"

set "LABEL="
set "NOPAUSE="
set "ALLOWEMPTY="
:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="/nopause" (set "NOPAUSE=1") else if /i "%~1"=="/allow-empty" (set "ALLOWEMPTY=1") else if not defined LABEL (set "LABEL=%~1")
shift /1
goto :args
:argsdone
if defined LABEL set "LABEL=%LABEL: =-%"

set "DEST=%ROOT%\%STAMP%"
if defined LABEL set "DEST=%DEST%-%LABEL%"
set "LOG=%DEST%\_backup.log"
set "SUMS=%DEST%\SHA256SUMS.txt"
set "MANIFEST=%DEST%\MANIFEST.txt"
set "CREATED="
set "FAILED="
set "CODE=0"
set /a OKFILES=0, BADFILES=0, SECTIONS=0

echo.
echo  Swirl Together local-data backup
echo  --------------------------------
echo  into  %DEST%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: node was not found on PATH. It is needed to verify the copy.
    goto :fail
)
if not exist "%HELPER%" (
    echo  ERROR: missing %HELPER%
    goto :fail
)

rem -- 1. Refuse to run while the app is open: it holds each profile's LOCK --
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
    echo  ERROR: Swirl Together is running. Close it ^(every edition^) and run this again.
    echo  Nothing was written.
    goto :fail
)

rem -- A first-user test sets your own data aside: say so --
set "FUMODE="
for /f "tokens=2" %%a in ('node "%HELPER%" firstuser status "%APPROOT%" "%DOCS%" ^| findstr /b "MODE"') do set "FUMODE=%%a"
if /i "%FUMODE%"=="FIRSTUSER" (
    echo  NOTE: a first-user test is running. Your own data is set aside and is NOT
    echo  in this backup: this backup holds the test session. To back up your own
    echo  data, run first-user-reset.bat and choose U first.
    echo.
)

rem -- 2. Create the destination; never reuse an existing folder --
if exist "%DEST%\" (
    echo  ERROR: %DEST% already exists. Run again.
    goto :fail
)
mkdir "%DEST%" 2>nul
if not exist "%DEST%\" (
    echo  ERROR: cannot create %DEST%  -- is that drive connected?
    goto :fail
)
set "CREATED=1"
type nul > "%SUMS%"
> "%MANIFEST%" echo Swirl Together / Fluid-UI local-data backup
>>"%MANIFEST%" echo Taken %STAMP% on %COMPUTERNAME% (user %USERNAME%) by backup-local-data.bat
>>"%MANIFEST%" echo Profiles root: %APPROOT%
>>"%MANIFEST%" echo Documents:     %DOCS%
if /i "%FUMODE%"=="FIRSTUSER" (>>"%MANIFEST%" echo NOTE: taken DURING a first-user test. This is the test session, not your own data.)
>>"%MANIFEST%" echo.

rem -- 3. Profiles: the localStorage store + photo-safe.json --
for %%P in ("fluid-ui-multiplayer" "Swirl Together" "Swirl Together Demo" "Swirl Together Playtest") do (
    if exist "%APPROOT%\%%~P\Local Storage\leveldb\" (
        echo  profile  %%~P
        call :copyTree "%APPROOT%\%%~P\Local Storage\leveldb" "%DEST%\profile-%%~P\Local Storage\leveldb" "localStorage of profile %%~P (presets, brushes, settings)"
        if exist "%APPROOT%\%%~P\photo-safe.json" (
            copy /y "%APPROOT%\%%~P\photo-safe.json" "%DEST%\profile-%%~P\photo-safe.json" >nul
            call :verify "%APPROOT%\%%~P\photo-safe.json" "%DEST%\profile-%%~P\photo-safe.json"
            >>"%MANIFEST%" echo     + photo-safe.json
        )
    ) else (
        echo  profile  %%~P  -- not on this PC, skipped
    )
)

rem -- 4. Vaults, each followed by its one-file Import bundle --
for %%V in ("Swirl Together" "A Small Good Thing" "Fluid Simulation") do (
    if exist "%DOCS%\%%~V\Presets\" (
        echo  vault    %%~V\Presets
        call :copyTree "%DOCS%\%%~V\Presets" "%DEST%\vault-%%~V" "Preset Vault (one .fluidpreset per preset, brush-library.json, .history, .trash)"
        call :bundle "%DEST%\vault-%%~V" "%DEST%\fluid-presets-%%~V-ALL.fluidpresets"
    ) else (
        echo  vault    %%~V\Presets  -- not on this PC, skipped
    )
)

rem -- 5. Result --
echo.
if %SECTIONS%==0 if not defined ALLOWEMPTY (
    echo  ERROR: nothing found to back up -- no profile and no vault. Wrong PC or paths?
    set "FAILED=1"
)
>>"%MANIFEST%" echo.
>>"%MANIFEST%" echo Verified byte-for-byte against the sources: %OKFILES% files ok, %BADFILES% wrong or missing.
if defined FAILED (
    >>"%MANIFEST%" echo RESULT: FAILED -- do not trust this folder. See _backup.log.
    echo  FAILED: %OKFILES% files ok, %BADFILES% wrong or missing. See %LOG%
    goto :fail
)
>>"%MANIFEST%" echo RESULT: OK
>>"%MANIFEST%" echo.
>>"%MANIFEST%" echo RESTORE (app closed):  restore-local-data.bat "%DEST%"
>>"%MANIFEST%" echo By hand: see README-HOW-TO-RESTORE.txt in the backup root.
echo  OK: %OKFILES% files copied and verified in %SECTIONS% sections.
echo  Backup: %DEST%
goto :finish

rem ---- copyTree <src> <dst> <description> ---------------------------------
:copyTree
set "SRC=%~1"
set "DST=%~2"
set /a SECTIONS+=1
>>"%LOG%" echo.
>>"%LOG%" echo ===== %~3
>>"%LOG%" echo ===== %SRC%  to  %DST%
robocopy "%SRC%" "%DST%" /E /COPY:DAT /DCOPY:T /R:3 /W:2 /NP /NDL /NJH >>"%LOG%" 2>&1
set "RC=%errorlevel%"
if %RC% geq 8 (
    echo           ROBOCOPY FAILED ^(exit code %RC%^) -- see _backup.log
    set "FAILED=1"
)
call :verify "%SRC%" "%DST%"
for /f "tokens=1,3" %%a in ('dir /s /a-d "%DST%" ^| find " File(s)"') do (set "NF=%%a" & set "NB=%%b")
>>"%MANIFEST%" echo %~3
>>"%MANIFEST%" echo     from  %SRC%
>>"%MANIFEST%" echo     to    !DST:%DEST%\=!   (%NF% files, %NB% bytes)
exit /b

rem ---- verify <src> <dst>: SHA256 every file of <dst> against <src> --------
:verify
set "VERIFIED="
for /f "tokens=2,3,4" %%a in ('node "%HELPER%" verify "%~1" "%~2" "%SUMS%" "%DEST%" ^| findstr /b "VERIFY"') do (
    set /a OKFILES+=%%a
    set /a BADFILES+=%%b+%%c
    set "VERIFIED=1"
    if not "%%b%%c"=="00" set "FAILED=1"
)
if not defined VERIFIED (
    echo           VERIFICATION DID NOT RUN for %~2
    set "FAILED=1"
)
exit /b

rem ---- bundle <vault copy> <out.fluidpresets> ------------------------------
:bundle
node "%HELPER%" bundle "%~1" "%~2" >>"%LOG%" 2>&1
if errorlevel 1 (
    echo           bundle not written ^(see _backup.log^) -- the vault copy itself is fine
    >>"%MANIFEST%" echo     NOTE: no Import bundle ^(see _backup.log^)
    exit /b
)
node "%HELPER%" sum "%~2" "%SUMS%" "%DEST%"
for /f "delims=" %%L in ('findstr /c:"  bundle:" "%LOG%"') do set "BUNDLELINE=%%L"
echo         %BUNDLELINE%
>>"%MANIFEST%" echo     %~nx2
>>"%MANIFEST%" echo       %BUNDLELINE%
>>"%MANIFEST%" echo         Settings ^> Saved Presets ^> Import, desktop or web app.
exit /b

:fail
set "CODE=1"
if defined CREATED (
    > "%DEST%\_FAILED.txt" echo This backup did NOT complete or did not verify. Do not restore from it. See _backup.log.
    echo  Marked with %DEST%\_FAILED.txt
)
:finish
echo.
if defined NOPAUSE exit /b %CODE%
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b %CODE%
