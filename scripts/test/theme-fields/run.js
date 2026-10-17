// Walnut & Copper inline fields (js/69-theme-fields.js) and checkbox panes
// (css/37 §3: the label is the pane, the native input its cathode),
// headless Chrome with trusted mouse and keys against the repo's own files:
//   node scripts/test/theme-fields/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed. SHOT_DIR=<dir> writes a screenshot.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = { down: ['ArrowDown', 'ArrowDown', 40], up: ['ArrowUp', 'ArrowUp', 38], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], space: [' ', 'Space', 32], tab: ['Tab', 'Tab', 9], end: ['End', 'End', 35], home: ['Home', 'Home', 36] };

(async () => {
    const d = await boot();
    try {
        const key = async (k, mods) => { await d.tap(...K[k], mods || [], k === 'enter' ? '\r' : (k === 'space' ? ' ' : undefined)); await sleep(150); };
        const st = () => d.ev(`(function(){ var s = document.getElementById('symmetryMode'); var l = document.querySelector('.wc-lbx');
            return { theme: document.documentElement.dataset.theme, value: s.value, mode: window.config && config.SYMMETRY_MODE, expanded: s.getAttribute('aria-expanded'),
              list: !!l, options: l ? l.querySelectorAll('[role=option]').length : 0, activedesc: s.getAttribute('aria-activedescendant'),
              active: document.activeElement === s, total: s.options.length, changes: window.__chg || 0 }; })()`);

        // Open Multi-Brush so the field is on screen; count change events.
        await d.ev(`(function(){ var t = [].slice.call(document.querySelectorAll('#sidebar-left .section-title')).find(function(x){ return /Multi/.test(x.textContent); });
            if (t.getAttribute('aria-expanded') !== 'true') t.click();
            window.__chg = 0; document.getElementById('symmetryMode').addEventListener('change', function(){ window.__chg++; }); return 1; })()`);
        await sleep(500);
        const c = await d.ev(`(function(){ var s = document.getElementById('symmetryMode'); s.scrollIntoView({ block: 'center' }); var r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

        let s0 = await st();
        check('T0 the theme is walnut-copper and the field is a native select', s0.theme === 'walnut-copper' && s0.total > 1, s0);

        await d.click(c.x, c.y); await sleep(350);
        let s = await st();
        check('T1 a click opens the options inline, focus stays on the select', s.list && s.options === s0.total && s.expanded === 'true' && s.active && !!s.activedesc, s);
        await d.shot('theme-field-open.png');

        await key('down');
        s = await st();
        check('T2 ArrowDown moves the active option, the value does not change yet', s.value === s0.value && s.changes === 0 && s.list, s);

        await key('esc');
        s = await st();
        check('T3 Escape closes without a change', !s.list && s.value === s0.value && s.changes === 0 && s.expanded === 'false' && s.active, s);

        await key('space');
        s = await st();
        check('T4 Space opens it from the keyboard', s.list && s.expanded === 'true', s);
        await key('down'); await key('enter');
        s = await st();
        check('T5 ArrowDown + Enter commits the next option, one change event, the app reads it', !s.list && s.value !== s0.value && s.changes === 1 && s.mode === s.value && s.active, s);

        await key('enter'); await key('home'); await key('enter');
        s = await st();
        check('T6 Enter, Home, Enter goes back to the first option', !s.list && s.changes === 2 && s.value === (await d.ev(`document.getElementById('symmetryMode').options[0].value`)), s);

        await d.click(c.x, c.y); await sleep(300);
        await d.click(5, 5); await sleep(300);
        s = await st();
        check('T7 a press elsewhere closes it unchanged', !s.list && s.changes === 2, s);

        await d.click(c.x, c.y); await sleep(300);
        const opt = await d.ev(`(function(){ var o = document.querySelectorAll('.wc-lbx [role=option]')[1]; var r = o.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await d.click(opt.x, opt.y); await sleep(300);
        s = await st();
        check('T8 clicking an option commits it and closes', !s.list && s.changes === 3 && s.value === (await d.ev(`document.getElementById('symmetryMode').options[1].value`)) && s.active, s);

        // Closed field: arrows still step natively (unchanged behaviour).
        const before = s.value;
        await key('down');
        s = await st();
        check('T9 a closed field still steps natively with ArrowDown', !s.list && s.value !== before, s);

        // ── Checkbox panes (css/37 §3, js/69 + js/71) ──────────────────
        // Stroke and replay > Preserve randomness: <input> + <label for> in a
        // .checkbox-group row. The input stays the control; the label is the
        // pane, the input its square cathode.
        await d.ev(`(function(){ var t = [].slice.call(document.querySelectorAll('#sidebar-left .section-title')).find(function(x){ return /Stroke/.test(x.textContent); });
            if (t.getAttribute('aria-expanded') !== 'true') t.click();
            window.__cbChg = 0; document.getElementById('preserveRandomness').addEventListener('change', function(){ window.__cbChg++; }); return 1; })()`);
        await sleep(600);
        const cb = () => d.ev(`(function(){ var i = document.getElementById('preserveRandomness'), l = document.querySelector('label[for="preserveRandomness"]'), row = i.parentElement;
            var ir = i.getBoundingClientRect(), lr = l.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
            var ls = getComputedStyle(l), is = getComputedStyle(i);
            return { checked: i.checked, app: window.preserveRandomness, changes: window.__cbChg, focused: document.activeElement === i, fv: i.matches(':focus-visible'),
              rowCi: +getComputedStyle(row).getPropertyValue('--ci'), inCi: +is.getPropertyValue('--ci'), labCi: +ls.getPropertyValue('--ci'),
              appearance: is.appearance, inLeft: Math.round((ir.left - lr.left) / z * 10) / 10, inMid: Math.round(((ir.top + ir.height / 2) - (lr.top + lr.height / 2)) / z * 10) / 10,
              labH: Math.round(lr.height / z), labOutline: ls.outlineStyle + ' ' + ls.outlineWidth, inOutline: is.outlineStyle, pane: row.hasAttribute('data-wc-pane'),
              inline: row.style.getPropertyValue('--ci') }; })()`);
        await d.ev(`(function(){ var i = document.getElementById('preserveRandomness'); i.scrollIntoView({ block: 'center' }); if (i.checked) { i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); } window.__cbChg = 0; return 1; })()`);
        await sleep(2600);
        let k0 = await cb();
        check('T10 a checkbox row is a pane: 32 px label, the native input drawn as its cathode in the first module', k0.appearance === 'none' && k0.labH >= 32 && Math.abs(k0.inLeft - 9) < 1.5 && Math.abs(k0.inMid) < 1.5 && !k0.checked && k0.rowCi === 0, k0);

        // Keyboard focus: the ring is on the pane, not on the small box.
        await d.tap('Shift', 'ShiftLeft', 16);
        await d.ev(`document.getElementById('preserveRandomness').focus()`);
        await sleep(200);
        let k1 = await cb();
        check('T11 keyboard focus shows the focus ring on the pane (2 px), the input keeps the focus', k1.focused && k1.fv && /solid 2px/.test(k1.labOutline) && k1.inOutline === 'none', k1);

        await key('space'); await sleep(600);
        let k2 = await cb();
        check('T12 Space toggles the checkbox: one change event, the app reads it, the pane lights', k2.checked && k2.app === true && k2.changes === 1 && k2.focused && k2.rowCi === 1 && k2.inCi === 1 && k2.labCi === 1 && k2.pane, k2);

        await key('space'); await sleep(400);
        let k3 = await cb();
        check('T13 Space again unchecks it and the cathode fades (afterglow, not a snap)', !k3.checked && k3.app === false && k3.changes === 2 && k3.rowCi > 0.02 && k3.rowCi < 0.35, k3);
        await sleep(3000);   // the afterglow settles (~2.1 s) and js/71 drops its inline --ci

        // A change no event announces (a preset, a room) still shows: the
        // resting state is CSS.
        await d.ev(`document.getElementById('preserveRandomness').checked = true`);
        await sleep(120);
        let k4 = await cb();
        await d.ev(`document.getElementById('preserveRandomness').checked = false`);
        await sleep(120);
        let k5 = await cb();
        check('T14 the pane follows a programmatic checked change with no event', k4.rowCi === 1 && k4.inCi === 1 && !k4.inline && k5.rowCi === 0 && k5.inCi === 0 && k5.changes === 2, { on: k4, off: k5 });

        // A click on the label (the pane) toggles it, as the label always did.
        const lc = await d.ev(`(function(){ var r = document.querySelector('label[for="preserveRandomness"]').getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 }; })()`);
        await d.click(lc.x, lc.y); await sleep(600);
        let k6 = await cb();
        check('T15 clicking the pane toggles the checkbox', k6.checked && k6.app === true && k6.changes === 3 && k6.rowCi === 1, k6);
        await d.click(lc.x, lc.y); await sleep(300);
        await d.shot('theme-checkbox-pane.png');

    } catch (e) {
        check('harness', false, String(e && e.stack || e));
    } finally {
        await d.close();
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
