/**
 * Branding & Engagement Overlays
 * 
 * Text overlays (@handle, CTAs), image/logo overlays, and QR code overlays
 * positioned over the canvas with pointer-events:none so they don't block painting.
 * Overlays are composited into captures via the existing capture system.
 */
(function () {
    'use strict';

    var overlays = [];
    var nextId = 1;
    var container = null;

    // ─── POSITIONS ──────────────────────────────────────────────
    var POSITIONS = {
        TL: { top: '12px', left: '12px', bottom: '', right: '', transform: '' },
        TC: { top: '12px', left: '50%', bottom: '', right: '', transform: 'translateX(-50%)' },
        TR: { top: '12px', left: '', bottom: '', right: '12px', transform: '' },
        ML: { top: '50%', left: '12px', bottom: '', right: '', transform: 'translateY(-50%)' },
        MC: { top: '50%', left: '50%', bottom: '', right: '', transform: 'translate(-50%,-50%)' },
        MR: { top: '50%', left: '', bottom: '', right: '12px', transform: 'translateY(-50%)' },
        BL: { top: '', left: '12px', bottom: '12px', right: '', transform: '' },
        BC: { top: '', left: '50%', bottom: '12px', right: '', transform: 'translateX(-50%)' },
        BR: { top: '', left: '', bottom: '12px', right: '12px', transform: '' }
    };

    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () { requestAnimationFrame(init); });
    });

    function init() {
        // Create overlay container over the canvas
        container = document.createElement('div');
        container.id = 'branding-overlay-container';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:hidden;';
        var canvasArea = document.getElementById('canvas-area');
        if (canvasArea) {
            canvasArea.style.position = 'relative';
            canvasArea.appendChild(container);
        }
        loadSaved();
    }

    // ─── TEXT OVERLAY ────────────────────────────────────────────
    function addTextOverlay(opts) {
        opts = opts || {};
        var overlay = {
            id: nextId++,
            type: 'text',
            content: opts.content || '@handle',
            position: opts.position || 'BL',
            fontSize: opts.fontSize || 20,
            color: opts.color || '#ffffff',
            opacity: opts.opacity !== undefined ? opts.opacity : 0.85,
            fontFamily: opts.fontFamily || 'sans-serif',
            fontWeight: opts.fontWeight || '700',
            textShadow: opts.textShadow !== false,
            visible: true
        };
        overlays.push(overlay);
        renderOverlay(overlay);
        save();
        return overlay;
    }

    // ─── IMAGE OVERLAY ──────────────────────────────────────────
    function addImageOverlay(opts) {
        opts = opts || {};
        var overlay = {
            id: nextId++,
            type: 'image',
            src: opts.src || '',
            position: opts.position || 'BR',
            width: opts.width || 80,
            opacity: opts.opacity !== undefined ? opts.opacity : 0.85,
            visible: true
        };
        overlays.push(overlay);
        renderOverlay(overlay);
        save();
        return overlay;
    }

    // ─── QR OVERLAY ─────────────────────────────────────────────
    function addQROverlay(opts) {
        opts = opts || {};
        var overlay = {
            id: nextId++,
            type: 'qr',
            url: opts.url || 'https://tiktok.com',
            position: opts.position || 'BR',
            size: opts.size || 100,
            opacity: opts.opacity !== undefined ? opts.opacity : 0.75,
            visible: true
        };
        overlays.push(overlay);
        renderOverlay(overlay);
        save();
        return overlay;
    }

    // ─── RENDER ─────────────────────────────────────────────────
    function renderOverlay(ov) {
        if (!container) return;

        // Remove existing DOM element if re-rendering
        var existing = container.querySelector('[data-overlay-id="' + ov.id + '"]');
        if (existing) existing.remove();

        if (!ov.visible) return;

        var el = document.createElement('div');
        el.dataset.overlayId = ov.id;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';

        var pos = POSITIONS[ov.position] || POSITIONS.BL;
        el.style.top = pos.top;
        el.style.left = pos.left;
        el.style.bottom = pos.bottom;
        el.style.right = pos.right;
        el.style.transform = pos.transform;
        el.style.opacity = ov.opacity;
        el.style.zIndex = '51';

        if (ov.type === 'text') {
            el.style.color = ov.color;
            el.style.fontSize = ov.fontSize + 'px';
            el.style.fontFamily = ov.fontFamily;
            el.style.fontWeight = ov.fontWeight;
            el.style.lineHeight = '1.2';
            el.style.whiteSpace = 'nowrap';
            if (ov.textShadow) {
                el.style.textShadow = '0 1px 4px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.4)';
            }
            el.textContent = ov.content;
        } else if (ov.type === 'image') {
            var img = document.createElement('img');
            img.src = ov.src;
            img.style.width = ov.width + 'px';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.filter = 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))';
            el.appendChild(img);
        } else if (ov.type === 'qr') {
            // Generate QR code as an SVG using a simple inline generator
            var qrSvg = generateQRSvg(ov.url, ov.size);
            el.innerHTML = qrSvg;
            el.style.background = 'white';
            el.style.borderRadius = '6px';
            el.style.padding = '4px';
            el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        }

        container.appendChild(el);
    }

    function renderAll() {
        if (!container) return;
        container.innerHTML = '';
        for (var i = 0; i < overlays.length; i++) {
            renderOverlay(overlays[i]);
        }
    }

    // ─── QR CODE GENERATOR (minimal) ────────────────────────────
    // Simple QR-like visual using a text-based approach
    // For a real QR, a library like qrcode-generator would be needed
    // This creates a placeholder "scan me" box with the URL
    function generateQRSvg(url, size) {
        // Create a simple visual QR placeholder
        // In production, integrate a real QR library
        var s = size || 100;
        return '<div style="width:' + s + 'px;height:' + s + 'px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:white;color:black;font-size:9px;text-align:center;font-family:monospace;line-height:1.3;overflow:hidden;">' +
            '<div style="font-size:14px;font-weight:bold;margin-bottom:4px;">📱 SCAN</div>' +
            '<div style="word-break:break-all;padding:0 4px;font-size:8px;opacity:0.7;">' + url + '</div>' +
            '</div>';
    }

    // ─── OVERLAY MANAGEMENT ─────────────────────────────────────
    function removeOverlay(id) {
        overlays = overlays.filter(function (o) { return o.id !== id; });
        if (container) {
            var el = container.querySelector('[data-overlay-id="' + id + '"]');
            if (el) el.remove();
        }
        save();
        if (typeof window._brandingOverlayListChanged === 'function') {
            window._brandingOverlayListChanged();
        }
    }

    function updateOverlay(id, props) {
        for (var i = 0; i < overlays.length; i++) {
            if (overlays[i].id === id) {
                for (var key in props) {
                    if (props.hasOwnProperty(key)) {
                        overlays[i][key] = props[key];
                    }
                }
                renderOverlay(overlays[i]);
                save();
                return overlays[i];
            }
        }
        return null;
    }

    function toggleOverlay(id) {
        for (var i = 0; i < overlays.length; i++) {
            if (overlays[i].id === id) {
                overlays[i].visible = !overlays[i].visible;
                renderOverlay(overlays[i]);
                save();
                return overlays[i];
            }
        }
        return null;
    }

    function clearAll() {
        overlays = [];
        if (container) container.innerHTML = '';
        save();
    }

    // ─── PERSISTENCE ────────────────────────────────────────────
    function save() {
        try {
            if (window.settingsManager) {
                // Save only serializable data (exclude image src for size)
                var data = overlays.map(function (o) {
                    var copy = {};
                    for (var k in o) {
                        if (o.hasOwnProperty(k)) {
                            // Skip large image data for localStorage size
                            if (k === 'src' && o.type === 'image') continue;
                            copy[k] = o[k];
                        }
                    }
                    return copy;
                });
                window.settingsManager.set('branding.overlays', data);
            }
        } catch (_) {}
    }

    function loadSaved() {
        try {
            if (window.settingsManager) {
                var data = window.settingsManager.get('branding.overlays');
                if (Array.isArray(data)) {
                    for (var i = 0; i < data.length; i++) {
                        var o = data[i];
                        o.id = nextId++;
                        overlays.push(o);
                        renderOverlay(o);
                    }
                }
            }
        } catch (_) {}
    }

    // ─── COMPOSITE INTO CANVAS (for capture) ────────────────────
    function compositeOntoCanvas(ctx, canvasRect) {
        if (!container) return;
        for (var i = 0; i < overlays.length; i++) {
            var ov = overlays[i];
            if (!ov.visible) continue;

            ctx.save();
            ctx.globalAlpha = ov.opacity;

            if (ov.type === 'text') {
                var pos = resolvePosition(ov.position, canvasRect, ctx, ov);
                ctx.font = ov.fontWeight + ' ' + ov.fontSize + 'px ' + ov.fontFamily;
                ctx.fillStyle = ov.color;
                if (ov.textShadow) {
                    ctx.shadowColor = 'rgba(0,0,0,0.7)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 1;
                }
                ctx.fillText(ov.content, pos.x, pos.y);
            }

            ctx.restore();
        }
    }

    function resolvePosition(posKey, rect, ctx, ov) {
        var m = 12;
        var x = m, y = m + (ov.fontSize || 20);
        var w = rect.width || 800;
        var h = rect.height || 600;

        if (posKey.charAt(1) === 'C' || posKey === 'MC' || posKey === 'TC' || posKey === 'BC') {
            var textW = ctx.measureText(ov.content).width;
            x = (w - textW) / 2;
        }
        if (posKey.charAt(1) === 'R' || posKey === 'TR' || posKey === 'MR' || posKey === 'BR') {
            var textW2 = ctx.measureText(ov.content).width;
            x = w - textW2 - m;
        }
        if (posKey.charAt(0) === 'M') y = h / 2 + (ov.fontSize || 20) / 2;
        if (posKey.charAt(0) === 'B') y = h - m;

        return { x: x, y: y };
    }

    // ─── PUBLIC API ─────────────────────────────────────────────
    window.brandingOverlays = {
        addText: addTextOverlay,
        addImage: addImageOverlay,
        addQR: addQROverlay,
        remove: removeOverlay,
        update: updateOverlay,
        toggle: toggleOverlay,
        clearAll: clearAll,
        getAll: function () { return overlays.slice(); },
        renderAll: renderAll,
        compositeOntoCanvas: compositeOntoCanvas,
        POSITIONS: Object.keys(POSITIONS)
    };
})();
