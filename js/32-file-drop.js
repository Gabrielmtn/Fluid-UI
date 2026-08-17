// ═══════════════════════════════════════════════════════════════════
// js/32-file-drop.js — OS image in: drag & drop (2026-08-09) and
//   clipboard paste (2026-08-17)
// LOAD ORDER: after 20-mixer-layout.js (drop targets include panel DOM,
//   but all handling is event-delegated so build timing doesn't matter).
// PROVIDES: image-file drops onto
//   • #canvas-area  → new image layer (window.createLayerFromDataUrl, 04f)
//   • #layersPanel  → new image layer (same path)
//   • .brush-shapes-area → custom brush-shape import (window.BrushShapes)
//   plus, anywhere outside a text field, for images that never touched
//   the disk:
//   • Ctrl+V       → new image layer (same path again)
//   • Ctrl+Shift+V → hidden luminance-keyed collider (23-depth-collision's
//                    createFromLayerMask; all use is at event time, so its
//                    load order relative to this file doesn't matter)
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

    // How many of `n` incoming images there is room for. Trimming here is
    // what makes a big batch yield ONE aggregate message instead of an
    // alert per rejected file (04f still alerts per-file as a fallback if
    // a race over-admits).
    function admitCount(n) {
        var free = (typeof window.layerSlotsFree === 'function') ? window.layerSlotsFree() : n;
        var take = Math.max(0, Math.min(n, free));
        if (take < n) {
            alert((n - take) + ' of ' + n + ' images skipped — 10-layer maximum. Delete some layers to add more.');
        }
        return take;
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
            files.slice(0, admitCount(files.length)).forEach(function (f) {
                if (typeof window.createLayerFromFile === 'function') window.createLayerFromFile(f);
            });
        }
    }, false);

    // ── Clipboard paste → image layer ────────────────────────────────
    // Same destination as a drop, for the far more common case where the
    // image never touched the disk: a screenshot, "Copy image" out of a
    // browser, a copy out of another editor.

    function isTyping(el) {
        if (window.__isTypingTarget) return window.__isTypingTarget(el);
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        return !!el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
    }

    // Explorer file copies arrive in .files carrying their real names; a
    // raw bitmap paste arrives as an item Chrome synthesizes as
    // "image.png". Both are Files by the time we see them; .items is the
    // fallback for engines that only populate that side.
    function clipboardImages(dt) {
        var out = [], i;
        if (!dt) return out;
        if (dt.files && dt.files.length) {
            for (i = 0; i < dt.files.length; i++) {
                if (/^image\//i.test(dt.files[i].type || '')) out.push(dt.files[i]);
            }
        }
        if (!out.length && dt.items) {
            for (i = 0; i < dt.items.length; i++) {
                if (dt.items[i].kind !== 'file' || !/^image\//i.test(dt.items[i].type || '')) continue;
                var f = dt.items[i].getAsFile();
                if (f) out.push(f);
            }
        }
        return out;
    }

    // A layer called "image" says nothing, so the synthesized bitmap name
    // becomes a generic label; a real file name is kept.
    function titleFor(f) {
        var base = (f && f.name ? String(f.name) : '').replace(/\.[^/.]+$/, '');
        return (!base || base.toLowerCase() === 'image') ? 'Pasted' : base;
    }

    // ── Paste as a collider (Ctrl+Shift+V) ───────────────────────────
    // The image lands as an invisible wall: its dark background is keyed out
    // at PASTE_COLLIDER_CUT% luminance, the lit shape is baked into a
    // collision layer, and BOTH the source image and the collider's red film
    // are hidden — so the only sign of it is fluid flowing around the shape.
    // Hiding only one of the two would be pointless: the film is a red
    // rendering of the same picture.
    // From there it's an ordinary collider — the 🧱 row in Layers carries
    // Strength / Threshold / Invert, and either layer's eye button brings it
    // back into view. The cut is console-tunable for feel-tests:
    //   window.PASTE_COLLIDER_CUT = 25   (higher = only brighter pixels wall)
    window.PASTE_COLLIDER_CUT = 10;

    function recordCreate(indices, label) {
        return (typeof window.__recordLayerCreate === 'function')
            ? window.__recordLayerCreate(indices, label)
            : null;
    }

    function colliderize(layer) {
        var cl = window.collisionLayers;
        if (!cl || typeof cl.createFromLayerMask !== 'function') {
            flash('Colliders unavailable — pasted as a plain layer');
            recordCreate([layer.index], 'paste layer');
            return;
        }
        var cut = Number(window.PASTE_COLLIDER_CUT);
        if (!isFinite(cut)) cut = 10;
        // Floor of 1: at threshold 0 the generator switches to "whole image
        // is solid", which would wall off the entire canvas rectangle.
        layer.threshold = Math.max(1, Math.min(100, cut));
        // Re-key the layer art to the same cut, so un-hiding it shows the
        // shape that's actually colliding rather than the raw paste. The
        // create-time render already cleared __maskDirty.
        layer.__maskDirty = true;
        // One Ctrl+Z takes the whole paste back: the entry exists from here,
        // and the collider joins it when its bake finishes (a few frames).
        var undoEntry = recordCreate([layer.index], 'paste collider');
        cl.createFromLayerMask(layer.index, {
            visible: false,
            onCreated: function (colliderIndex) { if (undoEntry) undoEntry.add(colliderIndex); }
        });
        if (layer.visible && typeof window.toggleLayer === 'function') window.toggleLayer(layer.index);
    }

    function toLayer(dataUrl, title, mode) {
        if (typeof window.createLayerFromDataUrl !== 'function') return false;
        if (mode !== 'collider') return window.createLayerFromDataUrl(dataUrl, title);
        return window.createLayerFromDataUrl(dataUrl, title, colliderize);
    }

    function layerFromBlob(blob, title, mode) {
        var reader = new FileReader();
        reader.onload = function (ev) { toLayer(ev.target.result, title, mode); };
        reader.readAsDataURL(blob);
    }

    // Paste feedback: a new layer is inserted *below* the sim, so on a
    // busy canvas it can land somewhere the eye doesn't catch — and a
    // clipboard with no image in it would otherwise be a dead key.
    // Display-toggling only, no CSS transitions (they corrupt the WebGL
    // canvas in the Electron build).
    var flashEl = null, flashTimer = null;
    function flash(text) {
        if (!flashEl) {
            flashEl = document.createElement('div');
            flashEl.id = 'pasteIndicator';
            flashEl.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);' +
                'z-index:10001;padding:9px 16px;border-radius:10px;background:rgba(15,20,27,0.9);' +
                'border:1px solid rgba(110,200,255,0.45);color:#fff;font-size:15px;font-weight:600;' +
                'pointer-events:none;display:none;';
            (document.body || document.documentElement).appendChild(flashEl);
        }
        flashEl.textContent = text;
        flashEl.style.display = 'block';
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { flashEl.style.display = 'none'; }, 1400);
    }

    var NO_IMAGE = 'Nothing to paste — copy an image first';

    var pasteSeq = 0; // bumped by every real paste event (see the watchdog)

    // A held Ctrl+V auto-repeats at ~30 Hz and Chromium raises a paste event
    // for every repeat — enough to fill all ten slots off one lean on the
    // key and then throw a blocking alert per repeat after that. The key
    // event knows it's a repeat and the paste event doesn't, so the flag is
    // handed across and consumed by the paste it belongs to.
    var repeatPaste = false;

    // Ctrl+Shift+V is handled entirely in the keydown below, so a paste event
    // Chromium still manages to raise for it has to be ignored here — if its
    // payload DID survive, this handler would paste a second, plain copy.
    var swallowPasteAt = 0;

    // Last resort for Ctrl+Shift+V when the clipboard can't be read directly:
    // arm the next plain paste to become a collider, and say so. The user's own
    // Ctrl+V then carries the full payload that the stripped Ctrl+Shift+V event
    // never had — no permission, no async clipboard API, so this is also the
    // only route in browsers that don't implement navigator.clipboard.read()
    // (Firefox) or where the user declined the prompt.
    var ARM_MS = 6000;
    var armedUntil = 0;

    function pasteChord() {
        return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? 'Cmd+V' : 'Ctrl+V';
    }

    function armColliderPaste() {
        armedUntil = Date.now() + ARM_MS;
        swallowPasteAt = 0; // the paste we're now waiting for must NOT be swallowed
        flash('Press ' + pasteChord() + ' now to paste it as a collider');
    }

    function pasteMessage(n, mode) {
        if (mode === 'collider') {
            return n > 1 ? ('Pasted ' + n + ' images as hidden colliders') : 'Pasted as a hidden collider';
        }
        return n > 1 ? ('Pasted ' + n + ' images as layers') : 'Pasted as a new layer';
    }

    // One way in for all three routes: the paste event, the Electron
    // watchdog and the async clipboard read.
    function intake(blobs, mode) {
        var take = blobs.slice(0, admitCount(blobs.length));
        if (!take.length) return;
        take.forEach(function (b) { layerFromBlob(b, titleFor(b), mode); });
        flash(pasteMessage(take.length, mode));
    }

    document.addEventListener('paste', function (e) {
        pasteSeq++;
        if (swallowPasteAt && Date.now() - swallowPasteAt < 400) { swallowPasteAt = 0; return; }
        if (isTyping(e.target)) return; // text fields keep their normal paste
        var repeat = repeatPaste; repeatPaste = false;
        if (repeat) return;
        var mode = 'layer';
        if (armedUntil && Date.now() < armedUntil) { mode = 'collider'; armedUntil = 0; }
        var files = clipboardImages(e.clipboardData);
        if (!files.length) { flash(NO_IMAGE); return; }
        e.preventDefault();
        intake(files, mode);
    }, false);

    // Reading the clipboard without a paste event.
    //
    // Electron's module first: synchronous, and it needs no permission. On the
    // web the only route is navigator.clipboard.read(), which asks the user for
    // clipboard permission — acceptable for a shortcut that has no other way
    // in, which is why plain Ctrl+V never comes through here on the web.
    function electronClipboard() {
        try {
            if (typeof require !== 'function') return null;
            return require('electron').clipboard;
        } catch (_) { return null; }
    }

    function asyncClipboardImage(mode) {
        if (!navigator.clipboard || !navigator.clipboard.read) { armColliderPaste(); return; }
        navigator.clipboard.read().then(function (items) {
            for (var i = 0; i < items.length; i++) {
                var types = items[i].types || [];
                for (var t = 0; t < types.length; t++) {
                    if (!/^image\//i.test(types[t])) continue;
                    return items[i].getType(types[t]).then(function (blob) { intake([blob], mode); });
                }
            }
            // Read worked and there is genuinely no image on the clipboard —
            // a plain paste wouldn't find one either, so don't send the user
            // chasing one.
            flash(NO_IMAGE);
        }).catch(armColliderPaste); // blocked or declined → hand it to Ctrl+V
    }

    function clipboardFallback(mode) {
        var clip = electronClipboard();
        if (clip) {
            var img = null;
            try { img = clip.readImage(); } catch (_) { return; }
            if (!img || img.isEmpty()) { flash(NO_IMAGE); return; }
            if (!admitCount(1)) return;
            if (toLayer(img.toDataURL(), 'Pasted', mode)) flash(pasteMessage(1, mode));
            return;
        }
        if (mode === 'collider') asyncClipboardImage(mode);
    }

    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        if ((e.key || '').toLowerCase() !== 'v') return; // Shift makes it 'V'
        if (isTyping(e.target)) return;
        if (e.repeat) { repeatPaste = true; return; }
        repeatPaste = false;

        // Ctrl+Shift+V — ours outright, never Chromium's.
        //
        // Chromium binds this to "paste and match style", and that command
        // strips the clipboard to text before raising its paste event: the
        // image is simply not in the payload, which read as "no image in the
        // clipboard" even with a bitmap sitting right there. Worse, the event
        // firing at all made the watchdog below stand down, so the direct read
        // that WOULD have found the image never ran.
        //
        // preventDefault stops that command, so no paste event is raised and
        // this is the only route. Reading here also runs inside the keypress
        // itself, which is the strongest context navigator.clipboard.read()
        // can be given.
        if (e.shiftKey) {
            e.preventDefault();
            armedUntil = 0;              // a fresh press supersedes any armed one
            swallowPasteAt = Date.now(); // belt and braces if a paste still lands
            clipboardFallback('collider');
            return;
        }

        // Ctrl+V — Chromium's paste event is the route that works everywhere.
        // The watchdog only covers a packaged Electron build, which runs with
        // NO application menu (electron-main nulls it), and on some platforms
        // the menu is what routes the paste accelerator into the page.
        var seq = pasteSeq;
        setTimeout(function () {
            if (pasteSeq !== seq) return; // a real paste event already handled it
            clipboardFallback('layer');
        }, 200);
    }, false);
})();
