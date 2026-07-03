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
        log('[info] Importing Transformers.js from CDN...');

        const transformers = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        const { SamModel, AutoProcessor, RawImage, env } = transformers;

        log('[ok] Transformers.js imported');
        log('[debug] env keys:', Object.keys(env));

        // Minimal, documented configuration
        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.useBrowserCache = true;

        log('[debug] env.allowRemoteModels =', env.allowRemoteModels);
        log('[debug] env.allowLocalModels =', env.allowLocalModels);
        log('[debug] env.useBrowserCache =', env.useBrowserCache);

        // Official example from Xenova/slimsam-77-uniform model card
        log('[step] Loading SAM model...');
        const model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform');
        log('[ok] SAM model loaded');

        log('[step] Loading SAM processor...');
        const processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');
        log('[ok] SAM processor loaded');

        const img_url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/corgi.jpg';
        log('[step] Loading test image:', img_url);
        const raw_image = await RawImage.read(img_url);
        log('[ok] Image loaded');

        // First, prepare image inputs (no points yet)
        log('[step] Preparing image inputs with processor...');
        const imageInputs = await processor(raw_image);
        log('[ok] Image inputs prepared');

        // SAM expects input_points to be a 4D tensor:
        // [batch_size, point_batch_size, nb_points_per_image, 2]
        // For a single image, single point batch, single point:
        const input_points = [[[[340, 250]]]]; // [1, 1, 1, 2]
        const input_labels = [[[1]]]; // [1, 1, 1] (positive point)
        log('[debug] input_points structure:', input_points);
        log('[debug] input_labels structure:', input_labels);

        log('[step] Running SAM model...');
        const outputs = await model({
            ...imageInputs,
            input_points,
            input_labels,
        });
        log('[ok] Model run completed');

        log('[step] Post-processing masks...');
        const masks = await processor.post_process_masks(
            outputs.pred_masks,
            imageInputs.original_sizes,
            imageInputs.reshaped_input_sizes,
        );

        log('[result] masks[0][0] dims:', masks[0][0].dims);
        log('[result] iou_scores:', outputs.iou_scores);
        log('[done] SAM test finished successfully');
    } catch (err) {
        console.error(err);
        log('[error] SAM test failed:', err?.message || err);
        if (err?.stack) log('[stack]', err.stack);
    }
})();
