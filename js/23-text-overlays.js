/**
 * Text Overlays
 *
 * Free-positioned text drawn over the canvas (normalized centre x/y + rotation)
 * so it can be dragged anywhere, not snapped to preset anchors.
 *
 * Was "Branding & Engagement Overlays" until 2026-08-28: it also carried logo
 * images and QR codes, which made the panel a social-media kit rather than a
 * text tool. Those two overlay types are gone; what is left is a proper piece
 * of typography — family, weight, size, tracking, leading, case, alignment,
 * and both text and background colour.
 *
 * Overlays are pointer-events:none in normal use so they never block painting.
 * "Arrange mode" drops a transform canvas over the canvas-area that swallows
 * pointer events (so painting is paused) and lets you click-to-select then
 * drag to move, corner-drag to resize, and use the top handle to rotate — the
 * same interaction model as the layer transform editor (js/26-layer-transform.js).
 *
 * Overlays are composited into captures via compositeOntoCanvas(). The DOM
 * render and the canvas render are deliberately kept in lockstep (same case
 * transform, same line box maths, same padded background box) so what is
 * exported is what was on screen.
 *
 * Any overlay can also be a FLUID COLLIDER (`collider: true`): its glyphs are
 * rasterised into the obstacle texture through collisionLayers' procedural
 * source, so the simulation flows around the letterforms themselves rather
 * than around a bounding box. See the collider section near the bottom.
 *
 * window.textOverlays = {
 *   add, remove, update, toggle, clearAll, getAll, renderAll,
 *   compositeOntoCanvas, hasCollider, refreshColliders,
 *   FONTS, DEFAULTS, POSITIONS,
 *   openArrange, closeArrange, isArranging, select, getSelectedId, onChange
 * }
 */
