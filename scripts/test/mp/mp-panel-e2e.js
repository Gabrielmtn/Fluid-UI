// End-to-end: the Swirl Together room panel (2026-10-04 redesign; since
// 2026-10-06 a room is one set of shared settings — no turns, no look lock).
// Three separate headless Chromes (separate profiles, so three device uids:
// the relay hands out host by device id, so two tabs of one profile would
// both be host) run the app from this working tree against a relay, and the
// checks read the panel as each person sees it: the status line, the dot,
// the activity line, the controls on screen, the Invite popover and the ⋯
// menu.
//
//   npx wrangler dev --port 8788 --ip 127.0.0.1     (the relay; reads public/, never builds it)
//   node scripts/test/mp/mp-panel-e2e.js
//
// Walks: not in a room; a private host and two guests (3 here); the invite
// popover (Code / QR / Hide, copy, phone row); the ⋯ menu for host and guest;
// Lock room as the status line reports it; the activity line naming who
// changed what; leaving; and a stranger pair (Sync phone, no locks, sharing).
// Controls are counted per person, ENABLED ones only: in a room everyone
// sees the same three (Invite, ⋯, Leave). Also runs the button audit (js/38)
// over the panel and both popovers. The stranger pair goes through the
// LOBBY, so it only runs against a local relay (a real stranger waiting on
// the live one would be paired with the test); STRANGER=1 forces it.
//
// Env: MP_HOST (default 127.0.0.1:8788), CHROME (path), SHOTS=<dir> saves a
// screenshot per state, STRANGER=0|1. ~20 s. The static server is built in
// (repo root, no-store), so no dev server is needed.
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

const ERRS = String.raw`(function(){
  if (window.__pe) return 'kit already';
  var errs=[]; window.addEventListener('error',function(e){errs.push(String(e.message||e));});
  var ce=console.error; console.error=function(){try{errs.push(Array.prototype.map.call(arguments,String).join(' '));}catch(_){} return ce.apply(console,arguments);};
  window.__pe={errs:errs};
  return 'kit ok';
})()`;

