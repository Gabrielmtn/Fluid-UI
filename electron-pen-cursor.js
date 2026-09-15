// ═══════════════════════════════════════════════════════════════════
// electron-pen-cursor.js — Pen Input Window: the mouse picks up where it
// left off (Windows). Main-process half; the renderer half is the "cursor
// return" block in js/47-pen-window.js. Installed by electron-main.js.
//
// WHY
//   Windows has ONE system cursor and a pen moves it on every packet, so
//   after a stretch of drawing on the pen display the arrow sits on the
//   tablet and the mouse has to be dragged all the way back to the main
//   monitor every time you reach for a slider. This puts it back where the
//   mouse last was the moment the mouse moves again.
//
// HOW
//   • While the pen window is open the real cursor is sampled ~30×/s
//     (GetCursorPos). Any position OFF the pen window's monitor is the
//     mouse's — a pen display's pen cannot put the cursor there — and
//     becomes `home`.
//   • Only the renderer can tell a pen from a mouse (pointerType). It sends
//     'pen-cursor-pen' when a pen takes the cursor on the pen window (arms
//     us) and invokes 'pen-cursor-return' when the MOUSE then wakes up there
//     → SetCursorPos(home). Messages flow on hand-overs only, never per move.
//   • If a sample finds the cursor off the pen monitor while armed, the
//     mouse got there on its own: disarm and say so ('pen-cursor-mouse-away'),
//     so a deliberate trip onto the tablet is never bounced back.
//   • Physical pixels and Win32 monitor handles throughout. Electron's DIP
//     layout is offset from the real one on mixed-DPI desks (measured on
//     the dev machine: the Wacom at DIP 663,1440 is physically 673,1449),
//     so a DIP round trip would land the arrow that far from where it was.
//   • Pen window on the app's own monitor: pen and mouse share the screen,
//     a position says nothing about which one moved it → inactive.
//
// koffi (MIT, FFI) is required lazily on the first start, so app launch
// never pays for it and a missing native binary only turns this off.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const MONITOR_DEFAULTTONULL = 0;
const MONITOR_DEFAULTTONEAREST = 2;
const POLL_MS = 33;       // sampled, never hooked: a global mouse hook runs JS on every system-wide move
const LOST_POLLS = 60;    // ~2 s with no pen window or no renderer → stop on our own

let win32 = null;         // null = not tried, false = unavailable, else the bound calls
let win32Error = '';

// BrowserWindow → HWND as a number. Handles carry 32 significant bits and
// are SIGN-extended on x64, so read signed: exact as a Number either way.
function hwndOf(win) {
    const buf = win.getNativeWindowHandle();
    return buf.length >= 8 ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
}

function bindWin32() {
    if (win32 !== null) return win32;
    win32 = false;
    if (process.platform !== 'win32') { win32Error = 'Windows only'; return win32; }
    try {
        const koffi = require('koffi');
        const user32 = koffi.load('user32.dll');
        koffi.struct('SWIRL_POINT', { x: 'long', y: 'long' });
        const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ SWIRL_POINT *pt)');
        const SetCursorPos = user32.func('bool __stdcall SetCursorPos(int x, int y)');
        const MonitorFromPoint = user32.func('intptr_t __stdcall MonitorFromPoint(SWIRL_POINT pt, uint32_t flags)');
        const MonitorFromWindow = user32.func('intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)');
        win32 = {
            cursor() { const pt = {}; return GetCursorPos(pt) ? { x: pt.x, y: pt.y } : null; },
            moveCursor(x, y) { return !!SetCursorPos(x, y); },
            monitorAt(x, y) { return MonitorFromPoint({ x, y }, MONITOR_DEFAULTTONEAREST); },
            isOnAMonitor(x, y) { return !!MonitorFromPoint({ x, y }, MONITOR_DEFAULTTONULL); },
            monitorOf(win) {
                if (!win || win.isDestroyed()) return 0;
                return MonitorFromWindow(hwndOf(win), MONITOR_DEFAULTTONEAREST);
            }
        };
    } catch (e) {
        win32 = false;
        win32Error = String((e && e.message) || e);
        console.warn('[pen-cursor] cursor calls unavailable:', win32Error);
    }
    return win32;
}

