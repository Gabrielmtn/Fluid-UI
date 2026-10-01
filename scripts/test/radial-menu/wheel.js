// Radial menu, the wheel itself (2026-09-30), headless Chrome with trusted
// input against the repo's own files (see driver.js).
//
// Gabriel: "a third bindable option that defaults to mouse3 ... to each
// control we're adding a new option of radial menu", "a radial menu which
// pops up at the mouse, takes e from export for a hotkey", then: "we want
// these to be connected to the slider, so on click and drag, or finer with
// hover and then scroll, our major settings can be replicated".
//
// Checks: E tapped opens the top bar's nine sliders round the pointer, each
// reading what its fader reads; a drag along a wedge's spoke and a wheel
// notch over it set the real slider (config, the top bar's readout and the
// wedge agree; 'change' once it rests); Density / Time move along their
// perceptual fader and Brush Size on a log scale; a press that does not
// move changes nothing; hold-E semantics round sliders; the middle button
// opening and closing it; key and control items still run and close; the
// right button without a browser menu; painting untouched; the
// no-button-paints line; E under a dialog, in bind mode and mid-stroke; the
// wheel kept on screen at an edge; and Hotkeys.press reaching Capture Layer.
'use strict';
const { boot, sleep } = require('./driver');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
const E = ['e', 'KeyE', 69];
const IDS = ['brushSize', 'curl', 'viscosity', 'velocityInfluence', 'colorBlend', 'multiplier', 'timeScale', 'densityDissipation', 'velocityDissipation'];
const BS = 0, VISC = 2, CB = 4, MB = 5, TIME = 6, DENS = 7;

