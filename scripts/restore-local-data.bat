@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem ===================================================================
rem  restore-local-data.bat  --  Swirl Together / Fluid-UI
rem  Put a backup made by backup-local-data.bat back into place.
rem
rem  USAGE   restore-local-data.bat <backup-folder> [/yes] [/nopause]
rem          <backup-folder> is its full path, or just its name under the
rem          backup root (Z:\New folder\FluidUI-Preset-Backups, or
rem          FLUIDUI_BACKUP_ROOT).
rem
rem  WHAT IT DOES, in order
rem   0. Refuses to run while the app is open (a LevelDB LOCK is held) or
rem      during a first-user test, and refuses a backup folder that is marked
rem      _FAILED.txt or whose MANIFEST.txt lacks "RESULT: OK" (unfinished).
rem   1. Snapshots the CURRENT live data first with backup-local-data.bat
rem      (label "before-restore"), so a restore can itself be undone.
rem   2. For every profile-<name>\ in the backup: mirrors its
rem      Local Storage\leveldb\ over %APPDATA%\<name>\Local Storage\leveldb\
rem      (files not in the backup are removed: a LevelDB store must be put
rem      back whole) and puts photo-safe.json back, or removes the live one
rem      when the backup has none.
rem   3. For every vault-<Title>\ in the backup: mirrors it over
rem      <Documents>\<Title>\Presets\ (extras removed, same reason: at
rem      launch the app treats the vault as the source of truth).
rem   4. The app adopts the FIRST existing vault among Swirl Together,
rem      A Small Good Thing, Fluid Simulation (in that order). A vault
rem      earlier in that order than the one restored, present live but not
rem      in the backup (typically created by a fresh-user test run), is
rem      renamed to Presets.set-aside-<stamp> so it cannot shadow the
rem      restored one. Nothing is ever deleted.
rem   5. Verifies every restored file against the backup (SHA256).
rem
rem  Needs node on PATH and the helper next to this script. FLUIDUI_APPDATA
rem  and FLUIDUI_DOCS override the live roots (tests / another PC).
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

set "BK="
set "YES="
set "NOPAUSE="
:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="/yes" (set "YES=1") else if /i "%~1"=="/nopause" (set "NOPAUSE=1") else if not defined BK (set "BK=%~1")
shift /1
goto :args
:argsdone

set "CODE=0"
set "FAILED="
set /a OKFILES=0, BADFILES=0, SECTIONS=0

echo.
echo  Swirl Together local-data RESTORE
echo  ---------------------------------
if not defined BK (
    echo  Usage: restore-local-data.bat ^<backup-folder^> [/yes] [/nopause]
    goto :fail
)
if "%BK:~-1%"=="\" set "BK=%BK:~0,-1%"
if not exist "%BK%\" if exist "%ROOT%\%BK%\" set "BK=%ROOT%\%BK%"
if not exist "%BK%\" (
    echo  ERROR: backup folder not found: %BK%
    goto :fail
)
if exist "%BK%\_FAILED.txt" (
    echo  ERROR: %BK% is marked _FAILED.txt -- that backup did not verify. Pick another.
    goto :fail
)
findstr /b /c:"RESULT: OK" "%BK%\MANIFEST.txt" >nul 2>&1
if errorlevel 1 (
    echo  ERROR: %BK% has no RESULT: OK line in its MANIFEST.txt, so that backup
    echo  never finished or did not verify. Pick another.
    goto :fail
)
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: node was not found on PATH. It is needed to verify the restore.
    goto :fail
)
if not exist "%HELPER%" (
    echo  ERROR: missing %HELPER%
    goto :fail
)

rem -- 0. The app must be closed --
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
    echo  Nothing was changed.
    goto :fail
)

rem -- Not during a first-user test: first-user-reset.bat puts that data back --
set "FUMODE="
set "FUBLOCK="
for /f "tokens=2" %%a in ('node "%HELPER%" firstuser status "%APPROOT%" "%DOCS%" ^| findstr /b "MODE"') do set "FUMODE=%%a"
if /i "%FUMODE%"=="FIRSTUSER" set "FUBLOCK=1"
if /i "%FUMODE%"=="MIXED" set "FUBLOCK=1"
if defined FUBLOCK (
    echo  ERROR: a first-user test is running, so your own data is set aside.
    echo  Run first-user-reset.bat and choose U to put it back first.
    echo  Nothing was changed.
    goto :fail
)

