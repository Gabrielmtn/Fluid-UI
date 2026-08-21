// ═══════════════════════════════════════════════════════════════════
// scripts/bake-feature-photos.js — additional About-section feature
// photographs, baked on the TEST HARNESS rather than the __shot kit.
//
// PAGE code. Install order matters:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/test/harness.js
//   node tmp-cdp-driver.js @scripts/test/stage.js
//   node tmp-cdp-driver.js @scripts/bake-feature-photos.js
//
// WHY THE HARNESS AND NOT scripts/shot-helpers.js
//   The first About bake lost a whole round to state drift: run 3 baked
//   from thick-paint physics that run 2's materials shot had leaked, and
//   nothing in the baker could see it. __stage() pins the app to
//   registry defaults plus every unregistered straggler that was
//   MEASURED drifting (STAMP_SHAPE, splat ramps, arm colours, decay-debt
//   accumulators, fps cap, sub-stepping). And the frozen virtual clock
//   means "settle 30 frames" is 30 frames, not "however many landed
//   while the GPU was busy". Same recipe, same picture, every time.
//
// Photography stage: dye 2048 / sim 512 in a 1920×1080 box, written at
// 1232×693 (2× the store's ~616px description column).
//
// Shots here are the About copy's UNILLUSTRATED claims:
//   08 brushes   Soft · Blob · Chisel · Streak · Ring
//   09 symmetry  mirrors, quads, rakes beyond the radial mandala
//   10 lightshift the colour path walking over dense paint
//   11 shading   relief + gloss, the same paint with the look off and on
//   12 imported  a procedurally-drawn picture imported, then turned into
//                terrain the paint breaks against (no third-party photo)
//   13 wetness   wet vs dry, the deterministic A/B the rig exists for
//   14 kaleido   the display-space kaleidoscope (distinct from shot 09)
//   15 stamp     a stamp drawn in-page and painted with
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

    // ── Palettes ───────────────────────────────────────────────────────
    // Comparison shots use ONE palette across every band: the feature is
    // the only variable, or the eye reads colour instead.
    var GOLD = [[1.00, 0.78, 0.22], [0.98, 0.55, 0.12]];
    var COOL = [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88]];
    var ROSE = [[0.98, 0.22, 0.55], [1.00, 0.45, 0.72]];

    // ── Output ─────────────────────────────────────────────────────────
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
    // Straight scale: the staged box is 16:9 and the output is 16:9.
    function whole(img) {
        var f = outFrame();
        f.x.drawImage(img, 0, 0, img.width, img.height, 0, 0, OUT_W, OUT_H);
        return f.c;
    }
    // Band k from capture k's OWN region — never a centre crop.
    function bands(caps, seams) {
        var f = outFrame();
        var w = OUT_W / caps.length;
        caps.forEach(function (img, k) {
            f.x.drawImage(img,
                (k / caps.length) * img.width, 0,
                img.width / caps.length, img.height,
                k * w, 0, w, OUT_H);
        });
        if (seams !== false) {
            f.x.globalAlpha = 0.35;
            f.x.fillStyle = '#000';
            for (var i = 1; i < caps.length; i++) f.x.fillRect(i * w - 1, 0, 2, OUT_H);
            f.x.globalAlpha = 1;
        }
        return f.c;
    }
    // 2×2 contact sheet: each cell is a WHOLE capture scaled down, not a
    // quadrant of one. A symmetry figure is the composition — quadrant-
    // slicing cuts away the very structure the shot exists to show (the
    // first bake proved it: the rake cell came back empty because its
    // arms had translated out of the sliced quadrant).
    function contact(caps) {
        var f = outFrame();
        var w = OUT_W / 2, h = OUT_H / 2;
        caps.forEach(function (img, k) {
            var cx = k % 2, cy = (k / 2) | 0;
            f.x.drawImage(img, 0, 0, img.width, img.height,
                cx * w, cy * h, w, h);
        });
        f.x.globalAlpha = 0.35;
        f.x.fillStyle = '#000';
        f.x.fillRect(w - 1, 0, 2, OUT_H);
        f.x.fillRect(0, h - 1, OUT_W, 2);
        f.x.globalAlpha = 1;
        return f.c;
    }
    // Two captures, THE SAME source window from each, side by side.
    // bands() cuts band k from capture k's own k-th region, which is
    // right when the composition is continuous and the property differs
    // everywhere (materials, shading) — but wrong for an A/B where the
    // stroke evolves across the frame: it would compare A's beginning
    // against B's end and credit the feature for the difference.
    function pairSameWindow(a, b) {
        var f = outFrame();
        var halfW = OUT_W / 2;
        var aspect = halfW / OUT_H;
        var sw = a.height * aspect, sx = (a.width - sw) / 2;
        [a, b].forEach(function (img, k) {
            f.x.drawImage(img, sx, 0, sw, img.height, k * halfW, 0, halfW, OUT_H);
        });
        f.x.globalAlpha = 0.35;
        f.x.fillStyle = '#000';
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

    // ── Shot 08: brushes ───────────────────────────────────────────────
    // Proves: "Soft, Ring, Blob, Chisel, Streak."
    // config.BRUSH_TIP only reaches the splat shader when __brushTipOn is
    // set, and multiSplat sets that ONLY for non-exact-colour calls
    // (05g:259) — so these strokes run exact:false and hold their colour
    // through arm 0's fixed colour instead (pinned by __stage).
    // Short settle on purpose: advection is what destroys a stamp's
    // character, and the stamp IS the subject.
    var TIPS = [
        { v: 0, name: 'Soft' },
        { v: 1, name: 'Blob' },
        { v: 2, name: 'Chisel' },
        { v: 3, name: 'Streak' },
        { v: 4, name: 'Ring' }
    ];
    function shotBrushes() {
        var caps = [];
        var chain = Promise.resolve();
        TIPS.forEach(function (tip, k) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                config.BRUSH_TIP = tip.v;
                config.BRUSH_TIP_TEXTURE = 0.7;
                config.BRUSH_ANGLE = 25;      // chisel/streak are directional; inert on round tips
                // Non-exact strokes take their colour from arm 0, so the
                // one palette across all five bands is set here.
                if (window.multiArmColors) {
                    window.multiArmColors[0] = { mode: 'fixed', color: '#ffc24a', stepIndex: 0, cachedColor: null };
                }
                return T.step(2);
            }).then(function () {
                T.seed(0x0FEA);
                // A SPECIMEN per band: a short mark centred in the x-region
                // this band will be cut from, so each band shows one whole
                // brush rather than a slice of one long stroke crossing all
                // five (which is what the first bake produced — it read as a
                // single stroke changing texture, not as five brushes).
                var cx = (k + 0.5) / TIPS.length;
                T.stroke({
                    pts: [[cx - 0.055, 0.66], [cx - 0.02, 0.56], [cx + 0.02, 0.46], [cx + 0.055, 0.36]],
                    steps: 7, radius: 0.0070, speed: 90,
                    color: GOLD[0], exact: false
                });
                return T.step(10);
            }).then(function () {
                caps.push(grab());
            });
        });
        return chain.then(function () {
            config.BRUSH_TIP = 0;
            return write('about-08-brushes.png', bands(caps));
        });
    }

    // ── Shot 09: symmetry family ───────────────────────────────────────
    // Proves: "Mirrors, quads, rakes... each arm carrying its own colour."
    // The mandala photo already shows radial; this shows the rest.
    // Per-arm colour needs exact:false too (exactColor bypasses
    // resolveArmColor entirely, 05g:277).
    var SYMS = [
        { mode: 'mirrorX', arms: 2 },
        { mode: 'mirrorQuad', arms: 4 },
        { mode: 'rake', arms: 4 },
        { mode: 'radial', arms: 8 }
    ];
    var ARM_HUES = ['#4090c0', '#e0508c', '#f0b040', '#40c08c',
                    '#8c60e0', '#40c0c0', '#e07040', '#a0d040'];
    function shotSymmetry() {
        var caps = [];
        var chain = Promise.resolve();
        SYMS.forEach(function (sym) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                // Each arm its own colour — the claim under test.
                if (window.multiArmColors) {
                    for (var ai = 0; ai < 8; ai++) {
                        window.multiArmColors[ai] = {
                            mode: 'fixed', color: ARM_HUES[ai], stepIndex: 0, cachedColor: null
                        };
                    }
                }
                var s = document.getElementById('symmetryMode');
                if (s) { s.value = sym.mode; s.dispatchEvent(new Event('change', { bubbles: true })); }
                if (typeof window.setMultiplierHotkey === 'function') {
                    window.setMultiplierHotkey(sym.arms);
                } else {
                    var m = document.getElementById('multiplier');
                    if (m) { m.value = sym.arms; m.dispatchEvent(new Event('input', { bubbles: true })); }
                }
                return T.step(2);
            }).then(function () {
                T.seed(0x0FEB);
                // One off-centre gesture: symmetry does the composing.
                T.stroke({
                    pts: [[0.54, 0.50], [0.60, 0.40], [0.66, 0.34], [0.74, 0.26]],
                    steps: 34, radius: 0.0030, speed: 340, mult: sym.arms, exact: false
                });
                return T.step(22);
            }).then(function () {
                caps.push(grab());
            });
        });
        return chain.then(function () {
            return write('about-09-symmetry.png', contact(caps));
        });
    }

    // ── Shot 10: light shift ───────────────────────────────────────────
    // Proves: "Drawing a path through colours and letting the light shift
    // along it as the paint moves."
    // The display pass needs enabled AND colorPath.length > 0 (05j:1238),
    // and the trigger keys off dense/bright dye — so the composition has
    // to be genuinely dense before the effect has anything to grab.
    // A single-point path is STATIC (multi-point paths animate on the
    // module's own rAF); static is what a still photograph can honestly
    // show, so the path point is chosen for contrast against the dye.
    function shotLightShift() {
        return window.__stage(STAGE).then(function () {
            T.seed(0x0FEC);
            // Dense overlapping mass: three crossing strokes, then settle.
            T.stroke({ pts: [[0.06, 0.66], [0.34, 0.40], [0.62, 0.56], [0.94, 0.34]],
                       steps: 44, radius: 0.0034, speed: 420, color: COOL[0] });
            T.stroke({ pts: [[0.10, 0.30], [0.38, 0.52], [0.66, 0.34], [0.92, 0.62]],
                       steps: 44, radius: 0.0032, speed: 400, color: COOL[1] });
            T.stroke({ pts: [[0.24, 0.86], [0.44, 0.56], [0.60, 0.44], [0.78, 0.16]],
                       steps: 38, radius: 0.0030, speed: 380, color: ROSE[0] });
            return T.step(26);
        }).then(function () {
            if (!window.lightShift) return null;
            // setPath PERSISTS to settingsManager (14:535-543) unless
            // __mpApplyingRemote is set — and Gabriel has a real 58-point
            // authored path saved. Stash it, guard the writes, restore it.
            window.__lsPrev = { path: (window.lightShift.getPath() || []).slice(), enabled: window.lightShift.enabled, thr: window.lightShift.threshold, intensity: window.lightShift.intensity, mode: window.lightShift.mode };
            window.__mpApplyingRemote = true;
            window.lightShift.enabled = true;
            window.lightShift.setPath([
                { x: 90, y: 45, hue: 46, saturation: 92, lightness: 58 }
            ]);
            window.lightShift.mode = 'replace';
            window.lightShift.threshold = 0.55;   // default 0.85 leaves it inert on settled dye
            window.lightShift.intensity = 0.85;
            return T.step(6);
        }).then(function () {
            var img = write('about-10-lightshift.png', whole(grab()));
            // Restore the user's path, still guarded so the restore does
            // not persist either, then drop the guard.
            if (window.lightShift && window.__lsPrev) {
                var P = window.__lsPrev;
                window.lightShift.threshold = P.thr;
                window.lightShift.intensity = P.intensity;
                window.lightShift.mode = P.mode;
                window.lightShift.setPath(P.path);
                window.lightShift.enabled = P.enabled;
                delete window.__lsPrev;
            }
            window.__mpApplyingRemote = false;
            return img;
        });
    }

    // ── Shot 11: surface shading ───────────────────────────────────────
    // Proves: "Glow, surface relief and gloss."
    // A LOOK-ONLY feature: it never writes the dye, so the two halves can
    // come from ONE settled sim state — settle once, capture with the
    // look off, switch it on, capture again. Same paint, guaranteed; the
    // only variable is the look. (Materials bundle-apply the shading
    // toggles, so this shot stays in 'fluid'.)
    function shotShading() {
        var off = null;
        return window.__stage(STAGE).then(function () {
            T.seed(0x0FED);
            T.stroke({ pts: [[0.04, 0.60], [0.32, 0.34], [0.60, 0.56], [0.96, 0.30]],
                       steps: 46, radius: 0.0034, speed: 430, color: GOLD[0] });
            T.stroke({ pts: [[0.08, 0.28], [0.36, 0.50], [0.64, 0.32], [0.94, 0.58]],
                       steps: 44, radius: 0.0030, speed: 400, color: GOLD[1] });
            return T.step(30);
        }).then(function () {
            // GLOW stays OFF in BOTH halves. The first bake switched glow
            // on with the shading and the ON half blew to white — two
            // variables, and neither of them legible. Shading is the
            // subject; one variable.
            config.GLOW = false;
            T.setCheckbox('displayShadingToggle', false);
            return T.step(2);
        }).then(function () {
            off = grab();
            T.setCheckbox('displayShadingToggle', true);
            T.setSlider('shadingIntensity', 0.85);
            config.SHADE_RELIEF = 1.15;   // form, not blowout
            config.SHADE_GLOSS = 0.50;
            return T.step(3);
        }).then(function () {
            return write('about-11-shading.png', bands([off, grab()]));
        });
    }

    // Poll a predicate off the real clock. The virtual clock does not
    // drive image decodes or texture uploads, and step() yields to the
    // macrotask queue between frames, so a bounded setTimeout poll is
    // the honest way to wait for one.
    function waitFor(pred, label) {
        return new Promise(function (res, rej) {
            var tries = 0;
            (function poll() {
                if (pred()) return res(tries);
                if (++tries > 120) return rej(new Error('waitFor timed out: ' + label));
                setTimeout(poll, 50);
            })();
        });
    }

    // ── Shot 12: bringing things in ────────────────────────────────────
    // Proves: "Dropping in an image... turning a photo into terrain: the
    // paint breaks against it."
    // The source picture is drawn PROCEDURALLY in-page — a store page is
    // the wrong place to put a photograph whose ownership a reader might
    // reasonably wonder about — then imported through the real
    // createLayerFromDataUrl path and turned into a collider through the
    // real createFromLayerMask threshold path. No AI model, no download.
    //
    // Image layers are browser-composited DOM, invisible to a canvas
    // grab, so the capture composites the layer's own bitmap at the
    // layer element's measured rect and draws the fluid over it — which
    // is exactly the stack the player sees.
    function shotImported() {
        var srcCanvas = null, layerIdx = null, rect = null;
        return window.__stage(STAGE).then(function () {
            // A pale cut-out with holes: enough silhouette to read as an
            // object, enough interior for the paint to thread through.
            var c = document.createElement('canvas');
            c.width = 1024; c.height = 576;
            var x = c.getContext('2d');
            x.fillStyle = '#cfd6dd';
            x.beginPath();
            x.arc(512, 288, 210, 0, Math.PI * 2);
            [[512, 120, 46], [400, 380, 40], [630, 366, 52], [512, 288, 74]].forEach(function (h) {
                x.moveTo(h[0] + h[2], h[1]);
                x.arc(h[0], h[1], h[2], 0, Math.PI * 2, true);
            });
            x.fill('evenodd');
            srcCanvas = c;
            var url = c.toDataURL('image/png');
            return new Promise(function (res, rej) {
                var settled = false;
                window.createLayerFromDataUrl(url, 'Imported', function (layer) {
                    settled = true; layerIdx = layer && layer.index; res(layer);
                });
                setTimeout(function () { if (!settled) rej(new Error('layer create timed out')); }, 8000);
            });
        }).then(function () {
            // Threshold > 0 routes createFromLayerMask through its
            // luminance path: the pale shape becomes wall, the
            // transparent ground stays open.
            var L = window.layers.filter(function (l) { return l.index === layerIdx; })[0];
            if (L) L.threshold = 0.35;
            window.collisionLayers.createFromLayerMask(layerIdx);
            return waitFor(function () {
                return (window.layers || []).some(function (l) { return l.isCollision; });
            }, 'collider bake');
        }).then(function () {
            return T.step(6);
        }).then(function () {
            // Measure where the layer actually sits, in canvas fractions.
            var el = document.getElementById('layer' + layerIdx);
            var cr = canvas.getBoundingClientRect();
            if (el) {
                var r = el.getBoundingClientRect();
                rect = { x: (r.left - cr.left) / cr.width, y: (r.top - cr.top) / cr.height,
                         w: r.width / cr.width, h: r.height / cr.height };
            }
            T.seed(0x0FEE);
            T.stroke({ pts: [[-0.02, 0.34], [0.32, 0.30], [0.68, 0.38], [1.02, 0.32]],
                       steps: 44, radius: 0.0032, speed: 430, color: COOL[0] });
            T.stroke({ pts: [[-0.02, 0.70], [0.34, 0.74], [0.70, 0.64], [1.02, 0.70]],
                       steps: 44, radius: 0.0030, speed: 410, color: ROSE[0] });
            return T.step(46);
        }).then(function () {
            var f = outFrame();
            if (rect && srcCanvas) {
                f.x.globalAlpha = 0.85;
                f.x.drawImage(srcCanvas, rect.x * OUT_W, rect.y * OUT_H, rect.w * OUT_W, rect.h * OUT_H);
                f.x.globalAlpha = 1;
            }
            f.x.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, OUT_W, OUT_H);
            return write('about-12-imported.png', f.c);
        });
    }

    // ── Shot 13: wet and dry ───────────────────────────────────────────
    // Proves: "wet paint that dries."
    // The deterministic A/B the rig exists for: identical seed, identical
    // stroke, identical everything — WET_INFLUENCE is the only variable,
    // so the difference in how far the dye travels IS the feature.
    function shotWetness() {
        var caps = [];
        var chain = Promise.resolve();
        [0, 0.8].forEach(function (wet) {
            chain = chain.then(function () {
                return window.__stage(STAGE);
            }).then(function () {
                config.WET_INFLUENCE = wet;
                config.WET_DRYING = 3.0;
                return T.step(2);
            }).then(function () {
                T.seed(0x0FEF);
                T.stroke({ pts: [[0.06, 0.72], [0.36, 0.42], [0.64, 0.62], [0.96, 0.30]],
                           steps: 46, radius: 0.0032, speed: 430, color: COOL[1] });
                return T.step(54);   // long: mobility differences accumulate
            }).then(function () {
                caps.push(grab());
            });
        });
        return chain.then(function () {
            config.WET_INFLUENCE = 0;
            return write('about-13-wetness.png', pairSameWindow(caps[0], caps[1]));
        });
    }

    // ── Shot 14: kaleidoscope ──────────────────────────────────────────
    // Proves: the kaleidoscope named in the look controls — which is a
    // DISPLAY-space mirror and a different animal from the paint-space
    // arms in shot 09.
    // _kaleidoBootstrapped is pre-set: the first manual enable otherwise
    // forces the multiplier to 8 and segments to 16, which would quietly
    // add paint-space symmetry on top and confuse the two features.
    function shotKaleido() {
        return window.__stage(STAGE).then(function () {
            window._kaleidoBootstrapped = true;
            window.kaleidoEnabled = true;
            T.setSelect('kaleidoMode', '1');       // Wedge
            T.setSlider('kaleidoSegments', 10);
            return T.step(2);
        }).then(function () {
            T.seed(0x0FF0);
            T.stroke({ pts: [[0.52, 0.50], [0.64, 0.40], [0.74, 0.36], [0.88, 0.24]],
                       steps: 36, radius: 0.0032, speed: 380, color: ROSE[0] });
            T.stroke({ pts: [[0.54, 0.56], [0.66, 0.58], [0.78, 0.52], [0.92, 0.56]],
                       steps: 30, radius: 0.0028, speed: 340, color: [0.35, 0.85, 0.75] });
            return T.step(30);
        }).then(function () {
            var img = write('about-14-kaleido.png', whole(grab()));
            window.kaleidoEnabled = false;
            return img;
        });
    }

    // ── Shot 15: your own stamp ────────────────────────────────────────
    // Proves: "or draw your own stamp shape and paint with that."
    // The stamp is drawn in-page and imported through the real
    // BrushShapes path. Custom stamps ride the same __brushTipOn gate as
    // the built-in tips, so this stroke is exact:false too — and the
    // texture upload is asynchronous, with multiSplat DROPPING every dab
    // that lands while it is pending (05g:255), so the wait is mandatory
    // rather than polite.
    function shotStamp() {
        return window.__stage(STAGE).then(function () {
            var c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            var x = c.getContext('2d');
            x.fillStyle = '#ffffff';
            x.beginPath();
            for (var i = 0; i < 10; i++) {
                var a = -Math.PI / 2 + i * Math.PI / 5;
                var r = (i % 2) ? 26 : 60;
                x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
            }
            x.closePath();
            x.fill();
            window.BrushShapes.importList([
                { id: 'about-star', name: 'Star', dataURL: c.toDataURL('image/png') }
            ]);
            // setActive persists the id (33:141). Stash what the user had
            // so the teardown can put it back — a temp id left in settings
            // would resolve to nothing next boot and null their selection.
            try { window.__prevShapeId = window.settingsManager.get('brush.shapeId'); } catch (_) { window.__prevShapeId = null; }
            window.BrushShapes.setActive('about-star');
            return waitFor(function () { return !window.BrushShapes.stampPending(); }, 'stamp upload');
        }).then(function () {
            if (window.multiArmColors) {
                window.multiArmColors[0] = { mode: 'fixed', color: '#8fe0ff', stepIndex: 0, cachedColor: null };
            }
            T.seed(0x0FF1);
            // Well-spaced, slow: each dab has to stay a legible star.
            // Six dabs, not eleven: the first bake overlapped them into a
            // continuous chain and a stamp you cannot see the edges of is
            // not a stamp.
            T.stroke({ pts: [[0.16, 0.64], [0.40, 0.40], [0.64, 0.62], [0.86, 0.38]],
                       steps: 6, radius: 0.0080, speed: 60, exact: false });
            return T.step(8);
        }).then(function () {
            var img = write('about-15-stamp.png', whole(grab()));
            // Config-only clear (never setActive — it persists, 33:141) and
            // drop the temporary shape so the user's library is unchanged.
            // Restore the user's own selection FIRST (this persists the
            // correct id back), then drop the temporary shape.
            try { window.BrushShapes.setActive(window.__prevShapeId || null); } catch (_) {}
            try { if (window.BrushShapes.remove) window.BrushShapes.remove('about-star'); } catch (_) {}
            delete window.__prevShapeId;
            return img;
        });
    }

    // ── Run ────────────────────────────────────────────────────────────
    var SHOTS = [shotBrushes, shotSymmetry, shotLightShift, shotShading,
                 shotImported, shotWetness, shotKaleido, shotStamp];
    var written = [];

    try {
        var win = require('@electron/remote').getCurrentWindow();
        if (win && !win.isMaximized()) win.maximize();
    } catch (e) {}

    window.__exporting = true;   // no collider film / mask overlay in frame

    function done(err) {
        T.unseed();
        T.thaw();
        window.__exporting = false;
        // Hand the user's persisted settings back (stamp selection etc.).
        try { if (window.__stageRestore) window.__stageRestore(); } catch (_) {}
        if (err) return { error: String((err && err.stack) || err), written: written };
        return { dir: DIR, size: OUT_W + 'x' + OUT_H, written: written, pageErrors: T.errors(true) };
    }

    return T.freeze().then(function () {
        return SHOTS.reduce(function (chain, shot) {
            return chain.then(function () {
                return shot().then(function (r) { written.push(r); });
            });
        }, Promise.resolve());
    }).then(function () { return done(null); }, function (e) { return done(e); });
})()
