// ═══════════════════════════════════════════════════════════════════
// js/05n-hotkeys-init.js — part 14/14 of former 05-fluid-sim.js (lines 4645–5058)
// LOAD ORDER: after 05m-layer-masks.js, before 06-slider-updater.js (async loader)
// PROVIDES: hotkey overlay, undo/redo stacks + keyboard handlers, window.layers/renderLayers exposure, rec layer snapshot fns, bootstrap calls: renderLayers(), setupRecUI(), recRenderUI(), update()
// REQUIRES: update (05j), renderLayers (05k), setupRecUI/recRenderUI (03)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Hotkeys modal + Undo/Redo implementation
        const hotkeyOverlay = document.getElementById('hotkeyOverlay');
        const hotkeyClose = document.getElementById('hotkeyClose');
        // Key-chip pass (2026-08-15): the modal's <li>s are authored as
        // "Keys — Description" prose; on first open, wrap the key half in
        // <kbd> + the rest in .hk-desc so the CSS renders real key caps.
        // Lines without the ' — ' separator are left untouched.
        let hotkeysChipped = false;
        function chipHotkeyList() {
            if (hotkeysChipped || !hotkeyOverlay) return;
            hotkeysChipped = true;
            hotkeyOverlay.querySelectorAll('.hotkey-body li').forEach((li) => {
                const t = li.textContent;
                const i = t.indexOf(' — ');
                if (i <= 0) return;
                const kbd = document.createElement('kbd');
                kbd.textContent = t.slice(0, i);
                const d = document.createElement('span');
                d.className = 'hk-desc';
                d.textContent = t.slice(i + 3);
                li.textContent = '';
                li.appendChild(kbd);
                li.appendChild(d);
            });
        }
        function showHotkeys() { if (hotkeyOverlay) { chipHotkeyList(); hotkeyOverlay.style.display = 'flex'; } }
        function hideHotkeys() { if (hotkeyOverlay) hotkeyOverlay.style.display = 'none'; }
        function toggleHotkeys() { if (!hotkeyOverlay) return; chipHotkeyList(); hotkeyOverlay.style.display = (hotkeyOverlay.style.display === 'flex' ? 'none' : 'flex'); }
        // Mobile has no F1 — 13-mobile-mode's '?' button opens the modal.
        window.toggleHotkeys = toggleHotkeys;
        if (hotkeyClose) hotkeyClose.addEventListener('click', hideHotkeys);
        if (hotkeyOverlay) hotkeyOverlay.addEventListener('click', (e) => { if (e.target === hotkeyOverlay) hideHotkeys(); });
        let undoStack = [];
        let redoStack = [];
        let applyingState = false;
        function isTypingTarget(el) {
            if (!el) return false;
            const tag = (el.tagName || '').toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
        }
        function getWrapperRectState() {
            const areaRect = canvasArea.getBoundingClientRect();
            const rect = canvasWrapper.getBoundingClientRect();
            return {
                left: rect.left - areaRect.left,
                top: rect.top - areaRect.top,
                width: rect.width,
                height: rect.height
            };
        }
        function setWrapperRectState(w) {
            if (!w) return;
            canvasWrapper.style.left = w.left + 'px';
            canvasWrapper.style.top = w.top + 'px';
            canvasWrapper.style.width = w.width + 'px';
            canvasWrapper.style.height = w.height + 'px';
            updateCanvasSize();
        }
        function getState() {
            const rect = getWrapperRectState();
            return {
                paletteIndex: (typeof currentPaletteIndex !== 'undefined') ? currentPaletteIndex : 0,
                savedColors: Array.isArray(savedColors) ? savedColors.slice() : [],
                randomOn: !!document.getElementById('randomColor')?.checked,
                stepOn: !!document.getElementById('stepPalette')?.checked,
                colorPickerValue: document.getElementById('colorPicker')?.value || '#ffffff',
                brushSize: parseFloat(document.getElementById('brushSize')?.value || '11'),
                visualRes: parseInt(document.getElementById('visualResolution')?.value || String(config.DYE_RESOLUTION), 10),
                physicsRes: parseInt(document.getElementById('physicsResolution')?.value || String(config.SIM_RESOLUTION), 10),
                showCursor: !!document.getElementById('cursorToggle')?.checked,
                showCanvasHandles: !!document.getElementById('showCanvasHandles')?.checked,
                lockCanvasBorders: !!document.getElementById('lockCanvasBorders')?.checked,
                wrapper: rect
            };
        }
        function applyState(s) {
            if (!s) return;
            applyingState = true;
            try {
                // Checkboxes and selectors
                const stepEl = document.getElementById('stepPalette');
                const rndEl = document.getElementById('randomColor');
                const cursorEl = document.getElementById('cursorToggle');
                const handlesEl = document.getElementById('showCanvasHandles');
                const lockEl = document.getElementById('lockCanvasBorders');
                const visualSel = document.getElementById('visualResolution');
                const physSel = document.getElementById('physicsResolution');
                const cp = document.getElementById('colorPicker');
                if (typeof applyPalette === 'function' && typeof s.paletteIndex === 'number') {
                    applyPalette(s.paletteIndex);
                }
                if (Array.isArray(s.savedColors) && typeof colorStorage?.save === 'function') {
                    colorStorage.save(s.savedColors.slice());
                }
                if (rndEl) { rndEl.checked = !!s.randomOn; rndEl.dispatchEvent(new Event('change')); }
                if (stepEl) { stepEl.checked = !!s.stepOn; stepEl.dispatchEvent(new Event('change')); }
                if (cp) { cp.value = s.colorPickerValue || cp.value; }
                if (typeof updateColor === 'function') updateColor();
                const brushEl = document.getElementById('brushSize');
                if (brushEl) { 
                    brushEl.value = String(s.brushSize); 
                    brushEl.style.setProperty('--val', s.brushSize);
                    config.SPLAT_RADIUS = s.brushSize / 1000; 
                }
                if (visualSel) { visualSel.value = String(s.visualRes); visualSel.dispatchEvent(new Event('change')); }
                if (physSel) { physSel.value = String(s.physicsRes); physSel.dispatchEvent(new Event('change')); }
                if (cursorEl) { cursorEl.checked = !!s.showCursor; cursorEl.dispatchEvent(new Event('change')); }
                if (handlesEl) {
                    // Default the border/handles ON unless a saved setting
                    // explicitly turned them off — stale snapshots that omit
                    // the key must not silently hide the frame on load.
                    handlesEl.checked = (s.showCanvasHandles !== false);
                    if (typeof applyHandlesVisibility === 'function') applyHandlesVisibility(handlesEl.checked);
                }
                if (lockEl) { lockEl.checked = !!s.lockCanvasBorders; bordersLocked = lockEl.checked; }
                if (s.wrapper) setWrapperRectState(s.wrapper);
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
            } finally {
                applyingState = false;
            }
        }
        // D6: UI-state undo entries are { s: snapshot, seq } so the unified
        // UndoManager can order them against sketch/layer histories by recency.
        function pushUndo() {
            if (applyingState) return;
            try {
                const current = getState();
                const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
                if (last && JSON.stringify(last.s) === JSON.stringify(current)) return; // skip duplicate
                undoStack.push({ s: current, seq: (window.__undoSeq = (window.__undoSeq | 0) + 1) });
                if (undoStack.length > 100) undoStack.shift();
                redoStack.length = 0;
            } catch (e) { /* noop */ }
        }
        function doUndo() {
            if (!undoStack.length) return;
            const current = getState();
            // Skip no-op snapshots equal to current state
            while (undoStack.length) {
                const top = undoStack[undoStack.length - 1];
                if (JSON.stringify(top.s) === JSON.stringify(current)) { undoStack.pop(); } else { break; }
            }
            if (!undoStack.length) return;
            const entry = undoStack.pop();
            redoStack.push({ s: current, seq: entry.seq });
            applyState(entry.s);
        }
        function doRedo() {
            if (!redoStack.length) return;
            const current = getState();
            // Skip no-op snapshots equal to current state
            while (redoStack.length) {
                const top = redoStack[redoStack.length - 1];
                if (JSON.stringify(top.s) === JSON.stringify(current)) { redoStack.pop(); } else { break; }
            }
            if (!redoStack.length) return;
            const entry = redoStack.pop();
            undoStack.push({ s: current, seq: entry.seq });
            applyState(entry.s);
        }
        // D6: unified recency-ordered undo. Each provider owns its own stack and
        // stamps events with a global seq; UndoManager dispatches Ctrl+Z to the
        // provider whose top undoable action is the most recent (highest seq),
        // and redo to the most-recently-undone (lowest redo seq).
        window.__undoSeq = window.__undoSeq | 0;
        const uiUndoProvider = {
            canUndo: function () { return undoStack.length > 0; },
            canRedo: function () { return redoStack.length > 0; },
            topUndoSeq: function () { return undoStack.length ? undoStack[undoStack.length - 1].seq : -Infinity; },
            topRedoSeq: function () { return redoStack.length ? redoStack[redoStack.length - 1].seq : Infinity; },
            undo: doUndo, redo: doRedo
        };
        window.UndoManager = (function () {
            const providers = [];
            function register(p) { if (p && providers.indexOf(p) < 0) providers.push(p); }
            function undo() {
                let best = null, bestSeq = -Infinity;
                providers.forEach(function (p) { try { if (p.canUndo()) { const s = p.topUndoSeq(); if (s > bestSeq) { bestSeq = s; best = p; } } } catch (e) {} });
                if (best) { best.undo(); return true; }
                return false;
            }
            function redo() {
                let best = null, bestSeq = Infinity;
                providers.forEach(function (p) { try { if (p.canRedo()) { const s = p.topRedoSeq(); if (s < bestSeq) { bestSeq = s; best = p; } } } catch (e) {} });
                if (best) { best.redo(); return true; }
                return false;
            }
            return { register: register, undo: undo, redo: redo, _providers: providers };
        })();
        window.UndoManager.register(uiUndoProvider);
        if (window.__sketchUndoProvider) window.UndoManager.register(window.__sketchUndoProvider);
        if (window.__layerHistory) window.UndoManager.register(window.__layerHistory);
        function toggleCheckbox(id) {
            const el = document.getElementById(id);
            if (!el) return;
            pushUndo();
            el.checked = !el.checked;
            el.dispatchEvent(new Event('change'));
        }
        function adjustBrush(delta, coarse=false) {
            const el = document.getElementById('brushSize');
            if (!el) return;
            const step = coarse ? 5 : 1;
            let v = parseFloat(el.value || '11');
            const min = parseFloat(el.min || '1');
            const max = parseFloat(el.max || '30');
            v = Math.min(max, Math.max(min, v + delta * step));
            pushUndo();
            el.value = String(v);
            el.style.setProperty('--val', v);
            config.SPLAT_RADIUS = v / 1000;
        }
        function stepPaletteOnce(forward=true) {
            if (typeof getStepColorList !== 'function') return;
            const list = getStepColorList();
            if (!list || !list.length) return;
            const len = list.length;
            if (forward) {
                const hex = list[paletteStepIndex % len];
                paletteStepIndex = (paletteStepIndex + 1) % len;
                const cp = document.getElementById('colorPicker');
                if (cp) cp.value = hex;
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                pointer.color = [r, g, b];
            } else {
                paletteStepIndex = (paletteStepIndex - 1 + len) % len;
                const hex = list[paletteStepIndex];
                const cp = document.getElementById('colorPicker');
                if (cp) cp.value = hex;
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                pointer.color = [r, g, b];
            }
            if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
        }
        window.stepPaletteOnce = stepPaletteOnce;
        function cycleSelect(el, dir) {
            if (!el) return;
            const opts = el.options;
            if (!opts || !opts.length) return;
            let idx = el.selectedIndex;
            idx = Math.min(opts.length - 1, Math.max(0, idx + dir));
            if (idx !== el.selectedIndex) {
                pushUndo();
                el.selectedIndex = idx;
                el.dispatchEvent(new Event('change'));
            }
        }
        document.addEventListener('keydown', (e) => {
            if (isTypingTarget(e.target)) return;
            const key = e.key;
            const lower = key.length === 1 ? key.toLowerCase() : key;
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            // Fullscreen (F11) — convenience toggle for the Window Mode setting
            // in the sidebar's Display section, which is the real authority.
            if (key === 'F11') {
                e.preventDefault();
                if (window.displayMode) {
                    window.displayMode.toggleFullscreen();
                } else if (!document.fullscreenElement) {
                    const el = document.documentElement;
                    if (el.requestFullscreen) el.requestFullscreen();
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
                return;
            }
            // Hotkey modal
            if (key === 'F1' || (e.shiftKey && (key === '?' || key === '/'))) {
                e.preventDefault();
                toggleHotkeys();
                return;
            }
            // Escape: close hotkey modal first, then stop all recording/playback
            if (key === 'Escape') {
                if (hotkeyOverlay && hotkeyOverlay.style.display === 'flex') {
                    hideHotkeys();
                    return;
                }
                // Stop all recording and playback
                if (recEnabled && typeof recStopAll === 'function') {
                    e.preventDefault();
                    recStopAll();
                    return;
                }
                return;
            }
            // ── Recording transport: F9 ──
            if (key === 'F9') {
                e.preventDefault();
                if (!recEnabled) return;
                if (e.shiftKey) {
                    // Shift+F9: record immediately (skip countdown)
                    if (typeof recStartRecording === 'function') recStartRecording();
                } else {
                    // F9: toggle record (with countdown)
                    if (typeof recToggleRecord === 'function') recToggleRecord();
                }
                return;
            }
            // ── Space transport ──
            // Record mode keeps its playback transport; otherwise Space drives
            // the sim: Space = stop/unstop fluid motion (freeze), Shift+Space =
            // pause/unpause the simulation.
            if (key === ' ') {
                e.preventDefault();
                // OS key auto-repeat fires keydown ~25-30 Hz while held — a
                // held Space must not strobe freeze/pause (or the playback
                // transport) into a parity-random end state.
                if (e.repeat) return;
                if (recEnabled) {
                    if (e.shiftKey) {
                        // Shift+Space: play all / pause all
                        if (typeof recTogglePlaybackAll === 'function') recTogglePlaybackAll();
                    } else {
                        // Space: play / pause active layer
                        if (typeof recTogglePlayback === 'function') recTogglePlayback();
                    }
                    return;
                }
                if (e.shiftKey) {
                    if (typeof window.togglePause === 'function') window.togglePause();
                } else {
                    if (typeof window.toggleFreeze === 'function') window.toggleFreeze();
                }
                return;
            }
            // Undo/Redo
            if (ctrlOrMeta && lower === 'z') {
                e.preventDefault();
                // D6: unified recency-ordered undo across paint strokes, UI-state
                // and layer ops — Ctrl+Z undoes the most-recent action regardless
                // of paint mode (UndoManager picks the highest-seq provider).
                if (e.shiftKey) window.UndoManager.redo(); else window.UndoManager.undo();
                return;
            }
            if (ctrlOrMeta && lower === 'y') {
                e.preventDefault();
                window.UndoManager.redo();
                return;
            }
            // Ctrl+Shift+N: new recording layer
            if (ctrlOrMeta && e.shiftKey && lower === 'n') {
                e.preventDefault();
                if (recEnabled && typeof recAddLayer === 'function') recAddLayer();
                return;
            }
            // Delete: clear active recording layer
            if (key === 'Delete' && !ctrlOrMeta && !e.altKey && !e.shiftKey) {
                if (recEnabled && typeof recClearActive === 'function') {
                    e.preventDefault();
                    recClearActive();
                    return;
                }
            }
            // Toggles
            if (!ctrlOrMeta && !e.altKey) {
                // 't' was bound to a 'trailToggle' element that does not exist
                // anywhere (removed long ago) — the key silently did nothing and
                // the help surfaces advertised it. Left unbound deliberately.
                if (lower === 'c') { toggleCheckbox('cursorToggle'); return; }
                if (lower === 'h') { toggleCheckbox('showCanvasHandles'); return; }
                if (lower === 'l') { toggleCheckbox('lockCanvasBorders'); return; }
                if (lower === 'r') { toggleCheckbox('randomColor'); return; }
                if (lower === 'a') { toggleCheckbox('stepPalette'); return; }
                // E: Quick export (video)
                if (lower === 'e' && !e.shiftKey) {
                    e.preventDefault();
                    if (window.fluidExport) window.fluidExport.video();
                    return;
                }
                // M: Trigger mutation
                if (lower === 'm' && !e.shiftKey) {
                    e.preventDefault();
                    var mutBtn = document.getElementById('mutationGenerate');
                    if (mutBtn) mutBtn.click();
                    return;
                }
                if (key === '[') { adjustBrush(-1, e.shiftKey); return; }
                if (key === ']') { adjustBrush(1, e.shiftKey); return; }
                if (lower === 'n') { stepPaletteOnce(!e.shiftKey); return; }
                if (e.shiftKey && lower === 's' && typeof window.saveColor === 'function') { e.preventDefault(); pushUndo(); window.saveColor(); return; }
                if (e.shiftKey && lower === 'x' && typeof window.clearColors === 'function') { e.preventDefault(); pushUndo(); window.clearColors(); return; }
            }
            // ── Layer navigation: ↑/↓ (unmodified) ──
            if (!ctrlOrMeta && !e.altKey && !e.shiftKey) {
                if (key === 'ArrowUp' && recEnabled && typeof recCycleLayer === 'function') {
                    e.preventDefault();
                    recCycleLayer(-1);
                    return;
                }
                if (key === 'ArrowDown' && recEnabled && typeof recCycleLayer === 'function') {
                    e.preventDefault();
                    recCycleLayer(1);
                    return;
                }
            }
            // Palette cycling
            if (ctrlOrMeta && (key === 'ArrowLeft' || key === 'ArrowRight')) {
                e.preventDefault();
                if (typeof window.cyclePalette === 'function') { pushUndo(); window.cyclePalette(key === 'ArrowLeft' ? -1 : 1); }
                return;
            }
            // Resolution cycling
            if (e.altKey && !ctrlOrMeta) {
                if (key === 'ArrowUp' || key === 'ArrowDown') {
                    e.preventDefault();
                    if (e.shiftKey) cycleSelect(document.getElementById('physicsResolution'), key === 'ArrowUp' ? 1 : -1);
                    else cycleSelect(document.getElementById('visualResolution'), key === 'ArrowUp' ? 1 : -1);
                    return;
                }
            }
        });
        // Seed initial undo state after UI init
        try { pushUndo(); } catch (e) { /* noop */ }
        // Initialize layer order with sim at the top
        layerOrder = [{ type: 'sim' }];
        // Expose layer system for collision module and other integrations
        window.layers = layers;
        window.layerOrder = layerOrder;
        window.renderLayers = renderLayers;
        renderLayers();
        // Initialize Recorded Layers UI
        setupRecUI();
        recRenderUI();
        // Expose recording layer accessors for preset save/load integration
        window.recGetLayersSnapshot = function() {
            if (!recLayers || !recLayers.length) return null;
            return recLayers.map(function(layer) {
                return {
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
                };
            });
        };
        window.recRestoreLayersSnapshot = function(layersData) {
            if (!Array.isArray(layersData) || !layersData.length) return;
            // Stop any current recording/playback
            if (typeof recStopAll === 'function') recStopAll();
            recLayers = [];
            recNextLayerId = 1;
            layersData.forEach(function(ld) {
                var layer = recCreateLayer(ld.name);
                layer.visible = ld.visible !== false;
                layer.isLooping = ld.isLooping !== undefined ? !!ld.isLooping : true;
                layer.loopMaxMs = (typeof ld.loopMaxMs === 'number') ? ld.loopMaxMs : (typeof recMaxDurationMs === 'number' ? recMaxDurationMs : 10000);
                layer.colorMode = (typeof recMigrateColorMode === 'function') ? recMigrateColorMode(ld.colorMode) : (ld.colorMode || 'original');
                layer.recordMode = ld.recordMode || 'main';
                layer.recordStepPalette = ld.recordStepPalette || null;
                if (ld.mask) {
                    layer.mask = {
                        enabled: !!ld.mask.enabled,
                        mode: ld.mask.mode || 'show',
                        shapes: ld.mask.shapes || []
                    };
                }
                layer.timeline.interactions = (ld.timeline && ld.timeline.interactions) || [];
                layer.timeline.duration = (ld.timeline && ld.timeline.duration) || 0;
                layer.timeline.playbackPosition = 0;
            });
            recActiveLayerId = recLayers[0] ? recLayers[0].id : null;
            recRenderUI();
        };
        window.recGetActiveLayerId = function() { return recActiveLayerId; };
        window.recIsEnabled = function() { return recEnabled; };
        update();
        // Workaround (Electron): simulate a real resize to lock canvas/framebuffer sync.
        // Must mirror what a manual drag-resize does: change wrapper CSS, then call
        // updateCanvasSize() which sets canvas.style.width/height to explicit pixels,
        // sets canvas.width/height, and flags needsFramebufferReinit.
        setTimeout(function() {
            var w = canvasWrapper.clientWidth;
            var h = canvasWrapper.clientHeight;
            canvasWrapper.style.width = (w + 1) + 'px';
            canvasWrapper.style.height = (h + 1) + 'px';
            if (typeof window.updateCanvasSize === 'function') window.updateCanvasSize();
            requestAnimationFrame(function() {
                canvasWrapper.style.width = w + 'px';
                canvasWrapper.style.height = h + 'px';
                if (typeof window.updateCanvasSize === 'function') window.updateCanvasSize();
            });
        }, 500);

        // ── First-run hint (Steam prep S2-8) ────────────────────────────────
        // There is zero onboarding: a new player gets a maximized window, a
        // dense mixer strip, and no pointer to "just drag on the canvas".
        // One-time toast, gone on first paint gesture or after 12s.
        (function firstRunHint() {
            try {
                if (localStorage.getItem('fluidFirstRunDone')) return;
                var show = function () {
                    var hint = document.createElement('div');
                    hint.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:9000;' +
                        'background:rgba(13,17,23,.92);color:#e6edf3;border:1px solid rgba(255,255,255,.18);' +
                        'border-radius:10px;padding:12px 22px;font:14px/1.5 "Segoe UI",sans-serif;' +
                        'box-shadow:0 8px 32px rgba(0,0,0,.55);pointer-events:none;transition:opacity .6s';
                    hint.textContent = '🖌️ Drag on the canvas to paint · F1 for shortcuts';
                    document.body.appendChild(hint);
                    var done = false;
                    var dismiss = function () {
                        if (done) return; done = true;
                        try { localStorage.setItem('fluidFirstRunDone', '1'); } catch (_) {}
                        hint.style.opacity = '0';
                        setTimeout(function () { hint.remove(); }, 700);
                        window.removeEventListener('pointerdown', dismiss, true);
                    };
                    window.addEventListener('pointerdown', dismiss, true);
                    setTimeout(dismiss, 12000);
                };
                // Wait for the splash to be gone / scripts ready
                var poll = setInterval(function () {
                    if (window.__scriptsReady) { clearInterval(poll); setTimeout(show, 1200); }
                }, 300);
            } catch (_) {}
        })();
