// scripts/theme/bake-deco-herringbone-tile.js — one-off bake of the drawer
// fronts' ground: the boot sunrise's veneer (scripts/theme/bake-deco-sunburst.js)
// laid flat and small. Same painted walnut, same blue filter, same folded
// chevrons; here the "rays" are straight columns, so the drawer fronts repeat
// the herringbone the boot screens fan out (2026-10-18).
//
// A seamless tile, baked at 2x (css/35 draws it at half size):
//   columns  TILE_W holds two chevron columns, each folded down its centre
//            line (the two halves mirror, the lit half alternates).
//   planks   strips at 45 degrees, width W; plank seeds are taken modulo the
//            tile's own plank counts, so a plank cut by the tile's edge
//            carries on with the same grain on the other side.
//
//   node scripts/theme/bake-deco-herringbone-tile.js
'use strict';
const path = require('path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'design/textures/painted-walnut-source.jpg');
const OUT = path.join(ROOT, 'assets/textures/deco-herringbone-tile.jpg');

const P = 20;                         // strip pitch, measured down the column
const W = P / Math.SQRT2;             // plank width across the grain (~14 tile px, 7 CSS px)
const PL = 4;                         // plank length / width
const N = 12;                         // strips per tile height (multiple of PL)
const M = N / PL;                     // plank lengths per strip per tile
const COL = 84;                       // column width (tile px)
const TILE_W = 2 * COL;
const TILE_H = N * P;                 // 240: whole pixels, so the tile repeats exactly
const SC = 2.6;                       // texels per tile px
const SS = 3;
const LO = [5, 9, 16], HI = [70, 96, 130];       // a step darker than the sunrise

function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;

(async () => {
    const { data: tex, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const TW = info.width, TH = info.height;
    const lum = new Float32Array(TW * TH);
    let lo = 1, hi = 0;
    for (let i = 0; i < TW * TH; i++) {
        const y = (0.2126 * tex[i * 3] + 0.7152 * tex[i * 3 + 1] + 0.0722 * tex[i * 3 + 2]) / 255;
        lum[i] = y; if (y < lo) lo = y; if (y > hi) hi = y;
    }
    for (let i = 0; i < lum.length; i++) lum[i] = (lum[i] - lo) / (hi - lo);
    const mirror = (x, n) => { x = ((x % (2 * n)) + 2 * n) % (2 * n); return x < n ? x : 2 * n - 1 - x; };
    function sample(x, y) {
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const a = lum[mirror(y0, TH) * TW + mirror(x0, TW)], b = lum[mirror(y0, TH) * TW + mirror(x0 + 1, TW)];
        const c = lum[mirror(y0 + 1, TH) * TW + mirror(x0, TW)], d = lum[mirror(y0 + 1, TH) * TW + mirror(x0 + 1, TW)];
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }

    function shade(px, py) {
        const k = Math.floor(px / COL);
        const v = px - (k + 0.5) * COL;               // across the column
        const side = v >= 0 ? 1 : -1, va = Math.abs(v);
        // Chevrons point up the column (strips between lines y + va = c).
        // Measured in pitch units down the column (not across the grain) so
        // a whole tile height is a whole number of strips and plank lengths.
        const across = py + va, along = va - py;
        const L = P * PL;
        const si = Math.floor(across / P), siw = mod(si, N);
        const segOff = hash(siw, 1, 7) * L;
        const sj = Math.floor((along + segOff) / L), sjw = mod(sj + si, M);
        const seed = hash(siw * 31 + sjw, mod(k, 2) * 17 + (side > 0 ? 5 : 0), 3);
        const tx = (across - si * P) / Math.SQRT2 * SC + seed * TW * 3;
        const ty = (along + segOff - sj * L) / Math.SQRT2 * SC + hash(siw, sjw, 11 + side) * TH * 3;
        let g = 0.18 + 0.82 * sample(tx, ty);
        g *= 0.86 + 0.22 * seed;
        g *= (side * (k % 2 ? 1 : -1) > 0) ? 1.10 : 0.84;
        let col = LO.map((c, i) => c + (HI[i] - c) * g);
        const sAcross = Math.min(across - si * P, (si + 1) * P - across) / Math.SQRT2;
        const sAlong = Math.min(along + segOff - sj * L, (sj + 1) * L - along - segOff) / Math.SQRT2;
        if (Math.min(sAcross, sAlong) < 0.9) col = col.map(c => c * 0.55);
        const edge = COL / 2 - va;                    // column border
        if (edge < 1.2 || va < 0.6) col = col.map(c => c * 0.6);
        return col;
    }

    const out = Buffer.alloc(TILE_W * TILE_H * 3);
    for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TILE_W; x++) {
        let R = 0, G = 0, B = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
            const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
            R += c[0]; G += c[1]; B += c[2];
        }
        const n = SS * SS, o = (y * TILE_W + x) * 3;
        out[o] = R / n; out[o + 1] = G / n; out[o + 2] = B / n;
    }
    const i = await sharp(out, { raw: { width: TILE_W, height: TILE_H, channels: 3 } })
        .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(OUT);
    console.log('wrote ' + path.relative(ROOT, OUT) + ' ' + i.width + 'x' + i.height + ' ' + i.size + ' bytes');
})().catch(e => { console.error(e); process.exit(1); });
