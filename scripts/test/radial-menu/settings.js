// Radial menu, its list in Settings (2026-09-30), headless Chrome with
// trusted input against the repo's own files (see driver.js).
//
// Gabriel: "the user can add items as hotkeys", and: "binding the radial
// hotkeys has the same issue that hotkeys did, remember, opening more, or
// other UI opening/closing shouldn't trigger the hotkey setting to populate,
// only slider settings/select selections/toggles and the like".
//
// So items are chosen in js/49's bind mode with the menu as its destination.
// Checks: a profile saved before the middle button had a role; Stroke and
// replay's "Edit the menu" door; the nine slider rows; "+ Add from the
// interface" — More opening, a section folding open and the Presets menu
// add NOTHING and still work; a checkbox is taken without being toggled; a
// slider already on the menu is refused with a word; another slider goes on
// as a slider; a dropdown choice and a button go on as controls; the items
// run from the wheel; Ctrl+Shift+H still asks for a key afterwards. Then the
// key items (label + key: E and system keys refused, an app key taken
// without firing, a user-made hotkey), the list across a reload, the row's
// x, auditButtons, Back to the starting items, an emptied menu, and the
// API's own guards.
'use strict';
const { boot, sleep } = require('./driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const E = ['e', 'KeyE', 69];

(async () => {
    // A profile saved before this feature: two buttons only; and one user-made hotkey (Q → the cursor checkbox).
    const seed = {
        'fluidUI:input.buttonModes': JSON.stringify({ value: { left: { mode: 'mirror', mirror: 'y', alt: {} }, right: { mode: 'replay', mirror: 'x', alt: {} } }, timestamp: 1, version: '1.0.0' }),
        'fluidUI:hotkeys.controls': JSON.stringify({ value: [{ id: 't1', combo: 'KeyQ', kind: 'click', role: 'toggle', target: { id: 'cursorToggle' }, name: 'Show Cursor', where: 'Display' }], timestamp: 1, version: '1.0.0' })
    };
    const d = await boot({ seed });
    try {
        const rect = (sel) => d.ev(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var r = e.getBoundingClientRect(); var x = r.left + r.width/2, y = r.top + r.height/2; var top = document.elementFromPoint(x, y); return { x: x, y: y, l: r.left, w: r.width, h: r.height, hit: !!top && (top === e || e.contains(top)) }; })()`);
        const clickSel = async (sel) => { const r = await rect(sel); if (!r || !r.hit) throw new Error('not clickable: ' + sel + ' ' + JSON.stringify(r)); await d.click(r.x, r.y); return r; };
        const items = () => d.ev('window.RadialMenu.items()');
        const note = () => d.ev(`(function(){ var n = document.querySelector('.radial-block > .hk-picker-note'); return n ? { text: n.textContent, hidden: n.hidden, tone: n.dataset.tone || '' } : null; })()`);
        const bar = () => d.ev(`(function(){ var b = document.getElementById('hkBindBar'); if (!b) return null; return { step: b.dataset.step, steps: [].map.call(b.querySelectorAll('.hk-step-label'), function(s){ return s.textContent; }), say: b.querySelector('.hk-say').textContent, chip: (b.querySelector('.hk-chip-name') || {}).textContent || null }; })()`);
        const toast = () => d.ev(`(function(){ var t = document.getElementById('hkToast'); return t && !t.hidden ? t.textContent : ''; })()`);
        const tagSection = (title, id) => d.ev(`(function(){ var s = [].filter.call(document.querySelectorAll('#sidebar-right .sidebar-section'), function(x){ var t = x.querySelector('.section-title'); return t && t.textContent.trim() === ${JSON.stringify(title)}; })[0]; if (!s) return false; s.querySelector('.section-header').id = ${JSON.stringify(id)}; return s.classList.contains('collapsed'); })()`);

        const bm = await d.ev('JSON.parse(JSON.stringify(window.ButtonModes.state()))');
        check('M1 old saved buttons kept, middle gets the menu', bm.left.mode === 'mirror' && bm.left.mirror === 'y' && bm.right.mode === 'replay' && bm.middle.mode === 'radial', bm);
        await d.ev(`window.ButtonModes.setMode('left', 'paint')`);

        // ── The door from Stroke and replay ──
        await d.ev(`(function(){ var s = document.getElementById('buttonMode_middle'); window.openSidebarSection(s.closest('.sidebar-section')); return 1; })()`);
        await sleep(1500);
        await d.ev(`document.getElementById('buttonMode_middle').scrollIntoView({block:'center'})`);
        await sleep(900);
        await d.shot('buttons-block.png');
        const door = await d.ev(`(function(){ var s = document.getElementById('buttonMode_middle'); var out = []; [].forEach.call(s.parentElement.querySelectorAll('button'), function(x){ if (x.textContent === 'Edit the menu') { x.id = 'editMenuDoor'; out.push(getComputedStyle(x.parentElement).display); } }); return out; })()`);
        check('S0 middle row shows the Edit the menu door', door.length === 1 && door[0] !== 'none', door);
        await clickSel('#editMenuDoor');
        await sleep(2600);
        const blk = await rect('.radial-block');
        check('S1 Edit the menu opens Settings → Radial Menu on screen', blk && blk.y > 60 && blk.y < 805, blk);
        await d.shot('settings-block.png');
        const rows0 = await d.ev(`[].map.call(document.querySelectorAll('.radial-block .radial-row'), function(r){ return [r.querySelector('.hk-row-name').textContent, r.querySelector('.hk-row-sub').textContent]; })`);
        check('S1 nine rows, the top bar\'s sliders', rows0.length === 9 && rows0[0][0] === 'Brush Size' && rows0[7][0] === 'Density' && rows0.every(r => r[1] === 'Slider · Top bar'), rows0.map(r => r[0]));
        check('S1 reset hidden while the list is the starting one', await d.ev(`document.querySelector('.radial-reset').hidden`));

        // ── + Add from the interface: what opens or folds is never taken ──
        await clickSel('.radial-pick-btn'); await sleep(250);
        const b1 = await bar();
        check('A1 bind mode opens with the menu as its destination: two steps', b1 && b1.step === '1' && b1.steps.join('|') === 'Choose a control|Done' && /on the radial menu/.test(b1.say), b1);

        const more = await rect('.mixer-more-btn');
        if (more && more.hit) {
            await d.click(more.x, more.y); await sleep(300);
            const m = await d.ev(`document.querySelector('.mixer-more-btn').getAttribute('aria-expanded')`);
            check('A2 More opens as usual and adds nothing', m === 'true' && (await items()).length === 9 && (await bar()).step === '1', { expanded: m });
            await d.click(more.x, more.y); await sleep(300);
            check('A2 ...and closes as usual, still nothing', (await d.ev(`document.querySelector('.mixer-more-btn').getAttribute('aria-expanded')`)) === 'false' && (await items()).length === 9);
        } else {
            check('A2 More is on screen to test', false, more);
        }
        await clickSel('#mixerPresetsTrigger'); await sleep(300);
        check('A2 the Presets menu opens and adds nothing', (await items()).length === 9 && (await bar()).step === '1' && !!(await d.ev(`!!document.querySelector('.mixer-presets-panel')`)));
        await clickSel('#mixerPresetsTrigger'); await sleep(300);

        const wasCollapsed = await tagSection('Stroke and replay', 'secStroke');
        await d.ev(`document.getElementById('secStroke').scrollIntoView({block:'center'})`); await sleep(900);
        await clickSel('#secStroke'); await sleep(1500);
        const opened = await d.ev(`!document.getElementById('secStroke').parentElement.classList.contains('collapsed')`);
        check('A2 a section folds open under the click and adds nothing', wasCollapsed && opened && (await items()).length === 9 && (await bar()).step === '1');

        // a checkbox: taken, not toggled
        await d.ev(`document.getElementById('strokeLockGuides').scrollIntoView({block:'center'})`); await sleep(900);
        const g0 = await d.ev(`document.getElementById('strokeLockGuides').checked`);
        await clickSel('#strokeLockGuides'); await sleep(250);
        let its = await items();
        const b2 = await bar();
        check('A3 a checkbox goes on the menu, and the click that chose it did not toggle it', its.length === 10 && its[9].kind === 'click' && its[9].role === 'toggle' && its[9].target.id === 'strokeLockGuides' && (await d.ev(`document.getElementById('strokeLockGuides').checked`)) === g0, its[9]);
        check('A3 the bar says done, and what went on', b2.step === '3' && /On the radial menu/.test(b2.say) && b2.chip === 'Show guides', b2);

        // Add another → a slider that is already on the wheel
        await d.ev(`[].filter.call(document.querySelectorAll('#hkBindBar .hk-actions button'), function(b){ return b.textContent === 'Add another'; })[0].click()`);
        await sleep(200);
        const cbr = await rect('#colorBlend');
        await d.move(cbr.x, cbr.y); await d.down(cbr.x, cbr.y); await sleep(40); await d.up(cbr.x, cbr.y); await sleep(250);
        const t1 = await toast();
        check('A4 a slider already on the menu is refused, with the reason', /already on the radial menu/.test(t1) && (await items()).length === 10 && (await bar()).step === '1', t1);

        // ...and one that is not
        await d.ev(`document.getElementById('replaySpeed').scrollIntoView({block:'center'})`); await sleep(900);
        const rs = await rect('#replaySpeed');
        await d.move(rs.x, rs.y); await d.down(rs.x, rs.y); await sleep(40); await d.move(rs.x + 12, rs.y, 1); await d.up(rs.x + 12, rs.y); await sleep(250);
        its = await items();
        check('A5 another slider, moved and let go, goes on as a slider', its.length === 11 && its[10].kind === 'slider' && its[10].target.id === 'replaySpeed' && /^Slider · /.test((await bar()).chip || ''), { item: its[10], bar: await bar() });

        // a dropdown choice (the offer), by its change
        await d.ev(`[].filter.call(document.querySelectorAll('#hkBindBar .hk-actions button'), function(b){ return b.textContent === 'Add another'; })[0].click()`);
        await sleep(200);
        const sim0 = await d.ev(`document.getElementById('splatInMode').value`);
        const simNew = await d.ev(`(function(){ var s = document.getElementById('splatInMode'); var o = [].filter.call(s.options, function(x){ return x.value !== s.value; })[0]; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return { v: o.value, t: o.textContent.trim() }; })()`);
        await sleep(200);
        const offer = await d.ev(`(function(){ var o = document.querySelector('#hkBindBar .hk-offer'); return o ? o.textContent : null; })()`);
        check('A6 a dropdown choice is offered, not taken on change', /^Add/.test(offer || '') && (await items()).length === 11, offer);
        await clickSel('#hkBindBar .hk-offer'); await sleep(250);
        its = await items();
        check('A6 accepted: it goes on as "name → choice"', its.length === 12 && its[11].kind === 'value' && its[11].value === simNew.v && its[11].name === 'Splat In', its[11]);
        await d.ev(`(function(){ var s = document.getElementById('splatInMode'); s.value = ${JSON.stringify(sim0)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        // the menu is full now
        await d.ev(`[].filter.call(document.querySelectorAll('#hkBindBar .hk-actions button'), function(b){ return b.textContent === 'Add another'; })[0].click()`);
        await sleep(200);
        await clickSel('#strokeLockGuides'); await sleep(250);
        check('A7 a thirteenth item is refused with the reason', /holds 12 items/.test(await toast()) && (await items()).length === 12, await toast());
        await d.tap('Escape', 'Escape', 27); await sleep(150);
        check('A7 Esc leaves bind mode', (await bar()) === null);

        // Ctrl+Shift+H afterwards is the key flow again
        await d.tap('h', 'KeyH', 72, ['ctrl', 'shift']); await sleep(250);
        const b3 = await bar();
        check('A8 Ctrl+Shift+H still asks for a key: three steps', b3 && b3.steps.join('|') === 'Choose a control|Press a key|Done' && /on a key/.test(b3.say), b3);
        await d.tap('Escape', 'Escape', 27); await sleep(150);

        // ── The items work from the wheel ──
        const c = await d.ev(`(function(){ var c = document.getElementById('canvas').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; })()`);
        const cx = Math.round(c.l + c.w / 2), cy = Math.round(c.t + c.h / 2);
        const wedges = () => d.ev(`(function(){ var w = document.querySelector('.radial-wheel').getBoundingClientRect(); return [].map.call(document.querySelectorAll('.radial-label'), function(l){ var r = l.getBoundingClientRect(); var x = r.left + r.width/2, y = r.top + r.height/2, dx = x - w.left, dy = y - w.top, n = Math.hypot(dx, dy); var v = l.querySelector('.radial-label-val'); return { t: l.querySelector('.radial-label-text').textContent, v: v ? v.textContent : null, x: Math.round(x), y: Math.round(y), ux: dx / n, uy: dy / n }; }); })()`);
        const tapE = async () => { await d.ev('document.activeElement && document.activeElement.blur()'); await d.keyDown(...E, [], 'e'); await sleep(40); await d.keyUp(...E); await sleep(100); };
        await d.move(cx, cy); await tapE();
        let W = await wedges();
        await d.shot('radial-12.png');
        check('W1 twelve wedges: nine sliders, Show guides, Replay Speed as a slider, the dropdown choice', W.length === 12 && W[9].t === 'Show guides' && W[9].v === null && W[10].v !== null && / → /.test(W[11].t), W.slice(9));
        const sp0 = await d.ev(`parseFloat(document.getElementById('replaySpeed').value)`);
        await d.move(W[10].x, W[10].y); await sleep(40);
        await d.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W[10].x, y: W[10].y, deltaX: 0, deltaY: -100 }); await sleep(100);
        const sp1 = await d.ev(`parseFloat(document.getElementById('replaySpeed').value)`);
        check('W2 the added slider scrolls on the wheel', sp1 > sp0 && (await d.ev('window.RadialMenu.isOpen()')), { sp0, sp1 });
        await d.click(W[9].x, W[9].y); await sleep(150);
        check('W3 the checkbox item toggles its checkbox and closes the menu', (await d.ev(`document.getElementById('strokeLockGuides').checked`)) === !g0 && !(await d.ev('window.RadialMenu.isOpen()')));
        await d.move(cx, cy); await tapE();
        W = await wedges();
        await d.click(W[11].x, W[11].y); await sleep(150);
        check('W4 the dropdown item sets its choice', (await d.ev(`document.getElementById('splatInMode').value`)) === simNew.v);
        await d.ev(`(function(){ var s = document.getElementById('splatInMode'); s.value = ${JSON.stringify(sim0)}; s.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('strokeLockGuides').click(); return 1; })()`);

        // ── Reload: the list persists, kinds and all ──
        await d.load();
        const kept = await items();
        check('P1 list survives a reload', kept.length === 12 && kept[9].kind === 'click' && kept[10].kind === 'slider' && kept[11].kind === 'value' && kept[0].target.id === 'brushSize', kept.map(i => i.kind));

        // ── Rows, x, key items ──
        await d.ev('window.RadialMenu.openEditor()'); await sleep(2600);
        const rows1 = await d.ev(`[].map.call(document.querySelectorAll('.radial-block .radial-row'), function(r){ return [r.querySelector('.hk-row-name').textContent, r.querySelector('.hk-row-sub').textContent]; })`);
        check('R1 rows say what each item is', /toggles/.test(rows1[9][1]) && /^Slider · Stroke and replay/.test(rows1[10][1]) && /sets/.test(rows1[11][1]), rows1.slice(9));
        for (const n of [12, 11]) { await d.ev(`document.querySelector('.radial-block .radial-row:nth-child(${n}) .hk-row-del').scrollIntoView({block:'center'})`); await sleep(900); await clickSel(`.radial-block .radial-row:nth-child(${n}) .hk-row-del`); await sleep(100); }
        check('T19 × takes items off', (await items()).length === 10);

        await d.ev(`document.querySelector('.radial-add-label').scrollIntoView({block:'center'})`); await sleep(900);
        await clickSel('.radial-add-label');
        await d.tap(...E, [], 'e');
        const typed = await d.ev(`document.querySelector('.radial-add-label').value`);
        check('T16 E typed into the label stays a letter', typed === 'e' && !(await d.ev('window.RadialMenu.isOpen()')), typed);
        await d.ev(`(function(){ var i = document.querySelector('.radial-add-label'); i.value = ''; i.blur(); return 1; })()`);

        await clickSel('.radial-add .hk-picker-key');
        await d.tap(...E, [], 'e');
        const n1 = await note();
        check('T18 E refused with a reason', n1 && /opens this menu/.test(n1.text) && n1.tone === 'warn' && !(await d.ev('window.RadialMenu.isOpen()')), n1);
        // Headless Chrome swallows a CDP Ctrl+V before the page sees it, so this one press is synthetic.
        await d.ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, bubbles: true, cancelable: true })), 1`);
        const n2 = await note();
        check('T18 Ctrl+V refused: belongs to the system', n2 && /belongs to the system/.test(n2.text), n2);
        await d.tap('f', 'KeyF', 70, [], 'f');
        const after = await d.ev(`({ key: document.querySelector('.radial-add .hk-picker-key').textContent, label: document.querySelector('.radial-add-label').value, focus: !!(document.getElementById('focusModeToggle')||{}).checked })`);
        check('T17 F taken as the key (and not acted on), label suggested', after.key === 'F' && after.label === 'Toggles focus mode' && after.focus === false, after);
        await clickSel('.radial-add-btn');
        its = await items();
        check('T17 Add puts a key item on the menu, written through at once', its.length === 11 && its[10].kind === 'key' && its[10].label === 'Toggles focus mode' && its[10].combo === 'KeyF'
            && (await d.ev(`JSON.parse(localStorage.getItem('fluidUI:hotkeys.radialMenu')).value.length`)) === 11, its[10]);

        await clickSel('.radial-add-label');
        for (const ch of 'Cursor') await d.tap(ch, 'Key' + ch.toUpperCase(), ch.toUpperCase().charCodeAt(0), ch === 'C' ? ['shift'] : [], ch);
        await clickSel('.radial-add .hk-picker-key');
        const cur0 = await d.ev(`document.getElementById('cursorToggle').checked`);
        await d.tap('q', 'KeyQ', 81, [], 'q');
        check('T22 a typed label is kept, and recording Q did not fire Q', (await d.ev(`document.querySelector('.radial-add-label').value`)) === 'Cursor' && cur0 === (await d.ev(`document.getElementById('cursorToggle').checked`)));
        await clickSel('.radial-add-btn');
        const row12 = await d.ev(`(function(){ var r = document.querySelectorAll('.radial-block .radial-row')[11]; return r ? [(r.querySelector('.hk-cap') || {}).textContent, r.querySelector('.hk-row-name').textContent, r.querySelector('.hk-row-sub').textContent] : null; })()`);
        check('T22 a user-made hotkey listed with what it does', row12 && row12[0] === 'Q' && row12[1] === 'Cursor' && /Show Cursor/.test(row12[2]), row12);
        await d.move(cx, cy); await tapE();
        W = await wedges();
        await d.click(W[11].x, W[11].y); await sleep(150);
        check('T22 choosing it on the wheel runs the user hotkey', W[11].t === 'Cursor' && (await d.ev(`document.getElementById('cursorToggle').checked`)) === !cur0);

        // ── Audit, reset, empty, guards ──
        const audit = await d.ev(`(function(){ var a = window.auditButtons(); return { total: a.total, clean: a.clean, rules: a.rules, inline: a.inline }; })()`);
        check('T23 auditButtons clean', audit.total === audit.clean, { total: audit.total, clean: audit.clean, rules: audit.rules.slice(0, 4), inline: audit.inline.slice(0, 4) });

        await d.ev(`document.querySelector('.radial-reset').scrollIntoView({block:'center'})`); await sleep(900);
        await clickSel('.radial-reset'); await sleep(200);
        const modal = await d.ev(`(function(){ var m = document.getElementById('appConfirmModal'); return m && m.classList.contains('show') ? m.querySelector('#appConfirmTitle').textContent : null; })()`);
        check('T20 reset asks first', modal === 'Go back to the starting items?', modal);
        await clickSel('#appConfirmOk'); await sleep(200);
        its = await items();
        check('T20 the top bar\'s nine sliders are back', its.length === 9 && its.every(i => i.kind === 'slider') && its[0].target.id === 'brushSize' && (await d.ev(`document.querySelector('.radial-reset').hidden`)));

        await d.ev(`window.RadialMenu.items().forEach(function(i){ window.RadialMenu.remove(i.id); })`);
        await d.move(cx, cy); await tapE();
        const empty = await d.ev(`(function(){ var e = document.querySelector('.radial-empty'); return e ? e.textContent : null; })()`);
        check('T27 an emptied menu opens with a pointer to Settings', /Settings → Radial Menu/.test(empty || ''), empty);
        await d.click(cx + 200, cy);
        check('T27 a click closes it', !(await d.ev('window.RadialMenu.isOpen()')));
        await d.load();
        check('T27 an emptied list stays empty after a reload', (await items()).length === 0);
        await d.ev('window.RadialMenu.reset()');

        const guards = await d.ev(`(function(){ var R = window.RadialMenu; var a = R.add({ label: 'x', combo: 'KeyE' }); var b = R.add({ label: 'x', combo: 'Ctrl+KeyV' }); var c = R.add({ slider: 'colorBlend' }); var dd = R.add({ slider: 'nope' }); var s = R.add({ slider: 'replaySpeed' }); var n = 0; while (R.add({ label: 'k' + n, combo: 'KeyK' }) && n < 40) n++; var len = R.items().length; var full = R.addControl({ kind: 'click', target: { id: 'cursorToggle' }, name: 'c' }, document.getElementById('cursorToggle')); R.reset(); return { e: a, v: b, dup: c, missing: dd, slider: s && s.kind, len: len, max: R.MAX_ITEMS, full: full }; })()`);
        check('G1 add() refuses E, system keys, a slider twice and one that is not there; stops at the limit', guards.e === null && guards.v === null && guards.dup === null && guards.missing === null && guards.slider === 'slider' && guards.len === guards.max && /holds 12/.test(guards.full), guards);

        const errs = d.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
        check('no page errors', errs.length === 0, errs.slice(0, 3).map(e => e.params.exceptionDetails ? (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) : (e.params.args || []).map(a => a.value || a.description).join(' ')));
    } catch (e) { console.error('DRIVER FAIL', e); results.push({ name: 'driver', ok: false }); }
    const bad = results.filter(r => !r.ok);
    console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
    await d.close();
    process.exit(bad.length ? 1 : 0);
})();
