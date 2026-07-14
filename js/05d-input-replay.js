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
        let lastSplatTime = 0; // for brush refresh rate throttle
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
            strokeEvents.push({ t, x, y, dx, dy, color: color.slice(), mult: (typeof animationMultiplier === 'number' ? animationMultiplier : 1), radius: config.SPLAT_RADIUS });
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
        function replayStroke(broadcast = true) {
            var eventsToReplay;
            if (!broadcast && window._activeReplayEvents && window._activeReplayEvents.length) {
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
                // Deactivate performance profile — user is overriding the cap
                if (typeof window.clearActiveProfile === 'function') window.clearActiveProfile();
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
                const elapsed = Date.now() - replayStartTime;
                while (replayIndex < events.length && events[replayIndex].t <= elapsed) {
                    const ev = events[replayIndex++];
                    // Faithful reproduction (2026-07-13): replay uses the brush
                    // size and arm count RECORDED with each event. The old
                    // "use current live settings" behavior meant a stroke
                    // painted small replayed at whatever the slider says now —
                    // and remote strokes replayed at the RECEIVER's brush size.
                    if (typeof window.applyMultiSplatWith === 'function') {
                        window.applyMultiSplatWith(ev.x, ev.y, ev.dx, ev.dy, ev.color,
                            ev.mult || 1, (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS);
                    } else {
                        multiSplat(ev.x, ev.y, ev.dx, ev.dy, ev.color, false);
                    }
                    if (typeof recRecordInteraction === 'function' && recEnabled) {
                        try { recRecordInteraction(ev.x, ev.y, ev.dx, ev.dy, ev.color); } catch(_){}
                    }
                }
                if (replayIndex >= events.length) {
                    // If right button still held, loop replay without rebroadcast
                    if (isRightMouseDown) {
                        replayStroke(false);
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
        canvas.addEventListener('mousedown', (e) => {
            // Right-click replay always works, even when paused
            if (e.button === 2) {
                e.preventDefault();
                isRightMouseDown = true;
                if (pointer.down) {
                    // Left mouse is held — enter pause-only mode.
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
            // Only process left-clicks that actually target the canvas (not click-throughs from UI)
            if (isPaused || e.target !== canvas) return;
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
            // Begin stroke recording and include initial splat
            startStroke(pointer.x, pointer.y);
            pushStrokeEvent(pointer.x, pointer.y, 0, 0, pointer.color);
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
            const inMult = getSplatInMult();
            multiSplatWithRadius(pointer.x, pointer.y, 0, 0, pointer.color, config.SPLAT_RADIUS * inMult);
            if (typeof broadcastSplat === 'function') {
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
        canvas.addEventListener('mousemove', (e) => {
            if (isPaused || isReplayActive) return;
            const coords = getCanvasCoordinates(e);
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            // Notify battery manager of pointer interaction for burst mode
            if (typeof window.batteryHandleInput === 'function') {
                window.batteryHandleInput();
            }
            if (typeof broadcastCursor === 'function') {
                broadcastCursor(coords.x / canvas.width, coords.y / canvas.height);
            }
            if (pointer.down) {
                // Skip zero-movement events (browser fires mousemove on mouseup
                // at the same position — causes visible re-splat artifacts)
                if (pointer.dx * pointer.dx + pointer.dy * pointer.dy < 1.0) return;
                // Brush refresh rate throttle
                var rate = window.brushRefreshRate || 0;
                if (rate > 0) {
                    var now = Date.now();
                    if (now - lastSplatTime < rate) {
                        return; // pointer.moved stays false → no splat in render loop
                    }
                    lastSplatTime = now;
                }
                pointer.moved = true;
                if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                if (typeof broadcastSplat === 'function') {
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
        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                isRightMouseDown = false;
                isReplayActive = false;
                window._activeReplayEvents = null;
                customCursor.style.opacity = '0';
                // "Fast brush" easter egg: if left was held during the right-click pause,
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
                                    // Skip if left mouse released in the meantime
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
                var wasDown = pointer.down;
                if (wasDown && typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
                if (wasDown && window.splatOutMode !== 'instant') {
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
                    archiveCurrentStroke();
                    advanceColor();
                    // Defer arm color advance until splatOut easing finishes
                    // so random/step colors don't change mid-easing
                    if (splatOutActive) {
                        pendingArmAdvance = true;
                    } else {
                        advanceArmColors();
                    }
                }
            }
        });
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        // ── Pointer-state safety net ──
        // The window-level mouseup is normally enough to clear pointer.down, but
        // a few events skip it and would otherwise strand the stroke (so the next
        // click reads as a continuation — the "mouseup/mousedown out of sync"
        // bug): a native drag (dragstart fires dragend, not mouseup), releasing
        // the button outside the window, or the window losing focus mid-press.
        // Force-end any in-progress stroke on all of those so it can never stick.
        function abortPointerStroke() {
            isRightMouseDown = false;
            isReplayActive = false;
            window._activeReplayEvents = null;
            window._pausedPointerState = null;
            if (pointer.down) {
                pointer.down = false;
                pointer.moved = false;
                archiveCurrentStroke();
            }
        }
        window.addEventListener('blur', abortPointerStroke);
        window.addEventListener('dragstart', abortPointerStroke);
        window.addEventListener('pointercancel', abortPointerStroke);
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isPaused) return;
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
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
            const inMult = getSplatInMult();
            multiSplatWithRadius(pointer.x, pointer.y, 0, 0, pointer.color, config.SPLAT_RADIUS * inMult);
            if (typeof broadcastSplat === 'function') {
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
            const touch = e.touches[0];
            const coords = getCanvasCoordinates(touch);
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            // Notify battery manager of pointer interaction for burst mode
            if (typeof window.batteryHandleInput === 'function') {
                window.batteryHandleInput();
            }
            if (pointer.down) {
                // Brush refresh rate throttle (same as mousemove)
                var rate = window.brushRefreshRate || 0;
                if (rate > 0) {
                    var now = Date.now();
                    if (now - lastSplatTime < rate) return;
                    lastSplatTime = now;
                }
                pointer.moved = true;
                if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                if (typeof broadcastSplat === 'function') {
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
        window.addEventListener('touchend', () => {
            if (pointer.down) {
                if (window.splatOutMode !== 'instant') {
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
                archiveCurrentStroke();
                advanceColor();
                if (splatOutActive) {
                    pendingArmAdvance = true;
                } else {
                    advanceArmColors();
                }
                if (typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
            }
        });
        window.addEventListener('touchcancel', () => {
            if (pointer.down) {
                pointer.down = false;
                pointer.moved = false;
                if (typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
            }
        });
