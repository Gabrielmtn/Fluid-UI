// scripts/test/pen-window/throwaway-main.js — THROWAWAY Electron main for
// probing the Pen Input Window in the desktop build while the real app is
// running (its single-instance lock keeps a second real copy out). Own
// userData, hidden main window, no lock; the window-open handler is lifted
// VERBATIM from electron-main.js so what runs here is what ships.
//
//   node scripts/test/pen-window/electron-probe.js     (spawns this)
//
// electron-builder drops scripts/, so nothing here ships.
'use strict';
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..', '..');

app.setPath('userData', path.join(os.tmpdir(), 'fluid-penwin-userdata-' + process.pid));
app.commandLine.appendSwitch('remote-debugging-port', process.env.PENWIN_PORT || '9343');
app.commandLine.appendSwitch('force_high_performance_gpu');

const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

const PEN_WINDOW_FRAME = 'swirl-pen-input';
const penWindows = new Set();

function liftHandlerFromRealMain() {
    const src = fs.readFileSync(path.join(REPO, 'electron-main.js'), 'utf8');
    const start = src.indexOf('mainWindow.webContents.setWindowOpenHandler(({ url, frameName, features })');
    const tail = src.indexOf("child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));", start);
    const end = src.indexOf('});', tail) + 3;
    if (start < 0 || tail < 0) throw new Error('could not find the pen-window handler in electron-main.js');
    return src.slice(start, end);
}

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 1400, height: 900, show: false, frame: false, backgroundColor: '#0d1117',
        webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: true, webgl: true, experimentalFeatures: true }
    });
    remoteMain.enable(mainWindow.webContents);
    const code = liftHandlerFromRealMain();
    new Function('mainWindow', 'PEN_WINDOW_FRAME', 'penWindows', 'shell', code)(mainWindow, PEN_WINDOW_FRAME, penWindows, shell);
    mainWindow.on('closed', () => {
        penWindows.forEach((w) => { try { if (!w.isDestroyed()) w.close(); } catch (_) {} });
        penWindows.clear();
    });
    mainWindow.loadFile(path.join(REPO, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
