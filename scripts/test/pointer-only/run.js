// Sitting 6 of the keyboard audit: what only a pointer could do — Ignite
// and its latch (js/20), the palette chips and their menu (js/01), the mask
// editor (js/15), and the faders' names (js/20 nameFader). Headless Chrome
// with trusted keys against the repo's own files:
//   node scripts/test/pointer-only/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = {
    space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9],
    right: ['ArrowRight', 'ArrowRight', 39], left: ['ArrowLeft', 'ArrowLeft', 37], down: ['ArrowDown', 'ArrowDown', 40],
    f10: ['F10', 'F10', 121], pgup: ['PageUp', 'PageUp', 33], z: ['z', 'KeyZ', 90], c: ['c', 'KeyC', 67]
};

(async () => {
    const d = await boot();
    try {
        const key = async (k, mods) => { await d.tap(...K[k], mods || [], k === 'enter' ? '\r' : undefined); await sleep(180); };
        const act = () => d.ev(`(function(){ var a = document.activeElement; return a ? (a.id || (a === document.body ? 'BODY' : String(a.className).split(' ')[0])) : null; })()`);

        // ── Ignite: hold Enter = hold the boost ──
        await d.ev(`document.querySelector('.ch-nudge-btn').focus(), 1`);
        await d.keyDown(...K.enter, [], '\r'); await sleep(150);
        const held = await d.ev(`({ on: document.querySelector('.ch-nudge-btn').classList.contains('active'), frozen: !!window.__fluidFrozen })`);
        await d.keyUp(...K.enter); await sleep(150);
        const after = await d.ev(`document.querySelector('.ch-nudge-btn').classList.contains('active')`);
        check('K1 holding Enter on Ignite holds the boost; letting go ends it', held.on && !after, { held, after });
        await d.keyDown(...K.space, []); await sleep(150);
        const heldS = await d.ev(`({ on: document.querySelector('.ch-nudge-btn').classList.contains('active'), frozen: !!window.__fluidFrozen })`);
        await d.keyUp(...K.space); await sleep(150);
        check('K1 ...Space too, and it does not freeze', heldS.on && !heldS.frozen && !(await d.ev(`document.querySelector('.ch-nudge-btn').classList.contains('active')`)), heldS);

        // ── The latch cell: a toggle button ──
        await key('tab');
        const onLock = await d.ev(`(function(){ var l = document.activeElement; return { lock: l.classList.contains('ch-ignite-lock'), role: l.getAttribute('role'), name: l.getAttribute('aria-label'), pressed: l.getAttribute('aria-pressed') }; })()`);
        check('K2 Tab from Ignite reaches its latch: a named toggle button, not pressed', onLock.lock && onLock.role === 'button' && !!onLock.name && onLock.pressed === 'false', onLock);
        await key('space');
        const latched = await d.ev(`({ pressed: document.querySelector('.ch-ignite-lock').getAttribute('aria-pressed'), on: document.querySelector('.ch-nudge-btn').classList.contains('active') })`);
        check('K3 Space on the latch locks Ignite on', latched.pressed === 'true' && latched.on, latched);
        await key('space');
        const unl = await d.ev(`({ pressed: document.querySelector('.ch-ignite-lock').getAttribute('aria-pressed'), on: document.querySelector('.ch-nudge-btn').classList.contains('active') })`);
        check('K3 ...and again unlocks it', unl.pressed === 'false' && !unl.on, unl);
        await key('space');
        await d.ev(`document.querySelector('.ch-nudge-btn').focus(), 1`);
        await key('enter');
        const stopped = await d.ev(`({ pressed: document.querySelector('.ch-ignite-lock').getAttribute('aria-pressed'), on: document.querySelector('.ch-nudge-btn').classList.contains('active') })`);
        check('K4 Enter on Ignite while latched stops it', stopped.pressed === 'false' && !stopped.on, stopped);
        await d.ev('document.activeElement.blur(), 1');

        // ── Palette chips ──
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('palettePreview').closest('.sidebar-section')); return 1; })()`);
        await sleep(900);
        const row = await d.ev(`(function(){ var c = document.querySelectorAll('#palettePreview .palette-chip'); var z = Array.prototype.filter.call(c, function (x) { return x.tabIndex === 0; }); return { n: c.length, zero: z.length, role: c[0] && c[0].getAttribute('role'), name: c[0] && c[0].getAttribute('aria-label') }; })()`);
        check('K5 the chip row has one Tab stop; chips are buttons named by their colour', row.n >= 2 && row.zero === 1 && row.role === 'button' && /^#[0-9A-F]{6}$/.test(row.name || ''), row);
        await d.ev(`(function(){ var z = Array.prototype.find.call(document.querySelectorAll('#palettePreview .palette-chip'), function (x) { return x.tabIndex === 0; }); z.scrollIntoView({ block: 'center' }); z.focus(); return 1; })()`);
        const startHex = await d.ev(`document.activeElement.getAttribute('aria-label')`);
        await key('right');
        const moved = await d.ev(`(function(){ var a = document.activeElement; return { chip: a.classList.contains('palette-chip'), hex: a.getAttribute('aria-label'), tab: a.tabIndex, others: document.querySelectorAll('#palettePreview .palette-chip[tabindex="0"]').length }; })()`);
        check('K6 ArrowRight moves to the next chip, and the Tab stop goes with it', moved.chip && moved.hex !== startHex && moved.tab === 0 && moved.others === 1, { startHex, moved });
        await key('enter'); await sleep(200);
        const picked = await d.ev(`({ brush: (document.getElementById('colorPicker').value || '').toUpperCase(), focus: document.activeElement.getAttribute('aria-label'), frozen: !!window.__fluidFrozen })`);
        check('K7 Enter paints with it (brush colour set), focus stays on that chip', picked.brush === moved.hex && picked.focus === moved.hex && !picked.frozen, picked);

        // ── Its menu from the keyboard ──
        await key('f10', ['shift']); await sleep(150);
        let menu = await d.ev(`(function(){ var m = document.querySelector('.palette-menu'); var a = document.activeElement; return { open: !!m, role: m && m.getAttribute('role'), inside: !!(m && m.contains(a)), item: a && a.getAttribute('role') }; })()`);
        if (!menu.open) {
            // Headless may not turn Shift+F10 into contextmenu; send the event the browser would.
            await d.ev(`(function(){ var c = document.activeElement; var r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.bottom })); return 1; })()`);
            await sleep(150);
            menu = await d.ev(`(function(){ var m = document.querySelector('.palette-menu'); var a = document.activeElement; return { open: !!m, role: m && m.getAttribute('role'), inside: !!(m && m.contains(a)), item: a && a.getAttribute('role'), via: 'event' }; })()`);
        }
        check('K8 Shift+F10 on a chip opens its menu with focus on the first item (role menu / menuitem)', menu.open && menu.role === 'menu' && menu.inside && menu.item === 'menuitem', menu);
        const first = await d.ev(`document.activeElement.textContent`);
        await key('down');
        const second = await d.ev(`document.activeElement.textContent`);
        check('K9 ArrowDown moves down the menu', !!second && second !== first, { first, second });
        await key('esc');
        const back = await d.ev(`({ open: !!document.querySelector('.palette-menu'), focus: document.activeElement.getAttribute('aria-label') })`);
        check('K10 Esc closes the menu and focus goes back to the chip', !back.open && back.focus === moved.hex, back);
        await d.ev('document.activeElement.blur(), 1');

        // ── The mask editor ──
        await d.ev(`(function(){ var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(16, 16, 32, 32); window.enterAdhocMaskMode(c.toDataURL(), 'Test', function () {}); return 1; })()`);
        await sleep(1200);
        let me = await d.ev(`(function(){ var o = document.getElementById('maskEditorOverlay'); var a = document.activeElement; return { shown: !!(o && o.style.display !== 'none'), role: o && o.getAttribute('role'), modal: o && o.getAttribute('aria-modal'), inside: !!(o && o.contains(a)), active: a && (a.id || String(a.className).split(' ')[0]), close: o && o.querySelector('.mask-close-btn').getAttribute('aria-label') }; })()`);
        check('K11 the mask editor opens as a modal dialog with focus inside (not on ✕), ✕ named Close', me.shown && me.role === 'dialog' && me.modal === 'true' && me.inside && me.active !== 'mask-close-btn' && me.close === 'Close', me);
        const ring = [];
        for (let i = 0; i < 5; i++) { await key('tab'); ring.push(await d.ev(`!!document.getElementById('maskEditorOverlay').contains(document.activeElement)`)); }
        check('K12 Tab stays inside the mask editor', ring.every(Boolean), ring);
        const c0 = await d.ev(`document.getElementById('cursorToggle').checked`);
        await d.ev(`document.querySelector('#maskEditorOverlay .mask-wizard-step').focus(), 1`);
        await key('c');
        check('K13 app hotkeys (C) do nothing under the mask editor', (await d.ev(`document.getElementById('cursorToggle').checked`)) === c0);
        let undos = 0;
        await d.ev(`(function(){ var u = window.UndoManager.undo; window.UndoManager.undo = function () { window.__undoHits = (window.__undoHits || 0) + 1; return u.apply(this, arguments); }; return 1; })()`);
        await key('z', ['ctrl']);
        undos = await d.ev('window.__undoHits || 0');
        check('K14 ...but Ctrl+Z still undoes, once', undos === 1, undos);
        await key('esc'); await sleep(300);
        me = await d.ev(`(function(){ var o = document.getElementById('maskEditorOverlay'); return { shown: !!(o && o.style.display !== 'none'), keyboard: window.DialogFocus.hasKeyboard() }; })()`);
        check('K15 Esc closes the mask editor (as ✕ does) and the keyboard is the app\'s again', !me.shown && !me.keyboard, me);

        // ── Fader names ──
        const names = await d.ev(`(function(){
            function n(id) { var e = document.getElementById(id); return e ? { label: e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) || '', text: e.getAttribute('aria-valuetext') } : null; }
            return { size: n('brushSizePerceptual'), sizeShown: document.getElementById('mixer-brushValue').textContent.trim(), visc: n('viscosity'), time: n('timeScalePerceptual') };
        })()`);
        check('K16 the curved Brush Size fader is named by its label and reads its readout', names.size && names.size.label === 'Brush Size' && names.size.text === names.sizeShown, names);
        const codeId = (l) => !l || /[a-z][A-Z]|Perceptual|\(perceptual\)/.test(l);
        check('K16 ...no fader is named by code id, none is nameless', names.visc && names.time && !codeId(names.visc.label) && !codeId(names.time.label), names);
        await d.ev(`document.getElementById('brushSizePerceptual').focus(), 1`);
        await key('pgup'); await key('pgup'); await sleep(150);   // big steps: the readout has to move
        const after2 = await d.ev(`({ text: document.getElementById('brushSizePerceptual').getAttribute('aria-valuetext'), shown: document.getElementById('mixer-brushValue').textContent.trim() })`);
        check('K17 its value text follows the readout as it changes', after2.text === after2.shown && after2.text !== names.sizeShown, { before: names.sizeShown, after2 });

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('K18 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
