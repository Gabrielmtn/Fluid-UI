// Electron Main Process
const { app, BrowserWindow } = require('electron');
const path = require('path');

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
app.commandLine.appendSwitch('enable-webgl2-compute-context');

// ⚡ NUCLEAR: Force disable ALL frame limiting
app.commandLine.appendSwitch('max-gum-fps', '1000'); // Remove media FPS cap
app.commandLine.appendSwitch('disable-renderer-backgrounding'); // Keep rendering at full speed
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); // No throttling when covered
// NOTE: Do NOT use --use-angle=gl on Windows — OpenGL backend locks vsync to 60Hz.
// Default D3D11 backend handles high-refresh monitors correctly.
app.commandLine.appendSwitch('disable-software-rasterizer'); // Force hardware rendering

// ⚡ Memory and Performance Flags
app.commandLine.appendSwitch('max-old-space-size', '4096'); // 4GB heap
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-semi-space-size=128'); // Manual GC + larger young gen

// ⚡ Additional GPU flags
app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// On dual-GPU machines Chromium can land on the integrated GPU (observed:
// UHD 770 pegged at 100% while the GeForce idles). Ask for the discrete
// adapter explicitly; the canvas already requests powerPreference
// 'high-performance', but the process-level hint is what Windows honors.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization'); // Out-of-process rasterization

console.log('🚀 Electron performance flags applied');
console.log('   - GPU VSync: display-native (flags removed — they pinned 60Hz, see above)');
console.log('   - GPU workarounds: DISABLED');
console.log('   - Renderer throttling: DISABLED');

let mainWindow = null;

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
    
    // Development shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
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

app.whenReady().then(() => {
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
