// ═══════════════════════════════════════════════════════════════════
// js/47-pen-window.js — Pen Input Window (Display → Pen Input Window)
// LOAD ORDER: plain <script> after 36-display-mode.js. Binds its two
//   controls by id (20-mixer-layout moves them into the Display section;
//   element identity survives the move) and reads canvas / config /
//   settingsManager lazily, so it is safe before the async sim chunks land.
// PROVIDES: window.PenWindow — { open, close, toggle, isOpen, __state }
//
// WHAT IT IS
//   A second window you drag onto a pen display (or any other screen) and
//   make fullscreen. It is an INPUT SURFACE, not a second app: every pen /
//   mouse event that lands on it is re-issued on #canvas here as a synthetic
//   PointerEvent with the same button, buttons, pressure, tilt and coalesced
//   sub-samples, mapped through the canvas's on-screen rect. The sim, the
//   brush engine, replay, button modes, recording, multiplayer — none of
//   them can tell the difference, and the app keeps rendering on THIS
//   monitor at THIS monitor's frame rate (rAF follows the display a window
//   sits on; a 60 Hz pen display would otherwise cap the whole sim).
//
//   Presenter-mode idea: the pen display shows a live MIRROR of the canvas
//   plus the brush ring under the pen, so you can aim on the tablet and
//   watch the paint on the big screen. The mirror is deliberately the
//   cheapest thing that is still a good reference: a 2D canvas in the pen
//   window, at most ~1280 px wide, redrawn with ONE drawImage of #canvas —
//   a GPU-to-GPU blit (preserveDrawingBuffer is on), no readback, no media
//   pipeline — 12× a second while the pen is over the window and twice a
//   second otherwise ("Light", the default; "Smooth" is 24/4). The first
//   build used canvas.captureStream + <video>, which reads every frame back
//   off the GPU at full canvas resolution and re-uploads it: measured as
//   the one real cost of the feature, so it is gone. Off = blank surface.
//
//   Hotkeys and the scroll wheel work from the pen window too: keys are
//   re-dispatched on document.body here, wheel on the canvas, so [ ] size,
//   Space freeze, Ctrl+Z, right-click replay all behave as at home.
//
// HOW IT IS BUILT
//   window.open('', 'swirl-pen-input') → an about:blank popup that inherits
//   our origin. We document.write its markup and attach OUR listener
//   functions to ITS elements (same-origin, one process, one main thread —
//   the cheapest possible bridge: no messaging, no serialisation). In the
//   browser build the popup is a real popup window (F11 / the Fullscreen
//   button use the Fullscreen API); in Electron, electron-main.js allows the
//   frameName, opens it as a normal framed BrowserWindow — on the OTHER
//   display, fullscreen, when there is one — and the toolbar drives that
//   BrowserWindow through @electron/remote.
//
// TRAPS (all measured, see the 2026-09-11 notes)
//   • setPointerCapture(syntheticId) throws NotFoundError — 05d wraps every
//     capture call in try/catch, so the synthetic stroke rides without
//     capture; the pen window captures the REAL pointer on its own stage,
//     so moves and the release keep coming even off-window.
//   • The popup taking focus blurs this window, and 05d hard-aborts any
//     stroke on blur. Normally the blur lands BEFORE the press (focus IPC
//     precedes the input IPC), but the capturing blur listener below
//     swallows a blur that arrives while a forwarded stroke is live.
//   • A constructed PointerEvent honours `coalescedEvents`, and
//     getCoalescedEvents() returns them for untrusted events (self-tested
//     at load; the fallback dispatches each sample as its own move).
//   • Touch on the pen display is ignored on purpose (05d's touch path
//     needs raw TouchLists for gestures; a resting palm must not paint).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var canvas = document.getElementById('canvas');
    if (!canvas) return;

    var FRAME_NAME = 'swirl-pen-input';
    var MIRROR_KEY = 'display.penWindowMirror';
    var SCREEN_KEY = 'display.penWindowScreen';   // Electron display id the window last lived on
    var SCREEN_KEY_WEB = 'display.penWindowScreenWeb';   // browser: label or "left,top" of the chosen screen
    var ID_OFFSET = 5000;          // synthetic pointerIds never collide with real ones
    var BAR_ZONE = 56;             // px from the top edge that reveals the toolbar
    var BAR_LINGER = 1400;         // ms the toolbar stays after the pointer leaves it
    var ACTIVE_WINDOW_MS = 2000;   // input this recent = "drawing": mirror at the active rate
    // Mirror modes: redraw rate while drawing / idle, and the backing-store
    // width cap (CSS scales it to the box). Resolution is nearly free on the
    // GPU; the rate is what costs, and idle time is most of the session.
    var MIRROR_MODES = {
        light:  { active: 12, idle: 2, maxW: 1280, label: 'Light: 12 fps while drawing, 2 idle' },
        smooth: { active: 24, idle: 4, maxW: 1280, label: 'Smooth: 24 fps while drawing, 4 idle' },
        off:    null
    };

    // Same Electron signal the rest of the app uses (see 00-window-controls):
    // node integration, NOT userAgent.
    var isElectron = (typeof require !== 'undefined');
    var remote = null;
    if (isElectron) {
        try { remote = require('@electron/remote'); }
        catch (e) { console.warn('Pen window: @electron/remote unavailable, using web behaviour:', e); isElectron = false; }
    }

    var pop = null;        // the popup Window
    var pdoc = null;       // its document
    var ui = null;         // its elements
    var childWin = null;   // Electron BrowserWindow of the popup (remote), if found
    var box = { x: 0, y: 0, w: 1, h: 1 };   // where the canvas sits inside the popup
    var held = {};         // real pointerId → { button, cx, cy } for strokes we forwarded
    var heldCount = 0;
    var hoverInside = false;
    var lastDownTs = -1e9;
    var lastInputTs = -1e9;    // any pen/mouse/wheel input on the popup (mirror active/idle)
    var penActiveTs = -1e9;    // last PEN event on the popup: mouse events are dropped while the pen is live
    var pendingCancel = {};    // real pen pointerId → timer: a pointercancel we are not yet sure about
    var ownerId = null;        // the synthetic id that currently owns the main brush ring
    var barTimer = 0, fitTimer = 0, pollTimer = 0;
    var mirrorTimer = 0, mirrorCtx = null;
    var mirrorStats = { draws: 0, drawMs: 0, lastRate: 0 };   // drawMs = EMA of one blit's main-thread cost
    var screenDetails = null;   // Window Management API details, when granted

    // ── Self-test: does a constructed event carry its coalesced samples? ──
    var COALESCED_OK = (function () {
        try {
            var d = document.createElement('div'), n = -1;
            d.addEventListener('pointermove', function (e) { n = e.getCoalescedEvents().length; });
            var c = new PointerEvent('pointermove', { clientX: 1, clientY: 1 });
            d.dispatchEvent(new PointerEvent('pointermove', { coalescedEvents: [c], clientX: 1, clientY: 1 }));
            return n === 1;
        } catch (_) { return false; }
    })();

    // ── Settings ─────────────────────────────────────────────────────

    function mirrorSelect() { return document.getElementById('penWindowMirror'); }
    function mirrorMode() {
        var sel = mirrorSelect();
        var v = sel ? sel.value : 'light';
        return (v in MIRROR_MODES) ? v : 'light';
    }
    // The first build persisted a frame rate (0/15/30/60); map it onto the modes.
    function normalizeMode(v) {
        if (v == null || v === '') return null;
        if (v in MIRROR_MODES) return v;
        var n = parseFloat(v);
        if (!isFinite(n)) return null;
        return n <= 0 ? 'off' : (n <= 15 ? 'light' : 'smooth');
    }
    function loadMirrorSetting() {
        var sel = mirrorSelect();
        if (!sel) return;
        var saved = null;
        try { if (window.settingsManager) saved = window.settingsManager.get(MIRROR_KEY, null); } catch (_) {}
        if (saved == null) { try { saved = localStorage.getItem('fluidUI:' + MIRROR_KEY); } catch (_) {} }
        var mode = normalizeMode(saved);
        if (mode && sel.querySelector('option[value="' + mode + '"]')) sel.value = mode;
    }
    function saveMirrorSetting() {
        var v = mirrorMode();
        try { if (window.settingsManager) { window.settingsManager.set(MIRROR_KEY, v); return; } } catch (_) {}
        try { localStorage.setItem('fluidUI:' + MIRROR_KEY, v); } catch (_) {}
    }
    function savedScreenId() {
        var v = null;
        try { if (window.settingsManager) v = window.settingsManager.get(SCREEN_KEY, null); } catch (_) {}
        if (v == null) { try { v = localStorage.getItem('fluidUI:' + SCREEN_KEY); } catch (_) {} }
        return (v == null || v === '') ? null : Number(v);
    }
    function saveScreenId(id) {
        try { if (window.settingsManager) { window.settingsManager.set(SCREEN_KEY, id); return; } } catch (_) {}
        try { localStorage.setItem('fluidUI:' + SCREEN_KEY, String(id)); } catch (_) {}
    }
    function savedScreenKeyWeb() {
        var v = null;
        try { if (window.settingsManager) v = window.settingsManager.get(SCREEN_KEY_WEB, null); } catch (_) {}
        if (v == null) { try { v = localStorage.getItem('fluidUI:' + SCREEN_KEY_WEB); } catch (_) {} }
        return (v == null || v === '') ? null : String(v);
    }
    function saveScreenKeyWeb(key) {
        try { if (window.settingsManager) { window.settingsManager.set(SCREEN_KEY_WEB, key); return; } } catch (_) {}
        try { localStorage.setItem('fluidUI:' + SCREEN_KEY_WEB, String(key)); } catch (_) {}
    }

    // ── Popup markup (a fresh document: none of the app's CSS applies) ──

    function popupHtml() {
        return [
            '<!doctype html><html><head><meta charset="utf-8">',
            '<title>Swirl Together — Pen input</title>',
            '<style>',
            'html,body{margin:0;height:100%;background:#000;overflow:hidden;color:#cfd6e0;',
            'font:13px system-ui,-apple-system,Segoe UI,sans-serif;user-select:none;-webkit-user-select:none}',
            '[hidden]{display:none!important}',
            '#stage{position:fixed;inset:0;touch-action:none;overscroll-behavior:none;cursor:none}',
            '#box{position:absolute;left:0;top:0;width:100px;height:100px;background:#0b0e13;overflow:hidden;',
            'box-shadow:0 0 0 1px rgba(255,255,255,0.10)}',
            '#mirror{position:absolute;inset:0;width:100%;height:100%;display:block;background:#000;pointer-events:none}',
            '#blank{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;',
            'color:rgba(207,214,224,0.55);font-size:15px;line-height:1.5;pointer-events:none;',
            'background-image:radial-gradient(rgba(255,255,255,0.10) 1px,transparent 1.2px);background-size:36px 36px}',
            '#blank b{display:block;font-size:17px;color:rgba(207,214,224,0.85);margin-bottom:4px}',
            '#ring{position:fixed;left:0;top:0;pointer-events:none;display:none;transform:translate(-50%,-50%);will-change:transform,width,height}',
            '#bar{position:fixed;left:0;right:0;top:0;height:40px;display:flex;gap:10px;align-items:center;padding:0 12px;',
            'background:rgba(10,14,20,0.94);border-bottom:1px solid rgba(255,255,255,0.10);z-index:5;cursor:default;',
            'transition:opacity .22s ease;box-sizing:border-box;white-space:nowrap}',
            '#bar.idle{opacity:0;pointer-events:none}',
            '#bar b{color:#e8ecf2;font-weight:600}',
            '#bar .grow{flex:1;overflow:hidden;text-overflow:ellipsis;color:#9aa6b8}',
            '#bar label{display:flex;align-items:center;gap:6px;color:#9aa6b8}',
            '#bar select,#bar button{font:inherit;color:#e8ecf2;background:rgba(255,255,255,0.07);',
            'border:1px solid rgba(255,255,255,0.16);border-radius:6px;padding:4px 10px;cursor:pointer}',
            '#bar select{padding:4px 6px}',
            '#bar button:hover,#bar select:hover{background:rgba(255,255,255,0.13)}',
            '#bar button:focus,#bar select:focus{outline:1px solid rgba(120,180,255,0.7)}',
            '</style></head><body>',
            '<div id="stage"><div id="box">',
            '<canvas id="mirror" width="16" height="9"></canvas>',
            '<div id="blank" hidden><div><b>Mirror off</b>Draw here and watch your main monitor.</div></div>',
            '</div><div id="ring"></div></div>',
            '<div id="bar"><b>Swirl Together · pen input</b>',
            '<span class="grow" id="status">Draw here — the paint lands on your main monitor.</span>',
            // Buttons only: in the desktop build this window never takes
            // focus (so the mouse keeps working in the app while the pen is
            // down), and a <select> needs focus to open.
            '<button id="mirrorBtn" type="button" title="Mirror: what this window shows under the pen. Click to cycle Light / Smooth / Off.">Mirror: Light</button>',
            '<button id="screenBtn" type="button" title="Move this window to the next screen">Screen &#9656;</button>',
            '<button id="fsBtn" type="button" title="F11">Fullscreen</button>',
            '<button id="closeBtn" type="button">Close</button>',
            '</div></body></html>'
        ].join('');
    }

    // ── Placement: prefer the OTHER screen (that is the whole point) ──

    // ── Screens (Electron): one list feeds the sidebar radios, the opening
    // placement and the moves. Sorted left→right, top→bottom, each entry
    // named by the platform label when there is one, its size, touch, and
    // where it sits relative to the app ("below the app") — because ids
    // mean nothing to a person and "the wrong screen" has to be undoable
    // from the main window without hunting.
    function relativeWhere(b, m) {
        var dx = (b.x + b.width / 2) - (m.x + m.width / 2);
        var dy = (b.y + b.height / 2) - (m.y + m.height / 2);
        if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left of the app' : 'right of the app';
        return dy < 0 ? 'above the app' : 'below the app';
    }
    function displayList() {
        if (!remote) return [];
        var win = remote.getCurrentWindow();
        var scr = remote.screen;
        var mine = scr.getDisplayMatching(win.getBounds());
        var all = scr.getAllDisplays().slice().sort(function (a, b) {
            return (a.bounds.x - b.bounds.x) || (a.bounds.y - b.bounds.y);
        });
        return all.map(function (d, i) {
            var isApp = d.id === mine.id;
            var name = (d.label && String(d.label).trim()) || ('Screen ' + (i + 1));
            var bits = [d.bounds.width + '×' + d.bounds.height];
            if (d.touchSupport === 'available') bits.push('touch');
            bits.push(isApp ? 'the app is here' : relativeWhere(d.bounds, mine.bounds));
            return {
                id: d.id, bounds: d.bounds, workArea: d.workArea, isApp: isApp,
                touch: d.touchSupport === 'available', label: name + ' · ' + bits.join(' · ')
            };
        });
    }
    // Saved choice → a screen whose name says "pen display" (Windows reports
    // the monitor model: "Wacom One 13", "Cintiq", "Kamvas"...) → a touch
    // screen that is not the app's → any other → the app's.
    var PEN_DISPLAY_NAME = /wacom|cintiq|kamvas|huion|xp-?pen|artist|gaomon|veikk|ugee|pen display/i;
    function pickDisplay(list) {
        var want = savedScreenId(), i;
        if (want != null) for (i = 0; i < list.length; i++) if (list[i].id === want) return list[i];
        for (i = 0; i < list.length; i++) if (!list[i].isApp && PEN_DISPLAY_NAME.test(list[i].label)) return list[i];
        for (i = 0; i < list.length; i++) if (list[i].touch && !list[i].isApp) return list[i];
        for (i = 0; i < list.length; i++) if (!list[i].isApp) return list[i];
        return list[0] || null;
    }
    // A windowed box on the app's own screen (never fullscreen over the app).
    function windowedBox(d) {
        var wa = d.workArea || d.bounds;
        var w = Math.round(wa.width * 0.5), h = Math.round(wa.height * 0.5);
        return { x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + Math.round((wa.height - h) / 2), width: w, height: h };
    }
    function electronPlacement() {
        if (!remote) return null;
        try {
            var list = displayList();
            var d = pickDisplay(list);
            if (!d) return null;
            if (d.isApp) {
                var b = windowedBox(d);
                return { x: b.x, y: b.y, w: b.width, h: b.height, fullscreen: false, id: d.id, sameScreen: true, label: d.label };
            }
            return { x: d.bounds.x, y: d.bounds.y, w: d.bounds.width, h: d.bounds.height, fullscreen: true, id: d.id, label: d.label };
        } catch (e) {
            console.warn('Pen window: display lookup failed:', e);
            return null;
        }
    }
    function currentDisplayId() {
        if (!childWin) return null;
        try { return remote.screen.getDisplayMatching(childWin.getBounds()).id; } catch (_) { return null; }
    }
    // Move the open pen window onto a display: fullscreen there, or a
    // windowed box when it is the app's own screen. Fullscreen is dropped
    // first and re-armed after the move — setBounds is ignored while
    // fullscreen, and the exit is async (same dance as 36).
    function placeOnDisplay(d) {
        if (!childWin || !d) return;
        var wantFs = !d.isApp;
        var target = wantFs
            ? { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height }
            : windowedBox(d);
        var move = function () {
            try {
                childWin.setBounds(target);
                if (wantFs) childWin.setFullScreen(true);
                // Topmost only when fullscreen on another screen (a windowed box
                // on the app's screen must not float over the app).
                try { childWin.setAlwaysOnTop(wantFs); } catch (_) {}
                syncFsButton();
                syncScreenRadios();
            } catch (_) {}
        };
        try {
            if (childWin.isFullScreen()) {
                var done = false;
                var run = function () { if (done) return; done = true; move(); };
                try { childWin.once('leave-full-screen', run); } catch (_) {}
                childWin.setFullScreen(false);
                setTimeout(run, 300);
            } else {
                move();
            }
        } catch (e) { console.warn('Pen window: screen move failed', e); }
        saveScreenId(d.id);
    }

    // ── Screens (browser): the Window Management API, when granted ──
    function webScreenKey(s) {
        var l = s && s.label ? String(s.label).trim() : '';
        return l || ((s ? s.left : 0) + ',' + (s ? s.top : 0));
    }
    function webScreenLabel(s, i, cur) {
        var name = (s.label && String(s.label).trim()) || ('Screen ' + (i + 1));
        var bits = [s.width + '×' + s.height];
        if (s === cur) bits.push('the app is here');
        else bits.push(relativeWhere({ x: s.left, y: s.top, width: s.width, height: s.height },
                                     { x: cur.left, y: cur.top, width: cur.width, height: cur.height }));
        return name + ' · ' + bits.join(' · ');
    }
    function pickWebScreen() {
        if (!screenDetails || !screenDetails.screens) return null;
        var scr = screenDetails.screens, cur = screenDetails.currentScreen, want = savedScreenKeyWeb(), i;
        if (want) for (i = 0; i < scr.length; i++) if (webScreenKey(scr[i]) === want) return scr[i];
        for (i = 0; i < scr.length; i++) if (scr[i] !== cur) return scr[i];
        return null;
    }
    // Which screen the popup sits on now (by its centre).
    function popWebScreen() {
        if (!pop || pop.closed || !screenDetails) return null;
        try {
            var cx = pop.screenX + pop.outerWidth / 2, cy = pop.screenY + pop.outerHeight / 2;
            var scr = screenDetails.screens;
            for (var i = 0; i < scr.length; i++) {
                var s = scr[i];
                if (cx >= s.left && cx < s.left + s.width && cy >= s.top && cy < s.top + s.height) return s;
            }
        } catch (_) {}
        return null;
    }
    // Browser move: a fullscreen popup cannot be moved, so leave fullscreen
    // (no gesture needed), move, and say where the Fullscreen button is.
    function placeOnWebScreen(s) {
        if (!pop || pop.closed || !s) return;
        saveScreenKeyWeb(webScreenKey(s));
        try {
            var finish = function () {
                try {
                    pop.moveTo(s.availLeft, s.availTop);
                    pop.resizeTo(s.availWidth, s.availHeight);
                } catch (_) {}
                setStatus('Moved — press Fullscreen (F11) here.');
                syncScreenRadios();
            };
            if (pdoc.fullscreenElement && pdoc.exitFullscreen) {
                var q = pdoc.exitFullscreen();
                if (q && q.then) q.then(finish, finish); else setTimeout(finish, 150);
            } else finish();
        } catch (_) {}
    }

    // Screen ▸ in the popup toolbar: the next screen in the same list the
    // sidebar radios show.
    function cycleScreen() {
        if (childWin) {
            try {
                var list = displayList();
                if (list.length < 2) { setStatus('No other screen found.'); return; }
                var cur = currentDisplayId(), idx = -1;
                for (var i = 0; i < list.length; i++) if (list[i].id === cur) { idx = i; break; }
                var next = list[(idx + 1) % list.length];
                placeOnDisplay(next);
                setStatus('Moved to ' + next.label + '.');
            } catch (e) { console.warn('Pen window: screen move failed', e); }
            return;
        }
        if (!pop || typeof pop.getScreenDetails !== 'function') { setStatus('Drag this window onto the pen display, then press Fullscreen.'); return; }
        var p;
        try { p = pop.getScreenDetails(); } catch (_) { setStatus('Drag this window onto the pen display, then press Fullscreen.'); return; }
        p.then(function (sd) {
            adoptScreenDetails(sd);
            var scr = sd.screens, here = popWebScreen(), idx = -1;
            for (var i = 0; i < scr.length; i++) if (scr[i] === here) { idx = i; break; }
            if (scr.length < 2) { setStatus('No other screen found.'); return; }
            var next = scr[(idx + 1) % scr.length];
            if (!pop || pop.closed) return;
            try {
                if (pdoc.fullscreenElement && pdoc.documentElement.requestFullscreen) {
                    // Still inside the click: fullscreen can jump straight to the next screen.
                    saveScreenKeyWeb(webScreenKey(next));
                    var q = pdoc.documentElement.requestFullscreen({ screen: next });
                    if (q && q.then) q.then(syncScreenRadios, function () { placeOnWebScreen(next); });
                    setStatus('Moved to ' + webScreenLabel(next, (idx + 1) % scr.length, sd.currentScreen) + '.');
                } else {
                    placeOnWebScreen(next);
                }
            } catch (_) {}
        }).catch(function () { setStatus('Screen access declined — drag the window over instead.'); });
    }

    // ── Sidebar: the Pen Window Screen radios ────────────────────────
    // The way back when the window lands on the wrong screen: pick another
    // here, in the main window, and it moves at once. Also the default for
    // the next open.
    var screenWatchArmed = false;
    function screensHost() { return document.getElementById('penWindowScreens'); }
    function hintNode(text) {
        var d = document.createElement('div');
        d.className = 'pen-window-hint';
        d.textContent = text;
        return d;
    }
    function radioRow(value, text, checked, onPick) {
        var lab = document.createElement('label');
        lab.className = 'pen-screen';
        var inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'penWindowScreen';
        inp.value = value;
        inp.checked = !!checked;
        inp.addEventListener('change', function () { if (inp.checked) onPick(); });
        var sp = document.createElement('span');
        sp.textContent = text;
        lab.appendChild(inp);
        lab.appendChild(sp);
        return lab;
    }
    function adoptScreenDetails(sd) {
        if (screenDetails === sd) return;
        screenDetails = sd;
        try { sd.addEventListener('screenschange', buildScreenRadios); } catch (_) {}
        buildScreenRadios();
    }
    function buildScreenRadios() {
        var host = screensHost();
        if (!host) return;
        host.textContent = '';
        if (isElectron) {
            var list;
            try { list = displayList(); } catch (_) { list = []; }
            if (!list.length) { host.appendChild(hintNode('No screens reported.')); return; }
            var checkedId = isOpen() ? currentDisplayId() : null;
            if (checkedId == null) { var p = pickDisplay(list); checkedId = p ? p.id : null; }
            list.forEach(function (d) {
                host.appendChild(radioRow(String(d.id), d.label, d.id === checkedId, function () {
                    saveScreenId(d.id);
                    if (isOpen() && childWin) {
                        placeOnDisplay(d);
                        setHint('Moved the pen window to ' + d.label + '.');
                    } else {
                        setHint('The pen window will open on ' + d.label + '.');
                    }
                }));
            });
            armScreenWatch();
            return;
        }
        if (typeof window.getScreenDetails !== 'function') {
            host.appendChild(hintNode('This browser cannot list screens — drag the window onto your pen display and press Fullscreen there.'));
            return;
        }
        if (!screenDetails) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = 'Find Screens';
            b.style.width = '100%';
            b.title = 'Asks the browser for your screens (a one-time permission) so the pen window can be placed on one from here.';
            b.addEventListener('click', function () {
                var q;
                try { q = window.getScreenDetails(); } catch (_) { q = null; }
                if (!q || !q.then) return;
                q.then(adoptScreenDetails).catch(function () {
                    setHint('Screen access declined — drag the window onto your pen display instead.');
                });
            });
            host.appendChild(b);
            host.appendChild(hintNode('Or drag the window onto your pen display and press Fullscreen there.'));
            return;
        }
        var scr = screenDetails.screens, cur = screenDetails.currentScreen;
        var here = isOpen() ? popWebScreen() : null;
        var pick = here || pickWebScreen();
        scr.forEach(function (s, i) {
            host.appendChild(radioRow(webScreenKey(s), webScreenLabel(s, i, cur), s === pick, function () {
                saveScreenKeyWeb(webScreenKey(s));
                if (isOpen()) {
                    placeOnWebScreen(s);
                    setHint('Moved the pen window — press Fullscreen (F11) there.');
                } else {
                    setHint('The pen window will open on ' + webScreenLabel(s, i, cur) + '.');
                }
            }));
        });
    }
    function syncScreenRadios() {
        var host = screensHost();
        if (!host) return;
        var key = null;
        if (isElectron) {
            key = isOpen() ? currentDisplayId() : savedScreenId();
            if (key == null) { try { var p = pickDisplay(displayList()); key = p ? p.id : null; } catch (_) {} }
        } else {
            var s = isOpen() ? popWebScreen() : pickWebScreen();
            key = s ? webScreenKey(s) : null;
        }
        if (key == null) return;
        var inputs = host.querySelectorAll('input[type=radio]');
        for (var i = 0; i < inputs.length; i++) inputs[i].checked = (inputs[i].value === String(key));
    }
    // Displays come and go (a tablet plugged in mid-session): rebuild.
    function armScreenWatch() {
        if (screenWatchArmed || !remote) return;
        screenWatchArmed = true;
        var rebuild = function () { buildScreenRadios(); };
        try {
            var scr = remote.screen;
            scr.on('display-added', rebuild);
            scr.on('display-removed', rebuild);
            scr.on('display-metrics-changed', rebuild);
            // Remote listeners outlive the renderer on reload — drop ours.
            window.addEventListener('beforeunload', function () {
                try {
                    scr.removeListener('display-added', rebuild);
                    scr.removeListener('display-removed', rebuild);
                    scr.removeListener('display-metrics-changed', rebuild);
                } catch (_) {}
            });
        } catch (_) {}
    }

    // Browser: the Window Management API, only if it has already been
    // granted (a prompt needs the click, and window.open consumes it — see
    // placeAfterOpen for the prompt path).
    function webPlacement() {
        try {
            var s = pickWebScreen();
            if (!s) return null;
            return { x: s.availLeft, y: s.availTop, w: s.availWidth, h: s.availHeight, fullscreen: false };
        } catch (_) {}
        return null;
    }

    function featureString(place) {
        var parts = ['popup=yes', 'swirlPenInput=1'];
        if (place) {
            parts.push('left=' + place.x, 'top=' + place.y, 'width=' + place.w, 'height=' + place.h);
            if (place.fullscreen) parts.push('fullscreen=1');
        } else {
            var w = Math.round(Math.min(1100, (window.screen.availWidth || 1600) * 0.6));
            var h = Math.round(Math.min(760, (window.screen.availHeight || 900) * 0.6));
            parts.push('width=' + w, 'height=' + h);
        }
        return parts.join(',');
    }

    // Browser only: ask for the screens now (the click is still live) and
    // move the popup over once the answer comes back.
    function placeAfterOpen() {
        if (isElectron || screenDetails || typeof window.getScreenDetails !== 'function') return;
        var p;
        try { p = window.getScreenDetails(); } catch (_) { return; }
        if (!p || !p.then) return;
        p.then(function (sd) {
            adoptScreenDetails(sd);
            var place = webPlacement();
            if (!place || !pop || pop.closed) return;
            try {
                pop.moveTo(place.x, place.y);
                pop.resizeTo(place.w, place.h);
                setStatus('Moved to your other screen — press Fullscreen (F11) there.');
                syncScreenRadios();
            } catch (_) {}
        }).catch(function () { /* declined: the window stays where it opened */ });
    }

    // If the permission is already granted, cache the live details so the
    // NEXT open can land directly on the chosen screen (and the radios list).
    function primeScreenDetails() {
        if (isElectron || typeof window.getScreenDetails !== 'function' || !navigator.permissions) return;
        try {
            navigator.permissions.query({ name: 'window-management' }).then(function (st) {
                if (st.state !== 'granted') return;
                window.getScreenDetails().then(adoptScreenDetails).catch(function () {});
            }).catch(function () {});
        } catch (_) {}
    }

    // ── Electron: find our BrowserWindow so the toolbar can drive it ──

    function findChildWindow() {
        if (!remote) return null;
        try {
            var me = remote.getCurrentWindow();
            var all = remote.BrowserWindow.getAllWindows();
            var best = null;
            for (var i = 0; i < all.length; i++) {
                var w = all[i];
                if (w.id === me.id) continue;
                var t = '';
                try { t = w.getTitle() || ''; } catch (_) {}
                if (/pen input/i.test(t) && (!best || w.id > best.id)) best = w;
            }
            return best;
        } catch (_) { return null; }
    }

    // ── Fullscreen (popup) ───────────────────────────────────────────

    function isFullscreen() {
        if (childWin) { try { return !!childWin.isFullScreen(); } catch (_) {} }
        return !!(pdoc && pdoc.fullscreenElement);
    }
    function setFullscreen(on) {
        if (childWin) {
            try {
                childWin.setFullScreen(!!on);
                try { childWin.setAlwaysOnTop(!!on); } catch (_) {}
                syncFsButton();
                return;
            } catch (_) {}
        }
        if (!pdoc) return;
        try {
            if (on) {
                var el = pdoc.documentElement;
                if (!pdoc.fullscreenElement && el.requestFullscreen) {
                    var p = el.requestFullscreen();
                    if (p && p.catch) p.catch(function () { setStatus('Fullscreen was refused — press F11 in this window.'); });
                }
            } else if (pdoc.fullscreenElement && pdoc.exitFullscreen) {
                var q = pdoc.exitFullscreen();
                if (q && q.catch) q.catch(function () {});
            }
        } catch (_) {}
    }
    function toggleFullscreen() { setFullscreen(!isFullscreen()); }
    function syncFsButton() {
        if (!ui) return;
        ui.fsBtn.textContent = isFullscreen() ? 'Exit fullscreen' : 'Fullscreen';
    }

    // ── Geometry ─────────────────────────────────────────────────────

    // The canvas keeps its on-screen ASPECT inside the popup, letterboxed,
    // so a pen position maps to the canvas with one uniform scale.
    function fit() {
        if (!ui || !pop || pop.closed) return;
        var W = pop.innerWidth, H = pop.innerHeight;
        var rect = canvas.getBoundingClientRect();
        var ar = (rect.width > 0 && rect.height > 0) ? rect.width / rect.height : 4 / 3;
        var w = W, h = W / ar;
        if (h > H) { h = H; w = H * ar; }
        w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
        box = { x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w: w, h: h };
        ui.box.style.left = box.x + 'px';
        ui.box.style.top = box.y + 'px';
        ui.box.style.width = w + 'px';
        ui.box.style.height = h + 'px';
        sizeMirror();
    }

    // Popup client point → main-window client point on the canvas.
    function mapPoint(x, y) {
        var rect = canvas.getBoundingClientRect();
        var u = (x - box.x) / box.w, v = (y - box.y) / box.h;
        return {
            cx: rect.left + u * rect.width,
            cy: rect.top + v * rect.height,
            inside: u >= 0 && u <= 1 && v >= 0 && v <= 1
        };
    }

    // ── Synthetic events on the canvas ───────────────────────────────

    // `src` is the popup's event (buttons, modifiers, device); `s` is the
    // sample to take position / pressure / tilt from (src itself, or one of
    // its coalesced events).
    function synth(type, src, s, extra) {
        var m = mapPoint(s.clientX, s.clientY);
        var init = {
            bubbles: true, cancelable: true, composed: true, view: window, detail: 0,
            clientX: m.cx, clientY: m.cy,
            screenX: m.cx + (window.screenX || 0), screenY: m.cy + (window.screenY || 0),
            ctrlKey: !!src.ctrlKey, shiftKey: !!src.shiftKey, altKey: !!src.altKey, metaKey: !!src.metaKey,
            button: (typeof src.button === 'number') ? src.button : 0,
            buttons: src.buttons || 0,
            pointerId: ID_OFFSET + (src.pointerId || 0),
            pointerType: src.pointerType || 'mouse',
            isPrimary: src.isPrimary !== false,
            width: s.width || 1, height: s.height || 1,
            pressure: (typeof s.pressure === 'number') ? s.pressure : (src.buttons ? 0.5 : 0),
            tangentialPressure: s.tangentialPressure || 0,
            tiltX: s.tiltX || 0, tiltY: s.tiltY || 0, twist: s.twist || 0
        };
        if (extra) for (var k in extra) init[k] = extra[k];
        return new PointerEvent(type, init);
    }
    function dispatch(ev) { try { canvas.dispatchEvent(ev); } catch (e) { console.warn('Pen window: dispatch failed', e); } }

    // The main brush ring follows THIS pointer while it is over the surface
    // (31's owner): the mouse crossing the main canvas must not drag the ring
    // back and forth, and must keep its own OS cursor there.
    function setRingOwner(id) {
        if (ownerId === id) return;
        ownerId = id;
        var bc = window.__brushCursor;
        if (bc && typeof bc.setOwner === 'function') bc.setOwner(id);
    }
    function enterCanvas(e) {
        if (hoverInside) return;
        hoverInside = true;
        setRingOwner(ID_OFFSET + (e.pointerId || 0));
        dispatch(synth('pointerenter', e, e, { bubbles: false, button: -1 }));
    }
    function leaveCanvas(e) {
        if (!hoverInside) return;
        hoverInside = false;
        dispatch(synth('pointerleave', e, e, { bubbles: false, button: -1 }));
        setRingOwner(null);
        ringHide();
    }

    // Windows has ONE cursor and a pen moves it on every packet, so while the
    // pen is live the mouse can land on this window by accident (its cursor
    // was just yanked to the pen). Those mouse events are noise here: they
    // would open a second stroke, hop the ring, or dab a dot. Dropped while a
    // pen is held or was seen in the last ~half second.
    function isStrayMouse(e) {
        if (e.pointerType !== 'mouse') return false;
        for (var id in held) if (held[id].type === 'pen') return true;
        return (performance.now() - penActiveTs) < 600;
    }
    function notePen(e) { if (e.pointerType === 'pen') penActiveTs = performance.now(); }

    // ── Popup pointer handlers (the real pen lives here) ─────────────

    function onDown(e) {
        if (e.pointerType === 'touch' || isStrayMouse(e)) return;
        notePen(e);
        lastInputTs = performance.now();
        fit();
        var m = mapPoint(e.clientX, e.clientY);
        if (!m.inside) return;
        try { ui.stage.setPointerCapture(e.pointerId); } catch (_) {}
        if (!held[e.pointerId]) heldCount++;
        held[e.pointerId] = { button: e.button, x: e.clientX, y: e.clientY, type: e.pointerType };
        lastDownTs = performance.now();
        enterCanvas(e);
        dispatch(synth('pointerdown', e, e));
        ringMove(e);
        e.preventDefault();
    }

    function onMove(e) {
        if (e.pointerType === 'touch' || isStrayMouse(e)) return;
        notePen(e);
        lastInputTs = performance.now();
        var h = held[e.pointerId];
        var m = mapPoint(e.clientX, e.clientY);
        if (h && pendingCancel[e.pointerId]) {
            // A cancel came in but the pen is still reporting: pressed = the
            // cancel was a capture hiccup, keep drawing; released = it really
            // ended, close the stroke now.
            if (e.buttons & 1) {
                clearTimeout(pendingCancel[e.pointerId]);
                delete pendingCancel[e.pointerId];
                try { ui.stage.setPointerCapture(e.pointerId); } catch (_) {}
            } else {
                clearTimeout(pendingCancel[e.pointerId]);
                delete pendingCancel[e.pointerId];
                endHeld(e, 'pointerup');
                return;
            }
        }
        if (h) { h.x = e.clientX; h.y = e.clientY; }
        else {
            if (!m.inside) { leaveCanvas(e); return; }
            enterCanvas(e);
        }
        var samples = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
        if (samples && samples.length > 1) {
            if (COALESCED_OK) {
                var list = [];
                for (var i = 0; i < samples.length; i++) list.push(synth('pointermove', e, samples[i], { button: -1 }));
                dispatch(synth('pointermove', e, e, { button: -1, coalescedEvents: list }));
            } else {
                for (var j = 0; j < samples.length; j++) dispatch(synth('pointermove', e, samples[j], { button: -1 }));
            }
        } else {
            dispatch(synth('pointermove', e, e, { button: -1 }));
        }
        ringMove(e);
    }

    // Close a forwarded stroke: pointerup (graceful) or pointercancel.
    function endHeld(e, type) {
        var h = held[e.pointerId];
        if (!h) return;
        delete held[e.pointerId];
        heldCount = Math.max(0, heldCount - 1);
        dispatch(synth(type, e, e));
        try { ui.stage.releasePointerCapture(e.pointerId); } catch (_) {}
        var m = mapPoint(e.clientX, e.clientY);
        if (!m.inside) leaveCanvas(e); else ringMove(e);
    }
    function onUp(e) {
        if (e.pointerType === 'touch' || isStrayMouse(e)) return;
        notePen(e);
        lastInputTs = performance.now();
        var h = held[e.pointerId];
        if (!h) return;   // a press that began outside the canvas box was never forwarded
        if (pendingCancel[e.pointerId]) { clearTimeout(pendingCancel[e.pointerId]); delete pendingCancel[e.pointerId]; }
        if (e.type === 'pointercancel' && h.type === 'pen') {
            // Windows delivers a cancel when the window's mouse capture changes
            // hands (a click in the app) as readily as when the pen leaves —
            // and the pen may still be pressed to the glass. Wait a beat: the
            // next pen report settles it (onMove); silence means it left.
            var pid = e.pointerId, ev = e;
            pendingCancel[pid] = setTimeout(function () {
                delete pendingCancel[pid];
                if (held[pid]) endHeld(ev, 'pointercancel');
            }, 300);
            return;
        }
        endHeld(e, e.type);
    }

    function onLeave(e) {
        if (e.pointerType === 'touch' || isStrayMouse(e)) return;
        if (held[e.pointerId]) return;   // captured: the release will settle it
        leaveCanvas(e);
    }

    function onWheel(e) {
        e.preventDefault();
        if (isStrayMouse(e)) return;
        lastInputTs = performance.now();
        var m = mapPoint(e.clientX, e.clientY);
        if (!m.inside) return;
        try {
            canvas.dispatchEvent(new WheelEvent('wheel', {
                deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
                clientX: m.cx, clientY: m.cy,
                ctrlKey: !!e.ctrlKey, shiftKey: !!e.shiftKey, altKey: !!e.altKey, metaKey: !!e.metaKey,
                bubbles: true, cancelable: true, composed: true, view: window
            }));
        } catch (err) { console.warn('Pen window: wheel dispatch failed', err); }
        ringSync();   // size / angle just changed under the pen: show it now, not a tick later
    }

    function onContextMenu(e) { e.preventDefault(); }

    // Keys typed while the pen window has focus are replayed on this
    // document, so the hotkeys work from the tablet. Toolbar widgets keep
    // their own keys; F11 is the popup's fullscreen toggle; Escape in a
    // browser fullscreen leaves fullscreen and must not also "Stop all" here.
    function onKey(e) {
        var t = e.target;
        var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        if (tag === 'select' || tag === 'input' || tag === 'button' || tag === 'textarea') return;
        if (e.key === 'F11') { if (e.type === 'keydown') toggleFullscreen(); e.preventDefault(); return; }
        if (e.key === 'Escape' && !childWin && pdoc && pdoc.fullscreenElement) return;
        var ok = true;
        try {
            ok = document.body.dispatchEvent(new KeyboardEvent(e.type, {
                key: e.key, code: e.code, location: e.location,
                ctrlKey: !!e.ctrlKey, shiftKey: !!e.shiftKey, altKey: !!e.altKey, metaKey: !!e.metaKey,
                repeat: !!e.repeat, isComposing: !!e.isComposing,
                keyCode: e.keyCode, which: e.which, charCode: e.charCode,
                bubbles: true, cancelable: true, composed: true, view: window
            }));
        } catch (err) { console.warn('Pen window: key dispatch failed', err); }
        // The app handled it, or it is a key whose browser default would
        // fight the surface (scroll, find, reload, menu focus...).
        if (!ok || e.key === ' ' || e.key === 'Tab' || e.key === 'Alt' || e.key === 'Backspace'
            || /^(Arrow|F\d)/.test(e.key) || (e.ctrlKey && !e.altKey)) {
            e.preventDefault();
        }
    }

    // ── Ring: the brush cursor under the pen — 31's ring, drawn here ──
    // Same markup and the same live inputs as js/31-brush-cursor.js (size
    // from SPLAT_RADIUS, the ring colour, the orientation line at
    // BRUSH_ANGLE in the colour about to be painted, the P badge in pressure
    // mode, the size/opacity sliders), read directly rather than copied off
    // the main ring — the main ring only renders while the main canvas is
    // hovered, and a copy could be a frame stale while the angle turns
    // (Shift+Scroll from the tablet). The angle line is the whole point of
    // the ring for a chisel or streak tip: it stays.
    //
    // ALWAYS on. The first cut followed the main window's Show Cursor
    // toggle, so with it off (Focus mode switches it off too) the pen
    // window showed a bare crosshair — "we were hoping to preserve the
    // cursor state in there, so we can still see the angle and next color".
    // Here the ring IS the cursor; the OS arrow stays hidden over the stage
    // whatever the main window does, and the opacity is floored so a ring
    // dialled to invisible on the main screen still reads on the tablet.
    function ringDiameter() {
        var c = window.config || {};
        var rect = canvas.getBoundingClientRect();
        var splatR = (typeof c.SPLAT_RADIUS === 'number' ? c.SPLAT_RADIUS : 0.011) *
                     (typeof c.STAMP_RADIUS_SCALE === 'number' ? c.STAMP_RADIUS_SCALE : 1);
        var scaleIn = document.getElementById('brushCursorScale');
        var frac = scaleIn ? Math.max(0.01, (parseFloat(scaleIn.value) || 25) / 100) : 0.25;
        // 31: visible dab diameter ≈ 2·√SPLAT_RADIUS × CSS height, × ring fraction,
        // floored at 6 px on the main screen — then scaled to the popup's box.
        var dMain = Math.max(6, 2 * Math.sqrt(Math.max(0, splatR)) * rect.height * frac);
        return dMain * (box.h / (rect.height || 1));
    }
    function ringColor() {
        var inp = document.getElementById('brushCursorColor');
        if (inp && /^#[0-9a-fA-F]{6}$/.test(inp.value)) return inp.value;
        try { var s = localStorage.getItem('ui.brushCursorColor'); if (s) return s; } catch (_) {}
        return '#ffffff';
    }
    function ringOpacity() {
        var inp = document.getElementById('brushCursorOpacity');
        if (inp) return Math.max(0, Math.min(1, (parseFloat(inp.value) || 0) / 100));
        try { var o = parseFloat(localStorage.getItem('ui.brushCursorOpacity')); if (isFinite(o)) return o; } catch (_) {}
        return 0.5;
    }
    function paintColorHex() {
        var cp = document.getElementById('colorPicker');
        if (cp && /^#[0-9a-fA-F]{6}$/.test(cp.value)) return cp.value;
        var p = window.pointer;
        if (p && p.color && p.color.length >= 3) {
            var to = function (v) { var h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return h.length === 1 ? '0' + h : h; };
            return '#' + to(p.color[0]) + to(p.color[1]) + to(p.color[2]);
        }
        return '#ff0000';
    }
    function brushAngleDeg() {
        var c = window.config || {};
        return typeof c.BRUSH_ANGLE === 'number' ? c.BRUSH_ANGLE : 0;
    }
    function pressureActive() {
        var c = window.config || {};
        if (c.BRUSH_VELOCITY_ONLY) return true;
        var a = window.multiArmColors;
        return !!(a && a[0] && a[0].push);
    }
    function buildRing() {
        ui.ring.innerHTML =
            '<svg viewBox="-50 -50 100 100" width="100%" height="100%" style="overflow:visible;display:block;">' +
            '<circle cx="0" cy="0" r="47" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="3.2" vector-effect="non-scaling-stroke"/>' +
            '<circle class="pr-ring" cx="0" cy="0" r="47" fill="none" stroke="#ffffff" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
            '<g class="pr-line-group">' +
            '<line x1="-47" y1="0" x2="47" y2="0" stroke="rgba(0,0,0,0.55)" stroke-width="3.4" vector-effect="non-scaling-stroke" stroke-linecap="round"/>' +
            '<line class="pr-line" x1="-47" y1="0" x2="47" y2="0" stroke="#ff0000" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linecap="round"/>' +
            '</g>' +
            '<circle class="pr-dot" cx="0" cy="0" r="1.4" fill="#ffffff" stroke="rgba(0,0,0,0.55)" stroke-width="0.8" vector-effect="non-scaling-stroke"/>' +
            '</svg>' +
            '<div class="pr-p" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;' +
            'font:700 11px system-ui,sans-serif;color:#fff;line-height:1;' +
            'text-shadow:0 0 3px rgba(0,0,0,0.9),0 1px 1px rgba(0,0,0,0.85);user-select:none;">P</div>';
        ui.ringParts = {
            ring: ui.ring.querySelector('.pr-ring'),
            lineGroup: ui.ring.querySelector('.pr-line-group'),
            line: ui.ring.querySelector('.pr-line'),
            dot: ui.ring.querySelector('.pr-dot'),
            p: ui.ring.querySelector('.pr-p')
        };
    }
    // The look of the ring — size, colours, angle line, P badge, opacity —
    // re-read from the live inputs and written to the DOM only when
    // something changed. Runs on every pen move AND on a 30 Hz timer while
    // the ring is showing: the main ring re-renders every frame it is
    // visible, and an angle turned with Shift+Scroll on the main window,
    // a brush-size change, or the next colour advancing after a stroke all
    // have to show on the tablet while the pen sits still ("make sure the
    // angle updates on change for the popout area").
    var ringState = null;
    var ringTimer = 0;
    function ringSync() {
        if (!ui || ui.ring.style.display !== 'block') return;
        if (!ui.ringParts) buildRing();
        var P = ui.ringParts;
        var pOn = pressureActive();
        var next = {
            d: Math.round(ringDiameter() * 100) / 100,
            opacity: Math.max(0.35, ringOpacity()),
            ring: ringColor(),
            pOn: pOn,
            line: pOn ? null : paintColorHex(),
            angle: pOn ? null : brushAngleDeg()
        };
        var s = ringState;
        if (!s || s.d !== next.d) { ui.ring.style.width = next.d + 'px'; ui.ring.style.height = next.d + 'px'; }
        if (!s || s.opacity !== next.opacity) ui.ring.style.opacity = String(next.opacity);
        if (!s || s.ring !== next.ring) P.ring.setAttribute('stroke', next.ring);
        if (!s || s.pOn !== next.pOn) {
            P.p.style.display = pOn ? 'block' : 'none';
            P.dot.style.display = pOn ? 'none' : '';
            P.lineGroup.style.display = pOn ? 'none' : '';
        }
        if (!pOn) {
            if (!s || s.line !== next.line) P.line.setAttribute('stroke', next.line);
            // SVG rotate() is clockwise in screen space, the same sense the
            // shader turns the stamp — the line and the painted streak agree.
            if (!s || s.angle !== next.angle) P.lineGroup.setAttribute('transform', 'rotate(' + next.angle + ')');
        }
        ringState = next;
    }
    function ringMove(e) {
        if (!ui) return;
        if (!ui.ringParts) buildRing();
        ui.ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) translate(-50%,-50%)';
        if (ui.ring.style.display !== 'block') {
            ui.ring.style.display = 'block';
            ringState = null;              // full write on (re)appearance
            clearInterval(ringTimer);
            ringTimer = setInterval(ringSync, 33);
        }
        ringSync();
    }
    function ringHide() {
        if (!ui) return;
        ui.ring.style.display = 'none';
        clearInterval(ringTimer); ringTimer = 0;
    }

    // ── Toolbar auto-hide ────────────────────────────────────────────

    function showBar() {
        if (!ui) return;
        ui.bar.classList.remove('idle');
        clearTimeout(barTimer);
        barTimer = setTimeout(function () { if (ui) ui.bar.classList.add('idle'); }, BAR_LINGER);
    }
    function onBarTrack(e) {
        if (!ui) return;
        if (e.clientY <= BAR_ZONE || (e.target && ui.bar.contains(e.target))) showBar();
    }
    function setStatus(text) { if (ui) ui.status.textContent = text; }

    // ── Mirror: one GPU blit per redraw, at a rate that follows the pen ──

    function stopMirror() {
        clearTimeout(mirrorTimer); mirrorTimer = 0;
        mirrorCtx = null;
    }
    // Backing store ≤ maxW wide at the box's aspect; CSS stretches it to
    // the box. Re-run by fit() — only touches the canvas when it changes
    // (setting width/height clears it).
    function sizeMirror() {
        if (!ui || !mirrorCtx) return;
        var spec = MIRROR_MODES[mirrorMode()];
        if (!spec) return;
        var w = Math.max(16, Math.min(box.w, spec.maxW));
        var h = Math.max(9, Math.round(w * box.h / Math.max(1, box.w)));
        if (ui.mirror.width !== w || ui.mirror.height !== h) {
            ui.mirror.width = w;
            ui.mirror.height = h;
            drawMirror();
        }
    }
    function drawMirror() {
        if (!ui || !mirrorCtx || !pdoc) return false;
        if (pdoc.visibilityState !== 'visible') return false;   // minimised / covered: nothing to see
        var t0 = performance.now();
        try {
            mirrorCtx.drawImage(canvas, 0, 0, ui.mirror.width, ui.mirror.height);
        } catch (e) {
            console.warn('Pen window: mirror draw failed:', e);
            stopMirror();
            ui.mirror.hidden = true;
            ui.blank.hidden = false;
            setStatus('Mirror unavailable here — watch your main monitor.');
            return false;
        }
        var dt = performance.now() - t0;
        mirrorStats.draws++;
        mirrorStats.drawMs = mirrorStats.draws === 1 ? dt : mirrorStats.drawMs * 0.9 + dt * 0.1;
        return true;
    }
    function mirrorTick() {
        mirrorTimer = 0;
        if (!ui || !mirrorCtx) return;
        var spec = MIRROR_MODES[mirrorMode()];
        if (!spec) return;
        var active = heldCount > 0 || (performance.now() - lastInputTs) < ACTIVE_WINDOW_MS;
        var rate = active ? spec.active : spec.idle;
        mirrorStats.lastRate = rate;
        drawMirror();
        mirrorTimer = setTimeout(mirrorTick, 1000 / rate);
    }
    function startMirror() {
        stopMirror();
        if (!ui) return;
        var mode = mirrorMode();
        var spec = MIRROR_MODES[mode];
        ui.mirrorBtn.textContent = 'Mirror: ' + mode.charAt(0).toUpperCase() + mode.slice(1);
        if (!spec) {
            ui.mirror.hidden = true;
            ui.blank.hidden = false;
            setStatus('Mirror off — watch your main monitor.');
            return;
        }
        try {
            // Opaque: the compositor never has to blend it.
            mirrorCtx = ui.mirror.getContext('2d', { alpha: false });
            if (!mirrorCtx) throw new Error('no 2d context');
        } catch (e) {
            console.warn('Pen window: mirror unavailable:', e);
            ui.mirror.hidden = true;
            ui.blank.hidden = false;
            setStatus('Mirror unavailable here — watch your main monitor.');
            return;
        }
        ui.mirror.hidden = false;
        ui.blank.hidden = true;
        sizeMirror();
        mirrorTick();
        setStatus(spec.label + ' — the paint lands on your main monitor.');
    }

    // ── Open / close ─────────────────────────────────────────────────

    function isOpen() { return !!(pop && !pop.closed); }

    function open() {
        if (isOpen()) { try { pop.focus(); } catch (_) {} return true; }
        var place = isElectron ? electronPlacement() : webPlacement();
        var w = null;
        try { w = window.open('', FRAME_NAME, featureString(place)); } catch (e) { console.warn('Pen window: open failed', e); }
        if (!w) {
            setHint('The window was blocked. Allow pop-ups for this site and try again.');
            return false;
        }
        pop = w;
        try {
            pdoc = pop.document;
            pdoc.open();
            pdoc.write(popupHtml());
            pdoc.close();
        } catch (e) {
            console.warn('Pen window: could not write the window', e);
            try { pop.close(); } catch (_) {}
            pop = null; pdoc = null;
            setHint('The window could not be prepared (' + (e && e.message || e) + ').');
            return false;
        }
        ui = {
            stage: pdoc.getElementById('stage'),
            box: pdoc.getElementById('box'),
            mirror: pdoc.getElementById('mirror'),
            blank: pdoc.getElementById('blank'),
            ring: pdoc.getElementById('ring'),
            bar: pdoc.getElementById('bar'),
            status: pdoc.getElementById('status'),
            mirrorBtn: pdoc.getElementById('mirrorBtn'),
            fsBtn: pdoc.getElementById('fsBtn'),
            screenBtn: pdoc.getElementById('screenBtn'),
            closeBtn: pdoc.getElementById('closeBtn'),
            ringParts: null
        };
        held = {}; heldCount = 0; hoverInside = false;

        // Our functions, its elements: one process, one thread, no bridge.
        var st = ui.stage;
        st.addEventListener('pointerdown', onDown);
        st.addEventListener('pointermove', onMove);
        st.addEventListener('pointerup', onUp);
        st.addEventListener('pointercancel', onUp);
        st.addEventListener('pointerleave', onLeave);
        st.addEventListener('wheel', onWheel, { passive: false });
        st.addEventListener('contextmenu', onContextMenu);
        st.addEventListener('dragstart', function (e) { e.preventDefault(); });
        pdoc.addEventListener('keydown', onKey);
        pdoc.addEventListener('keyup', onKey);
        pdoc.addEventListener('pointermove', onBarTrack);
        pdoc.addEventListener('fullscreenchange', function () { syncFsButton(); fit(); });
        pop.addEventListener('resize', fit);
        pop.addEventListener('pagehide', function () { cleanup('closed'); });
        ui.fsBtn.addEventListener('click', function () { toggleFullscreen(); ui.fsBtn.blur(); });
        ui.screenBtn.addEventListener('click', function () { cycleScreen(); ui.screenBtn.blur(); });
        ui.closeBtn.addEventListener('click', function () { close(); });
        ui.mirrorBtn.addEventListener('click', function () {
            var order = ['light', 'smooth', 'off'];
            var next = order[(order.indexOf(mirrorMode()) + 1) % order.length];
            var sel = mirrorSelect();
            if (sel) {
                sel.value = next;
                sel.dispatchEvent(new Event('change', { bubbles: true }));   // saves + restarts the mirror
            } else {
                startMirror();
            }
        });

        if (isElectron) {
            // The BrowserWindow exists by the time window.open returns.
            childWin = findChildWindow();
            if (place && place.id != null) saveScreenId(place.id);
        }
        fit();
        startMirror();
        syncFsButton();
        syncScreenRadios();
        showBar();
        clearInterval(fitTimer);
        fitTimer = setInterval(fit, 1000);          // canvas aspect can change under us (resize, zoom view)
        clearInterval(pollTimer);
        // pagehide is the real close signal; this is the backstop.
        pollTimer = setInterval(function () { if (!pop || pop.closed) cleanup('closed'); }, 1500);
        placeAfterOpen();
        syncButton();
        if (place && place.fullscreen) {
            setStatus('Fullscreen on ' + (place.label || 'your other screen') + ' — draw here. Screen ▸ moves it, F11 leaves fullscreen.');
            setHint('Open on ' + (place.label || 'your other screen') + '. Wrong screen? Pick another below and it moves at once.');
        } else if (place && place.sameScreen) {
            setHint('Opened as a window on this screen (your choice below). Pick another screen there to send it over.');
        } else if (!place) {
            setHint(isElectron
                ? 'Only one display found — the window opened here. Plug in the pen display and reopen, or drag it over.'
                : 'Drag the window onto your pen display (or press Screen ▸ in it) and press Fullscreen there.');
        }
        return true;
    }

    // End every forwarded stroke gracefully (a pointerup at its last point,
    // never a hard abort), drop the mirror, close the window, reset.
    function cleanup(reason) {
        clearInterval(fitTimer); fitTimer = 0;
        clearInterval(pollTimer); pollTimer = 0;
        clearTimeout(barTimer); barTimer = 0;
        for (var id in held) {
            var h = held[id];
            var m = mapPoint(h.x, h.y);
            try {
                canvas.dispatchEvent(new PointerEvent('pointerup', {
                    bubbles: true, cancelable: true, composed: true, view: window,
                    clientX: m.cx, clientY: m.cy, button: h.button, buttons: 0,
                    pointerId: ID_OFFSET + Number(id), pointerType: h.type || 'pen', isPrimary: true, pressure: 0
                }));
            } catch (_) {}
        }
        held = {}; heldCount = 0;
        for (var pc in pendingCancel) clearTimeout(pendingCancel[pc]);
        pendingCancel = {};
        if (hoverInside) {
            hoverInside = false;
            try { canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerId: ownerId || ID_OFFSET, pointerType: 'pen' })); } catch (_) {}
        }
        setRingOwner(null);
        stopMirror();
        clearInterval(ringTimer); ringTimer = 0; ringState = null;
        var w = pop;
        pop = null; pdoc = null; ui = null; childWin = null;
        if (w && !w.closed && reason !== 'closed') { try { w.close(); } catch (_) {} }
        syncButton();
        syncScreenRadios();
    }
    function close() { cleanup('close'); }
    function toggle() { if (isOpen()) close(); else open(); }

    // ── Sidebar controls ─────────────────────────────────────────────

    function button() { return document.getElementById('penWindowBtn'); }
    function hintEl() { return document.getElementById('penWindowHint'); }
    var DEFAULT_HINT = 'A second window for your pen display. Drag it there, press Fullscreen, draw — the paint stays on this monitor.';
    function setHint(text) { var h = hintEl(); if (h) h.textContent = text; }
    function syncButton() {
        var b = button();
        if (b) {
            b.textContent = isOpen() ? 'Close Pen Input Window' : 'Pop Out Pen Input';
            b.classList.toggle('active', isOpen());
        }
        if (!isOpen()) setHint(DEFAULT_HINT);
    }

    // While a forwarded stroke is live, a blur of THIS window (the popup
    // taking focus) must not reach 05d's hard abort. Capture phase at the
    // target runs before 05d's bubble-phase listener.
    window.addEventListener('blur', function (e) {
        if (!isOpen()) return;
        if (heldCount > 0 || (performance.now() - lastDownTs) < 500) e.stopImmediatePropagation();
    }, true);

    // The popup dies with us (a stranded fullscreen window on the tablet
    // with nothing behind it is the worst possible leftover).
    window.addEventListener('pagehide', function () { if (isOpen()) { try { pop.close(); } catch (_) {} } });

    function init() {
        loadMirrorSetting();
        var b = button();
        if (b) b.addEventListener('click', function () { toggle(); });
        var sel = mirrorSelect();
        if (sel) sel.addEventListener('change', function () { saveMirrorSetting(); if (isOpen()) startMirror(); });
        syncButton();
        buildScreenRadios();
        primeScreenDetails();
    }

    window.PenWindow = {
        open: open,
        close: close,
        toggle: toggle,
        isOpen: isOpen,
        setFullscreen: setFullscreen,
        cycleScreen: cycleScreen,
        refreshScreens: buildScreenRadios,
        __state: function () {
            var spec = MIRROR_MODES[mirrorMode()];
            return {
                open: isOpen(), box: box, heldCount: heldCount, hoverInside: hoverInside,
                ringOwner: ownerId, pendingCancels: Object.keys(pendingCancel).length,
                coalescedOK: COALESCED_OK, childWin: !!childWin, electron: isElectron,
                mirror: {
                    mode: mirrorMode(), running: !!mirrorCtx,
                    activeFps: spec ? spec.active : 0, idleFps: spec ? spec.idle : 0,
                    rate: mirrorStats.lastRate, draws: mirrorStats.draws,
                    drawMs: Math.round(mirrorStats.drawMs * 1000) / 1000,
                    backing: ui ? [ui.mirror.width, ui.mirror.height] : null
                }
            };
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
