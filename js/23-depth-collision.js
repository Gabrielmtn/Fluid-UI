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
            // Vendored copy — same rationale and glue as 16-sam-integration.
            this.transformers = await import('./vendor/transformers/transformers.min.js');
        } finally {
            if (hadProcess) {
                globalThis.process = originalProcess;
            }
        }

        const { env } = this.transformers;
        const { configureTransformersEnv } = await import('./vendor/transformers/fluid-env.js');
        configureTransformersEnv(env);

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
                // v3 runtime: 'quantized: true' is the removed v2 option — dtype 'q8'
                // maps to the same model_quantized.onnx the Electron build bundles.
                dtype: 'q8',
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
    // Long-side cap for collision maps built from layer content (threshold /
    // shapes / full image). 1024 ≥ the 2×sim obstacle compose canvas, so the
    // physics loses nothing — but the visible mask preview now upscales ~2×
    // instead of the old 512-wide ~4×, which read as chunky stairs.
    var COLLISION_MAP_MAX = 1024;
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
        // Re-read one source-bound collider from its source (collider mask
        // editor); returns its coverage preview data-URL.
        refreshColliderFromSource: refreshColliderFromSource,

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
    // `createOpts` passes creation options straight to addCollisionLayer —
    // currently only `visible:false`, which Ctrl+Shift+V paste (32-file-drop)
    // uses to get the wall without its on-canvas film. The 🧱 button passes
    // nothing and keeps the film, since seeing the mask is the point there.
    function createCollisionFromLayerMask(layerIndex, createOpts) {
        if (!window.layers) { console.warn('Layer system not available'); return; }
        var layer = null;
        for (var li = 0; li < window.layers.length; li++) {
            if (window.layers[li].index === layerIndex) { layer = window.layers[li]; break; }
        }
        if (!layer) { console.warn('Layer not found:', layerIndex); return; }

        var hasShapes = layer.mask && layer.mask.shapes && layer.mask.shapes.length > 0;
        var threshold = typeof layer.threshold === 'number' ? layer.threshold : 0;

        if (hasShapes) {
            _collisionFromShapes(layer, createOpts);
        } else if (threshold > 0) {
            _collisionFromThreshold(layer, createOpts);
        } else {
            _collisionFromFullImage(layer, createOpts);
        }
    }

    // Fold caller options into the opts each mode builds for addCollisionLayer.
    // `onCreated(index)` reports the slot the (asynchronously baked) collider
    // landed in — Ctrl+Shift+V paste needs it to put the collider and its
    // source image into a single undo entry.
    // Modes 2 and 3 bake off an image decode, so the source layer can be
    // deleted — or undone, which is the same thing — while the bake is in
    // flight. Adding the collider anyway would strand a wall with nothing
    // behind it, and a Ctrl+Shift+V collider is invisible, so it would be a
    // wall the user cannot see OR find.
    function _sourceGone(layer) {
        return !!(window.layers && !window.layers.some(function (l) { return l.index === layer.index; }));
    }

    function _withCreateOpts(base, createOpts) {
        if (!createOpts) return base;
        if (createOpts.visible === false) base.visible = false;
        if (typeof createOpts.onCreated === 'function') base.onCreated = createOpts.onCreated;
        return base;
    }

    // ── Mode 1: Rasterize mask shapes into collision data ──────────
    function _collisionFromShapes(layer, createOpts) {
        var canvasEl = document.getElementById('canvas');
        var cw = canvasEl ? canvasEl.width : 1920;
        var ch = canvasEl ? canvasEl.height : 1080;

        var scale = Math.min(1, COLLISION_MAP_MAX / Math.max(cw, ch));
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
        addCollisionLayer(depth, thumbUrl, (layer.title || 'Layer') + ' Collision',
            _withCreateOpts(_transformOf(layer), createOpts));
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
    // Mirrors the rudimentary mask logic in 05m-layer-masks.js: the layer
    // slider picks a luminance cut. The map stores the CONTINUOUS luminance —
    // the cut itself lives in the depth-mask shape's threshold — so every
    // consumer (the adaptive-band edge AA in preview + obstacle compositor,
    // the collision Threshold slider, Invert) operates on real gradients.
    // Binarizing here was the jagged-collider bug: a 0/255 cut leaves the AA
    // band nothing to smooth over, and re-thresholding binary data makes the
    // collision Threshold slider a no-op.
    function _collisionFromThreshold(layer, createOpts) {
        var imgSrc = layer.originalData || layer.data;
        if (!imgSrc) { console.warn('Layer has no image data'); return; }

        var img = new Image();
        img.onload = function () {
            var canvasEl = document.getElementById('canvas');
            var cw = canvasEl ? canvasEl.width : 1920;
            var ch = canvasEl ? canvasEl.height : 1080;

            var scale = Math.min(1, COLLISION_MAP_MAX / Math.max(cw, ch));
            var tw = Math.round(cw * scale);
            var th = Math.round(ch * scale);

            var c = document.createElement('canvas');
            c.width = tw;
            c.height = th;
            var ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, tw, th);

            var imageData = ctx.getImageData(0, 0, tw, th);
            var data = imageData.data;
            var collisionData = new Uint8Array(tw * th);

            for (var i = 0; i < collisionData.length; i++) {
                var idx = i * 4;
                var lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                collisionData[i] = (lum + 0.5) | 0;
            }

            if (_sourceGone(layer)) return;
            var depth = { width: tw, height: th, data: collisionData };
            var opts = _withCreateOpts(_transformOf(layer), createOpts);
            opts.threshold = Math.round((layer.threshold / 100) * 255);
            addCollisionLayer(depth, imgSrc, (layer.title || 'Layer') + ' Collision', opts);
        };
        img.src = imgSrc;
    }

    // ── Mode 3: Full image as solid collision ─────────────────────
    function _collisionFromFullImage(layer, createOpts) {
        var imgSrc = layer.originalData || layer.data;
        if (!imgSrc) { console.warn('Layer has no image data'); return; }

        var img = new Image();
        img.onload = function () {
            var canvasEl = document.getElementById('canvas');
            var cw = canvasEl ? canvasEl.width : 1920;
            var ch = canvasEl ? canvasEl.height : 1080;

            var scale = Math.min(1, COLLISION_MAP_MAX / Math.max(cw, ch));
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

            if (_sourceGone(layer)) return;
            var depth = { width: tw, height: th, data: collisionData };
            addCollisionLayer(depth, imgSrc, (layer.title || 'Layer') + ' Collision',
                _withCreateOpts(_transformOf(layer), createOpts));
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

                // Aspect-fit (2026-08-06): the collider layer div stretches to
                // the canvas, so a non-canvas-aspect image distorted both the
                // preview and the collision shape. Contain-fit via the layer
                // transform — the compositors already honor scaleX/scaleY.
                var canvasEl = document.getElementById('canvas');
                var fitX = 1, fitY = 1;
                if (canvasEl && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    var arImg = img.naturalWidth / img.naturalHeight;
                    var arCanvas = (canvasEl.width || 1) / (canvasEl.height || 1);
                    if (arImg < arCanvas) fitX = arImg / arCanvas;
                    else if (arImg > arCanvas) fitY = arCanvas / arImg;
                }
                // Create an image layer using the depth as both visual and mask source
                addCollisionLayer(depth, img.src, file.name || 'Image', { scaleX: fitX, scaleY: fitY });
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

        // Panel thumbnail at the SOURCE aspect. The depth map is stretched to
        // fill the canvas rect and the layer transform squeezes it back on
        // screen — but a thumbnail has no transform, so showing the map raw
        // put an ellipse in the panel where the user pasted a circle. Drawing
        // the fit into the bitmap itself keeps the panel honest, and layers
        // with no fit (sketch, Mask, webcam) keep the map unchanged.
        var thumbDataUrl = depthDataUrl;
        try {
            var tsx = opts.scaleX || 1, tsy = opts.scaleY || 1;
            if (tsx !== 1 || tsy !== 1) {
                var thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = Math.max(1, Math.round(depth.width * tsx));
                thumbCanvas.height = Math.max(1, Math.round(depth.height * tsy));
                thumbCanvas.getContext('2d').drawImage(depthCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
                thumbDataUrl = thumbCanvas.toDataURL();
            }
        } catch (_) {}

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
        var filmDataUrl = _depthToFilmUrl(depth);
        layerDiv.style.backgroundImage = 'url(' + filmDataUrl + ')';
        // Stretch to the div (which fills the wrapper) — same mapping the
        // obstacle compositor uses, so preview and collision stay aligned.
        layerDiv.style.backgroundSize = '100% 100%';
        layerDiv.style.backgroundPosition = 'center';
        var startVisible = opts.visible !== false; // visible by default so the mask can be seen/aligned
        layerDiv.style.display = startVisible ? 'block' : 'none';
        layerDiv.style.opacity = COLLIDER_FILM_OPACITY;

        // Add to layers array
        var layer = {
            index: newIndex,
            data: depthDataUrl,
            thumb: thumbDataUrl,   // 05k renders `layer.thumb || layer.data`
            originalData: thumbnailUrl || depthDataUrl,
            filmData: filmDataUrl,   // on-canvas film; see _depthToFilmUrl
            title: '🧱 ' + (name || 'Collision'),
            visible: startVisible,
            active: false,
            threshold: 0,
            x: opts.x || 0, y: opts.y || 0,
            scaleX: opts.scaleX || 1, scaleY: opts.scaleY || 1,
            rotation: opts.rotation || 0,
            isCollision: true,
            collisionMode: 'block',   // block | slow | deflect
            // 0.9, not 1.0 (2026-07-20). The strength response is a full-range
            // cubic, so 1.0 is "as rigid as the solver allows" — and at that
            // rigidity MULTIPLE colliders resonate: energy builds between them,
            // releases, and rebuilds on a cycle, shredding dye into black
            // fractal voids around each one. Backing off one notch leaves walls
            // that still read as solid but bleed enough to break the cavity.
            // This is a MITIGATION, not the fix: the underlying wall-noise
            // injection is SIM-M2b (colliders inject ~3-4x grid-scale velocity
            // noise on both solvers, and MG scales it per V-cycle). Raising
            // this back to 1.0 will bring the resonance back.
            collisionStrength: 0.9,
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
                    // Threshold-generated colliders carry the cut the user
                    // dialed in on the source layer's mask slider
                    threshold: (typeof opts.threshold === 'number') ? opts.threshold : 128,
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

        // Paint the thresholded mask preview (adaptive-band AA) instead of
        // leaving the raw grayscale map on the div — the edge the user sees
        // must be the collider edge from the start, not only after the first
        // Threshold-slider touch.
        if (typeof window.applyLayerMask === 'function') window.applyLayerMask(newIndex);

        // Update obstacle texture
        collisionEnabled = true;
        updateObstacleFromLayers();

        console.log('🧱 Collision layer added:', name, 'index:', newIndex);
        if (typeof opts.onCreated === 'function') opts.onCreated(newIndex, layer);
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
    // fboOverride: read THAT buffer instead of the bound one (the collider
    // mask editor refreshes one specific layer's source, which may not be
    // the live-bound surface at all).
    function buildSketchDepth(allowEmpty, fboOverride) {
        // D3/D4: read the BOUND source's buffer (raster layer OR mask;
        // falls back to the active paint layer) — switching the active
        // surface must not silently re-target an existing live binding.
        var sk = fboOverride || _resolveBoundFBO();
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
        // Same alpha→coverage saturation as the GPU compositor
        // (obstacleCompositeFrag, 05b): source alpha is SHAPE, not texture.
        // Mid-alpha ripple inside a filled region (soft-brush overlap,
        // imported-image grain) must read fully solid or the one-shot
        // collider's fill becomes a patchy solid/leaky lattice, exactly like
        // the live GPU path did (2026-08-05).
        var knee = (window.config && typeof window.config.COLLIDER_ALPHA_SOLID === 'number')
            ? window.config.COLLIDER_ALPHA_SOLID : 0.45;
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
                var t = (v / 255 - knee * 0.25) / (knee * 0.75);
                if (t < 0) t = 0; else if (t > 1) t = 1;
                v = Math.round(t * t * (3 - 2 * t) * 255);
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
            // One-shot readback of the just-bound source purely for the panel
            // thumbnail + on-canvas preview: the LIVE collision reads the GPU
            // source directly and never touches this depth data (the obstacle
            // compositor skips CPU depth on source-bound layers), but without
            // it the layer got a 1×1 black dummy — blank thumbnail and a
            // black stretched preview film.
            var pre = buildSketchDepth(true);
            var gpuIdx = addCollisionLayer(pre ? pre.depth : null, pre ? pre.previewUrl : null, title,
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
            // The GPU reads the bound source directly, so physics needs
            // nothing more from us — but the SEEN surfaces (panel thumbnail,
            // on-canvas film, and the mask editor's backdrop, which draws
            // layer.originalData) were left frozen at the snapshot taken when
            // the layer was created: painting a Paint-Collider mask showed a
            // blank thumbnail and an empty Edit Mask canvas. Refresh them
            // from the source here — one readback per coalesced 120ms
            // stroke-end refresh, the same cost the non-bound path below has
            // always paid.
            var srcBuilt = buildSketchDepth(true);
            if (srcBuilt) _applyColliderPreview(layer, srcBuilt);
            return;
        }
        var built = buildSketchDepth(true); // empty sketch → zeroed collider
        if (!built) return;
        updateLayerDepthMask(_sketchColliderIndex, built.depth);
        _applyColliderPreview(layer, built);
    }

    // Keep every visible surface in sync with what now collides, using the
    // SAME opaque-grayscale convention addCollisionLayer uses for layer.data
    // (the transparent alpha=coverage preview went blank on dark thumbnails —
    // the painted shape never showed in the Layers panel, and full
    // renderLayers() re-renders showed nothing at all). originalData keeps
    // the alpha-coverage version: that's what the mask editor draws.
    function _applyColliderPreview(layer, built) {
        if (!layer || !built) return;
        var opaqueUrl = _depthToOpaqueUrl(built.depth);
        layer.data = opaqueUrl;                // panel thumbnail source
        layer.originalData = built.previewUrl; // alpha-coverage mask (data)
        layer.filmData = _depthToFilmUrl(built.depth); // on-canvas film (tinted coverage)
        _setColliderFilm(layer.index, layer.filmData);
        // Update the Layers-panel thumbnail IN PLACE (no full re-render per
        // stroke — renderLayers rebuilds the whole panel and would fight
        // scroll position / drag state at painting cadence).
        var thumb = document.querySelector('.layer-item[data-layer-index="' + layer.index + '"] .layer-thumbnail');
        if (thumb) thumb.style.backgroundImage = 'url(' + opaqueUrl + ')';
        else if (typeof window.renderLayers === 'function') window.renderLayers();
    }

    // ── The on-canvas collider film ────────────────────────────────────
    // The thumbnail wants an OPAQUE image (a transparent mask vanishes against
    // a dark panel), but the on-canvas div is a different job: it lies over the
    // artwork, full-bleed. Feeding it the opaque map painted black across every
    // pixel that ISN'T wall, at 0.55 — a 55% black veil over the whole picture,
    // with the wall reading as a grey sticker sitting ON TOP of the paint. That
    // is most of why colliders "didn't feel right".
    //
    // The film is now alpha=coverage (fully transparent off the wall) tinted the
    // same red the mask editor uses, so the wall reads as a marking ON the
    // surface rather than a sheet over it. One helper, so every path that paints
    // this div agrees — creation, live stroke refresh, preset load and undo all
    // used to set it separately and only one of them was ever fixed.
    var COLLIDER_FILM_OPACITY = '0.3';
    function _depthToFilmUrl(depth) {
        var pc = document.createElement('canvas');
        pc.width = depth.width; pc.height = depth.height;
        var ctx = pc.getContext('2d');
        var img = ctx.createImageData(depth.width, depth.height);
        for (var i = 0, m = depth.width * depth.height; i < m; i++) {
            var v = depth.data[i], o = i << 2;
            img.data[o] = 255; img.data[o + 1] = 59; img.data[o + 2] = 48; // #ff3b30
            img.data[o + 3] = v;                                            // coverage
        }
        ctx.putImageData(img, 0, 0);
        return pc.toDataURL('image/png');
    }
    // Point a collider layer's on-canvas div at the film. url may be a prebuilt
    // coverage PNG (preset/undo restore, where only the stored image survives).
    function _setColliderFilm(layerIndex, url) {
        var d = document.getElementById('layer' + layerIndex);
        if (!d) return;
        d.style.backgroundImage = 'url(' + url + ')';
        d.style.opacity = COLLIDER_FILM_OPACITY;
    }
    window.__setColliderFilm = _setColliderFilm;

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

    // Re-read ONE source-bound collision layer from its own source, whether
    // or not it is the live-bound one: refreshes the physics obstacle, the
    // panel thumbnail and the on-canvas film, and hands back the coverage
    // preview so a caller (the collider mask editor) can show it. Returns
    // null if the layer isn't source-bound or its source is gone.
    function refreshColliderFromSource(layerIndex) {
        var layer = (window.layers || []).find(function (l) { return l.index === layerIndex; });
        if (!layer || !layer.collisionSource) return null;
        var fbo = _resolveSourceFBO(layer.collisionSource);
        if (!fbo) return null;
        var built = buildSketchDepth(true, fbo);
        if (built) _applyColliderPreview(layer, built);
        updateObstacleFromLayers();
        return built ? built.previewUrl : null;
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
    // opts.rebind: start a FRESH binding on the currently ACTIVE surface of
    // `kind`, leaving any existing live collider behind as a static-bound
    // collision layer. Load-bearing for the Paint Collider button: without
    // it, the on-branch below only rebinds when the source KIND differs —
    // never the id — and scheduleSketchRefresh filters mutations to the
    // bound id, so painting a NEWLY created mask would refresh nothing.
    function setSketchLive(on, kind, opts) {
        on = !!on;
        if (on && opts && opts.rebind) {
            _sketchLive = false;
            _boundSrc = null;
            // The old live layer keeps its collisionSource and stays a
            // collider; it just stops being THE live slot.
            _sketchColliderIndex = null;
        }
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
                    // One-shot readback for thumbnail/preview (see
                    // _createColliderFromSource) — collision stays GPU-side.
                    var pre = buildSketchDepth(true);
                    idx = addCollisionLayer(pre ? pre.depth : null, pre ? pre.previewUrl : null,
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
    function setMaskLive(on, opts) { return setSketchLive(on, 'mask', opts); }

    function isSketchLive() { return _sketchLive; }
    function boundColliderSource() { return _boundSrc ? { kind: _boundSrc.kind, id: _boundSrc.id } : null; }

    // Throttled entry point — coalesces multiple calls into one rAF
    function updateObstacleFromLayers() {
        if (_obsDirty) return; // already scheduled
        _obsDirty = true;
        _obsRafId = requestAnimationFrame(_doUpdateObstacle);
    }

    // ── Non-depth mask shapes → obstacle ──────────────────────────────
    // The per-shape loop above only understands 'depth-mask'. Everything
    // else in a collision layer's mask — stamped rects/circles/stars, SAM
    // cutouts, the mask editor's Filter output, and the single soft
    // 'sam-mask' the editor's Touch up step flattens a mask into — used to
    // composite NOTHING, so editing a collider's mask silently deleted its
    // wall (measured 2026-08-18: obstacle 11704 solid texels → 0 after
    // erasing a bite out of one).
    //
    // Rasterized per LAYER rather than per shape, because 'hide' mode and
    // the feather are layer-level: this mirrors _collisionFromShapes, which
    // is what baked these colliders in the first place, so re-compositing an
    // edited mask lands where the original bake landed.
    function _compositeShapeCollider(layer, ctx, obsW, obsH, canvasEl) {
        if (typeof window._drawMaskShape !== 'function') return false;
        var shapes = (layer.mask.shapes || []).filter(function (s) {
            return s && s.type !== 'depth-mask';
        });
        if (!shapes.length) return false;

        var bufW = canvasEl.width || 1, bufH = canvasEl.height || 1;
        var mode = layer.mask.mode || 'show';
        var feather = (typeof layer.threshold === 'number') ? layer.threshold : 0;
        // Re-rasterizing on every recomposite would fire per frame while a
        // collision layer is dragged. The shapes array is replaced wholesale
        // on every save (cloneMaskShapes), so its identity is a sound key;
        // the layer transform is applied at draw time and never invalidates.
        var key = [shapes.length, mode, feather, bufW, bufH].join(':');
        var memo = layer.__shapeColliderMemo;
        var cov;
        if (memo && memo.key === key && memo.shapes === layer.mask.shapes) {
            cov = memo.canvas;
        } else {
            var scale = Math.min(1, COLLISION_MAP_MAX / Math.max(bufW, bufH));
            var tw = Math.max(1, Math.round(bufW * scale));
            var th = Math.max(1, Math.round(bufH * scale));
            cov = document.createElement('canvas');
            cov.width = tw; cov.height = th;
            var cctx = cov.getContext('2d', { willReadFrequently: true });
            cctx.scale(scale, scale);
            var drawAll = function () {
                shapes.forEach(function (s) {
                    var rot = s.rotation || 0;
                    if (rot) {
                        cctx.save();
                        var rcx = s.x + s.width / 2, rcy = s.y + s.height / 2;
                        cctx.translate(rcx, rcy);
                        cctx.rotate((rot * Math.PI) / 180);
                        cctx.translate(-rcx, -rcy);
                    }
                    cctx.fillStyle = '#fff';
                    try { window._drawMaskShape(cctx, s); } catch (_) {}
                    if (rot) cctx.restore();
                });
            };
            if (mode === 'show') {
                drawAll();
            } else {
                // 'hide' = the shapes are holes in an otherwise solid layer
                cctx.fillStyle = '#fff';
                cctx.fillRect(0, 0, bufW, bufH);
                cctx.globalCompositeOperation = 'destination-out';
                drawAll();
                cctx.globalCompositeOperation = 'source-over';
            }
            cctx.setTransform(1, 0, 0, 1, 0, 0);
            if (feather > 0 && typeof window._featherMaskAlpha === 'function') {
                var fr = Math.max(1, Math.round((feather / 100) * 20 * scale));
                try { window._featherMaskAlpha(cctx, tw, th, fr); } catch (_) {}
            }
            layer.__shapeColliderMemo = { key: key, shapes: layer.mask.shapes, canvas: cov };
        }

        // Same CSS-transform mapping as the depth-mask branch, over the full
        // canvas rect (these shapes are stored in canvas-buffer space).
        var wrap = document.getElementById('canvas-wrapper');
        var cssW = (wrap && wrap.clientWidth) || canvasEl.clientWidth || bufW;
        var cssH = (wrap && wrap.clientHeight) || canvasEl.clientHeight || bufH;
        var lx = (layer.x || 0) * (obsW / cssW);
        var ly = (layer.y || 0) * (obsH / cssH);
        var cx = obsW * 0.5, cy = obsH * 0.5;
        var strength = (layer.collisionStrength !== undefined) ? layer.collisionStrength : 0.7;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Alpha carries coverage*strength, exactly like alphaVal above — the
        // shaders divide __obsStrengthMax back out to recover coverage.
        ctx.globalAlpha = Math.max(0, Math.min(1, strength));
        ctx.translate(cx + lx, cy + ly);
        ctx.rotate((layer.rotation || 0) * Math.PI / 180);
        ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
        ctx.translate(-cx, -cy);
        ctx.drawImage(cov, 0, 0, obsW, obsH);
        ctx.restore();
        return true;
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
            // D0.5 edge quality on the GPU path too: without this the single
            // bilinear tap of a dye-res mask yields sub-texel (hard) collider
            // edges — measured 0-texel 0.9→0.1 transition, the jagged feel
            // the whole D0.5 effort exists to prevent. One 1-sim-texel blur
            // bounds every edge ramp ~1.5 texels, same as the CPU compositor.
            if (typeof window.finishObstacleComposite === 'function') window.finishObstacleComposite();
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
            // A shrunken collider layer downscales its shape canvas heavily
            // here; default (bilinear, no mip) sampling skips source texels
            // and thin walls alias. 'high' engages proper area filtering.
            obstacleCtx.imageSmoothingQuality = 'high';
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

            // Everything in this mask that ISN'T a depth-mask (stamps, SAM
            // cutouts, Filter output, a flattened touch-up) composites here.
            if (_compositeShapeCollider(layer, obstacleCtx, obsW, obsH, canvasEl)) hasAny = true;
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
        // Coverage saturation for the CPU path (2026-08-06): the GPU
        // compositor knees its box-filtered area coverage (05b round 3), but
        // this path passed drawImage alpha straight through — fine while the
        // depth data lands 1:1, but RESIZING the collider layer smears binary
        // walls into mid-alpha during the downscale above, and those mids sit
        // exactly in solidity()'s noisy 0.35–0.85 window: the patchy lattice
        // returned on every resize. Same knee, same order as the GPU path
        // (saturate BEFORE the ss-blur, so the blur still bounds edge ramps).
        // Alpha here is coverage*strength; the shaders recover coverage as
        // r/uObsMax, so normalize by strengthMax before the knee and rescale.
        if (hasAny) {
            var kneeA = (window.config && typeof window.config.COLLIDER_ALPHA_SOLID === 'number')
                ? window.config.COLLIDER_ALPHA_SOLID : 0.45;
            var sNorm = window.__obsStrengthMax;
            var kImg = obstacleCtx.getImageData(0, 0, obsW, obsH);
            var kd = kImg.data;
            var lo = kneeA * 0.25, span = kneeA * 0.75;
            for (var ki = 3, kn = kd.length; ki < kn; ki += 4) {
                var kcov = kd[ki] / (255 * sNorm);
                var kt = (kcov - lo) / span;
                if (kt <= 0) { kd[ki] = 0; continue; }
                if (kt > 1) kt = 1;
                kd[ki] = Math.round(kt * kt * (3 - 2 * kt) * sNorm * 255);
            }
            obstacleCtx.putImageData(kImg, 0, 0);
        }
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
