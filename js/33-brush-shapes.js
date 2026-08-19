// ═══════════════════════════════════════════════════════════════════
// js/33-brush-shapes.js — custom brush shapes (2026-08-09)
// LOAD ORDER: after 32-file-drop.js (static tag). Uses the lexical `gl`
//   from 04a lazily (only at stamp-texture upload time, never at parse).
// PROVIDES: window.BrushShapes — a registry of user-authored alpha stamps
//   the splat shader uses as the dye footprint (05b stampTexOn branch,
//   bound in 05i splat() on texture unit 2).
// FLOW: import an image (file picker or drop on the Brush panel's shape
//   area) → the mask editor opens in adhoc mode (15-layer-masking:
//   enterAdhocMaskMode — full stamp suite + Magic Mask Objects) → Apply
//   rasterizes a white/alpha stamp → cropped to its alpha bounding box,
//   downscaled to ≤128px, persisted as a PNG dataURL.
// STORAGE: settingsManager 'brush.shapes' = [{id, name, dataURL}] (≤24),
//   active id in 'brush.shapeId' + config.BRUSH_SHAPE_ID. Stamps are tiny
//   (≤128px PNGs) so they ride presets/quota comfortably.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var shapes = null;      // in-memory copy of the persisted list
    var TEX = {};           // id → {texture, aspect} (lazy GL upload)
    var BROKEN = {};        // id → 1 for stamps whose bitmap will not decode

    // Errors here used to raise window.alert() — the OS box titled with the
    // app's internal hostname. Route them through the app's own dialog,
    // falling back only if it has not been defined yet.
    function say(title, message) {
        if (typeof window.appAlert === 'function') { window.appAlert(title, message); return; }
        alert(title + '\n\n' + message);
    }

    function sm() { return window.settingsManager || null; }

    function load() {
        if (shapes) return shapes;
        var arr = null;
        try { arr = sm() && sm().get('brush.shapes'); } catch (_) {}
        shapes = Array.isArray(arr) ? arr.filter(function (s) {
            return s && typeof s.id === 'string' && typeof s.dataURL === 'string';
        }) : [];
        return shapes;
    }

    function store() {
        try { return sm() ? sm().set('brush.shapes', shapes || []) !== false : false; } catch (_) { return false; }
    }

    function notify() {
        try { if (typeof window.__onBrushShapeChanged === 'function') window.__onBrushShapeChanged(); } catch (_) {}
    }

    function activeId() {
        var id = window.config ? window.config.BRUSH_SHAPE_ID : null;
        return (typeof id === 'string' && id) ? id : null;
    }

    function findEntry(id) {
        return load().find(function (s) { return s.id === id; }) || null;
    }

    // Lazy GL upload. `gl` is 04a's lexical global — it exists by the time
    // anyone paints; guard anyway so an early call is just a no-op retry.
    function ensureTexture(entry) {
        if (!entry || TEX[entry.id] || BROKEN[entry.id]) return;
        var hasGl;
        try { hasGl = (typeof gl !== 'undefined') && !!gl; } catch (_) { hasGl = false; }
        if (!hasGl) return;
        var slot = { texture: null, aspect: 1 };
        TEX[entry.id] = slot;
        var img = new Image();
        img.onload = function () {
            try {
                var t = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                slot.texture = t;
                slot.aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
            } catch (e) { delete TEX[entry.id]; markBroken(entry.id); }
        };
        img.onerror = function () { delete TEX[entry.id]; markBroken(entry.id); };
        img.src = entry.dataURL;
    }

    // A stamp whose bitmap never decodes (a dataURL truncated by a full
    // quota, a bad import) must not be retried on every dab — and must not
    // hold paint forever, which is what stampPending below would otherwise
    // do. Say it once, and drop the selection so the tip swatch stops
    // advertising a shape that can never print: the brush falls back to its
    // built-in tip deliberately instead of by accident.
    function markBroken(id) {
        if (BROKEN[id]) return;
        BROKEN[id] = 1;
        // Only the ACTIVE shape is worth a dialog: warm() pre-loads every
        // stamp a replay mentions, and a corrupt one of those changes nothing
        // about what the user is painting with right now.
        if (activeId() !== id) return;
        setActive(null);
        say('That brush shape could not be loaded',
            'Its stored image is damaged, so the brush is back on its built-in tip. Delete the shape and import it again.');
    }

    // True while a SELECTED shape's stamp is not on the GPU yet — the window
    // between picking (or importing, or re-editing) a shape and its bitmap
    // decoding. splat()'s custom-shape branch is gated on the texture being
    // ready and falls through to the built-in BRUSH_TIP underneath, so a dab
    // landing in this window prints THAT tip instead: with Chisel selected it
    // stamps a hard square while the swatch already shows the shape. Callers
    // hold the dab instead (it is a frame or two), and kicking the upload off
    // from here keeps the wait as short as it can be.
    function stampPending() {
        var id = activeId();
        if (!id || BROKEN[id]) return false;
        var t = TEX[id];
        if (t && t.texture) return false;
        var entry = findEntry(id);
        if (!entry) return false;        // stale id — nothing to wait for
        ensureTexture(entry);
        return true;
    }

    // Hot path — called from splat() per dab. No storage reads, no allocs
    // beyond the tiny return object; null while the texture is still decoding.
    function getActiveStamp() {
        var id = activeId();
        if (!id) return null;
        var t = TEX[id];
        if (t && t.texture) return { texture: t.texture, aspect: t.aspect };
        ensureTexture(findEntry(id));
        return null;
    }

    function setActive(id) {
        if (id && !findEntry(id)) id = null; // stale preset reference etc.
        if (window.config) window.config.BRUSH_SHAPE_ID = id || null;
        try { if (sm()) sm().set('brush.shapeId', id || null); } catch (_) {}
        if (id) ensureTexture(findEntry(id));
        notify();
    }

    // Crop the stamp canvas to its alpha bounding box (+4% pad) and
    // downscale the long side to ≤128px. Returns null for an empty stamp.
    function processStamp(canvas) {
        var w = canvas.width, h = canvas.height;
        if (!w || !h) return null;
        var ctx = canvas.getContext('2d');
        var d;
        try { d = ctx.getImageData(0, 0, w, h).data; } catch (_) { return null; }
        var minX = w, minY = h, maxX = -1, maxY = -1, x, y;
        for (y = 0; y < h; y++) {
            var row = y * w * 4;
            for (x = 0; x < w; x++) {
                if (d[row + x * 4 + 3] > 2) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;
        var bw = maxX - minX + 1, bh = maxY - minY + 1;
        var pad = Math.max(1, Math.ceil(Math.max(bw, bh) * 0.04));
        var sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
        var sw = Math.min(w - sx, bw + 2 * pad), sh = Math.min(h - sy, bh + 2 * pad);
        var scale = Math.min(1, 128 / Math.max(sw, sh));
        var ow = Math.max(4, Math.round(sw * scale)), oh = Math.max(4, Math.round(sh * scale));
        var out = document.createElement('canvas');
        out.width = ow; out.height = oh;
        out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, ow, oh);
        return out;
    }

    function add(name, stampCanvas) {
        var stamp = processStamp(stampCanvas);
        if (!stamp) {
            say('Nothing to stamp',
                'That shape came out empty — mask an area (or use an image with transparency) and Apply again.');
            return null;
        }
        var id = 'bs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var entry = { id: id, name: name || 'Shape', dataURL: stamp.toDataURL('image/png') };
        load().unshift(entry);
        if (shapes.length > 24) shapes.length = 24;
        if (!store()) {
            // Quota: the shape works this session but won't survive a reload.
            say('Saved only for this session',
                'The shape works now, but storage is full so it will be lost on reload. Free space by deleting presets or shapes.');
        }
        setActive(id); // notify() rides along
        return id;
    }

    function remove(id) {
        load();
        shapes = shapes.filter(function (s) { return s.id !== id; });
        store();
        dropTexture(id);
        if (activeId() === id) setActive(null); else notify();
    }

    function dropTexture(id) {
        if (!TEX[id]) return;
        try { if (TEX[id].texture && typeof gl !== 'undefined' && gl) gl.deleteTexture(TEX[id].texture); } catch (_) {}
        delete TEX[id];
    }

    // Re-stamp an existing shape IN PLACE: same id, same slot in the list, so
    // editing never reorders the library or drops the active selection (which
    // remove+add would, and mid-stroke that changes what you are painting
    // with). The GL texture is dropped so the next dab re-uploads the new art.
    function replace(id, name, stampCanvas) {
        var entry = findEntry(id);
        if (!entry) return null;
        var stamp = processStamp(stampCanvas);
        if (!stamp) {
            say('Nothing left to stamp', 'That edit came out empty, so the shape was left as it was.');
            return null;
        }
        entry.dataURL = stamp.toDataURL('image/png');
        if (name) entry.name = name;
        if (!store()) {
            say('Saved only for this session',
                'The edit applies now, but storage is full so it will be lost on reload.');
        }
        dropTexture(id);
        if (activeId() === id) ensureTexture(entry);
        notify();
        return id;
    }

    // Reopen the mask editor on a saved shape. It edits the STAMP, not the
    // image it came from — originals are deliberately not kept (stamps are
    // ≤128px so they ride presets/quota; originals are megabytes) — so this
    // trims and re-cuts what is there rather than restoring lost area.
    function beginEdit(id) {
        var entry = findEntry(id);
        if (!entry) return;
        if (typeof window.enterAdhocMaskMode !== 'function') {
            say('One moment', 'The mask editor is still loading — try again in a moment.');
            return;
        }
        window.enterAdhocMaskMode(entry.dataURL, entry.name || 'Brush Shape', function (resultCanvas, nm) {
            replace(id, nm, resultCanvas);
        });
    }

    function beginImportDataUrl(dataURL, name) {
        if (typeof window.enterAdhocMaskMode !== 'function') {
            say('One moment', 'The mask editor is still loading — try again in a moment.');
            return;
        }
        window.enterAdhocMaskMode(dataURL, name || 'Brush Shape', function (resultCanvas, nm) {
            add(nm, resultCanvas);
        });
    }

    function beginImportFile(file) {
        if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
            say('Unsupported image', 'Please use a PNG, JPG, or WebP image.');
            return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
            beginImportDataUrl(e.target.result, (file.name || 'Shape').replace(/\.[^/.]+$/, ''));
        };
        reader.readAsDataURL(file);
    }

    // D7 ride-alongs (mirrors brush.presets): full-list import/export.
    // Import MERGES (union, existing entries win, cap 24) — a .fluid load or
    // the vault's wipe-recovery must never destroy shapes authored here.
    function exportList() { return load().slice(); }
    function importList(arr) {
        if (!Array.isArray(arr)) return;
        load();
        var seenId = {}, seenData = {};
        shapes.forEach(function (s) { seenId[s.id] = 1; seenData[s.dataURL] = 1; });
        arr.forEach(function (s) {
            if (!s || typeof s.id !== 'string' || typeof s.dataURL !== 'string') return;
            if (seenId[s.id] || seenData[s.dataURL]) return; // already have it
            if (shapes.length >= 24) return;                 // existing entries win the cap
            shapes.push({ id: s.id, name: s.name || 'Shape', dataURL: s.dataURL });
            seenId[s.id] = 1; seenData[s.dataURL] = 1;
        });
        store();
        // Normalize + notify. Before 04a's async load there is no config —
        // derive the persisted active id from settings so a boot-time import
        // can't null the user's saved selection.
        var keep = null;
        if (window.config) {
            keep = activeId();
        } else {
            try {
                var saved = sm() && sm().get('brush.shapeId');
                keep = (typeof saved === 'string' && saved) ? saved : null;
            } catch (_) {}
        }
        setActive(keep);
    }

    // Restore the persisted active shape once config exists (04a loads async
    // after this file). Harmless if the user has no shapes.
    (function initActive() {
        if (!window.config || !sm()) { setTimeout(initActive, 500); return; }
        if (window.config.BRUSH_SHAPE_ID === undefined || window.config.BRUSH_SHAPE_ID === null) {
            var saved = null;
            try { saved = sm().get('brush.shapeId'); } catch (_) {}
            window.config.BRUSH_SHAPE_ID = (typeof saved === 'string' && findEntry(saved)) ? saved : null;
            if (window.config.BRUSH_SHAPE_ID) ensureTexture(findEntry(window.config.BRUSH_SHAPE_ID));
            notify();
        }
    })();

    window.BrushShapes = {
        list: function () { return load().slice(); },
        activeId: activeId,
        setActive: setActive,
        getActiveStamp: getActiveStamp,
        stampPending: stampPending,
        add: add,
        remove: remove,
        replace: replace,
        beginEdit: beginEdit,
        // Replay asks these per dab: is this recorded stamp one we can draw,
        // and please start its GL upload now rather than mid-stroke (05d).
        has: function (id) { return !!(id && findEntry(id)); },
        warm: function (id) { ensureTexture(findEntry(id)); },
        beginImportFile: beginImportFile,
        beginImportDataUrl: beginImportDataUrl,
        exportList: exportList,
        importList: importList
    };
})();
