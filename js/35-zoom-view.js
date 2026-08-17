// ═══════════════════════════════════════════════════════════════════
// js/35-zoom-view.js — Zoom View + Zoom Mode
// LOAD ORDER: after 34-mandala-mode.js (end of body)
// PROVIDES: window.ZoomView — a CSS view transform over #canvas-wrapper
//   (scale + pan) for detail work, plus Zoom Mode (hotkey Z) where the
//   wheel/drag drive the view instead of the brush. Mandala's Fill control
//   is a wedge-targeted preset of the same transform.
// REQUIRES: #canvas, #canvas-wrapper, #canvas-area
//
// Why a CSS transform and not a GL change: the sim, the guides overlay and
// the canvas all live inside #canvas-wrapper, so one transform moves them
// together and stays pixel-exact with zero shader work. Painting keeps
// working while zoomed because getCanvasCoordinates (02-palettes) maps
// through getBoundingClientRect, which already includes the transform.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    const wrapper = document.getElementById('canvas-wrapper');
    const area = document.getElementById('canvas-area');
    if (!canvas || !wrapper || !area) return;

    let scale = 1, tx = 0, ty = 0;          // t is in pre-scale wrapper px
    const MIN = 1, MAX = 12;

    function apply() {
        if (scale === 1 && tx === 0 && ty === 0) {
            wrapper.style.transform = '';
            area.style.overflow = '';
        } else {
            wrapper.style.transformOrigin = '50% 50%';
            wrapper.style.transform = 'scale(' + scale + ') translate(' + tx + 'px,' + ty + 'px)';
            // A scaled wrapper would otherwise spill over the sidebar/underbar.
            area.style.overflow = 'hidden';
        }
        if (typeof window.__onZoomViewChange === 'function') window.__onZoomViewChange();
    }

    function clampScale(s) { return Math.max(MIN, Math.min(MAX, s)); }

    const ZoomView = {
        get scale() { return scale; },
        set: function (s, nx, ny) {
            scale = clampScale(s);
            if (typeof nx === 'number') tx = nx;
            if (typeof ny === 'number') ty = ny;
            if (scale === 1) { tx = 0; ty = 0; }
            apply();
        },
        panBy: function (dxCss, dyCss) {
            // Nothing to pan at 1:1 — the canvas already fits its frame, and
            // #canvas-area clips, so dragging here just slid the artwork out
            // of view with no zoom on screen to explain where it went.
            if (scale === 1) return;
            tx += dxCss / scale; ty += dyCss / scale; apply();
        },
        // Zoom about a client-space point so the pixel under the cursor stays put.
        //
        // The transform is `scale(s) translate(t)` about the wrapper's MIDDLE,
        // so a local point p lands at:
        //     client(p) = L0 + c + s * (p + t - c)
        // where c is the pre-transform half-size and L0 the untransformed edge.
        // Holding client(p) fixed across s -> s' gives, after the p terms
        // cancel, a direct update that needs no rect from the new scale:
        //     t' = t + (clientX - left + s * (t - c)) * (1/s' - 1/s)
        //
        // The previous version subtracted t out of the local position even
        // though getBoundingClientRect().left already includes it (so t was
        // double-counted), then reused the PRE-zoom rect with the POST-zoom
        // scale, and left the recentre term as a literal `tx -= 0`. The cursor
        // point drifted ~48px on the first notch of an 800px wrapper and
        // further every notch — the zoom ran away from the pointer.
        zoomAt: function (factor, clientX, clientY) {
            const before = wrapper.getBoundingClientRect();
            const next = clampScale(scale * factor);
            if (next === scale) return;
            // Pre-transform half-size: the rect is scaled, so divide it back out.
            const cx = before.width / scale / 2, cy = before.height / scale / 2;
            // Cursor offset from the UNTRANSFORMED centre, in client px.
            const ax = (clientX - before.left) + scale * (tx - cx);
            const ay = (clientY - before.top) + scale * (ty - cy);
            const inv = 1 / next - 1 / scale;
            tx += ax * inv;
            ty += ay * inv;
            scale = next;
            // Back at 1:1 there is nothing to pan around; keeping a leftover
            // translate here strands the canvas off-frame with no zoom on
            // screen to explain it (apply() also only clears the transform
            // when all three are neutral).
            if (scale === 1) { tx = 0; ty = 0; }
            apply();
        },
        reset: function () { scale = 1; tx = 0; ty = 0; apply(); },
        // Frame a direction/offset within the canvas: dir is a unit vector in
        // screen space from the canvas centre, s the zoom factor.
        focus: function (dirX, dirY, dist, s) {
            scale = clampScale(s);
            const W = canvas.offsetWidth, H = canvas.offsetHeight;
            const rMax = Math.min(W, H) / 2;
            tx = -dirX * dist * rMax;
            ty = -dirY * dist * rMax;
            apply();
        }
    };
    window.ZoomView = ZoomView;

    // ── Zoom Mode: the view takes over the wheel and drag ────────────
    let zoomMode = false;
    const modeEl = document.getElementById('zoomModeToggle');

    function setZoomMode(on) {
        zoomMode = !!on;
        if (modeEl && modeEl.checked !== zoomMode) modeEl.checked = zoomMode;
        document.body.classList.toggle('zoom-mode', zoomMode);
        canvas.style.cursor = zoomMode ? 'grab' : '';
    }
    window.setZoomMode = setZoomMode;
    if (modeEl) modeEl.addEventListener('change', function (e) { setZoomMode(e.target.checked); });

    // Capture phase, so these beat the brush-size wheel handler and the paint
    // pointer handlers rather than racing them.
    area.addEventListener('wheel', function (e) {
        if (!zoomMode) return;
        e.preventDefault();
        // stopImmediatePropagation, not stopPropagation: the brush-size wheel
        // handler is bound to THIS SAME element (#canvas-area). For a wheel over
        // the canvas the two are capture-vs-bubble and stopPropagation is
        // enough, but over the ~24px letterbox margin both listeners are
        // AT_TARGET, where stopPropagation does not stop a same-element peer —
        // so one notch there zoomed AND resized the brush.
        e.stopImmediatePropagation();
        ZoomView.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    }, { capture: true, passive: false });

    let dragging = false, lastX = 0, lastY = 0;
    area.addEventListener('pointerdown', function (e) {
        if (!zoomMode) return;
        e.preventDefault(); e.stopPropagation();
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        canvas.style.cursor = 'grabbing';
        try { area.setPointerCapture(e.pointerId); } catch (_) {}
    }, true);
    area.addEventListener('pointermove', function (e) {
        if (!zoomMode) return;
        if (!dragging) return;
        e.preventDefault(); e.stopPropagation();
        ZoomView.panBy(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
    }, true);
    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = zoomMode ? 'grab' : '';
        if (e) { e.preventDefault(); e.stopPropagation(); }
    }
    area.addEventListener('pointerup', endDrag, true);
    area.addEventListener('pointercancel', endDrag, true);

    // Hotkeys: Z toggles, 0 resets the view. Skipped while typing.
    document.addEventListener('keydown', function (e) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); setZoomMode(!zoomMode); }
        // Reset works whenever the view is transformed, NOT only inside Zoom
        // Mode. Painting is suppressed while the mode is on, so the normal
        // workflow is zoom in -> leave the mode -> paint — which is exactly the
        // state where the only way back used to be remembering to press Z again
        // first. Nothing on screen says you are still zoomed, so that stranded
        // people at 4x with a dead reset key.
        else if (e.key === '0' && (zoomMode || ZoomView.scale !== 1)) {
            e.preventDefault(); ZoomView.reset();
        }
    }, true);
})();
