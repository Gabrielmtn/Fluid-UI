// End-to-end: a phone as the computer's MOUSE (2026-09-17).
// Four headless Chromes against a LOCAL relay: A is the app from this
// working tree, B an emulated iPhone that opens A's mouse link the way a
// scanned QR does, C a second canvas that shares a room with A, and D a
// second phone that takes the mouse over. The checks read what landed on
// the canvases (the dye textures), not just what crossed the wire.
//
//   npx wrangler dev --port 8787            (the relay; reads public/, never builds it)
//   node scripts/test/mp/mp-phone-mouse.js
//
// Env: MP_HOST (default 127.0.0.1:8787), CHROME (path), SHOTS=<dir> saves
// screenshots. APP_URL=https://swirltogether.com/ drives the DEPLOYED pages
// instead of this tree (the relay then defaults to that site's own). ~60 s.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, waitReady } = require('../cdp.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || '';
const RELAY = process.env.MP_HOST || (APP_URL ? new URL(APP_URL).host : '127.0.0.1:8787');
const SHOTS = process.env.SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
let fails = 0, passes = 0;
function check(ok, msg, extra) {
    if (ok) passes++; else fails++;
    log((ok ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ── static server on the repo root ──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
function serve() {
    return new Promise((res) => {
        const srv = http.createServer((req, resp) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const file = path.join(REPO, p);
            if (!file.startsWith(REPO)) { resp.writeHead(403); return resp.end(); }
            fs.readFile(file, (err, buf) => {
                if (err) { resp.writeHead(404); return resp.end(); }
                resp.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
                    'Cache-Control': 'no-store' });
                resp.end(buf);
            });
        });
        srv.listen(0, '127.0.0.1', () => res(srv));
    });
}
function portUp(port) {
    return new Promise((res) => {
        http.get('http://127.0.0.1:' + port + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false));
    });
}

async function chrome(port, name, size) {
    const profile = path.join(os.tmpdir(), 'fluid-phone-mouse-' + name + '-' + process.pid);
    const proc = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
        '--window-size=' + size, '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', 'about:blank'
    ], { stdio: 'ignore' });
    for (let i = 0; i < 80 && !(await portUp(port)); i++) await sleep(250);
    const page = await connect(port);
    await page.send('Page.enable', {});
    return { proc, page, profile, name };
}

const PREP = "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');" +
    "localStorage.setItem('fluidMultiplayerHost','" + RELAY + "');}catch(_){} window.__skipUIFork=true;";

// Desktop page kit: dye readback, peer paint counted by sender, the phone's
// synthetic presses counted, and a local stroke for scale.
const KIT = String.raw`(function(){
  function dye(){
    var f=density.read,w=f.width,h=f.height,px=new Float32Array(w*h*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    var m=0,sx=0,sy=0,mr=0,mg=0,mb=0;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=(y*w+x)*4,v=Math.max(px[i],px[i+1],px[i+2]);
      if(v>0.002){m+=v;sx+=x*v;sy+=(h-1-y)*v;mr+=px[i];mg+=px[i+1];mb+=px[i+2];}}
    return {mass:m,cx:m?sx/m/w:null,cy:m?sy/m/h:null,rgb:[mr,mg,mb]};
  }
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  var peer={}; var q=window.enqueueRemoteSplat;
  window.enqueueRemoteSplat=function(d){ try{ var k=d&&d.clientId; if(k){ peer[k]=(peer[k]||0)+1; } }catch(_){} return q.apply(this,arguments); };
  var phonePresses={down:0,up:0,moves:0};
  var cv=document.getElementById('canvas');
  cv.addEventListener('pointerdown',function(e){ if(e.pointerId===7001) phonePresses.down++; },true);
  cv.addEventListener('pointermove',function(e){ if(e.pointerId===7001) phonePresses.moves++; },true);
  window.addEventListener('pointerup',function(e){ if(e.pointerId===7001) phonePresses.up++; },true);
  function stroke(u0,v0,u1,v1,steps,ms){
    return new Promise(function(done){
      var c=document.getElementById('canvas'), r=c.getBoundingClientRect(), i=0;
      var ev=function(t,u,v,b){ c.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,composed:true,clientX:r.left+u*r.width,clientY:r.top+v*r.height,pointerId:77,pointerType:'mouse',button:t==='pointermove'?-1:0,buttons:b,isPrimary:true,pressure:b?0.5:0})); };
      ev('pointerdown',u0,v0,1);
      var tick=setInterval(function(){ i++; var t=i/steps; ev('pointermove',u0+(u1-u0)*t,v0+(v1-v0)*t,1);
        if(i>=steps){ clearInterval(tick); ev('pointerup',u1,v1,0); done(1); } }, ms/steps);
    });
  }
  window.__e2e={dye:dye,errs:errs,peer:peer,phonePresses:phonePresses,stroke:stroke};
  return 'kit ok';
})()`;

async function until(page, expr, ms = 6000, every = 150) {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) {
        v = await page.eval(expr).catch(() => undefined);
        if (v) return v;
        await sleep(every);
    }
    return v;
}

