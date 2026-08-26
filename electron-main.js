// Electron Main Process
const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Dev affordances (F5 reload, cache clears, nuclear reset) only exist outside
// packaged builds, or when explicitly asked for with --dev.
const isDev = !app.isPackaged || process.argv.includes('--dev');

// ── Fatal errors in THIS process ───────────────────────────────────────────
// Registered before anything else in this file can throw, because both of
// Electron's defaults are wrong for a shipped app (measured, Electron 39):
//
//   • uncaughtException → the raw "A JavaScript error occurred in the main
//     process" box with a stack trace in it, and then the process KEEPS
//     RUNNING. Module-scope code after the throw never runs either, so a
//     failure up here means app.whenReady() below is never even registered:
//     no window is ever created, and nothing ever closes.
//
//   • unhandledRejection → nothing at all. Electron runs Node in the legacy
//     'warn' mode, so a throw inside app.whenReady().then(createWindow)
//     prints to a stderr that a packaged Windows GUI build does not have.
//     That process still holds the single-instance lock, so every relaunch
//     loses the race below and quietly quits itself — Steam says "Running",
//     double-clicking does nothing, and only Task Manager can recover it.
//
// So: the process must never be left invisible-but-alive. Say what happened,
// write it down where a user can find it, and end.
//
// The one thing worse than a bad error dialog is one that throws away a
// painting nobody saved. A main-process fault with a healthy window is
// usually inconsequential to the canvas (the renderer holds all of it), so
// that case reports into the app's own error card (index.html) and lets the
// user keep working. Only a fault with NO window standing is fatal — which is
// exactly the unrecoverable case above.
let fatalHandled = false;

// stdout/stderr can be a pipe whose reader goes away before this process does
// — a launcher that exits, a wrapper shell, `| head`. Node then raises EPIPE
// out of `console.log`, i.e. out of whatever happened to be logging at the
// time. Observed here: the boot fade's completion log threw EPIPE from inside
// applyFadeAlpha. That is plumbing, not a fault in the app, and before any of
// this existed it would have raised Electron's raw error box. Swallow it at
// the stream (handleFault below also refuses to surface it, belt and braces).
try { process.stdout.on('error', () => {}); } catch (_) {}
try { process.stderr.on('error', () => {}); } catch (_) {}

function crashLogPath() {
    try { return path.join(app.getPath('userData'), 'crash.log'); }
    catch (_) { return path.join(require('os').tmpdir(), 'swirl-together-crash.log'); }
}

function writeCrashLog(kind, err) {
    const p = crashLogPath();
    try {
        // One generation, capped. A crash LOOP must not grow an unbounded
        // file in someone's AppData.
        try { if (fs.statSync(p).size > 128 * 1024) fs.renameSync(p, p.replace(/\.log$/, '-prev.log')); } catch (_) {}
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.appendFileSync(p, [
            '',
            '=== ' + new Date().toISOString() + ' — ' + kind + ' ===',
            'v' + app.getVersion() + (isDev ? ' (dev)' : '') +
                ' · electron ' + process.versions.electron +
                ' · ' + process.platform + ' ' + process.arch,
            (err && err.stack) ? err.stack : String(err),
        ].join('\n') + '\n');
    } catch (_) {}
    return p;
}

// mainWindow is a `let` declared further down, so a fault raised before this
// module finishes evaluating would hit its temporal dead zone — and `typeof`
// does not save you from a TDZ. Hence the try.
function liveWindow() {
    try { return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null; }
    catch (_) { return null; }
}

// "Is there anything worth keeping?" — deliberately NOT just "does a window
// object exist". A window that has been constructed but never revealed (a
// fault between `new BrowserWindow` and the first frame) has no painting in
// it and no renderer able to show a card, so treating it as alive would put
// the invisible-zombie process straight back. bootRevealed is the moment the
// window actually reached the user, and it is re-cleared for every restart.
function appIsUp() {
    try { return !!(bootRevealed && liveWindow()); }
    catch (_) { return false; }   // TDZ, as above
}

