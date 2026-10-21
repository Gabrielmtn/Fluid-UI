// ═══════════════════════════════════════════════════════════════════
// scripts/bake-trailer.js — records trailer clips straight out of the app
// and strings them together with ffmpeg.
//
//   node scripts/bake-trailer.js probe              boot, report, screenshot
//   node scripts/bake-trailer.js clips [key ...]    record scenes (default: all)
//   node scripts/bake-trailer.js assemble [key ...] join clips/<key>.mp4 in order
//   node scripts/bake-trailer.js all                clips, then assemble
//   node scripts/bake-trailer.js splash             screenshot the boot screen (title + end use it)
//   node scripts/bake-trailer.js stills [key ...]   store screenshots: no captions, PNGs → stills/
//   CAPTIONS=1 ... stills [key ...]                 the same, each scene's caption kept
//   MUSIC=<audio> ... assemble                      cuts land on the track's strong beats (scripts/trailer-beats.js)
//
// One throwaway-profile headless Chrome (WebGL on the discrete GPU, the
// page always "visible") at exactly 1920×1080, Focus mode, the app served
// by a static server inside this script. Each scene in
// scripts/bake-trailer-scenes.js sets the look, puts its caption IN the
// canvas with the Text tool and paints with real pointer events.
//
// FRAME-LOCKED: the sim runs on the test harness's virtual clock
// (scripts/test/harness.js freeze/step), one exact 1/60 s step per output
// frame. Each frame is composited the way the app's exporter does it
// (fluidExport.captureFrame) and streamed raw to ffmpeg here, so no frame
// repeats however heavy the quality settings. (The app's real-time Video
// export at 1080p repeated ~20% of frames: the sim drew ~48 fps while
// capturing.) Clips land in notes/trailer-draft/clips/<key>.mp4.
//
// The profile is thrown away afterwards, so no setting a scene changes can
// reach a real profile. electron-builder drops scripts/, so nothing here
// ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { connect, waitReady } = require('./test/cdp.js');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'notes', 'trailer-draft');
const CLIPS = path.join(OUT, 'clips');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'C:/Users/Gabri/ffmpeg-2023-09-07-git-9c9f48e7f2-full_build/bin/ffmpeg.exe';
const CDP_PORT = 9341;
const W = 1920, H = 1080;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = path.join(OUT, 'bake.log');
function log() {
    const line = new Date().toISOString().slice(11, 19) + ' ' + Array.from(arguments).join(' ');
    fs.mkdirSync(OUT, { recursive: true });
    fs.appendFileSync(LOG, line + '\n');
    console.log(line);
}

