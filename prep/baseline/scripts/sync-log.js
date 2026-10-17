// prep/baseline/scripts/sync-log.js — F5, the sync baseline.
//
// Two headless Chromes in one room on a LOCAL relay. A fixed sequence of
// changes is made on client A, one action every 250 ms, each by dispatching
// the real control's own events (input / change / click / pointer events on
// the element the user would touch; never an app setter that persists). Every
// WebSocket message B receives, and every one A sends, is logged, normalised
// (timestamps -> 0, connection ids -> tokens, the room code -> <ROOM>, floats
// -> 6 dp) and written to prep/baseline/sync/. The personal controls in the
// sequence (brush size, the Multi-Brush count, Random colour) must NOT reach
// B: log.md says whether they did.
//
//   node prep/baseline/scripts/sync-log.js            capture -> prep/baseline/sync/
//   node prep/baseline/scripts/sync-log.js --check    re-capture into prep/work/sync-check/,
//                                                     diff the normalised log, exit 1 on any difference
//
// The relay: `wrangler dev --port 8787 --ip 127.0.0.1` (party/worker.ts, the
// Cloudflare build of the relay, through node_modules/wrangler/bin/wrangler.js,
// which is what `npx wrangler dev` runs) with its Durable Object state in a
// fresh OS-temp dir (--persist-to), so no room survives from a previous run.
// If it does not print "Ready on" within RELAY_READY_MS, `partykit dev` on 1999
// is tried (node_modules/partykit/dist/bin.mjs, what `npx partykit dev` runs).
// RELAY=host:port skips starting one and uses that relay instead.
//
// Both Chromes come from scripts/test/radial-menu/driver.js (boot(): own
// static server on the repo root, scratch profile, trusted input over CDP)
// and are closed in `finally`; the relay's whole process tree is killed with
// `taskkill /T`. Nothing attaches to port 9333. Env: CHROME (browser path),
// RELAY (use an existing relay), RELAY_PORT (default 8787).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync, execFileSync } = require('child_process');
const { boot, sleep } = require('../../../scripts/test/radial-menu/driver.js');

const ROOT = path.resolve(__dirname, '../../..');
const CHECK = process.argv.includes('--check');
const OUT_DIR = CHECK ? path.join(ROOT, 'prep/work/sync-check') : path.join(ROOT, 'prep/baseline/sync');
const BASELINE_JSON = path.join(ROOT, 'prep/baseline/sync/log.json');
const RELAY_PORT = parseInt(process.env.RELAY_PORT || '8787', 10);
const PARTYKIT_PORT = 1999;
const RELAY_READY_MS = 90000;
const STEP_MS = 250;        // one action per 250 ms (the brief)
const SETTLE_MS = 3000;     // after the last action, before the logs are pulled
const CHROME_ARGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
const problems = [];
const problem = (m) => { problems.push(m); log('PROBLEM ' + m); };

// ── processes: only what this script started may be killed ───────────
// Other agents run their own driver Chromes (same 'fluid-radial-e2e-' profile
// prefix) at the same time, so "every e2e Chrome that was not there before"
// is NOT ours. Each Chrome this script boots gets a unique switch Chrome
// ignores (--fluid-sync-marker=<run>-<A|B>); it names the browser process,
// whose --user-data-dir every child (gpu, utility, renderer, crashpad) also
// carries, so "mine" = command line contains one of MY profile dirs. The
// relay is the node running wrangler/partykit plus its workerd children
// (ParentProcessId). Everything else is reported, never touched.
const RUN_MARK = 'fluid-sync-marker=' + process.pid + '-' + Date.now().toString(36);
function procRows() {
    const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\' OR Name=\'workerd.exe\' OR Name=\'node.exe\'" | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress';
    try {
        const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 30000, windowsHide: true });
        const j = JSON.parse(out || '[]');
        return (Array.isArray(j) ? j : [j]).filter(Boolean).map(r => ({ pid: r.ProcessId, ppid: r.ParentProcessId, name: r.Name, cl: String(r.CommandLine || '') }));
    } catch (e) { problem('process snapshot failed: ' + (e.message || e)); return []; }
}
// mine: { profiles: [profile dir substrings], relayPid, relayTree: [pids] }
function procSnapshot(mine) {
    mine = mine || { profiles: [], relayPid: null, relayTree: [] };
    const rows = procRows();
    const snap = { chromeAll: 0, chromeE2E: 0, chromeE2EOthers: 0, chromeMine: [], workerd: [], workerdMine: [], relayNodeAny: [], relayMine: [], nodeAll: 0 };
    for (const r of rows) {
        if (r.name === 'chrome.exe') {
            snap.chromeAll++;
            if (/fluid-radial-e2e-/.test(r.cl)) {
                snap.chromeE2E++;
                if (mine.profiles.some(p => r.cl.indexOf(p) !== -1)) snap.chromeMine.push(r.pid); else snap.chromeE2EOthers++;
            }
        } else if (r.name === 'workerd.exe') {
            snap.workerd.push(r.pid);
            if (mine.relayPid && (r.ppid === mine.relayPid || mine.relayTree.includes(r.pid))) snap.workerdMine.push(r.pid);
        } else if (r.name === 'node.exe') {
            snap.nodeAll++;
            if (/wrangler|partykit/i.test(r.cl) && !/sync-log\.js/.test(r.cl)) snap.relayNodeAny.push(r.pid);
            if (mine.relayPid && (r.pid === mine.relayPid || r.ppid === mine.relayPid)) snap.relayMine.push(r.pid);
        }
    }
    return snap;
}
// The browser process we just booted: the one chrome.exe whose command line
// carries this boot's marker. Returns { pid, profile } or null.
function findMyChrome(marker) {
    const row = procRows().find(r => r.name === 'chrome.exe' && r.cl.indexOf(marker) !== -1);
    if (!row) return null;
    const m = /--user-data-dir=("?)([^"]*fluid-radial-e2e-\d+)/.exec(row.cl);
    return { pid: row.pid, profile: m ? path.basename(m[2]) : null };
}
function relayTreeOf(pid) {
    return procRows().filter(r => r.ppid === pid || r.pid === pid).map(r => r.pid);
}
function killTree(pid) {
    try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore', windowsHide: true }); return true; } catch (_) { return false; }
}

