// ═══════════════════════════════════════════════════════════════════
// scripts/bake-effect-previews.js — bakes the Effects rows' previews.
//
// PAGE code: inject it into the running app — scripts/bake-headless.js
// does that in a throwaway headless Chrome (the way the shipped previews
// were baked), or paste it into the preview pane's JS tool, or run
// `node tmp-cdp-driver.js @scripts/bake-effect-previews.js` against the
// Electron build — then:
//
//   await __fxBake.run('glow')        // one effect → {gif, png, bytes}
//   await __fxBake.runAll()           // every key in FX_STAGES
//
// Each preview is a short LOOP staged for that one effect, not a formula:
// the effects that read as a before/after (Glow, Scatter, Surface Shading,
// Light Shift) flip on part-way through; the ones that ARE motion (Light
// Source, Gravity Direction, Border, Breathing) run live from the first
// frame with a scene built to show them — an orbiting light over a relief,
// drips falling, a full canvas draining at the rim, one whole breath. Every
// stroke and cue is positioned by LOOP PHASE (frame / frames), not wall
// time, so the loop closes on itself whatever the capture rate, and a
// warm-up runs the same scene before frame 0 so the first frame is already
// in its steady state.
//
// Output: assets/effects/<key>.gif (320px wide, 30fps, ~3s) and <key>.png
// (a 64px square crop of one frame, the row thumbnail). Files are handed to
// whatever is listening at RECEIVER (scripts/asset-receiver.js) — when
// nothing is, the bytes come back as base64 for the caller to write.
//
// Drives the real app: strokes are dispatched as pointer events on the
// canvas, effects are flipped through their own checkboxes and sliders, and
// the GIF comes out of js/24-video-export's encoder via its onFrame/onBlob
// hooks. The governor is off, Motion Detail is set to 1024 and Image
// Sharpness to 2048, so the motion carries real detail at 320px. Everything it touches is put back
// afterwards (look snapshot) — but several effect controls WRITE THROUGH to
// settings on change (light source, light shift, material…), so run this
// on a scratch profile / throwaway origin, never on a profile whose saved
// settings matter.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const RECEIVER = 'http://127.0.0.1:3999';
    const $ = (id) => document.getElementById(id);
    // The genuine timer handles, taken before the hidden-tab pump can replace them.
    const realSetTimeout = window.setTimeout.bind(window), realClearTimeout = window.clearTimeout.bind(window);
    const TAU = Math.PI * 2;

    function setCheck(id, on) {
        const el = $(id);
        if (el && el.checked !== on) { el.checked = on; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    function setSlider(id, v) {
        const el = $(id);
        if (!el) return;
        el.value = String(v);
        el.style.setProperty('--val', v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function setSelect(id, v) {
        const el = $(id);
        if (!el) return;
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function setColor(hex) {
        const el = $('colorPicker');
        if (!el) return;
        el.value = hex;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const FX_CHECKS = ['enableLighting', 'enableLightShift', 'glowToggle', 'scatterToggle',
                       'displayShadingToggle', 'pressureConstant', 'overflowToggle', 'breathingToggle'];
    function allOff() {
        FX_CHECKS.forEach((id) => setCheck(id, false));
        ['vibrance', 'ridges'].forEach((id) => setSlider(id, 0));
        if (window.config) { window.config.AMBIENT_FORCE_X = 0; window.config.AMBIENT_FORCE_Y = 0; }
    }

    // ── Sim quality for the bake ──────────────────────────────────────
    // The governor would otherwise pick a resolution for the machine (and
    // move it mid-loop); the previews want the fine filaments of a high sim
    // grid whatever the box. Re-applied at the start of EVERY bake: the
    // look-snapshot restore at the end of a bake puts the saved tier back
    // (a one-shot pin left every bake after the first at 512). The
    // throwaway profile is not put back (a reload restores the settings).
    function pinQuality() {
        if (!window.config) return;
        paceRaf(60);
        try { if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false); } catch (_) {}
        setCheck('governorToggle', false);
        // Motion Detail (the underbar's physicsResolution select) one step
        // up from the 512 default, and Image Sharpness at its 2048 default —
        // through the app's own selects so the sim rescales the way a user's
        // change would. (Setting config.SIM_RESOLUTION by hand was tried and
        // blamed for a flood that was really the brush size; the selects are
        // the supported path.)
        setSelect('visualResolution', '2048');
        setSelect('physicsResolution', '1024');
        if (window.config) window.config.DYE_RESOLUTION = Math.max(window.config.DYE_RESOLUTION || 0, 2048);
        if (typeof window.__reinitFramebuffers === 'function') window.__reinitFramebuffers();
        else window.needsFramebufferReinit = true;
    }

    // ── 60 Hz frame pacing ─────────────────────────────────────────────
    // Headless Chrome has no vsync: rAF runs as fast as the GPU draws (144+
    // on the 4090), so the pen would lay two to three times the dabs a real
    // 60 Hz session lays and the sim would step that much oftener — the
    // first bakes flooded. 05j's loop and the pen both schedule through the
    // global requestAnimationFrame, so pacing it here paces everything:
    // callbacks are batched and flushed on the native rAF only once the
    // frame period has elapsed. Idempotent; not undone (throwaway page).
    function paceRaf(hz) {
        if (window.__fxPaced) return;
        const period = 1000 / hz - 0.5;
        const native = window.requestAnimationFrame.bind(window);
        let q = new Map(), id = 0, armed = false, last = performance.now();
        function flush(now) {
            armed = false;
            if (now - last < period) { armed = true; native(flush); return; }
            last = now;
            const cbs = Array.from(q.values()); q = new Map();
            for (const cb of cbs) { try { cb(now); } catch (e) { console.error('[fxBake] raf', e); } }
            if (q.size && !armed) { armed = true; native(flush); }
        }
        window.requestAnimationFrame = function (cb) {
            const i = ++id; q.set(i, cb);
            if (!armed) { armed = true; native(flush); }
            return i;
        };
        window.cancelAnimationFrame = function (i) { q.delete(i); };
        window.__fxPaced = hz;
    }

    // ── The pen ───────────────────────────────────────────────────────
    // Every stage describes its stroke as pen(phase) → {u, v} in canvas
    // fractions, or null for pen-up. The painter samples it once per rAF at
    // the CURRENT loop phase (frame index + the time since that frame was
    // grabbed, over the frame count — or wall time before capture starts)
    // and dispatches real pointer events, so down/up transitions happen
    // wherever the stage says. A closed pen path per loop makes the stroke
    // itself seamless; the warm-up takes care of the paint under it.
    const P = { on: false, down: false, raf: 0, pen: null, phase: () => 0 };
    function canvasPoint(q) {
        const r = $('canvas').getBoundingClientRect();
        return { x: r.left + q.u * r.width, y: r.top + q.v * r.height };
    }
    function fire(type, p, buttons) {
        $('canvas').dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: buttons, clientX: p.x, clientY: p.y, pressure: buttons ? 0.5 : 0
        }));
    }
    let lastPt = null;
    function penStep() {
        const q = P.pen ? P.pen(P.phase()) : null;
        if (q) {
            const p = canvasPoint(q);
            if (!P.down) { fire('pointerdown', p, 1); P.down = true; }
            else fire('pointermove', p, 1);
            lastPt = p;
        } else if (P.down) {
            fire('pointerup', lastPt || canvasPoint({ u: 0.5, v: 0.5 }), 0);
            P.down = false;
        }
    }
    function paintStart(pen, phaseFn) {
        P.pen = pen; P.phase = phaseFn; P.on = true;
        (function tick() {
            if (!P.on) return;
            penStep();
            P.raf = requestAnimationFrame(tick);
        })();
    }
    function paintStop() {
        if (!P.on) return;
        P.on = false;
        cancelAnimationFrame(P.raf);
        if (P.down) { fire('pointerup', lastPt || canvasPoint({ u: 0.5, v: 0.5 }), 0); P.down = false; }
    }

    // Pen shapes. Closed per loop: integer turn counts.
    // lissajous(ampU, ampV, turnsU, turnsV) — the whole loop is one pass.
    function lissajous(au, av, ku, kv, phU, phV) {
        return (p) => ({ u: 0.5 + au * Math.sin(TAU * ku * p + (phU || 0)), v: 0.5 + av * Math.sin(TAU * kv * p + (phV || 1.1)) });
    }
    // dabs(list, hold) — pen down for `hold` of the loop at each {u, v, at},
    // wiggling in a small circle so the dab is a blob, not a point.
    function dabs(list, hold, wiggle) {
        return (p) => {
            for (const d of list) {
                let dt = p - d.at; if (dt < 0) dt += 1;
                if (dt < hold) { const a = (dt / hold) * TAU * 1.5; return { u: d.u + wiggle * Math.cos(a), v: d.v + wiggle * Math.sin(a) }; }
            }
            return null;
        };
    }

    // ── Stages ────────────────────────────────────────────────────────
    // color/size: brush for the loop. pen: the stroke (null = none).
    // pre(): scene setup before the warm-up. warm: seconds of the scene run
    // before frame 0 (steady state). flipAt: loop phase at which on() runs
    // (before/after stages; absent = live from the start). frame(p, i, n):
    // per-captured-frame cue (light position, direction…). still: the loop
    // phase whose frame becomes the thumbnail. duration/fps/width override
    // the defaults. gate/flow: Gate on + Flow < 1 lays a capped, unblown
    // stroke (relief and drips want that); additive (default) blows the core
    // out, which is what Light Shift and Glow feed on. Brush sizes are tiny
    // on purpose: the size is a Gaussian spread — size 5 is a dab 7% of the
    // canvas wide, and a loop of continuous painting at that size floods
    // (measured 2026-09-03); size 1 is a ~25px stroke at 320px.
    const FX_STAGES = {
        // The light orbits the canvas once per loop over a stroke that keeps
        // laying relief: highlights and shadow sweep across the paint. Live
        // from the first frame — the effect IS the moving light.
        'light-source': {
            color: '#ff8a3d', size: 1.4, gate: true, flow: 0.7, warm: 1.6, still: 0.62,
            pen: lissajous(0.30, 0.26, 1, 2),
            pre() {
                setCheck('enableLighting', true);
                if (window.lightSource) window.lightSource.mode = 'manual';
                setSelect('lightMode', 'manual');
                setSlider('lightIntensity', 1); setSlider('lightAmbient', 0.3);
            },
            frame(p) {
                if (!window.lightSource) return;
                const a = TAU * p - Math.PI * 0.75;
                window.lightSource.x = 0.5 + 0.44 * Math.cos(a);
                window.lightSource.y = 0.5 + 0.44 * Math.sin(a);
            }
        },
        // Before/after: white paint, then its blown-out core takes the hue
        // from a rainbow path whose playhead laps the loop, so the colour
        // keeps travelling rather than landing on one red.
        'light-shift': {
            color: '#ffffff', size: 1.6, warm: 1.2, flipAt: 0.28, still: 0.7,
            pen: lissajous(0.30, 0.26, 1, 2),
            pre() {
                if (window.lightShift && window.lightShift.setPath) {
                    const path = [];
                    // Path points are degrees / PERCENT / PERCENT (14-light-shift's
                    // wheel writes lightness 50) — 0..1 here lands near black.
                    // 18 points at speed 1 = one lap in ~3 s at the 60 Hz gate.
                    for (let i = 0; i < 18; i++) path.push({ hue: (i * 20) % 360, saturation: 100, lightness: 55, position: i / 18 });
                    window.lightShift.setPath(path);
                }
                setSelect('lightShiftMode', 'replace');
                setSlider('lightShiftThreshold', 0.5); setSlider('lightShiftIntensity', 1); setSlider('lightShiftSpeed', 1);
            },
            on() { setCheck('enableLightShift', true); }
        },
        'glow': {
            // Gate on: an additive (blown-out) stroke bloomed the whole frame.
            color: '#ffb347', size: 1, gate: true, flow: 1, warm: 1.2, flipAt: 0.33, still: 0.7,
            pen: lissajous(0.30, 0.26, 1, 2),
            on() { setCheck('glowToggle', true); setSlider('glowIntensity', 0.7); setSlider('glowThreshold', 0.65); }
        },
        'scatter': {
            // Additive here on purpose: the shafts want a hot core to leave from.
            color: '#ffc06a', size: 1, warm: 1.2, flipAt: 0.33, still: 0.7,
            pen: lissajous(0.30, 0.26, 1, 2),
            pre() {
                setCheck('glowToggle', true); setSlider('glowIntensity', 0.18); setSlider('glowThreshold', 0.8);
                setCheck('enableLighting', true);
                if (window.lightSource) { window.lightSource.mode = 'manual'; window.lightSource.x = 0.1; window.lightSource.y = 0.12; }
            },
            on() { setCheck('scatterToggle', true); setSlider('scatterAmount', 0.5); setSlider('scatterReach', 1); }
        },
        'shading': {
            color: '#e8e2d6', size: 1.6, gate: true, flow: 1, warm: 1.2, flipAt: 0.33, still: 0.7,
            pen: lissajous(0.30, 0.26, 1, 2),
            on() { setCheck('displayShadingToggle', true); setSlider('shadingIntensity', 1.0); setSlider('shadeRelief', 1.2); setSlider('shadeGloss', 0.5); }
        },
        // Live from the first frame, pad aimed down: dabs dropped along the
        // top fall as drips and pool at the bottom. The warm-up is one full
        // loop so frame 0 already has drips in flight.
        'gravity': {
            color: '#bfe9ff', size: 2.2, duration: 3600, warm: 3.6, still: 0.42,
            // Held still (no wiggle): a wiggling dab gave the drop sideways
            // velocity and it mushroomed instead of falling. Additive: a
            // gated drop dimmed to grey as it spread on the way down.
            pen: dabs([{ u: 0.24, v: 0.12, at: 0.0 }, { u: 0.66, v: 0.1, at: 0.33 }, { u: 0.45, v: 0.11, at: 0.66 }], 0.07, 0),
            pre() {
                setCheck('pressureConstant', true);
                if (window.config) {
                    window.config.AMBIENT_FORCE = true; window.config.AMBIENT_FORCE_X = 0; window.config.AMBIENT_FORCE_Y = 1;
                    // Faster than the shipped field (12 ≈ 25% of the canvas a
                    // second) and old drips fade in under a second, so each
                    // drop is read falling on its own against a dark canvas
                    // — persistent paint piled into a static cloud layer.
                    window.config.AMBIENT_FORCE_REF = 12;
                    window.config.DENSITY_DISSIPATION = 0.986;
                }
            }
        },
        // A canvas filled to the rim by a wide warm-up stroke; the drain
        // switches on at frame 0 and the edges dissolve outward while a thin
        // stroke keeps pushing paint into the band. Before/after by
        // construction: the loop restarts on the full canvas.
        // Two puffs, each blown into the right edge by a wind: the first
        // with the rim closed (it piles up and splashes back), the second
        // with Border on (it leaves the canvas). The second half drains the
        // first half's pile too, so the loop restarts on an empty canvas.
        'border': {
            color: '#ff7a9e', size: 1.8, gate: true, flow: 1, duration: 5000, warm: 0, still: 0.5,
            pen: dabs([{ u: 0.42, v: 0.5, at: 0.0 }, { u: 0.42, v: 0.5, at: 0.36 }], 0.05, 0),
            pre() {
                setSlider('overflowBand', 15);
                setCheck('pressureConstant', true);
                if (window.config) {
                    window.config.AMBIENT_FORCE = true; window.config.AMBIENT_FORCE_X = 1; window.config.AMBIENT_FORCE_Y = 0;
                    window.config.AMBIENT_FORCE_REF = 22;   // a puff reaches the edge in ~1.3 s
                    window.config.DENSITY_DISSIPATION = 0.996;
                }
            },
            // Rim closed for the first third (the first puff piles up), open
            // for the rest: the second puff leaves and the pile drains too.
            frame(p) { setCheck('overflowToggle', p >= 0.3 && p < 0.999); }
        },
        // No stroke: the effect paints. One whole breath per loop — the
        // rings grow through the inhale and shrink through the exhale — on
        // a 2·2 preview pattern (the real ones are 4 s a side; the loop
        // would be 8 s). Warmed for one full breath so the band has paint,
        // then the capture starts at the top of the next inhale.
        'breathing': {
            color: '#7fc4ff', size: 4, duration: 4000, warm: 4.0, still: 0.45,
            pen: null,
            pre() {
                if (typeof window.clearCanvas === 'function') window.clearCanvas();
                if (window.Breathing && window.Breathing.PATTERNS) {
                    window.Breathing.PATTERNS.preview = { in: 2, holdIn: 0, out: 2, holdOut: 0, label: 'Preview 2 · 2' };
                    const sel = $('breathPattern');
                    if (sel && !sel.querySelector('option[value="preview"]')) {
                        const o = document.createElement('option'); o.value = 'preview'; o.textContent = 'Preview 2 · 2'; sel.appendChild(o);
                    }
                    setSelect('breathPattern', 'preview');
                }
                setSlider('breathStrength', 0.8);
                setCheck('breathingToggle', true);
            },
            // The breath is phase-locked to the capture (seek every frame):
            // it runs on the wall clock, and a capture that takes longer than
            // its frame interval would otherwise fit more than one breath in
            // the loop and never close on itself.
            atStart() { if (window.Breathing && window.Breathing.seek) window.Breathing.seek(0); },
            frame(p) { if (window.Breathing && window.Breathing.seek) window.Breathing.seek(p * 4); }
        },
        // Slider effect under Surface Shading. Not a row (no thumbnail), but
        // baking it the same way gives a before/after proof of the retune:
        // Ridges' amount-then-radius mapping (05j).
        'ridges': { color: '#d9d2c5', size: 1.2, warm: 1.2, flipAt: 0.33, proofOnly: true, pen: lissajous(0.30, 0.26, 1, 2), on() { setSlider('sharpness', 1.2); setSlider('ridges', 0.6); } }
    };

    // ── Preset thumbnails: assets/presets/<key>.png ───────────────────
    // The built-in looks, each painted with the same stroke for ~2.4 s after
    // applyPreset(key), then the 64px still (same crop as the effects).
    const PRESET_KEYS = ['gelpen', 'silky', 'thick', 'wispy', 'chaotic', 'ethereal', 'turbulent', 'marble', 'electric'];
    const wallPhase = (secs) => { const t0 = performance.now(); return () => ((performance.now() - t0) / 1000 / secs) % 1; };
    async function runPreset(key, opts) {
        opts = opts || {};
        if (typeof window.applyPreset !== 'function') throw new Error('applyPreset missing');
        const hidden = document.visibilityState === 'hidden';
        const pump = hidden ? installPump() : null;
        const wasPaused = isPaused();
        if (wasPaused && typeof window.togglePause === 'function') window.togglePause();
        if (hidden && typeof window.update === 'function') window.update();
        const look = (typeof window.capturePresetSnapshot === 'function') ? window.capturePresetSnapshot({ lookOnly: true }) : null;
        const result = { key: key, hidden: hidden };
        try {
            allOff();
            if (typeof window.clearCanvas === 'function') window.clearCanvas();
            window.applyPreset(key);
            await sleep(120);
            setColor(opts.color || '#ff9a4d');
            // The preset's own brush size is part of the look but not of a
            // 22px thumbnail: at size 11-18 every look is the same blob. A
            // thin stroke lets the fade, curl and shading read.
            setSlider('brushSize', opts.size || 6);
            const errs = [];
            const onErr = (e) => errs.push(String(e && (e.message || e.reason || e)).slice(0, 160));
            window.addEventListener('error', onErr);
            window.addEventListener('unhandledrejection', onErr);
            const serial0 = window.__drawSerial | 0;
            const pen = lissajous(0.32, 0.28, 1, 2);
            paintStart(pen, wallPhase(2.6));
            // Still taken WHILE the stroke is still going: a fast-fading look
            // (Gusty) is an empty canvas a moment after the brush lifts. The
            // second bake of a batch has come back black more than once (no
            // paint landed at all), so an empty still strokes on and retries.
            await sleep(opts.paintMs || 2600);
            result.serialAdvance = (window.__drawSerial | 0) - serial0;
            result.paintRadius = window.__lastPaintRadius;
            result.cfg = { dens: window.config.DENSITY_DISSIPATION, vel: window.config.VELOCITY_DISSIPATION, iters: window.config.PRESSURE_ITERATIONS, curl: window.config.CURL, dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION, reinit: !!window.needsFramebufferReinit };
            window.removeEventListener('error', onErr);
            window.removeEventListener('unhandledrejection', onErr);
            result.errors = errs.slice(0, 6);
            let stills = await thumbPng();
            let tries = 0;
            while (stills.dark && tries++ < 2) {
                paintStop();
                await sleep(200);
                if (typeof window.update === 'function' && hidden) window.update();
                paintStart(pen, wallPhase(2.6));
                await sleep(2000);
                stills = await thumbPng();
            }
            result.retries = tries;
            paintStop();
            result.bytes = { png: stills.thumb.size };
            result.uploaded = { png: await put('presets/' + key + '.png', stills.thumb) };
            if (opts.frame !== false) result.uploaded.frame = await put('presets/' + key + '-frame.png', stills.frame);
            if (!result.uploaded.png || opts.base64) result.png = await blobToBase64(stills.thumb);
        } finally {
            paintStop();
            allOff();
            if (look && typeof window.applyPresetSnapshot === 'function') { try { window.applyPresetSnapshot(look); } catch (_) {} }
            if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
            if (typeof window.clearCanvas === 'function') window.clearCanvas();
            if (pump) {
                if (wasPaused && !isPaused() && typeof window.togglePause === 'function') window.togglePause();
                pump.stop();
            }
        }
        return result;
    }

    // ── Hidden-tab pump ───────────────────────────────────────────────
    // A backgrounded page parks requestAnimationFrame and clamps timers to
    // one tick a second, and 04f pauses the sim on visibilitychange — so a
    // bake driven from a hidden preview pane never advances. MessageChannel
    // messages are not throttled: while the pump is installed, rAF callbacks
    // and short setTimeouts (the exporter's frame sleeps) run off a message
    // loop paced at ~60 Hz. stop() restores the real handles and DROPS the
    // queued callbacks: the update loop's own parked native rAF resumes it
    // when the page is visible again, and forwarding ours would double it.
    // (Headless Chrome is never hidden; the pump is for the preview pane.)
    function installPump() {
        if (window.__fxPump) return window.__fxPump;
        const real = {
            raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
            st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window)
        };
        const q = new Map(), timers = new Map();
        let id = 0, running = true, last = performance.now();
        const mc = new MessageChannel();
        const stats = { ticks: 0, lastTick: 0 };
        mc.port1.onmessage = function () {
            if (!running) return;
            const now = performance.now();
            if (now - last >= 16) {
                last = now;
                stats.ticks++; stats.lastTick = now;
                const cbs = Array.from(q.values()); q.clear();
                for (const cb of cbs) { try { cb(now); } catch (e) { console.error('[fxBake] raf', e); } }
                for (const [tid, t] of Array.from(timers.entries())) {
                    if (now >= t.at) { timers.delete(tid); try { t.fn(); } catch (e) { console.error('[fxBake] timer', e); } }
                }
            }
            mc.port2.postMessage(0);
        };
        window.requestAnimationFrame = function (cb) { const i = ++id; q.set(i, cb); return i; };
        window.cancelAnimationFrame = function (i) { q.delete(i); };
        window.setTimeout = function (fn, ms) {
            if (typeof fn !== 'function' || (ms | 0) > 400) return real.st.apply(null, arguments);
            const args = Array.prototype.slice.call(arguments, 2);
            const i = ++id + 1e9;
            timers.set(i, { at: performance.now() + (ms || 0), fn: function () { fn.apply(null, args); } });
            return i;
        };
        window.clearTimeout = function (i) { if (timers.has(i)) timers.delete(i); else real.ct(i); };
        mc.port2.postMessage(0);
        const pump = {
            stats: stats,
            stop() {
                running = false;
                q.clear(); timers.clear();
                window.requestAnimationFrame = real.raf; window.cancelAnimationFrame = real.caf;
                window.setTimeout = real.st; window.clearTimeout = real.ct;
                window.__fxPump = null;
            }
        };
        window.__fxPump = pump;
        return pump;
    }
    function isPaused() { const b = $('pauseBtn'); return !!(b && b.textContent.trim() === '▶'); }

    // ── Output ────────────────────────────────────────────────────────
    function blobToBase64(blob) {
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(',')[1]);
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(blob);
        });
    }
    // name is 'glow.gif' (→ assets/effects/) or 'presets/silky.png'.
    async function put(name, blob) {
        try {
            const rel = name.indexOf('/') >= 0 ? name : 'effects/' + name;
            const r = await fetch(RECEIVER + '/assets/' + rel, { method: 'PUT', body: blob });
            return r.ok;
        } catch (_) { return false; }
    }
    // Thumbnail: a 64px square cut around where the paint IS — the
    // luminance-weighted centre of the frame, sized to its spread — so the
    // still shows the effect's texture rather than a flat patch of one
    // colour (a fixed centre crop of a glowing blob was a plain orange
    // square). Also returns a 320px full frame for inspection.
    function thumbPng() {
        const c = $('canvas');
        const W = 320, H = Math.max(1, Math.round(c.height * W / c.width));
        const f = document.createElement('canvas');
        f.width = W; f.height = H;
        const fctx = f.getContext('2d', { willReadFrequently: true });
        fctx.fillStyle = '#000'; fctx.fillRect(0, 0, W, H);
        fctx.drawImage(c, 0, 0, W, H);
        const d = fctx.getImageData(0, 0, W, H).data;
        let sum = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4;
            const l = (d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114) / 255;
            if (l < 0.06) continue;
            sum += l; sx += x * l; sy += y * l; sxx += x * x * l; syy += y * y * l;
        }
        let cx = W / 2, cy = H / 2, side = Math.min(W, H) * 0.6;
        if (sum > 0) {
            cx = sx / sum; cy = sy / sum;
            const sdx = Math.sqrt(Math.max(0, sxx / sum - cx * cx)), sdy = Math.sqrt(Math.max(0, syy / sum - cy * cy));
            side = Math.max(Math.min(W, H) * 0.3, Math.min(Math.min(W, H), 2.6 * Math.max(sdx, sdy)));
        }
        const k = c.width / W;   // frame px → canvas px
        const S = side * k, X = Math.max(0, Math.min(c.width - S, cx * k - S / 2)), Y = Math.max(0, Math.min(c.height - S, cy * k - S / 2));
        const t = document.createElement('canvas');
        t.width = 64; t.height = 64;
        const ctx = t.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 64);
        ctx.drawImage(c, X, Y, S, S, 0, 0, 64, 64);
        // Auto-level the 64px still only (never the GIF): a relief lit from
        // one side or a drip on black came out as a near-black square in
        // the row. Brightest channel is lifted toward 235, at most 2.2x.
        const id = ctx.getImageData(0, 0, 64, 64), px = id.data;
        let mx = 1;
        for (let i = 0; i < px.length; i += 4) { if (px[i] > mx) mx = px[i]; if (px[i + 1] > mx) mx = px[i + 1]; if (px[i + 2] > mx) mx = px[i + 2]; }
        const gain = Math.min(2.2, Math.max(1, 235 / mx));
        if (gain > 1.02) {
            for (let i = 0; i < px.length; i += 4) { px[i] = Math.min(255, px[i] * gain); px[i + 1] = Math.min(255, px[i + 1] * gain); px[i + 2] = Math.min(255, px[i + 2] * gain); }
            ctx.putImageData(id, 0, 0);
        }
        return Promise.all([
            new Promise((res) => t.toBlob(res, 'image/png')),
            new Promise((res) => f.toBlob(res, 'image/png'))
        ]).then((arr) => ({ thumb: arr[0], frame: arr[1], dark: sum === 0 }));
    }

    async function run(key, opts) {
        opts = opts || {};
        const stage = FX_STAGES[key];
        if (!stage) throw new Error('unknown effect ' + key);
        if (window.fluidExport && window.fluidExport.isExporting()) throw new Error('export busy');

        // Everything the bake touches goes back afterwards.
        const look = (typeof window.capturePresetSnapshot === 'function') ? window.capturePresetSnapshot({ lookOnly: true }) : null;
        const prevPath = window.lightShift ? JSON.parse(JSON.stringify(window.lightShift.colorPath || [])) : null;
        const prevLight = window.lightSource ? { x: window.lightSource.x, y: window.lightSource.y, mode: window.lightSource.mode } : null;
        const prevForce = window.config ? [window.config.AMBIENT_FORCE_X, window.config.AMBIENT_FORCE_Y, window.config.AMBIENT_FORCE_REF] : null;
        const prevBrush = window.config ? { gate: window.config.COLOR_GATE, flow: window.config.BRUSH_FLOW, dens: window.config.DENSITY_DISSIPATION } : null;

        // A paused sim ignores paint (04f auto-pauses a hidden page, and a
        // previous bake puts that state back): unpause for the bake whatever
        // the visibility, and pump the frame loop ourselves when hidden.
        const hidden = document.visibilityState === 'hidden';
        const pump = hidden ? installPump() : null;
        const wasPaused = isPaused();
        if (wasPaused && typeof window.togglePause === 'function') window.togglePause();
        if (hidden && typeof window.update === 'function') window.update();   // re-arm the loop on the pump

        let result = { key: key, hidden: hidden };
        try {
            pinQuality();
            await sleep(120);
            result.sim = [window.config.SIM_RESOLUTION, window.config.DYE_RESOLUTION, typeof simTexWidth === 'number' ? simTexWidth : null];
            allOff();
            if (typeof window.clearCanvas === 'function') window.clearCanvas();
            setColor(stage.color || '#ff8a3d');
            if (window.config) { window.config.COLOR_GATE = !!stage.gate; window.config.BRUSH_FLOW = (typeof stage.flow === 'number') ? stage.flow : 1; }
            if (stage.pre) stage.pre();
            await sleep(150);

            const duration = opts.duration || stage.duration || 3000, fps = opts.fps || stage.fps || 30, width = opts.width || 320;
            const frameCount = Math.ceil(duration / (1000 / fps));
            const interval = duration / frameCount;
            const flipAt = (typeof stage.flipAt === 'number') ? Math.round(frameCount * stage.flipAt) : -1;
            const stillAt = Math.round(frameCount * (typeof stage.still === 'number' ? stage.still : 0.7));

            // Warm-up: the same scene, timed off the wall clock at the loop's
            // period, so frame 0 is already in its steady state. A stage can
            // warm with a different pen/brush (Border fills the canvas wide).
            const warm = (typeof opts.warm === 'number') ? opts.warm : (stage.warm || 0);
            if (warm > 0) {
                setSlider('brushSize', stage.warmSize || stage.size || 6);
                if (stage.warmPen || stage.pen) paintStart(stage.warmPen || stage.pen, wallPhase(duration / 1000));
                await sleep(warm * 1000);
                paintStop();
            }
            setSlider('brushSize', stage.size || 6);
            if (stage.atStart) stage.atStart();
            if (flipAt === 0 && stage.on) stage.on();

            // Capture: the pen and the cues run off the frame counter.
            const clock = { i: 0, at: performance.now() };
            const phase = () => Math.min(0.999, (clock.i + Math.min(1, (performance.now() - clock.at) / interval)) / frameCount);
            let flipped = flipAt === 0, stills = null;
            const trace = { frames: 0, ticksAtStart: pump ? pump.stats.ticks : -1, phase: 'capture' };
            result.trace = trace;
            if (stage.pen) paintStart(stage.pen, phase);
            if (stage.frame) stage.frame(0, 0, frameCount);
            const blob = await new Promise((resolve, reject) => {
                // Real-clock watchdog (captured before the pump replaced setTimeout).
                const t = realSetTimeout(() => reject(new Error('gif timeout at frame ' + trace.frames + ', phase ' + trace.phase + ', pump ticks ' + (pump ? pump.stats.ticks - trace.ticksAtStart : 'n/a'))), duration * 3 + 30000);
                window.fluidExport.gif({
                    duration: duration, fps: fps, width: width,
                    onFrame: async (i, n) => {
                        trace.frames = i + 1;
                        clock.i = i + 1; clock.at = performance.now();
                        if (!flipped && flipAt >= 0 && i + 1 >= flipAt) { flipped = true; if (stage.on) stage.on(); trace.phase = 'on'; }
                        if (stage.frame) stage.frame((i + 1) / n, i + 1, n);
                        if (!stills && i + 1 >= stillAt) stills = await thumbPng();
                    },
                    onBlob: (b) => { realClearTimeout(t); trace.phase = 'encoded'; resolve(b); }
                }).catch((e) => { realClearTimeout(t); reject(e); });
            });
            paintStop();
            if (!stills) stills = await thumbPng();
            const png = stills.thumb;
            result.frames = frameCount;
            result.bytes = { gif: blob.size, png: png.size };
            if (!stage.proofOnly || opts.upload) {
                result.uploaded = { gif: await put(key + '.gif', blob), png: await put(key + '.png', png) };
            } else {
                result.uploaded = { gif: await put('effects/proof/' + key + '.gif', blob) };
            }
            // Inspection copy of the still's full frame (not shipped; delete after review).
            if (opts.frame !== false) result.uploaded.frame = await put('effects/proof/' + key + '-frame.png', stills.frame);
            if (!result.uploaded.gif || opts.base64) {
                result.gif = await blobToBase64(blob);
                result.png = await blobToBase64(png);
            }
        } finally {
            paintStop();
            allOff();
            if (window.lightShift && window.lightShift.setPath && prevPath) window.lightShift.setPath(prevPath);
            if (window.lightSource && prevLight) { window.lightSource.x = prevLight.x; window.lightSource.y = prevLight.y; window.lightSource.mode = prevLight.mode; }
            if (window.config && prevForce) { window.config.AMBIENT_FORCE_X = prevForce[0]; window.config.AMBIENT_FORCE_Y = prevForce[1]; window.config.AMBIENT_FORCE_REF = prevForce[2]; }
            if (window.config && prevBrush) { window.config.COLOR_GATE = prevBrush.gate; window.config.BRUSH_FLOW = prevBrush.flow; window.config.DENSITY_DISSIPATION = prevBrush.dens; }
            if (look && typeof window.applyPresetSnapshot === 'function') { try { window.applyPresetSnapshot(look); } catch (_) {} }
            if (typeof window.clearCanvas === 'function') window.clearCanvas();
            if (pump) {
                if (wasPaused && !isPaused() && typeof window.togglePause === 'function') window.togglePause();
                pump.stop();
            }
        }
        return result;
    }

    async function runAll(opts) {
        const out = {};
        const keys = (opts && opts.keys) || Object.keys(FX_STAGES).filter((k) => !FX_STAGES[k].proofOnly);
        for (const key of keys) {
            try { out[key] = await run(key, opts); } catch (e) { out[key] = { error: String(e && e.message || e) }; }
        }
        return out;
    }

    window.__fxBake = { run: run, runAll: runAll, keys: Object.keys(FX_STAGES), stages: FX_STAGES, runPreset: runPreset, presetKeys: PRESET_KEYS,
                        painter: { start: paintStart, stop: paintStop, shapes: { lissajous: lissajous, dabs: dabs } }, allOff: allOff, pinQuality: pinQuality,
                        thumb: thumbPng, put: put, set: { check: setCheck, slider: setSlider, select: setSelect, color: setColor }, wallPhase: wallPhase };
    return { installed: true, keys: Object.keys(FX_STAGES), presets: PRESET_KEYS };
})();
