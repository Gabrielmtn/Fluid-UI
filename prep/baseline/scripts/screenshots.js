// prep/baseline/scripts/screenshots.js — F1 baseline: pixel screenshots of the
// shipping UI at four widths, for the Walnut & Copper prep
// (prep/briefs/F-baselines.md, F1). Later CSS prep steps are gated on a zero
// pixel diff against these; this script decides nothing and changes nothing
// outside prep/.
//
//   node prep/baseline/scripts/screenshots.js            capture -> prep/baseline/screenshots/<width>/*.png + manifest.json
//   node prep/baseline/scripts/screenshots.js --check    re-capture into prep/work/screenshots-check/ and compare every
//                                                        PNG pixel for pixel (sharp, raw RGBA); a diff PNG per mismatch
//                                                        under prep/baseline/screenshots/_diff/; exit 1 on any mismatch
//   WIDTHS=1440,1920 node ...                            limit the widths (debugging)
//   OUT=<dir> node ...                                   write the capture somewhere else (experiments)
//   CHROME_ARGS="--a --b" node ...                       replace the default extra Chrome flags (CHROME_ARGS="" = none)
//
// Raster pin: Chrome runs with --disable-gpu-compositing by default (capture
// and --check alike). With GPU compositing on, three fresh-process captures at
// 1440 differed by 67-1306 px per pair, every pixel by exactly 1/255 inside
// gradients, antialiased text and rounded corners; with compositing in
// software the three were bit-identical (prep/work/screenshots-check/exp/,
// log.txt + <set>/pairs.json). WebGL still runs on the GPU (ANGLE D3D11, the
// renderer string is recorded per width) and its frames are read back into the
// software compositor; simProbe below proves the sim canvas still reaches the
// screenshot. --check fails when the flags differ from the baseline's.
//
// Caret pin: a focused text field shows a blinking caret on Blink's own timer
// (not rAF, so the freeze does not hold it); the Swirl Together section
// focuses its "Paste a code" field, and one run in nine caught the caret
// on. A capture-side style (caret-color: transparent, as Playwright does by
// default) hides carets in every shot; focus rings are untouched.
//
// Boots the web build in its own headless Chrome through the repo driver
// (scripts/test/radial-menu/driver.js: own static server, scratch profile with
// PhotoSafe / the startup fork / the first-run hint already answered, trusted
// input over CDP), closed in a finally. Never attaches to port 9333.
//
// Per width: Emulation.setDeviceMetricsOverride (DPR 1), a reload on a wiped
// scratch localStorage (so every width boots the app as it ships, and nothing a
// previous width toggled is autoloaded), wait for the splash and the .ui-enter
// entrance animations, then the deterministic canvas: scripts/test/harness.js
// is injected, __test.freeze() takes over requestAnimationFrame and
// performance.now (the nav idle glow, Breathing and the brush ghost all run on
// rAF and only advance when __test.step() pumps a frame), __test.seed() pins
// Math.random, __test.clear() wipes dye, velocity, pressure and wetness, and
// the FPS Limit select is pinned to a 60 Hz screen (see pinFpsCap). Every
// interaction below is a trusted click or key on the real control, followed by
// the same number of pumped frames, so the sequence is the same on every run.
//
// Nothing here calls an app setter that persists (GUIDANCE.md §2b): state
// changes are trusted clicks on real controls inside the scratch profile,
// which is wiped before every load and deleted by the driver on close.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');
const { boot, sleep } = require('../../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../../..');
const BASE_DIR = path.join(ROOT, 'prep', 'baseline', 'screenshots');
const DIFF_DIR = path.join(BASE_DIR, '_diff');
const CHECK = process.argv.includes('--check');
// OUT=<dir> writes the capture somewhere else (experiments; --check still compares against the baseline).
const OUT_DIR = process.env.OUT ? path.resolve(ROOT, process.env.OUT) : (CHECK ? path.join(ROOT, 'prep', 'work', 'screenshots-check') : BASE_DIR);
const HARNESS = fs.readFileSync(path.join(ROOT, 'scripts', 'test', 'harness.js'), 'utf8');

