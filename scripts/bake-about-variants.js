// ═══════════════════════════════════════════════════════════════════
// scripts/bake-about-variants.js — VARIANTS, so every highlighted
// feature has 4-5 candidate photographs to choose between.
//
// PAGE code. Install order:
//   node tmp-cdp-driver.js @scripts/test/harness.js
//   node tmp-cdp-driver.js @scripts/test/stage.js
//   node tmp-cdp-driver.js @scripts/bake-about-variants.js
//
// Same pinned stage as scripts/bake-feature-photos.js (see that file's
// header for why the test harness and not shot-helpers.js). Existing
// photos per feature, and what this file adds to reach a full set:
//
//   TOGETHER      01                    + 16 crowd, 17 braid,
//                                         18 headon, 19 asymmetric
//   THE PAINT     02, 08, 13, 15        + 20 angle
//   SYMMETRY      03, 09, 14            + 21 armcount, 22 kaleidomodes
//   COLOUR/LIGHT  04, 10, 11            + 23 glow, 24 palettes
//   BRINGING IN   05, 12                + 25 stencil, 26 terrain,
//                                         27 handwalls
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DIR = 'steam/about/images';
    var OUT_W = 1232, OUT_H = 693;

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    var T = window.__test;

    if (!T || !window.__stage) {
        return Promise.resolve({ error: 'install scripts/test/harness.js then scripts/test/stage.js first' });
    }

    var STAGE = { dye: '2048', sim: '512', box: [1920, 1080], seed: 0x0FEA };

    var PAL = {
        cool:   [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88]],
        warm:   [[1.00, 0.42, 0.16], [1.00, 0.66, 0.18]],
        rose:   [[0.98, 0.22, 0.55], [1.00, 0.45, 0.72]],
        mint:   [[0.20, 0.92, 0.62], [0.45, 0.95, 0.80]],
        gold:   [[1.00, 0.78, 0.22], [0.98, 0.55, 0.12]],
        violet: [[0.55, 0.35, 0.98], [0.72, 0.45, 1.00]]
    };

    function outFrame() {
        var c = document.createElement('canvas');
        c.width = OUT_W; c.height = OUT_H;
        var x = c.getContext('2d');
        x.fillStyle = '#080c12';
        x.fillRect(0, 0, OUT_W, OUT_H);
        x.imageSmoothingQuality = 'high';
        return { c: c, x: x };
    }
    function grab() {
        var c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
    }
    function whole(img) {
        var f = outFrame();
        f.x.drawImage(img, 0, 0, img.width, img.height, 0, 0, OUT_W, OUT_H);
        return f.c;
    }
    function bands(caps) {
        var f = outFrame();
        var w = OUT_W / caps.length;
        caps.forEach(function (img, k) {
            f.x.drawImage(img, (k / caps.length) * img.width, 0,
                img.width / caps.length, img.height, k * w, 0, w, OUT_H);
        });
        f.x.globalAlpha = 0.35; f.x.fillStyle = '#000';
        for (var i = 1; i < caps.length; i++) f.x.fillRect(i * w - 1, 0, 2, OUT_H);
        f.x.globalAlpha = 1;
        return f.c;
    }
    function contact(caps) {
        var f = outFrame();
        var w = OUT_W / 2, h = OUT_H / 2;
        caps.forEach(function (img, k) {
            var cx = k % 2, cy = (k / 2) | 0;
            f.x.drawImage(img, 0, 0, img.width, img.height, cx * w, cy * h, w, h);
        });
        f.x.globalAlpha = 0.35; f.x.fillStyle = '#000';
        f.x.fillRect(w - 1, 0, 2, OUT_H);
        f.x.fillRect(0, h - 1, OUT_W, 2);
        f.x.globalAlpha = 1;
        return f.c;
    }
    // Same source window from both captures — for A/B where the
    // composition evolves across the frame (see bake-feature-photos.js).
    function pairSameWindow(a, b) {
        var f = outFrame();
        var halfW = OUT_W / 2, aspect = halfW / OUT_H;
        var sw = a.height * aspect, sx = (a.width - sw) / 2;
        [a, b].forEach(function (img, k) {
            f.x.drawImage(img, sx, 0, sw, img.height, k * halfW, 0, halfW, OUT_H);
        });
        f.x.globalAlpha = 0.35; f.x.fillStyle = '#000';
        f.x.fillRect(halfW - 1, 0, 2, OUT_H);
        f.x.globalAlpha = 1;
        return f.c;
    }
    function write(name, c) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        return { name: name, kb: Math.round(buf.length / 1024) };
    }

    // ── TOGETHER ───────────────────────────────────────────────────────

    // 16 — many hands. Six streams entering from evenly spaced points on
    // the rim, each holding its own hue at the edge, all reaching one
    // shared centre: identity at the edges, the thing you made together
    // in the middle.
    function shotCrowd() {
        var names = ['cool', 'warm', 'rose', 'mint', 'gold', 'violet'];
        return window.__stage(STAGE).then(function () {
            T.seed(0x1601);
            names.forEach(function (n, i) {
                var a = (i / names.length) * Math.PI * 2 - Math.PI / 2;
                var ex = 0.5 + Math.cos(a) * 0.62;
                var ey = 0.5 + Math.sin(a) * 0.56;
                T.stroke({
                    pts: [[ex, ey],
                          [0.5 + Math.cos(a) * 0.40, 0.5 + Math.sin(a) * 0.36],
                          [0.5 + Math.cos(a) * 0.20, 0.5 + Math.sin(a) * 0.18],
                          [0.52, 0.50]],
                    steps: 34, radius: 0.0026, speed: 380, color: PAL[n][0]
                });
            });
            return T.step(34);
        }).then(function () { return write('about-16-crowd.png', whole(grab())); });
    }

    // 17 — a braid. Two hands weaving past each other three times, so the
    // picture is the INTERLEAVING rather than a single meeting.
    function shotBraid() {
        return window.__stage(STAGE).then(function () {
            T.seed(0x1702);
            // Slow and short-settled. The first attempt ran at speed 430
            // for 30 frames and the flow washed both strokes downstream
            // into parallel ribbons — the weave has to survive to be the
            // subject, so the hands move gently and the frame is taken
            // while the crossings are still crossings.
            T.stroke({ pts: [[-0.03, 0.32], [0.30, 0.72], [0.62, 0.28], [1.03, 0.62]],
                       steps: 56, radius: 0.0032, speed: 200, color: PAL.cool[0] });
            T.stroke({ pts: [[-0.03, 0.66], [0.30, 0.26], [0.62, 0.72], [1.03, 0.36]],
                       steps: 56, radius: 0.0032, speed: 200, color: PAL.rose[0] });
            return T.step(16);
        }).then(function () { return write('about-17-braid.png', whole(grab())); });
    }

    // 18 — head-on. The two strokes aimed straight at each other, so the
    // frame is about the COLLISION: neither hand wins, both deflect.
    function shotHeadon() {
        return window.__stage(STAGE).then(function () {
            T.seed(0x1803);
            T.stroke({ pts: [[-0.03, 0.50], [0.18, 0.50], [0.34, 0.50], [0.48, 0.50]],
                       steps: 40, radius: 0.0032, speed: 520, color: PAL.gold[0] });
            T.stroke({ pts: [[1.03, 0.50], [0.82, 0.50], [0.66, 0.50], [0.52, 0.50]],
                       steps: 40, radius: 0.0032, speed: 520, color: PAL.violet[0] });
            return T.step(40);
        }).then(function () { return write('about-18-headon.png', whole(grab())); });
    }

    // 19 — two very different people. One broad confident sweep and one
    // small careful mark, sharing the canvas without competing. The most
    // "quiet" of the together set, and the one with space for text.
    function shotAsymmetric() {
        return window.__stage(STAGE).then(function () {
            T.seed(0x1904);
            T.stroke({ pts: [[-0.03, 0.74], [0.30, 0.58], [0.62, 0.52], [1.03, 0.38]],
                       steps: 50, radius: 0.0036, speed: 460, color: PAL.cool[0] });
            T.stroke({ pts: [[0.60, 0.30], [0.66, 0.24], [0.72, 0.22], [0.79, 0.17]],
                       steps: 16, radius: 0.0022, speed: 210, color: PAL.warm[0] });
            return T.step(32);
        }).then(function () { return write('about-19-asymmetric.png', whole(grab())); });
    }

    // ── THE PAINT ──────────────────────────────────────────────────────

    // 20 — brush angle. The Chisel tip at four rotations: the same tip is
    // four different marks depending on how it is held. Tips need
    // exact:false (they ride __brushTipOn, 05g:259).
    function shotAngle() {
        var ANGLES = [0, 35, 70, 105];
        var caps = [];
        var chain = Promise.resolve();
        ANGLES.forEach(function (deg, k) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                config.BRUSH_TIP = 2;              // Chisel
                config.BRUSH_TIP_TEXTURE = 0.7;
                config.BRUSH_ANGLE = deg;
                if (window.multiArmColors) {
                    window.multiArmColors[0] = { mode: 'fixed', color: '#ffc24a', stepIndex: 0, cachedColor: null };
                }
                return T.step(2);
            }).then(function () {
                T.seed(0x2005);
                var cx = (k + 0.5) / ANGLES.length;
                T.stroke({ pts: [[cx - 0.05, 0.66], [cx - 0.018, 0.56], [cx + 0.018, 0.46], [cx + 0.05, 0.36]],
                           steps: 7, radius: 0.0070, speed: 90, exact: false });
                return T.step(10);
            }).then(function () { caps.push(grab()); });
        });
        return chain.then(function () {
            config.BRUSH_TIP = 0; config.BRUSH_ANGLE = 0;
            return write('about-20-angle.png', bands(caps));
        });
    }

    // ── SYMMETRY ───────────────────────────────────────────────────────

    // 21 — arm count. The same gesture at 2, 4, 6 and 8 radial arms: one
    // slider, four different figures.
    function shotArmCount() {
        var ARMS = [2, 4, 6, 8];
        var HUES = ['#4090c0', '#e0508c', '#f0b040', '#40c08c',
                    '#8c60e0', '#40c0c0', '#e07040', '#a0d040'];
        var caps = [];
        var chain = Promise.resolve();
        ARMS.forEach(function (n) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                if (window.multiArmColors) {
                    for (var ai = 0; ai < 8; ai++) {
                        window.multiArmColors[ai] = { mode: 'fixed', color: HUES[ai], stepIndex: 0, cachedColor: null };
                    }
                }
                var s = document.getElementById('symmetryMode');
                if (s) { s.value = 'radial'; s.dispatchEvent(new Event('change', { bubbles: true })); }
                if (typeof window.setMultiplierHotkey === 'function') window.setMultiplierHotkey(n);
                return T.step(2);
            }).then(function () {
                T.seed(0x2106);
                // Held OFF the centre. The first attempt started the
                // gesture at 0.54,0.50 — right on the pivot — so every
                // arm overlapped every other one there and averaged into
                // a grey disc, taking the saturation with it.
                T.stroke({ pts: [[0.63, 0.44], [0.70, 0.36], [0.77, 0.30], [0.86, 0.21]],
                           steps: 30, radius: 0.0032, speed: 300, mult: n, exact: false });
                return T.step(16);
            }).then(function () { caps.push(grab()); });
        });
        return chain.then(function () { return write('about-21-armcount.png', contact(caps)); });
    }

    // 22 — kaleidoscope modes. Wedge, Mirror H, Mirror Quad and Spiral
    // over the SAME painted state, so the mode is the only variable.
    // Display-space, so the four captures need no repaint — but each
    // still restages to keep the pinned baseline honest.
    function shotKaleidoModes() {
        var MODES = ['1', '2', '4', '5'];   // Wedge, Mirror H, Mirror Quad, Spiral
        var caps = [];
        var chain = Promise.resolve();
        MODES.forEach(function (m) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                window._kaleidoBootstrapped = true;   // or the first enable forces mult 8
                window.kaleidoEnabled = true;
                T.setSelect('kaleidoMode', m);
                T.setSlider('kaleidoSegments', 8);
                return T.step(2);
            }).then(function () {
                T.seed(0x2207);
                // The composition must cover the CENTRE and BOTH halves.
                // The first attempt painted only right-of-centre and three
                // of the four cells came back black: a mirror mode folds
                // one half onto the other, so it renders whatever is in
                // the half it samples — and that half was empty.
                T.stroke({ pts: [[0.10, 0.30], [0.38, 0.46], [0.64, 0.34], [0.92, 0.52]],
                           steps: 40, radius: 0.0030, speed: 330, color: PAL.rose[0] });
                T.stroke({ pts: [[0.12, 0.70], [0.40, 0.54], [0.66, 0.68], [0.90, 0.46]],
                           steps: 36, radius: 0.0028, speed: 310, color: PAL.mint[0] });
                T.stroke({ pts: [[0.46, 0.16], [0.50, 0.40], [0.52, 0.60], [0.48, 0.86]],
                           steps: 30, radius: 0.0026, speed: 280, color: PAL.gold[0] });
                return T.step(24);
            }).then(function () { caps.push(grab()); });
        });
        return chain.then(function () {
            window.kaleidoEnabled = false;
            return write('about-22-kaleidomodes.png', contact(caps));
        });
    }

    // ── COLOUR AND LIGHT ───────────────────────────────────────────────

    // 23 — glow. Look-only, so both halves come from ONE settled state:
    // settle, capture with glow off, switch it on, capture again.
    function shotGlow() {
        var off = null;
        return window.__stage(STAGE).then(function () {
            T.seed(0x2308);
            T.stroke({ pts: [[0.04, 0.62], [0.34, 0.36], [0.62, 0.58], [0.96, 0.32]],
                       steps: 46, radius: 0.0032, speed: 430, color: PAL.violet[0] });
            T.stroke({ pts: [[0.08, 0.30], [0.38, 0.54], [0.66, 0.34], [0.94, 0.60]],
                       steps: 42, radius: 0.0028, speed: 400, color: PAL.cool[1] });
            return T.step(30);
        }).then(function () {
            config.GLOW = false;
            return T.step(2);
        }).then(function () {
            off = grab();
            config.GLOW = true;
            config.GLOW_INTENSITY = 0.7;
            return T.step(3);
        }).then(function () {
            var img = write('about-23-glow.png', bands([off, grab()]));
            config.GLOW = false;
            return img;
        });
    }

    // 24 — palette range. One identical composition in four palettes:
    // the same painting is a different painting in a different key.
    function shotPalettes() {
        var SETS = ['cool', 'rose', 'gold', 'mint'];
        var caps = [];
        var chain = Promise.resolve();
        SETS.forEach(function (n) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                T.seed(0x2409);
                T.stroke({ pts: [[-0.03, 0.62], [0.32, 0.36], [0.64, 0.60], [1.03, 0.34]],
                           steps: 44, radius: 0.0032, speed: 420, color: PAL[n][0] });
                T.stroke({ pts: [[-0.03, 0.32], [0.36, 0.56], [0.68, 0.34], [1.03, 0.62]],
                           steps: 40, radius: 0.0028, speed: 390, color: PAL[n][1] });
                return T.step(28);
            }).then(function () { caps.push(grab()); });
        });
        return chain.then(function () { return write('about-24-palettes.png', contact(caps)); });
    }

    // ── BRINGING THINGS IN ─────────────────────────────────────────────

    // 25 — stencil. The collider is the INVERSE of a shape, so the paint
    // is confined inside it: cut a shape out and the fluid fills it.
    function shotStencil() {
        return window.__stage(STAGE).then(function () {
            window.collisionLayers.setProcedural(function (ctx, w, h) {
                // Wall everywhere, then punch the shape out of the wall.
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                var cx = w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.46;  // bigger: the first bake left the shape adrift in black
                for (var i = 0; i <= 240; i++) {
                    var a = (i / 240) * Math.PI * 2;
                    var r = R * (0.72 + 0.28 * Math.cos(a * 5));   // five-lobed rosette
                    var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            });
            return T.step(14);
        }).then(function () {
            T.seed(0x250A);
            T.stroke({ pts: [[0.40, 0.40], [0.50, 0.32], [0.60, 0.50], [0.66, 0.62]],
                       steps: 34, radius: 0.0034, speed: 320, color: PAL.gold[0] });
            T.stroke({ pts: [[0.64, 0.38], [0.52, 0.52], [0.42, 0.60], [0.34, 0.50]],
                       steps: 30, radius: 0.0030, speed: 300, color: PAL.rose[0] });
            T.stroke({ pts: [[0.50, 0.62], [0.46, 0.52], [0.54, 0.44], [0.58, 0.34]],
                       steps: 26, radius: 0.0028, speed: 260, color: PAL.cool[0] });
            return T.step(44);
        }).then(function () {
            var img = write('about-25-stencil.png', whole(grab()));
            window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
            if (window.clearObstacleTexture) window.clearObstacleTexture();
            return img;
        });
    }

    // 26 — terrain. Layered ridges like a depth map's contours, with the
    // paint running along and spilling between them.
    function shotTerrain() {
        return window.__stage(STAGE).then(function () {
            window.collisionLayers.setProcedural(function (ctx, w, h) {
                ctx.fillStyle = '#fff';
                for (var band = 0; band < 5; band++) {
                    var y0 = h * (0.16 + band * 0.17);
                    ctx.beginPath();
                    ctx.moveTo(-10, y0);
                    for (var x = 0; x <= w; x += 8) {
                        var t = x / w;
                        var y = y0 + Math.sin(t * Math.PI * (2 + band * 0.6) + band) * h * 0.045;
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(w + 10, y0 + h * 0.030);
                    ctx.lineTo(w + 10, y0 + h * 0.055);
                    for (var x2 = w; x2 >= 0; x2 -= 8) {
                        var t2 = x2 / w;
                        var y2 = y0 + Math.sin(t2 * Math.PI * (2 + band * 0.6) + band) * h * 0.045 + h * 0.028;
                        ctx.lineTo(x2, y2);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            });
            return T.step(14);
        }).then(function () {
            T.seed(0x260B);
            T.stroke({ pts: [[-0.03, 0.10], [0.34, 0.14], [0.66, 0.08], [1.03, 0.13]],
                       steps: 44, radius: 0.0032, speed: 470, color: PAL.mint[0] });
            T.stroke({ pts: [[-0.03, 0.46], [0.34, 0.50], [0.66, 0.44], [1.03, 0.49]],
                       steps: 44, radius: 0.0030, speed: 450, color: PAL.cool[0] });
            return T.step(44);
        }).then(function () {
            var img = write('about-26-terrain.png', whole(grab()));
            window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
            if (window.clearObstacleTexture) window.clearObstacleTexture();
            return img;
        });
    }

    // 27 — walls you draw. Colliders shaped like brush strokes, so the
    // barrier reads as something a hand placed rather than geometry.
    function shotHandWalls() {
        return window.__stage(STAGE).then(function () {
            window.collisionLayers.setProcedural(function (ctx, w, h) {
                ctx.strokeStyle = '#fff';
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                var strokes = [
                    [[0.16, 0.22], [0.30, 0.52], [0.22, 0.80]],
                    [[0.46, 0.16], [0.56, 0.46], [0.44, 0.78]],
                    [[0.74, 0.24], [0.66, 0.52], [0.80, 0.80]]
                ];
                strokes.forEach(function (pts, i) {
                    ctx.lineWidth = Math.min(w, h) * (0.045 - i * 0.006);
                    ctx.beginPath();
                    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
                    ctx.quadraticCurveTo(pts[1][0] * w, pts[1][1] * h,
                                         pts[2][0] * w, pts[2][1] * h);
                    ctx.stroke();
                });
            });
            return T.step(14);
        }).then(function () {
            T.seed(0x270C);
            T.stroke({ pts: [[-0.03, 0.36], [0.32, 0.32], [0.66, 0.40], [1.03, 0.34]],
                       steps: 46, radius: 0.0032, speed: 500, color: PAL.warm[0] });
            T.stroke({ pts: [[-0.03, 0.64], [0.32, 0.68], [0.66, 0.60], [1.03, 0.66]],
                       steps: 46, radius: 0.0030, speed: 480, color: PAL.violet[0] });
            return T.step(42);
        }).then(function () {
            var img = write('about-27-handwalls.png', whole(grab()));
            window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
            if (window.clearObstacleTexture) window.clearObstacleTexture();
            return img;
        });
    }

    // ── Run ────────────────────────────────────────────────────────────
    var SHOTS = [shotBraid, shotArmCount, shotKaleidoModes, shotStencil];  // corrective pass
    var written = [];

    try {
        var win = require('@electron/remote').getCurrentWindow();
        if (win && !win.isMaximized()) win.maximize();
    } catch (e) {}

    window.__exporting = true;

    function done(err) {
        T.unseed();
        T.thaw();
        window.__exporting = false;
        try { if (window.__stageRestore) window.__stageRestore(); } catch (_) {}
        if (err) return { error: String((err && err.stack) || err), written: written };
        return { dir: DIR, written: written, pageErrors: T.errors(true) };
    }

    return T.freeze().then(function () {
        return SHOTS.reduce(function (chain, shot) {
            return chain.then(function () {
                return shot().then(function (r) { written.push(r); });
            });
        }, Promise.resolve());
    }).then(function () { return done(null); }, function (e) { return done(e); });
})()
