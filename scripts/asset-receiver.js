// ═══════════════════════════════════════════════════════════════════
// scripts/asset-receiver.js — the local PUT target for the bake scripts.
// Writes PUT /assets/<rel> bodies to <repo>/assets/<rel>; CORS-open (the
// page lives on another localhost port).   node scripts/asset-receiver.js
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const PORT = 3999;
http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const m = /^\/assets\/([a-z0-9_\-./]+)$/i.exec(req.url || '');
    if (!m || m[1].includes('..')) { res.writeHead(400); return res.end('bad path'); }
    const file = path.join(ROOT, 'assets', m[1]);
    if (req.method === 'PUT') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const buf = Buffer.concat(chunks);
            fs.writeFileSync(file, buf);
            console.log('PUT', m[1], buf.length);
            res.writeHead(200); res.end('ok');
        });
        return;
    }
    res.writeHead(405); res.end();
}).listen(PORT, '127.0.0.1', () => console.log('receiver on', PORT, '->', ROOT));
