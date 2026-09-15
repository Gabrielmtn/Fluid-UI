// Unit test for electron-pen-cursor.js (the main-process half of "Mouse
// Picks Up Where It Left Off"): plain Node, a fake cursor and fake
// monitors in place of Win32, polls driven by hand. No Electron, and the
// real cursor is never touched.
//
//   node scripts/test/pen-window/cursor-return-unit.js
'use strict';
const path = require('path');
const { createPenCursor } = require(path.resolve(__dirname, '..', '..', '..', 'electron-pen-cursor.js'));

const checks = [];
function check(name, ok, info) {
    checks.push({ name, ok: !!ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : ''));
}

// Two monitors in physical px: the app's, and a pen display below it
// (the dev desk's layout: the Wacom at 673,1449).
const APP = { h: 11, x: 0, y: 0, w: 2560, hh: 1440 };
const PEN = { h: 22, x: 673, y: 1449, w: 1920, hh: 1080 };
function fakeDesk() {
    const desk = {
        monitors: [APP, PEN],
        cur: { x: 500, y: 400 },
        moves: 0,
        refuseMove: false,
        find(x, y) {
            for (const m of desk.monitors) if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.hh) return m.h;
            return 0;
        },
        api: {
            cursor: () => ({ x: desk.cur.x, y: desk.cur.y }),
            moveCursor: (x, y) => { if (desk.refuseMove) return false; desk.cur = { x, y }; desk.moves++; return true; },
            monitorAt: (x, y) => desk.find(x, y) || desk.monitors[0].h,
            isOnAMonitor: (x, y) => !!desk.find(x, y),
            monitorOf: (win) => (win && !win.isDestroyed()) ? win.mon : 0
        }
    };
    return desk;
}
function fakeWin(mon) { return { mon, destroyed: false, isDestroyed() { return this.destroyed; } }; }
function fakeSender() { return { sent: [], destroyed: false, send(ch) { this.sent.push(ch); }, isDestroyed() { return this.destroyed; } }; }

function rig() {
    const desk = fakeDesk();
    const appWin = fakeWin(APP.h);
    let penWin = fakeWin(PEN.h);
    const sender = fakeSender();
    const pc = createPenCursor({
        api: desk.api, pollMs: 1e9,   // polls by hand
        getMainWindow: () => appWin,
        getPenWindow: () => penWin
    });
    return { desk, appWin, sender, pc, setPen(w) { penWin = w; } };
}
const onPen = { x: PEN.x + 900, y: PEN.y + 500 };
const onApp = { x: 1200, y: 700 };

// 1. The basic hand-over: mouse on the app → pen yanks the cursor → mouse moves → home.
{
    const r = rig();
    r.desk.cur = { x: 500, y: 400 };
    const s = r.pc.start(r.sender);
    check('start: ok with an injected api', s.ok, s);
    check('start: first sample is home (the click that opened the window)', r.pc.state().home && r.pc.state().home.x === 500, r.pc.state().home);
    r.desk.cur = { x: 520, y: 410 }; r.pc.poll();
    check('mouse moving on the app screen keeps updating home', r.pc.state().home.x === 520 && r.pc.state().home.y === 410);
    r.pc.pen();                                 // renderer: a pen took the cursor
    r.desk.cur = { x: onPen.x, y: onPen.y };    // ...and Windows put it on the tablet
    r.pc.poll(); r.pc.poll();
    check('pen positions never become home', r.pc.state().home.x === 520 && r.pc.state().armed, r.pc.state());
    const res = r.pc.returnHome();              // renderer: the mouse woke up on the pen window
    check('return moves the cursor back to where the mouse left off', res.moved && r.desk.cur.x === 520 && r.desk.cur.y === 410 && r.desk.moves === 1, { res, cur: r.desk.cur });
    check('return disarms: a second return does nothing', !r.pc.returnHome().moved && r.desk.moves === 1);
    r.pc.stop();
}

// 2. A deliberate trip onto the tablet is never bounced back.
{
    const r = rig();
    r.pc.start(r.sender);
    r.pc.pen();
    r.desk.cur = { x: onPen.x, y: onPen.y }; r.pc.poll();
    r.desk.cur = { x: onApp.x, y: onApp.y }; r.pc.poll();   // mouse got off the tablet by itself
    check('cursor seen off the pen display while armed → disarm + mouse-away to the renderer', !r.pc.state().armed && r.sender.sent.indexOf('pen-cursor-mouse-away') >= 0, { armed: r.pc.state().armed, sent: r.sender.sent });
    check('...and home is where it went', r.pc.state().home.x === onApp.x);
    r.desk.cur = { x: onPen.x + 5, y: onPen.y }; r.pc.poll();   // then walks onto the tablet on purpose
    const res = r.pc.returnHome();
    check('a return request after that is refused (not armed)', !res.moved && r.desk.moves === 0 && r.desk.cur.x === onPen.x + 5, res);
    check('mouse-away is sent once, not per sample', r.sender.sent.filter((c) => c === 'pen-cursor-mouse-away').length === 1, r.sender.sent);
    r.pc.stop();
}

