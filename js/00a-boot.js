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
    //
    // Except on the one launch that shows the photosensitivity warning: that
    // dialog is a safety gate, it paints over everything, and measured, the
    // card does not lose to it cleanly — it ghosts through the scrim as a
    // grey smudge behind the dialog, which is worse than not showing it at
    // all. So the card stands down for that run and plays clean on every
    // one after. Same key the dialog reads (index.html); this file runs
    // first, so the decision can be made here before anything paints.
    //
    // RESOLVED LAZILY, and that is not a micro-optimisation. This is the
    // first localStorage read of the process, and the first one costs ~714ms
    // — measured, on this machine: the storage service starting, with the
    // main thread gone for all of it. Reading it here, eagerly, meant the
    // boot veil did not exist until 811ms into a ~2s boot, so the OS busy
    // cursor owned the first third of every launch. Nothing needs this answer
    // until the reveal, so nothing asks for it until then.
    var TITLE_CARD = null;
    function titleCard() {
        if (TITLE_CARD !== null) return TITLE_CARD;
        TITLE_CARD = true;
        try {
            if (localStorage.getItem('fluidui.photoWarn.ack.v1') !== '1') TITLE_CARD = false;
        } catch (_) { /* no storage — leave the card on */ }
        return TITLE_CARD;
    }
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

    // Belt and braces for a reveal that arrives EARLY. Dropping the splash is
    // normally 20-mixer-layout.js's job, done as part of the layout pass — but
    // the watchdog reveals at 9s whether that pass ever ran or not, and a card
    // nobody asked for would then ghost up through the fade and be yanked a
    // moment later. That flicker is the whole thing this file exists to
    // prevent. With no title card, nothing is on screen at the reveal but the
    // app.
    function dropSplashIfNoCard() {
        if (titleCard()) return;
        var s = document.getElementById('splash-screen');
        if (s && s.parentNode) s.parentNode.removeChild(s);
    }

    // ══ Title card ════════════════════════════════════════════════════
    // The card's words come up on the SAME rAF that paces the window's alpha
    // (driveFade, below) rather than on a CSS transition. A transition would
    // be right in every way but one: opacity transitions run on the
    // COMPOSITOR, and the main thread is at its busiest on this exact frame —
    // so the words would fade on their own clock while the window they are
    // painted on stalled on ours. Measured across launches, the two drifted
    // apart by most of a second. Driven from here they cannot come apart:
    // one frame produces both.
    //
    // They sit at opacity 0 in the style ATTRIBUTE (index.html), so nothing
    // is on screen before this runs, whatever order the stylesheets landed
    // in. Each has its own resting value — the version label is meant to be
    // dim.
    //
    // Note the two ramps COMPOUND: what the eye gets is the window's alpha
    // times this one, so the words settle onto the card just after the card
    // itself has substance. That is the intended reading, and it is why this
    // ramp is linear while the window's is a smoothstep.
    var CARD_RESTING = [
        ['.splash-title', 1],
        ['.splash-subtitle', 1],
        ['.splash-version', 0.45]
    ];
    var cardEls = null;

    function paintCard(t) {
        if (!titleCard()) return;
        if (!cardEls) {
            cardEls = [];
            for (var j = 0; j < CARD_RESTING.length; j++) {
                var el = document.querySelector(CARD_RESTING[j][0]);
                if (el) cardEls.push([el, CARD_RESTING[j][1]]);
            }
        }
        for (var i = 0; i < cardEls.length; i++) {
            cardEls[i][0].style.opacity = String(cardEls[i][1] * t);
        }
    }

    function enter() {
        if (entered) return;
        entered = true;
        stopCursor();
        dropSplashIfNoCard();
        // A launch with no ramp to ride (fade disabled, main gone) still
        // has to show the card rather than leave it sitting at zero.
        if (!driveFade()) paintCard(1);
        root.classList.remove('booting');
        var info = { fadeMs: fadeMs, titleHoldMs: TITLE_HOLD_MS, titleCard: titleCard() };
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
        if (!ipc || !(fadeMs > 0)) return false;
        var f0 = now();
        (function step() {
            var t = Math.min(1, (now() - f0) / fadeMs);
            try { ipc.send('boot-fade-step', t); } catch (_) {}
            paintCard(t);
            if (t < 1) requestAnimationFrame(step);
        })();
        return true;
    }

    // Backstop for a boot that never clears its gates at all (a chunk that
    // throws, a GL context that never produces a frame). main has its own,
    // slightly longer, so normally this one is what fires first.
    var watchdog = setTimeout(function () { ask('watchdog'); }, WATCHDOG_MS);

    // ══ Boot cursor ═══════════════════════════════════════════════════
    // The window is invisible for the whole load, so the CURSOR is the only
    // feedback there is. It is the app's own fluid — one frame of the real sim
    // (assets/boot-cursor.png, lifted out of the baked loop by
    // scripts/bake-boot-swirl.js) — and it is a STILL, set once and never
    // reassigned.
    //
    // IT IS STILL BECAUSE A CSS CURSOR CANNOT CHANGE WITHOUT FLASHING. That is
    // measured, not assumed: a Win32 GetCursorInfo trace over a real boot,
    // sampling on every change while the pointer was moved at ~60Hz, caught
    // the system ARROW on screen for 1–4ms before EVERY switch —
    //
    //     t= 985ms  OURS(1074925543)      the orb
    //     t=1210ms  ARROW                 ← flash
    //     t=1213ms  OURS(12521985)        next state
    //     t=2003ms  ARROW                 ← flash
    //     t=2004ms  OURS(1006374615)      next state
    //
    // — and note the handles: every switch mints a NEW HCURSOR, including one
    // back to a state already shown moments earlier (574098955, where the same
    // art had been 1074925543). Chromium caches no cursor bitmap, so the gap
    // where the platform default shows through is structural. A fallback chain
    // does not help; the arrow is not the chain resolving, it is Blink dropping
    // to the default while it rebuilds. Warming every image with decode() does
    // not help either — the second showing flashed exactly like the first.
    //
    // So zero flashes is reachable only at ZERO CHANGES. There is exactly one
    // handover here, `progress` → the orb, and it lands ON a system cursor
    // where the 2ms of arrow is invisible; a switch between two of OUR cursors
    // is what the eye catches, because everything around it is steady.
    //
    // THINGS THAT DO NOT FIX THIS, all tried and measured (2026-08-18,
    // 2026-08-23 twice): a slower cadence; rAF; a clock-derived frame index;
    // driving the steps off real load progress instead of a timer (the flash
    // is per-CHANGE, so it does not care what causes the change); a fallback
    // chain naming every sibling state; pre-decoding every frame. The channel
    // is wrong, not the pacing — a page cursor is also only re-evaluated when
    // the renderer services a mouse-move hit test, and during a load that
    // renderer delivers ~3.5 of those per second.
    //
    // A MOVING LOADER NEEDS ITS OWN RENDERER. Measured: a second BrowserWindow
    // on its own `partition` gets its own process and held a 16.7ms median —
    // 7 frames over 33ms out of 470 — straight through this window's boot.
    // assets/boot-swirl/ keeps the full 48-frame loop for exactly that. It is
    // the only way a smooth loader is happening here, and it is not the cursor.
    //
    // `progress` is the fallback, which Chromium wears until the PNG has
    // decoded — the OS busy cursor covers the first instants and then the orb
    // takes over, once. The decode is kicked off before the veil exists so the
    // handover happens early rather than on the first pointer move.
    //
    // Carried by a stylesheet that names `*`, never by an element over the
    // app: the cursor property inherits, so a rule on <html> alone looks like
    // it should be enough — measured, it is not, because whatever sits under
    // the pointer during boot carries its own. See startCursor() for why this
    // must not be an element.
    // NO RING, and that is the point. A ring carrying a progress arc would be
    // a lie — nothing can animate it, see above — and a ring WITHOUT one reads
    // as a spinner that is broken: "a single frame where the spinner is empty"
    // was the verdict when it shipped that way. A plain orb promises nothing
    // it cannot deliver. A loading indicator with real motion needs its own
    // renderer and its own surface; it is not this.
    var CUR_SRC = 'assets/boot-cursor.png';
    var CUR_HOT = 64;         // orb centre — the source frame's own hotspot
    var curStyle = null;

    function startCursor() {
        // Decode it up front so the handover from the `progress` fallback
        // happens once, early, rather than the first time the pointer moves.
        try { (new Image()).src = CUR_SRC; } catch (_) {}

        // A STYLESHEET, NOT AN ELEMENT — this is the important part, and it is
        // the second time this bit has cost real debugging. The obvious build
        // is a transparent full-window veil that carries the cursor, and it
        // works right up until it does not get removed: a `position:fixed;
        // inset:0` node at the top of the z-order swallows every pointer event
        // in the app, so one missed teardown turns the whole canvas dead. It
        // did, twice. `pointer-events:none` is not a fix either — an element
        // that is not hit-tested does not supply a cursor.
        //
        // So nothing goes over the app at all. The rule has to name `*`
        // because cursor INHERITANCE loses to any element that sets its own
        // (measured — a rule on <html> alone is not enough during boot), and
        // it hangs off `.booting`, which enter() drops at the reveal. That is
        // belt AND braces: even if this node were somehow left behind, the
        // class going away already stops it applying, and either way there is
        // no hit-test target to block anything.
        curStyle = document.createElement('style');
        curStyle.id = 'boot-cursor-style';
        curStyle.textContent = 'html.booting, html.booting * { cursor: url("' +
            CUR_SRC + '") ' + CUR_HOT + ' ' + CUR_HOT + ', progress !important; }';
        (document.head || root).appendChild(curStyle);
    }

    function stopCursor() {
        if (curStyle && curStyle.parentNode) curStyle.parentNode.removeChild(curStyle);
        curStyle = null;
        // By id as well as by reference, and including the veil this used to
        // build: a boot that ran its cursor setup twice, or one that lost the
        // reference, must not be able to leave anything standing. Removing a
        // full-window node is the difference between a live canvas and a dead
        // one, so it is worth the two lines.
        var strays = ['boot-cursor-style', 'boot-veil'], el;
        for (var i = 0; i < strays.length; i++) {
            el = document.getElementById(strays[i]);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }
    }

    // ══ Public surface ════════════════════════════════════════════════
    window.Boot = {
        usesWindowFade: usesWindowFade,
        // A getter, not a value: reading it resolves the title card, and the
        // whole point is that nothing resolves it during the load. The one
        // caller (20-mixer-layout.js) runs well after the reveal.
        get titleCard() { return titleCard(); },
        done: done,
        // Run fn when the window starts fading in. Late registrations run
        // immediately, so a chunk that loads after the reveal still works.
        onReveal: function (fn) {
            if (typeof fn !== 'function') return;
            if (entered) {
                try { fn({ fadeMs: fadeMs, titleHoldMs: TITLE_HOLD_MS, titleCard: titleCard() }); }
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
        // FIRST, before anything that can block. The veil's bare-orb url()
        // resolves off the main thread, so putting it up here means the fluid
        // is on screen THROUGH the storage stall that index.html's
        // photosensitivity gate is about to trigger, instead of after it.
        // (A `boot-no-title` class used to be set here off TITLE_CARD, which
        // dragged that ~714ms read onto the critical path. No stylesheet has
        // ever had a rule for it, so it was removed rather than deferred.)
        startCursor();
        log('window-fade launch armed');
    }
})();
