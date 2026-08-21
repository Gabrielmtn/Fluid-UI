// ═══════════════════════════════════════════════════════════════════
// scripts/bake-feature-shots.js — screenshots 01, 02, 04, 05, each with
// its own visual device, plus text-overlay previews of all five.
//
// PAGE code, same harness as the other bakers:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-feature-shots.js
//
// THE IDEA PER SHOT — a different device each time, because "paint some
// strokes and apply a preset" says the same thing five times over.
//
//   01 GROUP      Convergence rosette. Seven streams enter from evenly spaced
//                 points on the rim, each holding its own hue out at the edge,
//                 all reaching one shared centre where they become a communal
//                 wash. Identity at the edges, the thing you made together in
//                 the middle.
//
//   02 STRANGER   The opposite of crowded. Two streams only, hooking into each
//                 other in a near-mirror that breaks where they touch, with
//                 quiet space around them so the pair reads as TWO and not as
//                 many. A stranger is one person, not a crowd.
//
//   04 RECORD     Onion-skin long exposure. One stroke is sampled across its
//                 whole life and composited into a SINGLE frame, older states
//                 fainter, converging into the present. That is what a
//                 recording is — a path through time — and a grid of stills
//                 only ever showed four separate moments.
//
//   05 COLLIDERS  A lattice, not three discs. A field of small obstacles the
//                 paint threads through and weaves around: structure you
//                 place, paint that obeys it.
//
// Each shot also borrows a saved PRESET for its finish, so the surface
// treatment is one Gabriel authored rather than engine defaults.
//
// Then every one of the five gets a caption composited over it into
// steam/screenshots/preview/ — previews only. The clean numbered files stay
// text-free, because Valve's asset rules want gameplay in the screenshot slots.
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
    selectTop('visualResolution');
    selectTop('physicsResolution');
    if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
        window.QualityGovernor.setEnabled(false);
    }
    window.__exporting = true;
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

    // A preset snapshot is not just sliders: applying one restores whatever
    // LAYERS, MASKS and COLLIDERS were on the canvas when it was saved, and
    // switches collision back on. Measured on 'mandala': 2 layers (one
    // collision, one image) and 1 mask came along with it, uninvited, and
    // showed up in shots that were supposed to be about something else.
    // Turning collision off is not enough — the layer and the mask are still
    // there and the next thing to enable collision picks them straight back up.
    // So every preset apply is followed by a full strip, and only the shot that
    // WANTS an obstacle declares one afterwards, procedurally.

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

    function stripCanvasContent() {
        // deleteLayer(index) matches on the layer's OWN .index property, not on
        // its position in the array (05l-layers-transform.js:133 does
        // layers.find(l => l.index === index)). Passing array positions
        // silently left behind any layer whose id had drifted from its slot —
        // which is exactly what happened: a captured image layer survived every
        // pass. Snapshot the ids first, then delete by id.
        try {
            if (Array.isArray(window.layers) && typeof window.deleteLayer === 'function') {
                var ids = window.layers.map(function (l) { return l.index; });
                ids.forEach(function (id) {
                    try { window.deleteLayer(id); } catch (_) {}
                });
            }
        } catch (_) {}
        // Masks
        try {
            if (window.Masks && window.Masks.list && window.Masks.remove) {
                (window.Masks.list() || []).slice().forEach(function (m) {
                    var id = (m && (m.id !== undefined ? m.id : m));
                    try { window.Masks.remove(id); } catch (_) {}
                });
            }
        } catch (_) {}
        // Raster paint layers
        try {
            if (window.rasterLayers && window.rasterLayers.clear) window.rasterLayers.clear();
        } catch (_) {}
        // Branding overlays bake their text into the canvas.
        try {
            if (window.brandingOverlays && window.brandingOverlays.clearAll) {
                window.brandingOverlays.clearAll();
            }
        } catch (_) {}
        clearObstacles();
    }

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

    // ── Presets: the finish for each shot is one Gabriel authored ──────
    var presets = {};
    try {
        if (window.PresetVault && window.PresetVault.available) {
            (window.PresetVault.list() || []).forEach(function (p) {
                if (p && p.snapshot) presets[String(p.name).toLowerCase()] = p.snapshot;
            });
        }
    } catch (e) {}
    var applySnap = window.applyPresetSnapshotFull || window.applyPresetSnapshot;
    var BASE = null;

    function usePreset(name) {
        var snap = presets[String(name).toLowerCase()];
        if (snap) { try { applySnap(snap); } catch (e) {} }
        stripCanvasContent();
        forceMaxQuality();   // the preset just clobbered the resolution selects
        // The strip runs a delete per layer and a mask removal; give the
        // compositor frames to settle before anything is painted on top.
        return raf(20);
    }

    var W, H;

    // ── 01 GROUP — convergence rosette ────────────────────────────────
    function shotGroup() {
        var HANDS = [
            [[0.98, 0.30, 0.28], [1.00, 0.55, 0.40]],   // red
            [[1.00, 0.66, 0.14], [1.00, 0.84, 0.36]],   // amber
            [[0.72, 0.92, 0.24], [0.90, 0.98, 0.50]],   // lime
            [[0.16, 0.90, 0.62], [0.40, 0.98, 0.80]],   // green
            [[0.14, 0.68, 0.98], [0.30, 0.86, 1.00]],   // blue
            [[0.52, 0.34, 0.99], [0.74, 0.52, 1.00]],   // violet
            [[0.98, 0.26, 0.72], [1.00, 0.54, 0.86]]    // magenta
        ];
        return usePreset('spaghetti').then(function () {
            return setBox(1920, 1080);
        }).then(function () {
            W = canvas.width; H = canvas.height;
            seed(0x6120);
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            // Seven entrances evenly spaced around the rim, every one aimed at
            // the same middle. Each keeps its colour out where it enters and
            // gives it up where they meet.
            var cx = W * 0.5, cy = H * 0.5;
            var chain = Promise.resolve();
            HANDS.forEach(function (pal, i) {
                chain = chain.then(function () {
                    var a = (i / HANDS.length) * Math.PI * 2 - Math.PI / 2;
                    // Enter from outside the frame, curve in, arrive at centre.
                    var rimX = cx + Math.cos(a) * W * 0.62;
                    var rimY = cy + Math.sin(a) * H * 0.72;
                    var midX = cx + Math.cos(a + 0.55) * W * 0.26;
                    var midY = cy + Math.sin(a + 0.55) * H * 0.26;
                    return stroke([[rimX, rimY],
                                   [cx + Math.cos(a) * W * 0.34, cy + Math.sin(a) * H * 0.40],
                                   [midX, midY],
                                   [cx, cy]],
                                  pal, { steps: 40, speed: 430 });
                });
            });
            return chain;
        }).then(function () { return raf(40); }).then(function () {
            unseed();
            var f = frame(OUT_W, OUT_H);
            cover(f.x, grab(), OUT_W, OUT_H);
            write(DIR, '01-swirl-in-a-group.png', f.c);
        });
    }

    // ── 02 AUDIO REACT — a spectrum made of dye ───────────────────────
    // The audio engine drives splats from frequency bands, so the honest
    // picture of the feature is the thing it actually paints: a row of bands
    // rising off a baseline, tall at the bass end, thinning toward the treble,
    // with hue sweeping across the spectrum and a couple of beat hits blooming
    // out of the low end. This has to be visually unlike shot 04 — both
    // captions say "record" — so 04 keeps time-as-motion and this one takes
    // rhythm-as-structure. Vertical, measured, periodic against 04's single
    // swept gesture.
    //
    // NOTE: the band amplitudes are a synthesised spectrum, not a capture from
    // a real track — driving the live analyser needs audio in, which a headless
    // bake has no way to provide. The MECHANISM is the real one (band-indexed
    // splats through applyMultiSplatWith); only the numbers are stand-ins.
    function hsv(h, sv, vv) {
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

    function shotAudio() {
        // Spectrum BARS were the first idea and they do not survive contact
        // with the medium: 22 thin verticals in a row get advected into each
        // other within a dozen frames and the whole thing flattens to a wash.
        // Fighting that would mean turning the fluid down until it stopped
        // looking like the game.
        //
        // Rings are the better metaphor anyway — sound propagates, and the
        // solver renders concentric structure beautifully (the failed attempt
        // accidentally produced gorgeous ripples). So: successive pulses
        // expanding from one origin, hue sweeping bass to treble across them,
        // the way a beat and its harmonics move outward through a room.
        var ORIGIN = [0.30, 0.58];
        var PULSES = 7;
        var BAND_R = 0.0030;
        return usePreset('mandala').then(function () {
            return setBox(1920, 1080);
        }).then(function () {
            W = canvas.width; H = canvas.height;
            seed(0x40D1);
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            var cx = ORIGIN[0] * W, cy = ORIGIN[1] * H, R = Math.min(W, H);
            var chain = Promise.resolve();
            for (var k = 0; k < PULSES; k++) {
                (function (k) {
                    chain = chain.then(function () {
                        var t = k / (PULSES - 1);
                        var rr = R * (0.07 + 0.44 * t);
                        // Later pulses are wider and quieter, like a beat
                        // losing energy as it travels.
                        var amp = 1 - 0.45 * t;
                        var col = hsv(312 - 138 * t, 0.86, 1.0);
                        var n = Math.round(26 + 34 * t);
                        var sub = Promise.resolve();
                        for (var i = 0; i < n; i++) {
                            (function (i) {
                                sub = sub.then(function () {
                                    var a = (i / n) * Math.PI * 2;
                                    window.applyMultiSplatWith(
                                        cx + Math.cos(a) * rr,
                                        cy + Math.sin(a) * rr,
                                        Math.cos(a) * 300 * amp, Math.sin(a) * 300 * amp,
                                        col, 1, BAND_R * (0.8 + 0.5 * amp), true
                                    );
                                    if (i % 5 === 0) return raf(1);
                                });
                            })(i);
                        }
                        return sub;
                    });
                })(k);
            }
            return chain;
        }).then(function () {
            // One bright hit at the origin — the source the pulses came from.
            var chain = Promise.resolve();
            for (var i = 0; i < 14; i++) {
                (function (i) {
                    chain = chain.then(function () {
                        var a = (i / 14) * Math.PI * 2;
                        var rr = Math.min(W, H) * 0.035;
                        window.applyMultiSplatWith(
                            ORIGIN[0] * W + Math.cos(a) * rr,
                            ORIGIN[1] * H + Math.sin(a) * rr,
                            Math.cos(a) * 220, Math.sin(a) * 220,
                            hsv(320, 0.55, 1.0), 1, BAND_R * 1.6, true
                        );
                        if (i % 4 === 0) return raf(1);
                    });
                })(i);
            }
            return chain;
        }).then(function () { return raf(26); }).then(function () {
            unseed();
            var f = frame(OUT_W, OUT_H);
            cover(f.x, grab(), OUT_W, OUT_H);
            write(DIR, '02-swirl-to-your-music.png', f.c);
        });
    }

    // ── 04 RECORD — one gesture, five stages, marching ─────────────────
    // Two devices failed here before this one, and both failed the same way.
    // Sampling a settling swirl produced ghosts that sat on top of each other,
    // because once dye is laid down it barely moves. Rotating repeated passes
    // around a pivot overlapped them near the centre, and every preset soft
    // enough to look good is soft enough to blend the overlap into one ribbon.
    //
    // So: stop overlapping them. The same compact gesture is painted five
    // times at five positions across the frame, each one allowed to develop
    // longer than the last, and the captures are added together. Nothing
    // overlaps, so nothing merges — you get one mark at five ages, reading
    // left to right, which is a recording laid out flat. Older ones sit
    // slightly dimmer so the direction of time is unambiguous.
    function shotRecord() {
        var PAL = [[1.00, 0.62, 0.16], [1.00, 0.84, 0.36], [0.98, 0.34, 0.20]];
        var STAGES = 5;
        var SETTLE = [3, 11, 21, 33, 46];   // each stage older than the last
        var shots5 = [];
        return usePreset('Pretty Light Shift').then(function () {
            return setBox(1920, 1080);
        }).then(function () {
            W = canvas.width; H = canvas.height;
            var chain = Promise.resolve();
            for (var k = 0; k < STAGES; k++) {
                (function (k) {
                    chain = chain.then(function () {
                        seed(0x4EC0 + k);
                        window.clearCanvas();
                        return raf(3);
                    }).then(function () {
                        // A compact curl, placed so the five never touch.
                        var cx = (0.12 + 0.19 * k) * W;
                        var cy = (0.46 + 0.06 * Math.sin(k * 1.3)) * H;
                        var rr = Math.min(W, H) * 0.085;
                        var sub = Promise.resolve();
                        for (var i = 0; i < 22; i++) {
                            (function (i) {
                                sub = sub.then(function () {
                                    var a = (i / 22) * Math.PI * 2 * 1.25;
                                    var g = 1 - 0.45 * (i / 22);
                                    window.applyMultiSplatWith(
                                        cx + Math.cos(a) * rr * g,
                                        cy + Math.sin(a) * rr * g,
                                        -Math.sin(a) * 320, Math.cos(a) * 320,
                                        PAL[i % PAL.length], 1, dabRadius(0.55), true
                                    );
                                    if (i % 3 === 0) return raf(1);
                                });
                            })(i);
                        }
                        return sub;
                    }).then(function () {
                        return raf(SETTLE[k]);
                    }).then(function () {
                        shots5.push(grab());
                    });
                })(k);
            }
            return chain;
        }).then(function () {
            unseed();
            var f = frame(OUT_W, OUT_H);
            // Additive: each capture is one mark on black, and they occupy
            // different ground, so adding them composites cleanly with no
            // muddying. The ramp makes the left end read as older.
            f.x.globalCompositeOperation = 'lighter';
            for (var k = 0; k < shots5.length; k++) {
                f.x.globalAlpha = 0.52 + 0.48 * (k / (shots5.length - 1));
                cover(f.x, shots5[k], OUT_W, OUT_H);
            }
            f.x.globalCompositeOperation = 'source-over';
            f.x.globalAlpha = 1;
            write(DIR, '04-record-and-play-back.png', f.c);
        });
    }

    // ── 05 COLLIDERS — a lattice the paint threads through ─────────────
    function shotCollide() {
        var PAL = [[0.16, 0.72, 1.00], [0.30, 0.92, 0.86], [0.62, 0.48, 1.00]];
        return usePreset('8x oil').then(function () {
            return setBox(1920, 1080);
        }).then(function () {
            W = canvas.width; H = canvas.height;
            // Obstacles are DECLARED, not painted and traced: setProcedural
            // hands the collider compositor a draw function and ALPHA is the
            // wall strength (23-depth-collision.js:1439).
            //
            // Solid discs were the first idea and they are the wrong shape for
            // this — paint can only go AROUND them, so the picture is a set of
            // holes with flow squeezing between. Concentric rings broken into
            // arcs give the fluid somewhere to go THROUGH: each ring is offset
            // from the one inside it, so a stream entering the outer gap has to
            // spiral to find the next opening. That is the feature actually
            // doing something rather than just blocking.
            //
            // Each arc is stroked three times, widest and faintest first. Alpha
            // is wall strength, so that feathers the edge into a soft wall
            // instead of a hard step, which is what "smooth" buys here.
            if (window.collisionLayers && window.collisionLayers.setProcedural) {
                window.collisionLayers.setProcedural(function (ctx, w, h) {
                    var cx = w / 2, cy = h / 2, R = Math.min(w, h);
                    ctx.lineCap = 'round';
                    var RINGS = 5;
                    for (var r = 0; r < RINGS; r++) {
                        var rad  = R * (0.115 + 0.079 * r);
                        var segs = 5 + r;                  // more openings further out
                        var gap  = 0.34;                   // share of each segment left open
                        var base = R * 0.020;
                        var spin = r * 0.42;               // stagger, so no gap lines up
                        for (var pass = 0; pass < 3; pass++) {
                            // widest + faintest first, narrowest + solid last
                            ctx.lineWidth   = base * (1.9 - 0.45 * pass);
                            ctx.strokeStyle = 'rgba(255,255,255,' + [0.30, 0.55, 1.0][pass] + ')';
                            for (var sgi = 0; sgi < segs; sgi++) {
                                var a0 = (sgi / segs) * Math.PI * 2 + spin;
                                var a1 = a0 + (Math.PI * 2 / segs) * (1 - gap);
                                ctx.beginPath();
                                ctx.arc(cx, cy, rad, a0, a1);
                                ctx.stroke();
                            }
                        }
                    }
                });
            }
            seed(0xC011);
            window.clearCanvas();
            return raf(16);
        }).then(function () {
            // Aimed inward and given a tangential swing, so the streams wind
            // through the openings and spiral between rings instead of running
            // flat past them.
            var chain = Promise.resolve();
            var cx = 0.5, cy = 0.5;
            for (var i = 0; i < 5; i++) {
                (function (i) {
                    chain = chain.then(function () {
                        var a = (i / 5) * Math.PI * 2 + 0.35;
                        var start = [cx + Math.cos(a) * 0.72, cy + Math.sin(a) * 0.86];
                        var mid1  = [cx + Math.cos(a + 0.5) * 0.44, cy + Math.sin(a + 0.5) * 0.50];
                        var mid2  = [cx + Math.cos(a + 1.1) * 0.22, cy + Math.sin(a + 1.1) * 0.26];
                        return stroke([[start[0]*W, start[1]*H],
                                       [mid1[0]*W,  mid1[1]*H],
                                       [mid2[0]*W,  mid2[1]*H],
                                       [cx*W, cy*H]],
                                      [PAL[i % PAL.length], PAL[(i + 1) % PAL.length]],
                                      { steps: 52, speed: 500 });
                    });
                })(i);
            }
            return chain;
        }).then(function () { return raf(42); }).then(function () {
            unseed();
            var f = frame(OUT_W, OUT_H);
            cover(f.x, grab(), OUT_W, OUT_H);
            write(DIR, '05-swirl-around-colliders.png', f.c);
            clearObstacles();
        });
    }

    // ── Text previews ─────────────────────────────────────────────────
    var CAPTIONS = [
        ['01-swirl-in-a-group.png',        'Swirl with others'],
        ['02-swirl-to-your-music.png',     'Swirl to your music'],
        ['03-discover-new-styles.png',     'Mutate your swirl,\ndiscover new styles to share'],
        ['04-record-and-play-back.png',    'Record swirls,\nplayback and export'],
        ['05-swirl-around-colliders.png',  'Swirl around layers and colliders,\nusing custom brushes']
    ];

    function face(ctx, size, weight) {
        ctx.font = weight + ' ' + size + 'px "Segoe UI", "Inter", sans-serif';
    }
    function drawTracked(ctx, text, x, y, size, weight, trackEm) {
        face(ctx, size, weight);
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
    return setBox(1920, 1080).then(function () {
        if (window.capturePresetSnapshot) BASE = window.capturePresetSnapshot();
    }).then(shotGroup)
      .then(shotAudio)
      .then(shotRecord)
      .then(shotCollide)
      .then(function () {
        if (BASE && window.applyPresetSnapshot) window.applyPresetSnapshot(BASE);
        clearObstacles();
        var chain = Promise.resolve();
        CAPTIONS.forEach(function (c) {
            chain = chain.then(function () { return makePreview(c[0], c[1]); });
        });
        return chain;
      }).then(function () {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { written: written, presetsFound: Object.keys(presets).length,
                 quality: { dye: config.DYE_RESOLUTION, sim: config.SIM_RESOLUTION } };
      }).catch(function (e) {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        clearObstacles();
        return { error: String(e && e.stack || e), written: written };
      });
})()
