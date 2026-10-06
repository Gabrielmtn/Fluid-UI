// End-to-end: does everyone in a room end up running EXACTLY the same
// settings? (2026-09-29 for take turns, after the Gravity Direction miss;
// 2026-10-06 rewritten for the shared-settings room, which replaced turns.)
//
// Pushing every REGISTERED control to distinctive values on one side only
// can't see state the look never names: the other copy just sits at its
// default, and so does this one if the test never touches it. Gravity hid
// exactly there. So BOTH sides are pushed to DIFFERENT values, and the diff
// is the whole `config` object plus every registry control and the look
// globals, not a list of what we expect to travel. What stays with each
// person (their brush, colour mode, pause / freeze, layout and device
// switches — 06b ROOM_LOOK_PERSONAL, MP_PERF_LOCAL_KEYS) is left out of the
// diff and checked the other way: it must NOT have travelled.
//
//   Round 1  welcome: A and B set apart, then B joins A's room → B matches A.
//   Round 2  A changes everything again → B follows.
//   Round 3  B changes everything → A follows.
//   Round 4  both at once, half the sliders each → both land everywhere.
//   Round 5  a still room sends nothing, whatever animates on its own.
//   Round 6  gravity, switch and aim, both ways.
//   Round 7  per-person: brush, colour mode, freeze, Focus mode stay put.
//
// A key that changes by itself between two reads on one side (an animation)
// is listed apart, not as a mismatch.
//
//   npx wrangler dev --port 8788 --ip 127.0.0.1      (a local relay; or)
//   MP_HOST=swirltogether.com node scripts/test/mp/mp-look-parity-e2e.js
//
// Env: MP_HOST (default 127.0.0.1:8788), CHROME, BASELINE=<rev> (serves the
// BASELINE_FILES from that revision), JSON=<path> writes the raw diffs.
'use strict';
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, waitReady } = require('../cdp.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RELAY = process.env.MP_HOST || '127.0.0.1:8788';
const BASELINE = process.env.BASELINE || '';
const BASELINE_FILES = (process.env.BASELINE_FILES || 'js/06b-mp-look.js,js/20-mixer-layout.js').split(',');
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

// ── Page kit: perturb every control, read every piece of look state ──
// Controls are driven through their REAL elements and events (value + input
// + change; click() for checkboxes), so a handler that fails to write config
// shows up the same way it would for a person.
const KIT = String.raw`(function(){
  if (window.__lp) return 'kit already';
  var R = window.ParamRegistry;
  // Never touched: per-user workflow that deliberately stays local (06b
  // MP_PERF_LOCAL_KEYS + 12 PRESET_SKIP), and switches that need a device or
  // permission a headless page doesn't have (screen capture, microphone) or
  // that rebuild the whole layout (focus / stream format).
  var SKIP = { recMode:1, recPlaybackSpeed:1, statsToggle:1, autoloadSettings:1, brushEraser:1, sketchVisible:1,
    photoSafeToggle:1, preserveFluidOpacity:1, hoverCaptureToggle:1, detachCaptureToggle:1, audioReactToggle:1,
    audioReactSource:1, focusModeToggle:1, streamFormatLock:1,
    // An audio scene (Tunnel) writes its own Density/Velocity Sustain and puts
    // the pre-scene values back on exit; it gets its own round below rather
    // than muddying every other key here.
    audioMode:1 };
  // Resolution picks that stay light on a headless GPU.
  var RES = { visualResolution: ['1024','512','1536'], physicsResolution: ['384','256','512'] };
  function q(v, lo, hi, st){ if (!(st>0)) st=(hi-lo)/100; var n=Math.round((v-lo)/st); var r=lo+n*st; r=Math.max(lo,Math.min(hi,r)); var d=(String(st).split('.')[1]||'').length; return +r.toFixed(Math.min(8,d+1)); }
  function perturb(round, half){
    // round 0..3 → slider fraction and checkbox/select choice per side.
    // half 1 / 2: only the even / odd sliders, and nothing else (round 4).
    var frac = [0.7, 0.3, 0.45, 0.85, 0.2, 0.6][round], out = { set:0, missing:[], skipped:[] };
    Object.keys(R.SLIDERS).forEach(function(id, i){
      if (SKIP[id]) { out.skipped.push(id); return; }
      if (half && (i % 2) !== (half - 1)) return;
      var el=document.getElementById(id); if(!el){ out.missing.push(id); return; }
      var lo=parseFloat(el.min), hi=parseFloat(el.max), st=parseFloat(el.step);
      if(!isFinite(lo)||!isFinite(hi)){ var u=R.SLIDERS[id].ui||R.SLIDERS[id].hard||{}; lo=u.min; hi=u.max; st=u.step; }
      if(!isFinite(lo)||!isFinite(hi)||hi<=lo){ out.missing.push(id); return; }
      // Nudge off the grid by the id so no two sliders share a fraction.
      var h=0; for(var i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))%97;
      var f=Math.max(0.05,Math.min(0.95,frac+(h/97-0.5)*0.1));
      var v=q(lo+f*(hi-lo),lo,hi,st);
      el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      out.set++;
    });
    if (half) return out;
    Object.keys(R.CHECKBOXES).forEach(function(id){
      if (SKIP[id]) { out.skipped.push(id); return; }
      var el=document.getElementById(id); if(!el){ out.missing.push(id); return; }
      var def=R.CHECKBOXES[id].def; if(def===null) def=false;
      var want = (round===0||round===3) ? !def : !!def;   // A round 0: everything off-default; B round 1: defaults
      if (!!el.checked!==want) el.click();
      out.set++;
    });
    Object.keys(R.SELECTS).forEach(function(id){
      if (SKIP[id]) { out.skipped.push(id); return; }
      var el=document.getElementById(id); if(!el){ out.missing.push(id); return; }
      var opts=Array.prototype.map.call(el.options,function(o){return o.value;}).filter(function(v){return v!=='' && v!=='custom';});
      if(!opts.length){ out.missing.push(id); return; }
      var v = RES[id] ? RES[id][round%3] : opts[[1, opts.length-1, Math.floor(opts.length/2), 0][round] % opts.length];
      if (opts.indexOf(v)===-1) v=opts[0];
      el.value=v; el.dispatchEvent(new Event('change',{bubbles:true}));
      out.set++;
    });
    return out;
  }
  function prim(o, depth){
    if (o===null || typeof o==='number' || typeof o==='boolean' || typeof o==='string') return o;
    if (typeof o==='function' || depth>3) return undefined;
    if (Array.isArray(o)) { if (o.length>64) return '[len '+o.length+']'; return o.map(function(v){ var p=prim(v,depth+1); return p===undefined?null:p; }); }
    if (typeof o==='object') { if (o instanceof WebGLTexture || o instanceof HTMLElement) return undefined;
      var r={}; Object.keys(o).forEach(function(k){ var p=prim(o[k],depth+1); if(p!==undefined) r[k]=p; }); return r; }
    return undefined;
  }
  // What stays with each person (06b): the brush sliders and the audio
  // ones, the colour-mode and symmetry switches, layout and device switches.
  function personalId(m, id){
    var P = window.ROOM_LOOK_PERSONAL, local = window.MP_PERF_LOCAL_KEYS || [];
    if (local.indexOf(id) !== -1) return true;
    if (m === 'SLIDERS') return !!(window.isPersonalSlider && isPersonalSlider(id));
    if (m === 'CHECKBOXES') return !!(P && P.checkboxes.indexOf(id) !== -1);
    if (m === 'SELECTS') return !!(P && P.selects.indexOf(id) !== -1);
    return false;
  }
  // Config the personal controls write. The registry names the 1:1 ones;
  // the rest are the brush's own state (05d/05d0/05g/20).
  var PERSONAL_CFG = { SPLAT_RADIUS:1, BRUSH_ANGLE:1, BRUSH_SHAPE_ID:1, BRUSH_TIP:1, SYMMETRY_MODE:1, SYM_SAME_ANGLE:1,
    SYM_FACE_CENTER:1, BRUSH_CONTINUOUS:1, BRUSH_TARGET:1, BRUSH_VELOCITY_ONLY:1, BRUSH_VEL_MODE:1, BRUSH_VEL_STRENGTH:1,
    TRANSPARENT:1, PHOTOSAFE:1 };
  // Filled on first use: the kit can load before 06b does.
  var personalCfgDone = false;
  function personalCfg(){
    if (!personalCfgDone && window.isPersonalSlider) {
      personalCfgDone = true;
      Object.keys(R.SLIDERS).forEach(function(id){ var k = R.SLIDERS[id].configKey; if (k && personalId('SLIDERS', id)) PERSONAL_CFG[k] = 1; });
    }
    return PERSONAL_CFG;
  }
  function personal(){
    var out = {};
    ['SLIDERS','CHECKBOXES','SELECTS'].forEach(function(m){ Object.keys(R[m]).forEach(function(id){ if(!personalId(m, id)) return; var el=document.getElementById(id); if(!el) return; out[id]= m==='CHECKBOXES' ? !!el.checked : el.value; }); });
    out.brushColor = document.getElementById('colorPicker').value;
    out.frozen = !!window.__fluidFrozen; out.paused = !!isPaused;
    out.splatInMode = window.splatInMode; out.replayMode = window.replayMode;
    // A missing arm and a 'main' arm both paint the brush colour (05g
    // resolveArmColor): trailing 'main' arms are the same brush.
    var arms = (window.multiArmColors||[]).map(function(c){ return (c.mode||'main') + (c.mode==='fixed' ? ':' + c.color : ''); });
    while (arms.length && arms[arms.length-1] === 'main') arms.pop();
    out.arms = arms.join(',');
    return out;
  }
  function state(){
    var pc = personalCfg();
    var cfg={}; Object.keys(window.config).forEach(function(k){ if (pc[k]) return; var p=prim(window.config[k],0); if(p!==undefined) cfg[k]=p; });
    var dom={};
    ['SLIDERS','CHECKBOXES','SELECTS'].forEach(function(m){ Object.keys(R[m]).forEach(function(id){ if(personalId(m, id)) return; var el=document.getElementById(id); if(!el) return; dom[id]= m==='CHECKBOXES' ? !!el.checked : el.value; }); });
    var g=function(f){ try { return prim(f(),0); } catch(e){ return 'ERR '+e.message; } };
    var glob={
      kaleidoMode:g(function(){return window.kaleidoMode;}), kaleidoSegments:g(function(){return window.kaleidoSegments;}),
      kAngle:g(function(){return window.kAngle;}), kTwist:g(function(){return window.kTwist;}), kZoom:g(function(){return window.kZoom;}),
      kBlend:g(function(){return window.kBlend;}), kAnimateRot:g(function(){return window.kAnimateRot;}),
      paletteIndex:g(function(){return window.currentPaletteIndex;}),
      lightSource:g(function(){var l=window.lightSource; return l?{x:l.x,y:l.y,enabled:l.enabled}:null;}),
      material:g(function(){return window.MaterialModes&&MaterialModes.getState();}),
      bg:g(function(){return document.getElementById('backgroundColorPicker').value;})
    };
    (window.__lpExtraGlobals||[]).forEach(function(e){ glob[e[0]]=g(e[1]); });
    return {config:cfg, dom:dom, glob:glob};
  }
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  var warns=[]; var cw=console.warn; console.warn=function(){try{var s=Array.prototype.map.call(arguments,String).join(' '); if(/\[mp\]|look mirror|snapshot/i.test(s)) warns.push(s);}catch(_){} return cw.apply(console,arguments);};
  var sent=[]; // room-look messages this page SENT (size + sections)
  window.__lp={perturb:perturb,state:state,personal:personal,errs:errs,warns:warns,sent:sent};
  return 'kit ok';
})()`;

async function launch(port, url, name) {
    const profile = path.join(os.tmpdir(), 'fluid-mp-parity-' + name + '-' + process.pid);
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
        const ok = await page.eval("!!(window.ParamRegistry && typeof createRoom==='function' && typeof isPersonalSlider==='function' && typeof mpGlideTo==='function' && document.getElementById('mixer-strip') && document.getElementById('pressurePadRead'))").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    await page.eval("(function(){var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    const kit = await page.eval(KIT);
    if (process.env.EXTRA) await page.eval(fs.readFileSync(process.env.EXTRA, 'utf8'));
    const host = await page.eval('PARTYKIT_HOST');
    log(name + ' ready', kit, 'relay=' + host);
    if (host !== RELAY) throw new Error(name + ' is not on relay ' + RELAY + ': ' + host);
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

// Two reads per side, 700 ms apart: anything that moved on its own is animated.
async function read(page) {
    const s1 = await page.eval('__lp.state()');
    await sleep(700);
    const s2 = await page.eval('__lp.state()');
    return { s1, s2 };
}
const same = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
    return JSON.stringify(a) === JSON.stringify(b);
};
function diff(painter, watcher) {
    const out = { mismatch: [], animated: [] };
    for (const part of ['config', 'dom', 'glob']) {
        const P1 = painter.s1[part], P2 = painter.s2[part], W1 = watcher.s1[part], W2 = watcher.s2[part];
        const keys = new Set([...Object.keys(P2), ...Object.keys(W2)]);
        for (const k of keys) {
            if (same(P2[k], W2[k])) continue;
            // A wandering light (Light: random) moves itself on every screen;
            // where it is is not a setting (06b captureRoomLook).
            if (part === 'glob' && k === 'lightSource' && (painter.s2.dom.lightMode === 'random' || watcher.s2.dom.lightMode === 'random')) continue;
            const moving = !same(P1[k], P2[k]) || !same(W1[k], W2[k]);
            (moving ? out.animated : out.mismatch).push({ part, key: k, painter: P2[k], watcher: W2[k] });
        }
    }
    return out;
}
const short = (v) => { const s = JSON.stringify(v); return s && s.length > 90 ? s.slice(0, 87) + '...' : s; };
function report(label, d) {
    log(label + ': ' + d.mismatch.length + ' mismatched, ' + d.animated.length + ' animated');
    for (const m of d.mismatch) console.log('         MISMATCH ' + m.part.padEnd(6) + ' ' + m.key.padEnd(28) + ' painter=' + short(m.painter) + '  watcher=' + short(m.watcher));
    for (const m of d.animated) console.log('         animated ' + m.part.padEnd(6) + ' ' + m.key.padEnd(28) + ' painter=' + short(m.painter) + '  watcher=' + short(m.watcher));
}

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY, BASELINE ? '(BASELINE ' + BASELINE + ')' : '(working tree)');
    let A = null, B = null;
    const raw = {};
    try {
        [A, B] = await Promise.all([launch(9381, url, 'A'), launch(9382, url, 'B')]);
        const a = A.page, b = B.page;

        // Every room-look this page sends, re-wrapped after a reconnect.
        const TAP = "(function(){ if (!partySocket || partySocket.__lpTap) return !!partySocket; var s0=partySocket.send.bind(partySocket); partySocket.send=function(m){ try{ var d=JSON.parse(m); if(d.type==='room-look') __lp.sent.push({n:m.length, full:!!d.full, keys:Object.keys(d.snapshot||{}).sort().join(',')}); }catch(_){} return s0(m); }; partySocket.__lpTap=1; return 1; })()";
        const settle = (ms) => sleep(ms);   // glides land in ~1 s; resolution rebuilds take a little longer

        // ── Round 1: the welcome ──────────────────────────────────────
        const pA = await a.eval('__lp.perturb(0)'), pB = await b.eval('__lp.perturb(1)');
        if (process.env.EXTRA_PERTURB) { await a.eval('__lpExtraPerturb(0)'); await b.eval('__lpExtraPerturb(1)'); }
        log('perturbed', { A: pA.set, B: pB.set, missing: pA.missing, skipped: pA.skipped.length });
        await settle(2500);
        const pre = diff(await read(a), await read(b));
        log('before joining: ' + pre.mismatch.length + ' keys differ between A and B (the test\'s spread)');
        const bOwn = await b.eval('__lp.personal()');
        await a.eval('createRoom(); 1');
        const code = await until(a, 'isMultiplayerEnabled && clientId && currentRoom', 10000);
        await b.eval("joinRoom('" + code + "'); 1");
        const both = await until(a, 'connectedClients === 2', 10000) && await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000);
        check(!!both, 'A and B share room ' + code);
        await a.eval(TAP); await b.eval(TAP);
        await settle(4000);
        const r1 = diff(await read(a), await read(b));
        raw.round1 = r1; report('ROUND 1 welcome (B joins A)', r1);
        check(pre.mismatch.length > 50, 'the two sides started far apart (' + pre.mismatch.length + ' keys)');
        check(r1.mismatch.length === 0, 'round 1: B runs A\'s settings after the welcome', { mismatched: r1.mismatch.length });
        const bOwn1 = await b.eval('__lp.personal()');
        const movedOwn = Object.keys(bOwn).filter((k) => !same(bOwn[k], bOwn1[k]));
        check(movedOwn.length === 0, 'and B\'s own brush, colour mode and per-person switches are untouched', movedOwn.map((k) => k + ': ' + bOwn[k] + ' → ' + bOwn1[k]));

        // ── Round 2: A changes everything ─────────────────────────────
        await a.eval('__lp.perturb(2)');
        if (process.env.EXTRA_PERTURB) await a.eval('__lpExtraPerturb(2)');
        await settle(4000);
        const r2 = diff(await read(a), await read(b));
        raw.round2 = r2; report('ROUND 2 A changes everything again', r2);
        check(r2.mismatch.length === 0, 'round 2: B follows A\'s edits', { mismatched: r2.mismatch.length });

        // ── Round 3: B changes everything ─────────────────────────────
        await b.eval('__lp.perturb(3)');
        if (process.env.EXTRA_PERTURB) await b.eval('__lpExtraPerturb(3)');
        await settle(4000);
        const r3 = diff(await read(b), await read(a));
        raw.round3 = r3; report('ROUND 3 B changes everything', r3);
        check(r3.mismatch.length === 0, 'round 3: A follows B\'s edits', { mismatched: r3.mismatch.length });

        // ── Round 4: both at once ─────────────────────────────────────
        await Promise.all([a.eval('__lp.perturb(4, 1)'), b.eval('__lp.perturb(5, 2)')]);
        await settle(4000);
        const r4 = diff(await read(a), await read(b));
        raw.round4 = r4; report('ROUND 4 both at once (A the even sliders, B the odd)', r4);
        check(r4.mismatch.length === 0, 'round 4: two people moving different sliders at once both land on both screens', { mismatched: r4.mismatch.length });

        // ── Round 5: a still room is quiet ────────────────────────────
        // The perturbations left plenty animating on its own (kaleido spin,
        // a wandering light, Light Shift, Breathing): none of it is a setting.
        const animating = await a.eval("({ spin: !!window.kAnimateRot, light: document.getElementById('lightMode').value, shift: document.getElementById('enableLightShift').checked, breath: document.getElementById('breathingToggle').checked })");
        await a.eval('__lp.sent.length = 0; 1'); await b.eval('__lp.sent.length = 0; 1');
        await sleep(4000);
        const quiet = [await a.eval('__lp.sent.length'), await b.eval('__lp.sent.length')];
        check(quiet[0] === 0 && quiet[1] === 0, 'round 5: four still seconds send nothing, with this animating: ' + JSON.stringify(animating), quiet);

        // ── Round 6: gravity, both ways ───────────────────────────────
        const GRAV = "({ on: !!config.AMBIENT_FORCE, x: config.AMBIENT_FORCE_X, y: config.AMBIENT_FORCE_Y, box: document.getElementById('pressureConstant') ? document.getElementById('pressureConstant').checked : null })";
        await a.eval('setGravityField(true, -0.6, 0.4); 1');
        const gB = await until(b, "(function(){ var g=" + GRAV + "; return g.on && Math.abs(g.x + 0.6) < 1e-9 && Math.abs(g.y - 0.4) < 1e-9 ? g : null; })()", 4000);
        check(!!gB && gB.box === true, 'round 6: A switches gravity on and aims it: B runs the same pull, checkbox included', gB);
        await b.eval('setGravityField(true, 0.25, -0.75); 1');
        const gA = await until(a, "(function(){ var g=" + GRAV + "; return g.on && Math.abs(g.x - 0.25) < 1e-9 && Math.abs(g.y + 0.75) < 1e-9 ? g : null; })()", 4000);
        check(!!gA, 'B re-aims: A follows', gA);
        await a.eval("(function(){ var e=document.getElementById('pressureConstant'); if (e && e.checked) e.click(); return 1; })()");
        const gOff = await until(b, '!config.AMBIENT_FORCE', 4000);
        check(!!gOff, 'A switches it off: off for B too');

        // ── Round 7: per-person stays per person ──────────────────────
        const UI7 = "({focus: document.body.classList.contains('focus-mode'), cursor: document.getElementById('cursorToggle').checked, handles: document.getElementById('showCanvasHandles').checked, lock: document.getElementById('lockCanvasBorders').checked, frozen: !!window.__fluidFrozen, brush: document.getElementById('brushSize').value, rnd: document.getElementById('randomColor').checked})";
        const a7 = await a.eval(UI7);
        await b.eval("(function(){ ['focusModeToggle','cursorToggle','showCanvasHandles','lockCanvasBorders','randomColor'].forEach(function(id){ var el=document.getElementById(id); if(el) el.click(); }); toggleFreeze(); var s=document.getElementById('brushSize'); s.value = String(parseFloat(s.value) + 3); s.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
        await sleep(3000);
        const a7b = await a.eval(UI7), b7 = await b.eval(UI7);
        check(JSON.stringify(a7) === JSON.stringify(a7b), 'round 7: B\'s Focus mode, cursor, canvas handles, border lock, Freeze, brush size and colour mode leave A\'s alone', { Abefore: a7, Aafter: a7b, B: b7 });
        await b.eval("(function(){ ['focusModeToggle','cursorToggle','showCanvasHandles','lockCanvasBorders','randomColor'].forEach(function(id){ var el=document.getElementById(id); if(el) el.click(); }); toggleFreeze(); return 1; })()");

        const sA = await a.eval('__lp.sent'), sB = await b.eval('__lp.sent');
        const maxN = Math.max(0, ...sA.map((g) => g.n), ...sB.map((g) => g.n));
        log('room-look sent since round 5', { A: sA.length, B: sB.length, largestBytes: maxN });
        const wA = await a.eval('__lp.warns'), wB = await b.eval('__lp.warns');
        check(wA.length === 0 && wB.length === 0, 'no snapshot shedding / apply warnings', { A: wA.slice(0, 4), B: wB.slice(0, 4) });
        const eA = await a.eval('__lp.errs'), eB = await b.eval('__lp.errs');
        const real = (arr) => arr.filter((s) => !/favicon|ERR_|net::|Failed to load resource|onnx|ort-wasm|WebGPU/i.test(s));
        check(real(eA).length === 0 && real(eB).length === 0, 'no page errors', { A: real(eA).slice(0, 5), B: real(eB).slice(0, 5) });
    } catch (e) {
        fails++;
        log('ERROR', e && e.stack || e);
    } finally {
        if (process.env.JSON) { try { fs.writeFileSync(process.env.JSON, JSON.stringify(raw, null, 1)); } catch (_) {} }
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
