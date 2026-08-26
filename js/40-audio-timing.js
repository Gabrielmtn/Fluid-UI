// ═══════════════════════════════════════════════════════════════════
// js/40-audio-timing.js — "Visualize Audio Timing"
// LOAD ORDER: after 22-audio-reactive.js (needs the decoded file buffer
//   and the transport clock), after 30-audio-scenes.js (borrows its
//   spectral gate editor), after 10-draggable.js. 20-mixer-layout.js
//   builds the sidebar row and looks this module up lazily.
// PROVIDES: window.AudioTiming
//
// A live analyser can only tell you what just happened. To show a player
// what is COMING — the whole point of a descending-bar chart — you have
// to read the track ahead of the playhead. This module runs one offline
// STFT pass per file and keeps the result as a REDUCED SPECTROGRAM
// (SPEC_COLS columns on the same 20 Hz – 20 kHz log axis the gate editor
// draws on, one byte per cell). Cue extraction then runs on that cache
// in a few milliseconds, so redrawing a gate box — or switching how a
// lane listens — re-charts the whole track instantly. Only loading a
// NEW file pays the FFT cost again.
//
// The lanes are the boxes the user draws in the spectral gate editor;
// each lane owns a detection method:
//   level — the live gates, verbatim: band max crosses the box's top
//           edge (same hysteresis + cooldown as 30-audio-scenes'
//           gatesTrigger). What you'd get performing live.
//   onset — spectral flux inside the band, peak-picked against an
//           adaptive local threshold. Finds ATTACKS, so a bassline
//           that never dips below the box edge still charts every
//           note. The box's top edge sets sensitivity. The default.
//   beat  — autocorrelates the band's flux to find its tempo, then
//           lays a metronome grid at that BPM, phase-locked to the
//           hits. Ticks are muted while the band sits below the box
//           edge, so the grid breathes with the arrangement.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var LS_GATES = 'fluidui.audioTiming.gates';
    var LS_OPTS  = 'fluidui.audioTiming.opts';
    var LS_RECT  = 'fluidui.audioTiming.rect';

    // Analysis constants. fftSize/smoothing/dB range MIRROR the hi-res
    // analyser in 22-audio-reactive.js (ensureHiRes) — a threshold drawn
    // against the live spectrum has to mean the same thing offline, and
    // it only does if both sides run the same transform.
    var FFT_SIZE   = 4096;
    // 512, not 1024: measured against a synthetic 120 BPM loop, halving the
    // hop moved hi-hat detection from 2-of-8 cues at +-250 ms to 8-of-8 at
    // +-9 ms. Smoothing is applied per hop, so a shorter hop also lands the
    // effective time constant nearer the live analyser's ~60 Hz read rate.
    var HOP        = 512;    // 10.7 ms at 48k
    var SMOOTHING  = 0.5;
    var MIN_DB     = -90;
    var MAX_DB     = -10;
    // Spectrogram width. 256 columns over 3 decades = 0.39% of the log
    // axis per column — finer than a finger can draw a box edge in the
    // ~286 px editor, and a 4-minute track still caches under 6 MB.
    var SPEC_COLS  = 256;
    var MAX_MINUTES = 20;    // refuse to chew through a DJ set

    // Method timing constants. Level mirrors the live gatesTrigger
    // exactly; onset can re-arm faster because flux collapses to zero
    // between attacks instead of riding the sustain.
    var LEVEL_COOLDOWN = 0.17;   // s — matches gatesTrigger's re-arm floor
    var ONSET_COOLDOWN = 0.12;
    // Every extractor stamps cues ~13-34 ms EARLY (measured across 9 lanes /
    // 3 tempos / click tests): energy entering the Blackman window is seen
    // before the window centre reaches it. One constant, centred on the
    // measured bias, brings medians inside +-10 ms. The Nudge slider stays
    // for taste; this is for truth.
    var LAG_COMP = 0.020;        // s, added to every cue timestamp

    // ─── STATE ──────────────────────────────────────────────────────
    var enabled = false;
    var gateStore = { gates: [], gain: 1 };   // the shape the borrowed editor writes
    var opts = { lead: 2.2, offsetMs: 0 };
    var cache = null;        // { levels:Uint8Array, frames, cols, t0, dt, duration, key }
    var chart = null;        // { notes, duration, lanes } — extracted from cache + gates
    var analysing = false, analysisPct = 0, analysisErr = '';
    var worker = null, workerUrl = null, pumpTimer = null, jobSerial = 0;

    var panel = null, cv = null, headStatus = null, rafId = null;
    var lastRenderMs = 0;
    var laneFlash = [];      // per-lane hit-flash timestamps
    var lastSeenTime = -1;
    var glowLane = -1;       // lane lit up while its gate box is being edited / row hovered

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    // ─── PERSISTENCE ────────────────────────────────────────────────
    // Gates and panel geometry are user-authored: they write through the
    // moment they change and come back every boot. The checkbox itself
    // does NOT persist — restoring it would arm a chart for a file that
    // is no longer loaded.
    function loadStored() {
        try {
            var g = JSON.parse(localStorage.getItem(LS_GATES));
            if (g && g.length) gateStore.gates = g;
        } catch (_) {}
        try {
            var o = JSON.parse(localStorage.getItem(LS_OPTS));
            if (o) {
                if (typeof o.lead === 'number') opts.lead = clamp(o.lead, 0.6, 8);
                if (typeof o.offsetMs === 'number') opts.offsetMs = clamp(o.offsetMs, -500, 500);
            }
        } catch (_) {}
    }
    function saveGates() {
        try { localStorage.setItem(LS_GATES, JSON.stringify(gateStore.gates)); } catch (_) {}
    }
    function saveOpts() {
        try { localStorage.setItem(LS_OPTS, JSON.stringify(opts)); } catch (_) {}
    }
    function saveRect() {
        if (!panel) return;
        try {
            localStorage.setItem(LS_RECT, JSON.stringify({
                left: parseFloat(panel.style.left) || 0,
                top: parseFloat(panel.style.top) || 0,
                width: parseFloat(panel.style.width) || 0,
                height: parseFloat(panel.style.height) || 0
            }));
        } catch (_) {}
    }
    function loadRect() {
        try { return JSON.parse(localStorage.getItem(LS_RECT)); } catch (_) { return null; }
    }
    loadStored();

    // ─── LANE COLOURS / LABELS / METHODS ────────────────────────────
    // Colours are sampled off the same bass-red → mid-green → treble-violet
    // ramp the gate editor paints its spectrum with, at the box's band
    // centre, so a lane is recognisably the box you drew.
    var RAMP = [[255, 90, 80], [80, 220, 120], [150, 120, 255]];
    function laneColor(g) {
        var t = clamp((g.lo + g.hi) / 2, 0, 1) * 2;
        var i = t < 1 ? 0 : 1, f = t < 1 ? t : t - 1;
        var a = RAMP[i], b = RAMP[i + 1];
        return [Math.round(a[0] + (b[0] - a[0]) * f),
                Math.round(a[1] + (b[1] - a[1]) * f),
                Math.round(a[2] + (b[2] - a[2]) * f)];
    }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function hzLabel(hz) {
        return hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 0 : 1) + 'k' : Math.round(hz) + '';
    }
    function laneLabel(g) {
        var f = (window.AudioScenes && window.AudioScenes.x01ToHz) || function (x) { return 20 * Math.pow(10, x * 3); };
        return hzLabel(f(g.lo)) + '–' + hzLabel(f(g.hi));
    }

    var METHODS = ['onset', 'level', 'beat', 'pitch'];
    var METHOD_LABEL = { onset: 'Onset', level: 'Level', beat: 'Beat', pitch: 'Pitch' };
    var METHOD_TIP = {
        onset: 'Onset — fires on attacks (vibrato-suppressed spectral flux vs an adaptive threshold). Box edge = sensitivity. Best default for real music.',
        level: 'Level — fires when the band crosses the box’s top edge, exactly like the live gates.',
        beat:  'Beat — locks a steady grid to this band’s tempo; the box edge mutes ticks where the band goes quiet.',
        pitch: 'Pitch — follows the band’s dominant note: a cue lands on each note change, and the bar’s position across the lane tracks how high the note is. Box edge mutes quiet passages.'
    };
    function laneMethod(g) { return METHODS.indexOf(g.method) >= 0 ? g.method : 'onset'; }
    function laneTh(g) { return clamp(g.th, 0.05, 0.98); }

    // ─── SPECTROGRAM KERNEL ─────────────────────────────────────────
    // SELF-CONTAINED ON PURPOSE: this function is stringified into a Blob
    // worker (see buildCache), so it may not touch a single thing in the
    // enclosing closure. It returns a resumable job — the worker runs it
    // flat out, the no-worker fallback pumps it a slice at a time so a
    // three-minute track never stalls the sim. Output is the reduced
    // log-axis spectrogram only; cue extraction happens OUTSIDE, on the
    // main thread, where it can re-run instantly per gate edit.
    function spectrogramKernel(job) {
        var pcm = job.pcm, sr = job.sampleRate;
        var N = job.fftSize | 0, hop = job.hop | 0, M = N >> 1;
        var tau = job.smoothing, minDb = job.minDb, maxDb = job.maxDb;
        var cols = job.cols | 0;

        // Blackman window, per the Web Audio spec's AnalyserNode (a = 0.16).
        var win = new Float64Array(N);
        for (var wi = 0; wi < N; wi++) {
            win[wi] = 0.42 - 0.5 * Math.cos(2 * Math.PI * wi / N) + 0.08 * Math.cos(4 * Math.PI * wi / N);
        }

        // Iterative radix-2 complex FFT of length M, plus the real-input
        // packing that lets an N-point real transform cost an M-point
        // complex one (halves the work over a zero-padded complex FFT).
        var bits = Math.round(Math.log(M) / Math.LN2);
        var rev = new Uint32Array(M);
        for (var ri = 0; ri < M; ri++) {
            var rr = 0;
            for (var rb = 0; rb < bits; rb++) if (ri & (1 << rb)) rr |= 1 << (bits - 1 - rb);
            rev[ri] = rr;
        }
        var tc = new Float64Array(M >> 1), ts = new Float64Array(M >> 1);
        for (var ti2 = 0; ti2 < (M >> 1); ti2++) {
            tc[ti2] = Math.cos(-2 * Math.PI * ti2 / M);
            ts[ti2] = Math.sin(-2 * Math.PI * ti2 / M);
        }
        // Unpack twiddles: W_N^k = e^(-i*pi*k/M)
        var ur = new Float64Array(M), ui = new Float64Array(M);
        for (var uk = 0; uk < M; uk++) { ur[uk] = Math.cos(-Math.PI * uk / M); ui[uk] = Math.sin(-Math.PI * uk / M); }

        var zr = new Float64Array(M), zi = new Float64Array(M);
        var smooth = new Float64Array(M + 1);   // running |X| per bin, as AnalyserNode keeps it
        var byteBin = new Float64Array(M + 1);  // 0..1, the getByteFrequencyData value / 255

        function fftM() {
            var i, j, t;
            for (i = 0; i < M; i++) {
                j = rev[i];
                if (j > i) { t = zr[i]; zr[i] = zr[j]; zr[j] = t; t = zi[i]; zi[i] = zi[j]; zi[j] = t; }
            }
            for (var len = 2; len <= M; len <<= 1) {
                var hl = len >> 1, step = M / len;
                for (var s = 0; s < M; s += len) {
                    for (var k = 0; k < hl; k++) {
                        var wr = tc[k * step], wq = ts[k * step];
                        var a = s + k, b = a + hl;
                        var xr = zr[b] * wr - zi[b] * wq;
                        var xq = zr[b] * wq + zi[b] * wr;
                        zr[b] = zr[a] - xr; zi[b] = zi[a] - xq;
                        zr[a] += xr;        zi[a] += xq;
                    }
                }
            }
        }

        // One STFT frame → byteBin[]. Mirrors AnalyserNode exactly: window,
        // transform, magnitude/fftSize, smooth on the LINEAR magnitude, then
        // dB, then the min/maxDecibels rescale.
        function frameAt(off) {
            var k, s0, s1;
            for (k = 0; k < M; k++) {
                s0 = off + 2 * k; s1 = s0 + 1;
                zr[k] = (s0 < pcm.length ? pcm[s0] : 0) * win[2 * k];
                zi[k] = (s1 < pcm.length ? pcm[s1] : 0) * win[2 * k + 1];
            }
            fftM();
            var inv = 1 / N;
            for (k = 0; k < M; k++) {
                var k2 = (M - k) & (M - 1);
                var zrk = zr[k], zik = zi[k], zrm = zr[k2], zim = -zi[k2];
                var er = 0.5 * (zrk + zrm), ei = 0.5 * (zik + zim);      // even half
                var or_ = 0.5 * (zik - zim), oi = -0.5 * (zrk - zrm);    // odd half, /(2i)
                var xr = er + (ur[k] * or_ - ui[k] * oi);
                var xq = ei + (ur[k] * oi + ui[k] * or_);
                var mag = Math.sqrt(xr * xr + xq * xq) * inv;
                smooth[k] = tau * smooth[k] + (1 - tau) * mag;
                var db = 20 * Math.log(smooth[k] > 1e-12 ? smooth[k] : 1e-12) / Math.LN10;
                var v = (db - minDb) / (maxDb - minDb);
                byteBin[k] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
            // Nyquist: X[M] = Xe[0] - Xo[0], both real.
            var nq = Math.abs(zr[0] - zi[0]) * inv;
            smooth[M] = tau * smooth[M] + (1 - tau) * nq;
            var dbn = 20 * Math.log(smooth[M] > 1e-12 ? smooth[M] : 1e-12) / Math.LN10;
            var vn = (dbn - minDb) / (maxDb - minDb);
            byteBin[M] = vn < 0 ? 0 : vn > 1 ? 1 : vn;
        }

        // Column → bin edges on the SAME 20 Hz – 20 kHz log10 axis the gate
        // editor draws on (and the same round() the editor's LUT uses), so a
        // box edge means the identical set of bins on both surfaces.
        var edges = new Int32Array(cols + 1);
        for (var c = 0; c <= cols; c++) {
            var hz = 20 * Math.pow(10, 3 * c / cols);
            var b = Math.round(hz * N / sr);
            if (b < 1) b = 1; if (b > M) b = M;
            edges[c] = b;
        }

        var totalFrames = Math.max(1, Math.floor((pcm.length - N) / hop) + 1);
        var levels = new Uint8Array(totalFrames * cols);
        var frame = 0;

        return {
            totalFrames: totalFrames,
            get frame() { return frame; },
            // Advance up to 'budget' frames. Returns true when the track is done.
            step: function (budget) {
                var end = Math.min(totalFrames, frame + (budget | 0 || 1));
                for (; frame < end; frame++) {
                    frameAt(frame * hop);
                    var base = frame * cols;
                    for (var c = 0; c < cols; c++) {
                        var b0 = edges[c], b1 = Math.max(b0 + 1, edges[c + 1]);
                        var mx = 0;
                        for (var bi = b0; bi < b1 && bi <= M; bi++) if (byteBin[bi] > mx) mx = byteBin[bi];
                        levels[base + c] = (mx * 255) | 0;
                    }
                }
                return frame >= totalFrames;
            },
            result: function () {
                return {
                    levels: levels, frames: totalFrames, cols: cols,
                    // Cell timestamps sit at the WINDOW CENTRE, not its
                    // trailing edge: a Blackman window weights the middle,
                    // so that is where a transient actually sat.
                    t0: (N / 2) / sr, dt: hop / sr,
                    duration: pcm.length / sr
                };
            }
        };
    }

    // ─── ANALYSIS DRIVER ────────────────────────────────────────────
    function fileKey() {
        var ar = window.audioReactive;
        var buf = (ar && ar.getFileBuffer) ? ar.getFileBuffer() : null;
        if (!buf) return '';
        return (ar.fileName ? ar.fileName() : '') + '|' + buf.duration.toFixed(3) + '|' + buf.sampleRate;
    }

    function monoMix(buf) {
        var n = buf.length, out = new Float32Array(n);
        out.set(buf.getChannelData(0));
        if (buf.numberOfChannels > 1) {
            var b = buf.getChannelData(1);
            for (var i = 0; i < n; i++) out[i] = (out[i] + b[i]) * 0.5;
        }
        return out;
    }

    function cancelAnalysis() {
        jobSerial++;
        if (worker) { try { worker.terminate(); } catch (_) {} worker = null; }
        if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = null; }
        analysing = false;
    }

    function ensureWorkerUrl() {
        if (workerUrl !== null) return workerUrl;
        workerUrl = false;
        try {
            if (!window.Worker || !window.Blob || !window.URL || !URL.createObjectURL) return workerUrl;
            var body = 'self.onmessage=function(ev){var job=ev.data;try{var K=' + spectrogramKernel.toString() + ';' +
                'var k=K(job),last=0;' +
                'while(!k.step(400)){var p=k.frame/k.totalFrames;if(p-last>0.02){last=p;self.postMessage({p:p});}}' +
                'var r=k.result();self.postMessage({done:r},[r.levels.buffer]);}' +
                'catch(e){self.postMessage({err:String((e&&e.message)||e)});}};';
            workerUrl = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
        } catch (_) { workerUrl = false; }
        return workerUrl;
    }

    // Build the spectrogram cache for the loaded track. Off the main thread
    // when the platform allows it; otherwise pumped in ~5 ms slices, because
    // a stall here is a stall in the fluid sim. Gate-independent: this runs
    // once per FILE, and every gate/method edit afterwards re-extracts from
    // the cache in a few milliseconds.
    function buildCache(force) {
        var ar = window.audioReactive;
        var buf = (ar && ar.getFileBuffer) ? ar.getFileBuffer() : null;
        analysisErr = '';
        if (!buf) {
            cancelAnalysis(); cache = null; chart = null; refreshStatus(); updateLaneLists(); return;
        }
        var key = fileKey();
        if (!force && cache && cache.key === key) { extractAll(); return; }
        if (buf.duration > MAX_MINUTES * 60) {
            cancelAnalysis(); cache = null; chart = null;
            analysisErr = 'Track is over ' + MAX_MINUTES + ' min';
            refreshStatus(); updateLaneLists(); return;
        }

        cancelAnalysis();
        var serial = ++jobSerial;
        // Track B's read must not render behind track A's chart: drop the
        // stale data NOW so the canvas shows the progress screen and the
        // lane counts honestly read '–' until the new cues land.
        cache = null; chart = null; laneFlash = [];
        updateLaneLists();
        var job = {
            pcm: monoMix(buf), sampleRate: buf.sampleRate,
            fftSize: FFT_SIZE, hop: HOP, smoothing: SMOOTHING,
            minDb: MIN_DB, maxDb: MAX_DB, cols: SPEC_COLS
        };
        analysing = true; analysisPct = 0; refreshStatus();

        function done(res) {
            if (serial !== jobSerial) return;
            analysing = false; analysisPct = 1;
            cache = { levels: res.levels, frames: res.frames, cols: res.cols,
                      t0: res.t0, dt: res.dt, duration: res.duration, key: key };
            laneFlash = [];
            lastSeenTime = -1;
            extractAll();
            // New track read: every lane the user hasn't hand-levelled eases
            // onto what THIS track's band actually needs.
            autoFit(false);
        }
        function failed(msg) {
            if (serial !== jobSerial) return;
            analysing = false; cache = null; chart = null;
            analysisErr = msg || 'analysis failed';
            refreshStatus(); updateLaneLists();
        }

        var url = ensureWorkerUrl();
        if (url) {
            try {
                var w = new Worker(url);
                worker = w;
                w.onmessage = function (ev) {
                    var d = ev.data || {};
                    if (serial !== jobSerial) return;
                    if (d.p !== undefined) { analysisPct = d.p; refreshStatus(); }
                    else if (d.done) { worker = null; try { w.terminate(); } catch (_) {} done(d.done); }
                    else if (d.err) { worker = null; try { w.terminate(); } catch (_) {} failed(d.err); }
                };
                w.onerror = function () {
                    // Serial guard first: a stale queued error from a
                    // terminated worker must not clobber a newer live one.
                    if (serial !== jobSerial) return;
                    try { w.terminate(); } catch (_) {}
                    worker = null;
                    // A worker that errors before ever reporting progress
                    // never loaded (blob: blocked by CSP, etc.) — burn the
                    // URL and rebuild via the in-page pump instead of
                    // failing every future Re-read identically. The pcm
                    // buffer was detached by the transfer, so re-enter
                    // buildCache rather than reusing the job.
                    if (analysisPct === 0) { workerUrl = false; buildCache(true); }
                    else failed('worker error');
                };
                w.postMessage(job, [job.pcm.buffer]);
                return;
            } catch (_) { worker = null; /* fall through to the in-page pump */ }
        }

        var k;
        try { k = spectrogramKernel(job); } catch (e) { failed(String(e && e.message || e)); return; }
        (function pump() {
            if (serial !== jobSerial) return;
            var t0 = performance.now(), fin = false;
            while (!fin && performance.now() - t0 < 5) fin = k.step(32);
            analysisPct = k.frame / k.totalFrames;
            if (fin) { done(k.result()); return; }
            refreshStatus();
            pumpTimer = setTimeout(pump, 0);
        })();
    }

    // ─── CUE EXTRACTION (instant, per gate edit) ────────────────────
    // Everything below reads the byte spectrogram only. Column ranges use
    // the same floor/ceil the editor's box overlay covers, so the cues are
    // computed from exactly the pixels the user boxed in.
    function colRange(g, cols) {
        var c0 = clamp(Math.floor(g.lo * cols), 0, cols - 1);
        var c1 = clamp(Math.ceil(g.hi * cols) - 1, c0, cols - 1);
        return [c0, c1];
    }
    function bandLevelAt(cc, f, c0, c1) {
        var L = cc.levels, base = f * cc.cols, mx = 0;
        for (var c = c0; c <= c1; c++) if (L[base + c] > mx) mx = L[base + c];
        return mx / 255;
    }
    // Per-frame spectral flux inside the band: positive spectral change,
    // normalized by band width. Sharp at attacks, ~zero through sustains —
    // the opposite failure mode from a level gate. SUPERFLUX variant
    // (Böck & Widmer 2013): each column diffs against a ±1-column MAX of
    // the previous frame, so energy that merely slides sideways along the
    // frequency axis — vibrato, bends, wobble — cancels instead of firing.
    function bandFlux(cc, c0, c1) {
        var L = cc.levels, cols = cc.cols, F = cc.frames;
        var flux = new Float32Array(F);
        var norm = 1 / (255 * (c1 - c0 + 1));
        for (var f = 1; f < F; f++) {
            var base = f * cols, prev = base - cols, s = 0;
            for (var c = c0; c <= c1; c++) {
                var pm = L[prev + c];
                if (c > 0 && L[prev + c - 1] > pm) pm = L[prev + c - 1];
                if (c < cols - 1 && L[prev + c + 1] > pm) pm = L[prev + c + 1];
                var d = L[base + c] - pm;
                if (d > 0) s += d;
            }
            flux[f] = s * norm;
        }
        return flux;
    }

    // level — the live gate, verbatim: threshold + hysteresis + cooldown.
    function extractLevel(cc, g) {
        var cr = colRange(g, cc.cols), c0 = cr[0], c1 = cr[1];
        var th = laneTh(g), notes = [];
        var above = false, lastFire = -1e9;
        for (var f = 0; f < cc.frames; f++) {
            var v = bandLevelAt(cc, f, c0, c1);
            var t = cc.t0 + f * cc.dt;
            if (v >= th && !above && (t - lastFire) > LEVEL_COOLDOWN) {
                lastFire = t;
                notes.push({ t: t + LAG_COMP, e: clamp((v - th) / Math.max(0.05, 1 - th), 0, 1) });
            }
            if (v >= th) above = true;
            else if (v < th * 0.85) above = false;
        }
        return notes;
    }

    // onset — peak-picked flux against an adaptive local mean. The box's
    // top edge maps to the threshold multiplier: a low edge catches ghost
    // notes, a high edge keeps only the slams.
    function extractOnset(cc, g) {
        var cr = colRange(g, cc.cols), c0 = cr[0], c1 = cr[1];
        var flux = bandFlux(cc, c0, c1);
        var F = cc.frames;
        var W = Math.max(4, Math.round(0.8 / cc.dt));   // ±0.8 s adaptive window
        var pre = new Float64Array(F + 1);
        for (var i = 0; i < F; i++) pre[i + 1] = pre[i] + flux[i];
        var alpha = 1.3 + laneTh(g) * 2.7;              // th 0.05→1.4, 0.5→2.7, 0.98→3.9
        // The box edge ALSO sets a flux floor, or the knob is inert: the
        // adaptive term alone saturates on sparse clean transients (a th
        // sweep 0.2→0.8 measured 24/24/23 cues). The floor is RELATIVE to
        // the band's own strong-hit scale (p98 of active frames) — an
        // absolute floor tuned for a quiet band silenced real attacks
        // buried under a loud drone (dB compression shrinks their flux).
        // Relative, the edge means ‘cull the weakest X% of this band's
        // dynamics’ on any material, and stays strictly monotone.
        var act = [];
        for (var af = 1; af < F; af++) if (flux[af] > 0.01) act.push(flux[af]);
        act.sort(function (a, b) { return a - b; });
        var scale = act.length ? act[Math.min(act.length - 1, (act.length * 0.98) | 0)] : 0;
        var floor_ = 0.006 + Math.pow(laneTh(g), 1.3) * 0.95 * scale;
        var notes = [], last = -1e9;
        for (var f = 2; f < F - 2; f++) {
            var v = flux[f];
            if (v < floor_) continue;
            if (!(v >= flux[f - 1] && v >= flux[f - 2] && v > flux[f + 1] && v > flux[f + 2])) continue;
            var a0 = Math.max(0, f - W), a1 = Math.min(F, f + W + 1);
            var thr = Math.max(((pre[a1] - pre[a0]) / (a1 - a0)) * alpha + 0.008, floor_);
            if (v < thr) continue;
            var t = cc.t0 + f * cc.dt;
            if (t - last < ONSET_COOLDOWN) continue;
            last = t;
            notes.push({ t: t + LAG_COMP, e: clamp((v - thr) / Math.max(thr, 0.02), 0, 1) });
        }
        return notes;
    }

    // beat — tempo grid. Autocorrelate the band's flux over 57–200 BPM,
    // refine the winning lag sub-frame (a raw 10.7 ms lag quantum drifts
    // over a full track), phase-lock to the hits, then emit ticks wherever
    // the band is awake. Returns bpm for the UI.
    function extractBeat(cc, g) {
        var cr = colRange(g, cc.cols), c0 = cr[0], c1 = cr[1];
        var flux = bandFlux(cc, c0, c1);
        var F = cc.frames, dt = cc.dt;
        var lagMin = Math.max(2, Math.round(0.30 / dt));    // 200 BPM
        var lagMax = Math.min(F - 2, Math.round(1.06 / dt)); // 57 BPM
        if (lagMax <= lagMin + 2) return { notes: [], bpm: null };

        var ac = new Float64Array(lagMax + 1);
        var lag, f, s;
        for (lag = lagMin; lag <= lagMax; lag++) {
            s = 0;
            for (f = 0; f + lag < F; f++) s += flux[f] * flux[f + lag];
            ac[lag] = s / (F - lag);
        }
        // Harmonic weighting: a true beat also correlates at twice its lag,
        // which breaks the classic half/double-tempo tie.
        var best = -1, bestScore = 0, mean = 0, cnt = 0;
        for (lag = lagMin; lag <= lagMax; lag++) { mean += ac[lag]; cnt++; }
        mean /= Math.max(1, cnt);
        for (lag = lagMin; lag <= lagMax; lag++) {
            var sc = ac[lag];
            var l2 = lag * 2;
            if (l2 <= lagMax) sc += 0.5 * ac[l2];
            else {
                var half = lag >> 1;
                if (half >= lagMin) sc += 0.25 * ac[half];
            }
            if (sc > bestScore) { bestScore = sc; best = lag; }
        }
        // No clear periodicity (a pad, silence, rubato) → an honest empty
        // lane beats a fabricated grid.
        if (best < 0 || mean <= 0 || ac[best] < mean * 1.15) return { notes: [], bpm: null };

        // Parabolic refinement around the peak → sub-frame period.
        var frac = 0;
        if (best > lagMin && best < lagMax) {
            var den = ac[best - 1] - 2 * ac[best] + ac[best + 1];
            if (den !== 0) frac = clamp(0.5 * (ac[best - 1] - ac[best + 1]) / den, -0.5, 0.5);
        }
        var periodF = best + frac;             // period in (fractional) frames
        var period = periodF * dt;

        // Phase: fold flux into the period at half-frame resolution and take
        // the offset that catches the most energy.
        var bestO = 0, bs = -1;
        for (var o = 0; o < periodF; o += 0.5) {
            s = 0;
            for (var p = o; p < F; p += periodF) s += flux[Math.round(p)] || 0;
            if (s > bs) { bs = s; bestO = o; }
        }

        var th = laneTh(g), notes = [];
        for (var tf = bestO; tf < F; tf += periodF) {
            var fi = Math.round(tf);
            // The band has to be awake near the tick (±2 frames) or the
            // metronome hammers through breakdowns.
            var lv = 0;
            for (var q = Math.max(0, fi - 2); q <= Math.min(F - 1, fi + 2); q++) {
                var l = bandLevelAt(cc, q, c0, c1);
                if (l > lv) lv = l;
            }
            if (lv < th) continue;
            notes.push({ t: cc.t0 + tf * dt + LAG_COMP, e: clamp((lv - th) / Math.max(0.05, 1 - th), 0, 1) });
        }
        return { notes: notes, bpm: 60 / period };
    }

    // pitch — dominant-note contour. Track the loudest column in the band
    // per frame (median-of-3 smoothed), emit a cue whenever the note moves
    // by ≥2 columns (~a semitone on this axis) and holds, or starts from
    // silence. Each cue carries p = where the note sits across the band
    // (0..1), so the chart can draw the melody as a falling contour.
    function extractPitch(cc, g) {
        var cr = colRange(g, cc.cols), c0 = cr[0], c1 = cr[1];
        var L = cc.levels, cols = cc.cols, F = cc.frames;
        var th = laneTh(g);
        var span = Math.max(1, c1 - c0);
        var dom = new Int16Array(F), lvl = new Float32Array(F);
        for (var f = 0; f < F; f++) {
            var base = f * cols, mx = 0, mc = -1;
            for (var c = c0; c <= c1; c++) {
                if (L[base + c] > mx) { mx = L[base + c]; mc = c; }
            }
            lvl[f] = mx / 255;
            dom[f] = (lvl[f] >= th) ? mc : -1;   // box edge = the mute floor
        }
        // median-of-3 kills single-frame flickers without lagging real moves
        var sm = new Int16Array(F);
        sm[0] = dom[0]; sm[F - 1] = dom[F - 1];
        for (f = 1; f < F - 1; f++) {
            var a = dom[f - 1], b = dom[f], c2 = dom[f + 1];
            sm[f] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c2));
        }
        var HOLD = 3;             // frames a new note must hold (~32 ms)
        var JUMP = 2;             // columns ≈ a semitone on the 256-col log axis
        var COOL = 0.10;          // s
        var notes = [], cur = -1, last = -1e9;
        for (f = 0; f + HOLD <= F; f++) {
            var v = sm[f];
            if (v < 0) { if (cur >= 0 && lvl[f] < th * 0.7) cur = -1; continue; }
            var fromSilence = (cur < 0);
            var isNew = fromSilence || Math.abs(v - cur) >= JUMP;
            if (!isNew) { cur = v; continue; }
            var held = true;
            for (var h = 1; h < HOLD; h++) if (Math.abs(sm[f + h] - v) > 1) { held = false; break; }
            if (!held) continue;
            cur = v;
            var sf = f;
            if (fromSilence) {
                // The smoothed level needs ~3 frames to climb over th from
                // silence, which lands the first cue of a phrase late.
                // Walk back to where the band actually woke up.
                while (sf > 0 && lvl[sf - 1] >= th * 0.4) sf--;
            }
            var t = cc.t0 + sf * cc.dt;
            if (t - last < COOL) continue;
            last = t;
            notes.push({ t: t + LAG_COMP,
                         e: clamp((lvl[f] - th) / Math.max(0.05, 1 - th), 0, 1),
                         p: clamp((v - c0) / span, 0, 1) });
        }
        return notes;
    }

    // Re-derive the whole chart from cache + gates. Milliseconds, so every
    // gate edit calls this directly — the box lands and the lane re-fills
    // in the same breath.
    function extractAll() {
        if (!cache) { chart = null; refreshStatus(); updateLaneLists(); return; }
        var t0 = performance.now();
        var lanes = [], all = [];
        for (var i = 0; i < gateStore.gates.length; i++) {
            var g = gateStore.gates[i];
            var m = laneMethod(g), notes, bpm = null;
            if (m === 'level') notes = extractLevel(cache, g);
            else if (m === 'beat') { var b = extractBeat(cache, g); notes = b.notes; bpm = b.bpm; }
            else if (m === 'pitch') notes = extractPitch(cache, g);
            else notes = extractOnset(cache, g);
            for (var k = 0; k < notes.length; k++) { notes[k].lane = i; all.push(notes[k]); }
            lanes.push({ lo: g.lo, hi: g.hi, th: laneTh(g), method: m,
                         color: laneColor(g), label: laneLabel(g), bpm: bpm, count: notes.length });
        }
        all.sort(function (a, b2) { return a.t - b2.t; });
        laneFlash = [];   // indices may have shifted — a stale flash lights the wrong lane
        chart = { notes: all, duration: cache.duration, lanes: lanes };
        AT.lastExtractMs = performance.now() - t0;
        refreshStatus();
        updateLaneLists();
    }

    // A gate/method edit from any surface funnels through here.
    function onGatesChanged() {
        saveGates();
        if (cache) { extractAll(); return; }
        // Mid-read edits need no restart: done() → extractAll() reads the
        // latest gates. Restarting here threw the whole STFT away per edit.
        if (enabled && !analysing) buildCache(false);
        else updateLaneLists();
    }

    // ─── STATUS TEXT ────────────────────────────────────────────────
    var statusHosts = [];
    function statusText() {
        if (analysisErr) return analysisErr;
        if (analysing) return 'Reading track… ' + Math.round(analysisPct * 100) + '%';
        if (!window.audioReactive || !window.audioReactive.getFileBuffer || !window.audioReactive.getFileBuffer()) {
            return 'No track loaded';
        }
        if (!gateStore.gates.length) return 'Draw a band to make a lane';
        if (!chart) return 'Ready';
        return chart.lanes.length + (chart.lanes.length === 1 ? ' lane · ' : ' lanes · ')
             + chart.notes.length + ' cues';
    }
    function refreshStatus() {
        var t = statusText();
        for (var i = statusHosts.length - 1; i >= 0; i--) {
            if (!statusHosts[i].isConnected) { statusHosts.splice(i, 1); continue; }
            if (statusHosts[i].textContent !== t) statusHosts[i].textContent = t;
        }
    }

    // ─── FLOATING PANEL ─────────────────────────────────────────────
    var DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    var MIN_W = 190, MIN_H = 170;

    function panelZoom() {
        try {
            var z = parseFloat(getComputedStyle(panel).zoom);
            return (isFinite(z) && z > 0) ? z : 1;
        } catch (_) { return 1; }
    }

    function ensurePanel() {
        if (panel && panel.isConnected) return panel;
        panel = null;   // node was torn out of the DOM — build a fresh one
        panel = document.createElement('div');
        panel.id = 'audioTimingPanel';
        panel.className = 'atv-panel';
        // Portaled to body, so the panel tint has to be declared here or it
        // falls back to the grey :root one (see the button-colour system).
        panel.dataset.group = 'expressive';
        var rz = '';
        for (var i = 0; i < DIRS.length; i++) rz += '<div class="atv-rz atv-rz-' + DIRS[i] + '" data-dir="' + DIRS[i] + '"></div>';
        panel.innerHTML =
            '<div class="atv-head">' +
                '<span class="atv-grip" aria-hidden="true">⁙</span>' +
                '<span class="atv-title">Timing</span>' +
                '<span class="atv-status"></span>' +
                '<button type="button" class="atv-close" title="Hide the timing chart">✕</button>' +
            '</div>' +
            '<canvas class="atv-canvas"></canvas>' + rz;
        document.body.appendChild(panel);

        cv = panel.querySelector('.atv-canvas');
        headStatus = panel.querySelector('.atv-status');
        statusHosts.push(headStatus);

        // The chart body is where your eyes live while practising, so its
        // clicks do the obvious transport things instead of nothing:
        // click = play/pause, wheel = stretch/shrink the lead window.
        cv.title = 'Click: play / pause · wheel: zoom the time window';
        cv.addEventListener('click', function () {
            var ar = window.audioReactive;
            if (ar && ar.togglePlay && ar.getFileBuffer && ar.getFileBuffer()) ar.togglePlay();
        });
        cv.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            opts.lead = clamp(opts.lead + (ev.deltaY > 0 ? 0.2 : -0.2), 0.6, 8);
            saveOpts();
            updateSliderDisplays();
        }, { passive: false });

        var r = loadRect();
        var defW = 300, defH = 420;
        panel.style.width  = Math.max(MIN_W, (r && r.width)  || defW) + 'px';
        panel.style.height = Math.max(MIN_H, (r && r.height) || defH) + 'px';
        panel.style.left = ((r && typeof r.left === 'number') ? r.left
                            : Math.max(12, window.innerWidth - defW - 340)) + 'px';
        panel.style.top  = ((r && typeof r.top === 'number') ? r.top : 96) + 'px';
        clampIntoView();

        panel.querySelector('.atv-close').addEventListener('click', function () {
            // The checkbox is the feature's one source of truth — go through it
            // so the sidebar can never disagree with what is on screen.
            var cb = document.getElementById('audioTimingToggle');
            if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
            else disable();
        });

        try {
            if (typeof Draggable !== 'undefined') {
                new Draggable(panel, {
                    handle: panel.querySelector('.atv-head'),
                    constrainToViewport: true,
                    onDragEnd: saveRect
                });
            }
        } catch (_) {}
        wireResize();
        return panel;
    }

    function clampIntoView() {
        if (!panel) return;
        var z = panelZoom();
        var w = (parseFloat(panel.style.width) || MIN_W) * z;
        var h = (parseFloat(panel.style.height) || MIN_H) * z;
        var l = clamp(parseFloat(panel.style.left) || 0, 0, Math.max(0, (window.innerWidth - w) / z));
        var t = clamp(parseFloat(panel.style.top) || 0, 0, Math.max(0, (window.innerHeight - h) / z));
        panel.style.left = l + 'px';
        panel.style.top = t + 'px';
    }

    function wireResize() {
        var dir = null, startRect = null, sx = 0, sy = 0, pid = null;
        function onMove(ev) {
            if (!dir || (pid !== null && ev.pointerId !== pid)) return;
            ev.preventDefault();
            var z = panelZoom();
            var dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
            var l = startRect.left, t = startRect.top, w = startRect.width, h = startRect.height;
            if (dir.indexOf('n') >= 0) { t = startRect.top + dy;  h = startRect.height - dy; }
            if (dir.indexOf('s') >= 0) { h = startRect.height + dy; }
            if (dir.indexOf('w') >= 0) { l = startRect.left + dx; w = startRect.width - dx; }
            if (dir.indexOf('e') >= 0) { w = startRect.width + dx; }
            // Pin the far edge when a min-size drag runs out of room, or the
            // panel walks across the screen instead of stopping.
            if (w < MIN_W) { if (dir.indexOf('w') >= 0) l = startRect.left + (startRect.width - MIN_W); w = MIN_W; }
            if (h < MIN_H) { if (dir.indexOf('n') >= 0) t = startRect.top + (startRect.height - MIN_H); h = MIN_H; }
            panel.style.left = l + 'px'; panel.style.top = t + 'px';
            panel.style.width = w + 'px'; panel.style.height = h + 'px';
        }
        function onEnd(ev) {
            if (pid !== null && ev && ev.pointerId !== undefined && ev.pointerId !== pid) return;
            dir = null; pid = null;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onEnd);
            document.removeEventListener('pointercancel', onEnd);
            clampIntoView();
            saveRect();
        }
        panel.querySelectorAll('.atv-rz').forEach(function (h) {
            h.style.touchAction = 'none';
            h.addEventListener('pointerdown', function (ev) {
                if (ev.pointerType === 'mouse' && ev.button !== 0) return;
                ev.preventDefault(); ev.stopPropagation();
                dir = h.dataset.dir;
                pid = ev.pointerId;
                var z = panelZoom(), b = panel.getBoundingClientRect();
                startRect = { left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 0,
                              width: b.width / z, height: b.height / z };
                sx = ev.clientX; sy = ev.clientY;
                document.addEventListener('pointermove', onMove, { passive: false });
                document.addEventListener('pointerup', onEnd);
                document.addEventListener('pointercancel', onEnd);
            });
        });
    }


    // ─── CHART RENDER ───────────────────────────────────────────────
    function firstNoteAtOrAfter(notes, t) {
        var lo = 0, hi = notes.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (notes[mid].t < t) lo = mid + 1; else hi = mid; }
        return lo;
    }

    function roundRect(g, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }

    // Blink the same box in the sidebar gate editor, so the chart and the
    // thing that authored it visibly agree.
    function flashEditor(lane) {
        try { if (window.AudioScenes && window.AudioScenes.flashGate) window.AudioScenes.flashGate('timing', lane); } catch (_) {}
    }

    function render() {
        rafId = requestAnimationFrame(render);
        if (!enabled || !panel || !cv || !cv.isConnected) return;
        var now = performance.now();
        if (now - lastRenderMs < 14) return;   // rAF is uncapped in the Electron build
        lastRenderMs = now;

        stepGateAnims(now);

        var box = cv.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) return;
        var dpr = window.devicePixelRatio || 1;
        var W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        var g = cv.getContext('2d');
        g.clearRect(0, 0, W, H);
        g.fillStyle = '#05070c';
        g.fillRect(0, 0, W, H);

        var fs = Math.max(9 * dpr, Math.round(H * 0.032));
        var ar = window.audioReactive;
        var pos = (ar && ar.position) ? ar.position() : null;

        if (!chart || !chart.lanes.length || !pos) {
            g.fillStyle = 'rgba(255,255,255,0.42)';
            g.font = fs + 'px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            var msg = analysing ? 'Reading the track… ' + Math.round(analysisPct * 100) + '%'
                    : analysisErr ? analysisErr
                    : !pos ? 'Load an audio file to chart it'
                    : 'Draw a band in Audio to make a lane';
            g.fillText(msg, W / 2, H / 2);
            if (analysing) {
                var bw = W * 0.5, bx = (W - bw) / 2, by = H / 2 + fs * 1.6;
                g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(bx, by, bw, 3 * dpr);
                g.fillStyle = 'rgba(120,200,255,0.9)'; g.fillRect(bx, by, bw * analysisPct, 3 * dpr);
            }
            return;
        }

        var lanes = chart.lanes, nL = lanes.length;
        var lead = opts.lead;
        var tNow = pos.time + opts.offsetMs / 1000;
        var pad = Math.max(3 * dpr, W * 0.012);
        var labelH = fs * 1.9;
        var topY = pad;
        var hitY = H - labelH - Math.max(10 * dpr, H * 0.05);
        var travel = hitY - topY;
        var laneW = (W - pad * 2) / nL;
        var barW = laneW - Math.max(2 * dpr, laneW * 0.14);

        // Lane beds + the depth ruler (one faint line per half second of lead).
        // The lane whose gate box is being edited (or row hovered) GLOWS, so
        // the box in the sidebar and the column it feeds read as one thing.
        for (var i = 0; i < nL; i++) {
            var lx = pad + i * laneW;
            var c = lanes[i].color;
            var glow = (i === glowLane);
            var pulse = glow ? 0.5 + 0.5 * Math.sin(now / 140) : 0;
            var grad = g.createLinearGradient(0, topY, 0, hitY);
            grad.addColorStop(0, rgba(c, glow ? 0.08 + 0.05 * pulse : 0.015));
            grad.addColorStop(1, rgba(c, glow ? 0.26 + 0.10 * pulse : 0.10));
            g.fillStyle = grad;
            var bedX = lx + (laneW - barW) / 2 - 2 * dpr, bedW = barW + 4 * dpr;
            g.fillRect(bedX, topY, bedW, hitY - topY);
            if (glow) {
                g.strokeStyle = rgba(c, 0.45 + 0.30 * pulse);
                g.lineWidth = Math.max(1, dpr);
                g.strokeRect(bedX + 0.5, topY + 0.5, bedW - 1, hitY - topY - 1);
            }
        }
        g.fillStyle = 'rgba(255,255,255,0.05)';
        for (var s = 0.5; s < lead; s += 0.5) {
            var ry = hitY - (s / lead) * travel;
            g.fillRect(pad, Math.round(ry), W - pad * 2, Math.max(1, dpr * 0.5));
        }

        // Cue bars. Only the window [tNow - tail, tNow + lead] is walked, found
        // by binary search — a long track holds thousands of cues and this runs
        // every frame beside the sim. Beat-lane ticks draw OUTLINED, so a
        // machine-locked grid reads differently from detected hits.
        var TAIL = 0.28;
        var notes = chart.notes, dur = chart.duration || pos.duration || 0;
        if (lastSeenTime < 0 || tNow < lastSeenTime - 0.5) lastSeenTime = tNow;   // seek / loop wrap

        function drawBar(lane, x, y, w, h, alpha) {
            var col = lanes[lane].color;
            roundRect(g, x, y, w, h, Math.min(4 * dpr, h / 2));
            if (lanes[lane].method === 'beat') {
                g.fillStyle = rgba(col, 0.06 + 0.14 * alpha);
                g.fill();
                g.strokeStyle = rgba(col, 0.30 + 0.60 * alpha);
                g.lineWidth = Math.max(1, 1.2 * dpr);
                g.stroke();
            } else {
                g.fillStyle = rgba(col, 0.30 + 0.55 * alpha);
                g.fill();
                g.fillStyle = rgba([255, 255, 255], 0.16 + 0.5 * alpha);
                g.fillRect(x, y + h - Math.max(1, dpr * 1.5), w, Math.max(1, dpr * 1.5));
            }
        }

        function drawWindow(shift) {
            var idx = firstNoteAtOrAfter(notes, tNow - TAIL - shift);
            for (; idx < notes.length; idx++) {
                var n = notes[idx];
                var nt = n.t + shift;
                var d = nt - tNow;
                if (d > lead) break;
                if (n.lane >= nL) continue;
                var lx2 = pad + n.lane * laneW + (laneW - barW) / 2;
                var bw2 = barW;
                if (n.p !== undefined) {
                    // Pitch cue: a narrow bar whose position across the lane
                    // IS the note height — the melody falls as a contour.
                    bw2 = Math.max(4 * dpr, barW * 0.34);
                    lx2 += n.p * (barW - bw2);
                }
                var hgt = clamp(travel * 0.035, 5 * dpr, 30 * dpr) * (0.55 + 0.45 * clamp(n.e, 0, 1));
                if (d >= 0) {
                    var y = hitY - (d / lead) * travel - hgt;
                    // Fade in over the first tenth of the run — long enough
                    // that cues arrive rather than pop, short enough that a
                    // re-extract after a box edit reads as instant.
                    var a = clamp((1 - d / lead) * 10, 0, 1);
                    drawBar(n.lane, lx2, y, bw2, hgt, a);
                } else {
                    // Past the line: keep falling and fade, so a hit reads as
                    // struck rather than deleted.
                    var k2 = -d / TAIL;
                    var y2 = hitY + k2 * (H - hitY) * 0.8;
                    drawBar(n.lane, lx2, y2 - hgt, bw2, hgt, 0.55 * (1 - k2));
                    if (nt > lastSeenTime) { laneFlash[n.lane] = now; flashEditor(n.lane); }
                }
            }
        }
        drawWindow(0);
        // A short loop with a long lead spans several laps — draw them all
        // (capped), or the top of the chart sits empty and bars materialise
        // mid-air. The -dur lap keeps just-struck bars falling through the
        // first TAIL seconds after a wrap.
        if (pos.loop && dur) {
            for (var sh = dur, laps = 0; sh < tNow + lead && laps < 8; sh += dur, laps++) drawWindow(sh);
            if (tNow < TAIL) drawWindow(-dur);
        }
        lastSeenTime = tNow;

        // Hit line — one segment per lane so it can flash independently
        for (var j = 0; j < nL; j++) {
            var hx = pad + j * laneW + (laneW - barW) / 2;
            var fl = clamp(1 - (now - (laneFlash[j] || 0)) / 220, 0, 1);
            var cc = lanes[j].color;
            g.fillStyle = rgba(cc, 0.35 + 0.6 * fl);
            g.fillRect(hx, hitY - Math.max(1, dpr), barW, Math.max(2 * dpr, 2));
            if (fl > 0) {
                g.fillStyle = rgba([255, 255, 255], 0.5 * fl);
                g.fillRect(hx, hitY - Math.max(1, dpr), barW, Math.max(2 * dpr, 2));
                var gh = travel * 0.16 * fl;
                var gr = g.createLinearGradient(0, hitY - gh, 0, hitY);
                gr.addColorStop(0, rgba(cc, 0));
                gr.addColorStop(1, rgba(cc, 0.30 * fl));
                g.fillStyle = gr;
                g.fillRect(hx, hitY - gh, barW, gh);
            }
            // Band label under the line; a beat lane shows the tempo it
            // locked instead (the band itself is on the sidebar row).
            // FIT the text to its lane: sized off panel height alone, labels
            // on a narrow panel overflowed and piled into their neighbours.
            // Shrink to fit; below the legibility floor shorten to the low
            // edge ("250+"); if even that can't fit, no label beats mush.
            var txt = (lanes[j].method === 'beat' && lanes[j].bpm)
                ? '♩ ' + Math.round(lanes[j].bpm)
                : lanes[j].label;
            var maxTw = laneW - 3 * dpr;
            var lfs = fs;
            g.font = lfs + 'px monospace';
            var tw = g.measureText(txt).width;
            if (tw > maxTw) {
                lfs = Math.max(6.5 * dpr, lfs * maxTw / tw);
                g.font = lfs + 'px monospace';
                tw = g.measureText(txt).width;
                if (tw > maxTw) {
                    txt = txt.replace(/–.*$/, '+');
                    if (g.measureText(txt).width > maxTw) txt = '';
                }
            }
            if (txt) {
                // Centred in the strip BELOW the line, on a dark pill: the
                // hit-line glow and struck bars falling past the line were
                // running straight through the text.
                var ly = hitY + (H - hitY) * 0.5;
                var tw2 = g.measureText(txt).width;
                g.fillStyle = 'rgba(5,7,12,0.88)';
                g.fillRect(hx + barW / 2 - tw2 / 2 - 3 * dpr, ly - lfs * 0.66, tw2 + 6 * dpr, lfs * 1.32);
                g.fillStyle = rgba(cc, 0.95);
                g.textAlign = 'center'; g.textBaseline = 'middle';
                g.fillText(txt, hx + barW / 2, ly);
            }
        }

        // Paused reads as deliberate, not broken
        if (pos.paused) {
            g.fillStyle = 'rgba(0,0,0,0.45)';
            g.fillRect(0, 0, W, H);
            g.fillStyle = 'rgba(255,255,255,0.6)';
            g.font = (fs * 1.2) + 'px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('⏸ paused', W / 2, H / 2);
        }
    }

    // ─── DEFAULT LANES ──────────────────────────────────────────────
    // Checking the box with an empty editor would show an empty chart and
    // read as broken, so first use seeds the three bands a drum kit lives
    // in — all on Onset, the accurate default. They are ordinary gate
    // boxes: drag, redraw, delete, or flip their method per lane.
    function hzX(hz) {
        var f = (window.AudioScenes && window.AudioScenes.hzToX01);
        return clamp(f ? f(hz) : Math.log(hz / 20) / Math.LN10 / 3, 0, 1);
    }
    function seedLanes() {
        gateStore.gates = [
            { lo: hzX(40),   hi: hzX(110),   th: 0.55, method: 'onset' },   // kick
            { lo: hzX(250),  hi: hzX(1200),  th: 0.50, method: 'onset' },   // snare / body
            { lo: hzX(6000), hi: hzX(14000), th: 0.42, method: 'onset' }    // hats / transients
        ];
        saveGates();
    }

    // ─── ENABLE / DISABLE ───────────────────────────────────────────
    function enable() {
        if (enabled) return;
        enabled = true;
        if (!gateStore.gates.length) seedLanes();
        ensurePanel();
        panel.style.display = '';
        lastSeenTime = -1;
        if (rafId === null) rafId = requestAnimationFrame(render);
        buildCache(false);
        refreshStatus();
        rebuildAllControls();
    }
    function disable() {
        if (!enabled) return;
        enabled = false;
        if (panel) panel.style.display = 'none';
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        cancelAnalysis();          // an in-flight read of a track nobody is watching
        cancelGateAnims();
        // A long track's cache is ~29 MB of Uint8Array; holding it behind an
        // unchecked box for the rest of the session is rude. Small caches
        // stay (re-enabling is then instant); big ones re-read on demand.
        if (cache && cache.levels && cache.levels.length > 8 * 1024 * 1024) cache = null;
        refreshStatus();
        rebuildAllControls();
    }

    // ─── THRESHOLD CALIBRATION ──────────────────────────────────────
    // What edge does THIS track want for THIS band and THIS method? All of
    // it reads the cached spectrogram, so it costs milliseconds:
    //   level — the 88th percentile of band level: the lane fires on the
    //           loudest ~12% of moments, not on a number picked blind.
    //   beat/pitch — percentile mute-floors over the band's ACTIVE frames.
    //   onset — the edge is a sensitivity, so binary-search it until the
    //           lane lands at a musical cue density (~1.6/s).
    // Returns null for a band with nothing in it — an honest quiet lane
    // beats an edge dragged to the floor.
    function bandLevelSeries(cc, g) {
        var cr = colRange(g, cc.cols), c0 = cr[0], c1 = cr[1];
        var out = new Float32Array(cc.frames);
        for (var f = 0; f < cc.frames; f++) out[f] = bandLevelAt(cc, f, c0, c1);
        return out;
    }
    function pctl(sorted, q) {
        if (!sorted.length) return 0;
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    }
    function calibrateTh(cc, g, method) {
        var lvls = bandLevelSeries(cc, g);
        var act = [];
        for (var i = 0; i < lvls.length; i++) if (lvls[i] > 0.05) act.push(lvls[i]);
        if (act.length < lvls.length * 0.02) return null;   // dead band
        act.sort(function (a, b) { return a - b; });
        if (method === 'level') {
            if (pctl(act, 0.98) < 0.12) return null;
            return clamp(pctl(act, 0.88) + 0.02, 0.10, 0.92);
        }
        if (method === 'beat')  return clamp(pctl(act, 0.25), 0.05, 0.55);
        if (method === 'pitch') return clamp(pctl(act, 0.22), 0.08, 0.60);
        // onset — density search (extraction is ~1 ms, 9 probes are free).
        // The target rate comes from the band's OWN pulse, not a constant:
        // a fixed 1.6/s starved fast material (it cut half the hats on a
        // 2/s pattern, and a tarantella runs faster still) and drowned slow
        // material in bleed. Tempo detection already exists — use it.
        var dur = Math.max(1, cc.duration);
        // Probe the band at a moderate edge and keep ~90% of what it finds:
        // the edge climbs as high as it can WITHOUT cutting real events.
        // (Band tempo was tried and mistargets: a kick band hears the global
        // 2/s grid even when kicks land at 1/s.)
        // 0.95, not lower: for a timing aid, cutting a real hit is worse
        // than keeping a neighbour's splash — the splash is still music.
        var probe = extractOnset(cc, { lo: g.lo, hi: g.hi, th: 0.45 }).length / dur;
        var TARGET = clamp(Math.max(1.2, probe * 0.95), 0.7, 6);
        var lo = 0.05, hi = 0.95;
        var rate = extractOnset(cc, { lo: g.lo, hi: g.hi, th: lo }).length / dur;
        if (rate < 0.25) return null;                        // nothing to find
        for (var k = 0; k < 9; k++) {
            var mid = (lo + hi) / 2;
            rate = extractOnset(cc, { lo: g.lo, hi: g.hi, th: mid }).length / dur;
            if (rate > TARGET) lo = mid; else hi = mid;
        }
        return clamp((lo + hi) / 2, 0.05, 0.95);
    }

    // ── Eased gate animation (the settle) ───────────────────────────
    // Rather than snapping, a calibrated gate GLIDES to its analyzed value —
    // the box edge sinks in the editor, the lane glows, and because
    // extraction is instant the chart visibly re-fills under the moving
    // line. Staggered per lane so they settle as a cascade.
    var anims = [];          // [{ g, to:{lo?,hi?,th?}, from, start, dur }]
    var lastAnimExtract = 0;
    function queueGateAnim(g, to, delayMs) {
        for (var i = anims.length - 1; i >= 0; i--) if (anims[i].g === g) anims.splice(i, 1);
        // A backgrounded tab pauses rAF — apply instantly there, the show
        // only matters when someone is watching.
        if (document.hidden) {
            for (var k in to) g[k] = to[k];
            saveGates(); if (cache) extractAll();
            return;
        }
        anims.push({ g: g, to: to, from: null, start: performance.now() + (delayMs || 0), dur: 620 });
    }
    function cancelGateAnims() { anims = []; }
    function stepGateAnims(now) {
        if (!anims.length) return;
        var moved = false, finished = false;
        for (var i = anims.length - 1; i >= 0; i--) {
            var a = anims[i];
            var idx = gateStore.gates.indexOf(a.g);
            if (idx < 0) { anims.splice(i, 1); continue; }   // lane deleted / replaced mid-glide
            if (now < a.start) continue;
            if (!a.from) {
                a.from = {};
                for (var k in a.to) a.from[k] = a.g[k];
            }
            var t = clamp((now - a.start) / a.dur, 0, 1);
            var e = 1 - Math.pow(1 - t, 3);                  // cubic ease-out
            for (k in a.to) a.g[k] = a.from[k] + (a.to[k] - a.from[k]) * e;
            glowLane = idx;                                  // the settling lane glows
            moved = true;
            if (t >= 1) { anims.splice(i, 1); finished = true; }
        }
        if (finished || (moved && now - lastAnimExtract > 80)) {
            lastAnimExtract = now;
            saveGates();
            if (cache) extractAll();
        }
        if (!anims.length) glowLane = -1;
    }

    // Ease every lane whose threshold the user has NOT claimed onto its
    // analyzed value. force=true (the Fit button) recalibrates everything.
    function autoFit(force) {
        if (!cache) return 0;
        var n = 0;
        for (var i = 0; i < gateStore.gates.length; i++) {
            var g = gateStore.gates[i];
            if (!force && g.uth) continue;
            var target = calibrateTh(cache, g, laneMethod(g));
            if (target === null || Math.abs(target - g.th) < 0.02) continue;
            if (force) delete g.uth;
            queueGateAnim(g, { th: target }, n * 300);
            n++;
        }
        return n;
    }

    // ─── AUTO LANES ───────────────────────────────────────────────────
    // Where does this track actually move? Sum positive per-column flux
    // over the whole run, smooth it, then WHITEN it — divide by a broadly
    // smoothed copy — so a peak means ‘busier than its neighbourhood’,
    // not ‘louder than the treble’ (raw flux always crowns the lows and
    // the hats never got a lane). Greedy top-3 with the claimed region
    // knocked out, expansion clipped against prior claims so lanes can’t
    // overlap. The bottom ~35 Hz of the axis is skipped: FFT-bin clamping
    // pools everything below one bin into those columns and fakes a peak.
    function autoLanes(cc) {
        var L = cc.levels, cols = cc.cols, F = cc.frames;
        var act = new Float64Array(cols);
        for (var f = 1; f < F; f++) {
            var base = f * cols, prev = base - cols;
            for (var c = 0; c < cols; c++) {
                var d = L[base + c] - L[prev + c];
                // > 2, not > 0: byte-quantization dither (±1 count) integrated
                // over a whole track outweighs real events on steady material
                // and minted phantom lanes out of the noise floor.
                if (d > 2) act[c] += d;
            }
        }
        var C0 = Math.round(cols * 0.081);   // ~35 Hz on the 20 Hz–20 kHz log axis
        function boxSmooth(src, w) {
            var out = new Float64Array(cols);
            for (var c2 = 0; c2 < cols; c2++) {
                var s2 = 0, n2 = 0;
                for (var k = Math.max(C0, c2 - w); k <= Math.min(cols - 1, c2 + w); k++) { s2 += src[k]; n2++; }
                out[c2] = n2 ? s2 / n2 : 0;
            }
            return out;
        }
        var sm = boxSmooth(act, 4);
        var broad = boxSmooth(act, 30);
        var globalMax = 0, c;
        for (c = C0; c < cols; c++) if (sm[c] > globalMax) globalMax = sm[c];
        if (globalMax <= 0) return [];
        var rel = new Float64Array(cols);
        for (c = C0; c < cols; c++) rel[c] = sm[c] / (broad[c] + globalMax * 0.02);

        var taken = new Uint8Array(cols);
        for (c = 0; c < C0; c++) taken[c] = 1;
        var out = [];
        for (var lane = 0; lane < 3; lane++) {
            var best = -1, bv = 0;
            for (c = C0; c < cols; c++) if (!taken[c] && rel[c] > bv) { bv = rel[c]; best = c; }
            // A whitened peak below ~5% absolute activity is silence with a
            // good ratio — not worth a lane.
            if (best < 0 || sm[best] < globalMax * 0.05) break;
            var peak = sm[best];
            var lo = best, hi = best;
            while (lo > C0 && !taken[lo - 1] && sm[lo - 1] > peak * 0.25) lo--;
            while (hi < cols - 1 && !taken[hi + 1] && sm[hi + 1] > peak * 0.25) hi++;
            // A lane needs some width to grab — grow it, but never into a
            // claimed column, and never wider than a quarter of the axis.
            while (hi - lo < 8) {
                var grew = false;
                if (lo > C0 && !taken[lo - 1]) { lo--; grew = true; }
                if (hi - lo < 8 && hi < cols - 1 && !taken[hi + 1]) { hi++; grew = true; }
                if (!grew) break;
            }
            if (hi - lo > 64) {
                var mid = best;
                lo = Math.max(lo, mid - 32); hi = Math.min(hi, mid + 32);
            }
            out.push({ lo: Math.max(0, lo / cols), hi: Math.min(1, (hi + 1) / cols), th: 0.5, method: 'onset' });
            for (c = Math.max(0, lo - 8); c <= Math.min(cols - 1, hi + 8); c++) taken[c] = 1;
        }
        out.sort(function (a, b) { return a.lo - b.lo; });
        return out;
    }

    // ─── SIDEBAR CONTROLS ───────────────────────────────────────────
    // A host is built ONCE into a stable skeleton (file row, editor, lane
    // list, sliders, foot); every later gate/method/file change refreshes
    // only the dynamic parts. Rebuilding wholesale on each edit would tear
    // the gate editor's canvas out mid-gesture and restart its draw loop.
    var controlHosts = [];
    function rebuildAllControls() {
        for (var i = controlHosts.length - 1; i >= 0; i--) {
            if (!controlHosts[i].isConnected) { controlHosts.splice(i, 1); continue; }
            fillControls(controlHosts[i]);
        }
    }
    function updateLaneLists() {
        for (var i = controlHosts.length - 1; i >= 0; i--) {
            if (!controlHosts[i].isConnected) { controlHosts.splice(i, 1); continue; }
            updateDynamic(controlHosts[i]);
        }
    }

    function slider(host, label, unit, min, max, step, get, set, fmt) {
        var g = document.createElement('div');
        g.className = 'control-group';
        var l = document.createElement('label');
        var v = document.createElement('span');
        v.className = 'value-display';
        l.textContent = label + ' ';
        l.appendChild(v);
        var input = document.createElement('input');
        input.type = 'range';
        input.min = min; input.max = max; input.step = step;
        input.value = get();
        input.setAttribute('data-no-scale', '1');
        var show = function () { v.textContent = fmt(parseFloat(input.value)) + unit; };
        show();
        input.addEventListener('input', function () { set(parseFloat(input.value)); show(); });
        g.appendChild(l); g.appendChild(input);
        host.appendChild(g);
        return { input: input, refresh: function () { input.value = get(); show(); } };
    }

    // Sync every mounted Lead/Nudge slider with opts — the wheel gesture and
    // the console setters change opts without touching the DOM.
    function updateSliderDisplays() {
        for (var i = 0; i < controlHosts.length; i++) {
            var els = controlHosts[i]._atvEls;
            if (!els) continue;
            if (els.leadCtl) els.leadCtl.refresh();
            if (els.nudgeCtl) els.nudgeCtl.refresh();
        }
    }

    function fillControls(host) {
        host.innerHTML = '';
        host._atvEls = null;
        if (!enabled) { host.style.display = 'none'; return; }
        host.style.display = '';

        // (The Choose Track button lives up in the Audio enable row, beside
        // the source select — one uploader, one decoded buffer, one clock.)

        // The gate editor — borrowed whole from 30-audio-scenes so the boxes
        // here behave exactly like the ones that drive a scene. Each box IS
        // a lane; the rows below pick how it listens.
        var gr = document.createElement('div');
        gr.className = 'control-group audio-gates-row';
        var lbl = document.createElement('label');
        lbl.textContent = 'Lanes';
        gr.appendChild(lbl);
        var ed = document.createElement('canvas');
        ed.className = 'audio-gates-editor';
        ed.title = 'Drag a box: width = the frequency band, top edge = threshold / sensitivity. Each box is one lane.';
        gr.appendChild(ed);
        if (window.AudioScenes && window.AudioScenes.mountGatesEditor) {
            window.AudioScenes.mountGatesEditor(ed, gateStore, 'gates', function () {
                onGatesChanged();
            }, 'timing', {
                onEditActive: function (i) {
                    if (i !== null && i !== undefined) cancelGateAnims();   // hands beat automation
                    glowLane = (i === null || i === undefined) ? -1 : i;
                }
            });
            var btnRow = document.createElement('div');
            btnRow.className = 'atv-gate-btns';
            if (window.AudioScenes.gateClearButton) {
                btnRow.appendChild(window.AudioScenes.gateClearButton(function () {
                    gateStore.gates = [];
                    onGatesChanged();
                }));
            }
            // ✨ Auto: scan the cached spectrogram for the most active
            // distinct bands and lay lanes on them — zero-setup charting.
            var autoBtn = document.createElement('button');
            autoBtn.type = 'button';
            autoBtn.className = 'atv-auto';
            autoBtn.textContent = '✨ Auto';
            autoBtn.title = 'Find the most active frequency bands in this track and set the lanes on them (replaces the current lanes)';
            autoBtn.addEventListener('click', function () {
                if (!cache) {
                    // Say WHY nothing happened; buildCache clears this the
                    // moment a track actually gets read.
                    analysisErr = analysing ? 'Still reading the track…' : 'Load a track first';
                    refreshStatus();
                    return;
                }
                analysisErr = '';
                var found = autoLanes(cache);
                if (!found.length) { analysisErr = 'No active bands found'; refreshStatus(); return; }
                cancelGateAnims();
                // MORPH instead of replace: existing boxes glide across the
                // spectrum onto the found bands (with calibrated edges), the
                // chart re-filling under them. Extra lanes pop in, surplus
                // lanes drop immediately.
                var gates = gateStore.gates;
                while (gates.length > found.length) gates.pop();
                for (var i = 0; i < found.length; i++) {
                    var tgt = found[i];
                    var cal = calibrateTh(cache, tgt, 'onset');
                    if (cal !== null) tgt.th = cal;
                    if (i < gates.length) {
                        var g = gates[i];
                        g.method = 'onset';
                        delete g.uth;
                        queueGateAnim(g, { lo: tgt.lo, hi: tgt.hi, th: tgt.th }, i * 300);
                    } else {
                        gates.push(tgt);
                    }
                }
                onGatesChanged();
            });
            btnRow.appendChild(autoBtn);
            // ⟳ Fit: keep the bands, ease every edge onto this track's
            // analyzed levels — the cure for a threshold left over from a
            // very different song.
            var fitBtn = document.createElement('button');
            fitBtn.type = 'button';
            fitBtn.className = 'atv-fit';
            fitBtn.textContent = '⟳ Fit';
            fitBtn.title = 'Ease each lane’s edge to fit this track (bands stay put)';
            fitBtn.addEventListener('click', function () {
                if (!cache) {
                    analysisErr = analysing ? 'Still reading the track…' : 'Load a track first';
                    refreshStatus(); return;
                }
                analysisErr = '';
                if (!autoFit(true)) { analysisErr = 'Edges already fit'; refreshStatus(); }
            });
            btnRow.appendChild(fitBtn);
            gr.appendChild(btnRow);
        }
        host.appendChild(gr);

        // Lane rows — the per-lane frontend: colour, band, method, cue
        // count, delete. Rebuilt in place on every extraction.
        var laneList = document.createElement('div');
        laneList.className = 'atv-lanes';
        // The rows are rebuilt on every extraction, which detaches whichever
        // row the pointer was over — its pointerleave then never fires and
        // the glow sticks. The CONTAINER survives rebuilds, so it owns the
        // reset.
        laneList.addEventListener('pointerleave', function () { glowLane = -1; });
        host.appendChild(laneList);

        var leadCtl = slider(host, 'Lead', 's', 0.6, 8, 0.1,
            function () { return opts.lead; },
            function (v) { opts.lead = v; saveOpts(); },
            function (v) { return v.toFixed(1); });

        var nudgeCtl = slider(host, 'Nudge', 'ms', -300, 300, 5,
            function () { return opts.offsetMs; },
            function (v) { opts.offsetMs = v; saveOpts(); },
            function (v) { return (v > 0 ? '+' : '') + v.toFixed(0); });

        var foot = document.createElement('div');
        foot.className = 'atv-foot';
        var st = document.createElement('span');
        st.className = 'atv-status-text';
        statusHosts.push(st);
        foot.appendChild(st);
        var re = document.createElement('button');
        re.type = 'button';
        re.className = 'atv-reread';
        re.textContent = 'Re-read';
        re.title = 'Read the track again from scratch';
        re.addEventListener('click', function () { buildCache(true); });
        foot.appendChild(re);
        host.appendChild(foot);

        host._atvEls = { laneList: laneList, leadCtl: leadCtl, nudgeCtl: nudgeCtl };
        updateDynamic(host);
        refreshStatus();
    }

    function updateDynamic(host) {
        var els = host._atvEls;
        if (!els) return;
        buildLaneRows(els.laneList);
        refreshStatus();
    }

    function buildLaneRows(list) {
        list.innerHTML = '';
        var gates = gateStore.gates;
        if (!gates.length) {
            var hint = document.createElement('div');
            hint.className = 'atv-lane-hint';
            hint.textContent = 'Draw a box above to add a lane';
            list.appendChild(hint);
            return;
        }
        gates.forEach(function (g, i) {
            var m = laneMethod(g);
            var lane = (chart && chart.lanes && chart.lanes[i]) ? chart.lanes[i] : null;
            var row = document.createElement('div');
            row.className = 'atv-lane';
            // Hovering the row lights its column in the chart — same signal
            // as grabbing the box in the editor.
            row.addEventListener('pointerenter', function () { glowLane = i; });
            row.addEventListener('pointerleave', function () { if (glowLane === i) glowLane = -1; });

            var dot = document.createElement('span');
            dot.className = 'atv-dot';
            dot.style.background = rgba(laneColor(g), 1);   // a swatch, not a button
            row.appendChild(dot);

            var lbl = document.createElement('span');
            lbl.className = 'atv-lane-label';
            lbl.textContent = laneLabel(g) + ' Hz';
            lbl.title = 'This lane’s frequency band — redraw the box above to change it';
            row.appendChild(lbl);

            var mb = document.createElement('button');
            mb.type = 'button';
            mb.className = 'atv-method';
            mb.textContent = METHOD_LABEL[m] + (m === 'beat' && lane && lane.bpm ? ' ♩' + Math.round(lane.bpm) : '');
            mb.title = METHOD_TIP[m] + ' Click to switch.';
            mb.addEventListener('click', function () {
                g.method = METHODS[(METHODS.indexOf(m) + 1) % METHODS.length];
                onGatesChanged();
                // The right edge differs per method (a level threshold and an
                // onset sensitivity are different animals) — re-settle it,
                // unless the user owns this edge.
                if (!g.uth && cache) {
                    var target = calibrateTh(cache, g, laneMethod(g));
                    if (target !== null && Math.abs(target - g.th) >= 0.02) queueGateAnim(g, { th: target }, 0);
                }
            });
            row.appendChild(mb);

            var cnt = document.createElement('span');
            cnt.className = 'atv-lane-count';
            cnt.textContent = lane ? String(lane.count) : '–';
            cnt.title = 'Cues on this lane';
            row.appendChild(cnt);

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'atv-lane-del';
            del.textContent = '✕';
            del.title = 'Remove this lane';
            del.addEventListener('click', function () {
                glowLane = -1;   // the hovered row is about to be destroyed
                gates.splice(i, 1);
                onGatesChanged();
            });
            row.appendChild(del);

            list.appendChild(row);
        });
    }

    // ─── WIRING ─────────────────────────────────────────────────────
    window.addEventListener('resize', function () { if (panel) clampIntoView(); });

    document.addEventListener('DOMContentLoaded', function () {
        if (window.audioReactive && window.audioReactive.onSourceChange) {
            window.audioReactive.onSourceChange(function () {
                if (!enabled) return;
                // buildCache keys on the file: a new track re-reads, the same
                // track just re-extracts, mic/off clears the chart.
                lastSeenTime = -1;
                buildCache(false);
                updateLaneLists();
            });
        }
    });

    // ─── PUBLIC API ─────────────────────────────────────────────────
    var AT = {
        enable: enable,
        disable: disable,
        toggle: function (on) { if (on === undefined) on = !enabled; if (on) enable(); else disable(); return enabled; },
        isEnabled: function () { return enabled; },
        // Called by 20-mixer-layout to fill the row under the checkbox.
        mountControls: function (host) {
            if (!host) return;
            if (controlHosts.indexOf(host) < 0) controlHosts.push(host);
            fillControls(host);
        },
        status: statusText,
        // Console handles for tuning a take
        setLead: function (s) { opts.lead = clamp(Number(s) || 2.2, 0.6, 8); saveOpts(); updateSliderDisplays(); return opts.lead; },
        setNudge: function (ms) { opts.offsetMs = clamp(Number(ms) || 0, -500, 500); saveOpts(); updateSliderDisplays(); return opts.offsetMs; },
        setMethod: function (i, m) {
            var g = gateStore.gates[i];
            if (!g || METHODS.indexOf(m) < 0) return false;
            g.method = m;
            onGatesChanged();
            return true;
        },
        methods: METHODS.slice(),
        gates: function () { return gateStore.gates; },
        chart: function () { return chart; },
        reread: function () { buildCache(true); },
        lastExtractMs: 0,
        // Deterministic hooks for the offline test harness — everything the
        // regression suite needs to run the maths without a DOM or a worker.
        _test: {
            kernel: spectrogramKernel,
            colRange: colRange, bandFlux: bandFlux, bandLevelAt: bandLevelAt,
            extractLevel: extractLevel, extractOnset: extractOnset, extractBeat: extractBeat,
            extractPitch: extractPitch, autoLanes: autoLanes,
            calibrateTh: calibrateTh, autoFit: autoFit,
            extractAll: extractAll,
            getCache: function () { return cache; },
            setCache: function (c) { cache = c; },
            consts: { FFT_SIZE: FFT_SIZE, HOP: HOP, SMOOTHING: SMOOTHING, MIN_DB: MIN_DB, MAX_DB: MAX_DB, SPEC_COLS: SPEC_COLS }
        }
    };
    window.AudioTiming = AT;
})();
