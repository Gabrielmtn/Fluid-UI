// ═══════════════════════════════════════════════════════════════════
// js/00a-boot.js — launch choreography: invisible boot, one window fade.
// LOAD ORDER: FIRST script in index.html, inside <head> and ABOVE the
//   stylesheet links — the boot classes must be on <html> before the first
//   style resolution, and the boot cursor has to be up before anything
//   else. Touches only documentElement + its own <style>, so it must never
//   assume <body> exists.
// PROVIDES: window.Boot — readiness gates, reveal callbacks, the boot
//   cursor, and the IPC handshake with electron-main.js.
//
// WHY: the desktop build used to maximize()+show() on 'ready-to-show',
// which is three pops in a row — a 1400x900 window appears, snaps to the
// work area, then the splash plays and the panels slide in, all while the
// shaders are still compiling. Now electron-main creates the window at
// native opacity ~0 and maximizes it BEFORE loading the page, so every
// heavy init runs at the FINAL layout size with nothing on screen but the
// OS busy cursor. Once the last gate clears and the layout has gone
// quiet, main ramps the window's opacity up to 1. Nothing inside the
// window moves during that ramp: the app is already running when it
// materializes.
//
// WEB BUILD: there is no window to fade. usesWindowFade is false, no boot
// class or cursor is installed, and the existing splash/progress/stagger
// entrance in 20-mixer-layout.js runs exactly as before.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var root = document.documentElement;
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    var T0 = now();
    function log(msg) { try { console.log('[boot] ' + msg + ' @' + Math.round(now() - T0) + 'ms'); } catch (_) {} }

    // ipcRenderer is the whole test: it exists only in the Electron renderer,
    // and only a main process that speaks the handshake below can fade a
    // window. Anything else (web, a preview shell) takes the legacy path.
    var ipc = null;
    try { if (typeof require === 'function') ipc = require('electron').ipcRenderer; } catch (_) { ipc = null; }
    var usesWindowFade = !!ipc;

    // ── Tunables ──────────────────────────────────────────────────────
    // TITLE_CARD false = the finished, running app is what fades up out of
    // the desktop. true = keep the branded splash as a title card that
    // rides in with the window and then dissolves off the running app.
    // Nothing else differs between the two.
    var TITLE_CARD = false;
    var TITLE_HOLD_MS = 420;   // title-card dwell after the window has landed
    var QUIET_FRAMES = 5;      // identical layout samples that mean "settled"
    var QUIET_MAX_MS = 1500;   // ...but never wait longer than this for quiet
    var WATCHDOG_MS = 9000;    // a boot that never signals still has to appear
    var REPLY_MS = 2000;       // main answers 'boot-ready' far inside this
    var fadeMs = 420;          // real value arrives from main on 'boot-reveal'

    // ══ Readiness gates ═══════════════════════════════════════════════
    // Each is cleared from the chunk that owns the milestone:
    //   scripts — the async chunk loader in index.html finished
    //   layout  — 20-mixer-layout.js has built the strip + sidebar
    //   frame   — 05j-update-loop.js has fully drawn one frame (so the GL
    //             context, the programs and every FBO are real)
    var gates = { scripts: false, layout: false, frame: false };
    var pending = 3;

    function done(name) {
        if (!Object.prototype.hasOwnProperty.call(gates, name) || gates[name]) return;
        gates[name] = true;
        pending--;
        log('gate "' + name + '" cleared, ' + pending + ' left');
        if (pending === 0) settle();
    }

    // ══ Settling ══════════════════════════════════════════════════════
    // The gates are not the end of the movement: the sidebar mounts, the
    // ResizeObserver in 01-config.js re-fits the canvas 80ms later, the
    // quality underbar measures itself. Rather than gate on each of those,
    // wait for the frame to stop CHANGING SHAPE — QUIET_FRAMES identical
    // samples in a row. That catches every late shifter, including ones
    // added long after this file.
    var settling = false;
    function settle() {
        if (settling || asked) return;
        settling = true;
        // A late-loading font would reflow the UI after everything else is
        // "done". No webfonts ship today, but this costs nothing and means a
        // future one cannot punch a hole through the fade.
        var fired = false;
        var go = function () { if (!fired) { fired = true; watchQuiet(); } };
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
            document.fonts.ready.then(go, go);
            setTimeout(go, 800);
        } else { go(); }
    }

    function signature() {
        var parts = [root.clientWidth, root.clientHeight];
        var ids = ['canvas-wrapper', 'mixer-strip', 'sidebar-right', 'canvas-area'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (!el) { parts.push('-'); continue; }
            var r = el.getBoundingClientRect();
            parts.push(Math.round(r.left) + ',' + Math.round(r.top) + ',' +
                       Math.round(r.width) + ',' + Math.round(r.height));
        }
        return parts.join('|');
    }

    function watchQuiet() {
        var stable = 0, last = null, t0 = now();
        (function tick() {
            if (asked) return;
            var sig = signature();
            if (sig === last) stable++; else { stable = 0; last = sig; }
            if (stable >= QUIET_FRAMES) return ask('settled');
            if (now() - t0 > QUIET_MAX_MS) return ask('settle-timeout');
            requestAnimationFrame(tick);
        })();
    }

    // ══ Reveal ════════════════════════════════════════════════════════
    // Two steps, because the window fade lives in the main process: ask()
    // says "we are ready", enter() runs the in-window half once main has
    // actually started the ramp.
    var asked = false;    // we have told main we are ready
    var entered = false;  // the in-window entrance has started
    var revealCbs = [];

    function ask(reason) {
        if (asked) return;
        asked = true;
        clearTimeout(watchdog);
        log('ready (' + reason + ')');
        if (ipc) {
            ipc.send('boot-ready');
            // Never let a dropped message strand the app behind a black
            // screen — come up on our own if main goes quiet.
            setTimeout(function () {
                if (!entered) { log('main never answered — entering anyway'); enter(); }
            }, REPLY_MS);
        } else {
            fadeMs = 0;
            enter();
        }
    }

    function enter() {
        if (entered) return;
        entered = true;
        stopCursor();
        driveFade();
        root.classList.remove('booting');
        var info = { fadeMs: fadeMs, titleHoldMs: TITLE_HOLD_MS, titleCard: TITLE_CARD };
        log('revealing (fade ' + fadeMs + 'ms)');
        var cbs = revealCbs.splice(0);
        for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](info); } catch (e) { console.warn('[boot] reveal callback failed', e); }
        }
    }

    if (ipc) {
        ipc.on('boot-reveal', function (_evt, info) {
            if (info && typeof info.fadeMs === 'number') fadeMs = info.fadeMs;
            enter();
        });
    }

    // The window's opacity ramp lives in the main process, but its PACING has
    // to come from here. A main-process timer cannot pace it: Windows' default
    // timer granularity is 15.6ms, so a setInterval asking for one 60Hz frame
    // (16.7ms) rounds up and actually fires at ~31ms — measured, the fade held
    // every value for two display frames, which is the judder. rAF is
    // phase-locked to the display, so this sends exactly one step per rendered
    // frame, in sympathy with the canvas being revealed underneath it.
    function driveFade() {
        if (!ipc || !(fadeMs > 0)) return;
        var f0 = now();
        (function step() {
            var t = Math.min(1, (now() - f0) / fadeMs);
            try { ipc.send('boot-fade-step', t); } catch (_) {}
            if (t < 1) requestAnimationFrame(step);
        })();
    }

    // Backstop for a boot that never clears its gates at all (a chunk that
    // throws, a GL context that never produces a frame). main has its own,
    // slightly longer, so normally this one is what fires first.
    var watchdog = setTimeout(function () { ask('watchdog'); }, WATCHDOG_MS);

    // ══ Boot cursor ═══════════════════════════════════════════════════
    // The window is invisible for the whole load, so the CURSOR is the only
    // feedback there is — and it is the OS busy cursor, deliberately.
    //
    // A custom animated cursor was built and measured here first, and it
    // cannot be made smooth. Two reasons, neither of them tunable:
    //   1. A page's cursor is only re-evaluated when the renderer services a
    //      MOUSE-MOVE HIT TEST. The animation is therefore driven by input,
    //      not by time — park the pointer and it stops dead (measured: zero
    //      custom frames in six seconds of a parked mouse).
    //   2. That renderer is the same thread running the boot, so during the
    //      load it services those hit tests rarely. Measured with a hand
    //      moving at 60Hz: ~3.5 frames per second until the load finished,
    //      then a clean 50ms cadence the instant the thread freed up — i.e.
    //      it was smooth exactly when it was no longer needed. Every frame
    //      change also flashed the system arrow in between.
    // Scheduling changes (rAF, time-derived frame index, slower cadence) all
    // miss the point: the channel is wrong, not the pacing.
    //
    // So the cursor is a STILL, and stillness is the point: one frame of the
    // real sim (assets/boot-cursor.png, lifted out of the baked loop by
    // scripts/bake-boot-swirl.js) cannot judder, because nothing about it
    // changes. It is the app's own fluid rather than a stock Windows spinner,
    // and it costs exactly one image load.
    //
    // `progress` is the fallback, which Chromium uses until the PNG has
    // decoded — so the OS busy cursor covers the first instants and then the
    // orb takes over. assets/boot-swirl/ keeps the full 48-frame loop for a
    // future loader that has its own idle renderer to animate it in.
    //
    // Set on a dedicated top-most veil rather than on <html>: the cursor
    // property inherits, so a rule on <html> looks like it should be enough —
    // it is not. Measured, the element actually under the pointer during boot
    // carries its own cursor, which beats anything inherited.
    var CUR_SRC = 'assets/boot-cursor.png', CUR_HOT = 64;
    var curVeil = null;

    function startCursor() {
        // Decode it up front so the handover from the `progress` fallback
        // happens once, early, rather than the first time the pointer moves.
        try { (new Image()).src = CUR_SRC; } catch (_) {}

        // Transparent, covers the window, sits above everything. The window is
        // invisible while this exists, so it costs nothing visually — and it
        // is removed at the reveal, before there is anything for it to
        // swallow.
        curVeil = document.createElement('div');
        curVeil.id = 'boot-veil';
        curVeil.style.cssText = 'position:fixed;inset:0;z-index:2147483647;' +
            'background:transparent;cursor:url("' + CUR_SRC + '") ' +
            CUR_HOT + ' ' + CUR_HOT + ', progress';
        (document.body || root).appendChild(curVeil);
        // Built in <head>, so <body> does not exist yet — re-home it once the
        // parser has made one, or a stray element outside <body> outlives us.
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', function () {
                if (curVeil && document.body) document.body.appendChild(curVeil);
            });
        }
    }

    function stopCursor() {
        if (curVeil && curVeil.parentNode) curVeil.parentNode.removeChild(curVeil);
        curVeil = null;
    }

    // ══ Public surface ════════════════════════════════════════════════
    window.Boot = {
        usesWindowFade: usesWindowFade,
        titleCard: TITLE_CARD,
        done: done,
        // Run fn when the window starts fading in. Late registrations run
        // immediately, so a chunk that loads after the reveal still works.
        onReveal: function (fn) {
            if (typeof fn !== 'function') return;
            if (entered) {
                try { fn({ fadeMs: fadeMs, titleHoldMs: TITLE_HOLD_MS, titleCard: TITLE_CARD }); }
                catch (e) { console.warn('[boot] reveal callback failed', e); }
                return;
            }
            revealCbs.push(fn);
        },
        // Run fn delayMs AFTER the fade has finished — for anything that
        // wants the user's attention (first-run hint, restore prompt), which
        // must never burn its dwell behind an invisible window.
        afterReveal: function (fn, delayMs) {
            window.Boot.onReveal(function (info) {
                setTimeout(fn, (info.fadeMs || 0) + (delayMs || 0));
            });
        },
        // Escape hatch for a boot that cannot finish (the fatal-GPU screen):
        // show the window now rather than leave the user staring at nothing.
        revealNow: function (reason) { ask(reason || 'forced'); },
        state: function () {
            return {
                gates: gates, asked: asked, entered: entered,
                fadeMs: fadeMs, elapsed: Math.round(now() - T0)
            };
        }
    };

    // Only the desktop build hides itself, so only it needs the boot skin.
    if (usesWindowFade) {
        root.classList.add('boot-fade', 'booting');
        if (!TITLE_CARD) root.classList.add('boot-no-title');
        startCursor();
        log('window-fade launch armed');
    }
})();
