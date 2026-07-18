// ═══════════════════════════════════════════════════════════════════
// js/05l-layers-transform.js — part 12/14 of former 05-fluid-sim.js (lines 3898–4301)
// LOAD ORDER: after 05k-layers-render.js, before 05m-layer-masks.js
// PROVIDES: layer toggle/delete, active-layer drag, resize/rotate handles, updateLayerPosition
// REQUIRES: 05k
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        window.toggleSimLayer = () => {
            const isVisible = canvas.style.display !== 'none';
            canvas.style.display = isVisible ? 'none' : 'block';
            renderLayers();
        };
        window.toggleLayer = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer) {
                layer.visible = !layer.visible;
                // D2 raster layers have no backing div (GPU-composited)
                const layerDiv = document.getElementById(`layer${index}`);
                if (layerDiv) layerDiv.style.display = layer.visible ? 'block' : 'none';
                renderLayers();
            }
        };
        window.deleteLayer = (index) => {
            // D2: free a raster layer's GPU buffer + history before the
            // arrays forget it existed
            if (window.rasterLayers) window.rasterLayers._onDeleted(index);
            const layerDiv = document.getElementById(`layer${index}`);
            if (layerDiv) {
                layerDiv.style.backgroundImage = '';
                layerDiv.style.display = 'none';
                layerDiv.style.zIndex = '';
                layerDiv.classList.remove('active');
                // D3-3: clear the CSS clip so it can't bleed onto a reused slot
                layerDiv.style.webkitMaskImage = '';
                layerDiv.style.maskImage = '';
            }
            // Remove from layers array
            layers = layers.filter(l => l.index !== index);
            window.layers = layers;
            // Remove from layerOrder array
            layerOrder = layerOrder.filter(item => !(item.type === 'layer' && item.id === index));
            window.layerOrder = layerOrder;
            // Re-render and update z-indices
            renderLayers();
        };
        // Image layer mask functions
        window.toggleImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                layer.mask.enabled = !layer.mask.enabled;
                layer.__maskDirty = true; // 7.6: reorder-reapply memo
                applyLayerMask(index);
                renderLayers();
            }
        };
        window.editImageLayerMask = (index) => {
            if (typeof window.enterImageLayerMaskMode === 'function') {
                window.enterImageLayerMaskMode(index);
            }
        };
        window.collisionFromMask = (index) => {
            if (window.collisionLayers && typeof window.collisionLayers.createFromLayerMask === 'function') {
                window.collisionLayers.createFromLayerMask(index);
            } else {
                console.warn('Collision system not available');
            }
        };
        window.clearImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                if (confirm('Clear mask for this layer?')) {
                    layer.mask.shapes = [];
                    layer.mask.enabled = false;
                    renderLayers();
                }
            }
        };
        // Layer positioning functionality
        let activeLayerIndex = null;
        let isDraggingLayer = false;
        let layerDragStartX = 0;
        let layerDragStartY = 0;
        let layerStartX = 0;
        let layerStartY = 0;
        window.toggleActiveLayer = (index) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            // Deactivate all other layers and remove their handles
            layers.forEach(l => {
                if (l.index !== index) {
                    l.active = false;
                    const div = document.getElementById(`layer${l.index}`);
                    if (div) {
                        div.classList.remove('active');
                        removeLayerResizeHandles(l.index);
                    }
                }
            });
            // Toggle this layer
            layer.active = !layer.active;
            const layerDiv = document.getElementById(`layer${index}`);
            if (layer.active) {
                layerDiv.classList.add('active');
                activeLayerIndex = index;
                createLayerResizeHandles(index);
                // Don't disable canvas pointer events just for selecting layer
                // Only disable when actually dragging/resizing
            } else {
                layerDiv.classList.remove('active');
                activeLayerIndex = null;
                removeLayerResizeHandles(index);
                // Re-enable canvas pointer events when deactivating
                canvas.style.pointerEvents = 'auto';
            }
            renderLayers();
        };
        function disablePointerEventsExceptActive(activeIndex) {
            canvas.style.pointerEvents = 'none';
            layers.forEach(l => {
                const div = document.getElementById(`layer${l.index}`);
                if (div && l.index !== activeIndex) {
                    div.style.pointerEvents = 'none';
                }
            });
        }
        function enableAllPointerEvents() {
            canvas.style.pointerEvents = 'auto';
            layers.forEach(l => {
                const div = document.getElementById(`layer${l.index}`);
                if (div) {
                    div.style.pointerEvents = l.visible ? 'none' : 'none';
                }
            });
        }
        function createLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            // Remove any existing handles first
            removeLayerResizeHandles(index);
            const handles = [
                { class: 'corner layer-resize-nw', dir: 'nw' },
                { class: 'edge layer-resize-n', dir: 'n' },
                { class: 'corner layer-resize-ne', dir: 'ne' },
                { class: 'edge layer-resize-e', dir: 'e' },
                { class: 'corner layer-resize-se', dir: 'se' },
                { class: 'edge layer-resize-s', dir: 's' },
                { class: 'corner layer-resize-sw', dir: 'sw' },
                { class: 'edge layer-resize-w', dir: 'w' }
            ];
            handles.forEach(handle => {
                const div = document.createElement('div');
                div.className = `layer-resize-handle ${handle.class}`;
                div.dataset.direction = handle.dir;
                div.dataset.layerIndex = index;
                div.style.touchAction = 'none';
                div.style.userSelect = 'none';
                div.addEventListener('pointerdown', handleLayerResizeStart);
                layerDiv.appendChild(div);
            });
            const rotateHandle = document.createElement('div');
            rotateHandle.className = 'layer-rotate-handle';
            rotateHandle.dataset.layerIndex = index;
            rotateHandle.style.touchAction = 'none';
            rotateHandle.style.userSelect = 'none';
            rotateHandle.innerHTML = '🔄';
            rotateHandle.addEventListener('pointerdown', handleLayerRotateStart);
            layerDiv.appendChild(rotateHandle);
        }
        function removeLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            const handles = layerDiv.querySelectorAll('.layer-resize-handle, .layer-rotate-handle');
            handles.forEach(handle => handle.remove());
        }
        // Layer resize functionality
        let isResizingLayer = false;
        let layerResizeDirection = null;
        let resizeLayerIndex = null;
        let layerResizeStartX = 0;
        let layerResizeStartY = 0;
        let layerResizeStartScaleX = 1;
        // Layer rotation functionality
        let isRotatingLayer = false;
        let rotateLayerIndex = null;
        let layerRotateStartAngle = 0;
        let layerRotateStartRotation = 0;
        let layerRotatePointerId = null;
        let layerRotateHandleEl = null;
        let layerResizeStartScaleY = 1;
        let layerResizeStartPosX = 0;
        let layerResizeStartPosY = 0;
        let layerResizePointerId = null;
        let layerResizeHandleEl = null;
        function handleLayerResizeStart(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            isResizingLayer = true;
            layerResizeDirection = e.target.dataset.direction;
            resizeLayerIndex = parseInt(e.target.dataset.layerIndex);
            layerResizePointerId = e.pointerId;
            layerResizeHandleEl = e.currentTarget || e.target;
            try { if (layerResizeHandleEl && layerResizeHandleEl.setPointerCapture) layerResizeHandleEl.setPointerCapture(e.pointerId); } catch (_) {}
            const layer = layers.find(l => l.index === resizeLayerIndex);
            if (!layer) return;
            layerResizeStartX = e.clientX;
            layerResizeStartY = e.clientY;
            layerResizeStartScaleX = layer.scaleX;
            layerResizeStartScaleY = layer.scaleY;
            layerResizeStartPosX = layer.x;
            layerResizeStartPosY = layer.y;
            disablePointerEventsExceptActive(resizeLayerIndex);
        }
        function handleLayerRotateStart(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            isRotatingLayer = true;
            rotateLayerIndex = parseInt(e.target.dataset.layerIndex);
            layerRotatePointerId = e.pointerId;
            layerRotateHandleEl = e.currentTarget || e.target;
            try { if (layerRotateHandleEl && layerRotateHandleEl.setPointerCapture) layerRotateHandleEl.setPointerCapture(e.pointerId); } catch (_) {}
            const layer = layers.find(l => l.index === rotateLayerIndex);
            disablePointerEventsExceptActive(rotateLayerIndex);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${rotateLayerIndex}`);
            if (!layerDiv) return;
            const rect = layerDiv.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            layerRotateStartAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            layerRotateStartRotation = layer.rotation || 0;
        }
        // Add pointer event listeners to canvas wrapper for layer dragging
        canvasWrapper.style.touchAction = 'none';
        canvasWrapper.addEventListener('pointerdown', (e) => {
            if (e.target && e.target.closest && e.target.closest('input[type="range"]')) return;
            if (activeLayerIndex === null) return;
            if (e.target.classList.contains('layer-resize-handle') || e.target.classList.contains('layer-rotate-handle')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer || !layer.active) return;
            const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
            if (!layerDiv) return;
            const rect = layerDiv.getBoundingClientRect();
            const clickX = e.clientX;
            const clickY = e.clientY;
            if (clickX < rect.left || clickX > rect.right || clickY < rect.top || clickY > rect.bottom) {
                return;
            }
            isDraggingLayer = true;
            layerDragStartX = e.clientX;
            layerDragStartY = e.clientY;
            layerStartX = layer.x;
            layerStartY = layer.y;
            layerDragPointerId = e.pointerId;
            layerDragCaptureEl = canvasWrapper;
            try { if (layerDragCaptureEl && layerDragCaptureEl.setPointerCapture) layerDragCaptureEl.setPointerCapture(e.pointerId); } catch (_) {}
            layerDiv.classList.add('dragging');
            disablePointerEventsExceptActive(activeLayerIndex);
            e.preventDefault();
        });
        document.addEventListener('pointermove', (e) => {
            // Handle layer rotation
            if (isRotatingLayer && rotateLayerIndex !== null && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                const layer = layers.find(l => l.index === rotateLayerIndex);
                if (!layer) return;
                const layerDiv = document.getElementById(`layer${rotateLayerIndex}`);
                if (!layerDiv) return;
                const rect = layerDiv.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                const angleDelta = currentAngle - layerRotateStartAngle;
                layer.rotation = layerRotateStartRotation + angleDelta;
                updateLayerPosition(rotateLayerIndex);
                if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
                return;
            }
            // Handle layer resizing
            if (isResizingLayer && resizeLayerIndex !== null && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                const layer = layers.find(l => l.index === resizeLayerIndex);
                if (!layer) return;
                const deltaX = e.clientX - layerResizeStartX;
                const deltaY = e.clientY - layerResizeStartY;
                const canvasWidth = canvasWrapper.clientWidth;
                const canvasHeight = canvasWrapper.clientHeight;
                // Calculate scale change based on direction
                const scaleFactorX = deltaX / canvasWidth;
                const scaleFactorY = deltaY / canvasHeight;
                switch (layerResizeDirection) {
                    case 'se': // Bottom-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'sw': // Bottom-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'ne': // Top-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                    case 'nw': // Top-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                    case 'e': // Right edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        break;
                    case 'w': // Left edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        break;
                    case 's': // Bottom edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'n': // Top edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                }
                updateLayerPosition(resizeLayerIndex);
                if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
                return;
            }
            // Handle layer dragging
            if (!isDraggingLayer || activeLayerIndex === null || (layerDragPointerId != null && e.pointerId !== layerDragPointerId)) return;
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer) return;
            const deltaX = e.clientX - layerDragStartX;
            const deltaY = e.clientY - layerDragStartY;
            layer.x = layerStartX + deltaX;
            layer.y = layerStartY + deltaY;
            updateLayerPosition(activeLayerIndex);
            if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                window.collisionLayers.updateObstacleFromLayers();
            }
        });
        document.addEventListener('pointerup', (e) => {
            let collisionDirty = false;
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                collisionDirty = true;
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
                if (activeLayerIndex !== null) {
                    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
                    if (layerDiv) layerDiv.classList.remove('dragging');
                }
                enableAllPointerEvents();
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                collisionDirty = true;
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
                enableAllPointerEvents();
            }
            if (isRotatingLayer && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                collisionDirty = true;
                isRotatingLayer = false;
                rotateLayerIndex = null;
                try { if (layerRotateHandleEl && layerRotateHandleEl.releasePointerCapture) layerRotateHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerRotatePointerId = null;
                layerRotateHandleEl = null;
                enableAllPointerEvents();
            }
            // Re-composite collision after any layer transform change
            if (collisionDirty && window.collisionLayers && window.collisionLayers.enabled) {
                window.collisionLayers.updateObstacleFromLayers();
            }
        });
        document.addEventListener('pointercancel', (e) => {
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
                if (activeLayerIndex !== null) {
                    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
                    if (layerDiv) layerDiv.classList.remove('dragging');
                }
                enableAllPointerEvents();
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
                enableAllPointerEvents();
            }
            if (isRotatingLayer && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                isRotatingLayer = false;
                rotateLayerIndex = null;
                try { if (layerRotateHandleEl && layerRotateHandleEl.releasePointerCapture) layerRotateHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerRotatePointerId = null;
                layerRotateHandleEl = null;
                enableAllPointerEvents();
            }
        });
        function updateLayerPosition(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            const rotation = layer.rotation || 0;
            layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) rotate(${rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`;
            // Apply mask if enabled
            applyLayerMask(index);
        }
        // ═══ D2: raster paint layers ════════════════════════════════════
        // GPU-backed persistent paint layers: pixels live in rasterStore
        // (RGBA8 dye-res FBOs, declared in 05c so initFramebuffers can
        // preserve them across reinits). They are first-class layers[]
        // citizens — ordered/reordered in layerOrder alongside the sim and
        // the DOM image layers — but have NO backing div: displayFrag
        // composites them inside the GL canvas (raw vUv, after fluid
        // effects), so stills/video export inherit them from the canvas
        // snapshot for free. The lexical `sketch` alias (05c) always points
        // at the ACTIVE raster layer's FBO, which keeps every existing
        // __sketch* path (stamp/clear/ignite/capture/undo) working verbatim
        // on "the layer you're painting into".
        (function () {
            const RASTER_SLOTS = 4; // displayFrag sampler budget (uRaster0..3)
            const MODE_INT = { normal: 0, multiply: 1, screen: 2, add: 3 };
            let _activeRasterId = null;
            const _slots = [];                        // reused per frame (zero-GC)
            const _slotPool = [{}, {}, {}, {}];
            let _thumbTimer = null;
            const _thumbPending = {};
            const _EMPTY_THUMB = (function () {
                const c = document.createElement('canvas');
                c.width = c.height = 8;
                return c.toDataURL();
            })();
            function _layerFor(id) { return layers.find(l => l.index === id && l.isRaster) || null; }
            function _nextIndex() {
                // ≥100 keeps clear of the 0-9 static-div slots; dynamic
                // collision indices (maxIndex+1) simply continue above us
                let mx = 99;
                layers.forEach(l => { if (l.index > mx) mx = l.index; });
                return mx + 1;
            }
            function _newFBO() {
                return createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
            }
            function setActive(id) {
                const layer = _layerFor(id);
                if (!layer || !rasterStore[id]) return false;
                _activeRasterId = id;
                sketch = rasterStore[id];
                window.sketch = sketch;
                // patch the panel highlight in place (no full re-render)
                document.querySelectorAll('.layer-item[data-raster="1"]').forEach(el => {
                    const on = parseInt(el.dataset.layerIndex, 10) === id;
                    el.classList.toggle('raster-active', on);
                    const btn = el.querySelector('.raster-paint-btn');
                    if (btn) btn.classList.toggle('active', on);
                });
                if (typeof window.__onActiveRasterChanged === 'function') window.__onActiveRasterChanged(id, layer.title);
                return true;
            }
            function create(name) {
                const id = _nextIndex();
                rasterStore[id] = _newFBO();
                layers.push({
                    index: id,
                    title: name || ('Paint ' + (layers.filter(l => l.isRaster).length + 1)),
                    data: _EMPTY_THUMB, originalData: null,
                    visible: true, active: false, threshold: 0,
                    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
                    isRaster: true, opacity: 1, blendMode: 'normal',
                    mask: { enabled: false, mode: 'show', shapes: [] }
                });
                // insert just above the sim entry — new paint composites
                // over the fluid, like the original sketch layer did
                const simIdx = layerOrder.findIndex(o => o.type === 'sim');
                layerOrder.splice(simIdx >= 0 ? simIdx : 0, 0, { type: 'layer', id: id });
                setActive(id);
                if (typeof renderLayers === 'function') renderLayers();
                return id;
            }
            function ensureDefault() {
                if (layers.some(l => l.isRaster)) {
                    if (_activeRasterId == null || !_layerFor(_activeRasterId) || !rasterStore[_activeRasterId]) {
                        const first = layers.find(l => l.isRaster && rasterStore[l.index]);
                        if (first) setActive(first.index);
                    }
                    return _activeRasterId;
                }
                return create('Sketch');
            }
            function _onDeleted(id) {
                if (!rasterStore[id]) return;
                gl.deleteTexture(rasterStore[id].texture);
                gl.deleteFramebuffer(rasterStore[id].fbo);
                delete rasterStore[id];
                if (typeof window.__sketchUndoPurge === 'function') window.__sketchUndoPurge(id);
                // let the live collider binding notice its source is gone
                // (23's refresh sees the missing FBO and auto-unbinds)
                if (typeof window.__onSketchMutated === 'function') window.__onSketchMutated(id);
                if (_activeRasterId === id) {
                    _activeRasterId = null;
                    sketch = null;
                    window.sketch = null;
                    const next = layers.find(l => l.isRaster && l.index !== id && rasterStore[l.index]);
                    if (next) setActive(next.index);
                    // else: the next sketch-route dab lazily recreates a default
                    else if (typeof window.__onActiveRasterChanged === 'function') window.__onActiveRasterChanged(null, null);
                }
            }
            // Per-frame: visible raster layers in composite order (bottom →
            // top, so below-fluid slots come first), capped at the shader's
            // 4-slot budget — the TOPMOST extras drop (painting order wins).
            function collectSlots() {
                _slots.length = 0;
                let passedSim = false;
                for (let i = layerOrder.length - 1; i >= 0; i--) {
                    const item = layerOrder[i];
                    if (item.type === 'sim') { passedSim = true; continue; }
                    const layer = _layerFor(item.id);
                    if (!layer || !layer.visible) continue;
                    const f = rasterStore[layer.index];
                    if (!f) continue;
                    if (_slots.length >= RASTER_SLOTS) break;
                    const s = _slotPool[_slots.length];
                    s.texture = f.texture;
                    s.opacity = (typeof layer.opacity === 'number') ? layer.opacity : 1;
                    s.mode = MODE_INT[layer.blendMode] || 0;
                    s.under = !passedSim;
                    // D3 clip binding: a Mask's coverage gates this layer
                    const cf = (layer.clipMaskId != null && window.Masks)
                        ? window.Masks.getFBO(layer.clipMaskId) : null;
                    s.clipTex = cf ? cf.texture : null;
                    s.clipInvert = !!layer.clipInvert;
                    _slots.push(s);
                }
                return _slots;
            }
            // Readback → 2D canvas, flipped to top-down and UNPREMULTIPLIED
            // (the FBO stores premultiplied; PNG wants straight — without
            // the divide, every save/restore round-trip darkens the edges).
            function _readbackCanvas(f, outW, outH) {
                const px = new Uint8Array(f.width * f.height * 4);
                gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
                gl.readPixels(0, 0, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                const c = document.createElement('canvas');
                c.width = f.width; c.height = f.height;
                const ctx = c.getContext('2d');
                const img = ctx.createImageData(f.width, f.height);
                for (let y = 0; y < f.height; y++) {
                    const src = (f.height - 1 - y) * f.width * 4;
                    const dst = y * f.width * 4;
                    for (let x = 0; x < f.width * 4; x += 4) {
                        const a = px[src + x + 3];
                        const inv = a > 0 ? 255 / a : 0;
                        img.data[dst + x] = Math.min(255, px[src + x] * inv);
                        img.data[dst + x + 1] = Math.min(255, px[src + x + 1] * inv);
                        img.data[dst + x + 2] = Math.min(255, px[src + x + 2] * inv);
                        img.data[dst + x + 3] = a;
                    }
                }
                ctx.putImageData(img, 0, 0);
                if (outW && (outW !== f.width || outH !== f.height)) {
                    const small = document.createElement('canvas');
                    small.width = outW; small.height = outH;
                    small.getContext('2d').drawImage(c, 0, 0, outW, outH);
                    return small;
                }
                return c;
            }
            // Coalesced panel-thumbnail refresh (stroke-END cadence via
            // __onRasterMutated, never per dab — same rule as the live
            // collider readback in 23).
            function _queueThumb(rid) {
                _thumbPending[rid] = true;
                if (_thumbTimer) return;
                _thumbTimer = setTimeout(function () {
                    _thumbTimer = null;
                    Object.keys(_thumbPending).forEach(function (k) {
                        delete _thumbPending[k];
                        const id = parseInt(k, 10);
                        const layer = _layerFor(id);
                        const f = rasterStore[id];
                        if (!layer || !f) return;
                        const th = Math.max(1, Math.round(96 * f.height / f.width));
                        layer.data = _readbackCanvas(f, 96, th).toDataURL();
                        const thumbEl = document.querySelector('.layer-item[data-layer-index="' + id + '"] .layer-thumbnail');
                        if (thumbEl) thumbEl.style.backgroundImage = 'url(' + layer.data + ')';
                    });
                }, 200);
            }
            window.__onRasterMutated = function (rid) { if (rid != null) _queueThumb(rid); };
            // Full-res layer.data refresh — called by save (12) right before
            // serializing so raster pixels round-trip through presets.
            function syncData() {
                layers.forEach(function (layer) {
                    if (!layer.isRaster) return;
                    const f = rasterStore[layer.index];
                    if (f) layer.data = _readbackCanvas(f).toDataURL('image/png');
                });
            }
            // (Re)create a restored layer's FBO and upload its saved pixels.
            function restoreFromData(layer) {
                if (!rasterStore[layer.index]) rasterStore[layer.index] = _newFBO();
                if (!layer.data) return;
                const img = new Image();
                img.onload = function () {
                    const f = rasterStore[layer.index];
                    if (!f) return; // deleted while the image decoded
                    const c = document.createElement('canvas');
                    c.width = f.width; c.height = f.height;
                    c.getContext('2d').drawImage(img, 0, 0, f.width, f.height);
                    gl.bindTexture(gl.TEXTURE_2D, f.texture);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                    _queueThumb(layer.index);
                };
                img.src = layer.data;
            }
            // After a preset load rebuilt layers[]: free orphaned FBOs,
            // create+refill FBOs for restored raster layers, re-point the
            // active alias.
            function reconcile() {
                Object.keys(rasterStore).forEach(function (k) {
                    const id = parseInt(k, 10);
                    if (!_layerFor(id)) {
                        gl.deleteTexture(rasterStore[id].texture);
                        gl.deleteFramebuffer(rasterStore[id].fbo);
                        delete rasterStore[id];
                        if (typeof window.__sketchUndoPurge === 'function') window.__sketchUndoPurge(id);
                    }
                });
                layers.forEach(function (layer) {
                    if (layer.isRaster && !rasterStore[layer.index]) restoreFromData(layer);
                });
                if (_activeRasterId == null || !_layerFor(_activeRasterId) || !rasterStore[_activeRasterId]) {
                    _activeRasterId = null;
                    sketch = null;
                    window.sketch = null;
                    const first = layers.find(function (l) { return l.isRaster && rasterStore[l.index]; });
                    if (first) setActive(first.index);
                }
            }
            window.rasterLayers = {
                create: create,
                ensureDefault: ensureDefault,
                setActive: setActive,
                activeId: function () { return _activeRasterId; },
                getFBO: function (id) { return rasterStore[id] || null; },
                list: function () { return layers.filter(function (l) { return l.isRaster; }); },
                collectSlots: collectSlots,
                restoreFromData: restoreFromData,
                reconcile: reconcile,
                syncData: syncData,
                _onDeleted: _onDeleted
            };
            // Boot: create the default Sketch layer once the whole chain is
            // up (renderLayers/applyLayerMask live in later chunks — poll,
            // the same pattern 23-depth-collision uses for deleteLayer).
            (function boot() {
                if (window.__scriptsReady) { ensureDefault(); }
                else setTimeout(boot, 120);
            })();
        })();
