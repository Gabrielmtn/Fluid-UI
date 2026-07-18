// ═══════════════════════════════════════════════════════════════════
// js/05o-masks.js — D3: the unified Mask object (slice 1)
// LOAD ORDER: after 05n-hotkeys-init.js, before 06-slider-updater.js
// PROVIDES: window.Masks — mask registry over maskStore (05c)
// REQUIRES: maskStore/createFBO/dyeTexWidth/dyeTexHeight/gl (05c),
//           rasterStampProg via 05i's __maskStamp (stamping lives there)
//
// A Mask is DATA (a continuous 0..1 coverage field, painted with the D1
// brush engine); what it DOES is a BINDING (collider today via
// collisionLayers.createFromMask/setMaskLive in 23; clip/emitter/effect
// consumers land in later D3/D4 slices). Coverage lives in an RGBA8
// dye-res FBO (alpha = coverage, rgb = white·alpha premult) so the
// whole raster stamp/undo/reinit machinery applies unchanged.
// ═══════════════════════════════════════════════════════════════════
(function () {
    let _activeMaskId = null;
    let _seq = 1;
    const _meta = {}; // id -> { name }

    function _newFBO() {
        return createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    }
    function create(name) {
        const id = _seq++;
        maskStore[id] = _newFBO();
        _meta[id] = { name: name || ('Mask ' + id) };
        setActive(id);
        _notifyList();
        return id;
    }
    function ensureDefault() {
        if (_activeMaskId != null && maskStore[_activeMaskId]) return _activeMaskId;
        const ids = Object.keys(_meta).filter(function (k) { return maskStore[k]; });
        if (ids.length) { setActive(parseInt(ids[0], 10)); return _activeMaskId; }
        return create();
    }
    function setActive(id) {
        if (!maskStore[id]) return false;
        _activeMaskId = id;
        if (typeof window.__onActiveMaskChanged === 'function') {
            window.__onActiveMaskChanged(id, _meta[id] ? _meta[id].name : null);
        }
        return true;
    }
    function remove(id) {
        if (!maskStore[id]) return;
        gl.deleteTexture(maskStore[id].texture);
        gl.deleteFramebuffer(maskStore[id].fbo);
        delete maskStore[id];
        delete _meta[id];
        if (typeof window.__sketchUndoPurge === 'function') window.__sketchUndoPurge(id, 'mask');
        // let a live collider binding notice its source is gone
        if (typeof window.__onMaskMutated === 'function') window.__onMaskMutated(id);
        if (_activeMaskId === id) {
            _activeMaskId = null;
            const ids = Object.keys(_meta).filter(function (k) { return maskStore[k]; });
            if (ids.length) setActive(parseInt(ids[0], 10));
            else if (typeof window.__onActiveMaskChanged === 'function') window.__onActiveMaskChanged(null, null);
        }
        _notifyList();
    }
    function clear(id) {
        const mid = (id == null) ? _activeMaskId : id;
        const f = maskStore[mid];
        if (!f) return;
        if (typeof window.__maskUndoPush === 'function' && mid === _activeMaskId) window.__maskUndoPush();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (typeof window.__onMaskMutated === 'function') window.__onMaskMutated(mid);
    }
    function _notifyList() {
        if (typeof window.__onMaskListChanged === 'function') window.__onMaskListChanged(list());
    }
    function list() {
        return Object.keys(_meta)
            .filter(function (k) { return maskStore[k]; })
            .map(function (k) { return { id: parseInt(k, 10), name: _meta[k].name }; });
    }
    function rename(id, name) {
        if (_meta[id]) { _meta[id].name = String(name || '').slice(0, 40) || _meta[id].name; _notifyList(); }
    }
    // ── persistence (12-save-load) ──────────────────────────────────
    // Coverage → grayscale PNG (alpha carries coverage; rgb white for a
    // legible preview if the file is ever inspected).
    function _readbackDataURL(f) {
        const px = new Uint8Array(f.width * f.height * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.readPixels(0, 0, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const c = document.createElement('canvas');
        c.width = f.width; c.height = f.height;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(f.width, f.height);
        for (let y = 0; y < f.height; y++) {
            const src = (f.height - 1 - y) * f.width * 4; // flip Y
            const dst = y * f.width * 4;
            for (let x = 0; x < f.width * 4; x += 4) {
                const a = px[src + x + 3];
                img.data[dst + x] = 255;
                img.data[dst + x + 1] = 255;
                img.data[dst + x + 2] = 255;
                img.data[dst + x + 3] = a;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
    }
    function serialize() {
        return list().map(function (m) {
            return { id: m.id, name: m.name, data: _readbackDataURL(maskStore[m.id]), active: m.id === _activeMaskId };
        });
    }
    function restore(arr) {
        // wipe current masks, rebuild from the snapshot
        Object.keys(maskStore).forEach(function (k) {
            gl.deleteTexture(maskStore[k].texture);
            gl.deleteFramebuffer(maskStore[k].fbo);
            delete maskStore[k];
            if (typeof window.__sketchUndoPurge === 'function') window.__sketchUndoPurge(parseInt(k, 10), 'mask');
            delete _meta[k];
        });
        _activeMaskId = null;
        if (!Array.isArray(arr)) { _notifyList(); return; }
        arr.forEach(function (m) {
            if (!m || m.id == null) return;
            const id = m.id | 0;
            maskStore[id] = _newFBO();
            _meta[id] = { name: m.name || ('Mask ' + id) };
            if (id >= _seq) _seq = id + 1;
            if (m.data) {
                (function (mid, dataURL) {
                    const img = new Image();
                    img.onload = function () {
                        const f = maskStore[mid];
                        if (!f) return;
                        const c = document.createElement('canvas');
                        c.width = f.width; c.height = f.height;
                        c.getContext('2d').drawImage(img, 0, 0, f.width, f.height);
                        gl.bindTexture(gl.TEXTURE_2D, f.texture);
                        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
                        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                        gl.bindTexture(gl.TEXTURE_2D, null);
                        if (typeof window.__onMaskMutated === 'function') window.__onMaskMutated(mid);
                    };
                    img.src = dataURL;
                })(id, m.data);
            }
            if (m.active) _activeMaskId = id;
        });
        if (_activeMaskId == null) {
            const ids = Object.keys(_meta);
            if (ids.length) _activeMaskId = parseInt(ids[0], 10);
        }
        _notifyList();
        if (_activeMaskId != null && typeof window.__onActiveMaskChanged === 'function') {
            window.__onActiveMaskChanged(_activeMaskId, _meta[_activeMaskId] ? _meta[_activeMaskId].name : null);
        }
    }
    // ── D3: import existing mask sources into a paintable Mask ─────────
    // Upload any white/alpha coverage canvas into a fresh Mask.
    function importCoverage(srcCanvas, name) {
        const id = create(name);
        const f = maskStore[id];
        const c = document.createElement('canvas');
        c.width = f.width; c.height = f.height;
        c.getContext('2d').drawImage(srcCanvas, 0, 0, f.width, f.height);
        gl.bindTexture(gl.TEXTURE_2D, f.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (typeof window.__onMaskMutated === 'function') window.__onMaskMutated(id);
        return id;
    }
    // Rasterize a layer's mask shapes (SAM clicks, depth cuts, geometric
    // shapes — the three legacy stacks) into ONE Mask via the same
    // drawMaskShape renderer the visual clip uses, so the imported
    // coverage matches what the user sees. SAM and depth are now mask
    // SOURCES: click/estimate → import → paint on it → bind it.
    function importFromLayer(layerIndex) {
        const layer = (window.layers || []).find(function (l) { return l.index === layerIndex; });
        if (!layer || !layer.mask || !layer.mask.shapes || !layer.mask.shapes.length) return null;
        if (typeof window._drawMaskShape !== 'function') return null;
        const mainCanvas = document.getElementById('canvas');
        if (!mainCanvas) return null;
        const c = document.createElement('canvas');
        c.width = dyeTexWidth; c.height = dyeTexHeight;
        const ctx = c.getContext('2d');
        // shapes live in canvas-buffer px — map onto the dye-res raster
        ctx.scale(dyeTexWidth / mainCanvas.width, dyeTexHeight / mainCanvas.height);
        layer.mask.shapes.forEach(function (s) { window._drawMaskShape(ctx, s); });
        return importCoverage(c, (layer.title || 'Layer') + ' mask');
    }
    window.Masks = {
        create: create,
        ensureDefault: ensureDefault,
        importCoverage: importCoverage,
        importFromLayer: importFromLayer,
        setActive: setActive,
        activeId: function () { return _activeMaskId; },
        getFBO: function (id) { return maskStore[id] || null; },
        list: list,
        rename: rename,
        clear: clear,
        remove: remove,
        serialize: serialize,
        restore: restore
    };
})();
