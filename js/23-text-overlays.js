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
 * Fluidize — the Text panel's twin of the button on a layer row — pours an
 * overlay into the dye through the same image-splat path a layer takes,
 * then hides it. See fluidize() after the composite section.
 *
 * Any overlay can carry a HOTKEY (js/48-hotkeys.js): a key that fires the
 * line from anywhere — pours the whole block into the fluid, centred on the
 * brush or where the line is arranged, a typewriter whose keys type
 * paragraphs — or shows and hides it. See the hotkey section after the
 * collider.
 *
 * window.textOverlays = {
 *   add, remove, update, toggle, clearAll, getAll, renderAll,
 *   compositeOntoCanvas, fluidize, hasCollider, refreshColliders,
 *   setHotkey, triggerHotkey,
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
    // Other painters' lines and pour bitmaps in a Swirl Together room — see
    // SWIRL TOGETHER near the bottom. Never in `overlays`: not saved, not in
    // the panel, not arrangeable, gone when the room is.
    var peerLines = new Map();  // 'owner|id' → a cleaned line + where it stands
    var peerStamps = new Map(); // pour bitmap key → { ps, owner }, oldest first

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
        collider: false,       // letterforms become a fluid obstacle
        colliderMode: 'deflect', // block | deflect | slow (collisionLayers.MODES).
                                 // Deflect by default: letters are smooth stones the
                                 // fluid slides around; Block's sticky apron left dye
                                 // hanging on the crowns of glyphs under gravity.
        colliderStrength: 1    // 0..1, same scale as a collision layer's Strength
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
        renderPeerLines();          // a room joined before this layer existed
        registerHotkeys();
        watchLayout();
        syncCollidersWhenReady();
        // Keep overlays anchored proportionally when the canvas-area resizes —
        // x/y are normalized so the CSS handles it, but arrange chrome needs a
        // redraw, and a collider wall is in SIM px so it has to be re-rasterised
        // against the new area->wrapper mapping.
        window.addEventListener('resize', function () {
            if (arranging) { sizeArrangeCanvas(); drawArrange(); }
            // A window drag is a stream too — same coalescing as a text edit.
            syncCollidersSoon();
            layoutPeerLines();
            mpTextChanged();
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
        // visible is honoured, not hardcoded: preset restore and Duplicate
        // both come through here with full overlay snapshots, and dropping a
        // saved visible:false silently resurrected hidden text — with its
        // collider wall, if it had one.
        var overlay = { id: nextId++, type: 'text', x: xy.x, y: xy.y, rotation: opts.rotation || 0, visible: opts.visible !== false };
        for (var k in DEFAULTS) {
            if (!DEFAULTS.hasOwnProperty(k)) continue;
            overlay[k] = (opts[k] !== undefined) ? opts[k] : DEFAULTS[k];
        }
        // Legacy field name from the branding era.
        if (opts.textShadow !== undefined && opts.shadow === undefined) overlay.shadow = !!opts.textShadow;
        overlay.hotkey = hotkeyOf(opts.hotkey);
        overlay.hotkeyAction = hotkeyActionOf(opts.hotkeyAction);
        overlay.hotkeyAt = hotkeyAtOf(opts.hotkeyAt);
        // One key, one line. A copy (Duplicate) arrives without the key its
        // source holds, rather than firing alongside it.
        if (hotkeyHolder(overlay.hotkey)) overlay.hotkey = '';
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

        if (!onScreen(ov)) return;

        var el = document.createElement('div');
        el.dataset.overlayId = ov.id;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.left = (ov.x * 100) + '%';
        el.style.top = (ov.y * 100) + '%';
        el.style.transformOrigin = 'center center';
        el.style.transform = 'translate(-50%,-50%) rotate(' + (ov.rotation || 0) + 'deg)';
        el.style.zIndex = '51';
        styleTextEl(el, ov);
        // Hidden, and only up while it is arranged (ARRANGE MODE): faded.
        if (!ov.visible) el.style.opacity = GHOST_OPACITY;

        container.appendChild(el);
    }

    // The typography half of an overlay's element — everything but where it
    // stands. Shared with a peer's line (see SWIRL TOGETHER below), so the
    // two can never set type differently.
    function styleTextEl(el, ov) {
        el.style.opacity = ov.opacity;
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
    }

    function renderAll() {
        if (!container) return;
        container.innerHTML = '';
        for (var i = 0; i < overlays.length; i++) renderOverlay(overlays[i]);
        renderPeerLines();   // the wipe took the room's lines too
    }

    function getEl(id) {
        return container ? container.querySelector('[data-overlay-id="' + id + '"]') : null;
    }

    // ─── OVERLAY MANAGEMENT ─────────────────────────────────────
    function findOverlay(id) {
        for (var i = 0; i < overlays.length; i++) if (overlays[i].id === id) return overlays[i];
        return null;
    }

    // A line by id, this user's or the room's: own lines have numeric ids,
    // a room line's id is its 'owner|id' key (see SWIRL TOGETHER).
    function lineById(id) {
        return (typeof id === 'string') ? (peerLines.get(id) || null) : findOverlay(id);
    }

    function removeOverlay(id) {
        if (typeof id === 'string') return removeRoomLine(id);
        overlays = overlays.filter(function (o) { return o.id !== id; });
        var el = getEl(id);
        if (el) el.remove();
        if (selectedId === id) selectedId = null;
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
    }

    function updateOverlay(id, props) {
        if (typeof id === 'string') return updateRoomLine(id, props);
        var ov = findOverlay(id);
        if (!ov) return null;
        for (var key in props) if (props.hasOwnProperty(key)) ov[key] = props[key];
        renderOverlay(ov);
        // syncCollidersSoon, not syncColliders: the panel commits on every
        // keystroke and every slider tick, and each rebuild would carve the
        // dye again. The wall lands 160ms after the edit stops.
        save(); emitChange(); syncCollidersSoon();
        if (arranging) drawArrange();
        return ov;
    }

    // Show or hide without touching the selection — the shared half of
    // toggleOverlay, and what Fluidize uses so the line stays in the editor
    // after its text leaves the canvas.
    function setVisible(ov, v) {
        ov.visible = !!v;
        delete revealed[ov.id];     // shown or hidden on purpose: no longer arrange's ghost
        renderOverlay(ov);
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
    }

    function toggleOverlay(id) {
        // Hiding someone else's line hides it for the whole room — it is
        // theirs to bring back (see removeRoomLine).
        if (typeof id === 'string') return removeRoomLine(id);
        var ov = findOverlay(id);
        if (!ov) return null;
        // Hiding from the eye drops the selection too: a hidden line has
        // nothing to arrange, and the editor closing says so.
        if (ov.visible && selectedId === id) selectedId = null;
        setVisible(ov, !ov.visible);
        return ov;
    }

    function clearAll() {
        overlays = [];
        selectedId = null;
        if (container) container.innerHTML = '';
        renderPeerLines();   // Clear All is this user's lines, not the room's
        save(); emitChange(); syncColliders();
        if (arranging) drawArrange();
    }

    // ─── CHANGE NOTIFICATION ────────────────────────────────────
    function onChange(fn) { if (typeof fn === 'function') changeListeners.push(fn); }
    function emitChange() {
        for (var i = 0; i < changeListeners.length; i++) {
            try { changeListeners[i](); } catch (_) {}
        }
        // A line's key, words or visibility may have moved; the Settings
        // list of hotkeys shows all three (coalesced there, once a frame).
        if (window.Hotkeys && typeof window.Hotkeys.changed === 'function') window.Hotkeys.changed();
        // ...and a Swirl Together room wants the lines as they now stand
        // (06d, throttled there; a no-op outside a room).
        mpTextChanged();
    }

    function mpTextChanged() {
        if (typeof window.__mpTextChanged === 'function') {
            try { window.__mpTextChanged(); } catch (_) {}
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
        ov.hotkey = hotkeyOf(o.hotkey);
        ov.hotkeyAction = hotkeyActionOf(o.hotkeyAction);
        ov.hotkeyAt = hotkeyAtOf(o.hotkeyAt);
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
                if (hotkeyHolder(ov.hotkey)) ov.hotkey = '';   // first line on a key keeps it
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

    // A hidden line being arranged — its ✥, or picked from the list while
    // arranging — stays on screen until Done, faded, the way a hidden layer
    // shows under Transform (26-layer-transform's .transform-ghost), so the
    // move is never made blind. Screen only: `visible` stays false, so no
    // save, wall, export, pour or room message sees it, and Done takes it
    // back out of sight. Showing or hiding it on purpose ends that
    // (setVisible) — from then on it is shown or hidden for real.
    var revealed = {};          // id → true, this arrange only
    var GHOST_OPACITY = 0.65;   // .transform-ghost's

    function onScreen(ov) { return ov.visible || (arranging && revealed[ov.id] === true); }

    function reveal(id) {
        var ov = (typeof id === 'number') ? findOverlay(id) : null;
        if (!arranging || !ov || ov.visible || revealed[id]) return;
        revealed[id] = true;
        renderOverlay(ov);
    }

    // Geometry of an overlay in arrange-canvas pixel coords.
    function overlayGeom(ov) {
        if (ov && ov.room) return roomGeom(ov);
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

    // A room line in the same terms: its spot is a fraction of the canvas, and
    // its box is the element's layout box stretched the way it is drawn (the
    // painter's canvas size over this one, per axis).
    function roomGeom(pl) {
        if (!pl.el || !aCanvas) return null;
        var g = colliderGeom();
        if (!g) return null;
        var kx = aCanvas.width / g.areaW, ky = aCanvas.height / g.areaH;
        return {
            cx: (g.offX + pl.cx * g.cssW) * kx,
            cy: (g.offY + pl.cy * g.cssH) * ky,
            hw: pl.el.offsetWidth / 2 * (g.cssW / pl.cw) * kx,
            hh: pl.el.offsetHeight / 2 * (g.cssH / pl.ch) * ky,
            rot: (pl.rotation || 0) * Math.PI / 180
        };
    }

    // Hit-test the SELECTED overlay's handles first, then any overlay's body
    // (top-most = last drawn = last in array; the room's lines are drawn
    // after this user's own, so they are searched first).
    function hitTest(px, py) {
        var sel = selectedId != null ? lineById(selectedId) : null;
        if (sel && onScreen(sel)) {
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
        var room = Array.from(peerLines.values());
        for (var r = room.length - 1; r >= 0; r--) {
            var rg = overlayGeom(room[r]);
            if (!rg) continue;
            var rl = toLocal(rg, px, py);
            if (Math.abs(rl.x) <= rg.hw + 4 && Math.abs(rl.y) <= rg.hh + 4) {
                return { id: room[r].id, mode: 'move' };
            }
        }
        for (var i = overlays.length - 1; i >= 0; i--) {
            var ov = overlays[i];
            if (!onScreen(ov)) continue;
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
        var sel = selectedId != null ? lineById(selectedId) : null;
        if (!sel || !onScreen(sel)) return;
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
        var ov = lineById(hit.id);
        if (!ov) return;
        var g = overlayGeom(ov);
        if (!g) return;
        drag = {
            id: hit.id,
            mode: hit.mode,
            corner: hit.corner || null,
            startX: px, startY: py,
            start: { x: ov.x, y: ov.y, cx: ov.cx, cy: ov.cy, rotation: ov.rotation || 0, fontSize: ov.fontSize },
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
        var ov = lineById(drag.id);
        if (!ov) return;

        if (drag.mode === 'move') {
            var W = aCanvas.width, H = aCanvas.height;
            if (ov.room) {
                // A room line stands at a fraction of the CANVAS.
                var rg = colliderGeom();
                if (rg) {
                    ov.cx = Math.max(-1, Math.min(2, drag.start.cx + (px - drag.startX) / W * rg.areaW / rg.cssW));
                    ov.cy = Math.max(-1, Math.min(2, drag.start.cy + (py - drag.startY) / H * rg.areaH / rg.cssH));
                }
            } else {
                ov.x = clamp01(drag.start.x + (px - drag.startX) / W);
                ov.y = clamp01(drag.start.y + (py - drag.startY) / H);
            }
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
        if (ov.room) renderPeerLine(ov); else renderOverlay(ov);
        // Coalesced, not per-frame: a corner-resize drag rebuilt the wall on
        // every pointermove, and each intermediate size left its own void in
        // the dye. onUp forces the final rebuild immediately.
        if (ov.collider) syncCollidersSoon();
        drawArrange();
    }

    function onUp(e) {
        if (!drag) return;
        var ov = lineById(drag.id);
        drag = null;
        try { aCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        // A room line's move goes back to its author (and the room) once,
        // when the drag ends — same as a local line's wall rebuild.
        if (ov && ov.room) { ov.rev = ''; mpRoomEdit(ov); emitChange(); syncColliders(); return; }
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
            if (focusId != null) { selectedId = focusId; reveal(focusId); emitChange(); drawArrange(); }
            return;
        }
        var area = document.getElementById('canvas-area');
        if (!area) return;
        arranging = true;
        selectedId = (focusId != null) ? focusId : selectedId;
        reveal(selectedId);
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
        // The hidden lines it showed go back out of sight.
        var shown = revealed;
        revealed = {};
        for (var i = 0; i < overlays.length; i++) {
            if (shown[overlays[i].id]) renderOverlay(overlays[i]);
        }
        emitChange();
    }

    function select(id) {
        selectedId = id;
        reveal(id);                 // arranging: a hidden line picked from the list shows
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
            try {
                ctx.globalAlpha = ov.opacity;
                ctx.translate(ov.x * areaW - offX, ov.y * areaH - offY);
                ctx.rotate((ov.rotation || 0) * Math.PI / 180);
                paintOverlay(ctx, ov, false);
            } catch (e) {
                // Same isolation as colliderDraw: one bad overlay must not
                // abort the composite — a throw here fails the whole video
                // export and strands the save() above on the ctx stack.
                console.warn('⚠️ Text overlay composite failed for overlay', ov.id, e);
            }
            ctx.restore();
        }

        // A room's lines are on screen too, so they are in the capture. Their
        // spot is a fraction of the CANVAS; the live layout turns it into the
        // area fraction this composite speaks, and the painter's canvas size
        // into the same per-axis stretch the DOM element carries.
        var g = peerLines.size ? colliderGeom() : null;
        if (g) {
            peerLines.forEach(function (pl) {
                ctx.save();
                try {
                    ctx.globalAlpha = pl.opacity;
                    var xa = (g.offX + pl.cx * g.cssW) / g.areaW, ya = (g.offY + pl.cy * g.cssH) / g.areaH;
                    ctx.translate(xa * areaW - offX, ya * areaH - offY);
                    ctx.scale(g.cssW / pl.cw, g.cssH / pl.ch);
                    ctx.rotate((pl.rotation || 0) * Math.PI / 180);
                    paintOverlay(ctx, pl, false);
                } catch (e) {
                    console.warn('⚠️ Text composite failed for a room line', pl.key, e);
                }
                ctx.restore();
            });
        }
    }

    // Paints ONE overlay with the ctx already translated and rotated to its
    // centre. Shared by the capture composite and the collider rasteriser, so
    // a wall can never drift from the letterforms it is meant to trace.
    //   collider -> the wall fillStyle (collisionLayers.wallStyle), no colour and no shadow: the obstacle pipeline
    //   reads ALPHA as wall coverage, and a soft shadow would smear the wall
    //   into a halo well outside the glyph.
    function paintOverlay(ctx, ov, collider) {
        var sp = ov.letterSpacing || 0;
        var text = displayText(ov);
        var lines = text.split('\n');
        // CSS white-space:pre lays out exactly ONE fewer line box when the
        // content ends in a newline (measured 2026-08-31: 'A\n' is one line,
        // 'A\n\n' is two, 'A\n\nB' is three). Match it, or the canvas box is
        // a line taller than the DOM and every glyph — the collider wall
        // included — lands lineHeight/2 above the text it should trace. A
        // trailing Enter in the panel textarea is all it takes to get here.
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
        // Truly empty content lays out ZERO line boxes in the DOM (no text
        // node at all; measured pad-only height), so its bg box is just the
        // padding — without this the canvas box was one phantom line taller.
        // Only for '' though: a lone '\n' DOES lay out one empty line box.
        if (text === '') lines = [];
        var lineH = ov.fontSize * (ov.lineHeight || 1.2);
        var pad = ov.bgEnabled ? (ov.padding || 0) : 0;

        ctx.font = (ov.fontStyle || 'normal') + ' ' + ov.fontWeight + ' ' + ov.fontSize + 'px ' + ov.fontFamily;
        if (NATIVE_LETTER_SPACING) ctx.letterSpacing = sp + 'px';
        ctx.textAlign = 'left';
        // Baseline, not 'middle'. Canvas 'middle' centres the EM SQUARE on the
        // given y; CSS centres the font's CONTENT BOX (ascent+descent, which
        // is taller than the em in most faces) in the line box. The gap is a
        // constant downward bias of the DOM text relative to the canvas one —
        // measured -4.3px at 60px Arial, and it scales with font size (~0.07em,
        // so ~11px at 150px). Placing the alphabetic baseline the way CSS does
        // removes it. Fallback to 'middle' where the metrics are unavailable.
        ctx.textBaseline = 'alphabetic';
        var halfDelta = 0;
        try {
            var fm = ctx.measureText('Hxg');
            if (fm && typeof fm.fontBoundingBoxAscent === 'number'
                   && typeof fm.fontBoundingBoxDescent === 'number') {
                halfDelta = (fm.fontBoundingBoxAscent - fm.fontBoundingBoxDescent) / 2;
            } else {
                ctx.textBaseline = 'middle';
            }
        } catch (_) { ctx.textBaseline = 'middle'; }

        var textW = 0;
        for (var L = 0; L < lines.length; L++) textW = Math.max(textW, measureLine(ctx, lines[L], sp));
        var boxW = textW + pad * 2;
        var boxH = lines.length * lineH + pad * 2;

        // The padding stays in the geometry either way (the glyphs sit where
        // they sit), but a box at ~zero opacity is not on screen and so must
        // not be a wall either — the letterforms still are.
        if (ov.bgEnabled && (!collider || ov.bgOpacity > 0.02)) {
            ctx.fillStyle = collider ? collider : hexToRgba(ov.bgColor, ov.bgOpacity);
            roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, ov.radius || 0);
            ctx.fill();
        }

        if (ov.shadow && !collider) {
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 1;
        }
        ctx.fillStyle = collider ? collider : ov.color;

        var align = ov.align || 'center';
        for (var n = 0; n < lines.length; n++) {
            var lw = measureLine(ctx, lines[n], sp);
            var lx = align === 'left' ? -boxW / 2 + pad
                : align === 'right' ? boxW / 2 - pad - lw
                : -lw / 2;
            // Half-leading: this is the LINE BOX CENTRE. CSS puts the baseline
            // (ascent-descent)/2 below it, which is what halfDelta carries.
            var ly = -boxH / 2 + pad + n * lineH + lineH / 2 + halfDelta;
            drawLine(ctx, lines[n], lx, ly, sp);
        }

        if (NATIVE_LETTER_SPACING) ctx.letterSpacing = '0px';
        // The unrotated box it laid out, in the ctx's own units — what a pour
        // sizes its bitmap from, so it never has to guess the text's extent.
        return { w: boxW, h: boxH };
    }

    // ===========================================================
    //  FLUIDIZE - the text becomes dye
    // ===========================================================
    // The Text panel's twin of Fluidize on a layer row (05m splatLayerToSim):
    // paint the overlay exactly as the capture composite does, at the dye's
    // own resolution, deposit it through the same image-splat path a poured
    // layer takes, then hide the overlay — the words are IN the fluid now,
    // and a flat copy left on top would hide the thing you asked for. Hidden
    // on the canvas only: the line stays selected, so the editor stays open
    // and Fluidize again pours again (a hidden line pours fine) — Gabriel
    // asked for exactly that, 2026-09-09. The eye in the list brings the
    // text itself back.
    //
    // Hide FIRST, pour two frames later. A collider overlay's wall IS its
    // letterforms, and the image splat refuses to deposit dye inside a wall
    // (05i hasObstacle) — poured with its own wall standing, nothing would
    // land. Hiding takes the wall out of the obstacle (isWallSource needs
    // visible), but the recomposite that follows is rAF-deferred
    // (23-depth-collision updateObstacleFromLayers → _doUpdateObstacle →
    // updateObstacleTexture, all inside that one frame), so a pour queued
    // behind it by two rAFs sees the wall-free texture. Every OTHER collider
    // keeps gating the pour, as it gates every dab. Should the sim then
    // refuse the image, the line is shown again: a hidden line with nothing
    // poured is the one outcome this button must never leave behind.
    //
    // `landed(ok)`, if given, hears how the pour went on the frame it lands
    // — a held hotkey starts its flow there, so strike and flow are one pour.
    function fluidize(id, landed) {
        if (typeof id === 'string') return fluidizeRoomLine(id, landed);
        var ov = findOverlay(id);
        if (!ov) return false;
        // A pour is paint: out of turn in a Swirl Together room it is refused
        // exactly like a stroke (05d's pointerdown gate), or it would land on
        // this canvas and on nobody else's.
        if (mpPaintBlocked()) return false;
        if (typeof window.__splatImageToDye !== 'function' || typeof window.__dyeTexSize !== 'function') {
            tell('The simulation is still starting', 'Give it a moment and try again.');
            return false;
        }
        if (!colliderGeom()) {
            tell('Could not fluidize that text', 'The canvas has no size yet. Try again in a moment.');
            return false;
        }
        var wasVisible = !!ov.visible;
        if (wasVisible) setVisible(ov, false);

        function pour() {
            var live = findOverlay(id);
            if (!live) { if (landed) landed(false); return; }   // deleted while we waited
            var ok = false;
            try {
                // Centred where the line is arranged: overlay fractions of
                // #canvas-area → CSS px of #canvas.
                var g = colliderGeom();
                ok = !!g && pourAt(live, live.x * g.areaW - g.offX, live.y * g.areaH - g.offY, g);
            } catch (e) {
                console.warn('⚠️ Text fluidize failed for overlay', id, e);
                ok = false;
            }
            if (landed) landed(ok);
            if (ok) return;
            // Put it back the way it was. Selection was never touched, so
            // the editor the click came from is still open.
            if (wasVisible && !live.visible) setVisible(live, true);
            tell('Could not fluidize that text', 'The simulation refused the image. Try again, or reload if it keeps happening.');
        }
        requestAnimationFrame(function () { requestAnimationFrame(pour); });
        return true;
    }

    // Pours one line centred on (cx, cy), in CSS px of #canvas — the shared
    // half of Fluidize and a hotkey's pour at the brush. The line becomes a
    // bitmap just big enough for it (makeStamp), placed on the dye by the
    // image splat's rect; only a shader build that cannot place one falls
    // back to painting the whole dye.
    function pourAt(ov, cx, cy, g) {
        var ok = false;
        if (!canStamp()) {
            ok = pourWhole(ov, cx, cy, g);
        } else {
            var ps = makeStamp(ov, g, cx, cy);
            if (!ps) return false;
            try { ok = pourStamp(ps, cx, cy, g, pourAmount()); }
            finally { ps.stamp.dispose(); }
        }
        if (ok) mpPoured(ov, cx, cy, g, pourAmount());
        return ok;
    }

    // The console tunable a poured layer reads too:
    // config.SPLAT_TO_FLUID_AMOUNT = 0.4 pours a fainter ghost.
    function pourAmount() {
        return (window.config && typeof window.config.SPLAT_TO_FLUID_AMOUNT === 'number')
            ? window.config.SPLAT_TO_FLUID_AMOUNT : 1;
    }

    function canStamp() {
        return typeof window.__dyeStamp === 'function' && !!(window.__splatImageToDye && window.__splatImageToDye.placesRects);
    }

    // A line as a pour-ready bitmap: its own box, rotated, plus a margin — a
    // glyph can overhang its advance box (italics, swashes) and the shadow
    // blurs past it — in dye texels, uploaded ONCE (05i __dyeStamp) so a
    // held key can pour it again and again. Same mapping as colliderDraw,
    // with the dye standing in for the obstacle: CSS px of #canvas → dye
    // texels; alpha is the on-screen opacity, as the composite paints it.
    //
    // (cx, cy), when given, is the spot this bitmap is FOR: the text is drawn
    // at that spot's sub-texel phase, so it rasterises exactly as it would on
    // a dye-sized canvas — canvas text snaps its baseline to whole pixels, and
    // the wrong phase moved a pour a full texel (measured). A held key reuses
    // one bitmap at every spot and is within half a texel instead.
    var measureCtx = null;
    function makeStamp(ov, g, cx, cy) {
        var dye = window.__dyeTexSize();
        if (!g || !dye || !(dye.w > 0) || !(dye.h > 0)) return null;
        var kx = dye.w / g.cssW, ky = dye.h / g.cssH;
        if (!measureCtx) {
            var one = document.createElement('canvas');
            one.width = one.height = 1;
            measureCtx = one.getContext('2d');
        }
        measureCtx.save();
        var box;
        try { box = paintOverlay(measureCtx, ov, false); } finally { measureCtx.restore(); }
        var m = (ov.fontSize || 48) + 12;
        var bw = box.w + 2 * m, bh = box.h + 2 * m;
        var rot = (ov.rotation || 0) * Math.PI / 180;
        var c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
        var W = Math.max(1, Math.min(dye.w * 2, Math.ceil((bw * c + bh * s) * kx) + 2));
        var H = Math.max(1, Math.min(dye.h * 2, Math.ceil((bw * s + bh * c) * ky) + 2));
        // Where the text's centre sits in the bitmap: the middle, nudged by
        // the target spot's fractional texel so placement (below) is exact.
        var ox = W / 2, oy = H / 2;
        if (typeof cx === 'number' && typeof cy === 'number') {
            var ax = cx * kx - ox, ay = cy * ky - oy;
            ox += ax - Math.floor(ax);
            oy += ay - Math.floor(ay);
        }
        var cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d');
        ctx.translate(ox, oy);
        ctx.scale(kx, ky);
        ctx.rotate(rot);
        ctx.globalAlpha = (typeof ov.opacity === 'number') ? ov.opacity : 1;
        paintOverlay(ctx, ov, false);
        var st = window.__dyeStamp(cv);
        return st ? { stamp: st, w: W, h: H, ox: ox, oy: oy, dw: dye.w, dh: dye.h } : null;
    }

    // Snapped to whole texels, so the bitmap's texels land exactly on the
    // dye's and a pour is a copy, not a resample. At the spot the bitmap was
    // built for that is exact; anywhere else the centre moves under half a
    // texel for it.
    function pourStamp(ps, cx, cy, g, amount) {
        var kx = ps.dw / g.cssW, ky = ps.dh / g.cssH;
        var x = Math.round(cx * kx - ps.ox), y = Math.round(cy * ky - ps.oy);
        return !!window.__splatImageToDye(ps.stamp, amount, { x: x, y: y, w: ps.w, h: ps.h });
    }

    // The pre-stamp path: the line painted into a dye-sized canvas at its
    // spot, poured at 1:1. One scratch canvas, reused. `amount` defaults to
    // the console tunable; a room's pour brings the painter's own.
    var pourCanvas = null, pourCtx = null;
    function pourWhole(ov, cx, cy, g, amount) {
        var dye = window.__dyeTexSize();
        if (!g || !dye || !(dye.w > 0) || !(dye.h > 0)) return false;
        if (!pourCanvas || pourCanvas.width !== dye.w || pourCanvas.height !== dye.h) {
            pourCanvas = document.createElement('canvas');
            pourCanvas.width = dye.w; pourCanvas.height = dye.h;
            pourCtx = pourCanvas.getContext('2d');
        }
        var ctx = pourCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, dye.w, dye.h);
        var kx = dye.w / g.cssW, ky = dye.h / g.cssH;
        ctx.save();
        try {
            ctx.translate(cx * kx, cy * ky);
            ctx.scale(kx, ky);
            ctx.rotate((ov.rotation || 0) * Math.PI / 180);
            ctx.globalAlpha = (typeof ov.opacity === 'number') ? ov.opacity : 1;
            paintOverlay(ctx, ov, false);
        } finally {
            ctx.restore();   // a reused context must not carry the shadow to the next pour
        }
        return !!window.__splatImageToDye(pourCanvas, (typeof amount === 'number') ? amount : pourAmount());
    }

    function tell(title, msg) {
        if (typeof window.appAlert === 'function') window.appAlert(title, msg);
        else alert(title + '\n\n' + msg);
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
    // Each overlay carries its own collider mode and strength (Text panel):
    // the glyphs are drawn with collisionLayers.wallStyle() at globalAlpha =
    // strength, exactly like a collision layer, and the per-texel strength
    // channel means a 0.3 wall still reads as a crisp letter, not a sponge.
    var colliderInstalled = false;

    // An overlay at ~zero opacity is not on screen, so it must not be a wall
    // either — the same principle (and threshold) the bg box already gets in
    // paintOverlay. Undefined opacity counts as visible.
    function isWallSource(ov) {
        return ov.visible && ov.collider && !(ov.opacity <= 0.02);
    }

    function anyCollider() {
        for (var i = 0; i < overlays.length; i++) {
            if (isWallSource(overlays[i])) return true;
        }
        return anyPeerWall();
    }

    function anyPeerWall() {
        var any = false;
        peerLines.forEach(function (pl) { if (!any && isWallSource(pl)) any = true; });
        return any;
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

    // Scratch for one overlay's glyphs. Colour-emoji fonts ignore fillStyle
    // and paint their own colours, so drawing straight into the obstacle
    // canvas gave an emoji the wrong wall encoding (its red became strength,
    // its blue became "Slow"). Rasterise the glyphs here first, then keep
    // only their ALPHA under the wall colour (source-in) — every glyph,
    // emoji included, reaches the obstacle as the same solid wall.
    var wallScratch = null, wallScratchCtx = null;
    function wallScratchFor(w, h) {
        if (!wallScratch || wallScratch.width !== w || wallScratch.height !== h) {
            wallScratch = document.createElement('canvas');
            wallScratch.width = w; wallScratch.height = h;
            wallScratchCtx = wallScratch.getContext('2d');
        }
        return wallScratchCtx;
    }

    function colliderDraw(ctx, obsW, obsH) {
        // Mid-edit: the wall is deliberately absent until the edit settles.
        // lastRasterSig stays null so nothing mistakes this for a current wall.
        if (wallSuppressed) { lastRasterSig = null; return; }
        var g = colliderGeom();
        if (!g) { lastRasterSig = null; return; }
        var kx = obsW / g.cssW, ky = obsH / g.cssH;
        var anyFailed = false;

        for (var i = 0; i < overlays.length; i++) {
            var ov = overlays[i];
            if (!isWallSource(ov)) continue;
            // kx and ky differ only by the integer rounding of the sim texture
            // dimensions (well under 0.1%), so scaling ahead of the rotation
            // costs no visible shear and keeps the layout maths in CSS px.
            if (!drawWall(ctx, obsW, obsH, ov,
                    (ov.x * g.areaW - g.offX) * kx, (ov.y * g.areaH - g.offY) * ky, kx, ky)) anyFailed = true;
        }
        // A room's lines: placed at their fraction of the canvas, set in the
        // painter's CSS px and stretched per axis onto this obstacle — the
        // same mapping their strokes and pours get, so the wall stays under
        // the words wherever the painter's window differs from this one.
        peerLines.forEach(function (pl) {
            if (!isWallSource(pl)) return;
            if (!drawWall(ctx, obsW, obsH, pl, pl.cx * obsW, pl.cy * obsH, obsW / pl.cw, obsH / pl.ch)) anyFailed = true;
        });
        // Remember exactly what this rasterise was based on, so the watchdog
        // below can tell whether the wall on the GPU is still current. The sig
        // is recorded even when an overlay failed (a deterministic throw must
        // not spin the watchdog at 5Hz), but a failed pass does NOT mark the
        // obstacle as drawn-into — so the next FBO rebuild retries a throw
        // that turned out to be transient.
        lastRasterSig = colliderSig();
        var ob = liveObstacle();
        if (ob && rasteredObstacles && !anyFailed) rasteredObstacles.add(ob);
    }

    // One line's glyphs onto the obstacle: centred at (tx, ty) in obstacle
    // texels, kx/ky obstacle texels per CSS px of the line's own layout.
    // False if it threw.
    function drawWall(ctx, obsW, obsH, ov, tx, ty, kx, ky) {
        var ok = true;
        ctx.save();
        try {
            var cl = window.collisionLayers;
            var wallS = (typeof ov.colliderStrength === 'number') ? ov.colliderStrength : 1;
            var style = (cl && cl.wallStyle) ? cl.wallStyle(ov.colliderMode, wallS) : '#ffffff';
            var sc = wallScratchFor(obsW, obsH);
            sc.save();
            sc.globalCompositeOperation = 'source-over';
            sc.globalAlpha = 1;
            sc.clearRect(0, 0, obsW, obsH);
            sc.translate(tx, ty);
            sc.scale(kx, ky);
            sc.rotate((ov.rotation || 0) * Math.PI / 180);
            paintOverlay(sc, ov, '#ffffff');
            sc.restore();
            // Alpha mask → wall colour (mode + strength bytes), then onto
            // the obstacle canvas at globalAlpha = strength, exactly what
            // a collision layer writes (collisionLayers.wallBytes).
            sc.globalCompositeOperation = 'source-in';
            sc.fillStyle = style;
            sc.fillRect(0, 0, obsW, obsH);
            sc.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = Math.max(0, Math.min(1, wallS));
            ctx.drawImage(wallScratch, 0, 0);
        } catch (e) {
            // One bad overlay must not take down the other walls — and a
            // silent throw here would strand lastRasterSig, leaving the
            // watchdog re-rasterising at 5Hz forever with nothing to show.
            console.warn('⚠️ Text collider raster failed for overlay', ov.id != null ? ov.id : ov.key, e);
            ok = false;
        }
        ctx.restore();
        return ok;
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
            if (!isWallSource(o)) continue;
            // Every field paintOverlay reads. Miss one and that property's
            // changes stop resyncing, which is the bug class this guards.
            parts.push(o.id, o.x.toFixed(5), o.y.toFixed(5), o.rotation || 0,
                o.content, o.textCase, o.fontFamily, o.fontSize, o.fontWeight,
                o.fontStyle, o.letterSpacing, o.lineHeight, o.align,
                o.bgEnabled ? 1 : 0, o.bgOpacity, o.padding, o.radius,
                o.colliderMode, o.colliderStrength);
        }
        // A room's walls: the painter's rev covers every field their wall
        // was set from, and the placement rides beside it.
        peerLines.forEach(function (pl) {
            if (!isWallSource(pl)) return;
            parts.push(pl.key, pl.rev, pl.cx, pl.cy, pl.cw, pl.ch);
        });
        return parts.join('\u0001');
    }

    var watchdogWarned = false;
    function startWatchdog() {
        if (watchdogTimer) return;
        watchdogWarned = false;   // a fresh install deserves a fresh warning budget
        watchdogTimer = setInterval(function () {
            // The tick is guarded because an uncaught throw inside setInterval
            // doesn't stop the interval — it just skips the rest of THIS tick,
            // every tick, which is a wall silently frozen while the DOM text
            // keeps moving.
            try {
                if (!colliderInstalled) { stopWatchdog(); return; }
                // A rebuild is already parked behind the settle timer. The
                // signature necessarily differs mid-edit, so "healing" it
                // here would rebuild on every tick and defeat the coalescing.
                if (settlePending()) return;
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
            } catch (e) {
                if (!watchdogWarned) {
                    watchdogWarned = true;
                    console.warn('⚠️ Text collider watchdog error (reported once):', e);
                }
            }
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
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        wallSuppressed = false;
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

    // ── Coalescing a STREAM of edits ────────────────────────────
    // Typing, dragging a corner handle and dragging the window edge all
    // produce a change per keystroke or per frame, and rebuilding the wall on
    // each one carves the dye field at every intermediate shape. Those voids
    // outlive the edit — dye refills slowly — so a resize drag left the union
    // of ~30 sizes standing on the canvas: interleaved ghost letterforms that
    // read as corrupted text (measured 2026-08-31, 40px→150px over 1.2s).
    //
    // A stream therefore parks the rebuild until it stops. The wall standing
    // DURING the drag is the last settled one: it lags, which is the right
    // trade — one stale shape beats thirty smeared ones, and the moment the
    // edit ends the wall is rebuilt to match.
    //
    // That rebuild is a full wipe by construction, not an incremental patch:
    // _doUpdateObstacle clears its compose canvas, redraws every source and
    // uploads the WHOLE texture (23-depth-collision.js), so no texel of the
    // previous wall can survive it.
    var SETTLE_MS = 160;
    var settleTimer = null;
    var wallSuppressed = false;

    function syncCollidersSoon() {
        // FIRST edit of a burst: take the old wall down right away. Leaving it
        // up means a wall built for the old text sits under text that is still
        // changing — dragging Line Height 1.2→3.0 left a 115px wall under
        // 247px of glyphs for the whole drag, then snapped (measured
        // 2026-08-31). An absent wall for the length of an edit is honest;
        // a wrong one is not.
        if (!settleTimer && colliderInstalled && !wallSuppressed) {
            wallSuppressed = true;
            var cl = window.collisionLayers;
            if (cl && typeof cl.updateObstacleFromLayers === 'function') {
                cl.updateObstacleFromLayers();
            }
        }
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
            settleTimer = null;
            wallSuppressed = false;
            syncColliders();
        }, SETTLE_MS);
    }

    function settlePending() { return settleTimer !== null; }

    // Layout can change with no window resize at all — the canvas resize
    // handles, a sidebar or drawer opening, focus mode, mobile mode. A
    // ResizeObserver catches every one of those, and keeps firing THROUGHOUT a
    // drag or a CSS transition rather than once at the start.
    function watchLayout() {
        if (typeof ResizeObserver !== 'function') return;
        var ro = new ResizeObserver(function () {
            if (colliderInstalled) syncCollidersSoon();
            // A room's lines stand at fractions of the CANVAS, and so do the
            // positions ours are sent at — both move when the canvas moves
            // inside the area (borders on, a resize handle dragged).
            layoutPeerLines();
            mpTextChanged();
        });
        ['canvas-area', 'canvas-wrapper', 'canvas'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { try { ro.observe(el); } catch (_) {} }
        });
        // A family picked from the font menu may still be loading when the wall
        // is first measured, which would bake the fallback face's metrics in.
        if (document.fonts && document.fonts.addEventListener) {
            try {
                document.fonts.addEventListener('loadingdone', function () {
                    if (colliderInstalled) syncCollidersSoon();
                });
            } catch (_) {}
        }
    }

    // Restored overlays can beat 23-depth-collision to the DOM, and a wall
    // that silently never installed is indistinguishable from a broken one.
    // No retry cap: a slow boot that outlived the old 2-second window left a
    // restored collider with no wall and no watchdog, permanently. Poll fast
    // for the first 2s, then settle to 1Hz until the module shows up.
    function syncCollidersWhenReady(tries) {
        if (window.collisionLayers && typeof window.collisionLayers.setProcedural === 'function') {
            syncColliders();
            return;
        }
        var n = (tries || 0) + 1;
        setTimeout(function () { syncCollidersWhenReady(n); }, n < 20 ? 100 : 1000);
    }

    // ===========================================================
    //  HOTKEYS - a key that fires a line from anywhere
    // ===========================================================
    // `hotkey` is a js/48-hotkeys.js combo ('KeyQ', 'Shift+Digit9'; '' is
    // none). `hotkeyAction` says what the press does: 'pour' drops the whole
    // block into the fluid, every press pours again and a held key keeps
    // pouring (see "Holding the key" below), and 'toggle' shows and hides
    // the line. `hotkeyAt` says where a pour lands: 'brush' — centred
    // on the brush, wherever it is when the key goes down, like a stamp the
    // shape of the text — or 'arranged', where the line sits on the canvas,
    // which is Fluidize exactly. All three are kept OUT of DEFAULTS on
    // purpose: DEFAULTS is the look a new line inherits (+ Add Text carries
    // the last one over), and a key is not a look.
    //
    // Hotkeys.js asks for this module's bindings on every press (the source
    // registered below), so a deleted line, Clear All or a preset load can
    // never leave a key firing at nothing.
    var HOTKEY_ACTIONS = { pour: 1, toggle: 1 };

    function hotkeyOf(v) {
        if (!v) return '';
        var H = window.Hotkeys;
        return (H && typeof H.normalize === 'function') ? H.normalize(String(v)) : String(v);
    }

    function hotkeyActionOf(v) { return HOTKEY_ACTIONS[v] ? v : 'pour'; }

    function hotkeyAtOf(v) { return v === 'arranged' ? 'arranged' : 'brush'; }

    function hotkeyHolder(combo) {
        if (!combo) return null;
        for (var i = 0; i < overlays.length; i++) {
            if (overlays[i].hotkey === combo) return overlays[i];
        }
        return null;
    }

    // The key fields change nothing on screen, so they skip update()'s
    // re-render and — the part that matters — its collider resync, which
    // takes a text wall down for the settle window and carves the dye again
    // when it comes back.
    function setHotkey(id, props) {
        if (typeof id === 'string') return null;   // a key on someone else's line is not ours to bind
        var ov = findOverlay(id);
        if (!ov || !props) return null;
        if (props.hasOwnProperty('hotkey')) ov.hotkey = hotkeyOf(props.hotkey);
        if (props.hasOwnProperty('hotkeyAction')) ov.hotkeyAction = hotkeyActionOf(props.hotkeyAction);
        if (props.hasOwnProperty('hotkeyAt')) ov.hotkeyAt = hotkeyAtOf(props.hotkeyAt);
        save(); emitChange();
        return ov;
    }

    // Toggle goes through setVisible, not toggleOverlay: that one drops the
    // selection on hide, so a key pressed with the line open in the editor
    // would fold the editor shut, and the sidebar would jump on every press.
    // A pour tells `landed(ok)` once it is down: at once at the brush, two
    // frames on where the line is arranged (fluidize's wait).
    function triggerHotkey(id, landed) {
        var ov = findOverlay(id);
        if (!ov) return false;
        if (ov.hotkeyAction === 'toggle') { setVisible(ov, !ov.visible); return true; }
        if (ov.hotkeyAt === 'arranged') return fluidize(id, landed);
        var ok = pourAtBrush(ov);
        if (landed) landed(ok);
        return ok;
    }

    // A pour at the brush, in the line's own font, size, colour and angle.
    // Unlike Fluidize the line is left alone: here it is the stamp, not the
    // thing being poured, and printing a copy somewhere else must not make
    // the original vanish. With nothing hidden there is no wall to wait out
    // either, so it lands on the press, not two frames later. Until the
    // pointer has been over the canvas there is no brush spot, and the pour
    // lands where the line is arranged.
    function pourAtBrush(ov) {
        if (typeof window.__splatImageToDye !== 'function' || typeof window.__dyeTexSize !== 'function') {
            tell('The simulation is still starting', 'Give it a moment and try again.');
            return false;
        }
        var g = colliderGeom();
        if (!g) return false;
        var p = brushSpot(g) || arrangedSpot(ov, g);
        try { return pourAt(ov, p.x, p.y, g); }
        catch (e) { console.warn('⚠️ Text pour at the brush failed for overlay', ov.id, e); return false; }
    }

    // The brush, in CSS px of #canvas. 05d keeps window.__cursorPos (canvas
    // px) current on every pointer move over the canvas — hovering too, and
    // the Pen Input Window's pen — so this is where the ring is, or last was.
    function brushSpot(g) {
        var p = window.__cursorPos, cv = document.getElementById('canvas');
        if (!p || !p.at || !cv || !cv.width || !cv.height) return null;
        return { x: p.x / cv.width * g.cssW, y: p.y / cv.height * g.cssH };
    }

    // Where the line is arranged, in CSS px of #canvas.
    function arrangedSpot(ov, g) {
        return { x: ov.x * g.areaW - g.offX, y: ov.y * g.areaH - g.offY };
    }

    // Where the line's key pours it right now, in CSS px of #canvas.
    function pourSpot(ov, g) {
        return (ov.hotkeyAt === 'arranged') ? arrangedSpot(ov, g) : (brushSpot(g) || arrangedSpot(ov, g));
    }

    // ── Holding the key: a constant pour ────────────────────────
    // The press prints the line (the strike), and from that moment the line
    // keeps pouring until the key comes up, on the Constant-flow brush's own
    // rhythm, not the OS key repeat's: its Interval
    // (config.BRUSH_DAB_INTERVAL_MS) on the SIMULATED clock, each pour
    // carrying the brush's per-dab share of the reference dye
    // (BRUSH_DAB_RATE_REF / rate, never above full, 05j). So a held line lays
    // paint at the rate a held brush does at any Interval, the Time slider
    // meters it, and a paused sim takes none. At the brush it follows the
    // hand, the pours spread along the path moved since the last one — the
    // strike's spot, to begin with — the way the hose spreads its dabs, so a
    // held key paints with the text; arranged, the line is a fountain at its
    // own spot. One upload per hold: every pour reuses the stamp.
    //
    // The flow starts with the strike, not after a wait. It used to wait
    // 200ms so that a tap stayed one strike, and in moving fluid the wait
    // showed: the strike drifted off and dissolved before the flow came in,
    // so a held key read as print, gone, print again ("it shows hides then
    // holds", Gabriel 2026-09-15; by dye readback in a steady current, all
    // of the strike's letters had left the brush by 200ms). The brush has no
    // wait either. A tap is now what a click on the hose is: a short pour.
    var HOLD_POURS_PER_FRAME = 8;     // spike guard, the text twin of BRUSH_DAB_BUDGET
    var holds = {};                   // overlay id → { sim, credit, ps, last, flowing }
    var holdRaf = 0;

    function pressHotkey(id) {
        var ov = findOverlay(id);
        if (!ov) return;
        endHold(id);
        if (ov.hotkeyAction === 'toggle') { triggerHotkey(id); return; }   // nothing to keep doing
        if (mpPaintBlocked()) return;                        // someone else's turn: no strike, no flow
        var h = holds[id] = { sim: null, credit: 0, ps: null, last: null, flowing: false };
        // The flow picks up where and when the strike lands; a strike that
        // fails takes its flow with it.
        function landed(ok) {
            if (holds[id] !== h) return;                     // already let go
            var live = findOverlay(id), g = colliderGeom();
            if (!ok || !live || !g) { endHold(id); return; }
            h.last = pourSpot(live, g);
            h.sim = window.__simTimeMs;
            h.flowing = true;
        }
        if (!triggerHotkey(id, landed)) { endHold(id); return; }
        if (holds[id] === h && !holdRaf) holdRaf = requestAnimationFrame(holdTick);
    }

    function endHold(id) {
        var h = holds[id];
        if (!h) return;
        delete holds[id];
        if (h.ps) { try { h.ps.stamp.dispose(); } catch (_) {} }
    }

    function holdTick() {
        holdRaf = 0;
        var ids = Object.keys(holds);
        if (!ids.length) return;
        var simNow = window.__simTimeMs;
        // 01-config's flag, shared by every classic script. __simTimeMs keeps
        // counting through a pause (05j), so the pause has to be asked.
        var paused = (typeof isPaused !== 'undefined') && !!isPaused;
        var cfg = window.config || {};
        var ivl = (typeof cfg.BRUSH_DAB_INTERVAL_MS === 'number' && cfg.BRUSH_DAB_INTERVAL_MS > 0) ? cfg.BRUSH_DAB_INTERVAL_MS : 8;
        var rate = 1000 / ivl;
        var rateRef = (typeof cfg.BRUSH_DAB_RATE_REF === 'number' && cfg.BRUSH_DAB_RATE_REF > 0) ? cfg.BRUSH_DAB_RATE_REF : 62.5;
        var amount = pourAmount() * Math.min(1, rateRef / rate);
        var g = colliderGeom();
        var dye = window.__dyeTexSize ? window.__dyeTexSize() : null;
        // The brush left us mid-hold (the clock ran out, the call was spent,
        // a host skip): the flow stops where a stroke would have been cut.
        var blocked = !!window.__mpTurnBlocked;
        ids.forEach(function (key) {
            var h = holds[key];
            var ov = findOverlay(+key);
            if (!ov || ov.hotkeyAction === 'toggle' || blocked) { endHold(key); return; }
            var dt = (typeof simNow === 'number' && typeof h.sim === 'number') ? Math.max(0, simNow - h.sim) : 0;
            h.sim = simNow;
            // The strike not down yet, or nothing to pour into: no flow, and
            // no credit piling up to arrive all at once later.
            if (!h.flowing || paused || !g || !dye || !canStamp()) return;
            h.credit += rate * dt / 1000;
            var n = Math.floor(h.credit);
            h.credit -= n;
            if (n > HOLD_POURS_PER_FRAME) n = HOLD_POURS_PER_FRAME;
            if (n <= 0) return;
            // Rebuilt when the dye resolution moves under the hold, or a pour
            // would land at the old texel size.
            if (!h.ps || h.ps.dw !== dye.w || h.ps.dh !== dye.h) {
                if (h.ps) { try { h.ps.stamp.dispose(); } catch (_) {} }
                h.ps = makeStamp(ov, g);
                if (!h.ps) return;
            }
            var spot = pourSpot(ov, g);
            var from = h.last || spot;
            try {
                for (var i = 1; i <= n; i++) {
                    var t = i / n;
                    var px = from.x + (spot.x - from.x) * t, py = from.y + (spot.y - from.y) * t;
                    if (pourStamp(h.ps, px, py, g, amount)) mpPoured(ov, px, py, g, amount);
                }
            } catch (e) {
                console.warn('⚠️ Text held pour failed for overlay', ov.id, e);
                endHold(key);
                return;
            }
            h.last = spot;
        });
        if (Object.keys(holds).length) holdRaf = requestAnimationFrame(holdTick);
    }

    // How a binding names its line in messages ("Q is on “Hello”").
    function hotkeyLabel(ov) {
        var first = String(ov.content || '').split('\n')[0].trim();
        if (!first) return 'an empty line of text';
        if (first.length > 24) first = first.slice(0, 23) + '…';
        return '“' + first + '”';
    }

    function registerHotkeys() {
        var H = window.Hotkeys;
        if (!H || typeof H.addSource !== 'function') return;
        H.addSource('text', function () {
            var out = [];
            overlays.forEach(function (ov) {
                if (!ov.hotkey) return;
                var id = ov.id;
                out.push({
                    id: 'text:' + id,
                    combo: ov.hotkey,
                    label: hotkeyLabel(ov),
                    does: ov.hotkeyAction === 'toggle' ? 'shows and hides'
                        : ov.hotkeyAt === 'arranged' ? 'pours where it is arranged' : 'pours at the brush',
                    run: function () { pressHotkey(id); },
                    release: function () { endHold(id); },
                    set: function (combo) { setHotkey(id, { hotkey: combo }); },
                    clear: function () { setHotkey(id, { hotkey: '' }); }
                });
            });
            return out;
        });
    }

    // ===========================================================
    //  SWIRL TOGETHER - text in a shared room (js/06d text wire)
    // ===========================================================
    // In a room, text is two things everyone needs: LINES standing on the
    // canvas (a wall, when the line is a collider) and POURS — a line poured
    // into the dye by Fluidize, a hotkey's strike, or a held key's flow.
    // 06d carries both; this is where they are set in type.
    //
    // A line travels as its look plus where it stands, never as a bitmap:
    // a few hundred bytes per edit where a picture of it would be tens of KB.
    // Where it stands is a fraction of the painter's CANVAS, and its type is
    // in the painter's CSS px beside their canvas size, so this side stretches
    // it per axis exactly as it stretches their strokes — words and the paint
    // around them stay in register between windows of different shapes. The
    // face is this machine's: a family it lacks falls back, the same words in
    // another face.
    //
    // Everything a peer sends is untrusted, so every field goes through
    // cleanLook before it can reach the DOM, a canvas, or the obstacle.
    var LOOK_KEYS = ['content', 'textCase', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
        'letterSpacing', 'lineHeight', 'align', 'color', 'opacity', 'shadow',
        'bgEnabled', 'bgColor', 'bgOpacity', 'padding', 'radius', 'rotation'];
    var TEXT_WIRE_MAX = 2000;       // characters of one line a room carries
    var PEER_LINES_PER_OWNER = 64;  // a room is 8 people; this is plenty and bounds a flood
    var PEER_STAMPS_MAX = 12;       // pour bitmaps kept on the GPU, oldest dropped first

    // Out of turn, a pour is refused like a stroke (05d pointerdown), with
    // the same "it's their turn" hint.
    function mpPaintBlocked() {
        if (!window.__mpTurnBlocked) return false;
        if (typeof window.__mpTurnHint === 'function') window.__mpTurnHint();
        return true;
    }

    function round(v, k) { return Math.round(v * k) / k; }

    // This line's look as it goes on the wire. Every field paintOverlay and
    // makeStamp read, in a fixed order (06d batches pours by its JSON).
    function wireLook(ov) {
        var o = {};
        for (var i = 0; i < LOOK_KEYS.length; i++) {
            var k = LOOK_KEYS[i], v = ov[k];
            if (v === undefined) continue;
            o[k] = (typeof v === 'number') ? round(v, 1000) : v;
        }
        o.content = String(ov.content || '').slice(0, TEXT_WIRE_MAX);
        return o;
    }

    // Every visible line of ours, placed for the wire; null when there is no
    // layout to measure against (then 06d says nothing, rather than telling
    // the room all our lines are gone).
    function wireLines() {
        var g = colliderGeom();
        if (!g) return null;
        var cw = round(g.cssW, 2), ch = round(g.cssH, 2);
        var out = [];
        for (var i = 0; i < overlays.length; i++) {
            var ov = overlays[i];
            if (!ov.visible) continue;
            var line = wireLook(ov);
            line.cx = round((ov.x * g.areaW - g.offX) / g.cssW, 1e5);
            line.cy = round((ov.y * g.areaH - g.offY) / g.cssH, 1e5);
            line.cw = cw; line.ch = ch;
            if (ov.collider) {
                line.col = 1;
                line.cm = ov.colliderMode || 'deflect';
                line.cs = (typeof ov.colliderStrength === 'number') ? round(ov.colliderStrength, 1000) : 1;
            }
            out.push({ id: ov.id, line: line });
        }
        return out;
    }

    // One pour of ours, told to the room: the line's look, this canvas's CSS
    // size, and the pour's centre as a fraction of it.
    function mpPoured(ov, cx, cy, g, amount) {
        if (typeof window.__mpTextPour !== 'function' || !g || !(g.cssW > 0) || !(g.cssH > 0)) return;
        try {
            window.__mpTextPour(wireLook(ov), round(g.cssW, 2), round(g.cssH, 2),
                cx / g.cssW, cy / g.cssH, amount);
        } catch (_) {}
    }

    function num(v, lo, hi, d) {
        return (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
    }
    function pick(v, set, d) { return set.indexOf(v) >= 0 ? v : d; }
    function hexColour(v, d) {
        return (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) ? v : d;
    }
    // A font list is only ever assigned through CSSOM and ctx.font, which
    // parse it as a family list and drop anything else — but it is also the
    // one free-text field that reaches both, so the obvious breakouts are
    // refused outright.
    function familyOk(v) {
        if (typeof v !== 'string' || !v.length || v.length > 300) return false;
        if (/[;{}<>]/.test(v) || v.indexOf(String.fromCharCode(92)) >= 0) return false;
        for (var i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32) return false;
        return true;
    }
    var WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'];

    // A peer's look → a line paintOverlay can set. Ranges are the Text
    // panel's own, widened a little for older or newer builds.
    function cleanLook(src) {
        src = src || {};
        return {
            content: (typeof src.content === 'string') ? src.content.slice(0, TEXT_WIRE_MAX) : '',
            textCase: pick(src.textCase, ['none', 'upper', 'lower', 'title'], 'none'),
            fontFamily: familyOk(src.fontFamily) ? src.fontFamily : DEFAULTS.fontFamily,
            fontSize: num(src.fontSize, 6, 400, DEFAULTS.fontSize),
            fontWeight: pick(String(src.fontWeight), WEIGHTS, DEFAULTS.fontWeight),
            fontStyle: pick(src.fontStyle, ['normal', 'italic', 'oblique'], 'normal'),
            letterSpacing: num(src.letterSpacing, -50, 200, 0),
            lineHeight: num(src.lineHeight, 0.3, 6, DEFAULTS.lineHeight),
            align: pick(src.align, ['left', 'center', 'right'], 'center'),
            color: hexColour(src.color, DEFAULTS.color),
            opacity: num(src.opacity, 0, 1, 1),
            shadow: !!src.shadow,
            bgEnabled: !!src.bgEnabled,
            bgColor: hexColour(src.bgColor, DEFAULTS.bgColor),
            bgOpacity: num(src.bgOpacity, 0, 1, DEFAULTS.bgOpacity),
            padding: num(src.padding, 0, 200, DEFAULTS.padding),
            radius: num(src.radius, 0, 200, DEFAULTS.radius),
            rotation: num(src.rotation, -36000, 36000, 0)
        };
    }

    // ── The room's lines ───────────────────────────────────────
    // Upsert one (06d text-line). Same rev as the one standing: nothing to
    // do — a painter re-sends every line when the brush comes back to them.
    function putPeerLine(owner, id, d) {
        if (typeof owner !== 'string' || !owner || id == null || !d || typeof d !== 'object') return;
        var key = owner + '|' + String(id).slice(0, 24);
        var prev = peerLines.get(key) || null;
        var rev = (typeof d.rev === 'string') ? d.rev.slice(0, 40) : '';
        if (prev && rev && prev.rev === rev) return;
        var cw = num(d.cw, 20, 20000, 0), ch = num(d.ch, 20, 20000, 0);
        if (!cw || !ch) return;
        if (!prev) {
            var mine = 0;
            peerLines.forEach(function (pl) { if (pl.owner === owner) mine++; });
            if (mine >= PEER_LINES_PER_OWNER) return;
        }
        var line = cleanLook(d);
        line.key = key;
        line.id = key;                // the id the panel and arrange mode use for it
        line.room = true;
        line.owner = owner;
        line.theirId = String(id).slice(0, 24);   // the author's own id for it
        line.rev = rev;
        line.visible = true;          // only visible lines are ever sent
        line.cx = num(d.cx, -1, 2, 0.5);
        line.cy = num(d.cy, -1, 2, 0.5);
        line.cw = cw;
        line.ch = ch;
        line.collider = !!d.col;
        var modes = (window.collisionLayers && window.collisionLayers.MODES) || ['block', 'deflect', 'slow'];
        line.colliderMode = pick(d.cm, modes, 'deflect');
        line.colliderStrength = num(d.cs, 0, 1, 1);
        if (prev && prev.el) prev.el.remove();
        peerLines.set(key, line);
        renderPeerLine(line);
        // The room's version of a line wins over a tweak of ours that is
        // still waiting for our turn (see mpRoomEdit).
        if (typeof window.__mpRoomLineSettled === 'function') {
            try { window.__mpRoomLineSettled(key); } catch (_) {}
        }
        // A new wall lands at once. An edited one takes the same settle as a
        // local edit: a painter typing sends a line every ~120ms, and
        // rebuilding on each would carve every intermediate shape into this
        // canvas's dye — the wall comes down for the burst and is rebuilt
        // once when it stops.
        if (prev && isWallSource(prev)) syncCollidersSoon();
        else if (isWallSource(line)) syncColliders();
        if (arranging) drawArrange();
        emitChange();   // the panel lists the room's lines too
    }

    // The room took a line away (its author hid it, someone removed it):
    // any tweak of ours still waiting for our turn is moot with it.
    function removePeerLine(owner, id) {
        if (typeof owner !== 'string' || id == null) return;
        var key = owner + '|' + String(id).slice(0, 24);
        if (!peerLines.has(key)) return;
        if (typeof window.__mpRoomLineSettled === 'function') {
            try { window.__mpRoomLineSettled(key); } catch (_) {}
        }
        dropRoomLine(key);
    }

    function dropRoomLine(key) {
        var pl = peerLines.get(key);
        if (!pl) return;
        peerLines.delete(key);
        if (pl.el) pl.el.remove();
        if (selectedId === key) selectedId = null;
        // At once, not settled: Fluidize hides a line two frames before it
        // pours, and the pour must not meet the line's own wall here.
        if (isWallSource(pl)) syncColliders();
        if (arranging) drawArrange();
        emitChange();
    }

    // One painter's lines (they left), or every room line (we left).
    function dropPeerLines(owner) {
        var hadWall = false, had = false;
        peerLines.forEach(function (pl, key) {
            if (owner && pl.owner !== owner) return;
            if (pl.el) pl.el.remove();
            if (isWallSource(pl)) hadWall = true;
            if (selectedId === key) selectedId = null;
            peerLines.delete(key);
            had = true;
        });
        if (hadWall) syncColliders();
        if (had) { if (arranging) drawArrange(); emitChange(); }
    }

    function renderPeerLine(pl) {
        if (pl.el) { pl.el.remove(); pl.el = null; }
        if (!container) return;
        var el = document.createElement('div');
        el.dataset.peerLine = pl.key;
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.transformOrigin = 'center center';
        el.style.zIndex = '51';
        styleTextEl(el, pl);
        pl.el = el;
        placePeerLine(pl, null);
        container.appendChild(el);
    }

    function renderPeerLines() {
        peerLines.forEach(function (pl) { renderPeerLine(pl); });
    }

    // Its canvas fraction → this area's fraction, and the painter's canvas
    // size → a per-axis stretch. CSS applies transforms right to left, so
    // the text is rotated in its own space and then stretched, exactly as
    // the wall and a pour are (ctx.scale, then ctx.rotate).
    function placePeerLine(pl, g) {
        var el = pl.el;
        if (!el) return;
        g = g || colliderGeom();
        if (!g) { el.style.visibility = 'hidden'; return; }
        el.style.visibility = '';
        // x/y (fractions of the area) kept beside cx/cy: Duplicate copies a
        // room line into one of this user's own, which lives in area terms.
        pl.x = (g.offX + pl.cx * g.cssW) / g.areaW;
        pl.y = (g.offY + pl.cy * g.cssH) / g.areaH;
        el.style.left = (pl.x * 100) + '%';
        el.style.top = (pl.y * 100) + '%';
        el.style.transform = 'translate(-50%,-50%) scale(' + (g.cssW / pl.cw).toFixed(4) + ',' +
            (g.cssH / pl.ch).toFixed(4) + ') rotate(' + (pl.rotation || 0) + 'deg)';
    }

    function layoutPeerLines() {
        if (!peerLines.size) return;
        var g = colliderGeom();
        peerLines.forEach(function (pl) { placePeerLine(pl, g); });
    }

    // ── Editing the room's lines ───────────────────────────────
    // Someone else's line is editable here like one of this user's own —
    // the Text panel lists it under "In the room", arrange mode moves it —
    // and the edit goes back to its author and on to everyone (06d). The
    // line stays the author's: they own it, it is saved on their machine
    // only, and it leaves with them. Out of turn the tweak shows here and
    // waits for the brush, and if the author changes the line first, their
    // version wins (putPeerLine settles it).

    // A room line as the wire carries it: its look, where it stands, and
    // its wall — the same shape a line of our own is sent in.
    function roomWire(pl) {
        var line = wireLook(pl);
        line.cx = round(pl.cx, 1e5);
        line.cy = round(pl.cy, 1e5);
        line.cw = pl.cw;
        line.ch = pl.ch;
        if (pl.collider) {
            line.col = 1;
            line.cm = pl.colliderMode || 'deflect';
            line.cs = round(typeof pl.colliderStrength === 'number' ? pl.colliderStrength : 1, 1000);
        }
        return line;
    }

    function mpRoomEdit(pl) {
        if (typeof window.__mpRoomLineEdit !== 'function') return;
        try { window.__mpRoomLineEdit(pl.owner, pl.theirId, pl.key, roomWire(pl)); } catch (_) {}
    }

    // The Text panel's commit on a room line (and snapTo): look fields,
    // the wall fields, and a move given in area terms.
    function updateRoomLine(key, props) {
        var pl = peerLines.get(key);
        if (!pl || !props) return null;
        var wasWall = isWallSource(pl);
        var merged = {};
        for (var i = 0; i < LOOK_KEYS.length; i++) {
            var k = LOOK_KEYS[i];
            merged[k] = (props[k] !== undefined) ? props[k] : pl[k];
        }
        var look = cleanLook(merged);
        for (var lk in look) if (look.hasOwnProperty(lk)) pl[lk] = look[lk];
        if (props.collider !== undefined) pl.collider = !!props.collider;
        var modes = (window.collisionLayers && window.collisionLayers.MODES) || ['block', 'deflect', 'slow'];
        if (props.colliderMode !== undefined) pl.colliderMode = pick(props.colliderMode, modes, pl.colliderMode);
        if (props.colliderStrength !== undefined) pl.colliderStrength = num(props.colliderStrength, 0, 1, pl.colliderStrength);
        if (typeof props.x === 'number' && typeof props.y === 'number') {
            var g = colliderGeom();
            if (g) {
                pl.cx = num((props.x * g.areaW - g.offX) / g.cssW, -1, 2, pl.cx);
                pl.cy = num((props.y * g.areaH - g.offY) / g.cssH, -1, 2, pl.cy);
            }
        }
        pl.rev = '';                  // ours now; whatever the room sends next applies
        renderPeerLine(pl);
        if (wasWall || isWallSource(pl)) syncCollidersSoon();
        if (arranging) drawArrange();
        emitChange();
        mpRoomEdit(pl);
        return pl;
    }

    // Delete, or hide, on someone else's line: it leaves the room, and on
    // its author's machine it is HIDDEN rather than deleted — a line is
    // saved content there, and nothing a partner does should destroy it.
    // The eye in their list brings it back.
    function removeRoomLine(key) {
        var pl = peerLines.get(key);
        if (!pl) return null;
        if (typeof window.__mpRoomLineHide === 'function') {
            try { window.__mpRoomLineHide(pl.owner, pl.theirId, key); } catch (_) {}
        }
        dropRoomLine(key);            // not removePeerLine: the hide just staged must stand
        return pl;
    }

    // Fluidize on a room line: pour it where it stands (our pour — a turn
    // gate like any), then it leaves the canvas for everyone, as a Fluidize
    // of one's own does. Set in the author's type at the author's canvas
    // size, like every other room line, so the pour lands under the words.
    function fluidizeRoomLine(key, landed) {
        var pl = peerLines.get(key);
        if (!pl) return false;
        if (mpPaintBlocked()) return false;
        if (typeof window.__splatImageToDye !== 'function' || typeof window.__dyeTexSize !== 'function') return false;
        var snap = {};
        for (var k in pl) if (pl.hasOwnProperty(k) && k !== 'el') snap[k] = pl[k];
        removeRoomLine(key);          // its wall comes down before the pour lands
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var ok = false;
                try {
                    ok = pourAt(snap, snap.cx * snap.cw, snap.cy * snap.ch, { cssW: snap.cw, cssH: snap.ch });
                } catch (e) { console.warn('⚠️ Text fluidize failed for a room line', key, e); }
                if (landed) landed(ok);
            });
        });
        return true;
    }

    // ── The author's side: a partner edited one of OUR lines ──
    // d is a room line as roomWire sends it. Their copy stood at our canvas
    // size as we last sent it, so the type is rescaled by our canvas now
    // over that (1 unless this window changed shape since). Returns the
    // line's new wire form so 06d can record that the room holds it.
    function applyRoomEdit(id, d) {
        var ov = findOverlay(id);
        var g = colliderGeom();
        if (!ov || !d || !g) return null;
        var look = cleanLook(d);
        var props = {};
        for (var k in look) if (look.hasOwnProperty(k)) props[k] = look[k];
        var ch = num(d.ch, 20, 20000, g.cssH);
        props.fontSize = Math.max(6, Math.min(400, Math.round(look.fontSize * (g.cssH / ch) * 1000) / 1000));
        props.x = clamp01((g.offX + num(d.cx, -1, 2, 0.5) * g.cssW) / g.areaW);
        props.y = clamp01((g.offY + num(d.cy, -1, 2, 0.5) * g.cssH) / g.areaH);
        props.collider = !!d.col;
        var modes = (window.collisionLayers && window.collisionLayers.MODES) || ['block', 'deflect', 'slow'];
        if (d.col) {
            props.colliderMode = pick(d.cm, modes, ov.colliderMode || 'deflect');
            props.colliderStrength = num(d.cs, 0, 1, (typeof ov.colliderStrength === 'number') ? ov.colliderStrength : 1);
        }
        updateOverlay(id, props);
        return wireLineOf(id);
    }

    // A partner hid (or deleted) one of our lines: hidden here, kept.
    function hideOwnLine(id) {
        var ov = findOverlay(id);
        if (!ov || !ov.visible) return false;
        setVisible(ov, false);
        return true;
    }

    // One of our visible lines in wire form, or null.
    function wireLineOf(id) {
        var all = wireLines();
        if (!all) return null;
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].line;
        return null;
    }

    // The room's lines for the Text panel's "In the room" list.
    function getRoomLines() {
        var out = [];
        peerLines.forEach(function (pl) { out.push(pl); });
        return out;
    }

    // ── The room's pours ───────────────────────────────────────
    // A batch of one painter's pours of one line (06d, from its paced queue):
    // [x, y, amount] per pour, x/y fractions of their canvas. The bitmap is
    // built once at this dye's resolution and kept while the pours keep
    // coming — a held key sends ~125 a second — then dropped oldest-first.
    function peerPour(owner, look, cw, ch, pours) {
        if (typeof window.__splatImageToDye !== 'function' || typeof window.__dyeTexSize !== 'function') return false;
        cw = num(cw, 20, 20000, 0);
        ch = num(ch, 20, 20000, 0);
        if (!cw || !ch || !Array.isArray(pours) || !pours.length) return false;
        var line = cleanLook(look);
        // makeStamp and pourStamp read only these two: set in the painter's
        // CSS px, landed on this dye.
        var g = { cssW: cw, cssH: ch };
        var ok = false, i, p;
        if (!canStamp()) {
            for (i = 0; i < pours.length; i++) {
                p = pours[i];
                if (pourWhole(line, p[0] * cw, p[1] * ch, g, p[2])) ok = true;
            }
            return ok;
        }
        var dye = window.__dyeTexSize();
        if (!dye || !(dye.w > 0) || !(dye.h > 0)) return false;
        var key = owner + '|' + cw + 'x' + ch + '|' + JSON.stringify(line);
        var e = peerStamps.get(key) || null;
        if (e) peerStamps.delete(key);        // re-set below: the map runs oldest first
        if (e && (e.ps.dw !== dye.w || e.ps.dh !== dye.h)) { disposePeerStamp(e); e = null; }
        if (!e) {
            var ps = makeStamp(line, g, pours[0][0] * cw, pours[0][1] * ch);
            if (!ps) return false;
            e = { ps: ps, owner: owner };
        }
        peerStamps.set(key, e);
        while (peerStamps.size > PEER_STAMPS_MAX) {
            var oldest = peerStamps.keys().next().value;
            disposePeerStamp(peerStamps.get(oldest));
            peerStamps.delete(oldest);
        }
        for (i = 0; i < pours.length; i++) {
            p = pours[i];
            if (pourStamp(e.ps, p[0] * cw, p[1] * ch, g, p[2])) ok = true;
        }
        return ok;
    }

    function disposePeerStamp(e) {
        if (e && e.ps && e.ps.stamp) { try { e.ps.stamp.dispose(); } catch (_) {} }
    }

    function dropPeerStamps(owner) {
        peerStamps.forEach(function (e, key) {
            if (owner && e.owner !== owner) return;
            disposePeerStamp(e);
            peerStamps.delete(key);
        });
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
        // Own lines by number; a room line by its 'owner|id' key (the panel
        // selects and edits those too — see getRoomLines).
        get: function (id) { var o = lineById(id); return o ? o : null; },
        renderAll: renderAll,
        compositeOntoCanvas: compositeOntoCanvas,
        fluidize: fluidize,                 // pour one line into the dye and hide it
        setHotkey: setHotkey,               // { hotkey, hotkeyAction } without a re-render
        triggerHotkey: triggerHotkey,       // what pressing a line's key does
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
        onChange: onChange,
        // Swirl Together (06d): our lines for the wire, the room's lines and
        // pours set here. getAll() stays this user's own lines only.
        wireLines: wireLines,
        putPeerLine: putPeerLine,
        removePeerLine: removePeerLine,
        dropPeerLines: dropPeerLines,
        peerPour: peerPour,
        dropPeerStamps: dropPeerStamps,
        getRoomLines: getRoomLines,         // the Text panel's "In the room" rows
        applyRoomEdit: applyRoomEdit,       // a partner edited one of our lines
        hideOwnLine: hideOwnLine,           // ...or took it out of the room
        wireLineOf: wireLineOf,
        getPeerLines: function () {
            var out = [];
            peerLines.forEach(function (pl) {
                var c = {};
                for (var k in pl) if (pl.hasOwnProperty(k) && k !== 'el') c[k] = pl[k];
                out.push(c);
            });
            return out;
        }
    };

    window.textOverlays = api;
    // Legacy alias — the store-asset bake scripts in scripts/ call
    // window.brandingOverlays.clearAll() against the live page.
    window.brandingOverlays = api;
})();
