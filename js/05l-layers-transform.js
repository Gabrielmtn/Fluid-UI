// ═══════════════════════════════════════════════════════════════════
// js/05l-layers-transform.js — part 12/14 of former 05-fluid-sim.js (lines 3898–4301)
// LOAD ORDER: after 05k-layers-render.js, before 05m-layer-masks.js
// PROVIDES: layer toggle/delete, active-layer drag, resize/rotate handles, updateLayerPosition
// REQUIRES: 05k
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        window.toggleSimLayer = () => {
            const isVisible = canvas.style.display !== 'none';
            canvas.style.display = isVisible ? 'none' : 'block';
            renderLayers();
        };
        window.toggleLayer = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer) {
                layer.visible = !layer.visible;
                // D2 raster layers have no backing div (GPU-composited)
                const layerDiv = document.getElementById(`layer${index}`);
                if (layerDiv) layerDiv.style.display = layer.visible ? 'block' : 'none';
                renderLayers();
            }
        };
        // ── D6: layer-ops undo history (reorder + delete), a provider for the
        // unified UndoManager. Records reversible closures stamped with a global
        // seq so Ctrl+Z picks the most-recent action across sketch / UI / layers.
        window.__layerHistory = (function () {
            const past = [], future = [], LIMIT = 60;
            let _applying = false;
            function push(entry) {
                if (_applying) return; // don't record ops caused by an undo/redo
                entry.seq = (window.__undoSeq = (window.__undoSeq | 0) + 1);
                past.push(entry);
                if (past.length > LIMIT) past.shift();
                future.length = 0;
            }
            function undo() {
                if (!past.length) return;
                const e = past.pop(); _applying = true;
                try { e.undo(); } catch (err) { console.warn('[undo] layer undo failed', err); }
                _applying = false; future.push(e);
            }
            function redo() {
                if (!future.length) return;
                const e = future.pop(); _applying = true;
                try { e.redo(); } catch (err) { console.warn('[undo] layer redo failed', err); }
                _applying = false; past.push(e);
            }
            return {
                push: push, undo: undo, redo: redo,
                clear: function () { past.length = 0; future.length = 0; },
                isApplying: function () { return _applying; },
                canUndo: function () { return past.length > 0; },
                canRedo: function () { return future.length > 0; },
                topUndoSeq: function () { return past.length ? past[past.length - 1].seq : -Infinity; },
                topRedoSeq: function () { return future.length ? future[future.length - 1].seq : Infinity; }
            };
        })();
        // Re-insert a deleted layer object at its old order slot and rebuild its
        // backing surface (raster FBO via reconcile / image + collision div).
        function __restoreDeletedLayer(removed, orderIdx, orderEntry) {
            if (!removed) return;
            if (!window.layers.some(l => l.index === removed.index)) window.layers.push(removed);
            if (!window.layerOrder.some(it => it.type === 'layer' && it.id === removed.index)) {
                const at = Math.max(0, Math.min(orderIdx < 0 ? window.layerOrder.length : orderIdx, window.layerOrder.length));
                window.layerOrder.splice(at, 0, orderEntry || { type: 'layer', id: removed.index });
            }
            removed.__maskDirty = true;
            const div = document.getElementById('layer' + removed.index);
            if (removed.isRaster) {
                if (window.rasterLayers && window.rasterLayers.reconcile) window.rasterLayers.reconcile();
            } else if (div) {
                // Colliders restore the tinted coverage film, not the opaque map
                // (see _depthToFilmUrl in 23-depth-collision) — otherwise undo
                // brought the black veil back after a delete.
                const src = (removed.isCollision && removed.filmData) || removed.data || removed.originalData;
                if (src) div.style.backgroundImage = 'url(' + src + ')';
                div.style.display = removed.visible === false ? 'none' : 'block';
                if (removed.isCollision) {
                    div.style.backgroundSize = '100% 100%';
                    div.style.opacity = removed.filmData ? '0.3' : '0.55';
                }
            }
            if (typeof renderLayers === 'function') renderLayers();
            if (removed.isCollision && window.collisionLayers && window.collisionLayers.updateObstacleFromLayers) window.collisionLayers.updateObstacleFromLayers();
            if (typeof window.reapplyImageLayerClips === 'function') window.reapplyImageLayerClips();
        }
        // D6: record a layer creation (paste / drop / upload) as ONE undoable
        // action, however many layers it produced — a Ctrl+Shift+V paste makes
        // two (the keyed image and its collider) and has to come back as one.
        //
        // Returns a handle whose .add(index) folds a later-arriving layer into
        // the SAME entry: the collider is baked asynchronously, and pushing its
        // own entry would cost two Ctrl+Z presses for one paste. The entry is
        // pushed immediately so the paste is undoable even if that second layer
        // never materialises.
        window.__recordLayerCreate = function (indices, label) {
            if (!window.__layerHistory || window.__layerHistory.isApplying()) return null;
            const ids = [];
            const add = (i) => { if (typeof i === 'number' && ids.indexOf(i) < 0) ids.push(i); };
            (indices || []).forEach(add);
            if (!ids.length) return null;
            let snaps = null; // captured when the undo actually runs
            window.__layerHistory.push({
                label: label || 'add layer',
                undo: function () {
                    snaps = [];
                    ids.forEach(function (i) {
                        const layer = window.layers.find(l => l.index === i);
                        if (!layer) return;
                        const orderIdx = window.layerOrder.findIndex(it => it.type === 'layer' && it.id === i);
                        snaps.push({
                            layer: layer,
                            orderIdx: orderIdx,
                            orderEntry: orderIdx >= 0 ? window.layerOrder[orderIdx] : { type: 'layer', id: i }
                        });
                        window.deleteLayer(i); // its own undo push is suppressed while applying
                    });
                },
                redo: function () {
                    // Reverse order: each snapshot's slot was measured against the
                    // array as it stood at ITS deletion, so undoing them
                    // last-first rebuilds those positions exactly.
                    (snaps || []).slice().reverse().forEach(function (s) {
                        __restoreDeletedLayer(s.layer, s.orderIdx, s.orderEntry);
                    });
                }
            });
            return { add: add };
        };
        // The removal itself, shared by Delete and Flatten: no re-render and
        // no history entry (deleteLayer records one delete; flattenLayers
        // records its whole merge as one action). Returns what an undo needs.
        function __removeLayer(index) {
            // D6: snapshot for undo BEFORE anything is freed
            const _removed = layers.find(l => l.index === index);
            const _orderIdx = layerOrder.findIndex(item => item.type === 'layer' && item.id === index);
            const _orderEntry = _orderIdx >= 0 ? layerOrder[_orderIdx] : { type: 'layer', id: index };
            // flush the raster layer's live pixels into .data so the FBO can be
            // rebuilt from it on undo (rasterLayers._onDeleted frees the buffer).
            if (_removed && _removed.isRaster && window.rasterLayers && window.rasterLayers.syncData) {
                try { window.rasterLayers.syncData(); } catch (e) {}
            }
            // D2: free a raster layer's GPU buffer + history before the
            // arrays forget it existed
            if (window.rasterLayers) window.rasterLayers._onDeleted(index);
            // This layer may have been a clip SOURCE: free the coverage FBO
            // materialized for it, and unbind anyone pointing at it so they
            // fall back to None rather than to a slot a later layer reuses.
            if (window.ClipSources) {
                window.ClipSources.dropLayer(index);
                const gone = 'layer:' + index;
                layers.forEach(function (l) {
                    if (l.index !== index && window.ClipSources.keyOf(l) === gone) {
                        window.ClipSources.set(l, null);
                        if (typeof window.applyLayerClip === 'function') window.applyLayerClip(l.index);
                    }
                });
            }
            const layerDiv = document.getElementById(`layer${index}`);
            if (layerDiv) {
                layerDiv.style.backgroundImage = '';
                layerDiv.style.display = 'none';
                layerDiv.style.zIndex = '';
                layerDiv.classList.remove('active');
                // D3-3: clear the CSS clip so it can't bleed onto a reused slot
                layerDiv.style.webkitMaskImage = '';
                layerDiv.style.maskImage = '';
            }
            // Remove from layers array
            layers = layers.filter(l => l.index !== index);
            window.layers = layers;
            // Remove from layerOrder array
            layerOrder = layerOrder.filter(item => !(item.type === 'layer' && item.id === index));
            window.layerOrder = layerOrder;
            return { removed: _removed, orderIdx: _orderIdx, orderEntry: _orderEntry };
        }
        window.deleteLayer = (index) => {
            const rec = __removeLayer(index);
            // Re-render and update z-indices
            renderLayers();
            // D6: record the delete as undoable (skipped while applying undo/redo)
            if (rec.removed && window.__layerHistory) {
                window.__layerHistory.push({
                    label: 'delete layer',
                    undo: function () { __restoreDeletedLayer(rec.removed, rec.orderIdx, rec.orderEntry); },
                    redo: function () { window.deleteLayer(index); }
                });
            }
        };
        // ── Flatten (2026-10-06) ─────────────────────────────────────────
        // Merges the visible picture layers (captures, imports, cut-outs)
        // into one per RUN: picture layers next to each other in the list.
        // The sim, a collider's film and a hidden layer each end a run and
        // keep their place, so nothing on screen moves and a hidden layer
        // comes back where it was. Paint layers are left alone and do not
        // break a run: they are GPU buffers composited inside the sim canvas,
        // never between the divs.
        //
        // The merged picture is what the screen shows: each div's current
        // background (05m bakes mask + threshold into it), its CSS clip, its
        // opacity and transform, replayed the way the export compositor does
        // (24 captureCompositeFrame). The whole merge is one undo entry.
        let _flattening = false;
        window.flattenLayers = function () {
            if (_flattening) return Promise.resolve(false);
            if (window.LayerTransform && window.LayerTransform.isOpen()) window.LayerTransform.close();
            const urlOf = (css) => { const m = (css || '').match(/url\(["']?(.+?)["']?\)/); return m ? m[1] : null; };
            const runs = [[]];   // each top first, like layerOrder
            layerOrder.forEach((it) => {
                if (it.type !== 'layer') { runs.push([]); return; }
                const l = layers.find(x => x.index === it.id);
                if (!l || l.isRaster) return;
                const div = document.getElementById('layer' + l.index);
                if (!l.visible || l.isCollision || !div || !urlOf(div.style.backgroundImage)) { runs.push([]); return; }
                runs[runs.length - 1].push(l);
            });
            const groups = runs.filter(g => g.length >= 2);
            if (!groups.length) {
                const msg = 'Flatten merges visible picture layers that sit next to each other in the list. The fluid, colliders and hidden layers keep their places between them, and paint layers stay as they are.';
                if (typeof window.appAlert === 'function') window.appAlert('Nothing to flatten', msg);
                else alert(msg);
                return Promise.resolve(false);
            }
            // Layer x/y are CSS px of the box the divs fill; draw that box at
            // device resolution (long side capped) so the merge stays sharp.
            const host = document.getElementById('layers-container');
            const bw = (host && host.clientWidth) || canvas.width;
            const bh = (host && host.clientHeight) || canvas.height;
            const k = Math.min(Math.max(1, window.devicePixelRatio || 1), 4096 / Math.max(bw, bh));
            const W = Math.max(1, Math.round(bw * k)), H = Math.max(1, Math.round(bh * k));
            const load = (src) => new Promise((res) => {
                if (!src) { res(null); return; }
                const im = new Image();
                im.onload = () => res(im);
                im.onerror = () => res(null);
                im.src = src;
            });
            const jobs = groups.map(g => Promise.all(g.map(l => {
                const div = document.getElementById('layer' + l.index);
                const op = parseFloat(div.style.opacity);
                return Promise.all([
                    load(urlOf(div.style.backgroundImage)),
                    load(urlOf(div.style.webkitMaskImage || div.style.maskImage))
                ]).then(([img, maskImg]) => ({ l, img, maskImg, opacity: isNaN(op) ? 1 : op }));
            })));
            _flattening = true;
            return Promise.all(jobs).then((decoded) => {
                // Anything deleted while the pictures decoded: leave it be.
                if (groups.some(g => g.some(l => !layers.includes(l)))) return false;
                const merged = decoded.map((tasks) => {
                    const out = document.createElement('canvas');
                    out.width = W; out.height = H;
                    const ctx = out.getContext('2d');
                    let scratch = null;
                    for (let i = tasks.length - 1; i >= 0; i--) {   // bottom → top
                        const t = tasks[i];
                        if (!t.img) continue;
                        let source = t.img;
                        if (t.maskImg) {
                            // CSS mask-image applies in the div's own box
                            // before its transform: clip first, then place.
                            if (!scratch) { scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H; }
                            const s = scratch.getContext('2d');
                            s.globalCompositeOperation = 'source-over';
                            s.clearRect(0, 0, W, H);
                            s.drawImage(t.img, 0, 0, W, H);
                            s.globalCompositeOperation = 'destination-in';
                            s.drawImage(t.maskImg, 0, 0, W, H);
                            source = scratch;
                        }
                        ctx.save();
                        ctx.globalAlpha = t.opacity;
                        ctx.translate(W / 2 + (t.l.x || 0) * k, H / 2 + (t.l.y || 0) * k);
                        ctx.rotate((t.l.rotation || 0) * Math.PI / 180);
                        window.LayerXform.shearCtx(ctx, t.l);
                        ctx.scale(t.l.scaleX || 1, t.l.scaleY || 1);
                        ctx.drawImage(source, -W / 2, -H / 2, W, H);
                        ctx.restore();
                    }
                    return out.toDataURL('image/png');
                });
                // Swap: sources out top-first, then the merge goes in where
                // the topmost one stood. ops replays forward for redo and
                // backward for undo, so every recorded slot stays exact.
                const ops = [];
                groups.forEach((g, gi) => {
                    const recs = g.map(l => __removeLayer(l.index));
                    recs.forEach(r => ops.push(r));
                    const index = window.freeImageLayerIndex();
                    const flat = {
                        index: index, title: 'Flattened',
                        data: merged[gi], originalData: merged[gi],
                        visible: true, threshold: 0, active: false,
                        mask: { enabled: false, mode: 'show', shapes: [] },
                        x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0,
                        clipMaskId: null, clipInvert: false
                    };
                    window.ensureLayerDiv(index);
                    const add = { added: flat, orderIdx: recs[0].orderIdx, orderEntry: { type: 'layer', id: index } };
                    __restoreDeletedLayer(flat, add.orderIdx, add.orderEntry);
                    ops.push(add);
                });
                renderLayers();
                window.__unsavedWork = true;
                if (window.__layerHistory) {
                    window.__layerHistory.push({
                        label: 'flatten layers',
                        undo: function () {
                            for (let i = ops.length - 1; i >= 0; i--) {
                                const o = ops[i];
                                if (o.added) __removeLayer(o.added.index);
                                else __restoreDeletedLayer(o.removed, o.orderIdx, o.orderEntry);
                            }
                            renderLayers();
                        },
                        redo: function () {
                            ops.forEach(function (o) {
                                if (o.added) __restoreDeletedLayer(o.added, o.orderIdx, o.orderEntry);
                                else __removeLayer(o.removed.index);
                            });
                            renderLayers();
                        }
                    });
                }
                return true;
            }).catch((err) => {
                // A picture from another origin taints the canvas (toDataURL
                // throws) — say so rather than fail silently.
                console.warn('[layers] flatten failed', err);
                const msg = 'These layers could not be merged into one picture.';
                if (typeof window.appAlert === 'function') window.appAlert('Flatten failed', msg);
                return false;
            }).finally(() => { _flattening = false; });
        };
        // Image layer mask functions
        window.toggleImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                layer.mask.enabled = !layer.mask.enabled;
                layer.__maskDirty = true; // 7.6: reorder-reapply memo
                applyLayerMask(index);
                // On a collision layer this button IS the collider's on/off
                // switch (see its title in 05k) — the obstacle only recomposites
                // when asked, so without this the wall stayed in the sim after
                // "Collision OFF" and the fluid kept flowing around nothing.
                if (layer.isCollision && window.collisionLayers
                    && typeof window.collisionLayers.updateObstacleFromLayers === 'function') {
                    window.collisionLayers.updateObstacleFromLayers();
                }
                renderLayers();
            }
        };
        window.editImageLayerMask = (index) => {
            if (typeof window.enterImageLayerMaskMode === 'function') {
                window.enterImageLayerMaskMode(index);
            }
        };
        window.collisionFromMask = (index, createOpts) => {
            if (window.collisionLayers && typeof window.collisionLayers.createFromLayerMask === 'function') {
                window.collisionLayers.createFromLayerMask(index, createOpts);
            } else {
                console.warn('Collision system not available');
            }
        };
        window.clearImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (!layer || !layer.mask) return;
            if (!confirm('Clear mask for this layer?')) return;
            layer.mask.shapes = [];
            layer.mask.enabled = false;
            // Emptying the model is only half of it: the layer div still holds
            // the baked mask bitmap, and a collider still holds its wall in the
            // obstacle texture, until each is told to re-read. Without these the
            // button looked like a no-op — on a collision layer the fluid kept
            // flowing around a mask that no longer existed.
            layer.__maskDirty = true; // 7.6: reorder-reapply memo
            applyLayerMask(index);
            if (layer.isCollision && window.collisionLayers
                && typeof window.collisionLayers.updateObstacleFromLayers === 'function') {
                window.collisionLayers.updateObstacleFromLayers();
            }
            renderLayers();
        };
        // Layer positioning functionality
        let activeLayerIndex = null;
        let isDraggingLayer = false;
        let layerDragStartX = 0;
        let layerDragStartY = 0;
        let layerStartX = 0;
        let layerStartY = 0;
        window.toggleActiveLayer = (index) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            // Deactivate all other layers and remove their handles
            layers.forEach(l => {
                if (l.index !== index) {
                    l.active = false;
                    const div = document.getElementById(`layer${l.index}`);
                    if (div) {
                        div.classList.remove('active');
                        removeLayerResizeHandles(l.index);
                    }
                }
            });
            // Toggle this layer
            layer.active = !layer.active;
            const layerDiv = document.getElementById(`layer${index}`);
            if (layer.active) {
                layerDiv.classList.add('active');
                activeLayerIndex = index;
                createLayerResizeHandles(index);
                // Don't disable canvas pointer events just for selecting layer
                // Only disable when actually dragging/resizing
            } else {
                layerDiv.classList.remove('active');
                activeLayerIndex = null;
                removeLayerResizeHandles(index);
                // Re-enable canvas pointer events when deactivating
                canvas.style.pointerEvents = 'auto';
            }
            renderLayers();
        };
        function disablePointerEventsExceptActive(activeIndex) {
            canvas.style.pointerEvents = 'none';
            layers.forEach(l => {
                const div = document.getElementById(`layer${l.index}`);
                if (div && l.index !== activeIndex) {
                    div.style.pointerEvents = 'none';
                }
            });
        }
        function enableAllPointerEvents() {
            canvas.style.pointerEvents = 'auto';
            layers.forEach(l => {
                const div = document.getElementById(`layer${l.index}`);
                if (div) {
                    div.style.pointerEvents = l.visible ? 'none' : 'none';
                }
            });
        }
        function createLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            // Remove any existing handles first
            removeLayerResizeHandles(index);
            const handles = [
                { class: 'corner layer-resize-nw', dir: 'nw' },
                { class: 'edge layer-resize-n', dir: 'n' },
                { class: 'corner layer-resize-ne', dir: 'ne' },
                { class: 'edge layer-resize-e', dir: 'e' },
                { class: 'corner layer-resize-se', dir: 'se' },
                { class: 'edge layer-resize-s', dir: 's' },
                { class: 'corner layer-resize-sw', dir: 'sw' },
                { class: 'edge layer-resize-w', dir: 'w' }
            ];
            handles.forEach(handle => {
                const div = document.createElement('div');
                div.className = `layer-resize-handle ${handle.class}`;
                div.dataset.direction = handle.dir;
                div.dataset.layerIndex = index;
                div.style.touchAction = 'none';
                div.style.userSelect = 'none';
                div.addEventListener('pointerdown', handleLayerResizeStart);
                layerDiv.appendChild(div);
            });
            const rotateHandle = document.createElement('div');
            rotateHandle.className = 'layer-rotate-handle';
            rotateHandle.dataset.layerIndex = index;
            rotateHandle.style.touchAction = 'none';
            rotateHandle.style.userSelect = 'none';
            rotateHandle.innerHTML = '🔄';
            rotateHandle.addEventListener('pointerdown', handleLayerRotateStart);
            layerDiv.appendChild(rotateHandle);
        }
        function removeLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            const handles = layerDiv.querySelectorAll('.layer-resize-handle, .layer-rotate-handle');
            handles.forEach(handle => handle.remove());
        }
        // Layer resize functionality
        let isResizingLayer = false;
        let layerResizeDirection = null;
        let resizeLayerIndex = null;
        let layerResizeStartX = 0;
        let layerResizeStartY = 0;
        let layerResizeStartScaleX = 1;
        // Layer rotation functionality
        let isRotatingLayer = false;
        let rotateLayerIndex = null;
        let layerRotateStartAngle = 0;
        let layerRotateStartRotation = 0;
        let layerRotatePointerId = null;
        let layerRotateHandleEl = null;
        let layerResizeStartScaleY = 1;
        let layerResizeStartPosX = 0;
        let layerResizeStartPosY = 0;
        let layerResizePointerId = null;
        let layerResizeHandleEl = null;
        function handleLayerResizeStart(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            isResizingLayer = true;
            layerResizeDirection = e.target.dataset.direction;
            resizeLayerIndex = parseInt(e.target.dataset.layerIndex);
            layerResizePointerId = e.pointerId;
            layerResizeHandleEl = e.currentTarget || e.target;
            try { if (layerResizeHandleEl && layerResizeHandleEl.setPointerCapture) layerResizeHandleEl.setPointerCapture(e.pointerId); } catch (_) {}
            const layer = layers.find(l => l.index === resizeLayerIndex);
            if (!layer) return;
            layerResizeStartX = e.clientX;
            layerResizeStartY = e.clientY;
            layerResizeStartScaleX = layer.scaleX;
            layerResizeStartScaleY = layer.scaleY;
            layerResizeStartPosX = layer.x;
            layerResizeStartPosY = layer.y;
            disablePointerEventsExceptActive(resizeLayerIndex);
        }
        function handleLayerRotateStart(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            isRotatingLayer = true;
            rotateLayerIndex = parseInt(e.target.dataset.layerIndex);
            layerRotatePointerId = e.pointerId;
            layerRotateHandleEl = e.currentTarget || e.target;
            try { if (layerRotateHandleEl && layerRotateHandleEl.setPointerCapture) layerRotateHandleEl.setPointerCapture(e.pointerId); } catch (_) {}
            const layer = layers.find(l => l.index === rotateLayerIndex);
            disablePointerEventsExceptActive(rotateLayerIndex);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${rotateLayerIndex}`);
            if (!layerDiv) return;
            const rect = layerDiv.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            layerRotateStartAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            layerRotateStartRotation = layer.rotation || 0;
        }
        // Add pointer event listeners to canvas wrapper for layer dragging
        canvasWrapper.style.touchAction = 'none';
        canvasWrapper.addEventListener('pointerdown', (e) => {
            if (e.target && e.target.closest && e.target.closest('input[type="range"]')) return;
            if (activeLayerIndex === null) return;
            if (e.target.classList.contains('layer-resize-handle') || e.target.classList.contains('layer-rotate-handle')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer || !layer.active) return;
            const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
            if (!layerDiv) return;
            const rect = layerDiv.getBoundingClientRect();
            const clickX = e.clientX;
            const clickY = e.clientY;
            if (clickX < rect.left || clickX > rect.right || clickY < rect.top || clickY > rect.bottom) {
                return;
            }
            isDraggingLayer = true;
            layerDragStartX = e.clientX;
            layerDragStartY = e.clientY;
            layerStartX = layer.x;
            layerStartY = layer.y;
            layerDragPointerId = e.pointerId;
            layerDragCaptureEl = canvasWrapper;
            try { if (layerDragCaptureEl && layerDragCaptureEl.setPointerCapture) layerDragCaptureEl.setPointerCapture(e.pointerId); } catch (_) {}
            layerDiv.classList.add('dragging');
            disablePointerEventsExceptActive(activeLayerIndex);
            e.preventDefault();
        });
        document.addEventListener('pointermove', (e) => {
            // Handle layer rotation
            if (isRotatingLayer && rotateLayerIndex !== null && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                const layer = layers.find(l => l.index === rotateLayerIndex);
                if (!layer) return;
                const layerDiv = document.getElementById(`layer${rotateLayerIndex}`);
                if (!layerDiv) return;
                const rect = layerDiv.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                const angleDelta = currentAngle - layerRotateStartAngle;
                layer.rotation = layerRotateStartRotation + angleDelta;
                updateLayerPosition(rotateLayerIndex);
                if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
                return;
            }
            // Handle layer resizing
            if (isResizingLayer && resizeLayerIndex !== null && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                const layer = layers.find(l => l.index === resizeLayerIndex);
                if (!layer) return;
                const deltaX = e.clientX - layerResizeStartX;
                const deltaY = e.clientY - layerResizeStartY;
                const canvasWidth = canvasWrapper.clientWidth;
                const canvasHeight = canvasWrapper.clientHeight;
                // Calculate scale change based on direction
                const scaleFactorX = deltaX / canvasWidth;
                const scaleFactorY = deltaY / canvasHeight;
                switch (layerResizeDirection) {
                    case 'se': // Bottom-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'sw': // Bottom-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'ne': // Top-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                    case 'nw': // Top-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                    case 'e': // Right edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        break;
                    case 'w': // Left edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        break;
                    case 's': // Bottom edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'n': // Top edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                }
                updateLayerPosition(resizeLayerIndex);
                if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
                return;
            }
            // Handle layer dragging
            if (!isDraggingLayer || activeLayerIndex === null || (layerDragPointerId != null && e.pointerId !== layerDragPointerId)) return;
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer) return;
            const deltaX = e.clientX - layerDragStartX;
            const deltaY = e.clientY - layerDragStartY;
            layer.x = layerStartX + deltaX;
            layer.y = layerStartY + deltaY;
            updateLayerPosition(activeLayerIndex);
            if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                window.collisionLayers.updateObstacleFromLayers();
            }
        });
        document.addEventListener('pointerup', (e) => {
            let collisionDirty = false;
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                collisionDirty = true;
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
                if (activeLayerIndex !== null) {
                    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
                    if (layerDiv) layerDiv.classList.remove('dragging');
                }
                enableAllPointerEvents();
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                collisionDirty = true;
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
                enableAllPointerEvents();
            }
            if (isRotatingLayer && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                collisionDirty = true;
                isRotatingLayer = false;
                rotateLayerIndex = null;
                try { if (layerRotateHandleEl && layerRotateHandleEl.releasePointerCapture) layerRotateHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerRotatePointerId = null;
                layerRotateHandleEl = null;
                enableAllPointerEvents();
            }
            // Re-composite collision after any layer transform change
            if (collisionDirty && window.collisionLayers && window.collisionLayers.enabled) {
                window.collisionLayers.updateObstacleFromLayers();
            }
        });
        document.addEventListener('pointercancel', (e) => {
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
                if (activeLayerIndex !== null) {
                    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
                    if (layerDiv) layerDiv.classList.remove('dragging');
                }
                enableAllPointerEvents();
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
                enableAllPointerEvents();
            }
            if (isRotatingLayer && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                isRotatingLayer = false;
                rotateLayerIndex = null;
                try { if (layerRotateHandleEl && layerRotateHandleEl.releasePointerCapture) layerRotateHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerRotatePointerId = null;
                layerRotateHandleEl = null;
                enableAllPointerEvents();
            }
        });
        function updateLayerPosition(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            // Shared string (02a): 05k's renderLayers writes the same one, and
            // the two must agree or a reorder stomps a live transform edit.
            layerDiv.style.transform = window.LayerXform.cssTransform(layer);
            // Apply mask if enabled
            applyLayerMask(index);
        }
        // ─── Layer geometry ↔ canvas box ───────────────────────────────────────
        // layer.x/y are CSS px of the canvas box and mask/collider shape rects
        // are its buffer px (the same number — the buffer is sized from the
        // box), so both only mean anything against the box they were authored
        // in. Every way that box can change size — the window, the sidebar,
        // a resize-handle drag, focus or mobile mode, a preset restoring a
        // differently-sized box — therefore has to carry the numbers with it,
        // or each layer, and every collider built from one, slides off the
        // composition by the difference. scaleX/scaleY are deliberately NOT
        // touched: the layer div fills the box, so it already scales with it.
        //
        // `box` is the box the CURRENT numbers are expressed in. retarget()
        // moves them to a new one; assume() just declares where they already
        // are, for a caller that has done its own conversion (the preset
        // restore, which converts from the box the SNAPSHOT was saved against).
        // Keeping both through one tracker is what stops the two from
        // double-counting the same resize.
        const _geomBox = { w: 0, h: 0 };
        window.LayerGeometry = {
            box: function () { return { w: _geomBox.w, h: _geomBox.h }; },
            assume: function (w, h) {
                if (w > 0 && h > 0) { _geomBox.w = w; _geomBox.h = h; }
            },
            retarget: function (w, h) {
                if (!(w > 0 && h > 0)) return;
                // First sighting (boot): adopt the size, rescale nothing.
                if (!(_geomBox.w > 0 && _geomBox.h > 0)) { _geomBox.w = w; _geomBox.h = h; return; }
                if (w === _geomBox.w && h === _geomBox.h) return;
                const kx = w / _geomBox.w, ky = h / _geomBox.h;
                _geomBox.w = w; _geomBox.h = h;
                const ls = window.layers || [];
                for (let i = 0; i < ls.length; i++) {
                    const l = ls[i];
                    if (typeof l.x === 'number') l.x *= kx;
                    if (typeof l.y === 'number') l.y *= ky;
                    const shapes = l.mask && l.mask.shapes;
                    if (shapes) {
                        for (let j = 0; j < shapes.length; j++) {
                            const s = shapes[j];
                            // The rect only. A shape's own bitmap (samMask,
                            // depthData) is resampled into it, so its
                            // dimensions stay as they are.
                            if (typeof s.x === 'number') s.x *= kx;
                            if (typeof s.y === 'number') s.y *= ky;
                            if (typeof s.width === 'number') s.width *= kx;
                            if (typeof s.height === 'number') s.height *= ky;
                        }
                    }
                    updateLayerPosition(l.index);
                }
            }
        };
        // ═══ D2: raster paint layers ════════════════════════════════════
        // GPU-backed persistent paint layers: pixels live in rasterStore
        // (RGBA8 dye-res FBOs, declared in 05c so initFramebuffers can
        // preserve them across reinits). They are first-class layers[]
        // citizens — ordered/reordered in layerOrder alongside the sim and
        // the DOM image layers — but have NO backing div: displayFrag
        // composites them inside the GL canvas (raw vUv, after fluid
        // effects), so stills/video export inherit them from the canvas
        // snapshot for free. The lexical `sketch` alias (05c) always points
        // at the ACTIVE raster layer's FBO, which keeps every existing
        // __sketch* path (stamp/clear/ignite/capture/undo) working verbatim
        // on "the layer you're painting into".
        (function () {
            const RASTER_SLOTS = 4; // displayFrag sampler budget (uRaster0..3)
            const MODE_INT = { normal: 0, multiply: 1, screen: 2, add: 3 };
            let _activeRasterId = null;
            const _slots = [];                        // reused per frame (zero-GC)
            const _slotPool = [{}, {}, {}, {}];
            let _thumbTimer = null;
            const _thumbPending = {};
            const _EMPTY_THUMB = (function () {
                const c = document.createElement('canvas');
                c.width = c.height = 8;
                return c.toDataURL();
            })();
            function _layerFor(id) { return layers.find(l => l.index === id && l.isRaster) || null; }
            function _nextIndex() {
                // ≥100 keeps clear of the 0-9 static-div slots; dynamic
                // collision indices (maxIndex+1) simply continue above us
                let mx = 99;
                layers.forEach(l => { if (l.index > mx) mx = l.index; });
                return mx + 1;
            }
            function _newFBO() {
                return createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
            }
            function setActive(id) {
                const layer = _layerFor(id);
                if (!layer || !rasterStore[id]) return false;
                _activeRasterId = id;
                sketch = rasterStore[id];
                window.sketch = sketch;
                // patch the panel highlight in place (no full re-render)
                document.querySelectorAll('.layer-item[data-raster="1"]').forEach(el => {
                    const on = parseInt(el.dataset.layerIndex, 10) === id;
                    el.classList.toggle('raster-active', on);
                    const btn = el.querySelector('.raster-paint-btn');
                    if (btn) btn.classList.toggle('active', on);
                });
                if (typeof window.__onActiveRasterChanged === 'function') window.__onActiveRasterChanged(id, layer.title);
                return true;
            }
            function create(name) {
                const id = _nextIndex();
                rasterStore[id] = _newFBO();
                layers.push({
                    index: id,
                    title: name || ('Paint ' + (layers.filter(l => l.isRaster).length + 1)),
                    data: _EMPTY_THUMB, originalData: null,
                    visible: true, active: false, threshold: 0,
                    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0,
                    isRaster: true, opacity: 1, blendMode: 'normal',
                    mask: { enabled: false, mode: 'show', shapes: [] }
                });
                // insert just above the sim entry — new paint composites
                // over the fluid, like the original sketch layer did
                const simIdx = layerOrder.findIndex(o => o.type === 'sim');
                layerOrder.splice(simIdx >= 0 ? simIdx : 0, 0, { type: 'layer', id: id });
                setActive(id);
                if (typeof renderLayers === 'function') renderLayers();
                return id;
            }
            // createIfMissing=false: adopt an existing paint layer but never
            // mint one (boot — see the boot block at the bottom of this IIFE).
            function ensureDefault(createIfMissing) {
                if (layers.some(l => l.isRaster)) {
                    if (_activeRasterId == null || !_layerFor(_activeRasterId) || !rasterStore[_activeRasterId]) {
                        const first = layers.find(l => l.isRaster && rasterStore[l.index]);
                        if (first) setActive(first.index);
                    }
                    return _activeRasterId;
                }
                if (createIfMissing === false) return null;
                // Default title ('Paint N'): the "Sketch" name belonged to the
                // retired Paint Into > Sketch UI.
                return create();
            }
            function _onDeleted(id) {
                if (!rasterStore[id]) return;
                gl.deleteTexture(rasterStore[id].texture);
                gl.deleteFramebuffer(rasterStore[id].fbo);
                delete rasterStore[id];
                if (typeof window.__sketchUndoPurge === 'function') window.__sketchUndoPurge(id);
                // let the live collider binding notice its source is gone
                // (23's refresh sees the missing FBO and auto-unbinds)
                if (typeof window.__onSketchMutated === 'function') window.__onSketchMutated(id);
                if (_activeRasterId === id) {
                    _activeRasterId = null;
                    sketch = null;
                    window.sketch = null;
                    const next = layers.find(l => l.isRaster && l.index !== id && rasterStore[l.index]);
                    if (next) setActive(next.index);
                    // else: the next sketch-route dab lazily recreates a default
                    else if (typeof window.__onActiveRasterChanged === 'function') window.__onActiveRasterChanged(null, null);
                }
            }
            // Per-frame: visible raster layers in composite order (bottom →
            // top, so below-fluid slots come first), capped at the shader's
            // 4-slot budget — the TOPMOST extras drop (painting order wins).
            function collectSlots() {
                _slots.length = 0;
                let passedSim = false;
                for (let i = layerOrder.length - 1; i >= 0; i--) {
                    const item = layerOrder[i];
                    if (item.type === 'sim') { passedSim = true; continue; }
                    const layer = _layerFor(item.id);
                    if (!layer || !layer.visible) continue;
                    const f = rasterStore[layer.index];
                    if (!f) continue;
                    if (_slots.length >= RASTER_SLOTS) break;
                    const s = _slotPool[_slots.length];
                    s.texture = f.texture;
                    s.opacity = (typeof layer.opacity === 'number') ? layer.opacity : 1;
                    s.mode = MODE_INT[layer.blendMode] || 0;
                    s.under = !passedSim;
                    // D3 clip binding: a clip source's coverage gates this
                    // layer — a Mask, or another layer's mask/collider (05o).
                    const ck = (window.ClipSources && window.ClipSources.keyOf)
                        ? window.ClipSources.keyOf(layer) : null;
                    const cf = ck ? window.ClipSources.getFBO(ck) : null;
                    s.clipTex = cf ? cf.texture : null;
                    s.clipInvert = !!layer.clipInvert;
                    _slots.push(s);
                }
                return _slots;
            }
            // Readback → 2D canvas, flipped to top-down and UNPREMULTIPLIED
            // (the FBO stores premultiplied; PNG wants straight — without
            // the divide, every save/restore round-trip darkens the edges).
            function _readbackCanvas(f, outW, outH) {
                // Lost context ⇒ readPixels is a silent no-op ⇒ all-zero pixels.
                // Return null so callers keep the last good data instead of
                // overwriting it with a blank (context-loss snapshot path).
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
                    const src = (f.height - 1 - y) * f.width * 4;
                    const dst = y * f.width * 4;
                    for (let x = 0; x < f.width * 4; x += 4) {
                        const a = px[src + x + 3];
                        const inv = a > 0 ? 255 / a : 0;
                        img.data[dst + x] = Math.min(255, px[src + x] * inv);
                        img.data[dst + x + 1] = Math.min(255, px[src + x + 1] * inv);
                        img.data[dst + x + 2] = Math.min(255, px[src + x + 2] * inv);
                        img.data[dst + x + 3] = a;
                    }
                }
                ctx.putImageData(img, 0, 0);
                if (outW && (outW !== f.width || outH !== f.height)) {
                    const small = document.createElement('canvas');
                    small.width = outW; small.height = outH;
                    small.getContext('2d').drawImage(c, 0, 0, outW, outH);
                    return small;
                }
                return c;
            }
            // Coalesced panel-thumbnail refresh (stroke-END cadence via
            // __onRasterMutated, never per dab — same rule as the live
            // collider readback in 23).
            function _queueThumb(rid) {
                _thumbPending[rid] = true;
                if (_thumbTimer) return;
                _thumbTimer = setTimeout(function () {
                    _thumbTimer = null;
                    Object.keys(_thumbPending).forEach(function (k) {
                        delete _thumbPending[k];
                        const id = parseInt(k, 10);
                        const layer = _layerFor(id);
                        const f = rasterStore[id];
                        if (!layer || !f) return;
                        const th = Math.max(1, Math.round(96 * f.height / f.width));
                        const rc = _readbackCanvas(f, 96, th);
                        if (!rc) return;
                        // Panel preview ONLY — must not land in layer.data, which
                        // is the persistence field. It used to, so any snapshot
                        // taken without a syncData() first (notably the
                        // context-loss recovery snapshot, where readback is a
                        // no-op) serialized 96-px thumbnails as the artwork and
                        // "restored" the painting as an upscaled blur.
                        layer.thumb = rc.toDataURL();
                        const thumbEl = document.querySelector('.layer-item[data-layer-index="' + id + '"] .layer-thumbnail');
                        if (thumbEl) thumbEl.style.backgroundImage = 'url(' + layer.thumb + ')';
                    });
                }, 200);
            }
            window.__onRasterMutated = function (rid) {
                window.__unsavedWork = true; // every sketch/paint mutation funnels through here
                if (rid != null) _queueThumb(rid);
            };
            // Full-res layer.data refresh — called by save (12) right before
            // serializing so raster pixels round-trip through presets.
            function syncData() {
                layers.forEach(function (layer) {
                    if (!layer.isRaster) return;
                    const f = rasterStore[layer.index];
                    if (!f) return;
                    const rc = _readbackCanvas(f);
                    if (rc) layer.data = rc.toDataURL('image/png');
                });
            }
            // (Re)create a restored layer's FBO and upload its saved pixels.
            function restoreFromData(layer) {
                if (!rasterStore[layer.index]) rasterStore[layer.index] = _newFBO();
                if (!layer.data) return;
                const img = new Image();
                img.onload = function () {
                    const f = rasterStore[layer.index];
                    if (!f) return; // deleted while the image decoded
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
                    _queueThumb(layer.index);
                };
                img.src = layer.data;
            }
            // After a preset load rebuilt layers[]: free orphaned FBOs,
            // create+refill FBOs for restored raster layers, re-point the
            // active alias.
            function reconcile() {
                Object.keys(rasterStore).forEach(function (k) {
                    const id = parseInt(k, 10);
                    if (!_layerFor(id)) {
                        gl.deleteTexture(rasterStore[id].texture);
                        gl.deleteFramebuffer(rasterStore[id].fbo);
                        delete rasterStore[id];
                        if (typeof window.__sketchUndoPurge === 'function') window.__sketchUndoPurge(id);
                    }
                });
                layers.forEach(function (layer) {
                    // __needsRestore: set by a project/preset load so saved pixels
                    // overwrite an FBO that already exists at this index (see
                    // 12-save-load.js) — without it, loading a project onto the
                    // boot sketch layer silently kept the empty buffer.
                    if (layer.isRaster && (!rasterStore[layer.index] || layer.__needsRestore)) {
                        delete layer.__needsRestore;
                        restoreFromData(layer);
                    }
                });
                if (_activeRasterId == null || !_layerFor(_activeRasterId) || !rasterStore[_activeRasterId]) {
                    _activeRasterId = null;
                    sketch = null;
                    window.sketch = null;
                    const first = layers.find(function (l) { return l.isRaster && rasterStore[l.index]; });
                    if (first) setActive(first.index);
                }
            }
            window.rasterLayers = {
                create: create,
                ensureDefault: ensureDefault,
                setActive: setActive,
                activeId: function () { return _activeRasterId; },
                getFBO: function (id) { return rasterStore[id] || null; },
                list: function () { return layers.filter(function (l) { return l.isRaster; }); },
                collectSlots: collectSlots,
                restoreFromData: restoreFromData,
                reconcile: reconcile,
                syncData: syncData,
                _onDeleted: _onDeleted
            };
            // Boot: adopt a restored paint layer if a project brought one,
            // but do NOT mint an empty one (2026-08-16) — the brush's Paint
            // Into > Sketch UI is gone, so a "Sketch" layer nobody asked for
            // was just clutter at the top of the Layers panel. Paint layers
            // are created on demand: the panel's '➕ Paint Layer' button, or
            // lazily by the first sketch-route dab (05i stampSketchDab).
            // Zero raster layers is an already-supported state — it's what
            // deleting them all leaves behind (compositor slots go null).
            (function boot() {
                if (window.__scriptsReady) { ensureDefault(false); }
                else setTimeout(boot, 120);
            })();
        })();
