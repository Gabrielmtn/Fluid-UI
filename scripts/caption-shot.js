// ═══════════════════════════════════════════════════════════════════
// scripts/caption-shot.js — composite a Steam caption onto an image that
// was captured by hand rather than baked, and fit it to the 1920×1080
// screenshot slot.
//
// PAGE code (it needs a 2D canvas, which the Node side does not have):
//   node tmp-cdp-driver.js "window.__captionJob={src:'C:\\path\\shot.png',
//        out:'06-kaleidoscopes.png', caption:'Explore kaleidoscopes and mandalas'};'ok'"
//   node tmp-cdp-driver.js @scripts/caption-shot.js
//
// src is read through fs and handed to the page as a data URL, so it can
// live anywhere on disk — a file:// <img> from an app page would otherwise
// taint the canvas and toDataURL would throw.
//
// The clean copy lands in steam/screenshots/ and the captioned one in
// steam/screenshots/preview/, matching what the bakers produce.
//
// Cropping: sources are rarely exactly 16:9, so the image is COVER-fitted —
// centred and cropped on the long axis. Set job.fit = 'contain' to letterbox
// onto the page's dark ground instead, when a centred composition would lose
// something to the crop.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var DIR = 'steam/screenshots';
    var PREVIEW = 'steam/screenshots/preview';
    var OUT_W = 1920, OUT_H = 1080;

    var fs = require('fs');
    var path = require('path');
    var job = window.__captionJob;
    if (!job || !job.src || !job.out) {
        return Promise.resolve({ error: 'set window.__captionJob = {src, out, caption} first' });
    }

    var MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    var ext = path.extname(job.src).toLowerCase();
    if (!MIME[ext]) return Promise.resolve({ error: 'unsupported source type: ' + ext });
    if (!fs.existsSync(job.src)) return Promise.resolve({ error: 'no such file: ' + job.src });

    var dataUrl = 'data:' + MIME[ext] + ';base64,' +
                  fs.readFileSync(job.src).toString('base64');

    // App exports carry ALPHA wherever there is no dye — the background the
    // painter sees is a CSS colour on #canvas-area and is not in the file. So
    // the ground is chosen here. Defaults to the set's dark plate; pass
    // job.ground to match whatever the piece was composed against instead.
    function frame(w, h, fill) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d');
        x.fillStyle = fill || '#080c12';
        x.fillRect(0, 0, w, h);
        x.imageSmoothingQuality = 'high';
        return { c: c, x: x };
    }
    function fit(x, src, W, H, mode) {
        var s = mode === 'contain' ? Math.min(W / src.width, H / src.height)
                                   : Math.max(W / src.width, H / src.height);
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

    // Same tracked-caps treatment the bakers use, so this shot sits in the
    // set rather than next to it.
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

    return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () { res(im); };
        im.onerror = function () { rej(new Error('decode failed')); };
        im.src = dataUrl;
    }).then(function (img) {
        var src = { w: img.width, h: img.height };

        // Clean copy — no text. Valve's asset rules want the screenshot slots
        // to be the game, so the numbered file stays text-free and only the
        // preview carries the caption.
        var clean = frame(OUT_W, OUT_H, job.ground);
        fit(clean.x, img, OUT_W, OUT_H, job.fit);
        write(DIR, job.out, clean.c);

        // Captioned preview.
        var f = frame(OUT_W, OUT_H, job.ground);
        fit(f.x, img, OUT_W, OUT_H, job.fit);

        // This source is light-grounded, unlike the baked shots — a scrim that
        // only darkens would leave the caption on mid-grey. Pushing it to the
        // same near-black the rest of the set uses keeps the text legible and
        // the strip consistent across all five.
        var g = f.x.createLinearGradient(0, OUT_H, 0, OUT_H * 0.42);
        g.addColorStop(0, 'rgba(4, 8, 14, 0.92)');
        g.addColorStop(1, 'rgba(4, 8, 14, 0)');
        f.x.fillStyle = g;
        f.x.fillRect(0, 0, OUT_W, OUT_H);

        var lines = String(job.caption || '').toUpperCase().split('\n');
        var size = 52, lh = size * 1.5;
        var y0 = OUT_H - 88 - (lines.length - 1) * lh;
        f.x.fillStyle = 'rgba(255,255,255,0.97)';
        lines.forEach(function (ln, i) {
            drawTracked(f.x, ln, 96, y0 + i * lh, size, 200, 0.16);
        });
        write(PREVIEW, job.out.replace(/\.png$/, '-text.png'), f.c);

        return { written: written, source: src, fit: job.fit || 'cover' };
    }).catch(function (e) {
        return { error: String(e && e.stack || e), written: written };
    });
})()
