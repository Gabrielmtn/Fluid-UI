// ═══════════════════════════════════════════════════════════════════
// js/05m-layer-masks.js — part 13/14 of former 05-fluid-sim.js (lines 4302–4644)
// LOAD ORDER: after 05l-layers-transform.js, before 05n-hotkeys-init.js
// PROVIDES: applyLayerMask, drawMaskShape, featherMaskAlpha, polygon/star, updateLayerThreshold, applyRudimentaryMask
// REQUIRES: 05k/05l
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Apply mask to a layer
        window.applyLayerMask = function applyLayerMask(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            // If mask is not enabled or no shapes, use original image
            if (!layer.mask || !layer.mask.enabled || !layer.mask.shapes || layer.mask.shapes.length === 0) {
                if (layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
                return;
            }
            // Create a canvas to render the masked image
            const maskCanvas = document.createElement('canvas');
            const canvasElement = document.getElementById('canvas');
            maskCanvas.width = canvasElement ? canvasElement.width : 1920;
            maskCanvas.height = canvasElement ? canvasElement.height : 1080;
            const ctx = maskCanvas.getContext('2d');
            // Load and draw the original image
            const img = new Image();
            img.onload = () => {
                if (layer.mask.mode === 'show') {
                    // For SHOW mode: Draw shapes first, then composite image on top
                    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                    // Draw all mask shapes as white (shapes stored in original canvas coordinates)
                    layer.mask.shapes.forEach(shape => {
                        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                        // Apply rotation if needed
                        const rotation = shape.rotation || 0;
                        const centerX = shape.x + shape.width / 2;
                        const centerY = shape.y + shape.height / 2;
                        if (rotation !== 0) {
                            ctx.save();
                            ctx.translate(centerX, centerY);
                            ctx.rotate((rotation * Math.PI) / 180);
                            ctx.translate(-centerX, -centerY);
                        }
                        drawMaskShape(ctx, shape);
                        if (rotation !== 0) {
                            ctx.restore();
                        }
                    });
                    // Now composite the image only where shapes exist
                    ctx.globalCompositeOperation = 'source-in';
                    ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
                } else {
                    // For HIDE mode: Draw image first, then cut out shapes
                    ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
                    // Cut out the mask shapes
                    ctx.globalCompositeOperation = 'destination-out';
                    layer.mask.shapes.forEach(shape => {
                        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                        // Apply rotation if needed
                        const rotation = shape.rotation || 0;
                        const centerX = shape.x + shape.width / 2;
                        const centerY = shape.y + shape.height / 2;
                        if (rotation !== 0) {
                            ctx.save();
                            ctx.translate(centerX, centerY);
                            ctx.rotate((rotation * Math.PI) / 180);
                            ctx.translate(-centerX, -centerY);
                        }
                        drawMaskShape(ctx, shape);
                        if (rotation !== 0) {
                            ctx.restore();
                        }
                    });
                }
                const feather = typeof layer.threshold === 'number' ? layer.threshold : 0;
                if (feather > 0) {
                    const radius = Math.max(1, Math.round((feather / 100) * 20));
                    featherMaskAlpha(ctx, maskCanvas.width, maskCanvas.height, radius);
                }
                if (layer.isCollision) {
                    // Tint the preview orange so it reads as an obstacle, not artwork
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.fillStyle = 'rgba(255, 140, 60, 0.55)';
                    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
                    ctx.globalCompositeOperation = 'source-over';
                }
                layerDiv.style.backgroundImage = `url(${maskCanvas.toDataURL()})`;
            };
            img.src = layer.originalData || layer.data;
        }
        // Cached depth-mask temp canvas (avoids per-call allocations)
        let _dmTempCanvas = null, _dmTempCtx = null, _dmImgData = null;
        let _dmCacheW = 0, _dmCacheH = 0;
        // Helper function to draw mask shapes (supports all shape types)
        function drawMaskShape(ctx, shape) {
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;
            // Special handling for depth-based masks: threshold the depth map
            if (shape.type === 'depth-mask' && shape.depthData && shape.depthWidth && shape.depthHeight) {
                const w = shape.depthWidth;
                const h = shape.depthHeight;
                const threshold = shape.threshold || 128;
                const invert = shape.invert || false;
                // Reuse cached canvas/ImageData when dimensions match
                if (_dmCacheW !== w || _dmCacheH !== h || !_dmTempCanvas) {
                    _dmTempCanvas = document.createElement('canvas');
                    _dmTempCanvas.width = w;
                    _dmTempCanvas.height = h;
                    _dmTempCtx = _dmTempCanvas.getContext('2d', { willReadFrequently: true });
                    _dmImgData = _dmTempCtx.createImageData(w, h);
                    _dmCacheW = w;
                    _dmCacheH = h;
                }
                const data = _dmImgData.data;
                // Zero out buffer — we only write obstacle pixels below
                data.fill(0);
                // D0.5 edge quality rev 2: fwidth-style ADAPTIVE soft cut,
                // matching the obstacle compositor in 23-depth-collision.js —
                // the visible mask edge and the collider edge must agree.
                // Band scales with the local depth gradient: edges get ~0.75px
                // of AA, flat midtone regions cut hard (no porous half-walls).
                let bandCap = (window.config && typeof window.config.DEPTH_EDGE_BAND === 'number')
                    ? window.config.DEPTH_EDGE_BAND : 12;
                if (bandCap < 0.5) bandCap = 0.5;
                const dd = shape.depthData;
                // No flip: depth data is stored top-down, same as this canvas.
                // (GL orientation is handled once at obstacle-texture upload.)
                for (let i = 0, n = w * h; i < n; i++) {
                    const dv = dd[i] || 0;
                    const xI = i - ((i / w) | 0) * w;
                    const gx = Math.abs((dd[i + (xI < w - 1 ? 1 : 0)] || 0) - (dd[i - (xI > 0 ? 1 : 0)] || 0)) * 0.5;
                    const gy = Math.abs((dd[i + (i < n - w ? w : 0)] || 0) - (dd[i - (i >= w ? w : 0)] || 0)) * 0.5;
                    let band = (gx > gy ? gx : gy) * 0.75;
                    if (band < 0.5) band = 0.5;
                    if (band > bandCap) band = bandCap;
                    let t = (dv - (threshold - band)) / (band * 2);
                    if (t < 0) t = 0; else if (t > 1) t = 1;
                    let cov = t * t * (3 - 2 * t);
                    if (invert) cov = 1 - cov;
                    if (cov > 0) {
                        const idx = i * 4;
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                        data[idx + 3] = (cov * 255 + 0.5) | 0;
                    }
                }
                _dmTempCtx.putImageData(_dmImgData, 0, 0);
                ctx.drawImage(_dmTempCanvas, shape.x, shape.y, shape.width, shape.height);
                return;
            }
            // Special handling for pixel-based SAM masks: draw from the
            // samMask bitmap instead of treating the shape as a solid rect.
            if (shape.type === 'sam-mask' && shape.samMask && shape.samMaskWidth && shape.samMaskHeight) {
                const w = shape.samMaskWidth;
                const h = shape.samMaskHeight;
                // Draw into a temporary canvas, then blit into the main mask
                // canvas. We only need an alpha mask here, so use white where
                // the SAM mask is active.
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                const imageData = tempCtx.createImageData(w, h);
                const data = imageData.data;
                let nonZero = 0;
                const totalPixels = w * h;
                for (let i = 0; i < totalPixels; i++) {
                    const v = Number(shape.samMask[i] || 0);
                    if (v > 0) {
                        nonZero++;
                        const idx = i * 4;
                        data[idx] = 255;       // R
                        data[idx + 1] = 255;   // G
                        data[idx + 2] = 255;   // B
                        // D0.5: soft masks (samSoft) store 0-255 coverage —
                        // use it as alpha for antialiased edges. Legacy masks
                        // store 0/1 and stay hard.
                        data[idx + 3] = shape.samSoft ? v : 255;
                    }
                }
                // If the mask is empty for some reason, fall back to the
                // bounding box so we don't silently do nothing.
                if (nonZero === 0) {
                    ctx.beginPath();
                    ctx.rect(shape.x, shape.y, shape.width, shape.height);
                    ctx.fill();
                    return;
                }
                tempCtx.putImageData(imageData, 0, 0);
                ctx.drawImage(tempCanvas, shape.x, shape.y, w, h);
                return;
            }
            ctx.beginPath();
            switch (shape.type) {
                case 'rect':
                    ctx.rect(shape.x, shape.y, shape.width, shape.height);
                    break;
                case 'roundrect':
                    const radius = Math.min(shape.width, shape.height) * 0.15;
                    if (ctx.roundRect) {
                        ctx.roundRect(shape.x, shape.y, shape.width, shape.height, radius);
                    } else {
                        // Fallback for older browsers
                        ctx.rect(shape.x, shape.y, shape.width, shape.height);
                    }
                    break;
                case 'circle':
                    ctx.arc(cx, cy, shape.width / 2, 0, Math.PI * 2);
                    break;
                case 'ellipse':
                    ctx.ellipse(cx, cy, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2);
                    break;
                case 'triangle':
                    ctx.moveTo(cx, shape.y);
                    ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
                    ctx.lineTo(shape.x, shape.y + shape.height);
                    ctx.closePath();
                    break;
                case 'pentagon':
                    drawMaskPolygon(ctx, cx, cy, 5, Math.min(shape.width, shape.height) / 2);
                    break;
                case 'hexagon':
                    drawMaskPolygon(ctx, cx, cy, 6, Math.min(shape.width, shape.height) / 2);
                    break;
                case 'star':
                    drawMaskStar(ctx, cx, cy, 5, Math.min(shape.width, shape.height) / 2, Math.min(shape.width, shape.height) / 4);
                    break;
                default:
                    ctx.rect(shape.x, shape.y, shape.width, shape.height);
            }
            ctx.fill();
        }
        // Expose for collision system to reuse
        window._drawMaskShape = drawMaskShape;
        window._featherMaskAlpha = featherMaskAlpha;
        // Helper to draw regular polygon
        function drawMaskPolygon(ctx, cx, cy, sides, radius) {
            const angle = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            for (let i = 0; i <= sides; i++) {
                const a = startAngle + angle * i;
                const x = cx + Math.cos(a) * radius;
                const y = cy + Math.sin(a) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        function featherMaskAlpha(ctx, width, height, radius) {
            if (!radius || radius <= 0) return;
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const w = width;
            const h = height;
            const tmp = new Uint8ClampedArray(w * h);
            const out = new Uint8ClampedArray(w * h);
            const windowSize = radius * 2 + 1;
            for (let y = 0; y < h; y++) {
                let sum = 0;
                const rowOffset = y * w;
                for (let x = -radius; x <= radius; x++) {
                    const xx = x < 0 ? 0 : (x >= w ? w - 1 : x);
                    sum += data[(rowOffset + xx) * 4 + 3];
                }
                for (let x = 0; x < w; x++) {
                    tmp[rowOffset + x] = sum / windowSize;
                    const xRemove = x - radius;
                    const xAdd = x + radius + 1;
                    const xr = xRemove < 0 ? 0 : (xRemove >= w ? w - 1 : xRemove);
                    const xa = xAdd < 0 ? 0 : (xAdd >= w ? w - 1 : xAdd);
                    sum += data[(rowOffset + xa) * 4 + 3] - data[(rowOffset + xr) * 4 + 3];
                }
            }
            for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let y = -radius; y <= radius; y++) {
                    const yy = y < 0 ? 0 : (y >= h ? h - 1 : y);
                    sum += tmp[yy * w + x];
                }
                for (let y = 0; y < h; y++) {
                    out[y * w + x] = sum / windowSize;
                    const yRemove = y - radius;
                    const yAdd = y + radius + 1;
                    const yr = yRemove < 0 ? 0 : (yRemove >= h ? h - 1 : yRemove);
                    const ya = yAdd < 0 ? 0 : (yAdd >= h ? h - 1 : yAdd);
                    sum += tmp[ya * w + x] - tmp[yr * w + x];
                }
            }
            for (let i = 0, len = w * h; i < len; i++) {
                data[i * 4 + 3] = out[i];
            }
            ctx.putImageData(imageData, 0, 0);
        }
        // Helper to draw star
        function drawMaskStar(ctx, cx, cy, points, outerRadius, innerRadius) {
            const angle = Math.PI / points;
            const startAngle = -Math.PI / 2;
            for (let i = 0; i < points * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const a = startAngle + angle * i;
                const x = cx + Math.cos(a) * radius;
                const y = cy + Math.sin(a) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        window.updateLayerTitle = (index, title) => {
            const layer = layers.find(l => l.index === index);
            if (layer) layer.title = title;
        };
        window.updateLayerThreshold = (index, threshold) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            layer.threshold = parseInt(threshold, 10) || 0;
            const hasMask = layer.mask?.shapes?.length > 0;
            if (hasMask && layer.mask.enabled) {
                // Has shape mask - threshold controls feathering
                applyLayerMask(index);
            } else if (layer.threshold > 0) {
                // No shape mask - threshold controls rudimentary alpha mask
                applyRudimentaryMask(index);
            } else {
                // No mask and threshold is 0 - show original image
                const layerDiv = document.getElementById(`layer${index}`);
                if (layerDiv && layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
            }
        };
        // Apply rudimentary alpha-threshold mask for layers without shape masks
        window.applyRudimentaryMask = function applyRudimentaryMask(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            const threshold = layer.threshold || 0;
            if (threshold === 0) {
                if (layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
                return;
            }
            // Create canvas for processing
            const maskCanvas = document.createElement('canvas');
            const canvasElement = document.getElementById('canvas');
            maskCanvas.width = canvasElement ? canvasElement.width : 1920;
            maskCanvas.height = canvasElement ? canvasElement.height : 1080;
            const ctx = maskCanvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
                // Apply alpha threshold - pixels below threshold become transparent
                const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                const data = imageData.data;
                const thresholdValue = Math.round((threshold / 100) * 255);
                for (let i = 0; i < data.length; i += 4) {
                    // Calculate luminance (perceived brightness)
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                    // Make dark pixels transparent based on threshold
                    if (luminance < thresholdValue) {
                        data[i + 3] = 0; // Set alpha to 0
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                layerDiv.style.backgroundImage = `url(${maskCanvas.toDataURL()})`;
            };
            img.src = layer.originalData || layer.data;
        };
