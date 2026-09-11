// Scatter's "Brush" light source follows the HAND while a replay runs
// (2026-09-11, Gabriel: "during replay, if the brush source says brush, we
// want the paint to happen in the right spot, but for the light source to
// be connected to the current brush location, not the replay one").
// Headless Chrome against http://127.0.0.1:3000/ (APP_URL=): paint a stroke
// across the middle, hold Replay with the right button in a corner, then
// move the mouse along the TOP edge with the button held — the origin must
// track the mouse up there while the replay repaints the middle stroke, and
// the stroke state (`pointer`) must stay frozen where the hold began.
//
//   node scripts/test/pen-window/scatter-replay.js
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { connect } = require('../cdp.js');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9351;
const URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const profile = path.join(require('os').tmpdir(), 'fluid-scatter-replay-' + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, ok, info) { checks.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
function portUp() { return new Promise((res) => { http.get('http://127.0.0.1:' + PORT + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false)); }); }

(async () => {
    const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1600,900', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', URL], { stdio: 'ignore' });
    let page = null;
    try {
        for (let i = 0; i < 80 && !(await portUp()); i++) await sleep(250);
        page = await connect(PORT);
        for (let i = 0; i < 240; i++) {
            const ok = await page.eval("!!(window.applyMultiSplatWith && window.clearCanvas && document.getElementById('mixer-strip') && document.getElementById('scatterSource'))").catch(() => false);
            if (ok) break; await sleep(250);
        }
        await page.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} window.__skipUIFork = true; var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; try { if (window.UIVisibility && window.UIVisibility.forkPending()) window.UIVisibility.chooseLayout(null); } catch(_) {} var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='▶' && window.togglePause) window.togglePause(); return 1; })()");
        await sleep(600);
        // Glow + Scatter on, source = Brush (through the real select so the origin resets).
        const setup = await page.eval("(function(){ window.config.GLOW = true; window.config.SCATTER = true; var s=document.getElementById('scatterSource'); s.value='brush'; s.dispatchEvent(new Event('change',{bubbles:true})); return { src: window.config.SCATTER_SOURCE, glow: !!window.config.GLOW, scatter: !!window.config.SCATTER, fx: window.QualityGovernor ? window.QualityGovernor.fxOn() : 'n/a' }; })()");
        check('Glow + Scatter on with the Brush source', setup.src === 'brush' && setup.glow && setup.scatter && setup.fx !== false, setup);
        const c = await page.eval("(function(){ var r=document.getElementById('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()");
        const gl = (fx, fy) => ({ x: fx, y: 1 - fy });   // canvas fraction → GL-space origin
        // A stroke across the middle, 20% → 80% of the width, rising a little.
        const y0 = c.t + c.h * 0.6, x0 = c.l + c.w * 0.2, x1 = c.l + c.w * 0.8;
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'mouse' });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        for (let i = 1; i <= 24; i++) {
            await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / 24, y: y0 - c.h * 0.2 * i / 24, button: 'left', buttons: 1, pointerType: 'mouse' });
            await sleep(25);
        }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y0 - c.h * 0.2, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await sleep(300);
        const live = await page.eval("({ o: window.__scatterOrigin, p: { x: window.pointer.x / document.getElementById('canvas').width, y: 1 - window.pointer.y / document.getElementById('canvas').height } })");
        check('live stroke: origin follows the pointer (near the stroke end)', live.o && Math.abs(live.o.x - live.p.x) < 0.15 && Math.abs(live.o.y - live.p.y) < 0.15, live);
        // Park in the bottom-left corner and hold Replay.
        const px = c.l + c.w * 0.05, py = c.t + c.h * 0.95;
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, pointerType: 'mouse' });
        await sleep(400);
        const parkedOrigin = await page.eval('window.__scatterOrigin');
        check('hovering to the corner: origin follows the hand there', parkedOrigin && Math.abs(parkedOrigin.x - 0.05) < 0.1 && Math.abs(parkedOrigin.y - 0.05) < 0.1, parkedOrigin);
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'right', buttons: 2, clickCount: 1, pointerType: 'mouse' });
        await sleep(60);
        const hold = await page.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive, n: (window._activeReplayEvents||[]).length, px: window.pointer.x, py: window.pointer.y })");
        // With the button held, sweep the mouse along the TOP edge, 20% → 80%.
        const samples = [];
        for (let i = 0; i <= 12; i++) {
            const mx = c.l + c.w * (0.2 + 0.6 * i / 12), my = c.t + c.h * 0.1;
            await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'right', buttons: 2, pointerType: 'mouse' });
            await sleep(90);
            samples.push(await page.eval("(function(){ var o=window.__scatterOrigin; return { ox: +o.x.toFixed(3), oy: +o.y.toFixed(3), px: +(window.pointer.x / document.getElementById('canvas').width).toFixed(3), replay: !!isReplayActive }; })()"));
        }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.l + c.w * 0.8, y: c.t + c.h * 0.1, button: 'right', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        console.log('samples:', JSON.stringify(samples));
        const last = samples[samples.length - 1];
        const want = gl(0.8, 0.1);
        const xs = samples.map((s) => s.ox);
        const rising = xs.every((v, i) => i === 0 || v >= xs[i - 1] - 0.02);
        const upTop = samples.slice(4).every((s) => s.oy > 0.6);   // never dips to the replayed stroke's band (GL y 0.4–0.6)
        check('replay held: the light follows the HAND along the top while the replay paints the middle (origin tracks the mouse, never the stroke)', hold.right && hold.replay && hold.n > 5 && samples.every((s) => s.replay) && Math.abs(last.ox - want.x) < 0.12 && Math.abs(last.oy - want.y) < 0.12 && rising && upTop, { hold: { right: hold.right, replay: hold.replay, n: hold.n }, last, want });
        const frozen = samples.every((s) => Math.abs(s.px - 0.05) < 0.01);
        check('...while the stroke state stays frozen where the hold began (the paint lands where it was recorded)', frozen, { pointerXs: samples.map((s) => s.px) });
        await sleep(200);
        const after = await page.eval("({ right: !!isRightMouseDown, replay: !!isReplayActive })");
        check('after release: hold ends', !after.right && !after.replay, after);
        console.log(JSON.stringify({ ok: checks.every((c) => c.ok), fails: checks.filter((c) => !c.ok).map((c) => c.name) }));
    } catch (e) { console.error('[scatter-replay] ERROR', e && e.stack || e); process.exitCode = 1; }
    finally { if (page) page.close(); try { chrome.kill(); } catch (_) {} setTimeout(() => { try { require('fs').rmSync(profile, { recursive: true, force: true }); } catch (_) {} process.exit(); }, 500); }
})();
