// ═══════════════════════════════════════════════════════════════════
// js/76-dial-control.js — Walnut & Copper: pointer control for the top
// bar's round dials and telegraph faces.
//
// The six round controls are still native range inputs (the four cathode
// dials, css/33; the Laminar / Blend and Time telegraphs, js/70). Each is
// a horizontal slider with a dial on it for looks (Gabriel 2026-10-28),
// replacing the left-button press:
//   - the telegraphs' slot under the plate is the slider's track (the plate
//     counts as part of it): a press on it jumps to the spot under the
//     pointer, left to right, and js/70's fill and lever land there. A
//     press anywhere else on a face doesn't jump.
//   - a drag after it is relative and horizontal only: the dial's own
//     width is the full travel, so it never needs a long pull off the
//     face, Shift for fine.
// Both run in the lever's share of the sweep (js/70's toF), so the slot,
// its thumb and the lever always agree.
// The writes are a native drag's: .value, then 'input' while moving and
// 'change' on release, on the visible input (the perceptual proxy where
// there is one), with the press itself still trusted, so js/20's holdAtOne
// catch, js/71's held-drag spring and every listener see what they did.
// Keys, the wheel, right and middle buttons are untouched.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;

    var FINE = 0.2;         // Shift
    var SLOP = 3;           // px before a press turns into a drag
    var SLOT_PAD = 4;       // px of grace above and below the slot

    // canonical/toF/toV (telegraphs only): the canonical value to the
    // lever's share f (0..1) and back, js/70's TELE[..].toF and its inverse.
    var FACES = {
        'Viscosity': {}, 'Isolation': {}, 'Density': {}, 'Velocity': {},
        'Color Blend': { face: '.wc-tele-laminar', canonical: 'colorBlend',
            toF: function (v) { return (Math.max(-1, Math.min(1, v)) + 1) / 2; },
            toV: function (f) { return 2 * f - 1; } },
        'Time': { face: '.wc-tele-time', canonical: 'timeScale',
            toF: function (v) { return Math.sqrt(Math.max(0, (v - 0.01) / 2.99)); },
            toV: function (f) { return 0.01 + 2.99 * f * f; } }
    };

    function range(inp) {
        var mn = parseFloat(inp.min), mx = parseFloat(inp.max);
        return [isFinite(mn) ? mn : 0, isFinite(mx) ? mx : 100];
    }
    function share(inp) {
        var r = range(inp), v = parseFloat(inp.value);
        return r[1] > r[0] && isFinite(v) ? (v - r[0]) / (r[1] - r[0]) : 0;
    }
    // Writes a 0..1 share of the input's travel; true when the value moved.
    function write(inp, p) {
        var r = range(inp), before = inp.value;
        inp.value = r[0] + Math.max(0, Math.min(1, p)) * (r[1] - r[0]);
        if (inp.value === before) return false;
        inp.style.setProperty('--val', inp.value);
        var ev = new Event('input', { bubbles: true });
        ev.wcDial = true;       // js/20 holdAtOne holds it like a trusted drag
        inp.dispatchEvent(ev);
        return true;
    }

    // The lever's share f now, and the input share that puts it at f.
    function leverF(C, inp) {
        var can = C.toF && document.getElementById(C.canonical);
        if (!can) return share(inp);
        var v = parseFloat(can.value);
        return isFinite(v) ? Math.max(0, Math.min(1, C.toF(v))) : 0;
    }
    function shareAt(C, inp, f) {
        f = Math.max(0, Math.min(1, f));
        if (!C.toV) return f;
        var can = document.getElementById(C.canonical), curve = window.FaderCurves && window.FaderCurves[C.canonical];
        if (!can) return null;
        var v = C.toV(f);
        if (curve && can !== inp) return curve.fromCanonical(v, can);
        var r = range(inp);
        return (v - r[0]) / (r[1] - r[0]);
    }
    function writeF(C, inp, f) {
        var p = shareAt(C, inp, f);
        if (p !== null && isFinite(p)) write(inp, p);
    }

    function bind(C, inp, fader) {
        if (inp._wcDial) return;
        inp._wcDial = true;
        // A touch drag is the dial's, not a page pan.
        inp.style.touchAction = 'none';
        var drag = null;
        inp.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || drag || inp.disabled) return;
            // No native thumb drag, no mouse-down focus: focus by hand so the
            // keys still work on the dial just pressed.
            e.preventDefault();
            try { inp.focus({ preventScroll: true }); } catch (_) {}
            var face = (C.face && fader.querySelector(C.face)) || inp;
            var slot = C.face && face.querySelector('.slot'), track = C.face && face.querySelector('.strack');
            var start = inp.value, f = leverF(C, inp);
            if (slot && track) {
                // The track maps left to right; the plate above it counts
                // as part of it, so the target isn't the track's 3 px.
                var s = slot.getBoundingClientRect(), t = track.getBoundingClientRect();
                if (e.clientY >= s.top - SLOT_PAD && e.clientY <= t.bottom + SLOT_PAD &&
                    e.clientX >= s.left - SLOT_PAD && e.clientX <= s.right + SLOT_PAD) {
                    f = Math.max(0, Math.min(1, (e.clientX - t.left) / t.width));
                    writeF(C, inp, f);
                }
            }
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, live: false, f: f, start: start,
                w: Math.max(1, face.getBoundingClientRect().width) };
            try { inp.setPointerCapture(e.pointerId); } catch (_) {}
        });
        inp.addEventListener('mousedown', function (e) { if (e.button === 0) e.preventDefault(); });
        inp.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            var mx = e.clientX - drag.x;
            if (!drag.live) {
                if (Math.hypot(mx, e.clientY - drag.y) < SLOP) return;
                drag.live = true;       // counted from here, so a press never nudges
            } else {
                drag.f = Math.max(0, Math.min(1, drag.f + mx * (e.shiftKey ? FINE : 1) / drag.w));
                writeF(C, inp, drag.f);
            }
            drag.x = e.clientX; drag.y = e.clientY;
        });
        function end(e) {
            if (!drag || e.pointerId !== drag.id) return;
            var moved = inp.value !== drag.start;
            drag = null;
            try { inp.releasePointerCapture(e.pointerId); } catch (_) {}
            if (moved) inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
        inp.addEventListener('pointerup', end);
        inp.addEventListener('pointercancel', end);
        inp.addEventListener('lostpointercapture', end);
    }

    function mountAll() {
        var n = 0;
        Object.keys(FACES).forEach(function (key) {
            var fader = document.querySelector('#mixer-strip > .mixer-channel[data-ui-key="' + key + '"] .ch-fader');
            // The visible input: the proxy, not the canonical in its vault.
            var inp = fader && [].filter.call(fader.querySelectorAll('input[type=range]'), function (el) { return !el.closest('.ch-canonical'); })[0];
            if (!inp) return;
            bind(FACES[key], inp, fader);
            n++;
        });
        return n === Object.keys(FACES).length;
    }

    // The strip is built ~800 ms after DOMContentLoaded (js/20).
    var tries = 0;
    (function attach() {
        if (!mountAll() && tries++ < 80) setTimeout(attach, 250);
    })();
})();
