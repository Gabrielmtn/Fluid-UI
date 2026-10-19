// ═══════════════════════════════════════════════════════════════════
// scripts/bake-deco-capsules.js — bakes the full game's Steam capsules from
// the app's own boot screen: the Walnut & Copper splash, its blue deco
// sunburst of herringbone walnut, the cream title and the copper-ruled
// tagline, laid out at each slot's shape.
//
//   node scripts/bake-deco-capsules.js                    (every slot)
//   node scripts/bake-deco-capsules.js main small logo    (just those)
//   node scripts/bake-deco-capsules.js --out <dir>        (all files into one folder, for review)
//
//   store     header 920x430   small 462x174   main 1232x706   vertical 748x896
//   library   capsule 600x900  header 920x430 (= the store header)
//             hero 3840x1240   logo 1280 wide, transparent
//   icon      shortcut 512x512 PNG, app icon 184x184 JPG, build/icon.ico
//
// THE PICTURE is the splash as the app draws it (css/44-theme-boot.css,
// css/init-responsive.css): the app is booted in a throwaway-profile
// headless Chrome, the splash is put back over it, the viewport is set to
// the slot's size and the page is screenshotted at 2x, then resolved down.
// Per slot only the type is sized (and, on the tall slots, the title wraps
// to two lines); nothing is drawn on top. The ground is the same bake as
// assets/textures/deco-sunburst-2560.jpg, re-run at 1.6x
// (scripts/theme/bake-deco-sunburst.js --scale 1.6) so the 3840 hero is not
// an upscale; it is served in place of the shipped ground for the capture.
//
// SLOT RULES worth knowing before editing
//   · Capsules may carry only artwork, the game's name and an official
//     subtitle (partner.steamgames.com/doc/store/assets/rules).
//   · capsule_small drops the tagline: legibility beats completeness.
//   · library_hero carries NO text: Steam lays the library logo over it.
//   · library_logo is transparent, the title alone.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const sharp = require('sharp');
const { connect, waitReady } = require('./test/cdp.js');

const REPO = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9339;
const STORE_DIR = path.join(REPO, 'steam', 'store-assets');
const LIB_DIR = path.join(REPO, 'steam', 'library-assets');
const GROUND = path.join(os.tmpdir(), 'swirl-deco-ground-1.6.jpg');
// The icon's ground: the same veneer as a square medallion, sun centred.
const GROUND_ICON = path.join(os.tmpdir(), 'swirl-deco-medallion-1200.jpg');
const BUILD_DIR = path.join(REPO, 'build');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// textW: how much of the slot's width the title's longest line spans.
// sub: tagline size as a fraction of the title's. wrap: title on two lines.
// swirlScale / swirlY: the swirl's size and height in this slot.
const SLOTS = {
    header:   { dir: STORE_DIR, file: 'capsule_header_920x430.png', slot: [920, 430], textW: 0.66, sub: 0.30,
                copies: [[LIB_DIR, 'library_header_920x430.png']] },
    small:    { dir: STORE_DIR, file: 'capsule_small_462x174.png', slot: [462, 174], textW: 0.86, sub: 0 },
    main:     { dir: STORE_DIR, file: 'capsule_main_1232x706.png', slot: [1232, 706], textW: 0.60, sub: 0.28 },
    vertical: { dir: STORE_DIR, file: 'capsule_vertical_748x896.png', slot: [748, 896], textW: 0.70, sub: 0.24, wrap: true,
                swirlScale: 0.62, swirlY: 0.45 },
    capsule:  { dir: LIB_DIR, file: 'library_capsule_600x900.png', slot: [600, 900], textW: 0.74, sub: 0.24, wrap: true,
                swirlScale: 0.62, swirlY: 0.45 },
    hero:     { dir: LIB_DIR, file: 'library_hero_3840x1240.png', slot: [3840, 1240], k: 1, noText: true, swirlScale: 0.7 },
    logo:     { dir: LIB_DIR, file: 'library_logo_1280x{h}.png', slot: [1280, 400], textW: 0.92, logo: true },
    // The app icon: the double swirl on the medallion, no type. The 512 PNG
    // is Steam's Shortcut Icon, the 184 JPG its App Icon (no alpha), and the
    // .ico is the exe's own icon at every size Windows asks for.
    icon:     { dir: STORE_DIR, file: 'shortcut_icon_512x512.png', slot: [512, 512], noText: true, medallion: true,
                swirlScale: 0.72, swirlOpacity: 1, look: { turns: 3, stir: 90, dab: 0.0013 },
                monogram: [{ ch: 'S', x: 0.33, y: 0.42, size: 0.62 }, { ch: 'T', size: 0.46, y: 0.64, gap: 0.06 }],
                jpg: [STORE_DIR, 'app_icon_184x184.jpg', 184],
                ico: [BUILD_DIR, 'icon.ico', [256, 128, 64, 48, 32, 24, 16]],
                // The demo and playtest builds wear the same mark.
                copies: [[path.join(REPO, 'steam', 'demo-store-assets'), 'shortcut_icon_512x512.png']],
                jpgCopies: [path.join(REPO, 'steam', 'demo-store-assets')],
                icoCopies: [[BUILD_DIR, 'icon-demo.ico']] }
};