rem -- Show the plan and ask --
echo  from  %BK%
echo.
set "PLAN="
for /d %%P in ("%BK%\profile-*") do (
    set "PN=%%~nxP"
    set "PN=!PN:profile-=!"
    echo  profile  !PN!   -^>  %APPROOT%\!PN!\Local Storage\leveldb  ^(+ photo-safe.json^)
    set "PLAN=1"
)
for /d %%V in ("%BK%\vault-*") do (
    set "VN=%%~nxV"
    set "VN=!VN:vault-=!"
    echo  vault    !VN!   -^>  %DOCS%\!VN!\Presets
    set "PLAN=1"
)
if not defined PLAN (
    echo  ERROR: %BK% holds no profile-* or vault-* folder. Not a backup-local-data.bat backup?
    goto :fail
)
echo.
echo  The live folders above will be REPLACED by the backup's contents ^(extra
echo  files removed^). The current live data is snapshotted first, into
echo  %ROOT%\%STAMP%-before-restore
if not defined YES (
    set "ANSWER="
    set /p "ANSWER=  Type YES to continue: "
    if /i not "!ANSWER!"=="YES" (
        echo  Cancelled. Nothing was changed.
        goto :finish
    )
)

rem -- 1. Snapshot the current state first --
echo.
echo  [1/3] snapshot of the current live data
call "%HERE%backup-local-data.bat" before-restore /nopause /allow-empty
if errorlevel 1 (
    echo  ERROR: the safety snapshot failed, so nothing was restored.
    goto :fail
)

rem -- 2. Profiles --
echo  [2/3] restoring
for /d %%P in ("%BK%\profile-*") do (
    set "PN=%%~nxP"
    set "PN=!PN:profile-=!"
    if exist "%%P\Local Storage\leveldb\" (
        echo  profile  !PN!
        call :mirror "%%P\Local Storage\leveldb" "%APPROOT%\!PN!\Local Storage\leveldb"
    )
    if exist "%%P\photo-safe.json" (
        copy /y "%%P\photo-safe.json" "%APPROOT%\!PN!\photo-safe.json" >nul
        call :verify "%%P\photo-safe.json" "%APPROOT%\!PN!\photo-safe.json"
    ) else (
        if exist "%APPROOT%\!PN!\photo-safe.json" del /q "%APPROOT%\!PN!\photo-safe.json"
    )
)

rem -- 3. Vaults --
for /d %%V in ("%BK%\vault-*") do (
    set "VN=%%~nxV"
    set "VN=!VN:vault-=!"
    echo  vault    !VN!\Presets
    call :mirror "%%V" "%DOCS%\!VN!\Presets"
)

rem -- 4. Set aside any vault the app would prefer over the restored one --
set "SEEN="
for %%V in ("Swirl Together" "A Small Good Thing" "Fluid Simulation") do (
    if exist "%BK%\vault-%%~V\" (
        set "SEEN=1"
    ) else if not defined SEEN (
        if exist "%DOCS%\%%~V\Presets\" (
            ren "%DOCS%\%%~V\Presets" "Presets.set-aside-%STAMP%"
            if errorlevel 1 (
                echo  ERROR: could not rename %DOCS%\%%~V\Presets -- the app would use it instead of the restored vault
                set "FAILED=1"
            ) else (
                echo  set aside %DOCS%\%%~V\Presets  -^>  Presets.set-aside-%STAMP%
            )
        )
    )
)

rem -- 5. Result --
echo  [3/3] verified
echo.
if defined FAILED (
    echo  FAILED: %OKFILES% files ok, %BADFILES% wrong or missing. The pre-restore snapshot is in
    echo  %ROOT%\%STAMP%-before-restore  ^(restore that to go back^).
    goto :fail
)
echo  OK: %OKFILES% files restored and verified in %SECTIONS% sections.
echo  Launch the app; it will pick the vault up itself.
goto :finish

rem ---- mirror <backup subtree> <live folder> --------------------------------
:mirror
set /a SECTIONS+=1
robocopy "%~1" "%~2" /MIR /COPY:DAT /DCOPY:T /R:3 /W:2 /NP /NDL /NJH /NJS /NFL >nul 2>&1
set "RC=%errorlevel%"
if %RC% geq 8 (
    echo           ROBOCOPY FAILED ^(exit code %RC%^)
    set "FAILED=1"
)
call :verify "%~1" "%~2"
exit /b

rem ---- verify <backup> <live>: SHA256 every live file against the backup ---
:verify
set "VERIFIED="
for /f "tokens=2,3,4" %%a in ('node "%HELPER%" verify "%~1" "%~2" - "%BK%" ^| findstr /b "VERIFY"') do (
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

:fail
set "CODE=1"
:finish
echo.
if defined NOPAUSE exit /b %CODE%
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b %CODE%
