// ═══════════════════════════════════════════════════════════════════
// js/05k-layers-render.js — part 11/14 of former 05-fluid-sim.js (lines 3490–3897)
// LOAD ORDER: after 05j-update-loop.js, before 05l-layers-transform.js
// PROVIDES: renderLayers, layer drag&drop handlers, buildEncapsulatedRange, updateLayerZIndices
// REQUIRES: layers/layerOrder lexical (declared here or earlier)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // The Clip dropdown's rows. Every silhouette already in the project
        // shows up here by name — paintable Masks, other layers' shape masks,
        // colliders — so clipping never needs a conversion step first (05o
        // ClipSources owns the naming and the -1/-2 disambiguation).
        // Pressing in a layer's name field stands that row's drag handle down
        // (see the title-input guard in renderLayers). Putting it back on the
        // field's own blur is not enough — the press can end anywhere, and a
        // row left undraggable cannot be reordered until something re-renders
        // it. One document-level release, installed once, restores every
        // header the moment any pointer goes up.
        if (!window.__layerTitleDragReleaseInstalled) {
            window.__layerTitleDragReleaseInstalled = true;
            const releaseHeaders = () => {
                if (isLayerSliderActive) return;  // a slider drag owns it right now
                document.querySelectorAll('.layer-item-header').forEach((h) => {
                    if (document.activeElement && document.activeElement.classList
                        && document.activeElement.classList.contains('layer-title')
                        && h.contains(document.activeElement)) return;  // still being typed in
                    h.draggable = true;
                });
            };
            ['pointerup', 'mouseup', 'pointercancel', 'dragend', 'focusout']
                .forEach(evt => document.addEventListener(evt, releaseHeaders, true));
        }
        // One header shape for every row type. The only controls in it are the
        // name and a show/hide checkbox — collapsing is the header ITSELF
        // (click anywhere that is not those two), and the state reads off a
        // caret on the top border instead of a button competing for the same
        // space. o.visTarget is 'sim' or the layer index.
        function layerHeaderHTML(o) {
            const titleAttrs = o.readonly
                ? ' readonly'
                : ` onchange="updateLayerTitle(${o.index}, this.value)"`;
            return `<div class="layer-item-header">
                                <span class="layer-collapse-caret" aria-hidden="true"></span>
                                <div class="layer-thumbnail"${o.thumbStyle ? ` style="${o.thumbStyle}"` : ''}>${o.thumbText || ''}</div>
                                <div class="layer-info">
                                    <input type="text" class="layer-title" value="${window.escHtml(o.title)}"${titleAttrs}>
                                </div>
                                <div class="layer-controls">
                                    <label class="layer-vis" title="Show or hide this layer">
                                        <input type="checkbox" class="layer-vis-check" data-vis="${o.visTarget}"${o.visible ? ' checked' : ''}>
                                        <span class="layer-vis-box"></span>
                                    </label>
                                </div>
                            </div>`;
        }
        // Surface one layer: open the Layers section, expand that row, and
        // scroll it into view. A new layer is inserted BELOW the sim and every
        // row defaults to collapsed, so something arriving without this — a
        // paste especially — leaves no trace in the panel to act on.
        window.revealLayerRow = function revealLayerRow(index) {
            const layer = layers.find(l => l.index === index);
            if (layer) layer.collapsed = false;
            if (typeof window.openSidebarSection === 'function') {
                window.openSidebarSection('.sidebar-section.section-layers');
            }
            renderLayers();
            // renderLayers rebuilt the panel, so the row to scroll to is a new
            // node — find it after the DOM settles, not before.
            setTimeout(function () {
                const row = document.querySelector('.layer-item[data-layer-index="' + index + '"]');
                if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
            }, 0);
        };
        function clipSourceOptions(layer) {
            if (!window.ClipSources) return '';
            const cur = window.ClipSources.keyOf(layer);
            return window.ClipSources.list(layer.index).map(s =>
                `<option value="${window.escHtml(s.key)}" ${s.key === cur ? 'selected' : ''}>${window.escHtml(s.label)}</option>`
            ).join('');
        }
        function setClipSourceOn(layer, value) {
            if (window.ClipSources) window.ClipSources.set(layer, value || null);
            else layer.clipMaskId = value === '' ? null : parseInt(value, 10);
        }
        function renderLayers() {
            // Ensure all layers have mask property
            if (typeof ensureLayerMasks === 'function') {
                ensureLayerMasks();
            }
            const panel = document.getElementById('layersPanel');
            panel.innerHTML = '';
            // layerOrder is in visual order: index 0 = top (closest to viewer), last = bottom (furthest)
            // We'll assign z-indices in reverse: top items get highest z-index
            // No add-a-paint-layer button (2026-08-18). Paint layers are
            // made on demand: the first sketch-route dab mints one (05i
            // stampSketchDab — rasterLayers.ensureDefault), and a project
            // that carries one is adopted at boot. The panel listing them
            // does not also need to advertise minting an empty one.
            // Add top drop zone
            const topZone = document.createElement('div');
            topZone.className = 'drop-zone';
            topZone.dataset.dropPosition = 'top';
            topZone.textContent = '↑ Drop here for top (closest to viewer)';
            topZone.addEventListener('dragover', handleDropZoneDragOver);
            topZone.addEventListener('drop', handleDropZoneDrop);
            topZone.addEventListener('dragleave', handleDragLeave);
            panel.appendChild(topZone);
            // Rows default to COLLAPSED. An expanded row measures ~277px
            // against a list only a few hundred tall, so leaving every layer
            // open is what made it impossible to see more than one at a time
            // (collapsed a row is ~84px). The layer you're painting into stays
            // open so the thing you're working on is never the hidden one.
            //
            // `collapsed` is runtime-only — nothing serialises it — so the
            // undefined case below is the normal one on every load, and an
            // explicit boolean only ever comes from the user's own ▲/▼ click.
            // That's why this tests the type rather than truthiness: `false`
            // has to mean "they opened it", not "never asked".
            const collapsedByDefault = (layer) => {
                if (!layer) return false;
                if (typeof layer.collapsed === 'boolean') return layer.collapsed;
                const activeRaster = window.rasterLayers ? window.rasterLayers.activeId() : null;
                return !(layer.isRaster && layer.index === activeRaster);
            };
            // Render all items in layerOrder
            layerOrder.forEach((item, idx) => {
                const element = document.createElement('div');
                element.className = 'layer-item layer-item-collapsible';
                // Only header is draggable; the whole item is NOT draggable to avoid slider conflicts
                element.draggable = false;
                element.dataset.orderIndex = idx; // Store position in order array
                const isCollapsed = item.type === 'sim' ? false : collapsedByDefault(layers.find(l => l.index === item.id));
                if (isCollapsed) element.classList.add('collapsed');
                if (item.type === 'sim') {
                    element.dataset.layerType = 'sim';
                    element.innerHTML = layerHeaderHTML({
                        title: 'Sim Layer', readonly: true, visTarget: 'sim',
                        visible: canvas.style.display !== 'none',
                        thumbStyle: 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:600; letter-spacing:.1em; color:rgba(255,255,255,.9);',
                        thumbText: 'SIM'
                    });
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
                    if (layer.isRaster) {
                        // D2 raster paint layer: GPU-backed (composited in
                        // displayFrag, no DOM div) — the panel item exposes
                        // opacity / blend mode / paint-target instead of the
                        // div-based mask + transform controls.
                        element.dataset.raster = '1';
                        const rOpacity = (typeof layer.opacity === 'number') ? layer.opacity : 1;
                        const isActiveRaster = !!(window.rasterLayers && window.rasterLayers.activeId() === layer.index);
                        if (isActiveRaster) element.classList.add('raster-active');
                        element.innerHTML = `
                            ${layerHeaderHTML({
                                title: layer.title, index: layer.index, visTarget: layer.index,
                                visible: layer.visible,
                                thumbStyle: `background-image: url('${window.safeImageUrl(layer.thumb || layer.data)}'); background-size: cover;`
                            })}
                            <div class="layer-item-body">
                                <div class="layer-action-row">
                                    <button class="layer-btn raster-paint-btn ${isActiveRaster ? 'active' : ''}" onclick="window.rasterLayers && rasterLayers.setActive(${layer.index})" title="Paint into this layer (the brush's 'Paint Into: Sketch' route lands here)">Paint</button>
                                    <button class="layer-btn layer-delete-btn" onclick="deleteLayer(${layer.index})" title="Delete this layer">Delete</button>
                                </div>
                                <div class="layer-threshold">
                                    <span>Opacity:</span>
                                    <div class="raster-opacity-host"></div>
                                    <span class="raster-opacity-val">${Math.round(rOpacity * 100)}%</span>
                                </div>
                                <div class="collision-row" style="margin-top:4px;">
                                    <label class="collision-label">Blend</label>
                                    <select class="raster-blend-select">
                                        <option value="normal" ${(!layer.blendMode || layer.blendMode === 'normal') ? 'selected' : ''}>Normal</option>
                                        <option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option>
                                        <option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
                                        <option value="add" ${layer.blendMode === 'add' ? 'selected' : ''}>Add</option>
                                    </select>
                                </div>
                                <div class="collision-row" style="margin-top:4px;">
                                    <label class="collision-label">Clip</label>
                                    <select class="raster-clip-select">
                                        <option value="">None</option>
                                        ${clipSourceOptions(layer)}
                                    </select>
                                    <label class="collision-toggle"><input type="checkbox" class="raster-clip-invert" ${layer.clipInvert ? 'checked' : ''}> Inv</label>
                                </div>
                            </div>
                        `;
                        const headerElR = element.querySelector('.layer-item-header');
                        if (headerElR) headerElR.draggable = true;
                        const oHost = element.querySelector('.raster-opacity-host');
                        const oVal = element.querySelector('.raster-opacity-val');
                        if (oHost) {
                            const oSlider = buildEncapsulatedRange({ min: 0, max: 100, value: Math.round(rOpacity * 100), step: 1, className: 'encapsulated-slider' });
                            oHost.appendChild(oSlider);
                            oSlider.addEventListener('input', () => {
                                layer.opacity = parseInt(oSlider.value, 10) / 100;
                                if (oVal) oVal.textContent = oSlider.value + '%';
                            });
                            const disR = () => { isLayerSliderActive = true; if (headerElR) headerElR.draggable = false; };
                            const enR = () => { isLayerSliderActive = false; if (headerElR) headerElR.draggable = true; };
                            ['pointerdown','mousedown','touchstart'].forEach(evt => oSlider.addEventListener(evt, disR, { passive: true }));
                            ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => oSlider.addEventListener(evt, enR, { passive: true }));
                        }
                        const bSel = element.querySelector('.raster-blend-select');
                        if (bSel) {
                            bSel.addEventListener('change', (e) => { e.stopPropagation(); layer.blendMode = e.target.value; });
                            bSel.addEventListener('mousedown', (e) => e.stopPropagation());
                        }
                        // D3 clip binding controls
                        const cSel = element.querySelector('.raster-clip-select');
                        if (cSel) {
                            cSel.addEventListener('change', (e) => {
                                e.stopPropagation();
                                setClipSourceOn(layer, e.target.value);
                            });
                            cSel.addEventListener('mousedown', (e) => e.stopPropagation());
                        }
                        const cInv = element.querySelector('.raster-clip-invert');
                        if (cInv) {
                            const stopP = (ev) => ev.stopPropagation();
                            ['click', 'mousedown', 'pointerdown', 'touchstart'].forEach(evt => cInv.addEventListener(evt, stopP));
                            cInv.addEventListener('change', () => { layer.clipInvert = cInv.checked; });
                        }
                    } else {
                    if (layer.active) {
                        element.classList.add('active-layer');
                    }
                    const hasMask = layer.mask?.shapes?.length > 0;
                    // Whether the mask (or, on a collision layer, the collider)
                    // is switched on is STATE, not an action — so it is the same
                    // checkbox the header uses for show/hide, captioned, and it
                    // leads its row the way the header's does. It used to be a
                    // button that turned blue, sitting among Edit/Clear as if it
                    // were a third verb.
                    const maskOn = !!layer.mask?.enabled;
                    const maskToggle = `<label class="layer-check" title="${layer.isCollision ? (maskOn ? 'Collision ON — uncheck to disable this collider' : 'Collision OFF — check to enable') : (hasMask ? (maskOn ? 'Mask on — uncheck to show the whole layer' : 'Mask off — check to apply it') : 'No mask defined yet')}">
                                <input type="checkbox" class="layer-mask-check" data-layer="${layer.index}"${maskOn ? ' checked' : ''}${(hasMask || layer.isCollision) ? '' : ' disabled'}>
                                <span class="layer-vis-box"></span>
                                <span class="layer-check-label">${layer.isCollision ? 'Collision' : 'Mask'}</span>
                            </label>`;
                    // Neither of these belongs on a collision layer, and both are
                    // gated on the one flag — isPaintedColliderLayer requires it
                    // too, so painted and generated colliders are covered alike.
                    //
                    // Fluidize pours a layer's picture into the dye and hides the
                    // layer. A collider is the thing dye flows AROUND, so there it is
                    // either a no-op or actively wrong: a painted collider has no
                    // image to pour (05m says so out loud, 'Could not fluidize that
                    // layer'), and an imported-image one dumps its picture into the
                    // sim and switches the wall off as a side effect.
                    //
                    // Layer from Visible cuts the masked region out as a new picture
                    // layer. A collider's mask is its WALL, not artwork — the
                    // cut-out is a silhouette of the shape you are flowing around,
                    // which is not a thing anyone reaches for that button to get.
                    //
                    // Built as a list because a collider now contributes nothing to
                    // this row, and an empty div would still hold its margin.
                    const actionBtns = [
                        (hasMask && !layer.isCollision) ? `<button class="layer-btn" onclick="window.layerFromVisible && layerFromVisible(${layer.index})" title="Cut out what this mask is showing as a new layer of its own. The original keeps its mask, so you can carry on slicing pieces off it.">Layer from Visible</button>` : '',
                        layer.isCollision ? '' : `<button class="layer-btn" onclick="window.splatLayerToSim && splatLayerToSim(${layer.index})" title="${hasMask ? 'Turn what this mask is showing into fluid' : 'Turn this whole picture into fluid'} — it becomes dye in its own colours and the flow takes it from there. The layer hides itself once poured; unhide it to pour again. Not undoable: it dissolves on its own.">Fluidize</button>`
                    ].filter(Boolean).join('');
                    element.innerHTML = `
                        ${layerHeaderHTML({
                            title: layer.title, index: layer.index, visTarget: layer.index,
                            visible: layer.visible,
                            thumbStyle: `background-image: url('${window.safeImageUrl(layer.thumb || layer.data)}')`
                        })}
                        <div class="layer-item-body">
                        <div class="layer-threshold">
                            <span>${hasMask ? 'Feather' : 'Mask'}</span>
                            <div class="layer-slider-host"></div>
                            <span class="layer-slider-value">${layer.threshold}%</span>
                        </div>
                        <div class="layer-action-row">
                            <button class="layer-btn" onclick="window.LayerTransform ? LayerTransform.open(${layer.index}) : toggleActiveLayer(${layer.index})" title="Move / resize / rotate layer">Transform</button>
                            <button class="layer-btn layer-delete-btn" onclick="deleteLayer(${layer.index})" title="Delete this layer">Delete</button>
                        </div>
                        ${actionBtns ? `<div class="layer-action-row">${actionBtns}</div>` : ''}
                        <div class="layer-group">
                        <div class="layer-group-title">${layer.isCollision ? 'Collision' : 'Masks'}</div>
                        ${window.isPaintedColliderLayer && window.isPaintedColliderLayer(layer) ? `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px; align-items:center; flex-wrap:wrap;">
                            ${maskToggle}
                            <button class="mask-control-btn" onclick="window.enterColliderMaskMode(${layer.index})" title="Draw and erase this collider's walls over the artwork">Edit Collider</button>
                        </div>
                        ` : hasMask ? `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px; align-items:center; flex-wrap:wrap;">
                            ${maskToggle}
                            <span style="font-size:11px; opacity:0.7;">${layer.mask.shapes.length} shape${layer.mask.shapes.length !== 1 ? 's' : ''}</span>
                            <button class="mask-control-btn" onclick="editImageLayerMask(${layer.index})" title="Edit Mask">Edit Mask</button>
                            <button class="mask-control-btn mask-clear-btn" onclick="clearImageLayerMask(${layer.index})" title="Clear Mask">Clear Mask</button>
                        </div>
                        ` : `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                            <button class="mask-control-btn mask-create-btn" onclick="editImageLayerMask(${layer.index})" title="Create Mask">Create Mask</button>
                        </div>
                        `}
                        ${!layer.isCollision ? `
                        <div class="collision-row" style="margin-top:4px;">
                            <label class="collision-label">Clip</label>
                            <select class="img-clip-select">
                                <option value="">None</option>
                                ${clipSourceOptions(layer)}
                            </select>
                            <label class="collision-toggle"><input type="checkbox" class="img-clip-invert" ${layer.clipInvert ? 'checked' : ''}> Inv</label>
                        </div>
                        ` : ''}
                        ${!layer.isCollision ? `
                        <div style="margin-bottom:6px;">
                            <button class="mask-control-btn" onclick="collisionFromMask(${layer.index})" title="Generate collision layer from current mask or threshold" style="width:100%;background:rgba(255,160,60,0.13);border-color:rgba(255,160,60,0.35);text-align:center;">Generate Collision Layer</button>
                        </div>
                        ` : ''}
                        ${layer.isCollision ? `
                        <div class="collision-controls" data-collision-layer="${layer.index}">
                            <div class="collision-row">
                                <label class="collision-label">Strength</label>
                                <div class="collision-slider-host" data-cs="${layer.index}"></div>
                                <span class="collision-strength-val">${(layer.collisionStrength || 0.7).toFixed(1)}</span>
                            </div>
                            ${window.isPaintedColliderLayer && window.isPaintedColliderLayer(layer) ? '' : `
                            <div class="collision-row">
                                <label class="collision-label">Threshold</label>
                                <div class="collision-slider-host" data-ct="${layer.index}"></div>
                                <span class="collision-threshold-val">${layer.mask?.shapes?.[0]?.threshold || 128}</span>
                            </div>
                            <div class="collision-row">
                                <label class="collision-toggle"><input type="checkbox" class="collision-invert-cb" data-cinv="${layer.index}" ${layer.mask?.shapes?.[0]?.invert ? 'checked' : ''}> Invert</label>
                                <button type="button" class="collision-refresh-btn" data-cref="${layer.index}" title="Re-run depth estimation">Refresh</button>
                            </div>
                            `}
                        </div>
                        ` : ''}
                        </div>
                        </div>
                    `;
                    // Create encapsulated slider in host
                    const host = element.querySelector('.layer-slider-host');
                    const valueEl = element.querySelector('.layer-slider-value');
                    const headerEl = element.querySelector('.layer-item-header');
                    if (headerEl) headerEl.draggable = true;
                    if (host && valueEl) {
                        const slider = buildEncapsulatedRange({ min: 0, max: 100, value: layer.threshold, step: 1, className: 'encapsulated-slider' });
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
                    // D3-3: image-layer Clip dropdown + Inv (mirrors the raster clip wiring).
                    // stopPropagation on pointer/mouse events so the layer drag guards don't eat them.
                    const clipSel = element.querySelector('.img-clip-select');
                    if (clipSel) {
                        clipSel.addEventListener('change', (e) => {
                            e.stopPropagation();
                            setClipSourceOn(layer, e.target.value);
                            if (typeof window.applyLayerClip === 'function') window.applyLayerClip(layer.index);
                        });
                        clipSel.addEventListener('mousedown', (e) => e.stopPropagation());
                    }
                    const clipInv = element.querySelector('.img-clip-invert');
                    if (clipInv) {
                        const stopP = (ev) => ev.stopPropagation();
                        ['click','mousedown','pointerdown','touchstart'].forEach(evt => clipInv.addEventListener(evt, stopP));
                        clipInv.addEventListener('change', () => {
                            layer.clipInvert = clipInv.checked;
                            if (typeof window.applyLayerClip === 'function') window.applyLayerClip(layer.index);
                        });
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
                            const sSlider = buildEncapsulatedRange({ min: 0, max: 100, value: Math.round((layer.collisionStrength || 0.7) * 100), step: 1, className: 'encapsulated-slider' });
                            strengthHost.appendChild(sSlider);
                            sSlider.addEventListener('input', () => {
                                const v = parseInt(sSlider.value) / 100;
                                layer.collisionStrength = v;
                                if (strengthVal) strengthVal.textContent = v.toFixed(1);
                                scheduleObstacleUpdate(); // 7.6: debounced during drag
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
                            const tSlider = buildEncapsulatedRange({ min: 0, max: 255, value: depthShape?.threshold || 128, step: 1, className: 'encapsulated-slider' });
                            threshHost.appendChild(tSlider);
                            tSlider.addEventListener('input', () => {
                                const v = parseInt(tSlider.value);
                                if (threshVal) threshVal.textContent = v;
                                if (depthShape) depthShape.threshold = v;
                                scheduleObstacleUpdate(); // 7.6: debounced during drag
                            });
                            // Refresh the visible mask preview on release (full-res redraw is too heavy per input tick)
                            tSlider.addEventListener('change', () => {
                                layer.__maskDirty = true; // 7.6: reorder-reapply memo
                                if (layer.visible && typeof window.applyLayerMask === 'function') window.applyLayerMask(layer.index);
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
                                layer.__maskDirty = true; // 7.6: reorder-reapply memo
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                                if (layer.visible && typeof window.applyLayerMask === 'function') window.applyLayerMask(layer.index);
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
                    } // end non-raster item build
                }
                // Show / hide lives in the header now, as a checkbox — the one
                // control there besides the name. Its own events stop here so
                // the header's collapse click below never sees them.
                const visCheck = element.querySelector('.layer-vis-check');
                if (visCheck) {
                    const swallow = (ev) => ev.stopPropagation();
                    ['click','mousedown','pointerdown','touchstart','dblclick'].forEach(evt =>
                        visCheck.addEventListener(evt, swallow));
                    const visLabel = visCheck.closest('.layer-vis');
                    if (visLabel) ['click','mousedown','pointerdown','touchstart','dblclick'].forEach(evt =>
                        visLabel.addEventListener(evt, swallow));
                    visCheck.addEventListener('change', (ev) => {
                        ev.stopPropagation();
                        const t = visCheck.dataset.vis;
                        if (t === 'sim') { if (typeof toggleSimLayer === 'function') toggleSimLayer(); }
                        else if (typeof toggleLayer === 'function') toggleLayer(parseInt(t, 10));
                    });
                }
                // Mask / collision enable — same control, in the body row.
                const maskCheck = element.querySelector('.layer-mask-check');
                if (maskCheck) {
                    const swallow = (ev) => ev.stopPropagation();
                    const maskLabel = maskCheck.closest('.layer-check');
                    [maskCheck, maskLabel].forEach((el) => {
                        if (!el) return;
                        ['click','mousedown','pointerdown','touchstart','dblclick'].forEach(evt =>
                            el.addEventListener(evt, swallow));
                    });
                    maskCheck.addEventListener('change', (ev) => {
                        ev.stopPropagation();
                        if (typeof toggleImageLayerMask === 'function') {
                            toggleImageLayerMask(parseInt(maskCheck.dataset.layer, 10));
                        }
                    });
                }
                // Only start drags from the header
                const headerEl = element.querySelector('.layer-item-header');
                if (headerEl) headerEl.addEventListener('dragstart', handleDragStart);
                // The header IS the collapse control: anything in it that isn't
                // the name field or the show/hide checkbox opens or closes the
                // row. Deliberately the HEADER only — clicking the body would
                // collapse the row out from under whatever you were adjusting.
                // The Sim row has no body, so it is left alone.
                if (headerEl && item.type !== 'sim') {
                    headerEl.addEventListener('click', (e) => {
                        if (e.target.closest('input, button, select, textarea, label, .layer-vis')) return;
                        const layerIdx = parseInt(element.dataset.layerIndex, 10);
                        const layer = layers.find(l => l.index === layerIdx);
                        // Flip from what's ON SCREEN, not from layer.collapsed —
                        // that starts undefined, and `!undefined` is true, so a
                        // row rendered collapsed by default would "collapse"
                        // again on the first click and appear stuck.
                        const next = !element.classList.contains('collapsed');
                        if (layer) layer.collapsed = next;
                        element.classList.toggle('collapsed', next);
                    });
                }
                // Guard: block dragstart initiated anywhere else in the item (capture)
                element.addEventListener('dragstart', (e) => {
                    if (isLayerSliderActive || !(e.target && e.target.closest && e.target.closest('.layer-item-header'))) { e.preventDefault(); e.stopPropagation(); }
                }, true);
                // Guard: the name field must not drag the row — but it MUST
                // still be clickable. preventDefault() on mousedown/pointerdown
                // is what places the caret, so cancelling those (copied from the
                // read-only Sim row, where it costs nothing) made every layer
                // name unfocusable: clicking it did nothing at all.
                // stopPropagation alone keeps the row's own handlers out of it,
                // and the native HTML5 drag is suppressed the way the sliders in
                // this file already do it — stand the header's draggable down
                // while the field is in use, put it back on blur.
                const titleInput = element.querySelector('.layer-title');
                if (titleInput) {
                    titleInput.setAttribute('draggable', 'false');
                    // ONE handler, because stopPropagation() from a capture
                    // listener on the target skips that node's bubble pass —
                    // a second, non-capture listener here would never run.
                    const armEdit = (ev) => {
                        ev.stopPropagation();
                        if (headerEl) headerEl.draggable = false;
                    };
                    ['mousedown','pointerdown','touchstart','click','dblclick'].forEach(evt =>
                        titleInput.addEventListener(evt, armEdit, { capture: true }));
                    // A drag can only ever start from the header, so cancelling
                    // it here is the one place preventDefault still belongs.
                    titleInput.addEventListener('dragstart', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true });
                    titleInput.addEventListener('focus', () => { if (headerEl) headerEl.draggable = false; });
                    // Enter commits and gets out of the field, so the panel can
                    // re-render (the name is a Clip-source label) without eating
                    // the keystroke as a canvas hotkey.
                    titleInput.addEventListener('keydown', (ev) => {
                        ev.stopPropagation();
                        if (ev.key === 'Enter') titleInput.blur();
                    });
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
        // D3: keep the raster rows' Clip dropdowns in sync with the mask
        // registry (create/delete/rename fire this — rare, full re-render ok)
        window.__onMaskListChanged = function () {
            if (document.getElementById('layersPanel')) renderLayers();
        };
        // 7.6: trailing debounce for obstacle recomposites during collision
        // slider drags — the rAF throttle still recomposited every FRAME of a
        // drag (full CPU compose per tick on big masks); one recomposite per
        // 100ms-idle is indistinguishable and cuts the drag jank.
        let _obsDebounceTimer = null;
        function scheduleObstacleUpdate() {
            if (_obsDebounceTimer) clearTimeout(_obsDebounceTimer);
            _obsDebounceTimer = setTimeout(() => {
                _obsDebounceTimer = null;
                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
            }, 100);
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
        // ── 7.5 drag UX: auto-scroll near panel edges + collapse-others ──
        let dragScrollEl = null;
        let dragScrollRAF = null;
        let dragClientY = -1;
        function findScrollParent(el) {
            let n = el;
            while (n && n !== document.body) {
                const cs = getComputedStyle(n);
                if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
                n = n.parentElement;
            }
            return null;
        }
        function dragScrollTick() {
            dragScrollRAF = null;
            if (!draggedElement || !dragScrollEl) return;
            if (dragClientY >= 0) {
                const r = dragScrollEl.getBoundingClientRect();
                const EDGE = 48;
                let dy = 0;
                // Speed grows with proximity to the edge (max ~12px/frame)
                if (dragClientY < r.top + EDGE) dy = -Math.ceil(Math.min(48, r.top + EDGE - dragClientY) / 4);
                else if (dragClientY > r.bottom - EDGE) dy = Math.ceil(Math.min(48, dragClientY - (r.bottom - EDGE)) / 4);
                if (dy !== 0) dragScrollEl.scrollTop += dy;
            }
            dragScrollRAF = requestAnimationFrame(dragScrollTick);
        }
        function onDocDragOver(e) { dragClientY = e.clientY; }
        function startDragUX() {
            const panel = document.getElementById('layersPanel');
            if (panel) panel.classList.add('layers-dragging'); // CSS collapses other items
            dragScrollEl = panel ? findScrollParent(panel) : null;
            dragClientY = -1;
            document.addEventListener('dragover', onDocDragOver);
            if (!dragScrollRAF) dragScrollRAF = requestAnimationFrame(dragScrollTick);
        }
        function endDragUX() {
            const panel = document.getElementById('layersPanel');
            if (panel) panel.classList.remove('layers-dragging');
            document.removeEventListener('dragover', onDocDragOver);
            if (dragScrollRAF) { cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null; }
            dragScrollEl = null;
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
            startDragUX();
        }
        function handleDragOver(e) {
            // Not an internal row drag (e.g. an OS file drag) — let it bubble
            // to the document-level file-drop handlers (32-file-drop).
            if (!draggedElement) return;
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.layer-item');
            if (target && target !== draggedElement && !target.classList.contains('drag-over')) {
                // Only one insertion marker at a time (fast moves used to strand them)
                const panel = document.getElementById('layersPanel');
                if (panel) panel.querySelectorAll('.drag-over').forEach(el => { if (el !== target) el.classList.remove('drag-over'); });
                target.classList.add('drag-over');
            }
            return false;
        }
        function handleDragLeave(e) {
            const target = e.target.closest('.layer-item');
            if (target) target.classList.remove('drag-over');
        }
        // D6: reorder undo — restore the whole layerOrder in place.
        function _applyLayerOrder(arr) {
            layerOrder.length = 0;
            arr.forEach(function (it) { layerOrder.push(it); });
            window.layerOrder = layerOrder;
            renderLayers();
        }
        function _recordReorderUndo(before) {
            if (!window.__layerHistory || window.__layerHistory.isApplying()) return;
            const after = layerOrder.slice();
            if (JSON.stringify(before) === JSON.stringify(after)) return; // no-op
            window.__layerHistory.push({
                label: 'reorder layers',
                undo: function () { _applyLayerOrder(before); },
                redo: function () { _applyLayerOrder(after); }
            });
        }
        function handleDrop(e) {
            if (!draggedElement) return; // file drag — bubble to 32-file-drop
            if (e.stopPropagation) e.stopPropagation();
            e.preventDefault();
            const target = e.target.closest('.layer-item');
            if (!target || !draggedElement || draggedElement === target) {
                if (target) target.classList.remove('drag-over');
                return false;
            }
            const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
            const targetOrderIndex = parseInt(target.dataset.orderIndex);
            const _before = layerOrder.slice(); // D6
            // Simple reordering: remove from old position, insert at target position
            const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
            layerOrder.splice(targetOrderIndex, 0, draggedItem);
            endDragUX(); // dragend may not fire on the detached source node
            renderLayers();
            _recordReorderUndo(_before); // D6
            target.classList.remove('drag-over');
            return false;
        }
        function handleDragEnd(e) {
            this.classList.remove('dragging');
            document.querySelectorAll('.layer-item, .drop-zone').forEach(item => {
                item.classList.remove('drag-over');
            });
            endDragUX();
            draggedElement = null;
        }
        function handleDropZoneDragOver(e) {
            if (!draggedElement) return; // file drag — bubble to 32-file-drop
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const panel = document.getElementById('layersPanel');
            if (panel) panel.querySelectorAll('.layer-item.drag-over').forEach(el => el.classList.remove('drag-over'));
            this.classList.add('drag-over');
            return false;
        }
        function handleDropZoneDrop(e) {
            // File drag (or stray drop with no source row): without this guard
            // the draggedElement dereference below throws on OS file drops.
            if (!draggedElement) return;
            if (e.stopPropagation) e.stopPropagation();
            e.preventDefault();
            const dropPosition = this.dataset.dropPosition;
            const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
            const _before = layerOrder.slice(); // D6
            // Remove from current position
            const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
            if (dropPosition === 'top') {
                // Add to beginning (top = closest to viewer = highest z-index)
                layerOrder.unshift(draggedItem);
            } else if (dropPosition === 'bottom') {
                // Add to end (bottom = furthest from viewer = lowest z-index)
                layerOrder.push(draggedItem);
            }
            endDragUX(); // dragend may not fire on the detached source node
            renderLayers();
            _recordReorderUndo(_before); // D6
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
                        if (layer.isRaster) return; // D2: GPU-composited, no div/z-index
                        const layerDiv = document.getElementById(`layer${layer.index}`);
                        if (layerDiv) {
                            layerDiv.style.zIndex = zIndex;
                            layerDiv.style.display = layer.visible ? 'block' : 'none';
                            // Shared string (02a) — must match 05l's
                            // updateLayerPosition or this stomps its skew on
                            // every reorder/visibility pass.
                            layerDiv.style.transform = window.LayerXform.cssTransform(layer);
                            // Apply active class
                            if (layer.active) {
                                layerDiv.classList.add('active');
                            } else {
                                layerDiv.classList.remove('active');
                            }
                            // Reapply mask / threshold ONLY when mask state
                            // changed since the last application (7.6: this ran
                            // per layer on EVERY reorder/render — image decode +
                            // full-canvas composite per layer was the layers-
                            // panel jank source; the div's background persists
                            // across reorders, so a clean layer needs nothing).
                            if (layer.__maskDirty !== false) {
                                const hasMask = layer.mask?.shapes?.length > 0;
                                if (hasMask && layer.mask.enabled) {
                                    applyLayerMask(layer.index);
                                } else if (layer.threshold > 0) {
                                    applyRudimentaryMask(layer.index);
                                } else {
                                    applyLayerMask(layer.index);
                                }
                                // D3-3: refresh the Mask clip alongside the re-bake
                                // (cheap no-op when the layer has no clip binding).
                                if (typeof window.applyLayerClip === 'function') window.applyLayerClip(layer.index);
                                layer.__maskDirty = false;
                            }
                        }
                    }
                }
            });
        }