// The swirl's two tones (copper off the inlay, a cool teal against it) and
// its shape, in short sides of the slot.
const SWIRL_LOOK = {
    tones: [[1.0, 0.42, 0.14], [0.10, 0.62, 0.78]],
    sep: 0.55, rad: 0.30, turns: 2.5, speed: 220, dab: 0.0009, dabs: 160, stir: 130, settle: 50, rest: 20, opacity: 0.8
};

// Page side: paint the double swirl in the real sim, in a canvas box of
// the slot's shape (fitted to BOX css px), and return the box's rect for
// the screenshot. Two vortices along the slot's long axis, spinning against
// each other, one per tone, each fed as a winding spiral of dabs so the two
// colours wind into one another where the vortices meet.
const BOX = [2600, 1500];
const SWIRL = String(async function (o) {
    const raf = (n) => new Promise((res) => { (function t() { if (n-- <= 0) return res(); requestAnimationFrame(t); })(); });
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    let seed = 7;
    Math.random = function () { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
    if (!document.getElementById('capsule-ui-hide')) {
        const st = document.createElement('style');
        st.id = 'capsule-ui-hide';
        st.textContent = '.resize-handle, .corner-lock, #canvas-size-display { display: none !important; }';
        document.head.appendChild(st);
    }
    // Undo the logo slot's see-through page, or the canvas is hidden too.
    const hid = document.getElementById('capsule-hide');
    if (hid) hid.remove();
    document.documentElement.style.background = '';
    document.body.style.background = '';
    try { if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false); } catch (_) {}
    set('visualResolution', '4096');
    window.__exporting = true;
    window.kaleidoEnabled = false;
    if (window.lightShift) window.lightShift.enabled = false;
    if (window.collisionLayers) window.collisionLayers.enabled = false;

    // Fit the slot's shape inside the app's usable box, and report the size
    // as pinned so a layout pass never refills the area over it.
    window.canvasHasPinnedSize = () => true;
    await raf(10);                                   // the last slot's viewport let go
    const ub = window.canvasUsableBox();
    const bw = Math.min(o.box[0], ub.maxW), bh = Math.min(o.box[1], ub.maxH);
    const f = Math.min(bw / o.slot[0], bh / o.slot[1]);
    const W = Math.round(o.slot[0] * f), H = Math.round(o.slot[1] * f);
    const wrap = document.getElementById('canvas-wrapper');
    for (let tries = 0; tries < 3; tries++) {
        wrap.style.width = W + 'px'; wrap.style.height = H + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        await raf(14);
        const b = wrap.getBoundingClientRect();
        if (Math.abs(b.width - W) <= 2 && Math.abs(b.height - H) <= 2) break;
    }
    window.clearCanvas();
    await raf(3);
    const cv = document.getElementById('canvas');
    const got = cv.getBoundingClientRect();
    if (Math.abs(got.width - W) > 2 || Math.abs(got.height - H) > 2) {
        throw new Error('canvas box came out ' + got.width + 'x' + got.height + ', wanted ' + W + 'x' + H);
    }
    const cw = cv.width, ch = cv.height;
        const S = Math.min(cw, ch);
    // The pair sits side by side, sep apart (in short sides, times the
    // slot's own swirl scale), its middle at cy down the slot.
    const k = o.swirlScale || 1;
    const sep = o.sep * S * k, rad = o.rad * S * k;
    const cy0 = ch * (o.swirlY || 0.5);
    const centres = [-1, 1].map((s) => [cw / 2 + s * sep / 2, cy0]);
    // Each vortex is laid as one spiral arm of small dabs, both turning the
    // same way, so the pair orbits the middle and the arms wind into each
    // other (a co-rotating pair; counter-rotating ones just shove apart).
    const DABS = o.dabs;
    for (let i = 0; i < DABS; i++) {
        for (let v = 0; v < 2; v++) {
            const [cx, cy] = centres[v];
            const t = i / DABS;
            const a = t * Math.PI * 2 * o.turns + (v ? Math.PI : 0);
            const rr = rad * (0.08 + 0.92 * t);
            const col = o.tones[v].map((c) => c * (0.8 + 0.2 * Math.random()));
            window.applyMultiSplatWith(
                cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
                -Math.sin(a) * o.speed, Math.cos(a) * o.speed,
                col, 1, o.dab, true);
        }
        if (i % 4 === 0) await raf(1);
    }
    // Stir while it settles: a Pressure ring (velocity, no paint) round
    // each vortex and one round the pair, same sense, so it keeps winding.
    const ring = (cx, cy, r, sp, n, rr) => {
        for (let j = 0; j < n; j++) {
            const a = j / n * Math.PI * 2;
            window.applyMultiSplatWith(cx + Math.cos(a) * r, cy + Math.sin(a) * r,
                -Math.sin(a) * sp, Math.cos(a) * sp, [0, 0, 0], 1, rr, false);
        }
    };
    const was = window.config.BRUSH_VELOCITY_ONLY;
    window.config.BRUSH_VELOCITY_ONLY = true;
    try {
        for (let f = 0; f < o.settle; f++) {
            if (f % 2 === 0) {
                centres.forEach(([cx, cy]) => ring(cx, cy, rad * 0.55, o.stir, 6, o.dab * 2));
                ring(cw / 2, cy0, sep * 0.75, o.stir * 0.8, 8, o.dab * 3);
            }
            await raf(1);
        }
    } finally { window.config.BRUSH_VELOCITY_ONLY = was; }
    await raf(o.rest);
    // The first-run "Drag on the canvas" hint floats over the canvas.
    document.querySelectorAll('body > div').forEach((d) => { if (/^Drag on the canvas/.test(d.textContent)) d.remove(); });
    await raf(2);
    const r = cv.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, cw: cw, ch: ch };
});

