// ComfyUI Bridge — Ctrl+Enter saves canvas frame to a watched folder
// ComfyUI custom node picks it up and runs the workflow automatically
(function () {
    'use strict';

    // Electron-only feature (writes canvas frames to a watched folder). In a
    // plain browser there is no `require`, so no-op instead of throwing — matches
    // the guard pattern in 00-window-controls.js. Consumers in 20-mixer-layout.js
    // already null-check window.comfyuiBridge.
    if (typeof require === 'undefined') return;

    const fs = require('fs');
    const path = require('path');
    const { shell } = require('electron');

    const DEFAULTS = {
        outputFolder: '',       // user must configure
        filenamePrefix: 'fluid_',
        format: 'png'           // png or jpg
    };

    let config = { ...DEFAULTS };
    let sending = false;

    // ── Load/save settings ──────────────────────────────────────────
    function loadSettings() {
        try {
            config.outputFolder = localStorage.getItem('comfyui.outputFolder') || '';
            config.filenamePrefix = localStorage.getItem('comfyui.filenamePrefix') || DEFAULTS.filenamePrefix;
            config.format = localStorage.getItem('comfyui.format') || DEFAULTS.format;
        } catch (e) { /* ignore */ }
    }

    function saveSettings() {
        try {
            localStorage.setItem('comfyui.outputFolder', config.outputFolder);
            localStorage.setItem('comfyui.filenamePrefix', config.filenamePrefix);
            localStorage.setItem('comfyui.format', config.format);
        } catch (e) { /* ignore */ }
    }

    // ── Canvas capture (composites all visible layers + sim) ───────
    function captureCanvas() {
        return new Promise((resolve, reject) => {
            const simCanvas = document.getElementById('canvas');
            if (!simCanvas) return reject(new Error('Canvas not found'));

            const w = simCanvas.width;
            const h = simCanvas.height;

            // Snapshot the WebGL canvas immediately (may clear after this frame)
            const simSnap = document.createElement('canvas');
            simSnap.width = w;
            simSnap.height = h;
            simSnap.getContext('2d').drawImage(simCanvas, 0, 0);

            // Scale factors: canvas internal resolution vs CSS display size
            const displayW = simCanvas.clientWidth || w;
            const displayH = simCanvas.clientHeight || h;
            const sx = w / displayW;
            const sy = h / displayH;

            // Build draw list bottom-to-top (layerOrder[0] = top, so reverse)
            const order = (window.layerOrder || []).slice().reverse();

            // Fallback: if no layer order, just capture the sim
            if (!order.length) {
                order.push({ type: 'sim' });
            }

            const drawList = [];

            for (const item of order) {
                if (item.type === 'sim') {
                    if (simCanvas.style.display !== 'none') {
                        const opacity = parseFloat(simCanvas.style.opacity);
                        drawList.push({ type: 'sim', opacity: isNaN(opacity) ? 1 : opacity });
                    }
                } else {
                    const layer = (window.layers || []).find(l => l.index === item.id);
                    if (!layer || !layer.visible) continue;
                    const layerDiv = document.getElementById('layer' + layer.index);
                    if (!layerDiv || layerDiv.style.display === 'none') continue;

                    const bg = layerDiv.style.backgroundImage;
                    if (!bg || bg === 'none' || bg === '') continue;
                    const m = bg.match(/url\(["']?(.+?)["']?\)/);
                    if (!m) continue;

                    const divOpacity = parseFloat(layerDiv.style.opacity);
                    drawList.push({
                        type: 'layer',
                        src: m[1],
                        x: (layer.x || 0) * sx,
                        y: (layer.y || 0) * sy,
                        scaleX: layer.scaleX || 1,
                        scaleY: layer.scaleY || 1,
                        rotation: layer.rotation || 0,
                        opacity: isNaN(divOpacity) ? 1 : divOpacity
                    });
                }
            }

            // Pre-load all layer images in parallel
            Promise.all(drawList.map(task => {
                if (task.type === 'sim') return Promise.resolve(null);
                return new Promise(res => {
                    const img = new Image();
                    img.onload = () => res(img);
                    img.onerror = () => res(null);
                    img.src = task.src;
                });
            })).then(images => {
                const comp = document.createElement('canvas');
                comp.width = w;
                comp.height = h;
                const ctx = comp.getContext('2d');

                drawList.forEach((task, idx) => {
                    ctx.globalAlpha = task.opacity;
                    if (task.type === 'sim') {
                        ctx.drawImage(simSnap, 0, 0);
                    } else {
                        const img = images[idx];
                        if (!img) return;
                        ctx.save();
                        // Replicate CSS: transform-origin center, then translate/rotate/scale
                        ctx.translate(w / 2 + task.x, h / 2 + task.y);
                        ctx.rotate(task.rotation * Math.PI / 180);
                        ctx.scale(task.scaleX, task.scaleY);
                        ctx.drawImage(img, -w / 2, -h / 2, w, h);
                        ctx.restore();
                    }
                    ctx.globalAlpha = 1;
                });

                const mimeType = config.format === 'jpg' ? 'image/jpeg' : 'image/png';
                const quality = config.format === 'jpg' ? 0.95 : undefined;
                comp.toBlob((blob) => {
                    if (!blob) return reject(new Error('toBlob failed'));
                    const reader = new FileReader();
                    reader.onload = () => resolve(Buffer.from(reader.result));
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                }, mimeType, quality);
            }).catch(reject);
        });
    }

    // ── Save to folder ──────────────────────────────────────────────
    async function sendToComfyUI() {
        if (sending) return;
        if (!config.outputFolder) {
            showToast('⚠️ Set ComfyUI watch folder first (Settings → ComfyUI)', 'warn');
            return;
        }

        // Verify folder exists
        if (!fs.existsSync(config.outputFolder)) {
            try {
                fs.mkdirSync(config.outputFolder, { recursive: true });
            } catch (e) {
                showToast('❌ Cannot create folder: ' + config.outputFolder, 'error');
                return;
            }
        }

        sending = true;
        showToast('📸 Capturing…', 'info');

        try {
            const buffer = await captureCanvas();
            const ext = config.format === 'jpg' ? '.jpg' : '.png';
            const filename = config.filenamePrefix + Date.now() + ext;
            const filepath = path.join(config.outputFolder, filename);

            fs.writeFileSync(filepath, buffer);
            showToast('✅ Sent → ' + filename, 'success');
            console.log('[ComfyUI Bridge] Saved:', filepath);
        } catch (err) {
            console.error('[ComfyUI Bridge] Error:', err);
            showToast('❌ Capture failed: ' + err.message, 'error');
        } finally {
            sending = false;
        }
    }

    // ── Toast notification ──────────────────────────────────────────
    function showToast(message, type) {
        let toast = document.getElementById('comfyui-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'comfyui-toast';
            toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
                'padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:99999;' +
                'color:#e6edf3;pointer-events:none;display:none;' +
                'background:rgba(13,17,23,0.95);border:1px solid rgba(255,255,255,0.1);';
            document.body.appendChild(toast);
        }

        const colors = {
            info: '#58a6ff', success: '#3fb950', warn: '#d29922', error: '#f85149'
        };
        toast.style.borderColor = colors[type] || colors.info;
        toast.textContent = message;
        toast.style.display = 'block';

        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
    }

    // ── Hotkey: Ctrl+Enter ──────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            sendToComfyUI();
        }
    }, true);

    // ── Folder picker helper ────────────────────────────────────────
    function pickOutputFolder() {
        const { dialog } = require('@electron/remote');
        dialog.showOpenDialog({
            title: 'Select ComfyUI Watch Folder',
            properties: ['openDirectory']
        }).then((result) => {
            if (!result.canceled && result.filePaths.length > 0) {
                config.outputFolder = result.filePaths[0];
                saveSettings();
                showToast('📂 Watch folder: ' + config.outputFolder, 'success');
                // Update UI input if it exists
                const input = document.getElementById('comfyuiFolderPath');
                if (input) input.value = config.outputFolder;
            }
        });
    }

    function openOutputFolder() {
        if (config.outputFolder && fs.existsSync(config.outputFolder)) {
            shell.openPath(config.outputFolder);
        }
    }

    // ── Public API ──────────────────────────────────────────────────
    window.comfyuiBridge = {
        send: sendToComfyUI,
        pickFolder: pickOutputFolder,
        openFolder: openOutputFolder,
        getConfig: () => ({ ...config }),
        setConfig: (key, val) => { config[key] = val; saveSettings(); }
    };

    // Init
    loadSettings();
    console.log('[ComfyUI Bridge] Ready — Ctrl+Enter to send frame');
    if (config.outputFolder) {
        console.log('[ComfyUI Bridge] Watch folder:', config.outputFolder);
    }
})();
