// The shared colour picker (js/64), the palette's inline add/change, the
// eyedropper, the One · Random · Palette switch and the three boot bugs,
// in headless Chrome with trusted input against the repo's own files:
//   node scripts/test/palette-picker/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// SHOT_DIR= writes screenshots there. Exit code 1 if any check failed.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }

const AUTOLOAD_OFF = { 'fluidUI:settings.autoload': JSON.stringify({ value: false }) };

async function rectOf(d, sel) {
    return d.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var r=e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2, l:r.left, t:r.top, w:r.width, h:r.height, b:r.bottom};})()`);
}
async function paint(d, x0, y0, x1, y1) {
    await d.move(x0, y0); await d.down(x0, y0); await sleep(30);
    for (let i = 1; i <= 12; i++) { await d.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12, 1); await sleep(16); }
    await d.up(x1, y1); await sleep(120);
}
const STATE = `(function(){
    var a0 = (window.multiArmColors||[])[0] || {};
    var lit = Array.prototype.filter.call(document.querySelectorAll('[data-brush-mode]'), function(b){return b.classList.contains('active');}).map(function(b){return b.textContent;});
    return { mode: a0.mode, lit: lit, dot: document.getElementById('colorPicker').value.toUpperCase(),
             size: document.getElementById('brushSize').value, stepIdx: typeof paletteStepIndex === 'number' ? paletteStepIndex : null,
             step: document.getElementById('stepPalette').checked, rnd: document.getElementById('randomColor').checked };
})()`;

(async () => {
    // ── Boot: a fresh install with autoload off stays on Random ──
    let d = await boot({ seed: AUTOLOAD_OFF });
    try {
        let s = await d.ev(STATE);
        check('B1 fresh boot, autoload off: Random, not Palette', s.mode === 'random' && s.lit.join() === 'Random' && !s.step, s);
        await d.load();
        s = await d.ev(STATE);
        check('B2 after a reload with autoload off: still Random', s.mode === 'random' && s.lit.join() === 'Random' && !s.step, s);
    } finally { await d.close(); }

    d = await boot();
    try {
        const cv = await rectOf(d, '#canvas');
        // ── Ctrl+Z after painting changes nothing it shouldn't ──
        await d.ev(`(function(){var b=document.getElementById('brushSize'); b.value='4.2'; b.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
        await paint(d, cv.x - 120, cv.y - 40, cv.x + 60, cv.y + 30);
        const before = await d.ev(STATE);
        await d.tap('z', 'KeyZ', 90, ['ctrl'], 'z');
        await sleep(200);
        const after = await d.ev(STATE);
        check('B3 Ctrl+Z after painting keeps Random and the brush size', after.mode === before.mode && after.mode === 'random' && after.size === before.size, { before, after });

        // ── A snapshot restored in Palette mode keeps its next colour ──
        const c = await d.ev(`(function(){
            window.applyPalette(0);                       // a hand pick: Palette mode
            window.stepPaletteOnce(true); window.stepPaletteOnce(true);
            var list = window.paletteActiveColours();
            var snap = window.capturePresetSnapshot();
            window.applyPalette(2);
            window.applyPresetSnapshot(snap);
            return new Promise(function(r){ setTimeout(function(){
                r({ want: list[2], dot: document.getElementById('colorPicker').value.toUpperCase(), idx: paletteStepIndex, mode: window.multiArmColors[0].mode, pal: window.currentPaletteIndex });
            }, 400); });
        })()`);
        check('B4 a restored Palette-mode look paints its next colour first', c.dot === c.want && c.idx === 2 && c.mode === 'step' && c.pal === 0, c);

        // ── The switch ──
        const seg = async (label) => { const r = await d.ev(`(function(){var b=Array.prototype.find.call(document.querySelectorAll('[data-brush-mode]'),function(x){return x.textContent===${JSON.stringify(label)};}); var q=b.getBoundingClientRect(); return {x:q.left+q.width/2,y:q.top+q.height/2};})()`); await d.click(r.x, r.y); await sleep(120); return d.ev(STATE); };
        let s = await seg('One');
        check('S1 One: one colour', s.mode === 'fixed' && s.lit.join() === 'One', s);
        s = await seg('Random');
        check('S2 Random', s.mode === 'random' && s.lit.join() === 'Random' && s.rnd, s);
        s = await seg('Random');
        check('S3 clicking the lit one keeps it', s.mode === 'random' && s.lit.join() === 'Random', s);
        s = await seg('Palette');
        check('S4 Palette', s.mode === 'step' && s.lit.join() === 'Palette' && s.step, s);
        await d.tap('r', 'KeyR', 82, [], 'r'); await sleep(150);
        s = await d.ev(STATE);
        check('S5 R still switches to Random', s.mode === 'random' && s.lit.join() === 'Random', s);

        // ── Popover from the colour dot ──
        const dot = await rectOf(d, '#colorPicker');
        await d.click(dot.x, dot.y); await sleep(250);
        const pop = await d.ev(`(function(){var p=document.querySelector('.cp-pop'); return p && {title:p.querySelector('.cp-pop-title').textContent, pal:!!p.querySelector('.cp-pal'), chips:p.querySelectorAll('.cp-pal-row .cp-chip').length};})()`);
        check('P1 the dot opens the picker popover with the palette', pop && pop.title === 'Brush colour' && pop.pal && pop.chips > 0, pop);
        const tr = await rectOf(d, '.cp-pop .cp-row:nth-child(1) .cp-track');
        await d.move(tr.l + 4, tr.y); await d.down(tr.l + 4, tr.y); await sleep(30);
        for (let i = 1; i <= 8; i++) { await d.move(tr.l + 4 + i * (tr.w * 0.6) / 8, tr.y, 1); await sleep(20); }
        await d.up(tr.l + 4 + tr.w * 0.6, tr.y); await sleep(250);
        s = await d.ev(STATE);
        const hexField = await d.ev(`document.querySelector('.cp-pop .cp-hex').value`);
        check('P2 dragging L picks a colour: One, dot follows', s.mode === 'fixed' && s.lit.join() === 'One' && s.dot === hexField, { s, hexField });
        await paint(d, cv.x - 40, cv.y + 60, cv.x + 80, cv.y + 90);
        check('P3 painting leaves it open', await d.ev(`!!document.querySelector('.cp-pop')`));
        await d.tap('Escape', 'Escape', 27); await sleep(150);
        const rec = await d.ev(`ColourPicker.recents()`);
        check('P4 Escape closes it and the pick is in recents', !(await d.ev(`!!document.querySelector('.cp-pop')`)) && rec[0] === s.dot, rec);

        // Every colour well, not just the brush.
        await d.ev(`(function(){ if (window.UIVisibility) UIVisibility.applyPreset('full'); return 1; })()`);
        await sleep(300);
        await sleep(300);
        const bg = await d.ev(`(function(){var e=document.getElementById('backgroundColorPicker'); var sec=e.closest('.sidebar-section'); if(sec && window.openSidebarSection) window.openSidebarSection(sec); var sc=e.parentElement; while(sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc=sc.parentElement; if(sc){ sc.scrollTop += e.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight/2; } var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width};})()`);
        await sleep(500);   // the sidebar scrolls smoothly: measure where it landed
        const bg2 = await rectOf(d, '#backgroundColorPicker');
        await d.click(bg2.x, bg2.y); await sleep(250);
        const bgPop = await d.ev(`(function(){var p=document.querySelector('.cp-pop'); return p && p.querySelector('.cp-pop-title').textContent;})()`);
        check('P5 the background well opens the same popover', bgPop === 'Background', bgPop);
        await d.tap('Escape', 'Escape', 27); await sleep(150);

        // ── Inline add under the palette's [+] ──
        await d.ev(`(function(){var t=Array.prototype.find.call(document.querySelectorAll('#sidebar-right .section-title, #sidebar-right h3'),function(e){return e.textContent.trim()==='Colors and palettes';}); var sec=t.closest('.sidebar-section'); if(window.openSidebarSection) window.openSidebarSection(sec); window.applyPalette(1); return 1;})()`);
        await sleep(300);
        check('C1 no key badges inside the colour row', (await d.ev(`document.querySelectorAll('#palettePreview .hk-cap').length`)) === 0);
        await d.ev(`document.getElementById('paletteAddChip').scrollIntoView({block:'center'})`);
        const add = await rectOf(d, '#paletteAddChip');
        await d.click(add.x, add.y); await sleep(250);
        const i1 = await d.ev(`(function(){var b=document.querySelector('#palettePickerHost .cp-primary'); return {shown: !document.getElementById('palettePickerHost').hidden, text: b && b.textContent, disabled: b && b.disabled, start: document.querySelector('#palettePickerHost .cp-hex').value, mode: window.multiArmColors[0].mode};})()`);
        check('I1 [+] opens the picker in place, ready to add even in Palette mode', i1.shown && !i1.disabled && i1.text === 'Add to palette' && i1.mode === 'step', i1);
        const typeHex = async (hex) => {
            const h = await rectOf(d, '#palettePickerHost .cp-hex');
            await d.click(h.x, h.y);
            await d.ev(`(function(){var i=document.querySelector('#palettePickerHost .cp-hex'); i.select(); return 1;})()`);
            await d.send('Input.insertText', { text: hex });
            await sleep(250);
            return d.ev(`(function(){var b=document.querySelector('#palettePickerHost .cp-primary'); return {text:b.textContent, disabled:b.disabled, match:Array.prototype.map.call(document.querySelectorAll('#palettePreview .palette-chip-wrap.is-match'),function(w){return w.dataset.hex;})};})()`);
        };
        const existing = await d.ev(`window.paletteActiveColours()[3]`);
        let st = await typeHex(existing);
        check('I2 a colour already there: Add is off, says so, and that colour is ringed', st.disabled && st.text === 'Already in this palette' && st.match[0] === existing, st);
        const n0 = await d.ev(`window.paletteActiveColours().length`);
        st = await typeHex('#E85D75');
        check('I3 a new colour: Add is on', !st.disabled && st.text === 'Add to palette', st);
        const ab = await rectOf(d, '#palettePickerHost .cp-primary');
        await d.click(ab.x, ab.y); await sleep(250);
        const after1 = await d.ev(`({cols: window.paletteActiveColours(), saved: window.settingsManager.get('palettes.user'), btn: document.querySelector('#palettePickerHost .cp-primary').textContent, dot: document.getElementById('colorPicker').value.toUpperCase()})`);
        check('I4 Add puts it in the palette, saved, and says Added', after1.cols.length === n0 + 1 && after1.cols.indexOf('#E85D75') >= 0 && JSON.stringify(after1.saved).indexOf('#E85D75') >= 0 && after1.btn === 'Added', after1);
        check('I5 adding to the palette leaves the brush colour alone', after1.dot !== '#E85D75', after1.dot);
        await d.shot('palette-inline-add.png');
        await d.tap('Escape', 'Escape', 27); await sleep(150);
        // Escape in the hex field only leaves the field; a second one closes.
        await d.tap('Escape', 'Escape', 27); await sleep(150);
        check('I6 Escape closes it', await d.ev(`document.getElementById('palettePickerHost').hidden`));

        // ── Change a colour (double-click) ──
        const chip = await rectOf(d, '#palettePreview .palette-chip-wrap[data-hex="#E85D75"] .palette-chip');
        await d.move(chip.x, chip.y);
        await d.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: chip.x, y: chip.y, button: 'left', buttons: 1, clickCount: 1 });
        await d.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: chip.x, y: chip.y, button: 'left', buttons: 0, clickCount: 1 });
        await d.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: chip.x, y: chip.y, button: 'left', buttons: 1, clickCount: 2 });
        await d.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: chip.x, y: chip.y, button: 'left', buttons: 0, clickCount: 2 });
        await sleep(250);
        const ed = await d.ev(`(function(){var b=document.querySelector('#palettePickerHost .cp-primary'); return b && {text:b.textContent, disabled:b.disabled, editing:Array.prototype.map.call(document.querySelectorAll('#palettePreview .is-editing'),function(w){return w.dataset.hex;}), title:document.querySelector('#palettePickerHost .cp-title').textContent};})()`);
        check('E1 double-click opens Change this colour on that colour', ed && ed.title === 'Change this colour' && ed.disabled && ed.editing[0] === '#E85D75', ed);
        st = await typeHex('#5DE8C1');
        const cb = await rectOf(d, '#palettePickerHost .cp-primary');
        await d.click(cb.x, cb.y); await sleep(250);
        const ed2 = await d.ev(`({cols: window.paletteActiveColours(), open: ColourPicker.inlineOpen()})`);
        check('E2 Change it replaces the colour in place', ed2.cols.indexOf('#5DE8C1') === n0 && ed2.cols.indexOf('#E85D75') < 0 && !ed2.open, ed2);

        // ── Shift+S with a colour already there: the note is under the row ──
        await d.ev(`(function(){ window.setActiveBrushColorMode('fixed', {color: ${JSON.stringify(existing.toLowerCase())}}); document.activeElement && document.activeElement.blur(); return 1; })()`);
        await d.tap('S', 'KeyS', 83, ['shift'], 'S'); await sleep(120);
        const note = await d.ev(`(function(){var n=document.getElementById('paletteNote'), row=document.getElementById('palettePreview'), st=document.getElementById('paletteImportStatus'); return {text:n.hidden?null:n.textContent, below: n.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 1, gap: Math.round(n.getBoundingClientRect().top - row.getBoundingClientRect().bottom), topStatus: st.textContent, ring: Array.prototype.map.call(document.querySelectorAll('#palettePreview .palette-chip-wrap.is-match'),function(w){return w.dataset.hex;})};})()`);
        check('N1 Shift+S on a colour already there: the note sits right under the row, the colour is ringed, nothing up top', note.text === 'Already in this palette' && note.below && note.gap < 12 && !note.topStatus && note.ring[0] === existing, note);
        await d.shot('palette-duplicate-note.png');

        // ── Eyedropper: Alt+click the canvas ──
        await d.ev(`(function(){ window.setActiveBrushColorMode('fixed', {color:'#ff2020'}); return 1; })()`);
        await paint(d, cv.x - 80, cv.y - 80, cv.x + 80, cv.y - 80);
        await d.ev(`(function(){ window.setActiveBrushColorMode('fixed', {color:'#ffffff'}); return 1; })()`);
        const dyeBefore = await d.ev(`(function(){var c=document.getElementById('canvas'); var t=document.createElement('canvas'); t.width=c.width; t.height=c.height; var x=t.getContext('2d'); x.drawImage(c,0,0); var p=x.getImageData(0,0,c.width,c.height).data, n=0; for(var i=0;i<p.length;i+=4) n+=p[i]+p[i+1]+p[i+2]; return n;})()`);
        await d.move(cv.x, cv.y - 80);
        await d.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cv.x, y: cv.y - 80, button: 'left', buttons: 1, clickCount: 1, modifiers: 1 });
        await sleep(200);
        const mid = await d.ev(`({sampling: ColourPicker.isSampling(), loupe: !!document.querySelector('.cp-loupe:not([hidden])'), hex: (document.querySelector('.cp-loupe-hex')||{}).textContent})`);
        await d.shot('eyedropper-loupe.png');
        await d.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cv.x, y: cv.y - 80, button: 'left', buttons: 0, clickCount: 1, modifiers: 1 });
        await sleep(200);
        const picked = await d.ev(STATE);
        check('D1 Alt+press shows the loupe with a hex', mid.sampling && mid.loupe && /^#[0-9A-F]{6}$/.test(mid.hex || ''), mid);
        check('D2 letting go picks that colour for the brush', picked.dot === mid.hex && picked.mode === 'fixed' && picked.dot !== '#FFFFFF', { picked, mid });
        const dot2 = await d.ev(`ColourPicker.recents()[0]`);
        check('D3 the pick is in recents', dot2 === mid.hex, dot2);
        check('D4 the loupe and the frozen frame are gone', await d.ev(`!document.querySelector('.cp-loupe') && !document.querySelector('.cp-veil') && !document.body.classList.contains('cp-sampling')`));

        // ── The palette dropdown (2026-10-08) ──
        await d.ev(`(function(){ window.applyPalette(1); document.activeElement && document.activeElement.blur(); return 1; })()`);
        await sleep(150);
        await d.ev(`document.getElementById('paletteSelect').scrollIntoView({block:'center'})`);
        await sleep(400);
        const trig = await rectOf(d, '#paletteSelect');
        await d.click(trig.x, trig.y); await sleep(250);
        const lst = await d.ev(`(function(){var l=document.querySelector('.palette-list'); if(!l) return null; var opts=l.querySelectorAll('.palette-option'); return {first:l.firstElementChild.className, n:opts.length, pals: window.curatedPalettes.length, strips:Array.prototype.every.call(opts,function(o){return o.querySelectorAll('.palette-option-strip span').length > 0;}), active:(l.querySelector('.palette-option.active .palette-option-name')||{}).textContent, focused: document.activeElement && document.activeElement.classList.contains('active')};})()`);
        check('L1 the dropdown lists every palette over its colours, New palette first, the one in use marked and focused', lst && lst.first === 'palette-new-row' && lst.n === lst.pals && lst.strips && lst.active === 'Forest Serenity' && lst.focused, lst);
        await d.tap('ArrowDown', 'ArrowDown', 40); await sleep(60);
        await d.tap('Enter', 'Enter', 13); await sleep(250);
        const l2 = await d.ev(`({open: !!document.querySelector('.palette-list'), name: document.querySelector('#paletteSelect .palette-select-name').textContent, idx: window.currentPaletteIndex, mode: window.multiArmColors[0].mode})`);
        check('L2 arrow down + Enter picks the next palette, in Palette mode, and closes the list', !l2.open && l2.idx === 2 && l2.name === 'Sunset Dreams' && l2.mode === 'step', l2);
        check('L3 no "Next" line under the colours', await d.ev(`!document.getElementById('paletteStepIndicator') || getComputedStyle(document.getElementById('paletteStepIndicator')).display === 'none'`));
        const act = await d.ev(`({active: Array.prototype.map.call(document.querySelectorAll('#palettePreview .palette-chip-wrap.is-active'),function(w){return w.dataset.hex;}), dot: document.getElementById('colorPicker').value.toUpperCase()})`);
        check('L4 the colour the next stroke paints is the one marked active', act.active.length === 1 && act.active[0] === act.dot, act);

        // ── Keys: Ctrl+Shift+← → palette, Ctrl+← → colour ──
        await d.tap('ArrowRight', 'ArrowRight', 39, ['ctrl', 'shift']); await sleep(200);
        check('K1 Ctrl+Shift+→ switches to the next palette', (await d.ev('window.currentPaletteIndex')) === 3);
        await d.tap('ArrowLeft', 'ArrowLeft', 37, ['ctrl', 'shift']); await sleep(200);
        check('K2 Ctrl+Shift+← goes back', (await d.ev('window.currentPaletteIndex')) === 2);
        const cols = await d.ev('window.paletteActiveColours()');
        await d.ev(`(function(){ window.setActiveBrushColorMode('fixed', {color: ${JSON.stringify(cols[0].toLowerCase())}}); return 1; })()`);
        await d.tap('ArrowRight', 'ArrowRight', 39, ['ctrl']); await sleep(200);
        let k = await d.ev(STATE);
        const k3act = await d.ev(`Array.prototype.map.call(document.querySelectorAll('#palettePreview .palette-chip-wrap.is-active'),function(w){return w.dataset.hex;})`);
        check('K3 in One mode Ctrl+→ makes the next palette colour the brush colour, and marks it', k.mode === 'fixed' && k.dot === cols[1] && k3act[0] === cols[1] && (await d.ev('window.currentPaletteIndex')) === 2, { k, k3act });
        await d.tap('ArrowLeft', 'ArrowLeft', 37, ['ctrl']); await sleep(200);
        k = await d.ev(STATE);
        check('K4 Ctrl+← goes back a colour', k.dot === cols[0], k);
        await d.tap('n', 'KeyN', 78, [], 'n'); await sleep(200);
        k = await d.ev(STATE);
        check('K5 N does the same in One mode (it used to move the dot only)', k.dot === cols[1] && k.mode === 'fixed', k);

        // ── Rename from the dropdown's right-click menu ──
        await d.click(trig.x, trig.y, 'right'); await sleep(200);
        const ren = await d.ev(`(function(){var b=Array.prototype.find.call(document.querySelectorAll('.palette-menu .brush-shape-menu-item'),function(x){return x.textContent==='Rename';}); if(!b) return null; var r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        if (ren) { await d.click(ren.x, ren.y); await sleep(200); }
        const inTrig = await d.ev(`!!document.querySelector('#paletteSelect .palette-name-input') && document.activeElement && document.activeElement.classList.contains('palette-name-input')`);
        await d.ev(`document.activeElement.select(), 1`);
        await d.send('Input.insertText', { text: 'Dusk' });
        await d.tap('Enter', 'Enter', 13); await sleep(250);
        const rn = await d.ev(`({name: document.querySelector('#paletteSelect .palette-select-name').textContent, saved: window.curatedPalettes[window.currentPaletteIndex].name})`);
        check('R1 right-click the dropdown → Rename edits the name in place', !!ren && inTrig && rn.name === 'Dusk' && rn.saved === 'Dusk', { ren: !!ren, inTrig, rn });
        await d.shot('palette-dropdown.png');

        // ── Buttons inherit their colour (css/01-buttons) ──
        await d.click(dot.x, dot.y); await sleep(200);
        await d.click(add.x, add.y); await sleep(200);
        const audit = await d.ev(`(function(){ var r = window.auditButtons ? window.auditButtons() : null; var all = r ? (r.rules || []).concat(r.inline || []) : []; return { n: all.length, ours: all.filter(function(o){ return /cp-|palette-/.test(JSON.stringify(o)); }) }; })()`);
        check('A1 auditButtons: nothing in the picker colours its own buttons', audit.ours.length === 0, audit);
        const errs = d.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description);
        check('X1 no page exceptions', errs.length === 0, errs.slice(0, 3));
    } finally { await d.close(); }

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
