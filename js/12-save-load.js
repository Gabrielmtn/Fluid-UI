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
        const sliders = {};
        [
            'densityDissipation','velocityDissipation','pressureDissipation','pressureIteration',
            'velocityInfluence','curl','multiplier','canvasOpacity','kSpinSpeed','kTwist','kZoom','kBlend','kAngle',
            'kaleidoSegments'
        ].forEach(id => { const v = valEl(id); if (v !== undefined) sliders[id] = num(v); });

        const checkboxes = {};
        [
            'trailToggle','cursorToggle','showCanvasHandles','lockCanvasBorders',
            'preserveFluidOpacity','statsToggle','randomColor','stepPalette','kaleidoToggle','kAnimateRot'
        ].forEach(id => { const el = $(id); if (el) checkboxes[id] = !!el.checked; });

        const selects = {};
        ['visualResolution','physicsResolution','kaleidoMode'].forEach(id => {
            const el = $(id);
            if (!el) return;
            let v = el.value;
            // If custom, get value from custom input
            if (v === 'custom') {
                const customEl = $(id + 'Custom');
                if (customEl && customEl.value) v = customEl.value;
            }
            if (v !== undefined) selects[id] = v;
        });

        const colors = {
            background: valEl('backgroundColorPicker') || '#000000',
            brush: valEl('colorPicker') || '#ffffff'
        };

        const panels = { statsPanel: getStatsPanelState() };

        const canvas = (function(){
            const c = $('canvas');
            return { width: c ? c.width : undefined, height: c ? c.height : undefined, wrapperRect: getWrapperRect() };
        })();

        // Save via Settings interface
        if (window.Settings) {
            Settings.savePanel('statsPanel', panels.statsPanel);
            Settings.saveSliders(sliders);
            Settings.saveCheckboxes(checkboxes);
            Object.entries(colors).forEach(([name, val]) => Settings.saveColor(name, val));
            Object.entries(selects).forEach(([name, val]) => Settings.saveSelect(name, val));
            if (canvas.width && canvas.height) Settings.saveCanvasSize(canvas.width, canvas.height);
            if (canvas.wrapperRect) window.settingsManager?.set('canvas.wrapperRect', canvas.wrapperRect);
            // Kaleidoscope runtime values (in addition to DOM)
            const kaleido = {
                mode: window.kaleidoMode,
                segments: window.kaleidoSegments,
                angle: window.kAngle,
                twist: window.kTwist,
                zoom: window.kZoom,
                blend: window.kBlend,
                animate: window.kAnimateRot
            };
            window.settingsManager?.set('kaleido.runtime', kaleido);
            try {
                const up = (window.userPalettes && typeof window.userPalettes === 'object') ? window.userPalettes : {};
                window.settingsManager?.set('palettes.user', up);
            } catch (_) {}
            try {
                const saved = Array.isArray(window.savedColors) ? window.savedColors.slice() : [];
                window.settingsManager?.set('palettes.savedColors', saved);
            } catch (_) {}
            try {
                const custom = Array.isArray(window.customPalettes) ? window.customPalettes.slice() : [];
                window.settingsManager?.set('palettes.custom', custom);
            } catch (_) {}
            try {
                const deleted = Array.isArray(window.deletedDefaultPalettes) ? window.deletedDefaultPalettes.slice() : [];
                window.settingsManager?.set('palettes.deletedDefaults', deleted);
            } catch (_) {}
            try {
                if (typeof currentPaletteIndex !== 'undefined') {
                    window.settingsManager?.set('palette.currentIndex', currentPaletteIndex);
                }
            } catch (_) {}
        }

        window.settingsManager?.set('meta.lastSavedAt', Date.now());

        return { panels, sliders, checkboxes, colors, selects, canvas };
    }

    function applyFromSettings() {
        if (!window.settingsManager) return;

        const cp = window.settingsManager.get('palettes.custom');
        if (Array.isArray(cp) && typeof window.addCustomPalettes === 'function') {
            try { window.addCustomPalettes(cp); } catch (_) {}
        }
        const up = window.settingsManager.get('palettes.user');
        if (up && typeof up === 'object') {
            window.userPalettes = up;
        }

        // Panels
        const p = window.Settings ? Settings.loadPanel('statsPanel') : null;
        if (p) {
            setCheck('statsToggle', !!p.enabled);
            // position will be applied by draggable on startup, but apply now if desired
            if (p.position) {
                const panel = $('statsPanel'); if (panel) { panel.style.left = p.position.x + 'px'; panel.style.top = p.position.y + 'px'; }
            }
            const pinBtn = $('statsPinBtn'); if (pinBtn) pinBtn.classList.toggle('pinned', !!p.pinned);
        }

        // Sliders
        const sliderIds = ['densityDissipation','velocityDissipation','pressureDissipation','pressureIteration','velocityInfluence','curl','multiplier','canvasOpacity','kSpinSpeed','kTwist','kZoom','kBlend','kAngle','kaleidoSegments'];
        sliderIds.forEach(id => {
            const v = window.settingsManager.get(`slider.${id}`);
            if (v !== undefined && v !== null) setVal(id, v);
        });

        // Checkboxes
        const checkboxIds = ['trailToggle','cursorToggle','showCanvasHandles','lockCanvasBorders','preserveFluidOpacity','statsToggle','randomColor','stepPalette','kaleidoToggle','kAnimateRot'];
        checkboxIds.forEach(id => {
            const v = window.settingsManager.get(`checkbox.${id}`);
            if (typeof v === 'boolean') setCheck(id, v);
        });

        // Selects
        const selectIds = ['visualResolution','physicsResolution','kaleidoMode'];
        selectIds.forEach(id => {
            const v = window.settingsManager.get(`select.${id}`);
            if (v !== undefined) {
                const el = $(id);
                if (!el) return;
                // Check if value exists in options
                const hasOption = Array.from(el.options).some(opt => opt.value === String(v));
                if (hasOption) {
                    setVal(id, v, 'change');
                } else {
                    // Use custom option
                    el.value = 'custom';
                    const customEl = $(id + 'Custom');
                    if (customEl) {
                        customEl.style.display = 'block';
                        customEl.value = v;
                        // Trigger input event to apply
                        customEl.dispatchEvent(new Event('input'));
                    }
                }
            }
        });
        
        // Palette index - apply saved one, or default to first palette
        const paletteIdx = window.settingsManager.get('palette.currentIndex');
        if (typeof applyPalette === 'function') {
            if (typeof paletteIdx === 'number' && paletteIdx >= 0) {
                applyPalette(paletteIdx);
            } else {
                // No saved palette, apply first one as default
                applyPalette(0);
            }
        }

        // Colors
        const bg = window.settingsManager.get('color.background');
        if (bg) setVal('backgroundColorPicker', bg, 'input');
        const brush = window.settingsManager.get('color.brush');
        if (brush) setVal('colorPicker', brush, 'input');

        const sc = window.settingsManager.get('palettes.savedColors');
        if (Array.isArray(sc) && typeof colorStorage !== 'undefined' && typeof colorStorage.save === 'function') {
            try { colorStorage.save(sc.slice()); } catch (_) {}
        }

        // Canvas wrapper rect
        const wr = window.settingsManager.get('canvas.wrapperRect');
        if (wr) {
            const wrap = $('canvas-wrapper'); if (wrap) { wrap.style.left = wr.left + 'px'; wrap.style.top = wr.top + 'px'; wrap.style.width = wr.width + 'px'; wrap.style.height = wr.height + 'px'; }
        }

        // Kaleidoscope runtime
        const kr = window.settingsManager.get('kaleido.runtime');
        if (kr) {
            if (typeof kr.mode === 'number') setVal('kaleidoMode', kr.mode, 'change');
            if (typeof kr.segments === 'number') { const el = $('kaleidoSegments'); if (el) setVal('kaleidoSegments', kr.segments, 'input'); }
        }
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

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn();
    }

    function init() {
        if (!window.settingsManager) { setTimeout(init, 100); return; }
        ready(setupSaveLoad);
    }

    init();
})();
