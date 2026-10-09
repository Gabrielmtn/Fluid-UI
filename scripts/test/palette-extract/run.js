// Palette from an image (js/65): the colour finder on its own, in Node.
//   node scripts/test/palette-extract/run.js
// Synthetic pictures with known answers. No browser, no dependencies.
// Exit code 1 if any check failed.
'use strict';
const path = require('path');
const { extract } = require('../../../js/65-palette-from-image.js');
const CM = require('../../../js/64a-colour-math.js');

let failed = 0;
function check(name, ok, detail) {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
    if (!ok) failed++;
}

// A seeded generator for the test pictures themselves.
function rng(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function image(w, h, fn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c = fn(x, y), o = (y * w + x) * 4;
            data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c.length > 3 ? c[3] : 255;
        }
    }
    return { data, width: w, height: h };
}
const hexOf = c => CM.rgbToHex([c[0] / 255, c[1] / 255, c[2] / 255]);
const chroma = hex => CM.hexToOklch(hex)[1];
const light = hex => CM.hexToOklch(hex)[0];
function minPairDE(items) {
    let m = Infinity;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) m = Math.min(m, CM.deltaE(items[i].hex, items[j].hex));
    return m;
}
const METHODS = ['dominant', 'bright', 'muted', 'deep', 'dark'];

// (a) Four solid quadrants come back exactly, a quarter each, with each
// marker inside its own quadrant.
{
    const Q = [[230, 40, 30], [30, 160, 70], [40, 70, 220], [250, 210, 40]];
    const img = image(80, 60, (x, y) => Q[(y < 30 ? 0 : 2) + (x < 40 ? 0 : 1)]);
    const out = extract(img, { method: 'dominant', count: 4, seed: 0 });
    const want = Q.map(hexOf);
    const matched = want.map(h => out.find(o => CM.deltaE(o.hex, h) < 0.01));
    check('quadrants: four colours back', out.length === 4 && matched.every(Boolean), out.map(o => o.hex).join(' '));
    check('quadrants: weights about 0.25', out.every(o => Math.abs(o.weight - 0.25) < 0.01), out.map(o => o.weight.toFixed(3)).join(' '));
    const inside = Q.every((q, i) => {
        const o = matched[i];
        if (!o) return false;
        const qx = i % 2, qy = i < 2 ? 0 : 1;
        return o.x > qx * 0.5 && o.x < qx * 0.5 + 0.5 && o.y > qy * 0.5 && o.y < qy * 0.5 + 0.5;
    });
    check('quadrants: each marker sits in its quadrant', inside, out.map(o => o.x.toFixed(2) + ',' + o.y.toFixed(2)).join(' '));
    const deep = matched.every(o => o && Math.abs((o.x * 2) % 1 - 0.5) < 0.1 && Math.abs((o.y * 2) % 1 - 0.5) < 0.1);
    check('quadrants: markers near the middle of their patch', deep);
}

// (b) A gradient: the count is honoured and no two colours are closer than
// ΔE 0.02, for every method and count.
{
    const img = image(160, 120, (x, y) => {
        const t = x / 159, u = y / 119;
        return [Math.round(255 * t), Math.round(255 * (1 - t) * (1 - u * 0.5)), Math.round(255 * u)];
    });
    let countOk = true, spreadOk = true, worst = Infinity, bad = '';
    for (const m of METHODS) {
        for (let n = 3; n <= 12; n++) {
            const out = extract(img, { method: m, count: n, seed: 0 });
            if (out.length !== n) { countOk = false; bad = m + ' ' + n + ' gave ' + out.length; }
            const d = minPairDE(out);
            worst = Math.min(worst, d);
            if (d < 0.02) spreadOk = false;
        }
    }
    check('gradient: count honoured (3..12, all methods)', countOk, bad);
    check('gradient: no two colours within ΔE 0.02', spreadOk, 'closest pair ' + worst.toFixed(4));
}

// (c) Deterministic per seed; other seeds find other colours.
{
    const r = rng(7);
    const img = image(160, 120, (x, y) => {
        const blob = Math.sin(x / 13) + Math.cos(y / 9);
        return [Math.round(127 + 100 * Math.sin(blob * 2)), Math.round(127 + 90 * Math.cos(blob * 3 + x / 40)), Math.round(110 + 80 * Math.sin(y / 20) + 30 * r())];
    });
    let same = true;
    for (const m of METHODS) {
        for (const s of [0, 1, 42]) {
            const a = JSON.stringify(extract(img, { method: m, count: 6, seed: s }));
            const b = JSON.stringify(extract(img, { method: m, count: 6, seed: s }));
            if (a !== b) same = false;
        }
    }
    check('determinism: same seed, same output', same);
    const base = JSON.stringify(extract(img, { method: 'dominant', count: 5, seed: 0 }).map(o => o.hex));
    let differ = 0;
    for (let s = 1; s <= 5; s++) if (JSON.stringify(extract(img, { method: 'dominant', count: 5, seed: s }).map(o => o.hex)) !== base) differ++;
    check('determinism: other seeds find other colours', differ > 0, differ + ' of 5 seeds differ from seed 0');
}

