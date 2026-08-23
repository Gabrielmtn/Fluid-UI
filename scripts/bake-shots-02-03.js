// ═══════════════════════════════════════════════════════════════════
// scripts/bake-shots-02-03.js — re-bakes ONLY screenshots 02 and 03,
// plus their text previews. 01/04/05 are already good and are not touched.
//
// PAGE code, same harness as the other bakers:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-shots-02-03.js
//
// WHY THESE TWO ARE BEING REDONE
//
//   02 MUSIC   The shipped one baked the ring-pulse device on the 'mandala'
//              vault preset, and mandala is soft: seven pulses dissolved into
//              each other and the frame came out as one out-of-focus gradient
//              blob with the right third dead black (origin was at x=0.30).
//              Nothing in it is periodic, so nothing in it says "music".
//
//              This one is a WAVEFORM. Dye is injected along an oscilloscope
//              trace that spans the full width — mirrored above and below a
//              centre axis, amplitude swelling and collapsing through loud and
//              quiet passages, hue sweeping bass-to-treble across the spectrum.
//              Every injection throws its velocity PERPENDICULAR to the axis,
//              so the trace grows vertical plumes that carve their own lanes
//              instead of smearing into one horizontal bar — which is the
//              failure mode the earlier spectrum-bars attempt hit.
//
//              As with the previous bake: the amplitudes are a synthesised
//              waveform, not a capture. Driving the live analyser needs audio
//              in, which a headless bake cannot provide. The MECHANISM is real
//              (band-indexed splats through applyMultiSplatWith); the numbers
//              are stand-ins.
//
//   03 STYLES  The device is right — one composition, painted once per preset,
//              then sliced so cell k shows preset k's version of that cell's
//              region — but the colour came from applyPalette(k % palCount),
//              and curatedPalettes defaults to FOUR entries (01-config.js:57).
//              Two of them, Forest Serenity and Mountain Majesty, are brown,
//              olive and sage: that is exactly the muddy half of the shipped
//              grid. So the palettes are no longer walked; each cell gets an
//              explicit vivid palette chosen to contrast with its neighbours,
//              and the presets supply the TEXTURE difference the shot is
//              actually about.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var DIR = 'steam/screenshots';
    var PREVIEW = 'steam/screenshots/preview';
    var OUT_W = 1920, OUT_H = 1080;

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    if (!canvas || !window.config || !window.applyMultiSplatWith) {
        return Promise.resolve({ error: 'app not ready' });
    }

    // Console-tunable overrides, so a re-bake can be nudged without an edit:
    //   window.__shotOpts = { preset02: 'wispy', settle02: 30 }
    var OPT = window.__shotOpts || {};

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }
    function loadImage(src) {
        return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { rej(new Error('load fail ' + src)); };
            im.src = src + '?' + Date.now();
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
    // Resolution to the top option FIRST, governor frozen AFTER — the governor
    // ascends post-boot, so disabling it early pins the sim at the boot default
    // and everything bakes soft.
    function forceMaxQuality() {
        var q = { dye: selectTop('visualResolution'), sim: selectTop('physicsResolution') };
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
            window.QualityGovernor.setEnabled(false);
        }
        return q;
    }
    forceMaxQuality();

    window.__exporting = true;              // no collider film / mask overlay
    window.kaleidoEnabled = false;
    config.GLOW = true;
    config.GLOW_INTENSITY = 0.55;

    // Light Shift walks hue over the length of a bake, which turns a deliberate
    // bass-to-treble sweep into mush. Measured while baking the capsules.
    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;

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
    function clearObstacles() {
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
    }

    // Applying anything can drag layers, masks and colliders back onto the
    // canvas with it. deleteLayer(index) matches the layer's OWN .index, not
    // its array position (05l-layers-transform.js:133), so ids are snapshotted
    // before deleting or a layer whose id drifted from its slot survives.
    function stripCanvasContent() {
        try {
            if (Array.isArray(window.layers) && typeof window.deleteLayer === 'function') {
                window.layers.map(function (l) { return l.index; })
                    .forEach(function (id) { try { window.deleteLayer(id); } catch (_) {} });
            }
        } catch (_) {}
        try {
            if (window.Masks && window.Masks.list && window.Masks.remove) {
                (window.Masks.list() || []).slice().forEach(function (m) {
                    try { window.Masks.remove(m && m.id !== undefined ? m.id : m); } catch (_) {}
                });
            }
        } catch (_) {}
        try { if (window.rasterLayers && window.rasterLayers.clear) window.rasterLayers.clear(); } catch (_) {}
        try {
            if (window.brandingOverlays && window.brandingOverlays.clearAll) window.brandingOverlays.clearAll();
        } catch (_) {}
        clearObstacles();
    }

    function grab() {
        var c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
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
    function cover(x, src, W, H) {
        var s = Math.max(W / src.width, H / src.height);
        var dw = src.width * s, dh = src.height * s;
        x.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    var written = [];
    function write(dir, name, c) {
        var d = path.join(process.cwd(), dir);
        fs.mkdirSync(d, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(d, name), buf);
        written.push({ name: name, kb: Math.round(buf.length / 1024) });
    }

    function hsv(h, sv, vv) {
        h = ((h % 360) + 360) % 360;
        var c = vv * sv, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = vv - c;
        var r = 0, g = 0, b = 0;
        if (h < 60)       { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else              { r = c; b = x; }
        return [r + m, g + m, b + m];
    }

    var BASE = null;
    // Built-in presets only. The vault presets belong to whoever is sitting at
    // the machine; the built-ins ship with the game, so this bake reproduces
    // on any checkout.
    function useBuiltin(name) {
        if (BASE && window.applyPresetSnapshot) { try { window.applyPresetSnapshot(BASE); } catch (_) {} }
        if (window.applyPreset) { try { window.applyPreset(name); } catch (_) {} }
        stripCanvasContent();
        forceMaxQuality();   // a preset apply carries the resolution selects with it
        return raf(14);
    }

    var W, H;

    // ── 02 MUSIC — an oscilloscope trace, blown into fluid ─────────────
    //
    // The axis runs the full width so there is no dead frame. Amplitude is a
    // fast oscillation inside a slow envelope, which is what a bar of music
    // looks like on a scope: a run of loud cycles, a drop, another run. The
    // envelope peaks also get a bloom, because a beat in this engine is a
    // burst of splats and it should look like one.
    function shotMusic() {
        var PRESET = OPT.preset02 || 'electric';
        var SETTLE = OPT.settle02 || 24;
        var N      = OPT.n02 || 132;          // sample points along the trace
        var CYCLES = 7.5;                     // oscillations across the width
        var AMP    = 0.30;                    // peak deflection, fraction of H
        var THROW  = 620;                     // perpendicular velocity at full amp

        // Envelope: four loud passages with quiet between them, never all the
        // way to zero — a silent stretch just reads as a gap in the paint.
        function envelope(t) {
            var swell = 0.5 - 0.5 * Math.cos(t * Math.PI * 8);     // 4 peaks
            var tilt  = 1 - 0.22 * t;                              // bass louder
            return (0.24 + 0.76 * Math.pow(swell, 0.75)) * tilt;
        }

        return useBuiltin(PRESET).then(function () {
            return setBox(1920, 1080);
        }).then(function () {
            W = canvas.width; H = canvas.height;
            seed(0x5EED);
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            var axis = H * 0.5;
            var chain = Promise.resolve();
            for (var i = 0; i < N; i++) {
                (function (i) {
                    chain = chain.then(function () {
                        var t = i / (N - 1);
                        var env = envelope(t);
                        var wave = Math.sin(t * Math.PI * 2 * CYCLES);
                        var dev = wave * env * AMP * H;
                        var x = (-0.03 + 1.06 * t) * W;
                        // Bass violet at the left through the spectrum to treble
                        // cyan at the right — the sweep reads as pitch.
                        var col = hsv(300 - 130 * t, 0.90, 1.0);
                        // Mirrored about the axis, the way a scope draws it.
                        [1, -1].forEach(function (s) {
                            window.applyMultiSplatWith(
                                x, axis + dev * s,
                                // A little along-axis drift so the trace flows,
                                // but the throw is mostly perpendicular.
                                120, s * THROW * env * (wave >= 0 ? 1 : -1),
                                col, 1, 0.0042 * (0.7 + 0.6 * env), true
                            );
                        });
                        if (i % 3 === 0) return raf(1);
                    });
                })(i);
            }
            return chain;
        }).then(function () {
            // Beat blooms on the envelope peaks: t = 1/16, 5/16, 9/16, 13/16.
            var axis = H * 0.5;
            var chain = Promise.resolve();
            [0.0625, 0.3125, 0.5625, 0.8125].forEach(function (t, b) {
                chain = chain.then(function () {
                    var cx = (-0.03 + 1.06 * t) * W;
                    var rr = Math.min(W, H) * (0.052 - 0.006 * b);
                    var col = hsv(300 - 130 * t, 0.55, 1.0);
                    var sub = Promise.resolve();
                    for (var i = 0; i < 18; i++) {
                        (function (i) {
                            sub = sub.then(function () {
                                var a = (i / 18) * Math.PI * 2;
                                window.applyMultiSplatWith(
                                    cx + Math.cos(a) * rr, axis + Math.sin(a) * rr,
                                    Math.cos(a) * 330, Math.sin(a) * 330,
                                    col, 1, 0.0060, true
                                );
                                if (i % 5 === 0) return raf(1);
                            });
                        })(i);
                    }
                    return sub;
                });
            });
            return chain;
        }).then(function () { return raf(SETTLE); }).then(function () {
            unseed();
            var f = frame(OUT_W, OUT_H);
            cover(f.x, grab(), OUT_W, OUT_H);
            write(DIR, '02-swirl-to-your-music.png', f.c);
        });
    }

    // ── 03 STYLES — one canvas, eight presets, sliced together ─────────
    //
    // Cell k is preset k's version of THAT cell's region of one shared
    // composition, so the slices register and the grid reads as a single
    // canvas painted eight ways. Neighbours alternate warm/cool and
    // smooth/sharp so the contrast is legible at thumbnail size.
    var COLS = 4, ROWS = 2;
    var CELLS = [
        { preset: 'silky',     pal: [[0.13, 0.55, 1.00], [0.28, 0.78, 1.00]] },  // electric blue
        { preset: 'turbulent', pal: [[1.00, 0.42, 0.10], [1.00, 0.68, 0.18]] },  // orange
        { preset: 'ethereal',  pal: [[0.24, 0.98, 0.72], [0.60, 1.00, 0.90]] },  // mint
        { preset: 'thick',     pal: [[0.52, 0.30, 1.00], [0.74, 0.48, 1.00]] },  // violet
        { preset: 'marble',    pal: [[1.00, 0.78, 0.16], [1.00, 0.90, 0.48]] },  // gold
        { preset: 'electric',  pal: [[0.10, 0.86, 0.92], [0.42, 0.98, 1.00]] },  // teal
        { preset: 'chaotic',   pal: [[1.00, 0.16, 0.58], [1.00, 0.48, 0.76]] },  // magenta
        { preset: 'wispy',     pal: [[0.70, 0.98, 0.16], [0.88, 1.00, 0.44]] }   // lime
    ];

    function bez(p, t) {
        var u = 1 - t;
        return [
            u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]
        ];
    }
    function dabRadius(scale) {
        var r = (typeof config.SPLAT_RADIUS === 'number') ? config.SPLAT_RADIUS : 0.006;
        return Math.max(r, 0.0060) * (scale || 1);
    }
    function stroke(pts, pal, opts) {
        opts = opts || {};
        var steps = opts.steps || 44, speed = opts.speed || 420, scale = opts.scale || 1;
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

    // Every cell of the grid is a different region of this composition, so the
    // composition has to REACH every region — an earlier version put two
    // strokes through the middle and most tiles came back black. These five
    // lanes cross all eight cells and run off every edge.
    var LANES = [
        [[-0.05, 0.18], [0.30, 0.30], [0.68, 0.10], [1.05, 0.22]],
        [[ 1.05, 0.50], [0.68, 0.38], [0.32, 0.62], [-0.05, 0.48]],
        [[-0.05, 0.82], [0.30, 0.70], [0.68, 0.90], [1.05, 0.76]],
        [[ 0.16, -0.05], [0.28, 0.36], [0.20, 0.66], [0.34, 1.05]],
        [[ 0.84, 1.05], [0.74, 0.64], [0.82, 0.34], [0.68, -0.05]]
    ];

    function composition(pal) {
        seed(0x9E11);                 // identical path every pass: only the
        window.clearCanvas();         // PRESET differs between tiles
        var chain = raf(3);
        LANES.forEach(function (lane) {
            chain = chain.then(function () {
                return stroke(lane.map(function (q) { return [q[0] * W, q[1] * H]; }),
                              pal, { steps: 40, speed: 400 });
            });
        });
        return chain.then(function () { return raf(26); }).then(function () {
            unseed();
            return grab();
        });
    }

    function shotStyles() {
        var tiles = [];
        return setBox(1920, 1080).then(function () {
            W = canvas.width; H = canvas.height;
            var chain = Promise.resolve();
            CELLS.forEach(function (cell) {
                chain = chain.then(function () {
                    return useBuiltin(cell.preset);
                }).then(function () {
                    return composition(cell.pal);
                }).then(function (img) { tiles.push(img); });
            });
            return chain;
        }).then(function () {
            var f = frame(OUT_W, OUT_H);
            var tw = OUT_W / COLS, th = OUT_H / ROWS;
            for (var r = 0; r < ROWS; r++) {
                for (var c = 0; c < COLS; c++) {
                    var img = tiles[r * COLS + c] || tiles[0];
                    if (!img) continue;
                    // This cell's region, cut from preset k at the same place it
                    // sits in the finished frame, so the slices register.
                    f.x.drawImage(img,
                        (c / COLS) * img.width, (r / ROWS) * img.height,
                        img.width / COLS, img.height / ROWS,
                        c * tw, r * th, tw, th);
                }
            }
            write(DIR, '03-discover-new-styles.png', f.c);
        });
    }

    // ── Text previews ─────────────────────────────────────────────────
    var CAPTIONS = [
        ['02-swirl-to-your-music.png', 'Swirl to your music'],
        ['03-discover-new-styles.png', 'Mutate your swirl,\ndiscover new styles to share']
    ];

    function drawTracked(ctx, text, x, y, size, weight, trackEm) {
        ctx.font = weight + ' ' + size + 'px "Segoe UI", "Inter", sans-serif';
        var tr = size * trackEm;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.save();
        ctx.shadowColor = 'rgba(4, 8, 14, 0.9)';
        ctx.shadowBlur = size * 0.7;
        var p = x;
        for (var i = 0; i < text.length; i++) { ctx.fillText(text[i], p, y); p += ctx.measureText(text[i]).width + tr; }
        ctx.restore();
        var q = x;
        for (var k = 0; k < text.length; k++) { ctx.fillText(text[k], q, y); q += ctx.measureText(text[k]).width + tr; }
    }

    function makePreview(file, caption) {
        return loadImage(DIR + '/' + file).then(function (img) {
            var f = frame(OUT_W, OUT_H);
            f.x.drawImage(img, 0, 0, OUT_W, OUT_H);
            // Scrim from the bottom so the caption always has ground under it,
            // whatever the art underneath happens to be doing.
            var g = f.x.createLinearGradient(0, OUT_H, 0, OUT_H * 0.42);
            g.addColorStop(0, 'rgba(4, 8, 14, 0.88)');
            g.addColorStop(1, 'rgba(4, 8, 14, 0)');
            f.x.fillStyle = g;
            f.x.fillRect(0, 0, OUT_W, OUT_H);

            var lines = caption.toUpperCase().split('\n');
            var size = 52, lh = size * 1.5;
            var y0 = OUT_H - 88 - (lines.length - 1) * lh;
            f.x.fillStyle = 'rgba(255,255,255,0.97)';
            lines.forEach(function (ln, i) {
                drawTracked(f.x, ln, 96, y0 + i * lh, size, 200, 0.16);
            });
            write(PREVIEW, file.replace(/\.png$/, '-text.png'), f.c);
        });
    }

    // ── Run ───────────────────────────────────────────────────────────
    var ONLY = OPT.only || 'both';
    return setBox(1920, 1080).then(function () {
        if (window.capturePresetSnapshot) BASE = window.capturePresetSnapshot();
    }).then(function () {
        return ONLY === 'styles' ? null : shotMusic();
    }).then(function () {
        return ONLY === 'music' ? null : shotStyles();
    }).then(function () {
        if (BASE && window.applyPresetSnapshot) { try { window.applyPresetSnapshot(BASE); } catch (_) {} }
        stripCanvasContent();
        var chain = Promise.resolve();
        CAPTIONS.filter(function (c) {
            if (ONLY === 'music')  return c[0].indexOf('02-') === 0;
            if (ONLY === 'styles') return c[0].indexOf('03-') === 0;
            return true;
        }).forEach(function (c) {
            chain = chain.then(function () { return makePreview(c[0], c[1]); });
        });
        return chain;
    }).then(function () {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { written: written, quality: { dye: config.DYE_RESOLUTION, sim: config.SIM_RESOLUTION } };
    }).catch(function (e) {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        stripCanvasContent();
        return { error: String(e && e.stack || e), written: written };
    });
})()
