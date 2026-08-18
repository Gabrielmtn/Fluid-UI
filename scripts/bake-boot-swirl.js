// ═══════════════════════════════════════════════════════════════════
// scripts/bake-boot-swirl.js — bakes the boot cursor's frames FROM THE
// REAL SIM.
//
// This is PAGE code, not Node. It is injected into a running instance of
// the app and evaluated there, because the only way to get the actual
// solver's character into the cursor is to run the actual solver:
//
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-boot-swirl.js
//
// It writes assets/boot-swirl/NN.png — one 128px frame each — which
// js/00a-boot.js points the CSS cursor at during launch. electron-builder
// drops scripts/, so re-running this is a design-time act; nothing here
// ships. Re-run it whenever the look should change, then eyeball
// assets/boot-swirl/ and relaunch.
//
// WHAT IT DOES
//   1. Walls the sim into a circle by uploading an obstacle whose ALPHA is
//      opaque everywhere OUTSIDE a centred disc — updateObstacleTexture
//      (05c) reads alpha as wall strength. That circle is the snowglobe,
//      and the dye piling against it is a real no-slip boundary, not a
//      drawn outline.
//   2. Spins a vortex: dye splatted around a ring with tangential
//      velocity, plus two off-axis blobs so the result is never
//      rotationally symmetric (perfect symmetry is what made the earlier
//      hand-drawn pass read as a pinwheel).
//   3. Lets it settle, then grabs a frame every STRIDE animation frames.
//   4. Cross-dissolves the tail back over the head, because a real solver
//      NEVER repeats — a seamless loop has to be constructed. Captures
//      FRAMES+FADE, emits FRAMES.
//   5. Un-premultiplies against black: the canvas holds dye composited
//      over a black background, so alpha = luminance and colour = rgb/luma
//      recovers the dye itself. That is what lets the cursor sit on any
//      desktop instead of dragging a black disc around.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var OUT     = 128;   // cursor sprite size (Chromium rejects anything over 128)
    var FRAMES  = 48;    // frames in the finished loop
    var FADE    = 12;    // cross-dissolve length, in frames
    var STRIDE  = 2;     // animation frames between captures (sim speed on screen)
    var SETTLE  = 45;    // frames to let the vortex organise before capturing
    var RFRAC   = 0.42;  // collider radius, as a fraction of the canvas's short side
    var DIR     = 'assets/boot-swirl';
    // splat() divides dx/dy by VELOCITY_REFERENCE_RESOLUTION (512) before they
    // reach the velocity field, so these are in the hundreds of pixels — a
    // hand-sized 10px nudge lands as 0.02 and spins nothing at all.
    var SPIN    = 340;   // tangential velocity of the initial ring, in px
    var FEED    = 190;   // per-frame top-up velocity, in px
    var DEBUG_FULL = false;   // also dump one full-canvas frame to eyeball the bowl

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    if (!canvas || !window.config || !window.updateObstacleTexture || !window.applyMultiSplatWith) {
        return Promise.resolve({ error: 'app not ready — let it finish booting first' });
    }

    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * RFRAC;

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }

    // ── 1. The bowl ────────────────────────────────────────────────────
    if (typeof window.clearCanvas === 'function') window.clearCanvas();

    // Every shader reads the obstacle behind `obsActive`, which is
    // window.collisionLayers.enabled (05j) — upload a wall without this and
    // the texture is simply never sampled. That was the whole reason the
    // first bake came out as an unconfined blob.
    window.collisionLayers = window.collisionLayers || {};
    window.collisionLayers.enabled = true;
    window.__obsStrengthMax = 1;

    // Opaque OUTSIDE the disc: alpha IS the wall.
    var ob = document.createElement('canvas');
    ob.width = ob.height = 1024;
    var og = ob.getContext('2d');
    og.fillStyle = '#ffffff';
    og.fillRect(0, 0, 1024, 1024);
    og.globalCompositeOperation = 'destination-out';
    og.beginPath();
    og.arc(1024 * (cx / W), 1024 * (cy / H), 1024 * (R / W), 0, Math.PI * 2);
    og.fill();
    window.updateObstacleTexture(ob);

    // ── 2. The splat ───────────────────────────────────────────────────
    function dyeOf(i) {
        // Warm-dominant with a cooler minority, so two dyes visibly mix.
        return (i % 3 === 1) ? [0.72, 0.10, 0.78] : [1.0, 0.26 + 0.34 * ((i % 7) / 7), 0.06];
    }

    var RING = 7;
    for (var i = 0; i < RING; i++) {
        var a = (i / RING) * Math.PI * 2;
        var rr = R * (0.40 + 0.18 * Math.sin(i * 2.3));   // uneven ring
        window.applyMultiSplatWith(
            cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
            -Math.sin(a) * SPIN, Math.cos(a) * SPIN,
            dyeOf(i), 1, 0.009, true
        );
    }
    // Two off-axis shots so the vortex never settles into symmetry.
    window.applyMultiSplatWith(cx + R * 0.30, cy - R * 0.18, -SPIN * 0.5, SPIN * 1.2,
                               [1.0, 0.70, 0.26], 1, 0.011, true);
    window.applyMultiSplatWith(cx - R * 0.42, cy + R * 0.26, SPIN * 0.9, -SPIN * 0.4,
                               [0.95, 0.18, 0.55], 1, 0.010, true);

    // Keep feeding it while capturing. A sealed bowl mixes to flat mush in
    // about a second — without a top-up the last frames are a uniform blob
    // and the loop has nothing to show. The injection point walks around the
    // rim so no stationary feature forms.
    // Dimmer than the opening ring: a full-brightness stamp reads as a
    // discrete petal sitting on top of the flow instead of dye joining it.
    function dimDye(i) { var c = dyeOf(i); return [c[0]*0.42, c[1]*0.42, c[2]*0.42]; }
    var feedN = 0;
    function feed() {
        var a = feedN * 0.7;
        var rr = R * (0.55 + 0.22 * Math.sin(feedN * 1.31));
        window.applyMultiSplatWith(
            cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
            -Math.sin(a) * FEED, Math.cos(a) * FEED,
            dimDye(feedN), 1, 0.005, true
        );
        feedN++;
    }

    // ── 3-5. Settle, capture, build the loop, write ────────────────────
    var grab = document.createElement('canvas');
    grab.width = grab.height = OUT;
    var gg = grab.getContext('2d', { willReadFrequently: true });
    var shots = [];

    return raf(SETTLE).then(function () {
        var chain = Promise.resolve();
        for (var n = 0; n < FRAMES + FADE; n++) {
            chain = chain.then(function () {
                if (shots.length % 2 === 0) feed();
                return raf(STRIDE).then(function () {
                    if (DEBUG_FULL && shots.length === 8) {
                        var fc = document.createElement('canvas');
                        fc.width = W; fc.height = H;
                        fc.getContext('2d').drawImage(canvas, 0, 0);
                        fs.writeFileSync(path.join(process.cwd(), DIR, '_debug-full.png'),
                            Buffer.from(fc.toDataURL('image/png').split(',')[1], 'base64'));
                    }
                    gg.clearRect(0, 0, OUT, OUT);
                    gg.drawImage(canvas, cx - R, cy - R, R * 2, R * 2, 0, 0, OUT, OUT);
                    shots.push(gg.getImageData(0, 0, OUT, OUT));
                });
            });
        }
        return chain;
    }).then(function () {
        // Cross-dissolve: out[i] runs from capture[i+FRAMES] back to
        // capture[i] over the first FADE frames, so out[FRAMES-1] flows into
        // out[0] (its successor in the capture IS capture[FRAMES]) and
        // out[FADE] lands exactly on the clean middle.
        var out = [];
        for (var i = 0; i < FRAMES; i++) {
            if (i >= FADE) { out.push(shots[i]); continue; }
            var t = i / FADE;
            var a = shots[i + FRAMES].data, b = shots[i].data;
            var m = gg.createImageData(OUT, OUT), d = m.data;
            for (var p = 0; p < d.length; p++) d[p] = a[p] * (1 - t) + b[p] * t;
            out.push(m);
        }

        // Un-premultiply against black, then cut to the bowl.
        var rad = OUT / 2, feather = 1.5;
        for (var f = 0; f < out.length; f++) {
            var dd = out[f].data;
            for (var y = 0; y < OUT; y++) {
                for (var x = 0; x < OUT; x++) {
                    var o = (y * OUT + x) * 4;
                    var r = dd[o], g2 = dd[o + 1], b2 = dd[o + 2];
                    var lum = Math.max(r, g2, b2) / 255;
                    var dx = x + 0.5 - rad, dy = y + 0.5 - rad;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    var mask = Math.max(0, Math.min(1, (rad - dist) / feather));
                    if (lum <= 0.004 || mask <= 0) { dd[o + 3] = 0; continue; }
                    var k = 1 / lum;   // recover the dye's own colour
                    dd[o]     = Math.min(255, r * k);
                    dd[o + 1] = Math.min(255, g2 * k);
                    dd[o + 2] = Math.min(255, b2 * k);
                    // Slight lift so thin dye still registers at cursor size.
                    dd[o + 3] = Math.round(255 * Math.pow(lum, 0.80) * mask);
                }
            }
        }

        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        fs.readdirSync(dir).forEach(function (n) {
            if (/^\d+\.png$/.test(n)) fs.unlinkSync(path.join(dir, n));
        });
        var wc = document.createElement('canvas');
        wc.width = wc.height = OUT;
        var wg = wc.getContext('2d');
        var bytes = 0;
        for (var q = 0; q < out.length; q++) {
            wg.clearRect(0, 0, OUT, OUT);
            wg.putImageData(out[q], 0, 0);
            var url = wc.toDataURL('image/png');
            var buf = Buffer.from(url.split(',')[1], 'base64');
            bytes += buf.length;
            fs.writeFileSync(path.join(dir, String(q).padStart(2, '0') + '.png'), buf);
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
        return { frames: out.length, size: OUT, kb: Math.round(bytes / 1024), dir: dir };
    });
})()
