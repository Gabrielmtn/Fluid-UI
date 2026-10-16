// The slowdown button under the canvas (js/08a-quality-governor.js),
// headless Chrome with trusted mouse strokes against the repo's own files:
//   node scripts/test/slowdown/run.js
// Reuses the radial menu's driver (own static server, clean profile).
// SHOT_DIR= writes screenshots there. Exit code 1 if any check failed.
//
// A stroke is made slow for real: a rAF callback busy-waits while the
// governor's paint stamp is fresh, so the governor counts fewer frames
// during painting than between strokes. Headless rAF runs at 144 Hz with
// the app capped at 72: 'mild' spins 8 ms a frame (~15% under, yellow),
// 'heavy' 40 ms (red), 'severe' 160 ms whether painting or not (the old
// "running very slowly" test, red).
//
// Checks: nothing shows idle or on a clean stroke; a mild stroke lights it
// yellow and a heavy one red, on the underbar after the Canvas readout;
// with the bar hidden it floats over the painting and comes back after;
// a click lowers Motion Detail one step and hides it; the dismiss keeps
// yellow quiet but red still asks; clean painting takes it back; the old
// severe test lights it red and its click runs the old rescue.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }

(async () => {
    const d = await boot();
    try {
        // The spin: installed once, steered by window.__slowSpin.
        await d.ev(`(function(){
            window.__slowSpin = 'off';
            function spin(ms){ var t = performance.now(); while (performance.now() - t < ms) {} }
            function tick(){
                var m = window.__slowSpin, now = performance.now();
                var painting = window.__lastPaintMs && (now - window.__lastPaintMs) < 250;
                if (m === 'severe') spin(160);
                else if (painting && m === 'heavy') spin(40);
                else if (painting && m === 'mild') spin(8);
                requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
            return 1;
        })()`);
        const state = () => d.ev(`(function(){
            var g = window.QualityGovernor.getState(), c = document.getElementById('slowdownCell');
            var b = document.getElementById('slowdownBtn');
            var r = c && !c.hidden ? c.getBoundingClientRect() : null;
            return {
                shown: g.slowdown.shown, paintLevel: g.slowdown.paintLevel, rescue: g.slowdown.rescue,
                idleFps: Math.round(g.slowdown.idleFps * 10) / 10, wavedOff: g.slowdown.wavedOff,
                visible: !!(c && !c.hidden && r && r.width > 0),
                parent: c && c.parentElement ? (c.parentElement.id || c.parentElement.tagName) : null,
                floating: !!(c && c.classList.contains('floating')),
                cls: b ? b.className : null, text: b ? b.textContent : null,
                prev: c && c.previousElementSibling ? c.previousElementSibling.className : null,
                box: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null,
                dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION, iters: window.config.PRESSURE_ITERATIONS,
                motionSel: document.getElementById('physicsResolution').value, imageSel: document.getElementById('visualResolution').value
            };
        })()`);
        const area = await d.ev(`(function(){ var r = document.getElementById('canvas-area').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, rx: Math.min(r.width, r.height) * 0.25 }; })()`);
        // One stroke: circles round the middle of the canvas for ms.
        async function stroke(ms) {
            const t0 = Date.now();
            let a = 0;
            await d.move(area.x + area.rx, area.y);
            await d.down(area.x + area.rx, area.y);
            while (Date.now() - t0 < ms) {
                a += 0.12;
                await d.move(area.x + Math.cos(a) * area.rx, area.y + Math.sin(a) * area.rx, 1);
                await sleep(16);
            }
            await d.up(area.x + Math.cos(a) * area.rx, area.y + Math.sin(a) * area.rx);
        }
        const spin = (m) => d.ev(`window.__slowSpin = ${JSON.stringify(m)}, 1`);
        // The governor's own lines since the last call, for the log.
        let seen = 0;
        const govLog = () => {
            const out = [];
            for (; seen < d.events.length; seen++) {
                const e = d.events[seen];
                if (e.method !== 'Runtime.consoleAPICalled') continue;
                const t = (e.params.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' ');
                if (/\[Governor\]/.test(t)) out.push(t);
            }
            if (out.length) console.log('     ' + out.join('\n     '));
        };
        // A slow stroke after a pause long enough for the baseline.
        async function slowStroke(mode, ms) {
            await sleep(2500);
            await spin(mode);
            await stroke(ms || 5000);
            await spin('off');
            govLog();
            return state();
        }
        const clickAt = (s, dx) => d.click(dx >= 0 ? s.box.x + dx : s.box.x + s.box.w + dx, s.box.y + s.box.h / 2);

        // ── Nothing to say yet ──
        await sleep(3000);
        let s = await state();
        check('D0 idle: hidden, baseline measured', s.shown === 'none' && !s.visible && s.idleFps > 20, s);
        await stroke(2500);
        s = await state();
        govLog();
        check('D1 a clean stroke: still hidden', s.shown === 'none' && !s.visible, s);

        // ── Yellow, then red ──
        s = await slowStroke('mild');
        check('D2 a mild slowdown lights it yellow', s.shown === 'yellow' && s.visible && s.cls === 'btn--slow-yellow', s);
        check('D2 ...on the underbar after the Canvas readout', s.parent === 'quality-underbar' && !s.floating && /qub-size/.test(s.prev || ''), s);
        check('D2 ...saying the words', s.text === 'Slowdown detected, lower quality?', s.text);
        await d.shot('slowdown-yellow.png');
        s = await slowStroke('heavy');
        check('D3 a heavy slowdown turns it red', s.shown === 'red' && s.visible && s.cls === 'btn--slow-red', s);
        await d.shot('slowdown-red.png');

        // ── The bar hidden while it is up: it floats ──
        await d.ev(`document.getElementById('quality-underbar').classList.add('ui-hidden'), 1`);
        await sleep(800);
        s = await state();
        const ca = await d.ev(`(function(){ var r = document.getElementById('canvas-area').getBoundingClientRect(); return { l: Math.round(r.left), b: Math.round(r.bottom) }; })()`);
        check('D4 bar hidden: it floats at the painting\'s bottom-left', s.visible && s.floating && s.parent === 'BODY' &&
            Math.abs(s.box.x - (ca.l + 14)) <= 2 && s.box.y + s.box.h <= 900, { s, ca });
        await d.shot('slowdown-floating.png');
        await d.ev(`document.getElementById('quality-underbar').classList.remove('ui-hidden'), 1`);
        await sleep(800);
        s = await state();
        check('D4 ...and goes back on the bar when it returns', s.visible && s.parent === 'quality-underbar' && !s.floating && /qub-size/.test(s.prev || ''), s);

        // ── The click lowers one step ──
        const before = s;
        await clickAt(s, 40);
        await sleep(400);
        govLog();
        s = await state();
        check('D5 click lowers Motion Detail one step and hides it',
            s.shown === 'none' && !s.visible && s.sim < before.sim && s.dye === before.dye && +s.motionSel === s.sim,
            { before: [before.dye, before.sim], after: [s.dye, s.sim, s.imageSel, s.motionSel] });

        // ── Dismiss: yellow stays quiet, red still asks ──
        s = await slowStroke('mild');
        check('D6 yellow again after the new setting', s.shown === 'yellow' && s.visible, s);
        if (s.box) await clickAt(s, -8);
        await sleep(200);
        s = await state();
        check('D6 the X hides it', s.shown === 'none' && !s.visible && s.wavedOff === 1, s);
        s = await slowStroke('mild');
        check('D7 waved-off yellow stays quiet', s.shown === 'none' && !s.visible, s);
        s = await slowStroke('heavy');
        check('D7 ...but red still asks', s.shown === 'red' && s.visible, s);

        // ── Clean painting takes it back ──
        await sleep(2500);
        await stroke(4500);
        govLog();
        s = await state();
        check('D8 3 s of clean painting takes it back', s.shown === 'none' && !s.visible && s.paintLevel === 0, s);

        // ── The old test: running very slowly, red, the old rescue ──
        const pre = await state();
        await spin('severe');
        let up = false;
        for (let i = 0; i < 20 && !up; i++) { await sleep(500); up = (await state()).rescue; }
        s = await state();
        check('D9 the old severe test lights it red', up && s.shown === 'red' && s.visible, s);
        await spin('off');
        // Click before the fps recovers and the rescue retracts itself.
        if (s.box) await clickAt(s, 40);
        await sleep(400);
        govLog();
        s = await state();
        check('D9 ...and its click runs the old rescue (never raising)',
            s.shown === 'none' && s.dye === Math.min(pre.dye, 1024) && s.sim === Math.min(pre.sim, 256) && s.iters === Math.min(pre.iters, 20),
            { pre: [pre.dye, pre.sim, pre.iters], after: [s.dye, s.sim, s.iters] });

        const errs = d.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception ? e.params.exceptionDetails.exception.description : e.params.exceptionDetails.text);
        check('D10 no page exceptions', errs.length === 0, errs.slice(0, 3));
    } catch (e) {
        check('run', false, String(e && e.stack || e));
    } finally {
        await d.close();
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
