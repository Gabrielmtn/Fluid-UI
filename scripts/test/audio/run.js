// Audio timing and the cue editor (js/22, js/30, js/40, js/40b), headless
// Chrome against the repo's own files:
//   node scripts/test/audio/run.js            (all)
//   node scripts/test/audio/run.js matcher    (one probe)
// Reuses the radial menu's driver (own static server, clean profile per
// boot) with autoplay allowed, so a synthetic WAV plays and the playhead
// moves. Each probe in probes/ builds its own track, so every boot starts
// clean. Exit code 1 if any check failed.
//
// Checks: a lane's cues fire its action on the chart's clock (every cue in
// the window, close to the line); lanes are kept per track by its bytes and
// fire with the chart closed; a cue file opens onto a track; the editor's
// move / add / delete / undo / redo, by API and by pointer, save with the
// track and never into the new-track template; Delete in the editor stays
// out of the recorder; the matcher boxes a snare and finds every snare and
// no kick; Set up this song names and fits three lanes that fire; a lane
// launches Tunnel rings with no scene running, and the Tunnel still works.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot, sleep } = require('../radial-menu/driver');

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
const probe = (name) => fs.readFileSync(path.join(__dirname, 'probes', name + '.js'), 'utf8');

const SUITE = {
    fire(r) {
        const f = r.fired;
        check('fire: every cue in the window fires its action', f.cuesInWindow > 0 && f.firedInWindow === f.cuesInWindow, { cues: f.cuesInWindow, fired: f.firedInWindow });
        const late = f.lagMs.filter((x) => x < -5 || x > 40);
        check('fire: on the chart\'s clock, 0-40 ms after the line', late.length === 0, f.lagMs);
        check('fire: Spin kaleido turns the fold on top of its own spin', f.spinWithAction2s > f.spinBaseline2s + 45, { base: f.spinBaseline2s, withAction: f.spinWithAction2s });
    },
    'per-track'(r) {
        check('per-track: the same bytes under another name are the same track', r.idA && r.idA === r.idAagain && r.idA !== r.idB, { a: r.idA, again: r.idAagain, b: r.idB });
        check('per-track: each track keeps its own lanes', r.aKeepsItsOwn === 'burst/1' && r.bStartsFromA === 'burst', { a: r.aKeepsItsOwn, bStart: r.bStartsFromA });
        check('per-track: cues fire with the chart closed', r.chartClosedArmed && r.firedWithChartClosedIn4s >= 3, r.firedWithChartClosedIn4s);
        check('per-track: Open cues… loads a .swirlcues onto the track', /^spiral nudge 40$/.test(r.afterOpen), r.afterOpen);
    },
    editor(r) {
        check('editor: the Composer is gone, the editor is there', r.editor && r.composerGone && r.canvas && r.canvas.visible, r.canvas);
        check('editor: the live controls fold under Live reactions', r.liveBlock);
        check('editor: a moved cue lands, and its lane is now its own', r.moved.foundAt && r.moved.oldGone && r.moved.edited, r.moved);
        const a = r.addDelete;
        check('editor: add, delete, undo, redo', a.added === a.before + 1 && a.deleted === a.before && a.undone === a.before + 1 && a.redone === a.before, a);
        check('editor: edits save with the track, never into the template', r.saved.recordHasCues && !r.saved.templateHasCues, r.saved);
        check('editor: a pointer drag moves a cue', r.drag.lane1Edited && r.drag.landed, r.drag);
        const k = r.dblclickAndKey;
        check('editor: double-click adds, Delete removes, the recorder never asks', k.afterDbl === k.before + 1 && k.afterDelete === k.before && !k.appConfirmOpen, k);
        check('editor: the cue fires where it was moved to', r.firesAtMoved.fired.some((t) => Math.abs(t - r.firesAtMoved.want) < 0.05), r.firesAtMoved);
        check('editor: a cue placed 25 ms off a hit snaps onto it', r.snap && r.snap.added === 1 && r.snap.landedOnKick, r.snap);
    },
    matcher(r) {
        check('matcher: a box around one snare finds the 16 snares and no kick', r.pointerBox === 16, r.pointerBox);
        check('matcher: texture at 0.6-0.8 is every snare and nothing else', ['0.6', '0.65', '0.7', '0.8'].every((k) => r.texture.sweep[k] === '16/16'), r.texture.sweep);
        check('matcher: Make a lane makes a Shape lane that bursts', r.lane.added && r.lane.method === 'pattern' && r.lane.act === 'burst' && r.rowLabel === 'Shape', { lane: r.lane, row: r.rowLabel });
        check('matcher: the shape lane fires on its matches', r.fired.length > 0 && r.fired.every((o) => Math.abs(o) < 40), r.fired);
    },
    'setup-song'(r) {
        check('setup: Full shows the lanes, their actions and the cue files', r.fullLanes && r.fullLanes.shown && r.fullLanes.rows >= 1 && r.fullLanes.cueFileBtns === 2, r.fullLanes);
        const names = r.setup.lanes.map((l) => l.split(' ')[0]).join(',');
        check('setup: three named lanes, each doing something', names === 'Low,Mid,High' && r.setup.counts.every((c) => c > 0), r.setup);
        check('setup: they fire', (r.in4s.generators.radialBurst || 0) > 0 && (r.in4s.generators.random || 0) > 0 && r.in4s.colourSteps > 0, r.in4s);
    },
    ring(r) {
        check('ring: a lane launches Tunnel rings with no scene running', r.scene === null && r.cueRings.launchedIn3s >= 3 && r.cueRings.ringStampDraws > 0, r.cueRings);
        check('ring: the Tunnel scene still runs its own rings', r.tunnelScene.active === 'tunnel' && r.tunnelScene.ringStampDraws > 0, r.tunnelScene);
    }
};

(async () => {
    const only = process.argv[2];
    for (const name of Object.keys(SUITE)) {
        if (only && only !== name) continue;
        const d = await boot({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
        try {
            await d.ev('(function(){ if (typeof isPaused !== "undefined" && isPaused) togglePause(); if (window.config) window.config.PHOTOSAFE = false; return 1; })()');
            await sleep(600);
            const r = await d.ev(probe(name));
            if (!r) check(name + ': probe returned nothing', false);
            else if (r.error || r.err) check(name + ': probe error', false, r.error || r.err);
            else SUITE[name](r);
        } catch (e) {
            check(name + ': threw', false, e.message);
        } finally {
            await d.close();
        }
    }
    const failed = results.filter((x) => !x.ok).length;
    console.log((results.length - failed) + '/' + results.length + ' pass');
    process.exit(failed ? 1 : 0);
})();
