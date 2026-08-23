// ═══════════════════════════════════════════════════════════════════
// scripts/bake-icons.js — Steam Shortcut Icon + App Icon, painted BY
// THE APP rather than drawn in an image editor or generated.
//
// PAGE code. Install order:
//   node tmp-cdp-driver.js @scripts/test/harness.js
//   node tmp-cdp-driver.js @scripts/test/stage.js
//   node tmp-cdp-driver.js @scripts/bake-icons.js
//
// WHAT STEAM WANTS (from the upload page)
//   Shortcut Icon — ICO with a ≥256 image, OR a PNG at exactly 256 or
//                   512. "Convert shortcut icon to app icon at upload
//                   time" is ticked, so this one can feed both.
//   App Icon      — 184×184 JPG. No alpha: any transparency becomes
//                   solid black, so everything here is composited onto
//                   an opaque near-black ground and never left clear.
//
// DESIGN CONSTRAINT THAT DRIVES EVERYTHING
//   An icon is seen at 16-32px far more often than at 512. That kills
//   fine detail and low contrast: the existing mark has a bright haze
//   at its centre and hairline streaks at its rim, both of which turn
//   to mush when the whole thing is 32 pixels across. So this bakes a
//   BOLD vortex — few, thick, well-separated arms in three saturated
//   hues, dark ground, high contrast, and the silhouette is a filled
//   disc rather than a spray.
//
// A square canvas box is staged so the sim's own aspect is 1:1 and the
// spiral is not squashed by a 16:9 crop.
//
// Writes to steam/store-assets/ (candidates — nothing is overwritten):
//   icon_swirl_master_1024.png   the master, for any future size
//   shortcut_icon_512.png        upload this as the Shortcut Icon
//   shortcut_icon_256.png        the smaller allowed size
//   app_icon_184.jpg             upload this as the App Icon
//   icon_preview_sizes.png       the icon at 16/32/64/128/256 for judging
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var DIR = 'steam/store-assets';
    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    var T = window.__test;

    if (!T || !window.__stage) {
        return Promise.resolve({ error: 'install scripts/test/harness.js then scripts/test/stage.js first' });
    }

    var GROUND = '#0a0e16';

    function sq(size) {
        var c = document.createElement('canvas');
        c.width = size; c.height = size;
        var x = c.getContext('2d');
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.fillStyle = GROUND;
        x.fillRect(0, 0, size, size);
        return { c: c, x: x };
    }

    // Cover-fit the (square) canvas into a square of `size`.
    function cover(dst, src, size) {
        var s = Math.max(size / src.width, size / src.height);
        var sw = size / s, sh = size / s;
        dst.drawImage(src,
            (src.width - sw) / 2, (src.height - sh) / 2, sw, sh,
            0, 0, size, size);
    }

    function roundedMask(ctx, size, r) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(size, 0, size, size, r);
        ctx.arcTo(size, size, 0, size, r);
        ctx.arcTo(0, size, 0, 0, r);
        ctx.arcTo(0, 0, size, 0, r);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    function writePng(name, c) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        return { name: name, kb: Math.round(buf.length / 1024) };
    }
    function writeJpg(name, c, q) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/jpeg', q || 0.95).split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        return { name: name, kb: Math.round(buf.length / 1024) };
    }

    // ── The mark ───────────────────────────────────────────────────────
    // Three concentric rings of dabs, each pushed TANGENTIALLY so the
    // fluid winds them into arms. Colour is assigned by sector, not by
    // ring, so the arms stay separated as they wrap instead of blending
    // into the white haze the old mark has at its core.
    var HUES = [
        [0.20, 0.70, 1.00],   // cyan-blue
        [1.00, 0.28, 0.62],   // magenta
        [1.00, 0.78, 0.26]    // gold
    ];

    function ring(radius, count, speed, radiusPx, phase) {
        var W = canvas.width, H = canvas.height;
        var cx = W * 0.5, cy = H * 0.5;
        for (var i = 0; i < count; i++) {
            var a = (i / count) * Math.PI * 2 + phase;
            var col = HUES[i % HUES.length];
            window.applyMultiSplatWith(
                cx + Math.cos(a) * radius * W,
                cy + Math.sin(a) * radius * H,
                -Math.sin(a) * speed, Math.cos(a) * speed,
                col, 1, radiusPx, true);
        }
    }

    // Emit every deliverable size from one captured master, plus the
    // legibility strip. `suffix` keeps competing variants side by side
    // instead of overwriting each other.
    function emit(suffix, out) {
        var master = sq(1024);
        cover(master.x, canvas, 1024);
        out.push(writePng('icon_swirl_master_1024' + suffix + '.png', master.c));

        // Shortcut icons: PNG, rounded like the shipped mark.
        [512, 256].forEach(function (size) {
            var s = sq(size);
            s.x.drawImage(master.c, 0, 0, 1024, 1024, 0, 0, size, size);
            roundedMask(s.x, size, size * 0.18);
            out.push(writePng('shortcut_icon_' + size + suffix + '.png', s.c));
        });

        // App icon: 184 JPG, square and opaque (alpha is not allowed).
        var app = sq(184);
        app.x.drawImage(master.c, 0, 0, 1024, 1024, 0, 0, 184, 184);
        out.push(writeJpg('app_icon_184' + suffix + '.jpg', app.c, 0.95));

        // The sizes people actually see it at. 16px is the real test.
        var SIZES = [16, 32, 64, 128, 256];
        var pad = 24;
        var totalW = SIZES.reduce(function (a, s) { return a + s + pad; }, pad);
        var strip = document.createElement('canvas');
        strip.width = totalW; strip.height = 256 + pad * 2;
        var sx = strip.getContext('2d');
        sx.imageSmoothingQuality = 'high';
        sx.fillStyle = '#16181d';
        sx.fillRect(0, 0, strip.width, strip.height);
        var cursor = pad;
        SIZES.forEach(function (s) {
            sx.drawImage(master.c, 0, 0, 1024, 1024, cursor, pad + (256 - s), s, s);
            cursor += s + pad;
        });
        out.push(writePng('icon_preview_sizes' + suffix + '.png', strip));
        return master;
    }

    var out = [];

    return T.freeze().then(function () {
        // ── Variant A: fine arms ───────────────────────────────────────
        // Nine dabs per ring cycling three hues — an intricate spiral.
        return window.__stage({ dye: '2048', sim: '512', box: [1080, 1080], seed: 0x1C0 });
    }).then(function () {
        T.seed(0x1C0);
        // Outer arms first, then tighter and faster toward the middle:
        // the inner rings spin up sooner, so by capture time the mark
        // reads as one continuous spiral rather than three loose rings.
        ring(0.34, 9, 300, 0.0070, 0.0);
        return T.step(5);
    }).then(function () {
        ring(0.24, 9, 420, 0.0062, 0.7);
        return T.step(5);
    }).then(function () {
        ring(0.15, 9, 520, 0.0052, 1.4);
        return T.step(24);
    }).then(function () {
        emit('_a', out);

        // ── Variant B: bold arms ───────────────────────────────────────
        // Nine thin arms is more detail than a 16px icon can hold — at
        // that size variant A is just a coloured dot. Three fat arms,
        // fatter dabs and a tighter wind give a shape that survives the
        // shrink, which is the whole job of an icon.
        return window.__stage({ dye: '2048', sim: '512', box: [1080, 1080], seed: 0x1C1 });
    }).then(function () {
        T.seed(0x1C1);
        ring(0.30, 3, 340, 0.0150, 0.0);
        return T.step(6);
    }).then(function () {
        ring(0.19, 3, 480, 0.0125, 0.9);
        return T.step(6);
    }).then(function () {
        ring(0.10, 3, 600, 0.0100, 1.8);
        return T.step(20);
    }).then(function () {
        emit('_b', out);
        T.unseed();
        T.thaw();
        try { if (window.__stageRestore) window.__stageRestore(); } catch (_) {}
        return { dir: DIR, written: out, canvas: canvas.width + 'x' + canvas.height };
    }, function (e) {
        T.unseed(); T.thaw();
        return { error: String((e && e.stack) || e), written: out };
    });
})()
