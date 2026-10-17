// ===================================================================
// js/72-theme-tubes.js - Walnut & Copper tubes: presentation hooks for
// range inputs, written once at init and on change, never per frame.
//
// --steps: a stepped slider (few discrete values: a count or a short list,
// 2 to 16 positions, e.g. the Multi-Brush count, Replay Speed, V-Cycles)
// gets the study's copper detent ticks under its tube (.lad .ticks,
// study-lite 250-251, drawn by css/36 from --steps = positions - 1).
// Written when a range first appears and again when its min, max or step
// attribute changes (a MutationObserver on those attributes and on added
// nodes, the way js/06 already watches for new ranges).
//
// --wc-mk-tint: the copper diamonds' twin in another player's colour, for
// css/36 to cross-fade to while js/71 fades that player's --ga (below).
//
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run); this file has none.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;

    var MAX_POSITIONS = 16;

    function positions(inp) {
        var step = inp.getAttribute('step');
        if (!step || step === 'any') return 0;
        var mn = parseFloat(inp.min), mx = parseFloat(inp.max), st = parseFloat(step);
        if (!isFinite(mn)) mn = 0;
        if (!isFinite(mx)) mx = 100;
        if (!(st > 0) || !(mx > mn)) return 0;
        var n = (mx - mn) / st;
        if (Math.abs(n - Math.round(n)) > 1e-6) return 0;   // the steps don't land on max
        return Math.round(n) + 1;
    }

    function mark(inp) {
        var n = positions(inp);
        var want = (n >= 2 && n <= MAX_POSITIONS) ? String(n - 1) : '';
        if (inp.style.getPropertyValue('--steps') === want) return;
        if (want) inp.style.setProperty('--steps', want);
        else inp.style.removeProperty('--steps');
    }

    function markAll(root) {
        if (root.matches && root.matches('input[type="range"]')) mark(root);
        var list = root.querySelectorAll ? root.querySelectorAll('input[type="range"]') : [];
        for (var i = 0; i < list.length; i++) mark(list[i]);
    }

    // --wc-mk-tint: when another player changes a slider, js/06e marks its row
    // (.mp-peer-touch, --mp-peer = their colour) and js/71 fades --ga on it.
    // The study's diamonds take that colour (--ga * 85 %, 338-340); css/36
    // cross-fades its copper diamond to this twin in the player's colour,
    // written once per touch (the fade itself is js/71's --ga).
    function diamondIn(colour, wire) {
        var c = encodeURIComponent(colour);
        return wire
            ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='10' viewBox='0 0 8 10'%3E%3Cpath d='M4 1.4L6.88 5L4 8.6L1.12 5Z' fill='none' stroke='" + c + "' stroke-width='1.2'/%3E%3C/svg%3E\")"
            : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M5 1.04L8.96 5L5 8.96L1.04 5Z' fill='none' stroke='" + c + "' stroke-width='1.4'/%3E%3C/svg%3E\")";
    }
    function tint(face) {
        if (!face.querySelector || !face.querySelector('input[type="range"]')) return;
        var colour = face.style.getPropertyValue('--mp-peer').trim() || '#5ab0ff';
        if (face._wcTint === colour) return;
        face._wcTint = colour;
        face.style.setProperty('--wc-mk-tint', diamondIn(colour, !!face.closest('#mixer-strip')));
    }

    function start() {
        markAll(document);
        try {
            new MutationObserver(function (records) {
                for (var i = 0; i < records.length; i++) {
                    var t = records[i].target;
                    if (t.classList && t.classList.contains('mp-peer-touch') && !/\bmp-peer-touch\b/.test(records[i].oldValue || '')) tint(t);
                }
            }).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
        } catch (_) {}
        try {
            new MutationObserver(function (records) {
                for (var i = 0; i < records.length; i++) {
                    var r = records[i];
                    if (r.type === 'attributes') {
                        if (r.target.type === 'range') mark(r.target);
                    } else {
                        for (var j = 0; j < r.addedNodes.length; j++) {
                            var node = r.addedNodes[j];
                            if (node.nodeType === 1) markAll(node);
                        }
                    }
                }
            }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['min', 'max', 'step'] });
        } catch (_) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
