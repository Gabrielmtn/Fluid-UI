// ═══════════════════════════════════════════════════════════════════
// js/32-file-drop.js — OS image drag & drop (2026-08-09)
// LOAD ORDER: after 20-mixer-layout.js (drop targets include panel DOM,
//   but all handling is event-delegated so build timing doesn't matter).
// PROVIDES: image-file drops onto
//   • #canvas-area  → new image layer (window.createLayerFromDataUrl, 04f)
//   • #layersPanel  → new image layer (same path)
//   • .brush-shapes-area → custom brush-shape import (window.BrushShapes)
// Also the document-level guard: without a cancelled dragover, a stray
// drop NAVIGATES the window to the dropped file, replacing the app.
// Internal layer-reorder drags (05k) carry no Files type and keep their
// own handlers; 05k's handlers return early for anything that isn't an
// internal row drag so file drags bubble down to here.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var IMG_RE = /^image\/(png|jpe?g|webp)$/i;

    function isFileDrag(e) {
        var t = e.dataTransfer && e.dataTransfer.types;
        if (!t) return false;
        for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
        return false;
    }

    function imageFiles(e) {
        var dt = e.dataTransfer;
        var out = [];
        if (!dt || !dt.files) return out;
        for (var i = 0; i < dt.files.length; i++) {
            if (IMG_RE.test(dt.files[i].type || '')) out.push(dt.files[i]);
        }
        return out;
    }

    // Which drop zone (if any) the pointer is over. `hl` is the element that
    // gets the hover highlight — for the canvas that's the wrapper (the
    // visible frame), not the whole padded area.
    function zoneFor(el) {
        if (!el || !el.closest) return null;
        var shapes = el.closest('.brush-shapes-area');
        if (shapes) return { kind: 'shape', hl: shapes };
        var layersPanel = el.closest('#layersPanel');
        if (layersPanel) return { kind: 'layer', hl: layersPanel };
        var area = el.closest('#canvas-area');
        if (area) return { kind: 'layer', hl: document.getElementById('canvas-wrapper') || area };
        return null;
    }

    var hoverEl = null;
    function setHover(el) {
        if (hoverEl === el) return;
        if (hoverEl) hoverEl.classList.remove('file-drop-hover');
        hoverEl = el || null;
        if (hoverEl) hoverEl.classList.add('file-drop-hover');
    }

    // Hover affordance style (kept here so the feature is one file)
    try {
        var st = document.createElement('style');
        st.textContent =
            '.file-drop-hover { outline: 2px dashed rgba(110, 200, 255, 0.85) !important;' +
            ' outline-offset: -2px; background-color: rgba(110, 200, 255, 0.08) !important; }';
        (document.head || document.documentElement).appendChild(st);
    } catch (_) {}

    document.addEventListener('dragenter', function (e) {
        if (!isFileDrag(e)) return;
        e.preventDefault();
    }, false);

    document.addEventListener('dragover', function (e) {
        if (!isFileDrag(e)) return;
        // Cancelling dragover is what suppresses the browser's default
        // navigate-to-file behavior everywhere in the window.
        e.preventDefault();
        var z = zoneFor(e.target);
        try { e.dataTransfer.dropEffect = z ? 'copy' : 'none'; } catch (_) {}
        setHover(z ? z.hl : null);
    }, false);

    document.addEventListener('dragleave', function (e) {
        // Leaving the window (relatedTarget null) — clear the highlight
        if (!e.relatedTarget) setHover(null);
    }, false);

    document.addEventListener('drop', function (e) {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setHover(null);
        var z = zoneFor(e.target);
        if (!z) return;
        var files = imageFiles(e);
        if (!files.length) return;
        if (z.kind === 'shape') {
            if (window.BrushShapes && typeof window.BrushShapes.beginImportFile === 'function') {
                window.BrushShapes.beginImportFile(files[0]);
            }
        } else {
            // Trim to free capacity so a big drop yields ONE aggregate
            // message instead of an alert per rejected file (04f still
            // alerts per-file as a fallback if a race over-admits).
            var free = (typeof window.layerSlotsFree === 'function') ? window.layerSlotsFree() : files.length;
            var take = files.slice(0, Math.max(0, free));
            take.forEach(function (f) {
                if (typeof window.createLayerFromFile === 'function') window.createLayerFromFile(f);
            });
            if (take.length < files.length) {
                alert((files.length - take.length) + ' of ' + files.length + ' images skipped — 10-layer maximum. Delete some layers to add more.');
            }
        }
    }, false);
})();
