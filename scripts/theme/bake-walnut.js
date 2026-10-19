// scripts/theme/bake-walnut.js — one-off bake of the Walnut & Copper stain
// into the herringbone texture (no blend modes at runtime).
//
// The study's console shader stains the oak scan as
//   alb = tex * mix(vec3(.9,.86,.8), vec3(.36,.27,.22), 0.72)
//       = tex * vec3(.5112, .4352, .3824)  ~= tex * rgb(130, 111, 97) / 255
// The shader then lights it: col = alb * (amb + lc*nl + ...). There is no
// multiply at runtime (no blend modes), so the average warm light is baked in
// too: measured from the study at 1440 px (mean lit wood 98.7, 57.1, 30.3 over
// a baked-albedo mean of 74.6, 48.1, 28.9) it is (1.32, 1.19, 1.05).
// This multiplies assets/textures/herringbone-2048.jpg by stain x light and
// writes assets/textures/herringbone-walnut-2048.jpg and its mirror image.
//
//   node scripts/theme/bake-walnut.js
'use strict';
const path = require('path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '../..');
const src = path.join(ROOT, 'assets/textures/herringbone-2048.jpg');
const out = path.join(ROOT, 'assets/textures/herringbone-walnut-2048.jpg');
const mix = (a, b, t) => a + (b - a) * t;
const LIGHT = [1.32, 1.19, 1.05];
const k = [mix(0.9, 0.36, 0.72) * LIGHT[0], mix(0.86, 0.27, 0.72) * LIGHT[1], mix(0.8, 0.22, 0.72) * LIGHT[2]];
// Contrast 1.3 around the lit mean (the study's grain reads deeper and its
// highlights brighter than a flat multiply gives); the mean stays put.
const C = 1.3, MEAN = [98.7, 57.1, 30.3];
// 2026-10-18: the whole wood 25% darker so text on it (modals, sidebars, the
// top bar) reads; scales the final value, grain contrast unchanged.
const DARKEN = 0.75;
// 2026-10-18: also its mirror image (-flop.jpg). The right sidebar and the
// right half of the top bar are laid from the window's right edge in the
// mirrored veneer, book-matched to the left (css/30, css/33).
const outFlop = out.replace(/\.jpg$/, '-flop.jpg');
sharp(src).removeAlpha().linear(k.map(x => x * C * DARKEN), MEAN.map(m => -(C - 1) * m * DARKEN)).jpeg({ quality: 90, mozjpeg: true }).toFile(out)
    .then(i => console.log('wrote ' + path.relative(ROOT, out) + ' ' + i.width + 'x' + i.height + ' ' + i.size + ' bytes; multiplier ' + k.map(x => (x * 255).toFixed(1)).join(', ')))
    .then(() => sharp(out).flop().jpeg({ quality: 90, mozjpeg: true }).toFile(outFlop))
    .then(i => console.log('wrote ' + path.relative(ROOT, outFlop) + ' ' + i.size + ' bytes'))
    .catch(e => { console.error(e); process.exit(1); });
