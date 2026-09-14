// ═══════════════════════════════════════════════════════════════════
// scripts/bake-demo-capsules.js — bakes the Steam DEMO app's store capsules
// and library assets out of the real app, headless:
//
//   store     header 920 x 430   small 462 x 174   main 1232 x 706
//   library   capsule 600 x 900  header 920 x 430 (= the store header)
//             hero 3840 x 1240   logo 1280 wide, transparent
//
//   node scripts/bake-demo-capsules.js                  (everything)
//   node scripts/bake-demo-capsules.js small hero logo  (just those)
//   node scripts/bake-demo-capsules.js main --spiral    (main, swirled variant)
//
// Writes steam/demo-store-assets/ and steam/demo-library-assets/. Serves the
// repo itself on a free port and drives a throwaway-profile headless Chrome,
// one per slot (the app arms onbeforeunload once it has painted, and headless
// would hang on it — never reload, relaunch).
//
// THE PICTURE is made the way the title was first made by hand in the app
// (2026-09-14): two Text lines, "Swirl Together Demo" in red over cyan, each
// on a pour-where-arranged hotkey. Both keys are held while the Pressure
// brush pushes the fluid apart above and below the lines, so each line's
// colour streams off it. The lines build in each other's places (cyan on
// top) and swap back for the title, so the finished red line sits against
// cyan and the cyan line against red. Then the keys come up, the fluid is
// frozen (Space), and the keys go down again, so the title lands crisp in
// the seam between the two colours, the pour's own shadow outlining it. Cap
// Color and Surface Shading are on, the ground is black. Nothing is drawn on
// top: the capture is the canvas as the app shows it (text overlays stay
// hidden, the letters are dye), minus the canvas resize handles.
//
// Rendered at 2x the slot size and resolved 2x2 to it, so the shading's
// fine relief is antialiased rather than aliased. The hero is the exception
// (1x — it is already 3840 wide).
//
// SLOT RULES worth knowing before editing
//   · Valve: demo capsules must make it clear the app is a demo
//     (partner.steamgames.com/doc/store/application/demos), and base capsules
//     may carry only artwork, the game name and an official subtitle
//     (.../doc/store/assets/rules). The demo's name IS "Swirl Together Demo".
//   · The small capsule's logo should nearly fill it: the lines span 92% of
//     its width there, and it bakes at half the dye resolution so the pour's
//     outline (a fixed 4 dye texels) stays as heavy, relative to the letters,
//     as it is on the big two.
//   · Library hero: NO text or logo — Steam lays the library logo over it.
//     So nothing is poured there: two rows of plain brush dabs in the lines'
//     colours stand in for the lines, and they stop early so the pushes can
//     clear a dark band across the middle for the logo to sit on.
//   · Library logo: transparent, the logo and nothing else, 1280 wide. It is
//     drawn by the Text feature's own renderer (textOverlays.compositeOntoCanvas,
//     the routine that puts text into exports and builds every pour's stamp),
//     not captured from the canvas: the app's transparent mode keys alpha off
//     brightness, which would turn the dark outline invisible.
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
const PORT = 9338;
const STORE_DIR = path.join(REPO, 'steam', 'demo-store-assets');
const LIB_DIR = path.join(REPO, 'steam', 'demo-library-assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per slot: where it goes, its size, how wide the title runs, and the dye
// resolution (see the outline note above). Everything else is shared, in
// canvas fractions or font sizes, so the set reads as one.
const SLOTS = {
    header: { dir: STORE_DIR, file: 'capsule_header_920x430.png', slot: [920, 430], textW: 0.76, dye: '1024',
              // Steam: the library header should match the library capsule's
              // art, and falls back to the store header when unset. Same job,
              // same shape — one bake, two files.
              copies: [[LIB_DIR, 'library_header_920x430.png']] },
    small:  { dir: STORE_DIR, file: 'capsule_small_462x174.png', slot: [462, 174], textW: 0.92, dye: '512' },
    main:   { dir: STORE_DIR, file: 'capsule_main_1232x706.png', slot: [1232, 706], textW: 0.76, dye: '1024' },
    // Portrait: each line of the title wraps after "Together", so the red
    // block and the cyan block are two lines each and the words stay big.
    // A third softer push: at full strength the tall frame's vortices lift
    // the red up behind the red block's second line, and the two colours
    // stop meeting BETWEEN the blocks.
    capsule: { dir: LIB_DIR, file: 'library_capsule_600x900.png', slot: [600, 900], textW: 0.86, dye: '1024',
               text: 'Swirl Together\nDemo', lineHeight: 0.95, rowCount: 6, pushScale: 0.66, window: '3000,2400' },
    // Laid out by HEIGHT (fontH, the header's letter size for its height):
    // sized by width, a 3.1:1 frame put the colour bands where the logo goes.
    hero:   { dir: LIB_DIR, file: 'library_hero_3840x1240.png', slot: [3840, 1240], k: 1, fontH: 0.165, dye: '2048',
              hero: true, rowCount: 16, window: '4800,1800' },
    logo:   { dir: LIB_DIR, logo: true, width: 1280, pad: 24 },
    // The icon: the doubled title cut down to one letter — a red S poured
    // over a cyan S set behind it, down and right — with a short swirl
    // trail, frozen, on black. The 512 PNG is the Shortcut Icon; the App
    // Icon is the same picture as a 184 JPG (Steam's app icon has no alpha,
    // and this one has none to lose).
    icon:   { dir: STORE_DIR, file: 'shortcut_icon_512x512.png', slot: [512, 512], dye: '1024', icon: true, text: 'S',
              jpg: ['app_icon_184x184.jpg', 184],
              // ...and the demo exe's own icon (scripts/dist-demo.js win.icon):
              // every size Windows asks an exe for, 256 down to 16.
              ico: [path.join(REPO, 'build'), 'icon-demo.ico', [256, 128, 64, 48, 32, 24, 16]] }
};

const RECIPE = {
    k: 2,                       // render scale; resolved 2x2 to the slot
    sim: '512',
    seed: 0x5EED,
    text: 'Swirl Together Demo',
    lineHeight: 1.2,            // the Text panel's default; only multi-line titles feel it
    lead: 0.833,                // line pitch in font sizes (85px lines 71px apart, as set by hand)
    lines: [ { color: '#fe0101', key: 'Semicolon' }, { color: '#00ffcc', key: 'Quote' } ],
    look: { checkboxes: { colorGate: true, displayShadingToggle: true }, colors: { background: '#000000', brush: '#00ffee' } },
    // Constant-flow Interval 8 ms = the held key's pour rate; slow fade so
    // the colour that streams off the lines is still bright at the shot.
    // No sub-stepping: the paced ticks below are ~33 ms apart, which would
    // otherwise buy two to three steps a tick and double the sim time — the
    // colour then floods both halves edge to edge (measured).
    config: { BRUSH_DAB_INTERVAL_MS: 8, DENSITY_DISSIPATION: 0.999, SIM_SUBSTEP: false },
    frames: 325,
    buildSwapped: true,         // lines start in each other's places (see the job)
    rowCount: 10,
    moves: [
        { type: 'press', key: 'Semicolon', from: 0 },
        { type: 'press', key: 'Quote', from: 0 },
        // Push apart: a row of Pressure dabs just above the top line pushing
        // up, one just below the bottom line pushing down.
        { type: 'row', from: 0, to: 200, x0: 0.10, x1: 0.90, side: 'top', off: 0.9, dy: -150, r: 0.003 },
        { type: 'row', from: 0, to: 200, x0: 0.10, x1: 0.90, side: 'bottom', off: 0.9, dy: 150, r: 0.003 },
        { type: 'release', key: 'Semicolon', from: 240 },
        { type: 'release', key: 'Quote', from: 240 },
        { type: 'freeze', from: 260 },
        { type: 'swap', from: 300 },
        { type: 'press', key: 'Semicolon', from: 305 },
        { type: 'press', key: 'Quote', from: 305 }
    ],
    // The hero: same build, but the "lines" are rows of plain dabs that stop
    // at 150 while the pushes run on to 220, so the middle empties out; no
    // title at the end.
    heroFrames: 300,
    heroMoves: [
        { type: 'press', key: 'Semicolon', from: 0 },
        { type: 'press', key: 'Quote', from: 0 },
        { type: 'row', from: 0, to: 220, x0: 0.06, x1: 0.94, side: 'top', off: 0.9, dy: -150, r: 0.003 },
        { type: 'row', from: 0, to: 220, x0: 0.06, x1: 0.94, side: 'bottom', off: 0.9, dy: 150, r: 0.003 },
        { type: 'release', key: 'Semicolon', from: 150 },
        { type: 'release', key: 'Quote', from: 150 },
        { type: 'freeze', from: 280 }
    ],
    // The icon: a ring of plain dabs at the edge — cyan round the top, red
    // round the bottom — given a short turn by a ring of Pressure dabs, so
    // it swirls into a frame; then freeze, and pour the two letters into the
    // dark middle. Kept short on purpose: the letters' own trails (first
    // try), or a longer turn, carry colour into the middle, and at 16px a
    // red S on red is gone.
    iconCap: 0.62,              // the S's ink height, as a share of the square
    iconOffset: 0.05,           // the cyan S sits this far down and right of the red one
    iconFrames: 110,
    iconMoves: [
        { type: 'ringdab', from: 0, to: 30, rad: 0.46, count: 28, r: 0.0010 },
        { type: 'ring', from: 0, to: 30, rad: 0.46, count: 12, speed: 110, r: 0.003 },
        { type: 'freeze', from: 50 },
        { type: 'press', key: 'Quote', from: 90 },
        { type: 'press', key: 'Semicolon', from: 90 }
    ]
};

// --spiral: the rows push harder at one end than the other (mirrored
// between top and bottom), which winds the two colours into one spiral
// around the title instead of two bands.
function spiralize(r) {
    r.moves = r.moves.map((m) => m.type !== 'row' ? m
        : Object.assign({}, m, { ramp: m.side === 'top' ? [0.7, 1.3] : [1.3, 0.7] }));
    return r;
}

// ── Page job: the picture ────────────────────────────────────────────
// Evaluated inside the app. Returns the canvas rect to clip the shot to.
const JOB = String(async function (R) {
    const raf = (n) => new Promise((res) => { (function t() { if (n-- <= 0) return res(); requestAnimationFrame(t); })(); });
    // Pace rAF to one sim step per tick. A period just over the 60 fps cap
    // means the cap never skips a tick, and with sub-stepping off (config
    // above) the 16 ms step clamp makes every frame below exactly one 16 ms
    // step, however long the tick really took.
    (function paceRaf(period) {
        const native = window.requestAnimationFrame.bind(window);
        let q = new Map(), id = 0, armed = false, last = performance.now();
        function flush(now) {
            armed = false;
            if (now - last < period) { armed = true; native(flush); return; }
            last = now;
            const cbs = Array.from(q.values()); q = new Map();
            for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } }
            if (q.size && !armed) { armed = true; native(flush); }
        }
        window.requestAnimationFrame = function (cb) { const i = ++id; q.set(i, cb); if (!armed) { armed = true; native(flush); } return i; };
        window.cancelAnimationFrame = function (i) { q.delete(i); };
    })(17);
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    try {
        // The resize handles straddle the canvas edge; they are UI, not picture.
        const st = document.createElement('style');
        st.textContent = '.resize-handle, .corner-lock, #canvas-size-display { display: none !important; }';
        document.head.appendChild(st);
        let seed = R.seed >>> 0 || 1;
        Math.random = function () { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

        try { if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false); } catch (_) {}
        const gov = document.getElementById('governorToggle');
        if (gov && gov.checked) { gov.checked = false; gov.dispatchEvent(new Event('change', { bubbles: true })); }
        set('visualResolution', R.dye);
        set('physicsResolution', R.sim);

        const W = R.slot[0] * R.k, H = R.slot[1] * R.k;
        const wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = W + 'px'; wrap.style.height = H + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        await raf(14);
        const cv = document.getElementById('canvas');
        let cr = cv.getBoundingClientRect();
        if (Math.round(cr.width) !== W || Math.round(cr.height) !== H) {
            return { error: 'canvas box came out ' + cr.width + 'x' + cr.height + ', wanted ' + W + 'x' + H + ' (widen the window)' };
        }

        window.applyPresetSnapshotFull(JSON.parse(JSON.stringify(R.look)));
        await raf(4);
        Object.assign(window.config, R.config);
        window.clearCanvas();
        await raf(3);

        // The title's geometry. Font size from the widest line; a block of L
        // lines is one overlay, and the blocks sit one single-line pitch
        // apart (the last line of one to the first of the next).
        const area = document.getElementById('canvas-area').getBoundingClientRect();
        cr = cv.getBoundingClientRect();
        const fam = window.textOverlays.DEFAULTS.fontFamily;
        const m = document.createElement('canvas').getContext('2d');
        m.font = '700 100px ' + fam;
        const rows = R.text.split('\n');
        const widest = Math.max.apply(null, rows.map((s) => m.measureText(s).width));
        let fontSize = R.fontH ? Math.round(R.fontH * H) : Math.round(100 * (R.textW * W) / widest);
        const inner = (rows.length - 1) * R.lineHeight;       // block height past one line, in font sizes
        const pitch = (inner + R.lead) * fontSize;
        const n = R.lines.length;
        const lineY = (i) => 0.5 + (i - (n - 1) / 2) * pitch / H;
        const areaY = (i) => (cr.top - area.top + lineY(i) * cr.height) / area.height;
        // The lines build in each other's places (cyan on top, red below) and
        // swap back for the title, so each finished line sits in the OTHER
        // colour: red letters on cyan, cyan letters on red.
        let swapped = !!R.buildSwapped;
        const slotOf = (i) => swapped ? n - 1 - i : i;
        window.textOverlays.clearAll();
        const addLine = (L, x, y) => window.textOverlays.add({
            content: R.text, x: x, y: y,
            fontSize: fontSize, fontWeight: '700', fontFamily: fam, color: L.color,
            lineHeight: R.lineHeight, shadow: true, collider: false, visible: false,
            hotkey: L.key, hotkeyAction: 'pour', hotkeyAt: 'arranged'
        }).id;
        let ids = [];
        if (R.icon) {
            // Size the S by its INK, and place each by its ink centre (a line
            // is laid out by its advance and baseline, which sit the glyph off
            // centre). The red S sits up-left of centre, the cyan down-right.
            m.font = '700 100px ' + fam;
            let t = m.measureText(R.text);
            fontSize = Math.round(100 * R.iconCap * H / (t.actualBoundingBoxAscent + t.actualBoundingBoxDescent));
            m.font = '700 ' + fontSize + 'px ' + fam;
            t = m.measureText(R.text);
            const inkX = -t.width / 2 + (t.actualBoundingBoxRight - t.actualBoundingBoxLeft) / 2;
            const inkY = (t.fontBoundingBoxAscent - t.fontBoundingBoxDescent) / 2 + (t.actualBoundingBoxDescent - t.actualBoundingBoxAscent) / 2;
            const at = (s) => ({
                x: (cr.left - area.left + W / 2 + s * R.iconOffset * W - inkX) / area.width,
                y: (cr.top - area.top + H / 2 + s * R.iconOffset * H - inkY) / area.height
            });
            // Cyan first: a held key pours in line-id order, so the red S,
            // added second, lands on top of the cyan every tick.
            const cyan = at(0.5), red = at(-0.5);
            ids[1] = addLine(R.lines[1], cyan.x, cyan.y);
            ids[0] = addLine(R.lines[0], red.x, red.y);
        } else if (!R.hero) {
            ids = R.lines.map((L, i) => addLine(L, (cr.left - area.left + 0.5 * cr.width) / area.width, areaY(slotOf(i))));
        }
        await raf(3);

        // A Pressure dab: the velocity-only brush, which moves paint without
        // laying any down.
        const push = (fx, fy, dx, dy, r) => {
            const was = window.config.BRUSH_VELOCITY_ONLY;
            window.config.BRUSH_VELOCITY_ONLY = true;
            try { window.applyMultiSplatWith(fx * cv.width, fy * cv.height, dx, dy, [0, 0, 0], 1, r, false); }
            finally { window.config.BRUSH_VELOCITY_ONLY = was; }
        };
        // A plain dab of colour, no push: the hero's stand-in for a line.
        const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
        const dab = (fx, fy, c, r) => window.applyMultiSplatWith(fx * cv.width, fy * cv.height, 0, 0, c, 1, r, true);
        // What pressing and holding a line's key does (js/48-hotkeys.js).
        // On the hero a held "key" is a row of dabs instead, every frame.
        const held = {};
        const press = (key) => {
            if (R.hero) { held[key] = true; return; }
            held[key] = window.Hotkeys.find(key); held[key].forEach((h) => h.run(null));
        };
        const release = (key) => {
            if (!R.hero) (held[key] || []).forEach((h) => { try { h.release(null); } catch (_) {} });
            delete held[key];
        };
        const moves = R.hero ? R.heroMoves : R.icon ? R.iconMoves : R.moves;
        const frames = R.hero ? R.heroFrames : R.icon ? R.iconFrames : R.frames;

        for (let frame = 0; frame < frames; frame++) {
            if (R.hero) {
                R.lines.forEach((L, i) => {
                    if (!held[L.key]) return;
                    const y = lineY(slotOf(i)), c = rgb(L.color);
                    for (let j = 0; j < 24; j++) dab(0.12 + 0.76 * j / 23, y, c, 0.0018);
                });
            }
            for (const mv of moves) {
                const from = mv.from || 0;
                if (mv.type === 'press' && frame === from) press(mv.key);
                else if (mv.type === 'release' && frame === from) release(mv.key);
                else if (mv.type === 'freeze' && frame === from) { if (!window.__fluidFrozen) window.toggleFreeze(); }
                else if (mv.type === 'swap' && frame === from) {
                    swapped = !swapped;
                    ids.forEach((id, i) => window.textOverlays.update(id, { y: areaY(slotOf(i)) }));
                }
                else if (mv.type === 'ringdab' && frame >= from && frame < mv.to) {
                    // Plain dabs round a circle: the top half in the second
                    // line's colour (cyan), the bottom half in the first's (red).
                    for (let i = 0; i < mv.count; i++) {
                        const a = i / mv.count * Math.PI * 2;
                        dab(0.5 + Math.cos(a) * mv.rad * H / W, 0.5 + Math.sin(a) * mv.rad,
                            rgb(Math.sin(a) < 0 ? R.lines[1].color : R.lines[0].color), mv.r);
                    }
                }
                else if (mv.type === 'ring' && frame >= from && frame < mv.to) {
                    // A ring of Pressure dabs pushing along the circle: a vortex.
                    for (let i = 0; i < mv.count; i++) {
                        const a = i / mv.count * Math.PI * 2;
                        push(0.5 + Math.cos(a) * mv.rad * H / W, 0.5 + Math.sin(a) * mv.rad,
                             -Math.sin(a) * mv.speed, Math.cos(a) * mv.speed, mv.r);
                    }
                }
                else if (mv.type === 'row' && frame >= from && frame < mv.to) {
                    const edge = (inner / 2 + mv.off) * fontSize / H;
                    const y = mv.side === 'top' ? lineY(0) - edge : lineY(n - 1) + edge;
                    const count = R.rowCount;
                    for (let i = 0; i < count; i++) {
                        const u = i / (count - 1);
                        const k = mv.ramp ? mv.ramp[0] + (mv.ramp[1] - mv.ramp[0]) * u : 1;
                        push(mv.x0 + (mv.x1 - mv.x0) * u, y, (mv.dx || 0) * k, (mv.dy || 0) * k, mv.r);
                    }
                }
            }
            await raf(1);
        }
        // The keys stay down through the shot: on a frozen canvas every pour
        // lands on the last, so the title is as crisp as it gets.
        await raf(2);
        cr = cv.getBoundingClientRect();
        return { rect: { x: cr.left, y: cr.top, width: cr.width, height: cr.height }, fontSize: fontSize,
                 dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION };
    } catch (e) {
        return { error: String(e && e.stack || e) };
    }
});

