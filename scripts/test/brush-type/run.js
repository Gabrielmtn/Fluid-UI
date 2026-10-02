// Tab switches the brush (js/59-brush-type-key.js), headless Chrome with
// trusted keys and mouse against the repo's own files:
//   node scripts/test/brush-type/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// SHOT_DIR= writes the pill screenshot there. Exit code 1 if any check failed.
//
// Checks: Tab steps Fluid → Pressure → Collider → Fluid and Shift+Tab goes
// back, each landing exactly where the drawer's own button would (config,
// lit button, a live collider bound once and re-entered, not re-made); a
// held Tab steps once; a press mid-stroke waits for the lift; Tab is left
// alone in a text field, with Ctrl, in a confirm dialog, and when it
// cancels a listening hotkey picker; the pill; the F1 line; the picker's
// reason; the recipes.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const TAB = ['Tab', 'Tab', 9];

(async () => {
    const d = await boot();
    try {
        const state = () => d.ev(`(function(){
            var c = window.config, row = document.querySelectorAll('.brush-settings-panel .brush-mode-row')[0];
            var lit = row ? Array.prototype.filter.call(row.querySelectorAll('.brush-mode-btn'), function (b) { return b.classList.contains('active'); }).map(function (b) { return b.textContent; }) : null;
            var p = document.getElementById('brushTypePill');
            return { type: window.BrushType.get(), velOnly: !!c.BRUSH_VELOCITY_ONLY, target: c.BRUSH_TARGET, lit: lit,
                pill: p && !p.hidden ? p.querySelector('.bt-name.on').textContent : null,
                hint: p && !p.hidden ? !p.querySelector('.bt-hint').hidden : null,
                live: !!(window.collisionLayers && window.collisionLayers.isSketchLive && window.collisionLayers.isSketchLive()),
                masks: window.Masks ? window.Masks.list().length : -1,
                active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null };
        })()`);
        const tab = async (mods) => { await d.tap(...TAB, mods || []); await sleep(120); return state(); };

        check('T0 the API is there and a fresh profile starts on Fluid', (await d.ev('typeof window.BrushType.set')) === 'function' && (await state()).type === 'fluid', await state());

        // ── Forward ──
        await d.move(800, 450);
        let s = await tab();
        check('T1 Tab → Pressure: velocity-only, fluid target, Pressure lit, pill says Pressure', s.type === 'pressure' && s.velOnly && s.target === 'fluid' && s.lit.join() === 'Pressure' && s.pill === 'Pressure' && s.hint === false, s);
        await d.shot('brush-type-pill.png');
        const masks0 = s.masks;
        s = await tab();
        check('T2 Tab → Collider: mask target, not velocity-only, a live collider bound, Collider lit', s.type === 'collider' && !s.velOnly && s.target === 'mask' && s.live && s.lit.join() === 'Collider' && s.pill === 'Collider', s);
        const masks1 = s.masks;
        s = await tab();
        check('T3 Tab → Fluid: back to dye, Fluid lit', s.type === 'fluid' && !s.velOnly && s.target === 'fluid' && s.lit.join() === 'Fluid' && s.pill === 'Fluid', s);
        await tab(); s = await tab();
        check('T4 a second lap re-enters the same collider (no new Mask)', s.type === 'collider' && s.masks === masks1 && masks1 === masks0 + 1, { masks0, masks1, now: s.masks });
        await tab();

        // ── Back ──
        const back = [];
        for (let i = 0; i < 3; i++) back.push((await tab(['shift'])).type);
        check('T5 Shift+Tab goes back: Collider, Pressure, Fluid', back.join() === 'collider,pressure,fluid', back);

        // ── A held Tab steps once ──
        await d.keyDown(...TAB, [], undefined, false);
        for (let i = 0; i < 4; i++) { await sleep(40); await d.keyDown(...TAB, [], undefined, true); }
        await d.keyUp(...TAB); await sleep(120);
        s = await state();
        check('T6 a held Tab (4 OS repeats) steps once', s.type === 'pressure', s);
        await tab(['shift']);

        // ── Mid-stroke ──
        await d.move(800, 450); await d.down(800, 450); await sleep(60);
        await d.move(830, 460, 1); await sleep(60);
        s = await tab();
        const mid = s;
        await d.move(860, 470, 1); await sleep(60);
        const still = await state();
        await d.up(860, 470); await sleep(200);
        s = await state();
        check('T7 Tab mid-stroke waits: still Fluid while down, pill says Pressure + "when you lift"', mid.type === 'fluid' && still.type === 'fluid' && mid.pill === 'Pressure' && mid.hint === true, { mid, still });
        check('T7 ...and lands on the lift', s.type === 'pressure' && s.velOnly && s.hint === false, s);
        await tab(['shift']);

        // ── A focused button (mouse focus) still switches; focus stays put ──
        await d.ev(`(function(){ var b = document.getElementById('mutationGenerate'); b.focus(); return document.activeElement === b; })()`);
        s = await tab();
        check('T8 with a button focused, Tab still switches and focus stays on it', s.type === 'pressure' && s.active === 'mutationGenerate', s);
        await tab(['shift']);
        await d.ev('document.activeElement && document.activeElement.blur()');

        // ── Left alone ──
        await d.ev(`(function(){ var a = document.createElement('input'); a.id = 'btText1'; var b = document.createElement('input'); b.id = 'btText2'; document.body.appendChild(a); document.body.appendChild(b); a.focus(); return 1; })()`);
        s = await tab();
        check('T9 in a text field Tab moves to the next field, brush unchanged', s.type === 'fluid' && s.active === 'btText2', s);
        await d.ev(`(function(){ ['btText1','btText2'].forEach(function(id){ var e = document.getElementById(id); if (e) e.remove(); }); document.activeElement && document.activeElement.blur(); return 1; })()`);

        const ctrlTab = await d.ev(`(function(){ var e = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', ctrlKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return { prevented: e.defaultPrevented, type: window.BrushType.get() }; })()`);
        check('T10 Ctrl+Tab is not taken', !ctrlTab.prevented && ctrlTab.type === 'fluid', ctrlTab);

        await d.ev(`document.getElementById('deletePaletteModal').classList.add('show')`);
        s = await tab();
        check('T11 with a confirm dialog up, Tab is left to the dialog', s.type === 'fluid', s);
        await d.ev(`document.getElementById('deletePaletteModal').classList.remove('show')`);

        // ── A listening hotkey picker: Tab cancels it and nothing else ──
        await d.ev(`(function(){ var s = document.querySelector('.stroke-lock-block'); window.openSidebarSection(s.closest('.sidebar-section')); return 1; })()`);
        await sleep(1500);
        await d.ev(`document.querySelector('.stroke-lock-block').scrollIntoView({block:'center'})`); await sleep(900);
        const key = await d.ev(`(function(){ var e = document.querySelector('.stroke-lock-block .stroke-lock-row .hk-picker-key'); var r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
        await d.click(key.x, key.y); await sleep(100);
        const listening = await d.ev('window.Hotkeys.isListening()');
        s = await tab();
        check('T12 Tab on a listening hotkey field cancels it and leaves the brush alone', listening && !(await d.ev('window.Hotkeys.isListening()')) && s.type === 'fluid', { listening, s });
        await d.ev('document.activeElement && document.activeElement.blur()');

        // ── The drawer's buttons, unchanged ──
        const clicks = await d.ev(`(function(){
            var row = document.querySelectorAll('.brush-settings-panel .brush-mode-row')[0].querySelectorAll('.brush-mode-btn');
            var out = [];
            [1, 2, 0].forEach(function (i) { row[i].click(); out.push(window.BrushType.get() + ':' + !!window.config.BRUSH_VELOCITY_ONLY + ':' + window.config.BRUSH_TARGET); });
            return out;
        })()`);
        check('T13 the drawer buttons still switch exactly as before', clicks.join() === 'pressure:true:fluid,collider:false:mask,fluid:false:fluid', clicks);

        // ── Out of raster-layer painting ──
        await d.ev(`window.config.BRUSH_TARGET = 'sketch'`);
        const sk = await d.ev('window.BrushType.get()');
        s = await tab();
        check('T14 painting a raster layer is none of the three; Tab lands on Fluid', sk === 'sketch' && s.type === 'fluid', { sk, s });

        // ── Words ──
        const says = await d.ev(`window.Hotkeys.reservedBy('Tab')`);
        check('T15 a hotkey picker refuses Tab with the new reason', /switches the brush/.test(says || ''), says);
        const ct = await d.ev(`[window.Hotkeys.reservedBy('Ctrl+Tab'), window.Hotkeys.isNative('Ctrl+Tab'), window.Hotkeys.isNative('Tab'), window.Hotkeys.reservedBy('Shift+Tab')]`);
        check('T15 ...Ctrl+Tab stays the browser\'s, Shift+Tab is the brush\'s', ct[0] === 'already belongs to the browser' && ct[1] === true && ct[2] === false && /switches the brush/.test(ct[3] || ''), ct);
        const sheet = await d.ev(`(function(){ var li = Array.prototype.find.call(document.querySelectorAll('.hotkey-modal li'), function (l) { return /^Tab/.test(l.textContent); }); return li ? li.textContent : null; })()`);
        check('T16 the F1 sheet lists Tab', /Fluid → Pressure → Collider/.test(sheet || ''), sheet);
        const rec = await d.ev(`window.Recipes.search('tab').map(function (x) { return x.id || (x.recipe && x.recipe.id); })`);
        check('T16 How do I: "tab" finds the Pressure and Collider recipes', rec.indexOf('pressure-brush') >= 0 && rec.indexOf('paint-collider') >= 0, rec);

        await sleep(1600);
        check('T17 the pill goes away by itself', await d.ev(`document.getElementById('brushTypePill').hidden`));

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('T18 no page exceptions', errs.length === 0, errs.slice(0, 3));
    } catch (err) {
        check('harness', false, String(err && err.stack || err));
    } finally {
        await d.close();
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('');
    console.log((results.length - failed) + '/' + results.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
