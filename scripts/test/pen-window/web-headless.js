// End-to-end probe for the Pen Input Window in headless Chrome:
// opens the app, pops the pen window (real popup target), drives a pen
// stroke / right-hold / wheel / hotkey INTO THE POPUP via CDP Input, and
// checks the MAIN page painted, replayed, resized... exactly as if the
// input had landed on #canvas.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('Z:/New folder/Fluid-UI/node_modules/ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const OUT = process.env.PENWIN_OUT || require('os').tmpdir();   // screenshots land here
const profile = path.join(require('os').tmpdir(), 'fluid-penwin-profile-' + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { checks: [] };
function check(name, ok, info) { results.checks.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
// Left-drag from 30% to 70% of a slider's track; chordBase = other buttons held.
async function dragSlider(main, r, chordBase) {
    const x0 = r.x - r.w / 2 + r.w * 0.3, x1 = r.x - r.w / 2 + r.w * 0.7, y = r.y;
    await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y, buttons: chordBase, pointerType: 'mouse' });
    await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y, button: 'left', buttons: chordBase | 1, clickCount: 1, pointerType: 'mouse' });
    await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (x0 + x1) / 2, y, button: 'left', buttons: chordBase | 1, pointerType: 'mouse' });
    await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y, button: 'left', buttons: chordBase | 1, pointerType: 'mouse' });
    await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y, button: 'left', buttons: chordBase, clickCount: 1, pointerType: 'mouse' });
    await sleep(80);
}
// Open the sidebar section holding #id (the accordion animates), scroll the
// control into view and return its centre plus what a hit test finds there.
function reveal(main, id) {
    return main.eval("(async function(){ var s=function(ms){return new Promise(function(r){setTimeout(r,ms);});}; var el=document.getElementById('" + id + "'); if(!el) return null; var sec=el.closest('.sidebar-section'); if (sec && sec.classList.contains('collapsed')) { sec.querySelector('.section-header').click(); await s(800); } el.scrollIntoView({block:'center', behavior:'instant'}); var r=el.getBoundingClientRect(); for (var k=0;k<12;k++){ await s(120); var r2=el.getBoundingClientRect(); if (Math.abs(r2.top-r.top)<0.5 && Math.abs(r2.left-r.left)<0.5) { r=r2; break; } r=r2; } var hit=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return { x: r.left+r.width/2, y: r.top+r.height/2, w: r.width, h: r.height, hit: hit ? (hit.id || hit.tagName) : null, checked: el.checked, on: el.checked }; })()");
}

function getJSON(url) {
    return new Promise((res, rej) => {
        http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
    });
}

async function connectBrowser() {
    const v = await getJSON('http://127.0.0.1:' + PORT + '/json/version');
    const ws = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
    let id = 0; const pending = new Map(); const listeners = [];
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); }
        else if (msg.method) listeners.forEach((l) => l(msg));
    });
    const send = (method, params, sessionId) => new Promise((resolve, reject) => {
        const mid = ++id; pending.set(mid, { resolve, reject });
        const m = { id: mid, method, params: params || {} }; if (sessionId) m.sessionId = sessionId;
        ws.send(JSON.stringify(m));
    });
    return {
        send, on: (fn) => listeners.push(fn), close: () => { try { ws.close(); } catch (_) {} },
        async attach(targetId) {
            const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
            await send('Runtime.enable', {}, sessionId);
            await send('Page.enable', {}, sessionId);
            const evalIn = async (expression, opts) => {
                const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: !!(opts && opts.gesture) }, sessionId);
                if (r.exceptionDetails) { const ex = r.exceptionDetails; throw new Error('page exception: ' + (ex.exception && (ex.exception.description || ex.exception.value) || ex.text)); }
                return r.result && r.result.value;
            };
            return { sessionId, eval: evalIn, send: (m, p) => send(m, p, sessionId) };
        }
    };
}

const COVERAGE = "(function(){ var gl=window.gl, d=window.density, w=window.dyeTexWidth, h=window.dyeTexHeight; if(!gl||!d||!w) return null; var buf=new Float32Array(w*h*4); gl.bindFramebuffer(gl.FRAMEBUFFER, d.read.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,buf); gl.bindFramebuffer(gl.FRAMEBUFFER,null); var c=0,n=w*h; for(var i=0;i<n;i++){var j=i*4; if(Math.max(buf[j],buf[j+1],buf[j+2])>0.01)c++;} return c/n; })()";