function fatalError(kind, err) {
    if (fatalHandled) return;   // a crash loop must not stack dialogs
    fatalHandled = true;
    console.error('[fatal]', kind, (err && err.stack) ? err.stack : err);
    const logPath = writeCrashLog(kind, err);

    // A missing module or an unloadable native library is almost never a code
    // bug in a shipped build — it is a half-downloaded depot or an antivirus
    // quarantine. That has a one-click user fix, so say which one.
    const code = err && err.code;
    const damaged = code === 'MODULE_NOT_FOUND' || code === 'ERR_DLOPEN_FAILED' || code === 'ENOENT';
    const message = damaged
        ? 'Swirl Together is missing some of its files.'
        : 'Swirl Together hit an unexpected error and has to close.';
    const guidance = damaged
        ? 'This usually means the install is incomplete or damaged — an interrupted download, or an antivirus that quarantined a file.\n\n' +
          'On Steam: right-click Swirl Together → Properties → Installed Files → Verify integrity of game files.\n' +
          'Elsewhere: reinstalling fixes it.'
        : 'Your presets, brushes and settings are stored separately and are safe.\n\n' +
          'If this keeps happening, updating your graphics drivers is the usual fix.';
    const first = String((err && err.stack) || err || '').split('\n').slice(0, 3).join('\n');
    const detail = guidance + '\n\n' + first + '\n\nWritten to:\n' + logPath;

    const present = () => {
        // Parent the box ONLY to a window that is actually on screen. An
        // unparented dialog can land behind this frameless maximized window
        // (the reason every in-app confirmation moved to the renderer), and
        // parenting to the invisible boot window is the mirror of that
        // problem — a modal attached to something with no pixels.
        const w = liveWindow();
        const parent = (w && w.isVisible()) ? w : null;
        const opts = {
            type: 'error',
            buttons: ['Restart', 'Show log', 'Quit'],
            defaultId: 0,
            cancelId: 2,
            noLink: true,
            title: 'Swirl Together',
            message: message,
            detail: detail,
        };
        let choice = 2;
        try { choice = parent ? dialog.showMessageBoxSync(parent, opts) : dialog.showMessageBoxSync(opts); }
        catch (_) { /* no GUI to ask with — fall through and end cleanly */ }

        if (choice === 1) {
            try { shell.showItemInFolder(logPath); } catch (_) {}
            // Explorer is launched asynchronously; exiting instantly races it.
            setTimeout(() => app.exit(1), 600);
            return;
        }
        if (choice === 0) { try { app.relaunch(); } catch (_) {} }
        // exit(), not quit(): quit() runs before-quit and the window close
        // handlers, and this process is by definition in an unknown state.
        // exit() is unconditional, which is the whole point of being here.
        app.exit(choice === 0 ? 0 : 1);
    };

    if (app.isReady()) { present(); return; }
    // Pre-ready — the damaged-install case throws at require time. The ready
    // event still arrives (the throw does not cancel it), so wait briefly for
    // the real dialog and fall back to the primitive box if it never comes.
    let shown = false;
    const fallback = setTimeout(() => {
        if (shown) return;
        shown = true;
        try { dialog.showErrorBox('Swirl Together', message + '\n\n' + detail); } catch (_) {}
        app.exit(1);
    }, 3000);
    app.whenReady().then(() => {
        if (shown) return;
        shown = true;
        clearTimeout(fallback);
        present();
    });
}

// Non-fatal path: the app is up, so keep it up. The renderer already owns a
// good error surface (dismissable card, version + GPU, "Copy report") — reuse
// it rather than growing a second one over here.
let lastNonFatal = { key: '', at: 0 };

function reportNonFatal(kind, err) {
    const msg = String((err && err.message) || err);
    // Not everything up here is called once. The boot fade takes an IPC step
    // per rendered frame, so a fault on a path like that arrives ~50 times in
    // under a second — the renderer's card dedupes, but the log would not.
    const now = Date.now();
    if (lastNonFatal.key === kind + '|' + msg && now - lastNonFatal.at < 5000) return;
    lastNonFatal = { key: kind + '|' + msg, at: now };

    const logPath = writeCrashLog(kind + ' (non-fatal — window is up)', err);
    console.error('[main]', kind, (err && err.stack) ? err.stack : err);
    const w = liveWindow();
    if (!w) return;
    try {
        w.webContents.send('main-error', {
            message: msg,
            detail: String((err && err.stack) || '') + '\n\n' + logPath,
        });
    } catch (_) {}
}

// Throwing from inside an uncaughtException handler is itself unrecoverable —
// Node aborts the process on the spot. Everything below is already defensive,
// but this is the one place where "already defensive" is not good enough.
function handleFault(kind, err) {
    // See the stdout note above: a dead pipe is not something to tell anyone
    // about, and logging it here is how you get a second EPIPE.
    const c = err && err.code;
    if (c === 'EPIPE' || c === 'EBADF' || c === 'ERR_STREAM_DESTROYED') return;
    try {
        if (appIsUp()) reportNonFatal(kind, err);
        else fatalError(kind, err);
    } catch (e) {
        try { console.error('[fatal] error handler failed', e); } catch (_) {}
        app.exit(1);
    }
}

process.on('uncaughtException', (err) => handleFault('uncaughtException', err));
process.on('unhandledRejection', (reason) => {
    handleFault('unhandledRejection', (reason instanceof Error) ? reason : new Error(String(reason)));
});

// ── Steamworks (Steam plan S5-1) ───────────────────────────────────────────
// App ID for "Swirl Together" (Steamworks app created 2026-08-06).
// Dev testing: drop a steam_appid.txt next to package.json (gitignored and
// excluded from the depot) and init() reads it with no argument.
const STEAM_APP_ID = 5068940;
let steamClient = null;
try {
    const hasDevAppId = require('fs').existsSync(path.join(__dirname, 'steam_appid.txt'));
    if (STEAM_APP_ID || hasDevAppId) {
        const steamworks = require('steamworks.js');
        steamClient = STEAM_APP_ID ? steamworks.init(STEAM_APP_ID) : steamworks.init();
        console.log('[Steam] initialized as', steamClient.localplayer.getName());
    } else {
        console.log('[Steam] no App ID configured — running without Steamworks');
    }
} catch (e) {
    // Steam not running / app not owned / dll missing — the app must stay
    // fully functional DRM-free (this same artifact ships to itch and web).
    console.log('[Steam] init failed — running DRM-free:', e.message);
}
// Deliberately NOT called:
// - restartAppIfNecessary(): the identical win-unpacked folder ships to
//   itch — a courtesy relaunch into Steam would break itch copies.
//   Ownership enforcement is none by design (the web version is free).
// - electronEnableSteamOverlay(): needs in-process-gpu (+ disable-direct-
//   composition) — a GPU/driver crash then kills the whole app instead of
//   a recoverable lost context (this app has context-loss history), and
//   Electron ≥35 has an unfixed overlay regression (electron#47662).
//   v1 ships without overlay; revisit as an experimental second launch
//   option post-launch (see the Steam plan, S5-2).

