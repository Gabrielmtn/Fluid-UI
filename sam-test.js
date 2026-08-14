const logEl = document.getElementById('log');

function log(...args) {
    console.log(...args);
    const line = args
        .map(a => {
            try {
                if (typeof a === 'string') return a;
                return JSON.stringify(a, null, 2);
            } catch {
                return String(a);
            }
        })
        .join(' ');
    logEl.textContent += line + '\n';
}

(async () => {
    try {
        log('[info] Importing VENDORED Transformers.js (js/vendor/transformers, v3.8.1)...');

        // Mirror 16-sam-integration: hide `process` during the import so the
        // bundle's module-scope env detection takes the browser path even in
        // Electron (process.release.name === 'node' there).
        const hadProcess = typeof globalThis.process !== 'undefined';
        const originalProcess = globalThis.process;
        let transformers;
        try {
            if (hadProcess) { try { globalThis.process = undefined; } catch (e) { /* best effort */ } }
            transformers = await import('./js/vendor/transformers/transformers.min.js');
        } finally {
            if (hadProcess) globalThis.process = originalProcess;
        }
        const { AutoModel, AutoProcessor, RawImage, env } = transformers;

        log('[ok] Transformers.js imported');

        const { configureTransformersEnv } = await import('./js/vendor/transformers/fluid-env.js');
        configureTransformersEnv(env);

        log('[debug] env.allowRemoteModels =', env.allowRemoteModels);
        log('[debug] env.useBrowserCache =', env.useBrowserCache);
        log('[debug] wasmPaths =', env.backends.onnx.wasm.wasmPaths);

        // Same model + backend the app uses (16-sam-integration): CPU only.
        // fp32 because EdgeTAM's fp16/q8 exports produce garbage masks, and
        // wasm because ORT's WebGPU backend corrupts the masks — the vendored
        // binary is now the CPU-only build, so merely REQUESTING webgpu fails
        // ("not built with JSEP support") and poisons the wasm attempt after it.
        const modelId = 'onnx-community/EdgeTAM-ONNX';
        const attempts = [{ device: 'wasm', dtype: 'fp32' }];

        let model = null, used = null;
        for (const attempt of attempts) {
            try {
                log(`[step] Loading ${modelId} on ${attempt.device} (${attempt.dtype})...`);
                model = await AutoModel.from_pretrained(modelId, attempt);
                used = attempt;
                break;
            } catch (e) {
                log(`[warn] ${attempt.device} failed: ${e?.message || e}`);
            }
        }
        if (!model) throw new Error('No backend could load the model');
        log(`[ok] Model loaded on ${used.device} (${used.dtype})`);

        log('[step] Loading processor...');
        const processor = await AutoProcessor.from_pretrained(modelId);
        log('[ok] Processor loaded:', processor.constructor.name);

        const img_url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/corgi.jpg';
        log('[step] Loading test image:', img_url);
        const raw_image = await RawImage.read(img_url);
        log('[ok] Image loaded', raw_image.width + 'x' + raw_image.height);

        // Prepare image inputs (no points yet) + cached embeddings, app-style
        log('[step] Preparing image inputs with processor...');
        const imageInputs = await processor(raw_image);
        log('[ok] Image inputs prepared; reshaped =', imageInputs.reshaped_input_sizes);

        log('[step] Computing image embeddings...');
        const embeddings = await model.get_image_embeddings(imageInputs);
        log('[ok] Embeddings:', Object.keys(embeddings));

        // Point prompt in RESHAPED (1024x1024) space, like the app does:
        // display point (340, 250) on the ~640x480 corgi → scale to 1024.
        const rw = imageInputs.reshaped_input_sizes[0][1];
        const rh = imageInputs.reshaped_input_sizes[0][0];
        const px = 340 / raw_image.width * rw;
        const py = 250 / raw_image.height * rh;
        const { Tensor } = transformers;
        const input_points = new Tensor('float32', new Float32Array([px, py]), [1, 1, 1, 2]);
        const input_labels = new Tensor('int64', [1n], [1, 1, 1]);

        log('[step] Running decoder with cached embeddings...');
        const outputs = await model({ ...embeddings, input_points, input_labels });
        log('[ok] Model run completed');

        log('[step] Post-processing masks...');
        const pp = typeof processor.post_process_masks === 'function' ? processor : processor.image_processor;
        const masks = await pp.post_process_masks(
            outputs.pred_masks,
            imageInputs.original_sizes,
            imageInputs.reshaped_input_sizes,
        );

        log('[result] masks[0][0] dims:', masks[0][0].dims);
        log('[result] iou_scores:', Array.from(outputs.iou_scores.data));
        log('[done] Magic Mask (EdgeTAM) test finished successfully');
    } catch (err) {
        console.error(err);
        log('[error] Magic Mask test failed:', err?.message || err);
        if (err?.stack) log('[stack]', err.stack);
    }
})();
