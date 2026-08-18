// ═══════════════════════════════════════════════════════════════════
// js/05j-update-loop.js — part 10/14 of former 05-fluid-sim.js (lines 3120–3489)
// LOAD ORDER: after 05i-sim-stats.js, before 05k-layers-render.js
// PROVIDES: update() main loop (physics passes, post-FX, display, stats, governor feed)
// REQUIRES: everything above; renderLayers NOT needed at load
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Decay batching: half-float dye/velocity textures round a multiply
        // back to the same value when the per-frame decrement is below ~0.05%
        // of the stored value (fp16 has a 10-bit mantissa). At tiny timesteps
        // (uncapped Electron framerates, low timeScale, near-1.0 dissipation)
        // every decay mechanism falls below that and the fade freezes with
        // patchy residue. Fix: accumulate decay time on the CPU and apply it
        // in one batched step (uniform decayDt) only when the resulting
        // decrement is comfortably above fp16 rounding (≥0.2%); skip frames
        // pass decayDt=0 which the shader treats as an exact no-op.
        // Growth (dissipation ≥ 1.0) keeps per-frame semantics — it has no
        // fade-to-zero path and batching it would change preset feel.
        let dyeDecayAccum = 0, velDecayAccum = 0;
        let lastDyeDiss = -1, lastVelDiss = -1;
        // P15-1 wetness drying accumulator (batched like the decay debt below).
        let wetDryAccum = 0, lastWetDrying = -1;
        // Reusable upload buffer for the attractor forcing field (6.2):
        // 12 attractors × vec4, zero-alloc per frame.
        const attractorFieldScratch = new Float32Array(48);
        // Resize settle deadline for the debounced FBO rebuild (0 = none pending)
        let _fboSettleAtMs = 0;
        // Last frame's wrapper size — the settle deadline re-arms only when
        // THIS moves (see below), not merely while buffer≠wrapper persists
        let _lastTargetW = 0, _lastTargetH = 0;
        function computeDecayDt(dissipation, accum, dt) {
            if (dissipation >= 1.0) return { decayDt: dt, accum: 0 };
            accum = Math.min(accum + dt, 1.0);
            const cand = Math.pow(dissipation, accum * 60.0);
            if (1.0 - cand >= 0.002 || accum >= 1.0) return { decayDt: accum, accum: 0 };
            return { decayDt: 0, accum };
        }
        // P15-1 wetness half-life drying, batched the same way: a per-frame
        // pow(0.5, dt/halfLife) multiply rounds back to 1.0 in fp16 at tiny dt,
        // so accumulate the debt and hand over a real multiplier only once it
        // clears the ~0.002 fp16 threshold. dryMul==1.0 is an exact no-op frame.
        function computeDryMul(halfLifeSec, accum, dt) {
            if (!(halfLifeSec > 0)) return { dryMul: 1.0, accum: 0 };
            accum = Math.min(accum + dt, 1.0);
            const cand = Math.pow(0.5, accum / halfLifeSec);
            if (1.0 - cand >= 0.002 || accum >= 1.0) return { dryMul: cand, accum: 0 };
            return { dryMul: 1.0, accum };
        }
        // The desktop build holds its window invisible until one frame has
        // actually been drawn — that is the only proof the context, the
        // programs and every framebuffer are real (js/00a-boot.js).
        let _firstFrameDrawn = false;
        function update() {
            const nowMs = performance.now();
            const cpuStart = nowMs;
            // Display Hz: Electron API detects instantly; rAF fallback runs here if needed
            detectDisplayHz(nowMs);
            // FPS Cap: skip frame if interval hasn't elapsed (with epsilon tolerance)
            const cap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 0;
            if (cap > 0) {
                const desiredMs = 1000 / cap;
                if (nowMs - lastDrawTimeMs < desiredMs - 0.5) {
                    requestAnimationFrame(update);
                    return;
                }
                // Drift-aligned advance: step by interval instead of snapping to now
                lastDrawTimeMs += desiredMs;
                // If we fell too far behind (tab hidden, etc.), snap to now
                if (nowMs - lastDrawTimeMs > desiredMs) {
                    lastDrawTimeMs = nowMs;
                }
            } else {
                lastDrawTimeMs = nowMs;
            }
            // COS Oscillator: advance all active parameter oscillators
            if (window.cosOscillator) window.cosOscillator.tick(nowMs / 1000);
            // Physics timestep: Cap at 16ms to prevent instability at low FPS
            // Without this cap, 30 FPS = 33ms timestep = simulation explodes!
            const wallDt = Math.min((nowMs - lastTime) / 1000, 1.0);
            lastTime = nowMs;
            // ── Sub-stepping (2026-08-17) ───────────────────────────────────
            // That clamp buys stability by letting the SIM fall behind the wall
            // clock: on a 30Hz panel the fluid advanced 16ms per 33ms frame, so
            // it ran at 48% speed and updated 30x/s. That slow motion is most of
            // what "janky on a low-fps monitor" actually is, and no amount of
            // dab-timing work can touch it — the fluid itself is behind.
            //
            // N shorter steps cover the whole wall interval at N times the
            // physics cost, so the GATE matters more than the mechanism: engage
            // only while we are keeping up with the display — a vsync-limited
            // low-refresh panel, which has headroom by definition — and never
            // when we are at 30fps because the machine is struggling, where
            // tripling physics is the last thing that would help.
            //
            // Reading measured fps against the panel makes this self-limiting:
            // if sub-stepping itself costs us the refresh rate, the condition
            // goes false on the very next frame and we fall back. The 20ms floor
            // keeps 60Hz (16.7ms frames) on exactly one step, bit-for-bit as
            // before — only genuinely sub-50Hz displays ever sub-step.
            let subSteps = 1;
            if (config.SIM_SUBSTEP && wallDt > 0.020) {
                const _panelHz = cap > 0 ? Math.min(cap, displayHz) : displayHz;
                const _st = window.__stats;
                if (_panelHz > 0 && _st && _st.fps >= 0.85 * _panelHz) {
                    subSteps = Math.max(1, Math.min(
                        (config.SIM_SUBSTEP_MAX | 0) || 4,
                        Math.ceil(wallDt / 0.016)));
                }
            }
            const rawDt = Math.min(wallDt / subSteps, 0.016);
            // Time scale: dilate physics without changing equations.
            // dt is ONE STEP; frameDt is everything this frame simulates.
            const dt = rawDt * (window.timeScale || 1.0);
            const frameDt = dt * subSteps;
            // ── The sim clock (2026-08-16) ──────────────────────────────────
            // dt is the ONE authority on how much simulated time this frame
            // advanced: it already carries both the 16ms stability clamp and
            // the Time slider. Every dye source has to pace itself off THIS,
            // not off Date.now(), because a splat is an IMPULSE, not a rate —
            // splat() takes no dt, it deposits a fixed amount of dye per
            // event. Fire those events on the wall clock while the fluid runs
            // on a dilated clock and you inject 1/timeScale times as much dye
            // per simulated second, into a field that has advected 1/timeScale
            // as far: the deposits stack on top of each other instead of being
            // carried away, and the stroke saturates into a flat slab. That is
            // the over-saturated middle at low Time, and (via the 16ms clamp)
            // the same thing a sub-60fps frame does even at Time 1.
            // Everything this frame simulates, sub-steps included — this is what
            // dye sources pace themselves against, not one step's worth.
            window.__simDtMs = frameDt * 1000;
            // Monotonic simulated-time clock. The brush engine's slow-speed dab
            // floor (05d0) needs "how much sim time has passed", and it runs on
            // the input-sample callback where no frame timing is available.
            window.__simTimeMs = (window.__simTimeMs || 0) + frameDt * 1000;
            // Wall-clock deposition credit, for the sources that deposit once
            // per FRAME instead of once per unit of travel (constant-flow
            // splat mode, the splat-out tail). Those are frame-rate deposition
            // rates, so they get metered at the Time-scaled frame rate: one
            // credit per frame at Time ≥ 1 — bit-identical to the old
            // unconditional emit, existing frame-rate quirks included — and
            // one every 1/timeScale frames below it. The distance-parameterized
            // walker needs none of this; it is metered in 05d0 instead, by
            // spreading spacing, because its rate is set by the hand not the
            // frame. Leftover is clamped so Time > 1 can't run the debt away.
            let _depDebt = (window.__depositDebt || 0) + (window.timeScale || 1.0);
            const depositCredit = _depDebt >= 1.0;
            if (depositCredit) _depDebt = Math.min(_depDebt - 1.0, 1.0);
            window.__depositDebt = _depDebt;
            if (window.kAnimateRot && window.kSpinSpeed) {
                window.kAngle = (window.kAngle || 0) + frameDt * window.kSpinSpeed * Math.PI / 180;
            }
            const targetWidth = canvasWrapper.clientWidth;
            const targetHeight = canvasWrapper.clientHeight;
            const canvasSizeChanged = canvas.width !== targetWidth || canvas.height !== targetHeight;
            if (canvasSizeChanged) {
                // Track the wrapper VISUALLY every frame (cheap style writes;
                // explicit px matches updateCanvasSize — CSS '100%' causes
                // compositor differences in Electron's transparent window mode)…
                canvas.style.width = targetWidth + 'px';
                canvas.style.height = targetHeight + 'px';
                // …but DEFER the drawing-buffer realloc to the settle below,
                // alongside the FBO rebuild. Assigning canvas.width reallocates
                // and clears the buffer — doing that every frame of a UI
                // collapse/expand animation was a per-frame full-res realloc on
                // top of the layout work, and the dominant source of resize
                // jank. Until settle, the display blit fills the OLD buffer and
                // CSS stretches it — same tradeoff the FBO debounce already
                // accepted (comment below).
                // Debounce the FBO rebuild until the size stops changing: UI
                // collapse/expand animations resize the wrapper EVERY frame, and
                // rebuilding 17 FBOs per frame — now including gl.delete* of
                // textures the GPU used one frame ago (leak fix), which forces a
                // driver sync — stalled the whole transition. The display pass
                // just stretches the old-resolution FBOs until the settle fires.
                //
                // Re-arm the deadline ONLY while the wrapper itself is moving.
                // The old code re-armed whenever buffer≠wrapper — a condition
                // that stays true until the settle fires — so the deadline slid
                // forward every frame and the tracker could never heal on its
                // own; it only worked when an external needsFramebufferReinit
                // (handle-drag pointerup, governor level change) rescued it.
                // With the governor off, a monitor move / OS-driven wrapper
                // reflow left the sim permanently smaller than the wrapper
                // (the 2026-07-09 "init size" bug, second act).
                if (targetWidth !== _lastTargetW || targetHeight !== _lastTargetH || !_fboSettleAtMs) {
                    _fboSettleAtMs = nowMs + 180;
                }
            }
            _lastTargetW = targetWidth;
            _lastTargetH = targetHeight;
            if (window.needsFramebufferReinit || (_fboSettleAtMs && nowMs >= _fboSettleAtMs)) {
                _fboSettleAtMs = 0;
                // One buffer realloc per resize gesture, just before the FBO
                // rebuild (governor-only reinits arrive with unchanged dims and
                // must not clear the canvas — see canvasSizeChanged note above)
                const settleW = canvasWrapper.clientWidth;
                const settleH = canvasWrapper.clientHeight;
                if (canvas.width !== settleW || canvas.height !== settleH) {
                    canvas.width = settleW;
                    canvas.height = settleH;
                    canvas.style.width = settleW + 'px';
                    canvas.style.height = settleH + 'px';
                }
                initFramebuffers();
                exposeSimStats(); // Update stats after resize
                window.needsFramebufferReinit = false;
                // Re-upload collision obstacle data to the freshly created FBO
                if (window.collisionLayers && window.collisionLayers.enabled) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
            }
            // Process replay even when paused so right-click replay always works
            processReplay();
            if (!isPaused) {
                // Constant-flow bookkeeping: the engine branch below stops
                // running once a stroke's queue drains, so a reset inside it
                // never fires between strokes — a stale __contFlowLast would
                // then make the FIRST frame of the next click compute dx from
                // the previous stroke's position (a phantom velocity kick).
                // Clear it any frame the pointer is up.
                if (!pointer.down) { window.__contFlowLast = null; window.__contFlowCredit = 0; }
                // Dab budget for this frame, in dabs — BRUSH_DAB_BUDGET is per
                // SIMULATED second, so a 33ms frame retires twice what a 16ms one
                // does. The old flat 64/frame was itself a frame-rate dependence:
                // at 30fps a fast dense stroke measured 54 of 64 used, ~10 dabs
                // from silently thinning the line. 05d0 reads this for its
                // coalescing bump so both ends agree.
                const _dabBudget = Math.max(8, Math.ceil(
                    ((typeof config.BRUSH_DAB_BUDGET === 'number' ? config.BRUSH_DAB_BUDGET : 4000)) * frameDt));
                window.__dabDrainBudget = _dabBudget;
                if (window.BrushEngine && (window.BrushEngine.isActive() || window.BrushEngine.pending()) && !isReplayActive) {
                    // D1 brush engine: drain this frame's dab train (distance-
                    // parameterized spacing + stabilizer + gap-fill, built in
                    // 05d0). Replaces the legacy one-splat-per-frame path —
                    // a fast flick drains many dabs here instead of leaving
                    // one dab per frame. Dab velocity already carries the
                    // momentum-per-distance rule, so total injected energy
                    // matches the legacy feel.
                    let _dabs = window.BrushEngine.drain(_dabBudget);
                    // Constant-flow splat mode: while the pointer is held on the
                    // fluid target, ignore the spacing walker's train and run the
                    // hose off a CLOCK — paint keeps flowing while standing still
                    // (the classic hose feel). Sketch/mask targets keep the
                    // spaced train.
                    if (config.BRUSH_CONTINUOUS && config.BRUSH_TARGET === 'fluid') {
                        // ── The dab clock (2026-08-17) ──────────────────────
                        // This used to emit exactly one dab per frame, which made
                        // the deposition rate literally the frame rate: measured
                        // 30 / 60 / 144 dabs per wall second on 30 / 60 / 144Hz.
                        // Above 60fps nothing compensates that (the 16ms clamp is
                        // not active up there), so a 144Hz panel laid 2.3x the dye
                        // per SIMULATED second that a 60Hz one did — the same
                        // gesture, a different painting, decided by the monitor.
                        //
                        // Now: accrue one dab per BRUSH_DAB_INTERVAL_MS of simulated time and
                        // emit whole ones, carrying the fraction. Each dab is
                        // normalized to REF/RATE of the reference dye (05d's
                        // __normalizePaintFlow), so the RATE buys smoothness and
                        // the total deposit per second stays put. With REF = 1 dab
                        // per 16ms — exactly what one-per-frame delivered at 60fps
                        // — a 60Hz display is unchanged, 144Hz stops over-painting,
                        // and a sub-stepped 30Hz panel now matches both.
                        //
                        // frameDt (not the wall delta) keeps the Time slider's
                        // metering intact: a dab is an impulse, so pacing it on
                        // anything but the sim clock deposits 1/timeScale times too
                        // much dye into a field that advected 1/timeScale as far.
                        if (pointer.down && window.BrushEngine.isActive()) {
                            _dabs = [];
                            // Interval -> rate. The control is an interval so its slider reads
                            // like Spacing (minimum = finest); the clock below wants a rate.
                            const _ivl = (typeof config.BRUSH_DAB_INTERVAL_MS === 'number' && config.BRUSH_DAB_INTERVAL_MS > 0)
                                ? config.BRUSH_DAB_INTERVAL_MS : 8;
                            const _rate = 1000 / _ivl;
                            const _rateRef = (typeof config.BRUSH_DAB_RATE_REF === 'number' && config.BRUSH_DAB_RATE_REF > 0)
                                ? config.BRUSH_DAB_RATE_REF : 62.5;
                            // Share of the reference dye each dab carries. Clamped
                            // to 1 so a rate BELOW the reference can never boost a
                            // dab past full flow — it just deposits less, as it
                            // should.
                            const _k = Math.min(1, _rateRef / _rate);
                            let _credit = (window.__contFlowCredit || 0) + _rate * frameDt;
                            let _n = Math.floor(_credit);
                            if (_n > _dabBudget) _n = _dabBudget;   // spike guard
                            window.__contFlowCredit = _credit - _n;
                            if (_n > 0) {
                                const cx = pointer.x, cy = pointer.y;
                                const last = window.__contFlowLast;
                                const px = last ? last.x : cx, py = last ? last.y : cy;
                                // Momentum per unit of travel is preserved: the
                                // frame's whole delta is split across the n dabs,
                                // so n x (delta/n) is the single dab's old kick.
                                const cdx = (cx - px) * 10 / _n, cdy = (cy - py) * 10 / _n;
                                // Lay them ALONG the path travelled this frame
                                // rather than stacking every one at the live
                                // pointer. At 30fps that is the difference between
                                // a bead every 40.8px and a continuous line — the
                                // single-point version simply could not draw the
                                // interior of a fast low-fps segment.
                                const _interp = config.BRUSH_DAB_INTERP !== false;
                                for (let ci = 1; ci <= _n; ci++) {
                                    const t = _interp ? (ci / _n) : 1;
                                    _dabs.push({
                                        x: px + (cx - px) * t,
                                        y: py + (cy - py) * t,
                                        dx: cdx, dy: cdy, p: 1, k: _k
                                    });
                                }
                                window.__contFlowLast = { x: cx, y: cy };
                                // Recording taps raw pointer events, which don't fire
                                // while stationary — capture the hold here. Frames
                                // that moved ≥0.1px were already recorded by the
                                // pointermove handler (same gate as 05d's).
                                if (recEnabled && typeof recRecordInteraction === 'function'
                                    && ((cx - px) * (cx - px) + (cy - py) * (cy - py)) < 0.01) {
                                    recRecordInteraction(cx, cy, 0, 0, pointer.color);
                                }
                            }
                            // A frame that emits nothing deliberately leaves
                            // __contFlowLast alone, so the next dab's dx/dy spans
                            // the whole skipped interval and momentum per unit of
                            // travel is unchanged. (The release branch below owns
                            // clearing it; doing it here would zero the carried
                            // motion on every fractional frame.)
                        } else {
                            // Released (or between strokes): drop any walker
                            // leftovers so no spaced tail paints after the hold.
                            window.__contFlowLast = null;
                            window.__contFlowCredit = 0;
                            _dabs = [];
                        }
                    } else {
                        window.__contFlowLast = null;
                        window.__contFlowCredit = 0;
                        // Fill in the RAMP REGION. The spacing walker lays a dab
                        // every ~0.35 brush diameters, which at default size is
                        // ~73 canvas px — so the whole splat-in ramp is spanned by
                        // two or three dabs and arrives as separate blobs that
                        // step in size and brightness. That is the "stuttery on
                        // small movements" report: a movement shorter than one
                        // spacing paints the press stamp and nothing else at all.
                        //
                        // While the ramp is still climbing, top up any frame the
                        // walker left empty with one dab at the live pointer, so
                        // the entrance is continuous the way constant-flow is.
                        // Once the ramp tops out the walker owns the stroke again
                        // and normal spacing (and its texture) is unchanged.
                        //
                        // Distance modes require actual movement: without that a
                        // stationary press would pump dabs forever at a ramp value
                        // that can never advance. Time mode is the opposite — a
                        // still press is exactly the case it exists for.
                        // depositCredit: the top-up is one dab per empty FRAME,
                        // so it is metered on the sim clock like the hose above.
                        if (pointer.down && !_dabs.length && depositCredit &&
                            window.splatInMode && window.splatInMode !== 'instant' &&
                            config.BRUSH_TARGET === 'fluid' &&
                            window.BrushEngine && window.BrushEngine.isActive() &&
                            getSplatInMult() < 0.999) {
                            // Travel comes from the engine, which resets it at
                            // begin(). Compare against splatStrokeDist — the ramp's
                            // own progress, also reset per stroke — so "has the
                            // pointer moved past where the ramp is?" needs no
                            // extra state of its own. A private high-water mark
                            // here would survive into the next stroke and suppress
                            // its opening frames, which is exactly the bug this
                            // shape avoids.
                            var _bt = (window.BrushEngine.travel ? window.BrushEngine.travel() : 0) /
                                      Math.max(1, canvas.width);
                            // A distance ramp advances only with movement; a time
                            // ramp is exactly the stationary case, so it always
                            // fills. Zero velocity either way: these are the gaps
                            // BETWEEN walker dabs, and the walker already carries
                            // the stroke's momentum.
                            if (window.splatInMode === 'time' || _bt > splatStrokeDist + 0.0005) {
                                _dabs = [{ x: pointer.x, y: pointer.y, dx: 0, dy: 0, p: 1,
                                           travel: _bt * Math.max(1, canvas.width) }];
                            }
                        }
                    }
                    if (_dabs.length) window.__lastPaintMs = nowMs;
                    const _toSketch = config.BRUSH_TARGET === 'sketch';
                    const _toMask = config.BRUSH_TARGET === 'mask';
                    for (let di = 0; di < _dabs.length; di++) {
                        const d = _dabs[di];
                        if (_toSketch) {
                            // D2 raster route: plain persistent paint — no
                            // ramps, no arms, no fluid replay/broadcast
                            // (sketch strokes are local-only until D7)
                            if (typeof window.__sketchStamp === 'function') window.__sketchStamp(d.x, d.y, d.p);
                            continue;
                        }
                        if (_toMask) {
                            // D3 mask route: paint coverage into the active
                            // Mask object (shown as the red overlay film)
                            if (typeof window.__maskStamp === 'function') window.__maskStamp(d.x, d.y, d.p);
                            continue;
                        }
                        // Splat-in ramp progress. Prefer the dab's OWN cumulative
                        // path length (05d0 stamps it): the old line derived it
                        // from |velocity|, which the walker sets to exactly
                        // 10 x spacing, so it advanced one fixed step per dab no
                        // matter how far the pointer actually moved — a dab
                        // counter, not a distance. At default spacing that gave
                        // the entire ramp 2-3 samples, which is what read as
                        // stepped/stuttery (and, since the ramp also drives dye,
                        // as 2-3 brightness bands). Synthesized dabs from the
                        // constant-flow and ramp-catchup branches carry no travel,
                        // so they keep the accumulator path with their real
                        // per-frame delta.
                        if (typeof d.travel === 'number') {
                            splatStrokeDist = d.travel / Math.max(1, canvas.width);
                        } else {
                            splatStrokeDist += Math.hypot(d.dx, d.dy) / 10 / Math.max(1, canvas.width);
                        }
                        const inMult = getSplatInMult();
                        // Flow = the Flow slider, scaling deposited dye, baked into
                        // the recorded color so stroke replay stays faithful.
                        const flowMul = (typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1;
                        // Flow routing (shared with the press stamp via
                        // __applyPaintFlow, 05d): Gate scales the convergence
                        // (gateFlow) with the colour kept TRUE; additive bakes flow
                        // into the colour value. Keeping press + drag on one helper
                        // is what stops splat-one and the drag from diverging.
                        // The splat-in ramp scales dye as well as radius (05d
                        // __splatInFlowMul): the shader's centre deposit is
                        // radius-independent, so a size-only ramp still stamped
                        // full-strength colour on the first dab.
                        const inFlow = window.__splatInFlowMul ? window.__splatInFlowMul() : 1;
                        // Sampling-density normalization (2026-08-17). d.k is this
                        // dab's share of the reference dye — spacing/REF from the
                        // walker, RATE_REF/RATE from the hose. Applied to the whole
                        // flow product so the ramp rides it too, and applied HERE
                        // (not at emit) because only this site knows whether Gate
                        // or additive is live, and the exact compensation differs:
                        // additive is linear, Gate is a convergence. Dabs with no
                        // k (tail, ramp top-up, replay) pass through untouched.
                        const col = window.__applyPaintFlow(pointer.color,
                            window.__normalizePaintFlow
                                ? window.__normalizePaintFlow(flowMul * inFlow, d.k)
                                : flowMul * inFlow);
                        // Publish the true painted radius so recording captures the
                        // actual (splat-in ramped) brush size, not the base.
                        window.__lastPaintRadius = config.SPLAT_RADIUS * inMult;
                        multiSplatWithRadius(d.x, d.y, d.dx, d.dy, col, window.__lastPaintRadius);
                        window.__splatFlow = 1; // reset so programmatic/press splats stay full-flow
                        pushStrokeEvent(d.x, d.y, d.dx, d.dy, col);
                        // 1.3 parity: queue THIS dab (own velocity, own ramped
                        // radius) for peers instead of letting them reconstruct
                        // the stroke from one sampled splat per 33ms.
                        if (typeof window.queueDab === 'function') {
                            window.__mpLastDabColor = col;
                            window.queueDab(d.x / canvas.width, d.y / canvas.height, d.dx, d.dy, window.__lastPaintRadius);
                        }
                    }
                    if (_dabs.length && typeof window.flushDabs === 'function') {
                        window.flushDabs(window.__mpLastDabColor,
                            (typeof animationMultiplier === 'number' ? animationMultiplier : 1), false);
                    }
                    pointer.moved = false;
                } else if (pointer.moved && pointer.down && !isReplayActive) {
                    // Legacy path (engine not loaded): one splat per frame
                    window.__lastPaintMs = nowMs; // governor: defer res-tier recovery while strokes are recent
                    // Accumulate cursor travel (fraction of canvas width) so the
                    // splat-in ramp is distance-based / speed-independent.
                    splatStrokeDist += Math.hypot(pointer.dx, pointer.dy) / 10 / Math.max(1, canvas.width);
                    const inMult = getSplatInMult();
                    const savedR = config.SPLAT_RADIUS;
                    config.SPLAT_RADIUS = savedR * inMult;
                    window.__lastPaintRadius = savedR * inMult; // recording captures the true painted size
                    multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color, false);
                    config.SPLAT_RADIUS = savedR;
                    pushStrokeEvent(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                    pointer.moved = false;
                }
                // D6: close the sketch-undo stroke boundary once the engine is
                // fully idle (no active stroke, no queued dabs) — the next
                // sketch dab then opens a fresh undo snapshot.
                if (window.BrushEngine && !window.BrushEngine.isActive() && !window.BrushEngine.pending()
                    && typeof window.__sketchStrokeEnd === 'function') {
                    window.__sketchStrokeEnd();
                }
                // Arm-color advance deferred from stroke end (05d): flush only
                // once EVERYTHING has stopped painting — no splat-out tail AND
                // no queued stabilizer catch-up dabs. Advancing any earlier
                // painted the stroke's late-draining dabs in next-stroke
                // colors while arm 0 still held the old pointer color
                // (the mixed-color flash at stroke end).
                if (pendingArmAdvance && !splatOutActive &&
                    (!window.BrushEngine ||
                        (!window.BrushEngine.isActive() && !window.BrushEngine.pending()))) {
                    advanceArmColors();
                    pendingArmAdvance = false;
                }
                // Splat-out: a trailing tail along the release velocity, tapering
                // in size over splatOutDist of travel. Ends when the size taper
                // completes OR the velocity has effectively died (so it can never
                // stall splatting at a fixed point).
                //
                // The tail is a per-FRAME process — one dab, one position step,
                // one velocity decay per frame — so it rides depositCredit like
                // the constant-flow hose: unchanged at Time ≥ 1, and at Time
                // 0.25 it advances one frame in four. Uncredited frames freeze
                // it entirely (position, decay, taper and the termination test
                // together), so the tail keeps its exact shape and simply takes
                // four times as long to lay down — instead of stamping its whole
                // length into a fluid that has barely moved.
                if (splatOutActive && depositCredit) {
                    const outMult = getSplatOutMult();
                    const outVel2 = splatOutDx * splatOutDx + splatOutDy * splatOutDy;
                    if (outMult <= 0.001 || outVel2 < 0.0002) {
                        // Arm-color advance no longer flushes here: the tail
                        // can die while stabilizer dabs still drain. The
                        // full-idle gate above owns the flush.
                        splatOutActive = false;
                        // Wire flush: the tail queues dabs AFTER
                        // broadcastPointerUp already force-flushed, so its
                        // final sub-interval dabs would sit in the queue until
                        // the NEXT stroke pushed them — measured as a stray dab
                        // from the previous stroke landing out of order at the
                        // start of the next one. End of tail = end of stroke.
                        if (typeof window.flushDabs === 'function') {
                            window.flushDabs(window.__mpLastDabColor,
                                (typeof animationMultiplier === 'number' ? animationMultiplier : 1), true);
                        }
                    } else {
                        // Tail dye honors the Flow slider like the stroke it ends
                        const tailFlow = (typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1;
                        const tailCol = tailFlow === 1 ? splatOutColor
                            : [splatOutColor[0] * tailFlow, splatOutColor[1] * tailFlow, splatOutColor[2] * tailFlow];
                        // Easing inertia: decay velocity with a cubic ease-out
                        // curve (1 - (1-t)^3) instead of a fixed 0.9 multiplier.
                        // This keeps momentum early in the tail and settles
                        // softly — no abrupt stop.
                        const outProgress = 1.0 - outMult; // 0 at start → 1 at end
                        const decayRate = 0.96 - 0.06 * outProgress; // 0.96 → 0.90
                        const tailRadius = config.SPLAT_RADIUS * splatReleaseInMult * outMult;
                        multiSplatWithRadius(splatOutX, splatOutY, splatOutDx * decayRate, splatOutDy * decayRate, tailCol, tailRadius);
                        // 2026-08-16 fidelity audit: the release tail is part of
                        // the stroke the painter sees — peers used to watch
                        // strokes stop dead at lift while the painter's eased
                        // out. The tail rides the same dab wire as the stroke.
                        if (typeof window.queueDab === 'function') {
                            window.__mpLastDabColor = tailCol;
                            window.queueDab(splatOutX / canvas.width, splatOutY / canvas.height,
                                splatOutDx * decayRate, splatOutDy * decayRate, tailRadius);
                        }
                        if (typeof window.flushDabs === 'function') {
                            window.flushDabs(tailCol,
                                (typeof animationMultiplier === 'number' ? animationMultiplier : 1), false);
                        }
                        // Advance the tail along the decaying velocity + accumulate
                        // its travel for the distance-based taper.
                        splatOutX += splatOutDx / 10;
                        splatOutY += splatOutDy / 10;
                        splatTailDist += Math.sqrt(outVel2) / 10 / Math.max(1, canvas.width);
                        splatOutDx *= decayRate;
                        splatOutDy *= decayRate;
                    }
                }
                if (recEnabled) {
                    recUpdatePlayback();
                }
                // ── Physics sub-step loop (2026-08-17) ──────────────────────
                // subSteps is 1 on every display at 50Hz and above, so this is a
                // plain wrapper there — same passes, same order, same dt, and the
                // block below is untouched. On a genuinely low-refresh panel it
                // runs the physics N times at dt = wallDt/N so simulated time
                // tracks the wall clock instead of falling to 48% of it.
                //
                // Safe as a bare loop because nothing declared inside the block is
                // read after it (verified) and every accumulator it touches —
                // dyeDecayAccum, velDecayAccum, wetDryAccum — is a debt in
                // SECONDS that already sums per call, so N calls at dt each land
                // exactly where one call at N*dt would.
                //
                // Dabs are deposited before this loop, not interleaved between its
                // steps, so a low-fps frame still lays its dab train into one
                // instant of fluid rather than advecting between dabs. That is a
                // second-order difference next to the sim running at half speed,
                // and interleaving would mean threading the splat path through
                // here — worth doing only if it still reads wrong afterwards.
                for (let _ss = 0; _ss < subSteps; _ss++) {
                // Disable blend for physics passes (pure overwrite, no alpha needed)
                gl.disable(gl.BLEND);
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                // ── Standard Chorin projection order: forces → project → advect ──
                // 1. Curl computation
                curlProg.bind();
                gl.uniform2f(curlProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(curlProg.uniforms.uVelocity, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(curl.fbo);
                // Obstacle participation in the projection (divergence /
                // pressure / gradient): solids become walls the solve flows
                // around, instead of relying solely on the post-projection
                // damp pass. Same gate as that pass. Computed BEFORE the
                // vorticity pass — confinement is gated off at walls (its
                // wall-curl feedback loop was the strength-1.0 fuzz engine).
                const obsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
                // 2. Vorticity confinement → velocity
                vorticityProg.bind();
                gl.uniform2f(vorticityProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(vorticityProg.uniforms.uVelocity, 0);
                gl.uniform1i(vorticityProg.uniforms.uCurl, 1);
                gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
                gl.uniform1f(vorticityProg.uniforms.dt, dt);
                // M1 source gate: confinement stops pumping near the Max Speed
                // ceiling (cells/s = widths/s × grid width, same 45k fp16
                // guard as the advection knee). 0 disables.
                gl.uniform1f(vorticityProg.uniforms.uCapSpd,
                    config.VEL_SOURCE_GATE === false ? 0.0 :
                    ((typeof config.VELOCITY_CAP === 'number' && config.VELOCITY_CAP > 0) ? config.VELOCITY_CAP : 30.0));
                // Domain-edge apron: the canvas border is a wall too. Kill switch
                // for A/B feel-testing — config.CURL_EDGE_GATE = false.
                gl.uniform1f(vorticityProg.uniforms.uEdgeGate,
                    config.CURL_EDGE_GATE === false ? 0.0 : 1.0);
                gl.uniform1i(vorticityProg.uniforms.hasObstacle,
                    (obsActive && config.CURL_WALL_GATE !== false) ? 1 : 0);
                gl.uniform1f(vorticityProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                if (obsActive) {
                    gl.uniform1i(vorticityProg.uniforms.uObstacle, 2);
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, curl.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                // 3. Divergence
                const _openBoundary = window.__edgeAbsorb ? 1.0 : 0.0;
                // fp16 headroom rescale for the whole pressure system (see
                // divergenceFrag); gradient divides it back out below.
                // RESOLUTION-AWARE (2026-07-15): velocity is stored in grid
                // cells/s, so pressure (~v², × the finer grid) scales roughly
                // with resolution SQUARED — the same sealed-pocket scene
                // measured 616-777 stored at 512-class but 14k-15.7k at 1k,
                // brushing the valve knee and riding toward fp16 clipping on
                // long sessions ("pressure breakdown + static crashout at 1k
                // physics"). Normalizing by (512/simLong)² makes stored
                // pressure resolution-independent; 512 reference = the
                // validated default behavior, exactly.
                const _pBase = (typeof config.PRESSURE_SCALE === 'number' && config.PRESSURE_SCALE > 0)
                    ? config.PRESSURE_SCALE : 1 / 256;
                const _simLong = Math.max(simTexWidth, simTexHeight);
                const _pScale = _pBase;
                divergenceProg.bind();
                gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(divergenceProg.uniforms.pScale, _pScale);
                gl.uniform1f(divergenceProg.uniforms.openBoundary, _openBoundary);
                gl.uniform1i(divergenceProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                const _obsMax = window.__obsStrengthMax || 0.7;
                gl.uniform1f(divergenceProg.uniforms.uObsMax, _obsMax);
                gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
                gl.uniform1i(divergenceProg.uniforms.uObstacle, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(divergence.fbo);
                // 4. Clear pressure (decay previous frame's pressure field)
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION);
                // fp16 pressure valve (sealed-pocket stagnation pressure —
                // see clearFrag): soft ceiling at 30000 stored units, well
                // under the 65504 half-float limit
                gl.uniform1f(clearProg.uniforms.softClamp, 30000.0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                blit(pressure.write.fbo);
                pressure.swap();
                // 5. Pressure solve — multigrid V-cycle when enabled, with
                // warm-started Jacobi as the governor floor and toggle-off
                // path. The governor's iteration budget maps onto the ladder:
                // ≥24 → 2 V-cycles, ≥12 → 1 V-cycle, below → Jacobi at the
                // budget (V-cycle fill cost ≈ 10-15 Jacobi iterations, so the
                // rungs stay monotonic in GPU cost).
                // [GOVERNOR HOOK] effective iteration count (config untouched)
                const _pIters = window.QualityGovernor
                    ? window.QualityGovernor.effIters(config.PRESSURE_ITERATIONS)
                    : config.PRESSURE_ITERATIONS;
                const _mgOn = !!config.MULTIGRID && typeof mgSolvePressure === 'function' && _pIters >= 12;
                if (_mgOn) {
                    // Slider-driven V-cycle shape (Effects → Multigrid panel).
                    // NEVER a single cycle: 1-cycle MG is UNSTABLE around
                    // colliders (measured 2026-07-14: velocity 507→10,280 in
                    // 30 frames on a many-walled scene — each cycle's
                    // overcorrection feeds back through the Neumann walls;
                    // the second cycle is what cleans it up). This was the
                    // "fuzzing out" class: the governor's old low rung capped
                    // to 1 cycle exactly under load. The low rung is now 2
                    // LIGHT cycles (1/1/4 ≈ the GPU cost of the old 1×(2,2,8)).
                    const _mgBudgetLow = _pIters < 24;
                    const _mgCycles = _mgBudgetLow ? 2 : Math.max(2, config.MG_CYCLES || 2);
                    mgSolvePressure(_mgCycles, obsActive,
                        _mgBudgetLow ? 1 : ((typeof config.MG_PRE === 'number') ? config.MG_PRE : 2),
                        _mgBudgetLow ? 1 : ((typeof config.MG_POST === 'number') ? config.MG_POST : 2),
                        _mgBudgetLow ? 4 : ((typeof config.MG_COARSE === 'number') ? config.MG_COARSE : 8),
                        (typeof config.MG_RELAX === 'number') ? config.MG_RELAX : 1.0);
                } else {
                    pressureProg.bind();
                    gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform1f(pressureProg.uniforms.hSq, 1.0);
                    // Plain Jacobi keeps ω = 1.0 — bit-identical to the
                    // pre-relax shader (mix(pC, jacobi, 1.0) == jacobi)
                    gl.uniform1f(pressureProg.uniforms.relax, 1.0);
                    gl.uniform1f(pressureProg.uniforms.uObsMax, _obsMax);
                    gl.uniform1i(pressureProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
                    gl.uniform1i(pressureProg.uniforms.uObstacle, 2);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
                    if (obsActive) {
                        gl.activeTexture(gl.TEXTURE2);
                        gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    }
                    for (let i = 0; i < _pIters; i++) {
                        gl.uniform1i(pressureProg.uniforms.uPressure, 1);
                        gl.activeTexture(gl.TEXTURE1);
                        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                        blit(pressure.write.fbo);
                        pressure.swap();
                    }
                }
                // 6. Gradient subtract → divergence-free velocity
                gradientProg.bind();
                gl.uniform2f(gradientProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(gradientProg.uniforms.uObsMax, _obsMax);
                gl.uniform1f(gradientProg.uniforms.pScale, _pScale);
                gl.uniform1f(gradientProg.uniforms.openBoundary, _openBoundary);
                gl.uniform1i(gradientProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1i(gradientProg.uniforms.uPressure, 0);
                gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
                gl.uniform1i(gradientProg.uniforms.uObstacle, 2);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(velocity.write.fbo);
                velocity.swap();
                // Obstacle damping pass — runs only when collision layers are active.
                if (window.collisionLayers && window.collisionLayers.enabled && obstacle) {
                    obstacleDampProg.bind();
                    gl.uniform1f(obstacleDampProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                    gl.uniform1f(obstacleDampProg.uniforms.wallSlip,
                        (typeof config.WALL_SLIP === 'number') ? config.WALL_SLIP : 0.6);
                    gl.uniform2f(obstacleDampProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform1i(obstacleDampProg.uniforms.uVelocity, 0);
                    gl.uniform1i(obstacleDampProg.uniforms.uObstacle, 1);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    blit(velocity.write.fbo);
                    velocity.swap();
                }
                // 7. Advect velocity (using now-divergence-free field)
                advectionProg.bind();
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0, 1.0);
                gl.uniform2f(advectionProg.uniforms.obstacleTexelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform2f(advectionProg.uniforms.srcTexelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(advectionProg.uniforms.dt, dt);
                // Overflow borders (audio scenes / future toggles): same value
                // for the velocity and dye passes below
                gl.uniform1f(advectionProg.uniforms.edgeAbsorb, window.__edgeAbsorb || 0.0);
                gl.uniform1i(advectionProg.uniforms.isDensity, 0);
                gl.uniform1i(advectionProg.uniforms.hasObstacle, 0);
                gl.uniform1i(advectionProg.uniforms.macMode, 0);
                gl.uniform1f(advectionProg.uniforms.uVelCap,
                    (typeof config.VELOCITY_CAP === 'number' && config.VELOCITY_CAP > 0) ? config.VELOCITY_CAP : 30.0);
                // M1 source gate: growth amplification tapers by speed headroom
                gl.uniform1f(advectionProg.uniforms.srcGate, config.VEL_SOURCE_GATE === false ? 0.0 : 1.0);
                // Swirl NEVER touches the velocity self-advection — the
                // output IS the velocity texture, so any offset here would
                // be written back and compound (dye-only by design).
                gl.uniform1f(advectionProg.uniforms.swirl, 0.0);
                // P15-1: wetness never scales velocity self-advection — 0 makes
                // dyeMobility() return an exact 1.0, so this pass is bit-identical
                // to the pre-wetness sim (and uWetness is never sampled here).
                gl.uniform1f(advectionProg.uniforms.wetInfluence, 0.0);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 0);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
                // Batched decay (see header): a slider change resets the debt
                // so an accumulated exponent is never applied to a new rate.
                if (config.VELOCITY_DISSIPATION !== lastVelDiss) {
                    lastVelDiss = config.VELOCITY_DISSIPATION;
                    velDecayAccum = 0;
                }
                const _velDecay = computeDecayDt(config.VELOCITY_DISSIPATION, velDecayAccum, dt);
                velDecayAccum = _velDecay.accum;
                gl.uniform1f(advectionProg.uniforms.decayDt, _velDecay.decayDt);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                // 7b. M2 spectral floor: selective Nyquist dissipation on the
                // advected velocity (the small-scale energy sink — see
                // hfFloorFrag). One sim-res pass, ~one Jacobi iteration's cost.
                if ((config.HF_FLOOR || 0) > 0) {
                    hfFloorProg.bind();
                    gl.uniform2f(hfFloorProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform1f(hfFloorProg.uniforms.dt, dt);
                    gl.uniform1i(hfFloorProg.uniforms.uVelocity, 0);
                    gl.uniform1i(hfFloorProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1f(hfFloorProg.uniforms.uObsMax, _obsMax);
                    if (obsActive) {
                        gl.uniform1i(hfFloorProg.uniforms.uObstacle, 1);
                        gl.activeTexture(gl.TEXTURE1);
                        gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    }
                    gl.uniform1f(hfFloorProg.uniforms.strength,
                        Math.min(0.85, config.HF_FLOOR * Math.min(dt * 60, 2)));
                    gl.viewport(0, 0, simTexWidth, simTexHeight);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    blit(velocity.write.fbo);
                    velocity.swap();
                }
                // 7c. P15-1 wetness advect + dry. The wetness map rides the
                // just-projected velocity (semi-Lagrangian, full mobility) and
                // dries by a batched half-life. Skipped ENTIRELY when the
                // feature is off (WET_INFLUENCE<=0) → zero cost; the dye passes
                // then set wetInfluence=0 so dyeMobility() is a bit-exact 1.0.
                const _wetInfluence = (typeof config.WET_INFLUENCE === 'number' && config.WET_INFLUENCE > 0)
                    ? Math.min(config.WET_INFLUENCE, 1.0) : 0.0;
                if (_wetInfluence > 0) {
                    const _halfLife = (typeof config.WET_DRYING === 'number' && config.WET_DRYING > 0) ? config.WET_DRYING : 3.0;
                    if (_halfLife !== lastWetDrying) { lastWetDrying = _halfLife; wetDryAccum = 0; }
                    const _dry = computeDryMul(_halfLife, wetDryAccum, dt);
                    wetDryAccum = _dry.accum;
                    wetnessAdvectProg.bind();
                    gl.viewport(0, 0, simTexWidth, simTexHeight);
                    gl.uniform2f(wetnessAdvectProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform2f(wetnessAdvectProg.uniforms.srcTexelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform1f(wetnessAdvectProg.uniforms.dt, dt);
                    gl.uniform1f(wetnessAdvectProg.uniforms.dryMul, _dry.dryMul);
                    // The field itself rides the raw flow: swirl off, and
                    // wetInfluence=0 so dyeMobility()==1 (no wetness self-read).
                    gl.uniform1f(wetnessAdvectProg.uniforms.swirl, 0.0);
                    gl.uniform1f(wetnessAdvectProg.uniforms.swirlTime, 0.0);
                    gl.uniform1f(wetnessAdvectProg.uniforms.wetInfluence, 0.0);
                    gl.uniform1i(wetnessAdvectProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1f(wetnessAdvectProg.uniforms.uObsMax, _obsMax);
                    gl.uniform1i(wetnessAdvectProg.uniforms.uVelocity, 0);
                    gl.uniform1i(wetnessAdvectProg.uniforms.uSource, 1);
                    gl.uniform1i(wetnessAdvectProg.uniforms.uObstacle, 2);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, wetness.read.texture);
                    if (obsActive) {
                        gl.activeTexture(gl.TEXTURE2);
                        gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    }
                    blit(wetness.write.fbo);
                    wetness.swap();
                }
                // 8. Advect density (dye) using the projected velocity
                // (obsActive computed above, before the projection)
                // [MacCormack] Two extra dye-res passes before the main
                // advection: forward SL → error-correct+limit (05b). The main
                // pass then self-fetches the corrected field (macMode=1) and
                // applies decay/drains exactly once, so all the fp16 decay
                // machinery stays in one shader. Gated on the governor's fx
                // gate for now — sheds with post-FX under load (a dedicated
                // ladder rung comes with the multigrid work).
                // Scratch FBOs: `sharpened` and `detailed` are dye-res buffers
                // written+consumed strictly inside the same-frame post-FX
                // chain below, so borrowing them during the sim step adds
                // zero VRAM. If the post-FX pass order ever changes, revisit.
                // Pigment-memory refresh (splat-scissor companion, 05b/05i):
                // scissored additive dabs queue this ONE fullscreen pass to
                // reproduce the global memory-peak side effect that legacy
                // fullscreen dabs applied per dab — run before advection
                // (incl. the MacCormack passes) ever samples the dye, so the
                // frame sees exactly the state the per-dab refresh produced.
                if (window.__memRefreshPending) {
                    window.__memRefreshPending = false;
                    memRefreshProg.bind();
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    gl.uniform1i(memRefreshProg.uniforms.uDye, 0);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                    blit(density.write.fbo);
                    density.swap();
                }
                const macActive = !!config.MACCORMACK &&
                    (window.QualityGovernor ? window.QualityGovernor.fxOn() : true);
                // Swirl clock + strength, identical across all three dye
                // passes (the MacCormack correction is only valid if every
                // pass recomputes the same displacement).
                const _swirl = config.SWIRL || 0.0;
                const _swirlT = (nowMs % 3600000) / 1000;
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                // P15-1: bind the (freshly advected) wetness field to unit 4 for
                // all three dye passes. Bound unconditionally — dyeMobility()
                // statically references uWetness, so WebGL wants a complete
                // texture there at draw time even though wetInfluence=0 skips the
                // sample when the feature is off. The wetness FBO always exists.
                gl.activeTexture(gl.TEXTURE4);
                gl.bindTexture(gl.TEXTURE_2D, wetness.read.texture);
                if (macActive) {
                    macAdvectProg.bind();
                    gl.uniform2f(macAdvectProg.uniforms.texelSize, 1.0, 1.0);
                    gl.uniform2f(macAdvectProg.uniforms.srcTexelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                    gl.uniform1f(macAdvectProg.uniforms.dt, dt);
                    gl.uniform1f(macAdvectProg.uniforms.swirl, _swirl);
                    gl.uniform1f(macAdvectProg.uniforms.swirlTime, _swirlT);
                    // Obstacle-aware backtrace probes (shared snippet) — the
                    // forward pass must see the same walls as correct/main
                    gl.uniform1i(macAdvectProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1f(macAdvectProg.uniforms.uObsMax, _obsMax);
                    gl.uniform1i(macAdvectProg.uniforms.uObstacle, 2);
                    gl.uniform1i(macAdvectProg.uniforms.uVelocity, 0);
                    gl.uniform1i(macAdvectProg.uniforms.uSource, 1);
                    gl.uniform1i(macAdvectProg.uniforms.uWetness, 4);          // P15-1
                    gl.uniform1f(macAdvectProg.uniforms.wetInfluence, _wetInfluence);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                    // Bind unit 2 UNCONDITIONALLY — the third time this file has
                    // learned this lesson (see the two notes below the mac block).
                    // The correction pass leaves `sharpened` on unit 2, and with
                    // no obstacle this pass used to inherit it while RENDERING
                    // INTO sharpened.fbo: a texture bound as both sampler and
                    // render target, which is a feedback loop (INVALID_OPERATION,
                    // undefined output). Post-FX happened to overwrite unit 2
                    // between frames, which is the only reason it stayed hidden —
                    // sub-stepping runs this block twice with nothing in between
                    // and exposed it immediately. hasObstacle=0 means the shader
                    // never samples it; WebGL still requires something complete
                    // and non-aliasing to be there at draw time.
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obsActive ? obstacle.texture : velocity.read.texture);
                    blit(sharpened.fbo); // φ̂ⁿ⁺¹ (forward estimate)
                    macCorrectProg.bind();
                    gl.uniform2f(macCorrectProg.uniforms.texelSize, 1.0, 1.0);
                    gl.uniform2f(macCorrectProg.uniforms.srcTexelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                    gl.uniform1f(macCorrectProg.uniforms.dt, dt);
                    gl.uniform1f(macCorrectProg.uniforms.swirl, _swirl);
                    gl.uniform1f(macCorrectProg.uniforms.swirlTime, _swirlT);
                    gl.uniform1f(macCorrectProg.uniforms.uObsMax, _obsMax);
                    gl.uniform1i(macCorrectProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1i(macCorrectProg.uniforms.uVelocity, 0);
                    gl.uniform1i(macCorrectProg.uniforms.uSource, 1);
                    gl.uniform1i(macCorrectProg.uniforms.uForward, 2);
                    gl.uniform1i(macCorrectProg.uniforms.uObstacle, 3);
                    gl.uniform1i(macCorrectProg.uniforms.uWetness, 4);         // P15-1
                    gl.uniform1f(macCorrectProg.uniforms.wetInfluence, _wetInfluence);
                    // De-band taper (organic no-curl fix — see macCorrectFrag)
                    gl.uniform1f(macCorrectProg.uniforms.deband, config.DEBAND || 0.0);
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, sharpened.texture);
                    // Unconditional for the same reason as the forward pass above.
                    gl.activeTexture(gl.TEXTURE3);
                    gl.bindTexture(gl.TEXTURE_2D, obsActive ? obstacle.texture : velocity.read.texture);
                    blit(detailed.fbo); // corrected+limited φⁿ⁺¹ (pre-decay)
                }
                // Bind UNCONDITIONALLY. The plain (macMode 0) path used to rely
                // on advectionProg still being bound from the velocity advection
                // above — an invariant the M2 hf-floor pass (and now the memory
                // refresh) silently broke by binding their own programs in
                // between: every uniform write below then hit the WRONG program
                // (INVALID_OPERATION) and the dye pass drew with that stale
                // program — rendering the velocity field into the dye ("crisp
                // advection off completely falls apart", 2026-07-17..23).
                advectionProg.bind();
                // Same lesson for the samplers: unit 0 (uVelocity) was only
                // ever bound by the mac branch — the plain path inherited
                // whatever the last pass left there (the memory refresh leaves
                // dye on unit 0, turning dye values into velocities). Bind it
                // explicitly; redundant-but-harmless when the mac branch ran.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                gl.uniform1i(advectionProg.uniforms.macMode, macActive ? 1 : 0);
                // macMode self-fetches (coord = vUv) so swirl is moot there,
                // but the plain-SL dye path uses it directly.
                gl.uniform1f(advectionProg.uniforms.swirl, macActive ? 0.0 : _swirl);
                gl.uniform1f(advectionProg.uniforms.swirlTime, _swirlT);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0, 1.0);
                gl.uniform2f(advectionProg.uniforms.srcTexelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                gl.uniform1i(advectionProg.uniforms.isDensity, 1);
                gl.uniform1i(advectionProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1f(advectionProg.uniforms.uObsMax, _obsMax);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 1);
                gl.uniform1i(advectionProg.uniforms.uObstacle, 2);
                gl.uniform1i(advectionProg.uniforms.uWetness, 4);              // P15-1
                gl.uniform1f(advectionProg.uniforms.wetInfluence, _wetInfluence);
                // Ignite rides on top of the user's rate and ceiling
                // without ever writing them (see window.DyeNudge in 05h).
                // Idle returns the base values unchanged — exact no-op.
                const _dyeDiss = window.DyeNudge
                    ? window.DyeNudge.dissipation(config.DENSITY_DISSIPATION)
                    : config.DENSITY_DISSIPATION;
                // The Gate cap is the cap, Ignite included — it enriches via
                // display-stage vibrance instead of buying headroom here.
                const _dyeCeil = config.BLOOM_CEILING || 0.0;
                gl.uniform1f(advectionProg.uniforms.dissipation, _dyeDiss);
                gl.uniform1f(advectionProg.uniforms.bloomCeiling, _dyeCeil);
                // Pigment memory + Ignite restore (see advectionFrag). memDiss
                // 1.0 would make memory immortal; the default half-life lets
                // work you deliberately let go stay gone.
                gl.uniform1f(advectionProg.uniforms.memDiss,
                    (typeof config.DYE_MEMORY_DISS === 'number') ? config.DYE_MEMORY_DISS : 0.9995);
                gl.uniform1f(advectionProg.uniforms.uRestore,
                    window.DyeNudge ? window.DyeNudge.restore(dt) : 0.0);
                gl.uniform1f(advectionProg.uniforms.uRestoreGain,
                    window.DyeNudge ? window.DyeNudge.restoreGain() : 1.0);
                // M2 dye floor (motion-gated Nyquist removal — see 05b)
                gl.uniform1f(advectionProg.uniforms.hfFloorDye, config.HF_FLOOR_DYE || 0.0);
                // Wall-drain flow gate: spare dye that is still moving past a
                // collider (see the drain in advectionFrag). 0 = legacy drain.
                gl.uniform1f(advectionProg.uniforms.obsFlowKeep,
                    (typeof config.COLLIDER_FLOW_KEEP === 'number') ? config.COLLIDER_FLOW_KEEP : 1.0);
                gl.uniform1f(advectionProg.uniforms.obsDrainRate,
                    (typeof config.COLLIDER_DRAIN === 'number') ? config.COLLIDER_DRAIN : 0.06);
                gl.uniform1f(advectionProg.uniforms.obsDrainDilate,
                    (typeof config.COLLIDER_DRAIN_DILATE === 'number') ? config.COLLIDER_DRAIN_DILATE : 0.0);
                // Reset the decay-debt accumulator on SLIDER changes only: the
                // nudge ramps the effective rate every frame, and resetting on
                // that would zero the debt before it ever clears the fp16
                // threshold, so slow presets would stop decaying mid-nudge.
                if (config.DENSITY_DISSIPATION !== lastDyeDiss) {
                    lastDyeDiss = config.DENSITY_DISSIPATION;
                    dyeDecayAccum = 0;
                }
                const _dyeDecay = computeDecayDt(_dyeDiss, dyeDecayAccum, dt);
                dyeDecayAccum = _dyeDecay.accum;
                gl.uniform1f(advectionProg.uniforms.decayDt, _dyeDecay.decayDt);
                // Explicit freeze flag: the shader must distinguish freeze mode
                // (preserve artwork — no drains) from a user-set density of 1.0
                // (obstacle drain should still clear dye pinned against masks)
                gl.uniform1f(advectionProg.uniforms.frozen, window.__fluidFrozen ? 1.0 : 0.0);
                gl.activeTexture(gl.TEXTURE1);
                // macMode=1: source is the corrected field from the passes
                // above (self-fetched); otherwise the raw dye as before.
                gl.bindTexture(gl.TEXTURE_2D, macActive ? detailed.texture : density.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(density.write.fbo);
                density.swap();
                // 8b. Attractor field — dye-transport gather toward a
                // caller-published magnet layout. Runs on the advected dye,
                // moves the DYE only (never velocity → cannot destabilize the
                // sim). No-op with zero cost unless a scene set
                // window.__attractorField. See attractorFrag for the design.
                const _af = window.__attractorField;
                // Staleness guard: if the driving scene stopped ticking (audio
                // disabled, tab hidden), let the field expire so dye isn't
                // pulled forever by a frozen layout.
                if (_af && _af.a && _af.a.length &&
                    (typeof _af.ts !== 'number' || nowMs - _af.ts < 500)) {
                    const _n = Math.min(_af.a.length, 12);
                    const _flat = attractorFieldScratch;
                    for (let i = 0; i < _n; i++) {
                        const a = _af.a[i];
                        _flat[i * 4] = a[0];
                        _flat[i * 4 + 1] = a[1];
                        _flat[i * 4 + 2] = a[2];
                        _flat[i * 4 + 3] = a[3];
                    }
                    for (let i = _n * 4; i < _flat.length; i++) _flat[i] = 0;
                    attractorProg.bind();
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    gl.uniform1f(attractorProg.uniforms.aspectRatio, canvas.width / Math.max(1, canvas.height));
                    gl.uniform1f(attractorProg.uniforms.dt, dt);
                    gl.uniform1f(attractorProg.uniforms.uForce, (typeof _af.force === 'number') ? _af.force : 0.6);
                    gl.uniform1f(attractorProg.uniforms.uSwirl, (typeof _af.swirl === 'number') ? _af.swirl : 0.25);
                    gl.uniform1f(attractorProg.uniforms.uDensityGate, (typeof _af.densityGate === 'number') ? _af.densityGate : 0.75);
                    gl.uniform1f(attractorProg.uniforms.uMaxDensity, (typeof _af.maxDensity === 'number') ? _af.maxDensity : 1.6);
                    gl.uniform1i(attractorProg.uniforms.uCount, _n);
                    if (attractorProg.uniforms['uAtt[0]']) gl.uniform4fv(attractorProg.uniforms['uAtt[0]'], _flat);
                    gl.uniform1i(attractorProg.uniforms.uDensity, 0);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                    blit(density.write.fbo);
                    density.swap();
                }
                } // ── end physics sub-step loop ──
            }
            // Post-FX passes (sharpen, micro-detail, lighting, light shift,
            // glow) are full-quad rewrites into persistent FBOs — they must
            // OVERWRITE, never alpha-blend. With blending on, any pass whose
            // shader emits the source's faded alpha (lighting/light shift
            // early-exit and pass-through write color.a, and dye alpha decays
            // to 0 with the dye) keeps the FBO's previous contents wherever
            // alpha is low: the last bright frame stays burned in as a ghost
            // that never fades. Hidden most of the time because sharpen and
            // micro-detail hardcode alpha=1.0 — but exposed whenever those
            // passes are off (sharpness 0, or the governor's fx gate) while
            // light shift or lighting is on.
            gl.disable(gl.BLEND);
            // [GOVERNOR HOOK] post-FX gate (sharpen, micro-detail, glow)
            const _fxOn = window.QualityGovernor ? window.QualityGovernor.fxOn() : true;
            // Apply sharpness pass if enabled. RIDGES 0 makes the kernel a
            // mathematical no-op (zero-radius offsets → detail = 0), so skip
            // the whole dye-res pass — sharpening is opt-in via the Ridges
            // slider now (default 0 = the smooth look).
            const sharpnessEnabled = _fxOn && config.SHARPNESS > 0 && (config.RIDGES || 0) > 0;
            let displayTexture = density.read.texture;
            if (sharpnessEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                sharpenProg.bind();
                gl.uniform1i(sharpenProg.uniforms.uTexture, 0);
                gl.uniform1i(sharpenProg.uniforms.uVelocity, 1);
                gl.uniform1f(sharpenProg.uniforms.sharpness, config.SHARPNESS);
                gl.uniform2f(sharpenProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                // Kernel radius normalized to the 2048 reference: the sharpen
                // LOOK stays constant when dye resolution changes (boot ascent,
                // governor) — resolution now only affects
                // fidelity, not character. RIDGES > 1 recreates the coarse
                // emboss (the boot-ascent "ridges" look) deliberately.
                gl.uniform1f(sharpenProg.uniforms.kernelScale,
                    (config.RIDGES || 1.0) * (Math.max(dyeTexWidth, dyeTexHeight) / 2048));
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(sharpened.fbo);
                displayTexture = sharpened.texture;
            }
            // Apply micro detail pass if clarity or vibrance is active
            const mdClarity = config.CLARITY || 0;
            const mdVibrance = config.VIBRANCE || 0;
            const microDetailEnabled = _fxOn && (mdClarity > 0 || mdVibrance > 0);
            if (microDetailEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                microDetailProg.bind();
                gl.uniform1i(microDetailProg.uniforms.uTexture, 0);
                gl.uniform1i(microDetailProg.uniforms.uVelocity, 1);
                gl.uniform2f(microDetailProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                // 2048-reference kernel normalization (aesthetic-decoupling
                // principle — see sharpen pass above)
                gl.uniform1f(microDetailProg.uniforms.kernelScale,
                    Math.max(dyeTexWidth, dyeTexHeight) / 2048);
                gl.uniform1f(microDetailProg.uniforms.clarity, mdClarity);
                gl.uniform1f(microDetailProg.uniforms.vibrance, mdVibrance);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(detailed.fbo);
                displayTexture = detailed.texture;
            }
            // Apply lighting pass if enabled
            const lightingEnabled = window.lightSource && window.lightSource.enabled;
            if (lightingEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                lightingProg.bind();
                gl.uniform1i(lightingProg.uniforms.uTexture, 0);
                gl.uniform1i(lightingProg.uniforms.uVelocity, 1);
                gl.uniform2f(lightingProg.uniforms.lightPos, 
                    window.lightSource.x || 0.5, 
                    1.0 - (window.lightSource.y || 0.5)); // Flip Y for GL coords
                gl.uniform1f(lightingProg.uniforms.intensity, window.lightSource.intensity || 0.5);
                gl.uniform1f(lightingProg.uniforms.ambient, window.lightSource.ambient || 0.3);
                gl.uniform2f(lightingProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(lit.fbo);
                displayTexture = lit.texture;
            }
            // ── Glow (HDR bloom) ── mip-chain halo off the pre-tone-map HDR
            // frame; display adds it after the tone-map.
            const _glowOn = _fxOn && !!config.GLOW; // [GOVERNOR HOOK]
            if (_glowOn) applyGlow(displayTexture);
            gl.disable(gl.BLEND);
            // Shading form field: downsample the frame into the quarter-res
            // shadeForm FBO and blur it — the display shading normals come
            // from this smoothed height field, not the raw dye, so pigment
            // texel noise can't render as relief texture.
            const _shadingOn = (window.displayShading || 0.0) > 0.0 && shadeForm;
            if (_shadingOn) {
                blurProg.bind();
                gl.uniform1i(blurProg.uniforms.uTexture, 0);
                gl.uniform2f(blurProg.uniforms.texelSize, shadeForm.texelSizeX, 0.0);
                gl.viewport(0, 0, shadeForm.width, shadeForm.height);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                blit(shadeForm.fbo);
                blur(shadeForm, shadeFormTemp, 1);
            }
            gl.viewport(0, 0, canvas.width, canvas.height);
            displayProg.bind();
            gl.uniform2f(displayProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
            gl.uniform1f(displayProg.uniforms.displayShading, window.displayShading || 0.0);
            gl.uniform1f(displayProg.uniforms.shadeInvert, window.displayShadingInvert || 0.0);
            gl.uniform1f(displayProg.uniforms.shadeRelief, (typeof config.SHADE_RELIEF === 'number') ? config.SHADE_RELIEF : 1.0);
            gl.uniform1f(displayProg.uniforms.shadeGloss, (typeof config.SHADE_GLOSS === 'number') ? config.SHADE_GLOSS : 0.35);
            gl.uniform1f(displayProg.uniforms.gateVibrance, (config.BLOOM_CEILING > 0) ? 1.0 : 0.0);
            // Gate tone-map: display already-bounded gated dye through extended
            // Reinhard with the ceiling as its white point, so the picked colour
            // reads vivid instead of half-crushed by plain Reinhard. Mult sets how
            // close to linear: 1.0 = the ceiling maps to full display (max vivid),
            // higher dims toward the old c/(1+c). 0 (Gate off) = plain Reinhard.
            gl.uniform1f(displayProg.uniforms.gateWhite,
                (config.BLOOM_CEILING > 0)
                    ? config.BLOOM_CEILING * ((typeof config.GATE_WHITE_MULT === 'number') ? config.GATE_WHITE_MULT : 1.25)
                    : 0.0);
            // Saturation added at full Ignite. 0.45 was measured at sat
            // 0.742 -> 0.958 on a green: unmistakably lit, but nearer neon
            // than "the original colour turned up". Console-tunable.
            gl.uniform1f(displayProg.uniforms.igniteVibrance,
                window.DyeNudge
                    ? window.DyeNudge.level() *
                      ((typeof config.IGNITE_VIBRANCE === 'number') ? config.IGNITE_VIBRANCE : 0.22)
                    : 0.0);
            // Light Shift (unified 2026-07-18): one pass, here on the displayed
            // color. Recolors overblown/white fluid; identical with lighting on/off.
            const lightShiftOn = window.lightShift && window.lightShift.enabled && window.lightShift.colorPath && window.lightShift.colorPath.length > 0;
            gl.uniform1f(displayProg.uniforms.lightShiftEnabled, lightShiftOn ? 1.0 : 0.0);
            if (lightShiftOn) {
                const _lsc = window.lightShift.getCurrentColor();
                gl.uniform3f(displayProg.uniforms.lightShiftColor, _lsc.r, _lsc.g, _lsc.b);
                gl.uniform1f(displayProg.uniforms.lightShiftThreshold, window.lightShift.threshold || 0.85);
                gl.uniform1f(displayProg.uniforms.lightShiftIntensity, window.lightShift.intensity || 0.5);
                const _lsModeMap = { replace: 0, tint: 1, overlay: 2, multiply: 3, screen: 4, add: 5 };
                gl.uniform1i(displayProg.uniforms.lightShiftMode, _lsModeMap[window.lightShift.mode] || 0);
                // Density trigger (2026-07-21): the Gate ceiling (density-key reference,
                // 0 when Gate off) and how much the pigment-density signal feeds the
                // overblow test. Lets Color Shift key off actual dye density, which
                // survives the Gate clamp + Gate/Ignite vibrance the display does not.
                gl.uniform1f(displayProg.uniforms.lightShiftCeiling, (config.BLOOM_CEILING > 0) ? config.BLOOM_CEILING : 0.0);
                gl.uniform1f(displayProg.uniforms.lightShiftDensity, (typeof config.LS_DENSITY_MIX === 'number') ? config.LS_DENSITY_MIX : 1.0);
            }
            gl.uniform1i(displayProg.uniforms.uTexture, 0);
            gl.uniform1i(displayProg.uniforms.uShadeForm, 2);
            // D2 raster layer stack composite (raw-UV, after fluid effects):
            // up to 4 visible raster layers, pre-sorted bottom→top with
            // below-fluid slots first (rasterLayers.collectSlots, 05l).
            // SKETCH_VISIBLE stays the master show/hide gate for the stack.
            const _rSlots = (window.rasterLayers && config.SKETCH_VISIBLE !== false)
                ? window.rasterLayers.collectSlots() : null;
            for (let ri = 0; ri < 4; ri++) {
                const _rs = _rSlots ? _rSlots[ri] : null;
                gl.uniform1i(displayProg.uniforms['uRaster' + ri], 3 + ri);
                gl.uniform4f(displayProg.uniforms['uRasterP' + ri],
                    _rs ? 1 : 0, _rs ? _rs.opacity : 0, _rs ? _rs.mode : 0, (_rs && _rs.under) ? 1 : 0);
                // D3 clip binding (mask coverage sampler on units 8-11)
                gl.uniform1i(displayProg.uniforms['uRasterM' + ri], 8 + ri);
                gl.uniform4f(displayProg.uniforms['uRasterC' + ri],
                    (_rs && _rs.clipTex) ? 1 : 0, (_rs && _rs.clipInvert) ? 1 : 0, 0, 0);
            }
            // D3 mask overlay: auto-shown while painting into a mask, or
            // pinned on via the Show Mask checkbox (config.MASK_OVERLAY).
            // D3-4: the red film is a UI overlay — never bake it into an export.
            const _mOverlay = (!window.__exporting && window.Masks && (config.BRUSH_TARGET === 'mask' || config.MASK_OVERLAY))
                ? window.Masks.getFBO(window.Masks.activeId()) : null;
            gl.uniform1i(displayProg.uniforms.uMaskOverlay, 7);
            gl.uniform1f(displayProg.uniforms.maskOverlayOn, _mOverlay ? 1 : 0);
            if (_shadingOn) {
                gl.uniform2f(displayProg.uniforms.shadeTexelSize, shadeForm.texelSizeX, shadeForm.texelSizeY);
            }
            gl.uniform1i(displayProg.uniforms.uGlow, 1);
            gl.uniform1f(displayProg.uniforms.glowEnabled, _glowOn ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.preserveOpacity, window.preserveFluidOpacity ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.backgroundTransparency, window.backgroundTransparency || 0.0);
            gl.uniform1f(displayProg.uniforms.kaleidoEnabled, window.kaleidoEnabled ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.segments, (window.kaleidoSegments || 1));
            gl.uniform1i(
                displayProg.uniforms.kMode,
                (typeof window.kaleidoMode === 'number' && isFinite(window.kaleidoMode)) ? window.kaleidoMode : 1
            );
            gl.uniform1f(displayProg.uniforms.kAngle, window.kAngle || 0.0);
            gl.uniform1f(displayProg.uniforms.kTwist, window.kTwist || 0.0);
            gl.uniform1f(displayProg.uniforms.kZoom, window.kZoom || 1.0);
            gl.uniform1f(
                displayProg.uniforms.kBlend,
                (typeof window.kBlend === 'number' && isFinite(window.kBlend)) ? window.kBlend : 1.0
            );
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, displayTexture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, _glowOn ? glow.texture : null);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, _shadingOn ? shadeForm.texture : null);
            for (let ri = 0; ri < 4; ri++) {
                const _rs = _rSlots ? _rSlots[ri] : null;
                gl.activeTexture(gl.TEXTURE3 + ri);
                gl.bindTexture(gl.TEXTURE_2D, _rs ? _rs.texture : null);
                gl.activeTexture(gl.TEXTURE8 + ri);
                gl.bindTexture(gl.TEXTURE_2D, (_rs && _rs.clipTex) ? _rs.clipTex : null);
            }
            gl.activeTexture(gl.TEXTURE7);
            gl.bindTexture(gl.TEXTURE_2D, _mOverlay ? _mOverlay.texture : null);
            blit(null);
            // ─── Stats update (ring buffer, zero-GC) ──────────────────
            pushFrameTimestamp(nowMs);
            const fpsVal = countRecentFrames(nowMs);
            const frametimeMs = getLastFrameTime();
            const cpuMs = performance.now() - cpuStart;
            const targetFps = cap > 0 ? cap : displayHz;
            const budgetMs = 1000 / targetFps;
            const budgetPct = Math.min((cpuMs / budgetMs) * 100, 999);
            window.__stats = {
                fps: fpsVal,
                frametime: frametimeMs,
                lastCpuMs: cpuMs,
                targetFps: cap > 0 ? cap : 0,
                displayHz: displayHz,
                budgetPct: budgetPct
            };
            // [GOVERNOR HOOK] feed the adaptive quality governor
            if (window.QualityGovernor) window.QualityGovernor.onFrame(nowMs, cpuMs);
            if (!_firstFrameDrawn) {
                _firstFrameDrawn = true;
                if (window.Boot) window.Boot.done('frame');
            }
            requestAnimationFrame(update);
        }