// (d) Bright reaches for chroma, Muted away from it, on a picture of
// saturated patches beside grey ones.
{
    const sat = [[235, 30, 40], [30, 90, 240], [40, 200, 60], [250, 200, 20]];
    const grey = [[200, 198, 195], [140, 140, 142], [90, 92, 90], [225, 222, 215]];
    const img = image(160, 120, (x, y) => {
        const cell = Math.floor(x / 40) + 4 * Math.floor(y / 60);
        return cell < 4 ? sat[cell] : grey[cell - 4];
    });
    const avgC = arr => arr.reduce((s, o) => s + chroma(o.hex), 0) / arr.length;
    const bright = extract(img, { method: 'bright', count: 3, seed: 0 });
    const muted = extract(img, { method: 'muted', count: 3, seed: 0 });
    check('bright vs muted: bright has more chroma', avgC(bright) > avgC(muted) + 0.05,
        'bright C ' + avgC(bright).toFixed(3) + ', muted C ' + avgC(muted).toFixed(3));
    check('bright vs muted: muted picks the greys', muted.every(o => chroma(o.hex) < 0.03), muted.map(o => o.hex).join(' '));
    const deep = extract(img, { method: 'deep', count: 3, seed: 0 });
    const dark = extract(img, { method: 'dark', count: 3, seed: 0 });
    const avgL = arr => arr.reduce((s, o) => s + light(o.hex), 0) / arr.length;
    check('deep and dark sit below bright and muted in lightness',
        avgL(dark) < avgL(muted) && avgL(deep) < avgL(bright),
        'L bright ' + avgL(bright).toFixed(2) + ' muted ' + avgL(muted).toFixed(2) + ' deep ' + avgL(deep).toFixed(2) + ' dark ' + avgL(dark).toFixed(2));
}

// (e) One colour in, one colour out.
{
    const img = image(64, 48, () => [90, 140, 200]);
    const out = extract(img, { method: 'dominant', count: 5, seed: 0 });
    check('one colour: count 5 returns 1', out.length === 1 && CM.deltaE(out[0].hex, hexOf([90, 140, 200])) < 0.005 && Math.abs(out[0].weight - 1) < 1e-9,
        out.map(o => o.hex + ' ' + o.weight).join(' '));
    const all = METHODS.every(m => extract(img, { method: m, count: 12, seed: 3 }).length === 1);
    check('one colour: every method, count 12, returns 1', all);
}

// Transparent pixels are not colours; an empty picture is no colours.
{
    const img = image(40, 40, (x) => x < 20 ? [255, 0, 0, 20] : [0, 0, 255, 255]);
    const out = extract(img, { method: 'dominant', count: 5, seed: 0 });
    check('alpha: pixels under 128 are skipped', out.length === 1 && out[0].hex === '#0000FF' && out[0].x > 0.5, out.map(o => o.hex).join(' '));
    const none = extract(image(10, 10, () => [0, 0, 0, 0]), { count: 5 });
    check('alpha: a fully transparent picture gives nothing', Array.isArray(none) && none.length === 0);
    check('bad input gives nothing', extract(null, {}).length === 0 && extract({ data: [], width: 0, height: 0 }, {}).length === 0);
}

// Order and shape: Dominant largest first, the rest light to dark; x, y in
// 0-1; shares add to at most 1.
{
    const r = rng(11);
    const img = image(120, 90, (x, y) => {
        const band = Math.floor(x / 20);
        const base = [[20, 30, 60], [200, 60, 50], [240, 230, 210], [70, 140, 90], [150, 110, 200], [30, 30, 30]][band];
        const k = 1 + (y < 30 ? 0.0 : 0.1) * (r() - 0.5);
        return base.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    });
    let orderOk = true, shapeOk = true;
    for (const m of METHODS) {
        const out = extract(img, { method: m, count: 5, seed: 0 });
        for (let i = 1; i < out.length; i++) {
            if (m === 'dominant' ? out[i].weight > out[i - 1].weight + 1e-12 : light(out[i].hex) > light(out[i - 1].hex) + 0.005) orderOk = false;
        }
        const sum = out.reduce((s, o) => s + o.weight, 0);
        if (sum > 1 + 1e-9 || out.some(o => !(o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1) || !/^#[0-9A-F]{6}$/.test(o.hex))) shapeOk = false;
    }
    check('order: dominant by share, the rest light to dark', orderOk);
    check('shape: hex, x and y in 0-1, shares sum to 1 or less', shapeOk);
}

// (f) Speed: a 160×120 picture of noise, the worst case for the histogram
// (every bin in use).
{
    const r = rng(3);
    const img = image(160, 120, () => [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)]);
    let t = process.hrtime.bigint();
    extract(img, { method: 'dominant', count: 5, seed: 0 });
    const cold = Number(process.hrtime.bigint() - t) / 1e6;
    const times = [];
    for (const m of METHODS) {
        for (const n of [5, 12]) {
            t = process.hrtime.bigint();
            extract(img, { method: m, count: n, seed: 1 });
            times.push(Number(process.hrtime.bigint() - t) / 1e6);
        }
    }
    times.sort((a, b) => a - b);
    const worst = times[times.length - 1], median = times[times.length >> 1];
    check('speed: 160×120 noise under 60 ms', cold < 60 && worst < 60,
        'first ' + cold.toFixed(1) + ' ms, median ' + median.toFixed(1) + ' ms, worst ' + worst.toFixed(1) + ' ms');
}

console.log('');
console.log(failed ? failed + ' check(s) FAILED' : 'All checks passed');
process.exit(failed ? 1 : 0);