// ── Static server for the repo, plus the clip receiver ──────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.webp': 'image/webp', '.gif': 'image/gif', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
// Raw RGBA frames from the page, piped into one ffmpeg per clip.
const streams = new Map();   // key → { proc, frames, done }
function clipBegin(key, w, h, fps) {
    fs.mkdirSync(CLIPS, { recursive: true });
    const proc = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', w + 'x' + h, '-r', String(fps), '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '13', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        path.join(CLIPS, key + '.mp4')], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d; });
    const done = new Promise((r) => proc.on('close', (code) => r({ code, err: err.slice(-2000) })));
    streams.set(key, { proc, frames: 0, done });
}
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const url = decodeURIComponent((req.url || '/').split('?')[0]);
            const clip = /^\/__clip\/([a-z0-9_-]+)\/(begin|end)$/i.exec(url);
            if (clip && req.method === 'POST') {
                const key = clip[1];
                if (clip[2] === 'begin') {
                    const q = new URLSearchParams((req.url.split('?')[1]) || '');
                    clipBegin(key, +q.get('w'), +q.get('h'), +q.get('fps'));
                    res.writeHead(200); return res.end('ok');
                }
                const st = streams.get(key);
                if (!st) { res.writeHead(404); return res.end('no stream'); }
                st.proc.stdin.end();
                st.done.then((r) => {
                    streams.delete(key);
                    log('clip', key + '.mp4', st.frames, 'frames', r.code === 0 ? '' : 'ffmpeg exit ' + r.code + ' ' + r.err);
                    res.writeHead(r.code === 0 ? 200 : 500); res.end(JSON.stringify({ frames: st.frames, code: r.code }));
                });
                return;
            }
            const frame = /^\/__frame\/([a-z0-9_-]+)$/i.exec(url);
            if (frame && req.method === 'PUT') {
                const st = streams.get(frame[1]);
                const chunks = [];
                req.on('data', (c) => chunks.push(c));
                req.on('end', () => {
                    if (!st) { res.writeHead(404); return res.end(); }
                    st.frames++;
                    st.proc.stdin.write(Buffer.concat(chunks), () => { res.writeHead(200); res.end('ok'); });
                });
                return;
            }
            const put = /^\/__out\/([a-z0-9_.-]+)$/i.exec(url);
            if (put && req.method === 'PUT') {
                const chunks = [];
                req.on('data', (c) => chunks.push(c));
                req.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    const dir = put[1].startsWith('still-') ? path.join(OUT, 'stills') : put[1].endsWith('.png') ? OUT : CLIPS;
                    fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(path.join(dir, put[1]), buf);
                    log('saved', put[1], (buf.length / 1e6).toFixed(1) + ' MB');
                    res.writeHead(200); res.end('ok');
                });
                return;
            }
            let file = path.join(REPO, url === '/' ? 'index.html' : url);
            if (!file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
            fs.stat(file, (err, st) => {
                if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                fs.createReadStream(file).pipe(res);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

function portUp(port) {
    return new Promise((res) => {
        http.get('http://127.0.0.1:' + port + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false));
    });
}

// ── A local relay for the multi-artist scenes ───────────────────────
// wrangler dev on 127.0.0.1 (wrangler.jsonc), so no room ever touches
// the live server. ~7 s to come up.
const RELAY_PORT = 8788;
async function startRelay() {
    const proc = spawn(process.execPath, [path.join(REPO, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
        'dev', '--port', String(RELAY_PORT), '--ip', '127.0.0.1'], { cwd: REPO, stdio: ['ignore', 'ignore', 'ignore'] });
    const up = () => new Promise((res) => {
        http.get('http://127.0.0.1:' + RELAY_PORT + '/', (r) => { r.resume(); res(true); }).on('error', () => res(false));
    });
    for (let i = 0; i < 180 && !(await up()); i++) await sleep(500);
    if (!(await up())) throw new Error('local relay never came up');
    log('relay up on 127.0.0.1:' + RELAY_PORT);
    return { host: '127.0.0.1:' + RELAY_PORT, close() { try { spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {} } };
}

// One headless Chrome running the app. The recorder is 1920×1080 in Focus
// mode; an artist is another person in the room (its own profile, so its
// own device id), smaller, painting on its own virtual clock.
async function boot(srv, opts) {
    opts = Object.assign({ role: 'recorder', port: CDP_PORT, w: W, h: H, relay: null, name: 'rec' }, opts || {});
    const profile = path.join(os.tmpdir(), 'fluid-trailer-' + opts.name + '-' + process.pid);
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + opts.port, '--user-data-dir=' + profile,
        '--window-size=' + opts.w + ',' + opts.h, '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
        'about:blank'
    ], { stdio: 'ignore' });
    for (let i = 0; i < 80 && !(await portUp(opts.port)); i++) await sleep(250);
    const page = await connect(opts.port);
    await page.send('Page.enable', {});
    await page.send('Emulation.setDeviceMetricsOverride', { width: opts.w, height: opts.h, deviceScaleFactor: 1, mobile: false });
    // Before any app script: the PhotoSafe card and the interface fork are
    // answered, so neither modal sits on the canvas or eats the hotkeys;
    // and in a multi-artist run, the relay is the local one.
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source:
        "try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');localStorage.setItem('fluidui.uiFork.skip','1');" +
        (opts.relay ? "localStorage.setItem('fluidMultiplayerHost','" + opts.relay + "');" : '') +
        "}catch(_){} window.__skipUIFork=true;" });
    await page.send('Page.navigate', { url: 'http://127.0.0.1:' + srv.address().port + '/index.html' });
    await waitReady(page, { timeoutMs: 90000 });
    for (let i = 0; i < 80; i++) {
        const ok = await page.eval("!!document.getElementById('mixer-strip') && !!document.getElementById('breathingToggle') && !!window.textOverlays && !!window.fluidExport").catch(() => false);
        if (ok) break;
        await sleep(250);
    }
    await page.eval("(function(){ var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='▶' && window.togglePause) window.togglePause(); return 1; })()");
    await page.eval(fs.readFileSync(path.join(__dirname, 'bake-effect-previews.js'), 'utf8'));
    await page.eval(fs.readFileSync(path.join(__dirname, 'test', 'harness.js'), 'utf8'));
    await page.eval(fs.readFileSync(path.join(__dirname, 'bake-trailer-scenes.js'), 'utf8'));
    const info = await page.eval('window.__trailer.setup(' + JSON.stringify({ role: opts.role }) + ')', { timeoutMs: 60000 });
    log(opts.name, 'ready', JSON.stringify(info));
    return {
        page, name: opts.name,
        async close() {
            page.close();
            try { chrome.kill(); } catch (_) {}
            await sleep(500);
            try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
            await sleep(800);
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
        }
    };
}

