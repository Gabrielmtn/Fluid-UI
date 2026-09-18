// ═══════════════════════════════════════════════════════════════════
// js/53-idle-vram.js — squeeze the last of the GPU back while hidden
// LOAD ORDER: tail (after 05c exports __vramHibernate/__vramRestore, after
//   08a-quality-governor.js, after 47-pen-window.js and 24-video-export.js
//   so the guards can see them). Anywhere in the tail is fine.
// PROVIDES: window.IdleVram
// REQUIRES: window.__vramHibernate / __vramRestore (05c); everything the
//   guards read is optional and tested for.
//
// OFF BY DEFAULT — READ THIS BEFORE TURNING IT ON
// Swirl used to be a bad neighbour, and the fix for that was ONE LINE in
// electron-main.js, not this file. Measured on a 2134x1180 window at the
// stock 2048 dye / 512 sim, PhotoSafe off, no paint layers, fully covered
// by another application:
//
//   before (--disable-backgrounding-occluded-windows)
//                            59.2 Hz of frames · 208.0 MB RESIDENT in VRAM
//   after that switch went   0.1 Hz            ·  14–28 MB resident
//   after that, + this file  0 Hz              ·  14.2 MB resident
//
// Windows evicts a process's GPU allocations once it stops presenting. So
// merely letting a covered window go quiet already hands ~180 MB back, for
// free, with no bookkeeping at all.
//
// Be honest about the third row: the OFF and ON figures overlap. Repeated
// runs with this file disabled landed anywhere from 14 to 28 MB resident,
// and a run with it enabled landed at 14.2 — inside that spread. Its
// measured contribution on this machine is therefore somewhere between
// "nothing" and "about 14 MB", and it buys even that with a readback, a
// snapshot held in system memory, a rebuild on wake, and a set of guards
// that must all stay correct. That is why it ships off: it is a lever to
// reach for with a measurement in hand, not a default.
//
// The places it could still earn its keep: a machine whose GPU is genuinely
// starved (where eviction pressure is real rather than opportunistic), the
// high fidelity tiers where the buffer set is 291 MB of FBOs at 4096 dye
// rather than 96 MB, and platforms whose driver is less willing to evict
// than WDDM is. All of those want measuring before assuming.
//
// A note on why 05c SHRINKS to 64x32 rather than deleting: freeing every
// FBO and allocating nothing returned 0.1 MB. Chromium's GPU process
// decommits when it reallocates while presenting, never when it merely
// frees, and a hidden window presents nothing. Shrinking is what leaves the
// allocator holding almost nothing for Windows to keep committed.
//
// WHAT "HIDDEN" MEANS HERE
// document.visibilityState, nothing cleverer. Minimized, fully covered by
// another window, or on another virtual desktop. A window merely sitting
// UNFOCUSED on a second monitor is still visible, and must keep painting —
// people leave this running to watch it, and a blurred-but-visible canvas
// that froze would read as a crash.
//
// WHY THE DELAY
// Alt-tabbing out to check a reference and straight back is the common
// case, and a wake costs a full framebuffer rebuild plus the re-upload.
// Sleeping on a timer means the quick round trip never pays for it.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DEFAULT_DELAY_MS = 20000;   // hidden this long before we let go
    var MIN_DELAY_MS = 2000;        // the harness drives it down; users don't

    var enabled = false;   // opt-in — see the header for what it is worth
    var delayMs = DEFAULT_DELAY_MS;
    var timer = 0;
    var asleep = false;
    var blocks = {};                // reason → true, while something needs the GPU
    var last = null;                // report from the most recent sleep/wake
    var hiddenSinceMs = 0;
    var stats = { sleeps: 0, wakes: 0, refusals: 0, lastFreedMB: 0, lastWakeMs: 0 };

    function settings() { return window.settingsManager || null; }

    // ── Guards ───────────────────────────────────────────────────────
    // Everything here can legitimately be running while the window is
    // hidden, and every one of them would break if the buffers vanished
    // underneath it. A guard that throws counts as "busy" — an unreadable
    // subsystem is not evidence that it is idle.
    function busyReason() {
        var r = Object.keys(blocks)[0];
        if (r) return r;
        try {
            // A media export reads the canvas from its own rAF loop; it
            // survives the window being covered and must not lose its
            // source mid-render.
            if (window.fluidExport && window.fluidExport.isExporting &&
                window.fluidExport.isExporting()) return 'exporting';
            // The pen window is a second, always-on-top window — it can be
            // the very thing covering us, while the user paints into it.
            if (window.PenWindow && window.PenWindow.isOpen &&
                window.PenWindow.isOpen()) return 'pen window open';
            // A room means peers are still sending strokes at us.
            if (typeof currentRoom !== 'undefined' && currentRoom) return 'in a room';
            if (window.audioComposer && window.audioComposer.isPlaying &&
                window.audioComposer.isPlaying()) return 'audio playing';
            if (window.gl && window.gl.isContextLost && window.gl.isContextLost()) return 'context lost';
        } catch (e) {
            return 'guard threw: ' + (e && e.message);
        }
        return null;
    }

    // ── Sleep / wake ─────────────────────────────────────────────────
    function sleepNow(force) {
        if (asleep || typeof window.__vramHibernate !== 'function') return false;
        if (!force) {
            if (!enabled) return false;
            if (!document.hidden) return false;
            var why = busyReason();
            if (why) { stats.refusals++; last = { refused: why }; return false; }
        }
        var t0 = performance.now();
        var report = window.__vramHibernate();
        if (!report) { stats.refusals++; last = { refused: 'readback failed' }; return false; }
        asleep = true;
        stats.sleeps++;
        stats.lastFreedMB = report.freedMB;
        last = { slept: report, ms: +(performance.now() - t0).toFixed(1) };
        console.log('[IdleVram] asleep — released ' + report.freedMB + ' MB of GPU buffers (down to ' +
            report.tokenMB + ' MB), holding ' + report.heldMB + ' MB on the CPU (' + last.ms + ' ms)');
        return true;
    }

    function wakeNow() {
        if (!asleep) return false;
        var t0 = performance.now();
        var report = (typeof window.__vramRestore === 'function') ? window.__vramRestore() : null;
        asleep = false;
        stats.wakes++;
        stats.lastWakeMs = +(performance.now() - t0).toFixed(1);
        last = { woke: report, ms: stats.lastWakeMs };
        // The governor spent the whole sleep seeing no frames. Clear its
        // streaks without moving the tier (softReset, never reset — a hard
        // reset here would snap to L0 and re-init every buffer we just
        // rebuilt, which is the 2026-07-06 preset hitch all over again).
        if (window.QualityGovernor && window.QualityGovernor.softReset) {
            try { window.QualityGovernor.softReset(); } catch (e) { }
        }
        console.log('[IdleVram] awake — rebuilt ' + (report ? report.allocMB : '?') +
            ' MB in ' + stats.lastWakeMs + ' ms' +
            (report && report.exact === false ? ' (size changed while asleep)' : ''));
        return true;
    }

    function arm() {
        disarm();
        if (!enabled || asleep) return;
        timer = setTimeout(function () { timer = 0; sleepNow(false); },
            Math.max(MIN_DELAY_MS, delayMs));
    }
    function disarm() { if (timer) { clearTimeout(timer); timer = 0; } }

    function onVisibility() {
        if (document.hidden) {
            hiddenSinceMs = performance.now();
            arm();
        } else {
            hiddenSinceMs = 0;
            disarm();
            wakeNow();
        }
    }

    // ── Wiring ───────────────────────────────────────────────────────
    function initUI() {
        var s = settings();
        if (s) {
            enabled = s.get('idleVram.enabled', false) === true;
            var d = s.get('idleVram.delayMs', DEFAULT_DELAY_MS);
            if (typeof d === 'number' && isFinite(d)) delayMs = d;
        }
        var box = document.getElementById('idleVramToggle');
        if (box) {
            box.checked = enabled;
            box.addEventListener('change', function () {
                window.IdleVram.setEnabled(box.checked);
            });
        }
        document.addEventListener('visibilitychange', onVisibility);
        // Covered at load (launched behind something) still counts.
        if (document.hidden) onVisibility();
        updateStatusLine();
    }

    function updateStatusLine() {
        var el = document.getElementById('stat-idlevram');
        if (!el) return;
        if (!enabled) { el.textContent = 'off'; return; }
        if (asleep) { el.textContent = 'asleep — ' + stats.lastFreedMB + ' MB freed'; return; }
        var why = document.hidden ? busyReason() : null;
        el.textContent = why ? 'held (' + why + ')'
            : (stats.sleeps ? 'awake — slept ' + stats.sleeps + '×' : 'awake');
    }
    setInterval(updateStatusLine, 1000);

    window.IdleVram = {
        // Anything that needs the GPU buffers to survive a hidden window
        // holds a block for as long as it needs them. Idempotent by reason,
        // and a block taken while asleep wakes us first.
        block: function (reason) {
            reason = reason || 'unnamed';
            blocks[reason] = true;
            disarm();
            if (asleep) wakeNow();
        },
        unblock: function (reason) {
            delete blocks[reason || 'unnamed'];
            if (document.hidden) arm();
        },
        setEnabled: function (b) {
            b = !!b;
            if (b === enabled) return;
            enabled = b;
            var s = settings();
            if (s) s.set('idleVram.enabled', b);
            if (!b) { disarm(); wakeNow(); }
            else if (document.hidden) arm();
            updateStatusLine();
        },
        setDelay: function (ms) {
            ms = Math.max(MIN_DELAY_MS, ms | 0);
            delayMs = ms;
            var s = settings();
            if (s) s.set('idleVram.delayMs', ms);
            if (document.hidden) arm();
        },
        isAsleep: function () { return asleep; },
        // Harness / console: sleep without waiting for the timer or the
        // window to actually be hidden.
        sleepNow: function () { return sleepNow(true); },
        wakeNow: wakeNow,
        state: function () {
            return {
                enabled: enabled, delayMs: delayMs, asleep: asleep,
                hidden: document.hidden,
                hiddenForMs: hiddenSinceMs ? +(performance.now() - hiddenSinceMs).toFixed(0) : 0,
                blocking: busyReason(), blocks: Object.keys(blocks),
                stats: stats, last: last
            };
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