// Page side: put the splash back, sized for this slot. Returns the title's
// font size in CSS px.
const SHOW = function (o) {
    const old = document.getElementById('splash-screen');
    if (old) old.remove();
    const s = document.createElement('div');
    s.id = 'splash-screen';
    s.className = 'ready';
    s.innerHTML = '<div class="splash-title">Swirl Together</div>' +
        '<div class="splash-subtitle">A fluid sim sandbox for one to eight</div>';
    s.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;opacity:1;--boot-ground:url(/__ground.jpg)';
    document.body.appendChild(s);
    const t = s.querySelector('.splash-title'), sub = s.querySelector('.splash-subtitle');
    if (o.swirl) {
        // The sim's picture over the veneer, under the type: screen blend,
        // so the sim's black ground drops out and only the dye lands.
        const img = document.createElement('img');
        img.src = o.swirl;
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;mix-blend-mode:screen;opacity:' + (o.swirlOpacity || 1) + ';pointer-events:none';
        s.insertBefore(img, s.firstChild);
        [t, sub].forEach((el) => { el.style.position = 'relative'; el.style.zIndex = '1'; });
    }
    [t, sub].forEach((el) => { el.style.opacity = '1'; el.style.animation = 'none'; el.style.transform = 'none'; el.style.transition = 'none'; });
    // The medallion under a dark plate, as the splash puts one under its
    // title, so the dye reads at 16 px instead of fighting the veneer.
    if (o.medallion) s.style.background = 'radial-gradient(circle at 50% 50%, rgba(4,7,12,0.82), rgba(4,7,12,0.55) 62%, rgba(4,7,12,0.25)), #05080d url(/__ground-icon.jpg) center / cover no-repeat';
    if (o.logo) {
        s.style.background = 'none';
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
        const hide = document.createElement('style');
        hide.id = 'capsule-hide';
        hide.textContent = 'body > *:not(#splash-screen) { visibility: hidden !important; }';
        document.head.appendChild(hide);
    }
    if (o.monogram) {
        // The icon's ST: a big S and a smaller T set lower and to the right,
        // in the splash title's cream and the label face's ExtraBold, with a
        // dark edge so each letter holds over copper and teal alike.
        // A letter with a gap is placed by INK, that far right of the last
        // letter's ink, so the two never touch.
        let lastRight = 0;
        o.monogram.forEach((m) => {
            const L = document.createElement('div');
            L.textContent = m.ch;
            L.style.cssText = 'position:absolute;z-index:1;left:' + (m.x * 100) + '%;top:' + (m.y * 100) + '%;' +
                'transform:translate(-50%,-50%);line-height:1;font-family:var(--ui-font-display);font-weight:800;' +
                'font-size:' + (m.size * innerHeight) + 'px;color:rgb(251,236,217);' +
                'text-shadow:0 0 ' + (innerHeight * 0.012) + 'px rgba(4,7,12,0.95),0 0 ' + (innerHeight * 0.035) + 'px rgba(4,7,12,0.8),0 0 ' + (innerHeight * 0.06) + 'px rgba(242,179,138,0.35)';
            s.appendChild(L);
            const ink = (el) => {
                const c = document.createElement('canvas').getContext('2d');
                const cs = getComputedStyle(el);
                c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
                const t = c.measureText(m.ch);
                const r = el.getBoundingClientRect();
                const x0 = r.left + r.width / 2 - t.width / 2;    // the glyph's origin, centred in its box
                return { left: x0 - t.actualBoundingBoxLeft, right: x0 + t.actualBoundingBoxRight };
            };
            if (m.gap != null) {
                const k = ink(L);
                L.style.left = (parseFloat(getComputedStyle(L).left) + lastRight + m.gap * innerWidth - k.left) + 'px';
            }
            lastRight = ink(L).right;
        });
    }
    if (o.noText) { t.remove(); sub.remove(); return 0; }
    if (!o.sub) sub.remove();
    if (o.wrap) { t.style.textAlign = 'center'; t.style.lineHeight = '1.25'; t.innerHTML = 'Swirl<br>Together'; }
    // Fit the longest line to textW of the width: measure at 100px, scale.
    t.style.fontSize = '100px';
    t.style.whiteSpace = 'nowrap';
    const W = innerWidth;
    const fs = 100 * (o.textW * W) / t.getBoundingClientRect().width;
    t.style.fontSize = fs + 'px';
    if (o.sub) {
        sub.style.fontSize = (fs * o.sub) + 'px';
        sub.style.marginTop = (fs * 0.42) + 'px';
        // The tagline's copper rules are sized in vw on the app; keep them
        // in step with the type here instead.
        const st = document.createElement('style');
        st.textContent = '#splash-screen .splash-subtitle::before, #splash-screen .splash-subtitle::after { width: ' + (fs * 0.9) + 'px !important; }';
        s.appendChild(st);
        // One line always; on the narrow slots shrink it until it fits.
        sub.style.whiteSpace = 'nowrap';
        const sw = sub.getBoundingClientRect().width;
        if (sw > 0.92 * W) {
            const f = 0.92 * W / sw;
            sub.style.fontSize = (fs * o.sub * f) + 'px';
            st.textContent = st.textContent.replace(/width: [\d.]+px/, 'width: ' + (fs * 0.9 * f) + 'px');
        }
    }
    return fs;
};

