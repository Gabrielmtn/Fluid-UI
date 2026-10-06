// End-to-end: a room shares one set of settings (2026-10-06). Two separate
// headless Chromes (separate profiles, so two device uids) run the app from
// this working tree in one room, and the checks read what each one's sim is
// actually running — config, the controls, the panel:
//
//   * the turn / call-and-return / look-lock controls are gone;
//   * the host welcomes a newcomer onto the room's settings (sliders,
//     switches, menus, gravity), while the newcomer's brush stays theirs;
//   * a slider moved on one screen GLIDES on the other (one-pole: values
//     strictly between, never past the target, settled in about a second),
//     and its control lights up in the mover's colour with "X changed Y";
//   * a stepped control (Kaleido segments) jumps, it does not glide;
//   * both directions, and two people moving two sliders at once both land;
//   * brush settings and the colour mode stay with each person;
//   * a quiet room sends nothing, even with the kaleidoscope spinning;
//   * a hand on a gliding slider lets go of the glide and wins;
//   * a look from an older build (no units generation) is converted;
//   * a burst of changes (a Mutate's worth) costs little per frame;
//   * leaving puts the panel back.
//
//   npx wrangler dev --port 8788 --ip 127.0.0.1     (a local relay; or)
//   MP_HOST=swirltogether.com node scripts/test/mp/mp-share-e2e.js
//
// The live relay works for this test as well as a local one: room-look rides
// the relay's default path (it forwards any type it does not manage), and
// the room code is random. Env: MP_HOST (default 127.0.0.1:8788), CHROME,
// SHOTS=<dir>. ~40 s. The static server is built in (repo root, no-store).
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
const SHOTS = process.env.SHOTS || '';
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

// Page kit: errors, and a log of every room-look this page sends.
const KIT = String.raw`(function(){
  if (window.__se) return 'kit already';
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  window.__se={errs:errs, sent:[]};
  return 'kit ok';
})()`;
// Wrap the CURRENT socket's send (re-run after a reconnect).
const TAP = String.raw`(function(){
  if (!partySocket || partySocket.__tapped) return !!partySocket;
  var s0 = partySocket.send.bind(partySocket);
  partySocket.send = function(m){ try { var d = JSON.parse(m); if (d.type === 'room-look') window.__se.sent.push({ t: Date.now(), full: !!d.full, snap: d.snapshot }); } catch(_){} return s0(m); };
  partySocket.__tapped = true; return true;
})()`;

