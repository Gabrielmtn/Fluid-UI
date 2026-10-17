// Walnut & Copper inline fields (js/69-theme-fields.js), headless Chrome with
// trusted mouse and keys against the repo's own files:
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

        // Classic theme: no inline fields at all.
        await d.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__themeOverride="classic";' });
        await d.load();
        const cl = await d.ev(`(function(){ var t = [].slice.call(document.querySelectorAll('#sidebar-left .section-title')).find(function(x){ return /Multi/.test(x.textContent); });
            if (t.getAttribute('aria-expanded') !== 'true') t.click(); return 1; })()`);
        await sleep(500);
        const c2 = await d.ev(`(function(){ var s = document.getElementById('symmetryMode'); s.scrollIntoView({ block: 'center' }); var r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await d.click(c2.x, c2.y); await sleep(300);
        const cls = await d.ev(`({ theme: document.documentElement.dataset.theme, list: !!document.querySelector('.wc-lbx'), api: !!window.ThemeFields })`);
        await d.tap(...K.esc); await sleep(150);
        check('T10 classic theme: the native popup, no inline field', cls.theme === 'classic' && !cls.list && !cls.api, cls);
    } catch (e) {
        check('harness', false, String(e && e.stack || e));
    } finally {
        await d.close();
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