async function shot(page, file) {
    if (!SHOTS) return;
    try {
        const r = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(SHOTS, { recursive: true });
        fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64'));
        log('shot', file);
    } catch (e) { log('shot failed', file, e.message); }
}

async function bootDesktop(X, url) {
    const a = X.page;
    await a.send('Page.addScriptToEvaluateOnNewDocument', { source: PREP });
    await a.send('Page.navigate', { url });
    await waitReady(a, { timeoutMs: 90000 });
    const ready = await until(a, "!!(window.__scriptsReady && window.PhonePads && window.PhoneMouse && typeof showConnectedUI==='function' && document.getElementById('mixer-strip') && document.getElementById('phonePadBtn'))", 30000);
    if (!ready) throw new Error(X.name + ': page never finished loading');
    await a.eval("(function(){var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    return a.eval(KIT);
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UPRIGHT = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } };
const PHONE_KIT = "window.__sent={}; window.__drop=false; (function(){var s=WebSocket.prototype.send; WebSocket.prototype.send=function(m){ if(window.__drop) return; try{var t=JSON.parse(m).type; window.__sent[t]=(window.__sent[t]||0)+1;}catch(_){} return s.apply(this,arguments);};})();" +
    "window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});";

async function bootPhone(X, id) {
    const b = X.page;
    await b.send('Emulation.setDeviceMetricsOverride', UPRIGHT);
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' });
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PREP + "try{localStorage.setItem('swirlPadId','" + id + "');}catch(_){}" + PHONE_KIT });
}

// A touch stroke across a phone's pad, in pad fractions. `hold` keeps the
// finger down (no touchEnd) — the caller lifts it.
async function touchStroke(b, from, to, steps = 18, ms = 360, hold = false) {
    const r = await b.eval("(function(){var r=document.getElementById('pad').getBoundingClientRect(); return {l:r.left,t:r.top,w:r.width,h:r.height};})()");
    const pt = (u, v) => ({ x: r.l + u * r.w, y: r.t + v * r.h, id: 1, radiusX: 10, radiusY: 10, force: 1 });
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(from[0], from[1])] });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await sleep(ms / steps);
        await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t)] });
    }
    if (!hold) await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function lift(b) { await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }

async function tap(b, sel) {
    const r = await b.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return null; var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
    if (!r) throw new Error('no element ' + sel);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 2 }] });
    await sleep(40);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(120);
}

const MOUSE = "(function(){var s=SwirlPad.state(); return {kind:s.kind, phase:s.phase, code:s.code, active:s.mouse.active, replaced:s.mouse.replaced, computer:s.mouse.computer, info:s.mouse.info, pad:s.pad," +
    " main:document.getElementById('chipMain').textContent, sub:document.getElementById('chipSub').textContent," +
    " veil:document.getElementById('veil').hidden ? '' : document.getElementById('veilText').textContent};})()";
const DIALOG = "(function(){var m=document.getElementById('phonePadModal'); if(!m||!m.classList.contains('show')) return null; return {" +
    " mouse: m.querySelector('#phonePadWayMouse').getAttribute('aria-pressed')==='true'," +
    " qr: !!m.querySelector('#phonePadQr svg'), code: m.querySelector('#phonePadCode').textContent," +
    " status: m.querySelector('#phonePadStatus').textContent, note: m.querySelector('#phonePadNote').hidden ? '' : m.querySelector('#phonePadNote').textContent," +
    " body: !m.querySelector('#phonePadBody').hidden, stop: !m.querySelector('#phonePadStop').hidden};})()";
// The door in the room panel. "Shown" is judged only as far as the panel
// itself, so a collapsed sidebar section never reads as the panel hiding its
// own door.
const DOOR = "(function(){ function shown(sel){ var e = document.querySelector(sel); if (!e) return 'missing'; var n = e;" +
    " while (n && n.id !== 'multiArtistPanel') { if (n.hidden) return 'hidden'; if (getComputedStyle(n).display === 'none') return 'display:none'; n = n.parentElement; }" +
    " return n ? 'shown' : 'detached'; } var b = document.getElementById('phonePadRoomBtn');" +
    " return { room: shown('#phonePadRoomBtn'), invite: shown('#roomDisplay'), parent: b && b.parentElement ? b.parentElement.id : null, text: b ? b.textContent : null }; })()";

