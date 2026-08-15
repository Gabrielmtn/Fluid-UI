// Layer Masking System - Beautiful shape-based masks with drag & resize
(function() {
    'use strict';

    // Masking state
    window.layerMaskingState = {
        activeMaskLayerId: null,
        maskMode: 'show', // 'show' or 'hide'
        shapes: [], // Array of mask shapes {type, x, y, width, height}
        selectedShapeIndex: null,
        isDragging: false,
        isResizing: false,
        resizeHandle: null,
        dragStartX: 0,
        dragStartY: 0,
        zoom: 1.0,
        panX: 0,
        panY: 0,
        isPanning: false,
        panStartX: 0,
        panStartY: 0,
        smartSelectMode: false,
        smartSelectPoints: [], // {x, y, label} where label is 1 for include, 0 for exclude
        stampMenuOpen: false,  // Stamps submenu (shape tools) expanded?
        isProcessingSAM: false,
        // SAM multi-proposal UX
        samCandidates: [],        // Array of processed mask candidates from SAM
        samSelectedCandidateIndex: 0
    };

    // Helper to deep-clone mask shapes while preserving typed arrays
    function cloneMaskShapes(shapes) {
        if (!Array.isArray(shapes)) return [];
        return shapes.map(shape => {
            const cloned = { ...shape };
            if (shape.depthData instanceof Uint8Array) {
                cloned.depthData = new Uint8Array(shape.depthData);
            }
            if (shape.samMask instanceof Uint8Array) {
                cloned.samMask = new Uint8Array(shape.samMask);
            } else if (shape.samMask && typeof shape.samMask === 'object' && cloned.samMaskWidth && cloned.samMaskHeight) {
                // Handle legacy serialized samMask objects (numeric keys)
                const size = cloned.samMaskWidth * cloned.samMaskHeight;
                const arr = new Uint8Array(size);
                for (let i = 0; i < size; i++) {
                    const v = shape.samMask[i];
                    const num = Number(v) || 0;
                    // Preserve the stored value: soft masks carry 0-255
                    // coverage (binarizing here destroyed their antialiased
                    // edges), legacy hard masks carry 0/1 and pass through.
                    arr[i] = Math.max(0, Math.min(255, num));
                }
                cloned.samMask = arr;
            }
            return cloned;
        });
    }

    const maskState = window.layerMaskingState;

    // Global SAM mask settings so the SAM integration can read user preferences.
    // We keep a fixed default hardness for now.
    window.samMaskSettings = window.samMaskSettings || {
        hardness: 0.6
    };

    // Initialize mask properties on layers
    function initLayerMasks() {
        if (!window.recLayers) return;
        window.recLayers.forEach(layer => {
            if (!layer.mask) {
                layer.mask = {
                    enabled: false,
                    mode: 'show', // 'show' or 'hide'
                    shapes: []
                };
            }
        });
    }

    // Enter mask editing mode for a layer
    window.enterMaskMode = function(layerId) {
        const layer = window.recLayers?.find(l => l.id === layerId);
        if (!layer) return;

        // Save current layer states
        maskState.activeMaskLayerId = layerId;
        maskState.maskMode = layer.mask?.mode || 'show';
        maskState.shapes = layer.mask?.shapes ? cloneMaskShapes(layer.mask.shapes) : [];
        maskState.selectedShapeIndex = null;

        // Solo this layer (hide others temporarily)
        window.recLayers.forEach(l => {
            l._maskTempVisible = l.visible;
            l.visible = (l.id === layerId);
        });

        // Show mask editor overlay
        showMaskEditor();
        updateMaskEditorTitle();
        renderMaskEditor();

        // If there are no existing shapes, build a default pixel mask from the
        // current canvas content (treat any non-black pixels as masked).
        if (!layer.mask?.shapes || layer.mask.shapes.length === 0) {
            buildDefaultMaskFromCanvas();
        }
    };

    // Exit mask editing mode
    window.exitMaskMode = function(save = true) {
        if (maskState.activeMaskLayerId === null) return;

        const layer = window.recLayers?.find(l => l.id === maskState.activeMaskLayerId);
        
        if (save && layer) {
            // Save mask data to layer (preserving SAM pixel masks)
            layer.mask = {
                enabled: maskState.shapes.length > 0,
                mode: maskState.maskMode,
                shapes: cloneMaskShapes(maskState.shapes)
            };
        }

        // Restore layer visibility
        window.recLayers?.forEach(l => {
            if (l._maskTempVisible !== undefined) {
                l.visible = l._maskTempVisible;
                delete l._maskTempVisible;
            }
        });

        // Hide mask editor overlay
        hideMaskEditor();

        // Reset mask state
        maskState.activeMaskLayerId = null;
        maskState.shapes = [];
        maskState.selectedShapeIndex = null;

        // Refresh UI
        if (typeof window.recRenderUI === 'function') {
            window.recRenderUI();
        }
    };

    // Show mask editor overlay
    function showMaskEditor() {
        let overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) {
            overlay = createMaskEditorOverlay();
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        updateStampMenuDisplay();
        // The overlay persists across editor sessions — reset the Apply
        // button from whatever busy state the last session left it in.
        samSyncApplyBusy();
    }

    // Hide mask editor overlay
    function hideMaskEditor() {
        const overlay = document.getElementById('maskEditorOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // Build a default pixel mask from the current canvas content. This is
    // primarily for fluid / glow layers where non-black pixels should be
    // considered part of the mask area.
    function buildDefaultMaskFromCanvas() {
        const canvas = document.getElementById('canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        if (!width || !height) return;

        const img = ctx.getImageData(0, 0, width, height).data;
        const size = width * height;
        const maskData = new Uint8Array(size);

        let minX = width, minY = height, maxX = -1, maxY = -1;
        let hasPixels = false;

        // Treat any pixel with brightness above a small epsilon as part of the mask.
        for (let i = 0, j = 0; i < size; i++, j += 4) {
            const r = img[j];
            const g = img[j + 1];
            const b = img[j + 2];
            const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            if (brightness > 0.02) {
                maskData[i] = 1;
                hasPixels = true;
                const x = i % width;
                const y = (i - x) / width;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }

        if (!hasPixels) return;

        const bboxWidth = maxX - minX + 1;
        const bboxHeight = maxY - minY + 1;
        const croppedMask = new Uint8Array(bboxWidth * bboxHeight);

        for (let y = 0; y < bboxHeight; y++) {
            for (let x = 0; x < bboxWidth; x++) {
                const srcX = minX + x;
                const srcY = minY + y;
                const srcIdx = srcY * width + srcX;
                const dstIdx = y * bboxWidth + x;
                croppedMask[dstIdx] = maskData[srcIdx];
            }
        }

        const shape = {
            type: 'sam-mask',
            x: minX,
            y: minY,
            width: bboxWidth,
            height: bboxHeight,
            rotation: 0,
            samMask: croppedMask,
            samMaskWidth: bboxWidth,
            samMaskHeight: bboxHeight
        };

        maskState.shapes = [shape];
        maskState.selectedShapeIndex = 0;
        updateMaskEditorTitle();
        updateRotationControl();
        renderMaskEditor();
    }

    // Update mask editor title with layer info
    function updateMaskEditorTitle() {
        const overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) return;

        const layer = window.recLayers?.find(l => l.id === maskState.activeMaskLayerId);
        if (!layer) return;

        const header = overlay.querySelector('.mask-editor-header h3');
        if (header) {
            const shapeCount = maskState.shapes.length;
            header.innerHTML = `✂️ Mask Editor - ${window.escHtml(layer.name)} <span style="font-size: 14px; opacity: 0.7;">(${shapeCount} shape${shapeCount !== 1 ? 's' : ''})</span>`;
        }
    }

    // Create mask editor overlay UI
    function createMaskEditorOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'maskEditorOverlay';
        overlay.className = 'mask-editor-overlay';
        overlay.innerHTML = `
            <div class="mask-editor-panel">
                <div class="mask-editor-header">
                    <h3>✂️ Mask Editor</h3>
                    <button class="mask-close-btn" onclick="window.exitMaskMode(false)">✕</button>
                </div>
                <div class="mask-editor-controls">
                    <div class="mask-mode-toggle">
                        <label>
                            <input type="radio" name="maskMode" value="show" checked>
                            <span>Show Areas</span>
                        </label>
                        <label>
                            <input type="radio" name="maskMode" value="hide">
                            <span>Hide Areas</span>
                        </label>
                    </div>
                    <div class="mask-tools-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                        <button id="smartSelectBtn" class="mask-mode-btn magic-mask-btn" onclick="window.toggleSmartSelect()" title="AI-powered object masking&#10;Click objects and the model cuts them out for you&#10;First use: downloads a ~40 MB model (cached locally)">
                            <span style="font-size: 18px;">🪄</span> Magic Mask Objects
                        </button>
                        <button id="stampMenuBtn" class="mask-mode-btn stamp-menu-btn" onclick="window.toggleStampMenu()" title="Stamp shapes onto the mask&#10;Rectangles, circles, stars and more — drag to place, resize with the handle">
                            <span style="font-size: 16px;">▦</span> Stamps <span class="stamp-caret">▾</span>
                        </button>
                        <span id="samLoadingStatus" style="font-size: 12px; color: #8b949e; align-self: center;"></span>
                    </div>
                    <div id="stampMenu" class="mask-stamp-menu" style="display: none;">
                        <div class="mask-stamp-hint">Click a shape to stamp it onto the mask — drag to move it, grab the handle to resize.</div>
                        <div id="manualShapeTools" class="mask-shape-tools">
                            <button class="mask-tool-btn" data-shape="rect" title="Stamp a Rectangle">▭</button>
                            <button class="mask-tool-btn" data-shape="roundrect" title="Stamp a Rounded Rectangle">▢</button>
                            <button class="mask-tool-btn" data-shape="circle" title="Stamp a Circle">◯</button>
                            <button class="mask-tool-btn" data-shape="ellipse" title="Stamp an Ellipse">⬭</button>
                            <button class="mask-tool-btn" data-shape="triangle" title="Stamp a Triangle">△</button>
                            <button class="mask-tool-btn" data-shape="pentagon" title="Stamp a Pentagon">⬟</button>
                            <button class="mask-tool-btn" data-shape="hexagon" title="Stamp a Hexagon">⬡</button>
                            <button class="mask-tool-btn" data-shape="star" title="Stamp a Star">★</button>
                        </div>
                    </div>
                    <div id="smartSelectControls" style="display: none; background: rgba(63, 185, 80, 0.08); padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(63, 185, 80, 0.2);">
                        <div style="font-size: 13px; color: #3fb950; margin-bottom: 8px; font-weight: 600;">
                            🪄 Click the objects you want masked:
                        </div>
                        <div style="font-size: 12px; color: #8b949e; margin-bottom: 8px;">
                            • <strong style="color: #3fb950;">Left-click</strong>: Include point (green)<br>
                            • <strong style="color: #f85149;">Right-click</strong>: Exclude point (red)<br>
                            • Shift+Click: Pan view
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button id="samSegmentBtn" class="mask-action-btn" onclick="window.runSAMSegmentation()" style="flex: 1; background: linear-gradient(180deg, #238636, #1a7f37);" disabled>
                                ✨ Magic Mask It
                            </button>
                            <button class="mask-action-btn" onclick="window.clearSAMPoints()">
                                🗑️ Clear Points
                            </button>
                        </div>
                        <div id="samCandidateControls" style="display: none; gap: 6px; margin-top: 8px; align-items: center;" title="The AI proposes a few cutouts — hover to preview, click to choose"></div>
                        <div id="samLoadingIndicator" style="display: none; margin-top: 8px; padding: 8px; background: rgba(88, 166, 255, 0.15); border-radius: 4px; font-size: 12px; color: #58a6ff; text-align: center;">
                            <span class="sam-spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(88, 166, 255, 0.3); border-top-color: #58a6ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px;"></span>
                            Magic Mask is cutting out your object...
                        </div>
                    </div>
                    <div class="mask-rotation-control" id="maskRotationControl" style="display: none; padding: 8px 12px; background: rgba(88, 166, 255, 0.05); border-radius: 6px; margin-top: 8px;">
                        <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #c9d1d9;">
                            <span style="min-width: 70px;">Rotation:</span>
                            <input type="range" id="maskRotationSlider" min="0" max="360" value="0" style="flex: 1;">
                            <span id="maskRotationValue" style="min-width: 50px; text-align: right; font-weight: 600; color: #58a6ff;">0°</span>
                        </label>
                    </div>
                    <div class="mask-actions">
                        <button class="mask-action-btn" onclick="window.deleteMaskShape()">🗑 Delete</button>
                        <button class="mask-action-btn" onclick="window.clearMaskShapes()">🧹 Clear All</button>
                    </div>
                    <div class="mask-zoom-controls" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                        <button class="mask-zoom-btn" onclick="window.maskZoomOut()" title="Zoom Out">−</button>
                        <span id="maskZoomLevel" style="min-width: 60px; text-align: center; font-size: 13px; color: #c9d1d9;">100%</span>
                        <button class="mask-zoom-btn" onclick="window.maskZoomIn()" title="Zoom In">+</button>
                        <button class="mask-zoom-btn" onclick="window.maskResetZoom()" title="Reset Zoom" style="margin-left: 8px;">⊙</button>
                    </div>
                </div>
                <div id="maskHint" class="mask-hint" style="padding: clamp(4px, 0.8vh, 8px) clamp(12px, 2vw, 20px); background: rgba(88, 166, 255, 0.1); border-top: 1px solid rgba(88, 166, 255, 0.2); border-bottom: 1px solid rgba(88, 166, 255, 0.2); font-size: clamp(11px, 1.3vh, 13px); color: #8b949e; text-align: center; flex-shrink: 0;">
                    <strong style="color: #58a6ff;">💡 Tip:</strong> Scroll to zoom • Middle-click to pan • Shift+Drag for fine positioning
                </div>
                <div class="mask-canvas-container">
                    <canvas id="maskEditorCanvas" class="mask-editor-canvas"></canvas>
                </div>
                <div class="mask-editor-footer">
                    <button class="mask-cancel-btn" onclick="window.exitMaskMode(false)">Cancel</button>
                    <button class="mask-apply-btn" onclick="window.exitMaskMode(true)">✓ Apply Mask</button>
                </div>
            </div>
        `;

        // Setup event listeners
        setupMaskEditorEvents(overlay);

        return overlay;
    }

    // Setup mask editor event listeners
    function setupMaskEditorEvents(overlay) {
        // Mode toggle
        const modeRadios = overlay.querySelectorAll('input[name="maskMode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                maskState.maskMode = e.target.value;
                renderMaskEditor();
            });
        });

        // Shape tool buttons
        const toolBtns = overlay.querySelectorAll('.mask-tool-btn');
        toolBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const shapeType = e.currentTarget.getAttribute('data-shape');
                addMaskShape(shapeType);
            });
        });

        // Rotation slider
        const rotationSlider = overlay.querySelector('#maskRotationSlider');
        if (rotationSlider) {
            rotationSlider.addEventListener('input', (e) => {
                const rotation = parseInt(e.target.value);
                document.getElementById('maskRotationValue').textContent = rotation + '°';
                
                if (maskState.selectedShapeIndex !== null) {
                    maskState.shapes[maskState.selectedShapeIndex].rotation = rotation;
                    renderMaskEditor();
                }
            });
        }

        // Canvas interactions
        const canvas = overlay.querySelector('#maskEditorCanvas');
        if (canvas) {
            canvas.addEventListener('mousedown', handleMaskCanvasMouseDown);
            canvas.addEventListener('mousemove', handleMaskCanvasMouseMove);
            canvas.addEventListener('mouseup', handleMaskCanvasMouseUp);
            canvas.addEventListener('mouseleave', handleMaskCanvasMouseUp);
            
            // Prevent context menu in smart select mode
            canvas.addEventListener('contextmenu', (e) => {
                if (maskState.smartSelectMode) {
                    e.preventDefault();
                    return false;
                }
            });
            
            // Mouse wheel zoom
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
                const oldZoom = maskState.zoom;
                maskState.zoom = Math.max(0.1, Math.min(20, maskState.zoom * delta));
                
                // Zoom towards mouse position
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                maskState.panX = mouseX - (mouseX - maskState.panX) * (maskState.zoom / oldZoom);
                maskState.panY = mouseY - (mouseY - maskState.panY) * (maskState.zoom / oldZoom);
                
                updateZoomDisplay();
                renderMaskEditor();
            }, { passive: false });
        }
    }

    // Zoom functions
    window.maskZoomIn = function() {
        maskState.zoom = Math.min(maskState.zoom * 1.5, 20);
        updateZoomDisplay();
        renderMaskEditor();
    };

    window.maskZoomOut = function() {
        maskState.zoom = Math.max(maskState.zoom / 1.5, 0.1);
        updateZoomDisplay();
        renderMaskEditor();
    };

    window.maskResetZoom = function() {
        maskState.zoom = 1.0;
        maskState.panX = 0;
        maskState.panY = 0;
        updateZoomDisplay();
        renderMaskEditor();
    };

    function updateZoomDisplay() {
        const zoomEl = document.getElementById('maskZoomLevel');
        if (zoomEl) {
            zoomEl.textContent = Math.round(maskState.zoom * 100) + '%';
        }
    }

    // Add a new mask shape
    function addMaskShape(type) {
        const canvas = document.getElementById('maskEditorCanvas');
        if (!canvas) return;

        // Transform screen center to canvas coordinates accounting for zoom/pan
        // (and the layer view), so shapes are created at the VISIBLE centre
        // but stored in original canvas space
        const c = fromLayerView(
            (canvas.width / 2 - maskState.panX) / maskState.zoom,
            (canvas.height / 2 - maskState.panY) / maskState.zoom,
            canvas
        );
        const centerX = c.x, centerY = c.y;

        // Default size in canvas coordinates (divided by zoom for finer control when zoomed in)
        // At 100% zoom: 5% of canvas | At 1000% zoom: 0.5% of canvas (pixel-level)
        const defaultSize = Math.min(canvas.width, canvas.height) * 0.05 / maskState.zoom;

        // Pre-stretch by the inverse layer view so a stamp reads the same in
        // the editor and in the applied mask: stored space is squashed by the
        // layer's contain-fit, and the div squeezes it back on screen.
        // 'circle' is radius-from-WIDTH only, so on a squashed layer it has to
        // become an ellipse to stay round (pentagon/hexagon/star take
        // min(w,h), which the stretch leaves alone).
        const vs = layerViewScale(canvas);
        const anisotropic = Math.abs(vs.sx - vs.sy) > 1e-3;
        const stampType = (type === 'circle' && anisotropic) ? 'ellipse' : type;
        const w = defaultSize / vs.sx;
        const h = (type === 'circle' ? defaultSize : defaultSize * 0.6) / vs.sy;

        const shape = {
            type: stampType,
            x: centerX - w / 2,
            y: centerY - h / 2,
            width: w,
            height: h,
            rotation: 0
        };

        maskState.shapes.push(shape);
        maskState.selectedShapeIndex = maskState.shapes.length - 1;
        updateMaskEditorTitle();
        updateRotationControl();
        renderMaskEditor();
    }
    
    // Update rotation control visibility and value
    function updateRotationControl() {
        const rotationControl = document.getElementById('maskRotationControl');
        const rotationSlider = document.getElementById('maskRotationSlider');
        const rotationValue = document.getElementById('maskRotationValue');
        
        if (!rotationControl || !rotationSlider || !rotationValue) return;
        
        if (maskState.selectedShapeIndex !== null && maskState.selectedShapeIndex >= 0) {
            const shape = maskState.shapes[maskState.selectedShapeIndex];
            const rotation = shape.rotation || 0;
            
            rotationControl.style.display = 'block';
            rotationSlider.value = rotation;
            rotationValue.textContent = rotation + '°';
        } else {
            rotationControl.style.display = 'none';
        }
    }

    // Delete selected mask shape
    window.deleteMaskShape = function() {
        if (maskState.selectedShapeIndex !== null && maskState.selectedShapeIndex >= 0) {
            maskState.shapes.splice(maskState.selectedShapeIndex, 1);
            maskState.selectedShapeIndex = null;
            updateMaskEditorTitle();
            updateRotationControl();
            renderMaskEditor();
        }
    };

    // Clear all mask shapes
    window.clearMaskShapes = function() {
        maskState.shapes = [];
        maskState.selectedShapeIndex = null;
        updateMaskEditorTitle();
        updateRotationControl();
        renderMaskEditor();
    };

    // Handle canvas mouse down
    function handleMaskCanvasMouseDown(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Transform to canvas coordinates accounting for zoom/pan, then back
        // through the layer view so points/shapes land in STORED space
        const _p = fromLayerView(
            (screenX - maskState.panX) / maskState.zoom,
            (screenY - maskState.panY) / maskState.zoom,
            canvas
        );
        const x = _p.x, y = _p.y;

        // Smart select mode - add points for SAM
        if (maskState.smartSelectMode) {
            // Right-click for exclude points, left-click for include
            const label = e.button === 2 ? 0 : 1; // 0 = exclude, 1 = include
            
            // Shift+click to pan
            if (e.shiftKey && e.button === 0) {
                maskState.isPanning = true;
                maskState.panStartX = screenX - maskState.panX;
                maskState.panStartY = screenY - maskState.panY;
                return;
            }
            
            // Add point
            maskState.smartSelectPoints.push({ x, y, label });
            renderMaskEditor();
            
            // Auto-segment after each point (like the Xenova demo), with a short debounce
            if (maskState.smartSelectPoints.length >= 1 && window.samSegmenter && window.samSegmenter.isReady) {
                // Clear existing timer
                if (maskState.samDebounceTimer) {
                    clearTimeout(maskState.samDebounceTimer);
                }
                // Run shortly after the last click so multiple rapid clicks
                // coalesce. Null the handle when it fires — a stale truthy id
                // would read as "still pending" to samCutoutPending forever.
                maskState.samDebounceTimer = setTimeout(() => {
                    maskState.samDebounceTimer = null;
                    autoRunSAMSegmentation();
                }, 200);
            }
            samSyncApplyBusy();

            e.preventDefault();
            return;
        }

        // Middle button for panning
        if (e.button === 1 || (e.shiftKey && e.button === 0)) {
            maskState.isPanning = true;
            maskState.panStartX = screenX - maskState.panX;
            maskState.panStartY = screenY - maskState.panY;
            e.preventDefault();
            return;
        }

        maskState.dragStartX = x;
        maskState.dragStartY = y;

        // Check if clicking on a shape or resize handle
        for (let i = maskState.shapes.length - 1; i >= 0; i--) {
            const shape = maskState.shapes[i];
            const handle = getResizeHandle(shape, x, y);
            
            if (handle) {
                maskState.isResizing = true;
                maskState.resizeHandle = handle;
                maskState.selectedShapeIndex = i;
                updateRotationControl();
                return;
            }
            
            if (isPointInShape(shape, x, y)) {
                maskState.isDragging = true;
                maskState.selectedShapeIndex = i;
                updateRotationControl();
                renderMaskEditor();
                return;
            }
        }

        // Clicked on empty area
        maskState.selectedShapeIndex = null;
        updateRotationControl();
        renderMaskEditor();
    }

    // Handle canvas mouse move
    function handleMaskCanvasMouseMove(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Handle panning
        if (maskState.isPanning) {
            maskState.panX = screenX - maskState.panStartX;
            maskState.panY = screenY - maskState.panStartY;
            renderMaskEditor();
            return;
        }
        
        // Transform to canvas coordinates accounting for zoom/pan, then back
        // through the layer view so drags track the cursor in STORED space
        const _p = fromLayerView(
            (screenX - maskState.panX) / maskState.zoom,
            (screenY - maskState.panY) / maskState.zoom,
            canvas
        );
        const x = _p.x, y = _p.y;

        if (maskState.isDragging && maskState.selectedShapeIndex !== null) {
            const dx = x - maskState.dragStartX;
            const dy = y - maskState.dragStartY;
            const shape = maskState.shapes[maskState.selectedShapeIndex];
            
            shape.x += dx;
            shape.y += dy;
            
            maskState.dragStartX = x;
            maskState.dragStartY = y;
            renderMaskEditor();
        } else if (maskState.isResizing && maskState.selectedShapeIndex !== null) {
            const shape = maskState.shapes[maskState.selectedShapeIndex];
            const dx = x - maskState.dragStartX;
            const dy = y - maskState.dragStartY;

            resizeShape(shape, maskState.resizeHandle, dx, dy);
            
            maskState.dragStartX = x;
            maskState.dragStartY = y;
            renderMaskEditor();
        } else {
            // Update cursor based on hover
            let cursor = 'default';
            for (let i = maskState.shapes.length - 1; i >= 0; i--) {
                const shape = maskState.shapes[i];
                if (getResizeHandle(shape, x, y)) {
                    cursor = 'nwse-resize';
                    break;
                } else if (isPointInShape(shape, x, y)) {
                    cursor = 'move';
                    break;
                }
            }
            canvas.style.cursor = cursor;
        }
    }

    // Handle canvas mouse up
    function handleMaskCanvasMouseUp(e) {
        maskState.isDragging = false;
        maskState.isResizing = false;
        maskState.isPanning = false;
        maskState.resizeHandle = null;
    }

    // Check if point is inside shape
    function isPointInShape(shape, x, y) {
        if (shape.type === 'circle') {
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;
            const r = shape.width / 2;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            return dist <= r;
        } else if (shape.type === 'ellipse') {
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;
            const rx = shape.width / 2;
            const ry = shape.height / 2;
            const normalized = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            return normalized <= 1;
        } else {
            // Rectangle
            return x >= shape.x && x <= shape.x + shape.width &&
                   y >= shape.y && y <= shape.y + shape.height;
        }
    }

    // Get resize handle at position (in canvas coordinates)
    function getResizeHandle(shape, x, y) {
        // Scale handle detection area by zoom (larger detection when zoomed out)
        const handleSize = 12 / maskState.zoom;
        const handles = [
            { name: 'se', x: shape.x + shape.width, y: shape.y + shape.height }
        ];

        for (const handle of handles) {
            if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
                return handle.name;
            }
        }
        return null;
    }

    // Resize shape (in canvas coordinates)
    function resizeShape(shape, handle, dx, dy) {
        if (handle === 'se') {
            // Minimum size scaled by zoom (1 pixel at current zoom level)
            const minSize = 1 / maskState.zoom;
            shape.width = Math.max(minSize, shape.width + dx);
            shape.height = Math.max(minSize, shape.height + dy);
            
            // Keep circles square
            if (shape.type === 'circle') {
                const avg = (shape.width + shape.height) / 2;
                shape.width = avg;
                shape.height = avg;
            }
        }
    }

    // ── Layer view transform (aspect parity with the app) ──────────────
    // An image layer is a full-bleed div whose background is STRETCHED to the
    // canvas box (background-size:100% 100%) and then squeezed back by the
    // div's CSS transform — which carries the contain-fit baked into
    // scaleX/scaleY at import (04f createLayerFromDataUrl), plus any
    // move/resize/rotate the user applied. So the layer the user SEES is the
    // transformed one, while mask shapes are stored in the UNTRANSFORMED
    // stretched space, because that is the space applyLayerMask (05m) bakes
    // in before the div re-applies the transform.
    //
    // The editor therefore treats the layer transform as a VIEW transform:
    // composed into every draw, inverted for every mouse mapping. Stored
    // shape coordinates, the bake, and SAM's display-space mapping are all
    // untouched — only what's on screen changes.
    function getLayerViewMatrix(canvas) {
        if (typeof DOMMatrix === 'undefined' || !canvas) return null;
        const id = maskState.activeMaskLayerId;
        if (typeof id !== 'string' || !id.startsWith('image-')) return null;
        const layer = (window.layers || []).find(l => l.index === parseInt(id.slice(6), 10));
        if (!layer) return null;

        const sx = (typeof layer.scaleX === 'number') ? layer.scaleX : 1;
        const sy = (typeof layer.scaleY === 'number') ? layer.scaleY : 1;
        const rot = layer.rotation || 0;
        if (Math.abs(sx) < 1e-6 || Math.abs(sy) < 1e-6) return null; // not invertible

        // layer.x/y are CSS px of the canvas box; the editor works in the
        // display canvas's BUFFER px, which can differ (HiDPI / render cap).
        let kx = 1, ky = 1;
        const displayCanvas = document.getElementById('canvas');
        if (displayCanvas) {
            const r = displayCanvas.getBoundingClientRect();
            if (r.width > 0) kx = displayCanvas.width / r.width;
            if (r.height > 0) ky = displayCanvas.height / r.height;
        }
        const tx = (layer.x || 0) * kx;
        const ty = (layer.y || 0) * ky;

        if (sx === 1 && sy === 1 && !rot && !tx && !ty) return null; // identity

        // Mirrors renderLayers' `translate(x,y) rotate(r) scale(sx,sy)` with
        // transform-origin: center center (05k updateLayerZIndices).
        const cx = canvas.width / 2, cy = canvas.height / 2;
        return new DOMMatrix()
            .translateSelf(cx, cy)
            .translateSelf(tx, ty)
            .rotateSelf(rot)
            .scaleSelf(sx, sy)
            .translateSelf(-cx, -cy);
    }

    // Compose the layer view onto ctx — call AFTER the pan/zoom transform.
    function applyLayerView(ctx, canvas) {
        const m = getLayerViewMatrix(canvas);
        if (m) ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    }

    // Per-axis view scale, for chrome that must stay square on screen
    // (handles, markers) and for shapes that should be stamped un-squashed.
    function layerViewScale(canvas) {
        const m = getLayerViewMatrix(canvas);
        if (!m) return { sx: 1, sy: 1 };
        // Column magnitudes = the scale this matrix applies per axis.
        return {
            sx: Math.hypot(m.a, m.b) || 1,
            sy: Math.hypot(m.c, m.d) || 1,
        };
    }

    // Map a point from stored space into view space (post layer transform).
    function toLayerView(x, y, canvas) {
        const m = getLayerViewMatrix(canvas);
        if (!m) return { x, y };
        const p = m.transformPoint(new DOMPoint(x, y));
        return { x: p.x, y: p.y };
    }

    // Map an already un-panned/un-zoomed editor point back to stored space.
    function fromLayerView(x, y, canvas) {
        const m = getLayerViewMatrix(canvas);
        if (!m) return { x, y };
        const p = m.inverse().transformPoint(new DOMPoint(x, y));
        return { x: p.x, y: p.y };
    }

    // Render mask editor canvas
    function renderMaskEditor() {
        const canvas = document.getElementById('maskEditorCanvas');
        if (!canvas) return;

        // Size canvas to match display canvas — except in adhoc mode (brush
        // shapes), where the editor works in the IMAGE's own space so nothing
        // is aspect-stretched and the applied result is WYSIWYG.
        const displayCanvas = document.getElementById('canvas');
        if (maskState.activeMaskLayerId === 'adhoc' && maskState.adhocSource) {
            canvas.width = maskState.adhocSource.width;
            canvas.height = maskState.adhocSource.height;
        } else if (displayCanvas) {
            canvas.width = displayCanvas.width;
            canvas.height = displayCanvas.height;
        }

        const ctx = canvas.getContext('2d');
        
        // Helper to draw with transforms
        const drawWithTransform = (drawFn) => {
            ctx.save();
            ctx.translate(maskState.panX, maskState.panY);
            ctx.scale(maskState.zoom, maskState.zoom);
            applyLayerView(ctx, canvas);
            drawFn();
            ctx.restore();
        };
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background based on layer type
        if (maskState.activeMaskLayerId === 'adhoc' && maskState.adhocSource) {
            // Ad-hoc image (brush-shape import): already decoded, draw sync
            const aimg = maskState.adhocSource.image;
            drawWithTransform(() => {
                ctx.drawImage(aimg, 0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            });
            drawMaskShapesWithTransform(ctx);
            return;
        }
        if (maskState.activeMaskLayerId && maskState.activeMaskLayerId.startsWith('image-')) {
            // For image layers, draw the ORIGINAL layer image — not the div's
            // current background, which is the already-masked (and for
            // collision layers orange-tinted) preview and would double up
            // with the mask overlay drawn on top.
            const layerIndex = parseInt(maskState.activeMaskLayerId.replace('image-', ''));
            const layer = (window.layers || []).find(l => l.index === layerIndex);
            const layerDiv = document.getElementById(`layer${layerIndex}`);

            let imgSrc = layer ? (layer.originalData || layer.data) : null;
            if (!imgSrc && layerDiv) {
                const bgImage = window.getComputedStyle(layerDiv).backgroundImage;
                if (bgImage && bgImage !== 'none') imgSrc = bgImage.slice(5, -2); // strip 'url("' and '")'
            }
            if (imgSrc) {
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    drawWithTransform(() => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        // Add semi-transparent overlay to make shapes more visible
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    });

                    // Redraw shapes after image loads
                    drawMaskShapesWithTransform(ctx);
                };
                img.src = imgSrc;
                return; // Exit early, will redraw when image loads
            }
        } else {
            // For recording layers, draw the fluid simulation canvas
            if (displayCanvas) {
                drawWithTransform(() => {
                    ctx.drawImage(displayCanvas, 0, 0);
                    // Add semi-transparent overlay to make shapes more visible
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                });
            }
        }
        
        // Draw shapes with transform
        drawMaskShapesWithTransform(ctx);
    }
    
    // Extract shape drawing into separate function
    function drawMaskShapesWithTransform(ctx) {
        const canvas = document.getElementById('maskEditorCanvas');
        if (!canvas) return;

        // Apply zoom and pan transformation
        ctx.save();
        ctx.translate(maskState.panX, maskState.panY);
        ctx.scale(maskState.zoom, maskState.zoom);
        applyLayerView(ctx, canvas);
        // Shapes live in the layer's (possibly squashed) stored space, so
        // strokes/handles need the inverse scale to stay square on screen.
        const vs = layerViewScale(canvas);
        const vsMean = (vs.sx + vs.sy) / 2;

        // Draw shapes
        maskState.shapes.forEach((shape, index) => {
            const isSelected = index === maskState.selectedShapeIndex;
            
            ctx.save();
            
            // Shape fill
            ctx.fillStyle = maskState.maskMode === 'show' 
                ? 'rgba(100, 200, 255, 0.3)' 
                : 'rgba(255, 100, 100, 0.3)';
            
            // Shape stroke (scaled to screen pixels)
            ctx.strokeStyle = isSelected 
                ? 'rgba(255, 200, 0, 0.9)' 
                : 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = (isSelected ? 3 : 2) / (maskState.zoom * vsMean);

            // Apply rotation if set
            const rotation = shape.rotation || 0;
            const centerX = shape.x + shape.width / 2;
            const centerY = shape.y + shape.height / 2;
            
            if (rotation !== 0) {
                ctx.translate(centerX, centerY);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.translate(-centerX, -centerY);
            }
            
            // Draw shape based on type
            drawShape(ctx, shape);
            
            // Restore rotation
            if (rotation !== 0) {
                ctx.translate(centerX, centerY);
                ctx.rotate((-rotation * Math.PI) / 180);
                ctx.translate(-centerX, -centerY);
            }

            // Draw resize handle if selected (size scaled to screen pixels)
            if (isSelected) {
                // Per-axis so the grab handle stays a square on screen even
                // when the layer view squashes one axis (hit-testing is
                // unchanged — it runs in stored space).
                const handleW = 12 / (maskState.zoom * vs.sx);
                const handleH = 12 / (maskState.zoom * vs.sy);
                ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
                ctx.fillRect(
                    shape.x + shape.width - handleW / 2,
                    shape.y + shape.height - handleH / 2,
                    handleW,
                    handleH
                );
            }

            ctx.restore();
        });

        // Restore zoom/pan transformation
        ctx.restore();
        
        // Draw SAM preview mask overlay if available
        if (maskState.samPreviewMask && maskState.smartSelectMode) {
            const mask = maskState.samPreviewMask;
            const maskWidth = mask.width;
            const maskHeight = mask.height;
            
            // Create temporary canvas for the mask
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = maskWidth;
            tempCanvas.height = maskHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Create ImageData for the mask overlay
            const imageData = tempCtx.createImageData(maskWidth, maskHeight);
            const data = imageData.data;
            
            // Fill with semi-transparent green for masked pixels (soft
            // coverage masks scale the preview alpha by coverage)
            let previewNonZero = 0;
            for (let i = 0; i < mask.data.length; i++) {
                const idx = i * 4;
                if (mask.data[i] > 0) {
                    previewNonZero++;
                    data[idx] = 100;     // R
                    data[idx + 1] = 200; // G
                    data[idx + 2] = 100; // B
                    data[idx + 3] = mask.soft ? ((120 * mask.data[i] / 255) + 0.5) | 0 : 120;
                }
            }
            
            tempCtx.putImageData(imageData, 0, 0);
            
            // Now draw the temp canvas with transforms applied
            ctx.save();
            ctx.translate(maskState.panX, maskState.panY);
            ctx.scale(maskState.zoom, maskState.zoom);
            applyLayerView(ctx, canvas);
            ctx.drawImage(tempCanvas, 0, 0, maskWidth, maskHeight);

            // Draw bounding box
            const pvs = layerViewScale(canvas);
            const bbox = mask.boundingBox;
            ctx.strokeStyle = '#3fb950';
            ctx.lineWidth = 2 / (maskState.zoom * (pvs.sx + pvs.sy) / 2);
            ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

            ctx.restore();
        }
        
        // Draw smart select points if in smart select mode
        if (maskState.smartSelectMode && maskState.smartSelectPoints.length > 0) {
            ctx.save();
            ctx.translate(maskState.panX, maskState.panY);
            ctx.scale(maskState.zoom, maskState.zoom);
            
            // Markers are chrome, not geometry: map the POSITION through the
            // layer view but draw the glyph unscaled, so rings stay round and
            // the numbers stay readable on a squashed layer.
            maskState.smartSelectPoints.forEach((point, index) => {
                const p = toLayerView(point.x, point.y, canvas);
                const pointSize = 8 / maskState.zoom;
                const outerSize = 12 / maskState.zoom;

                // Draw outer ring
                ctx.strokeStyle = point.label === 1 ? '#3fb950' : '#f85149';
                ctx.lineWidth = 3 / maskState.zoom;
                ctx.beginPath();
                ctx.arc(p.x, p.y, outerSize, 0, Math.PI * 2);
                ctx.stroke();

                // Draw filled center
                ctx.fillStyle = point.label === 1 ? '#3fb950' : '#f85149';
                ctx.beginPath();
                ctx.arc(p.x, p.y, pointSize, 0, Math.PI * 2);
                ctx.fill();

                // Draw point number
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${14 / maskState.zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(index + 1), p.x, p.y);
            });
            
            ctx.restore();
        }

        // Update mode radio
        const modeRadios = document.querySelectorAll('input[name="maskMode"]');
        modeRadios.forEach(radio => {
            radio.checked = radio.value === maskState.maskMode;
        });
    }

    // Draw shape helper (handles all shape types)
    function drawShape(ctx, shape) {
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        
        // Handle depth-mask pixel data specially
        if (shape.type === 'depth-mask' && shape.depthData && shape.depthWidth && shape.depthHeight) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = shape.depthWidth;
            tempCanvas.height = shape.depthHeight;
            const tempCtx = tempCanvas.getContext('2d');
            const imageData = tempCtx.createImageData(shape.depthWidth, shape.depthHeight);
            const data = imageData.data;
            const threshold = shape.threshold || 128;
            const invert = shape.invert || false;

            const fillColor = ctx.fillStyle;
            let r = 255, g = 140, b = 80, a = 0.4;
            if (fillColor.includes('rgba')) {
                const match = fillColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) { r = parseInt(match[1]); g = parseInt(match[2]); b = parseInt(match[3]); a = match[4] ? parseFloat(match[4]) : 1.0; }
            }

            // D0.5 rev 2: fwidth-style adaptive band — same threshold center
            // as the obstacle compositor so the editor preview edge lands
            // where the collider edge lands (AA at edges, hard cut on flat
            // midtones). Preview-only 8x cap (see 05m applyRudimentaryMask):
            // keeps the spatial ramp ~1.5px on steep edges; the solver path
            // keeps the hard cap.
            let bandCap = (window.config && typeof window.config.DEPTH_EDGE_BAND === 'number')
                ? window.config.DEPTH_EDGE_BAND : 12;
            if (bandCap < 0.5) bandCap = 0.5;
            bandCap = Math.min(bandCap * 8, 127);
            const ddp = shape.depthData;
            const dpw = shape.depthWidth;
            // No flip: depth data is stored top-down, same as this canvas
            // (matches drawMaskShape in 05m and the obstacle compositor)
            for (let i = 0, n = shape.depthWidth * shape.depthHeight; i < n; i++) {
                const dv = ddp[i] || 0;
                const xI = i - ((i / dpw) | 0) * dpw;
                const gx = Math.abs((ddp[i + (xI < dpw - 1 ? 1 : 0)] || 0) - (ddp[i - (xI > 0 ? 1 : 0)] || 0)) * 0.5;
                const gy = Math.abs((ddp[i + (i < n - dpw ? dpw : 0)] || 0) - (ddp[i - (i >= dpw ? dpw : 0)] || 0)) * 0.5;
                let band = (gx > gy ? gx : gy) * 0.75;
                if (band < 0.5) band = 0.5;
                if (band > bandCap) band = bandCap;
                let t = (dv - (threshold - band)) / (band * 2);
                if (t < 0) t = 0; else if (t > 1) t = 1;
                let cov = t * t * (3 - 2 * t);
                if (invert) cov = 1 - cov;
                const idx = i * 4;
                // Blend obstacle tint ↔ grayscale by coverage so the soft
                // edge reads as a gradient instead of a hard rim
                data[idx] = (r * cov + dv * (1 - cov) + 0.5) | 0;
                data[idx + 1] = (g * cov + dv * (1 - cov) + 0.5) | 0;
                data[idx + 2] = (b * cov + dv * (1 - cov) + 0.5) | 0;
                data[idx + 3] = (a * 255 * cov + 40 * (1 - cov) + 0.5) | 0;
            }

            tempCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, shape.x, shape.y, shape.width, shape.height);

            // Bounding box stroke
            ctx.beginPath();
            ctx.rect(shape.x, shape.y, shape.width, shape.height);
            ctx.stroke();
            return;
        }

        // Handle SAM pixel masks specially
        if (shape.type === 'sam-mask' && shape.samMask) {
            // Create temporary canvas for the mask
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = shape.samMaskWidth;
            tempCanvas.height = shape.samMaskHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Draw the actual pixel mask
            const imageData = tempCtx.createImageData(shape.samMaskWidth, shape.samMaskHeight);
            const data = imageData.data;
            
            // Fill with the current fill color for masked pixels
            const fillColor = ctx.fillStyle;
            let r = 100, g = 200, b = 255, a = 0.3;
            if (fillColor.includes('rgba')) {
                const match = fillColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) {
                    r = parseInt(match[1]);
                    g = parseInt(match[2]);
                    b = parseInt(match[3]);
                    a = match[4] ? parseFloat(match[4]) : 1.0;
                }
            }
            
            let nonZeroPixels = 0;
            for (let i = 0; i < shape.samMask.length; i++) {
                const idx = i * 4;
                if (shape.samMask[i] > 0) {
                    nonZeroPixels++;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = Math.floor(a * 255);
                }
            }
            
            console.log('🎨 Drawing SAM mask:', {
                totalPixels: shape.samMask.length,
                nonZeroPixels,
                coverage: (nonZeroPixels / shape.samMask.length * 100).toFixed(1) + '%',
                dimensions: [shape.samMaskWidth, shape.samMaskHeight]
            });
            
            tempCtx.putImageData(imageData, 0, 0);
            
            // Draw the cropped mask at the shape's position
            ctx.drawImage(tempCanvas, shape.x, shape.y, shape.samMaskWidth, shape.samMaskHeight);
            
            // Draw bounding box stroke
            ctx.beginPath();
            ctx.rect(shape.x, shape.y, shape.width, shape.height);
            ctx.stroke();
            return;
        }
        
        ctx.beginPath();
        
        switch (shape.type) {
            case 'rect':
                ctx.rect(shape.x, shape.y, shape.width, shape.height);
                break;
                
            case 'roundrect':
                const radius = Math.min(shape.width, shape.height) * 0.15;
                ctx.roundRect(shape.x, shape.y, shape.width, shape.height, radius);
                break;
                
            case 'circle':
                ctx.arc(cx, cy, shape.width / 2, 0, Math.PI * 2);
                break;
                
            case 'ellipse':
                ctx.ellipse(cx, cy, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2);
                break;
                
            case 'triangle':
                ctx.moveTo(cx, shape.y);
                ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
                ctx.lineTo(shape.x, shape.y + shape.height);
                ctx.closePath();
                break;
                
            case 'pentagon':
            case 'hexagon':
                const sides = shape.type === 'pentagon' ? 5 : 6;
                drawPolygon(ctx, cx, cy, sides, Math.min(shape.width, shape.height) / 2);
                break;
                
            case 'star':
                drawStar(ctx, cx, cy, 5, Math.min(shape.width, shape.height) / 2, Math.min(shape.width, shape.height) / 4);
                break;
                
            default:
                ctx.rect(shape.x, shape.y, shape.width, shape.height);
        }
        
        ctx.fill();
        ctx.stroke();
    }
    
    // Draw regular polygon
    function drawPolygon(ctx, cx, cy, sides, radius) {
        const angle = (Math.PI * 2) / sides;
        const startAngle = -Math.PI / 2;
        
        for (let i = 0; i <= sides; i++) {
            const a = startAngle + angle * i;
            const x = cx + Math.cos(a) * radius;
            const y = cy + Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }
    
    // Draw star shape
    function drawStar(ctx, cx, cy, points, outerRadius, innerRadius) {
        const angle = Math.PI / points;
        const startAngle = -Math.PI / 2;
        
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const a = startAngle + angle * i;
            const x = cx + Math.cos(a) * radius;
            const y = cy + Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    // Show/hide the Stamps submenu according to maskState (hidden entirely
    // while Magic Mask mode is engaged)
    function updateStampMenuDisplay() {
        const stampMenu = document.getElementById('stampMenu');
        const stampBtn = document.getElementById('stampMenuBtn');
        const open = maskState.stampMenuOpen && !maskState.smartSelectMode;
        if (stampMenu) stampMenu.style.display = open ? 'block' : 'none';
        if (stampBtn) {
            stampBtn.classList.toggle('open', open);
            stampBtn.style.display = maskState.smartSelectMode ? 'none' : '';
        }
    }

    // Toggle the Stamps submenu (shape tools)
    window.toggleStampMenu = function() {
        maskState.stampMenuOpen = !maskState.stampMenuOpen;
        updateStampMenuDisplay();
    };

    // Toggle Magic Mask Objects mode (AI segmentation)
    window.toggleSmartSelect = async function() {
        maskState.smartSelectMode = !maskState.smartSelectMode;

        const smartSelectBtn = document.getElementById('smartSelectBtn');
        const smartControls = document.getElementById('smartSelectControls');
        const hintDiv = document.getElementById('maskHint');

        if (maskState.smartSelectMode) {
            smartSelectBtn.classList.add('engaged');
            smartSelectBtn.disabled = true; // Disable during initialization
            updateStampMenuDisplay();
            smartControls.style.display = 'block';

            if (hintDiv) {
                hintDiv.innerHTML = '<strong style="color: #3fb950;">🪄 Magic Mask:</strong> Left-click objects to include • Right-click to exclude • Shift+Click to pan';
            }

            // Hardness slider removed; SAM now uses a fixed default hardness
            // from window.samMaskSettings.
            
            // Initialize SAM if not ready
            if (typeof window.initializeSAM === 'function') {
                const statusEl = document.getElementById('samLoadingStatus');
                const segmentBtn = document.getElementById('samSegmentBtn');
                
                if (segmentBtn) segmentBtn.disabled = true;
                
                if (statusEl && !window.samSegmenter.isReady) {
                    statusEl.textContent = '⏳ Preparing AI...';
                }
                
                await window.initializeSAM();
                
                // Check if initialization succeeded
                if (!window.samSegmenter.isReady) {
                    if (statusEl) statusEl.textContent = '⚠ Failed to load';
                    smartSelectBtn.disabled = false; // Re-enable button
                    alert('Failed to load AI model. Please refresh and try again.');
                    return;
                }
                
                // Load current layer image for SAM
                let imageToLoad = null;

                if (maskState.activeMaskLayerId === 'adhoc' && maskState.adhocSource) {
                    // Ad-hoc image (brush-shape import)
                    imageToLoad = maskState.adhocSource.dataURL;
                } else if (maskState.activeMaskLayerId && maskState.activeMaskLayerId.startsWith('image-')) {
                    // Image layer - use stored image data
                    const layerIndex = parseInt(maskState.activeMaskLayerId.replace('image-', ''));
                    const layer = window.layers?.find(l => l.index === layerIndex);
                    if (layer && layer.data) {
                        imageToLoad = layer.data;
                    }
                } else {
                    // Recording layer - capture current canvas
                    const canvas = document.getElementById('canvas');
                    if (canvas) {
                        if (statusEl) statusEl.textContent = '⏳ Capturing canvas...';
                        imageToLoad = canvas.toDataURL('image/png');
                        console.log('📸 Captured canvas for SAM:', canvas.width + 'x' + canvas.height);
                    }
                }
                
                if (imageToLoad && window.samSegmenter) {
                    if (statusEl) statusEl.textContent = '⏳ Loading image...';

                    // Use the click/display space the editor canvas is sized to:
                    // adhoc mode works in the image's own space, everything else
                    // in the main display canvas space.
                    let displayWidth = null, displayHeight = null;
                    if (maskState.activeMaskLayerId === 'adhoc' && maskState.adhocSource) {
                        displayWidth = maskState.adhocSource.width;
                        displayHeight = maskState.adhocSource.height;
                    } else {
                        const displayCanvas = document.getElementById('canvas');
                        displayWidth = displayCanvas ? displayCanvas.width : null;
                        displayHeight = displayCanvas ? displayCanvas.height : null;
                    }

                    const success = await window.samSegmenter.loadImage(imageToLoad, displayWidth, displayHeight);
                    if (success) {
                        if (statusEl) statusEl.textContent = '✓ Ready to segment';
                        if (segmentBtn) {
                            segmentBtn.disabled = false;
                            segmentBtn.title = 'Click to run AI segmentation on selected points';
                        }
                        smartSelectBtn.disabled = false;
                    } else {
                        if (statusEl) statusEl.textContent = '⚠ Image load failed';
                        smartSelectBtn.disabled = false;
                    }
                } else {
                    smartSelectBtn.disabled = false;
                }
            }
        } else {
            smartSelectBtn.classList.remove('engaged');
            smartControls.style.display = 'none';
            maskState.smartSelectPoints = [];
            updateStampMenuDisplay();

            if (hintDiv) {
                hintDiv.innerHTML = '<strong style="color: #58a6ff;">💡 Tip:</strong> Scroll to zoom • Middle-click to pan • Shift+Drag for fine positioning';
            }

            renderMaskEditor();
        }
    };
    
    // Clear SAM points
    window.clearSAMPoints = function() {
        maskState.smartSelectPoints = [];
        maskState.samPreviewMask = null; // Clear preview
        maskState.samCandidates = [];
        maskState.samSelectedCandidateIndex = 0;
        
        // Clear debounce timers
        if (maskState.samDebounceTimer) {
            clearTimeout(maskState.samDebounceTimer);
            maskState.samDebounceTimer = null;
        }
        if (maskState.samHardnessDebounceTimer) {
            clearTimeout(maskState.samHardnessDebounceTimer);
            maskState.samHardnessDebounceTimer = null;
        }
        
        // Disable segment button
        const segmentBtn = document.getElementById('samSegmentBtn');
        if (segmentBtn) {
            segmentBtn.disabled = true;
        }

        // Hide candidate controls
        const candControls = document.getElementById('samCandidateControls');
        if (candControls) {
            candControls.style.display = 'none';
        }
        
        // Hide loading indicator
        const loadingIndicator = document.getElementById('samLoadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        // No points, no timers → Apply is available again
        samSyncApplyBusy();
        renderMaskEditor();
    };

    // Magic Mask is a slow async chain: first-use model download → image
    // embed → 200ms click debounce → CPU-only inference. While a cutout is
    // still on its way for the placed points, Apply must not fall through to
    // buildAdhocResultCanvas's whole-image fallback — that authors a stamp
    // covering the full file rect (the "giant square" brush bug).
    function samCutoutPending() {
        return !!(maskState.isProcessingSAM || maskState.samDebounceTimer ||
            (maskState.smartSelectPoints.length && !maskState.samPreviewMask &&
                !maskState.shapes.length));
    }

    // Reflect the pending state on the ✓ Apply button so the user can see
    // why Apply is waiting (also covers the model-still-downloading window,
    // where clicks schedule nothing at all).
    function samSyncApplyBusy() {
        const btn = document.querySelector('.mask-apply-btn');
        if (!btn) return;
        const busy = samCutoutPending();
        btn.disabled = busy;
        btn.textContent = busy ? '⏳ Cutting out…' : '✓ Apply Mask';
    }

    // Auto-run SAM segmentation (live preview)
    async function autoRunSAMSegmentation() {
        if (maskState.isProcessingSAM) return;
        if (maskState.smartSelectPoints.length === 0) return;
        if (!window.samSegmenter || !window.samSegmenter.isReady) return;

        maskState.isProcessingSAM = true;
        samSyncApplyBusy();
        
        // Show loading indicator
        const loadingIndicator = document.getElementById('samLoadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
        
        try {
            const points = maskState.smartSelectPoints.map(p => [p.x, p.y]);
            const labels = maskState.smartSelectPoints.map(p => p.label);
            
            const result = await window.samSegmenter.segment(points, labels);
            
            if (result && result.candidates && result.candidates.length) {
                // Store all candidates and select the default one
                maskState.samCandidates = result.candidates;
                maskState.samSelectedCandidateIndex = result.bestCandidateIndex ?? 0;
                maskState.samPreviewMask = maskState.samCandidates[maskState.samSelectedCandidateIndex];

                samUpdateCandidateControls();
                renderMaskEditor();
                console.log('🔍 SAM preview updated (multi-candidate)', {
                    totalCandidates: result.candidates.length,
                    selectedIndex: maskState.samSelectedCandidateIndex
                });
                
                // Enable segment button
                const segmentBtn = document.getElementById('samSegmentBtn');
                if (segmentBtn) {
                    segmentBtn.disabled = false;
                }
            }
        } catch (error) {
            console.error('❌ Auto-segmentation error:', error);
        } finally {
            maskState.isProcessingSAM = false;
            samSyncApplyBusy();

            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
        }
    }
    
    // Update SAM candidate controls UI based on current candidates.
    // Renders one chip per proposal and switches preview on hover.
    function samUpdateCandidateControls() {
        const candControls = document.getElementById('samCandidateControls');
        if (!candControls) return;

        const total = maskState.samCandidates ? maskState.samCandidates.length : 0;
        candControls.innerHTML = '';

        if (!total) {
            candControls.style.display = 'none';
            return;
        }

        candControls.style.display = 'flex';
        const idx = Math.min(Math.max(maskState.samSelectedCandidateIndex, 0), total - 1);

        const label = document.createElement('span');
        label.textContent = 'Cutout options:';
        label.style.cssText = 'font-size: 12px; color: #8b949e; margin-right: 4px;';
        candControls.appendChild(label);

        for (let i = 0; i < total; i++) {
            const btn = document.createElement('button');
            btn.className = 'mask-zoom-btn';
            btn.textContent = String(i + 1);
            btn.title = `Mask proposal ${i + 1} of ${total}`;

            if (i === idx) {
                btn.style.background = 'rgba(88,166,255,0.4)';
                btn.style.color = '#fff';
            }

            btn.onmouseenter = () => {
                // Preview this candidate on hover
                maskState.samPreviewMask = maskState.samCandidates[i];
                maskState.samSelectedCandidateIndex = i;
                samUpdateCandidateControls();
                renderMaskEditor();
            };

            btn.onclick = () => {
                // Explicitly select this candidate
                maskState.samPreviewMask = maskState.samCandidates[i];
                maskState.samSelectedCandidateIndex = i;
                samUpdateCandidateControls();
                renderMaskEditor();
            };

            candControls.appendChild(btn);
        }
    }

    // Cycle to previous SAM candidate
    window.samSelectPrevCandidate = function() {
        const total = maskState.samCandidates ? maskState.samCandidates.length : 0;
        if (!total) return;
        maskState.samSelectedCandidateIndex = (maskState.samSelectedCandidateIndex - 1 + total) % total;
        maskState.samPreviewMask = maskState.samCandidates[maskState.samSelectedCandidateIndex];
        samUpdateCandidateControls();
        renderMaskEditor();
    };

    // Cycle to next SAM candidate
    window.samSelectNextCandidate = function() {
        const total = maskState.samCandidates ? maskState.samCandidates.length : 0;
        if (!total) return;
        maskState.samSelectedCandidateIndex = (maskState.samSelectedCandidateIndex + 1) % total;
        maskState.samPreviewMask = maskState.samCandidates[maskState.samSelectedCandidateIndex];
        samUpdateCandidateControls();
        renderMaskEditor();
    };

    // Run SAM segmentation
    window.runSAMSegmentation = async function() {
        if (maskState.samPreviewMask) {
            const maskResult = maskState.samPreviewMask;
            const bbox = maskResult.boundingBox;
            
            // Crop mask to bounding box so it's relative to shape.x, shape.y
            const croppedMask = new Uint8Array(bbox.width * bbox.height);
            for (let y = 0; y < bbox.height; y++) {
                for (let x = 0; x < bbox.width; x++) {
                    const srcX = bbox.x + x;
                    const srcY = bbox.y + y;
                    const srcIdx = srcY * maskResult.width + srcX;
                    const dstIdx = y * bbox.width + x;
                    croppedMask[dstIdx] = maskResult.data[srcIdx];
                }
            }
            
            const shape = {
                type: 'sam-mask', // Mark as SAM pixel mask
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height,
                rotation: 0,
                samMask: croppedMask, // Store cropped mask (relative to bbox)
                samMaskWidth: bbox.width, // Cropped dimensions
                samMaskHeight: bbox.height,
                // D0.5: soft masks carry 0-255 coverage (antialiased edges);
                // legacy masks are 0/1 and consumers keep them hard
                samSoft: !!maskResult.soft
            };
            
            maskState.shapes.push(shape);
            maskState.selectedShapeIndex = maskState.shapes.length - 1;
            maskState.smartSelectPoints = [];
            maskState.samPreviewMask = null;
            
            // Auto-disable Magic Mask mode so user can immediately transform the shape
            if (maskState.smartSelectMode) {
                window.toggleSmartSelect();
            }
            
            updateMaskEditorTitle();
            updateRotationControl();
            renderMaskEditor();
        } else {
            alert('Please add at least 3 points by clicking on the object. SAM will segment automatically.');
        }
    };

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayerMasks);
    } else {
        initLayerMasks();
    }

    // Check if a point passes through a layer's mask
    window.checkMaskPoint = function(layerId, x, y) {
        const layer = window.recLayers?.find(l => l.id === layerId);
        if (!layer || !layer.mask || !layer.mask.enabled || !layer.mask.shapes || layer.mask.shapes.length === 0) {
            return true; // No mask, allow all points
        }

        const canvas = document.getElementById('canvas');
        if (!canvas) return true;

        // Convert normalized coordinates to canvas coordinates
        const canvasX = x * canvas.width;
        const canvasY = y * canvas.height;

        // Check if point is inside any shape
        let isInside = false;
        for (const shape of layer.mask.shapes) {
            if (isPointInShapeMask(shape, canvasX, canvasY)) {
                isInside = true;
                break;
            }
        }

        // Apply mask mode
        if (layer.mask.mode === 'show') {
            return isInside; // Only show if inside a shape
        } else {
            return !isInside; // Only show if outside shapes (hide mode)
        }
    };

    // Helper to check if point is in shape (using canvas coordinates)
    function isPointInShapeMask(shape, x, y) {
        // If shape has depth mask data, check depth value against threshold
        if (shape.type === 'depth-mask' && shape.depthData && shape.depthWidth && shape.depthHeight) {
            const relX = (x - shape.x) / shape.width * shape.depthWidth;
            const relY = (y - shape.y) / shape.height * shape.depthHeight;
            if (relX < 0 || relY < 0 || relX >= shape.depthWidth || relY >= shape.depthHeight) {
                return false;
            }
            const pixelIndex = Math.floor(relY) * shape.depthWidth + Math.floor(relX);
            const depthVal = shape.depthData[pixelIndex] || 0;
            const threshold = shape.threshold || 128;
            const invert = shape.invert || false;
            return invert ? (depthVal < threshold) : (depthVal >= threshold);
        }

        // If shape has SAM pixel mask data, use it for precise checking
        if (shape.samMask && shape.samMaskWidth && shape.samMaskHeight) {
            // Convert canvas coordinates to mask-relative coordinates
            const relX = x - shape.x;
            const relY = y - shape.y;
            
            // Check if point is within mask bounds
            if (relX < 0 || relY < 0 || relX >= shape.samMaskWidth || relY >= shape.samMaskHeight) {
                return false;
            }
            // Check the actual pixel in the mask. Soft masks (0-255 coverage)
            // gate at half-coverage so the boolean edge sits mid-ramp —
            // matching where the visual/collider edge reads ~50%.
            const pixelIndex = Math.floor(relY) * shape.samMaskWidth + Math.floor(relX);
            return shape.samSoft ? (shape.samMask[pixelIndex] >= 128) : (shape.samMask[pixelIndex] > 0);
        }
        
        // Fallback to geometric shapes
        if (shape.type === 'circle') {
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;
            const r = shape.width / 2;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            return dist <= r;
        } else if (shape.type === 'ellipse') {
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;
            const rx = shape.width / 2;
            const ry = shape.height / 2;
            const normalized = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            return normalized <= 1;
        } else {
            // Rectangle
            return x >= shape.x && x <= shape.x + shape.width &&
                   y >= shape.y && y <= shape.y + shape.height;
        }
    }

    // Enter mask editing mode for an image layer
    window.enterImageLayerMaskMode = function(layerIndex) {
        if (!window.layers) {
            console.error('❌ window.layers is not defined!');
            return;
        }
        
        const layer = window.layers.find(l => l.index === layerIndex);
        
        if (!layer) {
            console.error('❌ Layer not found with index:', layerIndex);
            return;
        }

        // Reset state completely for new layer
        maskState.activeMaskLayerId = `image-${layerIndex}`;
        maskState.maskMode = layer.mask?.mode || 'show';
        maskState.shapes = layer.mask?.shapes ? cloneMaskShapes(layer.mask.shapes) : [];
        maskState.selectedShapeIndex = null;
        maskState.isDragging = false;
        maskState.isResizing = false;
        maskState.zoom = 1.0;
        maskState.panX = 0;
        maskState.panY = 0;
        maskState.isPanning = false;
        
        // Show mask editor overlay
        showMaskEditor();
        
        // Update title and render with fresh state
        setTimeout(() => {
            updateMaskEditorTitleForImageLayer(layer);
            updateZoomDisplay();
            renderMaskEditor();
        }, 10);
    };

    // ── Ad-hoc mask mode (2026-08-09): run the full editor (stamps +
    // Magic Mask Objects) against an arbitrary image, no layer involved. Used by
    // custom brush shapes (33-brush-shapes). The editor canvas is sized to
    // the IMAGE (capped 2048 long side) so nothing is aspect-stretched;
    // shapes/SAM all operate in that space. On Apply, the caller gets a
    // white/alpha canvas: alpha = image alpha (or inverted luminance for
    // fully opaque images with no shapes) ∩ the drawn mask coverage.
    window.enterAdhocMaskMode = function (imageDataURL, name, onApply) {
        const img = new Image();
        img.onload = () => {
            const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
            // Work at a comfortable editing resolution: the editor canvas
            // displays at its native CSS px (.mask-editor-canvas only has
            // max-width/height), so a small brush image would otherwise open
            // a postage-stamp editor. Scale small images UP to 800, cap huge
            // ones at 2048 — the saved stamp is ≤128px either way (33).
            const target = Math.min(2048, Math.max(long, 800));
            const scale = target / long;
            maskState.adhocSource = {
                image: img,
                dataURL: imageDataURL,
                name: name || 'Brush Shape',
                onApply: onApply,
                width: Math.max(1, Math.round((img.naturalWidth || 1) * scale)),
                height: Math.max(1, Math.round((img.naturalHeight || 1) * scale))
            };
            maskState.activeMaskLayerId = 'adhoc';
            maskState.maskMode = 'show';
            maskState.shapes = [];
            maskState.selectedShapeIndex = null;
            maskState.isDragging = false;
            maskState.isResizing = false;
            maskState.zoom = 1.0;
            maskState.panX = 0;
            maskState.panY = 0;
            maskState.isPanning = false;
            // A previous editor session may have left SAM state behind — a
            // stale samPreviewMask would otherwise be converted into THIS
            // stamp by the Apply nicety in exitAdhocMaskMode.
            maskState.smartSelectPoints = [];
            maskState.samPreviewMask = null;
            maskState.samCandidates = [];
            maskState.samSelectedCandidateIndex = 0;
            showMaskEditor();
            // Reset the overlay DOM too if Magic Mask was left engaged
            // (toggleSmartSelect's OFF branch restores the manual tools).
            if (maskState.smartSelectMode && typeof window.toggleSmartSelect === 'function') {
                try { window.toggleSmartSelect(); } catch (_) {}
            }
            setTimeout(() => {
                updateMaskEditorTitle();
                updateZoomDisplay();
                renderMaskEditor();
            }, 10);
        };
        img.onerror = () => { alert('Could not decode that image.'); };
        img.src = imageDataURL;
    };

    // Rasterize the adhoc editor state into the caller's stamp canvas.
    // Must run BEFORE maskState.shapes is reset.
    function buildAdhocResultCanvas(src) {
        const w = src.width, h = src.height;
        const out = document.createElement('canvas');
        out.width = w; out.height = h;
        const octx = out.getContext('2d');
        octx.drawImage(src.image, 0, 0, w, h);
        let data;
        try { data = octx.getImageData(0, 0, w, h); } catch (_) { return null; }
        const px = data.data;
        // Does the source image carry real transparency?
        let hasAlpha = false;
        for (let i = 3; i < px.length; i += 4) { if (px[i] < 250) { hasAlpha = true; break; } }
        // Coverage from the drawn shapes (the canonical renderer handles
        // every shape type incl. sam-mask softness)
        let cov = null;
        if (maskState.shapes.length && typeof window._drawMaskShape === 'function') {
            const cc = document.createElement('canvas');
            cc.width = w; cc.height = h;
            const cctx = cc.getContext('2d');
            maskState.shapes.forEach(s => {
                // Same rotation wrap as applyLayerMask (05m): _drawMaskShape
                // draws unrotated; the editor preview rotates via the canvas
                // transform, so the applied result must too.
                const rotation = s.rotation || 0;
                if (rotation !== 0) {
                    cctx.save();
                    const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
                    cctx.translate(cx, cy);
                    cctx.rotate((rotation * Math.PI) / 180);
                    cctx.translate(-cx, -cy);
                }
                try { window._drawMaskShape(cctx, s); } catch (_) {}
                if (rotation !== 0) cctx.restore();
            });
            cov = cctx.getImageData(0, 0, w, h).data;
        }
        const invertCov = maskState.maskMode === 'hide';
        for (let i = 0; i < px.length; i += 4) {
            let a;
            if (hasAlpha) {
                a = px[i + 3] / 255;
            } else if (!cov) {
                // Opaque image, no shapes: Photoshop convention — dark paints
                const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
                a = 1 - lum;
            } else {
                a = 1;
            }
            if (cov) {
                let c = cov[i + 3] / 255;
                if (invertCov) c = 1 - c;
                a *= c;
            }
            px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
            px[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
        }
        octx.putImageData(data, 0, 0);
        return out;
    }

    function exitAdhocMaskMode(save = true) {
        const src = maskState.adhocSource;
        // Applying while the cutout is still in flight would build the
        // whole-image fallback stamp — the full-file-rect "giant square".
        // Hold the editor open instead; Cancel is always available.
        if (save && samCutoutPending()) {
            alert('Magic Mask is still cutting out your object — wait for the green preview, or Cancel.');
            return;
        }
        // Same Apply nicety as image layers: a pending SAM preview with no
        // finalized shape converts on Apply.
        if (save && src && !maskState.shapes.length && maskState.samPreviewMask
            && typeof window.runSAMSegmentation === 'function') {
            window.runSAMSegmentation();
        }
        let result = null;
        if (save && src) result = buildAdhocResultCanvas(src);
        hideMaskEditor();
        maskState.activeMaskLayerId = null;
        maskState.shapes = [];
        maskState.selectedShapeIndex = null;
        maskState.adhocSource = null;
        // Never leak this session's SAM preview into a later editor
        maskState.smartSelectPoints = [];
        maskState.samPreviewMask = null;
        maskState.samCandidates = [];
        maskState.samSelectedCandidateIndex = 0;
        if (result && src && typeof src.onApply === 'function') {
            try { src.onApply(result, src.name); } catch (e) { console.error('adhoc mask onApply failed', e); }
        }
    }

    // Exit mask mode for image layer
    function exitImageLayerMaskMode(save = true) {
        if (!maskState.activeMaskLayerId || !maskState.activeMaskLayerId.startsWith('image-')) return;
        // Same in-flight guard as the adhoc editor: applying before the
        // cutout lands would save an empty/incomplete mask.
        if (save && samCutoutPending()) {
            alert('Magic Mask is still cutting out your object — wait for the green preview, or Cancel.');
            return;
        }

        const layerIndex = parseInt(maskState.activeMaskLayerId.replace('image-', ''));
        const layer = window.layers?.find(l => l.index === layerIndex);
        
        if (save && layer) {
            // If the user clicks Apply while a SAM preview exists but no
            // finalized shapes have been created yet, automatically convert
            // the preview into a sam-mask so Apply both segments and applies.
            if (!maskState.shapes.length && maskState.samPreviewMask && typeof window.runSAMSegmentation === 'function') {
                window.runSAMSegmentation();
            }

            // Save mask data to layer (preserving SAM pixel masks)
            layer.mask = {
                enabled: maskState.shapes.length > 0,
                mode: maskState.maskMode,
                shapes: cloneMaskShapes(maskState.shapes)
            };
        }

        // Hide mask editor overlay
        hideMaskEditor();

        // Reset mask state
        maskState.activeMaskLayerId = null;
        maskState.shapes = [];
        maskState.selectedShapeIndex = null;

        // Apply mask to layer immediately
        if (save && layer && typeof window.applyLayerMask === 'function') {
            window.applyLayerMask(layerIndex);
        }

        // Collision layers: re-composite the physics obstacle from the edited mask
        if (save && layer && layer.isCollision && window.collisionLayers) {
            window.collisionLayers.updateObstacleFromLayers();
        }

        // Refresh UI
        if (typeof window.renderLayers === 'function') {
            window.renderLayers();
        }
    }

    // Update mask editor title for image layer
    function updateMaskEditorTitleForImageLayer(layer) {
        const overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) return;

        const header = overlay.querySelector('.mask-editor-header h3');
        if (header) {
            const shapeCount = maskState.shapes.length;
            header.innerHTML = `✂️ Mask Editor - ${window.escHtml(layer.title)} <span style="font-size: 14px; opacity: 0.7;">(${shapeCount} shape${shapeCount !== 1 ? 's' : ''})</span>`;
        }
    }

    // Override exitMaskMode to handle every target type
    const originalExitMaskMode = window.exitMaskMode;
    window.exitMaskMode = function(save = true) {
        if (maskState.activeMaskLayerId === 'adhoc') {
            exitAdhocMaskMode(save);
        } else if (maskState.activeMaskLayerId && maskState.activeMaskLayerId.startsWith('image-')) {
            exitImageLayerMaskMode(save);
        } else {
            originalExitMaskMode(save);
        }
    };

    // Update title function to handle every target type
    const originalUpdateMaskEditorTitle = updateMaskEditorTitle;
    updateMaskEditorTitle = function() {
        if (maskState.activeMaskLayerId === 'adhoc') {
            const overlay = document.getElementById('maskEditorOverlay');
            const header = overlay && overlay.querySelector('.mask-editor-header h3');
            if (header) {
                const shapeCount = maskState.shapes.length;
                const nm = (maskState.adhocSource && maskState.adhocSource.name) || 'Brush Shape';
                header.innerHTML = `🖌️ Brush Shape - ${window.escHtml(nm)} <span style="font-size: 14px; opacity: 0.7;">(${shapeCount} shape${shapeCount !== 1 ? 's' : ''})</span>`;
            }
            return;
        }
        if (maskState.activeMaskLayerId && maskState.activeMaskLayerId.startsWith('image-')) {
            const layerIndex = parseInt(maskState.activeMaskLayerId.replace('image-', ''));
            const layer = window.layers?.find(l => l.index === layerIndex);
            if (layer) {
                updateMaskEditorTitleForImageLayer(layer);
            }
        } else {
            originalUpdateMaskEditorTitle();
        }
    };

    // Expose functions
    window.initLayerMasks = initLayerMasks;
})();
