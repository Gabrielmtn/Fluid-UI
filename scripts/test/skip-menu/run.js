// The skip menu (js/66-skip-menu.js) and the keyboard-operable sidebar
// sections (js/20 makeSection, css/21), headless Chrome with trusted keys
// and mouse against the repo's own files:
//   node scripts/test/skip-menu/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// SHOT_DIR= writes the menu screenshot there. Exit code 1 if any check failed.
//
// Checks: Tab with nothing focused opens the menu on Left sidebar; Tab /
// Shift+Tab go round clockwise and back, arrows go where they point; Space
// and Enter move focus into each of the four places (and Space does not
// freeze); a section title takes Tab, Enter and Space, says aria-expanded,
// and a folded section's controls are out of the Tab order; Shift+Tab from
// a control or a text field opens the menu on that place and Esc puts focus
// back; hotkeys are swallowed while it is up; a click away closes it; a
// dialog keeps Tab; a hidden place is skipped; Ctrl+Tab is not taken.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const TAB = ['Tab', 'Tab', 9];
const KEYS = {
    space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27],
    up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
    r: ['r', 'KeyR', 82]
};

(async () => {
    const d = await boot();
    try {
        const state = () => d.ev(`(function(){
            var a = document.activeElement, m = document.getElementById('skipMenu');
            var region = a && a.closest ? (a.closest('#sidebar-left') ? 'left' : a.closest('#mixer-strip') ? 'top' : a.closest('#sidebar-right') ? 'right' : a.closest('#quality-underbar') ? 'bottom' : null) : null;
            return {
                open: !!(window.SkipMenu && window.SkipMenu.isOpen()),
                on: a && a.classList && a.classList.contains('skip-menu-option') ? a.dataset.region : null,
                here: m && m.querySelector('[aria-current]') ? m.querySelector('[aria-current]').dataset.region : null,
                off: m ? Array.prototype.filter.call(m.querySelectorAll('.skip-menu-option'), function (b) { return b.getAttribute('aria-disabled') === 'true'; }).map(function (b) { return b.dataset.region; }) : null,
                region: region,
                active: a === document.body ? 'BODY' : a ? (a.id || (a.className && typeof a.className === 'string' ? a.className.split(' ')[0] : a.tagName)) : null,
                text: a && a !== document.body ? (a.textContent || '').trim().slice(0, 30) : null,
                frozen: !!window.__fluidFrozen
            };
        })()`);
        const key = async (k, mods) => { await d.tap(...(KEYS[k] || TAB), mods || []); await sleep(120); return state(); };
        const tab = (mods) => key('tab', mods);
        // Ctrl+Shift+Tab: Chrome (headless too) keeps it for switching tabs and
        // never sends it to a page, so it goes in as a page event, the way the
        // desktop app (no browser tabs) delivers it.
        const callMenu = async () => { await d.ev("(function(){ var t = document.activeElement || document.body; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); return 1; })()"); await sleep(150); return state(); };
        const blur = () => d.ev('document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1');
        // Nothing focused and nothing remembered: off whatever has focus, then
        // Esc, the way a person tells the app "back to painting".
        const forget = async () => { await blur(); await d.tap('Escape', 'Escape', 27); await sleep(120); };

        // ── Opening ──
        await d.move(800, 450);
        let s = await state();
        check('S0 nothing focused at the start, menu shut', s.active === 'BODY' && !s.open, s);
        const firstStop = await d.ev(`(function(){ var m = document.getElementById('skipMenu'); var r = m.getBoundingClientRect(); var all = Array.prototype.filter.call(document.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href], [tabindex]'), function (e) { return e.tabIndex >= 0 && e.getClientRects().length; }); return { firstChild: document.body.firstElementChild === m, firstStop: !!all[0] && m.contains(all[0]), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
        check('S0 the menu is the first element and first Tab stop in the page, out of sight (1 px) until focused', firstStop.firstChild && firstStop.firstStop && firstStop.w <= 1 && firstStop.h <= 1, firstStop);
        s = await tab();
        check('S1 Tab opens the menu on Left sidebar, all four places on', s.open && s.on === 'left' && s.off.length === 0 && !s.here, s);
        await d.shot('skip-menu.png');
        const box = await d.ev(`(function(){ var r = document.getElementById('skipMenu').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; })()`);
        check('S1 ...at the top left', box.x <= 16 && box.y <= 16 && box.w > 200, box);

        // ── Moving round ──
        const round = [];
        for (let i = 0; i < 3; i++) round.push((await tab()).on);
        check('S2 Tab walks its buttons clockwise: Top, Right, Bottom', round.join() === 'top,right,bottom', round);
        s = await tab();
        const gone = await d.ev(`Math.round(document.getElementById('skipMenu').getBoundingClientRect().width)`);
        // Into the page: the top bar, or, when it is docked in the right sidebar
        // (js/13: the bar would wrap at this width), the left sidebar, first in page order.
        const docked = await d.ev("document.body.classList.contains('compact-ui')");
        check('S2 ...then on into the page (the top bar, or the left bar when it is docked), and the menu goes out of sight', !s.open && s.region === (docked ? 'left' : 'top') && gone <= 1, { s, gone, docked });
        const back = [];
        for (let i = 0; i < 2; i++) back.push((await tab(['shift'])).on);
        check('S3 Shift+Tab steps back into it: Bottom, Right', back.join() === 'bottom,right', back);
        const arrows = [];
        for (const k of ['up', 'left', 'down', 'right']) arrows.push((await key(k)).on);
        check('S4 arrows go where they point', arrows.join() === 'top,left,bottom,right', arrows);

        // ── Hotkeys are the menu's while it is up ──
        const rnd0 = await d.ev(`!!(document.getElementById('randomColor') || {}).checked`);
        s = await key('r');
        const rnd1 = await d.ev(`!!(document.getElementById('randomColor') || {}).checked`);
        check('S5 a letter hotkey (R) does nothing under the menu', s.open && rnd0 === rnd1, { rnd0, rnd1, s });

        // ── Picking: Right sidebar with Space ──
        s = await key('space');
        const landed = await d.ev(`document.getElementById('sidebar-right').classList.contains('skip-landed')`);
        check('S6 Space picks Right sidebar: menu shut, focus on a section title there, not frozen', !s.open && s.region === 'right' && s.active === 'section-title' && !s.frozen && landed, { s, landed });
        const fv = await d.ev(`document.activeElement.matches(':focus-visible')`);
        check('S6 ...with a visible focus ring', fv === true, fv);

        // ── Sections by keyboard ──
        const first = s.text;
        s = await tab();
        check('S7 Tab from a folded section goes to the next section title, not into its hidden controls', s.active === 'section-title' && s.text !== first, { first, now: s });
        const sec0 = await d.ev(`(function(){ var t = document.activeElement; return { exp: t.getAttribute('aria-expanded'), role: t.getAttribute('role'), open: !t.closest('.sidebar-section').classList.contains('collapsed') }; })()`);
        s = await key('enter'); await sleep(300);
        const sec1 = await d.ev(`(function(){ var t = document.activeElement; return { exp: t.getAttribute('aria-expanded'), open: !t.closest('.sidebar-section').classList.contains('collapsed') }; })()`);
        check('S8 Enter on a section title opens it; aria-expanded follows', sec0.role === 'button' && sec0.exp === 'false' && !sec0.open && sec1.exp === 'true' && sec1.open, { sec0, sec1 });
        s = await key('space'); await sleep(300);
        const sec2 = await d.ev(`(function(){ var t = document.activeElement; return { exp: t.getAttribute('aria-expanded'), open: !t.closest('.sidebar-section').classList.contains('collapsed') }; })()`);
        check('S9 Space on a section title folds it again and does not freeze', sec2.exp === 'false' && !sec2.open && !s.frozen, { sec2, frozen: s.frozen });
        s = await key('space'); await sleep(300);
        s = await tab();
        const inside = await d.ev(`(function(){ var a = document.activeElement, sec = a.closest('.sidebar-section'); return { inBody: !!a.closest('.section-body'), secOpen: sec && !sec.classList.contains('collapsed') }; })()`);
        check('S10 Tab from an open section title goes into its controls', inside.inBody && inside.secOpen, { inside, s });
        const ctrl = s.active;

        // ── Shift+Tab steps back; Ctrl+Shift+Tab is the way back to the menu ──
        s = await tab(['shift']);
        check('S11 Shift+Tab from a control steps back one control (the menu stays shut)', !s.open && s.active === 'section-title' && s.region === 'right', s);
        s = await tab();
        check('S11 ...and Tab goes forward to it again', s.active === ctrl, s);
        s = await callMenu();
        check('S11 Ctrl+Shift+Tab from a control opens the menu on the place it is in', s.open && s.on === 'right' && s.here === 'right', s);
        s = await key('esc');
        check('S12 Esc shuts it and puts focus back on that control', !s.open && s.active === ctrl, { ctrl, s });

        // ── The other three places ──
        const go = async (arrow) => { await callMenu(); await key(arrow); return key('enter'); };
        s = await go('up');
        check('S13 Top nav (Enter): focus lands in the top bar', !s.open && s.region === 'top', s);
        s = await go('down');
        check('S14 Bottom nav: focus lands in the bottom bar', !s.open && s.region === 'bottom', s);
        s = await go('left');
        check('S15 Left sidebar: focus lands in the left sidebar', !s.open && s.region === 'left', s);

        // ── From a text field ──
        await d.ev(`(function(){ var a = document.createElement('input'); a.id = 'skText'; a.style.cssText = 'position:fixed;left:600px;top:400px;z-index:5'; document.body.appendChild(a); a.focus(); return 1; })()`);
        s = await callMenu();
        check('S16 Ctrl+Shift+Tab from a text field opens the menu', s.open, s);
        s = await key('esc');
        check('S16 ...and Esc goes back to the field', !s.open && s.active === 'skText', s);
        await d.ev(`(function(){ var e = document.getElementById('skText'); if (e) e.remove(); return 1; })()`);
        await blur();

        // ── A click away ──
        await tab();
        await d.click(800, 450); await sleep(150);
        s = await state();
        check('S17 a click on the canvas shuts the menu', !s.open, s);

        // ── Left alone ──
        await blur();
        await d.ev(`document.getElementById('deletePaletteModal').classList.add('show')`);
        s = await tab();
        check('S18 with a dialog up, Tab is the dialog\'s', !s.open, s);
        await d.ev(`document.getElementById('deletePaletteModal').classList.remove('show')`);
        await blur();

        const ctrlTab = await d.ev(`(function(){ var e = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', ctrlKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return { prevented: e.defaultPrevented, open: window.SkipMenu.isOpen() }; })()`);
        check('S19 Ctrl+Tab is not taken', !ctrlTab.prevented && !ctrlTab.open, ctrlTab);

        // ── A hidden place is skipped ──
        await d.ev(`document.getElementById('mixer-strip').classList.add('ui-hidden')`);
        await forget();
        s = await tab();
        const off = s.off;
        const upS = await key('up');
        const r2 = [upS.on];
        for (let i = 0; i < 3; i++) r2.push((await tab()).on);
        check('S20 a hidden top bar: Top nav off, its arrow does nothing, Tab steps over it', off.join() === 'top' && r2.join() === 'left,right,bottom,', { off, r2 });
        await blur();
        await d.ev(`document.getElementById('mixer-strip').classList.remove('ui-hidden')`);

        // ── Round the whole page: Tab from the last control comes back to it ──
        await d.ev(`(function(){ var all = Array.prototype.filter.call(document.querySelectorAll('button, input:not([type=hidden]), select, textarea, a[href], [tabindex]'), function (e) { return e.tabIndex >= 0 && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('#skipMenu'); }); all[all.length - 1].focus(); return 1; })()`);
        s = await tab();
        // In a browser tab, Tab past the end goes to the browser's own toolbar
        // (focus leaves the page); the next Tab comes back in at the first stop,
        // which S0 shows is the menu — but that Tab never reaches the page, so
        // it can't be sent from here. The desktop app wraps straight round.
        check('S20c Tab past the last control comes round to the menu, or out to the browser toolbar first', (s.open && s.on === 'left') || s.active === 'BODY', s);
        await forget();

        // ── Shift+Tab with nothing focused (and nothing remembered) opens it too ──
        s = await tab(['shift']);
        check('S20b Shift+Tab with nothing focused opens the menu, like Tab', s.open, s);
        await key('esc');
        await forget();

        // ── Where you were: painting takes focus off a control, Tab goes back ──
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('fpsCap').closest('.sidebar-section')); return 1; })()`);
        await sleep(700);
        await d.ev(`document.getElementById('fpsCap').focus(), 1`);
        await d.move(800, 450); await d.down(800, 450); await d.move(840, 470, 1); await d.up(840, 470); await sleep(150);
        const painted = await state();
        s = await tab();
        const fvM = await d.ev(`document.activeElement.matches(':focus-visible')`);
        check('M1 painting takes focus off the control; the next Tab goes back to it (ring on), not to the menu', painted.active === 'BODY' && s.active === 'fpsCap' && !s.open && fvM, { painted, s, fvM });
        await d.down(820, 460); await d.up(820, 460); await sleep(120);
        s = await tab(['shift']);
        check('M2 Shift+Tab after painting goes back to it too', s.active === 'fpsCap' && !s.open, s);
        s = await key('esc');
        const afterEsc = s.active;
        s = await tab();
        check('M3 Esc on the control leaves it (back to painting) and forgets it: the next Tab starts at the menu', afterEsc === 'BODY' && s.open && s.on === 'left', { afterEsc, s });
        await key('esc');
        // Remembered by mouse as well
        const rb = await d.ev(`(function(){ var e = document.getElementById('resetAppBtn'); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await d.click(rb.x, rb.y); await sleep(250);
        await key('esc'); await sleep(150);        // Reset app's question: Cancel
        await d.down(800, 450); await d.up(800, 450); await sleep(120);
        s = await tab();
        check('M4 a control clicked with the mouse is remembered too (Reset app)', s.active === 'resetAppBtn', s);
        await d.down(800, 450); await d.up(800, 450); await sleep(120);
        s = await key('esc');
        s = await tab();
        check('M5 Esc with nothing focused forgets it: the next Tab starts at the menu', s.open, s);
        await key('esc');
        // A remembered control that folded away: the menu instead
        await d.ev(`document.getElementById('fpsCap').focus(), 1`);
        await d.down(800, 450); await d.up(800, 450); await sleep(120);
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('joinRoomInput').closest('.sidebar-section')); return 1; })()`);
        await sleep(500);
        await blur();
        s = await tab();
        check('M6 if the remembered control has folded away, Tab starts at the menu', s.open, s);
        await key('esc');
        // Esc that closes a popup is the popup's: focus back on its trigger, kept
        await d.ev(`document.getElementById('mixerPresetsTrigger').focus(), 1`);
        await d.tap('Enter', 'Enter', 13, [], '\r'); await sleep(250);   // with its character, so the button presses
        const presetsOpen = await d.ev(`document.querySelector('.mixer-presets-panel').style.display !== 'none'`);
        s = await key('esc');
        s.presetsOpen = presetsOpen;
        check('M7 Esc that closes a popup leaves focus on its trigger (not taken off it)', s.presetsOpen && s.active === 'mixerPresetsTrigger', s);
        await forget();

        // ── Focus is not dropped when a section folds or focus mode comes and goes ──
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('fpsCap').closest('.sidebar-section')); return 1; })()`);
        await sleep(700);
        await d.ev(`document.getElementById('fpsCap').focus(), 1`);
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('joinRoomInput').closest('.sidebar-section')); return 1; })()`);
        await sleep(400);
        s = await state();
        const foldTitle = await d.ev(`(function(){ var t = document.getElementById('fpsCap').closest('.sidebar-section').querySelector('.section-title'); return document.activeElement === t; })()`);
        check('S24 a section folding with focus inside it hands focus to its title', foldTitle && s.active === 'section-title', s);
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('fpsCap').closest('.sidebar-section')); return 1; })()`);
        await sleep(700);
        await d.ev(`document.getElementById('pressureDissipation').focus(), 1`);
        await d.tap('f', 'KeyF', 70); await sleep(250);
        const inFocusMode = await d.ev(`({ on: document.body.classList.contains('focus-mode'), active: document.activeElement === document.body ? 'BODY' : document.activeElement.id })`);
        await d.tap('f', 'KeyF', 70); await sleep(400);
        s = await state();
        check('S25 F hides the UI (focus drops), F again brings it back with focus where it was', inFocusMode.on && inFocusMode.active === 'BODY' && s.active === 'pressureDissipation', { inFocusMode, s });
        await blur();

        // ── Words ──
        const sheet = await d.ev(`Array.prototype.filter.call(document.querySelectorAll('.hotkey-modal li'), function (l) { return /^(Ctrl\\+Shift\\+)?Tab /.test(l.textContent); }).length`);
        check('S21 the F1 sheet lists Tab and Ctrl+Shift+Tab', sheet === 2, sheet);
        const foot = await d.ev(`document.querySelector('#skipMenuFoot .hk-cap').textContent`);
        check('S21 the menu foot names Ctrl+Shift+Tab', foot === 'Ctrl+Shift+Tab', foot);
        const aria = await d.ev(`(function(){ var m = document.getElementById('skipMenu'); return [m.tagName, !!document.getElementById(m.getAttribute('aria-labelledby')), !!document.getElementById(m.getAttribute('aria-describedby'))]; })()`);
        check('S22 the menu is a labelled nav landmark', aria.join() === 'NAV,true,true', aria);

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('S23 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
