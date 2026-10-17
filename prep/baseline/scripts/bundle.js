// prep/baseline/scripts/bundle.js — F6 baseline: bundle sizes, the existing UI
// suites run once each, and the button-system audit (js/38-button-audit.js),
// for the Walnut & Copper prep (prep/briefs/F-baselines.md, F6). This script
// decides nothing and changes nothing outside prep/.
//
//   node prep/baseline/scripts/bundle.js              capture all three parts
//   node prep/baseline/scripts/bundle.js --sizes      only the sizes      -> prep/baseline/bundle/sizes.{json,md}
//   node prep/baseline/scripts/bundle.js --suites     only the suites     -> prep/baseline/suites/<suite>.log, suites.{json,md}
//   node prep/baseline/scripts/bundle.js --audit      only the button audit -> prep/baseline/bundle/button-audit.{json,md}
//   node prep/baseline/scripts/bundle.js --suite <name> [--suite <name>]   a subset of the suites (with --suites)
//   node prep/baseline/scripts/bundle.js --check      re-run the suites and the button audit into
//                                                     prep/work/bundle-check/ and compare with the baseline:
//                                                     exit 1 when a suite's exit code or PASS/FAIL count moved,
//                                                     or when the button audit's totals, rules or inline
//                                                     offenders moved. Sizes are recomputed and their deltas
//                                                     printed for information only (the README says "reported,
//                                                     not gated"). --check --suites / --check --audit narrow it.
//
// Sizes are read from disk (byte count + gzip level 9), no app boot. The suites
// are the repo's own scripts, spawned one after another with this process's
// node, each booting its own headless Chrome and closing it; their stdout and
// stderr go to the per-suite log verbatim under a header. A suite whose
// outcome is not the expected one (exit 0 when capturing, the baseline's
// counts when checking) is run a second time and the second run stands, with
// the first attempt kept as <name>.attempt-1.log (see the retry policy by
// captureSuites). The button audit
// boots the web build once through the repo driver
// (scripts/test/radial-menu/driver.js: own static server, scratch profile with
// PhotoSafe / the startup fork / the first-run hint answered), calls
// window.auditButtons() at boot, with every sidebar section open (trusted
// Shift-clicks on the titles) and with each lazily built popup open (radial
// menu, colour picker, presets, arm-tip menu), and closes Chrome in a finally.
//
// Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only
// state changes are trusted clicks on real controls inside the scratch profile,
// which the driver deletes on close. Never attaches to port 9333.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { spawn, execSync } = require('child_process');
const { boot, sleep } = require('../../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../../..');
const BASE_BUNDLE = path.join(ROOT, 'prep', 'baseline', 'bundle');
const BASE_SUITES = path.join(ROOT, 'prep', 'baseline', 'suites');
const CHECK_ROOT = path.join(ROOT, 'prep', 'work', 'bundle-check');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const only = { sizes: argv.includes('--sizes'), suites: argv.includes('--suites'), audit: argv.includes('--audit') };
const anyOnly = only.sizes || only.suites || only.audit;
const SUITE_FILTER = []; argv.forEach((a, i) => { if (a === '--suite' && argv[i + 1]) SUITE_FILTER.push(argv[i + 1]); });
const OUT_BUNDLE = CHECK ? path.join(CHECK_ROOT, 'bundle') : BASE_BUNDLE;
const OUT_SUITES = CHECK ? path.join(CHECK_ROOT, 'suites') : BASE_SUITES;

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
const log = (...a) => console.log(...a);
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const esc = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const kb = n => (n / 1024).toFixed(1);
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJSON(p, obj) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 1) + '\n'); }
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// ─── environment facts ───────────────────────────────────────────────────────
function headCommit() { try { return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return null; } }
function chromeVersionFromDisk() {
    // Chrome keeps its binaries in a folder named after the version, beside chrome.exe.
    try {
        const dir = path.dirname(CHROME);
        const v = fs.readdirSync(dir).filter(n => /^\d+\.\d+\.\d+\.\d+$/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return v.length ? v[v.length - 1] : null;
    } catch (_) { return null; }
}
function baseEnv() {
    return { date: new Date().toISOString(), headCommit: headCommit(), node: process.version, platform: process.platform + ' ' + os.release(), chromeOnDisk: chromeVersionFromDisk(), chromePath: CHROME };
}

// ─── part 1: sizes ───────────────────────────────────────────────────────────
function fileInfo(abs) {
    const buf = fs.readFileSync(abs);
    return { path: rel(abs), bytes: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
}
function walk(dir, out) {
    out = out || [];
    if (!fs.existsSync(dir)) return out;
    for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, n.name);
        if (n.isDirectory()) walk(p, out); else if (n.isFile()) out.push(p);
    }
    return out.sort((a, b) => rel(a).localeCompare(rel(b)));
}
function sumBy(list, key) { return list.reduce((a, x) => a + (x[key] || 0), 0); }

