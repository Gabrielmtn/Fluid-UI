// ═══════════════════════════════════════════════════════════════════
// scripts/test/cdp.js — minimal CDP client for the test harness.
//
// Same mechanism as tmp-cdp-driver.js (which is temporary; this is the
// durable copy): attach to a Chromium debug port, evaluate page code,
// await promises, return JSON values. Works against BOTH targets:
//   • the Electron build:  electron.exe . --remote-debugging-port=9333
//   • the web build in headless Chrome for the browser usertest:
//     chrome --headless=new --remote-debugging-port=9333 <url>
//
// Usage:
//   const { connect } = require('./cdp');
//   const page = await connect(9333);
//   const v = await page.eval('1 + 1');          // expression
//   const r = await page.evalFile('scripts/test/harness.js');
//   page.close();
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

function getTarget(port) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json`, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const list = JSON.parse(d);
                    const page = list.find(t => t.type === 'page');
                    if (!page) reject(new Error('no page target on port ' + port));
                    else resolve(page.webSocketDebuggerUrl);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function connect(port) {
    const url = await getTarget(port || 9333);
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
    let id = 0;
    const pending = new Map();

    const send = (method, params) => new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
    });

    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
        }
    });
    await send('Runtime.enable', {});

    return {
        // Evaluate an expression. Promises are awaited; the settled value
        // must be JSON-serializable (returnByValue).
        async eval(expr, { timeoutMs = 300000 } = {}) {
            const r = await Promise.race([
                send('Runtime.evaluate', {
                    expression: expr,
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true,
                }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout')), timeoutMs)),
            ]);
            if (r.exceptionDetails) {
                const ex = r.exceptionDetails;
                throw new Error('page exception: ' +
                    (ex.exception && (ex.exception.description || ex.exception.value) || ex.text));
            }
            return r.result && r.result.value;
        },
        evalFile(path, opts) {
            return this.eval(fs.readFileSync(path, 'utf8'), opts);
        },
        close() { try { ws.close(); } catch (_) {} },
    };
}

// Poll until the app's boot is far enough along for the harness. The
// debug port opens well before the classic-script chain finishes, so
// connecting is not the same as ready.
async function waitReady(page, { timeoutMs = 30000 } = {}) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.eval(
            '!!(window.applyMultiSplatWith && window.clearCanvas && window.density && window.density.read)'
        ).catch(() => false);
        if (ok) return true;
        if (Date.now() - t0 > timeoutMs) throw new Error('app never became ready');
        await new Promise(r => setTimeout(r, 250));
    }
}

module.exports = { connect, waitReady };