(function () {
    'use strict';

    var overlays = [];
    var nextId = 1;
    var container = null;       // pointer-events:none DOM layer holding overlay elements
    var changeListeners = [];   // panel subscribes to redraw its list / button state

    var STORE_KEY = 'text.overlays';
    var LEGACY_STORE_KEY = 'branding.overlays';

    // ─── PRESET ANCHORS (legacy + quick-snap) ───────────────────
    // Kept so old saved overlays migrate and the panel can offer quick snapping.
    // Values are the normalized CENTRE (x,y) of the overlay within the canvas-area.
    var PRESET_XY = {
        TL: { x: 0.10, y: 0.10 }, TC: { x: 0.50, y: 0.10 }, TR: { x: 0.90, y: 0.10 },
        ML: { x: 0.10, y: 0.50 }, MC: { x: 0.50, y: 0.50 }, MR: { x: 0.90, y: 0.50 },
        BL: { x: 0.10, y: 0.90 }, BC: { x: 0.50, y: 0.90 }, BR: { x: 0.90, y: 0.90 }
    };

    var SPAWN = { x: 0.50, y: 0.86 };

    // ─── FONT LIBRARY ───────────────────────────────────────────
    // Curated stacks that exist on Windows and/or macOS. Each entry is probed
    // at boot (see fontAvailable) and hidden if the machine has no face for it,
    // so the picker only ever offers fonts that will actually render — a list
    // full of silent Arial fallbacks is worse than a short honest one.
    var FONTS = [
        { group: 'Sans', label: 'System UI',       probe: null,                 css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
        { group: 'Sans', label: 'Helvetica',       probe: 'Helvetica',          css: "Helvetica, Arial, sans-serif" },
        { group: 'Sans', label: 'Arial',           probe: 'Arial',              css: "Arial, Helvetica, sans-serif" },
        { group: 'Sans', label: 'Segoe UI',        probe: 'Segoe UI',           css: "'Segoe UI', sans-serif" },
        { group: 'Sans', label: 'Inter',           probe: 'Inter',              css: "'Inter', sans-serif" },
        { group: 'Sans', label: 'Roboto',          probe: 'Roboto',             css: "'Roboto', sans-serif" },
        { group: 'Sans', label: 'Verdana',         probe: 'Verdana',            css: "Verdana, Geneva, sans-serif" },
        { group: 'Sans', label: 'Tahoma',          probe: 'Tahoma',             css: "Tahoma, Geneva, sans-serif" },
        { group: 'Sans', label: 'Trebuchet MS',    probe: 'Trebuchet MS',       css: "'Trebuchet MS', sans-serif" },
        { group: 'Sans', label: 'Calibri',         probe: 'Calibri',            css: "Calibri, sans-serif" },
        { group: 'Sans', label: 'Candara',         probe: 'Candara',            css: "Candara, sans-serif" },
        { group: 'Sans', label: 'Corbel',          probe: 'Corbel',             css: "Corbel, sans-serif" },
        { group: 'Sans', label: 'Bahnschrift',     probe: 'Bahnschrift',        css: "Bahnschrift, 'DIN Alternate', sans-serif" },
        { group: 'Sans', label: 'Century Gothic',  probe: 'Century Gothic',     css: "'Century Gothic', 'Futura', sans-serif" },
        { group: 'Sans', label: 'Futura',          probe: 'Futura',             css: "Futura, 'Century Gothic', sans-serif" },
        { group: 'Sans', label: 'Avenir Next',     probe: 'Avenir Next',        css: "'Avenir Next', Avenir, sans-serif" },
        { group: 'Sans', label: 'Gill Sans',       probe: 'Gill Sans',          css: "'Gill Sans', 'Gill Sans MT', sans-serif" },
        { group: 'Sans', label: 'Optima',          probe: 'Optima',             css: "Optima, 'Segoe UI', sans-serif" },
        { group: 'Sans', label: 'Franklin Gothic', probe: 'Franklin Gothic Medium', css: "'Franklin Gothic Medium', 'Arial Narrow', sans-serif" },

        { group: 'Display', label: 'Impact',       probe: 'Impact',             css: "Impact, 'Haettenschweiler', sans-serif" },
        { group: 'Display', label: 'Arial Black',  probe: 'Arial Black',        css: "'Arial Black', Gadget, sans-serif" },
        { group: 'Display', label: 'Copperplate',  probe: 'Copperplate',        css: "Copperplate, 'Copperplate Gothic Light', serif" },
        { group: 'Display', label: 'Papyrus',      probe: 'Papyrus',            css: "Papyrus, fantasy" },
        { group: 'Display', label: 'Luminari',     probe: 'Luminari',           css: "Luminari, fantasy" },

        { group: 'Serif', label: 'Georgia',        probe: 'Georgia',            css: "Georgia, serif" },
        { group: 'Serif', label: 'Times New Roman',probe: 'Times New Roman',    css: "'Times New Roman', Times, serif" },
        { group: 'Serif', label: 'Garamond',       probe: 'Garamond',           css: "Garamond, 'EB Garamond', serif" },
        { group: 'Serif', label: 'Palatino',       probe: 'Palatino Linotype',  css: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
        { group: 'Serif', label: 'Book Antiqua',   probe: 'Book Antiqua',       css: "'Book Antiqua', Palatino, serif" },
        { group: 'Serif', label: 'Cambria',        probe: 'Cambria',            css: "Cambria, Georgia, serif" },
        { group: 'Serif', label: 'Constantia',     probe: 'Constantia',         css: "Constantia, Georgia, serif" },
        { group: 'Serif', label: 'Baskerville',    probe: 'Baskerville',        css: "Baskerville, 'Libre Baskerville', serif" },
        { group: 'Serif', label: 'Didot',          probe: 'Didot',              css: "Didot, 'Bodoni MT', serif" },
        { group: 'Serif', label: 'Bodoni MT',      probe: 'Bodoni MT',          css: "'Bodoni MT', Didot, serif" },
        { group: 'Serif', label: 'Rockwell',       probe: 'Rockwell',           css: "Rockwell, 'Courier Bold', serif" },

        { group: 'Mono', label: 'Consolas',        probe: 'Consolas',           css: "Consolas, 'Lucida Console', monospace" },
        { group: 'Mono', label: 'Courier New',     probe: 'Courier New',        css: "'Courier New', Courier, monospace" },
        { group: 'Mono', label: 'Cascadia Code',   probe: 'Cascadia Code',      css: "'Cascadia Code', Consolas, monospace" },
        { group: 'Mono', label: 'Menlo',           probe: 'Menlo',              css: "Menlo, Monaco, monospace" },
        { group: 'Mono', label: 'Monaco',          probe: 'Monaco',             css: "Monaco, Menlo, monospace" },
        { group: 'Mono', label: 'Lucida Console',  probe: 'Lucida Console',     css: "'Lucida Console', Monaco, monospace" },

        { group: 'Handwriting', label: 'Brush Script', probe: 'Brush Script MT', css: "'Brush Script MT', cursive" },
        { group: 'Handwriting', label: 'Segoe Script', probe: 'Segoe Script',    css: "'Segoe Script', cursive" },
        { group: 'Handwriting', label: 'Segoe Print', probe: 'Segoe Print',      css: "'Segoe Print', cursive" },
        { group: 'Handwriting', label: 'Ink Free',    probe: 'Ink Free',         css: "'Ink Free', cursive" },
        { group: 'Handwriting', label: 'Comic Sans',  probe: 'Comic Sans MS',    css: "'Comic Sans MS', cursive" },
        { group: 'Handwriting', label: 'Bradley Hand',probe: 'Bradley Hand',     css: "'Bradley Hand', cursive" },
        { group: 'Handwriting', label: 'Marker Felt', probe: 'Marker Felt',      css: "'Marker Felt', cursive" },
        { group: 'Handwriting', label: 'Chalkduster', probe: 'Chalkduster',      css: "Chalkduster, cursive" },
        { group: 'Handwriting', label: 'Snell Roundhand', probe: 'Snell Roundhand', css: "'Snell Roundhand', cursive" }
    ];

    // Font presence, by the classic width-difference probe: render a string in
    // "<family>, <fallback>" and in the fallback alone. If the family is
    // missing the two are identical, because the fallback drew both.
    //
    // NOT document.fonts.check() — measured 2026-08-28 in Chromium, it answers
    // true for every name given, a nonsense family included, because a font
    // list that ends in a fallback can always be rendered. It would have
    // offered this Windows box Chalkduster, Didot and Snell Roundhand.
    var _fontProbe = null;
    function fontAvailable(name) {
        if (!name) return true;
        try {
            if (!_fontProbe) _fontProbe = document.createElement('canvas').getContext('2d');
            var sample = 'mmmmmmmmmmlliWWMMOO0123';
            var widths = ['monospace', 'serif', 'sans-serif'].map(function (base) {
                _fontProbe.font = '72px ' + base;
                var b = _fontProbe.measureText(sample).width;
                _fontProbe.font = '72px "' + name + '", ' + base;
                return _fontProbe.measureText(sample).width !== b;
            });
            return widths.some(Boolean);
        } catch (_) { return true; }
    }

    var DEFAULTS = {
        content: 'Text',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontSize: 48,
        fontWeight: '700',
        fontStyle: 'normal',
        letterSpacing: 0,      // px
        lineHeight: 1.2,       // multiplier of fontSize
        align: 'center',
        textCase: 'none',      // none | upper | lower | title
        color: '#ffffff',
        opacity: 1,
        shadow: true,
        bgEnabled: false,
        bgColor: '#000000',
        bgOpacity: 0.55,
        padding: 14,
        radius: 8,
        collider: false        // letterforms become a fluid obstacle
    };

    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () { requestAnimationFrame(init); });
    });

    function init() {
        container = document.createElement('div');
        container.id = 'text-overlay-container';
        container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:hidden;';
        var canvasArea = document.getElementById('canvas-area');
        if (canvasArea) {
            canvasArea.style.position = 'relative';
            canvasArea.appendChild(container);
        }
        loadSaved();
        watchLayout();
        syncCollidersWhenReady();
        // Keep overlays anchored proportionally when the canvas-area resizes —
        // x/y are normalized so the CSS handles it, but arrange chrome needs a
        // redraw, and a collider wall is in SIM px so it has to be re-rasterised
        // against the new area->wrapper mapping.
        window.addEventListener('resize', function () {
            if (arranging) { sizeArrangeCanvas(); drawArrange(); }
            syncColliders();
        });
    }

    // ─── HELPERS ────────────────────────────────────────────────
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    function hexToRgba(hex, alpha) {
        var h = String(hex || '#000000').replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        var n = parseInt(h, 16);
        if (isNaN(n)) n = 0;
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
    }

    // Case is applied in JS, not via CSS text-transform, so the DOM and the
    // canvas composite transform the string identically — CSS `capitalize`
    // leaves the tail of each word alone, which would silently diverge.
    function applyCase(s, mode) {
        if (mode === 'upper') return s.toUpperCase();
        if (mode === 'lower') return s.toLowerCase();
        if (mode === 'title') {
            return s.replace(/\S+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
        }
        return s;
    }

    function displayText(ov) { return applyCase(ov.content || '', ov.textCase || 'none'); }

    // ─── ADD ────────────────────────────────────────────────────
    function coerceXY(opts) {
        if (typeof opts.x === 'number' && typeof opts.y === 'number') {
            return { x: clamp01(opts.x), y: clamp01(opts.y) };
        }
        if (opts.position && PRESET_XY[opts.position]) {
            return { x: PRESET_XY[opts.position].x, y: PRESET_XY[opts.position].y };
        }
        return { x: SPAWN.x, y: SPAWN.y };
    }

    function addTextOverlay(opts) {
        opts = opts || {};
        var xy = coerceXY(opts);
        var overlay = { id: nextId++, type: 'text', x: xy.x, y: xy.y, rotation: opts.rotation || 0, visible: true };
        for (var k in DEFAULTS) {
            if (!DEFAULTS.hasOwnProperty(k)) continue;
            overlay[k] = (opts[k] !== undefined) ? opts[k] : DEFAULTS[k];
        }
        // Legacy field name from the branding era.
        if (opts.textShadow !== undefined && opts.shadow === undefined) overlay.shadow = !!opts.textShadow;
        overlays.push(overlay);
        renderOverlay(overlay);
        save(); emitChange(); syncColliders();
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

        el.style.color = ov.color;
        el.style.fontSize = ov.fontSize + 'px';
        el.style.fontFamily = ov.fontFamily;
        el.style.fontWeight = ov.fontWeight;
        el.style.fontStyle = ov.fontStyle || 'normal';
        el.style.letterSpacing = (ov.letterSpacing || 0) + 'px';
        el.style.lineHeight = String(ov.lineHeight || 1.2);
        el.style.textAlign = ov.align || 'center';
        el.style.whiteSpace = 'pre';       // honours the \n in multi-line content
        // Padding only counts when there is a background to pad — otherwise the
        // arrange handles would sit off the glyphs for no visible reason.
        if (ov.bgEnabled) {
            el.style.background = hexToRgba(ov.bgColor, ov.bgOpacity);
            el.style.padding = (ov.padding || 0) + 'px';
            el.style.borderRadius = (ov.radius || 0) + 'px';
        }
        if (ov.shadow) {
            el.style.textShadow = '0 1px 4px rgba(0,0,0,0.7), 0 0 12px rgba(0,0,0,0.4)';
        }
        el.textContent = displayText(ov);

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
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
    }

    function updateOverlay(id, props) {
        var ov = findOverlay(id);
        if (!ov) return null;
        for (var key in props) if (props.hasOwnProperty(key)) ov[key] = props[key];
        renderOverlay(ov);
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
        return ov;
    }

    function toggleOverlay(id) {
        var ov = findOverlay(id);
        if (!ov) return null;
        ov.visible = !ov.visible;
        renderOverlay(ov);
        if (!ov.visible && selectedId === id) selectedId = null;
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
        return ov;
    }

    function clearAll() {
        overlays = [];
        selectedId = null;
        if (container) container.innerHTML = '';
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
    }

    // ─── CHANGE NOTIFICATION ────────────────────────────────────
    function onChange(fn) { if (typeof fn === 'function') changeListeners.push(fn); }
    function emitChange() {
        for (var i = 0; i < changeListeners.length; i++) {
            try { changeListeners[i](); } catch (_) {}
        }
    }

    // ─── PERSISTENCE ────────────────────────────────────────────
    // Text overlays are user-authored content, so they write through on every
    // mutation and restore on every boot — never gated on the Save button or
    // the autoload checkbox.
    function save() {
        try {
            if (!window.settingsManager) return;
            var data = overlays.map(function (o) {
                var copy = {};
                for (var k in o) if (o.hasOwnProperty(k) && k !== 'id') copy[k] = o[k];
                return copy;
            });
            window.settingsManager.set(STORE_KEY, data);
        } catch (_) {}
    }

    // Fills in every field a saved overlay predates, and drops the image/QR
    // overlays the branding era could create (their bitmaps were never stored,
    // so they could only ever come back as empty boxes).
    function hydrate(o) {
        if (!o || (o.type && o.type !== 'text')) return null;
        var ov = { id: nextId++, type: 'text', visible: o.visible !== false };
        if (typeof o.x === 'number' && typeof o.y === 'number') {
            ov.x = clamp01(o.x); ov.y = clamp01(o.y);
        } else {
            var p = PRESET_XY[o.position] || SPAWN;
            ov.x = p.x; ov.y = p.y;
        }
        ov.rotation = typeof o.rotation === 'number' ? o.rotation : 0;
        for (var k in DEFAULTS) {
            if (!DEFAULTS.hasOwnProperty(k)) continue;
            ov[k] = (o[k] !== undefined && o[k] !== null) ? o[k] : DEFAULTS[k];
        }
        if (o.shadow === undefined && o.textShadow !== undefined) ov.shadow = !!o.textShadow;
        return ov;
    }

    function loadSaved() {
        try {
            if (!window.settingsManager) return;
            var data = window.settingsManager.get(STORE_KEY);
            if (!Array.isArray(data)) data = window.settingsManager.get(LEGACY_STORE_KEY);
            if (!Array.isArray(data)) return;
            var migrated = false;
            for (var i = 0; i < data.length; i++) {
                if (data[i] && data[i].type && data[i].type !== 'text') { migrated = true; continue; }
                var ov = hydrate(data[i]);
                if (!ov) continue;
                overlays.push(ov);
                renderOverlay(ov);
            }
            if (migrated) save();
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
    var CHROME = 'rgba(255, 130, 170, 0.95)';   // pink — matches the Text panel accent

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
            start: { x: ov.x, y: ov.y, rotation: ov.rotation || 0, fontSize: ov.fontSize },
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
            ov.fontSize = Math.max(6, Math.min(400, Math.round(drag.start.fontSize * factor)));
        }
        renderOverlay(ov);
        // Only for a collider, and only while it is the one being dragged: the
        // recomposite is rAF-coalesced (one per frame at worst, same as
        // dragging a collider LAYER), but there is no reason to pay it for
        // plain text.
        if (ov.collider) syncColliders();
        drawArrange();
    }

    function onUp(e) {
        if (!drag) return;
        drag = null;
        try { aCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        save(); emitChange(); syncColliders();
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
        document.body.classList.add('text-arrange-active');

        aCanvas = document.createElement('canvas');
        aCanvas.id = 'text-arrange-canvas';
        // High z-index: #canvas-wrapper has no stacking context, so canvas resize
        // handles (z~201) and layer handles (z~10003) compete in this same context
        // and would otherwise sit above the arrange surface and steal clicks. We sit
        // above them (and body.text-arrange-active also disables their pointer
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
        aBar.id = 'text-arrange-bar';
        aBar.dataset.group = 'expressive';
        aBar.innerHTML =
            '<span class="ba-title">✋ Arrange text</span>' +
            '<span class="ba-hint">click to select · drag to move · corners resize · ↻ rotate · painting paused</span>' +
            '<button id="textArrangeDone" type="button">Done</button>';
        document.body.appendChild(aBar);
        document.getElementById('textArrangeDone').onclick = function (ev) { ev.preventDefault(); closeArrange(); };

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
        document.body.classList.remove('text-arrange-active');
        emitChange();
    }

    function select(id) {
        selectedId = id;
        emitChange();
        if (arranging) drawArrange();
    }

    // ═══════════════════════════════════════════════════════════
    //  CANVAS COMPOSITE (for capture / video export)
    // ═══════════════════════════════════════════════════════════
    // COORDINATE SPACE: overlay x/y are fractions of #canvas-area (the DOM
    // container), NOT of the canvas wrapper. Callers exporting the wrapper
    // must pass the area→target mapping (areaWidth/areaHeight/offsetX/offsetY,
    // all in target px) or overlays land in the wrong place. Without those
    // fields the legacy behavior (fractions of the target itself) is kept.

    // Chromium ≥99 has ctx.letterSpacing, which measureText also honours.
    // Everywhere else we place glyphs by hand so exports still track.
    var NATIVE_LETTER_SPACING = (function () {
        try {
            var c = document.createElement('canvas').getContext('2d');
            c.letterSpacing = '2px';
            return c.letterSpacing === '2px';
        } catch (_) { return false; }
    })();

    function measureLine(ctx, text, sp) {
        if (!text) return 0;
        if (NATIVE_LETTER_SPACING) return ctx.measureText(text).width;
        var w = 0;
        for (var i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width;
        // CSS adds the tracking after every character, the last one included —
        // matching that keeps the padded background box the same width as the DOM.
        return w + sp * text.length;
    }

    // Draws one line with its LEFT edge at x (alignment is resolved by caller).
    function drawLine(ctx, text, x, y, sp) {
        if (!text) return;
        if (NATIVE_LETTER_SPACING) { ctx.fillText(text, x, y); return; }
        var cx = x;
        for (var i = 0; i < text.length; i++) {
            ctx.fillText(text[i], cx, y);
            cx += ctx.measureText(text[i]).width + sp;
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        var rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

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
            ctx.save();
            ctx.globalAlpha = ov.opacity;
            ctx.translate(ov.x * areaW - offX, ov.y * areaH - offY);
            ctx.rotate((ov.rotation || 0) * Math.PI / 180);
            paintOverlay(ctx, ov, false);
            ctx.restore();
        }
    }

    // Paints ONE overlay with the ctx already translated and rotated to its
    // centre. Shared by the capture composite and the collider rasteriser, so
    // a wall can never drift from the letterforms it is meant to trace.
    //   collider -> flat white, no colour and no shadow: the obstacle pipeline
    //   reads ALPHA as wall coverage, and a soft shadow would smear the wall
    //   into a halo well outside the glyph.
    function paintOverlay(ctx, ov, collider) {
        var sp = ov.letterSpacing || 0;
        var lines = displayText(ov).split('\n');
        var lineH = ov.fontSize * (ov.lineHeight || 1.2);
        var pad = ov.bgEnabled ? (ov.padding || 0) : 0;

        ctx.font = (ov.fontStyle || 'normal') + ' ' + ov.fontWeight + ' ' + ov.fontSize + 'px ' + ov.fontFamily;
        if (NATIVE_LETTER_SPACING) ctx.letterSpacing = sp + 'px';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        var textW = 0;
        for (var L = 0; L < lines.length; L++) textW = Math.max(textW, measureLine(ctx, lines[L], sp));
        var boxW = textW + pad * 2;
        var boxH = lines.length * lineH + pad * 2;

        // The padding stays in the geometry either way (the glyphs sit where
        // they sit), but a box at ~zero opacity is not on screen and so must
        // not be a wall either — the letterforms still are.
        if (ov.bgEnabled && (!collider || ov.bgOpacity > 0.02)) {
            ctx.fillStyle = collider ? '#ffffff' : hexToRgba(ov.bgColor, ov.bgOpacity);
            roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, ov.radius || 0);
            ctx.fill();
        }

        if (ov.shadow && !collider) {
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 1;
        }
        ctx.fillStyle = collider ? '#ffffff' : ov.color;

        var align = ov.align || 'center';
        for (var n = 0; n < lines.length; n++) {
            var lw = measureLine(ctx, lines[n], sp);
            var lx = align === 'left' ? -boxW / 2 + pad
                : align === 'right' ? boxW / 2 - pad - lw
                : -lw / 2;
            // Half-leading: CSS centres the em box inside the line box, and
            // textBaseline 'middle' lands on that same centre.
            var ly = -boxH / 2 + pad + n * lineH + lineH / 2;
            drawLine(ctx, lines[n], lx, ly, sp);
        }

        if (NATIVE_LETTER_SPACING) ctx.letterSpacing = '0px';
    }

    // ===========================================================
    //  FLUID COLLIDER - the letterforms as a wall
    // ===========================================================
    // Registered as the collisionLayers PROCEDURAL obstacle source, which is
    // what that slot is for: a code-drawn wall re-rasterised on every obstacle
    // recomposite, so it survives FBO rebuilds and resolution changes without
    // needing a layer of its own to live on.
    //
    // COST: nothing per frame. The rasterise runs only inside an obstacle
    // recomposite, and 23-depth-collision schedules those on change and
    // rAF-coalesces them — never per sim step. Detail is free from the same
    // pipeline: it composes at 2x sim resolution and box-filters down, so the
    // antialiased glyph edges arrive as exactly the fractional coverage the
    // cut-cell projection already consumes.
    //
    // FULL alpha, deliberately: alpha IS coverage here (the shaders recover it
    // as alpha/uObsMax), and a mid-alpha wall lands inside solidity()'s noisy
    // 0.35-0.85 window, which simulates as a porous sponge rather than as a
    // letter. That is why there is no strength knob.
    var colliderInstalled = false;

    function anyCollider() {
        for (var i = 0; i < overlays.length; i++) {
            if (overlays[i].visible && overlays[i].collider) return true;
        }
        return false;
    }

    // The mapping from overlay space to obstacle space, read live every time
    // the wall is rasterised. Overlay x/y are fractions of #canvas-area; the
    // obstacle covers the SIM DOMAIN, which is exactly the #canvas element —
    // not the wrapper. They are usually the same box, but the canvas is the
    // one that is true by definition, so a wrapper border or padding can never
    // introduce a silent few-pixel offset.
    function colliderGeom() {
        var area = document.getElementById('canvas-area');
        var cv = document.getElementById('canvas');
        if (!area || !cv) return null;
        var aR = area.getBoundingClientRect();
        var cR = cv.getBoundingClientRect();
        if (!aR.width || !aR.height || !cR.width || !cR.height) return null;
        return {
            areaW: aR.width, areaH: aR.height,
            cssW: cR.width, cssH: cR.height,
            offX: cR.left - aR.left, offY: cR.top - aR.top
        };
    }

    function colliderDraw(ctx, obsW, obsH) {
        var g = colliderGeom();
        if (!g) { lastRasterSig = null; return; }
        var kx = obsW / g.cssW, ky = obsH / g.cssH;

        for (var i = 0; i < overlays.length; i++) {
            var ov = overlays[i];
            if (!ov.visible || !ov.collider) continue;
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.translate((ov.x * g.areaW - g.offX) * kx, (ov.y * g.areaH - g.offY) * ky);
            // kx and ky differ only by the integer rounding of the sim texture
            // dimensions (well under 0.1%), so scaling ahead of the rotation
            // costs no visible shear and keeps the layout maths in CSS px.
            ctx.scale(kx, ky);
            ctx.rotate((ov.rotation || 0) * Math.PI / 180);
            paintOverlay(ctx, ov, true);
            ctx.restore();
        }
        // Remember exactly what this rasterise was based on, so the watchdog
        // below can tell whether the wall on the GPU is still current.
        lastRasterSig = colliderSig();
        var ob = liveObstacle();
        if (ob && rasteredObstacles) rasteredObstacles.add(ob);
    }

    // ── Staying aligned ────────────────────────────────────────
    // A wall is a COPY of the text baked into a sim-resolution texture, so it
    // goes stale whenever either side moves: the text (any typographic
    // property, position or rotation) or the mapping (canvas resized, sidebar
    // or drawer opened, focus mode, window resize, sim resolution changed).
    // Mutation sites call syncColliders() directly, but that only covers the
    // causes we can enumerate — so the signature below captures everything the
    // rasterise depended on, and a cheap watchdog re-runs it whenever the live
    // value stops matching what the wall was built from. Anything we failed to
    // think of self-heals within one tick instead of leaving a wall stranded.
    var lastRasterSig = null;
    var WATCHDOG_MS = 200;
    var watchdogTimer = null;
    // Every obstacle FBO we have actually drawn into. A framebuffer rebuild
    // makes a BRAND NEW object and empties it, which the signature alone can
    // miss when the rebuild keeps the same dimensions (a dye-resolution change,
    // or a rebuild racing a canvas resize) — the wall is then silently gone
    // with nothing to notice. A WeakSet rather than a plain identity compare
    // because the opt-in COLLIDER_GAP_FILL close swaps `obstacle` with its
    // scratch: identity alternates between two objects, so a bare !== would
    // re-rasterise on every watchdog tick forever. Membership settles after
    // each object has been drawn into once, and dead FBOs are collected.
    var rasteredObstacles = (typeof WeakSet === 'function') ? new WeakSet() : null;

    function liveObstacle() {
        try {
            return (typeof window.__getObstacle === 'function') ? window.__getObstacle() : null;
        } catch (_) { return null; }
    }

    function colliderSig() {
        var g = colliderGeom();
        if (!g) return null;
        // The obstacle texture's OWN dimensions, not window.simTexWidth: that
        // global is refreshed by exposeSimStats(), which only the update loop
        // calls, so a framebuffer rebuild from anywhere else leaves it stale
        // and a resolution change becomes invisible to this signature.
        var obsDims = '';
        try {
            var ob = (typeof window.__getObstacle === 'function') ? window.__getObstacle() : null;
            if (ob) obsDims = ob.width + 'x' + ob.height;
        } catch (_) {}
        // A framebuffer rebuild empties the obstacle, and a DYE-resolution
        // change rebuilds it at UNCHANGED dimensions — invisible to obsDims
        // alone, which would leave the wall silently deleted. Track what drives
        // a rebuild as well as its result: the two resolution settings, the
        // governor's scales (it rebuilds by scaling those, not the config), and
        // the drawing-buffer size (canvas resize, and the render-size cap).
        var cfg = window.config || {};
        var gov = window.QualityGovernor;
        var cvEl = document.getElementById('canvas');
        var rebuildSig = [
            cfg.SIM_RESOLUTION | 0, cfg.DYE_RESOLUTION | 0,
            gov && gov.simScale ? gov.simScale() : 1,
            gov && gov.dyeScale ? gov.dyeScale() : 1,
            cvEl ? cvEl.width : 0, cvEl ? cvEl.height : 0
        ].join('/');
        // Half-pixel granularity: fine enough to catch any shift a person can
        // see, coarse enough not to churn on sub-pixel layout jitter.
        var parts = [
            Math.round(g.areaW * 2), Math.round(g.areaH * 2),
            Math.round(g.cssW * 2), Math.round(g.cssH * 2),
            Math.round(g.offX * 2), Math.round(g.offY * 2),
            obsDims, rebuildSig
        ];
        for (var i = 0; i < overlays.length; i++) {
            var o = overlays[i];
            if (!o.visible || !o.collider) continue;
            // Every field paintOverlay reads. Miss one and that property's
            // changes stop resyncing, which is the bug class this guards.
            parts.push(o.id, o.x.toFixed(5), o.y.toFixed(5), o.rotation || 0,
                o.content, o.textCase, o.fontFamily, o.fontSize, o.fontWeight,
                o.fontStyle, o.letterSpacing, o.lineHeight, o.align,
                o.bgEnabled ? 1 : 0, o.bgOpacity, o.padding, o.radius);
        }
        return parts.join('\u0001');
    }

    function startWatchdog() {
        if (watchdogTimer) return;
        watchdogTimer = setInterval(function () {
            if (!colliderInstalled) { stopWatchdog(); return; }
            var sig = colliderSig();
            // No measurable geometry (canvas-area collapsed to zero — boot,
            // a hidden pane, a minimised window): colliderDraw would early-out
            // anyway, so re-running it would just spin. Wait for real layout.
            if (sig === null) return;
            if (sig !== lastRasterSig) { syncColliders(); return; }
            // Geometry unchanged, but the obstacle may have been rebuilt out
            // from under the wall — same size, empty, and invisible to sig.
            var ob = liveObstacle();
            if (ob && rasteredObstacles && !rasteredObstacles.has(ob)) syncColliders();
        }, WATCHDOG_MS);
    }

    function stopWatchdog() {
        if (!watchdogTimer) return;
        clearInterval(watchdogTimer);
        watchdogTimer = null;
    }

    // Install / drop / refresh the wall. Idempotent and cheap, so every
    // mutation site can just call it. setProcedural recomposites on its own;
    // when it is already installed we ask for the recomposite ourselves.
    function syncColliders() {
        var cl = window.collisionLayers;
        if (!cl || typeof cl.setProcedural !== 'function') return;
        var want = anyCollider();
        if (want !== colliderInstalled) {
            colliderInstalled = want;
            cl.setProcedural(want ? colliderDraw : null);
            if (want) startWatchdog(); else { stopWatchdog(); lastRasterSig = null; }
        } else if (want && typeof cl.updateObstacleFromLayers === 'function') {
            cl.updateObstacleFromLayers();
        }
    }

    // Layout can change with no window resize at all — the canvas resize
    // handles, a sidebar or drawer opening, focus mode, mobile mode. A
    // ResizeObserver catches every one of those, and keeps firing THROUGHOUT a
    // drag or a CSS transition rather than once at the start.
    function watchLayout() {
        if (typeof ResizeObserver !== 'function') return;
        var ro = new ResizeObserver(function () { if (colliderInstalled) syncColliders(); });
        ['canvas-area', 'canvas-wrapper', 'canvas'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { try { ro.observe(el); } catch (_) {} }
        });
        // A family picked from the font menu may still be loading when the wall
        // is first measured, which would bake the fallback face's metrics in.
        if (document.fonts && document.fonts.addEventListener) {
            try {
                document.fonts.addEventListener('loadingdone', function () {
                    if (colliderInstalled) syncColliders();
                });
            } catch (_) {}
        }
    }

    // Restored overlays can beat 23-depth-collision to the DOM, and a wall
    // that silently never installed is indistinguishable from a broken one.
    function syncCollidersWhenReady(tries) {
        if (window.collisionLayers && typeof window.collisionLayers.setProcedural === 'function') {
            syncColliders();
            return;
        }
        if ((tries || 0) < 20) {
            setTimeout(function () { syncCollidersWhenReady((tries || 0) + 1); }, 100);
        }
    }

    // ─── PUBLIC API ─────────────────────────────────────────────
    var api = {
        add: addTextOverlay,
        addText: addTextOverlay,      // the name the rest of the app already calls
        remove: removeOverlay,
        update: updateOverlay,
        toggle: toggleOverlay,
        clearAll: clearAll,
        getAll: function () { return overlays.slice(); },
        get: function (id) { var o = findOverlay(id); return o ? o : null; },
        renderAll: renderAll,
        compositeOntoCanvas: compositeOntoCanvas,
        hasCollider: anyCollider,
        refreshColliders: syncColliders,
        colliderSignature: colliderSig,     // harness: what the wall was built from
        colliderRasterSignature: function () { return lastRasterSig; },
        FONTS: FONTS,
        DEFAULTS: DEFAULTS,
        fontAvailable: fontAvailable,
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

    window.textOverlays = api;
    // Legacy alias — the store-asset bake scripts in scripts/ call
    // window.brandingOverlays.clearAll() against the live page.
    window.brandingOverlays = api;
})();
