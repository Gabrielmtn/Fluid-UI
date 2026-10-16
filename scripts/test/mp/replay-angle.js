// A replay carries the brush's Angle — here and to the room (2026-10-16).
// Headless Chrome against the repo's own files, no relay: the wire is a fake
// socket, the way wire-loopback.js does it.
//   node scripts/test/mp/replay-angle.js
//
// Found before Next Fest: a stranger's replay printed the tip turned the way
// the VIEWER's slider pointed. The live wire had carried `angle` per dab since
// the footprint fix, and the Animations recorder stored `ang`, but the stroke
// replay never recorded it (05d pushStrokeEvent), so neither the local replay
// nor the broadcast one (06d) knew what pose to reproduce.
//
// Checks: a stroke painted at Angle 37 goes out as a replay whose every event
// says ang 37; played back through the real receive path (scheduleStrokeReplay)
// on a canvas whose slider says 0, every dab is laid at 37 and the slider reads
// 0 again after; the local replay is faithful the same way; and an older peer's
// replay (no `ang`) lays its dabs unturned, never at this canvas's angle.
'use strict';
const { boot, sleep } = require('../radial-menu/driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }

(async () => {
    const d = await boot();
    try {
        // A fake wire, and a hook that notes the Angle every dab is laid at.
        await d.ev(`(function(){
            window.__sent = [];
            partySocket = { readyState: 1, send: function (s) { window.__sent.push(JSON.parse(s)); }, close: function () {} };
            isMultiplayerEnabled = true; clientId = 'ra-local'; currentRoom = 'RATEST';
            var real = window.applyMultiSplatWith;
            window.__dabAngles = [];
            window.applyMultiSplatWith = function () { window.__dabAngles.push(window.config.BRUSH_ANGLE); return real.apply(this, arguments); };
            window.config.BRUSH_TIP = 1;       // a chisel, so the angle shows
            window.config.BRUSH_ANGLE = 37;
            return 1;
        })()`);

        // Paint a stroke with the left button, then hold Replay (right).
        const y = 450;
        await d.move(600, y);
        await d.down(600, y);
        for (let i = 1; i <= 24; i++) { await d.move(600 + i * 16, y + Math.round(Math.sin(i / 4) * 30), 1); await sleep(20); }
        await d.up(984, y);
        await sleep(400);
        await d.ev('window.__dabAngles.length = 0; window.__sent.length = 0; 1');
        await d.down(800, 300, 'right');
        await sleep(250);
        await d.up(800, 300, 'right');
        await sleep(1200);

        // T1 — what went out.
        const sent = await d.ev('window.__sent.filter(function (m) { return m.type === "stroke" || m.type === "stroke-chunk"; })');
        const events = [].concat.apply([], sent.map(m => m.data.events || []));
        const angs = events.map(e => e.ang);
        check('T1 the replay went out, every event turned by 37', sent.length > 0 && events.length > 4 && angs.every(a => a === 37),
            { messages: sent.length, events: events.length, angles: Array.from(new Set(angs)) });

        // T2 — the local replay is faithful: the slider says 0 now, the dabs say 37.
        const localAngs = await d.ev('Array.from(new Set(window.__dabAngles))');
        check('T2 the local replay lays its dabs at 37 whatever the slider says', localAngs.length === 1 && localAngs[0] === 37, { angles: localAngs, dabs: await d.ev('window.__dabAngles.length') });

        // T3 — the same message, received: the viewer's slider says 0.
        await d.ev('window.config.BRUSH_ANGLE = 0; window.__dabAngles.length = 0; partySocket = null; 1');
        await d.ev(`(function(){
            var sent = ${JSON.stringify(sent)};
            sent.forEach(function (m) {
                if (m.type === 'stroke') window.scheduleStrokeReplay(m.data.events, 'ra-peer', m.data);
                else handleStrokeChunk({ clientId: 'ra-peer', data: m.data });
            });
            return window.__peerReplayCount();
        })()`);
        await sleep(1500);
        const peer = await d.ev('({ angles: Array.from(new Set(window.__dabAngles)), dabs: window.__dabAngles.length, left: window.__peerReplayCount(), slider: window.config.BRUSH_ANGLE })');
        check('T3 a peer lays the replay\'s dabs at 37 while its own slider says 0', peer.dabs > 4 && peer.angles.length === 1 && peer.angles[0] === 37 && peer.left === 0, peer);
        check('T4 the viewer\'s slider still says 0 after', peer.slider === 0, peer);

        // T5 — an older peer sends no `ang`: unturned, never this canvas's angle.
        await d.ev('window.config.BRUSH_ANGLE = 120; window.__dabAngles.length = 0; 1');
        await d.ev(`(function(){
            var evs = ${JSON.stringify(events)}.map(function (e) { var c = Object.assign({}, e); delete c.ang; return c; });
            window.scheduleStrokeReplay(evs, 'ra-old', null);
            return 1;
        })()`);
        await sleep(1500);
        const old = await d.ev('({ angles: Array.from(new Set(window.__dabAngles)), dabs: window.__dabAngles.length, slider: window.config.BRUSH_ANGLE })');
        check('T5 an older peer\'s replay (no ang) lays its dabs unturned, not at this slider\'s 120', old.dabs > 4 && old.angles.length === 1 && old.angles[0] === 0 && old.slider === 120, old);

        // T6 — a wire value out of range is wrapped, not written raw.
        await d.ev('window.__dabAngles.length = 0; 1');
        await d.ev(`(function(){
            var evs = ${JSON.stringify(events.slice(0, 6))}.map(function (e) { var c = Object.assign({}, e); c.ang = -30; return c; });
            window.scheduleStrokeReplay(evs, 'ra-neg', null);
            return 1;
        })()`);
        await sleep(1000);
        const neg = await d.ev('({ angles: Array.from(new Set(window.__dabAngles)), slider: window.config.BRUSH_ANGLE })');
        check('T6 a peer\'s -30 lands as 330, and the slider is untouched', neg.angles.length === 1 && neg.angles[0] === 330 && neg.slider === 120, neg);

        const errs = d.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.text + ' ' + ((e.params.exceptionDetails.exception || {}).description || '')).slice(0, 5);
        check('T7 no page exceptions', errs.length === 0, errs);
    } finally {
        await d.close();
    }
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
