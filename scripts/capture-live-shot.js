// ═══════════════════════════════════════════════════════════════════
// scripts/capture-live-shot.js — take the screenshot straight off the
// canvas as it stands right now, at whatever the canvas already is.
//
// PAGE code:
//   node tmp-cdp-driver.js "window.__captureJob={out:'06-kaleidoscopes.png',
//        caption:'Explore kaleidoscopes and mandalas'};'ok'"
//   node tmp-cdp-driver.js @scripts/capture-live-shot.js
//
// For work someone composed BY HAND in the app. The bakers paint their own
// compositions and are free to drive the sim; this one must not. It reads
// the canvas and nothing else — no clearCanvas, no preset apply, no config
// or resolution changes, no __exporting toggle. Whatever is on screen is
// what lands in the file, so a capture can be taken mid-session without
// disturbing the thing being captured.
//
// THE GROUND. The WebGL canvas is transparent wherever there is no dye, and
// the app's background is a CSS colour on #canvas-area — grab() cannot see
// it, so a naive capture comes back with the background knocked out and
// every light-grounded piece turns into dye floating on black. The computed
// style is read here and painted underneath, which is what makes the file
// match what the person is actually looking at.
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
    if (!canvas) return Promise.resolve({ error: 'no canvas' });

    var job = window.__captureJob || {};
    var OUTNAME = job.out || 'live-capture.png';
    var CAPTION = job.caption || '';

    function loadImage(src) {
        return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { rej(new Error('load fail ' + src)); };
            im.src = src + '?' + Date.now();
        });
    }

    // What the person actually sees behind the dye.
    function groundColor() {
        if (job.ground) return job.ground;
        var area = document.getElementById('canvas-area');
        var c = area && getComputedStyle(area).backgroundColor;
        // A transparent computed value means transparent-mode is on; fall back
        // to the picker's value, which is what that mode is hiding.
        if (!c || c === 'transparent' || /rgba\([^)]*,\s*0\s*\)/.test(c)) {
            var pick = document.getElementById('backgroundColorPicker');
            return (pick && pick.value) || '#000000';
        }
        return c;
    }

    var written = [];
    function write(dir, name, c) {
        var d = path.join(process.cwd(), dir);
        fs.mkdirSync(d, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(d, name), buf);
        written.push({ name: name, kb: Math.round(buf.length / 1024) });
    }
    function frame(w, h, fill) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
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
            // A light-grounded piece needs a heavier scrim than the dark shots:
            // darkening alone would leave white type sitting on mid-tone.
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

    var ground = groundColor();
    var f = frame(OUT_W, OUT_H, ground);
    cover(f.x, canvas, OUT_W, OUT_H);
    write(DIR, OUTNAME, f.c);

    return (CAPTION ? makePreview(OUTNAME, CAPTION) : Promise.resolve())
        .then(function () {
            return { written: written, ground: ground,
                     canvas: [canvas.width, canvas.height],
                     kaleido: !!window.kaleidoEnabled, segments: window.kaleidoSegments };
        })
        .catch(function (e) { return { error: String(e && e.stack || e), written: written }; });
})()
