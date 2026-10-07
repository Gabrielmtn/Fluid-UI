// Share with settings (2026-10-07): the packed settings link (js/50,
// format "2.") and the Swirl Together buttons that copy it (js/06e).
// One headless Chrome against this working tree (built-in static server,
// no dev server). The room part never reaches a relay: the page is pointed
// at a dead local port, which is enough to see WHEN the join happens.
//
// Checks:
//   - every built-in look and the defaults: the 2. link decodes to exactly
//     what the 1. (deflated JSON) link of the same body decodes to, at
//     well under half the length;
//   - a stress look (every slider random, 32 swatches in mixed case,
//     gravity on, a material, a 600-point freehand light path): every
//     setting exact, the link inside LINK_BUDGET, the path thinned and
//     spread back to 600 points with its jumps in place; a 300-point
//     path rides unthinned;
//   - a link from a newer build (a key this one does not know) keeps the
//     rest; 3000 corrupted links are refused cleanly, fast, and never
//     reach Object.prototype;
//   - Link to current settings (out of a room): copies a 2. link, flashes, says
//     how many settings and how long; opened over another look it lands
//     every setting, gravity and the light path included, cleans the URL
//     and leaves the saved session's values alone;
//   - Room link + current settings (a room's Invite): the invite ends in #CODE;
//     opened, the room join is held until the settings are on, then made;
//   - 51's deep links: join/CODE?look=… carries both, a broken look still
//     joins, look/2.… parses;
//   - the button audit (js/38) passes both new buttons.
// Env: CHROME (path). ~40 s.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect, waitReady } = require('../cdp.js');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEAD_RELAY = '127.0.0.1:9';
const PORT = 9351;
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
async function until(page, expr, ms = 8000, every = 150) {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) {
        v = await page.eval(expr).catch(() => undefined);
        if (v) return v;
        await sleep(every);
    }
    return v;
}

