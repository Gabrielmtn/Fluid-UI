/**
 * Display Mode — Windowed / Borderless Window / Borderless Fullscreen
 *
 * The "Window Mode" dropdown in the sidebar's Display section is the AUTHORITY:
 * it is how you enter a fullscreen mode and the guaranteed way back out. So the
 * control panels deliberately stay on screen in every mode — the only thing the
 * fullscreen modes drop is the WINDOW chrome (custom titlebar + the frameless
 * resize handles), which css/styles.css hides off the body classes set here.
 * (Hiding the panels too is what 'F' / focus mode is for — a separate feature.)
 *
 * The three modes are genuinely distinct, not aliases:
 *   windowed    restored/maximized window, titlebar + resize handles, taskbar visible
 *   borderless  normal window resized to fill the whole monitor, no chrome — no
 *               fullscreen transition, instant alt-tab, other windows can overlay
 *   fullscreen  real OS fullscreen state (BrowserWindow.setFullScreen)
 *
 * Electron drives the real window via @electron/remote. The browser build falls
 * back to the Fullscreen API and drops the Borderless Window option, which has
 * no meaning without an OS window to size.
 */
(function () {
    'use strict';

    var MODES = ['windowed', 'borderless', 'fullscreen'];
    var SETTING_KEY = 'display.windowMode';

    // Same Electron signal the rest of the app uses (see 00-window-controls):
    // node integration, NOT userAgent — an Electron shell serving the web build
    // has "Electron" in its UA but no require, and must be treated as web.
    var isElectron = (typeof require !== 'undefined');
    var win = null;
    var screenApi = null;
    if (isElectron) {
        try {
            var remote = require('@electron/remote');
            win = remote.getCurrentWindow();
            screenApi = remote.screen;
        } catch (e) {
            console.warn('Display mode: @electron/remote unavailable, using web fallback:', e);
            isElectron = false;
        }
    }

    var current = 'windowed';
    var select = null;
    var applying = false;      // our own transition in flight — ignore echo events
    var windowedState = null;  // geometry to restore when returning to Windowed

    // ── Window geometry (Electron) ──────────────────────────────────────

    // Snapshot what "Windowed" should return to, taken on the way OUT of it.
    // The app launches maximized, so a null snapshot means "maximize" rather
    // than some arbitrary default size.
    function captureWindowedState() {
        if (!win) return;
        try {
            var maximized = win.isMaximized();
            windowedState = { maximized: maximized, bounds: maximized ? null : win.getBounds() };
        } catch (_) {}
    }

    function placeWindow(mode) {
        if (!win) return;
        try {
            if (mode === 'borderless') {
                // Fill the monitor the window currently sits on. The window is
                // already frame:false, so monitor-sized == borderless fullscreen
                // to look at; Windows hides the taskbar for a foreground window
                // that covers the display.
                var d = screenApi.getDisplayMatching(win.getBounds());
                if (win.isMaximized()) win.unmaximize();
                win.setBounds(d.bounds);
                return;
            }
            // windowed
            if (windowedState && windowedState.bounds) {
                if (win.isMaximized()) win.unmaximize();
                win.setBounds(windowedState.bounds);
            } else {
                win.maximize(); // no snapshot, or it was maximized — launch default
            }
        } catch (e) {
            console.warn('Display mode: window placement failed:', e);
        }
    }

    // setBounds is ignored while the window is in OS fullscreen and the exit is
    // async, so geometry changes have to wait for the transition to land.
    function afterLeavingFullScreen(fn) {
        var done = false;
        var run = function () { if (done) return; done = true; fn(); };
        try { win.once('leave-full-screen', run); } catch (_) {}
        setTimeout(run, 250); // fallback if the event never reaches the renderer
    }

    function applyElectron(mode) {
        if (!win) return;
        try {
            if (mode === 'fullscreen') { win.setFullScreen(true); return; }
            if (win.isFullScreen()) {
                afterLeavingFullScreen(function () { placeWindow(mode); });
                win.setFullScreen(false);
                return;
            }
            placeWindow(mode);
        } catch (e) {
            console.warn('Display mode: window update failed:', e);
        }
    }

    // ── Browser fallback ────────────────────────────────────────────────

    function applyWeb(mode) {
        try {
            if (mode === 'fullscreen') {
                var el = document.documentElement;
                // Needs a user gesture; the <select> change is one. Rejections
                // are handled by the fullscreenchange sync below.
                if (!document.fullscreenElement && el.requestFullscreen) {
                    var p = el.requestFullscreen();
                    if (p && p.catch) p.catch(fullscreenRefused);
                }
            } else if (document.fullscreenElement && document.exitFullscreen) {
                var q = document.exitFullscreen();
                if (q && q.catch) q.catch(function () {});
            }
        } catch (_) {}
    }

    // ── Mode switching ──────────────────────────────────────────────────

    function applyBodyClass(mode) {
        if (!document.body) return;
        document.body.classList.toggle('display-borderless', mode === 'borderless');
        document.body.classList.toggle('display-fullscreen', mode === 'fullscreen');
    }

    function setMode(mode, opts) {
        opts = opts || {};
        if (MODES.indexOf(mode) === -1) mode = 'windowed';
        if (mode === current && !opts.force) return;

        if (isElectron && current === 'windowed' && mode !== 'windowed') captureWindowedState();

        current = mode;
        applying = true;
        applyBodyClass(mode);
        if (select && select.value !== mode) select.value = mode;

        if (isElectron) applyElectron(mode);
        else applyWeb(mode);

        if (opts.persist !== false) {
            try { if (window.settingsManager) window.settingsManager.set(SETTING_KEY, mode); } catch (_) {}
        }

        // The canvas re-fits itself: #canvas-area changes size (window resize
        // and/or the titlebar's 32px coming back), and 01-config's ResizeObserver
        // on that element re-runs initializeCanvasPosition.
        setTimeout(function () { applying = false; }, 400);
    }

    function toggleFullscreen() {
        setMode(current === 'fullscreen' ? 'windowed' : 'fullscreen');
    }

    // ── Keep the dropdown honest when the OS drops us out ────────────────

    function syncFromBrowser() {
        if (applying || isElectron) return;
        if (!document.fullscreenElement && current === 'fullscreen') setMode('windowed');
    }

    // The browser refused fullscreen (no user gesture, or a policy block). Revert
    // UNCONDITIONALLY — the guarded sync above would be swallowed by `applying`,
    // which is still true while our own transition is in flight, leaving the
    // dropdown claiming a mode we are demonstrably not in.
    function fullscreenRefused() {
        applying = false;
        if (current === 'fullscreen') setMode('windowed', { force: true });
    }

    function bindSync() {
        document.addEventListener('fullscreenchange', syncFromBrowser);
        if (isElectron && win) {
            var onLeave = function () {
                if (applying) return;              // our own transition
                if (current === 'fullscreen') setMode('windowed');
            };
            try {
                win.on('leave-full-screen', onLeave);
                // Remote listeners outlive the renderer on reload — drop ours.
                window.addEventListener('beforeunload', function () {
                    try { win.removeListener('leave-full-screen', onLeave); } catch (_) {}
                });
            } catch (_) {}
        }
    }

    // ── Init ────────────────────────────────────────────────────────────

    function init() {
        select = document.getElementById('windowMode');

        if (select && !isElectron) {
            // No OS window to size in the browser build.
            var opt = select.querySelector('option[value="borderless"]');
            if (opt) opt.parentNode.removeChild(opt);
        }
        if (select) {
            select.addEventListener('change', function () { setMode(select.value); });
        }

        var saved = 'windowed';
        try {
            if (window.settingsManager) saved = window.settingsManager.get(SETTING_KEY, 'windowed');
        } catch (_) {}
        if (MODES.indexOf(saved) === -1) saved = 'windowed';
        // Browser fullscreen can't be entered without a user gesture, so a saved
        // 'fullscreen' would leave the dropdown lying about the actual state.
        if (!isElectron && saved === 'fullscreen') saved = 'windowed';

        if (select) select.value = saved;
        if (saved !== 'windowed') setMode(saved, { persist: false, force: true });

        bindSync();
    }

    // ── Public API ──────────────────────────────────────────────────────
    window.displayMode = {
        set: setMode,
        get: function () { return current; },
        toggleFullscreen: toggleFullscreen,
        MODES: MODES
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
