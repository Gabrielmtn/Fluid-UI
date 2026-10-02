// Radial menu, what it must not have broken (2026-09-30), headless Chrome
// with trusted input against the repo's own files (see driver.js).
//
// Checks: an ordinary hotkey picker still refuses the app's keys (E with its
// new reason) and Delete still removes a binding; Ctrl+Shift+H still puts a
// control on a key end to end (bind mode grew a destination for the menu);
// the recipes; the F1 sheet; and a touch with Left Click set to Radial menu
// (tap to open, drag a slider with the finger, tap off to close).
'use strict';
const { boot, sleep } = require('./driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const E = ['e', 'KeyE', 69];

(async () => {
    const d = await boot();
    try {
        const rect = (sel) => d.ev(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var r = e.getBoundingClientRect(); var x = r.left + r.width/2, y = r.top + r.height/2; var top = document.elementFromPoint(x, y); return { x: x, y: y, hit: !!top && (top === e || e.contains(top)) }; })()`);
        const clickSel = async (sel) => { const r = await rect(sel); if (!r || !r.hit) throw new Error('not clickable: ' + sel + ' ' + JSON.stringify(r)); await d.click(r.x, r.y); };

        // ── An ordinary picker (Stroke locks → Keep distance) ──
        await d.ev(`(function(){ var s = document.querySelector('.stroke-lock-block'); window.openSidebarSection(s.closest('.sidebar-section')); return 1; })()`);
        await sleep(1500);
        await d.ev(`document.querySelector('.stroke-lock-block').scrollIntoView({block:'center'})`); await sleep(900);
        const key = '.stroke-lock-block .stroke-lock-row .hk-picker-key';
        const note = () => d.ev(`document.querySelector('.stroke-lock-block > .hk-picker-note').textContent`);
        await clickSel(key);
        await d.tap(...E, [], 'e');
        const n1 = await note();
        check('R1 a binding picker refuses E, with the new reason', /already opens the radial menu/.test(n1) && !(await d.ev('window.RadialMenu.isOpen()')), n1);
        await d.tap(' ', 'Space', 32, [], ' ');
        check('R1 ...and Space', /already freezes/.test(await note()), await note());
        await d.tap('k', 'KeyK', 75, [], 'k');
        check('R1 K binds', (await d.ev(`window.StrokeLock.key('distance')`)) === 'KeyK');
        await clickSel(key);
        await d.tap('Delete', 'Delete', 46);
        check('R1 Delete still removes a binding', (await d.ev(`window.StrokeLock.key('distance')`)) === '');

        // ── Ctrl+Shift+H, onto a key, end to end ──
        await d.tap('h', 'KeyH', 72, ['ctrl', 'shift']); await sleep(250);
        const g0 = await d.ev(`document.getElementById('strokeLockGuides').checked`);
        await clickSel('#strokeLockGuides'); await sleep(250);
        const step2 = await d.ev(`(function(){ var b = document.getElementById('hkBindBar'); return b ? { step: b.dataset.step, say: b.querySelector('.hk-say').textContent } : null; })()`);
        check('R5 Ctrl+Shift+H: a checkbox chosen, not toggled; now it asks for the key', step2 && step2.step === '2' && /press the key/.test(step2.say) && (await d.ev(`document.getElementById('strokeLockGuides').checked`)) === g0 && (await d.ev('window.RadialMenu.items().length')) === 9, step2);
        await d.tap('j', 'KeyJ', 74, [], 'j'); await sleep(250);
        const step3 = await d.ev(`(function(){ var b = document.getElementById('hkBindBar'); return b ? { step: b.dataset.step, say: b.querySelector('.hk-say').textContent } : null; })()`);
        const binds = await d.ev(`window.HotkeyBinds.list().map(function(b){ return [b.combo, b.name]; })`);
        check('R5 the key is saved', step3 && step3.step === '3' && /Hotkey saved/.test(step3.say) && binds.length === 1 && binds[0][0] === 'KeyJ', { step3, binds });
        await d.tap('Escape', 'Escape', 27); await sleep(150);
        await d.ev('document.activeElement && document.activeElement.blur()');
        await d.tap('j', 'KeyJ', 74, [], 'j'); await sleep(100);
        check('R5 ...and works', (await d.ev(`document.getElementById('strokeLockGuides').checked`)) === !g0);
        await d.ev(`window.HotkeyBinds.list().forEach(function(b){ window.HotkeyBinds.remove(b.id); }); document.getElementById('strokeLockGuides').click()`);

        // ── Recipes ──
        const rec = await d.ev(`(function(){ var r = window.Recipes.search('radial'); return r.map(function(x){ return x.id || (x.recipe && x.recipe.id); }); })()`);
        check('R2 "radial" finds the recipe', rec.indexOf('radial-menu') >= 0, rec);
        const rec2 = await d.ev(`(function(){ var r = window.Recipes.search('export video'); return r.slice(0,3).map(function(x){ return x.id || (x.recipe && x.recipe.id); }); })()`);
        check('R2 export recipe still found', rec2.indexOf('export-video') >= 0, rec2);
        await d.ev(`window.Recipes.demo('radial-menu')`); await sleep(200);
        check('R2 the recipe demo opens the menu', await d.ev('window.RadialMenu.isOpen()'));
        await d.tap('Escape', 'Escape', 27);
        check('R2 Esc closes it', !(await d.ev('window.RadialMenu.isOpen()')));

        // ── F1 sheet ──
        const sheet = await d.ev(`(function(){ window.showHotkeys(); var t = [].map.call(document.querySelectorAll('#hotkeyOverlay li'), function(l){ return l.textContent; }); window.toggleHotkeys(); return { radial: t.filter(function(x){ return /Radial/.test(x); }), quick: t.filter(function(x){ return /Quick Export/.test(x); }) }; })()`);
        check('R3 F1 sheet lists the radial menu twice (E, middle-click) and no Quick Export key', sheet.radial.length === 2 && sheet.quick.length === 0, sheet);

        // ── Touch with Left = Radial menu ──
        const c = await d.ev(`(function(){ var c = document.getElementById('canvas').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; })()`);
        const cx = Math.round(c.l + c.w / 2), cy = Math.round(c.t + c.h / 2);
        await d.ev(`window.ButtonModes.setMode('left', 'radial')`);
        await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
        await sleep(60);
        const o1 = await d.ev('({ open: window.RadialMenu.isOpen(), down: !!window.pointer.down })');
        await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(100);
        check('R4 a touch opens the menu (Left = Radial menu), paints nothing, and a lift keeps it open', o1.open && !o1.down && (await d.ev('window.RadialMenu.isOpen()')), o1);
        const W = await d.ev(`(function(){ var w = document.querySelector('.radial-wheel').getBoundingClientRect(); return [].map.call(document.querySelectorAll('.radial-label'), function(l){ var r = l.getBoundingClientRect(); var x = r.left + r.width/2, y = r.top + r.height/2, dx = x - w.left, dy = y - w.top, n = Math.hypot(dx, dy); return { x: Math.round(x), y: Math.round(y), ux: dx / n, uy: dy / n }; }); })()`);
        const cb = W[4];
        await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cb.x, y: cb.y, id: 2 }] });
        await sleep(40);
        for (let k = 1; k <= 4; k++) { await d.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cb.x + cb.ux * 10 * k, y: cb.y + cb.uy * 10 * k, id: 2 }] }); await sleep(20); }
        await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(120);
        const v = await d.ev(`parseFloat(document.getElementById('colorBlend').value)`);
        // From Laminar / Blend's 0 in the middle of its -1..1 fader (2026-10-02).
        check('R4 a finger drags a slider on the wheel; the menu stays', v > 0.2 && v <= 1 && (await d.ev('window.RadialMenu.isOpen()')) && !(await d.ev('!!window.pointer.down')), v);
        await d.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx + 380, y: cy, id: 3 }] });
        await sleep(40);
        await d.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(120);
        check('R4 a tap off the wheel closes it', !(await d.ev('window.RadialMenu.isOpen()')) && !(await d.ev('!!window.pointer.down')));
        await d.ev(`window.ButtonModes.reset(); (function(){ var e = document.getElementById('colorBlend'); e.value = '0'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);

        const errs = d.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
        check('no page errors', errs.length === 0, errs.slice(0, 3).map(e => e.params.exceptionDetails ? (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) : (e.params.args || []).map(a => a.value || a.description).join(' ')));
    } catch (e) { console.error('DRIVER FAIL', e); results.push({ name: 'driver', ok: false }); }
    const bad = results.filter(r => !r.ok);
    console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
    await d.close();
    process.exit(bad.length ? 1 : 0);
})();
