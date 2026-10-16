// Dialogs hold the keyboard (js/00b-dialog-focus.js and the dialogs wired to
// it), headless Chrome with trusted keys and mouse against the repo's own
// files:
//   node scripts/test/dialog-focus/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
//
// Checks: Reset app, a confirm, the F1 sheet, the palette delete question
// and PhotoSafe's off question each take focus, keep Tab and Shift+Tab
// inside, close on Esc, and hand focus back to what opened them after a
// keyboard close (not after a mouse close, so Space still freezes); they are
// labelled modal dialogs; app hotkeys (C, F, Z, ~, Space) do nothing behind
// them; F1 still closes the sheet; the skip menu stays shut under them; a
// confirm over Reset app hands focus back into Reset app.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = {
    space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9],
    c: ['c', 'KeyC', 67], f: ['f', 'KeyF', 70], z: ['z', 'KeyZ', 90], grave: ['`', 'Backquote', 192], f1: ['F1', 'F1', 112]
};

(async () => {
    const d = await boot();
    try {
        const key = async (k, mods) => { await d.tap(...K[k], mods || [], k === 'enter' ? '\r' : undefined); await sleep(150); };
        const st = () => d.ev(`(function(){
            var a = document.activeElement, dlg = window.DialogFocus.top();
            return {
                active: a ? (a.id || (a === document.body ? 'BODY' : a.tagName)) : null,
                inTop: !!(dlg && dlg.contains(a)),
                top: dlg ? dlg.id : null,
                frozen: !!window.__fluidFrozen,
                cursor: document.getElementById('cursorToggle').checked,
                focusMode: document.body.classList.contains('focus-mode'),
                brush: window.BrushType ? window.BrushType.get() : null,
                skip: !!(window.SkipMenu && window.SkipMenu.isOpen()),
                reset: !!document.querySelector('.reset-app-modal.show')
            };
        })()`);
        const aria = (id) => d.ev(`(function(){ var m = document.getElementById(${JSON.stringify(id)}); var l = m.getAttribute('aria-labelledby'); return [m.getAttribute('role'), m.getAttribute('aria-modal'), !!(l && document.getElementById(l) && document.getElementById(l).textContent.trim())]; })()`);
        const ringOf = async (n, mods) => { const out = []; for (let i = 0; i < n; i++) { await key('tab', mods); const s = await st(); out.push(s.inTop ? s.active : 'OUT:' + s.active); } return out; };

        // ── Reset app ──
        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);
        await key('space'); await sleep(200);
        let s = await st();
        check('D1 Reset app (keyboard): opens with focus on Cancel', s.reset && s.active === 'resetAppCancel' && s.top === 'resetAppModal', s);
        check('D1 ...a labelled modal dialog', (await aria('resetAppModal')).join() === 'dialog,true,true', await aria('resetAppModal'));
        let ring = await ringOf(4);
        check('D2 Tab ×4 stays inside Reset app and goes round', ring.every(x => !/^OUT/.test(x)) && new Set(ring).size >= 2, ring);
        ring = await ringOf(3, ['shift']);
        check('D2 Shift+Tab ×3 stays inside too (and the skip menu stays shut)', ring.every(x => !/^OUT/.test(x)) && !(await st()).skip, ring);
        await key('esc'); await sleep(200);
        s = await st();
        check('D3 Esc closes Reset app and focus goes back to the Reset app button', !s.reset && s.active === 'resetAppBtn' && !s.top, s);

        // ── A confirm: hotkeys behind it ──
        const ask = () => d.ev(`(function(){ window.__ans = 'pending'; window.appConfirm({ title: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep' }).then(function (v) { window.__ans = v; }); return 1; })()`);
        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);
        await ask(); await sleep(150);
        const s0 = await st();
        check('D4 a confirm opens on Keep, as a labelled modal dialog', s0.active === 'appConfirmCancel' && (await aria('appConfirmModal')).join() === 'dialog,true,true', { s0, aria: await aria('appConfirmModal') });
        for (const k of ['c', 'f', 'z', 'grave']) await key(k);
        s = await st();
        check('D5 C, F, Z and ~ do nothing behind a confirm', s.cursor === s0.cursor && s.focusMode === s0.focusMode && s.brush === s0.brush && s.active === 'appConfirmCancel', { s0, s });
        const zoom = await d.ev(`!!(window.ZoomView && window.ZoomView.isOn && window.ZoomView.isOn())`);
        ring = await ringOf(3);
        check('D6 Tab goes round Keep and Delete only', ring.join() === 'appConfirmOk,appConfirmCancel,appConfirmOk', ring);
        await key('esc');
        s = await st();
        check('D7 Esc keeps, and focus goes back to the button that was focused', (await d.ev('window.__ans')) === false && s.active === 'resetAppBtn' && !s.frozen && !zoom, s);

        // ── A confirm over Reset app ──
        await key('space'); await sleep(200);
        await ask(); await sleep(150);
        ring = await ringOf(2);
        check('D8 a confirm over Reset app keeps Tab to itself', ring.join() === 'appConfirmOk,appConfirmCancel', ring);
        await key('esc');
        s = await st();
        check('D8 ...and closing it hands focus back into Reset app', s.reset && s.top === 'resetAppModal' && s.inTop, s);
        await key('esc'); await sleep(200);
        s = await st();
        check('D8 ...then Esc closes Reset app back to its button', !s.reset && s.active === 'resetAppBtn', s);

        // ── The F1 sheet ──
        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);
        await key('f1'); await sleep(150);
        s = await st();
        const closeName = await d.ev(`document.getElementById('hotkeyClose').getAttribute('aria-label')`);
        check('D9 F1 opens the sheet with focus on its × (named Close), a labelled modal dialog', s.top === 'hotkeyOverlay' && s.active === 'hotkeyClose' && closeName === 'Close' && (await aria('hotkeyOverlay')).join() === 'dialog,true,true', { s, closeName });
        ring = await ringOf(6);
        check('D10 Tab stays inside the sheet', ring.every(x => !/^OUT/.test(x)), ring);
        const c0 = (await st()).cursor;
        await key('c'); await key('space');
        s = await st();
        check('D11 C and Space do nothing behind the sheet', s.cursor === c0 && !s.frozen && s.top === 'hotkeyOverlay', s);
        await d.ev(`document.getElementById('hotkeyClose').focus(), 1`);
        await key('f1'); await sleep(150);
        s = await st();
        check('D12 F1 again closes it, focus back on the Reset app button', !s.top && s.active === 'resetAppBtn', s);
        await key('f1'); await sleep(150);
        await key('esc'); await sleep(150);
        s = await st();
        check('D12 ...and Esc closes it too', !s.top && s.active === 'resetAppBtn', s);

        // ── Palette delete ──
        // The palette button lives in a folded section: open it, so it can hold focus.
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('paletteSelect').closest('.sidebar-section')); return 1; })()`);
        await sleep(900);
        const pal = await d.ev(`(function(){ var b = document.getElementById('paletteSelect'); b.focus(); var had = document.activeElement === b; window.showDeleteModal(0, 'Test'); return had; })()`);
        await sleep(150);
        check('D13 (setup) the palette button held focus before the question', pal === true, pal);
        s = await st();
        check('D13 palette delete: focus on Cancel, a labelled modal dialog', s.top === 'deletePaletteModal' && /delete-modal-cancel|BUTTON/.test(s.active) && s.inTop && (await aria('deletePaletteModal')).join() === 'dialog,true,true', { s, aria: await aria('deletePaletteModal') });
        await key('esc');
        s = await st();
        const shown = await d.ev(`document.getElementById('deletePaletteModal').classList.contains('show')`);
        check('D14 Esc cancels the palette delete and focus goes back to the palette button', !shown && s.active === 'paletteSelect', { shown, s });
        await d.ev('document.activeElement.blur(), 1');

        // ── PhotoSafe off question, from the keyboard ──
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('photoSafeToggle').closest('.sidebar-section')); return 1; })()`);
        await sleep(900);
        await d.ev(`(function(){ var t = document.getElementById('photoSafeToggle'); t.scrollIntoView({ block: 'center' }); t.focus(); return document.activeElement === t; })()`);
        await key('space'); await sleep(250);
        s = await st();
        const offId = s.top;
        check('D15 Space on PhotoSafe asks first, focus on Keep', !!offId && s.inTop, s);
        ring = await ringOf(3);
        check('D15 ...Tab goes round its two buttons', ring.every(x => !/^OUT/.test(x)) && new Set(ring).size === 2, ring);
        await key('esc'); await sleep(200);
        s = await st();
        const still = await d.ev(`document.getElementById('photoSafeToggle').checked`);
        check('D16 Esc keeps PhotoSafe on, focus back on the toggle', still && s.active === 'photoSafeToggle' && !s.top, { still, s });
        await d.ev('document.activeElement.blur(), 1');

        // ── A mouse close leaves focus alone: Space still freezes ──
        const rb = await d.ev(`(function(){ var e = document.getElementById('resetAppBtn'); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await d.click(rb.x, rb.y); await sleep(700);
        const cancel = await d.ev(`(function(){ var e = document.getElementById('resetAppCancel'); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await d.click(cancel.x, cancel.y); await sleep(250);
        s = await st();
        await key('space');
        const after = await st();
        check('D17 Reset app opened and closed with the mouse: focus not handed back, Space freezes', !s.reset && s.active !== 'resetAppBtn' && after.frozen && !after.reset, { s, after });
        await key('space');

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('D18 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
