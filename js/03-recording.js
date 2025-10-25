        function recScheduleRender() {
            if (recRenderQueued) return;
            recRenderQueued = true;
            requestAnimationFrame(() => {
                recRenderQueued = false;
                recRenderUI();
            });
        }
        
        function recParseTime(str) {
            if (!str) return 10000;
            // Accept mm:ss:ms or ss.ms or integer ms
            if (/^\d{1,2}:\d{2}:\d{1,3}$/.test(str)) {
                const [mm, ss, ms] = str.split(':').map(Number);
                return (mm * 60 + ss) * 1000 + ms;
            }
            if (/^\d+(\.\d+)?$/.test(str)) {
                // seconds as float
                return Math.round(parseFloat(str) * 1000);
            }
            return 10000;
        }
        
        function recGetActiveLayer() {
            return recLayers.find(l => l.id === recActiveLayerId);
        }
        
        function recSetActiveLayer(id) {
            recActiveLayerId = id;
            recRenderUI();
        }
        
        function recCreateLayer(name = null) {
            const id = recNextLayerId++;
            const layer = {
                id,
                name: name || `Layer ${id}`,
                visible: true,
                isLooping: true,
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
                if (l.timeline.playbackPosition >= l.timeline.duration) l.timeline.playbackPosition = 0;
                l.timeline.isPlaying = true;
                recLastPlaybackTime = Date.now();
            }
            recRenderUI();
        }
        
        function recToggleRecord() {
            const a = recGetActiveLayer();
            if (!a) return;
            const btn = document.getElementById('recRecordBtn');
            if (a.timeline.isRecording) {
                a.timeline.isRecording = false;
                if (btn) btn.textContent = '⏺ Record';
                a.timeline.duration = 0;
                a.timeline.interactions.forEach(i => { a.timeline.duration = Math.max(a.timeline.duration, i.timestamp); });
            } else {
                a.timeline.isRecording = true;
                a.timeline.recordingStartTime = Date.now() - a.timeline.playbackPosition;
                if (btn) btn.textContent = '⏺ Recording...';
                a.timeline.duration = recMaxDurationMs;
                if (a.timeline.isPlaying) a.timeline.isPlaying = false;
            }
            recRenderUI();
        }
        
        function recRecordInteraction(x, y, dx, dy, colorArray) {
            if (!recEnabled) return;
            const a = recGetActiveLayer();
            if (!a || !a.timeline.isRecording) return;
            const timestamp = Date.now() - a.timeline.recordingStartTime;
            if (timestamp > recMaxDurationMs) {
                a.timeline.isRecording = false;
                const btn = document.getElementById('recRecordBtn');
                if (btn) btn.textContent = '⏺ Record';
                a.timeline.duration = 0;
                a.timeline.interactions.forEach(i => { a.timeline.duration = Math.max(a.timeline.duration, i.timestamp); });
                recScheduleRender();
                return;
            }
            const interaction = { timestamp, x: x / canvas.width, y: y / canvas.height, vx: dx, vy: dy, color: colorArray.slice() };
            a.timeline.interactions.push(interaction);
            // If this is the first interaction for this layer, ensure a mini timeline canvas exists in its card
            if (a.timeline.interactions.length === 1) {
                const item = document.querySelector(`.rec-item[data-id="${a.id}"]`);
                if (item) {
                    let mini = document.getElementById(`recMiniTimeline-${a.id}`);
                    if (!mini) {
                        mini = document.createElement('canvas');
                        mini.id = `recMiniTimeline-${a.id}`;
                        mini.className = 'rec-mini-timeline';
                        item.appendChild(mini);
                    }
                }
            }
            // Update timelines (main + minis) without rebuilding the whole list
            recRefreshTimelinesUI();
        }
        
        function recTogglePlayback() {
            const a = recGetActiveLayer();
            const btn = document.getElementById('recPlayBtn');
            if (!a) return;
            if (a.timeline.isPlaying) {
                a.timeline.isPlaying = false;
                if (btn) btn.textContent = '▶ Play Layer';
            } else {
                if (a.timeline.interactions.length === 0) return;
                recLayers.forEach(l => { if (l.id !== a.id) l.timeline.isPlaying = false; });
                if (a.timeline.playbackPosition >= a.timeline.duration) a.timeline.playbackPosition = 0;
                a.timeline.isPlaying = true;
                if (btn) btn.textContent = '⏸ Pause';
                recIsPlayingAll = false;
                recLastPlaybackTime = Date.now();
            }
            recRenderUI();
        }
        
        function recTogglePlaybackAll() {
            const btn = document.getElementById('recPlayAllBtn');
            if (recIsPlayingAll) {
                recLayers.forEach(l => l.timeline.isPlaying = false);
                recIsPlayingAll = false;
                if (btn) btn.textContent = '▶▶ Play All';
                const pl = document.getElementById('recPlayBtn');
                if (pl) pl.textContent = '▶ Play Layer';
            } else {
                const has = recLayers.some(l => l.timeline.interactions.length > 0);
                if (!has) return;
                recLayers.forEach(l => {
                    if (l.timeline.interactions.length > 0) {
                        if (l.timeline.playbackPosition >= l.timeline.duration) l.timeline.playbackPosition = 0;
                        l.timeline.isPlaying = true;
                    }
                });
                recIsPlayingAll = true;
                if (btn) btn.textContent = '⏸⏸ Pause All';
                const pl = document.getElementById('recPlayBtn');
                if (pl) pl.textContent = '⏸ Pause';
                recLastPlaybackTime = Date.now();
            }
            recRenderUI();
        }
        
        function recStopPlayback() {
            recLayers.forEach(l => { l.timeline.isPlaying = false; l.timeline.playbackPosition = 0; });
            recIsPlayingAll = false;
            const pl = document.getElementById('recPlayBtn');
            if (pl) pl.textContent = '▶ Play Layer';
            const pal = document.getElementById('recPlayAllBtn');
            if (pal) pal.textContent = '▶▶ Play All';
            recRenderUI();
        }
        
        function recUpdatePlayback() {
            const now = Date.now();
            const delta = now - recLastPlaybackTime;
            recLayers.forEach(layer => {
                if (!layer.timeline.isPlaying || !layer.visible) return;
                const scaledDelta = delta * recPlaybackSpeed;
                layer.timeline.playbackPosition += scaledDelta;
                const currentTime = layer.timeline.playbackPosition;
                const prevTime = currentTime - scaledDelta;
                const events = layer.timeline.interactions.filter(i => i.timestamp > prevTime && i.timestamp <= currentTime);
                events.forEach(i => {
                    const x = i.x * canvas.width;
                    const y = i.y * canvas.height;
                    multiSplat(x, y, i.vx, i.vy, i.color);
                });
                if (layer.timeline.playbackPosition >= layer.timeline.duration) {
                    if (layer.isLooping) {
                        layer.timeline.playbackPosition = 0;
                    } else {
                        layer.timeline.isPlaying = false;
                        layer.timeline.playbackPosition = 0;
                    }
                }
            });
            recLastPlaybackTime = now;
            recRefreshTimelinesUI();
        }
        
        function recRenderUI() {
            const list = document.getElementById('recLayersList');
            if (!list) return;
            list.innerHTML = '';
            recLayers.forEach(layer => {
                const el = document.createElement('div');
                el.className = 'rec-item' + (layer.id === recActiveLayerId ? ' active-layer' : '');
                el.setAttribute('data-id', layer.id);
                el.setAttribute('data-action', 'set-active');
                el.innerHTML = `
                    <div class="layer-item-header">
                        <div class="layer-thumbnail" style="background: linear-gradient(135deg, rgba(100,200,255,0.4), rgba(150,100,255,0.4)); display:flex; align-items:center; justify-content:center; font-size: 18px;">🎬</div>
                        <div class="layer-info">
                            <input type="text" class="layer-title" value="${layer.name}" data-action="rename" data-id="${layer.id}">
                        </div>
                        <div class="layer-controls">
                            <button class="layer-btn" data-action="toggle-visibility" data-id="${layer.id}">${layer.visible ? '👁️' : '👁️‍🗨️'}</button>
                            <button class="layer-btn" data-action="toggle-play" data-id="${layer.id}">${layer.timeline.isPlaying ? '⏸' : '▶'}</button>
                            <button class="layer-btn" data-action="toggle-loop" data-id="${layer.id}">${layer.isLooping ? '🔁' : '⏹'}</button>
                        </div>
                    </div>
                    <div style="font-size:10px; opacity:0.7; margin-bottom:4px;">${layer.timeline.interactions.length} interactions | ${(layer.timeline.duration/1000).toFixed(1)}s</div>
                    <canvas id="recMiniTimeline-${layer.id}" class="rec-mini-timeline"></canvas>
                `;
                list.appendChild(el);
            });
            const recordBtn = document.getElementById('recRecordBtn');
            const playBtn = document.getElementById('recPlayBtn');
            const playAllBtn = document.getElementById('recPlayAllBtn');
            const a = recGetActiveLayer();
            if (recordBtn) recordBtn.textContent = a && a.timeline.isRecording ? '⏺ Recording...' : '⏺ Record';
            if (playBtn) playBtn.textContent = a && a.timeline.isPlaying ? '⏸ Pause' : '▶ Play Layer';
            if (playAllBtn) playAllBtn.textContent = recIsPlayingAll ? '⏸⏸ Pause All' : '▶▶ Play All';
            recRefreshTimelinesUI();
            recBindLayerListEvents();
        }

        function recBindLayerListEvents() {
            const list = document.getElementById('recLayersList');
            if (!list || list._recBound) return;
            list.addEventListener('click', (e) => {
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
                } else if (action === 'set-active') {
                    const container = e.target.closest('.rec-item');
                    const cid = container ? parseInt(container.getAttribute('data-id'), 10) : id;
                    if (isFinite(cid)) recSetActiveLayer(cid);
                }
            });
            list.addEventListener('change', (e) => {
                const input = e.target.closest('input.layer-title[data-action="rename"]');
                if (!input) return;
                const id = parseInt(input.getAttribute('data-id'), 10);
                const layer = recLayers.find(l => l.id === id);
                if (layer) { layer.name = input.value; recScheduleRender(); }
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
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            for (let y = 0; y < h; y += 10) ctx.fillRect(0, y, w, 1);
            // Active layer interactions
            const a = recGetActiveLayer();
            if (!a || a.timeline.duration === 0) return;
            // Time markers
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '10px monospace';
            const marks = 8;
            for (let i = 0; i <= marks; i++) {
                const x = (i / marks) * w;
                const t = (i / marks) * a.timeline.duration / 1000;
                ctx.fillText(t.toFixed(1) + 's', x + 2, 12);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(x, 16, 1, h - 16);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
            }
            a.timeline.interactions.forEach(inter => {
                const x = (inter.timestamp / a.timeline.duration) * w;
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
                // draw interactions relative to global base (whole)
                ctx.globalAlpha = 0.95;
                (layer.timeline.interactions || []).forEach(inter => {
                    const x = (inter.timestamp / base) * w;
                    ctx.strokeStyle = recColorToCss(inter.color);
                    ctx.beginPath();
                    ctx.moveTo(x, 4);
                    ctx.lineTo(x, h - 4);
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
                ctx.globalAlpha = 1;
            });
        }

        function recRefreshTimelinesUI() {
            recResizeTimelineCanvas();
            recUpdateHeadsUI();
            recDrawTimeline();
            recResizeAllMiniTimelines();
            recDrawMiniTimelines();
        }

        function recUpdateHeadsUI() {
            const a = recGetActiveLayer();
            const playhead = document.getElementById('recPlayhead');
            const recordhead = document.getElementById('recRecordhead');
            const c = document.getElementById('recTimelineCanvas');
            const w = c ? c.clientWidth : 0;
            if (playhead && a && a.timeline.duration > 0 && w > 0) {
                const ratio = a.timeline.playbackPosition / a.timeline.duration;
                playhead.style.left = `${Math.max(0, Math.min(1, ratio)) * w}px`;
            } else if (playhead) {
                playhead.style.left = '0px';
            }
            if (recordhead) {
                const aL = a;
                if (aL && aL.timeline.isRecording && w > 0) {
                    recordhead.style.display = 'block';
                    const elapsed = Date.now() - aL.timeline.recordingStartTime;
                    const ratio = Math.min(1, elapsed / recMaxDurationMs);
                    recordhead.style.left = `${ratio * w}px`;
                } else {
                    recordhead.style.display = 'none';
                }
            }
        }

        function recSetupTimelineInteractions() {
            const c = document.getElementById('recTimelineCanvas');
            if (!c) return;
            let seeking = false;
            function seekClientX(clientX) {
                const rect = c.getBoundingClientRect();
                const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
                const a = recGetActiveLayer();
                if (!a || a.timeline.duration <= 0) return;
                const ratio = x / rect.width;
                a.timeline.playbackPosition = ratio * a.timeline.duration;
                recUpdateHeadsUI();
                recDrawTimeline();
            }
            c.addEventListener('mousedown', (e) => { seeking = true; seekClientX(e.clientX); });
            window.addEventListener('mousemove', (e) => { if (seeking) seekClientX(e.clientX); });
            window.addEventListener('mouseup', () => { seeking = false; });
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
            const data = {
                version: '2.0',
                layers: recLayers.map(layer => ({
                    id: layer.id,
                    name: layer.name,
                    visible: layer.visible,
                    isLooping: layer.isLooping,
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
                    if (data.version === '2.0' && Array.isArray(data.layers)) {
                        data.layers.forEach(ld => {
                            const layer = recCreateLayer(ld.name);
                            layer.visible = !!ld.visible;
                            layer.isLooping = ld.isLooping !== undefined ? !!ld.isLooping : true;
                            layer.timeline.interactions = ld.timeline?.interactions || [];
                            layer.timeline.duration = ld.timeline?.duration || 0;
                            layer.timeline.playbackPosition = 0;
                        });
                    } else if (data.timeline) {
                        const layer = recCreateLayer('Imported Layer');
                        layer.timeline.interactions = data.timeline.interactions || [];
                        layer.timeline.duration = data.timeline.duration || 0;
                        layer.timeline.playbackPosition = 0;
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
        
        function setupRecUI() {
            const recToggleEl = document.getElementById('recToggle');
            const recDrawerEl = document.getElementById('recDrawer');
            if (recToggleEl) {
                recToggleEl.addEventListener('change', (e) => {
                    recEnabled = e.target.checked;
                    if (recDrawerEl) recDrawerEl.classList.toggle('open', recEnabled);
                    if (recEnabled && recLayers.length === 0) { recAddLayer(); }
                    // Initialize defaults on open
                    const dur = document.getElementById('recMaxDuration');
                    if (dur) recMaxDurationMs = recParseTime(dur.value) || 10000;
                    const spd = document.getElementById('recPlaybackSpeed');
                    if (spd) recPlaybackSpeed = parseFloat(spd.value) || 1;
                    recRenderUI();
                    recResizeTimelineCanvas();
                    recUpdateHeadsUI();
                    recDrawTimeline();
                    recResizeAllMiniTimelines();
                    recDrawMiniTimelines();
                });
            }
            const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
            bind('recRecordBtn', recToggleRecord);
            bind('recPlayBtn', recTogglePlayback);
            bind('recPlayAllBtn', recTogglePlaybackAll);
            bind('recStopBtn', recStopPlayback);
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
                const t = document.getElementById('recToggle');
                if (t) t.checked = false;
                recEnabled = false;
                if (recDrawerEl) recDrawerEl.classList.remove('open');
                recStopPlayback();
                recRenderUI();
            });
            const speedSel = document.getElementById('recPlaybackSpeed');
            if (speedSel) speedSel.addEventListener('change', (e) => { recPlaybackSpeed = parseFloat(e.target.value) || 1; });
            const durInput = document.getElementById('recMaxDuration');
            if (durInput) durInput.addEventListener('change', (e) => { recMaxDurationMs = recParseTime(e.target.value) || 10000; });
            // One-time setup for interactions and resizing
            recSetupTimelineInteractions();
            recSetupResizeHandle();
            window.addEventListener('resize', () => { recResizeTimelineCanvas(); recUpdateHeadsUI(); recDrawTimeline(); recResizeAllMiniTimelines(); recDrawMiniTimelines(); });