(async () => {
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required', '--disable-popup-blocking',
        URL
    ], { stdio: 'ignore' });
    let br = null;
    try {
        for (let i = 0; i < 80; i++) { try { await getJSON('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (_) { await sleep(250); } }
        br = await connectBrowser();
        const targets = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
        const main = await br.attach(targets[0].targetId);
        // Wait for the app.
        let ready = false;
        for (let i = 0; i < 240 && !ready; i++) {
            ready = await main.eval('!!(window.applyMultiSplatWith && window.clearCanvas && window.density && window.density.read)').catch(() => false);
            if (!ready) await sleep(250);
        }
        if (!ready) throw new Error('app never became ready');
        await main.eval("window.__skipUIFork = true; (window.UIVisibility && window.UIVisibility.forkPending()) ? (window.UIVisibility.chooseLayout(null), true) : false").catch(() => {});
        for (let i = 0; i < 60; i++) {
            const ok = await main.eval("!!document.getElementById('mixer-strip') && !!document.getElementById('penWindowBtn')").catch(() => false);
            if (ok) break; await sleep(250);
        }
        await main.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='▶' && window.togglePause) window.togglePause(); return 1; })()");
        await sleep(500);
        const info = await main.eval("(function(){ var c=document.getElementById('canvas'); var r=c.getBoundingClientRect(); var b=document.getElementById('penWindowBtn'); var sec=b&&b.closest('.sidebar-section'); return { rect:[r.left,r.top,r.width,r.height], canvas:[c.width,c.height], btnText: b&&b.textContent, section: sec && sec.querySelector('.section-title') && sec.querySelector('.section-title').textContent, mirrorSel: !!document.getElementById('penWindowMirror'), state: window.PenWindow && window.PenWindow.__state(), paused: !!window.isPaused }; })()");
        console.log('app:', JSON.stringify(info));
        check('button lives in the Display section', info.section === 'Display', info.section);
        check('constructed pointer events carry coalesced samples', info.state && info.state.coalescedOK);
        // Give the sim a moment to settle, then baseline.
        await main.eval("window.clearCanvas && window.clearCanvas(); 1").catch(() => {});
        await sleep(400);
        const cov0 = await main.eval(COVERAGE);

        // ── Open the pen window (a click: user gesture) ──
        const before = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').map((t) => t.targetId);
        const opened = await main.eval("document.getElementById('penWindowBtn').click(); window.PenWindow.__state()", { gesture: true });
        console.log('after click:', JSON.stringify(opened));
        let popTarget = null;
        for (let i = 0; i < 40 && !popTarget; i++) {
            const now = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page' && before.indexOf(t.targetId) === -1);
            if (now.length) popTarget = now[0]; else await sleep(100);
        }
        check('popup target appeared', !!popTarget, popTarget && { url: popTarget.url, title: popTarget.title });
        if (!popTarget) throw new Error('no popup');
        const pop = await br.attach(popTarget.targetId);
        await sleep(600);
        const pinfo = await pop.eval("(function(){ var b=document.getElementById('box').getBoundingClientRect(); var m=document.getElementById('mirror'); return { title: document.title, inner:[innerWidth, innerHeight], box:[b.left,b.top,b.width,b.height], mirror:{ w:m.width, h:m.height, hidden:m.hidden, tag:m.tagName }, bar: document.getElementById('bar').className, status: document.getElementById('status').textContent, hasOpener: !!window.opener }; })()");
        console.log('popup:', JSON.stringify(pinfo));
        check('popup titled and same-origin (opener reachable)', /pen input/i.test(pinfo.title) && pinfo.hasOpener, pinfo.title);
        const mst = await main.eval('window.PenWindow.__state().mirror');
        check('mirror is a 2D canvas, sized to the box (≤1280 wide), light mode running', pinfo.mirror.tag === 'CANVAS' && !pinfo.mirror.hidden && pinfo.mirror.w > 0 && pinfo.mirror.w <= 1280 && Math.abs(pinfo.mirror.w / pinfo.mirror.h - pinfo.box[2] / pinfo.box[3]) < 0.02 && mst.running && mst.mode === 'light' && mst.draws > 0, { mirror: pinfo.mirror, mst });
        const screensWeb = await main.eval("(function(){ var h=document.getElementById('penWindowScreens'); return { html: h ? h.innerHTML.slice(0, 200) : null, btn: !!(h && h.querySelector('button')), radios: h ? h.querySelectorAll('input[type=radio]').length : -1 }; })()");
        check('sidebar screen picker offers Find Screens in the browser build', screensWeb.btn && screensWeb.radios === 0, screensWeb);
        const boxAR = pinfo.box[2] / pinfo.box[3], canvasAR = info.rect[2] / info.rect[3];
        check('popup box keeps the canvas aspect', Math.abs(boxAR - canvasAR) < 0.02, { boxAR, canvasAR });
        const mainState1 = await main.eval('window.PenWindow.__state()');
        check('main sees the window open + mirroring', mainState1.open && mainState1.mirror.running, mainState1);

        // ── Hover: ring shows in both windows; leaves when off the box ──
        const bx = pinfo.box[0], by = pinfo.box[1], bw = pinfo.box[2], bh = pinfo.box[3];
        const cx = bx + bw * 0.5, cy = by + bh * 0.5;
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, pointerType: 'pen' });
        await sleep(120);
        const hover = await main.eval("({ mainRing: document.getElementById('brushCursor').style.display, hoverInside: window.PenWindow.__state().hoverInside })");
        const popRing = await pop.eval("({ ring: document.getElementById('ring').style.display, tf: document.getElementById('ring').style.transform, w: document.getElementById('ring').style.width, svg: !!document.querySelector('#ring svg') })");
        check('hover inside the box: main brush ring shows + popup ring follows', hover.mainRing === 'block' && hover.hoverInside && popRing.ring === 'block' && popRing.svg, { hover, popRing });
        // The ring keeps the orientation line: turn the brush, the line turns.
        await main.eval("window.config.BRUSH_ANGLE = 45; var cp=document.getElementById('colorPicker'); if (cp) cp.value='#00ff88'; 1");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + 5, y: cy + 3, pointerType: 'pen' });
        await sleep(60);
        const ang = await pop.eval("(function(){ var g=document.querySelector('#ring .pr-line-group'); var l=document.querySelector('#ring .pr-line'); return { tf: g && g.getAttribute('transform'), shown: g && g.style.display !== 'none', stroke: l && l.getAttribute('stroke'), ring: document.getElementById('ring').style.display }; })()");
        check('popup ring carries the brush angle line (rotate(45)) in the paint colour', ang.tf === 'rotate(45)' && ang.shown && ang.stroke === '#00ff88' && ang.ring === 'block', ang);
        // The pen sits STILL; the angle, the next colour and the brush size
        // change in the main window — the popout ring must follow on its own.
        await main.eval("window.config.BRUSH_ANGLE = 77; var cp=document.getElementById('colorPicker'); if (cp) cp.value='#123456'; var b=document.getElementById('brushSize'); b.value='40'; b.dispatchEvent(new Event('input',{bubbles:true})); 1");
        const sizeBefore = await pop.eval("parseFloat(document.getElementById('ring').style.width)");
        await sleep(150);
        const still = await pop.eval("(function(){ var g=document.querySelector('#ring .pr-line-group'); var l=document.querySelector('#ring .pr-line'); return { tf: g && g.getAttribute('transform'), stroke: l && l.getAttribute('stroke'), w: parseFloat(document.getElementById('ring').style.width) }; })()");
        check('pen still: angle, next colour and size changed in the main window reach the popout ring within a tick', still.tf === 'rotate(77)' && still.stroke === '#123456' && still.w > sizeBefore, { still, sizeBefore });
        await main.eval("window.config.BRUSH_ANGLE = 0; var b=document.getElementById('brushSize'); b.value='11'; b.dispatchEvent(new Event('input',{bubbles:true})); 1");
        // With the main window's Show Cursor OFF (Focus mode does this too), the
        // pen window keeps its ring and hides the OS cursor over the stage.
        await main.eval("(function(){ var c=document.getElementById('cursorToggle'); if (c.checked) { c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); } return 1; })()");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx - 4, y: cy + 2, pointerType: 'pen' });
        await sleep(60);
        const offRing = await pop.eval("({ ring: document.getElementById('ring').style.display, cursor: getComputedStyle(document.getElementById('stage')).cursor, opacity: parseFloat(document.getElementById('ring').style.opacity), line: !!document.querySelector('#ring .pr-line') })");
        const mainOff = await main.eval("({ checked: document.getElementById('cursorToggle').checked, mainRing: document.getElementById('brushCursor').style.display })");
        check('Show Cursor off on the main window: pen window still shows the ring (angle + colour) with no OS cursor', !mainOff.checked && offRing.ring === 'block' && offRing.cursor === 'none' && offRing.opacity >= 0.35 && offRing.line, { offRing, mainOff });
        await main.eval("(function(){ var c=document.getElementById('cursorToggle'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, pointerType: 'pen' });
        await sleep(60);
        // Screenshot the popup while hovering (mirror + ring).
        const shot = await pop.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, 'penwin-popup.png'), Buffer.from(shot.data, 'base64'));
        if (bx > 4 || by > 4) {
            await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.max(1, bx - 3), y: Math.max(1, by - 3), pointerType: 'pen' });
            await sleep(120);
            const off = await main.eval("({ mainRing: document.getElementById('brushCursor').style.display, hoverInside: window.PenWindow.__state().hoverInside })");
            check('hover in the letterbox: main ring hides', off.mainRing === 'none' && !off.hoverInside, off);
        } else {
            console.log('(no letterbox to test leave against)');
        }

        // ── A pen stroke ──
        const pts = []; for (let i = 0; i <= 24; i++) pts.push([bx + bw * (0.25 + 0.5 * i / 24), by + bh * (0.5 + 0.2 * Math.sin(i / 3))]);
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen' });
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.6, tiltX: 12, tiltY: -4 });
        await sleep(30);
        const mid = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, engine: !!(window.BrushEngine && window.BrushEngine.isActive()), held: window.PenWindow.__state().heldCount, x: window.pointer.x, y: window.pointer.y })");
        check('press: main stroke opened with the synthetic pointer id', mid.down && mid.pid >= 5000 && mid.held === 1, mid);
        // Blur guard: a blur arriving mid-stroke must not abort it.
        await main.eval("window.dispatchEvent(new Event('blur')); 1");
        const afterBlur = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId })");
        check('blur during a forwarded stroke is swallowed (stroke survives)', afterBlur.down && afterBlur.pid >= 5000, afterBlur);
        // Dual input: while the pen is held, the MOUSE presses and releases in
        // the main window (on the sidebar, away from the canvas) — the stroke
        // must neither end nor lose its button (05d 2026-09-11 fix).
        const sb = await main.eval("(function(){ var s=document.getElementById('sidebar-right'); var r=s.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + 12 }; })()");
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sb.x, y: sb.y, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sb.x, y: sb.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sb.x + 8, y: sb.y + 6, buttons: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sb.x + 8, y: sb.y + 6, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await sleep(40);
        const dual = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, held: window.PenWindow.__state().heldCount })");
        check('mouse press+release in the main window mid-stroke leaves the pen stroke alone', dual.down && dual.pid >= 5000 && dual.held === 1, dual);
        // The main ring follows the pen only: a mouse crossing the main canvas
        // does not move it, and the canvas keeps the OS cursor for the mouse.
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0] + 1, y: pts[0][1] + 1, buttons: 1, pointerType: 'pen', force: 0.6 });
        await sleep(60);
        const ringBefore = await main.eval("({ tf: document.getElementById('brushCursor').style.transform, owner: window.__brushCursor.owner(), cursor: document.getElementById('canvas').style.cursor, shown: document.getElementById('brushCursor').style.display })");
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.rect[0] + 60, y: info.rect[1] + 60, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: info.rect[0] + 90, y: info.rect[1] + 80, pointerType: 'mouse' });
        await sleep(80);
        const ringAfter = await main.eval("({ tf: document.getElementById('brushCursor').style.transform, owner: window.__brushCursor.owner(), cursor: document.getElementById('canvas').style.cursor, shown: document.getElementById('brushCursor').style.display })");
        check('main ring is owned by the pen: a mouse over the main canvas neither moves it nor loses its own cursor', ringBefore.owner >= 5000 && ringBefore.shown === 'block' && ringAfter.tf === ringBefore.tf && ringAfter.cursor !== 'none' && ringAfter.shown === 'block', { ringBefore, ringAfter });
        // A stray MOUSE press on the popup while the pen is down is dropped.
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx - 40, y: cy - 20, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx - 40, y: cy - 20, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await sleep(40);
        const stray = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, held: window.PenWindow.__state().heldCount })");
        check('a stray mouse click on the popup during a pen stroke is ignored', stray.down && stray.pid >= 5000 && stray.held === 1, stray);
        // A pointercancel that is really a capture hiccup: the pen keeps reporting pressed → stroke survives.
        const penRealId = mid.pid - 5000;
        await pop.eval("document.getElementById('stage').dispatchEvent(new PointerEvent('pointercancel', { pointerId: " + penRealId + ", pointerType: 'pen', bubbles: true })); 1");
        const pend = await main.eval("window.PenWindow.__state().pendingCancels");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0] + 3, y: pts[0][1] + 2, buttons: 1, pointerType: 'pen', force: 0.6 });
        await sleep(400);
        const afterCancel = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, held: window.PenWindow.__state().heldCount, pending: window.PenWindow.__state().pendingCancels })");
        check('a capture-hiccup pointercancel is held back; the next pressed pen report keeps the stroke', pend === 1 && afterCancel.down && afterCancel.held === 1 && afterCancel.pending === 0, { pend, afterCancel });
        for (let i = 1; i < pts.length; i++) {
            await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[i][0], y: pts[i][1], buttons: 1, pointerType: 'pen', force: 0.6 });
            await sleep(16);
        }
        const moving = await main.eval("({ x: window.pointer.x, y: window.pointer.y, moved: window.pointer.moved, down: !!window.pointer.down })");
        const expX = (pts[pts.length - 1][0] - bx) / bw * info.canvas[0];
        check('moves map to canvas pixels (x within 2px of expected)', Math.abs(moving.x - expX) < 2.5, { got: moving.x, expected: expX });
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(60);
        const up = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, held: window.PenWindow.__state().heldCount })");
        check('release: stroke closed cleanly', !up.down && up.pid == null && up.held === 0, up);
        await sleep(500);
        const cov1 = await main.eval(COVERAGE);
        check('paint landed on the main canvas (dye coverage grew)', cov1 > cov0 + 0.002, { before: cov0, after: cov1 });
        // The mirror under the pen shows that paint (sample the mirror canvas).
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, pointerType: 'pen' });
        await sleep(250);
        const mirrorPix = await pop.eval("(function(){ var m=document.getElementById('mirror'); var c=document.createElement('canvas'); c.width=64; c.height=32; var x=c.getContext('2d'); x.drawImage(m,0,0,64,32); var d=x.getImageData(0,0,64,32).data; var lit=0; for(var i=0;i<d.length;i+=4){ if(d[i]+d[i+1]+d[i+2]>60) lit++; } return { lit: lit, of: d.length/4, w: m.width, h: m.height }; })()");
        check('mirror canvas shows the paint', mirrorPix.lit > 0.05 * mirrorPix.of, mirrorPix);
        const mcost = await main.eval('window.PenWindow.__state().mirror');
        check('mirror ran at the active rate while drawing; one blit costs well under a millisecond of main thread', mcost.rate === 12 && mcost.drawMs < 1.0, mcost);
        await sleep(2600);
        const midle = await main.eval('window.PenWindow.__state().mirror');
        check('...and drops to the idle rate when the pen goes quiet', midle.rate === 2, midle);
        const shot2 = await pop.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, 'penwin-popup-painted.png'), Buffer.from(shot2.data, 'base64'));
        // Screen ▸ in a one-screen headless: must not throw, and must say so.
        const scr = await pop.eval("document.getElementById('screenBtn').click(); new Promise(r=>setTimeout(()=>r(document.getElementById('status').textContent), 600))", { gesture: true }).catch((e) => 'THREW ' + e.message);
        check('Screen ▸ button is harmless with one screen', typeof scr === 'string' && !/^THREW/.test(scr), scr);

        // ── Right button = replay hold ──
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'right', buttons: 2, clickCount: 1, pointerType: 'pen' });
        await sleep(30);
        const rh = await main.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive })");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'right', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(30);
        const rh2 = await main.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive })");
        check('right button latches the replay hold and releases it', rh.right && rh.replay && !rh2.right && !rh2.replay, { held: rh, released: rh2 });

        // ── Replay held on the pen window, mouse works the main UI ──
        const cb0 = await reveal(main, 'cursorToggle');
        console.log('cursorToggle at', JSON.stringify(cb0));
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'right', buttons: 2, clickCount: 1, pointerType: 'pen' });
        await sleep(30);
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cb0.x, y: cb0.y, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cb0.x, y: cb0.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cb0.x, y: cb0.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await sleep(60);
        const cb1 = await main.eval("({ checked: document.getElementById('cursorToggle').checked, right: !!isRightMouseDown, replay: !!isReplayActive })");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'right', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(40);
        const cb2 = await main.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive })");
        check('pen holds Replay on the popup while the mouse clicks a checkbox in the app: click lands, hold survives, then releases', cb1.checked !== cb0.checked && cb1.right && cb1.replay && !cb2.right && !cb2.replay, { cb0: cb0.checked, cb1, cb2 });
        // ...and Scatter's Brush light source follows the PEN (the hand) while it
        // holds Replay: barrel held, the pen glides along the top of the box and
        // the origin tracks it there, not the replayed stroke in the middle.
        await main.eval("window.config.GLOW = true; window.config.SCATTER = true; var s=document.getElementById('scatterSource'); s.value='brush'; s.dispatchEvent(new Event('change',{bubbles:true})); 1");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx + bw * 0.08, y: by + bh * 0.9, pointerType: 'pen' });
        await sleep(200);
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx + bw * 0.08, y: by + bh * 0.9, button: 'right', buttons: 2, clickCount: 1, pointerType: 'pen' });
        const sc = [];
        for (let i = 0; i <= 10; i++) {
            await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx + bw * (0.2 + 0.6 * i / 10), y: by + bh * 0.12, button: 'right', buttons: 2, pointerType: 'pen' });
            await sleep(90);
            sc.push(await main.eval("(function(){ var o=window.__scatterOrigin; return o ? { x: +o.x.toFixed(3), y: +o.y.toFixed(3) } : null; })()"));
        }
        const penHold = await main.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive })");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx + bw * 0.8, y: by + bh * 0.12, button: 'right', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(40);
        const scLast = sc[sc.length - 1];
        const scXs = sc.map((v) => v.x);
        const scRising = scXs.every((v, i) => i === 0 || v >= scXs[i - 1] - 0.02);
        check('pen holds Replay on the popup: Scatter (Brush source) lights from the pen, gliding along the top, not from the replayed stroke', penHold.right && penHold.replay && scLast && Math.abs(scLast.x - 0.8) < 0.12 && Math.abs(scLast.y - 0.88) < 0.12 && scRising && sc.slice(4).every((v) => v.y > 0.6), { samples: sc, penHold });
        // ...and drags a slider (the top-bar Brush Size fader) while the pen holds Replay.
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'right', buttons: 2, clickCount: 1, pointerType: 'pen' });
        await sleep(30);
        const bs0 = await reveal(main, 'brushSize');
        await main.eval("document.getElementById('brushSize').value = '5'; document.getElementById('brushSize').dispatchEvent(new Event('input', { bubbles: true })); 1");
        await dragSlider(main, bs0, 0);
        const bs1 = await main.eval("({ v: parseFloat(document.getElementById('brushSize').value), right: !!isRightMouseDown })");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'right', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(40);
        check('pen holds Replay on the popup while the mouse drags the Brush Size fader', bs1.v > 30 && bs1.right, { from: 5, to: bs1.v, right: bs1.right });
        await main.eval("(function(){ var b=document.getElementById('cursorToggle'); b.checked=" + cb0.checked + "; b.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");

        // ── The native chord: hold Replay with the right button on the main
        // canvas, then left-click and drag the UI with the same mouse ──
        const cvx = info.rect[0] + info.rect[2] * 0.5, cvy = info.rect[1] + info.rect[3] * 0.5;
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cvx, y: cvy, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cvx, y: cvy, button: 'right', buttons: 2, clickCount: 1, pointerType: 'mouse' });
        await sleep(30);
        const ch0 = await main.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive, captured: document.getElementById('canvas').hasPointerCapture ? document.getElementById('canvas').hasPointerCapture(1) : null })");
        // Move over the checkbox with the right button still down; chorded left click.
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cb0.x, y: cb0.y, buttons: 2, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cb0.x, y: cb0.y, button: 'left', buttons: 3, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cb0.x, y: cb0.y, button: 'left', buttons: 2, clickCount: 1, pointerType: 'mouse' });
        await sleep(60);
        const ch1 = await main.eval("({ checked: document.getElementById('cursorToggle').checked, right: !!isRightMouseDown, replay: !!isReplayActive, down: !!window.pointer.down })");
        check('native chord: hold Replay (right) on the canvas, left-click a checkbox — the click lands, the hold survives, nothing paints', !ch0.captured && ch0.right && ch1.checked !== cb0.checked && ch1.right && ch1.replay && !ch1.down, { ch0, ch1, was: cb0.checked });
        await main.eval("(function(){ var b=document.getElementById('cursorToggle'); b.checked=" + cb0.checked + "; b.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        // A <select> under a chord: showPicker() is called on it (spied — headless
        // has no visible list), and when the browser refuses it, the click steps
        // to the next option so it still does something.
        // Scatter's panel (and its Source select) only shows with the effect ON,
        // and Scatter lives inside Glow's panel: switch both on through their
        // checkboxes, then find the select.
        await main.eval("(function(){ ['glowToggle','scatterToggle'].forEach(function(id){ var c=document.getElementById(id); if (c && !c.checked) { c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); } }); return 1; })()");
        await sleep(300);
        const ss0 = await reveal(main, 'scatterSource');
        console.log('scatterSource at', JSON.stringify(ss0));
        await main.eval("window.__pick = []; window.__origShowPicker = HTMLSelectElement.prototype.showPicker; HTMLSelectElement.prototype.showPicker = function(){ window.__pick.push(this.id); }; 1");
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ss0.x, y: ss0.y, buttons: 2, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ss0.x, y: ss0.y, button: 'left', buttons: 3, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ss0.x, y: ss0.y, button: 'left', buttons: 2, clickCount: 1, pointerType: 'mouse' });
        await sleep(80);
        const pk = await main.eval("({ picks: window.__pick.slice(), active: document.activeElement && document.activeElement.id, right: !!isRightMouseDown })");
        check('native chord: a left click on the Scatter Source select opens its picker while Replay is held', pk.picks.length === 1 && pk.picks[0] === 'scatterSource' && pk.active === 'scatterSource' && pk.right, pk);
        await main.eval("HTMLSelectElement.prototype.showPicker = function(){ var e=new Error('refused'); e.name='NotAllowedError'; throw e; }; 1");
        const selBefore = await main.eval("({ v: document.getElementById('scatterSource').value, src: window.config.SCATTER_SOURCE })");
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ss0.x, y: ss0.y, button: 'left', buttons: 3, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ss0.x, y: ss0.y, button: 'left', buttons: 2, clickCount: 1, pointerType: 'mouse' });
        await sleep(120);
        const after2 = await main.eval("({ v: document.getElementById('scatterSource').value, src: window.config.SCATTER_SOURCE })");
        check('...and when the picker is refused, the click steps to the next option (and the config follows)', after2.v !== selBefore.v && after2.src === after2.v, { selBefore, after2 });
        await main.eval("HTMLSelectElement.prototype.showPicker = window.__origShowPicker; var s=document.getElementById('scatterSource'); s.value='brush'; s.dispatchEvent(new Event('change',{bubbles:true})); 1");
        // Native <input type=range> sliders under a chord: the strip fader and a sidebar slider.
        await main.eval("document.getElementById('brushSize').value = '5'; document.getElementById('brushSize').dispatchEvent(new Event('input', { bubbles: true })); 1");
        const fd0 = await reveal(main, 'brushSize');
        await dragSlider(main, fd0, 2);
        const fd1 = await main.eval("({ v: parseFloat(document.getElementById('brushSize').value), right: !!isRightMouseDown, captured: document.getElementById('brushSize').hasPointerCapture(1) })");
        check('native chord: the Brush Size fader takes a chorded drag while Replay is held', fd1.v > 30 && fd1.right && !fd1.captured, { from: 5, to: fd1.v, right: fd1.right, captured: fd1.captured });
        // A sidebar slider: Canvas Opacity (Display), which 20 places in the section.
        const cs0 = await reveal(main, 'canvasOpacity');
        await main.eval("document.getElementById('canvasOpacity').value = '10'; document.getElementById('canvasOpacity').dispatchEvent(new Event('input', { bubbles: true })); window.__ev = []; ['pointerdown','pointermove','pointerup','input','change','gotpointercapture'].forEach(function(t){ document.getElementById('canvasOpacity').addEventListener(t, function(e){ window.__ev.push(t + ':' + (e.button!=null?e.button:'') + (e.isTrusted?'':'~') + ' tgt=' + (e.target.id||e.target.tagName)); }); }); 1");
        await dragSlider(main, cs0, 2);
        const cs1 = await main.eval("({ v: parseFloat(document.getElementById('canvasOpacity').value), label: document.getElementById('opacityValue').textContent, right: !!isRightMouseDown, ev: window.__ev.slice(0, 16), hitAt30: (function(){ var e=document.elementFromPoint(" + (cs0.x - cs0.w / 2 + cs0.w * 0.3) + ", " + cs0.y + "); return e ? (e.id || e.tagName + '.' + e.className) : null; })() })");
        check('native chord: a sidebar slider (Canvas Opacity) takes a chorded drag, its readout follows, hold survives', cs1.v > 50 && /%/.test(cs1.label) && cs1.right, { from: 10, to: cs1.v, label: cs1.label, cs0, ev: cs1.ev, hitAt30: cs1.hitAt30 });
        await main.eval("var e=document.getElementById('canvasOpacity'); e.value='100'; e.dispatchEvent(new Event('input',{bubbles:true})); var b=document.getElementById('brushSize'); b.value='11'; b.dispatchEvent(new Event('input',{bubbles:true})); 1");
        // A pointerdown-driven control: the Gravity pad. Switch it on with a
        // chorded click on its checkbox, then drag the pad with a chorded press.
        const gp = await reveal(main, 'pressureConstant');
        console.log('pressureConstant at', JSON.stringify(gp));
        if (!gp.on) {
            await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gp.x, y: gp.y, buttons: 2, pointerType: 'mouse' });
            await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gp.x, y: gp.y, button: 'left', buttons: 3, clickCount: 1, pointerType: 'mouse' });
            await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gp.x, y: gp.y, button: 'left', buttons: 2, clickCount: 1, pointerType: 'mouse' });
            await sleep(80);
        }
        const padR = await reveal(main, 'pressurePad');
        const pad = await main.eval("({ fx: window.config.AMBIENT_FORCE_X, fy: window.config.AMBIENT_FORCE_Y, on: document.getElementById('pressureConstant').checked })");
        Object.assign(pad, { x: padR.x - padR.w / 2, y: padR.y - padR.h / 2, w: padR.w, h: padR.h, hit: padR.hit });
        console.log('pressurePad at', JSON.stringify(pad));
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pad.x + pad.w * 0.5, y: pad.y + pad.h * 0.5, buttons: 2, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pad.x + pad.w * 0.5, y: pad.y + pad.h * 0.5, button: 'left', buttons: 3, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pad.x + pad.w * 0.85, y: pad.y + pad.h * 0.25, buttons: 3, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pad.x + pad.w * 0.85, y: pad.y + pad.h * 0.25, button: 'left', buttons: 2, clickCount: 1, pointerType: 'mouse' });
        await sleep(80);
        const pad2 = await main.eval("({ fx: window.config.AMBIENT_FORCE_X, fy: window.config.AMBIENT_FORCE_Y, right: !!isRightMouseDown, replay: !!isReplayActive })");
        check('native chord: the Gravity pad (pointerdown-driven) takes a chorded drag while Replay is held', pad.on && pad.w > 0 && pad2.fx > 0.5 && pad2.fy < -0.3 && pad2.right && pad2.replay, { pad, pad2 });
        // Let go of Replay over the UI: hold ends, the context menu the release
        // raises is swallowed (recorded by a bubble-phase listener, which runs
        // after 05d's capture-phase preventDefault).
        await main.eval("window.__cm = { fired: false, prevented: null }; document.addEventListener('contextmenu', function (e) { window.__cm = { fired: true, prevented: e.defaultPrevented }; }); 1");
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pad.x + pad.w * 0.85, y: pad.y + pad.h * 0.25, button: 'right', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await sleep(60);
        const ch3 = await main.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive, cm: window.__cm })");
        // And the armed path on its own: arm, then a synthetic contextmenu must be cancelled.
        const armed = await main.eval("(function(){ window.__armReplayContextMenuSwallow(); var t=document.getElementById('pressurePad'); var ok = t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); var again = t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); return { swallowed: ok === false, secondAllowed: again === true }; })()");
        check('releasing Replay over the UI ends the hold and swallows the context menu it raises (once)', !ch3.right && !ch3.replay && (!ch3.cm.fired || ch3.cm.prevented === true) && armed.swallowed && armed.secondAllowed, { ch3, armed });
        // Restore the gravity pad state.
        await main.eval("(function(){ var c=document.getElementById('pressureConstant'); if (c.checked !== " + !!gp.on + ") { c.checked = " + !!gp.on + "; c.dispatchEvent(new Event('change',{bubbles:true})); } return 1; })()");
        // The popup's context menu never opens (contextmenu is suppressed) — no DOM signal in headless; skip.

        // ── Wheel → brush size ──
        const size0 = await main.eval("parseFloat(document.getElementById('brushSize').value)");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -100, pointerType: 'mouse' });
        await sleep(80);
        const size1 = await main.eval("parseFloat(document.getElementById('brushSize').value)");
        check('wheel over the popup changes the brush size here', size1 !== size0, { size0, size1 });

        // ── Hotkey → ] steps the brush ──
        await pop.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ']', code: 'BracketRight', windowsVirtualKeyCode: 221, nativeVirtualKeyCode: 221, text: ']' });
        await pop.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ']', code: 'BracketRight', windowsVirtualKeyCode: 221, nativeVirtualKeyCode: 221 });
        await sleep(80);
        const size2 = await main.eval("parseFloat(document.getElementById('brushSize').value)");
        check('] typed in the popup steps the brush size here', size2 > size1, { size1, size2 });

        // ── Mirror off / on through the sidebar select ──
        await main.eval("var s=document.getElementById('penWindowMirror'); s.value='off'; s.dispatchEvent(new Event('change',{bubbles:true})); 1");
        await sleep(200);
        const off = await pop.eval("({ mirrorHidden: document.getElementById('mirror').hidden, blankShown: !document.getElementById('blank').hidden, sel: document.getElementById('mirrorBtn').textContent })");
        const offMain = await main.eval("window.PenWindow.__state().mirror.running");
        check('mirror Off: blank surface, timer stopped, popup button in sync', off.mirrorHidden && off.blankShown && /Off/.test(off.sel) && !offMain, off);
        await main.eval("var s=document.getElementById('penWindowMirror'); s.value='smooth'; s.dispatchEvent(new Event('change',{bubbles:true})); 1");
        await sleep(600);
        const on = await pop.eval("(function(){ var m=document.getElementById('mirror'); return { hidden: m.hidden, w: m.width, sel: document.getElementById('mirrorBtn').textContent }; })()");
        const onMain = await main.eval('window.PenWindow.__state().mirror');
        const saved = await main.eval("window.settingsManager ? window.settingsManager.get('display.penWindowMirror', null) : 'nosm'");
        check('mirror Smooth: canvas back, 24/4 rates, setting persisted', !on.hidden && on.w > 0 && /Smooth/.test(on.sel) && onMain.running && onMain.activeFps === 24 && String(saved) === 'smooth', { on, onMain, saved });
        // The toolbar button cycles the mode and the sidebar select follows.
        const cyc = await pop.eval("document.getElementById('mirrorBtn').click(); new Promise(r=>setTimeout(()=>r(document.getElementById('mirrorBtn').textContent), 200))", { gesture: true });
        const cycMain = await main.eval("({ sel: document.getElementById('penWindowMirror').value, st: window.PenWindow.__state().mirror })");
        check('toolbar Mirror button cycles Smooth → Off, sidebar select follows', /Off/.test(cyc) && cycMain.sel === 'off' && !cycMain.st.running, { cyc, cycMain });
        await main.eval("var s=document.getElementById('penWindowMirror'); s.value='light'; s.dispatchEvent(new Event('change',{bubbles:true})); 1");
        await sleep(200);

        // ── Fullscreen toggle from the popup toolbar (web path) ──
        const fs1 = await pop.eval("document.getElementById('fsBtn').click(); new Promise(r=>setTimeout(()=>r({ fs: !!document.fullscreenElement, label: document.getElementById('fsBtn').textContent }), 300))", { gesture: true });
        check('Fullscreen button enters fullscreen (Fullscreen API)', fs1.fs && /exit/i.test(fs1.label), fs1);
        const fs2 = await pop.eval("document.getElementById('fsBtn').click(); new Promise(r=>setTimeout(()=>r({ fs: !!document.fullscreenElement, label: document.getElementById('fsBtn').textContent }), 300))", { gesture: true });
        check('...and leaves it', !fs2.fs && !/exit/i.test(fs2.label), fs2);

        // ── Close mid-stroke: the stroke ends gracefully ──
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
        await sleep(30);
        const preClose = await main.eval("({ down: !!window.pointer.down })");
        await main.eval("window.PenWindow.close(); 1");
        await sleep(300);
        const post = await main.eval("({ down: !!window.pointer.down, pid: window.__paintPointerId, state: window.PenWindow.__state(), btn: document.getElementById('penWindowBtn').textContent, ring: document.getElementById('brushCursor').style.display })");
        const gone = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.targetId === popTarget.targetId).length === 0;
        check('close while pressed: stroke released, window gone, button reset, mirror stopped', preClose.down && !post.down && post.pid == null && !post.state.open && gone && /Pop Out/.test(post.btn) && !post.state.mirror.running, { preClose, post, gone });

        const mshot = await main.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, 'penwin-main.png'), Buffer.from(mshot.data, 'base64'));
        const errs = await main.eval("(window.__penwinErrs||[]).length");
        results.ok = results.checks.every((c) => c.ok);
        console.log(JSON.stringify({ ok: results.ok, fails: results.checks.filter((c) => !c.ok).map((c) => c.name) }));
    } catch (e) {
        console.error('[e2e] ERROR', e && e.stack || e);
        process.exitCode = 1;
    } finally {
        if (br) br.close();
        try { chrome.kill(); } catch (_) {}
        setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} process.exit(); }, 500);
    }
})();
