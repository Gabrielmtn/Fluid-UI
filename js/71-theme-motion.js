// ═══════════════════════════════════════════════════════════════════
// js/71-theme-motion.js — Walnut & Copper motion, ported from the study.
//
// Verbatim from design/study-lite.html (v19): Spring + profiles (1207-1218),
// Cathode (1219-1233), atom spin (1234-1242), the press surge (pressable,
// 1864-1871), tints + name chips (2218-2244) and the per-element frame
// (sidebarFrame, 2872-2898). Only the selectors and one property name change:
// the study's --i is written as --ci here, because the app already uses an
// inherited --i on every sidebar section (js/20 stampGroupRows, on the
// selector contract) and a per-element --i would collide with it.
//
// What it drives (presentation only; no behaviour, value or sync change):
//   --ci   every pane (button / .btn / inline option): cathode on/off with the
//          study's timing (on 45 ms local / 220 ms remote, off 300 / 450 ms,
//          170 ms strike flicker on a local turn-on) plus the press surge.
//   --dp   every drawer (.sidebar-section): the drawer spring (180 / 0.85).
//   --sp / --spp  a range input's displayed value while it springs toward a
//          change (local 600 / 0.70, remote 120 / 0.95); removed once settled,
//          so programmatic writes always fall back to the live --val.
//   --rot  the tray rosette: rests, spins ~1.1 s when its drawer's settings
//          change, settles.
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
    function newAtom() { return { a: 0, w: 0, until: -1 }; }
    function kickAtom(at) { if (at) at.until = T + 1.1; }
    function stepAtom(at, dt) {
        var tgt = (!RM && T < at.until) ? 2.4 : 0;
        at.w += (tgt - at.w) * (1 - Math.exp(-dt / 0.42));
        if (tgt === 0 && at.w < 1e-3) at.w = 0;
        at.a += at.w * dt;
    }

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
        var s = Math.min(1, I).toFixed(3);
        if (s !== r.last) { r.el.style.setProperty('--ci', s); r.last = s; }
    }
    function syncPane(el) {
        var r = paneRec(el, true);
        var on = isOn(el);
        if (on !== r.cath.on) { r.cath.set(on, remoteNow()); wake(r); }
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

    // ── Drawers: the drawer spring on --dp ─────────────────────────────
    function drawerRec(sec, create) {
        if (sec._wcd) return sec._wcd;
        if (!create) return null;
        var open = !sec.classList.contains('collapsed');
        var r = { kind: 'drawer', el: sec, sp: new Spring(open ? 1 : 0, PROF.drawer), atom: newAtom(), last: '', lastRot: '' };
        sec._wcd = r;
        sec.style.setProperty('--dp', open ? '1' : '0');
        return r;
    }
    function syncDrawer(sec) {
        var r = drawerRec(sec, true), open = !sec.classList.contains('collapsed');
        if (r.sp.t !== (open ? 1 : 0)) { r.sp.to(open ? 1 : 0, PROF.drawer); wake(r); }
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
        if (!inp || inp.type !== 'range' || !inScope(inp)) return;
        var r = rangeRec(inp);
        // While the pointer holds this range the hand IS the value: the spring
        // sits on it (no per-frame write during a drag; the drag forced a style
        // recalc a frame). Keys, track clicks and remote changes still spring.
        if (held === inp) { r.sp.x = r.sp.t = norm(inp); r.sp.v = 0; if (r.last) { inp.style.removeProperty('--sp'); inp.style.removeProperty('--spp'); r.last = ''; } return; }
        r.sp.to(norm(inp), remoteNow() ? PROF.remote : PROF.local);
        if (r.sp.settled()) return;
        wake(r);
        kickSectionOf(inp);
    }, true);
    document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !inScope(t)) return;
        // A checkbox / radio inside a registered pane: its state is a
        // property, not an attribute, so the observer can't see it.
        var p = paneOf(t); if (p && p._wc) syncPane(p);
        kickSectionOf(t);
    }, true);
    function kickSectionOf(el) {
        var sec = el.closest && el.closest('.sidebar-section');
        if (!sec) return;
        var r = drawerRec(sec, true);
        kickAtom(r.atom); wake(r);
    }

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
        for (var i = 0; i < list.length; i++) {
            var el = list[i].target;
            if (el.nodeType !== 1) continue;
            if (list[i].attributeName === 'class') {
                if (el.classList.contains('sidebar-section')) { syncDrawer(el); continue; }
                if (el.classList.contains('mp-peer-touch') && !(list[i].oldValue || '').match(/\bmp-peer-touch\b/)) tint(el);
            }
            if (el.matches && el.matches(PANE) && inScope(el)) syncPane(el);
        }
    });

    function init() {
        var strip = document.getElementById('mixer-strip');
        if (!strip || !document.getElementById('sidebar-right')) return false;
        document.querySelectorAll('#mixer-strip, #sidebar-left, #sidebar-right').forEach(function (host) {
            host.querySelectorAll(PANE).forEach(function (el) { paneRec(el, true); });
            host.querySelectorAll('.sidebar-section').forEach(function (s) { drawerRec(s, true); });
            host.querySelectorAll('input[type=range]').forEach(function (i) { rangeRec(i); });
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
        lastNow = now;
        if (chipQueue.length) { var q = chipQueue; chipQueue = []; q.forEach(showChip); }
        if (!active.size) return;
        T += dt;
        active.forEach(function (r) {
            var done = false;
            if (r.kind === 'pane') {
                r.cath.step(dt); r.surge.step(dt); write(r);
                done = r.cath.settled() && r.surge.settled();
                if (done && r.transient) { r.el.style.removeProperty('--ci'); r.last = ''; }
            } else if (r.kind === 'drawer') {
                r.sp.step(dt); stepAtom(r.atom, dt);
                var d = Math.max(0, r.sp.x).toFixed(3);
                if (d !== r.last) { r.el.style.setProperty('--dp', d); r.last = d; }
                var rot = (r.atom.a * 57.2958 % 360).toFixed(1) + 'deg';
                if (rot !== r.lastRot) { r.el.style.setProperty('--rot', rot); r.lastRot = rot; }
                done = r.sp.settled() && r.atom.w === 0 && T >= r.atom.until;
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
        // Spin the rosette of el's drawer, as a settings change does.
        kick: function (el) { if (el) kickSectionOf(el); },
        Spring: Spring, Cathode: Cathode, PROF: PROF,
        reduced: function () { return RM; },
        now: function () { return T; }
    };
})();
