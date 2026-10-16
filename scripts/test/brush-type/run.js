// ~ switches the brush (js/59-brush-type-key.js), headless Chrome with
// trusted keys and mouse against the repo's own files:
//   node scripts/test/brush-type/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// SHOT_DIR= writes the pill screenshot there. Exit code 1 if any check failed.
//
// Checks: the ~ key (Backquote, Shift or not) steps Fluid → Pressure →
// Collider → Fluid, each landing exactly where the drawer's own button would
// (config, lit button, a live collider bound once and re-entered, not
// re-made); a held key steps once; a press mid-stroke waits for the lift;
// the key types in a text field, is left alone with Ctrl, in a confirm
// dialog, and by a listening hotkey picker; Tab no longer touches the brush;
// the pill; the F1 line; the picker's reasons. Tab was the key until
// 2026-10-15 (now the skip menu, js/66 — scripts/test/skip-menu/run.js).
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const GRAVE = ['`', 'Backquote', 192];
const TILDE = ['~', 'Backquote', 192];

(async () => {
    const d = await boot();
    try {
        const state = () => d.ev(`(function(){
            var c = window.config, row = document.querySelectorAll('.brush-settings-panel .brush-mode-row')[0];
            var lit = row ? Array.prototype.filter.call(row.querySelectorAll('.brush-mode-btn'), function (b) { return b.classList.contains('active'); }).map(function (b) { return b.textContent; }) : null;
            var p = document.getElementById('brushTypePill');
            return { type: window.BrushType.get(), velOnly: !!c.BRUSH_VELOCITY_ONLY, target: c.BRUSH_TARGET, lit: lit,
                pill: p && !p.hidden ? p.querySelector('.bt-name.on').textContent : null,
                cap: p ? p.querySelector('.hk-cap').textContent : null,
                hint: p && !p.hidden ? !p.querySelector('.bt-hint').hidden : null,
                live: !!(window.collisionLayers && window.collisionLayers.isSketchLive && window.collisionLayers.isSketchLive()),
                masks: window.Masks ? window.Masks.list().length : -1,
                skip: !!(window.SkipMenu && window.SkipMenu.isOpen()),
                active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null };
        })()`);
        // Shift+~ is how ~ is typed on a US keyboard; the bare key is `.
        const press = async (shift) => { await d.tap(...(shift ? TILDE : GRAVE), shift ? ['shift'] : []); await sleep(120); return state(); };

        check('T0 the API is there and a fresh profile starts on Fluid', (await d.ev('typeof window.BrushType.set')) === 'function' && (await state()).type === 'fluid', await state());

        // ── Forward ──
        await d.move(800, 450);
        let s = await press(true);
        check('T1 ~ → Pressure: velocity-only, fluid target, Pressure lit, pill says Pressure under a ~ cap', s.type === 'pressure' && s.velOnly && s.target === 'fluid' && s.lit.join() === 'Pressure' && s.pill === 'Pressure' && s.cap === '~' && s.hint === false, s);
        await d.shot('brush-type-pill.png');
        const masks0 = s.masks;
        s = await press(true);
        check('T2 ~ → Collider: mask target, not velocity-only, a live collider bound, Collider lit', s.type === 'collider' && !s.velOnly && s.target === 'mask' && s.live && s.lit.join() === 'Collider' && s.pill === 'Collider', s);
        const masks1 = s.masks;
        s = await press(true);
        check('T3 ~ → Fluid: back to dye, Fluid lit', s.type === 'fluid' && !s.velOnly && s.target === 'fluid' && s.lit.join() === 'Fluid' && s.pill === 'Fluid', s);
        await press(true); s = await press(true);
        check('T4 a second lap re-enters the same collider (no new Mask)', s.type === 'collider' && s.masks === masks1 && masks1 === masks0 + 1, { masks0, masks1, now: s.masks });
        await press(true);

        // ── Without Shift: the same key, the same step ──
        const plain = [];
        for (let i = 0; i < 3; i++) plain.push((await press(false)).type);
        check('T5 the bare key (`) steps forward too: Pressure, Collider, Fluid', plain.join() === 'pressure,collider,fluid', plain);

        // ── A held key steps once ──
        await d.keyDown(...GRAVE, [], undefined, false);
        for (let i = 0; i < 4; i++) { await sleep(40); await d.keyDown(...GRAVE, [], undefined, true); }
        await d.keyUp(...GRAVE); await sleep(120);
        s = await state();
        check('T6 a held key (4 OS repeats) steps once', s.type === 'pressure', s);
        await press(); await press();

        // ── Mid-stroke ──
        await d.move(800, 450); await d.down(800, 450); await sleep(60);
        await d.move(830, 460, 1); await sleep(60);
        s = await press(true);
        const mid = s;
        await d.move(860, 470, 1); await sleep(60);
        const still = await state();
        await d.up(860, 470); await sleep(200);
        s = await state();
        check('T7 ~ mid-stroke waits: still Fluid while down, pill says Pressure + "when you lift"', mid.type === 'fluid' && still.type === 'fluid' && mid.pill === 'Pressure' && mid.hint === true, { mid, still });
        check('T7 ...and lands on the lift', s.type === 'pressure' && s.velOnly && s.hint === false, s);
        await press(); await press();

        // ── A focused button (mouse focus) still switches; focus stays put ──
        // A shown one: a button in a folded section can no longer take focus.
        await d.ev(`(function(){ var b = document.getElementById('resetAppBtn'); b.focus(); return document.activeElement === b; })()`);
        s = await press(true);
        check('T8 with a button focused, ~ still switches and focus stays on it', s.type === 'pressure' && s.active === 'resetAppBtn', s);
        await press(); await press();
        await d.ev('document.activeElement && document.activeElement.blur()');

        // ── Tab is not the brush key any more ──
        // Esc first: with nothing remembered, Tab goes to the skip menu (66).
        await d.tap('Escape', 'Escape', 27); await sleep(120);
        await d.tap('Tab', 'Tab', 9); await sleep(120);
        s = await state();
        check('T9 Tab leaves the brush alone (it opens the skip menu)', s.type === 'fluid' && s.skip, s);
        await d.tap('Escape', 'Escape', 27); await sleep(120);

        // ── Left alone ──
        await d.ev(`(function(){ var a = document.createElement('input'); a.id = 'btText1'; document.body.appendChild(a); a.focus(); return 1; })()`);
        await d.tap(...TILDE, ['shift'], '~'); await sleep(120);
        s = await state();
        const typed = await d.ev(`document.getElementById('btText1').value`);
        check('T10 in a text field ~ types a ~, brush unchanged', s.type === 'fluid' && typed === '~', { s, typed });
        await d.ev(`(function(){ var e = document.getElementById('btText1'); if (e) e.remove(); document.activeElement && document.activeElement.blur(); return 1; })()`);

        const ctrl = await d.ev(`(function(){ var e = new KeyboardEvent('keydown', { key: '\`', code: 'Backquote', ctrlKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return { prevented: e.defaultPrevented, type: window.BrushType.get() }; })()`);
        check('T11 Ctrl+` is not taken', !ctrl.prevented && ctrl.type === 'fluid', ctrl);

        await d.ev(`document.getElementById('deletePaletteModal').classList.add('show')`);
        s = await press(true);
        check('T12 with a confirm dialog up, ~ is left to the dialog', s.type === 'fluid', s);
        await d.ev(`document.getElementById('deletePaletteModal').classList.remove('show')`);

        // ── A listening hotkey picker: it refuses ~ and the brush stays ──
        await d.ev(`(function(){ var s = document.querySelector('.stroke-lock-block'); window.openSidebarSection(s.closest('.sidebar-section')); return 1; })()`);
        await sleep(1500);
        await d.ev(`document.querySelector('.stroke-lock-block').scrollIntoView({block:'center'})`); await sleep(900);
        const key = await d.ev(`(function(){ var e = document.querySelector('.stroke-lock-block .stroke-lock-row .hk-picker-key'); var r = e.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
        await d.click(key.x, key.y); await sleep(100);
        const listening = await d.ev('window.Hotkeys.isListening()');
        s = await press(true);
        const stillListening = await d.ev('window.Hotkeys.isListening()');
        check('T13 a listening hotkey field hears ~, refuses it, and the brush stays', listening && stillListening && s.type === 'fluid', { listening, stillListening, s });
        await d.tap('Escape', 'Escape', 27); await sleep(100);
        await d.ev('document.activeElement && document.activeElement.blur()');

        // ── The drawer's buttons, unchanged ──
        const clicks = await d.ev(`(function(){
            var row = document.querySelectorAll('.brush-settings-panel .brush-mode-row')[0].querySelectorAll('.brush-mode-btn');
            var out = [];
            [1, 2, 0].forEach(function (i) { row[i].click(); out.push(window.BrushType.get() + ':' + !!window.config.BRUSH_VELOCITY_ONLY + ':' + window.config.BRUSH_TARGET); });
            return out;
        })()`);
        check('T14 the drawer buttons still switch exactly as before', clicks.join() === 'pressure:true:fluid,collider:false:mask,fluid:false:fluid', clicks);

        // ── Out of raster-layer painting ──
        await d.ev(`window.config.BRUSH_TARGET = 'sketch'`);
        const sk = await d.ev('window.BrushType.get()');
        s = await press(true);
        check('T15 painting a raster layer is none of the three; ~ lands on Fluid', sk === 'sketch' && s.type === 'fluid', { sk, s });

        // ── Words ──
        const says = await d.ev(`[window.Hotkeys.reservedBy('Backquote'), window.Hotkeys.reservedBy('Shift+Backquote'), window.Hotkeys.isNative('Backquote')]`);
        check('T16 a hotkey picker refuses ` and ~ as the brush switch (a key press() can work)', /switches the brush/.test(says[0] || '') && /switches the brush/.test(says[1] || '') && says[2] === false, says);
        const ct = await d.ev(`[window.Hotkeys.reservedBy('Tab'), window.Hotkeys.reservedBy('Shift+Tab'), window.Hotkeys.isNative('Tab'), window.Hotkeys.reservedBy('Ctrl+Tab'), window.Hotkeys.isNative('Ctrl+Tab')]`);
        check('T16 ...Tab and Shift+Tab move focus, Ctrl+Tab stays the browser\'s', ct[0] === 'already moves keyboard focus' && ct[1] === 'already moves keyboard focus' && ct[2] === true && ct[3] === 'already belongs to the browser' && ct[4] === true, ct);
        const sheet = await d.ev(`(function(){ var li = Array.prototype.find.call(document.querySelectorAll('.hotkey-modal li'), function (l) { return /^~/.test(l.textContent); }); return li ? li.textContent : null; })()`);
        check('T17 the F1 sheet lists ~', /Fluid → Pressure → Collider/.test(sheet || ''), sheet);

        await sleep(1600);
        check('T18 the pill goes away by itself', await d.ev(`document.getElementById('brushTypePill').hidden`));

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('T19 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
