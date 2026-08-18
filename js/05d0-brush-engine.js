// ═══════════════════════════════════════════════════════════════════
// js/05d0-brush-engine.js — D1 brush engine core (stroke input pipeline)
// LOAD ORDER: before 05d-input-replay.js (05d's pointer listeners feed it;
//   05j drains its dab queue). INERT until index.html's loader includes it —
//   05d/05j guard on window.BrushEngine and fall back to the legacy path.
// PROVIDES: window.BrushEngine
//
// Pipeline (docs/drawing-foundation-d0.md §2.3):
//   raw pointer samples (incl. coalesced, with pressure)
//     → stabilizer (weighted exponential lag, Krita-style)
//     → distance-parameterized dab emission (spacing in brush-relative px —
//       speed-INDEPENDENT density; kills the 1-dab-per-frame gaps)
//     → dab queue, drained by the update loop (GL work stays on the frame
//       cadence; a fast flick just drains more dabs that frame)
//
// Momentum rule (the multiplayer gap-fill lesson, 06:451): each dab carries
// velocity 10 * spacing * direction, so total injected momentum per DISTANCE
// travelled matches the legacy one-dab-per-frame path at normal speeds —
// fast strokes no longer under-inject, slow strokes are unchanged.
//
// Dye normalization (2026-08-17): each dab carries `k`, its share of the
// reference dye (spacing / BRUSH_SPACING_REF, capped at 1). Dabs are impulses,
// so dye-per-travel was flow/spacing — density and darkness were the same knob,
// which is why the default spacing could never be lowered for smoothness. With
// k, halving spacing doubles the dab count and halves each deposit: identical
// stroke, finer sampling. 05j applies it via window.__normalizePaintFlow, which
// is exact for additive AND Gate. At spacing == REF, k == 1 and nothing changes.
//
// Config (04a defaults; controls in the strip's Brush panel):
//   BRUSH_STABILIZER   0..1   (0 = raw input, no lag)
//   BRUSH_SPACING      0.001..1 dab spacing as a fraction of brush diameter
//   BRUSH_SPACING_REF  dye-per-travel anchor for k (default 0.35)
//   BRUSH_JITTER       0..1   per-dab scatter, fraction of brush diameter
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Stroke state
    var active = false;
    var sx = 0, sy = 0;          // stabilized position (chases raw input)
    var lastEmitX = 0, lastEmitY = 0; // last emitted dab position
    var residual = 0;             // distance carried between segments
    var strokeTravel = 0;         // total path length walked since begin()
    var lastEmitSimMs = 0;        // sim-clock stamp of the last dab (slow-speed floor)
    var lastP = 1;                // last pressure seen
    var queue = [];               // pending dabs: {x, y, dx, dy, p, travel}
    var MAX_QUEUE = 512;          // spike safety — oldest dabs drop first

    function cfg(key, def) {
        var c = window.config;
        return (c && typeof c[key] === 'number') ? c[key] : def;
    }

    // Approximate visible brush DIAMETER in canvas px. splatFrag's footprint
    // is exp(-dot(p,p)/radius) with p canvas-height-normalized, so the
    // ~e^-1 radius in px is sqrt(SPLAT_RADIUS)*canvas.height. Exactness is
    // irrelevant (spacing is a taste slider); consistency across brush sizes
    // is the point.
    function brushDiameterPx() {
        var canvas = document.getElementById('canvas');
        var h = (canvas && canvas.height) || 1080;
        return Math.max(4, 2 * Math.sqrt(cfg('SPLAT_RADIUS', 0.011)) * h);
    }

    // Sim-clock deposition compensation (2026-08-16).
    //
    // The walker is distance-parameterized, which makes it speed-independent
    // in HAND terms — and that is exactly what goes wrong when Time is low.
    // A dab is an impulse of dye (splat() takes no dt), so laying one every
    // `spacing` px of travel means the number of dabs per SIMULATED second
    // scales as 1/timeScale: at Time 0.25 your hand delivers four times the
    // dye per second of fluid evolution, into a field that has advected a
    // quarter as far. The deposits stack instead of being carried off and the
    // stroke saturates into a flat slab.
    //
    // Put another way: slowing time is exactly equivalent to speeding your
    // hand up — a 4× faster stroke at Time 1 muddies for the same reason —
    // and the cure is the same one. Spreading spacing by 1/timeScale restores
    // dabs-per-simulated-second to what it is at Time 1, so the fluid gets the
    // same interval to work between deposits and the stroke keeps its
    // structure. The engine's momentum rule (vx = 10 × spacing) rescales with
    // it, so total momentum per unit of travel is unchanged — the stroke
    // pushes the fluid exactly as hard as before. Only the dye rate moves.
    //
    // Capped because the Time slider floors at 0.01, and an uncapped 100×
    // would bead a stroke into isolated dots. config.BRUSH_TIME_COMP is that
    // cap (a spacing multiplier); 1 or below disables the compensation.
    // Deliberately inert at Time ≥ 1: fast time already spreads deposits out
    // on its own, and densifying there would multiply the per-frame dab cost.
    function timeCompensation() {
        var c = window.config;
        var cap = (c && typeof c.BRUSH_TIME_COMP === 'number') ? c.BRUSH_TIME_COMP : 4;
        if (!(cap > 1)) return 1;
        var s = window.timeScale;
        if (typeof s !== 'number' || !(s > 0) || s >= 1) return 1;
        return Math.min(cap, 1 / s);
    }

    // Spacing as the slider asks for it, in px, BEFORE the low-Time spread.
    //
    // The floor went 1 -> 0.25 when 0.1% was an exotic setting, and back to 1
    // on 2026-08-18 when 0.1% became the DEFAULT. At 0.25px a stroke demands
    // speed/0.25 dabs per second, which passes the drain budget around 1000px/s:
    // the queue then backs up to MAX_QUEUE and `queue.length < MAX_QUEUE` starts
    // SILENTLY DROPPING dabs, and a dropped dab takes its dye with it — measured
    // dye per pixel travelled flat at 0.00443 up to 900px/s, then 0.00358 at
    // 1200 (-19%) and 0.00212 at 2000 (-52%). A fast flick came out half as
    // dark as a slow one. At 1px the same 2000px/s stroke asks for 2000 dabs/s
    // (33 per frame against a budget of 64) and stays exact, while 1px gaps on
    // a ~194px brush are still visually continuous — the smoothness at low speed
    // comes from the time floor below, not from sub-pixel spacing.
    function baseSpacingPx() {
        return Math.max(cfg('BRUSH_SPACING_MIN_PX', 1),
                        cfg('BRUSH_SPACING', 0.001) * brushDiameterPx());
    }

    function spacingPx() {
        return baseSpacingPx() * timeCompensation();
    }

    // Dye normalization on the DISTANCE axis (2026-08-17). Dabs are impulses, so
    // dye-per-travel = flow / spacing — lowering spacing for smoothness used to
    // darken the stroke in exact proportion, which is why the default was stuck
    // at a value calibrated for a much smaller tip. Scaling each dab by
    // spacing/REF holds dye-per-pixel-travelled constant, so Spacing becomes a
    // texture control: 7x the dabs, 1/7 the dye each, same stroke.
    //
    // `used` is the spacing this dab was actually laid at, which folds in the
    // 0.25px floor and the coalescing bump below — both are sampling artefacts
    // and both must be compensated, or a fast segment would silently lighten.
    //
    // timeCompensation is deliberately NOT compensated: spreading spacing at low
    // Time exists precisely to deposit LESS dye per simulated second (the flat
    // over-saturated middle), so cancelling it here would undo that fix. Hence
    // the ratio is taken against baseSpacingPx, not spacingPx.
    //
    // Clamped to 1: a dab can't deposit more than full flow, so spacings above
    // REF thin the stroke exactly as they always did.
    function dabFlowShare(used) {
        var ref = cfg('BRUSH_SPACING_REF', 0.35) * brushDiameterPx();
        var tc = timeCompensation();
        if (!(ref > 0) || !(tc > 0)) return 1;
        // used already carries floor x timeComp x coalescing bump; dividing the
        // timeComp back out leaves exactly the artefacts we DO want to cancel.
        return Math.min(1, used / (tc * ref));
    }

    function simNowMs() {
        var t = window.__simTimeMs;
        return (typeof t === 'number') ? t : 0;
    }

    // ── Slow-speed dab floor (2026-08-18) ───────────────────────────────
    // The walker is distance-parameterized, so its rate is speed / spacing —
    // which goes to ZERO as the hand slows. Measured at the shipped 0.05
    // spacing: 41 dabs/s at 400px/s, but 5 at 50px/s and 2 at 25px/s, and
    // 4x worse again below Time 1 (timeCompensation spreads spacing). Lowering
    // the default spacing moved that cliff ~7x further down but could never
    // remove it; a very slow stroke still arrives as isolated deposits.
    //
    // The cure is the one the constant-flow hose already uses: stop treating a
    // dab as a fixed quantum of paint and treat it as a SAMPLE. When a segment
    // hasn't covered a full spacing yet, emit a dab for the distance actually
    // travelled, carrying dye in exact proportion (k = travel / reference) —
    // so total dye per pixel travelled is identical, and only the sampling gets
    // finer. Consuming `residual` is what keeps it honest: that travel is now
    // deposited, so the walker cannot bill for it again.
    //
    // Gated on the SIM clock, so the Time slider still meters it, and on
    // residual > 0, so a genuinely stationary pointer still deposits nothing —
    // On Move keeps its contract. The sim clock only ticks once per frame, so
    // this lands at most one extra dab per frame: at slow speeds that is the
    // same "one sample per frame at the true pointer" that makes Constant look
    // continuous, at a fraction of the dye each.
    function emitFloorDab(x, y, ux, uy, p) {
        var c = window.config;
        if (c && c.BRUSH_DAB_FLOOR === false) return;
        // Spacing stays AUTHORITATIVE above the threshold (2026-08-18). The floor
        // only ever fires on calls where the walker emitted nothing — which is
        // precisely the slow-hand case where a deliberate spacing is what you
        // came to see. Filling those gaps in made Spacing look broken at low
        // speed while still working at pace. Above the threshold the separation
        // is the point, so leave it alone; at or below it the intent is a
        // continuous line and the floor keeps it continuous.
        if (cfg('BRUSH_SPACING', 0.001) > cfg('BRUSH_DAB_FLOOR_MAX_SPACING', 0.001)) return;
        var rate = cfg('BRUSH_DAB_FLOOR_RATE', 125);
        if (!(rate > 0) || !(residual > 0)) return;
        var now = simNowMs();
        if (now - lastEmitSimMs < 1000 / rate) return;
        var ref = cfg('BRUSH_SPACING_REF', 0.35) * brushDiameterPx();
        var tc = timeCompensation();
        var k = (ref > 0 && tc > 0) ? Math.min(1, residual / (tc * ref)) : 1;
        if (queue.length < MAX_QUEUE) {
            queue.push({
                x: x, y: y,
                // Same momentum-per-distance rule as a full dab (10 x the
                // distance this one represents), so a floored stroke pushes the
                // fluid exactly as hard as a walked one.
                dx: 10 * residual * ux, dy: 10 * residual * uy,
                p: p, travel: strokeTravel, k: k
            });
        }
        residual = 0;
        lastEmitSimMs = now;
    }

    // Emit dabs along the segment from the last processed sample toward
    // (x,y): standard spacing walker — dabs sit at absolute-travel multiples
    // of spacingPx, with `residual` carrying the leftover distance between
    // segments so sub-spacing moves accumulate instead of vanishing.
    // Pressure interpolates p0 → p1 across the segment.
    function emitAlong(x, y, p1) {
        var spacing = spacingPx();
        var dx = x - lastEmitX, dy = y - lastEmitY;
        var dist = Math.hypot(dx, dy);
        if (dist < 1e-6) { lastP = p1; return; }
        // Coalesce under load: with the sub-pixel spacing floor, a fast
        // segment can demand far more dabs than the 64-dab/frame drain (05j)
        // can retire — the queue would backlog toward MAX_QUEUE (~8 frames of
        // cursor lag) and then silently skip interior dabs, tearing holes in
        // exactly the dense "ink line" mode. Instead, bound this segment's
        // dab count to what the queue can absorb and RAISE the effective
        // spacing so the dabs still span the whole segment: continuity is
        // preserved, density (not coverage) is what yields at speed. The
        // momentum rule self-adjusts (vx scales with the effective spacing).
        // The drain budget is published per frame by 05j and scales with the
        // frame's simulated step (BRUSH_DAB_BUDGET per simulated second), so a
        // 33ms frame retires twice what a 16ms one does. It used to be a flat 64
        // per frame, which made this bump — and therefore stroke density —
        // frame-rate dependent at dense spacing.
        var drainBudget = (typeof window.__dabDrainBudget === 'number' && window.__dabDrainBudget > 0)
            ? window.__dabDrainBudget : 64;
        var segBudget = Math.max(8, Math.min(drainBudget, MAX_QUEUE - queue.length));
        var expected = (dist + residual) / spacing;
        if (expected > segBudget) spacing = (dist + residual) / segBudget;
        // Normalized AFTER the coalescing bump so a thinned-out fast segment
        // deposits the same dye per pixel as an unthinned one.
        var flowShare = dabFlowShare(spacing);
        var ux = dx / dist, uy = dy / dist;
        // Per-dab velocity: momentum-per-distance matches the legacy path
        // (see header). 10 = the legacy delta→velocity gain in 05d.
        var vx = 10 * spacing * ux, vy = 10 * spacing * uy;
        var p0 = lastP;
        // Jitter: uniform scatter inside a disc of radius jitter × brush
        // diameter ÷ 2 around each dab. Applied to emitted positions only —
        // the walker's anchors stay on the true stroke path, so spacing and
        // stabilizer behavior are jitter-independent. Recorded stroke events
        // carry the jittered position (05j records d.x/d.y), so replay is
        // faithful to what was actually deposited.
        var jitterR = Math.max(0, cfg('BRUSH_JITTER', 0)) * brushDiameterPx() * 0.5;
        var offset = spacing - residual; // distance along THIS segment to dab 1
        var emitted = 0;
        while (offset <= dist) {
            var t = offset / dist;
            if (queue.length < MAX_QUEUE) {
                var jx = 0, jy = 0;
                if (jitterR > 0) {
                    var ja = Math.random() * Math.PI * 2;
                    var jr = Math.sqrt(Math.random()) * jitterR;
                    jx = Math.cos(ja) * jr; jy = Math.sin(ja) * jr;
                }
                queue.push({
                    x: lastEmitX + dx * t + jx,
                    y: lastEmitY + dy * t + jy,
                    dx: vx, dy: vy,
                    p: p0 + (p1 - p0) * t,
                    // Cumulative path length from the press to THIS dab. The
                    // splat-in ramp used to derive its progress from each dab's
                    // velocity, but |v| is exactly 10 x spacing by construction
                    // — so it was counting dabs, not measuring travel, and the
                    // whole ramp resolved into 2-3 samples however far you drew.
                    // Carrying real distance makes each dab's ramp value belong
                    // to its own position on the path, immune to drain order
                    // and to the coalescing spacing bump above.
                    travel: strokeTravel + offset,
                    // Share of the reference dye this dab carries — see
                    // dabFlowShare. 05j hands it to window.__normalizePaintFlow.
                    k: flowShare
                });
            }
            emitted++;
            offset += spacing;
        }
        residual = residual + dist - emitted * spacing;
        strokeTravel += dist;
        // A segment that cleared at least one spacing has just deposited; only a
        // segment too short to reach one needs the slow-speed floor (see
        // emitFloorDab). strokeTravel is updated first so the floor dab's ramp
        // progress belongs to where the pointer actually is.
        if (emitted > 0) lastEmitSimMs = simNowMs();
        else emitFloorDab(x, y, ux, uy, p1);
        lastEmitX = x; // the anchor is the raw sample chain; interpolation
        lastEmitY = y; // is per segment, so it always advances to the sample
        lastP = p1;
    }

    window.BrushEngine = {
        // Begin a stroke at raw coords (canvas px). Does NOT emit a press dab —
        // 05d's pointer-down handler fires its immediate press splat for
        // latency; the engine takes over from the first movement.
        begin: function (x, y) {
            active = true;
            sx = x; sy = y;
            lastEmitX = x; lastEmitY = y;
            residual = 0;
            strokeTravel = 0;
            lastEmitSimMs = simNowMs();
            lastP = 1;
            queue.length = 0;
        },

        // Total path length walked since begin(), in canvas px. The splat-in
        // ramp needs this for frames where the walker emits nothing: without a
        // dab there is no travel stamp to read, and deriving it from a
        // remembered pointer position goes wrong the moment that memory
        // survives into the next stroke.
        travel: function () { return strokeTravel; },

        // Feed one raw sample (call per pointermove AND per coalesced event).
        move: function (x, y) {
            if (!active) return;
            var p = 1;
            // Weighted-lag stabilizer: stabilized point chases the raw input.
            // strength 0 → alpha 1 (raw); strength 1 → alpha 0.08 (heavy lag).
            var stab = Math.min(1, Math.max(0, cfg('BRUSH_STABILIZER', 0)));
            var alpha = 1 - 0.92 * stab;
            sx += (x - sx) * alpha;
            sy += (y - sy) * alpha;
            emitAlong(sx, sy, p);
        },

        // End the stroke. Returns the release point + velocity for the
        // splat-out tail. catchUp=true drains the stabilizer lag to the
        // final raw position (Krita finishes the line; we do too).
        end: function (x, y) {
            if (!active) return null;
            active = false;
            if (typeof x === 'number' && typeof y === 'number') {
                emitAlong(x, y, lastP); // catch up: finish the lagged tail
            }
            var n = queue.length;
            var last = n ? queue[n - 1] : { x: lastEmitX, y: lastEmitY, dx: 0, dy: 0, p: lastP };
            return { x: last.x, y: last.y, dx: last.dx, dy: last.dy };
        },

        // Abort without the catch-up tail (window blur, pointercancel).
        abort: function () { active = false; queue.length = 0; },

        isActive: function () { return active; },
        pending: function () { return queue.length; },

        // Drain up to maxDabs for this frame (update loop calls once/frame).
        drain: function (maxDabs) {
            if (!queue.length) return [];
            return queue.splice(0, Math.max(1, maxDabs || 64));
        }
    };
})();
