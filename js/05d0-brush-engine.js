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
// Config (04a defaults; controls in the strip's Brush panel):
//   BRUSH_STABILIZER   0..1   (0 = raw input, no lag)
//   BRUSH_SPACING      0.001..1 dab spacing as a fraction of brush diameter
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

    function spacingPx() {
        // 0.25px floor (was 1): the Spacing slider now reaches 0.1%, and the
        // 1px floor made everything below ~1% indistinguishable — sub-pixel
        // spacing is what dissolves the grainy dab-train look at slow speeds.
        // The drain cap (64 dabs/frame) and MAX_QUEUE still bound the cost
        // of a fast flick.
        return Math.max(0.25, cfg('BRUSH_SPACING', 0.35) * brushDiameterPx()) * timeCompensation();
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
        var segBudget = Math.max(8, Math.min(64, MAX_QUEUE - queue.length));
        var expected = (dist + residual) / spacing;
        if (expected > segBudget) spacing = (dist + residual) / segBudget;
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
                    travel: strokeTravel + offset
                });
            }
            emitted++;
            offset += spacing;
        }
        residual = residual + dist - emitted * spacing;
        strokeTravel += dist;
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
