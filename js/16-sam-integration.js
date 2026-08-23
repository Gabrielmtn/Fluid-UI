// Instant Roto — promptable object segmentation (SAM 2 family)
// Uses the vendored Transformers.js v3 runtime to run EdgeTAM (Meta's
// on-device SAM2 derivative) fully in the browser: WebGPU when available,
// WASM otherwise. Model repo is config-tunable (config.INSTANT_ROTO_MODEL);
// any Sam2-family ONNX export (sam2.1-hiera-*, EdgeTAM, sam3-tracker) works
// because they share the Sam2Model embed/prompt API. The class keeps its
// historical "SAMSegmenter"/window.samSegmenter names — every mask-editor
// call site binds to those.

class SAMSegmenter {
    constructor() {
        this.model = null;
        this.processor = null;
        this.imageInputs = null;
        this.imageEmbeddings = null;
        this.isReady = false;
        this.isLoading = false;
        this.transformers = null;
        this.displayWidth = null;
        this.displayHeight = null;
        this.device = null;   // 'webgpu' | 'wasm' — chosen at initialize()
        this.dtype = null;    // 'fp16' (webgpu) | 'q8' (wasm)
        this.modelId = null;
    }

    async loadTransformers() {
        if (this.transformers) return this.transformers;
        
        console.log('📦 Loading Transformers.js library...');
        console.log('🔍 Current protocol:', window.location.protocol);
        console.log('🔍 Current origin:', window.location.origin);

        // In Electron, globalThis.process is defined, which can make Transformers.js
        // think it is running in a Node environment and try to use the node backend.
        // Temporarily hide it during the dynamic import so it takes the browser path.
        const hadProcess = typeof globalThis.process !== 'undefined';
        const originalProcess = globalThis.process;
        try {
            if (hadProcess) {
                try {
                    // Best-effort override; ignore if not allowed
                    globalThis.process = undefined;
                } catch (e) {
                    console.warn('⚠️ Could not temporarily override globalThis.process:', e.message);
                }
            }

            // Load the VENDORED Transformers.js (js/vendor/transformers/ — it
            // bundles its own ONNX Runtime for the browser). A paid desktop
            // app must not execute runtime code from a CDN and must work
            // offline; the web build serves the same local copy.
            this.transformers = await import('./vendor/transformers/transformers.min.js');
        } finally {
            // Restore process after import so the rest of the app still has it
            if (hadProcess) {
                globalThis.process = originalProcess;
            }
        }

        try {
            const { env } = this.transformers;

            console.log('🔧 Detected environment (after import):', {
                isElectron: typeof process !== 'undefined' && process.versions && process.versions.electron,
                hasNode: typeof process !== 'undefined',
                platform: typeof process !== 'undefined' ? process.platform : 'browser'
            });

            // All env wiring (wasm paths, web-remote vs Electron-bundled
            // model weights) lives in the shared glue module — 23-depth uses
            // the same call, keep them in lockstep.
            const { configureTransformersEnv } = await import('./vendor/transformers/fluid-env.js');
            configureTransformersEnv(env);

            console.log('✅ Transformers.js loaded successfully');
            console.log('📦 env configuration:', {
                allowRemoteModels: env.allowRemoteModels,
                allowLocalModels: env.allowLocalModels,
                useBrowserCache: env.useBrowserCache,
                cacheDir: env.cacheDir,
                backends: env.backends,
            });

            return this.transformers;
        } catch (error) {
            console.error('❌ Failed to configure Transformers.js:', error);
            throw new Error('Failed to load AI library: ' + error.message);
        }
    }