// ── the relay ────────────────────────────────────────────────────────
async function startRelay(relayLogPath) {
    const info = { tried: [], host: null, kind: null, pid: null, readyMs: null, log: relayLogPath, persistDir: null, command: null };
    const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'fluid-sync-relay-state-'));
    info.persistDir = persist;
    const env = Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false', CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' });
    const attempts = [
        { kind: 'wrangler', host: '127.0.0.1:' + RELAY_PORT, bin: path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
          args: ['dev', '--port', String(RELAY_PORT), '--ip', '127.0.0.1', '--persist-to', persist], ready: /Ready on/i },
        { kind: 'partykit', host: '127.0.0.1:' + PARTYKIT_PORT, bin: path.join(ROOT, 'node_modules/partykit/dist/bin.mjs'),
          args: ['dev', '--port', String(PARTYKIT_PORT)], ready: /Ready on|listening|localhost:1999|127\.0\.0\.1:1999/i }
    ];
    for (const a of attempts) {
        const rec = { kind: a.kind, command: process.execPath + ' ' + a.bin + ' ' + a.args.join(' '), ok: false, note: '' };
        info.tried.push(rec);
        if (!fs.existsSync(a.bin)) { rec.note = 'binary not found'; continue; }
        const fd = fs.openSync(relayLogPath, info.tried.length === 1 ? 'w' : 'a');
        fs.writeSync(fd, '# ' + new Date().toISOString() + ' ' + rec.command + '\n');
        const offset = fs.fstatSync(fd).size;   // only this attempt's output counts toward Ready
        const child = spawn(process.execPath, [a.bin].concat(a.args), { cwd: ROOT, stdio: ['ignore', fd, fd], env, windowsHide: true });
        const started = Date.now();
        let ready = false;
        while (Date.now() - started < RELAY_READY_MS) {
            await sleep(500);
            let txt = '';
            try { txt = fs.readFileSync(relayLogPath, 'utf8').slice(offset); } catch (_) {}
            if (a.ready.test(txt)) { ready = true; break; }
            if (child.exitCode !== null) break;
        }
        fs.closeSync(fd);
        if (ready) {
            rec.ok = true;
            info.host = a.host; info.kind = a.kind; info.pid = child.pid; info.readyMs = Date.now() - started; info.command = rec.command;
            info.child = child;
            return info;
        }
        rec.note = child.exitCode !== null ? 'exited with code ' + child.exitCode : 'no Ready line within ' + RELAY_READY_MS + ' ms';
        killTree(child.pid);
        await sleep(500);
    }
    return info;
}
function stopRelay(info) {
    if (!info || !info.pid) return { killed: false };
    return { killed: killTree(info.pid) };
}
// The --persist-to dir: workerd keeps its SQLite files open for a moment after
// taskkill, so an rmSync right after the kill fails silently (the first four
// runs each left a ~480 KB dir in %TEMP%). Called from `finally` once the
// relay tree is confirmed gone; retries for up to 5 s.
async function removePersistDir(dir) {
    if (!dir) return null;
    for (let i = 0; i < 10 && fs.existsSync(dir); i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
        if (fs.existsSync(dir)) await sleep(500);
    }
    return !fs.existsSync(dir);
}

// ── page-side kit (installed on both clients) ────────────────────────
// __syncLog: every message the current socket receives (recv) and sends
// (sent), raw, with a page-clock t; marks delimit the steps. __syncHook()
// wraps whatever socket `partySocket` is right now; it is called right after
// createRoom()/joinRoom() in the same evaluate (the socket is created
// synchronously there, its messages arrive later), and again before every
// step in case a reconnect replaced it (hooks > 1 is reported).
const KIT = `(function () {
  if (window.__sync) return 'already';
  var L = window.__syncLog = { t0: performance.now(), recv: [], sent: [], marks: [], hooks: 0 };
  var now = function () { return Math.round((performance.now() - L.t0) * 10) / 10; };
  var parse = function (d) { try { return { data: JSON.parse(d) }; } catch (_) { return { raw: String(d).slice(0, 200) }; } };
  window.__syncHook = function () {
    var s = (typeof partySocket !== 'undefined') ? partySocket : null;
    if (!s || s.__syncHooked) return false;
    s.__syncHooked = true; L.hooks++;
    s.addEventListener('message', function (e) { var r = parse(e.data); r.t = now(); L.recv.push(r); });
    var orig = s.send;
    s.send = function (d) { var r = parse(d); r.t = now(); L.sent.push(r); return orig.call(s, d); };
    return true;
  };
  var $ = function (id) { var el = document.getElementById(id); if (!el) throw new Error('no #' + id); return el; };
  var fire = function (el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); };
  window.__sync = {
    mark: function (step, label) { L.marks.push({ t: now(), step: step, label: label }); return L.marks.length; },
    set: function (id, v) { var el = $(id); el.value = String(v); fire(el, 'input'); fire(el, 'change'); return { id: id, value: el.value }; },
    toggle: function (id) { var el = $(id); el.checked = !el.checked; fire(el, 'change'); return { id: id, checked: el.checked }; },
    select: function (id, v) { var el = $(id); var had = Array.prototype.some.call(el.options, function (o) { return o.value === String(v); }); el.value = String(v); fire(el, 'change'); return { id: id, value: el.value, optionExisted: had }; },
    click: function (sel) { var el = document.querySelector(sel); if (!el) throw new Error('no ' + sel); el.click(); return { selector: sel, text: (el.textContent || '').trim().slice(0, 40) }; },
    // The palette: the brush popover's palette <select> (js/64 brushPaletteStrip,
    // .cp-pal-select), opened for the top bar's colour well, next palette in the list.
    palette: function (delta) {
      var well = $('colorPicker');
      if (!(window.ColourPicker && ColourPicker.openFor)) throw new Error('no ColourPicker');
      if (!ColourPicker.isOpen()) ColourPicker.openFor(well);
      var sel = document.querySelector('.cp-pop .cp-pal-select');
      if (!sel) throw new Error('no .cp-pal-select in the popover');
      var n = sel.options.length, from = parseInt(sel.value, 10) || 0;
      var to = (from + delta + n) % n;
      sel.value = String(to); fire(sel, 'change');
      var name = sel.options[to] ? sel.options[to].textContent : null;
      ColourPicker.close();
      return { from: from, to: to, count: n, name: name, popoverClosed: !ColourPicker.isOpen() };
    },
    // Gravity: the aim pad in Effects (js/20 wirePressureField). The section is
    // opened through its own title button if collapsed (the pad has no box
    // otherwise), the Constant checkbox is switched on through its change
    // event (it seeds (0, 0.6)), then a pointer tap at 50% / 90% of the pad
    // aims it to (0, 0.8); the click that a real tap also produces makes
    // 06b's send cadence pick the change up at once instead of on its 1 s poll.
    gravity: function () {
      var pad = $('pressurePad'), check = $('pressureConstant'), wrap = $('pressureFieldControls');
      var out = { sectionOpened: null };
      var sec = pad.closest('.sidebar-section');
      var title = sec && sec.querySelector('.section-title');
      if (title && title.getAttribute('aria-expanded') !== 'true') { title.click(); out.sectionOpened = title.getAttribute('aria-expanded'); }
      if (!check.checked) { check.checked = true; fire(check, 'change'); }
      out.wrapVisible = getComputedStyle(wrap).display !== 'none';
      var r = pad.getBoundingClientRect();
      out.rect = { w: Math.round(r.width), h: Math.round(r.height) };
      var x = r.left + r.width * 0.5, y = r.top + r.height * 0.9;
      var pe = function (type) { pad.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: y })); };
      pe('pointerdown'); pe('pointerup');
      pad.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      var c = window.config || {};
      out.after = { on: !!c.AMBIENT_FORCE, x: Math.round(c.AMBIENT_FORCE_X * 1000) / 1000, y: Math.round(c.AMBIENT_FORCE_Y * 1000) / 1000 };
      out.sectionExpandedAfter = title ? title.getAttribute('aria-expanded') : null;
      return out;
    },
    state: function () {
      var v = function (id) { var el = document.getElementById(id); return el ? el.value : null; };
      var ck = function (id) { var el = document.getElementById(id); return el ? !!el.checked : null; };
      var c = window.config || {};
      return {
        curl: +v('curl'), glowToggle: ck('glowToggle'), breathPattern: v('breathPattern'),
        paletteIndex: window.currentPaletteIndex, brushSize: +v('brushSize'), multiplier: +v('multiplier'),
        randomColor: ck('randomColor'), fpsCap: v('fpsCap'),
        gravity: { on: !!c.AMBIENT_FORCE, x: Math.round((c.AMBIENT_FORCE_X || 0) * 1e6) / 1e6, y: Math.round((c.AMBIENT_FORCE_Y || 0) * 1e6) / 1e6 },
        materialActive: !!(window.MaterialModes && MaterialModes.active && MaterialModes.active()),
        connectedClients: (typeof connectedClients !== 'undefined') ? connectedClients : null,
        role: (typeof myRole !== 'undefined') ? myRole : null,
        socketOpen: !!(typeof partySocket !== 'undefined' && partySocket && partySocket.readyState === 1)
      };
    },
    env: function () {
      return {
        viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
        uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null,
        displayHz: window.__displayHz || null, ua: navigator.userAgent,
        deviceUid: (typeof DEVICE_UID !== 'undefined') ? DEVICE_UID : null,
        relayHost: (typeof PARTYKIT_HOST !== 'undefined') ? PARTYKIT_HOST : null,
        lookBaselineGen: window.LOOK_BASELINE_GEN
      };
    },
    pull: function () { return { t0: L.t0, recv: L.recv, sent: L.sent, marks: L.marks, hooks: L.hooks }; }
  };
  return 'installed';
})()`;