function captureSizes() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');

    // What index.html loads: stylesheet links in order, script tags in order,
    // and the quoted 'js/…' strings of the inline chain loader (the splash's
    // sequential loader at index.html ~1744). HTML comments are stripped first,
    // so a parked file named only in a comment (js/44-recipes.js) does not count.
    const cssLinks = []; let m; const reLink = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g;
    while ((m = reLink.exec(htmlNoComments))) cssLinks.push(m[1]);
    const scriptTags = []; const reScript = /<script([^>]*)src="([^"]+)"/g;
    while ((m = reScript.exec(htmlNoComments))) scriptTags.push({ src: m[2], module: /type="module"/.test(m[1]) });
    const chain = []; const reChain = /['"](js\/[\w.-]+\.js)['"]/g;
    const inlineScripts = htmlNoComments.replace(/<script[^>]*src="[^"]+"[^>]*>[\s\S]*?<\/script>/g, '');
    while ((m = reChain.exec(inlineScripts))) if (!chain.includes(m[1])) chain.push(m[1]);

    // CSS
    const cssFiles = walk(path.join(ROOT, 'css')).filter(p => p.endsWith('.css')).map(fileInfo).map(f => {
        const i = cssLinks.indexOf(f.path); return Object.assign(f, { loaded: i >= 0, loadOrder: i >= 0 ? i + 1 : null });
    });
    const cssNotInDir = cssLinks.filter(h => !cssFiles.some(f => f.path === h));
    if (cssNotInDir.length) problem('index.html links stylesheets that are not under css/: ' + cssNotInDir.join(', '));

    // index.html + its inline <style> blocks
    const styleBlocks = []; const reStyle = /<style[^>]*>([\s\S]*?)<\/style>/g;
    while ((m = reStyle.exec(html))) styleBlocks.push({ bytes: Buffer.byteLength(m[1]), line: html.slice(0, m.index).split('\n').length });
    const indexInfo = Object.assign(fileInfo(path.join(ROOT, 'index.html')), { inlineStyleBlocks: styleBlocks, inlineStyleBytes: sumBy(styleBlocks, 'bytes'), stylesheetLinks: cssLinks.length, scriptTags: scriptTags.length, chainScripts: chain.length });

    // JS (non-vendor = js/*.js at the top level; js/vendor/ is separate)
    const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js')).sort().map(n => path.join(ROOT, 'js', n)).map(fileInfo).map(f => {
        const ti = scriptTags.findIndex(s => s.src === f.path); const ci = chain.indexOf(f.path);
        let how = null, order = null;
        if (ti >= 0) { how = scriptTags[ti].module ? 'module tag' : 'script tag'; order = ti + 1; }
        else if (ci >= 0) { how = 'chain loader'; order = ci + 1; }
        return Object.assign(f, { loaded: !!how, loadedBy: how, loadOrder: order });
    });
    const loadedNotPresent = scriptTags.map(s => s.src).concat(chain).filter(s => /^js\/[^/]+\.js$/.test(s) && !jsFiles.some(f => f.path === s));
    if (loadedNotPresent.length) problem('index.html loads js files that do not exist: ' + loadedNotPresent.join(', '));
    const otherScriptSrcs = scriptTags.map(s => s.src).filter(s => !/^js\/[^/]+\.js$/.test(s));

    // Vendor
    const vendorFiles = walk(path.join(ROOT, 'js', 'vendor')).map(fileInfo);

    // Assets
    const assetFiles = walk(path.join(ROOT, 'assets')).map(p => { const st = fs.statSync(p); return { path: rel(p), bytes: st.size, ext: path.extname(p).toLowerCase().replace(/^\./, '') || '(none)', dir: rel(p).split('/').slice(0, 2).join('/') }; });
    const byType = {}; const byDir = {};
    assetFiles.forEach(f => {
        byType[f.ext] = byType[f.ext] || { count: 0, bytes: 0 }; byType[f.ext].count++; byType[f.ext].bytes += f.bytes;
        const d = f.dir.includes('/') && !f.dir.endsWith(path.basename(f.path)) ? f.dir : 'assets'; // top-level sub-folder or the root
        byDir[d] = byDir[d] || { count: 0, bytes: 0 }; byDir[d].count++; byDir[d].bytes += f.bytes;
    });
    const largest = assetFiles.slice().sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 15).map(f => ({ path: f.path, bytes: f.bytes }));

    // Fonts: files anywhere outside the ignored trees, plus @font-face /
    // Google Fonts references in the shipped CSS, HTML and JS, plus the
    // font-family declarations in use (the three families the theme adds will
    // land beside these).
    const SKIP = new Set(['node_modules', '.git', 'dist', 'public', '.partykit', 'notes', '.claude']);
    const fontFiles = [];
    (function walkFonts(dir) {
        for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
            if (SKIP.has(n.name)) continue;
            const p = path.join(dir, n.name);
            if (n.isDirectory()) walkFonts(p);
            else if (/\.(woff2?|ttf|otf|eot)$/i.test(n.name)) fontFiles.push({ path: rel(p), bytes: fs.statSync(p).size, shipped: /^(css|js|assets)\//.test(rel(p)) || !rel(p).includes('/') });
        }
    })(ROOT);
    fontFiles.sort((a, b) => a.path.localeCompare(b.path));
    const cssText = cssFiles.map(f => ({ path: f.path, text: fs.readFileSync(path.join(ROOT, f.path), 'utf8') }));
    const fontFace = []; const google = [];
    cssText.concat([{ path: 'index.html', text: html }]).concat(jsFiles.map(f => ({ path: f.path, text: fs.readFileSync(path.join(ROOT, f.path), 'utf8') }))).forEach(({ path: p, text }) => {
        const ff = (text.match(/@font-face/g) || []).length; if (ff) fontFace.push({ path: p, count: ff });
        const g = (text.match(/fonts\.(googleapis|gstatic)\.com/g) || []).length; if (g) google.push({ path: p, count: g });
    });
    const families = {}; const reFam = /font-family\s*:\s*([^;}]+)/g;
    cssText.concat([{ path: 'index.html', text: styleBlocks.length ? html : '' }]).forEach(({ text }) => { let mm; while ((mm = reFam.exec(text))) { const v = mm[1].trim().replace(/\s+/g, ' '); families[v] = (families[v] || 0) + 1; } });
    const fontTokens = {}; const tok = fs.readFileSync(path.join(ROOT, 'css', '00-tokens.css'), 'utf8'); const reTok = /(--font-[\w-]+)\s*:\s*([^;]+);/g;
    while ((m = reTok.exec(tok))) fontTokens[m[1]] = m[2].trim();

    // Electron shell files at the root (not the renderer; listed so the
    // desktop build's own weight is known).
    const shell = ['electron-main.js', 'electron-pen-cursor.js'].filter(n => fs.existsSync(path.join(ROOT, n))).map(n => fileInfo(path.join(ROOT, n)));

    const loadedCss = cssFiles.filter(f => f.loaded), loadedJs = jsFiles.filter(f => f.loaded);
    const totals = {
        cssAll: { files: cssFiles.length, bytes: sumBy(cssFiles, 'bytes'), gzip: sumBy(cssFiles, 'gzip') },
        cssLoaded: { files: loadedCss.length, bytes: sumBy(loadedCss, 'bytes'), gzip: sumBy(loadedCss, 'gzip') },
        indexHtml: { files: 1, bytes: indexInfo.bytes, gzip: indexInfo.gzip },
        jsAll: { files: jsFiles.length, bytes: sumBy(jsFiles, 'bytes'), gzip: sumBy(jsFiles, 'gzip') },
        jsLoaded: { files: loadedJs.length, bytes: sumBy(loadedJs, 'bytes'), gzip: sumBy(loadedJs, 'gzip') },
        jsNotLoaded: { files: jsFiles.length - loadedJs.length, bytes: sumBy(jsFiles.filter(f => !f.loaded), 'bytes') },
        vendor: { files: vendorFiles.length, bytes: sumBy(vendorFiles, 'bytes'), gzip: sumBy(vendorFiles, 'gzip') },
        assets: { files: assetFiles.length, bytes: sumBy(assetFiles, 'bytes') },
        fontsShipped: { files: fontFiles.filter(f => f.shipped).length, bytes: sumBy(fontFiles.filter(f => f.shipped), 'bytes') },
        electronShell: { files: shell.length, bytes: sumBy(shell, 'bytes') }
    };
    totals.rendererLoaded = { files: totals.cssLoaded.files + 1 + totals.jsLoaded.files, bytes: totals.cssLoaded.bytes + indexInfo.bytes + totals.jsLoaded.bytes, gzip: totals.cssLoaded.gzip + indexInfo.gzip + totals.jsLoaded.gzip,
        note: 'index.html + the stylesheets it links + the js/*.js it loads (tags and chain loader); js/vendor/ and assets/ are fetched on demand and listed separately' };

    return { env: baseEnv(), totals, css: cssFiles, indexHtml: indexInfo, js: jsFiles, otherScriptSrcs, vendor: vendorFiles, assets: { byType, byDir, largest, files: assetFiles.map(f => ({ path: f.path, bytes: f.bytes })) },
        fonts: { files: fontFiles, fontFaceDeclarations: fontFace, googleFontsReferences: google, familiesDeclared: families, tokens: fontTokens }, electronShell: shell };
}

