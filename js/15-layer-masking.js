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
        samSelectedCandidateIndex: 0,
        // ── Wizard (2026-08-18) ────────────────────────────────────────
        // The editor runs as three steps — 1 Select, 2 Touch up, 3 Soften &
        // finish — so a mask (and the collider made from it) is one guided
        // pass instead of "find the right buttons, then remember to feather
        // the layer afterwards".
        wizardActive: false,      // false for collider paint mode (own UI)
        wizardStep: 1,
        touchUp: null,            // {canvas, ctx, w, h, dirty, undo[], redo[]}
        touchUpTool: 'erase',     // strays are the common case — start there
        touchUpSize: 14,          // same units as the collider brush (÷1000 × width)
        touchUpPainting: false,
        touchUpAlt: false,        // right-drag = the other tool
        touchUpCursor: null,      // {x, y} in stored space, for the brush ring
        feather: 0,               // 0-100, mirrors layer.threshold
        featherBase: null,        // cached un-blurred coverage for the preview
        featherPrev: null,        // cached blurred+tinted preview {f, canvas}
        makeCollider: false,      // step 3 opt-in: build the collision layer too
        // Step 1 Filter tab — the layer panel's Mask slider with a background
        // colour instead of an assumed black one.
        filterMode: false,
        filterBg: { r: 0, g: 0, b: 0 },
        filterBgPicked: false,    // has this session chosen/guessed a colour yet
        filterThreshold: 0,       // 0-100; 0 = filter off
        filterInvert: false,
        filterPicking: false,     // eyedropper armed
        filterShape: null,        // the shape this filter baked, if it is live
        filterPrev: null          // cached tinted preview {sig, canvas}
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
        wizardBegin();
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
        // maskState persists across editor sessions — leftover Instant Roto
        // points from this one must not wedge a later session's Apply button.
        resetSamSessionState();

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
                <!-- Wizard rail: the three steps of making a mask. Clickable,
                     so it doubles as navigation for anyone who already knows
                     the flow. Hidden in collider paint mode. -->
                <div class="mask-wizard-rail" id="maskWizardRail">
                    <button type="button" class="mask-wizard-step" data-step="1" title="Pick what to mask — Instant Roto or stamped shapes">
                        <span class="mask-wizard-num">1</span> Select
                    </button>
                    <span class="mask-wizard-sep">›</span>
                    <button type="button" class="mask-wizard-step" data-step="2" title="Brush away strays and paint in anything the AI missed">
                        <span class="mask-wizard-num">2</span> Touch up
                    </button>
                    <span class="mask-wizard-sep">›</span>
                    <button type="button" class="mask-wizard-step" data-step="3" title="Soften the edge, then apply — no need to feather the layer afterwards">
                        <span class="mask-wizard-num">3</span> Soften &amp; finish
                    </button>
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
                    <!-- Collider painting (2026-08-16): shown only when the
                         editor was opened on a mask-sourced collision layer.
                         Strokes go straight into that collider's mask, so
                         walls can be tweaked where you can see them. -->
                    <div id="colliderTools" class="mask-collider-tools" style="display:none;">
                        <div class="mask-collider-row">
                            <button id="colliderDrawBtn" class="mask-mode-btn collider-tool-btn active" title="Add collider area — paint walls the fluid flows around">Draw</button>
                            <button id="colliderEraseBtn" class="mask-mode-btn collider-tool-btn" title="Remove collider area — erase walls back out">Erase</button>
                            <!-- Same units as the Brush Size fader (1-30 → SPLAT_RADIUS/1000) -->
                            <label class="collider-size-label">Size
                                <input type="range" id="colliderSize" min="1" max="30" step="0.5" value="11" data-no-scale="1">
                                <span id="colliderSizeVal">11</span>
                            </label>
                            <button id="colliderUndoBtn" class="mask-mode-btn collider-tool-btn" title="Undo the last collider stroke (Ctrl+Z)">↶</button>
                            <button id="colliderRedoBtn" class="mask-mode-btn collider-tool-btn" title="Redo (Ctrl+Shift+Z)">↷</button>
                        </div>
                        <div class="mask-collider-hint">Paint directly on the artwork — the collider and its thumbnail update as you go. Shift+drag pans, scroll zooms.</div>
                    </div>
                    <!-- Step 1's three ways to make a selection, as tabs over
                         one panel. #smartSelectBtn / #stampMenuBtn keep their
                         ids: toggleSmartSelect and updateStampMenuDisplay
                         drive them by id and are unchanged. -->
                    <div class="mask-tools-row mask-tool-tabs" role="tablist">
                        <button id="smartSelectBtn" class="mask-tool-tab" data-tool="magic" onclick="window.setMaskTool('magic')" title="AI-powered object masking&#10;Click objects and the model cuts them out for you&#10;First use: downloads a ~40 MB model (cached locally)">
                            <span class="mask-tool-tab-icon">🪄</span> Instant Roto
                        </button>
                        <button id="stampMenuBtn" class="mask-tool-tab" data-tool="stamps" onclick="window.setMaskTool('stamps')" title="Stamp shapes onto the mask&#10;Rectangles, circles, stars and more — drag to place, resize with the handle">
                            <span class="mask-tool-tab-icon">▦</span> Stamps
                        </button>
                        <button id="filterToolBtn" class="mask-tool-tab" data-tool="filter" onclick="window.setMaskTool('filter')" title="Key out a solid background&#10;Pick the background colour, drag the cut up — the shape falls out of it">
                            <span class="mask-tool-tab-icon">🎚️</span> Filter
                        </button>
                        <span id="samLoadingStatus" style="font-size: 12px; color: #8b949e; align-self: center;"></span>
                    </div>
                    <div id="stampMenu" class="mask-stamp-menu mask-tool-panel" style="display: none;">
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
                    <!-- Filter: the layer panel's Mask slider, brought into the
                         flow and given the background control it always needed
                         (that slider keys against BLACK — real photos aren't). -->
                    <div id="filterPanel" class="mask-filter-panel mask-tool-panel" style="display: none;">
                        <div class="mask-filter-hint">
                            For a subject on a flat background: set the background colour, then raise the cut until only the shape is left.
                        </div>
                        <div class="mask-filter-row">
                            <span class="mask-filter-label">Background</span>
                            <input type="color" id="filterBgColor" value="#000000" title="The colour being cut away">
                            <button type="button" id="filterPickBtn" class="mask-action-btn" title="Then click the background on the image">Pick</button>
                            <button type="button" id="filterAutoBtn" class="mask-action-btn" title="Guess it from the edges of the image">Auto</button>
                        </div>
                        <label class="mask-filter-row">
                            <span class="mask-filter-label">Cut amount</span>
                            <input type="range" id="filterThreshold" min="0" max="100" step="1" value="0" data-no-scale="1">
                            <span id="filterThresholdValue" class="mask-filter-value">0%</span>
                        </label>
                        <label class="mask-filter-check">
                            <input type="checkbox" id="filterInvert"> Invert — keep the background, drop the subject
                        </label>
                    </div>
                    <div id="smartSelectControls" class="mask-tool-panel" style="display: none; background: rgba(63, 185, 80, 0.08); padding: 12px; margin-bottom: 8px; border: 1px solid rgba(63, 185, 80, 0.2);">
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
                                ✨ Instant Roto It
                            </button>
                            <button class="mask-action-btn" onclick="window.clearSAMPoints()">
                                🗑️ Clear Points
                            </button>
                        </div>
                        <div id="samCandidateControls" style="display: none; gap: 6px; margin-top: 8px; align-items: center;" title="The AI proposes a few cutouts — hover to preview, click to choose"></div>
                        <div id="samLoadingIndicator" style="display: none; margin-top: 8px; padding: 8px; background: rgba(88, 166, 255, 0.15); border-radius: 4px; font-size: 12px; color: #58a6ff; text-align: center;">
                            <span class="sam-spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(88, 166, 255, 0.3); border-top-color: #58a6ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px;"></span>
                            Instant Roto is cutting out your object...
                        </div>
                    </div>
                    <!-- Step 2: touch up. Brushes the flattened mask coverage
                         directly — the fix for "the AI left a stray blob /
                         missed the handle". -->
                    <div id="touchUpTools" class="mask-collider-tools" style="display:none;">
                        <div class="mask-collider-row">
                            <button id="touchUpEraseBtn" class="mask-mode-btn collider-tool-btn active" title="Erase mask — wipe away stray bits the AI included">Erase</button>
                            <button id="touchUpDrawBtn" class="mask-mode-btn collider-tool-btn" title="Add mask — paint in a piece the AI missed">Add</button>
                            <label class="collider-size-label">Size
                                <input type="range" id="touchUpSize" min="2" max="60" step="1" value="14" data-no-scale="1">
                                <span id="touchUpSizeVal">14</span>
                            </label>
                            <button id="touchUpUndoBtn" class="mask-mode-btn collider-tool-btn" title="Undo the last touch-up stroke">↶</button>
                            <button id="touchUpRedoBtn" class="mask-mode-btn collider-tool-btn" title="Redo">↷</button>
                            <button id="touchUpDespeckBtn" class="mask-mode-btn collider-tool-btn" title="Delete every disconnected speck smaller than a twentieth of the main shape">Remove specks</button>
                        </div>
                        <div class="mask-collider-hint" id="touchUpHint">Right-drag does the opposite of the selected tool. Shift+drag pans, scroll zooms.</div>
                    </div>
                    <!-- Step 3: soften (the layer's Feather, brought into the
                         flow) + the optional collider hand-off. -->
                    <div id="featherStep" class="mask-feather-step" style="display:none;">
                        <label class="mask-feather-row">
                            <span class="mask-feather-label">Soften edge</span>
                            <input type="range" id="maskFeatherSlider" min="0" max="100" step="1" value="0" data-no-scale="1">
                            <span id="maskFeatherValue" class="mask-feather-value">0%</span>
                        </label>
                        <div class="mask-feather-hint" id="maskFeatherHint">
                            0% is a hard cut-out. Raise it for a soft edge — the same Feather that lives on the layer, set here so you never have to go back for it.
                        </div>
                        <label class="mask-collider-opt" id="maskColliderOpt" style="display:none;">
                            <input type="checkbox" id="maskMakeCollider"> 🧱 Also make this a collision layer the fluid flows around
                        </label>
                    </div>
                    <div class="mask-rotation-control" id="maskRotationControl" style="display: none; padding: 8px 12px; background: rgba(88, 166, 255, 0.05); border-radius: 6px; margin-top: 8px;">
                        <label style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #c9d1d9;">
                            <span style="min-width: 70px;">Rotation:</span>
                            <input type="range" id="maskRotationSlider" min="0" max="360" value="0" style="flex: 1;">
                            <span id="maskRotationValue" style="min-width: 50px; text-align: right; font-weight: 600; color: #58a6ff;">0°</span>
                        </label>
                    </div>
                    <div class="mask-actions">
                        <button class="mask-action-btn" onclick="window.deleteMaskShape()">Delete</button>
                        <button class="mask-action-btn" onclick="window.clearMaskShapes()">Clear All</button>
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
                    <span class="mask-footer-spacer"></span>
                    <button class="mask-back-btn" id="maskWizardBack" style="display:none;" onclick="window.maskWizardBack()">← Back</button>
                    <button class="mask-next-btn" id="maskWizardNext" style="display:none;" onclick="window.maskWizardNext()">Next →</button>
                    <button class="mask-apply-btn" onclick="window.exitMaskMode(true)">Apply Mask</button>
                </div>
            </div>
        `;

        // Setup event listeners
        setupMaskEditorEvents(overlay);

        return overlay;
    }

    // Setup mask editor event listeners
    function setupMaskEditorEvents(overlay) {
        // ── Collider tools (draw / erase / size / undo / redo) ──
        const cDraw = overlay.querySelector('#colliderDrawBtn');
        const cErase = overlay.querySelector('#colliderEraseBtn');
        const setTool = (t) => {
            maskState.colliderTool = t;
            if (cDraw) cDraw.classList.toggle('active', t === 'draw');
            if (cErase) cErase.classList.toggle('active', t === 'erase');
        };
        if (cDraw) cDraw.addEventListener('click', () => setTool('draw'));
        if (cErase) cErase.addEventListener('click', () => setTool('erase'));
        const cSize = overlay.querySelector('#colliderSize');
        if (cSize) {
            cSize.addEventListener('input', (e) => {
                maskState.colliderSize = parseFloat(e.target.value);
                const out = overlay.querySelector('#colliderSizeVal');
                if (out) out.textContent = String(maskState.colliderSize);
            });
        }
        const cUndo = overlay.querySelector('#colliderUndoBtn');
        const cRedo = overlay.querySelector('#colliderRedoBtn');
        // The mask stamp pushes onto the shared sketch/mask history ring, so
        // these are the same undo the canvas uses — just reachable in here.
        if (cUndo) cUndo.addEventListener('click', () => {
            if (typeof window.__sketchUndo === 'function') window.__sketchUndo();
            scheduleColliderFilm();
        });
        if (cRedo) cRedo.addEventListener('click', () => {
            if (typeof window.__sketchRedo === 'function') window.__sketchRedo();
            scheduleColliderFilm();
        });

        // ── Wizard rail + step controls ──
        overlay.querySelectorAll('.mask-wizard-step').forEach(btn => {
            btn.addEventListener('click', () => {
                wizardGoTo(parseInt(btn.getAttribute('data-step'), 10) || 1);
            });
        });

        // ── Touch-up tools (step 2) ──
        const tErase = overlay.querySelector('#touchUpEraseBtn');
        const tDraw = overlay.querySelector('#touchUpDrawBtn');
        const setTouchTool = (t) => {
            maskState.touchUpTool = t;
            if (tDraw) tDraw.classList.toggle('active', t === 'draw');
            if (tErase) tErase.classList.toggle('active', t === 'erase');
        };
        if (tDraw) tDraw.addEventListener('click', () => setTouchTool('draw'));
        if (tErase) tErase.addEventListener('click', () => setTouchTool('erase'));
        const tSize = overlay.querySelector('#touchUpSize');
        if (tSize) {
            tSize.addEventListener('input', (e) => {
                maskState.touchUpSize = parseFloat(e.target.value);
                const out = overlay.querySelector('#touchUpSizeVal');
                if (out) out.textContent = String(maskState.touchUpSize);
                scheduleMaskRender(); // the brush ring tracks the slider
            });
        }
        const tUndo = overlay.querySelector('#touchUpUndoBtn');
        const tRedo = overlay.querySelector('#touchUpRedoBtn');
        if (tUndo) tUndo.addEventListener('click', () => touchUpHistory('undo'));
        if (tRedo) tRedo.addEventListener('click', () => touchUpHistory('redo'));
        const tDespeck = overlay.querySelector('#touchUpDespeckBtn');
        if (tDespeck) tDespeck.addEventListener('click', removeMaskSpecks);

        // ── Filter tab (step 1) ──
        const fBg = overlay.querySelector('#filterBgColor');
        if (fBg) {
            fBg.addEventListener('input', (e) => {
                const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(e.target.value || '');
                if (!m) return;
                maskState.filterBg = { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
                maskState.filterBgPicked = true;
                invalidateFilterPreview();
                scheduleMaskRender();
            });
        }
        const fPick = overlay.querySelector('#filterPickBtn');
        if (fPick) {
            fPick.addEventListener('click', () => {
                maskState.filterPicking = !maskState.filterPicking;
                filterSyncControls();
                setStepHint(maskState.filterPicking
                    ? '<strong style="color:#58a6ff;">💧 Click the background</strong> on the image to key that colour out.'
                    : STEP_HINTS[1]);
            });
        }
        const fAuto = overlay.querySelector('#filterAutoBtn');
        if (fAuto) {
            fAuto.addEventListener('click', () => {
                if (autoPickFilterBackground()) {
                    maskState.filterBgPicked = true;
                    invalidateFilterPreview();
                    filterSyncControls();
                    scheduleMaskRender();
                } else {
                    setStepHint('<strong style="color:#8b949e;">Could not read the image edges</strong> — pick the colour by hand.', 3000);
                }
            });
        }
        const fThr = overlay.querySelector('#filterThreshold');
        if (fThr) {
            fThr.addEventListener('input', (e) => {
                maskState.filterThreshold = parseInt(e.target.value, 10) || 0;
                const out = overlay.querySelector('#filterThresholdValue');
                if (out) out.textContent = maskState.filterThreshold + '%';
                invalidateFilterPreview();
                scheduleMaskRender();
            });
        }
        const fInv = overlay.querySelector('#filterInvert');
        if (fInv) {
            fInv.addEventListener('change', (e) => {
                maskState.filterInvert = !!e.target.checked;
                invalidateFilterPreview();
                scheduleMaskRender();
            });
        }

        // ── Feather + finish (step 3) ──
        const fSlider = overlay.querySelector('#maskFeatherSlider');
        if (fSlider) {
            fSlider.addEventListener('input', (e) => {
                maskState.feather = parseInt(e.target.value, 10) || 0;
                const out = overlay.querySelector('#maskFeatherValue');
                if (out) out.textContent = maskState.feather + '%';
                // The preview re-runs the real box blur — coalesce a drag's
                // worth of input events into one frame.
                scheduleMaskRender();
            });
        }
        const mkCollider = overlay.querySelector('#maskMakeCollider');
        if (mkCollider) {
            mkCollider.addEventListener('change', (e) => {
                maskState.makeCollider = !!e.target.checked;
            });
        }

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
            // POINTER events, not compat mouse events (2026-08-18). A stylus
            // drag on a surface the browser has not been told to keep its hands
            // off is a candidate pan gesture: Chrome fires pointerdown, decides
            // it is a scroll, sends pointercancel and SUPPRESSES the compat
            // mousemove/mouseup — so the touch-up brush got the press and never
            // the stroke, while a tap (no gesture) worked fine. The pen fix that
            // moved the paint canvas to pointer events (05d) left this surface
            // behind; .mask-editor-canvas also carries touch-action: none now,
            // which is the half that actually stops the gesture.
            // Capture replaces the old mouseleave-ends-the-drag hack: a stroke
            // that wanders off the canvas keeps painting and still finishes on
            // release, and pointercancel finalizes gracefully instead of
            // leaving the brush stuck down.
            canvas.addEventListener('pointerdown', (e) => {
                try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
                handleMaskCanvasMouseDown(e);
            });
            canvas.addEventListener('pointermove', handleMaskCanvasMouseMove);
            canvas.addEventListener('pointerup', handleMaskCanvasMouseUp);
            canvas.addEventListener('pointercancel', handleMaskCanvasMouseUp);
            // Boundary events are suppressed while captured, so this only ever
            // lands between strokes — exactly when the ring should go away.
            canvas.addEventListener('pointerleave', handleMaskCanvasMouseUp);
            
            // Prevent context menu where right-click is a tool: SAM exclude
            // points, and the touch-up brush's "other tool" drag.
            canvas.addEventListener('contextmenu', (e) => {
                if (maskState.smartSelectMode || touchUpActive()) {
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
                scheduleMaskRender();
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
    // Assigning .value on a range input does NOT move its fill. The heat bar
    // is painted from the --val custom property (css/slider-styles.css), and
    // 06-slider-updater.js only refreshes that on real 'input'/'change'
    // events — which a programmatic assignment does not fire. So every
    // sync-from-state left the bar wherever the user last dragged it while
    // the number beside it read the new value: open the mask editor after
    // using it once and Cut amount says 0% over a half-filled bar. The CSS
    // default is --val:50, so a never-touched slider starts half full too.
    function setRangeValue(el, v) {
        if (!el) return;
        el.value = String(v);
        try { el.style.setProperty('--val', String(v)); } catch (_) {}
    }

    function updateRotationControl() {
        const rotationControl = document.getElementById('maskRotationControl');
        const rotationSlider = document.getElementById('maskRotationSlider');
        const rotationValue = document.getElementById('maskRotationValue');
        
        if (!rotationControl || !rotationSlider || !rotationValue) return;
        
        if (maskState.selectedShapeIndex !== null && maskState.selectedShapeIndex >= 0) {
            const shape = maskState.shapes[maskState.selectedShapeIndex];
            const rotation = shape.rotation || 0;
            
            rotationControl.style.display = 'block';
            setRangeValue(rotationSlider, rotation);
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
        maskState.filterShape = null; // whatever it baked is going with them
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

        // Collider mode: left-drag paints (or erases) the collider's mask;
        // Shift+drag still pans. Right-drag pans too — the shape tools that
        // owned right-click aren't in this mode.
        if (colliderModeActive()) {
            if (e.shiftKey || e.button === 2 || e.button === 1) {
                maskState.isPanning = true;
                maskState.panStartX = screenX - maskState.panX;
                maskState.panStartY = screenY - maskState.panY;
                e.preventDefault();
                return;
            }
            if (e.button !== 0) return;
            maskState.colliderPainting = true;
            maskState.colliderLastX = x;
            maskState.colliderLastY = y;
            colliderStamp(x, y);
            scheduleColliderFilm();
            e.preventDefault();
            return;
        }

        // Eyedropper: one click anywhere on the artwork sets the colour the
        // filter keys out. Takes precedence over shape hit-testing while armed.
        if (filterActive() && maskState.filterPicking && e.button === 0 && !e.shiftKey) {
            const picked = sampleFilterColorAt(x, y);
            maskState.filterPicking = false;
            if (picked) {
                maskState.filterBg = picked;
                maskState.filterBgPicked = true;
                invalidateFilterPreview();
                setStepHint('<strong style="color:#3fb950;">Background set</strong> — raise Cut amount to key it out.', 2600);
            } else {
                setStepHint('<strong style="color:#8b949e;">Could not read that pixel</strong> — set the colour by hand.', 3000);
            }
            filterSyncControls();
            scheduleMaskRender();
            e.preventDefault();
            return;
        }

        // Touch-up mode (wizard step 2): left-drag runs the selected tool,
        // right-drag runs the other one (the painter's reflex), shift/middle
        // still pan.
        if (touchUpActive()) {
            if (e.shiftKey || e.button === 1) {
                maskState.isPanning = true;
                maskState.panStartX = screenX - maskState.panX;
                maskState.panStartY = screenY - maskState.panY;
                e.preventDefault();
                return;
            }
            if (e.button !== 0 && e.button !== 2) return;
            const tu = ensureTouchUpBuffer();
            if (!tu) return;
            touchUpPushUndo(tu);
            maskState.touchUpPainting = true;
            maskState.touchUpAlt = (e.button === 2);
            maskState.touchUpLastX = x;
            maskState.touchUpLastY = y;
            maskState.touchUpCursor = { x: x, y: y };
            touchUpStamp(tu, x, y);
            scheduleMaskRender();
            e.preventDefault();
            return;
        }

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
            scheduleMaskRender();
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

        if (colliderModeActive()) {
            if (!maskState.colliderPainting) { canvas.style.cursor = 'crosshair'; return; }
            // Interpolate along the drag so fast strokes stay continuous
            // (the mask stamp is per-dab, like the canvas brush).
            const lx = maskState.colliderLastX, ly = maskState.colliderLastY;
            const dist = Math.hypot(x - lx, y - ly);
            // Spacing ~1/4 of the stamp footprint, floored so a huge brush
            // still steps and a tiny one doesn't emit thousands of dabs.
            const step = Math.max(2, ((maskState.colliderSize || 11) / 1000) * canvas.width * 0.25);
            const n = Math.min(64, Math.floor(dist / step));
            for (let i = 1; i <= n; i++) {
                colliderStamp(lx + (x - lx) * (i / n), ly + (y - ly) * (i / n));
            }
            if (n > 0) { maskState.colliderLastX = x; maskState.colliderLastY = y; }
            else colliderStamp(x, y);
            scheduleColliderFilm();
            return;
        }

        if (touchUpActive()) {
            maskState.touchUpCursor = { x: x, y: y };
            if (!maskState.touchUpPainting) {
                canvas.style.cursor = 'none'; // the drawn ring IS the cursor
                scheduleMaskRender();
                return;
            }
            const tu = ensureTouchUpBuffer();
            if (tu) {
                // Interpolate along the drag so a fast stroke stays continuous
                const lx = maskState.touchUpLastX, ly = maskState.touchUpLastY;
                const dist = Math.hypot(x - lx, y - ly);
                const step = Math.max(1, touchUpRadius() * 0.3);
                const n = Math.min(256, Math.floor(dist / step));
                for (let i = 1; i <= n; i++) {
                    touchUpStamp(tu, lx + (x - lx) * (i / n), ly + (y - ly) * (i / n));
                }
                if (n > 0) { maskState.touchUpLastX = x; maskState.touchUpLastY = y; }
            }
            scheduleMaskRender();
            return;
        }

        if (maskState.isDragging && maskState.selectedShapeIndex !== null) {
            const dx = x - maskState.dragStartX;
            const dy = y - maskState.dragStartY;
            const shape = maskState.shapes[maskState.selectedShapeIndex];
            
            shape.x += dx;
            shape.y += dy;
            
            maskState.dragStartX = x;
            maskState.dragStartY = y;
            scheduleMaskRender();
        } else if (maskState.isResizing && maskState.selectedShapeIndex !== null) {
            const shape = maskState.shapes[maskState.selectedShapeIndex];
            const dx = x - maskState.dragStartX;
            const dy = y - maskState.dragStartY;

            resizeShape(shape, maskState.resizeHandle, dx, dy);
            
            maskState.dragStartX = x;
            maskState.dragStartY = y;
            scheduleMaskRender();
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
        if (maskState.touchUpPainting) {
            maskState.touchUpPainting = false;
            maskState.touchUpAlt = false;
            touchUpSyncButtons();
        }
        // Leaving the canvas takes the brush ring with it
        if (e && (e.type === 'pointerleave' || e.type === 'mouseleave')) {
            maskState.touchUpCursor = null;
            if (touchUpActive()) scheduleMaskRender();
        }
        if (maskState.colliderPainting) {
            maskState.colliderPainting = false;
            // Close the undo boundary so ↶ steps back one STROKE, not one dab
            if (typeof window.__sketchStrokeEnd === 'function') window.__sketchStrokeEnd();
            scheduleColliderFilm();
        }
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
        // 'collider-' rides the same path: a moved/scaled collision layer
        // must map editor strokes back through its transform, exactly like
        // an image layer's shapes.
        let idx = null;
        if (typeof id === 'string') {
            if (id.startsWith('image-')) idx = parseInt(id.slice(6), 10);
            else if (id.startsWith('collider-')) idx = parseInt(id.slice(9), 10);
        }
        if (idx === null || isNaN(idx)) return null;
        const layer = (window.layers || []).find(l => l.index === idx);
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
    // ── Editor paint scheduling ───────────────────────────────────────────
    // The editor redraws from mouse moves (hover ring, drags, pans, zoom),
    // which fire far above frame rate. Coalescing to one paint per frame is
    // the difference between a steady image and a canvas that visibly churns.
    let _maskRenderPending = false;
    function scheduleMaskRender() {
        if (_maskRenderPending) return;
        _maskRenderPending = true;
        requestAnimationFrame(function () {
            _maskRenderPending = false;
            renderMaskEditor();
        });
    }

    // Background decoded once per source. Returns null while a new source is
    // still decoding (the load re-renders itself); callers draw the rest of
    // the frame regardless, so nothing blanks waiting on it.
    let _bgCache = { src: null, img: null, ready: false };
    function maskBackgroundImage(src) {
        if (_bgCache.src === src) return _bgCache.ready ? _bgCache.img : null;
        const img = new Image();
        _bgCache = { src: src, img: img, ready: false };
        img.onload = function () {
            if (_bgCache.img !== img) return; // a later source superseded this one
            _bgCache.ready = true;
            scheduleMaskRender();
        };
        img.onerror = function () {
            if (_bgCache.img === img) _bgCache = { src: null, img: null, ready: false };
        };
        img.src = src;
        // A cached data: URL is often already decodable by the time we get here
        if (img.complete && img.naturalWidth) { _bgCache.ready = true; return img; }
        return null;
    }

    function renderMaskEditor() {
        const canvas = document.getElementById('maskEditorCanvas');
        if (!canvas) return;

        // Size canvas to match display canvas — except in adhoc mode (brush
        // shapes), where the editor works in the IMAGE's own space so nothing
        // is aspect-stretched and the applied result is WYSIWYG.
        // ONLY on a real change: assigning canvas.width resets the whole
        // drawing buffer even when the value is identical, so doing it every
        // render wiped the canvas ~100×/second while the mouse moved.
        const displayCanvas = document.getElementById('canvas');
        let wantW = 0, wantH = 0;
        if (maskState.activeMaskLayerId === 'adhoc' && maskState.adhocSource) {
            wantW = maskState.adhocSource.width;
            wantH = maskState.adhocSource.height;
        } else if (displayCanvas) {
            wantW = displayCanvas.width;
            wantH = displayCanvas.height;
        }
        if (wantW && canvas.width !== wantW) canvas.width = wantW;
        if (wantH && canvas.height !== wantH) canvas.height = wantH;

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
        if (colliderModeActive()) {
            // Collider editing: the artwork underneath (so walls can be
            // placed against what's actually on the canvas), dimmed, with
            // the collider's own coverage as a red film on top — the same
            // reading as the on-canvas film while painting colliders.
            if (displayCanvas) {
                drawWithTransform(() => {
                    ctx.drawImage(displayCanvas, 0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                });
            }
            if (maskState.colliderFilmTinted) {
                drawWithTransform(() => {
                    ctx.globalAlpha = 0.72;
                    ctx.drawImage(maskState.colliderFilmTinted, 0, 0, canvas.width, canvas.height);
                    ctx.globalAlpha = 1;
                });
            }
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
                // Decoded ONCE per source (see maskBackgroundImage): this used
                // to build a fresh Image() per call and draw from its async
                // onload, so every mouse move left the canvas blank until the
                // decode landed — a flash per move once hovering started
                // redrawing for the brush ring.
                const img = maskBackgroundImage(imgSrc);
                if (img) {
                    drawWithTransform(() => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        // Add semi-transparent overlay to make shapes more visible
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    });
                }
                // Fall through either way — the mask overlay draws now, and the
                // first decode re-renders itself when it arrives.
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

        // Wizard steps 2 and 3 draw the mask as COVERAGE (a pixel film), not
        // as movable shapes: step 2 because the brush owns the pixels, step 3
        // because the softened edge is the thing being judged.
        if (touchUpActive()) { drawTouchUpOverlay(ctx, canvas); return; }
        if (maskState.wizardActive && maskState.wizardStep === 3) { drawFeatherOverlay(ctx, canvas); return; }

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
        
        // Live filter coverage, over the shapes it will be baked alongside
        if (filterActive() && filterHasCut()) {
            drawFilterOverlay(ctx, canvas);
        }

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
                const v = shape.samMask[i];
                if (v > 0) {
                    nonZeroPixels++;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    // Soft masks (SAM's antialiased edge, and anything the
                    // touch-up brush made) carry 0-255 coverage — show it, or
                    // a feathered edge reads as a hard one back on step 1.
                    data[idx + 3] = shape.samSoft
                        ? Math.floor(a * v)
                        : Math.floor(a * 255);
                }
            }

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
    // while Instant Roto mode is engaged)
    function updateStampMenuDisplay() {
        const stampMenu = document.getElementById('stampMenu');
        const stampBtn = document.getElementById('stampMenuBtn');
        const open = maskState.stampMenuOpen && !maskState.smartSelectMode;
        if (stampMenu) stampMenu.style.display = open ? 'block' : 'none';
        if (stampBtn) {
            stampBtn.classList.toggle('open', open);
            // A tab stays put when another tool is active — it used to be
            // hidden outright while Instant Roto was engaged, which is fine for a
            // button and wrong for a tab strip (the row would reflow).
            stampBtn.style.display = '';
        }
        syncMaskToolTabs();
    }

    // Toggle the Stamps submenu (shape tools)
    window.toggleStampMenu = function() {
        maskState.stampMenuOpen = !maskState.stampMenuOpen;
        updateStampMenuDisplay();
    };

    // Toggle Instant Roto mode (AI segmentation)
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
                hintDiv.innerHTML = '<strong style="color: #3fb950;">🪄 Instant Roto:</strong> Left-click objects to include • Right-click to exclude • Shift+Click to pan';
            }

            // Hardness slider removed; SAM now uses a fixed default hardness
            // from window.samMaskSettings.
            
            // Initialize SAM if not ready
            if (typeof window.initializeSAM === 'function') {
                const statusEl = document.getElementById('samLoadingStatus');
                const segmentBtn = document.getElementById('samSegmentBtn');
                
                if (segmentBtn) segmentBtn.disabled = true;
                
                if (statusEl && !window.samSegmenter.isReady) {
                    statusEl.textContent = 'Preparing AI...';
                }
                
                await window.initializeSAM();
                
                // Check if initialization succeeded
                if (!window.samSegmenter.isReady) {
                    if (statusEl) statusEl.textContent = 'Failed to load';
                    smartSelectBtn.disabled = false; // Re-enable button
                    // Points placed while preparing will never segment now —
                    // drop them so they can't hold Apply in its busy state.
                    maskState.smartSelectPoints = [];
                    samSyncApplyBusy();
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
                        if (statusEl) statusEl.textContent = 'Capturing canvas...';
                        imageToLoad = canvas.toDataURL('image/png');
                        console.log('📸 Captured canvas for SAM:', canvas.width + 'x' + canvas.height);
                    }
                }
                
                if (imageToLoad && window.samSegmenter) {
                    if (statusEl) statusEl.textContent = 'Loading image...';

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
                        if (statusEl) statusEl.textContent = 'Ready to segment';
                        if (segmentBtn) {
                            segmentBtn.disabled = false;
                            segmentBtn.title = 'Click to run AI segmentation on selected points';
                        }
                        smartSelectBtn.disabled = false;
                        // Points placed while the model/image was preparing
                        // scheduled no inference (the click debounce requires
                        // isReady) — run them now, so the busy Apply state
                        // self-resolves into a preview instead of showing
                        // '⏳ Cutting out…' forever with nothing running.
                        if (maskState.smartSelectPoints.length) {
                            autoRunSAMSegmentation();
                        }
                    } else {
                        if (statusEl) statusEl.textContent = 'Image load failed';
                        smartSelectBtn.disabled = false;
                        // Nothing will ever segment these points — stand down.
                        maskState.smartSelectPoints = [];
                        samSyncApplyBusy();
                    }
                } else {
                    smartSelectBtn.disabled = false;
                    // No image to segment against — placed points are inert.
                    maskState.smartSelectPoints = [];
                    samSyncApplyBusy();
                }
            }
        } else {
            smartSelectBtn.classList.remove('engaged');
            smartControls.style.display = 'none';
            maskState.smartSelectPoints = [];
            // Leaving Instant Roto must stand the busy machinery down too: a
            // pending debounce would fire into autoRun's zero-points early
            // return (before its resync), and stale busy state would keep
            // the Apply button disabled while the user draws manual shapes.
            // The preview (if one landed) is kept — Apply still converts it,
            // same as before.
            if (maskState.samDebounceTimer) {
                clearTimeout(maskState.samDebounceTimer);
                maskState.samDebounceTimer = null;
            }
            samSyncApplyBusy();
            updateStampMenuDisplay();

            if (maskState.wizardActive) {
                wizardHint(); // back to the step's own guidance
            } else if (hintDiv) {
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

    // Instant Roto is a slow async chain: first-use model download → image
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
        const busy = samCutoutPending();
        const btn = document.querySelector('.mask-apply-btn');
        if (btn) {
            btn.disabled = busy;
            btn.textContent = busy ? 'Cutting out…' : 'Apply Mask';
        }
        // Leaving step 1 finalizes the cutout, so Next waits on it too
        const next = document.getElementById('maskWizardNext');
        if (next) {
            next.disabled = busy;
            next.textContent = busy ? 'Cutting out…' : 'Next →';
        }
    }

    // Fully stand down this session's Instant Roto state — points, preview,
    // candidates, pending debounce — and resync the Apply button. Every
    // editor exit path must call this: maskState and the overlay both
    // persist across editor sessions, so a cancelled session's leftover
    // points would otherwise hold a LATER session's Apply button in its
    // busy state (samCutoutPending's points-without-preview clause).
    function resetSamSessionState() {
        maskState.smartSelectPoints = [];
        maskState.samPreviewMask = null;
        maskState.samCandidates = [];
        maskState.samSelectedCandidateIndex = 0;
        if (maskState.samDebounceTimer) {
            clearTimeout(maskState.samDebounceTimer);
            maskState.samDebounceTimer = null;
        }
        samSyncApplyBusy();
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
                scheduleMaskRender();
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
            
            // Auto-disable Instant Roto mode so user can immediately transform the shape
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

    // ══ Mask wizard (2026-08-18) ══════════════════════════════════════════
    // The editor used to be one wall of controls with no order to it, and the
    // two steps that matter most were missing or elsewhere: there was nowhere
    // to clean up the strays Instant Roto leaves behind, and softening the edge
    // meant knowing to go back and drag the layer's Feather slider BEFORE
    // generating a collider. Now it runs as three steps:
    //   1 Select      — Instant Roto / stamps (unchanged tools)
    //   2 Touch up    — brush the coverage: erase strays, add what was missed
    //   3 Soften      — feather with a live preview, then Apply (and, for an
    //                   image layer, hand straight off to a collider)
    // Steps 2 and 3 work on rasterized COVERAGE rather than shapes, using
    // 05m's canonical `_drawMaskShape` / `_featherMaskAlpha`, so what the
    // editor shows is what Apply stores and what the collider bakes.

    const TOUCHUP_HISTORY = 6; // full-canvas snapshots — deep enough to fix a slip

    const STEP_HINTS = {
        1: '<strong style="color:#58a6ff;">Step 1 — Select:</strong> 🪄 Instant Roto clicks an object out for you, or stamp shapes by hand • Scroll to zoom • Middle-click to pan',
        2: '<strong style="color:#3fb950;">Step 2 — Touch up:</strong> Erase the strays, add anything missed • Right-drag = the other tool • Shift+drag pans',
        3: '<strong style="color:#d2a8ff;">Step 3 — Soften &amp; finish:</strong> Blue shows what the mask covers • Set the edge softness, then Apply'
    };

    function wizardKind() {
        const id = maskState.activeMaskLayerId;
        if (!id) return 'none';
        if (id === 'adhoc') return 'adhoc';
        if (String(id).indexOf('collider-') === 0) return 'collider';
        if (String(id).indexOf('image-') === 0) return 'image';
        return 'recording';
    }

    // Feather is stored per consumer: image layers keep it LIVE on
    // layer.threshold (the panel slider, applyLayerMask and the collider bake
    // all already read it), adhoc brush shapes bake it into the stamp.
    // Recorded-layer masks are hard-tested per point (checkMaskPoint), so a
    // soft edge there would be a promise the renderer doesn't keep.
    function wizardSupportsFeather() {
        const k = wizardKind();
        return k === 'image' || k === 'adhoc';
    }

    function wizardLayerIndex() {
        if (wizardKind() !== 'image') return -1;
        return parseInt(String(maskState.activeMaskLayerId).replace('image-', ''), 10);
    }

    function wizardLayer() {
        const idx = wizardLayerIndex();
        if (idx < 0) return null;
        return (window.layers || []).find(l => l.index === idx) || null;
    }

    // The space shapes and coverage live in — the same one renderMaskEditor
    // sizes the editor canvas to.
    function maskExtent() {
        if (maskState.activeMaskLayerId === 'adhoc' && maskState.adhocSource) {
            return { w: maskState.adhocSource.width, h: maskState.adhocSource.height };
        }
        const c = document.getElementById('canvas');
        return { w: (c && c.width) || 1920, h: (c && c.height) || 1080 };
    }

    // Rasterize the current shapes as white coverage through the CANONICAL
    // renderer, with the same rotation wrap applyLayerMask uses.
    function rasterizeShapes(cx) {
        if (!maskState.shapes.length || typeof window._drawMaskShape !== 'function') return;
        maskState.shapes.forEach(function (s) {
            const rot = s.rotation || 0;
            if (rot) {
                cx.save();
                const ccx = s.x + s.width / 2, ccy = s.y + s.height / 2;
                cx.translate(ccx, ccy);
                cx.rotate((rot * Math.PI) / 180);
                cx.translate(-ccx, -ccy);
            }
            cx.fillStyle = '#fff';
            try { window._drawMaskShape(cx, s); } catch (_) {}
            if (rot) cx.restore();
        });
    }

    // ── Step 1 · Filter: key a flat background out in one pass ────────────
    // This is the layer panel's "Mask" slider (05m applyRudimentaryMask)
    // brought into the flow, with the control it was always missing: that
    // slider keys against BLACK, so it only ever worked on black backdrops.
    // Here the background is a COLOUR you pick, and the key is the luminance
    // of the per-channel difference from it — which reduces to exactly the
    // old luminance cut when the background is black, so the behaviour people
    // already rely on is unchanged. The edge cut reuses the same fwidth-style
    // adaptive band as applyRudimentaryMask and the depth/collider paths, so
    // a filtered edge lands where every other edge in the app lands.

    function filterActive() {
        return !!(maskState.wizardActive && maskState.wizardStep === 1 && maskState.filterMode);
    }

    function filterHasCut() {
        return !!(maskState.filterThreshold > 0);
    }

    // The image the filter keys against, in whatever form is already decoded:
    // image layers reuse the editor's cached backdrop, adhoc its own decoded
    // source, recorded layers the live artwork.
    function filterSourceElement() {
        const id = maskState.activeMaskLayerId;
        if (id === 'adhoc' && maskState.adhocSource) return maskState.adhocSource.image;
        if (typeof id === 'string' && id.indexOf('image-') === 0) {
            const idx = parseInt(id.slice(6), 10);
            const layer = (window.layers || []).find(l => l.index === idx);
            const src = layer ? (layer.originalData || layer.data) : null;
            return src ? maskBackgroundImage(src) : null; // null while decoding
        }
        return document.getElementById('canvas');
    }

    // Sample the source STRETCHED to stored space — the same mapping
    // applyLayerMask bakes with, so coverage lines up with every shape.
    function filterPixels(w, h) {
        const el = filterSourceElement();
        if (!el) return null;
        try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.drawImage(el, 0, 0, w, h);
            return cx.getImageData(0, 0, w, h);
        } catch (_) { return null; }
    }

    function computeFilterCoverage(w, h) {
        const img = filterPixels(w, h);
        if (!img) return null;
        const data = img.data;
        const n = w * h;
        const bg = maskState.filterBg || { r: 0, g: 0, b: 0 };
        const key = new Uint8ClampedArray(n);
        for (let i = 0, j = 0; i < n; i++, j += 4) {
            key[i] = 0.299 * Math.abs(data[j] - bg.r)
                   + 0.587 * Math.abs(data[j + 1] - bg.g)
                   + 0.114 * Math.abs(data[j + 2] - bg.b);
        }
        const thresholdValue = Math.round((maskState.filterThreshold / 100) * 255);
        let bandCap = (window.config && typeof window.config.DEPTH_EDGE_BAND === 'number')
            ? window.config.DEPTH_EDGE_BAND : 12;
        if (bandCap < 0.5) bandCap = 0.5;
        bandCap = Math.min(bandCap * 8, 127); // preview cap, as in 05m
        const invert = !!maskState.filterInvert;
        const out = new Uint8ClampedArray(n);
        for (let i = 0; i < n; i++) {
            const xI = i - ((i / w) | 0) * w;
            const gx = Math.abs(key[i + (xI < w - 1 ? 1 : 0)] - key[i - (xI > 0 ? 1 : 0)]) * 0.5;
            const gy = Math.abs(key[i + (i < n - w ? w : 0)] - key[i - (i >= w ? w : 0)]) * 0.5;
            let band = (gx > gy ? gx : gy) * 0.75;
            if (band < 0.5) band = 0.5;
            if (band > bandCap) band = bandCap;
            let t = (key[i] - (thresholdValue - band)) / (band * 2);
            if (t < 0) t = 0; else if (t > 1) t = 1;
            let cov = t * t * (3 - 2 * t);
            if (invert) cov = 1 - cov;
            // Transparent source pixels can never become subject
            out[i] = (cov * data[i * 4 + 3] + 0.5) | 0;
        }
        return { data: out, w: w, h: h };
    }

    // Guess the backdrop from the border ring: the MODE of coarsely quantized
    // edge pixels, not their mean — a mean of "sky at the top, grass at the
    // bottom" is a colour that appears nowhere in the image.
    function autoPickFilterBackground() {
        const el = filterSourceElement();
        if (!el) return false;
        const S = 64;
        let d;
        try {
            const c = document.createElement('canvas');
            c.width = S; c.height = S;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.drawImage(el, 0, 0, S, S);
            d = cx.getImageData(0, 0, S, S).data;
        } catch (_) { return false; }
        const buckets = new Map();
        const push = (x, y) => {
            const j = (y * S + x) * 4;
            if (d[j + 3] < 8) return; // fully transparent border = nothing to key
            const k = ((d[j] >> 3) << 10) | ((d[j + 1] >> 3) << 5) | (d[j + 2] >> 3);
            const b = buckets.get(k);
            if (b) { b.r += d[j]; b.g += d[j + 1]; b.b += d[j + 2]; b.n++; }
            else buckets.set(k, { r: d[j], g: d[j + 1], b: d[j + 2], n: 1 });
        };
        for (let x = 0; x < S; x++) { push(x, 0); push(x, S - 1); }
        for (let y = 1; y < S - 1; y++) { push(0, y); push(S - 1, y); }
        let best = null;
        buckets.forEach(function (b) { if (!best || b.n > best.n) best = b; });
        if (!best) return false;
        maskState.filterBg = {
            r: Math.round(best.r / best.n),
            g: Math.round(best.g / best.n),
            b: Math.round(best.b / best.n)
        };
        return true;
    }

    // One source pixel, for the eyedropper
    function sampleFilterColorAt(x, y) {
        const el = filterSourceElement();
        if (!el) return null;
        const sw = el.naturalWidth || el.width || 0;
        const sh = el.naturalHeight || el.height || 0;
        if (!sw || !sh) return null;
        const ext = maskExtent();
        const sx = Math.max(0, Math.min(sw - 1, Math.round((x / ext.w) * sw)));
        const sy = Math.max(0, Math.min(sh - 1, Math.round((y / ext.h) * sh)));
        try {
            const c = document.createElement('canvas');
            c.width = 1; c.height = 1;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.drawImage(el, sx, sy, 1, 1, 0, 0, 1, 1);
            const d = cx.getImageData(0, 0, 1, 1).data;
            return { r: d[0], g: d[1], b: d[2] };
        } catch (_) { return null; }
    }

    function filterHex() {
        const bg = maskState.filterBg || { r: 0, g: 0, b: 0 };
        const h = (v) => ('0' + Math.max(0, Math.min(255, v | 0)).toString(16)).slice(-2);
        return '#' + h(bg.r) + h(bg.g) + h(bg.b);
    }

    function filterSyncControls() {
        const sw = document.getElementById('filterBgColor');
        if (sw) sw.value = filterHex();
        const sl = document.getElementById('filterThreshold');
        if (sl) setRangeValue(sl, maskState.filterThreshold);
        const val = document.getElementById('filterThresholdValue');
        if (val) val.textContent = maskState.filterThreshold + '%';
        const inv = document.getElementById('filterInvert');
        if (inv) inv.checked = !!maskState.filterInvert;
        const pick = document.getElementById('filterPickBtn');
        if (pick) pick.classList.toggle('active', !!maskState.filterPicking);
    }

    function invalidateFilterPreview() { maskState.filterPrev = null; }

    // Tinted coverage film, cached on everything that changes it
    function filterPreviewCanvas() {
        const ext = maskExtent();
        const scale = Math.min(1, 900 / Math.max(ext.w, ext.h));
        const w = Math.max(1, Math.round(ext.w * scale));
        const h = Math.max(1, Math.round(ext.h * scale));
        const bg = maskState.filterBg || { r: 0, g: 0, b: 0 };
        const sig = [w, h, bg.r, bg.g, bg.b, maskState.filterThreshold, maskState.filterInvert ? 1 : 0,
            maskState.maskMode].join(':');
        if (maskState.filterPrev && maskState.filterPrev.sig === sig) return maskState.filterPrev.canvas;
        const cov = computeFilterCoverage(w, h);
        if (!cov) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        const img = cx.createImageData(w, h);
        const px = img.data;
        const keep = maskState.maskMode === 'show';
        const cr = keep ? 100 : 255, cg = keep ? 200 : 120, cb = keep ? 255 : 120;
        for (let i = 0; i < cov.data.length; i++) {
            const a = cov.data[i];
            if (!a) continue;
            const j = i * 4;
            px[j] = cr; px[j + 1] = cg; px[j + 2] = cb; px[j + 3] = a;
        }
        cx.putImageData(img, 0, 0);
        maskState.filterPrev = { sig: sig, canvas: c };
        return c;
    }

    function drawFilterOverlay(ctx, canvas) {
        let prev = null;
        try { prev = filterPreviewCanvas(); } catch (_) { return; }
        if (!prev) return;
        const ext = maskExtent();
        ctx.save();
        ctx.translate(maskState.panX, maskState.panY);
        ctx.scale(maskState.zoom, maskState.zoom);
        applyLayerView(ctx, canvas);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(prev, 0, 0, ext.w, ext.h);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Bake the live filter into a real shape so steps 2 and 3 (and every
    // existing save/apply/collider path) treat it like any other selection.
    function applyFilterToShapes() {
        dropFilterShape();
        if (!filterHasCut()) return;
        const ext = maskExtent();
        const cov = computeFilterCoverage(ext.w, ext.h);
        if (!cov) return;
        const w = cov.w, h = cov.h, d = cov.data;
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                if (d[row + x] > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return; // cut everything away — nothing to add
        const bw = maxX - minX + 1, bh = maxY - minY + 1;
        const out = new Uint8Array(bw * bh);
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                out[y * bw + x] = d[(minY + y) * w + (minX + x)];
            }
        }
        const shape = {
            type: 'sam-mask',
            x: minX, y: minY, width: bw, height: bh, rotation: 0,
            samMask: out, samMaskWidth: bw, samMaskHeight: bh,
            samSoft: true
        };
        maskState.shapes.push(shape);
        maskState.filterShape = shape;
        updateMaskEditorTitle();
    }

    // Pull a previously baked filter shape back out, so re-opening the tab
    // edits the same selection instead of stacking a second copy on it.
    function dropFilterShape() {
        const s = maskState.filterShape;
        maskState.filterShape = null;
        if (!s) return;
        const i = maskState.shapes.indexOf(s);
        if (i < 0) return; // already flattened by a touch-up — leave it baked
        maskState.shapes.splice(i, 1);
        if (maskState.selectedShapeIndex === i) maskState.selectedShapeIndex = null;
        updateMaskEditorTitle();
    }

    function setFilterMode(on) {
        if (on === maskState.filterMode) return;
        maskState.filterMode = !!on;
        maskState.filterPicking = false;
        if (maskState.filterMode) {
            dropFilterShape();                 // go live on the same selection
            if (!maskState.filterBgPicked) {   // first open: guess the backdrop
                if (autoPickFilterBackground()) maskState.filterBgPicked = true;
            }
            invalidateFilterPreview();
            filterSyncControls();
        } else {
            applyFilterToShapes();
            invalidateFilterPreview();
        }
    }

    // ── Step 1 tool tabs ──────────────────────────────────────────────────
    function currentMaskTool() {
        if (maskState.smartSelectMode) return 'magic';
        if (maskState.filterMode) return 'filter';
        if (maskState.stampMenuOpen) return 'stamps';
        return 'none';
    }

    // Clicking the open tab closes it — with no tool selected the canvas is
    // just shapes to drag, which is a state worth being able to get back to.
    window.setMaskTool = function (tool) {
        const next = (currentMaskTool() === tool) ? 'none' : tool;
        // Stand the outgoing tool down first (Instant Roto owns async model
        // loading, so it goes through its own toggle either way).
        if (next !== 'magic' && maskState.smartSelectMode) {
            try { window.toggleSmartSelect(); } catch (_) {}
        }
        if (next !== 'filter' && maskState.filterMode) setFilterMode(false);
        maskState.stampMenuOpen = (next === 'stamps');
        if (next === 'filter') setFilterMode(true);
        if (next === 'magic' && !maskState.smartSelectMode) {
            try { window.toggleSmartSelect(); } catch (_) {}
        }
        updateStampMenuDisplay();
        syncMaskToolTabs();
        scheduleMaskRender();
    };

    function syncMaskToolTabs() {
        const overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) return;
        const tool = currentMaskTool();
        overlay.querySelectorAll('.mask-tool-tab').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tool') === tool);
        });
        const panel = overlay.querySelector('#filterPanel');
        if (panel) panel.style.display = (tool === 'filter' && maskState.wizardStep === 1) ? '' : 'none';
        if (tool === 'filter') filterSyncControls();
    }

    // ── Step 2: touch-up brush ────────────────────────────────────────────

    function touchUpActive() {
        return !!(maskState.wizardActive && maskState.wizardStep === 2);
    }

    function touchUpRadius() {
        // Same units as the collider brush (slider ÷ 1000 × width) so the two
        // brushes in this editor feel like one brush.
        const ext = maskExtent();
        return Math.max(2, (maskState.touchUpSize / 1000) * ext.w);
    }

    function ensureTouchUpBuffer() {
        if (maskState.touchUp) return maskState.touchUp;
        const ext = maskExtent();
        let c, cx;
        try {
            c = document.createElement('canvas');
            c.width = ext.w; c.height = ext.h;
            cx = c.getContext('2d', { willReadFrequently: true });
            if (!cx) return null;
        } catch (_) { return null; }
        rasterizeShapes(cx);
        maskState.touchUp = {
            canvas: c, ctx: cx, w: ext.w, h: ext.h,
            dirty: false, undo: [], redo: [], tint: null
        };
        return maskState.touchUp;
    }

    function touchUpStamp(tu, x, y) {
        const r = touchUpRadius();
        // Right-drag inverts the tool
        const erase = ((maskState.touchUpTool === 'erase') !== !!maskState.touchUpAlt);
        const g = tu.ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        tu.ctx.save();
        tu.ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
        tu.ctx.fillStyle = g;
        tu.ctx.beginPath();
        tu.ctx.arc(x, y, r, 0, Math.PI * 2);
        tu.ctx.fill();
        tu.ctx.restore();
        tu.dirty = true;
        tu.tint = null;
    }

    function touchUpSnapshot(tu) {
        const s = document.createElement('canvas');
        s.width = tu.w; s.height = tu.h;
        s.getContext('2d').drawImage(tu.canvas, 0, 0);
        return s;
    }

    function touchUpPushUndo(tu) {
        try {
            tu.undo.push(touchUpSnapshot(tu));
            if (tu.undo.length > TOUCHUP_HISTORY) tu.undo.shift();
            tu.redo.length = 0;
        } catch (_) {}
        touchUpSyncButtons();
    }

    function touchUpHistory(dir) {
        const tu = maskState.touchUp;
        if (!tu) return;
        const from = dir === 'undo' ? tu.undo : tu.redo;
        const to = dir === 'undo' ? tu.redo : tu.undo;
        const snap = from.pop();
        if (!snap) return;
        try {
            to.push(touchUpSnapshot(tu));
            tu.ctx.save();
            tu.ctx.setTransform(1, 0, 0, 1, 0, 0);
            tu.ctx.globalCompositeOperation = 'copy';
            tu.ctx.drawImage(snap, 0, 0);
            tu.ctx.restore();
        } catch (_) {}
        // Undone all the way back to the rasterized original = nothing was
        // touched up, so the shapes stay editable instead of being flattened.
        if (dir === 'undo' && !tu.undo.length) tu.dirty = false;
        else tu.dirty = true;
        tu.tint = null;
        touchUpSyncButtons();
        renderMaskEditor();
    }

    function touchUpSyncButtons() {
        const tu = maskState.touchUp;
        const u = document.getElementById('touchUpUndoBtn');
        const r = document.getElementById('touchUpRedoBtn');
        if (u) u.disabled = !(tu && tu.undo.length);
        if (r) r.disabled = !(tu && tu.redo.length);
    }

    function setStepHint(html, revertMs) {
        const el = document.getElementById('maskHint');
        if (!el) return;
        el.innerHTML = html;
        if (revertMs) setTimeout(function () {
            if (maskState.wizardActive) wizardHint();
        }, revertMs);
    }

    function wizardHint() {
        if (!maskState.wizardActive) return;
        setStepHint(STEP_HINTS[maskState.wizardStep] || STEP_HINTS[1]);
    }

    // One-click strays killer: label the connected components of the coverage
    // and drop every island smaller than a twentieth of the biggest one. This
    // is the single most common Instant Roto cleanup ("it grabbed the object AND
    // three specks of background"), and it is undoable like any stroke.
    function removeMaskSpecks() {
        const tu = ensureTouchUpBuffer();
        if (!tu) return;
        let img;
        try { img = tu.ctx.getImageData(0, 0, tu.w, tu.h); } catch (_) { return; }
        const d = img.data, w = tu.w, h = tu.h, n = w * h;
        // Any non-zero coverage counts as part of an island, antialiased
        // fringe included. Labelling from a higher floor left every speck's
        // 1-8 alpha halo unowned, so removing the speck left an invisible
        // ghost behind — and clearing those unowned pixels instead ate the
        // same near-zero ring off the shape being KEPT.
        const ON = 0;
        const label = new Int32Array(n).fill(-1);
        const stack = new Int32Array(n);
        const areas = [];
        for (let i = 0; i < n; i++) {
            if (label[i] !== -1 || d[i * 4 + 3] <= ON) continue;
            const id = areas.length;
            let area = 0, sp = 0;
            stack[sp++] = i; label[i] = id;
            while (sp > 0) {
                const p = stack[--sp];
                area++;
                const px = p % w;
                let q;
                if (px > 0)      { q = p - 1; if (label[q] === -1 && d[q * 4 + 3] > ON) { label[q] = id; stack[sp++] = q; } }
                if (px < w - 1)  { q = p + 1; if (label[q] === -1 && d[q * 4 + 3] > ON) { label[q] = id; stack[sp++] = q; } }
                if (p >= w)      { q = p - w; if (label[q] === -1 && d[q * 4 + 3] > ON) { label[q] = id; stack[sp++] = q; } }
                if (p < n - w)   { q = p + w; if (label[q] === -1 && d[q * 4 + 3] > ON) { label[q] = id; stack[sp++] = q; } }
            }
            areas.push(area);
        }
        if (areas.length <= 1) {
            setStepHint('<strong style="color:#8b949e;">Nothing to remove</strong> — the mask is already a single piece.', 2600);
            return;
        }
        let max = 0;
        for (let i = 0; i < areas.length; i++) if (areas[i] > max) max = areas[i];
        const cut = Math.max(16, max * 0.05);
        let removed = 0;
        for (let i = 0; i < areas.length; i++) if (areas[i] < cut) removed++;
        if (!removed) {
            setStepHint('<strong style="color:#8b949e;">Nothing to remove</strong> — every piece is big enough to look deliberate. Erase by hand if you want one gone.', 3200);
            return;
        }
        touchUpPushUndo(tu);
        // Keep only the islands that survived the cut; everything else goes,
        // fringe and all (unlabelled pixels are already fully transparent).
        for (let i = 0; i < n; i++) {
            const id = label[i];
            if (!(id >= 0 && areas[id] >= cut)) d[i * 4 + 3] = 0;
        }
        tu.ctx.putImageData(img, 0, 0);
        tu.dirty = true;
        tu.tint = null;
        renderMaskEditor();
        setStepHint('<strong style="color:#3fb950;">Removed ' + removed + ' stray ' +
            (removed === 1 ? 'speck' : 'specks') + '</strong> — ↶ puts them back.', 3200);
    }

    // Fold the brushed coverage back into maskState.shapes (one soft
    // sam-mask, cropped to what is actually painted) so every existing save /
    // apply / collider path keeps working unchanged.
    function commitTouchUp() {
        const tu = maskState.touchUp;
        if (!tu) return;
        maskState.touchUp = null;
        maskState.touchUpPainting = false;
        maskState.touchUpCursor = null;
        if (!tu.dirty) return; // never painted — leave the shapes editable
        let img;
        try { img = tu.ctx.getImageData(0, 0, tu.w, tu.h); } catch (_) { return; }
        const d = img.data, w = tu.w, h = tu.h;
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                if (d[(row + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) { // erased to nothing
            maskState.shapes = [];
            maskState.selectedShapeIndex = null;
            updateMaskEditorTitle();
            return;
        }
        const bw = maxX - minX + 1, bh = maxY - minY + 1;
        const out = new Uint8Array(bw * bh);
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                out[y * bw + x] = d[((minY + y) * w + (minX + x)) * 4 + 3];
            }
        }
        maskState.shapes = [{
            type: 'sam-mask',
            x: minX, y: minY, width: bw, height: bh, rotation: 0,
            samMask: out, samMaskWidth: bw, samMaskHeight: bh,
            samSoft: true // brushed edges carry 0-255 coverage
        }];
        maskState.selectedShapeIndex = null;
        invalidateFeatherPreview();
        updateMaskEditorTitle();
    }

    function discardTouchUp() {
        maskState.touchUp = null;
        maskState.touchUpPainting = false;
        maskState.touchUpCursor = null;
    }

    function touchUpTintCanvas(tu) {
        if (tu.tint) return tu.tint;
        const c = document.createElement('canvas');
        c.width = tu.w; c.height = tu.h;
        const cx = c.getContext('2d');
        cx.drawImage(tu.canvas, 0, 0);
        cx.globalCompositeOperation = 'source-in';
        cx.fillStyle = maskState.maskMode === 'show' ? 'rgb(100,200,255)' : 'rgb(255,120,120)';
        cx.fillRect(0, 0, tu.w, tu.h);
        tu.tint = c;
        return c;
    }

    function drawTouchUpOverlay(ctx, canvas) {
        const tu = ensureTouchUpBuffer();
        if (!tu) return;
        ctx.save();
        ctx.translate(maskState.panX, maskState.panY);
        ctx.scale(maskState.zoom, maskState.zoom);
        applyLayerView(ctx, canvas);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(touchUpTintCanvas(tu), 0, 0, tu.w, tu.h);
        ctx.globalAlpha = 1;
        // Brush ring — drawn in STORED space on purpose: where the layer view
        // squashes an axis the dab is an ellipse too, so the ring is honest.
        const cur = maskState.touchUpCursor;
        if (cur) {
            const vs = layerViewScale(canvas);
            const vsMean = (vs.sx + vs.sy) / 2;
            const erase = ((maskState.touchUpTool === 'erase') !== !!maskState.touchUpAlt);
            ctx.beginPath();
            ctx.arc(cur.x, cur.y, touchUpRadius(), 0, Math.PI * 2);
            ctx.strokeStyle = erase ? 'rgba(248,81,73,0.95)' : 'rgba(63,185,80,0.95)';
            ctx.lineWidth = 2 / (maskState.zoom * vsMean);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Step 3: feather preview ───────────────────────────────────────────

    function invalidateFeatherPreview() {
        maskState.featherBase = null;
        maskState.featherPrev = null;
    }

    // Coverage at preview resolution. The blur is the real box blur the save
    // path runs, so the preview matches the result instead of approximating
    // it; capping the long side keeps a slider drag interactive.
    function ensureFeatherBase() {
        if (maskState.featherBase) return maskState.featherBase;
        const ext = maskExtent();
        const scale = Math.min(1, 900 / Math.max(ext.w, ext.h));
        const w = Math.max(1, Math.round(ext.w * scale));
        const h = Math.max(1, Math.round(ext.h * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.scale(scale, scale);
        rasterizeShapes(cx);
        cx.setTransform(1, 0, 0, 1, 0, 0);
        maskState.featherBase = { canvas: c, w: w, h: h, scale: scale };
        return maskState.featherBase;
    }

    function featherPreviewCanvas() {
        const f = maskState.feather | 0;
        if (maskState.featherPrev && maskState.featherPrev.f === f) return maskState.featherPrev.canvas;
        const base = ensureFeatherBase();
        const c = document.createElement('canvas');
        c.width = base.w; c.height = base.h;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(base.canvas, 0, 0);
        if (f > 0 && typeof window._featherMaskAlpha === 'function') {
            // Same radius law as applyLayerMask (05m) and _collisionFromShapes
            // (23), carried to preview scale.
            const r = Math.max(1, Math.round((f / 100) * 20 * base.scale));
            try { window._featherMaskAlpha(cx, base.w, base.h, r); } catch (_) {}
        }
        cx.globalCompositeOperation = 'source-in';
        cx.fillStyle = maskState.maskMode === 'show' ? 'rgb(100,200,255)' : 'rgb(255,120,120)';
        cx.fillRect(0, 0, base.w, base.h);
        maskState.featherPrev = { f: f, canvas: c };
        return c;
    }

    function drawFeatherOverlay(ctx, canvas) {
        const ext = maskExtent();
        let prev = null;
        try { prev = featherPreviewCanvas(); } catch (_) { return; }
        if (!prev) return;
        ctx.save();
        ctx.translate(maskState.panX, maskState.panY);
        ctx.scale(maskState.zoom, maskState.zoom);
        applyLayerView(ctx, canvas);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(prev, 0, 0, ext.w, ext.h);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ── Step machinery ────────────────────────────────────────────────────

    function wizardGoTo(step) {
        if (!maskState.wizardActive) return;
        step = Math.max(1, Math.min(3, parseInt(step, 10) || 1));
        const from = maskState.wizardStep;
        if (step === from) { wizardSyncUI(); return; }

        if (from === 1) {
            // A cutout still in flight would be dropped on the floor
            if (samCutoutPending()) {
                setStepHint('<strong style="color:#58a6ff;">⏳ Instant Roto is still cutting out your object</strong> — one moment.', 2600);
                return;
            }
            // Bake the live filter into a shape before anything downstream
            // reads maskState.shapes
            if (maskState.filterMode) setFilterMode(false);
            // Same nicety Apply has: a live preview the user never pressed
            // "Instant Roto It" on comes along instead of being lost.
            if (!maskState.shapes.length && maskState.samPreviewMask && typeof window.runSAMSegmentation === 'function') {
                window.runSAMSegmentation();
            }
            if (maskState.smartSelectMode && typeof window.toggleSmartSelect === 'function') {
                try { window.toggleSmartSelect(); } catch (_) {}
            }
            if (maskState.stampMenuOpen) {
                maskState.stampMenuOpen = false;
                updateStampMenuDisplay();
            }
            maskState.selectedShapeIndex = null;
        }
        if (from === 2) commitTouchUp();
        if (from === 3) invalidateFeatherPreview();

        maskState.wizardStep = step;

        if (step === 2) { ensureTouchUpBuffer(); touchUpSyncButtons(); }
        if (step === 3) invalidateFeatherPreview();

        wizardSyncUI();
        renderMaskEditor();
    }

    window.maskWizardNext = function () { wizardGoTo(maskState.wizardStep + 1); };
    window.maskWizardBack = function () { wizardGoTo(maskState.wizardStep - 1); };

    function wizardSetDisplay(overlay, sel, on) {
        const el = overlay.querySelector(sel);
        if (el) el.style.display = on ? '' : 'none';
    }

    function wizardSyncUI() {
        const overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) return;
        const active = maskState.wizardActive;
        const step = maskState.wizardStep;
        wizardSetDisplay(overlay, '#maskWizardRail', active);
        if (!active) return;

        const inStep1 = step === 1;
        wizardSetDisplay(overlay, '.mask-mode-toggle', inStep1);
        wizardSetDisplay(overlay, '.mask-tools-row', inStep1);
        wizardSetDisplay(overlay, '.mask-actions', inStep1);
        wizardSetDisplay(overlay, '#stampMenu', inStep1 && maskState.stampMenuOpen);
        wizardSetDisplay(overlay, '#smartSelectControls', inStep1 && maskState.smartSelectMode);
        wizardSetDisplay(overlay, '#filterPanel', inStep1 && maskState.filterMode);
        if (inStep1) syncMaskToolTabs();
        wizardSetDisplay(overlay, '#touchUpTools', step === 2);
        wizardSetDisplay(overlay, '#featherStep', step === 3);
        if (inStep1) updateRotationControl();
        else wizardSetDisplay(overlay, '#maskRotationControl', false);

        // Feather only exists where a consumer honours it
        const canFeather = wizardSupportsFeather();
        wizardSetDisplay(overlay, '.mask-feather-row', canFeather);
        const fHint = overlay.querySelector('#maskFeatherHint');
        if (fHint) {
            fHint.textContent = canFeather
                ? '0% is a hard cut-out. Raise it for a soft edge — this is the same Feather that lives on the layer, set here so you never have to go back for it.'
                : 'This mask is tested per point, so it has no soft edge to set. Check the shape below, then apply.';
        }

        // Collider hand-off: image layers that are not already colliders
        const layer = wizardLayer();
        const canCollide = !!(layer && !layer.isCollision && typeof window.collisionFromMask === 'function');
        wizardSetDisplay(overlay, '#maskColliderOpt', step === 3 && canCollide);
        const cb = overlay.querySelector('#maskMakeCollider');
        if (cb) cb.checked = !!maskState.makeCollider;

        overlay.querySelectorAll('.mask-wizard-step').forEach(function (b) {
            const s = parseInt(b.getAttribute('data-step'), 10);
            b.classList.toggle('active', s === step);
            b.classList.toggle('done', s < step);
        });

        const back = overlay.querySelector('#maskWizardBack');
        const next = overlay.querySelector('#maskWizardNext');
        const apply = overlay.querySelector('.mask-apply-btn');
        if (back) back.style.display = step > 1 ? '' : 'none';
        if (next) next.style.display = step < 3 ? '' : 'none';
        if (apply) apply.style.display = step === 3 ? '' : 'none';

        wizardHint();
        samSyncApplyBusy();
    }

    // Restore the pre-wizard chrome so a later collider session (or a plain
    // re-open) does not inherit whatever step the last one ended on.
    function wizardRestoreChrome() {
        const overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) return;
        wizardSetDisplay(overlay, '#maskWizardRail', false);
        wizardSetDisplay(overlay, '#touchUpTools', false);
        wizardSetDisplay(overlay, '#featherStep', false);
        wizardSetDisplay(overlay, '#filterPanel', false);
        wizardSetDisplay(overlay, '.mask-mode-toggle', true);
        wizardSetDisplay(overlay, '.mask-tools-row', true);
        wizardSetDisplay(overlay, '.mask-actions', true);
        const back = overlay.querySelector('#maskWizardBack');
        const next = overlay.querySelector('#maskWizardNext');
        const apply = overlay.querySelector('.mask-apply-btn');
        if (back) back.style.display = 'none';
        if (next) next.style.display = 'none';
        if (apply) apply.style.display = '';
    }

    // Open the editor at step 1 with the target's current feather loaded.
    function wizardBegin() {
        maskState.wizardActive = true;
        maskState.wizardStep = 1;
        maskState.makeCollider = false;
        discardTouchUp();
        invalidateFeatherPreview();
        // The filter keys against THIS target's image — nothing carries over
        maskState.filterMode = false;
        maskState.filterPicking = false;
        maskState.filterThreshold = 0;
        maskState.filterInvert = false;
        maskState.filterBg = { r: 0, g: 0, b: 0 };
        maskState.filterBgPicked = false;
        maskState.filterShape = null;
        invalidateFilterPreview();
        filterSyncControls();
        syncMaskToolTabs();

        const layer = wizardLayer();
        maskState.feather = (layer && typeof layer.threshold === 'number')
            ? Math.max(0, Math.min(100, layer.threshold | 0))
            : 0;

        const fs = document.getElementById('maskFeatherSlider');
        if (fs) setRangeValue(fs, maskState.feather);
        const fv = document.getElementById('maskFeatherValue');
        if (fv) fv.textContent = maskState.feather + '%';
        const ts = document.getElementById('touchUpSize');
        if (ts) setRangeValue(ts, maskState.touchUpSize);
        const tv = document.getElementById('touchUpSizeVal');
        if (tv) tv.textContent = String(maskState.touchUpSize);
        touchUpSyncButtons();
        wizardSyncUI();
    }

    function wizardEnd() {
        maskState.wizardActive = false;
        maskState.wizardStep = 1;
        maskState.makeCollider = false;
        discardTouchUp();
        invalidateFeatherPreview();
        maskState.filterMode = false;
        maskState.filterPicking = false;
        maskState.filterShape = null;
        invalidateFilterPreview();
        wizardRestoreChrome();
    }

    // ── Collider mask mode (2026-08-16) ───────────────────────────────
    // Editing a PAINTED collider used to open the shape-mask editor, which
    // masks the layer — a second, unrelated pass over a collider whose real
    // shape lives in a GPU mask buffer. This mode edits that buffer itself:
    // draw/erase strokes land in the collider's mask, so the obstacle, the
    // panel thumbnail and the film here all move together.
    function colliderModeActive() {
        return typeof maskState.activeMaskLayerId === 'string'
            && maskState.activeMaskLayerId.startsWith('collider-');
    }
    function colliderMaskId() {
        var l = colliderLayer();
        return (l && l.collisionSource) ? l.collisionSource.id : null;
    }
    function colliderLayer() {
        if (!colliderModeActive()) return null;
        var idx = parseInt(maskState.activeMaskLayerId.slice(9), 10);
        return (window.layers || []).find(function (l) { return l.index === idx; }) || null;
    }
    // Which layers this mode can serve: a collision layer whose shape comes
    // from a live/bound Mask buffer (what Paint Collider builds).
    window.isPaintedColliderLayer = function (layer) {
        return !!(layer && layer.isCollision && layer.collisionSource
            && layer.collisionSource.kind === 'mask'
            && window.Masks && window.Masks.getFBO(layer.collisionSource.id));
    };

    // Re-read the collider from its mask and repaint the film (debounced —
    // one GPU readback per stroke burst, same cadence as the live binding).
    function scheduleColliderFilm() {
        if (maskState.colliderFilmPending) return;
        maskState.colliderFilmPending = true;
        setTimeout(function () {
            maskState.colliderFilmPending = false;
            if (!colliderModeActive()) return;
            var url = null;
            try {
                if (window.collisionLayers && window.collisionLayers.refreshColliderFromSource) {
                    url = window.collisionLayers.refreshColliderFromSource(colliderLayer().index);
                }
            } catch (e) { console.warn('collider refresh failed', e); }
            if (!url) { renderMaskEditor(); return; }
            var img = new Image();
            img.onload = function () {
                maskState.colliderFilm = img;
                maskState.colliderFilmTinted = tintColliderFilm(img);
                renderMaskEditor();
            };
            img.src = url;
        }, 90);
    }

    // The coverage preview is white-on-transparent; paint it red so it reads
    // as the same "wall" film the canvas shows while collider painting.
    function tintColliderFilm(img) {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        cx.globalCompositeOperation = 'source-in';
        cx.fillStyle = '#ff3b30';
        cx.fillRect(0, 0, c.width, c.height);
        return c;
    }

    // One dab into the collider's mask. The mask stamp reads the GLOBAL
    // brush size/eraser, so swap them for the editor's own tool settings and
    // put them back — editing walls must not rewrite the user's brush.
    function colliderStamp(x, y) {
        if (typeof window.__maskStamp !== 'function' || !window.config) return;
        var cfg = window.config;
        var savedR = cfg.SPLAT_RADIUS, savedE = cfg.BRUSH_ERASER;
        // Slider is in Brush Size units (1-30); SPLAT_RADIUS is that /1000.
        cfg.SPLAT_RADIUS = maskState.colliderSize / 1000;
        cfg.BRUSH_ERASER = (maskState.colliderTool === 'erase');
        // ...and opt out of the custom brush shape the same way. The editor's
        // wall tool is a precision disc with its own size; a shape the user
        // picked for painting has no business redrawing walls in here.
        window.__plainMaskStamp = true;
        try { window.__maskStamp(x, y, 1); }
        finally {
            cfg.SPLAT_RADIUS = savedR; cfg.BRUSH_ERASER = savedE;
            window.__plainMaskStamp = false;
        }
    }

    window.enterColliderMaskMode = function (layerIndex) {
        var layer = (window.layers || []).find(function (l) { return l.index === layerIndex; });
        if (!window.isPaintedColliderLayer(layer)) {
            // Not a painted collider — fall back to the shape editor.
            return window.enterImageLayerMaskMode(layerIndex);
        }
        var maskId = layer.collisionSource.id;
        maskState.activeMaskLayerId = 'collider-' + layerIndex;
        maskState.shapes = [];
        maskState.selectedShapeIndex = null;
        maskState.isDragging = false;
        maskState.isResizing = false;
        maskState.zoom = 1.0;
        maskState.panX = 0;
        maskState.panY = 0;
        maskState.isPanning = false;
        maskState.colliderTool = maskState.colliderTool || 'draw';
        maskState.colliderSize = (typeof maskState.colliderSize === 'number') ? maskState.colliderSize : 11;
        maskState.colliderFilm = null;
        maskState.colliderFilmTinted = null;
        maskState.colliderPainting = false;
        // Route __maskStamp at THIS collider's mask for the session, and put
        // the user's previous active mask back on the way out.
        maskState.colliderPrevMask = (window.Masks && window.Masks.activeId) ? window.Masks.activeId() : null;
        try { if (window.Masks && window.Masks.setActive) window.Masks.setActive(maskId); } catch (_) {}

        showMaskEditor();
        // Collider painting is its own single-purpose tool, not a mask build —
        // make sure no wizard step from a previous session is still gating the
        // chrome this mode expects to be there.
        wizardEnd();
        setTimeout(function () {
            setColliderChromeVisible(true);
            var hdr = document.querySelector('.mask-editor-header h3');
            if (hdr) hdr.textContent = 'Edit Collider — ' + (layer.title || 'Collision');
            var hint = document.getElementById('maskHint');
            if (hint) {
                hint.innerHTML = '<strong style="color:#ff7b72;">🧱 Collider:</strong> '
                    + 'Draw to add walls • Erase to carve them back • Shift+Drag to pan • Scroll to zoom';
            }
            updateZoomDisplay();
            scheduleColliderFilm();
            renderMaskEditor();
        }, 10);
    };

    // Show the collider toolbar and hide the shape/Instant-Roto chrome (they
    // author layer.mask.shapes — a different feature that would only confuse
    // things here), restoring it on the way out.
    function setColliderChromeVisible(on) {
        var overlay = document.getElementById('maskEditorOverlay');
        if (!overlay) return;
        var tools = document.getElementById('colliderTools');
        if (tools) tools.style.display = on ? '' : 'none';
        ['.mask-mode-toggle', '.mask-tools-row', '#stampMenu', '#smartSelectControls', '#filterPanel', '#maskRotationControl']
            .forEach(function (sel) {
                var el = overlay.querySelector(sel);
                if (el) el.style.display = on ? 'none' : '';
            });
        // Live edits — there is nothing to "apply", and Cancel cannot undo
        // GPU strokes (the ↶ button does that).
        var cancelBtn = overlay.querySelector('.mask-cancel-btn');
        if (cancelBtn) cancelBtn.style.display = on ? 'none' : '';
        var applyBtn = overlay.querySelector('.mask-apply-btn');
        if (applyBtn && on) applyBtn.textContent = 'Done';
    }

    function exitColliderMaskMode() {
        setColliderChromeVisible(false);
        hideMaskEditor();
        // One last refresh so the thumbnail/obstacle match the final state
        try {
            var l = colliderLayer();
            if (l && window.collisionLayers && window.collisionLayers.refreshColliderFromSource) {
                window.collisionLayers.refreshColliderFromSource(l.index);
            }
        } catch (_) {}
        try {
            if (window.Masks && window.Masks.setActive && maskState.colliderPrevMask != null) {
                window.Masks.setActive(maskState.colliderPrevMask);
            }
        } catch (_) {}
        maskState.activeMaskLayerId = null;
        maskState.colliderFilm = null;
        maskState.colliderFilmTinted = null;
        maskState.colliderPainting = false;
        maskState.colliderPrevMask = null;
        if (typeof window.renderLayers === 'function') window.renderLayers();
    }

    // opts.makeCollider pre-arms step 3's collider hand-off, for callers that
    // opened the editor *because* the user asked for a wall (the Layers panel's
    // 🧱 button — 23-depth-collision startFrom*).
    window.enterImageLayerMaskMode = function(layerIndex, opts) {
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
        
        // Start decoding the backdrop now, so the first frame has it rather
        // than painting shapes over an empty canvas for a frame.
        try { maskBackgroundImage(layer.originalData || layer.data); } catch (_) {}

        // Show mask editor overlay
        showMaskEditor();
        wizardBegin();
        // After wizardBegin — it resets the opt-ins to their defaults.
        if (opts && opts.makeCollider) {
            maskState.makeCollider = true;
            wizardSyncUI();
        }

        // Update title and render with fresh state
        setTimeout(() => {
            updateMaskEditorTitleForImageLayer(layer);
            updateZoomDisplay();
            renderMaskEditor();
        }, 10);
    };

    // The image handed to the editor IS a finished mask (a saved brush stamp
    // being re-opened): read its alpha back out as mask COVERAGE, cropped to
    // its bounding box, in exactly the form commitTouchUp produces. Seeding
    // this is what makes a re-edit incremental — without it the editor opens
    // on an empty selection and the first touch-up stroke BECOMES the whole
    // mask, wiping every part of the stamp it did not cover.
    function adhocSeedShape(source, w, h) {
        let d;
        try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.drawImage(source, 0, 0, w, h);
            d = cx.getImageData(0, 0, w, h).data;
        } catch (_) { return null; }
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                if (d[(row + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;   // fully transparent — nothing to seed from
        const bw = maxX - minX + 1, bh = maxY - minY + 1;
        const out = new Uint8Array(bw * bh);
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                out[y * bw + x] = d[((minY + y) * w + (minX + x)) * 4 + 3];
            }
        }
        return {
            type: 'sam-mask',
            x: minX, y: minY, width: bw, height: bh, rotation: 0,
            samMask: out, samMaskWidth: bw, samMaskHeight: bh,
            samSoft: true   // a stamp's edge is antialiased 0-255 coverage
        };
    }

    // Re-opened stamps are cropped tight to their own silhouette (processStamp
    // in 33 keeps only a 4% ring), so the touch-up brush's Add tool would run
    // straight into the canvas edge. Re-compose the stamp centred on a roomier
    // transparent canvas first. Nothing is lost: Apply re-crops to the
    // bounding box, so the empty margin never reaches storage.
    function padAdhocSource(img, frac) {
        const iw = img.naturalWidth || img.width || 1;
        const ih = img.naturalHeight || img.height || 1;
        const pad = Math.round(Math.max(iw, ih) * frac);
        if (pad < 1) return null;
        const c = document.createElement('canvas');
        c.width = iw + pad * 2; c.height = ih + pad * 2;
        try { c.getContext('2d').drawImage(img, pad, pad, iw, ih); } catch (_) { return null; }
        return c;
    }

    // ── Ad-hoc mask mode (2026-08-09): run the full editor (stamps +
    // Instant Roto) against an arbitrary image, no layer involved. Used by
    // custom brush shapes (33-brush-shapes). The editor canvas is sized to
    // the IMAGE (capped 2048 long side) so nothing is aspect-stretched;
    // shapes/SAM all operate in that space. On Apply, the caller gets a
    // white/alpha canvas: alpha = image alpha (or inverted luminance for
    // fully opaque images with no shapes) ∩ the drawn mask coverage.
    // opts (2026-08-23, re-editing a saved stamp): {seed:true} loads the
    // image's own alpha as the starting coverage and makes THAT — not the
    // image — the source of the applied alpha, so every pass tweaks the last
    // one instead of intersecting it; {pad:frac} gives the stamp room to grow.
    window.enterAdhocMaskMode = function (imageDataURL, name, onApply, opts) {
        const img = new Image();
        img.onload = () => {
            const padded = (opts && opts.pad > 0) ? padAdhocSource(img, opts.pad) : null;
            const source = padded || img;
            const sw = source.naturalWidth || source.width || 1;
            const sh = source.naturalHeight || source.height || 1;
            const long = Math.max(sw, sh) || 1;
            // Work at a comfortable editing resolution: the editor canvas
            // displays at its native CSS px (.mask-editor-canvas only has
            // max-width/height), so a small brush image would otherwise open
            // a postage-stamp editor. Scale small images UP to 800, cap huge
            // ones at 2048 — the saved stamp is ≤128px either way (33).
            const target = Math.min(2048, Math.max(long, 800));
            const scale = target / long;
            const w = Math.max(1, Math.round(sw * scale));
            const h = Math.max(1, Math.round(sh * scale));
            maskState.adhocSource = {
                image: source,
                // Instant Roto keys off this URL and maps clicks through
                // width/height, so a padded session must hand it the PADDED
                // bitmap or its coordinates land offset from the artwork.
                dataURL: padded ? padded.toDataURL('image/png') : imageDataURL,
                name: name || 'Brush Shape',
                onApply: onApply,
                seeded: false,
                width: w,
                height: h
            };
            maskState.activeMaskLayerId = 'adhoc';
            maskState.maskMode = 'show';
            maskState.shapes = [];
            if (opts && opts.seed) {
                const seed = adhocSeedShape(source, w, h);
                if (seed) {
                    maskState.shapes = [seed];
                    maskState.adhocSource.seeded = true;
                }
            }
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
            // Reset the overlay DOM too if Instant Roto was left engaged
            // (toggleSmartSelect's OFF branch restores the manual tools).
            if (maskState.smartSelectMode && typeof window.toggleSmartSelect === 'function') {
                try { window.toggleSmartSelect(); } catch (_) {}
            }
            wizardBegin();
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
        // A seeded session started FROM this image's alpha, so the coverage
        // already carries it — reading the image again would square it, and
        // would also clip anything the touch-up brush added outside the old
        // silhouette. Coverage alone is the answer there.
        const seeded = !!src.seeded;
        // Does the source image carry real transparency?
        let hasAlpha = false;
        if (!seeded) {
            for (let i = 3; i < px.length; i += 4) { if (px[i] < 250) { hasAlpha = true; break; } }
        }
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
            // Wizard step 3: a brush shape has no layer to carry a Feather
            // value, so the softness is baked into the stamp here. Same radius
            // law as applyLayerMask, carried to this image's scale.
            if (maskState.wizardActive && maskState.feather > 0
                && typeof window._featherMaskAlpha === 'function') {
                const fr = Math.max(1, Math.round((maskState.feather / 100) * 20 * (Math.max(w, h) / 1920)));
                try { window._featherMaskAlpha(cctx, w, h, fr); } catch (_) {}
            }
            cov = cctx.getImageData(0, 0, w, h).data;
        }
        const invertCov = maskState.maskMode === 'hide';
        for (let i = 0; i < px.length; i += 4) {
            let a;
            if (seeded) {
                // Every shape deleted = an empty stamp, which 33 refuses with
                // "nothing left to stamp" and keeps the old art. Falling back
                // to 1 here would silently save a full square instead.
                a = cov ? 1 : 0;
            } else if (hasAlpha) {
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
            alert('Instant Roto is still cutting out your object — wait for the green preview, or Cancel.');
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
        // (also clears any pending debounce and resyncs the Apply button)
        resetSamSessionState();
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
            alert('Instant Roto is still cutting out your object — wait for the green preview, or Cancel.');
            return;
        }

        const layerIndex = parseInt(maskState.activeMaskLayerId.replace('image-', ''));
        const layer = window.layers?.find(l => l.index === layerIndex);
        // Read the wizard's opt-ins before the state reset below clears them
        const wantsCollider = !!(maskState.wizardActive && maskState.makeCollider);

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

            // Wizard step 3 writes the softness where every consumer already
            // reads it — the layer preview (applyLayerMask), the collider bake
            // (_collisionFromShapes) and the panel's Feather slider — instead
            // of baking it into the pixels. Shapes only: on a shape-less layer
            // `threshold` means something else entirely (the rudimentary
            // luminance mask), and writing it would mask the layer by accident.
            if (maskState.wizardActive && wizardSupportsFeather() && maskState.shapes.length) {
                layer.threshold = Math.max(0, Math.min(100, maskState.feather | 0));
                layer.__maskDirty = true; // 7.6 reorder-reapply memo
            }
        }

        // Hide mask editor overlay
        hideMaskEditor();

        // Reset mask state
        maskState.activeMaskLayerId = null;
        maskState.shapes = [];
        maskState.selectedShapeIndex = null;
        // Same anti-leak reset as the adhoc/recording exits: stale points
        // from a cancelled session would disable Apply on the next open.
        resetSamSessionState();

        // Apply mask to layer immediately
        if (save && layer && typeof window.applyLayerMask === 'function') {
            window.applyLayerMask(layerIndex);
        }

        // Collision layers: re-composite the physics obstacle from the edited mask
        if (save && layer && layer.isCollision && window.collisionLayers) {
            window.collisionLayers.updateObstacleFromLayers();
        }

        // Wizard step 3 opt-in: hand the finished mask straight to the
        // collision system, so "cut this out and make the fluid flow around
        // it" is one pass instead of mask → feather → find the 🧱 button.
        if (save && wantsCollider && layer && !layer.isCollision
            && typeof window.collisionFromMask === 'function') {
            try { window.collisionFromMask(layerIndex); }
            catch (e) { console.warn('[mask wizard] collider hand-off failed', e); }
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
        // The touch-up brush owns the coverage while step 2 is open — fold it
        // back into maskState.shapes before any save path reads them.
        if (save) commitTouchUp(); else discardTouchUp();
        if (colliderModeActive()) {
            // Edits already live in the collider's mask — closing is all
            // there is to do (undo lives on the ↶ button / Ctrl+Z).
            exitColliderMaskMode();
        } else if (maskState.activeMaskLayerId === 'adhoc') {
            exitAdhocMaskMode(save);
        } else if (maskState.activeMaskLayerId && maskState.activeMaskLayerId.startsWith('image-')) {
            exitImageLayerMaskMode(save);
        } else {
            originalExitMaskMode(save);
        }
        // Only tear the wizard down if the editor actually closed — the in-
        // flight-cutout guards above hold it open and return without saving.
        const ov = document.getElementById('maskEditorOverlay');
        if (!ov || ov.style.display === 'none') wizardEnd();
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
