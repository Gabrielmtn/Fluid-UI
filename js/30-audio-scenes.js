// ═══════════════════════════════════════════════════════════════════
// js/30-audio-scenes.js — fire-and-forget audio-reactive scenes
// LOAD ORDER: after 22-audio-reactive.js (needs window.audioReactive),
//   before 20-mixer-layout.js (the Audio section lists scene modes).
// PROVIDES: window.AudioScenes { names, labelOf, activate, deactivate,
//   active, tickFrame, buildControls }
//
// A "scene" is a curated VJ look driven entirely by the audio engine:
// pick it from the Audio Mode dropdown and it performs with zero setup.
// While a scene is active the engine's default band mappings are
// suppressed (snapshot/restore via getConfig/applyConfig) so the scene
// owns the visuals; fluid-config keys a scene touches are snapshotted
// the same way MaterialModes does it.
//
//   tunnel — each beat spawns a paint ring that recedes toward (or
//            erupts from) a vanishing point, shrinking + squashing for
//            perspective: leaving / entering a tunnel.
// (The two Ferrofluid scenes were removed 2026-08-16.)
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var LS_KEY = 'fluidui.audioScenes.';

    var scenes = {};          // name → definition
    var activeName = null;
    var activeOpts = null;
    var emitters = [];        // short-lived animated emitters, ticked per frame
    var engineSnap = null;    // audioReactive.getConfig() before scene took over
    var cfgSnap = null;       // { KEY: value } fluid-config snapshot

    // ─── Framework helpers (passed to scenes as F) ──────────────────
    function canvasEl() { return document.getElementById('canvas'); }

    function splat(x, y, dx, dy, color, radius, mult) {
        if (typeof window.applyMultiSplatWith === 'function') {
            window.applyMultiSplatWith(x, y, dx, dy, color, mult || 1, radius, true);
        }
    }

    function pickerColor() {
        try {
            var hex = document.getElementById('colorPicker').value;
            return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
        } catch (_) {
            return [Math.random(), Math.random(), Math.random()];
        }
    }

    function hueColor(t, sat, lit) { // t 0..1 → rgb triplet via HSL
        var h = t * 360, s = sat, l = lit;
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1));
        var r = 0, g = 0, b = 0;
        if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
        else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
        else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
        var m = l - c / 2;
        return [r + m, g + m, b + m];
    }

    function spawnEmitter(e) {
        e.born = performance.now();
        // Cap concurrent emitters so fast BPM can't stack unbounded GL work
        if (emitters.length >= 4) emitters.shift();
        emitters.push(e);
    }

    function snapConfig(keys) {
        if (!window.config) return;
        cfgSnap = cfgSnap || {};
        for (var i = 0; i < keys.length; i++) {
            if (!(keys[i] in cfgSnap)) cfgSnap[keys[i]] = window.config[keys[i]];
        }
    }

    function restoreConfig() {
        if (!cfgSnap || !window.config) { cfgSnap = null; return; }
        for (var k in cfgSnap) {
            if (cfgSnap[k] !== undefined) window.config[k] = cfgSnap[k];
        }
        cfgSnap = null;
    }

    // Band routing: which engine detector fires a scene, and which band's
    // energy scales it. 'bass' (default) keeps the original feel: bass beat
    // OR flux onset. 'any' fires on everything — for sparse material.
    function bandBeat(frame, band) {
        if (band === 'mid') return frame.midBeat;
        if (band === 'treble') return frame.trebleBeat;
        if (band === 'onset') return frame.onset;
        if (band === 'any') return frame.beat || frame.midBeat || frame.trebleBeat || frame.onset;
        return frame.beat || frame.onset; // 'bass'
    }
    // Uses the SMOOTHED flux (what the gate meter displays), not the spiky
    // instantaneous one — the gate line the user draws must be the truth.
    function bandEnergy(frame, band) {
        if (band === 'mid') return frame.mid;
        if (band === 'treble') return frame.treble;
        if (band === 'onset') return frame.flux;
        if (band === 'any') return Math.max(frame.bass, frame.mid, frame.treble, frame.flux);
        return Math.max(frame.bass, frame.flux); // 'bass'
    }
    // ── Noise gate (the "make it feel intentional" layer) ───────────
    // With a gate set, the scene fires on the USER'S drawn line, not the
    // engine's hidden thresholds: post-gain band energy crossing the gate
    // upward = one trigger (edge-triggered, with hysteresis re-arm below
    // 80% of the gate and a cooldown so sustained loudness can't
    // machine-gun). Gate at 0 = original engine-beat behavior.
    var lastFireMs = 0; // for the meter's trigger flash
    function gateTrigger(state, frame, band, gain, gate, cooldownMs) {
        var fired = false;
        if (gate > 0.01) {
            var v = bandEnergy(frame, band) * (gain || 1);
            var armed = !state.above && (frame.now - (state.lastFire || 0)) > (cooldownMs || 170);
            if (v >= gate && armed) { fired = true; state.lastFire = frame.now; }
            if (v >= gate) state.above = true;
            else if (v < gate * 0.8) state.above = false; // hysteresis re-arm
        } else {
            fired = bandBeat(frame, band);
            if (fired) state.lastFire = frame.now;
        }
        if (fired) lastFireMs = frame.now;
        return fired;
    }
    // Soft gate for CONTINUOUS drivers (e.g. a sustained pull): below the
    // gate contributes nothing; above it rescales to 0..1 from the gate up.
    function gateLevel(v, gate) {
        if (!(gate > 0.01)) return v;
        return Math.max(0, Math.min(1, (v - gate) / Math.max(0.05, 1 - gate)));
    }

    // ── Spectral gates: user-drawn boxes on a log-frequency spectrum ────
    // Each gate = { lo, hi, th }: lo/hi are 0..1 positions on the log axis
    // (20 Hz – 20 kHz), th is the amplitude threshold 0..1. A gate fires when
    // the max hi-res bin in its band crosses th upward (per-gate hysteresis
    // + cooldown). Bidirectional log mapping per the VJ-gate spec.
    var FMIN = 20, FMAX = 20000;
    var LOG_SPAN = Math.log(FMAX / FMIN) / Math.LN10; // 3 decades
    function x01ToHz(x) { return FMIN * Math.pow(10, x * LOG_SPAN); }
    function hzToX01(hz) { return (Math.log(hz / FMIN) / Math.LN10) / LOG_SPAN; }
    function hzToBin(hz, sampleRate, fftSize) { return Math.round(hz * fftSize / sampleRate); }

    var gateFlash = {};   // 'sceneName:index' → fire timestamp (for the editor flash)
    function gateBandMax(hr, g) {
        var b0 = Math.max(1, hzToBin(x01ToHz(g.lo), hr.sampleRate, hr.fftSize));
        var b1 = Math.min(hr.data.length - 1, Math.max(b0, hzToBin(x01ToHz(g.hi), hr.sampleRate, hr.fftSize)));
        var mx = 0;
        for (var b = b0; b <= b1; b++) if (hr.data[b] > mx) mx = hr.data[b];
        return mx / 255;
    }
    // Returns fire energy (0 = none): max over fired gates of the threshold
    // excess, rescaled 0..1 — a hit just over the line is soft, a slam is 1.
    function gatesTrigger(states, frame, gates, gain, sceneName) {
        var hr = (window.audioReactive && window.audioReactive.getHiRes) ? window.audioReactive.getHiRes() : null;
        if (!hr) return 0;
        var fired = 0;
        for (var i = 0; i < gates.length; i++) {
            var g = gates[i];
            var st = states[i] || (states[i] = { above: false, lastFire: 0 });
            var v = Math.min(1, gateBandMax(hr, g) * (gain || 1));
            var armed = !st.above && (frame.now - st.lastFire) > 170;
            if (v >= g.th && armed) {
                st.lastFire = frame.now;
                lastFireMs = frame.now;
                gateFlash[sceneName + ':' + i] = frame.now;
                var e = (v - g.th) / Math.max(0.05, 1 - g.th);
                if (e > fired) fired = e;
            }
            if (v >= g.th) st.above = true;
            else if (v < g.th * 0.85) st.above = false;
        }
        return fired;
    }

    var F = {
        canvas: canvasEl,
        splat: splat,
        pickerColor: pickerColor,
        hueColor: hueColor,
        spawnEmitter: spawnEmitter,
        snapConfig: snapConfig,
        bandBeat: bandBeat,
        bandEnergy: bandEnergy,
        gateTrigger: gateTrigger,
        gateLevel: gateLevel,
        gatesTrigger: gatesTrigger
    };

    // ─── Per-scene option persistence ───────────────────────────────
    function loadOpts(name) {
        var def = scenes[name] ? scenes[name].defaults : {};
        var opts = {};
        for (var k in def) opts[k] = def[k];
        try {
            var saved = JSON.parse(localStorage.getItem(LS_KEY + name));
            if (saved) for (var s in saved) if (s in opts) opts[s] = saved[s];
        } catch (_) {}
        return opts;
    }

    function saveOpts(name, opts) {
        try { localStorage.setItem(LS_KEY + name, JSON.stringify(opts)); } catch (_) {}
    }

    // ─── Lifecycle ──────────────────────────────────────────────────
    function activate(name) {
        if (activeName === name) return;
        if (activeName) deactivate();
        var scene = scenes[name];
        if (!scene) return;

        if (window.audioReactive) {
            engineSnap = window.audioReactive.getConfig();
            // Scene owns the visuals: silence the engine's default mappings,
            // then let the scene re-enable any it wants in enter().
            ['bassAutoSplat', 'midToKaleido', 'trebleToColor', 'overallToSize'].forEach(function (k) {
                window.audioReactive.setMapping(k, false);
            });
        }
        activeName = name;
        activeOpts = loadOpts(name);
        emitters.length = 0;
        if (scene.enter) scene.enter(activeOpts, F);
    }

    function deactivate() {
        if (!activeName) return;
        var scene = scenes[activeName];
        if (scene && scene.exit) { try { scene.exit(activeOpts, F); } catch (_) {} }
        emitters.length = 0;
        restoreConfig();
        if (engineSnap && window.audioReactive) {
            window.audioReactive.applyConfig(engineSnap);
        }
        engineSnap = null;
        activeName = null;
        activeOpts = null;
    }

    // Called by 22-audio-reactive.js every analysis frame (engine enabled only).
    // THROTTLED to ~60Hz: the audio tick rides raw rAF, which runs UNCAPPED in
    // the Electron build (1000+ Hz on high-refresh rigs) — unthrottled, scenes
    // emitted dye/velocity hundreds of times per second and the look became
    // framerate-dependent. Beat flags from skipped ticks carry over so no hit
    // is ever missed.
    var _lastSceneTick = 0;
    var _pendBeats = null;
    function tickFrame(frame) {
        if (!activeName) return;
        if (_pendBeats) {
            frame.beat = frame.beat || _pendBeats.beat;
            frame.midBeat = frame.midBeat || _pendBeats.midBeat;
            frame.trebleBeat = frame.trebleBeat || _pendBeats.trebleBeat;
            frame.onset = frame.onset || _pendBeats.onset;
        }
        if (frame.now - _lastSceneTick < 15) {
            _pendBeats = { beat: frame.beat, midBeat: frame.midBeat, trebleBeat: frame.trebleBeat, onset: frame.onset };
            return;
        }
        _pendBeats = null;
        _lastSceneTick = frame.now;
        // Tick animated emitters first so rings/trails advance even if the
        // scene itself only reacts to beats.
        for (var i = emitters.length - 1; i >= 0; i--) {
            var e = emitters[i];
            var t = (frame.now - e.born) / e.duration;
            if (t >= 1) { emitters.splice(i, 1); continue; }
            try { e.update(t, frame); } catch (_) { emitters.splice(i, 1); }
        }
        var scene = scenes[activeName];
        if (scene && scene.tick) scene.tick(frame, activeOpts, F);
    }

    // ─── Scene: TUNNEL ──────────────────────────────────────────────
    scenes.tunnel = {
        label: 'Tunnel',
        // 'overflow' left this scene 2026-08-24 — it is an Effects checkbox
        // now (config.EDGE_ABSORB). Dropping the key from defaults is what
        // retires it: loadOpts only copies saved keys that still exist here,
        // so a stale saved overflow:true is inert rather than resurrected.
        defaults: { dir: 'out', trigger: 'bass', gates: [], gain: 1, volume: 1, spin: false },
        controls: [
            { type: 'cycle', key: 'dir', label: 'Direction',
              values: ['out', 'in', 'alt'],
              names: { out: 'Leaving ⤴', in: 'Entering ⤵', alt: 'Alternate ↕' } },
            { type: 'gates', key: 'gates', label: 'Gates' },
            { type: 'cycle', key: 'trigger', label: 'No-gate mode',
              values: ['bass', 'mid', 'treble', 'onset', 'any'],
              names: { bass: 'Bass', mid: 'Mids', treble: 'Treble', onset: 'Onset', any: 'Any hit' } },
            { type: 'slider', key: 'gain', label: 'Gain', min: 0.1, max: 4, step: 0.05 },
            { type: 'slider', key: 'volume', label: 'Volume', min: 0, max: 2, step: 0.01 },
            { type: 'toggle', key: 'spin', label: 'Spin' }
        ],
        enter: function (o, F) {
            this._flip = false;
            this._gs = { above: false, lastFire: 0 };
            // Fast dye fade: each hoop must read as a MOVING band, not fill
            // the disk — the trail dies quickly behind the traveling ring
            F.snapConfig(['DENSITY_DISSIPATION', 'VELOCITY_DISSIPATION']);
            if (window.config) {
                window.config.DENSITY_DISSIPATION = 0.92;
                window.config.VELOCITY_DISSIPATION = 0.975;
            }
            // The scene animates the canvas; it does not touch the user's brush.
            // (This used to force overallToSize back on, overriding the checkbox.)
        },
        tick: function (frame, o, F) {
            // Drawn gates rule when present; otherwise fall back to engine
            // beats on the selected band
            var fired = 0;
            if (o.gates && o.gates.length) {
                if (!this._gss) this._gss = [];
                fired = F.gatesTrigger(this._gss, frame, o.gates, o.gain, 'tunnel');
                if (!fired) return;
            } else {
                if (!this._gs) this._gs = { above: false, lastFire: 0 };
                if (!F.gateTrigger(this._gs, frame, o.trigger, o.gain, 0, 170)) return;
            }
            var c = F.canvas(); if (!c) return;
            var W = c.width, H = c.height, minDim = Math.min(W, H);
            var dir = o.dir;
            if (dir === 'alt') { this._flip = !this._flip; dir = this._flip ? 'out' : 'in'; }

            // Vanishing point = the canvas centre, which is the SAME pivot every
            // mirror in the app turns about: kaleido's vec2(0.5) (05a), Multi-Brush
            // symmetry's canvas.width/height * 0.5 (05g multiSplat), and Mandala's
            // W/2,H/2 (34). It used to sit at 0.44H — "slightly above centre" reads
            // fine on its own, but with Kaleido or a mirror symmetry on, the
            // reflections pivot about 0.5H and the tunnel doubles off-register
            // instead of landing back on itself.
            var vpx = W * 0.5, vpy = H * 0.5;
            var maxR = minDim * 0.52, minR = minDim * 0.04;
            // Volume: the feel dial — scales ring energy (thickness, speed,
            // travel time) and dye brightness together
            var vol = (typeof o.volume === 'number') ? o.volume : 1;
            if (vol <= 0.01) return;                 // volume zero = silent scene
            // Gate-fired hits carry the threshold-excess as punch (a floor
            // keeps barely-crossing hits visible)
            var energy = Math.min(1, (fired > 0
                ? 0.35 + 0.65 * fired
                : F.bandEnergy(frame, o.trigger) * (o.gain || 1)) * vol);
            var dyeK = Math.min(1.2, 0.45 * vol);    // per-frame band deposit strength
            var col = F.pickerColor();               // frozen per ring: each hoop reads as one color
            var basePh = Math.random() * Math.PI * 2;
            var ph = 0;

            // Step the palette per hoop so successive rings shift color
            try { if (typeof window.stepPaletteOnce === 'function') window.stepPaletteOnce(true); } catch (_) {}

            var spin = !!o.spin;
            F.spawnEmitter({
                duration: 660 - energy * 180,
                update: function (t) {
                    // Ring scale s: fraction of maxR. 'out' recedes 1→0
                    // accelerating away; 'in' erupts 0→1 rushing past.
                    var s = dir === 'out' ? 1 - t * t : t * t;
                    var r = minR + (maxR - minR) * s;
                    var squash = 0.5 + 0.5 * s;      // ellipse squash near the vanishing point
                    if (!spin && typeof window.applyRingSplat === 'function') {
                        // Solid band (default): ONE ring-stamp draw paints the
                        // whole thin circle and pushes it radially — the original
                        // "circle as the paintbrush" idea. Deposit is dimmed:
                        // ~40 frames of band overlap per beat would flood at
                        // full strength.
                        var th = (0.00025 + 0.0006 * energy) * (0.3 + 0.7 * s);
                        var rs = (140 + 380 * energy) * (dir === 'out' ? -1 : 1);
                        window.applyRingSplat(vpx, vpy, r, th, rs, 20, squash,
                            [col[0] * dyeK, col[1] * dyeK, col[2] * dyeK]);
                        return;
                    }
                    // Spin mode: rotating dabs sweep a spiral-ribbed hoop
                    // THIN ring: small dabs, shrinking with perspective
                    var rad = (0.003 + 0.008 * energy) * (0.3 + 0.7 * s);
                    // Fluid velocity streams along the ring's travel direction —
                    // restrained, so the hoop stays crisp instead of flooding
                    var vmag = (110 + 320 * energy) * (dir === 'out' ? -1 : 1);
                    ph += 2.39996;                    // golden-angle rotation fills the hoop over its life
                    var n = 6;
                    for (var i = 0; i < n; i++) {
                        var a = basePh + ph + (i / n) * Math.PI * 2;
                        var ca = Math.cos(a), sa = Math.sin(a);
                        F.splat(
                            vpx + ca * r, vpy + sa * r * squash,
                            ca * vmag + -sa * 25,     // radial travel + slight swirl
                            sa * squash * vmag + ca * 25,
                            col, rad
                        );
                    }
                }
            });
        }
    };

    // ─── Scenes: FERROFLUID / FERROFLUID ✨ — REMOVED 2026-08-16 ─────
    // Both magnet scenes (velocity-pull `ferro` and the attractor-field
    // `ferrofield`) were cut at Gabriel's call. The attractor shader and
    // its 05j dispatch stay — nothing else drives them today, but they are
    // general sim machinery, not scene code. Saved audioMode:"ferro"
    // coerces to "off" (registry options no longer list it).

    // ─── Gate meter widget ──────────────────────────────────────────
    // Live post-gain level of the scene's trigger band with a draggable
    // gate line: what you see is exactly what gates. Flashes on each fire.
    function meterLevel(bands, band) {
        if (!bands) return 0;
        if (band === 'mid') return bands.mid;
        if (band === 'treble') return bands.treble;
        if (band === 'onset') return bands.flux;
        if (band === 'any') return Math.max(bands.bass, bands.mid, bands.treble, bands.flux);
        return Math.max(bands.bass, bands.flux); // 'bass'
    }

    function wireGateMeter(cv, spec, opts, changed) {
        var dragging = false;
        var peak = 0, peakAt = 0;
        function setFromEvent(e) {
            var r = cv.getBoundingClientRect();
            var x = (e.clientX - r.left) / Math.max(1, r.width);
            opts[spec.key] = Math.max(0, Math.min(0.98, x));
            changed(spec.key);
        }
        cv.addEventListener('pointerdown', function (e) {
            dragging = true;
            try { cv.setPointerCapture(e.pointerId); } catch (_) {}
            setFromEvent(e);
        });
        cv.addEventListener('pointermove', function (e) { if (dragging) setFromEvent(e); });
        cv.addEventListener('pointerup', function () { dragging = false; });
        cv.addEventListener('dblclick', function () { opts[spec.key] = 0; changed(spec.key); }); // clear gate

        function draw() {
            if (!cv.isConnected) return; // scene box rebuilt/left — loop dies with the canvas
            requestAnimationFrame(draw);
            var r = cv.getBoundingClientRect();
            if (r.width < 2) return;
            var dpr = window.devicePixelRatio || 1;
            var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
            var ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(0, 0, w, h);
            var enabled = window.audioReactive && window.audioReactive.isEnabled();
            var bands = enabled ? window.audioReactive.getBands() : null;
            var v = Math.min(1, meterLevel(bands, opts.trigger || 'any') * (opts.gain || 1));
            // Level bar: green → amber → red
            var grad = ctx.createLinearGradient(0, 0, w, 0);
            grad.addColorStop(0, '#3ddc78'); grad.addColorStop(0.6, '#ffd24d'); grad.addColorStop(1, '#ff5a5a');
            ctx.fillStyle = grad;
            ctx.fillRect(0, h * 0.2, w * v, h * 0.6);
            // Peak hold (1.2s)
            var now = performance.now();
            if (v >= peak || now - peakAt > 1200) { peak = v; peakAt = now; }
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fillRect(Math.max(0, w * peak - dpr), h * 0.2, Math.max(1, dpr), h * 0.6);
            var gate = opts[spec.key] || 0;
            if (gate > 0.01) {
                var gx = w * gate;
                // Dim the ignored region, then the gate line on top
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(0, 0, gx, h);
                ctx.fillStyle = v >= gate ? '#ffb347' : 'rgba(255,255,255,0.9)';
                ctx.fillRect(gx - dpr, 0, 2 * dpr, h);
            }
            // Trigger flash
            if (now - lastFireMs < 160) {
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 2 * dpr;
                ctx.strokeRect(dpr, dpr, w - 2 * dpr, h - 2 * dpr);
            }
            ctx.textBaseline = 'middle';
            if (!enabled) {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = Math.round(h * 0.32) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('enable audio to see signal', w / 2, h / 2);
            } else if (gate <= 0.01) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = Math.round(h * 0.28) + 'px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText('drag to set gate', w - 4 * dpr, h / 2);
            }
        }
        requestAnimationFrame(draw);
    }

    // ─── Spectral gate editor widget ────────────────────────────────
    // Live log-frequency spectrum with user-drawn gate boxes: drag to draw
    // (X span = frequency band, top edge = threshold), double-click a box to
    // delete it. Boxes brighten the frame their band is over threshold and
    // flash white when they actually fire. Zero allocations in the loop:
    // the column→bin LUT rebuilds only on resize, and redraws are
    // timestamp-throttled (rAF runs uncapped in the Electron build).
    var MAX_GATES = 8;
    function wireGatesEditor(cv, spec, opts, changed, sceneName) {
        var drawing = null;   // { x0, y0, x1, y1 } while dragging a NEW box
        var editing = null;   // { idx, g, zone, orig, sx, sy, moved } while dragging an EXISTING one
        var activePid = null; // the ONE pointer that owns the current gesture (multi-touch latch)
        var lastMovedEnd = 0; // when the last real edit-drag ended — suppresses dblclick-delete
        var colBins = null;   // Int16Array LUT: column → first hi-res bin
        var lutW = 0, lutSr = 0;
        var lastDraw = 0;
        var lastLive = 0;
        // Optional live-edit hook: called with the gate index while a box is
        // being grabbed/dragged, and null when the gesture ends — the timing
        // chart glows the matching lane off this.
        var notifyEdit = (typeof spec.onEditActive === 'function') ? spec.onEditActive : function () {};

        function rect() { return cv.getBoundingClientRect(); }

        // What is under the pointer? Boxes are grabbable (2026-08-26): the
        // top edge drags the threshold, the sides retune the band, the body
        // moves the whole box; empty space still draws a new one. Top-most
        // (last-drawn) box wins where they overlap.
        var HITPX = 11;   // grab tolerance around box edges — a hair over half a WCAG target
        function gateAt(px, py, r) {
            var gates = opts[spec.key] || [];
            for (var i = gates.length - 1; i >= 0; i--) {
                var g = gates[i];
                var gx0 = g.lo * r.width, gx1 = g.hi * r.width, gy = (1 - g.th) * r.height;
                if (px < gx0 - HITPX || px > gx1 + HITPX) continue;
                if (Math.abs(py - gy) <= HITPX && px >= gx0 - HITPX && px <= gx1 + HITPX) return { idx: i, zone: 'th' };
                if (py > gy) {
                    if (Math.abs(px - gx0) <= HITPX) return { idx: i, zone: 'l' };
                    if (Math.abs(px - gx1) <= HITPX) return { idx: i, zone: 'r' };
                    return { idx: i, zone: 'in' };
                }
            }
            return null;
        }
        var CURSORS = { th: 'ns-resize', l: 'ew-resize', r: 'ew-resize', 'in': 'move' };

        // Live commit while dragging, throttled: with the timing chart's
        // cached extraction a re-chart costs ~1 ms, so the lanes refill AS
        // the box moves; the trailing edge lands in pointerup's final commit.
        function liveChange(now) {
            if (now - lastLive < 40) return;   // extraction is ~1 ms — commit often
            lastLive = now;
            changed(spec.key);
        }
        function buildLUT(wCols, sr, fftSize) {
            if (colBins && lutW === wCols && lutSr === sr) return;
            colBins = new Int16Array(wCols + 1);
            for (var c = 0; c <= wCols; c++) {
                colBins[c] = Math.max(1, hzToBin(x01ToHz(c / wCols), sr, fftSize));
            }
            lutW = wCols; lutSr = sr;
        }

        function commitDrawing() {
            if (!drawing) return;
            var r = rect();
            var x0 = Math.min(drawing.x0, drawing.x1) / r.width;
            var x1 = Math.max(drawing.x0, drawing.x1) / r.width;
            var topY = Math.min(drawing.y0, drawing.y1) / r.height;
            drawing = null;
            if ((x1 - x0) * r.width < 6) return; // too narrow — treat as a stray click
            var gates = opts[spec.key] || (opts[spec.key] = []);
            if (gates.length >= MAX_GATES) gates.shift();
            gates.push({
                lo: Math.max(0, Math.min(0.99, x0)),
                hi: Math.max(0.01, Math.min(1, x1)),
                th: Math.max(0.05, Math.min(0.98, 1 - topY)),
                // A drawn top edge is a CHOICE — auto-calibration (timing
                // chart) must never slide an edge the user placed.
                uth: 1
            });
            changed(spec.key);
        }

        cv.addEventListener('pointerdown', function (e) {
            if (activePid !== null) return;   // one finger owns a gesture at a time
            activePid = e.pointerId;
            lastLive = 0;   // the FIRST movement of a fresh gesture commits immediately
            var r = rect();
            var px = e.clientX - r.left, py = e.clientY - r.top;
            var hit = gateAt(px, py, r);
            if (hit) {
                var g = (opts[spec.key] || [])[hit.idx];
                // g itself is stashed: if the array is replaced or spliced
                // mid-gesture (Auto, Clear, a row ✕), identity — not the
                // index — decides whether the drag may continue.
                editing = { idx: hit.idx, g: g, zone: hit.zone, sx: px, sy: py,
                            orig: { lo: g.lo, hi: g.hi, th: g.th }, moved: false };
                notifyEdit(hit.idx);
            } else {
                drawing = { x0: px, y0: py, x1: px, y1: py };
            }
            try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        });
        cv.addEventListener('pointermove', function (e) {
            var r = rect();
            var px = e.clientX - r.left, py = e.clientY - r.top;
            if ((editing || drawing) && e.pointerId !== activePid) return;
            if (editing) {
                // Mouse insurance for a failed setPointerCapture: buttons 0
                // mid-"drag" means the up happened somewhere we missed.
                if (e.pointerType === 'mouse' && e.buttons === 0) {
                    if (editing.moved) {
                        if (editing.zone === 'th') editing.g.uth = 1;
                        changed(spec.key); lastMovedEnd = performance.now();
                    }
                    editing = null; activePid = null; notifyEdit(null); return;
                }
                var gates = opts[spec.key] || [];
                var g = gates[editing.idx];
                if (g !== editing.g) {
                    // The array changed under the gesture (Auto / Clear / a
                    // row delete). Follow the SAME object if it merely moved
                    // index; drop the gesture if it is gone.
                    var ni = gates.indexOf(editing.g);
                    if (ni < 0) { editing = null; notifyEdit(null); return; }
                    editing.idx = ni;
                    g = editing.g;
                    notifyEdit(ni);
                }
                // A plain click must not count as an edit: require real travel.
                if (!editing.moved && Math.abs(px - editing.sx) + Math.abs(py - editing.sy) < 3) return;
                var o = editing.orig;
                if (editing.zone === 'th') {
                    g.th = Math.max(0.05, Math.min(0.98, 1 - py / r.height));
                } else if (editing.zone === 'l') {
                    g.lo = Math.max(0, Math.min(g.hi - 0.02, px / r.width));
                } else if (editing.zone === 'r') {
                    g.hi = Math.max(g.lo + 0.02, Math.min(1, px / r.width));
                } else { // 'in' — slide the whole band, width preserved
                    var w = o.hi - o.lo;
                    var nlo = Math.max(0, Math.min(1 - w, o.lo + (px - editing.sx) / r.width));
                    g.lo = nlo; g.hi = nlo + w;
                }
                editing.moved = true;
                liveChange(performance.now());
                return;
            }
            if (drawing) {
                drawing.x1 = px;
                drawing.y1 = py;
                return;
            }
            // Hover: advertise what a grab would do
            var hov = gateAt(px, py, r);
            cv.style.cursor = hov ? CURSORS[hov.zone] : 'crosshair';
        });
        cv.addEventListener('pointerup', function (e) {
            if (e.pointerId !== activePid) return;
            activePid = null;
            if (editing) {
                if (editing.moved) {
                    // Dragging the top edge claims the threshold as user-set;
                    // band moves/resizes leave calibration free to help.
                    if (editing.zone === 'th') editing.g.uth = 1;
                    changed(spec.key);   // trailing edge of the live drag
                    // Two quick nudges land inside the OS double-click window
                    // and dblclick would DELETE the box being fine-tuned —
                    // remember when a real drag ended so it can decline.
                    lastMovedEnd = performance.now();
                }
                editing = null;
                notifyEdit(null);
                return;
            }
            commitDrawing(e);
        });
        // A cancelled pen/touch stroke (palm rejection, pen leaving range)
        // must NOT leave the drag armed — the phantom box would follow the
        // hover and the next click would commit a gate nobody drew. A
        // cancelled EDIT puts the box back where it started.
        cv.addEventListener('pointercancel', function (e) {
            if (e.pointerId !== activePid) return;
            activePid = null;
            if (editing) {
                // Restore by IDENTITY — the index may point at an unrelated
                // gate if the array changed during the gesture.
                var gates = opts[spec.key] || [];
                if (gates.indexOf(editing.g) >= 0) {
                    editing.g.lo = editing.orig.lo; editing.g.hi = editing.orig.hi; editing.g.th = editing.orig.th;
                    changed(spec.key);
                }
                editing = null;
                notifyEdit(null);
            }
            drawing = null;
        });
        cv.addEventListener('dblclick', function (e) {
            // Two quick threshold nudges read as a double-click to the OS;
            // deleting the box someone is fine-tuning is the worst outcome.
            if (performance.now() - lastMovedEnd < 400) return;
            var r = rect();
            var x = (e.clientX - r.left) / r.width;
            var y = (e.clientY - r.top) / r.height;
            var gates = opts[spec.key] || [];
            for (var i = gates.length - 1; i >= 0; i--) {
                var g = gates[i];
                if (x >= g.lo && x <= g.hi && y >= (1 - g.th)) {
                    gates.splice(i, 1);
                    changed(spec.key);
                    return;
                }
            }
        });

        function draw() {
            if (!cv.isConnected) return; // widget rebuilt/left — loop dies
            requestAnimationFrame(draw);
            var now = performance.now();
            if (now - lastDraw < ((drawing || editing) ? 16 : 33)) return; // uncapped rAF — self-throttle
            lastDraw = now;
            var r = rect();
            if (r.width < 2) return;
            var dpr = window.devicePixelRatio || 1;
            var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
            if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
            var ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, w, h);

            // Decade grid: 20 / 200 / 2k / 20k
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            for (var d = 1; d < 3; d++) ctx.fillRect(Math.round(w * d / 3), 0, dpr, h);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = Math.max(8, Math.round(9 * dpr)) + 'px monospace';
            ctx.textBaseline = 'top'; ctx.textAlign = 'left';
            ctx.fillText('20', 2 * dpr, 2 * dpr);
            ctx.fillText('200', w / 3 + 2 * dpr, 2 * dpr);
            ctx.fillText('2k', w * 2 / 3 + 2 * dpr, 2 * dpr);
            ctx.textAlign = 'right';
            ctx.fillText('20k', w - 2 * dpr, 2 * dpr);

            var hr = (window.audioReactive && window.audioReactive.getHiRes) ? window.audioReactive.getHiRes() : null;
            var gain = opts.gain || 1;
            var cols = Math.max(2, Math.floor(w / dpr));
            if (hr) {
                buildLUT(cols, hr.sampleRate, hr.fftSize);
                // Filled spectrum curve, bass-red → treble-violet gradient
                var grad = ctx.createLinearGradient(0, 0, w, 0);
                grad.addColorStop(0, 'rgba(255,90,80,0.75)');
                grad.addColorStop(0.5, 'rgba(80,220,120,0.75)');
                grad.addColorStop(1, 'rgba(150,120,255,0.75)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(0, h);
                for (var c = 0; c < cols; c++) {
                    var b0 = colBins[c], b1 = Math.max(b0 + 1, colBins[c + 1]);
                    var mx = 0;
                    for (var b = b0; b < b1 && b < hr.data.length; b++) if (hr.data[b] > mx) mx = hr.data[b];
                    var v = Math.min(1, (mx / 255) * gain);
                    ctx.lineTo((c / cols) * w, h - v * h);
                }
                ctx.lineTo(w, h);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = Math.round(h * 0.14) + 'px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('enable audio to see the spectrum', w / 2, h / 2);
            }

            // Gate boxes
            var gates = opts[spec.key] || [];
            for (var i = 0; i < gates.length; i++) {
                var g = gates[i];
                var gx = g.lo * w, gw = (g.hi - g.lo) * w, gy = (1 - g.th) * h;
                var hot = false;
                if (hr) hot = Math.min(1, gateBandMax(hr, g) * gain) >= g.th;
                var fl = gateFlash[sceneName + ':' + i] || 0;
                var flashing = now - fl < 150;
                var grabbed = editing && editing.idx === i;
                if (grabbed) { flashing = false; hot = false; }
                ctx.fillStyle = grabbed ? 'rgba(120,200,255,0.22)' : hot ? 'rgba(255,178,71,0.30)' : 'rgba(255,255,255,0.10)';
                ctx.fillRect(gx, gy, gw, h - gy);
                ctx.strokeStyle = grabbed ? 'rgba(120,200,255,0.95)' : flashing ? 'rgba(255,255,255,0.95)' : hot ? '#ffb347' : 'rgba(255,255,255,0.55)';
                ctx.lineWidth = (grabbed || flashing || hot ? 2 : 1) * dpr;
                ctx.strokeRect(gx, gy, gw, h - gy);
                // threshold line emphasis
                ctx.fillStyle = flashing ? '#fff' : hot ? '#ffb347' : 'rgba(255,255,255,0.8)';
                ctx.fillRect(gx, gy - dpr, gw, 2 * dpr);
            }

            // In-progress drawing preview
            if (drawing) {
                var px = Math.min(drawing.x0, drawing.x1) * dpr;
                var pw = Math.abs(drawing.x1 - drawing.x0) * dpr;
                var py = Math.min(drawing.y0, drawing.y1) * dpr;
                ctx.strokeStyle = 'rgba(120,200,255,0.9)';
                ctx.setLineDash([4 * dpr, 3 * dpr]);
                ctx.lineWidth = dpr;
                ctx.strokeRect(px, py, pw, h - py);
                ctx.setLineDash([]);
            }

            if (hr && !gates.length && !drawing) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = Math.round(h * 0.12) + 'px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('drag a box to gate a band · drag its edges to retune · dbl-click deletes', w / 2, h * 0.5);
            }
        }
        requestAnimationFrame(draw);
    }

    // Small ✕ Clear button for gate widgets (13.4 — double-click is
    // unreliable on touch devices)
    function makeGateClearBtn(onClear) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'audio-gate-clear';
        btn.textContent = 'Clear';
        btn.title = 'Clear this gate';
        btn.style.cssText = 'flex:0 0 auto; margin-top:4px; cursor:pointer;';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            onClear();
        });
        return btn;
    }

    // ─── Controls UI ────────────────────────────────────────────────
    // Renders a scene's control spec into a host element. Values persist
    // per scene in localStorage and apply live via scene.onChange.
    function buildControls(name, host) {
        if (!host) return;
        host.innerHTML = '';
        var scene = scenes[name];
        if (!scene || !scene.controls) return;
        var opts = (activeName === name && activeOpts) ? activeOpts : loadOpts(name);

        function changed(key) {
            saveOpts(name, opts);
            if (activeName === name && scene.onChange) scene.onChange(key, opts, F);
        }

        scene.controls.forEach(function (spec) {
            var row = document.createElement('div');
            row.className = 'control-group audio-scene-ctl';
            var lbl = document.createElement('label');
            lbl.textContent = spec.label;
            row.appendChild(lbl);

            if (spec.type === 'slider') {
                var input = document.createElement('input');
                input.type = 'range';
                input.min = spec.min; input.max = spec.max; input.step = spec.step;
                input.value = opts[spec.key];
                input.addEventListener('input', function () {
                    opts[spec.key] = parseFloat(input.value);
                    changed(spec.key);
                });
                row.appendChild(input);
            } else if (spec.type === 'cycle') {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'audio-scene-cycle';
                var render = function () {
                    var v = opts[spec.key];
                    btn.textContent = (spec.names && spec.names[v]) || String(v);
                };
                btn.addEventListener('click', function () {
                    var idx = spec.values.indexOf(opts[spec.key]);
                    opts[spec.key] = spec.values[(idx + 1) % spec.values.length];
                    render();
                    changed(spec.key);
                });
                render();
                row.appendChild(btn);
            } else if (spec.type === 'toggle') {
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = !!opts[spec.key];
                cb.addEventListener('change', function () {
                    opts[spec.key] = cb.checked;
                    changed(spec.key);
                });
                row.appendChild(cb);
            } else if (spec.type === 'gate') {
                var meter = document.createElement('canvas');
                meter.className = 'audio-gate-meter';
                meter.title = 'Drag to set the trigger gate — double-click or ✕ to clear';
                row.appendChild(meter);
                wireGateMeter(meter, spec, opts, changed);
                // 13.4: dbl-click is unreliable on touch — honest Clear button
                row.appendChild(makeGateClearBtn(function () {
                    opts[spec.key] = 0;
                    changed(spec.key);
                }));
            } else if (spec.type === 'gates') {
                row.classList.add('audio-gates-row');
                var editor = document.createElement('canvas');
                editor.className = 'audio-gates-editor';
                editor.title = 'Drag a box: width = frequency band, top edge = threshold. Double-click a box (or ✕) to delete.';
                row.appendChild(editor);
                wireGatesEditor(editor, spec, opts, changed, name);
                row.appendChild(makeGateClearBtn(function () {
                    opts[spec.key] = [];
                    changed(spec.key);
                }));
            }
            host.appendChild(row);
        });
    }

    // ─── Public API ─────────────────────────────────────────────────
    window.AudioScenes = {
        names: function () { return Object.keys(scenes); },
        labelOf: function (name) { return scenes[name] ? scenes[name].label : name; },
        isScene: function (name) { return !!scenes[name]; },
        activate: activate,
        deactivate: deactivate,
        active: function () { return activeName; },
        tickFrame: tickFrame,
        buildControls: buildControls,

        // ── Gate-editor widget, lent out (2026-08-26) ────────────────
        // The spectral gate editor is not scene-specific: it is "draw the
        // bands you care about on the live spectrum". The timing chart
        // (40-audio-timing.js) draws its lanes from exactly the same boxes,
        // so it borrows the widget rather than growing a second copy that
        // would drift. `store` is any object; `key` is the array field on it.
        // hooks (optional): { onEditActive(idxOrNull) } — fires while a box
        // is being grabbed/dragged so the borrower can glow the matching lane.
        mountGatesEditor: function (canvasEl, store, key, onChange, tag, hooks) {
            wireGatesEditor(canvasEl, { key: key, onEditActive: hooks && hooks.onEditActive }, store, function () {
                if (onChange) onChange(key);
            }, tag || 'gates');
        },
        gateClearButton: makeGateClearBtn,
        // Blink box `i` of `tag`'s editor — lets a non-scene consumer show a
        // hit on the same surface the user drew it on.
        flashGate: function (tag, i) { gateFlash[tag + ':' + i] = performance.now(); },
        // The 20 Hz - 20 kHz log axis the editor's X coordinates mean, so a
        // consumer can label a box in hertz.
        x01ToHz: x01ToHz,
        hzToX01: hzToX01
    };
})();
