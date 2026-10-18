// Walnut & Copper tubes (css/36-theme-tubes.css, js/72-theme-tubes.js):
// every slider family at its minimum, a middle value and its maximum, in
// both sidebars and the top bar, measured from the rendered pixels.
//
//   node scripts/test/theme-tubes/run.js
//   SHOT_DIR=<dir> node scripts/test/theme-tubes/run.js   (also writes each tube)
//
// For each tube it finds, in a screenshot of the input's box, the two copper
// diamonds (their centre column) and the end of the lit column, and checks
// them against the native thumb's centre, h + p * (width - 2h) of the input
// (h = half the thumb, 8 px; the app's own travel, which js/06's
// applyFraction also uses), and against the glass, which spans the input's
// width round that travel (its 7 px rounded ends outside it):
//   - at the minimum the glass is empty (no lit pixel in it, the filament
//     shows) and both diamonds sit on the thumb's centre, on the glass's
//     straight part;
//   - in the middle the column ends, and both diamonds sit, on the thumb's
//     centre;
//   - at the maximum the column fills the glass to its end, and the head
//     (the column's brightest point near its end) and both diamonds sit on
//     the thumb's centre, on the glass's straight part;
//   - nothing lit or copper pokes out past the glass's ends.
// Then a press on the track beside the value moves it to where the native
// slider maps that press, which is where the tube draws it (the diamonds
// and the thumb share one travel). Stepped sliders carry js/72's --steps.
// Three passes: 1440 px at DPR 2 (the bar's 1.15 zoom), 1920 at DPR 1
// (1.12), and 1440 at DPR 2 on a coarse pointer (touch emulation), where
// the app's thumb is 28 px (css/slider-styles.css) and the travel and the
// tube follow it. Reduced motion is emulated so js/71's spring settles at
// once.
// Exit 1 if any check fails. Uses the radial menu's driver (own server,
// scratch profile; values are set through the real inputs).
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { boot, sleep } = require('../radial-menu/driver');

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }

// [id, drawer to open (null: always on screen), stepped?]
const TUBES = [
    ['brushSizePerceptual', null], ['brushSteady', null], ['curl', null],
    ['brushFlow', '^\\s*Brush\\s*$'], ['brushAngle', '^\\s*Brush\\s*$'],
    ['multiplier', 'Multi', 8], ['symmetryHold', 'Multi'],
    ['replaySpeed', 'Stroke', 16],
    ['pressureDissipation', 'Simulation'], ['mgCycles', 'Simulation', 3], ['mgRelax', 'Simulation'],
    ['canvasOpacity', 'Display'],
];
const PASSES = [{ w: 1440, h: 900, dpr: 2 }, { w: 1920, h: 1080, dpr: 1 }, { w: 1440, h: 900, dpr: 2, coarse: true }];

const copper = (r, g, b) => r > 140 && b > 70 && r - b > 45 && g > b - 5 && g < r - 15;   // cu-hi diamonds, the bar's wire
const lum = (r, g, b) => (r + g + b) / 3;