const ALL_WIDTHS = [[1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];
const WIDTHS = process.env.WIDTHS
    ? ALL_WIDTHS.filter(w => process.env.WIDTHS.split(',').map(Number).includes(w[0]))
    : ALL_WIDTHS;

// The scratch profile's localStorage before every load: the driver's three
// keys (PhotoSafe ack, startup fork, first-run hint) plus the one-time
// Reset-app note (js/60-reset-app.js, shown ~4 s after a quiet boot for 30 s;
// F0 found it in one capture and not the next).
const SEED = { 'fluidui.photoWarn.ack.v1': '1', 'fluidui.uiFork.skip': '1', 'fluidFirstRunDone': '1', 'swirlResetHint.v1': '1' };
const RNG_SEED = 0xBEEF;
const FRAMES_PER_STEP = 2;      // virtual frames pumped after every interaction
// Extra Chrome flags on top of the driver's, passed through boot({ args }).
// Default: the raster pin (see the header). CHROME_ARGS="--a --b" replaces it, for experiments.
const DEFAULT_CHROME_ARGS = ['--disable-gpu-compositing'];
const CHROME_ARGS = process.env.CHROME_ARGS !== undefined ? process.env.CHROME_ARGS.split(/\s+/).filter(Boolean) : DEFAULT_CHROME_ARGS.slice();
// Injected once per load, before any shot (capture side only; the app is not touched).
// Motion pin: CSS transitions and animations run on the real clock, which the
// harness freeze does not hold, so a shot could catch a drawer front's lift or a
// pane's glow mid-ease (Walnut & Copper, 2026-10-17). Every shot is of the
// settled state, the same as Playwright's animations: 'disabled'.
const CARET_PIN_CSS = '*, *::before, *::after { caret-color: transparent !important; transition: none !important; animation: none !important; }';

const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
function log(msg) { console.log(msg); }
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ─── page helpers ────────────────────────────────────────────────────────────
// A rect in viewport CSS px (what Input.dispatchMouseEvent and the screenshot
// clip take; with CSS zoom on the bars getBoundingClientRect is already in
// those units, verified at 1920: #mixer-strip spans innerWidth).
async function rectOf(d, expr) {
    return d.ev(`(function(){ var el = ${expr}; if (!el) return null; var r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), visible: !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') }; })()`);
}
async function centreOf(d, expr) {
    // Scroll the element into view instantly (the right bar has
    // scroll-behavior: smooth, css/21-sidebar.css:43) and return its centre.
    return d.ev(`(function(){ var el = ${expr}; if (!el) return null; try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) { el.scrollIntoView(); }
        var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), visible: !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') }; })()`);
}
async function waitAnimations(d, ms) {
    const t0 = Date.now();
    let n = -1;
    while (Date.now() - t0 < ms) {
        n = await d.ev('document.getAnimations().length').catch(() => -1);
        if (n === 0) break;
        await sleep(100);
    }
    return n;
}
// Anything still animating after the wait is a looping CSS animation on the
// compositor's clock (not under the freeze): pause it at its first frame and
// record it, so the shot is the same every run.
async function pinLoopingAnimations(d, where, out) {
    const pinned = await d.ev(`(function(){ return document.getAnimations().map(function (a) { var t = a.effect && a.effect.target; var name = (a.animationName || a.transitionProperty || a.constructor.name);
        a.pause(); try { a.currentTime = 0; } catch (_) {} return name + ' on ' + (t ? (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (t.className && typeof t.className === 'string' ? '.' + t.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : '?'); }); })()`);
    if (pinned.length) { out.push({ where, pinned }); log('  pinned ' + pinned.length + ' looping animation(s) at ' + where + ': ' + pinned.join('; ')); }
    return pinned;
}
// After every interaction: pump the virtual clock (rAF-driven UI work such as
// the brush ghost, slider fills and the display pass runs now), let CSS
// transitions finish, pin anything that loops, then a short real-time settle.
async function settle(d, where, out) {
    await d.ev(`window.__test ? window.__test.step(${FRAMES_PER_STEP}) : 1`);
    const n = await waitAnimations(d, 2500);
    if (n !== 0) await pinLoopingAnimations(d, where, out.animationPins);
    await sleep(150);
}
// The pointer rests off the page between shots: no :hover anywhere, and no
// brush ghost (it shows on the canvas's pointerenter, js/31-brush-cursor.js:818).
async function park(d) { await d.move(-5, -5); await sleep(40); }

async function shoot(d, out, widthDir, name, clip, meta) {
    const params = { format: 'png' };
    let c = null;
    if (clip) {
        c = { x: Math.max(0, clip.x), y: Math.max(0, clip.y) };
        c.w = Math.max(1, Math.min(clip.w, out.env.innerWidth - c.x));
        c.h = Math.max(1, Math.min(clip.h, out.env.innerHeight - c.y));
        params.clip = { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 };
    }
    const r = await d.send('Page.captureScreenshot', params);
    const buf = Buffer.from(r.data, 'base64');
    const file = path.join(widthDir, name + '.png');
    fs.writeFileSync(file, buf);
    const m = await sharp(buf).metadata();
    const rec = Object.assign({ file: path.relative(BASE_DIR, path.join(BASE_DIR, path.basename(widthDir), name + '.png')).replace(/\\/g, '/'), clip: c, png: { width: m.width, height: m.height } }, meta || {});
    out.shots.push(rec);
    log('  shot ' + name + ' ' + m.width + 'x' + m.height + (c ? ' (clip ' + c.x + ',' + c.y + ' ' + c.w + 'x' + c.h + ')' : ''));
    return rec;
}

// The canvas region of a fresh screenshot (not saved): pixels brighter than
// 24 in any channel, and the brightest channel value.
async function canvasStats(d, r, env) {
    if (!r || !r.w || !r.h) return null;
    const c = { x: Math.max(0, r.x), y: Math.max(0, r.y) };
    c.w = Math.max(1, Math.min(r.w, env.innerWidth - c.x)); c.h = Math.max(1, Math.min(r.h, env.innerHeight - c.y));
    const s = await d.send('Page.captureScreenshot', { format: 'png', clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 } });
    const img = await sharp(Buffer.from(s.data, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let lit = 0, max = 0;
    for (let p = 0; p < img.data.length; p += 3) {
        const m = Math.max(img.data[p], img.data[p + 1], img.data[p + 2]);
        if (m > 24) lit++; if (m > max) max = m;
    }
    return { lit, max, px: img.info.width * img.info.height };
}

// The FPS Limit select (Simulation) builds its options from the refresh rate
// the app measures over rAF at boot (js/05i-sim-stats.js:1289-1309); headless
// Chrome measured 144 Hz in one F0 run and 120 Hz in the next, so the option
// text ("72 fps - Standard" vs "60 fps - Standard", "Native (144 Hz)") moved.
// Pin: declare a 60 Hz screen and call the app's own refresh hook, which only
// re-applies the unchanged request and rebuilds the list
// (js/05d-input-replay.js:798-801, no Settings.saveSelect on that path).
async function pinFpsCap(d) {
    return d.ev(`(function(){ var before = { hz: window.__displayHz, known: !!window.__displayHzKnown };
        window.__displayHz = 60; window.__displayHzKnown = true;
        if (typeof window.__onDisplayHzChanged === 'function') window.__onDisplayHzChanged();
        var sel = document.getElementById('fpsCap');
        return { before: before, value: sel ? sel.value : null, selected: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : null,
            options: sel ? Array.prototype.map.call(sel.options, function (o) { return o.textContent; }) : null }; })()`);
}

// A trusted left click at an element's centre (scrolled into view first).
async function clickEl(d, expr, what) {
    const c = await centreOf(d, expr);
    if (!c || !c.visible) throw new Error(what + ' not visible for a click');
    await d.click(c.x, c.y);
    return c;
}

// Sections, as js/20 builds them (makeSection: .sidebar-section > .section-header > .section-title[aria-expanded]).
async function listSections(d, side) {
    return d.ev(`Array.prototype.map.call(document.querySelectorAll('#sidebar-${side} .sidebar-section'), function (sec, i) { var t = sec.querySelector('.section-title');
        return { i: i, title: t ? t.textContent.replace(/\\s+/g, ' ').trim() : null, collapsed: sec.classList.contains('collapsed'), expanded: t ? t.getAttribute('aria-expanded') : null, group: sec.dataset.group || null }; })`);
}
const secExpr = (side, i) => `document.querySelectorAll('#sidebar-${side} .sidebar-section')[${i}]`;
// Open one section alone (a plain click sweeps the others closed, js/20 toggleSection),
// then put its header at the top of the bar.
async function openAlone(d, side, i, out) {
    const st = await d.ev(`(function(){ var s = ${secExpr(side, i)}; return s ? s.classList.contains('collapsed') : null; })()`);
    if (st === null) throw new Error('section ' + side + '[' + i + '] missing');
    if (st) {
        await clickEl(d, `${secExpr(side, i)}.querySelector('.section-title')`, 'section title ' + side + '[' + i + ']');
    }
    await park(d);
    await settle(d, side + ' section ' + i + ' opened', out);
    const after = await listSections(d, side);
    const others = after.filter(s => s.i !== i && !s.collapsed).map(s => s.title);
    if (after[i].collapsed || after[i].expanded !== 'true') problem(side + ' section "' + after[i].title + '" did not open (aria-expanded=' + after[i].expanded + ')');
    if (others.length) problem(side + ' section "' + after[i].title + '": other sections stayed open: ' + others.join(', '));
    // Header to the top of the bar, instantly (the right bar scrolls smoothly).
    await d.ev(`(function(){ var s = ${secExpr(side, i)}; var bar = document.getElementById('sidebar-${side}');
        var prev = bar.style.scrollBehavior; bar.style.scrollBehavior = 'auto';
        try { s.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' }); } catch (_) { s.scrollIntoView(true); }
        bar.style.scrollBehavior = prev; return bar.scrollTop; })()`);
    await settle(d, side + ' section ' + i + ' scrolled', out);
    return after[i];
}
async function closeSection(d, side, i, out) {
    const open = await d.ev(`!${secExpr(side, i)}.classList.contains('collapsed')`);
    if (open) { await clickEl(d, `${secExpr(side, i)}.querySelector('.section-title')`, 'section title'); await park(d); await settle(d, side + ' section ' + i + ' closed', out); }
}
async function resetBarScroll(d, side) {
    await d.ev(`(function(){ var bar = document.getElementById('sidebar-${side}'); [bar].concat(Array.prototype.slice.call(bar.querySelectorAll('*'))).forEach(function (el) { if (el.scrollTop > 0) { var p = el.style.scrollBehavior; el.style.scrollBehavior = 'auto'; el.scrollTop = 0; el.style.scrollBehavior = p; } }); return 1; })()`);
    await sleep(100);
}

// ─── one width ───────────────────────────────────────────────────────────────
async function captureWidth(d, w, h, head, started) {
    const widthDir = path.join(OUT_DIR, String(w));
    fs.mkdirSync(widthDir, { recursive: true });
    // No stale PNG from an older shot list survives in the width folder.
    for (const f of fs.readdirSync(widthDir)) if (f.endsWith('.png')) fs.rmSync(path.join(widthDir, f), { force: true });
    const out = { width: w, height: h, env: {}, pins: {}, animationPins: [], shots: [], problems: [] };
    const nProblemsBefore = problems.length;

    await d.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await d.load();                       // the driver: navigate, wait for the app, hide #photoWarn, wait for the splash, 600 ms
    const anims = await waitAnimations(d, 6000);
    if (anims !== 0) { problem(w + ': entrance animations still running after 6 s (' + anims + ')'); await pinLoopingAnimations(d, 'after boot', out.animationPins); }
    // Web fonts: text must not be shot in a fallback face while a face is still loading.
    const fonts = await d.ev(`document.fonts.ready.then(function () { var faces = []; document.fonts.forEach(function (f) { faces.push(f.family + ' ' + f.weight + ' ' + f.status); }); return { status: document.fonts.status, size: document.fonts.size, faces: faces }; })`);
    await sleep(400);

    const ver = await d.send('Browser.getVersion');
    const pageEnv = await d.ev(`(function(){ return { innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio,
        uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null,
        leftFoldedAtBoot: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()),
        rightFoldedAtBoot: !!(window.Sidebars && window.Sidebars.right && window.Sidebars.right.isCollapsed()),
        compactUi: document.body.classList.contains('compact-ui'), bodyClasses: document.body.className,
        openAtBoot: Array.prototype.filter.call(document.querySelectorAll('.sidebar-section'), function (s) { return !s.classList.contains('collapsed'); }).map(function (s) { return s.querySelector('.section-title').textContent.trim(); }),
        localStorageKeys: Object.keys(localStorage).length, displayHz: window.__displayHz, displayHzKnown: !!window.__displayHzKnown,
        glRenderer: (function(){ try { var g = (typeof gl !== 'undefined') ? gl : window.gl; var e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : (g ? g.getParameter(g.RENDERER) : null); } catch (_) { return null; } })(),
        underbar: (function(){ var u = document.getElementById('quality-underbar'); return u ? u.textContent.replace(/\\s+/g, ' ').trim().slice(0, 160) : null; })(),
        colorWell: (document.getElementById('colorPicker') || {}).value || null }; })()`);
    out.env = Object.assign({ date: started.toISOString(), headCommit: head, chrome: ver.product, userAgent: ver.userAgent, protocol: ver.protocolVersion, node: process.version, chromeArgs: CHROME_ARGS,
        build: 'web build in headless Chrome (Emulation.setDeviceMetricsOverride ' + w + 'x' + h + ' @1, scratch profile wiped before the load)', fonts }, pageEnv);
    log(w + 'x' + h + ': viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ' @' + pageEnv.dpr + ', --ui-scale ' + pageEnv.uiScale + ', left folded ' + pageEnv.leftFoldedAtBoot + ', open at boot: ' + pageEnv.openAtBoot.join(', ') + ', measured Hz ' + pageEnv.displayHz + (pageEnv.displayHzKnown ? '' : ' (probe not done)') + ', fonts ' + fonts.status + ' (' + fonts.size + ' faces), colour well ' + pageEnv.colorWell);
    if (pageEnv.innerWidth !== w || pageEnv.innerHeight !== h) problem(w + ': viewport is ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ', not ' + w + 'x' + h);
    if (pageEnv.localStorageKeys !== Object.keys(SEED).length) log('  note: localStorage has ' + pageEnv.localStorageKeys + ' keys after boot (the app writes its own on load)');

    // Caret pin (see the header).
    out.pins.caret = await d.ev(`(function(){ var s = document.getElementById('__shotCaretPin'); if (!s) { s = document.createElement('style'); s.id = '__shotCaretPin'; s.textContent = ${JSON.stringify(CARET_PIN_CSS)}; document.head.appendChild(s); } return s.textContent; })()`);

    // Deterministic canvas.
    const inst = await d.ev(HARNESS);
    const fz = await d.ev('window.__test.freeze()');
    await d.ev(`window.__test.seed(${RNG_SEED})`);
    const cl = await d.ev('window.__test.clear()');
    out.pins.harness = { installed: !!(inst && inst.installed), dye: inst && inst.dye, sim: inst && inst.sim, frozen: !!(fz && fz.frozen), cleared: !!(cl && cl.cleared), seed: RNG_SEED };
    out.pins.fpsCap = await pinFpsCap(d);
    await d.ev('window.__test.step(3)');
    await park(d);
    await settle(d, 'after freeze', out);
    log('  harness: frozen ' + out.pins.harness.frozen + ', cleared ' + out.pins.harness.cleared + ', dye ' + out.pins.harness.dye + '; fpsCap pinned: ' + out.pins.fpsCap.selected + ' (was ' + out.pins.fpsCap.before.hz + ' Hz, known ' + out.pins.fpsCap.before.known + ')');
    const hoverNow = await d.ev(`document.querySelectorAll(':hover').length`);
    out.pins.hoverAfterPark = hoverNow;
    if (hoverNow) log('  note: ' + hoverNow + ' element(s) still :hover after parking the pointer');

    // 1. Full page and the top bar.
    await shoot(d, out, widthDir, 'full', null, { what: 'full viewport at boot (sim frozen, canvas cleared)', selector: 'viewport' });
    const stripRect = await rectOf(d, `document.getElementById('mixer-strip')`);
    await shoot(d, out, widthDir, 'top-bar', stripRect, { what: 'top bar', selector: '#mixer-strip', rect: stripRect });

    // 2. Left sidebar open (folded below 1280 px by default, js/20:2495; opened with its rail button if so).
    if (pageEnv.leftFoldedAtBoot) {
        await clickEl(d, `document.querySelector('#sidebar-left .lsb-rail-label')`, '.lsb-rail-label');
        await park(d); await settle(d, 'left bar opened', out);
        const still = await d.ev('window.Sidebars.left.isCollapsed()');
        if (still) problem(w + ': left sidebar stayed folded after clicking its rail label');
    }
    const leftRect = await rectOf(d, `document.getElementById('sidebar-left')`);
    await shoot(d, out, widthDir, 'left-sidebar', leftRect, { what: 'left sidebar open (Brush section open as at boot)', selector: '#sidebar-left', rect: leftRect, openedByScript: pageEnv.leftFoldedAtBoot });

    // 3. Each left section open alone, then Brush open alone again (boot state).
    const left = await listSections(d, 'left');
    const bootOpenLeft = left.filter(s => !s.collapsed).map(s => s.i);
    for (const s of left) {
        const info = await openAlone(d, 'left', s.i, out);
        const r = await rectOf(d, `document.getElementById('sidebar-left')`);
        await shoot(d, out, widthDir, 'left-section-' + slug(s.title), r, { what: 'left sidebar, "' + s.title + '" open alone, header at the top', selector: '#sidebar-left .sidebar-section[' + s.i + ']', section: s.title, group: info.group, rect: r });
    }
    for (const i of bootOpenLeft) await openAlone(d, 'left', i, out);
    await resetBarScroll(d, 'left');

    // 4. Each right section open alone, bar scrolled so the header is at the top; then all closed again.
    const right = await listSections(d, 'right');
    const bootOpenRight = right.filter(s => !s.collapsed).map(s => s.i);
    for (const s of right) {
        const info = await openAlone(d, 'right', s.i, out);
        const r = await rectOf(d, `document.getElementById('sidebar-right')`);
        await shoot(d, out, widthDir, 'section-' + slug(s.title), r, { what: 'right sidebar, "' + s.title + '" open alone, header at the top', selector: '#sidebar-right .sidebar-section[' + s.i + ']', section: s.title, group: info.group, rect: r });
    }
    for (const s of right) if (!bootOpenRight.includes(s.i)) await closeSection(d, 'right', s.i, out);
    for (const i of bootOpenRight) await openAlone(d, 'right', i, out);
    await resetBarScroll(d, 'right');

    // 5. Key states.
    // pressed: #freezeBtn (Stop) toggles .active + aria-pressed + window.__fluidFrozen (js/04b-presets.js:250-276); nothing else.
    {
        const before = await d.ev(`document.getElementById('freezeBtn').getAttribute('aria-pressed')`);
        await clickEl(d, `document.getElementById('freezeBtn')`, '#freezeBtn');
        await park(d); await settle(d, 'freezeBtn pressed', out);
        const pressed = await d.ev(`document.getElementById('freezeBtn').getAttribute('aria-pressed')`);
        if (pressed !== 'true') problem(w + ': #freezeBtn aria-pressed is ' + pressed + ' after a click');
        const r = await rectOf(d, `document.getElementById('mixer-strip')`);
        await shoot(d, out, widthDir, 'state-pressed', r, { what: 'top bar with #freezeBtn (Stop) pressed', selector: '#freezeBtn[aria-pressed="true"]', state: { ariaPressedBefore: before, ariaPressed: pressed }, rect: r, control: await rectOf(d, `document.getElementById('freezeBtn')`) });
        await clickEl(d, `document.getElementById('freezeBtn')`, '#freezeBtn');
        await park(d); await settle(d, 'freezeBtn released', out);
        const after = await d.ev(`document.getElementById('freezeBtn').getAttribute('aria-pressed')`);
        if (after !== before) problem(w + ': #freezeBtn did not return to aria-pressed=' + before);
    }
    // expanded / collapsed: the Simulation section header (right bar, first section after Swirl Together).
    {
        const simIdx = right.findIndex(s => s.title === 'Simulation');
        const idx = simIdx >= 0 ? simIdx : 1;
        await openAlone(d, 'right', idx, out);
        const hr = await rectOf(d, `${secExpr('right', idx)}.querySelector('.section-header')`);
        const sr = await rectOf(d, `${secExpr('right', idx)}`);
        await shoot(d, out, widthDir, 'state-expanded', { x: sr.x, y: hr.y, w: sr.w, h: Math.min(hr.h + 120, pageEnv.innerHeight - hr.y) }, { what: '"' + right[idx].title + '" header expanded (aria-expanded=true) with the top of its body', selector: secExpr('right', idx) + ' .section-title[aria-expanded="true"]', section: right[idx].title, rect: hr });
        // checked: #macCormackToggle (Crisp Advection) in Simulation, checked by default; click it off, shoot, click it back.
        {
            const id = 'macCormackToggle';
            const target = await d.ev(`(function(){ var el = document.getElementById('${id}'); if (!el) return null; var r = el.getBoundingClientRect();
                var lab = document.querySelector('label[for="${id}"]') || el.closest('label'); return { inputHasBox: r.width > 0 && r.height > 0, hasLabel: !!lab, checked: el.checked, disabled: el.disabled }; })()`);
            if (!target) problem(w + ': #' + id + ' not found for the checked state');
            else {
                const clickExpr = target.inputHasBox ? `document.getElementById('${id}')` : `(document.querySelector('label[for="${id}"]') || document.getElementById('${id}').closest('label'))`;
                const rowExpr = `(function(){ var el = document.getElementById('${id}'); var lab = document.querySelector('label[for="${id}"]'); var row = el.closest('.row, .setting-row, .toggle-row, .sidebar-row') || (lab && lab.parentElement) || el.parentElement; return row; })()`;
                const rowRect0 = await rectOf(d, rowExpr);
                const pad = r => ({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 });
                await shoot(d, out, widthDir, 'state-checked-' + (target.checked ? 'on' : 'off'), pad(rowRect0), { what: '#' + id + ' row as at boot (' + (target.checked ? 'checked' : 'unchecked') + ')', selector: '#' + id, state: { checked: target.checked }, rect: rowRect0 });
                await clickEl(d, clickExpr, '#' + id);
                await park(d); await settle(d, id + ' toggled', out);
                const now = await d.ev(`document.getElementById('${id}').checked`);
                if (now === target.checked) problem(w + ': #' + id + ' did not toggle on click');
                const rowRect1 = await rectOf(d, rowExpr);
                await shoot(d, out, widthDir, 'state-checked-' + (now ? 'on' : 'off'), pad(rowRect1), { what: '#' + id + ' row after one click (' + (now ? 'checked' : 'unchecked') + ')', selector: '#' + id, state: { checked: now }, rect: rowRect1 });
                await clickEl(d, clickExpr, '#' + id);
                await park(d); await settle(d, id + ' restored', out);
                const back = await d.ev(`document.getElementById('${id}').checked`);
                if (back !== target.checked) problem(w + ': #' + id + ' did not return to checked=' + target.checked);
            }
        }
        await closeSection(d, 'right', idx, out);
        for (const i of bootOpenRight) await openAlone(d, 'right', i, out);
        await resetBarScroll(d, 'right');
        const hr2 = await rectOf(d, `${secExpr('right', idx)}.querySelector('.section-header')`);
        const sr2 = await rectOf(d, `${secExpr('right', idx)}`);
        await shoot(d, out, widthDir, 'state-collapsed', { x: sr2.x, y: hr2.y, w: sr2.w, h: hr2.h }, { what: '"' + right[idx].title + '" header collapsed (aria-expanded=false)', selector: secExpr('right', idx) + ' .section-title[aria-expanded="false"]', section: right[idx].title, rect: hr2 });
    }
    // focused: #curl (the Fluid fader in the Material channel). focus() it, then a trusted
    // Tab away and Shift+Tab back so :focus-visible matches (keyboard was the last input).
    {
        await d.ev(`document.getElementById('curl').focus(), 1`);
        await d.tap('Tab', 'Tab', 9);
        const mid = await d.ev(`(function(){ var a = document.activeElement; return a ? (a.tagName.toLowerCase() + (a.id ? '#' + a.id : '')) : null; })()`);
        await d.tap('Tab', 'Tab', 9, ['shift']);
        await settle(d, 'curl focused', out);
        const foc = await d.ev(`(function(){ var a = document.activeElement; return { active: a ? (a.tagName.toLowerCase() + (a.id ? '#' + a.id : '')) : null, focusVisible: !!(a && a.matches(':focus-visible')) }; })()`);
        if (foc.active !== 'input#curl') problem(w + ': focus landed on ' + foc.active + ' (Tab went to ' + mid + '), not input#curl');
        if (!foc.focusVisible) problem(w + ': #curl is focused but :focus-visible does not match');
        const r = await rectOf(d, `document.getElementById('mixer-strip')`);
        await shoot(d, out, widthDir, 'state-focused', r, { what: 'top bar with #curl focused via the keyboard (:focus-visible)', selector: '#curl:focus-visible', state: Object.assign({ tabWentTo: mid }, foc), rect: r, control: await rectOf(d, `document.getElementById('curl')`) });
        await d.ev(`document.activeElement && document.activeElement.blur(), 1`);
        await settle(d, 'curl blurred', out);
    }
    // disabled: #brushTipTexture (Brush section, left bar) is a disabled range at boot (F0 dump); the row around it.
    {
        const id = 'brushTipTexture';
        const info = await d.ev(`(function(){ var el = document.getElementById('${id}'); if (!el) return null; return { disabled: el.disabled, visible: !!el.getClientRects().length, tag: el.tagName.toLowerCase(), type: el.type }; })()`);
        if (!info || !info.disabled || !info.visible) {
            problem(w + ': #' + id + ' is not a visible disabled control (' + JSON.stringify(info) + '); no disabled-state shot');
        } else {
            const rowExpr = `(function(){ var el = document.getElementById('${id}'); return el.closest('.row, .setting-row, .slider-row, .sidebar-row') || el.parentElement.parentElement || el.parentElement; })()`;
            await d.ev(`(function(){ var el = document.getElementById('${id}'); try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {} return 1; })()`);
            await settle(d, 'disabled row in view', out);
            const r = await rectOf(d, rowExpr);
            await shoot(d, out, widthDir, 'state-disabled', { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }, { what: '#' + id + ' (disabled range) and its row', selector: '#' + id + ':disabled', state: info, rect: r, alsoDisabledInSectionShots: ['#mutationUndo', '#mutationRedo', '#recMiniPauseBtn', '#recMiniStopBtn'] });
            await resetBarScroll(d, 'left');
        }
    }

    // 6. Overlays.
    // F1 hotkey sheet (js/05n-hotkeys-init.js:444 toggleHotkeys; Escape closes it).
    {
        await d.tap('F1', 'F1', 112);
        await settle(d, 'F1 overlay', out);
        const open = await d.ev(`(function(){ var o = document.getElementById('hotkeyOverlay'); return !!(o && o.style.display === 'flex'); })()`);
        if (!open) problem(w + ': #hotkeyOverlay did not open on F1');
        await shoot(d, out, widthDir, 'overlay-hotkeys', null, { what: 'F1 hotkey sheet', selector: '#hotkeyOverlay', state: { open }, rect: await rectOf(d, `document.getElementById('hotkeyOverlay')`) });
        await d.tap('Escape', 'Escape', 27);
        await settle(d, 'F1 overlay closed', out);
        const still = await d.ev(`(function(){ var o = document.getElementById('hotkeyOverlay'); return !!(o && o.style.display === 'flex'); })()`);
        if (still) problem(w + ': #hotkeyOverlay still open after Escape');
        await d.ev(`document.activeElement && document.activeElement.blur(), 1`);
    }
    // Radial menu: pointer over the canvas centre, E (js/58-radial-menu.js). The pointer is over the
    // canvas, so the brush ghost (js/31) is in this shot too, at a fixed spot.
    {
        const canvas = await d.ev(`(function(){ var c = document.getElementById('canvas') || document.querySelector('#canvas-area canvas'); var r = c.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
        await d.move(canvas.x, canvas.y); await sleep(60);
        await d.keyDown('e', 'KeyE', 69, [], 'e'); await sleep(40); await d.keyUp('e', 'KeyE', 69);
        await settle(d, 'radial menu', out);
        const open = await d.ev(`!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())`);
        if (!open) problem(w + ': the radial menu did not open on E');
        await shoot(d, out, widthDir, 'overlay-radial-menu', null, { what: 'radial menu (E) at the canvas centre, brush ghost under the pointer', selector: '#radialMenu', state: { open, pointer: canvas }, rect: await rectOf(d, `document.getElementById('radialMenu')`) });
        await d.tap('Escape', 'Escape', 27);
        await park(d);
        await settle(d, 'radial menu closed', out);
        const still = await d.ev(`!!(window.RadialMenu && window.RadialMenu.isOpen && window.RadialMenu.isOpen())`);
        if (still) problem(w + ': the radial menu is still open after Escape');
    }
    // Colour picker popover from the top bar well (js/64-colour-picker.js).
    {
        await clickEl(d, `document.getElementById('colorPicker')`, '#colorPicker');
        await park(d); await settle(d, 'colour picker', out);
        const open = await d.ev(`!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`);
        if (!open) problem(w + ': the colour picker popover (.cp-pop) did not open');
        await shoot(d, out, widthDir, 'overlay-colour-picker', null, { what: 'colour picker popover from #colorPicker', selector: '.cp-pop', state: { open }, rect: await rectOf(d, `document.querySelector('.cp-pop')`) });
        await d.tap('Escape', 'Escape', 27);
        await settle(d, 'colour picker closed', out);
        const still = await d.ev(`!!(document.querySelector('.cp-pop') && document.querySelector('.cp-pop').getClientRects().length)`);
        if (still) problem(w + ': .cp-pop still open after Escape');
    }
    // Presets popup (#mixerPresetsTrigger -> .mixer-presets-panel).
    {
        await clickEl(d, `document.getElementById('mixerPresetsTrigger')`, '#mixerPresetsTrigger');
        await park(d); await settle(d, 'presets popup', out);
        const isOpen = `(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!(p && p.style.display !== 'none' && p.getClientRects().length); })()`;
        const open = await d.ev(isOpen);
        if (!open) problem(w + ': the presets panel did not open');
        await shoot(d, out, widthDir, 'overlay-presets', null, { what: 'presets popup from #mixerPresetsTrigger', selector: '.mixer-presets-panel', state: { open }, rect: await rectOf(d, `document.querySelector('.mixer-presets-panel')`) });
        await d.tap('Escape', 'Escape', 27);
        await settle(d, 'presets closed', out);
        let still = await d.ev(isOpen);
        if (still) { await clickEl(d, `document.getElementById('mixerPresetsTrigger')`, '#mixerPresetsTrigger'); await park(d); await settle(d, 'presets closed by trigger', out); still = await d.ev(isOpen); out.pins.presetsClosedBy = 'trigger click (Escape left it open)'; }
        if (still) problem(w + ': the presets panel is still open');
    }

    // 7. Sim probe, after every shot (nothing above sees it): WebGL renders on the
    // GPU and its frame reaches the screenshot under the software compositor.
    // A deterministic harness stroke, a few virtual frames, then the canvas
    // region is read from a screenshot (not saved) and from the GL side.
    {
        const cr = await rectOf(d, `document.getElementById('canvas')`);
        const before = await canvasStats(d, cr, out.env);
        await d.ev('window.__test.stroke({ radius: 0.01 })');
        await d.ev('window.__test.step(4)');
        await sleep(150);
        const snap = await d.ev('window.__test.snapshotState({ dyeOnly: true, display: true })');
        const after = await canvasStats(d, cr, out.env);
        const rendered = !!(after && before && after.lit > before.lit + 100 && after.max > 32 && snap && snap.dye && snap.dye.max > 0);
        out.simProbe = { glRenderer: out.env.glRenderer, canvasRect: cr, screenshotBefore: before, screenshotAfter: after,
            dye: snap && snap.dye ? { max: snap.dye.max, coverage: snap.dye.coverage, res: snap.dye.res } : null,
            display: snap && snap.display ? { meanLum: snap.display.meanLum, maxLum: snap.display.maxLum, res: snap.display.res } : null, rendered };
        log('  sim probe: WebGL ' + out.env.glRenderer + '; canvas lit px ' + (before && before.lit) + ' -> ' + (after && after.lit) + ', max ' + (after && after.max) + ', dye max ' + (snap && snap.dye && snap.dye.max) + ' -> ' + (rendered ? 'renders' : 'DID NOT RENDER'));
        if (!rendered) problem(w + ': the sim canvas did not show the probe stroke in a screenshot (WebGL ' + out.env.glRenderer + ')');
        await d.ev('window.__test.clear()');
        await d.ev('window.__test.step(2)');
    }

    out.pageExceptions = d.events.filter(m => m.method === 'Runtime.exceptionThrown').map(m => (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 20);
    d.events.length = 0;
    if (out.pageExceptions.length) problem(w + ': ' + out.pageExceptions.length + ' page exception(s); first: ' + out.pageExceptions[0].split('\n')[0]);
    out.problems = problems.slice(nProblemsBefore);
    return out;
}

// ─── --check: pixel compare ──────────────────────────────────────────────────
async function comparePng(baseFile, newFile, diffFile) {
    const a = await sharp(baseFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(newFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
        return { mismatch: Math.max(a.info.width * a.info.height, b.info.width * b.info.height), total: a.info.width * a.info.height, dims: a.info.width + 'x' + a.info.height + ' -> ' + b.info.width + 'x' + b.info.height };
    }
    const A = a.data, B = b.data, n = a.info.width * a.info.height;
    if (Buffer.compare(A, B) === 0) return { mismatch: 0, total: n };
    let mismatch = 0, over1 = 0, maxDelta = 0;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    const D = Buffer.alloc(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const dd = Math.max(Math.abs(A[p] - B[p]), Math.abs(A[p + 1] - B[p + 1]), Math.abs(A[p + 2] - B[p + 2]), Math.abs(A[p + 3] - B[p + 3]));
        if (dd === 0) {
            const g = Math.round((0.299 * A[p] + 0.587 * A[p + 1] + 0.114 * A[p + 2]) * 0.35);
            D[p] = g; D[p + 1] = g; D[p + 2] = g; D[p + 3] = 255;
        } else {
            mismatch++;
            if (dd > 1) over1++;
            if (dd > maxDelta) maxDelta = dd;
            const x = i % a.info.width, y = (i / a.info.width) | 0;
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            // red = differs by more than 1/255 in some channel, yellow = by exactly 1 (dither-level)
            D[p] = 255; D[p + 1] = dd > 1 ? 0 : 220; D[p + 2] = 0; D[p + 3] = 255;
        }
    }
    await sharp(D, { raw: { width: a.info.width, height: a.info.height, channels: 4 } }).png().toFile(diffFile);
    return { mismatch, over1, maxDelta, total: n, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

// ─── main ────────────────────────────────────────────────────────────────────
(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const started = new Date();
    let head = null;
    try { head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { head = '(git unavailable)'; }
    log('booting headless Chrome through scripts/test/radial-menu/driver.js ...');
    const d = await boot({ seed: SEED, args: CHROME_ARGS });
    // Settled state: the Walnut & Copper motion (js/71) runs on the real
    // clock; under prefers-reduced-motion its springs jump to their target
    // and cathodes switch without flicker or afterglow (the study's rule), so
    // every shot is of the settled UI. Set before the per-width loads.
    await d.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const manifest = { generated: started.toISOString(), headCommit: head, script: 'prep/baseline/scripts/screenshots.js', mode: CHECK ? 'check' : 'capture', seed: SEED, rngSeed: RNG_SEED, framesPerStep: FRAMES_PER_STEP, chromeArgs: CHROME_ARGS, widths: [], problems: [] };
    try {
        // Before every load: wipe the scratch profile's localStorage and put the
        // seed back, so each width boots the app as it ships (section collapse
        // state, the left-bar fold and every control persist by settingsManager).
        // Runs after the driver's own seed script (same document, in order).
        await d.send('Page.addScriptToEvaluateOnNewDocument', { source:
            'try{localStorage.clear();var s=' + JSON.stringify(SEED) + ';for(var k in s)localStorage.setItem(k,s[k]);}catch(e){}window.__skipUIFork=true;' });
        for (const [w, h] of WIDTHS) {
            const t0 = Date.now();
            const res = await captureWidth(d, w, h, head, started);
            res.seconds = Math.round((Date.now() - t0) / 100) / 10;
            manifest.widths.push(res);
            log(w + ': ' + res.shots.length + ' shots in ' + res.seconds + ' s, ' + res.problems.length + ' problem(s)');
        }
    } catch (err) {
        problem('run aborted: ' + (err && err.stack || err));
    } finally {
        await d.close();
    }
    manifest.problems = problems.slice();
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));
    log('wrote ' + path.relative(ROOT, path.join(OUT_DIR, 'manifest.json')) + ' (' + manifest.widths.reduce((n, w) => n + w.shots.length, 0) + ' shots over ' + manifest.widths.length + ' widths)');

    if (!CHECK) process.exit(0);

    // Compare every baseline shot with the fresh capture.
    const basePath = path.join(BASE_DIR, 'manifest.json');
    if (!fs.existsSync(basePath)) { console.log('CHECK: no baseline at ' + basePath); process.exit(1); }
    const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    // Keep the previous check's evidence (moved under prep/work) and start a fresh _diff/.
    const prevDiff = path.join(OUT_DIR, '_diff-previous');
    fs.rmSync(prevDiff, { recursive: true, force: true });
    if (fs.existsSync(DIFF_DIR)) fs.renameSync(DIFF_DIR, prevDiff);
    fs.mkdirSync(DIFF_DIR, { recursive: true });
    const rows = [];
    let failures = 0;
    for (const bw of base.widths) {
        if (!WIDTHS.some(x => x[0] === bw.width)) continue;
        const nw = manifest.widths.find(x => x.width === bw.width);
        if (!nw) { rows.push([bw.width, '*', 'missing width in the re-capture']); failures++; continue; }
        if (bw.env.uiScale !== nw.env.uiScale) { rows.push([bw.width, 'env', '--ui-scale ' + bw.env.uiScale + ' -> ' + nw.env.uiScale]); failures++; }
        if (JSON.stringify(bw.env.chromeArgs || []) !== JSON.stringify(nw.env.chromeArgs || [])) { rows.push([bw.width, 'env', 'Chrome flags ' + JSON.stringify(bw.env.chromeArgs) + ' -> ' + JSON.stringify(nw.env.chromeArgs) + ' (the raster pin; a flag change explains any mismatch below)']); failures++; }
        if (bw.env.chrome !== nw.env.chrome) rows.push([bw.width, 'env', 'note: Chrome ' + bw.env.chrome + ' -> ' + nw.env.chrome + ' (not a failure by itself; a browser update can move antialiasing)']);
        if (bw.env.glRenderer !== nw.env.glRenderer) rows.push([bw.width, 'env', 'note: WebGL ' + bw.env.glRenderer + ' -> ' + nw.env.glRenderer + ' (another GPU or driver; not a failure by itself)']);
        if (!nw.simProbe || !nw.simProbe.rendered) { rows.push([bw.width, 'env', 'the sim canvas did not show the probe stroke (WebGL ' + nw.env.glRenderer + ')']); failures++; }
        for (const bs of bw.shots) {
            const name = path.basename(bs.file, '.png');
            const ns = nw.shots.find(s => path.basename(s.file, '.png') === name);
            if (!ns) { rows.push([bw.width, name, 'missing in the re-capture']); failures++; continue; }
            const bf = path.join(BASE_DIR, bs.file), nf = path.join(OUT_DIR, String(nw.width), name + '.png');
            const r = await comparePng(bf, nf, path.join(DIFF_DIR, bw.width + '-' + name + '.png'));
            if (r.mismatch) {
                failures++;
                // The re-captured PNG goes next to its diff, so a mismatch can be inspected without another run.
                try { fs.copyFileSync(nf, path.join(DIFF_DIR, bw.width + '-' + name + '.new.png')); } catch (_) {}
                rows.push([bw.width, name, r.dims ? 'size ' + r.dims : r.mismatch + ' / ' + r.total + ' px differ (' + r.over1 + ' by more than 1/255, max ' + r.maxDelta + '), box ' + r.box.x + ',' + r.box.y + ' ' + r.box.w + 'x' + r.box.h + ' -> _diff/' + bw.width + '-' + name + '.png']);
            } else rows.push([bw.width, name, 'identical (' + r.total + ' px)']);
        }
        for (const ns of nw.shots) if (!bw.shots.some(s => path.basename(s.file, '.png') === path.basename(ns.file, '.png'))) { rows.push([bw.width, path.basename(ns.file, '.png'), 'new shot, not in the baseline']); failures++; }
    }
    const report = ['| width | shot | result |', '|---|---|---|'].concat(rows.map(r => '| ' + r.join(' | ') + ' |')).join('\n');
    fs.writeFileSync(path.join(OUT_DIR, 'check-report.md'), '# screenshots --check ' + new Date().toISOString() + '\n\nBaseline ' + base.generated + ' at ' + base.headCommit + '; re-capture at ' + head + '.\n\n' + report + '\n\n' + (failures ? 'CHECK FAIL: ' + failures + ' mismatch(es)' : 'CHECK PASS: every shot identical') + '\n');
    console.log(report);
    if (failures) { console.log('CHECK FAIL: ' + failures + ' mismatch(es); diffs under ' + path.relative(ROOT, DIFF_DIR)); process.exit(1); }
    console.log('CHECK PASS: ' + rows.length + ' shots identical to ' + path.relative(ROOT, BASE_DIR) + ' (' + base.generated + ')');
    process.exit(0);
})();