// `api` (tests) replaces the Win32 calls: cursor(), moveCursor(x, y),
// monitorAt(x, y), isOnAMonitor(x, y), monitorOf(win).
function createPenCursor(opts) {
    const o = opts || {};
    const getMainWindow = o.getMainWindow || (() => null);
    const getPenWindow = o.getPenWindow || (() => null);
    const pollMs = o.pollMs || POLL_MS;
    let api = o.api || null;
    let sender = null;        // the renderer's webContents
    let timer = null;
    let home = null;          // physical px: where the mouse last was, off the pen monitor
    let armed = false;        // the renderer says the pen drove the cursor last
    let sameScreen = false;
    let lost = 0;
    const stats = { polls: 0, returns: 0, last: '' };

    function notify(channel) {
        try { if (sender && !sender.isDestroyed()) sender.send(channel); } catch (_) {}
    }
    // The pen window's monitor, and whether the app sits on the same one.
    function monitors() {
        const pen = getPenWindow();
        if (!pen) return null;
        const penMon = api.monitorOf(pen);
        const appMon = api.monitorOf(getMainWindow());
        return { penMon, sameScreen: !penMon || penMon === appMon };
    }

    function poll() {
        stats.polls++;
        if (!sender || sender.isDestroyed() || !getPenWindow()) {
            if (++lost >= LOST_POLLS) stop();
            return;
        }
        lost = 0;
        const m = monitors();
        sameScreen = !m || m.sameScreen;
        if (sameScreen) return;
        const pt = api.cursor();
        if (!pt) return;
        if (api.monitorAt(pt.x, pt.y) !== m.penMon) {
            home = pt;
            if (armed) { armed = false; notify('pen-cursor-mouse-away'); }
        }
    }

    function start(webContents) {
        if (!api) api = bindWin32();
        if (!api) return { ok: false, reason: win32Error || 'unavailable' };
        sender = webContents || null;
        armed = false;
        lost = 0;
        home = null;
        clearInterval(timer);
        timer = setInterval(poll, pollMs);
        poll();
        return { ok: true };
    }
    function stop() {
        clearInterval(timer);
        timer = null;
        sender = null;
        armed = false;
        lost = 0;
    }
    function pen() { if (timer) armed = true; }

    function result(moved, reason, to) {
        stats.last = reason;
        const r = { moved, reason };
        if (to) r.to = { x: to.x, y: to.y };
        return r;
    }
    function returnHome() {
        if (!timer) return result(false, 'not running');
        if (!armed) return result(false, 'the mouse already left the pen display');
        armed = false;
        const m = monitors();
        if (!m || m.sameScreen) return result(false, 'the pen window shares the app\'s screen');
        if (!home) return result(false, 'no mouse position yet');
        // Only from the tablet: if the arrow is already off it, it is the mouse's.
        const pt = api.cursor();
        if (!pt || api.monitorAt(pt.x, pt.y) !== m.penMon) return result(false, 'the cursor is not on the pen display');
        if (!api.isOnAMonitor(home.x, home.y)) { home = null; return result(false, 'that screen is gone'); }
        if (!api.moveCursor(home.x, home.y)) return result(false, 'SetCursorPos refused');
        stats.returns++;
        return result(true, 'returned', home);
    }

    function state() {
        return {
            running: !!timer, armed, sameScreen,
            home: home ? { x: home.x, y: home.y } : null,
            available: api ? true : (win32 === false ? false : null),
            error: win32Error, polls: stats.polls, returns: stats.returns, last: stats.last
        };
    }

    return { start, stop, pen, returnHome, poll, state };
}

// Wires the renderer's messages. One renderer (the main window) uses it.
function install(ipcMain, opts) {
    const pc = createPenCursor(opts);
    let owner = null;
    ipcMain.handle('pen-cursor-start', (evt) => { owner = evt.sender; return pc.start(evt.sender); });
    ipcMain.on('pen-cursor-stop', (evt) => { if (!owner || evt.sender === owner) { owner = null; pc.stop(); } });
    ipcMain.on('pen-cursor-pen', () => pc.pen());
    ipcMain.handle('pen-cursor-return', () => pc.returnHome());
    ipcMain.handle('pen-cursor-state', () => pc.state());
    return pc;
}

module.exports = { install, createPenCursor };