// ── the fixed sequence (run on A) ────────────────────────────────────
const SEQUENCE = [
    { id: 1, label: 'curl 10 (#curl, shared slider, step 1 of 4)', expr: "__sync.set('curl', 10)", shared: true },
    { id: 2, label: 'curl 20', expr: "__sync.set('curl', 20)", shared: true },
    { id: 3, label: 'curl 30', expr: "__sync.set('curl', 30)", shared: true },
    { id: 4, label: 'curl 40', expr: "__sync.set('curl', 40)", shared: true },
    { id: 5, label: 'Glow toggle (#glowToggle, shared checkbox)', expr: "__sync.toggle('glowToggle')", shared: true },
    { id: 6, label: 'Breathing pattern -> box (#breathPattern, shared select)', expr: "__sync.select('breathPattern', 'box')", shared: true },
    { id: 7, label: 'palette: next in the list (.cp-pal-select in the colour popover)', expr: '__sync.palette(1)', shared: true },
    { id: 8, label: 'preset apply: Liquid opal (.mixer-preset-btn[data-preset="opal"] click)', expr: '__sync.click(\'.mixer-preset-btn[data-preset="opal"]\')', shared: true },
    { id: 9, label: 'brush size 7 (#brushSize, PERSONAL: must not arrive)', expr: "__sync.set('brushSize', 7)", shared: false, personalKeys: ['sliders.brushSize'] },
    { id: 10, label: 'Multi-Brush arms 3 (#multiplier, brush category, PERSONAL)', expr: "__sync.set('multiplier', 3)", shared: false, personalKeys: ['sliders.multiplier'] },
    { id: 11, label: 'Random colour toggle (#randomColor, Brush section checkbox, PERSONAL)', expr: "__sync.toggle('randomColor')", shared: false, personalKeys: ['checkboxes.randomColor', 'colors.brush'] },
    { id: 12, label: 'gravity pad write (Constant on + tap at (0, +0.8))', expr: '__sync.gravity()', shared: true },
    { id: 13, label: 'Clear (the strip\'s Clear button, onclick="clearCanvas()")', expr: '__sync.click(\'button[onclick*="clearCanvas"]\')', shared: true }
];

// ── normalisation ────────────────────────────────────────────────────
function roundFloats(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6;
    if (Array.isArray(v)) return v.map(roundFloats);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = roundFloats(v[k]); }); return o; }
    return v;
}
function lookKeys(snap) {
    const out = [];
    Object.keys(snap || {}).sort().forEach(k => {
        if (k === 'baseline') return;
        if ((k === 'sliders' || k === 'checkboxes' || k === 'selects') && snap[k] && typeof snap[k] === 'object') Object.keys(snap[k]).sort().forEach(kk => out.push(k + '.' + kk));
        else out.push(k);
    });
    return out;
}
function makeNormaliser(ids, roomCode) {
    const idToken = (id) => (id == null ? id : (ids[id] || ('<peer:' + String(id).slice(0, 4) + '>')));
    const scrub = (v) => {
        if (typeof v === 'string') { return roomCode && v.indexOf(roomCode) !== -1 ? v.split(roomCode).join('<ROOM>') : v; }
        if (Array.isArray(v)) return v.map(scrub);
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = scrub(v[k]); return o; }
        return v;
    };
    return function normalise(rec, dir) {
        if (!rec.data) return { dir, type: '<unparsed>', keys: [], payload: rec.raw || null };
        const d = scrub(rec.data);
        const p = Object.assign({}, d);
        if ('timestamp' in p) p.timestamp = 0;
        if ('clientId' in p) p.clientId = idToken(p.clientId);
        if ('hostId' in p) p.hostId = idToken(p.hostId);
        if (p.type === 'peer-left' && 'id' in p) p.id = idToken(p.id);
        let keys = Object.keys(p).filter(k => k !== 'type' && k !== 'timestamp' && k !== 'clientId').sort();
        if (p.type === 'room-look') keys = ['full=' + !!p.full].concat(lookKeys(p.snapshot));
        return { dir, type: p.type, keys, payload: roundFloats(p) };
    };
}
function attribute(records, marks) {
    // The step a message belongs to: the last mark at or before its t (0 = join phase).
    return records.map(r => {
        let step = 0, label = 'join';
        for (const m of marks) { if (m.t <= r.t) { step = m.step; label = m.label; } else break; }
        return Object.assign({ step, stepLabel: label, t: r.t }, r);
    });
}

