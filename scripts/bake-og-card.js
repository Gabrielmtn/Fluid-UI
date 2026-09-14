// ═══════════════════════════════════════════════════════════════════
// scripts/bake-og-card.js — bakes the social-card image the <head> of
// index.html points at (og:image / twitter:image), 1200 x 630, out of the
// real app: a curated look applied through applyPreset, a short composition
// painted with real pointer events, the on-screen result clipped straight
// from the page (so the CSS ground is in the picture, unlike the export
// compositor — see docs/astra-audit-2026-09-12.md, "Captures lose the chosen background").
//
//   npx http-server . -p 8092 -c-1 &          (any static server on the repo)
//   node scripts/bake-og-card.js [look] [http://localhost:8092/]
//
// Writes assets/og/swirl-together-card.png. When the picture changes, change
// the FILENAME in index.html too: crawlers cache cards by URL for days.
// Throwaway headless profile on debug port 9336; one Chrome per run (the app
// arms onbeforeunload once it has painted and headless would hang on it).
// Program-generated like every other image asset: nothing is drawn on top.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { connect, waitReady } = require('./test/cdp.js');
const REPO = path.resolve(__dirname, '..');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const LOOK = process.argv[2] || 'currents';
const URL = process.argv[3] || 'http://localhost:8092/';
const OUT = path.join(REPO, 'assets', 'og', 'swirl-together-card.png');
const W = 1200, H = 630;
const profile = path.join(require('os').tmpdir(), 'fluid-og-profile-' + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portUp() {
    return new Promise((res) => {
        http.get('http://127.0.0.1:' + PORT + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false));
    });
}

// The composition, in canvas fractions. Stroke order is colour order for a
// Step look: Two currents starts on coral, then teal, coral, cream — two
// hands meeting, which is the tagline in one picture.
const COMPS = {
    currents: [
        { pts: [[0.06, 0.80], [0.28, 0.56], [0.50, 0.64], [0.70, 0.40]], ms: 900 },
        { pts: [[0.94, 0.18], [0.72, 0.34], [0.50, 0.30], [0.30, 0.50]], ms: 900 },
        { pts: [[0.40, 0.76], [0.60, 0.80], [0.70, 0.56], [0.56, 0.42]], ms: 800 },
        { pts: [[0.54, 0.54], [0.60, 0.48], [0.58, 0.44]], ms: 260 }
    ],
    opal: [
        { pts: [[0.08, 0.78], [0.30, 0.50], [0.50, 0.62], [0.68, 0.36]], ms: 900 },
        { pts: [[0.92, 0.20], [0.72, 0.36], [0.54, 0.28], [0.36, 0.44]], ms: 900 },
        { pts: [[0.44, 0.72], [0.62, 0.76], [0.68, 0.52], [0.54, 0.40]], ms: 800 },
        { pts: [[0.56, 0.56], [0.61, 0.50], [0.59, 0.45]], ms: 300 }
    ]
};