async function launch(port, url, name) {
    const profile = path.join(os.tmpdir(), 'fluid-mp-panel-' + name + '-' + process.pid);
    const proc = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
        '--window-size=1280,860', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', 'about:blank'
    ], { stdio: 'ignore' });
    for (let i = 0; i < 80 && !(await portUp(port)); i++) await sleep(250);
    const page = await connect(port);
    await page.send('Page.enable', {});
    // First-run modals waived the way the other e2e tests do: the PhotoSafe
    // acknowledgement and the Simple / Everything fork.
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source:
        "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');" +
        "localStorage.setItem('fluidMultiplayerHost','" + RELAY + "');}catch(_){} window.__skipUIFork=true;" });
    await page.send('Page.navigate', { url });
    await waitReady(page, { timeoutMs: 90000 });
    for (let i = 0; i < 120; i++) {
        const ok = await page.eval("!!(window.__scriptsReady && typeof createRoom==='function' && typeof renderRoomStatus==='function' && window.PhonePads && document.getElementById('phonePadBtn') && document.getElementById('roomReportBtn') && document.getElementById('mixer-strip'))").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    // The splash plays over everything for a few seconds; the screenshots
    // want the panel, so wait it out (and drop it if it lingers).
    await until(page, "(function(){var s=document.getElementById('splash-screen'); return !s || getComputedStyle(s).display==='none' || getComputedStyle(s).opacity==='0';})()", 9000);
    await page.eval("(function(){var s=document.getElementById('splash-screen'); if(s) s.style.display='none'; var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; if(isPaused) togglePause(); if(window.QualityGovernor&&QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1;})()");
    const kit = await page.eval(ERRS);
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

// The panel as this person sees it. Opens the section first (a collapsed
// section has no boxes, which would read as an empty panel).
const PANEL = String.raw`(function(){
  var panel = document.getElementById('multiArtistPanel');
  var sec = panel && panel.closest('.sidebar-section');
  if (sec && window.UIVisibility && sec.classList.contains('ui-hidden') && window.UIVisibility.show) { try { window.UIVisibility.show(sec); } catch(_){} }
  if (sec && sec.classList.contains('collapsed')) { if (window.openSidebarSection) window.openSidebarSection(sec); else sec.classList.remove('collapsed'); }
  function shown(e){ if(!e||!e.getClientRects().length) return false; for(var n=e;n&&n!==document.documentElement;n=n.parentElement){var cs=getComputedStyle(n); if(cs.display==='none'||cs.visibility==='hidden') return false;} return true; }
  var conn = document.getElementById('mpConnected'), disc = document.getElementById('mpDisconnected');
  var view = shown(conn) ? conn : disc;
  var list = [].slice.call(view.querySelectorAll('button, input, select')).filter(shown);
  var ctrls = [];
  list.forEach(function(e){
    ctrls.push({ id: e.id || e.className, label: (e.textContent || e.placeholder || '').trim().slice(0, 40), enabled: !e.disabled });
  });
  var st = document.getElementById('multiplayerStatus');
  var dot = document.getElementById('connectionDot');
  var act = document.getElementById('mpActivity');
  return { view: view.id, status: st ? st.textContent : null, tip: st ? st.title : null,
    activity: act && shown(act) ? act.textContent : null,
    dot: dot ? dot.className.replace('mp-dot ', '') : null, controls: ctrls,
    enabled: ctrls.filter(function(c){ return c.enabled; }).length,
    labels: ctrls.filter(function(c){ return c.enabled; }).map(function(c){ return c.label; }) };
})()`;

// A body-mounted popover: whether it is open, and what is on screen in it.
const POP = (id) => String.raw`(function(){
  var p = document.getElementById('${id}');
  if (!p) return { missing: true };
  function shown(e){ if(!e||!e.getClientRects().length) return false; for(var n=e;n&&n!==document.documentElement;n=n.parentElement){var cs=getComputedStyle(n); if(cs.display==='none'||cs.visibility==='hidden') return false;} return true; }
  var items = [].slice.call(p.querySelectorAll('button')).filter(shown).map(function(b){ return { id: b.id, label: b.textContent.trim(), checked: b.getAttribute('aria-checked') }; });
  return { open: shown(p), parent: p.parentElement === document.body ? 'body' : (p.parentElement && p.parentElement.id), items: items };
})()`;

// The button system's audit (js/38), narrowed to the room panel and its two
// popovers: any rule outside the token sheet that colours one of them, or
// an inline colour, is a miss (01-buttons: buttons inherit their panel's).
const AUDIT = String.raw`(function(){
  var r = window.auditButtons ? window.auditButtons() : null; if (!r) return null;
  var mine = [].slice.call(document.querySelectorAll('#multiArtistPanel button, #mpInvitePop button, #mpRoomMenu button'));
  var bad = [];
  r.rules.forEach(function(x){ var sel = x.rule.split('  |  ')[1];
    mine.forEach(function(el){ try { if (el.matches(sel)) bad.push((el.id || el.textContent.trim()) + ' <- ' + x.rule); } catch(_){} }); });
  r.inline.forEach(function(x){ if (mine.some(function(el){ return (el.id || el.className) === x.button; })) bad.push('inline ' + x.button); });
  return { total: r.total, clean: r.clean, mine: mine.length, bad: bad };
})()`;

async function shot(X, file) {
    if (!SHOTS) return;
    try {
        await X.page.eval("(function(){var p=document.getElementById('multiArtistPanel'); if(p) p.scrollIntoView({block:'center'}); return 1;})()");
        await sleep(120);
        const r = await X.page.send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(SHOTS, { recursive: true });
        fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64'));
    } catch (e) { log('shot failed ' + file + ': ' + e.message); }
}

// A trusted click at an element's centre (CDP mouse events), for the places
// where a synthetic .click() would skip what a real press does (the popover's
// outside-press close listens for mousedown).
async function realClick(page, sel) {
    const r = await page.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return null; e.scrollIntoView({block:'nearest'}); var b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};})()");
    if (!r) return false;
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
    return true;
}
const click = (page, sel) => page.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel) + "); if(!e) return false; e.click(); return true;})()");