// ── ffmpeg: crossfade the clips into one file ───────────────────────
function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
        p.on('close', (code) => code === 0 ? resolve() : reject(new Error(cmd + ' exited ' + code + '\n' + err.slice(-3000))));
    });
}
function probeDuration(file) {
    return new Promise((resolve) => {
        const p = spawn(FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
        let out = '';
        p.stdout.on('data', (d) => { out += d; });
        p.on('close', () => resolve(parseFloat(out) || 0));
    });
}
// Krita's before/after: the left half of one clip beside the right half
// of another (same strokes, one setting changed), a thin rule between.
async function split(name, left, right) {
    const L = path.join(CLIPS, left + '.mp4'), R = path.join(CLIPS, right + '.mp4');
    if (!fs.existsSync(L) || !fs.existsSync(R)) { log('split', name, 'skipped: missing', left, 'or', right); return; }
    const half = W / 2;
    await run(FFMPEG, ['-y', '-hide_banner', '-i', L, '-i', R, '-filter_complex',
        '[0:v]crop=' + half + ':' + H + ':0:0[l];[1:v]crop=' + half + ':' + H + ':' + half + ':0[r];' +
        '[l][r]hstack=shortest=1,drawbox=x=' + (half - 2) + ':y=0:w=4:h=' + H + ':color=white@0.55:t=fill[v]',
        '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '60',
        path.join(CLIPS, name + '.mp4')]);
    log('split', name, '=', left, '|', right);
}

async function assemble(keys) {
    const files = keys.map((k) => path.join(CLIPS, k + '.mp4')).filter((f) => fs.existsSync(f));
    if (!files.length) throw new Error('no clips in ' + CLIPS);
    const XF = 0.6;   // crossfade seconds
    const DIP_INTO = new Set(['textkeys', 'paste']);
    const durs = [];
    for (const f of files) durs.push(await probeDuration(f));
    // With music (MUSIC=<audio>, beats from scripts/trailer-beats.js), each
    // crossfade's midpoint lands on a strong bass note: a clip gives up to
    // MAX_TRIM s (from its start; the title from its end, so the splash
    // holds) or holds its last frame up to MAX_HOLD s.
    const music = process.env.MUSIC ? path.resolve(process.env.MUSIC) : null;
    const trims = durs.map(() => ({ head: 0, tail: 0, hold: 0 }));
    if (music) {
        const MAX_TRIM = 1.6, MAX_HOLD = 0.8;
        const map = JSON.parse(fs.readFileSync(music + '.beats.json', 'utf8'));
        const strong = map.strong.map((b) => b.t);
        let start = 0;
        for (let i = 0; i < files.length - 1; i++) {
            const mid = start + durs[i] - XF / 2;            // where this clip's crossfade centres untouched
            const early = strong.filter((b) => b <= mid && b >= mid - MAX_TRIM).pop();
            const late = strong.find((b) => b > mid && b <= mid + MAX_HOLD);
            // No strong bass note in reach: the nearest plain beat (never far).
            const any = map.beats.reduce((m, x) => Math.abs(x - mid) < Math.abs(m - mid) && x - mid <= MAX_HOLD ? x : m, -1e9);
            const b = early !== undefined ? early : late !== undefined ? late : any;
            const len = b + XF / 2 - start;
            if (len < durs[i]) trims[i][i === 0 ? 'tail' : 'head'] = durs[i] - len;
            else trims[i].hold = len - durs[i];
            durs[i] = len;
            log('cut', path.basename(files[i], '.mp4'), '->', b.toFixed(2) + ' s', (strong.indexOf(b) < 0 ? '(plain beat)' : ''),
                trims[i].head ? 'head -' + trims[i].head.toFixed(2) : '', trims[i].tail ? 'tail -' + trims[i].tail.toFixed(2) : '',
                trims[i].hold ? 'hold +' + trims[i].hold.toFixed(2) : '');
            start = b - XF / 2;
        }
    }
    const args = ['-y', '-hide_banner'];
    files.forEach((f) => args.push('-i', f));
    if (music) args.push('-i', music);
    // Every clip to the same shape first, then a chain of xfades. Each
    // offset is the running length minus the overlap so far.
    let filter = files.map((_, i) => {
        const tr = trims[i];
        const cut = tr.head ? 'trim=start=' + tr.head.toFixed(3) + ',setpts=PTS-STARTPTS,'
            : tr.tail ? 'trim=duration=' + durs[i].toFixed(3) + ','
            : tr.hold ? 'tpad=stop_mode=clone:stop_duration=' + tr.hold.toFixed(3) + ',' : '';
        return '[' + i + ':v]' + cut + 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2,fps=60,format=yuv420p,setsar=1[v' + i + ']';
    }).join(';');
    let prev = 'v0', t = durs[0];
    for (let i = 1; i < files.length; i++) {
        const out = i === files.length - 1 ? 'vx' : 'x' + i;
        // Into a scene that starts by clearing, a dip through black reads as
        // the clear (Gabriel 2026-10-19); everywhere else a plain crossfade.
        const into = path.basename(files[i], '.mp4');
        const how = DIP_INTO.has(into) ? 'fadeblack' : 'fade';
        filter += ';[' + prev + '][v' + i + ']xfade=transition=' + how + ':duration=' + XF + ':offset=' + (t - XF).toFixed(3) + '[' + out + ']';
        t += durs[i] - XF;
        prev = out;
    }
    if (files.length === 1) filter += ';[v0]null[vx]';
    // Fade in from black at the start and out at the end.
    filter += ';[vx]fade=t=in:st=0:d=0.5,fade=t=out:st=' + Math.max(0, t - 0.8).toFixed(3) + ':d=0.8[vout]';
    // The music from its first note, faded out under the end card.
    if (music) filter += ';[' + files.length + ':a]atrim=0:' + t.toFixed(3) + ',afade=t=out:st=' + Math.max(0, t - 3).toFixed(3) + ':d=3[aout]';
    const dest = path.join(OUT, 'swirl-together-draft.mp4');
    args.push('-filter_complex', filter, '-map', '[vout]');
    if (music) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '256k');
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
        '-pix_fmt', 'yuv420p', '-r', '60', '-movflags', '+faststart', dest);
    log('assembling', files.length, 'clips,', t.toFixed(1) + ' s');
    await run(FFMPEG, args);
    log('wrote', dest);
    return dest;
}

