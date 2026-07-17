// Depth-Based Collision System
// Uses Depth Anything V2 (via Transformers.js) to generate depth maps for fluid obstacles
// Integrates with the existing layer + mask system (sam-mask pattern)

class DepthEstimator {
    constructor() {
        this.model = null;
        this.processor = null;
        this.pipeline = null;
        this.isReady = false;
        this.isLoading = false;
        this.transformers = null;
    }

    // Share Transformers.js with SAMSegmenter if already loaded
    async loadTransformers() {
        // Check if SAM already loaded Transformers.js
        if (window.samSegmenter && window.samSegmenter.transformers) {
            this.transformers = window.samSegmenter.transformers;
            console.log('📦 DepthEstimator: Reusing Transformers.js from SAM');
            return this.transformers;
        }

        if (this.transformers) return this.transformers;

        console.log('📦 DepthEstimator: Loading Transformers.js library...');

        // Same Electron workaround as SAMSegmenter
        const hadProcess = typeof globalThis.process !== 'undefined';
        const originalProcess = globalThis.process;
        try {
            if (hadProcess) {
                try {
                    globalThis.process = undefined;
                } catch (e) {
                    console.warn('⚠️ Could not temporarily override globalThis.process:', e.message);
                }
            }
            this.transformers = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        } finally {
            if (hadProcess) {
                globalThis.process = originalProcess;
            }
        }

        const { env } = this.transformers;
        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.useBrowserCache = true;

        // Electron cache directory
        if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
            try {
                const path = require('path');
                const os = require('os');
                env.cacheDir = path.join(os.homedir(), '.cache', 'fluid-ui-models');
            } catch (e) {}
        }

        // Share back to SAM if it hasn't loaded yet
        if (window.samSegmenter && !window.samSegmenter.transformers) {
            window.samSegmenter.transformers = this.transformers;
        }

        console.log('✅ DepthEstimator: Transformers.js loaded');
        return this.transformers;
    }

    async initialize(onProgress) {
        if (this.isReady) return;
        if (this.isLoading) return;

        this.isLoading = true;
        console.log('🤖 Loading Depth Anything V2 model...');

        this.showDownloadModal();

        try {
            this.updateDownloadProgress('Loading AI library...', 5);
            const transformers = await this.loadTransformers();
            const { pipeline, env } = transformers;

            this.updateDownloadProgress('Downloading depth model...', 10);

            this.pipeline = await pipeline('depth-estimation', 'Xenova/depth-anything-small-hf', {
                quantized: true,
                progress_callback: (progress) => {
                    if (progress.status === 'progress' && progress.total) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        const fileName = progress.file ? progress.file.split('/').pop() : 'model';
                        this.updateDownloadProgress('Downloading: ' + fileName, 10 + Math.floor(percent * 0.8));
                        if (onProgress) onProgress('Downloading ' + fileName + '...', percent);
                    } else if (progress.status === 'done') {
                        this.updateDownloadProgress('Initializing model...', 95);
                    }
                }
            });

            this.updateDownloadProgress('Complete!', 100);
            this.isReady = true;
            this.isLoading = false;
            console.log('✅ Depth Anything V2 model loaded');

            setTimeout(() => { this.hideDownloadModal(); }, 1200);
        } catch (error) {
            console.error('❌ Failed to load depth model:', error);
            this.isLoading = false;
            this.updateDownloadProgress('Failed: ' + error.message, 0);
            setTimeout(() => {
                this.hideDownloadModal();
                alert('⚠️ Depth Model Error\n\n' + error.message);
            }, 2000);
        }
    }

    // Estimate depth from an image source
    // Returns { data: Uint8Array, width: number, height: number } or null
    async estimateDepth(imageSource) {
        if (!this.isReady || !this.pipeline) {
            console.warn('⚠️ Depth model not ready');
            return null;
        }

        // Concurrency guard — skip if a previous estimation is still running
        if (this._running) {
            console.warn('⚠️ Depth estimation already in progress, skipping');
            return null;
        }
        this._running = true;

        try {
            const { RawImage } = this.transformers;
            const MAX_DIM = 512; // cap input to prevent OOM
            let rawImage;

            if (imageSource instanceof HTMLCanvasElement || imageSource instanceof HTMLVideoElement) {
                // Reuse a single downsample canvas
                var srcW, srcH;
                if (imageSource instanceof HTMLVideoElement) {
                    srcW = imageSource.videoWidth || 640;
                    srcH = imageSource.videoHeight || 480;
                } else {
                    srcW = imageSource.width;
                    srcH = imageSource.height;
                }
                // Downsample if needed
                var scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
                var dw = Math.round(srcW * scale);
                var dh = Math.round(srcH * scale);
                if (!this._dsCanvas) {
                    this._dsCanvas = document.createElement('canvas');
                    this._dsCtx = this._dsCanvas.getContext('2d');
                }
                if (this._dsCanvas.width !== dw || this._dsCanvas.height !== dh) {
                    this._dsCanvas.width = dw;
                    this._dsCanvas.height = dh;
                }
                this._dsCtx.drawImage(imageSource, 0, 0, dw, dh);
                // JPEG is ~10x faster to encode than PNG
                var dataUrl = this._dsCanvas.toDataURL('image/jpeg', 0.8);
                rawImage = await RawImage.fromURL(dataUrl);
            } else if (imageSource instanceof HTMLImageElement) {
                rawImage = await RawImage.fromURL(imageSource.src);
            } else if (typeof imageSource === 'string') {
                rawImage = await RawImage.fromURL(imageSource);
            } else {
                console.error('❌ Unsupported image source type');
                this._running = false;
                return null;
            }

            // Run depth estimation
            const output = await this.pipeline(rawImage);

            const depthImage = output.depth;
            const width = depthImage.width;
            const height = depthImage.height;
            const depthData = depthImage.data;

            // Normalize to Uint8Array (0-255) — single pass for min/max + normalize
            const len = depthData.length;
            const normalized = new Uint8Array(len);
            var min = depthData[0], max = depthData[0];
            for (var i = 1; i < len; i++) {
                var v = depthData[i];
                if (v < min) min = v;
                else if (v > max) max = v;
            }
            var range = max - min || 1;
            var invRange = 255 / range;
            for (var i = 0; i < len; i++) {
                normalized[i] = ((depthData[i] - min) * invRange + 0.5) | 0;
            }

            console.log('✅ Depth estimation complete:', width, 'x', height);
            this._running = false;
            return { data: normalized, width: width, height: height };
        } catch (error) {
            console.error('❌ Depth estimation failed:', error);
            this._running = false;
            return null;
        }
    }

    // ─── Download Modal (reuses SAM pattern) ───────────────────────

    showDownloadModal() {
        let modal = document.getElementById('depthDownloadModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'depthDownloadModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);backdrop-filter:blur(8px);z-index:10004;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';
            modal.innerHTML = '<div style="background:linear-gradient(180deg,#1a1f2a,#0f141b);border:1px solid rgba(255,120,80,0.3);border-radius:16px;padding:32px;max-width:500px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.8);text-align:center;">' +
                '<div style="font-size:48px;margin-bottom:16px;">🧱</div>' +
                '<h2 style="color:#ff8850;margin:0 0 12px 0;font-size:24px;font-weight:600;">Downloading Depth Model</h2>' +
                '<p id="depthDownloadMessage" style="color:#8b949e;margin:0 0 24px 0;font-size:14px;">First-time setup: Downloading Depth Anything V2...</p>' +
                '<div style="background:rgba(0,0,0,0.3);border-radius:8px;height:8px;overflow:hidden;margin-bottom:12px;">' +
                '<div id="depthDownloadBar" style="background:linear-gradient(90deg,#e85d26,#ff8850);height:100%;width:0%;transition:width 0.3s ease;box-shadow:0 0 12px rgba(255,136,80,0.6);"></div></div>' +
                '<div id="depthDownloadPercent" style="color:#ff8850;font-size:18px;font-weight:600;font-family:monospace;">0%</div>' +
                '<div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);color:#6e7681;font-size:12px;line-height:1.6;">' +
                '💾 Model size: ~25MB<br>⚡ One-time download • Cached for instant future use<br>🔒 Runs entirely in your browser</div></div>';
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
    }

    hideDownloadModal() {
        var modal = document.getElementById('depthDownloadModal');
        if (modal) {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(function () { modal.style.display = 'none'; modal.style.animation = ''; }, 300);
        }
    }

    updateDownloadProgress(message, percent) {
        var msg = document.getElementById('depthDownloadMessage');
        var bar = document.getElementById('depthDownloadBar');
        var pct = document.getElementById('depthDownloadPercent');
        if (msg) msg.textContent = message;
        if (bar) bar.style.width = percent + '%';
        if (pct) pct.textContent = percent + '%';
    }
}

