// Arrow keys on a slider move a useful amount (js/67-slider-keys.js),
// headless Chrome with trusted keys against the repo's own files:
//   node scripts/test/slider-keys/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
//
// Checks: a fine-stepped slider moves 1% of its travel per arrow and 10% per
// Shift+arrow (the curved Brush Size fader, Velocity), and its readout and
// the setting follow; a slider already at 1% a step keeps the browser's step
// and still takes Shift for 10%; Home is the browser's; the slider keeps
// focus; a dialog up in front keeps the arrows.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const K = { right: ['ArrowRight', 'ArrowRight', 39], left: ['ArrowLeft', 'ArrowLeft', 37], up: ['ArrowUp', 'ArrowUp', 38], home: ['Home', 'Home', 36], esc: ['Escape', 'Escape', 27] };
const near = (a, b) => Math.abs(a - b) < 1e-6;

(async () => {
    const d = await boot();
    try {
        const key = async (k, mods) => { await d.tap(...K[k], mods || []); await sleep(120); };
        const val = (id) => d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); return { v: parseFloat(e.value), active: document.activeElement === e }; })()`);
        const focus = (id) => d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); e.scrollIntoView({ block: 'center' }); e.focus(); return document.activeElement === e && e.getClientRects().length > 0; })()`);

        // ── The curved Brush Size fader: 0–1 at 0.001 ──
        check('L0 Brush Size takes focus', await focus('brushSizePerceptual'));
        let a = await val('brushSizePerceptual');
        const r0 = await d.ev(`document.getElementById('mixer-brushValue').textContent.trim()`);
        await key('right');
        let b = await val('brushSizePerceptual');
        const r1 = await d.ev(`document.getElementById('mixer-brushValue').textContent.trim()`);
        check('L1 an arrow moves the curved Brush Size fader 1% of its travel, and the readout follows', near(b.v - a.v, 0.01) && b.active && r1 !== r0, { a, b, r0, r1 });
        await key('right', ['shift']);
        const c = await val('brushSizePerceptual');
        check('L2 Shift+arrow moves it 10%', near(c.v - b.v, 0.1) && c.active, { b, c });
        await key('left', ['shift']); await key('left');
        const back = await val('brushSizePerceptual');
        check('L3 and back down the same way', near(back.v, a.v), { a, back });

        // ── Velocity: 1–5 at 0.001 (4,000 presses before) ──
        if (await focus('velocityInfluence')) {
            a = await val('velocityInfluence');
            await key('right'); await key('right');
            b = await val('velocityInfluence');
            const cfg = await d.ev('window.config && window.config.VELOCITY_INFLUENCE');
            check('L4 Velocity: two arrows move it 2% (0.08), and the setting follows', near(b.v - a.v, 0.08) && near(cfg, b.v), { a, b, cfg });
            await key('up', ['shift']);
            const c2 = await val('velocityInfluence');
            check('L4 ...Shift+Up 10% (0.4)', near(c2.v - b.v, 0.4), { b, c2 });
        } else {
            check('L4 Velocity is on screen at 1600 px to test', false, null);
        }

        // ── Viscosity: 0–1 at 0.01, already 1% a press ──
        check('L5 Viscosity takes focus', await focus('viscosity'));
        a = await val('viscosity');
        await key('right');
        b = await val('viscosity');
        check('L5 a slider already at 1% a step keeps the browser step (0.01)', near(b.v - a.v, 0.01), { a, b });
        await key('right', ['shift']);
        const c3 = await val('viscosity');
        check('L6 ...and Shift+arrow still moves it 10%', near(c3.v - b.v, 0.1), { b, c3 });
        await key('home');
        const h = await val('viscosity');
        check('L7 Home is the browser\'s: to the minimum', near(h.v, 0), h);

        // ── A dialog in front keeps the arrows ──
        await focus('brushSizePerceptual');
        a = await val('brushSizePerceptual');
        await d.ev(`(function(){ window.appConfirm({ title: 'Test', confirmLabel: 'OK', cancelLabel: 'Cancel' }); return 1; })()`);
        await sleep(150);
        await d.ev(`document.getElementById('brushSizePerceptual').focus(), 1`);   // pulled back into the dialog by 00b
        await key('right');
        b = await val('brushSizePerceptual');
        check('L8 with a dialog up, the slider behind it does not move', near(a.v, b.v), { a, b });
        await key('esc');

        const errs = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('L9 no page exceptions', errs.length === 0, errs.slice(0, 3));
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