async function measure(d, id, dpr) {
    // the input's box in client px, its zoom, value and geometry
    const g = await d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); var r = e.getBoundingClientRect();
        var z = r.width / e.offsetWidth; var cs = getComputedStyle(e);
        return { x: r.left, y: r.top, w: r.width, h: r.height, z: z, W: e.offsetWidth, v: +e.value, min: +e.min, max: +e.max, steps: cs.getPropertyValue('--steps').trim(),
            hh: (parseFloat(cs.getPropertyValue('--thumb-w')) || 16) / 2,
            dy: parseFloat(cs.getPropertyValue('--wc-dy')) || Math.min(13.5, Math.max(9.5, (e.offsetHeight - 15) / 2)) }; })()`);
    const pad = 6;
    const clip = { x: g.x - pad * g.z, y: g.y, width: g.w + 2 * pad * g.z, height: g.h, scale: 1 };
    const s = await d.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
    const buf = Buffer.from(s.data, 'base64');
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const S = dpr * g.z;                        // device px per CSS px of the input
    const px = (cx, cy) => { const X = Math.round((cx + pad) * S), Y = Math.round(cy * S); const i = (Y * info.width + X) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
    const H = g.h / g.z, mid = H / 2;           // CSS px, input coords
    const p = (g.v - g.min) / (g.max - g.min);
    const xt = g.hh + p * (g.W - 2 * g.hh), gL = 0, gR = g.W;
    // diamonds: copper pixels in the band above (and below) the glass, within
    // 12 px of the thumb's centre (the wood's light grain and the detent ticks
    // elsewhere along the row are copper-ish too); none there is a failure.
    // The band starts 2 px inside the diamond's centre, clear of the glass's
    // copper ring (2.5 px round the 14 px glass, 3 px in the top bar), whose
    // edge pixels would pull the centre toward whichever side is unlit.
    const marks = [];
    for (const sign of [-1, 1]) {
        let sx = 0, n = 0;
        for (let cy = mid + sign * (g.dy - 2); sign < 0 ? cy >= mid + sign * (g.dy + 3) : cy <= mid + sign * (g.dy + 3); cy += sign / S) {
            for (let cx = Math.max(-pad, xt - 12) + 0.5 / S; cx < Math.min(g.W + pad, xt + 12); cx += 1 / S) { const c = px(cx, cy); if (copper(c[0], c[1], c[2])) { sx += cx; n++; } }
        }
        marks.push(n > 3 ? sx / n : null);
    }
    // the lit column along a line 2 px above the glass's centre (off the
    // filament): where it ends inside the glass, and anything as bright
    // outside the glass's ends (the copper ring itself is dimmer)
    // colEnd: the last pixel of the column's colour (orange to red, or the
    // top bar's gold) inside the glass; head: the brightest point within
    // 12 px of the thumb's centre (the head, or the top bar's bright stretch)
    let litEnd = null, litOut = 0, maxLitIn = 0, colEnd = null, head = null, headL = -1;
    for (let cx = -pad + 0.5 / S; cx < g.W + pad; cx += 1 / S) {
        const c = px(cx, mid - 1); const L = lum(c[0], c[1], c[2]);
        const inside = cx > gL && cx < gR;
        if (cx > gL + 1 && cx < gR - 1) maxLitIn = Math.max(maxLitIn, L);
        if (L > 140) { if (inside) litEnd = cx; else if (cx < gL - 2 || cx > gR + 2) litOut++; }
        if (inside && c[0] > 70 && c[0] - c[2] > 40) colEnd = cx;
        if (inside && Math.abs(cx - xt) <= 12 && L > headL) { headL = L; head = cx; }
    }
    // the filament: the centre rows are brighter than the rows beside them
    const row = (cy) => { let t = 0, n = 0; for (let cx = gR - 40; cx < gR - 6; cx += 1 / S) { const c = px(cx, cy); t += lum(c[0], c[1], c[2]); n++; } return t / n; };
    let peak = 0; for (let cy = mid - 1.2; cy <= mid + 1.2; cy += 0.5 / S) peak = Math.max(peak, row(cy));
    const fil = [peak, row(mid - 2.5), row(mid + 2.5)];
    // within 1.25 CSS px plus a device pixel of rasterisation
    return { g, p, xt, gL, gR, marks, litEnd, litOut, maxLitIn, colEnd, head, fil, buf, tol: 1.25 + 1 / S };
}

(async () => {
    for (const pass of PASSES) {
        const d = await boot({ args: ['--disable-gpu-compositing'] });
        try {
            await d.send('Emulation.setDeviceMetricsOverride', { width: pass.w, height: pass.h, deviceScaleFactor: pass.dpr, mobile: false });
            await d.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            // (pointer: coarse); the test's own events stay mouse events
            if (pass.coarse) await d.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
            await d.load(); await sleep(900);
            const tag = pass.w + '@' + pass.dpr + 'x' + (pass.coarse ? '-coarse' : '');
            check(tag + ' theme is walnut-copper', (await d.ev('document.documentElement.dataset.theme')) === 'walnut-copper');
            if (pass.coarse) {
                const tw = await d.ev(`matchMedia('(pointer: coarse)').matches && getComputedStyle(document.getElementById('brushFlow')).getPropertyValue('--thumb-w').trim()`);
                check(tag + ' a coarse pointer keeps the 28 px thumb of the app', tw === '28px', { thumbW: tw });
            }
            for (const [id, re, stepped] of TUBES) {
                if (re) {
                    await d.ev(`(async function(){ var re = new RegExp(${JSON.stringify(re)});
                        var t = [].slice.call(document.querySelectorAll('#sidebar-left .section-title, #sidebar-right .section-title')).find(function(x){ return re.test(x.textContent.trim()); });
                        if (t && t.getAttribute('aria-expanded') !== 'true') { t.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); await new Promise(function(r){ setTimeout(r, 500); }); }
                        return 1; })()`);
                }
                if (stepped) {
                    const st = await d.ev(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).getPropertyValue('--steps').trim()`);
                    check(tag + ' ' + id + ' carries --steps for its ' + stepped + ' detents', st === String(stepped - 1), { steps: st });
                }
                for (const which of ['min', 'mid', 'max']) {
                    const ok = await d.ev(`(async function(){ var e = document.getElementById(${JSON.stringify(id)}); if (!e || !e.offsetParent) return false;
                        var mn = +e.min, mx = +e.max, st = parseFloat(e.step) || 0;
                        var x = ${JSON.stringify(which)} === 'min' ? mn : ${JSON.stringify(which)} === 'max' ? mx : mn + (mx - mn) * 0.62;
                        if (st > 0) x = Math.round((x - mn) / st) * st + mn;
                        e.value = String(x); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
                        e.scrollIntoView({ block: 'center' });
                        await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); });
                        await new Promise(function(r){ setTimeout(r, 150); }); return true; })()`);
                    if (!ok) { check(tag + ' ' + id + ' is on screen', false); break; }
                    const m = await measure(d, id, pass.dpr);
                    if (process.env.SHOT_DIR) { fs.mkdirSync(process.env.SHOT_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.SHOT_DIR, tag + '-' + id + '-' + which + '.png'), m.buf); }
                    const near = (a, b, t) => a !== null && Math.abs(a - b) <= t;
                    const r2 = v => v === null ? null : +v.toFixed(2);
                    const det = { p: +m.p.toFixed(3), thumb: +m.xt.toFixed(2), marks: m.marks.map(r2), litEnd: r2(m.litEnd), colEnd: r2(m.colEnd), head: r2(m.head), glass: [m.gL, m.gR] };
                    // the glass's straight part: 7 px (its radius) in from each end;
                    // the diamonds are measured onto the thumb's centre, which must lie on it
                    const straight = (x) => x !== null && x >= m.gL + 7 && x <= m.gR - 7;
                    check(tag + ' ' + id + ' ' + which + ': both diamonds on the thumb centre', near(m.marks[0], m.xt, m.tol) && near(m.marks[1], m.xt, m.tol), det);
                    check(tag + ' ' + id + ' ' + which + ': nothing lit past the glass ends', m.litOut === 0, { litOut: m.litOut });
                    if (which !== 'mid') check(tag + ' ' + id + ' ' + which + ': the thumb centre and both diamonds on the straight part of the glass', straight(m.xt) && near(m.marks[0], m.xt, m.tol) && near(m.marks[1], m.xt, m.tol), det);
                    if (which === 'min') {
                        check(tag + ' ' + id + ' min: empty glass, no glow in it', m.maxLitIn < 100, { maxLitIn: Math.round(m.maxLitIn) });
                        check(tag + ' ' + id + ' min: the filament shows', m.fil[0] > m.fil[1] + 6 && m.fil[0] > m.fil[2] + 6, { rows: m.fil.map(Math.round) });
                    } else if (which === 'max') {
                        check(tag + ' ' + id + ' max: the column fills the glass', near(m.colEnd, m.gR, 2), det);
                        check(tag + ' ' + id + ' max: the head on the thumb centre', m.head !== null && m.head >= m.xt - 5 && m.head <= m.xt + m.tol, det);
                    } else {
                        check(tag + ' ' + id + ' mid: the column ends on the thumb centre', near(m.litEnd, m.xt, m.tol + 0.5), det);
                    }
                }
            }
            // A press on the track beside the value lands where the tube says.
            for (const id of ['symmetryHold', 'pressureDissipation', 'brushFlow']) {
                const r = await d.ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); e.value = e.max; e.dispatchEvent(new Event('input', { bubbles: true }));
                    e.scrollIntoView({ block: 'center' }); var b = e.getBoundingClientRect(); var z = b.width / e.offsetWidth;
                    var h = (parseFloat(getComputedStyle(e).getPropertyValue('--thumb-w')) || 16) / 2;
                    var x = b.left + (h + 0.3 * (e.offsetWidth - 2 * h)) * z;
                    return { x: x, y: b.top + b.height / 2, min: +e.min, max: +e.max, step: parseFloat(e.step) || 0 }; })()`);
                await sleep(200);
                await d.click(r.x, r.y); await sleep(200);
                const v = await d.ev(`+document.getElementById(${JSON.stringify(id)}).value`);
                const want = r.min + 0.3 * (r.max - r.min);
                check(tag + ' ' + id + ': a press at 30% of the travel sets 30%', Math.abs(v - want) <= Math.max(r.step, (r.max - r.min) * 0.006) + 1e-9, { got: v, want: +want.toFixed(4) });
            }
        } catch (e) {
            check('harness', false, String(e && e.stack || e));
        } finally {
            await d.close();
        }
    }
    const failed = results.filter(r => !r.ok).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
    process.exit(failed ? 1 : 0);
})();
