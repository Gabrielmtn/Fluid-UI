// ═══════════════════════════════════════════════════════════════════
// js/45-breathing.js — the Breathing effect (Effects → Breathing).
// LOAD ORDER: after 20-mixer-layout.js (its row is built there) and after
//   23-depth-collision.js (its two rings are a procedural collider source);
//   binds the legacy controls in index.html by id like 05e does.
// PROVIDES: window.Breathing — start(), stop(), isOn(), phase(), value(),
//   seek(seconds), PATTERNS
//
// A guided breath, in the fluid. calm.com/breathe is a circle that grows
// while you breathe in and shrinks while you breathe out. Here the circle
// is two concentric circular walls (a procedural collider source, 23) that
// GROW and SHRINK with the breath, and the paint between them — in the
// brush colour — moves with them and slowly swirls. The walls are redrawn
// into the obstacle every sim frame they move; the fluid is carried along
// by an exact dilation push (velocity ∝ radius × wall speed, laid as three
// concentric bands per frame through 05i ringSplat), so the paint travels
// with the walls instead of being covered by them. The bands counter-
// rotate a little, which shears the paint into slow eddies between the
// rings — the swirl. Paint is laid only while breathing in, in proportion
// to the walls' travel, so a breath deposits a bounded amount whatever the
// frame rate. Holds keep only the swirl. A word under the rings keeps
// time. Nothing is written to config; the controls are registry-backed
// and read live, so presets carry them.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    // seconds: inhale, hold, exhale, hold
    const PATTERNS = {
        relaxed: { in: 4, holdIn: 0, out: 4, holdOut: 0, label: 'Relaxed 4 · 4' },
        box:     { in: 4, holdIn: 4, out: 4, holdOut: 4, label: 'Box 4 · 4 · 4 · 4' },
        '478':   { in: 4, holdIn: 7, out: 8, holdOut: 0, label: '4 · 7 · 8' }
    };
    const CUE = { in: 'Breathe in', holdIn: 'Hold', out: 'Breathe out', holdOut: 'Hold' };
    const R_MIN_F = 0.16, R_MAX_F = 0.42;  // outer wall radius, fraction of the shorter canvas side
    const CORE = 0.30;                     // inner wall radius as a fraction of the outer
    const WALL = 0.018;                    // wall thickness, fraction of the shorter side (never under 6 px)
    const BANDS = 3;                       // concentric velocity/dye bands per frame
    // Velocity units are a stroke's: pointer.dx = px moved this frame × 10 (05d).
    const FOLLOW = 5;                      // × 2·Strength: dilation impulse per frame as a share of 10·(wall travel)
    const SWIRL = 20;                      // tangential impulse per band at Strength 1, alternating direction
    const FILL = 1.2;                      // dye one inhale leaves in the band, in colour units
    const FILL_OUT = 0.5;                  // the exhale's share of it, so the ring is never empty
    const GATE_FILL_K = 1.6;               // Gate converges (1 − e^−fill); ask for more to land near the same tone
    // WALL STRENGTH — the collider collapse (measured 2026-09-02, pane sim
    // 167×256): a MOVING wall at coverage ≥ 0.5 with any tangential velocity
    // beside it (swirl 1 was enough) drives the whole velocity field to the
    // sim's 30-unit clamp within a breath and the dye washes uniform or
    // vanishes; the same walls standing still are fine at full strength, and
    // moving walls at 0.3 stay stable under FOLLOW 5 / SWIRL 20 (peak field
    // ~1.7). So the rings are drawn at 0.3 coverage: below the solidity knee,
    // still enough to hold the paint (mid-exhale dye beyond the shrinking
    // outer ring ≈ 0.02 of the band's). Gabriel's known "shader collapse
    // under strong colliders"; two rings compound it.
    const WALL_ALPHA = 0.3;
    const BLACK = [0, 0, 0];

    // Live knobs (console / harness): wall strength, redraw cadence, push,
    // swirl and fill are tunable without a reload — `Breathing.tune`.
    const TUNE = { follow: FOLLOW, swirl: SWIRL, wallAlpha: WALL_ALPHA, wallEvery: 1, fill: FILL };

    let on = false, raf = 0, t0 = 0, cueEl = null, lastCue = '';
    let lastPhase = '', lastR = null, drawnR = -1, lastSerial = -1, curFrac = 0, frameNo = 0;
    let col = [1, 1, 1], wallsOn = false;

    function pattern() { const s = $('breathPattern'); return PATTERNS[s && s.value] || PATTERNS.relaxed; }
    function strength() { const s = $('breathStrength'); const v = s ? parseFloat(s.value) : 0.5; return isFinite(v) ? v : 0.5; }
    function cueWanted() { const c = $('breathCueToggle'); return c ? c.checked : true; }
    function paused() { const b = $('pauseBtn'); return !!(b && (b.classList.contains('active') || b.textContent.trim() === '▶')); }
    function pickerColor() {
        try {
            const hex = $('colorPicker').value;
            return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
        } catch (_) { return [1, 1, 1]; }
    }

    function phaseAt(t) {
        const p = pattern();
        const cycle = p.in + p.holdIn + p.out + p.holdOut;
        let u = t % cycle;
        if (u < p.in) return { name: 'in', k: u / p.in, dir: 1 };
        u -= p.in;
        if (u < p.holdIn) return { name: 'holdIn', k: u / p.holdIn, dir: 0 };
        u -= p.holdIn;
        if (u < p.out) return { name: 'out', k: u / p.out, dir: -1 };
        u -= p.out;
        return { name: 'holdOut', k: p.holdOut ? u / p.holdOut : 0, dir: 0 };
    }
    const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * k);
    function radiusFrac(ph) {
        if (ph.name === 'in') return ease(ph.k);
        if (ph.name === 'holdIn') return 1;
        if (ph.name === 'out') return 1 - ease(ph.k);
        return 0;
    }

    // ── Geometry (canvas px) at a given breath fraction ───────────────
    // a..b is the band the paint lives in: a wall's width inside each ring,
    // so the bands' soft edges never read as leaking through.
    function geom(canvas, frac) {
        const minDim = Math.min(canvas.width, canvas.height);
        const wall = Math.max(6, WALL * minDim);
        const rOut = minDim * (R_MIN_F + (R_MAX_F - R_MIN_F) * frac);
        const rIn = rOut * CORE;
        return { minDim: minDim, wall: wall, rOut: rOut, rIn: rIn, a: rIn + wall, b: rOut - wall };
    }

    // ── The two rings: a procedural collider source (23) ──────────────
    // Drawn into the obstacle canvas in canvas px through the same scale the
    // text walls use; solid white = full coverage. 23 composites every
    // source on each recomposite, so a moving ring is one
    // updateObstacleFromLayers() per frame (coalesced onto rAF there).
    function wallDraw(ctx, obsW, obsH) {
        const canvas = $('canvas');
        if (!canvas || canvas.width < 8 || canvas.height < 8) return;
        const g = geom(canvas, curFrac);
        const kx = obsW / canvas.width, ky = obsH / canvas.height;
        ctx.save();
        ctx.translate(canvas.width * 0.5 * kx, canvas.height * 0.5 * ky);
        ctx.scale(kx, ky);
        ctx.globalAlpha = Math.max(0.05, Math.min(1, TUNE.wallAlpha));
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = g.wall;
        ctx.beginPath(); ctx.arc(0, 0, g.rIn, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, g.rOut, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
    function walls(want) {
        const cl = window.collisionLayers;
        if (!cl || typeof cl.setProceduralSource !== 'function') return;
        if (want === wallsOn) return;
        wallsOn = want;
        drawnR = -1;
        try { cl.setProceduralSource('breathing', want ? wallDraw : null); } catch (_) {}
    }
    function wallsMove(rOut) {
        if (!wallsOn || Math.abs(rOut - drawnR) < 0.5) return;
        if ((frameNo % Math.max(1, TUNE.wallEvery | 0)) !== 0) return;
        drawnR = rOut;
        const cl = window.collisionLayers;
        if (cl && typeof cl.updateObstacleFromLayers === 'function') { try { cl.updateObstacleFromLayers(); } catch (_) {} }
    }

    // ── The breath itself ─────────────────────────────────────────────
    function ring(cx, cy, R, th, radial, swirl, colour, opts) {
        try { window.applyRingSplat(cx, cy, R, th, radial, swirl, 1, colour, opts); } catch (_) {}
    }
    function tick(now) {
        if (!on) return;
        const t = (now - t0) / 1000;
        const ph = phaseAt(t);
        if (ph.name !== lastPhase) {
            lastPhase = ph.name;
            if (ph.name === 'in') {
                col = pickerColor();          // each breath takes the brush colour as it is now
                // Something (Clear, a collider reset) may have dropped the walls.
                if (window.collisionLayers && !window.collisionLayers.enabled) { wallsOn = false; walls(true); }
            }
        }
        curFrac = radiusFrac(ph);
        const canvas = $('canvas');
        const live = !!(canvas && typeof window.applyRingSplat === 'function'
            && !window.__fluidFrozen && !paused() && !window.__mpTurnBlocked);
        // One step per SIM frame, not per animation frame: on a 144 Hz display
        // rAF runs 2.4× faster than 05j's 60 fps loop (measured), and a push
        // per rAF would inject 2.4× the momentum. 05j bumps __drawSerial once
        // per update(); the cue still tracks every rAF.
        const serial = (typeof window.__drawSerial === 'number') ? window.__drawSerial : -2;
        const fresh = serial === -2 || serial !== lastSerial;
        lastSerial = serial;
        if (!live) {
            lastR = null;                     // paused / frozen / not our turn: resume without a jump
        } else if (fresh && canvas.width > 8 && canvas.height > 8) {
            const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
            const g = geom(canvas, curFrac);
            const dR = (lastR === null) ? 0 : g.rOut - lastR;   // the outer wall's travel this frame, px
            lastR = g.rOut;
            frameNo++;
            wallsMove(g.rOut);
            const s = strength();
            const dtK = (typeof window.__simDtMs === 'number' && window.__simDtMs > 0) ? Math.min(2, window.__simDtMs / 16.7) : 1;
            // Dilation: the fluid follows the walls — radial speed grows with
            // the radius, exactly like the walls' own motion. dR is already
            // per sim frame, so no dt scaling here.
            const follow = 10 * dR * TUNE.follow * 2 * s;
            const gate = !!(window.config && window.config.COLOR_GATE);
            // Paint in proportion to the walls' travel, so a whole inhale sums
            // to FILL whatever the frame rate. The exhale lays a share too
            // (FILL_OUT): the ring must never empty out — the paint that the
            // shrinking walls fade away (05b's forced fade under coverage) is
            // topped up, so the breath ends small and full, not gone.
            const share = ph.dir > 0 ? 1 : (ph.dir < 0 ? FILL_OUT : 0);
            const k = share ? Math.min(0.3, share * TUNE.fill * (gate ? GATE_FILL_K : 1) * Math.abs(dR) / ((R_MAX_F - R_MIN_F) * g.minDim)) : 0;
            const sigma = (g.b - g.a) / (2 * BANDS);
            const th = Math.max(1e-6, (sigma / h) * (sigma / h));
            for (let i = 0; i < BANDS; i++) {
                const r = g.a + (g.b - g.a) * (i + 0.5) / BANDS;
                const radial = follow * (r / g.rOut);
                const swirl = TUNE.swirl * s * dtK * ((i & 1) ? -1 : 1);
                if (k >= 0.0005) {
                    if (gate) ring(cx, cy, r, th, radial, swirl, col, { flow: k });
                    else ring(cx, cy, r, th, radial, swirl, [col[0] * k, col[1] * k, col[2] * k], null);
                } else if (Math.abs(radial) > 0.05 || Math.abs(swirl) > 0.05) {
                    ring(cx, cy, r, th, radial, swirl, BLACK, { velOnly: true });
                }
            }
        }
        cueUpdate(ph);
        raf = requestAnimationFrame(tick);
    }

    // ── Cue words (DOM under the rings; transform-only per frame) ─────
    function cueBuild() {
        if (cueEl) return;
        cueEl = document.createElement('div');
        cueEl.id = 'breathCue';
        document.body.appendChild(cueEl);
    }
    function cueUpdate(ph) {
        if (!cueWanted()) { cueHide(); return; }
        cueBuild();
        const wrap = $('canvas-wrapper');
        if (!wrap) { cueHide(); return; }
        const r = wrap.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) { cueHide(); return; }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const rOut = Math.min(r.width, r.height) * R_MAX_F;   // under the rings at their largest: the word stays put
        cueEl.style.transform = 'translate(' + cx + 'px,' + (cy + rOut + 22) + 'px) translate(-50%, 0)';
        const cue = CUE[ph.name] || '';
        if (cue !== lastCue) { cueEl.textContent = cue; lastCue = cue; }
        cueEl.classList.add('show');
    }
    function cueHide() {
        if (cueEl) cueEl.classList.remove('show');
        lastCue = '';
    }

    function start() {
        if (on) return;
        on = true;
        t0 = performance.now();
        lastPhase = ''; lastR = null; lastSerial = -1; curFrac = 0;
        walls(true);
        raf = requestAnimationFrame(tick);
    }
    function stop() {
        on = false;
        cancelAnimationFrame(raf);
        raf = 0;
        cueHide();
        walls(false);
    }
    // Jump to `sec` seconds into the cycle (previews, tests).
    function seek(sec) { if (on && isFinite(sec)) { t0 = performance.now() - sec * 1000; lastR = null; } }

    // ── Controls (legacy DOM in index.html, moved into Effects by 20) ──
    function wire() {
        const toggle = $('breathingToggle');
        const panel = $('breathingPanel');
        if (toggle) {
            const sync = () => {
                if (panel) panel.style.display = toggle.checked ? '' : 'none';
                if (toggle.checked) start(); else stop();
            };
            toggle.addEventListener('change', sync);
            sync();
        }
        const str = $('breathStrength'), strV = $('breathStrengthValue');
        if (str) {
            const show = () => { if (strV) strV.textContent = Math.round(parseFloat(str.value) * 100) + '%'; };
            str.addEventListener('input', show);
            show();
        }
        // Pattern change restarts the cycle so the cue matches the first phase.
        const pat = $('breathPattern');
        if (pat) pat.addEventListener('change', () => { if (on) { t0 = performance.now(); lastPhase = ''; lastR = null; } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();

    window.Breathing = {
        start: start, stop: stop, isOn: () => on,
        phase: () => on ? phaseAt((performance.now() - t0) / 1000) : null,
        // 0..1 lung fullness — for anything that wants to breathe along.
        value: () => on ? radiusFrac(phaseAt((performance.now() - t0) / 1000)) : 0,
        seek: seek,
        tune: TUNE,
        PATTERNS: PATTERNS
    };
})();
