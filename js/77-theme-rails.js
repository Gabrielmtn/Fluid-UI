// ===================================================================
// js/77-theme-rails.js - Walnut & Copper: overlay scroll rails.
// The sidebars hide their native scrollbars (css/30: a scrollbar takes
// width and squeezes the column, Gabriel 2026-10-18). This lays one slim
// copper thumb over each column's outer right edge instead: sized and
// placed from the column's scroll, draggable, and passing the wheel on to
// the column. Wheel, keys and touch still scroll the column natively; the
// rail is decorative to assistive tech (aria-hidden).
//
// The thumb lives on <body> at position: fixed, in window px, so the
// columns' zoom and scroll never move it. Updates are rAF-batched from the
// column's scroll, its size and its children's size (a drawer opening
// changes scrollHeight without resizing the column); nothing runs at idle.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;

    var MIN_THUMB = 28;     // window px
    var INSET = 3;          // from the column's outer edge, window px
    var BUSY_MS = 900;      // bright after a scroll, then back to faint

    function Rail(col, canvasSide) {
        this.col = col;
        this.edge = canvasSide ? 2.5 : 0;   // the copper line on a canvas-facing edge
        var el = this.el = document.createElement('div');
        el.className = 'wc-rail';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        this.queued = false;
        this.busyT = 0;
        this.geo = null;
        var self = this;
        this.tick = function () { self.queued = false; self.update(); };
        col.addEventListener('scroll', function () { self.flash(); self.schedule(); }, { passive: true });
        el.addEventListener('wheel', function (e) {
            col.scrollBy({ top: e.deltaY, left: 0 });
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('pointerdown', function (e) { self.drag(e); });
        if (typeof ResizeObserver === 'function') {
            this.ro = new ResizeObserver(function () { self.schedule(); });
            this.ro.observe(col);
            this.watchChildren();
            new MutationObserver(function () { self.watchChildren(); self.schedule(); })
                .observe(col, { childList: true });
        }
    }
    Rail.prototype.watchChildren = function () {
        if (!this.ro) return;
        for (var c = this.col.firstElementChild; c; c = c.nextElementSibling) this.ro.observe(c);
    };
    Rail.prototype.schedule = function () {
        if (this.queued) return;
        this.queued = true;
        requestAnimationFrame(this.tick);
    };
    Rail.prototype.flash = function () {
        var el = this.el, self = this;
        el.setAttribute('data-busy', '');
        clearTimeout(this.busyT);
        this.busyT = setTimeout(function () { if (!self.dragging) el.removeAttribute('data-busy'); }, BUSY_MS);
    };
    Rail.prototype.update = function () {
        var col = this.col, el = this.el;
        var max = col.scrollHeight - col.clientHeight;
        var r = col.getBoundingClientRect();
        var shown = max > 1 && r.width > 48 && r.height > 48 && col.offsetParent !== null;
        if (!shown) { el.removeAttribute('data-on'); this.geo = null; return; }
        // scrollHeight / clientHeight / scrollTop share the column's own
        // units, so their ratios hold in window px.
        var th = Math.max(MIN_THUMB, r.height * col.clientHeight / col.scrollHeight);
        var travel = r.height - th - 2 * INSET;
        var top = r.top + INSET + travel * (col.scrollTop / max);
        var left = r.right - INSET - 5 - this.edge;
        this.geo = { travel: travel, max: max };
        el.style.top = top.toFixed(1) + 'px';
        el.style.left = left.toFixed(1) + 'px';
        el.style.height = th.toFixed(1) + 'px';
        el.setAttribute('data-on', '');
    };
    Rail.prototype.drag = function (e) {
        if (e.button !== 0 || !this.geo) return;
        var self = this, col = this.col, el = this.el;
        var y0 = e.clientY, s0 = col.scrollTop, k = this.geo.travel > 0 ? this.geo.max / this.geo.travel : 0;
        this.dragging = true;
        el.setAttribute('data-drag', '');
        el.setAttribute('data-busy', '');
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        function move(ev) { col.scrollTop = s0 + (ev.clientY - y0) * k; }
        function up() {
            self.dragging = false;
            el.removeAttribute('data-drag');
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            self.flash();
        }
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        e.preventDefault();
    };

    var rails = [], made = {};
    // The columns are built by js/20 after this file runs, so a rail is made
    // whenever its column first exists: at start, at the reveal, and on any
    // body class change (js/13's compact switch moves things too).
    function ensure() {
        var cols = [['sidebar-left', true], ['sidebar-right', false]];
        for (var i = 0; i < cols.length; i++) {
            var id = cols[i][0], col = document.getElementById(id);
            if (col && made[id] !== col) { made[id] = col; rails.push(new Rail(col, cols[i][1])); }
        }
    }
    function all() {
        ensure();
        for (var i = 0; i < rails.length; i++) rails[i].schedule();
    }
    function start() {
        window.addEventListener('resize', all, { passive: true });
        if (window.Boot && window.Boot.onReveal) window.Boot.onReveal(function () {
            ensure();
            for (var i = 0; i < rails.length; i++) rails[i].watchChildren();
            all();
        });
        if (typeof MutationObserver === 'function') {
            new MutationObserver(all).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        all();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
