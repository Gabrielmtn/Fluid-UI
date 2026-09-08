// Multi-Format Export System
// Supports: Video (WebM), GIF (inline encoder), PNG/JPG stills, PNG sequences
// Zero external dependencies — GIF encoder is fully inline
(function () {
    'use strict';

    // ── Environment ─────────────────────────────────────────────────
    const isElectron = typeof require !== 'undefined' &&
        typeof process !== 'undefined' && process.versions && process.versions.electron;
    let fs, path, shell;
    if (isElectron) {
        try { fs = require('fs'); path = require('path'); shell = require('electron').shell; }
        catch (e) { console.warn('[Export] Electron modules not available'); }
    }

    // ── State ───────────────────────────────────────────────────────
    let _busy = false;
    let _abort = false;
    let _recorder = null;   // MediaRecorder ref (video only)
    let _stream = null;     // MediaStream ref   (video only)

    // ── Config ──────────────────────────────────────────────────────
    const DEFAULTS = {
        videoFPS: 60,
        videoDuration: 15000,
        videoBitrate: 8000000,
        gifFPS: 15,
        gifDuration: 3000,
        gifMaxWidth: 640,
        imageFormat: 'png',
        imageQuality: 0.95,
        sequenceFPS: 30,
        sequenceDuration: 5000,
        sequenceFormat: 'png',
        outputFolder: '',
        filenamePrefix: 'fluid_',
        compositeOverlays: true
    };
    let cfg = { ...DEFAULTS };

    function loadSettings() {
        if (!window.settingsManager) return;
        var sm = window.settingsManager;
        Object.keys(DEFAULTS).forEach(function (k) {
            cfg[k] = sm.get('export.' + k, DEFAULTS[k]);
        });
    }
    function saveSettings() {
        if (!window.settingsManager) return;
        var sm = window.settingsManager;
        Object.keys(DEFAULTS).forEach(function (k) { sm.set('export.' + k, cfg[k]); });
    }

    // ── Helpers ─────────────────────────────────────────────────────
    // Per-export decoded-image cache (dataURL → Promise<Image|null>). Layer
    // and clip-mask dataURLs are stable across an export, so decoding them
    // once instead of per frame removes the main per-frame GC churn.
    var _imgCache = new Map();
    function getCachedImage(src) {
        var hit = _imgCache.get(src);
        if (hit) return hit;
        var p = new Promise(function (res) {
            var img = new Image();
            img.onload = function () { res(img); };
            img.onerror = function () { res(null); };
            img.src = src;
        });
        _imgCache.set(src, p);
        return p;
    }

    // Composite-cost stats for the export perf budget (D7-3): logged at
    // finish(); a >30ms average means the compositor itself is eating the
    // frame budget and export fps promises are fiction. `capture` times the
    // whole per-frame capture (composite + push to the encoder), which is
    // what the painter actually loses; `composite` is the draw work alone.
    var _compStats = { frames: 0, totalMs: 0, worstMs: 0, capFrames: 0, capTotalMs: 0, capWorstMs: 0 };

    // ── Persistent capture surfaces (2026-09-02) ───────────────────────
    // Every captured frame used to allocate a fresh full-resolution
    // snapshot canvas AND a fresh full-resolution composite canvas (a third
    // for clip masks): 20-30 MB of GPU-backed canvas per frame at 60/s,
    // never reused, so the GC ran every couple of frames on top of the
    // create/destroy churn in the GPU process. Measured on the 4090
    // (1920x1080, stock tier, 144 Hz): a video export put 22% of painted
    // frames 2-4 ticks late. These are allocated once per size and reused;
    // the snapshot is gone entirely — with preserveDrawingBuffer:true (04a)
    // and the composite happening in the same task as the render, the
    // WebGL buffer cannot change under us, so the sim is drawn straight
    // into the destination.
    var _comp = null, _scratch = null;
    function sizedCanvas(c, w, h) {
        if (!c) c = document.createElement('canvas');
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        return c;
    }
    // Canvas → CSS geometry, read at most a few times a second instead of
    // per frame: clientWidth/clientHeight and two getBoundingClientRect()s
    // per captured frame each forced a synchronous layout.
    var _geom = null, _geomMs = 0;
    function geometry(simCanvas) {
        var now = performance.now();
        if (_geom && now - _geomMs < 250 && _geom.w === simCanvas.width && _geom.h === simCanvas.height) return _geom;
        var g = { w: simCanvas.width, h: simCanvas.height,
                  displayW: simCanvas.clientWidth || simCanvas.width,
                  displayH: simCanvas.clientHeight || simCanvas.height,
                  areaWidth: 0, areaHeight: 0, offsetX: 0, offsetY: 0 };
        var area = document.getElementById('canvas-area');
        var wrap = document.getElementById('canvas-wrapper');
        if (area && wrap) {
            var aRect = area.getBoundingClientRect();
            var wRect = wrap.getBoundingClientRect();
            g.areaWidth = aRect.width; g.areaHeight = aRect.height;
            g.offsetX = wRect.left - aRect.left; g.offsetY = wRect.top - aRect.top;
        }
        _geom = g; _geomMs = now;
        return g;
    }

    function finish() {
        if (_stream) { _stream.getTracks().forEach(function (t) { t.stop(); }); _stream = null; }
        _recorder = null;
        _busy = false;
        _abort = false;
        window.__exporting = false; // D3-4: re-allow the mask film after export
        _imgCache.clear();
        _comp = null; _scratch = null; _geom = null;   // free the capture surfaces
        if (window.QualityGovernor && window.QualityGovernor.hold) window.QualityGovernor.hold(false);
        if (_compStats.frames > 0) {
            var avg = _compStats.totalMs / _compStats.frames;
            console.log('[Export] composite cost: avg ' + avg.toFixed(1) + 'ms, worst ' +
                _compStats.worstMs.toFixed(1) + 'ms over ' + _compStats.frames + ' frames');
            if (avg > 30) console.warn('[Export] composite avg exceeds the 30ms budget — expect dropped export frames');
        }
        if (_compStats.capFrames > 0) {
            console.log('[Export] capture cost: avg ' + (_compStats.capTotalMs / _compStats.capFrames).toFixed(1) +
                'ms, worst ' + _compStats.capWorstMs.toFixed(1) + 'ms over ' + _compStats.capFrames + ' frames');
        }
        _compStats = { frames: 0, totalMs: 0, worstMs: 0, capFrames: 0, capTotalMs: 0, capWorstMs: 0 };
        _uiLastMs = 0;
        updateUI('idle', 0);
    }

    function guard() {
        if (_busy) { toast('Export already in progress', 'warn'); return false; }
        _busy = true; _abort = false;
        window.__exporting = true; // D3-4: suppress the red mask film in captures
        // The ladder must not read export-side frame loss as sim overload —
        // see the hold() note in 08a. Released in finish().
        if (window.QualityGovernor && window.QualityGovernor.hold) window.QualityGovernor.hold(true);
        return true;
    }

    function saveBlob(blob, filename) {
        return new Promise(function (resolve, reject) {
            if (isElectron && cfg.outputFolder && fs) {
                var reader = new FileReader();
                reader.onload = function () {
                    try {
                        var filepath = path.join(cfg.outputFolder, filename);
                        fs.writeFileSync(filepath, Buffer.from(reader.result));
                        resolve(filepath);
                    } catch (e) { reject(e); }
                };
                reader.onerror = function () { reject(reader.error); };
                reader.readAsArrayBuffer(blob);
            } else {
                // Keep the OS cursor visible while the browser's save dialog
                // may be up (Show Cursor off hides it page-wide otherwise).
                // Fire-and-forget: the dialog heuristic gates ONLY the cursor
                // restore — the export itself resolves immediately, as it
                // always did, so toasts / _busy / idle UI never wait on focus.
                var wrap = window.withCursorVisible || function (f) { return f(); };
                var hadFocus = document.hasFocus();
                try {
                    wrap(function () {
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url; a.download = filename;
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a);
                        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                        return dialogSettled(hadFocus);
                    });
                } catch (e) { reject(e); return; }
                resolve(filename);
            }
        });
    }

    // An anchor download gives no dialog signal. If the "ask where to save"
    // dialog takes focus, hold until the window refocuses (save and cancel
    // both refocus); if focus never leaves, the download was silent — settle
    // after a short poll. Gates only the cursor lift, never the export.
    function dialogSettled(hadFocus) {
        return new Promise(function (resolve) {
            // Unfocused at click time → a dialog of ours cannot have TAKEN
            // focus, and waiting for refocus would hold the lift for however
            // long the user stays in another app. Settle immediately.
            if (!hadFocus) { resolve(); return; }
            var t0 = performance.now();
            var done = false;
            function finish() {
                if (done) return; done = true;
                window.removeEventListener('focus', finish);
                resolve();
            }
            (function poll() {
                if (done) return;
                if (!document.hasFocus()) {
                    window.addEventListener('focus', finish);
                    (function repoll() { // belt: focus events can be missed
                        if (done) return;
                        if (document.hasFocus()) return finish();
                        if (performance.now() - t0 > 60000) return finish();
                        setTimeout(repoll, 250);
                    })();
                    return;
                }
                if (performance.now() - t0 > 1200) return finish();
                setTimeout(poll, 100);
            })();
        });
    }

    // ── Canvas Compositing ──────────────────────────────────────────
    // target (optional): a canvas to composite INTO — the recorder's own
    // canvas for video, the downscaled frame for GIF — so the composite is
    // not drawn once more to get there. Any size: the frame is fitted to it.
    // Without a target the persistent composite canvas is returned; callers
    // must consume it before the next capture (it is reused).
    function captureCompositeFrame(target) {
        return new Promise(function (resolve, reject) {
            var simCanvas = document.getElementById('canvas');
            if (!simCanvas) return reject(new Error('Canvas not found'));

            var w = simCanvas.width, h = simCanvas.height;
            var geom = geometry(simCanvas);
            var sx = w / geom.displayW, sy = h / geom.displayH;

            // Build draw list bottom-to-top
            var order = (window.layerOrder || []).slice().reverse();
            if (!order.length) order.push({ type: 'sim' });
            var drawList = [];

            for (var i = 0; i < order.length; i++) {
                var item = order[i];
                if (item.type === 'sim') {
                    if (simCanvas.style.display !== 'none') {
                        var op = parseFloat(simCanvas.style.opacity);
                        drawList.push({ type: 'sim', opacity: isNaN(op) ? 1 : op });
                    }
                } else {
                    var layer = (window.layers || []).find(function (l) { return l.index === item.id; });
                    if (!layer || !layer.visible) continue;
                    // D2 raster layers are composited inside the GL canvas —
                    // they're already in the WebGL canvas; drawing them again
                    // here would double-composite
                    if (layer.isRaster) continue;
                    var layerDiv = document.getElementById('layer' + layer.index);
                    if (!layerDiv || layerDiv.style.display === 'none') continue;
                    var bg = layerDiv.style.backgroundImage;
                    if (!bg || bg === 'none' || bg === '') continue;
                    var m = bg.match(/url\(["']?(.+?)["']?\)/);
                    if (!m) continue;
                    // D3-3 clip masks live in CSS mask-image on the layer div —
                    // without replaying them, clipped layers export UNclipped.
                    var maskCss = layerDiv.style.webkitMaskImage || layerDiv.style.maskImage || '';
                    var mm = maskCss.match(/url\(["']?(.+?)["']?\)/);
                    var divOp = parseFloat(layerDiv.style.opacity);
                    drawList.push({
                        type: 'layer', src: m[1],
                        maskSrc: mm ? mm[1] : null,
                        x: (layer.x || 0) * sx, y: (layer.y || 0) * sy,
                        scaleX: layer.scaleX || 1, scaleY: layer.scaleY || 1,
                        rotation: layer.rotation || 0,
                        skewX: layer.skewX || 0, skewY: layer.skewY || 0,
                        opacity: isNaN(divOp) ? 1 : divOp
                    });
                }
            }

            var t0 = performance.now();

            // Sim-only frame (no DOM layers, no clip masks): one draw, straight
            // from the WebGL canvas into the destination, scaled if the
            // destination is smaller. This is the common case and it is the
            // whole per-frame cost when it applies.
            var overlaysOn = !!(cfg.compositeOverlays && window.textOverlays && window.textOverlays.compositeOntoCanvas);
            var simOnly = drawList.length === 1 && drawList[0].type === 'sim';
            if (simOnly && target && !overlaysOn) {
                var tctx = target.getContext('2d');
                tctx.globalAlpha = 1;
                tctx.clearRect(0, 0, target.width, target.height);
                tctx.globalAlpha = drawList[0].opacity;
                tctx.drawImage(simCanvas, 0, 0, target.width, target.height);
                tctx.globalAlpha = 1;
                var dt0 = performance.now() - t0;
                _compStats.frames++; _compStats.totalMs += dt0;
                if (dt0 > _compStats.worstMs) _compStats.worstMs = dt0;
                resolve(target);
                return;
            }

            // Decode layer + mask images through the per-export cache
            Promise.all(drawList.map(function (task) {
                if (task.type === 'sim') return Promise.resolve(null);
                if (!task.maskSrc) return getCachedImage(task.src);
                return Promise.all([getCachedImage(task.src), getCachedImage(task.maskSrc)]);
            })).then(function (images) {
                // Composite at canvas resolution into the persistent surface
                // (or into the target itself when it is the same size), then
                // fit into a smaller target at the end. The image decodes above
                // resolve in a microtask once cached — same task as the render,
                // so the WebGL buffer is still this frame's.
                var direct = !!(target && target.width === w && target.height === h);
                // Outside an export (fluidExport.captureFrame from another
                // module, which keeps the canvas) the caller gets one of its
                // own — the persistent surface is shared only between the
                // frames of one export.
                var comp = direct ? target : (_busy ? (_comp = sizedCanvas(_comp, w, h)) : sizedCanvas(null, w, h));
                var ctx = comp.getContext('2d');
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, w, h);
                var scratch = null; // shared by all masked layers this frame

                drawList.forEach(function (task, idx) {
                    ctx.globalAlpha = task.opacity;
                    if (task.type === 'sim') {
                        ctx.drawImage(simCanvas, 0, 0);
                    } else {
                        var img = task.maskSrc ? images[idx][0] : images[idx];
                        var maskImg = task.maskSrc ? images[idx][1] : null;
                        if (!img) return;
                        var source = img;
                        if (maskImg) {
                            // CSS mask-image applies in the element's local box
                            // BEFORE its transform (mask-size:100% 100%), so
                            // mask in untransformed space, then transform the
                            // already-clipped result.
                            if (!scratch) scratch = _busy ? (_scratch = sizedCanvas(_scratch, w, h)) : sizedCanvas(null, w, h);
                            var sctx = scratch.getContext('2d');
                            sctx.globalCompositeOperation = 'source-over';
                            sctx.clearRect(0, 0, w, h);
                            sctx.drawImage(img, 0, 0, w, h);
                            sctx.globalCompositeOperation = 'destination-in';
                            sctx.drawImage(maskImg, 0, 0, w, h);
                            source = scratch;
                        }
                        ctx.save();
                        ctx.translate(w / 2 + task.x, h / 2 + task.y);
                        ctx.rotate(task.rotation * Math.PI / 180);
                        if (window.LayerXform) window.LayerXform.shearCtx(ctx, task);
                        ctx.scale(task.scaleX, task.scaleY);
                        ctx.drawImage(source, -w / 2, -h / 2, w, h);
                        ctx.restore();
                    }
                    ctx.globalAlpha = 1;
                });

                if (overlaysOn) {
                    // Overlay x/y are fractions of #canvas-area; the export
                    // frame is the wrapper. Pass the area→wrapper mapping so
                    // overlays land where the user sees them (in wrapper px;
                    // buffer px == wrapper CSS px, see 05j updateCanvasSize).
                    // Geometry comes from the cached read above.
                    var opts = { width: w, height: h };
                    if (geom.areaWidth) {
                        opts.areaWidth = geom.areaWidth;
                        opts.areaHeight = geom.areaHeight;
                        opts.offsetX = geom.offsetX;
                        opts.offsetY = geom.offsetY;
                    }
                    window.textOverlays.compositeOntoCanvas(ctx, opts);
                }

                var out = comp;
                if (target && !direct) {
                    var tc = target.getContext('2d');
                    tc.globalAlpha = 1;
                    tc.clearRect(0, 0, target.width, target.height);
                    tc.drawImage(comp, 0, 0, target.width, target.height);
                    out = target;
                }

                var dt = performance.now() - t0;
                _compStats.frames++;
                _compStats.totalMs += dt;
                if (dt > _compStats.worstMs) _compStats.worstMs = dt;

                resolve(out);
            }).catch(reject);
        });
    }

    // ── EBML Utilities (for WebM post-processing) ──────────────────
    function ebmlVINTWidth(b) {
        if (b & 0x80) return 1;  if (b & 0x40) return 2;
        if (b & 0x20) return 3;  if (b & 0x10) return 4;
        if (b & 0x08) return 5;  if (b & 0x04) return 6;
        if (b & 0x02) return 7;  if (b & 0x01) return 8;
        return 0;
    }
    function ebmlReadVINT(bytes, pos) {
        if (pos >= bytes.length) return null;
        var w = ebmlVINTWidth(bytes[pos]);
        if (!w || pos + w > bytes.length) return null;
        var mask = (1 << (8 - w)) - 1;
        var val = bytes[pos] & mask;
        for (var i = 1; i < w; i++) val = val * 256 + bytes[pos + i];
        var unknown = mask;
        for (var i = 1; i < w; i++) unknown = unknown * 256 + 255;
        return { value: val === unknown ? -1 : val, width: w };
    }
    function ebmlReadElement(bytes, pos) {
        if (pos >= bytes.length) return null;
        var idW = ebmlVINTWidth(bytes[pos]);
        if (!idW || pos + idW >= bytes.length) return null;
        var id = 0;
        for (var i = 0; i < idW; i++) id = id * 256 + bytes[pos + i];
        var sv = ebmlReadVINT(bytes, pos + idW);
        if (!sv) return null;
        var ds = pos + idW + sv.width;
        return { id: id, size: sv.value, dataStart: ds, end: sv.value < 0 ? -1 : ds + sv.value };
    }
    function ebmlReadUInt(bytes, pos, len) {
        var v = 0;
        for (var i = 0; i < len; i++) v = v * 256 + bytes[pos + i];
        return v;
    }
    function ebmlEncodeID(id) {
        var out = [];
        while (id > 0) { out.unshift(id & 0xFF); id = Math.floor(id / 256); }
        return out;
    }
    function ebmlEncodeVINT(val) {
        if (val < 127)     return [0x80 | val];
        if (val < 16383)   return [0x40 | (val >> 8), val & 0xFF];
        if (val < 2097151) return [0x20 | (val >> 16), (val >> 8) & 0xFF, val & 0xFF];
        return [0x10 | ((val >>> 24) & 0x0F), (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF];
    }
    function ebmlEncodeUInt(val) {
        if (val === 0) return [0];
        var out = [];
        while (val > 0) { out.unshift(val & 0xFF); val = Math.floor(val / 256); }
        return out;
    }
    function ebmlBuildElement(id, content) {
        var idB = ebmlEncodeID(id);
        var sizeB = ebmlEncodeVINT(content.length);
        var out = new Uint8Array(idB.length + sizeB.length + content.length);
        var p = 0;
        for (var i = 0; i < idB.length; i++) out[p++] = idB[i];
        for (var i = 0; i < sizeB.length; i++) out[p++] = sizeB[i];
        for (var i = 0; i < content.length; i++) out[p++] = content[i];
        return out;
    }
    function ebmlConcat(a, b) {
        var out = new Uint8Array(a.length + b.length);
        out.set(a, 0); out.set(b, a.length);
        return out;
    }

    // ── WebM Post-Processor ─────────────────────────────────────────
    // Fixes Duration AND injects a Cues element (seek index) so that
    // players can jump to arbitrary positions without artifacts.
    async function fixWebmForSeeking(blob, durationMs) {
        var ab = await blob.arrayBuffer();
        var bytes = new Uint8Array(ab);
        var view = new DataView(ab);

        // ── Fix Duration ──
        for (var i = 0; i < Math.min(bytes.length - 12, 4096); i++) {
            if (bytes[i] !== 0x44 || bytes[i + 1] !== 0x89) continue;
            var sv = ebmlReadVINT(bytes, i + 2);
            if (!sv) continue;
            if (sv.value === 8) { view.setFloat64(i + 2 + sv.width, durationMs); break; }
            if (sv.value === 4) { view.setFloat32(i + 2 + sv.width, durationMs); break; }
        }

        // ── Find Segment data start ──
        var ebmlHeader = ebmlReadElement(bytes, 0);
        if (!ebmlHeader) return new Blob([ab], { type: blob.type });
        var seg = ebmlReadElement(bytes, ebmlHeader.end);
        if (!seg || seg.id !== 0x18538067) return new Blob([ab], { type: blob.type });
        var segDataStart = seg.dataStart;

        // ── Find all Clusters and their timestamps ──
        var clusters = [];
        var pos = segDataStart;
        var fileEnd = bytes.length;

        while (pos < fileEnd - 8) {
            var el = ebmlReadElement(bytes, pos);
            if (!el) { pos++; continue; }

            if (el.id === 0x1F43B675) { // Cluster
                var ts = 0;
                var child = ebmlReadElement(bytes, el.dataStart);
                if (child && child.id === 0xE7 && child.size > 0) {
                    ts = ebmlReadUInt(bytes, child.dataStart, child.size);
                }
                clusters.push({ relPos: pos - segDataStart, timestamp: ts });
            }

            if (el.end > 0) {
                pos = el.end;
            } else if (el.id === 0x18538067) {
                pos = el.dataStart; // enter unknown-size Segment
            } else {
                pos++; // skip unknown-size non-Segment element
            }
        }

        if (clusters.length < 2) return new Blob([ab], { type: blob.type });

        // ── Build Cues element ──
        var cuePointArrays = [];
        for (var ci = 0; ci < clusters.length; ci++) {
            var c = clusters[ci];
            var cueTime       = ebmlBuildElement(0xB3, ebmlEncodeUInt(c.timestamp));
            var cueTrack      = ebmlBuildElement(0xF7, ebmlEncodeUInt(1));
            var cueClusterPos = ebmlBuildElement(0xF1, ebmlEncodeUInt(c.relPos));
            var cueTrackPos   = ebmlBuildElement(0xB7, ebmlConcat(cueTrack, cueClusterPos));
            cuePointArrays.push(ebmlBuildElement(0xBB, ebmlConcat(cueTime, cueTrackPos)));
        }

        // Concatenate all CuePoints
        var totalCueLen = 0;
        for (var i = 0; i < cuePointArrays.length; i++) totalCueLen += cuePointArrays[i].length;
        var cuesContent = new Uint8Array(totalCueLen);
        var wp = 0;
        for (var i = 0; i < cuePointArrays.length; i++) {
            cuesContent.set(cuePointArrays[i], wp);
            wp += cuePointArrays[i].length;
        }
        var cues = ebmlBuildElement(0x1C53BB6B, cuesContent);

        // ── Append Cues to end of file ──
        var result = new Uint8Array(bytes.length + cues.length);
        result.set(bytes);
        result.set(cues, bytes.length);

        return new Blob([result], { type: blob.type });
    }

    // ── Video Export ────────────────────────────────────────────────
    async function exportVideo(options) {
        if (!guard()) return;
        options = options || {};
        var duration = options.duration || cfg.videoDuration;
        var fps     = options.fps || cfg.videoFPS;

        try {
            var simCanvas = document.getElementById('canvas');
            if (!simCanvas) throw new Error('Canvas not found');

            // Offscreen 2D canvas for compositing — avoids WebGL buffer issues
            var recCanvas = document.createElement('canvas');
            recCanvas.width = simCanvas.width;
            recCanvas.height = simCanvas.height;
            var recCtx = recCanvas.getContext('2d');

            // captureStream(0) = manual frame control via requestFrame()
            _stream = recCanvas.captureStream(0);
            var track = _stream.getVideoTracks()[0];

            // Audio (2026-08-16): mux the reactive audio in so an exported
            // video ARRIVES with its soundtrack — the whole point of driving
            // visuals from a track is not having to line it up by hand
            // afterwards. This loop is realtime (rAF, wall-clock duration),
            // so the audio stays in sync. audioReactive withholds mic input;
            // file/system come through.
            var hasAudio = false;
            try {
                var aStream = window.audioReactive && window.audioReactive.getOutputStream
                    && window.audioReactive.getOutputStream();
                if (aStream) {
                    aStream.getAudioTracks().forEach(function (t) { _stream.addTrack(t); hasAudio = true; });
                }
            } catch (e) { console.warn('[Export] audio track unavailable:', e && e.message); }

            // Prefer MP4 (inherently seekable) → fall back to WebM. With an
            // audio track present only codec strings that CARRY audio are
            // valid — a video-only mimeType would make MediaRecorder throw.
            var mimeType = ''; var ext = 'webm';
            var mpTests = hasAudio
                ? ['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
                : ['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1', 'video/mp4'];
            for (var mi = 0; mi < mpTests.length; mi++) {
                if (MediaRecorder.isTypeSupported(mpTests[mi])) {
                    mimeType = mpTests[mi]; ext = 'mp4'; break;
                }
            }
            if (!mimeType) {
                var wmTests = hasAudio
                    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
                    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
                for (var wi = 0; wi < wmTests.length; wi++) {
                    if (MediaRecorder.isTypeSupported(wmTests[wi])) { mimeType = wmTests[wi]; break; }
                }
                if (!mimeType) mimeType = 'video/webm';
            }

            // Electron + MP4 + output folder → stream chunks to disk as they
            // arrive instead of accumulating the whole recording in RAM (a
            // long 4K capture used to OOM). MP4 needs no post-processing, so
            // nothing ever requires the full file in memory. WebM keeps the
            // in-RAM path (the cue fixer needs the whole file).
            var chunks = [];
            var streamPath = null, writeChain = null, streamWriteError = null;
            if (isElectron && cfg.outputFolder && fs && ext === 'mp4') {
                try {
                    streamPath = path.join(cfg.outputFolder, cfg.filenamePrefix + Date.now() + '.mp4');
                    fs.writeFileSync(streamPath, Buffer.alloc(0));
                    writeChain = Promise.resolve();
                } catch (e) {
                    console.warn('[Export] disk streaming unavailable, buffering in RAM:', e.message);
                    streamPath = null;
                }
            }
            var recOpts = { mimeType: mimeType, videoBitsPerSecond: cfg.videoBitrate };
            if (hasAudio) recOpts.audioBitsPerSecond = 128000;
            _recorder = new MediaRecorder(_stream, recOpts);
            _recorder.ondataavailable = function (e) {
                if (!(e.data && e.data.size > 0)) return;
                if (streamPath) {
                    // Chain keeps chunk order. The append is ASYNC on purpose:
                    // a synchronous ~1 MB write per timeslice sat on the main
                    // thread once a second, in the middle of painting. A failed
                    // append means the file has a HOLE — record it so the export
                    // reports failure instead of a success toast over a
                    // truncated video (disk full, drive ejected mid-record).
                    writeChain = writeChain
                        .then(function () { return e.data.arrayBuffer(); })
                        .then(function (ab) { return fs.promises.appendFile(streamPath, Buffer.from(ab)); })
                        .catch(function (err) {
                            streamWriteError = streamWriteError || err;
                            console.warn('[Export] chunk write failed:', err.message);
                        });
                } else {
                    chunks.push(e.data);
                }
            };

            // Wrap onstop in a Promise so we can await it
            var blobReady = new Promise(function (resolve, reject) {
                _recorder.onstop  = function () { resolve(streamPath ? null : new Blob(chunks, { type: mimeType })); };
                _recorder.onerror = function (e) { reject(e.error || new Error('Recording failed')); };
            });

            // 1-second timeslice → keyframe at the start of each chunk
            _recorder.start(1000);
            toast('Recording (' + ext.toUpperCase() + ')...', 'info');
            updateUI('recording', 0);

            // Frame-by-frame composited recording
            var t0 = Date.now();
            var frameInterval = 1000 / fps;
            var lastFrame = 0;
            var lastSerial = -1;

            while (!_abort) {
                var elapsed = Date.now() - t0;
                if (elapsed >= duration) break;

                await rafPromise();

                // Only a frame the sim actually DREW is worth a capture: under
                // an fps cap update() early-returns most rAF ticks (60 draws a
                // second on a 144 Hz panel), and every one of those ticks used
                // to pay a full-frame readback for a duplicate.
                var serial = window.__drawSerial;
                if (typeof serial === 'number') {
                    if (serial === lastSerial) continue;
                    lastSerial = serial;
                }

                // Throttle to target FPS
                var now = Date.now();
                if (now - lastFrame < frameInterval * 0.8) continue;
                lastFrame = now;

                // Composite all visible layers INTO the recording canvas. Its
                // size is FIXED: the canvas buffer can be reallocated
                // mid-export (window resize, drawer collapse), and MediaRecorder
                // can't change track size mid-stream, so the frame is fitted to
                // the original size inside the capture.
                var c0 = performance.now();
                await captureCompositeFrame(recCanvas);

                // Push the frame to the encoder
                if (track.requestFrame) track.requestFrame();
                var cdt = performance.now() - c0;
                _compStats.capFrames++; _compStats.capTotalMs += cdt;
                if (cdt > _compStats.capWorstMs) _compStats.capWorstMs = cdt;

                updateUI('recording', Math.min(100, (elapsed / duration) * 100));
            }

            // Stop the recorder (fires onstop → resolves blobReady)
            if (_recorder && _recorder.state === 'recording') _recorder.stop();

            var blob = await blobReady;           // null when disk-streaming
            if (streamPath) await writeChain;      // last chunk flushed

            if (_abort) {
                if (streamPath) { try { fs.unlinkSync(streamPath); } catch (_) {} }
                toast('Export cancelled', 'info');
                return;
            }

            if (streamPath) {
                if (streamWriteError) {
                    throw new Error('could not finish writing the video (' +
                        streamWriteError.message + ') — the file at ' + streamPath + ' is incomplete');
                }
                toast('Video exported! (MP4)', 'success');
            } else {
                // WebM needs post-processing for seeking; MP4 is fine as-is
                if (ext === 'webm') {
                    updateUI('rendering', 95);
                    blob = await fixWebmForSeeking(blob, duration);
                }
                var name = cfg.filenamePrefix + Date.now() + '.' + ext;
                await saveBlob(blob, name);
                toast('Video exported! (' + ext.toUpperCase() + ')', 'success');
            }

        } catch (err) {
            console.error('[Export] Video:', err);
            toast('Export failed: ' + err.message, 'error');
        } finally {
            finish();
        }
    }

    // ── GIF Export (inline encoder, no external deps) ───────────────
    async function exportGIF(options) {
        if (!guard()) return;
        options = options || {};
        var duration   = options.duration || cfg.gifDuration;
        var fps        = options.fps      || cfg.gifFPS;
        var maxW       = options.width    || cfg.gifMaxWidth;
        var frameDelay = 1000 / fps;
        var frameCount = Math.ceil(duration / frameDelay);

        try {
            var canvas = document.getElementById('canvas');
            if (!canvas) throw new Error('Canvas not found');

            // Compute output dimensions
            var ow = canvas.width, oh = canvas.height;
            if (ow > maxW) { oh = Math.round(oh * (maxW / ow)); ow = maxW; }
            // GIF dimensions must be even for some decoders
            ow = ow & ~1; oh = oh & ~1;

            toast('Capturing ' + frameCount + ' frames...', 'info');
            updateUI('rendering', 0);

            // Phase 1: capture frames  (0 → 50 %)
            // One downscaled surface for the whole capture; the composite is
            // drawn straight into it, so the only full-resolution work per
            // frame is the sim draw itself (none, when the frame is sim-only —
            // then it is a single scaled draw). The readback stays: the
            // encoder needs the bytes.
            var frames = [];
            var small = document.createElement('canvas');
            small.width = ow; small.height = oh;
            var smallCtx = small.getContext('2d', { willReadFrequently: true });
            for (var i = 0; i < frameCount; i++) {
                if (_abort) { toast('Export cancelled', 'info'); return; }

                // Wait for a fresh render
                await rafPromise();

                var c0 = performance.now();
                await captureCompositeFrame(small);
                var imgData = smallCtx.getImageData(0, 0, ow, oh);
                var cdt = performance.now() - c0;
                _compStats.capFrames++; _compStats.capTotalMs += cdt;
                if (cdt > _compStats.capWorstMs) _compStats.capWorstMs = cdt;
                frames.push({ data: imgData.data, delay: frameDelay });

                updateUI('rendering', ((i + 1) / frameCount) * 50);

                // Bake hook (scripts/bake-effect-previews.js): a caller may
                // change the scene between frames — the effect previews flip
                // their effect on halfway through the loop.
                if (typeof options.onFrame === 'function') {
                    try { await options.onFrame(i, frameCount); } catch (e) { console.warn('[Export] onFrame:', e && e.message); }
                }

                // Let the simulation advance between frames
                if (i < frameCount - 1) await sleep(frameDelay);
            }

            if (_abort) { toast('Export cancelled', 'info'); return; }

            // Phase 2: encode GIF  (50 → 100 %)
            toast('Encoding GIF...', 'info');
            var gifBytes = await encodeGIF(ow, oh, frames, function (p) {
                updateUI('rendering', 50 + p * 50);
            });

            var blob = new Blob([gifBytes], { type: 'image/gif' });
            var name = cfg.filenamePrefix + Date.now() + '.gif';
            if (typeof options.onBlob === 'function') {
                // Bake hook: hand the file to the caller instead of saving.
                options.onBlob(blob, name);
            } else {
                await saveBlob(blob, name);
                toast('GIF exported!', 'success');
            }

        } catch (err) {
            console.error('[Export] GIF:', err);
            toast('Export failed: ' + err.message, 'error');
        } finally {
            finish();
        }
    }

    // ── Adaptive Colour Quantization (Median Cut) ────────────────
    // Builds an optimal 256-colour palette from the actual pixel data
    function buildAdaptivePalette(frames, width, height) {
        var npixPerFrame = width * height;
        var totalPix = frames.length * npixPerFrame;
        // Sample ~80k pixels evenly across all frames
        var step = Math.max(1, Math.floor(totalPix / 80000));
        var samples = [];
        var idx = 0;
        for (var fi = 0; fi < frames.length; fi++) {
            var d = frames[fi].data;
            for (var pi = 0; pi < npixPerFrame; pi++) {
                if (idx++ % step === 0) {
                    var o = pi * 4;
                    samples.push([d[o], d[o + 1], d[o + 2]]);
                }
            }
        }

        // Median-cut: split sample set into 256 boxes. Split score is
        // range × population, not raw range — a handful of outlier pixels
        // spanning a wide range must not win split after split while a huge
        // near-uniform gradient region (most of a fluid frame) starves.
        // 255 boxes, not 256: index 255 is reserved as the inter-frame
        // transparency index (see encodeGIF).
        var boxes = [samples];
        while (boxes.length < 255) {
            var bestBI = -1, bestScore = 0, bestCh = 0;
            for (var bi = 0; bi < boxes.length; bi++) {
                var box = boxes[bi];
                if (box.length < 2) continue;
                for (var ch = 0; ch < 3; ch++) {
                    var lo = 255, hi = 0;
                    for (var si = 0; si < box.length; si++) {
                        var v = box[si][ch];
                        if (v < lo) lo = v;
                        if (v > hi) hi = v;
                    }
                    var score = (hi - lo) * box.length;
                    if (score > bestScore) { bestScore = score; bestBI = bi; bestCh = ch; }
                }
            }
            if (bestBI < 0) break; // every box is a single colour
            var target = boxes[bestBI];
            target.sort(function (a, b) { return a[bestCh] - b[bestCh]; });
            var mid = target.length >> 1;
            boxes[bestBI] = target.slice(0, mid);
            boxes.push(target.slice(mid));
        }

        // Average each box → palette colour
        var pal = [];
        for (var bi = 0; bi < boxes.length; bi++) {
            var box = boxes[bi], sr = 0, sg = 0, sb = 0, n = box.length || 1;
            for (var si = 0; si < box.length; si++) { sr += box[si][0]; sg += box[si][1]; sb += box[si][2]; }
            pal.push([Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)]);
        }

        refinePaletteKMeans(pal, samples, 2);

        // realCount marks where the true palette ends; the [0,0,0] padding
        // below must never win a nearest-colour search or count toward the
        // dither-strength estimate (a padding black would speckle flat dark
        // frames with pure-black pixels).
        pal.realCount = pal.length;
        while (pal.length < 256) pal.push([0, 0, 0]);
        return pal;
    }

    // Lloyd (k-means) refinement: median-cut seeds are box averages, which
    // sit off-centre once neighbouring boxes compete for the same samples.
    // A couple of reassign-and-recompute passes over the ~80k samples
    // settles them. Empty clusters keep their seed colour.
    function refinePaletteKMeans(pal, samples, iterations) {
        var k = pal.length;
        var sums = new Float64Array(k * 3);
        var counts = new Uint32Array(k);
        for (var it = 0; it < iterations; it++) {
            sums.fill(0); counts.fill(0);
            // Cache keyed at 6 bits/channel; smooth-gradient samples repeat
            // heavily so most lookups hit. Palette moves each pass → reset.
            var cache = new Map();
            for (var si = 0; si < samples.length; si++) {
                var s = samples[si];
                var key = ((s[0] >> 2) << 12) | ((s[1] >> 2) << 6) | (s[2] >> 2);
                var ci = cache.get(key);
                if (ci === undefined) {
                    var bestDist = 0x7FFFFFFF; ci = 0;
                    for (var pi = 0; pi < k; pi++) {
                        var dr = s[0] - pal[pi][0];
                        var dg = s[1] - pal[pi][1];
                        var db = s[2] - pal[pi][2];
                        // Perceptual weights — must match findNearest
                        var dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
                        if (dist < bestDist) { bestDist = dist; ci = pi; }
                    }
                    cache.set(key, ci);
                }
                var o = ci * 3;
                sums[o] += s[0]; sums[o + 1] += s[1]; sums[o + 2] += s[2];
                counts[ci]++;
            }
            for (var pi = 0; pi < k; pi++) {
                if (!counts[pi]) continue;
                var o = pi * 3, n = counts[pi];
                pal[pi][0] = Math.round(sums[o] / n);
                pal[pi][1] = Math.round(sums[o + 1] / n);
                pal[pi][2] = Math.round(sums[o + 2] / n);
            }
        }
    }

    // Nearest-colour lookup (cached). Cache is shared across frames.
    function findNearest(r, g, b, palette, cache) {
        // 6-bit per channel key (18-bit, 262k buckets) — within ±2 of true colour
        var key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        if (cache.has(key)) return cache.get(key);
        var bestIdx = 0, bestDist = 0x7FFFFFFF;
        // Real entries only — never the [0,0,0] padding, and never index 255
        // (the reserved transparency index)
        var n = Math.min(palette.realCount || palette.length, 255);
        for (var ci = 0; ci < n; ci++) {
            var dr = r - palette[ci][0];
            var dg = g - palette[ci][1];
            var db = b - palette[ci][2];
            // Perceptual weights (≈ luma sensitivity) — match refinePaletteKMeans
            var dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
            if (dist < bestDist) { bestDist = dist; bestIdx = ci; }
        }
        cache.set(key, bestIdx);
        return bestIdx;
    }

    // Ordered (Bayer 8×8) dithering + palette quantization.
    // Position-locked thresholds, unlike error diffusion: a pixel that is
    // stable across frames dithers identically every frame, so animations
    // don't shimmer ("dither crawl") and LZW keeps its runs — smaller files.
    var BAYER8 = [
         0, 32,  8, 40,  2, 34, 10, 42,
        48, 16, 56, 24, 50, 18, 58, 26,
        12, 44,  4, 36, 14, 46,  6, 38,
        60, 28, 52, 20, 62, 30, 54, 22,
         3, 35, 11, 43,  1, 33,  9, 41,
        51, 19, 59, 27, 49, 17, 57, 25,
        15, 47,  7, 39, 13, 45,  5, 37,
        63, 31, 55, 23, 61, 29, 53, 21
    ];

    // Dither amplitude should be ≈ one palette step: less leaves banding,
    // more is visible noise that also bloats LZW. Estimate the step as the
    // median nearest-neighbour distance between distinct palette entries.
    function estimateDitherStrength(palette) {
        var uniq = [];
        var seen = new Set();
        var count = palette.realCount || palette.length;
        for (var i = 0; i < count; i++) {
            var p = palette[i];
            var key = (p[0] << 16) | (p[1] << 8) | p[2];
            if (!seen.has(key)) { seen.add(key); uniq.push(p); }
        }
        if (uniq.length < 2) return 0;
        var dists = [];
        for (var i = 0; i < uniq.length; i++) {
            var best = Infinity;
            for (var j = 0; j < uniq.length; j++) {
                if (i === j) continue;
                var dr = uniq[i][0] - uniq[j][0];
                var dg = uniq[i][1] - uniq[j][1];
                var db = uniq[i][2] - uniq[j][2];
                var d = dr * dr + dg * dg + db * db;
                if (d < best) best = d;
            }
            dists.push(Math.sqrt(best));
        }
        dists.sort(function (a, b) { return a - b; });
        var median = dists[dists.length >> 1];
        return Math.max(4, Math.min(28, median));
    }

    function quantizePixels(data, width, height, palette, cache, strength) {
        var indexed = new Uint8Array(width * height);
        for (var y = 0; y < height; y++) {
            var row = (y & 7) << 3;
            for (var x = 0; x < width; x++) {
                var idx = y * width + x;
                var o = idx * 4;
                // Same offset on all channels: luminance dither, no hue noise
                var t = ((BAYER8[row | (x & 7)] + 0.5) / 64 - 0.5) * strength;
                var cr = Math.max(0, Math.min(255, Math.round(data[o] + t)));
                var cg = Math.max(0, Math.min(255, Math.round(data[o + 1] + t)));
                var cb = Math.max(0, Math.min(255, Math.round(data[o + 2] + t)));
                indexed[idx] = findNearest(cr, cg, cb, palette, cache);
            }
        }
        return indexed;
    }

    // Growable typed-array writer. The previous boxed `[]`-push writers cost
    // ~8 bytes of heap per output BYTE (a 10MB GIF ballooned past 100MB of
    // transient heap); this keeps it at ~1x with doubling growth.
    function ByteWriter(initial) {
        var arr = new Uint8Array(initial || (1 << 16));
        var len = 0;
        function ensure(n) {
            if (len + n <= arr.length) return;
            var next = new Uint8Array(Math.max(arr.length * 2, len + n));
            next.set(arr.subarray(0, len));
            arr = next;
        }
        return {
            w8: function (v) { ensure(1); arr[len++] = v & 0xFF; },
            w16: function (v) { ensure(2); arr[len++] = v & 0xFF; arr[len++] = (v >> 8) & 0xFF; },
            wStr: function (s) { ensure(s.length); for (var i = 0; i < s.length; i++) arr[len++] = s.charCodeAt(i) & 0xFF; },
            wBytes: function (src, start, end) { var n = end - start; ensure(n); arr.set(src.subarray(start, end), len); len += n; },
            size: function () { return len; },
            toUint8Array: function () { return arr.subarray(0, len); }
        };
    }

    // ── Inline GIF89a Encoder with LZW ─────────────────────────────
    // Produces valid animated GIF89a. No external libraries.
    async function encodeGIF(width, height, frames, onProgress) {
        var bw = ByteWriter(1 << 20);
        var w8 = bw.w8, w16 = bw.w16, wStr = bw.wStr;

        // Build adaptive 256-colour palette from actual frame data
        var palette = buildAdaptivePalette(frames, width, height);
        var ditherStrength = estimateDitherStrength(palette);

        // Flatten palette to byte array for the GCT
        var palFlat = [];
        for (var pi = 0; pi < 256; pi++) {
            palFlat.push(palette[pi][0], palette[pi][1], palette[pi][2]);
        }

        // ── Header ──
        wStr('GIF89a');

        // ── Logical Screen Descriptor ──
        w16(width); w16(height);
        w8(0xF7);  // GCT flag + 256 colours (2^(7+1))
        w8(0);     // background colour index
        w8(0);     // pixel aspect ratio

        // ── Global Colour Table ──
        for (var ci = 0; ci < 768; ci++) w8(palFlat[ci]);

        // ── NETSCAPE2.0 loop extension ──
        w8(0x21); w8(0xFF); w8(0x0B);
        wStr('NETSCAPE2.0');
        w8(0x03); w8(0x01);
        w16(0);   // loop forever
        w8(0x00);

        // ── Encode each frame ──
        var colorCache = new Map(); // shared across frames for speed
        var prevIndexed = null;
        for (var fi = 0; fi < frames.length; fi++) {
            var frame = frames[fi];
            var delayCenti = Math.max(2, Math.round(frame.delay / 10));

            // Quantize RGBA → palette indices with ordered dithering
            var indexed = quantizePixels(frame.data, width, height, palette, colorCache, ditherStrength);

            // Inter-frame diff candidate: pixels identical to the previous
            // frame become the reserved transparent index 255 (disposal 1
            // keeps the previous frame). Ordered dither reproduces identical
            // indices for stable pixels, so calm content collapses into huge
            // transparent runs — but on busy gradients the diff is
            // salt-and-pepper noise that LZW-compresses WORSE than the
            // coherent dither pattern. So encode both and keep the smaller.
            var lzw = lzwEncode(8, indexed);
            var hasTransparency = false;
            if (prevIndexed) {
                var diffed = new Uint8Array(indexed.length);
                for (var di = 0; di < indexed.length; di++) {
                    diffed[di] = (indexed[di] === prevIndexed[di]) ? 255 : indexed[di];
                }
                var lzwDiff = lzwEncode(8, diffed);
                if (lzwDiff.length < lzw.length) { lzw = lzwDiff; hasTransparency = true; }
            }
            prevIndexed = indexed;

            // Graphic Control Extension
            w8(0x21); w8(0xF9); w8(0x04);
            // packed: disposal 1 (keep frame) << 2 = 0x04, + transparency flag
            w8(hasTransparency ? 0x05 : 0x04);
            w16(delayCenti); // delay (centiseconds)
            w8(0xFF);        // transparent index (ignored when flag is clear)
            w8(0x00);        // terminator

            // Image Descriptor
            w8(0x2C);
            w16(0); w16(0);           // left, top
            w16(width); w16(height);
            w8(0x00);                 // no local colour table

            // lzw was chosen above (plain vs inter-frame diff, whichever
            // compressed smaller)
            w8(8); // LZW minimum code size

            // Write LZW data as ≤255-byte sub-blocks
            var pos = 0;
            while (pos < lzw.length) {
                var sz = Math.min(255, lzw.length - pos);
                w8(sz);
                bw.wBytes(lzw, pos, pos + sz);
                pos += sz;
            }
            w8(0x00); // sub-block terminator

            if (onProgress) onProgress((fi + 1) / frames.length);

            // Yield to UI every 3 frames so the progress bar actually updates
            if (fi % 3 === 0) await sleep(0);
        }

        // ── Trailer ──
        w8(0x3B);

        return bw.toUint8Array();
    }

    // Standard GIF LZW compressor
    function lzwEncode(minCodeSize, pixels) {
        var clearCode = 1 << minCodeSize;    // 256
        var eoiCode   = clearCode + 1;       // 257
        var maxTable  = 4096;

        var codeSize, nextCode, table;

        function resetTable() {
            table = new Map();
            nextCode = eoiCode + 1;          // 258
            codeSize = minCodeSize + 1;       // 9
        }

        // Bit-packing output (typed writer — see ByteWriter note)
        var out = ByteWriter(pixels.length >> 1);
        var bits = 0, bitCount = 0;

        function emit(code) {
            bits |= code << bitCount;
            bitCount += codeSize;
            while (bitCount >= 8) {
                out.w8(bits & 0xFF);
                bits >>>= 8;
                bitCount -= 8;
            }
        }

        resetTable();
        emit(clearCode);

        var prefix = pixels[0];

        for (var i = 1; i < pixels.length; i++) {
            var suffix = pixels[i];
            var key = (prefix << 8) | suffix;

            if (table.has(key)) {
                prefix = table.get(key);
            } else {
                emit(prefix);

                if (nextCode < maxTable) {
                    table.set(key, nextCode);
                    // Bump code size when we need wider codes
                    if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
                    nextCode++;
                } else {
                    // Table full → reset
                    emit(clearCode);
                    resetTable();
                }
                prefix = suffix;
            }
        }

        emit(prefix);
        emit(eoiCode);

        // Flush remaining bits
        if (bitCount > 0) out.w8(bits & 0xFF);

        return out.toUint8Array();
    }

    // ── Still Image Export ──────────────────────────────────────────
    async function exportStill(options) {
        if (!guard()) return;
        options = options || {};

        try {
            toast('Capturing image...', 'info');
            // Wait for a fresh render so the WebGL buffer isn't cleared
            await rafPromise();
            var composite = await captureCompositeFrame();
            var format  = options.format  || cfg.imageFormat;
            var quality = options.quality || cfg.imageQuality;
            var mime = format === 'jpg' ? 'image/jpeg' : 'image/png';

            // toBlob is callback-based; wrap in a promise
            var blob = await new Promise(function (resolve, reject) {
                composite.toBlob(function (b) {
                    if (b) resolve(b); else reject(new Error('toBlob returned null'));
                }, mime, quality);
            });

            var ext = format === 'jpg' ? '.jpg' : '.png';
            var name = cfg.filenamePrefix + Date.now() + ext;
            await saveBlob(blob, name);
            toast('Image exported!', 'success');

        } catch (err) {
            console.error('[Export] Still:', err);
            toast('Export failed: ' + err.message, 'error');
        } finally {
            finish();
        }
    }

    // ── CRC-32 (for ZIP builder) ──────────────────────────────────
    var _crc32Table;
    function crc32Init() {
        _crc32Table = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            _crc32Table[i] = c;
        }
    }
    function crc32(data) {
        if (!_crc32Table) crc32Init();
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < data.length; i++) crc = _crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // ── Inline ZIP Builder (STORE, no compression) ──────────────
    function buildZIP(files) {
        // files: [{ name: string, data: Uint8Array }]
        var parts = [];     // Blob parts for memory efficiency
        var entries = [];   // metadata per file
        var offset = 0;

        // Local file headers + data
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var nameB = new TextEncoder().encode(f.name);
            var crc = crc32(f.data);
            var hdr = new ArrayBuffer(30 + nameB.length);
            var hv = new DataView(hdr);
            hv.setUint32(0,  0x04034b50, true);
            hv.setUint16(4,  20, true);
            hv.setUint16(6,  0,  true);
            hv.setUint16(8,  0,  true);  // STORE
            hv.setUint16(10, 0,  true);
            hv.setUint16(12, 0,  true);
            hv.setUint32(14, crc, true);
            hv.setUint32(18, f.data.length, true);
            hv.setUint32(22, f.data.length, true);
            hv.setUint16(26, nameB.length, true);
            hv.setUint16(28, 0, true);
            new Uint8Array(hdr).set(nameB, 30);

            entries.push({ nameB: nameB, crc: crc, size: f.data.length, offset: offset });
            parts.push(new Uint8Array(hdr), f.data);
            offset += hdr.byteLength + f.data.length;
        }

        // Central directory
        var cdStart = offset;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var cd = new ArrayBuffer(46 + e.nameB.length);
            var cv = new DataView(cd);
            cv.setUint32(0,  0x02014b50, true);
            cv.setUint16(4,  20, true);
            cv.setUint16(6,  20, true);
            cv.setUint16(8,  0,  true);
            cv.setUint16(10, 0,  true);  // STORE
            cv.setUint16(12, 0,  true);
            cv.setUint16(14, 0,  true);
            cv.setUint32(16, e.crc, true);
            cv.setUint32(20, e.size, true);
            cv.setUint32(24, e.size, true);
            cv.setUint16(28, e.nameB.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, e.offset, true);
            new Uint8Array(cd).set(e.nameB, 46);
            parts.push(new Uint8Array(cd));
            offset += cd.byteLength;
        }

        // End of central directory
        var eocd = new ArrayBuffer(22);
        var ev = new DataView(eocd);
        ev.setUint32(0,  0x06054b50, true);
        ev.setUint16(4,  0, true);
        ev.setUint16(6,  0, true);
        ev.setUint16(8,  entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, offset - cdStart, true);
        ev.setUint32(16, cdStart, true);
        ev.setUint16(20, 0, true);
        parts.push(new Uint8Array(eocd));

        return new Blob(parts, { type: 'application/zip' });
    }

    // ── PNG Sequence Export (ZIP output) ─────────────────────────
    async function exportSequence(options) {
        if (!guard()) return;
        options = options || {};

        var duration   = options.duration || cfg.sequenceDuration;
        var fps        = options.fps      || cfg.sequenceFPS;
        var format     = options.format   || cfg.sequenceFormat;
        var interval   = 1000 / fps;
        var frameCount = Math.ceil(duration / interval);

        try {
            toast('Capturing ' + frameCount + ' frames...', 'info');
            updateUI('rendering', 0);

            var mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
            var ext  = format === 'jpg' ? '.jpg' : '.png';
            var qual = format === 'jpg' ? cfg.imageQuality : undefined;

            // Electron + output folder → stream each frame straight to disk in
            // its own subfolder (no ZIP, no accumulation — 150 full-res PNGs
            // used to sit in RAM until the end). Web keeps blob-accumulate+ZIP
            // (a browser download has nowhere to stream).
            var seqDir = null;
            if (isElectron && cfg.outputFolder && fs) {
                try {
                    seqDir = path.join(cfg.outputFolder, cfg.filenamePrefix + 'sequence_' + Date.now());
                    fs.mkdirSync(seqDir, { recursive: true });
                } catch (e) {
                    console.warn('[Export] sequence folder failed, falling back to ZIP:', e.message);
                    seqDir = null;
                }
            }

            // Phase 1: capture frames (0 → 70%)
            var files = seqDir ? null : [];
            for (var i = 0; i < frameCount; i++) {
                if (_abort) { toast('Export cancelled', 'info'); return; }

                await rafPromise();
                var comp = await captureCompositeFrame();

                var blob = await new Promise(function (resolve, reject) {
                    comp.toBlob(function (b) {
                        if (b) resolve(b); else reject(new Error('toBlob returned null'));
                    }, mime, qual);
                });

                var arrBuf = await blob.arrayBuffer();
                var num = String(i).padStart(5, '0');
                if (seqDir) {
                    // Async: a 2-6 MB synchronous write per frame was a stall
                    // on the main thread thirty times a second.
                    await fs.promises.writeFile(path.join(seqDir, 'frame_' + num + ext), Buffer.from(arrBuf));
                } else {
                    files.push({ name: 'frame_' + num + ext, data: new Uint8Array(arrBuf) });
                }

                updateUI('rendering', ((i + 1) / frameCount) * (seqDir ? 95 : 70));

                if (i < frameCount - 1) await sleep(interval);
            }

            if (_abort) { toast('Export cancelled', 'info'); return; }

            if (seqDir) {
                toast('Sequence exported: ' + frameCount + ' frames → ' + seqDir, 'success');
            } else {
                // Phase 2: build ZIP (70 → 95%)
                toast('Building ZIP...', 'info');
                updateUI('rendering', 75);
                await sleep(0); // yield to UI

                var zipBlob = buildZIP(files);
                files = null; // free frame memory

                updateUI('rendering', 95);

                // Phase 3: save
                var name = cfg.filenamePrefix + 'sequence_' + Date.now() + '.zip';
                await saveBlob(zipBlob, name);
                toast('Sequence exported: ' + frameCount + ' frames (ZIP)', 'success');
            }

        } catch (err) {
            console.error('[Export] Sequence:', err);
            toast('Export failed: ' + err.message, 'error');
        } finally {
            finish();
        }
    }

    // ── Stop (for video, or any running export) ────────────────────
    function stopExport() {
        _abort = true;
        if (_recorder && _recorder.state === 'recording') {
            _recorder.stop();
        }
        toast('Export cancelled', 'info');
    }

    // ── Micro-utilities ─────────────────────────────────────────────
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function rafPromise() { return new Promise(function (r) { requestAnimationFrame(r); }); }

    // ── UI Helpers ──────────────────────────────────────────────────
    // Progress writes are throttled to ~10 Hz: the status text and the bar
    // width were written on every captured frame (60/s), each a style
    // invalidation in the sidebar during the frame the painter needs most.
    // State changes (idle ↔ recording ↔ rendering) always go through.
    var _uiLastMs = 0, _uiLastState = null;
    function updateUI(state, progress) {
        var nowMs = performance.now();
        if (state === _uiLastState && state !== 'idle' && nowMs - _uiLastMs < 100) return;
        _uiLastMs = nowMs; _uiLastState = state;
        var statusEl    = document.getElementById('exportStatus');
        var progressEl  = document.getElementById('exportProgress');
        var progressBar = document.getElementById('exportProgressBar');
        var stopBtn     = document.getElementById('exportStopBtn');

        if (statusEl) {
            if (state === 'idle') {
                statusEl.textContent = '';
                statusEl.style.display = 'none';
            } else {
                var label = state === 'recording' ? 'Recording' : 'Rendering';
                statusEl.textContent = label + '... ' + Math.round(progress) + '%';
                statusEl.style.display = 'block';
            }
        }
        if (progressEl && progressBar) {
            if (state === 'idle') { progressEl.style.display = 'none'; }
            else { progressEl.style.display = 'block'; progressBar.style.width = progress + '%'; }
        }
        if (stopBtn) {
            stopBtn.style.display = state === 'idle' ? 'none' : 'block';
        }
    }

    function toast(message, type) {
        var el = document.getElementById('export-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'export-toast';
            el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
                'padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:99999;' +
                'color:#e6edf3;pointer-events:none;display:none;' +
                'background:rgba(13,17,23,0.95);border:1px solid rgba(255,255,255,0.1);';
            document.body.appendChild(el);
        }
        var colors = { info: '#58a6ff', success: '#3fb950', warn: '#d29922', error: '#f85149' };
        el.style.borderColor = colors[type] || colors.info;
        el.textContent = message;
        el.style.display = 'block';
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.style.display = 'none'; }, 3000);
    }

    function pickOutputFolder() {
        if (!isElectron) return;
        var dialog = require('@electron/remote').dialog;
        dialog.showOpenDialog({ title: 'Select Export Folder', properties: ['openDirectory'] })
            .then(function (result) {
                if (!result.canceled && result.filePaths.length > 0) {
                    cfg.outputFolder = result.filePaths[0];
                    saveSettings();
                    toast('Export folder: ' + cfg.outputFolder, 'success');
                    var el = document.getElementById('exportFolderPath');
                    if (el) el.value = cfg.outputFolder;
                }
            });
    }

    function openOutputFolder() {
        if (isElectron && cfg.outputFolder && fs && fs.existsSync(cfg.outputFolder)) {
            shell.openPath(cfg.outputFolder);
        }
    }

    // ── Public API ──────────────────────────────────────────────────
    window.fluidExport = {
        video:    exportVideo,
        gif:      exportGIF,
        still:    exportStill,
        sequence: exportSequence,
        stop:     stopExport,
        isExporting: function () { return _busy; },
        getConfig:   function () { return Object.assign({}, cfg); },
        setConfig:   function (key, val) { cfg[key] = val; saveSettings(); },
        pickFolder:  pickOutputFolder,
        openFolder:  openOutputFolder,
        captureFrame: captureCompositeFrame
    };

    // ── Init ────────────────────────────────────────────────────────
    loadSettings();
    console.log('[Export] Ready — Video (WebM), GIF, Still (PNG/JPG), Sequence');
})();
