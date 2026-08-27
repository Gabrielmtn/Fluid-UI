/**
 * Layer Transform Overlay — move / resize / rotate image & collision layers.
 *
 * Replaces the old in-DOM handle system (handles sat at the canvas edge and
 * drags bubbled into the sim, painting fluid). The overlay floats above
 * everything, swallows pointer events, and drives the existing layer model
 * (layer.x/y/scaleX/scaleY/rotation + window.updateLayerPosition) live.
 *
 * Chrome is AMBER to distinguish it from the cyan sim border, and the sim
 * border / resize handles are dimmed via body.layer-transform-active while
 * the overlay is open.
 *
 * window.LayerTransform = { open(index), close(), isOpen() }
 */
(function () {
    'use strict';

    const CHROME = 'rgba(255, 190, 70, 0.95)';      // amber — distinct from cyan sim border
    const CHROME_DIM = 'rgba(255, 190, 70, 0.55)';
    const HANDLE_HIT = 14;   // px hit radius for handles
    const ROTATE_OFFSET = 34; // px above the top edge

    let overlay = null;
    let tCanvas = null;
    let tCtx = null;
    let layerIndex = null;
    let original = null;     // snapshot for cancel
    let drag = null;         // { mode, corner, startX, startY, start: {...}, startLocal }
    let cleanupFns = [];

    function getLayer() {
        return (window.layers || []).find(l => l.index === layerIndex) || null;
    }

    function wrapperRect() {
        const wrap = document.getElementById('canvas-wrapper');
        return wrap ? wrap.getBoundingClientRect() : null;
    }

    // Geometry of the layer in overlay-canvas coordinates.
    // Layer divs fill the wrapper; transform-origin is center, so:
    // center = wrapper center + (x, y); half extents scale the wrapper size.
    function geom() {
        const layer = getLayer();
        const wr = wrapperRect();
        if (!layer || !wr || !tCanvas) return null;
        const cRect = tCanvas.getBoundingClientRect();
        return {
            cx: wr.left + wr.width / 2 + layer.x - cRect.left,
            cy: wr.top + wr.height / 2 + layer.y - cRect.top,
            hw: (wr.width / 2) * layer.scaleX,
            hh: (wr.height / 2) * layer.scaleY,
            rot: (layer.rotation || 0) * Math.PI / 180,
            kx: Math.tan((layer.skewX || 0) * Math.PI / 180),
            ky: Math.tan((layer.skewY || 0) * Math.PI / 180)
        };
    }

    // Pointer position → layer-local (de-rotated, de-sheared, center-origin)
    // coords — the frame where the rect corners sit at (±hw, ±hh). Forward is
    // screen = center + R·K·local, so back out R then K (02a-layer-xform).
    function toLocal(g, px, py) {
        const dx = px - g.cx, dy = py - g.cy;
        const cos = Math.cos(-g.rot), sin = Math.sin(-g.rot);
        const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
        const kx = g.kx || 0, ky = g.ky || 0;
        let det = 1 - kx * ky;
        if (Math.abs(det) < 1e-4) det = det < 0 ? -1e-4 : 1e-4;
        return { x: (rx - kx * ry) / det, y: (ry - ky * rx) / det };
    }

    function corners(g) {
        return [
            { id: 'nw', lx: -g.hw, ly: -g.hh, cursor: 'nwse-resize' },
            { id: 'ne', lx: g.hw,  ly: -g.hh, cursor: 'nesw-resize' },
            { id: 'sw', lx: -g.hw, ly: g.hh,  cursor: 'nesw-resize' },
            { id: 'se', lx: g.hw,  ly: g.hh,  cursor: 'nwse-resize' }
        ];
    }

    // Skew handles: diamonds at the edge midpoints. Top/bottom shear along X
    // (perspective lean), left/right shear along Y.
    function skewHandles(g) {
        return [
            { id: 'n', lx: 0, ly: -g.hh, axis: 'x', cursor: 'ew-resize' },
            { id: 's', lx: 0, ly: g.hh,  axis: 'x', cursor: 'ew-resize' },
            { id: 'w', lx: -g.hw, ly: 0, axis: 'y', cursor: 'ns-resize' },
            { id: 'e', lx: g.hw,  ly: 0, axis: 'y', cursor: 'ns-resize' }
        ];
    }

    // De-rotate only — no unshear. Handles are hit-tested in THIS frame
    // against their forward-sheared anchors (K·anchor), which is well-defined
    // even when the shear determinant collapses. An inverse-mapped test can
    // never match on a collapsed layer (old saves / peers can carry
    // tan·tan ≈ 1, where K⁻¹ blows up) — and the skew diamonds staying
    // grabbable there is the recovery path.
    function toRotFrame(g, px, py) {
        const dx = px - g.cx, dy = py - g.cy;
        const cos = Math.cos(-g.rot), sin = Math.sin(-g.rot);
        return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }
    function shearFwd(g, lx, ly) {
        return { x: lx + (g.kx || 0) * ly, y: (g.ky || 0) * lx + ly };
    }

    function hitTest(px, py) {
        const g = geom();
        if (!g) return null;
        const u = toRotFrame(g, px, py);
        for (const c of corners(g)) {
            const a = shearFwd(g, c.lx, c.ly);
            if (Math.abs(u.x - a.x) <= HANDLE_HIT && Math.abs(u.y - a.y) <= HANDLE_HIT) {
                return { mode: 'scale', corner: c, local: toLocal(g, px, py) };
            }
        }
        for (const s of skewHandles(g)) {
            const a = shearFwd(g, s.lx, s.ly);
            if (Math.abs(u.x - a.x) <= HANDLE_HIT && Math.abs(u.y - a.y) <= HANDLE_HIT) {
                return { mode: 'skew', handle: s };
            }
        }
        // Rotate handle above top-center (drawn in the sheared frame too)
        const ra = shearFwd(g, 0, -g.hh - ROTATE_OFFSET);
        if (Math.abs(u.x - ra.x) <= HANDLE_HIT && Math.abs(u.y - ra.y) <= HANDLE_HIT) {
            return { mode: 'rotate' };
        }
        const l = toLocal(g, px, py);
        if (Math.abs(l.x) <= g.hw + 6 && Math.abs(l.y) <= g.hh + 6) {
            return { mode: 'move' };
        }
        return null;
    }

    // Pointer → implied skew angle for a handle, in the de-rotated frame:
    // the midpoint rides at K·(0,±hh) or K·(±hw,0), so its displacement
    // along the edge over the half-extent IS the shear tangent.
    function pointerToSkewDeg(g, handle, px, py, rotRad) {
        const dx = px - g.cx, dy = py - g.cy;
        const cos = Math.cos(-rotRad), sin = Math.sin(-rotRad);
        const ux = dx * cos - dy * sin, uy = dx * sin + dy * cos;
        if (handle.axis === 'x') {
            const hh = Math.max(1e-3, Math.abs(g.hh));
            return Math.atan((handle.id === 'n') ? (-ux / hh) : (ux / hh)) * 180 / Math.PI;
        }
        const hw = Math.max(1e-3, Math.abs(g.hw));
        return Math.atan((handle.id === 'e') ? (uy / hw) : (-uy / hw)) * 180 / Math.PI;
    }

    function draw() {
        const g = geom();
        if (!g || !tCtx) return;
        const w = tCanvas.width, h = tCanvas.height;
        tCtx.clearRect(0, 0, w, h);

        tCtx.save();
        tCtx.translate(g.cx, g.cy);
        tCtx.rotate(g.rot);
        // Shear the chrome with the layer (rotate → skew → scale order, same
        // as the CSS/composite contract in 02a; hw/hh already carry the scale).
        // Everything below — rect, handles, rotate glyph — lives in the
        // sheared frame so it matches toLocal's inverse exactly.
        if (g.kx || g.ky) tCtx.transform(1, g.ky, g.kx, 1, 0, 0);

        // Layer rect (dashed amber)
        tCtx.strokeStyle = CHROME;
        tCtx.lineWidth = 1.5;
        tCtx.setLineDash([7, 5]);
        tCtx.strokeRect(-g.hw, -g.hh, g.hw * 2, g.hh * 2);
        tCtx.setLineDash([]);

        // Corner handles
        corners(g).forEach(c => {
            tCtx.fillStyle = CHROME;
            tCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            tCtx.lineWidth = 1.5;
            tCtx.beginPath();
            tCtx.rect(c.lx - 5, c.ly - 5, 10, 10);
            tCtx.fill();
            tCtx.stroke();
        });

        // Skew handles: edge-midpoint parallelograms — the glyph shows what
        // the drag does (top/bottom lean the layer sideways, left/right lean
        // it vertically).
        skewHandles(g).forEach(s => {
            tCtx.fillStyle = CHROME_DIM;
            tCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            tCtx.lineWidth = 1.5;
            tCtx.beginPath();
            if (s.axis === 'x') {
                tCtx.moveTo(s.lx - 4, s.ly - 4);
                tCtx.lineTo(s.lx + 10, s.ly - 4);
                tCtx.lineTo(s.lx + 4, s.ly + 4);
                tCtx.lineTo(s.lx - 10, s.ly + 4);
            } else {
                tCtx.moveTo(s.lx - 4, s.ly - 4);
                tCtx.lineTo(s.lx - 4, s.ly + 10);
                tCtx.lineTo(s.lx + 4, s.ly + 4);
                tCtx.lineTo(s.lx + 4, s.ly - 10);
            }
            tCtx.closePath();
            tCtx.fill();
            tCtx.stroke();
        });

        // Rotate handle: stem + circle above top edge
        tCtx.strokeStyle = CHROME_DIM;
        tCtx.lineWidth = 1.5;
        tCtx.beginPath();
        tCtx.moveTo(0, -g.hh);
        tCtx.lineTo(0, -g.hh - ROTATE_OFFSET + 7);
        tCtx.stroke();
        tCtx.fillStyle = 'rgba(20, 16, 8, 0.85)';
        tCtx.strokeStyle = CHROME;
        tCtx.beginPath();
        tCtx.arc(0, -g.hh - ROTATE_OFFSET, 8, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.stroke();
        // Small rotation glyph (arc with arrowhead)
        tCtx.strokeStyle = CHROME;
        tCtx.lineWidth = 1.4;
        tCtx.beginPath();
        tCtx.arc(0, -g.hh - ROTATE_OFFSET, 4, -Math.PI * 0.75, Math.PI * 0.6);
        tCtx.stroke();

        tCtx.restore();
    }

    function applyLive() {
        if (typeof window.updateLayerPosition === 'function') {
            window.updateLayerPosition(layerIndex);
        }
        const layer = getLayer();
        if (layer && layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
            window.collisionLayers.updateObstacleFromLayers();
        }
        draw();
    }

    function onPointerDown(e) {
        const rect = tCanvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        const hit = hitTest(px, py);
        if (!hit) return;
        e.preventDefault();
        const layer = getLayer();
        if (!layer) return;
        const g = geom();
        drag = {
            mode: hit.mode,
            corner: hit.corner || null,
            handle: hit.handle || null,
            startX: px,
            startY: py,
            start: { x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY,
                     rotation: layer.rotation || 0, skewX: layer.skewX || 0, skewY: layer.skewY || 0 },
            startLocal: hit.local || null,
            startAngle: Math.atan2(py - g.cy, px - g.cx)
        };
        if (hit.mode === 'skew') {
            // Grab-offset, like rotate's startAngle: the diamond's hit box is
            // ±14 local px, so an off-center grab must not jump the value on
            // the first move (at small scales the jump reached ~35°).
            const pdeg = pointerToSkewDeg(g, hit.handle, px, py, (layer.rotation || 0) * Math.PI / 180);
            drag.skewGrabOffset = ((hit.handle.axis === 'x') ? drag.start.skewX : drag.start.skewY) - pdeg;
        }
        tCanvas.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        const rect = tCanvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;

        if (!drag) {
            const hit = hitTest(px, py);
            tCanvas.style.cursor = !hit ? 'default'
                : hit.mode === 'move' ? 'move'
                : hit.mode === 'rotate' ? 'grab'
                : hit.mode === 'skew' ? hit.handle.cursor
                : hit.corner.cursor;
            return;
        }

        e.preventDefault();
        const layer = getLayer();
        if (!layer) return;

        if (drag.mode === 'move') {
            layer.x = drag.start.x + (px - drag.startX);
            layer.y = drag.start.y + (py - drag.startY);
        } else if (drag.mode === 'rotate') {
            const g = geom();
            const angle = Math.atan2(py - g.cy, px - g.cx);
            let deg = drag.start.rotation + (angle - drag.startAngle) * 180 / Math.PI;
            // Snap to right angles when close
            const snapped = Math.round(deg / 90) * 90;
            if (Math.abs(deg - snapped) < 4) deg = snapped;
            layer.rotation = deg;
        } else if (drag.mode === 'skew') {
            const live = geom();
            const h = drag.handle;
            let deg = pointerToSkewDeg(live, h, px, py, drag.start.rotation * Math.PI / 180)
                + (drag.skewGrabOffset || 0);
            // Clamp so tan stays sane; snap flat near 0 (mirrors the 4°
            // rotation snap); Shift = 15° steps for repeatable perspectives.
            deg = Math.max(-60, Math.min(60, deg));
            if (Math.abs(deg) < 2) deg = 0;
            else if (e.shiftKey) deg = Math.round(deg / 15) * 15;
            // Keep the shear invertible: tan(x)·tan(y) → 1 collapses the
            // layer to a line — and 45°/45° plus the 60°/30° Shift snaps land
            // EXACTLY on it, after which this overlay is the only way back
            // out. Pull this axis back so the determinant stays clear of 0.
            const ot = Math.tan(((h.axis === 'x') ? drag.start.skewY : drag.start.skewX) * Math.PI / 180);
            let t = Math.tan(deg * Math.PI / 180);
            if (Math.abs(1 - t * ot) < 0.05) {
                t = (1 - 0.05 * Math.sign(t * ot || 1)) / ot;
                deg = Math.atan(t) * 180 / Math.PI;
            }
            if (h.axis === 'x') layer.skewX = deg; else layer.skewY = deg;
        } else {
            // Scale about center, in the layer's local (de-rotated, de-
            // sheared) space — the START pose's inverse, so the corner
            // being dragged is compared against where it was grabbed.
            // Hold Shift for proportional scaling.
            const live = geom();
            const l = toLocal({
                cx: live.cx, cy: live.cy,
                rot: drag.start.rotation * Math.PI / 180,
                kx: Math.tan(drag.start.skewX * Math.PI / 180),
                ky: Math.tan(drag.start.skewY * Math.PI / 180)
            }, px, py);
            const s = drag.startLocal;
            let sx = Math.abs(s.x) > 1e-3 ? drag.start.scaleX * (l.x / s.x) : drag.start.scaleX;
            let sy = Math.abs(s.y) > 1e-3 ? drag.start.scaleY * (l.y / s.y) : drag.start.scaleY;
            sx = Math.max(0.05, sx);
            sy = Math.max(0.05, sy);
            if (e.shiftKey) {
                const u = Math.max(sx / drag.start.scaleX, sy / drag.start.scaleY);
                sx = drag.start.scaleX * u;
                sy = drag.start.scaleY * u;
            }
            layer.scaleX = sx;
            layer.scaleY = sy;
        }
        applyLive();
    }

    function onPointerUp(e) {
        if (!drag) return;
        drag = null;
        try { tCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    function open(index) {
        if (overlay) close();
        const layer = (window.layers || []).find(l => l.index === index);
        if (!layer) return;

        // Retire any old-style active layer chrome
        (window.layers || []).forEach(l => {
            if (l.active && typeof window.toggleActiveLayer === 'function') {
                window.toggleActiveLayer(l.index);
            }
        });

        layerIndex = index;
        original = { x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY,
                     rotation: layer.rotation || 0, skewX: layer.skewX || 0, skewY: layer.skewY || 0 };

        // Make sure the layer content is actually visible while transforming —
        // collision layers are often hidden, which used to leave the user
        // dragging a blind wireframe. The .transform-ghost class forces
        // display/opacity/z-index via CSS; renderLayers() on close restores.
        const layerDiv = document.getElementById('layer' + index);
        if (layerDiv) {
            if (layer.isCollision && typeof window.applyLayerMask === 'function') {
                window.applyLayerMask(index); // ensure preview reflects current threshold/invert
            }
            layerDiv.classList.add('transform-ghost');
        }

        overlay = document.createElement('div');
        overlay.id = 'layerTransformOverlay';
        overlay.innerHTML = `
            <div class="draw-toolbar">
                <span class="layer-transform-title">⤢ ${layer.title || 'Layer ' + index}</span>
                <span class="layer-transform-hint">drag to move · corners to resize (Shift = proportional) · edges to skew · ↻ to rotate</span>
                <button id="layerTransformDone" type="button">Done</button>
                <button id="layerTransformCancel" type="button">Cancel</button>
            </div>
            <div class="draw-canvas-area">
                <canvas id="layerTransformCanvas"></canvas>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('layer-transform-active');

        tCanvas = document.getElementById('layerTransformCanvas');
        const area = overlay.querySelector('.draw-canvas-area');
        const sizeCanvas = () => {
            const r = area.getBoundingClientRect();
            tCanvas.width = r.width;
            tCanvas.height = r.height;
        };
        sizeCanvas();
        tCtx = tCanvas.getContext('2d');

        tCanvas.addEventListener('pointerdown', onPointerDown);
        tCanvas.addEventListener('pointermove', onPointerMove);
        tCanvas.addEventListener('pointerup', onPointerUp);
        tCanvas.addEventListener('pointercancel', onPointerUp);

        const onResize = () => { sizeCanvas(); draw(); };
        window.addEventListener('resize', onResize);
        cleanupFns.push(() => window.removeEventListener('resize', onResize));

        const onKey = (e) => {
            if (e.key === 'Escape') cancel();
            else if (e.key === 'Enter') close();
        };
        document.addEventListener('keydown', onKey);
        cleanupFns.push(() => document.removeEventListener('keydown', onKey));

        document.getElementById('layerTransformDone').onclick = (e) => { e.preventDefault(); close(); };
        document.getElementById('layerTransformCancel').onclick = (e) => { e.preventDefault(); cancel(); };

        draw();
    }

    function close() {
        if (!overlay) return;
        cleanupFns.forEach(fn => fn());
        cleanupFns = [];
        const ghostDiv = layerIndex !== null ? document.getElementById('layer' + layerIndex) : null;
        if (ghostDiv) ghostDiv.classList.remove('transform-ghost');
        overlay.remove();
        overlay = null;
        tCanvas = null;
        tCtx = null;
        drag = null;
        layerIndex = null;
        original = null;
        document.body.classList.remove('layer-transform-active');
        if (typeof window.renderLayers === 'function') window.renderLayers();
    }

    function cancel() {
        const layer = getLayer();
        if (layer && original) {
            layer.x = original.x;
            layer.y = original.y;
            layer.scaleX = original.scaleX;
            layer.scaleY = original.scaleY;
            layer.rotation = original.rotation;
            layer.skewX = original.skewX;
            layer.skewY = original.skewY;
            if (typeof window.updateLayerPosition === 'function') window.updateLayerPosition(layerIndex);
            if (layer.isCollision && window.collisionLayers && window.collisionLayers.enabled) {
                window.collisionLayers.updateObstacleFromLayers();
            }
        }
        close();
    }

    window.LayerTransform = {
        open: open,
        close: close,
        isOpen: () => !!overlay
    };
})();
