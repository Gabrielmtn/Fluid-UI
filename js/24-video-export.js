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
    function finish() {
        if (_stream) { _stream.getTracks().forEach(function (t) { t.stop(); }); _stream = null; }
        _recorder = null;
        _busy = false;
        _abort = false;
        updateUI('idle', 0);
    }

    function guard() {
        if (_busy) { toast('Export already in progress', 'warn'); return false; }
        _busy = true; _abort = false;
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
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                resolve(filename);
            }
        });
    }

    // ── Canvas Compositing ──────────────────────────────────────────
    function captureCompositeFrame() {
        return new Promise(function (resolve, reject) {
            var simCanvas = document.getElementById('canvas');
            if (!simCanvas) return reject(new Error('Canvas not found'));

            var w = simCanvas.width, h = simCanvas.height;

            // Snapshot WebGL canvas (may clear after this frame)
            var simSnap = document.createElement('canvas');
            simSnap.width = w; simSnap.height = h;
            simSnap.getContext('2d').drawImage(simCanvas, 0, 0);

            var displayW = simCanvas.clientWidth || w;
            var displayH = simCanvas.clientHeight || h;
            var sx = w / displayW, sy = h / displayH;

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
                    var layerDiv = document.getElementById('layer' + layer.index);
                    if (!layerDiv || layerDiv.style.display === 'none') continue;
                    var bg = layerDiv.style.backgroundImage;
                    if (!bg || bg === 'none' || bg === '') continue;
                    var m = bg.match(/url\(["']?(.+?)["']?\)/);
                    if (!m) continue;
                    var divOp = parseFloat(layerDiv.style.opacity);
                    drawList.push({
                        type: 'layer', src: m[1],
                        x: (layer.x || 0) * sx, y: (layer.y || 0) * sy,
                        scaleX: layer.scaleX || 1, scaleY: layer.scaleY || 1,
                        rotation: layer.rotation || 0,
                        opacity: isNaN(divOp) ? 1 : divOp
                    });
                }
            }

            // Load layer images in parallel
            Promise.all(drawList.map(function (task) {
                if (task.type === 'sim') return Promise.resolve(null);
                return new Promise(function (res) {
                    var img = new Image();
                    img.onload = function () { res(img); };
                    img.onerror = function () { res(null); };
                    img.src = task.src;
                });
            })).then(function (images) {
                var comp = document.createElement('canvas');
                comp.width = w; comp.height = h;
                var ctx = comp.getContext('2d');

                drawList.forEach(function (task, idx) {
                    ctx.globalAlpha = task.opacity;
                    if (task.type === 'sim') {
                        ctx.drawImage(simSnap, 0, 0);
                    } else {
                        var img = images[idx];
                        if (!img) return;
                        ctx.save();
                        ctx.translate(w / 2 + task.x, h / 2 + task.y);
                        ctx.rotate(task.rotation * Math.PI / 180);
                        ctx.scale(task.scaleX, task.scaleY);
                        ctx.drawImage(img, -w / 2, -h / 2, w, h);
                        ctx.restore();
                    }
                    ctx.globalAlpha = 1;
                });

                if (cfg.compositeOverlays && window.brandingOverlays && window.brandingOverlays.compositeOntoCanvas) {
                    window.brandingOverlays.compositeOntoCanvas(ctx, { width: w, height: h });
                }
                resolve(comp);
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

            // Prefer MP4 (inherently seekable) → fall back to WebM
            var mimeType = ''; var ext = 'webm';
            var mpTests = [
                'video/mp4;codecs=avc1,opus',
                'video/mp4;codecs=avc1',
                'video/mp4'
            ];
            for (var mi = 0; mi < mpTests.length; mi++) {
                if (MediaRecorder.isTypeSupported(mpTests[mi])) {
                    mimeType = mpTests[mi]; ext = 'mp4'; break;
                }
            }
            if (!mimeType) {
                if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
                    mimeType = 'video/webm;codecs=vp9';
                else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))
                    mimeType = 'video/webm;codecs=vp8';
                else
                    mimeType = 'video/webm';
            }

            var chunks = [];
            _recorder = new MediaRecorder(_stream, {
                mimeType: mimeType,
                videoBitsPerSecond: cfg.videoBitrate
            });
            _recorder.ondataavailable = function (e) {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            // Wrap onstop in a Promise so we can await it
            var blobReady = new Promise(function (resolve, reject) {
                _recorder.onstop  = function () { resolve(new Blob(chunks, { type: mimeType })); };
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

            while (!_abort) {
                var elapsed = Date.now() - t0;
                if (elapsed >= duration) break;

                await rafPromise();

                // Throttle to target FPS
                var now = Date.now();
                if (now - lastFrame < frameInterval * 0.8) continue;
                lastFrame = now;

                // Composite all visible layers onto the recording canvas
                var comp = await captureCompositeFrame();
                recCtx.clearRect(0, 0, recCanvas.width, recCanvas.height);
                recCtx.drawImage(comp, 0, 0);

                // Push the frame to the encoder
                if (track.requestFrame) track.requestFrame();

                updateUI('recording', Math.min(100, (elapsed / duration) * 100));
            }

            // Stop the recorder (fires onstop → resolves blobReady)
            if (_recorder && _recorder.state === 'recording') _recorder.stop();
            if (_abort) { toast('Export cancelled', 'info'); return; }

            var blob = await blobReady;

            // WebM needs post-processing for proper seeking; MP4 is fine as-is
            if (ext === 'webm') {
                updateUI('rendering', 95);
                blob = await fixWebmForSeeking(blob, duration);
            }

            var name = cfg.filenamePrefix + Date.now() + '.' + ext;
            await saveBlob(blob, name);
            toast('Video exported! (' + ext.toUpperCase() + ')', 'success');

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
            var frames = [];
            for (var i = 0; i < frameCount; i++) {
                if (_abort) { toast('Export cancelled', 'info'); return; }

                // Wait for a fresh render
                await rafPromise();

                var comp = await captureCompositeFrame();
                var small = document.createElement('canvas');
                small.width = ow; small.height = oh;
                small.getContext('2d').drawImage(comp, 0, 0, ow, oh);
                var imgData = small.getContext('2d').getImageData(0, 0, ow, oh);
                frames.push({ data: imgData.data, delay: frameDelay });

                updateUI('rendering', ((i + 1) / frameCount) * 50);

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
            await saveBlob(blob, name);
            toast('GIF exported!', 'success');

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

        // Median-cut: split sample set into 256 boxes
        var boxes = [samples];
        while (boxes.length < 256) {
            var bestBI = -1, bestRange = -1, bestCh = 0;
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
                    var rng = hi - lo;
                    if (rng > bestRange) { bestRange = rng; bestBI = bi; bestCh = ch; }
                }
            }
            if (bestRange <= 0) break;
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
        while (pal.length < 256) pal.push([0, 0, 0]);
        return pal;
    }

    // Nearest-colour lookup (cached). Cache is shared across frames.
    function findNearest(r, g, b, palette, cache) {
        // 6-bit per channel key (18-bit, 262k buckets) — within ±2 of true colour
        var key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        if (cache.has(key)) return cache.get(key);
        var bestIdx = 0, bestDist = 0x7FFFFFFF;
        for (var ci = 0; ci < 256; ci++) {
            var dr = r - palette[ci][0];
            var dg = g - palette[ci][1];
            var db = b - palette[ci][2];
            var dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) { bestDist = dist; bestIdx = ci; }
        }
        cache.set(key, bestIdx);
        return bestIdx;
    }

    // Floyd-Steinberg error-diffusion dithering + palette quantization
    function quantizePixels(data, width, height, palette, cache) {
        var npix = width * height;
        // Mutable float copy so error can be diffused to neighbours
        var pix = new Float32Array(npix * 3);
        for (var i = 0; i < npix; i++) {
            var o4 = i * 4, o3 = i * 3;
            pix[o3] = data[o4]; pix[o3 + 1] = data[o4 + 1]; pix[o3 + 2] = data[o4 + 2];
        }

        var indexed = new Uint8Array(npix);

        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var idx = y * width + x;
                var p = idx * 3;

                // Clamp current (error-adjusted) colour to 0-255
                var cr = Math.max(0, Math.min(255, Math.round(pix[p])));
                var cg = Math.max(0, Math.min(255, Math.round(pix[p + 1])));
                var cb = Math.max(0, Math.min(255, Math.round(pix[p + 2])));

                var ci = findNearest(cr, cg, cb, palette, cache);
                indexed[idx] = ci;

                // Quantization error
                var er = cr - palette[ci][0];
                var eg = cg - palette[ci][1];
                var eb = cb - palette[ci][2];

                // Distribute error to 4 neighbours (Floyd-Steinberg weights)
                //   * 7/16 → right
                //   3/16 ← ↓   5/16 ↓   1/16 → ↓
                if (x + 1 < width) {
                    var j = p + 3;
                    pix[j]     += er * 0.4375; // 7/16
                    pix[j + 1] += eg * 0.4375;
                    pix[j + 2] += eb * 0.4375;
                }
                if (y + 1 < height) {
                    if (x > 0) {
                        var j = p + (width - 1) * 3;
                        pix[j]     += er * 0.1875; // 3/16
                        pix[j + 1] += eg * 0.1875;
                        pix[j + 2] += eb * 0.1875;
                    }
                    var j = p + width * 3;
                    pix[j]     += er * 0.3125; // 5/16
                    pix[j + 1] += eg * 0.3125;
                    pix[j + 2] += eb * 0.3125;
                    if (x + 1 < width) {
                        var j = p + (width + 1) * 3;
                        pix[j]     += er * 0.0625; // 1/16
                        pix[j + 1] += eg * 0.0625;
                        pix[j + 2] += eb * 0.0625;
                    }
                }
            }
        }
        return indexed;
    }

    // ── Inline GIF89a Encoder with LZW ─────────────────────────────
    // Produces valid animated GIF89a. No external libraries.
    async function encodeGIF(width, height, frames, onProgress) {
        var buf = [];
        var w8  = function (v) { buf.push(v & 0xFF); };
        var w16 = function (v) { buf.push(v & 0xFF, (v >> 8) & 0xFF); };
        var wStr = function (s) { for (var i = 0; i < s.length; i++) buf.push(s.charCodeAt(i)); };

        // Build adaptive 256-colour palette from actual frame data
        var palette = buildAdaptivePalette(frames, width, height);

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
        for (var fi = 0; fi < frames.length; fi++) {
            var frame = frames[fi];
            var delayCenti = Math.max(2, Math.round(frame.delay / 10));

            // Graphic Control Extension
            w8(0x21); w8(0xF9); w8(0x04);
            w8(0x00);        // disposal: none
            w16(delayCenti); // delay (centiseconds)
            w8(0x00);        // no transparency
            w8(0x00);        // terminator

            // Image Descriptor
            w8(0x2C);
            w16(0); w16(0);           // left, top
            w16(width); w16(height);
            w8(0x00);                 // no local colour table

            // Quantize RGBA → palette indices with Floyd-Steinberg dithering
            var indexed = quantizePixels(frame.data, width, height, palette, colorCache);

            // LZW-compress indexed pixels
            var lzw = lzwEncode(8, indexed);
            w8(8); // LZW minimum code size

            // Write LZW data as ≤255-byte sub-blocks
            var pos = 0;
            while (pos < lzw.length) {
                var sz = Math.min(255, lzw.length - pos);
                w8(sz);
                for (var si = 0; si < sz; si++) w8(lzw[pos++]);
            }
            w8(0x00); // sub-block terminator

            if (onProgress) onProgress((fi + 1) / frames.length);

            // Yield to UI every 3 frames so the progress bar actually updates
            if (fi % 3 === 0) await sleep(0);
        }

        // ── Trailer ──
        w8(0x3B);

        return new Uint8Array(buf);
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

        // Bit-packing output
        var output = [];
        var bits = 0, bitCount = 0;

        function emit(code) {
            bits |= code << bitCount;
            bitCount += codeSize;
            while (bitCount >= 8) {
                output.push(bits & 0xFF);
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
        if (bitCount > 0) output.push(bits & 0xFF);

        return output;
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

            // Phase 1: capture frames as PNG/JPG blobs (0 → 70%)
            var files = [];
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
                files.push({ name: 'frame_' + num + ext, data: new Uint8Array(arrBuf) });

                updateUI('rendering', ((i + 1) / frameCount) * 70);

                if (i < frameCount - 1) await sleep(interval);
            }

            if (_abort) { toast('Export cancelled', 'info'); return; }

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
    function updateUI(state, progress) {
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
