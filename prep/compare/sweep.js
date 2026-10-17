// prep/compare/sweep.js — every drawer, app vs study, side by side.
//
//   node prep/compare/sweep.js            # 1920
//   WIDTHS=1440 node prep/compare/sweep.js
//
// Writes prep/compare/sweep-<width>/<name>-pair.png (app left, study right),
// each drawer opened alone and captured whole (front + tray), past the
// viewport if needed. Uses the repo's headless driver; the study is loaded
// into the browser only, never read as text.
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { boot, sleep } = require('../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../..');
const WIDTHS = (process.env.WIDTHS || '1920').split(',').map(Number);
const H = { 1920: 1080, 1440: 900, 1366: 768, 2560: 1440 };

// [name, app sidebar, app title regex, study section id]
const PAIRS = [
    ['brush', '#sidebar-left', '^\\s*Brush\\s*$', 'sp-brush'],
    ['multibrush', '#sidebar-left', 'Multi', 'sp-multi'],
    ['stroke', '#sidebar-left', 'Stroke', 'sp-input'],
    ['room', '#sidebar-right', 'Swirl', 'sp-room'],
    ['simulation', '#sidebar-right', 'Simulation', 'sp-grav'],
    ['colors', '#sidebar-right', 'Colou?rs', 'sp-light'],
    ['layers', '#sidebar-right', 'Layers', 'sp-layers'],
    ['mutate', '#sidebar-right', 'Mutate', 'sp-mutate'],
    ['effects', '#sidebar-right', 'Effects', 'sp-effects'],
    ['animations', '#sidebar-right', 'Animations', 'sp-anim'],
    ['audio', '#sidebar-right', 'Audio', 'sp-gates'],
    ['timing', '#sidebar-right', 'Audio', 'sp-timing'],
    ['kaleido', '#sidebar-right', 'Kaleido', 'sp-kaleido'],
    ['text', '#sidebar-right', '^\\s*Text', 'sp-text'],
    ['focus', '#sidebar-right', 'Focus', 'sp-focus'],
    ['display', '#sidebar-right', 'Display', 'sp-display'],
    ['export', '#sidebar-right', 'Export', 'sp-export'],
    ['settings', '#sidebar-right', 'Settings', 'sp-settings'],
];

async function shot(d, fnSrc, file) {
    const get = `(function(){ var e = (${fnSrc})(); if (!e) return null; var b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`;
    const r0 = await d.ev(`(function(){ var e = (${fnSrc})(); if (e) e.scrollIntoView({ block: 'start' }); return !!e; })()`);
    if (!r0) { console.log('  missing ' + path.basename(file)); return null; }
    await sleep(350);
    const r = await d.ev(get);
    if (!r || r.w < 2) { console.log('  empty ' + path.basename(file)); return null; }
    const s = await d.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 3000), scale: 1 } });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    return file;
}

async function pair(dir, name) {
    const a = path.join(dir, name + '-app.png'), b = path.join(dir, name + '-study.png');
    const have = [a, b].filter(f => fs.existsSync(f));
    if (!have.length) return;
    const metas = await Promise.all(have.map(f => sharp(f).metadata()));
    const W = metas.reduce((s, m) => s + m.width, 0) + 12 * (have.length - 1);
    const Hh = Math.max.apply(null, metas.map(m => m.height));
    let x = 0; const comp = [];
    have.forEach((f, i) => { comp.push({ input: f, left: x, top: 0 }); x += metas[i].width + 12; });
    await sharp({ create: { width: W, height: Hh, channels: 3, background: '#000' } }).composite(comp).png().toFile(path.join(dir, name + '-pair.png'));
}

(async () => {
    const d = await boot({ args: ['--disable-gpu-compositing'] });
    try {
        for (const w of WIDTHS) {
            const dir = path.join(ROOT, 'prep', 'compare', 'sweep-' + w);
            fs.mkdirSync(dir, { recursive: true });
            await d.send('Emulation.setDeviceMetricsOverride', { width: w, height: H[w] || 900, deviceScaleFactor: 1, mobile: false });
            await d.load();
            await sleep(800);
            const titles = await d.ev(`[].slice.call(document.querySelectorAll('#sidebar-left .section-title, #sidebar-right .section-title')).map(function(t){ return (t.closest('#sidebar-left') ? 'L ' : 'R ') + t.textContent.trim().replace(/\\s+/g, ' '); })`);
            console.log('app drawers: ' + titles.join(' | '));
            for (const [name, bar, re] of PAIRS) {
                const ok = await d.ev(`(async function(){
                    var re = new RegExp(${JSON.stringify(re)}, 'i');
                    var t = [].slice.call(document.querySelectorAll('${bar} .section-title')).find(function(x){ return re.test(x.textContent.trim()); });
                    if (!t) return false;
                    document.querySelectorAll('#sidebar-left .section-title[aria-expanded="true"], #sidebar-right .section-title[aria-expanded="true"]').forEach(function(o){ if (o !== t) o.click(); });
                    if (t.getAttribute('aria-expanded') !== 'true') t.click();
                    await new Promise(function(r){ setTimeout(r, 700); });
                    window.__sweepSec = t.closest('.sidebar-section');
                    return true; })()`);
                if (!ok) { console.log('  no app drawer for ' + name); continue; }
                await shot(d, 'function(){ return window.__sweepSec; }', path.join(dir, name + '-app.png'));
            }
            await d.send('Page.navigate', { url: d.url.replace(/index\.html$/, 'design/walnut-copper-study.html') });
            await sleep(3500);
            for (const [name, , , id] of PAIRS) {
                const ok = await d.ev(`(async function(){
                    document.querySelectorAll('.dfront[aria-expanded="true"]').forEach(function(b){ b.click(); });
                    await new Promise(function(r){ setTimeout(r, 400); });
                    var b = document.querySelector('#${id} .dfront'); if (!b) return false; b.click();
                    await new Promise(function(r){ setTimeout(r, 1200); }); return true; })()`);
                if (!ok) { console.log('  no study drawer ' + id); continue; }
                await shot(d, `function(){ var h = document.getElementById('${id}'); return h && (h.closest('section') || h.parentElement.parentElement); }`, path.join(dir, name + '-study.png'));
            }
            for (const [name] of PAIRS) await pair(dir, name);
            console.log('wrote prep/compare/sweep-' + w + '/');
        }
    } finally { await d.close(); }
})().catch(e => { console.error(e); process.exit(1); });
