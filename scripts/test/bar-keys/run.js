// Sitting 4 of the keyboard audit: the bottom bar's resolution dropdowns as
// keyboard listboxes (js/20 makeQubDropdown), no invisible Tab stops (the
// hidden native mirrors), and a focus ring on the controls that had none.
// Headless Chrome with trusted keys against the repo's own files:
//   node scripts/test/bar-keys/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = {
    space: [' ', 'Space', 32], enter: ['Enter', 'Enter', 13], esc: ['Escape', 'Escape', 27], tab: ['Tab', 'Tab', 9],
    up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], home: ['Home', 'Home', 36], end: ['End', 'End', 35],
    c: ['c', 'KeyC', 67]
};

(async () => {
    const d = await boot();
    try {
        const key = async (k, mods) => { await d.tap(...K[k], mods || [], k === 'enter' ? '\r' : undefined); await sleep(180); };
        const st = () => d.ev(`(function(){
            var a = document.activeElement, dd = a && a.closest ? a.closest('.qub-dd') : null;
            var btn = dd ? dd.querySelector('.qub-dd-btn') : null, list = dd ? dd.querySelector('.qub-dd-list') : null;
            var sel = dd ? dd.querySelector('select') : null;
            return {
                active: a ? (a.id || (a === document.body ? 'BODY' : a.className)) : null,
                role: a ? a.getAttribute('role') : null,
                text: a ? (a.textContent || '').trim().slice(0, 30) : null,
                selected: a ? a.getAttribute('aria-selected') : null,
                open: !!(dd && dd.classList.contains('open')),
                expanded: btn ? btn.getAttribute('aria-expanded') : null,
                listRole: list ? list.getAttribute('role') : null,
                value: sel ? sel.value : null,
                btnText: btn ? btn.textContent.trim() : null,
                cursor: document.getElementById('cursorToggle').checked
            };
        })()`);

        // ── Into the bottom bar by the skip menu ──
        await key('tab'); await key('down'); await key('enter');
        let s = await st();
        const name = await d.ev(`(function(){ var b = document.activeElement; return (b.getAttribute('aria-labelledby') || '').split(' ').map(function (id) { var e = document.getElementById(id); return e ? e.textContent.trim() : '?'; }).join(' '); })()`);
        check('Q1 Bottom nav lands on a dropdown button that says listbox, closed, named by its label and value', /qub-dd-btn/.test(s.active) && s.expanded === 'false' && (await d.ev(`document.activeElement.getAttribute('aria-haspopup')`)) === 'listbox' && /\S+ \S+/.test(name), { s, name });
        const v0 = s.value;

        // ── Open, move, pick ──
        await key('enter');
        s = await st();
        check('Q2 Enter opens the list (role listbox) with focus on the chosen option', s.open && s.expanded === 'true' && s.listRole === 'listbox' && s.role === 'option' && s.selected === 'true', s);
        await key('c');
        const afterC = await st();
        check('Q3 a letter in the open list does not fire its hotkey (C left the cursor alone)', afterC.open && afterC.cursor === s.cursor, { before: s.cursor, after: afterC.cursor });
        await key('down');
        s = await st();
        const t1 = s.text;
        check('Q4 ArrowDown moves to the next option', s.role === 'option' && s.selected === 'false', s);
        await key('enter'); await sleep(400);
        s = await st();
        check('Q5 Enter picks it: the select changes, the list closes, focus back on the button', !s.open && /qub-dd-btn/.test(s.active) && s.value !== v0 && t1.indexOf(s.btnText.replace(/\s*▾.*$/, '').split(' ')[0]) === 0, { s, v0, t1 });
        // Put it back: ArrowUp on the closed button opens it, Home / End move, Esc closes.
        await key('up');
        s = await st();
        check('Q6 ArrowUp on the closed button opens the list', s.open && s.role === 'option', s);
        await key('end'); const end = (await st()).text;
        await key('home'); const home = (await st()).text;
        check('Q6 ...Home and End go to the first and last options', end !== home, { home, end });
        await key('esc');
        s = await st();
        check('Q7 Esc closes it and focus goes back to the button, value unchanged', !s.open && /qub-dd-btn/.test(s.active) && s.value !== v0, s);
        await d.ev(`(function(){ var sel = document.activeElement.closest('.qub-dd').querySelector('select'); sel.value = ${JSON.stringify(v0)}; sel.dispatchEvent(new Event('change', { bubbles: true })); return sel.value; })()`);
        await sleep(400);

        // ── Tab: never onto the hidden selects; out of an open list it closes ──
        await key('enter');
        await key('tab');
        s = await st();
        check('Q8 Tab out of an open list closes it and lands on the next dropdown, not its hidden <select>', !(await d.ev(`!!document.querySelector('.qub-dd.open')`)) && /qub-dd-btn/.test(s.active || ''), s);

        // ── The hidden mirrors are out of the Tab order ──
        const mirrors = await d.ev(`['randomColor', 'stepPalette', 'colorGate', 'mutationScope', 'visualResolution', 'physicsResolution'].map(function (id) { var e = document.getElementById(id); return e ? id + ':' + e.tabIndex + ':' + e.getAttribute('aria-hidden') : id + ':missing'; })`);
        check('Q9 the six hidden mirrors are tabIndex -1 and aria-hidden', mirrors.every(m => /:-1:true$/.test(m)), mirrors);
        // A Tab walk across the top bar never stops on one.
        // Off the last control and Esc, so Tab starts at the skip menu, not back where we were.
        await d.ev('document.activeElement.blur(), 1'); await key('esc');
        await key('tab'); await key('up'); await key('enter');
        const walk = [];
        for (let i = 0; i < 40; i++) {
            const a = await d.ev(`(function(){ var a = document.activeElement; return a && a.closest && a.closest('#mixer-strip') ? (a.id || a.className) : null; })()`);
            if (!a) break;
            walk.push(a);
            await key('tab');
        }
        check('Q10 a Tab walk of the top bar never lands on a hidden mirror', walk.length > 5 && !walk.some(w => /^(randomColor|stepPalette|colorGate)$/.test(w)), { n: walk.length, walk: walk.slice(0, 12) });

        // ── Rings ──
        const ring = async (id) => {
            await d.ev(`document.activeElement && document.activeElement.blur(), 1`);
            await key('tab'); await key('esc');            // a keyboard press, so focus is the keyboard's
            return d.ev(`(function(){ var e = ${id}; e.scrollIntoView({ block: 'center' }); e.focus(); var cs = getComputedStyle(e); return { fv: e.matches(':focus-visible'), outline: cs.outlineStyle + ' ' + cs.outlineWidth }; })()`);
        };
        const r1 = await ring(`document.querySelector('#quality-underbar .qub-dd-btn')`);
        const r2 = await ring(`document.getElementById('materialMode')`);
        await d.ev(`(function(){ window.openSidebarSection(document.getElementById('fpsCap').closest('.sidebar-section')); return 1; })()`);
        await sleep(900);
        const r3 = await ring(`document.getElementById('fpsCap')`);
        check('Q11 a ring on the bottom-bar button, the Material select and a sidebar select', [r1, r2, r3].every(r => r.fv && /^solid 2px$/.test(r.outline)), { r1, r2, r3 });

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('Q12 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
