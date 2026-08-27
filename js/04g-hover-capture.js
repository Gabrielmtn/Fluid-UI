// ═══════════════════════════════════════════════════════════════════
// js/04g-hover-capture.js — part 7/7 of former 04-ui-interactions.js (lines 3321–3909)
// LOAD ORDER: after 04f-canvas-actions.js, before 05a-shader-core.js (async loader)
// PROVIDES: hover-capture region system (capture area, resize, debounce, region capture)
// REQUIRES: 04f
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // ==============================

        // Detachable Capture Area & Hover Capture

        // ==============================

        // Reuse existing captureBtn and hoverCaptureToggle; add detach toggle

        // captureBtn and hoverCaptureToggle are defined above in Hover capture section

        const detachToggle = document.getElementById('detachCaptureToggle');

        let captureAreaEl = null;

        let hoverCaptureCooldown = false;

        let hoverCooldownTimer = null;

        let isDraggingCA = false;



        function ensureCaptureArea() {

            if (captureAreaEl) return captureAreaEl;

            captureAreaEl = document.getElementById('captureArea');

            if (!captureAreaEl) {

                captureAreaEl = document.createElement('div');

                captureAreaEl.id = 'captureArea';

                const host = document.getElementById('canvas-area') || document.body;

                host.appendChild(captureAreaEl);

            }

            // Build UI (drag bar + resize handles) once

            if (!captureAreaEl.querySelector('.cap-drag-handle')) {

                captureAreaEl.innerHTML = `

                    <div class="cap-drag-handle"></div>

                    <div class="cap-rz cap-n" data-dir="n"></div>

                    <div class="cap-rz cap-s" data-dir="s"></div>

                    <div class="cap-rz cap-e" data-dir="e"></div>

                    <div class="cap-rz cap-w" data-dir="w"></div>

                    <div class="cap-rz cap-ne" data-dir="ne"></div>

                    <div class="cap-rz cap-nw" data-dir="nw"></div>

                    <div class="cap-rz cap-se" data-dir="se"></div>

                    <div class="cap-rz cap-sw" data-dir="sw"></div>

                `;

            }



            // Make it draggable across the viewport (no canvas clamping)

            try {

                if (!captureAreaEl.dataset.draggableInit) {

                    captureAreaEl.style.position = 'fixed';

                    new Draggable(captureAreaEl, {

                        handle: '.cap-drag-handle',

                        savePosition: 'ui.captureArea.pos',

                        constrainToViewport: true,

                        onDragStart: () => { isDraggingCA = true; },

                        onDragEnd: () => { isDraggingCA = false; }

                    });

                    captureAreaEl.dataset.draggableInit = '1';

                }

            } catch (e) { /* draggable optional */ }



            // Enable resize via border handles

            setupCaptureResize(captureAreaEl);



            // Hover capture trigger (use mouseover to catch entering children too)

            captureAreaEl.addEventListener('mouseover', () => {

                if (!hoverCaptureToggle || !hoverCaptureToggle.checked) return;

                if (hoverCaptureCooldown) return;

                // Skip while interacting (drag/resize)

                if (isDraggingCA) return;

                if (isResizingCA) return;

                const ok = doCaptureFromRegion();

                if (ok) startCaptureDebounce();

            });



            // Click to capture (only on main area; ignore drag bar and resize handles)

            captureAreaEl.addEventListener('click', (ev) => {

                if (isDraggingCA || isResizingCA) return;

                const t = ev.target;

                if (t.closest('.cap-drag-handle') || t.closest('.cap-rz')) return;

                const ok = doCaptureFromRegion();

                if (ok) startCaptureDebounce();

            });



            return captureAreaEl;

        }



 // Custom resize logic for capture area

        let isResizingCA = false;

        let caDir = '';

        let caStartX = 0, caStartY = 0;

        let caStartRect = null;

        let caPointerId = null;

        const CA_MIN_W = 40, CA_MIN_H = 40;



        function setupCaptureResize(el) {

            const handles = el.querySelectorAll('.cap-rz');

            handles.forEach(h => {

                // Improve pen/touch UX

                h.style.touchAction = 'none';

                h.style.userSelect = 'none';

                h.addEventListener('pointerdown', (ev) => {

                    // Allow pen/touch; restrict mouse to left button

                    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

                    ev.preventDefault(); ev.stopPropagation();

                    isResizingCA = true;

                    caPointerId = ev.pointerId;

                    try { h.setPointerCapture(ev.pointerId); } catch (_) {}

                    caDir = ev.currentTarget.dataset.dir;

                    const r = el.getBoundingClientRect();

                    caStartRect = { left: r.left, top: r.top, width: r.width, height: r.height };

                    caStartX = ev.clientX; caStartY = ev.clientY;

                    document.addEventListener('pointermove', onCAResizeMove, { passive: false });

                    document.addEventListener('pointerup', onCAResizeEnd, { passive: false });

                    document.addEventListener('pointercancel', onCAResizeEnd, { passive: false });

                });

            });

        }



        function onCAResizeMove(ev) {

            if (!isResizingCA || !captureAreaEl) return;

            if (typeof caPointerId === 'number' && ev.pointerId !== caPointerId) return;

            const dx = ev.clientX - caStartX;

            const dy = ev.clientY - caStartY;

            let left = caStartRect.left;

            let top = caStartRect.top;

            let width = caStartRect.width;

            let height = caStartRect.height;



            const applyN = () => { top = caStartRect.top + dy; height = caStartRect.height - dy; };

            const applyS = () => { height = caStartRect.height + dy; };

            const applyW = () => { left = caStartRect.left + dx; width = caStartRect.width - dx; };

            const applyE = () => { width = caStartRect.width + dx; };



            if (caDir.includes('n')) applyN();

            if (caDir.includes('s')) applyS();

            if (caDir.includes('w')) applyW();

            if (caDir.includes('e')) applyE();



            // Enforce minimum size

            if (width < CA_MIN_W) {

                if (caDir.includes('w')) left -= (CA_MIN_W - width);

                width = CA_MIN_W;

            }

            if (height < CA_MIN_H) {

                if (caDir.includes('n')) top -= (CA_MIN_H - height);

                height = CA_MIN_H;

            }



            // Apply to element (fixed coordinates)

            captureAreaEl.style.left = Math.round(left) + 'px';

            captureAreaEl.style.top = Math.round(top) + 'px';

            captureAreaEl.style.width = Math.round(width) + 'px';

            captureAreaEl.style.height = Math.round(height) + 'px';

        }



        function onCAResizeEnd(ev) {

            if (!isResizingCA) return;

            if (ev && typeof caPointerId === 'number' && ev.pointerId !== caPointerId) return;

            isResizingCA = false; caDir = '';

            try { if (ev && ev.currentTarget && ev.currentTarget.releasePointerCapture) ev.currentTarget.releasePointerCapture(ev.pointerId); } catch (_) {}

            document.removeEventListener('pointermove', onCAResizeMove);

            document.removeEventListener('pointerup', onCAResizeEnd);

            document.removeEventListener('pointercancel', onCAResizeEnd);

            caPointerId = null;

        }



        function startCaptureDebounce() {

            hoverCaptureCooldown = true;

            if (captureBtn) captureBtn.classList.add('debounce');

            clearTimeout(hoverCooldownTimer);

            hoverCooldownTimer = setTimeout(() => {

                hoverCaptureCooldown = false;

                if (captureBtn) captureBtn.classList.remove('debounce');

            }, 1000);

        }



        function getIntersectionRect(a, b) {

            const left = Math.max(a.left, b.left);

            const top = Math.max(a.top, b.top);

            const right = Math.min(a.right, b.right);

            const bottom = Math.min(a.bottom, b.bottom);

            const w = right - left;

            const h = bottom - top;

            if (w <= 0 || h <= 0) return null;

            return { left, top, width: w, height: h };

        }



        function doCaptureFromRegion() {

            const canvasRect = canvas.getBoundingClientRect();

            // Use detached region if present and visible; fallback to full canvas if no intersection

            let region = null;

            if (detachToggle && detachToggle.checked && captureAreaEl && getComputedStyle(captureAreaEl).display !== 'none') {

                const areaRect = captureAreaEl.getBoundingClientRect();

                region = getIntersectionRect(areaRect, canvasRect);

            }

            if (!region) {

                region = { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height };

            }



            const sx = Math.round(region.left - canvasRect.left);

            const sy = Math.round(region.top - canvasRect.top);

            const sw = Math.round(region.width);

            const sh = Math.round(region.height);

            if (sw <= 0 || sh <= 0) return false;



            const temp = document.createElement('canvas');

            temp.width = sw;

            temp.height = sh;

            const ctx = temp.getContext('2d');

            // Draw canvas content

            try {

                ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

            } catch (e) { /* ignore */ }



            let dataUrl = null;

            try {

                dataUrl = temp.toDataURL('image/png');

            } catch (err) {

                // Fallback: capture full canvas directly if 2D canvas became tainted

                try {

                    dataUrl = canvas.toDataURL('image/png');

                } catch (e2) {

                    console.warn('Capture failed:', err);

                    return false;

                }

            }

            // Create a new layer from this capture

            if (layers.length >= MAX_LAYERS) {

                alert('Maximum 10 layers reached. Delete some layers to create new ones.');

                return false;

            }

            let availableIndex = -1;

            for (let i = 0; i < MAX_LAYERS; i++) {

                if (!layers.find(l => l.index === i)) { availableIndex = i; break; }

            }

            if (availableIndex === -1) { alert('No available layer slots.'); return false; }



            const layerDiv = document.getElementById(`layer${availableIndex}`);

            if (layerDiv) {

                layerDiv.style.backgroundImage = `url(${dataUrl})`;

                layerDiv.style.zIndex = availableIndex;

                layerDiv.style.display = 'block';

            }

            const layer = {

                index: availableIndex,

                title: `Capture ${availableIndex}`,

                data: dataUrl,

                originalData: dataUrl,

                visible: true,

                threshold: 0,

                active: false,

                x: 0,

                y: 0,

                scaleX: 1,

                scaleY: 1,

                rotation: 0,

                skewX: 0,

                skewY: 0

            };

            layers.push(layer);

            const simIndex = layerOrder.findIndex(item => item.type === 'sim');

            if (simIndex !== -1) {

                layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });

            } else {

                layerOrder.push({ type: 'layer', id: availableIndex });

            }

            if (typeof renderLayers === 'function') renderLayers();

            return true;

        }



        // Click capture handled above via captureLayer()

        if (detachToggle) {

            detachToggle.addEventListener('change', (e) => {

                const el = ensureCaptureArea();

                if (e.target.checked) {

                    el.style.display = 'block';

                    // Place inside canvas bounds by default

                    try {

                        const r = canvas.getBoundingClientRect();

                        const w = Math.min( Math.max(240, r.width * 0.4), r.width - 40);

                        const h = Math.min( Math.max(160, r.height * 0.3), r.height - 40);

                        el.style.width = Math.round(w) + 'px';

                        el.style.height = Math.round(h) + 'px';

                        el.style.left = Math.round(r.left + (r.width - w) / 2) + 'px';

                        el.style.top = Math.round(r.top + (r.height - h) / 2) + 'px';

                    } catch (_) { /* ignore */ }

                } else {

                    el.style.display = 'none';

                }

            });

            // Initialize state

            if (detachToggle.checked) {

                const el = ensureCaptureArea();

                el.style.display = 'block';

                // Also position within canvas on init

                try {

                    const r = canvas.getBoundingClientRect();

                    const w = Math.min( Math.max(240, r.width * 0.4), r.width - 40);

                    const h = Math.min( Math.max(160, r.height * 0.3), r.height - 40);

                    el.style.width = Math.round(w) + 'px';

                    el.style.height = Math.round(h) + 'px';

                    el.style.left = Math.round(r.left + (r.width - w) / 2) + 'px';

                    el.style.top = Math.round(r.top + (r.height - h) / 2) + 'px';

                } catch (_) { /* ignore */ }

            }

        }


