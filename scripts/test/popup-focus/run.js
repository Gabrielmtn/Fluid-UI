// Popups take focus (js/00b-dialog-focus.js popup(), wired into Presets
// (js/20), More (js/46), the colour popover (js/64) and the room menus
// (js/06e)), headless Chrome with trusted keys and mouse against the repo's
// own files:
//   node scripts/test/popup-focus/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
//
// Checks, for each popup: opened from the keyboard, focus moves in; Esc
// closes it and focus goes back to its trigger; Tab walking out closes it;
// opened with the mouse, focus stays where it was (Space still freezes).
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = { space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9] };

(async () => {
    const d = await boot();
    try {
        const key = async (k, mods) => { await d.tap(...K[k], mods || [], k === 'enter' ? '\r' : undefined); await sleep(200); };
        const where = (sel) => d.ev(`(function(){
            var a = document.activeElement, p = document.querySelector(${JSON.stringify(sel)});
            var shown = !!(p && p.getClientRects().length && getComputedStyle(p).display !== 'none' && !p.hidden);
            return { shown: shown, inside: !!(p && p.contains(a)), active: a ? (a.id || (a === document.body ? 'BODY' : a.tagName + '.' + String(a.className).split(' ')[0])) : null,
                frozen: !!window.__fluidFrozen };
        })()`);
        const focusEl = (id) => d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); e.scrollIntoView({ block: 'center' }); e.focus(); return document.activeElement === e; })()`);
        const centre = (id) => d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

        // ── Presets ──
        const P = '.mixer-presets-panel';
        await focusEl('mixerPresetsTrigger');
        await key('enter');
        let s = await where(P);
        const exp = await d.ev(`document.getElementById('mixerPresetsTrigger').getAttribute('aria-expanded')`);
        check('P1 Presets from the keyboard: opens with focus on a preset, aria-expanded true', s.shown && s.inside && exp === 'true', { s, exp });
        await key('esc');
        s = await where(P);
        check('P2 Esc closes it and focus goes back to the trigger', !s.shown && s.active === 'mixerPresetsTrigger', s);
        await key('enter');
        await d.ev(`(function(){ var p = document.querySelector('.mixer-presets-panel'); var f = p.querySelector('button, input, select, [tabindex]:not([tabindex="-1"])'); f.focus(); return 1; })()`);
        await key('tab', ['shift']);
        s = await where(P);
        let skip = await d.ev('window.SkipMenu.isOpen()');
        check('P3 Shift+Tab back past its first control steps out and closes Presets (skip menu shut)', !s.shown && !skip && s.active !== 'BODY', { s, skip });
        await d.ev(`document.getElementById('mixerPresetsTrigger').focus(), 1`);
        await key('enter');
        await d.ev(`document.getElementById('resetAppBtn').focus(), 1`);   // as if Tab had landed outside it
        s = await where(P);
        check('P3 ...and focus landing outside it closes it too', !s.shown && s.active === 'resetAppBtn', s);
        await d.ev('document.activeElement.blur(), 1');
        const pt = await centre('mixerPresetsTrigger');
        await d.click(pt.x, pt.y); await sleep(250);
        s = await where(P);
        await key('space');
        const sp = await where(P);
        check('P4 opened with the mouse: focus not moved in, and Space still freezes', s.shown && !s.inside && sp.frozen, { s, sp });
        await key('space');
        // "Away": a point on the canvas outside the open panel (a fixed 800,450
        // landed inside it once the Walnut & Copper bar moved the panel).
        const away = await d.ev(`(function(){ var c = document.getElementById('canvas-area').getBoundingClientRect(); return { x: c.left + 40, y: c.bottom - 40 }; })()`);
        await d.click(away.x, away.y); await sleep(200);
        check('P4 ...a click away closes it', !(await where(P)).shown);

        // ── Colour popover ──
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('backgroundColorPicker').closest('.sidebar-section')); return 1; })()`);
        await sleep(900);
        const okBg = await focusEl('backgroundColorPicker');
        await key('enter');
        s = await where('.cp-pop');
        check('C1 a colour well from the keyboard: the picker opens with focus inside it', okBg && s.shown && s.inside, { okBg, s });
        await key('esc');
        s = await where('.cp-pop');
        check('C2 Esc closes it and focus goes back to the well', !s.shown && s.active === 'backgroundColorPicker', s);
        await key('enter');
        await d.ev(`document.querySelector('.cp-pop .cp-pop-close').focus(), 1`);
        await key('enter');
        s = await where('.cp-pop');
        check('C3 Enter on its × closes it and focus goes back to the well (it used to drop to the page)', !s.shown && s.active === 'backgroundColorPicker', s);
        await key('enter');
        await d.ev(`document.querySelector('.cp-pop .cp-pop-close').focus(), 1`);
        await key('tab', ['shift']);
        s = await where('.cp-pop');
        skip = await d.ev('window.SkipMenu.isOpen()');
        check('C4 Shift+Tab back past the picker × steps out and closes it (skip menu shut)', !s.shown && !skip && s.active !== 'BODY', { s, skip });
        await d.ev('document.activeElement.blur(), 1');

        // ── Room menu (⋯) and Invite, shown as if in a room ──
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('mpConnected').closest('.sidebar-section')); document.getElementById('mpDisconnected').style.display = 'none'; document.getElementById('mpConnected').style.display = ''; return 1; })()`);
        await sleep(900);
        const okMenu = await focusEl('mpMenuBtn');
        await key('enter');
        s = await where('#mpRoomMenu');
        check('R1 Room options from the keyboard: the menu opens with focus on an item', okMenu && s.shown && s.inside, { okMenu, s });
        await key('esc');
        s = await where('#mpRoomMenu');
        check('R2 Esc closes it and focus goes back to the ⋯ button', !s.shown && s.active === 'mpMenuBtn', s);
        await focusEl('mpInviteBtn');
        await key('enter');
        s = await where('#mpInvitePop');
        check('R3 Invite from the keyboard: opens with focus inside', s.shown && s.inside, s);
        await d.ev(`document.getElementById('mpMenuBtn').focus(), 1`);   // Tab landing on the next control
        s = await where('#mpInvitePop');
        check('R4 focus walking out of Invite closes it', !s.shown && s.active === 'mpMenuBtn', s);

        // ── More, at a width that parks faders ──
        await d.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
        await sleep(300);
        await d.ev(`(window.dispatchEvent(new Event('resize')), window.StripMore && window.StripMore.measure(), 1)`);
        await sleep(400);
        const moreShown = await d.ev(`(function(){ var b = document.getElementById('mixerMoreBtn'); return !!(b && b.getClientRects().length); })()`);
        if (moreShown) {
            await focusEl('mixerMoreBtn');
            await key('enter');
            s = await where('#mixer-more-panel');
            check('M1 More from the keyboard: opens with focus on a parked fader', s.shown && s.inside, s);
            await key('esc');
            s = await where('#mixer-more-panel');
            check('M2 Esc closes it and focus goes back to More', !s.shown && s.active === 'mixerMoreBtn', s);
        } else {
            check('M1 More appears at 900 px wide', false, null);
        }
        await d.send('Emulation.clearDeviceMetricsOverride', {});

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('X no page exceptions', errs.length === 0, errs.slice(0, 3));
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
