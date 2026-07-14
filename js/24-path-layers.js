/**
 * Path Layers - Animated path tracing for fluid simulation
 * Supports shapes (circle, rectangle, line, polygon) and freehand paths
 * with loop/ping-pong playback modes
 */
(function() {
    'use strict';

    // Inject slider styles to override global slider-styles.css
    (function injectPathSliderStyles() {
        const styleId = 'path-slider-overrides';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .path-speed-slider,
            .path-brush-slider,
            .path-flow-slider {
                -webkit-appearance: none !important;
                appearance: none !important;
                width: 100% !important;
                height: 6px !important;
                background: rgba(255,255,255,0.15) !important;
                border-radius: 3px !important;
                outline: none !important;
                border: none !important;
                box-shadow: none !important;
                margin: 0 !important;
                padding: 0 !important;
                cursor: pointer !important;
            }
            .path-speed-slider::-webkit-slider-container,
            .path-brush-slider::-webkit-slider-container,
            .path-flow-slider::-webkit-slider-container {
                background: transparent !important;
                height: 6px !important;
                margin: 0 !important;
                box-shadow: none !important;
            }
            .path-speed-slider::-webkit-slider-runnable-track,
            .path-brush-slider::-webkit-slider-runnable-track,
            .path-flow-slider::-webkit-slider-runnable-track {
                background: transparent !important;
                height: 6px !important;
                box-shadow: none !important;
            }
            .path-speed-slider::-webkit-slider-thumb,
            .path-brush-slider::-webkit-slider-thumb,
            .path-flow-slider::-webkit-slider-thumb {
                -webkit-appearance: none !important;
                appearance: none !important;
                width: 14px !important;
                height: 14px !important;
                border-radius: 50% !important;
                background: #4fc3f7 !important;
                border: 2px solid rgba(255,255,255,0.5) !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
                cursor: pointer !important;
                margin-top: -4px !important;
                clip-path: none !important;
            }
            .path-speed-slider::-moz-range-track,
            .path-brush-slider::-moz-range-track,
            .path-flow-slider::-moz-range-track {
                background: rgba(255,255,255,0.15) !important;
                height: 6px !important;
                border-radius: 3px !important;
                box-shadow: none !important;
            }
            .path-speed-slider::-moz-range-thumb,
            .path-brush-slider::-moz-range-thumb,
            .path-flow-slider::-moz-range-thumb {
                width: 14px !important;
                height: 14px !important;
                border-radius: 50% !important;
                background: #4fc3f7 !important;
                border: 2px solid rgba(255,255,255,0.5) !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
                cursor: pointer !important;
                clip-path: none !important;
            }
        `;
        document.head.appendChild(style);
    })();

    // Path layer storage
    let pathLayers = [];
    let pathNextId = 1;
    let pathActiveId = null;

    // Drawing state
    let isDrawingPath = false;
    let currentDrawPoints = [];
    let drawStartTime = 0;

    // Animation state
    let pathAnimationFrame = null;
    let lastPathAnimTime = 0;

    // Helper: convert RGB array [r,g,b] (0-1) to hex string
    function rgbToHex(color) {
        if (!color || !Array.isArray(color)) return '#4fc3f7';
        const r = Math.round(Math.min(1, Math.max(0, color[0])) * 255);
        const g = Math.round(Math.min(1, Math.max(0, color[1])) * 255);
        const b = Math.round(Math.min(1, Math.max(0, color[2])) * 255);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // Helper: convert hex string to RGB array [r,g,b] (0-1)
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [0.3, 0.76, 0.97];
    }

    // Shape presets with normalized coordinates (0-1)
    const SHAPE_PRESETS = {
        circle: function(segments = 64) {
            const points = [];
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                points.push({
                    x: 0.5 + 0.3 * Math.cos(angle),
                    y: 0.5 + 0.3 * Math.sin(angle)
                });
            }
            return points;
        },
        rectangle: function() {
            return [
                { x: 0.2, y: 0.2 },
                { x: 0.8, y: 0.2 },
                { x: 0.8, y: 0.8 },
                { x: 0.2, y: 0.8 },
                { x: 0.2, y: 0.2 }
            ];
        },
        triangle: function() {
            return [
                { x: 0.5, y: 0.15 },
                { x: 0.85, y: 0.8 },
                { x: 0.15, y: 0.8 },
                { x: 0.5, y: 0.15 }
            ];
        },
        star: function(points = 5) {
            const result = [];
            const outerR = 0.35;
            const innerR = 0.15;
            for (let i = 0; i <= points * 2; i++) {
                const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
                const r = i % 2 === 0 ? outerR : innerR;
                result.push({
                    x: 0.5 + r * Math.cos(angle),
                    y: 0.5 + r * Math.sin(angle)
                });
            }
            result.push(result[0]); // Close the shape
            return result;
        },
        infinity: function(segments = 80) {
            const points = [];
            for (let i = 0; i <= segments; i++) {
                const t = (i / segments) * Math.PI * 2;
                // Lemniscate of Bernoulli
                const scale = 0.25;
                const denom = 1 + Math.sin(t) * Math.sin(t);
                points.push({
                    x: 0.5 + scale * Math.cos(t) / denom,
                    y: 0.5 + scale * Math.sin(t) * Math.cos(t) / denom
                });
            }
            return points;
        },
        spiral: function(turns = 3, segments = 100) {
            const points = [];
            for (let i = 0; i <= segments; i++) {
                const t = (i / segments) * turns * Math.PI * 2;
                const r = 0.05 + (i / segments) * 0.3;
                points.push({
                    x: 0.5 + r * Math.cos(t),
                    y: 0.5 + r * Math.sin(t)
                });
            }
            return points;
        },
        heart: function(segments = 64) {
            const points = [];
            for (let i = 0; i <= segments; i++) {
                const t = (i / segments) * Math.PI * 2;
                // Heart curve parametric
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
                points.push({
                    x: 0.5 + x * 0.018,
                    y: 0.5 - y * 0.018
                });
            }
            return points;
        },
        wave: function(periods = 3, segments = 80) {
            const points = [];
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                points.push({
                    x: 0.1 + t * 0.8,
                    y: 0.5 + 0.2 * Math.sin(t * periods * Math.PI * 2)
                });
            }
            return points;
        }
    };

    // Create a new path layer
    function createPathLayer(name) {
        const id = pathNextId++;
        // Get current brush color or use default cyan
        let defaultColor = [0.31, 0.76, 0.97]; // #4fc3f7
        if (window.pointer && window.pointer.color) {
            defaultColor = window.pointer.color.slice();
        }
        const layer = {
            id: id,
            name: name || `Path ${id}`,
            visible: true,
            isPlaying: false,
            playMode: 'loop', // 'loop', 'pingpong', 'once'
            speed: 1.0, // Normalized speed (1 = traverse path in ~3 seconds)
            brushSize: 0.012,
            flow: 0.3, // Flow/intensity (0.05 = very light, 1.0 = full intensity)
            color: defaultColor,
            points: [], // Array of {x, y} normalized coords
            position: 0, // Current playback position (0-1)
            direction: 1, // 1 = forward, -1 = backward (for pingpong)
            collapsed: false
        };
        pathLayers.push(layer);
        pathActiveId = id;
        return layer;
    }

    // Get active path layer
    function getActivePathLayer() {
        return pathLayers.find(l => l.id === pathActiveId);
    }

    // Set active path layer
    function setActivePathLayer(id) {
        pathActiveId = id;
        renderPathLayersUI();
    }

    // Delete a path layer
    function deletePathLayer(id) {
        const idx = pathLayers.findIndex(l => l.id === id);
        if (idx >= 0) {
            const layer = pathLayers[idx];
            if (layer.isPlaying) stopPathLayer(id);
            pathLayers.splice(idx, 1);
            if (pathActiveId === id) {
                pathActiveId = pathLayers.length > 0 ? pathLayers[0].id : null;
            }
            renderPathLayersUI();
        }
    }

    // Add a preset shape to active layer
    function addShapeToLayer(shapeType, options = {}) {
        const layer = getActivePathLayer();
        if (!layer) {
            createPathLayer();
            return addShapeToLayer(shapeType, options);
        }
        
        const generator = SHAPE_PRESETS[shapeType];
        if (!generator) return;
        
        layer.points = generator(options.segments || options.points);
        layer.position = 0;
        renderPathLayersUI();
    }

    // Start freehand drawing
    function startDrawing(x, y) {
        const layer = getActivePathLayer();
        if (!layer) {
            createPathLayer();
            return startDrawing(x, y);
        }
        
        isDrawingPath = true;
        currentDrawPoints = [{ x, y }];
        drawStartTime = performance.now();
        layer.points = currentDrawPoints;
        layer.position = 0;
    }

    // Continue freehand drawing
    function continueDrawing(x, y) {
        if (!isDrawingPath) return;
        
        const layer = getActivePathLayer();
        if (!layer) return;
        
        // Only add point if it's far enough from last point (reduces noise)
        const last = currentDrawPoints[currentDrawPoints.length - 1];
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist > 0.005) { // Minimum distance threshold
            currentDrawPoints.push({ x, y });
            layer.points = currentDrawPoints;
        }
    }

    // End freehand drawing
    function endDrawing() {
        if (!isDrawingPath) return;
        isDrawingPath = false;
        
        const layer = getActivePathLayer();
        if (layer && currentDrawPoints.length > 1) {
            // Simplify path using Douglas-Peucker algorithm
            layer.points = simplifyPath(currentDrawPoints, 0.003);
        }
        currentDrawPoints = [];
        renderPathLayersUI();
    }

    // Douglas-Peucker path simplification
    function simplifyPath(points, epsilon) {
        if (points.length <= 2) return points;
        
        let maxDist = 0;
        let maxIdx = 0;
        const end = points.length - 1;
        
        for (let i = 1; i < end; i++) {
            const dist = perpendicularDistance(points[i], points[0], points[end]);
            if (dist > maxDist) {
                maxDist = dist;
                maxIdx = i;
            }
        }
        
        if (maxDist > epsilon) {
            const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
            const right = simplifyPath(points.slice(maxIdx), epsilon);
            return left.slice(0, -1).concat(right);
        }
        
        return [points[0], points[end]];
    }

    function perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
        
        const t = Math.max(0, Math.min(1, 
            ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)
        ));
        const projX = lineStart.x + t * dx;
        const projY = lineStart.y + t * dy;
        return Math.hypot(point.x - projX, point.y - projY);
    }

    // Play/pause a path layer
    function togglePathPlayback(id) {
        const layer = pathLayers.find(l => l.id === id);
        if (!layer || layer.points.length < 2) return;
        
        layer.isPlaying = !layer.isPlaying;
        if (layer.isPlaying) {
            startPathAnimation();
        }
        renderPathLayersUI();
    }

    // Stop a path layer
    function stopPathLayer(id) {
        const layer = pathLayers.find(l => l.id === id);
        if (layer) {
            layer.isPlaying = false;
            layer.position = 0;
            layer.direction = 1;
        }
        renderPathLayersUI();
    }

    // Start the animation loop
    function startPathAnimation() {
        if (pathAnimationFrame) return;
        lastPathAnimTime = performance.now();
        pathAnimationFrame = requestAnimationFrame(animatePaths);
    }

    // Stop the animation loop
    function stopPathAnimation() {
        if (pathAnimationFrame) {
            cancelAnimationFrame(pathAnimationFrame);
            pathAnimationFrame = null;
        }
    }

    // Main animation loop
    function animatePaths(timestamp) {
        const dt = (timestamp - lastPathAnimTime) / 1000; // Delta time in seconds
        lastPathAnimTime = timestamp;
        
        let anyPlaying = false;
        
        pathLayers.forEach(layer => {
            if (!layer.isPlaying || !layer.visible || layer.points.length < 2) return;
            anyPlaying = true;
            
            // Calculate path length for consistent speed
            const pathLength = calculatePathLength(layer.points);
            const baseSpeed = 0.15; // Base traversal speed (normalized units per second)
            const speedMult = layer.speed * baseSpeed;
            
            // Advance position
            const positionDelta = (speedMult * dt) / Math.max(0.1, pathLength);
            layer.position += positionDelta * layer.direction;
            
            // Handle playback modes
            if (layer.playMode === 'loop') {
                if (layer.position >= 1) layer.position -= 1;
                if (layer.position < 0) layer.position += 1;
            } else if (layer.playMode === 'pingpong') {
                if (layer.position >= 1) {
                    layer.position = 1 - (layer.position - 1);
                    layer.direction = -1;
                } else if (layer.position <= 0) {
                    layer.position = -layer.position;
                    layer.direction = 1;
                }
            } else if (layer.playMode === 'once') {
                if (layer.position >= 1) {
                    layer.position = 1;
                    layer.isPlaying = false;
                }
            }
            
            // Get current point on path and apply splat
            const { point, velocity } = getPointOnPath(layer.points, layer.position, layer.direction);
            if (point) {
                applyPathSplat(layer, point, velocity);
            }
        });
        
        // Update playhead previews for all playing layers
        updatePlayheadPreviews();
        
        if (anyPlaying) {
            pathAnimationFrame = requestAnimationFrame(animatePaths);
        } else {
            pathAnimationFrame = null;
            // Final UI update when playback stops
            renderPathLayersUI();
        }
    }

    // Lightweight playhead update (no full UI rebuild)
    function updatePlayheadPreviews() {
        const container = document.getElementById('pathLayersList');
        if (!container) return;
        
        pathLayers.forEach(layer => {
            if (!layer.isPlaying && layer.position === 0) return;
            
            const item = container.querySelector(`.path-layer-item[data-id="${layer.id}"]`);
            if (!item) return;
            
            const canvas = item.querySelector('.path-preview-canvas');
            if (canvas) {
                drawPathPreview(canvas, layer);
            }
        });
    }

    // Calculate total path length
    function calculatePathLength(points) {
        let length = 0;
        for (let i = 1; i < points.length; i++) {
            length += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
        }
        return length;
    }

    // Get point and velocity at position t (0-1) along path
    function getPointOnPath(points, t, direction) {
        if (points.length < 2) return { point: null, velocity: { x: 0, y: 0 } };
        
        t = Math.max(0, Math.min(1, t));
        
        // Calculate cumulative distances
        const distances = [0];
        let totalLength = 0;
        for (let i = 1; i < points.length; i++) {
            totalLength += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
            distances.push(totalLength);
        }
        
        if (totalLength === 0) return { point: points[0], velocity: { x: 0, y: 0 } };
        
        const targetDist = t * totalLength;
        
        // Find segment
        let segIdx = 0;
        for (let i = 1; i < distances.length; i++) {
            if (distances[i] >= targetDist) {
                segIdx = i - 1;
                break;
            }
            segIdx = i - 1;
        }
        
        const segStart = points[segIdx];
        const segEnd = points[Math.min(segIdx + 1, points.length - 1)];
        const segLength = distances[segIdx + 1] - distances[segIdx];
        const segT = segLength > 0 ? (targetDist - distances[segIdx]) / segLength : 0;
        
        const point = {
            x: segStart.x + (segEnd.x - segStart.x) * segT,
            y: segStart.y + (segEnd.y - segStart.y) * segT
        };
        
        // Velocity is direction of travel
        const dx = (segEnd.x - segStart.x) * direction;
        const dy = (segEnd.y - segStart.y) * direction;
        const mag = Math.hypot(dx, dy);
        const velocity = mag > 0 ? { x: dx / mag, y: dy / mag } : { x: 0, y: 0 };
        
        return { point, velocity };
    }

    // Apply splat at path point
    function applyPathSplat(layer, point, velocity) {
        const canvas = document.getElementById('canvas');
        if (!canvas) return;
        
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        
        // Scale velocity for visual effect, modulated by flow
        const flow = typeof layer.flow === 'number' ? layer.flow : 0.3;
        const velScale = 150 * layer.speed * flow;
        const dx = velocity.x * velScale;
        const dy = velocity.y * velScale;
        
        // Use layer color, scaled by flow for intensity
        let color = layer.color;
        if (!color && window.config) {
            color = window.config.COLOR || [Math.random(), Math.random(), Math.random()];
        }
        
        // Scale color intensity by flow
        const scaledColor = [
            color[0] * flow,
            color[1] * flow,
            color[2] * flow
        ];
        
        // Apply splat using the exposed function
        if (typeof window.applyMultiSplatWith === 'function') {
            // exactColor=true: the path layer's configured color must not be
            // hijacked by arm color modes (regression 2026-07-13)
            window.applyMultiSplatWith(x, y, dx, dy, scaledColor, 1, layer.brushSize, true);
        }
    }

    // Toggle layer collapse
    function togglePathLayerCollapse(id) {
        const layer = pathLayers.find(l => l.id === id);
        if (layer) {
            layer.collapsed = !layer.collapsed;
            renderPathLayersUI();
        }
    }

    // Render path layers UI
    function renderPathLayersUI() {
        const container = document.getElementById('pathLayersList');
        if (!container) return;
        
        container.innerHTML = '';

        if (pathLayers.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'path-empty-state';
            empty.innerHTML = `
                <div class="path-empty-icon">✏️</div>
                <div class="path-empty-text">No path layers yet</div>
                <div class="path-empty-hint">Paths trace shapes into the fluid automatically</div>
                <button type="button" class="path-empty-create" data-action="create">+ Create Path Layer</button>
            `;
            container.appendChild(empty);
            bindPathLayerEvents();
            return;
        }

        pathLayers.forEach(layer => {
            const el = document.createElement('div');
            el.className = 'path-layer-item' + (layer.id === pathActiveId ? ' active-layer' : '') + (layer.collapsed ? ' collapsed' : '');
            el.dataset.id = layer.id;
            
            const hasPath = layer.points.length >= 2;
            
            el.innerHTML = `
                <div class="path-layer-header" draggable="true">
                    <div class="path-layer-thumb">✏️</div>
                    <input type="text" class="layer-title" value="${layer.name}" data-action="rename">
                    <div class="layer-controls">
                        <button class="layer-btn" data-action="toggle-visibility" title="${layer.visible ? 'Hide' : 'Show'}">${layer.visible ? '👁️' : '👁️‍🗨️'}</button>
                        <button class="layer-btn" data-action="toggle-play" title="${layer.isPlaying ? 'Pause' : 'Play'}" ${!hasPath ? 'disabled' : ''}>${layer.isPlaying ? '⏸' : '▶'}</button>
                        <button class="layer-btn" data-action="collapse" title="${layer.collapsed ? 'Expand' : 'Collapse'}">${layer.collapsed ? '▼' : '▲'}</button>
                        <button class="layer-btn" data-action="delete" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="path-layer-body">
                    <div class="path-layer-info">${layer.points.length} points | ${layer.playMode}</div>
                    <div class="path-layer-controls">
                        <div class="path-control-row">
                            <label>Speed</label>
                            <input type="range" class="path-speed-slider" min="0.1" max="5" step="0.1" value="${layer.speed}" data-action="speed">
                            <span class="path-speed-val">${layer.speed.toFixed(1)}x</span>
                        </div>
                        <div class="path-control-row">
                            <label>Brush</label>
                            <input type="range" class="path-brush-slider" min="0.002" max="0.05" step="0.001" value="${layer.brushSize}" data-action="brush">
                            <span class="path-brush-val">${(layer.brushSize * 1000).toFixed(0)}</span>
                        </div>
                        <div class="path-control-row">
                            <label>Flow</label>
                            <input type="range" class="path-flow-slider" min="0.05" max="1" step="0.05" value="${layer.flow || 0.3}" data-action="flow">
                            <span class="path-flow-val">${((layer.flow || 0.3) * 100).toFixed(0)}%</span>
                        </div>
                        <div class="path-control-row">
                            <label>Color</label>
                            <input type="color" class="path-color-picker" value="${rgbToHex(layer.color)}" data-action="color">
                            <button class="path-use-brush-btn" data-action="use-brush" title="Use current brush color">🎨</button>
                        </div>
                        <div class="path-control-row">
                            <label>Mode</label>
                            <select class="path-mode-select" data-action="mode">
                                <option value="loop" ${layer.playMode === 'loop' ? 'selected' : ''}>Loop</option>
                                <option value="pingpong" ${layer.playMode === 'pingpong' ? 'selected' : ''}>Ping-Pong</option>
                                <option value="once" ${layer.playMode === 'once' ? 'selected' : ''}>Once</option>
                            </select>
                        </div>
                        <div class="path-shapes-row">
                            <button class="path-shape-btn" data-shape="circle" title="Circle">⭕</button>
                            <button class="path-shape-btn" data-shape="rectangle" title="Rectangle">⬜</button>
                            <button class="path-shape-btn" data-shape="triangle" title="Triangle">🔺</button>
                            <button class="path-shape-btn" data-shape="star" title="Star">⭐</button>
                            <button class="path-shape-btn" data-shape="heart" title="Heart">❤️</button>
                            <button class="path-shape-btn" data-shape="infinity" title="Infinity">∞</button>
                            <button class="path-shape-btn" data-shape="spiral" title="Spiral">🌀</button>
                            <button class="path-shape-btn" data-shape="wave" title="Wave">〰️</button>
                        </div>
                        <div class="path-action-row">
                            <button class="path-draw-btn" data-action="draw">✏️ Draw</button>
                            <button class="path-transform-btn" data-action="transform" ${!hasPath ? 'disabled' : ''} title="Move or resize this path on the canvas">⤢ Move / Resize</button>
                        </div>
                    </div>
                    <canvas class="path-preview-canvas" width="200" height="60"></canvas>
                </div>
            `;
            
            container.appendChild(el);
            
            // Draw path preview
            const previewCanvas = el.querySelector('.path-preview-canvas');
            drawPathPreview(previewCanvas, layer);
        });
        
        bindPathLayerEvents();
    }

    // Draw path preview on canvas
    function drawPathPreview(canvas, layer) {
        if (!canvas || layer.points.length < 2) return;
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, w, h);
        
        // Draw path with layer color
        const pathColor = layer.color ? rgbToHex(layer.color) : '#4fc3f7';
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        layer.points.forEach((p, i) => {
            const x = p.x * w;
            const y = p.y * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Draw current position indicator
        if (layer.isPlaying || layer.position > 0) {
            const { point } = getPointOnPath(layer.points, layer.position, layer.direction);
            if (point) {
                ctx.fillStyle = '#ff6b6b';
                ctx.beginPath();
                ctx.arc(point.x * w, point.y * h, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Bind event listeners for path layer UI
    function bindPathLayerEvents() {
        const container = document.getElementById('pathLayersList');
        if (!container || container._pathBound) return;
        
        container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action], [data-shape]');
            if (!target) {
                // Click on layer item to select
                const item = e.target.closest('.path-layer-item');
                if (item && !e.target.closest('input, button, select')) {
                    setActivePathLayer(parseInt(item.dataset.id, 10));
                }
                return;
            }
            
            const item = target.closest('.path-layer-item');
            const id = item ? parseInt(item.dataset.id, 10) : null;
            
            const action = target.dataset.action;
            const shape = target.dataset.shape;
            
            if (shape) {
                if (id) setActivePathLayer(id);
                addShapeToLayer(shape);
                return;
            }

            if (action === 'create') {
                createPathLayer();
                renderPathLayersUI();
                return;
            }

            if (!id) return;
            
            e.stopPropagation();
            
            switch (action) {
                case 'toggle-visibility':
                    const layer = pathLayers.find(l => l.id === id);
                    if (layer) {
                        layer.visible = !layer.visible;
                        renderPathLayersUI();
                    }
                    break;
                case 'toggle-play':
                    togglePathPlayback(id);
                    break;
                case 'collapse':
                    togglePathLayerCollapse(id);
                    break;
                case 'delete': {
                    const layerToDelete = pathLayers.find(l => l.id === id);
                    confirmDeletePath(layerToDelete ? layerToDelete.name : 'this path').then((ok) => {
                        if (ok) deletePathLayer(id);
                    });
                    break;
                }
                case 'draw':
                    setActivePathLayer(id);
                    enterDrawMode();
                    break;
                case 'transform':
                    setActivePathLayer(id);
                    enterTransformMode();
                    break;
                case 'use-brush':
                    const layerForBrush = pathLayers.find(l => l.id === id);
                    if (layerForBrush && window.pointer && window.pointer.color) {
                        layerForBrush.color = window.pointer.color.slice();
                        renderPathLayersUI();
                    }
                    break;
            }
        });
        
        container.addEventListener('input', (e) => {
            const target = e.target;
            const item = target.closest('.path-layer-item');
            if (!item) return;
            
            const id = parseInt(item.dataset.id, 10);
            const layer = pathLayers.find(l => l.id === id);
            if (!layer) return;
            
            const action = target.dataset.action;
            
            switch (action) {
                case 'speed':
                    layer.speed = parseFloat(target.value);
                    const speedVal = item.querySelector('.path-speed-val');
                    if (speedVal) speedVal.textContent = layer.speed.toFixed(1) + 'x';
                    break;
                case 'brush':
                    layer.brushSize = parseFloat(target.value);
                    const brushVal = item.querySelector('.path-brush-val');
                    if (brushVal) brushVal.textContent = (layer.brushSize * 1000).toFixed(0);
                    break;
                case 'flow':
                    layer.flow = parseFloat(target.value);
                    const flowVal = item.querySelector('.path-flow-val');
                    if (flowVal) flowVal.textContent = (layer.flow * 100).toFixed(0) + '%';
                    break;
                case 'color':
                    layer.color = hexToRgb(target.value);
                    break;
            }
        });
        
        container.addEventListener('change', (e) => {
            const target = e.target;
            const item = target.closest('.path-layer-item');
            if (!item) return;
            
            const id = parseInt(item.dataset.id, 10);
            const layer = pathLayers.find(l => l.id === id);
            if (!layer) return;
            
            const action = target.dataset.action;
            
            switch (action) {
                case 'rename':
                    layer.name = target.value;
                    break;
                case 'mode':
                    layer.playMode = target.value;
                    layer.direction = 1;
                    renderPathLayersUI();
                    break;
            }
        });
        
        container._pathBound = true;
    }

    // ── Delete confirmation modal (app-styled, reuses .delete-modal theme) ──
    let _deleteResolve = null;

    function ensureDeleteModal() {
        let modal = document.getElementById('pathDeleteModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'pathDeleteModal';
        modal.className = 'delete-modal';
        modal.innerHTML = `
            <div class="delete-modal-content">
                <div class="delete-modal-title">Delete Path Layer</div>
                <div class="delete-modal-message" id="pathDeleteModalMessage"></div>
                <div class="delete-modal-actions">
                    <button type="button" class="delete-modal-cancel" id="pathDeleteCancel">Cancel</button>
                    <button type="button" class="delete-modal-confirm" id="pathDeleteConfirm">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = (result) => {
            modal.classList.remove('show');
            if (_deleteResolve) { _deleteResolve(result); _deleteResolve = null; }
        };
        modal.querySelector('#pathDeleteCancel').addEventListener('click', () => close(false));
        modal.querySelector('#pathDeleteConfirm').addEventListener('click', () => close(true));
        // Backdrop click cancels
        modal.addEventListener('click', (e) => { if (e.target === modal) close(false); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) close(false);
        });
        return modal;
    }

    function confirmDeletePath(name) {
        const modal = ensureDeleteModal();
        const msg = modal.querySelector('#pathDeleteModalMessage');
        if (msg) msg.textContent = `Are you sure you want to delete "${name}"? This cannot be undone.`;
        modal.classList.add('show');
        return new Promise((resolve) => { _deleteResolve = resolve; });
    }

    // Drawing mode overlay
    let drawOverlay = null;
    let drawCanvas = null;
    let drawCtx = null;

    function enterDrawMode() {
        if (drawOverlay) return;
        
        const layer = getActivePathLayer();
        if (!layer) return;
        
        // Create overlay
        drawOverlay = document.createElement('div');
        drawOverlay.id = 'pathDrawOverlay';
        drawOverlay.innerHTML = `
            <div class="draw-toolbar">
                <span>Draw your path on the canvas</span>
                <button id="pathDrawDone" type="button">✓ Done</button>
                <button id="pathDrawCancel" type="button">✕ Cancel</button>
            </div>
            <div class="draw-canvas-area">
                <canvas id="pathDrawCanvas"></canvas>
            </div>
        `;
        document.body.appendChild(drawOverlay);
        
        drawCanvas = document.getElementById('pathDrawCanvas');
        const mainCanvas = document.getElementById('canvas');
        const wrapper = document.getElementById('canvas-wrapper');
        
        // Size draw canvas to match main canvas
        if (wrapper && mainCanvas) {
            const rect = wrapper.getBoundingClientRect();
            drawCanvas.width = rect.width;
            drawCanvas.height = rect.height;
        } else {
            drawCanvas.width = window.innerWidth;
            drawCanvas.height = window.innerHeight - 50;
        }
        
        drawCtx = drawCanvas.getContext('2d');
        
        // Event handlers for drawing
        const getPos = (e) => {
            const rect = drawCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) / rect.width,
                y: (clientY - rect.top) / rect.height
            };
        };
        
        const onStart = (e) => {
            e.preventDefault();
            const pos = getPos(e);
            startDrawing(pos.x, pos.y);
            drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
            drawCtx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
            drawCtx.lineWidth = 3;
            drawCtx.lineCap = 'round';
            drawCtx.beginPath();
            drawCtx.moveTo(pos.x * drawCanvas.width, pos.y * drawCanvas.height);
        };
        
        const onMove = (e) => {
            if (!isDrawingPath) return;
            e.preventDefault();
            const pos = getPos(e);
            continueDrawing(pos.x, pos.y);
            drawCtx.lineTo(pos.x * drawCanvas.width, pos.y * drawCanvas.height);
            drawCtx.stroke();
            drawCtx.beginPath();
            drawCtx.moveTo(pos.x * drawCanvas.width, pos.y * drawCanvas.height);
        };
        
        const onEnd = (e) => {
            if (!isDrawingPath) return;
            e.preventDefault();
            endDrawing();
        };
        
        drawCanvas.addEventListener('mousedown', onStart);
        drawCanvas.addEventListener('mousemove', onMove);
        drawCanvas.addEventListener('mouseup', onEnd);
        drawCanvas.addEventListener('mouseleave', onEnd);
        drawCanvas.addEventListener('touchstart', onStart, { passive: false });
        drawCanvas.addEventListener('touchmove', onMove, { passive: false });
        drawCanvas.addEventListener('touchend', onEnd);
        
        // Button handlers - use direct references
        const doneBtn = document.getElementById('pathDrawDone');
        const cancelBtn = document.getElementById('pathDrawCancel');
        
        if (doneBtn) {
            doneBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                exitDrawMode();
            };
        }
        
        if (cancelBtn) {
            cancelBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const activeLayer = getActivePathLayer();
                if (activeLayer) activeLayer.points = [];
                exitDrawMode();
            };
        }
    }

    function exitDrawMode() {
        if (drawOverlay) {
            drawOverlay.remove();
            drawOverlay = null;
            drawCanvas = null;
            drawCtx = null;
        }
        isDrawingPath = false;
        currentDrawPoints = [];
        renderPathLayersUI();
    }

    // ── Transform mode: move / resize a path directly on the canvas ──
    let transformOverlay = null;

    function enterTransformMode() {
        if (transformOverlay) return;
        const layer = getActivePathLayer();
        if (!layer || layer.points.length < 2) return;

        // Snapshot for cancel
        const originalPoints = layer.points.map(p => ({ x: p.x, y: p.y }));

        transformOverlay = document.createElement('div');
        transformOverlay.id = 'pathTransformOverlay';
        transformOverlay.innerHTML = `
            <div class="draw-toolbar">
                <span>Drag inside the box to move · drag a corner to resize</span>
                <button id="pathTransformDone" type="button">✓ Done</button>
                <button id="pathTransformCancel" type="button">✕ Cancel</button>
            </div>
            <div class="draw-canvas-area">
                <canvas id="pathTransformCanvas"></canvas>
            </div>
        `;
        document.body.appendChild(transformOverlay);

        const tCanvas = document.getElementById('pathTransformCanvas');
        const area = transformOverlay.querySelector('.draw-canvas-area');
        const sizeCanvas = () => {
            const rect = area.getBoundingClientRect();
            tCanvas.width = rect.width;
            tCanvas.height = rect.height;
        };
        sizeCanvas();
        const tCtx = tCanvas.getContext('2d');

        const HANDLE = 14; // hit size in px
        let drag = null;   // { mode: 'move'|'scale', startX, startY, basePoints, anchor }

        function bbox() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            layer.points.forEach(p => {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            });
            return { minX, minY, maxX, maxY };
        }

        function corners(b) {
            const w = tCanvas.width, h = tCanvas.height;
            return [
                { id: 'nw', x: b.minX * w, y: b.minY * h, ax: b.maxX, ay: b.maxY, cursor: 'nwse-resize' },
                { id: 'ne', x: b.maxX * w, y: b.minY * h, ax: b.minX, ay: b.maxY, cursor: 'nesw-resize' },
                { id: 'sw', x: b.minX * w, y: b.maxY * h, ax: b.maxX, ay: b.minY, cursor: 'nesw-resize' },
                { id: 'se', x: b.maxX * w, y: b.maxY * h, ax: b.minX, ay: b.minY, cursor: 'nwse-resize' }
            ];
        }

        function hitTest(px, py) {
            const b = bbox();
            for (const c of corners(b)) {
                if (Math.abs(px - c.x) <= HANDLE && Math.abs(py - c.y) <= HANDLE) {
                    return { mode: 'scale', corner: c };
                }
            }
            const w = tCanvas.width, h = tCanvas.height;
            if (px >= b.minX * w - 6 && px <= b.maxX * w + 6 &&
                py >= b.minY * h - 6 && py <= b.maxY * h + 6) {
                return { mode: 'move' };
            }
            return null;
        }

        function draw() {
            const w = tCanvas.width, h = tCanvas.height;
            tCtx.clearRect(0, 0, w, h);

            // Path
            tCtx.strokeStyle = rgbToHex(layer.color);
            tCtx.lineWidth = 3;
            tCtx.lineCap = 'round';
            tCtx.lineJoin = 'round';
            tCtx.beginPath();
            layer.points.forEach((p, i) => {
                if (i === 0) tCtx.moveTo(p.x * w, p.y * h);
                else tCtx.lineTo(p.x * w, p.y * h);
            });
            tCtx.stroke();

            // Bounding box
            const b = bbox();
            tCtx.strokeStyle = 'rgba(100, 200, 255, 0.85)';
            tCtx.lineWidth = 1;
            tCtx.setLineDash([6, 4]);
            tCtx.strokeRect(b.minX * w, b.minY * h, (b.maxX - b.minX) * w, (b.maxY - b.minY) * h);
            tCtx.setLineDash([]);

            // Corner handles
            corners(b).forEach(c => {
                tCtx.fillStyle = 'rgba(100, 200, 255, 0.95)';
                tCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                tCtx.lineWidth = 1.5;
                tCtx.beginPath();
                tCtx.rect(c.x - 5, c.y - 5, 10, 10);
                tCtx.fill();
                tCtx.stroke();
            });
        }

        function getPos(e) {
            const rect = tCanvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        function onPointerDown(e) {
            const pos = getPos(e);
            const hit = hitTest(pos.x, pos.y);
            if (!hit) return;
            e.preventDefault();
            drag = {
                mode: hit.mode,
                corner: hit.corner || null,
                startX: pos.x,
                startY: pos.y,
                basePoints: layer.points.map(p => ({ x: p.x, y: p.y }))
            };
            tCanvas.setPointerCapture(e.pointerId);
        }

        function onPointerMove(e) {
            const pos = getPos(e);
            if (!drag) {
                const hit = hitTest(pos.x, pos.y);
                tCanvas.style.cursor = hit ? (hit.mode === 'move' ? 'move' : hit.corner.cursor) : 'default';
                return;
            }
            e.preventDefault();
            const w = tCanvas.width, h = tCanvas.height;
            if (drag.mode === 'move') {
                const dx = (pos.x - drag.startX) / w;
                const dy = (pos.y - drag.startY) / h;
                layer.points = drag.basePoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
            } else {
                // Scale from the corner opposite the grabbed handle
                const ax = drag.corner.ax, ay = drag.corner.ay; // anchor (normalized)
                const startDx = drag.startX / w - ax, startDy = drag.startY / h - ay;
                const curDx = pos.x / w - ax, curDy = pos.y / h - ay;
                const sx = Math.abs(startDx) > 1e-4 ? Math.max(0.05, curDx / startDx) : 1;
                const sy = Math.abs(startDy) > 1e-4 ? Math.max(0.05, curDy / startDy) : 1;
                layer.points = drag.basePoints.map(p => ({
                    x: ax + (p.x - ax) * sx,
                    y: ay + (p.y - ay) * sy
                }));
            }
            draw();
        }

        function onPointerUp(e) {
            if (!drag) return;
            drag = null;
            try { tCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        }

        tCanvas.addEventListener('pointerdown', onPointerDown);
        tCanvas.addEventListener('pointermove', onPointerMove);
        tCanvas.addEventListener('pointerup', onPointerUp);
        tCanvas.addEventListener('pointercancel', onPointerUp);

        const onResize = () => { sizeCanvas(); draw(); };
        window.addEventListener('resize', onResize);

        const onKey = (e) => {
            if (e.key === 'Escape') { cancel(); }
            else if (e.key === 'Enter') { done(); }
        };
        document.addEventListener('keydown', onKey);

        function cleanup() {
            window.removeEventListener('resize', onResize);
            document.removeEventListener('keydown', onKey);
            transformOverlay.remove();
            transformOverlay = null;
            renderPathLayersUI();
        }
        function done() { cleanup(); }
        function cancel() {
            layer.points = originalPoints;
            cleanup();
        }

        document.getElementById('pathTransformDone').onclick = (e) => { e.preventDefault(); done(); };
        document.getElementById('pathTransformCancel').onclick = (e) => { e.preventDefault(); cancel(); };

        draw();
    }

    function exitTransformMode() {
        if (transformOverlay) {
            transformOverlay.remove();
            transformOverlay = null;
            renderPathLayersUI();
        }
    }

    // Expose API
    window.pathLayers = {
        create: createPathLayer,
        delete: deletePathLayer,
        getActive: getActivePathLayer,
        setActive: setActivePathLayer,
        addShape: addShapeToLayer,
        togglePlay: togglePathPlayback,
        stop: stopPathLayer,
        render: renderPathLayersUI,
        getLayers: () => pathLayers,
        enterDrawMode: enterDrawMode,
        exitDrawMode: exitDrawMode,
        enterTransformMode: enterTransformMode,
        exitTransformMode: exitTransformMode,
        
        // For save/load integration
        getSnapshot: function() {
            return pathLayers.map(l => ({
                id: l.id,
                name: l.name,
                visible: l.visible,
                playMode: l.playMode,
                speed: l.speed,
                brushSize: l.brushSize,
                color: l.color,
                points: l.points,
                collapsed: l.collapsed
            }));
        },
        restoreSnapshot: function(data) {
            if (!Array.isArray(data)) return;
            stopPathAnimation();
            pathLayers = [];
            pathNextId = 1;
            data.forEach(d => {
                const layer = createPathLayer(d.name);
                Object.assign(layer, d);
                layer.isPlaying = false;
                layer.position = 0;
                layer.direction = 1;
            });
            pathActiveId = pathLayers.length > 0 ? pathLayers[0].id : null;
            renderPathLayersUI();
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderPathLayersUI);
    } else {
        setTimeout(renderPathLayersUI, 100);
    }
})();
