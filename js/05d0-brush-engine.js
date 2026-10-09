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
//   BRUSH_STEADY       0..1   the pulled string (0 = the brush sits on the hand)
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

    // ── Steady: the pulled string (2026-10-04) ──────────────────────────
    // Gabriel: "the mouse moves so fast sometimes... a 'pulled string' that
    // also slows down the input relative to the time slider, so even when
    // dragging fast it looks smooth and steady."
    //
    // With config.BRUSH_STEADY above zero the brush stops sitting on the hand.
    // It is a head on a string the hand drags:
    //   - it moves only once the string is taut, so a slack of up to
    //     STEADY_SLACK_CSS px swallows tremble and the small wobbles that read
    //     as jitter at low speed;
    //   - it heads for the hand, not along the hand's exact path, so corners
    //     round off;
    //   - its speed grows with how far the string is stretched (it eases in
    //     and out) and has a ceiling, so a flick is laid down at a steady pace
    //     instead of all at once;
    //   - all of that runs in TIME-scaled seconds: at Time 0.25 the brush
    //     moves at a quarter of the pace, slow motion painting at a slow
    //     motion pace.
    // move() only records where the hand is. tick(), once a frame from 05j
    // before the drain, walks the head and feeds the spacing walker exactly
    // as a raw sample would, so spacing, the slow-speed floor, the dye share
    // and the ramp need nothing of their own. The constant-flow hose reads
    // head() instead of the pointer.
    //
    // On release nothing about the pull changes: the hand just stops where it
    // let go, and the head carries on toward it exactly as if the hand were
    // still holding still there — same slack, same pull, same top speed — and
    // the stroke ends once it settles. (The first version reeled the slack in
    // and put a floor under the speed so the line finished within 1.5 s; both
    // made the brush visibly speed up at the lift — Gabriel, 2026-10-04.) A
    // lift with the hand inside the slack ends the stroke on the spot. The
    // release tail (if any) leaves from where the head settles, at its own
    // speed. STEADY_RELEASE_MAX_S (wall) stops a crawl at very low Time
    // where it is rather than hurrying it; a new press abandons it.
    //
    // With a splat-out tail to follow (2026-10-09) the head COASTS instead: it
    // keeps the speed it had at the lift all the way to where it settles
    // (never slower than the pull, never faster than it was going), and the
    // tail leaves from there at that same speed. Easing in first meant the
    // head arrived at a crawl and the tail took its speed from the crawl:
    // measured on a 1500 px/s flick, 30% slowed to 99 px/s and then jumped
    // back to 634 for a 142 px tail; 60% and 100% crawled for 0.7 s and 2.5 s
    // and laid no tail at all ("doesn't play nicely with the inertia of splat
    // out" — Gabriel). Splat-out Instant keeps the ease-in above.
    //
    // Let go off the canvas and the line ends at the canvas's edge
    // (2026-10-07). The head used to carry on to the lift point, out past
    // the edge, and the hose kept pouring there until it settled — up to
    // 3.5 s of paint centred outside the canvas, piling into the wall as a
    // bright crescent: "it creates artifacts after release" (Gabriel). Now
    // the head stops on the frame it runs off, and a head already out there
    // with the hand out too ends the stroke at the lift. Either way there
    // is no release tail: it would only squirt into the wall. While the
    // button is held nothing changes (a held brush off the canvas pours at
    // the edge exactly as it does without the string).
    //
    // 0 = off: move() feeds the walker directly, bit for bit as before.
    // Everything scales with ONE eased amount u = Steady², so the bottom of the
    // slider is realtime and the curve builds toward the full string at 100%:
    // slack = u × 24 px, lag (the pull's time constant) = u × 200 ms, top speed
    // = 250 / u px/s. At 10%: 2 ms, no speed limit you could reach; 30%: 18 ms,
    // 2800 px/s; 50%: 50 ms, 1000 px/s; 100%: 200 ms, 250 px/s. (The first
    // curve was exponential from a 33 ms lag at 1% — Gabriel: "1% makes it
    // quite slow"; the jump from Off was the whole problem.)
    var STEADY_SLACK_CSS = 24;    // string slack at full Steady, CSS px
    var STEADY_TAU_MAX_S = 0.2;   // the pull's time constant at full Steady
    var STEADY_VMAX_MIN_CSS = 250; // top speed at full Steady, CSS px/s
    var STEADY_SUBSTEP_MS = 4;    // the head's path is walked in steps this long
    var STEADY_MAX_STEPS = 32;    // ...at most this many a frame
    var STEADY_RELEASE_MAX_S = 3.5; // after the lift, a crawl stops here (wall s) —
                                  // inside 06c's 4 s one-swirl wait, so a turn never
                                  // passes with the line still finishing
    var STEADY_SETTLE_CSS = 1;    // CSS px from the slack's edge: settled
    var STEADY_TRAIL_MS = 80;     // head motion kept for the release velocity
    var steadyOn = false;         // latched at begin(): a stroke keeps its mode
    var hx = 0, hy = 0;           // the head, canvas px (where the paint goes)
    var tx = 0, ty = 0;           // the hand it is tied to
    var releasing = false;        // hand lifted, head still finishing the line
    var releaseWall = 0;          // wall seconds since the lift
    var cssScale = 1;             // canvas px per CSS px, read at begin()
    var arriveCb = null;          // called once when the release catch-up lands
    var headTrail = [];           // {x, y, t} of the head, wall ms
    var handSamples = [];         // the hand's raw samples since the last tick
    var px0 = 0, py0 = 0;         // the hand at the end of the last tick
    var strokeSerial = 0;         // bumped by every begin(): which stroke this is
    var coastV = 0;               // after the lift, with a tail to follow: the head's
                                  // speed at the lift, canvas px per (Time-scaled) second

    function steadyAmount() {
        var s = cfg('BRUSH_STEADY', 0);
        return s > 0.001 ? Math.min(1, s) : 0;
    }
    // The string at Steady s, in canvas px and (Time-scaled) seconds.
    function steadyShape(s) {
        var u = s * s;
        return {
            slack: u * STEADY_SLACK_CSS * cssScale,
            tau: u * STEADY_TAU_MAX_S,
            vmax: u > 0 ? STEADY_VMAX_MIN_CSS / u * cssScale : Infinity
        };
    }

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
    //
    // 2026-09-28: the spread is now a DYE SHARE instead (timeShare below).
    // Spreading spacing did lower dabs-per-simulated-second, but it did it by
    // laying a quarter of the dabs per wall second — at Time 0.2 a stamp
    // stroke broke into separate copies 4px apart, and a hand that had not
    // changed speed saw the brush slow down. Dividing each dab's share by the
    // same factor removes exactly the same dye per simulated second and keeps
    // the Time-1 sampling. The cap stays: it is what holds the dye the same
    // as before at Time < 0.25.
    function timeCompensation() {
        var c = window.config;
        var cap = (c && typeof c.BRUSH_TIME_COMP === 'number') ? c.BRUSH_TIME_COMP : 4;
        if (!(cap > 1)) return 1;
        var s = window.timeScale;
        if (typeof s !== 'number' || !(s > 0) || s >= 1) return 1;
        return Math.min(cap, 1 / s);
    }

    // Low Time carried in the dab's share rather than in fewer dabs
    // (config.BRUSH_TIME_SHARE, default on). false = the spread, bit for bit.
    function timeShare() {
        var c = window.config;
        return !(c && c.BRUSH_TIME_SHARE === false);
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
        return timeShare() ? baseSpacingPx() : baseSpacingPx() * timeCompensation();
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
    // timeCompensation is deliberately NOT compensated: lowering the dye per
    // simulated second at low Time is the whole point of it (the flat
    // over-saturated middle), so cancelling it here would undo that fix. With
    // the spread (BRUSH_TIME_SHARE off) the ratio is taken against
    // baseSpacingPx, not spacingPx; with the time share it is applied here.
    //
    // Clamped to 1: a dab can't deposit more than full flow, so spacings above
    // REF thin the stroke exactly as they always did.
    function dabFlowShare(used) {
        var ref = cfg('BRUSH_SPACING_REF', 0.35) * brushDiameterPx();
        var tc = timeCompensation();
        if (!(ref > 0) || !(tc > 0)) return 1;
        // Time share: `used` is unspread, so the clamp sees the spacing alone
        // and the time factor comes off AFTER it. A spacing past REF at Time
        // 0.25 lands a quarter dab every spacing — the same dye per pixel as
        // the spread's one full dab every four.
        if (timeShare()) return Math.min(1, used / ref) / tc;
        // used already carries floor x timeComp x coalescing bump; dividing the
        // timeComp back out leaves exactly the artefacts we DO want to cancel.
        return Math.min(1, used / (tc * ref));
    }

    // The slow-speed floor's clock. With the time share it is 05j's pace clock
    // (simulated time, but never slower than Time 1): the floor dab's share
    // already carries the low-Time reduction, so metering its RATE on the
    // simulated clock as well took it off twice — 25 floor dabs per wall
    // second at Time 0.2 against 125 at Time 1.
    function simNowMs() {
        var t = (timeShare() && typeof window.__paceTimeMs === 'number')
            ? window.__paceTimeMs : window.__simTimeMs;
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
    // Gated on the pace clock (simulated time, never slower than Time 1 —
    // see simNowMs), and on residual > 0, so a genuinely stationary pointer still deposits nothing —
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
        // Share of the travel this dab stands for — the walker's own rule, low
        // Time included (same number as the old inline min(1, r/(tc·ref))
        // with the time share off).
        var k = dabFlowShare(residual);
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
        // frame's simulated step (BRUSH_DAB_BUDGET per simulated second, at the
        // Time-1 pace below Time 1), so a 33ms frame retires twice what a 16ms
        // one does. It used to be a flat 64
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

    // Head velocity over the last STEADY_TRAIL_MS, in the units 05d's release
    // tail takes (px x10 per 60 Hz frame) — the same window its releaseVelocity
    // reads off the hand. Per frame of the HEAD's clock (Time-scaled, tf): the
    // tail runs on the simulated clock, so a wall-clock speed handed to it
    // came out tf times too fast or slow — at Time 2 the tail sped off at
    // twice the head's pace.
    function headVelocity(tf) {
        var n = headTrail.length;
        if (n < 2) return { dx: 0, dy: 0 };
        var last = headTrail[n - 1], first = headTrail[0];
        var dt = last.t - first.t;
        if (dt < 4) return { dx: 0, dy: 0 };
        var k = 10 * (1000 / 60) / dt / (tf > 0 ? tf : headClock());
        return { dx: (last.x - first.x) * k, dy: (last.y - first.y) * k };
    }

    // The head's clock rate: the Time slider, clamped as steadyTick clamps it.
    function headClock(timeScale) {
        var ts = (typeof timeScale === 'number') ? timeScale : window.timeScale;
        return Math.max(0.05, Math.min(4, (typeof ts === 'number' && ts > 0) ? ts : 1));
    }

    function noteHead(now) {
        headTrail.push({ x: hx, y: hy, t: now });
        while (headTrail.length > 2 && now - headTrail[0].t > STEADY_TRAIL_MS) headTrail.shift();
    }

    // The canvas in canvas px: the head's own coordinate space.
    function canvasBox() {
        var c = document.getElementById('canvas');
        return { w: (c && c.width) || 0, h: (c && c.height) || 0 };
    }
    function offCanvas(x, y, box) {
        return box.w > 0 && (x < 0 || y < 0 || x > box.w || y > box.h);
    }
    // How far along (x0,y0) → (x1,y1), 0..1, the segment crosses the
    // canvas's edge. (x0,y0) is inside; (x1,y1) is not.
    function edgeT(x0, y0, x1, y1, box) {
        var t = 1, dx = x1 - x0, dy = y1 - y0;
        if (x1 < 0 && dx < 0) t = Math.min(t, -x0 / dx);
        if (x1 > box.w && dx > 0) t = Math.min(t, (box.w - x0) / dx);
        if (y1 < 0 && dy < 0) t = Math.min(t, -y0 / dy);
        if (y1 > box.h && dy > 0) t = Math.min(t, (box.h - y0) / dy);
        return Math.max(0, Math.min(1, t));
    }
    // After the lift, walk the head to (x, y) unless that crosses the
    // canvas's edge: then to the edge, and say so (the line is over).
    function releaseStep(x, y, box) {
        if (offCanvas(x, y, box) && !offCanvas(hx, hy, box)) {
            var t = edgeT(hx, hy, x, y, box);
            hx += (x - hx) * t;
            hy += (y - hy) * t;
            emitAlong(hx, hy, 1);
            return true;
        }
        hx = x; hy = y;
        emitAlong(hx, hy, 1);
        return false;
    }

    // The release catch-up has landed: the stroke is over. Off the canvas's
    // edge (offEdge) it ends without its release tail.
    function arrive(offEdge, tf) {
        active = false;
        releasing = false;
        var coast = coastV;
        coastV = 0;
        var cb = arriveCb;
        arriveCb = null;
        if (cb && !offEdge) {
            var v = headVelocity(tf);
            // A coasting head hands the tail the speed it held. The trail's
            // average reads low: the head settles partway through its last
            // step (measured 14% under at 60 Hz).
            var vm = Math.hypot(v.dx, v.dy), want = coast / 60 * 10;
            if (vm > 0 && want > vm) { v.dx *= want / vm; v.dy *= want / vm; }
            try { cb({ x: hx, y: hy, dx: v.dx, dy: v.dy }); } catch (_) {}
        }
    }

    // One frame of the string. wallMs is the frame's wall time; the head's own
    // clock is that times the Time slider (clamped so Time 0.01 still moves).
    // Returns true on the frame the release catch-up lands.
    function steadyTick(wallMs, timeScale) {
        var s = steadyAmount();
        var tf = headClock((typeof timeScale === 'number' && timeScale > 0) ? timeScale : 1);
        var sh = steadyShape(s);
        var wall = Math.max(0, Math.min(50, wallMs || 0)) / 1000;
        var now = performance.now();
        // The hand's samples since the last tick, oldest first. The head walks
        // through them in order across the frame rather than chasing only the
        // newest, so at a low Steady (a lag of a millisecond or two) it lays
        // the hand's own path, coalesced detail included, not a once-a-frame
        // polyline of it.
        var samples = handSamples;
        handSamples = [];
        var count = samples.length;
        // Off mid-stroke (the slider pulled to 0): the string goes, and the
        // head joins the hand the way raw samples would.
        if (!(s > 0)) {
            for (var k = 0; k < count; k++) emitAlong(samples[k].x, samples[k].y, 1);
            var offEdge = false;
            if (releasing) offEdge = releaseStep(tx, ty, canvasBox());
            else { hx = tx; hy = ty; emitAlong(hx, hy, 1); }
            px0 = tx; py0 = ty;
            noteHead(now);
            if (releasing) { arrive(offEdge, tf); return true; }
            return false;
        }
        var n = Math.max(1, Math.min(STEADY_MAX_STEPS,
            Math.max(count, Math.ceil(wall * 1000 / STEADY_SUBSTEP_MS))));
        var hw = wall / n;          // wall seconds per step
        var h = hw * tf;            // the head's (Time-scaled) seconds per step
        var pull = sh.tau > 1e-6 ? 1 - Math.exp(-h / sh.tau) : 1;
        // After the lift the line ends where the head runs off the canvas.
        var box = releasing ? canvasBox() : null;
        var ranOff = false;
        for (var i = 0; i < n; i++) {
            // Where the hand was at this step: sample j of the frame's run.
            var ax = px0, ay = py0;
            if (count) {
                var j = Math.floor((i + 1) * count / n) - 1;
                if (j >= 0) { ax = samples[j].x; ay = samples[j].y; }
            } else { ax = tx; ay = ty; }
            var dx = ax - hx, dy = ay - hy;
            var d = Math.hypot(dx, dy);
            var e = d - sh.slack;
            if (!(e > 0)) continue; // slack: the head stays where it is
            var step = Math.min(e * pull, sh.vmax * h);
            // Coasting to a release tail: hold the lift's speed to the end
            // (see the header) rather than easing in to a crawl.
            if (coastV > 0) step = Math.min(e, Math.max(step, coastV * h));
            if (box) {
                if (releaseStep(hx + dx / d * step, hy + dy / d * step, box)) { ranOff = true; break; }
                continue;
            }
            hx += dx / d * step;
            hy += dy / d * step;
            emitAlong(hx, hy, 1);
        }
        px0 = tx; py0 = ty;
        noteHead(now);
        if (releasing) {
            releaseWall += wall;
            if (ranOff) { arrive(true); return true; }
            if (settled(sh.slack) || releaseWall >= STEADY_RELEASE_MAX_S) { arrive(false, tf); return true; }
        }
        return false;
    }

    // The head has come to rest against the slack (or inside it).
    function settled(slack) {
        return Math.hypot(tx - hx, ty - hy) - slack <= STEADY_SETTLE_CSS * cssScale;
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
            // A press while the last stroke was still reeling in abandons it.
            strokeSerial++;
            steadyOn = steadyAmount() > 0;
            hx = tx = px0 = x; hy = ty = py0 = y;
            handSamples.length = 0;
            releasing = false;
            arriveCb = null;
            coastV = 0;
            headTrail.length = 0;
            if (steadyOn) {
                var cv = document.getElementById('canvas');
                var r = cv ? cv.getBoundingClientRect() : null;
                cssScale = (r && r.width > 0) ? cv.width / r.width : 1;
            }
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
            // Steady: only the hand moves here; tick() walks the head. Once
            // the hand has lifted, hovering must not drag the line along.
            if (steadyOn) {
                if (!releasing) {
                    tx = x; ty = y;
                    // Bounded: a stalled frame keeps the newest, which is
                    // where the hand is now.
                    if (handSamples.length >= 256) handSamples.shift();
                    handSamples.push({ x: x, y: y });
                }
                return;
            }
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
        // With Steady, the stroke stays active while the head reels in to
        // (x, y); onArrive({x, y, dx, dy}) runs once it lands — the release
        // tail starts there, from the head's speed — and never if a new press
        // or an abort gets there first. The return says which happened.
        end: function (x, y, onArrive) {
            if (!active) return null;
            if (steadyOn) {
                if (!releasing) {
                    if (typeof x === 'number' && typeof y === 'number') { tx = x; ty = y; }
                    releasing = true;
                    releaseWall = 0;
                    arriveCb = (typeof onArrive === 'function') ? onArrive : null;
                    // A tail follows: coast at the speed the head has now.
                    coastV = 0;
                    if (arriveCb) {
                        var v0 = headVelocity();   // x10 px per 60 Hz frame of the head's clock
                        coastV = Math.hypot(v0.dx, v0.dy) / 10 * 60;
                    }
                    // Lifted off the canvas with the head out there too: the
                    // line already left the canvas, so nothing is left to
                    // finish (a head still inside runs to the edge in tick).
                    var box = canvasBox();
                    if (offCanvas(hx, hy, box) && offCanvas(tx, ty, box)) { arrive(true); return null; }
                    // Lifted with the head already at rest: the stroke ends here.
                    if (settled(steadyShape(steadyAmount()).slack)) { arrive(); return null; }
                }
                return { deferred: true };
            }
            active = false;
            if (typeof x === 'number' && typeof y === 'number') {
                emitAlong(x, y, lastP); // catch up: finish the lagged tail
            }
            var n = queue.length;
            var last = n ? queue[n - 1] : { x: lastEmitX, y: lastEmitY, dx: 0, dy: 0, p: lastP };
            return { x: last.x, y: last.y, dx: last.dx, dy: last.dy };
        },

        // Abort without the catch-up tail (window blur, pointercancel).
        abort: function () {
            active = false; queue.length = 0;
            releasing = false; arriveCb = null; coastV = 0;
        },

        // Still painting: held, or (Steady) reeling in after the lift.
        isActive: function () { return active; },
        // Which stroke is live: per-stroke state kept outside the engine (05j's
        // constant-flow hose) resets when this changes.
        stroke: function () { return strokeSerial; },
        pending: function () { return queue.length; },

        // ── Steady ──
        // Advance the head one frame (05j, before drain). True on the frame
        // the release catch-up lands.
        tick: function (wallMs, timeScale) {
            if (!active || !steadyOn) return false;
            return steadyTick(wallMs, timeScale);
        },
        // This stroke rides the string (latched at its press).
        steadyActive: function () { return active && steadyOn; },
        // Hand lifted, head still finishing the line.
        releasing: function () { return active && steadyOn && releasing; },
        // Where the paint goes and where the hand is, canvas px; null when
        // the brush sits on the hand.
        head: function () {
            return (active && steadyOn) ? { x: hx, y: hy, handX: tx, handY: ty, releasing: releasing } : null;
        },
        // Where the head came to rest, on the frame tick() reports the landing
        // (head() is already null then): the hose pours its last stretch to here.
        landedAt: function () { return steadyOn ? { x: hx, y: hy } : null; },

        // Drain up to maxDabs for this frame (update loop calls once/frame).
        drain: function (maxDabs) {
            if (!queue.length) return [];
            return queue.splice(0, Math.max(1, maxDabs || 64));
        }
    };
})();