(async () => {
    const srv = await serve();
    const url = APP_URL || ('http://127.0.0.1:' + srv.address().port + '/');
    log('static server', url, 'relay', RELAY);
    const all = [];
    try {
        const [A, B, C, D] = await Promise.all([
            chrome(9381, 'A', '1280,860'), chrome(9382, 'B', '500,900'),
            chrome(9383, 'C', '1100,760'), chrome(9384, 'D', '500,900')
        ]);
        all.push(A, B, C, D);
        const a = A.page, b = B.page, c = C.page, d = D.page;
        log('A', await bootDesktop(A, url));

        // ── The door: As your mouse, by default, with no room ────────
        await a.eval("setActiveBrushColorMode('fixed', {color: '#ffffff'}); 1");
        await a.eval("window.__clip = 0; if (navigator.clipboard) navigator.clipboard.writeText = function(){ window.__clip++; return Promise.resolve(); }; 1");
        await a.eval("document.getElementById('phonePadBtn').click(); 1");
        const dlg = await until(a, "(function(){var d=" + DIALOG + "; return d && /Waiting for your phone/.test(d.status) ? d : null;})()", 10000);
        check(!!dlg && dlg.mouse, 'the door opens "As your mouse" first', dlg);
        const code = await a.eval('PhoneMouse.code()');
        check(/^[A-Z2-9]{8}$/.test(code || '') && !!dlg && dlg.qr && dlg.code === code.slice(0, 4) + ' ' + code.slice(4),
            'with a QR and an 8-character code in two groups', { code, shown: dlg && dlg.code });
        check(await a.eval('!currentRoom && !isMultiplayerEnabled'), 'and no room: the mouse needs none');
        check((await a.eval('window.__clip')) === 0, 'nothing is copied to the clipboard');
        const linkUrl = await a.eval('PhoneMouse.url()');
        check(linkUrl === 'https://swirltogether.com/phone/#' + code, 'from localhost the QR points at the public phone page', linkUrl);
        await shot(a, 'mouse-dialog-waiting.png');

        // Waiting for a stranger: the panel has swapped, so the door has to
        // be in the room panel already — and the artist way, with no room to
        // offer, must not answer the wait by starting a room of our own.
        await a.eval('showMatchmaking(); 1');
        const waitDoor = await a.eval(DOOR);
        check(waitDoor.room === 'shown', 'while the lobby is finding a stranger the door is in the panel', waitDoor);
        await a.eval("document.getElementById('phonePadWayArtist').click(); 1");
        const waitDlg = await until(a, "(function(){var d=" + DIALOG + "; return d && !d.mouse ? d : null;})()", 5000);
        const madeRoom = await a.eval('!!currentRoom');
        check(!!waitDlg && !waitDlg.body && /waiting for a stranger/i.test(waitDlg.note) && !madeRoom,
            'and "As an artist" says why instead of starting a room behind the search', { note: waitDlg && waitDlg.note, room: madeRoom });
        await a.eval("document.getElementById('phonePadWayMouse').click(); showDisconnectedUI(); 1");
        await until(a, "(function(){var d=" + DIALOG + "; return d && d.mouse;})()", 3000);

        // ── B: an iPhone opens the link ─────────────────────────────
        await bootPhone(B, 'PMOUSEB1');
        await b.send('Page.navigate', { url: url + '#' + code });
        const landed = await until(b, "location.pathname.endsWith('/phone/') && !!window.SwirlPad && location.pathname + location.hash", 15000);
        check(landed === '/phone/#' + code, 'the phone is sent to the phone page with the code', landed);
        const bm = await until(b, "(function(){var m=" + MOUSE + "; return m.active && m.computer ? m : null;})()", 10000);
        check(!!bm && bm.kind === 'mouse' && bm.phase === 'open', 'the phone connects as the computer\'s mouse', bm && { kind: bm.kind, phase: bm.phase });
        check(!!bm && bm.main === 'You’re the mouse' && !bm.veil, 'and says so, with nothing in the way', bm && { main: bm.main, veil: bm.veil });
        const cvs = await a.eval("({w:document.getElementById('canvas').width,h:document.getElementById('canvas').height})");
        check(!!bm && near(bm.info.w, cvs.w, 3) && near(bm.info.h, cvs.h, 3) && near(bm.pad.w / bm.pad.h, cvs.w / cvs.h, 0.02),
            'the pad has the computer\'s canvas shape', bm && { info: [bm.info.w, bm.info.h], pad: bm.pad, canvas: cvs });
        check(!!bm && bm.info.color === '#ffffff', 'and knows the colour the computer paints', bm && bm.info.color);
        const aSees = await until(a, "PhoneMouse.hasPhone() && /Your phone is your mouse/.test(document.getElementById('phonePadStatus').textContent)", 5000);
        check(!!aSees, 'the computer\'s dialog says the phone is its mouse');
        const aToast = await a.eval("(document.getElementById('mpTurnToast')||{}).textContent || ''");
        check(/now your mouse/.test(aToast), 'and says it once, out loud', aToast);
        check(/connected/.test(await a.eval("document.getElementById('phonePadBtn').textContent")), 'the door shows the phone is connected');
        const menu = await b.eval("({head: document.getElementById('menuHead').textContent, leave: document.getElementById('leaveBtn').textContent, pass: !document.getElementById('passBtn').hidden})");
        check(/Your computer’s mouse/.test(menu.head) && menu.head.indexOf(code.slice(0, 4) + ' ' + code.slice(4)) >= 0 && menu.leave === 'Disconnect' && !menu.pass,
            'the phone\'s menu names the computer link, and offers Disconnect', menu);
        check(await a.eval('!currentRoom'), 'still no room on the computer');
        await shot(a, 'mouse-dialog-connected.png');
        await shot(b, 'mouse-phone-pad.png');
        await a.eval('PhonePads.close(); 1');

        // ── A phone stroke is the computer's own stroke ─────────────
        await a.eval("(function(){var s=document.getElementById('densityDissipation'); window.__dd=s.value; s.value=1; s.dispatchEvent(new Event('input',{bubbles:true})); clearCanvas(); return 1;})()");
        await sleep(500);
        const before = await a.eval('__e2e.dye()');
        let tStroke = Date.now();
        await touchStroke(b, [0.25, 0.5], [0.75, 0.5]);
        const phoneMs = Date.now() - tStroke;
        await sleep(1500);
        const after = await a.eval('__e2e.dye()');
        const pp = await a.eval('__e2e.phonePresses');
        check(pp.down === 1 && pp.up === 1 && pp.moves >= 10, 'the phone\'s touch plays in as one press, its moves, and one lift', pp);
        check(after.mass > before.mass + 5, 'and lands as dye on the computer', { before: +before.mass.toFixed(1), after: +after.mass.toFixed(1) });
        const phoneMass = after.mass - before.mass;
        await a.eval('clearCanvas(); 1');
        await sleep(400);
        const b2 = await a.eval('__e2e.dye()');
        await a.eval('__e2e.stroke(0.25, 0.5, 0.75, 0.5, 36, ' + phoneMs + ')');
        await sleep(1500);
        const a2 = await a.eval('__e2e.dye()');
        const localMass = a2.mass - b2.mass;
        const ratio = localMass > 0 ? phoneMass / localMass : 0;
        check(ratio > 0.8 && ratio < 1.25, 'as much dye as the same stroke with the mouse', { phone: +phoneMass.toFixed(1), local: +localMass.toFixed(1), ratio: +ratio.toFixed(2), ms: phoneMs });
        check(after.cx !== null && a2.cx !== null && near(after.cx, a2.cx, 0.05) && near(after.cy, a2.cy, 0.05),
            'in the same place', { phone: [+after.cx.toFixed(3), +after.cy.toFixed(3)], local: [+a2.cx.toFixed(3), +a2.cy.toFixed(3)] });

        // The computer's settings, not the phone's: a red brush paints red,
        // and the phone's colour dot follows.
        await a.eval("setActiveBrushColorMode('fixed', {color: '#ff0000'}); clearCanvas(); 1");
        const red = await until(b, "SwirlPad.state().mouse.info && SwirlPad.state().mouse.info.color === '#ff0000' && getComputedStyle(document.getElementById('meDot')).backgroundColor", 5000);
        check(red === 'rgb(255, 0, 0)', 'the phone\'s dot follows the computer\'s colour', red);
        await sleep(300);
        await touchStroke(b, [0.3, 0.4], [0.7, 0.4], 12, 240);
        await sleep(1200);
        const rd = await a.eval('__e2e.dye()');
        check(rd.rgb[0] > 5 && rd.rgb[1] < rd.rgb[0] * 0.05 && rd.rgb[2] < rd.rgb[0] * 0.05, 'and the phone paints red with it', rd.rgb.map((v) => +v.toFixed(1)));
        // A bigger brush on the computer makes a bigger phone stroke.
        const size0 = await a.eval("document.getElementById('brushSize').value");
        const massAt = async (size) => {
            await a.eval("(function(){var s=document.getElementById('brushSize'); s.value=" + size + "; s.dispatchEvent(new Event('input',{bubbles:true})); clearCanvas(); return 1;})()");
            await sleep(500);
            const x0 = await a.eval('__e2e.dye()');
            await touchStroke(b, [0.3, 0.6], [0.7, 0.6], 12, 240);
            await sleep(1200);
            return (await a.eval('__e2e.dye()')).mass - x0.mass;
        };
        const small = await massAt(4), big = await massAt(30);
        check(big > small * 2, 'the computer\'s brush size decides the stroke', { small: +small.toFixed(1), big: +big.toFixed(1) });
        await a.eval("(function(){var s=document.getElementById('brushSize'); s.value=" + JSON.stringify(size0) + "; s.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()");
        await a.eval("setActiveBrushColorMode('fixed', {color: '#ffffff'}); 1");

        // A finger held still keeps the stroke down; a phone that goes
        // silent mid-stroke is let go of.
        await touchStroke(b, [0.2, 0.3], [0.3, 0.3], 4, 80, true);
        await sleep(2600);
        check(await a.eval('window.__paintPointerId === 7001 && pointer.down'), 'a finger held still keeps the computer\'s stroke down');
        await b.eval('window.__drop = true; 1');
        const let_go = await until(a, '!pointer.down && window.__paintPointerId == null', 4000);
        check(!!let_go, 'a phone gone silent mid-stroke is let go of');
        await lift(b);
        await b.eval('window.__drop = false; 1');
        await sleep(300);

        // ── In a room: the phone paints as the computer ─────────────
        const room = await a.eval("(function(){ var c = generateRoomCode(); connectToRoom(c); return c; })()");
        await until(a, "isMultiplayerEnabled && clientId && myRole === 'host'", 10000);
        log('C', await bootDesktop(C, url + '#' + room));
        const cIn = await until(c, "isMultiplayerEnabled && currentRoom === '" + room + "' && clientId", 15000);
        check(!!cIn, 'a second canvas joins the computer\'s room');
        const aId = await a.eval('clientId');
        await until(a, 'connectedClients === 2', 5000);
        const people = await until(b, "(function(){var m=" + MOUSE + "; return m.info && m.info.people === 2 ? m.sub : null;})()", 5000);
        check(people === '2 in the room', 'the phone says how many are in the computer\'s room', people);

        // ── The door from inside a room, in every kind of room ───────
        const inRoom = await a.eval(DOOR);
        check(inRoom.room === 'shown' && inRoom.parent === 'mpConnected', 'in a room the door is a row of the panel, not part of the invite block', inRoom);
        check(/your mouse/.test(inRoom.text), 'and says the phone already has the mouse', inRoom.text);
        // A stranger pairing hides the invite block outright (06e
        // updateConnectedView), and the wait for a stranger has no room at
        // all: the way in has to outlive both.
        const strangerDoor = await a.eval("(function(){ window.__realStranger = isStrangerRoom; isStrangerRoom = function(){ return true; };" +
            " updateConnectedView(); var d = " + DOOR + "; isStrangerRoom = window.__realStranger; updateConnectedView(); return d; })()");
        check(strangerDoor.room === 'shown' && strangerDoor.invite !== 'shown', 'a stranger swirl hides the invite block and keeps the door', strangerDoor);
        const waitingDoor = await a.eval("(function(){ showMatchmaking(); var d = " + DOOR + "; showConnectedUI(); return d; })()");
        check(waitingDoor.room === 'shown', 'and it is there while the lobby is still finding a stranger', waitingDoor);
        await a.eval("document.getElementById('phonePadRoomBtn').click(); 1");
        const roomDlg = await until(a, "(function(){var d=" + DIALOG + "; return d ? d : null;})()", 5000);
        check(!!roomDlg && roomDlg.mouse && /your mouse/.test(roomDlg.status), 'the door in a room opens the same dialog, on "As your mouse"', roomDlg);
        await a.eval('PhonePads.close(); 1');
        check(await a.eval('PhoneMouse.hasPhone()'), 'and closing it leaves the phone where it was');
        await c.eval("(function(){var s=document.getElementById('densityDissipation'); s.value=1; s.dispatchEvent(new Event('input',{bubbles:true})); clearCanvas(); return 1;})()");
        await sleep(500);
        const c0 = await c.eval('__e2e.dye()');
        const fromA0 = await c.eval('__e2e.peer[' + JSON.stringify(aId) + '] || 0');
        await touchStroke(b, [0.25, 0.5], [0.75, 0.5]);
        await sleep(1800);
        const c1 = await c.eval('__e2e.dye()');
        const fromA1 = await c.eval('__e2e.peer[' + JSON.stringify(aId) + '] || 0');
        check(fromA1 > fromA0 && c1.mass > c0.mass + 5, 'the other canvas gets the stroke from the computer', { msgs: fromA1 - fromA0, before: +c0.mass.toFixed(1), after: +c1.mass.toFixed(1) });
        const others = await c.eval("Object.keys(__e2e.peer).filter(function(k){ return k !== " + JSON.stringify(aId) + "; })");
        check(others.length === 0, 'and from nobody else: the phone is not in the room', others);
        check(await a.eval('connectedClients === 2 && PhonePads.count() === 0'), 'the room counts two canvases and no phone');
        const labels = await c.eval("Array.prototype.map.call(document.querySelectorAll('.remote-cursor-label'), function(e){ return e.textContent; })");
        check(!labels.some((t) => t.indexOf('📱') === 0), 'no phone cursor on the other canvas', labels);

        // ── Take turns: the computer's turn is the phone's ──────────
        await a.eval('toggleTurns(); 1');
        await until(c, 'turnsOn && turnHolderId', 5000);
        const tMine = await until(b, "(function(){var m=" + MOUSE + "; return m.info && m.info.turn && m.info.turn.mine ? m : null;})()", 5000);
        check(!!tMine && /Your turn/.test(tMine.main) && tMine.info.can, 'with turns on, the phone shows the computer\'s turn', tMine && tMine.main);
        check(await b.eval("(function(){var p=document.getElementById('passBtn'); return !p.hidden && !p.classList.contains('is-idle');})()"), 'and a Pass button');
        await tap(b, '#passBtn');
        const cHas = await until(c, 'turnHolderId === clientId', 5000);
        check(!!cHas, 'Pass on the phone passes the computer\'s turn');
        const tOther = await until(b, "(function(){var m=" + MOUSE + "; return m.info && !m.info.can ? m : null;})()", 5000);
        check(!!tOther && /’s turn/.test(tOther.main) && /turn/.test(tOther.veil), 'the phone shows whose turn it is instead', tOther && { main: tOther.main, veil: tOther.veil });
        const sent0 = await b.eval("window.__sent.mouse||0");
        // (Dye mass drifts while the last stroke still moves — advection is not
        // conservative — so the proof is what was sent, not the mass.)
        const cm0 = await c.eval('__e2e.peer[' + JSON.stringify(aId) + '] || 0');
        const pdOut = await a.eval('__e2e.phonePresses.down');
        await touchStroke(b, [0.3, 0.3], [0.6, 0.3], 8, 160);
        await sleep(600);
        check((await b.eval("window.__sent.mouse||0")) === sent0, 'out of turn the phone sends nothing');
        const blocked = await b.eval("document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent");
        check(/turn/.test(blocked), 'and says why', blocked);
        const cm1 = await c.eval('__e2e.peer[' + JSON.stringify(aId) + '] || 0');
        check(cm1 === cm0 && (await a.eval('__e2e.phonePresses.down')) === pdOut, 'and the computer neither presses nor paints', { msgs: cm1 - cm0 });
        await c.eval('passTurn(); 1');
        await until(b, "(function(){var m=" + MOUSE + "; return m.info && m.info.can;})()", 5000);
        await a.eval('toggleTurns(); 1');
        await until(b, "(function(){var m=" + MOUSE + "; return m.info && !m.info.turn;})()", 5000);

        // Call and return: the computer passes itself once the phone's swirl lands.
        await a.eval('toggleCallReturn(); 1');
        await until(b, "(function(){var m=" + MOUSE + "; return m.info && m.info.turn && m.info.turn.call && m.info.turn.mine;})()", 5000);
        await touchStroke(b, [0.4, 0.4], [0.6, 0.45], 10, 200);
        const called = await until(c, 'turnHolderId === clientId', 6000);
        check(!!called, 'call and return: one phone swirl, and the computer passes the brush');
        await c.eval('passTurn(); 1');
        await until(a, 'turnHolderId === clientId', 5000);
        await a.eval('toggleCallReturn(); 1');
        await until(b, "(function(){var m=" + MOUSE + "; return m.info && !m.info.turn;})()", 5000);

        // ── Clear from the phone ─────────────────────────────────────
        await touchStroke(b, [0.2, 0.2], [0.8, 0.8], 12, 240);
        await sleep(1200);
        const dirtyA = await a.eval('__e2e.dye()'), dirtyC = await c.eval('__e2e.dye()');
        await tap(b, '#moreBtn');
        await tap(b, '#clearBtn');
        const ask = await b.eval("document.getElementById('confirmSheet').hidden ? '' : document.getElementById('confirmText').textContent");
        check(/your computer/.test(ask) && /room/.test(ask), 'Clear asks first, and says the room clears too', ask);
        await tap(b, '#confirmYes');
        await sleep(800);
        const cleanA = await a.eval('__e2e.dye()'), cleanC = await c.eval('__e2e.dye()');
        check(dirtyA.mass > 5 && cleanA.mass < dirtyA.mass * 0.05 && cleanC.mass < Math.max(1, dirtyC.mass * 0.05),
            'Clear on the phone clears the computer, and the room with it',
            { a: [+dirtyA.mass.toFixed(1), +cleanA.mass.toFixed(1)], c: [+dirtyC.mass.toFixed(1), +cleanC.mass.toFixed(1)] });

        // ── A second phone takes over ────────────────────────────────
        await bootPhone(D, 'PMOUSED2');
        await d.send('Page.navigate', { url: url + 'phone/#' + code });
        const dm = await until(d, "(function(){var m=" + MOUSE + "; return m.active ? m : null;})()", 10000);
        check(!!dm, 'a second phone with the code takes the mouse');
        const bOut = await until(b, "(function(){var m=" + MOUSE + "; return m.replaced ? m : null;})()", 5000);
        check(!!bOut && /Another phone/.test(bOut.veil) && /Another phone/.test(bOut.main), 'the first phone says another has it', bOut && { main: bOut.main, veil: bOut.veil });
        const useBtn = await b.eval("Array.prototype.map.call(document.querySelectorAll('#veilActions button'), function(x){ return x.textContent; })");
        check(useBtn.indexOf('Use this phone') >= 0, 'and offers to take it back', useBtn);
        const sentB = await b.eval("window.__sent.mouse||0");
        await touchStroke(b, [0.3, 0.7], [0.6, 0.7], 6, 120);
        await sleep(300);
        check((await b.eval("window.__sent.mouse||0")) === sentB, 'meanwhile its touches send nothing');
        const pd0 = await a.eval('__e2e.phonePresses.down');
        await touchStroke(d, [0.3, 0.7], [0.6, 0.7], 8, 160);
        await sleep(600);
        check((await a.eval('__e2e.phonePresses.down')) === pd0 + 1, 'the second phone paints');
        await shot(b, 'mouse-phone-replaced.png');
        await b.eval("(function(){var x=Array.prototype.find.call(document.querySelectorAll('#veilActions button'), function(e){ return e.textContent==='Use this phone'; }); if (x) x.click(); return !!x;})()");
        const bBack = await until(b, "(function(){var m=" + MOUSE + "; return m.active && !m.replaced;})()", 5000);
        const dOut = await until(d, "(function(){var m=" + MOUSE + "; return m.replaced;})()", 5000);
        check(!!bBack && !!dOut, 'Use this phone takes it back, and the second phone steps aside');
        await tap(d, '#moreBtn');
        await tap(d, '#leaveBtn');
        await sleep(500);
        check(await until(b, "(function(){var m=" + MOUSE + "; return m.active && m.computer;})()", 3000), 'the first phone keeps the mouse when the second leaves');

        // ── The phone leaves and comes back ─────────────────────────
        await tap(b, '#moreBtn');
        await tap(b, '#leaveBtn');
        const land = await b.eval("({landing: !document.getElementById('landing').hidden, hash: location.hash, rejoin: !document.getElementById('rejoinBtn').hidden, text: document.getElementById('rejoinText').textContent, way: SwirlPad.state().way," +
            " mouse: document.getElementById('wayMouse').getAttribute('aria-pressed'), step2: document.getElementById('step2').textContent})");
        check(land.landing && land.hash === '' && land.rejoin && land.text === 'Reconnect to your computer', 'Disconnect returns to the start, offering to reconnect', land);
        check(land.mouse === 'true' && /As your mouse/.test(land.step2), 'the start page keeps "Be your computer\'s mouse" picked', land);
        check(!!(await until(a, '!PhoneMouse.hasPhone()', 5000)), 'the computer lets the phone go at once');
        check(await a.eval('PhoneMouse.isOn()'), 'and keeps the link open for it');
        await shot(b, 'mouse-phone-landing.png');
        await tap(b, '#rejoinBtn');
        check(!!(await until(b, "(function(){var m=" + MOUSE + "; return m.active && m.computer;})()", 8000)), 'Reconnect puts the phone back');

        // ── The computer reloads: the link comes back with the same code ──
        await a.eval('window.__closeApproved = true; location.reload(); 1').catch(() => {});
        await sleep(1500);
        await waitReady(a, { timeoutMs: 90000 });
        await until(a, "!!(window.PhoneMouse && document.getElementById('mixer-strip'))", 30000);
        log('A reloaded', await a.eval(KIT));
        const back = await until(a, 'PhoneMouse.hasPhone() && PhoneMouse.code()', 15000);
        check(back === code, 'after a reload the computer reopens the same link, and the phone is back', back);
        await sleep(300);
        const pd1 = await a.eval('__e2e.phonePresses.down');
        await touchStroke(b, [0.3, 0.5], [0.7, 0.5], 10, 200);
        await sleep(600);
        check((await a.eval('__e2e.phonePresses.down')) === pd1 + 1, 'and paints on the reloaded computer');

        // ── The artist way from the same dialog; stranger swirls ────
        await a.eval("PhonePads.open(); 1");
        await until(a, "(function(){var d=" + DIALOG + "; return d && d.mouse && d.stop;})()", 5000);
        await a.eval("document.getElementById('phonePadWayArtist').click(); 1");
        const art = await until(a, "(function(){var d=" + DIALOG + "; return d && !d.mouse && /^[A-Z0-9]{6}$/.test(d.code) ? d : null;})()", 8000);
        check(!!art && art.qr && art.code === (await a.eval('currentRoom')), '"As an artist" shows the room\'s code', art);
        check((await a.eval("localStorage.getItem('fluidui.phoneWay')")) === 'artist', 'and the dialog remembers the choice');
        await a.eval("window.__realStranger = isStrangerRoom; isStrangerRoom = function(){ return true; }; PhonePads.refresh(); 1");
        const str = await until(a, "(function(){var d=" + DIALOG + "; return d && d.note ? d : null;})()", 3000);
        check(!!str && !str.body && /stranger/.test(str.note), 'in a stranger swirl the artist way explains, with no code', str);
        await a.eval("isStrangerRoom = window.__realStranger; document.getElementById('phonePadWayMouse').click(); 1");
        await shot(a, 'mouse-dialog-connected-2.png');

        // ── Disconnect the phone from the computer ──────────────────
        await until(a, "(function(){var d=" + DIALOG + "; return d && d.mouse && d.stop;})()", 5000);
        await a.eval("document.getElementById('phonePadStop').click(); 1");
        const note = await until(b, "(function(){var n=document.getElementById('landingNote'); return !document.getElementById('landing').hidden && !n.hidden ? n.textContent : null;})()", 5000);
        check(/disconnected this phone/.test(note || ''), 'Disconnect on the computer sends the phone back to the start, saying why', note);
        check(await a.eval('!PhoneMouse.hasPhone() && PhoneMouse.isOn()'), 'and starts the link over, waiting for a phone');
        await sleep(300);
        const code2 = await until(a, "(function(){var d=" + DIALOG + "; var c=PhoneMouse.code(); return d && d.mouse && c && d.code === c.slice(0, 4) + ' ' + c.slice(4) && /Waiting for your phone/.test(d.status) ? c : null;})()", 5000);
        check(/^[A-Z2-9]{8}$/.test(code2 || '') && code2 !== code, 'on a new code, which the dialog shows', { before: code, after: code2 });
        await a.eval('PhonePads.close(); 1');
        check(await a.eval('PhoneMouse.__state().idleStop'), 'a link no phone has used closes itself a while after the dialog');

        // ── The start page: two ways, and typing a code ─────────────
        await tap(b, '#wayRoom');
        const rm = await b.eval("({pressed: document.getElementById('wayRoom').getAttribute('aria-pressed'), step2: document.getElementById('step2').textContent, ph: document.getElementById('codeInput').placeholder, btn: document.getElementById('joinBtn').textContent})");
        check(rm.pressed === 'true' && /As an artist/.test(rm.step2) && rm.ph === 'K7P2QX' && rm.btn === 'Join', '"Join as an artist" asks for a 6-character room code', rm);
        await tap(b, '#wayMouse');
        const mm = await b.eval("({pressed: document.getElementById('wayMouse').getAttribute('aria-pressed'), step2: document.getElementById('step2').textContent, ph: document.getElementById('codeInput').placeholder, btn: document.getElementById('joinBtn').textContent})");
        check(mm.pressed === 'true' && /As your mouse/.test(mm.step2) && mm.ph === 'KMP4 QX7R' && mm.btn === 'Connect', '"Be your computer\'s mouse" asks for the computer\'s code', mm);
        await shot(b, 'mouse-phone-landing-ways.png');
        await b.eval("(function(){var i=document.getElementById('codeInput'); i.value=" + JSON.stringify(code2.slice(0, 4).toLowerCase() + ' ' + code2.slice(4)) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()");
        const typed = await until(b, "(function(){var m=" + MOUSE + "; return m.active && m.code;})()", 10000);
        check(typed === code2, 'typing the computer\'s code (any case, with its space) connects as its mouse', typed);
        // That pairing just happened with the computer already in a room —
        // the whole point of the door living in the room panel.
        check(await a.eval('!!currentRoom && isMultiplayerEnabled && PhoneMouse.hasPhone()'), 'a phone can take the mouse while the computer is in a room');
        // A's id after its reload, not the one from before it: a reconnect
        // gets a new connection id, and the other canvas counts by id.
        const aId2 = await a.eval('clientId');
        const pdRoom = await a.eval('__e2e.phonePresses.down');
        const cRoom0 = await c.eval('__e2e.peer[' + JSON.stringify(aId2) + '] || 0');
        await touchStroke(b, [0.35, 0.6], [0.65, 0.6], 8, 160);
        await sleep(900);
        const pdRoom1 = await a.eval('__e2e.phonePresses.down');
        const cRoom1 = await c.eval('__e2e.peer[' + JSON.stringify(aId2) + '] || 0');
        check(pdRoom1 === pdRoom + 1 && cRoom1 > cRoom0, 'and paints from there as the computer, into the room',
            { presses: pdRoom1 - pdRoom, toTheRoom: cRoom1 - cRoom0 });
        // A room code typed on the mouse card still goes to the room.
        await tap(b, '#moreBtn');
        await tap(b, '#leaveBtn');
        await b.eval("(function(){var i=document.getElementById('codeInput'); i.value=" + JSON.stringify(room) + "; return 1;})()");
        await tap(b, '#joinBtn');
        const asArtist = await until(b, "(function(){var s=SwirlPad.state(); return s.kind==='room' && s.phase==='open' && s.count===3 ? s : null;})()", 10000);
        check(!!asArtist && asArtist.way === 'room', 'a 6-character code joins the room as an artist, whichever card was picked', asArtist && { kind: asArtist.kind, count: asArtist.count, way: asArtist.way });
        check(!!(await until(a, 'PhonePads.count() === 1', 5000)), 'and the computer counts it as an artist');
        await tap(b, '#moreBtn');
        await tap(b, '#leaveBtn');

        const errs = { a: await a.eval('__e2e.errs'), c: await c.eval('__e2e.errs'), b: await b.eval('window.__errs'), d: await d.eval('window.__errs') };
        check(!errs.a.length && !errs.c.length && !errs.b.length && !errs.d.length, 'no errors on either computer or phone',
            { a: errs.a.slice(0, 3), c: errs.c.slice(0, 3), b: errs.b.slice(0, 3), d: errs.d.slice(0, 3) });
    } catch (e) {
        fails++;
        log('ERROR', e.stack || e.message);
    } finally {
        for (const X of all) {
            try { X.page.close(); } catch (_) {}
            try { X.proc.kill(); } catch (_) {}
        }
        srv.close();
        await sleep(700);
        for (const X of all) { try { fs.rmSync(X.profile, { recursive: true, force: true }); } catch (_) {} }
    }
    log(passes + ' passed, ' + fails + ' failed');
    process.exit(fails ? 1 : 0);
})();
