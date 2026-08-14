// Fluid-UI glue for the vendored Transformers.js runtime — NOT part of the
// upstream package (upstream files here: transformers.min.js v3.8.1 +
// ort-wasm-simd-threaded.jsep.* — Apache-2.0, see LICENSE in this directory).
// The .jsep build is ONNX Runtime's combined WASM + WebGPU binary; there is no
// separate non-jsep file in the v3 dist. Wires wasm + model-weight loading for
// both builds:
//   web      — wasm served from this directory (same origin); model weights
//              stream from Hugging Face into the browser cache (as before).
//   Electron — fetch() cannot read file:// URLs, so the ORT runtime is handed
//              over as blob: URLs read with fs, and model weights load from
//              the bundled <app>/models directory through a tiny fs-backed
//              custom-cache adapter. Fully offline; no CDN, no downloads.
//              (NOTE: updated for the v3 file layout alongside the 3.8.1
//              runtime bump — needs an Electron smoke test on steam-prep.)

const IS_ELECTRON = !!(typeof process !== 'undefined' && process.versions && process.versions.electron);

function appRootDiskPath() {
    // file:///Z:/app/js/vendor/transformers/fluid-env.js → Z:/app
    const url = new URL('../../../', import.meta.url);
    let p = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // strip lead slash on win drive paths
    return p;
}

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

    // ORT v3 layout: an ES-module loader (.mjs) + one wasm binary (the jsep
    // build). Under file:// the .mjs imports fine as a same-scheme module URL
    // (blob: module imports are NOT reliable from a null-origin file:// page),
    // but fetch() of the .wasm would fail — so hand the raw bytes over via
    // wasmBinary, which short-circuits emscripten's fetch entirely.
    onnxWasm.wasmPaths = {
        mjs: new URL('./ort-wasm-simd-threaded.jsep.mjs', import.meta.url).href,
    };
    if (!onnxWasm.wasmBinary) {
        const buf = fs.readFileSync(path.join(root, 'js', 'vendor', 'transformers', 'ort-wasm-simd-threaded.jsep.wasm'));
        onnxWasm.wasmBinary = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
    // No crossOriginIsolation under file:// — stay single-threaded.
    onnxWasm.numThreads = 1;

    // Model weights ship in <app>/models. Transformers' local-path reads also
    // go through fetch(), so intercept via the custom-cache hook and serve
    // with fs. Remote stays OFF: a missing bundled file must fail loudly
    // (that's a packaging bug), never fall back to a runtime download.
    // External-data pairs (.onnx + .onnx_data, used by EdgeTAM) resolve
    // through the same path mapping.
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
