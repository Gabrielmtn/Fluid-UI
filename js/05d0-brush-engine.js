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
// Config (04a defaults; sliders in the Brush section):
//   BRUSH_STABILIZER   0..1   (0 = raw input, no lag)
//   BRUSH_SPACING      0.02..1 dab spacing as a fraction of brush diameter
//   BRUSH_PRESSURE_SIZE  bool  pressure → dab radius
//   BRUSH_PRESSURE_FLOW  bool  pressure → dye intensity
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Stroke state
    var active = false;
    var sx = 0, sy = 0;          // stabilized position (chases raw input)
    var lastEmitX = 0, lastEmitY = 0; // last emitted dab position
    var residual = 0;             // distance carried between segments
    var lastP = 1;                // last pressure seen
    var queue = [];               // pending dabs: {x, y, dx, dy, p}
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

    function spacingPx() {
        // 1px floor (not 2): the Spacing slider goes down to 1%, and dense
        // "ink line" strokes are the point of that range. The drain cap
        // (64 dabs/frame) and MAX_QUEUE bound the cost of a fast flick.
        return Math.max(1, cfg('BRUSH_SPACING', 0.35) * brushDiameterPx());
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
        var ux = dx / dist, uy = dy / dist;
        // Per-dab velocity: momentum-per-distance matches the legacy path
        // (see header). 10 = the legacy delta→velocity gain in 05d.
        var vx = 10 * spacing * ux, vy = 10 * spacing * uy;
        var p0 = lastP;
        var offset = spacing - residual; // distance along THIS segment to dab 1
        var emitted = 0;
        while (offset <= dist) {
            var t = offset / dist;
            if (queue.length < MAX_QUEUE) {
                queue.push({
                    x: lastEmitX + dx * t,
                    y: lastEmitY + dy * t,
                    dx: vx, dy: vy,
                    p: p0 + (p1 - p0) * t
                });
            }
            emitted++;
            offset += spacing;
        }
        residual = residual + dist - emitted * spacing;
        lastEmitX = x; // the anchor is the raw sample chain; interpolation
        lastEmitY = y; // is per segment, so it always advances to the sample
        lastP = p1;
    }

    window.BrushEngine = {
        // Begin a stroke at raw coords (canvas px). Does NOT emit a press dab —
        // 05d's pointer-down handler fires its immediate press splat for
        // latency; the engine takes over from the first movement.
        begin: function (x, y, pressure) {
            active = true;
            sx = x; sy = y;
            lastEmitX = x; lastEmitY = y;
            residual = 0;
            lastP = (typeof pressure === 'number' && pressure > 0) ? pressure : 1;
            queue.length = 0;
        },

        // Feed one raw sample (call per pointermove AND per coalesced event).
        move: function (x, y, pressure) {
            if (!active) return;
            var p = (typeof pressure === 'number' && pressure > 0) ? pressure : lastP;
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
        },

        // Pressure response curves (used by 05j when applying dabs).
        // Gamma 0.7 lifts the light-touch range — linear feels dead.
        sizeScale: function (p) {
            if (!window.config || !window.config.BRUSH_PRESSURE_SIZE) return 1;
            return 0.35 + 0.65 * Math.pow(Math.min(1, Math.max(0.02, p)), 0.7);
        },
        flowScale: function (p) {
            if (!window.config || !window.config.BRUSH_PRESSURE_FLOW) return 1;
            return 0.3 + 0.7 * Math.pow(Math.min(1, Math.max(0.02, p)), 0.7);
        }
    };
})();
