// Desktop probe for "Mouse Picks Up Where It Left Off" (47 + the main-process
// half electron-pen-cursor.js), end to end on the REAL cursor: boots the
// throwaway main (which installs the real module), pops the pen window onto
// another screen, and plays the hand-overs — pen events go into the popup
// through CDP, the "Windows moved the arrow" part is a real SetCursorPos
// through a test-only hook, and every verdict reads the real cursor back.
//
//   node scripts/test/pen-window/cursor-return.js
//
// MOVES YOUR MOUSE CURSOR for ~5 s (restored at the end) and shows the pen
// window fullscreen on the other screen meanwhile. It will not start while
// the mouse is moving, and a hand on the mouse mid-run stops it as
// INTERFERENCE (exit 2) rather than a failure: after each hand-over the
// arrow can only be where the probe left it or where the feature put it,
// anything else is somebody's hand. Needs two screens; Windows only.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const REPO = 'Z:/New folder/Fluid-UI';
const WebSocket = require(REPO + '/node_modules/ws');
const electronPath = require(REPO + '/node_modules/electron');
const PORT = Number(process.env.PENWIN_PORT || 9344);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, ok, info) { checks.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
function getJSON(url) { return new Promise((res, rej) => { http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej); }); }
class Interference extends Error {}
const same = (a, b) => !!(a && b && a.x === b.x && a.y === b.y);

async function connectBrowser() {
    const v = await getJSON('http://127.0.0.1:' + PORT + '/json/version');
    const ws = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
    let id = 0; const pending = new Map();
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.on('message', (raw) => { const msg = JSON.parse(raw); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); } });
    const send = (method, params, sessionId) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); const m = { id: mid, method, params: params || {} }; if (sessionId) m.sessionId = sessionId; ws.send(JSON.stringify(m)); });
    return {
        send, close: () => { try { ws.close(); } catch (_) {} },
        async attach(targetId) {
            const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
            await send('Runtime.enable', {}, sessionId);
            const evalIn = async (expression, opts) => {
                const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: !!(opts && opts.gesture) }, sessionId);
                if (r.exceptionDetails) { const ex = r.exceptionDetails; throw new Error('page exception: ' + (ex.exception && (ex.exception.description || ex.exception.value) || ex.text)); }
                return r.result && r.result.value;
            };
            return { sessionId, eval: evalIn, send: (m, p) => send(m, p, sessionId) };
        }
    };
}