function sizesMarkdown(s) {
    const L = [];
    L.push('# Bundle sizes (F6 baseline)', '');
    L.push('Captured ' + s.env.date + ' at HEAD `' + (s.env.headCommit || '?').slice(0, 7) + '` with Node ' + s.env.node + ' (read from disk, no app boot). Bytes are file sizes; gzip is `zlib` level 9, as a transfer-size proxy. Written by `prep/baseline/scripts/bundle.js --sizes`. Reported, not gated.', '');
    L.push('## Totals', '', '| Group | Files | Bytes | KB | gzip KB | Note |', '|---|---:|---:|---:|---:|---|');
    const T = s.totals;
    const row = (name, t, note) => L.push('| ' + name + ' | ' + t.files + ' | ' + t.bytes + ' | ' + kb(t.bytes) + ' | ' + (t.gzip != null ? kb(t.gzip) : '') + ' | ' + (note || '') + ' |');
    row('Renderer as loaded', T.rendererLoaded, T.rendererLoaded.note);
    row('`index.html`', T.indexHtml, s.indexHtml.inlineStyleBlocks.length + ' inline `<style>` block(s), ' + s.indexHtml.inlineStyleBytes + ' bytes');
    row('CSS linked from index.html', T.cssLoaded, 'load order in the table below');
    row('CSS, every file under `css/`', T.cssAll, T.cssAll.files === T.cssLoaded.files ? 'all linked' : (T.cssAll.files - T.cssLoaded.files) + ' not linked');
    row('JS loaded (`js/*.js`, non-vendor)', T.jsLoaded, 'script tags + the inline chain loader');
    row('JS, every `js/*.js`', T.jsAll, T.jsNotLoaded.files + ' file(s) not loaded by index.html: ' + s.js.filter(f => !f.loaded).map(f => '`' + f.path + '`').join(', '));
    row('`js/vendor/`', T.vendor, 'Transformers.js + ONNX runtime, fetched on demand for Magic Mask');
    row('`assets/`', T.assets, Object.keys(s.assets.byType).sort().map(k => s.assets.byType[k].count + ' ' + k).join(', '));
    row('Fonts shipped', T.fontsShipped, T.fontsShipped.files === 0 ? 'none: no font files under css/, js/, assets/ or the root; no @font-face' : '');
    row('Electron shell (root)', T.electronShell, s.electronShell.map(f => '`' + f.path + '`').join(', ') + ' (desktop build only)');
    L.push('', '## Stylesheets', '', '| # | File | Bytes | KB | gzip KB |', '|---:|---|---:|---:|---:|');
    s.css.slice().sort((a, b) => (a.loadOrder || 99) - (b.loadOrder || 99) || a.path.localeCompare(b.path)).forEach(f => L.push('| ' + (f.loadOrder || 'not linked') + ' | `' + f.path + '` | ' + f.bytes + ' | ' + kb(f.bytes) + ' | ' + kb(f.gzip) + ' |'));
    L.push('', 'Inline `<style>` blocks in `index.html`: ' + (s.indexHtml.inlineStyleBlocks.map(b => 'line ' + b.line + ' (' + b.bytes + ' bytes)').join(', ') || 'none') + '. Three more stylesheets are injected from JS at runtime (`js/00a-boot.js` boot cursor, `js/32-file-drop.js` drop outline, `js/16-sam-integration.js` SAM keyframes; see `prep/README.md`) and are counted inside those files.', '');
    L.push('## JavaScript (`js/*.js`, non-vendor)', '', '| Load | File | Bytes | KB | gzip KB |', '|---|---|---:|---:|---:|');
    s.js.forEach(f => L.push('| ' + (f.loaded ? f.loadedBy + ' #' + f.loadOrder : 'not loaded') + ' | `' + f.path + '` | ' + f.bytes + ' | ' + kb(f.bytes) + ' | ' + kb(f.gzip) + ' |'));
    if (s.otherScriptSrcs.length) L.push('', 'Script tags outside `js/*.js`: ' + s.otherScriptSrcs.map(x => '`' + x + '`').join(', '));
    L.push('', '## `js/vendor/`', '', '| File | Bytes | KB | gzip KB |', '|---|---:|---:|---:|');
    s.vendor.forEach(f => L.push('| `' + f.path + '` | ' + f.bytes + ' | ' + kb(f.bytes) + ' | ' + kb(f.gzip) + ' |'));
    L.push('', '## `assets/`', '', '### By type', '', '| Type | Files | Bytes | KB |', '|---|---:|---:|---:|');
    Object.keys(s.assets.byType).sort().forEach(k => L.push('| ' + k + ' | ' + s.assets.byType[k].count + ' | ' + s.assets.byType[k].bytes + ' | ' + kb(s.assets.byType[k].bytes) + ' |'));
    L.push('', '### By folder', '', '| Folder | Files | Bytes | KB |', '|---|---:|---:|---:|');
    Object.keys(s.assets.byDir).sort().forEach(k => L.push('| `' + k + '` | ' + s.assets.byDir[k].count + ' | ' + s.assets.byDir[k].bytes + ' | ' + kb(s.assets.byDir[k].bytes) + ' |'));
    L.push('', '### Largest 15', '', '| File | Bytes | KB |', '|---|---:|---:|');
    s.assets.largest.forEach(f => L.push('| `' + f.path + '` | ' + f.bytes + ' | ' + kb(f.bytes) + ' |'));
    L.push('', 'The full per-file list is in `sizes.json` (`assets.files`).', '');
    L.push('## Fonts', '');
    L.push('- Font files (`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`) anywhere in the repo outside `node_modules/`, `.git/`, `dist/`, `public/`, `notes/`: ' + (s.fonts.files.length ? s.fonts.files.map(f => '`' + f.path + '` (' + f.bytes + ' bytes' + (f.shipped ? ', shipped' : ', not shipped') + ')').join(', ') : '**none**') + '.');
    L.push('- `@font-face` declarations in `css/`, `index.html`, `js/*.js`: ' + (s.fonts.fontFaceDeclarations.length ? s.fonts.fontFaceDeclarations.map(f => '`' + f.path + '` ×' + f.count).join(', ') : '**none**') + '.');
    L.push('- Google Fonts references (`fonts.googleapis.com` / `fonts.gstatic.com`): ' + (s.fonts.googleFontsReferences.length ? s.fonts.googleFontsReferences.map(f => '`' + f.path + '` ×' + f.count).join(', ') : '**none**') + '.');
    L.push('- Font tokens in `css/00-tokens.css`: ' + (Object.keys(s.fonts.tokens).length ? Object.keys(s.fonts.tokens).map(k => '`' + k + ': ' + s.fonts.tokens[k] + '`').join(', ') : 'none') + '.');
    L.push('', '| `font-family` declared (css/ + inline) | Count |', '|---|---:|');
    Object.keys(s.fonts.familiesDeclared).sort((a, b) => s.fonts.familiesDeclared[b] - s.fonts.familiesDeclared[a] || a.localeCompare(b)).forEach(k => L.push('| `' + esc(k) + '` | ' + s.fonts.familiesDeclared[k] + ' |'));
    L.push('', 'So today the UI renders in system fonts only (the `-apple-system … Segoe UI` stack behind `--font-ui`, monospace stacks for readouts). CSS prep step 6 adds Michroma, Libre Franklin and Share Tech Mono as local woff2 files; they will add to the renderer total by design.', '');
    if (problems.length) { L.push('## Problems', ''); problems.forEach(p => L.push('- ' + p)); L.push(''); }
    return L.join('\n');
}

// ─── part 2: the existing UI suites ──────────────────────────────────────────
// The brief names run.js for stroke-lock and pen-window; neither exists.
// stroke-lock/ring.js is that folder's one check script and uses the shared
// driver; pen-window's headless entry is web-headless.js, which expects the
// app served at APP_URL (default http://127.0.0.1:3000/), so this script
// serves the repo itself for that one run. The other pen-window scripts need
// Electron, a second screen or the real mouse and are not suites for a
// headless baseline.
const SUITES = [
    { name: 'radial-menu', script: 'scripts/test/radial-menu/run.js', note: 'run.js spawns wheel.js, settings.js, regressions.js in turn (one Chrome each)' },
    { name: 'focus-keys', script: 'scripts/test/focus-keys/run.js' },
    { name: 'skip-menu', script: 'scripts/test/skip-menu/run.js' },
    { name: 'bar-keys', script: 'scripts/test/bar-keys/run.js' },
    { name: 'dialog-focus', script: 'scripts/test/dialog-focus/run.js' },
    { name: 'slider-keys', script: 'scripts/test/slider-keys/run.js' },
    { name: 'popup-focus', script: 'scripts/test/popup-focus/run.js' },
    { name: 'stroke-lock', script: 'scripts/test/stroke-lock/ring.js', note: 'no run.js in this folder; ring.js is its one check script (shared driver)' },
    { name: 'pen-window', script: 'scripts/test/pen-window/web-headless.js', serve: true, note: 'no run.js in this folder; web-headless.js is the headless entry, needs APP_URL (served by bundle.js) and writes three PNGs to PENWIN_OUT (set to the OS temp dir)' },
    { name: 'look-links', script: 'scripts/test/look-links/run.js', note: 'run without MP_HOST (the live-room section is skipped by design)' }
];
const SUITE_TIMEOUT_MS = 15 * 60 * 1000;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.cur': 'image/x-icon' };
// The driver's static server is not exported, so this is the same thing in
// twelve lines (repo root, no-store, no path escape).
function serveRepo() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end(); return; }
            fs.readFile(f, (err, buf) => {
                if (err) { res.writeHead(404); res.end('nf'); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                res.end(buf);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => new Promise(r => srv.close(() => r())) }));
    });
}

