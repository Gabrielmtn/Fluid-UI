// prep/compare/compare.js — side-by-side loop: the app vs the Walnut & Copper
// study, same viewport, same four views, PNG pairs into prep/compare/<width>/.
//
//   node prep/compare/compare.js            # 1920 and 1440
//   WIDTHS=1440 node prep/compare/compare.js
//
// Uses the repo's headless Chrome driver (scripts/test/radial-menu/driver.js)
// instead of Playwright (not a dependency; adding it would touch package.json).
// The study is served by the same static server at /design/walnut-copper-study.html
// and is only loaded into the browser, never read into an agent's context.
//
// Views: top bar, Multi-brush drawer open, Brush drawer open, Swirl Together
// drawer open. Each pair is <view>-app.png / <view>-study.png, plus a stacked
// <view>-pair.png (app on top) for a quick look.
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { boot, sleep } = require('../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'prep', 'compare');
const WIDTHS = (process.env.WIDTHS || '1920,1440').split(',').map(Number);
const H = { 1920: 1080, 1440: 900, 1366: 768, 2560: 1440 };

// A drawer section (front + open tray), captured whole even past the viewport.
async function shotSection(d, js, file) {
    const r = await d.ev(`(function(){ var e = (${js})(); if (!e) return null; e.scrollIntoView({ block: 'start' }); var b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    if (!r || r.w < 2) { console.log('  missing section for ' + file); return null; }
    await sleep(300);
    const r2 = await d.ev(`(function(){ var e = (${js})(); var b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    const s = await d.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r2.x, y: r2.y, width: r2.w, height: Math.min(r2.h, 2400), scale: 1 } });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    return file;
}

async function shotEl(d, sel, file, pad) {
    const r = await d.ev(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'start' }); var b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    if (!r || r.w < 2) { console.log('  missing ' + sel); return null; }
    await sleep(250);
    const r2 = await d.ev(`(function(){ var b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: Math.min(b.height, innerHeight - Math.max(0, b.top)) }; })()`);
    pad = pad || 0;
    const clip = { x: Math.max(0, r2.x - pad), y: Math.max(0, r2.y - pad), width: r2.w + pad * 2, height: r2.h + pad * 2, scale: 1 };
    const s = await d.send('Page.captureScreenshot', { format: 'png', clip });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    return file;
}

async function pair(dir, view) {
    const a = path.join(dir, view + '-app.png'), b = path.join(dir, view + '-study.png');
    if (!fs.existsSync(a) || !fs.existsSync(b)) return;
    const [ia, ib] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
    if (view === 'topbar') {
        const w = Math.max(ia.width, ib.width);
        await sharp({ create: { width: w, height: ia.height + ib.height + 12, channels: 3, background: '#000' } })
            .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: ia.height + 12 }])
            .png().toFile(path.join(dir, view + '-pair.png'));
    } else {   // drawers side by side: app left, study right
        const h = Math.max(ia.height, ib.height);
        await sharp({ create: { width: ia.width + ib.width + 12, height: h, channels: 3, background: '#000' } })
            .composite([{ input: a, left: 0, top: 0 }, { input: b, left: ia.width + 12, top: 0 }])
            .png().toFile(path.join(dir, view + '-pair.png'));
    }
}

(async () => {
    const d = await boot({ args: ['--disable-gpu-compositing'] });
    try {
        for (const w of WIDTHS) {
            const dir = path.join(OUT, String(w));
            fs.mkdirSync(dir, { recursive: true });
            await d.send('Emulation.setDeviceMetricsOverride', { width: w, height: H[w] || 900, deviceScaleFactor: 1, mobile: false });

            // ── the app ──
            await d.load();
            await sleep(600);
            await shotEl(d, '#mixer-strip', path.join(dir, 'topbar-app.png'));
            const openApp = async (re, bar) => d.ev(`(async function(){
                var t = [].slice.call(document.querySelectorAll('${bar} .section-title')).find(function(x){ return ${re}.test(x.textContent); });
                if (!t) return false;
                document.querySelectorAll('${bar} .section-title[aria-expanded="true"]').forEach(function(o){ if (o !== t) o.click(); });
                if (t.getAttribute('aria-expanded') !== 'true') t.click();
                await new Promise(function(r){ setTimeout(r, 500); });
                return true; })()`);
            await openApp('/Multi/', '#sidebar-left'); await shotEl(d, '#sidebar-left', path.join(dir, 'multibrush-app.png'));
            await openApp('/^\\s*Brush\\s*$/', '#sidebar-left'); await shotEl(d, '#sidebar-left', path.join(dir, 'brush-app.png'));
            await openApp('/Swirl/', '#sidebar-right'); await shotEl(d, '#sidebar-right', path.join(dir, 'swirl-app.png'));

            // ── the study ──
            await d.send('Page.navigate', { url: d.url.replace(/index\.html$/, 'design/walnut-copper-study.html') });
            await sleep(3500);
            await shotEl(d, '#console', path.join(dir, 'topbar-study.png'));
            const openStudy = async (id) => d.ev(`(async function(){
                document.querySelectorAll('.dfront[aria-expanded="true"]').forEach(function(b){ b.click(); });
                await new Promise(function(r){ setTimeout(r, 400); });
                var b = document.querySelector('#${id} .dfront'); if (!b) return false; b.click();
                await new Promise(function(r){ setTimeout(r, 1200); }); return true; })()`);
            const stSec = id => `function(){ var h = document.getElementById('${id}'); return h && (h.closest('section') || h.parentElement.parentElement); }`;
            await openStudy('sp-multi'); await shotSection(d, stSec('sp-multi'), path.join(dir, 'multibrush-study.png'));
            await openStudy('sp-brush'); await shotSection(d, stSec('sp-brush'), path.join(dir, 'brush-study.png'));
            await openStudy('sp-room'); await shotSection(d, stSec('sp-room'), path.join(dir, 'swirl-study.png'));

            for (const v of ['topbar', 'multibrush', 'brush', 'swirl']) await pair(dir, v);
            console.log('wrote prep/compare/' + w + '/');
        }
    } finally { await d.close(); }
})().catch(e => { console.error(e); process.exit(1); });
