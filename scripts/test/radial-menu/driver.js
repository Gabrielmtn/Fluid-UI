// Headless-Chrome driver for the radial menu checks: its own static server
// on the repo root (so no dev server has to be up), CDP over Node's global
// WebSocket (Node 22+, no `ws`), trusted mouse / key / touch input, and a
// clean Chrome profile per boot with the PhotoSafe warning, the startup fork
// and the first-run hint already answered. boot({ seed }) puts more
// localStorage keys in place before the app's first script runs; args adds
// Chrome flags (the audio checks need --autoplay-policy=no-user-gesture-required).
//
// CHROME= overrides the browser; SHOT_DIR= makes shot(name) write PNGs there.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.cur': 'image/x-icon' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p === '/') p = '/index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end(); return; }
            fs.readFile(f, (err, buf) => {
                if (err) { res.writeHead(404); res.end('nf'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                res.end(buf);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

function getJSON(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } }); }).on('error', reject);
    });
}

async function boot(opts) {
    opts = opts || {};
    const srv = await serve();
    const port = srv.address().port;
    const dbg = 9400 + Math.floor(Math.random() * 400);
    const profile = path.join(os.tmpdir(), 'fluid-radial-e2e-' + dbg);
    const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + dbg, '--user-data-dir=' + profile,
        '--window-size=1600,900', '--no-first-run', '--no-default-browser-check', '--mute-audio'].concat(opts.args || [], ['about:blank']), { stdio: 'ignore' });
    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
        await sleep(250);
        try { target = (await getJSON('http://127.0.0.1:' + dbg + '/json')).find(t => t.type === 'page'); } catch (_) {}
    }
    if (!target) throw new Error('chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map(); const events = [];
    ws.onmessage = m => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
        else if (msg.method) {
            events.push(msg);
            // A reload after painting asks "Leave site?": yes, or the navigate never returns.
            if (msg.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
        }
    };
    const send = (method, params) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
    await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const seed = Object.assign({ 'fluidui.photoWarn.ack.v1': '1', 'fluidui.uiFork.skip': '1', 'fluidFirstRunDone': '1' }, opts.seed || {});
    await send('Page.addScriptToEvaluateOnNewDocument', { source:
        'try{var s=' + JSON.stringify(seed) + ';for(var k in s){if(localStorage.getItem(k)==null||' + JSON.stringify(!!opts.forceSeed) + ')localStorage.setItem(k,s[k]);}}catch(e){}window.__skipUIFork=true;' });
    const ev = async (expr) => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) throw new Error('page exception: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
        return r.result && r.result.value;
    };
    const url = 'http://127.0.0.1:' + port + '/index.html';
    const load = async () => {
        await send('Page.navigate', { url });
        for (let i = 0; i < 160; i++) {
            await sleep(250);
            const ok = await ev('!!(window.applyMultiSplatWith && window.density && window.density.read && document.getElementById("mixer-strip") && document.querySelector("#sidebar-right .hk-block"))').catch(() => false);
            if (ok) break;
            if (i === 159) throw new Error('app never became ready');
        }
        await ev('(function(){var p=document.getElementById("photoWarn"); if(p) p.style.display="none"; return 1;})()');
        // Wait for the splash to go.
        for (let i = 0; i < 60; i++) {
            const gone = await ev('(function(){var s=document.getElementById("splash-screen"); return !s || getComputedStyle(s).display==="none" || s.style.display==="none";})()');
            if (gone) break;
            await sleep(250);
        }
        await sleep(600);
    };
    await load();
    const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
    const mouse = (type, x, y, o) => send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'none', buttons: 0, clickCount: 0, pointerType: 'mouse' }, o || {}));
    const BTN = { left: 1, right: 2, middle: 4 };
    const api = {
        send, ev, sleep, load, url, events,
        move: (x, y, buttons) => mouse('mouseMoved', x, y, { buttons: buttons || 0 }),
        down: (x, y, button) => mouse('mousePressed', x, y, { button: button || 'left', buttons: BTN[button || 'left'], clickCount: 1 }),
        up: (x, y, button) => mouse('mouseReleased', x, y, { button: button || 'left', buttons: 0, clickCount: 1 }),
        async click(x, y, button) { await api.move(x, y); await api.down(x, y, button); await sleep(40); await api.up(x, y, button); await sleep(60); },
        async keyDown(key, code, vk, mods, text, repeat) {
            const m = (mods || []).reduce((a, k) => a | MOD[k], 0);
            await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: m, text: text || undefined, unmodifiedText: text || undefined, autoRepeat: !!repeat });
        },
        async keyUp(key, code, vk, mods) {
            const m = (mods || []).reduce((a, k) => a | MOD[k], 0);
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: m });
        },
        async tap(key, code, vk, mods, text) { await api.keyDown(key, code, vk, mods, text); await sleep(30); await api.keyUp(key, code, vk, mods); await sleep(60); },
        async shot(name) { if (!process.env.SHOT_DIR) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.SHOT_DIR, name), Buffer.from(r.data, 'base64')); },
        async close() { try { ws.close(); } catch (_) {} try { chrome.kill(); } catch (_) {} srv.close(); await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} }
    };
    return api;
}

module.exports = { boot, sleep };
