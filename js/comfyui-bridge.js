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
        format: 'png',          // png or jpg
        captureWidth: 0,        // 0 = use canvas native resolution
        captureHeight: 0        // 0 = use canvas native resolution
    };

    let config = { ...DEFAULTS };
    let sending = false;

    // ── Load/save settings ──────────────────────────────────────────
    function loadSettings() {
        try {
            config.outputFolder = localStorage.getItem('comfyui.outputFolder') || '';
            config.filenamePrefix = localStorage.getItem('comfyui.filenamePrefix') || DEFAULTS.filenamePrefix;
            config.format = localStorage.getItem('comfyui.format') || DEFAULTS.format;
            config.captureWidth = parseInt(localStorage.getItem('comfyui.captureWidth'), 10) || 0;
            config.captureHeight = parseInt(localStorage.getItem('comfyui.captureHeight'), 10) || 0;
        } catch (e) { /* ignore */ }
    }

    function saveSettings() {
        try {
            localStorage.setItem('comfyui.outputFolder', config.outputFolder);
            localStorage.setItem('comfyui.filenamePrefix', config.filenamePrefix);
            localStorage.setItem('comfyui.format', config.format);
            localStorage.setItem('comfyui.captureWidth', String(config.captureWidth || 0));
            localStorage.setItem('comfyui.captureHeight', String(config.captureHeight || 0));
        } catch (e) { /* ignore */ }
    }

    // ── Canvas capture ──────────────────────────────────────────────
    // The export's own composite (24), so the frame matches a still export:
    // ground under it, clip masks, raster layers once, text overlays. A JPG
    // asks for it opaque — JPG has no alpha, and a see-through ground would
    // come out black.
    function captureCanvas() {
        const fx = window.fluidExport;
        if (!fx || typeof fx.captureFrame !== 'function') {
            return Promise.reject(new Error('Export module not loaded'));
        }
        const jpg = config.format === 'jpg';
        return Promise.resolve(fx.captureFrame(null, { opaque: jpg })).then(frame => new Promise((resolve, reject) => {
            // Fixed capture size if set (stretched to it), otherwise native
            // canvas resolution
            const targetW = config.captureWidth > 0 ? config.captureWidth : frame.width;
            const targetH = config.captureHeight > 0 ? config.captureHeight : frame.height;
            let out = frame;
            if (targetW !== frame.width || targetH !== frame.height) {
                out = document.createElement('canvas');
                out.width = targetW;
                out.height = targetH;
                out.getContext('2d').drawImage(frame, 0, 0, targetW, targetH);
            }
            out.toBlob((blob) => {
                if (!blob) return reject(new Error('toBlob failed'));
                const reader = new FileReader();
                reader.onload = () => resolve(Buffer.from(reader.result));
                reader.onerror = reject;
                reader.readAsArrayBuffer(blob);
            }, jpg ? 'image/jpeg' : 'image/png', jpg ? 0.95 : undefined);
        }));
    }

    // ── Save to folder ──────────────────────────────────────────────
    async function saveFrameToFolder() {
        if (sending) return;
        if (!config.outputFolder) {
            showToast('⚠️ Set a save folder first (Export → Set Save To Folder)', 'warn');
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
        showToast('Capturing…', 'info');

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
            if (window.DialogFocus && window.DialogFocus.hasKeyboard()) return;   // a dialog has the keyboard (00b)
            e.preventDefault();
            e.stopPropagation();
            saveFrameToFolder();
        }
    }, true);

    // ── Folder picker helper ────────────────────────────────────────
    function pickOutputFolder() {
        const { dialog } = require('@electron/remote');
        dialog.showOpenDialog({
            title: 'Select Save Folder',
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
        send: saveFrameToFolder,
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