// ── Page job: the library logo ───────────────────────────────────────
// The two lines as Text lines, drawn by the Text feature's own composite
// onto a transparent canvas, sized so the logo plus its margin is exactly
// `width` across. Returns a PNG, trimmed to the ink (shadow included).
const LOGO = String(async function (R, width, pad) {
    try {
        const fam = window.textOverlays.DEFAULTS.fontFamily;
        const AW = 3000, AH = 1400;                    // scratch "canvas area"
        function draw(fontSize) {
            window.textOverlays.clearAll();
            const pitch = R.lead * fontSize;
            R.lines.forEach((L, i) => window.textOverlays.add({
                content: R.text, x: 0.5, y: 0.5 + (i - (R.lines.length - 1) / 2) * pitch / AH,
                fontSize: fontSize, fontWeight: '700', fontFamily: fam, color: L.color,
                shadow: true, collider: false, visible: true
            }));
            const c = document.createElement('canvas');
            c.width = AW; c.height = AH;
            const ctx = c.getContext('2d');
            window.textOverlays.compositeOntoCanvas(ctx, { width: AW, height: AH, areaWidth: AW, areaHeight: AH, offsetX: 0, offsetY: 0 });
            const d = ctx.getImageData(0, 0, AW, AH).data;
            let x0 = AW, x1 = -1, y0 = AH, y1 = -1;
            for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
                if (d[(y * AW + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
            return { c: c, x0: x0, y0: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        }
        // Solve for the size: ink + margins = width. Two passes land it to
        // within a pixel; the last pixel goes to the margin.
        let size = 120, b = null;
        for (let i = 0; i < 4; i++) {
            b = draw(size);
            const want = width - 2 * pad;
            if (Math.abs(b.w - want) <= 1) break;
            size = size * want / b.w;
        }
        const out = document.createElement('canvas');
        out.width = width; out.height = b.h + 2 * pad;
        out.getContext('2d').drawImage(b.c, b.x0, b.y0, b.w, b.h, Math.round((width - b.w) / 2), pad, b.w, b.h);
        window.textOverlays.clearAll();
        return { png: out.toDataURL('image/png').split(',')[1], w: out.width, h: out.height, fontSize: +size.toFixed(1) };
    } catch (e) {
        return { error: String(e && e.stack || e) };
    }
});

// 2x2 box resolve of the capture to the slot size, done in the page so the
// script needs no image library.
const RESOLVE = String(async function (b64, W, H) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const src = x.getImageData(0, 0, img.width, img.height).data;
    const o = document.createElement('canvas');
    o.width = W; o.height = H;
    const ox = o.getContext('2d');
    const od = ox.createImageData(W, H), d = od.data;
    const kx = img.width / W, ky = img.height / H;
    for (let y = 0; y < H; y++) {
        for (let xx = 0; xx < W; xx++) {
            let r = 0, g = 0, b = 0, n = 0;
            for (let sy = Math.floor(y * ky); sy < Math.floor((y + 1) * ky); sy++) {
                for (let sx = Math.floor(xx * kx); sx < Math.floor((xx + 1) * kx); sx++) {
                    const i = (sy * img.width + sx) * 4;
                    r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
                }
            }
            const j = (y * W + xx) * 4;
            d[j] = r / n; d[j + 1] = g / n; d[j + 2] = b / n; d[j + 3] = 255;
        }
    }
    ox.putImageData(od, 0, 0);
    return o.toDataURL('image/png').split(',')[1];
});

// A square PNG down to a size x size JPG on black (the App Icon): halve
// with smoothing while it is still over twice the target, then one last
// step, so the letterforms stay clean instead of aliasing.
const TO_JPG = String(async function (b64, size) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    let src = img, w = img.width;
    while (w / 2 >= size) {
        const c = document.createElement('canvas');
        c.width = c.height = Math.round(w / 2);
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, 0, 0, c.width, c.height);
        src = c; w = c.width;
    }
    const o = document.createElement('canvas');
    o.width = o.height = size;
    const ox = o.getContext('2d');
    ox.fillStyle = '#000';
    ox.fillRect(0, 0, size, size);
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(src, 0, 0, size, size);
    return o.toDataURL('image/jpeg', 0.92).split(',')[1];
});

// The square PNG at each size an .ico carries, as PNGs (base64), each
// halved with smoothing from the one above so small sizes stay clean.
const TO_SIZES = String(async function (b64, sizes) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const out = [];
    for (const size of sizes) {
        let src = img, w = img.width;
        while (w / 2 >= size) {
            const c = document.createElement('canvas');
            c.width = c.height = Math.round(w / 2);
            const x = c.getContext('2d');
            x.imageSmoothingQuality = 'high';
            x.drawImage(src, 0, 0, c.width, c.height);
            src = c; w = c.width;
        }
        const o = document.createElement('canvas');
        o.width = o.height = size;
        const ox = o.getContext('2d');
        ox.imageSmoothingQuality = 'high';
        ox.drawImage(src, 0, 0, size, size);
        out.push(o.toDataURL('image/png').split(',')[1]);
    }
    return out;
});