(async () => {
    if (process.platform !== 'win32') { console.log('Windows only — skipped.'); return; }
    const el = spawn(electronPath, ['scripts/test/pen-window/throwaway-main.js', '--enable-logging'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PENWIN_PORT: String(PORT) }) });
    const log = [];
    el.stdout.on('data', (d) => log.push(String(d)));
    el.stderr.on('data', (d) => log.push(String(d)));
    let br = null, main = null, orig = null;
    const ipc = (expr) => main.eval("require('electron').ipcRenderer." + expr);
    const getCursor = () => ipc("invoke('probe-cursor-get')");
    const setCursor = async (p) => {
        await ipc('invoke(\'probe-cursor-set\', ' + p.x + ', ' + p.y + ')');
        const c = await getCursor();
        if (!same(c, p)) throw new Interference('placed the cursor at ' + JSON.stringify(p) + ', read back ' + JSON.stringify(c));
    };
    // After a hand-over the arrow is where the probe left it or where the
    // feature put it. Anything else: a hand on the mouse.
    const landed = async (a, b) => {
        const c = await getCursor();
        if (!same(c, a) && !same(c, b)) throw new Interference('cursor at ' + JSON.stringify(c) + ', expected ' + JSON.stringify(a) + ' or ' + JSON.stringify(b));
        return c;
    };
    const mainState = () => ipc("invoke('pen-cursor-state')");
    const rState = () => main.eval('window.PenWindow.__state().cursorReturn');
    try {
        let portUp = false;
        for (let i = 0; i < 120 && !portUp; i++) { try { await getJSON('http://127.0.0.1:' + PORT + '/json/version'); portUp = true; } catch (_) { await sleep(250); } }
        if (!portUp) throw new Error('debug port never opened; log: ' + log.join('').slice(-2000));
        br = await connectBrowser();
        let mainT = null;
        for (let i = 0; i < 80 && !mainT; i++) {
            const t = (await br.send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page' && /index\.html/.test(x.url));
            if (t.length) mainT = t[0]; else await sleep(250);
        }
        if (!mainT) throw new Error('no main page target');
        main = await br.attach(mainT.targetId);
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
            ready = await main.eval("!!(window.PenWindow && document.getElementById('penWindowBtn') && window.settingsManager)").catch(() => false);
            if (!ready) await sleep(250);
        }
        if (!ready) throw new Error('app never became ready; log: ' + log.join('').slice(-2000));
        await main.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; window.__skipUIFork = true; return 1; })()");

        // Nothing is touched while somebody is using the mouse.
        const a0 = await getCursor();
        for (let i = 0; i < 8; i++) {
            await sleep(250);
            if (!same(await getCursor(), a0)) { console.log('The mouse is moving — hands off it and rerun (this probe moves the real cursor). Nothing was touched.'); process.exitCode = 2; return; }
        }
        orig = a0;
        console.log('your cursor was at', JSON.stringify(orig), '— restored at the end');

        const box = await main.eval("(function(){ var b=document.getElementById('penWindowMouseReturn'); return b ? { checked: b.checked, inSidebar: !!b.closest('#sidebar-right') } : null; })()");
        check('the checkbox exists in the desktop build, on by default', box && box.checked, box);

        const before = (await br.send('Target.getTargets')).targetInfos.map((t) => t.targetId);
        await main.eval("document.getElementById('penWindowBtn').click(); 1", { gesture: true });
        let popT = null;
        for (let i = 0; i < 40 && !popT; i++) {
            const t = (await br.send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page' && before.indexOf(x.targetId) === -1);
            if (t.length) popT = t[0]; else await sleep(100);
        }
        if (!popT) throw new Error('no popup target');
        await sleep(900);
        const pop = await br.attach(popT.targetId);
        const geo = await main.eval("(function(){ var r=require('@electron/remote'); var pen=r.BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); })[0]; var app=r.getCurrentWindow(); var dp=r.screen.getDisplayMatching(pen.getBounds()); var da=r.screen.getDisplayMatching(app.getBounds()); return { pen: r.screen.dipToScreenRect(null, dp.bounds), app: r.screen.dipToScreenRect(null, da.bounds), penLabel: dp.label, appLabel: da.label, same: dp.id === da.id, fs: pen.isFullScreen() }; })()");
        console.log('screens:', JSON.stringify(geo));
        if (geo.same) { console.log('The pen window opened on the app\'s screen (one display?) — nothing to test.'); return; }
        let rs = null;
        for (let i = 0; i < 20; i++) { rs = await rState(); if (rs.available != null) break; await sleep(50); }
        check('cursor return started with the window and the native calls loaded', rs.on && rs.available === true, rs);

        const pb = await pop.eval("(function(){ var b=document.getElementById('box').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()");
        const cx = Math.round(pb[0] + pb[2] * 0.5), cy = Math.round(pb[1] + pb[3] * 0.5);
        const penMove = (dx) => pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + (dx || 0), y: cy, pointerType: 'pen' });
        const mouseMove = (dx) => pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + (dx || 0), y: cy + 3, pointerType: 'mouse' });
        const HOME = { x: geo.app.x + Math.round(geo.app.width * 0.3), y: geo.app.y + Math.round(geo.app.height * 0.4) };
        const HOME2 = { x: geo.app.x + Math.round(geo.app.width * 0.6), y: geo.app.y + Math.round(geo.app.height * 0.55) };
        const ONPEN = { x: geo.pen.x + Math.round(geo.pen.width * 0.5), y: geo.pen.y + Math.round(geo.pen.height * 0.5) };

        // A. Mouse on the app → the pen takes the cursor → the mouse wakes → home.
        await setCursor(HOME); await sleep(150);
        let ms = await mainState();
        await landed(HOME, HOME);
        check('main samples the mouse on the app screen as home (physical px)', same(ms.home, HOME), ms.home);
        await setCursor(ONPEN); await sleep(120);      // Windows moving the arrow to the pen
        ms = await mainState();
        check('a cursor on the pen display is never taken as home', same(ms.home, HOME), ms.home);
        await penMove(0); await sleep(80);
        rs = await rState(); ms = await mainState();
        check('pen on the pen window → the pen owns the cursor, main armed', rs.penOwnsCursor && ms.armed, { r: rs.penOwnsCursor, armed: ms.armed });
        await mouseMove(2); await sleep(80);
        let c = await landed(ONPEN, HOME);
        check('a mouse move inside the pen quiet gap (pen may still be streaming) does not return', same(c, ONPEN) && (await rState()).returns === 0, c);
        await sleep(260);
        await mouseMove(4); await sleep(150);
        c = await landed(HOME, ONPEN); rs = await rState();
        check('the mouse wakes after the pen → the real cursor is back where the mouse left off', same(c, HOME) && rs.returns === 1 && !rs.penOwnsCursor, { cursor: c, home: HOME, last: rs.last });

        // B. A deliberate trip onto the tablet is not bounced back.
        await setCursor(ONPEN); await sleep(150);      // a real mouse move lands on the popup
        await mouseMove(6); await sleep(150);
        c = await landed(ONPEN, HOME); rs = await rState();
        check('the mouse walking onto the tablet on its own stays there', same(c, ONPEN) && rs.returns === 1, { cursor: c, returns: rs.returns });

        // C. Pen, then the mouse gets off the tablet by itself → mouse-away:
        //    a later trip back is not bounced either.
        await penMove(8); await sleep(80);
        check('(pen again owns the cursor)', (await rState()).penOwnsCursor);
        await setCursor(HOME2); await sleep(180);
        await landed(HOME2, HOME2);
        rs = await rState(); ms = await mainState();
        check('cursor seen off the pen display → main disarms and tells the renderer', !rs.penOwnsCursor && !ms.armed && same(ms.home, HOME2), { r: rs.penOwnsCursor, armed: ms.armed, home: ms.home });
        await setCursor(ONPEN); await sleep(300);
        await mouseMove(10); await sleep(150);
        c = await landed(ONPEN, HOME2);
        check('...then walking back onto the tablet is not bounced', same(c, ONPEN) && (await rState()).returns === 1, c);

        // D. Pen out of range (pointerout with nowhere to go) → no quiet gap.
        await setCursor(HOME); await sleep(150);
        await setCursor(ONPEN); await sleep(120);
        await penMove(12); await sleep(40);
        await pop.eval("document.getElementById('stage').dispatchEvent(new PointerEvent('pointerout', { pointerType: 'pen', bubbles: true })); 1");
        await mouseMove(14); await sleep(150);
        c = await landed(HOME, ONPEN); rs = await rState();
        check('pen out of range → the very next mouse move returns (no quiet gap)', same(c, HOME) && rs.returns === 2, { cursor: c, returns: rs.returns, last: rs.last });

        // E. Unticked: main stops, nothing moves; ticked again: back on. Saved.
        await main.eval("(function(){ var b=document.getElementById('penWindowMouseReturn'); b.checked=false; b.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        await sleep(120);
        ms = await mainState(); rs = await rState();
        const savedOff = await main.eval("window.settingsManager.get('display.penWindowMouseReturn', null)");
        check('unticked → main-process half stopped, renderer off, saved false', !ms.running && !rs.on && savedOff === false, { running: ms.running, on: rs.on, savedOff });
        await setCursor(ONPEN); await sleep(120);
        await penMove(16); await sleep(300);
        await mouseMove(18); await sleep(150);
        c = await landed(ONPEN, HOME);
        check('unticked → the mouse starts from the tablet, as before', same(c, ONPEN), c);
        await main.eval("(function(){ var b=document.getElementById('penWindowMouseReturn'); b.checked=true; b.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        await sleep(150);
        ms = await mainState(); rs = await rState();
        const savedOn = await main.eval("window.settingsManager.get('display.penWindowMouseReturn', null)");
        check('ticked again → running, saved true', ms.running && rs.on && savedOn === true, { running: ms.running, on: rs.on, savedOn });

        // F. Close → main stops sampling.
        await main.eval('window.PenWindow.close(); 1');
        await sleep(300);
        ms = await mainState(); rs = await rState();
        check('closing the pen window stops the main-process half', !ms.running && !rs.on, { running: ms.running, on: rs.on });
        const errs = log.join('').split(/\r?\n/).filter((l) => /Uncaught|TypeError|ReferenceError|pen-cursor\]/.test(l)).slice(0, 5);
        check('no uncaught renderer errors / pen-cursor warnings in the log', errs.length === 0, errs);
        console.log(JSON.stringify({ ok: checks.every((k) => k.ok), passed: checks.filter((k) => k.ok).length, total: checks.length, fails: checks.filter((k) => !k.ok).map((k) => k.name) }));
        if (!checks.every((k) => k.ok)) process.exitCode = 1;
    } catch (e) {
        if (e instanceof Interference) {
            console.log('INTERFERENCE — a hand on the mouse mid-run (' + e.message + '). Nothing judged past this point; rerun hands-off.');
            process.exitCode = 2;
        } else {
            console.error('[cursor-return probe] ERROR', e && e.stack || e);
            console.error(log.join('').slice(-3000));
            process.exitCode = 1;
        }
    } finally {
        if (orig && main) { try { await ipc('invoke(\'probe-cursor-set\', ' + orig.x + ', ' + orig.y + ')'); } catch (_) {} }
        if (br) br.close();
        try { el.kill(); } catch (_) {}
        setTimeout(() => process.exit(), 800);
    }
})();
