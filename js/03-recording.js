        function recGetActiveLayer() {
            return recLayers.find(l => l.id === recActiveLayerId);
        }

        function recSetActiveLayer(id) {
            recActiveLayerId = id;
            recRenderUI();
        }
        // The bench: the parts in the recorder right now. After a take ends
        // the strip asks Keep · Discard (2026-10-04; no auto-keep, the
        // ~20-animation localStorage budget would fill).
        //   recPendingTake  { id } of the part that take went into, while asking
        let recPendingTake = null;
        // Countdown state for recording
        let recCountdownActive = false;
        let recCountdownVal = 0;
        let recCountdownTimerId = null;

        function recCancelCountdown() {
            if (recCountdownTimerId) { try { clearTimeout(recCountdownTimerId); } catch(_){} recCountdownTimerId = null; }
            recCountdownActive = false;
            recCountdownVal = 0;
            recRenderUI();
        }

        // PERF: Non-blocking async timer to auto-stop recording at max duration
        let _recAutoStopTimerId = null;
        
        // The clock a take is stamped on: the one its playhead rides
        // (recUpdatePlayback, config.REC_SIM_CLOCK). Stamped on the wall clock
        // and played on the sim clock, a take ran slow: about 4% at 60 Hz,
        // where the sim's 16 ms step clamp drops 0.67 ms a frame, and far more
        // when frames drop (user test 3, "is replay speed accurate?"). An
        // overdub slid off the loop it was laid over by the same amount.
        // Picked once per take, so a take never mixes the two.
        function recClockNow(a) {
            return (a && a.timeline.recClock === 'sim' && typeof window.__simTimeMs === 'number')
                ? window.__simTimeMs : Date.now();
        }

        // ...but the LENGTH of a take is a stopwatch (2026-10-13). The chip
        // says "8 s" and the painter counts real seconds; capped on the sim
        // clock, an 8 s take ran 16.7 s at Time 0.5 and 9 s at ~55 fps,
        // where the sim's 16 ms step clamp falls behind the wall. The dabs
        // keep their sim-clock stamps, so playback still lands each one at
        // the simulated instant it was painted.
        function recTakeElapsedWall(a) {
            return (a && typeof a.timeline.takeStartWall === 'number')
                ? performance.now() - a.timeline.takeStartWall : 0;
        }
        function recTakeCapMs(a) {
            return (a && typeof a.timeline.takeCapMs === 'number' && a.timeline.takeCapMs > 0)
                ? a.timeline.takeCapMs : recPartCapMs(a);
        }

        // A part's timeline is in sim ms; simRate is how many of them one
        // real ms carried while it was recorded (Time, and the step clamp
        // on a slow frame). Lengths and the clock read in real seconds as
        // recorded, so an 8 s take says 0:08 whatever Time it was made at.
        // Parts from before this have none and read as they always did.
        function recPartRate(l) {
            const r = l && l.simRate;
            return (typeof r === 'number' && isFinite(r) && r > 0) ? r : 1;
        }
        function recShowMs(l, ms) { return (ms || 0) / recPartRate(l); }

        function recStartRecording() {
            if (recPendingTake) { recStripSay('Keep or discard what you painted first.'); return; }
            let a = recGetActiveLayer();
            let fresh = false;
            if (!a) { recAddLayer(); a = recGetActiveLayer(); fresh = true; }
            if (!a) return;
            // A take never lands on top of a part that already has strokes:
            // it gets a part of its own, so Discard takes back exactly it and
            // a part's timestamps stay in order.
            if (a.timeline.interactions.length > 0) { a = recCreateLayer(); fresh = true; }
            a._takeFrom = a.timeline.interactions.length;
            a._takeNewPart = fresh;
            a.timeline.isRecording = true;
            a.timeline.recClock = ((window.config && window.config.REC_SIM_CLOCK === false)
                || typeof window.__simTimeMs !== 'number') ? 'wall' : 'sim';
            a.timeline.recordingStartTime = recClockNow(a) - a.timeline.playbackPosition;
            a.timeline.takeStartSim = recClockNow(a);
            a.timeline.takeStartWall = performance.now();
            a.timeline.takeCapMs = recPartCapMs(a);
            // What the part read before the take, for a take that adds
            // nothing or is discarded (recStopRecording overwrites both).
            a._takeLoopPrev = a.loopMaxMs;
            a._takeRatePrev = a.simRate;
            a.timeline.duration = recMaxDurationMs;
            // Capture the brush's color mode at record start so 'Preserve Mode'
            // can reproduce it on replay (random keeps being random, etc.)
            var _arm0 = (window.multiArmColors && window.multiArmColors[0]) ? window.multiArmColors[0] : null;
            a.recordMode = (_arm0 && _arm0.mode) ? _arm0.mode : 'main';
            a.recordStepPalette = (a.recordMode === 'step' && typeof getStepColorList === 'function')
                ? getStepColorList().slice() : null;
            // Everything on the canvas (the strip's Everything): every dab
            // comes in through the paint funnel instead (recTapDab), other
            // people's included, so the colours are theirs and as painted:
            // none of them is re-rolled from this brush's random mode.
            a.timeline.src = (recRecordSource === 'all') ? 'all' : 'single';
            if (a.timeline.src === 'all') {
                a.recordMode = 'all';
                a.recordStepPalette = null;
                recTapPart = a;
                window.__recTap = recTapDab;
            }
            a._repKey = null;
            if (a.timeline.isPlaying) a.timeline.isPlaying = false;
            recUpdateButtonStates(); // PERF: lightweight - no DOM rebuild during recording
            
            // Auto-stop at the take's length, on the wall clock.
            // recUpdatePlayback checks the same stopwatch every frame; this
            // timer ends the take on time while no frames come at all (the
            // window hidden or minimised).
            recClearAutoStopTimer();
            const remaining = a.timeline.takeCapMs;
            if (remaining > 0) {
                _recAutoStopTimerId = setTimeout(function() {
                    _recAutoStopTimerId = null;
                    if (recLayers.some(l => l.timeline.isRecording)) recStopRecording();
                }, remaining);
            }
        }
        
        function recClearAutoStopTimer() {
            if (_recAutoStopTimerId) {
                clearTimeout(_recAutoStopTimerId);
                _recAutoStopTimerId = null;
            }
        }

        function recStopRecording() {
            recClearAutoStopTimer(); // Clear any pending auto-stop
            window.__recTap = null;
            recTapPart = null;
            // The part that is recording, even when another was selected
            // since the take began: it would otherwise record on unstopped.
            const a = recLayers.find(l => l.timeline.isRecording) || recGetActiveLayer();
            if (!a) return;
            let ended = false;
            if (a.timeline.isRecording) {
                a.timeline.isRecording = false;
                const last = recComputeDurationFromInteractions(a.timeline.interactions);
                if (a.timeline.interactions.length > (a._takeFrom | 0)) {
                    // The take is as long as it ran, not as far as its last
                    // dab: an 8 s take loops every 8 s with its quiet end
                    // kept, so parts made at one length stay in step. It used
                    // to loop at the last dab, 1.4 s into an 8 s take.
                    let span = recClockNow(a) - a.timeline.recordingStartTime;
                    const simSpan = recClockNow(a) - (a.timeline.takeStartSim || 0);
                    const wallSpan = recTakeElapsedWall(a);
                    const cap = recTakeCapMs(a);
                    if (wallSpan >= 100 && simSpan > 0) {
                        a.simRate = Math.max(0.02, Math.min(50, simSpan / wallSpan));
                        // Ran to its length: the frame that noticed is up to
                        // one late, so the loop is trimmed to the length on
                        // the chip, in this take's own sim time.
                        if (wallSpan >= cap) span = Math.min(span, cap * a.simRate + (span - simSpan));
                    }
                    a.timeline.duration = Math.max(last, span);
                    a.loopMaxMs = Math.max(1, a.timeline.duration);
                } else {
                    a.timeline.duration = last;
                }
                ended = true;
            }
            recRenderUI();
            if (ended) recTakeEnded(a);
        }

        // ── Keep · Discard ───────────────────────────────────────────────
        // Every way a take ends comes through recStopRecording: Stop, F9,
        // Esc, the length running out. Then the strip asks.
        function recTakeEnded(a) {
            const added = a.timeline.interactions.length - (a._takeFrom | 0);
            if (added <= 0) {
                // Nothing painted: the part made for this take goes again.
                if (a._takeNewPart && recLayers.length > 1) recRemovePart(a.id);
                recStripSay('Nothing was painted, so there is nothing to keep.');
                return;
            }
            recPendingTake = { id: a.id };
            recStripSay('');
            recUpdateButtonStates();
            recShowTakePrompt();
        }

        function recRemovePart(id) {
            const idx = recLayers.findIndex(l => l.id === id);
            if (idx < 0) return;
            if (recPendingTake && recPendingTake.id === id) { recPendingTake = null; recHideTakePrompt(); }
            recLayers.splice(idx, 1);
            const next = recLayers[Math.max(0, idx - 1)];
            recActiveLayerId = next ? next.id : null;
            recRenderUI();
        }

        // Keep: the bench becomes an animation in the library and the first
        // empty slot ("Animation N", the lowest free N). Then the bench is
        // cleared for the next take. A full store keeps the question open,
        // so nothing is lost.
        function recKeepTake() {
            if (!recPendingTake) return false;
            recStopPlayback();
            const name = recAutoName();
            const res = recSaveAllLayersAsPreset(name);
            if (res === 'full') {
                // Said once, where the painter is looking. The question
                // stays open with it, so nothing is lost.
                const full = "Can't save. Storage is full. Delete an old animation and try again.";
                if (recStripOnScreen()) recStripSay(full);
                else recShowTakePrompt(full);
                return false;
            }
            if (res !== true) { recStripSay(res === 'empty' ? 'Nothing recorded yet.' : "Couldn't keep it."); return false; }
            const askedOnCanvas = recPromptShown();
            recPendingTake = null;
            recLibraryChanged();
            const slot = (window.animSlots && typeof window.animSlots.assignFirstEmpty === 'function')
                ? window.animSlots.assignFirstEmpty(name) : -1;
            recClearBench();
            const msg = slot >= 0 ? `Kept as ${name}, in slot ${slot + 1}.` : `Kept as ${name}. The slots are full: drag it in from Saved Animations.`;
            recStripSay(msg);
            if (askedOnCanvas) recShowTakePrompt(msg, true);
            return name;
        }

        // Discard: exactly what the take added goes, the part with it when
        // the part was made for the take.
        function recDiscardTake() {
            if (!recPendingTake) return false;
            const a = recLayers.find(l => l.id === recPendingTake.id);
            recPendingTake = null;
            recHideTakePrompt();
            recStopPlayback();
            if (a) {
                if (a._takeNewPart && recLayers.length > 1) {
                    recRemovePart(a.id);
                } else {
                    a.timeline.interactions.length = Math.min(a.timeline.interactions.length, a._takeFrom | 0);
                    a.timeline.duration = recComputeDurationFromInteractions(a.timeline.interactions);
                    a.timeline.playbackPosition = 0;
                    a.loopMaxMs = a._takeLoopPrev;
                    a.simRate = a._takeRatePrev;
                }
            }
            recRenderUI();
            recStripSay('Discarded.');
            return true;
        }

        // One empty part, nothing opened, nothing to keep.
        function recClearBench() {
            recLayers.forEach(l => { l.timeline.isPlaying = false; l.timeline.isRecording = false; });
            window.__recTap = null;
            recTapPart = null;
            recIsPlayingAll = false;
            recLayers = [];
            recNextLayerId = 1;
            recActiveLayerId = null;
            recForgetBench();
            recCreateLayer();
        }

        // Nothing on the bench waits to be kept: it was just kept, cleared,
        // or replaced by a project.
        function recForgetBench() {
            recPendingTake = null;
            recHideTakePrompt();
            recUpdateButtonStates();
        }

        // The strip's status line. A message clears itself after a while so
        // a stale "Kept as..." is not read as news on the next look.
        let _recStripSayTimer = null;
        function recStripSay(text) {
            const el = document.getElementById('recStripStatus');
            if (!el) return;
            el.textContent = text || '';
            if (_recStripSayTimer) clearTimeout(_recStripSayTimer);
            _recStripSayTimer = text ? setTimeout(() => { _recStripSayTimer = null; el.textContent = ''; }, 9000) : null;
        }

        // Is the strip where the painter can see it? Not when Animations is
        // closed or hidden (Simple), Focus Mode is on, or it is scrolled away.
        function recStripOnScreen() {
            const el = document.getElementById('recMini');
            if (!el || !el.getClientRects().length) return false;
            if (el.closest('.sidebar-section.collapsed, .ui-hidden')) return false;
            if (document.body.classList.contains('focus-mode')) return false;
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
        }

        // F9 works with the strip out of sight, so the question has to be
        // asked where the painter is looking: a small card on the canvas,
        // under the REC badge. `msg` shows a line instead of the question
        // (`done` = the answer, which then goes by itself).
        let _recPromptTimer = null;
        function recPromptShown() {
            const p = document.getElementById('recTakePrompt');
            return !!p && p.style.display !== 'none';
        }
        function recShowTakePrompt(msg, done) {
            // The question goes where the strip can't be seen; an answer
            // (done) only follows a question that was asked here.
            if (!done && recStripOnScreen()) { recHideTakePrompt(); return; }
            let p = document.getElementById('recTakePrompt');
            if (!p) {
                const host = document.getElementById('canvas-area');
                if (!host) return;
                p = document.createElement('div');
                p.id = 'recTakePrompt';
                p.className = 'rec-take-prompt';
                p.dataset.group = 'expressive';
                p.innerHTML = '<span class="rec-take-ask"></span>' +
                    '<button type="button" id="recTakeKeepBtn" class="btn--emphasis" title="Save it as an animation, in the first empty slot">Keep</button>' +
                    '<button type="button" id="recTakeDiscardBtn" class="btn--destructive" title="Discard the previous recording">Discard</button>';
                // Its presses are for its buttons, never a stroke on the canvas
                ['pointerdown', 'mousedown', 'touchstart'].forEach(t => p.addEventListener(t, e => e.stopPropagation()));
                p.querySelector('#recTakeKeepBtn').addEventListener('click', e => { e.stopPropagation(); recKeepTake(); });
                p.querySelector('#recTakeDiscardBtn').addEventListener('click', e => { e.stopPropagation(); recDiscardTake(); });
                host.appendChild(p);
            }
            if (_recPromptTimer) { clearTimeout(_recPromptTimer); _recPromptTimer = null; }
            p.querySelector('.rec-take-ask').textContent = msg || 'Keep what you painted?';
            p.querySelectorAll('button').forEach(b => { b.style.display = done ? 'none' : ''; });
            p.style.display = 'flex';
            if (done) _recPromptTimer = setTimeout(recHideTakePrompt, 3500);
        }

        function recHideTakePrompt() {
            if (_recPromptTimer) { clearTimeout(_recPromptTimer); _recPromptTimer = null; }
            const p = document.getElementById('recTakePrompt');
            if (p) p.style.display = 'none';
        }

        function recStartCountdown(start = 3) {
            recCancelCountdown();
            recCountdownVal = Math.max(1, Math.floor(start));
            recCountdownActive = true;
            recUpdateButtonStates(); // PERF: lightweight update
            function tick() {
                if (!recCountdownActive) return;
                if (recCountdownVal <= 1) {
                    recCountdownActive = false;
                    recCountdownVal = 0;
                    recCountdownTimerId = null;
                    recStartRecording();
                    recUpdateButtonStates(); // PERF: lightweight update
                    return;
                }
                recCountdownVal -= 1;
                recUpdateButtonStates(); // PERF: lightweight update
                recCountdownTimerId = setTimeout(tick, 1000);
            }
            recCountdownTimerId = setTimeout(tick, 1000);
        }
        
        function recCreateLayer(name = null) {
            const id = recNextLayerId++;
            const layer = {
                id,
                name: name || `Part ${id}`,
                visible: true,
                isLooping: true,
                // Replay color behavior (1.3 rework): 'original' (default) =
                // reproduce the record-time brush (random keeps regenerating);
                // 'exact' = frozen captured colors; 'live' = current settings.
                colorMode: 'original',
                recordMode: 'main',       // arm-0 mode captured at record start
                recordStepPalette: null,  // step palette captured at record start
                loopMaxMs: (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : 10000),
                mask: {
                    enabled: false,
                    mode: 'show', // 'show' or 'hide'
                    shapes: []
                },
                timeline: {
                    interactions: [],
                    duration: 0,
                    playbackPosition: 0,
                    isRecording: false,
                    isPlaying: false,
                    recordingStartTime: 0
                }
            };
            recLayers.push(layer);
            recSetActiveLayer(id);
            return layer;
        }
        
        function recAddLayer() { recCreateLayer(); }

        function recToggleRecord() {
            // Clicking during countdown cancels it
            if (recCountdownActive) { recCancelCountdown(); return; }
            const a = recGetActiveLayer();
            if (a && a.timeline.isRecording) {
                recStopRecording();
                return;
            }
            if (recPendingTake) { recStripSay('Keep or discard what you painted first.'); recShowTakePrompt(); return; }
            // Start a 3-2-1 countdown before recording
            recStartCountdown(3);
        }
        
        // flow: the Flow still to apply to colorArray at playback. Callers
        // handing the raw pointer colour pass the live Flow (05d
        // __recLiveFlow); one whose colour went through applyPaintFlow passes
        // __splatFlow (1 under Limit Off, where the flow is already in the
        // colour). Omitted = the colour is final, as recordings were before.
        function recRecordInteraction(x, y, dx, dy, colorArray, flow) {
            if (!recEnabled) return;
            const a = recGetActiveLayer();
            if (!a || !a.timeline.isRecording) return;
            // An Everything take hears every dab at the paint funnel
            // (recTapDab), these pointer samples included: taking them here
            // too would paint the stroke twice.
            if (a.timeline.src === 'all') return;
            if (recTakeElapsedWall(a) > recTakeCapMs(a)) {
                recStopRecording();
                return;
            }
            const timestamp = recClockNow(a) - a.timeline.recordingStartTime;
            const mult = (typeof window.animationMultiplier === 'number') ? window.animationMultiplier : 1;
            // Capture the EFFECTIVE brush size actually painted, not just the
            // base SPLAT_RADIUS: the brush engine tapers each dab by the
            // splat-in ramp (and pen pressure), so storing the base made replay
            // uniformly full-size while the live stroke ramped in — the "replay
            // size ≠ recording size" bug. The paint path publishes the true
            // per-dab radius to window.__lastPaintRadius; fall back to the base.
            const radius = (typeof window.__lastPaintRadius === 'number' && window.__lastPaintRadius > 0)
                ? window.__lastPaintRadius
                : ((window.config && typeof window.config.SPLAT_RADIUS === 'number') ? window.config.SPLAT_RADIUS : undefined);
            // The FOOTPRINT this dab was painted with, alongside its size. Without
            // these a recording replayed as a plain gaussian however clearly the
            // swatch said otherwise — the same gap stroke replay closed with its
            // own tip/shape fields. Undefined on a default brush so the common
            // interaction stays as small as it was.
            const cfg = window.config || {};
            const tip = cfg.BRUSH_TIP | 0;
            const shape = cfg.BRUSH_SHAPE_ID || null;
            const interaction = { timestamp, x: x / canvas.width, y: y / canvas.height, vx: dx, vy: dy, color: colorArray.slice(), mult, radius };
            if (tip) interaction.tip = tip;
            if (shape) interaction.shape = shape;
            // Pressure, alongside the footprint and for a louder reason than
            // either: a velocity-only dab lays NO pigment, so a recording that
            // did not carry the flag played back as an ordinary stroke and put
            // paint on the canvas the painter never laid. `ap` is the per-arm
            // mask (05g) — a painting brush can still have push arms, so the two
            // are independent. Both omitted on an ordinary dab, keeping the
            // common interaction as small as it was.
            if (cfg.BRUSH_VELOCITY_ONLY) {
                interaction.push = {
                    m: cfg.BRUSH_VEL_MODE || 'smudge',
                    s: (typeof cfg.BRUSH_VEL_STRENGTH === 'number') ? cfg.BRUSH_VEL_STRENGTH : 1
                };
            }
            const apMask = (typeof window.__armPushPin === 'number')
                ? window.__armPushPin
                : ((typeof window.armPushMask === 'function') ? window.armPushMask() : 0);
            if (apMask) interaction.ap = apMask;
            // Per-arm tips (05g): arm index -> tip or shape, the arms that
            // override the brush's only. Omitted when none do.
            const atip = (typeof window.activeArmTips === 'function') ? window.activeArmTips() : null;
            if (atip && Object.keys(atip).length) interaction.atip = Object.assign({}, atip);
            // Per-stroke mirror (41-button-modes): a dab painted by a button
            // bound to "mirror brushstroke" landed in two (or four) places, so
            // a recording without it plays back as half the mark that was made.
            // Same class as `ap` — geometry, not styling — and omitted at 0.
            const mirPin = window.__strokeMirrorPin | 0;
            if (mirPin) interaction.mir = mirPin;
            // The Flow the dab was painted at, so a take painted thin plays
            // back thin whatever the slider says now (2026-10-08: playback
            // ran every dab at full Flow). Omitted at full flow.
            if (typeof flow === 'number' && isFinite(flow) && flow >= 0 && flow < 0.9995) {
                interaction.fl = +flow.toPrecision(4);
            }
            // Preserve Randomness: mark the dab as rolled by random mode rather
            // than only freezing the roll, so 'original' playback re-rolls per
            // stroke ('exact' still freezes). Read through the pin so a replay
            // being re-recorded stays faithful to its source events instead of
            // the live panel. Omitted when off — the common dab stays as-is.
            const rndOn = (typeof window.__recRndPin === 'number')
                ? window.__recRndPin
                : ((window.preserveRandomness &&
                    window.multiArmColors && window.multiArmColors[0] &&
                    window.multiArmColors[0].mode === 'random') ? 1 : 0);
            if (rndOn) {
                interaction.rnd = 1;
                // Flow share baked into this dab's colour (a re-recorded
                // replay's interpolated dabs are k-scaled per frame). Playback
                // de-dims by it to recover one grouping key per stroke, and
                // re-dims the fresh roll by the same share.
                const fmPin = window.__recFmPin;
                if (typeof fmPin === 'number' && isFinite(fmPin) && Math.abs(fmPin - 1) >= 0.005) {
                    interaction.fm = Math.round(fmPin * 1000) / 1000;
                }
            }
            // In the units a kept take is packed to, so Keep changes nothing
            a.timeline.interactions.push(recQuantizeDab(interaction));
            // PERF: During recording, skip ALL UI updates - just record data
            // Timeline visualization updates when recording stops
        }

        // ── Everything on the canvas (2026-10-13) ───────────────────────
        // A Just-me take records this brush's pointer (above). An Everything
        // take records at the paint funnel instead: 05g's multiSplat hands
        // this every dab it lays — this brush and its replays, other
        // people's strokes in the room, slot animations, text — with what
        // decided the dab already resolved there: each arm's colour, the arm
        // mask, tips and mirror after their pins, the pose, the rake heading.
        // Stored with all of it, a dab plays back the same (recEmitTapDab)
        // whoever painted it and whatever this brush is set to by then.
        // An Everything take holds every dab, far more than a Just-me take's
        // pointer samples, so numbers are rounded to what the canvas can
        // show and a field at its usual value is left out.
        let recTapPart = null;
        function recRound(v, k) { return Math.round(v * k) / k; }
        // `direct`: heard in splat() (05i), from a source that skips
        // multiSplat, so one plain dab with no arms and no layout.
        function recTapDab(x, y, dx, dy, color, exact, footprint, armPush, armTips, mir, faceTurn, rake, arms, direct) {
            const a = recTapPart;
            // A file or project replacing the bench mid-take leaves the part
            // behind still marked recording
            if (!a || !a.timeline.isRecording || !recEnabled || recLayers.indexOf(a) < 0) return;
            // The recorder's own parts playing along are on the bench already
            if (window.__recBenchPlaying) return;
            if (recTakeElapsedWall(a) > recTakeCapMs(a)) return;   // the frame's check stops the take
            const cfg = window.config || {};
            const W = canvas.width || 1, H = canvas.height || 1;
            const d = {
                timestamp: recRound(recClockNow(a) - a.timeline.recordingStartTime, 100),
                x: recRound(x / W, 1e5), y: recRound(y / H, 1e5),
                vx: recRound(dx, 100), vy: recRound(dy, 100),
                color: [recRound(color[0], 1e4), recRound(color[1], 1e4), recRound(color[2], 1e4)],
                // The arm count and size this call painted with: applyMultiSplatWith
                // has them in place, so a peer's or a replay's own, not the panel's.
                mult: (!direct && typeof animationMultiplier === 'number') ? Math.max(1, Math.round(animationMultiplier)) : 1,
                radius: +(+cfg.SPLAT_RADIUS || 0).toPrecision(4),
                tap: 1
            };
            if (exact) d.ex = 1;
            if (footprint) d.wf = 1;
            if (window.__remoteStroke) d.rs = 1;
            if (typeof isProcessingRemoteEvent !== 'undefined' && isProcessingRemoteEvent) d.pr = 1;
            // The footprint only counts on a dab splat() treats as a brush
            // stroke (its __brushTipOn gate); a programmatic source prints
            // gaussian whatever the panel says.
            if (!exact || footprint) {
                const tip = cfg.BRUSH_TIP | 0;
                if (tip) d.tip = tip;
                // The shape printed only when the stamp was not held off: a
                // peer's stroke whose stamp never arrived paints with
                // __remoteStroke over whatever shape this canvas has selected.
                if (cfg.BRUSH_SHAPE_ID && !window.__remoteStroke) d.shape = cfg.BRUSH_SHAPE_ID;
                if ((tip || d.shape) && typeof cfg.BRUSH_TIP_TEXTURE === 'number' && cfg.BRUSH_TIP_TEXTURE !== 1) {
                    d.tx = recRound(cfg.BRUSH_TIP_TEXTURE, 1000);
                }
                if (cfg.BRUSH_VELOCITY_ONLY) {
                    d.push = {
                        m: cfg.BRUSH_VEL_MODE || 'smudge',
                        s: (typeof cfg.BRUSH_VEL_STRENGTH === 'number') ? cfg.BRUSH_VEL_STRENGTH : 1
                    };
                }
                if (armPush) d.ap = armPush | 0;
                if (armTips && Object.keys(armTips).length) d.atip = Object.assign({}, armTips);
                if (mir) d.mir = mir | 0;
                if (faceTurn) d.ft = recRound(faceTurn, 1e4);
                if (cfg.SYM_SAME_ANGLE) d.sa = 1;
            }
            // The angle turns a material's clay stamp on any dab, not only
            // the brush's tip
            if (cfg.BRUSH_ANGLE) d.ang = recRound(+cfg.BRUSH_ANGLE, 100);
            // Where the arms land counts for every dab that had arms
            const sym = cfg.SYMMETRY_MODE || 'radial';
            if (sym !== 'radial' && !direct) d.sym = sym;
            if (rake) d.rk = [recRound(rake[0], 1e4), recRound(rake[1], 1e4), recRound(rake[2], 1000)];
            const fl = window.__splatFlow;
            if (typeof fl === 'number' && isFinite(fl) && fl >= 0 && fl < 0.9995) d.fl = +fl.toPrecision(4);
            const vk = window.__splatVelK;
            if (typeof vk === 'number' && isFinite(vk) && vk > 0 && vk < 0.9995) d.vk = +vk.toPrecision(4);
            // Each arm's colour, where it is not the dab's own
            if (arms) {
                let ac = null;
                for (const k in arms) {
                    const v = arms[k];
                    if (!v || (v[0] === color[0] && v[1] === color[1] && v[2] === color[2])) continue;
                    (ac || (ac = {}))[k] = [recRound(v[0], 1e4), recRound(v[1], 1e4), recRound(v[2], 1e4)];
                }
                if (ac) d.ac = ac;
            }
            a.timeline.interactions.push(recQuantizeDab(d));
        }

        // One dab recTapDab stored. Every pin it was laid under goes on for
        // the call and comes off after, the pin-then-restore the replay
        // paths use, so neither the live brush nor the panel leaks into it
        // and it leaks into neither. `live` (Current brush) paints with this
        // brush's colours now; otherwise each arm gets the colour it painted.
        // Fields are range-checked: a take can arrive from a file.
        function recEmitTapDab(i, x, y, col, live) {
            const cfg = window.config;
            if (!cfg || typeof window.applyMultiSplatWith !== 'function') return;
            const saved = [cfg.BRUSH_TIP, cfg.BRUSH_SHAPE_ID, cfg.BRUSH_ANGLE, cfg.BRUSH_TIP_TEXTURE,
                cfg.BRUSH_VELOCITY_ONLY, cfg.BRUSH_VEL_MODE, cfg.BRUSH_VEL_STRENGTH,
                cfg.SYMMETRY_MODE, cfg.SYM_SAME_ANGLE,
                window.__remoteStroke, window.__armPushPin, window.__armTipPin, window.__strokeMirrorPin,
                window.__splatVelK, window.__armColorPin, window.__faceTurnPin, window.__rakePin];
            try {
                // A shape we no longer have (deleted, or a peer's that left
                // with them) prints the built-in tip, never the one selected now
                const shape = (typeof i.shape === 'string') ? i.shape : null;
                const BS = window.BrushShapes;
                const have = !!(shape && BS && ((typeof BS.has === 'function' && BS.has(shape))
                    || (typeof BS.peerReady === 'function' && BS.peerReady(shape))));
                cfg.BRUSH_TIP = (typeof i.tip === 'number' && isFinite(i.tip)) ? Math.max(0, Math.min(4, i.tip | 0)) : 0;
                cfg.BRUSH_SHAPE_ID = have ? shape : null;
                window.__remoteStroke = shape ? !have : !!i.rs;
                cfg.BRUSH_ANGLE = (typeof i.ang === 'number' && isFinite(i.ang)) ? i.ang : 0;
                cfg.BRUSH_TIP_TEXTURE = (typeof i.tx === 'number' && isFinite(i.tx)) ? Math.max(0, Math.min(1, i.tx)) : 1;
                const p = (i.push && typeof i.push === 'object') ? i.push : null;
                cfg.BRUSH_VELOCITY_ONLY = !!p;
                if (p) {
                    cfg.BRUSH_VEL_MODE = (p.m === 'spread' || p.m === 'gather' || p.m === 'swirl') ? p.m : 'smudge';
                    cfg.BRUSH_VEL_STRENGTH = (typeof p.s === 'number' && isFinite(p.s)) ? Math.max(0, Math.min(5, p.s)) : 1;
                }
                window.__armPushPin = (typeof i.ap === 'number' && isFinite(i.ap)) ? (Math.abs(i.ap) | 0) : 0;
                window.__armTipPin = ((typeof window.sanitizeArmTipMap === 'function') ? window.sanitizeArmTipMap(i.atip) : null) || {};
                const mir = (typeof i.mir === 'number' && isFinite(i.mir)) ? (i.mir | 0) : 0;
                window.__strokeMirrorPin = (mir >= 1 && mir <= 3) ? mir : 0;
                let sym = (typeof i.sym === 'string') ? i.sym : 'radial';
                try {
                    if (window.ParamRegistry && window.ParamRegistry.coerceSelect) {
                        sym = window.ParamRegistry.coerceSelect('symmetryMode', sym) || 'radial';
                    }
                } catch (_) {}
                cfg.SYMMETRY_MODE = sym;
                cfg.SYM_SAME_ANGLE = !!i.sa;
                window.__faceTurnPin = (typeof i.ft === 'number' && isFinite(i.ft)) ? i.ft : 0;
                window.__rakePin = (Array.isArray(i.rk) && i.rk.length === 3 && i.rk.every(isFinite)) ? i.rk : null;
                window.__splatVelK = (typeof i.vk === 'number' && isFinite(i.vk) && i.vk > 0) ? Math.min(1, i.vk) : 1;
                // Flow through the live routing, like a Just-me dab's: under
                // Limit it sets the convergence, under Limit Off it scales
                const fl = (typeof i.fl === 'number' && isFinite(i.fl)) ? Math.max(0, Math.min(1, i.fl)) : 1;
                const c = (fl < 1 && typeof window.__applyPaintFlow === 'function') ? window.__applyPaintFlow(col, fl) : col;
                const mult = Math.max(1, Math.min(8, Math.round(+i.mult || 1)));
                let pin = null;
                if (!live && !i.ex) {
                    const k = (fl < 1 && !cfg.COLOR_GATE) ? fl : 1;
                    pin = { all: true };
                    for (let arm = 0; arm < mult; arm++) {
                        const v = (i.ac && Array.isArray(i.ac[arm]) && i.ac[arm].length >= 3) ? i.ac[arm] : col;
                        pin[arm] = [(+v[0] || 0) * k, (+v[1] || 0) * k, (+v[2] || 0) * k];
                    }
                }
                window.__armColorPin = pin;
                window.applyMultiSplatWith(x, y, +i.vx || 0, +i.vy || 0, c, mult,
                    (typeof i.radius === 'number' && isFinite(i.radius)) ? i.radius : undefined, !!i.ex, !!i.wf);
            } finally {
                cfg.BRUSH_TIP = saved[0]; cfg.BRUSH_SHAPE_ID = saved[1]; cfg.BRUSH_ANGLE = saved[2];
                cfg.BRUSH_TIP_TEXTURE = saved[3]; cfg.BRUSH_VELOCITY_ONLY = saved[4];
                cfg.BRUSH_VEL_MODE = saved[5]; cfg.BRUSH_VEL_STRENGTH = saved[6];
                cfg.SYMMETRY_MODE = saved[7]; cfg.SYM_SAME_ANGLE = saved[8];
                window.__remoteStroke = saved[9]; window.__armPushPin = saved[10];
                window.__armTipPin = saved[11]; window.__strokeMirrorPin = saved[12];
                window.__splatVelK = saved[13]; window.__armColorPin = saved[14];
                window.__faceTurnPin = saved[15]; window.__rakePin = saved[16];
                window.__splatFlow = 1;   // as after a live dab
            }
        }

        function recTogglePlaybackAll() {
            if (recIsPlayingAll) {
                recLayers.forEach(l => l.timeline.isPlaying = false);
                recIsPlayingAll = false;
            } else {
                const has = recLayers.some(l => l.timeline.interactions.length > 0);
                if (!has) return;
                recLayers.forEach(l => {
                    if (l.timeline.interactions.length > 0) {
                        const eff = recGetEffectiveDuration(l);
                        if (l.timeline.playbackPosition >= eff) l.timeline.playbackPosition = 0;
                        l.timeline.isPlaying = true;
                    }
                });
                recIsPlayingAll = true;
                recLastPlaybackTime = Date.now();
            }
            recUpdateButtonStates(); // PERF: lightweight update
        }
        
        function recStopPlayback() {
            recLayers.forEach(l => { l.timeline.isPlaying = false; l.timeline.playbackPosition = 0; });
            recIsPlayingAll = false;
            recUpdateButtonStates(); // PERF: lightweight update
        }

        function recStopAll() {
            // Stop countdown, recording, and playback
            recCancelCountdown();
            recStopRecording();
            recStopPlayback();
        }
        
        // ── Shared replay emitter ───────────────────────────────────────
        // Paints every interaction in (prevMs, currMs] from one track. A
        // "track" is anything carrying the replay-colour fields (colorMode /
        // recordMode / recordStepPalette) plus the _rep* scratch — a recorder
        // layer and a slot animation's track both qualify, so both get the
        // same colour handling, footprint pinning and push-dab behaviour.
        function recEmitTrackWindow(track, interactions, prevMs, currMs) {
            if (!interactions || !interactions.length) return;
            // Per-track replay color behavior (1.3, reworked 2026-07-18):
            //   'original' (default) — reproduce the record-time brush
            //        behavior: generative modes (random/rainbow/step)
            //        REGENERATE per stroke so a random recording keeps
            //        being random; fixed/main replay the baked colors.
            //   'exact' — the literal captured colors (frozen sequence).
            //   'live'  — defer to the CURRENT brush settings.
            // All final colors are computed here and applied with
            // exactColor=true: arm resolution freezes its per-stroke cache
            // during replay (no mouseup to advance it), so letting it run
            // would collapse a random recording to ONE frozen color — the
            // bug this rework fixes.
            const cMode = track.colorMode || 'original';
            let genMode = null, genPalette = null, liveSolid = null;
            if (cMode === 'original') {
                // 'rainbow' dropped from the generative set (removed
                // 2026-08-15, photosensitivity): old rainbow recordings
                // fall through to the non-generative baked-color path —
                // still colorful, but no fresh random color per splat.
                if (/^(random|step)$/.test(track.recordMode || '')) {
                    genMode = track.recordMode;
                    genPalette = track.recordStepPalette || null;
                }
            } else if (cMode === 'live') {
                const cm = (window.multiArmColors && window.multiArmColors[0] && window.multiArmColors[0].mode) || 'main';
                if (/^(random|step)$/.test(cm)) {
                    genMode = cm; // current palette (recGenerativeColor reads it live)
                } else if (cm === 'fixed' && window.multiArmColors[0].color) {
                    liveSolid = recHexToRgb(window.multiArmColors[0].color);
                } else {
                    liveSolid = (window.pointer && window.pointer.color) ? window.pointer.color.slice() : null;
                }
            }
            // Binary search for start index instead of O(n) filter
            let lo = 0, hi = interactions.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (interactions[mid].timestamp <= prevMs) lo = mid + 1;
                else hi = mid;
            }
            for (let idx = lo; idx < interactions.length; idx++) {
                const i = interactions[idx];
                if (i.timestamp > currMs) break;
                const x = i.x * canvas.width;
                const y = i.y * canvas.height;
                let replayColor;
                // A dab that carries rnd (Preserve Randomness) re-rolls
                // under 'original' even when the track-level recordMode
                // heuristic missed it — mode toggled mid-recording, or a
                // re-recorded replay. 'exact' stays the freeze escape
                // hatch; 'live' stays fully current-brush.
                const iGen = (cMode === 'original' && i.rnd) ? 'random' : genMode;
                if (cMode === 'exact') {
                    replayColor = i.color;
                } else if (iGen) {
                    // Regenerate per stroke: a change in the baked color
                    // marks a new stroke (random holds one color per stroke,
                    // rainbow changes per splat — both fall out naturally).
                    // Key on the DE-DIMMED colour: rnd dabs from a
                    // re-recorded replay carry per-dab flow shares in fm,
                    // so the raw baked colour changes every dab — de-
                    // dimming restores one key per stroke, and the fresh
                    // roll is re-dimmed by the same share.
                    const fm = (typeof i.fm === 'number' && isFinite(i.fm) && i.fm > 0) ? i.fm : 1;
                    const key = (((i.color[0] / fm) * 255) | 0) + ',' + (((i.color[1] / fm) * 255) | 0) + ',' + (((i.color[2] / fm) * 255) | 0);
                    if (key !== track._repKey) {
                        track._repKey = key;
                        track._repColor = recGenerativeColor(iGen, genPalette, track) || i.color;
                    }
                    replayColor = (fm !== 1)
                        ? [track._repColor[0] * fm, track._repColor[1] * fm, track._repColor[2] * fm]
                        : track._repColor;
                } else if (cMode === 'live') {
                    replayColor = liveSolid || i.color;
                } else { // original, non-generative → the baked colors
                    replayColor = i.color;
                }
                // A dab from an Everything take carries its whole context
                // and plays through its own pins. A programmatic source in
                // it (an animation, an audio scene) keeps its colour under
                // Current brush: it was never a brush stroke.
                if (i.tap) {
                    recEmitTapDab(i, x, y, i.ex ? i.color : replayColor, cMode === 'live' && !i.ex);
                    continue;
                }
                // The Flow the dab was painted at (recRecordInteraction), through
                // the live brush's own routing: under Limit it scales the
                // convergence and the colour stays true, under Limit Off it
                // scales the colour. Reset in the finally below.
                const _fl = (typeof i.fl === 'number' && isFinite(i.fl)) ? Math.max(0, Math.min(1, i.fl)) : 1;
                if (_fl < 1 && typeof window.__applyPaintFlow === 'function') {
                    replayColor = window.__applyPaintFlow(replayColor, _fl);
                }
                // Pin the footprint this dab was recorded with, the same
                // pin-then-restore stroke replay and peer dabs use. Only when
                // the interaction actually carries one: recordings made before
                // this existed have neither field and keep playing back gaussian,
                // which is exactly how they were painted.
                // Pressure counts toward the footprint pin, and has to:
                // splat() only honours a velocity-only dab on a user stroke
                // (the __brushTipOn gate), and _fp is what opens that gate
                // for a recorded one. Coerced against the known modes the
                // same way stroke replay coerces a peer's — a recording can
                // arrive through a .fluid import or a peer's snapshot.
                const _rp = (i.push && typeof i.push === 'object') ? i.push : null;
                const _rap = (typeof i.ap === 'number' && isFinite(i.ap)) ? (i.ap | 0) : 0;
                // Per-stroke mirror, range-checked like the mode strings above:
                // a recording can arrive through a .fluid import or a peer's
                // snapshot, and the value reaches the arm-transform builder.
                let _rmir = (typeof i.mir === 'number' && isFinite(i.mir)) ? (i.mir | 0) : 0;
                if (_rmir < 1 || _rmir > 3) _rmir = 0;
                // Per-arm tips, cleaned like the rest (05g sanitizeArmTipMap).
                const _ratip = (typeof window.sanitizeArmTipMap === 'function')
                    ? window.sanitizeArmTipMap(i.atip) : null;
                const _fp = (typeof i.tip === 'number') || !!i.shape || !!_rp || !!_rap || !!_rmir || !!_ratip;
                let _tipPrev, _shapePrev, _remotePrev, _pushPrev, _apPrev, _mirPrev, _atipPrev;
                if (_fp && window.config) {
                    _tipPrev = window.config.BRUSH_TIP;
                    _shapePrev = window.config.BRUSH_SHAPE_ID;
                    _remotePrev = window.__remoteStroke;
                    // Pinned whether or not the dab carries push, like stroke
                    // replay: reading absence as "leave mine alone" would
                    // repaint an ordinary recording as a silent push whenever
                    // the live brush happened to be in Pressure mode.
                    _pushPrev = [window.config.BRUSH_VELOCITY_ONLY,
                                 window.config.BRUSH_VEL_MODE,
                                 window.config.BRUSH_VEL_STRENGTH];
                    _apPrev = window.__armPushPin;
                    // Pinned unconditionally, like push and the arm mask: a dab
                    // with no `mir` was NOT mirrored, and reading absence as
                    // "leave the live pin alone" would fold an ordinary
                    // recording in half whenever a mirror-bound button was held
                    // while it played.
                    _mirPrev = window.__strokeMirrorPin;
                    window.__strokeMirrorPin = _rmir;
                    window.config.BRUSH_VELOCITY_ONLY = !!_rp;
                    if (_rp) {
                        window.config.BRUSH_VEL_MODE =
                            (_rp.m === 'spread' || _rp.m === 'gather' || _rp.m === 'swirl')
                                ? _rp.m : 'smudge';
                        window.config.BRUSH_VEL_STRENGTH =
                            (typeof _rp.s === 'number' && isFinite(_rp.s))
                                ? Math.max(0, Math.min(5, _rp.s)) : 1;
                    }
                    window.__armPushPin = _rap;
                    // Unconditional as well: {} = every arm printed the
                    // brush's tip, whatever the panel says now.
                    _atipPrev = window.__armTipPin;
                    window.__armTipPin = _ratip || {};
                    window.config.BRUSH_TIP = (typeof i.tip === 'number') ? (i.tip | 0) : 0;
                    // A shape we no longer have suppresses stamps outright rather
                    // than printing the recording in whatever shape is selected now.
                    const _have = !!(i.shape && window.BrushShapes
                        && typeof window.BrushShapes.has === 'function'
                        && window.BrushShapes.has(i.shape));
                    window.config.BRUSH_SHAPE_ID = _have ? i.shape : null;
                    window.__remoteStroke = !!i.shape && !_have;
                }
                try {
                if (typeof window.applyMultiSplatWith === 'function') {
                    window.applyMultiSplatWith(x, y, i.vx, i.vy, replayColor, i.mult || 1, (typeof i.radius === 'number') ? i.radius : undefined, true, _fp);
                } else {
                    const prevM = (typeof window.animationMultiplier === 'number') ? window.animationMultiplier : 1;
                    const prevR = window.config ? window.config.SPLAT_RADIUS : undefined;
                    window.animationMultiplier = Math.max(1, Math.round(i.mult || 1));
                    if (window.config && typeof i.radius === 'number') window.config.SPLAT_RADIUS = i.radius;
                    multiSplat(x, y, i.vx, i.vy, replayColor, false, true, _fp);
                    window.animationMultiplier = prevM;
                    if (window.config && typeof prevR === 'number') window.config.SPLAT_RADIUS = prevR;
                }
                } finally {
                    if (_fl < 1) window.__splatFlow = 1;   // as after a live dab
                    if (_fp && window.config) {
                        window.config.BRUSH_TIP = _tipPrev;
                        window.config.BRUSH_SHAPE_ID = _shapePrev;
                        window.__remoteStroke = _remotePrev;
                        window.config.BRUSH_VELOCITY_ONLY = _pushPrev[0];
                        window.config.BRUSH_VEL_MODE = _pushPrev[1];
                        window.config.BRUSH_VEL_STRENGTH = _pushPrev[2];
                        window.__armPushPin = _apPrev;
                        window.__armTipPin = _atipPrev;
                        window.__strokeMirrorPin = _mirPrev;
                    }
                }
            }
        }

        // PERF: Throttle the strip's clock during recording
        let _recHeadsLastUpdate = 0;
        const _recHeadsUpdateInterval = 100; // ms

        function recUpdatePlayback() {
            const now = Date.now();
            // ── Sim-clock playhead (2026-08-16) ─────────────────────────────
            // The playhead used to advance on the WALL clock while the fluid it
            // feeds advances on dt = min(rawDt, 16ms) × timeScale. Those are
            // two different clocks, and a recorded interaction is an impulse of
            // dye, not a rate — so at Time 0.25 the timeline handed the sim four
            // seconds of splats for every simulated second, piling deposits on
            // top of each other faster than the (now four-times-slower) field
            // could carry them away. That is the flat, over-saturated middle:
            // the outer structure was laid down at Time 1 and kept its detail,
            // the middle was drowned at low Time.
            //
            // Riding the sim's own dt puts every recorded splat back at the
            // simulated instant it was captured at, so a recording plays out
            // the SAME evolution at any Time setting — just slower in wall
            // time. It also stops a sub-60fps frame from over-depositing: the
            // physics clamps its step to 16ms, so a 33ms frame used to feed the
            // sim twice the dye it had time to move, at any Time setting.
            //
            // The cost is deliberate: playback wall-duration now stretches by
            // 1/timeScale (and under frame-rate load), because the timeline's
            // seconds are simulated seconds. config.REC_SIM_CLOCK = false
            // restores the old wall-clock playhead.
            const wallDelta = now - recLastPlaybackTime;
            const delta = ((window.config && window.config.REC_SIM_CLOCK === false)
                || typeof window.__simDtMs !== 'number')
                ? wallDelta
                : window.__simDtMs;
            let anyPlaying = false;
            let anyRecording = false;
            let takeFull = false;
            let ranOut = false;   // a part set to play once got to its end

            // The parts on the bench, playing under an Everything take, are
            // on the bench already: the tap (recTapDab) leaves them out.
            window.__recBenchPlaying = true;
            try {
                recLayers.forEach(layer => {
                    if (layer.timeline.isRecording) {
                        anyRecording = true;
                        if (recTakeElapsedWall(layer) >= recTakeCapMs(layer)) takeFull = true;
                    }
                    if (!layer.timeline.isPlaying || !layer.visible) return;
                    anyPlaying = true;
                    const eff = recGetEffectiveDuration(layer);
                    let prev = layer.timeline.playbackPosition;
                    if (!(prev < eff)) prev = 0;
                    let remaining = delta;
                    // The overshoot past the end carries into the next pass. It
                    // used to be dropped, so each loop ran up to a frame long and
                    // parts drifted apart over time. A stall never spins: past
                    // a few loops the rest is dropped.
                    let guard = 0;
                    while (remaining > 0 && guard++ < 8) {
                        const step = Math.min(remaining, eff - prev);
                        const curr = prev + step;
                        // A pass from 0 takes a dab stamped at 0 too (the
                        // window is (prev, curr]); one was never played.
                        recEmitTrackWindow(layer, layer.timeline.interactions, prev > 0 ? prev : -1, curr);
                        remaining -= step;
                        prev = curr;
                        if (prev >= eff) {
                            prev = 0;
                            // Fresh generative colors each loop ("keeps being random")
                            layer._repKey = null;
                            if (!layer.isLooping) {
                                layer.timeline.isPlaying = false;
                                ranOut = true;
                                break;
                            }
                        }
                    }
                    layer.timeline.playbackPosition = prev;
                });
            } finally {
                window.__recBenchPlaying = false;
            }
            recLastPlaybackTime = now;
            if (takeFull) recStopRecording();
            // Its ▶ and the Play buttons went on saying Pause until the next
            // click without this.
            if (ranOut) {
                if (recIsPlayingAll && !recLayers.some(l => l.timeline.isPlaying)) recIsPlayingAll = false;
                recUpdateButtonStates();
            }
            
            // PERF: Only update the strip's clock if something is actually
            // playing or recording, and throttle it during recording
            if (anyPlaying || anyRecording) {
                if (anyRecording) {
                    // Throttle during recording - only update every 100ms
                    if (now - _recHeadsLastUpdate >= _recHeadsUpdateInterval) {
                        _recHeadsLastUpdate = now;
                        recUpdateStripTime();
                    }
                } else {
                    recUpdateStripTime();
                }
            }
        }
        
        // PERF: Cache button DOM references
        let _recBtnCache = null;
        function _getRecBtns() {
            if (!_recBtnCache) {
                _recBtnCache = {
                    miniRec: document.getElementById('recMiniRecordBtn'),
                    miniPause: document.getElementById('recMiniPauseBtn'),
                    miniStop: document.getElementById('recMiniStopBtn')
                };
            }
            return _recBtnCache;
        }

        // Record button label: countdown digit, then "Recording" while it runs
        function _recRecordLabel(isRec) {
            if (recCountdownActive) return String(recCountdownVal || 3);
            return isRec ? 'Recording' : 'Record';
        }

        // PERF: Lightweight state update - only updates button states, no DOM rebuild
        function recUpdateButtonStates() {
            const a = recGetActiveLayer();
            const isRec = !!(a && a.timeline.isRecording);
            const isPlay = !!(a && a.timeline.isPlaying) || !!recIsPlayingAll;
            recSyncStrip(isRec);
            recSyncBodyState(isRec, isPlay);
        }

        // ── The record strip (top of Animations, 2026-10-04) ────────────
        // ● Record · ▶ Play · ■ Stop, the clock and the length chips.
        // It replaced Recording Mode Off / Minimized / Full: nothing is
        // captured until Record is pressed, so there is no Off to forget.
        // Play (and F8) runs every part together. A button with nothing to
        // act on is disabled rather than silent.
        const REC_LENGTHS = [4000, 8000, 15000, 30000];

        // The length a part records up to: its own cap, else the global one.
        function recPartCapMs(a) {
            return (a && typeof a.loopMaxMs === 'number' && a.loopMaxMs > 0) ? a.loopMaxMs : recMaxDurationMs;
        }

        // Anything for Esc to stop: a countdown, a part recording or playing.
        function recIsBusy() {
            return !!recCountdownActive || recLayers.some(l => l.timeline.isRecording || l.timeline.isPlaying);
        }

        // m:ss. A length goes to the nearest second but never below one, so
        // a half-second part reads 0:01, not 0:00, and an 8 s take that
        // stopped a frame late still reads 0:08.
        function recClock(ms, up) {
            const v = Math.max(0, (ms || 0) / 1000);
            const s = up ? (v > 0 ? Math.max(1, Math.round(v)) : 0) : Math.floor(v);
            return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }

        // "0:03 / 0:08": how far the take or the playhead is, against the
        // length it runs to. Written only when the text changes, since
        // playback calls this every frame.
        let _recStripTimeText = '';
        function recUpdateStripTime() {
            const el = document.getElementById('recMiniTime');
            if (!el) return;
            const a = recGetActiveLayer();
            const empty = !a || !a.timeline.interactions.length;
            let at = 0, of = empty ? recPartCapMs(a) : recMaxDurationMs;
            if (a && a.timeline.isRecording) {
                // The stopwatch the take stops on
                at = recTakeElapsedWall(a);
                of = recTakeCapMs(a);
            } else if (!recCountdownActive) {
                const p = (a && a.timeline.isPlaying) ? a : recLayers.find(l => l.timeline.isPlaying);
                if (p) { at = recShowMs(p, p.timeline.playbackPosition); of = recShowMs(p, recGetEffectiveDuration(p)); }
                else if (!empty) of = recShowMs(a, recGetEffectiveDuration(a));
            }
            const text = recClock(Math.min(at, of)) + ' / ' + recClock(of, true);
            if (text !== _recStripTimeText || el.textContent !== text) { _recStripTimeText = text; el.textContent = text; }
        }

        function recSyncStrip(isRec) {
            const btns = _getRecBtns();
            const anyPlaying = recLayers.some(l => l.timeline.isPlaying);
            const hasTake = recLayers.some(l => l.timeline.interactions.length > 0);
            const busy = isRec || !!recCountdownActive;
            if (btns.miniRec) {
                btns.miniRec.textContent = _recRecordLabel(isRec);
                btns.miniRec.classList.toggle('active', isRec);
            }
            if (btns.miniPause) {
                btns.miniPause.textContent = anyPlaying ? 'Pause' : 'Play';
                btns.miniPause.classList.toggle('active', anyPlaying);
                btns.miniPause.disabled = busy || (!anyPlaying && !hasTake);
            }
            if (btns.miniStop) btns.miniStop.disabled = !(busy || anyPlaying);
            // The length the NEXT take records for: a filled part's own
            // length is its loop now, and a take never lands on it.
            const act = recGetActiveLayer();
            const cap = (act && act.timeline.interactions.length) ? recMaxDurationMs : recPartCapMs(act);
            REC_LENGTHS.forEach(ms => {
                const chip = document.getElementById('recLen' + (ms / 1000));
                if (!chip) return;
                // A pick-one bank (role radio in index.html): checked, not pressed.
                chip.setAttribute('aria-checked', cap === ms ? 'true' : 'false');
                chip.disabled = isRec;
            });
            [['recSrcMe', 'single'], ['recSrcAll', 'all']].forEach(([id, v]) => {
                const chip = document.getElementById(id);
                if (!chip) return;
                chip.setAttribute('aria-pressed', recRecordSource === v ? 'true' : 'false');
                chip.disabled = busy;
            });
            const keepRow = document.getElementById('recKeepRow');
            if (keepRow) keepRow.style.display = recPendingTake ? 'flex' : 'none';
            recUpdateStripTime();
        }

        // Body classes drive the canvas badge; the countdown digit rides on
        // #canvas-area so the badge can read it ("REC 3…", styles.css).
        function recSyncBodyState(isRec, isPlay) {
            document.body.classList.toggle('rec-recording', isRec);
            document.body.classList.toggle('rec-playing', !isRec && isPlay);
            document.body.classList.toggle('rec-countdown', !!recCountdownActive);
            const area = document.getElementById('canvas-area');
            if (area) {
                if (recCountdownActive) area.setAttribute('data-rec-count', String(recCountdownVal || 3));
                else if (area.hasAttribute('data-rec-count')) area.removeAttribute('data-rec-count');
            }
        }

        // A chip sets the global length AND an empty active part's own cap:
        // the global one alone only reached parts made after it changed. A
        // filled part keeps its loop; the next take gets a part of its own
        // at the new length.
        function recSetLength(ms) {
            const a = recGetActiveLayer();
            if (a && a.timeline.isRecording) return;
            recMaxDurationMs = ms;
            if (a && !a.timeline.interactions.length) a.loopMaxMs = ms;
            recRenderUI();
        }

        // Just me · Everything: what the next take records (recTapDab). A
        // preference, kept at once like the slots; a take already running
        // keeps the one it started with.
        function recSetRecordSource(v) {
            if (recCountdownActive || recLayers.some(l => l.timeline.isRecording)) return;
            recRecordSource = (v === 'all') ? 'all' : 'single';
            const sm = window.settingsManager;
            if (sm && typeof sm.set === 'function') sm.set('recRecordSource', recRecordSource, false);
            recUpdateButtonStates();
        }

        // The strip's Play: every part together, or pause whatever plays.
        function recStripTogglePlay() {
            if (recLayers.some(l => l.timeline.isPlaying)) {
                recLayers.forEach(l => { l.timeline.isPlaying = false; });
                recIsPlayingAll = false;
                recUpdateButtonStates();
                return;
            }
            recTogglePlaybackAll();
        }

        // The parts show only through the strip and the canvas badge since
        // the animation editor went (2026-10-13). 05n and 15 still call this.
        function recRenderUI() {
            recUpdateButtonStates();
        }

        function recHexToRgb(hex) {
            if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return [1, 1, 1];
            return [
                parseInt(hex.slice(1, 3), 16) / 255,
                parseInt(hex.slice(3, 5), 16) / 255,
                parseInt(hex.slice(5, 7), 16) / 255
            ];
        }

        // Fresh replay color for a generative record/live mode (1.3 rework):
        // random → a new vibrant color; step → the next palette entry
        // (record-time palette for 'original', current for 'live'). Non-
        // generative modes never call this. Per-layer step index on the layer.
        function recGenerativeColor(mode, palette, layer) {
            if (mode === 'random') {
                return window.generateVibrantColor ? window.generateVibrantColor()
                    : [Math.random(), Math.random(), Math.random()];
            }
            if (mode === 'step') {
                var list = (palette && palette.length) ? palette
                    : (typeof getStepColorList === 'function' ? getStepColorList() : []);
                if (!list || !list.length) return null;
                if (typeof layer._repStep !== 'number') layer._repStep = 0;
                var hex = list[layer._repStep % list.length];
                layer._repStep++;
                return recHexToRgb(hex);
            }
            return null;
        }

        // Human-readable labels for the color-mode dropdown on the Saved
        // Animations library's rows. The names say what each one keeps:
        // the record-time MODE (re-rolled), the record-time OUTPUT (frozen),
        // or nothing at all (whatever the brush is set to right now).
        var REC_COLOR_MODES = [
            { v: 'original', label: 'As painted', tip: 'The brush as it was set: random colors roll fresh each loop' },
            { v: 'exact', label: 'Exact colors', tip: 'The exact colors that were painted, every loop' },
            { v: 'live', label: 'Current brush', tip: 'Whatever the brush is set to now' }
        ];

        // Migrate saved color-mode values to the reworked set (2026-07-18):
        // old 'recorded' → 'exact'; old 'layer'/'live'/absent → 'original'
        // (the new default, which preserves the recorded brush behavior).
        function recMigrateColorMode(v) {
            if (v === 'original' || v === 'exact' || v === 'live') return v;
            if (v === 'recorded') return 'exact';
            return 'original';
        }

        function recGetEffectiveDuration(layer) {
            if (!layer) return 0;
            const base = Math.max(0, layer.timeline && layer.timeline.duration || 0);
            const loop = (typeof layer.loopMaxMs === 'number' && layer.loopMaxMs > 0) ? layer.loopMaxMs : null;
            const eff = (loop !== null) ? Math.min(base, loop) : base;
            return Math.max(1, eff);
        }

        function recGenJellyfishPreset() {
            const out = [];
            const w = Math.max(1, canvas.width || 1200);
            const h = Math.max(1, canvas.height || 800);
            const originX = 0.5;
            const originY = 0.9;
            const pulses = 5;
            const steps = 14;
            const baseVel = -0.012 * h;
            let t = 0;
            for (let p = 0; p < pulses; p++) {
                const pulseColor = [Math.random(), Math.random(), Math.random()];
                for (let i = 0; i < steps; i++) {
                    const u = i / (steps - 1);
                    const easing = 1 - Math.pow(1 - u, 2);
                    const spread = easing * 0.08 * (Math.random() - 0.5);
                    const x = originX + spread;
                    const y = originY - easing * 0.28;
                    const dx = spread * w * 0.12;
                    const dy = baseVel * (1 - u * 0.6);
                    out.push({ timestamp: t + i * 28, x, y, vx: dx, vy: dy, color: pulseColor, mult: 1, radius: 0.006 });
                }
                t += 260;
            }
            return { interactions: out, duration: t + steps * 28 };
        }

        function recGenPortraitPreset() {
            const out = [];
            const w = Math.max(1, canvas.width || 1200);
            const h = Math.max(1, canvas.height || 800);
            const cx = 0.5, cy = 0.75 * (h / h);
            let t = 0;
            function curve(ax, ay, bx, by, cx2, cy2, steps, color, dt = 16, radius = 0.008) {
                let lastX = null, lastY = null;
                for (let i = 0; i <= steps; i++) {
                    const u = i / steps;
                    const mt = 1 - u;
                    const x = mt * mt * ax + 2 * mt * u * bx + u * u * cx2;
                    const y = mt * mt * ay + 2 * mt * u * by + u * u * cy2;
                    const xn = x, yn = y; // already normalized inputs
                    let dx = 0, dy = 0;
                    if (lastX !== null) { dx = (xn - lastX) * w * 0.8; dy = (yn - lastY) * h * 0.8; }
                    out.push({ timestamp: t + i * dt, x: xn, y: yn, vx: dx, vy: dy, color, mult: 1, radius });
                    lastX = xn; lastY = yn;
                }
                t += steps * dt + 120;
            }
            // Left shoulder
            curve(0.15, 0.5, 0.3, 0.7, 0.5 - 0.04, 0.75, 28, [0.1, 0.3, 0.9], 18, 0.010);
            // Right shoulder
            curve(0.85, 0.5, 0.7, 0.7, 0.5 + 0.04, 0.75, 28, [0.9, 0.5, 0.1], 18, 0.010);
            // Head
            curve(0.5, 0.2, 0.5 - 0.03, 0.5, 0.5, 0.75 - 0.06, 32, [0.9, 0.2, 0.3], 16, 0.008);
            // Left eye
            curve(0.35, 0.35, 0.4, 0.6, 0.5 - 0.03, 0.75 - 0.05, 22, [0.1, 0.9, 0.3], 16, 0.004);
            // Right eye
            curve(0.65, 0.35, 0.6, 0.6, 0.5 + 0.03, 0.75 - 0.05, 22, [0.8, 0.1, 0.8], 16, 0.004);
            // Left swoop
            curve(0.05, 0.95, 0.2, 0.85, 0.5 - 0.015, 0.25, 34, [0.2, 0.8, 0.9], 16, 0.006);
            // Right swoop
            curve(0.95, 0.95, 0.8, 0.85, 0.5 + 0.015, 0.25, 34, [0.9, 0.8, 0.2], 16, 0.006);
            // Finale upward pull
            for (let i = 0; i <= 36; i++) {
                const u = i / 36;
                const x = 0.5 + (Math.random() - 0.5) * 0.02;
                const y = 0.85 - u * 0.6;
                const dx = (Math.random() - 0.5) * 2;
                const dy = -0.010 * h * (1 - u * 0.6);
                out.push({ timestamp: t + i * 22, x, y, vx: dx, vy: dy, color: [0.9, 0.1, 0.2], mult: 1, radius: 0.005 });
            }
            t += 36 * 22;
            return { interactions: out, duration: t + 300 };
        }

        // Smash and Vortex left 2026-10-04: the user makes what they want to see.
        const recBuiltinPresetGenerators = {
            "Jellyfish": () => recGenJellyfishPreset(),
            "Portrait": () => recGenPortraitPreset()
        };

        function recComputeDurationFromInteractions(interactions) {
            let d = 0;
            (Array.isArray(interactions) ? interactions : []).forEach(i => { d = Math.max(d, i && i.timestamp || 0); });
            return d;
        }

        // ── Takes on disk, packed (2026-10-14) ──────────────────────────
        // A take holds hundreds of dabs a second, and as objects a dab was
        // ~250 characters (a Just-me dab's full-length floats) or ~110 (an
        // Everything dab), so a few long takes filled the browser's ~5 MB.
        // Saved, every take becomes columns ('rec2'): each number field in
        // REC_COLS as whole steps of its unit, stored as the step from the
        // dab before (or the step's own change, recEncCol), a run of the
        // same step folded into one, 7 bits a byte, base64. On simulated
        // 30 s takes a Just-me one went from ~1.2 MB to ~40 KB, and an
        // Everything one to a quarter of its 'tap1' size. What holds still
        // through a stroke (arm count, tip, shape, push...) goes in a table
        // the dabs index. Dabs are rounded to the same units as they are
        // painted (recQuantizeDab), so a kept take plays back exactly as it
        // did on the bench; the units sit below what the canvas can show.
        // 'tap1' (2026-10-13, Everything takes only) and plain arrays still
        // load.
        const REC_COLS = [
            ['timestamp', 100], ['x', 1e5], ['y', 1e5], ['vx', 100], ['vy', 100],
            ['color', 1e6, 3], ['radius', 1e7], ['fl', 1e7], ['vk', 1e7], ['fm', 1000],
            ['ft', 1e4], ['ang', 100], ['tx', 1000], ['rk', 1e4, 3]
        ];
        const REC_COL_SPEC = {};
        REC_COLS.forEach(c => { REC_COL_SPEC[c[0]] = c; });
        const REC_INT_MAX = 2 ** 48;   // past this a value rides the table whole

        // A dab's number fields, rounded to the units its columns keep
        function recQuantizeDab(d) {
            for (let c = 0; c < REC_COLS.length; c++) {
                const key = REC_COLS[c][0], s = REC_COLS[c][1], k = REC_COLS[c][2] || 0;
                const v = d[key];
                if (!k) {
                    if (typeof v === 'number' && isFinite(v)) d[key] = Math.round(v * s) / s;
                } else if (Array.isArray(v) && v.length === k) {
                    for (let e = 0; e < k; e++) if (typeof v[e] === 'number' && isFinite(v[e])) v[e] = Math.round(v[e] * s) / s;
                }
            }
            return d;
        }

        // Whole numbers to text. A step either way is zigzagged so a small
        // one is a small number; a token's low bit says a run count follows.
        function recEncInts(vals) {
            const bytes = [];
            const put = u => { while (u >= 128) { bytes.push(u % 128 + 128); u = Math.floor(u / 128); } bytes.push(u); };
            let prev = 0;
            for (let j = 0; j < vals.length;) {
                const d = vals[j] - prev;
                let run = 1;
                while (j + run < vals.length && vals[j + run] - vals[j + run - 1] === d) run++;
                const z = d >= 0 ? d * 2 : -d * 2 - 1;
                if (run > 1) { put(z * 2 + 1); put(run - 2); } else put(z * 2);
                prev = vals[j + run - 1];
                j += run;
            }
            let bin = '';
            for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, bytes.slice(j, j + 0x8000));
            return btoa(bin);
        }

        // A column is its values' steps, or, when that comes out shorter,
        // the steps of the steps ('~'): position and velocity change
        // smoothly, so their steps change by little.
        function recEncCol(vals) {
            const one = recEncInts(vals);
            const steps = vals.map((v, j) => v - (j ? vals[j - 1] : 0));
            const two = '~' + recEncInts(steps);
            return two.length < one.length ? two : one;
        }
        function recDecCol(s, n) {
            if (typeof s !== 'string' || s.charAt(0) !== '~') return recDecInts(s, n);
            const out = recDecInts(s.slice(1), n);
            for (let j = 1; j < out.length; j++) out[j] += out[j - 1];
            return out;
        }

        // And back: never more than n numbers, whatever a file says
        function recDecInts(s, n) {
            const out = [];
            let bin;
            try { bin = atob(typeof s === 'string' ? s : ''); } catch (_) { return out; }
            let pos = 0, prev = 0;
            const get = () => {
                let u = 0, m = 1, c;
                do { c = bin.charCodeAt(pos++); u += (c % 128) * m; m *= 128; } while (c >= 128 && pos < bin.length);
                return u;
            };
            while (pos < bin.length && out.length < n) {
                const t = get();
                const run = (t % 2) ? Math.min(get() + 2, n - out.length) : 1;
                const z = Math.floor(t / 2);
                const d = (z % 2) ? -(z + 1) / 2 : z / 2;
                for (let r = 0; r < run; r++) { prev += d; out.push(prev); }
            }
            return out;
        }

        // A field that is missing, or not a number its column can hold,
        // is marked absent in the column (`has`) and rides the dab's table
        // row as it was, so nothing comes back changed.
        function recPackInteractions(list) {
            if (!Array.isArray(list) || !list.length || !list.every(i => i && typeof i === 'object' && !Array.isArray(i))) return list;
            const n = list.length;
            const vals = REC_COLS.map(c => Array.from({ length: c[2] || 1 }, () => []));
            const seen = REC_COLS.map(() => []);
            const ctx = [], ctxIx = new Map(), ki = [];
            for (let j = 0; j < n; j++) {
                const i = list[j];
                const rest = {};
                for (const key in i) if (!REC_COL_SPEC[key] && i[key] !== undefined) rest[key] = i[key];
                for (let c = 0; c < REC_COLS.length; c++) {
                    const key = REC_COLS[c][0], s = REC_COLS[c][1], k = REC_COLS[c][2] || 0;
                    const v = i[key];
                    if (v === undefined) { seen[c].push(0); continue; }
                    const parts = k ? ((Array.isArray(v) && v.length === k) ? v : null) : [v];
                    const ints = parts && parts.map(e => (typeof e === 'number' && isFinite(e)) ? Math.round(e * s) : NaN);
                    if (ints && ints.every(q => Math.abs(q) <= REC_INT_MAX)) {
                        seen[c].push(1);
                        for (let e = 0; e < ints.length; e++) vals[c][e].push(ints[e]);
                    } else {
                        seen[c].push(0);
                        rest[key] = v;
                    }
                }
                const kk = JSON.stringify(rest);
                let ix = ctxIx.get(kk);
                if (ix === undefined) { ix = ctx.length; ctx.push(rest); ctxIx.set(kk, ix); }
                ki.push(ix);
            }
            const p = { pack: 'rec2', n, cols: {}, ctx, ki: recEncInts(ki) };
            REC_COLS.forEach((c, ci) => {
                const got = vals[ci][0].length;
                if (!got) return;
                p.cols[c[0]] = [c[1]].concat(vals[ci].map(recEncCol));
                if (got < n) (p.has || (p.has = {}))[c[0]] = recEncInts(seen[ci]);
            });
            return p;
        }

        function recUnpackRec2(p) {
            // Every dab has a table row, so a file cannot claim more dabs
            // than its rows hold
            const ki = recDecInts(p.ki, Math.max(0, Math.min(Math.floor(+p.n) || 0, 2e6)));
            const n = ki.length;
            const out = new Array(n);
            for (let j = 0; j < n; j++) out[j] = {};
            const cols = (p.cols && typeof p.cols === 'object') ? p.cols : {};
            Object.keys(cols).forEach(key => {
                const c = cols[key];
                const s = Array.isArray(c) ? +c[0] : 0;
                if (!(s > 0) || c.length < 2) return;
                const streams = c.slice(1).map(t => recDecCol(t, n));
                const arr = streams.length > 1 || !!(REC_COL_SPEC[key] && REC_COL_SPEC[key][2]);
                const present = (p.has && p.has[key] != null) ? recDecInts(p.has[key], n) : null;
                for (let j = 0, q = 0; j < n; j++) {
                    if (present && !present[j]) continue;
                    out[j][key] = arr ? streams.map(st => st[q] / s) : streams[0][q] / s;
                    q++;
                }
            });
            const ctx = Array.isArray(p.ctx) ? p.ctx : [];
            for (let j = 0; j < n; j++) {
                const k = ctx[ki[j] | 0];
                if (k && typeof k === 'object') Object.assign(out[j], k);
            }
            return out;
        }

        // Back to dab objects. A plain array is returned as it is. `cache`
        // keeps the result against the packed object for the library, which
        // normalizes every stored animation each time it is listed; callers
        // that go on to change the array ask for a fresh one.
        const _recUnpacked = new WeakMap();
        function recUnpackInteractions(p, cache) {
            if (Array.isArray(p)) return p;
            if (!p || typeof p !== 'object' || (p.pack !== 'rec2' && p.pack !== 'tap1')) return [];
            if (cache && _recUnpacked.has(p)) return _recUnpacked.get(p);
            const out = (p.pack === 'rec2') ? recUnpackRec2(p) : recUnpackTap1(p);
            if (cache) _recUnpacked.set(p, out);
            return out;
        }

        // The first packing (Everything takes, 2026-10-13), read only
        function recUnpackTap1(p) {
            if (!Array.isArray(p.t)) return [];
            const n = p.t.length;
            const col = Array.isArray(p.col) ? p.col : [], ctx = Array.isArray(p.ctx) ? p.ctx : [];
            const out = new Array(n);
            let ti = 0, xi = 0, yi = 0;
            for (let j = 0; j < n; j++) {
                ti += +p.t[j] || 0; xi += +(p.x && p.x[j]) || 0; yi += +(p.y && p.y[j]) || 0;
                const c = col[p.ci ? p.ci[j] : 0];
                const d = {
                    timestamp: ti / 100, x: xi / 1e5, y: yi / 1e5,
                    vx: (+(p.vx && p.vx[j]) || 0) / 100, vy: (+(p.vy && p.vy[j]) || 0) / 100,
                    color: Array.isArray(c) ? c.slice(0, 3) : [1, 1, 1]
                };
                const k = ctx[p.ki ? p.ki[j] : 0];
                if (k && typeof k === 'object') Object.assign(d, k);
                d.tap = 1;
                if (p.fl && p.fl[j] !== 1e6) d.fl = p.fl[j] / 1e6;
                if (p.vk && p.vk[j] !== 1e6) d.vk = p.vk[j] / 1e6;
                if (p.ft && p.ft[j]) d.ft = p.ft[j] / 1e4;
                if (p.rk && Array.isArray(p.rk[j])) d.rk = p.rk[j];
                out[j] = d;
            }
            return out;
        }
        window.recPackInteractions = recPackInteractions;
        window.recUnpackInteractions = recUnpackInteractions;

        // A stored animation (either shape recNormalizePreset reads) with
        // every track in 'rec2', as a copy, or null when there is nothing to
        // change. A track that does not unpack to as many dabs as it had
        // stays as it was.
        function recRepackAnimation(data) {
            if (!data || typeof data !== 'object') return null;
            const rows = Array.isArray(data.layers) ? data.layers : [data];
            if (!rows.some(r => r && r.interactions && r.interactions.pack !== 'rec2')) return null;
            const out = JSON.parse(JSON.stringify(data));
            let changed = false;
            (Array.isArray(out.layers) ? out.layers : [out]).forEach(r => {
                if (!r || !r.interactions || r.interactions.pack === 'rec2') return;
                const list = recUnpackInteractions(r.interactions);
                const p = recPackInteractions(list);
                if (p === list || recUnpackInteractions(p).length !== list.length) return;
                r.interactions = p;
                changed = true;
            });
            return changed ? out : null;
        }
        window.recRepackAnimation = recRepackAnimation;

        // One track's own length, capped by its loop Max the way
        // recGetEffectiveDuration caps a live layer's.
        function recTrackEffectiveDuration(t) {
            const base = Math.max(0, (t && t.duration) || 0);
            const loop = (t && typeof t.loopMaxMs === 'number' && t.loopMaxMs > 0) ? t.loopMaxMs : null;
            return Math.max(1, (loop !== null) ? Math.min(base, loop) : base);
        }

        // A preset holds the WHOLE performance — every layer that had
        // something in it — as {version:2, layers:[...]}. v1 presets (and the
        // builtin generators) are a single flat {interactions, duration},
        // which normalizes to a one-track preset, so old saves keep loading.
        function recNormalizePreset(data) {
            if (!data || typeof data !== 'object') return null;
            let raw;
            if (Array.isArray(data.layers) && data.layers.length) raw = data.layers;
            // A plain array, or packed (a v1 save that was packed again)
            else if (data.interactions && typeof data.interactions === 'object') raw = [data];
            else return null;
            const tracks = [];
            raw.forEach((l, idx) => {
                const src = l ? recUnpackInteractions(l.interactions, true) : null;
                if (!src || !src.length) return;
                const interactions = src.slice();
                tracks.push({
                    name: (typeof l.name === 'string' && l.name) ? l.name : `Part ${idx + 1}`,
                    interactions,
                    duration: (typeof l.duration === 'number' && l.duration > 0)
                        ? l.duration : recComputeDurationFromInteractions(interactions),
                    loopMaxMs: (typeof l.loopMaxMs === 'number') ? l.loopMaxMs : undefined,
                    simRate: (typeof l.simRate === 'number') ? l.simRate : undefined,
                    colorMode: recMigrateColorMode(l.colorMode),
                    recordMode: (typeof l.recordMode === 'string') ? l.recordMode : 'main',
                    recordStepPalette: Array.isArray(l.recordStepPalette) ? l.recordStepPalette.slice() : null
                });
            });
            if (!tracks.length) return null;
            // The performance runs as long as its longest layer.
            let duration = 0;
            tracks.forEach(t => { duration = Math.max(duration, recTrackEffectiveDuration(t)); });
            return { tracks, duration: Math.max(1, duration) };
        }

        // ── Where saved animations live ──────────────────────────────────
        // In a browser: settingsManager keys recPreset.<name>, inside the
        // ~5 MB this site gets, shared with presets, brush shapes and the
        // rest. On desktop: 12b's AnimationVault, a file per animation in
        // an Animations folder beside the Presets vault, with no quota.
        // Both answer the same calls. put() and rename() say 'full' only
        // for the browser's quota; a desktop write that fails is false.
        const REC_KEY = 'recPreset.';
        const recWebStore = {
            all() {
                const sm = window.settingsManager;
                const all = (sm && typeof sm.getAll === 'function') ? sm.getAll() : {};
                const out = {};
                Object.keys(all).forEach(key => { if (key.startsWith(REC_KEY)) out[key.slice(REC_KEY.length)] = all[key]; });
                return out;
            },
            has(name) {
                const sm = window.settingsManager;
                return !!sm && typeof sm.has === 'function' && sm.has(REC_KEY + name);
            },
            get(name) {
                const sm = window.settingsManager;
                return (sm && this.has(name)) ? sm.get(REC_KEY + name) : null;
            },
            put(name, data) {
                const sm = window.settingsManager;
                if (!sm) return false;
                // set() reports a full localStorage as false
                return sm.set(REC_KEY + name, data, false) ? true : 'full';
            },
            remove(name) {
                const sm = window.settingsManager;
                if (!sm || !this.has(name)) return false;
                return sm.remove(REC_KEY + name);
            },
            // The copy first while there is room for two. A nearly full store
            // takes the old one out first, and back in if the copy still
            // does not fit.
            rename(from, to) {
                const sm = window.settingsManager;
                if (!sm || !this.has(from)) return false;
                const stored = JSON.parse(JSON.stringify(this.get(from)));
                if (sm.set(REC_KEY + to, stored, false)) { sm.remove(REC_KEY + from); return true; }
                sm.remove(REC_KEY + from);
                if (sm.set(REC_KEY + to, stored, false)) return true;
                sm.set(REC_KEY + from, stored, false);
                return 'full';
            }
        };
        function recStore() {
            const v = window.AnimationVault;
            return (v && v.available) ? v : recWebStore;
        }

        // Animations kept before rec2 take far more room than they need.
        // In a browser they are packed again in place once, after boot;
        // desktop packs them as it moves them to files (12b).
        let _recRepackDone = false;
        function recRepackStoredOnce() {
            if (_recRepackDone || recStore() !== recWebStore) return;
            _recRepackDone = true;
            const all = recWebStore.all();
            Object.keys(all).forEach(name => {
                try {
                    const packed = recRepackAnimation(all[name]);
                    if (packed) recWebStore.put(name, packed);
                } catch (e) { console.warn('Repacking animation "' + name + '" failed:', e); }
            });
        }

        function recListLocalPresets() {
            const all = recStore().all();
            const out = {};
            Object.keys(all).forEach(name => {
                const preset = recNormalizePreset(all[name]);
                if (preset) out[name] = preset;
            });
            return out;
        }

        // The library changed (kept, renamed, deleted). The sidebar's
        // Animations section mirrors it (slots + Saved Animations).
        function recLibraryChanged() {
            try { window.dispatchEvent(new CustomEvent('recPresetsChanged')); } catch (_) {}
        }

        // ── Names ────────────────────────────────────────────────────────
        // A saved animation is a name in recStore(). A name that is taken
        // bumps ("Animation 2", "Sunset 3") instead of refusing.
        function recIsStoredAnimation(name) {
            return recStore().has(name);
        }
        function recNameTaken(name) {
            return recIsStoredAnimation(name) || Object.prototype.hasOwnProperty.call(recBuiltinPresetGenerators, name);
        }
        function recFreeName(name) {
            name = String(name || '').trim().slice(0, 60) || 'Animation';
            if (!recNameTaken(name)) return name;
            const m = /^(.*?)\s+(\d+)$/.exec(name);
            const stem = m ? m[1] : name;
            let n = m ? parseInt(m[2], 10) + 1 : 2;
            while (recNameTaken(`${stem} ${n}`)) n++;
            return `${stem} ${n}`;
        }
        // Keep's own name: "Animation N", the lowest N not taken.
        function recAutoName() {
            let n = 1;
            while (recNameTaken(`Animation ${n}`)) n++;
            return `Animation ${n}`;
        }

        function recGetPresetByName(name) {
            const map = recListLocalPresets();
            if (map[name]) return map[name];
            const gen = recBuiltinPresetGenerators[name];
            if (typeof gen === 'function') return recNormalizePreset(gen());
            return null;
        }

        // A packed track, or a copy of one that cannot be packed
        function recPackForSave(list) {
            const p = recPackInteractions(list);
            return (p === list) ? list.map(i => ({ ...i })) : p;
        }

        // Save the whole stack, not just the selected layer: a performance is
        // every layer that has something in it, and recalling one from a slot
        // should bring back what the artist actually made. Empty layers are
        // dropped so a stray empty part doesn't pad the preset. A taken name
        // reports 'exists'.
        function recSaveAllLayersAsPreset(name) {
            if (!name) return false;
            const filled = recLayers.filter(l => l && l.timeline && (l.timeline.interactions || []).length > 0);
            if (!filled.length) return 'empty';
            const layers = filled.map(l => ({
                name: l.name,
                interactions: recPackForSave(l.timeline.interactions || []),
                duration: l.timeline.duration || recComputeDurationFromInteractions(l.timeline.interactions),
                loopMaxMs: (typeof l.loopMaxMs === 'number') ? l.loopMaxMs : undefined,
                simRate: (typeof l.simRate === 'number') ? l.simRate : undefined,
                colorMode: l.colorMode || 'original',
                recordMode: l.recordMode || 'main',
                recordStepPalette: Array.isArray(l.recordStepPalette) ? l.recordStepPalette.slice() : null
            }));
            let duration = 0;
            layers.forEach(l => { duration = Math.max(duration, recTrackEffectiveDuration(l)); });
            const store = recStore();
            if (store.has(name)) return 'exists';
            // A failed write used to be ignored, so a take that never landed
            // still said it was saved.
            const res = store.put(name, { version: 2, layers, duration: Math.max(1, duration) });
            return (res === true || res === 'full') ? res : false;
        }

        // ── Slot animations: an independent, looping transport ──────────
        // A slot animation is NOT the recorder. It keeps its own playhead and
        // loops until it is clicked again, and it never touches recLayers,
        // recIsPlayingAll or the transport buttons — so recording and layer
        // playback stay exactly as the artist left them while one runs. It
        // rides the same sim clock and the same emitter as layer replay, so
        // colours, footprint pins and push dabs behave identically.
        const recAnimPlayers = new Map(); // name -> { tracks, duration, position }
        let recAnimLastTime = Date.now();

        function recAnimNotify() {
            try { window.dispatchEvent(new CustomEvent('recAnimPlaybackChanged')); } catch (_) {}
        }

        function recStartSavedAnimation(name) {
            const preset = name ? recGetPresetByName(name) : null;
            if (!preset) return false;
            recAnimPlayers.set(name, {
                // Own scratch per player: two slots holding the same recording
                // generate their own colours instead of sharing one cache.
                tracks: preset.tracks.map(t => ({
                    interactions: t.interactions,
                    colorMode: t.colorMode,
                    recordMode: t.recordMode,
                    recordStepPalette: t.recordStepPalette,
                    endMs: recTrackEffectiveDuration(t)
                })),
                duration: Math.max(1, preset.duration),
                position: 0
            });
            recAnimNotify();
            return true;
        }

        function recStopSavedAnimation(name) {
            const had = recAnimPlayers.delete(name);
            if (had) recAnimNotify();
            return had;
        }

        function recStopAllSavedAnimations() {
            if (!recAnimPlayers.size) return false;
            recAnimPlayers.clear();
            recAnimNotify();
            return true;
        }

        function recIsSavedAnimationPlaying(name) { return recAnimPlayers.has(name); }

        function recToggleSavedAnimation(name) {
            if (recAnimPlayers.has(name)) { recStopSavedAnimation(name); return false; }
            return recStartSavedAnimation(name);
        }

        // Ticked every frame from the update loop, whatever the recorder is
        // doing (see 05j), with nothing recording.
        function recAnimTick() {
            const now = Date.now();
            const wallDelta = now - recAnimLastTime;
            recAnimLastTime = now;
            if (!recAnimPlayers.size) return;
            // Same sim-clock playhead as layer playback (see recUpdatePlayback)
            const delta = ((window.config && window.config.REC_SIM_CLOCK === false)
                || typeof window.__simDtMs !== 'number')
                ? wallDelta
                : window.__simDtMs;
            if (!(delta > 0)) return;
            recAnimPlayers.forEach(p => {
                let remaining = delta;
                // A stall (or a very short loop) must not spin here: whole
                // loops beyond a few are dropped rather than replayed.
                let guard = 0;
                while (remaining > 0 && guard++ < 8) {
                    const prev = p.position;
                    const step = Math.min(remaining, p.duration - prev);
                    const curr = prev + step;
                    for (let k = 0; k < p.tracks.length; k++) {
                        const t = p.tracks[k];
                        // A short track inside a longer performance finishes
                        // and waits for the loop point, like a layer does.
                        if (prev >= t.endMs) continue;
                        recEmitTrackWindow(t, t.interactions, prev > 0 ? prev : -1, Math.min(curr, t.endMs));
                    }
                    remaining -= step;
                    p.position = curr;
                    if (p.position >= p.duration) {
                        p.position = 0;
                        // Fresh generative colors each loop ("keeps being random")
                        for (let k = 0; k < p.tracks.length; k++) p.tracks[k]._repKey = null;
                    }
                }
            });
        }

        // Deleting has no undo (in a browser it is gone; desktop moves the
        // file to the Animations folder's .trash), so every caller confirms
        // first. Builtins aren't stored and simply report false. A playing
        // copy is stopped rather than left looping against a recording that
        // no longer exists.
        function recDeleteSavedAnimation(name) {
            if (!name) return false;
            const store = recStore();
            if (!store.has(name)) return false;
            recStopSavedAnimation(name);
            if (!store.remove(name)) return false;
            // recLibraryChanged fires recPresetsChanged for the sidebar;
            // the delete event additionally lets it prune slots that pointed
            // here, which a generic refresh must never do on its own.
            recLibraryChanged();
            try {
                window.dispatchEvent(new CustomEvent('recAnimationDeleted', { detail: { name } }));
            } catch (_) {}
            return true;
        }

        // Rename moves the stored key and everything that names it: a copy
        // playing in a slot and (through recAnimationRenamed, js/20) the
        // slots. A taken name bumps. Returns the name it ended up with,
        // 'full', or false.
        function recRenameSavedAnimation(from, to) {
            to = String(to == null ? '' : to).trim().slice(0, 60);
            if (!from || !to) return false;
            if (to === from) return from;
            const store = recStore();
            if (!store.has(from)) return false;   // builtins and strays
            const name = recFreeName(to);
            const res = store.rename(from, name);
            if (res === 'full') {
                recStripSay("Couldn't rename it: storage is full.");
                return 'full';
            }
            if (res !== true) return false;
            if (recAnimPlayers.has(from)) {
                const p = recAnimPlayers.get(from);
                recAnimPlayers.delete(from);
                recAnimPlayers.set(name, p);
            }
            try {
                window.dispatchEvent(new CustomEvent('recAnimationRenamed', { detail: { from, to: name } }));
            } catch (_) {}
            recLibraryChanged();
            return name;
        }

        function recIsBuiltinAnimation(name) {
            return Object.prototype.hasOwnProperty.call(recBuiltinPresetGenerators, name);
        }

        // ── A saved animation's replay colour mode, after the fact ───────
        // Saving froze whatever the recorder's Colors dropdown happened to
        // read, and nothing could reach it again: the dropdown edits a
        // recorder LAYER, and a saved animation is a copy that no layer owns
        // any more. So the library row carries its own copy of that dropdown,
        // and these two are what it reads and writes.
        //
        // A performance can hold several tracks, each saved with its own
        // mode. The row shows one control, so it reports the first track's
        // mode and writes to ALL of them — one animation, one colour policy,
        // which is how it reads on screen.
        function recGetSavedAnimationColorMode(name) {
            const preset = name ? recGetPresetByName(name) : null;
            if (!preset || !preset.tracks.length) return 'original';
            return recMigrateColorMode(preset.tracks[0].colorMode);
        }

        // Writes through immediately (user-authored content does not ride
        // Save Settings) and retunes a copy that is playing RIGHT NOW, so the
        // change is visible in the loop the artist is watching rather than
        // the next time they start it. Builtins are generated, not stored,
        // so they have nothing to write to and report false.
        function recSetSavedAnimationColorMode(name, mode) {
            if (!name) return false;
            mode = recMigrateColorMode(mode);
            const store = recStore();
            if (!store.has(name)) return false;
            const stored = store.get(name);
            if (!stored || typeof stored !== 'object') return false;
            // Both shapes on disk: v2 wraps a layers[] array, the original
            // single-track form IS the track.
            const rows = Array.isArray(stored.layers) ? stored.layers
                : ((stored.interactions && typeof stored.interactions === 'object') ? [stored] : null);
            if (!rows) return false;
            rows.forEach(r => { if (r && typeof r === 'object') r.colorMode = mode; });
            store.put(name, stored);
            // Live retune. _repKey/_repStep are the generative scratch: clearing
            // them re-seeds on the next dab instead of holding the colour the
            // old mode had cached.
            const player = recAnimPlayers.get(name);
            if (player) {
                player.tracks.forEach(t => { t.colorMode = mode; t._repKey = null; t._repStep = 0; });
            }
            try {
                window.dispatchEvent(new CustomEvent('recAnimationColorModeChanged', { detail: { name, mode } }));
            } catch (_) {}
            return true;
        }

        window.recRenameSavedAnimation = recRenameSavedAnimation;
        window.recKeepTake = recKeepTake;
        window.recDiscardTake = recDiscardTake;
        window.recForgetBench = recForgetBench;
        window.recDeleteSavedAnimation = recDeleteSavedAnimation;
        window.recGetSavedAnimationColorMode = recGetSavedAnimationColorMode;
        window.recSetSavedAnimationColorMode = recSetSavedAnimationColorMode;
        window.recIsBuiltinAnimation = recIsBuiltinAnimation;
        window.recToggleSavedAnimation = recToggleSavedAnimation;
        window.recStopSavedAnimation = recStopSavedAnimation;
        window.recStopAllSavedAnimations = recStopAllSavedAnimations;
        window.recIsSavedAnimationPlaying = recIsSavedAnimationPlaying;
        window.recListSavedAnimations = function () {
            return Object.keys(recListLocalPresets()).sort();
        };

        function setupRecUI() {
            // The record strip is the whole recorder since the animation
            // editor went (2026-10-13); #recMode went with it.
            const recMiniRecordBtn = document.getElementById('recMiniRecordBtn');
            const recMiniPauseBtn = document.getElementById('recMiniPauseBtn');
            const recMiniStopBtn = document.getElementById('recMiniStopBtn');

            // Capture is always armed: a dab only lands in a part while that
            // part is recording, so there is nothing for an Off to protect.
            recEnabled = true;

            // There is always a part to record into
            if (recLayers.length === 0) recAddLayer();
            recRenderUI();

    // The strip
    if (recMiniRecordBtn) recMiniRecordBtn.addEventListener('click', recToggleRecord);
    if (recMiniPauseBtn) recMiniPauseBtn.addEventListener('click', recStripTogglePlay);
    if (recMiniStopBtn) recMiniStopBtn.addEventListener('click', recStopAll);
    REC_LENGTHS.forEach(ms => {
        const chip = document.getElementById('recLen' + (ms / 1000));
        if (chip) chip.addEventListener('click', () => recSetLength(ms));
    });
    {
        const sm = window.settingsManager;
        const saved = (sm && typeof sm.get === 'function') ? sm.get('recRecordSource', 'single') : 'single';
        recRecordSource = (saved === 'all') ? 'all' : 'single';
    }
    [['recSrcMe', 'single'], ['recSrcAll', 'all']].forEach(([id, v]) => {
        const chip = document.getElementById(id);
        if (chip) chip.addEventListener('click', () => recSetRecordSource(v));
    });
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('recKeepBtn', recKeepTake);
    bind('recDiscardBtn', recDiscardTake);

    recLibraryChanged();
    try { window.addEventListener('load', () => recLibraryChanged()); } catch(_){}
    setTimeout(recRepackStoredOnce, 3000);
        }
