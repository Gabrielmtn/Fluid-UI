// Space and Enter do what the focused control says (js/05n Space gate,
// js/20 appConfirm, js/26 LayerTransform), headless Chrome with trusted keys
// and mouse against the repo's own files:
//   node scripts/test/focus-keys/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
//
// Checks: a checkbox or button reached from the keyboard takes Space as its
// press and the fluid does not freeze; one the mouse pressed (or whose label
// it pressed) keeps Space for Freeze; Shift+Space still pauses from a focused
// button; a confirm's Enter and Space press the focused button (Enter on
// Cancel no longer confirms), an alert's Enter is OK; LayerTransform's Enter
// on its Cancel cancels, Enter elsewhere is Done.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = {
    space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9]
};

(async () => {
    const d = await boot();
    try {
        // Enter carries its character: a real keyboard sends "\r", and the browser
        // presses a focused button from that, not from a bare keydown.
        const key = async (k, mods) => { await d.tap(...K[k], mods || [], k === 'enter' ? '\r' : undefined); await sleep(150); };
        const st = () => d.ev(`({ frozen: !!window.__fluidFrozen, paused: typeof isPaused !== 'undefined' && !!isPaused, cursor: document.getElementById('cursorToggle').checked,
            active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
            reset: !!document.querySelector('.reset-app-modal.show') })`);
        const centre = (id) => d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); e.scrollIntoView({ block: 'center' }); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

        // ── Keyboard focus: Space presses ──
        let s0 = await st();
        await d.ev(`document.getElementById('cursorToggle').focus(), 1`);   // focus with no pointer press = the keyboard's
        await key('space');
        let s = await st();
        check('F1 a keyboard-focused checkbox: Space ticks it, no freeze', s.cursor === !s0.cursor && !s.frozen && s.active === 'cursorToggle', { s0, s });
        await key('space');
        s = await st();
        check('F1 ...and Space again unticks it', s.cursor === s0.cursor && !s.frozen, s);

        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);
        await key('space'); await sleep(200);
        s = await st();
        check('F2 a keyboard-focused button: Space presses it (Reset app asks), no freeze', s.reset && !s.frozen, s);
        await key('esc'); await sleep(200);

        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);
        await key('space', ['shift']);
        s = await st();
        check('F3 Shift+Space on a focused button still pauses, and does not press it', s.paused && !s.reset, s);
        await key('space', ['shift']);
        s = await st();
        check('F3 ...and Shift+Space again unpauses', !s.paused, s);
        await d.ev('document.activeElement.blur(), 1');

        // ── Mouse focus: Space still freezes ──
        const cb = await centre('cursorToggle');
        await d.click(cb.x, cb.y); await sleep(150);
        s0 = await st();
        await key('space');
        s = await st();
        check('F4 a checkbox the mouse clicked: Space freezes, the box stays as clicked', s.frozen && s.cursor === s0.cursor && s0.active === 'cursorToggle', { s0, s });
        await key('space');
        check('F4 ...Space again unfreezes', !(await st()).frozen);

        const lab = await d.ev(`(function(){ var l = document.querySelector('label[for="cursorToggle"]') || document.getElementById('cursorToggle').closest('label'); if (!l) return null; l.scrollIntoView({ block: 'center' }); var r = l.getBoundingClientRect(); return { x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2 }; })()`);
        if (lab) {
            await d.click(lab.x, lab.y); await sleep(150);
            s0 = await st();
            await key('space');
            s = await st();
            check('F5 a checkbox ticked through its label: Space freezes, the box stays', s.frozen && s.cursor === s0.cursor, { s0, s });
            await key('space');
        } else {
            check('F5 a checkbox ticked through its label (no label found to click)', false, null);
        }

        const rb = await centre('resetAppBtn');
        await d.ev('document.activeElement.blur(), 1');
        // A mouse press that never lands on the button: focus it after a press elsewhere
        // (a dialog opening on a button) — that is the keyboard's focus, not the mouse's.
        await d.click(800, 450); await sleep(80);
        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);
        await key('space'); await sleep(200);
        s = await st();
        check('F6 a button focused by code after a click elsewhere counts as keyboard focus: Space presses it', s.reset && !s.frozen, s);
        await key('esc'); await sleep(200);
        await d.click(rb.x, rb.y); await sleep(250);
        const clicked = await st();
        await key('esc'); await sleep(200);
        s0 = await st();
        await key('space');
        s = await st();
        check('F7 after a mouse click on a button its Space is Freeze (Reset app does not reopen)', clicked.reset && !s.reset && s.frozen, { clicked, s });
        await key('space');
        await d.ev('document.activeElement && document.activeElement.blur(), 1');

        // ── appConfirm ──
        const ask = (opts) => d.ev(`(function(){ window.__ans = 'pending'; window.appConfirm(${JSON.stringify(opts)}).then(function (v) { window.__ans = v; }); return 1; })()`);
        const ans = async () => { await sleep(150); return d.ev('window.__ans'); };
        const where = () => d.ev(`document.activeElement && document.activeElement.id`);

        await ask({ title: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep' });
        await sleep(100);
        const f0 = await where();
        await key('enter');
        let a = await ans();
        check('F8 a confirm starts on Keep, and Enter there keeps (it used to delete)', f0 === 'appConfirmCancel' && a === false, { f0, a });

        await ask({ title: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep' });
        await sleep(100);
        await key('tab');
        const f1 = await where();
        await key('enter');
        a = await ans();
        check('F9 Tab to Delete, Enter: confirmed', f1 === 'appConfirmOk' && a === true, { f1, a });

        await ask({ title: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep' });
        await sleep(100);
        await key('space');
        a = await ans();
        s = await st();
        check('F10 Space on Keep: kept, and the canvas did not freeze behind the dialog', a === false && !s.frozen, { a, s });

        await ask({ title: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep' });
        await sleep(100);
        await key('esc');
        a = await ans();
        check('F11 Esc: kept', a === false, a);

        await ask({ title: 'Heads up', confirmLabel: 'OK', cancelLabel: null, danger: false });
        await sleep(100);
        await key('enter');
        a = await ans();
        check('F12 an alert (one button): Enter is OK', a === true, a);

        // ── LayerTransform ──
        const lt = await d.ev(`(function(){
            if (!window.LayerTransform) return 'no LayerTransform';
            window.layers = window.layers || [];
            if (!window.layers.some(function (l) { return l.index === 0; })) window.layers.push({ index: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, visible: true, opacity: 1 });
            try { window.LayerTransform.open(0); } catch (e) { return 'open threw: ' + e.message; }
            return window.LayerTransform.isOpen() ? 'open' : 'did not open';
        })()`);
        if (lt === 'open') {
            await d.ev(`(function(){ var l = window.layers.find(function (x) { return x.index === 0; }); l.x = 40; document.getElementById('layerTransformCancel').focus(); return 1; })()`);
            await key('enter'); await sleep(150);
            const r1 = await d.ev(`({ open: window.LayerTransform.isOpen(), x: window.layers.find(function (x) { return x.index === 0; }).x })`);
            check('F13 LayerTransform: Enter on its Cancel cancels (the move is undone)', !r1.open && r1.x === 0, r1);
            await d.ev(`(function(){ window.LayerTransform.open(0); var l = window.layers.find(function (x) { return x.index === 0; }); l.x = 40; document.activeElement && document.activeElement.blur(); return 1; })()`);
            await key('enter'); await sleep(150);
            const r2 = await d.ev(`({ open: window.LayerTransform.isOpen(), x: window.layers.find(function (x) { return x.index === 0; }).x })`);
            check('F14 LayerTransform: Enter with nothing focused is Done (the move stays)', !r2.open && r2.x === 40, r2);
        } else {
            check('F13 LayerTransform could be opened for the test', false, lt);
        }

        // ── The left rail hands focus on as the bar opens ──
        await d.ev(`(function(){ var b = document.getElementById('sidebar-left'); if (!b.classList.contains('collapsed')) document.querySelector('.lsb-edge button, .lsb-toggle').click(); return b.classList.contains('collapsed'); })()`);
        const folded = await d.ev(`document.getElementById('sidebar-left').classList.contains('collapsed')`);
        await d.ev(`document.querySelector('#sidebar-left .lsb-rail-label').focus(), 1`);
        await key('space'); await sleep(200);
        const rail = await d.ev(`({ open: !document.getElementById('sidebar-left').classList.contains('collapsed'), active: document.activeElement.id, frozen: !!window.__fluidFrozen })`);
        check('F16 Space on the folded rail\'s Brush opens the bar and focus moves on to Brush Size', folded && rail.open && rail.active === 'brushSizePerceptual' && !rail.frozen, { folded, rail });
        await d.ev('document.activeElement.blur(), 1');
        await d.ev(`(function(){ document.querySelector('.lsb-edge button, .lsb-toggle').click(); return 1; })()`);
        const sec = await d.ev(`(function(){ var r = Array.prototype.find.call(document.querySelectorAll('#sidebar-left .lsb-rail-section'), function (b) { return b.getClientRects().length; }); if (!r) return null; r.scrollIntoView({ block: 'center' }); var b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, name: r.textContent }; })()`);
        if (sec) {
            await d.click(sec.x, sec.y); await sleep(200);
            const m = await d.ev(`({ open: !document.getElementById('sidebar-left').classList.contains('collapsed'), active: document.activeElement.className })`);
            check('F17 a mouse click on a rail section opens it and leaves focus alone (not moved to the title)', m.open && !/section-title/.test(m.active || ''), { name: sec.name, m });
        } else {
            check('F17 a rail section button was there to click', false, null);
        }

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('F15 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
