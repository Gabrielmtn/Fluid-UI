// End-to-end: does a take-turns watcher end up running EXACTLY the painter's
// look? (2026-09-29, after the Gravity Direction miss.)
//
// The 2026-09-11 parity check pushed every REGISTERED control to distinctive
// values on the painter only. That can't see state the snapshot never names:
// the watcher's own copy just sits at its default, and so does the painter's
// if the test never touches it. Gravity hid exactly there. So here BOTH sides
// are pushed to DIFFERENT values before the brush moves, and the diff is the
// whole `config` object plus every registry control and the look globals,
// not a list of what we expect to travel.
//
//   Round 1  hand-over: A and B set apart, A starts turns → B must match A.
//   Round 2  live edits: A (holding) changes everything again → B follows.
//   Round 3  the brush passes: B (now holding) sets its own values → A follows.
//
// A key that changes by itself between two reads on one side (an animation)
// is listed apart, not as a mismatch.
//
//   npx wrangler dev --port 8787 --ip 127.0.0.1      (the relay)
//   node scripts/test/mp/mp-look-parity-e2e.js
//
// Env: MP_HOST (default 127.0.0.1:8787), CHROME, BASELINE=<rev> (serves the
// BASELINE_FILES below from that revision; the before picture for the Tunnel
// round is BASELINE=2920365 BASELINE_FILES=js/30-audio-scenes.js), JSON=<path>
// writes the raw diffs.
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
  function perturb(round){
    // round 0/1/2 → slider fraction and checkbox/select choice per side
    var frac = [0.7, 0.3, 0.45, 0.85][round], out = { set:0, missing:[], skipped:[] };
    Object.keys(R.SLIDERS).forEach(function(id){
      if (SKIP[id]) { out.skipped.push(id); return; }
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
    Object.keys(R.CHECKBOXES).forEach(function(id){
      if (SKIP[id]) { out.skipped.push(id); return; }
      var el=document.getElementById(id); if(!el){ out.missing.push(id); return; }
      var def=R.CHECKBOXES[id].def; if(def===null) def=false;
      var want = (round===0||round===3) ? !def : !!def;   // A round 1: everything off-default; B: defaults
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
  function state(){
    var cfg={}; Object.keys(window.config).forEach(function(k){ var p=prim(window.config[k],0); if(p!==undefined) cfg[k]=p; });
    var dom={};
    // Per-person controls stay per person on purpose (06b MP_PERF_LOCAL_KEYS).
    var local=window.MP_PERF_LOCAL_KEYS||[];
    ['SLIDERS','CHECKBOXES','SELECTS'].forEach(function(m){ Object.keys(R[m]).forEach(function(id){ if(local.indexOf(id)!==-1) return; var el=document.getElementById(id); if(!el) return; dom[id]= m==='CHECKBOXES' ? !!el.checked : el.value; }); });
    var g=function(f){ try { return prim(f(),0); } catch(e){ return 'ERR '+e.message; } };
    var glob={
      kaleidoMode:g(function(){return window.kaleidoMode;}), kaleidoSegments:g(function(){return window.kaleidoSegments;}),
      kAngle:g(function(){return window.kAngle;}), kTwist:g(function(){return window.kTwist;}), kZoom:g(function(){return window.kZoom;}),
      kBlend:g(function(){return window.kBlend;}), kAnimateRot:g(function(){return window.kAnimateRot;}),
      paletteIndex:g(function(){return window.currentPaletteIndex;}),
      splatInMode:g(function(){return window.splatInMode;}), splatOutMode:g(function(){return window.splatOutMode;}),
      splatInDist:g(function(){return window.splatInDist;}), splatOutDist:g(function(){return window.splatOutDist;}),
      replayMode:g(function(){return window.replayMode;}), replayTimePeriod:g(function(){return window.replayTimePeriod;}),
      lightSource:g(function(){var l=window.lightSource; return l?{x:l.x,y:l.y,enabled:l.enabled}:null;}),
      // Normalised: a missing arm and a 'main' arm both paint the brush colour
      // (05g resolveArmColor), and cachedColor is a per-stroke cache.
      armColors:g(function(){ var a=(window.multiArmColors||[]).map(function(c){ return {mode:c.mode||'main', color:c.mode==='fixed'?c.color:undefined, push:!!c.push}; });
        while(a.length && a[a.length-1].mode==='main' && !a[a.length-1].push) a.pop(); return a; }),
      material:g(function(){return window.MaterialModes&&MaterialModes.getState();}),
      brushShape:g(function(){return window.BrushShapes&&BrushShapes.activeId&&BrushShapes.activeId();}),
      cos:g(function(){return window.cosOscillator&&cosOscillator.getState();}),
      paused:g(function(){return !!isPaused;}), frozen:g(function(){return !!window.__fluidFrozen;}),
      bg:g(function(){return document.getElementById('backgroundColorPicker').value;}),
      brushColor:g(function(){return document.getElementById('colorPicker').value;})
    };
    (window.__lpExtraGlobals||[]).forEach(function(e){ glob[e[0]]=g(e[1]); });
    return {config:cfg, dom:dom, glob:glob};
  }
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  var warns=[]; var cw=console.warn; console.warn=function(){try{var s=Array.prototype.map.call(arguments,String).join(' '); if(/\[mp\]|look mirror|snapshot/i.test(s)) warns.push(s);}catch(_){} return cw.apply(console,arguments);};
  var got=[]; // look snapshots that ARRIVED (size + sections), to spot shedding
  window.__lp={perturb:perturb,state:state,errs:errs,warns:warns,got:got};
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
        const ok = await page.eval("!!(window.ParamRegistry && typeof createRoom==='function' && document.getElementById('mixer-strip') && document.getElementById('pressurePadRead'))").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    await page.eval("(function(){var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    const kit = await page.eval(KIT);
    if (process.env.EXTRA) await page.eval(fs.readFileSync(process.env.EXTRA, 'utf8'));
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

        await a.eval('createRoom(); 1');
        const code = await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        await b.eval("joinRoom('" + code + "'); 1");
        const both = await until(a, 'connectedClients === 2', 10000) && await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000);
        check(!!both, 'A and B share room ' + code);
        await sleep(1500);

        // Count the look snapshots that arrive (and how big they were).
        const TAP = "(function(){ if (window.__lpTap) return 1; window.__lpTap=1; var orig=applyRemoteLookSnapshot; applyRemoteLookSnapshot=function(s){ try{ __lp.got.push({n:JSON.stringify(s).length, keys:Object.keys(s||{}).sort().join(',')}); }catch(_){} return orig.apply(this,arguments); }; return 1; })()";
        await a.eval(TAP); await b.eval(TAP);

        // ── Round 1: hand-over ────────────────────────────────────────
        const pA = await a.eval('__lp.perturb(0)'), pB = await b.eval('__lp.perturb(1)');
        if (process.env.EXTRA_PERTURB) { await a.eval('__lpExtraPerturb(0)'); await b.eval('__lpExtraPerturb(1)'); }
        log('perturbed', { A: pA.set, B: pB.set, missing: pA.missing, skipped: pA.skipped.length });
        await sleep(2500);   // resolution rebuilds, deferred handlers
        const pre = diff(await read(a), await read(b));
        log('before turns: ' + pre.mismatch.length + ' keys differ between A and B (the test\'s spread)');
        await a.eval('toggleTurns(); 1');
        await until(a, 'turnsOn && isMyTurn()', 5000);
        await until(b, 'turnsOn && !isMyTurn() && window.__mpTurnBlocked', 5000);
        await sleep(4000);
        const r1 = diff(await read(a), await read(b));
        raw.round1 = r1; report('ROUND 1 hand-over (A paints, B watches)', r1);
        check(r1.mismatch.length === 0, 'round 1: B matches A after the hand-over', { mismatched: r1.mismatch.length });

        // ── Round 2: live edits by the holder ─────────────────────────
        await a.eval('__lp.perturb(2)');
        if (process.env.EXTRA_PERTURB) await a.eval('__lpExtraPerturb(2)');
        await sleep(5000);   // 400 ms debounce + the 2 s diff poll, twice over
        const r2 = diff(await read(a), await read(b));
        raw.round2 = r2; report('ROUND 2 live edits (A changes everything again)', r2);
        check(r2.mismatch.length === 0, 'round 2: B follows A\'s live edits', { mismatched: r2.mismatch.length });

        // ── Round 3: the brush passes to B ────────────────────────────
        await a.eval('passTurn(); 1');
        await until(b, 'isMyTurn() && !window.__mpTurnBlocked', 5000);
        await until(a, 'window.__mpTurnBlocked', 5000);
        await b.eval('__lp.perturb(3)');
        if (process.env.EXTRA_PERTURB) await b.eval('__lpExtraPerturb(3)');
        await sleep(5000);
        const r3 = diff(await read(b), await read(a));
        raw.round3 = r3; report('ROUND 3 after the pass (B paints, A watches)', r3);
        check(r3.mismatch.length === 0, 'round 3: A matches B after the pass', { mismatched: r3.mismatch.length });

        // ── Round 4: an audio scene comes and goes ────────────────────
        // Tunnel sets its own Density/Velocity Sustain while it runs and puts
        // them back when it ends. B (holding) starts it, moves Density Sustain
        // mid-scene, then ends it: the slider, B's sim and A's sim must agree.
        const pick = (id, v) => "(function(){var el=document.getElementById('" + id + "'); el.value='" + v + "'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()";
        await b.eval(pick('audioMode', 'tunnel'));
        await sleep(1500);
        const inScene = await b.eval('config.DENSITY_DISSIPATION');
        await b.eval(pick('densityDissipation', '0.9713'));
        await sleep(1500);
        await b.eval(pick('audioMode', 'off'));
        await sleep(4000);
        const DD = "({cfg: config.DENSITY_DISSIPATION, dom: +document.getElementById('densityDissipation').value, vcfg: config.VELOCITY_DISSIPATION, vdom: +document.getElementById('velocityDissipation').value, mode: document.getElementById('audioMode').value})";
        const sB = await b.eval(DD), sA = await a.eval(DD);
        log('tunnel', { inScene, B: sB, A: sA });
        check(sB.cfg === sB.dom && sB.vcfg === sB.vdom, 'round 4: after Tunnel, the painter\'s sim is on the Sustain sliders it shows', sB);
        check(sA.cfg === sB.cfg && sA.vcfg === sB.vcfg && sA.mode === sB.mode, 'round 4: and the watcher\'s sim is on the same numbers', { A: sA, B: sB });

        // From here on the painter's look must be STILL: while anything animates
        // (kaleido spin, a wandering light, Light Shift, Breathing) the 2 s
        // poll re-sends the whole look and quietly undoes whatever the watcher
        // changed, which hides a missing gate (it did, on the first run).
        await b.eval("(function(){ ['kAnimateRot','enableLightShift','breathingToggle'].forEach(function(id){ var el=document.getElementById(id); if(el && el.checked) el.click(); }); var m=document.getElementById('lightMode'); m.value='manual'; m.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        await sleep(4000);

        // ── Round 5: Freeze and back ──────────────────────────────────
        // Freeze brakes inside the step and leaves the Sustain values alone
        // (it used to park them at 1.0/0.9); the watcher must come out of it
        // on the painter's.
        await b.eval(pick('densityDissipation', '0.9951'));
        await b.eval(pick('velocityDissipation', '0.9962'));
        await sleep(3000);
        await b.eval('toggleFreeze(); 1');
        const frozeA = await until(a, 'window.__fluidFrozen', 5000);
        check(!!frozeA, 'round 5: B freezes → A freezes');
        await sleep(1500);
        await b.eval('toggleFreeze(); 1');
        await until(a, '!window.__fluidFrozen', 5000);
        await sleep(3500);
        const FZ = "({d: config.DENSITY_DISSIPATION, v: config.VELOCITY_DISSIPATION, frozen: !!window.__fluidFrozen})";
        const fB = await b.eval(FZ), fA = await a.eval(FZ);
        check(!fA.frozen && fA.d === fB.d && fA.v === fB.v && fB.d === 0.9951, 'round 5: after unfreezing, A runs B\'s Sustain values, not the frozen ones', { A: fA, B: fB });

        // ── Round 6: the watcher's own shortcuts and switches are held ──
        const quiet0 = (await a.eval('__lp.got')).length;
        await sleep(3000);
        const quiet1 = (await a.eval('__lp.got')).length;
        check(quiet1 === quiet0, 'round 6: with B\'s look still, nothing is re-sent (3 s)', { snapshots: quiet1 - quiet0 });
        const before6 = await a.eval('__lp.state()');
        await a.eval(`(function(){ var ca=document.getElementById('canvas-area');
            [{ctrlKey:true},{ctrlKey:true,shiftKey:true},{ctrlKey:true,altKey:true},{altKey:true,shiftKey:true}].forEach(function(m){
              for (var i=0;i<4;i++) ca.dispatchEvent(new WheelEvent('wheel', Object.assign({deltaY:-120, bubbles:true, cancelable:true, clientX:600, clientY:400}, m)));
            });
            ['overflowToggle','colorGate','breathingToggle','kaleidoToggle'].forEach(function(id){ var el=document.getElementById(id); if(el) el.click(); });
            var s=document.getElementById('physicsResolution'); s.focus(); s.value = s.value==='256' ? '384' : '256'; s.dispatchEvent(new Event('change',{bubbles:true})); s.blur();
            return 1; })()`);
        await sleep(1200);
        const after6 = await a.eval('__lp.state()');
        const quiet2 = (await a.eval('__lp.got')).length;
        if (quiet2 !== quiet1) log('round 6: WARNING a snapshot arrived during the check; the result may be masked');
        const moved6 = [];
        for (const part of ['config', 'dom']) for (const k of Object.keys(after6[part])) if (!same(before6[part][k], after6[part][k]) && !/^(SPLAT_RADIUS|brushSize|BRUSH_ANGLE)$/.test(k)) moved6.push(part + '.' + k);
        check(moved6.length === 0, 'round 6: out of turn, A\'s wheel shortcuts, switches and selects change nothing', moved6.slice(0, 12));
        await sleep(2500);   // let any stray re-sync settle before the next round

        // ── Round 7: per-person workflow stays per person ─────────────
        const UI7 = "({focus: document.body.classList.contains('focus-mode'), cursor: document.getElementById('cursorToggle').checked, handles: document.getElementById('showCanvasHandles').checked, lock: document.getElementById('lockCanvasBorders').checked})";
        const a7 = await a.eval(UI7);
        await b.eval("(function(){ ['focusModeToggle','cursorToggle','showCanvasHandles','lockCanvasBorders'].forEach(function(id){ var el=document.getElementById(id); if(el) el.click(); }); return 1; })()");
        await sleep(4000);
        const a7b = await a.eval(UI7), b7 = await b.eval(UI7);
        check(JSON.stringify(a7) === JSON.stringify(a7b), 'round 7: B\'s Focus mode, cursor, canvas handles and border lock leave A\'s alone', { Abefore: a7, Aafter: a7b, B: b7 });
        await b.eval("(function(){ ['focusModeToggle','cursorToggle','showCanvasHandles','lockCanvasBorders'].forEach(function(id){ var el=document.getElementById(id); if(el) el.click(); }); return 1; })()");
        await sleep(2500);

        // ── Round 8: Splat In/Out "Over time" ─────────────────────────
        const SP8 = "({inMode: window.splatInMode, inMs: window.splatInMs, inDist: window.splatInDist, saved: window.settingsManager.get('brush.splatInMs'), outMode: window.splatOutMode, outMs: window.splatOutMs})";
        await b.eval(pick('splatInMode', 'time')); await b.eval(pick('splatInDist', '1.2'));
        await b.eval(pick('splatOutMode', 'time')); await b.eval(pick('splatOutDist', '0.6'));
        await sleep(4000);
        const s8B = await b.eval(SP8), s8A = await a.eval(SP8);
        check(s8B.inMs === 1200 && s8A.inMode === 'time' && s8A.inMs === s8B.inMs && s8A.outMs === s8B.outMs && s8A.saved === s8B.inMs,
            'round 8: B\'s "Over time" ramps reach A as times (1.2 s / 0.6 s)', { A: s8A, B: s8B });

        const gotA = await a.eval('__lp.got'), gotB = await b.eval('__lp.got');
        const maxN = Math.max(0, ...gotA.map((g) => g.n), ...gotB.map((g) => g.n));
        log('snapshots applied', { A: gotA.length, B: gotB.length, largestBytes: maxN, sections: (gotB[gotB.length - 1] || {}).keys });
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