// Enable remote module
require('@electron/remote/main').initialize();

// ⚡ PERFORMANCE BOOST: Enable all GPU acceleration
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas'); // Hardware-accelerated 2D canvas
app.commandLine.appendSwitch('enable-gpu-memory-buffer-compositor-resources'); // Faster compositing
// REMOVED 2026-07-09: disable-gpu-vsync + disable-frame-rate-limit.
// These were pinning a 144Hz panel to EXACTLY 60fps: with GPU vsync
// disabled, Chromium's frame scheduler stops following the display and
// falls back to a software timer whose default interval is 1/60s — the
// "uncap" flags WERE the cap (measured: rAF gap median 16.7ms dead-on
// while Windows reported 144Hz). Without them, modern Chromium (Electron
// 39) drives rAF at the display's real refresh rate; the in-app FPS Limit
// select still caps below that when wanted.
// REMOVED 2026-07-28 (Steam prep): enable-webgl2-compute-context (flag no
// longer exists in modern Chromium), disable-software-rasterizer +
// disable-gpu-driver-bug-workarounds + ignore-gpu-blocklist (on the hardware
// spread Steam implies, these turn "slow but working" into a black screen —
// known-bad drivers lose their only fallback path), and VaapiVideoDecoder
// (Linux-only, a no-op on Windows).

// ⚡ NUCLEAR: Force disable ALL frame limiting
app.commandLine.appendSwitch('max-gum-fps', '1000'); // Remove media FPS cap
app.commandLine.appendSwitch('disable-renderer-backgrounding'); // Keep rendering at full speed
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); // No throttling when covered
// NOTE: Do NOT use --use-angle=gl on Windows — OpenGL backend locks vsync to 60Hz.
// Default D3D11 backend handles high-refresh monitors correctly.

// ⚡ Memory and Performance Flags
app.commandLine.appendSwitch('max-old-space-size', '4096'); // 4GB heap
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-semi-space-size=128'); // Manual GC + larger young gen

// On dual-GPU machines Chromium can land on the integrated GPU (observed:
// UHD 770 pegged at 100% while the GeForce idles). Ask for the discrete
// adapter explicitly; the canvas already requests powerPreference
// 'high-performance', but the process-level hint is what Windows honors.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization'); // Out-of-process rasterization

console.log('🚀 Electron performance flags applied');
console.log('   - GPU VSync: display-native (flags removed — they pinned 60Hz, see above)');
console.log('   - GPU blocklist/workarounds: default (fallbacks kept for Steam hardware spread)');
console.log('   - Renderer throttling: DISABLED');
console.log('   - Version:', app.getVersion(), isDev ? '(dev)' : '(packaged)');

let mainWindow = null;
let quitting = false;   // set once a quit has actually been asked for

// ── Launch choreography (renderer half: js/00a-boot.js) ────────────────────
// The window is created effectively invisible and maximized BEFORE the page
// loads, so the renderer's very first layout is already work-area sized and
// every heavy init — shader compile, FBO allocation, preset-vault scan —
// happens with nothing on screen but the OS busy cursor.
// When the renderer says it is settled, this ramps the window's opacity up to
// 1. The old flow (maximize()+show() on 'ready-to-show') revealed a 1400×900
// box that then snapped to full screen mid-boot.
//
// Note maximize() SHOWS the window (documented) — that is deliberate: a
// genuinely hidden window can have its rAF throttled, which would stall the
// very init we are waiting on. At this alpha it is invisible either way.
// 800, not 420. With an ease-in-out only the middle of the curve is
// perceptible, so a 420ms ramp put the whole visible transition into ~230ms
// and read as a snap rather than as something materialising.
const BOOT_FADE_MS = Math.max(0, Number(process.env.ASGT_BOOT_FADE_MS || 800));
// `--no-boot-fade` is a diagnostic escape hatch, not a shipping path: a
// window that has ever been given an opacity keeps Windows' WS_EX_LAYERED
// style for its lifetime, so skipping setOpacity entirely is the only way to
// A/B the fade against a plain, never-layered window.
const BOOT_FADE = BOOT_FADE_MS > 0 && !process.argv.includes('--no-boot-fade');
// NOT zero. Windows stops hit-testing a layered window once its alpha reaches
// 0, and with no hit test there is no WM_SETCURSOR — measured, the renderer's
// boot cursor never appeared and the pointer sat on the plain
// desktop arrow for the whole load. 2/255 is the smallest alpha that keeps
// the window in the hit-test path; blending a #0d1117 window over a white
// desktop at 0.8% moves each channel by two counts, so there is nothing to
// see. The fade ramps from here, not from 0.
const BOOT_HIDDEN_OPACITY = 2 / 255;
// Backstop for a renderer that never reports ready (a chunk that throws, a GL
// context that never produces a frame). Longer than the renderer's own 9s
// watchdog, so in practice the renderer is always what asks.
const BOOT_WATCHDOG_MS = 12000;
let bootRevealed = false;
let bootWatchdog = null;
let bootFadeTimer = null;
let fadeT0 = 0;
let fadeDriven = false;   // the renderer's rAF has taken the ramp over

