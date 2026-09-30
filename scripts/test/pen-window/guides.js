// Pen Input Window guides + cursor, and the stroke locks' confined hand
// (2026-09-29), headless Chrome against a server on http://127.0.0.1:3000/
// (APP_URL= to override).
//
// Gabriel: "many guides don't play nicely with our popout ... a combo select
// with checkboxes to decide whether to display them", "a cursor override
// checkbox which force displays the ghost brush on the popout (right now the
// c button hides the cursor for both)", and "the guides should have small
// indicators to ID where the mouse is, and prevent it from leaving the guide
// area, no matter how far the mouse moves". Checks: the toolbar's Guides menu
// and Always show cursor (both ways, persisted), the Stroke locks and Mandala
// Studio guides drawn over the popout's box, the lock's hand kept inside its
// band (hover, and a pen stroke dragged off the box) and pulled back in by
// the first move back, drifting laps turning the brush one way with no jumps,
// and a press that dismisses the menu painting nothing.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('Z:/New folder/Fluid-UI/node_modules/ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }

function getJSON(url) {
    return new Promise((res, rej) => {
        http.get(url, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
    });
}
async function connectBrowser(port) {
    const v = await getJSON('http://127.0.0.1:' + port + '/json/version');
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


async function boot() {
    const profile = path.join(require('os').tmpdir(), 'fluid-penwin-guides-' + process.pid);
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required', '--disable-popup-blocking',
        'about:blank'
    ], { stdio: 'ignore' });
    for (let i = 0; i < 80; i++) { try { await getJSON('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (_) { await sleep(250); } }
    const br = await connectBrowser(PORT);
    const targets = (await br.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
    const main = await br.attach(targets[0].targetId);
    await main.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');}catch(_){} window.__skipUIFork=true;" });
    await main.send('Page.navigate', { url: URL });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
        ready = await main.eval('!!(window.applyMultiSplatWith && window.clearCanvas && window.density && window.density.read && window.StrokeLock && window.MandalaStudio)').catch(() => false);
        if (!ready) await sleep(250);
    }
    if (!ready) throw new Error('app never became ready');
    for (let i = 0; i < 60; i++) {
        const ok = await main.eval("!!document.getElementById('mixer-strip') && !!document.getElementById('penWindowBtn')").catch(() => false);
        if (ok) break; await sleep(250);
    }
    await main.eval("(function(){ var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='▶' && window.togglePause) window.togglePause(); return 1; })()");
    await sleep(400);
    const done = async () => { try { br.close(); } catch (_) {} try { chrome.kill(); } catch (_) {} await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} };
    return { br, main, done };
}

async function openPopup(env) {
    const { br, main } = env;
    await main.eval("document.getElementById('penWindowBtn').click(); 1", { gesture: true });
    let popTarget = null;
    for (let i = 0; i < 40 && !popTarget; i++) {
        const ts = (await br.send('Target.getTargets')).targetInfos;
        popTarget = ts.find((t) => t.type === 'page' && t.url === 'about:blank' && t.openerId);
        if (!popTarget) await sleep(150);
    }
    if (!popTarget) throw new Error('no popup');
    const pop = await br.attach(popTarget.targetId);
    await sleep(500);
    const box = await pop.eval("(function(){ var b=document.getElementById('box').getBoundingClientRect(); return [b.left,b.top,b.width,b.height]; })()");
    return { pop, box };
}

(async () => {
    const env = await boot();
    const { main } = env;
    try {
        const { pop, box } = await openPopup(env);
        const [bx, by, bw, bh] = box;
        const cx = bx + bw * 0.5, cy = by + bh * 0.5;
        const pen = (x, y, extra) => pop.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved', x, y, pointerType: 'pen' }, extra || {}));
        const mouse = (type, x, y, extra) => pop.send('Input.dispatchMouseEvent', Object.assign({ type, x, y, pointerType: 'mouse', button: 'left', clickCount: 1 }, extra || {}));
        const center = async (sel) => pop.eval("(function(){ var r=document.querySelector(" + JSON.stringify(sel) + ").getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]; })()");
        const click = async (sel) => {
            // reveal the bar first (mouse in the top zone), then a trusted click
            await mouse('mouseMoved', 200, 10, { button: 'none', clickCount: 0 });
            await sleep(250);
            const [x, y] = await center(sel);
            await mouse('mouseMoved', x, y, { button: 'none', clickCount: 0 });
            await mouse('mousePressed', x, y);
            await mouse('mouseReleased', x, y);
            await sleep(120);
        };

        // ── Toolbar ──
        const tb = await pop.eval("({ btn: document.getElementById('guidesBtn').textContent, cb: document.getElementById('cursorBox').checked, menuHidden: document.getElementById('guidesMenu').hidden, rows: document.querySelectorAll('#guidesMenu input[data-guide]').length })");
        check('toolbar: Guides button reads "Guides: all", cursor box ticked, menu built with 2 rows and closed', /Guides: all/.test(tb.btn) && tb.cb && tb.menuHidden && tb.rows === 2, tb);

        // ── Cursor override ──
        const ST = "(function(){ var g=document.getElementById('ghost'), r=document.getElementById('ring'); return { ghost: g.style.display, ring: r.style.display, vis: r.style.visibility || 'visible' }; })()";
        await pen(cx, cy); await sleep(150);
        const setMain = (id, on) => main.eval("(function(){ var c=document.getElementById('" + id + "'); if (c.checked !== " + on + ") { c.checked=" + on + "; c.dispatchEvent(new Event('change',{bubbles:true})); } return c.checked; })()");
        await setMain('cursorToggle', false);
        await pen(cx + 3, cy); await sleep(100);
        const f1 = await pop.eval(ST);
        check('override ON (default): C off in main, popout keeps dot + ghost', f1.ring === 'block' && f1.vis === 'visible' && f1.ghost === 'block', f1);
        await setMain('brushGhostToggle', false);
        await pen(cx + 6, cy); await sleep(100);
        const f2 = await pop.eval(ST);
        check('override ON: Show Brush Ghost off too, popout still forces the ghost', f2.vis === 'visible' && f2.ghost === 'block', f2);
        await setMain('brushGhostToggle', true);
        await click('#cursorBox');
        const cb1 = await pop.eval("document.getElementById('cursorBox').checked");
        const saved1 = await main.eval("window.settingsManager.get('display.penWindowCursor', null)");
        await pen(cx, cy + 3); await sleep(150);
        const f3 = await pop.eval(ST);
        check('override OFF (clicked): C off hides the popout dot and ghost too; choice saved', !cb1 && saved1 === false && f3.vis === 'hidden' && f3.ghost === 'none', { cb1, saved1, f3 });
        await setMain('cursorToggle', true);
        await sleep(100);
        const f4 = await pop.eval(ST);
        check('override OFF: C back on shows them again (pen still, within a tick)', f4.vis === 'visible' && f4.ghost === 'block', f4);
        await setMain('brushGhostToggle', false);
        await sleep(100);
        const f5 = await pop.eval(ST);
        check('override OFF: Show Brush Ghost off leaves the dot only', f5.vis === 'visible' && f5.ghost === 'none', f5);
        await setMain('brushGhostToggle', true);
        await click('#cursorBox');
        const cb2 = await pop.eval("document.getElementById('cursorBox').checked");
        check('override ticked back on', cb2 === true, cb2);
        const focusOk = await pop.eval("document.activeElement === document.body || document.activeElement == null");
        check('checkbox gives focus back (hotkeys keep working)', focusOk, focusOk);

        // ── Stroke lock guide in the popout ──
        await pen(cx + bw * 0.25, cy); await sleep(120);   // 1/4 of the box right of the centre
        await main.eval("window.StrokeLock.engage('distance'); 1");
        await sleep(150);
        const g1 = await pop.eval("(function(){ var s=document.getElementById('guide-strokeLock'); var gs=s.getElementsByTagName('g'); return { disp: s.style.display, vb: s.getAttribute('viewBox'), ellipse: !!gs[0].querySelector('ellipse'), cross: !!gs[0].querySelector('path'), hand: gs[1].style.display, ring: gs[1].querySelectorAll('circle').length }; })()");
        const sl1 = await main.eval("window.StrokeLock.state()");
        check('Keep distance held: popout draws the circle + centre, and the hand ring', g1.disp === 'block' && g1.ellipse && g1.cross && g1.hand !== 'none' && g1.ring === 2, { g1, sl1 });
        const r0 = sl1.distance.r, area = sl1.area;
        // Push the pen far outward: the hand stays within r + area.
        for (let i = 1; i <= 10; i++) { await pen(cx + bw * 0.25 + i * 14, cy + i * 2); await sleep(16); }
        await sleep(80);
        const far = await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); var hx=s.hand.hand.x-c.width/2, hy=s.hand.hand.y-c.height/2, bx=s.hand.brush.x-c.width/2, by=s.hand.brush.y-c.height/2; return { handR: Math.hypot(hx,hy), brushR: Math.hypot(bx,by), r: s.distance.r, area: s.area }; })()");
        check('pen 140 px outward: the hand stops at the edge of the area, the brush stays on the circle', Math.abs(far.handR - (far.r + far.area)) < 0.5 && Math.abs(far.brushR - far.r) < 0.01, far);
        // Coming back in moves the hand at once (no dead travel back from 250 px out).
        await pen(cx + bw * 0.25 + 140 - 10, cy + 20); await sleep(80);
        const back = await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); return Math.hypot(s.hand.hand.x-c.width/2, s.hand.hand.y-c.height/2); })()");
        const k = await main.eval("(function(){ var c=document.getElementById('canvas'); return c.width / c.getBoundingClientRect().width; })()");
        const popK = await main.eval("(function(){ var c=document.getElementById('canvas'); return c.width; })()") / bw;
        check('...and the first move back in pulls the hand in at once', back < far.handR - 5 * popK, { back, was: far.handR, popK });
        // Pen DOWN, dragged off the box's right edge (forwarded while held): same clamp, and back.
        const sx = cx + bw * 0.25 + 130, sy = cy + 20;
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
        for (let i = 1; i <= 12; i++) { await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + i * 30, y: sy, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5 }); await sleep(16); }
        const offBox = await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); return { down: !!window.pointer.down, handR: Math.hypot(s.hand.hand.x-c.width/2, s.hand.hand.y-c.height/2), px: window.pointer.x, py: window.pointer.y, bR: Math.hypot(window.pointer.x-c.width/2, window.pointer.y-c.height/2), r: s.distance.r, area: s.area }; })()");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + 12 * 30 - 10, y: sy, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5 });
        await sleep(40);
        const offBack = await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); return Math.hypot(s.hand.hand.x-c.width/2, s.hand.hand.y-c.height/2); })()");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx + 12 * 30 - 10, y: sy, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(60);
        check('stroke dragged 360 px off the box: paint stays on the circle, hand at the edge, first move back pulls it in', offBox.down && Math.abs(offBox.bR - offBox.r) < 0.01 && Math.abs(offBox.handR - (offBox.r + offBox.area)) < 0.5 && offBack < offBox.handR - 5 * popK, { offBox, offBack });
        // The popout ring sits where the hand is (box px).
        const ringAt = await pop.eval("(function(){ var c=document.querySelectorAll('#guide-strokeLock g')[1].querySelectorAll('circle')[1]; return [+c.getAttribute('cx'), +c.getAttribute('cy')]; })()");
        const handBox = await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); return [s.hand.hand.x / c.width, s.hand.hand.y / c.height]; })()");
        check('popout hand ring sits on the hand (box px)', Math.abs(ringAt[0] - handBox[0] * bw) < 1 && Math.abs(ringAt[1] - handBox[1] * bh) < 1, { ringAt, want: [handBox[0] * bw, handBox[1] * bh] });

        // A lap that drifts off-centre (hand circle radius = guide radius, centre 40 box px off):
        // the brush keeps turning one way with no jumps.
        const rBox = r0 / popK;
        const offX = 40;
        await main.eval("window.StrokeLock.release('distance'); 1");
        await pen(cx + rBox, cy); await sleep(80);
        await main.eval("window.StrokeLock.engage('distance'); 1");
        await sleep(60);
        const angs = [];
        const N = 72;
        for (let i = 1; i <= N * 2; i++) {
            const t = i / N * Math.PI * 2;
            const drift = offX * Math.min(1, i / N);           // the hand's circle slides 40 px over the first lap
            await pen(cx + drift + rBox * Math.cos(t), cy + rBox * Math.sin(t));
            if (i % 2 === 0) angs.push(await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); return Math.atan2(s.hand.brush.y-c.height/2, s.hand.brush.x-c.width/2); })()"));
        }
        let back2 = 0, maxStep = 0, total = 0;
        for (let i = 1; i < angs.length; i++) { let d = angs[i] - angs[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (d < -1e-6) back2++; maxStep = Math.max(maxStep, Math.abs(d)); total += d; }
        check('drifting laps: brush turns one way only, no jumps (max step < 2x the even step), ~2 laps', back2 === 0 && maxStep < 2 * (4 * Math.PI / N) && Math.abs(total / (2 * Math.PI) - 2) < 0.35, { back2, maxStepDeg: +(maxStep * 180 / Math.PI).toFixed(2), evenDeg: 360 / N * 2, laps: +(total / (2 * Math.PI)).toFixed(3) });
        await main.eval("window.StrokeLock.release('distance'); 1");
        await sleep(120);
        const g2 = await pop.eval("document.getElementById('guide-strokeLock').style.display");
        check('lock released: popout stroke-lock guide hides', g2 === 'none', g2);

        // Keep angle: the hand stays within the band across the spoke.
        await pen(cx + bw * 0.2, cy); await sleep(80);
        await main.eval("window.StrokeLock.engage('angle'); 1");
        for (let i = 1; i <= 8; i++) { await pen(cx + bw * 0.2, cy + i * 30); await sleep(16); }
        const ang = await main.eval("(function(){ var s=window.StrokeLock.state(), c=document.getElementById('canvas'); return { across: Math.abs(s.hand.hand.y - c.height/2), area: s.area, brushOff: Math.abs(s.hand.brush.y - c.height/2) }; })()");
        check('Keep angle: pen 240 px across the spoke, hand stops at the band, brush stays on the line', Math.abs(ang.across - ang.area) < 0.5 && ang.brushOff < 1e-6, ang);
        const g3 = await pop.eval("(function(){ var s=document.getElementById('guide-strokeLock'); return { disp: s.style.display, line: !!s.querySelector('line') }; })()");
        check('Keep angle: popout draws the spoke', g3.disp === 'block' && g3.line, g3);
        await main.eval("window.StrokeLock.release('angle'); 1");

        // ── Mandala guide ──
        await main.eval("(function(){ var t=document.getElementById('mandalaToggle'); t.checked=true; t.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        await sleep(600);
        const m1 = await pop.eval("(function(){ var s=document.getElementById('guide-mandala'); return { disp: s.style.display, lines: s.querySelectorAll('line').length, paths: s.querySelectorAll('path').length }; })()");
        check('Mandala Studio on: popout shows its wedge, seams and rings', m1.disp === 'block' && m1.lines >= 6 && m1.paths >= 2, m1);
        // Main Hide Guides does not hide the popout's (its own choice).
        await setMain('mandalaHideGuides', true);
        await sleep(400);
        const m2 = await pop.eval("document.getElementById('guide-mandala').style.display");
        check("main 'Hide Guides' leaves the popout's mandala guide alone", m2 === 'block', m2);
        await setMain('mandalaHideGuides', false);

        // ── Menu ──
        await click('#guidesBtn');
        const mn = await pop.eval("(function(){ var m=document.getElementById('guidesMenu'); var r=m.getBoundingClientRect(); return { hidden: m.hidden, top: r.top, w: r.width, exp: document.getElementById('guidesBtn').getAttribute('aria-expanded') }; })()");
        check('Guides button opens the menu under the toolbar', !mn.hidden && mn.top >= 40 && mn.w > 200 && mn.exp === 'true', mn);
        await sleep(1700);
        const barIdle = await pop.eval("document.getElementById('bar').classList.contains('idle')");
        check('toolbar stays up while the menu is open', !barIdle, barIdle);
        await click('#guidesMenu input[data-guide="mandala"]');
        const m3 = await pop.eval("({ disp: document.getElementById('guide-mandala').style.display, btn: document.getElementById('guidesBtn').textContent, open: !document.getElementById('guidesMenu').hidden })");
        const saved = await main.eval("window.settingsManager.get('display.penWindowGuides', null)");
        check('unticking Mandala Studio hides it here, button reads "Guides: Stroke locks", saved', m3.disp === 'none' && /Guides: Stroke locks/.test(m3.btn) && m3.open && saved && saved.mandala === false && saved.strokeLock === true, { m3, saved });
        // Dismiss by pressing on the surface: no stroke.
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy + 40, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
        await sleep(60);
        const dis = await main.eval("({ down: !!(window.pointer && window.pointer.down), held: window.PenWindow.__state().heldCount, menu: window.PenWindow.__state().guides.menuOpen })");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy + 40, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(60);
        check('a pen press on the surface closes the menu and paints nothing', !dis.down && dis.held === 0 && !dis.menu, dis);
        // The next press paints.
        await pop.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy + 40, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
        await sleep(40);
        const nx = await main.eval("({ down: !!(window.pointer && window.pointer.down), held: window.PenWindow.__state().heldCount })");
        await pop.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy + 40, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
        await sleep(60);
        check('...and the next press paints as usual', nx.down && nx.held === 1, nx);
        // Reopen the popup: choices persist.
        await main.eval("window.PenWindow.close(); 1");
        await sleep(300);
        const again = await openPopup(env);
        const rp = await again.pop.eval("({ btn: document.getElementById('guidesBtn').textContent, mandala: document.querySelector('#guidesMenu input[data-guide=\"mandala\"]').checked, cb: document.getElementById('cursorBox').checked })");
        check('reopened: Guides menu and cursor box come back as left', /Stroke locks/.test(rp.btn) && !rp.mandala && rp.cb, rp);
    } catch (e) { console.error(e); results.push({ name: 'threw', ok: false }); }
    finally {
        await env.done();
        const f = results.filter((r) => !r.ok);
        console.log(JSON.stringify({ ok: !f.length, passed: results.length - f.length, of: results.length, failed: f.map((r) => r.name) }));
        process.exitCode = f.length ? 1 : 0;
    }
})();
