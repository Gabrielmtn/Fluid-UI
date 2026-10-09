// Palette from an image (js/65) in the real app: headless Chrome over its
// own static server (the radial menu's driver), trusted mouse and keys.
//   node scripts/test/palette-extract/ui.js
// SHOT=<file.png> also writes a close-up of the open panel there.
// Exit code 1 if any check failed.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot, sleep } = require('../radial-menu/driver');

let failed = 0;
function check(name, ok, detail) {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
    if (!ok) failed++;
}

// A small landscape, so the screenshot looks like a real use: a sky
// gradient, a sun and two hills. The sun and the near hill are flat colours
// the drag check can land on.
const SUN = '#FFE08A', NEAR = '#2F4A2E';
const MAKE_PICTURE = `(async () => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 160;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 110);
    sky.addColorStop(0, '#2E5C8A'); sky.addColorStop(1, '#F2B48C');
    g.fillStyle = sky; g.fillRect(0, 0, 240, 160);
    g.fillStyle = '${SUN}'; g.beginPath(); g.arc(170, 66, 24, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6C8C5A'; g.beginPath(); g.ellipse(70, 132, 150, 42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '${NEAR}'; g.beginPath(); g.ellipse(200, 168, 170, 46, 0, 0, Math.PI * 2); g.fill();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    window.__pfiFile = new File([blob], 'test-photo.png', { type: 'image/png' });
    return blob.size;
})()`;

const STATE = `(() => {
    const host = document.getElementById('paletteExtractHost');
    const sw = [...host.querySelectorAll('.pfi-swatch')];
    const mk = [...host.querySelectorAll('.pfi-marker')];
    const rgb2hex = s => { const m = s.match(/\\d+/g); return m ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() : null; };
    return {
        open: window.PaletteFromImage.isOpen(), hidden: host.hidden, title: (host.querySelector('.pfi-title') || {}).textContent || '',
        swatches: sw.map(s => rgb2hex(getComputedStyle(s).backgroundColor)),
        titles: sw.map(s => s.title),
        markers: mk.map(m => { const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, bg: rgb2hex(getComputedStyle(m).backgroundColor), hot: m.classList.contains('hot'), dragging: m.classList.contains('dragging') }; }),
        count: (host.querySelector('.pfi-count-val') || {}).textContent,
        method: (host.querySelector('.pfi-method') || {}).value,
        layout: host.offsetParent !== null
    };
})()`;

