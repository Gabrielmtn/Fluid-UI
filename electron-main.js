// Electron Main Process
const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');

// Dev affordances (F5 reload, cache clears, nuclear reset) only exist outside
// packaged builds, or when explicitly asked for with --dev.
const isDev = !app.isPackaged || process.argv.includes('--dev');

// ── Steamworks (Steam plan S5-1) ───────────────────────────────────────────
// App ID for "A Small Good Thing" (Steamworks app created 2026-08-06).
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
        },
        transparent: USE_TRANSPARENT_WINDOW,
        frame: false, // Use custom title bar (frameless window)
        backgroundColor: USE_TRANSPARENT_WINDOW ? '#00000000' : '#0d1117',
        icon: path.join(__dirname, 'assets/icon.png'),
        show: false, // Show after ready for smoother startup
    });
    
    // Enable remote module for this window
    require('@electron/remote/main').enable(mainWindow.webContents);
    
    // NOTE: setFrameRate() only works with offscreen rendering (offscreen: true).
    // High refresh rate is handled by --disable-gpu-vsync + --disable-frame-rate-limit flags.
    
    // NOTE: Cache and localStorage are preserved across restarts.
    // Use Ctrl+Shift+D in the app to force-clear everything for debugging.
    
    // Show window when ready (prevents flash). Start maximized so the canvas
    // gets the full work area on launch — measured by initializeCanvasPosition
    // in the renderer once the (now-maximized) layout settles.
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

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

    // A dead renderer used to be a silent white window — surface it instead.
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        if (details.reason === 'clean-exit') return;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        // Deliberate kill from the unresponsive-recovery path below — reload
        // silently instead of stacking a crash dialog on top.
        if (mainWindow.__expectRendererKill) {
            mainWindow.__expectRendererKill = false;
            mainWindow.webContents.reload();
            return;
        }
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'error',
            buttons: ['Reload', 'Quit'],
            defaultId: 0,
            title: 'A Small Good Thing crashed',
            message: `The app's renderer crashed (${details.reason}).`,
            detail: 'Unsaved work on the canvas is lost. If this keeps happening, update your GPU drivers.'
        });
        if (choice === 0) mainWindow.webContents.reload();
        else app.quit();
    });
    mainWindow.on('unresponsive', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'warning',
            buttons: ['Keep waiting', 'Reload'],
            defaultId: 0,
            title: 'Not responding',
            message: 'A Small Good Thing is not responding.',
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
    if (isDev) mainWindow.webContents.on('before-input-event', (event, input) => {
        // F5 = Reload (preserves settings)
        if (input.key === 'F5' && !input.control && !input.shift) {
            mainWindow.webContents.reload();
        }
        // Ctrl+Shift+R = Hard reload (clear file cache, keep localStorage)
        if (input.control && input.shift && input.key === 'R') {
            mainWindow.webContents.session.clearCache().then(() => {
                mainWindow.webContents.reload();
            });
        }
        // Ctrl+Shift+D = Nuclear reset (clear everything including localStorage)
        // GUARDRAIL: this wipes localStorage (presets included). Confirm first.
        // The on-disk Preset Vault survives and re-seeds presets on next launch,
        // but an unconfirmed keystroke wiping everything is still a footgun.
        if (input.control && input.shift && input.key === 'D') {
            const { dialog } = require('electron');
            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                buttons: ['Cancel', 'Reset everything'],
                defaultId: 0,
                cancelId: 0,
                title: 'Nuclear reset',
                message: 'Clear ALL local data (localStorage, cache)?',
                detail: 'This wipes settings and the in-app preset list. Presets saved to your Preset Vault folder survive and reload automatically, but anything not in the vault is lost.'
            });
            if (choice !== 1) return;
            mainWindow.webContents.session.clearCache().then(() => {
                mainWindow.webContents.session.clearStorageData({
                    storages: ['cookies', 'cachestorage', 'localstorage', 'serviceworkers']
                }).then(() => {
                    mainWindow.webContents.reload();
                });
            });
        }
    });

    // Remove menu bar for cleaner look (optional)
    mainWindow.setMenuBarVisibility(false);

    // Clean up reference when window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// GPU process death is recovered by Chromium (the renderer's context-loss
// path handles the user-facing part) — log the reason for bug reports.
app.on('child-process-gone', (event, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') {
        console.error('[GPU] process gone:', details.reason);
    }
});

app.whenReady().then(() => {
    if (!gotLock) return; // losing process of the single-instance race

    // setMenuBarVisibility(false) only hides the bar — the default menu's
    // accelerators (Ctrl+R reload, Ctrl+Shift+I devtools) stay registered.
    // A packaged build must not ship a hidden Ctrl+R that wipes a painting.
    if (!isDev) Menu.setApplicationMenu(null);

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
