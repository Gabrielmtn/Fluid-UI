// Fluid-UI glue for the vendored Transformers.js runtime — NOT part of the
// upstream package (upstream files here: transformers.min.js + ort-*.wasm,
// Apache-2.0, see LICENSE in this directory). Wires wasm + model-weight
// loading for both builds:
//   web      — wasm served from this directory (same origin); model weights
//              stream from Hugging Face into the browser cache (as before).
//   Electron — fetch() cannot read file:// URLs, so the ORT wasm is handed
//              over as blob: URLs read with fs, and model weights load from
//              the bundled <app>/models directory through a tiny fs-backed
//              custom-cache adapter. Fully offline; no CDN, no downloads.

const IS_ELECTRON = !!(typeof process !== 'undefined' && process.versions && process.versions.electron);

function appRootDiskPath() {
    // file:///Z:/app/js/vendor/transformers/fluid-env.js → Z:/app
    const url = new URL('../../../', import.meta.url);
    let p = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // strip lead slash on win drive paths
    return p;
}

let _wasmBlobMap = null;

export function configureTransformersEnv(env) {
    const onnxWasm = env.backends.onnx.wasm;

    if (!IS_ELECTRON) {
        onnxWasm.wasmPaths = new URL('./', import.meta.url).href;
        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        return env;
    }

    const fs = require('fs');
    const path = require('path');
    const root = appRootDiskPath();

    // Threaded wasm variants are never selected (no crossOriginIsolated under
    // file://), so only the two single-thread files are bundled and mapped.
    if (!_wasmBlobMap) {
        _wasmBlobMap = {};
        for (const f of ['ort-wasm.wasm', 'ort-wasm-simd.wasm']) {
            const buf = fs.readFileSync(path.join(root, 'js', 'vendor', 'transformers', f));
            _wasmBlobMap[f] = URL.createObjectURL(new Blob([buf], { type: 'application/wasm' }));
        }
    }
    onnxWasm.wasmPaths = _wasmBlobMap;
    onnxWasm.numThreads = 1;

    // Model weights ship in <app>/models. Transformers' local-path reads also
    // go through fetch(), so intercept via the custom-cache hook and serve
    // with fs. Remote stays OFF: a missing bundled file must fail loudly
    // (that's a packaging bug), never fall back to a runtime download.
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = 'models';
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = {
        match: async function (key) {
            try {
                let rel = String(key).replace(/\\/g, '/');
                const m = rel.match(/^https?:\/\/huggingface\.co\/(.+?)\/resolve\/[^/]+\/(.+)$/);
                if (m) rel = 'models/' + m[1] + '/' + m[2];
                if (rel.indexOf('models/') !== 0) return undefined;
                const file = path.join(root, rel);
                if (!fs.existsSync(file)) return undefined;
                return new Response(fs.readFileSync(file));
            } catch (e) { return undefined; }
        },
        put: async function () { /* the bundled files ARE the cache */ }
    };
    return env;
}