// ── Multi-artist scenes: a room on the local relay ──────────────────
// The recorder starts a room and each artist (its own headless Chrome and
// profile, so its own device id and name) joins it, before any scene
// freezes a clock. Then per scene, per frame: every artist moves its pen
// and steps one frame (its dabs flush to the relay), a short wait for the
// relay, then the recorder steps and captures. Date.now is synced across
// the pages at the start of each scene (see syncClock in the scenes file).
// The painters' names are Gabriel's (2026-10-18), set the way the desktop
// app sets a Steam name. The recorder is Gabe; each artist Chrome is one of
// these, and a scene names which of them paint in it (artists[].name).
const REC_NAME = 'Gabe', ARTIST_NAMES = ['Vivi', 'Sarah', 'Gary', 'Hex'];
async function openRoom(rec, artists) {
    await rec.page.eval("window.SWIRL_STEAM_NAME = " + JSON.stringify(REC_NAME) + "; createRoom(); 1");
    let code = null;
    for (let i = 0; i < 80 && !code; i++) {
        code = await rec.page.eval("(typeof isMultiplayerEnabled !== 'undefined' && isMultiplayerEnabled && clientId && currentRoom) || null").catch(() => null);
        if (!code) await sleep(250);
    }
    if (!code) throw new Error('recorder never got a room');
    for (let j = 0; j < artists.length; j++) {
        await artists[j].page.eval("window.SWIRL_STEAM_NAME = " + JSON.stringify(ARTIST_NAMES[j]) + "; joinRoom(" + JSON.stringify(code) + "); 1");
    }
    await sleep(3000);                                   // joins, names, welcome onto the room's settings
    const names = [];
    for (const a of artists) names.push(await a.page.eval('shortName(clientId)'));
    await rec.page.eval('(function(n){ var N = window.__trailer.names; N.length = 0; n.forEach(function(x){ N.push(x); }); return N.length; })(' + JSON.stringify(names) + ')');
    log('artists', names.join(', '));
    log('room', code, 'with', artists.length, 'artists');
    return code;
}
async function recordTogether(rec, artists, key, who) {
    const k = JSON.stringify(key);
    const n = who.length;
    const crew = who.map((name) => artists[ARTIST_NAMES.indexOf(name)]);
    if (crew.some((a) => !a)) throw new Error(key + ': no artist page for one of ' + who.join(', '));
    await rec.page.eval('window.__trailer.recPrep(' + k + ')', { timeoutMs: 120000 });
    for (let j = 0; j < n; j++) await crew[j].page.eval('window.__trailer.artistPrep(' + k + ',' + j + ')', { timeoutMs: 60000 });
    if (process.env.MP_DEBUG) {
        await Promise.all([rec].concat(crew).map((p) => p.page.eval('window.__trailer.scenes[' + k + '].secs = 2; 1')));
        await rec.page.eval("(function(){ window.__dbgGot = []; var ws = partySocket; var prev = ws.onmessage; ws.addEventListener('message', function(ev){ try { var m = JSON.parse(ev.data); if (m.type === 'splat' && window.__dbgGot.length < 6) window.__dbgGot.push({c: m.data.color, b: m.data.base, from: (m.from||m.sender||'').toString().slice(-4)}); } catch(_){} }); return 1; })()");
    }
    const epoch = Date.now();
    await Promise.all([rec].concat(crew).map((p) => p.page.eval('window.__trailer.syncClock(' + epoch + ')')));
    const N = await rec.page.eval('window.__trailer.recBegin(' + k + ')');
    for (let i = 0; i < N; i++) {
        await Promise.all(crew.map((a, j) => a.page.eval('window.__trailer.artistFrame(' + k + ',' + j + ',' + i + ',' + N + ')')));
        await sleep(6);                                  // the relay hop, on localhost
        await rec.page.eval('window.__trailer.recFrame(' + k + ',' + i + ')');
    }
    const r = await rec.page.eval('window.__trailer.recEnd(' + k + ')', { timeoutMs: 120000 });
    if (process.env.MP_DEBUG) {
        for (const a of crew) log(a.name, JSON.stringify(await a.page.eval("({pick: document.getElementById('colorPicker').value, last: window.__mpLastDabColor, base: window.__mpBaseColor, arm0: JSON.stringify((window.multiArmColors||[])[0]), gate: window.config.COLOR_GATE})")));
        log('rec', JSON.stringify(await rec.page.eval("({arm0: JSON.stringify((window.multiArmColors||[])[0]), pick: document.getElementById('colorPicker').value})")));
    }
    await Promise.all(crew.map((a) => a.page.eval('window.__trailer.artistDone()')));
    return r;
}

