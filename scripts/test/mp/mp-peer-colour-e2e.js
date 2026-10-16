// End-to-end: a peer's stroke lands in the PEER's colours (2026-10-15).
// Found recording the trailer: three artists painted teal, gold and violet,
// the wire carried those colours, and the recorder painted every one of
// their strokes coral, its own colour. Remote dabs went through the
// receiver's Multi-Brush arm colours, so once the receiver's arm 1 was on a
// picked colour ('fixed', which any colour pick sets) every peer's paint
// came out in it.
//
// Two separate headless Chromes (separate profiles) run this working tree in
// one room on a local relay. The checks read the receiver's DYE texture, not
// the wire:
//
//   * receiver arm 1 = picked red, sender picks blue: the peer stroke lands
//     blue on the receiver, as it does on the sender's own canvas;
//   * the sender's own per-arm colours ride along: 4 radial arms, one of them
//     green, land blue and green on a receiver whose four arms are all set to
//     other colours, in the same proportions as on the sender's canvas;
//   * a message from an older build (no per-arm colours) and a legacy press
//     message (no dab train) land in the message's colour too;
//   * the receiver's own brush is untouched afterwards: its stroke is red and
//     its arm settings are what they were.
//
//   node node_modules/wrangler/bin/wrangler.js dev --port 8788 --ip 127.0.0.1
//   node scripts/test/mp/mp-peer-colour-e2e.js
//
// Env: MP_HOST (default 127.0.0.1:8788), CHROME. ~30 s. The static server is
// built in (repo root, no-store).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, waitReady } = require('../cdp.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RELAY = process.env.MP_HOST || '127.0.0.1:8788';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
let fails = 0, passes = 0;
function check(ok, msg, extra) {
    if (ok) passes++; else fails++;
    log((ok ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
}

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

// Page kit: errors, the dye by channel, a mouse stroke, and the splat
// messages this page receives.
const KIT = String.raw`(function(){
  if (window.__pc) return 'kit already';
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  // Channel sums over every dyed texel: the stroke's colour mix, whatever
  // the flow model or the brush did to its strength.
  function dye(){
    var f=density.read,w=f.width,h=f.height,px=new Float32Array(w*h*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    var r=0,g=0,b=0,n=0;
    for(var i=0;i<px.length;i+=4){ var v=Math.max(px[i],px[i+1],px[i+2]); if(v>0.002){ r+=Math.max(0,px[i]); g+=Math.max(0,px[i+1]); b+=Math.max(0,px[i+2]); n++; } }
    var s=r+g+b;
    return { n:n, mass:s, r:s?r/s:0, g:s?g/s:0, b:s?b/s:0 };
  }
  function stroke(u0,v0,u1,v1,steps,ms){
    return new Promise(function(done){
      var c=document.getElementById('canvas'), r=c.getBoundingClientRect(), i=0;
      var ev=function(t,u,v,b){ c.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,composed:true,clientX:r.left+u*r.width,clientY:r.top+v*r.height,pointerId:77,pointerType:'mouse',button:0,buttons:b,isPrimary:true,pressure:b?0.5:0})); };
      ev('pointerdown',u0,v0,1);
      var tick=setInterval(function(){ i++; var t=i/steps; ev('pointermove',u0+(u1-u0)*t,v0+(v1-v0)*t,1);
        if(i>=steps){ clearInterval(tick); ev('pointerup',u1,v1,0); done(1); } }, ms/steps);
    });
  }
  var got=[];
  var q=window.enqueueRemoteSplat;
  window.enqueueRemoteSplat=function(d){ try{ got.push(JSON.parse(JSON.stringify(d.data||{}))); }catch(_){} return q.apply(this,arguments); };
  window.__pc={errs:errs,dye:dye,stroke:stroke,got:got};
  return 'kit ok';
})()`;

async function launch(port, url, name) {
    const profile = path.join(os.tmpdir(), 'fluid-mp-colour-' + name + '-' + process.pid);
    const proc = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
        '--window-size=1400,900', '--no-first-run', '--no-default-browser-check',
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
    for (let i = 0; i < 120; i++) {
        const ok = await page.eval("!!(window.__scriptsReady && typeof createRoom==='function' && typeof enqueueRemoteSplat==='function' && typeof setActiveBrushColorMode==='function' && document.getElementById('mixer-strip'))").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    await until(page, "(function(){var s=document.getElementById('splash-screen'); return !s || getComputedStyle(s).display==='none' || getComputedStyle(s).opacity==='0';})()", 9000);
    await page.eval("(function(){var s=document.getElementById('splash-screen'); if(s) s.style.display='none'; var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    const kit = await page.eval(KIT);
    const host = await page.eval('PARTYKIT_HOST');
    log(name + ' ready', kit, 'relay=' + host);
    if (host !== RELAY) throw new Error(name + ' is not on relay ' + RELAY + ': ' + host);
    return { proc, page, profile, name };
}

async function until(page, expr, ms = 6000, every = 120) {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) {
        v = await page.eval(expr).catch(() => undefined);
        if (v) return v;
        await sleep(every);
    }
    return v;
}

const SET = (id, v) => "(function(){var e=document.getElementById(" + JSON.stringify(id) + "); if(!e) return 'missing'; e.value=" + JSON.stringify(String(v)) +
    "; if(e.type==='range') e.style.setProperty('--val', e.value); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return e.value;})()";
// A colour pick, as a hand makes it: arm 1 turns to that colour ('fixed').
const PICK = (hex) => "(function(){var e=document.getElementById('colorPicker'); e.value=" + JSON.stringify(hex) + "; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return JSON.stringify(multiArmColors[0]);})()";
// Arms past the first, set straight on the panel's model.
const ARMS = (list) => "(function(){var L=" + JSON.stringify(list) + "; for(var i=0;i<L.length;i++){ if(!L[i]) continue; multiArmColors[i]=Object.assign({}, multiArmColors[i]||{}, L[i]); } if(window.refreshArmColorRows) refreshArmColorRows(); return multiArmColors.length;})()";
const CLEAR = "(function(){ clearCanvas(); return 1; })()";
const fr = (d) => ({ r: +d.r.toFixed(3), g: +d.g.toFixed(3), b: +d.b.toFixed(3), n: d.n, mass: +d.mass.toFixed(1) });
// As much dye on the peer as on the painter's own canvas.
const sameMass = (p, o) => o.mass > 0 && p.mass / o.mass > 0.8 && p.mass / o.mass < 1.25;

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY);
    let A = null, B = null;
    try {
        // A receives, B paints.
        [A, B] = await Promise.all([launch(9391, url, 'A'), launch(9392, url, 'B')]);
        const a = A.page, b = B.page;

        await a.eval('createRoom(); 1');
        const code = await until(a, 'isMultiplayerEnabled && clientId && currentRoom', 10000);
        check(/^[A-Z0-9]{6}$/.test(code || ''), 'A started room ' + code);
        await b.eval("joinRoom('" + code + "'); 1");
        check(!!await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000) && !!await until(a, 'connectedClients === 2', 6000), 'B joined: two in the room');
        await sleep(1500);   // the welcome's glides land before anything is measured

        // No decay while measuring (a room setting, so both canvases), one
        // arm, radial, on both.
        await a.eval(SET('densityDissipation', 1));
        for (const p of [a, b]) {
            await p.eval(SET('multiplier', 1));
            await p.eval(SET('symmetryMode', 'radial'));
        }
        await sleep(1300);

        // ── 1. One arm: receiver picked red, sender picked blue ─────────
        const aArm = await a.eval(PICK('#ff0000'));
        const bArm = await b.eval(PICK('#0000ff'));
        check(/"mode":"fixed"/.test(aArm) && /ff0000/.test(aArm) && /"mode":"fixed"/.test(bArm), 'a colour pick puts arm 1 on that colour (fixed), on both', { A: aArm, B: bArm });
        await a.eval(CLEAR); await b.eval(CLEAR);
        await sleep(400);
        await a.eval('__pc.got.length = 0; 1');
        await b.eval('__pc.stroke(0.3, 0.5, 0.7, 0.5, 24, 500)');
        await sleep(1800);
        const wire = await a.eval("__pc.got.filter(function(d){ return Array.isArray(d.color); }).map(function(d){ return d.color; })");
        check(wire.length >= 2 && wire.every((c) => c[2] > 0.5 && c[0] < 0.1), 'the wire carries blue', wire.slice(0, 3));
        const own1 = await b.eval('__pc.dye()');
        const peer1 = await a.eval('__pc.dye()');
        check(own1.n > 50 && own1.b > 0.9, 'B\'s own stroke is blue on B', fr(own1));
        check(peer1.n > 50 && peer1.b > 0.9 && peer1.r < 0.05, 'B\'s stroke lands blue on A, whose arm 1 is red', fr(peer1));
        check(sameMass(peer1, own1), 'and as strongly as on B', { A: +peer1.mass.toFixed(1), B: +own1.mass.toFixed(1) });

        // ── 2. Four arms, the sender's own arm colours ─────────────────
        // B: arms 1, 3, 4 blue (arm 1 picked, the others follow it), arm 2
        // green. A: all four arms set to colours B never used.
        for (const p of [a, b]) await p.eval(SET('multiplier', 4));
        await b.eval(ARMS([null, { mode: 'fixed', color: '#00ff00' }, { mode: 'main' }, { mode: 'main' }]));
        await a.eval(ARMS([null, { mode: 'fixed', color: '#ffff00' }, { mode: 'fixed', color: '#ff00ff' }, { mode: 'fixed', color: '#ff8000' }]));
        await sleep(300);
        await a.eval(CLEAR); await b.eval(CLEAR);
        await sleep(400);
        await a.eval('__pc.got.length = 0; 1');
        await b.eval('__pc.stroke(0.55, 0.35, 0.7, 0.45, 20, 400)');
        await sleep(1800);
        const own2 = await b.eval('__pc.dye()');
        const peer2 = await a.eval('__pc.dye()');
        const acSent = await a.eval("__pc.got.map(function(d){ return d.ac || null; }).filter(Boolean).slice(0, 2)");
        log('per-arm colours on the wire:', JSON.stringify(acSent));
        check(own2.n > 50 && own2.g > 0.15 && own2.b > 0.5, 'B paints blue and green with four arms on B', fr(own2));
        const off = Math.max(Math.abs(peer2.r - own2.r), Math.abs(peer2.g - own2.g), Math.abs(peer2.b - own2.b));
        check(peer2.n > 50 && peer2.r < 0.05 && off < 0.08 && sameMass(peer2, own2), 'and the same blue and green land on A, as strongly, none of A\'s arm colours', { A: fr(peer2), B: fr(own2), off: +off.toFixed(3) });

        // ── 2b. B replays that stroke to the room ───────────────────────
        await a.eval(CLEAR); await b.eval(CLEAR);
        await sleep(400);
        const replayed = await b.eval("typeof replayStroke === 'function' ? (replayStroke(true), 1) : 0");
        check(replayed === 1, 'B replays its stroke to the room');
        await sleep(2500);
        const ownR = await b.eval('__pc.dye()');
        const peerR = await a.eval('__pc.dye()');
        const offR = Math.max(Math.abs(peerR.r - ownR.r), Math.abs(peerR.g - ownR.g), Math.abs(peerR.b - ownR.b));
        check(ownR.n > 50 && peerR.n > 50 && peerR.r < 0.05 && offR < 0.08 && sameMass(peerR, ownR), 'B\'s broadcast replay lands in B\'s blue and green on A too, as strongly', { A: fr(peerR), B: fr(ownR), off: +offR.toFixed(3) });

        // ── 3. Older senders ────────────────────────────────────────────
        // A dab train with no per-arm colours (a build before this fix), and
        // a press with no train at all (the legacy fields): both in the
        // message's colour on every arm.
        await a.eval(CLEAR);
        await sleep(300);
        await a.eval("(function(){ var dabs=[]; for(var i=0;i<16;i++) dabs.push([0.3+i*0.01, 0.6, 200, 0, 0.004, 1, 1, i*4]); handleRemoteSplat({ clientId: 'old-build', data: { x: 0.45, y: 0.6, dx: 0, dy: 0, color: [0, 0.8, 0.8], mult: 4, radius: 0.004, sym: 'radial', dabs: dabs } }); return 1; })()");
        await sleep(300);
        const old = await a.eval('__pc.dye()');
        check(old.n > 50 && old.r < 0.05 && Math.abs(old.g - old.b) < 0.05, 'an older sender\'s dab train lands in its colour (teal) on all four arms', fr(old));
        await a.eval(CLEAR);
        await sleep(300);
        await a.eval("(function(){ handleRemoteSplat({ clientId: 'old-press', data: { x: 0.4, y: 0.4, dx: 0.001, dy: 0, color: [0.9, 0.7, 0], mult: 4, radius: 0.006, sym: 'radial', down: true } }); return 1; })()");
        await sleep(300);
        const press = await a.eval('__pc.dye()');
        check(press.n > 10 && press.b < 0.05 && press.g > 0.3, 'a legacy press lands in its colour (gold) on all four arms', fr(press));

        // ── 4. The receiver's own brush is its own ──────────────────────
        const pins = await a.eval("({ peer: window.__peerArmColors === undefined ? 'n/a' : window.__peerArmColors, pin: window.__armColorPin, arms: multiArmColors.slice(0, 4).map(function(c){ return c && (c.mode + ':' + (c.color || '')); }) })");
        check(pins.peer === null || pins.peer === 'n/a', 'no peer colour pin left on A', pins);
        check(JSON.stringify(pins.arms) === JSON.stringify(['fixed:#ff0000', 'fixed:#ffff00', 'fixed:#ff00ff', 'fixed:#ff8000']), 'A\'s arm settings are untouched', pins.arms);
        await a.eval(SET('multiplier', 1));
        await a.eval(CLEAR);
        await sleep(300);
        await a.eval('__pc.stroke(0.3, 0.5, 0.7, 0.5, 24, 500)');
        await sleep(800);
        const mine = await a.eval('__pc.dye()');
        check(mine.n > 50 && mine.r > 0.9, 'A\'s own stroke is still red', fr(mine));

        const eA = await a.eval('__pc.errs'), eB = await b.eval('__pc.errs');
        const real = (arr) => arr.filter((s) => !/favicon|ERR_|net::|Failed to load resource|onnx|ort-wasm|WebGPU|WebSocket/i.test(s));
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