// 3. Pen window on the app's own screen: pen and mouse share it → inactive.
{
    const r = rig();
    r.setPen(fakeWin(APP.h));
    r.pc.start(r.sender);
    r.pc.pen();
    r.desk.cur = { x: 900, y: 900 }; r.pc.poll();
    check('same screen: flagged, nothing recorded', r.pc.state().sameScreen && r.pc.state().home === null, r.pc.state());
    const res = r.pc.returnHome();
    check('same screen: no return', !res.moved && r.desk.moves === 0, res);
    r.pc.stop();
}

// 4. The arrow is already off the tablet when the request lands (a fast
//    flick): leave it where the mouse put it.
{
    const r = rig();
    r.pc.start(r.sender);
    r.pc.pen();
    r.desk.cur = { x: onPen.x, y: onPen.y }; r.pc.poll();
    r.desk.cur = { x: 1500, y: 1300 };           // no poll in between
    const res = r.pc.returnHome();
    check('cursor already off the pen display → no move', !res.moved && r.desk.moves === 0 && r.desk.cur.x === 1500, res);
    r.pc.stop();
}

// 5. Home on a screen that has since been unplugged.
{
    const r = rig();
    const OTHER = { h: 33, x: 2560, y: 0, w: 1920, hh: 1080 };
    r.desk.monitors.push(OTHER);
    r.desk.cur = { x: 3000, y: 500 };
    r.pc.start(r.sender);
    r.pc.pen();
    r.desk.cur = { x: onPen.x, y: onPen.y }; r.pc.poll();
    r.desk.monitors.pop();                        // OTHER unplugged
    const res = r.pc.returnHome();
    check('home on a vanished screen → no move, home forgotten', !res.moved && r.desk.moves === 0 && r.pc.state().home === null, res);
    r.pc.stop();
}

// 6. Not started / stopped / refused.
{
    const r = rig();
    check('not started: pen() does not arm, return refused', (r.pc.pen(), !r.pc.state().armed) && !r.pc.returnHome().moved);
    r.pc.start(r.sender);
    r.pc.pen();
    r.pc.stop();
    check('stop disarms and refuses', !r.pc.state().armed && !r.pc.state().running && !r.pc.returnHome().moved);
    r.pc.start(r.sender);
    r.pc.pen();
    r.desk.cur = { x: onPen.x, y: onPen.y }; r.pc.poll();
    r.desk.refuseMove = true;
    const res = r.pc.returnHome();
    check('SetCursorPos refusing is reported, not thrown', !res.moved && /refused/.test(res.reason), res);
    r.pc.stop();
}

// 7. Stops on its own ~2 s after the pen window or the renderer is gone.
{
    const r = rig();
    r.pc.start(r.sender);
    r.setPen(null);
    for (let i = 0; i < 59; i++) r.pc.poll();
    check('no pen window for 59 samples: still running (a window being created)', r.pc.state().running);
    r.pc.poll();
    check('...60 samples: stopped itself', !r.pc.state().running);
    const r2 = rig();
    r2.pc.start(r2.sender);
    r2.sender.destroyed = true;
    for (let i = 0; i < 60; i++) r2.pc.poll();
    check('renderer destroyed: stopped itself', !r2.pc.state().running);
    r.pc.stop(); r2.pc.stop();
}

// 8. The renderer's re-arm after mouse-away: the next pen session works again.
{
    const r = rig();
    r.pc.start(r.sender);
    r.desk.cur = { x: 700, y: 650 }; r.pc.poll();
    r.pc.pen();
    r.desk.cur = { x: onPen.x, y: onPen.y }; r.pc.poll();
    r.desk.cur = { x: 710, y: 660 }; r.pc.poll();         // mouse took it back by itself
    r.pc.pen();                                             // pen again
    r.desk.cur = { x: onPen.x + 40, y: onPen.y + 40 }; r.pc.poll();
    const res = r.pc.returnHome();
    check('second session after a mouse-away returns to the newest home', res.moved && r.desk.cur.x === 710 && r.desk.cur.y === 660, { res, cur: r.desk.cur });
    r.pc.stop();
}

const fails = checks.filter((c) => !c.ok).map((c) => c.name);
console.log(JSON.stringify({ ok: fails.length === 0, passed: checks.length - fails.length, total: checks.length, fails }));
process.exitCode = fails.length ? 1 : 0;