function serve() {
    const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain' };
    return new Promise((res) => {
        const srv = http.createServer((req, rsp) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const f = p === '/__ground.jpg' ? GROUND : p === '/__ground-icon.jpg' ? GROUND_ICON : path.join(REPO, p);
            if (f !== GROUND && f !== GROUND_ICON && !f.startsWith(REPO)) { rsp.writeHead(403); rsp.end(); return; }
            fs.readFile(f, (err, buf) => {
                if (err) { rsp.writeHead(404); rsp.end(); return; }
                rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                rsp.end(buf);
            });
        });
        srv.listen(0, '127.0.0.1', () => res(srv));
    });
}
function portUp() {
    return new Promise((res) => {
        http.get('http://127.0.0.1:' + PORT + '/json', (r) => { r.resume(); res(true); }).on('error', () => res(false));
    });
}
function write(dir, file, buf) {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, file);
    fs.writeFileSync(f, buf);
    return f;
}

async function bake(page, name, outDir) {
    const s = SLOTS[name];
    const [w, h] = s.slot, k = s.k || 2;
    let swirl = null;
    if (!s.logo) {
        await page.send('Emulation.clearDeviceMetricsOverride', {});
        await page.eval("(function(){ var x=document.getElementById('splash-screen'); if(x) x.remove(); return 1; })()");
        const r = await page.eval('(' + SWIRL + ')(' + JSON.stringify(Object.assign({ box: BOX, slot: s.slot, swirlScale: s.swirlScale, swirlY: s.swirlY }, SWIRL_LOOK, s.look)) + ')', { timeoutMs: 120000 });
        const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 } });
        swirl = 'data:image/png;base64,' + shot.data;
        if (outDir) write(outDir, 'swirl_' + name + '.png', Buffer.from(shot.data, 'base64'));
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: k, mobile: false });
    await page.send('Emulation.setDefaultBackgroundColorOverride', s.logo ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const fsPx = await page.eval('(' + SHOW + ')(' + JSON.stringify(Object.assign({ swirl: swirl, swirlOpacity: s.swirlOpacity || SWIRL_LOOK.opacity }, s)) + ')');
    await page.eval('document.fonts.ready.then(() => 1)');
    await sleep(1200);                                   // ground decoded, glow settled
    const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    let img = sharp(Buffer.from(shot.data, 'base64'));
    let file = s.file, buf;
    if (s.logo) {
        // The title and its glow, trimmed to the ink, set 1280 wide.
        const trimmed = await img.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer();
        buf = await sharp(trimmed).resize({ width: w, kernel: 'lanczos3' }).png().toBuffer();
        const m = await sharp(buf).metadata();
        file = file.replace('{h}', m.height);
    } else {
        buf = k === 1 ? await img.png().toBuffer() : await img.resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    }
    const dirs = [[outDir || s.dir, file]].concat(outDir ? [] : (s.copies || []));
    dirs.forEach(([d, f]) => console.log('wrote', path.relative(REPO, write(d, f, buf)), buf.length, 'bytes', fsPx ? '(title ' + Math.round(fsPx) + 'px)' : ''));
    if (s.jpg) {
        const j = await sharp(buf).resize(s.jpg[2], s.jpg[2], { kernel: 'lanczos3' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
        console.log('wrote', path.relative(REPO, write(outDir || s.jpg[0], s.jpg[1], j)), j.length, 'bytes');
        if (!outDir) (s.jpgCopies || []).forEach((d) => console.log('wrote', path.relative(REPO, write(d, s.jpg[1], j)), '(same picture)'));
    }
    if (s.ico) {
        const sizes = s.ico[2];
        const pngs = await Promise.all(sizes.map((z) => sharp(buf).resize(z, z, { kernel: 'lanczos3' }).png().toBuffer()));
        const i = ico(sizes, pngs);
        console.log('wrote', path.relative(REPO, write(outDir || s.ico[0], s.ico[1], i)), i.length, 'bytes (' + sizes.join('/') + ')');
        if (!outDir) (s.icoCopies || []).forEach(([d, f]) => console.log('wrote', path.relative(REPO, write(d, f, i)), '(same picture)'));
        if (outDir) pngs.forEach((b, n) => write(outDir, 'icon_' + sizes[n] + '.png', b));
    }
}

// Vista-style .ico: a directory of embedded PNGs, which every Windows
// since reads for exe and shortcut icons alike.
function ico(sizes, pngs) {
    const head = Buffer.alloc(6);
    head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    const dir = Buffer.alloc(16 * sizes.length);
    let off = 6 + 16 * sizes.length;
    sizes.forEach((z, i) => {
        const o = 16 * i;
        dir.writeUInt8(z >= 256 ? 0 : z, o); dir.writeUInt8(z >= 256 ? 0 : z, o + 1);
        dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
        dir.writeUInt32LE(pngs[i].length, o + 8); dir.writeUInt32LE(off, o + 12);
        off += pngs[i].length;
    });
    return Buffer.concat([head, dir].concat(pngs));
}

(async () => {
    const args = process.argv.slice(2);
    const oi = args.indexOf('--out');
    const outDir = oi >= 0 ? path.resolve(args[oi + 1]) : null;
    const rest = oi < 0 ? args : args.filter((a, i) => i !== oi && i !== oi + 1);
    const unknown = rest.filter((a) => !SLOTS[a]);
    if (unknown.length) { console.error('unknown slot(s):', unknown.join(' '), '- slots are', Object.keys(SLOTS).join(', ')); process.exit(2); }
    const names = rest.length ? rest : Object.keys(SLOTS);

    if (!fs.existsSync(GROUND)) {
        execFileSync(process.execPath, [path.join(__dirname, 'theme', 'bake-deco-sunburst.js'), '--scale', '1.6', '--out', GROUND], { stdio: 'inherit' });
    }
    if (!fs.existsSync(GROUND_ICON)) {
        execFileSync(process.execPath, [path.join(__dirname, 'theme', 'bake-deco-sunburst.js'), '--square', '1200', '--out', GROUND_ICON], { stdio: 'inherit' });
    }
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const profile = path.join(os.tmpdir(), 'fluid-deco-capsule-profile-' + process.pid);
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=3400,2000', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', url
    ], { stdio: 'ignore' });
    let page = null, code = 0;
    try {
        for (let i = 0; i < 80 && !(await portUp()); i++) await sleep(250);
        page = await connect(PORT);
        await waitReady(page, { timeoutMs: 90000 });
        // PhotoSafe's first-run modal, then the boot splash, which the app
        // removes once it has dissolved.
        await page.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; return 1; })()");
        for (let i = 0; i < 120; i++) {
            if (await page.eval("!document.getElementById('splash-screen')").catch(() => false)) break;
            await sleep(250);
        }
        await sleep(1000);
        for (const name of names) {
            try { await bake(page, name, outDir); }
            catch (e) { console.error('ERROR baking', name + ':', e && e.stack || e); code = 1; }
        }
    } finally {
        try { if (page) await Promise.race([page.send('Browser.close', {}), sleep(3000)]); } catch (_) {}
        await sleep(800);
        try { if (page) page.close(); } catch (_) {}
        try { chrome.kill(); } catch (_) {}
        await sleep(400);
        try { spawn('taskkill', ['/F', '/T', '/PID', String(chrome.pid)], { stdio: 'ignore' }); } catch (_) {}
        await sleep(600);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
        srv.close();
    }
    process.exit(code);
})();
