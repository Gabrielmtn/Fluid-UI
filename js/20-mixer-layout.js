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
        // PERF: Defer heavy DOM restructuring until after splash animation starts
        // This prevents jitter during the title fadein
        var splash = document.getElementById('splash-screen');
        if (splash) {
            // Wait for splash animations to complete their initial render
            // then do heavy DOM work during the "hold" phase before fadeout
            setTimeout(function() {
                requestAnimationFrame(initMixerLayout);
            }, 800); // Splash title animation is 0.8s, start after it settles
        } else {
            requestAnimationFrame(initMixerLayout);
        }
    });

    function initMixerLayout() {
        const controls = document.querySelector('.controls');
        const canvasArea = document.getElementById('canvas-area');
        if (!controls || !canvasArea) return;

        const strip = buildMixerStrip(controls);
        const sidebar = buildSidebar(controls);

        // Add entrance animation classes
        strip.classList.add('ui-enter');
        sidebar.classList.add('ui-enter');
        canvasArea.classList.add('ui-enter');

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
            brushSlider.addEventListener('change', syncBrush);
            // Slow fallback for programmatic value changes (2s instead of 300ms)
            setInterval(syncBrush, 2000);
            syncBrush();
        }

        // ── Responsive typography: detect HiDPI / 4K and set --ui-scale ──
        initResponsiveScale();

        // ── Sidebar resize handle ──
        initSidebarResize(sidebar);

        // ── Splash → entrance animation sequence ──
        orchestrateEntrance(strip, sidebar, canvasArea);

        // ── COS Oscillator UI: inject after sliders are in their final positions ──
        if (window.cosOscillator && typeof window.cosOscillator.buildUI === 'function') {
            window.cosOscillator.buildUI();
        }
    }

    function initResponsiveScale() {
        // Single scaling mechanism: JS only computes --ui-scale; all zooming
        // is done in CSS via `zoom: var(--ui-scale)` rules (init-responsive.css).
        // Elements added later pick the zoom up automatically from their class.
        var _scale = 1;

        function computeScale() {
            var dpr = window.devicePixelRatio || 1;
            var cssW = window.innerWidth;
            var scale = 1;
            // Continuous scale: UI was designed for ~1440px viewport.
            // Wider viewports get proportionally larger UI elements.
            // Formula: linear ramp from 1.0 at 1600px to 1.8 at 3840px
            if (cssW > 1600) {
                scale = Math.round(Math.min(1.8, 1 + (cssW - 1600) * 0.00036) * 100) / 100;
            }
            // Also scale up for high-DPI screens even with moderate viewport
            // (physical 4K with high OS scaling — viewport looks ok-ish but text is still small)
            if (scale === 1 && dpr >= 2 && cssW >= 1200) {
                scale = 1.15;
            }
            _scale = scale;
            document.documentElement.style.setProperty('--ui-scale', scale);
            console.log('[UI Scale] dpr=' + dpr + ' cssW=' + cssW + ' → scale=' + scale);
        }
        computeScale();
        window.addEventListener('resize', computeScale);
        // Detect DPI changes (e.g. dragging to a different monitor)
        // Use recursive matchMedia that re-binds after each change
        function watchDpr() {
            var mq = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
            mq.addEventListener('change', function onDprChange() {
                mq.removeEventListener('change', onDprChange);
                computeScale();
                watchDpr(); // re-bind with new DPR
            });
        }
        watchDpr();
        // Coordinate helper for fixed-position math on zoomed elements:
        // style px = screen px / scale.
        window.UIScale = {
            get: function() { return _scale; },
            fromVisual: function(px) { return px / _scale; }
        };
        // Back-compat no-op (zooming is CSS-driven now)
        window._uiScaleReapply = function() {};
    }

    function initSidebarResize(sidebar) {
        var handle = document.createElement('div');
        handle.className = 'sidebar-resize-handle';
        sidebar.appendChild(handle);

        var startX = 0, startW = 0, dragging = false;
        handle.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startW = sidebar.offsetWidth;
            handle.classList.add('active');
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', function(e) {
            if (!dragging) return;
            var zoom = window.UIScale ? window.UIScale.get() : 1;
            var delta = startX - e.clientX; // dragging left = wider
            // offsetWidth and delta are in screen pixels (zoomed), convert to base width
            var newW = Math.max(220, Math.min(420, (startW + delta) / zoom));
            document.documentElement.style.setProperty('--sidebar-width', Math.round(newW) + 'px');
        });
        handle.addEventListener('pointerup', function(e) {
            dragging = false;
            handle.classList.remove('active');
        });
        handle.addEventListener('pointercancel', function() {
            dragging = false;
            handle.classList.remove('active');
        });
    }

    function orchestrateEntrance(strip, sidebar, canvasArea) {
        var splash = document.getElementById('splash-screen');
        var titlebar = document.getElementById('custom-titlebar');

        // If no splash screen, just show UI immediately
        if (!splash) {
            if (titlebar) titlebar.classList.remove('ui-enter');
            strip.classList.remove('ui-enter');
            sidebar.classList.remove('ui-enter');
            canvasArea.classList.remove('ui-enter');
            return;
        }

        function doTransition() {
            // Brief pause to show "ready" flourish, then fade out
            setTimeout(function() {
                splash.classList.add('fade-out');

                // Stagger UI entrance
                setTimeout(function() { if (titlebar) titlebar.classList.add('ui-ready'); }, 100);
                setTimeout(function() { strip.classList.add('ui-ready'); }, 180);
                setTimeout(function() { canvasArea.classList.add('ui-ready'); }, 260);
                setTimeout(function() { sidebar.classList.add('ui-ready'); }, 320);

                // Clean up after animations
                setTimeout(function() {
                    if (splash.parentNode) splash.parentNode.removeChild(splash);
                    [titlebar, strip, sidebar, canvasArea].forEach(function(el) {
                        if (el) {
                            el.classList.remove('ui-enter', 'ui-ready');
                            el.classList.add('ui-settled');
                        }
                    });
                    setTimeout(function() {
                        [titlebar, strip, sidebar, canvasArea].forEach(function(el) {
                            if (el) el.classList.remove('ui-settled');
                        });
                    }, 100);
                }, 800);
            }, 250); // Brief pause after ready state
        }

        // Wait for scripts to load, then transition
        if (window.__scriptsReady) {
            doTransition();
        } else {
            window.__onScriptsReady = doTransition;
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
        var multiplyChannel = faderChannel('Multiply', 'yellow', 'multiplier', 'multiplierValue');
        var armDropdown = buildArmColorsDropdown();
        multiplyChannel.appendChild(armDropdown.toggle);
        strip.appendChild(multiplyChannel);
        strip.appendChild(faderChannel('Time', 'pink', 'timeScale', 'timeScaleValue'));
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

    // Tooltips for mixer channels
    var CHANNEL_TOOLTIPS = {
        'Brush': 'Brush size for painting fluid',
        'Curl': 'Vorticity strength - creates swirling motion',
        'Viscosity': 'Sharpness/detail enhancement',
        'Isolation': 'Motion isolation - how much color follows velocity',
        'Multiply': 'Kaleidoscope multiplier (1-8x)',
        'Time': 'Simulation time scale',
        'Density': 'How fast color fades',
        'Velocity': 'How fast motion fades',
        'Color': 'Current brush color'
    };

    function faderChannel(label, accent, sliderId, existingValueId, newValueId) {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel';
        if (accent) ch.dataset.accent = accent;

        const lbl = document.createElement('div');
        lbl.className = 'ch-label';
        lbl.textContent = label;
        if (CHANNEL_TOOLTIPS[label]) lbl.title = CHANNEL_TOOLTIPS[label];
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

        var actionBtnStyle = 'all:unset;box-sizing:border-box;padding:5px 8px;font-size:13px;border-radius:4px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;cursor:pointer;';

        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) { pauseBtn.style.cssText = actionBtnStyle; wrap.appendChild(pauseBtn); }

        const clearBtn = controls.querySelector('button[onclick*="clearCanvas"]');
        if (clearBtn) { clearBtn.style.cssText = actionBtnStyle; wrap.appendChild(clearBtn); }

        const freezeBtn = document.getElementById('freezeBtn');
        if (freezeBtn) { freezeBtn.style.cssText = actionBtnStyle; wrap.appendChild(freezeBtn); }

        return wrap;
    }

    function buildPresetsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-presets';

        // Move built-in preset buttons and apply inline styles
        const presetsDiv = controls.querySelector('.presets');
        if (presetsDiv) {
            while (presetsDiv.firstChild) {
                var child = presetsDiv.firstChild;
                if (child.tagName === 'BUTTON') {
                    child.style.cssText = 'all:unset;box-sizing:border-box;padding:4px 8px;font-size:9px;border-radius:3px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.1);cursor:pointer;line-height:1.2;font-weight:500;';
                }
                wrap.appendChild(child);
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
        saveBtn.style.cssText = 'all:unset;box-sizing:border-box;padding:4px 8px;font-size:11px;font-weight:700;border-radius:3px;background:rgba(63,185,80,0.15);color:rgba(63,185,80,0.9);border:1px solid rgba(63,185,80,0.25);cursor:pointer;line-height:1;';
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
            var ok = typeof window.saveUserPreset === 'function'
                ? window.saveUserPreset(name, snapshot)
                : window.Settings.savePreset(name, snapshot);
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
                btn.style.cssText = 'all:unset;box-sizing:border-box;padding:4px 8px;font-size:9px;border-radius:3px;background:rgba(100,200,255,0.12);color:rgba(100,200,255,0.8);border:1px solid rgba(100,200,255,0.2);cursor:pointer;line-height:1.2;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;';
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
        sidebar.appendChild(buildMutationSection());
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
        sidebar.appendChild(buildExportSection());
        sidebar.appendChild(buildMultiArtistSection());
        sidebar.appendChild(buildSettingsSection(controls));

        return sidebar;
    }

    // --- Section builders ---

    function buildMutationSection() {
        const { sec, body } = makeSection('🧬 Mutate', 'purple', false);
        sec.id = 'mutation-section';

        // ── Controls row ──
        const controlsRow = document.createElement('div');
        controlsRow.className = 'mutation-controls';

        // Scope
        const scopeWrap = document.createElement('div');
        scopeWrap.className = 'mutation-field';
        scopeWrap.innerHTML = '<label>Scope</label>';
        const scopeSel = document.createElement('select');
        scopeSel.id = 'mutationScope';
        scopeSel.innerHTML = '<option value="basic">Basic</option><option value="all">All</option>';
        scopeWrap.appendChild(scopeSel);
        controlsRow.appendChild(scopeWrap);

        // Strength
        const strWrap = document.createElement('div');
        strWrap.className = 'mutation-field mutation-field-wide';
        strWrap.innerHTML = '<label>Strength <span id="mutationStrengthVal" class="value-display">0.30</span></label>';
        const strSlider = document.createElement('input');
        strSlider.type = 'range'; strSlider.id = 'mutationStrength';
        strSlider.min = '0.05'; strSlider.max = '1'; strSlider.step = '0.05'; strSlider.value = '0.3';
        strSlider.addEventListener('input', function () {
            var disp = document.getElementById('mutationStrengthVal');
            if (disp) disp.textContent = parseFloat(this.value).toFixed(2);
        });
        strWrap.appendChild(strSlider);
        controlsRow.appendChild(strWrap);

        // Count
        const cntWrap = document.createElement('div');
        cntWrap.className = 'mutation-field';
        cntWrap.innerHTML = '<label>Variants</label>';
        const cntSel = document.createElement('select');
        cntSel.id = 'mutationCount';
        cntSel.innerHTML = '<option value="4">4</option><option value="6" selected>6</option><option value="9">9</option><option value="12">12</option>';
        cntWrap.appendChild(cntSel);
        controlsRow.appendChild(cntWrap);

        body.appendChild(controlsRow);

        // ── Action buttons ──
        const actionsRow = document.createElement('div');
        actionsRow.className = 'mutation-actions';

        const mutBtn = document.createElement('button');
        mutBtn.id = 'mutationGenerate';
        mutBtn.className = 'mutation-btn mutation-btn-primary';
        mutBtn.textContent = 'Mutate';

        const undoBtn = document.createElement('button');
        undoBtn.id = 'mutationUndo';
        undoBtn.className = 'mutation-btn';
        undoBtn.textContent = '← Undo';
        undoBtn.disabled = true;

        const redoBtn = document.createElement('button');
        redoBtn.id = 'mutationRedo';
        redoBtn.className = 'mutation-btn';
        redoBtn.textContent = 'Redo →';
        redoBtn.disabled = true;

        const resetBtn = document.createElement('button');
        resetBtn.id = 'mutationReset';
        resetBtn.className = 'mutation-btn';
        resetBtn.textContent = 'Reset';

        actionsRow.appendChild(mutBtn);
        actionsRow.appendChild(undoBtn);
        actionsRow.appendChild(redoBtn);
        actionsRow.appendChild(resetBtn);
        body.appendChild(actionsRow);

        // ── Lock toggles ──
        const lockRow = document.createElement('div');
        lockRow.className = 'mutation-locks';
        lockRow.innerHTML = '<label class="mutation-locks-label">Lock:</label>';
        var lockGroups = [
            { key: 'colors', label: 'Colors' },
            { key: 'kaleido', label: 'Kaleido' },
            { key: 'simulation', label: 'Sim' },
            { key: 'effects', label: 'Effects' },
            { key: 'animations', label: 'Anim' },
            { key: 'audio', label: 'Audio' }
        ];
        lockGroups.forEach(function (g) {
            var lbl = document.createElement('label');
            lbl.className = 'mutation-lock-chip';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.lockGroup = g.key;
            cb.className = 'mutation-lock-cb';
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(' ' + g.label));
            lockRow.appendChild(lbl);
        });
        body.appendChild(lockRow);

        // ── Variant grid ──
        const grid = document.createElement('div');
        grid.id = 'mutationGrid';
        grid.className = 'mutation-grid';
        body.appendChild(grid);

        // ── Diff panel (shows changes for hovered/selected variant) ──
        const diffPanel = document.createElement('div');
        diffPanel.id = 'mutationDiff';
        diffPanel.className = 'mutation-diff';
        diffPanel.style.display = 'none';
        body.appendChild(diffPanel);

        // ── Chain breadcrumb ──
        const chainWrap = document.createElement('div');
        chainWrap.id = 'mutationChain';
        chainWrap.className = 'mutation-chain';
        body.appendChild(chainWrap);

        // ── Wire up logic ──
        // Pass button references directly to avoid getElementById issues
        setTimeout(function () { 
            wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn); 
        }, 200);

        return sec;
    }

    function wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn) {
        var engine = window.mutationEngine;
        if (!engine) { console.warn('[Mutation] Engine not loaded'); return; }
        
        // Wait for snapshot functions to be available (exposed by save-load.js)
        if (!window.capturePresetSnapshot || !window.applyPresetSnapshot) {
            setTimeout(function() { wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn); }, 100);
            return;
        }
        console.log('[Mutation] UI wired successfully');

        var _variants = [];
        var _baseSnapshot = null;

        // Lock group → parameter ID mapping
        var LOCK_GROUPS = {
            colors: ['color.background', 'color.brush', 'randomColor', 'stepPalette', 'palette'],
            kaleido: ['kaleidoToggle', 'kAnimateRot', 'kaleidoSegments', 'kAngle', 'kSpinSpeed',
                      'kTwist', 'kZoom', 'kBlend', 'kaleidoMode',
                      'kaleido.mode', 'kaleido.segments', 'kaleido.angle', 'kaleido.twist', 'kaleido.zoom', 'kaleido.blend'],
            simulation: ['densityDissipation', 'velocityDissipation', 'pressureDissipation',
                         'pressureIteration', 'curl', 'sharpness', 'multiplier', 'timeScale',
                         'velocityInfluence', 'turbulenceMode', 'brushSize', 'brushRefreshRate'],
            effects: ['enableLighting', 'enableLightShift', 'microDetailToggle', 'sunraysToggle',
                      'lightIntensity', 'lightAmbient', 'lightSpeed', 'clarity', 'vibrance',
                      'sunraysWeight', 'shadingIntensity', 'displayShadingToggle',
                      'lightShiftSpeed', 'lightShiftThreshold', 'lightShiftIntensity', 'lightShiftSaturation',
                      'lightPos', 'lightShiftPath'],
            animations: ['ascendToggle', 'ascendRandomness', 'shootingStarToggle',
                         'ssFrequency', 'ssAngle', 'ssLength', 'ssSize', 'ssVariance', 'ssGravity', 'ssOrigin'],
            audio: ['audioReactToggle', 'arMapAutoSplat', 'arMapSize', 'arMapKaleido', 'arMapColor',
                    'audioSensitivity', 'audioBeatThreshold']
        };

        function getLockedParams() {
            var locks = {};
            document.querySelectorAll('.mutation-lock-cb:checked').forEach(function (cb) {
                var group = cb.dataset.lockGroup;
                if (LOCK_GROUPS[group]) {
                    LOCK_GROUPS[group].forEach(function (id) { locks[id] = true; });
                }
            });
            return locks;
        }

        function getOptions() {
            var scope = document.getElementById('mutationScope');
            var strength = document.getElementById('mutationStrength');
            return {
                scope: scope ? scope.value : 'basic',
                strength: strength ? parseFloat(strength.value) : 0.3,
                locks: getLockedParams()
            };
        }

        function getCount() {
            var el = document.getElementById('mutationCount');
            return el ? parseInt(el.value, 10) : 6;
        }

        // Generate variants
        function doMutate() {
            if (!window.capturePresetSnapshot) return;
            _baseSnapshot = window.capturePresetSnapshot();
            if (!_baseSnapshot) return;

            // Push base to chain if chain is empty
            if (engine.chain.length === 0) {
                engine.chain.push(_baseSnapshot, 'Origin');
            }

            var opts = getOptions();
            var count = getCount();
            _variants = engine.generateVariations(_baseSnapshot, count, opts);
            renderGrid();
        }

        // Render the variant grid
        function renderGrid() {
            var grid = document.getElementById('mutationGrid');
            if (!grid) return;
            grid.innerHTML = '';

            if (_variants.length === 0) {
                grid.innerHTML = '<div class="mutation-empty">Press Mutate to generate variants</div>';
                return;
            }

            _variants.forEach(function (variant, idx) {
                var card = document.createElement('div');
                card.className = 'mutation-card';
                card.dataset.index = idx;

                // Color swatch preview
                var swatch = document.createElement('div');
                swatch.className = 'mutation-swatch';
                var bg = (variant.colors && variant.colors.background) || '#000';
                var br = (variant.colors && variant.colors.brush) || '#fff';
                swatch.style.background = 'linear-gradient(135deg, ' + bg + ' 50%, ' + br + ' 50%)';
                card.appendChild(swatch);

                // Summary label
                var label = document.createElement('div');
                label.className = 'mutation-card-label';
                var diff = engine.diffSummary(_baseSnapshot, variant);
                label.textContent = diff.length + ' change' + (diff.length !== 1 ? 's' : '');
                card.appendChild(label);

                // Key changes preview
                var preview = document.createElement('div');
                preview.className = 'mutation-card-preview';
                var topChanges = diff.slice(0, 3).map(function (d) {
                    if (d.type === 'color') return d.param.split('.')[1];
                    if (d.type === 'checkbox') return d.param;
                    return d.param + ' ' + (d.pct > 0 ? d.pct + '%' : '');
                });
                preview.textContent = topChanges.join(', ');
                card.appendChild(preview);

                // Click to apply
                card.addEventListener('click', function () {
                    applyVariant(idx);
                });

                grid.appendChild(card);
            });
        }

        // Apply a specific variant
        function applyVariant(idx) {
            var variant = _variants[idx];
            if (!variant || !window.applyPresetSnapshot) return;

            window.applyPresetSnapshot(variant);

            // Push to chain
            engine.chain.push(variant, 'Mutation ' + engine.chain.length);

            // Highlight selected card
            document.querySelectorAll('.mutation-card').forEach(function (c) {
                c.classList.toggle('mutation-card-active', parseInt(c.dataset.index, 10) === idx);
            });

            // Show diff
            showDiff(variant);

            // Update chain display
            renderChain();
            updateNavButtons();

            // Use this variant as new base for next mutation
            _baseSnapshot = variant;
        }

        // Show diff panel
        function showDiff(variant) {
            var panel = document.getElementById('mutationDiff');
            if (!panel || !_baseSnapshot) return;
            var diff = engine.diffSummary(_baseSnapshot, variant);
            if (diff.length === 0) {
                panel.style.display = 'none';
                return;
            }
            panel.style.display = 'block';
            var html = '<div class="mutation-diff-title">' + diff.length + ' parameter' + (diff.length !== 1 ? 's' : '') + ' changed:</div>';
            diff.forEach(function (d) {
                var from = d.type === 'color' ? '<span class="mutation-color-dot" style="background:' + d.from + '"></span>' :
                           d.type === 'checkbox' ? (d.from ? 'ON' : 'OFF') :
                           (typeof d.from === 'number' ? d.from.toFixed(3) : d.from);
                var to = d.type === 'color' ? '<span class="mutation-color-dot" style="background:' + d.to + '"></span>' :
                         d.type === 'checkbox' ? (d.to ? 'ON' : 'OFF') :
                         (typeof d.to === 'number' ? d.to.toFixed(3) : d.to);
                html += '<div class="mutation-diff-row"><span class="mutation-diff-param">' + d.param + '</span> ' + from + ' → ' + to + '</div>';
            });
            panel.innerHTML = html;
        }

        // Render chain breadcrumbs
        function renderChain() {
            var wrap = document.getElementById('mutationChain');
            if (!wrap) return;
            var entries = engine.chain.getAll();
            if (entries.length < 2) { wrap.innerHTML = ''; return; }

            wrap.innerHTML = '';
            entries.forEach(function (entry, i) {
                var crumb = document.createElement('span');
                crumb.className = 'mutation-crumb' + (entry.active ? ' mutation-crumb-active' : '');
                crumb.textContent = entry.label;
                crumb.title = new Date(entry.timestamp).toLocaleTimeString();
                crumb.addEventListener('click', function () {
                    var jumped = engine.chain.jump(i);
                    if (jumped && window.applyPresetSnapshot) {
                        window.applyPresetSnapshot(jumped.snapshot);
                        _baseSnapshot = jumped.snapshot;
                        _variants = [];
                        renderGrid();
                        renderChain();
                        updateNavButtons();
                    }
                });
                wrap.appendChild(crumb);
                if (i < entries.length - 1) {
                    var arrow = document.createElement('span');
                    arrow.className = 'mutation-crumb-arrow';
                    arrow.textContent = '→';
                    wrap.appendChild(arrow);
                }
            });
        }

        function updateNavButtons() {
            var undo = document.getElementById('mutationUndo');
            var redo = document.getElementById('mutationRedo');
            if (undo) undo.disabled = engine.chain.index <= 0;
            if (redo) redo.disabled = engine.chain.index >= engine.chain.length - 1;
        }

        // ── Button wiring (using passed references) ──
        if (mutBtn) {
            mutBtn.addEventListener('click', doMutate);
        }

        if (undoBtn) undoBtn.addEventListener('click', function () {
            var entry = engine.chain.back();
            if (entry && window.applyPresetSnapshot) {
                window.applyPresetSnapshot(entry.snapshot);
                _baseSnapshot = entry.snapshot;
                _variants = [];
                renderGrid();
                renderChain();
                updateNavButtons();
            }
        });

        if (redoBtn) redoBtn.addEventListener('click', function () {
            var entry = engine.chain.forward();
            if (entry && window.applyPresetSnapshot) {
                window.applyPresetSnapshot(entry.snapshot);
                _baseSnapshot = entry.snapshot;
                _variants = [];
                renderGrid();
                renderChain();
                updateNavButtons();
            }
        });

        if (resetBtn) resetBtn.addEventListener('click', function () {
            var first = engine.chain.length > 0 ? engine.chain.jump(0) : null;
            if (first && window.applyPresetSnapshot) {
                window.applyPresetSnapshot(first.snapshot);
                _baseSnapshot = first.snapshot;
            }
            engine.chain.clear();
            _variants = [];
            renderGrid();
            renderChain();
            updateNavButtons();
            var diff = document.getElementById('mutationDiff');
            if (diff) diff.style.display = 'none';
        });

        // Initial state
        renderGrid();
        console.log('[Mutation] UI wired');
    }

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

        // Path layer button
        var pathBtn = document.createElement('button');
        pathBtn.type = 'button';
        pathBtn.textContent = '✏️';
        pathBtn.title = 'Add Path Layer';
        pathBtn.style.cssText = 'font-size:11px;padding:3px 6px;cursor:pointer;';
        pathBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (window.pathLayers) {
                window.pathLayers.create();
                window.pathLayers.render();
            }
        });
        actions.appendChild(pathBtn);

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

        // Path Layers subsection
        var pathLayersSubsection = document.createElement('div');
        pathLayersSubsection.className = 'layers-subsection';
        var pathHeader = document.createElement('div');
        pathHeader.className = 'layers-subsection-header';
        pathHeader.innerHTML = '<span class="layers-subsection-title">✏️ Path Layers</span>';
        var newPathBtn = document.createElement('button');
        newPathBtn.type = 'button';
        newPathBtn.className = 'subsection-add-btn';
        newPathBtn.textContent = '+ New Path';
        newPathBtn.title = 'Create a new path layer';
        newPathBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (window.pathLayers) {
                window.pathLayers.create();
                window.pathLayers.render();
            }
        });
        pathHeader.appendChild(newPathBtn);
        pathLayersSubsection.appendChild(pathHeader);
        var pathList = document.createElement('div');
        pathList.id = 'pathLayersList';
        pathLayersSubsection.appendChild(pathList);
        body.appendChild(pathLayersSubsection);

        // Layer-related options, grouped instead of loose checkboxes
        var optsGroup = document.createElement('div');
        optsGroup.className = 'layers-options-group';
        optsGroup.innerHTML = '<div class="layers-options-title">Capture & Preview</div>';
        body.appendChild(optsGroup);
        moveCheckboxGroup('hoverCaptureToggle', optsGroup);
        moveCheckboxGroup('detachCaptureToggle', optsGroup);
        moveEl('imageUpload', body);

        const preview = document.getElementById('previewToggle');
        if (preview) {
            preview.style.display = 'none';
            var previewCb = document.createElement('div');
            previewCb.className = 'checkbox-group';
            previewCb.innerHTML = '<input type="checkbox" id="showPreviewLayersCb"><label for="showPreviewLayersCb">Show Preview Layers</label>';
            optsGroup.appendChild(previewCb);
            body.appendChild(preview);
            var cb = previewCb.querySelector('input');
            cb.addEventListener('change', function () {
                preview.style.display = cb.checked ? '' : 'none';
            });
        }

        // Initialize path layers UI after DOM is ready
        setTimeout(function() {
            if (window.pathLayers) {
                window.pathLayers.render();
            }
        }, 100);

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

        // Surface shading (Pavel-style pseudo-normal lighting)
        moveCheckboxGroup('displayShadingToggle', body);
        moveEl('shadingIntensityGroup', body);

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

        // Sunrays toggle + panel
        moveCheckboxGroup('sunraysToggle', body);
        const sunraysPanel = document.getElementById('sunraysPanel');
        if (sunraysPanel) body.appendChild(sunraysPanel);

        // Spin (Balatro idea) toggle + panel
        moveCheckboxGroup('spinToggle', body);
        const spinPanel = document.getElementById('spinPanel');
        if (spinPanel) body.appendChild(spinPanel);

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
        moveCheckboxGroup('statsToggle', body);

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

        // Initial list render - wait for brandingOverlays API
        function initBrandingList() {
            if (!window.brandingOverlays) {
                setTimeout(initBrandingList, 100);
                return;
            }
            refreshList();
            console.log('[Branding] UI wired successfully');
        }
        setTimeout(initBrandingList, 200);

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

    function buildExportSection() {
        const { sec, body } = makeSection('📤 Export', 'green', false);

        // Export status display
        var statusDiv = document.createElement('div');
        statusDiv.id = 'exportStatus';
        statusDiv.style.cssText = 'display:none;font-size:11px;padding:6px;background:rgba(0,0,0,0.3);border-radius:4px;margin-bottom:8px;text-align:center;color:#58a6ff;';
        body.appendChild(statusDiv);

        // Progress bar
        var progressWrap = document.createElement('div');
        progressWrap.id = 'exportProgress';
        progressWrap.style.cssText = 'display:none;height:4px;background:rgba(0,0,0,0.3);border-radius:2px;overflow:hidden;margin-bottom:12px;';
        var progressBar = document.createElement('div');
        progressBar.id = 'exportProgressBar';
        progressBar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#3fb950,#58a6ff);transition:width 0.2s;';
        progressWrap.appendChild(progressBar);
        body.appendChild(progressWrap);

        // Quick export buttons
        var quickLabel = document.createElement('label');
        quickLabel.className = 'brush-section-label';
        quickLabel.textContent = 'Quick Export';
        body.appendChild(quickLabel);

        var quickGrid = document.createElement('div');
        quickGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;';

        var videoBtn = document.createElement('button');
        videoBtn.textContent = '🎬 Video';
        videoBtn.style.cssText = 'padding:8px;background:rgba(88,166,255,0.15);border:1px solid rgba(88,166,255,0.3);color:#58a6ff;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        videoBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.video();
        });
        quickGrid.appendChild(videoBtn);

        var gifBtn = document.createElement('button');
        gifBtn.textContent = '🎨 GIF';
        gifBtn.style.cssText = 'padding:8px;background:rgba(63,185,80,0.15);border:1px solid rgba(63,185,80,0.3);color:#3fb950;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        gifBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.gif();
        });
        quickGrid.appendChild(gifBtn);

        var stillBtn = document.createElement('button');
        stillBtn.textContent = '📸 Still';
        stillBtn.style.cssText = 'padding:8px;background:rgba(210,153,34,0.15);border:1px solid rgba(210,153,34,0.3);color:#d29922;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        stillBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.still();
        });
        quickGrid.appendChild(stillBtn);

        var seqBtn = document.createElement('button');
        seqBtn.textContent = '🎞️ Sequence';
        seqBtn.style.cssText = 'padding:8px;background:rgba(248,81,73,0.15);border:1px solid rgba(248,81,73,0.3);color:#f85149;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
        seqBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.sequence();
        });
        quickGrid.appendChild(seqBtn);

        body.appendChild(quickGrid);

        // Stop button (hidden until export starts)
        var stopBtn = document.createElement('button');
        stopBtn.id = 'exportStopBtn';
        stopBtn.textContent = '⏹ Cancel Export';
        stopBtn.style.cssText = 'display:none;width:100%;padding:8px;background:rgba(248,81,73,0.2);border:1px solid rgba(248,81,73,0.4);color:#f85149;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;margin-bottom:12px;';
        stopBtn.addEventListener('click', function() {
            if (window.fluidExport) window.fluidExport.stop();
        });
        body.appendChild(stopBtn);

        // Video settings
        var videoLabel = document.createElement('label');
        videoLabel.className = 'brush-section-label';
        videoLabel.textContent = 'Video Settings';
        body.appendChild(videoLabel);

        var durationGroup = document.createElement('div');
        durationGroup.className = 'control-group';
        var durationLbl = document.createElement('label');
        durationLbl.textContent = 'Duration (seconds)';
        durationLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.id = 'exportVideoDuration';
        durationInput.min = '1';
        durationInput.max = '300';
        durationInput.value = '15';
        durationInput.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        durationGroup.appendChild(durationLbl);
        durationGroup.appendChild(durationInput);
        body.appendChild(durationGroup);

        var fpsGroup = document.createElement('div');
        fpsGroup.className = 'control-group';
        var fpsLbl = document.createElement('label');
        fpsLbl.textContent = 'Frame Rate';
        fpsLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var fpsSelect = document.createElement('select');
        fpsSelect.id = 'exportVideoFPS';
        fpsSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        [['30','30 fps'],['60','60 fps'],['120','120 fps']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0];
            o.textContent = opt[1];
            if (opt[0] === '60') o.selected = true;
            fpsSelect.appendChild(o);
        });
        fpsGroup.appendChild(fpsLbl);
        fpsGroup.appendChild(fpsSelect);
        body.appendChild(fpsGroup);

        // GIF settings
        var gifLabel = document.createElement('label');
        gifLabel.className = 'brush-section-label';
        gifLabel.textContent = 'GIF Settings';
        gifLabel.style.marginTop = '12px';
        body.appendChild(gifLabel);

        var gifDurationGroup = document.createElement('div');
        gifDurationGroup.className = 'control-group';
        var gifDurationLbl = document.createElement('label');
        gifDurationLbl.textContent = 'Duration (seconds)';
        gifDurationLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var gifDurationInput = document.createElement('input');
        gifDurationInput.type = 'number';
        gifDurationInput.id = 'exportGifDuration';
        gifDurationInput.min = '1';
        gifDurationInput.max = '10';
        gifDurationInput.value = '3';
        gifDurationInput.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        gifDurationGroup.appendChild(gifDurationLbl);
        gifDurationGroup.appendChild(gifDurationInput);
        body.appendChild(gifDurationGroup);

        var gifFpsGroup = document.createElement('div');
        gifFpsGroup.className = 'control-group';
        var gifFpsLbl = document.createElement('label');
        gifFpsLbl.textContent = 'Frame Rate';
        gifFpsLbl.style.cssText = 'font-size:10px;margin-bottom:4px;display:block;';
        var gifFpsSelect = document.createElement('select');
        gifFpsSelect.id = 'exportGifFPS';
        gifFpsSelect.style.cssText = 'width:100%;padding:4px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:4px;';
        [['10','10 fps'],['15','15 fps'],['24','24 fps'],['30','30 fps']].forEach(function(opt) {
            var o = document.createElement('option');
            o.value = opt[0];
            o.textContent = opt[1];
            if (opt[0] === '15') o.selected = true;
            gifFpsSelect.appendChild(o);
        });
        gifFpsGroup.appendChild(gifFpsLbl);
        gifFpsGroup.appendChild(gifFpsSelect);
        body.appendChild(gifFpsGroup);

        // Output folder (Electron only)
        if (typeof require !== 'undefined') {
            var folderLabel = document.createElement('label');
            folderLabel.className = 'brush-section-label';
            folderLabel.textContent = 'Output Folder';
            folderLabel.style.marginTop = '12px';
            body.appendChild(folderLabel);

            var folderRow = document.createElement('div');
            folderRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

            var folderInput = document.createElement('input');
            folderInput.type = 'text';
            folderInput.id = 'exportFolderPath';
            folderInput.readOnly = true;
            folderInput.placeholder = 'No folder set…';
            folderInput.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:6px 8px;color:#c9d1d9;font-size:11px;cursor:pointer;';
            folderInput.addEventListener('click', function() {
                if (window.fluidExport) window.fluidExport.pickFolder();
            });
            folderRow.appendChild(folderInput);

            var folderOpenBtn = document.createElement('button');
            folderOpenBtn.textContent = '📂';
            folderOpenBtn.title = 'Open folder';
            folderOpenBtn.style.cssText = 'background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 8px;color:#c9d1d9;cursor:pointer;font-size:14px;';
            folderOpenBtn.addEventListener('click', function() {
                if (window.fluidExport) window.fluidExport.openFolder();
            });
            folderRow.appendChild(folderOpenBtn);

            body.appendChild(folderRow);

            // Load saved folder path
            setTimeout(function() {
                if (window.fluidExport) {
                    var c = window.fluidExport.getConfig();
                    if (c.outputFolder) folderInput.value = c.outputFolder;
                }
            }, 500);
        }

        // Load saved settings into UI inputs
        setTimeout(function() {
            if (window.fluidExport) {
                var c = window.fluidExport.getConfig();
                durationInput.value = Math.round(c.videoDuration / 1000);
                fpsSelect.value = String(c.videoFPS);
                gifDurationInput.value = Math.round(c.gifDuration / 1000);
                gifFpsSelect.value = String(c.gifFPS);
            }
        }, 500);

        // Wire settings changes
        durationInput.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('videoDuration', parseInt(durationInput.value) * 1000);
            }
        });

        fpsSelect.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('videoFPS', parseInt(fpsSelect.value));
            }
        });

        gifDurationInput.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('gifDuration', parseInt(gifDurationInput.value) * 1000);
            }
        });

        gifFpsSelect.addEventListener('change', function() {
            if (window.fluidExport) {
                window.fluidExport.setConfig('gifFPS', parseInt(gifFpsSelect.value));
            }
        });

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

        // ── ComfyUI Bridge ──
        var comfySection = document.createElement('div');
        comfySection.style.cssText = 'margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);';

        var comfyLabel = document.createElement('label');
        comfyLabel.style.cssText = 'display:block; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.5); margin-bottom:6px;';
        comfyLabel.textContent = 'ComfyUI Bridge (Ctrl+Enter)';
        comfySection.appendChild(comfyLabel);

        var comfyRow = document.createElement('div');
        comfyRow.style.cssText = 'display:flex; gap:6px; align-items:center;';

        var comfyInput = document.createElement('input');
        comfyInput.type = 'text';
        comfyInput.id = 'comfyuiFolderPath';
        comfyInput.placeholder = 'Paste path or click 📂';
        comfyInput.style.cssText = 'flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:6px 8px; color:#c9d1d9; font-size:11px;';
        comfyInput.value = (window.comfyuiBridge && window.comfyuiBridge.getConfig().outputFolder) || '';
        comfyInput.addEventListener('change', function() {
            if (window.comfyuiBridge && comfyInput.value.trim()) {
                window.comfyuiBridge.setConfig('outputFolder', comfyInput.value.trim());
            }
        });
        comfyInput.addEventListener('paste', function() {
            setTimeout(function() {
                if (window.comfyuiBridge && comfyInput.value.trim()) {
                    window.comfyuiBridge.setConfig('outputFolder', comfyInput.value.trim());
                }
            }, 0);
        });
        comfyRow.appendChild(comfyInput);

        var comfyFolderBtn = document.createElement('button');
        comfyFolderBtn.textContent = '📂';
        comfyFolderBtn.title = 'Pick or open folder';
        comfyFolderBtn.style.cssText = 'background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:4px 8px; color:#c9d1d9; cursor:pointer; font-size:14px;';
        comfyFolderBtn.addEventListener('click', function() {
            if (!window.comfyuiBridge) return;
            var cfg = window.comfyuiBridge.getConfig();
            if (cfg.outputFolder) {
                // If folder is set, open it
                window.comfyuiBridge.openFolder();
            } else {
                // If no folder, pick one
                window.comfyuiBridge.pickFolder();
            }
        });
        comfyRow.appendChild(comfyFolderBtn);

        comfySection.appendChild(comfyRow);
        body.appendChild(comfySection);

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
                        if (typeof window.saveUserPreset === 'function') {
                            window.saveUserPreset(name, snapshot);
                        } else {
                            window.Settings.savePreset(name, snapshot);
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

    // ─── ARM COLORS DROPDOWN ────────────────────────────────────

    function buildArmColorsDropdown() {
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'arm-colors-toggle';
        toggle.textContent = '\u2726';
        toggle.title = 'Per-arm color settings';

        var panel = document.createElement('div');
        panel.className = 'arm-colors-panel';
        panel.style.display = 'none';
        panel.style.position = 'fixed';
        document.body.appendChild(panel);

        function positionPanel() {
            // Panel is zoomed via --ui-scale; fixed left/top are interpreted in the
            // zoomed coordinate space, so compute in screen px then divide by zoom.
            var z = window.UIScale ? window.UIScale.get() : 1;
            var rect = toggle.getBoundingClientRect();
            var panelW = 220;
            var left = rect.left + rect.width / 2 - (panelW * z) / 2;
            // Clamp to viewport (screen px)
            left = Math.max(4, Math.min(left, window.innerWidth - panelW * z - 4));
            panel.style.left = (left / z) + 'px';
            panel.style.top = ((rect.bottom + 4) / z) + 'px';
            panel.style.width = panelW + 'px';
        }

        var header = document.createElement('div');
        header.className = 'arm-colors-header';
        header.textContent = 'Arm Colors';
        panel.appendChild(header);

        var rowsWrap = document.createElement('div');
        rowsWrap.className = 'arm-colors-rows';
        panel.appendChild(rowsWrap);

        function ensureArmConfig(count) {
            var arr = window.multiArmColors;
            if (!arr) { arr = []; window.multiArmColors = arr; }
            while (arr.length < count) {
                arr.push({ mode: 'main', color: '#ffffff', stepIndex: 0 });
            }
        }

        function persistArmColors() {
            if (!window.settingsManager) return;
            var arr = window.multiArmColors || [];
            window.settingsManager.set('brush.armColors', arr.map(function(c) {
                return { mode: c.mode, color: c.color, stepIndex: c.stepIndex || 0 };
            }));
        }

        // Restore persisted arm colors once the sim script (which declares
        // `var multiArmColors`) has loaded — mutate the array in place so the
        // sim's reference stays valid.
        (function restoreArmColors() {
            if (!window.__scriptsReady) { setTimeout(restoreArmColors, 250); return; }
            var saved = window.settingsManager && window.settingsManager.get('brush.armColors', null);
            if (!saved || !Array.isArray(saved) || !saved.length) return;
            var arr = window.multiArmColors;
            if (!arr) { arr = []; window.multiArmColors = arr; }
            arr.length = 0;
            saved.forEach(function(c) {
                arr.push({ mode: c.mode || 'main', color: c.color || '#ffffff', stepIndex: c.stepIndex || 0 });
            });
            if (panel.style.display !== 'none') rebuildRows();
        })();

        function rebuildRows() {
            rowsWrap.innerHTML = '';
            var slider = document.getElementById('multiplier');
            var count = slider ? parseInt(slider.value, 10) || 1 : 1;
            if (count < 2) {
                var hint = document.createElement('div');
                hint.className = 'arm-colors-hint';
                hint.textContent = 'Set multiplier to 2+ to configure arm colors';
                rowsWrap.appendChild(hint);
                return;
            }
            ensureArmConfig(count);
            var arr = window.multiArmColors;

            for (var i = 0; i < count; i++) {
                (function(idx) {
                    var cfg = arr[idx];
                    var row = document.createElement('div');
                    row.className = 'arm-row';

                    var label = document.createElement('span');
                    label.className = 'arm-label';
                    label.textContent = String(idx + 1);
                    row.appendChild(label);

                    var picker = document.createElement('input');
                    picker.type = 'color';
                    picker.className = 'arm-picker';
                    picker.value = cfg.color || '#ffffff';
                    picker.disabled = cfg.mode !== 'fixed';
                    if (cfg.mode !== 'fixed') picker.style.opacity = '0.35';

                    var modes = [
                        { key: 'main',    text: '\u25CF', title: 'Follow pointer color' },
                        { key: 'fixed',   text: '\u25C6', title: 'Fixed color' },
                        { key: 'rainbow', text: '\uD83C\uDF08', title: 'Rainbow — new color every splat' },
                        { key: 'random',  text: 'R',      title: 'Random — new color each stroke' },
                        { key: 'step',    text: 'S',      title: 'Step through palette each stroke' }
                    ];

                    var modeWrap = document.createElement('div');
                    modeWrap.className = 'arm-mode-wrap';
                    var btns = [];

                    modes.forEach(function(m) {
                        var btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'arm-mode-btn' + (cfg.mode === m.key ? ' active' : '');
                        btn.textContent = m.text;
                        btn.title = m.title;
                        btn.dataset.mode = m.key;
                        var isActive = cfg.mode === m.key;
                        btn.style.cssText = 'all:unset;box-sizing:border-box;padding:4px 6px;font-size:10px;border-radius:3px;background:' + (isActive ? 'rgba(255,220,80,0.25)' : 'rgba(255,255,255,0.08)') + ';color:' + (isActive ? 'rgba(255,220,80,1)' : 'rgba(255,255,255,0.6)') + ';border:1px solid ' + (isActive ? 'rgba(255,220,80,0.4)' : 'rgba(255,255,255,0.1)') + ';cursor:pointer;';
                        btn.addEventListener('click', function() {
                            cfg.mode = m.key;
                            cfg.cachedColor = null;
                            if (m.key === 'fixed' && cfg.color === '#ffffff') {
                                // Auto-pick a hue based on arm index
                                var hue = Math.round((idx / (count || 1)) * 360) % 360;
                                cfg.color = hslToHex(hue, 80, 55);
                                picker.value = cfg.color;
                            }
                            btns.forEach(function(b) {
                                var active = b.dataset.mode === m.key;
                                b.classList.toggle('active', active);
                                b.style.background = active ? 'rgba(255,220,80,0.25)' : 'rgba(255,255,255,0.08)';
                                b.style.color = active ? 'rgba(255,220,80,1)' : 'rgba(255,255,255,0.6)';
                                b.style.borderColor = active ? 'rgba(255,220,80,0.4)' : 'rgba(255,255,255,0.1)';
                            });
                            picker.disabled = m.key !== 'fixed';
                            picker.style.opacity = m.key === 'fixed' ? '1' : '0.35';
                            persistArmColors();
                        });
                        btns.push(btn);
                        modeWrap.appendChild(btn);
                    });

                    picker.addEventListener('input', function() {
                        cfg.color = picker.value;
                        if (cfg.mode !== 'fixed') {
                            cfg.mode = 'fixed';
                            btns.forEach(function(b) {
                                var active = b.dataset.mode === 'fixed';
                                b.classList.toggle('active', active);
                                b.style.background = active ? 'rgba(255,220,80,0.25)' : 'rgba(255,255,255,0.08)';
                                b.style.color = active ? 'rgba(255,220,80,1)' : 'rgba(255,255,255,0.6)';
                                b.style.borderColor = active ? 'rgba(255,220,80,0.4)' : 'rgba(255,255,255,0.1)';
                            });
                            picker.disabled = false;
                            picker.style.opacity = '1';
                        }
                        persistArmColors();
                    });

                    row.appendChild(picker);
                    row.appendChild(modeWrap);
                    rowsWrap.appendChild(row);
                })(i);
            }
        }

        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            var open = panel.style.display !== 'none';
            if (open) {
                panel.style.display = 'none';
                toggle.classList.remove('active');
            } else {
                panel.style.display = 'block';
                toggle.classList.add('active');
                positionPanel();
                rebuildRows();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', function(e) {
            if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target !== toggle) {
                panel.style.display = 'none';
                toggle.classList.remove('active');
            }
        });
        panel.addEventListener('click', function(e) { e.stopPropagation(); });

        // Reposition or close on resize
        window.addEventListener('resize', function() {
            if (panel.style.display !== 'none') positionPanel();
        });

        // Rebuild when multiplier changes
        var mSlider = document.getElementById('multiplier');
        if (mSlider) {
            mSlider.addEventListener('input', function() {
                if (panel.style.display !== 'none') rebuildRows();
            });
        }

        // Expose rebuild for external use
        window.rebuildArmColorRows = rebuildRows;

        return { toggle: toggle };
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = l - c / 2;
        var r, g, b;
        if (h < 60) { r=c; g=x; b=0; }
        else if (h < 120) { r=x; g=c; b=0; }
        else if (h < 180) { r=0; g=c; b=x; }
        else if (h < 240) { r=0; g=x; b=c; }
        else if (h < 300) { r=x; g=0; b=c; }
        else { r=c; g=0; b=x; }
        var toHex = function(v) { var h = Math.round((v + m) * 255).toString(16); return h.length < 2 ? '0' + h : h; };
        return '#' + toHex(r) + toHex(g) + toHex(b);
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