// Ramp from the boot alpha, not from 0, so the ends of every fade are
// continuous with what was already on screen (nothing).
function setWindowAlpha(eased) {
    mainWindow.setOpacity(BOOT_HIDDEN_OPACITY + (1 - BOOT_HIDDEN_OPACITY) * eased);
}

// t is linear progress 0..1; the curve lives here so both drivers share it.
function applyFadeAlpha(t) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // smoothstep: the eye reads a linear alpha ramp as "snapped on at the
    // end", an ease-in-out as something materialising.
    setWindowAlpha(t * t * (3 - 2 * t));
    if (process.env.ASGT_FADE_TRACE) console.log('[fadetrace]', Date.now() - fadeT0, t.toFixed(4));
    if (t >= 1) {
        clearInterval(bootFadeTimer);
        bootFadeTimer = null;
        mainWindow.setOpacity(1);
        console.log('[boot] fade complete in', Date.now() - fadeT0, 'ms',
                    fadeDriven ? '(rAF-driven)' : '(timer fallback)');
    }
}

// One step per rendered frame, sent from js/00a-boot.js.
ipcMain.on('boot-fade-step', (_evt, t) => {
    if (!bootRevealed || !BOOT_FADE) return;
    fadeDriven = true;
    applyFadeAlpha(Math.max(0, Math.min(1, Number(t) || 0)));
});

// ── Restart ────────────────────────────────────────────────────────────────
// Every restart path — F5, the hard reload, the nuclear reset, a renderer
// crash, and the WebGL context-loss recovery — used to call reload() straight
// out on a fully visible window. Chromium holds the last painted frame while
// the page tears down and the next one boots, so what the user actually saw
// was the app FREEZE for ~800ms and then hard-cut to the rebooted UI
// (measured: zero change across two 260ms samples, then a single 16.7 jump).
// Worse, the reload branch of 'boot-ready' answered fadeMs 0, so the return
// had no fade at all — the exact snap the launch choreography exists to avoid.
//
// A restart is now the launch run backwards and then forwards: dissolve out,
// reload while invisible, and come back up the same 800ms ramp as a cold
// start. The freeze happens where nobody can see it.
const RESTART_FADE_OUT_MS = Math.max(0, Number(process.env.ASGT_RESTART_FADE_MS || 240));
let restarting = false;

// Deliberately brisker than the way in, and deliberately NOT rAF-driven: the
// renderer is about to be destroyed (and on the crash path is already dead),
// so the ramp has to survive without it. A main-process timer asking for 8ms
// lands on Windows' 15.6ms tick — under one display frame, so DWM still takes
// a fresh value every frame. See BOOT_FADE_MS for why 16.7 would not.
function fadeOutThen(done) {
    if (!BOOT_FADE || !mainWindow || mainWindow.isDestroyed() || RESTART_FADE_OUT_MS <= 0) {
        done();
        return;
    }
    const t0 = Date.now();
    clearInterval(bootFadeTimer);
    bootFadeTimer = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            clearInterval(bootFadeTimer); bootFadeTimer = null;
            // done() never runs on this path, so release the re-entry guard
            // here or a window that dies mid-fade leaves every later restart
            // silently blocked.
            restarting = false;
            return;
        }
        const t = Math.min(1, (Date.now() - t0) / RESTART_FADE_OUT_MS);
        setWindowAlpha(1 - (t * t * (3 - 2 * t)));
        if (t >= 1) {
            clearInterval(bootFadeTimer); bootFadeTimer = null;
            done();
        }
    }, 8);
}

// prep runs while the window is already invisible — cache/storage clearing
// belongs there so its cost is hidden too, not stacked in front of the fade.
function beginRestart(reason, prep) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (restarting) return;   // a second F5 mid-restart must not stack ramps
    restarting = true;
    console.log('[boot] restarting —', reason);
    fadeOutThen(() => {
        Promise.resolve()
            .then(() => (typeof prep === 'function' ? prep() : null))
            .catch((e) => console.warn('[boot] restart prep failed', e && e.message))
            .then(() => {
                restarting = false;
                if (!mainWindow || mainWindow.isDestroyed()) return;
                // Re-arm the cold-launch reveal path so the way back in is the
                // full ramp, not the fadeMs-0 shortcut the reload branch uses.
                bootRevealed = false;
                fadeDriven = false;
                clearTimeout(bootWatchdog);
                bootWatchdog = setTimeout(() => revealWindow('watchdog'), BOOT_WATCHDOG_MS);
                mainWindow.webContents.reload();
            })
            // Tail catch: unhandled rejections are no longer silent, and a
            // restart step that fails is not worth raising an error card over
            // a working app.
            .catch((e) => console.warn('[boot] restart failed', e && e.message));
    });
}

// The renderer asks for this on WebGL context restore — that recovery used to
// be a bare location.reload() from inside the page, which is the one restart
// path that ships AND fires without any dialog in front of it.
ipcMain.on('request-restart', (_evt, reason) => {
    beginRestart(String(reason || 'renderer request').slice(0, 60));
});

