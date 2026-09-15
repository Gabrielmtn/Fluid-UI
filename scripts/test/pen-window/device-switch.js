// Pen ↔ mouse switching and the mirror (2026-09-14 fixes), headless Chrome
// against a server on http://127.0.0.1:3000/ (APP_URL= to override).
//
// Gabriel, on the browser build: "the pen input isn't updating nicely and
// consistently, old dye just stays forever oddly" and "the stylus crashes the
// main app sometimes, all clicking crashes, when we change back and forth
// between stylus and mouse rapidly". Two causes, both measured here:
//   • the mirror was drawn over its own last frame, so wherever #canvas is
//     transparent (Empty Alpha Locked) the old paint stayed on the tablet;
//   • a forwarded press could lose its release (the stray-mouse filter ate a
//     mouse release while the pen was in range; a chorded release ended on the
//     other button) — the main stroke stayed down: Constant flow poured on the
//     spot, the pen was locked out, and the blur safety net was swallowed.
// A/B'd against the pre-fix js/47 + js/05d (served through Fetch
// interception): 14 of the 15 checks fail there — all but "no page
// exceptions"; the old failures were silent state, never a throw.
// DEBUG_SWITCH=1 prints the painted-stroke diagnostics.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('Z:/New folder/Fluid-UI/node_modules/ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const profile = path.join(require('os').tmpdir(), 'fluid-penwin-switch-' + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }

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

const MAIN_STATE = "(function(){ var s=window.PenWindow.__state(); return { down: !!window.pointer.down, pid: window.__paintPointerId, held: s.heldCount, owner: window.__brushCursor && window.__brushCursor.owner(), right: !!isRightMouseDown }; })()";
// Dye (max channel) around a canvas-px point, straight off the density FBO.
const DYE_AT = "(function(px,py){ var gl=window.gl, d=window.density, w=window.dyeTexWidth, h=window.dyeTexHeight, c=document.getElementById('canvas'); var x=Math.round(px/c.width*w), y=Math.round((1-py/c.height)*h); var r=4, buf=new Float32Array((2*r+1)*(2*r+1)*4); gl.bindFramebuffer(gl.FRAMEBUFFER, d.read.fbo); gl.readPixels(x-r,y-r,2*r+1,2*r+1,gl.RGBA,gl.FLOAT,buf); gl.bindFramebuffer(gl.FRAMEBUFFER,null); var s=0; for(var i=0;i<buf.length;i+=4) s+=Math.max(buf[i],buf[i+1],buf[i+2]); return +(s/((2*r+1)*(2*r+1))).toFixed(4); })";
// In the popup: mean brightness of the mirror and one corner pixel.
const MIRROR_STATS = "(function(){ var m=document.getElementById('mirror'); var d=m.getContext('2d').getImageData(0,0,m.width,m.height).data; var s=0, n=m.width*m.height; for (var i=0;i<d.length;i+=4) s+=Math.max(d[i],d[i+1],d[i+2]); return { mean:+(s/n).toFixed(2), corner:[d[0],d[1],d[2]] }; })()";
// In main: the same pixels as the main screen composites them (ground + #canvas).
const SCREEN_STATS = "(function(w,h){ var c=document.getElementById('canvas'); var t=document.createElement('canvas'); t.width=w; t.height=h; var x=t.getContext('2d',{alpha:false}); x.fillStyle=getComputedStyle(document.getElementById('canvas-area')).backgroundColor; x.fillRect(0,0,w,h); x.drawImage(c,0,0,w,h); var d=x.getImageData(0,0,w,h).data; var s=0, n=w*h; for (var i=0;i<d.length;i+=4) s+=Math.max(d[i],d[i+1],d[i+2]); return { mean:+(s/n).toFixed(2), corner:[d[0],d[1],d[2]] }; })";

