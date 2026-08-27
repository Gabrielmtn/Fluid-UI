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
    function _readbackDataURL(f, invert) {
        // Lost context ⇒ readPixels no-ops ⇒ blank mask; null keeps prior data.
        if (gl.isContextLost && gl.isContextLost()) return null;
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
                // CSS has no mask invert — bake it into alpha here.
                const a = invert ? (255 - px[src + x + 3]) : px[src + x + 3];
                img.data[dst + x] = 255;
                img.data[dst + x + 1] = 255;
                img.data[dst + x + 2] = 255;
                img.data[dst + x + 3] = a;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
    }
    // D3-3: per-mask coverage as a top-down white/alpha PNG data-URL, ready to
    // drop into CSS -webkit-mask-image on a DOM image layer (invert bakes 255-a).
    function coverageDataURL(id, invert) {
        const f = maskStore[id];
        return f ? _readbackDataURL(f, !!invert) : null;
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
    // Rasterize a layer's mask shapes as white/alpha coverage at dye
    // resolution, WITH the layer's on-screen transform baked in. Shared by
    // importFromLayer and by ClipSources below, so a layer's mask reads the
    // same whether it is copied into a Mask or bound straight as a clip.
    function layerCoverageCanvas(layer) {
        if (!layer || !layer.mask || !layer.mask.shapes || !layer.mask.shapes.length) return null;
        if (typeof window._drawMaskShape !== 'function') return null;
        const mainCanvas = document.getElementById('canvas');
        if (!mainCanvas) return null;
        const c = document.createElement('canvas');
        c.width = dyeTexWidth; c.height = dyeTexHeight;
        const ctx = c.getContext('2d');
        // shapes live in canvas-buffer px — map onto the dye-res raster
        ctx.scale(dyeTexWidth / mainCanvas.width, dyeTexHeight / mainCanvas.height);
        // Apply the layer's on-screen transform (2026-08-06): shapes are
        // stored untransformed; without this an aspect-fitted / moved /
        // rotated layer imported a mask that ignored its placement — the
        // imported coverage must match what the user SEES (same
        // translate → rotate → scale about center convention as the
        // obstacle compositor in 23-depth-collision).
        const wrap = document.getElementById('canvas-wrapper');
        const cssW = (wrap && wrap.clientWidth) || mainCanvas.clientWidth || mainCanvas.width || 1;
        const cssH = (wrap && wrap.clientHeight) || mainCanvas.clientHeight || mainCanvas.height || 1;
        const bcx = mainCanvas.width * 0.5, bcy = mainCanvas.height * 0.5;
        ctx.translate(bcx + (layer.x || 0) * (mainCanvas.width / cssW),
                      bcy + (layer.y || 0) * (mainCanvas.height / cssH));
        ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
        if (window.LayerXform) window.LayerXform.shearCtx(ctx, layer);
        ctx.scale(layer.scaleX || 1, layer.scaleY || 1);
        ctx.translate(-bcx, -bcy);
        layer.mask.shapes.forEach(function (s) { window._drawMaskShape(ctx, s); });
        return c;
    }
    function importFromLayer(layerIndex) {
        const layer = (window.layers || []).find(function (l) { return l.index === layerIndex; });
        const c = layerCoverageCanvas(layer);
        if (!c) return null;
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
        coverageDataURL: coverageDataURL,
        list: list,
        rename: rename,
        clear: clear,
        remove: remove,
        serialize: serialize,
        restore: restore
    };

    // ── Clip sources (2026-08-23) ───────────────────────────────────────
    // Everything in the project that already HAS a silhouette, offered to the
    // Clip dropdown by name so nothing has to be converted by hand first:
    //   • paintable Masks           → their own name
    //   • a layer with a shape mask → "<layer> - mask"
    //   • a collision layer         → "<layer> - collider"
    // Sources are addressed by a string key ("mask:3" / "layer:1") rather than
    // a bare Mask id, because a layer's mask is not a Mask and never becomes
    // one — it is read where it lives, so editing the layer's mask (or renaming
    // the layer) moves every clip bound to it. No import step, no second copy
    // to keep in sync.
    const _layerFBO = {};   // layer index → {fbo, rev} materialized for the shader path

    function _kindOf(layer) {
        if (!layer) return null;
        if (layer.isCollision) return 'collider';
        if (layer.mask && layer.mask.shapes && layer.mask.shapes.length) return 'mask';
        return null;
    }

    // A stamp that changes whenever the coverage would: shape count plus the
    // placement the raster bakes in. Cheap enough to compute per frame, and it
    // is what lets the materialized FBO know it has gone stale.
    function _layerRev(layer) {
        const n = (layer.mask && layer.mask.shapes) ? layer.mask.shapes.length : 0;
        return [n, layer.x | 0, layer.y | 0, layer.rotation || 0,
                (layer.scaleX || 1).toFixed(4), (layer.scaleY || 1).toFixed(4),
                layer.skewX || 0, layer.skewY || 0,
                layer.__clipRev || 0].join('/');
    }

    function clipSourceList(excludeLayerIndex) {
        const out = [];
        list().forEach(function (m) {
            out.push({ key: 'mask:' + m.id, kind: 'mask', id: m.id, label: m.name || ('Mask ' + m.id) });
        });
        (window.layers || []).forEach(function (l) {
            if (excludeLayerIndex != null && l.index === excludeLayerIndex) return; // never clip a layer by itself
            const kind = _kindOf(l);
            if (!kind) return;
            out.push({
                key: 'layer:' + l.index, kind: kind, id: l.index,
                label: (l.title || 'Layer') + ' - ' + kind
            });
        });
        // Two layers can carry the same name, and a Mask can be named after
        // one. Number the repeats so every row in the dropdown addresses
        // exactly one thing.
        const seen = {};
        out.forEach(function (s) {
            const base = s.label;
            if (seen[base] === undefined) { seen[base] = 0; return; }
            seen[base] += 1;
            s.label = base + '-' + seen[base];
        });
        return out;
    }

    function _parseKey(key) {
        if (typeof key === 'number') return { kind: 'mask', id: key };      // legacy clipMaskId
        if (typeof key !== 'string' || !key) return null;
        const i = key.indexOf(':');
        if (i < 0) return null;
        const id = parseInt(key.slice(i + 1), 10);
        if (!isFinite(id)) return null;
        return { kind: key.slice(0, i), id: id };
    }

    function _layerOf(index) {
        return (window.layers || []).find(function (l) { return l.index === index; }) || null;
    }

    // Coverage as a top-down white/alpha PNG — what a DOM image layer's CSS
    // mask-image needs.
    function clipSourceDataURL(key, invert) {
        const p = _parseKey(key);
        if (!p) return null;
        if (p.kind === 'mask') return coverageDataURL(p.id, invert);
        const c = layerCoverageCanvas(_layerOf(p.id));
        if (!c) return null;
        if (invert) {
            const cx = c.getContext('2d');
            let d;
            try { d = cx.getImageData(0, 0, c.width, c.height); } catch (_) { return null; }
            const px = d.data;
            for (let i = 0; i < px.length; i += 4) {
                px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
                px[i + 3] = 255 - px[i + 3];
            }
            cx.putImageData(d, 0, 0);
        }
        return c.toDataURL('image/png');
    }

    // Coverage as an FBO — what the raster compositor samples in-shader.
    // Masks already are one; a layer's mask is materialized on demand and
    // cached until its shapes or placement change.
    function clipSourceFBO(key) {
        const p = _parseKey(key);
        if (!p) return null;
        if (p.kind === 'mask') return maskStore[p.id] || null;
        const layer = _layerOf(p.id);
        if (!_kindOf(layer)) { dropLayerFBO(p.id); return null; }
        const rev = _layerRev(layer);
        const have = _layerFBO[p.id];
        if (have && have.rev === rev) return have.fbo;
        const c = layerCoverageCanvas(layer);
        if (!c) return have ? have.fbo : null;
        const f = (have && have.fbo) ? have.fbo : _newFBO();
        gl.bindTexture(gl.TEXTURE_2D, f.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
        _layerFBO[p.id] = { fbo: f, rev: rev };
        return f;
    }

    function dropLayerFBO(index) {
        const have = _layerFBO[index];
        if (!have) return;
        try { gl.deleteTexture(have.fbo.texture); gl.deleteFramebuffer(have.fbo.fbo); } catch (_) {}
        delete _layerFBO[index];
    }

    // A layer's mask was edited: bump its revision so the cached FBO rebuilds,
    // and repaint the CSS clips of every image layer bound to it.
    function clipSourceInvalidate(index) {
        const layer = _layerOf(index);
        if (layer) layer.__clipRev = (layer.__clipRev || 0) + 1;
        const key = 'layer:' + index;
        if (typeof window.reapplyImageLayerClips === 'function') {
            (window.layers || []).forEach(function (l) {
                if (l.clipSource === key) window.applyLayerClip(l.index);
            });
        }
    }

    // Resolve whatever a layer is bound to, tolerating the pre-key form.
    function clipKeyOf(layer) {
        if (!layer) return null;
        if (typeof layer.clipSource === 'string' && layer.clipSource) return layer.clipSource;
        if (typeof layer.clipMaskId === 'number') return 'mask:' + layer.clipMaskId;
        return null;
    }

    // Keep the legacy field in step so saves written by this build still load
    // in one that predates keys (a Mask binding survives; a layer-mask binding
    // degrades to None rather than to the wrong shape).
    function setClipSource(layer, key) {
        if (!layer) return;
        layer.clipSource = key || null;
        const p = _parseKey(key);
        layer.clipMaskId = (p && p.kind === 'mask') ? p.id : null;
    }

    window.ClipSources = {
        list: clipSourceList,
        getFBO: clipSourceFBO,
        coverageDataURL: clipSourceDataURL,
        invalidate: clipSourceInvalidate,
        dropLayer: dropLayerFBO,
        keyOf: clipKeyOf,
        set: setClipSource,
        parse: _parseKey
    };
})();
