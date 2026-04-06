/**
 * COS (Cosine Oscillator) — smooth parameter oscillation system.
 *
 * Each registered parameter oscillates between a [min, max] range using a
 * cosine wave at a configurable speed (cycles/second). Values are written
 * directly to the live config object every animation frame so there is zero
 * DOM-polling overhead and no jitter.
 *
 * Call window.cosOscillator.tick(nowSec) once per animation frame from the
 * existing update() loop. This piggybacks on the existing rAF — no second
 * requestAnimationFrame is started.
 *
 * Exposed API:
 *   window.cosOscillator.tick(nowSec)          — advance all active oscillators
 *   window.cosOscillator.setEnabled(id, bool)  — toggle oscillator on/off
 *   window.cosOscillator.setRange(id, min, max)— update range at runtime
 *   window.cosOscillator.setSpeed(id, cps)     — update speed (cycles/sec)
 *   window.cosOscillator.getState()            — snapshot for save/load
 *   window.cosOscillator.loadState(obj)        — restore from snapshot
 *   window.cosOscillator.PARAMS                — descriptor map
 */

(function () {
    'use strict';

    /**
     * Descriptor for each oscillatable parameter.
     * apply(value) writes the computed value to wherever it needs to go.
     * defaultMin/Max mirror the slider's natural range.
     * defaultSpeed is cycles per second.
     */
    const PARAMS = {
        brushSize: {
            label: 'Brush Size',
            defaultMin: 0.1,
            defaultMax: 30,
            defaultSpeed: 0.2,
            apply(v) {
                if (!window.config) return;
                window.config.SPLAT_RADIUS = v / 1000;
                const el = document.getElementById('brushSize');
                if (el) {
                    el.value = v;
                    el.style.setProperty('--val', v);
                }
            }
        },
        curl: {
            label: 'Curl',
            defaultMin: 0,
            defaultMax: 60,
            defaultSpeed: 0.15,
            apply(v) {
                if (!window.config) return;
                window.config.CURL = v;
                const el = document.getElementById('curl');
                if (el) {
                    el.value = v;
                    el.style.setProperty('--val', v);
                }
                const span = document.getElementById('curlValue');
                if (span) span.textContent = Math.round(v);
            }
        },
        sharpness: {
            label: 'Viscosity',
            defaultMin: 0,
            defaultMax: 2,
            defaultSpeed: 0.1,
            apply(v) {
                if (!window.config) return;
                window.config.SHARPNESS = v;
                const el = document.getElementById('sharpness');
                if (el) {
                    el.value = v;
                    el.style.setProperty('--val', v);
                }
                const span = document.getElementById('sharpnessValue');
                if (span) span.textContent = v.toFixed(1);
            }
        },
        timeScale: {
            label: 'Time',
            defaultMin: 0.01,
            defaultMax: 3,
            defaultSpeed: 0.1,
            apply(v) {
                window.timeScale = v;
                const el = document.getElementById('timeScale');
                if (el) {
                    el.value = v;
                    el.style.setProperty('--val', v);
                }
                const span = document.getElementById('timeScaleValue');
                if (span) span.textContent = v.toFixed(2) + 'x';
            }
        },
        densityDissipation: {
            label: 'Density Sustain',
            defaultMin: 0.85,
            defaultMax: 1.005,
            defaultSpeed: 0.08,
            apply(v) {
                if (!window.config) return;
                window.config.DENSITY_DISSIPATION = v;
                const el = document.getElementById('densityDissipation');
                if (el) {
                    el.value = v;
                    el.style.setProperty('--val', v);
                }
                const span = document.getElementById('densityValue');
                if (span) span.textContent = v.toFixed(4);
            }
        },
        velocityDissipation: {
            label: 'Velocity Sustain',
            defaultMin: 0.9,
            defaultMax: 1.0009,
            defaultSpeed: 0.08,
            apply(v) {
                if (!window.config) return;
                window.config.VELOCITY_DISSIPATION = v;
                const el = document.getElementById('velocityDissipation');
                if (el) {
                    el.value = v;
                    el.style.setProperty('--val', v);
                }
                const span = document.getElementById('velocityValue');
                if (span) span.textContent = v.toFixed(4);
            }
        }
    };

    /**
     * Runtime state for each parameter.
     * phase is in radians, advanced per-tick so the wave is continuous even
     * when speed or range changes mid-cycle.
     */
    const state = {};
    Object.keys(PARAMS).forEach(id => {
        const p = PARAMS[id];
        state[id] = {
            enabled: false,
            min: p.defaultMin,
            max: p.defaultMax,
            speed: p.defaultSpeed, // cycles/sec
            phase: 0               // current cosine phase (radians)
        };
    });

    // Track wall time to advance phase correctly
    let lastTickSec = null;

    /**
     * Advance all active oscillators. Call once per animation frame.
     * @param {number} nowSec - current time in seconds (performance.now()/1000)
     */
    function tick(nowSec) {
        if (lastTickSec === null) {
            lastTickSec = nowSec;
            return;
        }
        const dtSec = Math.min(nowSec - lastTickSec, 0.1); // clamp to 100ms to handle tab-hidden spikes
        lastTickSec = nowSec;

        Object.keys(state).forEach(id => {
            const s = state[id];
            if (!s.enabled) return;
            const p = PARAMS[id];

            // Advance phase: full cycle = 2π radians, speed in cycles/sec
            s.phase += dtSec * s.speed * 2 * Math.PI;
            if (s.phase > 2 * Math.PI * 1e6) s.phase -= 2 * Math.PI * 1e6; // prevent float overflow after very long sessions

            // Cosine maps [-1, 1] → [min, max]
            const t = (Math.cos(s.phase) + 1) / 2; // [0, 1]
            const value = s.min + t * (s.max - s.min);

            p.apply(value);
        });
    }

    function setEnabled(id, enabled) {
        if (!state[id]) return;
        state[id].enabled = !!enabled;
        _syncCheckboxUI(id, !!enabled);
    }

    function setRange(id, min, max) {
        if (!state[id]) return;
        state[id].min = min;
        state[id].max = max;
    }

    function setSpeed(id, cps) {
        if (!state[id]) return;
        state[id].speed = Math.max(0.001, cps);
    }

    function getState() {
        const snap = {};
        Object.keys(state).forEach(id => {
            snap[id] = Object.assign({}, state[id]);
        });
        return snap;
    }

    function loadState(snap) {
        if (!snap || typeof snap !== 'object') return;
        Object.keys(snap).forEach(id => {
            if (!state[id]) return;
            const s = snap[id];
            if (typeof s.enabled === 'boolean') state[id].enabled = s.enabled;
            if (typeof s.min === 'number') state[id].min = s.min;
            if (typeof s.max === 'number') state[id].max = s.max;
            if (typeof s.speed === 'number') state[id].speed = s.speed;
            // Don't restore phase — let it restart from 0 for clean UX
        });
        // Sync all UI after load
        Object.keys(state).forEach(id => _syncAllUI(id));
    }

    function _syncCheckboxUI(id, enabled) {
        const cb = document.getElementById('cos-' + id);
        if (cb && cb.checked !== enabled) cb.checked = enabled;
        // Sync pill button active state
        const btn = document.getElementById('cos-btn-' + id);
        if (btn) btn.classList.toggle('cos-btn-active', enabled);
        // Sync enable toggle inside panel
        const enableToggle = document.querySelector('#cos-panel-' + id + ' .cos-enable-toggle');
        if (enableToggle) {
            enableToggle.textContent = enabled ? 'ON' : 'OFF';
            enableToggle.classList.toggle('active', enabled);
        }
        // Sync active accent on host fader
        const group = document.getElementById('cos-group-' + id);
        if (group) group.classList.toggle('cos-active', enabled);
    }

    function _syncAllUI(id) {
        const s = state[id];
        _syncCheckboxUI(id, s.enabled);

        const minEl = document.getElementById('cos-min-' + id);
        const maxEl = document.getElementById('cos-max-' + id);
        const speedEl = document.getElementById('cos-speed-' + id);
        const speedVal = document.getElementById('cos-speed-val-' + id);

        if (minEl) {
            minEl.value = s.min;
            minEl.style.setProperty('--val', s.min);
            const minValEl = minEl.nextElementSibling;
            if (minValEl && minValEl.classList.contains('cos-panel-val')) minValEl.textContent = parseFloat(s.min).toFixed(2);
        }
        if (maxEl) {
            maxEl.value = s.max;
            maxEl.style.setProperty('--val', s.max);
            const maxValEl = maxEl.nextElementSibling;
            if (maxValEl && maxValEl.classList.contains('cos-panel-val')) maxValEl.textContent = parseFloat(s.max).toFixed(2);
        }
        if (speedEl) {
            speedEl.value = s.speed;
            speedEl.style.setProperty('--val', s.speed);
        }
        if (speedVal) speedVal.textContent = s.speed.toFixed(2) + '/s';
    }

    window.cosOscillator = { tick, setEnabled, setRange, setSpeed, getState, loadState, buildUI: buildCosUI, PARAMS, state };

    // ── DOM Setup ────────────────────────────────────────────────────────────
    // Inject COS controls beneath each target slider once the DOM is ready.

    // Track which dropdown is currently open so we can close others
    let _openDropdownId = null;

    function _closeDropdown(id) {
        const panel = document.getElementById('cos-panel-' + id);
        if (panel) panel.style.display = 'none';
        const btn = document.getElementById('cos-btn-' + id);
        if (btn) btn.classList.remove('cos-btn-open');
        if (_openDropdownId === id) _openDropdownId = null;
    }

    function _openDropdown(id) {
        // Close any other open dropdown first
        if (_openDropdownId && _openDropdownId !== id) _closeDropdown(_openDropdownId);

        const btn = document.getElementById('cos-btn-' + id);
        const panel = document.getElementById('cos-panel-' + id);
        if (!btn || !panel) return;

        const rect = btn.getBoundingClientRect();
        // Position panel below the mixer strip, aligned to the button
        const panelLeft = Math.min(rect.left, window.innerWidth - 192);
        const panelTop = rect.bottom + 4;

        panel.style.left = panelLeft + 'px';
        panel.style.top = panelTop + 'px';
        panel.style.display = 'block';
        btn.classList.add('cos-btn-open');
        _openDropdownId = id;
    }

    function buildCosUI() {
        // One global click-outside listener to close open dropdowns
        if (!window._cosOutsideListenerAdded) {
            window._cosOutsideListenerAdded = true;
            document.addEventListener('pointerdown', (e) => {
                if (!_openDropdownId) return;
                const panel = document.getElementById('cos-panel-' + _openDropdownId);
                const btn   = document.getElementById('cos-btn-'   + _openDropdownId);
                if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
                    _closeDropdown(_openDropdownId);
                }
            }, true);
        }

        Object.keys(PARAMS).forEach(id => {
            // Avoid double-injection if called more than once
            if (document.getElementById('cos-btn-' + id)) return;

            const p = PARAMS[id];
            const s = state[id];

            // Find the host .ch-fader (mixer strip) or .control-group fallback
            const mainSlider = document.getElementById(id);
            if (!mainSlider) return;
            const hostGroup = mainSlider.closest('.ch-fader') || mainSlider.closest('.control-group');
            if (!hostGroup) return;

            // Mark the host group for the active accent border
            hostGroup.id = 'cos-group-' + id;

            // ── COS toggle button (stays in the mixer strip) ──────────────
            const checkRow = document.createElement('div');
            checkRow.className = 'cos-check-row';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = 'cos-' + id;
            cb.checked = s.enabled;
            cb.style.display = 'none'; // hidden — real control, synced by the button

            // Visible pill-button that opens the settings dropdown
            const btn = document.createElement('button');
            btn.id = 'cos-btn-' + id;
            btn.className = 'cos-btn' + (s.enabled ? ' cos-btn-active' : '');
            btn.textContent = '~ COS';
            btn.title = 'Cosine oscillator settings';
            btn.type = 'button';

            checkRow.appendChild(cb);
            checkRow.appendChild(btn);
            hostGroup.appendChild(checkRow);

            // ── Floating dropdown panel (appended to <body>) ──────────────
            const panel = document.createElement('div');
            panel.id = 'cos-panel-' + id;
            panel.className = 'cos-panel';
            panel.style.display = 'none';

            // Panel header: label + enable toggle
            const panelHeader = document.createElement('div');
            panelHeader.className = 'cos-panel-header';

            const panelTitle = document.createElement('span');
            panelTitle.className = 'cos-panel-title';
            panelTitle.textContent = p.label + ' — COS';

            const enableToggle = document.createElement('button');
            enableToggle.className = 'cos-enable-toggle' + (s.enabled ? ' active' : '');
            enableToggle.textContent = s.enabled ? 'ON' : 'OFF';
            enableToggle.type = 'button';

            panelHeader.appendChild(panelTitle);
            panelHeader.appendChild(enableToggle);
            panel.appendChild(panelHeader);

            // Min row
            const minRow = document.createElement('div');
            minRow.className = 'cos-panel-row';
            const minLbl = document.createElement('span');
            minLbl.className = 'cos-sub-label';
            minLbl.textContent = 'Min';
            const minSlider = document.createElement('input');
            minSlider.type = 'range';
            minSlider.id = 'cos-min-' + id;
            minSlider.min = mainSlider.min;
            minSlider.max = mainSlider.max;
            minSlider.step = mainSlider.step;
            minSlider.value = s.min;
            minSlider.className = 'cos-range-input';
            minSlider.style.setProperty('--val', s.min);
            minSlider.style.setProperty('--min', mainSlider.min);
            minSlider.style.setProperty('--max', mainSlider.max);
            const minVal = document.createElement('span');
            minVal.className = 'cos-panel-val';
            minVal.textContent = parseFloat(s.min).toFixed(2);
            minRow.appendChild(minLbl);
            minRow.appendChild(minSlider);
            minRow.appendChild(minVal);
            panel.appendChild(minRow);

            // Max row
            const maxRow = document.createElement('div');
            maxRow.className = 'cos-panel-row';
            const maxLbl = document.createElement('span');
            maxLbl.className = 'cos-sub-label';
            maxLbl.textContent = 'Max';
            const maxSlider = document.createElement('input');
            maxSlider.type = 'range';
            maxSlider.id = 'cos-max-' + id;
            maxSlider.min = mainSlider.min;
            maxSlider.max = mainSlider.max;
            maxSlider.step = mainSlider.step;
            maxSlider.value = s.max;
            maxSlider.className = 'cos-range-input';
            maxSlider.style.setProperty('--val', s.max);
            maxSlider.style.setProperty('--min', mainSlider.min);
            maxSlider.style.setProperty('--max', mainSlider.max);
            const maxVal = document.createElement('span');
            maxVal.className = 'cos-panel-val';
            maxVal.textContent = parseFloat(s.max).toFixed(2);
            maxRow.appendChild(maxLbl);
            maxRow.appendChild(maxSlider);
            maxRow.appendChild(maxVal);
            panel.appendChild(maxRow);

            // Speed row
            const speedRow = document.createElement('div');
            speedRow.className = 'cos-panel-row';
            const speedLbl = document.createElement('span');
            speedLbl.className = 'cos-sub-label';
            speedLbl.textContent = 'Speed';
            const speedSlider = document.createElement('input');
            speedSlider.type = 'range';
            speedSlider.id = 'cos-speed-' + id;
            speedSlider.min = '0.01';
            speedSlider.max = '2';
            speedSlider.step = '0.01';
            speedSlider.value = s.speed;
            speedSlider.className = 'cos-range-input';
            speedSlider.style.setProperty('--val', s.speed);
            speedSlider.style.setProperty('--min', '0.01');
            speedSlider.style.setProperty('--max', '2');
            const speedValSpan = document.createElement('span');
            speedValSpan.id = 'cos-speed-val-' + id;
            speedValSpan.className = 'cos-panel-val';
            speedValSpan.textContent = s.speed.toFixed(2) + '/s';
            speedRow.appendChild(speedLbl);
            speedRow.appendChild(speedSlider);
            speedRow.appendChild(speedValSpan);
            panel.appendChild(speedRow);

            document.body.appendChild(panel);

            // ── Event listeners ───────────────────────────────────────────

            // Button: toggle dropdown open/close, clicking COS text toggles the panel
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (_openDropdownId === id) {
                    _closeDropdown(id);
                } else {
                    _openDropdown(id);
                }
            });

            // Enable toggle inside the panel
            enableToggle.addEventListener('click', () => {
                const nowEnabled = !state[id].enabled;
                cb.checked = nowEnabled;
                setEnabled(id, nowEnabled);
                enableToggle.textContent = nowEnabled ? 'ON' : 'OFF';
                enableToggle.classList.toggle('active', nowEnabled);
                btn.classList.toggle('cos-btn-active', nowEnabled);
                _persist();
            });

            minSlider.addEventListener('input', () => {
                let minV = parseFloat(minSlider.value);
                let maxV = parseFloat(maxSlider.value);
                if (minV >= maxV) {
                    minV = maxV - parseFloat(mainSlider.step || '0.001');
                    minSlider.value = minV;
                }
                minSlider.style.setProperty('--val', minV);
                minVal.textContent = minV.toFixed(2);
                setRange(id, minV, maxV);
                _persist();
            });

            maxSlider.addEventListener('input', () => {
                let minV = parseFloat(minSlider.value);
                let maxV = parseFloat(maxSlider.value);
                if (maxV <= minV) {
                    maxV = minV + parseFloat(mainSlider.step || '0.001');
                    maxSlider.value = maxV;
                }
                maxSlider.style.setProperty('--val', maxV);
                maxVal.textContent = maxV.toFixed(2);
                setRange(id, minV, maxV);
                _persist();
            });

            speedSlider.addEventListener('input', () => {
                const spd = parseFloat(speedSlider.value);
                speedSlider.style.setProperty('--val', spd);
                speedValSpan.textContent = spd.toFixed(2) + '/s';
                setSpeed(id, spd);
                _persist();
            });
        });
    }

    function _persist() {
        try {
            if (window.settingsManager) {
                window.settingsManager.set('cosOscillator', getState());
            }
        } catch (_) {}
    }

    function _loadPersisted() {
        try {
            if (window.settingsManager) {
                const saved = window.settingsManager.get('cosOscillator', null);
                if (saved) loadState(saved);
            }
        } catch (_) {}
    }

    // buildCosUI() is called by 20-mixer-layout.js after it moves sliders into
    // the mixer strip. _loadPersisted is deferred so settingsManager is ready.
    setTimeout(_loadPersisted, 0);

})();