// Vista-style .ico: a directory of embedded PNGs, which every Windows
// since reads for exe and shortcut icons alike.
function ico(sizes, pngs) {
    const head = Buffer.alloc(6);
    head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    const dir = Buffer.alloc(16 * sizes.length);
    let off = 6 + 16 * sizes.length;
    sizes.forEach((s, i) => {
        const o = 16 * i;
        dir.writeUInt8(s >= 256 ? 0 : s, o); dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
        dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
        dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
        dir.writeUInt32LE(pngs[i].length, o + 8); dir.writeUInt32LE(off, o + 12);
        off += pngs[i].length;
    });
    return Buffer.concat([head, dir].concat(pngs));
}

// ── Static server over the repo ──────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise((res) => {
        const srv = http.createServer((req, rsp) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const f = path.join(REPO, p);
            if (!f.startsWith(REPO)) { rsp.writeHead(403); rsp.end(); return; }
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

async function bakeSlot(name, url, spiral) {
    const s = SLOTS[name];
    const recipe = Object.assign(JSON.parse(JSON.stringify(RECIPE)), s);
    if (spiral) spiralize(recipe);
    // Per-slot tempering of the shared build: a softer push, or the keys up
    // (and the pushes stopped) sooner.
    recipe.moves = recipe.moves.map((m) => {
        if (m.type === 'row') {
            m = Object.assign({}, m, { dy: m.dy * (s.pushScale || 1) });
            if (s.buildEnd) m.to = s.buildEnd;
        }
        if (m.type === 'release' && s.buildEnd) m = Object.assign({}, m, { from: s.buildEnd });
        return m;
    });
    const profile = path.join(require('os').tmpdir(), 'fluid-capsule-profile-' + process.pid + '-' + name);
    const chrome = spawn(CHROME, [
        '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
        '--window-size=' + (s.window || '3000,1900'), '--force-device-scale-factor=1', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        url
    ], { stdio: 'ignore' });
    let page = null;
    try {
        for (let i = 0; i < 80 && !(await portUp()); i++) await sleep(250);
        page = await connect(PORT);
        await waitReady(page, { timeoutMs: 90000 });
        for (let i = 0; i < 80; i++) {
            const ok = await page.eval("!!document.getElementById('mixer-strip') && !!window.textOverlays && !!window.Hotkeys").catch(() => false);
            if (ok) break;
            await sleep(250);
        }
        // PhotoSafe's first-run modal, then the web splash, which dissolves
        // off the running app and is removed; the panels slide in after it.
        await page.eval("(function(){ try{localStorage.setItem('fluidui.photoWarn.ack.v1','1');}catch(_){} var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; return 1; })()");
        for (let i = 0; i < 120; i++) {
            if (await page.eval("!document.getElementById('splash-screen')").catch(() => false)) break;
            await sleep(250);
        }
        await sleep(1500);
        await page.eval("(function(){ var pw=document.getElementById('photoWarn'); if(pw) pw.hidden=true; var b=document.getElementById('pauseBtn'); if(b && b.textContent.trim()==='\u25B6' && window.togglePause) window.togglePause(); return 1; })()");

        if (s.logo) {
            const info = await page.eval('(' + LOGO + ')(' + JSON.stringify(recipe) + ',' + s.width + ',' + s.pad + ')', { timeoutMs: 120000 });
            if (!info || info.error) throw new Error(info ? info.error : 'no result from the page');
            const f = write(s.dir, 'library_logo_' + info.w + 'x' + info.h + '.png', Buffer.from(info.png, 'base64'));
            console.log('wrote', path.relative(REPO, f), fs.statSync(f).size, 'bytes; font', info.fontSize + 'px');
            return;
        }

        const info = await page.eval('(' + JOB + ')(' + JSON.stringify(recipe) + ')', { timeoutMs: 300000 });
        if (!info || info.error) throw new Error(info ? info.error : 'no result from the page');
        const r = info.rect;
        const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 } });
        const k = recipe.k;
        const b64 = k === 1 ? shot.data
            : await page.eval('(' + RESOLVE + ')(' + JSON.stringify(shot.data) + ',' + s.slot[0] + ',' + s.slot[1] + ')', { timeoutMs: 120000 });
        const buf = Buffer.from(b64, 'base64');
        const file = spiral ? s.file.replace(/\.png$/, '_spiral.png') : s.file;
        const f = write(s.dir, file, buf);
        console.log('wrote', path.relative(REPO, f), buf.length, 'bytes;',
            'font', info.fontSize + 'px @' + k + 'x, dye', info.dye, 'sim', info.sim);
        if (!spiral) (s.copies || []).forEach((c) => {
            const g = write(c[0], c[1], buf);
            console.log('wrote', path.relative(REPO, g), '(same picture)');
        });
        if (s.jpg && !spiral) {
            const jb64 = await page.eval('(' + TO_JPG + ')(' + JSON.stringify(b64) + ',' + s.jpg[1] + ')', { timeoutMs: 60000 });
            const j = write(s.dir, s.jpg[0], Buffer.from(jb64, 'base64'));
            console.log('wrote', path.relative(REPO, j), fs.statSync(j).size, 'bytes (same picture, JPG)');
        }
        if (s.ico && !spiral) {
            const sizes = s.ico[2];
            const list = await page.eval('(' + TO_SIZES + ')(' + JSON.stringify(b64) + ',' + JSON.stringify(sizes) + ')', { timeoutMs: 60000 });
            const i = write(s.ico[0], s.ico[1], ico(sizes, list.map((x) => Buffer.from(x, 'base64'))));
            console.log('wrote', path.relative(REPO, i), fs.statSync(i).size, 'bytes (' + sizes.join('/') + ')');
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
    }
}

(async () => {
    const args = process.argv.slice(2);
    const spiral = args.includes('--spiral');
    const wanted = args.filter((a) => SLOTS[a]);
    const names = wanted.length ? wanted : Object.keys(SLOTS);
    const unknown = args.filter((a) => !SLOTS[a] && a !== '--spiral');
    if (unknown.length) { console.error('unknown argument(s):', unknown.join(' '), '— slots are', Object.keys(SLOTS).join(', ')); process.exit(2); }
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    let code = 0;
    for (const name of names) {
        try { await bakeSlot(name, url, spiral); }
        catch (e) { console.error('ERROR baking', name + ':', e && e.stack || e); code = 1; }
    }
    srv.close();
    process.exit(code);
})();
