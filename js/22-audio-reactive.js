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

    // Saved original values for restoration
    var origSplatRadius = null;
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
    }

    function restoreOriginals() {
        if (!savedOriginals) return;
        savedOriginals = false;
        try {
            if (window.config && origSplatRadius !== null) {
                window.config.SPLAT_RADIUS = origSplatRadius;
            }
        } catch (_) {}
        bass = mid = treble = overall = 0;
    }

    function applyMappings(now) {
        var s = sensitivity;

        // Overall energy → Brush size modulation
        if (mapOverallToSize && origSplatRadius !== null) {
            try {
                var sizeMod = 1 + overall * s * 0.8;
                window.config.SPLAT_RADIUS = origSplatRadius * sizeMod;
            } catch (_) {}
        }

        // Bass → Auto splat on beat (big, centered splats)
        if (mapBassAutoSplat && beatDetected) {
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

    function fireAutoSplat(band) {
        var canvas = document.getElementById('canvas') || document.querySelector('canvas');
        if (!canvas) return;

        var cx = canvas.width * 0.5;
        var cy = canvas.height * 0.5;
        var x, y, force, splatRadius;

        // Different behavior per band
        if (band === 'treble') {
            // Small sparkle splats scattered around
            x = Math.random() * canvas.width;
            y = Math.random() * canvas.height;
            force = treble * sensitivity * 300;
            splatRadius = 0.001 + treble * 0.003;
        } else if (band === 'mid') {
            // Medium splats in a ring around center
            autoSplatAngle += 0.618 * Math.PI * 2;
            var r = Math.min(canvas.width, canvas.height) * 0.25;
            x = cx + Math.cos(autoSplatAngle) * r;
            y = cy + Math.sin(autoSplatAngle) * r;
            force = mid * sensitivity * 500;
            splatRadius = 0.003 + mid * 0.005;
        } else {
            // Bass: big splats at configured position
            if (autoSplatMode === 'random') {
                x = Math.random() * canvas.width;
                y = Math.random() * canvas.height;
            } else if (autoSplatMode === 'circular') {
                autoSplatAngle += 0.618 * Math.PI * 2;
                var br = Math.min(canvas.width, canvas.height) * 0.3;
                x = cx + Math.cos(autoSplatAngle) * br;
                y = cy + Math.sin(autoSplatAngle) * br;
            } else {
                x = cx + (Math.random() - 0.5) * 60;
                y = cy + (Math.random() - 0.5) * 60;
            }
            force = bass * sensitivity * 800;
            splatRadius = window.config ? window.config.SPLAT_RADIUS : 0.008;
        }

        var angle = Math.random() * Math.PI * 2;
        var dx = Math.cos(angle) * force;
        var dy = Math.sin(angle) * force;

        // Get current color
        var color = null;
        try {
            var hex = document.getElementById('colorPicker').value;
            var cr = parseInt(hex.slice(1, 3), 16) / 255;
            var cg = parseInt(hex.slice(3, 5), 16) / 255;
            var cb = parseInt(hex.slice(5, 7), 16) / 255;
            color = [cr, cg, cb];
        } catch (_) {
            color = [Math.random(), Math.random(), Math.random()];
        }

        if (typeof window.applyMultiSplatWith === 'function') {
            var mult = (band === 'treble') ? 1 : (window.animationMultiplier || 1);
            window.applyMultiSplatWith(x, y, dx, dy, color, mult, splatRadius);
        }
    }

    // ─── VISUALIZER ─────────────────────────────────────────────
    function drawViz() {
        if (!vizCanvas || !vizCtx) return;
        var w = vizCanvas.width;
        var h = vizCanvas.height;
        vizCtx.clearRect(0, 0, w, h);

        // Background
        vizCtx.fillStyle = 'rgba(0,0,0,0.3)';
        vizCtx.fillRect(0, 0, w, h);

        if (!freqData) return;

        // Draw frequency bars — logarithmic distribution for better mid/treble visibility
        var barCount = 48;
        var maxBin = Math.min(freqData.length, TREBLE_END);
        var barW = w / barCount;

        for (var i = 0; i < barCount; i++) {
            // Logarithmic bin mapping: more bars for low freq, fewer for high
            var t = i / barCount;
            var bin = Math.round(BASS_START + (maxBin - BASS_START) * (Math.pow(2, t * 4) - 1) / 15);
            bin = Math.min(bin, maxBin - 1);

            var val = freqData[bin] / 255;
            var barH = val * h * 0.9;

            // Color by band
            var hue;
            if (bin < BASS_END) hue = 0;           // red for bass
            else if (bin < MID_END) hue = 120;      // green for mid
            else hue = 210;                          // blue for treble

            vizCtx.fillStyle = 'hsla(' + hue + ', 80%, 55%, 0.85)';
            vizCtx.fillRect(i * barW, h - barH, barW - 1, barH);
        }

        // Beat indicators
        if (beatDetected) {
            vizCtx.fillStyle = 'rgba(255, 60, 60, 0.7)';
            vizCtx.fillRect(0, 0, w * 0.33, 3);
        }
        if (midBeatDetected) {
            vizCtx.fillStyle = 'rgba(60, 255, 60, 0.7)';
            vizCtx.fillRect(w * 0.33, 0, w * 0.34, 3);
        }
        if (trebleBeatDetected) {
            vizCtx.fillStyle = 'rgba(60, 120, 255, 0.7)';
            vizCtx.fillRect(w * 0.67, 0, w * 0.33, 3);
        }

        // Band energy bars (bottom)
        var bw = w / 3;
        var bh = 6;
        var by = h - bh;
        vizCtx.globalAlpha = 0.7;
        vizCtx.fillStyle = '#ff4444';
        vizCtx.fillRect(0, by, bw * bass, bh);
        vizCtx.fillStyle = '#44ff44';
        vizCtx.fillRect(bw, by, bw * mid, bh);
        vizCtx.fillStyle = '#4488ff';
        vizCtx.fillRect(bw * 2, by, bw * treble, bh);
        vizCtx.globalAlpha = 1;

        // Band labels
        vizCtx.fillStyle = 'rgba(255,255,255,0.7)';
        vizCtx.font = '9px monospace';
        vizCtx.fillText('B:' + (bass * 100).toFixed(0), 3, 10);
        vizCtx.fillText('M:' + (mid * 100).toFixed(0), w * 0.35, 10);
        vizCtx.fillText('T:' + (treble * 100).toFixed(0), w * 0.68, 10);
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
    window.audioReactive = {
        enable: enable,
        disable: disable,
        isEnabled: function () { return enabled; },
        getBands: function () {
            return {
                bass: bass, mid: mid, treble: treble, overall: overall,
                beat: beatDetected, midBeat: midBeatDetected, trebleBeat: trebleBeatDetected
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
            if (key === 'overallToSize') mapOverallToSize = val;
        },
        setAutoSplatMode: function (mode) { autoSplatMode = mode; },
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
