// ═══════════════════════════════════════════════════════════════════
// scripts/bake-capsules-slicebg.js — store capsules built on the
// vertical-slice background instead of the two-stream painting.
//
// PAGE code, same harness as the other bakers:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-capsules-slicebg.js
//
// The slice background is the one the wordmark was always meant to sit over.
// Source is bg-slices-3840x1240.png (the largest render), and every slot takes
// a CENTRE crop of it — the middle stretch runs gold / lilac / sand / steel
// blue, which is the richest part of the strip and gives type something to sit
// on without any one column dominating.
//
// Writes into steam/store-assets-slicebg/ rather than over the approved
// two-stream set, so both exist and can be compared before either ships.
// Also writes the bare centre crops, with no type, as reusable backgrounds.
//
// Typography matches the app's splash (css/init-responsive.css:60): Segoe UI
// 200, uppercase, 0.25em tracking, soft blue glow.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var SRC   = 'steam/store-assets-slicebg/bg-slices-3840x1240.png';
    var DIR   = 'steam/store-assets-slicebg';
    var TITLE = 'Swirl Together';
    var TAG   = 'A playful painting game for two or more';
    var TITLE_LINES = TITLE.toUpperCase().split(' ');

    var fs = require('fs');
    var path = require('path');

    function loadImage(src) {
        return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { rej(new Error('could not load ' + src)); };
            im.src = src + '?' + Date.now();
        });
    }

    // ── Typography (per-glyph tracking; canvas letterSpacing is unreliable) ──
    function face(ctx, size, weight) {
        ctx.font = weight + ' ' + size + 'px "Segoe UI", "Inter", sans-serif';
    }
    function trackedWidth(ctx, text, size, weight, trackEm) {
        face(ctx, size, weight);
        var tr = size * trackEm, w = 0;
        for (var i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width + tr;
        return w - tr;
    }
    function drawTracked(ctx, text, x, y, size, weight, trackEm, align, glow) {
        var total = trackedWidth(ctx, text, size, weight, trackEm);
        var cx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
        var tr = size * trackEm;
        face(ctx, size, weight);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        if (glow) {
            ctx.save();
            ctx.shadowColor = 'rgba(6, 10, 16, 0.85)';
            ctx.shadowBlur = size * 0.9;
            var p = cx;
            for (var i = 0; i < text.length; i++) { ctx.fillText(text[i], p, y); p += ctx.measureText(text[i]).width + tr; }
            ctx.shadowColor = 'rgba(100, 180, 255, 0.35)';
            ctx.shadowBlur = size * 2.0;
            p = cx;
            for (var j = 0; j < text.length; j++) { ctx.fillText(text[j], p, y); p += ctx.measureText(text[j]).width + tr; }
            ctx.restore();
        }
        var q = cx;
        for (var k = 0; k < text.length; k++) { ctx.fillText(text[k], q, y); q += ctx.measureText(text[k]).width + tr; }
        return total;
    }
    function wordmark(ctx, x, y, titleSize, align, opts) {
        opts = opts || {};
        var lines = opts.split ? TITLE_LINES : [TITLE.toUpperCase()];
        var lh = titleSize * 1.34;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
        lines.forEach(function (ln, i) {
            drawTracked(ctx, ln, x, y + i * lh, titleSize, 200, 0.25, align, true);
        });
        if (opts.tagline) {
            var ty = y + (lines.length - 1) * lh + titleSize * 1.5;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
            drawTracked(ctx, TAG.toUpperCase(), x, ty, opts.tagSize, 300, 0.30, align, true);
        }
    }


    // Small capsule renders ~231px wide in search rows, and Valve flags this
    // slot specifically: the name has to stay readable at that size. Two
    // stacked lines wasted the width and left the type small. This fits ONE
    // line to a target width instead, solving for the size rather than
    // guessing it, so the wordmark spans the frame whatever the name becomes.
    // Tracking is tightened here as a deliberate exception to the 0.25em house
    // setting: airy letterspacing is the first thing to fall apart when an
    // image is halved, and legibility wins over consistency in this one slot.
    function fitTitleSize(ctx, text, targetW, trackEm, weight, start) {
        var size = start || 40;
        for (var i = 0; i < 20; i++) {
            var w = trackedWidth(ctx, text, size, weight, trackEm);
            if (!w) break;
            if (Math.abs(w - targetW) < 0.5) break;
            size = size * (targetW / w);
        }
        return size;
    }
    function drawSmallCapsuleTitle(ctx, W, H) {
        var MARGIN = 22, TRACK = 0.14;
        var text = TITLE.toUpperCase();
        var size = fitTitleSize(ctx, text, W - MARGIN * 2, TRACK, 200, 44);
        // Cap height is roughly 0.70 of the em, so this centres the glyphs
        // rather than the baseline.
        var y = H / 2 + size * 0.35;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        drawTracked(ctx, text, MARGIN, y, size, 200, TRACK, 'left', true);
        return size;
    }


    // Portrait capsules were failing Steam's "logo should fill at least 1/3 of
    // the image" on the axis that matters. Measured on the vertical: 67% of the
    // width but only 18% of the HEIGHT, because the type was sized by eye to
    // sit under the art rather than to occupy the frame.
    //
    // Solve for the size instead: fit the longest line to a target share of the
    // width, which lets the two-line block grow as tall as the frame allows.
    // Tracking drops to ~0.09em here (house setting is 0.25em) purely to buy
    // that room -- at 0.25em the letterspacing eats the width budget long
    // before the type is tall enough to count.
    //
    // Honest limit: a 2:3 frame cannot have eight tracked characters fit the
    // width AND reach a third of the height at the same time. This maximises
    // both and reports what it actually achieved rather than assuming.
    function fitStackedTitle(ctx, W, H, opts) {
        opts = opts || {};
        var track      = opts.track !== undefined ? opts.track : 0.09;
        var targetFrac = opts.targetFrac || 0.88;
        var centerFrac = opts.centerFrac || 0.78;
        var lines = TITLE.toUpperCase().split(' ');
        var longest = lines.slice().sort(function (a, b) { return b.length - a.length; })[0];

        var size = 100;
        for (var i = 0; i < 20; i++) {
            var w = trackedWidth(ctx, longest, size, 200, track);
            if (!w) break;
            if (Math.abs(w - W * targetFrac) < 0.5) break;
            size = size * (W * targetFrac / w);
        }
        var lh = size * 1.34;
        var blockH = size * 0.70 + lh * (lines.length - 1);
        // centerFrac is where the block's optical centre lands.
        var firstBaseline = H * centerFrac - blockH / 2 + size * 0.70;

        // align 'left' keeps the art breathing on the right of a landscape
        // capsule; 'center' suits the portrait slots.
        var align = opts.align || 'center';
        var anchorX = (align === 'left') ? (opts.x || 0) : W / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        lines.forEach(function (ln, i) {
            drawTracked(ctx, ln, anchorX, firstBaseline + i * lh, size, 200, track, align, true);
        });
        return {
            size: Math.round(size),
            logoW: Math.round(trackedWidth(ctx, longest, size, 200, track)),
            logoH: Math.round(blockH)
        };
    }

    // ── Compositing ───────────────────────────────────────────────────
    function slot(W, H) {
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        return { c: c, ctx: ctx };
    }
    // Cover-crop around the CENTRE of the source.
    function centreCrop(ctx, src, W, H, zoom) {
        var s = Math.max(W / src.width, H / src.height) * (zoom || 1);
        var dw = src.width * s, dh = src.height * s;
        ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    // A scrim under the type. The slice background is bright and busy, so the
    // wordmark needs its own ground or it fights ten columns at once.
    function scrim(ctx, W, H, dir, strength) {
        var g = dir === 'h'
            ? ctx.createLinearGradient(0, 0, W, 0)
            : ctx.createLinearGradient(0, H, 0, 0);
        g.addColorStop(0, 'rgba(6, 10, 16, ' + strength + ')');
        g.addColorStop(0.5, 'rgba(6, 10, 16, ' + (strength * 0.55) + ')');
        g.addColorStop(1, 'rgba(6, 10, 16, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    function vignette(ctx, W, H) {
        var g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H) * 0.30, W/2, H/2, Math.max(W,H) * 0.78);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.42)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    var written = [];
    function write(name, c) {
        var dir = path.join(process.cwd(), DIR);
        fs.mkdirSync(dir, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(dir, name), buf);
        written.push({ name: name, kb: Math.round(buf.length / 1024) });
    }

    return loadImage(SRC).then(function (bg) {

        // Bare centre crops, no type — reusable backgrounds.
        [[1920, 1080], [1232, 706], [3840, 1240]].forEach(function (d) {
            var s = slot(d[0], d[1]);
            centreCrop(s.ctx, bg, d[0], d[1]);
            write('centre-crop-' + d[0] + 'x' + d[1] + '.png', s.c);
        });

        // 1232×706 main capsule — type left, art breathing on the right.
        var s = slot(1232, 706);
        centreCrop(s.ctx, bg, 1232, 706);
        vignette(s.ctx, 1232, 706);
        scrim(s.ctx, 1232, 706, 'h', 0.92);
        fitStackedTitle(s.ctx, 1232, 706, { align: 'left', x: 74, targetFrac: 0.66, centerFrac: 0.50 });
        write('capsule_main_1232x706.png', s.c);

        // 920×430 header capsule (library header shares the composition).
        [['capsule_header_920x430.png'], ['library_header_920x430.png']].forEach(function (n) {
            var h = slot(920, 430);
            centreCrop(h.ctx, bg, 920, 430);
            vignette(h.ctx, 920, 430);
            scrim(h.ctx, 920, 430, 'h', 0.92);
            fitStackedTitle(h.ctx, 920, 430, { align: 'left', x: 56, targetFrac: 0.62, centerFrac: 0.50 });
            write(n[0], h.c);
        });

        // 462×174 small capsule — search rows. Name only, stacked.
        var sm = slot(462, 174);
        centreCrop(sm.ctx, bg, 462, 174, 1.1);
        // Wordmark spans the frame now, so darken the whole plate rather than
        // one edge — the slice background is bright the whole way across.
        sm.ctx.fillStyle = 'rgba(6, 10, 16, 0.50)';
        sm.ctx.fillRect(0, 0, 462, 174);
        drawSmallCapsuleTitle(sm.ctx, 462, 174);
        write('capsule_small_462x174.png', sm.c);

        // 748×896 vertical capsule.
        var v = slot(748, 896);
        centreCrop(v.ctx, bg, 748, 896);
        vignette(v.ctx, 748, 896);
        scrim(v.ctx, 748, 896, 'v', 0.95);
        fitStackedTitle(v.ctx, 748, 896, { centerFrac: 0.80 });
        write('capsule_vertical_748x896.png', v.c);

        // 600×900 library capsule.
        var lc = slot(600, 900);
        centreCrop(lc.ctx, bg, 600, 900);
        vignette(lc.ctx, 600, 900);
        scrim(lc.ctx, 600, 900, 'v', 0.95);
        fitStackedTitle(lc.ctx, 600, 900, { centerFrac: 0.79 });
        write('library_capsule_600x900.png', lc.c);

        // 3840×1240 hero — NO TEXT; Steam lays library_logo over it.
        var hero = slot(3840, 1240);
        centreCrop(hero.ctx, bg, 3840, 1240);
        vignette(hero.ctx, 3840, 1240);
        write('library_hero_3840x1240.png', hero.c);

        // 1438x810 page background — behind the store page, so no text.
        var pbg = slot(1438, 810);
        centreCrop(pbg.ctx, bg, 1438, 810);
        vignette(pbg.ctx, 1438, 810);
        write('page_background_1438x810.png', pbg.c);

        return { written: written, source: SRC, note: 'centre crop of the slice background' };
    }).catch(function (e) {
        return { error: String(e && e.stack || e), written: written };
    });
})()
