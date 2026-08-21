// ═══════════════════════════════════════════════════════════════════
// scripts/bake-store-assets.js — bakes all 11 Steam store slots FROM
// THE REAL SIM.
//
// This is PAGE code, not Node. It is injected into a running instance of
// the app and evaluated there, same as bake-boot-swirl.js:
//
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-store-assets.js
//
// It writes steam/store-assets/*.png|jpg|ico — the exact slot dimensions
// Steamworks asks for. electron-builder drops scripts/, so re-running this
// is a design-time act; nothing here ships.
//
// WHY FROM THE SIM
//   The first draft set (1efbab8) drew a synthetic vortex in 2D canvas and
//   captioned it "Fluid Simulation / Creative Simulation Engine" — wrong
//   name after the 2026-08-06 rebrand, and wrong register: it sells an
//   engine, not a game two people play. Store art that isn't the actual
//   renderer also promises a look the app can't deliver.
//
// THE PICTURE
//   Two dye streams enter from opposite edges, meet, and mingle. That is
//   the whole game in one frame — two painters, one canvas, colours mixing
//   where they touch — and it is what a Next Fest visitor has ninety
//   seconds to understand. Warm stream and cool stream so the two hands
//   read as two people, never one palette.
//
// TYPE
//   Matches the app's own splash (css/init-responsive.css:60) — Segoe UI
//   at weight 200, uppercase, 0.25em tracking, soft blue glow. The store
//   page and the running app should agree on their voice.
//
// SLOT RULES worth knowing before editing
//   · library_hero carries NO text — Steam overlays library_logo on it.
//   · library_logo is transparent; it IS the wordmark.
//   · capsule_small is ~462px wide in search rows, so the name is set two
//     lines up and the tagline is dropped. Legibility beats completeness.
//   · No capsule may carry the communal-ledger copy: Valve's capsule rules
//     allow artwork plus name/subtitle only.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var DIR   = 'steam/store-assets';
    // Steamworks presents Store Assets and Library Assets as separate sections
    // with different rules, so they get separate folders. Library Hero in
    // particular may carry NO text or logo at all, and its critical content has
    // to sit inside a centre 860x380 safe area that survives client resizing.
    var LIB   = 'steam/library-assets';
    var TITLE = 'Swirl Together';
    var TAG   = 'A playful painting game for two or more';
    // Stacked form for the narrow slots. Derived here rather than hardcoded at
    // the draw sites so a rename lands in one place — this is the second one.
    var TITLE_LINES = TITLE.toUpperCase().split(' ');

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    if (!canvas || !window.config || !window.applyMultiSplatWith || !window.clearCanvas) {
        return Promise.resolve({ error: 'app not ready — let it finish booting first' });
    }

    // ── Stage the app ──────────────────────────────────────────────────
    // Maximize for source resolution: every slot is a crop of the captured
    // canvas, and the hero is 3840 wide, so the bigger the drawing buffer
    // the less we upscale.
    try {
        var win = require('@electron/remote').getCurrentWindow();
        if (win && !win.isMaximized()) win.maximize();
    } catch (e) { /* web/dev — carry on at whatever size we have */ }

    // Quality FIRST, then freeze it. Order matters and got this wrong once:
    // the QualityGovernor ASCENDS after boot, so disabling it early pins the
    // sim at the boot default (dye 2048 / sim 512) and every capsule bakes
    // below what the app can actually render. Set both selects to their top
    // option, let the framebuffers rebuild, and only then take the governor
    // out of the loop so it cannot walk the resolution back down under the
    // load of a scripted capture — which looks exactly like a slow machine.
    // Options are authored best-first, so index 0 is the ceiling.
    function selectTop(id) {
        var el = document.getElementById(id);
        if (!el || !el.options.length) return null;
        el.value = el.options[0].value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
    }
    var QUALITY = { dye: selectTop('visualResolution'), sim: selectTop('physicsResolution') };
    // Suppress the red collider film / mask overlay (05j:1275 reads this).
    window.__exporting = true;
    window.kaleidoEnabled = false;
    if (window.collisionLayers) window.collisionLayers.enabled = false;
    config.GLOW = true;
    config.GLOW_INTENSITY = 0.55;

    // Light Shift rotates hue over time, and it is ON in a normal saved profile.
    // A bake runs ~150 frames, which is long enough for it to walk cyan-and-amber
    // all the way round to magenta — the dye is the colour you asked for, the
    // display just isn't showing it any more. Measured: with this off, a cyan dab
    // still reads [47,159,211] after 100 frames; with it on, the whole frame
    // converges on one hue and the two painters stop being two colours.
    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;
    function restoreApp() {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
    }

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }

    // The canvas box is a user-sized element, not the window — updateCanvasSize
    // reads canvasWrapper.clientWidth (01-config.js:614). Sizing the box to each
    // slot's aspect before painting means the picture is composed at the shape it
    // ships in, instead of being cropped out of one square capture afterwards.
    // Budget measured live: the canvas area is 2182×1278 with a 24px margin.
    // Portrait is 1180 not 1225: the area clamps it, and a box that silently
    // resizes between runs makes the seeded recipes non-reproducible.
    // Note the portrait recipe runs a smaller dab radius than the wide one for
    // the same apparent stroke width — radius is a fraction of the frame, and
    // this frame is half as wide.
    // hero is 3.1:1 and gets its own box so the picture is composed at the
    // shape it ships in — the wide recipe meets at 0.66 of the width, which
    // lands outside the hero's centre safe area once cropped.
    var BOX = { wide: [2134, 1000], portrait: [1020, 1180], hero: [2134, 688], mark: [1150, 1150], restore: [1080, 1080] };
    function setBox(w, h) {
        var wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        window.initializeCanvasPosition();   // re-clamp + re-centre at the new size
        window.updateCanvasSize();
        // needsFramebufferReinit is consumed by the update loop, so the sim needs
        // frames to rebuild its FBOs before anything painted into it will stick.
        return raf(10);
    }

    // Splat jitter reads Math.random, so an unseeded bake rolls different art
    // every run and you cannot tune one recipe without re-rolling the others.
    // Each recipe seeds its own stream and restores the real one after.
    var _realRandom = Math.random;
    function seed(s) {
        var x = s >>> 0 || 1;
        Math.random = function () {
            x ^= x << 13; x >>>= 0;
            x ^= x >> 17;
            x ^= x << 5;  x >>>= 0;
            return x / 4294967296;
        };
    }
    function unseed() { Math.random = _realRandom; }

    // ── Painting ───────────────────────────────────────────────────────
    // splat() divides dx/dy by VELOCITY_REFERENCE_RESOLUTION (512) before
    // they reach the velocity field, so speeds are in the hundreds of px —
    // a hand-sized 10px nudge lands as 0.02 and moves nothing.
    function bez(p0, p1, p2, p3, t) {
        var u = 1 - t;
        return [
            u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
        ];
    }

    // Walks a cubic, splatting along it with velocity pointed down-path, so
    // the dye is carried by the flow instead of sitting where it landed.
    function stroke(pts, colors, opts) {
        var steps = opts.steps, speed = opts.speed, radius = opts.radius;
        var out = [];
        for (var i = 0; i <= steps; i++) {
            var t = i / steps;
            var p = bez(pts[0], pts[1], pts[2], pts[3], t);
            var q = bez(pts[0], pts[1], pts[2], pts[3], Math.min(1, t + 0.02));
            var dx = q[0] - p[0], dy = q[1] - p[1];
            var len = Math.hypot(dx, dy) || 1;
            // Taper: enters fast and wide, arrives slower — a stroke that
            // decelerates into the meeting point reads as deliberate.
            var ease = 0.30 + 0.70 * (1 - t);
            var c = colors[i % colors.length];
            out.push({
                x: p[0], y: p[1],
                dx: (dx / len) * speed * ease,
                dy: (dy / len) * speed * ease,
                color: c,
                radius: radius * (0.75 + 0.35 * Math.sin(t * Math.PI))
            });
        }
        return out;
    }

    // Interleaves the two hands so they arrive together, one dab each per
    // tick, advancing the sim every few dabs so the dye actually travels.
    function play(a, b, every) {
        var n = Math.max(a.length, b.length);
        var chain = Promise.resolve();
        for (var i = 0; i < n; i++) {
            (function (i) {
                chain = chain.then(function () {
                    [a[i], b[i]].forEach(function (d) {
                        if (!d) return;
                        window.applyMultiSplatWith(d.x, d.y, d.dx, d.dy, d.color, 1, d.radius, true);
                    });
                    if (i % every === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    // Two hands, never one palette.
    var COOL = [[0.16, 0.62, 0.98], [0.30, 0.78, 0.95], [0.42, 0.40, 0.98], [0.20, 0.86, 0.88]];
    var WARM = [[1.00, 0.42, 0.16], [0.98, 0.24, 0.44], [1.00, 0.62, 0.20], [0.94, 0.30, 0.62]];

    // Narrow palettes for the portrait slots. The full sets carry a violet in
    // COOL and a rose in WARM, and where the two streams collide head-on those
    // two mix straight to magenta — which cost the whole picture its point,
    // since a single hue everywhere reads as one painter, not two. Cyan against
    // amber cannot collapse that way: whatever they make in the middle still
    // sits visibly between two different colours.
    var COOL_T = [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88]];
    var WARM_A = [[1.00, 0.42, 0.16], [1.00, 0.62, 0.20]];

    // Where the two streams touch. Kept off-centre so a left-aligned
    // wordmark has quiet ground to sit on.
    // Measured, because it is not intuitive: one dab at radius 0.008 covers
    // roughly 12% of a 1080² canvas — a dab is a third of the frame across.
    // Coverage goes as radius², so a stroke that should read as a stroke wants
    // something near 0.003. The first portrait pass ran ~97 dabs at 0.0078 and
    // painted the frame several times over; everything averaged into one flat
    // magenta and the two hands disappeared into it.
    function meetSwirl(mx, my, r, turns, warmPal, coolPal, dabR) {
        warmPal = warmPal || WARM; coolPal = coolPal || COOL;
        var chain = Promise.resolve();
        for (var i = 0; i < turns; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var a = (i / turns) * Math.PI * 2 * 1.5;
                    var rr = r * (0.30 + 0.5 * (i / turns));
                    var pal = (i % 2 === 0) ? warmPal : coolPal;
                    window.applyMultiSplatWith(
                        mx + Math.cos(a) * rr, my + Math.sin(a) * rr,
                        -Math.sin(a) * 260, Math.cos(a) * 260,
                        pal[i % pal.length], 1, dabR || 0.010, true
                    );
                    if (i % 3 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    function grab() {
        var W = canvas.width, H = canvas.height;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
    }

    // ── Recipe A: the wide picture (capsules, header, hero) ────────────
    function bakeWide() {
        var W, H, M;
        seed(0x5A17);
        return setBox(BOX.wide[0], BOX.wide[1]).then(function () {
            W = canvas.width; H = canvas.height;
            M = [W * 0.66, H * 0.50];
            window.clearCanvas();
            return raf(2);
        }).then(function () {
            // Head-on, not side-by-side. The first pass sent both hands the same
            // way and the sim resolved them into one horizontal jet — two
            // painters have to arrive from opposing quarters for the interface
            // between the colours to exist at all. Kept in the right two-thirds
            // so the wordmark has unlit ground on the left.
            var cool = stroke([[0.22*W, -0.12*H], [0.42*W, 0.10*H], [0.56*W, 0.30*H], M],
                              COOL_T, { steps: 50, speed: 400, radius: 0.0032 });
            var warm = stroke([[1.10*W, 1.06*H], [0.94*W, 0.86*H], [0.78*W, 0.66*H], M],
                              WARM_A, { steps: 50, speed: 400, radius: 0.0032 });
            return play(cool, warm, 3);
        }).then(function () {
            return meetSwirl(M[0], M[1], Math.min(W, H) * 0.20, 16, WARM_A, COOL_T, 0.0036);
        }).then(function () { return raf(46); }).then(function (c) { unseed(); return c; }).then(grab);
    }

    // ── Recipe B: the portrait picture (vertical + library capsule) ────
    function bakePortrait() {
        var W, H, M;
        seed(0xB0A7);
        return setBox(BOX.portrait[0], BOX.portrait[1]).then(function () {
            W = canvas.width; H = canvas.height;
            M = [W * 0.50, H * 0.42];
            window.clearCanvas();
            return raf(2);
        }).then(function () {
            var cool = stroke([[0.10*W, 1.12*H], [0.18*W, 0.84*H], [0.36*W, 0.58*H], M],
                              COOL_T, { steps: 44, speed: 430, radius: 0.0020 });
            var warm = stroke([[0.90*W, -0.12*H], [0.84*W, 0.16*H], [0.66*W, 0.28*H], M],
                              WARM_A, { steps: 44, speed: 430, radius: 0.0020 });
            return play(cool, warm, 3);
        }).then(function () {
            // Half the turns of the first pass, at a stroke-sized dab: enough
            // to interleave the two streams, not enough to homogenise them.
            return meetSwirl(M[0], M[1], Math.min(W, H) * 0.16, 10, WARM_A, COOL_T, 0.0024);
        }).then(function () { return raf(22); }).then(function () { unseed(); }).then(grab);
    }

    // ── The mark (icons) — NOT baked ──────────────────────────────────
    // The sim is the wrong tool at icon scale: dye diffuses into a filled
    // disc, and two attempts at an 8-fold pinwheel both settled into a flat
    // coloured circle that would read as a dot at 16px. The app already has
    // a mark with structure that survives downscaling — build/icon-master-1024.png,
    // the same art electron-builder embeds in the exe — so the Steam client
    // icon is that file. A store icon that differs from the installed app's
    // icon is a branding bug regardless of how it was produced.
    function loadImage(src) {
        return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { rej(new Error('could not load ' + src)); };
            im.src = src;
        });
    }

    // ── Recipes E/F: paint that follows the frame's LONG AXIS ─────────
    // Every other recipe in this file converges on a meeting point, which is
    // right for a capsule but wrong for a library slot: on a 3.1:1 hero a
    // centre-converging composition ALWAYS pools in the middle and leaves the
    // far left and right empty, no matter what order the passes run in. Two
    // attempts at fixing it by reordering failed for that reason — the geometry
    // was the problem, not the sequence.
    //
    // So these travel ALONG the frame instead of into a point. Lanes run the
    // full length of the long axis and past both ends, alternating direction so
    // neighbouring bands shear against each other and throw vortices along the
    // way. It is the same pattern that filled the collider screenshot edge to
    // edge. No convergence means no pooling, and on the hero it also means
    // there is no single croppable "face" — the subject is the whole band, so
    // the safe-area rule is satisfied by construction.
    // Inject rotating bursts along a line, which is what turns parallel bands
    // into fluid: laminar lanes alone came back as flat stripes, more flag than
    // painting. Each eddy spins against its neighbour so the shear between them
    // sheds vortices down the length of the frame.
    function paintEddies(W, H, opts) {
        opts = opts || {};
        var n = opts.count || 6;
        var vertical = !!opts.vertical;
        var radius = opts.radius || 0.0040;
        var spin = opts.spin || 300;
        var chain = Promise.resolve();
        for (var e = 0; e < n; e++) {
            (function (e) {
                chain = chain.then(function () {
                    var t = (e + 0.5) / n;
                    var cx = vertical ? W * (0.35 + 0.30 * ((e % 2) ? 1 : 0)) : W * t;
                    var cy = vertical ? H * t : H * (0.34 + 0.32 * ((e % 2) ? 1 : 0));
                    var dir = (e % 2) ? -1 : 1;
                    var rr = Math.min(W, H) * 0.10;
                    var pal = (e % 2) ? WARM_A : COOL_T;
                    var dabs = [];
                    for (var i = 0; i < 14; i++) {
                        var a = (i / 14) * Math.PI * 2;
                        dabs.push({
                            x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr,
                            dx: -Math.sin(a) * spin * dir, dy: Math.cos(a) * spin * dir,
                            color: pal[i % pal.length], radius: radius
                        });
                    }
                    return play(dabs, [], 3);
                });
            })(e);
        }
        return chain;
    }

    function paintAlongAxis(W, H, opts) {
        opts = opts || {};
        var vertical = !!opts.vertical;
        var count    = opts.count || 5;
        var radius   = opts.radius || 0.0050;
        var speed    = opts.speed || 520;
        var wob      = opts.wob !== undefined ? opts.wob : 0.07;
        var chain = Promise.resolve();
        for (var i = 0; i < count; i++) {
            (function (i) {
                chain = chain.then(function () {
                    // Evenly spaced across the SHORT axis, each running the
                    // full length of the long one.
                    var t = (i + 0.5) / count;
                    var dir = (i % 2) ? -1 : 1;
                    var a = dir > 0 ? -0.10 : 1.10;
                    var b = dir > 0 ? 1.10 : -0.10;
                    // Undulate so the bands are not flat rails.
                    var w1 = t + wob * dir, w2 = t - wob * dir;
                    var pts = vertical
                        ? [[t, a], [w1, 0.30], [w2, 0.70], [t, b]]
                        : [[a, t], [0.30, w1], [0.70, w2], [b, t]];
                    // stroke() in this file BUILDS a dab list; play() is what
                    // actually feeds it to the sim. Returning the array painted
                    // nothing at all — the hero came back black because of it.
                    return play(stroke(pts.map(function (q) { return [q[0] * W, q[1] * H]; }),
                                       (i % 2 ? WARM_A : COOL_T),
                                       { steps: 50, speed: speed, radius: radius }), [], 3);
                });
            })(i);
        }
        return chain;
    }

    // Library hero: lateral bands across a very wide, short frame.
    function bakeHero() {
        var W, H;
        seed(0x4E70);
        return setBox(BOX.hero[0], BOX.hero[1]).then(function () {
            W = canvas.width; H = canvas.height;
            window.clearCanvas();
            return raf(2);
        }).then(function () {
            // Only 688px tall at bake size, so the dab is fatter than the tall
            // recipes use — a stroke sized for a 1000px frame is a thin ribbon
            // in this one.
            return paintAlongAxis(W, H, { count: 5, radius: 0.0062, speed: 300, wob: 0.10 });
        }).then(function () {
            return paintEddies(W, H, { count: 7, radius: 0.0044, spin: 340 });
        }).then(function () { return raf(18); }).then(function () { unseed(); }).then(grab);
    }

    // Library capsule: the same idea rotated, running down a 2:3 frame.
    function bakeLibPortrait() {
        var W, H;
        seed(0x11B0);
        return setBox(BOX.portrait[0], BOX.portrait[1]).then(function () {
            W = canvas.width; H = canvas.height;
            window.clearCanvas();
            return raf(2);
        }).then(function () {
            return paintAlongAxis(W, H, { vertical: true, count: 5, radius: 0.0036, speed: 280, wob: 0.12 });
        }).then(function () {
            return paintEddies(W, H, { vertical: true, count: 6, radius: 0.0030, spin: 300 });
        }).then(function () { return raf(18); }).then(function () { unseed(); }).then(grab);
    }

    // ── Recipe C (retired): the baked mark ────────────────────────────
    // mult is animationMultiplier — the arm count multiSplat mirrors into.
    // Eight arms with tangential velocity gives the chiral bloom the
    // Chimera animation makes, which is the app's own signature geometry.
    function bakeMark() {
        var W, H, cx, cy, R;
        seed(0xC0DE);
        return setBox(BOX.mark[0], BOX.mark[1]).then(function () {
            W = canvas.width; H = canvas.height;
            cx = W / 2; cy = H / 2; R = Math.min(W, H);
            window.clearCanvas();
            return raf(2);
        }).then(function () {
            // 16 splats at mult 8 was 128 dabs of dye packed inside a fifth of
            // the frame: it saturated into one flat disc, which at 16px in a
            // taskbar is a green dot. An icon needs structure that survives
            // being tiny, so this lays down two interleaved 8-arm sets — warm
            // on the even arms, cool on the odd — and lets the tangential
            // velocity curl them into a pinwheel instead of over-painting.
            var chain = Promise.resolve();
            var sets = [
                { off: 0,             color: WARM[0] },
                { off: Math.PI / 8,   color: COOL[0] }
            ];
            sets.forEach(function (s) {
                for (var j = 0; j < 4; j++) {
                    (function (s, j) {
                        chain = chain.then(function () {
                            // Walk outward along each arm so it reads as a
                            // stroke with direction, not a ring of dots.
                            var rr = R * (0.11 + 0.052 * j);
                            var a  = s.off + j * 0.13;
                            window.applyMultiSplatWith(
                                cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
                                -Math.sin(a) * 330, Math.cos(a) * 330,
                                s.color, 8, 0.0058, true
                            );
                            return raf(2);
                        });
                    })(s, j);
                }
            });
            return chain;
        }).then(function () {
            // A hot core so the mark still has a centre once the arms blur
            // together at small sizes.
            window.applyMultiSplatWith(cx, cy, 0, 0, [1.0, 0.86, 0.62], 1, 0.0075, true);
            return raf(34);
        }).then(function () { unseed(); }).then(grab);
    }

    // ── Typography ────────────────────────────────────────────────────
    // Canvas has no letter-spacing we can rely on across Electron builds,
    // so tracking is applied per glyph.
    function face(ctx, size, weight) {
        ctx.font = weight + ' ' + size + 'px "Segoe UI", "Inter", sans-serif';
    }
    function trackedWidth(ctx, text, size, weight, trackEm) {
        face(ctx, size, weight);
        var tr = size * trackEm, w = 0;
        for (var i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width + tr;
        return w - tr;
    }
    function drawTracked(ctx, text, x, y, size, weight, trackEm, align, glow) {
        var total = trackedWidth(ctx, text, size, weight, trackEm);
        var cx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
        var tr = size * trackEm;
        face(ctx, size, weight);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        if (glow) {
            // Two passes: the splash's near glow plus a wider, fainter halo.
            ctx.save();
            ctx.shadowColor = 'rgba(100, 180, 255, 0.45)';
            ctx.shadowBlur = size * 1.1;
            var p = cx;
            for (var i = 0; i < text.length; i++) { ctx.fillText(text[i], p, y); p += ctx.measureText(text[i]).width + tr; }
            ctx.shadowColor = 'rgba(100, 180, 255, 0.20)';
            ctx.shadowBlur = size * 2.4;
            p = cx;
            for (var j = 0; j < text.length; j++) { ctx.fillText(text[j], p, y); p += ctx.measureText(text[j]).width + tr; }
            ctx.restore();
        }
        var q = cx;
        for (var k = 0; k < text.length; k++) { ctx.fillText(text[k], q, y); q += ctx.measureText(text[k]).width + tr; }
        return total;
    }


    // Small capsule renders ~231px wide in search rows, and Valve flags this
    // slot specifically: the name has to stay readable at that size. Two
    // stacked lines wasted the width and left the type small. This fits ONE
    // line to a target width instead, solving for the size rather than
    // guessing it, so the wordmark spans the frame whatever the name becomes.
    // Tracking is tightened here as a deliberate exception to the 0.25em house
    // setting: airy letterspacing is the first thing to fall apart when an
    // image is halved, and legibility wins over consistency in this one slot.
    function fitTitleSize(ctx, text, targetW, trackEm, weight, start) {
        var size = start || 40;
        for (var i = 0; i < 20; i++) {
            var w = trackedWidth(ctx, text, size, weight, trackEm);
            if (!w) break;
            if (Math.abs(w - targetW) < 0.5) break;
            size = size * (targetW / w);
        }
        return size;
    }
    function drawSmallCapsuleTitle(ctx, W, H) {
        var MARGIN = 22, TRACK = 0.14;
        var text = TITLE.toUpperCase();
        var size = fitTitleSize(ctx, text, W - MARGIN * 2, TRACK, 200, 44);
        // Cap height is roughly 0.70 of the em, so this centres the glyphs
        // rather than the baseline.
        var y = H / 2 + size * 0.35;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        drawTracked(ctx, text, MARGIN, y, size, 200, TRACK, 'left', true);
        return size;
    }


    // Portrait capsules were failing Steam's "logo should fill at least 1/3 of
    // the image" on the axis that matters. Measured on the vertical: 67% of the
    // width but only 18% of the HEIGHT, because the type was sized by eye to
    // sit under the art rather than to occupy the frame.
    //
    // Solve for the size instead: fit the longest line to a target share of the
    // width, which lets the two-line block grow as tall as the frame allows.
    // Tracking drops to ~0.09em here (house setting is 0.25em) purely to buy
    // that room -- at 0.25em the letterspacing eats the width budget long
    // before the type is tall enough to count.
    //
    // Honest limit: a 2:3 frame cannot have eight tracked characters fit the
    // width AND reach a third of the height at the same time. This maximises
    // both and reports what it actually achieved rather than assuming.
    function fitStackedTitle(ctx, W, H, opts) {
        opts = opts || {};
        var track      = opts.track !== undefined ? opts.track : 0.09;
        var targetFrac = opts.targetFrac || 0.88;
        var centerFrac = opts.centerFrac || 0.78;
        var lines = TITLE.toUpperCase().split(' ');
        var longest = lines.slice().sort(function (a, b) { return b.length - a.length; })[0];

        var size = 100;
        for (var i = 0; i < 20; i++) {
            var w = trackedWidth(ctx, longest, size, 200, track);
            if (!w) break;
            if (Math.abs(w - W * targetFrac) < 0.5) break;
            size = size * (W * targetFrac / w);
        }
        var lh = size * 1.34;
        var blockH = size * 0.70 + lh * (lines.length - 1);
        // centerFrac is where the block's optical centre lands.
        var firstBaseline = H * centerFrac - blockH / 2 + size * 0.70;

        // align 'left' keeps the art breathing on the right of a landscape
        // capsule; 'center' suits the portrait slots.
        var align = opts.align || 'center';
        var anchorX = (align === 'left') ? (opts.x || 0) : W / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        lines.forEach(function (ln, i) {
            drawTracked(ctx, ln, anchorX, firstBaseline + i * lh, size, 200, track, align, true);
        });
        return {
            size: Math.round(size),
            logoW: Math.round(trackedWidth(ctx, longest, size, 200, track)),
            logoH: Math.round(blockH)
        };
    }

    // ── Compositing ───────────────────────────────────────────────────
    // Cover-crop the capture around a focus point, so each aspect keeps the
    // meeting point in frame instead of scaling the whole picture down.
    function drawArt(ctx, src, W, H, fx, fy, scaleBoost) {
        var s = Math.max(W / src.width, H / src.height) * (scaleBoost || 1);
        var dw = src.width * s, dh = src.height * s;
        var dx = (W - dw) * fx, dy = (H - dh) * fy;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, dx, dy, dw, dh);
    }
    function ground(ctx, W, H) {
        // The app's own canvas ground, so the art sits on the colour the
        // game actually runs on rather than pure black.
        var g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#0b1018');
        g.addColorStop(1, '#0d1420');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    function scrim(ctx, W, H, dir, strength) {
        // Legibility ground under type. Horizontal for left-aligned slots,
        // vertical for stacked ones.
        var g = dir === 'h'
            ? ctx.createLinearGradient(0, 0, W, 0)
            : ctx.createLinearGradient(0, H, 0, 0);
        g.addColorStop(0, 'rgba(6, 10, 16, ' + strength + ')');
        g.addColorStop(0.55, 'rgba(6, 10, 16, ' + (strength * 0.45) + ')');
        g.addColorStop(1, 'rgba(6, 10, 16, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    function vignette(ctx, W, H) {
        var g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H) * 0.25, W/2, H/2, Math.max(W,H) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    function slot(W, H, transparent) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        if (!transparent) ground(ctx, W, H);
        return { c: c, ctx: ctx };
    }

    function png(c) { return Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64'); }
    function jpg(c, q) { return Buffer.from(c.toDataURL('image/jpeg', q || 0.92).split(',')[1], 'base64'); }

    // Vista-era ICO: a directory of embedded PNGs, which is what every
    // Windows shell since has preferred anyway.
    function ico(sizes, src) {
        var bufs = sizes.map(function (s) {
            var c = document.createElement('canvas');
            c.width = c.height = s;
            var x = c.getContext('2d');
            x.imageSmoothingEnabled = true;
            x.imageSmoothingQuality = 'high';
            x.drawImage(src, 0, 0, s, s);
            return { size: s, buf: png(c) };
        });
        var head = Buffer.alloc(6);
        head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(bufs.length, 4);
        var dir = Buffer.alloc(16 * bufs.length);
        var off = 6 + 16 * bufs.length;
        bufs.forEach(function (b, i) {
            var o = 16 * i;
            dir.writeUInt8(b.size >= 256 ? 0 : b.size, o + 0);
            dir.writeUInt8(b.size >= 256 ? 0 : b.size, o + 1);
            dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
            dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
            dir.writeUInt32LE(b.buf.length, o + 8);
            dir.writeUInt32LE(off, o + 12);
            off += b.buf.length;
        });
        return Buffer.concat([head, dir].concat(bufs.map(function (b) { return b.buf; })));
    }

    var written = [];
    var vm = null, lm = null, hm = null, mm = null;
    function writeTo(destDir, name, buf) {
        var dir = path.join(process.cwd(), destDir);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), buf);
        written.push({ name: destDir.split('/').pop() + '/' + name, kb: Math.round(buf.length / 1024) });
    }
    function writeLib(name, buf) { writeTo(LIB, name, buf); }
    function write(name, buf) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), buf);
        written.push({ name: name, kb: Math.round(buf.length / 1024) });
    }

    // Wordmark drawn as one block: title (optionally split) then tagline.
    function wordmark(ctx, W, x, y, titleSize, align, opts) {
        opts = opts || {};
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        var lines = opts.split ? TITLE_LINES : [TITLE.toUpperCase()];
        var lh = titleSize * 1.34;
        lines.forEach(function (ln, i) {
            drawTracked(ctx, ln, x, y + i * lh, titleSize, 200, 0.25, align, true);
        });
        if (opts.tagline) {
            var ty = y + (lines.length - 1) * lh + titleSize * 1.5;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
            drawTracked(ctx, TAG.toUpperCase(), x, ty, opts.tagSize, 300, 0.30, align, false);
        }
    }

    // ── Bake ──────────────────────────────────────────────────────────
    var MARK_SRC = 'build/icon-master-1024.png';   // absent by design; see above
    var wide, portrait, mark, hero, libArt;
    // Resolution is applied; now stop the governor from undoing it.
    if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
        window.QualityGovernor.setEnabled(false);
    }
    return bakeWide().then(function (c) { wide = c; return bakePortrait(); })
    .then(function (c) { portrait = c; return bakeLibPortrait(); })
    .then(function (c) { libArt = c; return bakeHero(); })
    .then(function (c) { hero = c; return loadImage(MARK_SRC).catch(function () { return null; }); })
    .then(function (c) {
        mark = c;

        // 1232×706 main capsule — the big one on the store page.
        var s = slot(1232, 706);
        drawArt(s.ctx, wide, 1232, 706, 0.5, 0.5);
        vignette(s.ctx, 1232, 706);
        scrim(s.ctx, 1232, 706, 'h', 0.88);
        mm = fitStackedTitle(s.ctx, 1232, 706, { align: 'left', x: 74, targetFrac: 0.66, centerFrac: 0.50 });
        write('capsule_main_1232x706.png', png(s.c));

        // 920×430 header capsule.
        s = slot(920, 430);
        drawArt(s.ctx, wide, 920, 430, 0.5, 0.5);
        vignette(s.ctx, 920, 430);
        scrim(s.ctx, 920, 430, 'h', 0.88);
        hm = fitStackedTitle(s.ctx, 920, 430, { align: 'left', x: 56, targetFrac: 0.62, centerFrac: 0.50 });
        write('capsule_header_920x430.png', png(s.c));

        // Library header shares the header composition — same slot shape,
        // same job, and a matching pair reads as one identity in the client.
        s = slot(920, 430);
        drawArt(s.ctx, wide, 920, 430, 0.5, 0.5);
        vignette(s.ctx, 920, 430);
        scrim(s.ctx, 920, 430, 'h', 0.88);
        hm = fitStackedTitle(s.ctx, 920, 430, { align: 'left', x: 56, targetFrac: 0.62, centerFrac: 0.50 });
        writeLib('library_header_920x430.png', png(s.c));

        // 462×174 small capsule — search rows. Name only, stacked, larger.
        s = slot(462, 174);
        drawArt(s.ctx, wide, 462, 174, 0.72, 0.5, 1.15);
        // The wordmark now spans the whole frame, so a one-sided scrim would
        // leave its far end unprotected: darken the plate evenly instead.
        s.ctx.fillStyle = 'rgba(6, 10, 16, 0.46)';
        s.ctx.fillRect(0, 0, 462, 174);
        drawSmallCapsuleTitle(s.ctx, 462, 174);
        write('capsule_small_462x174.png', png(s.c));

        // 748×896 vertical capsule.
        s = slot(748, 896);
        drawArt(s.ctx, portrait, 748, 896, 0.5, 0.34);
        vignette(s.ctx, 748, 896);
        scrim(s.ctx, 748, 896, 'v', 0.92);
        vm = fitStackedTitle(s.ctx, 748, 896, { centerFrac: 0.80 });
        write('capsule_vertical_748x896.png', png(s.c));

        // 600×900 library capsule.
        s = slot(600, 900);
        drawArt(s.ctx, libArt, 600, 900, 0.5, 0.5);
        vignette(s.ctx, 600, 900);
        scrim(s.ctx, 600, 900, 'v', 0.92);
        lm = fitStackedTitle(s.ctx, 600, 900, { centerFrac: 0.79 });
        writeLib('library_capsule_600x900.png', png(s.c));

        // 3840×1240 hero — NO TEXT. Steam lays library_logo over this.
        s = slot(3840, 1240);
        drawArt(s.ctx, hero, 3840, 1240, 0.5, 0.5, 1.0);
        vignette(s.ctx, 3840, 1240);
        writeLib('library_hero_3840x1240.png', png(s.c));

        // 1438x810 page background — sits BEHIND the store page with content
        // laid over it, so no text, and pulled back a little so nothing
        // important lands where the page will cover it.
        s = slot(1438, 810);
        drawArt(s.ctx, wide, 1438, 810, 0.5, 0.5, 1.06);
        vignette(s.ctx, 1438, 810);
        write('page_background_1438x810.png', png(s.c));

        // Library logo — transparent, logotype only, and CROPPED TO ITSELF.
        // Steam's rule is "either 1280px wide and/or 720px tall", meaning the
        // asset should BE the logo, at its own aspect ratio. Drawn into a fixed
        // 1280x720 plate the wordmark measured 954x310 with 205px of dead
        // transparency above and below and ~160px either side — only 3% of the
        // file was ink. Steam scales the whole asset into its placement box, so
        // that padding shrinks the visible logo by about a quarter and throws
        // its optical centring off. Draw oversized, measure the alpha bounds,
        // then re-emit trimmed to a small even margin with the long side at 1280.
        var PAD = 24;
        var probe = slot(2400, 900, true);
        wordmark(probe.ctx, 2400, 1200, 300, 150, 'center', { split: true });
        var pd = probe.ctx.getImageData(0, 0, 2400, 900).data;
        var minX = 2400, maxX = -1, minY = 900, maxY = -1;
        for (var py = 0; py < 900; py++) {
            for (var px = 0; px < 2400; px++) {
                if (pd[(py * 2400 + px) * 4 + 3] > 12) {
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            }
        }
        var bw = (maxX - minX + 1) + PAD * 2;
        var bh = (maxY - minY + 1) + PAD * 2;
        // Long side to 1280; the other side follows the logo's own ratio.
        var lscale = 1280 / bw;
        var outW = Math.round(bw * lscale), outH = Math.round(bh * lscale);
        s = slot(outW, outH, true);
        s.ctx.imageSmoothingQuality = 'high';
        s.ctx.drawImage(probe.c, minX - PAD, minY - PAD, bw, bh, 0, 0, outW, outH);
        writeLib('library_logo_' + outW + 'x' + outH + '.png', png(s.c));

        // 1024 icon source + the client icon set — the shipped mark, drawn
        // 1:1 and left transparent so the master's rounded corners survive.
        // Skipped when MARK_SRC is absent: the vortex master was removed for
        // unverifiable provenance, and the capsules are worth baking regardless.
        if (mark) {
            s = slot(1024, 1024, true);
            s.ctx.imageSmoothingQuality = 'high';
            s.ctx.drawImage(mark, 0, 0, 1024, 1024);
            write('client_icon_source_1024.png', png(s.c));
            write('client_icon.ico', ico([16, 24, 32, 48, 64, 128, 256], s.c));
        }

        // 184×184 community icon. JPEG has no alpha, so this one gets the
        // ground painted under it rather than transparent corners.
        if (mark) {
            var ci = slot(184, 184);
            ci.ctx.imageSmoothingQuality = 'high';
            ci.ctx.drawImage(mark, 0, 0, 184, 184);
            write('community_icon_184x184.jpg', jpg(ci.c, 0.94));
        }

        // Put the canvas box back the way the user left it. The pinned size is
        // only persisted on a resize-handle pointerup (02-palettes.js), so this
        // is courtesy rather than repair — but leaving a 1150px square behind
        // would still be a surprise on next launch.
        return setBox(BOX.restore[0], BOX.restore[1]).then(function () {
            window.clearCanvas();
            restoreApp();
            return {
                written: written,
                sources: { wide: wide.width + 'x' + wide.height,
                           portrait: portrait.width + 'x' + portrait.height,
                           mark: mark ? (mark.width + "x" + mark.height) : 'absent' },
                title: TITLE,
                tagline: TAG,
                logoFit: {
                    header: hm ? (hm.size + 'px ' + hm.logoW + 'x' + hm.logoH + ' = ' +
                        Math.round(100 * hm.logoW / 920) + '% W / ' + Math.round(100 * hm.logoH / 430) +
                        '% H / ' + Math.round(100 * hm.logoW * hm.logoH / (920 * 430)) + '% area') : null,
                    main: mm ? (mm.size + 'px ' + mm.logoW + 'x' + mm.logoH + ' = ' +
                        Math.round(100 * mm.logoW / 1232) + '% W / ' + Math.round(100 * mm.logoH / 706) +
                        '% H / ' + Math.round(100 * mm.logoW * mm.logoH / (1232 * 706)) + '% area') : null,
                    vertical: vm ? (vm.size + 'px  ' + vm.logoW + 'x' + vm.logoH +
                        '  = ' + Math.round(100 * vm.logoW / 748) + '% W / ' +
                        Math.round(100 * vm.logoH / 896) + '% H') : null,
                    library: lm ? (lm.size + 'px  ' + lm.logoW + 'x' + lm.logoH +
                        '  = ' + Math.round(100 * lm.logoW / 600) + '% W / ' +
                        Math.round(100 * lm.logoH / 900) + '% H') : null
                },
                quality: { selects: QUALITY, dye: config.DYE_RESOLUTION, sim: config.SIM_RESOLUTION }
            };
        });
    }).catch(function (e) {
        restoreApp();
        return { error: String(e && e.stack || e) };
    });
})()
