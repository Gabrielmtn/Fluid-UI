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
        // (e.g., component system)
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
                // Compare before writing: the 2s fallback interval otherwise
                // invalidates style/layout every tick even when nothing
                // changed (UI audit Stage 1 — no-op DOM writes aren't free).
                var v = parseFloat(brushSlider.value).toFixed(1);
                if (brushDisplay.textContent !== v) brushDisplay.textContent = v;
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
        // (renames 2026-07-13: 'Brush'→'Size' and 'Multiply'→'Brush' — the
        // multiplier channel is where the brush controls live, so it owns
        // the name; the size fader says what it actually is)
        strip.appendChild(faderChannel('Size', 'orange', 'brushSize', null, 'mixer-brushValue'));
        strip.appendChild(faderChannel('Curl', 'blue', 'curl', 'curlValue'));
        strip.appendChild(faderChannel('Viscosity', 'purple', 'sharpness', 'sharpnessValue'));
        strip.appendChild(faderChannel('Isolation', 'green', 'velocityInfluence', 'velocityInfluenceValue'));
        var brushChannel = faderChannel('Brush', 'yellow', 'multiplier', 'multiplierValue');
        // The multiplier value ("1x") IS the brush-colors trigger — click it to
        // open the per-arm brush color controls (no separate icon button).
        // Query from the (detached) channel: faderChannel already re-parented
        // the value element, so document.getElementById would miss it here.
        buildArmColorsDropdown(brushChannel.querySelector('#multiplierValue'));
        // The LABEL is the brush-settings trigger (D1): the everyday brush
        // controls (presets / target / tip / feel) live in a strip dropdown —
        // too common to bury in the sidebar. The sidebar Brush section keeps
        // the rarer replay + splat-ramp controls.
        buildBrushPanel(brushChannel.querySelector('.ch-label'));
        strip.appendChild(brushChannel);
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
        'Size': 'Brush size for painting fluid',
        'Curl': 'Vorticity strength - creates swirling motion',
        'Viscosity': 'Sharpness/detail enhancement',
        'Isolation': 'Motion isolation - how much color follows velocity',
        'Brush': 'Brush arms (1-8x mirrored strokes) — click BRUSH for brush settings & presets, click the value for arm colors',
        'Time': 'Simulation time scale',
        'Density': 'How fast color fades',
        'Velocity': 'How fast motion fades',
        'Color': 'Current brush color'
    };

    function faderChannel(label, accent, sliderId, existingValueId, newValueId) {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel';
        if (accent) ch.dataset.accent = accent;

        const slider = document.getElementById(sliderId);

        // Header row: label top-left, value top-right (above the slider).
        const head = document.createElement('div');
        head.className = 'ch-header';

        const lbl = document.createElement('div');
        lbl.className = 'ch-label';
        // The Curl channel's label IS the material-mode selector (Curl/Fluid/
        // Ooze/Clay) — adopt it from the sidebar markup instead of static text.
        const matSel = (sliderId === 'curl') ? document.getElementById('materialMode') : null;
        if (matSel) {
            lbl.appendChild(matSel);
            // Re-fit the select to its label text in the strip's font — deferred
            // a tick: this label is still detached here, and computed styles on
            // a detached node measure with the wrong font.
            setTimeout(function () {
                if (window.MaterialModes && window.MaterialModes.resizeLabel) window.MaterialModes.resizeLabel();
            }, 0);
        } else {
            lbl.textContent = label;
        }
        if (CHANNEL_TOOLTIPS[label]) lbl.title = CHANNEL_TOOLTIPS[label];
        head.appendChild(lbl);

        let val = null;
        if (existingValueId) {
            val = document.getElementById(existingValueId);
            if (val) val.classList.add('ch-value');
        } else {
            val = document.createElement('div');
            val.className = 'ch-value';
            if (newValueId) val.id = newValueId;
            if (slider) val.textContent = fmtSlider(slider);
        }
        if (val) head.appendChild(val);

        ch.appendChild(head);

        if (slider) {
            const fader = document.createElement('div');
            fader.className = 'ch-fader';
            fader.appendChild(slider);
            ch.appendChild(fader);
        }

        return ch;
    }

    function buildColorChannel() {
        const ch = document.createElement('div');
        ch.className = 'mixer-channel ch-wide';
        ch.dataset.accent = 'pink';

        // Label + swatch share one row (the "head"); the Rnd/Step toggles sit below.
        // Keeps the colour channel near fader height instead of stacking
        // label → swatch → toggles vertically.
        const head = document.createElement('div');
        head.className = 'ch-color-head';

        const lbl = document.createElement('div');
        lbl.className = 'ch-label';
        lbl.textContent = 'Color';
        head.appendChild(lbl);

        const picker = document.getElementById('colorPicker');
        if (picker) {
            picker.className = 'ch-color-input';
            picker.style.cssText = '';
            head.appendChild(picker);
        }

        ch.appendChild(head);

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

        // Gate chip (independent of Rnd/Step exclusivity): clamps dye at the
        // stroke's own color so repeated paint can't overflow into white.
        var gateEl = document.getElementById('colorGate');
        if (gateEl) {
            gateEl.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
            var gateBtn = document.createElement('button');
            gateBtn.type = 'button';
            gateBtn.className = 'ch-text-toggle' + (gateEl.checked ? ' active' : '');
            gateBtn.textContent = 'Gate';
            gateBtn.title = 'Lock max to original color — repeated strokes can\'t overflow into white';
            gateBtn.addEventListener('click', function () {
                gateEl.checked = !gateEl.checked;
                gateEl.dispatchEvent(new Event('change', { bubbles: true }));
                gateBtn.classList.toggle('active', gateEl.checked);
                gateDensityWrap.style.display = gateEl.checked ? 'flex' : 'none';
            });
            gateEl.addEventListener('change', function () {
                gateBtn.classList.toggle('active', gateEl.checked);
                gateDensityWrap.style.display = gateEl.checked ? 'flex' : 'none';
            });
            ch.appendChild(gateEl);
            toggleRow.appendChild(gateBtn);

            // Gate max density incrementer (BLOOM_CEILING) — compact ±0.1 stepper
            var gateDensityWrap = document.createElement('div');
            gateDensityWrap.className = 'ch-gate-density';
            gateDensityWrap.style.cssText = 'display:' + (gateEl.checked ? 'flex' : 'none') + ';align-items:center;justify-content:center;gap:2px;height:16px;flex:0 0 auto;box-sizing:border-box;';

            var GATE_MIN = 1.0, GATE_MAX = 6.0, GATE_STEP = 0.1;
            var gateCurVal = typeof window.gateMaxDensity === 'number' ? window.gateMaxDensity : 3;

            var gateDownBtn = document.createElement('button');
            gateDownBtn.type = 'button';
            gateDownBtn.textContent = '−';
            gateDownBtn.title = 'Decrease max density';
            gateDownBtn.style.cssText = 'width:16px;height:16px;padding:0;border:1px solid rgba(255,255,255,0.15);border-radius:3px;background:rgba(0,0,0,0.3);color:#c9d1d9;font-size:12px;line-height:1;cursor:pointer;';

            var gateValSpan = document.createElement('span');
            gateValSpan.className = 'ch-gate-density-val';
            gateValSpan.style.cssText = 'font-size:10px;font-family:monospace;color:#4fc3f7;min-width:24px;text-align:center;';
            gateValSpan.textContent = gateCurVal.toFixed(1);

            var gateUpBtn = document.createElement('button');
            gateUpBtn.type = 'button';
            gateUpBtn.textContent = '+';
            gateUpBtn.title = 'Increase max density';
            gateUpBtn.style.cssText = 'width:16px;height:16px;padding:0;border:1px solid rgba(255,255,255,0.15);border-radius:3px;background:rgba(0,0,0,0.3);color:#c9d1d9;font-size:12px;line-height:1;cursor:pointer;';

            function updateGateDensity(v) {
                v = Math.round(v * 10) / 10;
                v = Math.max(GATE_MIN, Math.min(GATE_MAX, v));
                window.gateMaxDensity = v;
                gateCurVal = v;
                gateValSpan.textContent = v.toFixed(1);
                if (typeof window.applyGateState === 'function' && gateEl.checked) {
                    window.applyGateState(true);
                }
                try { if (window.settingsManager) window.settingsManager.set('gate.maxDensity', v); } catch (_) {}
            }

            gateDownBtn.addEventListener('click', function () { updateGateDensity((window.gateMaxDensity || gateCurVal) - GATE_STEP); });
            gateUpBtn.addEventListener('click', function () { updateGateDensity((window.gateMaxDensity || gateCurVal) + GATE_STEP); });

            // Load saved value
            try {
                if (window.settingsManager) {
                    var savedGD = window.settingsManager.get('gate.maxDensity');
                    if (typeof savedGD === 'number') {
                        gateCurVal = Math.max(GATE_MIN, Math.min(GATE_MAX, savedGD));
                        window.gateMaxDensity = gateCurVal;
                        gateValSpan.textContent = gateCurVal.toFixed(1);
                    }
                }
            } catch (_) {}

            gateDensityWrap.appendChild(gateDownBtn);
            gateDensityWrap.appendChild(gateValSpan);
            gateDensityWrap.appendChild(gateUpBtn);
            toggleRow.appendChild(gateDensityWrap);
        }

        ch.appendChild(toggleRow);

        return ch;
    }

    function buildActionsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-actions';

        // Transport: pause + freeze are compact icon buttons sharing one row;
        // Clear spans the full width below. Two rows instead of three keeps the
        // block close to the fader height. Styling/state via .mixer-actions CSS.
        const transportRow = document.createElement('div');
        transportRow.className = 'transport-row';

        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.style.cssText = '';
            pauseBtn.textContent = '⏸';
            pauseBtn.title = 'Pause / resume simulation';
            transportRow.appendChild(pauseBtn);
        }

        const freezeBtn = document.getElementById('freezeBtn');
        if (freezeBtn) {
            freezeBtn.style.cssText = '';
            freezeBtn.textContent = '🛑';
            freezeBtn.title = 'Freeze / unfreeze fluid motion';
            transportRow.appendChild(freezeBtn);
        }

        wrap.appendChild(transportRow);

        const clearBtn = controls.querySelector('button[onclick*="clearCanvas"]');
        if (clearBtn) {
            clearBtn.style.cssText = '';
            clearBtn.textContent = 'Clear';
            clearBtn.title = 'Clear the canvas';
            wrap.appendChild(clearBtn);
        }

        return wrap;
    }

    function buildPresetsChannel(controls) {
        const wrap = document.createElement('div');
        wrap.className = 'mixer-presets';

        // Move built-in preset buttons; styling lives in 20-mixer-strip.css
        // (.mixer-preset-btn) — inline cssText here used to beat the .active
        // class, so applied presets never highlighted.
        const presetsDiv = controls.querySelector('.presets');
        if (presetsDiv) {
            while (presetsDiv.firstChild) {
                var child = presetsDiv.firstChild;
                if (child.tagName === 'BUTTON') {
                    child.classList.add('mixer-preset-btn');
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
                btn.className = 'mixer-user-preset-btn'; // styled in 20-mixer-strip.css
                btn.textContent = name;
                btn.title = 'Load "' + name + '"';
                btn.addEventListener('click', function() {
                    var snapshot = presets[name];
                    if (snapshot && typeof window.applyPresetSnapshot === 'function') {
                        window.applyPresetSnapshot(snapshot);
                    }
                    // Built-in active state clears through the real state owner
                    // (04b activePreset), not a cosmetic class sweep.
                    if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
                    // Highlight this preset in BOTH user-preset surfaces
                    // (strip + sidebar list render the same presets).
                    document.querySelectorAll('.mixer-user-preset-btn, .user-preset-btn').forEach(function(b) {
                        b.classList.toggle('active', b.textContent === name);
                    });
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
        sidebar.appendChild(buildAudioSection());
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

        buildQualityUnderbar();

        return sidebar;
    }

    // UX-9.1 — quality underbar: a slim always-visible cluster pinned to the
    // top-right corner surfacing the two knobs users reach for most (Visual
    // Quality + Physics Detail), without opening the Simulation panel. v1 per
    // Gabriel: these two controls, top-right; de-band etc. stay in the panel.
    function buildQualityUnderbar() {
        if (document.getElementById('quality-underbar')) return;
        const bar = document.createElement('div');
        bar.id = 'quality-underbar';
        // Minimalist (After Effects): no external labels — each control is a
        // custom dropdown showing just its value; the label sits ABOVE the
        // options as a themeable list header on open (the native <optgroup>
        // popup can't be dark-themed in this build — white OS frame — so we
        // drive a hidden native <select> from a custom list instead).
        [['visualResolution', 'Visual Quality'], ['physicsResolution', 'Physics Detail']].forEach(function (pair) {
            const sel = document.getElementById(pair[0]);
            if (sel) bar.appendChild(makeQubDropdown(sel, pair[1]));
        });
        document.body.appendChild(bar);
        // Trim the right edge to #canvas-area's right — the drawing region's
        // edge, i.e. where the nav begins. canvas-area is left:0, so only its
        // WIDTH changes (sidebar resize / window / sim-res) and a ResizeObserver
        // on it catches every case; no fragile position tracking.
        const place = function () {
            const ca = document.getElementById('canvas-area');
            let right = 0;
            if (ca) {
                const r = ca.getBoundingClientRect();
                if (r.right > 1 && r.right < window.innerWidth - 1) right = Math.round(window.innerWidth - r.right);
            }
            bar.style.right = right + 'px';
        };
        requestAnimationFrame(place);
        setTimeout(place, 400);
        window.addEventListener('resize', place);
        if (window.ResizeObserver) {
            const ca = document.getElementById('canvas-area');
            if (ca) { try { new ResizeObserver(place).observe(ca); } catch (e) {} }
        }
    }

    // Custom themeable dropdown that drives a hidden native <select> (so all
    // existing change bindings + save/load keep working by id). Opens UPWARD
    // with a label header on top — the fix for the unstylable native popup.
    function makeQubDropdown(sel, labelText) {
        sel.classList.add('qub-native-hidden');
        const wrap = document.createElement('div');
        wrap.className = 'qub-dd';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qub-dd-btn';
        btn.title = labelText;
        const val = document.createElement('span');
        val.className = 'qub-dd-val';
        btn.appendChild(val);
        btn.insertAdjacentHTML('beforeend', '<span class="qub-dd-chev">▾</span>');
        const list = document.createElement('div');
        list.className = 'qub-dd-list';
        const hdr = document.createElement('div');
        hdr.className = 'qub-dd-hdr';
        hdr.textContent = labelText;
        list.appendChild(hdr);

        const syncVal = function () {
            const o = sel.options[sel.selectedIndex];
            val.textContent = o ? o.text : '';
        };
        const rebuild = function () {
            Array.prototype.slice.call(list.querySelectorAll('.qub-dd-opt')).forEach(function (o) { o.remove(); });
            Array.prototype.forEach.call(sel.options, function (opt) {
                const o = document.createElement('div');
                o.className = 'qub-dd-opt' + (opt.selected ? ' sel' : '');
                o.textContent = opt.text;
                o.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (sel.value !== opt.value) {
                        sel.value = opt.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    syncVal();
                    close();
                });
                list.appendChild(o);
            });
        };
        const onDoc = function (e) { if (!wrap.contains(e.target)) close(); };
        const close = function () {
            wrap.classList.remove('open');
            document.removeEventListener('mousedown', onDoc);
        };
        const open = function () {
            rebuild();
            wrap.classList.add('open');
            setTimeout(function () { document.addEventListener('mousedown', onDoc); }, 0);
        };
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            wrap.classList.contains('open') ? close() : open();
        });
        // Keep the button in sync if the select is driven from elsewhere.
        sel.addEventListener('change', syncVal);

        wrap.appendChild(btn);
        wrap.appendChild(list);
        wrap.appendChild(sel); // hidden state-holder stays in the DOM
        syncVal();
        return wrap;
    }

    // --- Section builders ---

    function buildMutationSection() {
        const { sec, body } = makeSection('🧬 Mutate Shader', 'purple', false);
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
        grid.style.display = 'none';
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
        // Pass button references directly to avoid getElementById issues.
        // No arbitrary delay: wireMutationUI already self-retries every
        // 100ms until its dependencies (mutation engine + snapshot fns)
        // exist — the old flat 200ms just added dead air (UI audit Stage 2).
        wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn);

        return sec;
    }

    function wireMutationUI(mutBtn, undoBtn, redoBtn, resetBtn) {
        // Self-retry until ALL dependencies exist (engine + snapshot fns) —
        // the engine check used to warn-and-die, silently leaving the panel
        // dead if load order ever shifted; now every path converges.
        var engine = window.mutationEngine;
        if (!engine || !window.capturePresetSnapshot || !window.applyPresetSnapshot) {
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
                         'velocityInfluence', 'brushSize', 'brushRefreshRate'],
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
                grid.style.display = 'none';
                grid.innerHTML = '';
                return;
            }
            grid.style.display = '';

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

        // 7.2: action buttons belong in the section BODY, not the header —
        // the header stays title-only (matches the per-layer-item fix in 05k).
        actions.classList.add('layers-toolbar');
        body.appendChild(actions);

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

        // UX-9.1: Visual Quality + Physics Detail live in the top-right quality
        // underbar (buildQualityUnderbar) for always-visible quick access.
        moveControlGroup('fpsCap', body);
        moveControlGroup('pressureDissipation', body);
        moveControlGroup('pressureIteration', body);
        moveControlGroup('velocityCap', body);
        moveCheckboxGroup('macCormackToggle', body);
        moveCheckboxGroup('multigridToggle', body);
        // Multigrid tuning panel — same toggle+panel pattern as
        // microDetailPanel/sunraysPanel in the Effects section
        const multigridPanel = document.getElementById('multigridPanel');
        if (multigridPanel) body.appendChild(multigridPanel);

        return sec;
    }

    function buildEffectsSection(controls) {
        const { sec, body } = makeSection('💡 Effects', 'yellow', true);

        // Curl-noise micro-swirl (dye advection wisps)
        moveControlGroup('swirl', body);
        // Sharpen kernel scale (coarse emboss at high values)
        moveControlGroup('ridges', body);

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
        // Everyday brush controls (target/tip/feel/presets) moved to the strip's
        // Brush dropdown (buildBrushPanel) 2026-07-16 — this section keeps the
        // rarer stroke-replay + splat-ramp machinery.
        const { sec, body } = makeSection('🖌️ Stroke & Replay', 'orange', true);

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

        // --- Replay Speed ---
        var speedGroup = document.createElement('div');
        speedGroup.className = 'control-group';

        var speedLbl = document.createElement('label');
        speedLbl.setAttribute('for', 'replaySpeed');
        speedLbl.innerHTML = 'Replay Speed <span class="value-display" id="replaySpeedValue">1.0×</span>';

        var speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.id = 'replaySpeed';
        speedSlider.min = '0.25';
        speedSlider.max = '4';
        speedSlider.value = '1';
        speedSlider.step = '0.25';

        speedGroup.appendChild(speedLbl);
        speedGroup.appendChild(speedSlider);
        body.appendChild(speedGroup);

        // 1.1 Live colors: replay repaints with the CURRENT brush color
        // instead of the recorded one (faithful replay stays the default)
        var liveColGroup = document.createElement('div');
        liveColGroup.className = 'control-group';
        var liveColLabel = document.createElement('label');
        liveColLabel.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
        var liveColCb = document.createElement('input');
        liveColCb.type = 'checkbox';
        liveColCb.id = 'replayLiveColors';
        var liveColText = document.createElement('span');
        liveColText.textContent = 'Replay uses current color';
        liveColLabel.title = 'Off = faithful replay (the colors you painted with). On = the stroke repaints with whatever color the brush has NOW.';
        liveColLabel.appendChild(liveColCb);
        liveColLabel.appendChild(liveColText);
        liveColGroup.appendChild(liveColLabel);
        body.appendChild(liveColGroup);
        liveColCb.addEventListener('change', function () {
            window.replayLiveColors = liveColCb.checked;
            try { if (window.settingsManager) window.settingsManager.set('brush.replayLiveColors', liveColCb.checked); } catch (_) {}
        });
        try {
            var savedLiveCol = window.settingsManager && window.settingsManager.get('brush.replayLiveColors');
            if (savedLiveCol) { liveColCb.checked = true; window.replayLiveColors = true; }
        } catch (_) {}
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

        // Ramp-distance slider (how far the brush travels before reaching full
        // size). Built by a small helper shared by in/out.
        function makeRampRow(id, getDist) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:-2px 0 8px;';
            var lab = document.createElement('span');
            lab.textContent = 'Ramp';
            lab.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.45);min-width:30px;';
            var slider = document.createElement('input');
            slider.type = 'range'; slider.id = id;
            slider.min = '0'; slider.max = '0.5'; slider.step = '0.01';
            slider.value = String(getDist());
            slider.style.cssText = 'flex:1;min-width:0;';
            var val = document.createElement('span');
            val.style.cssText = 'font-size:10px;font-family:monospace;color:#4fc3f7;min-width:32px;text-align:right;';
            val.textContent = Math.round(parseFloat(slider.value) * 100) + '%';
            row.appendChild(lab); row.appendChild(slider); row.appendChild(val);
            return { row: row, slider: slider, val: val };
        }
        var inRamp = makeRampRow('splatInDist', function () { return window.splatInDist != null ? window.splatInDist : 0.15; });
        body.appendChild(inRamp.row);

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

        var outRamp = makeRampRow('splatOutDist', function () { return window.splatOutDist != null ? window.splatOutDist : 0.15; });
        body.appendChild(outRamp.row);

        // --- Wire splat in/out ---
        // Ramp slider only matters for linear/easing; dim it when mode is instant.
        function syncRamp(ramp, sel) {
            var on = sel.value !== 'instant';
            ramp.row.style.opacity = on ? '1' : '0.4';
            ramp.slider.disabled = !on;
        }
        splatInSelect.addEventListener('change', function() {
            window.splatInMode = splatInSelect.value;
            syncRamp(inRamp, splatInSelect);
            try { if (window.settingsManager) window.settingsManager.set('brush.splatInMode', splatInSelect.value); } catch(_) {}
        });
        splatOutSelect.addEventListener('change', function() {
            window.splatOutMode = splatOutSelect.value;
            syncRamp(outRamp, splatOutSelect);
            try { if (window.settingsManager) window.settingsManager.set('brush.splatOutMode', splatOutSelect.value); } catch(_) {}
        });
        inRamp.slider.addEventListener('input', function() {
            var v = parseFloat(inRamp.slider.value);
            window.splatInDist = v;
            inRamp.val.textContent = Math.round(v * 100) + '%';
            try { if (window.settingsManager) window.settingsManager.set('brush.splatInDist', v); } catch(_) {}
        });
        outRamp.slider.addEventListener('input', function() {
            var v = parseFloat(outRamp.slider.value);
            window.splatOutDist = v;
            outRamp.val.textContent = Math.round(v * 100) + '%';
            try { if (window.settingsManager) window.settingsManager.set('brush.splatOutDist', v); } catch(_) {}
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

        // --- Wire replay speed ---
        var speedDisplay = speedLbl.querySelector('.value-display');
        speedSlider.addEventListener('input', function () {
            var v = parseFloat(speedSlider.value);
            window.replaySpeed = v;
            if (speedDisplay) speedDisplay.textContent = v.toFixed(2).replace(/\.?0+$/, '') + '×';
            try {
                if (window.settingsManager) window.settingsManager.set('brush.replaySpeed', v);
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

                var savedSpeed = window.settingsManager.get('brush.replaySpeed');
                if (typeof savedSpeed === 'number') {
                    speedSlider.value = savedSpeed;
                    window.replaySpeed = savedSpeed;
                    if (speedDisplay) speedDisplay.textContent = savedSpeed.toFixed(2).replace(/\.?0+$/, '') + '×';
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
                var savedInDist = window.settingsManager.get('brush.splatInDist');
                if (typeof savedInDist === 'number') {
                    window.splatInDist = savedInDist;
                    inRamp.slider.value = savedInDist;
                    inRamp.val.textContent = Math.round(savedInDist * 100) + '%';
                }
                var savedOutDist = window.settingsManager.get('brush.splatOutDist');
                if (typeof savedOutDist === 'number') {
                    window.splatOutDist = savedOutDist;
                    outRamp.slider.value = savedOutDist;
                    outRamp.val.textContent = Math.round(savedOutDist * 100) + '%';
                }
            }
        } catch (_) {}
        // Reflect the in/out mode in the ramp sliders' enabled state
        syncRamp(inRamp, splatInSelect);
        syncRamp(outRamp, splatOutSelect);

        // Defaults
        if (!window.replayMode) window.replayMode = 'stroke';
        if (!window.replayTimePeriod) window.replayTimePeriod = 5;
        if (window.brushRefreshRate == null) window.brushRefreshRate = 0;
        if (!window.splatInMode) window.splatInMode = 'instant';
        if (!window.splatOutMode) window.splatOutMode = 'instant';

        return sec;
    }

    // ─── BRUSH PANEL (D1) ────────────────────────────────────────────
    // The everyday brush controls in a dropdown off the strip's Brush
    // channel LABEL (the value stays the arm-colors trigger). Built
    // eagerly so saved settings restore at startup, shown on demand.
    // Controls keep their legacy element ids + 'brush.*' settings keys,
    // so values saved when they lived in the sidebar migrate untouched.
    function buildBrushPanel(trigger) {
        if (!trigger) return;
        trigger.classList.add('brush-trigger');
        var chev = document.createElement('span');
        chev.className = 'brush-trigger-chev';
        chev.textContent = '▾';
        trigger.appendChild(chev);

        var panel = document.createElement('div');
        panel.className = 'arm-colors-panel brush-settings-panel';
        panel.style.display = 'none';
        panel.style.position = 'fixed';
        document.body.appendChild(panel);

        var PANEL_W = 252;
        function positionPanel() {
            // Zoomed via --ui-scale: compute in screen px, divide by zoom
            // (same math as the arm-colors panel).
            var z = window.UIScale ? window.UIScale.get() : 1;
            var rect = trigger.getBoundingClientRect();
            var left = rect.left + rect.width / 2 - (PANEL_W * z) / 2;
            left = Math.max(4, Math.min(left, window.innerWidth - PANEL_W * z - 4));
            panel.style.left = (left / z) + 'px';
            panel.style.top = ((rect.bottom + 6) / z) + 'px';
            panel.style.width = PANEL_W + 'px';
        }

        var header = document.createElement('div');
        header.className = 'arm-colors-header';
        header.textContent = 'Brush';
        panel.appendChild(header);

        function num(v, d) { return typeof v === 'number' ? v : d; }
        function pct(v) { return Math.round(v * 100) + '%'; }

        // Manual tweaks diverge from the applied preset → clear the chip
        // highlight. Preset apply drives the same handlers, so it flags
        // itself to keep its own highlight.
        var applyingPreset = false;
        function markDirty() {
            if (applyingPreset) return;
            panel.querySelectorAll('.brush-preset-btn.active').forEach(function (b) {
                b.classList.remove('active');
            });
        }

        // Setter registry: preset apply drives every control through the
        // same commit path as user input (config + persist + display).
        var SETTERS = {};

        function sLabel(text) {
            var l = document.createElement('label');
            l.className = 'brush-section-label';
            l.textContent = text;
            panel.appendChild(l);
        }

        function pSlider(id, label, min, max, step, key, fmt, presetKey) {
            var group = document.createElement('div');
            group.className = 'control-group';
            var lbl = document.createElement('label');
            lbl.setAttribute('for', id);
            lbl.innerHTML = label + ' <span class="value-display" id="' + id + 'Value"></span>';
            var slider = document.createElement('input');
            slider.type = 'range'; slider.id = id;
            slider.min = String(min); slider.max = String(max); slider.step = String(step);
            var cur = (window.config && typeof window.config[key] === 'number') ? window.config[key] : min;
            try {
                var saved = window.settingsManager && window.settingsManager.get('brush.' + id);
                if (typeof saved === 'number') { cur = saved; if (window.config) window.config[key] = saved; }
            } catch (_) {}
            slider.value = String(cur);
            var disp = lbl.querySelector('.value-display');
            disp.textContent = fmt(cur);
            function commit(v) {
                if (window.config) window.config[key] = v;
                disp.textContent = fmt(v);
                try { if (window.settingsManager) window.settingsManager.set('brush.' + id, v); } catch (_) {}
            }
            slider.addEventListener('input', function () {
                commit(parseFloat(slider.value));
                markDirty();
            });
            if (presetKey) SETTERS[presetKey] = function (v) {
                if (typeof v !== 'number') return;
                v = Math.max(min, Math.min(max, v));
                slider.value = String(v);
                commit(v);
            };
            group.appendChild(lbl); group.appendChild(slider);
            panel.appendChild(group);
            return group;
        }

        function pCheckbox(id, label, key, presetKey) {
            var row = document.createElement('div');
            row.className = 'control-group checkbox-group';
            var cb = document.createElement('input');
            cb.type = 'checkbox'; cb.id = id;
            var on = !!(window.config && window.config[key]);
            try {
                var saved = window.settingsManager && window.settingsManager.get('brush.' + id);
                if (typeof saved === 'boolean') { on = saved; if (window.config) window.config[key] = saved; }
            } catch (_) {}
            cb.checked = on;
            var lbl = document.createElement('label');
            lbl.setAttribute('for', id);
            lbl.style.margin = '0';
            lbl.textContent = label;
            function commit(v) {
                cb.checked = v;
                if (window.config) window.config[key] = v;
                try { if (window.settingsManager) window.settingsManager.set('brush.' + id, v); } catch (_) {}
            }
            cb.addEventListener('change', function () { commit(cb.checked); markDirty(); });
            if (presetKey) SETTERS[presetKey] = function (v) { if (typeof v === 'boolean') commit(v); };
            row.appendChild(cb); row.appendChild(lbl);
            panel.appendChild(row);
            return row;
        }

        // ── Presets: named brush states, quick-switch chips ──
        var chipsWrap = document.createElement('div');
        chipsWrap.className = 'brush-presets-chips';
        panel.appendChild(chipsWrap);

        var saveRow = document.createElement('div');
        saveRow.className = 'brush-presets-save-row';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'mixer-preset-save';
        saveBtn.textContent = '+';
        saveBtn.title = 'Save the current brush as a preset';
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'mixer-preset-name-input';
        nameInput.placeholder = 'Brush name...';
        nameInput.maxLength = 24;
        nameInput.spellcheck = false;
        nameInput.autocomplete = 'off';
        nameInput.style.display = 'none';
        saveRow.appendChild(saveBtn);
        saveRow.appendChild(nameInput);
        panel.appendChild(saveRow);

        function loadBrushPresets() {
            try {
                var arr = window.settingsManager && window.settingsManager.get('brush.presets');
                return Array.isArray(arr) ? arr : [];
            } catch (_) { return []; }
        }
        function storeBrushPresets(list) {
            try { if (window.settingsManager) window.settingsManager.set('brush.presets', list); } catch (_) {}
        }
        function captureBrushPreset(name) {
            var c = window.config || {};
            var sizeSlider = document.getElementById('brushSize');
            return {
                name: name,
                size: sizeSlider ? parseFloat(sizeSlider.value) : num(c.SPLAT_RADIUS, 0.011) * 1000,
                target: (c.BRUSH_TARGET === 'sketch' || c.BRUSH_TARGET === 'mask') ? c.BRUSH_TARGET : 'fluid',
                eraser: !!c.BRUSH_ERASER,
                tip: c.BRUSH_TIP | 0,
                tipTexture: num(c.BRUSH_TIP_TEXTURE, 0.7),
                flow: num(c.BRUSH_FLOW, 1),
                hardness: num(c.BRUSH_HARDNESS, 0.8),
                stabilizer: num(c.BRUSH_STABILIZER, 0),
                spacing: num(c.BRUSH_SPACING, 0.35),
                jitter: num(c.BRUSH_JITTER, 0),
                pressureSize: !!c.BRUSH_PRESSURE_SIZE,
                pressureFlow: !!c.BRUSH_PRESSURE_FLOW,
                pressureCurve: num(c.BRUSH_PRESSURE_CURVE, 0.7)
            };
        }
        function applyBrushPreset(p) {
            applyingPreset = true;
            try {
                if (typeof p.size === 'number') {
                    // The Size fader owns SPLAT_RADIUS — drive it like a user
                    // drag so 05h's binding and the strip display both update.
                    var s = document.getElementById('brushSize');
                    if (s) {
                        var v = Math.max(parseFloat(s.min), Math.min(parseFloat(s.max), p.size));
                        s.value = v;
                        s.style.setProperty('--val', s.value);
                        s.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                if (SETTERS.target) SETTERS.target(p.target);
                if (SETTERS.tip) SETTERS.tip(p.tip | 0);
                ['tipTexture', 'flow', 'hardness', 'stabilizer', 'spacing', 'jitter',
                 'pressureSize', 'pressureFlow', 'pressureCurve', 'eraser'
                ].forEach(function (k) {
                    if (SETTERS[k] && p[k] !== undefined) SETTERS[k](p[k]);
                });
            } finally { applyingPreset = false; }
        }
        function renderPresetChips() {
            chipsWrap.innerHTML = '';
            var list = loadBrushPresets();
            if (!list.length) {
                var hint = document.createElement('div');
                hint.className = 'arm-colors-hint';
                hint.textContent = 'No brush presets yet — dial in a brush and hit +';
                chipsWrap.appendChild(hint);
                return;
            }
            list.forEach(function (p) {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'brush-preset-btn' + (p.eraser ? ' eraser' : '');
                chip.textContent = p.name;
                chip.title = 'Load brush "' + p.name + '"' + (p.eraser ? ' (eraser)' : '');
                var del = document.createElement('span');
                del.className = 'brush-preset-del';
                del.textContent = '×';
                del.title = 'Delete "' + p.name + '"';
                del.addEventListener('click', function (e) {
                    e.stopPropagation();
                    storeBrushPresets(loadBrushPresets().filter(function (q) { return q.name !== p.name; }));
                    renderPresetChips();
                });
                chip.appendChild(del);
                chip.addEventListener('click', function () {
                    applyBrushPreset(p);
                    chipsWrap.querySelectorAll('.brush-preset-btn').forEach(function (b) {
                        b.classList.toggle('active', b === chip);
                    });
                });
                chipsWrap.appendChild(chip);
            });
        }
        function cancelPresetSave() {
            nameInput.style.display = 'none';
            nameInput.value = '';
            saveBtn.textContent = '+';
        }
        function doSaveBrushPreset() {
            var name = (nameInput.value || '').trim();
            if (!name) { cancelPresetSave(); return; }
            // Same name = overwrite (a brush you re-dial is the same brush)
            var list = loadBrushPresets().filter(function (q) { return q.name !== name; });
            list.unshift(captureBrushPreset(name));
            if (list.length > 24) list.length = 24;
            storeBrushPresets(list);
            cancelPresetSave();
            renderPresetChips();
        }
        saveBtn.addEventListener('click', function () {
            if (nameInput.style.display === 'none') {
                nameInput.style.display = '';
                nameInput.value = '';
                nameInput.focus();
                saveBtn.textContent = '✓';
            } else {
                doSaveBrushPreset();
            }
        });
        nameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); doSaveBrushPreset(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelPresetSave(); }
        });

        // ── Paint target: fluid splats vs raster paint layer vs mask ──
        sLabel('Paint Into');
        var targetRow = document.createElement('div');
        targetRow.className = 'brush-mode-row';
        var fluidBtn = document.createElement('button');
        fluidBtn.type = 'button'; fluidBtn.className = 'brush-mode-btn active'; fluidBtn.textContent = 'Fluid';
        fluidBtn.title = 'Strokes splat velocity + dye into the fluid sim (the classic brush)';
        var sketchBtn = document.createElement('button');
        sketchBtn.type = 'button'; sketchBtn.className = 'brush-mode-btn'; sketchBtn.textContent = 'Sketch';
        sketchBtn.title = 'Strokes paint the active paint layer — normal-control drawing that never decays or flows (backgrounds, guides, colliders)';
        var maskBtn = document.createElement('button');
        maskBtn.type = 'button'; maskBtn.className = 'brush-mode-btn'; maskBtn.textContent = 'Mask';
        maskBtn.title = 'Strokes paint coverage into the active Mask (shown as a red film) — bind it as a collider or clip (D3)';
        targetRow.appendChild(fluidBtn); targetRow.appendChild(sketchBtn); targetRow.appendChild(maskBtn);
        panel.appendChild(targetRow);
        var VALID_TARGETS = { fluid: 1, sketch: 1, mask: 1 };
        function setBrushTarget(t) {
            if (!VALID_TARGETS[t]) t = 'fluid';
            if (window.config) window.config.BRUSH_TARGET = t;
            fluidBtn.classList.toggle('active', t === 'fluid');
            sketchBtn.classList.toggle('active', t === 'sketch');
            maskBtn.classList.toggle('active', t === 'mask');
            try { if (window.settingsManager) window.settingsManager.set('brush.target', t); } catch (_) {}
        }
        SETTERS.target = setBrushTarget;
        fluidBtn.addEventListener('click', function () { setBrushTarget('fluid'); markDirty(); });
        sketchBtn.addEventListener('click', function () { setBrushTarget('sketch'); markDirty(); });
        maskBtn.addEventListener('click', function () { setBrushTarget('mask'); markDirty(); });
        try {
            var savedTarget = window.settingsManager && window.settingsManager.get('brush.target');
            setBrushTarget(savedTarget);
        } catch (_) { setBrushTarget('fluid'); }

        // ── Tip: the splat-shader stamp shapes as brush tips (D1) ──
        sLabel('Tip');
        var tipRow = document.createElement('div');
        tipRow.className = 'brush-tip-row';
        var TIPS = [
            { v: 0, glyph: '◌', name: 'Soft',   title: 'Soft — the classic gaussian dab' },
            { v: 1, glyph: '⬤', name: 'Blob',   title: 'Blob — noise-notched round stamp' },
            { v: 2, glyph: '■', name: 'Chisel', title: 'Chisel — squared press' },
            { v: 3, glyph: '▬', name: 'Streak', title: 'Streak — elongated smear' },
            { v: 4, glyph: '◯', name: 'Ring',   title: 'Ring — thin dye band, hollow center' }
        ];
        var tipBtns = [];
        function setBrushTip(v) {
            v = v | 0;
            if (v < 0 || v > 4) v = 0;
            if (window.config) window.config.BRUSH_TIP = v;
            tipBtns.forEach(function (b) {
                b.classList.toggle('active', parseInt(b.dataset.tip, 10) === v);
            });
            syncTexState();
            try { if (window.settingsManager) window.settingsManager.set('brush.tip', v); } catch (_) {}
        }
        SETTERS.tip = setBrushTip;
        TIPS.forEach(function (t) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'brush-tip-btn';
            b.dataset.tip = String(t.v);
            b.textContent = t.glyph;
            b.title = t.title;
            b.addEventListener('click', function () { setBrushTip(t.v); markDirty(); });
            tipBtns.push(b);
            tipRow.appendChild(b);
        });
        panel.appendChild(tipRow);
        var texGroup = pSlider('brushTipTexture', 'Texture', 0, 1, 0.01, 'BRUSH_TIP_TEXTURE', pct, 'tipTexture');
        function syncTexState() {
            // Texture (stamp grain/blend) only shapes blob/chisel/streak
            var t = ((window.config && window.config.BRUSH_TIP) | 0);
            var on = t >= 1 && t <= 3;
            texGroup.style.opacity = on ? '1' : '0.4';
            var sl = texGroup.querySelector('input');
            if (sl) sl.disabled = !on;
        }
        (function restoreTip() {
            var saved = null;
            try { saved = window.settingsManager && window.settingsManager.get('brush.tip'); } catch (_) {}
            setBrushTip(typeof saved === 'number' ? saved : ((window.config && window.config.BRUSH_TIP) | 0));
        })();

        // ── Flow + stroke feel ──
        pSlider('brushFlow', 'Flow', 0.05, 1, 0.01, 'BRUSH_FLOW', pct, 'flow');
        sLabel('Stroke');
        pSlider('brushStabilizer', 'Stabilizer', 0, 1, 0.01, 'BRUSH_STABILIZER', pct, 'stabilizer');
        pSlider('brushSpacing', 'Spacing', 0.01, 1, 0.01, 'BRUSH_SPACING', pct, 'spacing');
        pSlider('brushJitter', 'Jitter', 0, 1, 0.01, 'BRUSH_JITTER', pct, 'jitter');

        // ── Pen pressure ──
        sLabel('Pen Pressure');
        pCheckbox('brushPressureSize', 'Pressure → Size', 'BRUSH_PRESSURE_SIZE', 'pressureSize');
        pCheckbox('brushPressureFlow', 'Pressure → Flow', 'BRUSH_PRESSURE_FLOW', 'pressureFlow');
        pSlider('brushPressureCurve', 'Curve', 0.25, 2.5, 0.05, 'BRUSH_PRESSURE_CURVE',
            function (v) { return v < 1 ? 'soft ' + v.toFixed(2) : (v > 1 ? 'hard ' + v.toFixed(2) : 'linear'); },
            'pressureCurve');

        // ── Sketch layer ──
        sLabel('Sketch Layer');
        // D2: which raster layer the Sketch route paints into + quick-add.
        // Layers are managed in the sidebar Layers panel (🖌️ per row).
        var activeLayerRow = document.createElement('div');
        activeLayerRow.className = 'brush-mode-row';
        var activeLayerLabel = document.createElement('div');
        activeLayerLabel.className = 'arm-colors-hint';
        activeLayerLabel.style.flex = '1';
        activeLayerLabel.style.alignSelf = 'center';
        function syncActiveRasterLabel() {
            var nm = '—';
            try {
                if (window.rasterLayers) {
                    var rid = window.rasterLayers.activeId();
                    var rl = (window.layers || []).find(function (x) { return x.index === rid; });
                    if (rl) nm = rl.title;
                }
            } catch (_) {}
            activeLayerLabel.textContent = 'Paints into: ' + nm;
        }
        window.__onActiveRasterChanged = function () { syncActiveRasterLabel(); };
        syncActiveRasterLabel();
        var newLayerBtn = document.createElement('button');
        newLayerBtn.type = 'button'; newLayerBtn.className = 'brush-mode-btn';
        newLayerBtn.textContent = '+ Layer';
        newLayerBtn.title = 'Add a new paint layer and make it the brush target (reorder it in the Layers panel — above or below the fluid)';
        newLayerBtn.addEventListener('click', function () {
            if (window.rasterLayers) { window.rasterLayers.create(); syncActiveRasterLabel(); }
        });
        activeLayerRow.appendChild(activeLayerLabel);
        activeLayerRow.appendChild(newLayerBtn);
        panel.appendChild(activeLayerRow);
        pCheckbox('brushEraser', 'Eraser (Sketch/Mask)', 'BRUSH_ERASER', 'eraser');
        pSlider('brushHardness', 'Hardness', 0, 1, 0.01, 'BRUSH_HARDNESS', pct, 'hardness');
        pCheckbox('sketchVisible', 'Show Paint Layers', 'SKETCH_VISIBLE');
        var sketchBtnRow = document.createElement('div');
        sketchBtnRow.className = 'brush-mode-row';
        var clearSketchBtn = document.createElement('button');
        clearSketchBtn.type = 'button'; clearSketchBtn.className = 'brush-mode-btn';
        clearSketchBtn.textContent = 'Clear Sketch';
        clearSketchBtn.addEventListener('click', function () {
            if (typeof window.__clearSketch === 'function') window.__clearSketch();
        });
        var sketchColliderBtn = document.createElement('button');
        sketchColliderBtn.type = 'button'; sketchColliderBtn.className = 'brush-mode-btn';
        sketchColliderBtn.textContent = '→ Collider';
        sketchColliderBtn.title = 'Turn the sketch layer into a collision layer — the fluid flows around what you drew';
        sketchColliderBtn.addEventListener('click', function () {
            if (window.collisionLayers && typeof window.collisionLayers.createFromSketch === 'function') {
                window.collisionLayers.createFromSketch();
            }
        });
        // D3/D4: live binding — the collider tracks the sketch as you draw
        var liveColliderBtn = document.createElement('button');
        liveColliderBtn.type = 'button'; liveColliderBtn.className = 'brush-mode-btn';
        liveColliderBtn.textContent = '⟳ Live';
        liveColliderBtn.title = 'Live collider: the collision layer keeps tracking the sketch — draw, erase, or undo and the fluid reacts after every stroke';
        liveColliderBtn.addEventListener('click', function () {
            if (!window.collisionLayers || typeof window.collisionLayers.setSketchLive !== 'function') return;
            window.collisionLayers.setSketchLive(!window.collisionLayers.isSketchLive());
        });
        // Reflect state changes from either direction (click or auto-disable
        // when the bound source gets deleted). One live-binding slot exists;
        // src says whether it currently tracks a paint layer or a mask.
        window.__onSketchLiveChanged = function (on, src) {
            var isMask = !!(src && src.kind === 'mask');
            liveColliderBtn.classList.toggle('active', !!on && !isMask);
            if (window.__maskLiveBtn) window.__maskLiveBtn.classList.toggle('active', !!on && isMask);
        };
        sketchBtnRow.appendChild(clearSketchBtn);
        sketchBtnRow.appendChild(sketchColliderBtn);
        sketchBtnRow.appendChild(liveColliderBtn);
        panel.appendChild(sketchBtnRow);

        // D2 bridges: sketch ↔ fluid
        var bridgeRow = document.createElement('div');
        bridgeRow.className = 'brush-mode-row';
        var igniteBtn = document.createElement('button');
        igniteBtn.type = 'button'; igniteBtn.className = 'brush-mode-btn';
        igniteBtn.textContent = '🔥 Ignite';
        igniteBtn.title = 'Pour the sketch into the fluid as dye — the sim takes it from there (sketch is untouched)';
        igniteBtn.addEventListener('click', function () {
            if (typeof window.__igniteSketch === 'function') window.__igniteSketch(1);
        });
        var captureBtn = document.createElement('button');
        captureBtn.type = 'button'; captureBtn.className = 'brush-mode-btn';
        captureBtn.textContent = '❄ Capture';
        captureBtn.title = 'Freeze the current fluid dye into the sketch layer (composited over what\'s there; undoable)';
        captureBtn.addEventListener('click', function () {
            if (typeof window.__captureToSketch === 'function') window.__captureToSketch();
        });
        bridgeRow.appendChild(igniteBtn);
        bridgeRow.appendChild(captureBtn);
        panel.appendChild(bridgeRow);

        // D6: sketch stroke undo/redo (also Ctrl+Z / Ctrl+Shift+Z in Sketch mode)
        var undoRow = document.createElement('div');
        undoRow.className = 'brush-mode-row';
        var undoBtn = document.createElement('button');
        undoBtn.type = 'button'; undoBtn.className = 'brush-mode-btn';
        undoBtn.textContent = '↶ Undo';
        undoBtn.title = 'Undo the last sketch stroke / Clear / Capture (Ctrl+Z while painting into Sketch)';
        undoBtn.addEventListener('click', function () {
            if (typeof window.__sketchUndo === 'function') window.__sketchUndo();
        });
        var redoBtn = document.createElement('button');
        redoBtn.type = 'button'; redoBtn.className = 'brush-mode-btn';
        redoBtn.textContent = '↷ Redo';
        redoBtn.title = 'Redo (Ctrl+Shift+Z or Ctrl+Y while painting into Sketch)';
        redoBtn.addEventListener('click', function () {
            if (typeof window.__sketchRedo === 'function') window.__sketchRedo();
        });
        undoRow.appendChild(undoBtn);
        undoRow.appendChild(redoBtn);
        panel.appendChild(undoRow);

        // ── D3: Masks — paint coverage, bind it as a collider ──
        sLabel('Mask');
        var maskInfoRow = document.createElement('div');
        maskInfoRow.className = 'brush-mode-row';
        var maskInfoLabel = document.createElement('div');
        maskInfoLabel.className = 'arm-colors-hint';
        maskInfoLabel.style.flex = '1';
        maskInfoLabel.style.alignSelf = 'center';
        function syncActiveMaskLabel() {
            var nm = '—';
            try {
                if (window.Masks) {
                    var mid = window.Masks.activeId();
                    var m = window.Masks.list().find(function (x) { return x.id === mid; });
                    if (m) nm = m.name;
                }
            } catch (_) {}
            maskInfoLabel.textContent = 'Active mask: ' + nm;
        }
        window.__onActiveMaskChanged = function () { syncActiveMaskLabel(); };
        syncActiveMaskLabel();
        var newMaskBtn = document.createElement('button');
        newMaskBtn.type = 'button'; newMaskBtn.className = 'brush-mode-btn';
        newMaskBtn.textContent = '+ Mask';
        newMaskBtn.title = 'Create a new mask and make it the paint target';
        newMaskBtn.addEventListener('click', function () {
            if (window.Masks) { window.Masks.create(); setBrushTarget('mask'); syncActiveMaskLabel(); }
        });
        maskInfoRow.appendChild(maskInfoLabel);
        maskInfoRow.appendChild(newMaskBtn);
        panel.appendChild(maskInfoRow);
        pCheckbox('maskOverlayVisible', 'Show Mask Film', 'MASK_OVERLAY');
        var maskBtnRow = document.createElement('div');
        maskBtnRow.className = 'brush-mode-row';
        var clearMaskBtn = document.createElement('button');
        clearMaskBtn.type = 'button'; clearMaskBtn.className = 'brush-mode-btn';
        clearMaskBtn.textContent = 'Clear Mask';
        clearMaskBtn.title = 'Erase the active mask\'s coverage (undoable)';
        clearMaskBtn.addEventListener('click', function () {
            if (window.Masks) window.Masks.clear();
        });
        var maskColliderBtn = document.createElement('button');
        maskColliderBtn.type = 'button'; maskColliderBtn.className = 'brush-mode-btn';
        maskColliderBtn.textContent = '→ Collider';
        maskColliderBtn.title = 'Turn the active mask into a collision layer — the fluid flows around the painted coverage';
        maskColliderBtn.addEventListener('click', function () {
            if (window.collisionLayers && typeof window.collisionLayers.createFromMask === 'function') {
                window.collisionLayers.createFromMask();
            }
        });
        var maskLiveBtn = document.createElement('button');
        maskLiveBtn.type = 'button'; maskLiveBtn.className = 'brush-mode-btn';
        maskLiveBtn.textContent = '⟳ Live';
        maskLiveBtn.title = 'Live collider: the collision layer keeps tracking the active mask — paint, erase, or undo and the fluid reacts after every stroke';
        maskLiveBtn.addEventListener('click', function () {
            if (!window.collisionLayers || typeof window.collisionLayers.setMaskLive !== 'function') return;
            var src = window.collisionLayers.boundColliderSource && window.collisionLayers.boundColliderSource();
            var onAsMask = window.collisionLayers.isSketchLive() && src && src.kind === 'mask';
            window.collisionLayers.setMaskLive(!onAsMask);
        });
        window.__maskLiveBtn = maskLiveBtn;
        maskBtnRow.appendChild(clearMaskBtn);
        maskBtnRow.appendChild(maskColliderBtn);
        maskBtnRow.appendChild(maskLiveBtn);
        panel.appendChild(maskBtnRow);

        // Size fader tweaks also diverge from an applied preset
        var sizeFader = document.getElementById('brushSize');
        if (sizeFader) sizeFader.addEventListener('input', markDirty);

        // ── Open / close ──
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = panel.style.display !== 'none';
            if (open) {
                panel.style.display = 'none';
                trigger.classList.remove('active');
            } else {
                panel.style.display = 'block';
                trigger.classList.add('active');
                positionPanel();
                renderPresetChips();
            }
        });
        document.addEventListener('click', function (e) {
            if (panel.style.display !== 'none' && !panel.contains(e.target)
                && e.target !== trigger && !trigger.contains(e.target)) {
                panel.style.display = 'none';
                trigger.classList.remove('active');
            }
        });
        panel.addEventListener('click', function (e) { e.stopPropagation(); });
        window.addEventListener('resize', function () {
            if (panel.style.display !== 'none') positionPanel();
        });
    }


    // \u2500\u2500 Branding panel (redesigned): create overlays + arrange (select/drag/
    //    resize/rotate) via window.brandingOverlays. Replaces the old preset-only
    //    panel (buildBrandingSection_OLD_UNUSED deleted 2026-07-09; git history has it). \u2500\u2500
    function buildBrandingSection() {
        const { sec, body } = makeSection('\ud83c\udfa8 Branding', 'pink', true);

        function api() { return window.brandingOverlays; }

        // \u2500\u2500 Arrange toggle (the headline feature) \u2500\u2500
        var arrangeBtn = document.createElement('button');
        arrangeBtn.type = 'button';
        arrangeBtn.className = 'branding-arrange-btn';
        arrangeBtn.style.cssText = 'width:100%;margin-bottom:4px;padding:7px;font-size:11px;font-weight:600;border-radius:4px;background:rgba(255,130,170,0.18);border:1px solid rgba(255,130,170,0.3);color:white;cursor:pointer;';
        body.appendChild(arrangeBtn);

        var arrangeHint = document.createElement('div');
        arrangeHint.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin:0 0 10px;text-align:center;line-height:1.35;';
        arrangeHint.textContent = 'Drag overlays on the canvas to move; corners resize, top handle rotates. Painting pauses while arranging.';
        body.appendChild(arrangeHint);

        function syncArrangeBtn() {
            var on = !!(api() && api().isArranging());
            arrangeBtn.textContent = on ? '\u2713 Done Arranging' : '\u270b Arrange Overlays';
            arrangeBtn.classList.toggle('active', on);
        }
        arrangeBtn.addEventListener('click', function () {
            var a = api(); if (!a) return;
            if (a.isArranging()) a.closeArrange(); else a.openArrange();
            syncArrangeBtn();
        });

        // \u2500\u2500 Add: Text \u2500\u2500
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
        textInput.style.cssText = 'flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;padding:4px 6px;border-radius:3px;font-size:11px;';
        var colorPick = document.createElement('input');
        colorPick.type = 'color';
        colorPick.value = '#ffffff';
        colorPick.id = 'brandingTextColor';
        colorPick.title = 'Text colour';
        colorPick.style.cssText = 'width:26px;height:24px;border:none;padding:0;cursor:pointer;background:transparent;flex:none;';
        var sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.id = 'brandingTextSize';
        sizeInput.value = '24'; sizeInput.min = '8'; sizeInput.max = '200';
        sizeInput.title = 'Font size';
        sizeInput.style.cssText = 'width:38px;height:24px;font-size:10px;text-align:center;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:3px;flex:none;';
        var textAddBtn = document.createElement('button');
        textAddBtn.type = 'button';
        textAddBtn.textContent = '+ Add';
        textAddBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:3px;background:rgba(255,130,170,0.2);border:1px solid rgba(255,130,170,0.3);color:white;cursor:pointer;flex:none;';
        textRow.appendChild(textInput);
        textRow.appendChild(colorPick);
        textRow.appendChild(sizeInput);
        textRow.appendChild(textAddBtn);
        body.appendChild(textRow);

        var quickRow = document.createElement('div');
        quickRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:10px;';
        ['\ud83d\udd34 LIVE', 'Follow me!', 'Link in bio', '\u2764\ufe0f + \ud83d\udc4d'].forEach(function (text) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = 'padding:2px 6px;font-size:9px;border-radius:3px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);cursor:pointer;';
            b.addEventListener('click', function () { textInput.value = text; textInput.focus(); });
            quickRow.appendChild(b);
        });
        body.appendChild(quickRow);

        // \u2500\u2500 Add: Logo / Image \u2500\u2500
        var imgLabel = document.createElement('label');
        imgLabel.className = 'brush-section-label';
        imgLabel.textContent = 'Logo / Image';
        body.appendChild(imgLabel);
        var imgUploadBtn = document.createElement('button');
        imgUploadBtn.type = 'button';
        imgUploadBtn.textContent = '\ud83d\udcce Upload Logo';
        imgUploadBtn.style.cssText = 'width:100%;margin-bottom:10px;padding:5px 8px;font-size:10px;border-radius:3px;background:rgba(255,200,100,0.15);border:1px solid rgba(255,200,100,0.2);color:white;cursor:pointer;';
        var imgFileInput = document.createElement('input');
        imgFileInput.type = 'file';
        imgFileInput.accept = 'image/png,image/svg+xml,image/jpeg,image/webp';
        imgFileInput.style.display = 'none';
        body.appendChild(imgUploadBtn);
        body.appendChild(imgFileInput);

        // \u2500\u2500 Add: QR \u2500\u2500
        var qrLabel = document.createElement('label');
        qrLabel.className = 'brush-section-label';
        qrLabel.textContent = 'QR Code';
        body.appendChild(qrLabel);
        var qrRow = document.createElement('div');
        qrRow.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;';
        var qrInput = document.createElement('input');
        qrInput.type = 'text';
        qrInput.placeholder = 'https://tiktok.com/@handle';
        qrInput.style.cssText = 'flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:white;padding:4px 6px;border-radius:3px;font-size:10px;';
        var qrAddBtn = document.createElement('button');
        qrAddBtn.type = 'button';
        qrAddBtn.textContent = '+ QR';
        qrAddBtn.style.cssText = 'padding:4px 8px;font-size:10px;border-radius:3px;background:rgba(180,130,255,0.2);border:1px solid rgba(180,130,255,0.3);color:white;cursor:pointer;flex:none;';
        qrRow.appendChild(qrInput);
        qrRow.appendChild(qrAddBtn);
        body.appendChild(qrRow);

        // \u2500\u2500 Active Overlays list \u2500\u2500
        var listLabel = document.createElement('label');
        listLabel.className = 'brush-section-label';
        listLabel.textContent = 'Active Overlays';
        body.appendChild(listLabel);
        var overlayList = document.createElement('div');
        overlayList.id = 'brandingOverlayList';
        overlayList.style.cssText = 'max-height:170px;overflow-y:auto;margin-bottom:6px;';
        body.appendChild(overlayList);

        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = '\ud83d\uddd1 Clear All';
        clearBtn.style.cssText = 'width:100%;padding:4px;font-size:10px;border-radius:3px;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.2);color:rgba(255,255,255,0.6);cursor:pointer;';
        body.appendChild(clearBtn);

        function mkRowBtn(txt, title, fn) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = txt;
            b.title = title;
            b.style.cssText = 'padding:1px 5px;font-size:12px;background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.7);line-height:1;flex:none;';
            b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
            return b;
        }

        function refreshList() {
            var a = api();
            overlayList.innerHTML = '';
            if (!a) return;
            var all = a.getAll();
            if (!all.length) {
                overlayList.innerHTML = '<div style="font-size:9px;color:rgba(255,255,255,0.3);text-align:center;padding:8px;">No overlays yet \u2014 add one above</div>';
                return;
            }
            var selId = a.getSelectedId();
            all.forEach(function (ov) {
                var isSel = ov.id === selId;
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px;border-radius:3px;cursor:pointer;border:1px solid ' + (isSel ? 'rgba(255,130,170,0.5)' : 'transparent') + ';background:' + (isSel ? 'rgba(255,130,170,0.12)' : 'transparent') + ';';

                var icon = ov.type === 'text' ? '\u2709' : ov.type === 'image' ? '\ud83d\uddbc' : '\ud83d\udcf1';
                var desc = ov.type === 'text' ? ov.content : ov.type === 'image' ? 'Logo' : ov.url;
                var label = document.createElement('span');
                label.style.cssText = 'flex:1;min-width:0;font-size:10px;color:rgba(255,255,255,' + (ov.visible ? '0.75' : '0.35') + ');overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                label.textContent = icon + ' ' + desc;

                row.addEventListener('click', function () {
                    a.openArrange(ov.id);
                    syncArrangeBtn();
                    refreshList();
                });

                var moveBtn = mkRowBtn('\u2725', 'Arrange / move', function () { a.openArrange(ov.id); syncArrangeBtn(); refreshList(); });
                var toggleBtn = mkRowBtn(ov.visible ? '\ud83d\udc41' : '\ud83d\ude48', 'Toggle visibility', function () { a.toggle(ov.id); refreshList(); });
                var rmBtn = mkRowBtn('\u00d7', 'Remove', function () { a.remove(ov.id); refreshList(); });
                rmBtn.style.color = 'rgba(255,90,90,0.85)';
                rmBtn.style.fontWeight = 'bold';
                rmBtn.style.fontSize = '14px';

                row.appendChild(label);
                row.appendChild(moveBtn);
                row.appendChild(toggleBtn);
                row.appendChild(rmBtn);
                overlayList.appendChild(row);
            });
        }

        // \u2500\u2500 Wire creation \u2500\u2500
        function addText() {
            var t = textInput.value.trim();
            if (!t) { textInput.focus(); return; }
            var a = api(); if (!a) return;
            a.addText({ content: t, color: colorPick.value, fontSize: parseInt(sizeInput.value, 10) || 24 });
            textInput.value = '';
            refreshList();
        }
        textAddBtn.addEventListener('click', addText);
        textInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addText(); e.stopPropagation(); });

        imgUploadBtn.addEventListener('click', function () { imgFileInput.click(); });
        imgFileInput.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) { var a = api(); if (a) { a.addImage({ src: ev.target.result }); refreshList(); } };
            reader.readAsDataURL(file);
            imgFileInput.value = '';
        });

        qrAddBtn.addEventListener('click', function () {
            var url = qrInput.value.trim();
            if (!url) { qrInput.focus(); return; }
            var a = api(); if (a) { a.addQR({ url: url }); qrInput.value = ''; refreshList(); }
        });
        qrInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') qrAddBtn.click(); e.stopPropagation(); });

        clearBtn.addEventListener('click', function () { var a = api(); if (a) { a.clearAll(); refreshList(); } });

        // \u2500\u2500 Init + subscribe to overlay changes (drag updates the list highlight) \u2500\u2500
        function ready() {
            if (!api()) { setTimeout(ready, 100); return; }
            api().onChange(function () { syncArrangeBtn(); refreshList(); });
            syncArrangeBtn();
            refreshList();
        }
        setTimeout(ready, 200);

        return sec;
    }

    // \u2500\u2500\u2500 AUDIO \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Sidebar holds a compact "Audio" mini + an Off/Min/Full mode select. The
    // full React controls + the Composer segment timeline live in the shared
    // bottom drawer (Audio tab). Mirrors the Record feature's mini/drawer split.

    var audioDrawerBuilt = false;
    var audioMiniRaf = null;

    function buildAudioSection() {
        const { sec, body } = makeSection('\ud83c\udfb5 Audio', 'purple', false);

        // Mode select (Off / Minimized / Full) \u2014 mirrors recMode
        var modeGroup = document.createElement('div');
        modeGroup.className = 'control-group';
        var modeLbl = document.createElement('label');
        modeLbl.setAttribute('for', 'audioMode');
        modeLbl.textContent = 'Audio Mode';
        var modeSel = document.createElement('select');
        modeSel.id = 'audioMode';
        // off → three fire-and-forget scenes (30-audio-scenes.js) → min → full
        modeSel.innerHTML =
            '<option value="off" selected>Off</option>' +
            '<option value="tunnel">🌀 Tunnel</option>' +
            '<option value="ferro">🧲 Ferrofluid</option>' +
            '<option value="min">Minimized</option>' +
            '<option value="full">Full</option>';
        modeGroup.appendChild(modeLbl);
        modeGroup.appendChild(modeSel);
        body.appendChild(modeGroup);

        // Scene widget: hosts the shared enable row + the active scene's
        // quick controls. Shown only while a scene mode is selected.
        var sceneBox = document.createElement('div');
        sceneBox.id = 'audioSceneBox';
        sceneBox.className = 'audio-mini';
        sceneBox.style.display = 'none';
        var sceneCtlHost = document.createElement('div');
        sceneCtlHost.id = 'audioSceneControls';
        sceneBox.appendChild(sceneCtlHost);
        body.appendChild(sceneBox);

        // Minimized widget: enable + source + small segments timeline + Full button
        var mini = document.createElement('div');
        mini.id = 'audioMini';
        mini.className = 'audio-mini';
        mini.style.display = 'none';
        mini.innerHTML =
            '<div class="audio-mini-row">' +
                '<label class="audio-mini-enable"><input type="checkbox" id="audioReactToggle"><span>Enable</span></label>' +
                '<select id="audioReactSource" class="audio-mini-src">' +
                    '<option value="mic">Mic</option><option value="system">System</option><option value="file">File</option>' +
                '</select>' +
            '</div>' +
            '<canvas id="audioMiniTimeline" class="audio-mini-timeline" title="Composer segments"></canvas>' +
            '<button id="audioOpenFullBtn" class="audio-mini-full" title="Open full audio panel">\u2b06\ufe0f Full Audio</button>';
        body.appendChild(mini);

        // Hidden file input used by the enable/source paths
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.style.display = 'none';
        fileInput.id = 'audioReactFile';
        body.appendChild(fileInput);

        var enableCb = mini.querySelector('#audioReactToggle');
        var srcSel = mini.querySelector('#audioReactSource');
        // The enable row (checkbox + source) is SHARED between the mini widget
        // and the full drawer: the same DOM nodes are relocated on mode change
        // so there's exactly one control and zero state-sync problems. Without
        // this, Full mode had no enable control at all (the mini is hidden).
        var enableRow = mini.querySelector('.audio-mini-row');
        function enableFromSource() {
            if (!window.audioReactive) return;
            var src = srcSel.value;
            if (src === 'file') fileInput.click();
            else window.audioReactive.enable(src);
        }
        enableCb.addEventListener('change', function () {
            if (!window.audioReactive) return;
            if (enableCb.checked) enableFromSource();
            else window.audioReactive.disable();
        });
        srcSel.addEventListener('change', function () {
            if (enableCb.checked && window.audioReactive) { window.audioReactive.disable(); enableFromSource(); }
        });
        fileInput.addEventListener('change', function (e) {
            var f = e.target.files && e.target.files[0];
            if (f && window.audioReactive) window.audioReactive.enable('file', f);
            else enableCb.checked = false;
            fileInput.value = '';
        });

        mini.querySelector('#audioOpenFullBtn').addEventListener('click', function () {
            modeSel.value = 'full';
            modeSel.dispatchEvent(new Event('change'));
        });

        function applyAudioMode(mode, userInitiated) {
            var isScene = !!(window.AudioScenes && window.AudioScenes.isScene(mode));
            // Park the shared enable row where the active mode can reach it
            var enableHost = document.getElementById('audioDrawerEnableHost');
            if (mode === 'full' && enableHost && enableRow) {
                enableHost.appendChild(enableRow);
            } else if (isScene && enableRow) {
                sceneBox.insertBefore(enableRow, sceneBox.firstChild);
            } else if (enableRow && enableRow.parentElement !== mini) {
                mini.insertBefore(enableRow, mini.firstChild);
            }
            // Scene lifecycle: activate on scene modes, tear down otherwise
            if (window.AudioScenes) {
                if (isScene) window.AudioScenes.activate(mode);
                else window.AudioScenes.deactivate();
            }
            if (!isScene) sceneBox.style.display = 'none';
            if (mode === 'off') {
                mini.style.display = 'none';
                if (window.audioReactive) window.audioReactive.disable();
                if (enableCb) enableCb.checked = false;
                if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'audio') window.studioDrawer.close();
                stopAudioMiniLoop();
            } else if (isScene) {
                mini.style.display = 'none';
                sceneBox.style.display = '';
                if (window.AudioScenes) window.AudioScenes.buildControls(mode, sceneCtlHost);
                if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'audio') window.studioDrawer.close();
                stopAudioMiniLoop();
                // Fire-and-forget: a user picking a scene wants sound NOW — start
                // the engine from the selected source. Restored sessions (synthetic
                // change events) skip this so page load never pops a mic prompt.
                if (userInitiated && window.audioReactive && !window.audioReactive.isEnabled()) {
                    enableCb.checked = true;
                    enableFromSource();
                }
            } else if (mode === 'min') {
                mini.style.display = '';
                if (window.studioDrawer && window.studioDrawer.isOpen() && window.studioDrawer.activeTab() === 'audio') window.studioDrawer.close();
                startAudioMiniLoop();
            } else if (mode === 'full') {
                mini.style.display = 'none';
                ensureAudioDrawer();
                if (window.studioDrawer) window.studioDrawer.open('audio');
                stopAudioMiniLoop();
            }
        }
        modeSel.addEventListener('change', function (e) { applyAudioMode(e.target.value, e.isTrusted); });

        // Build the drawer controls + composer up front (into the hidden panel) so
        // their element IDs always exist for save/load, mutation locks, and the
        // engine's viz registration — matching how the controls were always built
        // before. The Audio tab just reveals the already-built panel.
        ensureAudioDrawer();
        applyAudioMode(modeSel.value);

        return sec;
    }

    function ensureAudioDrawer() {
        if (audioDrawerBuilt) return;
        var panel = document.getElementById('audioDrawerPanel');
        if (!panel) return;
        buildAudioDrawerControls(panel);
        audioDrawerBuilt = true;
    }

    // \u2500\u2500 Mini segments timeline (overlapping active areas) \u2500\u2500
    function startAudioMiniLoop() {
        if (audioMiniRaf) return;
        // rAF is uncapped in Electron — throttle to ~30 Hz and skip while the
        // mini is hidden (a timeline preview needs no more)
        var lastDraw = 0;
        var draw = function () {
            audioMiniRaf = requestAnimationFrame(draw);
            var now = performance.now();
            if (now - lastDraw < 33) return;
            var cv = document.getElementById('audioMiniTimeline');
            if (!cv || cv.offsetParent === null) return;
            lastDraw = now;
            drawAudioMiniTimeline();
        };
        audioMiniRaf = requestAnimationFrame(draw);
    }
    function stopAudioMiniLoop() {
        if (audioMiniRaf) { cancelAnimationFrame(audioMiniRaf); audioMiniRaf = null; }
    }
    function miniRoundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, h / 2, w / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    }
    function drawAudioMiniTimeline() {
        var cv = document.getElementById('audioMiniTimeline');
        if (!cv) return;
        var rect = cv.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        var dpr = window.devicePixelRatio || 1;
        var w = Math.max(1, Math.round(rect.width * dpr));
        var h = Math.max(1, Math.round(rect.height * dpr));
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        var comp = window.audioComposer;
        if (!comp || !comp.getState) return;
        var st = comp.getState();
        var dur = (comp.getDurationMs ? comp.getDurationMs() : st.durationMs) || 1;
        var tracks = st.tracks || [];
        var palette = comp.palette || ['#b48cff', '#4dd2ff', '#4dff7a', '#ffb24d', '#ff6fae'];
        var n = Math.max(1, tracks.length);
        var pad = 2 * dpr;
        var laneH = (h - pad * (n + 1)) / n;
        for (var i = 0; i < tracks.length; i++) {
            var y = pad + i * (laneH + pad);
            var color = palette[i % palette.length];
            var segs = tracks[i].segments || [];
            ctx.globalAlpha = 0.85;
            for (var j = 0; j < segs.length; j++) {
                var s = segs[j];
                var x = (s.startMs / dur) * w;
                var bw = Math.max(2 * dpr, (s.durMs / dur) * w);
                ctx.fillStyle = color;
                miniRoundRect(ctx, x, y, bw, laneH, 2 * dpr);
            }
        }
        ctx.globalAlpha = 1;
        var ph = comp.getPlayheadMs ? comp.getPlayheadMs() : 0;
        var px = (ph / dur) * w;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, h); ctx.stroke();
    }

    function buildAudioDrawerControls(container) {
        container.innerHTML = '';
        var body = container;

        // Host for the shared enable row (checkbox + source select). The row's
        // DOM nodes live in the sidebar mini widget and are moved here whenever
        // Audio Mode is 'full' — see applyAudioMode.
        var enableHost = document.createElement('div');
        enableHost.id = 'audioDrawerEnableHost';
        enableHost.className = 'audio-drawer-enable';
        body.appendChild(enableHost);

        // Visualizer canvas
        var vizWrap = document.createElement('div');
        vizWrap.style.cssText = 'margin:8px 0;border-radius:6px;overflow:hidden;background:#000;';
        var vizCanvas = document.createElement('canvas');
        vizCanvas.id = 'audioReactViz';
        vizCanvas.style.cssText = 'width:100%;height:160px;display:block;background:#000;';
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

        // Auto-splat pattern — visual emission-pattern picker (drives the bass
        // auto-splat generator). Tiles map to window.audioReactive generators.
        var splatModeGroup = document.createElement('div');
        splatModeGroup.className = 'control-group';
        splatModeGroup.style.marginTop = '8px';
        var splatModeLbl = document.createElement('label');
        splatModeLbl.textContent = 'Auto-Splat Pattern';
        splatModeLbl.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:0.4px;opacity:0.7;margin-bottom:4px;display:block';
        splatModeGroup.appendChild(splatModeLbl);

        var patGrid = document.createElement('div');
        patGrid.className = 'ar-pattern-grid';
        var patterns = [
            ['center', '◉', 'Center'], ['random', '✦', 'Scatter'], ['circular', '◯', 'Orbit'],
            ['grid', '▦', 'Grid'], ['spiral', '🌀', 'Spiral'], ['radialBurst', '✺', 'Burst'],
            ['freqMap', '∿', 'Freq']
        ];
        var patBtns = {};
        patterns.forEach(function (p) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ar-pattern-btn' + (p[0] === 'center' ? ' active' : '');
            b.dataset.gen = p[0];
            b.title = p[2] + ' — bass auto-splat pattern';
            b.innerHTML = '<span class="ar-pat-glyph">' + p[1] + '</span><span class="ar-pat-label">' + p[2] + '</span>';
            b.addEventListener('click', function () {
                Object.keys(patBtns).forEach(function (k) { patBtns[k].classList.remove('active'); });
                b.classList.add('active');
                if (window.audioReactive) window.audioReactive.setAutoSplatMode(p[0]);
            });
            patBtns[p[0]] = b;
            patGrid.appendChild(b);
        });
        splatModeGroup.appendChild(patGrid);
        body.appendChild(splatModeGroup);

        // ─── Wire events ───
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

        // Register visualizer canvas after a frame (needs dimensions)
        requestAnimationFrame(function () {
            if (window.audioReactive) window.audioReactive.registerViz(vizCanvas);
        });

        // Mirror the engine config onto these controls whenever the composer
        // applies a segment, so the panel visibly changes as the playhead crosses
        // segments. (--val is set directly because programmatic .value doesn't
        // fire the input event the slider fill listens for.)
        function syncAudioUIFromEngine() {
            if (!window.audioReactive || !window.audioReactive.getConfig) return;
            var c = window.audioReactive.getConfig();
            if (typeof c.sensitivity === 'number') {
                sensSlider.value = c.sensitivity;
                sensSlider.style.setProperty('--val', String(c.sensitivity));
                var sv = document.getElementById('audioSensValue'); if (sv) sv.textContent = c.sensitivity.toFixed(1);
            }
            if (typeof c.beatThreshold === 'number') {
                beatSlider.value = c.beatThreshold;
                beatSlider.style.setProperty('--val', String(c.beatThreshold));
                var bv = document.getElementById('audioBeatValue'); if (bv) bv.textContent = c.beatThreshold.toFixed(2);
            }
            if (c.mappings) {
                var setCb = function (id, val) { var cb = document.getElementById(id); if (cb && typeof val === 'boolean') cb.checked = val; };
                setCb('arMapAutoSplat', c.mappings.bassAutoSplat);
                setCb('arMapSize', c.mappings.overallToSize);
                setCb('arMapKaleido', c.mappings.midToKaleido);
                setCb('arMapColor', c.mappings.trebleToColor);
            }
            if (typeof c.autoSplatMode === 'string') {
                Object.keys(patBtns).forEach(function (k) { patBtns[k].classList.toggle('active', k === c.autoSplatMode); });
            }
        }
        if (window.audioReactive && window.audioReactive.onConfigChange) {
            window.audioReactive.onConfigChange(syncAudioUIFromEngine);
        }

        // Composer segment timeline lives below the React controls in the drawer
        var compWrap = document.createElement('div');
        compWrap.className = 'audio-drawer-composer';
        body.appendChild(compWrap);
        (function mountComposer() {
            if (window.audioComposer && window.audioComposer.mount) window.audioComposer.mount(compWrap);
            else setTimeout(mountComposer, 150);
        })();
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
        // Expanded by default so multiplayer is discoverable (it was buried collapsed).
        const { sec, body } = makeSection('🌐 Multi Artist', 'blue', false);

        // Move the new multi artist panel
        var panel = document.getElementById('multiArtistPanel');
        if (panel) body.appendChild(panel);

        // Move hidden toggle for legacy compat
        var toggle = document.getElementById('multiplayerToggle');
        if (toggle) body.appendChild(toggle);

        // When the section is expanded by the user, focus the join field so a
        // joiner can paste a room # immediately (only while disconnected).
        var header = sec.querySelector('.section-header');
        if (header) header.addEventListener('click', function () {
            if (sec.classList.contains('collapsed')) return; // just collapsed
            var dc = document.getElementById('mpDisconnected');
            var ji = document.getElementById('joinRoomInput');
            if (ji && dc && dc.style.display !== 'none') {
                setTimeout(function () { ji.focus(); ji.select(); }, 50);
            }
        });

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
        comfyLabel.textContent = 'Set Save To Folder (Ctrl+Enter)';
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

        // Capture resolution row (fixed output size for consistency)
        var capRow = document.createElement('div');
        capRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';
        var capLbl = document.createElement('span');
        capLbl.textContent = 'Capture';
        capLbl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.5);min-width:48px;';
        var capW = document.createElement('input');
        capW.type = 'number';
        capW.placeholder = 'W';
        capW.min = '0';
        capW.style.cssText = 'width:60px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 6px;color:#c9d1d9;font-size:11px;';
        var capH = document.createElement('input');
        capH.type = 'number';
        capH.placeholder = 'H';
        capH.min = '0';
        capH.style.cssText = 'width:60px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 6px;color:#c9d1d9;font-size:11px;';
        var capHint = document.createElement('span');
        capHint.textContent = '0=auto';
        capHint.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);';
        // Load saved values
        if (window.comfyuiBridge) {
            var capCfg = window.comfyuiBridge.getConfig();
            if (capCfg.captureWidth) capW.value = capCfg.captureWidth;
            if (capCfg.captureHeight) capH.value = capCfg.captureHeight;
        }
        function saveCapRes() {
            if (!window.comfyuiBridge) return;
            window.comfyuiBridge.setConfig('captureWidth', parseInt(capW.value, 10) || 0);
            window.comfyuiBridge.setConfig('captureHeight', parseInt(capH.value, 10) || 0);
        }
        capW.addEventListener('change', saveCapRes);
        capH.addEventListener('change', saveCapRes);
        capRow.appendChild(capLbl);
        capRow.appendChild(capW);
        capRow.appendChild(capH);
        capRow.appendChild(capHint);
        comfySection.appendChild(capRow);

        // ComfyUI writes canvas frames to a local watched folder (Electron/filesystem
        // only) — it cannot work in a browser, so only show the control in the desktop
        // app. window.comfyuiBridge exists ONLY in Electron (comfyui-bridge.js guards on
        // `require`), so this hides it on web AND mobile.
        if (window.comfyuiBridge) body.appendChild(comfySection);

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

    function buildArmColorsDropdown(triggerEl) {
        // Use an existing element (e.g. the multiplier value) as the toggle, or
        // fall back to a standalone gold icon button.
        var toggle;
        if (triggerEl) {
            toggle = triggerEl;
            toggle.classList.add('arm-colors-trigger');
            toggle.title = 'Per-arm brush colors \u2014 click to configure';
        } else {
            toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'arm-colors-toggle';
            toggle.textContent = '\u2726';
            toggle.title = 'Per-arm color settings';
        }

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
        header.textContent = 'Brush Colors';
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
        // Exposed for the picker→arm-0 sync in 05g (two-way brush color sync)
        window.persistArmColors = persistArmColors;

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

        // Two-way sync, panel → main picker: arm 0 IS the brush, so giving it
        // a fixed color should be the same act as picking a color in the
        // sidebar picker (dispatching 'input' also unchecks random/step and
        // applies pointer.color via 05g's listener). The reverse direction
        // (picker → arm 0) lives in 05g's colorPicker input handler.
        function syncMainPickerFromArm0() {
            var cfg = (window.multiArmColors || [])[0];
            if (!cfg || cfg.mode !== 'fixed' || !cfg.color) return;
            var cp = document.getElementById('colorPicker');
            if (cp && cp.value !== cfg.color) {
                cp.value = cfg.color;
                cp.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        function rebuildRows() {
            rowsWrap.innerHTML = '';
            var slider = document.getElementById('multiplier');
            var count = slider ? parseInt(slider.value, 10) || 1 : 1;
            // Brush controls exist at EVERY arm count (2026-07-13) — at 1x the
            // single row IS the brush's color mode (follow/fixed/rainbow/
            // random/step). The old "set multiplier to 2+" hint gated the
            // whole panel behind multi-arm mode.
            count = Math.max(1, count);
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
                            if (idx === 0) syncMainPickerFromArm0();
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
                        if (idx === 0) syncMainPickerFromArm0();
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
            // Persist collapsed states
            try {
                var sections = {};
                document.querySelectorAll('#sidebar-right .sidebar-section').forEach(function(sec) {
                    var titleEl = sec.querySelector('.section-title');
                    if (titleEl) sections[titleEl.textContent.trim()] = sec.classList.contains('collapsed');
                });
                if (window.settingsManager) window.settingsManager.set('sidebar.sections', sections);
            } catch(_) {}
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