// ── deep diff for --check ────────────────────────────────────────────
function diff(a, b, pathStr, out) {
    if (out.length > 60) return;
    if (a === b) return;
    const ta = Array.isArray(a) ? 'array' : typeof a, tb = Array.isArray(b) ? 'array' : typeof b;
    if (ta !== tb || a === null || b === null || ta !== 'object' && ta !== 'array') { out.push(pathStr + ': baseline=' + JSON.stringify(a) + ' now=' + JSON.stringify(b)); return; }
    if (ta === 'array') {
        if (a.length !== b.length) out.push(pathStr + '.length: baseline=' + a.length + ' now=' + b.length);
        for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], pathStr + '[' + i + ']', out);
        return;
    }
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of keys) {
        if (!(k in a)) { out.push(pathStr + '.' + k + ': missing in baseline, now=' + JSON.stringify(b[k]).slice(0, 120)); continue; }
        if (!(k in b)) { out.push(pathStr + '.' + k + ': missing now, baseline=' + JSON.stringify(a[k]).slice(0, 120)); continue; }
        diff(a[k], b[k], pathStr + '.' + k, out);
    }
}

// ── helpers ──────────────────────────────────────────────────────────
async function until(page, expr, ms, every) {
    const t = Date.now();
    for (;;) {
        const v = await page.ev(expr).catch(() => null);
        if (v) return v;
        if (Date.now() - t > (ms || 10000)) return null;
        await sleep(every || 100);
    }
}
function headCommit() { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return null; } }