async function launch(port, url, name) {
    const profile = path.join(os.tmpdir(), 'fluid-mp-share-' + name + '-' + process.pid);
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
        const ok = await page.eval("!!(window.__scriptsReady && typeof createRoom==='function' && typeof onRoomLook==='function' && typeof mpGlideTo==='function' && document.getElementById('mixer-strip'))").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    await until(page, "(function(){var s=document.getElementById('splash-screen'); return !s || getComputedStyle(s).display==='none' || getComputedStyle(s).opacity==='0';})()", 9000);
    await page.eval("(function(){var s=document.getElementById('splash-screen'); if(s) s.style.display='none'; var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); if(window.UIVisibility&&UIVisibility.applyPreset) UIVisibility.applyPreset('everything'); return 1;})()");
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

async function shot(X, file) {
    if (!SHOTS) return;
    try {
        await X.page.eval("(function(){var p=document.getElementById('multiArtistPanel'); var sec=p&&p.closest('.sidebar-section'); if(sec&&sec.classList.contains('collapsed')){ if(window.openSidebarSection) openSidebarSection(sec); else sec.classList.remove('collapsed'); } if(p) p.scrollIntoView({block:'center'}); return 1;})()");
        await sleep(250);
        const r = await X.page.send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(SHOTS, { recursive: true });
        fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64'));
    } catch (e) { log('shot failed ' + file + ': ' + e.message); }
}

// A person's hand on a control: value, then input and change, NOT marked as
// a remote apply — exactly what a drag, a key or a hotkey looks like here.
const SET = (id, v) => "(function(){var e=document.getElementById(" + JSON.stringify(id) + "); if(!e) return 'missing'; e.value=" + JSON.stringify(String(v)) +
    "; if(e.type==='range') e.style.setProperty('--val', e.value); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return e.value;})()";
const CHECKBOX = (id, on) => "(function(){var e=document.getElementById(" + JSON.stringify(id) + "); if(!e) return 'missing'; if(e.checked!==" + !!on + "){ e.checked=" + !!on + "; e.dispatchEvent(new Event('change',{bubbles:true})); } return e.checked;})()";
// What the sim runs: config for a 1:1 slider, else the control.
const VAL = (id) => "(function(){var R=ParamRegistry.SLIDERS[" + JSON.stringify(id) + "]; var k=R&&R.configKey; if(k && !(" + JSON.stringify(id) + "==='curl' && window.MaterialModes && MaterialModes.active())) return config[k]; var e=document.getElementById(" + JSON.stringify(id) + "); return e ? (e.type==='checkbox' ? e.checked : (e.type==='range' ? parseFloat(e.value) : e.value)) : null;})()";
const near = (a, b, eps) => typeof a === 'number' && Math.abs(a - b) <= (eps || 1e-6);

// Sample a slider's live value every frame on a page, for the glide shape.
const SAMPLE_START = (id) => "(function(){ window.__samp = { t0: performance.now(), v: [] }; var f = function(){ if(!window.__samp) return; window.__samp.v.push([performance.now()-window.__samp.t0, " + VAL(id) + "]); window.__sampRaf = requestAnimationFrame(f); }; f(); return 1; })()";
const SAMPLE_STOP = "(function(){ var s = window.__samp; window.__samp = null; cancelAnimationFrame(window.__sampRaf); return s ? s.v : []; })()";

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY);
    let A = null, B = null;
    try {
        [A, B] = await Promise.all([launch(9381, url, 'A'), launch(9382, url, 'B')]);
        const a = A.page, b = B.page;

        // ── 1. What is gone ───────────────────────────────────────────
        const gone = await a.eval("['mpRhythm','togetherBtn','turnsBtn','callReturnBtn','turnLength','turnWheel','turnPassBtn','turnSkipBtn','settingsLockBtn','mpTurnChip'].filter(function(id){ return !!document.getElementById(id); })");
        check(Array.isArray(gone) && gone.length === 0, 'no turn, call-and-return or look-lock controls left in the page', gone);
        check(await a.eval("typeof window.toggleTurns === 'undefined' && typeof window.passTurn === 'undefined' && typeof window.broadcastPreset === 'undefined'"), 'and none of their functions');

        // ── 2. Two different looks, then a room ───────────────────────
        // A: the look the room will run. B: everything different.
        for (const [id, v] of [['curl', 33], ['vibrance', 0.8], ['sharpness', 1.3], ['velocityInfluence', 1.2], ['kaleidoSegments', 6], ['brushSize', 7]]) await a.eval(SET(id, v));
        await a.eval(SET('kaleidoMode', '2'));
        await a.eval(CHECKBOX('glowToggle', true));
        await a.eval("window.setGravityField ? (setGravityField(true, 0.5, -0.3), 1) : 0");
        for (const [id, v] of [['curl', 5], ['vibrance', 0.3], ['sharpness', 0.2], ['velocityInfluence', 3], ['kaleidoSegments', 4], ['brushSize', 2]]) await b.eval(SET(id, v));
        await b.eval(SET('kaleidoMode', '1'));
        await b.eval(CHECKBOX('glowToggle', false));
        await b.eval("window.setGravityField ? (setGravityField(false, 0, 0), 1) : 0");
        const bRnd = await b.eval("document.getElementById('randomColor').checked");

        await a.eval('createRoom(); 1');
        const code = await until(a, 'isMultiplayerEnabled && clientId && currentRoom', 10000);
        check(/^[A-Z0-9]{6}$/.test(code || ''), 'A started room ' + code);
        await b.eval("joinRoom('" + code + "'); 1");
        check(!!await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000) && !!await until(a, 'connectedClients === 2', 6000), 'B joined: two in the room');
        await a.eval(TAP); await b.eval(TAP);

        // ── 3. The welcome ────────────────────────────────────────────
        const welcomed = await until(b, "(" + VAL('curl') + ") === 33 && Math.abs((" + VAL('vibrance') + ") - 0.8) < 1e-6", 6000);
        check(!!welcomed, 'the host welcomes B onto the room\'s settings (Curl 33, Vibrance 0.8 arrive)');
        await sleep(1300);   // let every glide land
        const bNow = await b.eval("({ sharp: " + VAL('sharpness') + ", vel: " + VAL('velocityInfluence') + ", seg: " + VAL('kaleidoSegments') + ", mode: document.getElementById('kaleidoMode').value, glow: document.getElementById('glowToggle').checked, grav: [!!config.AMBIENT_FORCE, config.AMBIENT_FORCE_X, config.AMBIENT_FORCE_Y], brush: " + VAL('brushSize') + ", rnd: document.getElementById('randomColor').checked })");
        check(near(bNow.sharp, 1.3) && near(bNow.vel, 1.2) && bNow.seg === 6, 'sliders arrive: Sharpness 1.3, Velocity Influence 1.2, Kaleido segments 6', bNow);
        check(bNow.mode === '2' && bNow.glow === true, 'menus and switches arrive: Kaleido mode, Glow', bNow);
        check(bNow.grav[0] === true && near(bNow.grav[1], 0.5) && near(bNow.grav[2], -0.3), 'gravity arrives, switch and aim', bNow.grav);
        check(near(bNow.brush, 2) && bNow.rnd === bRnd, 'B keeps their own brush size and colour mode', { brush: bNow.brush, rnd: bNow.rnd });
        const aNow = await a.eval("({ curl: " + VAL('curl') + ", brush: " + VAL('brushSize') + " })");
        check(aNow.curl === 33 && near(aNow.brush, 7), 'A did not take B\'s old look', aNow);
        const st = await Promise.all([a.eval("document.getElementById('multiplayerStatus').textContent"), b.eval("document.getElementById('multiplayerStatus').textContent")]);
        check(st[0] === 'Sharing settings · 2 here' && st[1] === 'Sharing settings · 2 here', 'status: "Sharing settings · 2 here" on both', st);
        const tip = await b.eval("document.getElementById('multiplayerStatus').title");
        check(/changes for everyone/.test(tip) && /own brush/.test(tip), 'the status tooltip says what sharing means', tip);
        const hostName = await a.eval('shortName(clientId)');
        const welcomeLine = await b.eval("document.getElementById('mpActivity').textContent");
        check(welcomeLine === 'Now on ' + hostName + '’s settings', 'B\'s panel says "' + welcomeLine + '"');
        await shot(B, '01-welcomed.png');

        // ── 4. A slider glides ────────────────────────────────────────
        await b.eval(SAMPLE_START('velocityInfluence'));
        const aName = await a.eval('shortName(clientId)');
        await a.eval(SET('velocityInfluence', 4.6));
        await sleep(200);
        const lit = await b.eval("(function(){ var f = document.getElementById('velocityInfluence'); f = f && (f.closest('.mixer-channel') || f.closest('.control-group')); return !!(f && f.classList.contains('mp-peer-touch')); })()");
        const act = await b.eval("(function(){ var e = document.getElementById('mpActivity'); return { text: e.textContent, shown: getComputedStyle(e).display !== 'none', live: e.classList.contains('live') }; })()");
        await sleep(1800);
        const samples = await b.eval(SAMPLE_STOP);
        const vals = samples.map((s) => s[1]);
        const between = vals.filter((v) => v > 1.25 && v < 4.55).length;
        let mono = true; for (let i = 1; i < vals.length; i++) if (vals[i] < vals[i - 1] - 1e-9) mono = false;
        const firstMove = samples.find((s) => s[1] > 1.21), at95 = samples.find((s) => s[1] >= 1.2 + 0.95 * 3.4), atEnd = samples.find((s) => near(s[1], 4.6, 1e-9));
        check(between >= 8, 'Velocity Influence glides on B: ' + between + ' frames strictly between 1.2 and 4.6');
        check(mono && vals.every((v) => v <= 4.6 + 1e-9), 'the glide only moves toward the target, never past it');
        check(!!atEnd && near(vals[vals.length - 1], 4.6, 1e-9), 'and lands exactly on 4.6', vals[vals.length - 1]);
        const t95 = at95 && firstMove ? at95[0] - firstMove[0] : null;
        check(t95 !== null && t95 > 150 && t95 < 1200, 'it reaches 95% in ' + (t95 && t95.toFixed(0)) + ' ms (one-pole, tau 140 ms ≈ 420 ms)');
        check(lit, 'the slider B is watching glide lights up in A\'s colour');
        const velName = await b.eval("HotkeyBinds.nameOf(document.getElementById('velocityInfluence'))");
        check(act.shown && act.live && act.text === aName + ' changed ' + velName, 'B\'s panel says "' + act.text + '"', act);
        await shot(B, '02-glide-activity.png');

        // ── 5. A stepped control jumps ────────────────────────────────
        await b.eval(SAMPLE_START('kaleidoSegments'));
        await a.eval(SET('kaleidoSegments', 11));
        await sleep(900);
        const segs = await b.eval(SAMPLE_STOP);
        const segVals = Array.from(new Set(segs.map((s) => s[1])));
        check(segVals.every((v) => v === 6 || v === 11) && segVals.indexOf(11) !== -1, 'Kaleido segments jumps 6 → 11 with nothing in between', segVals);

        // ── 6. Both ways, both at once ────────────────────────────────
        await Promise.all([a.eval(SET('ridges', 2.5)), b.eval(SET('viscosity', 0.7))]);
        const both = await until(a, "Math.abs((" + VAL('viscosity') + ") - 0.7) < 1e-9 && Math.abs((" + VAL('ridges') + ") - 2.5) < 1e-9", 4000)
            && await until(b, "Math.abs((" + VAL('viscosity') + ") - 0.7) < 1e-9 && Math.abs((" + VAL('ridges') + ") - 2.5) < 1e-9", 4000);
        check(!!both, 'A moves Ridges while B moves Viscosity: both land on both screens');
        const bName = await b.eval('shortName(clientId)');
        const actA = await a.eval("document.getElementById('mpActivity').textContent");
        check(actA.indexOf(bName + ' changed') === 0, 'and A\'s panel names B: "' + actA + '"');

        // ── 7. The brush is personal ──────────────────────────────────
        await a.eval(SET('brushSize', 20));
        await a.eval("document.getElementById('randomColor').checked = !document.getElementById('randomColor').checked; document.getElementById('randomColor').dispatchEvent(new Event('change',{bubbles:true})); 1");
        await sleep(1600);
        const bBrush = await b.eval("({ brush: " + VAL('brushSize') + ", rnd: document.getElementById('randomColor').checked })");
        check(near(bBrush.brush, 2) && bBrush.rnd === bRnd, 'A\'s brush size and colour mode stay on A', bBrush);
        await a.eval("document.getElementById('randomColor').checked = !document.getElementById('randomColor').checked; document.getElementById('randomColor').dispatchEvent(new Event('change',{bubbles:true})); 1");

        // ── 8. A quiet room is quiet ──────────────────────────────────
        await a.eval(CHECKBOX('kaleidoToggle', true));
        await a.eval(CHECKBOX('kAnimateRot', true));
        await sleep(2500);   // both screens spin now, and the change has landed
        const spinning = await b.eval("!!window.kAnimateRot && document.getElementById('kaleidoToggle').checked");
        check(spinning, 'the kaleidoscope (on, spinning) reached B');
        await a.eval("window.__se.sent.length = 0; 1"); await b.eval("window.__se.sent.length = 0; 1");
        await sleep(5000);
        const quiet = await Promise.all([a.eval('window.__se.sent.length'), b.eval('window.__se.sent.length')]);
        const angles = await Promise.all([a.eval('window.kAngle'), b.eval('window.kAngle')]);
        check(quiet[0] === 0 && quiet[1] === 0, 'five idle seconds with the kaleidoscope spinning: no room-look sent by either', quiet);
        check(angles[0] !== 0 && angles[1] !== 0, 'and both screens spin on their own clocks', angles);
        await a.eval(CHECKBOX('kAnimateRot', false)); await a.eval(CHECKBOX('kaleidoToggle', false));
        await sleep(1200);

        // ── 9. A hand on a gliding slider wins ────────────────────────
        await a.eval(SET('curl', 55));
        await sleep(110);
        const mid = await b.eval(VAL('curl'));
        await shot(B, '03-curl-gliding.png');
        await b.eval(SET('curl', 10));
        await sleep(1500);
        const after = await Promise.all([b.eval(VAL('curl')), a.eval(VAL('curl'))]);
        check(mid > 33 && mid < 55, 'B caught Curl mid-glide (' + mid + ')');
        check(after[0] === 10 && after[1] === 10, 'B\'s hand let go of the glide, and A follows B: Curl 10 on both', after);

        // ── 10. A look from an older build is converted ───────────────
        // No units generation = generation 1, where Vibrance 1.0 is today's 0.5.
        await b.eval("window.__se.sent.length = 0; onMultiplayerMessage({ target: partySocket, data: JSON.stringify({ type: 'room-look', clientId: 'old-build-peer', snapshot: { sliders: { vibrance: 1 } } }) }); 1");
        await sleep(1600);
        const vib = await b.eval(VAL('vibrance'));
        const echo = await b.eval("window.__se.sent.filter(function(m){ return m.snap && m.snap.sliders && 'vibrance' in m.snap.sliders; }).length");
        check(near(vib, 0.5, 1e-6), 'an old build\'s Vibrance 1.0 lands as 0.5', vib);
        check(echo === 0, 'and B does not bounce the converted value back', echo);

        // ── 11. A Mutate's worth of changes ───────────────────────────
        await b.eval("window.__gf = []; var g0 = window.glideFrame; window.glideFrame = function(n){ var t = performance.now(); g0(n); window.__gf.push([performance.now() - t, _glides.size]); }; 1");
        const burst = { densityDissipation: 0.97, velocityDissipation: 0.95, pressureDissipation: 0.93, curl: 40, sharpness: 0.6, vibrance: 0.65,
            ridges: 1.1, viscosity: 0.2, glowIntensity: 1.4, glowThreshold: 1.2, scatterAmount: 0.4, kZoom: 1.3, kTwist: 2.2, timeScale: 1.4 };
        await a.eval("(function(){ var b = " + JSON.stringify(burst) + "; Object.keys(b).forEach(function(id){ var e = document.getElementById(id); if (!e) return; e.value = String(b[id]); e.dispatchEvent(new Event('input',{bubbles:true})); }); return 1; })()");
        await sleep(2200);
        const gf = await b.eval('window.__gf');
        const busy = gf.filter((f) => f[1] > 0 || f[0] > 0);
        const peak = Math.max.apply(null, gf.map((f) => f[1]).concat([0]));
        const avg = busy.length ? busy.reduce((s, f) => s + f[0], 0) / busy.length : 0;
        const worst = Math.max.apply(null, gf.map((f) => f[0]).concat([0]));
        log('burst: ' + gf.length + ' glide frames, up to ' + peak + ' sliders at once, ' + avg.toFixed(3) + ' ms a frame on average, worst ' + worst.toFixed(3) + ' ms');
        check(peak >= 8, 'a 14-slider burst glides together on B (' + peak + ' at once)');
        check(avg < 2, 'the glide costs ' + avg.toFixed(3) + ' ms a frame on average with that many moving');
        const landed = await b.eval("(function(){ var b = " + JSON.stringify(burst) + "; var bad = []; Object.keys(b).forEach(function(id){ var v = " + "(function(id){var R=ParamRegistry.SLIDERS[id]; var k=R&&R.configKey; if(k) return config[k]; return parseFloat(document.getElementById(id).value);})(id)" + "; if (Math.abs(v - b[id]) > 1e-6) bad.push([id, v, b[id]]); }); return bad; })()");
        check(landed.length === 0, 'and every one of them lands exactly', landed);

        // ── 12. Leaving ───────────────────────────────────────────────
        await b.eval('disconnectMultiplayer(); 1');
        const alone = await until(a, "document.getElementById('multiplayerStatus').textContent === 'Waiting for friends · just you' && getComputedStyle(document.getElementById('mpActivity')).display === 'none'", 6000);
        check(!!alone, 'B leaves: A reads "Waiting for friends · just you" and the activity line steps away');
        check(await b.eval("roomLookBase === null && _glides.size === 0 && getComputedStyle(document.getElementById('mpDisconnected')).display !== 'none'"), 'B is back on the door view, nothing left gliding');

        const eA = await a.eval('__se.errs'), eB = await b.eval('__se.errs');
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