function killTree(pid) {
    try { if (process.platform === 'win32') execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch (_) {}
}

// Run one suite with this node; stdout + stderr captured; a hung suite is
// killed with its whole process tree (its Chrome included) after the timeout.
function runSuite(suite, env) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const child = spawn(process.execPath, [path.join(ROOT, suite.script)], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '', timedOut = false;
        child.stdout.on('data', c => { out += c; });
        child.stderr.on('data', c => { err += c; });
        const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, SUITE_TIMEOUT_MS);
        child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut, stdout: out, stderr: err, durationMs: Date.now() - t0 }); });
        child.on('error', e => { clearTimeout(timer); resolve({ code: null, signal: null, timedOut: false, stdout: out, stderr: err + '\nspawn error: ' + e.message, durationMs: Date.now() - t0 }); });
    });
}

// PASS/FAIL lines: "PASS name", "FAIL name", or look-links' "  12.3s PASS name".
// FAIL\b leaves "FAILED  x passed, y failed" (look-links' closing line) alone.
const RE_VERDICT = /^\s*(?:\d+(?:\.\d+)?s\s+)?(PASS|FAIL)\b/;
function parseVerdicts(text) {
    let pass = 0, fail = 0; const failLines = []; const summaries = [];
    text.split(/\r?\n/).forEach(line => {
        const m = RE_VERDICT.exec(line);
        if (m) { if (m[1] === 'PASS') pass++; else { fail++; failLines.push(line.trim().slice(0, 200)); } }
        if (/^\s*\d+\/\d+ passed\s*$/.test(line) || /^\s*(?:\d+(?:\.\d+)?s\s+)?(OK|FAILED)\s+\d+ passed, \d+ failed/.test(line) || /^\{"ok":/.test(line.trim())) summaries.push(line.trim().slice(0, 300));
    });
    return { pass, fail, failLines, summaries };
}

// One attempt of one suite: run it, write its log (`<name>.log`, or
// `<name>.attempt-1.log` for a first attempt that is being retried), return
// the record.
async function attemptSuite(suite, outDir, env0, logName) {
    const env = Object.assign({}, process.env);
    delete env.MP_HOST; delete env.SHOT_DIR; delete env.APP_URL; delete env.PENWIN_OUT;
    let server = null;
    if (suite.serve) {
        server = await serveRepo();
        env.APP_URL = 'http://127.0.0.1:' + server.port + '/';
        env.PENWIN_OUT = path.join(os.tmpdir(), 'fluid-f6-penwin'); mkdirp(env.PENWIN_OUT);
    }
    log('== ' + suite.name + ' : node ' + suite.script + (server ? '  (APP_URL=' + env.APP_URL + ')' : '') + (logName !== suite.name + '.log' ? '  [' + logName + ']' : ''));
    const started = new Date();
    let r;
    try { r = await runSuite(suite, env); }
    finally { if (server) await server.close(); }
    const v = parseVerdicts(r.stdout + '\n' + r.stderr);
    const rec = { name: suite.name, script: suite.script, command: 'node ' + suite.script, note: suite.note || '', started: started.toISOString(), durationMs: r.durationMs,
        exitCode: r.code, signal: r.signal, timedOut: r.timedOut, pass: v.pass, fail: v.fail, summaryLines: v.summaries, failLines: v.failLines, log: rel(path.join(outDir, logName)) };
    if (server) rec.env = { APP_URL: '(ephemeral port on 127.0.0.1, served by bundle.js)', PENWIN_OUT: env.PENWIN_OUT };
    if (suite.name === 'look-links') rec.env = { MP_HOST: '(unset)' };
    const header = ['# ' + suite.name + ' — ' + rec.command, '# started ' + rec.started + ', duration ' + (r.durationMs / 1000).toFixed(1) + ' s, exit code ' + r.code + (r.signal ? ' signal ' + r.signal : '') + (r.timedOut ? ' TIMED OUT' : ''),
        '# PASS ' + v.pass + ' / FAIL ' + v.fail + (v.summaries.length ? '  summary: ' + v.summaries.join(' ; ') : ''),
        '# HEAD ' + (env0.headCommit || '?') + ', node ' + env0.node + ', Chrome ' + (env0.chromeOnDisk || '?') + ' (from disk)' + (rec.note ? '\n# note: ' + rec.note : ''), '# ---- stdout ----', ''];
    fs.writeFileSync(path.join(outDir, logName), header.join('\n') + r.stdout + (r.stderr ? '\n# ---- stderr ----\n' + r.stderr : '') + '\n');
    log('   exit ' + r.code + ', PASS ' + v.pass + ' / FAIL ' + v.fail + ', ' + (r.durationMs / 1000).toFixed(1) + ' s' + (r.timedOut ? ' (TIMED OUT)' : ''));
    return rec;
}
const sameOutcome = (a, b) => !!a && !!b && a.exitCode === b.exitCode && a.pass === b.pass && a.fail === b.fail;

// Retry policy (the one piece of nondeterminism this capture met, and how it
// is pinned): popup-focus failed 4 of its checks on the first baseline run and
// passed all 17 on the next, with no change in between (its P4 clicks the
// Presets trigger and reads the panel 250 ms later). So a suite whose
// outcome is not the expected one is run a second time, in the same way, and
// the second run stands; the first attempt's log is kept as
// `<name>.attempt-1.log` and its counts in the record. "Expected" is exit 0
// when capturing (a real failure at HEAD fails twice and is recorded as such)
// and the baseline's own counts when checking (a real regression fails twice;
// a flake passes on the retry and does not trip the gate).
async function captureSuites(outDir, baseline) {
    mkdirp(outDir);
    const env0 = baseEnv();
    const list = SUITES.filter(s => !SUITE_FILTER.length || SUITE_FILTER.includes(s.name));
    const results = [];
    for (const suite of list) {
        if (!fs.existsSync(path.join(ROOT, suite.script))) { problem('suite ' + suite.name + ': ' + suite.script + ' does not exist'); results.push({ name: suite.name, script: suite.script, note: suite.note || '', missing: true }); continue; }
        const expected = baseline ? (baseline.suites || []).find(s => s.name === suite.name) : { exitCode: 0 };
        let rec = await attemptSuite(suite, outDir, env0, suite.name + '.log');
        const asExpected = expected ? (baseline ? sameOutcome(rec, expected) : rec.exitCode === 0) : true;
        if (!asExpected) {
            // Keep the first attempt under its own name and run again.
            fs.renameSync(path.join(outDir, suite.name + '.log'), path.join(outDir, suite.name + '.attempt-1.log'));
            const first = Object.assign({}, rec, { log: rel(path.join(outDir, suite.name + '.attempt-1.log')) });
            log('   not the expected outcome (' + (baseline ? 'baseline exit ' + expected.exitCode + ', ' + expected.pass + '/' + expected.fail : 'exit 0') + '): running it once more');
            rec = await attemptSuite(suite, outDir, env0, suite.name + '.log');
            rec.retried = true;
            rec.attempt1 = { exitCode: first.exitCode, pass: first.pass, fail: first.fail, failLines: first.failLines, log: first.log, durationMs: first.durationMs };
            rec.flaky = !sameOutcome(first, rec);
            if (rec.flaky) problem('suite ' + suite.name + ' is flaky: attempt 1 exit ' + first.exitCode + ' (' + first.pass + '/' + first.fail + '), attempt 2 exit ' + rec.exitCode + ' (' + rec.pass + '/' + rec.fail + '); the second run stands, the first is ' + first.log);
        } else if (fs.existsSync(path.join(outDir, suite.name + '.attempt-1.log'))) {
            fs.rmSync(path.join(outDir, suite.name + '.attempt-1.log'));   // a stale retry log from an earlier run
        }
        if (rec.exitCode !== 0) problem('suite ' + suite.name + ' exited ' + rec.exitCode + (rec.retried ? ' twice' : '') + (rec.failLines.length ? ': ' + rec.failLines.slice(0, 3).join(' | ') : ''));
        results.push(rec);
    }
    let out = { env: env0, oneChromeAtATime: 'suites run sequentially; each boots and closes its own headless Chrome', timeoutMs: SUITE_TIMEOUT_MS,
        retryPolicy: 'a suite whose outcome is not the expected one (exit 0 when capturing; the baseline counts when checking) is run a second time and the second run stands; the first attempt is kept as <name>.attempt-1.log and in attempt1', suites: results };
    // A partial capture (--suite …) merges into the existing record instead of replacing it.
    const existing = path.join(outDir, 'suites.json');
    if (SUITE_FILTER.length && fs.existsSync(existing)) {
        const prev = readJSON(existing);
        prev.suites = SUITES.map(s => results.find(r => r.name === s.name) || (prev.suites || []).find(r => r.name === s.name)).filter(Boolean);
        prev.partialUpdates = (prev.partialUpdates || []).concat([{ date: env0.date, headCommit: env0.headCommit, suites: results.map(r => r.name) }]);
        prev.retryPolicy = out.retryPolicy;
        out = prev;
    }
    return out;
}

function suitesMarkdown(S) {
    const L = [];
    L.push('# UI suites run once (F6 baseline)', '');
    L.push('Captured ' + S.env.date + ' at HEAD `' + (S.env.headCommit || '?').slice(0, 7) + '`, Node ' + S.env.node + ', Chrome ' + (S.env.chromeOnDisk || '?') + ' (version folder beside `chrome.exe`; each suite boots its own headless Chrome and the driver window is 1600×900 at DPR 1, `--ui-scale` 1). Run sequentially by `prep/baseline/scripts/bundle.js --suites`; each log holds the suite\'s full stdout/stderr under a header. Nothing was fixed: a FAIL here is the state of the app on this date, recorded.', '');
    L.push('| Suite | Command | Exit | PASS | FAIL | Time | Summary line | Retried | Note |', '|---|---|---:|---:|---:|---:|---|---|---|');
    S.suites.forEach(s => {
        if (s.missing) { L.push('| ' + s.name + ' | `' + s.command + '` | — | — | — | — | script missing | | ' + esc(s.note) + ' |'); return; }
        const retried = s.retried ? 'yes: attempt 1 exit ' + s.attempt1.exitCode + ', ' + s.attempt1.pass + '/' + s.attempt1.fail + ' (`' + s.attempt1.log + '`)' + (s.flaky ? ', flaky' : ', same') : '';
        L.push('| ' + s.name + ' | `' + esc(s.command) + '` | ' + (s.exitCode == null ? (s.timedOut ? 'timeout' : 'signal ' + s.signal) : s.exitCode) + ' | ' + s.pass + ' | ' + s.fail + ' | ' + (s.durationMs / 1000).toFixed(1) + ' s | ' + esc(s.summaryLines.join(' ; ')) + ' | ' + retried + ' | ' + esc(s.note) + ' |');
    });
    const ok = S.suites.filter(s => s.exitCode === 0).length, tot = S.suites.filter(s => !s.missing).length;
    L.push('', '**' + ok + '/' + tot + ' suites exited 0; ' + S.suites.reduce((a, s) => a + (s.pass || 0), 0) + ' PASS lines, ' + S.suites.reduce((a, s) => a + (s.fail || 0), 0) + ' FAIL lines in all' + (S.suites.some(s => s.retried) ? '; ' + S.suites.filter(s => s.retried).map(s => s.name).join(', ') + ' needed a second run (see Retry policy)' : '') + '.**', '');
    const failing = S.suites.filter(s => s.fail > 0 || (s.exitCode !== 0 && !s.missing) || (s.attempt1 && s.attempt1.fail > 0));
    if (failing.length) {
        L.push('## FAIL lines, verbatim (first 10 per suite)', '');
        failing.forEach(s => {
            if (s.fail > 0 || s.exitCode !== 0) { L.push('### ' + s.name + ' (exit ' + s.exitCode + ')', ''); (s.failLines.length ? s.failLines.slice(0, 10) : ['(no FAIL line; see the log: ' + s.log + ')']).forEach(l => L.push('- `' + esc(l) + '`')); L.push(''); }
            if (s.attempt1 && s.attempt1.fail > 0) { L.push('### ' + s.name + ', attempt 1 (exit ' + s.attempt1.exitCode + '; superseded by the re-run above)', ''); s.attempt1.failLines.slice(0, 10).forEach(l => L.push('- `' + esc(l) + '`')); L.push(''); }
        });
    }
    L.push('## Retry policy', '', S.retryPolicy + '. A real failure at HEAD fails twice and is recorded as such; a flake passes on the retry and is marked `flaky` with its first log kept. `--check` applies the same rule against the baseline counts, so a flake does not trip the gate and a real regression (two failing runs) does.', '');
    if (S.partialUpdates && S.partialUpdates.length) { L.push('## Partial updates', '', S.partialUpdates.map(p => '- ' + p.date + ' at `' + (p.headCommit || '?').slice(0, 7) + '`: ' + p.suites.join(', ')).join('\n'), ''); }
    L.push('## How PASS / FAIL are counted', '', 'Lines matching `^\\s*(\\d+(\\.\\d+)?s\\s+)?(PASS|FAIL)\\b` in stdout + stderr (every suite prints one such line per check; look-links prefixes a time). The suites\' own closing lines (`N/M passed`, `OK/FAILED N passed, M failed`, the pen-window JSON) are copied into the Summary column unparsed. The exit code is the gate the suites themselves define (1 on any failed check).', '');
    L.push('## Logs', '', S.suites.filter(s => !s.missing).map(s => '- `' + s.log + '`' + (s.attempt1 ? ' (first attempt: `' + s.attempt1.log + '`)' : '')).join('\n'), '');
    return L.join('\n');
}

// ─── part 3: the button audit (js/38) ────────────────────────────────────────
const AUDIT_EXPR = `(function(){ var r = window.auditButtons ? window.auditButtons() : null; if (!r) return null;
    return { total: r.total, clean: r.clean, rules: r.rules.slice().sort(function(a,b){ return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0; }), inline: r.inline.slice().sort(function(a,b){ var x=a.button+'|'+a.props, y=b.button+'|'+b.props; return x < y ? -1 : x > y ? 1 : 0; }) }; })()`;
// Which of the audit's offending rules match buttons inside one root (a popup).
const SCOPED_EXPR = root => `(function(){ var root = document.querySelector(${JSON.stringify(root)}); if (!root) return null;
    var els = Array.prototype.slice.call(root.querySelectorAll('button, .btn')); var r = window.auditButtons(); var hit = [];
    r.rules.forEach(function(x){ var sel = x.rule.split('  |  ')[1]; var n = 0; els.forEach(function(el){ try { if (el.matches(sel)) n++; } catch(_){} }); if (n) hit.push({ rule: x.rule, buttons: n }); });
    var inl = els.filter(function(el){ return ['background','background-color','background-image','border','border-color','color'].some(function(p){ return el.style.getPropertyValue(p); }); }).map(function(el){ return el.id || el.className || el.textContent.trim().slice(0, 24); });
    return { buttons: els.length, rules: hit, inline: inl }; })()`;

async function shiftClick(d, x, y) {
    const base = { x, y, pointerType: 'mouse', modifiers: 8 };
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved', button: 'none', buttons: 0 }, base));
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 }, base));
    await sleep(40);
    await d.send('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 }, base));
    await sleep(60);
}
async function centreOf(d, expr) {
    return d.ev(`(function(){ var el = ${expr}; if (!el) return null; try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) { el.scrollIntoView(); }
        var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), visible: !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') }; })()`);
}
async function waitAnimations(d, ms) {
    const t0 = Date.now(); let n = -1;
    while (Date.now() - t0 < ms) { n = await d.ev('document.getAnimations().length').catch(() => -1); if (n === 0) break; await sleep(200); }
    return n;
}
const SECTIONS = `document.querySelectorAll('#sidebar-left .sidebar-section, #sidebar-right .sidebar-section')`;

