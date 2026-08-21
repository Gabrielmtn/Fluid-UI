// ═══════════════════════════════════════════════════════════════════
// scripts/bake-style-grid.js — style tiles and the sliced BACKGROUND,
// built from Gabriel's own saved presets, rendered by the real sim.
//
// PAGE code, same harness as the other bakers:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-style-grid.js
//
// WHY PRESETS AND NOT MUTATIONS
//   The grid began as random mutations. Even gated on colour distance they
//   came out different without being distinct — a mutation is a dice roll,
//   not a design. The saved presets are the looks that were actually authored
//   and kept, so every cell is a whole aesthetic somebody chose.
//
// WHAT IT WRITES (steam/screenshots/)
//   _contact-sheet-styles.png   every preset, labelled. WORKING file only —
//                               it has text on it and must never ship.
//   03a / 03b                   sliced style grids, curated selections
//   bg-slices-1920x1080.png     vertical-slice background for text to sit over
//   bg-slices-3840x1240.png     the same at library-hero proportions
//
// TWO THINGS LEARNED THE HARD WAY, both fixed here:
//   FULLNESS — thin lanes on black looked sparse beside a real painting. The
//     reference frame carries dye wall to wall. So there are more lanes, they
//     run past every edge, the dab gets a radius FLOOR (a preset with a fine
//     brush would otherwise never cover ground), and they settle long enough
//     to advect into each other and close the gaps.
//   KALEIDO — a mandala painted at one radius is a single flat ring. Kaleido
//     presets get three passes at inner, middle and outer radii with a
//     different colour each, which is what gives the bloom depth.
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
    selectTop('visualResolution');
    selectTop('physicsResolution');
    if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
        window.QualityGovernor.setEnabled(false);
    }
    window.__exporting = true;

    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;
    if (window.collisionLayers) window.collisionLayers.enabled = false;
    if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();

    // Remove every branding overlay. Belt and braces: clearAll if it exists,
    // otherwise hide each one individually.

    // MEASURED BUG: a preset snapshot carries the resolution SELECTS inside it
    // (visualResolution / physicsResolution), so applying one silently drags
    // quality back down to whatever was saved with it — 2048/512 on every
    // preset in this vault. Setting max once at startup is therefore useless
    // here: each usePreset() undid it, and every preset-based shot baked at
    // half the dye resolution and a QUARTER of the sim resolution. That is the
    // missing detail and sharpness. Re-assert the ceiling after every apply.
    function forceMaxQuality() {
        var q = { dye: selectTop('visualResolution'), sim: selectTop('physicsResolution') };
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
            window.QualityGovernor.setEnabled(false);
        }
        return q;
    }

    function stripBranding() {
        var b = window.brandingOverlays;
        if (!b) return;
        try {
            if (typeof b.clearAll === 'function') { b.clearAll(); return; }
            if (typeof b.getAll === 'function' && typeof b.remove === 'function') {
                (b.getAll() || []).slice().forEach(function (o) {
                    try { b.remove(o.id); } catch (_) {}
                });
            }
        } catch (_) {}
    }
    stripBranding();

    var _realRandom = Math.random;
    function seed(sv) {
        var x = sv >>> 0 || 1;
        Math.random = function () {
            x ^= x << 13; x >>>= 0;
            x ^= x >> 17;
            x ^= x << 5;  x >>>= 0;
            return x / 4294967296;
        };
    }
    function unseed() { Math.random = _realRandom; }

    function setBox(w, h) {
        var wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        return raf(12);
    }

    function bez(p, t) {
        var u = 1 - t;
        return [
            u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]
        ];
    }

    // A preset with a very fine brush can never cover ground in the frames it
    // gets, so the dab has a floor. The preset still decides everything else
    // about how that dab behaves.
    function dabRadius(scale) {
        var r = (typeof config.SPLAT_RADIUS === 'number') ? config.SPLAT_RADIUS : 0.006;
        return Math.max(r, 0.0065) * (scale || 1);
    }

    function stroke(pts, pal, opts) {
        opts = opts || {};
        var steps = opts.steps || 46, speed = opts.speed || 430, scale = opts.scale || 1;
        var chain = Promise.resolve();
        for (var i = 0; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var t = i / steps;
                    var a = bez(pts, t), b = bez(pts, Math.min(1, t + 0.02));
                    var dx = b[0] - a[0], dy = b[1] - a[1];
                    var len = Math.hypot(dx, dy) || 1;
                    var ease = 0.34 + 0.66 * (1 - t);
                    window.applyMultiSplatWith(
                        a[0], a[1],
                        (dx / len) * speed * ease, (dy / len) * speed * ease,
                        pal[i % pal.length], 1, dabRadius(scale), true
                    );
                    if (i % 3 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    var W, H;

    // Three colours per tile, not two: kaleido wants inner / middle / outer to
    // differ, and the flat lanes read richer with a third note in them.
    var TILE_PALETTES = [
        [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88], [0.55, 0.40, 0.98]],
        [[1.00, 0.42, 0.16], [1.00, 0.74, 0.22], [0.90, 0.20, 0.18]],
        [[0.98, 0.22, 0.55], [1.00, 0.55, 0.80], [0.62, 0.18, 0.72]],
        [[0.24, 0.92, 0.55], [0.70, 0.98, 0.40], [0.10, 0.62, 0.55]],
        [[0.60, 0.32, 0.99], [0.88, 0.48, 1.00], [0.30, 0.30, 0.85]],
        [[1.00, 0.85, 0.20], [0.98, 0.55, 0.10], [1.00, 0.97, 0.75]],
        [[0.10, 0.80, 0.82], [0.42, 0.55, 0.98], [0.05, 0.45, 0.60]],
        [[1.00, 0.30, 0.28], [1.00, 0.66, 0.45], [0.70, 0.12, 0.30]],
        [[0.35, 0.98, 0.86], [0.20, 0.62, 0.72], [0.75, 0.98, 0.90]],
        [[0.92, 0.48, 0.10], [0.70, 0.28, 0.06], [1.00, 0.78, 0.35]],
        [[0.72, 0.90, 0.30], [0.35, 0.70, 0.25], [0.95, 0.98, 0.55]],
        [[0.98, 0.40, 0.85], [0.55, 0.25, 0.85], [1.00, 0.70, 0.95]],
        [[0.30, 0.55, 1.00], [0.75, 0.88, 1.00], [0.12, 0.28, 0.75]],
        [[1.00, 0.55, 0.30], [0.98, 0.30, 0.20], [1.00, 0.80, 0.55]],
        [[0.45, 0.98, 0.70], [0.95, 0.98, 0.55], [0.15, 0.70, 0.50]],
        [[0.85, 0.20, 0.40], [0.45, 0.10, 0.45], [1.00, 0.55, 0.60]]
    ];

    // Eight lanes crossing both ways, every one running past the edges so the
    // dye has somewhere to come from and the frame fills instead of floating
    // on black. Identical geometry for every preset — same input is what makes
    // the difference between tiles read as STYLE rather than as noise.
    var LANES = [
        [[-0.08, 0.14], [0.30, 0.26], [0.70, 0.06], [1.08, 0.20]],
        [[1.08, 0.38], [0.70, 0.28], [0.30, 0.50], [-0.08, 0.38]],
        [[-0.08, 0.60], [0.32, 0.50], [0.70, 0.72], [1.08, 0.58]],
        [[1.08, 0.88], [0.68, 0.78], [0.30, 0.94], [-0.08, 0.82]],
        [[0.14, -0.08], [0.26, 0.34], [0.18, 0.68], [0.30, 1.08]],
        [[0.52, 1.08], [0.44, 0.70], [0.56, 0.36], [0.46, -0.08]],
        [[0.86, -0.08], [0.76, 0.36], [0.88, 0.66], [0.78, 1.08]],
        [[-0.08, 0.26], [0.36, 0.62], [0.72, 0.40], [1.08, 0.70]]
    ];

    // Kaleido presets: three concentric passes so the bloom has an inner, a
    // middle and an outer colour. One radius gives one flat ring.
    function kaleidoComposition(pal) {
        var cx = W / 2, cy = H / 2, R = Math.min(W, H);
        var rings = [
            { r: 0.09, col: pal[0], spin:  330, n: 12 },
            { r: 0.24, col: pal[1], spin: -300, n: 16 },
            { r: 0.40, col: pal[2] || pal[0], spin: 280, n: 20 }
        ];
        var chain = Promise.resolve();
        rings.forEach(function (ring) {
            for (var i = 0; i < ring.n; i++) {
                (function (ring, i) {
                    chain = chain.then(function () {
                        var a = (i / ring.n) * Math.PI * 2;
                        window.applyMultiSplatWith(
                            cx + Math.cos(a) * R * ring.r,
                            cy + Math.sin(a) * R * ring.r,
                            -Math.sin(a) * ring.spin, Math.cos(a) * ring.spin,
                            ring.col, 1, dabRadius(0.85), true
                        );
                        if (i % 3 === 0) return raf(1);
                    });
                })(ring, i);
            }
        });
        return chain;
    }

    function composition(pal) {
        seed(0x9E11);
        window.clearCanvas();
        var isKaleido = !!window.kaleidoEnabled;
        var chain = raf(3);
        if (isKaleido) {
            chain = chain.then(function () { return kaleidoComposition(pal); });
        } else {
            LANES.forEach(function (p) {
                chain = chain.then(function () {
                    return stroke(p.map(function (q) { return [q[0] * W, q[1] * H]; }), pal,
                                  { steps: 44, speed: 430 });
                });
            });
        }
        return chain.then(function () { return raf(isKaleido ? 34 : 44); }).then(function () {
            unseed();
            var c = document.createElement('canvas');
            c.width = canvas.width; c.height = canvas.height;
            c.getContext('2d').drawImage(canvas, 0, 0);
            return c;
        });
    }

    // ── Scoring ───────────────────────────────────────────────────────
    function sampleGrid(img, n) {
        var q = document.createElement('canvas');
        q.width = q.height = n;
        var x = q.getContext('2d');
        x.drawImage(img, 0, 0, n, n);
        return x.getImageData(0, 0, n, n).data;
    }
    function stats(d) {
        var n = d.length / 4, mean = [0, 0, 0], i, ch;
        for (i = 0; i < d.length; i += 4) { mean[0] += d[i]; mean[1] += d[i+1]; mean[2] += d[i+2]; }
        for (ch = 0; ch < 3; ch++) mean[ch] /= n;
        var v = 0, lit = 0;
        for (i = 0; i < d.length; i += 4) {
            for (ch = 0; ch < 3; ch++) { var t = d[i+ch] - mean[ch]; v += t * t; }
            if (d[i] + d[i+1] + d[i+2] > 40) lit++;
        }
        return {
            mean: mean,
            energy: (mean[0] + mean[1] + mean[2]) / 3,
            structure: Math.sqrt(v / (n * 3)),
            fill: lit / n
        };
    }
    function hueOf(m) {
        var r = m[0]/255, g = m[1]/255, b = m[2]/255;
        var mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
        if (d < 1e-6) return 0;
        var h;
        if (mx === r) h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
        return h;
    }

    function frame(w, h) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
        x.fillStyle = '#080c12';
        x.fillRect(0, 0, w, h);
        x.imageSmoothingQuality = 'high';
        return { c: c, x: x };
    }
    function write(name, c) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        return { name: name, kb: Math.round(buf.length / 1024) };
    }

    // Dye coverage inside an arbitrary rectangle of an image, 0..1.
    function rectFill(img, x0, y0, rw, rh) {
        var q = document.createElement('canvas');
        q.width = 10; q.height = 10;
        var x = q.getContext('2d');
        x.drawImage(img, x0, y0, rw, rh, 0, 0, 10, 10);
        var d = x.getImageData(0, 0, 10, 10).data, lit = 0;
        for (var i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 40) lit++;
        return lit / (d.length / 4);
    }

    function buildGrid(picks, cols, rows, name, written) {
        var f = frame(OUT_W, OUT_H);
        var tw = OUT_W / cols, th = OUT_H / rows;
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var item = picks[r * cols + c];
                if (!item) continue;
                var img = item.img;
                var rw = img.width / cols, rh = img.height / rows;
                var x0 = (c / cols) * img.width, y0 = (r / rows) * img.height;
                // Registration is the default so the cells read as one canvas.
                // But a centred look — a kaleido bloom — has nothing out at the
                // edges, and in a 4x2 no single cell contains the centre: it is
                // the junction of four. That cell came back almost entirely
                // black. When a cell's own region is bare, take the middle of
                // that image instead; one cell out of alignment costs less than
                // a black square in the grid.
                if (rectFill(img, x0, y0, rw, rh) < 0.12) {
                    x0 = (img.width - rw) / 2;
                    y0 = (img.height - rh) / 2;
                }
                f.x.drawImage(img, x0, y0, rw, rh, c * tw, r * th, tw, th);
            }
        }
        written.push(write(name, f.c));
    }

    // Vertical-slice background: strip k is that strip's OWN x-region taken
    // from image k, so the columns register with each other and the whole still
    // reads as one continuous painting for text to sit on.
    // How much dye sits in one vertical region of an image, 0..1.
    function regionFill(img, x0, wRegion) {
        var q = document.createElement('canvas');
        q.width = 8; q.height = 16;
        var x = q.getContext('2d');
        x.drawImage(img, x0, 0, wRegion, img.height, 0, 0, 8, 16);
        var d = x.getImageData(0, 0, 8, 16).data;
        var lit = 0;
        for (var i = 0; i < d.length; i += 4) {
            if (d[i] + d[i+1] + d[i+2] > 40) lit++;
        }
        return lit / (d.length / 4);
    }

    function buildSliceBackground(picks, name, w, h, written) {
        var n = picks.length;
        var f = frame(w, h);
        var sw = w / n;
        var srcNote = [];
        for (var k = 0; k < n; k++) {
            var img = picks[k].img;
            var regionW = img.width / n;
            var x0 = (k / n) * img.width;
            // Registration is the default: strip k shows strip k's own region,
            // so the columns line up as one continuous painting. But a centred
            // look (a kaleido bloom) has nothing at all out at the edges, and
            // an empty column reads as a hole rather than as a style. When the
            // strip's own region is bare, take the middle of that image instead
            // — losing registration on one column costs less than a black bar.
            var fill = regionFill(img, x0, regionW);
            if (fill < 0.10) {
                x0 = (img.width - regionW) / 2;
                srcNote.push(picks[k].name + ':centre');
            } else {
                srcNote.push(picks[k].name + ':aligned');
            }
            f.x.drawImage(img, x0, 0, regionW, img.height, k * sw, 0, sw, h);
        }
        written.push(write(name, f.c));
        return srcNote;
    }

    // ── Run ───────────────────────────────────────────────────────────
    var written = [];
    var shots = [];
    var BASE = null;

    var list = [];
    try {
        if (window.PresetVault && window.PresetVault.available && window.PresetVault.list) {
            list = window.PresetVault.list();
        }
    } catch (e) {}
    if (!list.length && window.Settings && window.Settings.getAllPresets) {
        var all = window.Settings.getAllPresets() || {};
        list = Object.keys(all).map(function (k) { return { name: k, snapshot: all[k].snapshot || all[k] }; });
    }

    // Presets carrying a branding overlay bake the overlay text into the
    // canvas — "VizDevBoston" is legible in the render, and a store page cannot
    // ship someone else's event name. "mask" paints an imported face image,
    // likewise not ours to publish.
    // Clearing brandingOverlays was not enough: in these presets the wordmark
    // is baked in as mask/layer content, not as a removable overlay, so it
    // survived clearAll and rendered anyway. "pen" carries the same VizDevBoston
    // lockup as the preset named for it, which is why excluding by name alone
    // missed it the first time. Nothing with legible text can reach a store
    // asset, so these are out by name AND the overlay strip stays as a guard.
    var EXCLUDE = [
        'vizdevboston', 'pen', 'test invite', 'text',   // bake in legible text
        'mask'                                          // imported face image
    ];
    list = list.filter(function (p) {
        if (!p || !p.snapshot) return false;
        return EXCLUDE.indexOf(String(p.name).toLowerCase()) === -1;
    });
    if (!list.length) return Promise.resolve({ error: 'no usable presets found' });

    var applySnap = window.applyPresetSnapshotFull || window.applyPresetSnapshot;

    return setBox(1920, 1080).then(function () {
        W = canvas.width; H = canvas.height;
        if (window.capturePresetSnapshot) BASE = window.capturePresetSnapshot();
        var chain = Promise.resolve();
        list.forEach(function (p, idx) {
            chain = chain.then(function () {
                try { applySnap(p.snapshot); } catch (e) {}
                forceMaxQuality();   // the preset just clobbered the resolution selects
                // Branding overlays ride along inside the snapshot and paint
                // their text into the canvas — "VizDevBoston" showed up in the
                // render of a preset that isn't even named for it. Excluding
                // presets by name missed that, so the overlays are cleared
                // after EVERY apply instead. Nothing with text can ship.
                stripBranding();
                if (window.collisionLayers) window.collisionLayers.enabled = false;
                if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
                return raf(14);
            }).then(function () {
                return composition(TILE_PALETTES[idx % TILE_PALETTES.length]);
            }).then(function (img) {
                var st = stats(sampleGrid(img, 8));
                shots.push({
                    name: p.name, img: img, kaleido: !!window.kaleidoEnabled,
                    energy: st.energy, structure: st.structure, fill: st.fill, hue: hueOf(st.mean)
                });
            });
        });
        return chain;
    }).then(function () {
        if (BASE && window.applyPresetSnapshot) window.applyPresetSnapshot(BASE);

        // Contact sheet — working reference, labelled, never a store asset.
        var cs = 5, rs = Math.ceil(shots.length / cs);
        var cw = 512, chh = 300;
        var sheet = frame(cs * cw, rs * (chh + 26));
        shots.forEach(function (s, i) {
            var r = Math.floor(i / cs), c = i % cs;
            var x0 = c * cw, y0 = r * (chh + 26);
            sheet.x.drawImage(s.img, x0, y0, cw, chh);
            sheet.x.fillStyle = 'rgba(8,12,18,0.92)';
            sheet.x.fillRect(x0, y0 + chh, cw, 26);
            sheet.x.fillStyle = '#dfe6ee';
            sheet.x.font = '15px "Segoe UI", sans-serif';
            sheet.x.textBaseline = 'middle';
            sheet.x.fillText((i + 1) + '. ' + s.name +
                '   [fill ' + Math.round(s.fill * 100) + '%  str ' + Math.round(s.structure) + ']',
                x0 + 10, y0 + chh + 13);
        });
        written.push(write('_contact-sheet-styles.png', sheet.c));

        function pick(names) {
            var out = [];
            names.forEach(function (n) {
                for (var i = 0; i < shots.length; i++) {
                    if (String(shots[i].name).toLowerCase() === String(n).toLowerCase()) { out.push(shots[i]); return; }
                }
            });
            return out;
        }

        // Curated by eye off the contact sheet, not by score — the score
        // rewards contrast against black, which is not the same as being worth
        // looking at. ORDER IS PLACEMENT: in a 4x2 the middle cells are 1, 2, 5
        // and 6, so radial looks go there; a slice of a centred bloom taken
        // from a corner cell is just background.
        // Pretty Kaleido is out of the GRID on purpose: its bloom is centred
        // and small, so whichever cell it lands in shows mostly background —
        // the centre-fallback fires only when a cell is almost entirely bare,
        // and this one sits just above that line. It still earns its place as
        // the accent column in the slice background, where the whole centre of
        // the image is used. mandala keeps the radial character at 92% fill.
        var GRID_A = ['8x oil', 'adhoc abstract', 'mandala', 'trail',
                      'circles', 'spaghetti', 'SurfaceShade+LightShift', 'Pretty Light Shift'];
        var GRID_B = ['original', 'Pretty Kaleido', 'adhoc abstract', 'mandala',
                      'trail', 'SurfaceShade+LightShift', 'spaghetti', 'circles'];

        var built = [];
        [{ f: '03a-styles-4x2.png', n: GRID_A, c: 4, r: 2 },
         { f: '03b-styles-4x2-alt.png', n: GRID_B, c: 4, r: 2 }].forEach(function (v) {
            var picks = pick(v.n);
            if (picks.length >= v.c * v.r) { buildGrid(picks, v.c, v.r, v.f, written); built.push(v.f); }
            else built.push(v.f + ' SKIPPED (' + picks.length + '/' + (v.c * v.r) + ')');
        });

        // The slice background, ordered so neighbouring columns never share a
        // colour family and the two busiest looks are kept apart.
        var BG_ORDER = ['8x oil', 'Pretty Light Shift', 'circles', 'spaghetti',
                        'trail', 'adhoc abstract', 'SurfaceShade+LightShift',
                        'mandala', 'original', 'Pretty Kaleido'];
        var bgPicks = pick(BG_ORDER);
        if (bgPicks.length < 6) bgPicks = shots.slice(0, 10);
        var sliceSources = buildSliceBackground(bgPicks, 'bg-slices-1920x1080.png', 1920, 1080, written);
        buildSliceBackground(bgPicks, 'bg-slices-3840x1240.png', 3840, 1240, written);

        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return {
            written: written,
            built: built,
            bgColumns: sliceSources,
            rendered: shots.map(function (s) {
                return s.name + (s.kaleido ? ' [KALEIDO]' : '') +
                       ' fill ' + Math.round(s.fill * 100) + '% str ' + Math.round(s.structure);
            })
        };
    }).catch(function (e) {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { error: String(e && e.stack || e), written: written };
    });
})()
