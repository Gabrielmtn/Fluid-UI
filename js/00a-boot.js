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
    var TITLE_CARD = true;
    try {
        if (localStorage.getItem('fluidui.photoWarn.ack.v1') !== '1') TITLE_CARD = false;
    } catch (_) { /* no storage — leave the card on */ }
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
        resolveCursor();
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
        if (TITLE_CARD) return;
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
        if (!TITLE_CARD) return;
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
    // feedback there is. It is the app's own fluid — one frame of the real
    // sim (assets/boot-cursor.png, lifted out of the baked loop by
    // scripts/bake-boot-swirl.js) — with a small ring off its lower right
    // that steps around to say "working", the way ZBrush's loader does.
    //
    // That ring is a MINIATURE of the in-app brush cursor: same dark
    // under-halo, same light stroke, same accent, and at the very end the
    // same angle line and centre dot (js/31-brush-cursor.js). So the ring
    // spins, settles into the shape the app is about to put under the
    // pointer, and only then does the window arrive carrying it.
    //
    // WHY THE FLUID HOLDS STILL AND ONLY THE RING MOVES. A page's cursor is
    // re-evaluated only when the renderer services a MOUSE-MOVE HIT TEST, so
    // the animation is driven by input, not by time: park the pointer and it
    // stops dead (measured — zero custom frames in six seconds of a parked
    // mouse), and during the load that same thread services those hit tests
    // about three times a second (measured, hand moving at 60Hz). None of
    // that is tunable, so an animation that wants to be SMOOTH cannot be
    // built on this channel — which is the whole reason the fluid is a still
    // and the only moving part is an eight-frame ring. A 45° step is legible
    // as a step whether it lands at 9Hz or at 3Hz; it reads as a chosen
    // cadence instead of a stutter.
    //
    // The frame index comes off the CLOCK and is never counted, so a stretch
    // with no hit tests resumes at the phase the ring should have reached
    // rather than picking up where it stalled.
    //
    // NOTHING MAY MAKE THE FLUID BLINK. Swapping the cursor is a resource
    // reload, and a `url()` that is not decoded yet falls THROUGH to the next
    // entry in its list — so the fallback chain decides what a stumble looks
    // like. Every frame therefore names the still orb before it names the OS
    // cursor: the worst a hiccup can do is drop the ring for a frame, never
    // take the paint away. Two more things keep it steady — the frames are
    // all handed to the decoder BEFORE any of them is asked for (or the ring
    // arrives a frame late for the whole first revolution), and a repeat of
    // the value already showing is dropped rather than re-assigned, because
    // the timer and the frame clock drift against each other and a redundant
    // assignment still costs a reload.
    //
    // THE FLUID IS ALSO NEVER SHOWN AT THE WRONG SIZE. assets/boot-cursor.png
    // is source art, not a cursor: on its own it is the orb filling all 128px,
    // with no ring and a hotspot in a different place, so wearing it while the
    // frames compose meant the paint appeared large and bare and then jumped.
    // Nothing is worn until the composed set exists — the OS busy cursor holds
    // those first ~230ms, which is what it is for — and from then on every
    // cursor in play shares one geometry. The fallback is the IDLE frame (the
    // same orb and ring track, minus the accent), so a stumble subtracts the
    // red arc and nothing else.
    //
    // assets/boot-swirl/ keeps the full 48-frame loop for a future loader
    // that has its own idle renderer to animate the fluid too.
    //
    // Set on a dedicated top-most veil rather than on <html>: the cursor
    // property inherits, so a rule on <html> looks like it should be enough —
    // it is not. Measured, the element actually under the pointer during boot
    // carries its own cursor, which beats anything inherited.
    var CUR_SRC = 'assets/boot-cursor.png';
    var CUR_BOX = 128;        // Chromium ignores a cursor image larger than this
    var CUR_ORB = 88;         // the fluid's diameter
    var CUR_HOT = 58;         // orb centre, and the hotspot: 88px clears 14..102
    var CUR_RING_C = 104;     // ring centre, on the down-right diagonal
    var CUR_RING_R = 15;      // ...far enough out to leave ~4px of daylight
    var CUR_FRAMES = 8;       // deliberately few — see above
    var CUR_MS = 160;         // ~1.3s per revolution, at 45° a step
    var CUR_ARC = 1.9;        // accent arc length in radians (~109°)
    var ACCENT = '#ec3013';   // --accent (css/00-tokens.css), so it is on-brand
    var HALO = 'rgba(0,0,0,0.55)';   // the brush cursor's under-stroke, verbatim
    var TAU = Math.PI * 2;
    var curVeil = null, curTimer = null, curFrames = null, curResolved = null;

    // One 128px frame. `mode` is either a number — the angle the accent arc
    // starts at — or one of two words:
    //   'idle'      orb and ring track only. The fallback, and what a frame
    //               that is somehow not ready degrades to.
    //   'resolved'  closed ring with the brush cursor's own angle mark and
    //               centre dot, worn for the last instant before the window
    //               materializes.
    function cursorFrame(orb, mode) {
        var c = document.createElement('canvas');
        c.width = c.height = CUR_BOX;
        var g = c.getContext && c.getContext('2d');
        if (!g) return null;
        g.lineCap = 'round';

        var o = CUR_ORB / 2;
        g.drawImage(orb, CUR_HOT - o, CUR_HOT - o, CUR_ORB, CUR_ORB);

        // Everything below is drawn twice — dark under-stroke, then the light
        // one — which is how the in-app cursor stays legible on artwork of any
        // brightness, and here on any desktop.
        var ring = function (from, to, width, color) {
            g.beginPath();
            g.arc(CUR_RING_C, CUR_RING_C, CUR_RING_R, from, to);
            g.lineWidth = width; g.strokeStyle = color; g.stroke();
        };

        var resolved = (mode === 'resolved');
        ring(0, TAU, 3.6, HALO);
        ring(0, TAU, 1.8, resolved ? '#ffffff' : 'rgba(255,255,255,0.22)');

        if (typeof mode === 'number') {
            ring(mode, mode + CUR_ARC, 2.6, ACCENT);
        }
        if (!resolved) {
            try { return c.toDataURL('image/png'); } catch (_) { return null; }
        }

        // Resolved: the brush cursor in miniature — closed ring (above), the
        // accent angle line across it, and the centre dot marking the spot.
        var line = function (width, color) {
            g.beginPath();
            g.moveTo(CUR_RING_C - CUR_RING_R, CUR_RING_C);
            g.lineTo(CUR_RING_C + CUR_RING_R, CUR_RING_C);
            g.lineWidth = width; g.strokeStyle = color; g.stroke();
        };
        line(3.4, HALO);
        line(1.8, ACCENT);
        g.beginPath();
        g.arc(CUR_RING_C, CUR_RING_C, 1.6, 0, TAU);
        g.fillStyle = '#ffffff'; g.fill();
        g.lineWidth = 0.8; g.strokeStyle = HALO; g.stroke();

        try { return c.toDataURL('image/png'); } catch (_) { return null; }
    }

    var curIdle = null;   // composed 'idle' frame; the fallback for every other
    function cursorCss(url) {
        var hot = ' ' + CUR_HOT + ' ' + CUR_HOT;
        return 'url("' + url + '")' + hot +
               (curIdle && url !== curIdle ? ', url("' + curIdle + '")' + hot : '') +
               ', progress';
    }

    var curLast = '';
    function applyCursor(css) {
        if (!curVeil || css === curLast) return;
        curLast = css;
        curVeil.style.cursor = css;
    }

    // Every frame into the decoder before the first one is worn. A failure
    // counts as done: that frame simply falls back to the still orb, which
    // is exactly what the fallback chain is for.
    function warmFrames(urls, done) {
        var left = urls.length;
        if (!left) { done(); return; }
        var tick = function () { if (--left === 0) done(); };
        for (var i = 0; i < urls.length; i++) {
            var im = new Image();
            im.src = urls[i];
            if (im.decode) im.decode().then(tick, tick);
            else { im.onload = im.onerror = tick; }
        }
    }

    // Clock-derived, never counted — see the note above.
    var curShownAt = 0;
    function spinCursor() {
        if (!curFrames) return;
        var t = now();
        // A minimum dwell, because a timer that fires late and then catches
        // up can otherwise put two frames on screen a few tens of ms apart —
        // measured, 27ms. That is not a step, it is a flick. Skipping the
        // late one costs nothing: the index below is read off the clock, so
        // the ring is back on phase at the very next tick.
        if (t - curShownAt < CUR_MS * 0.6) return;
        var css = curFrames[Math.floor(t / CUR_MS) % CUR_FRAMES];
        if (css === curLast) return;
        curShownAt = t;
        applyCursor(css);
    }

    // Every gate is clear and the window is about to come up: stop the ring
    // on the brush cursor's own shape, so the last thing the pointer wears
    // before the app appears is the thing the app is about to put there.
    function resolveCursor() {
        if (curTimer) { clearInterval(curTimer); curTimer = null; }
        if (curResolved) applyCursor(curResolved);
    }

    function startCursor() {
        // Transparent, covers the window, sits above everything. The window is
        // invisible while this exists, so it costs nothing visually — and it
        // is removed at the reveal, before there is anything for it to
        // swallow.
        curVeil = document.createElement('div');
        curVeil.id = 'boot-veil';
        // No art yet, and deliberately none: see the note above. `progress`
        // says "working" for the ~230ms it takes to compose the set.
        curLast = 'progress';
        curVeil.style.cssText = 'position:fixed;inset:0;z-index:2147483647;' +
            'background:transparent;cursor:' + curLast;
        (document.body || root).appendChild(curVeil);
        // Built in <head>, so <body> does not exist yet — re-home it once the
        // parser has made one, or a stray element outside <body> outlives us.
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', function () {
                if (curVeil && document.body) document.body.appendChild(curVeil);
            });
        }

        // Everything past here is best-effort: any failure leaves the OS busy
        // cursor up, which is a truthful thing to be showing during a load.
        //
        // The page is served from file:// in the desktop build, which is the
        // usual way a canvas ends up tainted and toDataURL throws — measured
        // here, it does not: Electron lets a file:// page read a file:// image
        // it loaded itself, so the frames build. The null checks below are
        // what catches it if that ever stops being true.
        var img = new Image();
        img.onload = function () {
            if (!curVeil) return;   // revealed before the decode landed
            var frames = [], i, f;
            for (i = 0; i < CUR_FRAMES; i++) {
                f = cursorFrame(img, (i / CUR_FRAMES) * TAU);
                if (!f) return;
                frames.push(f);
            }
            f = cursorFrame(img, 'resolved');
            var idle = cursorFrame(img, 'idle');
            if (!f || !idle) return;

            warmFrames(frames.concat([f, idle]), function () {
                if (!curVeil) return;
                // Named before anything else is built: cursorCss reads it.
                curIdle = idle;
                curFrames = [];
                for (var k = 0; k < frames.length; k++) curFrames.push(cursorCss(frames[k]));
                curResolved = cursorCss(f);
                log('boot cursor: ' + CUR_FRAMES + ' frames @' + CUR_MS + 'ms, decoded');
                // A decode slow enough to land after the gates cleared skips
                // the spin entirely and goes straight to the settled shape.
                if (asked) { applyCursor(curResolved); return; }
                spinCursor();
                // Ticked at half the frame period so a slot is never missed
                // by a whole frame; the repeat check above swallows the extra
                // visits, so this costs a string compare, not a reload.
                curTimer = setInterval(spinCursor, Math.round(CUR_MS / 2));
            });
        };
        try { img.src = CUR_SRC; } catch (_) {}
    }

    function stopCursor() {
        if (curTimer) { clearInterval(curTimer); curTimer = null; }
        if (curVeil && curVeil.parentNode) curVeil.parentNode.removeChild(curVeil);
        curVeil = null;
        curFrames = null;
        curResolved = null;
        curIdle = null;
        curLast = '';
        curShownAt = 0;
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
