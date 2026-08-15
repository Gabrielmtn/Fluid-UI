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
        let replayStartTime = 0;
        let replayIndex = 0;
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
        // Distance-based envelope: the brush grows from SPLAT_START_FLOOR to full
        // size over splatInDist of cursor travel (speed-independent), and on
        // release trails off, tapering over splatOutDist. Distances are fractions
        // of the canvas width; accumulated in the update loop (05j).
        let splatStrokeDist = 0;   // travel since press (drives splat-in)
        let splatTailDist = 0;     // travel of the post-release tail (drives splat-out)
        let splatReleaseInMult = 1.0; // brush size fraction at release (so splat-out
                                      // tapers from the current size, not a jump to full)
        const SPLAT_START_FLOOR = 0.12; // initial brush fraction at the very start
        window.splatInMode = window.splatInMode || 'instant';
        window.splatOutMode = window.splatOutMode || 'instant';
        // Ramp distances (fraction of canvas width). 0 ⇒ behaves like instant.
        if (typeof window.splatInDist !== 'number') window.splatInDist = 0.15;
        if (typeof window.splatOutDist !== 'number') window.splatOutDist = 0.15;
        function smoothstep(t) {
            return t * t * (3.0 - 2.0 * t);
        }
        function getSplatInMult() {
            if (window.splatInMode === 'instant') return 1.0;
            const D = window.splatInDist || 0;
            if (D <= 0.0001) return 1.0;
            const t = Math.min(splatStrokeDist / D, 1.0);
            const shape = (window.splatInMode === 'linear') ? t : smoothstep(t);
            return SPLAT_START_FLOOR + (1.0 - SPLAT_START_FLOOR) * shape;
        }
        function getSplatOutMult() {
            if (window.splatOutMode === 'instant') return 0.0;
            const D = window.splatOutDist || 0;
            if (D <= 0.0001) return 0.0;
            const t = Math.min(splatTailDist / D, 1.0);
            if (t >= 1.0) return 0.0;
            const remaining = 1.0 - t;
            return (window.splatOutMode === 'linear') ? remaining : smoothstep(remaining);
        }
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
            // Store the EFFECTIVE painted size (splat-in ramp / pressure), not the
            // base — so stroke replay (local AND multiplayer 2.1) reproduces the
            // actual brush size. The paint path publishes it to __lastPaintRadius.
            const effR = (typeof window.__lastPaintRadius === 'number' && window.__lastPaintRadius > 0)
                ? window.__lastPaintRadius : config.SPLAT_RADIUS;
            strokeEvents.push({ t, x, y, dx, dy, color: color.slice(), mult: (typeof animationMultiplier === 'number' ? animationMultiplier : 1), radius: effR });
        }
        function deepCopyEvent(ev) {
            return { t: ev.t, x: ev.x, y: ev.y, dx: ev.dx, dy: ev.dy, color: ev.color.slice(), mult: ev.mult, radius: ev.radius };
        }
        function buildTimeReplayEvents() {
            var period = (window.replayTimePeriod || 5) * 1000;
            // Collect all strokes: history + current (if not yet archived)
            var allStrokes = [];
            for (var i = 0; i < strokeHistory.length; i++) {
                allStrokes.push(strokeHistory[i].events);
            }
            if (!strokeArchived && strokeEvents.length > 0) {
                allStrokes.push(strokeEvents);
            }
            if (allStrokes.length === 0) return [];
            // Each stroke's duration is its last event's t value (ms since stroke start).
            // Work backwards from the newest stroke, accumulating painting time
            // until we fill the budget. Gaps between strokes are irrelevant.
            var budget = period;
            var startIdx = allStrokes.length; // will walk backwards
            var startEventOffset = 0;        // partial-stroke trim point
            for (var s = allStrokes.length - 1; s >= 0 && budget > 0; s--) {
                var evs = allStrokes[s];
                if (evs.length === 0) continue;
                var dur = evs[evs.length - 1].t; // stroke painting duration
                if (dur <= budget) {
                    // Whole stroke fits
                    budget -= dur;
                    startIdx = s;
                    startEventOffset = 0;
                } else {
                    // Partial fit — trim the beginning of this stroke
                    var trimPoint = evs[evs.length - 1].t - budget;
                    startIdx = s;
                    startEventOffset = trimPoint;
                    budget = 0;
                }
            }
            // Stitch selected strokes back-to-back, collapsing all gaps
            var allEvents = [];
            var cursor = 0; // running playback time
            for (var si = startIdx; si < allStrokes.length; si++) {
                var evs2 = allStrokes[si];
                for (var j = 0; j < evs2.length; j++) {
                    var ev = evs2[j];
                    // Skip events before the trim point in the first partial stroke
                    if (si === startIdx && ev.t < startEventOffset) continue;
                    var localT = ev.t - (si === startIdx ? startEventOffset : 0);
                    allEvents.push({
                        t: cursor + localT,
                        x: ev.x, y: ev.y, dx: ev.dx, dy: ev.dy,
                        color: ev.color.slice(), mult: ev.mult, radius: ev.radius
                    });
                }
                // Advance cursor by this stroke's contributed duration
                if (evs2.length > 0) {
                    var strokeDur = evs2[evs2.length - 1].t - (si === startIdx ? startEventOffset : 0);
                    cursor += strokeDur;
                }
            }
            return allEvents;
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
            // Store the active replay events for processReplay
            window._activeReplayEvents = eventsToReplay;
            replayIndex = 0;
            replayStartTime = Date.now();
            isReplayActive = true;
            // Broadcast full stroke to multiplayer
            if (broadcast && typeof broadcastReplayStroke === 'function') {
                const norm = eventsToReplay.map(ev => ({
                    t: ev.t,
                    x: ev.x / canvas.width,
                    y: ev.y / canvas.height,
                    dx: ev.dx / canvas.width,
                    dy: ev.dy / canvas.height,
                    color: ev.color,
                    mult: ev.mult,
                    radius: ev.radius
                }));
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
        function processReplay() {
            if (!isReplayActive) return;
            var events = window._activeReplayEvents;
            if (!events || !events.length) { isReplayActive = false; return; }
            try {
                var speed = (typeof window.replaySpeed === 'number') ? window.replaySpeed : 1;
                const elapsed = (Date.now() - replayStartTime) * speed;
                while (replayIndex < events.length && events[replayIndex].t <= elapsed) {
                    const ev = events[replayIndex++];
                    // Faithful reproduction (2026-07-13): replay uses the brush
                    // size and arm count RECORDED with each event. The old
                    // "use current live settings" behavior meant a stroke
                    // painted small replayed at whatever the slider says now —
                    // and remote strokes replayed at the RECEIVER's brush size.
                    // 1.1 Live colors (opt-in): repaint the stroke with the
                    // CURRENT brush color instead of the recorded one — the
                    // faithful-replay default stays (recorded color, arm modes
                    // still resolve on top either way).
                    var repCol = (window.replayLiveColors && window.pointer && window.pointer.color)
                        ? window.pointer.color.slice() : ev.color;
                    if (typeof window.applyMultiSplatWith === 'function') {
                        window.applyMultiSplatWith(ev.x, ev.y, ev.dx, ev.dy, repCol,
                            ev.mult || 1, (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS);
                    } else {
                        multiSplat(ev.x, ev.y, ev.dx, ev.dy, repCol, false);
                    }
                    if (typeof recRecordInteraction === 'function' && recEnabled) {
                        try { recRecordInteraction(ev.x, ev.y, ev.dx, ev.dy, ev.color); } catch(_){}
                    }
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
                radius: (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS
            }));
            if (!remoteEvents.length) return;
            window._activeReplayEvents = remoteEvents;
            replayIndex = 0;
            replayStartTime = Date.now();
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
            // D2 routing: sketch strokes are plain raster paint — no fluid
            // replay events, no recording timelines, no multiplayer
            // broadcast (local-only until D7's unified schema)
            const _sketchTarget = config.BRUSH_TARGET === 'sketch';
            if (_sketchTarget) {
                if (typeof window.__sketchStamp === 'function') window.__sketchStamp(coords.x, coords.y, 1);
            } else {
                // Begin stroke recording and include the initial splat.
                startStroke(pointer.x, pointer.y);
                const _pcol = applyPaintFlow(pointer.color, pressFlowMul());
                pushStrokeEvent(pointer.x, pointer.y, 0, 0, _pcol);
                const inMult = getSplatInMult();
                window.__lastPaintRadius = config.SPLAT_RADIUS * inMult; // recording captures the true painted size
                if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, _pcol);
                multiSplatWithRadius(pointer.x, pointer.y, 0, 0, _pcol, config.SPLAT_RADIUS * inMult);
                window.__splatFlow = 1; // reset so the engine/tail/programmatic splats stay full-flow
            }
            // D1 brush engine: stroke movement is emitted as spaced dabs by
            // the engine (fed from the pointermove listener below, drained in
            // 05j). The immediate press stamp above stays for latency.
            if (window.BrushEngine) window.BrushEngine.begin(coords.x, coords.y);
            if (!_sketchTarget && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
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
            if (wasDown && window.splatOutMode !== 'instant' && config.BRUSH_TARGET !== 'sketch') {
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
            if (window.__paintPointerId != null) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                window.__paintPointerId = null;
            }
            if (e.button === 2) {
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
                finishLeftStroke();
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
            if (window.__paintPointerId != null) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
                window.__paintPointerId = null;
            }
            isRightMouseDown = false;
            isReplayActive = false;
            window._activeReplayEvents = null;
            window._pausedPointerState = null;
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
            const _sketchTargetT = config.BRUSH_TARGET === 'sketch';
            if (_sketchTargetT) {
                if (typeof window.__sketchStamp === 'function') window.__sketchStamp(coords.x, coords.y, 1);
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
            if (!_sketchTargetT && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
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
                if (window.splatOutMode !== 'instant' && config.BRUSH_TARGET !== 'sketch') {
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
