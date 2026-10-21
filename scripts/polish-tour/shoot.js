#!/usr/bin/env node
// Headless full-resolution captures for the polish pass: every drawer in
// every state it can reach, at an exact size, read as real pixels instead of
// a scaled-down pane screenshot.
//
//   node scripts/polish-tour/shoot.js                 # 1920x1080 @2x
//   SIZE=1440x900 DPR=1 ONLY=Audio,Mutate node scripts/polish-tour/shoot.js
//
// For each drawer: the default state, then each option of every short select
// (mode pickers) and each checkbox switched the other way, kept only when the
// drawer's layout changes (deduped by a layout signature), plus the special
// states below (Mutate cards made, an animation playing, popups open).
// Each capture also runs geometry.js; flags are drawn onto a second PNG.
// Writes prep/polish/shots/<size>/<drawer>__<state>.png, *-flags.png,
// flags.json, and one contact sheet per drawer (<drawer>__sheet.png).
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { boot, sleep } = require('../test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../..');
const [W, H] = (process.env.SIZE || '1920x1080').split('x').map(Number);
const DPR = parseFloat(process.env.DPR || '2');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(s => s.trim().toLowerCase()) : null;
const OUT = process.env.SHOT_OUT ? path.resolve(ROOT, process.env.SHOT_OUT) : path.join(ROOT, 'prep', 'polish', 'shots', W + 'x' + H);
const GEOM = fs.readFileSync(path.join(__dirname, 'geometry.js'), 'utf8');
// Selects that leave the page or the window: never cycled.
const SKIP_SELECT = ['windowMode', 'penWindowMirror', 'fpsCap', 'exportGround', 'exportVideoFPS', 'exportGifFPS'];
const SKIP_CHECK = ['transparentMode', 'photoSafeToggle', 'focusModeToggle', 'autoloadSettings', 'hoverCaptureToggle', 'detachCaptureToggle'];

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const flagsAll = [];

async function capture(d, name, rootExpr) {
    if (process.env.SHOT_DEBUG) console.log('  > ' + name);
    // Clipped to the viewport's width: a clip past it makes the capture hang.
    const r = await d.ev(`(function(){ var e = ${rootExpr}; if (!e) return null; var b = e.getBoundingClientRect(); var x = Math.max(0, b.left + scrollX); return { x: x, y: b.top + scrollY, w: Math.min(b.width, document.documentElement.clientWidth - x), h: b.height }; })()`);
    if (!r || r.w < 2 || r.h < 2) { console.log('  (nothing to capture) ' + name); return null; }
    const flags = await d.ev(`(function(){ var e = ${rootExpr}; var f = window.__polishGeom(e); var b = e.getBoundingClientRect(); return f.map(function(x){ x.rect.x -= Math.round(b.left); x.rect.y -= Math.round(b.top); return x; }); })()`);
    if (process.env.SHOT_DEBUG) console.log('    flags ' + flags.length + ' ' + JSON.stringify(flags).slice(0, 300));
    const shot = await d.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x, y: r.y, width: r.w, height: Math.min(r.h, 4000), scale: 1 } });
    const file = path.join(OUT, name + '.png');
    const buf = Buffer.from(shot.data, 'base64');
    if (process.env.SHOT_DEBUG) console.log('    shot ' + buf.length);
    fs.writeFileSync(file, buf);
    if (flags.length) {
        const meta = await sharp(buf).metadata();
        const s = meta.width / r.w;
        const COL = { overlap: '#ff3b6b', align: '#ffd23f', uneven: '#57a6ff', empty: '#ff8c1a', nested: '#b07cff', heavy: '#ff3b6b', emoji: '#3fe0a0', native: '#ff3b6b', 'native-box': '#ff3b6b' };
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + meta.width + '" height="' + meta.height + '">' + flags.map((f, i) =>
            '<rect x="' + f.rect.x * s + '" y="' + f.rect.y * s + '" width="' + f.rect.w * s + '" height="' + f.rect.h * s + '" fill="none" stroke="' + (COL[f.kind] || '#fff') + '" stroke-width="' + 2 * s + '"/>' +
            '<text x="' + (f.rect.x * s + 2) + '" y="' + (f.rect.y * s + 11 * s) + '" font-size="' + 10 * s + '" font-family="Consolas" fill="' + (COL[f.kind] || '#fff') + '" stroke="#000" stroke-width="' + 0.6 * s + '">' + (i + 1) + ' ' + f.kind + '</text>').join('') + '</svg>';
        await sharp(buf).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(OUT, name + '-flags.png'));
    }
    flags.forEach(f => flagsAll.push(Object.assign({ shot: name }, f)));
    console.log('  ' + name + (flags.length ? '  [' + flags.length + ' flags: ' + Array.from(new Set(flags.map(f => f.kind))).join(', ') + ']' : ''));
    return file;
}

