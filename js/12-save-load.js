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

    // Persisted control ids — the single source of truth is ParamRegistry, so
    // capture can NEVER drift out of sync with what apply will accept. Every
    // control the registry knows about is saved into both session settings and
    // user presets; adding a new slider/checkbox/select to 01a-param-registry.js
    // automatically makes it persist here, with no second list to maintain.
    //
    // History: these were three hand-curated arrays that fell behind the
    // registry — the brush stroke-engine sliders (brushFlow/Hardness/Spacing/…),
    // velocityCap and the multigrid controls were all registered and clamp-ready
    // but never captured, so saving a preset silently dropped them ("a brush
    // setting changes after I save"). Deriving the lists removes that whole
    // class of bug.
    //
    // PRESET_SKIP: controls the registry clamps but that must NOT persist. Only
    // preserveFluidOpacity ("Empty Alpha Locked") — a session-only toggle that
    // must default to checked on every launch (applyPresetSnapshot ignores it
    // too, at the checkbox-restore loop below).
    // autoloadSettings: with the default now ON, letting it into snapshots
    // means applying any preset dispatches its change handler, which
    // re-entrantly runs applyFromSettings() mid-apply and clobbers the
    // preset's sliders — and silently rewrites the user's autoload choice.
    var PRESET_SKIP = { preserveFluidOpacity: true, autoloadSettings: true };

    function _registryIds(map, skip) {
        return Object.keys(map).filter(function (id) { return !(skip && skip[id]); });
    }

    // Frozen fallbacks — used ONLY if ParamRegistry failed to load (in which
    // case apply-side clamping is broken anyway). Mirrors pre-registry coverage.
    var FALLBACK_SLIDER_IDS = ['densityDissipation','velocityDissipation','pressureDissipation','pressureIteration','velocityInfluence','curl','sharpness','swirl','wetInfluence','wetDrying','ridges','brushSize','multiplier','timeScale','canvasOpacity','captureDimming','kSpinSpeed','kTwist','kZoom','kBlend','kAngle','kaleidoSegments','lightSpeed','lightIntensity','lightAmbient','lightShiftSpeed','lightShiftThreshold','lightShiftIntensity','lightShiftSaturation','clarity','vibrance','ssFrequency','ssAngle','ssLength','ssSize','ssVariance','ssGravity','audioSensitivity','audioBeatThreshold','shadingIntensity'];
    var FALLBACK_CHECKBOX_IDS = ['cursorToggle','showCanvasHandles','lockCanvasBorders','statsToggle','transparentMode','randomColor','stepPalette','kaleidoToggle','kAnimateRot','enableLighting','enableLightShift','microDetailToggle','macCormackToggle','multigridToggle','ascendToggle','ascendRandomness','shootingStarToggle','hoverCaptureToggle','detachCaptureToggle','audioReactToggle','arMapAutoSplat','arMapSize','arMapKaleido','arMapColor','focusModeToggle','streamFormatLock','autoloadSettings','displayShadingToggle'];
    var FALLBACK_SELECT_IDS = ['visualResolution','physicsResolution','kaleidoMode','fpsCap','lightMode','lightShiftMode','recMode','recPlaybackSpeed','audioMode','audioReactSource','audioAutoSplatMode','splatInMode','splatOutMode'];

    var _PR = window.ParamRegistry;
    if (!_PR || !_PR.SLIDERS) console.warn('[Save/Load] ParamRegistry unavailable — using fallback persist lists (reduced preset coverage)');
    var SLIDER_IDS   = (_PR && _PR.SLIDERS)    ? _registryIds(_PR.SLIDERS)                : FALLBACK_SLIDER_IDS;
    var CHECKBOX_IDS = (_PR && _PR.CHECKBOXES) ? _registryIds(_PR.CHECKBOXES, PRESET_SKIP) : FALLBACK_CHECKBOX_IDS;
    var SELECT_IDS   = (_PR && _PR.SELECTS)    ? _registryIds(_PR.SELECTS)                : FALLBACK_SELECT_IDS;

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

        // Hold the colour-restore guard across the load: sections below write
        // the legacy checkboxes + color.brush programmatically, and the 05g
        // handlers must not hijack arm0.mode — the reconcile in 6b owns it.
        window.__brushColorRestoring = true;

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
            // get() returns null (not undefined) for a missing key — without
            // the null check every unsaved select is forced to options[0]
            // (fpsCap→30, recPlaybackSpeed→0.25) on a fresh install.
            if (v === undefined || v === null) return;
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

        // ── 6b. Active-brush colour mode (canonical) ──
        // Autoload restores the legacy checkboxes + color.brush but not the
        // per-arm config; apply brush.armColors here (mirroring the preset path)
        // so arm0.mode — canonical for painting + recording — matches, or derive
        // it from the just-restored checkboxes when nothing was saved. Then
        // release the guard and reflect into every colour widget.
        try {
            var savedArm = sm.get('brush.armColors', null);
            var arm = window.multiArmColors || (window.multiArmColors = []);
            if (Array.isArray(savedArm) && savedArm.length) {
                arm.length = 0;
                savedArm.forEach(function(c) {
                    arm.push({ mode: c.mode || 'main', color: c.color || '#ffffff', stepIndex: c.stepIndex || 0 });
                });
                if (typeof window.rebuildArmColorRows === 'function') window.rebuildArmColorRows();
            } else {
                if (!arm[0]) arm[0] = { mode: 'main', color: '#ffffff', stepIndex: 0 };
                if (arm[0].mode === 'main') {
                    if (boolEl('stepPalette')) arm[0].mode = 'step';
                    else if (boolEl('randomColor')) arm[0].mode = 'random';
                }
            }
        } catch(_) {}
        window.__brushColorRestoring = false;
        if (typeof window.syncBrushColorUI === 'function') window.syncBrushColorUI();

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

        // ── 10. Sidebar section collapsed states ──
        // 5.2 timing: sections are MOVED into #sidebar-right by
        // initMixerLayout ~800ms after load — at loadSettings time the
        // container is empty and an immediate pass is a no-op. Poll until
        // they exist (the 23-depth-collision deleteLayer-hook pattern).
        try {
            var savedSections = sm.get('sidebar.sections');
            if (savedSections && typeof savedSections === 'object') {
                (function applySections(tries) {
                    var sections = document.querySelectorAll('#sidebar-right .sidebar-section');
                    if (!sections.length) {
                        if (tries < 60) setTimeout(function () { applySections(tries + 1); }, 250);
                        return;
                    }
                    sections.forEach(function (sec) {
                        var titleEl = sec.querySelector('.section-title');
                        if (!titleEl) return;
                        var title = titleEl.textContent.trim();
                        if (title in savedSections) {
                            sec.classList.toggle('collapsed', !!savedSections[title]);
                        }
                    });
                })(0);
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
                // GUARDRAIL: this used to call settingsManager.clear(), which wiped
                // the ENTIRE fluidUI namespace — including every saved preset — with
                // no confirmation (root cause of the 2026-07 preset loss). Now it
                // confirms and PRESERVES presets (clearExceptPresets); the on-disk
                // Preset Vault is untouched either way.
                if (!window.confirm('Reset saved settings to defaults?\n\nYour presets are kept. This only clears window/layout, colors, and other UI settings.')) {
                    return;
                }
                try {
                    if (window.settingsManager?.clearExceptPresets) {
                        window.settingsManager.clearExceptPresets();
                    } else {
                        window.settingsManager?.clear();
                    }
                    if (typeof window.restoreDefaultPalettes === 'function') {
                        window.restoreDefaultPalettes();
                    }
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                    clearBtn.textContent = '🧹 Cleared';
                    setTimeout(() => clearBtn.textContent = '🧹 Clear', 1500);
                } catch (err) {
                    console.error('Clear error:', err);
                    clearBtn.textContent = '❌ Error';
                    setTimeout(() => clearBtn.textContent = '🧹 Clear', 2000);
                }
            });
        }

        // Autoload handling. Absent → ON (a paid desktop app is expected to
        // restore the previous session); only an explicit saved false disables
        // — same absent-vs-false pattern as the showCanvasHandles autoload fix.
        if (autoloadChk && window.settingsManager) {
            const stored = window.settingsManager.get('settings.autoload');
            const auto = stored !== false;
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

        // Context-loss recovery offer: 04f snapshots the session when the GPU
        // resets, then reloads. Offer that snapshot back once the deferred
        // scripts (layers/brush) are up; either way the key is consumed so a
        // stale snapshot can't reappear on later launches.
        try {
            const rec = window.settingsManager ? window.settingsManager.get('app.contextLossSnapshot') : null;
            // 24h, not 10min: a driver reset often takes the whole machine with
            // it, and the customer relaunches after a reboot — well past any
            // ten-minute window. The key is consumed either way.
            if (rec && rec.snapshot && (Date.now() - (rec.at || 0)) < 24 * 60 * 60 * 1000) {
                const offerRestore = () => {
                    try {
                        // Be honest about the limit: pixels can't be read back
                        // from a lost GL context, so painted layers are only as
                        // fresh as the last save. Settings/brush/layout are exact.
                        const painted = !!(rec.snapshot.layers || []).some(function (l) { return l && l.isRaster; });
                        const caveat = painted
                            ? '\n\nSettings, brush and layer setup will be exact. Painted pixels can only come back as far as your last save — anything painted after it was lost with the driver reset.'
                            : '';
                        if (window.confirm('The graphics driver reset during the last session.\n\nRestore your settings, layers, and brush state from just before the reset?' + caveat)) {
                            applyPresetSnapshot(rec.snapshot);
                        }
                    } catch (err) { console.warn('[ContextLoss] restore failed', err); }
                    finally { try { window.settingsManager.remove('app.contextLossSnapshot'); } catch (_) {} }
                };
                const poll = setInterval(() => {
                    if (window.__scriptsReady) { clearInterval(poll); setTimeout(offerRestore, 300); }
                }, 250);
            } else if (rec) {
                try { window.settingsManager.remove('app.contextLossSnapshot'); } catch (_) {}
            }
        } catch (_) {}

        console.log('Save/Load (scan+persist) initialized');
    }

    // ── User Presets System ──

    // opts.lookOnly (13.5 host settings lock): skip the heavy sections —
    // layer/mask/branding/recording serialization does full-res GPU readbacks
    // and dataURL encodes, far too costly for the lock's periodic mirror
    // broadcasts (and the relay caps messages at 16KB anyway).
    function capturePresetSnapshot(opts) {
        var lookOnly = !!(opts && opts.lookOnly);
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
            replaySpeed: typeof window.replaySpeed === 'number' ? window.replaySpeed : 1,
            replayLiveColors: !!window.replayLiveColors,
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
            // D2: refresh raster layers' layer.data to full-res dataURLs so
            // painted pixels round-trip (thumbnails overwrite it in between)
            if (!lookOnly && window.rasterLayers && window.rasterLayers.syncData) window.rasterLayers.syncData();
        } catch(_){}
        try {
            var ls = lookOnly ? null : window.layers;
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
                        collisionStrength: typeof layer.collisionStrength === 'number' ? layer.collisionStrength : 0.7,
                        isRaster: !!layer.isRaster,
                        opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
                        blendMode: layer.blendMode || 'normal',
                        clipMaskId: (typeof layer.clipMaskId === 'number') ? layer.clipMaskId : null,
                        clipInvert: !!layer.clipInvert
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
                                    if (k === 'samMask' && v instanceof Uint8Array) {
                                        // Encode Smart-Select pixel masks like depthData —
                                        // dropping them made every SAM-masked layer restore
                                        // "cut off" (the shape survived, its pixels didn't)
                                        // and freshly-made SAM masks die on the next save.
                                        sc._samMaskB64 = _uint8ToBase64(v);
                                        return;
                                    }
                                    if (k === 'samMask') return; // non-typed leftovers — skip
                                    if (k === 'depthData' && v instanceof Uint8Array) {
                                        // Encode collision depth data as base64 for exact restore
                                        sc._depthDataB64 = _uint8ToBase64(v);
                                        return;
                                    }
                                    if (v instanceof Uint8Array || v instanceof Float32Array) return;
                                    sc[k] = v;
                                });
                                if (s.samMask && !sc._samMaskB64) sc._hadSamMask = true;
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

        // ── D3 masks (coverage PNGs + names) ──
        var masksData = null;
        try {
            if (!lookOnly && window.Masks && window.Masks.serialize) {
                var ms = window.Masks.serialize();
                if (ms.length > 0) masksData = ms;
            }
        } catch(_){}

        // ── Branding overlays ──
        var brandingData = null;
        try {
            if (!lookOnly && window.brandingOverlays && window.brandingOverlays.getAll) {
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
            if (!lookOnly && typeof window.recGetLayersSnapshot === 'function') {
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
            if (!lookOnly && window.pathLayers && typeof window.pathLayers.getSnapshot === 'function') {
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
            // Material macro layer (Fluid / Paint-Wet / Paint-Thick): its core
            // effects live in config keys with no captured control, so without
            // this section a restored preset (or a mirroring peer) stayed on
            // plain fluid while the source was in a paint material.
            material: (window.MaterialModes && window.MaterialModes.getState)
                ? window.MaterialModes.getState() : null,
            // Brush tip (Soft/Blob/Chisel/Streak/Ring + optional custom-shape
            // id + stamp angle): config-only state with no registry slider —
            // without it a peer rendered your strokes with THEIR tip, and a
            // restored preset lost the tip entirely.
            brushTip: {
                tip: (window.config ? window.config.BRUSH_TIP : 0) | 0,
                shapeId: (window.BrushShapes && window.BrushShapes.activeId)
                    ? (window.BrushShapes.activeId() || null) : null,
                angle: window.config ? (window.config.BRUSH_ANGLE || 0) : 0
            },
            ssOrigin: ssOrigin,
            canvasWrapper: canvasWrapper,
            sidebarSections: sidebarSections,
            layers: layersData,
            layerOrder: layerOrderData,
            masks: masksData,
            branding: brandingData,
            recordedLayers: recordedLayers,
            cosOscillator: cosState,
            pathLayers: pathLayersData,
            armColors: armColorsData
        };
    }

    function applyPresetSnapshot(snapshot) {
        if (!snapshot) return;
        // 13.5: look settings locked by the multiplayer host — local snapshot
        // applies (user presets, autoload) are gated; the host's lock snapshot
        // itself arrives under __mpApplyingRemote and passes through.
        if (window.__mpSettingsLocked && !window.__mpApplyingRemote) return;
        // External-writer flag for 05h's handlers: (a) an active material must
        // YIELD so the snapshot's raw CURL lands as CURL, not as a macro
        // amount (without this, applying a preset while in Paint-Thick left
        // clay's curl in place); (b) programmatic writes must not clear the
        // active-preset state. The flag was checked in 05h but never raised
        // anywhere until now. Cleared in a 0-timeout too so an unexpected
        // throw can never leave it stuck.
        window._profileApplying = true;
        setTimeout(function () { window._profileApplying = false; }, 0);
        var reg = window.ParamRegistry;
        // Soft reset: keep the governor's quality tier across snapshot loads —
        // a hard reset snapped to full quality and stuttered for seconds while
        // the 1 Hz evaluator re-degraded (see 08a-quality-governor.js)
        if (window.QualityGovernor) {
            (window.QualityGovernor.softReset || window.QualityGovernor.reset)();
        }

        // Hold the colour-restore guard: the checkbox + color.brush restores
        // below dispatch events the 05g handlers listen to; without this they'd
        // hijack arm0.mode, which the canonical armColors block below owns.
        window.__brushColorRestoring = true;

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
                    // checked default, so old presets that captured it are ignored.
                    // autoloadSettings: applying it dispatches its change handler,
                    // which re-entrantly runs applyFromSettings() mid-apply and
                    // clobbers the preset's sliders (also guards old snapshots
                    // saved before PRESET_SKIP excluded it at capture time).
                    if (id === 'preserveFluidOpacity' || id === 'autoloadSettings') return;
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

        // NOTE: the guard stays HELD past this point. The palette restore below
        // calls applyPalette(), which for a user-initiated pick auto-enables
        // "Step through palette" and rewrites the colour picker — that ran AFTER
        // the colour/arm restore and silently stomped it, so a locked guest kept
        // its own brush colour (arm0.mode forced to 'step', picker showing the
        // palette's step colour instead of the host's). It is released once the
        // palette is in, and syncBrushColorUI then reflects the canonical arm
        // state into every colour widget exactly once.

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

        // Palette is in — NOW release the colour-restore guard and reflect the
        // canonical arm colours into every colour widget (chips, checkboxes,
        // picker). Doing this after the palette is what keeps the snapshot's
        // brush colour authoritative.
        window.__brushColorRestoring = false;
        if (typeof window.syncBrushColorUI === 'function') window.syncBrushColorUI();

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
                if (typeof bs.replaySpeed === 'number') {
                    window.replaySpeed = bs.replaySpeed;
                    var spSlider = document.getElementById('replaySpeed');
                    if (spSlider) spSlider.value = bs.replaySpeed;
                    var spVal = document.getElementById('replaySpeedValue');
                    if (spVal) spVal.textContent = bs.replaySpeed.toFixed(2).replace(/\.?0+$/, '') + '×';
                }
                if (typeof bs.replayLiveColors === 'boolean') {
                    window.replayLiveColors = bs.replayLiveColors;
                    var lcCb = document.getElementById('replayLiveColors');
                    if (lcCb) lcCb.checked = bs.replayLiveColors;
                }
                // bs.refreshRate (older snapshots): the Splat Rate throttle was
                // removed 2026-08-06 (replay always honored the recorded rate;
                // the live-paint throttle was superseded by BRUSH_SPACING) —
                // the stored value is intentionally ignored.
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
                // bs.gateMaxDensity (older snapshots): the Gate ceiling is a
                // fixed constant now, so the stored level is intentionally
                // ignored rather than migrated.
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
                        // D3-3: clear any stale CSS clip mask on the reused slot
                        resetDiv.style.webkitMaskImage = '';
                        resetDiv.style.maskImage = '';
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
                    if (ld.isRaster) {
                        // D2 raster layers are GPU-composited — no div;
                        // rasterLayers.reconcile() below recreates the FBO
                        // and uploads ld.data into it
                        layerDiv = null;
                    } else if (ld.isCollision) {
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
                        collisionStrength: typeof ld.collisionStrength === 'number' ? ld.collisionStrength : 0.7,
                        isRaster: !!ld.isRaster,
                        // Force a pixel upload even when an FBO already exists at
                        // this index. reconcile() otherwise only restores MISSING
                        // buffers, so a saved layer landing on the boot layer's
                        // index (both 100) kept the empty boot FBO — the panel
                        // thumbnail showed the artwork while the canvas stayed blank.
                        __needsRestore: !!ld.isRaster && !!ld.data,
                        opacity: typeof ld.opacity === 'number' ? ld.opacity : 1,
                        blendMode: ld.blendMode || 'normal',
                        clipMaskId: (typeof ld.clipMaskId === 'number') ? ld.clipMaskId : null,
                        clipInvert: !!ld.clipInvert
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
                                // Decode Smart-Select pixel masks (new format)
                                if (sc._samMaskB64) {
                                    try {
                                        sc.samMask = _base64ToUint8(sc._samMaskB64);
                                        delete sc._samMaskB64;
                                    } catch(e) {
                                        console.warn('Preset: failed to decode samMask base64', e);
                                    }
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

                // Step 3.5: reconcile screen ↔ panel. renderLayers() only walks
                // layerOrder, but the restore above set a DOM div for every
                // snapshot.layers entry. If a snapshot's layerOrder omits a layer
                // it still lists in .layers (corrupt/cross-version presets, or a
                // pre-existing ghost that capturePresetSnapshot baked in), that
                // layer would render on screen yet never appear in the panel — an
                // unmanageable ghost that can't be hidden or deleted from the UI.
                // Enforce the invariant "a layer is visible IFF it's in the panel":
                // drop any layer not referenced by the final layerOrder and clear
                // its backing div / GPU buffer. Mutate arrays in place — 05k/05l
                // hold the same references (reassigning would desync them).
                var _orderedIds = {};
                window.layerOrder.forEach(function(it) { if (it.type === 'layer') _orderedIds[it.id] = true; });
                for (var _li = window.layers.length - 1; _li >= 0; _li--) {
                    var _orphan = window.layers[_li];
                    if (_orderedIds[_orphan.index]) continue;
                    if (_orphan.isRaster && window.rasterLayers && window.rasterLayers._onDeleted) {
                        window.rasterLayers._onDeleted(_orphan.index);
                    }
                    var _od = document.getElementById('layer' + _orphan.index);
                    if (_od) {
                        _od.style.backgroundImage = '';
                        _od.style.display = 'none';
                        _od.style.zIndex = '';
                        _od.classList.remove('active');
                        _od.style.webkitMaskImage = ''; // D3-3: drop stale CSS clip
                        _od.style.maskImage = '';
                    }
                    window.layers.splice(_li, 1);
                }
                // Prune any layerOrder entry whose layer no longer exists (reverse
                // mismatch: renderLayers silently skips these, but a dangling entry
                // would re-propagate through the next capturePresetSnapshot).
                for (var _oi = window.layerOrder.length - 1; _oi >= 0; _oi--) {
                    var _it = window.layerOrder[_oi];
                    if (_it.type === 'layer' && !window.layers.some(function(l) { return l.index === _it.id; })) {
                        window.layerOrder.splice(_oi, 1);
                    }
                }

                if (typeof window.renderLayers === 'function') window.renderLayers();

                // D2: rebuild raster-layer GPU buffers from the restored
                // layer.data (also frees FBOs whose layers the load wiped)
                if (window.rasterLayers && window.rasterLayers.reconcile) window.rasterLayers.reconcile();

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

        // ── D3 masks ──
        try {
            if (window.Masks && window.Masks.restore && snapshot.masks !== undefined) {
                window.Masks.restore(snapshot.masks);
                // D3-3: do NOT reapply clips synchronously here — Masks.restore
                // loads coverage ASYNC (Image.onload), so the FBOs are blank at
                // this instant and a read would bake a transparent mask that HIDES
                // clipped layers. Each mask fires __onMaskMutated on load, which
                // the image-clip refresh chain (05m) catches to apply the real
                // clip; until then the layer shows unclipped (graceful degrade,
                // and a mask that fails to decode simply stays unclipped, visible).
            }
        } catch(e) { console.warn('Preset: mask restore failed', e); }

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

        // Brush tip: config-level state the slider/checkbox passes above
        // cannot reach. A custom shape only re-activates if THIS client has
        // the same stamp (shape images cannot ride a snapshot); otherwise the
        // built-in tip underneath is the honest fallback.
        try {
            if (snapshot.brushTip && window.config) {
                var bt = snapshot.brushTip;
                if (typeof bt.tip === 'number') {
                    window.config.BRUSH_TIP = Math.max(0, Math.min(4, bt.tip | 0));
                    try { if (window.settingsManager) window.settingsManager.set('brush.tip', window.config.BRUSH_TIP); } catch (_) {}
                }
                if (typeof bt.angle === 'number' && isFinite(bt.angle)) {
                    window.config.BRUSH_ANGLE = Math.max(0, Math.min(360, bt.angle));
                    var angEl = $('brushAngle');
                    if (angEl) { angEl.value = window.config.BRUSH_ANGLE; angEl.style.setProperty('--val', angEl.value); }
                }
                if (window.BrushShapes && window.BrushShapes.setActive) {
                    var wantShape = (typeof bt.shapeId === 'string' && bt.shapeId) ? bt.shapeId : null;
                    var have = wantShape && (window.BrushShapes.list() || []).some(function (s) { return s.id === wantShape; });
                    window.BrushShapes.setActive(have ? wantShape : null);
                }
                if (window.__onBrushShapeChanged) window.__onBrushShapeChanged();
            }
        } catch (e) { console.warn('brush tip apply failed', e); }

        // Material macro layer LAST: the raw slider/checkbox writes above ran
        // with material yielded (05h forces yieldToExternal during external
        // writes), so this re-enters the snapshot's material — entering from
        // fluid snapshots the just-applied raw baseline, meaning a later
        // return to Fluid restores THIS preset's values. Old snapshots have
        // no material field → treated as fluid → behavior unchanged.
        try {
            if (window.MaterialModes && window.MaterialModes.applyState) {
                window.MaterialModes.applyState(snapshot.material || { mode: 'fluid' });
            }
        } catch (e) { console.warn('material apply failed', e); }

        window._profileApplying = false;

        console.log('Preset applied: v' + (snapshot.version || 1) + ', ' +
            Object.keys(snapshot.sliders || {}).length + ' sliders, ' +
            Object.keys(snapshot.checkboxes || {}).length + ' checkboxes, ' +
            Object.keys(snapshot.selects || {}).length + ' selects' +
            (snapshot.layers ? ', ' + snapshot.layers.length + ' layers' : '') +
            (snapshot.recordedLayers ? ', ' + snapshot.recordedLayers.length + ' recorded layers' : ''));
    }

    // ── Full-state preset application ───────────────────────────────
    // A preset click must land on the exact same COMPLETE state no matter
    // what was active before. Historically both built-ins and (older) user
    // presets were deltas over the current state — so e.g. Surface Shading
    // survived a preset click. The baseline is registry defaults for every
    // look param plus canonical defaults for the sections outside the
    // registry; the preset's own values overlay it.
    //
    // Deliberately NOT part of a look, so never baselined:
    //  - machine/workflow-local keys (resolutions, fps cap, recording,
    //    stats, autoload) — a preset is a look, not a machine profile
    //  - content (layers, masks, branding, recordings) and libraries
    //    (savedColors, userPalettes)
    // The multiplayer look mirror keeps using plain applyPresetSnapshot:
    // its snapshots are intentionally partial (size shedding), and filling
    // gaps with defaults there would wipe watcher state mid-performance.
    var BASELINE_SKIP = { visualResolution: 1, physicsResolution: 1, fpsCap: 1,
        recMode: 1, recPlaybackSpeed: 1, statsToggle: 1, autoloadSettings: 1,
        preserveFluidOpacity: 1 };

    function baselineLookSnapshot() {
        var base = {
            sliders: {}, checkboxes: {}, selects: {},
            colors: { background: '#000000', brush: '#ffffff', brandingText: '#ffffff' },
            kaleido: { mode: 1, segments: 12, angle: 0, twist: 0, zoom: 1, blend: 1 },
            paletteIndex: 0,
            armColors: [{ mode: 'main', color: '#ffffff', stepIndex: 0 }],
            lightPos: { x: 0.5, y: 0.5 },
            brushState: { replayMode: 'stroke', replayTimePeriod: 5, replaySpeed: 1,
                replayLiveColors: false, splatInMode: 'instant', splatOutMode: 'instant',
                splatInDist: 0.15, splatOutDist: 0.15 },
            material: { mode: 'fluid', amount: null, shape: 0 },
            brushTip: { tip: 0, shapeId: null, angle: 0 }
        };
        var reg = window.ParamRegistry;
        if (reg && reg.defaults) {
            var d = reg.defaults();
            Object.keys(d.sliders).forEach(function (k) { if (!BASELINE_SKIP[k]) base.sliders[k] = d.sliders[k]; });
            Object.keys(d.checkboxes).forEach(function (k) { if (!BASELINE_SKIP[k]) base.checkboxes[k] = d.checkboxes[k]; });
            Object.keys(d.selects).forEach(function (k) { if (!BASELINE_SKIP[k]) base.selects[k] = d.selects[k]; });
        }
        return base;
    }

    function applyPresetSnapshotFull(snapshot) {
        if (!snapshot) return;
        var base = baselineLookSnapshot();
        var merged = Object.assign({}, snapshot);
        ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
            merged[sec] = Object.assign({}, base[sec], snapshot[sec] || {});
        });
        ['colors', 'kaleido', 'brushState', 'material', 'brushTip', 'lightPos', 'armColors'].forEach(function (sec) {
            if (snapshot[sec] === undefined || snapshot[sec] === null) merged[sec] = base[sec];
        });
        if (merged.paletteIndex === undefined || merged.paletteIndex === null) merged.paletteIndex = base.paletteIndex;
        applyPresetSnapshot(merged);
    }
    window.applyPresetSnapshotFull = applyPresetSnapshotFull;

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
                            if (s._samMaskB64) { s._hadSamMask = true; delete s._samMaskB64; }
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

    // Quota-degrading write for one-shot snapshot keys (context-loss recovery,
    // 04f). Same ladder as saveUserPreset above, but against a settingsManager
    // key: full → no recorded interactions → no depth b64 → no layer images →
    // no layers. Returns false only if even the bare envelope won't fit.
    function setSnapshotWithQuotaFallback(key, envelope) {
        if (!window.settingsManager || !envelope || !envelope.snapshot) return false;
        var ok = window.settingsManager.set(key, envelope);
        if (ok !== false) return true;
        var lite = JSON.parse(JSON.stringify(envelope));
        var s = lite.snapshot;
        lite.degraded = true;
        if (s.recordedLayers) s.recordedLayers.forEach(function(rl) { if (rl.timeline) rl.timeline.interactions = []; });
        if (s.layers) s.layers.forEach(function(l) {
            if (l.mask && l.mask.shapes) l.mask.shapes.forEach(function(sh) {
                if (sh._depthDataB64) { sh._hadDepthData = true; delete sh._depthDataB64; }
                if (sh._samMaskB64) { sh._hadSamMask = true; delete sh._samMaskB64; }
            });
        });
        ok = window.settingsManager.set(key, lite);
        if (ok !== false) return true;
        if (s.layers) s.layers.forEach(function(l) { delete l.data; delete l.originalData; });
        ok = window.settingsManager.set(key, lite);
        if (ok !== false) return true;
        delete s.layers; delete s.layerOrder; delete s.recordedLayers;
        return window.settingsManager.set(key, lite) !== false;
    }
    window.__setSnapshotWithQuotaFallback = setSnapshotWithQuotaFallback;

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
                // Full-state apply: older saved presets may predate sections
                // (material, brush tip…) — defaults fill what they lack, so
                // loading one always lands on a complete deterministic state.
                applyPresetSnapshotFull(snapshot);
                showPresetStatus('Loaded: ' + name, '#3fb950');
                // A user preset supersedes any built-in active state (via the
                // real state owner in 04b), and highlights on BOTH user-preset
                // surfaces (this sidebar list + the mixer strip's).
                if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
                document.querySelectorAll('.user-preset-btn, .mixer-user-preset-btn').forEach(function(b) {
                    b.classList.toggle('active', b.textContent === name);
                });
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

        // ── D7-1: versioned .fluid PROJECT file (export / import) ──────────
        // Wrap the full capturePresetSnapshot() stack (layers, masks, bindings,
        // colors, path/recorded layers…) plus brush presets in a versioned
        // envelope so a whole project round-trips as one downloadable file.
        var PROJECT_FORMAT = 'fluid-project';
        var PROJECT_FORMAT_VERSION = 1;
        function migrateProjectEnvelope(env) {
            if (!env || typeof env !== 'object') return null;
            // Accept a bare snapshot (raw preset JSON, no envelope) and wrap it —
            // migration path for older / hand-exported saves.
            if (!env.format && (env.sliders || env.layers || typeof env.version === 'number')) {
                env = { format: PROJECT_FORMAT, formatVersion: 1, snapshot: env };
            }
            if (env.format !== PROJECT_FORMAT || !env.snapshot) return null;
            // Future envelope upgrades gate on env.formatVersion here.
            return env;
        }
        function exportProjectFile(name) {
            try {
                name = (name && String(name).trim()) || 'fluid-project';
                var snap = capturePresetSnapshot();
                if (!snap) { console.warn('[Project] nothing to export'); return false; }
                var brushPresets = null;
                try { brushPresets = window.settingsManager ? window.settingsManager.get('brush.presets') : null; } catch (_) {}
                var brushShapes = null;
                try { brushShapes = window.settingsManager ? window.settingsManager.get('brush.shapes') : null; } catch (_) {}
                var env = {
                    format: PROJECT_FORMAT, formatVersion: PROJECT_FORMAT_VERSION, app: 'Fluid-UI',
                    name: name, created: Date.now(), snapshot: snap
                };
                if (brushPresets) env.brushPresets = brushPresets;
                if (brushShapes && brushShapes.length) env.brushShapes = brushShapes;
                var blob = new Blob([JSON.stringify(env)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = name.replace(/\s+/g, '-').toLowerCase() + '.fluid';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                // Optimistic: a.click() only STARTS the download; a failed write
                // leaves the flag cleared. Acceptable until the Steam-plan S6-1
                // native save dialog (fs.writeFileSync + real error) replaces
                // this path in Electron.
                try { window.__unsavedWork = false; } catch (_) {}
                return true;
            } catch (e) { console.warn('[Project] export failed', e); return false; }
        }
        function importProjectFile(file, cb) {
            if (!file) { if (cb) cb(new Error('No file')); return; }
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var env = migrateProjectEnvelope(JSON.parse(String(reader.result)));
                    if (!env) throw new Error('Not a valid .fluid project file');
                    // Loading replaces the whole stack — confirm when there's
                    // unsaved work on the canvas (prompt only for valid files).
                    if (window.__unsavedWork &&
                        !window.confirm('Load "' + (env.name || file.name) + '"?\n\nThis replaces your current canvas, layers, and settings. Unsaved work will be lost.')) {
                        if (cb) cb(null, null);
                        return;
                    }
                    applyPresetSnapshot(env.snapshot);
                    try { window.__unsavedWork = false; } catch (_) {}
                    if (env.brushPresets && window.settingsManager) {
                        try {
                            window.settingsManager.set('brush.presets', env.brushPresets);
                            if (typeof window.__refreshBrushPresets === 'function') window.__refreshBrushPresets();
                        } catch (_) {}
                    }
                    if (env.brushShapes && window.BrushShapes) {
                        try { window.BrushShapes.importList(env.brushShapes); } catch (_) {}
                    }
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                    if (cb) cb(null, env);
                } catch (err) { if (cb) cb(err); else console.warn('[Project] import failed', err); }
            };
            reader.onerror = function () { if (cb) cb(reader.error || new Error('read failed')); };
            reader.readAsText(file);
        }
        window.projectFile = { export: exportProjectFile, import: importProjectFile, migrate: migrateProjectEnvelope };

        // ── Bulk preset library: Export All / Import (portable .fluidpresets) ──
        // Backs up the whole user-preset library as one versioned file so it can
        // survive a storage wipe and move between origins (the Electron `file://`
        // build and the web build keep SEPARATE localStorage; this bridges them).
        var PRESETS_FORMAT = 'fluid-presets';
        var PRESETS_FORMAT_VERSION = 1;
        function exportAllPresets() {
            try {
                var presets = getUserPresets();              // { name: snapshot, … }
                var names = Object.keys(presets);
                if (!names.length) { showPresetStatus('No saved presets to export', '#ffa500'); return false; }
                var brushPresets = null;
                try { brushPresets = window.settingsManager ? window.settingsManager.get('brush.presets') : null; } catch (_) {}
                var brushShapes = null;
                try { brushShapes = window.settingsManager ? window.settingsManager.get('brush.shapes') : null; } catch (_) {}
                var env = {
                    format: PRESETS_FORMAT, formatVersion: PRESETS_FORMAT_VERSION, app: 'Fluid-UI',
                    created: Date.now(), count: names.length, presets: presets
                };
                if (brushPresets) env.brushPresets = brushPresets;
                if (brushShapes && brushShapes.length) env.brushShapes = brushShapes;
                var blob = new Blob([JSON.stringify(env)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                var stamp = new Date().toISOString().slice(0, 10);
                a.href = url; a.download = 'fluid-presets-' + stamp + '.fluidpresets';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                showPresetStatus('Exported ' + names.length + ' preset' + (names.length === 1 ? '' : 's'), '#3fb950');
                return true;
            } catch (e) {
                console.warn('[Presets] export failed', e);
                showPresetStatus('Export failed', '#ff6b6b');
                return false;
            }
        }
        function importPresetsFile(file, cb) {
            if (!file) { if (cb) cb(new Error('No file')); return; }
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var data = JSON.parse(String(reader.result));
                    var presets = null;
                    if (data && data.presets && typeof data.presets === 'object') {
                        presets = data.presets;                      // envelope (our format, lenient on version)
                    } else if (data && typeof data === 'object' && !data.format && !data.snapshot && !data.sliders) {
                        presets = data;                              // bare { name: snapshot } map
                    }
                    if (!presets || typeof presets !== 'object') throw new Error('Not a valid presets file');
                    var names = Object.keys(presets);
                    if (!names.length) throw new Error('No presets in file');
                    var imported = 0, degraded = 0, failed = 0;
                    names.forEach(function (name) {
                        var snap = presets[name];
                        if (!snap || typeof snap !== 'object') { failed++; return; }
                        // saveUserPreset runs the quota-fallback chain, so oversized
                        // presets degrade gracefully on the smaller web localStorage.
                        var ok = saveUserPreset(name, snap);
                        if (ok) { imported++; if (window._lastPresetSaveWarning) degraded++; }
                        else failed++;
                    });
                    if (data.brushPresets && window.settingsManager) {
                        try {
                            window.settingsManager.set('brush.presets', data.brushPresets);
                            if (typeof window.__refreshBrushPresets === 'function') window.__refreshBrushPresets();
                        } catch (_) {}
                    }
                    if (data.brushShapes && window.BrushShapes) {
                        try { window.BrushShapes.importList(data.brushShapes); } catch (_) {}
                    }
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                    if (cb) cb(null, { imported: imported, degraded: degraded, failed: failed, total: names.length });
                } catch (err) { if (cb) cb(err); else console.warn('[Presets] import failed', err); }
            };
            reader.onerror = function () { if (cb) cb(reader.error || new Error('read failed')); };
            reader.readAsText(file);
        }
        window.presetLibrary = { exportAll: exportAllPresets, import: importPresetsFile };

        var exportAllBtn = $('exportAllPresetsBtn');
        var importBtn = $('importPresetsBtn');
        var importInput = $('importPresetsInput');
        if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllPresets);
        if (importBtn && importInput) {
            importBtn.addEventListener('click', function () { importInput.value = ''; importInput.click(); });
            importInput.addEventListener('change', function () {
                var f = importInput.files && importInput.files[0];
                if (!f) return;
                importPresetsFile(f, function (err, res) {
                    if (err) { showPresetStatus('Import failed: ' + err.message, '#ff6b6b'); return; }
                    var msg = 'Imported ' + res.imported + '/' + res.total;
                    if (res.degraded) msg += ' — ' + res.degraded + ' shed layer data (storage limit)';
                    if (res.failed) msg += ', ' + res.failed + ' failed';
                    showPresetStatus(msg, (res.degraded || res.failed) ? '#ffa500' : '#3fb950');
                });
            });
        }

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
