// End-to-end: a phone as a brush for a computer's canvas (2026-09-16).
// Two headless Chromes against a LOCAL relay: A is the app from this
// working tree, B is an emulated iPhone that opens the room link the way a
// scanned QR does, lands on phone/ and paints with touch. The checks read
// what landed on A's canvas (the dye texture), not just what crossed the wire.
//
//   npx wrangler dev --port 8787            (the relay; reads public/, never builds it)
//   node scripts/test/mp/mp-phone-e2e.js
//
// Env: MP_HOST (default 127.0.0.1:8787), CHROME (path), SHOTS=<dir> saves
// screenshots of the phone and the dialog. ~40 s.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, waitReady } = require('../cdp.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RELAY = process.env.MP_HOST || '127.0.0.1:8787';
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
    '.mp3': 'audio/mpeg', '.webp': 'image/webp' };
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
    const profile = path.join(os.tmpdir(), 'fluid-phone-e2e-' + name + '-' + process.pid);
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

// Desktop page kit: dye readback, and a count of peer paint by sender kind.
const KIT_A = String.raw`(function(){
  function dye(){
    var f=density.read,w=f.width,h=f.height,px=new Float32Array(w*h*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    var m=0,sx=0,sy=0;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=(y*w+x)*4,v=Math.max(px[i],px[i+1],px[i+2]);
      if(v>0.002){m+=v;sx+=x*v;sy+=(h-1-y)*v;}}
    return {mass:m,cx:m?sx/m/w:null,cy:m?sy/m/h:null};
  }
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  var fromPad={msgs:0,dabs:0,maxV:0,shares:[]};
  var q=window.enqueueRemoteSplat;
  window.enqueueRemoteSplat=function(d){
    try{ if(d&&window.PhonePads&&PhonePads.isPad(d.clientId)){ fromPad.msgs++; var ds=(d.data&&d.data.dabs)||[]; fromPad.dabs+=ds.length;
      ds.forEach(function(x){ fromPad.maxV=Math.max(fromPad.maxV,Math.hypot(x[2],x[3])); if(fromPad.shares.length<5) fromPad.shares.push(x[5]); }); } }catch(_){}
    return q.apply(this,arguments);
  };
  function stroke(u0,v0,u1,v1,steps,ms){
    return new Promise(function(done){
      var c=document.getElementById('canvas'), r=c.getBoundingClientRect(), i=0;
      var ev=function(t,u,v,b,tgt){ (tgt||c).dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,composed:true,clientX:r.left+u*r.width,clientY:r.top+v*r.height,pointerId:77,pointerType:'mouse',button:0,buttons:b,isPrimary:true,pressure:b?0.5:0})); };
      ev('pointerdown',u0,v0,1);
      var tick=setInterval(function(){ i++; var t=i/steps; ev('pointermove',u0+(u1-u0)*t,v0+(v1-v0)*t,1);
        if(i>=steps){ clearInterval(tick); ev('pointerup',u1,v1,0); done(1); } }, ms/steps);
    });
  }
  window.__e2e={dye:dye,errs:errs,fromPad:fromPad,stroke:stroke};
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

async function bootDesktop(A, url) {
    const a = A.page;
    await a.send('Page.addScriptToEvaluateOnNewDocument', { source: PREP });
    await a.send('Page.navigate', { url });
    await waitReady(a, { timeoutMs: 90000 });
    await until(a, "!!(window.PhonePads && typeof connectToRoom==='function' && document.getElementById('mixer-strip') && document.getElementById('phonePadBtn'))", 30000);
    await a.eval("(function(){var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    return a.eval(KIT_A);
}

// A touch stroke across B's pad, in pad fractions.
async function touchStroke(b, from, to, steps = 18, ms = 360) {
    const r = await b.eval("(function(){var r=document.getElementById('pad').getBoundingClientRect(); return {l:r.left,t:r.top,w:r.width,h:r.height};})()");
    const pt = (u, v) => ({ x: r.l + u * r.w, y: r.t + v * r.h, id: 1, radiusX: 10, radiusY: 10, force: 1 });
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(from[0], from[1])] });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await sleep(ms / steps);
        await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t)] });
    }
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tap(b, sel) {
    const r = await b.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return null; var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()");
    if (!r) throw new Error('no element ' + sel);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 2 }] });
    await sleep(40);
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(120);
}

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY);
    let A = null, B = null;
    try {
        [A, B] = await Promise.all([chrome(9371, 'A', '1280,860'), chrome(9372, 'B', '500,900')]);
        const a = A.page, b = B.page;
        log('A', await bootDesktop(A, url));
        // One solid colour on the computer, so the phone (which starts from
        // the computer's brush) and a local stroke paint the same dye.
        await a.eval("setActiveBrushColorMode('fixed', {color: '#ffffff'}); 1");
        check(await a.eval('window.__swirlToPhone !== true'), 'a desktop browser is not sent to the phone page');
        check(await a.eval("!!document.querySelector('#mpDisconnected #phonePadBtn')"), 'Swirl Together shows "Paint from your phone"');

        // ── The door: a room and a QR, no clipboard ──────────────────
        await a.eval("window.__clip = 0; if (navigator.clipboard) navigator.clipboard.writeText = function(){ window.__clip++; return Promise.resolve(); }; 1");
        await a.eval("document.getElementById('phonePadBtn').click(); 1");
        const code = await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        check(/^[A-Z0-9]{6}$/.test(code || ''), 'the door starts a room', code);
        const dlg = await until(a, "(function(){var m=document.getElementById('phonePadModal'); if(!m||!m.classList.contains('show')) return null; return {qr:!!m.querySelector('#phonePadQr svg'), code:m.querySelector('#phonePadCode').textContent, status:m.querySelector('#phonePadStatus').textContent, alt:m.querySelector('#phonePadAlt').textContent};})()", 5000);
        check(!!dlg && dlg.qr && dlg.code === code, 'the dialog shows the QR and the code', dlg);
        await until(a, "/Waiting for your phone/.test(document.getElementById('phonePadStatus').textContent)", 5000);
        check(/Waiting for your phone/.test(await a.eval("document.getElementById('phonePadStatus').textContent")), 'the dialog waits for a phone');
        check((await a.eval('window.__clip')) === 0, 'the phone door does not touch the clipboard');
        const qrUrl = await a.eval('PhonePads.padUrl(currentRoom)');
        check(qrUrl === 'https://swirltogether.com/phone/#' + code, 'from localhost the QR points at the public phone page', qrUrl);
        await shot(a, 'desktop-dialog-waiting.png');

        // ── B: an iPhone opens the room link ─────────────────────────
        await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
        await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await b.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
        await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PREP +
            "window.__sent={}; (function(){var s=WebSocket.prototype.send; WebSocket.prototype.send=function(m){try{var t=JSON.parse(m).type; window.__sent[t]=(window.__sent[t]||0)+1;}catch(_){} return s.apply(this,arguments);};})();" +
            "window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});" });
        await b.send('Page.navigate', { url: url + '#' + code });
        const landed = await until(b, "location.pathname.endsWith('/phone/') && !!window.SwirlPad && location.pathname + location.hash", 15000);
        check(landed === '/phone/#' + code, 'the phone is sent to the phone page, room code and all', landed);
        const open = await until(b, "(function(){var s=SwirlPad.state(); return s.phase==='open' && s.count===2 && s.info ? s : null;})()", 10000);
        check(!!open, 'the phone joins the room and hears from the computer', open && { phase: open.phase, count: open.count, host: open.host });
        const cvs = await a.eval("({w:document.getElementById('canvas').width,h:document.getElementById('canvas').height,r:config.SPLAT_RADIUS,gate:!!config.COLOR_GATE})");
        check(!!open && near(open.info.w, cvs.w, 3) && near(open.info.h, cvs.h, 3) && open.info.gate === cvs.gate, 'pad-info carries the canvas size and flow model', { info: open && { w: open.info.w, h: open.info.h, gate: open.info.gate }, canvas: cvs });
        check(!!open && near(open.brush.value / 1000, cvs.r, 0.0005), 'the phone starts from the computer\'s brush size', { phone: open && open.brush.value, computer: cvs.r * 1000 });
        check(!!open && open.brush.colour === 'fixed' && open.info.color === '#ffffff', 'and paints in its colour', open && { brush: open.brush, color: open.info.color });
        check(!!open && open.info.spFrac > 0 && open.info.ref > 0 && open.info.budget > 0, 'and walks its dabs the computer\'s way', open && { spFrac: open.info.spFrac, spMin: open.info.spMin, ref: open.info.ref, tc: open.info.tc, floor: open.info.floor, budget: open.info.budget });
        check(!!open && near(open.pad.w / open.pad.h, cvs.w / cvs.h, 0.02) && open.pad.w > 300, 'the pad has the canvas\'s shape', open && open.pad);
        const aSees = await until(a, "PhonePads.count() === 1 && /A phone is connected/.test(document.getElementById('phonePadStatus').textContent)", 5000);
        check(!!aSees, 'the computer counts the phone in the dialog');
        const toastTxt = await a.eval("(document.getElementById('mpTurnToast')||{}).textContent || ''");
        check(/joined from a phone/.test(toastTxt), 'the computer says a phone joined', toastTxt);
        check(await a.eval("myRole === 'host'"), 'the computer stays host');
        await shot(a, 'desktop-dialog-connected.png');
        await shot(b, 'phone-pad.png');

        // Layout: upright, the tools sit right under the pad and everything
        // fits; sideways, the pad takes the height and the tools move beside it.
        const GEOM = "(function(){var r=function(id){var b=document.getElementById(id).getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height};};" +
            "return {pad:r('pad'), tools:r('tools'), vw:innerWidth, vh:innerHeight, hint:!document.getElementById('rotateHint').hidden};})()";
        const up = await b.eval(GEOM);
        check(up.tools.t - up.pad.b < 60 && up.tools.b <= up.vh && up.pad.r <= up.vw && up.hint, 'upright: pad and tools together, on screen, with the sideways hint', up);
        await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenWidth: 844, screenHeight: 390, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
        const side = await until(b, "(function(){var g=" + GEOM + "; return g.pad.h > " + up.pad.h + " ? g : null;})()", 4000);
        check(!!side && side.pad.w * side.pad.h > up.pad.w * up.pad.h * 1.3 && side.tools.l >= side.pad.r && side.tools.r <= side.vw && side.pad.b <= side.vh && !side.hint,
            'sideways: a bigger pad with the tools beside it', side);
        await shot(b, 'phone-pad-landscape.png');
        await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
        await until(b, "(function(){var g=" + GEOM + "; return g.pad.w <= " + (up.pad.w + 1) + ";})()", 4000);
        await a.eval("PhonePads.close(); 1");

        // ── Paint from the phone ─────────────────────────────────────
        // No decay while measuring: mass then counts what landed.
        await a.eval("(function(){var s=document.getElementById('densityDissipation'); window.__dd=s.value; s.value=1; s.dispatchEvent(new Event('input',{bubbles:true})); clearCanvas(); return 1;})()");
        await sleep(500);
        const before = await a.eval('__e2e.dye()');
        // The local stroke below takes as long as this one really did: a
        // stroke's speed changes how much dye the flow keeps (a fast stroke
        // loses more to its own motion), and driving touch over CDP is slow.
        let tStroke = Date.now();
        await touchStroke(b, [0.25, 0.5], [0.75, 0.5]);
        const phoneMs = Date.now() - tStroke;
        await sleep(1500);
        const after = await a.eval('__e2e.dye()');
        const fp = await a.eval('__e2e.fromPad');
        check(fp.msgs >= 2 && fp.dabs >= 10, 'the computer receives the phone\'s dab trains', fp);
        check(after.mass > before.mass + 5, 'the phone stroke lands as dye on the computer', { before: +before.mass.toFixed(1), after: +after.mass.toFixed(1) });
        const label = await a.eval("(function(){var e=document.querySelector('.remote-cursor .remote-cursor-label'); return e ? e.textContent : null;})()");
        check(!!label && label.indexOf('📱') === 0, 'the phone\'s cursor is marked as a phone', label);
        const phoneMass = after.mass - before.mass;

        // The same line painted on the computer itself, for scale.
        await a.eval('clearCanvas(); 1');
        await sleep(400);
        const b2 = await a.eval('__e2e.dye()');
        await a.eval('__e2e.stroke(0.25, 0.5, 0.75, 0.5, 36, ' + phoneMs + ')');
        await sleep(1500);
        const a2 = await a.eval('__e2e.dye()');
        const localMass = a2.mass - b2.mass;
        const ratio = localMass > 0 ? phoneMass / localMass : 0;
        check(ratio > 0.8 && ratio < 1.25, 'a phone stroke lays as much dye as the same stroke painted here', { phone: +phoneMass.toFixed(1), local: +localMass.toFixed(1), ratio: +ratio.toFixed(2), ms: phoneMs });
        // The stroke's own push carries its dye along, so "where" is judged
        // against the same line painted here, not against the line itself.
        check(after.cx !== null && a2.cx !== null && near(after.cx, a2.cx, 0.06) && near(after.cy, a2.cy, 0.06),
            'the phone\'s dye lands where the same stroke painted here lands',
            { phone: [+after.cx.toFixed(3), +after.cy.toFixed(3)], local: [a2.cx && +a2.cx.toFixed(3), a2.cy && +a2.cy.toFixed(3)] });

        // Random colours: the handed colour is used and each dab's share
        // counts, so this is the dye-share path rather than the dab count.
        await a.eval("setActiveBrushColorMode('random'); clearCanvas(); 1");
        const rnd = await until(b, "(function(){var s=SwirlPad.state(); return s.info && s.info.mode==='random' && s.brush.colour==='random';})()", 5000);
        check(!!rnd, 'the phone follows the computer into random colours');
        await sleep(400);
        const b3 = await a.eval('__e2e.dye()');
        tStroke = Date.now();
        await touchStroke(b, [0.25, 0.5], [0.75, 0.5]);
        const phoneMs2 = Date.now() - tStroke;
        await sleep(1500);
        const a3 = await a.eval('__e2e.dye()');
        await a.eval('clearCanvas(); 1');
        await sleep(400);
        const b4 = await a.eval('__e2e.dye()');
        await a.eval('__e2e.stroke(0.25, 0.5, 0.75, 0.5, 36, ' + phoneMs2 + ')');
        await sleep(1500);
        const a4 = await a.eval('__e2e.dye()');
        const rPhone = a3.mass - b3.mass, rLocal = a4.mass - b4.mass;
        const rRatio = rLocal > 0 ? rPhone / rLocal : 0;
        // Two different random colours: their brightest channels differ, hence the wider band.
        check(rRatio > 0.6 && rRatio < 1.6, 'with random colours too, about as much dye as a local stroke', { phone: +rPhone.toFixed(1), local: +rLocal.toFixed(1), ratio: +rRatio.toFixed(2) });
        await a.eval("setActiveBrushColorMode('fixed', {color: '#ffffff'}); 1");
        await a.eval("(function(){var s=document.getElementById('densityDissipation'); s.value=window.__dd; s.dispatchEvent(new Event('input',{bubbles:true})); clearCanvas(); return 1;})()");

        // ── Take turns ───────────────────────────────────────────────
        await a.eval('toggleTurns(); 1');
        const tOn = await until(b, "(function(){var s=SwirlPad.state(); return s.turns.on && s.turns.holder ? s.turns : null;})()", 5000);
        const aId = await a.eval('clientId');
        check(!!tOn && tOn.holder === aId, 'the phone sees turns start with the computer holding the brush', tOn);
        const banner = await b.eval("document.getElementById('turnBanner').hidden ? null : document.getElementById('turnText').textContent");
        check(!!banner && /is painting/.test(banner), 'the phone says whose turn it is', banner);
        const sentBefore = await b.eval("window.__sent.splat||0");
        await touchStroke(b, [0.3, 0.3], [0.6, 0.3], 8, 160);
        await sleep(400);
        check((await b.eval("window.__sent.splat||0")) === sentBefore, 'out of turn, the phone sends no paint');
        const blockedToast = await b.eval("document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent");
        check(/turn/.test(blockedToast), 'and says why', blockedToast);
        await a.eval('passTurn(); 1');
        const mine = await until(b, "(function(){var s=SwirlPad.state(); return s.turns.holder===s.id;})()", 5000);
        check(!!mine, 'the brush reaches the phone');
        check(await b.eval("!document.getElementById('passBtn').hidden && document.getElementById('turnBanner').classList.contains('is-mine')"), 'the phone lights up with a Pass button');
        const m0 = await a.eval('__e2e.fromPad.msgs');
        await touchStroke(b, [0.3, 0.6], [0.6, 0.6], 10, 200);
        await sleep(600);
        check((await a.eval('__e2e.fromPad.msgs')) > m0, 'on its turn the phone paints');
        await tap(b, '#passBtn');
        const back = await until(a, 'turnHolderId === clientId', 5000);
        check(!!back, 'Pass on the phone hands the brush back');
        await a.eval('toggleTurns(); 1');
        await until(b, "!SwirlPad.state().turns.on", 5000);

        // ── Call and return ──────────────────────────────────────────
        await a.eval('toggleCallReturn(); 1');
        await until(b, "(function(){var s=SwirlPad.state(); return s.turns.on && s.turns.mode==='stroke';})()", 5000);
        await a.eval('passTurn(); 1');
        const call = await until(b, "(function(){var s=SwirlPad.state(); return s.turns.holder===s.id;})()", 5000);
        check(!!call, 'call and return: the phone gets the call');
        const passes0 = await b.eval("window.__sent['turn-pass']||0");
        await touchStroke(b, [0.4, 0.4], [0.6, 0.45], 10, 200);
        const returned = await until(a, 'turnHolderId === clientId', 4000);
        check(!!returned, 'one swirl, and the brush comes back by itself');
        check((await b.eval("window.__sent['turn-pass']||0")) === passes0 + 1, 'the phone passed exactly once');
        check(await until(b, "!SwirlPad.state().spent", 3000), 'the phone\'s next call is open again');
        await a.eval('toggleCallReturn(); 1');
        await until(b, "!SwirlPad.state().turns.on", 5000);

        // ── Clear from the phone ─────────────────────────────────────
        await touchStroke(b, [0.2, 0.2], [0.8, 0.8], 12, 240);
        await sleep(900);
        const dirty = await a.eval('__e2e.dye()');
        await tap(b, '#moreBtn');
        await tap(b, '#clearBtn');
        check(await b.eval("!document.getElementById('confirmSheet').hidden"), 'Clear asks first');
        await tap(b, '#confirmYes');
        await sleep(600);
        const clean = await a.eval('__e2e.dye()');
        check(dirty.mass > 5 && clean.mass < dirty.mass * 0.05, 'Clear on the phone clears the computer', { dirty: +dirty.mass.toFixed(1), clean: +clean.mass.toFixed(1) });

        // ── The computer reloads: the room comes back to it ──────────
        const padId = await b.eval('SwirlPad.state().id');
        await a.eval('window.__closeApproved = true; location.reload(); 1').catch(() => {});
        await sleep(1500);
        await waitReady(a, { timeoutMs: 90000 });
        await until(a, "!!(window.PhonePads && document.getElementById('mixer-strip'))", 30000);
        log('A reloaded', await a.eval(KIT_A));
        const rejoined = await until(a, "isMultiplayerEnabled && currentRoom === '" + code + "' && myRole", 15000);
        check(rejoined === 'host', 'after a reload the computer is host again (not the phone)', rejoined);
        const recount = await until(a, 'PhonePads.count() === 1 && PhonePads.isPad(' + JSON.stringify(padId) + ')', 8000);
        check(!!recount, 'the phone says hello again and is counted');
        check(await until(a, '!!PhonePads.__state().lastInfo', 4000), 'and the computer answers it');
        check(await b.eval("SwirlPad.state().phase === 'open'"), 'the phone stayed in the room');
        await sleep(300);
        const p0 = await a.eval('__e2e.fromPad.msgs');
        await touchStroke(b, [0.3, 0.5], [0.7, 0.5], 10, 200);
        await sleep(600);
        check((await a.eval('__e2e.fromPad.msgs')) > p0, 'and keeps painting on the reloaded computer');

        // ── Leaving ──────────────────────────────────────────────────
        const errsB = await b.eval('window.__errs');
        check(errsB.length === 0, 'no errors on the phone', errsB.slice(0, 3));
        await tap(b, '#moreBtn');
        await tap(b, '#leaveBtn');
        check(await b.eval("!document.getElementById('landing').hidden && location.hash === ''"), 'Leave returns the phone to the start');
        check(!!(await until(a, 'PhonePads.count() === 0', 5000)), 'the computer drops the phone when it leaves');
        await shot(b, 'phone-landing.png');

        // ── The full app is one link away ────────────────────────────
        await b.send('Page.navigate', { url: url + '?full=1#' + code });
        await sleep(2500);
        const stay = await b.eval("({path: location.pathname, toPhone: !!window.__swirlToPhone, app: !!document.getElementById('photoWarn')})");
        check(stay.path === '/' && !stay.toPhone && stay.app, '?full=1 keeps a phone on the full app', stay);

        const errsA = await a.eval('__e2e.errs');
        check(errsA.length === 0, 'no errors on the computer', errsA.slice(0, 3));
    } catch (e) {
        fails++;
        log('ERROR', e.stack || e.message);
    } finally {
        for (const X of [A, B]) {
            if (!X) continue;
            try { X.page.close(); } catch (_) {}
            try { X.proc.kill(); } catch (_) {}
        }
        srv.close();
        await sleep(500);
        for (const X of [A, B]) { if (X) try { fs.rmSync(X.profile, { recursive: true, force: true }); } catch (_) {} }
    }
    log(passes + ' passed, ' + fails + ' failed');
    process.exit(fails ? 1 : 0);
})();
