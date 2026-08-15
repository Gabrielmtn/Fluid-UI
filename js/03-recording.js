        function recScheduleRender() {
            if (recRenderQueued) return;
            recRenderQueued = true;
            requestAnimationFrame(() => {
                recRenderQueued = false;
                recRenderUI();
            });
        }

        // Throttled timeline UI refresh — limits expensive canvas redraws
        // PERF: During recording, only update heads (cheap). Full redraw on stop.
        let _recRefreshQueued = false;
        let _recRefreshLastTime = 0;
        const _recRefreshInterval = 200; // ms between timeline redraws (was 100)
        const _recRefreshIntervalRecording = 500; // slower during recording to reduce lag
        function recThrottledRefreshUI() {
            if (_recRefreshQueued) return;
            const now = performance.now();
            const a = recGetActiveLayer();
            const isRecording = a && a.timeline.isRecording;
            const interval = isRecording ? _recRefreshIntervalRecording : _recRefreshInterval;
            const elapsed = now - _recRefreshLastTime;
            if (elapsed >= interval) {
                _recRefreshLastTime = now;
                // PERF: During recording, only update playhead position (very cheap)
                if (isRecording) {
                    recUpdateHeadsUI();
                } else {
                    recRefreshTimelinesUI();
                }
            } else {
                _recRefreshQueued = true;
                setTimeout(() => {
                    _recRefreshQueued = false;
                    _recRefreshLastTime = performance.now();
                    const aInner = recGetActiveLayer();
                    if (aInner && aInner.timeline.isRecording) {
                        recUpdateHeadsUI();
                    } else {
                        recRefreshTimelinesUI();
                    }
                }, interval - elapsed);
            }
        }
        
        function recParseTime(str) {
            if (str === undefined || str === null) return 10000;
            let s = String(str).trim();
            if (s.endsWith('.')) s = s.slice(0, -1);
            // Accept mm:ss:ms with flexible seconds and ms digits (e.g., 00:3:000)
            const parts = s.split(':');
            if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
                const mm = parseInt(parts[0], 10) || 0;
                const ss = parseInt(parts[1], 10) || 0;
                let ms = parseInt(parts[2], 10) || 0;
                ms = Math.max(0, Math.min(999, ms));
                return (mm * 60 + ss) * 1000 + ms;
            }
            if (/^\d+(\.\d+)?$/.test(s)) {
                // seconds as float
                return Math.round(parseFloat(s) * 1000);
            }
            return 10000;
        }

        function recFormatTime(ms) {
            ms = Math.max(0, Math.floor(ms || 0));
            const totalSec = Math.floor(ms / 1000);
            const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
            const ss = (totalSec % 60).toString().padStart(2, '0');
            const mms = (ms % 1000).toString().padStart(3, '0');
            return `${mm}:${ss}:${mms}`;
        }
        
        function recGetActiveLayer() {
            return recLayers.find(l => l.id === recActiveLayerId);
        }
        
        function recSetActiveLayer(id) {
            recActiveLayerId = id;
            recRenderUI();
        }
        let recLayerMaxTimers = {};
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
        
        function recStartRecording() {
            let a = recGetActiveLayer();
            if (!a) { recAddLayer(); a = recGetActiveLayer(); }
            if (!a) return;
            a.timeline.isRecording = true;
            a.timeline.recordingStartTime = Date.now() - a.timeline.playbackPosition;
            a.timeline.duration = recMaxDurationMs;
            // Capture the brush's color mode at record start so 'Original Mode'
            // can reproduce it on replay (random keeps being random, etc.)
            var _arm0 = (window.multiArmColors && window.multiArmColors[0]) ? window.multiArmColors[0] : null;
            a.recordMode = (_arm0 && _arm0.mode) ? _arm0.mode : 'main';
            a.recordStepPalette = (a.recordMode === 'step' && typeof getStepColorList === 'function')
                ? getStepColorList().slice() : null;
            a._repKey = null;
            if (a.timeline.isPlaying) a.timeline.isPlaying = false;
            recUpdateButtonStates(); // PERF: lightweight - no DOM rebuild during recording
            
            // Schedule auto-stop at max duration
            recClearAutoStopTimer();
            const layerMaxMs = (typeof a.loopMaxMs === 'number' && a.loopMaxMs > 0) ? a.loopMaxMs : recMaxDurationMs;
            const remaining = layerMaxMs - a.timeline.playbackPosition;
            if (remaining > 0) {
                _recAutoStopTimerId = setTimeout(function() {
                    _recAutoStopTimerId = null;
                    const current = recGetActiveLayer();
                    if (current && current.timeline.isRecording) {
                        recStopRecording();
                    }
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
            const a = recGetActiveLayer();
            if (!a) return;
            if (a.timeline.isRecording) {
                a.timeline.isRecording = false;
                a.timeline.duration = 0;
                a.timeline.interactions.forEach(i => { a.timeline.duration = Math.max(a.timeline.duration, i.timestamp); });
            }
            // PERF: Full UI refresh now that recording stopped
            recRenderUI();
            recRefreshTimelinesUI(); // Redraw timelines with all interactions
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
                name: name || `Layer ${id}`,
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
        
        function recDuplicateActiveLayer() {
            const a = recGetActiveLayer();
            if (!a) return;
            const nl = recCreateLayer(a.name + ' Copy');
            nl.timeline.interactions = JSON.parse(JSON.stringify(a.timeline.interactions));
            nl.timeline.duration = a.timeline.duration;
            nl.isLooping = a.isLooping;
            nl.loopMaxMs = a.loopMaxMs;
            nl.colorMode = a.colorMode || 'original';
            nl.recordMode = a.recordMode || 'main';
            nl.recordStepPalette = a.recordStepPalette ? a.recordStepPalette.slice() : null;
            // Copy mask data
            if (a.mask) {
                nl.mask = JSON.parse(JSON.stringify(a.mask));
            }
            recRenderUI();
        }
        
        function recDeleteActiveLayer() {
            if (recLayers.length <= 1) { alert('Cannot delete the last layer'); return; }
            const idx = recLayers.findIndex(l => l.id === recActiveLayerId);
            if (idx >= 0) {
                recLayers.splice(idx, 1);
                recActiveLayerId = recLayers[0] ? recLayers[0].id : null;
                recRenderUI();
            }
        }
        
        function recToggleLayerVisibility(id) {
            const l = recLayers.find(x => x.id === id);
            if (!l) return;
            l.visible = !l.visible;
            recRenderUI();
        }
        
        function recToggleLayerLoop(id) {
            const l = recLayers.find(x => x.id === id);
            if (!l) return;
            l.isLooping = !l.isLooping;
            recRenderUI();
        }
        
        function recToggleLayerPlayback(id) {
            const l = recLayers.find(x => x.id === id);
            if (!l) return;
            if (l.timeline.isPlaying) {
                l.timeline.isPlaying = false;
            } else {
                if (l.timeline.interactions.length === 0) return;
                const eff = recGetEffectiveDuration(l);
                if (l.timeline.playbackPosition >= eff) l.timeline.playbackPosition = 0;
                l.timeline.isPlaying = true;
                recLastPlaybackTime = Date.now();
            }
            recRenderUI();
        }
        
        function recToggleRecord() {
            // Clicking during countdown cancels it
            if (recCountdownActive) { recCancelCountdown(); return; }
            const a = recGetActiveLayer();
            if (a && a.timeline.isRecording) {
                recStopRecording();
                return;
            }
            // Start a 3-2-1 countdown before recording
            recStartCountdown(3);
        }
        
        function recRecordInteraction(x, y, dx, dy, colorArray) {
            if (!recEnabled) return;
            const a = recGetActiveLayer();
            if (!a || !a.timeline.isRecording) return;
            const timestamp = Date.now() - a.timeline.recordingStartTime;
            const layerMaxMs = (typeof a.loopMaxMs === 'number' && a.loopMaxMs > 0) ? a.loopMaxMs : recMaxDurationMs;
            if (timestamp > layerMaxMs) {
                a.timeline.isRecording = false;
                a.timeline.duration = 0;
                a.timeline.interactions.forEach(i => { a.timeline.duration = Math.max(a.timeline.duration, i.timestamp); });
                recRenderUI();
                return;
            }
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
            const interaction = { timestamp, x: x / canvas.width, y: y / canvas.height, vx: dx, vy: dy, color: colorArray.slice(), mult, radius };
            a.timeline.interactions.push(interaction);
            // PERF: During recording, skip ALL UI updates - just record data
            // Timeline visualization updates when recording stops
        }
        
        function recTogglePlayback() {
            const a = recGetActiveLayer();
            if (!a) return;
            if (a.timeline.isPlaying) {
                a.timeline.isPlaying = false;
            } else {
                if (a.timeline.interactions.length === 0) return;
                recLayers.forEach(l => { if (l.id !== a.id) l.timeline.isPlaying = false; });
                const eff = recGetEffectiveDuration(a);
                if (a.timeline.playbackPosition >= eff) a.timeline.playbackPosition = 0;
                a.timeline.isPlaying = true;
                recIsPlayingAll = false;
                recLastPlaybackTime = Date.now();
            }
            recUpdateButtonStates(); // PERF: lightweight update
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
        
        // PERF: Throttle heads UI updates during recording
        let _recHeadsLastUpdate = 0;
        const _recHeadsUpdateInterval = 100; // ms
        
        function recUpdatePlayback() {
            const now = Date.now();
            const delta = now - recLastPlaybackTime;
            let anyPlaying = false;
            let anyRecording = false;
            
            recLayers.forEach(layer => {
                if (layer.timeline.isRecording) anyRecording = true;
                if (!layer.timeline.isPlaying || !layer.visible) return;
                anyPlaying = true;
                const scaledDelta = delta * recPlaybackSpeed;
                layer.timeline.playbackPosition += scaledDelta;
                const eff = recGetEffectiveDuration(layer);
                const currentTime = layer.timeline.playbackPosition;
                const prevTime = currentTime - scaledDelta;
                const cappedPrev = Math.min(prevTime, eff);
                const cappedCurr = Math.min(currentTime, eff);
                // Per-layer replay color behavior (1.3, reworked 2026-07-18):
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
                const cMode = layer.colorMode || 'original';
                let genMode = null, genPalette = null, liveSolid = null;
                if (cMode === 'original') {
                    if (/^(random|rainbow|step)$/.test(layer.recordMode || '')) {
                        genMode = layer.recordMode;
                        genPalette = layer.recordStepPalette || null;
                    }
                } else if (cMode === 'live') {
                    const cm = (window.multiArmColors && window.multiArmColors[0] && window.multiArmColors[0].mode) || 'main';
                    if (/^(random|rainbow|step)$/.test(cm)) {
                        genMode = cm; // current palette (recGenerativeColor reads it live)
                    } else if (cm === 'fixed' && window.multiArmColors[0].color) {
                        liveSolid = recHexToRgb(window.multiArmColors[0].color);
                    } else {
                        liveSolid = (window.pointer && window.pointer.color) ? window.pointer.color.slice() : null;
                    }
                }
                // Binary search for start index instead of O(n) filter
                const interactions = layer.timeline.interactions;
                let lo = 0, hi = interactions.length;
                while (lo < hi) {
                    const mid = (lo + hi) >>> 1;
                    if (interactions[mid].timestamp <= cappedPrev) lo = mid + 1;
                    else hi = mid;
                }
                for (let idx = lo; idx < interactions.length; idx++) {
                    const i = interactions[idx];
                    if (i.timestamp > cappedCurr) break;
                    // Check if this interaction passes through the layer's mask
                    if (typeof window.checkMaskPoint === 'function' && !window.checkMaskPoint(layer.id, i.x, i.y)) {
                        continue; // Skip this interaction if masked out
                    }
                    const x = i.x * canvas.width;
                    const y = i.y * canvas.height;
                    let replayColor;
                    if (cMode === 'exact') {
                        replayColor = i.color;
                    } else if (genMode) {
                        // Regenerate per stroke: a change in the baked color
                        // marks a new stroke (random holds one color per stroke,
                        // rainbow changes per splat — both fall out naturally).
                        const key = ((i.color[0] * 255) | 0) + ',' + ((i.color[1] * 255) | 0) + ',' + ((i.color[2] * 255) | 0);
                        if (key !== layer._repKey) {
                            layer._repKey = key;
                            layer._repColor = recGenerativeColor(genMode, genPalette, layer) || i.color;
                        }
                        replayColor = layer._repColor;
                    } else if (cMode === 'live') {
                        replayColor = liveSolid || i.color;
                    } else { // original, non-generative → the baked colors
                        replayColor = i.color;
                    }
                    if (typeof window.applyMultiSplatWith === 'function') {
                        window.applyMultiSplatWith(x, y, i.vx, i.vy, replayColor, i.mult || 1, (typeof i.radius === 'number') ? i.radius : undefined, true);
                    } else {
                        const prevM = (typeof window.animationMultiplier === 'number') ? window.animationMultiplier : 1;
                        const prevR = window.config ? window.config.SPLAT_RADIUS : undefined;
                        window.animationMultiplier = Math.max(1, Math.round(i.mult || 1));
                        if (window.config && typeof i.radius === 'number') window.config.SPLAT_RADIUS = i.radius;
                        multiSplat(x, y, i.vx, i.vy, replayColor, false, true);
                        window.animationMultiplier = prevM;
                        if (window.config && typeof prevR === 'number') window.config.SPLAT_RADIUS = prevR;
                    }
                }
                if (layer.timeline.playbackPosition >= eff) {
                    if (layer.isLooping) {
                        layer.timeline.playbackPosition = 0;
                    } else {
                        layer.timeline.isPlaying = false;
                        layer.timeline.playbackPosition = 0;
                    }
                    // Fresh generative colors each loop ("keeps being random")
                    layer._repKey = null;
                }
            });
            recLastPlaybackTime = now;
            
            // PERF: Only update heads UI if something is actually playing or recording
            // and throttle during recording to reduce DOM overhead
            if (anyPlaying || anyRecording) {
                if (anyRecording) {
                    // Throttle during recording - only update every 100ms
                    if (now - _recHeadsLastUpdate >= _recHeadsUpdateInterval) {
                        _recHeadsLastUpdate = now;
                        recUpdateHeadsUI();
                    }
                } else {
                    recUpdateHeadsUI();
                }
            }
        }
        
        // PERF: Cache button DOM references
        let _recBtnCache = null;
        function _getRecBtns() {
            if (!_recBtnCache) {
                _recBtnCache = {
                    rec: document.getElementById('recRecordBtn'),
                    play: document.getElementById('recPlayBtn'),
                    playAll: document.getElementById('recPlayAllBtn'),
                    miniRec: document.getElementById('recMiniRecordBtn'),
                    miniPause: document.getElementById('recMiniPauseBtn'),
                    miniPlayAll: document.getElementById('recMiniPlayAllBtn')
                };
            }
            return _recBtnCache;
        }
        
        // PERF: Lightweight state update - only updates button states, no DOM rebuild
        function recUpdateButtonStates() {
            const a = recGetActiveLayer();
            const isRec = !!(a && a.timeline.isRecording);
            const isPlay = !!(a && a.timeline.isPlaying) || !!recIsPlayingAll;
            const btns = _getRecBtns();
            
            // Full panel buttons
            if (btns.rec) {
                btns.rec.textContent = recCountdownActive ? String(recCountdownVal || 3) : '⏺ Record';
                btns.rec.classList.toggle('active', isRec);
            }
            if (btns.play) {
                btns.play.textContent = a && a.timeline.isPlaying ? '⏸ Pause' : '▶ Play Layer';
                btns.play.classList.toggle('active', !!(a && a.timeline.isPlaying));
            }
            if (btns.playAll) btns.playAll.textContent = recIsPlayingAll ? '⏸⏸ Pause All' : '▶▶ Play All';
            
            // Mini panel buttons
            if (btns.miniRec) {
                btns.miniRec.textContent = recCountdownActive ? String(recCountdownVal || 3) : '⏺ Record';
                btns.miniRec.classList.toggle('active', isRec);
            }
            if (btns.miniPause) {
                btns.miniPause.textContent = a && a.timeline.isPlaying ? '⏸ Pause' : '▶ Play';
                btns.miniPause.classList.toggle('active', !!(a && a.timeline.isPlaying));
            }
            if (btns.miniPlayAll) btns.miniPlayAll.textContent = recIsPlayingAll ? '⏸⏸ Pause All' : '▶▶ Play All';
            
            // Body state classes
            document.body.classList.toggle('rec-recording', isRec);
            document.body.classList.toggle('rec-playing', !isRec && isPlay);
            document.body.classList.toggle('rec-countdown', !!recCountdownActive);
        }

        function recRenderUI() {
            // Clear cached DOM refs since we're rebuilding
            recClearCachedElements();
            
            const list = document.getElementById('recLayersList');
            if (!list) return;
            list.innerHTML = '';
            recLayers.forEach(layer => {
                const el = document.createElement('div');
                el.className = 'rec-item' + (layer.id === recActiveLayerId ? ' active-layer' : '');
                el.setAttribute('data-id', layer.id);
                el.setAttribute('data-action', 'set-active');
                const hasMask = layer.mask?.shapes?.length > 0;
                el.innerHTML = `
                    <div class="layer-item-header">
                        <div class="layer-thumbnail" style="background: linear-gradient(135deg, rgba(100,200,255,0.4), rgba(150,100,255,0.4)); display:flex; align-items:center; justify-content:center; font-size: 18px;">🎬</div>
                        <div class="layer-info">
                            <input type="text" class="layer-title" value="${window.escHtml(layer.name)}" data-action="rename" data-id="${layer.id}">
                        </div>
                        <div class="layer-controls">
                            <button class="layer-btn" data-action="toggle-visibility" data-id="${layer.id}">${layer.visible ? '👁️' : '👁️‍🗨️'}</button>
                            <button class="layer-btn" data-action="toggle-play" data-id="${layer.id}">${layer.timeline.isPlaying ? '⏸' : '▶'}</button>
                            <button class="layer-btn" data-action="toggle-loop" data-id="${layer.id}">${layer.isLooping ? '🔁' : '⏹'}</button>
                            <button class="layer-btn layer-mask-btn ${hasMask ? 'has-mask' : ''} ${layer.mask?.enabled ? 'active' : ''}" data-action="toggle-mask-enable" data-id="${layer.id}" title="${hasMask ? (layer.mask?.enabled ? 'Disable Mask' : 'Enable Mask') : 'No mask defined'}">✂️</button>
                        </div>
                    </div>
                    <div id="recLayerMeta-${layer.id}" style="font-size:12px; opacity:0.85; margin-bottom:4px;">${layer.timeline.interactions.length} interactions | ${(recGetEffectiveDuration(layer)/1000).toFixed(1)}s${layer.mask?.enabled ? ' | 🎭 Masked' : ''}</div>
                    ${hasMask ? `
                    <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
                        <button class="mask-control-btn" data-action="edit-mask" data-id="${layer.id}" title="Edit Mask">✏️ Edit Mask</button>
                        <button class="mask-control-btn mask-clear-btn" data-action="clear-mask" data-id="${layer.id}" title="Clear Mask">🗑️ Clear</button>
                        <span style="font-size:11px; opacity:0.7;">${layer.mask.shapes.length} shape${layer.mask.shapes.length !== 1 ? 's' : ''}</span>
                    </div>
                    ` : `
                    <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px;">
                        <button class="mask-control-btn mask-create-btn" data-action="edit-mask" data-id="${layer.id}" title="Create Mask">✂️ Create Mask</button>
                    </div>
                    `}
                    <div class="layer-max-row" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                        <label style="font-size:11px; opacity:0.85;">Max
                            <input type="text" class="time-input layer-max" data-id="${layer.id}" value="${recFormatTime((typeof layer.loopMaxMs === 'number' ? layer.loopMaxMs : (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : layer.timeline.duration || 0)))}" style="margin-left:6px; width:110px;">
                        </label>
                    </div>
                    <div class="layer-colormode-row">
                        <label>Colors</label>
                        <select class="rec-color-mode" data-id="${layer.id}" title="How replay colors this layer's splats">
                            ${REC_COLOR_MODES.map(m => `<option value="${m.v}" ${(layer.colorMode || 'original') === m.v ? 'selected' : ''}>${m.label}</option>`).join('')}
                        </select>
                    </div>
                    <canvas id="recMiniTimeline-${layer.id}" class="rec-mini-timeline"></canvas>
                `;
                list.appendChild(el);
                // If user is editing this input, preserve their typed value across rerenders
                const pending = layer._pendingLoopMaxStr;
                if (typeof pending === 'string') {
                    const inp = el.querySelector(`input.layer-max[data-id="${layer.id}"]`);
                    if (inp) inp.value = pending;
                }
            });
            const recordBtn = document.getElementById('recRecordBtn');
            const recordMultiBtn = document.getElementById('recMultiRecordBtn');
            const playBtn = document.getElementById('recPlayBtn');
            const playAllBtn = document.getElementById('recPlayAllBtn');
            const a = recGetActiveLayer();
            if (recordBtn) recordBtn.textContent = recCountdownActive ? String(recCountdownVal || 3) : '⏺ Record';
            if (playBtn) playBtn.textContent = a && a.timeline.isPlaying ? '⏸ Pause' : '▶ Play Layer';
            if (playAllBtn) playAllBtn.textContent = recIsPlayingAll ? '⏸⏸ Pause All' : '▶▶ Play All';
            if (recordBtn) recordBtn.classList.toggle('active', !!(a && a.timeline.isRecording));
            if (recordMultiBtn) recordMultiBtn.classList.toggle('active', recIsMultiEnabled());
            if (playBtn) playBtn.classList.toggle('active', !!(a && a.timeline.isPlaying));
            recRefreshTimelinesUI();
            recBindLayerListEvents();

            // Sync minimized UI
            const mini = document.getElementById('recMini');
            const recDrawerElState = document.getElementById('recDrawer');
            const miniRecBtn = document.getElementById('recMiniRecordBtn');
            const miniMultiBtn = document.getElementById('recMiniMultiBtn');
            const miniPauseBtn = document.getElementById('recMiniPauseBtn');
            const miniPlayAllBtn = document.getElementById('recMiniPlayAllBtn');
            if (miniRecBtn) miniRecBtn.textContent = recCountdownActive ? String(recCountdownVal || 3) : '⏺ Record';
            if (miniPauseBtn) miniPauseBtn.textContent = a && a.timeline.isPlaying ? '⏸ Pause' : '▶ Play';
            if (miniPlayAllBtn) miniPlayAllBtn.textContent = recIsPlayingAll ? '⏸⏸ Pause All' : '▶▶ Play All';
            if (miniRecBtn) miniRecBtn.classList.toggle('active', !!(a && a.timeline.isRecording));
            if (miniMultiBtn) miniMultiBtn.classList.toggle('active', recIsMultiEnabled());
            if (miniPauseBtn) miniPauseBtn.classList.toggle('active', !!(a && a.timeline.isPlaying));
            if (miniPlayAllBtn) miniPlayAllBtn.classList.toggle('active', !!recIsPlayingAll);
            if (mini) {
                mini.classList.toggle('rec-recording', !!(a && a.timeline.isRecording));
                mini.classList.toggle('rec-countdown', !!recCountdownActive);
            }
            if (recDrawerElState) {
                recDrawerElState.classList.toggle('rec-recording', !!(a && a.timeline.isRecording));
                recDrawerElState.classList.toggle('rec-playing', !!(a && a.timeline.isPlaying));
                recDrawerElState.classList.toggle('rec-countdown', !!recCountdownActive);
            }
            // Propagate state to body for global CSS feedback (canvas glow, etc.)
            var isRec = !!(a && a.timeline.isRecording);
            var isPlay = !!(a && a.timeline.isPlaying) || !!recIsPlayingAll;
            document.body.classList.toggle('rec-recording', isRec);
            document.body.classList.toggle('rec-playing', !isRec && isPlay);
            document.body.classList.toggle('rec-countdown', !!recCountdownActive);
            const miniStatus = document.getElementById('recMiniLayerStatus');
            if (miniStatus) {
                const total = recLayers.length || 0;
                const idx0 = a ? recLayers.findIndex(l => l.id === a.id) : -1;
                const idx = (idx0 >= 0 ? (idx0 + 1) : 0);
                miniStatus.textContent = (total > 0 && idx > 0) ? `${idx}/${total}` : '0/0';
            }
            recSyncMiniColorMode();
        }

        function recBindLayerListEvents() {
            const list = document.getElementById('recLayersList');
            if (!list || list._recBound) return;
            list.addEventListener('click', (e) => {
                // Avoid re-render-on-click when interacting with inputs/selects/buttons inside a layer card
                if (e.target.closest('input, textarea, select, button')) return;
                const target = e.target.closest('[data-action]');
                if (!target) return;
                const action = target.getAttribute('data-action');
                const id = parseInt(target.getAttribute('data-id'), 10);
                if (!isFinite(id)) return;
                e.stopPropagation();
                if (action === 'toggle-visibility') {
                    const layer = recLayers.find(l => l.id === id);
                    if (layer) { layer.visible = !layer.visible; recScheduleRender(); }
                } else if (action === 'toggle-play') {
                    if (recActiveLayerId !== id) recSetActiveLayer(id);
                    recTogglePlayback();
                } else if (action === 'toggle-loop') {
                    const layer = recLayers.find(l => l.id === id);
                    if (layer) { layer.isLooping = !layer.isLooping; recScheduleRender(); }
                } else if (action === 'toggle-mask-enable') {
                    const layer = recLayers.find(l => l.id === id);
                    if (layer && layer.mask) {
                        layer.mask.enabled = !layer.mask.enabled;
                        recScheduleRender();
                    }
                } else if (action === 'edit-mask') {
                    if (typeof window.enterMaskMode === 'function') {
                        window.enterMaskMode(id);
                    }
                } else if (action === 'clear-mask') {
                    const layer = recLayers.find(l => l.id === id);
                    if (layer && layer.mask) {
                        if (confirm('Clear mask for this layer?')) {
                            layer.mask.shapes = [];
                            layer.mask.enabled = false;
                            recScheduleRender();
                        }
                    }
                } else if (action === 'set-active') {
                    const container = e.target.closest('.rec-item');
                    const cid = container ? parseInt(container.getAttribute('data-id'), 10) : id;
                    if (isFinite(cid)) recSetActiveLayer(cid);
                }
            });
            list.addEventListener('change', (e) => {
                const input = e.target.closest('input.layer-title[data-action="rename"]');
                if (input) {
                    const id = parseInt(input.getAttribute('data-id'), 10);
                    const layer = recLayers.find(l => l.id === id);
                    if (layer) { layer.name = input.value; recScheduleRender(); }
                    return;
                }
                const modeSel = e.target.closest('select.rec-color-mode');
                if (modeSel) {
                    const id = parseInt(modeSel.getAttribute('data-id'), 10);
                    const layer = recLayers.find(l => l.id === id);
                    if (layer) {
                        layer.colorMode = modeSel.value;
                        layer._repKey = null; // re-seed generative replay colors
                        recSyncMiniColorMode();
                    }
                    return;
                }
            });
            function commitLayerMax(inputEl) {
                const id = parseInt(inputEl.getAttribute('data-id'), 10);
                const layer = recLayers.find(l => l.id === id);
                if (!layer) return;
                const ms = recParseTime(inputEl.value);
                layer.loopMaxMs = Math.max(1, ms || (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : layer.timeline.duration || 10000));
                if (layer.timeline.playbackPosition > recGetEffectiveDuration(layer)) layer.timeline.playbackPosition = 0;
                // Redraw preview/heads without rebuilding list to preserve focus
                inputEl.value = recFormatTime(layer.loopMaxMs);
                const meta = document.getElementById(`recLayerMeta-${id}`);
                if (meta) meta.textContent = `${layer.timeline.interactions.length} interactions | ${(recGetEffectiveDuration(layer)/1000).toFixed(1)}s`;
                if (isFinite(id) && recLayerMaxTimers[id]) { clearTimeout(recLayerMaxTimers[id]); delete recLayerMaxTimers[id]; }
                if (layer._pendingLoopMaxStr) delete layer._pendingLoopMaxStr;
                recRefreshTimelinesUI();
            }
            list.addEventListener('input', (e) => {
                const input = e.target.closest('input.layer-max');
                if (!input) return;
                const id = parseInt(input.getAttribute('data-id'), 10);
                const layer = recLayers.find(l => l.id === id);
                if (layer) layer._pendingLoopMaxStr = input.value;
                if (isFinite(id) && recLayerMaxTimers[id]) { clearTimeout(recLayerMaxTimers[id]); }
                recLayerMaxTimers[id] = setTimeout(() => commitLayerMax(input), 2000);
            });
            list.addEventListener('blur', (e) => {
                const input = e.target.closest('input.layer-max');
                if (!input) return;
                const id = parseInt(input.getAttribute('data-id'), 10);
                if (isFinite(id) && recLayerMaxTimers[id]) { clearTimeout(recLayerMaxTimers[id]); delete recLayerMaxTimers[id]; }
                const layer = recLayers.find(l => l.id === id);
                if (layer && layer._pendingLoopMaxStr) delete layer._pendingLoopMaxStr;
                commitLayerMax(input);
            }, true);
            list.addEventListener('keydown', (e) => {
                const input = e.target.closest('input.layer-max');
                if (!input) return;
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const id = parseInt(input.getAttribute('data-id'), 10);
                    if (isFinite(id) && recLayerMaxTimers[id]) { clearTimeout(recLayerMaxTimers[id]); delete recLayerMaxTimers[id]; }
                    const layer = recLayers.find(l => l.id === id);
                    if (layer && layer._pendingLoopMaxStr) delete layer._pendingLoopMaxStr;
                    commitLayerMax(input);
                }
            });
            list._recBound = true;
        }

        function recResizeTimelineCanvas() {
            const c = document.getElementById('recTimelineCanvas');
            if (!c) return;
            const dpr = window.devicePixelRatio || 1;
            const w = c.clientWidth || 0;
            const h = c.clientHeight || 0;
            if (w === 0 || h === 0) return;
            c.width = Math.max(1, Math.floor(w * dpr));
            c.height = Math.max(1, Math.floor(h * dpr));
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function recResizeAllMiniTimelines() {
            const dpr = window.devicePixelRatio || 1;
            recLayers.forEach(layer => {
                const c = document.getElementById(`recMiniTimeline-${layer.id}`);
                if (!c) return;
                const w = c.clientWidth || 0;
                const h = c.clientHeight || 0;
                if (w === 0 || h === 0) return;
                const targetW = Math.max(1, Math.floor(w * dpr));
                const targetH = Math.max(1, Math.floor(h * dpr));
                if (c.width !== targetW || c.height !== targetH) {
                    c.width = targetW;
                    c.height = targetH;
                    const ctx = c.getContext('2d');
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                }
            });
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
        // random/rainbow → a new vibrant color; step → the next palette entry
        // (record-time palette for 'original', current for 'live'). Non-
        // generative modes never call this. Per-layer step index on the layer.
        function recGenerativeColor(mode, palette, layer) {
            if (mode === 'random' || mode === 'rainbow') {
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

        // Human-readable labels for the color-mode dropdowns (full + mini)
        var REC_COLOR_MODES = [
            { v: 'original', label: 'Original Mode' },
            { v: 'exact', label: 'Exact Recording' },
            { v: 'live', label: 'Live Colors' }
        ];

        // Migrate saved color-mode values to the reworked set (2026-07-18):
        // old 'recorded' → 'exact'; old 'layer'/'live'/absent → 'original'
        // (the new default, which preserves the recorded brush behavior).
        function recMigrateColorMode(v) {
            if (v === 'original' || v === 'exact' || v === 'live') return v;
            if (v === 'recorded') return 'exact';
            return 'original';
        }

        // Keep the minimized-panel color-mode dropdown in step with the active
        // layer (populated once, value set here on every render / layer switch).
        function recSyncMiniColorMode() {
            var sel = document.getElementById('recMiniColorMode');
            if (!sel) return;
            if (!sel.options.length) {
                sel.innerHTML = REC_COLOR_MODES.map(function (m) {
                    return '<option value="' + m.v + '">' + m.label + '</option>';
                }).join('');
            }
            var a = recGetActiveLayer();
            if (a) {
                sel.value = a.colorMode || 'original';
                sel.disabled = false;
            } else {
                sel.value = 'original';
                sel.disabled = true;
            }
        }

        function recColorToCss(arr) {
            if (!arr || arr.length < 3) return 'rgba(0,0,0,0.6)';
            const r = Math.max(0, Math.min(255, Math.round(arr[0] * 255)));
            const g = Math.max(0, Math.min(255, Math.round(arr[1] * 255)));
            const b = Math.max(0, Math.min(255, Math.round(arr[2] * 255)));
            return `rgb(${r},${g},${b})`;
        }

        function recDrawTimeline() {
            const c = document.getElementById('recTimelineCanvas');
            if (!c) return;
            const ctx = c.getContext('2d');
            const w = c.clientWidth;
            const h = c.clientHeight;
            if (!w || !h) return;
            // Clear
            ctx.clearRect(0, 0, w, h);
            // Background grid stripes
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            for (let y = 0; y < h; y += 10) ctx.fillRect(0, y, w, 1);
            // Active layer interactions
            const a = recGetActiveLayer();
            if (!a) return;
            const eff = recGetEffectiveDuration(a);
            if (eff <= 0) return;
            // Time markers
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '12px monospace';
            const marks = 8;
            for (let i = 0; i <= marks; i++) {
                const x = (i / marks) * w;
                const t = (i / marks) * eff / 1000;
                ctx.fillText(t.toFixed(1) + 's', x + 2, 12);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(x, 16, 1, h - 16);
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
            }
            a.timeline.interactions.forEach(inter => {
                if ((inter.timestamp || 0) > eff) return;
                const x = (inter.timestamp / eff) * w;
                ctx.strokeStyle = recColorToCss(inter.color);
                ctx.globalAlpha = 0.9;
                ctx.beginPath();
                ctx.moveTo(x, 18);
                ctx.lineTo(x, h);
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.fillStyle = recColorToCss(inter.color);
                ctx.beginPath();
                ctx.arc(x, (18 + h) / 2, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        function recGetEffectiveDuration(layer) {
            if (!layer) return 0;
            const base = Math.max(0, layer.timeline && layer.timeline.duration || 0);
            const loop = (typeof layer.loopMaxMs === 'number' && layer.loopMaxMs > 0) ? layer.loopMaxMs : null;
            const eff = (loop !== null) ? Math.min(base, loop) : base;
            return Math.max(1, eff);
        }

        function recCommitActiveLayerMaxFromUI() {
            const a = recGetActiveLayer();
            if (!a) return;
            const input = document.querySelector(`input.layer-max[data-id="${a.id}"]`);
            if (!input) return;
            const ms = recParseTime(input.value);
            a.loopMaxMs = Math.max(1, ms || (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : a.timeline.duration || 10000));
            input.value = recFormatTime(a.loopMaxMs);
        }

        function recGetGlobalDurationBase() {
            const maxLayerDuration = recLayers.reduce((m, l) => {
                const ld = (l.timeline?.duration) || (l.timeline?.interactions?.reduce((mm, i) => Math.max(mm, i.timestamp), 0) || 0);
                return Math.max(m, ld);
            }, 0);
            return Math.max(recMaxDurationMs || 0, maxLayerDuration, 1);
        }

        function recDrawMiniTimelines() {
            const base = recGetGlobalDurationBase();
            recLayers.forEach(layer => {
                const c = document.getElementById(`recMiniTimeline-${layer.id}`);
                if (!c) return;
                const ctx = c.getContext('2d');
                const w = c.clientWidth;
                const h = c.clientHeight;
                if (!w || !h) return;
                ctx.clearRect(0, 0, w, h);
                // subtle stripes
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
                // draw interactions only up to the layer's effective duration, mapped to global base
                const eff = recGetEffectiveDuration(layer);
                const cutoffX = Math.max(0, Math.min(w, (eff / base) * w));
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, cutoffX, h);
                ctx.clip();
                ctx.globalAlpha = 0.95;
                (layer.timeline.interactions || []).forEach(inter => {
                    if ((inter.timestamp || 0) > eff) return;
                    const x = (inter.timestamp / base) * w;
                    ctx.strokeStyle = recColorToCss(inter.color);
                    ctx.beginPath();
                    ctx.moveTo(x, 4);
                    ctx.lineTo(x, h - 4);
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
                ctx.restore();
                ctx.globalAlpha = 1;
                // dim the truncated region beyond eff
                if (cutoffX < w) {
                    ctx.fillStyle = 'rgba(255,255,255,0.06)';
                    ctx.fillRect(cutoffX, 0, w - cutoffX, h);
                }
            });
        }

        function recRefreshTimelinesUI() {
            recResizeTimelineCanvas();
            recUpdateHeadsUI();
            recDrawTimeline();
            recResizeAllMiniTimelines();
            recDrawMiniTimelines();
        }

        // PERF: Cache DOM references for heads UI
        let _recPlayheadEl = null;
        let _recRecordheadEl = null;
        let _recTimelineCanvasEl = null;
        
        function recUpdateHeadsUI() {
            // Cache DOM lookups
            if (!_recPlayheadEl) _recPlayheadEl = document.getElementById('recPlayhead');
            if (!_recRecordheadEl) _recRecordheadEl = document.getElementById('recRecordhead');
            if (!_recTimelineCanvasEl) _recTimelineCanvasEl = document.getElementById('recTimelineCanvas');
            
            const a = recGetActiveLayer();
            const w = _recTimelineCanvasEl ? _recTimelineCanvasEl.clientWidth : 0;
            
            if (_recPlayheadEl) {
                if (a && (a.timeline.duration > 0 || (typeof a.loopMaxMs === 'number' && a.loopMaxMs > 0)) && w > 0) {
                    const eff = recGetEffectiveDuration(a);
                    const ratio = eff > 0 ? (a.timeline.playbackPosition / eff) : 0;
                    _recPlayheadEl.style.left = (Math.max(0, Math.min(1, ratio)) * w) + 'px';
                } else {
                    _recPlayheadEl.style.left = '0px';
                }
            }
            if (_recRecordheadEl) {
                if (a && a.timeline.isRecording && w > 0) {
                    _recRecordheadEl.style.display = 'block';
                    const elapsed = Date.now() - a.timeline.recordingStartTime;
                    const ratio = Math.min(1, elapsed / recMaxDurationMs);
                    _recRecordheadEl.style.left = (ratio * w) + 'px';
                } else {
                    _recRecordheadEl.style.display = 'none';
                }
            }
        }
        
        // Clear cached elements when UI is rebuilt
        function recClearCachedElements() {
            _recPlayheadEl = null;
            _recRecordheadEl = null;
            _recTimelineCanvasEl = null;
            _recBtnCache = null;
        }

        function recIsMultiEnabled() {
            return (typeof isMultiplayerEnabled !== 'undefined') ? !!isMultiplayerEnabled : !!window.isMultiplayerEnabled;
        }

        function recSetupTimelineInteractions() {
            const c = document.getElementById('recTimelineCanvas');
            if (!c) return;
            let seeking = false;
            function seekClientX(clientX) {
                const rect = c.getBoundingClientRect();
                const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
                const a = recGetActiveLayer();
                if (!a) return;
                const eff = recGetEffectiveDuration(a);
                if (eff <= 0) return;
                const ratio = x / rect.width;
                a.timeline.playbackPosition = ratio * eff;
                recUpdateHeadsUI();
                recDrawTimeline();
            }
            c.addEventListener('mousedown', (e) => { seeking = true; seekClientX(e.clientX); });
            window.addEventListener('mousemove', (e) => { if (seeking) seekClientX(e.clientX); });
            window.addEventListener('mouseup', () => { seeking = false; });
        }

        function recToggleMultiplayerActivation() {
            const cb = document.getElementById('multiplayerToggle');
            const currentlyOn = recIsMultiEnabled();
            if (!currentlyOn) {
                if (cb) cb.checked = true;
                if (typeof initMultiplayer === 'function') initMultiplayer();
            } else {
                // One unguarded click here used to close the socket outright —
                // the relay drops you from the Take Turns rotation and passes
                // the brush on, and (for stranger rooms) there's no way back.
                // Confirm before leaving, and keep the room for Reconnect.
                const inTurns = !!window.turnsOn;
                const msg = inTurns
                    ? 'Leave the multiplayer room?\n\nTake Turns is on — leaving gives up your spot in the rotation.'
                    : 'Leave the multiplayer room?';
                if (!window.confirm(msg)) { recRenderUI(); return; }
                if (cb) cb.checked = false;
                if (typeof disconnectMultiplayer === 'function') disconnectMultiplayer(true);
            }
            // Let connection events update state, but refresh UI immediately for button highlight
            recRenderUI();
        }

        function recSetupResizeHandle() {
            const drawer = document.getElementById('recDrawer');
            const handle = document.getElementById('recResizeHandle');
            if (!drawer || !handle) return;
            let resizing = false;
            let startY = 0;
            let startH = 0;
            handle.addEventListener('mousedown', (e) => {
                resizing = true;
                startY = e.clientY;
                startH = drawer.getBoundingClientRect().height;
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!resizing) return;
                const dy = startY - e.clientY; // move up increases height
                let newH = Math.max(160, Math.min(window.innerHeight * 0.9, startH + dy));
                drawer.style.height = `${Math.round(newH)}px`;
                recResizeTimelineCanvas();
                recUpdateHeadsUI();
                recDrawTimeline();
            });
            window.addEventListener('mouseup', () => { resizing = false; });
        }
        
        function recSetStatus(text) {
            const s = document.getElementById('recStatus');
            if (s) s.textContent = text;
        }
        
        function recClearActive() {
            const a = recGetActiveLayer();
            if (!a) return;
            a.timeline.interactions = [];
            a.timeline.duration = 0;
            a.timeline.playbackPosition = 0;
            a.timeline.isRecording = false;
            a.timeline.isPlaying = false;
            recSetStatus('Timeline cleared');
            recRenderUI();
        }
        
        function recExportAll() {
            // Ensure active layer's pending Max edit is committed
            try { recCommitActiveLayerMaxFromUI(); } catch(_){}
            const data = {
                version: '2.1',
                layers: recLayers.map(layer => ({
                    id: layer.id,
                    name: layer.name,
                    visible: layer.visible,
                    isLooping: layer.isLooping,
                    loopMaxMs: layer.loopMaxMs,
                    colorMode: layer.colorMode || 'original',
                    recordMode: layer.recordMode || 'main',
                    recordStepPalette: layer.recordStepPalette || null,
                    mask: layer.mask ? {
                        enabled: layer.mask.enabled,
                        mode: layer.mask.mode,
                        shapes: layer.mask.shapes
                    } : undefined,
                    timeline: {
                        interactions: layer.timeline.interactions,
                        duration: layer.timeline.duration
                    }
                }))
            };
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `timeline-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            recSetStatus('Exported');
        }
        
        function recImportFromFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    recLayers = [];
                    if ((data.version === '2.0' || data.version === '2.1') && Array.isArray(data.layers)) {
                        data.layers.forEach(ld => {
                            const layer = recCreateLayer(ld.name);
                            layer.visible = !!ld.visible;
                            layer.isLooping = ld.isLooping !== undefined ? !!ld.isLooping : true;
                            layer.loopMaxMs = (typeof ld.loopMaxMs === 'number') ? ld.loopMaxMs : (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : 10000);
                            layer.colorMode = recMigrateColorMode(ld.colorMode);
                            layer.recordMode = ld.recordMode || 'main';
                            layer.recordStepPalette = ld.recordStepPalette || null;
                            // Import mask data if present (v2.1+)
                            if (ld.mask) {
                                layer.mask = {
                                    enabled: !!ld.mask.enabled,
                                    mode: ld.mask.mode || 'show',
                                    shapes: ld.mask.shapes || []
                                };
                            }
                            layer.timeline.interactions = ld.timeline?.interactions || [];
                            layer.timeline.duration = ld.timeline?.duration || 0;
                            layer.timeline.playbackPosition = 0;
                        });
                    } else if (data.timeline) {
                        const layer = recCreateLayer('Imported Layer');
                        layer.timeline.interactions = data.timeline.interactions || [];
                        layer.timeline.duration = data.timeline.duration || 0;
                        layer.timeline.playbackPosition = 0;
                        layer.loopMaxMs = (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : 10000);
                    }
                    // Reset active to first
                    recActiveLayerId = recLayers[0] ? recLayers[0].id : null;
                    recRenderUI();
                    recSetStatus('Imported');
                } catch (err) {
                    recSetStatus('Import error');
                    console.error('Import error:', err);
                }
            };
            reader.readAsText(file);
        }

        function recGenSmashPreset() {
            const out = [];
            const w = Math.max(1, canvas.width || 1200);
            const h = Math.max(1, canvas.height || 800);
            const centerX = 0.5, centerY = 0.5;
            const leftX = 0.2, rightX = 0.8;
            const steps = 16;
            const dur = 1200;
            const jitter = 0.02;
            for (let i = 0; i <= steps; i++) {
                const t = (i / steps) * (dur * 0.6);
                const u = i / steps;
                const x = leftX + (centerX - leftX) * u;
                const y = centerY + (Math.random() - 0.5) * jitter;
                const dx = ((centerX - leftX) * w / steps) * 2;
                const dy = (Math.random() - 0.5) * 2;
                out.push({ timestamp: t, x, y, vx: dx, vy: dy, color: [0.9, 0.2, 0.3], mult: 1, radius: 0.012 });
            }
            for (let i = 0; i <= steps; i++) {
                const t = 150 + (i / steps) * (dur * 0.6);
                const u = i / steps;
                const x = rightX + (centerX - rightX) * u;
                const y = centerY + (Math.random() - 0.5) * jitter;
                const dx = ((centerX - rightX) * w / steps) * 2;
                const dy = (Math.random() - 0.5) * 2;
                out.push({ timestamp: t, x, y, vx: dx, vy: dy, color: [0.2, 0.7, 0.9], mult: 1, radius: 0.012 });
            }
            // After-collision ripples
            for (let k = 0; k < 3; k++) {
                const baseT = 700 + k * 120;
                for (let i = 0; i < 10; i++) {
                    const angle = (i / 10) * Math.PI * 2;
                    const x = centerX + 0.06 * Math.cos(angle);
                    const y = centerY + 0.06 * Math.sin(angle);
                    const dx = 6 * Math.cos(angle);
                    const dy = 6 * Math.sin(angle);
                    out.push({ timestamp: baseT + i * 8, x, y, vx: dx, vy: dy, color: [Math.random(), Math.random(), Math.random()], mult: 1, radius: 0.01 });
                }
            }
            return { interactions: out, duration: dur + 500 };
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

        function recGenVortexPreset(clockwise = true) {
            const out = [];
            const w = Math.max(1, canvas.width || 1200);
            const h = Math.max(1, canvas.height || 800);
            const cx = 0.5, cy = 0.5;
            const streams = 3;
            const rotations = 1.6;
            const steps = 46;
            const dir = clockwise ? 1 : -1;
            const colors = [[1,0,0.4],[0,1,0.3],[0,0.4,1]];
            function emit(startAngle, color, rStart, rEnd, baseSpeed, tOffset = 0) {
                for (let i = 0; i <= steps; i++) {
                    const u = i / steps;
                    const radius = rStart - (rStart - rEnd) * u;
                    const angle = startAngle + dir * rotations * Math.PI * 2 * u;
                    const x = cx + (radius) * Math.cos(angle);
                    const y = cy + (radius) * Math.sin(angle);
                    const tangent = angle + dir * Math.PI / 2;
                    const dx = baseSpeed * Math.cos(tangent) - radius * 0.08 * Math.cos(angle);
                    const dy = baseSpeed * Math.sin(tangent) - radius * 0.08 * Math.sin(angle);
                    out.push({ timestamp: tOffset + i * 40, x, y, vx: dx * Math.min(w, h), vy: dy * Math.min(w, h), color, mult: 1, radius: 0.004 + (1 - u) * 0.004 });
                }
            }
            const maxR = 0.45;
            const minR = 0.2;
            for (let s = 0; s < streams; s++) {
                const angle = (s / streams) * Math.PI * 2;
                emit(angle, colors[s], maxR, minR, 0.012, s * 250);
            }
            // inner
            for (let s = 0; s < streams; s++) {
                const angle = (s / streams) * Math.PI * 2 + Math.PI / streams;
                emit(angle, colors[(s + 1) % streams], 0.18, 0.03, 0.010, 500 + s * 250);
            }
            return { interactions: out, duration: steps * 40 + 1100 };
        }

        const recBuiltinPresetGenerators = {
            "Smash": () => recGenSmashPreset(),
            "Jellyfish": () => recGenJellyfishPreset(),
            "Portrait": () => recGenPortraitPreset(),
            "Vortex": () => recGenVortexPreset(true)
        };

        function recComputeDurationFromInteractions(interactions) {
            let d = 0;
            (Array.isArray(interactions) ? interactions : []).forEach(i => { d = Math.max(d, i && i.timestamp || 0); });
            return d;
        }

        function recListLocalPresets() {
            const sm = window.settingsManager;
            const all = sm && typeof sm.getAll === 'function' ? sm.getAll() : {};
            const out = {};
            Object.keys(all).forEach(key => {
                if (key.startsWith('recPreset.')) {
                    const name = key.substring('recPreset.'.length);
                    const data = all[key] || {};
                    if (Array.isArray(data.interactions)) {
                        const duration = (typeof data.duration === 'number') ? data.duration : recComputeDurationFromInteractions(data.interactions);
                        const loopMaxMs = (typeof data.loopMaxMs === 'number') ? data.loopMaxMs : undefined;
                        out[name] = { interactions: data.interactions.slice(), duration, loopMaxMs };
                    }
                }
            });
            return out;
        }

        function recRefreshPresetSelect() {
            const sel = document.getElementById('recPresetSelect');
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = '';
            const def = document.createElement('option');
            def.value = '';
            def.textContent = 'Select a preset...';
            sel.appendChild(def);
            const local = recListLocalPresets();
            const names = new Set();
            Object.keys(recBuiltinPresetGenerators).forEach(n => names.add(n));
            Object.keys(local).forEach(n => names.add(n));
            Array.from(names).sort().forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
            if ([...sel.options].some(o => o.value === current)) sel.value = current;
        }

        function recGetPresetByName(name) {
            const map = recListLocalPresets();
            if (map[name]) return map[name];
            const gen = recBuiltinPresetGenerators[name];
            if (typeof gen === 'function') {
                const data = gen();
                return { interactions: (data.interactions || []).slice(), duration: data.duration };
            }
            return null;
        }

        function recApplyPresetByName(name) {
            if (!name) return;
            const preset = recGetPresetByName(name);
            if (!preset) { recSetStatus('Preset not found'); return; }
            const layer = recCreateLayer(name);
            layer.timeline.interactions = JSON.parse(JSON.stringify(preset.interactions || []));
            layer.timeline.duration = (typeof preset.duration === 'number') ? preset.duration : recComputeDurationFromInteractions(layer.timeline.interactions);
            layer.timeline.playbackPosition = 0;
            if (typeof preset.loopMaxMs === 'number') layer.loopMaxMs = preset.loopMaxMs;
            recSetActiveLayer(layer.id);
            recRenderUI();
            recSetStatus(`Loaded preset "${name}"`);
        }

        function recSaveActiveLayerAsPreset(name) {
            const a = recGetActiveLayer();
            if (!a || !name) return false;
            // Commit any pending edit from the in-layer Max input
            try { recCommitActiveLayerMaxFromUI(); } catch(_){}
            const payload = {
                interactions: (a.timeline.interactions || []).map(i => ({ ...i })),
                duration: a.timeline.duration || recComputeDurationFromInteractions(a.timeline.interactions),
                loopMaxMs: (typeof a.loopMaxMs === 'number') ? a.loopMaxMs : undefined
            };
            const sm = window.settingsManager;
            if (!sm) return false;
            const key = `recPreset.${name}`;
            const all = (typeof sm.getAll === 'function') ? sm.getAll() : {};
            if (Object.prototype.hasOwnProperty.call(all, key)) {
                return 'exists';
            }
            sm.set(key, payload, false);
            return true;
        }
        
        function setupRecUI() {
            const recModeSel = document.getElementById('recMode');
            const recDrawerEl = document.getElementById('recDrawer');
            const recMiniEl = document.getElementById('recMini');
            const recMiniRecordBtn = document.getElementById('recMiniRecordBtn');
            const recMiniMultiBtn = document.getElementById('recMiniMultiBtn');
            const recMiniPauseBtn = document.getElementById('recMiniPauseBtn');
            const recMiniStopBtn = document.getElementById('recMiniStopBtn');
            const recMiniPlayAllBtn = document.getElementById('recMiniPlayAllBtn');
            const recMiniMaxInput = document.getElementById('recMiniMaxDuration');
            const recOpenFullBtn = document.getElementById('recOpenFullBtn');
            const recMiniPrevLayerBtn = document.getElementById('recMiniPrevLayerBtn');
            const recMiniNextLayerBtn = document.getElementById('recMiniNextLayerBtn');
            const recMiniAddLayerBtn = document.getElementById('recMiniAddLayerBtn');

            function applyMode(mode) {
                const full = (mode === 'full');
                const min = (mode === 'min');
                const off = (mode === 'off');

                if (off) {
                    recEnabled = false;
                    if (recMiniEl) recMiniEl.style.display = 'none';
                    if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'record') window.studioDrawer.close();
                    else if (recDrawerEl) recDrawerEl.classList.remove('open');
                    // Stop any playback/recording
                    recStopPlayback();
                    const a = recGetActiveLayer();
                    if (a) a.timeline.isRecording = false;
                    return;
                }

                // Ensure at least one layer exists when enabled
                if (recLayers.length === 0) recAddLayer();
                recEnabled = true;

                if (min) {
                    if (recMiniEl) recMiniEl.style.display = '';
                    if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'record') window.studioDrawer.close();
                    else if (recDrawerEl) recDrawerEl.classList.remove('open');
                    // Reflect current max into mini field
                    if (recMiniMaxInput) recMiniMaxInput.value = recFormatTime(recMaxDurationMs || 10000);
                    recRenderUI(); // update button texts for mini
                } else if (full) {
                    if (recMiniEl) recMiniEl.style.display = 'none';
                    if (window.studioDrawer) window.studioDrawer.open('record');
                    else if (recDrawerEl) recDrawerEl.classList.add('open');
                    // Reflect current max into full field
                    const dur = document.getElementById('recMaxDuration');
                    if (dur) dur.value = recFormatTime(recMaxDurationMs || 10000);
                    const spd = document.getElementById('recPlaybackSpeed');
                    if (spd) recPlaybackSpeed = parseFloat(spd.value) || 1;
                    recRenderUI();
                    recResizeTimelineCanvas();
                    recUpdateHeadsUI();
                    recDrawTimeline();
                    recResizeAllMiniTimelines();
                    recDrawMiniTimelines();
                }
            }

            if (recModeSel) {
                recModeSel.addEventListener('change', (e) => applyMode(e.target.value));
                // Apply initial mode
                applyMode(recModeSel.value);
            }

    // Mini controls
    if (recMiniRecordBtn) recMiniRecordBtn.addEventListener('click', recToggleRecord);
    if (recMiniMultiBtn) recMiniMultiBtn.addEventListener('click', () => { recToggleMultiplayerActivation(); });
    if (recMiniPauseBtn) recMiniPauseBtn.addEventListener('click', recTogglePlayback);
    if (recMiniStopBtn) recMiniStopBtn.addEventListener('click', recStopAll);
    if (recMiniPlayAllBtn) recMiniPlayAllBtn.addEventListener('click', recTogglePlaybackAll);
    if (recMiniMaxInput) recMiniMaxInput.addEventListener('change', (e) => { recMaxDurationMs = recParseTime(e.target.value) || 10000; });
    if (recOpenFullBtn) recOpenFullBtn.addEventListener('click', () => { if (recModeSel) { recModeSel.value = 'full'; recModeSel.dispatchEvent(new Event('change')); } });
    if (recMiniPrevLayerBtn) recMiniPrevLayerBtn.addEventListener('click', () => { recCycleLayer(-1); });
    if (recMiniNextLayerBtn) recMiniNextLayerBtn.addEventListener('click', () => { recCycleLayer(1); });
    if (recMiniAddLayerBtn) recMiniAddLayerBtn.addEventListener('click', recAddLayer);
    // Minimized color-mode dropdown: mirrors + sets the active layer's mode,
    // resyncs when layers are switched (recSyncMiniColorMode runs in render).
    const recMiniColorMode = document.getElementById('recMiniColorMode');
    if (recMiniColorMode) {
        recMiniColorMode.addEventListener('change', () => {
            const a = recGetActiveLayer();
            if (a) { a.colorMode = recMiniColorMode.value; a._repKey = null; recRenderUI(); }
        });
    }
    recSyncMiniColorMode();
    // Click flash effect for lively feedback
    const miniBtns = document.querySelectorAll('#recMini button');
    miniBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.remove('clicked');
            // Force reflow to restart animation
            // eslint-disable-next-line no-unused-expressions
            btn.offsetWidth;
            btn.classList.add('clicked');
            setTimeout(() => btn.classList.remove('clicked'), 250);
        });
    });
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    const recBtnFull = document.getElementById('recRecordBtn');
    if (recBtnFull) recBtnFull.addEventListener('click', recToggleRecord);
    const recMultiBtnFull = document.getElementById('recMultiRecordBtn');
    if (recMultiBtnFull) recMultiBtnFull.addEventListener('click', () => { recToggleMultiplayerActivation(); });
    bind('recPlayBtn', recTogglePlayback);
    bind('recPlayAllBtn', recTogglePlaybackAll);
    bind('recStopBtn', recStopAll);

    bind('recAddLayerBtn', recAddLayer);
    bind('recDuplicateLayerBtn', recDuplicateActiveLayer);
    bind('recDeleteLayerBtn', recDeleteActiveLayer);
    bind('recClearBtn', recClearActive);
    bind('recExportBtn', recExportAll);
    const impBtn = document.getElementById('recImportBtn');
    const impFile = document.getElementById('recImportFile');
    if (impBtn && impFile) {
        impBtn.addEventListener('click', () => impFile.click());
        impFile.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) recImportFromFile(f); e.target.value = ''; });
    }
    const closeBtn = document.getElementById('recCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        // Close full panel -> go to Minimized mode, not Off
        const modeSel = document.getElementById('recMode');
        if (modeSel) { modeSel.value = 'min'; modeSel.dispatchEvent(new Event('change')); }
    });
    const speedSel = document.getElementById('recPlaybackSpeed');
    if (speedSel) speedSel.addEventListener('change', (e) => { recPlaybackSpeed = parseFloat(e.target.value) || 1; });
    const durInput = document.getElementById('recMaxDuration');
    if (durInput) durInput.addEventListener('change', (e) => { recMaxDurationMs = recParseTime(e.target.value) || 10000; });
    
    const recPresetSel = document.getElementById('recPresetSelect');
    const recSavePresetBtn = document.getElementById('recSavePresetBtn');
    const recPresetRow = document.getElementById('recPresetNameRow');
    const recPresetName = document.getElementById('recNewPresetName');
    const recPresetConfirm = document.getElementById('recPresetConfirmBtn');
    const recPresetCancel = document.getElementById('recPresetCancelBtn');
    recRefreshPresetSelect();
    try { window.addEventListener('load', () => recRefreshPresetSelect()); } catch(_){}
    if (recPresetSel) recPresetSel.addEventListener('change', (e) => {
        const val = (e.target && e.target.value) || '';
        if (val) recApplyPresetByName(val);
    });
    if (recSavePresetBtn) recSavePresetBtn.addEventListener('click', () => {
        if (recPresetRow) recPresetRow.style.display = 'flex';
        if (recPresetName) { recPresetName.value = ''; recPresetName.focus(); }
    });
    if (recPresetCancel) recPresetCancel.addEventListener('click', () => {
        if (recPresetRow) recPresetRow.style.display = 'none';
        if (recPresetName) recPresetName.value = '';
    });
    if (recPresetConfirm) recPresetConfirm.addEventListener('click', () => {
        const name = (recPresetName && recPresetName.value || '').trim();
        if (!name) { recSetStatus('Name is required'); return; }
        const result = recSaveActiveLayerAsPreset(name);
        if (result === true) {
            if (recPresetRow) recPresetRow.style.display = 'none';
            recRefreshPresetSelect();
            const sel = document.getElementById('recPresetSelect');
            if (sel) sel.value = name;
            recSetStatus('Preset saved');
        } else if (result === 'exists') {
            recSetStatus('Preset already exists');
        } else {
            recSetStatus('Failed to save preset');
        }
    });

    // One-time setup for interactions and resizing
    recSetupTimelineInteractions();
    recSetupResizeHandle();
    window.addEventListener('resize', () => { recResizeTimelineCanvas(); recUpdateHeadsUI(); recDrawTimeline(); recResizeAllMiniTimelines(); recDrawMiniTimelines(); });
        }

        function recCycleLayer(dir) {
        if (!Array.isArray(recLayers) || recLayers.length === 0) return;
        const idx = recLayers.findIndex(l => l.id === recActiveLayerId);
        let next = (idx >= 0 ? idx : 0) + dir;
        if (next < 0) next = recLayers.length - 1;
        if (next >= recLayers.length) next = 0;
        recSetActiveLayer(recLayers[next].id);
    }