// Something has gone wrong and we are about to parent a modal to this window.
// It may still be at boot alpha (~0), and a modal owned by a window with no
// pixels reads as a frozen desktop — the user hears the blocked-window beep
// and sees nothing to click. Put it on screen first, with no ceremony: the
// fade exists to make a healthy launch feel considered, and there is nothing
// to ease in here.
function forceWindowVisible() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    bootRevealed = true;
    clearTimeout(bootWatchdog);
    clearInterval(bootFadeTimer);
    bootFadeTimer = null;
    try {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.setOpacity(1);
        mainWindow.focus();
    } catch (_) {}
}

function revealWindow(reason) {
    if (bootRevealed || !mainWindow || mainWindow.isDestroyed()) return;
    bootRevealed = true;
    clearTimeout(bootWatchdog);
    console.log('[boot] revealing window —', reason);

    // Focus BEFORE the ramp: an inactive window paints its title bar and
    // focus rings differently, and swapping those mid-fade is exactly the
    // flicker this whole path exists to remove.
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    // Tell the renderer the ramp is starting so its own entrance (title card,
    // first-run hint, restore prompt) lines up with the fade instead of
    // firing behind an invisible window.
    try { mainWindow.webContents.send('boot-reveal', { fadeMs: BOOT_FADE ? BOOT_FADE_MS : 0 }); } catch (_) {}

    if (!BOOT_FADE) return;

    // The RENDERER drives the ramp, from requestAnimationFrame — the timer
    // below is only its understudy. A main-process timer cannot pace this
    // well on Windows: the default system timer granularity is 15.6ms, so
    // asking setInterval for one display frame (16.7ms) rounds UP to the next
    // tick and actually delivers ~31ms. Measured that way the fade issued 29
    // steps in 805ms — every value held for two display frames, which is
    // exactly the judder. rAF is phase-locked to the display by construction,
    // so one step lands per rendered frame, and it steps in sympathy with the
    // canvas underneath rather than beating against it.
    fadeT0 = Date.now();
    fadeDriven = false;
    clearInterval(bootFadeTimer);
    bootFadeTimer = setInterval(() => {
        if (fadeDriven || !mainWindow || mainWindow.isDestroyed()) {
            clearInterval(bootFadeTimer); bootFadeTimer = null;
            return;
        }
        // 8, not 16: anything above the 15.6ms tick lands on 31. Asking for
        // less than a tick simply fires every tick, which is the best a timer
        // can do here — and the curve is computed from elapsed time, so
        // over-firing costs nothing and under-firing stays duration-accurate.
        applyFadeAlpha(Math.min(1, (Date.now() - fadeT0) / BOOT_FADE_MS));
    }, 8);
}

// ══ Photosensitivity boot cache ═══════════════════════════════════════
// The gate in index.html has to know two things before it paints: has the
// warning been acknowledged, and is protection on. Those live in
// localStorage — and reading localStorage is the single most expensive thing
// in the whole launch. Measured: the FIRST touch of the store in a renderer
// blocks it for ~490ms while the storage service opens an existing profile
// (761/802/1026ms across three runs of a bare `localStorage.length`, 0ms for
// every call after; a virgin profile is free, so it is opening an existing
// store that costs). Frozen renderer means nothing paints and no cursor
// hit-test is serviced — it was most of the "Windows spinner spins forever"
// at launch, and it delayed the boot cursor by ~880ms.
//
// So main keeps a plain-JSON mirror of those two values and hands them to the
// renderer on argv, which costs an fs.readFileSync of ~40 bytes. localStorage
// REMAINS THE SOURCE OF TRUTH — js/04a and js/05e read and write the same keys
// directly, and nothing about that changes. This is a boot-time cache and
// nothing more; when it is absent or unreadable the gate falls back to reading
// localStorage exactly as it always did, and then seeds the cache so the next
// launch is fast. That fallback is also the migration path for every existing
// install, which is why a missing file must never be treated as "not acked".
const PHOTO_CACHE = () => path.join(app.getPath('userData'), 'photo-safe.json');

function readPhotoCache() {
    try {
        // replace(/^\uFEFF/, '') — a BOM makes JSON.parse throw, and anything
        // that ever rewrites this file by hand (or an editor that helpfully
        // adds one) would silently cost every launch the 490ms it exists to
        // avoid. Cheap to tolerate, invisible when it bites.
        const raw = JSON.parse(fs.readFileSync(PHOTO_CACHE(), 'utf8').replace(/^\uFEFF/, ''));
        if (!raw || typeof raw !== 'object') return null;
        // `protect` is deliberately tri-state: '1', '0', or absent. Absent
        // means protected AND "no trusted choice on record", which the gate
        // treats differently from an explicit '1' — flattening it to a boolean
        // would silently convert a never-asked user into an opted-in one.
        const protect = (raw.protect === '1' || raw.protect === '0') ? raw.protect : null;
        return { ack: raw.ack === true, protect };
    } catch (_) { return null; }
}

function photoCacheArgs() {
    const c = readPhotoCache();
    if (!c) return [];   // no cache yet — the gate reads localStorage, as before
    return ['--photo-ack=' + (c.ack ? '1' : '0'),
            '--photo-protect=' + (c.protect === null ? 'unset' : c.protect)];
}

