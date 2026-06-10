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
            window.applyMultiSplatWith(x, y, dx, dy, scaledColor, 1, layer.brushSize);
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
                        <button class="path-draw-btn" data-action="draw">✏️ Draw Path</button>
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
                case 'delete':
                    if (confirm('Delete this path layer?')) {
                        deletePathLayer(id);
                    }
                    break;
                case 'draw':
                    setActivePathLayer(id);
                    enterDrawMode();
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