// ── main ─────────────────────────────────────────────────────────────
async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const result = { kind: CHECK ? 'check' : 'capture', generated: new Date().toISOString(), env: {}, relay: null, processes: {}, sequence: SEQUENCE.map(s => ({ id: s.id, label: s.label, shared: s.shared })), steps: [], compared: null, raw: null, problems };
    const mine = { profiles: [], relayPid: null, relayTree: [], chromePids: [] };
    const before = procSnapshot(mine);
    result.processes.before = { chromeAll: before.chromeAll, driverChromes: before.chromeE2E, workerd: before.workerd.length, relayNodes: before.relayNodeAny.length, nodeAll: before.nodeAll };
    if (before.chromeE2E || before.workerd.length || before.relayNodeAny.length) log('note: other processes present at start, left alone: driver Chrome processes ' + before.chromeE2E + ', workerd ' + before.workerd.join(',') + ', relay node ' + before.relayNodeAny.join(','));
    log('processes before: chrome ' + before.chromeAll + ' (driver ' + before.chromeE2E + '), workerd ' + before.workerd.length + ', relay node ' + before.relayNodeAny.length);

    let relay = null, A = null, B = null, exitCode = 0;
    try {
        // 1. relay
        if (process.env.RELAY) {
            relay = { host: process.env.RELAY, kind: 'external (RELAY env)', pid: null, tried: [], log: null, command: null, readyMs: null, persistDir: null };
            log('using external relay ' + relay.host);
        } else {
            relay = await startRelay(path.join(OUT_DIR, 'relay.log'));
            if (!relay.host) throw new Error('no relay could be started: ' + JSON.stringify(relay.tried));
            mine.relayPid = relay.pid;
            mine.relayTree = relayTreeOf(relay.pid);
            log('relay ' + relay.kind + ' ready on ' + relay.host + ' after ' + relay.readyMs + ' ms (pid ' + relay.pid + ', tree ' + mine.relayTree.join(',') + ')');
        }
        result.relay = { kind: relay.kind, host: relay.host, pid: relay.pid, readyMs: relay.readyMs, command: relay.command, tried: relay.tried, log: relay.log ? path.relative(ROOT, relay.log) : null, persistDir: relay.persistDir ? '(OS temp, removed after the run)' : null };

        // 2. two clients. The seed is what the app reads for the relay
        // (js/06a-mp-core.js:69 'fluidMultiplayerHost'), the device id the app
        // would otherwise mint at random (06a:44; it travels only in the WS URL,
        // pinned so the relay's host election reads the same every run), and the
        // one-time Reset-app note (F0 found it appearing ~4 s after a quiet boot).
        const seedFor = (who) => ({ fluidMultiplayerHost: relay.host, fluidDeviceId: 'BASELINE' + who, 'swirlResetHint.v1': '1' });
        const claim = (who) => {
            const me = findMyChrome(RUN_MARK + '-' + who);
            if (!me) { problem('could not find the browser process of client ' + who + ' by its marker'); return; }
            mine.chromePids.push(me.pid);
            if (me.profile) mine.profiles.push(me.profile);
            log('client ' + who + ' is chrome pid ' + me.pid + ', profile ' + me.profile);
        };
        log('booting client A');
        A = await boot({ seed: seedFor('A'), args: CHROME_ARGS.concat(['--' + RUN_MARK + '-A']) });
        claim('A');
        log('booting client B');
        B = await boot({ seed: seedFor('B'), args: CHROME_ARGS.concat(['--' + RUN_MARK + '-B']) });
        claim('B');
        if (A.url === B.url) throw new Error('the two clients share one static server URL (' + A.url + '): a debug-port collision in the driver; re-run');
        const same = await A.ev('location.href') === await B.ev('location.href');
        if (same) throw new Error('both CDP sessions evaluate against the same page (debug-port collision in the driver); re-run');

        const ver = await A.send('Browser.getVersion');
        for (const [name, P] of [['A', A], ['B', B]]) {
            await P.ev(KIT);
            const e = await P.ev('__sync.env()');
            result.env[name] = e;
            // Pin: the FPS Limit select's options and value follow the display
            // refresh rate the app measures at boot (js/05d-input-replay.js:724,
            // F0 saw 144 Hz one run and 120 Hz the next); it is a shared select,
            // so it would ride the host's welcome. '0' (Uncapped) exists at every
            // Hz. Set through the real select's change event before the room exists.
            const pin = await P.ev("__sync.select('fpsCap', '0')");
            result.env[name].fpsCapPinned = pin;
        }
        result.env.chrome = ver.product; result.env.jsVersion = ver.jsVersion; result.env.protocol = ver.protocolVersion;
        result.env.head = headCommit(); result.env.node = process.version; result.env.os = os.platform() + ' ' + os.release();
        result.env.stepMs = STEP_MS; result.env.settleMs = SETTLE_MS;
        log('Chrome ' + ver.product + ', viewport ' + result.env.A.viewport.join('x') + ' dpr ' + result.env.A.dpr + ' ui-scale ' + result.env.A.uiScale + ', relay host seen by the app: ' + result.env.A.relayHost);
        await sleep(300);

        // 3. A creates the room, B joins. The hook goes on in the same
        // evaluate as the call that creates the socket.
        const aState0 = await A.ev('__sync.state()');
        result.env.A.beforeRoom = aState0;
        result.env.B.beforeRoom = await B.ev('__sync.state()');
        await A.ev('(function(){ createRoom(); return __syncHook(); })()');
        const code = await until(A, "(currentRoom && partySocket && partySocket.readyState === 1 && connectedClients >= 1) ? currentRoom : null", 15000);
        if (!code) throw new Error('A never connected to a room on ' + relay.host);
        log('A created room ' + code);
        await B.ev('(function(){ joinRoom(' + JSON.stringify(code) + '); return __syncHook(); })()');
        const both = await until(B, "(currentRoom === " + JSON.stringify(code) + " && partySocket && partySocket.readyState === 1 && connectedClients >= 2) ? connectedClients : null", 15000);
        const aTwo = await until(A, 'connectedClients >= 2 ? connectedClients : null', 15000);
        if (!both || !aTwo) throw new Error('the two clients never saw each other (B: ' + both + ', A: ' + aTwo + ')');
        log('B joined; both see 2 clients');
        // The host's welcome (06b scheduleRoomLookWelcome, 500 ms) lands on B.
        const welcomed = await until(B, "__syncLog.recv.some(function(r){ return r.data && r.data.type === 'room-look' && r.data.full; }) ? 1 : null", 6000);
        if (!welcomed) problem('no full room-look welcome reached B within 6 s of the join');
        await sleep(1500);   // glide (06c, tau 140 ms) and the 1 s poll settle
        result.env.A.afterJoin = await A.ev('__sync.state()');
        result.env.B.afterJoin = await B.ev('__sync.state()');

        // 4. the sequence
        for (const s of SEQUENCE) {
            await B.ev('__sync.mark(' + s.id + ', ' + JSON.stringify(s.label) + ')');
            await A.ev('__sync.mark(' + s.id + ', ' + JSON.stringify(s.label) + '); __syncHook();');
            let r, err = null;
            try { r = await A.ev(s.expr); } catch (e) { err = e.message || String(e); problem('step ' + s.id + ' threw: ' + err); }
            result.steps.push({ id: s.id, label: s.label, shared: s.shared, result: r === undefined ? null : r, error: err });
            log('step ' + s.id + ' ' + s.label + (r ? ' -> ' + JSON.stringify(r).slice(0, 100) : '') + (err ? ' ERR ' + err : ''));
            await sleep(STEP_MS);
        }
        await sleep(SETTLE_MS);

        // 5. pull
        const rawA = await A.ev('__sync.pull()');
        const rawB = await B.ev('__sync.pull()');
        const landedA = await A.ev('__sync.state()');
        const landedB = await B.ev('__sync.state()');
        if (rawA.hooks !== 1) problem('A hooked ' + rawA.hooks + ' sockets (a reconnect happened)');
        if (rawB.hooks !== 1) problem('B hooked ' + rawB.hooks + ' sockets (a reconnect happened)');

        // ids: connection ids come from each side's own 'connected'
        const idOf = (raw) => { const c = raw.recv.find(r => r.data && r.data.type === 'connected'); return c ? c.data.clientId : null; };
        const ids = {}; const idA = idOf(rawA), idB = idOf(rawB);
        if (idA) ids[idA] = '<A>'; if (idB) ids[idB] = '<B>';
        const norm = makeNormaliser(ids, code);
        const bRecv = attribute(rawB.recv.map(r => Object.assign({ t: r.t }, norm(r, 'B.recv'))), rawB.marks);
        const aSent = attribute(rawA.sent.map(r => Object.assign({ t: r.t }, norm(r, 'A.sent'))), rawA.marks);
        const aRecv = attribute(rawA.recv.map(r => Object.assign({ t: r.t }, norm(r, 'A.recv'))), rawA.marks);
        const bSent = attribute(rawB.sent.map(r => Object.assign({ t: r.t }, norm(r, 'B.sent'))), rawB.marks);
        const strip = (list) => list.map(({ step, stepLabel, dir, type, keys, payload }) => ({ step, stepLabel, dir, type, keys, payload }));

        // personal keys: must be absent from everything B received
        const personal = {};
        SEQUENCE.filter(s => s.personalKeys).forEach(s => s.personalKeys.forEach(k => {
            personal[k] = { step: s.id, arrivedIn: bRecv.filter(m => m.type === 'room-look' && m.keys.includes(k)).map(m => ({ step: m.step, t: m.t })) };
        }));
        const landed = { A: landedA, B: landedB };
        result.compared = { bRecv: strip(bRecv), aSent: strip(aSent), aRecv: strip(aRecv), bSent: strip(bSent), personalAbsent: Object.fromEntries(Object.entries(personal).map(([k, v]) => [k, v.arrivedIn.length === 0])),
            landed, stepResults: result.steps.map(s => ({ id: s.id, result: s.result && typeof s.result === 'object' ? Object.fromEntries(Object.entries(s.result).filter(([k]) => k !== 'rect')) : s.result, error: s.error })) };
        result.timing = { bRecv: bRecv.map(m => ({ step: m.step, type: m.type, t: m.t })), aSent: aSent.map(m => ({ step: m.step, type: m.type, t: m.t })), marksB: rawB.marks, marksA: rawA.marks };
        result.personal = personal;
        result.raw = { ids: { A: idA, B: idB }, room: code, A: rawA, B: rawB };
        result.counts = { bRecv: bRecv.length, aSent: aSent.length, aRecv: aRecv.length, bSent: bSent.length,
            bRecvByType: countBy(bRecv, 'type'), aSentByType: countBy(aSent, 'type'), roomLookToB: bRecv.filter(m => m.type === 'room-look').length,
            personalLeaked: Object.values(personal).filter(v => v.arrivedIn.length).length };
        log('B received ' + bRecv.length + ' messages (' + JSON.stringify(result.counts.bRecvByType) + '); A sent ' + aSent.length);
        for (const [k, v] of Object.entries(personal)) log('personal ' + k + ': ' + (v.arrivedIn.length ? 'ARRIVED in steps ' + v.arrivedIn.map(a => a.step).join(',') : 'absent'));
    } catch (e) {
        problem('run aborted: ' + (e && e.stack || e));
        exitCode = 2;
    } finally {
        // The driver's close() ends the browser process (child.kill); its gpu /
        // utility / renderer children notice the lost channel and exit on their
        // own, which takes a moment. Wait for MY processes (by profile dir) to
        // be gone, and only if some remain, kill those trees. The relay tree is
        // killed by pid (taskkill /T) and verified the same way.
        try { if (B) await B.close(); } catch (_) {}
        try { if (A) await A.close(); } catch (_) {}
        const stopped = stopRelay(relay);
        let after = null, waited = 0;
        for (;;) {
            after = procSnapshot(mine);
            if ((!after.chromeMine.length && !after.workerdMine.length && !after.relayMine.length) || waited >= 8000) break;
            await sleep(500); waited += 500;
        }
        let killed = [];
        if (after.chromeMine.length || after.workerdMine.length || after.relayMine.length) {
            killed = after.chromeMine.concat(after.workerdMine, after.relayMine);
            problem('own processes still alive ' + waited + ' ms after close (killed by pid): chrome ' + after.chromeMine.join(',') + ' workerd ' + after.workerdMine.join(',') + ' relay ' + after.relayMine.join(','));
            killed.forEach(killTree);
            await sleep(800);
            after = procSnapshot(mine);
        }
        const persistRemoved = await removePersistDir(relay && relay.persistDir);
        if (persistRemoved === false) problem('relay --persist-to dir still present after the run: ' + relay.persistDir);
        result.processes.after = { chromeAll: after.chromeAll, driverChromes: after.chromeE2E, driverChromesOthers: after.chromeE2EOthers, ownChromeLeft: after.chromeMine.length, workerd: after.workerd.length, ownWorkerdLeft: after.workerdMine.length, relayNodes: after.relayNodeAny.length, ownRelayLeft: after.relayMine.length, nodeAll: after.nodeAll, relayKilled: stopped.killed, persistDirRemoved: persistRemoved, waitedMs: waited, killedByPid: killed, ownChromePids: mine.chromePids, ownProfiles: mine.profiles, relayPid: mine.relayPid, relayTree: mine.relayTree };
        if (after.chromeMine.length || after.workerdMine.length || after.relayMine.length) problem('own processes STILL alive after kill: ' + JSON.stringify({ chrome: after.chromeMine, workerd: after.workerdMine, relay: after.relayMine }));
        log('processes after: chrome ' + after.chromeAll + ' (driver ' + after.chromeE2E + ', of which others\' ' + after.chromeE2EOthers + ', own ' + after.chromeMine.length + '), workerd ' + after.workerd.length + ' (own ' + after.workerdMine.length + '), relay node ' + after.relayNodeAny.length + ' (own ' + after.relayMine.length + ')' + (waited ? ', own children took ' + waited + ' ms to exit' : '') + (persistRemoved == null ? '' : ', relay persist dir removed: ' + persistRemoved));
    }

    // 6. write
    fs.writeFileSync(path.join(OUT_DIR, 'log.json'), JSON.stringify(result, null, 1));
    fs.writeFileSync(path.join(OUT_DIR, 'log.md'), renderLogMd(result));
    if (!CHECK) fs.writeFileSync(path.join(OUT_DIR, 'relay.md'), renderRelayMd(result));
    log('wrote ' + path.relative(ROOT, OUT_DIR) + '/log.json, log.md' + (CHECK ? '' : ', relay.md'));

    // 7. check
    if (CHECK) {
        const lines = [];
        if (!fs.existsSync(BASELINE_JSON)) { lines.push('CHECK FAIL: no baseline at ' + BASELINE_JSON); exitCode = 1; }
        else if (!result.compared) { lines.push('CHECK FAIL: the re-capture did not complete'); exitCode = 1; }
        else {
            const base = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf8'));
            const diffs = [];
            diff(base.compared, result.compared, 'compared', diffs);
            if (diffs.length) { lines.push('CHECK FAIL: ' + diffs.length + (diffs.length > 60 ? '+' : '') + ' difference(s) against the baseline'); diffs.forEach(d => lines.push('  ' + d)); exitCode = 1; }
            else lines.push('CHECK PASS: B received ' + result.counts.bRecv + ' messages (' + result.counts.roomLookToB + ' room-look), A sent ' + result.counts.aSent + ', personal keys absent, landed state identical to the baseline');
            fs.writeFileSync(path.join(OUT_DIR, 'diff.json'), JSON.stringify(diffs, null, 1));
        }
        if (problems.length) lines.push('problems: ' + problems.join(' | '));
        fs.writeFileSync(path.join(OUT_DIR, 'check-run.log'), lines.join('\n') + '\n');
        lines.forEach(l => console.log(l));
    } else if (problems.length) {
        console.log('problems: ' + problems.join(' | '));
    }
    process.exit(exitCode);
}

