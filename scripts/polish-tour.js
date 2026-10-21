#!/usr/bin/env node
// The final polish tour: a step-by-step walk through every surface of the UI,
// one stop at a time, with a verdict per stop (Love it / Polish / Kill it) and
// notes pinned to the exact element. Dev only: this server serves the repo
// LIVE (no cache) and adds scripts/polish-tour/tour.js to index.html on the way
// out, so the shipped index.html never carries it.
//
//   npm run polish-tour            -> http://127.0.0.1:3997/?tour
//   ?tour=12                       -> jump to stop 12
//
// Answers are written to prep/polish/answers.json (and a readable
// answers.md) on every change, so Claude can read them mid-session. Claude's
// replies go in prep/polish/replies.json ({ "<stop id>": { "status": "fixed" |
// "question" | "wontfix", "text": "..." } }); the tour polls it and shows them
// on the stop. A query, not a hash: the app joins any #CODE as a room on load.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const TOUR_DIR = path.join(__dirname, 'polish-tour');
const OUT_DIR = path.join(REPO, 'prep', 'polish');
const ANSWERS = path.join(OUT_DIR, 'answers.json');
const ANSWERS_MD = path.join(OUT_DIR, 'answers.md');
const REPLIES = path.join(OUT_DIR, 'replies.json');
const PORT = parseInt(process.env.PORT || process.argv[2] || '3997', 10);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

function readBody(req) {
    return new Promise((res, rej) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => res(Buffer.concat(c).toString('utf8'))); req.on('error', rej); });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readJSON(fp, fallback) { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return fallback; } }

const VERDICT = { love: 'Love it', polish: 'Polish', kill: 'Kill it', later: 'Not sure yet' };
function toMarkdown(state) {
    const stops = state.stops || [];
    const out = ['# Polish tour answers', '', 'Saved ' + new Date().toISOString() + (state.viewport ? ' · viewport ' + state.viewport : ''), ''];
    let n = 0;
    stops.forEach((s, i) => {
        const a = (state.answers || {})[s.id];
        if (!a || (!a.verdict && !(a.note || '').trim() && !(a.pins || []).length)) return;
        n++;
        out.push('## ' + (i + 1) + '. ' + s.title + '  `' + s.id + '`');
        out.push('**' + (VERDICT[a.verdict] || 'No verdict') + '**' + ((a.note || '').trim() ? ': ' + a.note.trim() : ''));
        const ticked = (a.checks || []);
        if (s.checks && s.checks.length) out.push('Checked ' + ticked.length + ' of ' + s.checks.length + (ticked.length < s.checks.length ? ' (open: ' + s.checks.filter((_, k) => ticked.indexOf(k) < 0).join('; ') + ')' : ''));
        (a.pins || []).forEach((p) => {
            out.push('- 📍 **' + p.label + '** `' + p.sel + '`' + (p.state ? ' [' + p.state + ']' : '') + ': ' + (p.note || '(no note)'));
        });
        out.push('');
    });
    if (!n) out.push('(nothing answered yet)');
    return out.join('\n');
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://x');
        const p = decodeURIComponent(url.pathname);
        if (p === '/__tour/tour.js' || p === '/__tour/geometry.js') {
            res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
            return res.end(fs.readFileSync(path.join(TOUR_DIR, path.basename(p))));
        }
        if (p === '/__tour/state' && req.method === 'GET') return json(res, 200, readJSON(ANSWERS, {}));
        if (p === '/__tour/state' && req.method === 'POST') {
            const state = JSON.parse(await readBody(req) || '{}');
            fs.mkdirSync(OUT_DIR, { recursive: true });
            fs.writeFileSync(ANSWERS, JSON.stringify(state, null, 2));
            fs.writeFileSync(ANSWERS_MD, toMarkdown(state));
            return json(res, 200, { ok: true });
        }
        if (p === '/__tour/replies') return json(res, 200, readJSON(REPLIES, {}));
        if (p === '/' || p === '/index.html') {
            const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')
                .replace('</body>', '<script src="/__tour/geometry.js"></script><script src="/__tour/tour.js"></script></body>');
            res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
            return res.end(html);
        }
        let fp = path.join(REPO, p);
        if (!fp.startsWith(REPO)) { res.writeHead(403); return res.end(); }
        if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
        if (!fs.existsSync(fp)) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(fp).pipe(res);
    } catch (e) {
        json(res, 500, { error: String(e && e.stack || e) });
    }
});
server.listen(PORT, '127.0.0.1', () => {
    console.log('polish tour  http://127.0.0.1:' + PORT + '/?tour');
    console.log('answers  ->  ' + path.relative(REPO, ANSWERS_MD));
});
