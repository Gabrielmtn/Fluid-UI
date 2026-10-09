// ═══════════════════════════════════════════════════════════════════
// js/65-palette-from-image.js: a palette made from a picture or from
//   the painting (2026-10-08)
// LOAD ORDER: after 64a-colour-math.js (window.ColourMath). Everything
//   else (addPaletteFromColours in 01, fluidExport in 24, UIVisibility in
//   43) is looked up when it is used, so its load order doesn't matter.
// PROVIDES: window.PaletteFromImage
//   • openFile(file)    an image File/Blob → the panel under the palette tags
//   • pickFile()        the OS file dialog, then openFile
//   • openCanvas()      the painting, as the user sees it → the panel
//   • close(), isOpen()
//   • extract(src, opts) the colour finder the panel runs. Pure (no DOM),
//                        and module.exports for Node, so
//                        scripts/test/palette-extract/run.js can load it.
// Wired from [+ New]'s menu (01-config) and from an image dropped on the
// palettes (32-file-drop). Save goes through addPaletteFromColours (01),
// which keeps the palette like any other palette of your own.
//
// The panel follows Adobe Color's "extract theme": five colours by default,
// a mood (Dominant / Bright / Muted / Deep / Dark), and a marker on the
// picture for every colour that can be dragged to pick a different one.
// ═══════════════════════════════════════════════════════════════════
(function (root) {
    'use strict';

    // In the page 64a has already run; in Node it is loaded beside us.
    var CM = root.ColourMath || null;
    function cm() {
        if (!CM && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            CM = require('./64a-colour-math.js');
        }
        return CM || root.ColourMath;
    }

    // ── The colour finder ───────────────────────────────────────────
    //
    // extract({ data, width, height }, { method, count, seed })
    //   → [{ hex, x, y, weight }]
    //
    // 1. Pixels (alpha ≥ 128) go into a 4096-bin RGB histogram. Each bin
    //    keeps the MEAN of its pixels, not its centre, so a flat colour comes
    //    out exactly as it went in.
    // 2. Weighted k-means++ in OKLab over the bins, K = count × 3 clamped to
    //    8..36: more clusters than colours asked for, so a small accent can
    //    hold a cluster of its own instead of being averaged into a big one.
    // 3. Each cluster is scored for the method (pop = its share of pixels,
    //    L and C from its OKLCH) and `count` are picked greedily, each next
    //    pick discounted by how close it sits to the ones already picked.
    // 4. Order: Dominant by share, largest first; every other method light
    //    to dark, so a Bright palette reads as a ramp.
    //
    // x, y (0-1) is a pixel of that colour for the panel's marker: among the
    // pixels nearest the cluster's colour, the one deepest inside a patch of
    // them, so the marker sits on the colour and not on an edge of it.
    //
    // Seed 0 is the straight answer. Any other seed also shakes each cluster's
    // score by up to SHAKE, so "Try other colours" finds different ones even
    // on a picture whose k-means always lands the same way.

    var BIN_BITS = 4;            // 16 levels a channel → 4096 bins
    var KM_ITERS = 8;
    var DUP_DE = 0.02;           // never two colours closer than this (ΔE OK)
    var SPREAD_DE = 0.12;        // a pick closer than this to another is discounted
    var CHROMA_FULL = 0.15;      // OKLCH C at which a colour has stopped being muted
    var SHAKE = 0.45;            // seeds other than 0: score × (1 − SHAKE·rand)
    var REP_TOL = 0.02;          // marker candidates: within this of the closest pixel
    var COUNT_MAX = 12;

    var METHODS = {
        dominant: function (c) { return c.w; },
        bright: function (c) { return Math.pow(c.w, 0.35) * c.C * c.L; },
        muted: function (c) { return Math.sqrt(c.w) * (1 - Math.min(c.C / CHROMA_FULL, 1)) * c.L; },
        deep: function (c) { return Math.pow(c.w, 0.35) * c.C * (1 - c.L); },
        dark: function (c) { return Math.sqrt(c.w) * (1 - c.L) * (1 - c.L) * (1 - Math.min(c.C / CHROMA_FULL, 1) * 0.5); }
    };

    // mulberry32: small, fast and the same on every engine.
    function rng32(seed) {
        var a = seed | 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function d2(lab, p, cent, c) {
        var x = lab[p * 3] - cent[c * 3], y = lab[p * 3 + 1] - cent[c * 3 + 1], z = lab[p * 3 + 2] - cent[c * 3 + 2];
        return x * x + y * y + z * z;
    }

    function extract(src, opts) {
        opts = opts || {};
        var C = cm();
        var method = METHODS[opts.method] ? opts.method : 'dominant';
        var count = Math.round(Number(opts.count));
        if (!isFinite(count)) count = 5;
        count = Math.max(1, Math.min(COUNT_MAX, count));
        var seed = (Number(opts.seed) || 0) | 0;
        var data = src && src.data;
        var w = src ? (src.width | 0) : 0, h = src ? (src.height | 0) : 0;
        if (!data || w <= 0 || h <= 0 || data.length < w * h * 4) return [];
        var n = w * h, i, p, c, k;

        // 1. Histogram, keeping each bin's mean.
        var shift = 8 - BIN_BITS, NB = 1 << (BIN_BITS * 3);
        var bN = new Float64Array(NB), bR = new Float64Array(NB), bG = new Float64Array(NB), bB = new Float64Array(NB);
        var pixBin = new Int32Array(n);
        for (i = 0; i < n; i++) {
            var o = i * 4;
            if (data[o + 3] < 128) { pixBin[i] = -1; continue; }
            var r = data[o], g = data[o + 1], b = data[o + 2];
            k = ((r >> shift) << (BIN_BITS * 2)) | ((g >> shift) << BIN_BITS) | (b >> shift);
            pixBin[i] = k;
            bN[k]++; bR[k] += r; bG[k] += g; bB[k] += b;
        }
        var binPt = new Int32Array(NB), P = 0;
        for (k = 0; k < NB; k++) binPt[k] = bN[k] ? P++ : -1;
        if (!P) return [];
        var lab = new Float64Array(P * 3), wt = new Float64Array(P), total = 0;
        for (k = 0; k < NB; k++) {
            p = binPt[k];
            if (p < 0) continue;
            var q = C.rgbToOklab([bR[k] / bN[k] / 255, bG[k] / bN[k] / 255, bB[k] / bN[k] / 255]);
            lab[p * 3] = q[0]; lab[p * 3 + 1] = q[1]; lab[p * 3 + 2] = q[2];
            wt[p] = bN[k]; total += bN[k];
        }

        // 2. Weighted k-means++ seeding, then Lloyd.
        var rand = rng32(seed * 0x9E3779B1 + 0x51ED27);
        var K = Math.min(P, Math.max(8, Math.min(36, count * 3)));
        var cent = new Float64Array(K * 3), near = new Float64Array(P);
        var pick = 0, acc = rand() * total;
        for (p = 0; p < P; p++) { acc -= wt[p]; if (acc <= 0) { pick = p; break; } }
        cent[0] = lab[pick * 3]; cent[1] = lab[pick * 3 + 1]; cent[2] = lab[pick * 3 + 2];
        for (p = 0; p < P; p++) near[p] = d2(lab, p, cent, 0);
        var k2 = 1;
        while (k2 < K) {
            var sum = 0;
            for (p = 0; p < P; p++) sum += wt[p] * near[p];
            if (sum <= 1e-12) break;              // every bin already sits on a centre
            acc = rand() * sum; pick = P - 1;
            for (p = 0; p < P; p++) { acc -= wt[p] * near[p]; if (acc <= 0) { pick = p; break; } }
            cent[k2 * 3] = lab[pick * 3]; cent[k2 * 3 + 1] = lab[pick * 3 + 1]; cent[k2 * 3 + 2] = lab[pick * 3 + 2];
            for (p = 0; p < P; p++) { var dd = d2(lab, p, cent, k2); if (dd < near[p]) near[p] = dd; }
            k2++;
        }
        K = k2;
        var assign = new Int32Array(P).fill(-1);
        var sw = new Float64Array(K), sx = new Float64Array(K), sy = new Float64Array(K), sz = new Float64Array(K);
        for (var it = 0; it < KM_ITERS; it++) {
            var changed = 0;
            for (p = 0; p < P; p++) {
                var best = 0, bestD = Infinity;
                for (c = 0; c < K; c++) { var e = d2(lab, p, cent, c); if (e < bestD) { bestD = e; best = c; } }
                if (assign[p] !== best) { assign[p] = best; changed++; }
            }
            if (!changed) break;
            sw.fill(0); sx.fill(0); sy.fill(0); sz.fill(0);
            for (p = 0; p < P; p++) {
                c = assign[p];
                sw[c] += wt[p]; sx[c] += wt[p] * lab[p * 3]; sy[c] += wt[p] * lab[p * 3 + 1]; sz[c] += wt[p] * lab[p * 3 + 2];
            }
            for (c = 0; c < K; c++) {
                if (sw[c] > 0) { cent[c * 3] = sx[c] / sw[c]; cent[c * 3 + 1] = sy[c] / sw[c]; cent[c * 3 + 2] = sz[c] / sw[c]; }
            }
        }
        // Shares from the final assignment (a centre that lost every bin
        // simply never becomes a cluster).
        sw.fill(0);
        for (p = 0; p < P; p++) sw[assign[p]] += wt[p];

        // 3. Score, then pick.
        var score = METHODS[method];
        var clusters = [];
        for (c = 0; c < K; c++) {
            if (!(sw[c] > 0)) continue;
            var cl = { id: c, lab: [cent[c * 3], cent[c * 3 + 1], cent[c * 3 + 2]], w: sw[c] / total };
            var lch = C.oklabToOklch(cl.lab);
            cl.L = Math.max(0, Math.min(1, lch[0])); cl.C = lch[1];
            cl.hex = C.oklchToHex(lch);
            // The share term keeps a method that scores a cluster at zero
            // (Muted on a fully saturated picture) still able to fill `count`.
            cl.s = score(cl) + 1e-6 * cl.w;
            if (seed) cl.s *= 1 - SHAKE * rand();
            clusters.push(cl);
        }
        var picked = [];
        while (picked.length < count) {
            var bestCl = null, bestV = -1;
            for (i = 0; i < clusters.length; i++) {
                var cand = clusters[i];
                if (cand.taken || cand.dup) continue;
                var md = Infinity;
                for (var j = 0; j < picked.length; j++) {
                    var pk = picked[j];
                    if (C.deltaE(cand.hex, pk.hex) < DUP_DE) { cand.dup = true; break; }
                    var dl = cand.lab[0] - pk.lab[0], da = cand.lab[1] - pk.lab[1], db = cand.lab[2] - pk.lab[2];
                    md = Math.min(md, Math.sqrt(dl * dl + da * da + db * db));
                }
                if (cand.dup) continue;
                var v = cand.s * (picked.length ? Math.min(1, md / SPREAD_DE) : 1);
                if (v > bestV) { bestV = v; bestCl = cand; }
            }
            if (!bestCl) break;
            bestCl.taken = true;
            picked.push(bestCl);
        }

        // Marker spots, for the picked clusters only.
        var slot = new Int32Array(K).fill(-1);
        picked.forEach(function (pc, s) { slot[pc.id] = s; });
        var NP = picked.length;
        var pixSlot = new Int32Array(n).fill(-1), pixD = new Float32Array(n);
        var minD = new Float64Array(NP).fill(Infinity);
        for (i = 0; i < n; i++) {
            if (pixBin[i] < 0) continue;
            var s0 = slot[assign[binPt[pixBin[i]]]];
            if (s0 < 0) continue;
            var pl = C.rgbToOklab([data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255]);
            var cl0 = picked[s0].lab;
            var dist = Math.sqrt((pl[0] - cl0[0]) * (pl[0] - cl0[0]) + (pl[1] - cl0[1]) * (pl[1] - cl0[1]) + (pl[2] - cl0[2]) * (pl[2] - cl0[2]));
            pixSlot[i] = s0; pixD[i] = dist;
            if (dist < minD[s0]) minD[s0] = dist;
        }
        var cand2 = new Int32Array(n).fill(-1);
        var mx = new Float64Array(NP), my = new Float64Array(NP), mn = new Float64Array(NP);
        for (i = 0; i < n; i++) {
            var s1 = pixSlot[i];
            if (s1 < 0 || pixD[i] > minD[s1] + REP_TOL) continue;
            cand2[i] = s1;
            mx[s1] += i % w; my[s1] += (i / w) | 0; mn[s1]++;
        }
        for (var s2 = 0; s2 < NP; s2++) if (mn[s2]) { mx[s2] /= mn[s2]; my[s2] /= mn[s2]; }
        // Most candidates in the 5×5 around it wins; the fraction breaks a
        // tie toward the middle of the candidates.
        var spot = new Int32Array(NP).fill(-1), spotV = new Float64Array(NP).fill(-1);
        var diag = Math.sqrt(w * w + h * h) || 1;
        for (i = 0; i < n; i++) {
            var s3 = cand2[i];
            if (s3 < 0) continue;
            var x0 = i % w, y0 = (i / w) | 0, nb = 0;
            for (var oy = -2; oy <= 2; oy++) {
                var yy = y0 + oy;
                if (yy < 0 || yy >= h) continue;
                for (var ox = -2; ox <= 2; ox++) {
                    var xx = x0 + ox;
                    if (xx >= 0 && xx < w && cand2[yy * w + xx] === s3) nb++;
                }
            }
            var off = Math.sqrt((x0 - mx[s3]) * (x0 - mx[s3]) + (y0 - my[s3]) * (y0 - my[s3])) / diag;
            var val = nb + 0.5 * (1 - off);
            if (val > spotV[s3]) { spotV[s3] = val; spot[s3] = i; }
        }

        var out = picked.map(function (pc, s) {
            var at = spot[s] >= 0 ? spot[s] : 0;
            return { hex: pc.hex, x: ((at % w) + 0.5) / w, y: (((at / w) | 0) + 0.5) / h, weight: pc.w, L: pc.L };
        });
        if (method === 'dominant') out.sort(function (a, b) { return b.weight - a.weight; });
        else out.sort(function (a, b) { return b.L - a.L; });
        return out.map(function (o) { return { hex: o.hex, x: o.x, y: o.y, weight: o.weight }; });
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { extract: extract };
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // ── The panel ───────────────────────────────────────────────────

    var SAMPLE_MAX = 160;        // longest side the colours are found on
    var VIEW_MAX_W = 260, VIEW_MAX_H = 200;
    var COUNT_MIN = 3, COUNT_DEFAULT = 5;
    var METHOD_LIST = [
        ['dominant', 'Dominant'], ['bright', 'Bright'], ['muted', 'Muted'], ['deep', 'Deep'], ['dark', 'Dark']
    ];

    var S = null;                // the open panel's state
    var openToken = 0;           // a newer open (or a close) strands a slow decode
    var fileInput = null;

    function host() { return document.getElementById('paletteExtractHost'); }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // Where focus goes back to on close. A picture replacing an open panel
    // keeps the first panel's answer: focus is in the panel being replaced.
    function focusBack(hostEl) {
        var a = document.activeElement;
        if (S && S.returnFocus && a && hostEl.contains(a)) return S.returnFocus;
        return a;
    }

    function baseName(name) {
        return String(name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').trim();
    }

    // createImageBitmap decodes off the main thread; the <img> route is for
    // an engine without it, or a format it refuses.
    function decode(blob) {
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(blob).then(function (bmp) {
                return { src: bmp, w: bmp.width, h: bmp.height, release: function () { try { bmp.close(); } catch (_) {} } };
            }, function () { return decodeViaImg(blob); });
        }
        return decodeViaImg(blob);
    }
    function decodeViaImg(blob) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
                resolve({
                    src: img, w: img.naturalWidth, h: img.naturalHeight,
                    release: function () { img.onload = img.onerror = null; URL.revokeObjectURL(url); }
                });
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
            img.src = url;
        });
    }

    function openFile(file) {
        if (!file) return;
        var token = ++openToken;
        var label = file.name || 'Image';
        decode(file).then(function (img) {
            if (token !== openToken) { img.release(); return; }
            if (!img.w || !img.h) { img.release(); throw new Error('empty image'); }
            show(img.src, img.w, img.h, baseName(file.name) || 'From image', label, img.release);
        }).catch(function () {
            if (token === openToken) showError(label, 'That image could not be read. Try a PNG, JPG or WebP.');
        });
    }

    function pickFile() {
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.hidden = true;
            fileInput.addEventListener('change', function () {
                var f = fileInput.files && fileInput.files[0];
                fileInput.value = '';            // the same file again still fires change
                if (f) openFile(f);
            });
            (document.body || document.documentElement).appendChild(fileInput);
        }
        fileInput.click();
    }

    // The WebGL canvas keeps its drawing buffer, so a plain drawImage reads
    // the last frame. Only the sim, though: layers and text are DOM on top,
    // which is why fluidExport's composite comes first.
    function glCopy() {
        var gl = document.getElementById('canvas');
        if (!gl || !gl.width || !gl.height) return null;
        var c = document.createElement('canvas');
        c.width = gl.width; c.height = gl.height;
        c.getContext('2d').drawImage(gl, 0, 0);
        return c;
    }

    function openCanvas() {
        var token = ++openToken;
        var fx = window.fluidExport, grab;
        try {
            grab = (fx && typeof fx.captureFrame === 'function') ? Promise.resolve(fx.captureFrame()) : Promise.reject(new Error('no export'));
        } catch (e) { grab = Promise.reject(e); }
        grab.then(function (cv) {
            if (!cv || !cv.width || !cv.height) throw new Error('empty frame');
            return cv;
        }).catch(function () { return glCopy(); }).then(function (cv) {
            if (token !== openToken) return;
            if (!cv) { showError('The canvas', 'The canvas could not be read.'); return; }
            show(cv, cv.width, cv.height, 'From the canvas', 'The canvas', null);
        });
    }

    // The picture twice: SAMPLE_MAX on its long side for the colours (and
    // for what a dragged marker reads), and panel-sized for the eye. The
    // source is let go as soon as both are drawn.
    function show(source, sw, sh, name, label, release) {
        var hostEl = host();
        if (!hostEl) { if (release) release(); return; }
        var sc = Math.min(1, SAMPLE_MAX / Math.max(sw, sh));
        var tw = Math.max(1, Math.round(sw * sc)), th = Math.max(1, Math.round(sh * sc));
        var sample = null;
        try {
            var smallCv = document.createElement('canvas');
            smallCv.width = tw; smallCv.height = th;
            var sctx = smallCv.getContext('2d', { willReadFrequently: true });
            sctx.imageSmoothingEnabled = true;
            sctx.imageSmoothingQuality = 'high';
            sctx.drawImage(source, 0, 0, tw, th);
            var id = sctx.getImageData(0, 0, tw, th);
            sample = { data: id.data, width: tw, height: th };
        } catch (_) {}

        var avail = hostEl.clientWidth || (hostEl.parentElement && hostEl.parentElement.clientWidth) || VIEW_MAX_W;
        var vw = Math.min(VIEW_MAX_W, Math.max(120, avail - 18));
        var vh = vw * sh / sw;
        if (vh > VIEW_MAX_H) { vh = VIEW_MAX_H; vw = vh * sw / sh; }
        vw = Math.max(1, Math.round(vw)); vh = Math.max(1, Math.round(vh));
        var dpr = Math.min(3, window.devicePixelRatio || 1);
        var view = el('canvas', 'pfi-image');
        view.width = Math.max(1, Math.round(vw * dpr)); view.height = Math.max(1, Math.round(vh * dpr));
        view.style.width = vw + 'px';
        try {
            var vctx = view.getContext('2d');
            vctx.imageSmoothingEnabled = true;
            vctx.imageSmoothingQuality = 'high';
            vctx.drawImage(source, 0, 0, view.width, view.height);
        } catch (_) {}
        if (release) release();

        if (!sample) { showError(label, 'That image could not be read.'); return; }
        var back = focusBack(hostEl);
        teardown();
        // The canvas is mostly black ground, which Dominant dutifully
        // returns first: the paint is what you want from it.
        S = {
            name: name, label: label, sample: sample, view: view,
            method: release === null && label === 'The canvas' ? 'bright' : 'dominant',
            count: COUNT_DEFAULT, seed: 0, items: [],
            returnFocus: back
        };
        build(hostEl);
        run();
        reveal(hostEl);
    }

    function build(hostEl) {
        var panel = el('div', 'pfi');
        panel.tabIndex = -1;
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'New palette from ' + S.label);

        var head = el('div', 'pfi-head');
        var title = el('span', 'pfi-title', S.label);
        title.title = S.label;
        var x = el('button', 'pfi-close btn--ghost btn--icon', '✕');
        x.type = 'button';
        x.title = 'Close without saving';
        x.setAttribute('aria-label', 'Close without saving');
        x.addEventListener('click', close);
        head.appendChild(title); head.appendChild(x);

        var stage = el('div', 'pfi-stage');
        stage.appendChild(S.view);
        var markers = el('div', 'pfi-markers');
        stage.appendChild(markers);

        var swatches = el('div', 'pfi-swatches');
        var hint = el('div', 'pfi-hint', 'Drag a circle to pick a different colour.');

        var controls = el('div', 'pfi-controls');
        var method = el('select', 'pfi-method');
        method.title = 'Which colours to look for';
        method.setAttribute('aria-label', 'Method');
        METHOD_LIST.forEach(function (m) {
            var o = el('option', null, m[1]);
            o.value = m[0];
            method.appendChild(o);
        });
        method.value = S.method;
        method.addEventListener('change', function () { S.method = method.value; run(); });

        var stepper = el('div', 'pfi-count');
        stepper.title = 'How many colours';
        var minus = el('button', 'pfi-step btn--ghost btn--icon', '−');
        minus.type = 'button';
        minus.setAttribute('aria-label', 'Fewer colours');
        var val = el('span', 'pfi-count-val', String(S.count));
        val.setAttribute('aria-live', 'polite');
        var plus = el('button', 'pfi-step btn--ghost btn--icon', '+');
        plus.type = 'button';
        plus.setAttribute('aria-label', 'More colours');
        minus.addEventListener('click', function () { setCount(S.count - 1); });
        plus.addEventListener('click', function () { setCount(S.count + 1); });
        stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);

        var regen = el('button', 'pfi-regen btn--icon', '↻');
        regen.type = 'button';
        regen.title = 'Try other colours';
        regen.setAttribute('aria-label', 'Try other colours');
        regen.addEventListener('click', regenerate);

        controls.appendChild(method); controls.appendChild(stepper); controls.appendChild(regen);

        var foot = el('div', 'pfi-foot');
        var cancel = el('button', 'pfi-cancel btn--ghost', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', close);
        var save = el('button', 'pfi-save btn--emphasis', 'Save palette');
        save.type = 'button';
        save.addEventListener('click', savePalette);
        foot.appendChild(cancel); foot.appendChild(save);

        panel.appendChild(head); panel.appendChild(stage); panel.appendChild(swatches);
        panel.appendChild(hint); panel.appendChild(controls); panel.appendChild(foot);

        // Escape closes from anywhere in the panel, and stops there: the
        // app's own Escape handlers don't need to hear it.
        panel.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        });

        hostEl.innerHTML = '';
        hostEl.appendChild(panel);
        hostEl.hidden = false;
        S.el = { panel: panel, stage: stage, markers: markers, swatches: swatches, minus: minus, plus: plus, val: val, method: method };
    }

    function showError(label, msg) {
        var hostEl = host();
        if (!hostEl) return;
        var back = focusBack(hostEl);
        teardown();
        S = { label: label, error: true, items: [], returnFocus: back };
        var panel = el('div', 'pfi');
        panel.tabIndex = -1;
        var head = el('div', 'pfi-head');
        head.appendChild(el('span', 'pfi-title', label));
        var x = el('button', 'pfi-close btn--ghost btn--icon', '✕');
        x.type = 'button';
        x.title = 'Close';
        x.setAttribute('aria-label', 'Close');
        x.addEventListener('click', close);
        head.appendChild(x);
        panel.appendChild(head);
        panel.appendChild(el('div', 'pfi-error', msg));
        panel.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        });
        hostEl.innerHTML = '';
        hostEl.appendChild(panel);
        hostEl.hidden = false;
        S.el = { panel: panel };
        reveal(hostEl);
    }

    // The tags row sits right above the host, so the panel is usually in
    // view already. When the section is hidden (Simple layout) or the right
    // bar is folded, the host has no layout at all: bring the section back.
    function reveal(hostEl) {
        if (hostEl.offsetParent === null) {
            try { if (window.UIVisibility && window.UIVisibility.show) window.UIVisibility.show('section:Colors and palettes'); } catch (_) {}
            var sec = hostEl.closest && hostEl.closest('.sidebar-section');
            if (sec) {
                try {
                    if (typeof window.openSidebarSection === 'function') window.openSidebarSection(sec);
                    else sec.classList.remove('collapsed');
                } catch (_) { sec.classList.remove('collapsed'); }
            }
        }
        try { if (S && S.el && S.el.panel) S.el.panel.focus({ preventScroll: true }); } catch (_) {}
        try { hostEl.scrollIntoView({ block: 'nearest' }); } catch (_) {}
    }

    function setCount(n) {
        n = Math.max(COUNT_MIN, Math.min(COUNT_MAX, n));
        if (!S || n === S.count) return;
        S.count = n;
        run();
    }

    function run() {
        if (!S || !S.sample) return;
        S.items = extract(S.sample, { method: S.method, count: S.count, seed: S.seed });
        render();
    }

    function sameColours(a, b) {
        if (a.length !== b.length) return false;
        var C = cm();
        return a.every(function (x) {
            return b.some(function (y) { return C.deltaE(x.hex, y.hex) < DUP_DE; });
        });
    }

    // A new seed can land on the same colours (a picture with few of them,
    // or a Dominant pick that k-means always finds), so keep trying a few
    // before showing it: the button should never look like it did nothing.
    function regenerate() {
        if (!S || !S.sample) return;
        var items = S.items;
        for (var t = 0; t < 8; t++) {
            S.seed++;
            items = extract(S.sample, { method: S.method, count: S.count, seed: S.seed });
            if (!sameColours(items, S.items)) break;
        }
        S.items = items;
        render();
    }

    function render() {
        var E = S.el;
        E.markers.innerHTML = '';
        E.swatches.innerHTML = '';
        E.val.textContent = String(S.count);
        E.minus.disabled = S.count <= COUNT_MIN;
        E.plus.disabled = S.count >= COUNT_MAX;
        E.method.value = S.method;
        S.items.forEach(function (it, i) {
            var m = el('div', 'pfi-marker');
            m.title = 'Drag to pick a different colour';
            var sw = el('div', 'pfi-swatch');
            it.marker = m; it.swatch = sw;
            paint(it);
            m.addEventListener('pointerdown', function (e) { startDrag(e, it); });
            m.addEventListener('mouseenter', function () { hot(it, true); });
            m.addEventListener('mouseleave', function () { hot(it, false); });
            sw.addEventListener('mouseenter', function () { hot(it, true); });
            sw.addEventListener('mouseleave', function () { hot(it, false); });
            E.markers.appendChild(m);
            E.swatches.appendChild(sw);
            sw.dataset.index = String(i);
        });
    }

    function paint(it) {
        it.marker.style.left = (it.x * 100) + '%';
        it.marker.style.top = (it.y * 100) + '%';
        it.marker.style.backgroundColor = it.hex;
        it.swatch.style.backgroundColor = it.hex;
        it.swatch.title = it.hex;
    }

    function hot(it, on) {
        it.marker.classList.toggle('hot', on);
        it.swatch.classList.toggle('hot', on);
    }

    // The colour under a marker: a 3×3 average of the sample picture, so one
    // stray pixel of JPEG noise doesn't decide it.
    function sampleAt(x, y) {
        var s = S.sample, w = s.width, h = s.height, d = s.data;
        var cx = Math.min(w - 1, Math.floor(x * w)), cy = Math.min(h - 1, Math.floor(y * h));
        var r = 0, g = 0, b = 0, n = 0;
        for (var oy = -1; oy <= 1; oy++) {
            for (var ox = -1; ox <= 1; ox++) {
                var px = cx + ox, py = cy + oy;
                if (px < 0 || py < 0 || px >= w || py >= h) continue;
                var o = (py * w + px) * 4;
                if (d[o + 3] < 128) continue;
                r += d[o]; g += d[o + 1]; b += d[o + 2]; n++;
            }
        }
        return n ? cm().rgbToHex([r / n / 255, g / n / 255, b / n / 255]) : null;
    }

    function startDrag(e, it) {
        if (e.button !== 0 || !S) return;
        e.preventDefault();
        e.stopPropagation();
        var m = it.marker, id = e.pointerId;
        try { m.setPointerCapture(id); } catch (_) {}
        m.classList.add('dragging');
        hot(it, true);
        function move(ev) {
            if (ev.pointerId !== id || !S) return;
            var r = S.view.getBoundingClientRect();
            if (!r.width || !r.height) return;
            it.x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
            it.y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
            var hex = sampleAt(it.x, it.y);
            if (hex) it.hex = hex;
            paint(it);
        }
        function end(ev) {
            if (ev.pointerId !== id) return;
            m.classList.remove('dragging');
            var over = false;
            try { over = m.matches(':hover'); } catch (_) {}
            hot(it, over);
            m.removeEventListener('pointermove', move);
            m.removeEventListener('pointerup', end);
            m.removeEventListener('pointercancel', end);
            m.removeEventListener('lostpointercapture', end);
        }
        m.addEventListener('pointermove', move);
        m.addEventListener('pointerup', end);
        m.addEventListener('pointercancel', end);
        m.addEventListener('lostpointercapture', end);
    }

    function savePalette() {
        if (!S || S.error) { close(); return -1; }
        var hexes = S.items.map(function (it) { return it.hex; });
        var name = S.name;
        var idx = -1;
        if (typeof window.addPaletteFromColours === 'function' && hexes.length) {
            idx = window.addPaletteFromColours(name, hexes);
        }
        close();
        return idx;
    }

    function teardown() {
        if (!S) return;
        if (S.view) { S.view.width = 0; S.view.height = 0; }   // hand back its backing store now
        S.sample = null;
        S = null;
    }

    function close() {
        openToken++;
        var hostEl = host();
        var hadFocus = !!(hostEl && document.activeElement && hostEl.contains(document.activeElement));
        var back = S && S.returnFocus;
        teardown();
        if (hostEl) { hostEl.hidden = true; hostEl.innerHTML = ''; }
        if (hadFocus && back && back.isConnected && typeof back.focus === 'function') {
            try { back.focus({ preventScroll: true }); } catch (_) {}
        }
    }

    window.PaletteFromImage = {
        openFile: openFile,
        pickFile: pickFile,
        openCanvas: openCanvas,
        close: close,
        isOpen: function () { return !!S; },
        extract: extract
    };
})(typeof window !== 'undefined' ? window : globalThis);