// ─── Collision Layer Manager ────────────────────────────────────────

(function () {
    'use strict';

    window.depthEstimator = new DepthEstimator();

    // Collision state
    var collisionEnabled = false;
    var obstacleCanvas = null;   // offscreen canvas for rasterizing masks
    var _obsBlurCanvas = null, _obsBlurCtx = null; // sim-scale edge smoothing (D0.5 rev 3)
    var obstacleCtx = null;
    var webcamStreams = {};       // layerIndex → { stream, video, intervalId }
    // Procedural obstacle source: a draw(ctx, simW, simH) callback composited
    // over the layer-based obstacles on every recomposite (incl. resize), so
    // code-drawn colliders (e.g. audio-scene EQ lane walls) survive FBO
    // rebuilds without needing a fake collision layer.
    var proceduralDraw = null;

    // Expose collision API
    window.collisionLayers = {
        get enabled() { return collisionEnabled; },
        set enabled(v) { collisionEnabled = !!v; if (!v) clearObstacle(); },

        // Create a collision layer from a source
        createFromImage: createCollisionFromImage,
        createFromWebcam: createCollisionFromWebcam,
        createFromSnapshot: createCollisionFromSnapshot,
        createFromLayerMask: createCollisionFromLayerMask,
        createFromSketch: createFromSketch,
        createFromMask: createFromMask, // D3: active Mask → collider
        setSketchLive: setSketchLive,   // D3/D4: live source → collider binding
        setMaskLive: setMaskLive,       // D3/D4: bind the active Mask live
        isSketchLive: isSketchLive,
        boundColliderSource: boundColliderSource,

        // Refresh depth estimation for a layer
        refreshDepth: refreshLayerDepth,

        // Remove webcam stream for a layer
        removeWebcam: removeWebcam,

        // Recomposite all collision layers into the obstacle texture
        updateObstacleFromLayers: updateObstacleFromLayers,

        // Install/remove a procedural obstacle source (draw(ctx, simW, simH)).
        // Pass null to remove; collision auto-disables if no layer obstacles
        // remain either.
        setProcedural: setProcedural,
    };

    function setProcedural(fn) {
        proceduralDraw = (typeof fn === 'function') ? fn : null;
        if (proceduralDraw) {
            collisionEnabled = true;
            updateObstacleFromLayers();
        } else {
            var hasLayers = !!(window.layers && window.layers.some(function (l) { return l.isCollision; }));
            if (hasLayers) {
                updateObstacleFromLayers();
            } else {
                // Clear synchronously: the rAF recomposite would early-return
                // once collisionEnabled is false and leave the walls burned in.
                collisionEnabled = false;
                clearObstacle();
            }
        }
    }

    // Create a collision layer from an existing image layer's mask and/or
    // threshold setting.  Three modes:
    //   1. Layer has mask shapes → rasterize shapes (+ optional feather)
    //   2. No shapes but threshold > 0 → luminance-based alpha from image
    //   3. No shapes and threshold 0 → full-image solid collision
    function createCollisionFromLayerMask(layerIndex) {
        if (!window.layers) { console.warn('Layer system not available'); return; }
        var layer = null;
        for (var li = 0; li < window.layers.length; li++) {
            if (window.layers[li].index === layerIndex) { layer = window.layers[li]; break; }
        }
        if (!layer) { console.warn('Layer not found:', layerIndex); return; }

        var hasShapes = layer.mask && layer.mask.shapes && layer.mask.shapes.length > 0;
        var threshold = typeof layer.threshold === 'number' ? layer.threshold : 0;

        if (hasShapes) {
            _collisionFromShapes(layer);
        } else if (threshold > 0) {
            _collisionFromThreshold(layer);
        } else {
            _collisionFromFullImage(layer);
        }
    }

    // ── Mode 1: Rasterize mask shapes into collision data ──────────
    function _collisionFromShapes(layer) {
        var canvasEl = document.getElementById('canvas');
        var cw = canvasEl ? canvasEl.width : 1920;
        var ch = canvasEl ? canvasEl.height : 1080;

        var scale = Math.min(1, 512 / cw);
        var tw = Math.round(cw * scale);
        var th = Math.round(ch * scale);

        var maskCanvas = document.createElement('canvas');
        maskCanvas.width = tw;
        maskCanvas.height = th;
        var ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
        ctx.scale(scale, scale);

        var mode = layer.mask.mode || 'show';

        if (mode === 'show') {
            ctx.clearRect(0, 0, cw, ch);
            _drawMaskShapesForCollision(ctx, layer.mask.shapes);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.globalCompositeOperation = 'destination-out';
            _drawMaskShapesForCollision(ctx, layer.mask.shapes);
            ctx.globalCompositeOperation = 'source-over';
        }

        // Apply feathering from the layer's threshold slider
        var feather = typeof layer.threshold === 'number' ? layer.threshold : 0;
        if (feather > 0 && typeof window._featherMaskAlpha === 'function') {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            var featherRadius = Math.max(1, Math.round((feather / 100) * 20 * scale));
            window._featherMaskAlpha(ctx, tw, th, featherRadius);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        var pixels = ctx.getImageData(0, 0, tw, th);
        var collisionData = new Uint8Array(tw * th);
        for (var i = 0; i < collisionData.length; i++) {
            collisionData[i] = pixels.data[i * 4 + 3];
        }

        var depth = { width: tw, height: th, data: collisionData };
        var thumbUrl = layer.originalData || layer.data;
        addCollisionLayer(depth, thumbUrl, (layer.title || 'Layer') + ' Collision', _transformOf(layer));
    }

    // Copy a source layer's transform so the generated collision layer
    // lands exactly where the source layer is displayed on screen.
    function _transformOf(layer) {
        return {
            x: layer.x || 0,
            y: layer.y || 0,
            scaleX: layer.scaleX || 1,
            scaleY: layer.scaleY || 1,
            rotation: layer.rotation || 0
        };
    }

    // ── Mode 2: Luminance-threshold alpha from original image ─────
    // Mirrors the rudimentary mask logic in 05-fluid-sim.js:
    // pixels whose luminance falls below the threshold become transparent
    // (non-collision), brighter pixels become collision boundaries.
    function _collisionFromThreshold(layer) {
        var imgSrc = layer.originalData || layer.data;
        if (!imgSrc) { console.warn('Layer has no image data'); return; }

        var img = new Image();
        img.onload = function () {
            var canvasEl = document.getElementById('canvas');
            var cw = canvasEl ? canvasEl.width : 1920;
            var ch = canvasEl ? canvasEl.height : 1080;

            var scale = Math.min(1, 512 / cw);
            var tw = Math.round(cw * scale);
            var th = Math.round(ch * scale);

            var c = document.createElement('canvas');
            c.width = tw;
            c.height = th;
            var ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, tw, th);

            var imageData = ctx.getImageData(0, 0, tw, th);
            var data = imageData.data;
            var thresholdValue = Math.round((layer.threshold / 100) * 255);
            var collisionData = new Uint8Array(tw * th);

            for (var i = 0; i < collisionData.length; i++) {
                var idx = i * 4;
                var lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                collisionData[i] = lum >= thresholdValue ? 255 : 0;
            }

            var depth = { width: tw, height: th, data: collisionData };
            addCollisionLayer(depth, imgSrc, (layer.title || 'Layer') + ' Collision', _transformOf(layer));
        };
        img.src = imgSrc;
    }

    // ── Mode 3: Full image as solid collision ─────────────────────
    function _collisionFromFullImage(layer) {
        var imgSrc = layer.originalData || layer.data;
        if (!imgSrc) { console.warn('Layer has no image data'); return; }

        var img = new Image();
        img.onload = function () {
            var canvasEl = document.getElementById('canvas');
            var cw = canvasEl ? canvasEl.width : 1920;
            var ch = canvasEl ? canvasEl.height : 1080;

            var scale = Math.min(1, 512 / cw);
            var tw = Math.round(cw * scale);
            var th = Math.round(ch * scale);

            var c = document.createElement('canvas');
            c.width = tw;
            c.height = th;
            var ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, tw, th);

            // Use image alpha: opaque pixels → collision, transparent → no collision
            var imageData = ctx.getImageData(0, 0, tw, th);
            var data = imageData.data;
            var collisionData = new Uint8Array(tw * th);
            for (var i = 0; i < collisionData.length; i++) {
                collisionData[i] = data[i * 4 + 3]; // alpha channel
            }

            var depth = { width: tw, height: th, data: collisionData };
            addCollisionLayer(depth, imgSrc, (layer.title || 'Layer') + ' Collision', _transformOf(layer));
        };
        img.src = imgSrc;
    }

    // Helper: draw all mask shapes as white fills for collision rasterization
    function _drawMaskShapesForCollision(ctx, shapes) {
        for (var i = 0; i < shapes.length; i++) {
            var shape = shapes[i];
            ctx.fillStyle = '#fff';
            var rotation = shape.rotation || 0;
            if (rotation !== 0) {
                var cx = shape.x + shape.width / 2;
                var cy = shape.y + shape.height / 2;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }
            // Use the shared drawMaskShape from 05-fluid-sim.js if available
            if (typeof window._drawMaskShape === 'function') {
                window._drawMaskShape(ctx, shape);
            } else {
                // Minimal fallback for basic shapes
                ctx.beginPath();
                if (shape.type === 'circle') {
                    ctx.arc(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width / 2, 0, Math.PI * 2);
                } else if (shape.type === 'ellipse') {
                    ctx.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2);
                } else {
                    ctx.rect(shape.x || 0, shape.y || 0, shape.width || 100, shape.height || 100);
                }
                ctx.fill();
            }
            if (rotation !== 0) ctx.restore();
        }
    }

    // Create collision layer from an image file
    async function createCollisionFromImage(file) {
        if (!window.depthEstimator.isReady) {
            await window.depthEstimator.initialize();
        }
        if (!window.depthEstimator.isReady) return;

        var reader = new FileReader();
        reader.onload = async function (ev) {
            var img = new Image();
            img.onload = async function () {
                var depth = await window.depthEstimator.estimateDepth(img);
                if (!depth) return;

                // Create an image layer using the depth as both visual and mask source
                addCollisionLayer(depth, img.src, file.name || 'Image');
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Create collision layer from webcam
    async function createCollisionFromWebcam() {
        if (!window.depthEstimator.isReady) {
            await window.depthEstimator.initialize();
        }
        if (!window.depthEstimator.isReady) return;

        try {
            var stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 } }
            });

            var video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
            document.body.appendChild(video);
            await video.play();

            // Wait for video dimensions
            await new Promise(function (resolve) {
                if (video.videoWidth > 0) { resolve(); return; }
                video.addEventListener('loadeddata', resolve, { once: true });
            });

            // Capture first frame for depth
            var oc = document.createElement('canvas');
            oc.width = video.videoWidth;
            oc.height = video.videoHeight;
            var octx = oc.getContext('2d');
            // Mirror horizontally
            octx.translate(oc.width, 0);
            octx.scale(-1, 1);
            octx.drawImage(video, 0, 0);
            octx.setTransform(1, 0, 0, 1, 0, 0);

            var depth = await window.depthEstimator.estimateDepth(oc);
            if (!depth) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }

            var thumbUrl = oc.toDataURL('image/jpeg', 0.5);
            var layerIndex = addCollisionLayer(depth, thumbUrl, 'Webcam');

            // Store webcam stream for periodic updates
            // Uses setTimeout chain (not setInterval) so overlapping async calls can't pile up
            if (layerIndex !== null) {
                var updateDelay = 500; // ms between updates (~2 FPS)
                var timerId = 0;
                var stopped = false;

                function scheduleNext() {
                    if (stopped) return;
                    timerId = setTimeout(doUpdate, updateDelay);
                }

                async function doUpdate() {
                    if (stopped || !webcamStreams[layerIndex]) return;
                    if (!window.depthEstimator.isReady || window.depthEstimator._running) {
                        scheduleNext();
                        return;
                    }

                    octx.save();
                    octx.translate(oc.width, 0);
                    octx.scale(-1, 1);
                    octx.drawImage(video, 0, 0);
                    octx.restore();

                    var newDepth = await window.depthEstimator.estimateDepth(oc);
                    if (newDepth && webcamStreams[layerIndex]) {
                        updateLayerDepthMask(layerIndex, newDepth);
                    }
                    scheduleNext();
                }

                scheduleNext();

                webcamStreams[layerIndex] = {
                    stream: stream, video: video,
                    get intervalId() { return timerId; },
                    stop: function () { stopped = true; clearTimeout(timerId); }
                };
            }
        } catch (error) {
            console.error('❌ Webcam capture failed:', error);
            alert('⚠️ Webcam access failed: ' + error.message);
        }
    }

    // Create collision layer from current canvas snapshot
    async function createCollisionFromSnapshot() {
        if (!window.depthEstimator.isReady) {
            await window.depthEstimator.initialize();
        }
        if (!window.depthEstimator.isReady) return;

        var canvas = document.getElementById('canvas');
        if (!canvas) return;

        var depth = await window.depthEstimator.estimateDepth(canvas);
        if (!depth) return;

        var thumbUrl = canvas.toDataURL('image/jpeg', 0.5);
        addCollisionLayer(depth, thumbUrl, 'Snapshot');
    }

    // Add a collision layer to the layer system.
    // opts: { x, y, scaleX, scaleY, rotation, visible } — transform is copied
    // from the source layer so the collision lines up with it on screen.
    function addCollisionLayer(depth, thumbnailUrl, name, opts) {
        opts = opts || {};
        var sourceFBO = _resolveSourceFBO(opts.source);
        if (!depth && sourceFBO) {
            depth = { width: 1, height: 1, data: new Uint8Array(1) };
        }
        if (!depth) return null;
        // Use the existing layer capture mechanism
        if (typeof window.layers === 'undefined' || typeof window.renderLayers !== 'function') {
            console.warn('⚠️ Layer system not available');
            return null;
        }

        // Create a visual representation from the depth map
        var depthCanvas = document.createElement('canvas');
        depthCanvas.width = depth.width;
        depthCanvas.height = depth.height;
        var dctx = depthCanvas.getContext('2d');
        var imgData = dctx.createImageData(depth.width, depth.height);
        for (var i = 0; i < depth.data.length; i++) {
            var v = depth.data[i];
            imgData.data[i * 4] = v;
            imgData.data[i * 4 + 1] = v;
            imgData.data[i * 4 + 2] = v;
            imgData.data[i * 4 + 3] = 255;
        }
        dctx.putImageData(imgData, 0, 0);
        var depthDataUrl = depthCanvas.toDataURL();

        // Find the next layer index
        var maxIndex = 0;
        window.layers.forEach(function (l) { if (l.index > maxIndex) maxIndex = l.index; });
        var newIndex = maxIndex + 1;

        // Create layer div
        var canvasEl = document.getElementById('canvas');
        var canvasWrapper = document.getElementById('canvas-wrapper');
        if (!canvasWrapper) canvasWrapper = canvasEl ? canvasEl.parentElement : document.body;

        // REUSE the pre-existing static layerN div (index.html #layers-container).
        // Creating a second element with the same id makes it unreachable —
        // getElementById always returns the static one, so toggle/tint/delete
        // hit that while the duplicate stays on screen as an unhideable
        // "white outline". Only create a div if the slot has no static one.
        var layerDiv = document.getElementById('layer' + newIndex);
        if (!layerDiv) {
            layerDiv = document.createElement('div');
            layerDiv.id = 'layer' + newIndex;
            // Must be .background-layer — the class regular layers use for
            // absolute fill-the-wrapper positioning ('canvas-layer' has no CSS,
            // which left collision divs 0px tall and permanently invisible)
            layerDiv.className = 'background-layer';
            var layersHost = document.getElementById('layers-container') || canvasWrapper;
            layersHost.appendChild(layerDiv);
        }
        layerDiv.style.backgroundImage = 'url(' + depthDataUrl + ')';
        // Stretch to the div (which fills the wrapper) — same mapping the
        // obstacle compositor uses, so preview and collision stay aligned.
        layerDiv.style.backgroundSize = '100% 100%';
        layerDiv.style.backgroundPosition = 'center';
        var startVisible = opts.visible !== false; // visible by default so the mask can be seen/aligned
        layerDiv.style.display = startVisible ? 'block' : 'none';
        layerDiv.style.opacity = '0.55';

        // Add to layers array
        var layer = {
            index: newIndex,
            data: depthDataUrl,
            originalData: thumbnailUrl || depthDataUrl,
            title: '🧱 ' + (name || 'Collision'),
            visible: startVisible,
            active: false,
            threshold: 0,
            x: opts.x || 0, y: opts.y || 0,
            scaleX: opts.scaleX || 1, scaleY: opts.scaleY || 1,
            rotation: opts.rotation || 0,
            isCollision: true,
            collisionMode: 'block',   // block | slow | deflect
            // 1.0 = fully rigid (2026-07-15): the strength response is now a
            // full-range cubic — the old curve saturated at 0.5, so the old
            // 0.7 default meant "solid". New layers start solid; the slider's
            // lower range is graded permeability (leaky/porous walls).
            collisionStrength: 1.0,
            collisionSource: opts.source ? { kind: opts.source.kind, id: opts.source.id } : null,
            mask: {
                enabled: true,
                mode: 'show',
                shapes: [{
                    type: 'depth-mask',
                    x: 0,
                    y: 0,
                    width: canvasEl ? canvasEl.width : depth.width,
                    height: canvasEl ? canvasEl.height : depth.height,
                    depthData: new Uint8Array(depth.data),
                    depthWidth: depth.width,
                    depthHeight: depth.height,
                    threshold: 128,
                    invert: false
                }]
            }
        };

        window.layers.push(layer);

        // Add to layer order at the TOP so the mask preview isn't hidden
        // behind the (opaque) sim canvas
        if (typeof window.layerOrder !== 'undefined') {
            window.layerOrder.unshift({ type: 'layer', id: newIndex });
        }

        // Render and update
        window.renderLayers();

        // Update obstacle texture
        collisionEnabled = true;
        updateObstacleFromLayers();

        console.log('🧱 Collision layer added:', name, 'index:', newIndex);
        return newIndex;
    }

    // Update depth mask data for an existing layer
    function updateLayerDepthMask(layerIndex, depth) {
        if (!window.layers) return;
        var layer = window.layers.find(function (l) { return l.index === layerIndex; });
        if (!layer || !layer.mask || !layer.mask.shapes) return;

        var shape = layer.mask.shapes.find(function (s) { return s.type === 'depth-mask'; });
        if (!shape) return;

        shape.depthData = new Uint8Array(depth.data);
        shape.depthWidth = depth.width;
        shape.depthHeight = depth.height;

        updateObstacleFromLayers();
    }

    // Refresh depth estimation for a specific layer
    async function refreshLayerDepth(layerIndex) {
        if (!window.layers) return;
        var layer = window.layers.find(function (l) { return l.index === layerIndex; });
        if (!layer || !layer.originalData) return;

        var depth = await window.depthEstimator.estimateDepth(layer.originalData);
        if (depth) {
            updateLayerDepthMask(layerIndex, depth);
        }
    }

    // Remove webcam stream
    function removeWebcam(layerIndex) {
        var wc = webcamStreams[layerIndex];
        if (wc) {
            if (typeof wc.stop === 'function') wc.stop(); // stop setTimeout chain
            else clearInterval(wc.intervalId);             // legacy fallback
            wc.stream.getTracks().forEach(function (t) { t.stop(); });
            if (wc.video && wc.video.parentNode) wc.video.parentNode.removeChild(wc.video);
            delete webcamStreams[layerIndex];
        }
    }

    // ─── Cached buffers for obstacle compositing (avoid per-frame GC pressure) ──
    var _shapeCanvas = null, _shapeCtx = null;
    var _shapeBufW = 0, _shapeBufH = 0;
    var _shapeImgData = null;
    var _obsDirty = false;   // rAF throttle flag
    var _obsRafId = 0;

    function _ensureShapeCanvas(tw, th) {
        if (_shapeBufW === tw && _shapeBufH === th && _shapeCanvas) return;
        _shapeCanvas = document.createElement('canvas');
        _shapeCanvas.width = tw;
        _shapeCanvas.height = th;
        _shapeCtx = _shapeCanvas.getContext('2d', { willReadFrequently: true });
        _shapeImgData = _shapeCtx.createImageData(tw, th);
        _shapeBufW = tw;
        _shapeBufH = th;
    }

    // ── D2 bridge: Sketch → Collider ──────────────────────────────────
    // "Sketch little colliders as easily as importing them" (the Phase
    // 1.75 vibe): read the sketch layer's alpha coverage, downsample to
    // ≤512, and add it as a standard depth-mask collision layer — the
    // whole D0.5 edge pipeline (adaptive cut, blur, coverage solidity)
    // applies from there. One-shot readback (button click / live refresh).
    // Returns {depth, previewUrl, any} or null; allowEmpty=true returns a
    // zeroed mask for an empty sketch (live mode: erasing everything must
    // CLEAR the bound collider, not freeze its last state).
    function buildSketchDepth(allowEmpty) {
        // D3/D4: read the BOUND source's buffer (raster layer OR mask;
        // falls back to the active paint layer) — switching the active
        // surface must not silently re-target an existing live binding.
        var sk = _resolveBoundFBO();
        var canvasEl = document.getElementById('canvas');
        if (!sk || !sk.texture || !canvasEl || typeof gl === 'undefined') {
            console.warn('Sketch layer not available');
            return null;
        }
        var sw = sk.width, sh = sk.height;
        var px = new Uint8Array(sw * sh * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sk.fbo);
        gl.readPixels(0, 0, sw, sh, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // Downsample alpha to a resolution-proportional long-side cap (box filter), flipping Y:
        // GL rows are bottom-up, depth-mask data is stored top-down.
        var maxSketchSide = Math.min(2048, Math.max(512, Math.round(Math.max(sw, sh) * 0.75)));
        var scale = Math.min(1, maxSketchSide / Math.max(sw, sh));
        var tw = Math.max(1, Math.round(sw * scale));
        var th = Math.max(1, Math.round(sh * scale));
        var depthData = new Uint8Array(tw * th);
        var any = 0;
        for (var y = 0; y < th; y++) {
            var sy0 = Math.floor(y * sh / th), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * sh / th));
            for (var x = 0; x < tw; x++) {
                var sx0 = Math.floor(x * sw / tw), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sw / tw));
                var sum = 0, n = 0;
                for (var yy = sy0; yy < sy1; yy++) {
                    var rowBase = ((sh - 1 - yy) * sw) << 2; // flip Y
                    for (var xx = sx0; xx < sx1; xx++) { sum += px[rowBase + (xx << 2) + 3]; n++; }
                }
                var v = n ? Math.round(sum / n) : 0;
                depthData[y * tw + x] = v;
                if (v > 12) any++;
            }
        }
        if (!any && !allowEmpty) return null;
        // Grayscale preview PNG for the layer div
        var pc = document.createElement('canvas');
        pc.width = tw; pc.height = th;
        var pctx = pc.getContext('2d');
        var img = pctx.createImageData(tw, th);
        for (var i = 0, m = tw * th; i < m; i++) {
            var dv = depthData[i], idx = i << 2;
            img.data[idx] = dv; img.data[idx + 1] = dv; img.data[idx + 2] = dv;
            img.data[idx + 3] = dv;
        }
        pctx.putImageData(img, 0, 0);
        return { depth: { width: tw, height: th, data: depthData }, previewUrl: pc.toDataURL('image/png'), any: any };
    }

    // D3/D4: the binding source — {kind:'raster'|'mask', id} or null
    // (null = whatever paint layer is active right now).
    var _boundSrc = null;
    function _resolveBoundFBO() {
        if (_boundSrc) {
            if (_boundSrc.kind === 'mask') return (window.Masks && window.Masks.getFBO(_boundSrc.id)) || null;
            return (window.rasterLayers && window.rasterLayers.getFBO(_boundSrc.id)) || null;
        }
        return window.sketch;
    }
    function _resolveSourceFBO(source) {
        if (!source) return null;
        if (source.kind === 'mask') return (window.Masks && window.Masks.getFBO(source.id)) || null;
        return (window.rasterLayers && window.rasterLayers.getFBO(source.id)) || null;
    }
    function _bindActiveSource(kind) {
        if (kind === 'mask' && window.Masks) {
            _boundSrc = { kind: 'mask', id: window.Masks.ensureDefault() };
        } else if (window.rasterLayers) {
            _boundSrc = { kind: 'raster', id: window.rasterLayers.activeId() };
        } else {
            _boundSrc = null;
        }
    }
    function _createColliderFromSource(kind, title) {
        // One-shot → Collider binds to the CURRENTLY active surface (also
        // re-targets the live binding, matching the pre-D2 behavior where
        // the newest sketch collider became the live target).
        _bindActiveSource(kind);
        var sourceFBO = _resolveBoundFBO();
        if (sourceFBO) {
            var gpuIdx = addCollisionLayer(null, null, title,
                { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, source: _boundSrc });
            if (gpuIdx != null) _sketchColliderIndex = gpuIdx;
            return gpuIdx;
        }
        var built = buildSketchDepth(false);
        if (!built) { console.warn((kind === 'mask' ? 'Mask' : 'Sketch') + ' is empty — nothing to turn into a collider'); return; }
        var idx = addCollisionLayer(built.depth, built.previewUrl, title,
            { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
        // The newest collider is the live-binding target (D4: collision =
        // a mask binding; the sketch/mask is the mask source).
        if (idx != null) _sketchColliderIndex = idx;
        return idx;
    }
    function createFromSketch() { return _createColliderFromSource('raster', 'Sketch Collision'); }
    function createFromMask() { return _createColliderFromSource('mask', 'Mask Collision'); }

    // ── D3/D4 slice: LIVE sketch → collider binding ───────────────────
    // While live, every sketch mutation (stroke end / eraser / Clear /
    // Capture / undo / redo — 05i fires window.__onSketchMutated) refreshes
    // the bound collision layer in place through updateLayerDepthMask, so
    // the fluid flows around the drawing AS you draw it. Coalesced to one
    // readback per 120 ms; refresh runs on stroke END, never per dab.
    var _sketchLive = false;
    var _sketchColliderIndex = null;
    var _sketchRefreshPending = false;

    function _sketchColliderLayer() {
        if (_sketchColliderIndex == null || !window.layers) return null;
        return window.layers.find(function (l) { return l.index === _sketchColliderIndex; }) || null;
    }

    function refreshSketchCollider() {
        var layer = _sketchColliderLayer();
        if (!layer) { setSketchLive(false); _sketchColliderIndex = null; return; }
        // D3/D4: bound source deleted → the binding has nothing to track
        if (_boundSrc && !_resolveBoundFBO()) {
            setSketchLive(false);
            _boundSrc = null;
            return;
        }
        if (_boundSrc && _resolveBoundFBO()) {
            layer.collisionSource = { kind: _boundSrc.kind, id: _boundSrc.id };
            updateObstacleFromLayers();
            return;
        }
        var built = buildSketchDepth(true); // empty sketch → zeroed collider
        if (!built) return;
        updateLayerDepthMask(_sketchColliderIndex, built.depth);
        // Keep every visible surface in sync with what now collides, using
        // the SAME opaque-grayscale convention addCollisionLayer uses for
        // layer.data (the transparent alpha=coverage preview went blank on
        // dark thumbnails — the painted shape never showed in the Layers
        // panel, and full renderLayers() re-renders showed nothing at all).
        var opaqueUrl = _depthToOpaqueUrl(built.depth);
        layer.data = opaqueUrl;              // panel thumbnail source
        layer.originalData = built.previewUrl; // alpha-coverage mask (data)
        var layerDiv = document.getElementById('layer' + _sketchColliderIndex);
        if (layerDiv) layerDiv.style.backgroundImage = 'url(' + opaqueUrl + ')';
        // Update the Layers-panel thumbnail IN PLACE (no full re-render per
        // stroke — renderLayers rebuilds the whole panel and would fight
        // scroll position / drag state at painting cadence).
        var thumb = document.querySelector('.layer-item[data-layer-index="' + _sketchColliderIndex + '"] .layer-thumbnail');
        if (thumb) thumb.style.backgroundImage = 'url(' + opaqueUrl + ')';
        else if (typeof window.renderLayers === 'function') window.renderLayers();
    }

    // Opaque grayscale data-URL from a depth map — matches the conversion
    // addCollisionLayer performs internally for layer.data.
    function _depthToOpaqueUrl(depth) {
        var pc = document.createElement('canvas');
        pc.width = depth.width; pc.height = depth.height;
        var ctx = pc.getContext('2d');
        var img = ctx.createImageData(depth.width, depth.height);
        for (var i = 0, m = depth.width * depth.height; i < m; i++) {
            var v = depth.data[i], o = i << 2;
            img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v;
            img.data[o + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return pc.toDataURL('image/png');
    }

    function scheduleSketchRefresh(kind, id) {
        if (!_sketchLive || _sketchRefreshPending) return;
        // D3/D4: mutations on surfaces other than the bound one are ignored
        if (_boundSrc && id != null && (kind !== _boundSrc.kind || id !== _boundSrc.id)) return;
        _sketchRefreshPending = true;
        setTimeout(function () {
            _sketchRefreshPending = false;
            if (_sketchLive) refreshSketchCollider();
        }, 120);
    }
    // 05i fires these on every paint-surface mutation; cheap no-ops unless live.
    window.__onSketchMutated = function (rid) { scheduleSketchRefresh('raster', rid); };
    window.__onMaskMutated = function (mid) { scheduleSketchRefresh('mask', mid); };

    // Live binding: the collider keeps tracking its source surface.
    // kind (optional) = 'raster' | 'mask': which ACTIVE surface a fresh
    // binding should read; re-enabling with no kind keeps the old source.
    function setSketchLive(on, kind) {
        on = !!on;
        if (on === _sketchLive && (!on || !kind || (_boundSrc && _boundSrc.kind === kind))) return _sketchLive;
        if (on) {
            if (!_boundSrc || (kind && _boundSrc.kind !== kind)) {
                _bindActiveSource(kind || 'raster');
            }
            // Bind (or create) the target collider. Empty source is fine —
            // the layer starts zeroed and lights up as you draw.
            if (!_sketchColliderLayer()) {
                var sourceFBO = _resolveBoundFBO();
                var idx;
                if (sourceFBO) {
                    idx = addCollisionLayer(null, null,
                        ((_boundSrc && _boundSrc.kind === 'mask') ? 'Mask' : 'Sketch') + ' Collision (live)',
                        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, source: _boundSrc });
                } else {
                    var built = buildSketchDepth(true);
                    if (!built) return false; // GL/source unavailable
                    idx = addCollisionLayer(built.depth, built.previewUrl,
                        ((_boundSrc && _boundSrc.kind === 'mask') ? 'Mask' : 'Sketch') + ' Collision (live)',
                        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
                }
                if (idx == null) return false;
                _sketchColliderIndex = idx;
            } else if (_boundSrc) {
                _sketchColliderLayer().collisionSource = { kind: _boundSrc.kind, id: _boundSrc.id };
            }
            _sketchLive = true;
            refreshSketchCollider();
        } else {
            _sketchLive = false; // binding stays; the collider just stops tracking
        }
        if (typeof window.__onSketchLiveChanged === 'function') window.__onSketchLiveChanged(_sketchLive, _boundSrc);
        return _sketchLive;
    }
    function setMaskLive(on) { return setSketchLive(on, 'mask'); }

    function isSketchLive() { return _sketchLive; }
    function boundColliderSource() { return _boundSrc ? { kind: _boundSrc.kind, id: _boundSrc.id } : null; }

    // Throttled entry point — coalesces multiple calls into one rAF
    function updateObstacleFromLayers() {
        if (_obsDirty) return; // already scheduled
        _obsDirty = true;
        _obsRafId = requestAnimationFrame(_doUpdateObstacle);
    }

    function _doUpdateObstacle() {
        _obsDirty = false;
        if (!window.layers && !proceduralDraw) return;

        // Auto-enable collision if any collision layers exist (e.g. after preset restore)
        if (!collisionEnabled) {
            var hasCollision = !!proceduralDraw ||
                (window.layers && window.layers.some(function (l) { return l.isCollision; }));
            if (!hasCollision) return;
            collisionEnabled = true;
        }

        var canvasEl = document.getElementById('canvas');
        if (!canvasEl) return;

        var simW = window.simTexWidth || 128;
        var simH = window.simTexHeight || 128;
        var gpuEntries = [];
        var gpuOnly = !proceduralDraw;
        var gpuStrengthMax = proceduralDraw ? 1.0 : 0.0;
        (window.layers || []).forEach(function (layer) {
            if (!layer.isCollision || !layer.mask || !layer.mask.enabled) return;
            var source = layer.collisionSource ? _resolveSourceFBO(layer.collisionSource) : null;
            if (layer.collisionSource && source) {
                gpuEntries.push({ layer: layer, source: source });
                var sourceStrength = typeof layer.collisionStrength === 'number' ? layer.collisionStrength : 0.7;
                if (sourceStrength > gpuStrengthMax) gpuStrengthMax = sourceStrength;
            } else {
                gpuOnly = false;
            }
        });
        if (gpuEntries.length && gpuOnly && typeof window.beginObstacleTexture === 'function'
            && typeof window.compositeObstacleSource === 'function') {
            var gpuWrap = document.getElementById('canvas-wrapper');
            var gpuCssW = (gpuWrap && gpuWrap.clientWidth) || canvasEl.clientWidth || canvasEl.width || 1;
            var gpuCssH = (gpuWrap && gpuWrap.clientHeight) || canvasEl.clientHeight || canvasEl.height || 1;
            window.__obsStrengthMax = gpuStrengthMax > 0 ? gpuStrengthMax : 0.7;
            window.beginObstacleTexture();
            gpuEntries.forEach(function (entry) {
                var layer = entry.layer;
                window.compositeObstacleSource(entry.source, {
                    x: (layer.x || 0) / gpuCssW,
                    y: (layer.y || 0) / gpuCssH,
                    scaleX: layer.scaleX || 1,
                    scaleY: layer.scaleY || 1,
                    rotation: (layer.rotation || 0) * Math.PI / 180,
                    strength: typeof layer.collisionStrength === 'number' ? layer.collisionStrength : 0.7
                });
            });
            return;
        }

        // D0.5 edge quality: compose the obstacle at 2x sim resolution — the
        // existing drawImage in updateObstacleTexture box-filters it back
        // down to sim res, turning stair-steps into fractional coverage the
        // cut-cell projection already consumes correctly (solidity is a
        // smoothstep over fractions; the MG pyramid restricts fractions).
        // Capped so the compose canvas never exceeds 2048 on a side.
        var ss = (simW * 2 <= 2048 && simH * 2 <= 2048) ? 2 : 1;
        var obsW = simW * ss;
        var obsH = simH * ss;

        // Reuse obstacle canvas
        if (!obstacleCanvas || obstacleCanvas.width !== obsW || obstacleCanvas.height !== obsH) {
            obstacleCanvas = document.createElement('canvas');
            obstacleCanvas.width = obsW;
            obstacleCanvas.height = obsH;
            obstacleCtx = obstacleCanvas.getContext('2d', { willReadFrequently: true });
        }

        obstacleCtx.clearRect(0, 0, obsW, obsH);

        var hasAny = false;
        // Max strength among composited sources — the shaders divide it back
        // out to recover per-texel COVERAGE (see obstacleSolidityGLSL in 05b)
        var strengthMax = gpuStrengthMax;
        (window.layers || []).forEach(function (layer) {
            if (!layer.isCollision) return;
            if (!layer.mask || !layer.mask.enabled) return;
            if (layer.collisionSource) return;
            var st = (layer.collisionStrength !== undefined) ? layer.collisionStrength : 0.7;
            if (st > strengthMax) strengthMax = st;

            layer.mask.shapes.forEach(function (shape) {
                if (shape.type !== 'depth-mask') return;
                if (!shape.depthData || !shape.depthWidth || !shape.depthHeight) return;

                hasAny = true;
                var tw = shape.depthWidth;
                var th = shape.depthHeight;

                // Reuse cached canvas/ImageData when dimensions match
                _ensureShapeCanvas(tw, th);

                var d = _shapeImgData.data;
                var threshold = shape.threshold || 128;
                var invert = !!shape.invert;
                var alphaVal = Math.round((layer.collisionStrength !== undefined ? layer.collisionStrength : 0.7) * 255);

                // D0.5 edge quality, rev 2 (2026-07-14): fwidth-style ADAPTIVE
                // soft cut. The band scales with the LOCAL depth gradient, so
                // steep edges get ~0.75px of antialiasing (sub-texel collider
                // edges) while flat midtone regions get a hard cut. The first
                // rev's FIXED ±band turned every flat region hovering near the
                // threshold — common in real photo/webcam depth — into a huge
                // porous half-solidity field, and the converged MG solve read
                // it as a noisy sponge: whole-canvas velocity fuzz that got
                // worse with collisionStrength. config.DEPTH_EDGE_BAND is now
                // the CAP on the band (0.5 ≈ fully hard everywhere).
                var bandCap = (window.config && typeof window.config.DEPTH_EDGE_BAND === 'number')
                    ? window.config.DEPTH_EDGE_BAND : 12;
                if (bandCap < 0.5) bandCap = 0.5;
                var dd = shape.depthData;
                // Composite in screen space (top-down). GL orientation is
                // handled by a single vertical flip in updateObstacleTexture,
                // so transforms here behave exactly like the CSS transform
                // on the layer div.
                for (var i = 0, n = tw * th; i < n; i++) {
                    var dv = dd[i] || 0;
                    var xI = i - ((i / tw) | 0) * tw; // i % tw without modulo
                    var gx = Math.abs((dd[i + (xI < tw - 1 ? 1 : 0)] || 0) - (dd[i - (xI > 0 ? 1 : 0)] || 0)) * 0.5;
                    var gy = Math.abs((dd[i + (i < n - tw ? tw : 0)] || 0) - (dd[i - (i >= tw ? tw : 0)] || 0)) * 0.5;
                    var band = (gx > gy ? gx : gy) * 0.75;
                    if (band < 0.5) band = 0.5;
                    if (band > bandCap) band = bandCap;
                    var t = (dv - (threshold - band)) / (band * 2);
                    if (t < 0) t = 0; else if (t > 1) t = 1;
                    var cov = t * t * (3 - 2 * t);
                    if (invert) cov = 1 - cov;
                    var idx = i << 2; // *4 via shift
                    d[idx] = 255;
                    d[idx + 1] = 255;
                    d[idx + 2] = 255;
                    d[idx + 3] = (cov * alphaVal + 0.5) | 0;
                }

                _shapeCtx.putImageData(_shapeImgData, 0, 0);

                // Mirror the CSS pipeline: the layer div fills the wrapper
                // (transform-origin center, translate → rotate → scale),
                // layer.x/y are CSS px, shape rects are canvas-buffer px.
                var wrap = document.getElementById('canvas-wrapper');
                var cssW = (wrap && wrap.clientWidth) || canvasEl.clientWidth || canvasEl.width || 1;
                var cssH = (wrap && wrap.clientHeight) || canvasEl.clientHeight || canvasEl.height || 1;
                var bufW = canvasEl.width || 1;
                var bufH = canvasEl.height || 1;
                var lx = (layer.x || 0) * (obsW / cssW);
                var ly = (layer.y || 0) * (obsH / cssH);
                var sx = obsW / bufW;
                var sy = obsH / bufH;
                var lScaleX = layer.scaleX || 1;
                var lScaleY = layer.scaleY || 1;
                var lRot = (layer.rotation || 0) * Math.PI / 180;
                var cx = obsW * 0.5;
                var cy = obsH * 0.5;

                obstacleCtx.save();
                obstacleCtx.globalCompositeOperation = 'lighter';
                obstacleCtx.translate(cx + lx, cy + ly);
                obstacleCtx.rotate(lRot);
                obstacleCtx.scale(lScaleX, lScaleY);
                obstacleCtx.translate(-cx, -cy);
                // Honor the shape rect (same rect the visible preview draws at)
                obstacleCtx.drawImage(
                    _shapeCanvas,
                    (shape.x || 0) * sx,
                    (shape.y || 0) * sy,
                    (shape.width || bufW) * sx,
                    (shape.height || bufH) * sy
                );
                obstacleCtx.restore();
            });
        });

        // Composite the procedural source (e.g. EQ lane walls) over the layers
        if (proceduralDraw) {
            hasAny = true;
            obstacleCtx.save();
            obstacleCtx.globalCompositeOperation = 'lighter';
            try { proceduralDraw(obstacleCtx, obsW, obsH); } catch (_) {}
            obstacleCtx.restore();
        }

        window.__obsStrengthMax = strengthMax > 0 ? strengthMax : 0.7;
        if (hasAny && typeof window.updateObstacleTexture === 'function') {
            // D0.5 rev 3: constant-width smoothing at SIM scale before upload.
            // Bounds every coverage ramp to ~1.5 sim texels regardless of the
            // depth map's local gradient: hard "coastlines" through flat
            // near-threshold regions stop reading as ragged binary walls (the
            // whole-canvas velocity fuzz the converged MG solve produced at
            // high collisionStrength), while wide mushy aprons stay impossible
            // (the blur radius, not the depth data, caps the ramp). GPU blur
            // via canvas filter — no pixel loops.
            if (!_obsBlurCanvas || _obsBlurCanvas.width !== obsW || _obsBlurCanvas.height !== obsH) {
                _obsBlurCanvas = document.createElement('canvas');
                _obsBlurCanvas.width = obsW;
                _obsBlurCanvas.height = obsH;
                _obsBlurCtx = _obsBlurCanvas.getContext('2d');
            }
            _obsBlurCtx.clearRect(0, 0, obsW, obsH);
            _obsBlurCtx.filter = 'blur(' + (ss * 0.5) + 'px)';
            _obsBlurCtx.drawImage(obstacleCanvas, 0, 0);
            _obsBlurCtx.filter = 'none';
            window.updateObstacleTexture(_obsBlurCanvas);
            if (gpuEntries.length && typeof window.compositeObstacleSource === 'function') {
                var mixedWrap = document.getElementById('canvas-wrapper');
                var mixedCssW = (mixedWrap && mixedWrap.clientWidth) || canvasEl.clientWidth || canvasEl.width || 1;
                var mixedCssH = (mixedWrap && mixedWrap.clientHeight) || canvasEl.clientHeight || canvasEl.height || 1;
                gpuEntries.forEach(function (entry) {
                    var layer = entry.layer;
                    window.compositeObstacleSource(entry.source, {
                        x: (layer.x || 0) / mixedCssW,
                        y: (layer.y || 0) / mixedCssH,
                        scaleX: layer.scaleX || 1,
                        scaleY: layer.scaleY || 1,
                        rotation: (layer.rotation || 0) * Math.PI / 180,
                        strength: typeof layer.collisionStrength === 'number' ? layer.collisionStrength : 0.7
                    });
                });
            }
        } else if (!hasAny && !gpuEntries.length && typeof window.clearObstacleTexture === 'function') {
            window.clearObstacleTexture();
        }
    }

    function clearObstacle() {
        if (typeof window.clearObstacleTexture === 'function') {
            window.clearObstacleTexture();
        }
    }

    // Listen for layer deletion to clean up webcam streams + live binding.
    // MUST poll: this file is a <script type="module"> (deferred) while
    // window.deleteLayer comes from 05l in the dynamic async chain — the
    // eval order is a RACE, and when the module won, the old eval-time
    // `if (typeof deleteLayer === 'function')` wrap silently never
    // installed. Symptom: deleting a collision layer left its wall in the
    // sim (no updateObstacleFromLayers), webcams kept streaming, and the
    // ⟳ Live binding stayed lit against a dead layer.
    (function installDeleteHook() {
        var origDeleteLayer = window.deleteLayer;
        if (typeof origDeleteLayer !== 'function') {
            setTimeout(installDeleteHook, 250);
            return;
        }
        window.deleteLayer = function (index) {
            removeWebcam(index);
            // Deleting the live-bound sketch collider unbinds IMMEDIATELY
            // (the ⟳ Live button follows via __onSketchLiveChanged) — the
            // next-mutation auto-disable stays as the fallback.
            if (_sketchColliderIndex != null && index === _sketchColliderIndex) {
                setSketchLive(false);
                _sketchColliderIndex = null;
            }
            origDeleteLayer(index);
            updateObstacleFromLayers();
        };
    })();

    console.log('🧱 Depth Collision system loaded');
})();
