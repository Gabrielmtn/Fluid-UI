// "More" overflow for the top mixer strip — narrow monitors.
//
// LOAD ORDER: after 20-mixer-layout.js (it works on the built strip). It
// collaborates with 43-ui-visibility (collect() asks StripMore.stripChildren()
// so a parked fader still lists under Settings → Interface, and relayout()
// re-checks the dividers when the More cell comes and goes) and with
// 44-recipes (a tour reveals a parked fader through StripMore.reveal()).
//
// WHAT: when the window is too narrow for the whole bar, the FADER cells —
// Brush Size … Velocity, everything left of the first divider — park one at
// a time into a "More ▾" cell that sits where the faders end, and come back
// in reverse when there is room again. Isolation, Viscosity and Time go
// first, in that order (Gabriel, 2026-09-11: "the other stuff is more
// important"), then the rest from the RIGHT, so Brush Size and Fluid are
// the last out and the first back. Color, Transport, Presets and Help never move: those are the cells
// you must be able to hit without a second click.
//
// Parking MOVES the live nodes — no clones, no rebuild — so every id, every
// binding, the perceptual proxies (Density/Time), COS, recording, the
// multiplayer mirror and presets keep working untouched. Same reason 20
// re-parents instead of rebuilding.
//
// MEASURE: the strip is a flex row of flex-shrink:0 cells with
// overflow-x:auto, so `scrollWidth > clientWidth` is exactly "the bar does
// not fit".
//   1. While it overflows, park the next fader in parking order that is
//      still in the bar (the More cell is shown first so its own width is
//      in the sum).
//   2. While it does not, try to bring the most important parked fader back
//      (the reverse of that order) — but ask with a throwaway CLONE in the
//      bar, and move the real cell only on a yes. Moving a node blurs it and ends a pointer drag, and a
//      re-measure fires whenever a cell's size changes (a readout growing a
//      digit is enough), so the real nodes move ONLY when the parked set
//      actually changes.
// Re-measured on: window resize, the strip's own size (focus mode, the
// mobile relocation), any fader cell's size (fonts landing, the material
// select re-fitting, a readout growing) and ui-hidden flips from 43.
//
// OFF in mobile mode: 13-mobile-mode relocates the whole strip into the
// drawer, where 21-sidebar.css wraps it into a grid — nothing to park.
(function () {
    'use strict';

    var strip = null, moreCell = null, moreBtn = null, panel = null, list = null;
    var candidates = [];        // fader cells, canonical (left → right) order
    // Parking order — the order cells LEAVE the bar (they come back in
    // reverse). These two go before anything else; the rest follow from the
    // right of the bar. Keyed by the cell's data-ui-key (43's label).
    var PARK_FIRST = ['Isolation', 'Viscosity', 'Time'];
    var parkOrder = [];         // candidates sorted by that priority
    var built = false, enabled = true, isOpen = false, raf = 0, lastStripW = -1;
    var PANEL_W = 248;
    // Popovers a parked cell can open (brush drawer, tip menu, arm colours)
    // are body-mounted with this skin; a press inside one is still "inside".
    var INSIDE = '.arm-colors-panel, .brush-shape-menu, .delete-modal, .app-confirm-modal, .mask-editor-overlay';
    // Same list as 43's onHidden: each trigger toggles its popup and owns the
    // .active class, so clicking it is the close path.
    var POPUP_TRIGGERS = '.ch-label.active, .ch-tip-swatch.active, #multiplierValue.active';

    function hiddenCell(el) { return el.classList.contains('ui-hidden'); }
    function inBar(el) { return el.parentElement === strip; }
    function isParked(el) { return el.parentElement === list; }
    function parkedCells() { return candidates.filter(isParked); }
    function computeParkOrder() {
        var first = [], rest = [];
        PARK_FIRST.forEach(function (k) {
            candidates.forEach(function (c) { if (c.dataset.uiKey === k) first.push(c); });
        });
        for (var i = candidates.length - 1; i >= 0; i--) {
            if (first.indexOf(candidates[i]) < 0) rest.push(candidates[i]);
        }
        parkOrder = first.concat(rest);
    }
    // The parked cell that should come back next: the last one out.
    function nextBack() {
        for (var i = parkOrder.length - 1; i >= 0; i--) if (isParked(parkOrder[i])) return parkOrder[i];
        return null;
    }
    // Both widths are read in the strip's own (zoomed) coordinate space, so
    // --ui-scale cancels out. 1px of slack for rounding.
    function overflowing() { return strip.scrollWidth > strip.clientWidth + 1; }
    function labelOf(el) {
        var l = el.querySelector('.ch-label');
        return el.dataset.uiKey || (l ? l.textContent.trim() : 'fader');
    }

    // ── Placement (canonical order kept on both sides) ─────────────────
    // The bar slot for a cell: before the next candidate still in the bar,
    // else right before the More cell (which sits after the last fader).
    function barSlot(el) {
        var i = candidates.indexOf(el);
        for (var j = i + 1; j < candidates.length; j++) if (inBar(candidates[j])) return candidates[j];
        return moreCell;
    }
    function restore(el) { strip.insertBefore(el, barSlot(el)); afterMove(el); }
    function park(el) {
        var i = candidates.indexOf(el), before = null;
        for (var j = i + 1; j < candidates.length; j++) if (isParked(candidates[j])) { before = candidates[j]; break; }
        list.insertBefore(el, before);
        afterMove(el);
    }
    // The Fluid label is the material <select>, which sizes itself to its
    // text and then gives width back when it would collide with the value
    // beside it (29-material-modes). A clamp measured in the bar leaves the
    // label clipped mid-word in the roomier panel, and vice versa — re-fit
    // it wherever the cell just landed (a closed panel measures no
    // collision at all, so it opens with the full label).
    function afterMove(el) {
        if (!el.querySelector('#materialMode')) return;
        if (window.MaterialModes && typeof window.MaterialModes.resizeLabel === 'function') {
            try { window.MaterialModes.resizeLabel(); } catch (_) {}
        }
    }
    function restoreAll() {
        candidates.forEach(function (c) { if (!inBar(c)) restore(c); });
    }

    // Would this parked cell fit back in the bar? Asked with a clone so the
    // real node (maybe mid-drag, maybe focused) only moves on a yes. The
    // clone's ids go so nothing can resolve to it in the meantime; it is in
    // and out inside one synchronous block, before anything else runs.
    function fitsBack(el, lastOne) {
        var probe = el.cloneNode(true);
        probe.classList.add('mixer-more-probe');
        probe.removeAttribute('id');
        probe.removeAttribute('data-ui-key');
        probe.setAttribute('aria-hidden', 'true');
        var ided = probe.querySelectorAll('[id]');
        for (var k = 0; k < ided.length; k++) ided[k].removeAttribute('id');
        strip.insertBefore(probe, barSlot(el));
        // The last one back takes the More cell with it and gets its width.
        if (lastOne) moreCell.classList.add('ui-hidden');
        var ok = !overflowing();
        if (lastOne) moreCell.classList.remove('ui-hidden');
        strip.removeChild(probe);
        return ok;
    }

    function schedule() { if (!built || raf) return; raf = requestAnimationFrame(measure); }

    function measure() {
        raf = 0;
        if (!built || !strip.isConnected) return;
        var mobile = document.body.classList.contains('mobile-mode');
        if (!enabled || mobile) { restoreAll(); sync(); return; }
        // display:none (focus mode, mobile before the relocation): nothing
        // to measure — keep the layout for when it comes back.
        if (strip.clientWidth === 0) return;

        // A hidden cell costs nothing either side; give it its bar slot back.
        parkedCells().forEach(function (c) { if (hiddenCell(c)) restore(c); });

        // 1. Overflowing: park in parking order until it fits (or nothing is left).
        if (overflowing()) {
            moreCell.classList.remove('ui-hidden');
            for (var i = 0; i < parkOrder.length && overflowing(); i++) {
                var c = parkOrder[i];
                if (inBar(c) && !hiddenCell(c)) park(c);
            }
        }
        // 2. Room to spare: bring parked cells back, last out first, while
        //    a probe says they fit.
        var next = nextBack();
        while (next && !overflowing()) {
            if (!fitsBack(next, parkedCells().length === 1)) break;
            restore(next);
            next = nextBack();
        }
        sync();
    }

    // Reflect the parked set: the cell's visibility, the button's tooltip,
    // the open panel (repositioned, or closed once it has nothing in it).
    function sync() {
        var parked = parkedCells(), n = parked.length;
        var wasShown = !moreCell.classList.contains('ui-hidden');
        moreCell.classList.toggle('ui-hidden', n === 0);
        if (n) {
            var names = parked.map(labelOf).join(', ');
            moreBtn.title = (n === 1 ? 'One fader' : n + ' faders') + ' the bar can’t fit at this width: '
                + names + '. Widen the window to bring them back.';
            moreBtn.setAttribute('aria-label', 'More: ' + names);
        }
        if (isOpen) { if (n) position(); else close(); }
        // The divider after the faders earns its place only with something
        // visible before it — 43 owns that rule.
        if (wasShown !== (n > 0) && window.UIVisibility && typeof window.UIVisibility.relayout === 'function') {
            window.UIVisibility.relayout();
        }
    }

    // ── The panel ──────────────────────────────────────────────────────
    function position() {
        // Fixed left/top are read in the --ui-scale zoomed space: measure in
        // screen px, divide by zoom (same math as the presets popup).
        var z = window.UIScale ? window.UIScale.get() : 1;
        var r = moreBtn.getBoundingClientRect();
        var left = Math.max(4, Math.min(r.left, window.innerWidth - PANEL_W * z - 4));
        var top = r.bottom + 6;
        panel.style.left = (left / z) + 'px';
        panel.style.top = (top / z) + 'px';
        panel.style.width = PANEL_W + 'px';
        panel.style.maxHeight = Math.max(160, (window.innerHeight - top - 8) / z) + 'px';
    }
    function open() {
        if (isOpen || !parkedCells().length) return;
        isOpen = true;
        position();                       // position BEFORE it paints
        panel.style.display = 'block';
        moreBtn.classList.add('active');
        moreBtn.setAttribute('aria-expanded', 'true');
    }
    function close() {
        if (!isOpen) return;
        isOpen = false;
        // A popover opened from a parked trigger would be left behind with
        // no visible way to close it (same rule as 43's onHidden).
        var t = list.querySelectorAll(POPUP_TRIGGERS);
        for (var i = 0; i < t.length; i++) { try { t[i].click(); } catch (_) {} }
        panel.style.display = 'none';
        moreBtn.classList.remove('active');
        moreBtn.setAttribute('aria-expanded', 'false');
    }

    // ── Build ──────────────────────────────────────────────────────────
    function build(s) {
        strip = s;
        var firstDivider = strip.querySelector('.mixer-divider');
        candidates = [];
        for (var el = strip.firstElementChild; el && el !== firstDivider; el = el.nextElementSibling) {
            if (el.classList.contains('mixer-channel') && el.querySelector('.ch-fader')) candidates.push(el);
        }
        built = true;
        if (!candidates.length) return;   // nothing left of the divider to park
        computeParkOrder();

        moreCell = document.createElement('div');
        moreCell.id = 'mixer-more';
        moreCell.className = 'mixer-more ui-hidden';   // no data-ui-key: not a cell you can hide, 43 leaves it alone
        moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.id = 'mixerMoreBtn';
        moreBtn.className = 'mixer-more-btn btn--sm';
        moreBtn.setAttribute('aria-haspopup', 'true');
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.setAttribute('aria-controls', 'mixer-more-panel');
        moreBtn.appendChild(document.createTextNode('More'));
        var chev = document.createElement('span');
        chev.className = 'mixer-more-chev';
        chev.setAttribute('aria-hidden', 'true');
        chev.textContent = '▾';
        moreBtn.appendChild(chev);
        moreBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (isOpen) close(); else open();
        });
        moreCell.appendChild(moreBtn);
        // Where the faders end: parking from the right leaves the cell
        // sitting after whichever fader is still the last visible one.
        strip.insertBefore(moreCell, candidates[candidates.length - 1].nextSibling);

        panel = document.createElement('div');
        panel.id = 'mixer-more-panel';
        panel.className = 'arm-colors-panel mixer-more-panel';
        // Popovers are portaled to <body>, so they carry the strip's button
        // tint with them rather than inheriting the app-root fallback.
        panel.dataset.group = 'core';
        panel.style.display = 'none';
        panel.style.position = 'fixed';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'More faders');
        list = document.createElement('div');
        list.className = 'mixer-more-list';
        panel.appendChild(list);
        var note = document.createElement('div');
        note.className = 'mixer-more-note';
        note.textContent = 'Faders the bar can’t fit at this width. Widen the window to bring them back.';
        panel.appendChild(note);
        // No stopPropagation on the panel: a click on a parked fader must
        // still reach the document closers of the brush drawer and the tip
        // menu, exactly as a click on a bar fader does.
        document.body.appendChild(panel);

        // Close on a press elsewhere in the UI — but NOT on the artwork
        // (arm-colours precedent, 2026-08-27): a fader parked here is one you
        // want to hold open while you paint against it. pointerdown in the
        // CAPTURE phase, because every ⚙ in the strip stops its click.
        document.addEventListener('pointerdown', function (e) {
            if (!isOpen) return;
            var t = e.target;
            if (!t || !t.closest) return;
            if (panel.contains(t) || moreCell.contains(t)) return;
            if (t.closest(INSIDE)) return;
            if (t.closest('#canvas, #canvas-wrapper')) return;
            close();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (!isOpen || e.key !== 'Escape' || e.defaultPrevented) return;
            var inside = panel.contains(document.activeElement);
            close();
            if (inside) { try { moreBtn.focus(); } catch (_) {} }
        });

        // ── Re-measure triggers ──
        window.addEventListener('resize', schedule);
        if ('ResizeObserver' in window) {
            // The strip's own width: focus mode / mobile flip it 0 ↔ W.
            var stripRO = new ResizeObserver(function () {
                var w = strip.clientWidth;
                if (w !== lastStripW) { lastStripW = w; schedule(); }
            });
            stripRO.observe(strip);
            // A cell's content changed size (fonts landed, the material
            // select re-fitted, a readout grew) — the sum moved.
            var cellRO = new ResizeObserver(schedule);
            candidates.forEach(function (c) { cellRO.observe(c); });
        }
        // ui-hidden flips on the cells (43) and mobile-mode on <body> (13).
        var mo = new MutationObserver(schedule);
        candidates.forEach(function (c) { mo.observe(c, { attributes: true, attributeFilter: ['class'] }); });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
            document.fonts.ready.then(schedule, function () {});
        }

        measure();   // synchronous: the bar is right before its first paint
    }

    // The mixer layout builds on its own schedule (DCL → 800ms → rAF on the
    // web, one rAF on the desktop) and inserts the finished strip as a body
    // child, so a childList observer on <body> catches it the moment it
    // lands — before that frame paints. The poll is the fallback.
    function tryBuild() {
        if (built) return true;
        var s = document.getElementById('mixer-strip');
        if (!s) return false;
        build(s);
        return true;
    }
    if (!tryBuild()) {
        var bodyMO = new MutationObserver(function () { if (tryBuild()) bodyMO.disconnect(); });
        bodyMO.observe(document.body || document.documentElement, { childList: true });
        var tries = 0;
        var poll = setInterval(function () {
            if (tryBuild() || tries++ > 600) { clearInterval(poll); bodyMO.disconnect(); }
        }, 100);
    }

    window.StripMore = {
        // Measure now (synchronously) rather than on the next frame.
        measure: function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (built) measure(); },
        open: open,
        close: close,
        toggle: function () { if (isOpen) close(); else open(); },
        isOpen: function () { return isOpen; },
        parked: function () { return built ? parkedCells() : []; },
        candidates: function () { return candidates.slice(); },
        // Every bar cell in canonical order, parked ones spliced back into
        // their slot — what 43 lists under Settings → Interface. null until
        // built, so callers fall back to strip.children.
        stripChildren: function () {
            if (!built || !moreCell) return null;
            var kids = Array.prototype.slice.call(strip.children);
            var pos = kids.indexOf(moreCell), head = [], tail = [];
            kids.forEach(function (k, i) {
                if (k === moreCell || candidates.indexOf(k) >= 0) return;
                (i < pos ? head : tail).push(k);
            });
            return head.concat(candidates, tail);
        },
        // Put a parked cell on screen (44-recipes points at it next).
        reveal: function (el) { if (built && el && list && list.contains(el)) open(); },
        // Off: every fader back in the bar, no More cell, no re-measure
        // until re-enabled (harness tests that read the bar's layout).
        setEnabled: function (on) { enabled = !!on; this.measure(); },
        enabled: function () { return enabled; }
    };
})();
