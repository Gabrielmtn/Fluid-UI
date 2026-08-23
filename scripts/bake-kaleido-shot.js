// ═══════════════════════════════════════════════════════════════════
// scripts/bake-kaleido-shot.js — the kaleidoscope screenshot, baked FROM
// THE REAL KALEIDO DISPLAY at 1920×1080.
//
// PAGE code, same harness as the other bakers:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-kaleido-shot.js
//
// HOW THIS WORKS — the geometry is 34-mandala-mode.js's, verified there
// against the running shader rather than assumed:
//
//   kaleidoWedge() folds the TEXTURE-space angle of every screen point to
//       a_out = |mod(θ - kAngle, segAngle) - segAngle/2|
//   and samples the dye at the unchanged radius. So only dye lying in the
//   texture wedge [0, segAngle/2] is ever displayed, and it renders in place
//   (rather than crawling off the cursor) only when kAngle == segAngle/2.
//
//   Which means: paint ONE wedge, get N of them for free. Everything below
//   paints inside [0, half] and the display does the mirroring. An arc swept
//   across the wedge closes into a concentric ring; a radial stroke becomes N
//   spokes; a single blob becomes a ring of N petals. That is the whole
//   composition language here.
//
//   Texture space is the y-flip of screen space and is normalised PER AXIS,
//   so texture angle θ at texture radius r lands at screen
//       x = (0.5 + r·cos θ)·W,  y = (1 − (0.5 + r·sin θ))·H
//   and a constant-r ring draws as an ellipse — which is what lets the figure
//   fill a 16:9 frame instead of leaving pillarboxes of dead ground.
//
// VELOCITY is kept radial. Tangential throw would advect dye along θ and
// straight out of the source wedge, where the fold makes it invisible — the
// paint would simply vanish as it settled.
//
// Tunables, so a re-bake needs no edit:
//   window.__kaleidoOpts = { segments: 14, ground: '#c9c9c9', settle: 40 }
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

    var OPT = window.__kaleidoOpts || {};
    var SEGMENTS = OPT.segments || 14;
    var GROUND   = OPT.ground || '#c9c9c9';     // the reference shot is light-grounded
    var SETTLE   = OPT.settle !== undefined ? OPT.settle : 12;
    var OUTNAME  = OPT.out || '06-kaleidoscopes.png';
    var CAPTION  = OPT.caption || 'Explore kaleidoscopes and mandalas';

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
    // Resolution first, governor frozen after — the governor ascends post-boot,
    // so disabling it early pins the sim at the boot default and this bakes soft.
    function forceMaxQuality() {
        selectTop('visualResolution');
        selectTop('physicsResolution');
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
            window.QualityGovernor.setEnabled(false);
        }
    }

    function setRange(el, v) {
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function setCheck(el, v) {
        if (!el) return;
        if (el.checked === !!v) return;
        el.checked = !!v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function setSelect(el, v) {
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setBox(w, h) {
        var wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        return raf(12);
    }
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
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
    }

    function grab() {
        var c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
    }
    function frame(w, h, fill) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
        // The WebGL canvas is transparent where there is no dye, and the app's
        // own background is a CSS colour on #canvas-area that grab() cannot
        // see. So the ground is painted here instead.
        x.fillStyle = fill;
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

    window.__exporting = true;
    // Glow is bloom, and bloom is the enemy of concentric banding: the first
    // pass ran it at 0.55 and every ring bled into its neighbours until the
    // whole figure washed to pale pink. A kaleidoscope needs edges.
    config.GLOW = !!OPT.glow;
    config.GLOW_INTENSITY = OPT.glowIntensity || 0.22;
    // Light Shift walks hue over the length of a bake, which would leave each
    // ring a different colour from the one painted a second earlier.
    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;

    // ── Rig the kaleido display ───────────────────────────────────────
    // Driven through the real inputs, so their own listeners, labels and
    // persistence stay in sync — the globals alone would leave the UI lying.
    var half;   // half a segment: the wedge this paints into
    function rigKaleido() {
        // 05f bootstraps first-enable to 16 segments and an 8× multiplier,
        // both of which fight an explicit rig. Suppress it the way
        // 34-mandala-mode.js does.
        window._kaleidoBootstrapped = true;
        setCheck(document.getElementById('kaleidoToggle'), true);
        setSelect(document.getElementById('kaleidoMode'), 1);        // Wedge
        setRange(document.getElementById('kaleidoSegments'), SEGMENTS);
        setRange(document.getElementById('kTwist'), 0);              // identity needs no twist
        setRange(document.getElementById('kZoom'), 1);               // ...and zoom exactly 1
        setRange(document.getElementById('kBlend'), 1);
        setCheck(document.getElementById('kAnimateRot'), false);     // a still holds still
        setRange(document.getElementById('multiplier'), 1);          // one brush; mirroring
                                                                     // is the display's job
        // Identity only holds when kAngle == segAngle/2 (= 180/n degrees).
        // At kAngle 0 the wedge renders its own mirror instead.
        setRange(document.getElementById('kAngle'), 180 / SEGMENTS);
        window.kaleidoEnabled = true;
        half = Math.PI / SEGMENTS;
        return raf(6);
    }

    var W, H;
    // Texture angle θ, texture radius r → screen pixels.
    function at(th, r) {
        return [(0.5 + r * Math.cos(th)) * W, (1 - (0.5 + r * Math.sin(th))) * H];
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

    // THE DAB SIZE LAW. The splat shader (05b-shader-sim.js:995) is
    //     g = exp(-dot(p, p) / radius)
    // so `radius` is a squared length: a dab's visible extent is sqrt(radius),
    // NOT radius. Two passes were baked before this was measured, both using
    // 0.006–0.024 the way the other shots do — which is sqrt 0.08–0.15, dabs a
    // sixth of the canvas across. That is why the rings came back as one
    // bullseye. Everything below sizes in VISUAL units and squares on the way
    // in, so the numbers in the composition mean what they look like.
    function dabFor(visual) { return visual * visual; }

    // An arc swept across the wedge closes into a concentric ring.
    //
    // Step count is DERIVED, not chosen. Splats are additive, so dabs spaced
    // much closer than their own extent stack and drive the band to white.
    // Spacing at ~0.7 of the visible extent lays a continuous band that is
    // bright once.
    function ring(r, col, visual, push) {
        var rad = dabFor(visual);
        var arcLen = r * half;                       // texture units across the wedge
        var steps = Math.max(6, Math.ceil(arcLen / (visual * 0.7)));
        var chain = Promise.resolve();
        for (var i = 0; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var th = (i / steps) * half;
                    var p = at(th, r);
                    // Radial only, and barely any: tangential throw would advect
                    // dye out of the source wedge where the fold hides it, and
                    // strong radial throw pulls every band into a ray — the
                    // first pass turned all eight rings into one starburst.
                    window.applyMultiSplatWith(
                        p[0], p[1],
                        Math.cos(th) * push, -Math.sin(th) * push,
                        col, 1, rad, true
                    );
                    if (i % 4 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    // A radial stroke becomes N spokes.
    function spoke(th, r0, r1, col, visual) {
        var rad = dabFor(visual);
        var steps = Math.max(6, Math.ceil(Math.abs(r1 - r0) / (visual * 0.7)));
        var chain = Promise.resolve();
        for (var i = 0; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var r = r0 + (r1 - r0) * (i / steps);
                    var p = at(th, r);
                    window.applyMultiSplatWith(
                        p[0], p[1], 0, 0,
                        col, 1, rad, true
                    );
                    if (i % 4 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    // A single blob becomes a ring of N petals.
    function petal(th, r, col, visual) {
        var p = at(th, r);
        window.applyMultiSplatWith(p[0], p[1], 0, 0, col, 1, dabFor(visual), true);
        return raf(1);
    }

    // ── The wedge composition ─────────────────────────────────────────
    // Concentric bands, spaced so the ground shows between them — the gaps are
    // what make it read as a kaleidoscope rather than a tie-dye. Hue alternates
    // warm/cool band to band so neighbours separate at thumbnail size, and the
    // dab radius grows with radius because an outer band has more ground to
    // cover for the same visual weight.
    //
    // Painted OUTSIDE in: later paint settles on top, and the eye should land
    // on the core.
    // THE RADIUS CEILING. The source wedge lies along +x, so a band at texture
    // radius r sits at u = 0.5 + r·cos θ with θ ≤ half — which runs off the
    // texture past r ≈ 0.5/cos(half). An earlier pass put bands at 0.63–0.86;
    // they were painted off-canvas and simply never appeared. Nothing here goes
    // past 0.47, and the corners (which sit at r ≈ 0.707 and are therefore
    // unreachable by any band) are covered by the outer wash bleeding into them.
    //
    // Sizes are VISUAL extents — dabFor() squares them for the shader.
    // ...and r + visual must ALSO stay inside 0.5, not just r. The previous
    // pass put a wide pale wash at r=0.46 with extent 0.075, so its outer skirt
    // landed past u=1 and the sampler wrapped it to the far side of the
    // texture — which is what those repeated fragments in the corners were.
    // Nothing here exceeds 0.465 at its outer edge.
    //
    // The corners sit at r ≈ 0.707 and no band can reach them, so they are left
    // as ground on purpose: a dark vignette reads as deliberate framing, where
    // a pale wash stretched toward them read as a smeared mistake.
    var BANDS = [
        // r,    hue, sat, visual, push
        [0.420,  272, 0.85, 0.045,  0],   // outer field, saturated — pale here
        [0.400,   32, 0.85, 0.010,  6],   // washed the whole outer third out
        [0.360,  186, 0.80, 0.014,  0],
        [0.320,  318, 0.88, 0.010,  5],
        [0.280,   96, 0.82, 0.013,  0],
        [0.240,   14, 0.90, 0.009,  4],
        [0.200,  210, 0.85, 0.012,  0],
        [0.160,   50, 0.92, 0.009,  0],
        [0.120,  288, 0.82, 0.011,  0],
        [0.085,  160, 0.80, 0.008,  0]
    ];

    function paintWedge() {
        var mid = half * 0.5;
        var chain = Promise.resolve();

        // OPT.bands swaps the whole table out, and OPT.bandsOnly drops the
        // petals, spokes and core — together they make it cheap to bisect a
        // bad frame down to "is it the sim or is it the composition".
        (OPT.bands || BANDS).forEach(function (b) {
            chain = chain.then(function () {
                return ring(b[0], hsv(b[1], b[2], 1.0), b[3], b[4]);
            });
        });

        if (OPT.bandsOnly) return chain;

        // Petal bands: a blob at one angle becomes a ring of N petals, which is
        // the floral detail the bands alone cannot produce. Offset from the
        // wedge centre so they do not simply thicken the spokes.
        chain = chain.then(function () {
            var sub = Promise.resolve();
            [[0.380, 0.26, 340], [0.380, 0.74, 340],
             [0.300, 0.50, 132],
             [0.220, 0.30,  42], [0.220, 0.70,  42],
             [0.140, 0.50, 196]].forEach(function (p) {
                sub = sub.then(function () {
                    return petal(half * p[1], p[0], hsv(p[2], 0.88, 1.0), 0.020);
                });
            });
            return sub;
        });

        // Spokes: thin, and stopping short of the outer wash so they read as
        // radiating structure rather than as a starburst.
        chain = chain.then(function () { return spoke(mid, 0.09, 0.40, hsv(48, 0.92, 1.0), 0.007); });
        chain = chain.then(function () { return spoke(half * 0.16, 0.18, 0.35, hsv(196, 0.80, 1.0), 0.005); });
        chain = chain.then(function () { return spoke(half * 0.84, 0.18, 0.35, hsv(196, 0.80, 1.0), 0.005); });

        // Core last, so it sits on top of everything.
        chain = chain.then(function () { return ring(0.050, hsv(300, 0.75, 1.0), 0.010, 0); });
        chain = chain.then(function () { return petal(mid, 0.015, hsv(276, 0.35, 1.0), 0.016); });

        return chain;
    }

    // ── Caption ───────────────────────────────────────────────────────
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
            var f = frame(OUT_W, OUT_H, '#080c12');
            f.x.drawImage(img, 0, 0, OUT_W, OUT_H);
            // A light-grounded shot needs a stronger scrim than the dark ones:
            // darkening alone would leave white type sitting on mid-grey.
            var g = f.x.createLinearGradient(0, OUT_H, 0, OUT_H * 0.42);
            g.addColorStop(0, 'rgba(4, 8, 14, 0.92)');
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
        stripCanvasContent();
        // A painterly sim: pigment that stays where it is put, which is what
        // holds the concentric banding instead of blurring it into a wash.
        // 'thick' is the built-in with CURL 1 and VELOCITY_DISSIPATION 0.99 —
        // it has the least appetite for moving paint around.
        if (window.applyPreset) { try { window.applyPreset('thick'); } catch (_) {} }
        forceMaxQuality();       // a preset apply carries the resolution selects with it
        config.DENSITY_DISSIPATION = 1.0;   // bands hold their brightness
        // Curl is vorticity confinement: it is what turns a clean ring into a
        // frilled one. A little is character; 'thick' ships 1 and even that
        // showed at these radii, so it goes to zero here.
        config.CURL = OPT.curl !== undefined ? OPT.curl : 0;
        // VELOCITY_DISSIPATION is deliberately NOT touched. An earlier pass set
        // it to 0.90 to stop dabs travelling; every preset in the game sits
        // between 0.99 and 1.0008, and 0.90 put the solver somewhere it is
        // never asked to go — the frame came back flooded to white. The preset
        // owns this one.
        if (OPT.velocityDissipation) config.VELOCITY_DISSIPATION = OPT.velocityDissipation;
        return rigKaleido();
    }).then(function () {
        return setBox(1920, 1080);
    }).then(function () {
        W = canvas.width; H = canvas.height;
        seed(0xA71D);
        window.clearCanvas();
        return raf(3);
    }).then(paintWedge)
      .then(function () { return raf(SETTLE); })
      .then(function () {
        unseed();
        var f = frame(OUT_W, OUT_H, GROUND);
        cover(f.x, grab(), OUT_W, OUT_H);

        // CORNER WRAP. A screen corner sits at texture radius ~0.707, and the
        // fold samples it at u = 0.5 + 0.707·cos θ' ≈ 1.18 — outside the
        // texture, where the sampler wraps and returns pattern from the far
        // side. So each corner shows a real but disconnected shard of the
        // figure, floating in ground. That is the effect's own behaviour, not
        // a fault in this bake, and it cannot be painted away: the wrapped
        // coordinate always lands inside the artwork.
        //
        // An elliptical vignette matched to the frame settles them back into
        // the ground instead. Scaled rather than circular, so it tracks 16:9
        // and does not clip the figure's own long axis.
        if (OPT.vignette !== false) {
            var rgb = [1, 3, 5].map(function (i) { return parseInt(GROUND.substr(i, 2), 16); });
            var f0 = OPT.vignetteStart || 0.52, f1 = OPT.vignetteEnd || 0.86;
            f.x.save();
            f.x.translate(OUT_W / 2, OUT_H / 2);
            f.x.scale(OUT_W / OUT_H, 1);
            var vg = f.x.createRadialGradient(0, 0, OUT_H * f0, 0, 0, OUT_H * f1);
            vg.addColorStop(0, 'rgba(' + rgb.join(',') + ',0)');
            vg.addColorStop(1, 'rgba(' + rgb.join(',') + ',1)');
            f.x.fillStyle = vg;
            f.x.fillRect(-OUT_W, -OUT_H, OUT_W * 2, OUT_H * 2);
            f.x.restore();
        }

        write(DIR, OUTNAME, f.c);
        return makePreview(OUTNAME, CAPTION);
      }).then(function () {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { written: written, segments: SEGMENTS, ground: GROUND,
                 canvas: [W, H], quality: { dye: config.DYE_RESOLUTION, sim: config.SIM_RESOLUTION } };
      }).catch(function (e) {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { error: String(e && e.stack || e), written: written };
      });
})()
