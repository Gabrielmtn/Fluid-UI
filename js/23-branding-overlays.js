/**
 * Branding & Engagement Overlays
 *
 * Text overlays (@handle, CTAs), image/logo overlays, and QR code overlays
 * positioned FREELY over the canvas (normalized centre x/y + rotation) so they
 * can be dragged anywhere, not just snapped to 9 preset anchors.
 *
 * Overlays are pointer-events:none in normal use so they never block painting.
 * "Arrange mode" drops a transform canvas over the canvas-area that swallows
 * pointer events (so painting is paused) and lets you click-to-select then
 * drag to move, corner-drag to resize, and use the top handle to rotate — the
 * same interaction model as the layer transform editor (js/26-layer-transform.js).
 *
 * Overlays are composited into captures via compositeOntoCanvas().
 *
 * window.brandingOverlays = {
 *   addText, addImage, addQR, remove, update, toggle, clearAll, getAll,
 *   renderAll, compositeOntoCanvas, POSITIONS,           // legacy-compatible
 *   openArrange, closeArrange, isArranging, select, getSelectedId, onChange
 * }
 */
(function () {
    'use strict';

    var overlays = [];
    var nextId = 1;
    var container = null;       // pointer-events:none DOM layer holding overlay elements
    var changeListeners = [];   // panel subscribes to redraw its list / button state

    // ─── PRESET ANCHORS (legacy + quick-snap) ───────────────────
    // Kept so old saved overlays migrate and the panel can offer quick snapping.
    // Values are the normalized CENTRE (x,y) of the overlay within the canvas-area.
    var PRESET_XY = {
        TL: { x: 0.10, y: 0.10 }, TC: { x: 0.50, y: 0.10 }, TR: { x: 0.90, y: 0.10 },
        ML: { x: 0.10, y: 0.50 }, MC: { x: 0.50, y: 0.50 }, MR: { x: 0.90, y: 0.50 },
        BL: { x: 0.10, y: 0.90 }, BC: { x: 0.50, y: 0.90 }, BR: { x: 0.90, y: 0.90 }
    };

    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () { requestAnimationFrame(init); });
    });

    function init() {
        container = document.createElement('div');
        container.id = 'branding-overlay-container';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:hidden;';
        var canvasArea = document.getElementById('canvas-area');
        if (canvasArea) {
            canvasArea.style.position = 'relative';
            canvasArea.appendChild(container);
        }
        loadSaved();
        // Keep overlays anchored proportionally when the canvas-area resizes —
        // x/y are normalized so the CSS handles it, but arrange chrome needs a redraw.
        window.addEventListener('resize', function () { if (arranging) { sizeArrangeCanvas(); drawArrange(); } });
    }

    // ─── DEFAULT SPAWN POSITIONS (centre, normalized) ───────────
    var SPAWN = {
        text: { x: 0.14, y: 0.90 },
        image: { x: 0.85, y: 0.85 },
        qr: { x: 0.86, y: 0.84 }
    };

    function coerceXY(opts, type) {
        // Accept either a free {x,y} or a legacy preset position string.
        if (typeof opts.x === 'number' && typeof opts.y === 'number') {
            return { x: clamp01(opts.x), y: clamp01(opts.y) };
        }
        if (opts.position && PRESET_XY[opts.position]) {
            return { x: PRESET_XY[opts.position].x, y: PRESET_XY[opts.position].y };
        }
        return { x: SPAWN[type].x, y: SPAWN[type].y };
    }

    // ─── TEXT OVERLAY ────────────────────────────────────────────
    function addTextOverlay(opts) {
        opts = opts || {};
        var xy = coerceXY(opts, 'text');
        var overlay = {
            id: nextId++,
            type: 'text',
            content: opts.content || '@handle',
            x: xy.x, y: xy.y, rotation: opts.rotation || 0,
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
        save(); emitChange();
        return overlay;
    }

    // ─── IMAGE OVERLAY ──────────────────────────────────────────
    function addImageOverlay(opts) {
        opts = opts || {};
        var xy = coerceXY(opts, 'image');
        var overlay = {
            id: nextId++,
            type: 'image',
            src: opts.src || '',
            x: xy.x, y: xy.y, rotation: opts.rotation || 0,
            width: opts.width || 80,
            opacity: opts.opacity !== undefined ? opts.opacity : 0.85,
            visible: true
        };
        overlays.push(overlay);
        renderOverlay(overlay);
        save(); emitChange();
        return overlay;
    }

    // ─── QR OVERLAY ─────────────────────────────────────────────
    function addQROverlay(opts) {
        opts = opts || {};
        var xy = coerceXY(opts, 'qr');
        var overlay = {
            id: nextId++,
            type: 'qr',
            url: opts.url || 'https://example.com',
            x: xy.x, y: xy.y, rotation: opts.rotation || 0,
            size: opts.size || 100,
            opacity: opts.opacity !== undefined ? opts.opacity : 0.75,
            visible: true
        };
        overlays.push(overlay);
        renderOverlay(overlay);
        save(); emitChange();
        return overlay;
    }

    // ─── RENDER (DOM) ───────────────────────────────────────────
    function renderOverlay(ov) {
        if (!container) return;

        var existing = container.querySelector('[data-overlay-id="' + ov.id + '"]');
        if (existing) existing.remove();

        if (!ov.visible) return;

        var el = document.createElement('div');
        el.dataset.overlayId = ov.id;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.left = (ov.x * 100) + '%';
        el.style.top = (ov.y * 100) + '%';
        el.style.transformOrigin = 'center center';
        el.style.transform = 'translate(-50%,-50%) rotate(' + (ov.rotation || 0) + 'deg)';
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
            img.draggable = false;
            img.style.filter = 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))';
            el.appendChild(img);
        } else if (ov.type === 'qr') {
            el.innerHTML = generateQRSvg(ov.url, ov.size);
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
        for (var i = 0; i < overlays.length; i++) renderOverlay(overlays[i]);
    }

    function getEl(id) {
        return container ? container.querySelector('[data-overlay-id="' + id + '"]') : null;
    }

    // ─── QR CODE ────────────────────────────────────────────────
    // Was a placeholder that drew a white box reading "SCAN" with the URL
    // printed under it — legible to a person, invisible to a camera. Now a
    // real symbol via js/39-qrcode.js. The fallback below only shows if that
    // module failed to load, or if the URL is longer than version 6-M holds.
    function generateQRSvg(url, size) {
        var s = size || 100;
        if (window.QRCode && url) {
            var svg = window.QRCode.svg(url, { size: s, margin: 3 });
            if (svg) return svg;
        }
        return '<div style="width:' + s + 'px;height:' + s + 'px;display:flex;align-items:center;' +
            'justify-content:center;background:white;color:#b00;font-size:9px;text-align:center;' +
            'font-family:monospace;padding:4px;box-sizing:border-box;">Link too long for a QR code</div>';
    }

    // ─── OVERLAY MANAGEMENT ─────────────────────────────────────
    function findOverlay(id) {
        for (var i = 0; i < overlays.length; i++) if (overlays[i].id === id) return overlays[i];
        return null;
    }

    function removeOverlay(id) {
        overlays = overlays.filter(function (o) { return o.id !== id; });
        var el = getEl(id);
        if (el) el.remove();
        if (selectedId === id) selectedId = null;
        save(); emitChange();
        if (arranging) drawArrange();
    }

    function updateOverlay(id, props) {
        var ov = findOverlay(id);
        if (!ov) return null;
        for (var key in props) if (props.hasOwnProperty(key)) ov[key] = props[key];
        renderOverlay(ov);
        save(); emitChange();
        if (arranging) drawArrange();
        return ov;
    }

    function toggleOverlay(id) {
        var ov = findOverlay(id);
        if (!ov) return null;
        ov.visible = !ov.visible;
        renderOverlay(ov);
        if (!ov.visible && selectedId === id) selectedId = null;
        save(); emitChange();
        if (arranging) drawArrange();
        return ov;
    }

    function clearAll() {
        overlays = [];
        selectedId = null;
        if (container) container.innerHTML = '';
        save(); emitChange();
        if (arranging) drawArrange();
    }

    // ─── CHANGE NOTIFICATION ────────────────────────────────────
    function onChange(fn) { if (typeof fn === 'function') changeListeners.push(fn); }
    function emitChange() {
        for (var i = 0; i < changeListeners.length; i++) {
            try { changeListeners[i](); } catch (_) {}
        }
        // Legacy hook used by the old panel.
        if (typeof window._brandingOverlayListChanged === 'function') {
            try { window._brandingOverlayListChanged(); } catch (_) {}
        }
    }

    // ─── PERSISTENCE ────────────────────────────────────────────
    function save() {
        try {
            if (!window.settingsManager) return;
            var data = overlays.map(function (o) {
                var copy = {};
                for (var k in o) {
                    if (!o.hasOwnProperty(k)) continue;
                    if (k === 'src' && o.type === 'image') continue; // too big for localStorage
                    copy[k] = o[k];
                }
                return copy;
            });
            window.settingsManager.set('branding.overlays', data);
        } catch (_) {}
    }

    function loadSaved() {
        try {
            if (!window.settingsManager) return;
            var data = window.settingsManager.get('branding.overlays');
            if (!Array.isArray(data)) return;
            for (var i = 0; i < data.length; i++) {
                var o = data[i];
                o.id = nextId++;
                // Migrate legacy preset-positioned overlays to free x/y.
                if (typeof o.x !== 'number' || typeof o.y !== 'number') {
                    var p = PRESET_XY[o.position] || PRESET_XY.BL;
                    o.x = p.x; o.y = p.y;
                }
                if (typeof o.rotation !== 'number') o.rotation = 0;
                overlays.push(o);
                renderOverlay(o);
            }
        } catch (_) {}
    }

    // ═══════════════════════════════════════════════════════════
    //  ARRANGE MODE — select / drag / resize / rotate on canvas
    // ═══════════════════════════════════════════════════════════
    var arranging = false;
    var selectedId = null;
    var aCanvas = null, aCtx = null, aBar = null;
    var drag = null;            // { mode, startX, startY, ov snapshot, ... }
    var HANDLE_HIT = 14;        // px hit radius for corner / rotate handles
    var ROTATE_OFFSET = 30;     // px above the top edge
    var CHROME = 'rgba(255, 130, 170, 0.95)';   // pink — matches Branding accent

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    // Geometry of an overlay in arrange-canvas pixel coords.
    function overlayGeom(ov) {
        var el = getEl(ov.id);
        if (!el || !aCanvas) return null;
        var W = aCanvas.width, H = aCanvas.height;
        // offsetWidth/Height are the UNROTATED layout box (transform doesn't affect them).
        return {
            cx: ov.x * W,
            cy: ov.y * H,
            hw: el.offsetWidth / 2,
            hh: el.offsetHeight / 2,
            rot: (ov.rotation || 0) * Math.PI / 180
        };
    }

    // Pointer → overlay-local (de-rotated, centre-origin) coords.
    function toLocal(g, px, py) {
        var dx = px - g.cx, dy = py - g.cy;
        var c = Math.cos(-g.rot), s = Math.sin(-g.rot);
        return { x: dx * c - dy * s, y: dx * s + dy * c };
    }

    function corners(g) {
        return [
            { id: 'nw', lx: -g.hw, ly: -g.hh, cursor: 'nwse-resize' },
            { id: 'ne', lx: g.hw, ly: -g.hh, cursor: 'nesw-resize' },
            { id: 'sw', lx: -g.hw, ly: g.hh, cursor: 'nesw-resize' },
            { id: 'se', lx: g.hw, ly: g.hh, cursor: 'nwse-resize' }
        ];
    }

    // Hit-test the SELECTED overlay's handles first, then any overlay's body
    // (top-most = last drawn = last in array).
    function hitTest(px, py) {
        var sel = selectedId != null ? findOverlay(selectedId) : null;
        if (sel && sel.visible) {
            var g = overlayGeom(sel);
            if (g) {
                var l = toLocal(g, px, py);
                for (var c = 0; c < corners(g).length; c++) {
                    var cor = corners(g)[c];
                    if (Math.abs(l.x - cor.lx) <= HANDLE_HIT && Math.abs(l.y - cor.ly) <= HANDLE_HIT) {
                        return { id: sel.id, mode: 'scale', corner: cor };
                    }
                }
                if (Math.abs(l.x) <= HANDLE_HIT && Math.abs(l.y - (-g.hh - ROTATE_OFFSET)) <= HANDLE_HIT) {
                    return { id: sel.id, mode: 'rotate' };
                }
            }
        }
        // Body hit — search top-most first.
        for (var i = overlays.length - 1; i >= 0; i--) {
            var ov = overlays[i];
            if (!ov.visible) continue;
            var gg = overlayGeom(ov);
            if (!gg) continue;
            var ll = toLocal(gg, px, py);
            if (Math.abs(ll.x) <= gg.hw + 4 && Math.abs(ll.y) <= gg.hh + 4) {
                return { id: ov.id, mode: 'move' };
            }
        }
        return null;
    }

    function drawArrange() {
        if (!aCtx || !aCanvas) return;
        aCtx.clearRect(0, 0, aCanvas.width, aCanvas.height);
        var sel = selectedId != null ? findOverlay(selectedId) : null;
        if (!sel || !sel.visible) return;
        var g = overlayGeom(sel);
        if (!g) return;

        aCtx.save();
        aCtx.translate(g.cx, g.cy);
        aCtx.rotate(g.rot);

        // Bounding box
        aCtx.strokeStyle = CHROME;
        aCtx.lineWidth = 1.5;
        aCtx.setLineDash([6, 4]);
        aCtx.strokeRect(-g.hw, -g.hh, g.hw * 2, g.hh * 2);
        aCtx.setLineDash([]);

        // Corner handles
        corners(g).forEach(function (c) {
            aCtx.fillStyle = CHROME;
            aCtx.strokeStyle = 'rgba(255,255,255,0.9)';
            aCtx.lineWidth = 1.5;
            aCtx.beginPath();
            aCtx.rect(c.lx - 5, c.ly - 5, 10, 10);
            aCtx.fill();
            aCtx.stroke();
        });

        // Rotate handle (stem + knob above top-centre)
        aCtx.strokeStyle = CHROME;
        aCtx.lineWidth = 1.5;
        aCtx.beginPath();
        aCtx.moveTo(0, -g.hh);
        aCtx.lineTo(0, -g.hh - ROTATE_OFFSET + 7);
        aCtx.stroke();
        aCtx.fillStyle = 'rgba(20,10,16,0.85)';
        aCtx.beginPath();
        aCtx.arc(0, -g.hh - ROTATE_OFFSET, 7, 0, Math.PI * 2);
        aCtx.fill();
        aCtx.stroke();

        aCtx.restore();
    }

    function onDown(e) {
        var r = aCanvas.getBoundingClientRect();
        var px = e.clientX - r.left, py = e.clientY - r.top;
        var hit = hitTest(px, py);
        e.preventDefault();
        if (!hit) { // empty space → deselect
            if (selectedId != null) { selectedId = null; emitChange(); drawArrange(); }
            return;
        }
        if (hit.id !== selectedId) { selectedId = hit.id; emitChange(); }
        var ov = findOverlay(hit.id);
        if (!ov) return;
        var g = overlayGeom(ov);
        drag = {
            id: hit.id,
            mode: hit.mode,
            corner: hit.corner || null,
            startX: px, startY: py,
            start: {
                x: ov.x, y: ov.y, rotation: ov.rotation || 0,
                fontSize: ov.fontSize, width: ov.width, size: ov.size
            },
            startDist: Math.hypot(px - g.cx, py - g.cy),
            startAngle: Math.atan2(py - g.cy, px - g.cx)
        };
        try { aCanvas.setPointerCapture(e.pointerId); } catch (_) {}
        drawArrange();
    }

    function onMove(e) {
        var r = aCanvas.getBoundingClientRect();
        var px = e.clientX - r.left, py = e.clientY - r.top;

        if (!drag) {
            var hit = hitTest(px, py);
            aCanvas.style.cursor = !hit ? 'default'
                : hit.mode === 'move' ? 'move'
                : hit.mode === 'rotate' ? 'grab'
                : hit.corner.cursor;
            return;
        }
        e.preventDefault();
        var ov = findOverlay(drag.id);
        if (!ov) return;

        if (drag.mode === 'move') {
            var W = aCanvas.width, H = aCanvas.height;
            ov.x = clamp01(drag.start.x + (px - drag.startX) / W);
            ov.y = clamp01(drag.start.y + (py - drag.startY) / H);
        } else if (drag.mode === 'rotate') {
            var g = overlayGeom(ov);
            var ang = Math.atan2(py - g.cy, px - g.cx);
            var deg = drag.start.rotation + (ang - drag.startAngle) * 180 / Math.PI;
            var snapped = Math.round(deg / 90) * 90;
            if (Math.abs(deg - snapped) < 4) deg = snapped;
            ov.rotation = deg;
        } else { // scale — uniform, about centre
            var gc = overlayGeom(ov);
            var dist = Math.hypot(px - gc.cx, py - gc.cy);
            var factor = drag.startDist > 2 ? dist / drag.startDist : 1;
            if (ov.type === 'text') {
                ov.fontSize = Math.max(6, Math.min(400, Math.round(drag.start.fontSize * factor)));
            } else if (ov.type === 'image') {
                ov.width = Math.max(12, Math.min(2000, Math.round(drag.start.width * factor)));
            } else if (ov.type === 'qr') {
                ov.size = Math.max(40, Math.min(1000, Math.round(drag.start.size * factor)));
            }
        }
        renderOverlay(ov);
        drawArrange();
    }

    function onUp(e) {
        if (!drag) return;
        drag = null;
        try { aCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        save(); emitChange();
    }

    function sizeArrangeCanvas() {
        if (!aCanvas) return;
        var area = document.getElementById('canvas-area');
        var rect = area ? area.getBoundingClientRect() : { width: aCanvas.clientWidth, height: aCanvas.clientHeight };
        aCanvas.width = Math.round(rect.width);
        aCanvas.height = Math.round(rect.height);
    }

    function openArrange(focusId) {
        if (arranging) {
            if (focusId != null) { selectedId = focusId; emitChange(); drawArrange(); }
            return;
        }
        var area = document.getElementById('canvas-area');
        if (!area) return;
        arranging = true;
        selectedId = (focusId != null) ? focusId : selectedId;
        document.body.classList.add('branding-arrange-active');

        aCanvas = document.createElement('canvas');
        aCanvas.id = 'branding-arrange-canvas';
        // High z-index: #canvas-wrapper has no stacking context, so canvas resize
        // handles (z~201) and layer handles (z~10003) compete in this same context
        // and would otherwise sit above the arrange surface and steal clicks. We sit
        // above them (and body.branding-arrange-active also disables their pointer
        // events) so this is the sole interactive surface over the canvas-area.
        aCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10010;cursor:default;touch-action:none;';
        area.appendChild(aCanvas);
        sizeArrangeCanvas();
        aCtx = aCanvas.getContext('2d');

        aCanvas.addEventListener('pointerdown', onDown);
        aCanvas.addEventListener('pointermove', onMove);
        aCanvas.addEventListener('pointerup', onUp);
        aCanvas.addEventListener('pointercancel', onUp);

        // Floating toolbar (works even when arrange is triggered from the panel).
        aBar = document.createElement('div');
        aBar.id = 'branding-arrange-bar';
        aBar.innerHTML =
            '<span class="ba-title">✋ Arrange overlays</span>' +
            '<span class="ba-hint">click to select · drag to move · corners resize · ↻ rotate · painting paused</span>' +
            '<button id="brandingArrangeDone" type="button">Done</button>';
        document.body.appendChild(aBar);
        document.getElementById('brandingArrangeDone').onclick = function (ev) { ev.preventDefault(); closeArrange(); };

        onKeyArrange = function (e) {
            if (e.key === 'Escape') { closeArrange(); }
            else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId != null) {
                e.preventDefault(); removeOverlay(selectedId);
            }
        };
        document.addEventListener('keydown', onKeyArrange);

        drawArrange();
        emitChange();
    }

    var onKeyArrange = null;

    function closeArrange() {
        if (!arranging) return;
        arranging = false;
        drag = null;
        if (onKeyArrange) { document.removeEventListener('keydown', onKeyArrange); onKeyArrange = null; }
        if (aCanvas) { aCanvas.remove(); aCanvas = null; aCtx = null; }
        if (aBar) { aBar.remove(); aBar = null; }
        document.body.classList.remove('branding-arrange-active');
        emitChange();
    }

    function select(id) {
        selectedId = id;
        emitChange();
        if (arranging) drawArrange();
    }

    // ─── COMPOSITE INTO CANVAS (for capture) ────────────────────
    // Honours free x/y/rotation for text + image. QR is drawn as a white box.
    // COORDINATE SPACE: overlay x/y are fractions of #canvas-area (the DOM
    // container), NOT of the canvas wrapper. Callers exporting the wrapper
    // must pass the area→target mapping (areaWidth/areaHeight/offsetX/offsetY,
    // all in target px) or overlays land in the wrong place. Without those
    // fields the legacy behavior (fractions of the target itself) is kept.
    function compositeOntoCanvas(ctx, canvasRect) {
        if (!ctx) return;
        var W = (canvasRect && canvasRect.width) || ctx.canvas.width || 800;
        var H = (canvasRect && canvasRect.height) || ctx.canvas.height || 600;
        var areaW = (canvasRect && canvasRect.areaWidth) || W;
        var areaH = (canvasRect && canvasRect.areaHeight) || H;
        var offX = (canvasRect && canvasRect.offsetX) || 0;
        var offY = (canvasRect && canvasRect.offsetY) || 0;

        for (var i = 0; i < overlays.length; i++) {
            var ov = overlays[i];
            if (!ov.visible) continue;
            var cx = ov.x * areaW - offX, cy = ov.y * areaH - offY;

            ctx.save();
            ctx.globalAlpha = ov.opacity;
            ctx.translate(cx, cy);
            ctx.rotate((ov.rotation || 0) * Math.PI / 180);

            if (ov.type === 'text') {
                ctx.font = ov.fontWeight + ' ' + ov.fontSize + 'px ' + ov.fontFamily;
                ctx.fillStyle = ov.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (ov.textShadow) {
                    ctx.shadowColor = 'rgba(0,0,0,0.7)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 1;
                }
                ctx.fillText(ov.content, 0, 0);
            } else if (ov.type === 'image') {
                var el = getEl(ov.id);
                var img = el ? el.querySelector('img') : null;
                if (img && img.complete && img.naturalWidth) {
                    var w = ov.width;
                    var h = w * (img.naturalHeight / img.naturalWidth);
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                }
            } else if (ov.type === 'qr') {
                var s = ov.size;
                ctx.fillStyle = 'white';
                ctx.fillRect(-s / 2, -s / 2, s, s);
                ctx.fillStyle = 'black';
                ctx.font = 'bold ' + Math.round(s * 0.14) + 'px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('📱 SCAN', 0, -s * 0.12);
            }

            ctx.restore();
        }
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
        POSITIONS: Object.keys(PRESET_XY),
        // Arrange-mode API
        openArrange: openArrange,
        closeArrange: closeArrange,
        isArranging: function () { return arranging; },
        select: select,
        getSelectedId: function () { return selectedId; },
        snapTo: function (id, presetKey) {
            var p = PRESET_XY[presetKey];
            if (p) updateOverlay(id, { x: p.x, y: p.y });
        },
        onChange: onChange
    };
})();
