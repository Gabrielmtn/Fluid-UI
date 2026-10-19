// ═══════════════════════════════════════════════════════════════════
// js/76-dial-control.js — Walnut & Copper: pointer control for the top
// bar's round dials and telegraph faces.
//
// The six round controls are still native range inputs (the four cathode
// dials, css/33; the Laminar / Blend and Time telegraphs, js/70), but a
// native range only reads a horizontal drag across its box. This replaces
// the left-button press on them (Gabriel 2026-10-18):
//   - a press on the face jumps the value to the angle under the pointer,
//     where the dial's own arc (-135..135) or the telegraph's lever
//     (-120..120, through js/70's toF) shows that value. A press in the
//     hub, where the angle means nothing, doesn't jump; a press in the
//     bottom gap snaps to the nearer end.
//   - a drag after it is relative and two-way: right or up raises, left or
//     down lowers, DRAG_PX screen px for the full travel, Shift for fine.
// The writes are a native drag's: .value, then 'input' while moving and
// 'change' on release, on the visible input (the perceptual proxy where
// there is one), with the press itself still trusted, so js/20's holdAtOne
// catch, js/71's held-drag spring and every listener see what they did.
// Keys, the wheel, right and middle buttons are untouched.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;

    var DRAG_PX = 220;      // screen px for the whole travel
    var FINE = 0.2;         // Shift
    var HUB = 0.2;          // no-jump radius, as a share of the face's size
    var SLOP = 3;           // px before a press turns into a drag

    // sweep: the face's half-angle. canonical/toV (telegraphs only): the
    // lever angle's share f (0..1) back to the canonical value, the inverse
    // of js/70's TELE[..].toF.
    var FACES = {
        'Viscosity': { sweep: 135 }, 'Isolation': { sweep: 135 },
        'Density': { sweep: 135 }, 'Velocity': { sweep: 135 },
        'Color Blend': { sweep: 120, face: '.wc-tele-laminar', canonical: 'colorBlend', toV: function (f) { return 2 * f - 1; } },
        'Time': { sweep: 120, face: '.wc-tele-time', canonical: 'timeScale', toV: function (f) { return 0.01 + 2.99 * f * f; } }
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

    // The share of the input's travel that puts the dial's mark at angle a
    // (degrees, 0 at the top, clockwise).
    function shareAt(C, inp, a) {
        var f = (Math.max(-C.sweep, Math.min(C.sweep, a)) + C.sweep) / (2 * C.sweep);
        if (!C.toV) return f;
        var can = document.getElementById(C.canonical), curve = window.FaderCurves && window.FaderCurves[C.canonical];
        if (!can) return null;
        var v = C.toV(f);
        if (curve && can !== inp) return curve.fromCanonical(v, can);
        var r = range(inp);
        return (v - r[0]) / (r[1] - r[0]);
    }

    function bind(C, inp, fader) {
        if (inp._wcDial) return;
        inp._wcDial = true;
        // A vertical touch drag is the dial's, not a page pan.
        inp.style.touchAction = 'none';
        var drag = null;
        inp.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || drag || inp.disabled) return;
            // No native thumb drag, no mouse-down focus: focus by hand so the
            // keys still work on the dial just pressed.
            e.preventDefault();
            try { inp.focus({ preventScroll: true }); } catch (_) {}
            var el = (C.face && fader.querySelector(C.face)) || inp;
            var b = el.getBoundingClientRect();
            var dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
            var start = inp.value;
            if (Math.hypot(dx, dy) > HUB * Math.min(b.width, b.height)) {
                var p = shareAt(C, inp, Math.atan2(dx, -dy) * 180 / Math.PI);
                if (p !== null && isFinite(p)) write(inp, p);
            }
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, live: false, p: share(inp), start: start };
            try { inp.setPointerCapture(e.pointerId); } catch (_) {}
        });
        inp.addEventListener('mousedown', function (e) { if (e.button === 0) e.preventDefault(); });
        inp.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            var mx = e.clientX - drag.x, my = e.clientY - drag.y;
            if (!drag.live) {
                if (Math.hypot(mx, my) < SLOP) return;
                drag.live = true;       // counted from here, so a press never nudges
            } else {
                drag.p = Math.max(0, Math.min(1, drag.p + (mx - my) * (e.shiftKey ? FINE : 1) / DRAG_PX));
                write(inp, drag.p);
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