function countBy(list, k) { const o = {}; list.forEach(m => { o[m[k]] = (o[m[k]] || 0) + 1; }); return o; }

// ── renderers ────────────────────────────────────────────────────────
function renderLogMd(r) {
    const L = [];
    const c = r.compared;
    L.push('# Sync baseline (F5) — ' + (r.kind === 'check' ? 'check re-capture' : 'capture'));
    L.push('');
    L.push('Two headless Chromes in one room on a local relay; a fixed sequence on A, one action per ' + (r.env.stepMs || STEP_MS) + ' ms; every message B received, normalised. Generated ' + r.generated + ' by `prep/baseline/scripts/sync-log.js`' + (r.kind === 'check' ? ' --check' : '') + '.');
    L.push('');
    L.push('## Environment');
    L.push('');
    L.push('| Fact | Value |');
    L.push('|---|---|');
    L.push('| Chrome | ' + (r.env.chrome || '?') + ' (V8 ' + (r.env.jsVersion || '?') + ', protocol ' + (r.env.protocol || '?') + ') |');
    L.push('| Viewport / DPR / `--ui-scale` | ' + (r.env.A ? r.env.A.viewport.join('×') + ' / ' + r.env.A.dpr + ' / ' + r.env.A.uiScale : '?') + ' (both clients) |');
    L.push('| Display Hz the app measured | A ' + (r.env.A && r.env.A.displayHz) + ', B ' + (r.env.B && r.env.B.displayHz) + ' (FPS Limit pinned to Uncapped on both before the room, see NOTES) |');
    L.push('| HEAD | `' + r.env.head + '` |');
    L.push('| Node / OS | ' + r.env.node + ' / ' + r.env.os + ' |');
    L.push('| Relay | ' + (r.relay ? r.relay.kind + ' on `' + r.relay.host + '`' + (r.relay.readyMs != null ? ', ready after ' + r.relay.readyMs + ' ms' : '') : 'none') + ' |');
    L.push('| Relay host the app resolved | A `' + (r.env.A && r.env.A.relayHost) + '`, B `' + (r.env.B && r.env.B.relayHost) + '` (from the seeded `fluidMultiplayerHost`) |');
    L.push('| Device ids (seeded) | A `' + (r.env.A && r.env.A.deviceUid) + '`, B `' + (r.env.B && r.env.B.deviceUid) + '` |');
    L.push('| Room | `' + (r.raw && r.raw.room) + '` (random per run; appears nowhere in the messages, normalised to `<ROOM>` if it did) |');
    L.push('| Connection ids | A `' + (r.raw && r.raw.ids.A) + '` → `<A>`, B `' + (r.raw && r.raw.ids.B) + '` → `<B>` |');
    L.push('| Roles after join | A ' + (r.env.A && r.env.A.afterJoin && r.env.A.afterJoin.role) + ', B ' + (r.env.B && r.env.B.afterJoin && r.env.B.afterJoin.role) + ' |');
    L.push('| Material mode active | A ' + (r.env.A && r.env.A.afterJoin && r.env.A.afterJoin.materialActive) + ' (so `#curl` travels as `sliders.curl`, not as the material macro) |');
    L.push('| Look baseline generation | ' + (r.env.A && r.env.A.lookBaselineGen) + ' |');
    const pb = r.processes.before || {}, pa = r.processes.after || {};
    L.push('| Processes before → after | chrome.exe ' + pb.chromeAll + ' → ' + pa.chromeAll + ' (driver Chromes ' + pb.driverChromes + ' → ' + pa.driverChromes + ', of which other agents\' ' + pa.driverChromesOthers + ', own left ' + pa.ownChromeLeft + '); workerd ' + pb.workerd + ' → ' + pa.workerd + ' (own left ' + pa.ownWorkerdLeft + '); relay node ' + pb.relayNodes + ' → ' + pa.relayNodes + ' (own left ' + pa.ownRelayLeft + '). Own Chrome pids ' + (pa.ownChromePids || []).join(', ') + ', relay pid ' + pa.relayPid + ' (tree ' + (pa.relayTree || []).join(', ') + '); children took ' + pa.waitedMs + ' ms to exit after close' + (pa.killedByPid && pa.killedByPid.length ? '; killed by pid: ' + pa.killedByPid.join(', ') : '') + (pa.persistDirRemoved == null ? '' : '; relay persist dir removed: ' + pa.persistDirRemoved) + ' |');
    L.push('');
    if (!c) { L.push('**The run did not complete.** Problems: ' + r.problems.join(' | ')); return L.join('\n') + '\n'; }
    L.push('## Counts');
    L.push('');
    L.push('| Direction | Messages | By type |');
    L.push('|---|---|---|');
    L.push('| B received | ' + c.bRecv.length + ' | ' + fmtCounts(countBy(c.bRecv, 'type')) + ' |');
    L.push('| A sent | ' + c.aSent.length + ' | ' + fmtCounts(countBy(c.aSent, 'type')) + ' |');
    L.push('| A received | ' + c.aRecv.length + ' | ' + fmtCounts(countBy(c.aRecv, 'type')) + ' |');
    L.push('| B sent | ' + c.bSent.length + ' | ' + fmtCounts(countBy(c.bSent, 'type')) + ' |');
    L.push('');
    L.push('## Step → what B received');
    L.push('');
    L.push('`t` is B\'s page clock in ms since the kit was installed; keys are the message\'s fields, or for `room-look` `full=` plus the look sections / keys the delta carries. Values in the last column are the normalised payload for the keys the step changed.');
    L.push('');
    L.push('| Step | Action on A | A sent (type, t) | B received (type, keys, t) | Values that landed |');
    L.push('|---|---|---|---|---|');
    const byStepB = groupBy(c.bRecv, 'step'), byStepA = groupBy(c.aSent, 'step');
    const tB = groupBy(r.timing ? r.timing.bRecv : [], 'step'), tA = groupBy(r.timing ? r.timing.aSent : [], 'step');
    const rows = [{ id: 0, label: 'join: A `createRoom()`, B `joinRoom(code)`, the host\'s welcome' }].concat(r.sequence);
    for (const s of rows) {
        const bs = byStepB[s.id] || [], as = byStepA[s.id] || [];
        const aTxt = as.length ? as.map((m, i) => '`' + m.type + (m.type === 'room-look' ? (m.payload.full ? ' full' : ' Δ') : '') + '` ' + (tA[s.id] && tA[s.id][i] ? Math.round(tA[s.id][i].t) : '') ).join('<br>') : '—';
        const bTxt = bs.length ? bs.map((m, i) => '`' + m.type + '` ' + (tB[s.id] && tB[s.id][i] ? Math.round(tB[s.id][i].t) : '') + '<br>' + m.keys.map(k => '`' + k + '`').join(' ')).join('<br>') : '— (nothing)';
        const vals = bs.filter(m => m.type === 'room-look').map(m => summariseLook(m.payload.snapshot, m.payload.full)).join('<br>');
        L.push('| ' + s.id + ' | ' + s.label.replace(/\|/g, '\\|') + ' | ' + aTxt + ' | ' + bTxt + ' | ' + (vals || (bs.some(m => m.type === 'clear') ? 'B ran `clearCanvas()` for the peer' : '')) + ' |');
    }
    L.push('');
    L.push('## Personal controls: confirmed absent from everything B received');
    L.push('');
    L.push('| Key | Changed in step | In any `room-look` B received |');
    L.push('|---|---|---|');
    for (const [k, v] of Object.entries(r.personal || {})) L.push('| `' + k + '` | ' + v.step + ' | ' + (v.arrivedIn.length ? '**ARRIVED** (steps ' + v.arrivedIn.map(a => a.step).join(', ') + ')' : 'absent') + ' |');
    L.push('');
    L.push('Dropped by `dropPersonal` (js/06b-mp-look.js:80-94, via `isPersonalSlider` 06b:70-75): `brushSize` and `multiplier` are `category: "brush"` sliders (js/01a-param-registry.js:110-111 → `ROOM_LOOK_PERSONAL.sliderCategories`, 06b:56), `randomColor` is in `ROOM_LOOK_PERSONAL.checkboxes` (06b:57), and `colors.brush` is cut to `colors.background` (06b:90-93).');
    L.push('');
    L.push('## What landed on each side after the sequence (+' + (r.env.settleMs || SETTLE_MS) + ' ms)');
    L.push('');
    L.push('| Value | A (acted) | B (received) | Shared? |');
    L.push('|---|---|---|---|');
    const la = c.landed.A, lb = c.landed.B;
    const row = (name, a, b, shared) => L.push('| ' + name + ' | ' + JSON.stringify(a) + ' | ' + JSON.stringify(b) + ' | ' + shared + ' |');
    row('`#curl`', la.curl, lb.curl, 'yes (glides on B, 06c)');
    row('`#glowToggle`', la.glowToggle, lb.glowToggle, 'yes');
    row('`#breathPattern`', la.breathPattern, lb.breathPattern, 'yes');
    row('palette index', la.paletteIndex, lb.paletteIndex, 'yes (`paletteIndex`, `savedColors`)');
    row('gravity', la.gravity, lb.gravity, 'yes (`gravity`)');
    row('`#brushSize`', la.brushSize, lb.brushSize, 'NO (personal)');
    row('`#multiplier`', la.multiplier, lb.multiplier, 'NO (personal)');
    row('`#randomColor`', la.randomColor, lb.randomColor, 'NO (personal)');
    row('`#fpsCap`', la.fpsCap, lb.fpsCap, 'yes (pinned to 0 on both before the room)');
    L.push('');
    L.push('## Join phase, in order');
    L.push('');
    L.push('| # | Direction | Type | Keys | Payload (normalised, trimmed) |');
    L.push('|---|---|---|---|---|');
    const joinMsgs = [].concat(c.aSent.filter(m => m.step === 0).map(m => Object.assign({ who: 'A sent' }, m)), c.aRecv.filter(m => m.step === 0).map(m => Object.assign({ who: 'A recv' }, m)), c.bSent.filter(m => m.step === 0).map(m => Object.assign({ who: 'B sent' }, m)), c.bRecv.filter(m => m.step === 0).map(m => Object.assign({ who: 'B recv' }, m)));
    joinMsgs.forEach((m, i) => L.push('| ' + (i + 1) + ' | ' + m.who + ' | `' + m.type + '` | ' + m.keys.slice(0, 12).map(k => '`' + k + '`').join(' ') + (m.keys.length > 12 ? ' … (' + m.keys.length + ')' : '') + ' | ' + trimJson(m.payload, 160) + ' |'));
    L.push('');
    L.push('## Full welcome: the look A sent B (`room-look full=true`)');
    L.push('');
    const welcome = c.bRecv.find(m => m.type === 'room-look' && m.payload.full);
    if (welcome) {
        const s = welcome.payload.snapshot || {};
        L.push('Sections: ' + Object.keys(s).sort().map(k => '`' + k + '`' + (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) ? ' (' + Object.keys(s[k]).length + ')' : '')).join(', ') + '.');
        L.push('');
        L.push('```json');
        L.push(JSON.stringify(s, null, 1).split('\n').slice(0, 400).join('\n'));
        L.push('```');
    } else L.push('No full welcome was received.');
    L.push('');
    L.push('## Problems');
    L.push('');
    L.push(r.problems.length ? r.problems.map(p => '- ' + p).join('\n') : 'None.');
    return L.join('\n') + '\n';
}
function fmtCounts(o) { return Object.keys(o).sort().map(k => '`' + k + '` ' + o[k]).join(', ') || '—'; }
function groupBy(list, k) { const o = {}; list.forEach(m => { (o[m[k]] = o[m[k]] || []).push(m); }); return o; }
function trimJson(v, n) { let s = JSON.stringify(v); if (s.length > n) s = s.slice(0, n) + '…'; return '`' + s.replace(/\|/g, '\\|') + '`'; }
function summariseLook(snap, full) {
    if (!snap) return '';
    if (full) return 'full look: ' + Object.keys(snap).filter(k => k !== 'baseline').length + ' sections';
    const parts = [];
    for (const sec of ['sliders', 'checkboxes', 'selects']) if (snap[sec]) for (const k of Object.keys(snap[sec]).sort()) parts.push('`' + sec + '.' + k + '`=' + JSON.stringify(snap[sec][k]));
    for (const k of Object.keys(snap).sort()) if (!['sliders', 'checkboxes', 'selects', 'baseline'].includes(k)) parts.push('`' + k + '`=' + trimJson(snap[k], 80).replace(/^`|`$/g, ''));
    return parts.join(', ').replace(/\|/g, '\\|');
}
function renderRelayMd(r) {
    const rel = r.relay || {};
    const L = [];
    L.push('# The local relay for the sync baseline');
    L.push('');
    L.push('How `prep/baseline/scripts/sync-log.js` starts, points the clients at, and stops the relay. Nothing here touches the deployed relay (`swirltogether.com`).');
    L.push('');
    L.push('| Fact | Value |');
    L.push('|---|---|');
    L.push('| Used | ' + (rel.kind || '?') + ' on `' + (rel.host || '?') + '` |');
    L.push('| Command | `' + (rel.command || process.env.RELAY || '?') + '` (cwd = repo root) |');
    L.push('| Ready after | ' + (rel.readyMs != null ? rel.readyMs + ' ms (the log line `Ready on http://' + rel.host + '`)' : 'n/a') + ' |');
    L.push('| Output | `' + (rel.log || 'n/a') + '` (stdout + stderr of the relay process) |');
    L.push('| Durable Object state | `--persist-to` a fresh `fluid-sync-relay-state-*` dir in the OS temp dir, removed in `finally` once the relay tree is gone (workerd holds the files for a moment after `taskkill`, so the removal retries for up to 5 s; `processes.after.persistDirRemoved` in log.json records it). So no room survives between runs; wrangler still writes its bundle under the repo\'s gitignored `.wrangler/tmp/` |');
    L.push('| Environment | `WRANGLER_SEND_METRICS=false`, `CI=1`, `NO_COLOR=1` (no prompts, no colour codes in the log) |');
    L.push('| Stopped by | `taskkill /PID <pid> /T /F` in the script\'s `finally` (the tree: node running wrangler → two `workerd.exe`), then a process snapshot confirms no `workerd.exe` / relay node remains that was not there before |');
    L.push('| Attempts | ' + (rel.tried || []).map(t => '`' + t.kind + '` ' + (t.ok ? 'OK' : 'failed: ' + t.note)).join('; ') + ' |');
    L.push('');
    L.push('## What the clients read');
    L.push('');
    L.push('- The app takes its relay from `localStorage.fluidMultiplayerHost` (js/06a-mp-core.js:60-70, validated by `/^[\\w.-]+(:\\d+)?$/`), seeded into each scratch profile by the driver\'s `boot({ seed })` before the first script runs. `isPlainWsHost` (06a:86-88) makes `127.0.0.1` a `ws://` host, so the URL is `ws://' + (rel.host || '127.0.0.1:8787') + '/parties/fluid/<ROOM>?uid=<deviceId>`.');
    L.push('- `party/worker.ts` adapts the unchanged PartyKit classes (`party/index.ts`, `party/lobby.ts`) onto partyserver; `wrangler.jsonc` binds `fluid` → `FluidRoom` and `lobby` → `LobbyRoom`, so the paths are the production ones. `assets.directory` is `./public`, which exists in this checkout; the relay never serves it to these clients (they load from the driver\'s own static server).');
    L.push('- A bare 6-character code is a **private** room (capacity 8, host + lock, `party/shared.ts:41-45`): the first connection is elected host (`party/index.ts:156-166`), every relayed message is stamped with the sender\'s **connection id** and a timestamp (`index.ts:271-273`), and `ping` is never relayed (`index.ts:231`).');
    L.push('');
    L.push('## Fallback');
    L.push('');
    L.push('If wrangler prints no `Ready on` within 90 s (or exits), the script kills it and tries `node node_modules/partykit/dist/bin.mjs dev --port 1999` (what `npx partykit dev` runs; `partykit.json` maps the same two parties). `RELAY=host:port` skips both and uses a relay that is already running. In the capture recorded here the fallback was ' + ((rel.tried || []).some(t => t.kind === 'partykit' && t.ok) ? 'USED' : 'not needed') + '.');
    L.push('');
    L.push('## Known log noise');
    L.push('');
    L.push('- `Wrangler detected this dev session is running in an AI agent.` plus the Local Explorer API routes: wrangler 4.130 prints these when it detects a non-interactive agent session; harmless.');
    L.push('- `✨ Parsed 9 valid header rules.`: `public/_headers`, irrelevant to the WebSocket paths.');
    L.push('- When a peer is refused (full / locked room) workerd logs one uncaught `Network connection lost` (`party/worker.ts:74-80`); this baseline never refuses anyone, so none is expected in `relay.log`.');
    return L.join('\n') + '\n';
}

main().catch(e => { console.error(e); process.exit(2); });
