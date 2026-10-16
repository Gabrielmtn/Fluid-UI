// Keep distance (js/56) held while the mouse spins: the paint stays on the
// circle. Headless Chrome with trusted mouse and key input against the
// repo's own files:
//   node scripts/test/stroke-lock/ring.js
// Reuses the radial menu's driver (own static server, clean profile).
// Exit code 1 if any check failed.
//
// 2026-10-16, Gabriel: "when you spin the mouse while holding the hotkey,
// the ring shrinks". The lock put every sample on the circle, but each
// thing that joined two of them drew a straight line that cut inside it:
// the Constant hose once a frame, the On Move walker between samples, and
// Steady's head chasing the brush. At three turns a second on a 194 px
// circle the dabs' median radius was 191 px at Steady 0, 183 px at ~34
// fps, 144 px at Steady 30% and 69 px at Steady 100% (wound into the
// middle). Now they go round it (StrokeLock.path).
//
// Every painted dab is read where 05j hands it to window.queueDab, so the
// check is on what reached the fluid. A rAF busy-wait makes the slow-frame
// case (~34 fps under a 144 Hz headless clock).
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }

(async () => {
    const d = await boot();
    try {
        await d.ev(`(function(){
            StrokeLock.setKey('distance', 'Semicolon');
            var c = document.getElementById('canvas');
            window.__dabs = [];
            var qd = window.queueDab;
            window.queueDab = function (nx, ny) {
                window.__dabs.push(Math.hypot(nx * c.width - c.width / 2, ny * c.height - c.height / 2));
                return qd.apply(this, arguments);
            };
            window.__slow = 0;
            (function tick(){ if (window.__slow) { var t = performance.now(); while (performance.now() - t < window.__slow) {} } requestAnimationFrame(tick); })();
            return 1;
        })()`);
        const g = await d.ev(`(function(){ var c = document.getElementById('canvas'), r = c.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: Math.round(Math.min(r.width, r.height) * 0.3), k: c.width / r.width }; })()`);
        const R = g.R * g.k;   // the circle, canvas px

        // Hold the key, press, spin round the circle at `rps` turns a second
        // for `ms`; the dabs' distances from the centre (the first few, laid
        // as the stroke starts, left out).
        async function spin(o) {
            await d.ev(`(function(){
                config.BRUSH_STEADY = ${o.steady || 0};
                config.BRUSH_CONTINUOUS = ${o.onMove ? 'false' : 'true'};
                if (window.clearCanvas) clearCanvas();
                return 1; })()`);
            await sleep(300);
            await d.move(g.cx + g.R, g.cy);
            await sleep(50);
            if (!o.free) await d.keyDown(';', 'Semicolon', 186, [], ';');
            await sleep(50);
            await d.ev(`window.__slow = ${o.slowMs || 0}, window.__dabs = [], 1`);
            await d.down(g.cx + g.R, g.cy);
            const t0 = Date.now(), rps = 3;
            let a = 0;
            while (Date.now() - t0 < (o.ms || 2000)) {
                a = (Date.now() - t0) / 1000 * rps * Math.PI * 2;
                await d.move(g.cx + Math.cos(a) * g.R, g.cy + Math.sin(a) * g.R, 1);
                await sleep(4);
            }
            const held = await d.ev(`StrokeLock.isHeld('distance')`);
            const s = await d.ev(`(function(){ var a = window.__dabs.slice(20).sort(function(x,y){return x-y;});
                return a.length ? { n: a.length, min: +a[0].toFixed(2), med: +a[a.length >> 1].toFixed(2), max: +a[a.length - 1].toFixed(2) } : null; })()`);
            await d.ev('window.__slow = 0, 1');
            await d.up(g.cx + Math.cos(a) * g.R, g.cy + Math.sin(a) * g.R);
            if (!o.free) await d.keyUp(';', 'Semicolon', 186, []);
            await sleep(300);
            return Object.assign({ held }, s);
        }
        const onRing = (s, tol) => !!s && s.n > 50 && s.min >= R - tol && s.max <= R + 0.5;

        let s = await spin({});
        check('R1 Constant, Steady 0: every dab on the circle', s.held && onRing(s, 0.5), Object.assign({ R }, s));
        s = await spin({ slowMs: 30 });
        check('R2 ...on slow frames too (one long step a frame)', onRing(s, 0.5), s);
        s = await spin({ steady: 0.3 });
        check('R3 Steady 30%: the head goes round, not across', onRing(s, 0.5), s);
        s = await spin({ steady: 1 });
        check('R4 Steady 100%: it no longer winds into the middle', onRing(s, 0.5), s);
        // On Move walks short straight pieces of the arc: 0.25 px of sag at most.
        s = await spin({ onMove: true, slowMs: 30 });
        check('R5 On Move on slow frames: every dab on the circle', onRing(s, 0.3), s);
        s = await spin({ onMove: true, steady: 0.3 });
        check('R6 On Move, Steady 30%: every dab on the circle', onRing(s, 0.3), s);
        // No key: nothing goes round anything (path() is null), the hose's
        // straight steps still cut inside a little, as they always did.
        const free = await d.ev(`StrokeLock.path(10, 10, 300, 200) === null`);
        s = await spin({ free: true });
        check('R7 no lock held: path() stays out of it', free && !s.held && s && s.n > 50, s);
    } finally { await d.close(); }
    const failed = results.filter(r => !r.ok);
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
