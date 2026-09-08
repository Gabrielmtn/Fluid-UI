// ═══════════════════════════════════════════════════════════════════
// scripts/bake-headless.js — drives scripts/bake-effect-previews.js in a
// fresh headless Chrome.
//
//   node scripts/asset-receiver.js &            (writes the PUT files)
//   npx http-server . -p 8092 -c-1 &            (or any server on the repo)
//   node scripts/bake-headless.js "__fxBake.runAll()" http://localhost:8092/
//   node scripts/bake-headless.js job.js        (a file holding the expression)
//
// Launches a throwaway-profile headless Chrome (WebGL on the discrete GPU
// here; the page is always "visible", so no timer clamp or rAF pump),
// waives the PhotoSafe modal + interface fork, unpauses, injects the bake
// script, evaluates the job expression (awaited), prints the JSON result,
// kills Chrome. Progress goes to bake-headless.log beside this file (Node
// stdout is block-buffered when redirected). One Chrome per job: the app
// arms onbeforeunload once it has painted and headless leaves that dialog
// open forever, so never reload — relaunch. SHOT=<png> screenshots the
// page after the job.
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
const PORT = 9337;
const job = process.argv[2];
const URL = process.argv[3] || 'http://localhost:8092/';
const profile = path.join(require('os').tmpdir(), 'fluid-bake-profile-' + process.pid);

function portUp() {
    return new Promise((res) => {
        http.get('http://127.0.0.1:' + PORT + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false));
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = path.join(__dirname, 'bake-headless.log');
function log() { const line = new Date().toISOString().slice(11, 19) + ' ' + Array.from(arguments).join(' '); fs.appendFileSync(LOG, line + String.fromCharCode(10)); }

(async () => {
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--autoplay-policy=no-user-gesture-required',
        URL
    ], { stdio: 'ignore' });
    let page = null;
    try {
        for (let i = 0; i < 80 && !(await portUp()); i++) await sleep(250);
        page = await connect(PORT);
        log('connected');
        log('waiting for app');
        await waitReady(page, { timeoutMs: 60000 });
        log('app ready');
        // The strip/sidebar build is deferred (setTimeout 800 → rAF).
        for (let i = 0; i < 60; i++) {
            const ok = await page.eval("!!document.getElementById('mixer-strip') && !!document.getElementById('breathingToggle')").catch(() => false);
            if (ok) break;
            await sleep(250);
        }
        await page.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='▶' && window.togglePause) window.togglePause(); return 1; })()");
        const bake = fs.readFileSync(path.join(REPO, 'scripts', 'bake-effect-previews.js'), 'utf8');
        const inst = await page.eval(bake);
        const info = await page.eval("(function(){ var c=document.getElementById('canvas'); var gl=c.getContext('webgl2')||c.getContext('webgl'); var d=gl&&gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: d? gl.getParameter(d.UNMASKED_RENDERER_WEBGL):null, canvas:[c.width,c.height], vis: document.visibilityState, strips: document.querySelectorAll('#mixer-strip').length, sim: window.config.SIM_RESOLUTION, dye: window.config.DYE_RESOLUTION, mobile: document.body.classList.contains('mobile-mode') }; })()");
        log('ready', JSON.stringify(info), 'bake:', JSON.stringify(inst));
        const expr = /\.js$/i.test(job) ? fs.readFileSync(job, 'utf8') : job;
        log('job start', job);
        const out = await page.eval(expr, { timeoutMs: 600000 });
        log('job done');
        // SHOT=<png path>: screenshot the page after the job (hover-card checks).
        if (process.env.SHOT) {
            const shot = await page.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
            log('shot', process.env.SHOT);
        }
        
        console.log(JSON.stringify(out, null, 1));
    } catch (e) {
        log('ERROR', e && e.stack || e);
        console.error('[driver] ERROR', e && e.stack || e);
        process.exitCode = 1;
    } finally {
        if (page) page.close();
        try { chrome.kill(); } catch (_) {}
        await sleep(500);
        try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
        await sleep(800);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
        process.exit(process.exitCode || 0);
    }
})();
