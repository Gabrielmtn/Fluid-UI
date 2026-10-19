// ═══════════════════════════════════════════════════════════════════
// js/70-theme-telegraphs.js — Walnut & Copper engine order telegraphs.
//
// Draws the study's telegraph faces (design/study-lite.html, "engine order
// telegraphs", v19 1565-1708) over the top bar's Laminar / Blend and Time
// cells. The face is presentation only: aria-hidden, pointer-events none.
// The control is still the cell's own range input underneath (the
// perceptual proxy), with the same value, step and keys, and the canonical
// inputs (#colorBlend, #timeScale) keep every reader and writer they had.
// The study's Page-key order jumps are NOT ported (keys are frozen,
// prep/README.md); the pointer is js/76's (press on the lever's angle, then
// a two-way relative drag).
//
// The face follows the CANONICAL value. It is redrawn only when a value
// changes: the canonical input's input/change events, plus a MutationObserver
// on the proxy's style attribute, which js/20 rewrites (--val) on every
// reflection, including its 250 ms poll and remote glides. No loop of its
// own: the lever eases to a change on a spring stepped by js/71's frame.
//
// Mapping to the app:
//   Laminar / Blend  canonical -1..1 (Laminar < 0 < Blend). The halves
//                    crossfade as the study's do: LAMINAR lights with
//                    (1 - v) / 2, BLEND with (1 + v) / 2, so both glow half
//                    at 0 and a label lights while its half is more than half
//                    lit; the nixies show |v| (0.00-1.00), the app's value;
//                    the lever sits at the top for 0; the plate reads LAMINAR,
//                    NEUTRAL (exactly 0) or BLEND.
//   Time             canonical 0.01..3, the study's square-root sweep and five
//                    orders (SLOW, HALF, FULL, DOUBLE, TRIPLE); the value in
//                    nixies under the hub, the
//                    current order on the brass flag, which drops out and the
//                    next drops in (text swap only under reduced motion).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;

    var SVGNS = 'http://www.w3.org/2000/svg';
    var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

    var TELE = {
        laminar: {
            key: 'Color Blend', canonical: 'colorBlend', proxy: 'colorBlendPerceptual',
            toF: function (v) { return (Math.max(-1, Math.min(1, v)) + 1) / 2; },
            orders: [['LAMINAR', 0, 0.5], ['BLEND', 0.5, 1]],         // in f (sweep) units
            // The plate: NEUTRAL only at exactly 0 (Gabriel 2026-10-18).
            plate: ['LAMINAR', 'NEUTRAL', 'BLEND'],
            plateOf: function (v) { return v < 0 ? 0 : (v > 0 ? 2 : 1); }
        },
        time: {
            key: 'Time', canonical: 'timeScale', proxy: 'timeScalePerceptual',
            toF: function (v) { return Math.sqrt(Math.max(0, (v - 0.01) / 2.99)); },
            // Named by multiplier (Gabriel 2026-10-17): Full is on time.
            orders: [['SLOW', 0.01, 0.35], ['HALF', 0.35, 0.75], ['FULL', 0.75, 1.5], ['DOUBLE', 1.5, 2.5], ['TRIPLE', 2.5, 3]]   // in value units
        }
    };

    // The order plate and the value tubes, shared by both faces so their
    // numbers are the same size. Plate text is fitted to the plate's width.
    var PLATE = { w: 56, h: 14, y: 41, fs: 10.5 };
    var TUBES = { cy: 27, w: 11, h: 17, fs: 14 };

    function ang(f) { return -120 + 240 * f; }
    function polar(r, a) { var t = (a - 90) * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; }
    function wedge(r0, r1, a0, a1) {
        var p0 = polar(r1, a0), p1 = polar(r1, a1), p2 = polar(r0, a1), p3 = polar(r0, a0), lg = (a1 - a0) > 180 ? 1 : 0;
        return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r1 + ' ' + r1 + ' 0 ' + lg + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
            'L' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) + 'A' + r0 + ' ' + r0 + ' 0 ' + lg + ' 0 ' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) + 'Z';
    }
    // The thin rings run with the sweep only (-120..120 through the top), so
    // nothing crosses the readout in the bottom gap.
    function openRing(r) {
        var a = polar(r, -120), b = polar(r, 120);
        return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 1 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
    }
    // The readout's copper lug: a plate under the tubes whose sides flow down
    // into the bezel, so the readout is part of the iron, not a box inside it.
    function lugD(half, yTop, rim) {
        var xb = Math.max(6, half - 7), yb = Math.sqrt(rim * rim - xb * xb);
        var f = function (n) { return n.toFixed(2); };
        return 'M' + f(-half) + ' ' + f(yTop) + 'C' + f(-half) + ' ' + f(yTop + 6) + ' ' + f(-xb - 1.5) + ' ' + f(yb - 5) + ' ' + f(-xb) + ' ' + f(yb) +
            'A' + rim + ' ' + rim + ' 0 0 0 ' + f(xb) + ' ' + f(yb) +
            'C' + f(xb + 1.5) + ' ' + f(yb - 5) + ' ' + f(half) + ' ' + f(yTop + 6) + ' ' + f(half) + ' ' + f(yTop) + 'Z';
    }
    // Nixie tubes for the characters of a value: a tube per digit, the
    // decimal point as a lit dot between two tubes.
    function tubesSVG(id, text, cy, w, h, fs) {
        var digits = [], dotAfter = -1;
        String(text).split('').forEach(function (ch) {
            if (/[0-9-]/.test(ch)) digits.push(ch);
            else if (ch === '.' && digits.length) dotAfter = digits.length - 1;
        });
        if (!digits.length) return { svg: '', half: 0 };
        var gap = 1.4, total = digits.length * w + (digits.length - 1) * gap, x0 = -total / 2, y = cy - h / 2;
        var out = digits.map(function (d, n) {
            var x = x0 + n * (w + gap);
            return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w + '" height="' + h + '" rx="' + (w * 0.36).toFixed(2) + '" fill="url(#' + id + '-glass)" stroke="rgba(214,140,92,.85)" stroke-width=".8"/>' +
                '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w + '" height="' + h + '" rx="' + (w * 0.36).toFixed(2) + '" fill="url(#' + id + '-mesh)"/>' +
                '<text class="nxg" style="font-size:' + fs + 'px" x="' + (x + w / 2).toFixed(2) + '" y="' + (y + h * 0.78).toFixed(2) + '" text-anchor="middle">8</text>' +
                '<text class="nxd" style="font-size:' + fs + 'px" x="' + (x + w / 2).toFixed(2) + '" y="' + (y + h * 0.78).toFixed(2) + '" text-anchor="middle">' + d + '</text>';
        }).join('');
        if (dotAfter >= 0 && dotAfter < digits.length - 1) {
            var dx = x0 + (dotAfter + 1) * (w + gap) - gap / 2;
            out += '<circle class="nxp" cx="' + dx.toFixed(2) + '" cy="' + (y + h - 2.2).toFixed(2) + '" r="1.2"/>';
        }
        return { svg: out, half: total / 2 };
    }
    function defsSVG(id) {
        return '<linearGradient id="' + id + '-lug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d79b70"/><stop offset=".35" stop-color="#9a5a36"/><stop offset="1" stop-color="#5a2e17"/></linearGradient>' +
            '<pattern id="' + id + '-mesh" width="4" height="6.928" patternUnits="userSpaceOnUse"><path d="M2 0L4 1.155V3.464L2 4.619L0 3.464V1.155ZM2 4.619V6.928" fill="none" stroke="rgba(255,220,190,.10)" stroke-width=".4"/></pattern>' +
            '<radialGradient id="' + id + '-glass" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#1c1210"/><stop offset="1" stop-color="#070403"/></radialGradient>';
    }
    function lugSVG(id, half, yTop, rim) {
        return '<path d="' + lugD(half, yTop, rim) + '" fill="url(#' + id + '-lug)" stroke="#3a1c0c" stroke-width=".6"/>' +
            '<path d="M' + (-half + 1.5).toFixed(2) + ' ' + (yTop + 0.6).toFixed(2) + 'H' + (half - 1.5).toFixed(2) + '" stroke="rgba(255,225,195,.45)" stroke-width=".6"/>';
    }
    var roseD = '';
    for (var i = 0; i <= 120; i++) {
        var ra = i / 120 * 6.2832, rr = 8 * Math.abs(Math.cos(3 * ra));
        roseD += (i ? 'L' : 'M') + (Math.cos(ra) * rr).toFixed(2) + ' ' + (Math.sin(ra) * rr).toFixed(2);
    }

    function faceSVG(k, C) {
        var id = 'wct-' + k, isLam = k === 'laminar';
        var secs = '', labs = '', ticks = '', arcs = '';
        C.orders.forEach(function (o, n) {
            var f0 = isLam ? o[1] : C.toF(o[1]), f1 = isLam ? o[2] : C.toF(o[2]);
            var a0 = ang(f0), a1 = ang(f1), mid = (a0 + a1) / 2;
            secs += '<path class="sec" d="' + wedge(33, 57, a0, a1) + '" fill="rgb(255 110 30 / .05)" stroke="rgba(214,140,92,.55)" stroke-width=".6"/>';
            if (isLam) {
                var r = 41.5, h = 54, s = polar(r, mid - h), e = polar(r, mid + h);
                arcs += '<path id="' + id + '-arc' + n + '" d="M' + s[0].toFixed(2) + ' ' + s[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 0 1 ' + e[0].toFixed(2) + ' ' + e[1].toFixed(2) + '" fill="none"/>';
                labs += '<text class="tlab tcurve" fill="#cbb59f"><textPath href="#' + id + '-arc' + n + '" startOffset="50%" text-anchor="middle">' + o[0] + '</textPath></text>';
            }
        });
        for (var a = -120; a <= 120; a += 10) {
            var t0 = polar(58.5, a), t1 = polar(a % 30 ? 60.5 : 62, a);
            ticks += 'M' + t0[0].toFixed(2) + ' ' + t0[1].toFixed(2) + 'L' + t1[0].toFixed(2) + ' ' + t1[1].toFixed(2);
        }
        // Both faces (Gabriel 2026-10-18): the value in tubes under the hub,
        // the same size on both, and the order's plate below them, low in
        // the bezel gap on a lug into the rim.
        var nix = '<g class="tvalnix"></g>' +
            lugSVG(id, 26, 53, 64) +
            '<g class="slot"><rect x="-' + (PLATE.w / 2 + 1.5) + '" y="' + (PLATE.y - 1.5) + '" width="' + (PLATE.w + 3) + '" height="' + (PLATE.h + 3) + '" rx="2.4" fill="#050302" stroke="url(#' + id + '-cu)" stroke-width="1.4"/>' +
            '<g clip-path="url(#' + id + '-clip)"><g class="flag"><rect x="-' + PLATE.w / 2 + '" y="' + PLATE.y + '" width="' + PLATE.w + '" height="' + PLATE.h + '" fill="url(#' + id + '-plate)"/>' +
            '<path d="M-' + PLATE.w / 2 + ' ' + (PLATE.y + 0.5) + 'H' + PLATE.w / 2 + '" stroke="rgba(255,245,230,.6)" stroke-width=".5"/><text class="flagt" text-anchor="middle" y="' + (PLATE.y + PLATE.h * 0.77).toFixed(2) + '"></text></g>' +
            '<rect x="-' + PLATE.w / 2 + '" y="' + PLATE.y + '" width="' + PLATE.w + '" height="' + PLATE.h + '" fill="url(#' + id + '-well)"/></g></g>';
        return '<svg viewBox="-70 -70 140 140" aria-hidden="true" focusable="false">' +
            '<defs>' +
            '<linearGradient id="' + id + '-cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a62"/><stop offset=".5" stop-color="#9a5a36"/><stop offset="1" stop-color="#4a2512"/></linearGradient>' +
            '<radialGradient id="' + id + '-sh"><stop offset=".86" stop-color="rgba(0,0,0,.55)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>' +
            '<linearGradient id="' + id + '-cu2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2ad"/><stop offset=".45" stop-color="#d08a5c"/><stop offset="1" stop-color="#6e3a1f"/></linearGradient>' +
            '<pattern id="' + id + '-mesh" width="4" height="6.928" patternUnits="userSpaceOnUse"><path d="M2 0L4 1.155V3.464L2 4.619L0 3.464V1.155ZM2 4.619V6.928" fill="none" stroke="rgba(255,220,190,.10)" stroke-width=".4"/></pattern>' +
            '<radialGradient id="' + id + '-glass" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#1c1210"/><stop offset="1" stop-color="#070403"/></radialGradient>' +
            '<linearGradient id="' + id + '-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4d3ad"/><stop offset=".45" stop-color="#d49a68"/><stop offset=".55" stop-color="#c0814f"/><stop offset="1" stop-color="#8a5532"/></linearGradient>' +
            '<linearGradient id="' + id + '-well" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(0,0,0,.75)"/><stop offset=".35" stop-color="rgba(0,0,0,0)"/><stop offset=".8" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,.45)"/></linearGradient>' +
            '<clipPath id="' + id + '-clip"><rect x="-' + PLATE.w / 2 + '" y="' + PLATE.y + '" width="' + PLATE.w + '" height="' + PLATE.h + '" rx="1.4"/></clipPath>' +
            '<linearGradient id="' + id + '-lug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d79b70"/><stop offset=".35" stop-color="#9a5a36"/><stop offset="1" stop-color="#5a2e17"/></linearGradient>' +
            arcs + '</defs>' +
            '<circle r="70" fill="url(#' + id + '-sh)"/><circle r="66" fill="none" stroke="url(#' + id + '-cu)" stroke-width="4.2" opacity=".9"/><circle r="63.9" fill="none" stroke="rgba(255,215,180,.18)" stroke-width=".6"/>' +
            '<circle r="63" fill="url(#' + id + '-glass)"/><circle r="63" fill="url(#' + id + '-mesh)"/>' +
            '<circle r="63" fill="none" stroke="rgba(0,0,0,.7)" stroke-width="1.4"/>' +
            '<path d="' + openRing(57.6) + '" fill="none" stroke="rgba(214,140,92,.7)" stroke-width=".7"/>' +
            '<path d="' + openRing(32.4) + '" fill="none" stroke="rgba(214,140,92,.7)" stroke-width=".7"/>' +
            secs +
            '<path d="' + ticks + '" stroke="rgba(242,179,138,.75)" stroke-width=".7"/>' +
            labs + nix +
            '<g class="lever"><path d="M-6 7L-2.2 -50M6 7L2.2 -50M-3.6 -32H3.6M-4.6 -14H4.6" stroke="url(#' + id + '-cu2)" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
            '<circle cy="-52" r="3.6" fill="url(#' + id + '-cu2)" stroke="#5a2e17" stroke-width=".5"/></g>' +
            '<circle r="10.5" fill="#0d0806" stroke="url(#' + id + '-cu)" stroke-width="1.6"/>' +
            '<path d="' + roseD + '" fill="none" stroke="#d68c5c" stroke-width=".8"/><circle r="1.8" fill="#f2b38a"/>' +
            '<path d="M-48 -22A52 52 0 0 1 48 -22" fill="none" stroke="rgba(255,240,225,.07)" stroke-width="10" stroke-linecap="round"/>' +
            '</svg>';
    }

    function orderOf(C, v) {
        for (var i = 0; i < C.orders.length; i++) if (v >= C.orders[i][1] - 1e-9 && v <= C.orders[i][2] + 1e-9) return i;
        return 0;
    }

    function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }

    function mount(k) {
        var C = TELE[k];
        var cell = document.querySelector('#mixer-strip > .mixer-channel[data-ui-key="' + C.key + '"]');
        var canonical = document.getElementById(C.canonical);
        var proxy = document.getElementById(C.proxy);
        if (!cell || !canonical || !proxy) return false;
        var fader = cell.querySelector('.ch-fader');
        if (!fader || fader.querySelector('.wc-tele')) return true;

        var face = document.createElement('div');
        face.className = 'wc-tele wc-tele-' + k;
        face.setAttribute('aria-hidden', 'true');
        face.innerHTML = faceSVG(k, C);
        fader.appendChild(face);
        cell.classList.add('wc-has-tele');

        var o = {
            lever: face.querySelector('.lever'),
            secs: [].slice.call(face.querySelectorAll('.sec')),
            labs: [].slice.call(face.querySelectorAll('.tlab')),
            tval: face.querySelector('.tvalnix'),
            flag: face.querySelector('.flag'),
            flagT: face.querySelector('.flagt'),
            shown: -1, busy: false, pending: -1, last: null
        };

        function flagTo(i) {
            var first = o.shown < 0;
            o.shown = i;
            var name = C.plate ? C.plate[i] : C.orders[i][0];
            var set = function () {
                o.flagT.textContent = name;
                o.flagT.style.fontSize = PLATE.fs + 'px';
                // Shrink a long name to the plate (the display face is wide).
                var w = 0;
                try { w = o.flagT.getComputedTextLength(); } catch (e) {}
                if (!w) w = name.length * PLATE.fs * 0.86;   // not laid out yet
                var room = PLATE.w - 5;
                if (w > room) o.flagT.style.fontSize = (PLATE.fs * room / w).toFixed(2) + 'px';
            };
            if (first || RM.matches || !o.flag.animate) { set(); return; }
            o.busy = true;
            var out = o.flag.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(16px)' }],
                { duration: 110, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
            out.onfinish = function () {
                set();
                var inn = o.flag.animate([{ transform: 'translateY(-16px)' }, { transform: 'translateY(1.4px)', offset: 0.7 }, { transform: 'translateY(0)' }],
                    { duration: 260, easing: 'cubic-bezier(.25,.8,.35,1)' });
                out.cancel();
                inn.onfinish = function () {
                    o.busy = false;
                    if (o.pending >= 0 && o.pending !== o.shown) { var p = o.pending; o.pending = -1; flagTo(p); }
                };
            };
        }

        // The lever rides a spring on the normalised value, as the study's
        // stepTeles does (1687-1690): local profile for your changes, remote
        // for another player's, stepped on js/71's frame. Reduced motion: the
        // spring lands at once.
        var lev = { sp: null, last: '' };
        function nrm(v) { return k === 'laminar' ? (Math.max(-1, Math.min(1, v)) + 1) / 2 : Math.max(0, Math.min(1, (v - 0.01) / 2.99)); }
        function setLever(n) {
            var v = k === 'laminar' ? n * 2 - 1 : 0.01 + n * 2.99;
            var a = 'rotate(' + ang(Math.max(0, Math.min(1, C.toF(v)))).toFixed(2) + ')';
            if (a !== lev.last) { o.lever.setAttribute('transform', a); lev.last = a; }
        }
        function stepLever(dt) { lev.sp.step(dt); setLever(lev.sp.x); return lev.sp.settled(); }
        function leverTo(v) {
            var TM = window.ThemeMotion, n = nrm(v);
            if (!TM) { setLever(n); return; }
            if (!lev.sp) { lev.sp = new TM.Spring(n, TM.PROF.local); setLever(n); return; }
            var remote = !!window.__mpApplyingRemote || cell.classList.contains('mp-peer-touch') || !!cell.querySelector('.mp-peer-touch');
            lev.sp.to(n, remote ? TM.PROF.remote : TM.PROF.local);
            if (lev.sp.settled()) setLever(n); else TM.run(stepLever);
        }

        function draw() {
            var v = parseFloat(canonical.value);
            if (!isFinite(v) || v === o.last) return;
            o.last = v;
            leverTo(v);
            if (k === 'laminar') {
                // The study's crossfade (stepTeles): LAMINAR with the lever's
                // share of the sweep to its left, BLEND to its right.
                var cv = Math.max(-1, Math.min(1, v)), lit = [(1 - cv) / 2, (1 + cv) / 2];
                o.secs.forEach(function (p, n) {
                    p.setAttribute('fill', 'rgb(255 ' + Math.round(110 + 30 * lit[n]) + ' 30 / ' + (0.05 + 0.5 * lit[n]).toFixed(3) + ')');
                });
                o.labs.forEach(function (t, n) {
                    var m = lit[n];
                    t.setAttribute('fill', m > 0.5 ? '#fff0dc' : '#cbb59f');
                    t.style.filter = m > 0.5 ? 'drop-shadow(0 0 ' + (0.6 + 1.2 * m).toFixed(2) + 'px rgba(255,120,40,.85))' : 'none';
                });
                var cur = C.plateOf(v), tv = Math.abs(v).toFixed(2);
            } else {
                var cur = orderOf(C, v), tv = v.toFixed(2);
                o.secs.forEach(function (p, n) { p.setAttribute('fill', n === cur ? 'rgb(255 132 40 / .55)' : 'rgb(255 110 30 / .05)'); });
            }
            if (o.tval && o.tval.getAttribute('data-v') !== tv) {
                o.tval.setAttribute('data-v', tv);
                o.tval.innerHTML = tubesSVG('wct-' + k, tv, TUBES.cy, TUBES.w, TUBES.h, TUBES.fs).svg;
            }
            if (cur !== o.shown) { if (o.busy) o.pending = cur; else flagTo(cur); }
        }

        canonical.addEventListener('input', draw);
        canonical.addEventListener('change', draw);
        proxy.addEventListener('input', draw);
        new MutationObserver(draw).observe(proxy, { attributes: true, attributeFilter: ['style'] });
        new MutationObserver(draw).observe(canonical, { attributes: true, attributeFilter: ['style', 'value'] });
        draw();
        return true;
    }

    // ── The four round dials' readouts (Gabriel 2026-10-17): the value in
    // nixie tubes in the dial's own bottom gap (the dot arc spans -135..135),
    // on the same copper lug into the rim, instead of a number under the
    // dial. Redrawn only when the cell's readout text changes; the readout
    // element stays for screen readers (visually hidden, css/33).
    var DIALS = ['Viscosity', 'Isolation', 'Density', 'Velocity'];
    function mountDial(key) {
        var cell = document.querySelector('#mixer-strip > .mixer-channel[data-ui-key="' + key + '"]');
        if (!cell) return false;
        var fader = cell.querySelector('.ch-fader'), val = cell.querySelector('.ch-value');
        if (!fader || !val) return false;
        if (fader.querySelector('.wc-dialnix')) return true;
        var id = 'wcd-' + key.toLowerCase();
        var face = document.createElement('div');
        face.className = 'wc-tele wc-dialnix';
        face.setAttribute('aria-hidden', 'true');
        face.innerHTML = '<svg viewBox="-70 -70 140 140" aria-hidden="true" focusable="false"><defs>' + defsSVG(id) + '</defs><g class="dnix"></g></svg>';
        fader.appendChild(face);
        cell.classList.add('wc-has-dialnix');
        var g = face.querySelector('.dnix'), last = null;
        function draw() {
            var t = val.textContent.trim();
            if (t === last) return;
            last = t;
            var n = (t.match(/[0-9-]/g) || []).length;
            var w = Math.min(11.5, 64 / Math.max(1, n) - 1.4);
            var tb = tubesSVG(id, t, 44, w, 18, Math.min(14, w * 1.3));
            g.innerHTML = tb.svg ? lugSVG(id, tb.half + 3, 50, 69) + tb.svg : '';
        }
        new MutationObserver(draw).observe(val, { childList: true, characterData: true, subtree: true });
        draw();
        return true;
    }

    // The strip is built ~800 ms after DOMContentLoaded (js/20).
    var tries = 0;
    (function attach() {
        var a = mount('laminar'), b = mount('time');
        // mountDial is parked for the dial refactor (Gabriel 2026-10-18): the
        // round dials keep their own readout until they are resized.
        if ((!a || !b) && tries++ < 80) setTimeout(attach, 250);
    })();
})();