const JOB = `(async function () {
  const LOOK = ${JSON.stringify(LOOK)}, COMP = ${JSON.stringify(COMPS[LOOK] || COMPS.currents)};
  const raf = (n) => new Promise((res) => { (function t() { if (--n <= 0) return res(); requestAnimationFrame(t); })(); });
  // 60 Hz pacing: headless rAF runs at GPU speed, which would triple the dabs.
  (function paceRaf(hz) { if (window.__ogPaced) return; const period = 1000 / hz - 0.5; const native = window.requestAnimationFrame.bind(window); let q = new Map(), id = 0, armed = false, last = performance.now(); function flush(now) { armed = false; if (now - last < period) { armed = true; native(flush); return; } last = now; const cbs = Array.from(q.values()); q = new Map(); for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } } if (q.size && !armed) { armed = true; native(flush); } } window.requestAnimationFrame = function (cb) { const i = ++id; q.set(i, cb); if (!armed) { armed = true; native(flush); } return i; }; window.cancelAnimationFrame = function (i) { q.delete(i); }; window.__ogPaced = hz; })(60);
  const set = (id, v, ev) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event(ev || 'change', { bubbles: true })); };
  try { if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false); } catch (_) {}
  const gov = document.getElementById('governorToggle'); if (gov && gov.checked) { gov.checked = false; gov.dispatchEvent(new Event('change', { bubbles: true })); }
  set('visualResolution', '2048'); set('physicsResolution', '1024');
  if (typeof window.__reinitFramebuffers === 'function') window.__reinitFramebuffers(); else window.needsFramebufferReinit = true;
  await raf(6);
  window.clearCanvas();
  window.applyPreset(LOOK);
  await raf(12);
  const c = document.getElementById('canvas');
  c.setPointerCapture = function () {}; c.releasePointerCapture = function () {};
  function bez(pts, t) { let p = pts.map((q) => q.slice()); for (let k = p.length - 1; k > 0; k--) for (let i = 0; i < k; i++) p[i] = [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]; return p[0]; }
  function fire(type, u, v, buttons) { const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: buttons, clientX: r.left + u * r.width, clientY: r.top + v * r.height, pressure: buttons ? 0.5 : 0 })); }
  const colors = [];
  for (const s of COMP) {
    colors.push(document.getElementById('colorPicker').value);
    const n = Math.max(2, Math.round(s.ms / 16.7));
    let uv = bez(s.pts, 0); fire('pointerdown', uv[0], uv[1], 1);
    for (let i = 1; i <= n; i++) { await raf(1); const t = i / n; const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; uv = bez(s.pts, e); fire('pointermove', uv[0], uv[1], 1); }
    fire('pointerup', uv[0], uv[1], 0);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0 }));
    await raf(12);
  }
  await raf(90);
  c.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
  Array.from(document.querySelectorAll('body > div, body > span')).filter((e) => /Drag on the canvas to paint/.test(e.textContent || '') && e.children.length < 4).forEach((e) => e.remove());
  await raf(2);
  const r = c.getBoundingClientRect();
  return { look: LOOK, colors: colors, gate: !!config.COLOR_GATE, canvas: [c.width, c.height], rect: { x: r.left, y: r.top, width: r.width, height: r.height } };
})()`;

(async () => {
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
        URL
    ], { stdio: 'ignore' });
    let page = null, code = 0;
    try {
        for (let i = 0; i < 80 && !(await portUp()); i++) await sleep(250);
        page = await connect(PORT);
        await waitReady(page, { timeoutMs: 60000 });
        for (let i = 0; i < 60; i++) {
            const ok = await page.eval("!!document.getElementById('mixer-strip') && !!document.getElementById('breathingToggle')").catch(() => false);
            if (ok) break;
            await sleep(250);
        }
        await page.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='▶' && window.togglePause) window.togglePause(); return 1; })()");
        const info = await page.eval(JOB, { timeoutMs: 300000 });
        const r = info.rect;
        if (r.width < W || r.height < H) throw new Error('canvas ' + r.width + 'x' + r.height + ' is smaller than the ' + W + 'x' + H + ' card; widen --window-size');
        // Centre the card in the canvas: the composition is built around the middle.
        const clip = { x: Math.round(r.x + (r.width - W) / 2), y: Math.round(r.y + (r.height - H) / 2), width: W, height: H, scale: 1 };
        const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: clip });
        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
        console.log('wrote', path.relative(REPO, OUT), fs.statSync(OUT).size, 'bytes;', JSON.stringify(info));
    } catch (e) {
        console.error('ERROR', e && e.stack || e);
        code = 1;
    } finally {
        try { if (page) await Promise.race([page.send('Browser.close', {}), sleep(3000)]); } catch (_) {}
        await sleep(1000);
        try { if (page) page.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        await sleep(500);
        try { spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)], { stdio: 'ignore' }); } catch (_) {}
        await sleep(800);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
        process.exit(code);
    }
})();
