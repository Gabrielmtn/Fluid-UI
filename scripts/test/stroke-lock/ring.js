// Keep distance (js/56) held while the mouse spins: the paint stays on the
// circle, and Stabilization still sets the pace. Headless Chrome with
// trusted mouse and key input against the repo's own files:
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
// Then: "allow stabilization speed to work, but avoid the collapsing". The
// first fix kept Steady's head within a quarter turn of the brush, which
// dragged it round at the hand's speed whenever the hand outran Steady's
// top speed. Now the head goes round at its own pace, one way, and finishes
// what it owes when the hand stops (05d0 ringChase).
//
// Every painted dab is read where 05j hands it to window.queueDab, so the
// check is on what reached the fluid. Steady's head is logged once a frame
// from BrushEngine.head(). A rAF busy-wait makes the slow-frame case (~34
// fps under a 144 Hz headless clock).
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
            // Steady's head and the hand it chases, once a frame.
            window.__heads = null;
            (function log(){
                var h = window.__heads && BrushEngine.head();
                if (h) window.__heads.push({ t: performance.now(), a: Math.atan2(h.y - c.height / 2, h.x - c.width / 2), gap: Math.hypot(h.handX - h.x, h.handY - h.y) });
                requestAnimationFrame(log);
            })();
            return 1;
        })()`);
        const g = await d.ev(`(function(){ var c = document.getElementById('canvas'), r = c.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: Math.round(Math.min(r.width, r.height) * 0.3), k: c.width / r.width }; })()`);
        const R = g.R * g.k;   // the circle, canvas px
        // Turns a second: three, or faster on a short canvas so the hand still
        // outruns Steady 0.3's top speed (250 / 0.09 CSS px/s) by 1.4x. The
        // ring is 0.3 of the canvas's short side, so a taller top bar (Walnut &
        // Copper) shrinks it; the check is about the head's pace, not the size.
        const RPS = Math.max(3, 1.4 * (250 / 0.09) / (2 * Math.PI * g.R));

        // Hold the key, press, spin round the circle at three turns a second
        // for `ms`, then hold still for `stillMs` with the button down. Gives
        // the dabs' distances from the centre (the first few, laid as the
        // stroke starts, left out) and, with Steady, how the head went round.
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
            await d.ev(`window.__slow = ${o.slowMs || 0}, window.__dabs = [], window.__heads = [], 1`);
            await d.down(g.cx + g.R, g.cy);
            const t0 = Date.now(), rps = RPS;
            let a = 0;
            while (Date.now() - t0 < (o.ms || 2000)) {
                a = (Date.now() - t0) / 1000 * rps * Math.PI * 2;
                await d.move(g.cx + Math.cos(a) * g.R, g.cy + Math.sin(a) * g.R, 1);
                await sleep(4);
            }
            const spunMs = await d.ev('performance.now()');
            if (o.stillMs) await sleep(o.stillMs);
            const held = await d.ev(`StrokeLock.isHeld('distance')`);
            const s = await d.ev(`(function(){ var a = window.__dabs.slice(20).sort(function(x,y){return x-y;});
                return a.length ? { n: a.length, min: +a[0].toFixed(2), med: +a[a.length >> 1].toFixed(2), max: +a[a.length - 1].toFixed(2) } : null; })()`);
            // The head: turns gone round, any step back against the spin, its
            // pace (canvas px a second round the circle) from 0.5 s in to the
            // end of the spin, and how far it was from the hand at the end.
            const head = await d.ev(`(function(){
                var L = window.__heads || [];
                if (L.length < 10) return null;
                function wrap(x){ x = (x + Math.PI) % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x - Math.PI; }
                var turn = 0, back = 0, wTurn = 0, w0 = null, w1 = null;
                for (var i = 1; i < L.length; i++) {
                    var da = wrap(L[i].a - L[i - 1].a);
                    turn += da;
                    if (da < -1e-3) back++;
                    if (L[i].t - L[0].t >= 500 && L[i].t <= ${spunMs}) { wTurn += da; if (w0 == null) w0 = L[i - 1].t; w1 = L[i].t; }
                }
                return { turns: +(turn / (2 * Math.PI)).toFixed(2), back: back,
                    pace: w1 > w0 ? Math.round(wTurn * ${R} / ((w1 - w0) / 1000)) : null,
                    gapEnd: +L[L.length - 1].gap.toFixed(2) };
            })()`);
            await d.ev('window.__slow = 0, window.__heads = null, 1');
            await d.up(g.cx + Math.cos(a) * g.R, g.cy + Math.sin(a) * g.R);
            if (!o.free) await d.keyUp(';', 'Semicolon', 186, []);
            await sleep(300);
            return Object.assign({ held }, s, head ? { head } : {});
        }
        const onRing = (s, tol) => !!s && s.n > 50 && s.min >= R - tol && s.max <= R + 0.5;
        // Steady's top speed (05d0 steadyShape): 250 CSS px a second at full
        // Steady, divided by Steady squared. The hand here goes round at
        // 2·pi·R·3, about 3,660 px a second, faster than both settings below.
        const vmax = steady => 250 / (steady * steady) * g.k;
        const handPace = 2 * Math.PI * R * RPS;
        const atPace = (s, steady) => !!(s.head && s.head.pace) && Math.abs(s.head.pace - vmax(steady)) <= 0.1 * vmax(steady);

        let s = await spin({});
        check('R1 Constant, Steady 0: every dab on the circle', s.held && onRing(s, 0.5), Object.assign({ R }, s));
        s = await spin({ slowMs: 30 });
        check('R2 ...on slow frames too (one long step a frame)', onRing(s, 0.5), s);
        s = await spin({ steady: 0.3, stillMs: 1500 });
        check('R3 Steady 30%: every dab on the circle', onRing(s, 0.5), s);
        check('R3 ...the head goes round at Steady\'s top speed, not the hand\'s', atPace(s, 0.3) && handPace > vmax(0.3) * 1.2,
            { pace: s.head && s.head.pace, vmax: Math.round(vmax(0.3)), hand: Math.round(handPace) });
        check('R3 ...never turning back, and caught up once the hand stopped', s.head && s.head.back === 0 && s.head.gapEnd <= 0.09 * 24 * g.k + 1.5, s.head);
        s = await spin({ steady: 1 });
        check('R4 Steady 100%: it no longer winds into the middle', onRing(s, 0.5), s);
        check('R4 ...and keeps its slow pace round the circle, one way', atPace(s, 1) && s.head.back === 0,
            { head: s.head, vmax: Math.round(vmax(1)) });
        // On Move walks short straight pieces of the arc: 0.25 px of sag at most.
        s = await spin({ onMove: true, slowMs: 30 });
        check('R5 On Move on slow frames: every dab on the circle', onRing(s, 0.3), s);
        s = await spin({ onMove: true, steady: 0.3 });
        check('R6 On Move, Steady 30%: every dab on the circle', onRing(s, 0.3), s);
        // No key: nothing goes round anything (path() and ring() are null),
        // the hose's straight steps still cut inside a little, as they always did.
        const free = await d.ev(`StrokeLock.path(10, 10, 300, 200) === null && StrokeLock.ring() === null`);
        s = await spin({ free: true });
        check('R7 no lock held: the circle stays out of it', free && !s.held && s && s.n > 50, s);
    } finally { await d.close(); }
    const failed = results.filter(r => !r.ok);
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
