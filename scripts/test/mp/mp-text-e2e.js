// End-to-end: text and colliders across a real Swirl Together room
// (2026-09-15). Two separate headless Chromes (separate profiles, so two
// device uids) run the app from this working tree against a LOCAL relay, and
// the checks read what actually landed on each canvas — the peer's DOM line,
// the obstacle texture, the dye texture — not just what crossed the wire.
//
//   npx wrangler dev --port 8787 --ip 127.0.0.1      (the relay; reads public/, never builds it)
//   node scripts/test/mp/mp-text-e2e.js
//
// Env: MP_HOST (default 127.0.0.1:8787), CHROME (path), KEEP=1 keeps the
// browsers' logs. Takes ~1.5 minutes. The static server is built in (repo
// root, no-store), so no dev server is needed either.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
let fails = 0, passes = 0;
function check(ok, msg, extra) {
    if (ok) passes++; else fails++;
    log((ok ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

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

// One page-side kit, installed in both browsers: readbacks and counters.
const KIT = String.raw`(function(){
  if (window.__e2e) return 'kit already';
  function readFBO(f){
    var w=f.width,h=f.height,px=new Float32Array(w*h*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {w:w,h:h,px:px};
  }
  // Obstacle: count wall texels, their centroid (top-down fractions), and a
  // 32x20 coverage grid for comparing two canvases of the same shape.
  function obs(){
    var f=window.__getObstacle&&window.__getObstacle(); if(!f) return null;
    var r=readFBO(f),n=0,sx=0,sy=0,G=[],GW=32,GH=20; for(var k=0;k<GW*GH;k++)G.push(0);
    for(var y=0;y<r.h;y++)for(var x=0;x<r.w;x++){var i=(y*r.w+x)*4,v=Math.max(r.px[i],r.px[i+1]);
      if(v>0.3){n++;sx+=x;sy+=(r.h-1-y);var gx=Math.min(GW-1,(x/r.w*GW)|0),gy=Math.min(GH-1,((r.h-1-y)/r.h*GH)|0);G[gy*GW+gx]++;}}
    return {w:r.w,h:r.h,n:n,cx:n?sx/n/r.w:null,cy:n?sy/n/r.h:null,grid:G};
  }
  // Dye: mass (sum of max channel) + centroid + a 48x30 grid of mass.
  function dye(){
    var r=readFBO(density.read),m=0,sx=0,sy=0,G=[],GW=48,GH=30; for(var k=0;k<GW*GH;k++)G.push(0);
    for(var y=0;y<r.h;y++)for(var x=0;x<r.w;x++){var i=(y*r.w+x)*4,v=Math.max(r.px[i],r.px[i+1],r.px[i+2]);
      if(v>0.002){m+=v;sx+=x*v;sy+=(r.h-1-y)*v;var gx=Math.min(GW-1,(x/r.w*GW)|0),gy=Math.min(GH-1,((r.h-1-y)/r.h*GH)|0);G[gy*GW+gx]+=v;}}
    return {w:r.w,h:r.h,mass:m,cx:m?sx/m/r.w:null,cy:m?sy/m/r.h:null,grid:G};
  }
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  var sent={pour:0,msgs:{}}; var got={pour:0};
  // Count what leaves (wrapping the socket's send) and what lands (peerPour).
  var wrapSock=function(){ if(!partySocket||partySocket.__e2e) return; var s=partySocket.send.bind(partySocket);
    partySocket.send=function(m){ try{var t=JSON.parse(m).type; sent.msgs[t]=(sent.msgs[t]||0)+1; if(t==='text-pour') sent.pour+=JSON.parse(m).data.pours.length;}catch(_){} return s(m); };
    partySocket.__e2e=1; };
  setInterval(wrapSock,100);
  var pp=textOverlays.peerPour; textOverlays.peerPour=function(o,l,cw,ch,p){ got.pour+=(p&&p.length)||0; return pp.apply(this,arguments); };
  window.__e2e={obs:obs,dye:dye,errs:errs,sent:sent,got:got};
  return 'kit ok';
})()`;

async function launch(port, url, name) {
    const profile = path.join(os.tmpdir(), 'fluid-mp-e2e-' + name + '-' + process.pid);
    const proc = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
        '--window-size=1280,860', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', 'about:blank'
    ], { stdio: 'ignore' });
    for (let i = 0; i < 80 && !(await portUp(port)); i++) await sleep(250);
    const page = await connect(port);
    await page.send('Page.enable', {});
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source:
        "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');" +
        "localStorage.setItem('fluidMultiplayerHost','" + RELAY + "');}catch(_){} window.__skipUIFork=true;" });
    await page.send('Page.navigate', { url });
    await waitReady(page, { timeoutMs: 90000 });
    for (let i = 0; i < 80; i++) {
        const ok = await page.eval("!!(window.textOverlays && window.collisionLayers && window.Masks && document.getElementById('text-overlay-container') && typeof createRoom==='function' && document.getElementById('mixer-strip'))").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    await page.eval("(function(){var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    const kit = await page.eval(KIT);
    const host = await page.eval('PARTYKIT_HOST');
    log(name + ' ready', kit, 'relay=' + host);
    if (host !== RELAY) throw new Error(name + ' is not on the local relay: ' + host);
    return { proc, page, profile, name };
}

// Poll a page expression until it is truthy (or time runs out); returns the last value.
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

function corr(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return (saa && sbb) ? sab / Math.sqrt(saa * sbb) : 0;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY);
    let A = null, B = null;
    try {
        [A, B] = await Promise.all([launch(9361, url, 'A'), launch(9362, url, 'B')]);
        const a = A.page, b = B.page;

        // ── Room ──────────────────────────────────────────────────────
        await a.eval('createRoom(); 1');
        const code = await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        await b.eval("joinRoom('" + code + "'); 1");
        const both = await until(a, 'connectedClients === 2', 10000) && await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000);
        check(!!both, 'A and B share room ' + code);
        const ids = await a.eval('clientId'), idsB = await b.eval('clientId');
        check(ids && idsB && ids !== idsB, 'two connections', { A: ids, B: idsB });
        await sleep(1500); // the 1.2 s open-time republish settles

        // ── 1. A line with a wall, free painting ──────────────────────
        await a.eval("textOverlays.clearAll(); window.__L1 = textOverlays.add({content:'HELLO', x:0.5, y:0.42, fontSize:120, collider:true, colliderMode:'block', colliderStrength:1}).id");
        const pl = await until(b, "(function(){var p=textOverlays.getPeerLines(); return p.length===1 && p[0].content==='HELLO' ? p : null;})()");
        check(!!pl, 'B holds A\'s line as a peer line', pl && { content: pl[0].content, collider: pl[0].collider, cx: pl[0].cx, cy: pl[0].cy });
        check(await b.eval("textOverlays.getAll().length === 0"), 'B\'s own list stays empty (peer lines are not B\'s)');
        const rA = await a.eval("(function(){var e=document.querySelector('[data-overlay-id]'); var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,t:e.textContent};})()");
        const rB = await b.eval("(function(){var e=document.querySelector('[data-peer-line]'); if(!e) return null; var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,t:e.textContent};})()");
        check(!!rB && rB.t === 'HELLO' && near(rA.x, rB.x, 2) && near(rA.y, rB.y, 2) && near(rA.w, rB.w, 3), 'B draws the words where A does', { A: rA, B: rB });
        await sleep(600);
        const oA1 = await a.eval('__e2e.obs()'), oB1 = await b.eval('__e2e.obs()');
        check(oA1.n > 300 && oB1.n > 0.9 * oA1.n && oB1.n < 1.1 * oA1.n && near(oA1.cx, oB1.cx, 0.01) && near(oA1.cy, oB1.cy, 0.01)
            && corr(oA1.grid, oB1.grid) > 0.97, 'B\'s wall matches A\'s (obstacle readback)',
            { A: { n: oA1.n, cx: +oA1.cx.toFixed(3), cy: +oA1.cy.toFixed(3) }, B: { n: oB1.n, cx: oB1.cx && +oB1.cx.toFixed(3), cy: oB1.cy && +oB1.cy.toFixed(3) }, corr: +corr(oA1.grid, oB1.grid).toFixed(3) });

        // ── 2. Typing reaches the room ────────────────────────────────
        for (const s of ['HELLO W', 'HELLO WO', 'HELLO WOR', 'HELLO WORLD']) { await a.eval("textOverlays.update(__L1, {content:'" + s + "'}); 1"); await sleep(40); }
        const typed = await until(b, "(function(){var p=textOverlays.getPeerLines(); return p.length===1 && p[0].content==='HELLO WORLD';})()", 3000);
        check(!!typed, 'a typing burst lands as the finished words');
        const lineMsgs = await a.eval("__e2e.sent.msgs['text-line']||0");
        check(lineMsgs <= 8, 'typing is throttled on the wire', { textLineMsgs: lineMsgs });
        await sleep(700);
        const oA2 = await a.eval('__e2e.obs()'), oB2 = await b.eval('__e2e.obs()');
        check(oB2.n > 0.9 * oA2.n && oB2.n < 1.1 * oA2.n && corr(oA2.grid, oB2.grid) > 0.97, 'the rebuilt wall matches after the edit settles',
            { A: oA2.n, B: oB2.n, corr: +corr(oA2.grid, oB2.grid).toFixed(3) });

        // ── 3. Fluidize: a collider line pours on both canvases ──────
        // Paused on both sides so the dye stays where it lands. The line is
        // a collider, so B must drop its wall BEFORE the pour arrives or the
        // pour lands as its own outline.
        await a.eval('if(!isPaused) togglePause(); clearCanvas(); 1');
        await b.eval('if(!isPaused) togglePause(); 1');
        await sleep(400);
        await a.eval("window.__L2 = textOverlays.add({content:'POUR', x:0.32, y:0.72, fontSize:100, color:'#ff3355', collider:true, colliderMode:'deflect'}).id");
        await until(b, "textOverlays.getPeerLines().some(function(p){return p.content==='POUR';})");
        await sleep(500);
        const d0 = await b.eval('__e2e.dye().mass');
        await a.eval('textOverlays.fluidize(__L2)');
        await until(b, "__e2e.got.pour >= 1", 4000);
        await sleep(600);
        const dA = await a.eval('__e2e.dye()'), dB = await b.eval('__e2e.dye()');
        const gone = await b.eval("!textOverlays.getPeerLines().some(function(p){return p.content==='POUR';})");
        check(gone, 'the fluidized line leaves B\'s canvas (hidden on A)');
        check(dA.mass > 1 && dB.mass > 0.85 * dA.mass && dB.mass < 1.15 * dA.mass, 'B got the same amount of dye', { A: +dA.mass.toFixed(1), B: +dB.mass.toFixed(1), before: +d0.toFixed(2) });
        check(near(dA.cx, dB.cx, 0.01) && near(dA.cy, dB.cy, 0.01) && corr(dA.grid, dB.grid) > 0.95, 'in the same place and shape', { corr: +corr(dA.grid, dB.grid).toFixed(3), A: [+dA.cx.toFixed(3), +dA.cy.toFixed(3)], B: [dB.cx && +dB.cx.toFixed(3), dB.cy && +dB.cy.toFixed(3)] });

        // ── 4. A held hotkey: every pour of the flow crosses ──────────
        await a.eval("clearCanvas(); window.__L3 = textOverlays.add({content:'Q', x:0.7, y:0.3, fontSize:80, color:'#00ffcc', visible:false}).id; textOverlays.setHotkey(__L3, {hotkey:'KeyQ', hotkeyAction:'pour', hotkeyAt:'arranged'}); if(isPaused) togglePause(); 1");
        await b.eval('if(isPaused) togglePause(); 1');
        await a.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await a.eval("document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1");
        const sent0 = await a.eval('__e2e.sent.pour'), got0 = await b.eval('__e2e.got.pour');
        await a.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyQ', key: 'q', windowsVirtualKeyCode: 81 });
        await a.send('Input.dispatchKeyEvent', { type: 'char', text: 'q', key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81 });
        for (let i = 0; i < 10; i++) { await sleep(50); await a.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyQ', key: 'q', windowsVirtualKeyCode: 81, autoRepeat: true }); }
        await a.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyQ', key: 'q', windowsVirtualKeyCode: 81 });
        await sleep(1200);
        const sentN = (await a.eval('__e2e.sent.pour')) - sent0, gotN = (await b.eval('__e2e.got.pour')) - got0;
        check(sentN >= 5 && gotN === sentN, 'a ~0.5 s hold: every pour A laid, B laid', { sent: sentN, landed: gotN });

        // ── 5. Take turns: a watcher's text waits for their turn ─────
        await a.eval('toggleTurns(); 1');
        await until(a, 'turnsOn && isMyTurn()', 5000);
        await until(b, 'turnsOn && !isMyTurn() && window.__mpTurnBlocked', 5000);
        await b.eval("window.__BL = textOverlays.add({content:'WAITING', x:0.25, y:0.25, fontSize:70, collider:true}).id");
        await sleep(1500);
        check(await a.eval("!textOverlays.getPeerLines().some(function(p){return p.content==='WAITING';})"), 'turns: B\'s new line does not reach A out of turn');
        const toast = await b.eval("(document.getElementById('mpTurnToast')||{}).textContent||''");
        check(/Saved for your turn/.test(toast), 'B is told it is saved for their turn', { toast });
        check(await b.eval('textOverlays.fluidize(__BL) === false'), 'turns: B cannot pour out of turn');
        await a.eval('passTurn(); 1');
        await until(b, 'isMyTurn() && !window.__mpTurnBlocked', 5000);
        const arrived = await until(a, "textOverlays.getPeerLines().some(function(p){return p.content==='WAITING';})", 4000);
        check(!!arrived, 'the brush reaches B → B\'s line reaches A');
        await sleep(700);
        const oA5 = await a.eval('__e2e.obs()'), oB5 = await b.eval('__e2e.obs()');
        check(near(oA5.n, oB5.n, 0.1 * oB5.n) && corr(oA5.grid, oB5.grid) > 0.97, 'both walls stand on both canvases', { A: oA5.n, B: oB5.n, corr: +corr(oA5.grid, oB5.grid).toFixed(3) });

        // B (holder) builds a collider; passes; deletes it out of turn; the
        // removal waits and lands when the brush comes back.
        await b.eval("window.__BW = collisionLayers.addFromDepth((function(){var w=64,h=40,d=new Uint8Array(w*h); for(var y=8;y<32;y++)for(var x=40;x<60;x++)d[y*w+x]=255; return {data:d,width:w,height:h};})(), {name:'B wall'}); 1");
        const bw = await until(a, "window.layers.some(function(l){return l.__peerOwner && /B wall/.test(l.title);})", 4000);
        check(!!bw, 'B\'s collider (holder) reaches A');
        await b.eval('passTurn(); 1');
        await until(b, 'window.__mpTurnBlocked', 4000);
        await b.eval('deleteLayer(__BW); 1');
        await sleep(1500);
        check(await a.eval("window.layers.some(function(l){return l.__peerOwner && /B wall/.test(l.title);})"), 'turns: B\'s out-of-turn delete waits (A still has the wall)');
        await a.eval('passTurn(); 1');
        await until(b, '!window.__mpTurnBlocked', 4000);
        const removed = await until(a, "!window.layers.some(function(l){return l.__peerOwner && /B wall/.test(l.title);})", 4000);
        check(!!removed, 'the brush reaches B → the staged delete lands on A');
        await a.eval('if (turnsOn) toggleTurns(); 1');   // the host stops the rotation
        await until(a, '!turnsOn', 4000);
        await until(b, '!turnsOn && !window.__mpTurnBlocked', 4000);

        // ── 6. A Paint Collider wall (GPU-bound Mask) ─────────────────
        await a.eval(String.raw`(function(){
            var c=document.createElement('canvas'); c.width=400; c.height=250; var x=c.getContext('2d');
            x.fillStyle='#fff'; x.beginPath(); x.arc(300,70,40,0,Math.PI*2); x.fill();
            window.__MID = Masks.importCoverage(c, 'e2e');
            collisionLayers.setMaskLive(true, {rebind:true});
            window.__MW = window.layers.filter(function(l){return l.isCollision && l.collisionSource && l.collisionSource.id===__MID;})[0].index;
            return __MW; })()`);
        await sleep(1800);
        const oA6 = await a.eval('__e2e.obs()'), oB6 = await b.eval('__e2e.obs()');
        check(oB6.n > 0.85 * oA6.n && oB6.n < 1.15 * oA6.n && corr(oA6.grid, oB6.grid) > 0.95, 'a Paint Collider wall reaches B as painted', { A: oA6.n, B: oB6.n, corr: +corr(oA6.grid, oB6.grid).toFixed(3) });
        // "Paint" more into the Mask (a stroke end fires __onMaskMutated).
        await a.eval(String.raw`(function(){
            var f=Masks.getFBO(__MID), c=document.createElement('canvas'); c.width=f.width; c.height=f.height; var x=c.getContext('2d');
            x.fillStyle='#fff'; x.beginPath(); x.arc(f.width*0.75,f.height*0.28,f.width*0.1,0,Math.PI*2); x.fill(); x.fillRect(f.width*0.1,f.height*0.8,f.width*0.3,f.height*0.08);
            gl.bindTexture(gl.TEXTURE_2D,f.texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,c);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.bindTexture(gl.TEXTURE_2D,null);
            window.__onMaskMutated(__MID); return 1; })()`);
        await sleep(2000);
        const oA7 = await a.eval('__e2e.obs()'), oB7 = await b.eval('__e2e.obs()');
        // The new paint repeats the first circle and adds a bar, so the wall
        // grows by the bar (~15%): B has to grow with it, not stay put.
        check(oA7.n > oA6.n * 1.08 && oB7.n > oB6.n * 1.08 && oB7.n > 0.9 * oA7.n && oB7.n < 1.1 * oA7.n && corr(oA7.grid, oB7.grid) > 0.95,
            'painting more into it updates B\'s wall', { A: [oA6.n, oA7.n], B: [oB6.n, oB7.n], corr: +corr(oA7.grid, oB7.grid).toFixed(3) });
        // Collision OFF / ON.
        await a.eval('toggleImageLayerMask(__MW); 1');
        const off = await until(b, "!window.layers.some(function(l){return l.__peerOwner && /Mask Collision/.test(l.title);})", 4000);
        check(!!off, 'Collision OFF on A takes the wall off B');
        await a.eval('toggleImageLayerMask(__MW); 1');
        const on = await until(b, "window.layers.some(function(l){return l.__peerOwner && /Mask Collision/.test(l.title);})", 4000);
        check(!!on, 'Collision ON puts it back');

        // ── 7. An edited mask (shapes only, no depth map) ─────────────
        await a.eval(String.raw`(function(){
            var cv=document.getElementById('canvas');
            window.__SW = collisionLayers.addFromDepth({data:new Uint8Array(64*40),width:64,height:40}, {name:'Star wall'});
            var l=window.layers.find(function(x){return x.index===__SW;});
            l.mask.shapes=[{type:'star', x:cv.width*0.08, y:cv.height*0.08, width:cv.width*0.18, height:cv.width*0.18}];
            collisionLayers.updateObstacleFromLayers(); return __SW; })()`);
        await sleep(1800);
        const star = await b.eval("(function(){var l=window.layers.find(function(x){return x.__peerOwner && /Star wall/.test(x.title);}); if(!l) return null; var s=l.mask.shapes[0]; var n=0; for(var i=0;i<s.depthData.length;i++) if(s.depthData[i]>128) n++; return {n:n, w:s.depthWidth, h:s.depthHeight};})()");
        check(!!star && star.n > 50, 'a shapes-only (edited) collider reaches B with its shape', star);

        // ── 7b. B edits A's wall; it lands on A's own layer ───────────
        const RECT = "(function(x0,y0,x1,y1){var w=64,h=40,d=new Uint8Array(w*h); for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)d[y*w+x]=255; return {data:d,width:w,height:h};})";
        await a.eval("window.__AW = collisionLayers.addFromDepth(" + RECT + "(26,6,38,14), {name:'A wall'}); 1");
        await until(b, "window.layers.some(function(l){return l.__peerOwner && /A wall/.test(l.title);})", 4000);
        await sleep(800);   // B's copy is baselined
        const copyIdx = "window.layers.filter(function(l){return l.__peerOwner && /A wall/.test(l.title);})[0].index";
        await b.eval("(function(){ var l = window.layers.find(function(x){return x.index===" + copyIdx + ";}); l.collisionStrength = 0.35; l.collisionMode = 'slow'; l.x = (l.x||0) + 60; collisionLayers.updateObstacleFromLayers(); return 1; })()");
        const ed = await until(a, "(function(){ var l = window.layers.find(function(x){return x.index===__AW;}); return (l && Math.abs(l.collisionStrength-0.35)<1e-3 && l.collisionMode==='slow') ? {x:l.x, str:l.collisionStrength, mode:l.collisionMode} : null; })()", 4000);
        check(!!ed && Math.abs(ed.x - 60) < 1.5, 'B\'s tweak of A\'s wall lands on A\'s own layer (strength, mode, move)', ed);
        check(/edited your wall/.test(await a.eval("(document.getElementById('mpTurnToast')||{}).textContent||''")), 'A is told B edited their wall');
        await sleep(900);
        const oA8 = await a.eval('__e2e.obs()'), oB8 = await b.eval('__e2e.obs()');
        check(corr(oA8.grid, oB8.grid) > 0.95, 'and both canvases hold the moved wall', { corr: +corr(oA8.grid, oB8.grid).toFixed(3) });
        // Reshape: B redraws A's wall as a star.
        await b.eval("(function(){ var cv=document.getElementById('canvas'); var l = window.layers.find(function(x){return x.index===" + copyIdx + ";}); l.mask.shapes=[{type:'star', x:cv.width*0.62, y:cv.height*0.55, width:cv.width*0.2, height:cv.width*0.2}]; collisionLayers.updateObstacleFromLayers(); return 1; })()");
        await sleep(2000);
        const oA9 = await a.eval('__e2e.obs()'), oB9 = await b.eval('__e2e.obs()');
        const aStar = await a.eval("(function(){ var l = window.layers.find(function(x){return x.index===__AW;}); var s=l.mask.shapes; return {shapes:s.length, type:s[0].type, n:(function(){var n=0; for(var i=0;i<s[0].depthData.length;i++) if(s[0].depthData[i]>128) n++; return n;})()}; })()");
        check(aStar.type === 'depth-mask' && aStar.n > 200 && corr(oA9.grid, oB9.grid) > 0.95, 'B reshapes A\'s wall → A\'s layer takes the new shape', { A: aStar, corr: +corr(oA9.grid, oB9.grid).toFixed(3) });
        // Collision OFF and delete, from B, on A's wall: A keeps the layer, switched off.
        await b.eval('toggleImageLayerMask(' + copyIdx + '); 1');
        const offA = await until(a, "(function(){ var l = window.layers.find(function(x){return x.index===__AW;}); return l && l.mask && l.mask.enabled === false; })()", 4000);
        check(!!offA, 'B switches A\'s wall off → switched off on A');
        await b.eval('toggleImageLayerMask(' + copyIdx + '); 1');
        const onA = await until(a, "(function(){ var l = window.layers.find(function(x){return x.index===__AW;}); return l && l.mask && l.mask.enabled === true; })()", 4000);
        check(!!onA, 'and back on');
        await sleep(600);
        await b.eval('deleteLayer(' + copyIdx + '); 1');
        const keptOff = await until(a, "(function(){ var l = window.layers.find(function(x){return x.index===__AW;}); return l && l.mask && l.mask.enabled === false; })()", 4000);
        check(!!keptOff, 'B deletes A\'s wall → A keeps the layer, switched off (not deleted)');
        check(await b.eval("!window.layers.some(function(l){return l.__peerOwner && /A wall/.test(l.title);})"), 'and B no longer holds it');
        await a.eval('toggleImageLayerMask(__AW); 1');
        const back = await until(b, "window.layers.some(function(l){return l.__peerOwner && /A wall/.test(l.title);})", 4000);
        check(!!back, 'A switches it back on → it returns to the room');

        // ── 7c. B edits A's text line; it lands on A's own line ───────
        await a.eval("window.__AL = textOverlays.add({content:'EDIT ME', x:0.62, y:0.3, fontSize:60, collider:true}).id; 1");
        const lkey = (await a.eval('clientId')) + '|' + (await a.eval('__AL'));
        await until(b, "!!textOverlays.get('" + lkey + "')", 4000);
        const listed = await b.eval("(document.getElementById('textOverlayList')||{}).textContent||''");
        check(/In the room/.test(listed) && /EDIT ME/.test(listed), 'B\'s Text panel lists A\'s line under "In the room"', { listed: listed.slice(0, 80) });
        const audit = await b.eval("(function(){ var r = window.auditButtons ? auditButtons() : null; var rows = Array.prototype.slice.call(document.querySelectorAll('#textOverlayList button')); var bad = rows.filter(function(el){ return ['color','background','background-color','border-color'].some(function(p){ return !!el.style.getPropertyValue(p); }); }).map(function(el){ return el.textContent; }); return { total: r && r.total, clean: r && r.clean, inline: r ? r.inline.length : null, listButtonsWithInlineColour: bad }; })()");
        check(audit.listButtonsWithInlineColour.length === 0, 'button audit: the room rows carry no colours of their own', audit);
        await b.eval("textOverlays.select('" + lkey + "'); textOverlays.update('" + lkey + "', {content:'EDITED', fontSize:72, colliderMode:'block'}); 1");
        const le = await until(a, "(function(){ var o = textOverlays.get(__AL); return (o && o.content==='EDITED') ? {fs:o.fontSize, mode:o.colliderMode, vis:o.visible} : null; })()", 4000);
        check(!!le && Math.abs(le.fs - 72) < 0.01 && le.mode === 'block', 'B edits A\'s text → A\'s own line changes', le);
        check(/edited your text/.test(await a.eval("(document.getElementById('mpTurnToast')||{}).textContent||''")), 'A is told B edited their text');
        // Drag it in arrange mode with real mouse input.
        const x0 = await a.eval('textOverlays.get(__AL).x');
        await b.eval("textOverlays.openArrange('" + lkey + "'); 1");
        await sleep(300);
        const box = await b.eval("(function(){ var e=document.querySelector('[data-peer-line=\"" + lkey + "\"]'); var r=e.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()");
        await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 8; i++) await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 15, y: box.y, button: 'left', buttons: 1 });
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 120, y: box.y, button: 'left', buttons: 0, clickCount: 1 });
        await b.eval('textOverlays.closeArrange(); 1');
        const areaW = await a.eval("document.getElementById('canvas-area').getBoundingClientRect().width");
        const moved = await until(a, "Math.abs(textOverlays.get(__AL).x - " + x0 + ") > 0.02 ? textOverlays.get(__AL).x : null", 4000);
        check(!!moved && Math.abs((moved - x0) * areaW - 120) < 3, 'B drags A\'s line on the canvas → A\'s line moves the same', { dx_px: moved && +((moved - x0) * areaW).toFixed(1) });
        await sleep(700);
        const oA10 = await a.eval('__e2e.obs()'), oB10 = await b.eval('__e2e.obs()');
        check(corr(oA10.grid, oB10.grid) > 0.95, 'the moved text wall matches on both canvases', { corr: +corr(oA10.grid, oB10.grid).toFixed(3) });
        await b.eval("textOverlays.remove('" + lkey + "'); 1");
        const hid = await until(a, "(function(){ var o = textOverlays.get(__AL); return o && o.visible === false; })()", 4000);
        check(!!hid, 'B removes A\'s line → A keeps it, hidden (the eye brings it back)');
        check(await b.eval("!textOverlays.get('" + lkey + "')"), 'and it leaves B\'s canvas');

        // ── 7d. Out of turn, B's tweak waits for B's turn ──────────────
        await a.eval('toggleTurns(); 1');
        await until(b, 'turnsOn && window.__mpTurnBlocked', 5000);
        await sleep(500);
        await b.eval("(function(){ var l = window.layers.find(function(x){return x.__peerOwner && /A wall/.test(x.title);}); l.collisionStrength = 0.5; collisionLayers.updateObstacleFromLayers(); return 1; })()");
        await sleep(1500);
        check(await a.eval("Math.abs(window.layers.find(function(x){return x.index===__AW;}).collisionStrength - 0.5) > 1e-3"), 'turns: B\'s tweak of A\'s wall waits (A unchanged)');
        await a.eval('passTurn(); 1');
        const landed = await until(a, "Math.abs(window.layers.find(function(x){return x.index===__AW;}).collisionStrength - 0.5) < 1e-3", 4000);
        check(!!landed, 'the brush reaches B → the tweak lands on A');
        await a.eval('if (turnsOn) toggleTurns(); 1');
        await until(b, '!turnsOn && !window.__mpTurnBlocked', 5000);

        // ── 8. A reconnect does not double what B brought ─────────────
        await b.eval("window.__BW2 = collisionLayers.addFromDepth((function(){var w=64,h=40,d=new Uint8Array(w*h); for(var y=20;y<36;y++)for(var x=4;x<20;x++)d[y*w+x]=255; return {data:d,width:w,height:h};})(), {name:'B second'}); 1");
        await until(a, "window.layers.some(function(l){return l.__peerOwner && /B second/.test(l.title);})", 4000);
        const oldB = await b.eval('clientId');
        // A blip, as the network delivers one: a 1006 close event on the live
        // socket, which runs B's own drop-and-reconnect path. (A client-side
        // partySocket.close() would do nothing useful here: the local relay
        // never answers a client's close frame, so the socket sits in CLOSING
        // and the close event never fires.)
        await b.eval("partySocket.dispatchEvent(new CloseEvent('close', {code: 1006, reason: 'e2e blip'})); 1");
        const newB = await until(b, "isMultiplayerEnabled && clientId !== '" + oldB + "' && clientId", 15000);
        check(!!newB && newB !== oldB, 'B reconnected with a new connection id');
        await sleep(2200);
        const counts = await a.eval("({lines: textOverlays.getPeerLines().filter(function(p){return p.content==='WAITING';}).length, walls: window.layers.filter(function(l){return l.__peerOwner && /B second/.test(l.title);}).length, owners: textOverlays.getPeerLines().map(function(p){return p.owner;})})");
        check(counts.lines === 1 && counts.walls === 1, 'after the reconnect A holds exactly one of B\'s line and wall', counts);

        // ── 9. Leaving takes it all ───────────────────────────────────
        await b.eval('disconnectMultiplayer(); 1');
        const left = await until(a, "textOverlays.getPeerLines().length === 0 && !window.layers.some(function(l){return l.__peerOwner;})", 5000);
        check(!!left, 'B leaves → A drops B\'s lines and walls');
        check(await b.eval("textOverlays.getPeerLines().length === 0 && !window.layers.some(function(l){return l.__peerOwner;})"), 'B, having left, holds nothing of A\'s');

        const eA = await a.eval('__e2e.errs'), eB = await b.eval('__e2e.errs');
        const real = (arr) => arr.filter((s) => !/favicon|ERR_|net::|Failed to load resource|onnx|ort-wasm|WebGPU/i.test(s));
        check(real(eA).length === 0 && real(eB).length === 0, 'no page errors', { A: real(eA).slice(0, 5), B: real(eB).slice(0, 5) });
    } catch (e) {
        fails++;
        log('ERROR', e && e.stack || e);
    } finally {
        for (const X of [A, B]) {
            if (!X) continue;
            try { X.page.close(); } catch (_) {}
            try { X.proc.kill(); } catch (_) {}
            try { spawn('taskkill', ['/PID', String(X.proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
        }
        srv.close();
        await sleep(1200);
        for (const X of [A, B]) { if (X) { try { fs.rmSync(X.profile, { recursive: true, force: true }); } catch (_) {} } }
        log(fails ? `DONE ${passes} passed, ${fails} FAILED` : `DONE all ${passes} checks passed`);
        process.exit(fails ? 1 : 0);
    }
})();
