// scripts/theme/bake-deco-sunburst.js — one-off bake of the boot screens'
// ground: an art-deco sunrise of book-matched herringbone veneer cut from
// Gabriel's painted walnut (design/textures/painted-walnut-source.jpg),
// toned blue so the copper and the cream type sit on it (2026-10-18).
//
// Geometry, from the sun outwards:
//   rays    N wedges fan up from a sun just below the bottom edge. Each wedge
//           is folded down its centre line: the two halves are mirror images
//           (book-matched veneer), and the lit half alternates wedge to
//           wedge, so the fan reads as pleats catching a light.
//   rings   the wedges are cut into bands whose radii grow by G each step.
//   planks  inside each band the veneer is herringbone: chevrons pointing
//           down the ray, plank width a fixed fraction of the band's radius.
//           Every band is the band inside it scaled by G, grain included,
//           which is what makes the herringbone recursive: the same chevrons
//           at every scale, shrinking into the sun.
// Seams are darkened; copper inlay runs along wedge and ring borders. The
// sidebars' herringbone (css/30) picks the motif up again later.
//
// Static on purpose: the first thing anyone sees is the seizure warning, so
// nothing here moves, and the contrast between neighbouring planks stays low
// (repeating high-contrast stripes are themselves a photosensitive trigger).
//
//   node scripts/theme/bake-deco-sunburst.js
'use strict';
const path = require('path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'design/textures/painted-walnut-source.jpg');
const OUT = path.join(ROOT, 'assets/textures/deco-sunburst-2560.jpg');

const W = 2560, H = 1600, SS = 2;            // output size, supersampling
const CX = W / 2, CY = H + 60;               // the sun, just under the edge
const N = 28;                                // rays across the full circle
const DA = 2 * Math.PI / N;
const R0 = 150, G = 1.55;                    // sun radius, ring growth
const PLANK = 0.075;                         // plank width / band radius
const PLANK_LEN = 4.5;                       // plank length / plank width
const TEX_PER_R = 1100;                      // texels per band radius
const SEAM_PX = 0.9, INLAY_PX = 1.6;

// Blue filter: grain luminance onto a slate ramp (dark navy -> steel).
const LO = [5, 9, 16], HI = [84, 114, 152];
const COPPER = [196, 122, 75];

function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

(async () => {
    const { data: tex, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const TW = info.width, TH = info.height;
    // Luminance once, normalised so the painting's own range fills 0..1.
    const lum = new Float32Array(TW * TH);
    let lo = 1, hi = 0;
    for (let i = 0; i < TW * TH; i++) {
        const y = (0.2126 * tex[i * 3] + 0.7152 * tex[i * 3 + 1] + 0.0722 * tex[i * 3 + 2]) / 255;
        lum[i] = y; if (y < lo) lo = y; if (y > hi) hi = y;
    }
    for (let i = 0; i < lum.length; i++) lum[i] = (lum[i] - lo) / (hi - lo);
    // Mirrored wrap hides the scan's edges when an offset runs off them.
    const mirror = (x, n) => { x = ((x % (2 * n)) + 2 * n) % (2 * n); return x < n ? x : 2 * n - 1 - x; };
    function sample(x, y) {
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const a = lum[mirror(y0, TH) * TW + mirror(x0, TW)], b = lum[mirror(y0, TH) * TW + mirror(x0 + 1, TW)];
        const c = lum[mirror(y0 + 1, TH) * TW + mirror(x0, TW)], d = lum[mirror(y0 + 1, TH) * TW + mirror(x0 + 1, TW)];
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }

    // One sub-sample: returns [r, g, b] 0..255.
    function shade(px, py) {
        const dx = px - CX, dy = py - CY;
        const r = Math.hypot(dx, dy);
        let th = Math.atan2(dy, dx); if (th < 0) th += 2 * Math.PI;
        const k = Math.floor(th / DA);
        const phi = th - (k + 0.5) * DA;
        const u = r * Math.cos(phi), v = r * Math.sin(phi);
        const side = v >= 0 ? 1 : -1, va = Math.abs(v);

        // Sun: a dark copper-rimmed disc.
        // Sun: a dark disc of thin concentric copper rings (stepped deco).
        if (r < R0) {
            const rim = R0 - r;
            if (rim < INLAY_PX * 1.5) return COPPER.map(c => c * 0.75);
            const step = R0 / 7, d = Math.min(r % step, step - (r % step));
            if (d < 0.7 && r > step) return COPPER.map(c => c * 0.38);
            const t = r / R0;
            return LO.map((c, i) => c + (HI[i] - c) * 0.14 * (1 - t));
        }
        const j = Math.floor(Math.log(r / R0) / Math.log(G));
        const Rj = R0 * Math.pow(G, j);
        const w = Rj * PLANK, L = w * PLANK_LEN;
        // Herringbone in the folded half: strips between lines u - va = c.
        const across = (u - va) / Math.SQRT2, along = (u + va) / Math.SQRT2;
        const si = Math.floor(across / w);
        const segOff = hash(si, j, 7) * L;               // staggered end joints
        const sj = Math.floor((along + segOff) / L);
        const seed = hash(si * 31 + sj, j * 17 + k, 3);
        // Grain runs along the plank; the painting's strokes are vertical.
        const sc = TEX_PER_R / Rj;
        const tx = (across - si * w) * sc + seed * TW * 3;
        const ty = (along + segOff - sj * L) * sc + hash(si, sj, j + 11) * TH * 3;
        let g = sample(tx, ty);
        g = 0.18 + 0.82 * g;
        // Plank-to-plank tone, then the fold's light: one half of every
        // wedge leans to the light, alternating wedge to wedge.
        g *= 0.86 + 0.22 * seed;
        g *= (side * (k % 2 ? 1 : -1) > 0) ? 1.12 : 0.80;
        // Key light from the sun, falling off up the screen.
        g *= 0.55 + 0.75 * Math.exp(-Math.pow((r - R0) / (H * 0.95), 2));

        // Seams (dark) and inlay (copper), widths in output pixels.
        const sAcross = Math.min(across - si * w, (si + 1) * w - across);
        const sAlong = Math.min(along + segOff - sj * L, (sj + 1) * L - along - segOff);
        const seam = Math.min(sAcross, sAlong / 1);
        let col = LO.map((c, i) => c + (HI[i] - c) * g);
        if (seam < SEAM_PX) col = col.map(c => c * 0.55);
        const edge = r * Math.sin(DA / 2) - va;          // to the wedge border
        const ring = Math.min(r - Rj, Rj * G - r);
        if (edge < INLAY_PX || ring < INLAY_PX) {
            // Bright by the sun, fading to a dull rule at the edges; rings
            // a step quieter than the rays so the fan leads, not a grid.
            let lift = 0.30 + 0.45 * Math.exp(-Math.pow((r - R0) / (H * 0.7), 2));
            if (edge >= INLAY_PX) lift *= 0.7;
            const a = 0.85;
            col = col.map((c, i) => c * (1 - a) + COPPER[i] * lift * a);
        } else if (edge < INLAY_PX + 1.2 || ring < INLAY_PX + 1.2) {
            col = col.map(c => c * 0.5);                 // shadow beside the inlay
        }
        if (va < 0.6) col = col.map(c => c * 0.7);       // the fold itself
        return col;
    }

    const out = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let R = 0, Gc = 0, B = 0;
            for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
                const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
                R += c[0]; Gc += c[1]; B += c[2];
            }
            const n = SS * SS, o = (y * W + x) * 3;
            out[o] = Math.min(255, R / n); out[o + 1] = Math.min(255, Gc / n); out[o + 2] = Math.min(255, B / n);
        }
    }
    const i = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
        .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(OUT);
    console.log('wrote ' + path.relative(ROOT, OUT) + ' ' + i.width + 'x' + i.height + ' ' + i.size + ' bytes');
})().catch(e => { console.error(e); process.exit(1); });