    async initialize(onProgress = null) {
        if (this.isReady) {
            console.log('✅ SAM already ready');
            return;
        }
        if (this.isLoading) {
            console.log('⏳ SAM already loading, waiting...');
            return;
        }
        
        this.isLoading = true;
        console.log('🪄 Loading Instant Roto segmentation model...');
        
        // Update status indicator
        this.updateLoadingStatus('loading');
        
        // Show download modal
        this.showDownloadModal();
        
        try {
            // Load Transformers.js library first
            this.updateDownloadProgress('Loading AI library...', 5);
            const transformers = await this.loadTransformers();
            const { AutoModel, AutoProcessor } = transformers;

            console.log('🔧 Configuring ONNX Runtime for browser...');
            this.updateDownloadProgress('Configuring AI runtime...', 8);

            if (onProgress) onProgress('Loading model...', 0);
            this.updateDownloadProgress('Downloading AI model...', 10);

            const modelId = (typeof window !== 'undefined' && window.config && window.config.INSTANT_ROTO_MODEL)
                || 'onnx-community/EdgeTAM-ONNX';
            this.modelId = modelId;

            const progress_callback = (progress) => {
                console.log('📊 Model download progress:', progress);
                if (progress.status === 'progress' && progress.total) {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    const fileName = progress.file ? progress.file.split('/').pop() : 'model';
                    this.updateDownloadProgress(`Downloading: ${fileName}`, 10 + Math.floor(percent * 0.75));
                    if (onProgress) onProgress(`Downloading ${fileName}...`, percent);
                } else if (progress.status === 'done') {
                    console.log('✅ Download complete, initializing model...');
                    this.updateDownloadProgress('Initializing model...', 90);
                } else if (progress.status === 'initiate') {
                    this.updateDownloadProgress('Starting download...', 10);
                }
            };

            // fp32 on both devices: EdgeTAM's reduced-precision exports are
            // BROKEN (measured 2026-08-14 on the upstream truck.jpg reference:
            // fp32 reproduces iou [0.047, 0.49, 0.757]; fp16 AND q8 collapse to
            // ~0 garbage — which is why the repo pins dtype fp32). Failures can
            // surface at session creation, so the whole load is attempted per
            // device rather than feature-detecting up front.
            const dtype = (typeof window !== 'undefined' && window.config && window.config.INSTANT_ROTO_DTYPE) || 'fp32';

            // CPU (wasm) is the DEFAULT, and not merely a fallback: ONNX
            // Runtime's WebGPU backend returns numerically corrupted masks for
            // BOTH SAM models here. Measured on identical images and prompts
            // (true IoU against ground truth, 5-click logo):
            //     SlimSAM-77   wasm 0.878    webgpu 0.210
            //     EdgeTAM      wasm 0.848    webgpu 0.212
            // WebGPU also reported a predicted IoU of 1.015 — outside the
            // head's valid range, so it is genuine numerical breakage rather
            // than a slightly different mask. Segmentation runs once per click
            // (~0.3-2s on CPU), so the GPU path buys nothing worth that.
            // config.INSTANT_ROTO_DEVICE = 'webgpu' re-tests it after an upstream
            // ORT fix — but note the vendored ORT binary is now the CPU-only
            // build (half the size, and it kept the web bundle under PartyKit's
            // 20MB per-asset cap), so that also needs the .jsep build restored:
            // requesting webgpu against this one fails with "not built with
            // JSEP support" AND poisons the wasm attempt that follows it.
            const forced = (typeof window !== 'undefined' && window.config && window.config.INSTANT_ROTO_DEVICE) || null;
            const attempts = forced
                ? [{ device: forced, dtype }, { device: 'wasm', dtype }]
                : [{ device: 'wasm', dtype }];

            console.log(`📥 Loading segmentation model "${modelId}"...`);
            let lastError = null;
            for (const attempt of attempts) {
                try {
                    this.model = await AutoModel.from_pretrained(modelId, {
                        device: attempt.device,
                        dtype: attempt.dtype,
                        progress_callback,
                    });
                    this.device = attempt.device;
                    this.dtype = attempt.dtype;
                    lastError = null;
                    break;
                } catch (err) {
                    console.warn(`⚠ ${attempt.device}/${attempt.dtype} load failed, trying next backend:`, err.message);
                    lastError = err;
                    this.model = null;
                }
            }
            if (!this.model) throw lastError || new Error('No usable backend for segmentation model');

            console.log(`✅ Model ready on ${this.device} (${this.dtype}):`, modelId);

            this.updateDownloadProgress('Loading processor...', 95);
            this.processor = await AutoProcessor.from_pretrained(modelId);

            this.updateDownloadProgress('Complete!', 100);
            
            this.isReady = true;
            this.isLoading = false;
            console.log('✅ SAM model loaded successfully');
            console.log('🎉 Model is ready, isReady =', this.isReady);
            
            // Update UI
            this.updateLoadingStatus('ready');
            
            // Keep modal visible for a moment to show success
            setTimeout(() => {
                this.hideDownloadModal();
                console.log('📊 Modal hidden after successful load');
            }, 1500);
        } catch (error) {
            console.error('❌ Failed to load SAM model:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            
            this.isLoading = false;
            this.updateLoadingStatus('error');
            
            // Show clear error message for Electron
            let errorMsg = 'AI model loading failed';
            let modalMsg = error.message;
            
            if (error.message.includes('create') || error.message.includes('ONNX')) {
                errorMsg = 'ONNX Runtime initialization failed';
                modalMsg = `ONNX Runtime failed to initialize in Electron.\n\nError: ${error.message}\n\nThis may be due to:\n• Missing ONNX Runtime WASM files\n• Chromium version compatibility\n• Security/CSP restrictions\n\nTry refreshing or use manual shape tools.`;
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                modalMsg = 'Network error downloading AI model.\n\nCheck your internet connection and try again.';
            }
            
            this.updateDownloadProgress(errorMsg, 0);
            
            // Show detailed error after modal closes
            setTimeout(() => {
                this.hideDownloadModal();
                console.error('💬 Showing error dialog:', modalMsg);
                alert('⚠️ Instant Roto Error\n\n' + modalMsg);
            }, 2000);
        }
    }
    
    showDownloadModal() {
        console.log('📊 Showing download modal...');
        let modal = document.getElementById('samDownloadModal');
        if (!modal) {
            console.log('📊 Creating download modal...');
            modal = document.createElement('div');
            modal.id = 'samDownloadModal';
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.9);
                backdrop-filter: blur(8px);
                z-index: 10004;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
            `;
            
            // Add CSS animations if not already added
            if (!document.getElementById('samModalStyles')) {
                const style = document.createElement('style');
                style.id = 'samModalStyles';
                style.textContent = `
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes fadeOut {
                        from { opacity: 1; }
                        to { opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            modal.innerHTML = `
                <div style="
                    background: linear-gradient(180deg, #1a1f2a, #0f141b);
                    border: 1px solid rgba(88, 166, 255, 0.3);
                    border-radius: 16px;
                    padding: 32px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
                    text-align: center;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px;">🪄</div>
                    <h2 style="color: #3fb950; margin: 0 0 12px 0; font-size: 24px; font-weight: 600;">
                        Downloading Instant Roto Model
                    </h2>
                    <p id="samDownloadMessage" style="color: #8b949e; margin: 0 0 24px 0; font-size: 14px;">
                        First-time setup: Downloading EdgeTAM (Segment Anything 2 family)...
                    </p>
                    <div style="
                        background: rgba(0, 0, 0, 0.3);
                        border-radius: 8px;
                        height: 8px;
                        overflow: hidden;
                        margin-bottom: 12px;
                    ">
                        <div id="samDownloadBar" style="
                            background: linear-gradient(90deg, #238636, #3fb950);
                            height: 100%;
                            width: 0%;
                            transition: width 0.3s ease;
                            box-shadow: 0 0 12px rgba(63, 185, 80, 0.6);
                        "></div>
                    </div>
                    <div id="samDownloadPercent" style="
                        color: #3fb950;
                        font-size: 18px;
                        font-weight: 600;
                        font-family: monospace;
                    ">0%</div>
                    <div style="
                        margin-top: 20px;
                        padding-top: 20px;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                        color: #6e7681;
                        font-size: 12px;
                        line-height: 1.6;
                    ">
                        💾 Model size: ~40 MB<br>
                        ⚡ One-time download • Cached for instant future use<br>
                        🔒 Runs entirely in your browser
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            console.log('📊 Modal appended to body');
        } else {
            console.log('📊 Modal already exists, showing it');
        }
        modal.style.display = 'flex';
        console.log('📊 Modal display set to flex');
    }
    
    hideDownloadModal() {
        const modal = document.getElementById('samDownloadModal');
        if (modal) {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.animation = '';
            }, 300);
        }
    }
    
    updateDownloadProgress(message, percent) {
        console.log(`📊 Progress: ${percent}% - ${message}`);
        const messageEl = document.getElementById('samDownloadMessage');
        const barEl = document.getElementById('samDownloadBar');
        const percentEl = document.getElementById('samDownloadPercent');
        
        if (messageEl) messageEl.textContent = message;
        if (barEl) barEl.style.width = percent + '%';
        if (percentEl) percentEl.textContent = percent + '%';
    }

    updateLoadingStatus(status) {
        console.log(`📊 Status update: ${status}`);
        const statusEl = document.getElementById('samLoadingStatus');
        if (!statusEl) {
            console.warn('⚠️ Status element not found');
            return;
        }
        
        switch (status) {
            case 'loading':
                statusEl.textContent = 'Loading AI model...';
                statusEl.style.color = '#58a6ff';
                console.log('📊 Status set to: Loading');
                break;
            case 'ready':
                statusEl.textContent = 'AI Ready';
                statusEl.style.color = '#3fb950';
                statusEl.style.fontWeight = '600';
                console.log('📊 Status set to: Ready');
                break;
            case 'error':
                statusEl.textContent = 'Model failed to load';
                statusEl.style.color = '#f85149';
                console.log('📊 Status set to: Error');
                break;
            default:
                statusEl.textContent = '';
        }
    }

    // Run the image (no prompts) through the processor to get pixel_values +
    // original/reshaped sizes. Some processor wrappers (Sam2VideoProcessor)
    // route _call differently, so fall back to the bare image processor.
    async _processImage(image) {
        try {
            return await this.processor(image);
        } catch (e) {
            if (this.processor && this.processor.image_processor) {
                console.warn('⚠ processor(image) failed, using image_processor directly:', e.message);
                return await this.processor.image_processor(image);
            }
            throw e;
        }
    }

    async loadImage(imageUrl, displayWidth = null, displayHeight = null) {
        try {
            if (!this.transformers) {
                console.error('❌ Transformers not loaded');
                return false;
            }

            // Load image using RawImage
            const { RawImage } = this.transformers;
            this.currentImage = await RawImage.fromURL(imageUrl);

            // Track the display space where clicks are coming from
            this.displayWidth = (typeof displayWidth === 'number' && displayWidth > 0)
                ? displayWidth
                : this.currentImage.width;
            this.displayHeight = (typeof displayHeight === 'number' && displayHeight > 0)
                ? displayHeight
                : this.currentImage.height;

            // Reset cached inputs/embeddings for this image
            this.imageInputs = null;
            this.imageEmbeddings = null;

            if (!this.processor || !this.model) {
                console.warn('⚠ Processor/model not loaded yet; image embeddings will be prepared on first segmentation');
            } else {
                // Inform the UI that we are computing image embeddings, like the demo.
                try {
                    const statusEl = typeof document !== 'undefined'
                        ? document.getElementById('samLoadingStatus')
                        : null;
                    if (statusEl) {
                        statusEl.textContent = 'Extracting image embeddings...';
                        statusEl.style.color = '#58a6ff';
                    }
                } catch (e) {
                    // ignore DOM access issues
                }

                // Prepare base image inputs and image embeddings once (no points yet)
                this.imageInputs = await this._processImage(this.currentImage);
                this.imageEmbeddings = await this.model.get_image_embeddings(this.imageInputs);
                console.log('✅ Image inputs and embeddings prepared for segmentation', {
                    original_sizes: this.imageInputs.original_sizes?.data || this.imageInputs.original_sizes,
                    reshaped_input_sizes: this.imageInputs.reshaped_input_sizes?.data || this.imageInputs.reshaped_input_sizes,
                    displayWidth: this.displayWidth,
                    displayHeight: this.displayHeight,
                });
            }

            console.log('✅ Image loaded for segmentation (raw image stored)');
            return true;
        } catch (error) {
            console.error('❌ Failed to load image:', error);
            this.imageInputs = null;
            this.imageEmbeddings = null;
            return false;
        }
    }

    async segment(points, labels) {
        console.log('🎯 SAM segment called with:', {
            pointCount: points.length,
            points,
            labels
        });

        if (!this.isReady) {
            console.error('❌ SAM model not ready');
            return null;
        }

        if (!this.currentImage) {
            console.error('❌ No image loaded. Call loadImage() first.');
            return null;
        }

        // Log image/display dimensions for coordinate space verification
        console.log('🔍 Image/display dimensions:', {
            currentImageSize: this.currentImage ? [this.currentImage.width, this.currentImage.height] : 'null',
            displaySize: [this.displayWidth, this.displayHeight],
        });

        try {
            // Reuse precomputed image inputs and embeddings like the Xenova worker.
            let imageInputs = this.imageInputs;
            if (!imageInputs) {
                imageInputs = await this._processImage(this.currentImage);
                this.imageInputs = imageInputs;
            }

            let imageEmbeddings = this.imageEmbeddings;
            if (!imageEmbeddings) {
                imageEmbeddings = await this.model.get_image_embeddings(imageInputs);
                this.imageEmbeddings = imageEmbeddings;
            }

            const original_sizes = imageInputs.original_sizes?.data || imageInputs.original_sizes;
            const reshaped_input_sizes = imageInputs.reshaped_input_sizes?.data || imageInputs.reshaped_input_sizes;

            console.log('🔍 SAM imageInputs:', {
                pixel_values_shape: imageInputs.pixel_values?.dims,
                original_sizes,
                reshaped_input_sizes,
            });

            if (!reshaped_input_sizes || !Array.isArray(reshaped_input_sizes) || !reshaped_input_sizes.length) {
                console.warn('⚠ SAM reshaped_input_sizes missing or invalid, falling back to brightness-based segmentation');
                return this.segmentFromBrightness(points, labels);
            }

            const reshaped = reshaped_input_sizes[0];
            const reshapedHeight = reshaped[0];
            const reshapedWidth = reshaped[1];

            const displayWidth = this.displayWidth || this.currentImage.width || 1;
            const displayHeight = this.displayHeight || this.currentImage.height || 1;

            // Map click points from display space (mask editor canvas) into SAM's
            // resized image space, matching the Xenova worker logic.
            const scaledPoints = points.map(p => {
                const xNorm = displayWidth > 0 ? p[0] / displayWidth : 0;
                const yNorm = displayHeight > 0 ? p[1] / displayHeight : 0;
                return [xNorm * reshapedWidth, yNorm * reshapedHeight];
            });

            // Build explicit ONNX tensors for SAM model inputs
            const { Tensor } = this.transformers;

            // input_points: [batch_size, point_batch_size, nb_points_per_image, 2]
            const flatPoints = new Float32Array(scaledPoints.flat());
            const input_points = new Tensor('float32', flatPoints, [1, 1, scaledPoints.length, 2]);

            // input_labels: [batch_size, point_batch_size, nb_points_per_image]
            const labelBigInts = labels.map(l => BigInt(l));
            const input_labels = new Tensor('int64', labelBigInts, [1, 1, labelBigInts.length]);

            console.log('🔍 SAM input_points tensor:', {
                dims: input_points.dims,
                size: input_points.size,
                type: input_points.type,
            });
            console.log('🔍 SAM input_labels tensor:', {
                dims: input_labels.dims,
                size: input_labels.size,
                type: input_labels.type,
            });

            // Run SAM model with precomputed image embeddings + prompt tensors
            const outputs = await this.model({
                ...imageEmbeddings,
                input_points,
                input_labels,
            });
            console.log('✅ SAM model outputs received:', {
                pred_masks_dims: outputs.pred_masks?.dims,
                iou_scores_dims: outputs.iou_scores?.dims,
            });
            console.log('🔍 IoU scores:', outputs.iou_scores.data);

            // Post-process masks to original image size (post_process_masks
            // lives on SamProcessor, or on the image processor if AutoProcessor
            // resolved a generic wrapper)
            const postProcessor = (typeof this.processor.post_process_masks === 'function')
                ? this.processor
                : this.processor.image_processor;
            const masks = await postProcessor.post_process_masks(
                outputs.pred_masks,
                original_sizes,
                reshaped_input_sizes,
            );

            console.log(' SAM masks post-processed');

            // Decode masks exactly like the Xenova demo, using RawImage to
            // interpret all proposals as separate channels of a single image.
            const { RawImage } = this.transformers;
            const rawMaskImage = RawImage.fromTensor(masks[0][0]);

            const width = rawMaskImage.width;
            const height = rawMaskImage.height;
            const size = width * height;
            const pixelData = rawMaskImage.data; // length = size * numMasks

            const numMasks = outputs.iou_scores.data.length; // typically 3
            const candidates = [];

            for (let m = 0; m < numMasks; m++) {
                const binary = new Uint8Array(size);
                let minX = width, minY = height, maxX = -1, maxY = -1;
                let nonZeroCount = 0;

                for (let i = 0; i < size; i++) {
                    // At each pixel index i, the value for mask m is stored at
                    // pixelData[numMasks * i + m]. A value of 1 indicates
                    // foreground, mirroring the demo's check.
                    if (pixelData[numMasks * i + m] === 1) {
                        binary[i] = 1;
                        nonZeroCount++;

                        const x = i % width;
                        const y = (i - x) / width;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }

                console.log(`🔍 Mask[${m}] stats:`, {
                    totalPixels: size,
                    nonZeroPixels: nonZeroCount,
                    coverage: size ? (nonZeroCount / size * 100).toFixed(1) + '%' : '0%',
                    iou: outputs.iou_scores.data[m]
                });

                if (nonZeroCount === 0) {
                    continue;
                }

                const processed = {
                    data: binary,
                    width,
                    height,
                    boundingBox: {
                        x: minX,
                        y: minY,
                        width: maxX - minX + 1,
                        height: maxY - minY + 1,
                    },
                };

                candidates.push({
                    ...processed,
                    iou: outputs.iou_scores.data[m],
                    proposalIndex: m,
                });
            }

            // D0.5 edge quality: candidates leave this function as CONTINUOUS
            // 0-255 coverage (`soft: true`), never 1-bit. The old path
            // nearest-neighbor-rescaled the binary mask to display size —
            // stair-stepped edges frozen into every downstream consumer
            // (visual clip, collider, point tests). Bilinear sampling of the
            // binary field gives a proper ~1px antialiased edge for free.
            // Legacy 0/1 masks (old saves, brightness fallback) carry no
            // `soft` flag and consumers keep treating them as hard.

            // Bilinear sample of a 0/1 field at continuous coords → 0..1
            function sampleBilinear(srcData, srcW, srcH, fx, fy) {
                const x0 = Math.floor(fx), y0 = Math.floor(fy);
                const x1 = Math.min(x0 + 1, srcW - 1), y1 = Math.min(y0 + 1, srcH - 1);
                const cx0 = Math.max(x0, 0), cy0 = Math.max(y0, 0);
                const tx = fx - x0, ty = fy - y0;
                const v00 = srcData[cy0 * srcW + cx0], v10 = srcData[cy0 * srcW + x1];
                const v01 = srcData[y1 * srcW + cx0], v11 = srcData[y1 * srcW + x1];
                return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
            }
            // 3x3 box filter: 0/1 field → 0-255 coverage with a 1px soft edge
            // (used when no rescale is needed, so same-res masks get AA too).
            //
            // The AA only ever ADDS coverage outside the mask — a pixel the
            // model marked as foreground stays fully opaque. Averaging over the
            // neighbourhood unconditionally also eats into THIN features from
            // the inside, because a narrow stroke is nearly all boundary:
            // measured on 120px text, a letter came back only 64.6% opaque,
            // which is the washed-out "doesn't fill in properly" look on text
            // and thin shapes. Solid interiors + a soft outer skirt keeps the
            // antialiased edge without the erosion.
            const solidFill = !(typeof window !== 'undefined' && window.config
                && window.config.INSTANT_ROTO_SOLID_FILL === false);
            function binaryToCoverage(srcData, srcW, srcH) {
                const out = new Uint8Array(srcW * srcH);
                for (let y = 0; y < srcH; y++) {
                    const y0 = Math.max(y - 1, 0), y1 = Math.min(y + 1, srcH - 1);
                    for (let x = 0; x < srcW; x++) {
                        const idx = y * srcW + x;
                        if (solidFill && srcData[idx]) { out[idx] = 255; continue; }
                        const x0 = Math.max(x - 1, 0), x1 = Math.min(x + 1, srcW - 1);
                        let sum = 0, cnt = 0;
                        for (let yy = y0; yy <= y1; yy++)
                            for (let xx = x0; xx <= x1; xx++) { sum += srcData[yy * srcW + xx]; cnt++; }
                        out[idx] = Math.round((sum / cnt) * 255);
                    }
                }
                return out;
            }

            const dispW = this.displayWidth || width;
            const dispH = this.displayHeight || height;
            if ((dispW !== width || dispH !== height) && candidates.length) {
                console.log('🔧 Rescaling SAM masks to display size (bilinear coverage):', {
                    maskSize: [width, height],
                    displaySize: [dispW, dispH],
                });

                for (let ci = 0; ci < candidates.length; ci++) {
                    const c = candidates[ci];
                    const srcW = c.width;
                    const srcH = c.height;
                    const srcData = c.data;

                    const scaled = new Uint8Array(dispW * dispH);
                    let minX = dispW, minY = dispH, maxX = -1, maxY = -1;
                    let nonZero = 0;

                    for (let y = 0; y < dispH; y++) {
                        const fy = (y + 0.5) * srcH / dispH - 0.5;
                        const ny = Math.min(srcH - 1, Math.max(0, Math.round(fy)));
                        for (let x = 0; x < dispW; x++) {
                            const fx = (x + 0.5) * srcW / dispW - 0.5;
                            let cov = sampleBilinear(srcData, srcW, srcH, fx, fy);
                            // Same rule as binaryToCoverage: resampling may add a
                            // soft skirt outside the mask but must never erode a
                            // foreground pixel, or thin strokes fade out.
                            if (solidFill && cov > 0 && cov < 1) {
                                const nx = Math.min(srcW - 1, Math.max(0, Math.round(fx)));
                                if (srcData[ny * srcW + nx]) cov = 1;
                            }
                            if (cov > 0) {
                                const dstIdx = y * dispW + x;
                                scaled[dstIdx] = Math.round(cov * 255);
                                nonZero++;
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }

                    if (nonZero === 0) {
                        // Keep original candidate if scaling removed everything
                        continue;
                    }

                    c.data = scaled;
                    c.soft = true;
                    c.width = dispW;
                    c.height = dispH;
                    c.boundingBox = {
                        x: minX,
                        y: minY,
                        width: maxX - minX + 1,
                        height: maxY - minY + 1,
                    };
                }
            } else {
                // Same resolution: still convert 0/1 → antialiased coverage
                for (let ci = 0; ci < candidates.length; ci++) {
                    const c = candidates[ci];
                    c.data = binaryToCoverage(c.data, c.width, c.height);
                    c.soft = true;
                    // The 3x3 filter grows the edge by 1px — expand the bbox
                    // so the crop in runSAMSegmentation keeps the AA skirt
                    const bb = c.boundingBox;
                    const nx = Math.max(0, bb.x - 1), ny = Math.max(0, bb.y - 1);
                    bb.width = Math.min(c.width - nx, bb.width + (bb.x - nx) + 1);
                    bb.height = Math.min(c.height - ny, bb.height + (bb.y - ny) + 1);
                    bb.x = nx;
                    bb.y = ny;
                }
            }

            if (!candidates.length) {
                console.warn('⚠ SAM produced no valid mask candidates, even after coarse fallback. Falling back to brightness-based segmentation.');
                const brightnessFallback = this.segmentFromBrightness(points, labels);
                if (brightnessFallback) {
                    return brightnessFallback;
                }
                return null;
            }

            // Choose the default candidate: highest predicted IoU, but a
            // proposal that swallows most of the canvas is only used when
            // nothing tighter exists. "Click an object" should never default
            // to everything — the near-full-canvas proposal often outscores
            // the clean object cutout on flat/painterly content, and the
            // user can still reach it through the candidate cycler.
            const maxCover = (typeof window !== 'undefined' && window.config && typeof window.config.INSTANT_ROTO_MAX_COVER === 'number')
                ? window.config.INSTANT_ROTO_MAX_COVER : 0.8;
            const coverageOf = (c) => {
                let filled = 0;
                const stride = 4; // sampled estimate is plenty for a threshold test
                for (let i = 0; i < c.data.length; i += stride) {
                    if (c.data[i] > 127) filled++;
                }
                return (filled * stride) / c.data.length;
            };
            const covs = candidates.map(coverageOf);
            const eligible = [];
            for (let i = 0; i < candidates.length; i++) {
                if (covs[i] <= maxCover) eligible.push(i);
            }
            // Everything is near-full-canvas — take them all rather than nothing
            if (!eligible.length) for (let i = 0; i < candidates.length; i++) eligible.push(i);

            let peakIoU = -Infinity;
            for (const i of eligible) if (candidates[i].iou > peakIoU) peakIoU = candidates[i].iou;

            // The IoU head is the model's own "which proposal is good" signal
            // and it is reliable on photographic content — but on painterly /
            // abstract art (fluid captures, mandalas) the model is out of
            // distribution and its scores go nearly flat, where it will happily
            // rank a 47x65 speck above a 461x532 region. Measured on a
            // mandala: [0.03, 0.297, 0.477] picked the speck, which is the
            // "never fills the shape in" complaint. So: trust IoU when the
            // model is confident, and fall back to the LARGEST proposal under
            // the coverage cap when it clearly is not. The cutout cycler still
            // offers every proposal either way.
            const trustIoU = (typeof window !== 'undefined' && window.config && typeof window.config.INSTANT_ROTO_TRUST_IOU === 'number')
                ? window.config.INSTANT_ROTO_TRUST_IOU : 0.6;
            // The proposals are ranked by the model's predicted-IoU head, which
            // IS trustworthy on the CPU backend (measured on a 5-click logo:
            // predicted [0.927, 0.995, 0.974] against true [0.207, 0.878,
            // 0.846] — it ranks the best mask first). It only goes flat on
            // painterly/abstract content, where the model is out of
            // distribution and will rank a speck first; there the largest
            // proposal under the coverage cap is the better default.
            const confident = peakIoU >= trustIoU;

            let bestIdx = eligible[0];
            if (confident) {
                for (const i of eligible) if (candidates[i].iou > candidates[bestIdx].iou) bestIdx = i;
            } else {
                for (const i of eligible) if (covs[i] > covs[bestIdx]) bestIdx = i;
            }
            const why = confident ? 'by predicted IoU'
                : `largest (low confidence, peak IoU ${peakIoU.toFixed(3)})`;
            console.log(` Selected default candidate ${bestIdx} (IoU ${candidates[bestIdx].iou.toFixed(3)}, coverage ${(covs[bestIdx] * 100).toFixed(1)}%) of ${candidates.length} — ${why}`);

            return {
                primary: candidates[bestIdx],
                candidates,
                bestCandidateIndex: bestIdx
            };
        } catch (error) {
            console.error('❌ Segmentation failed:', error);
            return null;
        }
    }

    // Fallback segmentation that ignores SAM outputs and builds a mask
    // directly from the canvas brightness around the clicked region.
    // Returns { primary, candidates, bestCandidateIndex } or null.
    segmentFromBrightness(points, labels) {
        try {
            let canvas = typeof document !== 'undefined' ? document.getElementById('canvas') : null;
            let ctx = canvas ? canvas.getContext('2d') : null;

            // In some cases the main canvas might be WebGL-only. Fall back to the
            // mask editor canvas, which we know is 2D, so the fallback always has
            // something to read from.
            if (!ctx) {
                const editorCanvas = typeof document !== 'undefined' ? document.getElementById('maskEditorCanvas') : null;
                if (editorCanvas) {
                    const editorCtx = editorCanvas.getContext('2d');
                    if (editorCtx) {
                        canvas = editorCanvas;
                        ctx = editorCtx;
                    }
                }
            }

            if (!canvas || !ctx) {
                console.warn('⚠ segmentFromBrightness: no readable 2D canvas found');
                return null;
            }

            const width = canvas.width;
            const height = canvas.height;
            const size = width * height;
            const img = ctx.getImageData(0, 0, width, height).data;

            // Read hardness from global settings
            let hardness = 0.6;
            try {
                if (typeof window !== 'undefined' && window.samMaskSettings && typeof window.samMaskSettings.hardness === 'number') {
                    hardness = Math.min(1, Math.max(0, window.samMaskSettings.hardness));
                }
            } catch (e) {
                // ignore
            }

            // Build brightness map [0,1]
            const brightness = new Float32Array(size);
            for (let i = 0, j = 0; i < size; i++, j += 4) {
                const r = img[j];
                const g = img[j + 1];
                const b = img[j + 2];
                brightness[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            }

            // Determine ROI around positive points
            let roiMinX = 0, roiMinY = 0, roiMaxX = width - 1, roiMaxY = height - 1;
            if (Array.isArray(points) && Array.isArray(labels) && points.length === labels.length && points.length > 0) {
                let foundPos = false;
                let minX = width, minY = height, maxX = 0, maxY = 0;
                for (let i = 0; i < points.length; i++) {
                    if (labels[i] !== 1) continue;
                    const p = points[i];
                    if (!Array.isArray(p) || p.length < 2) continue;
                    const px = Math.round(p[0]);
                    const py = Math.round(p[1]);
                    if (px < 0 || px >= width || py < 0 || py >= height) continue;
                    foundPos = true;
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }

                if (foundPos) {
                    const basePad = 40;
                    const extraPad = 60 * (1 - hardness);
                    const pad = Math.round(basePad + extraPad);
                    roiMinX = Math.max(0, minX - pad);
                    roiMinY = Math.max(0, minY - pad);
                    roiMaxX = Math.min(width - 1, maxX + pad);
                    roiMaxY = Math.min(height - 1, maxY + pad);

                    console.log('🔍 Brightness ROI around positives:', {
                        roiMinX, roiMinY, roiMaxX, roiMaxY, pad
                    });
                }
            }

            // Collect brightness values inside ROI
            const roiValues = [];
            for (let y = roiMinY; y <= roiMaxY; y++) {
                for (let x = roiMinX; x <= roiMaxX; x++) {
                    const idx = y * width + x;
                    roiValues.push(brightness[idx]);
                }
            }

            if (!roiValues.length) {
                console.warn('⚠ segmentFromBrightness: empty ROI');
                return null;
            }

            // Hardness-controlled percentile for brightness threshold
            const q = 0.6 + 0.3 * hardness; // soft ~60%, hard ~90%
            roiValues.sort((a, b) => a - b);
            const qIndex = Math.min(roiValues.length - 1, Math.max(0, Math.floor(q * (roiValues.length - 1))));
            const brightnessThreshold = roiValues[qIndex];

            console.log('🔍 Brightness fallback threshold:', {
                percentile: q,
                threshold: Number(brightnessThreshold.toFixed(4)),
                roiCount: roiValues.length
            });

            // Build binary mask in ROI
            const maskData = new Uint8Array(size);
            let minX = width, minY = height, maxX = -1, maxY = -1;
            let hasPixels = false;
            for (let y = roiMinY; y <= roiMaxY; y++) {
                for (let x = roiMinX; x <= roiMaxX; x++) {
                    const idx = y * width + x;
                    if (brightness[idx] >= brightnessThreshold) {
                        maskData[idx] = 1;
                        hasPixels = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (!hasPixels) {
                console.warn('⚠ segmentFromBrightness: no pixels above brightness threshold');
                return null;
            }

            const processed = {
                data: maskData,
                width,
                height,
                boundingBox: {
                    x: minX,
                    y: minY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1,
                },
            };

            return {
                primary: processed,
                candidates: [processed],
                bestCandidateIndex: 0,
            };
        } catch (e) {
            console.error('❌ segmentFromBrightness failed:', e);
            return null;
        }
    }

    processMask(maskData, dims, points, labels) {
        // Extract mask dimensions
        const rank = dims.length;
        const height = dims[rank - 2];
        const width = dims[rank - 1];

        if (!Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) {
            console.warn('⚠ Invalid mask dimensions:', dims);
            return null;
        }

        const size = height * width;
        
        // Read mask hardness from global settings (0 = soft, 1 = very crisp)
        let hardness = 0.6;
        try {
            if (typeof window !== 'undefined' && window.samMaskSettings && typeof window.samMaskSettings.hardness === 'number') {
                hardness = Math.min(1, Math.max(0, window.samMaskSettings.hardness));
            }
        } catch (e) {
            // Ignore if window is not available
        }
        
        // Canonical SAM behavior: post_process_masks returns probabilities in [0,1].
        // Treat values above an adaptive threshold as foreground.
        let binaryMask = new Array(size);
        let minVal = Number.POSITIVE_INFINITY;
        let maxVal = Number.NEGATIVE_INFINITY;
        let sumVal = 0;
        for (let i = 0; i < size && i < maskData.length; i++) {
            const v = maskData[i];
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
            sumVal += v;
        }
        const meanVal = size > 0 ? sumVal / size : 0;
        console.log('🔍 Raw SAM mask value stats:', {
            min: minVal,
            max: maxVal,
            mean: Number.isFinite(meanVal) ? Number(meanVal.toFixed(4)) : meanVal,
        });

        // Debug: check mask values at the clicked positive points
        let clickedPointsMean = meanVal;
        if (Array.isArray(points) && points.length > 0) {
            const sampleValues = [];
            let clickSum = 0;
            let clickCount = 0;
            for (let i = 0; i < Math.min(3, points.length); i++) {
                const p = points[i];
                if (!Array.isArray(p) || p.length < 2) continue;
                const px = Math.round(p[0]);
                const py = Math.round(p[1]);
                if (px >= 0 && px < width && py >= 0 && py < height) {
                    const idx = py * width + px;
                    if (idx >= 0 && idx < size) {
                        const val = maskData[idx];
                        sampleValues.push({ point: [px, py], value: val });
                        clickSum += val;
                        clickCount++;
                    }
                }
            }
            if (clickCount > 0) {
                clickedPointsMean = clickSum / clickCount;
            }
            console.log('🔍 Mask values at clicked points:', sampleValues, 'mean:', clickedPointsMean.toFixed(3));
        }

        // Simple, predictable threshold: 0.5 is SAM's canonical threshold
        // Hardness adjusts it: lower hardness = lower threshold (softer, more inclusive)
        //                      higher hardness = higher threshold (harder, more exclusive)
        const threshold = 0.3 + (hardness * 0.4); // Range: 0.3 (soft) to 0.7 (hard), default 0.54 at 60%
        
        // Always use v > threshold (SAM outputs high values for foreground)
        for (let i = 0; i < size && i < maskData.length; i++) {
            binaryMask[i] = maskData[i] > threshold ? 1 : 0;
        }
        
        console.log('🔍 Thresholding:', {
            threshold: Number(threshold.toFixed(3)),
            hardness: Number((hardness * 100).toFixed(0)) + '%',
            method: 'fixed (0.3 + hardness×0.4)'
        });

        // Constrain mask to a padded region around positive points (labels === 1),
        // then refine inside that region by keeping only the highest-probability pixels.
        if (Array.isArray(points) && Array.isArray(labels) && points.length === labels.length && points.length > 0) {
            let roiMinX = width, roiMinY = height, roiMaxX = 0, roiMaxY = 0;
            let havePositives = false;
            for (let i = 0; i < points.length; i++) {
                if (labels[i] !== 1) continue;
                const p = points[i];
                if (!Array.isArray(p) || p.length < 2) continue;
                const px = Math.round(p[0]);
                const py = Math.round(p[1]);
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                havePositives = true;
                if (px < roiMinX) roiMinX = px;
                if (px > roiMaxX) roiMaxX = px;
                if (py < roiMinY) roiMinY = py;
                if (py > roiMaxY) roiMaxY = py;
            }

            if (havePositives) {
                // Padding: softer hardness -> larger padding, harder -> smaller
                const basePad = 40; // pixels
                const extraPad = 60 * (1 - hardness); // 0–60
                const pad = Math.round(basePad + extraPad);

                roiMinX = Math.max(0, roiMinX - pad);
                roiMinY = Math.max(0, roiMinY - pad);
                roiMaxX = Math.min(width - 1, roiMaxX + pad);
                roiMaxY = Math.min(height - 1, roiMaxY + pad);

                console.log('🔍 ROI clamp around positives:', {
                    roiMinX, roiMinY, roiMaxX, roiMaxY, pad
                });

                // First zero-out everything outside ROI
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (x < roiMinX || x > roiMaxX || y < roiMinY || y > roiMaxY) {
                            const idx = y * width + x;
                            binaryMask[idx] = 0;
                        }
                    }
                }

                // Optional brightness-based refinement using the underlying canvas image
                let brightnessData = null;
                try {
                    const canvas = typeof document !== 'undefined' ? document.getElementById('canvas') : null;
                    if (canvas && canvas.width === width && canvas.height === height) {
                        const ctx2d = canvas.getContext('2d');
                        if (ctx2d) {
                            const img = ctx2d.getImageData(0, 0, width, height).data;
                            brightnessData = new Float32Array(size);
                            for (let i = 0, j = 0; i < size; i++, j += 4) {
                                const r = img[j];
                                const g = img[j + 1];
                                const b = img[j + 2];
                                // Standard luma approximation, normalized to [0,1]
                                brightnessData[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                            }
                            console.log('🔍 Brightness map computed for ROI refinement');
                        }
                    }
                } catch (e) {
                    console.warn('⚠ Brightness refinement failed, falling back to SAM probabilities:', e);
                    brightnessData = null;
                }

                // Collect values inside ROI where mask is currently 1
                const roiValues = [];
                for (let y = roiMinY; y <= roiMaxY; y++) {
                    for (let x = roiMinX; x <= roiMaxX; x++) {
                        const idx = y * width + x;
                        if (binaryMask[idx] === 1) {
                            const v = brightnessData ? brightnessData[idx] : maskData[idx];
                            roiValues.push(v);
                        }
                    }
                }

                if (roiValues.length > 0) {
                    // Hardness-controlled percentile: soft ~60%, hard ~90%
                    const q = 0.6 + 0.3 * hardness;
                    roiValues.sort((a, b) => a - b);
                    const qIndex = Math.min(roiValues.length - 1, Math.max(0, Math.floor(q * (roiValues.length - 1))));
                    const innerThreshold = roiValues[qIndex];

                    console.log('🔍 ROI refinement:', {
                        percentile: q,
                        innerThreshold: Number(innerThreshold.toFixed(4)),
                        roiCount: roiValues.length,
                        source: brightnessData ? 'brightness' : 'sam_probabilities'
                    });

                    // Keep only the highest-value pixels inside ROI (brightness if available, else SAM prob)
                    let kept = 0;
                    for (let y = roiMinY; y <= roiMaxY; y++) {
                        for (let x = roiMinX; x <= roiMaxX; x++) {
                            const idx = y * width + x;
                            if (binaryMask[idx] === 1) {
                                const v = brightnessData ? brightnessData[idx] : maskData[idx];
                                if (v >= innerThreshold) {
                                    binaryMask[idx] = 1;
                                    kept++;
                                } else {
                                    binaryMask[idx] = 0;
                                }
                            }
                        }
                    }

                    console.log('🔍 ROI kept pixels:', {
                        keptInsideROI: kept
                    });
                }
            }
        }

        // Refine mask using points/labels if available
        if (Array.isArray(points) && Array.isArray(labels) && points.length === labels.length && points.length > 0) {
            const keep = new Uint8Array(size);
            const queue = [];

            // Seed BFS from positive points (label === 1)
            for (let i = 0; i < points.length; i++) {
                if (labels[i] !== 1) continue;
                const p = points[i];
                if (!Array.isArray(p) || p.length < 2) continue;
                let px = Math.round(p[0]);
                let py = Math.round(p[1]);
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                const idx = py * width + px;
                if (binaryMask[idx] !== 1 || keep[idx]) continue;
                keep[idx] = 1;
                queue.push(idx);
            }

            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ];

            // Flood fill to keep only connected components attached to positives
            while (queue.length > 0) {
                const idx = queue.shift();
                const x = idx % width;
                const y = (idx - x) / width;
                for (let d = 0; d < dirs.length; d++) {
                    const nx = x + dirs[d][0];
                    const ny = y + dirs[d][1];
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const nIdx = ny * width + nx;
                    if (binaryMask[nIdx] !== 1 || keep[nIdx]) continue;
                    keep[nIdx] = 1;
                    queue.push(nIdx);
                }
            }

            // Apply keep mask (if anything was kept)
            let anyKept = false;
            let keptCount = 0;
            let totalThresholded = 0;
            for (let i = 0; i < size; i++) {
                if (binaryMask[i] === 1) totalThresholded++;
                if (keep[i]) {
                    anyKept = true;
                    keptCount++;
                    binaryMask[i] = 1;
                } else {
                    binaryMask[i] = 0;
                }
            }
            console.log('🔍 BFS refinement:', {
                totalThresholded,
                keptAfterBFS: keptCount,
                reduction: totalThresholded > 0 ? ((1 - keptCount / totalThresholded) * 100).toFixed(1) + '%' : 'N/A'
            });
        }
        
        // Simple morphological smoothing to reduce speckle and tiny gaps.
        // Make the erosion/dilation strength depend on hardness.
        const erosionNeighborMin = 2 + Math.round(hardness * 3);  // 2–5
        const dilationNeighborMin = 3 + Math.round(hardness * 3); // 3–6

        // First pass: remove isolated pixels (erosion-like).
        const eroded = new Array(size);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (binaryMask[idx] === 0) {
                    eroded[idx] = 0;
                    continue;
                }
                let neighbors = 0;
                for (let ny = y - 1; ny <= y + 1; ny++) {
                    for (let nx = x - 1; nx <= x + 1; nx++) {
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        const nIdx = ny * width + nx;
                        if (binaryMask[nIdx] === 1) neighbors++;
                    }
                }
                // Require a minimum number of neighbors (including self) to keep the pixel.
                eroded[idx] = neighbors >= erosionNeighborMin ? 1 : 0;
            }
        }

        // Second pass: fill small holes (dilation-like).
        const smoothed = new Array(size);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (eroded[idx] === 1) {
                    smoothed[idx] = 1;
                    continue;
                }
                let neighbors = 0;
                for (let ny = y - 1; ny <= y + 1; ny++) {
                    for (let nx = x - 1; nx <= x + 1; nx++) {
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        const nIdx = ny * width + nx;
                        if (eroded[nIdx] === 1) neighbors++;
                    }
                }
                // If many neighbors are 1, fill this pixel as well.
                smoothed[idx] = neighbors >= dilationNeighborMin ? 1 : 0;
            }
        }

        binaryMask = smoothed;
        
        // Carve out neighborhoods around negative points (label === 0) AFTER smoothing
        // Use a larger radius that scales with hardness (softer = larger carving)
        if (Array.isArray(points) && Array.isArray(labels) && points.length > 0) {
            const negRadius = Math.round(15 + (1 - hardness) * 15); // 15-30 pixels (softer = more aggressive)
            for (let i = 0; i < points.length; i++) {
                if (labels[i] !== 0) continue;
                const p = points[i];
                if (!Array.isArray(p) || p.length < 2) continue;
                const cx = Math.round(p[0]);
                const cy = Math.round(p[1]);
                for (let dy = -negRadius; dy <= negRadius; dy++) {
                    for (let dx = -negRadius; dx <= negRadius; dx++) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                        const dist2 = dx * dx + dy * dy;
                        if (dist2 > negRadius * negRadius) continue;
                        const nIdx = ny * width + nx;
                        binaryMask[nIdx] = 0;
                    }
                }
            }
        }
        
        // Find bounding box of the mask
        let minX = width, minY = height, maxX = 0, maxY = 0;
        let hasPixels = false;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (binaryMask[y * width + x] === 1) {
                    hasPixels = true;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        
        if (!hasPixels) {
            console.warn('⚠ No pixels in mask');
            return null;
        }
        
        // Return mask data with bounding box
        return {
            data: binaryMask,
            width: width,
            height: height,
            boundingBox: {
                x: minX,
                y: minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1
            }
        };
    }
}

// Global SAM instance
window.samSegmenter = new SAMSegmenter();

// Auto-initialize when mask editor opens with smart select mode
window.initializeSAM = async function() {
    if (!window.samSegmenter.isReady && !window.samSegmenter.isLoading) {
        await window.samSegmenter.initialize();
    }
};

console.log('📦 SAM Integration loaded');