async function sheet(drawer, files) {
    if (!files.length) return;
    const metas = await Promise.all(files.map(f => sharp(f).metadata()));
    const gap = 16, Hh = Math.max.apply(null, metas.map(m => m.height));
    const Wt = metas.reduce((s, m) => s + m.width + gap, -gap);
    let x = 0; const comp = [];
    files.forEach((f, i) => { comp.push({ input: f, left: x, top: 0 }); x += metas[i].width + gap; });
    await sharp({ create: { width: Wt, height: Hh, channels: 3, background: '#111' } }).composite(comp).png().toFile(path.join(OUT, drawer + '__sheet.png'));
}

// Layout signature of a drawer: which children show and how tall it is.
const SIG = `(function(sec){ var b = sec.getBoundingClientRect(); var v = [].slice.call(sec.querySelectorAll('.section-body *')).filter(function(e){ var r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; }).length; return Math.round(b.height / 4) + ':' + v; })(window.__ptSec)`;

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const d = await boot({ args: ['--disable-gpu-compositing', '--force-prefers-reduced-motion'] });
    try {
        await d.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
        console.log('booted');
        await d.load();
        console.log('loaded');
        await sleep(800);
        await d.ev(GEOM + ';1');
        if (process.env.SHOT_DEBUG) console.log('geometry in');
        // Transitions off so every capture is the settled look.
        await d.ev(`(function(){ var s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important}'; document.head.appendChild(s); return 1; })()`);

        // Top bar and underbar first.
        await capture(d, 'topbar__default', `document.getElementById('mixer-strip')`);
        await capture(d, 'underbar__default', `document.getElementById('quality-underbar')`);

        // Material list open (base-select's picker is in the page's top layer).
        await d.ev(`(async function(){ var s = document.getElementById('materialMode'); try { s.focus(); s.showPicker(); } catch (e) { return String(e); } await new Promise(function(r){ setTimeout(r, 500); }); window.__ptPick = document.createElement('div'); return 1; })()`);
        await capture(d, 'topbar__material-open', `(function(){ var s = document.getElementById('materialMode'), r = s.getBoundingClientRect(), o = s.options[s.options.length - 1].getBoundingClientRect(); var b = window.__ptPick; b.style.cssText = 'position:fixed;pointer-events:none;left:' + (r.left - 16) + 'px;top:' + (r.top - 16) + 'px;width:' + (Math.max(r.width, o.width) + 32) + 'px;height:' + (o.bottom - r.top + 32) + 'px'; document.body.appendChild(b); return b; })()`);
        await d.ev(`(function(){ var s = document.getElementById('materialMode'); s.blur(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (window.__ptPick) window.__ptPick.remove(); return 1; })()`);
        await d.tap('Escape', 'Escape', 27);
        // Drawers in a tall window, so a long drawer is captured whole.
        await d.send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.max(H, 2600), deviceScaleFactor: DPR, mobile: false });
        await sleep(800);
        const titles = await d.ev(`window.Sidebars.sections().map(function(s){ return s.querySelector('.section-title').textContent.trim(); })`);
        for (const title of titles) {
            if (ONLY && !ONLY.some(o => title.toLowerCase().indexOf(o) >= 0)) continue;
            const dn = slug(title);
            const files = [];
            const open = `(async function(){ window.Sidebars.sections().forEach(function(s){ if (!s.classList.contains('collapsed') && s.querySelector('.section-title').textContent.trim() !== ${JSON.stringify(title)}) s.querySelector('.section-title').click(); });
                var s = window.Sidebars.find(${JSON.stringify(title)}); window.Sidebars.open(s); window.__ptSec = s; s.scrollIntoView({ block: 'start' }); await new Promise(function(r){ setTimeout(r, 700); }); return 1; })()`;
            await d.ev(open);
            const seen = new Set([await d.ev(SIG)]);
            let f = await capture(d, dn + '__default', 'window.__ptSec'); if (f) files.push(f);

            // Mode selects: each option, kept if the layout changes.
            const selects = await d.ev(`[].slice.call(window.__ptSec.querySelectorAll('select')).filter(function(s){ var r = s.getBoundingClientRect(); return r.width > 1 && s.options.length > 1 && s.options.length <= 8 && ${JSON.stringify(SKIP_SELECT)}.indexOf(s.id) < 0; }).map(function(s){ return { id: s.id, n: s.options.length, was: s.selectedIndex, opts: [].map.call(s.options, function(o){ return o.textContent.trim(); }) }; })`);
            for (const s of selects) {
                if (!s.id) continue;
                for (let i = 0; i < s.n; i++) {
                    if (i === s.was) continue;
                    if (s.id === 'audioMode' && s.opts[i] === 'Full') continue;   // being cut (2026-10-17)
                    await d.ev(`(async function(){ var s = document.getElementById(${JSON.stringify(s.id)}); s.selectedIndex = ${i}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(function(r){ setTimeout(r, 500); }); return 1; })()`);
                    const sig = await d.ev(SIG);
                    if (!seen.has(sig)) { seen.add(sig); f = await capture(d, dn + '__' + slug(s.id) + '-' + slug(s.opts[i]), 'window.__ptSec'); if (f) files.push(f); }
                }
                await d.ev(`(async function(){ var s = document.getElementById(${JSON.stringify(s.id)}); s.selectedIndex = ${s.was}; s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(function(r){ setTimeout(r, 400); }); return 1; })()`);
            }
            // Checkboxes: the other way, kept if the layout changes.
            const checks = await d.ev(`[].slice.call(window.__ptSec.querySelectorAll('input[type=checkbox]')).filter(function(c){ var l = document.querySelector('label[for="' + c.id + '"]') || c.closest('label') || c; var r = l.getBoundingClientRect(); return c.id && r.width > 1 && ${JSON.stringify(SKIP_CHECK)}.indexOf(c.id) < 0; }).map(function(c){ return c.id; })`);
            for (const id of checks) {
                const flip = `(async function(){ var c = document.getElementById(${JSON.stringify(id)}); if (!c) return 0; c.checked = !c.checked; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(function(r){ setTimeout(r, 500); }); return 1; })()`;
                await d.ev(flip);
                const sig = await d.ev(SIG);
                if (!seen.has(sig)) { seen.add(sig); f = await capture(d, dn + '__' + slug(id), 'window.__ptSec'); if (f) files.push(f); }
                await d.ev(flip);
            }

            // Special states.
            if (/mutate/i.test(title)) {
                await d.ev(`(async function(){ document.getElementById('mutationGenerate').click(); await new Promise(function(r){ setTimeout(r, 2500); }); return 1; })()`);
                f = await capture(d, dn + '__cards', 'window.__ptSec'); if (f) files.push(f);
            }
            if (/animations/i.test(title)) {
                // A slot that plays: the recorder's lookups answer as if
                // "Animation 1" exists and is looping (presentation only).
                await d.ev(`(async function(){ window.recListSavedAnimations = function(){ return ['Animation 1', 'Sunset swirl']; }; window.recIsSavedAnimationPlaying = function(n){ return n === 'Animation 1'; };
                    window.animSlots.assignFirstEmpty('Animation 1'); window.animSlots.assignFirstEmpty('Sunset swirl'); await new Promise(function(r){ setTimeout(r, 500); }); return 1; })()`);
                f = await capture(d, dn + '__slots-playing', 'window.__ptSec'); if (f) files.push(f);
                // Hovering a filled slot shows its Clear cross.
                const p = await d.ev(`(function(){ var b = window.__ptSec.querySelector('.anim-slot button[data-anim-name]'); var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
                await d.move(p.x, p.y); await sleep(300);
                f = await capture(d, dn + '__slot-hover', 'window.__ptSec'); if (f) files.push(f);
                await d.move(5, 5);
            }
            await sheet(dn, files);
        }

        await d.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
        await sleep(600);
        // Popups.
        await d.ev(`(async function(){ window.Sidebars.sections().forEach(function(s){ if (!s.classList.contains('collapsed')) s.querySelector('.section-title').click(); }); document.getElementById('mixerPresetsTrigger').click(); await new Promise(function(r){ setTimeout(r, 700); }); return 1; })()`);
        await capture(d, 'popup__presets', `document.querySelector('.mixer-presets-panel')`);
        await d.ev(`(async function(){ document.getElementById('mixerPresetsTrigger').click(); window.ColourPicker.openFor(document.getElementById('colorPicker')); await new Promise(function(r){ setTimeout(r, 600); }); return 1; })()`);
        await capture(d, 'popup__colour-picker', `document.querySelector('.cp-pop')`);
        await d.ev(`(function(){ window.ColourPicker.close(); return 1; })()`);
        // The hotkey sheet: opened without waiting on the page (an awaited
        // evaluate there never returned), then captured if it is up.
        d.ev(`(function(){ setTimeout(function(){ window.showHotkeys(); }, 0); return 1; })()`).catch(function(){});
        await sleep(900);
        await Promise.race([capture(d, 'popup__hotkeys', `document.querySelector('#hotkeyOverlay .hotkey-modal') || document.getElementById('hotkeyOverlay')`), sleep(15000)]);

        fs.writeFileSync(path.join(OUT, 'flags.json'), JSON.stringify(flagsAll, null, 1));
        const by = {}; flagsAll.forEach(x => { by[x.kind] = (by[x.kind] || 0) + 1; });
        console.log('flags: ' + JSON.stringify(by) + '\nwrote ' + path.relative(ROOT, OUT));
    } finally { await d.close(); }
})().catch(e => { console.error(e); process.exit(1); });