(async () => {
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required', '--disable-popup-blocking',
        URL
    ], { stdio: 'ignore' });
    let br = null;
    const errors = [];
    try {
        for (let i = 0; i < 80; i++) { try { await getJSON('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (_) { await sleep(250); } }
        br = await connectBrowser();
        br.on((msg) => { if (msg.method === 'Runtime.exceptionThrown') errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description) || msg.params.exceptionDetails.text); });
        const targets = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
        const main = await br.attach(targets[0].targetId);
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
        await sleep(400);
        // Gabriel's brush: Constant flow (a stuck stroke keeps pouring).
        await main.eval("(function(){ config.BRUSH_CONTINUOUS = true; config.BRUSH_DAB_INTERVAL_MS = 4; window.clearCanvas(); return 1; })()");
        await sleep(300);

        const before = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').map((t) => t.targetId);
        await main.eval("document.getElementById('penWindowBtn').click(); 1", { gesture: true });
        let popTarget = null;
        for (let i = 0; i < 40 && !popTarget; i++) {
            const now = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page' && before.indexOf(t.targetId) === -1);
            if (now.length) popTarget = now[0]; else await sleep(100);
        }
        if (!popTarget) throw new Error('no popup');
        const pop = await br.attach(popTarget.targetId);
        await sleep(600);
        const pinfo = await pop.eval("(function(){ var b=document.getElementById('box').getBoundingClientRect(); var m=document.getElementById('mirror'); return { box:[b.left,b.top,b.width,b.height], mw:m.width, mh:m.height }; })()");
        const [bx, by, bw, bh] = pinfo.box;
        const P = (u, v) => ({ x: bx + bw * u, y: by + bh * v });
        const cv = await main.eval("(function(){ var c=document.getElementById('canvas'); return [c.width, c.height]; })()");
        const mouse = (type, p, extra) => pop.send('Input.dispatchMouseEvent', Object.assign({ type, x: p.x, y: p.y, pointerType: 'mouse' }, extra || {}));
        const pen = (type, p, extra) => pop.send('Input.dispatchMouseEvent', Object.assign({ type, x: p.x, y: p.y, pointerType: 'pen' }, extra || {}));
        const screen = () => main.eval(SCREEN_STATS + '(' + pinfo.mw + ',' + pinfo.mh + ')');
        const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

        // ── Mirror: wiped paint leaves the tablet too (Background Transparency 100 = fully clear field) ──
        await main.eval('window.backgroundTransparency = 1; 1');
        await main.eval("(function(){ var b=document.getElementById('brushSize'); b.value='60'; b.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
        const pts = []; for (let i = 0; i <= 30; i++) pts.push(P(0.15 + 0.7 * i / 30, 0.5 + 0.25 * Math.sin(i / 4)));
        await pen('mouseMoved', pts[0]);
        await pen('mousePressed', pts[0], { button: 'left', buttons: 1, clickCount: 1, force: 0.8 });
        for (const p of pts) { await pen('mouseMoved', p, { button: 'left', buttons: 1, force: 0.8 }); await sleep(16); }
        await pen('mouseReleased', pts[pts.length - 1], { button: 'left', buttons: 0, clickCount: 1 });
        await sleep(500);
        const g0 = await pop.eval(MIRROR_STATS);
        if (process.env.DEBUG_SWITCH) console.log('debug painted:', JSON.stringify({ mirror: g0, screen: await screen(), state: await main.eval("({ color: document.getElementById('colorPicker').value, dd: config.DENSITY_DISSIPATION, mirror: window.PenWindow.__state().mirror, cov: (function(){ var gl=window.gl, d=window.density, w=window.dyeTexWidth, h=window.dyeTexHeight; var buf=new Float32Array(w*h*4); gl.bindFramebuffer(gl.FRAMEBUFFER, d.read.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,buf); gl.bindFramebuffer(gl.FRAMEBUFFER,null); var c=0; for(var i=0;i<w*h;i++){ if(Math.max(buf[i*4],buf[i*4+1],buf[i*4+2])>0.01)c++; } return c/(w*h); })() })") }));
        await main.eval('window.clearCanvas(); 1');
        await sleep(400);
        const g1 = await pop.eval(MIRROR_STATS), s1 = await screen();
        check('mirror: paint wiped from the main canvas is gone from the tablet too (not kept under a clear field)', g0.mean > 40 && Math.abs(g1.mean - s1.mean) < 2, { painted: g0.mean, afterClear: g1.mean, screen: s1.mean });
        await main.eval("(function(){ window.backgroundTransparency = 0.8; var b=document.getElementById('brushSize'); b.value='11'; b.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
        // ...and the ground is the one the main screen shows.
        await main.eval("(function(){ var p=document.getElementById('backgroundColorPicker'); p.value='#e8d8b8'; p.dispatchEvent(new Event('input',{bubbles:true})); window.clearCanvas(); return 1; })()");
        await sleep(900);
        const gr = await pop.eval(MIRROR_STATS), sr = await screen();
        check('mirror: the Background Color shows under the paint as the main screen composites it', near(gr.corner, sr.corner, 6) && gr.corner[0] > 150, { mirror: gr.corner, screen: sr.corner });
        await main.eval("(function(){ var p=document.getElementById('backgroundColorPicker'); p.value='#000000'; p.dispatchEvent(new Event('input',{bubbles:true})); window.clearCanvas(); return 1; })()");
        // Fast-fading dye from here on: a spot that is not being fed empties
        // within a second, so a stroke stuck down shows as dye that stays.
        await main.eval('config.DENSITY_DISSIPATION = 0.2; 1');

        // ── A mouse press forwarded, the pen comes into range, the mouse lets go ──
        await sleep(700);   // pen quiet: the mouse press is forwarded
        const A = P(0.3, 0.4);
        await mouse('mouseMoved', A);
        await mouse('mousePressed', A, { button: 'left', buttons: 1, clickCount: 1 });
        await sleep(60);
        const a1 = await main.eval(MAIN_STATE);
        await pen('mouseMoved', P(0.7, 0.6));
        await sleep(30);
        await mouse('mouseReleased', A, { button: 'left', buttons: 0, clickCount: 1 });
        await sleep(80);
        const a2 = await main.eval(MAIN_STATE);
        check('the release of a forwarded mouse press gets through with the pen in range', a1.down && a1.pid === 5001 && !a2.down && a2.pid == null && a2.held === 0, { pressed: a1, released: a2 });
        await sleep(700);
        const ax = 0.3 * cv[0], ay = 0.4 * cv[1];
        const d1 = await main.eval(DYE_AT + '(' + ax + ',' + ay + ')');
        await sleep(1500);
        const d2 = await main.eval(DYE_AT + '(' + ax + ',' + ay + ')');
        check('...so nothing keeps pouring on that spot', !(d2 > 0.05 && d2 >= d1 * 0.9), { d1, d2 });
        await main.eval("window.dispatchEvent(new Event('blur')); 1");
        const a3 = await main.eval(MAIN_STATE);
        check('...and a main-window blur with no live forwarded press is not swallowed', !a3.down && a3.held === 0, a3);
        await sleep(700);
        const B0 = P(0.55, 0.75), B1 = P(0.8, 0.75);
        await pen('mouseMoved', B0);
        await pen('mousePressed', B0, { button: 'left', buttons: 1, clickCount: 1, force: 0.7 });
        for (let i = 1; i <= 10; i++) { await pen('mouseMoved', { x: B0.x + (B1.x - B0.x) * i / 10, y: B0.y }, { button: 'left', buttons: 1, force: 0.7 }); await sleep(16); }
        const b1 = await main.eval(MAIN_STATE);
        await pen('mouseReleased', B1, { button: 'left', buttons: 0, clickCount: 1 });
        await sleep(80);
        const b2 = await main.eval(MAIN_STATE);
        check('...and the pen paints afterwards and lets go', b1.down && b1.pid >= 5002 && !b2.down && b2.held === 0, { during: b1, after: b2 });

        // ── Chorded release on the pen window: tip down, barrel, tip up, barrel up ──
        await sleep(700);
        const C0 = P(0.3, 0.3), C1 = P(0.45, 0.3);
        await pen('mouseMoved', C0);
        await pen('mousePressed', C0, { button: 'left', buttons: 1, clickCount: 1, force: 0.6 });
        await pen('mouseMoved', C1, { button: 'left', buttons: 1, force: 0.6 });
        await sleep(30);
        const c1 = await main.eval(MAIN_STATE);
        await pen('mousePressed', C1, { button: 'right', buttons: 3, clickCount: 1 });
        await sleep(30);
        await pen('mouseReleased', C1, { button: 'left', buttons: 2, clickCount: 1 });
        await sleep(40);
        const c2 = await main.eval(MAIN_STATE);
        await pen('mouseReleased', C1, { button: 'right', buttons: 0, clickCount: 1 });
        await sleep(60);
        const c3 = await main.eval(MAIN_STATE);
        check('chorded release on the pen window: the tip lift ends the stroke, nothing stays latched', c1.down && !c2.down && c2.held === 0 && !c3.down && !c3.right && c3.held === 0, { c1, c2, c3 });

        // ── The ring follows whichever device moved last ──
        await sleep(700);
        await mouse('mouseMoved', P(0.2, 0.7));
        await mouse('mouseMoved', P(0.22, 0.7));
        await sleep(60);
        const r1 = await main.eval(MAIN_STATE);
        await pen('mouseMoved', P(0.7, 0.5));
        await pen('mouseMoved', P(0.72, 0.52));
        await sleep(80);
        const r2 = await main.eval(MAIN_STATE);
        const ringX = await main.eval("(function(){ var t=document.getElementById('brushCursor').style.transform; var m=/translate\\(([-0-9.]+)px/.exec(t); var r=document.getElementById('canvas').getBoundingClientRect(); return m ? (parseFloat(m[1]) - r.left) / r.width : null; })()");
        check('ring hand-over: the mouse hovered the pen window first, then the pen — the main ring follows the pen', r1.owner === 5001 && r2.owner >= 5002 && ringX != null && Math.abs(ringX - 0.72) < 0.03, { r1: r1.owner, r2: r2.owner, ringX });

        // ── The first input after an idle stretch redraws the mirror at once ──
        await sleep(2700);
        const w0 = await main.eval('window.PenWindow.__state().mirror');
        await pen('mouseMoved', P(0.5, 0.5));
        await sleep(25);
        const w1 = await main.eval('window.PenWindow.__state().mirror');
        check('idle → active: the first pen report redraws at once at the active rate', w0.rate === 2 && w1.rate === 12 && w1.draws > w0.draws, { w0: [w0.rate, w0.draws], w1: [w1.rate, w1.draws] });

        // ── One mouse: a real press in the main window lets go of a forwarded mouse press ──
        await sleep(700);
        const M0 = P(0.6, 0.8);
        await mouse('mouseMoved', M0);
        await mouse('mousePressed', M0, { button: 'left', buttons: 1, clickCount: 1 });
        await sleep(40);
        const o1 = await main.eval(MAIN_STATE);
        const sb = await main.eval("(function(){ var s=document.getElementById('sidebar-right'); var r=s.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + 12 }; })()");
        await main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sb.x, y: sb.y, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sb.x, y: sb.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sb.x, y: sb.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await sleep(40);
        const o2 = await main.eval(MAIN_STATE);
        await mouse('mouseReleased', M0, { button: 'left', buttons: 0, clickCount: 1 });
        await sleep(40);
        const o3 = await main.eval(MAIN_STATE);
        check('one mouse: a forwarded mouse press is let go when the mouse presses in the main window', o1.down && o1.pid === 5001 && !o2.down && o2.held === 0 && !o3.down && o3.held === 0, { o1, o2, o3 });

        // ── A report under a new pen id lets go of the press held under the old one ──
        await pop.eval("(function(){ var s=document.getElementById('stage'); var b=document.getElementById('box').getBoundingClientRect(); var x=b.left+b.width*0.4, y=b.top+b.height*0.4; s.dispatchEvent(new PointerEvent('pointermove',{pointerId:71,pointerType:'pen',clientX:x,clientY:y,bubbles:true})); s.dispatchEvent(new PointerEvent('pointerdown',{pointerId:71,pointerType:'pen',button:0,buttons:1,pressure:0.5,clientX:x,clientY:y,bubbles:true,cancelable:true})); return 1; })()");
        await sleep(40);
        const p1 = await main.eval(MAIN_STATE);
        await pop.eval("(function(){ var s=document.getElementById('stage'); var b=document.getElementById('box').getBoundingClientRect(); s.dispatchEvent(new PointerEvent('pointermove',{pointerId:72,pointerType:'pen',buttons:0,clientX:b.left+b.width*0.5,clientY:b.top+b.height*0.5,bubbles:true})); return 1; })()");
        await sleep(40);
        const p2 = await main.eval(MAIN_STATE);
        check('stale pen id: a report under a new pen id lets go of the press held under the old one', p1.down && p1.pid === 5071 && !p2.down && p2.held === 0, { p1, p2 });

        // ── 40 rounds of rapid alternation on the pen window ──
        let stuck = null;
        for (let r = 0; r < 40 && !stuck; r++) {
            const q = P(0.2 + 0.6 * ((r * 37) % 100) / 100, 0.2 + 0.6 * ((r * 53) % 100) / 100);
            if (r % 2 === 0) {
                await pen('mouseMoved', q);
                await pen('mousePressed', q, { button: 'left', buttons: 1, clickCount: 1, force: 0.5 });
                await pen('mouseMoved', { x: q.x + 12, y: q.y + 6 }, { button: 'left', buttons: 1, force: 0.5 });
                await sleep(r % 4 === 0 ? 5 : 40);
                await mouse('mousePressed', q, { button: 'left', buttons: 1, clickCount: 1 });
                await pen('mouseReleased', { x: q.x + 12, y: q.y + 6 }, { button: 'left', buttons: 0, clickCount: 1 });
                await sleep(r % 3 === 0 ? 10 : 700);
                await mouse('mouseReleased', q, { button: 'left', buttons: 0, clickCount: 1 });
            } else {
                await sleep(650);
                await mouse('mouseMoved', q);
                await mouse('mousePressed', q, { button: 'left', buttons: 1, clickCount: 1 });
                await mouse('mouseMoved', { x: q.x + 8, y: q.y }, { button: 'left', buttons: 1 });
                await pen('mouseMoved', { x: q.x - 30, y: q.y - 20 });
                await sleep(r % 3 === 0 ? 5 : 60);
                await mouse('mouseReleased', { x: q.x + 8, y: q.y }, { button: 'left', buttons: 0, clickCount: 1 });
            }
            await sleep(60);
            const st = await main.eval(MAIN_STATE);
            if (st.down || st.held) {
                await sleep(500);
                const st2 = await main.eval(MAIN_STATE);
                if (st2.down || st2.held) stuck = { round: r, state: st2 };
            }
        }
        check('40 rounds of pen/mouse alternation on the pen window leave no stroke stuck down', !stuck, stuck || 'clean');
        await main.eval('window.PenWindow.close(); 1');
        await sleep(300);

        // ── The same chord on the MAIN canvas, no pen window: mouse, then pen ──
        const rc = await main.eval("(function(){ var r=document.getElementById('canvas').getBoundingClientRect(); return [r.left + r.width*0.4, r.top + r.height*0.5]; })()");
        for (const type of ['mouse', 'pen']) {
            const ev = (p) => main.send('Input.dispatchMouseEvent', Object.assign({ x: rc[0] + 30, y: rc[1], pointerType: type }, p));
            await ev({ type: 'mouseMoved', x: rc[0] });
            await ev({ type: 'mousePressed', x: rc[0], button: 'left', buttons: 1, clickCount: 1 });
            await ev({ type: 'mouseMoved', button: 'left', buttons: 1 });
            const n1 = await main.eval(MAIN_STATE);
            await ev({ type: 'mousePressed', button: 'right', buttons: 3, clickCount: 1 });
            await ev({ type: 'mouseReleased', button: 'left', buttons: 2, clickCount: 1 });
            const n2 = await main.eval(MAIN_STATE);
            await ev({ type: 'mouseReleased', button: 'right', buttons: 0, clickCount: 1 });
            await ev({ type: 'mouseMoved', x: rc[0] + 200, y: rc[1] + 80 });
            await sleep(60);
            const n3 = await main.eval(MAIN_STATE);
            check('native chord (' + type + '): the ' + (type === 'pen' ? 'tip' : 'left') + ' lift ends the stroke; nothing follows the next hover', n1.down && !n2.down && !n3.down && !n3.right, { n1, n2, n3 });
            await sleep(300);
        }

        check('no page exceptions', errors.length === 0, errors.slice(0, 5));
    } catch (e) {
        console.error('[device-switch] ERROR', e && e.stack || e);
        process.exitCode = 1;
    } finally {
        const bad = results.filter((r) => !r.ok).length;
        console.log(JSON.stringify({ ok: !bad && results.length > 0, passed: results.length - bad, of: results.length }));
        if (bad) process.exitCode = 1;
        try { br && br.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} process.exit(); }, 500);
    }
})();