(async () => {
    const d = await boot();
    try {
        const c = await d.ev(`(function(){ var c = document.getElementById('canvas').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; })()`);
        const cx = Math.round(c.l + c.w / 2), cy = Math.round(c.t + c.h / 2);
        await d.ev(`(function(){
            window.__begin = 0; window.__ctx = []; window.__ev = { input: 0, change: 0 };
            var b = window.BrushEngine.begin; window.BrushEngine.begin = function(){ window.__begin++; return b.apply(this, arguments); };
            window.addEventListener('contextmenu', function(e){ setTimeout(function(){ window.__ctx.push(e.defaultPrevented); }, 0); }, true);
            ['input', 'change'].forEach(function(t){ document.getElementById('colorBlend').addEventListener(t, function(){ window.__ev[t]++; }); });
            return 1; })()`);
        const open = () => d.ev('window.RadialMenu.isOpen()');
        const frozen = () => d.ev('!!window.__fluidFrozen');
        const vals = () => d.ev(`${JSON.stringify(IDS)}.map(function(id){ return document.getElementById(id).value; })`);
        const val = (id) => d.ev(`parseFloat(document.getElementById(${JSON.stringify(id)}).value)`);
        const begin = () => d.ev('window.__begin');
        const down = () => d.ev('!!window.pointer.down');
        // Each wedge: its label's centre, and the unit vector of its spoke.
        const wedges = () => d.ev(`(function(){ var w = document.querySelector('.radial-wheel').getBoundingClientRect(); return [].map.call(document.querySelectorAll('.radial-label'), function(l){ var r = l.getBoundingClientRect(); var x = r.left + r.width/2, y = r.top + r.height/2, dx = x - w.left, dy = y - w.top, n = Math.hypot(dx, dy); var v = l.querySelector('.radial-label-val'); return { t: l.querySelector('.radial-label-text').textContent, v: v ? v.textContent : null, x: Math.round(x), y: Math.round(y), ux: dx / n, uy: dy / n, hot: l.classList.contains('is-hot') }; }); })()`);
        const tapE = async () => { await d.keyDown(...E, [], 'e'); await sleep(40); await d.keyUp(...E); await sleep(100); };
        const esc = () => d.tap('Escape', 'Escape', 27);
        const wheelAt = async (x, y, dy) => { await d.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(70); };
        const dragAlong = async (w, px, button) => {
            await d.move(w.x, w.y); await sleep(30);
            await d.down(w.x, w.y, button || 'left'); await sleep(30);
            const steps = Math.max(2, Math.round(Math.abs(px) / 10));
            for (let k = 1; k <= steps; k++) { await d.move(w.x + w.ux * px * k / steps, w.y + w.uy * px * k / steps, 1); await sleep(12); }
            return [w.x + w.ux * px, w.y + w.uy * px];
        };

        // ── T1 tap E: the top bar's sliders, round the pointer ──
        await d.move(cx, cy);
        const v0 = await vals();
        await tapE();
        check('T1 tap E opens and stays', await open());
        let W = await wedges();
        const names = W.map(w => w.t);
        check('T1 nine slider wedges, in the top bar\'s order', W.length === 9 && names[0] === 'Brush Size' && names[4] === 'Color Blend' && names[5] === 'Multi-Brush' && names[7] === 'Density' && names[8] === 'Velocity', names);
        const strip = await d.ev(`${JSON.stringify(IDS)}.map(function(id){ return window.HotkeyBinds.valueTextOf(document.getElementById(id)); })`);
        check('T1 each wedge reads what its fader reads', W.every((w, i) => w.v === strip[i]), W.map(w => w.v));
        const centre = await d.ev(`(function(){ var w = document.querySelector('.radial-wheel'); return [parseFloat(w.style.left), parseFloat(w.style.top)]; })()`);
        check('T1 wheel centred on the pointer; nothing changed or painted', centre[0] === cx && centre[1] === cy && JSON.stringify(await vals()) === JSON.stringify(v0) && (await begin()) === 0);

        // ── T2 drag a slider ──
        let end = await dragAlong(W[CB], 50);
        const mid = await d.ev(`({ v: parseFloat(document.getElementById('colorBlend').value), cfg: window.config.COLOR_BLEND, strip: document.getElementById('colorBlendValue').textContent, wedge: document.querySelectorAll('.radial-label-val')[${CB}].textContent, ev: window.__ev })`);
        check('T2 drag Color Blend out 50px: slider, config, top bar and wedge agree', mid.v > 0.3 && mid.v < 0.55 && mid.cfg === mid.v && mid.strip === mid.wedge && parseFloat(mid.strip) === mid.v, mid);
        check('T2 input while dragging, no change yet', mid.ev.input >= 3 && mid.ev.change === 0, mid.ev);
        await d.up(end[0], end[1], 'left'); await sleep(80);
        check('T2 letting go sends one change and leaves the menu open', (await d.ev('window.__ev.change')) === 1 && (await open()));
        W = await wedges();
        end = await dragAlong(W[CB], -220);
        await d.up(end[0], end[1], 'left'); await sleep(60);
        check('T2 drag back past the hub stops at the minimum', (await val('colorBlend')) === 0 && (await open()));
        const visc0 = await val('viscosity');
        await d.click(W[VISC].x, W[VISC].y); await sleep(60);
        check('T2 a press that does not move changes nothing and keeps the menu', (await val('viscosity')) === visc0 && (await open()) && (await begin()) === 0);

        // ── T3 hover and scroll ──
        await d.move(W[MB].x, W[MB].y); await sleep(40);
        await wheelAt(W[MB].x, W[MB].y, -100);
        const mb1 = await d.ev(`({ v: document.getElementById('multiplier').value, wedge: document.querySelectorAll('.radial-label-val')[${MB}].textContent })`);
        await wheelAt(W[MB].x, W[MB].y, 100);
        check('T3 one notch on Multi-Brush is one step up, one back is one down', mb1.v === '2' && mb1.wedge === '2x' && (await val('multiplier')) === 1, mb1);
        const t0 = await d.ev(`[parseFloat(document.getElementById('timeScalePerceptual').value), parseFloat(document.getElementById('timeScale').value)]`);
        await d.move(W[TIME].x, W[TIME].y); await sleep(40);
        await wheelAt(W[TIME].x, W[TIME].y, 100);
        const t1 = await d.ev(`[parseFloat(document.getElementById('timeScalePerceptual').value), parseFloat(document.getElementById('timeScale').value)]`);
        check('T3 Time steps 1% along its perceptual fader', Math.abs((t0[0] - t1[0]) - 0.01) < 0.0015 && t1[1] < t0[1], { t0, t1 });
        await wheelAt(W[TIME].x, W[TIME].y, -100);
        const b0 = await val('brushSize');
        await d.move(W[BS].x, W[BS].y); await sleep(40);
        await wheelAt(W[BS].x, W[BS].y, -100);
        const b1 = await val('brushSize');
        check('T3 Brush Size steps by about 8%, not by 1% of 100', b1 / b0 > 1.04 && b1 / b0 < 1.13, { b0, b1 });
        check('T3 ...and the brush follows', Math.abs((await d.ev('window.config.SPLAT_RADIUS')) - b1 / 1000) < 1e-9);
        await wheelAt(W[BS].x, W[BS].y, 100);
        const snap = await vals();
        await d.move(cx, cy); await sleep(40);
        await wheelAt(cx, cy, -100); await wheelAt(cx, cy, -100);
        check('T3 the wheel over the hub changes nothing (the brush keeps its size)', JSON.stringify(await vals()) === JSON.stringify(snap));
        // moved by something else while the wheel is up
        await d.ev(`(function(){ var e = document.getElementById('viscosity'); e.value = '0.55'; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
        await sleep(350);
        check('T3 a slider moved from outside shows on the open wheel', (await wedges())[VISC].v === (await d.ev(`window.HotkeyBinds.valueTextOf(document.getElementById('viscosity'))`)));
        await d.ev(`(function(){ var e = document.getElementById('viscosity'); e.value = '${visc0}'; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
        // a disabled slider
        await d.ev(`document.getElementById('viscosity').disabled = true`);
        await sleep(300);
        end = await dragAlong(W[VISC], 40);
        await d.up(end[0], end[1], 'left'); await sleep(60);
        const off = await d.ev(`document.querySelectorAll('.radial-wedge')[${VISC}].classList.contains('is-off')`);
        check('T3 a disabled slider shows off and does not move', off && (await val('viscosity')) === visc0);
        await d.ev(`document.getElementById('viscosity').disabled = false`);
        await esc();
        check('T3 Esc closes', !(await open()));

        // ── T4..T7 holding E ──
        await d.move(cx, cy);
        await d.keyDown(...E, [], 'e'); await sleep(260);
        await d.move(W[DENS].x, W[DENS].y); await sleep(40);
        await d.keyUp(...E); await sleep(100);
        check('T4 hold E, let go over an untouched slider: the menu stays for it', (await open()) && JSON.stringify(await vals()) === JSON.stringify(snap));
        await tapE();
        check('T4 E again closes', !(await open()));

        await d.move(cx, cy);
        await d.keyDown(...E, [], 'e'); await sleep(260);
        await d.move(W[MB].x, W[MB].y); await sleep(40);
        await wheelAt(W[MB].x, W[MB].y, -100);
        await d.keyUp(...E); await sleep(100);
        check('T5 hold E, scroll a slider, let go: set and closed', !(await open()) && (await val('multiplier')) === 2);
        await d.ev(`(function(){ var e = document.getElementById('multiplier'); e.value = '1'; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);

        await d.move(cx, cy);
        await d.keyDown(...E, [], 'e'); await sleep(260);
        await d.move(W[DENS].x, W[DENS].y); await d.move(cx + 3, cy + 2); await sleep(40);
        await d.keyUp(...E); await sleep(100);
        check('T6 out and back to the hub closes', !(await open()));

        await d.move(cx, cy);
        await d.keyDown(...E, [], 'e');
        for (let i = 0; i < 4; i++) { await sleep(40); await d.keyDown(...E, [], 'e', true); }
        check('T7 key repeats keep one menu open', (await open()) && (await d.ev('document.querySelectorAll(".radial-wheel").length')) === 1);
        await d.keyUp(...E); await sleep(80);
        await esc();

        // ── T8, T9 the middle button ──
        await d.click(cx, cy, 'middle'); await sleep(80);
        check('T8 middle click opens the menu and it stays', (await open()) && !(await down()) && (await begin()) === 0);
        await d.move(W[MB].x, W[MB].y); await sleep(40);
        await wheelAt(W[MB].x, W[MB].y, -100);
        check('T8 ...scroll works there', (await val('multiplier')) === 2);
        await wheelAt(W[MB].x, W[MB].y, 100);
        await d.click(W[MB].x, W[MB].y, 'middle'); await sleep(80);
        check('T8 the middle button again closes it, wherever it lands', !(await open()) && (await val('multiplier')) === 1);

        await d.move(cx, cy);
        await d.down(cx, cy, 'middle'); await sleep(260);
        await d.move(W[DENS].x, W[DENS].y, 4); await sleep(30);
        await d.up(W[DENS].x, W[DENS].y, 'middle'); await sleep(100);
        check('T9 middle held onto a slider and let go: the menu stays', (await open()) && JSON.stringify(await vals()) === JSON.stringify(snap));

        // ── T9b..e off the wheel nothing is blocked ──
        // "any click outside of the radial registers correctly and doesn't
        // block click events ... the radial menu goes away and the paint/ui
        // event works without needing a click to clear it"
        await d.move(cx + 420, cy); await d.down(cx + 420, cy, 'left'); await sleep(50);
        const off1 = { open: await open(), down: await down(), begin: await begin() };
        await d.move(cx + 440, cy + 10, 1); await d.up(cx + 440, cy + 10, 'left'); await sleep(80);
        check('T9b a press on the canvas off the wheel closes the menu and starts the stroke, in one press', !off1.open && off1.down && off1.begin === 1 && !(await down()), off1);

        await d.move(cx, cy); await tapE();
        const pt = await d.ev(`(function(){ var r = document.getElementById('mixerPresetsTrigger').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
        await d.click(pt.x, pt.y); await sleep(300);
        const ui1 = { open: await open(), panel: await d.ev(`(function(){ var p = document.querySelector('.mixer-presets-panel'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0; })()`) };
        check('T9c a click on a control off the wheel closes the menu and works the control, in one click', !ui1.open && ui1.panel, ui1);
        await d.click(pt.x, pt.y); await sleep(300);

        await d.move(cx, cy); await tapE();
        const bw0 = await val('brushSize');
        await d.move(cx + 420, cy); await sleep(40);
        await wheelAt(cx + 420, cy, -100);
        check('T9d the mouse wheel off the menu is the brush\'s as usual, and the menu stays', (await val('brushSize')) > bw0 && (await open()), { bw0, now: await val('brushSize') });
        await d.ev(`(function(){ var e = document.getElementById('brushSize'); e.value = '${b0}'; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
        const moved = await d.ev(`(function(){ var c = window.__cursorPos; return c ? [Math.round(c.x), Math.round(c.y), Date.now() - c.at < 2000] : null; })()`);
        check('T9d the brush cursor follows the pointer off the wheel', !!moved && moved[2] === true, moved);

        const bg9 = await begin();
        await d.click(cx + 420, cy, 'middle'); await sleep(120);
        check('T9e the middle button off the wheel only closes it: no second menu, no paint', !(await open()) && (await begin()) === bg9 && !(await down()));
        await d.click(cx + 420, cy, 'middle'); await sleep(120);
        check('T9e ...and the next middle click opens it there as usual', await open());
        await esc();

        // ── T10, T11 key and control items ──
        await d.ev(`window.RadialMenu.add({ label: 'Freeze', combo: 'Space' })`);
        await d.ev(`window.RadialMenu.addControl({ kind: 'click', role: 'toggle', target: { id: 'cursorToggle' }, name: 'Show Cursor', where: 'Display' }, document.getElementById('cursorToggle'))`);
        const f0 = await frozen();
        await d.move(cx, cy); await tapE();
        W = await wedges();
        const FRZ = 9, CUR = 10;
        check('T10 eleven wedges: a key item with its key cap, a control item by name', W.length === 11 && W[FRZ].t === 'Freeze' && W[CUR].t === 'Show Cursor' && W[FRZ].v === null, W.slice(9).map(w => w.t));
        await d.click(W[FRZ].x, W[FRZ].y); await sleep(120);
        check('T10 click the key item: pressed, menu closed', !(await open()) && (await frozen()) === !f0);
        await d.move(cx, cy);
        await d.keyDown(...E, [], 'e'); await sleep(260);
        await d.move(W[FRZ].x, W[FRZ].y); await sleep(40);
        await d.keyUp(...E); await sleep(120);
        check('T10 hold E, let go on the key item: pressed, menu closed', !(await open()) && (await frozen()) === f0);
        await d.move(cx, cy);
        await d.keyDown(...E, [], 'e'); await d.move(W[FRZ].x, W[FRZ].y); await d.keyUp(...E); await sleep(100);
        check('T10 a fast tap with the pointer on it does not fire it', (await open()) && (await frozen()) === f0);
        const cur0 = await d.ev(`document.getElementById('cursorToggle').checked`);
        await d.click(W[CUR].x, W[CUR].y); await sleep(120);
        check('T11 click the control item: its checkbox flips, menu closed', !(await open()) && (await d.ev(`document.getElementById('cursorToggle').checked`)) === !cur0);
        await d.ev(`document.getElementById('cursorToggle').click()`);

        // ── T12 right button set to Radial menu ──
        await d.ev(`window.ButtonModes.setMode('right', 'radial')`);
        await d.move(cx, cy);
        await d.down(cx, cy, 'right'); await sleep(260);
        check('T12 right press opens the menu', await open());
        await d.move(W[FRZ].x, W[FRZ].y, 2); await sleep(30);
        await d.up(W[FRZ].x, W[FRZ].y, 'right'); await sleep(150);
        const ctx = await d.ev('window.__ctx');
        check('T12 right hold, let go on the key item: pressed, no browser menu', !(await open()) && (await frozen()) === !f0 && ctx.length > 0 && ctx.every(Boolean), ctx);
        await d.ev(`window.__fluidFrozen ? window.toggleFreeze() : 0`);
        await d.ev(`window.ButtonModes.setMode('right', 'replay')`);

        // ── T13, T14 painting is untouched ──
        const bg = await begin();
        await d.move(cx, cy); await d.down(cx, cy, 'left'); await sleep(50);
        const dn = await down();
        await d.move(cx + 30, cy + 10, 1); await d.up(cx + 30, cy + 10, 'left'); await sleep(80);
        check('T13 left button still paints', dn && !(await down()) && (await begin()) === bg + 1);
        await d.ev(`window.ButtonModes.setMode('middle', 'paint')`);
        await d.down(cx, cy, 'middle'); await sleep(50);
        const dn2 = await down(), op2 = await open();
        await d.move(cx + 30, cy, 4); await d.up(cx + 30, cy, 'middle'); await sleep(80);
        check('T14 middle set to Brushstroke paints and ends its stroke', dn2 && !op2 && !(await down()) && (await begin()) === bg + 2);
        await d.ev(`window.ButtonModes.setMode('middle', 'replay')`);
        await d.down(cx, cy, 'middle'); await sleep(80);
        const rp = await d.ev('typeof isReplayActive !== "undefined" ? isReplayActive : null');
        await d.up(cx, cy, 'middle'); await sleep(80);
        const rp2 = await d.ev('typeof isReplayActive !== "undefined" ? isReplayActive : null');
        check('T14 middle set to Replay holds and releases the replay', rp === true && rp2 === false, { rp, rp2 });
        await d.ev(`window.ButtonModes.setMode('middle', 'radial')`);

        // ── T15 the no-button-paints line ──
        const lock = async () => d.ev(`(function(){ var l = document.querySelector('.button-roles-lock'); return { shown: l.style.display !== 'none', text: l.textContent }; })()`);
        check('T15 lock hidden by default', !(await lock()).shown);
        await d.ev(`window.ButtonModes.setMode('left', 'replay')`);
        const l1 = await lock();
        check('T15 left+right replay, middle radial = painting lock', l1.shown && /painting lock/.test(l1.text), l1);
        await d.ev(`window.ButtonModes.setMode('left', 'radial'); window.ButtonModes.setMode('right', 'radial')`);
        const l2 = await lock();
        check('T15 all radial = no button paints, no lock claim', l2.shown && !/painting lock/.test(l2.text), l2);
        await d.ev(`window.ButtonModes.reset()`);
        const sel = await d.ev(`['left','right','middle'].map(function(k){ return document.getElementById('buttonMode_' + k).value; })`);
        check('T15 reset: selects follow (paint, replay, radial), no warning', sel.join() === 'paint,replay,radial' && !(await lock()).shown, sel);

        // ── T24..T26 when E must not, and the screen's edge ──
        await d.ev(`(function(){ window.appConfirm({ title: 'x', message: 'y' }); return 1; })()`);
        await sleep(100);
        await d.tap(...E, [], 'e');
        check('T24 E does nothing under a dialog', !(await open()));
        await esc(); await sleep(100);
        await d.ev('window.HotkeyBinds.start()'); await sleep(100);
        await d.tap(...E, [], 'e');
        check('T25 E does nothing in bind mode', !(await open()));
        await d.ev('window.HotkeyBinds.stop()'); await sleep(100);
        await d.move(6, cy);
        await tapE();
        const edge = await d.ev(`(function(){ var r = document.querySelector('.radial-svg').getBoundingClientRect(); return { l: r.left, r: r.right, hot: document.querySelectorAll('.radial-wedge.is-hot').length }; })()`);
        check('T26 wheel whole on screen at the left edge, nothing picked by the tap', edge.l >= 0 && edge.r <= 1584 && edge.hot === 0 && (await open()), edge);
        await esc();

        // ── T28 E in the middle of a stroke ──
        const b28 = await begin(), f28 = await frozen();
        await d.move(cx - 100, cy - 100); await d.down(cx - 100, cy - 100, 'left'); await sleep(40);
        await d.move(cx - 60, cy - 100, 1); await sleep(30);
        await d.keyDown(...E, [], 'e'); await sleep(260);
        const mid28 = { open: await open(), down: await down() };
        const W28 = await wedges();
        await d.move(W28[FRZ].x, W28[FRZ].y, 1); await sleep(30);
        await d.keyUp(...E); await sleep(100);
        const fired = (await frozen()) === !f28 && !(await open());
        const stillDown = await down();
        await d.up(W28[FRZ].x, W28[FRZ].y, 'left'); await sleep(100);
        check('T28 E mid-stroke: the item runs, the stroke stays down until its own lift, then ends', mid28.open && mid28.down && fired && stillDown && !(await down()) && (await begin()) === b28 + 1, { mid28, fired, stillDown });
        await d.ev(`window.__fluidFrozen ? window.toggleFreeze() : 0`);

        // ── T21 press() ──
        const cap = await d.ev(`(function(){ var n = 0, was = window.captureLayer; window.captureLayer = function(){ n++; }; window.Hotkeys.press('Shift+Enter'); window.captureLayer = was; return n; })()`);
        check('T21 Hotkeys.press("Shift+Enter") reaches Capture Layer', cap === 1, cap);
        const foc = await d.ev(`(function(){ var cb = document.getElementById('focusModeToggle'); var a = cb ? cb.checked : null; window.Hotkeys.press('KeyF'); var b = cb ? cb.checked : null; window.Hotkeys.press('KeyF'); return [a, b, cb ? cb.checked : null]; })()`);
        check('T21 Hotkeys.press("KeyF") toggles focus mode and back', foc[0] !== foc[1] && foc[0] === foc[2], foc);

        const errs = d.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
        check('no page errors', errs.length === 0, errs.slice(0, 3).map(e => e.params.exceptionDetails ? (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) : (e.params.args || []).map(a => a.value || a.description).join(' ')));
    } catch (e) { console.error('DRIVER FAIL', e); results.push({ name: 'driver', ok: false }); }
    const bad = results.filter(r => !r.ok);
    console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
    await d.close();
    process.exit(bad.length ? 1 : 0);
})();