const rect = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`;

// A move with the left button held. The driver's move() sends button
// 'none' with buttons 1, which Chrome reads as a release: pointer capture
// is dropped on the next move and the drag goes nowhere.
const held = (t, x, y) => t.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'mouse' });

async function waitFor(t, expr, ms) {
    for (let i = 0; i < (ms || 4000) / 50; i++) {
        if (await t.ev(expr).catch(() => false)) return true;
        await sleep(50);
    }
    return false;
}

(async () => {
    const t = await boot();
    const pageErrors = [];
    const t0 = Date.now();
    try {
        await t.send('Page.setInterceptFileChooserDialog', { enabled: true });
        check('API present', await t.ev(`!!(window.PaletteFromImage && ['openFile','pickFile','openCanvas','close','isOpen','extract'].every(k => typeof window.PaletteFromImage[k] === 'function') && document.getElementById('paletteExtractHost'))`));

        // Open the section the way a user would have it before dropping a
        // picture on it.
        await t.ev(`(() => { const s = document.getElementById('paletteExtractHost').closest('.sidebar-section'); window.openSidebarSection(s); return 1; })()`);
        await sleep(300);
        const auditBefore = await t.ev(`(() => { const a = auditButtons(); return a.total - a.clean; })()`);

        // ── openFile with a generated PNG ──
        await t.ev(MAKE_PICTURE);
        await t.ev(`window.PaletteFromImage.openFile(window.__pfiFile), 1`);
        await waitFor(t, `document.querySelectorAll('#paletteExtractHost .pfi-swatch').length === 5`);
        await sleep(200);
        let s = await t.ev(STATE);
        check('openFile: panel open, un-hidden, titled with the file', s.open && !s.hidden && s.layout && s.title === 'test-photo.png', s.title);
        check('openFile: 5 swatches and 5 markers', s.swatches.length === 5 && s.markers.length === 5);
        check('openFile: markers wear their swatch colours', s.markers.every((m, i) => m.bg === s.swatches[i]) && s.titles.every((h, i) => h === s.swatches[i]), s.swatches.join(' '));
        const inView = await t.ev(`(() => { const r = document.querySelector('#paletteExtractHost .pfi').getBoundingClientRect(); const sb = document.getElementById('sidebar-right').getBoundingClientRect(); return r.top >= sb.top - 1 && r.bottom <= sb.bottom + 1 && r.height > 200; })()`);
        check('openFile: panel scrolled into view', inView);

        // Close-up for the eye.
        if (process.env.SHOT) {
            await t.ev(`document.querySelector('#paletteExtractHost .pfi-swatch:nth-child(2)').dispatchEvent(new MouseEvent('mouseenter')), 1`);
            const r = await t.ev(rect('#paletteExtractHost'));
            const shot = await t.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.l - 24), y: Math.max(0, r.t - 60), width: r.w + 48, height: r.h + 84, scale: 2 } });
            fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
            await t.ev(`document.querySelector('#paletteExtractHost .pfi-swatch:nth-child(2)').dispatchEvent(new MouseEvent('mouseleave')), 1`);
            const full = await t.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(process.env.SHOT.replace(/\.png$/, '-full.png'), Buffer.from(full.data, 'base64'));
        }

        // ── Buttons follow the button system ──
        const audit = await t.ev(`(() => { const a = auditButtons(); const mine = a.rules.filter(r => /24-palette-from-image|pfi/.test(r.rule)); const inl = a.inline.filter(o => /pfi/.test(String(o.button))); return { offenders: a.total - a.clean, mine: mine.length + inl.length, list: mine.map(r => r.rule).concat(inl.map(o => o.button)) }; })()`);
        check('auditButtons: nothing in the panel flagged', audit.mine === 0 && audit.offenders === auditBefore,
            'offenders before ' + auditBefore + ', with panel ' + audit.offenders + (audit.list.length ? ', ' + audit.list.join('; ') : ''));

        // ── Hover links a swatch and its marker ──
        let r = await t.ev(rect('#paletteExtractHost .pfi-swatch:nth-child(3)'));
        await t.move(r.x, r.y);
        await sleep(80);
        s = await t.ev(STATE);
        check('hover: swatch lights its marker', s.markers[2].hot && s.markers.filter(m => m.hot).length === 1);
        await t.move(r.x, r.y + 200);

        // ── Method and count ──
        const before = s.swatches.join();
        await t.ev(`(() => { const m = document.querySelector('#paletteExtractHost .pfi-method'); m.value = 'bright'; m.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        await sleep(80);
        s = await t.ev(STATE);
        check('method: Bright re-extracts', s.method === 'bright' && s.swatches.length === 5 && s.swatches.join() !== before, s.swatches.join(' '));
        r = await t.ev(rect('#paletteExtractHost .pfi-step:last-child'));
        await t.click(r.x, r.y);
        s = await t.ev(STATE);
        check('count: + gives 6', s.count === '6' && s.swatches.length === 6 && s.markers.length === 6);
        r = await t.ev(rect('#paletteExtractHost .pfi-step:first-child'));
        for (let i = 0; i < 5; i++) await t.click(r.x, r.y);
        s = await t.ev(STATE);
        const minusOff = await t.ev(`document.querySelector('#paletteExtractHost .pfi-step:first-child').disabled`);
        check('count: stops at 3', s.count === '3' && s.swatches.length === 3 && minusOff);
        r = await t.ev(rect('#paletteExtractHost .pfi-step:last-child'));
        await t.click(r.x, r.y); await t.click(r.x, r.y);
        await t.ev(`(() => { const m = document.querySelector('#paletteExtractHost .pfi-method'); m.value = 'dominant'; m.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        await sleep(60);
        s = await t.ev(STATE);
        check('count and method back to Dominant, 5', s.count === '5' && s.method === 'dominant' && s.swatches.length === 5);

        // ── Try other colours ──
        const preRegen = s.swatches.join();
        r = await t.ev(rect('#paletteExtractHost .pfi-regen'));
        await t.click(r.x, r.y);
        s = await t.ev(STATE);
        check('regenerate: other colours', s.swatches.length === 5 && s.swatches.join() !== preRegen, s.swatches.join(' '));

        // ── Drag a marker onto the sun, then the near hill ──
        const pick = await t.ev(`(() => {
            const cm = window.ColourMath; const sw = [...document.querySelectorAll('#paletteExtractHost .pfi-swatch')];
            const hex = s => { const m = getComputedStyle(s).backgroundColor.match(/\\d+/g); return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase(); };
            return sw.findIndex(x => cm.deltaE(hex(x), '${SUN}') > 0.1 && cm.deltaE(hex(x), '${NEAR}') > 0.1);
        })()`);
        const img = await t.ev(rect('#paletteExtractHost .pfi-image'));
        s = await t.ev(STATE);
        const m0 = s.markers[pick];
        const sunAt = { x: img.l + img.w * (170 / 240), y: img.t + img.h * (66 / 160) };
        const hillAt = { x: img.l + img.w * (225 / 240), y: img.t + img.h * (150 / 160) };
        await t.move(m0.x, m0.y);
        await t.down(m0.x, m0.y);
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
            await held(t, m0.x + (sunAt.x - m0.x) * i / steps, m0.y + (sunAt.y - m0.y) * i / steps);
            await sleep(16);
        }
        await sleep(60);
        s = await t.ev(STATE);
        const sunDE = await t.ev(`window.ColourMath.deltaE(${JSON.stringify(s.swatches[pick])}, '${SUN}')`);
        check('drag: marker grows while held', s.markers[pick].dragging && s.markers[pick].w > 15, 'width ' + s.markers[pick].w.toFixed(1));
        check('drag: swatch takes the sun colour, live', sunDE < 0.02 && Math.abs(s.markers[pick].x - sunAt.x) < 2 && Math.abs(s.markers[pick].y - sunAt.y) < 2,
            s.swatches[pick] + ', ΔE ' + sunDE.toFixed(4));
        for (let i = 1; i <= steps; i++) {
            await held(t, sunAt.x + (hillAt.x - sunAt.x) * i / steps, sunAt.y + (hillAt.y - sunAt.y) * i / steps);
            await sleep(16);
        }
        await t.up(hillAt.x, hillAt.y);
        await sleep(60);
        s = await t.ev(STATE);
        const hillDE = await t.ev(`window.ColourMath.deltaE(${JSON.stringify(s.swatches[pick])}, '${NEAR}')`);
        check('drag: released on the hill, swatch follows', hillDE < 0.02 && !s.markers[pick].dragging && s.markers[pick].bg === s.swatches[pick],
            s.swatches[pick] + ', ΔE ' + hillDE.toFixed(4));
        if (process.env.SHOT) {
            const pr = await t.ev(rect('#paletteExtractHost'));
            const shot = await t.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, pr.l - 24), y: Math.max(0, pr.t - 60), width: pr.w + 48, height: pr.h + 84, scale: 2 } });
            fs.writeFileSync(process.env.SHOT.replace(/\.png$/, '-dragged.png'), Buffer.from(shot.data, 'base64'));
        }

        // ── Save ──
        const want = s.swatches.slice();
        const pal0 = await t.ev(`({ n: window.curatedPalettes.length, cur: window.currentPaletteIndex })`);
        r = await t.ev(rect('#paletteExtractHost .pfi-save'));
        await t.click(r.x, r.y);
        await sleep(150);
        const pal1 = await t.ev(`(() => { const i = window.curatedPalettes.length - 1; const p = window.curatedPalettes[i]; return { n: window.curatedPalettes.length, cur: window.currentPaletteIndex, i, name: p.name, colors: (p.colors || []).map(c => String(c).toUpperCase()) }; })()`);
        s = await t.ev(STATE);
        const uniq = [...new Set(want)];
        check('save: one palette more, named after the file', pal1.n === pal0.n + 1 && pal1.name === 'test-photo', pal1.name);
        check('save: its colours are the swatches', pal1.colors.length === uniq.length && uniq.every((h, i) => pal1.colors[i] === h), pal1.colors.join(' '));
        check('save: it became the active palette', pal1.cur === pal1.i, 'current ' + pal1.cur + ', new ' + pal1.i);
        check('save: panel closed and emptied', !s.open && s.hidden && s.swatches.length === 0 && (await t.ev(`document.getElementById('paletteExtractHost').childElementCount`)) === 0);

        // ── Escape cancels ──
        await t.ev(`window.PaletteFromImage.openFile(window.__pfiFile), 1`);
        await waitFor(t, `document.querySelectorAll('#paletteExtractHost .pfi-swatch').length === 5`);
        const nBefore = await t.ev(`window.curatedPalettes.length`);
        r = await t.ev(rect('#paletteExtractHost .pfi-count-val'));
        await t.click(r.x, r.y);           // focus inside the panel, on nothing that acts
        await t.tap('Escape', 'Escape', 27);
        s = await t.ev(STATE);
        check('escape: closes without saving', !s.open && s.hidden && (await t.ev(`window.curatedPalettes.length`)) === nBefore);

        // ── [+ New] → From the canvas, after painting a stroke ──
        const cv = await t.ev(rect('#canvas'));
        await t.move(cv.l + cv.w * 0.3, cv.t + cv.h * 0.5);
        await t.down(cv.l + cv.w * 0.3, cv.t + cv.h * 0.5);
        for (let i = 1; i <= 20; i++) { await held(t, cv.l + cv.w * (0.3 + i * 0.02), cv.t + cv.h * (0.5 + Math.sin(i / 3) * 0.1)); await sleep(16); }
        await t.up(cv.l + cv.w * 0.7, cv.t + cv.h * 0.5);
        await sleep(400);
        // New palette sits at the top of the palette dropdown (2026-10-08).
        r = await t.ev(rect('#paletteSelect'));
        if (r) {
            await t.click(r.x, r.y);
            await sleep(150);
            const items = await t.ev(`[...document.querySelectorAll('.palette-list .palette-new-btns button')].map(b => b.textContent)`);
            const first = await t.ev(`(() => { const l = document.querySelector('.palette-list'); return l && l.firstElementChild && l.firstElementChild.className; })()`);
            check('the palette list opens with New palette first: brush colour, image, canvas', first === 'palette-new-row' && items.join('|') === 'Brush colour|Image…|Canvas', { first, items });
            const ci = await t.ev(`(() => { const b = [...document.querySelectorAll('.palette-list .palette-new-btns button')].find(b => b.textContent === 'Canvas'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
            if (ci) await t.click(ci.x, ci.y);
        } else {
            check('palette dropdown present', false);
            await t.ev(`window.PaletteFromImage.openCanvas(), 1`);
        }
        await waitFor(t, `document.querySelectorAll('#paletteExtractHost .pfi-swatch').length > 0`);
        s = await t.ev(STATE);
        const imgDrawn = await t.ev(`(() => { const c = document.querySelector('#paletteExtractHost .pfi-image'); return !!c && c.width > 0 && c.height > 0; })()`);
        check('openCanvas: panel renders the painting', s.open && s.title === 'The canvas' && s.swatches.length >= 1 && imgDrawn, s.swatches.length + ' colours: ' + s.swatches.join(' '));
        if (process.env.SHOT) {
            const pr = await t.ev(rect('#paletteExtractHost'));
            const shot = await t.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, pr.l - 24), y: Math.max(0, pr.t - 60), width: pr.w + 48, height: pr.h + 84, scale: 2 } });
            fs.writeFileSync(process.env.SHOT.replace(/\.png$/, '-canvas.png'), Buffer.from(shot.data, 'base64'));
        }
        r = await t.ev(rect('#paletteExtractHost .pfi-cancel'));
        await t.click(r.x, r.y);
        s = await t.ev(STATE);
        check('cancel: closes', !s.open && s.hidden);

        // ── pickFile → the OS dialog → a real file from disk ──
        const evMark = t.events.length;
        await t.ev(`window.PaletteFromImage.pickFile(), 1`);
        let chooser = null;
        for (let i = 0; i < 40 && !chooser; i++) { chooser = t.events.slice(evMark).find(e => e.method === 'Page.fileChooserOpened'); if (!chooser) await sleep(50); }
        check('pickFile: opens the file dialog', !!chooser);
        if (chooser) {
            const file = path.resolve(__dirname, '../../../assets/presets/opal.png');
            await t.send('DOM.setFileInputFiles', { files: [file], backendNodeId: chooser.params.backendNodeId });
            await waitFor(t, `document.querySelectorAll('#paletteExtractHost .pfi-swatch').length === 5`);
            s = await t.ev(STATE);
            check('pickFile: the chosen file opens', s.open && s.title === 'opal.png' && s.swatches.length === 5, s.title);
            await t.ev(`window.PaletteFromImage.close(), 1`);
        }

        // ── A hidden section comes back when a picture arrives ──
        await t.ev(`UIVisibility.hide('section:Colors and palettes'), 1`);
        await sleep(100);
        const hiddenNow = await t.ev(`document.getElementById('paletteExtractHost').closest('.sidebar-section').offsetParent === null`);
        await t.ev(`window.PaletteFromImage.openFile(window.__pfiFile), 1`);
        await waitFor(t, `document.querySelectorAll('#paletteExtractHost .pfi-swatch').length === 5`);
        s = await t.ev(STATE);
        const secOpen = await t.ev(`!document.getElementById('paletteExtractHost').closest('.sidebar-section').classList.contains('collapsed')`);
        check('reveal: a hidden Colors section is shown and opened', hiddenNow && s.layout && secOpen, 'was hidden ' + hiddenNow + ', layout ' + s.layout + ', open ' + secOpen);
        await t.ev(`window.PaletteFromImage.close(), 1`);

        // ── A file that isn't an image ──
        await t.ev(`window.PaletteFromImage.openFile(new File(['not a picture'], 'notes.png', { type: 'image/png' })), 1`);
        await waitFor(t, `!!document.querySelector('#paletteExtractHost .pfi-error')`);
        const errText = await t.ev(`(document.querySelector('#paletteExtractHost .pfi-error') || {}).textContent || ''`);
        check('a broken file says so', /could not be read/.test(errText), errText);
        await t.ev(`window.PaletteFromImage.close(), 1`);

        // ── Page errors from this feature ──
        t.events.forEach(e => {
            if (e.method === 'Runtime.exceptionThrown') pageErrors.push((e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text);
            if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') pageErrors.push(e.params.entry.text + ' ' + (e.params.entry.url || ''));
        });
        const mine = pageErrors.filter(x => /65-palette|PaletteFromImage|pfi/.test(String(x)));
        check('no page errors from js/65', mine.length === 0, mine.join(' | '));
        const other = pageErrors.filter(x => !/65-palette|PaletteFromImage|pfi/.test(String(x)));
        if (other.length) console.log('INFO other page errors (not this feature): ' + other.slice(0, 5).join(' | '));
    } catch (e) {
        check('ran to the end', false, e && e.stack || String(e));
    } finally {
        await t.close();
    }
    console.log('');
    console.log((failed ? failed + ' check(s) FAILED' : 'All checks passed') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    process.exit(failed ? 1 : 0);
})();
