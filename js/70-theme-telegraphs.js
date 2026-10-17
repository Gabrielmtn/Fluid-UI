// ═══════════════════════════════════════════════════════════════════
// js/70-theme-telegraphs.js — Walnut & Copper engine order telegraphs.
//
// Draws the study's telegraph faces (design/study-lite.html, "engine order
// telegraphs", v19 1565-1708) over the top bar's Laminar / Blend and Time
// cells. The face is presentation only: aria-hidden, pointer-events none.
// The control is still the cell's own range input underneath (the
// perceptual proxy), with the same value, step, keys and horizontal drag,
// and the canonical inputs (#colorBlend, #timeScale) keep every reader and
// writer they had. The study's Page-key order jumps and angle drag are NOT
// ported: keyboard and pointer behaviour are frozen (prep/README.md).
//
// The face follows the CANONICAL value. It is redrawn only when a value
// changes: the canonical input's input/change events, plus a MutationObserver
// on the proxy's style attribute, which js/20 rewrites (--val) on every
// reflection, including its 250 ms poll and remote glides. No loop of its
// own: the lever eases to a change on a spring stepped by js/71's frame.
//
// Mapping to the app:
//   Laminar / Blend  canonical -1..1 (Laminar < 0 < Blend). The LAMINAR half
//                    lights with -v, the BLEND half with +v; the nixies show
//                    |v| (0.00-1.00); the lever sits at the top for 0.
//   Time             canonical 0.01..3, the study's square-root sweep and six
//                    orders (STOP .. FLANK); the value under the hub, the
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
            orders: [['LAMINAR', 0, 0.5], ['BLEND', 0.5, 1]]          // in f (sweep) units
        },
        time: {
            key: 'Time', canonical: 'timeScale', proxy: 'timeScalePerceptual',
            toF: function (v) { return Math.sqrt(Math.max(0, (v - 0.01) / 2.99)); },
            orders: [['STOP', 0.01, 0.12], ['DEAD SLOW', 0.12, 0.35], ['SLOW', 0.35, 0.75], ['HALF', 0.75, 1.5], ['FULL', 1.5, 2.4], ['FLANK', 2.4, 3]]   // in value units
        }
    };

    function ang(f) { return -120 + 240 * f; }
    function polar(r, a) { var t = (a - 90) * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; }
    function wedge(r0, r1, a0, a1) {
        var p0 = polar(r1, a0), p1 = polar(r1, a1), p2 = polar(r0, a1), p3 = polar(r0, a0), lg = (a1 - a0) > 180 ? 1 : 0;
        return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r1 + ' ' + r1 + ' 0 ' + lg + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
            'L' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) + 'A' + r0 + ' ' + r0 + ' 0 ' + lg + ' 0 ' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) + 'Z';
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
        var nix = '';
        if (isLam) {
            nix = '<g class="tnix">' + [-14.5, 1.5, 13.5].map(function (x, n) {
                return '<rect x="' + (x - 5.6) + '" y="36" width="11.2" height="17.5" rx="4.2" fill="url(#' + id + '-glass)" stroke="rgba(214,140,92,.8)" stroke-width=".7"/>' +
                    '<rect x="' + (x - 5.6) + '" y="36" width="11.2" height="17.5" rx="4.2" fill="url(#' + id + '-mesh)"/>' +
                    '<text class="nxg" x="' + x + '" y="49.4" text-anchor="middle">8</text>' +
                    '<text class="nxd" data-n="' + n + '" x="' + x + '" y="49.4" text-anchor="middle">0</text>';
            }).join('') + '<circle class="nxp" cx="-6.5" cy="51.2" r="1.15"/></g>';
        } else {
            nix = '<text class="tval" text-anchor="middle" y="26">1.00×</text>' +
                '<g class="slot"><rect x="-41.5" y="29.5" width="83" height="19" rx="3" fill="#050302" stroke="url(#' + id + '-cu)" stroke-width="1.6"/>' +
                '<g clip-path="url(#' + id + '-clip)"><g class="flag"><rect x="-39.5" y="31.5" width="79" height="15" fill="url(#' + id + '-plate)"/>' +
                '<path d="M-39.5 32.1H39.5" stroke="rgba(255,245,230,.6)" stroke-width=".5"/><text class="flagt" text-anchor="middle" y="42.6"></text></g>' +
                '<rect x="-39.5" y="31.5" width="79" height="15" fill="url(#' + id + '-well)"/></g></g>';
        }
        return '<svg viewBox="-70 -70 140 140" aria-hidden="true" focusable="false">' +
            '<defs>' +
            '<linearGradient id="' + id + '-cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a62"/><stop offset=".5" stop-color="#9a5a36"/><stop offset="1" stop-color="#4a2512"/></linearGradient>' +
            '<radialGradient id="' + id + '-sh"><stop offset=".86" stop-color="rgba(0,0,0,.55)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>' +
            '<linearGradient id="' + id + '-cu2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd2ad"/><stop offset=".45" stop-color="#d08a5c"/><stop offset="1" stop-color="#6e3a1f"/></linearGradient>' +
            '<pattern id="' + id + '-mesh" width="4" height="6.928" patternUnits="userSpaceOnUse"><path d="M2 0L4 1.155V3.464L2 4.619L0 3.464V1.155ZM2 4.619V6.928" fill="none" stroke="rgba(255,220,190,.10)" stroke-width=".4"/></pattern>' +
            '<radialGradient id="' + id + '-glass" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#1c1210"/><stop offset="1" stop-color="#070403"/></radialGradient>' +
            '<linearGradient id="' + id + '-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4d3ad"/><stop offset=".45" stop-color="#d49a68"/><stop offset=".55" stop-color="#c0814f"/><stop offset="1" stop-color="#8a5532"/></linearGradient>' +
            '<linearGradient id="' + id + '-well" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(0,0,0,.75)"/><stop offset=".35" stop-color="rgba(0,0,0,0)"/><stop offset=".8" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,.45)"/></linearGradient>' +
            '<clipPath id="' + id + '-clip"><rect x="-39.5" y="31.5" width="79" height="15" rx="1.6"/></clipPath>' +
            arcs + '</defs>' +
            '<circle r="70" fill="url(#' + id + '-sh)"/><circle r="66" fill="none" stroke="url(#' + id + '-cu)" stroke-width="4.2" opacity=".9"/><circle r="63.9" fill="none" stroke="rgba(255,215,180,.18)" stroke-width=".6"/>' +
            '<circle r="63" fill="url(#' + id + '-glass)"/><circle r="63" fill="url(#' + id + '-mesh)"/>' +
            '<circle r="63" fill="none" stroke="rgba(0,0,0,.7)" stroke-width="1.4"/>' +
            '<circle r="57.6" fill="none" stroke="rgba(214,140,92,.7)" stroke-width=".7"/>' +
            '<circle r="32.4" fill="none" stroke="rgba(214,140,92,.7)" stroke-width=".7"/>' +
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
            nix: [].slice.call(face.querySelectorAll('.nxd')),
            tval: face.querySelector('.tval'),
            flag: face.querySelector('.flag'),
            flagT: face.querySelector('.flagt'),
            shown: -1, busy: false, pending: -1, last: null
        };

        function flagTo(i) {
            var first = o.shown < 0;
            o.shown = i;
            var name = C.orders[i][0];
            var set = function () {
                o.flagT.textContent = name;
                o.flagT.style.fontSize = Math.min(10.5, 76 / (name.length * 0.8)).toFixed(2) + 'px';
            };
            if (first || RM.matches || !o.flag.animate) { set(); return; }
            o.busy = true;
            var out = o.flag.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(17px)' }],
                { duration: 110, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
            out.onfinish = function () {
                set();
                var inn = o.flag.animate([{ transform: 'translateY(-17px)' }, { transform: 'translateY(1.6px)', offset: 0.7 }, { transform: 'translateY(0)' }],
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
                var lit = [Math.max(0, -v), Math.max(0, v)];
                o.secs.forEach(function (p, n) {
                    p.setAttribute('fill', 'rgb(255 ' + Math.round(110 + 30 * lit[n]) + ' 30 / ' + (0.05 + 0.5 * lit[n]).toFixed(3) + ')');
                });
                o.labs.forEach(function (t, n) {
                    var m = lit[n];
                    t.setAttribute('fill', m > 0.5 ? '#fff0dc' : '#cbb59f');
                    t.style.filter = m > 0.5 ? 'drop-shadow(0 0 ' + (0.6 + 1.2 * m).toFixed(2) + 'px rgba(255,120,40,.85))' : 'none';
                });
                var d = Math.abs(v).toFixed(2).replace('.', '');
                o.nix.forEach(function (t, n) { setText(t, d[n] || '0'); });
            } else {
                var cur = orderOf(C, v);
                o.secs.forEach(function (p, n) { p.setAttribute('fill', n === cur ? 'rgb(255 132 40 / .55)' : 'rgb(255 110 30 / .05)'); });
                setText(o.tval, v.toFixed(2) + '×');
                if (cur !== o.shown) { if (o.busy) o.pending = cur; else flagTo(cur); }
            }
        }

        canonical.addEventListener('input', draw);
        canonical.addEventListener('change', draw);
        proxy.addEventListener('input', draw);
        new MutationObserver(draw).observe(proxy, { attributes: true, attributeFilter: ['style'] });
        new MutationObserver(draw).observe(canonical, { attributes: true, attributeFilter: ['style', 'value'] });
        draw();
        return true;
    }

    // The strip is built ~800 ms after DOMContentLoaded (js/20).
    var tries = 0;
    (function attach() {
        var a = mount('laminar'), b = mount('time');
        if ((!a || !b) && tries++ < 80) setTimeout(attach, 250);
    })();
})();
