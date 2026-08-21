// ═══════════════════════════════════════════════════════════════════
// scripts/bake-screenshots.js — the five Steam screenshots, baked FROM
// THE REAL SIM at full quality.
//
// PAGE code. Same harness as bake-store-assets.js:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-screenshots.js
//
// Writes steam/screenshots/*.png at 1920×1080.
//
// THE BRIEF
//   Show the FEATURE THROUGH THE SWIRLS, not through the interface. The
//   canvas is the game; a screenshot full of sliders sells a control panel.
//   So every frame here is canvas pixels edge to edge and no chrome.
//
//   01 group     — many hands at once: six palettes converging.
//   02 stranger  — exactly two hands, meeting. The whole pitch in one frame.
//   03 mutate    — ONE composition, painted identically N times under N real
//                  mutations, then tiled: cell k is that cell's region cut
//                  from mutation k. The slices line up, so it reads as a
//                  single canvas, while every tile is visibly a different
//                  style. That contrast IS the feature.
//   04 record    — one stroke sampled at N moments and tiled in reading
//                  order: the same swirl, playing back through time.
//   05 collide   — paint parting around solid obstacles, layered.
//
// QUALITY
//   Resolution is set to the top option FIRST and the QualityGovernor is
//   frozen AFTER — the governor ascends post-boot, so disabling it early
//   pins the sim at the boot default and everything bakes soft.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var DIR = 'steam/screenshots';
    var OUT_W = 1920, OUT_H = 1080;

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    if (!canvas || !window.config || !window.applyMultiSplatWith) {
        return Promise.resolve({ error: 'app not ready' });
    }

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }

    // ── Stage ──────────────────────────────────────────────────────────
    try {
        var win = require('@electron/remote').getCurrentWindow();
        if (win && !win.isMaximized()) win.maximize();
    } catch (e) {}

    function selectTop(id) {
        var el = document.getElementById(id);
        if (!el || !el.options.length) return null;
        el.value = el.options[0].value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
    }
    var QUALITY = { dye: selectTop('visualResolution'), sim: selectTop('physicsResolution') };

    window.__exporting = true;          // no collider film / mask overlay
    window.kaleidoEnabled = false;
    config.GLOW = true;
    config.GLOW_INTENSITY = 0.55;

    // Light Shift walks hue over the length of a bake; two hands stop being
    // two colours. Measured while baking the capsules.
    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;
    var colliderWas = !!(window.collisionLayers && window.collisionLayers.enabled);
    if (window.collisionLayers) window.collisionLayers.enabled = false;

    // A mutation applied by hand earlier in the session is still live config,
    // and it lifted the background to grey in the first shot of the last bake.
    // The Mutate panel's Reset restores the pre-mutation snapshot, which is the
    // only "known good" look reachable from here.
    var _reset = Array.prototype.find.call(document.querySelectorAll('button'), function (b) {
        return (b.textContent || '').trim() === 'Reset';
    });
    if (_reset) _reset.click();
    // enabled=false alone did NOT clear the obstacle: the uploaded texture is
    // what the solver actually samples, so a stale collider kept stamping a
    // black disc through every tile. Drop the texture itself.
    if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();

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

    // 16:9 box so the capture needs no cropping. The area is ~2182×1278
    // maximized, so 1920×1080 fits natively.
    function setBox(w, h) {
        var wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        return raf(12);
    }

    var PAL = {
        cool: [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88]],
        warm: [[1.00, 0.42, 0.16], [1.00, 0.66, 0.18]],
        rose: [[0.98, 0.22, 0.55], [1.00, 0.45, 0.72]],
        mint: [[0.20, 0.92, 0.62], [0.45, 0.95, 0.80]],
        violet: [[0.55, 0.35, 0.98], [0.72, 0.45, 1.00]],
        gold: [[1.00, 0.80, 0.22], [0.98, 0.58, 0.12]]
    };

    function bez(p, t) {
        var u = 1 - t;
        return [
            u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]
        ];
    }

    // Coverage goes as radius²; one dab at 0.008 is a third of the frame
    // across, so strokes live near 0.003 or the canvas floods to one wash.
    function stroke(pts, pal, opts) {
        opts = opts || {};
        var steps = opts.steps || 44,
            speed = opts.speed || 400,
            radius = (opts.radius === null) ? null : (opts.radius || 0.0028),
            exact = (opts.exact !== false);
        var chain = Promise.resolve();
        for (var i = 0; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var t = i / steps;
                    var a = bez(pts, t), b = bez(pts, Math.min(1, t + 0.02));
                    var dx = b[0] - a[0], dy = b[1] - a[1];
                    var len = Math.hypot(dx, dy) || 1;
                    var ease = 0.32 + 0.68 * (1 - t);
                    var rad = (radius === null)
                        ? undefined                       // keep the preset's own SPLAT_RADIUS
                        : radius * (0.8 + 0.3 * Math.sin(t * Math.PI));
                    window.applyMultiSplatWith(
                        a[0], a[1],
                        (dx / len) * speed * ease, (dy / len) * speed * ease,
                        pal[i % pal.length], 1, rad, exact
                    );
                    if (i % 3 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    function grab() {
        var c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
    }

    function frame() {
        var c = document.createElement('canvas');
        c.width = OUT_W; c.height = OUT_H;
        var x = c.getContext('2d');
        x.fillStyle = '#080c12';
        x.fillRect(0, 0, OUT_W, OUT_H);
        x.imageSmoothingQuality = 'high';
        return { c: c, x: x };
    }
    function cover(x, src, W, H) {
        var s = Math.max(W / src.width, H / src.height);
        var dw = src.width * s, dh = src.height * s;
        x.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    function write(name, c) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        return { name: name, kb: Math.round(buf.length / 1024) };
    }

    var written = [];
    var W, H;
    var BASE = null;

    function captureBase() {
        return raf(40).then(function () {
            if (window.capturePresetSnapshot) BASE = window.capturePresetSnapshot();
            return BASE;
        });
    }
    // Every shot starts from the same look, with no obstacle carried in.
    function resetLook() {
        if (BASE && window.applyPresetSnapshot) window.applyPresetSnapshot(BASE);
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
        config.GLOW = true;
        config.GLOW_INTENSITY = 0.55;
        return raf(14);
    }

    // ── 01 group: six hands converging ────────────────────────────────
    function shotGroup() {
        var _pre = resetLook();
        seed(0x6120);
        return _pre.then(function () { return setBox(1920, 1080); }).then(function () {
            W = canvas.width; H = canvas.height;
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            var hands = [
                { p: [[-0.05, 0.24], [0.16, 0.16], [0.34, 0.34], [0.47, 0.44]], k: 'cool' },
                { p: [[1.05, 0.74], [0.84, 0.82], [0.66, 0.62], [0.53, 0.52]], k: 'warm' },
                { p: [[0.18, 1.06], [0.26, 0.82], [0.40, 0.66], [0.50, 0.56]], k: 'rose' },
                { p: [[0.80, -0.06], [0.74, 0.20], [0.62, 0.34], [0.53, 0.44]], k: 'mint' },
                { p: [[-0.05, 0.78], [0.18, 0.70], [0.34, 0.60], [0.46, 0.53]], k: 'violet' },
                { p: [[1.05, 0.20], [0.86, 0.26], [0.68, 0.40], [0.56, 0.47]], k: 'gold' }
            ];
            var chain = Promise.resolve();
            hands.forEach(function (h) {
                chain = chain.then(function () {
                    var pts = h.p.map(function (q) { return [q[0] * W, q[1] * H]; });
                    return stroke(pts, PAL[h.k], { steps: 40, speed: 380, radius: 0.0026 });
                });
            });
            return chain;
        }).then(function () { return raf(34); }).then(function () {
            unseed();
            var f = frame();
            cover(f.x, grab(), OUT_W, OUT_H);
            written.push(write('01-swirl-in-a-group.png', f.c));
        });
    }

    // ── 02 stranger: two hands, meeting ───────────────────────────────
    function shotStranger() {
        var _pre = resetLook();
        seed(0x5712);
        return _pre.then(function () { return setBox(1920, 1080); }).then(function () {
            W = canvas.width; H = canvas.height;
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            var M = [W * 0.50, H * 0.50];
            return stroke([[-0.06*W, 0.90*H], [0.20*W, 0.72*H], [0.36*W, 0.60*H], M],
                          PAL.cool, { steps: 48, speed: 420, radius: 0.0030 });
        }).then(function () {
            var M = [W * 0.50, H * 0.50];
            return stroke([[1.06*W, 0.10*H], [0.82*W, 0.24*H], [0.66*W, 0.38*H], M],
                          PAL.warm, { steps: 48, speed: 420, radius: 0.0030 });
        }).then(function () { return raf(32); }).then(function () {
            unseed();
            var f = frame();
            cover(f.x, grab(), OUT_W, OUT_H);
            written.push(write('02-swirl-with-a-stranger.png', f.c));
        });
    }

    // The composition every mutate tile shares. Identical seed and identical
    // path each pass, so the ONLY thing that differs between tiles is the
    // mutation — which is what makes the grid legible as variety rather than
    // as noise.
    function mutateComposition() {
        seed(0x9E11);
        window.clearCanvas();
        // Every cell of the grid is a different region of this composition, so
        // the composition has to reach every region — the first pass put two
        // strokes through the middle and nine of twelve tiles came back black.
        var lanes = [
            { p: [[-0.05, 0.18], [0.30, 0.30], [0.68, 0.10], [1.05, 0.22]], k: 'cool' },
            { p: [[1.05, 0.50], [0.68, 0.38], [0.32, 0.62], [-0.05, 0.48]], k: 'warm' },
            { p: [[-0.05, 0.82], [0.30, 0.70], [0.68, 0.90], [1.05, 0.76]], k: 'rose' },
            { p: [[0.16, -0.05], [0.28, 0.36], [0.20, 0.66], [0.34, 1.05]], k: 'mint' },
            { p: [[0.84, 1.05], [0.74, 0.64], [0.82, 0.34], [0.68, -0.05]], k: 'gold' }
        ];
        var chain = raf(3);
        lanes.forEach(function (ln) {
            chain = chain.then(function () {
                var pts = ln.p.map(function (q) { return [q[0] * W, q[1] * H]; });
                return stroke(pts, PAL[ln.k], { steps: 40, speed: 400, radius: null, exact: false });
            });
        });
        return chain.then(function () { return raf(26); }).then(function () {
            unseed();
            return grab();
        });
    }

    // ── 03 mutate: one canvas, N styles, sliced together ──────────────
    // ── 03 styles: one canvas, one preset per cell ────────────────────
    // The grid used to roll random mutations, and even gated on colour
    // distance it kept producing tiles that were merely different rather than
    // meaningfully different — a mutation is a dice roll, not a design. The
    // built-in presets ARE the game's designed looks: silky, thick, wispy,
    // chaotic, ethereal, turbulent, marble, electric each have their own
    // dissipation, curl and brush weight, so every cell is a distinct
    // aesthetic a player can name and reproduce. Paired with a palette each,
    // and sliced so cell k shows that cell's region of preset k, the grid
    // reads as one canvas painted eight different ways.
    var COLS = 4, ROWS = 2;
    var PRESET_ORDER = [
        // Ordered so neighbours contrast: smooth against sharp, wide against fine.
        'silky', 'chaotic', 'ethereal', 'marble',
        'thick', 'turbulent', 'wispy', 'electric'
    ];

    function shotPresets() {
        var _pre = resetLook();
        var tiles = [];
        var used = [];
        return _pre.then(function () { return setBox(1920, 1080); }).then(function () {
            W = canvas.width; H = canvas.height;
            var palCount = (window.curatedPalettes && window.curatedPalettes.length) || 0;
            var chain = Promise.resolve();
            PRESET_ORDER.forEach(function (name, k) {
                chain = chain.then(function () {
                    if (BASE && window.applyPresetSnapshot) window.applyPresetSnapshot(BASE);
                    // Palette first, preset second: applyPreset owns the flow
                    // parameters and must not be overwritten by a palette apply.
                    if (palCount && window.applyPalette) {
                        try { window.applyPalette(k % palCount); } catch (_) {}
                    }
                    if (window.applyPreset) window.applyPreset(name);
                    if (window.collisionLayers) window.collisionLayers.enabled = false;
                    if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
                    used.push(name);
                    return raf(12);
                }).then(mutateComposition).then(function (img) {
                    tiles.push(img);
                });
            });
            return chain;
        }).then(function () {
            if (BASE && window.applyPresetSnapshot) window.applyPresetSnapshot(BASE);
            var f = frame();
            var tw = OUT_W / COLS, th = OUT_H / ROWS;
            for (var r = 0; r < ROWS; r++) {
                for (var c = 0; c < COLS; c++) {
                    var k = r * COLS + c;
                    var img = tiles[k] || tiles[0];
                    if (!img) continue;
                    // This cell's region, cut from preset k at the same place
                    // it sits in the finished frame, so the slices register.
                    f.x.drawImage(img,
                        (c / COLS) * img.width, (r / ROWS) * img.height,
                        img.width / COLS, img.height / ROWS,
                        c * tw, r * th, tw, th);
                }
            }
            written.push(write('03-mutate-your-swirl.png', f.c));
            return { presets: used };
        });
    }

    // ── 04 record: one swirl, sampled through time ────────────────────
    function shotRecord() {
        var _pre = resetLook();
        var frames = [];
        var RC = 2, RR = 2;        // 960x540 cells — exactly 16:9, no cropping
        var STRIDE = 16;           // far enough apart that the flow visibly moves
        return _pre.then(function () { return setBox(1920, 1080); }).then(function () {
            W = canvas.width; H = canvas.height;
            seed(0x4EC0);
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            // Same full-field shape as the mutate composition: a stroke that
            // only crosses the middle leaves most of every tile black.
            var lanes = [
                { p: [[-0.05, 0.22], [0.32, 0.34], [0.66, 0.14], [1.05, 0.28]], k: 'rose' },
                { p: [[1.05, 0.54], [0.66, 0.42], [0.30, 0.66], [-0.05, 0.50]], k: 'gold' },
                { p: [[-0.05, 0.84], [0.32, 0.72], [0.66, 0.92], [1.05, 0.78]], k: 'violet' },
                { p: [[0.22, -0.05], [0.32, 0.38], [0.22, 0.68], [0.36, 1.05]], k: 'cool' }
            ];
            var chain = Promise.resolve();
            lanes.forEach(function (ln) {
                chain = chain.then(function () {
                    var pts = ln.p.map(function (q) { return [q[0] * W, q[1] * H]; });
                    return stroke(pts, PAL[ln.k], { steps: 40, speed: 420, radius: 0.0026 });
                });
            });
            return chain;
        }).then(function () {
            var chain = raf(10);
            for (var i = 0; i < RC * RR; i++) {
                chain = chain.then(function () {
                    return raf(STRIDE).then(function () { frames.push(grab()); });
                });
            }
            return chain;
        }).then(function () {
            unseed();
            var f = frame();
            var tw = OUT_W / RC, th = OUT_H / RR;
            for (var r = 0; r < RR; r++) {
                for (var c = 0; c < RC; c++) {
                    var img = frames[r * RC + c];
                    if (!img) continue;
                    f.x.drawImage(img, 0, 0, img.width, img.height, c * tw, r * th, tw, th);
                }
            }
            written.push(write('04-record-and-play-back.png', f.c));
        });
    }

    // ── 05 collide: paint parting around solids ───────────────────────
    function shotCollide() {
        var _pre = resetLook();
        seed(0xC011);
        return _pre.then(function () { return setBox(1920, 1080); }).then(function () {
            W = canvas.width; H = canvas.height;
            // Obstacles are declared, not drawn by hand into the canvas and
            // traced through the mask wizard: setProcedural hands the collider
            // compositor a draw function and ALPHA is the wall strength
            // (23-depth-collision.js:1439). Three staggered discs give the
            // streams something to weave through, where one big disc just
            // reads as a hole punched in the picture.
            if (window.collisionLayers && window.collisionLayers.setProcedural) {
                window.collisionLayers.setProcedural(function (ctx, w, h) {
                    ctx.fillStyle = '#ffffff';
                    var r = Math.min(w, h);
                    [[0.28, 0.34, 0.105], [0.53, 0.63, 0.130], [0.77, 0.32, 0.095]]
                        .forEach(function (d) {
                            ctx.beginPath();
                            ctx.arc(d[0] * w, d[1] * h, d[2] * r, 0, Math.PI * 2);
                            ctx.fill();
                        });
                });
            }
            window.clearCanvas();
            return raf(14);
        }).then(function () {
            // Driven straight at the obstacles so the parting is the subject.
            var chain = Promise.resolve();
            var lanes = [
                { y: 0.30, pal: PAL.cool },
                { y: 0.50, pal: PAL.mint },
                { y: 0.70, pal: PAL.gold }
            ];
            lanes.forEach(function (ln) {
                chain = chain.then(function () {
                    return stroke([[-0.05*W, ln.y*H], [0.30*W, ln.y*H], [0.70*W, ln.y*H], [1.05*W, ln.y*H]],
                                  ln.pal, { steps: 48, speed: 540, radius: 0.0026 });
                });
            });
            return chain;
        }).then(function () { return raf(40); }).then(function () {
            unseed();
            var f = frame();
            cover(f.x, grab(), OUT_W, OUT_H);
            written.push(write('05-swirl-around-colliders.png', f.c));
        });
    }

    function restore() {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = colliderWas;
        }
        unseed();
    }

    if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
        window.QualityGovernor.setEnabled(false);
    }

    return captureBase().then(shotGroup)
        .then(shotStranger)
        .then(shotPresets)
        .then(shotRecord)
        .then(shotCollide)
        .then(function () {
            restore();
            return { written: written, quality: { dye: config.DYE_RESOLUTION, sim: config.SIM_RESOLUTION }, grid: COLS + 'x' + ROWS, presets: PRESET_ORDER };
        })
        .catch(function (e) {
            restore();
            return { error: String(e && e.stack || e), written: written };
        });
})()
