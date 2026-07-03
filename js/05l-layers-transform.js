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
                const layerDiv = document.getElementById(`layer${index}`);
                layerDiv.style.display = layer.visible ? 'block' : 'none';
                renderLayers();
            }
        };
        window.deleteLayer = (index) => {
            const layerDiv = document.getElementById(`layer${index}`);
            if (layerDiv) {
                layerDiv.style.backgroundImage = '';
                layerDiv.style.display = 'none';
                layerDiv.style.zIndex = '';
                layerDiv.classList.remove('active');
            }
            // Remove from layers array
            layers = layers.filter(l => l.index !== index);
            window.layers = layers;
            // Remove from layerOrder array
            layerOrder = layerOrder.filter(item => !(item.type === 'layer' && item.id === index));
            window.layerOrder = layerOrder;
            // Re-render and update z-indices
            renderLayers();
        };
        // Image layer mask functions
        window.toggleImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                layer.mask.enabled = !layer.mask.enabled;
                applyLayerMask(index);
                renderLayers();
            }
        };
        window.editImageLayerMask = (index) => {
            if (typeof window.enterImageLayerMaskMode === 'function') {
                window.enterImageLayerMaskMode(index);
            }
        };
        window.collisionFromMask = (index) => {
            if (window.collisionLayers && typeof window.collisionLayers.createFromLayerMask === 'function') {
                window.collisionLayers.createFromLayerMask(index);
            } else {
                console.warn('Collision system not available');
            }
        };
        window.clearImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                if (confirm('Clear mask for this layer?')) {
                    layer.mask.shapes = [];
                    layer.mask.enabled = false;
                    renderLayers();
                }
            }
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
            const rotation = layer.rotation || 0;
            layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) rotate(${rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`;
            // Apply mask if enabled
            applyLayerMask(index);
        }