const HOST_MAX = 3, GUEST_MAX = 3;
const LOCAL_RELAY = /^(127\.|localhost)/.test(RELAY);
const RUN_STRANGER = process.env.STRANGER ? process.env.STRANGER === '1' : LOCAL_RELAY;

(async () => {
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    log('static server', url, 'relay', RELAY);
    let A = null, B = null, C = null;
    let code = null;
    const noCode = (s) => !code || (s.status || '').indexOf(code) === -1;
    try {
        [A, B, C] = await Promise.all([launch(9371, url, 'A'), launch(9372, url, 'B'), launch(9373, url, 'C')]);
        const a = A.page, b = B.page, c = C.page;

        // ── 1. Not in a room ──────────────────────────────────────────
        const s0 = await a.eval(PANEL);
        check(s0.view === 'mpDisconnected', 'not in a room: the door view shows', s0.view);
        check(s0.labels.join(',') === 'Start a room,Stranger,Paste a code,Join,Sync phone,Link to current settings',
            'not in a room: Start a room, Stranger, the code box, Join, the phone door, Link to current settings', s0.labels);
        const blurbs = await a.eval("(function(){ var d=document.getElementById('mpDisconnected'); return { prose: d.querySelectorAll('.mp-hint, .mp-sub, .mp-or').length," +
            " tips: ['createRoomBtn','strangerBtn','phonePadBtn','joinRoomBtn'].map(function(id){ var e=document.getElementById(id); return !!(e && e.title && e.title.length > 20); }) }; })()");
        check(blurbs.prose === 0 && blurbs.tips.every(Boolean), 'the blurbs are tooltips now, not lines of text', blurbs);
        await shot(A, '01-not-in-a-room.png');

        // ── 2. A private room: host alone ─────────────────────────────
        await click(a, '#createRoomBtn');
        code = await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        check(/^[A-Z0-9]{6}$/.test(code || ''), 'A started room ' + code);
        const s1 = await until(a, "(function(){var s=" + PANEL + "; return /^Waiting for friends · just you$/.test(s.status) ? s : null;})()", 6000) || await a.eval(PANEL);
        check(/^Waiting for friends · just you$/.test(s1.status), 'host alone: "Waiting for friends · just you"', s1.status);
        check(s1.dot === 'mp-dot-alone', 'host alone: the dot is amber', s1.dot);
        check(s1.enabled <= HOST_MAX, 'host alone: at most ' + HOST_MAX + ' controls', s1.labels);
        check(noCode(s1), 'the status line never prints the room code', s1.status);
        await shot(A, '02-host-alone.png');

        // ── 3. Two guests join ────────────────────────────────────────
        await b.eval("joinRoom('" + code + "'); 1");
        await until(b, 'isMultiplayerEnabled && connectedClients === 2', 10000);
        await c.eval("joinRoom('" + code + "'); 1");
        const three = await until(a, 'connectedClients === 3', 10000) && await until(c, 'isMultiplayerEnabled && connectedClients === 3', 10000)
            && await until(b, 'connectedClients === 3', 6000);
        check(!!three, 'B and C joined: three in the room');
        check(await a.eval("myRole === 'host'") && await b.eval("myRole === 'guest'") && await c.eval("myRole === 'guest'"), 'A is host, B and C are guests');
        const sA3 = await a.eval(PANEL), sB3 = await b.eval(PANEL);
        check(sA3.status === 'Sharing settings · 3 here' && sB3.status === 'Sharing settings · 3 here', 'together: "Sharing settings · 3 here" on host and guest', [sA3.status, sB3.status]);
        check(sA3.dot === 'mp-dot-connected' && sB3.dot === 'mp-dot-connected', 'together: the dot is green', [sA3.dot, sB3.dot]);
        check(sA3.labels.join(',') === 'Invite ▾,⋯,Leave' && sB3.labels.join(',') === 'Invite ▾,⋯,Leave', 'host and guest see the same three controls: Invite, ⋯, Leave', [sA3.labels, sB3.labels]);
        check(await a.eval("['mpRhythm','turnsBtn','callReturnBtn','turnWheel','turnPassBtn','turnStatus'].every(function(id){ return !document.getElementById(id); })"), 'no rhythm switch, queue or Pass');
        check(/^Change any setting/.test(sA3.activity || ''), 'host: the activity line says what the room is for', sA3.activity);
        const hostName = await a.eval('shortName(clientId)');
        // The host's welcome goes out half a second after someone arrives.
        const welcomeB = await until(b, "(function(){var s=" + PANEL + "; return /^Now on /.test(s.activity || '') ? s.activity : null;})()", 3000);
        check(welcomeB === 'Now on ' + hostName + '’s settings', 'guest, just arrived: "Now on ' + hostName + '’s settings" (even with nothing to change)', welcomeB);
        check(noCode(sA3) && noCode(sB3), 'still no room code in either status line');
        const audit = await a.eval(AUDIT);
        check(!!audit && audit.mine > 15 && audit.bad.length === 0, 'button audit: no button in the panel or its popovers colours itself', audit);
        await shot(A, '03-host-together.png');
        await shot(B, '03-guest-together.png');

        // ── 4. The Invite popover ─────────────────────────────────────
        await realClick(a, '#mpInviteBtn');
        const inv = await until(a, "(function(){var p=" + POP('mpInvitePop') + "; return p.open ? p : null;})()", 3000) || await a.eval(POP('mpInvitePop'));
        check(inv.open && inv.parent === 'body', 'Invite opens a popover mounted on body', { open: inv.open, parent: inv.parent });
        const invIds = (inv.items || []).map((x) => x.id);
        check(['shareModeCode', 'shareModeQr', 'shareModeHidden', 'copyRoomBtn', 'copyRoomCodeBtn', 'copyRoomLookBtn', 'phonePadRoomBtn'].every((id) => invIds.indexOf(id) !== -1),
            'it holds Code | QR | Hide, Copy link, Copy code, Room link + current settings and the phone row', invIds);
        check(await a.eval("document.getElementById('roomName').textContent === currentRoom && document.getElementById('mpInvitePop').contains(document.getElementById('roomName'))"), 'and the code itself (#roomName)');
        await shot(A, '04-invite-code.png');
        await click(a, '#shareModeQr');
        check(await a.eval("!!document.querySelector('#roomQr svg') && getComputedStyle(document.getElementById('roomName')).display === 'none'"), 'QR swaps the code for a scannable symbol');
        await shot(A, '05-invite-qr.png');
        await click(a, '#shareModeHidden');
        const hid = await a.eval("({ code: document.getElementById('roomName').textContent, qr: document.getElementById('roomQr').innerHTML.length })");
        check(hid.code.indexOf(code) === -1 && hid.qr === 0, 'Hide masks the code and empties the QR', hid);
        await click(a, '#copyRoomBtn');
        const copied = await until(a, "document.getElementById('copyRoomBtn').textContent === 'Copied'", 2000);
        check(!!copied, 'Copy link says Copied');
        check(await a.eval("document.getElementById('mpInvitePop').getClientRects().length > 0"), 'and the popover stays open for it');
        await click(a, '#shareModeCode');
        await realClick(a, '#canvas');
        check(await until(a, "document.getElementById('mpInvitePop').getClientRects().length === 0", 2000), 'a press outside closes it');
        await click(a, '#mpInviteBtn');
        await a.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await a.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        check(await until(a, "document.getElementById('mpInvitePop').getClientRects().length === 0", 2000), 'and so does Esc');
        // The guide (44) can point inside it: a tour step opens it first.
        const tour = await a.eval("(async function(){ if (!window.Recipes || !window.Recipes._reveal) return 'no reveal hook'; var r = await window.Recipes._reveal({ overlay: 'mp', popup: 'invite', sel: '#copyRoomBtn' }); var ok = !!(r && r.el && r.el.id === 'copyRoomBtn') && document.getElementById('mpInvitePop').getClientRects().length > 0; document.getElementById('mpInviteBtn').click(); return ok; })()").catch((e) => String(e));
        check(tour === true, 'a guide step aimed at Copy link opens the popover first', tour);
        await sleep(200);

        // ── 5. The ⋯ menu, host and guest ─────────────────────────────
        await click(a, '#mpMenuBtn');
        const mA = await until(a, "(function(){var p=" + POP('mpRoomMenu') + "; return p.open ? p : null;})()", 2000) || await a.eval(POP('mpRoomMenu'));
        check(mA.open && mA.parent === 'body', '⋯ opens a menu mounted on body', { open: mA.open, parent: mA.parent });
        check(mA.items.map((x) => x.label).join(',') === 'Lock room,Copy room report', 'host ⋯: Lock room · Copy room report', mA.items.map((x) => x.label));
        await shot(A, '06-host-menu.png');
        await click(b, '#mpMenuBtn');
        const mB = await until(b, "(function(){var p=" + POP('mpRoomMenu') + "; return p.open ? p : null;})()", 2000) || await b.eval(POP('mpRoomMenu'));
        check(mB.items.map((x) => x.label).join(',') === 'Copy room report', 'guest ⋯: Copy room report only', mB.items.map((x) => x.label));
        await shot(B, '06-guest-menu.png');
        await click(b, '#mpMenuBtn');   // closes it again

        // ── 6. Lock room ──────────────────────────────────────────────
        await click(a, '#lockRoomBtn');
        const lockA = await until(a, "(function(){var s=" + PANEL + "; return / · locked$/.test(s.status) ? s.status : null;})()", 4000);
        const lockB = await until(b, "(function(){var s=" + PANEL + "; return / · locked$/.test(s.status) ? s.status : null;})()", 4000);
        check(lockA === 'Sharing settings · 3 here · locked' && lockB === 'Sharing settings · 3 here · locked', 'Lock room: "· locked" on host and guest', [lockA, lockB]);
        check(await a.eval("document.getElementById('mpRoomMenu').getClientRects().length === 0"), 'picking a ⋯ item closes the menu');
        await click(a, '#mpMenuBtn');
        check(await a.eval("document.getElementById('lockRoomBtn').getAttribute('aria-checked') === 'true'"), 'and the item carries its tick');
        await shot(A, '07-locked-menu.png');
        await click(a, '#lockRoomBtn');
        check(!!await until(b, "(function(){var s=" + PANEL + "; return s.status === 'Sharing settings · 3 here';})()", 4000), 'unlocking takes "locked" off again');

        // ── 7. Who changed what ───────────────────────────────────────
        const bName = await b.eval('shortName(clientId)');
        await b.eval("(function(){ var e=document.getElementById('sharpness'); e.value='1.7'; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()");
        const sharpName = await a.eval("HotkeyBinds.nameOf(document.getElementById('sharpness'))");
        const actA = await until(a, "(function(){var s=" + PANEL + "; return s.activity && s.activity.indexOf('changed') !== -1 ? s.activity : null;})()", 4000);
        const actC = await until(c, "(function(){var s=" + PANEL + "; return s.activity && s.activity.indexOf('changed') !== -1 ? s.activity : null;})()", 4000);
        check(actA === bName + ' changed ' + sharpName && actC === actA, 'B moves ' + sharpName + ': A and C read "' + actA + '"', [actA, actC]);
        check(!!await until(a, "Math.abs(config.SHARPNESS - 1.7) < 1e-6", 3000), 'and the setting itself arrives (once its glide lands)');
        check(await a.eval("getComputedStyle(document.querySelector('#mpActivity .mp-activity-who')).color") === await a.eval("(function(){ var d=document.createElement('div'); d.style.color=colorForClient(" + JSON.stringify(await b.eval('clientId')) + "); document.body.appendChild(d); var c=getComputedStyle(d).color; d.remove(); return c; })()"), 'the name is in B\'s cursor colour');
        await shot(A, '08-activity.png');

        // ── 11. A stranger pair (B and C) ─────────────────────────────
        await click(b, '#disconnectBtn');
        await click(c, '#disconnectBtn');
        await until(a, 'connectedClients === 1', 6000);
        const sAlone = await a.eval(PANEL);
        check(sAlone.status === 'Waiting for friends · just you' && sAlone.dot === 'mp-dot-alone', 'the others left: back to "Waiting for friends · just you"', sAlone.status);
        await click(a, '#disconnectBtn');
        await sleep(300);
        if (!RUN_STRANGER) { log('(stranger pair skipped: not a local relay — STRANGER=1 to force)'); }
        else {
        await click(b, '#strangerBtn');
        const finding = await until(b, "(function(){var s=" + PANEL + "; return /^(Finding a stranger…|Connecting…|Waiting for a stranger…)/.test(s.status) ? s : null;})()", 4000);
        check(!!finding, 'Stranger: the line says it is looking', finding && finding.status);
        const bWait = await until(b, "(function(){var s=" + PANEL + "; return /^Waiting for a stranger… · just you$/.test(s.status) ? s : null;})()", 8000);
        check(!!bWait, 'B waits: "Waiting for a stranger… · just you"', bWait && bWait.status);
        if (bWait) {
            check(bWait.labels.join(',') === 'Sync phone,Leave', 'waiting: just the phone door and Leave', bWait.labels);
            await shot(B, '12-waiting-for-stranger.png');
        }
        await click(c, '#strangerBtn');
        const paired = await until(b, "isStrangerRoom() && connectedClients === 2", 30000) && await until(c, "isStrangerRoom() && connectedClients === 2", 8000);
        check(!!paired, 'B and C are paired');
        await sleep(500);
        const pB = await b.eval(PANEL), pC = await c.eval(PANEL);
        check(pB.status === 'Sharing settings · 2 here' && pC.status === 'Sharing settings · 2 here', 'pair: "Sharing settings · 2 here"', [pB.status, pC.status]);
        check(pB.labels[0] === 'Sync phone' && pC.labels[0] === 'Sync phone', 'pair: Invite becomes "Sync phone"', [pB.labels, pC.labels]);
        check(pB.enabled <= HOST_MAX && pC.enabled <= HOST_MAX, 'pair: at most ' + HOST_MAX + ' controls each', [pB.labels, pC.labels]);
        await click(b, '#mpInviteBtn');
        const pInv = await b.eval(POP('mpInvitePop'));
        check(pInv.open && pInv.items.map((x) => x.id).join(',') === 'phonePadRoomBtn', 'pair: the popover is just the phone door', pInv.items);
        await shot(B, '13-pair-phone.png');
        await click(b, '#mpInviteBtn');
        for (const [X, nm] of [[b, 'B'], [c, 'C']]) {
            await click(X, '#mpMenuBtn');
            const m = await X.eval(POP('mpRoomMenu'));
            check(m.items.map((x) => x.label).join(',') === 'Copy room report', 'pair: ' + nm + '\'s ⋯ has no locks', m.items.map((x) => x.label));
            await click(X, '#mpMenuBtn');
        }
        // The pair shares settings like any room: C's change reaches B.
        await c.eval("(function(){ var e=document.getElementById('vibrance'); e.value='0.9'; e.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
        const pairShare = await until(b, "Math.abs(config.VIBRANCE - 0.9) < 1e-6", 4000);
        check(!!pairShare, 'pair: C\'s Vibrance reaches B');
        }

        const eA = await a.eval('__pe.errs'), eB = await b.eval('__pe.errs'), eC = await c.eval('__pe.errs');
        const real = (arr) => arr.filter((s) => !/favicon|ERR_|net::|Failed to load resource|onnx|ort-wasm|WebGPU|WebSocket/i.test(s));
        check(real(eA).length === 0 && real(eB).length === 0 && real(eC).length === 0, 'no page errors', { A: real(eA).slice(0, 5), B: real(eB).slice(0, 5), C: real(eC).slice(0, 5) });

        // ── 12. Hide sticks until it is changed ───────────────────────
        // Someone who picks Hide (a streamer) gets it every time they open
        // Invite, in every room, after a reload, and in the phone dialog,
        // until they pick Code or QR themselves.
        const HIDDEN = "(function(){ var b=function(id){ var e=document.getElementById(id); return e && e.getAttribute('aria-pressed'); };" +
            " return { pressed: b('shareModeHidden'), code: document.getElementById('roomName').textContent, qr: document.getElementById('roomQr').innerHTML.length," +
            " hasRoom: document.getElementById('roomName').textContent.indexOf(currentRoom || '#') !== -1 }; })()";
        const hiddenOk = (h) => !!h && h.pressed === 'true' && h.code === '●●●●●●' && h.qr === 0 && !h.hasRoom;
        await a.eval('createRoom(); 1');
        await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        await click(a, '#mpInviteBtn');
        await click(a, '#shareModeHidden');
        await click(a, '#mpInviteBtn');
        await click(a, '#disconnectBtn');
        await sleep(300);
        // As a confirmed close would: no "leave this page?" for the reload.
        await a.eval('window.__closeApproved = true; 1');
        await a.send('Page.reload', {});
        await waitReady(a, { timeoutMs: 90000 });
        await until(a, "!!(window.__scriptsReady && typeof createRoom==='function' && window.PhonePads && document.getElementById('mixer-strip'))", 30000);
        await a.eval("(function(){var s=document.getElementById('splash-screen'); if(s) s.style.display='none'; return 1;})()");
        await a.eval(ERRS);
        check(await a.eval("localStorage.getItem('swirlShareMode')") === 'hidden', 'Hide is remembered across a reload');
        await a.eval('createRoom(); 1');
        await until(a, 'isMultiplayerEnabled && currentRoom', 10000);
        await click(a, '#mpInviteBtn');
        const h1 = await a.eval(HIDDEN);
        check(hiddenOk(h1), 'after a reload, a new room\'s Invite opens on Hide: the code masked, no QR', h1);
        await click(a, '#mpInviteBtn');
        await click(a, '#mpInviteBtn');
        const h2 = await a.eval(HIDDEN);
        check(hiddenOk(h2), 'and again every time it is opened', h2);
        await click(a, '#phonePadRoomBtn');
        await click(a, '#phonePadWayArtist');
        await sleep(700);
        const PH = "(function(){ var c=document.getElementById('phonePadCode'), q=document.getElementById('phonePadQr'), r=document.getElementById('phonePadReveal'); return { code: c && c.textContent, qr: q ? q.innerHTML.length : -1, reveal: !!r && !r.hidden }; })()";
        const p1 = await a.eval(PH);
        check(!!p1 && p1.code === '●●●●●●' && p1.qr === 0 && p1.reveal, 'the phone dialog honours it too (masked, no QR, "Show the code")', p1);
        await click(a, '#phonePadReveal');
        await sleep(200);
        await click(a, '#phonePadDone');
        await click(a, '#phonePadRoomBtn');
        await sleep(700);
        const p2 = await a.eval(PH);
        check(!!p2 && /●/.test(p2.code) && p2.qr === 0, 'showing it once is for that look only: the next open is hidden again', p2);
        await click(a, '#phonePadDone');
        await click(a, '#mpInviteBtn');
        await click(a, '#shareModeCode');
        const back = await a.eval("({ stored: localStorage.getItem('swirlShareMode'), code: document.getElementById('roomName').textContent === currentRoom })");
        check(back.stored === 'code' && back.code, 'picking Code is what changes it', back);
        await click(a, '#mpInviteBtn');
        await click(a, '#disconnectBtn');
        const eA2 = await a.eval('__pe.errs');
        check(real(eA2).length === 0, 'no page errors after the reload', real(eA2).slice(0, 5));
    } catch (e) {
        fails++;
        log('ERROR', e && e.stack || e);
    } finally {
        for (const X of [A, B, C]) {
            if (!X) continue;
            try { X.page.close(); } catch (_) {}
            try { X.proc.kill(); } catch (_) {}
            try { spawn('taskkill', ['/PID', String(X.proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
        }
        srv.close();
        await sleep(1200);
        for (const X of [A, B, C]) { if (X) { try { fs.rmSync(X.profile, { recursive: true, force: true }); } catch (_) {} } }
        log(fails ? `DONE ${passes} passed, ${fails} FAILED` : `DONE all ${passes} checks passed`);
        process.exit(fails ? 1 : 0);
    }
})();