// Written only from the renderer's trusted-consent path — see index.html.
ipcMain.on('photo-safe-cache', (_evt, payload) => {
    try {
        if (!payload || typeof payload !== 'object') return;
        const ack = payload.ack === true;
        const protect = (payload.protect === '1' || payload.protect === '0') ? payload.protect : null;
        fs.writeFileSync(PHOTO_CACHE(), JSON.stringify({ ack, protect }), 'utf8');
    } catch (e) {
        // A cache that cannot be written is not a failure worth surfacing:
        // the gate falls back to localStorage and the app is simply as slow
        // as it used to be.
        console.warn('[photo-safe] cache write failed:', e && e.message);
    }
});

// The renderer reports ready once its scripts, layout and first drawn frame
// are all in and the layout has stopped moving (js/00a-boot.js).
ipcMain.on('boot-ready', () => {
    if (bootRevealed) {
        // A dev reload (F5) re-runs the renderer's boot with the window
        // already up — answer at once so it does not sit on its fallback
        // timer, and with no fade, since there is nothing to materialize.
        if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('boot-reveal', { fadeMs: 0 }); } catch (_) {}
        }
        return;
    }
    revealWindow('renderer ready');
});

// Single instance: a second launch (e.g. double-clicking in Steam) focuses
// the existing window instead of spawning a second app fighting over the GPU
// and the Preset Vault on disk. gotLock also gates window creation below —
// the losing process must never reach createWindow().
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    // ⚠️ PERFORMANCE NOTE: transparent: true causes GPU compositor overhead.
    // At high resolutions (4K dye), this can cause "GPU state invalid" errors.
    // Set to false for maximum performance, true for desktop transparency.
    const USE_TRANSPARENT_WINDOW = false; // Set to true if you need transparency

    // createWindow can run a second time (macOS `activate`) — that window is
    // born invisible too, so the reveal state has to start over with it or it
    // would stay that way forever.
    bootRevealed = false;
    clearTimeout(bootWatchdog);
    clearInterval(bootFadeTimer);
    bootFadeTimer = null;

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,  // Enable for window controls
            contextIsolation: false, // Disable for window controls
            enableRemoteModule: true, // Enable remote module for window controls
            offscreen: false, // Use hardware rendering
            webgl: true,
            experimentalFeatures: true,
            webSecurity: true, // Keep security but allow WASM
            allowRunningInsecureContent: false,
            // cache: true by default — preserves localStorage/settings across restarts
            // The photosensitivity gate reads these off process.argv instead of
            // paying the ~490ms storage-service cold start before it can paint.
            // Nothing is passed when the cache is missing, and the gate then
            // falls back to localStorage — see readPhotoCache() above.
            additionalArguments: photoCacheArgs(),
        },
        transparent: USE_TRANSPARENT_WINDOW,
        frame: false, // Use custom title bar (frameless window)
        backgroundColor: USE_TRANSPARENT_WINDOW ? '#00000000' : '#0d1117',
        show: false, // revealed by revealWindow() once the renderer is settled
        // Invisible from birth, so the entire boot happens off-screen. Only
        // set when fading: passing opacity at all makes the window layered for
        // good on Windows (see BOOT_FADE / BOOT_HIDDEN_OPACITY above).
        ...(BOOT_FADE ? { opacity: BOOT_HIDDEN_OPACITY } : {}),
    });

    // Enable remote module for this window
    require('@electron/remote/main').enable(mainWindow.webContents);

    // Maximize BEFORE loadFile so the renderer never lays out at 1400×900 and
    // then reflows to the work area — that reflow is the "init size bug"
    // 01-config.js still carries a workaround for, and it is what made the
    // first visible frame a small dark box that snapped to full screen.
    if (BOOT_FADE) mainWindow.setOpacity(BOOT_HIDDEN_OPACITY);
    mainWindow.maximize();
    
    // NOTE: setFrameRate() only works with offscreen rendering (offscreen: true).
    // High refresh rate is handled by --disable-gpu-vsync + --disable-frame-rate-limit flags.
    
    // NOTE: Cache and localStorage are preserved across restarts.
    // Use Ctrl+Shift+D in the app to force-clear everything for debugging.
    
    // The reveal is driven by the renderer's 'boot-ready'; this is the
    // backstop. Armed here rather than on 'ready-to-show' because that event
    // only fires once the renderer has painted — a renderer that wedges
    // before its first frame would never arm it, and the window would sit
    // invisible forever with no way for the user to know the app is running.
    // ('ready-to-show' is far too early to reveal on anyway: the shaders are
    // still compiling and no framebuffer exists yet.)
    bootWatchdog = setTimeout(() => revealWindow('watchdog'), BOOT_WATCHDOG_MS);

    // Load the app
    mainWindow.loadFile('index.html');

    // Open DevTools in development (optional)
    // mainWindow.webContents.openDevTools();
    
    // A file dropped anywhere outside a drop zone would otherwise make Chromium
    // NAVIGATE the window to that file (the app is replaced by an image viewer
    // with no way back). Block navigation and new windows outright — the app is
    // a single local page and never legitimately navigates.
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow.webContents.getURL()) event.preventDefault();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // index.html itself failing to load is a damaged install, not a bug — and
    // it is invisible, because the window is born at ~0 alpha and the boot
    // watchdog reveals an empty dark rectangle 12s later with no explanation.
    // ERR_ABORTED (-3) is excluded: a reload that supersedes an in-flight load
    // reports as a failure and is completely normal.
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        const err = new Error('Could not load ' + validatedURL + ' — ' + errorDescription + ' (' + errorCode + ')');
        err.code = 'ENOENT';   // routes to the "verify your files" copy
        fatalError('did-fail-load', err);
    });

    // A dead renderer used to be a silent white window — surface it instead.
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        if (details.reason === 'clean-exit') return;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        // Written down whether or not they pick Reload — a user who hits this
        // twice and mails you about it has something to send.
        writeCrashLog('renderer gone — ' + details.reason, new Error('exitCode ' + details.exitCode));
        // Deliberate kill from the unresponsive-recovery path below — reload
        // silently instead of stacking a crash dialog on top.
        if (mainWindow.__expectRendererKill) {
            mainWindow.__expectRendererKill = false;
            beginRestart('unresponsive recovery');
            return;
        }
        forceWindowVisible();
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'error',
            buttons: ['Reload', 'Quit'],
            defaultId: 0,
            title: 'Swirl Together crashed',
            message: `The app's renderer crashed (${details.reason}).`,
            detail: 'Unsaved work on the canvas is lost. If this keeps happening, update your GPU drivers.\n\n' +
                'Details were written to:\n' + crashLogPath()
        });
        if (choice === 0) beginRestart('renderer crash');
        else app.quit();
    });
    mainWindow.on('unresponsive', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        forceWindowVisible();
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            buttons: ['Keep waiting', 'Reload'],
            defaultId: 0,
            title: 'Not responding',
            message: 'Swirl Together is not responding.',
            detail: 'A heavy export or a very large canvas can take a while. You can keep waiting or reload (unsaved work is lost on reload).'
        });
        if (choice === 1) {
            // webContents.reload() waits on beforeunload in a renderer that is
            // by definition not responding — kill it and reload via the
            // render-process-gone handler above instead.
            mainWindow.__expectRendererKill = true;
            mainWindow.webContents.forcefullyCrashRenderer();
        }
    });

    // Development shortcuts — packaged builds get none of these (F5 wiping an
    // unsaved painting is a support ticket, not a feature). Run with --dev to
    // re-enable in a packaged build.
    // Every binding here is OURS now: the application menu is removed in all
    // builds (below), so nothing reloads behind this app's back. Ctrl+R is
    // listed explicitly because it used to belong to the default menu — the
    // one reload path that never reached this process.
    if (isDev) mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const key = (input.key || '').toLowerCase();
        // F5 / Ctrl+R = Reload (preserves settings)
        if ((key === 'f5' && !input.control && !input.shift) ||
            (key === 'r' && input.control && !input.shift)) {
            event.preventDefault();
            guardedReload(false);
            return;
        }
        // Ctrl+Shift+R = Hard reload (clear file cache, keep localStorage)
        if (input.control && input.shift && key === 'r') {
            event.preventDefault();
            guardedReload(true);
            return;
        }
        // Ctrl+Shift+I = DevTools — the default menu used to supply this, and
        // removing the menu took it with it.
        if (input.control && input.shift && key === 'i') {
            event.preventDefault();
            mainWindow.webContents.toggleDevTools();
            return;
        }
        // Ctrl+Shift+D = Nuclear reset (clear everything including localStorage)
        // GUARDRAIL: this wipes localStorage (presets included). Confirm first.
        // The on-disk Preset Vault survives and re-seeds presets on next launch,
        // but an unconfirmed keystroke wiping everything is still a footgun.
        if (input.control && input.shift && key === 'd') {
            event.preventDefault();
            askRenderer('nuclear').then((ok) => {
                if (!ok || !mainWindow || mainWindow.isDestroyed()) return;
                // The wipe runs as restart prep, i.e. behind the fade — it is
                // the slowest step here and used to happen in full view.
                beginRestart('nuclear reset', () =>
                    mainWindow.webContents.session.clearCache().then(() =>
                        mainWindow.webContents.session.clearStorageData({
                            storages: ['cookies', 'cachestorage', 'localstorage', 'serviceworkers']
                        })));
            });
        }
    });

    // Remove menu bar for cleaner look (optional)
    mainWindow.setMenuBarVisibility(false);

    // ── Close confirmation, answered by the renderer ───────────────────────
    // The window's close is held open while the renderer asks in an in-app
    // modal (04f-canvas-actions.js). Doing this natively here — or from the
    // renderer over remote — was the old UX: 'question' rang the Windows
    // message-box chime, and an unparented box could sit BEHIND this
    // frameless maximized window, so the app looked frozen and every click
    // rang the blocked-window beep.
    mainWindow.__allowClose = false;
    mainWindow.on('close', (e) => {
        if (mainWindow.__allowClose) return;
        const wc = mainWindow.webContents;
        // Nobody home to ask (crashed/destroyed renderer) — let it close.
        if (!wc || wc.isDestroyed() || wc.isCrashed()) return;
        e.preventDefault();
        if (mainWindow.__closeAsking) {
            // Second X while the modal is already up — surface it instead of
            // stacking another prompt.
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            return;
        }
        mainWindow.__closeAsking = true;
        askRenderer('close').then((ok) => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            mainWindow.__closeAsking = false;
            if (!ok) return;
            mainWindow.__allowClose = true;
            mainWindow.close();
        });
    });
    // Clean up reference when window is closed
    mainWindow.on('closed', () => {
        clearTimeout(bootWatchdog);
        clearInterval(bootFadeTimer);
        bootFadeTimer = null;
        // A window that goes away without anyone asking it to is the app
        // vanishing off the user's screen, and `window-all-closed` turns that
        // straight into a clean exit(0) — no dialog, no log, nothing to send
        // in a bug report. Seen once during this session's test run, after a
        // "GPU state invalid after WaitForGetOffsetInRange": the app was
        // simply gone. There is nothing left to show a dialog over by this
        // point, but there is no excuse for leaving no trace.
        if (!quitting && !mainWindow.__allowClose) {
            writeCrashLog('window destroyed without a close request',
                new Error('renderer/GPU teardown, or an external kill'));
        }
        mainWindow = null;
    });
}