async function captureAudit() {
    const started = new Date();
    const d = await boot({ seed: { 'swirlResetHint.v1': '1' } });
    const out = { env: {}, stageOrder: [], stages: {}, sectionOpenLog: [], lazyLog: [], problems: [] };
    try {
        const anims = await waitAnimations(d, 5000);
        if (anims !== 0) problem('entrance animations still running after 5 s (getAnimations().length = ' + anims + ')');
        await sleep(300);
        const ver = await d.send('Browser.getVersion');
        const pageEnv = await d.ev(`({ innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null, url: location.href, bodyClasses: document.body.className,
            leftFolded: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()), styleSheets: Array.prototype.map.call(document.styleSheets, function(s){ return (s.href || 'inline').split('/').pop(); }), hasAudit: typeof window.auditButtons === 'function' })`);
        out.env = Object.assign(baseEnv(), { chrome: ver.product, userAgent: ver.userAgent, protocol: ver.protocolVersion, build: 'web build in headless Chrome (driver window 1600x900, scratch profile)' }, pageEnv);
        log('env: ' + ver.product + ', viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ' @' + pageEnv.dpr + ', --ui-scale ' + pageEnv.uiScale + ', HEAD ' + (out.env.headCommit || '?').slice(0, 7));
        if (!pageEnv.hasAudit) throw new Error('window.auditButtons is not defined (js/38-button-audit.js not loaded?)');

        const stage = async (name, how, root) => {
            const r = await d.ev(AUDIT_EXPR);
            if (!r) throw new Error('auditButtons() returned nothing at stage ' + name);
            const rec = { how, total: r.total, clean: r.clean, coloured: r.total - r.clean, rules: r.rules, inline: r.inline };
            if (root) rec.scoped = Object.assign({ root }, await d.ev(SCOPED_EXPR(root)) || { buttons: null, rules: [], inline: [] });
            out.stages[name] = rec; out.stageOrder.push(name);
            log('audit [' + name + ']: ' + r.total + ' buttons, ' + r.clean + ' clean, ' + r.rules.length + ' legacy rules, ' + r.inline.length + ' inline' + (rec.scoped ? '; in ' + root + ': ' + rec.scoped.buttons + ' buttons, ' + rec.scoped.rules.length + ' rules, ' + rec.scoped.inline.length + ' inline' : ''));
        };

        await stage('at-boot', 'as the app boots: left bar open, Brush section open, every other section collapsed, no popup');

        if (pageEnv.leftFolded) {
            const r = await centreOf(d, `document.querySelector('#sidebar-left .lsb-rail-label')`);
            if (r) { await d.click(r.x, r.y); await sleep(300); }
            const still = await d.ev('window.Sidebars.left.isCollapsed()');
            out.sectionOpenLog.push({ title: '(left sidebar)', action: 'folded at boot; clicked .lsb-rail-label', ok: !still });
            if (still) problem('left sidebar stayed folded after clicking its rail label');
        }
        const secs = await d.ev(`Array.prototype.map.call(${SECTIONS}, function(s, i){ var t = s.querySelector('.section-title'); return { i: i, title: t ? t.textContent.trim() : '', expanded: t ? t.getAttribute('aria-expanded') : null, hidden: getComputedStyle(s).display === 'none' || s.hidden }; })`);
        for (const s of secs) {
            const entry = { title: s.title, action: '', ok: false };
            if (s.expanded === 'true') { entry.action = 'already open at boot'; entry.ok = true; out.sectionOpenLog.push(entry); continue; }
            if (s.hidden) { entry.action = 'hidden at boot; not opened'; out.sectionOpenLog.push(entry); problem('section "' + s.title + '" is hidden at boot'); continue; }
            await centreOf(d, `${SECTIONS}[${s.i}].querySelector('.section-title')`); await sleep(80);
            const r = await centreOf(d, `${SECTIONS}[${s.i}].querySelector('.section-title')`);
            let how = 'trusted Shift-click on .section-title';
            if (r && r.visible) await shiftClick(d, r.x, r.y); else how = 'title not visible; ';
            await sleep(250);
            let exp = await d.ev(`${SECTIONS}[${s.i}].querySelector('.section-title').getAttribute('aria-expanded')`);
            if (exp !== 'true') {
                await d.ev(`(function(){ ${SECTIONS}[${s.i}].querySelector('.section-header').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); return 1; })()`);
                await sleep(250);
                exp = await d.ev(`${SECTIONS}[${s.i}].querySelector('.section-title').getAttribute('aria-expanded')`);
                how += 'synthetic Shift-click on .section-header';
            }
            entry.action = how; entry.ok = exp === 'true';
            if (!entry.ok) problem('section "' + s.title + '" would not open (aria-expanded=' + exp + ')');
            out.sectionOpenLog.push(entry);
        }
        await sleep(500);
        const openCount = await d.ev(`Array.prototype.filter.call(${SECTIONS}, function(s){ var t = s.querySelector('.section-title'); return t && t.getAttribute('aria-expanded') === 'true'; }).length`);
        log('sections open: ' + openCount + '/' + secs.length);
        out.allSectionsOpen = openCount === secs.length;
        await stage('all-sections-open', 'every sidebar section open (' + openCount + '/' + secs.length + ', trusted Shift-clicks), no popup');

        const canvas = await d.ev(`(function(){ var c = document.getElementById('canvas') || document.querySelector('#canvas-area canvas'); var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
        const escape = async () => { await d.tap('Escape', 'Escape', 27); await sleep(200); };
        const lazies = [
            { name: 'radial-menu', root: '#radialMenu', how: 'pointer over the canvas centre, tap E',
              open: async () => { await d.ev('document.activeElement && document.activeElement.blur(), 1'); await d.move(canvas.x, canvas.y); await sleep(60); await d.keyDown('e', 'KeyE', 69, [], 'e'); await sleep(40); await d.keyUp('e', 'KeyE', 69); await sleep(250); },
              isOpen: `!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())`, close: escape },
            { name: 'colour-picker', root: '.cp-pop', how: 'trusted click on the top bar colour well #colorPicker',
              open: async () => { const r = await centreOf(d, `document.getElementById('colorPicker')`); if (!r || !r.visible) throw new Error('#colorPicker not visible'); await d.click(r.x, r.y); await sleep(300); },
              isOpen: `!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`, close: escape },
            { name: 'presets-popup', root: '.mixer-presets-panel', how: 'trusted click on #mixerPresetsTrigger',
              open: async () => { const r = await centreOf(d, `document.getElementById('mixerPresetsTrigger')`); if (!r || !r.visible) throw new Error('#mixerPresetsTrigger not visible'); await d.click(r.x, r.y); await sleep(300); },
              isOpen: `(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`,
              close: async () => { await escape(); const still = await d.ev(`(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`);
                  if (still) { const r = await centreOf(d, `document.getElementById('mixerPresetsTrigger')`); await d.click(r.x, r.y); await sleep(250); return 'Escape did not close it; closed by clicking the trigger again'; } return null; } },
            { name: 'arm-tip-menu', root: '.arm-tip-menu', how: 'trusted click on the first .arm-tip-btn in Multi-Brush',
              open: async () => { const r = await centreOf(d, `document.querySelector('#sidebar-left .arm-tip-btn')`); if (!r || !r.visible) throw new Error('.arm-tip-btn not visible'); await d.click(r.x, r.y); await sleep(300); },
              isOpen: `!!document.querySelector('.arm-tip-menu')`,
              close: async () => { await escape(); const still = await d.ev(`!!document.querySelector('.arm-tip-menu')`);
                  if (still) { const r = await centreOf(d, `document.querySelector('#sidebar-left .arm-tip-btn')`); await d.click(r.x, r.y); await sleep(250); return 'Escape did not close it; closed by clicking the square again'; } return null; } }
        ];
        for (const z of lazies) {
            const entry = { name: z.name, root: z.root, how: z.how, opened: false, closed: null, note: null };
            try {
                await z.open();
                entry.opened = !!(await d.ev(z.isOpen));
                if (!entry.opened) { problem('lazy UI ' + z.name + ' did not open (' + z.how + ')'); }
                else await stage('with-' + z.name, z.how + ' (every section open)', z.root);
                const note = await z.close();
                entry.note = note || null;
                entry.closed = !(await d.ev(z.isOpen));
                if (!entry.closed) problem('lazy UI ' + z.name + ' is still open after closing');
            } catch (e) { entry.error = String(e && e.message || e); problem('lazy UI ' + z.name + ': ' + entry.error); try { await escape(); } catch (_) {} }
            out.lazyLog.push(entry);
        }
        await sleep(300);
        await stage('after-popups-closed', 'every section open, every popup closed again (#radialMenu and .mixer-presets-panel stay in the DOM hidden)');
        out.pageExceptions = d.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || e.params.exceptionDetails.text || '').slice(0, 300));
        if (out.pageExceptions.length) problem(out.pageExceptions.length + ' page exception(s) during the audit boot; see button-audit.json');
    } finally {
        await d.close();
    }
    out.problems = problems.slice();
    out.env.date = started.toISOString();
    return out;
}

function auditMarkdown(A) {
    const L = [];
    L.push('# Button audit (F6 baseline)', '');
    L.push('`window.auditButtons()` (`js/38-button-audit.js`) is the existing style-contract gate: it walks the live stylesheets and names every rule outside `css/01-buttons.css` that colours a `button` or `.btn` (exempting `.btn--destructive`, `.btn--record` and `#photoWarn`), plus inline `style=""` colours. Captured ' + A.env.date + ' at HEAD `' + (A.env.headCommit || '?').slice(0, 7) + '` with ' + A.env.chrome + ' (headless), viewport ' + A.env.innerWidth + '×' + A.env.innerHeight + ' CSS px, DPR ' + A.env.dpr + ', `--ui-scale` ' + A.env.uiScale + ', Node ' + A.env.node + '. Written by `prep/baseline/scripts/bundle.js --audit`; `--check` re-runs it and fails on any change to the totals, the rule list or the inline list of any stage.', '');
    L.push('## Stages', '', '| Stage | What the DOM held | Buttons | Clean | Coloured by legacy rules | Legacy rules | Inline offenders |', '|---|---|---:|---:|---:|---:|---:|');
    A.stageOrder.forEach(n => { const s = A.stages[n]; L.push('| ' + n + ' | ' + esc(s.how) + ' | ' + s.total + ' | ' + s.clean + ' | ' + s.coloured + ' | ' + s.rules.length + ' | ' + s.inline.length + ' |'); });
    const scoped = A.stageOrder.filter(n => A.stages[n].scoped);
    if (scoped.length) {
        L.push('', '### Inside each popup', '', '| Stage | Root | Buttons in the root | Legacy rules matching them | Inline colours in the root |', '|---|---|---:|---|---|');
        scoped.forEach(n => { const s = A.stages[n].scoped; L.push('| ' + n + ' | `' + s.root + '` | ' + s.buttons + ' | ' + (s.rules.length ? s.rules.map(r => '`' + esc(r.rule) + '` ×' + r.buttons).join('; ') : 'none') + ' | ' + (s.inline.length ? s.inline.map(x => '`' + esc(x) + '`').join(', ') : 'none') + ' |'); });
    }
    // Union of rules across stages.
    const rules = new Map();
    A.stageOrder.forEach(n => A.stages[n].rules.forEach(r => { const e = rules.get(r.rule) || { rule: r.rule, props: r.props, stages: {} }; e.stages[n] = r.buttons; rules.set(r.rule, e); }));
    L.push('', '## Legacy rules that colour a button (union over the stages)', '');
    if (!rules.size) L.push('None. Every button reads its colour from `css/01-buttons.css` and the section tokens, in every stage.');
    else {
        L.push('| Sheet @condition  \\|  selector | Properties | ' + A.stageOrder.map(n => 'buttons ' + n).join(' | ') + ' |', '|---|---|' + A.stageOrder.map(() => '---:').join('|') + '|');
        [...rules.values()].sort((a, b) => a.rule.localeCompare(b.rule)).forEach(e => L.push('| `' + esc(e.rule) + '` | ' + esc(e.props) + ' | ' + A.stageOrder.map(n => e.stages[n] == null ? '' : e.stages[n]).join(' | ') + ' |'));
    }
    const inline = new Map();
    A.stageOrder.forEach(n => A.stages[n].inline.forEach(x => { const k = x.button + ' | ' + x.props; const e = inline.get(k) || { button: x.button, props: x.props, stages: [] }; e.stages.push(n); inline.set(k, e); }));
    L.push('', '## Inline `style=""` colours on buttons (union over the stages)', '');
    if (!inline.size) L.push('None.');
    else { L.push('| Button (id / class / text) | Properties | Stages |', '|---|---|---|'); [...inline.values()].forEach(e => L.push('| `' + esc(e.button) + '` | ' + esc(e.props) + ' | ' + e.stages.join(', ') + ' |')); }
    L.push('', '## How the stages were reached', '', '| Section | Action | Open |', '|---|---|---|');
    A.sectionOpenLog.forEach(e => L.push('| ' + esc(e.title) + ' | ' + esc(e.action) + ' | ' + (e.ok ? 'yes' : 'NO') + ' |'));
    L.push('', '| Popup | Root | How | Opened | Closed | Note |', '|---|---|---|---|---|---|');
    A.lazyLog.forEach(e => L.push('| ' + e.name + ' | `' + e.root + '` | ' + esc(e.how) + ' | ' + (e.opened ? 'yes' : 'NO') + ' | ' + (e.closed === null ? '—' : e.closed ? 'yes' : 'NO') + ' | ' + esc(e.note || e.error || '') + ' |'));
    L.push('', 'Stylesheets seen by the page (document.styleSheets, in order): ' + A.env.styleSheets.map(s => '`' + s + '`').join(', ') + '.', '');
    if (A.problems.length) { L.push('## Problems', ''); A.problems.forEach(p => L.push('- ' + p)); L.push(''); }
    L.push('## Reading this as a gate', '', 'The theme layer (`@layer theme`) will colour buttons from outside `css/01-buttons.css`, so as written `isSanctioned()` (js/38-button-audit.js:21–31) will list every theme rule here. Prep does not change js/38; the CSS plan has to say how the theme layer is sanctioned (an open item, not a decision made here). Until then `--check` compares against this list exactly: a new rule, a vanished rule, or a changed button count on any stage fails.', '');
    return L.join('\n');
}

// ─── --check ─────────────────────────────────────────────────────────────────
function diffSuites(base, fresh) {
    const out = [];
    fresh.suites.forEach(f => {
        const b = base.suites.find(s => s.name === f.name);
        if (!b) { out.push(f.name + ': not in the baseline'); return; }
        if (b.missing || f.missing) { if (!!b.missing !== !!f.missing) out.push(f.name + ': script presence changed'); return; }
        if (b.exitCode !== f.exitCode) out.push(f.name + ': exit code ' + b.exitCode + ' -> ' + f.exitCode);
        if (b.pass !== f.pass) out.push(f.name + ': PASS ' + b.pass + ' -> ' + f.pass);
        if (b.fail !== f.fail) out.push(f.name + ': FAIL ' + b.fail + ' -> ' + f.fail + (f.failLines.length ? ' (' + f.failLines.slice(0, 3).join(' | ') + ')' : ''));
    });
    if (!SUITE_FILTER.length) base.suites.forEach(b => { if (!fresh.suites.find(s => s.name === b.name)) out.push(b.name + ': in the baseline but not re-run'); });
    return out;
}
function diffAudit(base, fresh) {
    const out = [];
    const names = [...new Set(base.stageOrder.concat(fresh.stageOrder))];
    names.forEach(n => {
        const b = base.stages[n], f = fresh.stages[n];
        if (!b || !f) { out.push('stage ' + n + ': ' + (!b ? 'new' : 'missing')); return; }
        if (b.total !== f.total) out.push('stage ' + n + ': buttons ' + b.total + ' -> ' + f.total);
        if (b.clean !== f.clean) out.push('stage ' + n + ': clean ' + b.clean + ' -> ' + f.clean);
        const bk = new Map(b.rules.map(r => [r.rule, r])), fk = new Map(f.rules.map(r => [r.rule, r]));
        bk.forEach((r, k) => { const x = fk.get(k); if (!x) out.push('stage ' + n + ': rule gone: ' + k); else if (x.buttons !== r.buttons || x.props !== r.props) out.push('stage ' + n + ': rule changed: ' + k + ' (' + r.buttons + ' ' + r.props + ' -> ' + x.buttons + ' ' + x.props + ')'); });
        fk.forEach((r, k) => { if (!bk.has(k)) out.push('stage ' + n + ': NEW rule: ' + k + ' (' + r.buttons + ' buttons, ' + r.props + ')'); });
        const bi = b.inline.map(x => x.button + ' | ' + x.props).sort(), fi = f.inline.map(x => x.button + ' | ' + x.props).sort();
        if (JSON.stringify(bi) !== JSON.stringify(fi)) out.push('stage ' + n + ': inline offenders ' + JSON.stringify(bi) + ' -> ' + JSON.stringify(fi));
    });
    return out;
}
function diffSizes(base, fresh) {
    const out = [];
    const flat = s => { const m = new Map(); s.css.concat(s.js, s.vendor, [s.indexHtml]).forEach(f => m.set(f.path, f.bytes)); s.assets.files.forEach(f => m.set(f.path, f.bytes)); return m; };
    const b = flat(base), f = flat(fresh);
    b.forEach((v, k) => { if (!f.has(k)) out.push('removed ' + k + ' (' + v + ' B)'); else if (f.get(k) !== v) out.push(k + ' ' + v + ' -> ' + f.get(k) + ' B (' + (f.get(k) - v > 0 ? '+' : '') + (f.get(k) - v) + ')'); });
    f.forEach((v, k) => { if (!b.has(k)) out.push('added ' + k + ' (' + v + ' B)'); });
    const bt = base.totals.rendererLoaded.bytes, ft = fresh.totals.rendererLoaded.bytes;
    if (bt !== ft) out.push('renderer-as-loaded total ' + bt + ' -> ' + ft + ' B (' + (ft - bt > 0 ? '+' : '') + (ft - bt) + ')');
    return out;
}

// ─── main ────────────────────────────────────────────────────────────────────
(async () => {
    const doSizes = !anyOnly || only.sizes, doSuites = !anyOnly || only.suites, doAudit = !anyOnly || only.audit;
    mkdirp(OUT_BUNDLE); mkdirp(OUT_SUITES);
    let sizes = null, suites = null, audit = null;
    try {
        if (doSizes) {
            log('-- sizes');
            sizes = captureSizes();
            writeJSON(path.join(OUT_BUNDLE, 'sizes.json'), sizes);
            fs.writeFileSync(path.join(OUT_BUNDLE, 'sizes.md'), sizesMarkdown(sizes));
            log('   renderer as loaded ' + kb(sizes.totals.rendererLoaded.bytes) + ' KB (' + sizes.totals.cssLoaded.files + ' css, index.html, ' + sizes.totals.jsLoaded.files + ' js); vendor ' + kb(sizes.totals.vendor.bytes) + ' KB; assets ' + kb(sizes.totals.assets.bytes) + ' KB; fonts shipped ' + sizes.totals.fontsShipped.files);
        }
        if (doSuites) {
            log('-- suites' + (SUITE_FILTER.length ? ' (' + SUITE_FILTER.join(', ') + ')' : ''));
            const baseSuites = CHECK && fs.existsSync(path.join(BASE_SUITES, 'suites.json')) ? readJSON(path.join(BASE_SUITES, 'suites.json')) : null;
            suites = await captureSuites(OUT_SUITES, baseSuites);
            writeJSON(path.join(OUT_SUITES, 'suites.json'), suites);
            fs.writeFileSync(path.join(OUT_SUITES, 'suites.md'), suitesMarkdown(suites));
        }
        if (doAudit) {
            log('-- button audit');
            audit = await captureAudit();
            writeJSON(path.join(OUT_BUNDLE, 'button-audit.json'), audit);
            fs.writeFileSync(path.join(OUT_BUNDLE, 'button-audit.md'), auditMarkdown(audit));
        }
    } catch (e) {
        console.error('ERROR ' + (e && e.stack || e));
        process.exitCode = 1;
        if (!CHECK) return;
    }

    if (!CHECK) {
        log('wrote: ' + [doSizes && rel(path.join(OUT_BUNDLE, 'sizes.json')), doSizes && rel(path.join(OUT_BUNDLE, 'sizes.md')), doSuites && rel(path.join(OUT_SUITES, 'suites.json')), doSuites && rel(path.join(OUT_SUITES, 'suites.md')), doAudit && rel(path.join(OUT_BUNDLE, 'button-audit.json')), doAudit && rel(path.join(OUT_BUNDLE, 'button-audit.md'))].filter(Boolean).join(', '));
        if (problems.length) { log(problems.length + ' problem(s) recorded:'); problems.forEach(p => log('  - ' + p)); }
        return;
    }

    // Compare with the baseline.
    const report = { date: new Date().toISOString(), headCommit: headCommit(), gated: [], info: [] };
    if (doSuites && suites) {
        const bp = path.join(BASE_SUITES, 'suites.json');
        if (!fs.existsSync(bp)) report.gated.push('no baseline suites.json'); else diffSuites(readJSON(bp), suites).forEach(x => report.gated.push('suites: ' + x));
    }
    if (doAudit && audit) {
        const bp = path.join(BASE_BUNDLE, 'button-audit.json');
        if (!fs.existsSync(bp)) report.gated.push('no baseline button-audit.json'); else diffAudit(readJSON(bp), audit).forEach(x => report.gated.push('button audit: ' + x));
    }
    if ((doSuites && !suites) || (doAudit && !audit)) report.gated.push('a re-capture failed (see ERROR above)');
    if (doSizes && sizes) {
        const bp = path.join(BASE_BUNDLE, 'sizes.json');
        if (!fs.existsSync(bp)) report.info.push('no baseline sizes.json'); else diffSizes(readJSON(bp), sizes).forEach(x => report.info.push('sizes (not gated): ' + x));
    }
    report.result = report.gated.length ? 'FAIL' : 'PASS';
    writeJSON(path.join(CHECK_ROOT, 'check-result.json'), report);
    report.info.forEach(x => log('INFO ' + x));
    report.gated.forEach(x => log('MISMATCH ' + x));
    const parts = [doSuites && suites && suites.suites.length + ' suites', doAudit && audit && audit.stageOrder.length + ' audit stages', doSizes && sizes && 'sizes (info only)'].filter(Boolean).join(', ');
    log('CHECK ' + report.result + ': ' + (report.gated.length ? report.gated.length + ' mismatch(es) over ' : 'identical to the baseline over ') + parts + (report.info.length ? '; ' + report.info.length + ' size delta(s) reported, not gated' : '') + ' (prep/work/bundle-check/check-result.json)');
    process.exitCode = report.gated.length ? 1 : (process.exitCode || 0);
})();
