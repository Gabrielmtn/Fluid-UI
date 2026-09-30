// End-to-end: Gravity Direction across a take-turns room (2026-09-29).
// Gabriel: "I left gravity on, but when we started taking turns, gravity
// stayed on, it seemed additive, not precise." Gravity (the Effects switch and
// its aim pad) was never in the look snapshot the turn mirror sends, so each
// person kept running their OWN gravity under everyone's strokes and the two
// canvases pulled apart. This drives two separate headless Chromes (separate
// profiles, so two device uids) through a real room on a LOCAL relay and reads
// the result on both sides: the switch, the aim, the pad readout, the
// out-of-turn gate, and where a poured line's paint actually is.
//
//   npx wrangler dev --port 8787 --ip 127.0.0.1      (the relay)
//   node scripts/test/mp/mp-gravity-e2e.js
//
// Env: MP_HOST (default 127.0.0.1:8787), CHROME (path), BASELINE=<rev> serves
// js/06b-mp-look.js and js/20-mixer-layout.js from that git revision instead
// of the working tree (the before picture: BASELINE=2920365). ~40 s.
'use strict';
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, waitReady } = require('../cdp.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RELAY = process.env.MP_HOST || '127.0.0.1:8787';
const BASELINE = process.env.BASELINE || '';
const BASELINE_FILES = ['js/06b-mp-look.js', 'js/20-mixer-layout.js'];
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
const overrides = {};
if (BASELINE) {
    for (const f of BASELINE_FILES) overrides['/' + f] = execFileSync('git', ['show', BASELINE + ':' + f], { cwd: REPO, maxBuffer: 64 << 20 });
}
function serve() {
    return new Promise((res) => {
        const srv = http.createServer((req, resp) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const send = (buf) => {
                resp.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
                    'Cache-Control': 'no-store' });
                resp.end(buf);
            };
            if (overrides[p]) return send(overrides[p]);
            const file = path.join(REPO, p);
            if (!file.startsWith(REPO)) { resp.writeHead(403); return resp.end(); }
            fs.readFile(file, (err, buf) => {
                if (err) { resp.writeHead(404); return resp.end(); }
                send(buf);
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

// Page-side kit: a dye readback and an error tap.
const KIT = String.raw`(function(){
  if (window.__e2e) return 'kit already';
  function dye(){
    var f=density.read,w=f.width,h=f.height,px=new Float32Array(w*h*4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,f.fbo); gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,px); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    var m=0,sx=0,sy=0;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=(y*w+x)*4,v=Math.max(px[i],px[i+1],px[i+2]);
      if(v>0.002){m+=v;sx+=x*v;sy+=(h-1-y)*v;}}
    return {mass:m,cx:m?sx/m/w:null,cy:m?sy/m/h:null};   // cy is top-down: falling paint grows it
  }
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  window.__e2e={dye:dye,errs:errs};
  return 'kit ok';
})()`;

// What each side is running, as the sim reads it, plus what the Effects
// switch and pad readout show.
const GRAV = "({on: !!config.AMBIENT_FORCE, x: config.AMBIENT_FORCE_X, y: config.AMBIENT_FORCE_Y," +
    " box: document.getElementById('pressureConstant').checked," +
    " read: (document.getElementById('pressurePadRead')||{}).textContent||''})";

async function launch(port, url, name) {
    const profile = path.join(os.tmpdir(), 'fluid-mp-grav-' + name + '-' + process.pid);
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
        const ok = await page.eval("!!(window.textOverlays && typeof createRoom==='function' && document.getElementById('mixer-strip') && document.getElementById('pressurePadRead'))").catch(() => false);
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

// Set gravity the way a person does: the pad setter when it is wired (the
// fixed build exposes it), else the switch and the config the pad writes.
const setGrav = (on, x, y) => "(function(){ if (typeof setGravityField==='function') { setGravityField(" + on + "," + x + "," + y + "); return 1; }" +
    " config.AMBIENT_FORCE_X=" + x + "; config.AMBIENT_FORCE_Y=" + y + "; var c=document.getElementById('pressureConstant');" +
    " if (c.checked !== " + on + ") c.click(); return 0; })()";
const round = (g) => g && { on: g.on, x: +(+g.x).toFixed(2), y: +(+g.y).toFixed(2), box: g.box, read: g.read };

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY, BASELINE ? '(BASELINE ' + BASELINE + ')' : '(working tree)');
    let A = null, B = null;
    try {
        [A, B] = await Promise.all([launch(9371, url, 'A'), launch(9372, url, 'B')]);
        const a = A.page, b = B.page;

        await a.eval('createRoom(); 1');
        const code = await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        await b.eval("joinRoom('" + code + "'); 1");
        const both = await until(a, 'connectedClients === 2', 10000) && await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000);
        check(!!both, 'A and B share room ' + code);
        await sleep(1500);

        // ── 1. A left gravity on; B never touched it ──────────────────
        await a.eval(setGrav(true, 0, 1));
        await b.eval(setGrav(false, 0, 0));
        await sleep(300);
        log('before turns', { A: round(await a.eval(GRAV)), B: round(await b.eval(GRAV)) });
        await a.eval('toggleTurns(); 1');
        await until(a, 'turnsOn && isMyTurn()', 5000);
        await until(b, 'turnsOn && !isMyTurn() && window.__mpTurnBlocked', 5000);
        const g1 = await until(b, "(function(){var g=" + GRAV + "; return g.on && Math.abs(g.y-1)<1e-6 && g.x===0 ? g : null;})()", 4000);
        const g1b = round(await b.eval(GRAV));
        check(!!g1, 'A holds the brush → watcher B runs A\'s gravity (on, straight down)', g1b);
        check(!!g1 && g1b.box && /^down/.test(g1b.read), 'B\'s Effects switch and pad readout say so', g1b);

        // ── 2. The brush passes; B switches gravity OFF with the real switch ──
        await a.eval('passTurn(); 1');
        await until(b, 'isMyTurn() && !window.__mpTurnBlocked', 5000);
        await until(a, 'window.__mpTurnBlocked', 5000);
        await b.eval("(function(){var c=document.getElementById('pressureConstant'); if (c.checked) c.click(); return 1;})()");
        const g2 = await until(a, "(function(){var g=" + GRAV + "; return !g.on ? g : null;})()", 4000);
        check(!!g2, 'B (painter) switches gravity off → it goes off on A too', round(await a.eval(GRAV)));

        // ── 3. Out of turn, A's own Gravity switch does nothing ───────
        const g3a = round(await a.eval(GRAV));
        await a.eval("document.getElementById('pressureConstant').click(); 1");
        await sleep(300);
        const g3 = round(await a.eval(GRAV));
        check(g3.on === g3a.on && g3.box === g3a.box, 'watcher A\'s Gravity switch is held while B paints', { before: g3a, after: g3 });
        if (g3.on !== g3a.on) await a.eval("document.getElementById('pressureConstant').click(); 1"); // undo, so step 4 measures the mirror alone

        // ── 4. Where the paint goes: B pours a line, both canvases agree ──
        await b.eval('clearCanvas(); 1');
        await sleep(500);
        const m0 = (await a.eval('__e2e.dye()')).mass;
        await b.eval("window.__GL = textOverlays.add({content:'DROP', x:0.5, y:0.3, fontSize:130, color:'#ff3355'}).id; 1");
        await sleep(600);
        await b.eval('textOverlays.fluidize(__GL); 1');
        await sleep(2500);
        const dA = await a.eval('__e2e.dye()'), dB = await b.eval('__e2e.dye()');
        check(dA.mass > 1 && dB.mass > 1 && m0 < 0.05 * dB.mass, 'the pour landed on both canvases',
            { A: +dA.mass.toFixed(1), B: +dB.mass.toFixed(1), aBefore: +m0.toFixed(2) });
        check(dA.cy != null && dB.cy != null && Math.abs(dA.cy - dB.cy) < 0.03,
            'after 2.5 s the paint sits at the same height on both (no leftover pull on A)',
            { A: dA.cy && +dA.cy.toFixed(3), B: dB.cy && +dB.cy.toFixed(3) });

        // ── 5. B aims the pad sideways (no input event: the poll path) ──
        await b.eval(setGrav(true, 1, 0));
        const g5 = await until(a, "(function(){var g=" + GRAV + "; return g.on && Math.abs(g.x-1)<1e-6 && g.y===0 ? g : null;})()", 4500);
        const g5a = round(await a.eval(GRAV));
        check(!!g5 && g5a.box && /^right/.test(g5a.read), 'B aims the pad right → A runs it, switch and readout included', g5a);

        await a.eval('if (turnsOn) toggleTurns(); 1');
        await until(a, '!turnsOn', 4000);
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