// Boot (or re-boot after a navigation) to the point a link would apply:
// the chain in, the strip built, the splash and PhotoSafe out of the way.
async function settle(page) {
    await waitReady(page, { timeoutMs: 90000 });
    await until(page, "!!(window.__scriptsReady && window.LookLinks && document.getElementById('mixer-strip') && typeof showConnectedUI === 'function')", 30000);
    await page.eval("(function(){var s=document.getElementById('splash-screen'); if(s) s.style.display='none'; var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
}
async function go(page, url) {
    await page.send('Page.navigate', { url });
    await sleep(400);
    await settle(page);
}

// Page-side kit: the 1. (JSON) form of a 2. link's body, a deep compare,
// and the look as a link carries it.
const KIT = String.raw`(function(){
  var K = window.__ll = {};
  K.b64 = function(bytes){var s='';for(var i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  K.unb64 = function(str){var s=str.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),o=new Uint8Array(b.length);for(var i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;};
  K.zip = async function(bytes, inflate){ return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(inflate ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw'))).arrayBuffer()); };
  K.body = async function(p){ var b = K.unb64(p.slice(2)); var body = b.subarray(1); if (b[0] & 1) body = await K.zip(body, true); return LookLinks.unpack(body); };
  K.oldPayload = async function(body){ return '1.' + K.b64(await K.zip(new TextEncoder().encode(JSON.stringify(Object.assign({version:2}, body))))); };
  K.diff = function(a,b,p,out){ p=p||''; out=out||[];
    if (typeof a==='number'&&typeof b==='number'){ if (Math.abs(a-b)>1e-9*Math.max(1,Math.abs(a))) out.push(p+': '+a+' vs '+b); return out; }
    if (a===b) return out;
    if (typeof a!==typeof b||a===null||b===null||typeof a!=='object'){ out.push(p+': '+JSON.stringify(a)+' vs '+JSON.stringify(b)); return out; }
    new Set(Object.keys(a).concat(Object.keys(b))).forEach(function(k){ K.diff(a[k],b[k],p+'.'+k,out); }); return out; };
  // Everything a link should land, from a capture (workspace keys out).
  K.SKIPC = {autoloadSettings:1,preserveFluidOpacity:1,photoSafeToggle:1,statsToggle:1,cursorToggle:1,showCanvasHandles:1,lockCanvasBorders:1,hoverCaptureToggle:1,detachCaptureToggle:1,audioReactToggle:1,focusModeToggle:1,streamFormatLock:1,transparentMode:1,governorToggle:1};
  K.SKIPS = {visualResolution:1,physicsResolution:1,fpsCap:1,recMode:1,recPlaybackSpeed:1,audioMode:1,audioReactSource:1};
  K.look = function(){ var s = LookLinks.capture(), o = {sliders:{},checkboxes:{},selects:{}};
    Object.keys(s.sliders).forEach(function(k){ o.sliders[k] = Number(Number(s.sliders[k]).toPrecision(6)); });
    Object.keys(s.checkboxes).forEach(function(k){ if (!K.SKIPC[k]) o.checkboxes[k] = s.checkboxes[k]; });
    Object.keys(s.selects).forEach(function(k){ if (!K.SKIPS[k]) o.selects[k] = s.selects[k]; });
    ['colors','kaleido','paletteIndex','paletteName','savedColors','armColors','lightPos','brushState','material','gravity'].forEach(function(k){ o[k] = s[k]; });
    o.brushTip = Object.assign({}, s.brushTip, {shapeId:null});
    o.lightShiftPath = s.lightShiftPath;
    return o; };
  // The saved session by VALUE: settingsManager rewrites timestamps on
  // every boot, which is not the session changing.
  K.saved = function(){ var o = {}; for (var i=0;i<localStorage.length;i++){ var k=localStorage.key(i), v=localStorage.getItem(k);
    try { var j = JSON.parse(v); if (j && typeof j==='object' && 'timestamp' in j && 'value' in j) v = JSON.stringify(j.value); } catch(_){}
    o[k] = v; } return o; };
  K.stubClipboard = function(){ window.__copied = null; Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: function (t) { window.__copied = t; return Promise.resolve(); } }); return true; };
  K.path = function(n, size, gapEvery){ var S = size||180, x = 20, y = 90, out = [], seed = 7; var rnd = function(){ return (seed = (seed * 16807) % 2147483647) / 2147483647; };
    for (var i = 0; i < n; i++) { x = Math.max(0, Math.min(S-1, x + (rnd()-0.4)*5)); y = Math.max(0, Math.min(S-1, y + (rnd()-0.5)*5)); var p = {x:x, y:y, hue:x/S*360, saturation:100-y/S*100, lightness:50}; if (gapEvery && i % gapEvery === gapEvery-1) p.gap = true; out.push(p); }
    return out; };
  return 'kit ok';
})()`;

(async () => {
    const srv = await serve();
    const APP = 'http://127.0.0.1:' + srv.address().port + '/';
    const profile = path.join(os.tmpdir(), 'fluid-look-links-' + process.pid);
    const proc = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', 'about:blank'
    ], { stdio: 'ignore' });
    let page;
    try {
        for (let i = 0; i < 80 && !(await portUp(PORT)); i++) await sleep(250);
        page = await connect(PORT);
        await page.send('Page.enable', {});
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source:
            "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');" +
            "localStorage.setItem('fluidMultiplayerHost','" + DEAD_RELAY + "');}catch(_){} window.__skipUIFork=true;" });
        await go(page, APP);
        log('ready', await page.eval(KIT));

        // ── 1. Built-in looks: 2. vs 1. ────────────────────────────────
        const rows = await page.eval(String.raw`(async function(){
          var out = [], names = [null].concat(Object.keys(presets));
          for (var i = 0; i < names.length; i++) {
            if (names[i]) { applyPreset(names[i]); await new Promise(function(r){ setTimeout(r, 80); }); }
            var r = await LookLinks.encodeWithStats(LookLinks.capture(), null);
            var oldP = await __ll.oldPayload(await __ll.body(r.payload));
            var a = await LookLinks.decode(r.payload), b = await LookLinks.decode(oldP);
            out.push({ look: names[i] || 'defaults', n: r.payload.length, old: oldP.length, d: __ll.diff(a.snapshot, b.snapshot).slice(0, 3) });
          }
          return out;
        })()`);
        const bad = rows.filter((r) => r.d.length);
        check(rows.length === 13 && !bad.length, 'defaults + 12 built-in looks: the 2. link lands exactly what the 1. link did', bad);
        const worst = rows.reduce((m, r) => Math.max(m, r.n / r.old), 0);
        check(worst < 0.45, 'and is well under half as long (worst ' + Math.round(worst * 100) + '%)', rows.map((r) => r.look + ' ' + r.n + '/' + r.old));

        // ── 2. Stress look ─────────────────────────────────────────────
        const st = await page.eval(String.raw`(async function(){
          var snap = LookLinks.capture(), R = ParamRegistry.SLIDERS, seed = 12345;
          var rnd = function(){ return (seed = (seed * 16807) % 2147483647) / 2147483647; };
          Object.keys(snap.sliders).forEach(function(k){ var d = R[k]; if (!d || !d.ui) return; var s = d.ui.step || 0.01;
            var v = Math.round((d.ui.min + rnd() * (d.ui.max - d.ui.min)) / s) * s; snap.sliders[k] = Number(v.toFixed(d.decimals != null ? d.decimals : 4)); });
          Object.keys(snap.checkboxes).forEach(function(k){ snap.checkboxes[k] = rnd() > 0.5; });
          snap.savedColors = Array.from({length: 32}, function(_, i){ var h = '#' + Math.floor(rnd() * 16777215).toString(16).padStart(6, '0'); return i % 2 ? h.toUpperCase() : h; });
          snap.colors = { background: '#0a1B2c', brush: '#ff00aa' };
          snap.material = { mode: 'clay', amount: 0.62, shape: 2 };
          snap.gravity = { on: true, x: 0.3125, y: -0.71 };
          snap.lightPos = { x: 0.4837261928, y: 0.21, enabled: true };
          snap.lightShiftPath = __ll.path(600, 180, 150);
          var r = await LookLinks.encodeWithStats(snap, 'Stress test'), d = (await LookLinks.decode(r.payload)), s2 = d.snapshot;
          var defs = ParamRegistry.defaults().sliders, miss = [];
          Object.keys(snap.sliders).forEach(function(k){ var a = Number(snap.sliders[k].toPrecision(6)), b = s2.sliders[k];
            if (b === undefined ? !(k in defs && Number(defs[k].toPrecision(6)) === a) : a !== b) miss.push(k); });
          Object.keys(snap.checkboxes).forEach(function(k){ if (k in s2.checkboxes && s2.checkboxes[k] !== snap.checkboxes[k]) miss.push(k); });
          ['savedColors','colors','gravity','material'].forEach(function(k){ if (JSON.stringify(s2[k]) !== JSON.stringify(snap[k])) miss.push(k); });
          if (Math.abs(s2.lightPos.x - 0.483726) > 1e-9) miss.push('lightPos');
          var p1 = snap.lightShiftPath, p2 = s2.lightShiftPath, g1 = [], g2 = [];
          p1.forEach(function(p, i){ if (p.gap) g1.push(i); }); p2.forEach(function(p, i){ if (p.gap) g2.push(i); });
          var short = Object.assign({}, snap, { lightShiftPath: p1.slice(0, 300) });
          var r3 = await LookLinks.encodeWithStats(short, null), p3 = (await LookLinks.decode(r3.payload)).snapshot.lightShiftPath, dev = 0;
          p3.forEach(function(p, i){ var q = short.lightShiftPath[i]; dev = Math.max(dev, Math.abs(p.x-q.x), Math.abs(p.y-q.y), Math.abs(p.hue-q.hue), Math.abs(p.saturation-q.saturation)); });
          return { url: LookLinks.urlFor(r.payload).length, budget: LookLinks.LINK_BUDGET, stats: r.stats, name: d.name, miss: miss,
            pathLen: p2.length, g1: g1, g2: g2, short: { kept: r3.stats.pathKept, n: p3.length, dev: dev } };
        })()`);
        check(!st.miss.length && st.name === 'Stress test', 'stress look: every slider, switch, swatch (mixed case), colour, gravity and material exact', st.miss);
        check(st.url <= st.budget, 'stress look fits one chat message (' + st.url + ' ≤ ' + st.budget + ' characters)', st.stats);
        const gapsNear = st.g1.length === st.g2.length && st.g1.every((g, i) => Math.abs(g - st.g2[i]) <= 1);
        check(st.stats.pathKept < 600 && st.pathLen === 600 && gapsNear, 'its 600-point light path was thinned to fit and spread back to 600, jumps within one point', { kept: st.stats.pathKept, n: st.pathLen, g1: st.g1, g2: st.g2 });
        check(st.short.kept === 300 && st.short.n === 300 && st.short.dev <= 0.1 + 1e-9, 'a 300-point light path rides whole, within 0.1 px', st.short);

        // ── 3. Newer links and hostile ones ────────────────────────────
        const hz = await page.eval(String.raw`(async function(){
          var enc = function(s){ return Array.from(new TextEncoder().encode(s)); };
          // {sliders: {curl: 12, <a key past this build's list>: 5}}, as a newer
          // build might write it. pack() gives [OBJ, 1, sliders, NUMS, 1, curl, 12];
          // bump the NUMS count and append key code 10000 (varint 0x90 0x4e)
          // with the number 5 (zigzag 10, times 10, 0 decimals = 100).
          var arr = Array.from(LookLinks.pack({ sliders: { curl: 12 } }));
          arr[4] = 2; arr.push(0x90, 0x4e, 100);
          var p = '2.' + __ll.b64(new Uint8Array([0].concat(arr)));
          var newer = null; try { newer = (await LookLinks.decode(p)).snapshot.sliders; } catch (e) { newer = 'threw ' + e.message; }
          var seed = 99, rnd = function(){ return (seed = (seed * 16807) % 2147483647) / 2147483647; };
          var realB = __ll.unb64((await LookLinks.encodeWithStats(LookLinks.capture(), 'x')).payload.slice(2));
          var res = { ok: 0, refused: 0, slow: 0, other: [] };
          for (var i = 0; i < 3000; i++) {
            var b;
            if (i % 3 === 0) { b = new Uint8Array(1 + Math.floor(rnd() * 200)); for (var j = 0; j < b.length; j++) b[j] = Math.floor(rnd() * 256); b[0] = rnd() < 0.5 ? 0 : 1; }
            else if (i % 3 === 1) { b = realB.slice(); for (var f = 0; f < 1 + Math.floor(rnd() * 4); f++) b[1 + Math.floor(rnd() * (b.length - 1))] = Math.floor(rnd() * 256); }
            else b = realB.slice(0, 1 + Math.floor(rnd() * realB.length));
            var s = performance.now();
            try { await LookLinks.decode('2.' + __ll.b64(b)); res.ok++; }
            catch (e) { res.refused++; if (!(e instanceof Error)) res.other.push(String(e)); }
            res.slow = Math.max(res.slow, performance.now() - s);
          }
          var proto = '2.' + __ll.b64(new Uint8Array([0, 9, 1, 0, 9].concat(enc('__proto__'), [9, 1, 0, 8], enc('polluted'), [2])));
          try { await LookLinks.decode(proto); } catch (_) {}
          res.polluted = !!({}).polluted || !!Object.prototype.polluted;
          return { newer: newer, res: res };
        })()`);
        check(hz.newer && hz.newer.curl === 12 && Object.keys(hz.newer).length === 1, 'a link from a newer build: the setting this build does not know is skipped, the rest lands', hz.newer);
        check(hz.res.ok + hz.res.refused === 3000 && !hz.res.other.length && !hz.res.polluted && hz.res.slow < 60,
            '3000 corrupted links: each refused cleanly or read safely, none slower than 60 ms, nothing reaches Object.prototype', hz.res);

        // ── 4. Link to current settings (out of a room) ────────────────
        const share = await page.eval(String.raw`(async function(){
          applyPreset('bloom'); await new Promise(function(r){ setTimeout(r, 150); });
          var set = function(id, v){ var el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); };
          set('curl', 33); set('vibrance', 0.8); set('colorBlend', -0.4); set('kTwist', 2.5);
          window.setGravityField(true, 0.4, -0.6);
          window.lightShift.setPath(__ll.path(240, 180, 80));
          await new Promise(function(r){ setTimeout(r, 300); });
          __ll.stubClipboard();
          var btn = document.getElementById('shareLookBtn');
          var shown = !!btn && btn.getClientRects().length > 0 && !!btn.closest('#mpDisconnected');
          // Sync phone (54) straight above it, the same width and height,
          // and an error box below both.
          var ph = document.getElementById('phonePadBtn'), a = ph && ph.getBoundingClientRect(), b = btn.getBoundingClientRect();
          var err = document.getElementById('mpError');
          shown = shown && btn.previousElementSibling === ph && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5 &&
              btn.compareDocumentPosition(err) === Node.DOCUMENT_POSITION_FOLLOWING;
          btn.click();
          for (var i = 0; i < 40 && !window.__copied; i++) await new Promise(function(r){ setTimeout(r, 50); });
          var flash = btn.textContent;
          var t = document.getElementById('look-toast');
          return { shown: shown, url: window.__copied, flash: flash, toast: t && t.textContent, look: __ll.look() };
        })()`);
        check(share.shown, 'Link to current settings is in the panel out of a room, under Sync phone, the same size, errors below both');
        check(/\?look=2\.[A-Za-z0-9_-]+$/.test(share.url || '') && share.flash === 'Copied', 'it copies a 2. link and flashes "Copied"', { url: (share.url || '').slice(0, 60), flash: share.flash });
        check(/current settings: all \d+ of them, in \d+ characters/.test(share.toast || '') && share.toast.indexOf(String(share.url.length)) !== -1, 'the toast says how many settings and how long', share.toast);

        // Open it over another look, the way a friend would.
        const savedBefore = await page.eval(String.raw`(function(){ applyPreset('opal'); window.setGravityField(false, 0, 0); window.lightShift.setPath([]); return __ll.saved(); })()`);
        await go(page, share.url);
        await page.eval(KIT);
        const cleaned = await until(page, "!/look=/.test(location.search) && document.getElementById('look-toast') && /Opened shared settings/.test(document.getElementById('look-toast').textContent)", 15000);
        const landed = await page.eval('__ll.look()');
        const diffs = await page.eval('(' + String.raw`function(a, b){ var out = __ll.diff(Object.assign({}, a, {lightShiftPath: null}), Object.assign({}, b, {lightShiftPath: null}));
          var p1 = a.lightShiftPath || [], p2 = b.lightShiftPath || [], dev = p1.length === p2.length ? 0 : Infinity;
          p1.forEach(function(p, i){ var q = p2[i]; if (q) dev = Math.max(dev, Math.abs(p.x-q.x), Math.abs(p.y-q.y), Math.abs(p.hue-q.hue), Math.abs(p.saturation-q.saturation)); if (q && !!p.gap !== !!q.gap) dev = Infinity; });
          return { d: out.slice(0, 8), n: out.length, path: p1.length + '/' + p2.length, dev: dev }; }` + ')(' + JSON.stringify(share.look) + ',' + JSON.stringify(landed) + ')');
        check(!!cleaned, 'opened: the settings apply, the toast says so, the URL is cleaned');
        check(diffs.n === 0, 'every look setting lands: ' + Object.keys(landed.sliders).length + ' sliders, ' + Object.keys(landed.checkboxes).length + ' switches, ' + Object.keys(landed.selects).length + ' menus, colours, swatches, arms, ramps, material, tip, gravity', diffs.d);
        check(diffs.dev <= 0.1 + 1e-9, 'and the light path, point for point (' + diffs.path + ')', diffs.dev);
        const savedAfter = await page.eval('__ll.saved()');
        const changed = Object.keys(Object.assign({}, savedBefore, savedAfter)).filter((k) => savedBefore[k] !== savedAfter[k]
            && k !== 'fluidSimColors');   // a plain reload resets the tray to the palette too (boot, not the link)
        check(!changed.length, 'and the saved session keeps its own values (gravity included)', changed.map((k) => k + ': ' + String(savedBefore[k]).slice(0, 30) + ' -> ' + String(savedAfter[k]).slice(0, 30)));

        // ── 5. Room link + current settings (in a room) ─────────────────
        const inv = await page.eval(String.raw`(async function(){
          window.setGravityField(true, -0.5, 0.25);
          applyPreset('currents'); await new Promise(function(r){ setTimeout(r, 150); });
          currentRoom = 'K7P2QX'; isMultiplayerEnabled = true; myRole = 'host'; connectedClients = 2;
          showConnectedUI();
          __ll.stubClipboard();
          MPPanel.open('invite');
          await new Promise(function(r){ setTimeout(r, 300); });
          var btn = document.getElementById('copyRoomLookBtn');
          var shown = !!btn && btn.getClientRects().length > 0 && document.getElementById('mpInvitePop').contains(btn);
          // The second row of the copy grid: flush with Copy link's left and
          // Copy code's right, 6px under them, its label unclipped.
          var l = document.getElementById('copyRoomBtn').getBoundingClientRect(), c = document.getElementById('copyRoomCodeBtn').getBoundingClientRect(), m = btn.getBoundingClientRect();
          shown = shown && Math.abs(m.left - l.left) < 0.5 && Math.abs(m.right - c.right) < 0.5 && Math.abs(m.top - l.bottom - 6) < 0.5 && btn.scrollWidth <= btn.clientWidth;
          btn.click();
          for (var i = 0; i < 40 && !window.__copied; i++) await new Promise(function(r){ setTimeout(r, 50); });
          var t = document.getElementById('look-toast');
          var r = { shown: shown, url: window.__copied, flash: btn.textContent, toast: t && t.textContent, look: __ll.look() };
          MPPanel.close(); currentRoom = null; isMultiplayerEnabled = false; connectedClients = 0; myRole = 'guest';
          applyPreset('opal'); window.setGravityField(false, 0, 0);
          return r;
        })()`);
        check(inv.shown, 'a room\'s Invite has Room link + current settings, lined up under Copy link | Copy code');
        check(/\?look=2\.[A-Za-z0-9_-]+#K7P2QX$/.test(inv.url || '') && inv.flash === 'Copied' && /room link with your current settings/.test(inv.toast || ''), 'it copies the invite with the settings packed in, ending #CODE', { tail: (inv.url || '').slice(-20), toast: inv.toast });
        await page.send('Page.navigate', { url: inv.url });
        // Before the app settles, the room must not be joined yet.
        let early = null;
        for (let i = 0; i < 200 && !early; i++) {
            early = await page.eval("(window.LookLinks && typeof showConnectedUI === 'function') ? { room: currentRoom, holds: LookLinks.holdsJoin() } : null").catch(() => null);
            if (!early) await sleep(50);
        }
        check(early && early.room === null && early.holds === true, 'opened: the room join waits for the settings', early);
        await settle(page);
        await page.eval(KIT);
        const joined = await until(page, "currentRoom === 'K7P2QX' ? { room: currentRoom, hash: location.hash, search: location.search } : null", 15000);
        const landed2 = await page.eval('__ll.look()');
        const d2 = await page.eval('__ll.diff(' + JSON.stringify(Object.assign({}, inv.look, { lightShiftPath: null })) + ',' + JSON.stringify(Object.assign({}, landed2, { lightShiftPath: null })) + ').slice(0, 6)');
        const toast2 = await page.eval("(document.getElementById('look-toast')||{}).textContent");
        check(!!joined && joined.search === '' && joined.hash === '#K7P2QX', 'then the room is joined and the URL keeps only #CODE', joined);
        check(!d2.length && /Joining the room/.test(toast2 || ''), 'with every setting on first (gravity included), and the toast says it is joining', { d2, toast2 });
        await page.eval("disconnectMultiplayer(); 1");

        // ── 6. Deep links (51) ─────────────────────────────────────────
        const dl = await page.eval(String.raw`(function(){
          var P = OpenInDesktop.parseDeepLink, pl = '2.AZXQuW4TURiG4Tlz';
          return { both: P('swirltogether://join/k7p2qx?look=' + pl), broken: P('swirltogether://join/K7P2QX?look=9.zz'),
            look: P('swirltogether://look/' + pl), old: P('swirltogether://look/1.abcdefgh'),
            url: OpenInDesktop.deepLinkUrl('join', 'K7P2QX', pl) };
        })()`);
        check(dl.both && dl.both.kind === 'join' && dl.both.code === 'K7P2QX' && dl.both.payload === '2.AZXQuW4TURiG4Tlz', 'desktop deep link join/CODE?look=… carries the room and the settings', dl.both);
        check(dl.broken && dl.broken.kind === 'join' && !dl.broken.payload && dl.look && dl.look.payload && dl.old && dl.old.payload === '1.abcdefgh',
            'a broken look still joins; look/2.… and old look/1.… links parse', { broken: dl.broken, look: dl.look, old: dl.old });
        check(dl.url === 'swirltogether://join/K7P2QX?look=2.AZXQuW4TURiG4Tlz', 'and the web offer builds the same link', dl.url);

        // ── 6b. Into a LIVE room (MP_HOST=<local relay> only) ──────────
        // A second Chrome hosts a room on its own look. B opens an invite
        // with settings for it: B's settings go on, B joins, the host's
        // welcome brings the room's shared settings, and B keeps the
        // link's brush (a room never shares brushes). The host's look is
        // untouched: arriving with settings never re-dresses a room.
        if (process.env.MP_HOST) {
            const relay = process.env.MP_HOST;
            const hostPort = PORT + 1;
            const hostProfile = path.join(os.tmpdir(), 'fluid-look-links-host-' + process.pid);
            const hostProc = spawn(CHROME, [
                '--headless=new', '--remote-debugging-port=' + hostPort, '--user-data-dir=' + hostProfile,
                '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
                '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows', 'about:blank'
            ], { stdio: 'ignore' });
            let host;
            try {
                for (let i = 0; i < 80 && !(await portUp(hostPort)); i++) await sleep(250);
                host = await connect(hostPort);
                await host.send('Page.enable', {});
                const pre = "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');" +
                    "localStorage.setItem('fluidMultiplayerHost','" + relay + "');}catch(_){} window.__skipUIFork=true;";
                await host.send('Page.addScriptToEvaluateOnNewDocument', { source: pre });
                await go(host, APP);
                const SET = "function(id, v){ var el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }";
                await host.eval("(function(){ var set = " + SET + "; applyPreset('opal'); set('curl', 41); set('vibrance', 0.3); set('brushSize', 7); window.setGravityField(true, 0, 0.8); createRoom(); return 1; })()");
                const code = await until(host, "(currentRoom && partySocket && partySocket.readyState === 1) ? currentRoom : null", 15000);
                check(!!code, 'live room: the host started ' + code + ' on the local relay');
                // B's own look, and B's link into that room.
                await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('fluidMultiplayerHost','" + relay + "');}catch(_){}" });
                await go(page, APP);
                await page.eval(KIT);
                const link = await page.eval("(async function(){ var set = " + SET + "; applyPreset('bloom'); await new Promise(function(r){ setTimeout(r, 150); }); set('curl', 7); set('vibrance', 0.9); set('brushSize', 2.5); window.setGravityField(false, 0, 0); return LookLinks.url(LookLinks.capture(), null, { room: '" + code + "' }); })()");
                await page.eval("(function(){ applyPreset('currents'); var set = " + SET + "; set('brushSize', 15); return 1; })()");
                await go(page, link);
                const inRoom = await until(page, "(currentRoom === '" + code + "' && partySocket && partySocket.readyState === 1 && connectedClients >= 2) ? connectedClients : null", 15000);
                // Curl steps, Vibrance glides in (06c, ~0.4 s): wait for both to land.
                const welcomed = await until(page, "(+document.getElementById('curl').value === 41 && Math.abs(+document.getElementById('vibrance').value - 0.3) < 1e-9) ? 1 : null", 10000);
                const b = await page.eval("({ curl: +document.getElementById('curl').value, vib: +document.getElementById('vibrance').value, size: +document.getElementById('brushSize').value, g: [config.AMBIENT_FORCE, config.AMBIENT_FORCE_Y] })");
                await sleep(1500);   // anything B sends would have reached the host by now
                const a = await host.eval("({ curl: +document.getElementById('curl').value, vib: +document.getElementById('vibrance').value, size: +document.getElementById('brushSize').value })");
                check(!!inRoom && !!welcomed && b.curl === 41 && Math.abs(b.vib - 0.3) < 1e-9 && b.g[0] === true && Math.abs(b.g[1] - 0.8) < 1e-9,
                    'B joined, and the room\'s shared settings arrived over the link\'s (curl, vibrance, gravity)', { inRoom, b });
                check(Math.abs(b.size - 2.5) < 1e-9, 'B keeps the link\'s brush (size 2.5, not the 15 it had, not the host\'s 7)', b.size);
                check(a.curl === 41 && Math.abs(a.vib - 0.3) < 1e-9 && a.size === 7, 'and the host\'s look is untouched', a);
                await page.eval("disconnectMultiplayer(); localStorage.setItem('fluidMultiplayerHost', '" + DEAD_RELAY + "'); 1");
            } catch (e) {
                fails++;
                log('FAIL live room section: ' + (e && e.message || e));
            } finally {
                try { host && host.close(); } catch (_) {}
                try { hostProc.kill(); } catch (_) {}
                await sleep(300);
                try { fs.rmSync(hostProfile, { recursive: true, force: true }); } catch (_) {}
            }
        } else {
            log('skip live room section (set MP_HOST=<local relay>, e.g. npx wrangler dev --port 8787 --ip 127.0.0.1)');
        }

        // ── 6c. How do I… (js/44) ──────────────────────────────────────
        const help = await page.eval(String.raw`(async function(){
          var hits = (Recipes.search('share my settings link') || []).map(function(r){ return r.id || (r.r && r.r.id); });
          var rec = Recipes.RECIPES.filter(function(r){ return r.id === 'share-settings'; })[0];
          var got = rec ? await Recipes._reveal(rec.target) : null;
          return { hits: hits.slice(0, 3), found: !!rec, el: got && got.el ? got.el.id : null };
        })()`).catch((e) => ({ err: String(e) }));
        check(help.found && help.el === 'shareLookBtn' && (help.hits || []).indexOf('share-settings') !== -1, 'How do I…: "Share my settings as a link" is found and points at the button', help);

        // ── 7. Button audit ────────────────────────────────────────────
        const audit = await page.eval(String.raw`(function(){
          var r = window.auditButtons ? window.auditButtons() : null; if (!r) return null;
          var mine = ['shareLookBtn', 'copyRoomLookBtn'].map(function(id){ return document.getElementById(id); }).filter(Boolean), bad = [];
          r.rules.forEach(function(x){ var sel = x.rule.split('  |  ')[1]; mine.forEach(function(el){ try { if (el.matches(sel)) bad.push(el.id + ' <- ' + x.rule); } catch(_){} }); });
          r.inline.forEach(function(x){ if (mine.some(function(el){ return el.id === x.button; })) bad.push('inline ' + x.button); });
          return { found: mine.length, bad: bad };
        })()`);
        check(audit && audit.found === 2 && !audit.bad.length, 'the button audit passes both new buttons (they take the panel\'s colour)', audit);
    } catch (e) {
        fails++;
        log('FAIL run aborted: ' + (e && e.stack || e));
    } finally {
        try { page && page.close(); } catch (_) {}
        try { proc.kill(); } catch (_) {}
        srv.close();
        await sleep(400);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
        log((fails ? 'FAILED' : 'OK') + '  ' + passes + ' passed, ' + fails + ' failed');
        process.exit(fails ? 1 : 0);
    }
})();
