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
app.commandLine.appendSwitch('disable-gpu-vsync'); // Uncap FPS
app.commandLine.appendSwitch('disable-frame-rate-limit'); // CRITICAL: Remove FPS cap
app.commandLine.appendSwitch('enable-webgl2-compute-context');

// ⚡ NUCLEAR: Force disable ALL frame limiting
app.commandLine.appendSwitch('max-gum-fps', '1000'); // Remove media FPS cap
app.commandLine.appendSwitch('disable-renderer-backgrounding'); // Keep rendering at full speed
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); // No throttling when covered
app.commandLine.appendSwitch('use-angle', 'gl'); // Force OpenGL instead of D3D
app.commandLine.appendSwitch('disable-software-rasterizer'); // Force hardware rendering

// ⚡ Memory and Performance Flags
app.commandLine.appendSwitch('max-old-space-size', '4096'); // 4GB heap
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-semi-space-size=128'); // Manual GC + larger young gen

// ⚡ Additional GPU flags
app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization'); // Out-of-process rasterization

console.log('🚀 Electron performance flags applied');
console.log('   - GPU VSync: DISABLED');
console.log('   - Frame rate limit: DISABLED');
console.log('   - GPU workarounds: DISABLED');
console.log('   - Renderer throttling: DISABLED');

function createWindow() {
    const mainWindow = new BrowserWindow({
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
        transparent: true, // Allow desktop to show through
        frame: false, // Use custom title bar (frameless window)
        backgroundColor: '#00000000', // Fully transparent background
        icon: path.join(__dirname, 'assets/icon.png'),
        show: false, // Show after ready for smoother startup
    });
    
    // Enable remote module for this window
    require('@electron/remote/main').enable(mainWindow.webContents);
    
    // FORCE: Try to disable VSync at window level
    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.setFrameRate(144); // Try to set frame rate directly
    });
    
    // NOTE: Cache and localStorage are preserved across restarts.
    // Use Ctrl+Shift+D in the app to force-clear everything for debugging.
    
    // Show window when ready (prevents flash)
    mainWindow.once('ready-to-show', () => {
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
        if (input.control && input.shift && input.key === 'D') {
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
