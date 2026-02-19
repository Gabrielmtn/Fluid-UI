/**
 * Mixer Layout - Restructures the UI into an audio-mixer-inspired layout.
 * 
 * - Top mixer strip: channel faders for key controls
 * - Right sidebar: collapsible sections for grouped settings
 * - Canvas area: center
 * - Layers: right sidebar (always visible)
 * 
 * This script moves (not clones) existing DOM elements, so all
 * event listeners and ID references are preserved.
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        requestAnimationFrame(initMixerLayout);
    });

    function initMixerLayout() {
        const controls = document.querySelector('.controls');
        const canvasArea = document.getElementById('canvas-area');
        if (!controls || !canvasArea) return;

        const strip = buildMixerStrip(controls);
        const sidebar = buildSidebar(controls);

        // Create main-area wrapper
        const mainArea = document.createElement('div');
        mainArea.id = 'main-area';

        // Insert mixer strip before canvas-area
        canvasArea.parentNode.insertBefore(strip, canvasArea);

        // Insert main-area wrapper before canvas-area
        canvasArea.parentNode.insertBefore(mainArea, canvasArea);

        // Move canvas-area into main-area
        mainArea.appendChild(canvasArea);

        // Append sidebar to main-area
        mainArea.appendChild(sidebar);

        // Move any remaining dynamic content from .controls to sidebar
        // (e.g., battery manager UI, component system)
        const remaining = controls.querySelectorAll('.collapsible-section, #component-controls');
        remaining.forEach(function(el) {
            // Convert .collapsible-section to .sidebar-section format
            if (el.classList.contains('collapsible-section')) {
                el.classList.remove('collapsible-section');
                el.classList.add('sidebar-section');
                // Convert header
                var hdr = el.querySelector('.section-header, .collapsible-header');
                if (hdr) {
                    hdr.removeAttribute('onclick');
                    hdr.addEventListener('click', function() {
                        this.parentElement.classList.toggle('collapsed');
                    });
                    // Convert toggle icon to chevron
                    var toggle = hdr.querySelector('.section-toggle, .icon');
                    if (toggle) {
                        toggle.className = 'section-chevron';
                        toggle.textContent = '▾';
                    }
                }
                // Convert content to section-body
                var content = el.querySelector('.section-content, .collapsible-content');
                if (content) {
                    content.className = 'section-body';
                }
            }
            sidebar.appendChild(el);
        });

        // Hide old controls (CSS also hides it, but belt-and-suspenders)
        controls.style.display = 'none';

        // Periodic sync for brush size value (no native display span)
        const brushSlider = document.getElementById('brushSize');
        const brushDisplay = document.getElementById('mixer-brushValue');
        if (brushSlider && brushDisplay) {
            function syncBrush() {
                brushDisplay.textContent = parseFloat(brushSlider.value).toFixed(1);
            }
            brushSlider.addEventListener('input', syncBrush);
            setInterval(syncBrush, 300);
        }
    }

    // ─── MIXER STRIP ─────────────────────────────────────────────
    function buildMixerStrip(controls) {
        const strip = document.createElement('div');
        strip.id = 'mixer-strip';

        // Channel faders for key controls
        strip.appendChild(faderChannel('Brush', 'orange', 'brushSize', null, 'mixer-brushValue'));
        strip.appendChild(faderChannel('Curl', 'blue', 'curl', 'curlValue'));
        strip.appendChild(faderChannel('Viscosity', 'purple', 'sharpness', 'sharpnessValue'));
        strip.appendChild(faderChannel('Isolation', 'green', 'velocityInfluence', 'velocityInfluenceValue'));
        strip.appendChild(faderChannel('Multiply', 'yellow', 'multiplier', 'multiplierValue'));
        strip.appendChild(faderChannel('Density', 'cyan', 'densityDissipation', 'densityValue'));
        strip.appendChild(faderChannel('Velocity', 'cyan', 'velocityDissipation', 'velocityValue'));

        strip.appendChild(divider());

        // Color channel
        strip.appendChild(buildColorChannel());

        strip.appendChild(divider());

        // Quick actions
        strip.appendChild(buildActionsChannel(controls));

        strip.appendChild(divider());

        // Presets
        strip.appendChild(buildPresetsChannel(controls));

        return strip;
    }

    function faderChannel(label, accent, sliderId, existingValueId, newValueId) {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel';
        if (accent) ch.dataset.accent = accent;

        const lbl = document.createElement('div');
        lbl.className = 'ch-label';
        lbl.textContent = label;
        ch.appendChild(lbl);

        const slider = document.getElementById(sliderId);
        if (slider) {
            const fader = document.createElement('div');
            fader.className = 'ch-fader';
            fader.appendChild(slider);
            ch.appendChild(fader);
        }

        if (existingValueId) {
            const val = document.getElementById(existingValueId);
            if (val) {
                val.classList.add('ch-value');
                ch.appendChild(val);
            }
        } else {
            // Create new value display
            const val = document.createElement('div');
            val.className = 'ch-value';
            if (newValueId) val.id = newValueId;
            if (slider) val.textContent = fmtSlider(slider);
            ch.appendChild(val);
        }

        return ch;
    }

    function buildColorChannel() {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel ch-wide';
        ch.dataset.accent = 'pink';

        const lbl = document.createElement('div');
        lbl.className = 'ch-label';
        lbl.textContent = 'Color';
        ch.appendChild(lbl);

        const picker = document.getElementById('colorPicker');
        if (picker) {
            picker.className = 'ch-color-input';
            picker.style.cssText = '';
            ch.appendChild(picker);
        }

        // --- Toggle row (Random + Step) ---
        var toggleRow = document.createElement('div');
        toggleRow.className = 'ch-toggle-row';

        var rnd = document.getElementById('randomColor');
        var stepEl = document.getElementById('stepPalette');

        // Enforce mutual exclusivity on load (stale settings may have both checked)
        if (rnd && stepEl && rnd.checked && stepEl.checked) {
            stepEl.checked = false;
        }

        var rndBtn = null;
        var stepBtn = null;

        if (rnd) {
            rnd.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
            rndBtn = document.createElement('button');
            rndBtn.type = 'button';
            rndBtn.className = 'ch-text-toggle' + (rnd.checked ? ' active' : '');
            rndBtn.textContent = 'Rnd';
            ch.appendChild(rnd);
        }

        if (stepEl) {
            stepEl.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
            stepBtn = document.createElement('button');
            stepBtn.type = 'button';
            stepBtn.className = 'ch-text-toggle' + (stepEl.checked ? ' active' : '');
            stepBtn.textContent = 'Step';
            ch.appendChild(stepEl);
        }

        // Wire mutual exclusivity
        function syncToggles() {
            if (rndBtn) rndBtn.classList.toggle('active', rnd && rnd.checked);
            if (stepBtn) stepBtn.classList.toggle('active', stepEl && stepEl.checked);
        }

        if (rndBtn) {
            rndBtn.addEventListener('click', function () {
                var willCheck = !rnd.checked;
                rnd.checked = willCheck;
                if (willCheck && stepEl) { stepEl.checked = false; }
                rnd.dispatchEvent(new Event('change', { bubbles: true }));
                if (stepEl) stepEl.dispatchEvent(new Event('change', { bubbles: true }));
                syncToggles();
            });
            rnd.addEventListener('change', syncToggles);
            toggleRow.appendChild(rndBtn);
        }

        if (stepBtn) {
            stepBtn.addEventListener('click', function () {
                var willCheck = !stepEl.checked;
                stepEl.checked = willCheck;
                if (willCheck && rnd) { rnd.checked = false; }
                stepEl.dispatchEvent(new Event('change', { bubbles: true }));
                if (rnd) rnd.dispatchEvent(new Event('change', { bubbles: true }));
                syncToggles();
            });
            stepEl.addEventListener('change', syncToggles);
            toggleRow.appendChild(stepBtn);
        }

        ch.appendChild(toggleRow);

        return ch;
    }

    function buildActionsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-actions';

        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) { pauseBtn.style.cssText = ''; wrap.appendChild(pauseBtn); }

        const clearBtn = controls.querySelector('button[onclick*="clearCanvas"]');
        if (clearBtn) { clearBtn.style.cssText = ''; wrap.appendChild(clearBtn); }

        const freezeBtn = document.getElementById('freezeBtn');
        if (freezeBtn) { freezeBtn.style.cssText = ''; wrap.appendChild(freezeBtn); }

        return wrap;
    }

    function buildPresetsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-presets';

        // Move built-in preset buttons
        const presetsDiv = controls.querySelector('.presets');
        if (presetsDiv) {
            while (presetsDiv.firstChild) {
                wrap.appendChild(presetsDiv.firstChild);
            }
        }

        // Separator between built-in and user presets
        var sep = document.createElement('div');
        sep.className = 'preset-sep';
        wrap.appendChild(sep);

        // Container for dynamically rendered user presets
        var userWrap = document.createElement('div');
        userWrap.id = 'mixerUserPresets';
        userWrap.className = 'mixer-user-presets';
        wrap.appendChild(userWrap);

        // "+" save button
        var saveBtn = document.createElement('button');
        saveBtn.className = 'mixer-preset-save';
        saveBtn.textContent = '+';
        saveBtn.title = 'Save current settings as preset';
        wrap.appendChild(saveBtn);

        // Inline name input (hidden by default)
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'mixerPresetNameInput';
        nameInput.className = 'mixer-preset-name-input';
        nameInput.placeholder = 'Name...';
        nameInput.maxLength = 24;
        nameInput.spellcheck = false;
        nameInput.autocomplete = 'off';
        nameInput.style.display = 'none';
        wrap.appendChild(nameInput);

        // Wire save flow
        saveBtn.addEventListener('click', function() {
            if (nameInput.style.display === 'none') {
                nameInput.style.display = '';
                nameInput.value = '';
                nameInput.focus();
                saveBtn.textContent = '\u2713';
            } else {
                doSave();
            }
        });

        nameInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); doSave(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelSave(); }
        });

        nameInput.addEventListener('blur', function() {
            // Small delay so click on saveBtn registers first
            setTimeout(function() {
                if (nameInput.style.display !== 'none' && !nameInput.value.trim()) {
                    cancelSave();
                }
            }, 200);
        });

        function cancelSave() {
            nameInput.style.display = 'none';
            nameInput.value = '';
            saveBtn.textContent = '+';
        }

        function doSave() {
            var name = (nameInput.value || '').trim();
            if (!name) { cancelSave(); return; }
            if (!window.Settings) { cancelSave(); return; }
            var existing = window.Settings.getAllPresets();
            if (existing[name]) {
                nameInput.style.border = '1px solid #ff6b6b';
                nameInput.placeholder = 'Name exists!';
                nameInput.value = '';
                setTimeout(function() {
                    nameInput.style.border = '';
                    nameInput.placeholder = 'Name...';
                }, 1500);
                return;
            }
            var snapshot = typeof window.capturePresetSnapshot === 'function' ? window.capturePresetSnapshot() : null;
            if (!snapshot) { cancelSave(); return; }
            var ok = window.Settings.savePreset(name, snapshot);
            if (ok === false && snapshot.layers) {
                // Quota exceeded — retry without layer images
                var lite = JSON.parse(JSON.stringify(snapshot));
                if (lite.layers) lite.layers.forEach(function(l) { delete l.data; delete l.originalData; });
                lite._layersStripped = true;
                ok = window.Settings.savePreset(name, lite);
                if (ok === false) { delete lite.layers; delete lite.layerOrder; ok = window.Settings.savePreset(name, lite); }
                console.warn('Preset "' + name + '": saved without layer images (storage quota)');
            }
            cancelSave();
            if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
        }

        // Render user presets into mixer strip
        function renderMixerUserPresets() {
            if (!userWrap || !window.Settings) return;
            var presets = window.Settings.getAllPresets();
            var names = Object.keys(presets).sort(function(a, b) {
                return ((presets[b] && presets[b].timestamp) || 0) - ((presets[a] && presets[a].timestamp) || 0);
            });
            userWrap.innerHTML = '';
            names.forEach(function(name) {
                var btn = document.createElement('button');
                btn.className = 'mixer-user-preset-btn';
                btn.textContent = name;
                btn.title = 'Load "' + name + '"';
                btn.addEventListener('click', function() {
                    var snapshot = presets[name];
                    if (snapshot && typeof window.applyPresetSnapshot === 'function') {
                        window.applyPresetSnapshot(snapshot);
                    }
                    // Highlight
                    userWrap.querySelectorAll('.mixer-user-preset-btn').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    // Clear built-in active state
                    wrap.querySelectorAll('.presets button, button[onclick]').forEach(function(b) { b.classList.remove('active'); });
                });
                userWrap.appendChild(btn);
            });
        }

        // Initial render + expose for refresh
        setTimeout(renderMixerUserPresets, 500);
        window.renderMixerUserPresets = renderMixerUserPresets;

        return wrap;
    }

    // ─── SIDEBAR ─────────────────────────────────────────────────
    function buildSidebar(controls) {
        const sidebar = document.createElement('div');
        sidebar.id = 'sidebar-right';

        // Mobile close button (keep at top)
        moveEl('mobileMenuClose', sidebar);

        sidebar.appendChild(buildFocusSection());
        sidebar.appendChild(buildAudioReactiveSection());
        sidebar.appendChild(buildBrandingSection());
        sidebar.appendChild(buildLayersSection(controls));
        sidebar.appendChild(buildAnimationsSection(controls));
        sidebar.appendChild(buildBrushSection());
        sidebar.appendChild(buildKaleidoscopeSection(controls));
        sidebar.appendChild(buildSimulationSection());
        sidebar.appendChild(buildEffectsSection(controls));
        sidebar.appendChild(buildColorsSection(controls));
        sidebar.appendChild(buildDisplaySection(controls));
        sidebar.appendChild(buildRecordingSection());
        sidebar.appendChild(buildMultiArtistSection());
        sidebar.appendChild(buildSettingsSection(controls));

        return sidebar;
    }

    // --- Section builders ---

    function buildLayersSection(controls) {
        const { sec, body, header } = makeSection('📑 Layers', 'cyan', false);
        sec.classList.add('section-layers');

        // Action buttons in header
        const actions = document.createElement('div');
        actions.className = 'section-header-actions';
        const captureBtn = document.getElementById('captureBtn');
        if (captureBtn) { captureBtn.style.cssText = 'font-size:11px;padding:3px 8px;'; captureBtn.textContent = 'Capture Layer'; actions.appendChild(captureBtn); }
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) { uploadBtn.style.cssText = ''; uploadBtn.textContent = '📁'; actions.appendChild(uploadBtn); }

        // Collision layer button with source picker
        var collisionBtn = document.createElement('button');
        collisionBtn.type = 'button';
        collisionBtn.textContent = '🧱';
        collisionBtn.title = 'Add Collision Layer';
        collisionBtn.style.cssText = 'font-size:11px;padding:3px 6px;cursor:pointer;position:relative;';
        actions.appendChild(collisionBtn);

        var collisionMenu = document.createElement('div');
        collisionMenu.className = 'collision-source-menu';
        collisionMenu.style.display = 'none';
        collisionMenu.innerHTML =
            '<button type="button" data-src="webcam">📷 Webcam</button>' +
            '<button type="button" data-src="image">📁 Image</button>' +
            '<button type="button" data-src="snapshot">📸 Snapshot</button>';
        collisionBtn.appendChild(collisionMenu);

        var collisionFileInput = document.createElement('input');
        collisionFileInput.type = 'file';
        collisionFileInput.accept = 'image/png,image/jpeg,image/webp';
        collisionFileInput.style.display = 'none';
        body.appendChild(collisionFileInput);

        collisionBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            collisionMenu.style.display = collisionMenu.style.display === 'none' ? 'flex' : 'none';
        });

        collisionMenu.addEventListener('click', function (e) {
            e.stopPropagation();
            var src = e.target.dataset.src;
            if (!src) return;
            collisionMenu.style.display = 'none';

            if (src === 'webcam' && window.collisionLayers) {
                window.collisionLayers.createFromWebcam();
            } else if (src === 'image') {
                collisionFileInput.click();
            } else if (src === 'snapshot' && window.collisionLayers) {
                window.collisionLayers.createFromSnapshot();
            }
        });

        collisionFileInput.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (file && window.collisionLayers) {
                window.collisionLayers.createFromImage(file);
            }
            collisionFileInput.value = '';
        });

        // Close menu on outside click
        document.addEventListener('click', function () { collisionMenu.style.display = 'none'; });

        const chevron = header.querySelector('.section-chevron');
        header.insertBefore(actions, chevron);

        // Prevent action button clicks from toggling section collapse
        actions.addEventListener('click', function(e) { e.stopPropagation(); });

        moveEl('layersPanel', body);

        // Layer-related checkboxes
        moveCheckboxGroup('hoverCaptureToggle', body);
        moveCheckboxGroup('detachCaptureToggle', body);
        moveEl('imageUpload', body);

        const preview = document.getElementById('previewToggle');
        if (preview) {
            preview.style.display = 'none';
            var previewCb = document.createElement('div');
            previewCb.className = 'control-group';
            previewCb.innerHTML = '<label class="checkbox-label"><input type="checkbox" id="showPreviewLayersCb"> Show Preview Layers</label>';
            body.appendChild(previewCb);
            body.appendChild(preview);
            var cb = previewCb.querySelector('input');
            cb.addEventListener('change', function () {
                preview.style.display = cb.checked ? '' : 'none';
            });
        }

        return sec;
    }

    function buildAnimationsSection(controls) {
        const { sec, body } = makeSection('🎬 Animations', 'orange', true);

        const grid = document.createElement('div');
        grid.className = 'anim-grid';

        moveEl('smashBtn', grid);
        moveEl('jellyfishBtn', grid);

        const portraitBtn = controls.querySelector('button[onclick*="playPortraitAnimation"]');
        if (portraitBtn) { portraitBtn.style.cssText = ''; grid.appendChild(portraitBtn); }

        moveEl('vortexBtn', grid);
        moveEl('portalBtn', grid);

        body.appendChild(grid);

        // Toggle animations (full-width, with collapsible settings)
        moveEl('ascendToggleWrap', body);
        moveEl('shootingStarWrap', body);

        return sec;
    }

    function buildKaleidoscopeSection(controls) {
        const { sec, body } = makeSection('🔮 Kaleidoscope', 'purple', true);

        moveCheckboxGroup('kaleidoToggle', body);

        // Move contents from kaleidoscope panel
        const panel = document.getElementById('kaleidoPanel');
        if (panel) {
            while (panel.firstChild) {
                body.appendChild(panel.firstChild);
            }
        }

        return sec;
    }

    function buildSimulationSection() {
        const { sec, body } = makeSection('⚙️ Simulation', 'blue', true);

        moveControlGroup('visualResolution', body);
        moveControlGroup('physicsResolution', body);
        moveControlGroup('fpsCap', body);
        moveControlGroup('pressureDissipation', body);
        moveControlGroup('pressureIteration', body);
        moveCheckboxGroup('turbulenceMode', body);

        return sec;
    }

    function buildEffectsSection(controls) {
        const { sec, body } = makeSection('💡 Effects', 'yellow', true);

        moveCheckboxGroup('enableLighting', body);
        const lightControls = document.getElementById('lightSourceControls');
        if (lightControls) body.appendChild(lightControls);

        moveCheckboxGroup('enableLightShift', body);
        const shiftControls = document.getElementById('lightShiftControls');
        if (shiftControls) body.appendChild(shiftControls);

        // Micro Detail toggle + panel
        moveCheckboxGroup('microDetailToggle', body);
        const microDetailPanel = document.getElementById('microDetailPanel');
        if (microDetailPanel) body.appendChild(microDetailPanel);

        return sec;
    }

    function buildColorsSection(controls) {
        const { sec, body } = makeSection('🎨 Colors & Palettes', 'pink', true);

        // Color action buttons (Save / Clear)
        const colorActions = controls.querySelector('.color-actions');
        if (colorActions) body.appendChild(colorActions);

        // Saved colors swatch area
        moveEl('savedColors', body);

        // Step palette checkbox
        moveCheckboxGroup('stepPalette', body);

        // Palette management container
        const paletteCarousel = document.getElementById('paletteCarousel');
        if (paletteCarousel) {
            // Walk up to find the wrapper div
            let container = paletteCarousel.parentElement;
            if (container) body.appendChild(container);
        }

        return sec;
    }

    function buildDisplaySection(controls) {
        const { sec, body } = makeSection('🖼️ Display', 'green', true);

        // Move background color group (contains color picker + transparent toggle)
        const bgPicker = document.getElementById('backgroundColorPicker');
        if (bgPicker) {
            const group = bgPicker.closest('.control-group');
            if (group) { group.style.cssText = ''; body.appendChild(group); }
        }

        // Canvas opacity
        moveControlGroup('canvasOpacity', body);

        // Preserve fluid opacity
        moveCheckboxGroup('preserveFluidOpacity', body);

        // Background transparency
        moveControlGroup('captureDimming', body);

        // Toggles
        moveCheckboxGroup('cursorToggle', body);
        moveCheckboxGroup('showCanvasHandles', body);
        moveCheckboxGroup('lockCanvasBorders', body);

        return sec;
    }

    function buildBrushSection() {
        const { sec, body } = makeSection('🖌️ Brush', 'orange', true);

        // --- Replay Mode ---
        var modeLabel = document.createElement('label');
        modeLabel.className = 'brush-section-label';
        modeLabel.textContent = 'Replay Mode';
        body.appendChild(modeLabel);

        var modeRow = document.createElement('div');
        modeRow.className = 'brush-mode-row';

        var strokeBtn = document.createElement('button');
        strokeBtn.type = 'button';
        strokeBtn.className = 'brush-mode-btn active';
        strokeBtn.textContent = 'Stroke';
        strokeBtn.dataset.mode = 'stroke';

        var timeBtn = document.createElement('button');
        timeBtn.type = 'button';
        timeBtn.className = 'brush-mode-btn';
        timeBtn.textContent = 'Time';
        timeBtn.dataset.mode = 'time';

        modeRow.appendChild(strokeBtn);
        modeRow.appendChild(timeBtn);
        body.appendChild(modeRow);

        // --- Time period input (visible only in time mode) ---
        var timeGroup = document.createElement('div');
        timeGroup.className = 'brush-time-group';
        timeGroup.style.display = 'none';

        var timeLbl = document.createElement('label');
        timeLbl.className = 'brush-section-label';
        timeLbl.textContent = 'Replay Period';

        var timeInputWrap = document.createElement('div');
        timeInputWrap.className = 'brush-time-input-wrap';

        var timeInput = document.createElement('input');
        timeInput.type = 'number';
        timeInput.id = 'replayTimePeriod';
        timeInput.min = '1';
        timeInput.max = '60';
        timeInput.value = '5';
        timeInput.step = '1';

        var timeSuffix = document.createElement('span');
        timeSuffix.className = 'brush-time-suffix';
        timeSuffix.textContent = 'sec';

        timeInputWrap.appendChild(timeInput);
        timeInputWrap.appendChild(timeSuffix);
        timeGroup.appendChild(timeLbl);
        timeGroup.appendChild(timeInputWrap);
        body.appendChild(timeGroup);

        // --- Brush Refresh Rate ---
        var rateGroup = document.createElement('div');
        rateGroup.className = 'control-group';

        var rateLbl = document.createElement('label');
        rateLbl.setAttribute('for', 'brushRefreshRate');
        rateLbl.innerHTML = 'Splat Rate <span class="value-display" id="brushRefreshRateValue">0</span>';

        var rateSlider = document.createElement('input');
        rateSlider.type = 'range';
        rateSlider.id = 'brushRefreshRate';
        rateSlider.min = '0';
        rateSlider.max = '100';
        rateSlider.value = '0';
        rateSlider.step = '1';

        rateGroup.appendChild(rateLbl);
        rateGroup.appendChild(rateSlider);
        body.appendChild(rateGroup);

        // --- Splat In ---
        var splatInLabel = document.createElement('label');
        splatInLabel.className = 'brush-section-label';
        splatInLabel.textContent = 'Splat In';
        body.appendChild(splatInLabel);

        var splatInSelect = document.createElement('select');
        splatInSelect.id = 'splatInMode';
        splatInSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,200,100,0.3);color:white;border-radius:4px;margin-bottom:6px;';
        [['instant','Instant'],['linear','Linear'],['easing','Easing']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0]; o.textContent = opt[1];
            splatInSelect.appendChild(o);
        });
        body.appendChild(splatInSelect);

        // --- Splat Out ---
        var splatOutLabel = document.createElement('label');
        splatOutLabel.className = 'brush-section-label';
        splatOutLabel.textContent = 'Splat Out';
        body.appendChild(splatOutLabel);

        var splatOutSelect = document.createElement('select');
        splatOutSelect.id = 'splatOutMode';
        splatOutSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,200,100,0.3);color:white;border-radius:4px;margin-bottom:6px;';
        [['instant','Instant'],['linear','Linear'],['easing','Easing']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0]; o.textContent = opt[1];
            splatOutSelect.appendChild(o);
        });
        body.appendChild(splatOutSelect);

        // --- Wire splat in/out ---
        splatInSelect.addEventListener('change', function() {
            window.splatInMode = splatInSelect.value;
            try { if (window.settingsManager) window.settingsManager.set('brush.splatInMode', splatInSelect.value); } catch(_) {}
        });
        splatOutSelect.addEventListener('change', function() {
            window.splatOutMode = splatOutSelect.value;
            try { if (window.settingsManager) window.settingsManager.set('brush.splatOutMode', splatOutSelect.value); } catch(_) {}
        });

        // --- Wire mode toggle ---
        function setMode(mode) {
            window.replayMode = mode;
            strokeBtn.classList.toggle('active', mode === 'stroke');
            timeBtn.classList.toggle('active', mode === 'time');
            timeGroup.style.display = mode === 'time' ? '' : 'none';
            try {
                if (window.settingsManager) window.settingsManager.set('brush.replayMode', mode);
            } catch (_) {}
        }

        strokeBtn.addEventListener('click', function () { setMode('stroke'); });
        timeBtn.addEventListener('click', function () { setMode('time'); });

        // --- Wire time period ---
        timeInput.addEventListener('change', function () {
            var v = Math.max(1, Math.min(60, parseInt(timeInput.value, 10) || 5));
            timeInput.value = v;
            window.replayTimePeriod = v;
            try {
                if (window.settingsManager) window.settingsManager.set('brush.replayTimePeriod', v);
            } catch (_) {}
        });

        // --- Wire refresh rate ---
        var rateDisplay = rateLbl.querySelector('.value-display');
        rateSlider.addEventListener('input', function () {
            var v = parseInt(rateSlider.value, 10);
            if (rateDisplay) rateDisplay.textContent = v === 0 ? '0' : v + 'ms';
            window.brushRefreshRate = v;
            try {
                if (window.settingsManager) window.settingsManager.set('brush.refreshRate', v);
            } catch (_) {}
        });

        // --- Load saved settings ---
        try {
            if (window.settingsManager) {
                var savedMode = window.settingsManager.get('brush.replayMode');
                if (savedMode === 'time') setMode('time'); else setMode('stroke');

                var savedPeriod = window.settingsManager.get('brush.replayTimePeriod');
                if (typeof savedPeriod === 'number' && savedPeriod >= 1) {
                    timeInput.value = savedPeriod;
                    window.replayTimePeriod = savedPeriod;
                }

                var savedRate = window.settingsManager.get('brush.refreshRate');
                if (typeof savedRate === 'number') {
                    rateSlider.value = savedRate;
                    if (rateDisplay) rateDisplay.textContent = savedRate === 0 ? '0' : savedRate + 'ms';
                    window.brushRefreshRate = savedRate;
                }

                var savedSplatIn = window.settingsManager.get('brush.splatInMode');
                if (savedSplatIn) {
                    splatInSelect.value = savedSplatIn;
                    window.splatInMode = savedSplatIn;
                }
                var savedSplatOut = window.settingsManager.get('brush.splatOutMode');
                if (savedSplatOut) {
                    splatOutSelect.value = savedSplatOut;
                    window.splatOutMode = savedSplatOut;
                }
            }
        } catch (_) {}

        // Defaults
        if (!window.replayMode) window.replayMode = 'stroke';
        if (!window.replayTimePeriod) window.replayTimePeriod = 5;
        if (window.brushRefreshRate == null) window.brushRefreshRate = 0;
        if (!window.splatInMode) window.splatInMode = 'instant';
        if (!window.splatOutMode) window.splatOutMode = 'instant';

        return sec;
    }

    function buildBrandingSection() {
        const { sec, body } = makeSection('\ud83c\udfa8 Branding', 'pink', true);

        // --- Add Text Overlay ---
        var textLabel = document.createElement('label');
        textLabel.className = 'brush-section-label';
        textLabel.textContent = 'Text Overlay';
        body.appendChild(textLabel);

        var textRow = document.createElement('div');
        textRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.id = 'brandingTextInput';
        textInput.placeholder = '@yourhandle';
        textInput.style.cssText = 'flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;padding:4px 6px;border-radius:3px;font-size:11px;';
        var textAddBtn = document.createElement('button');
        textAddBtn.type = 'button';
        textAddBtn.textContent = '+ Add';
        textAddBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:3px;background:rgba(255,130,170,0.2);border:1px solid rgba(255,130,170,0.3);color:white;cursor:pointer;';
        textRow.appendChild(textInput);
        textRow.appendChild(textAddBtn);
        body.appendChild(textRow);

        // Text options row
        var textOptsRow = document.createElement('div');
        textOptsRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:8px;';

        var colorPick = document.createElement('input');
        colorPick.type = 'color';
        colorPick.value = '#ffffff';
        colorPick.id = 'brandingTextColor';
        colorPick.style.cssText = 'width:28px;height:24px;border:none;padding:0;cursor:pointer;background:transparent;';

        var posSelect = document.createElement('select');
        posSelect.id = 'brandingTextPos';
        posSelect.style.cssText = 'flex:1;height:24px;font-size:10px;';
        var posOpts = [
            ['BL', '\u2199 Bottom-Left'], ['BC', '\u2b07 Bottom-Center'], ['BR', '\u2198 Bottom-Right'],
            ['TL', '\u2196 Top-Left'], ['TC', '\u2b06 Top-Center'], ['TR', '\u2197 Top-Right'],
            ['ML', '\u2b05 Mid-Left'], ['MC', '\u2b24 Center'], ['MR', '\u27a1 Mid-Right']
        ];
        posOpts.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p[0];
            opt.textContent = p[1];
            posSelect.appendChild(opt);
        });

        var sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.id = 'brandingTextSize';
        sizeInput.value = '20';
        sizeInput.min = '8';
        sizeInput.max = '72';
        sizeInput.style.cssText = 'width:40px;height:24px;font-size:10px;text-align:center;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:3px;';

        textOptsRow.appendChild(colorPick);
        textOptsRow.appendChild(posSelect);
        textOptsRow.appendChild(sizeInput);
        body.appendChild(textOptsRow);

        // --- Quick Text Presets ---
        var quickRow = document.createElement('div');
        quickRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:10px;';
        var presets = ['\ud83d\udd34 LIVE', 'Follow me!', 'Link in bio', '\u2764\ufe0f + \ud83d\udc4d'];
        presets.forEach(function (text) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = text;
            btn.style.cssText = 'padding:2px 6px;font-size:9px;border-radius:3px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);cursor:pointer;';
            btn.addEventListener('click', function () {
                textInput.value = text;
            });
            quickRow.appendChild(btn);
        });
        body.appendChild(quickRow);

        // --- Image Overlay ---
        var imgLabel = document.createElement('label');
        imgLabel.className = 'brush-section-label';
        imgLabel.textContent = 'Logo / Image';
        body.appendChild(imgLabel);

        var imgRow = document.createElement('div');
        imgRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';

        var imgUploadBtn = document.createElement('button');
        imgUploadBtn.type = 'button';
        imgUploadBtn.textContent = '\ud83d\udcce Upload Logo';
        imgUploadBtn.style.cssText = 'flex:1;padding:5px 8px;font-size:10px;border-radius:3px;background:rgba(255,200,100,0.15);border:1px solid rgba(255,200,100,0.2);color:white;cursor:pointer;';

        var imgFileInput = document.createElement('input');
        imgFileInput.type = 'file';
        imgFileInput.accept = 'image/png,image/svg+xml,image/jpeg';
        imgFileInput.style.display = 'none';

        var imgPosSelect = document.createElement('select');
        imgPosSelect.style.cssText = 'width:80px;height:28px;font-size:10px;';
        posOpts.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p[0];
            opt.textContent = p[1];
            if (p[0] === 'BR') opt.selected = true;
            imgPosSelect.appendChild(opt);
        });

        imgRow.appendChild(imgUploadBtn);
        imgRow.appendChild(imgPosSelect);
        body.appendChild(imgRow);

        // --- QR Code ---
        var qrLabel = document.createElement('label');
        qrLabel.className = 'brush-section-label';
        qrLabel.textContent = 'QR Code';
        body.appendChild(qrLabel);

        var qrRow = document.createElement('div');
        qrRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
        var qrInput = document.createElement('input');
        qrInput.type = 'text';
        qrInput.placeholder = 'https://tiktok.com/@handle';
        qrInput.style.cssText = 'flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;padding:4px 6px;border-radius:3px;font-size:10px;';
        var qrAddBtn = document.createElement('button');
        qrAddBtn.type = 'button';
        qrAddBtn.textContent = '+ QR';
        qrAddBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:3px;background:rgba(180,130,255,0.2);border:1px solid rgba(180,130,255,0.3);color:white;cursor:pointer;';
        qrRow.appendChild(qrInput);
        qrRow.appendChild(qrAddBtn);
        body.appendChild(qrRow);

        // --- Active Overlays List ---
        var listLabel = document.createElement('label');
        listLabel.className = 'brush-section-label';
        listLabel.textContent = 'Active Overlays';
        listLabel.style.marginTop = '8px';
        body.appendChild(listLabel);

        var overlayList = document.createElement('div');
        overlayList.id = 'brandingOverlayList';
        overlayList.style.cssText = 'max-height:120px;overflow-y:auto;';
        body.appendChild(overlayList);

        // Clear all button
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = '\ud83d\uddd1 Clear All';
        clearBtn.style.cssText = 'width:100%;margin-top:6px;padding:4px;font-size:10px;border-radius:3px;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.2);color:rgba(255,255,255,0.6);cursor:pointer;';
        body.appendChild(clearBtn);

        // --- Render overlay list ---
        function refreshList() {
            overlayList.innerHTML = '';
            if (!window.brandingOverlays) return;
            var all = window.brandingOverlays.getAll();
            if (all.length === 0) {
                overlayList.innerHTML = '<div style="font-size:9px;color:rgba(255,255,255,0.3);text-align:center;padding:8px;">No overlays yet</div>';
                return;
            }
            all.forEach(function (ov) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);';

                var icon = ov.type === 'text' ? '\u2709' : ov.type === 'image' ? '\ud83d\uddbc' : '\ud83d\udcf1';
                var desc = ov.type === 'text' ? ov.content : ov.type === 'image' ? 'Logo' : ov.url;

                var label = document.createElement('span');
                label.style.cssText = 'flex:1;font-size:10px;color:rgba(255,255,255,0.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                label.textContent = icon + ' ' + desc;

                var toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.textContent = ov.visible ? '\ud83d\udc41' : '\ud83d\ude48';
                toggleBtn.style.cssText = 'padding:1px 4px;font-size:11px;background:none;border:none;cursor:pointer;color:white;';
                toggleBtn.title = 'Toggle visibility';
                toggleBtn.addEventListener('click', function () {
                    window.brandingOverlays.toggle(ov.id);
                    refreshList();
                });

                var rmBtn = document.createElement('button');
                rmBtn.type = 'button';
                rmBtn.textContent = '\u00d7';
                rmBtn.style.cssText = 'padding:1px 5px;font-size:13px;background:none;border:none;cursor:pointer;color:rgba(255,80,80,0.7);font-weight:bold;';
                rmBtn.title = 'Remove';
                rmBtn.addEventListener('click', function () {
                    window.brandingOverlays.remove(ov.id);
                    refreshList();
                });

                row.appendChild(label);
                row.appendChild(toggleBtn);
                row.appendChild(rmBtn);
                overlayList.appendChild(row);
            });
        }

        // Hook for external refresh
        window._brandingOverlayListChanged = refreshList;

        // --- Wire events ---
        textAddBtn.addEventListener('click', function () {
            var text = textInput.value.trim();
            if (!text) { textInput.focus(); return; }
            if (window.brandingOverlays) {
                window.brandingOverlays.addText({
                    content: text,
                    position: posSelect.value,
                    color: colorPick.value,
                    fontSize: parseInt(sizeInput.value, 10) || 20
                });
                refreshList();
            }
        });

        textInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') textAddBtn.click();
            e.stopPropagation(); // prevent hotkeys while typing
        });

        imgUploadBtn.addEventListener('click', function () { imgFileInput.click(); });
        imgFileInput.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                if (window.brandingOverlays) {
                    window.brandingOverlays.addImage({
                        src: ev.target.result,
                        position: imgPosSelect.value
                    });
                    refreshList();
                }
            };
            reader.readAsDataURL(file);
            imgFileInput.value = '';
        });

        qrAddBtn.addEventListener('click', function () {
            var url = qrInput.value.trim();
            if (!url) { qrInput.focus(); return; }
            if (window.brandingOverlays) {
                window.brandingOverlays.addQR({ url: url });
                refreshList();
            }
        });

        qrInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') qrAddBtn.click();
            e.stopPropagation();
        });

        clearBtn.addEventListener('click', function () {
            if (window.brandingOverlays) {
                window.brandingOverlays.clearAll();
                refreshList();
            }
        });

        // Initial list render after a frame
        requestAnimationFrame(refreshList);

        return sec;
    }

    function buildAudioReactiveSection() {
        const { sec, body } = makeSection('\ud83c\udfb5 Audio React', 'purple', true);

        // Enable toggle
        var enableGroup = document.createElement('div');
        enableGroup.className = 'control-group checkbox-group';
        var enableCb = document.createElement('input');
        enableCb.type = 'checkbox';
        enableCb.id = 'audioReactToggle';
        var enableLbl = document.createElement('label');
        enableLbl.setAttribute('for', 'audioReactToggle');
        enableLbl.style.margin = '0';
        enableLbl.textContent = 'Enable Audio Reactivity';
        enableGroup.appendChild(enableCb);
        enableGroup.appendChild(enableLbl);
        body.appendChild(enableGroup);

        // Source selector
        var srcGroup = document.createElement('div');
        srcGroup.className = 'control-group';
        srcGroup.style.marginTop = '6px';
        var srcLbl = document.createElement('label');
        srcLbl.textContent = 'Audio Source';
        srcLbl.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:0.4px;opacity:0.7;margin-bottom:4px;display:block';
        var srcSel = document.createElement('select');
        srcSel.id = 'audioReactSource';
        srcSel.innerHTML = '<option value="mic">Microphone</option><option value="system">System Audio</option><option value="file">Audio File</option>';
        srcGroup.appendChild(srcLbl);
        srcGroup.appendChild(srcSel);
        body.appendChild(srcGroup);

        // Hidden file input
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.style.display = 'none';
        fileInput.id = 'audioReactFile';
        body.appendChild(fileInput);

        // Visualizer canvas
        var vizWrap = document.createElement('div');
        vizWrap.style.cssText = 'margin:8px 0;border-radius:4px;overflow:hidden;background:rgba(0,0,0,0.3);';
        var vizCanvas = document.createElement('canvas');
        vizCanvas.id = 'audioReactViz';
        vizCanvas.style.cssText = 'width:100%;height:48px;display:block;';
        vizWrap.appendChild(vizCanvas);
        body.appendChild(vizWrap);

        // Sensitivity slider
        var sensGroup = document.createElement('div');
        sensGroup.className = 'control-group';
        var sensLbl = document.createElement('label');
        sensLbl.setAttribute('for', 'audioSensitivity');
        sensLbl.innerHTML = 'Sensitivity <span class="value-display" id="audioSensValue">1.5</span>';
        var sensSlider = document.createElement('input');
        sensSlider.type = 'range';
        sensSlider.id = 'audioSensitivity';
        sensSlider.min = '0.1';
        sensSlider.max = '3.0';
        sensSlider.step = '0.1';
        sensSlider.value = '1.5';
        sensGroup.appendChild(sensLbl);
        sensGroup.appendChild(sensSlider);
        body.appendChild(sensGroup);

        // Beat threshold slider
        var beatGroup = document.createElement('div');
        beatGroup.className = 'control-group';
        var beatLbl = document.createElement('label');
        beatLbl.setAttribute('for', 'audioBeatThreshold');
        beatLbl.innerHTML = 'Beat Threshold <span class="value-display" id="audioBeatValue">0.65</span>';
        var beatSlider = document.createElement('input');
        beatSlider.type = 'range';
        beatSlider.id = 'audioBeatThreshold';
        beatSlider.min = '0.1';
        beatSlider.max = '1.0';
        beatSlider.step = '0.05';
        beatSlider.value = '0.65';
        beatGroup.appendChild(beatLbl);
        beatGroup.appendChild(beatSlider);
        body.appendChild(beatGroup);

        // Mapping toggles label
        var mapLabel = document.createElement('label');
        mapLabel.className = 'brush-section-label';
        mapLabel.textContent = 'Mappings';
        mapLabel.style.marginTop = '8px';
        body.appendChild(mapLabel);

        // Mapping checkboxes
        var mappings = [
            { id: 'arMapAutoSplat', label: 'Bass \u2192 Auto Splat', key: 'bassAutoSplat', def: true },
            { id: 'arMapSize', label: 'Energy \u2192 Brush Size', key: 'overallToSize', def: true },
            { id: 'arMapKaleido', label: 'Mid \u2192 Kaleido Rotation', key: 'midToKaleido', def: true },
            { id: 'arMapColor', label: 'Treble \u2192 Color Cycle', key: 'trebleToColor', def: true }
        ];

        mappings.forEach(function (m) {
            var g = document.createElement('div');
            g.className = 'control-group checkbox-group';
            g.style.marginTop = '3px';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = m.id;
            cb.checked = m.def;
            var lbl = document.createElement('label');
            lbl.setAttribute('for', m.id);
            lbl.style.cssText = 'margin:0;font-size:10px';
            lbl.textContent = m.label;
            g.appendChild(cb);
            g.appendChild(lbl);
            body.appendChild(g);

            cb.addEventListener('change', function () {
                if (window.audioReactive) window.audioReactive.setMapping(m.key, cb.checked);
            });
        });

        // Auto-splat mode
        var splatModeGroup = document.createElement('div');
        splatModeGroup.className = 'control-group';
        splatModeGroup.style.marginTop = '8px';
        var splatModeLbl = document.createElement('label');
        splatModeLbl.textContent = 'Auto-Splat Position';
        splatModeLbl.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:0.4px;opacity:0.7;margin-bottom:4px;display:block';
        var splatModeSel = document.createElement('select');
        splatModeSel.id = 'audioAutoSplatMode';
        splatModeSel.innerHTML = '<option value="center">Center</option><option value="random">Random</option><option value="circular">Circular</option>';
        splatModeGroup.appendChild(splatModeLbl);
        splatModeGroup.appendChild(splatModeSel);
        body.appendChild(splatModeGroup);

        // ─── Wire events ───
        enableCb.addEventListener('change', function () {
            if (!window.audioReactive) return;
            if (enableCb.checked) {
                var src = srcSel.value;
                if (src === 'file') {
                    fileInput.click();
                } else {
                    window.audioReactive.enable(src);
                }
            } else {
                window.audioReactive.disable();
            }
        });

        fileInput.addEventListener('change', function (e) {
            var f = e.target.files && e.target.files[0];
            if (f && window.audioReactive) {
                window.audioReactive.enable('file', f);
            } else {
                enableCb.checked = false;
            }
            fileInput.value = '';
        });

        srcSel.addEventListener('change', function () {
            // If already enabled, restart with new source
            if (enableCb.checked && window.audioReactive) {
                window.audioReactive.disable();
                var src = srcSel.value;
                if (src === 'file') {
                    fileInput.click();
                } else {
                    window.audioReactive.enable(src);
                }
            }
        });

        sensSlider.addEventListener('input', function () {
            var v = parseFloat(sensSlider.value);
            document.getElementById('audioSensValue').textContent = v.toFixed(1);
            if (window.audioReactive) window.audioReactive.setSensitivity(v);
        });

        beatSlider.addEventListener('input', function () {
            var v = parseFloat(beatSlider.value);
            document.getElementById('audioBeatValue').textContent = v.toFixed(2);
            if (window.audioReactive) window.audioReactive.setBeatThreshold(v);
        });

        splatModeSel.addEventListener('change', function () {
            if (window.audioReactive) window.audioReactive.setAutoSplatMode(splatModeSel.value);
        });

        // Register visualizer canvas after a frame (needs dimensions)
        requestAnimationFrame(function () {
            if (window.audioReactive) window.audioReactive.registerViz(vizCanvas);
        });

        return sec;
    }

    function buildFocusSection() {
        const { sec, body } = makeSection('🎯 Focus', 'cyan', false);

        // Focus Mode toggle
        var focusGroup = document.createElement('div');
        focusGroup.className = 'control-group checkbox-group';
        var focusCb = document.createElement('input');
        focusCb.type = 'checkbox';
        focusCb.id = 'focusModeToggle';
        var focusLbl = document.createElement('label');
        focusLbl.setAttribute('for', 'focusModeToggle');
        focusLbl.style.margin = '0';
        focusLbl.textContent = 'Focus Mode (S)';
        focusGroup.appendChild(focusCb);
        focusGroup.appendChild(focusLbl);
        body.appendChild(focusGroup);

        focusCb.addEventListener('change', function () {
            if (window.focusMode && window.focusMode.isActive() !== focusCb.checked) {
                window.focusMode.toggle();
            }
        });

        // Format Presets
        var fmtLabel = document.createElement('label');
        fmtLabel.className = 'brush-section-label';
        fmtLabel.textContent = 'Format';
        fmtLabel.style.marginTop = '8px';
        body.appendChild(fmtLabel);

        var fmtGrid = document.createElement('div');
        fmtGrid.className = 'stream-format-grid';

        var formats = (window.focusMode && window.focusMode.FORMATS) || [];
        var btns = [];

        for (var i = 0; i < formats.length; i++) {
            (function (fmt) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = fmt.label;
                btn.dataset.formatId = fmt.id;
                btn.addEventListener('click', function () {
                    if (btn.classList.contains('active')) {
                        if (window.focusMode) window.focusMode.clearFormat();
                    } else {
                        if (window.focusMode) window.focusMode.applyFormat(fmt);
                    }
                });
                fmtGrid.appendChild(btn);
                btns.push(btn);
            })(formats[i]);
        }

        body.appendChild(fmtGrid);

        // Format info display
        var fmtInfo = document.createElement('div');
        fmtInfo.className = 'stream-format-info';
        fmtInfo.textContent = 'Freeform';
        body.appendChild(fmtInfo);

        // Lock format checkbox
        var lockGroup = document.createElement('div');
        lockGroup.className = 'control-group checkbox-group';
        lockGroup.style.marginTop = '6px';
        var lockCb = document.createElement('input');
        lockCb.type = 'checkbox';
        lockCb.id = 'streamFormatLock';
        var lockLbl = document.createElement('label');
        lockLbl.setAttribute('for', 'streamFormatLock');
        lockLbl.style.margin = '0';
        lockLbl.textContent = 'Lock Format';
        lockGroup.appendChild(lockCb);
        lockGroup.appendChild(lockLbl);
        body.appendChild(lockGroup);

        // Register with focus mode API
        if (window.focusMode) {
            window.focusMode.registerFormatButtons(btns);
            window.focusMode.registerFormatInfo(fmtInfo);
            window.focusMode.registerLockCheckbox(lockCb);
        }

        return sec;
    }

    function buildRecordingSection() {
        const { sec, body } = makeSection('🎙️ Recording', 'orange', true);

        moveControlGroup('recMode', body);
        moveEl('recMini', body);

        return sec;
    }

    function buildMultiArtistSection() {
        const { sec, body } = makeSection('🌐 Multi Artist', 'blue', true);

        // Move the new multi artist panel
        var panel = document.getElementById('multiArtistPanel');
        if (panel) body.appendChild(panel);

        // Move hidden toggle for legacy compat
        var toggle = document.getElementById('multiplayerToggle');
        if (toggle) body.appendChild(toggle);

        return sec;
    }

    function buildSettingsSection(controls) {
        const { sec, body } = makeSection('💾 Settings', null, true);

        // Settings save/load/clear
        const saveBtn = document.getElementById('saveSettingsBtn');
        if (saveBtn) {
            const group = saveBtn.closest('.control-group');
            if (group) { group.style.cssText = ''; body.appendChild(group); }
        }

        // Stats toggle
        moveCheckboxGroup('statsToggle', body);

        // ── User Presets Management ──
        var presetSection = document.createElement('div');
        presetSection.style.cssText = 'margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);';

        var presetLabel = document.createElement('label');
        presetLabel.style.cssText = 'display:block; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.5); margin-bottom:6px;';
        presetLabel.textContent = 'Saved Presets';
        presetSection.appendChild(presetLabel);

        var presetList = document.createElement('div');
        presetList.id = 'sidebarPresetList';
        presetList.className = 'user-presets-list';
        presetSection.appendChild(presetList);

        body.appendChild(presetSection);

        // Render function
        function renderSidebarPresets() {
            if (!presetList || !window.Settings) return;
            var presets = window.Settings.getAllPresets();
            var names = Object.keys(presets).sort(function(a, b) {
                return ((presets[b] && presets[b].timestamp) || 0) - ((presets[a] && presets[a].timestamp) || 0);
            });
            presetList.innerHTML = '';
            if (names.length === 0) {
                presetList.innerHTML = '<div style="text-align:center; opacity:0.4; font-size:10px; padding:6px 0;">Use + in the top bar to save presets</div>';
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
                    if (typeof window.applyPresetSnapshot === 'function') {
                        window.applyPresetSnapshot(presets[name]);
                    }
                    presetList.querySelectorAll('.user-preset-btn').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                });

                var overwriteBtn = document.createElement('button');
                overwriteBtn.className = 'user-preset-overwrite';
                overwriteBtn.textContent = '\u21BB';
                overwriteBtn.title = 'Overwrite with current settings';
                overwriteBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var snapshot = typeof window.capturePresetSnapshot === 'function' ? window.capturePresetSnapshot() : null;
                    if (snapshot) {
                        var ok = window.Settings.savePreset(name, snapshot);
                        if (ok === false && snapshot.layers) {
                            var lite = JSON.parse(JSON.stringify(snapshot));
                            if (lite.layers) lite.layers.forEach(function(l) { delete l.data; delete l.originalData; });
                            lite._layersStripped = true;
                            ok = window.Settings.savePreset(name, lite);
                            if (ok === false) { delete lite.layers; delete lite.layerOrder; window.Settings.savePreset(name, lite); }
                        }
                        if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                        overwriteBtn.textContent = '\u2713';
                        setTimeout(function() { overwriteBtn.textContent = '\u21BB'; }, 1000);
                    }
                });

                var delBtn = document.createElement('button');
                delBtn.className = 'user-preset-delete';
                delBtn.textContent = '\u00D7';
                delBtn.title = 'Delete "' + name + '"';
                delBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    window.Settings.deletePreset(name);
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                });

                row.appendChild(btn);
                row.appendChild(overwriteBtn);
                row.appendChild(delBtn);
                presetList.appendChild(row);
            });
        }

        setTimeout(renderSidebarPresets, 600);
        window.renderSidebarPresets = renderSidebarPresets;

        return sec;
    }

    // ─── HELPERS ─────────────────────────────────────────────────

    function makeSection(title, color, collapsed) {
        const sec = document.createElement('div');
        sec.className = 'sidebar-section' + (collapsed ? ' collapsed' : '');
        if (color) sec.dataset.color = color;

        const header = document.createElement('div');
        header.className = 'section-header';
        header.addEventListener('click', function() {
            this.parentElement.classList.toggle('collapsed');
        });
        header.innerHTML =
            '<span class="section-title">' + title + '</span>' +
            '<span class="section-chevron">▾</span>';
        sec.appendChild(header);

        const body = document.createElement('div');
        body.className = 'section-body';
        sec.appendChild(body);

        return { sec: sec, body: body, header: header };
    }

    function moveEl(id, target) {
        const el = document.getElementById(id);
        if (el) target.appendChild(el);
        return el;
    }

    function moveControlGroup(inputId, target) {
        const el = document.getElementById(inputId);
        if (!el) return;
        const group = el.closest('.control-group');
        if (group) {
            group.style.cssText = '';
            target.appendChild(group);
        } else {
            target.appendChild(el);
        }
    }

    function moveCheckboxGroup(inputId, target) {
        const el = document.getElementById(inputId);
        if (!el) return;
        const group = el.closest('.checkbox-group') || el.closest('.control-group');
        if (group) {
            group.style.cssText = '';
            target.appendChild(group);
        } else {
            target.appendChild(el);
        }
    }

    function divider() {
        const d = document.createElement('div');
        d.className = 'mixer-divider';
        return d;
    }

    function fmtSlider(slider) {
        const val = parseFloat(slider.value);
        const step = parseFloat(slider.step) || 1;
        if (step < 0.01) return val.toFixed(4);
        if (step < 0.1) return val.toFixed(1);
        if (step < 1) return val.toFixed(1);
        return String(val);
    }

})();