(async () => {
    const mode = process.argv[2] || 'probe';
    const keysArg = process.argv.slice(3);
    let srv = null, app = null, relay = null;
    const artists = [];
    try {
        if (mode === 'assemble') {
            const order = keysArg.length ? keysArg : JSON.parse(fs.readFileSync(path.join(CLIPS, 'order.json'), 'utf8'));
            await assemble(order);
            return;
        }
        srv = await serve();
        // Every page is pointed at the local relay; it only connects when a
        // room is started, and the relay only runs when a scene needs one.
        app = await boot(srv, { relay: '127.0.0.1:' + RELAY_PORT });
        if (mode === 'probe') {
            const out = await app.page.eval('window.__trailer.probe()', { timeoutMs: 120000 });
            console.log(JSON.stringify(out, null, 1));
            const shot = await app.page.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(OUT, 'probe.png'), Buffer.from(shot.data, 'base64'));
            log('shot', path.join(OUT, 'probe.png'));
        } else if (mode === 'splash') {
            // The app's own boot screen, put back and screenshotted at video
            // size, plus where its title sits (the title and end scenes lay
            // the canvas title exactly under it).
            await app.page.eval('window.__trailer.showSplash()');
            await sleep(1500);                           // the entrance animations settle
            const title = await app.page.eval('window.__trailer.splashTitle()');
            const shot = await app.page.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(OUT, 'splash.png'), Buffer.from(shot.data, 'base64'));
            fs.writeFileSync(path.join(OUT, 'splash.json'), JSON.stringify({ title: title }, null, 1));
            await app.page.eval('window.__trailer.hideSplash()');
            log('splash', JSON.stringify(title));
        } else if (mode === 'eval') {
            // node scripts/bake-trailer.js eval "<page expression>"   (for tuning)
            const out = await app.page.eval(keysArg.join(' '), { timeoutMs: 120000 });
            console.log(JSON.stringify(out, null, 1));
        } else if (mode === 'clips' || mode === 'all' || mode === 'stills') {
            // stills: the same takes, no captions or splash, lossless PNGs
            // at a few phases each, into notes/trailer-draft/stills/.
            // CAPTIONS=1 keeps each scene's caption (still-cap-<key>-NN.png).
            if (mode === 'stills') await app.page.eval('window.__trailer.stillMode(true, null, ' + (process.env.CAPTIONS === '1') + ')');
            const all = await app.page.eval('window.__trailer.order');
            const keys = keysArg.length ? keysArg : all;
            const crewOf = {};
            for (const key of keys) crewOf[key] = await app.page.eval('((window.__trailer.scenes[' + JSON.stringify(key) + '] || {}).artists || []).map(function (a) { return a.name; })');
            // Every name any scene uses gets its page (pages go in ARTIST_NAMES order).
            const most = Math.max(0, ...Object.values(crewOf).flat().map((nm) => ARTIST_NAMES.indexOf(nm) + 1));
            if (most > 0) {
                relay = await startRelay();
                for (let j = 0; j < most; j++) {
                    artists.push(await boot(srv, { role: 'artist', port: CDP_PORT + 1 + j, w: 1280, h: 720, relay: relay.host, name: 'artist' + (j + 1) }));
                }
                await openRoom(app, artists);
            }
            for (const key of keys) {
                log('scene', key, crewOf[key].length ? '(' + crewOf[key].join(', ') + ')' : '');
                const r = crewOf[key].length
                    ? await recordTogether(app, artists, key, crewOf[key])
                    : await app.page.eval('window.__trailer.record(' + JSON.stringify(key) + ')', { timeoutMs: 900000 });
                log('done', key, JSON.stringify(r));
            }
            const splits = await app.page.eval('window.__trailer.splits || {}');
            const cut = await app.page.eval('window.__trailer.cut || window.__trailer.order');
            for (const a of artists.splice(0)) await a.close();
            await app.close(); app = null;
            if (relay) { relay.close(); relay = null; }
            if (mode === 'stills') return;
            for (const name of Object.keys(splits)) await split(name, splits[name][0], splits[name][1]);
            if (!keysArg.length) fs.writeFileSync(path.join(CLIPS, 'order.json'), JSON.stringify(cut));
            if (mode === 'all') await assemble(cut);
        } else {
            throw new Error('unknown mode ' + mode);
        }
    } catch (e) {
        log('ERROR', e && e.stack || e);
        process.exitCode = 1;
    } finally {
        for (const a of artists) await a.close();
        if (app) await app.close();
        if (relay) relay.close();
        if (srv) srv.close();
        process.exit(process.exitCode || 0);
    }
})();
