// ═══════════════════════════════════════════════════════════════════
// scripts/trailer-beats.js — where the trailer's cuts can land in a
// music track.
//
//   node scripts/trailer-beats.js <audio> [beatSecs]
//
// Writes <audio>.beats.json beside the track: every beat, and the strong
// bass notes (`strong`), which `bake-trailer.js assemble` snaps its
// crossfades to. Pure Node, ffmpeg for the decode.
//
// How: an onset envelope (rise in loudness plus rise in brightness, per
// 10 ms), Ellis's dynamic-programming beat tracker at the given beat length
// (Gymnopédie at this pianist's pace: 0.67 s, found by autocorrelating the
// envelope), then the bass under 120 Hz on each beat. A beat whose bass
// rise beats both neighbours' is a "strong" one: in a 3/4 waltz bass that
// is the downbeat. Rubato can shift the bar grid by a beat mid-piece
// (Gymnopédie does near 104 s), so cuts use the strong beats, not a grid.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const FF = process.env.FFMPEG || 'C:/Users/Gabri/ffmpeg-2023-09-07-git-9c9f48e7f2-full_build/bin/ffmpeg.exe';
const SR = 22050, HOP = 220, WIN = 1024, fps = SR / HOP;
const BASS_HZ = 120;

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/trailer-beats.js <audio> [beatSecs]'); process.exit(1); }
const r = spawnSync(FF, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);

// The bass: a two-pole lowpass.
const lp = new Float32Array(x.length);
{
    const a = Math.exp(-2 * Math.PI * BASS_HZ / SR);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { y1 = (1 - a) * x[i] + a * y1; y2 = (1 - a) * y1 + a * y2; lp[i] = y2; }
}
// Per hop: log loudness, log brightness (first difference), linear bass.
const n = Math.floor((x.length - WIN) / HOP);
const e = new Float32Array(n), eh = new Float32Array(n), eb = new Float32Array(n);
for (let i = 0; i < n; i++) {
    let s = 0, sh = 0, sb = 0;
    const o = i * HOP;
    for (let k = 1; k < WIN; k++) { const v = x[o + k]; s += v * v; const d = v - x[o + k - 1]; sh += d * d; sb += lp[o + k] * lp[o + k]; }
    e[i] = Math.log(1e-9 + s / WIN); eh[i] = Math.log(1e-9 + sh / WIN); eb[i] = sb / WIN;
}
// Onsets: rises over 30 ms. The bass rise stays linear: in log, a chord's
// leak into the bass band rises as far as a real bass note does.
const flux = new Float32Array(n), bflux = new Float32Array(n);
for (let i = 3; i < n; i++) {
    flux[i] = Math.max(0, e[i] - e[i - 3]) + Math.max(0, eh[i] - eh[i - 3]);
    bflux[i] = Math.max(0, eb[i] - eb[i - 3]);
}
let sd = 0;
for (const v of flux) sd += v * v;
sd = Math.sqrt(sd / n);
const O = flux.map((v) => v / sd);

// Beats: each beat's score is its onset plus the best earlier beat's, less
// a penalty for straying from the beat length.
const P = (+(process.argv[3] || 0.67)) * fps, alpha = 100;
const C = new Float32Array(n), back = new Int32Array(n).fill(-1);
for (let i = 0; i < n; i++) {
    let best = -1e9, bj = -1;
    for (let j = Math.max(0, Math.round(i - 2 * P)); j <= i - Math.round(P / 2); j++) {
        const sc = C[j] - alpha * Math.pow(Math.log((i - j) / P), 2);
        if (sc > best) { best = sc; bj = j; }
    }
    C[i] = O[i] + (bj >= 0 ? Math.max(0, best) : 0);
    back[i] = bj >= 0 && best > 0 ? bj : -1;
}
let end = Math.max(0, n - Math.round(2 * P));
for (let i = end; i < n; i++) if (C[i] > C[end]) end = i;
const beats = [];
for (let i = end; i >= 0; i = back[i]) { beats.unshift(+(i / fps).toFixed(3)); if (back[i] < 0) break; }

// Strong beats: the bass rise on a beat beats both neighbours'.
const bassAt = (t) => { const i = Math.round(t * fps); let m = 0; for (let k = -3; k <= 3; k++) m = Math.max(m, bflux[i + k] || 0); return m; };
const bass = beats.map(bassAt);
const strong = beats
    .map((t, k) => ({ t: t, s: +(bass[k] * 1e6).toFixed(0) }))
    .filter((b, k) => k > 0 && k < beats.length - 1 && bass[k] >= bass[k - 1] && bass[k] >= bass[k + 1] && b.s > 30);

const out = file + '.beats.json';
fs.writeFileSync(out, JSON.stringify({ file: file, secs: +(x.length / SR).toFixed(3), beat: P / fps, beats: beats, strong: strong }));
console.log(beats.length + ' beats, ' + strong.length + ' strong, ' + (x.length / SR).toFixed(1) + ' s -> ' + out);
