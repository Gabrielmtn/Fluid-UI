/**
 * Save/Load Functionality (Scan + Persist)
 * Scans the UI and runtime to persist "everything" except multiplayer and hover capture.
 */

(function() {
    function $(id) { return document.getElementById(id); }
    function num(v, d=0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
    function boolEl(id) { const el = $(id); return !!(el && el.checked); }
    function valEl(id) { const el = $(id); return el ? el.value : undefined; }
    function setVal(id, value, evt='input') { const el = $(id); if (!el) return; el.value = value; el.dispatchEvent(new Event(evt, {bubbles:true})); el.style.setProperty('--val', value); }
    function setCheck(id, checked) { const el = $(id); if (!el) return; el.checked = !!checked; el.dispatchEvent(new Event('change', {bubbles:true})); }

    // Base64 encode/decode for Uint8Array (collision depthData serialization)
    function _uint8ToBase64(uint8) {
        var chunks = [];
        var CHUNK = 8192; // avoid call stack overflow with .apply
        for (var i = 0; i < uint8.length; i += CHUNK) {
            chunks.push(String.fromCharCode.apply(null, uint8.subarray(i, Math.min(i + CHUNK, uint8.length))));
        }
        return btoa(chunks.join(''));
    }
    function _base64ToUint8(b64) {
        var bin = atob(b64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }

    // All slider IDs to save/load
    var SLIDER_IDS = [
        // Simulation
        'densityDissipation','velocityDissipation','pressureDissipation','pressureIteration',
        'velocityInfluence','curl','sharpness','swirl','brushSize','multiplier','timeScale','canvasOpacity','captureDimming',
        // Kaleidoscope
        'kSpinSpeed','kTwist','kZoom','kBlend','kAngle','kaleidoSegments',
        // Light Source
        'lightSpeed','lightIntensity','lightAmbient',
        // Light Shift
        'lightShiftSpeed','lightShiftThreshold','lightShiftIntensity','lightShiftSaturation',
        // Micro Detail
        'clarity','vibrance',
        // Sunrays
        'sunraysWeight',
        // Shooting Star
        'ssFrequency','ssAngle','ssLength','ssSize','ssVariance','ssGravity',
        // Audio Reactive
        'audioSensitivity','audioBeatThreshold',
        // Brush
        'brushRefreshRate',
        // Display Shading
        'shadingIntensity'
    ];

    // All checkbox IDs to save/load
    var CHECKBOX_IDS = [
        // Display
        // (preserveFluidOpacity is deliberately NOT persisted — "Empty Alpha
        // Locked" must default to checked on every launch; session-only toggle)
        'cursorToggle','showCanvasHandles','lockCanvasBorders',
        'statsToggle','transparentMode',
        // Colors
        'randomColor','stepPalette',
        // Kaleidoscope
        'kaleidoToggle','kAnimateRot',
        // Effects
        'enableLighting','enableLightShift','microDetailToggle',
        'sunraysToggle',
        // Simulation
        'macCormackToggle','multigridToggle',
        // Animations
        'ascendToggle','ascendRandomness','shootingStarToggle',
        // Layers
        'hoverCaptureToggle','detachCaptureToggle',
        // Audio Reactive
        'audioReactToggle','arMapAutoSplat','arMapSize','arMapKaleido','arMapColor',
        // Focus
        'focusModeToggle','streamFormatLock',
        // Settings
        'autoloadSettings',
        // Display Shading
        'displayShadingToggle'
    ];

    // All select IDs to save/load
    var SELECT_IDS = [
        'visualResolution','physicsResolution','kaleidoMode',
        // Simulation
        'fpsCap',
        // Light Source
        'lightMode',
        // Light Shift
        'lightShiftMode',
        // Recording
        'recMode','recPlaybackSpeed',
        // Audio Reactive
        'audioMode','audioReactSource','audioAutoSplatMode',
        // Brush
        'splatInMode','splatOutMode'
    ];

    function getStatsPanelState() {
        const panel = $('statsPanel');
        const toggle = $('statsToggle');
        const pinBtn = $('statsPinBtn');
        const pinned = pinBtn ? pinBtn.classList.contains('pinned') : false;
        const enabled = toggle ? !!toggle.checked : false;
        let position = null;
        if (panel) {
            const r = panel.getBoundingClientRect();
            position = { x: Math.round(r.left), y: Math.round(r.top) };
        }
        return { position, pinned, enabled };
    }

    function getWrapperRect() {
        const wrap = $('canvas-wrapper'); const area = $('canvas-area');
        if (!wrap || !area) return null;
        const wr = wrap.getBoundingClientRect();
        const ar = area.getBoundingClientRect();
        return { left: Math.round(wr.left - ar.left), top: Math.round(wr.top - ar.top), width: Math.round(wr.width), height: Math.round(wr.height) };
    }

    function scanAppState() {
        var sm = window.settingsManager;
        if (!sm) { console.warn('Save: settingsManager not available'); return {}; }

        // ── Sliders ──
        const sliders = {};
        SLIDER_IDS.forEach(id => { const v = valEl(id); if (v !== undefined) sliders[id] = num(v); });

        // ── Checkboxes ──
        const checkboxes = {};
        CHECKBOX_IDS.forEach(id => { const el = $(id); if (el) checkboxes[id] = !!el.checked; });

        // ── Selects ──
        const selects = {};
        SELECT_IDS.forEach(id => {
            const el = $(id);
            if (!el) return;
            const v = el.value;
            if (v !== undefined && v !== '') selects[id] = v;
        });

        // ── Colors ──
        const colors = {
            background: valEl('backgroundColorPicker') || '#000000',
            brush: valEl('colorPicker') || '#ffffff'
        };

        // ── Panels ──
        const panels = { statsPanel: getStatsPanelState() };

        // ── Canvas ──
        const canvas = (function(){
            const c = $('canvas');
            return { width: c ? c.width : undefined, height: c ? c.height : undefined, wrapperRect: getWrapperRect() };
        })();

        // ── Persist via Settings interface ──
        if (window.Settings) {
            Settings.savePanel('statsPanel', panels.statsPanel);
            Settings.saveSliders(sliders);
            Settings.saveCheckboxes(checkboxes);
            Object.entries(colors).forEach(([name, val]) => Settings.saveColor(name, val));
            Object.entries(selects).forEach(([name, val]) => Settings.saveSelect(name, val));
            if (canvas.width && canvas.height) Settings.saveCanvasSize(canvas.width, canvas.height);
            if (canvas.wrapperRect) sm.set('canvas.wrapperRect', canvas.wrapperRect);
        }

        // ── Kaleidoscope runtime ──
        sm.set('kaleido.runtime', {
            mode: window.kaleidoMode,
            segments: window.kaleidoSegments,
            angle: window.kAngle,
            twist: window.kTwist,
            zoom: window.kZoom,
            blend: window.kBlend,
            animate: window.kAnimateRot
        });

        // ── Palettes (comprehensive) ──
        var paletteSaved = 0;
        try {
            // User palette overrides
            var up = (window.userPalettes && typeof window.userPalettes === 'object') ? window.userPalettes : {};
            sm.set('palettes.user', up);

            // Saved color swatches (via window getter)
            var sc = Array.isArray(window.savedColors) ? window.savedColors.slice() : [];
            sm.set('palettes.savedColors', sc);

            // Custom palettes (user-created)
            var cp = Array.isArray(window.customPalettes) ? window.customPalettes.map(function(p) {
                return { name: p.name, colors: Array.isArray(p.colors) ? p.colors.slice() : [] };
            }) : [];
            sm.set('palettes.custom', cp);

            // Deleted default palettes
            var dp = Array.isArray(window.deletedDefaultPalettes) ? window.deletedDefaultPalettes.slice() : [];
            sm.set('palettes.deletedDefaults', dp);

            // Current palette index (via window getter)
            var idx = window.currentPaletteIndex;
            if (typeof idx === 'number') sm.set('palette.currentIndex', idx);

            // Full palette snapshot for robustness
            var all = Array.isArray(window.curatedPalettes) ? window.curatedPalettes.map(function(p) {
                var colors = Array.isArray(p.colors) ? p.colors.slice() : Object.values(p.colors || {});
                return { name: p.name, colors: colors };
            }) : [];
            sm.set('palettes.allSnapshot', all);

            paletteSaved = cp.length + ' custom, ' + all.length + ' total';
        } catch (e) {
            console.error('Save palettes error:', e);
        }

        sm.set('meta.lastSavedAt', Date.now());
        console.log('Settings saved:', Object.keys(sliders).length, 'sliders,', Object.keys(checkboxes).length, 'checkboxes, palettes:', paletteSaved);

        return { panels, sliders, checkboxes, colors, selects, canvas };
    }

    function applyFromSettings() {
        var sm = window.settingsManager;
        if (!sm) { console.warn('Load: settingsManager not available'); return; }

        // ── 1. Palettes (must happen before other UI that references them) ──
        try {
            // Restore deleted defaults first
            if (typeof window.loadDeletedPalettes === 'function') {
                window.loadDeletedPalettes();
            }

            // Restore custom palettes
            var cp = sm.get('palettes.custom');
            if (Array.isArray(cp) && cp.length && typeof window.addCustomPalettes === 'function') {
                window.addCustomPalettes(cp);
            }

            // Restore user palette overrides
            var up = sm.get('palettes.user');
            if (up && typeof up === 'object') {
                window.userPalettes = up;
            }

            // Restore saved color swatches via window.colorStorage
            var sc = sm.get('palettes.savedColors');
            if (Array.isArray(sc) && sc.length && window.colorStorage && typeof window.colorStorage.save === 'function') {
                window.colorStorage.save(sc.slice());
            }

            // Refresh carousel after palette data is restored
            if (typeof window.refreshPaletteCarousel === 'function') {
                window.refreshPaletteCarousel();
            }

            // Apply saved palette index
            var paletteIdx = sm.get('palette.currentIndex');
            if (typeof window.applyPalette === 'function') {
                if (typeof paletteIdx === 'number' && paletteIdx >= 0) {
                    window.applyPalette(paletteIdx);
                } else {
                    window.applyPalette(0);
                }
            }
            console.log('Palettes loaded: custom=' + (cp ? cp.length : 0) + ', index=' + paletteIdx);
        } catch (e) {
            console.error('Load palettes error:', e);
        }

        // ── 2. Panels ──
        var p = window.Settings ? Settings.loadPanel('statsPanel') : null;
        if (p) {
            setCheck('statsToggle', !!p.enabled);
            if (p.position) {
                var panel = $('statsPanel'); if (panel) { panel.style.left = p.position.x + 'px'; panel.style.top = p.position.y + 'px'; }
            }
            var pinBtn = $('statsPinBtn'); if (pinBtn) pinBtn.classList.toggle('pinned', !!p.pinned);
        }

        // ── 3. Sliders ──
        var sliderCount = 0;
        SLIDER_IDS.forEach(function(id) {
            var v = sm.get('slider.' + id);
            if (v !== undefined && v !== null) { setVal(id, v); sliderCount++; }
        });

        // ── 4. Checkboxes ──
        CHECKBOX_IDS.forEach(function(id) {
            var v = sm.get('checkbox.' + id);
            if (typeof v === 'boolean') setCheck(id, v);
        });

        // ── 5. Selects ──
        SELECT_IDS.forEach(function(id) {
            var v = sm.get('select.' + id);
            if (v === undefined) return;
            var el = $(id);
            if (!el) return;
            var hasOption = Array.from(el.options).some(function(opt) { return opt.value === String(v); });
            if (hasOption) {
                setVal(id, v, 'change');
            } else if (id === 'visualResolution' || id === 'physicsResolution') {
                var numVal = parseInt(v, 10);
                if (!isNaN(numVal)) {
                    var options = Array.from(el.options).map(function(opt) { return parseInt(opt.value, 10); }).filter(function(n) { return !isNaN(n); });
                    var closest = options.reduce(function(prev, curr) {
                        return Math.abs(curr - numVal) < Math.abs(prev - numVal) ? curr : prev;
                    });
                    setVal(id, String(closest), 'change');
                }
            } else if (el.options.length > 0) {
                setVal(id, el.options[0].value, 'change');
            }
        });

        // ── 6. Colors ──
        var bg = sm.get('color.background');
        if (bg) setVal('backgroundColorPicker', bg, 'input');
        var brush = sm.get('color.brush');
        if (brush) setVal('colorPicker', brush, 'input');

        // ── 7. Canvas wrapper rect ──
        var wr = sm.get('canvas.wrapperRect');
        if (wr) {
            var wrap = $('canvas-wrapper');
            if (wrap) {
                wrap.style.left = wr.left + 'px';
                wrap.style.top = wr.top + 'px';
                wrap.style.width = wr.width + 'px';
                wrap.style.height = wr.height + 'px';
                if (typeof window.updateCanvasSize === 'function') {
                    window.updateCanvasSize();
                }
            }
        }

        // ── 8. Kaleidoscope runtime ──
        var kr = sm.get('kaleido.runtime');
        if (kr) {
            if (typeof kr.mode === 'number') setVal('kaleidoMode', kr.mode, 'change');
            if (typeof kr.segments === 'number') setVal('kaleidoSegments', kr.segments, 'input');
        }

        // ── 9. COS Oscillator state ──
        try {
            var cosSnap = sm.get('cosOscillator', null);
            if (cosSnap && window.cosOscillator && typeof window.cosOscillator.loadState === 'function') {
                window.cosOscillator.loadState(cosSnap);
            }
        } catch(_){}

        console.log('Settings loaded:', sliderCount, 'sliders restored');
    }

    function setupSaveLoad() {
        const saveBtn = $('saveSettingsBtn');
        const loadBtn = $('loadSettingsBtn');
        const clearBtn = $('clearSettingsBtn');
        const autoloadChk = $('autoloadSettings');
        if (!saveBtn || !loadBtn) { console.warn('Save/Load buttons not found'); return; }

        saveBtn.addEventListener('click', () => {
            try {
                const state = scanAppState();
                // Also store a collapsed snapshot for debugging
                window.settingsManager?.set('app.lastSnapshot', state);
                saveBtn.textContent = '✅ Saved';
                setTimeout(() => saveBtn.textContent = '💾 Save', 1500);
            } catch (err) {
                console.error('Save error:', err);
                saveBtn.textContent = '❌ Error';
                setTimeout(() => saveBtn.textContent = '💾 Save', 2000);
            }
        });

        loadBtn.addEventListener('click', () => {
            try {
                applyFromSettings();
                loadBtn.textContent = '✅ Loaded';
                setTimeout(() => loadBtn.textContent = '📂 Load', 1500);
            } catch (err) {
                console.error('Load error:', err);
                loadBtn.textContent = '❌ Error';
                setTimeout(() => loadBtn.textContent = '📂 Load', 2000);
            }
        });

        // Clear saved settings
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                try {
                    window.settingsManager?.clear();
                    if (typeof window.restoreDefaultPalettes === 'function') {
                        window.restoreDefaultPalettes();
                    }
                    clearBtn.textContent = '🧹 Cleared';
                    setTimeout(() => clearBtn.textContent = '🧹 Clear', 1500);
                } catch (err) {
                    console.error('Clear error:', err);
                    clearBtn.textContent = '❌ Error';
                    setTimeout(() => clearBtn.textContent = '🧹 Clear', 2000);
                }
            });
        }

        // Autoload handling
        if (autoloadChk && window.settingsManager) {
            const auto = !!window.settingsManager.get('settings.autoload');
            autoloadChk.checked = auto;
            autoloadChk.addEventListener('change', (e) => {
                const val = !!e.target.checked;
                window.settingsManager.set('settings.autoload', val);
                if (val) {
                    // Immediately apply saved settings when enabled
                    try { applyFromSettings(); } catch (err) { console.error('Autoload apply error:', err); }
                }
            });
            // Apply on start if enabled
            if (auto) {
                try {
                    if (typeof window.loadDeletedPalettes === 'function') {
                        window.loadDeletedPalettes();
                    }
                    applyFromSettings();
                } catch (err) { console.error('Autoload startup error:', err); }
            }
        }

        console.log('Save/Load (scan+persist) initialized');
    }

    // ── User Presets System ──

    function capturePresetSnapshot() {
        var sm = window.settingsManager;
        if (!sm) return null;

        // ── Sliders ──
        var sliders = {};
        SLIDER_IDS.forEach(function(id) { var v = valEl(id); if (v !== undefined) sliders[id] = num(v); });

        // ── Checkboxes ──
        var checkboxes = {};
        CHECKBOX_IDS.forEach(function(id) { var el = $(id); if (el) checkboxes[id] = !!el.checked; });

        // ── Selects ──
        var selects = {};
        SELECT_IDS.forEach(function(id) { var el = $(id); if (el && el.value !== undefined && el.value !== '') selects[id] = el.value; });

        // ── Colors ──
        var colors = {
            background: valEl('backgroundColorPicker') || '#000000',
            brush: valEl('colorPicker') || '#ffffff',
            brandingText: valEl('brandingTextColor') || '#ffffff'
        };

        // ── Kaleidoscope runtime ──
        var kaleido = {
            mode: window.kaleidoMode,
            segments: window.kaleidoSegments,
            angle: window.kAngle,
            twist: window.kTwist,
            zoom: window.kZoom,
            blend: window.kBlend,
            animate: window.kAnimateRot
        };

        // ── Palette ──
        var paletteIndex = typeof window.currentPaletteIndex === 'number' ? window.currentPaletteIndex : 0;
        var paletteName = '';
        try { paletteName = window.curatedPalettes[paletteIndex] ? window.curatedPalettes[paletteIndex].name : ''; } catch(_){}

        // ── Saved colors ──
        var savedColorsList = null;
        try { if (typeof savedColors !== 'undefined' && Array.isArray(savedColors)) savedColorsList = savedColors.slice(); } catch(_){}
        if (!savedColorsList) try { savedColorsList = window.savedColors ? window.savedColors.slice() : null; } catch(_){}

        // ── User palettes ──
        var userPals = null;
        try { if (window.userPalettes) userPals = JSON.parse(JSON.stringify(window.userPalettes)); } catch(_){}

        // ── Light source position ──
        var lightPos = null;
        try {
            if (window.lightSource) {
                lightPos = { x: window.lightSource.x, y: window.lightSource.y, enabled: window.lightSource.enabled };
            }
        } catch(_){}

        // ── Light shift path ──
        var lightShiftPath = null;
        try {
            if (window.lightShift && window.lightShift.getPath) {
                lightShiftPath = window.lightShift.getPath();
            } else if (window.lightShiftWaypoints) {
                lightShiftPath = JSON.parse(JSON.stringify(window.lightShiftWaypoints));
            }
        } catch(_){}

        // ── Focus mode / stream format ──
        var focusState = null;
        try {
            if (window.focusMode) {
                var af = window.focusMode.getActiveFormat ? window.focusMode.getActiveFormat() : null;
                focusState = {
                    active: window.focusMode.isActive ? window.focusMode.isActive() : false,
                    format: af ? af.id : null
                };
            }
        } catch(_){}

        // ── Brush section runtime ──
        var brushState = {
            replayMode: window.replayMode || 'stroke',
            replayTimePeriod: window.replayTimePeriod || 5,
            refreshRate: window.brushRefreshRate || 0,
            splatInMode: window.splatInMode || 'instant',
            splatOutMode: window.splatOutMode || 'instant',
            splatInDist: typeof window.splatInDist === 'number' ? window.splatInDist : 0.15,
            splatOutDist: typeof window.splatOutDist === 'number' ? window.splatOutDist : 0.15
        };

        // ── Shooting star origin ──
        var ssOrigin = null;
        try {
            var dot = document.getElementById('ssOriginDot');
            var frame = document.getElementById('ssOriginFrame');
            if (dot && frame) {
                var fr = frame.getBoundingClientRect();
                var dr = dot.getBoundingClientRect();
                if (fr.width > 0 && fr.height > 0) {
                    ssOrigin = {
                        xPct: ((dr.left + dr.width/2 - fr.left) / fr.width * 100),
                        yPct: ((dr.top + dr.height/2 - fr.top) / fr.height * 100)
                    };
                }
            }
            // Also try window globals
            if (!ssOrigin && typeof window.ssOriginX === 'number') {
                ssOrigin = { xPct: window.ssOriginX, yPct: window.ssOriginY };
            }
        } catch(_){}

        // ── Canvas wrapper geometry ──
        var canvasWrapper = null;
        try {
            var wrap = document.getElementById('canvas-wrapper');
            if (wrap) {
                canvasWrapper = {
                    left: wrap.style.left || wrap.offsetLeft + 'px',
                    top: wrap.style.top || wrap.offsetTop + 'px',
                    width: wrap.style.width || wrap.offsetWidth + 'px',
                    height: wrap.style.height || wrap.offsetHeight + 'px'
                };
            }
        } catch(_){}

        // ── Sidebar section collapsed states ──
        var sidebarSections = {};
        try {
            var sections = document.querySelectorAll('#sidebar-right .sidebar-section');
            sections.forEach(function(sec) {
                var titleEl = sec.querySelector('.section-title');
                if (titleEl) {
                    var title = titleEl.textContent.trim();
                    sidebarSections[title] = sec.classList.contains('collapsed');
                }
            });
        } catch(_){}

        // ── Layers (data URLs, position, masks, collision) ──
        var layersData = null;
        try {
            var ls = window.layers;
            if (ls && ls.length > 0) {
                layersData = ls.map(function(layer) {
                    var ld = {
                        index: layer.index,
                        title: layer.title || ('Layer ' + layer.index),
                        data: layer.data || null,
                        originalData: layer.originalData || layer.data || null,
                        visible: layer.visible !== false,
                        active: !!layer.active,
                        threshold: layer.threshold || 0,
                        x: layer.x || 0,
                        y: layer.y || 0,
                        scaleX: layer.scaleX || 1,
                        scaleY: layer.scaleY || 1,
                        rotation: layer.rotation || 0,
                        isCollision: !!layer.isCollision,
                        collisionMode: layer.collisionMode || 'block',
                        collisionStrength: typeof layer.collisionStrength === 'number' ? layer.collisionStrength : 0.7
                    };
                    // Mask data — encode collision depthData as base64 for exact restoration
                    if (layer.mask) {
                        ld.mask = {
                            enabled: !!layer.mask.enabled,
                            mode: layer.mask.mode || 'show',
                            shapes: (layer.mask.shapes || []).map(function(s) {
                                var sc = {};
                                Object.keys(s).forEach(function(k) {
                                    var v = s[k];
                                    if (k === 'samMask') return; // skip SAM masks (visual only)
                                    if (k === 'depthData' && v instanceof Uint8Array) {
                                        // Encode collision depth data as base64 for exact restore
                                        sc._depthDataB64 = _uint8ToBase64(v);
                                        return;
                                    }
                                    if (v instanceof Uint8Array || v instanceof Float32Array) return;
                                    sc[k] = v;
                                });
                                if (s.samMask) sc._hadSamMask = true;
                                return sc;
                            })
                        };
                    }
                    return ld;
                });
            }
        } catch(_){}

        // ── Layer order ──
        var layerOrderData = null;
        try {
            if (window.layerOrder) {
                layerOrderData = JSON.parse(JSON.stringify(window.layerOrder));
            }
        } catch(_){}

        // ── Branding overlays ──
        var brandingData = null;
        try {
            if (window.brandingOverlays && window.brandingOverlays.getAll) {
                var all = window.brandingOverlays.getAll();
                if (all.length > 0) {
                    brandingData = all.map(function(ov) {
                        return {
                            type: ov.type,
                            text: ov.text,
                            position: ov.position,
                            color: ov.color,
                            size: ov.size,
                            url: ov.url,
                            imageDataURL: ov.imageDataURL || null
                        };
                    });
                }
            }
        } catch(_){}


        // ── Recorded layers (timeline interactions) ──
        var recordedLayers = null;
        try {
            if (typeof window.recGetLayersSnapshot === 'function') {
                recordedLayers = window.recGetLayersSnapshot();
            }
        } catch(_){}

        // ── COS Oscillator state ──
        var cosState = null;
        try {
            if (window.cosOscillator && typeof window.cosOscillator.getState === 'function') {
                cosState = window.cosOscillator.getState();
            }
        } catch(_){}

        // ── Path layers state ──
        var pathLayersData = null;
        try {
            if (window.pathLayers && typeof window.pathLayers.getSnapshot === 'function') {
                pathLayersData = window.pathLayers.getSnapshot();
            }
        } catch(_){}

        // ── Per-arm brush colors (multiply brush) ──
        var armColorsData = null;
        try {
            if (window.multiArmColors && window.multiArmColors.length) {
                armColorsData = window.multiArmColors.map(function(c) {
                    return { mode: c.mode, color: c.color, stepIndex: c.stepIndex || 0 };
                });
            }
        } catch(_){}

        return {
            version: 2,
            timestamp: Date.now(),
            sliders: sliders,
            checkboxes: checkboxes,
            selects: selects,
            colors: colors,
            kaleido: kaleido,
            paletteIndex: paletteIndex,
            paletteName: paletteName,
            savedColors: savedColorsList,
            userPalettes: userPals,
            lightPos: lightPos,
            lightShiftPath: lightShiftPath,
            focusState: focusState,
            brushState: brushState,
            ssOrigin: ssOrigin,
            canvasWrapper: canvasWrapper,
            sidebarSections: sidebarSections,
            layers: layersData,
            layerOrder: layerOrderData,
            branding: brandingData,
            recordedLayers: recordedLayers,
            cosOscillator: cosState,
            pathLayers: pathLayersData,
            armColors: armColorsData
        };
    }

    function applyPresetSnapshot(snapshot) {
        if (!snapshot) return;
        var reg = window.ParamRegistry;
        // Soft reset: keep the governor's quality tier across snapshot loads —
        // a hard reset snapped to full quality and stuttered for seconds while
        // the 1 Hz evaluator re-degraded (see 08a-quality-governor.js)
        if (window.QualityGovernor) {
            (window.QualityGovernor.softReset || window.QualityGovernor.reset)();
        }

        // ── Sliders ── (clamped through the param registry; unknown ids warn + skip)
        try {
            if (snapshot.sliders) {
                Object.keys(snapshot.sliders).forEach(function(id) {
                    var raw = snapshot.sliders[id];
                    if (reg) {
                        var clamped = reg.clampSlider(id, raw);
                        if (clamped === null) { console.warn('[Preset] skipping unknown/invalid slider', id, raw); return; }
                        if (clamped !== Number(raw)) console.warn('[Preset] clamped slider', id, raw, '→', clamped);
                        setVal(id, clamped);
                    } else {
                        setVal(id, raw);
                    }
                });
            }
        } catch(e) { console.warn('[Preset] slider restore failed:', e); }

        // ── Checkboxes ──
        try {
            if (snapshot.checkboxes) {
                Object.keys(snapshot.checkboxes).forEach(function(id) {
                    // "Empty Alpha Locked" is session-only: it must stay at its
                    // checked default, so old presets that captured it are ignored
                    if (id === 'preserveFluidOpacity') return;
                    if (reg && reg.coerceCheckbox(id, snapshot.checkboxes[id]) === null) {
                        console.warn('[Preset] skipping unknown checkbox', id); return;
                    }
                    setCheck(id, !!snapshot.checkboxes[id]);
                });
            }
        } catch(e) { console.warn('[Preset] checkbox restore failed:', e); }

        // ── Selects ──
        try {
            if (snapshot.selects) {
                Object.keys(snapshot.selects).forEach(function(id) {
                    var el = $(id);
                    if (!el) return;
                    var v = snapshot.selects[id];
                    if (reg) {
                        var coerced = reg.coerceSelect(id, v);
                        if (coerced === null) { console.warn('[Preset] skipping unknown/invalid select', id, v); return; }
                        v = coerced;
                    }
                    if (el.tagName === 'SELECT') {
                        var hasOpt = Array.from(el.options).some(function(opt) { return opt.value === String(v); });
                        if (hasOpt) setVal(id, v, 'change');
                    } else {
                        setVal(id, v, 'change');
                    }
                });
            }
        } catch(e) { console.warn('[Preset] select restore failed:', e); }

        // ── Colors ──
        try {
            if (snapshot.colors) {
                if (snapshot.colors.background) setVal('backgroundColorPicker', snapshot.colors.background, 'input');
                if (snapshot.colors.brush) setVal('colorPicker', snapshot.colors.brush, 'input');
                if (snapshot.colors.brandingText) setVal('brandingTextColor', snapshot.colors.brandingText, 'input');
            }
        } catch(e) { console.warn('[Preset] color restore failed:', e); }

        // ── Per-arm brush colors (multiply brush) ──
        try {
            if (snapshot.armColors && Array.isArray(snapshot.armColors)) {
                // Mutate in place — the sim holds a reference to this array
                var armArr = window.multiArmColors;
                if (!armArr) { armArr = []; window.multiArmColors = armArr; }
                armArr.length = 0;
                snapshot.armColors.forEach(function(c) {
                    armArr.push({ mode: c.mode || 'main', color: c.color || '#ffffff', stepIndex: c.stepIndex || 0 });
                });
                if (window.settingsManager) {
                    window.settingsManager.set('brush.armColors', snapshot.armColors);
                }
                if (typeof window.rebuildArmColorRows === 'function') window.rebuildArmColorRows();
            }
        } catch(_){}

        // ── Kaleidoscope runtime ──
        try {
            if (snapshot.kaleido) {
                var kr = snapshot.kaleido;
                if (typeof kr.mode === 'number') setVal('kaleidoMode', kr.mode, 'change');
                if (typeof kr.segments === 'number') setVal('kaleidoSegments', kr.segments, 'input');
                // Runtime globals for immediate effect
                if (typeof kr.angle === 'number') window.kAngle = kr.angle;
                if (typeof kr.twist === 'number') window.kTwist = kr.twist;
                if (typeof kr.zoom === 'number') window.kZoom = kr.zoom;
                if (typeof kr.blend === 'number') window.kBlend = kr.blend;
                if (typeof kr.animate === 'boolean') window.kAnimateRot = kr.animate;
            }
        } catch(e) { console.warn('[Preset] kaleidoscope restore failed:', e); }

        // ── Palette ──
        try {
            if (typeof snapshot.paletteIndex === 'number' && typeof window.applyPalette === 'function') {
                if (snapshot.paletteName && typeof window.getPaletteIndexByName === 'function') {
                    var idx = window.getPaletteIndexByName(snapshot.paletteName);
                    if (idx >= 0) { window.applyPalette(idx); }
                    else { window.applyPalette(snapshot.paletteIndex); }
                } else {
                    window.applyPalette(snapshot.paletteIndex);
                }
            }
        } catch(e) { console.warn('[Preset] palette restore failed:', e); }

        // ── Saved colors ──
        try {
            if (snapshot.savedColors && Array.isArray(snapshot.savedColors)) {
                if (typeof window.savedColors !== 'undefined') window.savedColors = snapshot.savedColors.slice();
                if (typeof savedColors !== 'undefined') savedColors = snapshot.savedColors.slice();
                if (typeof colorStorage !== 'undefined' && colorStorage.save) colorStorage.save(snapshot.savedColors);
                if (typeof renderSavedColors === 'function') renderSavedColors();
            }
        } catch(_){}

        // ── User palettes ──
        try {
            if (snapshot.userPalettes) {
                window.userPalettes = JSON.parse(JSON.stringify(snapshot.userPalettes));
                if (window.settingsManager) window.settingsManager.set('palettes.user', window.userPalettes);
            }
        } catch(_){}

        // ── Light source position ──
        try {
            if (snapshot.lightPos && window.lightSource) {
                if (typeof snapshot.lightPos.x === 'number') window.lightSource.x = snapshot.lightPos.x;
                if (typeof snapshot.lightPos.y === 'number') window.lightSource.y = snapshot.lightPos.y;
                // Update the light dot visual
                var lightDot = document.getElementById('lightDot');
                var gridContainer = document.getElementById('lightGridContainer');
                if (lightDot && gridContainer) {
                    lightDot.style.left = (snapshot.lightPos.x * 100) + '%';
                    lightDot.style.top = (snapshot.lightPos.y * 100) + '%';
                }
            }
        } catch(_){}

        // ── Light shift path ──
        try {
            if (snapshot.lightShiftPath) {
                if (window.lightShift && window.lightShift.setPath) {
                    window.lightShift.setPath(snapshot.lightShiftPath);
                } else if (typeof window.lightShiftWaypoints !== 'undefined') {
                    window.lightShiftWaypoints = JSON.parse(JSON.stringify(snapshot.lightShiftPath));
                }
            }
        } catch(_){}

        // ── Focus mode / stream format ──
        try {
            if (snapshot.focusState && window.focusMode) {
                var currentlyFocused = window.focusMode.isActive ? window.focusMode.isActive() : false;
                if (snapshot.focusState.active !== currentlyFocused) {
                    window.focusMode.toggle();
                }
                if (snapshot.focusState.format && window.focusMode.FORMATS) {
                    var fmt = window.focusMode.FORMATS.find(function(f) { return f.id === snapshot.focusState.format; });
                    if (fmt && window.focusMode.applyFormat) window.focusMode.applyFormat(fmt);
                } else if (!snapshot.focusState.format && window.focusMode.clearFormat) {
                    window.focusMode.clearFormat();
                }
            }
        } catch(_){}

        // ── Brush section runtime ──
        try {
            if (snapshot.brushState) {
                var bs = snapshot.brushState;
                if (bs.replayMode) {
                    window.replayMode = bs.replayMode;
                    // Update UI buttons
                    var strokeBtns = document.querySelectorAll('.brush-mode-btn');
                    strokeBtns.forEach(function(b) {
                        b.classList.toggle('active', b.dataset.mode === bs.replayMode);
                    });
                    var timeGroup = document.querySelector('.brush-time-group');
                    if (timeGroup) timeGroup.style.display = bs.replayMode === 'time' ? '' : 'none';
                }
                if (typeof bs.replayTimePeriod === 'number') {
                    window.replayTimePeriod = bs.replayTimePeriod;
                    var tInput = document.getElementById('replayTimePeriod');
                    if (tInput) tInput.value = bs.replayTimePeriod;
                }
                if (typeof bs.refreshRate === 'number') window.brushRefreshRate = bs.refreshRate;
                if (bs.splatInMode) {
                    window.splatInMode = bs.splatInMode;
                    var siEl = document.getElementById('splatInMode');
                    if (siEl) siEl.value = bs.splatInMode;
                }
                if (bs.splatOutMode) {
                    window.splatOutMode = bs.splatOutMode;
                    var soEl = document.getElementById('splatOutMode');
                    if (soEl) soEl.value = bs.splatOutMode;
                }
                if (typeof bs.splatInDist === 'number') {
                    window.splatInDist = bs.splatInDist;
                    var siD = document.getElementById('splatInDist');
                    if (siD) { siD.value = bs.splatInDist; siD.dispatchEvent(new Event('input', { bubbles: true })); }
                }
                if (typeof bs.splatOutDist === 'number') {
                    window.splatOutDist = bs.splatOutDist;
                    var soD = document.getElementById('splatOutDist');
                    if (soD) { soD.value = bs.splatOutDist; soD.dispatchEvent(new Event('input', { bubbles: true })); }
                }
            }
        } catch(_){}

        // ── Shooting star origin ──
        try {
            if (snapshot.ssOrigin) {
                if (typeof window.ssOriginX !== 'undefined') {
                    window.ssOriginX = snapshot.ssOrigin.xPct;
                    window.ssOriginY = snapshot.ssOrigin.yPct;
                }
                var dot = document.getElementById('ssOriginDot');
                if (dot) {
                    dot.style.left = snapshot.ssOrigin.xPct + '%';
                    dot.style.top = snapshot.ssOrigin.yPct + '%';
                }
                var coords = document.getElementById('ssOriginCoords');
                if (coords) coords.textContent = Math.round(snapshot.ssOrigin.xPct) + '%, ' + Math.round(snapshot.ssOrigin.yPct) + '%';
            }
        } catch(_){}

        // ── Canvas wrapper geometry ──
        try {
            if (snapshot.canvasWrapper) {
                var wrap = document.getElementById('canvas-wrapper');
                if (wrap) {
                    if (snapshot.canvasWrapper.left) wrap.style.left = snapshot.canvasWrapper.left;
                    if (snapshot.canvasWrapper.top) wrap.style.top = snapshot.canvasWrapper.top;
                    if (snapshot.canvasWrapper.width) wrap.style.width = snapshot.canvasWrapper.width;
                    if (snapshot.canvasWrapper.height) wrap.style.height = snapshot.canvasWrapper.height;
                    if (typeof window.updateCanvasSize === 'function') {
                        requestAnimationFrame(function() { window.updateCanvasSize(); });
                    }
                }
            }
        } catch(_){}

        // ── Sidebar section collapsed states ──
        try {
            if (snapshot.sidebarSections) {
                var sections = document.querySelectorAll('#sidebar-right .sidebar-section');
                sections.forEach(function(sec) {
                    var titleEl = sec.querySelector('.section-title');
                    if (!titleEl) return;
                    var title = titleEl.textContent.trim();
                    if (title in snapshot.sidebarSections) {
                        sec.classList.toggle('collapsed', !!snapshot.sidebarSections[title]);
                    }
                });
            }
        } catch(_){}


        // ── Layers ──
        try {
            if (snapshot.layers && Array.isArray(snapshot.layers) && snapshot.layers.length > 0) {
                // Step 1: Clean up — remove dynamically-created canvas-layer divs
                //         and reset pre-existing background-layer divs (layer0–layer9)
                var canvasWrapper = document.getElementById('canvas-wrapper');
                if (!canvasWrapper) {
                    var canvasEl = document.getElementById('canvas');
                    canvasWrapper = canvasEl ? canvasEl.parentElement : null;
                }
                // Remove any dynamically-created .canvas-layer divs
                if (canvasWrapper) {
                    var dynamicDivs = canvasWrapper.querySelectorAll('.canvas-layer');
                    dynamicDivs.forEach(function(d) { d.remove(); });
                    // Also remove stray duplicate layerN divs parented directly to
                    // the wrapper (old collision-layer code created these alongside
                    // the static ones in #layers-container; getElementById never
                    // reaches them, so they'd otherwise ghost on screen forever)
                    canvasWrapper.querySelectorAll(':scope > .background-layer').forEach(function(d) { d.remove(); });
                }
                // Reset pre-existing background-layer divs
                for (var ri = 0; ri < 10; ri++) {
                    var resetDiv = document.getElementById('layer' + ri);
                    if (resetDiv) {
                        resetDiv.style.backgroundImage = '';
                        resetDiv.style.display = 'none';
                        resetDiv.style.zIndex = '';
                        resetDiv.style.transform = '';
                        resetDiv.style.opacity = '';
                        resetDiv.classList.remove('active');
                    }
                }
                // Clear arrays
                if (window.layers) window.layers.length = 0;
                if (window.layerOrder) {
                    window.layerOrder.length = 0;
                    window.layerOrder.push({ type: 'sim' });
                }

                var collisionIndicesToRefresh = [];

                // Step 2: Restore each layer
                snapshot.layers.forEach(function(ld) {
                    if (!ld.data) return;

                    var layerDiv;
                    if (ld.isCollision) {
                        // Collision layers REUSE the static layerN div like regular
                        // layers — a duplicate id is unreachable via getElementById,
                        // leaving an unhideable/undeletable ghost preview on screen.
                        layerDiv = document.getElementById('layer' + ld.index);
                        if (!layerDiv) {
                            layerDiv = document.createElement('div');
                            layerDiv.id = 'layer' + ld.index;
                            layerDiv.className = 'background-layer'; // same class as regular layers (canvas-layer has no CSS)
                            var layersHost = document.getElementById('layers-container') || canvasWrapper;
                            if (layersHost) layersHost.appendChild(layerDiv);
                        }
                        layerDiv.style.backgroundImage = 'url(' + ld.data + ')';
                        // Stretch — matches the obstacle compositor's mapping (see 23-depth-collision.js)
                        layerDiv.style.backgroundSize = '100% 100%';
                        layerDiv.style.backgroundPosition = 'center';
                        layerDiv.style.display = ld.visible ? 'block' : 'none';
                        layerDiv.style.opacity = '0.55';
                    } else {
                        // Regular image layers use pre-existing layerN divs
                        layerDiv = document.getElementById('layer' + ld.index);
                        if (layerDiv) {
                            layerDiv.style.backgroundImage = 'url(' + ld.data + ')';
                            layerDiv.style.display = ld.visible ? 'block' : 'none';
                            layerDiv.style.zIndex = ld.index;
                        }
                    }

                    var layer = {
                        index: ld.index,
                        title: ld.title || ('Layer ' + ld.index),
                        data: ld.data,
                        originalData: ld.originalData || ld.data,
                        visible: ld.visible !== false,
                        active: false,
                        threshold: ld.threshold || 0,
                        x: ld.x || 0,
                        y: ld.y || 0,
                        scaleX: ld.scaleX || 1,
                        scaleY: ld.scaleY || 1,
                        rotation: ld.rotation || 0,
                        isCollision: !!ld.isCollision,
                        collisionMode: ld.collisionMode || 'block',
                        collisionStrength: typeof ld.collisionStrength === 'number' ? ld.collisionStrength : 0.7
                    };

                    // Restore mask metadata and decode collision depthData from base64
                    if (ld.mask) {
                        var needsDepthRefresh = false;
                        layer.mask = {
                            enabled: !!ld.mask.enabled,
                            mode: ld.mask.mode || 'show',
                            shapes: (ld.mask.shapes || []).map(function(s) {
                                var sc = Object.assign({}, s);
                                // Decode base64 depthData back to Uint8Array (new format)
                                if (sc._depthDataB64) {
                                    try {
                                        sc.depthData = _base64ToUint8(sc._depthDataB64);
                                        delete sc._depthDataB64;
                                    } catch(e) {
                                        console.warn('Preset: failed to decode depthData base64', e);
                                        if (ld.isCollision) needsDepthRefresh = true;
                                    }
                                }
                                // Legacy presets: depthData was stripped entirely
                                else if (sc._hadDepthData) {
                                    needsDepthRefresh = true;
                                    delete sc._hadDepthData;
                                }
                                if (sc._hadSamMask) delete sc._hadSamMask;
                                return sc;
                            })
                        };
                        // Track collision layers that need depth regeneration (legacy presets only)
                        if (needsDepthRefresh && ld.isCollision) {
                            collisionIndicesToRefresh.push(ld.index);
                        }
                    } else {
                        layer.mask = { enabled: false, mode: 'show', shapes: [] };
                    }

                    window.layers.push(layer);
                    window.layerOrder.push({ type: 'layer', id: layer.index });
                });

                // Step 3: Restore exact layer order if provided
                if (snapshot.layerOrder && Array.isArray(snapshot.layerOrder)) {
                    window.layerOrder.length = 0;
                    snapshot.layerOrder.forEach(function(item) {
                        window.layerOrder.push(item);
                    });
                }

                if (typeof window.renderLayers === 'function') window.renderLayers();

                // Step 4: Upload collision obstacle data immediately for layers with restored depthData
                if (window.collisionLayers && window.collisionLayers.updateObstacleFromLayers) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
                // Step 5: Legacy presets — regenerate depth for layers that had depthData stripped
                if (collisionIndicesToRefresh.length > 0 && window.collisionLayers && window.collisionLayers.refreshDepth) {
                    setTimeout(function() {
                        collisionIndicesToRefresh.forEach(function(idx) {
                            console.log('Preset: regenerating depth for collision layer ' + idx + ' (legacy preset — no base64 data)');
                            window.collisionLayers.refreshDepth(idx);
                        });
                    }, 500);
                }
            }
        } catch(e) { console.warn('Preset: layer restore failed', e); }

        // ── Branding overlays ──
        try {
            if (snapshot.branding && Array.isArray(snapshot.branding) && window.brandingOverlays) {
                if (window.brandingOverlays.clearAll) window.brandingOverlays.clearAll();
                snapshot.branding.forEach(function(ov) {
                    if (ov.type === 'text' && window.brandingOverlays.addText) {
                        window.brandingOverlays.addText(ov.text, ov.position, ov.color, ov.size);
                    } else if (ov.type === 'image' && ov.imageDataURL && window.brandingOverlays.addImageFromDataURL) {
                        window.brandingOverlays.addImageFromDataURL(ov.imageDataURL, ov.position);
                    }
                });
            }
        } catch(_){}

        // ── Recorded layers (timeline interactions) ──
        try {
            if (snapshot.recordedLayers && Array.isArray(snapshot.recordedLayers) && typeof window.recRestoreLayersSnapshot === 'function') {
                window.recRestoreLayersSnapshot(snapshot.recordedLayers);
            }
        } catch(_){}

        // ── COS Oscillator state ──
        try {
            if (snapshot.cosOscillator && window.cosOscillator && typeof window.cosOscillator.loadState === 'function') {
                window.cosOscillator.loadState(snapshot.cosOscillator);
            }
        } catch(_){}

        // ── Path layers state ──
        try {
            if (snapshot.pathLayers && window.pathLayers && typeof window.pathLayers.restoreSnapshot === 'function') {
                window.pathLayers.restoreSnapshot(snapshot.pathLayers);
            }
        } catch(_){}

        console.log('Preset applied: v' + (snapshot.version || 1) + ', ' +
            Object.keys(snapshot.sliders || {}).length + ' sliders, ' +
            Object.keys(snapshot.checkboxes || {}).length + ' checkboxes, ' +
            Object.keys(snapshot.selects || {}).length + ' selects' +
            (snapshot.layers ? ', ' + snapshot.layers.length + ' layers' : '') +
            (snapshot.recordedLayers ? ', ' + snapshot.recordedLayers.length + ' recorded layers' : ''));
    }

    function getUserPresets() {
        if (!window.Settings) return {};
        return window.Settings.getAllPresets();
    }

    function saveUserPreset(name, snapshot) {
        if (!window.Settings || !name || !snapshot) return false;
        // Try full save (may fail if layers make it too large for localStorage)
        var ok = window.Settings.savePreset(name, snapshot);
        if (ok === false) {
            var lite = JSON.parse(JSON.stringify(snapshot));
            // First fallback: strip recorded layer interaction data (can be very large)
            if (lite.recordedLayers) {
                lite.recordedLayers.forEach(function(rl) {
                    if (rl.timeline) rl.timeline.interactions = [];
                });
                lite._recordedLayersStripped = true;
                console.warn('Preset "' + name + '": full save failed (quota), retrying without recorded interactions');
                ok = window.Settings.savePreset(name, lite);
            }
            // Second fallback: strip collision depthData base64 (can be regenerated via depth estimation)
            if (ok === false && lite.layers) {
                lite.layers.forEach(function(l) {
                    if (l.mask && l.mask.shapes) {
                        l.mask.shapes.forEach(function(s) {
                            if (s._depthDataB64) { s._hadDepthData = true; delete s._depthDataB64; }
                        });
                    }
                });
                lite._depthDataStripped = true;
                console.warn('Preset "' + name + '": retrying without collision depth data');
                ok = window.Settings.savePreset(name, lite);
            }
            // Third fallback: strip canvas layer image data
            if (ok === false && lite.layers) {
                lite.layers.forEach(function(l) { delete l.data; delete l.originalData; });
                lite._layersStripped = true;
                console.warn('Preset "' + name + '": retrying without layer images');
                ok = window.Settings.savePreset(name, lite);
            }
            // Last resort: save without layers at all
            if (ok === false) {
                delete lite.layers;
                delete lite.layerOrder;
                delete lite.recordedLayers;
                ok = window.Settings.savePreset(name, lite);
            }
            window._lastPresetSaveWarning = 'Some data too large for storage — saved settings only';
            return ok !== false;
        }
        window._lastPresetSaveWarning = null;
        return ok !== false;
    }

    function deleteUserPreset(name) {
        if (!window.Settings || !name) return;
        window.Settings.deletePreset(name);
    }

    function renderUserPresets() {
        var list = $('userPresetsList');
        if (!list) return;
        var presets = getUserPresets();
        var names = Object.keys(presets).sort(function(a, b) {
            var ta = (presets[a] && presets[a].timestamp) || 0;
            var tb = (presets[b] && presets[b].timestamp) || 0;
            return tb - ta; // newest first
        });

        list.innerHTML = '';
        if (names.length === 0) {
            list.innerHTML = '<div style="text-align:center; opacity:0.4; font-size:10px; padding:8px 0;">No saved presets yet</div>';
            return;
        }

        names.forEach(function(name) {
            var row = document.createElement('div');
            row.className = 'user-preset-row';

            var btn = document.createElement('button');
            btn.className = 'user-preset-btn';
            btn.textContent = name;
            btn.title = 'Load "' + name + '"';
            btn.addEventListener('click', function() {
                var snapshot = presets[name];
                applyPresetSnapshot(snapshot);
                showPresetStatus('Loaded: ' + name, '#3fb950');
                // Highlight active
                list.querySelectorAll('.user-preset-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });

            var overwriteBtn = document.createElement('button');
            overwriteBtn.className = 'user-preset-overwrite';
            overwriteBtn.textContent = '\u21BB';
            overwriteBtn.title = 'Overwrite with current settings';
            overwriteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var snapshot = capturePresetSnapshot();
                if (snapshot) {
                    var saved = saveUserPreset(name, snapshot);
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                    if (saved && window._lastPresetSaveWarning) {
                        showPresetStatus('⚠️ ' + window._lastPresetSaveWarning, '#ffa500');
                    } else if (saved) {
                        showPresetStatus('Updated: ' + name, '#64b5f6');
                    } else {
                        showPresetStatus('Update failed — storage full', '#ff6b6b');
                    }
                }
            });

            var delBtn = document.createElement('button');
            delBtn.className = 'user-preset-delete';
            delBtn.textContent = '\u00D7';
            delBtn.title = 'Delete "' + name + '"';
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteUserPreset(name);
                if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                showPresetStatus('Deleted: ' + name, '#ff6b6b');
            });

            row.appendChild(btn);
            row.appendChild(overwriteBtn);
            row.appendChild(delBtn);
            list.appendChild(row);
        });
    }

    function showPresetStatus(msg, color) {
        var el = $('userPresetStatus');
        if (!el) return;
        el.textContent = msg;
        el.style.color = color || '#3fb950';
        el.style.display = 'block';
        clearTimeout(el._timer);
        el._timer = setTimeout(function() { el.style.display = 'none'; el.textContent = ''; }, 2000);
    }

    function setupUserPresets() {
        var saveBtn = $('saveAsPresetBtn');
        var nameRow = $('userPresetNameRow');
        var saveRow = $('userPresetSaveRow');
        var nameInput = $('userPresetNameInput');
        var confirmBtn = $('userPresetConfirmBtn');
        var cancelBtn = $('userPresetCancelBtn');

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (saveRow) saveRow.style.display = 'none';
                if (nameRow) nameRow.style.display = 'flex';
                if (nameInput) { nameInput.value = ''; nameInput.focus(); }
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                if (nameRow) nameRow.style.display = 'none';
                if (saveRow) saveRow.style.display = 'flex';
                if (nameInput) nameInput.value = '';
            });
        }

        function doSavePreset() {
            var name = (nameInput ? nameInput.value : '').trim();
            if (!name) {
                showPresetStatus('Name is required', '#ff6b6b');
                return;
            }
            // Check for duplicate
            var existing = getUserPresets();
            if (existing[name]) {
                showPresetStatus('Name already exists \u2014 use overwrite button', '#ff6b6b');
                return;
            }
            var snapshot = capturePresetSnapshot();
            if (!snapshot) {
                showPresetStatus('Could not capture settings', '#ff6b6b');
                return;
            }
            var saved = saveUserPreset(name, snapshot);
            if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
            if (saved && window._lastPresetSaveWarning) {
                showPresetStatus('⚠️ ' + window._lastPresetSaveWarning, '#ffa500');
            } else if (saved) {
                showPresetStatus('Saved: ' + name, '#3fb950');
            } else {
                showPresetStatus('Save failed — storage full', '#ff6b6b');
            }
            if (nameRow) nameRow.style.display = 'none';
            if (saveRow) saveRow.style.display = 'flex';
            if (nameInput) nameInput.value = '';
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', doSavePreset);
        }
        if (nameInput) {
            nameInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); doSavePreset(); }
                if (e.key === 'Escape') { e.preventDefault(); if (cancelBtn) cancelBtn.click(); }
            });
        }

        // Initial render
        renderUserPresets();

        // Expose for external use
        window.renderUserPresets = renderUserPresets;
        window.applyPresetSnapshot = applyPresetSnapshot;
        window.capturePresetSnapshot = capturePresetSnapshot;
        window.saveUserPreset = saveUserPreset;

        // Global helper: refresh ALL preset list UIs across the app (debounced to single frame)
        var _presetRefreshPending = 0;
        window.refreshAllPresetLists = function() {
            if (_presetRefreshPending) return; // already scheduled
            _presetRefreshPending = requestAnimationFrame(function() {
                _presetRefreshPending = 0;
                if (typeof window.renderUserPresets === 'function') window.renderUserPresets();
                if (typeof window.renderMixerUserPresets === 'function') window.renderMixerUserPresets();
                if (typeof window.renderSidebarPresets === 'function') window.renderSidebarPresets();
                if (typeof window.renderLayoutUserPresets === 'function') window.renderLayoutUserPresets();
            });
        };
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
    }

    function init() {
        if (!window.settingsManager) { setTimeout(init, 100); return; }
        ready(function() {
            setupSaveLoad();
            setupUserPresets();
        });
    }

    init();
})();
