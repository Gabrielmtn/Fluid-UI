// ═══════════════════════════════════════════════════════════════════
// js/05d-input-replay.js — part 4/14 of former 05-fluid-sim.js (lines 1192–1740)
// LOAD ORDER: after 05c-programs-framebuffers.js, before 05e-effect-controls.js
// PROVIDES: pointer, stroke replay system, splatWithRadius, multiSplatWithRadius, initFpsCapControl (+load-time call), scheduleStrokeReplay, mouse/touch listeners
// REQUIRES: canvas, config (04); multiSplat (05g, runtime only)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        let pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false, color: [1, 0, 0] };
        window.pointer = pointer; // Expose for stats panel
        // Stroke tracking for right-click replay
        let strokeEvents = [];
        let strokeStartTime = 0;
        // Replay playhead. Accumulated per frame at the CURRENT speed rather
        // than re-derived from a start stamp: (now - start) * speed re-scales
        // the whole elapsed history, so moving the Replay Speed slider during a
        // held (looping) replay teleported the playhead — forward if you sped
        // up, backward if you slowed down. replayFrac is how much of the
        // segment leading into events[replayIndex] has already been deposited.
        let replayClock = 0;
        let replayLastMs = 0;
        let replayIndex = 0;
        let replayFrac = 0;
        let replayDebt = 0;
        // History of completed strokes for time-based replay
        let strokeHistory = [];
        // ─── Splat Envelope ───────────────────────────────────────────
        // Controls how splats ramp in (on press) and fade out (on release).
        // Modes: 'instant' (default), 'linear', 'easing'
        let splatDownTime = 0;
        let splatUpTime = 0;
        let splatOutActive = false;
        let splatOutX = 0, splatOutY = 0, splatOutDx = 0, splatOutDy = 0;
        let splatOutColor = [1, 0, 0];
        let pendingArmAdvance = false;
        // Distance-based envelope: the brush grows from nothing to full
        // size over splatInDist of cursor travel (speed-independent), and on
        // release trails off, tapering over splatOutDist. Distances are fractions
        // of the canvas width; accumulated in the update loop (05j).
        let splatStrokeDist = 0;   // travel since press (drives splat-in)
        let splatTailDist = 0;     // travel of the post-release tail (drives splat-out)
        let splatReleaseInMult = 1.0; // brush size fraction at release (so splat-out
                                      // tapers from the current size, not a jump to full)
        // Smallest radius multiplier the ramp will hand the shader. Not a
        // perceptual floor — the splat footprint is exp(-d/radius) and a
        // literal zero divides by zero. Dye is zero here, so nothing shows.
        // (This replaced SPLAT_START_FLOOR = 0.12, which made every eased
        // stroke open at 12% of full size and, once dye rode the ramp too,
        // 12% strength — a mark that still arrived all at once.)
        const SPLAT_MIN_MULT = 0.0004;
        window.splatInMode = window.splatInMode || 'instant';
        window.splatOutMode = window.splatOutMode || 'instant';
        // Ramp distances (fraction of canvas width). 0 ⇒ behaves like instant.
        if (typeof window.splatInDist !== 'number') window.splatInDist = 0.15;
        if (typeof window.splatOutDist !== 'number') window.splatOutDist = 0.15;
        function smoothstep(t) {
            return t * t * (3.0 - 2.0 * t);
        }
        // 'time' mode: ramp over SECONDS since the press rather than travel.
        // The distance modes are deliberately speed-independent, which is right
        // for a stroke — but it means a CLICK that never moves cannot ramp at
        // all: t stays 0 and the dab is pinned at the floor forever. Ramping on
        // elapsed time is what lets a press bloom in. splatDownTime/splatUpTime
        // were already being stamped on every press and release and never read
        // by anything; they finally have a job.
        if (typeof window.splatInMs !== 'number') window.splatInMs = 350;
        if (typeof window.splatOutMs !== 'number') window.splatOutMs = 350;
        function rampShape(mode, t) {
            return (mode === 'linear') ? t : smoothstep(t);
        }
        // The ramp's 0..1 curve, before it is turned into a size or a dye
        // amount. It starts at ZERO. An eased stroke has to grow out of
        // nothing: starting at a fraction of the final value means the first
        // mark still appears all at once, just smaller — which reads as a jolt
        // however long the ramp is, in On Move and Constant alike.
        function getSplatInShape() {
            const mode = window.splatInMode;
            if (mode === 'instant') return 1.0;
            let t;
            if (mode === 'time') {
                const ms = window.splatInMs || 0;
                if (ms <= 1) return 1.0;
                t = Math.min((Date.now() - splatDownTime) / ms, 1.0);
            } else {
                const D = window.splatInDist || 0;
                if (D <= 0.0001) return 1.0;
                t = Math.min(splatStrokeDist / D, 1.0);
            }
            return rampShape(mode === 'time' ? 'easing' : mode, t);
        }
        function getSplatInMult() {
            const shape = getSplatInShape();
            // Radius keeps a hair above zero purely for the shader: the splat
            // footprint is exp(-d/radius), so a literal 0 divides by zero. At
            // this floor the dab is ~2px across and carries zero dye, so it is
            // invisible — the perceptual start is still zero.
            return Math.max(SPLAT_MIN_MULT, shape);
        }
        function getSplatOutMult() {
            const mode = window.splatOutMode;
            if (mode === 'instant') return 0.0;
            let t;
            if (mode === 'time') {
                const ms = window.splatOutMs || 0;
                if (ms <= 1) return 0.0;
                t = Math.min((Date.now() - splatUpTime) / ms, 1.0);
            } else {
                const D = window.splatOutDist || 0;
                if (D <= 0.0001) return 0.0;
                t = Math.min(splatTailDist / D, 1.0);
            }
            if (t >= 1.0) return 0.0;
            const remaining = 1.0 - t;
            return rampShape(mode === 'time' ? 'easing' : mode, remaining);
        }
        // The ramp scales the dab's RADIUS, but the splat shader's centre
        // deposit is exp(0) = 1 whatever the radius — so a size-only ramp still
        // laid down full-saturation colour in the first frame. That is the
        // "flashes in like a camera" part. Dye rides the same curve, and unlike
        // radius it takes the shape RAW: dye genuinely starts at zero, so the
        // stroke fades up out of nothing instead of appearing at a fraction of
        // itself. Returns a multiplier to fold into the Flow slider's.
        function splatInFlowMul() {
            if (window.splatInMode === 'instant') return 1.0;
            return Math.max(0, Math.min(1, getSplatInShape()));
        }
        window.__splatInFlowMul = splatInFlowMul;
        function splatWithRadius(x, y, dx, dy, color, radius) {
            const saved = config.SPLAT_RADIUS;
            config.SPLAT_RADIUS = radius;
            splat(x, y, dx, dy, color);
            config.SPLAT_RADIUS = saved;
        }
        function multiSplatWithRadius(x, y, dx, dy, color, radius) {
            const saved = config.SPLAT_RADIUS;
            config.SPLAT_RADIUS = radius;
            multiSplat(x, y, dx, dy, color, false);
            config.SPLAT_RADIUS = saved;
        }
        // Flow routing, shared by the press stamp AND the drag dabs so they can
        // never diverge (that divergence was the "splat-one bright, drag dark"
        // bug). Gate CONVERGES to the colour, so flow must scale the convergence
        // (the gateFlow uniform, driven by window.__splatFlow) and the colour
        // stays TRUE; additive bakes flow into the colour value, where scaling
        // the deposit is correct. Returns the colour to hand to the splat and
        // sets window.__splatFlow; the CALLER must reset window.__splatFlow = 1
        // afterwards so programmatic/tail splats stay full-flow.
        function applyPaintFlow(color, flowMul) {
            if (config.COLOR_GATE) {
                window.__splatFlow = flowMul;
                return color;
            }
            window.__splatFlow = 1;
            return flowMul === 1 ? color
                : [color[0] * flowMul, color[1] * flowMul, color[2] * flowMul];
        }
        window.__applyPaintFlow = applyPaintFlow;
        // Sampling-density normalization (2026-08-17). Every dab is an IMPULSE —
        // splat() takes no dt — so "how much paint" and "how many dabs" were the
        // same number, and any change to dab density silently changed how dark a
        // stroke came out. That coupling is why the deposition rate could never be
        // raised for smoothness: constant flow was stuck at one dab per frame
        // (making dye-per-second literally the frame rate) and On Move was stuck at
        // a spacing calibrated for a much smaller tip.
        //
        // k = this dab's share of the reference sampling density (0..1]. Emit 1/k
        // times as many dabs at the normalized flow and the total lands exactly
        // where the reference would have — so density becomes a pure texture and
        // smoothness control, and rate/spacing can be set for feel alone.
        //
        // Exact in BOTH flow models, which is the whole reason this is a shared
        // helper rather than a multiply at each call site:
        //   additive  result = base + shape*color      — linear, so k scales it.
        //   Gate      result = mix(base, color, c)     — a CONVERGENCE: n dabs of
        //             convergence c reach 1-(1-c)^n, so the share belongs in the
        //             EXPONENT. c = 1-(1-f)^k satisfies 1-(1-c)^(1/k) = f exactly.
        // (At f = 1 Gate is idempotent — one dab already lands the full colour —
        // and the formula correctly returns 1 for any k.)
        function normalizePaintFlow(flowMul, k) {
            if (typeof k !== 'number' || !(k > 0) || k >= 1) return flowMul;
            if (config.COLOR_GATE) {
                var f = Math.max(0, Math.min(1, flowMul));
                return 1 - Math.pow(1 - f, k);
            }
            return flowMul * k;
        }
        window.__normalizePaintFlow = normalizePaintFlow;
        // Flow at the press stamp: just the Flow slider (no pen pressure).
        function pressFlowMul() {
            return (typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1;
        }
        let strokeArchived = false;
        function archiveCurrentStroke() {
            if (strokeArchived || strokeEvents.length === 0) return;
            strokeHistory.push({ events: strokeEvents.slice(), startTime: strokeStartTime, endTime: Date.now() });
            strokeArchived = true;
            // Cap history at 200 strokes to limit memory (oldest first)
            while (strokeHistory.length > 200) {
                strokeHistory.shift();
            }
        }
        function startStroke(x, y) {
            archiveCurrentStroke();
            strokeEvents = [];
            strokeStartTime = Date.now();
            strokeArchived = false;
        }
        function pushStrokeEvent(x, y, dx, dy, color) {
            if (isReplayActive) return; // Don't record during replay
            const t = Date.now() - strokeStartTime;
            // Per-arm Pressure, captured with the dab for the same reason the
            // whole-brush flag is: which arms deposited pigment is a property of
            // the stroke that was painted. Read through the pin so a replay that
            // is itself being re-recorded stays faithful.
            const _apMask = (typeof window.__armPushPin === 'number')
                ? window.__armPushPin
                : ((typeof window.armPushMask === 'function') ? window.armPushMask() : 0);
            // Store the EFFECTIVE painted size (splat-in ramp / pressure), not the
            // base — so stroke replay (local AND multiplayer 2.1) reproduces the
            // actual brush size. The paint path publishes it to __lastPaintRadius.
            const effR = (typeof window.__lastPaintRadius === 'number' && window.__lastPaintRadius > 0)
                ? window.__lastPaintRadius : config.SPLAT_RADIUS;
            // The FOOTPRINT the dab was painted with, alongside its size: the
            // built-in tip and, if one was loaded, the custom stamp's id.
            // Without these, replay had no idea what it was reproducing and
            // fell back to suppressing custom stamps entirely — you painted
            // with your own brush and the replay came out in a different one.
            // Preserve Randomness: note that random mode rolled this colour
            // (rnd), plus the flow factor baked into it (fm — the recorded
            // colour is pointer.color × a scalar flow dim in additive mode),
            // so a replay can re-roll a fresh colour and re-dim it the same.
            // Both omitted when the checkbox is off — the common event stays
            // byte-identical.
            let _rnd, _fm;
            if (window.preserveRandomness &&
                window.multiArmColors && window.multiArmColors[0] &&
                window.multiArmColors[0].mode === 'random') {
                _rnd = 1;
                const _sB = color[0] + color[1] + color[2];
                const _sP = pointer.color[0] + pointer.color[1] + pointer.color[2];
                let f = (_sP > 1e-6) ? _sB / _sP : 1;
                if (isFinite(f) && Math.abs(f - 1) >= 0.005) _fm = Math.round(f * 1000) / 1000;
            }
            strokeEvents.push({
                t, x, y, dx, dy, color: color.slice(),
                mult: (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                radius: effR,
                tip: config.BRUSH_TIP | 0,
                shape: config.BRUSH_SHAPE_ID || null,
                // Push (velocity-only) dabs deposit no dye, so a replay that
                // did not know about the flag would repaint them as ordinary
                // strokes — pigment appearing where the painter laid none.
                // Nested and null on ordinary dabs: stroke events ride the
                // wire chunked under a 16KB cap, so three always-present
                // fields on every dab is real weight for a rare mode.
                push: config.BRUSH_VELOCITY_ONLY ? {
                    m: config.BRUSH_VEL_MODE || 'smudge',
                    s: (typeof config.BRUSH_VEL_STRENGTH === 'number') ? config.BRUSH_VEL_STRENGTH : 1
                } : null,
                // Which ARMS pushed (bitmask, 05g currentArmPushMask). Separate
                // from `push` because the two are independent: a painting brush
                // can have push arms, and a Pressure brush pushes on every arm
                // whatever this says. Omitted entirely at 0 — the common case —
                // so an ordinary dab is the same size on the wire as before.
                ap: _apMask || undefined,
                rnd: _rnd,
                fm: _fm
            });
        }
        function deepCopyEvent(ev) {
            // `head` marks the first dab of a stroke. The replay interpolator
            // spreads a dab along the path into it, and must never do that
            // across the gap between two separate strokes in a Time replay —
            // that would draw a line the painter never made.
            return { t: ev.t, x: ev.x, y: ev.y, dx: ev.dx, dy: ev.dy, color: ev.color.slice(),
                     mult: ev.mult, radius: ev.radius, tip: ev.tip, shape: ev.shape, head: ev.head,
                     push: ev.push ? { m: ev.push.m, s: ev.push.s } : null,
                     ap: ev.ap, rnd: ev.rnd, fm: ev.fm };
        }
        // Preserve Randomness: an event whose colour was rolled by random mode
        // carries rnd:1 (+ fm, the flow factor baked into its recorded colour).
        // Re-roll ONE fresh colour per stroke — index 0 and each `head` — and
        // scale it by fm so additive flow dimming survives the swap. Returns
        // copies for the flagged events, never mutates: a held loop re-resolves
        // the same array every pass, so each loop gets its own roll (and the
        // resolve runs BEFORE the broadcast, so peers see the painter's roll).
        function resolveReplayRandomness(events) {
            var any = false;
            for (var i = 0; i < events.length; i++) {
                if (events[i].rnd) { any = true; break; }
            }
            if (!any || typeof window.generateVibrantColor !== 'function') return events;
            var fresh = null;
            return events.map(function (ev, idx) {
                if (idx === 0 || ev.head) fresh = window.generateVibrantColor();
                if (!ev.rnd) return ev;
                var c = deepCopyEvent(ev);
                var fm = (typeof ev.fm === 'number' && isFinite(ev.fm)) ? ev.fm : 1;
                c.color = [fresh[0] * fm, fresh[1] * fm, fresh[2] * fm];
                return c;
            });
        }
        // Time replay: the last N SECONDS OF WALL CLOCK, exactly as they happened.
        //
        // The first version measured the window in "painting time" — it summed each
        // stroke's own duration until the sum reached N, explicitly treating the
        // gaps between strokes as irrelevant, then stitched the survivors
        // back-to-back. That drifts away from what the painter just did, visibly:
        //   • reach — pausing between strokes walked the window backwards without
        //     limit, so a 5s replay could pull in strokes from a minute ago (the
        //     touches that were never in the last 5 seconds), and a tap — one
        //     event, zero duration — cost nothing at all, so any number of them
        //     rode along for free.
        //   • rhythm — collapsing the gaps replays a different performance from the
        //     one that happened. The pauses are part of the timing.
        //   • footprint — the stitch rebuilt each event by hand and dropped `tip`
        //     and `shape`, so processReplay saw no stamp, set __remoteStroke, and
        //     printed the whole window in the fallback gaussian at the wrong
        //     apparent size. (Stroke mode kept them via deepCopyEvent; only the
        //     time path lost them.)
        // Keeping each event's ABSOLUTE time and cutting a real window out of it
        // fixes the first two; deep-copying whole events fixes the third.
        //
        // The window is anchored at the LAST PAINTED EVENT, not at Date.now():
        // the replay is triggered by hand after the stroke, and anchoring at "now"
        // would spend the budget on the seconds it took to reach the right button.
        function buildTimeReplayEvents() {
            var period = (window.replayTimePeriod || 5) * 1000;
            // Flatten history + the in-progress stroke into one absolutely-timed
            // list. Each stroke's events are relative to that stroke's own start.
            var flat = [];
            function collectStroke(events, startTime) {
                if (!events || !events.length) return;
                var base = (typeof startTime === 'number') ? startTime : 0;
                for (var i = 0; i < events.length; i++) {
                    flat.push({ ev: events[i], abs: base + events[i].t, head: i === 0 });
                }
            }
            for (var s = 0; s < strokeHistory.length; s++) {
                collectStroke(strokeHistory[s].events, strokeHistory[s].startTime);
            }
            if (!strokeArchived && strokeEvents.length > 0) {
                collectStroke(strokeEvents, strokeStartTime);
            }
            if (!flat.length) return [];
            var cutoff = flat[flat.length - 1].abs - period;
            var first = -1;
            for (var i2 = 0; i2 < flat.length; i2++) {
                if (flat[i2].abs >= cutoff) { first = i2; break; }
            }
            if (first < 0) return [];
            // Rebase on the first surviving event so playback starts immediately —
            // only the LEADING idle is dropped; every gap inside the window stays.
            var t0 = flat[first].abs;
            var out = [];
            for (var k = first; k < flat.length; k++) {
                var copy = deepCopyEvent(flat[k].ev);
                copy.t = flat[k].abs - t0;
                copy.head = flat[k].head;   // stroke boundary — see deepCopyEvent
                out.push(copy);
            }
            return out;
        }
        function replayStroke(broadcast = true, reuse = false) {
            var eventsToReplay;
            if (reuse && window._activeReplayEvents && window._activeReplayEvents.length) {
                // Looping — reuse the snapshot from the initial trigger
                eventsToReplay = window._activeReplayEvents;
            } else if (window.replayMode === 'time') {
                eventsToReplay = buildTimeReplayEvents();
            } else {
                // Deep-copy so replay is fully isolated from source data
                eventsToReplay = strokeEvents.map(deepCopyEvent);
            }
            if (!eventsToReplay || !eventsToReplay.length) {
                // Fallback: try the most recent stroke from history
                if (strokeHistory.length > 0) {
                    eventsToReplay = strokeHistory[strokeHistory.length - 1].events.map(deepCopyEvent);
                }
            }
            if (!eventsToReplay || !eventsToReplay.length) { isReplayActive = false; return; }
            // Re-roll rnd-flagged colours per stroke — see resolveReplayRandomness.
            eventsToReplay = resolveReplayRandomness(eventsToReplay);
            // Store the active replay events for processReplay
            window._activeReplayEvents = eventsToReplay;
            // Warm every stamp this replay will ask for. The GL upload is lazy
            // and async, so without this the opening dabs of every replay come
            // out untextured while the texture decodes.
            try {
                if (window.BrushShapes && typeof window.BrushShapes.warm === 'function') {
                    var seen = {};
                    for (var wi = 0; wi < eventsToReplay.length; wi++) {
                        var sid = eventsToReplay[wi].shape;
                        if (sid && !seen[sid]) { seen[sid] = 1; window.BrushShapes.warm(sid); }
                    }
                }
            } catch (_) {}
            replayIndex = 0;
            replayFrac = 0;
            replayDebt = 0;
            replayClock = 0;
            replayLastMs = Date.now();
            isReplayActive = true;
            // Broadcast full stroke to multiplayer
            if (broadcast && typeof broadcastReplayStroke === 'function') {
                const norm = eventsToReplay.map(ev => {
                    const o = {
                        t: ev.t,
                        x: ev.x / canvas.width,
                        y: ev.y / canvas.height,
                        dx: ev.dx / canvas.width,
                        dy: ev.dy / canvas.height,
                        color: ev.color,
                        mult: ev.mult,
                        radius: ev.radius,
                        // Carry the footprint too. These were recorded per event
                        // (pushStrokeEvent) and then dropped right here, so a
                        // broadcast replay reached peers with no idea what brush
                        // it was reproducing; 06 publishes the stamp bitmaps the
                        // ids refer to before it sends the events.
                        tip: ev.tip,
                        shape: ev.shape || null
                    };
                    // Stroke boundary, so the receiver's interpolation keeps the
                    // gaps of a Time replay instead of painting across them.
                    // Sent only where true; a peer on an older build ignores it
                    // and leans on the pause/distance guards instead.
                    if (ev.head) o.head = 1;
                    return o;
                });
                try { broadcastReplayStroke(norm); } catch(_){}
            }
        }
        // FPS Cap dropdown (supports numeric values + 'native' for display-matched)
        function applyFpsCap(val) {
            if (val === 'native') {
                // 0 = uncapped; the render loop will run at display Hz naturally
                window.fpsCap = 0;
                window.__fpsCapMode = 'native';
            } else {
                const num = parseInt(val, 10);
                window.fpsCap = Number.isFinite(num) ? num : 60;
                window.__fpsCapMode = 'fixed';
            }
            console.log('[FPS Cap] set to', window.fpsCap, '(' + window.__fpsCapMode + ')');
        }
        function initFpsCapControl() {
            const fpsCapSel = document.getElementById('fpsCap');
            if (!fpsCapSel) { setTimeout(initFpsCapControl, 100); return; }
            let savedVal = '60';
            try {
                if (window.Settings && typeof window.Settings.loadSelect === 'function') {
                    savedVal = window.Settings.loadSelect('fpsCap', '60');
                }
            } catch (_) {}
            // Uncapped modes do not survive a boot. The sim's visual character
            // was tuned at ~60 Hz stepping: advection bilinear-refilters the
            // whole dye texture every sim step, so at 300+ fps strokes take 5×
            // more resample blur per second and smear out soft and lifeless
            // (dissipation is decayDt-batched and immune, but refiltering is
            // per-step by nature). Historically the boot profile rewrote the
            // cap to 30/60 on every launch, so the app's whole tuned look
            // implicitly assumes it. 'Native' stays selectable in-session.
            if (savedVal === 'native' || savedVal === '0') {
                console.log('[FPS Cap] persisted uncapped mode reset to 60 at boot (sim feel is tuned for 60 Hz stepping)');
                savedVal = '60';
            }
            fpsCapSel.value = savedVal;
            // If the saved value doesn't match any option, fall back to '60'
            if (fpsCapSel.value !== savedVal) {
                fpsCapSel.value = '60';
                savedVal = '60';
            }
            applyFpsCap(savedVal);
            fpsCapSel.addEventListener('change', (e) => {
                const val = e.target.value;
                applyFpsCap(val);
                try {
                    if (window.Settings && typeof window.Settings.saveSelect === 'function') {
                        window.Settings.saveSelect('fpsCap', val);
                    }
                } catch (_) {}
            });
            // Update "Native" label when display Hz is detected
            const nativeOpt = fpsCapSel.querySelector('option[value="native"]');
            function updateNativeLabel() {
                if (nativeOpt) {
                    nativeOpt.textContent = 'Native (' + (window.__displayHz || 60) + ' Hz)';
                }
            }
            // Update immediately if already detected, and register for future changes
            updateNativeLabel();
            window.__onDisplayHzChanged = function(hz) {
                updateNativeLabel();
                // If user has "native" selected, update the effective cap too
                if (fpsCapSel.value === 'native') {
                    window.fpsCap = 0; // 0 = uncapped, runs at display Hz
                }
            };
        }
        initFpsCapControl();
        // One dab of a replayed stroke. `k` is the share of the recorded dab
        // this call deposits — 1 for a whole one. The interpolator below splits
        // a recorded dab across the frames a slowed replay stretches it over,
        // and a partial dab has to carry a partial push and a partial share of
        // the dye, or the same stroke comes out 1/k times too heavy.
        function emitReplayDab(ev, x, y, dx, dy, k) {
            // Faithful reproduction (2026-07-13): replay uses the brush size
            // and arm count RECORDED with each event. The old "use current
            // live settings" behavior meant a stroke painted small replayed at
            // whatever the slider says now — and remote strokes replayed at the
            // RECEIVER's brush size.
            // Footprint, same rule as size and colour: reproduce what was
            // RECORDED. 05i reads the tip and the active stamp straight off
            // config, so pinning them for the dab is what makes the replay wear
            // the brush the stroke was painted with. A stamp we cannot draw — a
            // peer's (its bitmap can't ride the wire), or one since deleted —
            // falls back to __remoteStroke, which suppresses the viewer's own
            // stamp rather than printing the stroke in some arbitrary shape the
            // user happens to have selected now.
            var evShape = ev.shape || null;
            var haveStamp = !!(evShape && window.BrushShapes
                && typeof window.BrushShapes.has === 'function'
                && window.BrushShapes.has(evShape));
            var savedTip = config.BRUSH_TIP;
            var savedShape = config.BRUSH_SHAPE_ID;
            // Push rides the same pin-then-restore as the footprint: a dab is
            // replayed as velocity-only if it WAS one, whatever the brush is set
            // to now. Pinned unconditionally (not only when ev.push is set), or
            // a Push stroke recorded earlier would repaint as dye the moment the
            // live brush happened to be in Push mode, and vice versa.
            var savedVelOnly = config.BRUSH_VELOCITY_ONLY;
            var savedVelMode = config.BRUSH_VEL_MODE;
            var savedVelStr = config.BRUSH_VEL_STRENGTH;
            // Per-arm Pressure rides the same pin, and unconditionally for the
            // same reason: without it, a stroke painted with plain arms replays
            // with holes wherever the panel happens to have an arm marked now
            // (and a stroke that DID have push arms replays as solid dye).
            var savedArmPush = window.__armPushPin;
            window.__armPushPin = (typeof ev.ap === 'number' && isFinite(ev.ap))
                ? (ev.ap | 0) : 0;
            // Replayed events are not always ours: a peer's broadcast replay
            // arrives here as raw wire JSON (06 scheduleStrokeReplay). Coerce
            // against the known set before it touches config — splat() would
            // treat an unknown mode as 'smudge' and be safe, but the VALUE would
            // still be sitting in config for the settings mirror to re-persist
            // and re-broadcast, which is exactly how a retired symmetry mode
            // came back from the dead once.
            var _push = (ev.push && typeof ev.push === 'object') ? ev.push : null;
            config.BRUSH_VELOCITY_ONLY = !!_push;
            if (_push) {
                config.BRUSH_VEL_MODE = (_push.m === 'spread' || _push.m === 'gather' || _push.m === 'swirl')
                    ? _push.m : 'smudge';
                config.BRUSH_VEL_STRENGTH = (typeof _push.s === 'number' && isFinite(_push.s))
                    ? Math.max(0, Math.min(5, _push.s)) : 1;
            }
            if (typeof ev.tip === 'number') config.BRUSH_TIP = ev.tip;
            config.BRUSH_SHAPE_ID = haveStamp ? evShape : null;
            window.__remoteStroke = !haveStamp;
            // Replay is faithful: the colour that was painted. (The "use
            // current colour" opt-in was removed 2026-08-16 — arm modes resolve
            // on top of this value, and arm 0's usual 'fixed' mode discarded the
            // live colour anyway.) A partial dab takes its share through the
            // same helper the live brush uses, so each flow model gets the
            // compensation that is exact for it: additive is linear, so the
            // colour scales; Gate is a convergence, idempotent at full flow, so
            // it correctly does not scale at all.
            var col = (k < 1) ? applyPaintFlow(ev.color, normalizePaintFlow(1, k)) : ev.color;
            try {
                if (typeof window.applyMultiSplatWith === 'function') {
                    window.applyMultiSplatWith(x, y, dx, dy, col,
                        ev.mult || 1, (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS);
                } else {
                    multiSplat(x, y, dx, dy, col, false);
                }
                // Re-recording a replay captures what the REPLAY painted, so
                // this has to run while the pin is still on. Outside the
                // finally it read the live brush instead — a Pressure dab was
                // re-recorded as ordinary dye (and the tip likewise), which is
                // the very gap the pin exists to close.
                if (typeof recRecordInteraction === 'function' && recEnabled) {
                    // Randomness rides the same pin as push/footprint: the
                    // source event knows whether random rolled it, and the
                    // re-record must not read the live panel instead. The fm
                    // pin carries the flow share baked into col — partial
                    // (interpolated) dabs are k-scaled per frame, so without
                    // it timeline playback sees a different colour on every
                    // dab and its stroke-grouping heuristic rolls confetti.
                    window.__recRndPin = ev.rnd ? 1 : 0;
                    window.__recFmPin = (config.COLOR_GATE ? 1 : k) *
                        ((typeof ev.fm === 'number' && isFinite(ev.fm)) ? ev.fm : 1);
                    try { recRecordInteraction(x, y, dx, dy, col); } catch(_){}
                    window.__recRndPin = null;
                    window.__recFmPin = null;
                }
            } finally {
                window.__remoteStroke = false;
                window.__splatFlow = 1;   // applyPaintFlow may have set it
                config.BRUSH_TIP = savedTip;
                config.BRUSH_SHAPE_ID = savedShape;
                config.BRUSH_VELOCITY_ONLY = savedVelOnly;
                config.BRUSH_VEL_MODE = savedVelMode;
                config.BRUSH_VEL_STRENGTH = savedVelStr;
                window.__armPushPin = savedArmPush;
            }
        }
        // ── Replay interpolation (2026-08-22) ────────────────────────────────
        // A recorded dab used to arrive whole at its own timestamp, so Replay
        // Speed changed WHEN dabs landed and nothing else. At 1x that is fine —
        // the recording was sampled once per frame, so one dab lands per frame —
        // but at 0.25x it leaves three empty frames between deposits and the
        // fluid advects through every one of them. The stroke stopped being a
        // stroke and became a string of separate blobs: the jerky slow replay.
        // The cure is the brush engine's (05d0 emitFloorDab): a dab is a SAMPLE
        // of a stroke, not a quantum of paint. Spread it along the path it
        // covers, one sample per frame, each carrying its share — same paint,
        // same push, finer sampling — and a slowed replay draws the same stroke
        // slowly instead of dripping it.
        // Only ever WITHIN a continuation, never across a boundary: not over a
        // stroke change (a Time replay keeps the real pauses between strokes),
        // not over a long stall inside one stroke, and not over a jump too far
        // to be one frame of hand movement. Those still arrive whole.
        var REPLAY_GAP_MS = 250;     // longest pause still treated as continuous
        var REPLAY_GAP_FRAC = 0.25;  // longest jump, as a fraction of canvas width
        var REPLAY_MIN_K = 0.01;     // smallest share worth a splat (see below)
        function replayLerpable(prev, ev) {
            if (!prev || ev.head || config.REPLAY_INTERP === false) return false;
            var span = ev.t - prev.t;
            if (!(span > 0) || span > REPLAY_GAP_MS) return false;
            return Math.hypot(ev.x - prev.x, ev.y - prev.y) <= REPLAY_GAP_FRAC * canvas.width;
        }
        function processReplay() {
            if (!isReplayActive) return;
            var events = window._activeReplayEvents;
            if (!events || !events.length) { isReplayActive = false; return; }
            try {
                var speed = (typeof window.replaySpeed === 'number' && window.replaySpeed > 0)
                    ? window.replaySpeed : 1;
                // Advance the playhead by THIS frame at the CURRENT speed, so
                // the slider retimes what is left to play instead of rescaling
                // what has already played. Capped so a hitch (or a tab that was
                // in the background) resumes the replay rather than dumping
                // every dab it owes into one frame.
                var nowMs = Date.now();
                var dt = nowMs - replayLastMs;
                if (!(dt > 0)) dt = 0; else if (dt > 100) dt = 100;
                replayLastMs = nowMs;
                replayClock += dt * speed;
                var elapsed = replayClock;
                while (replayIndex < events.length) {
                    var ev = events[replayIndex];
                    var prev = replayIndex > 0 ? events[replayIndex - 1] : null;
                    if (!replayLerpable(prev, ev)) {
                        if (ev.t > elapsed) break;
                        emitReplayDab(ev, ev.x, ev.y, ev.dx, ev.dy, 1);
                        replayIndex++;
                        replayFrac = 0;
                        replayDebt = 0;   // a whole dab opens a fresh account
                        continue;
                    }
                    // How far into this segment the playhead has reached, and
                    // how much of that is still undeposited — replayFrac is
                    // what earlier frames already laid down.
                    var f = (elapsed - prev.t) / (ev.t - prev.t);
                    if (f > 1) f = 1;
                    if (f > replayFrac) {
                        var k = f - replayFrac + replayDebt;
                        // A sliver of a dab deposits nothing anyone can see and
                        // still costs the splat its two GPU passes. Frame time
                        // never divides a segment exactly, so one lands at every
                        // segment boundary: measured k ~ 0.000005, and 19 of a
                        // 1x replay's 39 dabs were these. Don't spend a splat on
                        // it — hold it (replayFrac still owes it) or, if the
                        // segment is finishing, carry it to the next dab. Either
                        // way the stroke lands exactly the paint it recorded.
                        if (k >= REPLAY_MIN_K) {
                            emitReplayDab(ev,
                                prev.x + (ev.x - prev.x) * f,
                                prev.y + (ev.y - prev.y) * f,
                                ev.dx * k, ev.dy * k, k);
                            replayFrac = f;
                            replayDebt = 0;
                        } else if (f >= 1) {
                            replayDebt = k;
                        }
                    }
                    if (f < 1) break;   // this segment still has road left
                    replayIndex++;
                    replayFrac = 0;
                }
                if (replayIndex >= events.length) {
                    // Right button still held → loop, and REBROADCAST each
                    // pass. Loops used to skip the rebroadcast (anti-spam),
                    // so a held replay repeated on the painter's canvas while
                    // every peer saw it exactly once — in a turn performance
                    // the audience must see every loop. Peers restart their
                    // replay on each arrival, so they loop in lockstep.
                    if (isRightMouseDown) {
                        replayStroke(true, true);
                    } else {
                        isReplayActive = false;
                        window._activeReplayEvents = null;
                    }
                }
            } catch (err) {
                isReplayActive = false;
                window._activeReplayEvents = null;
            }
        }
        // Allow multiplayer to schedule a stroke replay with normalized events
        window.scheduleStrokeReplay = function(normalizedEvents) {
            var remoteEvents = (normalizedEvents || []).map(ev => ({
                t: ev.t || 0,
                x: (ev.x || 0) * canvas.width,
                y: (ev.y || 0) * canvas.height,
                dx: (ev.dx || 0) * canvas.width,
                dy: (ev.dy || 0) * canvas.height,
                color: Array.isArray(ev.color) ? ev.color.slice() : pointer.color.slice(),
                mult: Math.max(1, Math.round(ev.mult || 1)),
                radius: (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS,
                // The sender's footprint. processReplay pins these per event
                // and checks BrushShapes.has(), which counts a peer's cached
                // stamp — so a relayed replay keeps the brush it was painted
                // with, and falls back to the built-in tip if it did not
                // arrive rather than borrowing this client's shape.
                tip: (typeof ev.tip === 'number') ? (ev.tip | 0) : undefined,
                shape: (typeof ev.shape === 'string' && ev.shape) ? ev.shape : null,
                // Stroke boundary (see deepCopyEvent). Absent from older peers,
                // where the pause/distance guards do the same job less exactly.
                head: !!ev.head,
                // Push. Dropping these here is what made a broadcast replay of
                // a Pressure stroke repaint as DYE on every peer: 06 has been
                // sending `push` on the wire, and this mapper — which rebuilds
                // each event field by field — silently discarded it, so
                // emitReplayDab saw an ordinary dab. `ap` is the per-arm mask.
                // Shape-checked only; emitReplayDab does the value coercion,
                // and does it for local events too.
                push: (ev.push && typeof ev.push === 'object')
                    ? { m: ev.push.m, s: ev.push.s } : null,
                ap: (typeof ev.ap === 'number' && isFinite(ev.ap)) ? (Math.abs(ev.ap) | 0) : undefined
            }));
            if (!remoteEvents.length) return;
            window._activeReplayEvents = remoteEvents;
            replayIndex = 0;
            replayFrac = 0;
            replayDebt = 0;
            replayClock = 0;
            replayLastMs = Date.now();
            isReplayActive = true;
        };
        // ── Painting lifecycle: POINTER events (pen + mouse) with capture ──
        // Every other interactive surface here (draggables, layer transforms,
        // audio scenes, path layers, resize handles) drives its down/up lifecycle
        // through Pointer Events + setPointerCapture. The paint canvas used to be
        // the lone exception, running its lifecycle off SYNTHESIZED COMPATIBILITY
        // mouse events (mousedown/mouseup) while only tapping pointermove for the
        // engine feed. That split is exactly what "doesn't gracefully handle pens":
        // a pen commonly delivers pointerup / pointercancel with NO matching compat
        // mouseup, so the stroke never got its graceful end — queued tail dabs
        // stranded, arm colours never advanced. Under one tip it's easy to miss;
        // with kaleidoscope mirror arms (the "2nd–8th brush") every stranded end is
        // multiplied around the canvas and screams. Touch keeps its own touch*
        // path below (multi-finger gestures need raw TouchList data), so it's
        // filtered out of these pointer handlers.
        // ── One device owns a stroke ──────────────────────────────────
        // A pen and a mouse are two INDEPENDENT pointers and Windows keeps both
        // alive at once: a pen in proximity streams hover moves while the mouse
        // sits (or paints) somewhere else, and moving the pen also warps the
        // system cursor. These handlers used to take EVERY non-touch pointer, so
        // pointer.x/y jumped between the two devices' positions on alternating
        // events — the stroke, and every kaleidoscope mirror arm of it, zipped
        // back and forth across the canvas at enormous velocity — and a lift on
        // the IDLE device ended the stroke the other one was drawing. So: the
        // first pointer to press owns the stroke (window.__paintPointerId) and
        // every other pointer is ignored until it ends. The right-button replay
        // hold gets the same treatment (replayPointerId): a second device's
        // buttonless hover moves used to trip its self-heal and cancel it.
        let replayPointerId = null;
        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return; // touchstart owns touch
            // Take-turns multiplayer: while it's someone else's turn, both
            // painting AND right-click replay (which rebroadcasts a stroke)
            // are gated — the relay would drop them and the local-only paint
            // would silently desync this client from the room.
            if (window.__mpTurnBlocked && (e.button === 0 || e.button === 2)) {
                if (e.button === 2) e.preventDefault();
                if (typeof window.__mpTurnHint === 'function') window.__mpTurnHint();
                return;
            }
            // Right-click / pen-barrel replay always works, even when paused
            if (e.button === 2) {
                e.preventDefault();
                isRightMouseDown = true;
                replayPointerId = e.pointerId;
                // Capture, like the paint path does: without it a release that
                // happens off-window is never delivered here and the hold
                // strands. (The paint branch below captures; this one never did.)
                try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
                if (pointer.down) {
                    // Left/tip is held — enter pause-only mode.
                    // Snapshot velocity for the fast-brush easter egg on release.
                    // Do NOT fire replayStroke; that would layer replayed splats
                    // on top of the live paint and cause fuzz/static.
                    isReplayActive = true;
                    window._pausedPointerState =
                        (pointer.dx * pointer.dx + pointer.dy * pointer.dy) > 0.1
                            ? { x: pointer.x, y: pointer.y, dx: pointer.dx, dy: pointer.dy, color: pointer.color.slice() }
                            : null;
                } else {
                    // Normal replay — no active painting, just replay last stroke.
                    window._pausedPointerState = null;
                    isReplayActive = true;
                    replayStroke(true);
                }
                return;
            }
            // Primary button only (pen TIP reports 0; middle=1, back/forward=3/4,
            // pen ERASER=5). pointerup only finalizes buttons 0 and 2, so any
            // other button used to start a stroke that could never end — leaving
            // pointer.down stuck true and painting a permanent line under the
            // cursor until the app was restarted.
            if (e.button !== 0) return;
            // Only process presses that actually target the canvas (not click-throughs from UI)
            if (isPaused || e.target !== canvas) return;
            // Another device is already mid-stroke (pen down, mouse clicks — or
            // the reverse): leave it alone. Adopting the press would re-point
            // __paintPointerId, restart the brush engine under the first stroke
            // and strand its tail. Gated on pointer.down as well as the id so a
            // stale id can never permanently lock painting out.
            if (pointer.down && window.__paintPointerId != null
                && window.__paintPointerId !== e.pointerId) return;
            // Capture the pointer so the stroke keeps getting move/up/cancel even
            // if the pen drifts off-canvas or over an overlay, AND so pointerup /
            // pointercancel are guaranteed to reach us and end the stroke cleanly.
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            window.__paintPointerId = e.pointerId;
            const coords = getCanvasCoordinates(e);
            pointer.down = true;
            pointer.moved = false;
            pointer.x = coords.x;
            pointer.y = coords.y;
            pointer.dx = 0;
            pointer.dy = 0;
            splatDownTime = Date.now();
            splatStrokeDist = 0;
            splatOutActive = false;
            applyPickerColor();
            // D2/D3 routing: sketch and mask strokes are surface paint — no
            // fluid replay events, no recording timelines, no multiplayer
            // broadcast (local-only until D7's unified schema). The gate used
            // to test 'sketch' only, so collider painting ('mask') pressed a
            // DYE splat into the fluid — locally AND broadcast to peers, who
            // saw phantom colour blobs while the painter drew invisible-to-
            // them walls (found by the 2026-08-16 multiplayer fidelity audit).
            const _sketchTarget = config.BRUSH_TARGET === 'sketch';
            const _maskTarget = config.BRUSH_TARGET === 'mask';
            if (_sketchTarget) {
                if (typeof window.__sketchStamp === 'function') window.__sketchStamp(coords.x, coords.y, 1);
            } else if (_maskTarget) {
                // Press lands in the mask, same as the 05j dab route.
                if (typeof window.__maskStamp === 'function') window.__maskStamp(coords.x, coords.y, 1);
            } else {
                // Begin stroke recording and include the initial splat.
                // Radius FIRST: pushStrokeEvent reads __lastPaintRadius, so
                // computing it after meant every stroke's press event recorded
                // the PREVIOUS stroke's size.
                startStroke(pointer.x, pointer.y);
                const inMult = getSplatInMult();
                window.__lastPaintRadius = config.SPLAT_RADIUS * inMult; // recording captures the true painted size
                const _pcol = applyPaintFlow(pointer.color, pressFlowMul() * splatInFlowMul());
                pushStrokeEvent(pointer.x, pointer.y, 0, 0, _pcol);
                if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, _pcol);
                multiSplatWithRadius(pointer.x, pointer.y, 0, 0, _pcol, config.SPLAT_RADIUS * inMult);
                window.__splatFlow = 1; // reset so the engine/tail/programmatic splats stay full-flow
            }
            // D1 brush engine: stroke movement is emitted as spaced dabs by
            // the engine (fed from the pointermove listener below, drained in
            // 05j). The immediate press stamp above stays for latency.
            if (window.BrushEngine) window.BrushEngine.begin(coords.x, coords.y);
            if (!_sketchTarget && !_maskTarget && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS,
                    true   // stroke-opening press: no gap-fill from the last stroke
                );
            }
        });
        // Unified move handler (pen + mouse) — the single source of truth for the
        // stroke, replacing the old pointermove-feeds-engine / mousemove-does-state
        // split. Keeping state on the compat 'mousemove' while the engine ran on
        // 'pointermove' meant the release coordinates could lag the real pen path;
        // driving BOTH from the same pointer stream keeps them exact. Touch stays
        // on touchmove (it needs touch-action:none handling + gestures), so it's
        // filtered out here. With pointer capture (set on pointerdown), these keep
        // arriving even when the pen drifts off-canvas, so the stroke never freezes.
        canvas.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return; // touchmove owns touch
            // Self-heal a stranded replay hold. A hovering pen streams moves with
            // no buttons held, so the first move after a missed barrel release
            // clears it and painting comes back immediately — instead of staying
            // dead until the app restarts. A genuine mouse right-hold and a
            // barrel-held hover both still report bit 2, so a deliberate replay
            // hold is untouched.
            if (isRightMouseDown && (e.buttons & 2) === 0
                && (replayPointerId == null || e.pointerId === replayPointerId)) {
                isRightMouseDown = false;
                replayPointerId = null;
                isReplayActive = false;
                window._activeReplayEvents = null;
            }
            // Only the pointer that owns the live stroke may move it (see the
            // note above pointerdown). Everything else — a hovering pen, a
            // nudged mouse — is dropped here, before it can touch pointer.x/y
            // or feed the brush engine a dab at the other device's position.
            // Placed AFTER the self-heal above so a replay hold latched by the
            // idle device can still release itself.
            if (pointer.down && window.__paintPointerId != null
                && e.pointerId !== window.__paintPointerId) return;
            if (isPaused || isReplayActive) return;
            // Engine feed: replay every coalesced sub-frame sample (position)
            // while a stroke is live. Density is governed by BRUSH_SPACING.
            if (window.BrushEngine && window.BrushEngine.isActive()) {
                const evs = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
                if (evs && evs.length) {
                    for (let i = 0; i < evs.length; i++) {
                        const c = getCanvasCoordinates(evs[i]);
                        window.BrushEngine.move(c.x, c.y);
                    }
                } else {
                    const c = getCanvasCoordinates(e);
                    window.BrushEngine.move(c.x, c.y);
                }
            }
            // Pointer state (was the old mousemove path): drives the release
            // velocity/point, the multiplayer cursor, recording and broadcast.
            const coords = getCanvasCoordinates(e);
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            if (typeof broadcastCursor === 'function') {
                broadcastCursor(coords.x / canvas.width, coords.y / canvas.height);
            }
            if (pointer.down) {
                // Skip near-zero moves (avoids re-splat artifacts + wasted work)
                if (pointer.dx * pointer.dx + pointer.dy * pointer.dy < 1.0) return;
                pointer.moved = true;
                const _skT = config.BRUSH_TARGET === 'sketch';
                if (!_skT && recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                // 1.3 parity: when the brush engine drives the stroke it
                // broadcasts its real dab train from 05j (queueDab/flushDabs).
                // Sampling here too would double-paint every peer.
                if (!_skT && !window.BrushEngine && typeof broadcastSplat === 'function') {
                    if (!canvas._lastBroadcast || Date.now() - canvas._lastBroadcast > 33) {
                        broadcastSplat(
                            coords.x / canvas.width,
                            coords.y / canvas.height,
                            pointer.dx / canvas.width,
                            pointer.dy / canvas.height,
                            pointer.color,
                            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                            config.SPLAT_RADIUS
                        );
                        canvas._lastBroadcast = Date.now();
                    }
                }
            }
        });
        // The graceful end of a left/tip stroke — shared by pointerup AND
        // pointercancel so a pen that ends via cancel (palm rejection, proximity
        // loss) finalizes exactly like a clean lift instead of dropping its tail.
        function finishLeftStroke() {
            var wasDown = pointer.down;
            if (wasDown && typeof broadcastPointerUp === 'function') {
                broadcastPointerUp();
            }
            // Tail is a FLUID effect: sketch and mask (collider) strokes must
            // not arm it — the sketch-only test let a collider stroke's lift
            // squirt a dye tail into the fluid at the wall's end, locally and
            // (once tails rode the wire) on every peer. Audit 2026-08-16.
            if (wasDown && window.splatOutMode !== 'instant' && config.BRUSH_TARGET === 'fluid') {
                splatUpTime = Date.now();
                splatOutActive = true;
                splatTailDist = 0;
                splatReleaseInMult = getSplatInMult(); // size at release → no jump
                splatOutX = pointer.x;
                splatOutY = pointer.y;
                splatOutDx = pointer.dx;
                splatOutDy = pointer.dy;
                splatOutColor = pointer.color.slice();
            }
            pointer.down = false;
            pointer.moved = false;
            if (wasDown) {
                // Finish the engine stroke: the stabilizer's lagged tail
                // catches up to the release point (dabs drain in 05j)
                if (window.BrushEngine) window.BrushEngine.end(pointer.x, pointer.y);
                archiveCurrentStroke();
                advanceColor();
                // Defer arm color advance until ALL painting settles — the
                // splat-out tail AND the stabilizer's queued catch-up dabs
                // (05j flushes on full engine idle). Advancing at release
                // repainted the still-draining tail dabs in next-stroke
                // colors while arm 0 kept the old pointer color: the
                // "three colors at stroke end" flash.
                pendingArmAdvance = true;
            }
        }
        // Listened on WINDOW so a captured pointer's release is caught wherever it
        // lifts — including off-canvas. This is the graceful end the old compat
        // 'mouseup' path kept missing for pens.
        window.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'touch') return; // touchend owns touch
            // A lift on a device that ISN'T the one painting must not end the
            // stroke or drop its capture (see the note above pointerdown). Null
            // means unowned — touch strokes, or a press that began off-canvas —
            // and keeps the old catch-all behaviour as a safety net.
            const _ownsPaint = (window.__paintPointerId == null
                || window.__paintPointerId === e.pointerId);
            if (window.__paintPointerId === e.pointerId) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                window.__paintPointerId = null;
            }
            // Trust the buttons BITMASK, not just which button this event names.
            // A pen barrel press arrives as button 2 and latches the replay hold;
            // if its release never comes back as a button-2 pointerup — released
            // while hovering, released off-window, or swallowed by the OS
            // press-and-hold gesture — the hold stuck forever. A stuck hold
            // re-launches the last stroke's replay every pass, which both sprays
            // dye where you were painting and gates all further painting down to
            // press dots: "the stylus stopped working". It also rebroadcast every
            // pass, so one stuck client locked painting for the whole room.
            if (isRightMouseDown && (e.buttons & 2) === 0 && e.button !== 2
                && (replayPointerId == null || e.pointerId === replayPointerId)) {
                isRightMouseDown = false;
                replayPointerId = null;
            }
            if (e.button === 2) {
                // A barrel/right release from the other device isn't ours.
                if (replayPointerId != null && e.pointerId !== replayPointerId) return;
                replayPointerId = null;
                isRightMouseDown = false;
                isReplayActive = false;
                window._activeReplayEvents = null;
                customCursor.style.opacity = '0';
                // "Fast brush" easter egg: if the tip was held during the right-click pause,
                // fire a short burst of splats along the accumulated velocity vector.
                // Uses the last snapshotted pointer state from trackMouseMovement.
                if (pointer.down) {
                    var ps = window._pausedPointerState;
                    var bx  = ps ? ps.x  : pointer.x;
                    var by  = ps ? ps.y  : pointer.y;
                    var bdx = ps ? ps.dx : pointer.dx;
                    var bdy = ps ? ps.dy : pointer.dy;
                    var bc  = ps ? ps.color : pointer.color.slice();
                    // Only fire if there's meaningful velocity to burst with
                    if (bdx * bdx + bdy * bdy > 0.1) {
                        var burstSteps = 6;
                        var decay = 0.72;
                        for (var bi = 0; bi < burstSteps; bi++) {
                            (function(step, cx, cy, cdx, cdy) {
                                setTimeout(function() {
                                    // Skip if the tip released in the meantime
                                    if (!pointer.down) return;
                                    splat(cx + cdx * step * 0.08,
                                          cy + cdy * step * 0.08,
                                          cdx * Math.pow(decay, step),
                                          cdy * Math.pow(decay, step),
                                          bc);
                                }, step * 16);
                            })(bi, bx, by, bdx, bdy);
                        }
                    }
                    window._pausedPointerState = null;
                }
            } else if (e.button === 0) {
                if (_ownsPaint) finishLeftStroke();
            }
        });
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        // ── Pointer-state safety net ──
        // pointerup is normally enough to clear pointer.down, but a few events
        // skip it and would otherwise strand the stroke (so the next press reads
        // as a continuation — the "up/down out of sync" bug): a native drag
        // (dragstart fires dragend, not pointerup), or the window losing focus
        // mid-press. Force-end any in-progress stroke on those so it can never
        // stick. This is a HARD abort (no catch-up tail) — the user has left.
        function abortPointerStroke() {
            isRightMouseDown = false;
            replayPointerId = null;
            isReplayActive = false;
            window._activeReplayEvents = null;
            window._pausedPointerState = null;
            window.__paintPointerId = null;
            if (window.BrushEngine) window.BrushEngine.abort();
            if (pointer.down) {
                pointer.down = false;
                pointer.moved = false;
                archiveCurrentStroke();
            }
        }
        window.addEventListener('blur', abortPointerStroke);
        window.addEventListener('dragstart', abortPointerStroke);
        // pointercancel is a NORMAL pen ending on Windows (palm rejection,
        // proximity loss, the OS claiming the gesture) — not an abandonment. So
        // finalize GRACEFULLY at the last known point (Krita-style) instead of
        // hard-aborting: drain the tail, advance arm colours, run splat-out. The
        // old abort dropped all of that, which is what made pen stroke-ends — and
        // their mirror-arm copies — look chopped. Touch cancels stay on the touch
        // path (touchcancel → abortPointerStroke).
        window.addEventListener('pointercancel', (e) => {
            if (e && e.pointerType === 'touch') return; // touchcancel owns touch
            const _pid = e ? e.pointerId : null;
            // A cancel on the idle device — a pen leaving proximity while the
            // mouse paints — clears only ITS OWN replay hold; it must never
            // finalize the other device's stroke.
            if (replayPointerId == null || _pid == null || replayPointerId === _pid) {
                isRightMouseDown = false;
                replayPointerId = null;
                isReplayActive = false;
                window._activeReplayEvents = null;
                window._pausedPointerState = null;
            }
            if (window.__paintPointerId != null && _pid != null
                && window.__paintPointerId !== _pid) return;
            if (window.__paintPointerId != null) {
                try { canvas.releasePointerCapture(_pid); } catch (_) {}
                window.__paintPointerId = null;
            }
            finishLeftStroke();
        });
        // ── Mobile gesture layer (13.1-13.3) ─────────────────────────
        // Two-finger gestures on the canvas: pinch = brush size (drives
        // the #brushSize slider like the wheel path in 05h), two-finger
        // vertical drag = replay period. The role locks on the dominant
        // axis once movement passes a threshold; painting is suppressed
        // from the moment a second finger lands until ALL fingers lift.
        const TouchGestures = (() => {
            let active = false;    // 2-finger gesture in progress
            let suppress = false;  // no painting until all fingers lift
            let role = null;       // 'pinch' | 'vdrag' | null (undecided)
            let dist0 = 0, cy0 = 0;
            let size0 = 0, period0 = 5;
            let toastEl = null, toastTimer = null;

            function metrics(e) {
                const a = e.touches[0], b = e.touches[1];
                return {
                    dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
                    cy: (a.clientY + b.clientY) / 2
                };
            }
            // On-canvas indicator (13.3): display toggling only — no
            // opacity transitions (Electron CSS constraint)
            function toast(text) {
                if (!toastEl) {
                    toastEl = document.createElement('div');
                    toastEl.id = 'gestureIndicator';
                    toastEl.style.cssText = 'position:fixed;left:50%;top:20%;transform:translateX(-50%);' +
                        'z-index:10001;padding:10px 18px;border-radius:10px;background:rgba(15,20,27,0.9);' +
                        'border:1px solid rgba(100,200,255,0.4);color:#fff;font-size:20px;font-weight:600;' +
                        'pointer-events:none;display:none;';
                    document.body.appendChild(toastEl);
                }
                toastEl.textContent = text;
                toastEl.style.display = 'block';
                if (toastTimer) clearTimeout(toastTimer);
                toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 900);
            }
            function begin(e) {
                abortPointerStroke(); // second finger cancels the paint stroke
                active = true; suppress = true; role = null;
                const m = metrics(e);
                dist0 = m.dist; cy0 = m.cy;
                const s = document.getElementById('brushSize');
                size0 = s ? parseFloat(s.value) : config.SPLAT_RADIUS * 1000;
                period0 = window.replayTimePeriod || 5;
            }
            function move(e) {
                if (!active || e.touches.length < 2) return;
                const m = metrics(e);
                if (!role) {
                    const pinchD = Math.abs(m.dist - dist0);
                    const vertD = Math.abs(m.cy - cy0);
                    if (pinchD < 18 && vertD < 18) return; // undecided yet
                    role = pinchD >= vertD ? 'pinch' : 'vdrag';
                }
                if (role === 'pinch') {
                    const s = document.getElementById('brushSize');
                    if (!s) return;
                    let v = size0 * (m.dist / Math.max(1, dist0));
                    v = Math.max(parseFloat(s.min), Math.min(parseFloat(s.max), Math.round(v * 10) / 10));
                    s.value = v;
                    s.style.setProperty('--val', v);
                    // Drive it like a user drag (matches the brush-preset apply
                    // idiom): 05h's input binding sets SPLAT_RADIUS and the strip
                    // label updates instantly instead of on its 2s fallback poll.
                    s.dispatchEvent(new Event('input', { bubbles: true }));
                    toast('🖌 Brush ' + v.toFixed(1));
                } else {
                    let v = Math.round(period0 + (cy0 - m.cy) / 25); // drag up = longer
                    v = Math.max(1, Math.min(60, v));
                    if (v !== window.replayTimePeriod) {
                        window.replayTimePeriod = v;
                        const inp = document.getElementById('replayTimePeriod');
                        if (inp) inp.value = v;
                        try { if (window.settingsManager) window.settingsManager.set('brush.replayTimePeriod', v); } catch (_) {}
                    }
                    toast('⏱ Replay ' + v + 's');
                }
            }
            function end(e) {
                if (e.touches.length >= 2) return; // still gesturing
                active = false; role = null;
                if (e.touches.length === 0) suppress = false;
            }
            return { begin, move, end, isActive: () => active, isSuppressed: () => suppress };
        })();
        window.__touchGestures = TouchGestures; // harness/testing access
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isPaused) return;
            if (e.touches.length >= 2) {
                if (!TouchGestures.isActive()) TouchGestures.begin(e);
                return;
            }
            if (TouchGestures.isSuppressed()) return;
            // Take-turns multiplayer: painting is gated while it's not our turn
            // (see the pointerdown note).
            if (window.__mpTurnBlocked) {
                if (typeof window.__mpTurnHint === 'function') window.__mpTurnHint();
                return;
            }
            const touch = e.touches[0];
            const coords = getCanvasCoordinates(touch);
            pointer.down = true;
            pointer.moved = false;
            pointer.x = coords.x;
            pointer.y = coords.y;
            pointer.dx = 0;
            pointer.dy = 0;
            splatDownTime = Date.now();
            splatStrokeDist = 0;
            splatOutActive = false;
            applyPickerColor();
            // Same sketch/mask routing as the pointerdown press (see the
            // audit note there): mask presses stamp the mask, never the fluid.
            const _sketchTargetT = config.BRUSH_TARGET === 'sketch';
            const _maskTargetT = config.BRUSH_TARGET === 'mask';
            if (_sketchTargetT) {
                if (typeof window.__sketchStamp === 'function') window.__sketchStamp(coords.x, coords.y, 1);
            } else if (_maskTargetT) {
                if (typeof window.__maskStamp === 'function') window.__maskStamp(coords.x, coords.y, 1);
            } else {
                const inMult = getSplatInMult();
                window.__lastPaintRadius = config.SPLAT_RADIUS * inMult; // recording captures the true painted size
                const _pcolT = applyPaintFlow(pointer.color, pressFlowMul());
                if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, _pcolT);
                multiSplatWithRadius(pointer.x, pointer.y, 0, 0, _pcolT, config.SPLAT_RADIUS * inMult);
                window.__splatFlow = 1; // reset so the engine/tail/programmatic splats stay full-flow
            }
            // D1 brush engine (see pointerdown note)
            if (window.BrushEngine) {
                window.BrushEngine.begin(coords.x, coords.y);
            }
            if (!_sketchTargetT && !_maskTargetT && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS,
                    true   // stroke-opening press: no gap-fill from the last stroke
                );
            }
        }, { passive: false });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (isPaused) return;
            if (TouchGestures.isActive()) { TouchGestures.move(e); return; }
            if (TouchGestures.isSuppressed()) return;
            const touch = e.touches[0];
            const coords = getCanvasCoordinates(touch);
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            // D1 engine feed for touch (see pointermove note); spacing governs density
            if (pointer.down && window.BrushEngine && window.BrushEngine.isActive() && !isReplayActive) {
                window.BrushEngine.move(coords.x, coords.y);
            }
            if (pointer.down) {
                pointer.moved = true;
                const _skTT = config.BRUSH_TARGET === 'sketch';
                if (!_skTT && recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                if (!_skTT && !window.BrushEngine && typeof broadcastSplat === 'function') {
                    const now = Date.now();
                    if (!canvas._lastTouchBroadcast || now - canvas._lastTouchBroadcast > 50) {
                        broadcastSplat(
                            coords.x / canvas.width,
                            coords.y / canvas.height,
                            pointer.dx / canvas.width,
                            pointer.dy / canvas.height,
                            pointer.color,
                            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                            config.SPLAT_RADIUS
                        );
                        canvas._lastTouchBroadcast = now;
                    }
                }
            }
        }, { passive: false });
        window.addEventListener('touchend', (e) => {
            TouchGestures.end(e);
            if (pointer.down) {
                // Same fluid-only tail gate as finishLeftStroke (audit note there)
                if (window.splatOutMode !== 'instant' && config.BRUSH_TARGET === 'fluid') {
                    splatUpTime = Date.now();
                    splatOutActive = true;
                    splatTailDist = 0;
                    splatReleaseInMult = getSplatInMult(); // size at release → no jump
                    splatOutX = pointer.x;
                    splatOutY = pointer.y;
                    splatOutDx = pointer.dx;
                    splatOutDy = pointer.dy;
                    splatOutColor = pointer.color.slice();
                }
                pointer.down = false;
                pointer.moved = false;
                if (window.BrushEngine) window.BrushEngine.end(pointer.x, pointer.y);
                archiveCurrentStroke();
                advanceColor();
                // Same deferred advance as finishLeftStroke: flush on full
                // paint idle in 05j, never at release.
                pendingArmAdvance = true;
                if (typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
            }
        });
        window.addEventListener('touchcancel', (e) => {
            TouchGestures.end(e);
            if (pointer.down) {
                pointer.down = false;
                pointer.moved = false;
                if (window.BrushEngine) window.BrushEngine.abort();
                if (typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
            }
        });
