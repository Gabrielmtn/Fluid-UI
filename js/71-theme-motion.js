// ═══════════════════════════════════════════════════════════════════
// js/71-theme-motion.js — Walnut & Copper motion, ported from the study.
//
// Verbatim from design/study-lite.html (v19): Spring + profiles (1207-1218),
// Cathode (1219-1233), the press surge (pressable, 1864-1871), tints + name
// chips (2218-2244) and the per-element frame (sidebarFrame, 2872-2898). The
// atoms (1234-1242) gain momentum and the drawers' height animation
// (2720-2758) becomes transforms; both are described below. Only the
// selectors and one property name change:
// the study's --i is written as --ci here, because the app already uses an
// inherited --i on every sidebar section (js/20 stampGroupRows, on the
// selector contract) and a per-element --i would collide with it.
//
// What it drives (presentation only; no behaviour, value or sync change):
//   --ci   every pane (button / .btn / inline option): cathode on/off with the
//          study's timing (on 45 ms local / 220 ms remote, off 300 / 450 ms,
//          170 ms strike flicker on a local turn-on) plus the press surge,
//          and while Ignite burns, the light it throws on the top-bar panes
//          around it (falloff e^(-d / 220 px)).
//   --dp   every drawer (.sidebar-section): the drawer spring (180 / 0.85).
//          Opening and closing glide (study setDrawer / stepDrawers) without
//          animating layout: the layout changes once per toggle, one
//          measurement is taken then, and the motion is transforms only
//          (css/35): the tray is clipped to --dp of its height (--wc-H) and
//          every section in the column rides --wc-y. A closing drawer keeps
//          its open layout (.wc-closing) until the spring settles.
//   --wl / --wlc  the drawer's lamp: the spring while it moves, and a flash
//          in another player's colour when they change something inside a
//          closed drawer (study 2743-2757).
//   --sp / --spp  a range input's displayed value while it springs toward a
//          change (local 600 / 0.70, remote 120 / 0.95); removed once settled,
//          so programmatic writes always fall back to the live --val.
//   --wc-rot  the atoms: each tray's rosette, one per group that opens with
//          its own bead row (css/35), and the hub of each top-bar dial. A
//          flywheel: every change (a drag, a key, a click, another player's
//          change) adds to its speed; it coasts down when you stop.
//   --ga / --pc / --tgc  another player's change (06e .mp-peer-touch): glow in
//          their colour, τ 1.4 s, and their name chip beside the control.
//
// Loop: NO loop of its own. js/05j update() calls window.__themeFrame() once
// per drawn frame; it returns at once when nothing is moving, and otherwise
// writes only to elements that are still moving. State changes arrive from
// events and attribute mutations the app already makes. Reduced motion:
// springs jump to target, cathodes switch without flicker or afterglow.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var root = document.documentElement;
    if (root.getAttribute('data-theme') !== 'walnut-copper') return;

    var rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var RM = rmq.matches;
    try { rmq.addEventListener('change', function (e) { RM = e.matches; }); } catch (_) {}
    var T = 0;

    // ── Study 1207-1242 ────────────────────────────────────────────────
    var PROF = { local: { k: 600, z: 0.7 }, drawer: { k: 180, z: 0.85 }, remote: { k: 120, z: 0.95 } };
    function Spring(x, p) { this.x = x; this.v = 0; this.t = x; this.p = p || PROF.local; }
    Spring.prototype.to = function (t, p) { if (p) this.p = p; this.t = t; if (RM) { this.x = t; this.v = 0; } };
    Spring.prototype.settled = function () { return this.x === this.t && this.v === 0; };
    Spring.prototype.step = function (dt) {
        if (this.x === this.t && this.v === 0) return;
        var k = this.p.k, z = this.p.z, c = 2 * z * Math.sqrt(k);
        var n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
        for (var i = 0; i < n; i++) { this.v += (k * (this.t - this.x) - c * this.v) * h; this.x += this.v * h; }
        if (Math.abs(this.v) < 1e-4 && Math.abs(this.t - this.x) < 1e-4) { this.x = this.t; this.v = 0; }
    };
    function Cathode() { this.on = false; this.I = 0; this.t0 = -9; this.tau = 0.05; this.flick = false; }
    Cathode.prototype.set = function (on, remote) {
        if (on === this.on) return;
        this.on = on; this.t0 = T; this.flick = on && !remote;
        this.tau = on ? (remote ? 0.22 : 0.045) : (remote ? 0.45 : 0.3);
        if (RM) this.I = on ? 1 : 0;
    };
    Cathode.prototype.step = function (dt) { this.I += ((this.on ? 1 : 0) - this.I) * (1 - Math.exp(-dt / this.tau)); };
    Cathode.prototype.settled = function () { return Math.abs((this.on ? 1 : 0) - this.I) < 1e-3 && !(this.flick && T - this.t0 < 0.17); };
    Cathode.prototype.out = function () {
        var v = this.I;
        if (this.flick && !RM) {
            var age = T - this.t0;
            if (age < 0.17) { var k = age / 0.17; v *= 0.4 + 0.6 * (k + (1 - k) * Math.abs(Math.sin(T * 173) * Math.sin(T * 61))); }
        }
        return v;
    };
    // Atoms (study 1234-1242), with momentum. The study holds a 2.4 rad/s
    // target for 1.1 s per kick, so steady interaction never builds and a
    // drag just peters out. Here a kick adds an impulse to the target speed
    // (J, scaled by the time since the last kick up to TREF, so a drag builds
    // at the same rate whatever the frame or event rate; capped at GMAX), the
    // target decays with the study's 0.42 s, and the speed eases toward it
    // with the same 0.42 s. Kicks apply at most once a frame. One change:
    // ~2.2 rad/s for about a second (the study's spin). A steady drag: ~8
    // rad/s (3.4x) within 2 s. Let go: it coasts under 0.25 rad/s in ~2.2 s.
    // Reduced motion: never spins.
    var FLY = { J: 6, TREF: 0.3, GMAX: 9, TG: 0.42, TW: 0.42 };
    function newAtom() { return { a: 0, w: 0, g: 0, last: -9, kick: false }; }
    function kickAtom(at) { if (at && !RM) at.kick = true; }
    function stepAtom(at, dt, now) {
        if (at.kick) {
            at.kick = false;
            at.g = Math.min(FLY.GMAX, at.g + FLY.J * Math.min(1, (now - at.last) / FLY.TREF));
            at.last = now;
        }
        if (RM) { at.g = at.w = 0; return; }
        at.g *= Math.exp(-dt / FLY.TG);
        if (at.g < 1e-3) at.g = 0;
        at.w += (at.g - at.w) * (1 - Math.exp(-dt / FLY.TW));
        if (at.g === 0 && at.w < 1e-3) at.w = 0;
        at.a += at.w * dt;
    }
    function atomResting(at) { return !at.kick && at.g === 0 && at.w === 0; }

    var active = new Set();        // records with something still moving
    function wake(r) { active.add(r); }
    function remoteNow() { return !!window.__mpApplyingRemote; }

    // ── Panes: cathode + press surge (study rec / pressable / sidebarFrame) ─
    // [data-wc-pane]: a pane registered through ThemeMotion.pane() (a
    // checkbox row, a brush tile...).
    var PANE = 'button, .btn, .wc-opt, [data-wc-pane]';
    function inScope(el) { return !!(el && el.closest && el.closest('#mixer-strip, #sidebar-left, #sidebar-right, .mixer-presets-panel, .cp-pop, .arm-tip-menu')); }
    function isOn(el) {
        // A pane registered through ThemeMotion.pane() says its own state.
        if (el._wcIsOn) return !!el._wcIsOn(el);
        // Limit's .active means the limit is OFF; its lit state is aria-pressed.
        if (el.classList.contains('ch-gate-toggle')) return el.getAttribute('aria-pressed') === 'true';
        return el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' ||
            el.getAttribute('aria-selected') === 'true' || el.classList.contains('active') || el.classList.contains('locked');
    }
    function paneRec(el, create) {
        if (el._wc) return el._wc;
        if (!create) return null;
        // transient: --ci is written only while the pane moves and removed
        // once settled, so CSS's static state rule (e.g. :has(:checked)) is
        // the truth at rest, even after a programmatic change no event saw.
        var r = { kind: 'pane', el: el, cath: new Cathode(), surge: new Spring(0), last: '', transient: !!el._wcTransient };
        var on = isOn(el); r.cath.on = on; r.cath.I = on ? 1 : 0;
        el._wc = r;
        if (!r.transient) write(r);
        return r;
    }
    function write(r) {
        var I = r.cath.out() * (1 + r.surge.x * 0.3) + r.surge.x * 0.14;
        if (r.igK) I += IG.flick * 0.5 * r.igK;                 // the burn's falloff (below)
        var s = Math.min(1, I).toFixed(3);
        if (s !== r.last) { r.el.style.setProperty('--ci', s); r.last = s; }
    }
    function syncPane(el) {
        var r = paneRec(el, true);
        var on = isOn(el);
        if (on !== r.cath.on) { r.cath.set(on, remoteNow()); wake(r); }
        if (el.classList.contains('ch-nudge-btn')) igniteSync(el);
    }

    // ── Ignite: the burn lights the panes around it (study 3263-3305) ──
    // While Ignite burns (held: .active, locked: .locked) its level rises in
    // ~1/6 s and falls with τ 0.35 s after; each top-bar pane brightens by
    // flick * 0.5 * e^(-d / 220 px), d its distance from Ignite, measured
    // once when the burn starts. flick is the study's random 0.55-1 per frame
    // (x 0.7); with PhotoSafe on ("reduce flashing", the default) it is the
    // steady mean, a glow without the flicker. Reduced motion: nothing.
    var IG = { on: false, level: 0, flick: 0, near: [], rec: { kind: 'ignite' } };
    function igniteSync(btn) {
        var on = !RM && (btn.classList.contains('active') || btn.classList.contains('locked'));
        if (on === IG.on) return;
        IG.on = on;
        if (on) {
            var z = parseFloat(getComputedStyle(root).getPropertyValue('--ui-scale')) || 1;
            var b = btn.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            IG.near.forEach(function (r) { r.igK = 0; });
            IG.near = [];
            btn.closest('#mixer-strip').querySelectorAll(PANE).forEach(function (el) {
                var r = el._wc;
                if (el === btn || !r || r.transient) return;
                var q = el.getBoundingClientRect();
                if (!q.width) return;
                var k = Math.exp(-Math.hypot(q.left + q.width / 2 - cx, q.top + q.height / 2 - cy) / z / 220);
                if (k > 0.02) { r.igK = k; IG.near.push(r); }
            });
        }
        wake(IG.rec);
    }
    function stepIgnite(dt) {
        IG.level = IG.on ? Math.min(1, IG.level + dt * 6) : IG.level * Math.exp(-dt / 0.35);
        var done = !IG.on && IG.level < 0.004;
        if (done) IG.level = 0;
        var safe = document.body.classList.contains('photosafe-on');
        IG.flick = IG.level * (safe ? 0.775 : 0.55 + 0.45 * Math.random()) * 0.7;
        IG.near.forEach(function (r) { write(r); if (done) r.igK = 0; });
        if (done) IG.near = [];
        return done;
    }
    function paneOf(t) { var el = t && t.closest ? t.closest(PANE) : null; return el && inScope(el) ? el : null; }
    function surge(el, v) {
        var r = paneRec(el, true);
        // A transient pane at rest re-seats on its live state first (it may
        // have changed without an event).
        if (r.transient && !active.has(r)) { var on = isOn(el); r.cath.on = on; r.cath.I = on ? 1 : 0; }
        r.surge.to(v, PROF.local); wake(r);
    }

    document.addEventListener('pointerdown', function (e) { var el = paneOf(e.target); if (el) surge(el, 1); }, true);
    ['pointerup', 'pointercancel'].forEach(function (t) {
        document.addEventListener(t, function () { pressed.forEach(function (el) { surge(el, 0); }); pressed.clear(); }, true);
    });
    var pressed = new Set();
    document.addEventListener('pointerdown', function (e) { var el = paneOf(e.target); if (el) pressed.add(el); }, true);
    document.addEventListener('pointerout', function (e) { var el = paneOf(e.target); if (el && pressed.has(el) && !el.contains(e.relatedTarget)) { surge(el, 0); pressed.delete(el); } }, true);
    document.addEventListener('keydown', function (e) { if (e.key !== ' ' && e.key !== 'Enter') return; var el = paneOf(e.target); if (el) { surge(el, 1); pressed.add(el); } }, true);
    document.addEventListener('keyup', function (e) { var el = paneOf(e.target); if (el) { surge(el, 0); pressed.delete(el); } }, true);
    document.addEventListener('focusout', function (e) { var el = paneOf(e.target); if (el && pressed.has(el)) { surge(el, 0); pressed.delete(el); } }, true);

    // ── Drawers: the drawer spring on --dp, the glide, the lamp ────────
    // .collapsed (js/20 toggleSection, js/43) stays the truth. A toggle is
    // seen by the observer below; the study's height animation (a layout
    // every frame) becomes, per toggle: one class change for a closing
    // drawer (.wc-closing keeps its layout open while it closes), one
    // measurement (each toggled tray's height and its column's scroll), and
    // transforms each frame (css/35). The sections of a column ride --wc-y:
    //   z + sum over moving drawers above (max(0, x) - 1) * H
    // where x is the drawer spring and H its tray's height (a moving drawer
    // is laid out open, so its tray shows x of H and everything below it
    // closes the rest of the gap). z is the column's scroll compensation:
    // a scroll jump at the toggle (js/20 anchors the clicked header; native
    // anchoring) glides out on the drawer spring, and a closing drawer near
    // the end of a scrolled column leads into the scroll the browser will
    // clamp when its layout collapses.
    function isSection(el) { return el.nodeType === 1 && el.classList.contains('sidebar-section'); }
    function drawerRec(sec, create) {
        if (sec._wcd) return sec._wcd;
        if (!create) return null;
        var open = !sec.classList.contains('collapsed');
        var r = { kind: 'drawer', el: sec, title: sec.querySelector('.section-title'), body: sec.querySelector(':scope > .section-body'),
            sp: new Spring(open ? 1 : 0, PROF.drawer), open: open, moving: false, H: 0, c: null, t0: 0,
            cl: null, tint: null, last: '', lastL: '', lastC: '' };
        sec._wcd = r;
        sec.style.setProperty('--dp', open ? '1' : '0');
        return r;
    }
    // A column: the sections of one sidebar and the element that scrolls them.
    function columnOf(sec) {
        var list = sec.parentElement;
        if (!list) return null;
        if (list._wcc) return list._wcc;
        var scroller = sec.closest('#sidebar-left, #sidebar-right') || list;
        var c = { kind: 'column', list: list, scroller: scroller, secs: [], moving: new Set(), w: new Spring(0, PROF.drawer), za: 0,
            on: false, tail: 0, pre: null, cache: null };
        list._wcc = c;
        // The scroll position before a toggle: read as a header is clicked
        // (notePre), else the last one seen when a scroll came to rest.
        scroller.addEventListener('scrollend', function () { c.cache = scroller.scrollTop; }, { passive: true });
        return c;
    }
    function notePre(t) {
        var sec = t && t.closest && t.closest('.sidebar-section');
        var c = sec && columnOf(sec);
        if (!c) return;
        c.pre = c.scroller.scrollTop;          // one read, at the moment of the toggle
        setTimeout(function () { c.pre = null; }, 0);
    }
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('.section-header') && !t.closest('.section-header-actions')) notePre(t);
    }, true);
    document.addEventListener('keydown', function (e) {
        var t = e.target;
        if ((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('section-title')) notePre(t);
    }, true);

    var lastFrame = -1e9;
    function framesRunning() { return performance.now() - lastFrame < 250; }
    function toggleDrawers(list) {
        var cols = new Map();
        list.forEach(function (r) {
            var open = !r.el.classList.contains('collapsed');
            if (open === r.open) return;
            r.open = open;
            var c = columnOf(r.el);
            // At once: reduced motion, a hidden page, no frames to animate on,
            // or a section js/43 is hiding.
            if (RM || document.hidden || !c || !r.body || !framesRunning() || r.el.classList.contains('ui-hidden')) { settleDrawer(r); return; }
            r.el.classList.toggle('wc-closing', !open);
            r.el.classList.add('wc-mv');
            r.sp.to(open ? 1 : 0, PROF.drawer);
            r.moving = true; r.c = c; r.t0 = performance.now();
            wake(r);
            if (!cols.has(c)) cols.set(c, []);
            cols.get(c).push(r);
        });
        cols.forEach(function (rs, c) { setupColumn(c, rs); });
        if (cols.size) setTimeout(stallGuard, 400);
    }
    function setupColumn(c, rs) {
        rs.forEach(function (r) { c.moving.add(r); });
        c.secs = [].filter.call(c.list.children, isSection);
        c.secs.forEach(function (s) { s.classList.add('wc-off'); });
        c.scroller.classList.add('wc-anim');
        c.on = true; c.tail = 0;
        // The one measurement: the toggled trays at their open height, and
        // the scroll, after the toggle's layout.
        rs.forEach(function (r) { r.H = r.body.offsetHeight; r.el.style.setProperty('--wc-H', r.H + 'px'); });
        var s = c.scroller.scrollTop, sh = c.scroller.scrollHeight, ch = c.scroller.clientHeight;
        var before = c.pre != null ? c.pre : c.cache;
        c.pre = null; c.cache = s;
        c.za = c.za * Math.max(0, c.w.x) + (before == null ? 0 : s - before);
        c.w = new Spring(1, PROF.drawer); c.w.to(0, PROF.drawer);
        // Each closing drawer collapses its layout when it settles; at the end
        // of a scrolled column that pulls the scroll back. Predict it and lead
        // into it (earliest toggle settles first).
        var shk = sh, sk = s;
        Array.from(c.moving).sort(function (a, b) { return a.t0 - b.t0; }).forEach(function (r) {
            var x = Math.min(1, Math.max(0, r.sp.x)), v0 = clampTerm(r), T1 = 0;
            if (!r.open) { shk -= r.H; T1 = Math.max(0, sk - Math.max(0, shk - ch)); sk -= T1; }
            r.cl = { v0: v0, T: T1, x0: x, open: r.open };
        });
        wake(c);
    }
    // A drawer's share of its column's scroll lead: glides from where it was
    // (v0, at x0) to the clamp it will cause (closing) or to 0 (opening).
    function clampTerm(r) {
        var k = r.cl;
        if (!k || !r.moving) return 0;
        var x = Math.min(1, Math.max(0, r.sp.x));
        if (!k.open) return k.x0 > 1e-4 ? k.T - (k.T - k.v0) * (x / k.x0) : k.T;
        return k.x0 < 1 - 1e-4 ? k.v0 * (1 - x) / (1 - k.x0) : 0;
    }
    function settleDrawer(r) {
        r.sp.x = r.sp.t = r.open ? 1 : 0; r.sp.v = 0;
        r.el.style.setProperty('--dp', r.open ? '1' : '0'); r.last = '';
        r.moving = false;
        r.el.classList.remove('wc-closing', 'wc-mv');
        wake(r);
    }
    // No frames (the loop stalled, the page went to the background): land
    // every moving drawer at once rather than leave one half open.
    function stallGuard() {
        if (framesRunning()) return;
        active.forEach(function (r) { if (r.kind === 'drawer' && r.moving) settleDrawer(r); });
        active.forEach(function (r) { if (r.kind === 'column') endColumn(r); });
    }
    // Still to the eye: under a third of a pixel from rest, barely moving.
    // (The spring's own 1e-4 rest is ~0.5 s later and would hold a closed
    // drawer's layout open that long for nothing.)
    function still(sp, px) { return Math.abs(sp.t - sp.x) * px < 0.3 && Math.abs(sp.v) * px < 6; }
    function stepDrawer(r, dt) {
        if (r.moving) {
            r.sp.step(dt);
            if (still(r.sp, Math.max(r.H, 60))) { r.sp.x = r.sp.t; r.sp.v = 0; }
            var d = Math.max(0, Math.min(1.2, r.sp.x)).toFixed(3);
            if (d !== r.last) { r.el.style.setProperty('--dp', d); r.last = d; }
            if (r.sp.settled()) { r.moving = false; r.el.classList.remove('wc-closing', 'wc-mv'); }
        }
        // The lamp (study 2751-2752): the spring, or a tint while it lasts.
        var t = r.tint;
        if (t) {
            t.a *= Math.exp(-dt / 1.4);
            if (t.a < 0.01) { r.tint = t = null; r.title.style.removeProperty('--wlc'); r.lastC = ''; }
        }
        if (!r.title) return !r.moving;
        if (r.moving || t) {
            var L = Math.max(Math.min(1, Math.max(0, r.sp.x)), t ? t.a : 0).toFixed(3);
            if (L !== r.lastL) { r.title.style.setProperty('--wl', L); r.lastL = L; }
            if (t) {
                var m = t.a * 0.85, k = t.rgb;
                var C = Math.round(255 * (1 - m) + k[0] * m) + ' ' + Math.round(110 * (1 - m) + k[1] * m) + ' ' + Math.round(30 * (1 - m) + k[2] * m);
                if (C !== r.lastC) { r.title.style.setProperty('--wlc', C); r.lastC = C; }
            }
            return false;
        }
        if (r.lastL) { r.title.style.removeProperty('--wl'); r.lastL = ''; }
        return true;
    }
    function stepColumn(c, dt) {
        c.w.step(dt);
        if (still(c.w, Math.max(Math.abs(c.za), 1))) { c.w.x = c.w.t; c.w.v = 0; }
        var z = c.za * Math.max(0, c.w.x);
        c.moving.forEach(function (r) { if (r.moving) z += clampTerm(r); else { r.cl = null; c.moving.delete(r); } });
        var acc = z;
        for (var i = 0; i < c.secs.length; i++) {
            var s = c.secs[i], y = acc.toFixed(2) + 'px';
            if (s._wcy !== y) { s.style.setProperty('--wc-y', y); s._wcy = y; }
            var r = s._wcd;
            if (r && r.moving) acc += (Math.max(0, r.sp.x) - 1) * r.H;
        }
        if (c.moving.size || !c.w.settled()) return false;
        // At rest: one more frame with native scroll anchoring off, so the
        // layout a closing drawer just collapsed doesn't re-anchor the scroll.
        if (c.tail++ < 1) return false;
        endColumn(c);
        return true;
    }
    function endColumn(c) {
        c.secs.forEach(function (s) { s.classList.remove('wc-off'); s.style.removeProperty('--wc-y'); s._wcy = ''; });
        c.scroller.classList.remove('wc-anim');
        c.za = 0; c.w = new Spring(0, PROF.drawer); c.on = false;
        c.moving.forEach(function (r) { r.cl = null; });
        c.moving.clear();
    }
    // Another player changed something inside a closed drawer: its lamp
    // flashes in their colour and fades (study 2755-2757).
    function tintLamp(face) {
        var sec = face.closest && face.closest('.sidebar-section');
        var r = sec && drawerRec(sec, true);
        if (!r || r.open || RM) return;
        r.tint = { a: 1, rgb: rgbOf(face.style.getPropertyValue('--mp-peer') || '#5ab0ff') };
        wake(r);
    }

    // ── Atoms: which one a change spins ────────────────────────────────
    // Group heads and boxes that open with their own bead row; the same list
    // as css/35. A change spins its group's atom, or the tray's own (its
    // first group) when it sits before any of them.
    var NOT_FIRST = ':not(:nth-child(1 of :not([hidden], [style*="display: none"], [style*="display:none"], input[type="file"])))';
    var GROUP = [
        '.section-body > .brush-section-label' + NOT_FIRST + ':not(:has(+ select))',
        '.section-body > div' + NOT_FIRST + ' > .brush-section-label:first-child:not([for]):not(.brush-time-group > *)',
        '.brush-settings-panel > .brush-fold', '.brush-settings-panel > .brush-fold ~ .brush-section-label',
        '.layers-subsection', '.layers-options-group', '.mutation-locks', '#layersPanel > .layer-item',
        '.fx-cluster + .fx-group', '.control-group:has(#saveSettingsBtn)', 'div:has(> #sidebarPresetList)'
    ].join(', ');
    var DIAL = '#mixer-strip > .mixer-channel:is([data-ui-key="Viscosity"], [data-ui-key="Isolation"], [data-ui-key="Density"], [data-ui-key="Velocity"]) input[type=range]';
    function groupOf(el) {
        var body = el.closest('.section-body');
        if (!body) return null;
        for (var n = el; n && n !== body; n = n.parentElement) {
            if (n.matches(GROUP)) return n;
            for (var p = n.previousElementSibling; p; p = p.previousElementSibling) if (p.matches(GROUP)) return p;
        }
        return body;
    }
    function atomRec(el) {
        return el._wca || (el._wca = { kind: 'atom', el: el, at: newAtom(), last: '' });
    }
    function spin(el) { var r = atomRec(el); kickAtom(r.at); wake(r); }
    function kickFor(el) {
        if (RM || !el || !el.closest) return;
        if (el.matches(DIAL)) { spin(el); return; }
        var sec = el.closest('.sidebar-section');
        if (!sec || sec.classList.contains('collapsed')) return;     // nothing to see spin
        var g = groupOf(el);
        if (g) spin(g);
    }

    // ── Ranges: the displayed value springs toward a change ────────────
    function rangeRec(inp) {
        if (inp._wcr) return inp._wcr;
        var r = { kind: 'range', el: inp, sp: new Spring(norm(inp)), last: '' };
        inp._wcr = r;
        return r;
    }
    function norm(inp) {
        var mn = parseFloat(inp.min), mx = parseFloat(inp.max), v = parseFloat(inp.value);
        if (!isFinite(mn)) mn = 0; if (!isFinite(mx)) mx = 100; if (!isFinite(v)) v = mn;
        return mx > mn ? (v - mn) / (mx - mn) : 0;
    }
    // Seen before it changes: at init for the built UI, and on press / focus
    // for anything created later, so the spring starts from the shown value.
    function seeRange(t) {
        if (!(t && t.type === 'range' && inScope(t))) return;
        var r = rangeRec(t);
        // A settled spring re-seats on the live value (a preset or a remote
        // write may have moved it without an event).
        if (r.sp.settled()) { var n = norm(t); r.sp.x = r.sp.t = n; }
    }
    var held = null;
    document.addEventListener('pointerdown', function (e) {
        seeRange(e.target);
        if (e.target && e.target.type === 'range') {
            var t = e.target;
            // The first jump (a click on the track) still springs; the drag after it rides the hand.
            setTimeout(function () { if (held === null) held = t; }, 0);
        }
    }, true);
    ['pointerup', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, function () { held = null; }, true); });
    document.addEventListener('focusin', function (e) { seeRange(e.target); }, true);
    document.addEventListener('input', function (e) {
        var inp = e.target;
        if (!inp || !inScope(inp)) return;
        // Every change spins its atom, a held drag included (study setLocal
        // kicks on each one); another player's glides arrive here too.
        kickFor(inp);
        if (inp.type !== 'range') return;
        var r = rangeRec(inp);
        // While the pointer holds this range the hand IS the value: the spring
        // sits on it (no per-frame write during a drag; the drag forced a style
        // recalc a frame). Keys, track clicks and remote changes still spring.
        if (held === inp) { r.sp.x = r.sp.t = norm(inp); r.sp.v = 0; if (r.last) { inp.style.removeProperty('--sp'); inp.style.removeProperty('--spp'); r.last = ''; } return; }
        r.sp.to(norm(inp), remoteNow() ? PROF.remote : PROF.local);
        if (r.sp.settled()) return;
        wake(r);
    }, true);
    document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !inScope(t)) return;
        // A checkbox / radio inside a registered pane: its state is a
        // property, not an attribute, so the observer can't see it.
        var p = paneOf(t); if (p && p._wc) syncPane(p);
        kickFor(t);
    }, true);
    // Buttons, radios and option rows inside a drawer change things too.
    document.addEventListener('click', function (e) {
        var t = e.target, b = t && t.closest && t.closest('button, [role="button"], [role="radio"], [role="checkbox"], [role="option"], [role="switch"]');
        if (b && b.closest('.section-body')) kickFor(b);
    }, true);

    // ── Another player's change: glow in their colour + name chip ──────
    // 06e flashControl marks the control's face .mp-peer-touch and writes
    // --mp-peer (the player's colour). The name is the one 06e shows in the
    // activity line, read when the chip is shown.
    var tints = new Map();
    function rgbOf(css) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(css).trim());
        if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
        var n = String(css).match(/\d+(\.\d+)?/g);
        return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : [90, 176, 255];
    }
    function tint(face) {
        var css = face.style.getPropertyValue('--mp-peer') || '#5ab0ff';
        var t = tints.get(face) || { kind: 'tint', el: face, a: 1 };
        t.a = 1; t.css = css; t.rgb = rgbOf(css);
        tints.set(face, t); wake(t);
        chipQueue.push(face);
    }
    function stepTint(t, dt) {
        t.a *= Math.exp(-dt / 1.4);
        var m = t.a * 0.85, c = t.rgb;
        t.el.style.setProperty('--ga', t.a.toFixed(3));
        t.el.style.setProperty('--pc', t.css);
        t.el.style.setProperty('--tgc', Math.round(255 * (1 - m) + c[0] * m) + ' ' + Math.round(110 * (1 - m) + c[1] * m) + ' ' + Math.round(30 * (1 - m) + c[2] * m));
        if (t.a < 0.01) {
            tints.delete(t.el);
            t.el.style.setProperty('--ga', '0');
            t.el.style.removeProperty('--tgc');
            return true;
        }
        return false;
    }
    // Chips (study 94-99, 1472-1485, 2237-2248): beside the control in the
    // top bar (left of it near the right edge), above it in the sidebars.
    var chipLayer = null, chips = new Map(), chipQueue = [];
    function whoName() {
        var w = document.querySelector('#mpActivity .mp-activity-who');
        return w ? w.textContent.trim() : '';
    }
    function showChip(face) {
        var name = whoName();
        if (!name) return;
        if (!chipLayer) {
            chipLayer = document.createElement('div');
            chipLayer.className = 'wc-chips';
            chipLayer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(chipLayer);
        }
        var c = chips.get(name);
        if (!c) {
            c = document.createElement('span');
            c.className = 'wc-chip';
            c.textContent = name;
            chipLayer.appendChild(c);
            chips.set(name, c);
        }
        c.style.setProperty('--c', face.style.getPropertyValue('--mp-peer') || '#5ab0ff');
        var r = face.getBoundingClientRect();           // on change only, never per frame
        if (!r.width) return;
        var top = face.closest('#mixer-strip');
        c.classList.toggle('aside', !!top);
        if (top) {
            var flip = r.right > innerWidth - 100;
            c.classList.toggle('flip', flip);
            c.style.left = (flip ? r.left - 6 : r.right + 6) + 'px';
            c.style.top = (r.top + r.height / 2) + 'px';
        } else {
            c.classList.remove('flip');
            c.style.left = (r.left + r.width / 2) + 'px';
            c.style.top = r.top + 'px';
        }
        c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
        clearTimeout(c._t); c._t = setTimeout(function () { c.classList.remove('show'); }, 1500);
    }

    // ── State changes the app already makes ────────────────────────────
    var mo = new MutationObserver(function (list) {
        var toggled = [];
        for (var i = 0; i < list.length; i++) {
            var el = list[i].target;
            if (el.nodeType !== 1) continue;
            if (list[i].attributeName === 'class') {
                if (el.classList.contains('sidebar-section')) {
                    var d = drawerRec(el, true);
                    if (d.open === el.classList.contains('collapsed') && toggled.indexOf(d) < 0) toggled.push(d);
                    continue;
                }
                if (el.classList.contains('mp-peer-touch') && !(list[i].oldValue || '').match(/\bmp-peer-touch\b/)) {
                    tint(el); tintLamp(el); kickFor(el);
                }
            }
            if (el.matches && el.matches(PANE) && inScope(el)) syncPane(el);
        }
        if (toggled.length) toggleDrawers(toggled);
    });

    function init() {
        var strip = document.getElementById('mixer-strip');
        if (!strip || !document.getElementById('sidebar-right')) return false;
        document.querySelectorAll('#mixer-strip, #sidebar-left, #sidebar-right').forEach(function (host) {
            host.querySelectorAll(PANE).forEach(function (el) { paneRec(el, true); });
            host.querySelectorAll('.sidebar-section').forEach(function (s) { drawerRec(s, true); });
            host.querySelectorAll('input[type=range]').forEach(function (i) { rangeRec(i); });
        });
        document.querySelectorAll('#sidebar-left .sidebar-section, #sidebar-right .sidebar-section').forEach(function (s) {
            var c = columnOf(s);
            if (c && c.cache == null) c.cache = c.scroller.scrollTop;
        });
        mo.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true,
            attributeFilter: ['class', 'aria-pressed', 'aria-checked', 'aria-selected'] });
        return true;
    }

    // ── The frame: called from js/05j update(), once per drawn frame ───
    var lastNow = 0;
    window.__themeFrame = function () {
        var now = performance.now();
        var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 0.016;
        lastNow = now; lastFrame = now;
        if (chipQueue.length) { var q = chipQueue; chipQueue = []; q.forEach(showChip); }
        if (!active.size) return;
        T += dt;
        var cols = null;
        active.forEach(function (r) {
            var done = false;
            if (r.kind === 'pane') {
                r.cath.step(dt); r.surge.step(dt); write(r);
                done = r.cath.settled() && r.surge.settled();
                if (done && r.transient) { r.el.style.removeProperty('--ci'); r.last = ''; }
            } else if (r.kind === 'column' || r.kind === 'ignite') {
                // After every drawer and pane has stepped: the column offsets
                // read the drawers' springs, the burn adds to the panes' light.
                (cols || (cols = [])).push(r);
            } else if (r.kind === 'drawer') {
                done = stepDrawer(r, dt);
            } else if (r.kind === 'atom') {
                stepAtom(r.at, dt, now / 1000);
                var rot = (r.at.a * 57.2958 % 360).toFixed(1) + 'deg';
                if (rot !== r.last) { r.el.style.setProperty('--wc-rot', rot); r.last = rot; }
                done = atomResting(r.at);
            } else if (r.kind === 'range') {
                r.sp.step(dt);
                if (r.sp.settled()) {
                    r.el.style.removeProperty('--sp'); r.el.style.removeProperty('--spp'); r.last = '';
                    done = true;
                } else {
                    var x = Math.max(0, Math.min(1.02, r.sp.x)).toFixed(4);
                    if (x !== r.last) { r.el.style.setProperty('--sp', x); r.el.style.setProperty('--spp', (x * 100).toFixed(2) + '%'); r.last = x; }
                }
            } else if (r.kind === 'tint') {
                done = stepTint(r, dt);
            } else if (r.kind === 'fn') {
                // ThemeMotion.run(): the stepper returns true once settled.
                done = !!r.fn(dt, T);
            }
            if (done) active.delete(r);
        });
        if (cols) cols.forEach(function (c) { if (c.kind === 'ignite' ? stepIgnite(dt) : stepColumn(c, dt)) active.delete(c); });
    };

    // Pane widths are fixed in CSS (33-theme-topbar), snapped to the 24 px
    // module there: measuring and snapping them here after boot re-flowed the
    // bar late and resized the canvas under the user.

    var tries = 0;
    (function attach() { if (!init() && tries++ < 80) setTimeout(attach, 250); })();

    // -- Shared hooks for the other theme scripts (js/69, 70, 72-74) -----
    // Everything rides this one frame; no script adds a loop of its own.
    window.ThemeMotion = {
        active: function () { return active.size; },
        // Step fn(dt, T) once per drawn frame until it returns true. Call it
        // again (it re-wakes) whenever something new starts moving.
        run: function (fn) { var r = fn._wcRun || (fn._wcRun = { kind: 'fn', fn: fn }); wake(r); return r; },
        // Register el as a cathode pane. isOnFn(el) -> lit; default: the
        // checked state of the checkbox / radio el is or holds. opts.transient
        // (default true for input-backed panes): --ci only while moving.
        pane: function (el, isOnFn, opts) {
            if (!el) return null;
            var inputBacked = !isOnFn;
            el._wcIsOn = isOnFn || function (x) {
                var i = x.matches('input') ? x : x.querySelector('input[type=checkbox], input[type=radio]');
                return !!(i && i.checked);
            };
            el._wcTransient = opts && 'transient' in opts ? !!opts.transient : inputBacked;
            el.setAttribute('data-wc-pane', '');
            return paneRec(el, true);
        },
        // Re-read a pane's state after a change no attribute shows.
        sync: function (el) { if (el && (el._wc || el.matches(PANE))) syncPane(el); },
        // Spin the atom of el's group (or of its drawer's tray, or el's dial),
        // as a settings change does.
        kick: function (el) { kickFor(el); },
        Spring: Spring, Cathode: Cathode, PROF: PROF,
        reduced: function () { return RM; },
        now: function () { return T; }
    };
})();
