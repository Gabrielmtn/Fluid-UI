// ═══════════════════════════════════════════════════════════════════
// scripts/bake-about-shots.js — the seven inline images for the store
// page's About This Game section, baked FROM THE REAL SIM.
//
// PAGE code, same harness as the other bakers, but __shot must be
// installed first (it provides fill/collapseAll/maxQuality/rest):
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/shot-helpers.js
//   node tmp-cdp-driver.js @scripts/bake-about-shots.js
//
// BAKE FROM A FRESH BOOT. BASE is captured from live app state, and the
// material layer's fluid-restore stash drifts a little through every
// snapshot round-trip — a second bake in the same session inherits the
// first bake's residue (measured: round 3 started from clay physics that
// round 2's material bands had leaked). Relaunch the app between runs.
//
// Writes steam/about/images/about-0N-*.png at 1232×693 — 2× the store
// page's ~616px description column, which caps wider images at 100% and
// never scales up. Staged and captured at 1920×1080, downscaled on
// write. See steam/about/SHOT-PLAN.md for the brief per shot.
//
// REBUILT after the first bake failed four of seven shots. The audit of
// bake-screenshots.js / bake-feature-shots.js (2026-08-21) found every
// failure was a lesson those bakers had already learned:
//
//   • NEVER paint staged shots through synthesized pointer drags — a
//     drag inherits the app's live colour state (#randomColor ships
//     checked; every pointerup advances to a new random colour) and the
//     live #brushSize (default 11 → SPLAT_RADIUS 0.011, flood range).
//     All paint goes through applyMultiSplatWith with explicit palettes
//     and explicit radii near 0.003 (coverage goes as radius²).
//   • mutationEngine.mutate() is PURE and takes (base, opts) — the
//     zero-arg call returns null and changes nothing, which is why all
//     four "mutation" cells came back identical. And the proven baker
//     ABANDONED mutations for its grid anyway: "a mutation is a dice
//     roll, not a design." Styles cells use the authored built-in
//     presets, contrast-ordered.
//   • Slice devices cut cell k's OWN region from capture k (9-arg
//     drawImage source rect). cover() centre-crops the source no matter
//     the destination — it cut the same middle strip for every cell.
//   • 'lighter' over co-located captures sums and clips (six stacked
//     alphas ≈ 3.1× → yellow smear). The onion skin only composites
//     cleanly when the stages occupy DIFFERENT ground.
//   • applyPresetSnapshot ends by applying the snapshot's material, so
//     MaterialModes.setMode must run AFTER the snapshot, never before.
//   • Math.random is pinned per shot (xorshift, restored after) and
//     Light Shift is disabled for the whole bake — hue walks over a
//     bake's length otherwise. Measured while baking the capsules.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DIR = 'steam/about/images';
    var OUT_W = 1232, OUT_H = 693;      // written size
    var CAP_W = 1920, CAP_H = 1080;     // staged canvas size (fits the ~2182×1278 maximized area)

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');

    if (!window.__shot) {
        return Promise.resolve({ error: 'run @scripts/shot-helpers.js first' });
    }
    if (!canvas || !window.config || !window.applyMultiSplatWith) {
        return Promise.resolve({ error: 'app not ready' });
    }
    var S = window.__shot;

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }

    // ── Deterministic randomness ───────────────────────────────────────
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

    // ── Stage geometry ─────────────────────────────────────────────────
    // A 16:9 box so captures slice and scale with no crop surprises.
    function setBox(w, h) {
        var wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        return raf(12);
    }

    // ── Palettes ───────────────────────────────────────────────────────
    // Pairs of hues that stay distinct where they mix — the capsule
    // palettes. Two-hand shots take one palette per hand.
    var PAL = {
        cool: [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88]],
        warm: [[1.00, 0.42, 0.16], [1.00, 0.66, 0.18]],
        rose: [[0.98, 0.22, 0.55], [1.00, 0.45, 0.72]],
        mint: [[0.20, 0.92, 0.62], [0.45, 0.95, 0.80]],
        gold: [[1.00, 0.78, 0.22], [0.98, 0.55, 0.12]],
        violet: [[0.55, 0.35, 0.98], [0.72, 0.45, 1.00]]
    };

    // ── Paint ──────────────────────────────────────────────────────────
    function bez(p, t) {
        var u = 1 - t;
        return [
            u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]
        ];
    }

    // One stroke along a bezier, explicit palette, explicit radius.
    // Coverage goes as radius², so strokes live near 0.003 or the frame
    // floods and every colour averages into one wash.
    // opts: steps, speed, radius (null → the preset's own SPLAT_RADIUS),
    //       exact (default true), mult (default 1).
    function stroke(pts, pal, opts) {
        opts = opts || {};
        var steps = opts.steps || 44,
            speed = opts.speed || 400,
            mult = opts.mult || 1,
            exact = opts.exact !== false;
        var W = canvas.width, H = canvas.height;
        var chain = Promise.resolve();
        for (var i = 0; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var t = i / steps;
                    var a = bez(pts, t), b = bez(pts, Math.min(1, t + 0.02));
                    var dx = b[0] - a[0], dy = b[1] - a[1];
                    var len = Math.hypot(dx, dy) || 1;
                    var ease = 0.32 + 0.68 * (1 - t);
                    var r = (opts.radius == null)
                        ? config.SPLAT_RADIUS
                        : opts.radius * (0.8 + 0.3 * Math.sin(t * Math.PI));
                    window.applyMultiSplatWith(
                        a[0] * W, a[1] * H,
                        (dx / len) * speed * ease, (dy / len) * speed * ease,
                        pal[i % pal.length], mult, r, exact
                    );
                    if (i % 3 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    // ── Capture / output ───────────────────────────────────────────────
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
    // Full-frame: the staged canvas is 16:9 and the output is 16:9, so
    // this is a straight scale, not a crop.
    function full() {
        var f = frame();
        f.x.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, OUT_W, OUT_H);
        return f.c;
    }
    function write(name, c) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        return { name: name, kb: Math.round(buf.length / 1024) };
    }

    // ── Look management ────────────────────────────────────────────────
    var BASE = null;

    function resetLook() {
        // Snapshot first: it restores sliders/checkboxes/colors/material
        // and dispatches the resolution selects (FBO rebuild — settle
        // after). Anything that must differ from BASE is set after it.
        if (BASE && window.applyPresetSnapshot) window.applyPresetSnapshot(BASE);
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        // enabled=false alone does NOT clear the obstacle texture —
        // measured by the proven baker.
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
        // Explicit material reset, AFTER the snapshot (applyPresetSnapshot
        // ends by applying the snapshot's material, so before would be
        // reverted). Without this the material layer's fluid-restore stash
        // round-trips through each snapshot apply and the baseline DRIFTS:
        // round 3 baked from a BASE carrying clay physics (DD=1, VD=1.0009,
        // CURL=0) that shot 02's bands had leaked two rounds earlier.
        if (window.MaterialModes && window.MaterialModes.setMode) {
            window.MaterialModes.setMode('fluid');
        }
        window.clearCanvas();
        return raf(14);
    }

    // ── The shots ──────────────────────────────────────────────────────

    // 01 — two hands, meeting off-centre. Cool against warm, held apart
    // at the edges so the pair reads as TWO, mixing only in the middle.
    function shotTogether() {
        return resetLook().then(function () {
            seed(0x0AB1);
            return stroke([[-0.04, 0.86], [0.22, 0.70], [0.38, 0.58], [0.53, 0.50]],
                          PAL.cool, { radius: 0.0028, speed: 420 });
        }).then(function () {
            return stroke([[1.04, 0.12], [0.82, 0.24], [0.66, 0.38], [0.55, 0.48]],
                          PAL.warm, { radius: 0.0028, speed: 420 });
        }).then(function () {
            unseed();
            return raf(30);
        }).then(function () {
            return write('about-01-together.png', full());
        });
    }

    // 02 — one composition, three materials, three vertical bands. Same
    // seed, same strokes, same palette; the material is the ONLY
    // variable. Band k is cut from capture k's OWN x-region (9-arg
    // drawImage), and the strokes span the full width so every band has
    // content. setMode runs AFTER the snapshot reset — applyPresetSnapshot
    // ends by applying the snapshot's material and would revert it.
    function shotMaterials() {
        // Internal keys: acrylic = Paint-Wet, clay = Paint-Thick
        // (29-material-modes keeps old names for saved settings).
        var modes = ['fluid', 'acrylic', 'clay'];
        var caps = [];
        var chain = Promise.resolve();

        modes.forEach(function (mode, i) {
            chain = chain.then(function () {
                return resetLook();
            }).then(function () {
                if (window.MaterialModes && window.MaterialModes.setMode) {
                    window.MaterialModes.setMode(mode);
                }
                return raf(10);
            }).then(function () {
                seed(0x0AB2);
                // Two full-width sweeps so all three x-slices carry paint,
                // laid twice — one pass leaves the loose-fluid band too
                // faint to read at column width, and the double is applied
                // to every band equally so the comparison stays fair.
                var passes = Promise.resolve();
                for (var p = 0; p < 2; p++) {
                    passes = passes.then(function () {
                        return stroke([[-0.04, 0.74], [0.30, 0.56], [0.64, 0.52], [1.04, 0.30]],
                                      PAL.gold, { radius: 0.0030, speed: 420 });
                    }).then(function () {
                        return stroke([[-0.04, 0.36], [0.34, 0.42], [0.68, 0.60], [1.04, 0.66]],
                                      PAL.gold, { radius: 0.0026, speed: 380 });
                    });
                }
                return passes;
            }).then(function () {
                unseed();
                // Longer settle than the others: wet dries, thick piles.
                return raf(34);
            }).then(function () {
                caps.push(grab());
            });
        });

        return chain.then(function () {
            var f = frame();
            var bandW = OUT_W / modes.length;
            caps.forEach(function (img, k) {
                // Band k, cut from capture k at the same place it sits in
                // the finished frame, so the slices register.
                f.x.drawImage(img,
                    (k / modes.length) * img.width, 0,
                    img.width / modes.length, img.height,
                    k * bandW, 0, bandW, OUT_H);
            });
            // Hairline seams so the bands read as a deliberate comparison.
            f.x.globalAlpha = 0.35;
            f.x.fillStyle = '#000';
            for (var i = 1; i < modes.length; i++) f.x.fillRect(i * bandW - 1, 0, 2, OUT_H);
            f.x.globalAlpha = 1;
            return write('about-02-materials.png', f.c);
        });
    }

    // 03 — six-arm radial symmetry through the app's own transform:
    // applyMultiSplatWith's mult arg drives symmetryTransforms('radial', 6),
    // six pure rotations. exact colour keeps all arms on one palette.
    function shotMandala() {
        return resetLook().then(function () {
            var sym = document.getElementById('symmetryMode');
            if (sym) { sym.value = 'radial'; sym.dispatchEvent(new Event('change', { bubbles: true })); }
            return raf(6);
        }).then(function () {
            seed(0x0AB3);
            // Two gestures in one wedge, kept clear of the centre — six
            // rotations of a near-centre stroke overlap there and merge
            // into one swirl instead of a rosette (v2's failure mode).
            return stroke([[0.57, 0.42], [0.63, 0.33], [0.70, 0.26], [0.79, 0.17]],
                          PAL.violet, { radius: 0.0026, speed: 380, mult: 6 });
        }).then(function () {
            return stroke([[0.58, 0.47], [0.67, 0.45], [0.77, 0.43], [0.88, 0.43]],
                          PAL.mint, { radius: 0.0024, speed: 340, mult: 6 });
        }).then(function () {
            unseed();
            // Short settle: long advection is what folded the arms together.
            return raf(18);
        }).then(function () {
            return write('about-03-mandala.png', full());
        });
    }

    // 04 — one composition, four authored looks. The proven device from
    // bake-screenshots 03, copied whole: cell k = built-in preset k
    // (contrast-ordered), palette first / preset second (applyPreset owns
    // the flow parameters), identical seeded composition each pass, slice
    // k cut from capture k at its own position. Lanes pass radius:null
    // (each preset's own brush weight is part of its look) and
    // exact:false — colour then resolves through the app's palette state,
    // so applyPalette(k) gives each cell one coherent hue family with
    // natural in-cell variety. The lanes CROSS (three horizontal, two
    // vertical): the crossings are what give the cells vortex structure
    // instead of a flat wash — v2 used parallel lanes and every cell
    // flooded featureless.
    function shotStyles() {
        var ORDER = ['silky', 'chaotic', 'marble', 'electric'];
        var HANDS = [PAL.cool, PAL.rose, PAL.gold, PAL.mint];
        var caps = [];
        var chain = Promise.resolve();

        ORDER.forEach(function (name, k) {
            chain = chain.then(function () {
                return resetLook();
            }).then(function () {
                // No applyPalette: the app's four saved palettes are all
                // muted nature tones (two share the same #4A90A4 blue), so
                // per-cell palette applies came out one hue. Cell colour is
                // pinned per-cell below instead.
                if (window.applyPreset) window.applyPreset(name);
                return raf(12);
            }).then(function () {
                seed(0x0AB4);
                // Full-field lanes: every vertical slice must carry paint
                // ("two strokes through the middle and nine of twelve
                // tiles came back black" — the proven baker's first pass).
                var lanes = [
                    [[-0.05, 0.18], [0.30, 0.12], [0.66, 0.26], [1.05, 0.20]],
                    [[-0.05, 0.52], [0.36, 0.62], [0.70, 0.44], [1.05, 0.54]],
                    [[-0.05, 0.84], [0.30, 0.76], [0.64, 0.90], [1.05, 0.80]],
                    [[0.30, -0.06], [0.24, 0.34], [0.34, 0.68], [0.26, 1.06]],
                    [[0.76, 1.06], [0.82, 0.66], [0.72, 0.32], [0.80, -0.06]]
                ];
                var sub = Promise.resolve();
                lanes.forEach(function (lane) {
                    sub = sub.then(function () {
                        return stroke(lane, HANDS[k],
                                      { radius: null, speed: 420 });
                    });
                });
                return sub;
            }).then(function () {
                unseed();
                return raf(26);
            }).then(function () {
                caps.push(grab());
            });
        });

        return chain.then(function () {
            var f = frame();
            var cellW = OUT_W / ORDER.length;
            caps.forEach(function (img, k) {
                f.x.drawImage(img,
                    (k / ORDER.length) * img.width, 0,
                    img.width / ORDER.length, img.height,
                    k * cellW, 0, cellW, OUT_H);
            });
            return write('about-04-styles.png', f.c);
        });
    }

    // 05 — a lattice of small obstacles the paint threads between and
    // piles against. setProcedural takes a draw callback (alpha = wall
    // strength) and flips collision on itself.
    function shotCollide() {
        return resetLook().then(function () {
            if (!window.collisionLayers || !window.collisionLayers.setProcedural) return null;
            window.collisionLayers.setProcedural(function (ctx, w, h) {
                ctx.fillStyle = '#fff';
                var rad = 0.035 * Math.min(w, h);
                for (var r = 0; r < 3; r++) {
                    for (var col = 0; col < 5; col++) {
                        var cx = (0.18 + col * 0.16 + (r % 2 ? 0.08 : 0)) * w;
                        var cy = (0.28 + r * 0.22) * h;
                        ctx.beginPath();
                        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
            return raf(16);
        }).then(function () {
            seed(0x0AB5);
            return stroke([[-0.04, 0.30], [0.30, 0.34], [0.66, 0.28], [1.04, 0.36]],
                          PAL.cool, { radius: 0.0028, speed: 440 });
        }).then(function () {
            return stroke([[-0.04, 0.62], [0.30, 0.58], [0.66, 0.66], [1.04, 0.58]],
                          PAL.mint, { radius: 0.0028, speed: 440 });
        }).then(function () {
            unseed();
            return raf(40);
        }).then(function () {
            return write('about-05-collide.png', full());
        });
    }

    // 06 — rhythm as spacing: pulses stepping outward at even intervals,
    // brighter on the onset beats. STAGED rhythm (the harness has no
    // audio input); the splats and the solve are real. Prefer a re-bake
    // against a loaded track, or a GIF, if this shot ever feels thin.
    function shotMusic() {
        var BEATS = 14;
        var chain = resetLook().then(function () { seed(0x0AB6); });
        for (var i = 0; i < BEATS; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var t = i / (BEATS - 1);
                    var ang = t * Math.PI * 2.4;
                    var rad = 0.06 + t * 0.40;
                    var fx = 0.5 + Math.cos(ang) * rad;
                    var fy = 0.5 + Math.sin(ang) * rad * 0.62;
                    var onset = (i % 4 === 0);
                    // Doubled dab per pulse: singles baked too faint to
                    // read at column width.
                    var col = [0.45 + 0.55 * t, 0.60, 1.00 - 0.45 * t];
                    window.applyMultiSplatWith(
                        fx * canvas.width, fy * canvas.height,
                        Math.cos(ang) * 260, Math.sin(ang) * 260,
                        col, 1, onset ? 0.0046 : 0.0030, true
                    );
                    window.applyMultiSplatWith(
                        fx * canvas.width, fy * canvas.height,
                        Math.cos(ang) * 180, Math.sin(ang) * 180,
                        col, 1, onset ? 0.0036 : 0.0024, true
                    );
                    return raf(onset ? 5 : 3);
                });
            })(i);
        }
        return chain.then(function () {
            unseed();
            return raf(22);
        }).then(function () {
            return write('about-06-music.png', full());
        });
    }

    // 07 — onion-skin long exposure, the proven non-overlap device: the
    // SAME compact curl painted at five positions that never touch, each
    // freshly seeded on a cleared canvas and settled a different age,
    // then added ('lighter') with a 0.52→1.0 alpha ramp. Each capture is
    // one mark on black on its own ground, so adding them composites
    // cleanly — 'lighter' over co-located marks is what blew out v1.
    function shotRecord() {
        var STAGES = 5;
        var SETTLE = [3, 11, 21, 33, 46];
        var caps = [];
        var chain = resetLook();

        for (var k = 0; k < STAGES; k++) {
            (function (k) {
                chain = chain.then(function () {
                    seed(0x0AB7 + k);
                    window.clearCanvas();
                    return raf(3);
                }).then(function () {
                    var W = canvas.width, H = canvas.height;
                    var cx = (0.12 + 0.19 * k) * W;
                    var cy = (0.46 + 0.06 * Math.sin(k * 1.3)) * H;
                    var rr = Math.min(W, H) * 0.085;
                    var pal = PAL.gold;
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
                                    pal[i % pal.length], 1, 0.0033, true
                                );
                                if (i % 3 === 0) return raf(1);
                            });
                        })(i);
                    }
                    return sub;
                }).then(function () {
                    return raf(SETTLE[k]);
                }).then(function () {
                    caps.push(grab());
                });
            })(k);
        }

        return chain.then(function () {
            unseed();
            var f = frame();
            f.x.globalCompositeOperation = 'lighter';
            caps.forEach(function (img, k) {
                f.x.globalAlpha = 0.52 + 0.48 * (k / (caps.length - 1));
                f.x.drawImage(img, 0, 0, img.width, img.height, 0, 0, OUT_W, OUT_H);
            });
            f.x.globalCompositeOperation = 'source-over';
            f.x.globalAlpha = 1;
            return write('about-07-record.png', f.c);
        });
    }

    // ── Run ────────────────────────────────────────────────────────────
    var SHOTS = [
        shotTogether, shotMaterials, shotMandala,
        shotStyles, shotCollide, shotMusic, shotRecord
    ];

    var written = [];

    try {
        var win = require('@electron/remote').getCurrentWindow();
        if (win && !win.isMaximized()) win.maximize();
    } catch (e) {}

    // Stage pins, all restored in the final handler:
    window.__exporting = true;                 // no collider film / mask overlay
    window.kaleidoEnabled = false;
    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;
    // No GLOW pin: BASE re-applies the glow slider on every resetLook, so a
    // config-level pin only survives until the first shot — and the app's
    // own autoloaded look bakes right (round 2 proved it).

    function done(err) {
        unseed();
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        if (err) return { error: String(err && err.stack || err), written: written };
        return { dir: DIR, size: OUT_W + 'x' + OUT_H, written: written };
    }

    // Top quality FIRST, governor frozen AFTER — the governor ascends
    // post-boot, so disabling it early pins the sim at the boot default
    // and everything bakes soft. BASE is captured only after the stage
    // is fully pinned, so every resetLook restores the PINNED state and
    // not the autoloaded user settings.
    return S.collapseAll()
        .then(function () { return setBox(CAP_W, CAP_H); })
        .then(function () { return S.maxQuality(); })
        .then(function () { return raf(40); })
        .then(function () {
            // Colour Gate off BEFORE the BASE capture, so every resetLook
            // keeps it off: its density trigger snaps the densest settled
            // paint to the picker colour mid-shot — round 4's onion-skin
            // baked with one solid forest-green stage.
            var gate = document.getElementById('colorGate');
            if (gate && gate.checked) {
                gate.checked = false;
                gate.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (window.capturePresetSnapshot) BASE = window.capturePresetSnapshot();
            return SHOTS.reduce(function (chain, shot) {
                return chain.then(function () {
                    return shot().then(function (r) { written.push(r); });
                });
            }, Promise.resolve());
        })
        .then(function () { return resetLook(); })
        .then(function () { return done(null); }, function (err) { return done(err); });
})()
