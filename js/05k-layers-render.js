// ═══════════════════════════════════════════════════════════════════
// js/05k-layers-render.js — part 11/14 of former 05-fluid-sim.js (lines 3490–3897)
// LOAD ORDER: after 05j-update-loop.js, before 05l-layers-transform.js
// PROVIDES: renderLayers, layer drag&drop handlers, buildEncapsulatedRange, updateLayerZIndices
// REQUIRES: layers/layerOrder lexical (declared here or earlier)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        function renderLayers() {
            // Ensure all layers have mask property
            if (typeof ensureLayerMasks === 'function') {
                ensureLayerMasks();
            }
            const panel = document.getElementById('layersPanel');
            panel.innerHTML = '';
            // layerOrder is in visual order: index 0 = top (closest to viewer), last = bottom (furthest)
            // We'll assign z-indices in reverse: top items get highest z-index
            // Add top drop zone
            const topZone = document.createElement('div');
            topZone.className = 'drop-zone';
            topZone.dataset.dropPosition = 'top';
            topZone.textContent = '↑ Drop here for top (closest to viewer)';
            topZone.addEventListener('dragover', handleDropZoneDragOver);
            topZone.addEventListener('drop', handleDropZoneDrop);
            topZone.addEventListener('dragleave', handleDragLeave);
            panel.appendChild(topZone);
            // Render all items in layerOrder
            layerOrder.forEach((item, idx) => {
                const element = document.createElement('div');
                element.className = 'layer-item layer-item-collapsible';
                // Only header is draggable; the whole item is NOT draggable to avoid slider conflicts
                element.draggable = false;
                element.dataset.orderIndex = idx; // Store position in order array
                // Check if layer is collapsed (stored in layer object or default to false)
                const isCollapsed = item.type === 'sim' ? false : (layers.find(l => l.index === item.id)?.collapsed || false);
                if (isCollapsed) element.classList.add('collapsed');
                if (item.type === 'sim') {
                    element.dataset.layerType = 'sim';
                    element.innerHTML = `
                        <div class="layer-item-header">
                            <div class="layer-thumbnail" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                                🌊
                            </div>
                            <div class="layer-info">
                                <input type="text" class="layer-title" value="Sim Layer" readonly>
                            </div>
                            <div class="layer-controls">
                                <button class="layer-btn" onclick="toggleSimLayer()">${canvas.style.display !== 'none' ? '👁️' : '👁️‍🗨️'}</button>
                            </div>
                        </div>
                    `;
                    const headerElSim = element.querySelector('.layer-item-header');
                    if (headerElSim) headerElSim.draggable = true;
                    const titleInput = element.querySelector('.layer-title');
                    if (titleInput) {
                        const prev = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                        ['dragstart','mousedown','pointerdown','touchstart'].forEach(evt => titleInput.addEventListener(evt, prev, { capture: true }));
                    }
                } else {
                    const layer = layers.find(l => l.index === item.id);
                    if (!layer) return; // Skip if layer not found
                    element.dataset.layerIndex = layer.index;
                    if (layer.active) {
                        element.classList.add('active-layer');
                    }
                    const hasMask = layer.mask?.shapes?.length > 0;
                    element.innerHTML = `
                        <div class="layer-item-header">
                            <div class="layer-thumbnail" style="background-image: url(${layer.data})"></div>
                            <div class="layer-info">
                                <input type="text" class="layer-title" value="${layer.title}" 
                                       onchange="updateLayerTitle(${layer.index}, this.value)">
                            </div>
                            <div class="layer-controls">
                                <button class="layer-btn layer-collapse-btn" data-action="collapse" data-layer="${layer.index}" title="${layer.collapsed ? 'Expand' : 'Collapse'}">${layer.collapsed ? '▼' : '▲'}</button>
                                <button class="layer-btn" onclick="window.LayerTransform ? LayerTransform.open(${layer.index}) : toggleActiveLayer(${layer.index})" title="Move / resize / rotate layer">
                                    ⤢
                                </button>
                                <button class="layer-btn" onclick="toggleLayer(${layer.index})">
                                    ${layer.visible ? '👁️' : '👁️‍🗨️'}
                                </button>
                                <button class="layer-btn layer-mask-btn ${hasMask ? 'has-mask' : ''} ${layer.mask?.enabled ? 'active' : ''}" onclick="toggleImageLayerMask(${layer.index})" title="${hasMask ? (layer.mask?.enabled ? 'Disable Mask' : 'Enable Mask') : 'No mask defined'}">✂️</button>
                                <button class="layer-btn" onclick="deleteLayer(${layer.index})">🗑️</button>
                            </div>
                        </div>
                        <div class="layer-item-body">
                        ${hasMask ? `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px; align-items:center; flex-wrap:wrap;">
                            <button class="mask-control-btn" onclick="editImageLayerMask(${layer.index})" title="Edit Mask">✏️ Edit Mask</button>
                            <button class="mask-control-btn mask-clear-btn" onclick="clearImageLayerMask(${layer.index})" title="Clear Mask">🗑️ Clear</button>
                            <span style="font-size:11px; opacity:0.7;">${layer.mask.shapes.length} shape${layer.mask.shapes.length !== 1 ? 's' : ''}</span>
                        </div>
                        ` : `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px;">
                            <button class="mask-control-btn mask-create-btn" onclick="editImageLayerMask(${layer.index})" title="Create Mask">✂️ Create Mask</button>
                        </div>
                        `}
                        <div class="layer-threshold">
                            <span>${hasMask ? 'Feather:' : 'Mask:'}</span>
                            <div class="layer-slider-host"></div>
                            <span class="layer-slider-value">${layer.threshold}%</span>
                        </div>
                        ${!layer.isCollision ? `
                        <div style="margin-bottom:6px;">
                            <button class="mask-control-btn" onclick="collisionFromMask(${layer.index})" title="Generate collision layer from current mask or threshold" style="width:100%;background:rgba(255,160,60,0.13);border-color:rgba(255,160,60,0.35);text-align:center;">🧱 Generate Collision Layer</button>
                        </div>
                        ` : ''}
                        ${layer.isCollision ? `
                        <div class="collision-controls" data-collision-layer="${layer.index}">
                            <div class="collision-row">
                                <label class="collision-label">Mode</label>
                                <select class="collision-mode-select" data-ci="${layer.index}">
                                    <option value="block" ${layer.collisionMode === 'block' ? 'selected' : ''}>Block</option>
                                    <option value="slow" ${layer.collisionMode === 'slow' ? 'selected' : ''}>Slow</option>
                                    <option value="deflect" ${layer.collisionMode === 'deflect' ? 'selected' : ''}>Deflect</option>
                                </select>
                            </div>
                            <div class="collision-row">
                                <label class="collision-label">Strength</label>
                                <div class="collision-slider-host" data-cs="${layer.index}"></div>
                                <span class="collision-strength-val">${(layer.collisionStrength || 0.7).toFixed(1)}</span>
                            </div>
                            <div class="collision-row">
                                <label class="collision-label">Threshold</label>
                                <div class="collision-slider-host" data-ct="${layer.index}"></div>
                                <span class="collision-threshold-val">${layer.mask?.shapes?.[0]?.threshold || 128}</span>
                            </div>
                            <div class="collision-row">
                                <label class="collision-toggle"><input type="checkbox" class="collision-invert-cb" data-cinv="${layer.index}" ${layer.mask?.shapes?.[0]?.invert ? 'checked' : ''}> Invert</label>
                                <button type="button" class="collision-refresh-btn" data-cref="${layer.index}" title="Re-run depth estimation">🔄</button>
                            </div>
                        </div>
                        ` : ''}
                        </div>
                    `;
                    // Create encapsulated slider in host
                    const host = element.querySelector('.layer-slider-host');
                    const valueEl = element.querySelector('.layer-slider-value');
                    const headerEl = element.querySelector('.layer-item-header');
                    if (headerEl) headerEl.draggable = true;
                    if (host && valueEl) {
                        const slider = buildEncapsulatedRange({ min: 0, max: 100, value: layer.threshold, step: 1, className: 'encapsulated-slider slider-gray' });
                        host.appendChild(slider);
                        slider.addEventListener('input', () => {
                            valueEl.textContent = slider.value + '%';
                            updateLayerThreshold(layer.index, slider.value);
                        });
                        // Temporarily disable parent draggable while interacting with slider to avoid HTML5 DnD starting
                        const itemEl = element; // .layer-item
                        const disable = () => { isLayerSliderActive = true; if (headerEl) headerEl.draggable = false; if (itemEl) itemEl.dataset.sliderActive = '1'; };
                        const enable = () => { isLayerSliderActive = false; if (headerEl) headerEl.draggable = true; if (itemEl) delete itemEl.dataset.sliderActive; };
                        ['pointerdown','mousedown','touchstart'].forEach(evt => slider.addEventListener(evt, disable, { passive: true }));
                        ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => slider.addEventListener(evt, enable, { passive: true }));
                    }
                    // Wire collision controls if present
                    if (layer.isCollision) {
                        // Mode select
                        const modeSelect = element.querySelector('.collision-mode-select');
                        if (modeSelect) {
                            modeSelect.addEventListener('change', (e) => {
                                e.stopPropagation();
                                layer.collisionMode = e.target.value;
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                            modeSelect.addEventListener('mousedown', (e) => e.stopPropagation());
                        }
                        // Strength slider
                        const strengthHost = element.querySelector('[data-cs="' + layer.index + '"]');
                        const strengthVal = element.querySelector('.collision-strength-val');
                        if (strengthHost) {
                            const sSlider = buildEncapsulatedRange({ min: 0, max: 100, value: Math.round((layer.collisionStrength || 0.7) * 100), step: 1, className: 'encapsulated-slider slider-orange' });
                            strengthHost.appendChild(sSlider);
                            sSlider.addEventListener('input', () => {
                                const v = parseInt(sSlider.value) / 100;
                                layer.collisionStrength = v;
                                if (strengthVal) strengthVal.textContent = v.toFixed(1);
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                            const dis = () => { isLayerSliderActive = true; if (headerEl) headerEl.draggable = false; };
                            const en = () => { isLayerSliderActive = false; if (headerEl) headerEl.draggable = true; };
                            ['pointerdown','mousedown','touchstart'].forEach(evt => sSlider.addEventListener(evt, dis, { passive: true }));
                            ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => sSlider.addEventListener(evt, en, { passive: true }));
                        }
                        // Threshold slider
                        const threshHost = element.querySelector('[data-ct="' + layer.index + '"]');
                        const threshVal = element.querySelector('.collision-threshold-val');
                        if (threshHost) {
                            const depthShape = layer.mask?.shapes?.find(s => s.type === 'depth-mask');
                            const tSlider = buildEncapsulatedRange({ min: 0, max: 255, value: depthShape?.threshold || 128, step: 1, className: 'encapsulated-slider slider-orange' });
                            threshHost.appendChild(tSlider);
                            tSlider.addEventListener('input', () => {
                                const v = parseInt(tSlider.value);
                                if (threshVal) threshVal.textContent = v;
                                if (depthShape) depthShape.threshold = v;
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                            const dis = () => { isLayerSliderActive = true; if (headerEl) headerEl.draggable = false; };
                            const en = () => { isLayerSliderActive = false; if (headerEl) headerEl.draggable = true; };
                            ['pointerdown','mousedown','touchstart'].forEach(evt => tSlider.addEventListener(evt, dis, { passive: true }));
                            ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => tSlider.addEventListener(evt, en, { passive: true }));
                        }
                        // Invert checkbox — stop propagation on all pointer/click events
                        // to prevent parent drag handlers from eating the interaction
                        const invertCb = element.querySelector('.collision-invert-cb');
                        const invertLabel = element.querySelector('.collision-toggle');
                        if (invertCb) {
                            const stopProp = (ev) => ev.stopPropagation();
                            ['click', 'mousedown', 'pointerdown', 'touchstart'].forEach(evt => {
                                invertCb.addEventListener(evt, stopProp);
                                if (invertLabel) invertLabel.addEventListener(evt, stopProp);
                            });
                            invertCb.addEventListener('change', () => {
                                const depthShape = layer.mask?.shapes?.find(s => s.type === 'depth-mask');
                                if (depthShape) depthShape.invert = invertCb.checked;
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                        }
                        // Refresh button
                        const refreshBtn = element.querySelector('.collision-refresh-btn');
                        if (refreshBtn) {
                            refreshBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (window.collisionLayers) window.collisionLayers.refreshDepth(layer.index);
                            });
                        }
                    }
                }
                // Collapse toggle button handler
                const collapseBtn = element.querySelector('.layer-collapse-btn');
                if (collapseBtn) {
                    collapseBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const layerIdx = parseInt(collapseBtn.dataset.layer, 10);
                        const layer = layers.find(l => l.index === layerIdx);
                        if (layer) {
                            layer.collapsed = !layer.collapsed;
                            element.classList.toggle('collapsed', layer.collapsed);
                            collapseBtn.textContent = layer.collapsed ? '▼' : '▲';
                            collapseBtn.title = layer.collapsed ? 'Expand' : 'Collapse';
                        }
                    });
                }
                // Only start drags from the header
                const headerEl = element.querySelector('.layer-item-header');
                if (headerEl) headerEl.addEventListener('dragstart', handleDragStart);
                // Guard: block dragstart initiated anywhere else in the item (capture)
                element.addEventListener('dragstart', (e) => {
                    if (isLayerSliderActive || !(e.target && e.target.closest && e.target.closest('.layer-item-header'))) { e.preventDefault(); e.stopPropagation(); }
                }, true);
                // Guard: prevent header text input from initiating drags
                const titleInput = element.querySelector('.layer-title');
                if (titleInput) {
                    const prev = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                    ['dragstart','mousedown','pointerdown','touchstart'].forEach(evt => titleInput.addEventListener(evt, prev, { capture: true }));
                }
                element.addEventListener('dragover', handleDragOver);
                element.addEventListener('drop', handleDrop);
                element.addEventListener('dragend', handleDragEnd);
                element.addEventListener('dragleave', handleDragLeave);
                panel.appendChild(element);
            });
            // Add bottom drop zone
            const bottomZone = document.createElement('div');
            bottomZone.className = 'drop-zone';
            bottomZone.dataset.dropPosition = 'bottom';
            bottomZone.textContent = '↓ Drop here for bottom (furthest from viewer)';
            bottomZone.addEventListener('dragover', handleDropZoneDragOver);
            bottomZone.addEventListener('drop', handleDropZoneDrop);
            bottomZone.addEventListener('dragleave', handleDragLeave);
            panel.appendChild(bottomZone);
            updateLayerZIndices();
        }
        let draggedElement = null;
        let isLayerSliderActive = false;
        let layerDragGuardInstalled = false;
        if (!layerDragGuardInstalled) {
            document.addEventListener('dragstart', (e) => {
                if (isLayerSliderActive) { e.preventDefault(); e.stopPropagation(); }
            }, true);
            document.addEventListener('selectstart', (e) => {
                if (isLayerSliderActive) { e.preventDefault(); e.stopPropagation(); }
            }, true);
            layerDragGuardInstalled = true;
        }
        function handleDragStart(e) {
            // If slider is active on this item, cancel
            const item = (e.currentTarget && e.currentTarget.closest) ? e.currentTarget.closest('.layer-item') : null;
            if (item && item.dataset.sliderActive === '1') { e.preventDefault(); return; }
            // Do not start drag from interactive controls
            if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) { e.preventDefault(); return; }
            draggedElement = item || this;
            if (draggedElement && draggedElement.classList) draggedElement.classList.add('dragging');
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        }
        function handleDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.layer-item');
            if (target && target !== draggedElement) {
                target.classList.add('drag-over');
            }
            return false;
        }
        function handleDragLeave(e) {
            const target = e.target.closest('.layer-item');
            if (target) target.classList.remove('drag-over');
        }
        function handleDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            e.preventDefault();
            const target = e.target.closest('.layer-item');
            if (!target || !draggedElement || draggedElement === target) {
                if (target) target.classList.remove('drag-over');
                return false;
            }
            const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
            const targetOrderIndex = parseInt(target.dataset.orderIndex);
            // Simple reordering: remove from old position, insert at target position
            const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
            layerOrder.splice(targetOrderIndex, 0, draggedItem);
            renderLayers();
            target.classList.remove('drag-over');
            return false;
        }
        function handleDragEnd(e) {
            this.classList.remove('dragging');
            document.querySelectorAll('.layer-item, .drop-zone').forEach(item => {
                item.classList.remove('drag-over');
            });
        }
        function handleDropZoneDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
            return false;
        }
        function handleDropZoneDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            e.preventDefault();
            const dropPosition = this.dataset.dropPosition;
            const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
            // Remove from current position
            const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
            if (dropPosition === 'top') {
                // Add to beginning (top = closest to viewer = highest z-index)
                layerOrder.unshift(draggedItem);
            } else if (dropPosition === 'bottom') {
                // Add to end (bottom = furthest from viewer = lowest z-index)
                layerOrder.push(draggedItem);
            }
            renderLayers();
            this.classList.remove('drag-over');
            return false;
        }
        // Build a slider that doesn't bubble events (encapsulated component)
        function buildEncapsulatedRange({ min = 0, max = 100, value = 0, step = 1, className = '' } = {}) {
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.className = className || '';
            input.setAttribute('draggable', 'false');
            // Prevent bubbling into layer drag/resize
            const stop = (ev) => { ev.stopPropagation(); };
            const stopAndPrevent = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
            ['mousedown','mouseup','click','dblclick','pointerdown','pointerup','pointermove','touchstart','touchmove','touchend','wheel','dragstart','contextmenu','keydown','keyup'].forEach(evt => {
                input.addEventListener(evt, evt === 'wheel' || evt === 'dragstart' ? stopAndPrevent : stop, { passive: false });
            });
            return input;
        }
        function updateLayerZIndices() {
            // layerOrder[0] = top (closest to viewer) = highest z-index
            // layerOrder[last] = bottom (furthest from viewer) = lowest z-index
            // We assign z-indices in reverse order of the array
            const BASE_Z_INDEX = 1000;
            layerOrder.forEach((item, visualIndex) => {
                // Higher visual index = lower in list = further from viewer = lower z-index
                const zIndex = BASE_Z_INDEX - visualIndex;
                if (item.type === 'sim') {
                    canvas.style.zIndex = zIndex;
                } else {
                    const layer = layers.find(l => l.index === item.id);
                    if (layer) {
                        const layerDiv = document.getElementById(`layer${layer.index}`);
                        if (layerDiv) {
                            layerDiv.style.zIndex = zIndex;
                            layerDiv.style.display = layer.visible ? 'block' : 'none';
                            // Ensure all transform properties have default values
                            const x = layer.x || 0;
                            const y = layer.y || 0;
                            const scaleX = layer.scaleX || 1;
                            const scaleY = layer.scaleY || 1;
                            const rotation = layer.rotation || 0;
                            layerDiv.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`;
                            // Apply active class
                            if (layer.active) {
                                layerDiv.classList.add('active');
                            } else {
                                layerDiv.classList.remove('active');
                            }
                            // Reapply mask / threshold so visual state survives reorder
                            const hasMask = layer.mask?.shapes?.length > 0;
                            if (hasMask && layer.mask.enabled) {
                                applyLayerMask(layer.index);
                            } else if (layer.threshold > 0) {
                                applyRudimentaryMask(layer.index);
                            } else {
                                applyLayerMask(layer.index);
                            }
                        }
                    }
                }
            });
        }