// ── "Are you sure?", asked in the app ──────────────────────────────────────
// Every confirmation the MAIN process needs — closing, reloading, wiping
// local data — is asked by the renderer in the app's own modal (04f). Doing
// it natively rings the Windows message-box chime and, on a frameless
// window, can land the box behind the app. Registered once at module scope:
// createWindow runs again on macOS `activate`, and duplicate listeners would
// double-answer.
let _askSeq = 0;
const _asks = new Map();

function askRenderer(kind) {
    return new Promise((resolve) => {
        const wc = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.webContents : null;
        // Nobody home to ask — the caller's action proceeds unguarded, which
        // is the only sane answer for a dead renderer.
        if (!wc || wc.isDestroyed() || wc.isCrashed()) { resolve(true); return; }
        const id = ++_askSeq;
        // A renderer whose JS is wedged can never ack, and that must not leave
        // an unclosable window. The ack lands as soon as the prompt is on
        // screen, so a user reading it never trips this.
        const timer = setTimeout(() => {
            if (!_asks.has(id)) return;
            _asks.delete(id);
            console.warn('[ask] renderer never answered:', kind);
            resolve(true);
        }, 1500);
        _asks.set(id, { resolve: resolve, timer: timer });
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        wc.send('app-ask', { id: id, kind: kind });
    });
}

