// js/67-slider-keys.js — arrow keys on a slider move a useful amount.
//
// The browser moves a focused slider by its step attribute per arrow press,
// and several steps are set fine for the mouse's sake: Velocity crossed in
// 4,000 presses, Velocity Sustain in about 1,000, and the four curved faders
// (Brush Size, Time, Density, Laminar / Blend: 0–1 at 0.001) in 1,000. Here an
// arrow moves at least 1% of the way (snapped to the slider's own step) and
// Shift+arrow 10%. A slider whose step is already 1% or more keeps it. The
// step attributes stay as they are, so dragging, presets and saved values
// keep their resolution. PageUp / PageDown, Home and End are the browser's.
(function () {
    'use strict';

    var DIR = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

    function decimals(n) {
        var s = String(n);
        var i = s.indexOf('.');
        if (s.indexOf('e-') > 0) return parseInt(s.split('e-')[1], 10) || 0;
        return i < 0 ? 0 : s.length - i - 1;
    }

    // Capture, ahead of the browser's own step and of any other handler.
    document.addEventListener('keydown', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'range' || el.disabled) return;
        var dir = DIR[e.key];
        if (!dir || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
        // A dialog up with the slider behind it has the keys (the startup
        // fork's arrows pick its cards); a slider inside the dialog keeps them.
        if (window.DialogFocus && window.DialogFocus.hasKeyboard()) {
            var top = window.DialogFocus.top();
            if (!top || !top.contains(el)) return;
        }

        var min = parseFloat(el.min); if (!isFinite(min)) min = 0;
        var max = parseFloat(el.max); if (!isFinite(max)) max = 100;
        var range = max - min;
        if (!(range > 0)) return;
        var step = el.step === 'any' ? 0 : parseFloat(el.step); if (!isFinite(step) || step < 0) step = 1;

        // Already 1% or more a press: the browser's step is fine, unless Shift.
        if (!e.shiftKey && step && range / step <= 100) return;

        var inc = range * (e.shiftKey ? 0.1 : 0.01);
        if (step) inc = Math.max(step, Math.round(inc / step) * step);
        var v = Math.min(max, Math.max(min, parseFloat(el.value) + dir * inc));
        if (step) v = min + Math.round((v - min) / step) * step;
        v = Math.min(max, Math.max(min, v));
        var out = step ? v.toFixed(Math.min(10, Math.max(decimals(step), decimals(min)))) : String(v);

        e.preventDefault();
        e.stopPropagation();            // a binding on Shift+arrow must not fire as well
        if (el.value === out) return;   // at the end already
        el.value = out;
        // What a native step fires, so every listener (readouts, the curved
        // faders' canonical inputs, autosave) hears it the same way.
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, true);
})();
