// ═══════════════════════════════════════════════════════════════════
// js/05m-layer-masks.js — part 13/14 of former 05-fluid-sim.js (lines 4302–4644)
// LOAD ORDER: after 05l-layers-transform.js, before 05n-hotkeys-init.js
// PROVIDES: applyLayerMask, drawMaskShape, featherMaskAlpha, polygon/star, updateLayerThreshold, applyRudimentaryMask
// REQUIRES: 05k/05l
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // ── D3-3: clip a DOM image layer by a unified Mask object ──────────
        // Image layers are browser-composited .background-layer divs, not GL
        // textures, so (unlike GPU raster layers, which sample a Mask coverage
        // FBO in-shader) they clip via CSS mask-image: read the coverage back to
        // a top-down white/alpha PNG and set it as the div's CSS mask. clipMaskId
        // / clipInvert mirror the raster clip binding (persistence is already
        // type-agnostic). The CSS mask is orthogonal to the legacy shape-mask
        // (which only writes backgroundImage), so the two compose by intersection.
        window.applyLayerClip = function applyLayerClip(index, _cache) {
            const layer = (window.layers || []).find(l => l.index === index);
            if (!layer) return;
            const div = document.getElementById(`layer${index}`);
            if (!div) return;
            // A clip source is any silhouette already in the project — a
            // paintable Mask, another layer's shape mask, or a collider (05o
            // ClipSources). Bound by key, so the source is read where it
            // lives instead of being copied in.
            const key = (window.ClipSources && window.ClipSources.keyOf)
                ? window.ClipSources.keyOf(layer) : null;
            let url = null;
            if (key && window.ClipSources) {
                // Read each (source,invert) coverage back only ONCE per reapply pass.
                const _k = key + (layer.clipInvert ? ':i' : ':n');
                if (_cache && _k in _cache) url = _cache[_k];
                else { url = window.ClipSources.coverageDataURL(key, !!layer.clipInvert); if (_cache) _cache[_k] = url; }
            }
            if (!url) {
                div.style.webkitMaskImage = '';
                div.style.maskImage = '';
                return;
            }
            const css = `url(${url})`;
            div.style.webkitMaskImage = css;
            div.style.maskImage = css;
            // Mirror .background-layer's background-size:100% 100% so the mask
            // registers with the (possibly shape-baked) background image.
            div.style.webkitMaskSize = '100% 100%';
            div.style.maskSize = '100% 100%';
            div.style.webkitMaskRepeat = 'no-repeat';
            div.style.maskRepeat = 'no-repeat';
            div.style.webkitMaskPosition = '0 0';
            div.style.maskPosition = '0 0';
        };
        // Clear a layer div's CSS clip (used on div recycle: delete / reset).
        window.clearLayerClip = function clearLayerClip(index) {
            const div = document.getElementById(`layer${index}`);
            if (div) { div.style.webkitMaskImage = ''; div.style.maskImage = ''; }
        };
        // Re-apply the clip for every image layer bound to a given mask id (or
        // all, if id omitted). The CSS mask is a static snapshot, so this repaints
        // it when the bound mask is edited/restored.
        window.reapplyImageLayerClips = function reapplyImageLayerClips(mid) {
            const cache = {}; // dedupe FBO readbacks for layers sharing a mask
            (window.layers || []).forEach(function (l) {
                if (l.isRaster || l.isCollision) return;
                if (mid == null || l.clipMaskId === mid) window.applyLayerClip(l.index, cache);
            });
        };
        // Live refresh: __onMaskMutated is a single-slot hook already OWNED by
        // 23-depth-collision (live collider). CHAIN it (never clobber) and install
        // only after __scriptsReady so we wrap the final owner. readPixels+toDataURL
        // is a GPU stall, but mask mutations fire at stroke-END, so a light debounce
        // coalesces bursts (undo/redo, restore's per-mask async loads).
        (function installImageClipRefresh() {
            let _t = null;
            const _pending = new Set();
            function schedule(mid) {
                _pending.add(mid);
                if (_t) return;
                _t = setTimeout(function () {
                    _t = null;
                    const ids = Array.from(_pending); _pending.clear();
                    // Several distinct masks in one window (preset restore fires
                    // __onMaskMutated per mask on async load) → reapply ALL, not
                    // just the last id (last-writer-wins would strand the rest).
                    if (ids.length !== 1 || ids[0] == null) window.reapplyImageLayerClips();
                    else window.reapplyImageLayerClips(ids[0]);
                }, 140);
            }
            function install() {
                if (window.__imgClipRefreshInstalled) return;
                window.__imgClipRefreshInstalled = true;
                const prev = window.__onMaskMutated;
                window.__onMaskMutated = function (mid) {
                    if (typeof prev === 'function') { try { prev(mid); } catch (e) {} }
                    schedule(mid);
                };
            }
            if (window.__scriptsReady) { install(); return; }
            let tries = 0;
            const poll = setInterval(function () {
                if (window.__scriptsReady || ++tries > 200) { clearInterval(poll); install(); }
            }, 50);
        })();

        // The masked composite itself: the artwork kept where the shapes cover
        // (show) or everywhere they don't (hide), softened by the layer's
        // Feather, transparent elsewhere. Untinted — applyLayerMask paints the
        // collider film on afterwards, and "Layer from Visible" wants the plain
        // cutout. Both go through here so what you bake is what you see.
        // `scale` (default 1) oversamples the whole composite — shapes and
        // artwork alike — so a consumer that needs more than canvas resolution
        // (Splat to Fluid pours into a 2048-wide dye) rasterizes ONCE at the
        // resolution it wants instead of upscaling a canvas-res bitmap.
        function composeMaskedLayer(layer, img, scale) {
            const k = (typeof scale === 'number' && scale > 0) ? scale : 1;
            const maskCanvas = document.createElement('canvas');
            const canvasElement = document.getElementById('canvas');
            const baseW = canvasElement ? canvasElement.width : 1920;
            const baseH = canvasElement ? canvasElement.height : 1080;
            maskCanvas.width = Math.max(1, Math.round(baseW * k));
            maskCanvas.height = Math.max(1, Math.round(baseH * k));
            const ctx = maskCanvas.getContext('2d');
            // Everything below is written in canvas-buffer coordinates (where
            // mask shapes live); the scale makes that a higher-res raster.
            if (k !== 1) ctx.scale(maskCanvas.width / baseW, maskCanvas.height / baseH);
            const stampShapes = () => {
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
            };
            if (layer.mask.mode === 'show') {
                // For SHOW mode: Draw shapes first, then composite image on top
                ctx.clearRect(0, 0, baseW, baseH);
                // Draw all mask shapes as white (shapes stored in original canvas coordinates)
                stampShapes();
                // Now composite the image only where shapes exist
                ctx.globalCompositeOperation = 'source-in';
                ctx.drawImage(img, 0, 0, baseW, baseH);
            } else {
                // For HIDE mode: Draw image first, then cut out shapes
                ctx.drawImage(img, 0, 0, baseW, baseH);
                // Cut out the mask shapes
                ctx.globalCompositeOperation = 'destination-out';
                stampShapes();
            }
            ctx.globalCompositeOperation = 'source-over';
            const feather = typeof layer.threshold === 'number' ? layer.threshold : 0;
            if (feather > 0) {
                // featherMaskAlpha works in device pixels (getImageData ignores
                // the transform), so the radius has to be carried up with them
                // or an oversampled composite would come out proportionally
                // sharper than the one on screen.
                const radius = Math.max(1, Math.round((feather / 100) * 20 * k));
                featherMaskAlpha(ctx, maskCanvas.width, maskCanvas.height, radius);
            }
            return maskCanvas;
        }

        // Apply mask to a layer
        window.applyLayerMask = function applyLayerMask(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            // If mask is not enabled or no shapes, use original image
            if (!layer.mask || !layer.mask.enabled || !layer.mask.shapes || layer.mask.shapes.length === 0) {
                // A collision layer IS its mask — its `originalData` is the
                // picture the wall was cut from, not something to show. With no
                // mask there is no wall, so there is no film either; restoring
                // the source image here left an untinted ghost of it on the
                // canvas after Clear Mask (and after switching collision off).
                if (layer.isCollision) {
                    layerDiv.style.backgroundImage = '';
                } else if (layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
                return;
            }
            // Load and draw the original image
            const img = new Image();
            img.onload = () => {
                const maskCanvas = composeMaskedLayer(layer, img);
                if (layer.isCollision) {
                    // Tint the preview orange so it reads as an obstacle, not artwork
                    const ctx = maskCanvas.getContext('2d');
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.fillStyle = 'rgba(255, 140, 60, 0.55)';
                    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
                    ctx.globalCompositeOperation = 'source-over';
                }
                layerDiv.style.backgroundImage = `url(${maskCanvas.toDataURL()})`;
            };
            img.src = layer.originalData || layer.data;
            // This layer's mask is a clip SOURCE for any other layer bound to
            // it (05o ClipSources), so a mask edit has to push through to them
            // — otherwise you'd repaint a silhouette and the layers clipped by
            // it would keep the old one until something else forced a redraw.
            if (window.ClipSources) window.ClipSources.invalidate(index);
        }

        // Layer from Visible: bake the cut-out into a layer of its own. The source
        // is left untouched — this is a copy, so the mask stays live and
        // re-editable on the original and you can keep cutting more pieces off
        // it. The new layer inherits the source's placement (position, scale,
        // rotation) so it lands exactly on top of the piece it came from
        // instead of snapping back to a fresh aspect fit.
        //
        // Deliberately does NOT require mask.enabled: the button is offered
        // whenever shapes exist, and "cut me this piece" is a reasonable thing
        // to ask of a mask you have toggled off to see the whole picture.
        window.layerFromVisible = function layerFromVisible(index) {
            const layer = (window.layers || []).find(l => l.index === index);
            if (!layer || !layer.mask || !layer.mask.shapes || !layer.mask.shapes.length) return;
            if (typeof window.createLayerFromDataUrl !== 'function') return;
            const say = (t, m) => {
                if (typeof window.appAlert === 'function') window.appAlert(t, m);
                else alert(t + '\n\n' + m);
            };
            const img = new Image();
            img.onload = () => {
                const cut = composeMaskedLayer(layer, img);
                // An all-or-nothing mask (hide mode covering everything, a
                // selection that segmented to nothing) would hand back a blank
                // layer and a puzzled user. Say so instead of making one.
                let empty = true;
                try {
                    const d = cut.getContext('2d').getImageData(0, 0, cut.width, cut.height).data;
                    for (let i = 3; i < d.length; i += 4) { if (d[i] > 2) { empty = false; break; } }
                } catch (_) { empty = false; }   // tainted canvas — trust the mask
                if (empty) {
                    say('Nothing to cut out',
                        'This mask is not showing any of the image, so the new layer would be empty. Edit the mask (or switch it between Show and Hide) and try again.');
                    return;
                }
                window.createLayerFromDataUrl(cut.toDataURL('image/png'),
                    (layer.title || 'Layer') + ' cutout',
                    function (created) {
                        // The cut-out is rendered in the source's UNTRANSFORMED
                        // space (same as the div's background), so carrying the
                        // transform over is what makes it land on top of the
                        // original rather than beside it.
                        created.x = layer.x || 0;
                        created.y = layer.y || 0;
                        created.scaleX = layer.scaleX || 1;
                        created.scaleY = layer.scaleY || 1;
                        created.rotation = layer.rotation || 0;
                        // Feather is already baked into the cut-out's alpha. On
                        // a layer with no mask this slider is the rudimentary
                        // luminance key instead, so inheriting it would key the
                        // cut-out a second time.
                        created.threshold = 0;
                        if (typeof window.renderLayers === 'function') window.renderLayers();
                        if (typeof window.__recordLayerCreate === 'function') {
                            window.__recordLayerCreate([created.index], 'layer from mask');
                        }
                    });
            };
            img.onerror = () => say('Could not read that layer', 'Its image failed to decode, so there is nothing to cut out.');
            img.src = layer.originalData || layer.data;
        }

        // Splat to Fluid: pour this layer's masked artwork into the simulation
        // as dye — one frame of a brush whose shape AND colour are the picture
        // itself. The layer is left alone; what lands in the dye immediately
        // starts flowing, so this is a one-shot event, not a copy.
        //
        // Fidelity comes from doing the placement ONCE, in 2D, at the dye's own
        // resolution: rasterize the cut-out oversampled, bake the layer's
        // on-screen transform into the same pass, and hand the sim a bitmap it
        // can deposit 1:1. Nothing is resampled a second time on the GPU.
        window.splatLayerToSim = function splatLayerToSim(index) {
            const layer = (window.layers || []).find(l => l.index === index);
            if (!layer) return;
            const say = (t, m) => {
                if (typeof window.appAlert === 'function') window.appAlert(t, m);
                else alert(t + '\n\n' + m);
            };
            if (typeof window.__splatImageToDye !== 'function') {
                say('The simulation is still starting', 'Give it a moment and try again.');
                return;
            }
            const mainCanvas = document.getElementById('canvas');
            if (!mainCanvas) return;
            const dye = (typeof window.__dyeTexSize === 'function') ? window.__dyeTexSize() : null;
            // Oversample to the dye's resolution — but never below 1:1, and cap
            // the blow-up so a small canvas on a big dye buffer can't allocate
            // something absurd.
            const k = dye ? Math.max(1, Math.min(4, dye.w / Math.max(1, mainCanvas.width))) : 1;
            const img = new Image();
            img.onload = () => {
                const hasMask = !!(layer.mask && layer.mask.shapes && layer.mask.shapes.length);
                let art;
                if (hasMask) {
                    art = composeMaskedLayer(layer, img, k);
                } else {
                    // No mask on this layer — pour the whole picture.
                    art = document.createElement('canvas');
                    art.width = Math.max(1, Math.round(mainCanvas.width * k));
                    art.height = Math.max(1, Math.round(mainCanvas.height * k));
                    art.getContext('2d').drawImage(img, 0, 0, art.width, art.height);
                }
                // Place it where the layer actually SITS. Same
                // translate → rotate → scale about centre convention as the
                // obstacle compositor (23) and Masks.importFromLayer (05o) —
                // mask shapes are stored untransformed, so without this an
                // aspect-fitted or moved layer would pour into the wrong place.
                const out = document.createElement('canvas');
                out.width = dye ? dye.w : art.width;
                out.height = dye ? dye.h : art.height;
                const octx = out.getContext('2d');
                octx.scale(out.width / mainCanvas.width, out.height / mainCanvas.height);
                const wrap = document.getElementById('canvas-wrapper');
                const cssW = (wrap && wrap.clientWidth) || mainCanvas.clientWidth || mainCanvas.width || 1;
                const cssH = (wrap && wrap.clientHeight) || mainCanvas.clientHeight || mainCanvas.height || 1;
                const bcx = mainCanvas.width * 0.5, bcy = mainCanvas.height * 0.5;
                octx.translate(bcx + (layer.x || 0) * (mainCanvas.width / cssW),
                               bcy + (layer.y || 0) * (mainCanvas.height / cssH));
                octx.rotate(((layer.rotation || 0) * Math.PI) / 180);
                octx.scale(layer.scaleX || 1, layer.scaleY || 1);
                octx.translate(-bcx, -bcy);
                octx.drawImage(art, 0, 0, mainCanvas.width, mainCanvas.height);
                // Console tunable: config.SPLAT_TO_FLUID_AMOUNT = 0.4 pours a
                // fainter ghost. 1 = the picture at full strength.
                const amount = (window.config && typeof config.SPLAT_TO_FLUID_AMOUNT === 'number')
                    ? config.SPLAT_TO_FLUID_AMOUNT : 1;
                if (!window.__splatImageToDye(out, amount)) {
                    say('Could not fluidize that layer', 'The simulation refused the image. Try again, or reload if it keeps happening.');
                    return;
                }
                // The picture is now IN the fluid, so leaving the flat copy on
                // top of it just hides the thing you asked for. Hide the source
                // instead of deleting it — the layer, its mask and its
                // placement all survive, so you can pour it again.
                if (layer.visible && typeof window.toggleLayer === 'function') {
                    window.toggleLayer(layer.index);
                }
            };
            img.onerror = () => say('Could not read that layer', 'Its image failed to decode, so there is nothing to pour.');
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
                // D0.5 edge quality rev 2: fwidth-style ADAPTIVE soft cut —
                // same threshold center as the obstacle compositor in
                // 23-depth-collision.js so preview and collider edges land in
                // the same place. Band scales with the local depth gradient;
                // flat midtone regions cut hard (no porous half-walls).
                let bandCap = (window.config && typeof window.config.DEPTH_EDGE_BAND === 'number')
                    ? window.config.DEPTH_EDGE_BAND : 12;
                if (bandCap < 0.5) bandCap = 0.5;
                // Preview-only 8x cap (see applyRudimentaryMask): keeps the
                // spatial ramp ~1.5px on steep edges instead of sub-pixel
                // (= visibly jagged). The solver path keeps the hard cap.
                bandCap = Math.min(bandCap * 8, 127);
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
                // An empty sam-mask means segmentation produced nothing —
                // skip it. The old bounding-box fallback literally painted a
                // filled rect the size of the shape, turning "no mask" into
                // "solid square" (live candidates are guaranteed non-empty,
                // so this only fires on bad saved data).
                if (nonZero === 0) {
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
            if (!layer) return;
            layer.title = title;
            // A layer's name IS the label its mask/collider wears in every
            // other layer's Clip dropdown, so a rename has to reach them.
            // Deferred: this runs from the field's own change event, and
            // rebuilding the panel underneath a live event would tear out the
            // element still dispatching it (and swallow the click that caused
            // the blur). Next tick the interaction is over.
            setTimeout(() => { if (typeof renderLayers === 'function') renderLayers(); }, 0);
        };
        window.updateLayerThreshold = (index, threshold) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            layer.threshold = parseInt(threshold, 10) || 0;
            layer.__maskDirty = true; // 7.6: reorder-reapply memo
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
                // Luminance cut with the SAME fwidth-style adaptive band the
                // depth-mask paths use (drawMaskShape above, obstacle
                // compositor in 23-depth-collision): edges get sub-pixel AA,
                // flat regions still cut hard. A binary cut here was the
                // jagged-edge source — and 🧱 Generate Collision Layer bakes
                // this exact cut, so preview and collider edges must agree.
                const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                const data = imageData.data;
                const thresholdValue = Math.round((threshold / 100) * 255);
                const w = maskCanvas.width, h = maskCanvas.height;
                const n = w * h;
                const lum = new Uint8ClampedArray(n);
                for (let i = 0, j = 0; i < n; i++, j += 4) {
                    lum[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
                }
                let bandCap = (window.config && typeof window.config.DEPTH_EDGE_BAND === 'number')
                    ? window.config.DEPTH_EDGE_BAND : 12;
                if (bandCap < 0.5) bandCap = 0.5;
                // Preview cap is 8x the solver cap: band=0.75·grad needs to
                // reach ~96 on a full 0→255 step to keep the spatial ramp at
                // ~1.5px (2·band/grad). At the solver's cap of 12 a steep edge
                // gets 0.2px of AA — measured binary, i.e. still jagged. The
                // obstacle compositor keeps the hard cap (solver needs it and
                // rev-3 blur bounds the physical edge separately).
                bandCap = Math.min(bandCap * 8, 127);
                for (let i = 0; i < n; i++) {
                    const xI = i - ((i / w) | 0) * w;
                    const gx = Math.abs(lum[i + (xI < w - 1 ? 1 : 0)] - lum[i - (xI > 0 ? 1 : 0)]) * 0.5;
                    const gy = Math.abs(lum[i + (i < n - w ? w : 0)] - lum[i - (i >= w ? w : 0)]) * 0.5;
                    let band = (gx > gy ? gx : gy) * 0.75;
                    if (band < 0.5) band = 0.5;
                    if (band > bandCap) band = bandCap;
                    let t = (lum[i] - (thresholdValue - band)) / (band * 2);
                    if (t < 0) t = 0; else if (t > 1) t = 1;
                    const cov = t * t * (3 - 2 * t);
                    const ai = i * 4 + 3;
                    data[ai] = (data[ai] * cov + 0.5) | 0;
                }
                ctx.putImageData(imageData, 0, 0);
                layerDiv.style.backgroundImage = `url(${maskCanvas.toDataURL()})`;
            };
            img.src = layer.originalData || layer.data;
        };