ipcMain.on('app-ask-ack', (evt, id) => {
    const a = _asks.get(id);
    // Prompt is up — stand the watchdog down and let them take their time.
    if (a) clearTimeout(a.timer);
});
ipcMain.on('app-ask-response', (evt, payload) => {
    const a = payload && _asks.get(payload.id);
    if (!a) return;
    clearTimeout(a.timer);
    _asks.delete(payload.id);
    a.resolve(!!payload.ok);
});

// Reload paths go through the same question. Ctrl+R used to be the DEFAULT
// menu's accelerator — it never reached this process at all, so it hit the
// renderer's beforeunload fallback and raised the native box the whole close
// rework existed to get rid of.
function guardedReload(hard) {
    askRenderer(hard ? 'hard-reload' : 'reload').then((ok) => {
        if (!ok || !mainWindow || mainWindow.isDestroyed()) return;
        beginRestart(hard ? 'hard reload' : 'reload',
            hard ? () => mainWindow.webContents.session.clearCache() : null);
    });
}

// GPU process death is recovered by Chromium (the renderer's context-loss
// path handles the user-facing part) — log the reason for bug reports.
app.on('child-process-gone', (event, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') {
        console.error('[GPU] process gone:', details.reason);
        // The user-visible half is already handled; this is purely so a
        // driver-reset report arrives with the reason attached.
        writeCrashLog('GPU process gone — ' + details.reason, new Error('exitCode ' + details.exitCode));
    }
});

app.whenReady().then(() => {
    if (!gotLock) return; // losing process of the single-instance race

    // setMenuBarVisibility(false) only hides the bar — the default menu's
    // accelerators (Ctrl+R reload, Ctrl+Shift+I devtools) stay registered.
    // A packaged build must not ship a hidden Ctrl+R that wipes a painting.
    //
    // Removed in DEV too now (2026-08-18): the menu's Ctrl+R bypassed this
    // process entirely, so it reloaded straight through the unsaved-work
    // guard and raised the renderer's native fallback box — the exact dialog
    // the in-app prompt replaced. Dev keeps its shortcuts through
    // before-input-event above (F5, Ctrl+R, Ctrl+Shift+R/I/D), which is also
    // what packaged builds run, so the two behave the same.
    Menu.setApplicationMenu(null);

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Force-destroy all windows before quitting
app.on('before-quit', () => {
    // Tells the 'closed' handler that this teardown was asked for, so a
    // normal quit does not get logged as an unexplained disappearance.
    quitting = true;
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.removeAllListeners('close');
            win.destroy();
        }
    });
});

// Final cleanup on process exit
app.on('will-quit', () => {
    mainWindow = null;
});

// Handle terminal kill signals (Ctrl+C, taskkill, etc.)
process.on('SIGINT', () => {
    app.quit();
});
process.on('SIGTERM', () => {
    app.quit();
});
