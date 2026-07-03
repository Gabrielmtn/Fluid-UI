/**
 * Audio Reactivity System
 * 
 * Captures audio from mic, system audio, or file and maps frequency bands
 * to fluid simulation parameters for music-reactive visuals.
 * 
 * Bass  (20-250Hz)  → Auto-splat on beat, splat force
 * Mid   (250-2kHz)  → Kaleidoscope rotation / mid-range splats
 * Treble(2k-20kHz)  → Color cycling, sparkle splats
 * Overall energy    → Brush size modulation
 * 
 * Each band has independent gain normalization via adaptive peak tracking
 * so mid and treble are as responsive as bass despite lower raw energy.
 */
(function () {
    'use strict';

    // ─── STATE ──────────────────────────────────────────────────
    var enabled = false;
    var audioCtx = null;
    var analyser = null;
    var sourceNode = null;
    var stream = null;
    var freqData = null;
    var animFrame = null;

    // Smoothed band energies (0-1)
    var bass = 0, mid = 0, treble = 0, overall = 0;

    // ── Feature Bus (P0): spectral features beyond raw band energy ──
    var prevFreqData = null;
    var fluxInstant = 0;   // raw spectral flux this frame (onset strength)
    var flux = 0;          // smoothed flux
    var fluxAvg = 0;       // rolling mean — adaptive onset baseline
    var brightness = 0;    // spectral centroid, normalized 0-1 (dark→bright)
    var loudness = 0;      // perceptual log-RMS, 0-1
    var onsetDetected = false;
    var lastOnsetTime = 0;
    var ONSET_COOLDOWN = 90; // ms
    var vizPulse = 0;      // beat/onset pulse for the visualizer (decays each frame)

    // Noise gate: raw RMS below this is treated as silence (prevents mic ambient → 100%)
    var NOISE_GATE = 0.04;

    // Per-band gain multipliers (mid/treble are naturally quieter in most audio)
    var BASS_GAIN   = 1.8;
    var MID_GAIN    = 3.5;
    var TREBLE_GAIN = 5.0;

    // Per-band smoothing (bass slower to avoid jitter, treble faster for responsiveness)
    var BASS_SMOOTH   = 0.82;
    var MID_SMOOTH    = 0.72;
    var TREBLE_SMOOTH = 0.60;

    // Beat detection
    var beatThreshold = 0.55;
    var beatCooldownMs = 160;
    var lastBeatTime = 0;
    var beatDetected = false;

    // Mid/treble beat detection (for splats on mid and treble hits)
    var midBeatThreshold = 0.5;
    var midBeatCooldown = 200;
    var lastMidBeatTime = 0;
    var midBeatDetected = false;

    var trebleBeatThreshold = 0.45;
    var trebleBeatCooldown = 120;
    var lastTrebleBeatTime = 0;
    var trebleBeatDetected = false;

    // Sensitivity
    var sensitivity = 1.5;

    // Mapping toggles
    var mapBassToSplat = true;
    var mapBassAutoSplat = true;
    var mapMidToKaleido = true;
    var mapTrebleToColor = true;
    var mapOverallToSize = true;

    // Auto-splat config
    var autoSplatMode = 'center'; // center, random, circular
    var autoSplatAngle = 0;

    // Saved original values for restoration. origSplatRadius is the modulation
    // BASE, not a frozen snapshot: if anything else (brush slider, preset,
    // oscillator) writes config.SPLAT_RADIUS while we're modulating, the tick
    // detects the foreign value and adopts it as the new base — otherwise the
    // brush-size slider is dead while audio-react is on, and disable() would
    // revert the user's change. lastWrittenSplatRadius is the exact value our
    // last tick wrote; null means "we haven't written since (re)enabling".
    var origSplatRadius = null;
    var lastWrittenSplatRadius = null;
    var lastColorStepTime = 0;

    // Visualizer
    var vizCanvas = null;
    var vizCtx = null;

    // FFT config
    var FFT_SIZE = 2048;
    // Bin boundaries assume 44100 Hz sample rate → bin width ≈ 21.5 Hz
    // Recalculated dynamically in ensureContext if sample rate differs
    var BASS_START = 1;  // skip DC bin
    var BASS_END = 12;   // ~258 Hz
    var MID_END = 93;    // ~2 kHz
    var TREBLE_END = 512; // ~11 kHz practical limit

    // ─── INIT ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () { requestAnimationFrame(loadSaved); });
    });

    function loadSaved() {
        try {
            if (window.settingsManager) {
                var s = window.settingsManager.get('audio.sensitivity');
                if (typeof s === 'number') sensitivity = s;
                var bt = window.settingsManager.get('audio.beatThreshold');
                if (typeof bt === 'number') beatThreshold = bt;
            }
        } catch (_) {}
    }

    // ─── AUDIO SETUP ────────────────────────────────────────────
    function startMic() {
        return navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        }).then(function (s) { connectStream(s); });
    }

    function startSystemAudio() {
        // Electron path: use desktopCapturer for reliable system audio capture
        try {
            var remote = require('@electron/remote');
            var desktopCapturer = remote.desktopCapturer;
            if (desktopCapturer) {
                return startSystemAudioElectron(desktopCapturer);
            }
        } catch (_) {}

        // Browser fallback: getDisplayMedia
        return startSystemAudioBrowser();
    }

    function startSystemAudioElectron(desktopCapturer) {
        return desktopCapturer.getSources({ types: ['screen'] }).then(function (sources) {
            if (!sources || !sources.length) {
                return Promise.reject(new Error('No screen sources available'));
            }
            // Use getUserMedia with chromeMediaSource constraint for system audio
            return navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sources[0].id,
                        maxWidth: 1,
                        maxHeight: 1,
                        maxFrameRate: 1
                    }
                }
            });
        }).then(function (s) {
            // Verify we got audio tracks
            if (s.getAudioTracks().length === 0) {
                s.getTracks().forEach(function (t) { t.stop(); });
                return Promise.reject(new Error('No audio tracks in system capture'));
            }
            // Stop video tracks — in Electron getUserMedia the audio survives
            s.getVideoTracks().forEach(function (t) { t.stop(); });
            connectStream(s);
        });
    }

    function startSystemAudioBrowser() {
        // getDisplayMedia: audio constraints must be simple boolean, not getUserMedia-style
        return navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: { width: 1, height: 1, frameRate: 1 }
        }).then(function (s) {
            // Verify audio tracks exist (user may not have checked "Share audio")
            if (s.getAudioTracks().length === 0) {
                s.getTracks().forEach(function (t) { t.stop(); });
                return Promise.reject(new Error('No audio shared. Check "Share audio" when selecting a tab/screen.'));
            }
            // Keep the full stream — createMediaStreamSource ignores video tracks
            // but the video track must stay alive to keep the stream active
            connectStream(s);
        });
    }

    function startFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                ensureContext();
                audioCtx.decodeAudioData(reader.result, function (buffer) {
                    if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} }
                    var src = audioCtx.createBufferSource();
                    src.buffer = buffer;
                    src.loop = true;
                    src.connect(analyser);
                    src.start(0);
                    sourceNode = src;
                    resolve();
                }, reject);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    function ensureContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (!analyser) {
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = 0.3; // low built-in smoothing; we do our own
            analyser.minDecibels = -90;
            analyser.maxDecibels = -10;
            freqData = new Uint8Array(analyser.frequencyBinCount);

            // Recalculate bin boundaries for actual sample rate
            var binHz = audioCtx.sampleRate / FFT_SIZE;
            BASS_START = Math.max(1, Math.round(20 / binHz));
            BASS_END = Math.round(250 / binHz);
            MID_END = Math.round(2000 / binHz);
            TREBLE_END = Math.min(analyser.frequencyBinCount, Math.round(12000 / binHz));
        }
    }

    function connectStream(s) {
        stream = s;
        ensureContext();
        if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} }
        sourceNode = audioCtx.createMediaStreamSource(s);
        sourceNode.connect(analyser);

        // Handle stream ending unexpectedly (user revokes permission, etc.)
        s.addEventListener('inactive', function () {
            if (enabled) {
                console.warn('Audio reactive: stream ended');
                disable();
                // Notify UI
                var cb = document.getElementById('audioReactToggle');
                if (cb) cb.checked = false;
            }
        });
    }

    function stopAudio() {
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
        if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
        restoreOriginals();
    }

    // ─── ANALYSIS LOOP ──────────────────────────────────────────
    function startLoop() {
        if (animFrame) return;
        saveOriginals();
        tick();
    }

    // ── Envelope followers ──────────────────────────────────────
    // Jerky audio → smooth motion. A modulation rises fast toward the input
    // (attack) then eases slowly back toward rest (release), so each hit reads as
    // a soft pulse rather than a snap — the right primitive for real-time audio.
    // Every continuous parameter modulation routes through one of these.
    var ENV_ATTACK_MS = 45, ENV_RELEASE_MS = 380, PULSE_RELEASE_MS = 260;
    var sizeEnv = 0;     // continuous brush-size envelope (follows loudness)
    var beatPulse = 0;   // one-shot pulse kicked on beat/onset, eases to zero
    var _lastTickMs = 0;
    function envFollow(prev, input, dt) {
        var tau = input > prev ? ENV_ATTACK_MS : ENV_RELEASE_MS;
        return prev + (input - prev) * (1 - Math.exp(-dt / Math.max(1, tau)));
    }

    function tick() {
        if (!enabled || !analyser) { animFrame = null; return; }
        animFrame = requestAnimationFrame(tick);

        analyser.getByteFrequencyData(freqData);

        // Compute raw RMS energy per band (0-1 range)
        var rawBass   = bandEnergy(BASS_START, BASS_END);
        var rawMid    = bandEnergy(BASS_END, MID_END);
        var rawTreble = bandEnergy(MID_END, TREBLE_END);

        // Noise gate: if raw energy is below ambient floor, treat as zero
        var gatedBass   = rawBass   > NOISE_GATE ? (rawBass - NOISE_GATE)   : 0;
        var gatedMid    = rawMid    > NOISE_GATE ? (rawMid - NOISE_GATE)    : 0;
        var gatedTreble = rawTreble > NOISE_GATE ? (rawTreble - NOISE_GATE) : 0;

        // Apply per-band gain and clamp to 0-1
        var scaledBass   = Math.min(1, gatedBass * BASS_GAIN);
        var scaledMid    = Math.min(1, gatedMid * MID_GAIN);
        var scaledTreble = Math.min(1, gatedTreble * TREBLE_GAIN);
        var scaledAll    = (scaledBass + scaledMid + scaledTreble) / 3;

        // Per-band exponential smoothing
        bass   = bass * BASS_SMOOTH + scaledBass * (1 - BASS_SMOOTH);
        mid    = mid * MID_SMOOTH + scaledMid * (1 - MID_SMOOTH);
        treble = treble * TREBLE_SMOOTH + scaledTreble * (1 - TREBLE_SMOOTH);
        overall = overall * MID_SMOOTH + scaledAll * (1 - MID_SMOOTH);

        // ── Feature Bus: spectral flux (onset), centroid (brightness), loudness.
        // One O(bins) pass over the same freqData — these become new mapping sources.
        if (!prevFreqData || prevFreqData.length !== freqData.length) {
            prevFreqData = new Uint8Array(freqData.length);
        }
        var fsum = 0, cNum = 0, cDen = 0, sq = 0;
        for (var fi = BASS_START; fi < TREBLE_END && fi < freqData.length; fi++) {
            var fv = freqData[fi];
            var fd = fv - prevFreqData[fi];
            if (fd > 0) fsum += fd;            // half-wave-rectified flux
            cNum += fi * fv; cDen += fv;       // centroid numerator/denominator
            var fn = fv / 255; sq += fn * fn;  // energy for RMS
        }
        prevFreqData.set(freqData);
        var fspan = (TREBLE_END - BASS_START) || 1;
        fluxInstant = Math.min(1, fsum / (fspan * 48));
        flux = flux * 0.6 + fluxInstant * 0.4;
        fluxAvg = fluxAvg * 0.96 + fluxInstant * 0.04;
        brightness = cDen > 0 ? Math.min(1, Math.max(0, (cNum / cDen - BASS_START) / fspan)) : 0;
        var rmsAll = Math.sqrt(sq / fspan);
        loudness = Math.min(1, Math.max(0, (Math.log10(rmsAll + 1e-3) + 2.2) / 2.2));

        // Beat detection per band
        var now = performance.now();
        beatDetected = false;
        midBeatDetected = false;
        trebleBeatDetected = false;

        if (bass * sensitivity > beatThreshold && (now - lastBeatTime) > beatCooldownMs) {
            beatDetected = true;
            lastBeatTime = now;
        }
        if (mid * sensitivity > midBeatThreshold && (now - lastMidBeatTime) > midBeatCooldown) {
            midBeatDetected = true;
            lastMidBeatTime = now;
        }
        if (treble * sensitivity > trebleBeatThreshold && (now - lastTrebleBeatTime) > trebleBeatCooldown) {
            trebleBeatDetected = true;
            lastTrebleBeatTime = now;
        }

        // Flux-based onset: a transient when instantaneous flux spikes above its
        // rolling mean. Fires on real attacks (not sustained loud passages), so
        // it complements the energy-threshold bass beat above.
        onsetDetected = false;
        if (fluxInstant > fluxAvg * 1.6 + 0.015 && (now - lastOnsetTime) > ONSET_COOLDOWN) {
            onsetDetected = true;
            lastOnsetTime = now;
            vizPulse = 1;
        }
        if (beatDetected) vizPulse = 1;

        // ── Envelopes: smooth the modulation so parameters ease in and out and
        // never jerk to the raw value. sizeEnv follows loudness continuously;
        // beatPulse is kicked by each hit and eases back to zero between hits.
        var dt = _lastTickMs ? Math.min(100, now - _lastTickMs) : 16;
        _lastTickMs = now;
        sizeEnv = envFollow(sizeEnv, Math.min(1, overall * sensitivity), dt);
        if (beatDetected || onsetDetected) {
            beatPulse = Math.max(beatPulse, Math.min(1, Math.max(bass, fluxInstant) * sensitivity));
        }
        beatPulse += (0 - beatPulse) * (1 - Math.exp(-dt / PULSE_RELEASE_MS));

        // Apply mappings
        applyMappings(now);

        // Draw visualizer
        drawViz();
    }

    function bandEnergy(startBin, endBin) {
        var sum = 0;
        var count = endBin - startBin;
        if (count <= 0) return 0;
        for (var i = startBin; i < endBin && i < freqData.length; i++) {
            var v = freqData[i] / 255;
            sum += v * v;
        }
        return Math.sqrt(sum / count);
    }

    // ─── PARAMETER MAPPING ──────────────────────────────────────
    var savedOriginals = false;
    function saveOriginals() {
        if (savedOriginals) return;
        savedOriginals = true;
        try {
            origSplatRadius = window.config ? window.config.SPLAT_RADIUS : 0.25;
        } catch (_) {
            origSplatRadius = 0.25;
        }
        lastWrittenSplatRadius = null;
    }

    function restoreOriginals() {
        if (!savedOriginals) return;
        savedOriginals = false;
        try {
            // Only un-modulate a value we own: if we never wrote (mapping off) or
            // something else wrote after our last tick, the current value is the
            // user's — leave it alone.
            if (window.config && origSplatRadius !== null &&
                lastWrittenSplatRadius !== null &&
                window.config.SPLAT_RADIUS === lastWrittenSplatRadius) {
                window.config.SPLAT_RADIUS = origSplatRadius;
            }
        } catch (_) {}
        lastWrittenSplatRadius = null;
        bass = mid = treble = overall = 0;
        sizeEnv = beatPulse = 0; _lastTickMs = 0;
    }

    function applyMappings(now) {
        var s = sensitivity;

        // Overall energy → Brush size modulation (EASED). A continuous loudness
        // envelope makes the brush breathe; a soft beat pulse adds a gentle bump
        // on hits. Both attack-fast / release-slow, so it never snaps.
        if (mapOverallToSize && window.config) {
            try {
                // Re-base on foreign writes: if SPLAT_RADIUS isn't the value we
                // wrote last tick, the user (or a preset/oscillator) changed it —
                // adopt it as the new base so the slider stays live.
                var cur = window.config.SPLAT_RADIUS;
                if (lastWrittenSplatRadius === null || cur !== lastWrittenSplatRadius) {
                    origSplatRadius = cur;
                }
                var sizeMod = 1 + sizeEnv * 0.7 + beatPulse * 0.5;
                lastWrittenSplatRadius = origSplatRadius * sizeMod;
                window.config.SPLAT_RADIUS = lastWrittenSplatRadius;
            } catch (_) {}
        }

        // Bass → Auto splat on beat OR flux onset (big, centered splats)
        if (mapBassAutoSplat && (beatDetected || onsetDetected)) {
            fireAutoSplat('bass');
        }

        // Mid → Splat on mid-beat (smaller, wider spread) + kaleidoscope rotation
        if (mapMidToKaleido) {
            // Kaleidoscope rotation when enabled
            if (window.kaleidoEnabled) {
                try {
                    var rotSpeed = mid * s * 0.12;
                    window.kAngle = ((window.kAngle || 0) + rotSpeed) % (Math.PI * 2);
                } catch (_) {}
            }
            // Also fire mid-energy splats for visible mid-range response
            if (midBeatDetected) {
                fireAutoSplat('mid');
            }
        }

        // Treble → Color cycling + sparkle splats
        if (mapTrebleToColor) {
            // Color step at rate proportional to treble energy
            if (treble * s > 0.15) {
                var stepInterval = Math.max(60, 350 - treble * s * 300);
                if (now - lastColorStepTime > stepInterval) {
                    lastColorStepTime = now;
                    try {
                        if (typeof window.stepPaletteOnce === 'function') {
                            window.stepPaletteOnce(true);
                        }
                    } catch (_) {}
                }
            }
            // Sparkle splats on treble hits
            if (trebleBeatDetected) {
                fireAutoSplat('treble');
            }
        }
    }

    // ── Position generators (P0): pluggable auto-splat emitters. ─────
    // Each returns one emission or an array of { x, y, dx, dy, radius, color }
    // in canvas pixels (color null → inherit the live picker color). Replaces
    // the hardcoded per-band if/else so ANY band can use ANY pattern and new
    // patterns (incl. future SAM-constrained ones) drop straight in.
    var positionGenerators = {};
    var genGrid = 0, genSpiral = 0;
    function registerGenerator(name, fn) { positionGenerators[name] = fn; }

    function pickerColor() {
        try {
            var hex = document.getElementById('colorPicker').value;
            return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
        } catch (_) {
            return [Math.random(), Math.random(), Math.random()];
        }
    }
    function radialDir(force) {
        var a = Math.random() * Math.PI * 2;
        return [Math.cos(a) * force, Math.sin(a) * force];
    }

    // Each pattern STAMPS its full shape per trigger (multi-splat) so it's
    // legible; forces have a floor so they read even on quiet input, and radii
    // are crisp (small) so many dots form a clear shape instead of one blob.
    registerGenerator('center', function (g) {
        // one punchy brush-sized splat near centre (the default)
        var d = radialDir(120 + g.energy * g.sens * 600);
        return { x: g.cx + (Math.random() - 0.5) * 40, y: g.cy + (Math.random() - 0.5) * 40, dx: d[0], dy: d[1], radius: g.baseRadius };
    });
    registerGenerator('random', function (g) {        // Scatter — a handful of dots
        var out = [], n = 5;
        for (var i = 0; i < n; i++) {
            var d = radialDir(80 + g.energy * g.sens * 350);
            out.push({ x: Math.random() * g.W, y: Math.random() * g.H, dx: d[0], dy: d[1], radius: 0.013 + g.energy * 0.02 });
        }
        return out;
    });
    registerGenerator('circular', function (g) {      // Orbit — rotating ring of splats
        autoSplatAngle += 0.45;
        var out = [], n = 8, r = Math.min(g.W, g.H) * 0.34, f = 80 + g.energy * g.sens * 300;
        for (var i = 0; i < n; i++) {
            var a = autoSplatAngle + (i / n) * Math.PI * 2;
            out.push({ x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r, dx: -Math.sin(a) * f, dy: Math.cos(a) * f, radius: 0.014 + g.energy * 0.016 });
        }
        return out;
    });
    registerGenerator('grid', function (g) {          // full grid flash
        var cols = 4, rows = 3, out = [], f = 50 + g.energy * g.sens * 220;
        for (var gr = 0; gr < rows; gr++) for (var gc = 0; gc < cols; gc++) {
            var d = radialDir(f);
            out.push({ x: ((gc + 0.5) / cols) * g.W, y: ((gr + 0.5) / rows) * g.H, dx: d[0], dy: d[1], radius: 0.012 + g.energy * 0.012 });
        }
        return out;
    });
    registerGenerator('spiral', function (g) {        // spiral arc of splats
        genSpiral += 0.6;
        var out = [], n = 14, maxR = Math.min(g.W, g.H) * 0.42, f = 60 + g.energy * g.sens * 220;
        for (var i = 0; i < n; i++) {
            var a = genSpiral + i * 0.5, r = (i / n) * maxR;
            out.push({ x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r, dx: -Math.sin(a) * f * 0.6, dy: Math.cos(a) * f * 0.6, radius: 0.01 + g.energy * 0.012 });
        }
        return out;
    });
    registerGenerator('radialBurst', function (g) {   // outward kick burst
        var n = 10, out = [], f = 250 + g.energy * g.sens * 500;
        for (var i = 0; i < n; i++) {
            var a = (i / n) * Math.PI * 2;
            out.push({ x: g.cx, y: g.cy, dx: Math.cos(a) * f, dy: Math.sin(a) * f, radius: 0.016 + g.energy * 0.02 });
        }
        return out;
    });
    registerGenerator('freqMap', function (g) {       // spectrum painted across the width
        if (!freqData) return [];
        var out = [], bars = 12, span = (g.trebleEnd - g.bassStart) || 1;
        for (var k = 0; k < bars; k++) {
            var t = (k + 0.5) / bars;
            var bin = Math.round(g.bassStart + span * (Math.pow(2, t * 4) - 1) / 15);
            bin = Math.min(bin, g.trebleEnd - 1);
            var v = freqData[bin] / 255;
            if (v < 0.08) continue;
            var col = bin < g.bassEnd ? [1, 0.35, 0.25] : bin < g.midEnd ? [0.3, 1, 0.45] : [0.4, 0.6, 1];
            out.push({ x: t * g.W, y: g.H * (0.9 - v * 0.75), dx: (Math.random() - 0.5) * v * 200, dy: -v * g.sens * 250, radius: 0.01 + v * 0.02, color: col });
        }
        return out;
    });
    // Dedicated mid / treble character emitters (single small splats, as before)
    registerGenerator('ring', function (g) {
        autoSplatAngle += 0.618 * Math.PI * 2;
        var r = Math.min(g.W, g.H) * 0.25;
        var d = radialDir(g.energy * g.sens * 500);
        return { x: g.cx + Math.cos(autoSplatAngle) * r, y: g.cy + Math.sin(autoSplatAngle) * r, dx: d[0], dy: d[1], radius: 0.003 + g.energy * 0.005 };
    });
    registerGenerator('scatter', function (g) {
        var d = radialDir(g.energy * g.sens * 300);
        return { x: Math.random() * g.W, y: Math.random() * g.H, dx: d[0], dy: d[1], radius: 0.001 + g.energy * 0.003 };
    });

    function fireAutoSplat(band) {
        var canvas = document.getElementById('canvas') || document.querySelector('canvas');
        if (!canvas) return;
        var energy = band === 'treble' ? treble : band === 'mid' ? mid : bass;
        // bass uses the user-picked pattern; mid/treble keep their character.
        var name = band === 'mid' ? 'ring' : band === 'treble' ? 'scatter' : (autoSplatMode || 'center');
        var gen = positionGenerators[name] || positionGenerators.center;
        var g = {
            W: canvas.width, H: canvas.height,
            cx: canvas.width * 0.5, cy: canvas.height * 0.5,
            band: band, energy: energy, sens: sensitivity,
            baseRadius: window.config ? window.config.SPLAT_RADIUS : 0.008,
            bassStart: BASS_START, bassEnd: BASS_END, midEnd: MID_END, trebleEnd: TREBLE_END
        };
        var out = gen(g);
        if (!out) return;
        var arr = Array.isArray(out) ? out : [out];
        // Multi-point shape patterns already define their arrangement — don't also
        // kaleidoscope-multiply them into chaos. Single splats still honor kaleido.
        var mult = arr.length > 1 ? 1 : (band === 'treble' ? 1 : (window.animationMultiplier || 1));
        for (var i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (!e) continue;
            var color = e.color || pickerColor();
            if (typeof window.applyMultiSplatWith === 'function') {
                window.applyMultiSplatWith(e.x, e.y, e.dx, e.dy, color, mult, e.radius);
            }
        }
    }

    // ─── VISUALIZER ─────────────────────────────────────────────
    // ── Spectrum Ring visualizer ────────────────────────────────
    // A circular spectrum (log-distributed bins fanned around a ring), a core
    // that breathes with loudness + shifts hue with brightness, an expanding
    // pulse on every detected onset/beat, and Feature-Bus meters along the base.
    function drawViz() {
        if (!vizCanvas || !vizCtx) return;
        var ctx = vizCtx, w = vizCanvas.width, h = vizCanvas.height;
        ctx.clearRect(0, 0, w, h);

        // Reserve a strip at the bottom for the feature meters; the ring lives in
        // the space above it. Size everything off availR so NOTHING ever clips:
        // the ring (R) + its spectrum bars (barMax) + the pulse all fit inside availR.
        var meterH = Math.max(14, h * 0.13);
        var cx = w * 0.5, cy = (h - meterH) * 0.5;
        var availR = Math.min(cx, cy) - Math.max(3, h * 0.03);
        if (availR < 6) availR = 6;
        var R = availR * 0.56;
        var barMax = availR - R;

        // Beat / onset pulse — expands from R out to the edge (availR), then fades
        if (vizPulse > 0.02) {
            ctx.beginPath();
            ctx.arc(cx, cy, R + (1 - vizPulse) * barMax, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,' + (vizPulse * 0.45).toFixed(3) + ')';
            ctx.lineWidth = 2;
            ctx.stroke();
            vizPulse *= 0.90;
        }

        // Radial spectrum — log-distributed bins fanned around the ring
        if (freqData) {
            var bars = 72, maxBin = Math.min(freqData.length, TREBLE_END);
            ctx.lineWidth = Math.max(1.4, (2 * Math.PI * R / bars) * 0.6);
            for (var i = 0; i < bars; i++) {
                var t = i / bars;
                var bin = Math.round(BASS_START + (maxBin - BASS_START) * (Math.pow(2, t * 4) - 1) / 15);
                bin = Math.min(bin, maxBin - 1);
                var v = freqData[bin] / 255;
                var ang = -Math.PI / 2 + t * Math.PI * 2;
                var len = v * barMax;
                var hue = bin < BASS_END ? 0 : bin < MID_END ? 135 : 210;
                ctx.strokeStyle = 'hsla(' + hue + ',85%,' + (45 + v * 30) + '%,0.9)';
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
                ctx.lineTo(cx + Math.cos(ang) * (R + len), cy + Math.sin(ang) * (R + len));
                ctx.stroke();
            }
        }

        // Core — radius tracks loudness, hue tracks brightness, flashes on pulse
        var coreR = Math.max(1, R * (0.35 + 0.55 * Math.max(overall, loudness)));
        var coreHue = 200 + brightness * 130;
        var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        grad.addColorStop(0, 'hsla(' + coreHue + ',90%,' + (58 + vizPulse * 32) + '%,0.92)');
        grad.addColorStop(1, 'hsla(' + coreHue + ',90%,42%,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();

        // Idle hint when silent
        if (!freqData || Math.max(overall, loudness) < 0.01) {
            ctx.fillStyle = 'rgba(255,255,255,0.32)';
            ctx.font = Math.round(Math.max(10, h * 0.07)) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('♪ listening…', cx, cy);
        }

        // Feature meters (bottom strip): band energies + Feature-Bus sources
        var meters = [
            ['B', bass, '#ff4d4d'], ['M', mid, '#4dff7a'], ['T', treble, '#4d9aff'],
            ['FLX', flux, '#ffd24d'], ['BRT', brightness, '#c08cff'], ['LUD', loudness, '#7affe0']
        ];
        var n = meters.length, gap = 4, mw = (w - gap * (n + 1)) / n, mh = Math.max(5, meterH * 0.4), my = h - mh - 2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = Math.max(7, Math.round(h * 0.05)) + 'px monospace';
        for (var m = 0; m < n; m++) {
            var mx = gap + m * (mw + gap);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(mx, my, mw, mh);
            ctx.fillStyle = meters[m][2];
            ctx.fillRect(mx, my, mw * Math.min(1, meters[m][1]), mh);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(meters[m][0], mx, my - 3);
        }
    }

    // ─── ENABLE / DISABLE ───────────────────────────────────────
    function enable(source, fileObj) {
        if (enabled) disable();
        enabled = true;

        var p;
        if (source === 'file' && fileObj) {
            p = startFile(fileObj);
        } else if (source === 'system') {
            p = startSystemAudio();
        } else {
            p = startMic();
        }

        p.then(function () {
            startLoop();
        }).catch(function (err) {
            console.warn('Audio reactive: failed to start', err);
            enabled = false;
            var cb = document.getElementById('audioReactToggle');
            if (cb) cb.checked = false;
        });
    }

    function disable() {
        enabled = false;
        stopAudio();
    }

    // ─── PUBLIC API ─────────────────────────────────────────────
    var configListeners = [];
    window.audioReactive = {
        enable: enable,
        disable: disable,
        isEnabled: function () { return enabled; },
        getBands: function () {
            return {
                bass: bass, mid: mid, treble: treble, overall: overall,
                flux: flux, brightness: brightness, loudness: loudness,
                beat: beatDetected, midBeat: midBeatDetected, trebleBeat: trebleBeatDetected,
                onset: onsetDetected
            };
        },

        // Config setters
        setSensitivity: function (v) {
            sensitivity = v;
            try { if (window.settingsManager) window.settingsManager.set('audio.sensitivity', v); } catch (_) {}
        },
        setBeatThreshold: function (v) {
            beatThreshold = v;
            // Scale mid/treble thresholds proportionally
            midBeatThreshold = v * 0.77;
            trebleBeatThreshold = v * 0.69;
            try { if (window.settingsManager) window.settingsManager.set('audio.beatThreshold', v); } catch (_) {}
        },
        setMapping: function (key, val) {
            if (key === 'bassToSplat') mapBassToSplat = val;
            if (key === 'bassAutoSplat') mapBassAutoSplat = val;
            if (key === 'midToKaleido') mapMidToKaleido = val;
            if (key === 'trebleToColor') mapTrebleToColor = val;
            if (key === 'overallToSize') {
                mapOverallToSize = val;
                // Turning the mapping off mid-pulse would strand the brush at
                // whatever modulated size the last tick wrote — put the base back.
                if (!val && origSplatRadius !== null && window.config) {
                    try { window.config.SPLAT_RADIUS = origSplatRadius; } catch (_) {}
                    lastWrittenSplatRadius = null;
                }
            }
        },
        setAutoSplatMode: function (mode) { autoSplatMode = mode; },
        getAutoSplatMode: function () { return autoSplatMode; },
        // Snapshot / restore the whole reactive config — the payload a composer
        // "segment" stores and re-applies as the playhead crosses it. applyConfig
        // sets the live engine state WITHOUT persisting (segments are transient).
        getConfig: function () {
            return {
                sensitivity: sensitivity,
                beatThreshold: beatThreshold,
                autoSplatMode: autoSplatMode,
                mappings: {
                    bassAutoSplat: mapBassAutoSplat,
                    overallToSize: mapOverallToSize,
                    midToKaleido: mapMidToKaleido,
                    trebleToColor: mapTrebleToColor
                }
            };
        },
        applyConfig: function (cfg) {
            if (!cfg) return;
            if (typeof cfg.sensitivity === 'number') sensitivity = cfg.sensitivity;
            if (typeof cfg.beatThreshold === 'number') {
                beatThreshold = cfg.beatThreshold;
                midBeatThreshold = beatThreshold * 0.77;
                trebleBeatThreshold = beatThreshold * 0.69;
            }
            if (typeof cfg.autoSplatMode === 'string') autoSplatMode = cfg.autoSplatMode;
            if (cfg.mappings) {
                var mp = cfg.mappings;
                if (typeof mp.bassAutoSplat === 'boolean') mapBassAutoSplat = mp.bassAutoSplat;
                if (typeof mp.overallToSize === 'boolean') mapOverallToSize = mp.overallToSize;
                if (typeof mp.midToKaleido === 'boolean') mapMidToKaleido = mp.midToKaleido;
                if (typeof mp.trebleToColor === 'boolean') mapTrebleToColor = mp.trebleToColor;
            }
            // Notify subscribers (the panel) so its controls reflect the applied
            // config — fired only via applyConfig (composer playback), never by the
            // panel's own setters, so there's no feedback loop.
            for (var _ci = 0; _ci < configListeners.length; _ci++) { try { configListeners[_ci](); } catch (_) {} }
        },
        onConfigChange: function (fn) { if (typeof fn === 'function') configListeners.push(fn); },
        // Position-generator registry: names for the UI picker, the map for
        // external code, and registration so new patterns (e.g. SAM-constrained)
        // can be added without touching this file.
        generatorNames: function () { return Object.keys(positionGenerators); },
        generators: positionGenerators,
        registerGenerator: registerGenerator,
        registerViz: function (canvasEl) {
            vizCanvas = canvasEl;
            if (canvasEl) {
                vizCtx = canvasEl.getContext('2d');
                canvasEl.width = canvasEl.offsetWidth * (window.devicePixelRatio > 1 ? 2 : 1);
                canvasEl.height = canvasEl.offsetHeight * (window.devicePixelRatio > 1 ? 2 : 1);
            }
        }
    };
})();
