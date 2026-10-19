// ===================================================================
// js/75-theme-overlays.js - Walnut & Copper overlays: presentation hooks
// for modals, menus and floating panels (for example registering their
// panes with ThemeMotion.pane so they strike and surge like the sidebars').
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
//
// Two things, both from the study (design/study-lite.html):
//
//   Panes. js/71 strikes and surges the panes inside the sidebars, the top
//   bar, the Presets panel, the colour popover and the arm tip menu. The
//   overlays' buttons get the same here: the cathode (on 45 ms with the
//   170 ms strike flicker, off 300 ms; study Cathode 1219-1233) and the
//   press surge (spring 600 / 0.70; study pressable 1864-1871), written as
//   --ci only while they move. At rest CSS's own state rules (css/31) hold.
//
//   Opening. An overlay that appears eases in on the drawer spring
//   (180 / 0.85): js/75 writes --ov (0 to 1) on its root while it moves and
//   removes it once settled; css/40 turns --ov into opacity and a short
//   translate. Transforms and opacity only. Focus, keys and clicks are the
//   overlay's from its first frame, exactly as before. Closing is the app's
//   own (instant): delaying a hide would change behaviour.
//
// Under reduced motion springs jump to target and cathodes switch without
// flicker (ThemeMotion's own rules), so nothing is written but the state.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;
    var TM = window.ThemeMotion;
    if (!TM || !TM.run || !TM.Spring || !TM.Cathode) return;

    // ── What counts as an overlay, and when it is open ──────────────────
    // Panes inside js/71's own scopes (.mixer-presets-panel, .cp-pop,
    // .arm-tip-menu) are already animated there and are left alone here;
    // their roots still open on the drawer spring.
    var ROOTS = [
        // Modals: the scrim carries .show (styles.css .delete-modal.show).
        { sel: '.delete-modal', open: function (el) { return el.classList.contains('show'); } },
        // Shown by an inline display (js/05n toggleHotkeys, js/15 showMaskEditor).
        { sel: '#hotkeyOverlay', open: function (el) { return el.style.display === 'flex'; } },
        { sel: '.mask-editor-overlay', open: function (el) { return el.style.display === 'flex'; } },
        // The radial menu is a quick gesture: it strikes on like a cathode
        // (45 ms rise) rather than gliding on the drawer spring.
        { sel: '#radialMenu', open: function (el) { return !el.hidden; }, rise: 0.045 },
        // Popup menus built per opening and removed on close (the preset,
        // palette and shape menus), open as long as they are in the page.
        // The Multi-brush tip menu (.arm-tip-menu) and the room's Invite
        // popover and ⋯ menu (.mp-pop) are other workstreams' (W4, W5).
        { sel: '.brush-shape-menu:not(.arm-tip-menu):not(.mp-pop)', open: function (el) { return !el.hidden && el.style.display !== 'none'; } },
        { sel: '.palette-list, .cp-pop', open: function (el) { return el.isConnected; } },
        // Inline display: the Presets and More panels (js/20, js/46) and the
        // collider source menu (js/20, inside the Layers drawer).
        { sel: '.mixer-presets-panel, #mixer-more-panel, .collision-source-menu', open: function (el) { return !!el.style.display && el.style.display !== 'none'; } },
        // The quality bar's lists open with .open on their pill (js/20).
        { sel: '#quality-underbar .qub-dd', open: function (el) { return el.classList.contains('open'); } }
    ];
    var ROOT_SEL = ROOTS.map(function (r) { return r.sel; }).join(', ');
    // Where this file strikes and surges panes (js/71 does the rest).
    var HOSTS = '.delete-modal, #hotkeyOverlay, .mask-editor-overlay, #skipMenu, #radialMenu, ' +
        '.brush-shape-menu:not(.arm-tip-menu):not(.mp-pop), .palette-list, #mixer-more-panel, #quality-underbar';
    // The radial menu's wedges and their words are panes too: lit while the
    // pointer is over them, with the cathode's afterglow when it moves on.
    var PANE = 'button, .btn, [data-wc-pane], .radial-wedge, .radial-label, .palette-option, .qub-dd-opt';
    var NO_FLICKER = '.radial-wedge, .radial-label';

    function kindOf(el) {
        for (var i = 0; i < ROOTS.length; i++) if (el.matches(ROOTS[i].sel)) return ROOTS[i];
        return null;
    }

    // ── One stepper for everything this file moves ─────────────────────
    var moving = new Set();
    function step(dt) {
        moving.forEach(function (r) { if (r.step(dt)) moving.delete(r); });
        return moving.size === 0;
    }
    function wake(r) { moving.add(r); TM.run(step); }

    // ── Panes: cathode + press surge ────────────────────────────────────
    function isOn(el) {
        if (el._wcIsOn) return !!el._wcIsOn(el);
        return el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' ||
            el.getAttribute('aria-selected') === 'true' || el.classList.contains('active') ||
            el.classList.contains('locked') || el.classList.contains('btn--emphasis') ||
            el.classList.contains('is-hot') || el.classList.contains('sel');
    }
    // A pointer sweeping a wheel is not a switch being thrown: its wedges
    // rise and fade on the cathode's timing without the strike flicker.
    function setCath(r, on) {
        r.cath.set(on, false);
        if (r.el.matches(NO_FLICKER)) r.cath.flick = false;
    }
    function paneOf(t) {
        var el = t && t.closest ? t.closest(PANE) : null;
        return el && el.closest(HOSTS) ? el : null;
    }
    function paneRec(el) {
        if (el._ovl) return el._ovl;
        var on = isOn(el);
        var r = { el: el, cath: new TM.Cathode(), surge: new TM.Spring(0), last: '' };
        r.cath.on = on; r.cath.I = on ? 1 : 0;
        r.step = function (dt) {
            // The press may have changed the pane's own state (a toggle):
            // re-read it while the pane is awake, so it strikes or fades.
            var now = isOn(el);
            if (now !== r.cath.on) setCath(r, now);
            r.cath.step(dt); r.surge.step(dt);
            // (The surge spring undershoots a little on release: never below 0.)
            var I = Math.max(0, Math.min(1, r.cath.out() * (1 + r.surge.x * 0.3) + r.surge.x * 0.14));
            var s = I.toFixed(3);
            if (s !== r.last) { el.style.setProperty('--ci', s); r.last = s; }
            var done = r.cath.settled() && r.surge.settled() && (r.surge.t === 0);
            if (done) { el.style.removeProperty('--ci'); r.last = ''; }
            return done;
        };
        el._ovl = r;
        return r;
    }
    function surge(el, v) {
        var r = paneRec(el);
        if (!moving.has(r)) { var on = isOn(el); r.cath.on = on; r.cath.I = on ? 1 : 0; }
        r.surge.to(v, TM.PROF.local);
        wake(r);
    }
    function syncPane(el) {
        var r = paneRec(el), on = isOn(el);
        if (on !== r.cath.on) { setCath(r, on); wake(r); }
    }
    var pressed = new Set();
    document.addEventListener('pointerdown', function (e) {
        var el = paneOf(e.target);
        if (el) { surge(el, 1); pressed.add(el); }
    }, true);
    function releaseAll() { pressed.forEach(function (el) { surge(el, 0); }); pressed.clear(); }
    document.addEventListener('pointerup', releaseAll, true);
    document.addEventListener('pointercancel', releaseAll, true);
    document.addEventListener('pointerout', function (e) {
        var el = paneOf(e.target);
        if (el && pressed.has(el) && !el.contains(e.relatedTarget)) { surge(el, 0); pressed.delete(el); }
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        var el = paneOf(e.target);
        if (el) { surge(el, 1); pressed.add(el); }
    }, true);
    document.addEventListener('keyup', function (e) {
        var el = paneOf(e.target);
        if (el && pressed.has(el)) { surge(el, 0); pressed.delete(el); }
    }, true);
    document.addEventListener('focusout', function (e) {
        var el = paneOf(e.target);
        if (el && pressed.has(el)) { surge(el, 0); pressed.delete(el); }
    }, true);

    // ── Opening on the drawer spring ────────────────────────────────────
    function openRec(el) {
        if (el._ovlOpen) return el._ovlOpen;
        var kind = kindOf(el), tau = kind && kind.rise;
        var r = { el: el, sp: new TM.Spring(1, TM.PROF.drawer), last: '', guard: 0 };
        r.step = function (dt) {
            // A cathode's exponential rise, or the drawer spring.
            if (tau) { r.sp.x += (1 - r.sp.x) * (1 - Math.exp(-dt / tau)); r.sp.v = 0; }
            else r.sp.step(dt);
            // CSS clamps at 1, so the spring's small overshoot and tail are
            // invisible: done once it reaches the top.
            if (r.sp.settled() || r.sp.x >= 0.998) { end(r); return true; }
            var v = Math.max(0, r.sp.x).toFixed(3);
            if (v !== r.last) { el.style.setProperty('--ov', v); r.last = v; }
            return false;
        };
        el._ovlOpen = r;
        return r;
    }
    function end(r) {
        clearTimeout(r.guard);
        r.el.style.removeProperty('--ov');
        r.last = '';
        moving.delete(r);
    }
    function opened(el) {
        if (TM.reduced()) return;
        var r = openRec(el);
        r.sp.x = 0; r.sp.v = 0; r.sp.to(1, TM.PROF.drawer);
        r.el.style.setProperty('--ov', '0');
        r.last = '0';
        wake(r);
        // If no frame comes (a hidden window), the overlay must not wait
        // for one: it shows as it always did.
        clearTimeout(r.guard);
        r.guard = setTimeout(function () { if (moving.has(r)) end(r); }, 900);
    }
    function closed(el) {
        var r = el._ovlOpen;
        if (r && moving.has(r)) end(r);
    }

    // ── Watching the overlays ───────────────────────────────────────────
    // Each root gets one small observer (its own attributes, and its
    // subtree's pane states while it is up); <body> is watched for roots
    // being added, not its whole subtree.
    function watch(el) {
        if (el._ovlWatch) return;
        var kind = kindOf(el);
        if (!kind) return;
        var was = kind.open(el);
        // The root's own show / hide.
        el._ovlWatch = new MutationObserver(function () {
            var now = kind.open(el);
            if (now !== was) { was = now; if (now) opened(el); else closed(el); }
        });
        el._ovlWatch.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
        // Pane states inside it (no 'style': --ci writes would echo back).
        if (el.closest(HOSTS)) {
            new MutationObserver(function (list) {
                for (var i = 0; i < list.length; i++) {
                    var t = list[i].target;
                    if (t !== el && t.nodeType === 1 && t.matches(PANE) && t.closest(HOSTS)) syncPane(t);
                }
            }).observe(el, { attributes: true, subtree: true,
                attributeFilter: ['class', 'aria-pressed', 'aria-checked', 'aria-selected'] });
        }
        if (was) opened(el);
    }
    function scan(node) {
        if (node.nodeType !== 1) return;
        if (node.matches(ROOT_SEL)) watch(node);
        // A container added whole (the quality bar) brings its roots with it.
        else if (node.firstElementChild) Array.prototype.forEach.call(node.querySelectorAll(ROOT_SEL), watch);
    }
    new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
            var added = list[i].addedNodes;
            for (var j = 0; j < added.length; j++) scan(added[j]);
        }
    }).observe(document.body, { childList: true });
    // The layout is built after this file runs (js/20, after DOMContentLoaded):
    // one sweep once it stands, for the roots it made in place.
    function sweep() { Array.prototype.forEach.call(document.querySelectorAll(ROOT_SEL), watch); }
    sweep();
    var tries = 0;
    (function later() {
        if (document.getElementById('sidebar-right') && document.getElementById('quality-underbar')) { sweep(); return; }
        if (tries++ < 80) setTimeout(later, 250);
    })();

    // The skip menu opens by focus alone (css :focus-within): it eases in
    // when focus arrives from outside it.
    var skipUp = false;
    document.addEventListener('focusin', function (e) {
        var m = document.getElementById('skipMenu');
        if (!m || !m.contains(e.target)) return;
        if (!skipUp) { skipUp = true; opened(m); }
    }, true);
    document.addEventListener('focusout', function (e) {
        var m = document.getElementById('skipMenu');
        if (!m || !m.contains(e.target) || (e.relatedTarget && m.contains(e.relatedTarget))) return;
        skipUp = false; closed(m);
    }, true);

    // The radial menu's live parts wear the drawer fronts' blue herringbone
    // (css/40 fills them with url(#wcRadialBlue) / url(#wcRadialBlueLit)).
    // An SVG fill can't take a CSS image, so the two patterns live here,
    // built once in a hidden SVG that outlives the wheel (js/58 rebuilds its
    // own SVG per opening). Same tile as css/35: 168x240 drawn at half size,
    // already in the image cache from the drawer fronts.
    (function radialPatterns() {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        var defs = document.createElementNS(NS, 'defs');
        // [id, tint over the tile]: the fill dims a little, the lit one lifts.
        [['wcRadialBlue', 'rgba(3, 6, 11, 0.12)'], ['wcRadialBlueLit', 'rgba(150, 190, 255, 0.16)']].forEach(function (p) {
            var pat = document.createElementNS(NS, 'pattern');
            pat.setAttribute('id', p[0]);
            pat.setAttribute('patternUnits', 'userSpaceOnUse');
            pat.setAttribute('width', '84');
            pat.setAttribute('height', '120');
            var img = document.createElementNS(NS, 'image');
            img.setAttribute('href', 'assets/textures/deco-herringbone-tile.jpg');
            img.setAttribute('width', '84');
            img.setAttribute('height', '120');
            img.setAttribute('preserveAspectRatio', 'none');
            var tint = document.createElementNS(NS, 'rect');
            tint.setAttribute('width', '84');
            tint.setAttribute('height', '120');
            tint.setAttribute('fill', p[1]);
            pat.appendChild(img);
            pat.appendChild(tint);
            defs.appendChild(pat);
        });
        svg.appendChild(defs);
        document.body.appendChild(svg);
    })();
})();
