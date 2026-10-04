// End-to-end: the Swirl Together room panel (2026-10-04 redesign). Three
// separate headless Chromes (separate profiles, so three device uids: the
// relay hands out host by device id, so two tabs of one profile would both
// be host) run the app from this working tree against a LOCAL relay, and the
// checks read the panel as each person sees it: the status line, the dot,
// the controls on screen, the Invite popover and the ⋯ menu.
//
//   npx wrangler dev --port 8788 --ip 127.0.0.1     (the relay; reads public/, never builds it)
//   node scripts/test/mp/mp-panel-e2e.js
//
// Walks: not in a room; a private host and two guests (3 here); the invite
// popover (Code / QR / Hide, copy, phone row); the ⋯ menu for host and guest;
// Lock room and Everyone uses my look as the status line reports them; Take
// turns (your turn / their turn, Pass only on your turn, the host's Skip in
// ⋯); switching to Call and return while turns run; back to Together; and a
// stranger pair (📱 Phone, no locks, asking the partner, "Asking…").
// Controls are counted per person, ENABLED ones only, the queue left out and
// the Together | Turns | Call & return switch counted once: a host sees at
// most 5, a guest at most 4 (a guest's switch is shown but disabled). Also
// runs the button audit (js/38) over the panel and both popovers.
//
// Env: MP_HOST (default 127.0.0.1:8788), CHROME (path), SHOTS=<dir> saves a
// screenshot per state. ~20 s, 79 checks. The static server is built in
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
  var seg = document.getElementById('mpRhythm');
  var list = [].slice.call(view.querySelectorAll('button, input, select')).filter(function(e){ return shown(e) && !e.closest('#turnWheel'); });
  var ctrls = [], segDone = false;
  list.forEach(function(e){
    if (seg && seg.contains(e)) {
      if (segDone) return; segDone = true;
      var segs = [].slice.call(seg.querySelectorAll('button'));
      ctrls.push({ id: 'mpRhythm', label: segs.map(function(b){ return b.textContent.trim() + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + (b.disabled ? '(off)' : ''); }).join(' | '),
        enabled: segs.some(function(b){ return !b.disabled; }), title: segs[0] ? segs[0].title : '' });
      return;
    }
    ctrls.push({ id: e.id || e.className, label: (e.textContent || e.placeholder || '').trim().slice(0, 40), enabled: !e.disabled });
  });
  var st = document.getElementById('multiplayerStatus');
  var dot = document.getElementById('connectionDot');
  return { view: view.id, status: st ? st.textContent : null, tip: st ? st.title : null,
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

const HOST_MAX = 5, GUEST_MAX = 4;

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
        check(s0.labels.join(',') === 'Start a room,Stranger,Paste a code,Join,📱 Paint from your phone',
            'not in a room: Start a room, Stranger, the code box, Join, the phone door', s0.labels);
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
        check(sA3.status === 'Swirling together · 3 here' && sB3.status === 'Swirling together · 3 here', 'together: "Swirling together · 3 here" on host and guest', [sA3.status, sB3.status]);
        check(sA3.dot === 'mp-dot-connected' && sB3.dot === 'mp-dot-connected', 'together: the dot is green', [sA3.dot, sB3.dot]);
        check(sA3.enabled <= HOST_MAX, 'host: at most ' + HOST_MAX + ' controls (' + sA3.enabled + ')', sA3.labels);
        check(sB3.enabled <= GUEST_MAX, 'guest: at most ' + GUEST_MAX + ' controls (' + sB3.enabled + ')', sB3.labels);
        const segB = sB3.controls.find((x) => x.id === 'mpRhythm');
        check(!!segB && !segB.enabled && segB.title === 'The host picks how the room paints', 'guest: the rhythm switch is there, disabled, and says why', segB);
        const segA = sA3.controls.find((x) => x.id === 'mpRhythm');
        check(!!segA && segA.enabled && /Together\*/.test(segA.label), 'host: the switch is live, on Together', segA);
        check(await a.eval("!document.getElementById('turnStatus')"), 'the line under the queue is gone (#turnStatus)');
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
        check(['shareModeCode', 'shareModeQr', 'shareModeHidden', 'copyRoomBtn', 'copyRoomCodeBtn', 'phonePadRoomBtn'].every((id) => invIds.indexOf(id) !== -1),
            'it holds Code | QR | Hide, Copy link, Copy code and the phone row', invIds);
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
        check(mA.items.map((x) => x.label).join(',') === 'Lock room,Everyone uses my look,Copy room report', 'host ⋯: Lock room · Everyone uses my look · Copy room report', mA.items.map((x) => x.label));
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
        check(lockA === 'Swirling together · 3 here · locked' && lockB === 'Swirling together · 3 here · locked', 'Lock room: "· locked" on host and guest', [lockA, lockB]);
        check(await a.eval("document.getElementById('mpRoomMenu').getClientRects().length === 0"), 'picking a ⋯ item closes the menu');
        await click(a, '#mpMenuBtn');
        check(await a.eval("document.getElementById('lockRoomBtn').getAttribute('aria-checked') === 'true'"), 'and the item carries its tick');
        await shot(A, '07-locked-menu.png');
        await click(a, '#lockRoomBtn');
        check(!!await until(b, "(function(){var s=" + PANEL + "; return s.status === 'Swirling together · 3 here';})()", 4000), 'unlocking takes "locked" off again');

        // ── 7. Everyone uses my look ──────────────────────────────────
        await click(a, '#mpMenuBtn');
        await click(a, '#settingsLockBtn');
        const lookA = await until(a, "(function(){var s=" + PANEL + "; return / · your look$/.test(s.status) ? s.status : null;})()", 4000);
        const lookB = await until(b, "(function(){var s=" + PANEL + "; return / · host\u2019s look$/.test(s.status) ? s.status : null;})()", 4000);
        check(!!lookA && !!lookB, 'Everyone uses my look: "your look" for the host, "host\u2019s look" for a guest', [lookA, lookB]);
        const tipB = await b.eval(PANEL);
        check(/follow the host/.test(tipB.tip || ''), 'the status line\'s tooltip says what that means', tipB.tip);
        await shot(B, '08-guest-hosts-look.png');
        await click(a, '#mpMenuBtn');
        await click(a, '#settingsLockBtn');
        check(!!await until(b, "(function(){var s=" + PANEL + "; return s.status === 'Swirling together · 3 here';})()", 4000), 'switching it off clears it');

        // ── 8. Take turns ─────────────────────────────────────────────
        await click(a, '#turnsBtn');
        await until(a, 'turnsOn && isMyTurn()', 5000);
        await until(b, 'turnsOn && !isMyTurn()', 5000);
        await sleep(600);
        const tA = await a.eval(PANEL), tB = await b.eval(PANEL);
        const aName = await a.eval('shortName(clientId)'), bName = await b.eval('shortName(clientId)');
        check(/^Your turn · \d:\d\d · 3 here$/.test(tA.status), 'turns, holder: "Your turn · m:ss · 3 here"', tA.status);
        check(new RegExp('^' + aName + '\u2019s turn · \\d:\\d\\d · 3 here$').test(tB.status), 'turns, watcher: "' + aName + '\u2019s turn · m:ss · 3 here"', tB.status);
        check(tA.labels.indexOf('Pass') !== -1 && tB.labels.indexOf('Pass') === -1, 'Pass shows only for whoever holds the brush', { A: tA.labels, B: tB.labels });
        check(tA.enabled <= HOST_MAX && tB.enabled <= GUEST_MAX, 'turns: host ' + tA.enabled + ' / guest ' + tB.enabled + ' controls', { A: tA.labels, B: tB.labels });
        check(/Turns\*/.test((tA.controls.find((x) => x.id === 'mpRhythm') || {}).label || ''), 'the switch reads Turns', tA.controls.find((x) => x.id === 'mpRhythm'));
        const q = await b.eval("(function(){ var w=document.getElementById('turnWheel'); return { rows: w.querySelectorAll('.mp-turn-qrow').length, clock: /\\d:\\d\\d/.test(w.textContent) }; })()");
        check(q.rows === 3 && !q.clock, 'the queue lists all three and carries no clock', q);
        const chip = await b.eval("(document.getElementById('mpTurnChip')||{}).textContent || ''");
        check(/\d:\d\d/.test(chip), 'the underbar chip keeps its clock', chip);
        await click(a, '#mpMenuBtn');
        const mT = await a.eval(POP('mpRoomMenu'));
        check(mT.items.map((x) => x.label).join(',') === 'Lock room,Copy room report', 'host ⋯ while holding: no look lock, no Skip', mT.items.map((x) => x.label));
        await click(a, '#mpMenuBtn');
        await shot(A, '09-turns-your-turn.png');
        await shot(B, '09-turns-their-turn.png');

        await click(a, '#turnPassBtn');
        const bTurn = await until(b, 'isMyTurn()', 5000);
        check(!!bTurn, 'Pass hands the brush on (to B)');
        await sleep(400);
        const tB2 = await b.eval(PANEL), tA2 = await a.eval(PANEL);
        check(/^Your turn · \d:\d\d · 3 here$/.test(tB2.status), 'guest holding: "Your turn"', tB2.status);
        check(tB2.labels.indexOf('Pass') !== -1 && tB2.enabled <= GUEST_MAX, 'guest holding: Pass, and still at most ' + GUEST_MAX + ' controls', tB2.labels);
        check(new RegExp('^' + bName + '\u2019s turn').test(tA2.status) && tA2.labels.indexOf('Pass') === -1, 'host watching: "' + bName + '\u2019s turn", no Pass', tA2);
        await click(a, '#mpMenuBtn');
        const mS = await a.eval(POP('mpRoomMenu'));
        check(mS.items.map((x) => x.label).indexOf('Skip ' + bName) !== -1, 'host ⋯ while someone else paints: "Skip ' + bName + '"', mS.items.map((x) => x.label));
        await shot(A, '10-host-skip-menu.png');
        await shot(B, '10-guest-your-turn.png');
        await click(a, '#turnSkipBtn');
        const skipped = await until(b, '!isMyTurn()', 4000);
        check(!!skipped && !(await b.eval('isMyTurn()')), 'Skip moves the brush past B');

        // ── 9. Switch to Call and return while turns run ─────────────
        await click(a, '#callReturnBtn');
        const cr = await until(a, "turnsOn && turnModeLocal === 'stroke'", 6000);
        check(!!cr, 'picking Call & return while Turns runs: stop, then start it');
        await until(b, "turnsOn && turnModeLocal === 'stroke'", 4000);
        await sleep(400);
        const cA = await a.eval(PANEL), cB = await b.eval(PANEL);
        const holder = await a.eval('turnHolderId'), holderName = await a.eval('shortName(turnHolderId)');
        const aHolds = holder === (await a.eval('clientId'));
        check(aHolds ? /^Your call · 3 here$/.test(cA.status) : new RegExp('^' + holderName + '\u2019s call · 3 here$').test(cA.status), 'call and return: "Your call" / "{Name}\u2019s call", no clock', cA.status);
        check(new RegExp('^(Your call|' + holderName + '\u2019s call) · 3 here$').test(cB.status), 'and the guest\'s line agrees', cB.status);
        check(/Call & return\*/.test((cA.controls.find((x) => x.id === 'mpRhythm') || {}).label || ''), 'the switch reads Call & return', cA.controls.find((x) => x.id === 'mpRhythm'));
        await shot(A, '11-call-and-return.png');
        await shot(B, '11-call-and-return-guest.png');

        // ── 10. Back to Together ─────────────────────────────────────
        await click(a, '#togetherBtn');
        const free = await until(b, "!turnsOn && !window.__mpTurnBlocked", 5000);
        check(!!free, 'Together stops the rotation for everyone');
        const fA = await until(a, "(function(){var s=" + PANEL + "; return s.status === 'Swirling together · 3 here' ? s : null;})()", 3000);
        check(!!fA, 'and the line goes back to "Swirling together · 3 here"', fA && fA.status);

        // ── 11. A stranger pair (B and C) ─────────────────────────────
        await click(b, '#disconnectBtn');
        await click(c, '#disconnectBtn');
        await until(a, 'connectedClients === 1', 6000);
        const sAlone = await a.eval(PANEL);
        check(sAlone.status === 'Waiting for friends · just you' && sAlone.dot === 'mp-dot-alone', 'the others left: back to "Waiting for friends · just you"', sAlone.status);
        await click(a, '#disconnectBtn');
        await sleep(300);
        await click(b, '#strangerBtn');
        const finding = await until(b, "(function(){var s=" + PANEL + "; return /^(Finding a stranger…|Connecting…|Waiting for a stranger…)/.test(s.status) ? s : null;})()", 4000);
        check(!!finding, 'Stranger: the line says it is looking', finding && finding.status);
        const bWait = await until(b, "(function(){var s=" + PANEL + "; return /^Waiting for a stranger… · just you$/.test(s.status) ? s : null;})()", 8000);
        check(!!bWait, 'B waits: "Waiting for a stranger… · just you"', bWait && bWait.status);
        if (bWait) {
            check(bWait.labels.join(',') === '📱 Phone,Leave', 'waiting: just the phone door and Leave', bWait.labels);
            await shot(B, '12-waiting-for-stranger.png');
        }
        await click(c, '#strangerBtn');
        const paired = await until(b, "isStrangerRoom() && connectedClients === 2", 30000) && await until(c, "isStrangerRoom() && connectedClients === 2", 8000);
        check(!!paired, 'B and C are paired');
        await sleep(500);
        const pB = await b.eval(PANEL), pC = await c.eval(PANEL);
        check(pB.status === 'Swirling with a stranger · 2 here' && pC.status === 'Swirling with a stranger · 2 here', 'pair: "Swirling with a stranger · 2 here"', [pB.status, pC.status]);
        check(pB.labels[0] === '📱 Phone' && pC.labels[0] === '📱 Phone', 'pair: Invite becomes "📱 Phone"', [pB.labels, pC.labels]);
        check(pB.enabled <= HOST_MAX && pC.enabled <= HOST_MAX, 'pair: at most ' + HOST_MAX + ' controls each', [pB.labels, pC.labels]);
        const segP = [pB, pC].map((s) => s.controls.find((x) => x.id === 'mpRhythm'));
        check(segP.every((x) => x && x.enabled), 'pair: both may pick the rhythm', segP);
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
        await click(b, '#turnsBtn');
        const asking = await until(b, "document.getElementById('turnsBtn').textContent === 'Asking…'", 3000);
        check(!!asking, 'pair: picking Turns asks the partner ("Asking…")');
        const offer = await until(c, "!!document.getElementById('mpTurnInvite')", 4000);
        check(!!offer, 'and C is asked');
        await shot(B, '14-pair-asking.png');
        await shot(C, '14-pair-asked.png');
        await click(c, '#mpTurnInvite .mp-invite-yes');
        const pairTurns = await until(b, 'turnsOn', 4000) && await until(c, 'turnsOn', 4000);
        check(!!pairTurns, 'C agrees: the pair takes turns');
        await sleep(400);
        const ptB = await b.eval(PANEL), ptC = await c.eval(PANEL);
        check([ptB.status, ptC.status].some((s) => /^Your turn · \d:\d\d · 2 here$/.test(s)) && [ptB.status, ptC.status].some((s) => /\u2019s turn · \d:\d\d · 2 here$/.test(s)), 'pair turns: one "Your turn", one "{Name}\u2019s turn"', [ptB.status, ptC.status]);
        // C switches to Call and return mid-rotation: stop (anyone may), then ask B.
        await click(c, '#callReturnBtn');
        const asked2 = await until(b, "!!document.getElementById('mpTurnInvite') && /call and return/.test(document.getElementById('mpTurnInvite').textContent)", 6000);
        check(!!asked2, 'pair: switching rhythm stops turns, then asks for call and return');
        check(await c.eval("!turnsOn && document.getElementById('callReturnBtn').textContent === 'Asking…'"), 'and C\'s switch reads "Asking…" meanwhile');
        await click(b, '#mpTurnInvite .mp-invite-no');
        const declined = await until(c, "!invitePending && document.getElementById('togetherBtn').getAttribute('aria-pressed') === 'true'", 4000);
        check(!!declined, 'B says no: C is back on Together');
        await shot(C, '15-pair-declined.png');

        const eA = await a.eval('__pe.errs'), eB = await b.eval('__pe.errs'), eC = await c.eval('__pe.errs');
        const real = (arr) => arr.filter((s) => !/favicon|ERR_|net::|Failed to load resource|onnx|ort-wasm|WebGPU|WebSocket/i.test(s));
        check(real(eA).length === 0 && real(eB).length === 0 && real(eC).length === 0, 'no page errors', { A: real(eA).slice(0, 5), B: real(eB).slice(0, 5), C: real(eC).slice(0, 5) });
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
