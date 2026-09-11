// Desktop-build probe: boots the throwaway main (hidden window, real
// index.html, the REAL window-open handler lifted from electron-main.js),
// pops the pen window, checks it is a real BrowserWindow on another display
// (fullscreen), forwards a stroke into it, moves it with Screen ▸, closes.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = 'Z:/New folder/Fluid-UI';
const WebSocket = require(REPO + '/node_modules/ws');
const electronPath = require(REPO + '/node_modules/electron');
const PORT = 9343;
const OUT = process.env.PENWIN_OUT || require('os').tmpdir();   // screenshots land here
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, ok, info) { checks.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
function getJSON(url) { return new Promise((res, rej) => { http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej); }); }

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
    const el = spawn(electronPath, ['scripts/test/pen-window/throwaway-main.js', '--enable-logging'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PENWIN_PORT: String(PORT) }) });
    const log = [];
    el.stdout.on('data', (d) => log.push(String(d)));
    el.stderr.on('data', (d) => log.push(String(d)));
    let br = null;
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
        const main = await br.attach(mainT.targetId);
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
            ready = await main.eval("!!(window.PenWindow && document.getElementById('penWindowBtn') && window.settingsManager)").catch(() => false);
            if (!ready) await sleep(250);
        }
        if (!ready) throw new Error('app never became ready; log: ' + log.join('').slice(-2000));
        await main.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; window.__skipUIFork = true; return 1; })()");
        const displays = await main.eval("require('@electron/remote').screen.getAllDisplays().map(function(d){ return { id: d.id, bounds: d.bounds, touch: d.touchSupport, scale: d.scaleFactor }; })");
        const mine = await main.eval("(function(){ var r=require('@electron/remote'); var d=r.screen.getDisplayMatching(r.getCurrentWindow().getBounds()); return d.id; })()");
        console.log('displays:', JSON.stringify(displays), 'main on', mine);
        const st0 = await main.eval('window.PenWindow.__state()');
        check('module sees Electron', st0.electron, st0);

        // Open (a click: user gesture).
        const before = (await br.send('Target.getTargets')).targetInfos.map((t) => t.targetId);
        const st1 = await main.eval("document.getElementById('penWindowBtn').click(); window.PenWindow.__state()", { gesture: true });
        console.log('after click:', JSON.stringify(st1));
        check('window opened and its BrowserWindow was found through remote', st1.open && st1.childWin, st1);
        let popT = null;
        for (let i = 0; i < 40 && !popT; i++) {
            const t = (await br.send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page' && before.indexOf(x.targetId) === -1);
            if (t.length) popT = t[0]; else await sleep(100);
        }
        check('popup target exists', !!popT, popT && { url: popT.url, title: popT.title });
        await sleep(800);
        const wins = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().map(function(w){ return { id: w.id, title: w.getTitle(), fs: w.isFullScreen(), bounds: w.getBounds(), visible: w.isVisible(), focusable: w.isFocusable(), top: w.isAlwaysOnTop() }; })");
        console.log('windows:', JSON.stringify(wins));
        const pen = wins.filter((w) => /pen input/i.test(w.title))[0];
        const others = displays.filter((d) => d.id !== mine);
        const onOther = pen && others.some((d) => pen.bounds.x >= d.bounds.x - 2 && pen.bounds.x < d.bounds.x + d.bounds.width && pen.bounds.y >= d.bounds.y - 2 && pen.bounds.y < d.bounds.y + d.bounds.height);
        check('pen BrowserWindow exists, visible, fullscreen on another display', pen && pen.visible && pen.fs && onOther, { pen, others: others.map((d) => d.id) });
        const saved = await main.eval("window.settingsManager.get('display.penWindowScreen', null)");
        check('chosen display remembered', saved != null && others.some((d) => d.id === saved), saved);
        check('pen window never takes focus (mouse keeps working in the app) and is topmost while fullscreen', pen && pen.focusable === false && pen.top === true, { focusable: pen && pen.focusable, top: pen && pen.top });

        const pop = await br.attach(popT.targetId);
        const pinfo = await pop.eval("(function(){ var b=document.getElementById('box').getBoundingClientRect(); var m=document.getElementById('mirror'); return { title: document.title, inner:[innerWidth, innerHeight], box:[b.left,b.top,b.width,b.height], hasOpener: !!window.opener, screenBtn: !!document.getElementById('screenBtn'), mirror: { hidden: m.hidden, tag: m.tagName, w: m.width, h: m.height } }; })()");
        // Sidebar screen radios: one per display, the pen window's display checked.
        const radios = await main.eval("(function(){ var h=document.getElementById('penWindowScreens'); var r=[].slice.call(h.querySelectorAll('input[type=radio]')); return r.map(function(i){ return { id: Number(i.value), checked: i.checked, label: i.parentNode.textContent }; }); })()");
        console.log('radios:', JSON.stringify(radios));
        const checkedRadio = radios.filter((r) => r.checked)[0];
        const penOnId = displays.filter((d) => pen && pen.bounds.x === d.bounds.x && pen.bounds.y === d.bounds.y)[0];
        check('one radio per display, the pen window\'s screen checked, the app\'s screen named', radios.length === displays.length && radios.filter((r) => r.checked).length === 1 && checkedRadio && penOnId && checkedRadio.id === penOnId.id && radios.some((r) => /the app is here/.test(r.label)), { checked: checkedRadio, penOn: penOnId && penOnId.id });
        console.log('popup:', JSON.stringify(pinfo));
        check('popup document written, opener reachable, toolbar present', /pen input/i.test(pinfo.title) && pinfo.hasOpener && pinfo.screenBtn, pinfo);

        // A stroke through the popup reaches 05d (the hidden main has no rAF,
        // so judge by the handlers' state, not by paint).
        const bx = pinfo.box[0], by = pinfo.box[1], bw = pinfo.box[2], bh = pinfo.box[3];
        const cx = bx + bw * 0.5, cy = by + bh * 0.5;
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, pointerType: 'pen' });
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
        await sleep(50);
        const mid = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, held: window.PenWindow.__state().heldCount })");
        check('press in the pen window opens a stroke here', mid.down && mid.pid >= 5000 && mid.held === 1, mid);
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + 40, y: cy + 10, buttons: 1, pointerType: 'pen', force: 0.5 });
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 40, y: cy + 10, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(50);
        const up = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, held: window.PenWindow.__state().heldCount })");
        check('release closes it', !up.down && up.pid == null && up.held === 0, up);

        // Fullscreen off/on through the module (remote BrowserWindow).
        await main.eval("window.PenWindow.setFullscreen(false); 1");
        await sleep(500);
        const fs0 = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); }).map(function(w){ return w.isFullScreen(); })");
        await main.eval("window.PenWindow.setFullscreen(true); 1");
        await sleep(500);
        const fs1 = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); }).map(function(w){ return w.isFullScreen(); })");
        check('fullscreen toggles through remote', fs0[0] === false && fs1[0] === true, { fs0, fs1 });

        // Screen ▸ moves it to the next display (and keeps fullscreen).
        if (others.length >= 2) {
            await main.eval("window.PenWindow.cycleScreen(); 1");
            await sleep(900);
            const wins2 = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); }).map(function(w){ return { fs: w.isFullScreen(), bounds: w.getBounds() }; })");
            const p2 = wins2[0];
            const moved = p2 && (p2.bounds.x !== pen.bounds.x || p2.bounds.y !== pen.bounds.y);
            const saved2 = await main.eval("window.settingsManager.get('display.penWindowScreen', null)");
            check('Screen ▸ moved the window to another display, still fullscreen, choice saved', moved && p2.fs && saved2 !== saved, { from: pen.bounds, to: p2 && p2.bounds, saved2 });
        } else {
            console.log('(fewer than two other displays: Screen ▸ move not tested)');
        }

        // Pick another screen with the sidebar radio: the window moves there at once.
        const pickable = radios.filter((r) => !r.checked && !/the app is here/.test(r.label))[0];
        if (pickable) {
            await main.eval("(function(){ var i=document.querySelector('#penWindowScreens input[value=\"" + pickable.id + "\"]'); i.checked=true; i.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
            await sleep(900);
            const w3 = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); }).map(function(w){ return { fs: w.isFullScreen(), bounds: w.getBounds() }; })[0]");
            const target = displays.filter((d) => d.id === pickable.id)[0];
            const nowChecked = await main.eval("(function(){ var i=document.querySelector('#penWindowScreens input:checked'); return i ? Number(i.value) : null; })()");
            check('sidebar radio moves the pen window to that display, fullscreen, radio stays in sync', w3 && target && w3.bounds.x === target.bounds.x && w3.bounds.y === target.bounds.y && w3.fs && nowChecked === pickable.id, { w3, target: target && target.bounds, nowChecked });
        }
        // The app's own screen: a windowed box, never fullscreen over the app.
        await main.eval("(function(){ var i=document.querySelector('#penWindowScreens input[value=\"" + mine + "\"]'); i.checked=true; i.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        await sleep(900);
        const w4 = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); }).map(function(w){ return { fs: w.isFullScreen(), bounds: w.getBounds() }; })[0]");
        const appD = displays.filter((d) => d.id === mine)[0];
        const insideApp = w4 && appD && w4.bounds.x >= appD.bounds.x && w4.bounds.x + w4.bounds.width <= appD.bounds.x + appD.bounds.width + 2 && w4.bounds.width < appD.bounds.width;
        check('picking the app\'s screen makes it a window there (not fullscreen)', insideApp && !w4.fs, { w4, appD: appD && appD.bounds });
        const top4 = await main.eval("require('@electron/remote').BrowserWindow.getAllWindows().filter(function(w){ return /pen input/i.test(w.getTitle()); }).map(function(w){ return w.isAlwaysOnTop(); })[0]");
        check('...and it is no longer topmost over the app', top4 === false, top4);
        const tb = await pop.eval("({ mirrorBtn: !!document.getElementById('mirrorBtn'), select: !!document.querySelector('#bar select') })");
        check('toolbar is buttons only (no select, which needs focus)', tb.mirrorBtn && !tb.select, tb);
        const pshot = await pop.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
        if (pshot) fs.writeFileSync(path.join(OUT, 'penwin-electron-popup.png'), Buffer.from(pshot.data, 'base64'));

        // Close from the module: BrowserWindow gone, state reset.
        await main.eval("window.PenWindow.close(); 1");
        await sleep(600);
        const after = await main.eval("({ wins: require('@electron/remote').BrowserWindow.getAllWindows().length, state: window.PenWindow.__state(), btn: document.getElementById('penWindowBtn').textContent })");
        check('close destroys the BrowserWindow and resets the button', after.wins === 1 && !after.state.open && /Pop Out/.test(after.btn), after);
        const errs = log.join('').split(/\r?\n/).filter((l) => /Uncaught|TypeError|ReferenceError/.test(l)).slice(0, 5);
        check('no uncaught renderer errors in the log', errs.length === 0, errs);
        console.log(JSON.stringify({ ok: checks.every((c) => c.ok), fails: checks.filter((c) => !c.ok).map((c) => c.name) }));
    } catch (e) {
        console.error('[electron probe] ERROR', e && e.stack || e);
        console.error(log.join('').slice(-3000));
        process.exitCode = 1;
    } finally {
        if (br) br.close();
        try { el.kill(); } catch (_) {}
        setTimeout(() => process.exit(), 800);
    }
})();
