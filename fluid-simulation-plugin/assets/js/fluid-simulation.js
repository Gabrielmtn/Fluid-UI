document.addEventListener('DOMContentLoaded', function() {
const MAX_LAYERS = 10;
let layers = []; // Array of layer objects
let layerOrder = []; // Array of items in visual order: [{type: 'sim'} or {type: 'layer', id: layerIndex}]
let currentLayerIndex = 0;
let savedColors = [];
let isPaused = false;
let animationMultiplier = 1;

let mousePositions = [];
let isRightMouseDown = false;
let isReplayActive = false;
const FADE_START = 333;
const FADE_END = 555;

let showTrail = true;
let showCursor = true;

let savedDensity = null;
let savedVelocity = null;
let activePreset = null;

const canvas = document.getElementById('canvas');
const canvasArea = document.getElementById('canvas-area');
const canvasWrapper = document.getElementById('canvas-wrapper');
const trailCanvas = document.getElementById('trailCanvas');
const customCursor = document.getElementById('customCursor');
const sizeDisplay = document.getElementById('canvas-size-display');
const showCanvasHandles = document.getElementById('showCanvasHandles');
const lockCanvasBorders = document.getElementById('lockCanvasBorders');
let bordersLocked = false;
if (lockCanvasBorders) bordersLocked = lockCanvasBorders.checked;

const curatedPalettes = [
    { name: "Mountain Majesty", colors: { primary: "#4A90A4", secondary: "#E8E8D0", accent1: "#5F4E3B", accent2: "#2C5F2D", highlight: "#FFFACD" } },
    { name: "Forest Serenity", colors: { primary: "#2C5F2D", secondary: "#4A7856", accent1: "#8B4513", accent2: "#FFD700", highlight: "#F0EAD6" } },
    { name: "Sunset Dreams", colors: { primary: "#FF6347", secondary: "#FFD700", accent1: "#FF8C00", accent2: "#8B4789", highlight: "#FFF5EE" } },
    { name: "Ocean Waves", colors: { primary: "#4A90A4", secondary: "#5F9EA0", accent1: "#E8E8D0", accent2: "#2F4F4F", highlight: "#87CEEB" } }
];
let currentPaletteIndex = 0;
let paletteStepIndex = 0;

function uniqueColors(arr) { return [...new Set(arr.map(c => c.toUpperCase()))]; }

window.setColor = function(hex) {
    const cp = document.getElementById('colorPicker');
    if (!cp) return;
    cp.value = hex;
    const rnd = document.getElementById('randomColor');
    if (rnd) rnd.checked = false;
    const stepEl = document.getElementById('stepPalette');
    if (stepEl) stepEl.checked = false;
    if (typeof updateColor === 'function') updateColor();
};

let currentTrailColorCss = 'rgba(255, 68, 68, 0.5)';
function hexToRgbaCss(hex, alpha = 1.0) {
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderPalettePreview(index) {
    const el = document.getElementById('palettePreview');
    if (!el || !curatedPalettes[index]) return;
    const p = curatedPalettes[index];
    el.innerHTML = '';
    ['primary','secondary','accent1','accent2','highlight'].forEach(k => {
        const chip = document.createElement('div');
        chip.className = 'palette-chip';
        chip.style.backgroundColor = p.colors[k];
        chip.title = k;
        chip.onclick = () => window.setColor(p.colors[k]);
        el.appendChild(chip);
    });
}

function updatePaletteStepIndicator() {
    const el = document.getElementById('paletteStepIndicator');
    if (!el) return;
    const stepEl = document.getElementById('stepPalette');
    const list = getStepColorList();
    if (stepEl && stepEl.checked && list.length > 0) {
        const nextIdx = paletteStepIndex % list.length;
        const nextHex = list[nextIdx];
        el.style.display = 'flex';
        el.innerHTML = `
            <span>Next</span>
            <div class="chip" style="background:${nextHex}"></div>
            <span>${nextIdx + 1}/${list.length}</span>
        `;
    } else {
        el.style.display = 'none';
        el.innerHTML = '';
    }
}

function getCurrentPaletteHexList() {
    const p = curatedPalettes[currentPaletteIndex];
    if (!p) return [];
    return uniqueColors([
        p.colors.primary,
        p.colors.secondary,
        p.colors.accent1,
        p.colors.accent2,
        p.colors.highlight
    ]);
}

function getStepColorList() {
    if (Array.isArray(savedColors) && savedColors.length > 0) {
        return uniqueColors(savedColors);
    }
    return getCurrentPaletteHexList();
}

function applyPalette(index) {
    const i = parseInt(index, 10);
    if (isNaN(i) || !curatedPalettes[i]) return;
    currentPaletteIndex = i;
    const palette = curatedPalettes[i];
    paletteStepIndex = 0;
    const cp = document.getElementById('colorPicker');
    if (cp) {
        cp.value = palette.colors.primary;
        const stepEl = document.getElementById('stepPalette');
        if (!(stepEl && stepEl.checked) && typeof updateColor === 'function') updateColor();
    }
    currentTrailColorCss = hexToRgbaCss(palette.colors.secondary, 0.5);
    const swatches = getCurrentPaletteHexList();
    if (typeof colorStorage !== 'undefined') {
        savedColors = swatches.slice();
        colorStorage.save(savedColors);
    }
    renderPalettePreview(i);
    const sel = document.getElementById('paletteSelector');
    if (sel && sel.value !== String(i)) sel.value = String(i);
    localStorage.setItem('curatedPaletteIndex', String(i));
    updatePaletteStepIndicator();
}

function initPaletteUI() {
    const sel = document.getElementById('paletteSelector');
    if (!sel) return;
    sel.innerHTML = curatedPalettes.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('');
    sel.addEventListener('change', e => applyPalette(e.target.value));
}

function preseedPaletteOnLoad() {
    const len = curatedPalettes.length;
    if (!len) return;
    const last = parseInt(localStorage.getItem('curatedPaletteIndex') || '-1', 10);
    const next = (isNaN(last) || last < 0) ? Math.floor(Math.random() * len) : (last + 1) % len;
    applyPalette(next);
}

function updateCanvasSize() {
    const newWidth = canvasWrapper.clientWidth;
    const newHeight = canvasWrapper.clientHeight;
    
    canvas.width = newWidth;
    canvas.height = newHeight;
    trailCanvas.width = newWidth;
    trailCanvas.height = newHeight;
    sizeDisplay.textContent = `${newWidth} × ${newHeight}`;
    
    // Flag to reinitialize framebuffers after WebGL context is set up
    window.needsFramebufferReinit = true;
}

// Initialize canvas wrapper position (centered)
function initializeCanvasPosition() {
    const areaRect = canvasArea.getBoundingClientRect();
    const wrapperWidth = canvasWrapper.offsetWidth;
    const wrapperHeight = canvasWrapper.offsetHeight;
    
    const centerLeft = (areaRect.width - wrapperWidth) / 2;
    const centerTop = (areaRect.height - wrapperHeight) / 2;
    
    canvasWrapper.style.left = centerLeft + 'px';
    canvasWrapper.style.top = centerTop + 'px';
}

initializeCanvasPosition();
updateCanvasSize();

// Corner locking functionality
const lockedCorners = {
    nw: false,
    ne: false,
    se: false,
    sw: false
};

const cornerPositions = {
    nw: { x: 0, y: 0 },
    ne: { x: 0, y: 0 },
    se: { x: 0, y: 0 },
    sw: { x: 0, y: 0 }
};

function updateCornerPositions() {
    const rect = canvasWrapper.getBoundingClientRect();
    cornerPositions.nw = { x: rect.left, y: rect.top };
    cornerPositions.ne = { x: rect.right, y: rect.top };
    cornerPositions.se = { x: rect.right, y: rect.bottom };
    cornerPositions.sw = { x: rect.left, y: rect.bottom };
}

document.querySelectorAll('.corner-lock').forEach(lock => {
    lock.addEventListener('click', (e) => {
        e.stopPropagation();
        const corner = lock.dataset.corner;
        
        // Unlock all other corners first
        for (let c in lockedCorners) {
            if (c !== corner) {
                lockedCorners[c] = false;
                const otherLock = document.querySelector(`.corner-lock[data-corner="${c}"]`);
                if (otherLock) {
                    otherLock.classList.remove('locked');
                    otherLock.textContent = '🔓';
                }
            }
        }
        
        lockedCorners[corner] = !lockedCorners[corner];
        
        if (lockedCorners[corner]) {
            lock.classList.add('locked');
            lock.textContent = '🔒';
            lock.title = `Unlock ${corner.replace('n', 'top-').replace('s', 'bottom-').replace('w', 'left').replace('e', 'right')} corner`;
            updateCornerPositions();
        } else {
            lock.classList.remove('locked');
            lock.textContent = '🔓';
            lock.title = `Lock ${corner.replace('n', 'top-').replace('s', 'bottom-').replace('w', 'left').replace('e', 'right')} corner`;
        }
    });
});

// Show/Hide canvas border & handles
function applyHandlesVisibility(show) {
    document.querySelectorAll('.resize-handle, .corner-lock').forEach(el => {
        if (el) el.style.display = show ? '' : 'none';
    });
    if (!show) {
        sizeDisplay.style.opacity = '0';
        sizeDisplay.style.display = 'none';
    } else {
        sizeDisplay.style.display = '';
    }
}
if (showCanvasHandles) {
    applyHandlesVisibility(showCanvasHandles.checked);
    showCanvasHandles.addEventListener('change', (e) => {
        applyHandlesVisibility(e.target.checked);
    });
}

// Lock/unlock canvas borders
if (lockCanvasBorders) {
    lockCanvasBorders.addEventListener('change', (e) => {
        bordersLocked = e.target.checked;
    });
}

// Resize functionality
let isResizing = false;
let resizeDirection = null;
let startX, startY, startWidth, startHeight, startLeft, startTop;
let lockedCornerPos = null;
let autoLockedCorner = null; // temporary anchor during corner drags

document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (bordersLocked) return;
        if (typeof pushUndo === 'function') pushUndo();
        isResizing = true;
        {
            const dirClass = Array.from(handle.classList).find(c => /^resize-(n|s|e|w|nw|ne|se|sw)$/.test(c));
            resizeDirection = dirClass ? dirClass.replace('resize-', '') : '';
        }
        startX = e.clientX;
        startY = e.clientY;
        
        // Get current position and size
        const rect = canvasWrapper.getBoundingClientRect();
        const areaRect = canvasArea.getBoundingClientRect();
        
        // Store starting values from actual rendered position
        startLeft = rect.left - areaRect.left;
        startTop = rect.top - areaRect.top;
        startWidth = rect.width;
        startHeight = rect.height;
        
        sizeDisplay.style.opacity = '1';
        
        // Auto-anchor opposite corner for corner drags if no explicit lock is set
        const cornerOpp = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };
        const hasExplicitLock = Object.values(lockedCorners).some(v => v);
        autoLockedCorner = null;
        if (!hasExplicitLock && cornerOpp[resizeDirection]) {
            autoLockedCorner = cornerOpp[resizeDirection];
        }

        // Capture locked corner position if any corner is locked (explicit or auto)
        updateCornerPositions();
        lockedCornerPos = null;
        if (autoLockedCorner) {
            lockedCornerPos = { ...cornerPositions[autoLockedCorner] };
        } else {
            for (let corner in lockedCorners) {
                if (lockedCorners[corner]) {
                    lockedCornerPos = { ...cornerPositions[corner] };
                    break;
                }
            }
        }
    });
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    let newWidth = startWidth;
    let newHeight = startHeight;
    let newLeft = startLeft;
    let newTop = startTop;
    
    // Check if any corners are locked (explicit or temporary auto lock)
    const hasLockedCorner = Object.values(lockedCorners).some(locked => locked) || !!autoLockedCorner;
    
    if (hasLockedCorner && lockedCornerPos) {
        // Find which corner is locked
        let anchorCorner = null;
        if (autoLockedCorner) {
            anchorCorner = autoLockedCorner;
        } else {
            for (let corner in lockedCorners) {
                if (lockedCorners[corner]) {
                    anchorCorner = corner;
                    break;
                }
            }
        }
        
        const areaRect = canvasArea.getBoundingClientRect();
        const anchorX = lockedCornerPos.x;
        const anchorY = lockedCornerPos.y;
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // New size from distance between mouse and anchor
        newWidth = Math.max(200, Math.abs(mouseX - anchorX));
        newHeight = Math.max(200, Math.abs(mouseY - anchorY));
        
        // Position top-left at min(mouse, anchor) to keep opposite corner fixed
        newLeft = Math.min(mouseX, anchorX) - areaRect.left;
        newTop = Math.min(mouseY, anchorY) - areaRect.top;
    } else {
        // No locked corners - each edge moves independently
        // Start with current values
        newWidth = startWidth;
        newHeight = startHeight;
        newLeft = startLeft;
        newTop = startTop;
        
        // Handle horizontal resizing
        if (resizeDirection.includes('e')) {
            // Dragging right edge - increase width, left stays same
            newWidth = Math.max(200, startWidth + dx);
        } else if (resizeDirection.includes('w')) {
            // Dragging left edge - change both width and position
            const proposedWidth = startWidth - dx;
            if (proposedWidth >= 200) {
                newWidth = proposedWidth;
                newLeft = startLeft + dx;
                console.log('West drag:', { dx, proposedWidth, newWidth, newLeft, startLeft });
            } else {
                // Hit minimum width - stop at 200px
                newWidth = 200;
                newLeft = startLeft + (startWidth - 200);
            }
        }
        
        // Handle vertical resizing
        if (resizeDirection.includes('s')) {
            // Dragging bottom edge - increase height, top stays same
            newHeight = Math.max(200, startHeight + dy);
        } else if (resizeDirection.includes('n')) {
            // Dragging top edge - change both height and position
            const proposedHeight = startHeight - dy;
            if (proposedHeight >= 200) {
                newHeight = proposedHeight;
                newTop = startTop + dy;
            } else {
                // Hit minimum height - stop at 200px
                newHeight = 200;
                newTop = startTop + (startHeight - 200);
            }
        }
    }
    
    canvasWrapper.style.width = newWidth + 'px';
    canvasWrapper.style.height = newHeight + 'px';
    canvasWrapper.style.left = newLeft + 'px';
    canvasWrapper.style.top = newTop + 'px';
    
    updateCanvasSize();
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizeDirection = null;
        autoLockedCorner = null; // clear temporary lock
        
        // Ensure final canvas size update
        updateCanvasSize();
        
        setTimeout(() => {
            if (!canvasWrapper.matches(':hover')) {
                sizeDisplay.style.opacity = '0';
            }
        }, 100);
    }
});

const trailCtx = trailCanvas.getContext('2d');

function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

const colorStorage = {
    save: function(colors) {
        try {
            savedColors = colors;
            localStorage.setItem('fluidSimColors', JSON.stringify(colors));
            renderSavedColors();
            if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
        } catch (e) {
            console.error('Error saving colors:', e);
        }
    },
    
    add: function(color) {
        if (!savedColors.includes(color)) {
            savedColors.push(color);
            this.save(savedColors);
        }
    },
    
    remove: function(color) {
        savedColors = savedColors.filter(c => c !== color);
        this.save(savedColors);
    },
    
    clear: function() {
        this.save([]);
    },
    
    getAll: function() {
        return savedColors;
    },
    
    load: function() {
        try {
            const stored = localStorage.getItem('fluidSimColors');
            if (stored) {
                savedColors = JSON.parse(stored);
                renderSavedColors();
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
            }
        } catch (e) {
            console.error('Error loading colors:', e);
        }
    }
};

customCursor.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
        <path d="M2 26L6 30L8 28L7 31L9 29L10 32L12 29L14 31L16 28" 
              fill="none"
              stroke="#000" 
              stroke-width="2"
              stroke-linecap="round"/>
        <path d="M28 4L24 8L10 22L8 20L22 6L26 2Z" 
              fill="#000"/>
        <circle cx="8" cy="24" r="1.5" fill="#000"/>
        <circle cx="6" cy="22" r="1" fill="#000"/>
        <circle cx="10" cy="23" r="1" fill="#000"/>
    </svg>
`;

window.showPreview = function() {
    canvas.classList.add('hidden');
};

window.hidePreview = function() {
    canvas.classList.remove('hidden');
};

let recEnabled = false;
let recLayers = [];
let recActiveLayerId = null;
let recNextLayerId = 1;
let recIsPlayingAll = false;
let recMaxDurationMs = 10000;
let recLastPlaybackTime = Date.now();
let recPlaybackSpeed = 1;
let recRenderQueued = false;
function recScheduleRender() {
    if (recRenderQueued) return;
    recRenderQueued = true;
    requestAnimationFrame(() => {
        recRenderQueued = false;
        recRenderUI();
    });
}

function recParseTime(str) {
    if (!str) return 10000;
    // Accept mm:ss:ms or ss.ms or integer ms
    if (/^\d{1,2}:\d{2}:\d{1,3}$/.test(str)) {
        const [mm, ss, ms] = str.split(':').map(Number);
        return (mm * 60 + ss) * 1000 + ms;
    }
    if (/^\d+(\.\d+)?$/.test(str)) {
        // seconds as float
        return Math.round(parseFloat(str) * 1000);
    }
    return 10000;
}

function recGetActiveLayer() {
    return recLayers.find(l => l.id === recActiveLayerId);
}

function recSetActiveLayer(id) {
    recActiveLayerId = id;
    recRenderUI();
}

function recCreateLayer(name = null) {
    const id = recNextLayerId++;
    const layer = {
        id,
        name: name || `Layer ${id}`,
        visible: true,
        isLooping: true,
        timeline: {
            interactions: [],
            duration: 0,
            playbackPosition: 0,
            isRecording: false,
            isPlaying: false,
            recordingStartTime: 0
        }
    };
    recLayers.push(layer);
    recSetActiveLayer(id);
    return layer;
}

function recAddLayer() { recCreateLayer(); }

function recDuplicateActiveLayer() {
    const a = recGetActiveLayer();
    if (!a) return;
    const nl = recCreateLayer(a.name + ' Copy');
    nl.timeline.interactions = JSON.parse(JSON.stringify(a.timeline.interactions));
    nl.timeline.duration = a.timeline.duration;
    nl.isLooping = a.isLooping;
    recRenderUI();
}

function recDeleteActiveLayer() {
    if (recLayers.length <= 1) { alert('Cannot delete the last layer'); return; }
    const idx = recLayers.findIndex(l => l.id === recActiveLayerId);
    if (idx >= 0) {
        recLayers.splice(idx, 1);
        recActiveLayerId = recLayers[0] ? recLayers[0].id : null;
        recRenderUI();
    }
}

function recToggleLayerVisibility(id) {
    const l = recLayers.find(x => x.id === id);
    if (!l) return;
    l.visible = !l.visible;
    recRenderUI();
}

function recToggleLayerLoop(id) {
    const l = recLayers.find(x => x.id === id);
    if (!l) return;
    l.isLooping = !l.isLooping;
    recRenderUI();
}

function recToggleLayerPlayback(id) {
    const l = recLayers.find(x => x.id === id);
    if (!l) return;
    if (l.timeline.isPlaying) {
        l.timeline.isPlaying = false;
    } else {
        if (l.timeline.interactions.length === 0) return;
        if (l.timeline.playbackPosition >= l.timeline.duration) l.timeline.playbackPosition = 0;
        l.timeline.isPlaying = true;
        recLastPlaybackTime = Date.now();
    }
    recRenderUI();
}

function recToggleRecord() {
    const a = recGetActiveLayer();
    if (!a) return;
    const btn = document.getElementById('recRecordBtn');
    if (a.timeline.isRecording) {
        a.timeline.isRecording = false;
        if (btn) btn.textContent = '⏺ Record';
        a.timeline.duration = 0;
        a.timeline.interactions.forEach(i => { a.timeline.duration = Math.max(a.timeline.duration, i.timestamp); });
    } else {
        a.timeline.isRecording = true;
        a.timeline.recordingStartTime = Date.now() - a.timeline.playbackPosition;
        if (btn) btn.textContent = '⏺ Recording...';
        a.timeline.duration = recMaxDurationMs;
        if (a.timeline.isPlaying) a.timeline.isPlaying = false;
    }
    recRenderUI();
}

function recRecordInteraction(x, y, dx, dy, colorArray) {
    if (!recEnabled) return;
    const a = recGetActiveLayer();
    if (!a || !a.timeline.isRecording) return;
    const timestamp = Date.now() - a.timeline.recordingStartTime;
    if (timestamp > recMaxDurationMs) {
        a.timeline.isRecording = false;
        const btn = document.getElementById('recRecordBtn');
        if (btn) btn.textContent = '⏺ Record';
        a.timeline.duration = 0;
        a.timeline.interactions.forEach(i => { a.timeline.duration = Math.max(a.timeline.duration, i.timestamp); });
        recScheduleRender();
        return;
    }
    const interaction = { timestamp, x: x / canvas.width, y: y / canvas.height, vx: dx, vy: dy, color: colorArray.slice() };
    a.timeline.interactions.push(interaction);
    // If this is the first interaction for this layer, ensure a mini timeline canvas exists in its card
    if (a.timeline.interactions.length === 1) {
        const item = document.querySelector(`.rec-item[data-id="${a.id}"]`);
        if (item) {
            let mini = document.getElementById(`recMiniTimeline-${a.id}`);
            if (!mini) {
                mini = document.createElement('canvas');
                mini.id = `recMiniTimeline-${a.id}`;
                mini.className = 'rec-mini-timeline';
                item.appendChild(mini);
            }
        }
    }
    // Update timelines (main + minis) without rebuilding the whole list
    recRefreshTimelinesUI();
}

function recTogglePlayback() {
    const a = recGetActiveLayer();
    const btn = document.getElementById('recPlayBtn');
    if (!a) return;
    if (a.timeline.isPlaying) {
        a.timeline.isPlaying = false;
        if (btn) btn.textContent = '▶ Play Layer';
    } else {
        if (a.timeline.interactions.length === 0) return;
        recLayers.forEach(l => { if (l.id !== a.id) l.timeline.isPlaying = false; });
        if (a.timeline.playbackPosition >= a.timeline.duration) a.timeline.playbackPosition = 0;
        a.timeline.isPlaying = true;
        if (btn) btn.textContent = '⏸ Pause';
        recIsPlayingAll = false;
        recLastPlaybackTime = Date.now();
    }
    recRenderUI();
}

function recTogglePlaybackAll() {
    const btn = document.getElementById('recPlayAllBtn');
    if (recIsPlayingAll) {
        recLayers.forEach(l => l.timeline.isPlaying = false);
        recIsPlayingAll = false;
        if (btn) btn.textContent = '▶▶ Play All';
        const pl = document.getElementById('recPlayBtn');
        if (pl) pl.textContent = '▶ Play Layer';
    } else {
        const has = recLayers.some(l => l.timeline.interactions.length > 0);
        if (!has) return;
        recLayers.forEach(l => {
            if (l.timeline.interactions.length > 0) {
                if (l.timeline.playbackPosition >= l.timeline.duration) l.timeline.playbackPosition = 0;
                l.timeline.isPlaying = true;
            }
        });
        recIsPlayingAll = true;
        if (btn) btn.textContent = '⏸⏸ Pause All';
        const pl = document.getElementById('recPlayBtn');
        if (pl) pl.textContent = '⏸ Pause';
        recLastPlaybackTime = Date.now();
    }
    recRenderUI();
}

function recStopPlayback() {
    recLayers.forEach(l => { l.timeline.isPlaying = false; l.timeline.playbackPosition = 0; });
    recIsPlayingAll = false;
    const pl = document.getElementById('recPlayBtn');
    if (pl) pl.textContent = '▶ Play Layer';
    const pal = document.getElementById('recPlayAllBtn');
    if (pal) pal.textContent = '▶▶ Play All';
    recRenderUI();
}

function recUpdatePlayback() {
    const now = Date.now();
    const delta = now - recLastPlaybackTime;
    recLayers.forEach(layer => {
        if (!layer.timeline.isPlaying || !layer.visible) return;
        const scaledDelta = delta * recPlaybackSpeed;
        layer.timeline.playbackPosition += scaledDelta;
        const currentTime = layer.timeline.playbackPosition;
        const prevTime = currentTime - scaledDelta;
        const events = layer.timeline.interactions.filter(i => i.timestamp > prevTime && i.timestamp <= currentTime);
        events.forEach(i => {
            const x = i.x * canvas.width;
            const y = i.y * canvas.height;
            multiSplat(x, y, i.vx, i.vy, i.color);
        });
        if (layer.timeline.playbackPosition >= layer.timeline.duration) {
            if (layer.isLooping) {
                layer.timeline.playbackPosition = 0;
            } else {
                layer.timeline.isPlaying = false;
                layer.timeline.playbackPosition = 0;
            }
        }
    });
    recLastPlaybackTime = now;
    recRefreshTimelinesUI();
}

function recRenderUI() {
    const list = document.getElementById('recLayersList');
    if (!list) return;
    list.innerHTML = '';
    recLayers.forEach(layer => {
        const el = document.createElement('div');
        el.className = 'rec-item' + (layer.id === recActiveLayerId ? ' active-layer' : '');
        el.setAttribute('data-id', layer.id);
        el.setAttribute('data-action', 'set-active');
        el.innerHTML = `
            <div class="layer-item-header">
                <div class="layer-thumbnail" style="background: linear-gradient(135deg, rgba(100,200,255,0.4), rgba(150,100,255,0.4)); display:flex; align-items:center; justify-content:center; font-size: 18px;">🎬</div>
                <div class="layer-info">
                    <input type="text" class="layer-title" value="${layer.name}" data-action="rename" data-id="${layer.id}">
                </div>
                <div class="layer-controls">
                    <button class="layer-btn" data-action="toggle-visibility" data-id="${layer.id}">${layer.visible ? '👁️' : '👁️‍🗨️'}</button>
                    <button class="layer-btn" data-action="toggle-play" data-id="${layer.id}">${layer.timeline.isPlaying ? '⏸' : '▶'}</button>
                    <button class="layer-btn" data-action="toggle-loop" data-id="${layer.id}">${layer.isLooping ? '🔁' : '⏹'}</button>
                </div>
            </div>
            <div style="font-size:10px; opacity:0.7; margin-bottom:4px;">${layer.timeline.interactions.length} interactions | ${(layer.timeline.duration/1000).toFixed(1)}s</div>
            <canvas id="recMiniTimeline-${layer.id}" class="rec-mini-timeline"></canvas>
        `;
        list.appendChild(el);
    });
    const recordBtn = document.getElementById('recRecordBtn');
    const playBtn = document.getElementById('recPlayBtn');
    const playAllBtn = document.getElementById('recPlayAllBtn');
    const a = recGetActiveLayer();
    if (recordBtn) recordBtn.textContent = a && a.timeline.isRecording ? '⏺ Recording...' : '⏺ Record';
    if (playBtn) playBtn.textContent = a && a.timeline.isPlaying ? '⏸ Pause' : '▶ Play Layer';
    if (playAllBtn) playAllBtn.textContent = recIsPlayingAll ? '⏸⏸ Pause All' : '▶▶ Play All';
    recRefreshTimelinesUI();
    recBindLayerListEvents();
}

function recBindLayerListEvents() {
    const list = document.getElementById('recLayersList');
    if (!list || list._recBound) return;
    list.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.getAttribute('data-action');
        const id = parseInt(target.getAttribute('data-id'), 10);
        if (!isFinite(id)) return;
        e.stopPropagation();
        if (action === 'toggle-visibility') {
            const layer = recLayers.find(l => l.id === id);
            if (layer) { layer.visible = !layer.visible; recScheduleRender(); }
        } else if (action === 'toggle-play') {
            if (recActiveLayerId !== id) recSetActiveLayer(id);
            recTogglePlayback();
        } else if (action === 'toggle-loop') {
            const layer = recLayers.find(l => l.id === id);
            if (layer) { layer.isLooping = !layer.isLooping; recScheduleRender(); }
        } else if (action === 'set-active') {
            const container = e.target.closest('.rec-item');
            const cid = container ? parseInt(container.getAttribute('data-id'), 10) : id;
            if (isFinite(cid)) recSetActiveLayer(cid);
        }
    });
    list.addEventListener('change', (e) => {
        const input = e.target.closest('input.layer-title[data-action="rename"]');
        if (!input) return;
        const id = parseInt(input.getAttribute('data-id'), 10);
        const layer = recLayers.find(l => l.id === id);
        if (layer) { layer.name = input.value; recScheduleRender(); }
    });
    list._recBound = true;
}

function recResizeTimelineCanvas() {
    const c = document.getElementById('recTimelineCanvas');
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 0;
    const h = c.clientHeight || 0;
    if (w === 0 || h === 0) return;
    c.width = Math.max(1, Math.floor(w * dpr));
    c.height = Math.max(1, Math.floor(h * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function recResizeAllMiniTimelines() {
    const dpr = window.devicePixelRatio || 1;
    recLayers.forEach(layer => {
        const c = document.getElementById(`recMiniTimeline-${layer.id}`);
        if (!c) return;
        const w = c.clientWidth || 0;
        const h = c.clientHeight || 0;
        if (w === 0 || h === 0) return;
        const targetW = Math.max(1, Math.floor(w * dpr));
        const targetH = Math.max(1, Math.floor(h * dpr));
        if (c.width !== targetW || c.height !== targetH) {
            c.width = targetW;
            c.height = targetH;
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    });
}

function recColorToCss(arr) {
    if (!arr || arr.length < 3) return 'rgba(0,0,0,0.6)';
    const r = Math.max(0, Math.min(255, Math.round(arr[0] * 255)));
    const g = Math.max(0, Math.min(255, Math.round(arr[1] * 255)));
    const b = Math.max(0, Math.min(255, Math.round(arr[2] * 255)));
    return `rgb(${r},${g},${b})`;
}

function recDrawTimeline() {
    const c = document.getElementById('recTimelineCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    // Clear
    ctx.clearRect(0, 0, w, h);
    // Background grid stripes
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < h; y += 10) ctx.fillRect(0, y, w, 1);
    // Active layer interactions
    const a = recGetActiveLayer();
    if (!a || a.timeline.duration === 0) return;
    // Time markers
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px monospace';
    const marks = 8;
    for (let i = 0; i <= marks; i++) {
        const x = (i / marks) * w;
        const t = (i / marks) * a.timeline.duration / 1000;
        ctx.fillText(t.toFixed(1) + 's', x + 2, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, 16, 1, h - 16);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
    }
    a.timeline.interactions.forEach(inter => {
        const x = (inter.timestamp / a.timeline.duration) * w;
        ctx.strokeStyle = recColorToCss(inter.color);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, h);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = recColorToCss(inter.color);
        ctx.beginPath();
        ctx.arc(x, (18 + h) / 2, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

function recGetGlobalDurationBase() {
    const maxLayerDuration = recLayers.reduce((m, l) => {
        const ld = (l.timeline?.duration) || (l.timeline?.interactions?.reduce((mm, i) => Math.max(mm, i.timestamp), 0) || 0);
        return Math.max(m, ld);
    }, 0);
    return Math.max(recMaxDurationMs || 0, maxLayerDuration, 1);
}

function recDrawMiniTimelines() {
    const base = recGetGlobalDurationBase();
    recLayers.forEach(layer => {
        const c = document.getElementById(`recMiniTimeline-${layer.id}`);
        if (!c) return;
        const ctx = c.getContext('2d');
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (!w || !h) return;
        ctx.clearRect(0, 0, w, h);
        // subtle stripes
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
        // draw interactions relative to global base (whole)
        ctx.globalAlpha = 0.95;
        (layer.timeline.interactions || []).forEach(inter => {
            const x = (inter.timestamp / base) * w;
            ctx.strokeStyle = recColorToCss(inter.color);
            ctx.beginPath();
            ctx.moveTo(x, 4);
            ctx.lineTo(x, h - 4);
            ctx.lineWidth = 2;
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    });
}

function recRefreshTimelinesUI() {
    recResizeTimelineCanvas();
    recUpdateHeadsUI();
    recDrawTimeline();
    recResizeAllMiniTimelines();
    recDrawMiniTimelines();
}

function recUpdateHeadsUI() {
    const a = recGetActiveLayer();
    const playhead = document.getElementById('recPlayhead');
    const recordhead = document.getElementById('recRecordhead');
    const c = document.getElementById('recTimelineCanvas');
    const w = c ? c.clientWidth : 0;
    if (playhead && a && a.timeline.duration > 0 && w > 0) {
        const ratio = a.timeline.playbackPosition / a.timeline.duration;
        playhead.style.left = `${Math.max(0, Math.min(1, ratio)) * w}px`;
    } else if (playhead) {
        playhead.style.left = '0px';
    }
    if (recordhead) {
        const aL = a;
        if (aL && aL.timeline.isRecording && w > 0) {
            recordhead.style.display = 'block';
            const elapsed = Date.now() - aL.timeline.recordingStartTime;
            const ratio = Math.min(1, elapsed / recMaxDurationMs);
            recordhead.style.left = `${ratio * w}px`;
        } else {
            recordhead.style.display = 'none';
        }
    }
}

function recSetupTimelineInteractions() {
    const c = document.getElementById('recTimelineCanvas');
    if (!c) return;
    let seeking = false;
    function seekClientX(clientX) {
        const rect = c.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const a = recGetActiveLayer();
        if (!a || a.timeline.duration <= 0) return;
        const ratio = x / rect.width;
        a.timeline.playbackPosition = ratio * a.timeline.duration;
        recUpdateHeadsUI();
        recDrawTimeline();
    }
    c.addEventListener('mousedown', (e) => { seeking = true; seekClientX(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (seeking) seekClientX(e.clientX); });
    window.addEventListener('mouseup', () => { seeking = false; });
}

function recSetupResizeHandle() {
    const drawer = document.getElementById('recDrawer');
    const handle = document.getElementById('recResizeHandle');
    if (!drawer || !handle) return;
    let resizing = false;
    let startY = 0;
    let startH = 0;
    handle.addEventListener('mousedown', (e) => {
        resizing = true;
        startY = e.clientY;
        startH = drawer.getBoundingClientRect().height;
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const dy = startY - e.clientY; // move up increases height
        let newH = Math.max(160, Math.min(window.innerHeight * 0.9, startH + dy));
        drawer.style.height = `${Math.round(newH)}px`;
        recResizeTimelineCanvas();
        recUpdateHeadsUI();
        recDrawTimeline();
    });
    window.addEventListener('mouseup', () => { resizing = false; });
}

function recSetStatus(text) {
    const s = document.getElementById('recStatus');
    if (s) s.textContent = text;
}

function recClearActive() {
    const a = recGetActiveLayer();
    if (!a) return;
    a.timeline.interactions = [];
    a.timeline.duration = 0;
    a.timeline.playbackPosition = 0;
    a.timeline.isRecording = false;
    a.timeline.isPlaying = false;
    recSetStatus('Timeline cleared');
    recRenderUI();
}

function recExportAll() {
    const data = {
        version: '2.0',
        layers: recLayers.map(layer => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            isLooping: layer.isLooping,
            timeline: {
                interactions: layer.timeline.interactions,
                duration: layer.timeline.duration
            }
        }))
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    recSetStatus('Exported');
}

function recImportFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            recLayers = [];
            if (data.version === '2.0' && Array.isArray(data.layers)) {
                data.layers.forEach(ld => {
                    const layer = recCreateLayer(ld.name);
                    layer.visible = !!ld.visible;
                    layer.isLooping = ld.isLooping !== undefined ? !!ld.isLooping : true;
                    layer.timeline.interactions = ld.timeline?.interactions || [];
                    layer.timeline.duration = ld.timeline?.duration || 0;
                    layer.timeline.playbackPosition = 0;
                });
            } else if (data.timeline) {
                const layer = recCreateLayer('Imported Layer');
                layer.timeline.interactions = data.timeline.interactions || [];
                layer.timeline.duration = data.timeline.duration || 0;
                layer.timeline.playbackPosition = 0;
            }
            // Reset active to first
            recActiveLayerId = recLayers[0] ? recLayers[0].id : null;
            recRenderUI();
            recSetStatus('Imported');
        } catch (err) {
            recSetStatus('Import error');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
}

function setupRecUI() {
    const recToggleEl = document.getElementById('recToggle');
    const recDrawerEl = document.getElementById('recDrawer');
    if (recToggleEl) {
        recToggleEl.addEventListener('change', (e) => {
            recEnabled = e.target.checked;
            if (recDrawerEl) recDrawerEl.classList.toggle('open', recEnabled);
            if (recEnabled && recLayers.length === 0) { recAddLayer(); }
            // Initialize defaults on open
            const dur = document.getElementById('recMaxDuration');
            if (dur) recMaxDurationMs = recParseTime(dur.value) || 10000;
            const spd = document.getElementById('recPlaybackSpeed');
            if (spd) recPlaybackSpeed = parseFloat(spd.value) || 1;
            recRenderUI();
            recResizeTimelineCanvas();
            recUpdateHeadsUI();
            recDrawTimeline();
            recResizeAllMiniTimelines();
            recDrawMiniTimelines();
        });
    }
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('recRecordBtn', recToggleRecord);
    bind('recPlayBtn', recTogglePlayback);
    bind('recPlayAllBtn', recTogglePlaybackAll);
    bind('recStopBtn', recStopPlayback);
    bind('recAddLayerBtn', recAddLayer);
    bind('recDuplicateLayerBtn', recDuplicateActiveLayer);
    bind('recDeleteLayerBtn', recDeleteActiveLayer);
    bind('recClearBtn', recClearActive);
    bind('recExportBtn', recExportAll);
    const impBtn = document.getElementById('recImportBtn');
    const impFile = document.getElementById('recImportFile');
    if (impBtn && impFile) {
        impBtn.addEventListener('click', () => impFile.click());
        impFile.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) recImportFromFile(f); e.target.value = ''; });
    }
    const closeBtn = document.getElementById('recCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        const t = document.getElementById('recToggle');
        if (t) t.checked = false;
        recEnabled = false;
        if (recDrawerEl) recDrawerEl.classList.remove('open');
        recStopPlayback();
        recRenderUI();
    });
    const speedSel = document.getElementById('recPlaybackSpeed');
    if (speedSel) speedSel.addEventListener('change', (e) => { recPlaybackSpeed = parseFloat(e.target.value) || 1; });
    const durInput = document.getElementById('recMaxDuration');
    if (durInput) durInput.addEventListener('change', (e) => { recMaxDurationMs = recParseTime(e.target.value) || 10000; });
    // One-time setup for interactions and resizing
    recSetupTimelineInteractions();
    recSetupResizeHandle();
    window.addEventListener('resize', () => { recResizeTimelineCanvas(); recUpdateHeadsUI(); recDrawTimeline(); recResizeAllMiniTimelines(); recDrawMiniTimelines(); });
}

window.saveColor = () => {
    const color = document.getElementById('colorPicker').value;
    colorStorage.add(color);
};

window.clearColors = () => {
    colorStorage.clear();
};

function renderSavedColors() {
    const container = document.getElementById('savedColors');
    container.innerHTML = '';
    savedColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.onclick = () => window.setColor(color);
        container.appendChild(swatch);
    });
}

function trackMouseMovement(e) {
    if (!pointer.down || isReplayActive) return;
    
    const position = {
        x: pointer.x,
        y: pointer.y,
        dx: pointer.dx,
        dy: pointer.dy,
        timestamp: Date.now(),
        color: [...pointer.color],
        velocity: { dx: pointer.dx, dy: pointer.dy }
    };
    
    mousePositions.push(position);
    const cutoff = position.timestamp - FADE_END;
    mousePositions = mousePositions.filter(pos => pos.timestamp >= cutoff);
    
    if (showTrail && mousePositions.length > 1) {
        const lastPos = mousePositions[mousePositions.length - 2];
        trailCtx.beginPath();
        trailCtx.strokeStyle = currentTrailColorCss;
        trailCtx.lineWidth = 2;
        trailCtx.lineCap = 'round';
        trailCtx.lineJoin = 'round';
        trailCtx.moveTo(lastPos.x, lastPos.y);
        trailCtx.lineTo(position.x, position.y);
        trailCtx.stroke();
        
        setTimeout(() => {
            trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        }, FADE_END);
    }
}

function replayMovements() {
    if (!isRightMouseDown || !isReplayActive) {
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        customCursor.style.display = 'none';
        return;
    }
    
    customCursor.style.opacity = showCursor ? '1' : '0';
    const now = Date.now();
    const replayProgress = (now % 500) / 500;
    
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    
    mousePositions.forEach((pos, index) => {
        const progress = index / (mousePositions.length - 1);
        if (progress <= replayProgress) {
            splat(pos.x, pos.y, pos.velocity.dx, pos.velocity.dy, pos.color);
            
            if (Math.abs(progress - replayProgress) < 0.1) {
                customCursor.style.display = 'block';
                customCursor.style.left = (pos.x - 13) + 'px';
                customCursor.style.top = (pos.y - 13) + 'px';
            }
        }
    });
    
    requestAnimationFrame(replayMovements);
}

const gl = canvas.getContext('webgl2', {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: true
});

gl.getExtension('EXT_color_buffer_float');
const linearExt = gl.getExtension('OES_texture_float_linear');
gl.clearColor(0, 0, 0, 0);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

let config = {
    TEXTURE_DOWNSAMPLE: 1,
    DENSITY_DISSIPATION: 0.996,
    VELOCITY_DISSIPATION: 0.999,
    PRESSURE_DISSIPATION: 0.944,
    PRESSURE_ITERATIONS: 95,
    CURL: 40,
    SPLAT_RADIUS: 0.011,
    DYE_RESOLUTION: 2048,
    SIM_RESOLUTION: 512
};

const presets = {
    silky: { DENSITY_DISSIPATION: 0.9995, VELOCITY_DISSIPATION: 1.0001, PRESSURE_DISSIPATION: 0.8, PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.011 },
    thick: { DENSITY_DISSIPATION: 0.999, VELOCITY_DISSIPATION: 0.99, PRESSURE_DISSIPATION: 0.95, PRESSURE_ITERATIONS: 120, CURL: 1, SPLAT_RADIUS: 0.015 },
    wispy: { DENSITY_DISSIPATION: 0.9972, VELOCITY_DISSIPATION: 0.9996, PRESSURE_DISSIPATION: 0.92, PRESSURE_ITERATIONS: 40, CURL: 60, SPLAT_RADIUS: 0.01 },
    chaotic: { DENSITY_DISSIPATION: 0.996, VELOCITY_DISSIPATION: 0.9938, PRESSURE_DISSIPATION: 0.934, PRESSURE_ITERATIONS: 25, CURL: 12, SPLAT_RADIUS: 0.0151 },
    ethereal: { DENSITY_DISSIPATION: 0.9998, VELOCITY_DISSIPATION: 1.0005, PRESSURE_DISSIPATION: 0.75, PRESSURE_ITERATIONS: 15, CURL: 45, SPLAT_RADIUS: 0.008 },
    turbulent: { DENSITY_DISSIPATION: 0.994, VELOCITY_DISSIPATION: 0.997, PRESSURE_DISSIPATION: 0.88, PRESSURE_ITERATIONS: 60, CURL: 55, SPLAT_RADIUS: 0.013 },
    marble: { DENSITY_DISSIPATION: 0.9992, VELOCITY_DISSIPATION: 0.9985, PRESSURE_DISSIPATION: 0.98, PRESSURE_ITERATIONS: 100, CURL: 8, SPLAT_RADIUS: 0.018 },
    electric: { DENSITY_DISSIPATION: 0.9965, VELOCITY_DISSIPATION: 1.0008, PRESSURE_DISSIPATION: 0.82, PRESSURE_ITERATIONS: 35, CURL: 52, SPLAT_RADIUS: 0.006 }
};

window.applyPreset = (name) => {
    const preset = presets[name];
    if (!preset) return;
    
    activePreset = name;
    updatePresetButtons();
    
    const initialConfig = { ...config };
    const startTime = performance.now();
    const duration = 800;
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easing = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const t = easing(progress);
        
        Object.keys(preset).forEach((key) => {
            config[key] = initialConfig[key] + (preset[key] - initialConfig[key]) * t;
        });
        
        updateSliderValues();
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
};

function updatePresetButtons() {
    const presetContainer = document.querySelector('.presets');
    if (!presetContainer) return;
    
    const buttons = presetContainer.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.textContent === activePreset) {
            btn.style.background = 'rgba(100, 200, 255, 0.4)';
            btn.style.transform = 'scale(1.05)';
        } else {
            btn.style.background = 'rgba(255, 255, 255, 0.15)';
            btn.style.transform = 'scale(1)';
        }
    });
}

window.toggleFreeze = () => {
    const freezeBtn = document.getElementById('freezeBtn');
    const isUnfreezing = freezeBtn.textContent.includes('Unfreeze');
    
    freezeBtn.textContent = isUnfreezing ? '❄️ Freeze' : '🔥 Unfreeze';
    freezeBtn.style.background = isUnfreezing ? 'rgba(255, 255, 255, 0.15)' : 'rgba(100, 200, 255, 0.4)';
    
    const startTime = performance.now();
    const duration = 300;
    
    let startDensity, endDensity, startVelocity, endVelocity;
    
    if (!isUnfreezing) {
        savedDensity = config.DENSITY_DISSIPATION;
        savedVelocity = config.VELOCITY_DISSIPATION;
        startDensity = config.DENSITY_DISSIPATION;
        startVelocity = config.VELOCITY_DISSIPATION;
        endDensity = 1.0;
        endVelocity = 0.9;
    } else {
        startDensity = config.DENSITY_DISSIPATION;
        startVelocity = config.VELOCITY_DISSIPATION;
        endDensity = savedDensity;
        endVelocity = savedVelocity;
    }
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easing = (t) => t * (2 - t);
        const easedProgress = easing(progress);
        
        config.DENSITY_DISSIPATION = startDensity + (endDensity - startDensity) * easedProgress;
        config.VELOCITY_DISSIPATION = startVelocity + (endVelocity - startVelocity) * easedProgress;
        
        updateSliderValues();
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
};

window.playExpandAnimation = () => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Phase 1: 4 drags from center to each corner
    const corners = [
        { x: canvas.width * 0.1, y: canvas.height * 0.1 },   // Top-left
        { x: canvas.width * 0.9, y: canvas.height * 0.1 },   // Top-right
        { x: canvas.width * 0.1, y: canvas.height * 0.9 },   // Bottom-left
        { x: canvas.width * 0.9, y: canvas.height * 0.9 }    // Bottom-right
    ];
    
    const cornerColors = [
        [0.9, 0.1, 0.2],  // Red
        [0.1, 0.9, 0.2],  // Green
        [0.1, 0.2, 0.9],  // Blue
        [0.9, 0.9, 0.1]   // Yellow
    ];
    
    // Animate to corners simultaneously
    corners.forEach((corner, idx) => {
        const steps = 20;
        const color = cornerColors[idx];
        
        for (let i = 0; i <= steps; i++) {
            setTimeout(() => {
                const progress = i / steps;
                const x = centerX + (corner.x - centerX) * progress;
                const y = centerY + (corner.y - centerY) * progress;
                const dx = (corner.x - centerX) / steps * 2;
                const dy = (corner.y - centerY) / steps * 2;
                splat(x, y, dx, dy, color);
            }, i * 25);
        }
    });
    
    // Phase 2: After pause, 4 outward drags in cardinal directions
    setTimeout(() => {
        const cardinals = [
            { startX: centerX, startY: centerY, endX: centerX, endY: canvas.height * 0.05 },        // Up
            { startX: centerX, startY: centerY, endX: canvas.width * 0.95, endY: centerY },         // Right
            { startX: centerX, startY: centerY, endX: centerX, endY: canvas.height * 0.95 },        // Down
            { startX: centerX, startY: centerY, endX: canvas.width * 0.05, endY: centerY }          // Left
        ];
        
        const cardinalColors = [
            [0.9, 0.1, 0.9],  // Magenta
            [0.1, 0.9, 0.9],  // Cyan
            [0.9, 0.5, 0.1],  // Orange
            [0.5, 0.1, 0.9]   // Purple
        ];
        
        cardinals.forEach((dir, idx) => {
            const steps = 25;
            const color = cardinalColors[idx];
            
            for (let i = 0; i <= steps; i++) {
                setTimeout(() => {
                    const progress = i / steps;
                    const x = dir.startX + (dir.endX - dir.startX) * progress;
                    const y = dir.startY + (dir.endY - dir.startY) * progress;
                    const dx = (dir.endX - dir.startX) / steps * 3;
                    const dy = (dir.endY - dir.startY) / steps * 3;
                    splat(x, y, dx, dy, color);
                }, i * 20);
            }
        });
    }, 600); // Pause before cardinal expansion
};

window.playSmashAnimation = () => {
    const centerY = canvas.height / 2;
    const leftX = canvas.width * 0.2;
    const rightX = canvas.width * 0.8;
    const targetX = canvas.width / 2;
    
    // Add some randomness to the collision point
    const randomOffsetY = (Math.random() - 0.5) * canvas.height * 0.2;
    const randomOffsetX = (Math.random() - 0.5) * canvas.width * 0.1;
    const collisionY = centerY + randomOffsetY;
    const collisionX = targetX + randomOffsetX;
    
    // Generate random colors
    const color1 = pointer.color;
    const color2 = [Math.random(), Math.random(), Math.random()];
    
    // Left side smash (comes in first)
    setTimeout(() => {
        const steps = 15;
        for (let i = 0; i <= steps; i++) {
            setTimeout(() => {
                const progress = i / steps;
                const x = leftX + (collisionX - leftX) * progress;
                const y = collisionY + (Math.random() - 0.5) * 20;
                const dx = (collisionX - leftX) / steps * 2;
                const dy = (Math.random() - 0.5) * 2;
                splat(x, y, dx, dy, color1);
            }, i * 20);
        }
    }, 0);
    
    // Right side smash (comes in slightly after)
    setTimeout(() => {
        const steps = 15;
        for (let i = 0; i <= steps; i++) {
            setTimeout(() => {
                const progress = i / steps;
                const x = rightX + (collisionX - rightX) * progress;
                const y = collisionY + (Math.random() - 0.5) * 20;
                const dx = (collisionX - rightX) / steps * 2;
                const dy = (Math.random() - 0.5) * 2;
                splat(x, y, dx, dy, color2);
            }, i * 20);
        }
    }, 150);
};

// Jellyfish origin debounce
let jellyfishOrigin = null;
let jellyfishOriginTimeout = null;

window.playJellyfishAnimation = () => {
    // Use existing origin if within debounce window, otherwise create new one
    if (!jellyfishOrigin) {
        jellyfishOrigin = {
            x: canvas.width * (0.3 + Math.random() * 0.4),
            y: canvas.height * (0.85 + Math.random() * 0.1) // Start at bottom (85-95%)
        };
    }
    
    const originX = jellyfishOrigin.x;
    const originY = jellyfishOrigin.y;
    
    // Reset debounce timer - origin stays for 3 seconds after last click
    if (jellyfishOriginTimeout) {
        clearTimeout(jellyfishOriginTimeout);
    }
    jellyfishOriginTimeout = setTimeout(() => {
        jellyfishOrigin = null;
    }, 3000);
    
    // Random pulse count (4-7 pulses)
    const pulseCount = 4 + Math.floor(Math.random() * 4);
    
    for (let pulse = 0; pulse < pulseCount; pulse++) {
        setTimeout(() => {
            const steps = 12;
            const randomColor = [Math.random(), Math.random(), Math.random()];
            
            // Random base velocity for this pulse
            const baseVelocity = -10 - Math.random() * 6;
            
            for (let i = 0; i < steps; i++) {
                setTimeout(() => {
                    // Easing for more natural motion (starts fast, slows down)
                    const progress = i / steps;
                    const easing = 1 - Math.pow(1 - progress, 2);
                    
                    // Spread out from center as it goes up
                    const spreadAmount = easing * 80;
                    const randomSpread = (Math.random() - 0.5) * spreadAmount;
                    const x = originX + randomSpread;
                    const y = originY - (easing * 200);
                    
                    // Velocity decreases with easing, but stays vertical
                    const velocityMultiplier = 1 - (progress * 0.7);
                    const dx = randomSpread * 0.15;
                    const dy = baseVelocity * velocityMultiplier;
                    
                    splat(x, y, dx, dy, randomColor);
                }, i * 25);
            }
        }, pulse * 250);
    }
};

window.playJellyfishSwarm = () => {
    // Save original settings
    const originalCurl = config.CURL;
    const originalVelocity = config.VELOCITY_DISSIPATION;
    const originalDensity = config.DENSITY_DISSIPATION;
    
    // Use the great settings from the screenshot
    config.CURL = 40;
    config.VELOCITY_DISSIPATION = 0.9888;
    config.DENSITY_DISSIPATION = 0.9934;
    
    // Create 3 locations spread across X axis
    const locationCount = 3;
    const locations = [];
    
    // Generate locations spread across center 80% of X axis
    for (let i = 0; i < locationCount; i++) {
        const xPos = canvas.width * (0.1 + (i / (locationCount - 1)) * 0.8);
        locations.push({ x: xPos, y: null });
    }
    
    // Assign Y positions (origin heights) with variety
    for (let i = 0; i < locationCount; i++) {
        // Use full variety of heights since we only have 3 locations
        const yHeight = 0.65 + Math.random() * 0.2; // Range (65-85%)
        locations[i].y = canvas.height * yHeight;
    }
    
    // For each location, spawn 3 jellyfish in sequence
    locations.forEach((location, locIndex) => {
        for (let j = 0; j < 3; j++) {
            setTimeout(() => {
                const jellyfishX = location.x;
                const jellyfishY = location.y;
                
                // Medium pulses (4-5 pulses)
                const pulseCount = 4 + Math.floor(Math.random() * 2);
                const jellyfishColor = [Math.random(), Math.random(), Math.random()];
                
                // Stronger velocity for nice jelly shapes
                const baseVelocity = -7 - Math.random() * 3;
                
                for (let pulse = 0; pulse < pulseCount; pulse++) {
                    setTimeout(() => {
                        const steps = 14;
                        
                        for (let i = 0; i < steps; i++) {
                            setTimeout(() => {
                                const progress = i / steps;
                                const easing = 1 - Math.pow(1 - progress, 2);
                                
                                // More spread for jellyfish shape
                                const spreadAmount = easing * 35;
                                const randomSpread = (Math.random() - 0.5) * spreadAmount;
                                const x = jellyfishX + randomSpread;
                                const y = jellyfishY - (easing * 140);
                                
                                const velocityMultiplier = 1 - (progress * 0.6);
                                const dx = randomSpread * 0.12;
                                const dy = baseVelocity * velocityMultiplier;
                                
                                // Bigger brush size for nice jellies
                                const originalBrush = config.SPLAT_RADIUS;
                                config.SPLAT_RADIUS = 0.005;
                                splat(x, y, dx, dy, jellyfishColor);
                                config.SPLAT_RADIUS = originalBrush;
                            }, i * 25);
                        }
                    }, pulse * 220);
                }
            }, (locIndex * 3 + j) * 200); // Stagger each jellyfish
        }
    });
    
    // Restore settings after swarm completes
    setTimeout(() => {
        config.CURL = originalCurl;
        config.VELOCITY_DISSIPATION = originalVelocity;
        config.DENSITY_DISSIPATION = originalDensity;
    }, 5000);
};

window.playVortexAnimation = (clockwise = true) => {
    // Save original settings
    const originalBrush = config.SPLAT_RADIUS;
    const originalDensity = config.DENSITY_DISSIPATION;
    const originalCurl = config.CURL;
    
    // Reduce curl for cleaner spirals
    config.CURL = 10;
    
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    const numStreams = 3; // 3 streams per vortex (6 total)
    const rotations = 1.5; // Fewer rotations for more spread
    const steps = 50; // Fewer steps for more spacing
    
    // Neon colors - bright and saturated
    const streamColors = [
        [1.0, 0.0, 0.4],  // Neon pink
        [0.0, 1.0, 0.3],  // Neon green
        [0.0, 0.4, 1.0]   // Neon blue
    ];
    
    // Outer vortex - starts from edge, ends at mid-radius
    for (let stream = 0; stream < numStreams; stream++) {
        const startAngle = (stream / numStreams) * Math.PI * 2;
        const color = streamColors[stream];
        
        for (let i = 0; i <= steps; i++) {
            setTimeout(() => {
                const progress = i / steps;
                
                // Modulate brush size - smaller as we approach center
                const brushSize = 0.008 * (1 - progress * 0.7); // 0.008 to 0.0024
                config.SPLAT_RADIUS = brushSize;
                
                // Modulate density - higher sustain as we approach center
                const densitySustain = 0.992 + progress * 0.007; // 0.992 to 0.999
                config.DENSITY_DISSIPATION = densitySustain;
                
                // Outer vortex: from 45% radius to 20% radius (doesn't reach center)
                const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
                const minRadius = Math.min(canvas.width, canvas.height) * 0.20;
                const radius = maxRadius - (maxRadius - minRadius) * progress;
                
                // Angle increases as we spiral in
                const direction = clockwise ? 1 : -1;
                const angle = startAngle + direction * rotations * Math.PI * 2 * progress;
                
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                
                // Velocity tangent to the spiral
                const speed = 7;
                const tangentAngle = angle + direction * Math.PI / 2;
                const dx = speed * Math.cos(tangentAngle) - radius * 0.08 * Math.cos(angle);
                const dy = speed * Math.sin(tangentAngle) - radius * 0.08 * Math.sin(angle);
                
                splat(x, y, dx, dy, color);
            }, i * 40 + stream * 250); // Even more spacing
        }
    }
    
    // Inner vortex - covers center area, offset angle
    for (let stream = 0; stream < numStreams; stream++) {
        const startAngle = (stream / numStreams) * Math.PI * 2 + Math.PI / numStreams; // Offset by half
        const color = streamColors[(stream + 1) % numStreams]; // Different color order
        
        for (let i = 0; i <= steps; i++) {
            setTimeout(() => {
                const progress = i / steps;
                
                // Modulate brush size - smaller as we approach center
                const brushSize = 0.006 * (1 - progress * 0.6); // 0.006 to 0.0024
                config.SPLAT_RADIUS = brushSize;
                
                // Modulate density - higher sustain as we approach center
                const densitySustain = 0.992 + progress * 0.007; // 0.992 to 0.999
                config.DENSITY_DISSIPATION = densitySustain;
                
                // Inner vortex: from 18% radius to 3% radius (covers center without point)
                const maxRadius = Math.min(canvas.width, canvas.height) * 0.18;
                const minRadius = Math.min(canvas.width, canvas.height) * 0.03;
                const radius = maxRadius - (maxRadius - minRadius) * progress;
                
                // Angle increases as we spiral in
                const direction = clockwise ? 1 : -1;
                const angle = startAngle + direction * rotations * Math.PI * 2 * progress;
                
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                
                // Velocity tangent to the spiral
                const speed = 6;
                const tangentAngle = angle + direction * Math.PI / 2;
                const dx = speed * Math.cos(tangentAngle) - radius * 0.08 * Math.cos(angle);
                const dy = speed * Math.sin(tangentAngle) - radius * 0.08 * Math.sin(angle);
                
                splat(x, y, dx, dy, color);
            }, i * 40 + stream * 250 + 500); // Start inner vortex later with more spacing
        }
    }
    
    // After animation completes, smoothly transition settings
    const animationEndTime = steps * 40 + 500 + numStreams * 250 + 500;
    
    setTimeout(() => {
        // Smooth decay phase - gradually reduce density over 500ms
        const decayDuration = 500;
        const decaySteps = 20;
        let decayStep = 0;
        
        const decayInterval = setInterval(() => {
            decayStep++;
            const decayProgress = decayStep / decaySteps;
            
            // Smoothly transition from 0.999 to 0.985 to 0.9999
            if (decayProgress <= 0.6) {
                // First 60%: decay from 0.999 to 0.985
                const phase1Progress = decayProgress / 0.6;
                config.DENSITY_DISSIPATION = 0.999 - (0.014 * phase1Progress);
            } else {
                // Last 40%: ramp up from 0.985 to 0.9999
                const phase2Progress = (decayProgress - 0.6) / 0.4;
                config.DENSITY_DISSIPATION = 0.985 + (0.0149 * phase2Progress);
            }
            
            if (decayStep >= decaySteps) {
                clearInterval(decayInterval);
                config.DENSITY_DISSIPATION = 0.9999; // Lock at maximum
                config.SPLAT_RADIUS = originalBrush;
                config.CURL = originalCurl;
                
                // Restore original density after a longer period
                setTimeout(() => {
                    config.DENSITY_DISSIPATION = originalDensity;
                }, 5000);
            }
        }, decayDuration / decaySteps);
    }, animationEndTime);
};

// Setup vortex button click handlers
const vortexBtn = document.getElementById('vortexBtn');
vortexBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playVortexAnimation(true); // Clockwise
});
vortexBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    playVortexAnimation(false); // Counter-clockwise
});

// Setup smash button click handlers
const smashBtn = document.getElementById('smashBtn');
smashBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playSmashAnimation();
});
smashBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    playExpandAnimation();
});

// Setup jellyfish button click handlers
const jellyfishBtn = document.getElementById('jellyfishBtn');
jellyfishBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playJellyfishAnimation();
});
jellyfishBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    playJellyfishSwarm();
});

// Ascend animation state
let ascendActive = false;
let ascendAnimationId = null;

window.toggleAscend = () => {
    ascendActive = !ascendActive;
    const ascendBtn = document.getElementById('ascendToggle');
    
    if (ascendActive) {
        ascendBtn.style.background = 'rgba(150, 255, 200, 0.5)';
        ascendBtn.textContent = '⬆️ Ascend (Active)';
        startAscendAnimation();
    } else {
        ascendBtn.style.background = 'rgba(150, 255, 200, 0.2)';
        ascendBtn.textContent = '⬆️ Ascend';
        if (ascendAnimationId) {
            clearTimeout(ascendAnimationId);
            ascendAnimationId = null;
        }
    }
};

function startAscendAnimation() {
    if (!ascendActive) return;
    
    // Save original settings
    const originalDensity = config.DENSITY_DISSIPATION;
    const originalVelocity = config.VELOCITY_DISSIPATION;
    const originalBrush = config.SPLAT_RADIUS;
    
    // Set long-lasting flow settings
    config.DENSITY_DISSIPATION = 0.999;  // Very high density sustain
    config.VELOCITY_DISSIPATION = 1.0;   // Maximum velocity sustain - fluid never slows down
    config.SPLAT_RADIUS = 0.008;         // Medium brush size
    
    const centerX = canvas.width * 0.5;
    const startY = canvas.height * 0.95;
    const endY = canvas.height * 0.05;
    const duration = 30000; // 30 seconds
    const steps = 600; // 50ms per step
    const randomnessEnabled = document.getElementById('ascendRandomness').checked;
    
    let currentStep = 0;
    let listingPhase = 0; // For gradual left-right listing
    let spurtCounter = 0; // Counter for occasional spurts
    
    function animateStep() {
        if (!ascendActive) {
            // Restore original settings when stopped
            config.DENSITY_DISSIPATION = originalDensity;
            config.VELOCITY_DISSIPATION = originalVelocity;
            config.SPLAT_RADIUS = originalBrush;
            return;
        }
        
        const progress = currentStep / steps;
        const y = startY - (startY - endY) * progress;
        
        // Calculate x position with optional randomness
        let x = centerX;
        if (randomnessEnabled) {
            // Gradual listing left and right using sine wave
            listingPhase += 0.05;
            const listingAmount = Math.sin(listingPhase) * 50;
            x = centerX + listingAmount;
        }
        
        // Random color for each cycle
        const color = [Math.random(), Math.random(), Math.random()];
        
        // Strong upward velocity for long flows
        const dx = randomnessEnabled ? Math.sin(listingPhase) * 0.8 : 0;
        const dy = -8;
        
        splat(x, y, dx, dy, color);
        
        // Occasional spurts from the origin (every 3-5 seconds)
        spurtCounter++;
        if (spurtCounter >= 60 + Math.random() * 40) { // 3-5 seconds at 50ms intervals
            spurtCounter = 0;
            
            // Create a quick spurt of 8-12 splats shooting up from origin
            const spurtCount = 8 + Math.floor(Math.random() * 5);
            
            // Pick a vibrant pure color (avoid white/gray)
            const spurtColorChoice = Math.floor(Math.random() * 6);
            const spurtColors = [
                [0.9, 0.1, 0.2],  // Pure red
                [0.1, 0.9, 0.2],  // Pure green
                [0.1, 0.2, 0.9],  // Pure blue
                [0.9, 0.9, 0.1],  // Pure yellow
                [0.9, 0.1, 0.9],  // Pure magenta
                [0.1, 0.9, 0.9]   // Pure cyan
            ];
            const spurtColor = spurtColors[spurtColorChoice];
            
            for (let i = 0; i < spurtCount; i++) {
                setTimeout(() => {
                    const spurtX = centerX + (Math.random() - 0.5) * 20;
                    const spurtY = startY;
                    const spurtDx = (Math.random() - 0.5) * 2;
                    // Velocity ramps up smoothly - final splat gets full 2.2x boost
                    const progress = i / (spurtCount - 1); // 0 to 1
                    const velocityMultiplier = 1 + (progress * 1.2); // 1x to 2.2x
                    const spurtDy = (-12 - Math.random() * 4) * velocityMultiplier;
                    
                    splat(spurtX, spurtY, spurtDx, spurtDy, spurtColor);
                }, i * 30);
            }
        }
        
        currentStep++;
        
        // Check if we've reached the top
        if (currentStep >= steps) {
            // Reset and start over
            currentStep = 0;
            listingPhase = 0;
        }
        
        // Continue animation
        ascendAnimationId = setTimeout(animateStep, 50);
    }
    
    animateStep();
}

// Setup ascend toggle button
document.getElementById('ascendToggle').addEventListener('click', toggleAscend);

// Portal animation
let portalAlternate = false; // Track left/right alternation

window.playPortalAnimation = () => {
    // Save current multiplier and brush size
    const originalMultiplier = animationMultiplier;
    const originalBrush = config.SPLAT_RADIUS;
    
    // Set to 8x for kaleidoscope effect
    animationMultiplier = 8;
    multiplierSlider.value = 8;
    multiplierValue.textContent = '8x';
    
    // Set very small brush size to avoid blowing out
    config.SPLAT_RADIUS = 0.001;
    
    // Alternate between left and right corners
    portalAlternate = !portalAlternate;
    
    // Start at bottom edge, parallel to axis
    const startX = canvas.width * 0.5;
    const startY = canvas.height * 0.95; // Very bottom
    
    // End at top corner, hugging the edge
    const endX = portalAlternate ? canvas.width * 0.05 : canvas.width * 0.95; // Very edge
    const endY = canvas.height * 0.05; // Very top
    
    // Random vibrant color for this portal
    const portalColors = [
        [1.0, 0.0, 0.5],  // Hot pink
        [0.5, 0.0, 1.0],  // Purple
        [0.0, 1.0, 0.5],  // Cyan-green
        [1.0, 0.5, 0.0],  // Orange
        [0.0, 0.5, 1.0],  // Sky blue
        [1.0, 0.0, 1.0]   // Magenta
    ];
    const color = portalColors[Math.floor(Math.random() * portalColors.length)];
    
    // Update button color to match portal
    const portalBtn = document.getElementById('portalBtn');
    const r = Math.floor(color[0] * 255);
    const g = Math.floor(color[1] * 255);
    const b = Math.floor(color[2] * 255);
    portalBtn.style.background = `rgba(${r}, ${g}, ${b}, 0.3)`;
    
    // Animate the swoop - slow and controlled
    const steps = 35;
    for (let i = 0; i <= steps; i++) {
        setTimeout(() => {
            const progress = i / steps;
            
            // Gentle ease - smooth throughout
            const easing = progress * progress;
            
            // Start angular/parallel, then curve to corner (hugging edge)
            // Control point stays near the edge to hug it
            const controlX = portalAlternate ? canvas.width * 0.05 : canvas.width * 0.95; // Hug edge
            const controlY = canvas.height * 0.5; // Midpoint
            
            const t = easing;
            const mt = 1 - t;
            const x = mt * mt * startX + 2 * mt * t * controlX + t * t * endX;
            const y = mt * mt * startY + 2 * mt * t * controlY + t * t * endY;
            
            // Very gentle velocity - slow motion
            const dx = 2 * (mt * (controlX - startX) + t * (endX - controlX)) * 0.3;
            const dy = 2 * (mt * (controlY - startY) + t * (endY - controlY)) * 0.3;
            
            multiSplat(x, y, dx, dy, color);
            
            // Restore settings after animation completes
            if (i === steps) {
                setTimeout(() => {
                    animationMultiplier = originalMultiplier;
                    multiplierSlider.value = originalMultiplier;
                    multiplierValue.textContent = originalMultiplier + 'x';
                    config.SPLAT_RADIUS = originalBrush;
                    
                    // Reset button color
                    portalBtn.style.background = 'rgba(255, 100, 255, 0.2)';
                }, 200);
            }
        }, i * 50); // Very slow timing - 50ms per step
    }
};

window.playPortalExpandAnimation = () => {
    // Save current multiplier and brush size
    const originalMultiplier = animationMultiplier;
    const originalBrush = config.SPLAT_RADIUS;
    
    // Set to 8x for kaleidoscope effect
    animationMultiplier = 8;
    multiplierSlider.value = 8;
    multiplierValue.textContent = '8x';
    
    // Minimum brush size
    config.SPLAT_RADIUS = 0.001;
    
    // Random vibrant color for this portal
    const portalColors = [
        [1.0, 0.0, 0.5],  // Hot pink
        [0.5, 0.0, 1.0],  // Purple
        [0.0, 1.0, 0.5],  // Cyan-green
        [1.0, 0.5, 0.0],  // Orange
        [0.0, 0.5, 1.0],  // Sky blue
        [1.0, 0.0, 1.0]   // Magenta
    ];
    const color = portalColors[Math.floor(Math.random() * portalColors.length)];
    
    // Update button color
    const portalBtn = document.getElementById('portalBtn');
    const r = Math.floor(color[0] * 255);
    const g = Math.floor(color[1] * 255);
    const b = Math.floor(color[2] * 255);
    portalBtn.style.background = `rgba(${r}, ${g}, ${b}, 0.3)`;
    
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    
    // Pattern: CW, CW, Out, CCW, CCW, Out (repeats)
    // One drag every 2 seconds
    const numCycles = 10; // 10 cycles of the 6-drag pattern
    const dragInterval = 2000; // 2 seconds between drags
    
    let dragIndex = 0;
    
    for (let cycle = 0; cycle < numCycles; cycle++) {
        const cycleStartTime = cycle * 6 * dragInterval; // 6 drags per cycle
        
        // Expanding radius for this cycle
        const baseRadius = (cycle + 1) * (Math.min(canvas.width, canvas.height) * 0.08);
        
        // Pattern array: [type, direction]
        // type: 'rotate' or 'outward'
        // direction: 1 (clockwise), -1 (counter-clockwise), 0 (outward)
        const pattern = [
            { type: 'rotate', direction: 1 },   // CW
            { type: 'rotate', direction: 1 },   // CW
            { type: 'outward', direction: 0 },  // Out
            { type: 'rotate', direction: -1 },  // CCW
            { type: 'rotate', direction: -1 },  // CCW
            { type: 'outward', direction: 0 }   // Out
        ];
        
        pattern.forEach((drag, patternIndex) => {
            const dragDelay = cycleStartTime + patternIndex * dragInterval;
            
            // Random angle for this drag
            const angle = Math.random() * Math.PI * 2;
            const radius = baseRadius + (Math.random() - 0.5) * 30;
            
            setTimeout(() => {
                const startX = centerX + radius * Math.cos(angle);
                const startY = centerY + radius * Math.sin(angle);
                
                if (drag.type === 'outward') {
                    // Small outward drag - faster velocity
                    const dragLength = 30 + Math.random() * 30; // 30-60 pixels
                    const steps = 8;
                    
                    for (let i = 0; i < steps; i++) {
                        setTimeout(() => {
                            const progress = i / steps;
                            const distance = progress * dragLength;
                            const x = startX + distance * Math.cos(angle);
                            const y = startY + distance * Math.sin(angle);
                            
                            const dx = Math.cos(angle) * 3.5;
                            const dy = Math.sin(angle) * 3.5;
                            
                            multiSplat(x, y, dx, dy, color);
                        }, i * 30);
                    }
                } else {
                    // Small rotating drag - faster velocity
                    const dragLength = 35 + Math.random() * 35; // 35-70 pixels
                    const steps = 10;
                    const tangentAngle = angle + drag.direction * Math.PI / 2;
                    
                    for (let i = 0; i < steps; i++) {
                        setTimeout(() => {
                            const progress = i / steps;
                            const distance = progress * dragLength;
                            const x = startX + distance * Math.cos(tangentAngle);
                            const y = startY + distance * Math.sin(tangentAngle);
                            
                            const dx = Math.cos(tangentAngle) * 3.5;
                            const dy = Math.sin(tangentAngle) * 3.5;
                            
                            multiSplat(x, y, dx, dy, color);
                        }, i * 30);
                    }
                }
            }, dragDelay);
        });
    }
    
    // Restore settings after animation completes (~2 minutes)
    const totalDuration = numCycles * 6 * dragInterval;
    setTimeout(() => {
        animationMultiplier = originalMultiplier;
        multiplierSlider.value = originalMultiplier;
        multiplierValue.textContent = originalMultiplier + 'x';
        config.SPLAT_RADIUS = originalBrush;
        portalBtn.style.background = 'rgba(255, 100, 255, 0.2)';
    }, totalDuration + 1000);
};

// Setup portal button
const portalBtn = document.getElementById('portalBtn');
portalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    playPortalAnimation();
});
portalBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    playPortalExpandAnimation();
});

window.playPortraitAnimation = () => {
    // Save original settings
    const originalBrushSize = config.SPLAT_RADIUS;
    const originalDensity = config.DENSITY_DISSIPATION;
    const originalVelocity = config.VELOCITY_DISSIPATION;
    const originalCurl = config.CURL;
    
    // Helper to animate slider changes
    function animateSettings(targetBrush, targetDensity, targetVelocity, targetCurl, duration) {
        const startBrush = config.SPLAT_RADIUS;
        const startDensity = config.DENSITY_DISSIPATION;
        const startVelocity = config.VELOCITY_DISSIPATION;
        const startCurl = config.CURL;
        const startTime = performance.now();
        
        return new Promise(resolve => {
            function animate(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                config.SPLAT_RADIUS = startBrush + (targetBrush - startBrush) * progress;
                config.DENSITY_DISSIPATION = startDensity + (targetDensity - startDensity) * progress;
                config.VELOCITY_DISSIPATION = startVelocity + (targetVelocity - startVelocity) * progress;
                config.CURL = startCurl + (targetCurl - startCurl) * progress;
                
                updateSliderValues();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(animate);
        });
    }
    
    // Helper to draw a curved line
    function drawCurve(startX, startY, controlX, controlY, endX, endY, steps, color) {
        return new Promise(resolve => {
            for (let i = 0; i <= steps; i++) {
                setTimeout(() => {
                    const t = i / steps;
                    const t2 = t * t;
                    const mt = 1 - t;
                    const mt2 = mt * mt;
                    
                    // Quadratic bezier curve
                    const x = mt2 * startX + 2 * mt * t * controlX + t2 * endX;
                    const y = mt2 * startY + 2 * mt * t * controlY + t2 * endY;
                    
                    // Calculate velocity from curve tangent
                    const dx = 2 * (mt * (controlX - startX) + t * (endX - controlX)) * 0.5;
                    const dy = 2 * (mt * (controlY - startY) + t * (endY - controlY)) * 0.5;
                    
                    splat(x, y, dx, dy, color);
                    
                    if (i === steps) resolve();
                }, i * 15);
            }
        });
    }
    
    // Convergence point - center-bottom with room at bottom
    const convergenceX = canvas.width * 0.5;
    const convergenceY = canvas.height * 0.75;
    
    // Execute the portrait sequence - all strokes converge to bottom center
    async function drawPortrait() {
        // 1. LEFT SHOULDER - Converges from left toward center bottom
        await animateSettings(0.010, 0.998, 0.95, 8, 200);
        const leftShoulderColor = [0.1, 0.3, 0.9]; // Bright blue
        await drawCurve(
            canvas.width * 0.15, canvas.height * 0.5,
            canvas.width * 0.3, canvas.height * 0.7,
            convergenceX - 40, convergenceY,
            35, leftShoulderColor
        );
        
        await new Promise(r => setTimeout(r, 150));
        
        // 2. RIGHT SHOULDER - Converges from right toward center bottom
        await animateSettings(0.010, 0.998, 0.95, 8, 200);
        const rightShoulderColor = [0.9, 0.5, 0.1]; // Bright orange
        await drawCurve(
            canvas.width * 0.85, canvas.height * 0.5,
            canvas.width * 0.7, canvas.height * 0.7,
            convergenceX + 40, convergenceY,
            35, rightShoulderColor
        );
        
        await new Promise(r => setTimeout(r, 150));
        
        // 3. HEAD - Converges from top toward center bottom
        await animateSettings(0.008, 0.998, 0.95, 5, 200);
        const headColor = [0.9, 0.2, 0.3]; // Bright red/pink
        await drawCurve(
            convergenceX, canvas.height * 0.2,
            convergenceX - 30, canvas.height * 0.5,
            convergenceX, convergenceY - 50,
            40, headColor
        );
        
        await new Promise(r => setTimeout(r, 150));
        
        // 4. LEFT EYE - Small stroke converging from upper left
        await animateSettings(0.004, 0.998, 0.95, 3, 150);
        const leftEyeColor = [0.1, 0.9, 0.3]; // Bright green
        await drawCurve(
            canvas.width * 0.35, canvas.height * 0.35,
            canvas.width * 0.4, canvas.height * 0.6,
            convergenceX - 20, convergenceY - 30,
            25, leftEyeColor
        );
        
        await new Promise(r => setTimeout(r, 120));
        
        // 5. RIGHT EYE - Small stroke converging from upper right
        await animateSettings(0.004, 0.998, 0.95, 3, 150);
        const rightEyeColor = [0.8, 0.1, 0.8]; // Bright purple
        await drawCurve(
            canvas.width * 0.65, canvas.height * 0.35,
            canvas.width * 0.6, canvas.height * 0.6,
            convergenceX + 20, convergenceY - 30,
            25, rightEyeColor
        );
        
        await new Promise(r => setTimeout(r, 200));
        
        // 6. LEFT CORNER SWOOP - Pull fluid up from bottom left to 3/4 height
        await animateSettings(0.006, 0.999, 0.88, 2, 200);
        const leftSwoopColor = [0.2, 0.8, 0.9]; // Bright cyan
        await drawCurve(
            canvas.width * 0.05, canvas.height * 0.95,
            canvas.width * 0.2, canvas.height * 0.85,
            convergenceX - 10, canvas.height * 0.25,
            45, leftSwoopColor
        );
        
        await new Promise(r => setTimeout(r, 100));
        
        // 7. RIGHT CORNER SWOOP - Pull fluid up from bottom right to 3/4 height
        await animateSettings(0.006, 0.999, 0.88, 2, 200);
        const rightSwoopColor = [0.9, 0.8, 0.2]; // Bright yellow
        await drawCurve(
            canvas.width * 0.95, canvas.height * 0.95,
            canvas.width * 0.8, canvas.height * 0.85,
            convergenceX + 10, canvas.height * 0.25,
            45, rightSwoopColor
        );
        
        await new Promise(r => setTimeout(r, 300));
        
        // 8. FINALE JELLYFISH - Slow upward pull from center to lift all colors
        // Very low curl, very high velocity sustain, slow and deliberate
        await animateSettings(0.005, 0.998, 0.995, 1, 250);
        
        // Random vibrant pure color (avoid white/gray)
        const colorChoice = Math.floor(Math.random() * 6);
        const finaleColors = [
            [0.9, 0.1, 0.2],  // Pure red
            [0.1, 0.9, 0.2],  // Pure green
            [0.1, 0.2, 0.9],  // Pure blue
            [0.9, 0.9, 0.1],  // Pure yellow
            [0.9, 0.1, 0.9],  // Pure magenta
            [0.1, 0.9, 0.9]   // Pure cyan
        ];
        const finaleColor = finaleColors[colorChoice];
        
        // Start lower - closer to bottom
        const finaleStartY = canvas.height * 0.85;
        
        // Single slow upward stroke with jellyfish-like pulses
        const finaleSteps = 60; // Very slow
        const pulses = 5;
        
        for (let pulse = 0; pulse < pulses; pulse++) {
            await new Promise(r => setTimeout(r, pulse * 300));
            
            for (let i = 0; i < finaleSteps / pulses; i++) {
                setTimeout(() => {
                    const progress = (pulse * (finaleSteps / pulses) + i) / finaleSteps;
                    const easing = 1 - Math.pow(1 - progress, 2);
                    
                    // Minimal spread, straight up
                    const spreadAmount = easing * 15;
                    const randomSpread = (Math.random() - 0.5) * spreadAmount;
                    const x = convergenceX + randomSpread;
                    const y = finaleStartY - (easing * 350);
                    
                    // Strong upward velocity
                    const dx = randomSpread * 0.05;
                    const dy = -8;
                    
                    splat(x, y, dx, dy, finaleColor);
                }, i * 50);
            }
        }
        
        // Restore original settings
        await new Promise(r => setTimeout(r, 2000));
        await animateSettings(originalBrushSize, originalDensity, originalVelocity, originalCurl, 300);
    }
    
    drawPortrait();
};

function wipeSimulation() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    density.swap();
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.read.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    velocity.swap();
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
}

window.clearCanvas = () => {
    wipeSimulation();
};

window.togglePause = () => {
    isPaused = !isPaused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = isPaused ? 'Resume' : 'Pause';
    btn.style.background = isPaused ? 'rgba(100, 200, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)';
};

window.captureLayer = () => {
    if (layers.length >= MAX_LAYERS) {
        alert('Maximum 10 layers reached. Delete some layers to create new ones.');
        return;
    }
    
    // Find first available slot
    let availableIndex = -1;
    for (let i = 0; i < MAX_LAYERS; i++) {
        if (!layers.find(l => l.index === i)) {
            availableIndex = i;
            break;
        }
    }
    
    if (availableIndex === -1) {
        alert('No available layer slots.');
        return;
    }
    
    const dataUrl = canvas.toDataURL('image/png');
    const layerDiv = document.getElementById(`layer${availableIndex}`);
    layerDiv.style.backgroundImage = `url(${dataUrl})`;
    layerDiv.style.zIndex = availableIndex;
    layerDiv.style.display = 'block';
    
    const layer = {
        index: availableIndex,
        title: `Layer ${layers.length + 1}`,
        data: dataUrl,
        originalData: dataUrl,
        visible: true,
        threshold: 0,
        active: false,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1
    };
    
    layers.push(layer);
    
    // Add new layer to layerOrder below the sim (furthest from viewer)
    // Find sim position and insert after it
    const simIndex = layerOrder.findIndex(item => item.type === 'sim');
    if (simIndex !== -1) {
        // Insert right after sim (below it in z-order)
        layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });
    } else {
        // If no sim found (shouldn't happen), add to bottom
        layerOrder.push({ type: 'layer', id: availableIndex });
    }
    
    renderLayers();
};

// Hover capture functionality
const captureBtn = document.getElementById('captureBtn');
const hoverCaptureToggle = document.getElementById('hoverCaptureToggle');
let hoverCaptureEnabled = false;

hoverCaptureToggle.addEventListener('change', (e) => {
    hoverCaptureEnabled = e.target.checked;
    
    if (hoverCaptureEnabled) {
        captureBtn.classList.add('hover-active');
        captureBtn.textContent = 'Hover Capture';
    } else {
        captureBtn.classList.remove('hover-active');
        captureBtn.textContent = 'Capture Layer';
    }
});

captureBtn.addEventListener('click', () => {
    if (!hoverCaptureEnabled) {
        captureLayer();
    }
});

captureBtn.addEventListener('mouseenter', () => {
    if (hoverCaptureEnabled) {
        captureLayer();
    }
});

// Image upload functionality
const uploadBtn = document.getElementById('uploadBtn');
const imageUpload = document.getElementById('imageUpload');

uploadBtn.addEventListener('click', () => {
    imageUpload.click();
});

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
        alert('Please upload a PNG or JPG image.');
        return;
    }
    
    if (layers.length >= MAX_LAYERS) {
        alert('Maximum 10 layers reached. Delete some layers to create new ones.');
        return;
    }
    
    // Find first available slot
    let availableIndex = -1;
    for (let i = 0; i < MAX_LAYERS; i++) {
        if (!layers.find(l => l.index === i)) {
            availableIndex = i;
            break;
        }
    }
    
    if (availableIndex === -1) {
        alert('No available layer slots.');
        return;
    }
    
    // Read the file and create layer
    const reader = new FileReader();
    reader.onload = (event) => {
        const dataUrl = event.target.result;
        const layerDiv = document.getElementById(`layer${availableIndex}`);
        layerDiv.style.backgroundImage = `url(${dataUrl})`;
        layerDiv.style.zIndex = availableIndex;
        layerDiv.style.display = 'block';
        
        const layer = {
            index: availableIndex,
            title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
            data: dataUrl,
            originalData: dataUrl,
            visible: true,
            threshold: 0,
            active: false,
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1
        };
        
        layers.push(layer);
        
        // Add new layer to layerOrder below the sim (furthest from viewer)
        const simIndex = layerOrder.findIndex(item => item.type === 'sim');
        if (simIndex !== -1) {
            layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });
        } else {
            layerOrder.push({ type: 'layer', id: availableIndex });
        }
        
        renderLayers();
    };
    
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be uploaded again if needed
    e.target.value = '';
});

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

class Program {
    constructor(vertSrc, fragSrc) {
        const vertShader = compileShader(gl.VERTEX_SHADER, vertSrc);
        const fragShader = compileShader(gl.FRAGMENT_SHADER, fragSrc);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertShader);
        gl.attachShader(this.program, fragShader);
        gl.linkProgram(this.program);
        
        this.uniforms = {};
        const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
    }
    
    bind() {
        gl.useProgram(this.program);
    }
}

const baseVert = `#version 300 es
    in vec2 aPos;
    out vec2 vUv, vL, vR, vT, vB;
    uniform vec2 texelSize;
    void main() {
        vUv = aPos * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPos, 0.0, 1.0);
    }
`;

const displayFrag = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uTexture;
    uniform float preserveOpacity;
    uniform float backgroundTransparency;
    void main() {
        vec4 color = texture(uTexture, vUv);
        float intensity = max(max(color.r, color.g), color.b);
        
        if (preserveOpacity > 0.5) {
            // Preserve fluid opacity - make alpha proportional to color intensity
            // backgroundTransparency controls how transparent the black areas become
            float alpha = mix(1.0, intensity, backgroundTransparency);
            fragColor = vec4(color.rgb, alpha);
        } else {
            fragColor = color;
        }
    }
`;

const splatFrag = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uTarget;
    uniform vec2 point;
    uniform vec3 color;
    uniform float radius, aspectRatio;
    void main() {
        vec2 p = vUv - point;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture(uTarget, vUv).xyz;
        fragColor = vec4(base + splat * 0.2, 1.0);
    }
`;

const advectionFrag = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uVelocity, uSource;
    uniform vec2 texelSize;
    uniform float dt, dissipation;
    uniform int isDensity;
    
    void main() {
        vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
        vec4 color = dissipation * texture(uSource, coord);
        
        if (isDensity == 1) {
            // Density pass: fade based on stillness
            // Sample velocity at this point to determine how still the fluid is
            vec2 vel = texture(uVelocity, vUv).xy;
            float speed = length(vel);
            
            // When fluid is still (low speed), fade alpha more aggressively
            float stillness = 1.0 - min(speed * 100.0, 1.0);
            float stillnessFade = stillness * 0.01 * dt * 60.0;
            
            // Apply stillness-based fade to alpha
            color.a = max(color.a - stillnessFade, 0.0);
            
            // Snap very small values to zero
            if (color.a < 0.003) {
                color = vec4(0.0);
            }
        } else {
            // Velocity pass: keep alpha at 1.0
            color.a = 1.0;
        }
        
        fragColor = color;
    }
`;

const divergenceFrag = `#version 300 es
    precision highp float;
    in vec2 vL, vR, vT, vB;
    out vec4 fragColor;
    uniform sampler2D uVelocity;
    vec2 sampleVelocity(vec2 uv) {
        vec2 m = vec2(1.0);
        if(uv.x < 0.0 || uv.x > 1.0) { uv.x = clamp(uv.x, 0.0, 1.0); m.x = -1.0; }
        if(uv.y < 0.0 || uv.y > 1.0) { uv.y = clamp(uv.y, 0.0, 1.0); m.y = -1.0; }
        return m * texture(uVelocity, uv).xy;
    }
    void main() {
        float div = 0.5 * (sampleVelocity(vR).x - sampleVelocity(vL).x + 
                           sampleVelocity(vT).y - sampleVelocity(vB).y);
        fragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`;

const curlFrag = `#version 300 es
    precision highp float;
    in vec2 vL, vR, vT, vB;
    out vec4 fragColor;
    uniform sampler2D uVelocity;
    void main() {
        fragColor = vec4(texture(uVelocity, vR).y - texture(uVelocity, vL).y - 
                         texture(uVelocity, vT).x + texture(uVelocity, vB).x, 0.0, 0.0, 1.0);
    }
`;

const vorticityFrag = `#version 300 es
    precision highp float;
    in vec2 vUv, vT, vB;
    out vec4 fragColor;
    uniform sampler2D uVelocity, uCurl;
    uniform float curl, dt;
    void main() {
        float T = texture(uCurl, vT).x;
        float B = texture(uCurl, vB).x;
        float C = texture(uCurl, vUv).x;
        vec2 force = vec2(abs(T) - abs(B), 0.0) * curl * C / (length(vec2(abs(T) - abs(B), 0.0)) + 0.00001);
        fragColor = vec4(texture(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
    }
`;

const pressureFrag = `#version 300 es
    precision highp float;
    in vec2 vUv, vL, vR, vT, vB;
    out vec4 fragColor;
    uniform sampler2D uPressure, uDivergence;
    void main() {
        vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
        vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
        float pressure = (texture(uPressure, L).x + texture(uPressure, R).x + 
                         texture(uPressure, B).x + texture(uPressure, T).x - 
                         texture(uDivergence, vUv).x) * 0.25;
        fragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`;

const gradientFrag = `#version 300 es
    precision highp float;
    in vec2 vUv, vL, vR, vT, vB;
    out vec4 fragColor;
    uniform sampler2D uPressure, uVelocity;
    void main() {
        vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
        vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
        vec2 vel = texture(uVelocity, vUv).xy - vec2(texture(uPressure, R).x - texture(uPressure, L).x,
                                                      texture(uPressure, T).x - texture(uPressure, B).x);
        fragColor = vec4(vel, 0.0, 1.0);
    }
`;

const clearFrag = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uTexture;
    uniform float value;
    void main() { fragColor = value * texture(uTexture, vUv); }
`;

const displayProg = new Program(baseVert, displayFrag);
const splatProg = new Program(baseVert, splatFrag);
const advectionProg = new Program(baseVert, advectionFrag);
const divergenceProg = new Program(baseVert, divergenceFrag);
const curlProg = new Program(baseVert, curlFrag);
const vorticityProg = new Program(baseVert, vorticityFrag);
const pressureProg = new Program(baseVert, pressureFrag);
const gradientProg = new Program(baseVert, gradientFrag);
const clearProg = new Program(baseVert, clearFrag);

let dyeTexWidth, dyeTexHeight, simTexWidth, simTexHeight;

function createFBO(w, h, internalFormat, format, type, filter) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    return { texture, fbo, width: w, height: h };
}

function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
    return {
        get read() { return fbo1; },
        get write() { return fbo2; },
        swap() { [fbo1, fbo2] = [fbo2, fbo1]; }
    };
}

let density, velocity, divergence, curl, pressure;

function initFramebuffers() {
    const displayW = gl.drawingBufferWidth;
    const displayH = gl.drawingBufferHeight;
    const aspect = displayW / Math.max(1, displayH);
    const dyeBase = config.DYE_RESOLUTION || 1024;
    const simBase = config.SIM_RESOLUTION || 128;
    // Compute absolute internal sizes: long side = base, short side scaled by aspect
    if (displayW >= displayH) {
        dyeTexWidth = dyeBase; dyeTexHeight = Math.max(1, Math.round(dyeBase / aspect));
        simTexWidth = simBase; simTexHeight = Math.max(1, Math.round(simBase / aspect));
    } else {
        dyeTexHeight = dyeBase; dyeTexWidth = Math.max(1, Math.round(dyeBase * aspect));
        simTexHeight = simBase; simTexWidth = Math.max(1, Math.round(simBase * aspect));
    }
    
    const texType = gl.HALF_FLOAT;
    const rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA };
    const rg = { internalFormat: gl.RG16F, format: gl.RG };
    const r = { internalFormat: gl.R16F, format: gl.RED };
    const filter = linearExt ? gl.LINEAR : gl.NEAREST;
    
    // Visual dye buffers at dye resolution
    density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
    // Physics buffers at simulation resolution
    velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, filter);
    divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
}

initFramebuffers();

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(0);

function blit(dest) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

let pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false, color: [1, 0, 0] };

canvas.addEventListener('mousedown', (e) => {
    if (isPaused) return;
    
    if (e.button === 2) {
        e.preventDefault();
        isRightMouseDown = true;
        isReplayActive = true;
        replayMovements();
        return;
    }
    
    const coords = getCanvasCoordinates(e);
    pointer.down = true;
    pointer.moved = false;
    pointer.x = coords.x;
    pointer.y = coords.y;
    pointer.dx = 0;
    pointer.dy = 0;
    updateColor();
    if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
});

canvas.addEventListener('mousemove', (e) => {
    if (isPaused || isReplayActive) return;
    const coords = getCanvasCoordinates(e);
    pointer.moved = pointer.down;
    pointer.dx = (coords.x - pointer.x) * 10.0;
    pointer.dy = (coords.y - pointer.y) * 10.0;
    pointer.x = coords.x;
    pointer.y = coords.y;
    
    if (pointer.down) {
        trackMouseMovement(e);
        if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        isRightMouseDown = false;
        isReplayActive = false;
        customCursor.style.opacity = '0';
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    } else if (e.button === 0) {
        pointer.down = false;
        pointer.moved = false;
        setTimeout(() => {
            trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        }, FADE_END);
    }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isPaused) return;
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch);
    pointer.down = true;
    pointer.moved = false;
    pointer.x = coords.x;
    pointer.y = coords.y;
    pointer.dx = 0;
    pointer.dy = 0;
    updateColor();
    if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isPaused) return;
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch);
    pointer.moved = pointer.down;
    pointer.dx = (coords.x - pointer.x) * 10.0;
    pointer.dy = (coords.y - pointer.y) * 10.0;
    pointer.x = coords.x;
    pointer.y = coords.y;
    if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
});

canvas.addEventListener('touchend', () => {
    pointer.down = false;
    pointer.moved = false;
});

// Background color picker
const backgroundColorPicker = document.getElementById('backgroundColorPicker');

if (backgroundColorPicker) {
    backgroundColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        canvasArea.style.backgroundColor = color;
        document.body.style.backgroundColor = color;
    });
}

// Canvas opacity slider (for layer visibility)
const canvasOpacitySlider = document.getElementById('canvasOpacity');
const opacityValueDisplay = document.getElementById('opacityValue');

if (canvasOpacitySlider) {
    canvasOpacitySlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const opacity = value / 100;
        canvas.style.opacity = opacity;
        opacityValueDisplay.textContent = `${value}%`;
    });
}

// Preserve fluid opacity checkbox
window.preserveFluidOpacity = false;
const preserveFluidOpacityCheckbox = document.getElementById('preserveFluidOpacity');

if (preserveFluidOpacityCheckbox) {
    preserveFluidOpacityCheckbox.addEventListener('change', (e) => {
        window.preserveFluidOpacity = e.target.checked;
    });
}

// Capture dimming slider (controls background transparency)
window.backgroundTransparency = 0.8; // Default 80%
const captureDimmingSlider = document.getElementById('captureDimming');
const dimmingValueDisplay = document.getElementById('dimmingValue');

if (captureDimmingSlider) {
    captureDimmingSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        window.backgroundTransparency = value / 100; // Convert to 0-1 range
        dimmingValueDisplay.textContent = `${value}%`;
    });
}

// Multiplier slider
const multiplierSlider = document.getElementById('multiplier');
const multiplierValue = document.getElementById('multiplierValue');

if (multiplierSlider) {
    multiplierSlider.addEventListener('input', (e) => {
        animationMultiplier = parseInt(e.target.value);
        multiplierValue.textContent = animationMultiplier + 'x';
    });
}

// Helper function to create rotated instances of a splat
function multiSplat(x, y, dx, dy, color) {
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    
    for (let i = 0; i < animationMultiplier; i++) {
        const angle = (i / animationMultiplier) * Math.PI * 2;
        
        // Translate to center, rotate, translate back
        const relX = x - centerX;
        const relY = y - centerY;
        
        const rotatedX = relX * Math.cos(angle) - relY * Math.sin(angle);
        const rotatedY = relX * Math.sin(angle) + relY * Math.cos(angle);
        
        const finalX = rotatedX + centerX;
        const finalY = rotatedY + centerY;
        
        // Rotate velocity vector too
        const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
        const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);
        
        splat(finalX, finalY, rotatedDx, rotatedDy, color);
    }
}

const trailToggle = document.getElementById('trailToggle');
const cursorToggle = document.getElementById('cursorToggle');

trailToggle.addEventListener('change', (e) => {
    showTrail = e.target.checked;
    if (!showTrail) {
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
});

cursorToggle.addEventListener('change', (e) => {
    showCursor = e.target.checked;
    if (!showCursor && !isReplayActive) {
        customCursor.style.opacity = '0';
    }
    
    // Toggle cursor visibility on non-UI elements
    const nonUIElements = [
        document.getElementById('canvas-area'),
        document.getElementById('canvas-wrapper'),
        document.getElementById('canvas'),
        document.getElementById('trailCanvas'),
        document.getElementById('canvas-size-display'),
        document.getElementById('layers-container'),
        ...document.querySelectorAll('.background-layer'),
        ...document.querySelectorAll('.resize-handle'),
        ...document.querySelectorAll('.corner-lock'),
        ...document.querySelectorAll('.layer-resize-handle')
    ];
    
    nonUIElements.forEach(element => {
        if (element) {
            if (showCursor) {
                element.classList.remove('hide-cursor');
            } else {
                element.classList.add('hide-cursor');
            }
        }
    });
});

// Initialize cursor state on page load
cursorToggle.dispatchEvent(new Event('change'));

colorStorage.load();
initPaletteUI();
preseedPaletteOnLoad();
const colorPickerEl = document.getElementById('colorPicker');
if (colorPickerEl) {
    colorPickerEl.addEventListener('input', () => {
        const rnd = document.getElementById('randomColor');
        if (rnd) rnd.checked = false;
        const stepEl = document.getElementById('stepPalette');
        if (stepEl) stepEl.checked = false;
        updateColor();
        updatePaletteStepIndicator();
    });
}
const randomColorCheckboxEl = document.getElementById('randomColor');
if (randomColorCheckboxEl) {
    randomColorCheckboxEl.addEventListener('change', (e) => {
        if (e.target.checked) {
            const stepEl = document.getElementById('stepPalette');
            if (stepEl) stepEl.checked = false;
        }
        updatePaletteStepIndicator();
    });
}
const stepPaletteCheckboxEl = document.getElementById('stepPalette');
if (stepPaletteCheckboxEl) {
    stepPaletteCheckboxEl.addEventListener('change', (e) => {
        if (e.target.checked) {
            const rnd = document.getElementById('randomColor');
            if (rnd) rnd.checked = false;
        }
        updatePaletteStepIndicator();
    });
}

function updateColor() {
    const stepEl = document.getElementById('stepPalette');
    const rndEl = document.getElementById('randomColor');
    if (stepEl && stepEl.checked) {
        const list = getStepColorList();
        if (list.length > 0) {
            const hex = list[paletteStepIndex % list.length];
            paletteStepIndex = (paletteStepIndex + 1) % list.length;
            const cp = document.getElementById('colorPicker');
            if (cp) cp.value = hex;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            pointer.color = [r, g, b];
            updatePaletteStepIndicator();
            return;
        }
    }
    if (rndEl && rndEl.checked) {
        pointer.color = [Math.random(), Math.random(), Math.random()];
        return;
    }
    const hex = document.getElementById('colorPicker').value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    pointer.color = [r, g, b];
}

const sliderConfig = {
    densityDissipation: { key: 'DENSITY_DISSIPATION', decimals: 4 },
    velocityDissipation: { key: 'VELOCITY_DISSIPATION', decimals: 4 },
    pressureDissipation: { key: 'PRESSURE_DISSIPATION', decimals: 3 },
    pressureIteration: { key: 'PRESSURE_ITERATIONS', decimals: 0 },
    curl: { key: 'CURL', decimals: 0 }
};

document.getElementById('brushSize').addEventListener('input', (e) => {
    config.SPLAT_RADIUS = e.target.value / 1000;
});

// Resolution dropdowns (absolute resolution, independent of display canvas size)
const visualResSel = document.getElementById('visualResolution');
if (visualResSel) {
    visualResSel.value = String(config.DYE_RESOLUTION);
    visualResSel.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        if (isFinite(v)) {
            config.DYE_RESOLUTION = v;
            window.needsFramebufferReinit = true;
        }
    });
}
const physicsResSel = document.getElementById('physicsResolution');
if (physicsResSel) {
    physicsResSel.value = String(config.SIM_RESOLUTION);
    physicsResSel.addEventListener('change', (e) => {
        const v = parseInt(e.target.value, 10);
        if (isFinite(v)) {
            config.SIM_RESOLUTION = v;
            window.needsFramebufferReinit = true;
        }
    });
}

// Scrollwheel to adjust brush size or density (with Shift) on canvas area
let lastDensitySnapTime = 0;

canvasArea.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    if (e.shiftKey) {
        // Shift+Scroll: Adjust density
        const densitySlider = document.getElementById('densityDissipation');
        const densityValueSpan = document.getElementById('densityValue');
        let currentValue = parseFloat(densitySlider.value);
        const minValue = parseFloat(densitySlider.min);
        const maxValue = parseFloat(densitySlider.max);
        const stepSize = 0.002; // Small increment for fine control
        
        // Magnetic snap parameters
        const snapTarget = 1.0;
        const snapRange = 0.003; // Range to trigger snap
        const snapCooldown = 300; // ms before snap can trigger again
        
        let newValue;
        if (e.deltaY < 0) {
            // Scrolling up - increase density
            newValue = currentValue + stepSize;
            if (newValue > maxValue) newValue = maxValue;
        } else {
            // Scrolling down - decrease density
            newValue = currentValue - stepSize;
            if (newValue < minValue) newValue = minValue;
        }
        
        // Apply momentary magnetic snap to 1.0
        const now = Date.now();
        const timeSinceLastSnap = now - lastDensitySnapTime;
        
        // Only snap if we're crossing through 1.0 and cooldown has passed
        if (timeSinceLastSnap > snapCooldown && Math.abs(newValue - snapTarget) < snapRange) {
            newValue = snapTarget;
            lastDensitySnapTime = now;
        }
        
        // Update slider and config
        densitySlider.value = newValue;
        config.DENSITY_DISSIPATION = newValue;
        densityValueSpan.textContent = newValue.toFixed(4);
        
        // Auto-wipe simulation when density sustain gets very low
        if (newValue < 0.88) {
            wipeSimulation();
        }
    } else {
        // Normal scroll: Adjust brush size
        const brushSizeSlider = document.getElementById('brushSize');
        const currentValue = parseFloat(brushSizeSlider.value);
        const minValue = parseFloat(brushSizeSlider.min);
        const maxValue = parseFloat(brushSizeSlider.max);
        const stepSize = 0.5;
        
        let newValue;
        if (e.deltaY < 0) {
            // Scrolling up - increase brush size
            newValue = currentValue + stepSize;
            if (newValue > maxValue) newValue = maxValue;
        } else {
            // Scrolling down - decrease brush size
            newValue = currentValue - stepSize;
            if (newValue < minValue) newValue = minValue;
        }
        
        brushSizeSlider.value = newValue;
        config.SPLAT_RADIUS = newValue / 1000;
    }
}, { passive: false });

// Magnetic snap state for density slider
let densitySnapTimeout = null;
let densityLastValue = null;
let densityIsSnapped = false;

Object.entries(sliderConfig).forEach(([id, cfg]) => {
    const slider = document.getElementById(id);
    const valueSpan = document.getElementById(id.replace('Dissipation', '').replace('Iteration', '') + 'Value');
    
    slider.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        
        // Magnetic snap to 1.0 for density slider
        if (id === 'densityDissipation') {
            const snapTarget = 1.0;
            const snapRange = 0.003; // How close you need to be to snap
            const pushThrough = 0.008; // How far you need to push to break free
            
            // Clear any pending snap timeout
            if (densitySnapTimeout) {
                clearTimeout(densitySnapTimeout);
                densitySnapTimeout = null;
            }
            
            // Check if we're in the snap zone
            if (Math.abs(val - snapTarget) < snapRange && !densityIsSnapped) {
                // Snap to 1.0
                val = snapTarget;
                slider.value = snapTarget;
                densityIsSnapped = true;
                
                // Set a timeout to allow breaking free
                densitySnapTimeout = setTimeout(() => {
                    densityIsSnapped = false;
                }, 300); // 300ms to push through
            } else if (densityIsSnapped && Math.abs(val - snapTarget) > pushThrough) {
                // User pushed through the snap
                densityIsSnapped = false;
            } else if (densityIsSnapped && densityLastValue !== null) {
                // While snapped, resist small movements
                if (Math.abs(val - snapTarget) < pushThrough) {
                    val = snapTarget;
                    slider.value = snapTarget;
                }
            }
            
            densityLastValue = val;
        }
        
        config[cfg.key] = cfg.decimals === 0 ? parseInt(val) : val;
        valueSpan.textContent = cfg.decimals === 0 ? val : val.toFixed(cfg.decimals);
        
        // Auto-wipe simulation when density sustain gets very low
        if (id === 'densityDissipation' && val < 0.88) {
            wipeSimulation();
        }
    });
    
    // Reset snap state when user releases the slider
    if (id === 'densityDissipation') {
        slider.addEventListener('mouseup', () => {
            if (densitySnapTimeout) {
                clearTimeout(densitySnapTimeout);
                densitySnapTimeout = null;
            }
            densityIsSnapped = false;
            densityLastValue = null;
        });
        
        slider.addEventListener('touchend', () => {
            if (densitySnapTimeout) {
                clearTimeout(densitySnapTimeout);
                densitySnapTimeout = null;
            }
            densityIsSnapped = false;
            densityLastValue = null;
        });
    }
});

function updateSliderValues() {
    Object.entries(sliderConfig).forEach(([id, cfg]) => {
        const val = config[cfg.key];
        document.getElementById(id).value = val;
        document.getElementById(id.replace('Dissipation', '').replace('Iteration', '') + 'Value').textContent = 
            cfg.decimals === 0 ? Math.round(val) : val.toFixed(cfg.decimals);
    });
    document.getElementById('brushSize').value = config.SPLAT_RADIUS * 1000;
}

function splat(x, y, dx, dy, color) {
    const aspectRatio = canvas.width / canvas.height;
    
    splatProg.bind();
    gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
    gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS);
    // Write velocity at physics resolution
    gl.viewport(0, 0, simTexWidth, simTexHeight);
    
    gl.uniform1i(splatProg.uniforms.uTarget, 0);
    gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
    blit(velocity.write.fbo);
    velocity.swap();
    
    // Write density at dye resolution
    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
    gl.uniform1i(splatProg.uniforms.uTarget, 0);
    gl.uniform3fv(splatProg.uniforms.color, color);
    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
    blit(density.write.fbo);
    density.swap();
}

let lastTime = Date.now();

function update() {
    const dt = Math.min((Date.now() - lastTime) / 1000, 0.016);
    lastTime = Date.now();
    
    const targetWidth = canvasWrapper.clientWidth;
    const targetHeight = canvasWrapper.clientHeight;
    
    if (canvas.width !== targetWidth || canvas.height !== targetHeight || window.needsFramebufferReinit) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        trailCanvas.width = targetWidth;
        trailCanvas.height = targetHeight;
        initFramebuffers();
        window.needsFramebufferReinit = false;
    }
    
    if (!isPaused) {
        
        if (pointer.moved) {
            multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
            pointer.moved = false;
        }
        
        if (recEnabled) {
            recUpdatePlayback();
        }
        
        advectionProg.bind();
        // Velocity advection at physics resolution
        gl.viewport(0, 0, simTexWidth, simTexHeight);
        gl.uniform2f(advectionProg.uniforms.texelSize, 22.0 / simTexWidth, 22.0 / simTexHeight);
        gl.uniform1f(advectionProg.uniforms.dt, dt);
        
        // Velocity pass
        gl.uniform1i(advectionProg.uniforms.isDensity, 0);
        gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
        gl.uniform1i(advectionProg.uniforms.uSource, 0);
        gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(velocity.write.fbo);
        velocity.swap();
        
        // Density pass (advected by velocity field at sim resolution)
        gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
        gl.uniform2f(advectionProg.uniforms.texelSize, 22.0 / simTexWidth, 22.0 / simTexHeight);
        gl.uniform1i(advectionProg.uniforms.isDensity, 1);
        gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
        gl.uniform1i(advectionProg.uniforms.uSource, 1);
        gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        blit(density.write.fbo);
        density.swap();
        
        curlProg.bind();
        gl.viewport(0, 0, simTexWidth, simTexHeight);
        gl.uniform2f(curlProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(curlProg.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(curl.fbo);
        
        vorticityProg.bind();
        gl.uniform2f(vorticityProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(vorticityProg.uniforms.uVelocity, 0);
        gl.uniform1i(vorticityProg.uniforms.uCurl, 1);
        gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
        gl.uniform1f(vorticityProg.uniforms.dt, dt);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, curl.texture);
        blit(velocity.write.fbo);
        velocity.swap();
        
        divergenceProg.bind();
        gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(divergence.fbo);
        
        clearProg.bind();
        gl.uniform1i(clearProg.uniforms.uTexture, 0);
        gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        blit(pressure.write.fbo);
        pressure.swap();
        
        pressureProg.bind();
        gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
        
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressureProg.uniforms.uPressure, 1);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
            blit(pressure.write.fbo);
            pressure.swap();
        }
        
        gradientProg.bind();
        gl.uniform2f(gradientProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
        gl.uniform1i(gradientProg.uniforms.uPressure, 0);
        gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(velocity.write.fbo);
        velocity.swap();
    }
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    displayProg.bind();
    gl.uniform1i(displayProg.uniforms.uTexture, 0);
    gl.uniform1f(displayProg.uniforms.preserveOpacity, window.preserveFluidOpacity ? 1.0 : 0.0);
    gl.uniform1f(displayProg.uniforms.backgroundTransparency, window.backgroundTransparency || 0.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
    blit(null);
    
    requestAnimationFrame(update);
}

function renderLayers() {
    const panel = document.getElementById('layersPanel');
    panel.innerHTML = '';
    
    // layerOrder is in visual order: index 0 = top (closest to viewer), last = bottom (furthest)
    // We'll assign z-indices in reverse: top items get highest z-index
    
    // Add top drop zone
    const topZone = document.createElement('div');
    topZone.className = 'drop-zone';
    topZone.dataset.dropPosition = 'top';
    topZone.textContent = '↑ Drop here for top (closest to viewer)';
    topZone.addEventListener('dragover', handleDropZoneDragOver);
    topZone.addEventListener('drop', handleDropZoneDrop);
    topZone.addEventListener('dragleave', handleDragLeave);
    panel.appendChild(topZone);
    
    // Render all items in layerOrder
    layerOrder.forEach((item, idx) => {
        const element = document.createElement('div');
        element.className = 'layer-item';
        element.draggable = true;
        element.dataset.orderIndex = idx; // Store position in order array
        
        if (item.type === 'sim') {
            element.dataset.layerType = 'sim';
            element.innerHTML = `
                <div class="layer-item-header">
                    <div class="layer-thumbnail" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        🌊
                    </div>
                    <div class="layer-info">
                        <input type="text" class="layer-title" value="Sim Layer" readonly style="cursor: default;">
                    </div>
                    <div class="layer-controls">
                        <button class="layer-btn" onclick="toggleSimLayer()">
                            ${canvas.style.display !== 'none' ? '👁️' : '👁️‍🗨️'}
                        </button>
                    </div>
                </div>
            `;
        } else {
            const layer = layers.find(l => l.index === item.id);
            if (!layer) return; // Skip if layer not found
            
            element.dataset.layerIndex = layer.index;
            if (layer.active) {
                element.classList.add('active-layer');
            }
            
            element.innerHTML = `
                <div class="layer-item-header">
                    <div class="layer-thumbnail" style="background-image: url(${layer.data})"></div>
                    <div class="layer-info">
                        <input type="text" class="layer-title" value="${layer.title}" 
                               onchange="updateLayerTitle(${layer.index}, this.value)">
                    </div>
                    <div class="layer-controls">
                        <button class="layer-btn" onclick="toggleActiveLayer(${layer.index})" title="${layer.active ? 'Deactivate positioning' : 'Activate positioning'}">
                            ${layer.active ? '🎯' : '⭕'}
                        </button>
                        <button class="layer-btn" onclick="toggleLayer(${layer.index})">
                            ${layer.visible ? '👁️' : '👁️‍🗨️'}
                        </button>
                        <button class="layer-btn" onclick="deleteLayer(${layer.index})">🗑️</button>
                    </div>
                </div>
                <div class="layer-threshold">
                    <span>Mask:</span>
                    <input type="range" min="0" max="100" value="${layer.threshold}" 
                           oninput="updateLayerThreshold(${layer.index}, this.value); this.nextElementSibling.textContent = this.value + '%'">
                    <span>${layer.threshold}%</span>
                </div>
            `;
        }
        
        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('dragover', handleDragOver);
        element.addEventListener('drop', handleDrop);
        element.addEventListener('dragend', handleDragEnd);
        element.addEventListener('dragleave', handleDragLeave);
        
        panel.appendChild(element);
    });
    
    // Add bottom drop zone
    const bottomZone = document.createElement('div');
    bottomZone.className = 'drop-zone';
    bottomZone.dataset.dropPosition = 'bottom';
    bottomZone.textContent = '↓ Drop here for bottom (furthest from viewer)';
    bottomZone.addEventListener('dragover', handleDropZoneDragOver);
    bottomZone.addEventListener('drop', handleDropZoneDrop);
    bottomZone.addEventListener('dragleave', handleDragLeave);
    panel.appendChild(bottomZone);
    
    updateLayerZIndices();
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.layer-item');
    if (target && target !== draggedElement) {
        target.classList.add('drag-over');
    }
    return false;
}

function handleDragLeave(e) {
    const target = e.target.closest('.layer-item');
    if (target) target.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    e.preventDefault();
    
    const target = e.target.closest('.layer-item');
    if (!target || !draggedElement || draggedElement === target) {
        if (target) target.classList.remove('drag-over');
        return false;
    }
    
    const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
    const targetOrderIndex = parseInt(target.dataset.orderIndex);
    
    // Simple reordering: remove from old position, insert at target position
    const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
    layerOrder.splice(targetOrderIndex, 0, draggedItem);
    
    console.log('Reordered layers:', layerOrder);
    
    renderLayers();
    target.classList.remove('drag-over');
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.layer-item, .drop-zone').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDropZoneDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
    return false;
}

function handleDropZoneDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    e.preventDefault();
    
    const dropPosition = this.dataset.dropPosition;
    const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
    
    // Remove from current position
    const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
    
    if (dropPosition === 'top') {
        // Add to beginning (top = closest to viewer = highest z-index)
        layerOrder.unshift(draggedItem);
        console.log('Moved to top:', draggedItem);
    } else if (dropPosition === 'bottom') {
        // Add to end (bottom = furthest from viewer = lowest z-index)
        layerOrder.push(draggedItem);
        console.log('Moved to bottom:', draggedItem);
    }
    
    renderLayers();
    this.classList.remove('drag-over');
    return false;
}

function updateLayerZIndices() {
    // layerOrder[0] = top (closest to viewer) = highest z-index
    // layerOrder[last] = bottom (furthest from viewer) = lowest z-index
    // We assign z-indices in reverse order of the array
    
    const BASE_Z_INDEX = 1000;
    
    layerOrder.forEach((item, visualIndex) => {
        // Higher visual index = lower in list = further from viewer = lower z-index
        const zIndex = BASE_Z_INDEX - visualIndex;
        
        if (item.type === 'sim') {
            canvas.style.zIndex = zIndex;
            trailCanvas.style.zIndex = zIndex;
            console.log(`Sim at visual position ${visualIndex}: z-index ${zIndex}`);
        } else {
            const layer = layers.find(l => l.index === item.id);
            if (layer) {
                const layerDiv = document.getElementById(`layer${layer.index}`);
                if (layerDiv) {
                    layerDiv.style.zIndex = zIndex;
                    layerDiv.style.display = layer.visible ? 'block' : 'none';
                    layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) scale(${layer.scaleX}, ${layer.scaleY})`;
                    
                    // Apply active class
                    if (layer.active) {
                        layerDiv.classList.add('active');
                    } else {
                        layerDiv.classList.remove('active');
                    }
                    
                    console.log(`Layer ${layer.index} at visual position ${visualIndex}: z-index ${zIndex}`);
                }
            }
        }
    });
}

window.toggleSimLayer = () => {
    const isVisible = canvas.style.display !== 'none';
    canvas.style.display = isVisible ? 'none' : 'block';
    trailCanvas.style.display = isVisible ? 'none' : 'block';
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
    
    // Remove from layerOrder array
    layerOrder = layerOrder.filter(item => !(item.type === 'layer' && item.id === index));
    
    // Re-render and update z-indices
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
    } else {
        layerDiv.classList.remove('active');
        activeLayerIndex = null;
        removeLayerResizeHandles(index);
    }
    
    renderLayers();
};

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
        div.addEventListener('mousedown', handleLayerResizeStart);
        layerDiv.appendChild(div);
    });
}

function removeLayerResizeHandles(index) {
    const layerDiv = document.getElementById(`layer${index}`);
    if (!layerDiv) return;
    
    const handles = layerDiv.querySelectorAll('.layer-resize-handle');
    handles.forEach(handle => handle.remove());
}

// Layer resize functionality
let isResizingLayer = false;
let layerResizeDirection = null;
let resizeLayerIndex = null;
let layerResizeStartX = 0;
let layerResizeStartY = 0;
let layerResizeStartScaleX = 1;
let layerResizeStartScaleY = 1;
let layerResizeStartPosX = 0;
let layerResizeStartPosY = 0;

function handleLayerResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    
    isResizingLayer = true;
    layerResizeDirection = e.target.dataset.direction;
    resizeLayerIndex = parseInt(e.target.dataset.layerIndex);
    
    const layer = layers.find(l => l.index === resizeLayerIndex);
    if (!layer) return;
    
    layerResizeStartX = e.clientX;
    layerResizeStartY = e.clientY;
    layerResizeStartScaleX = layer.scaleX;
    layerResizeStartScaleY = layer.scaleY;
    layerResizeStartPosX = layer.x;
    layerResizeStartPosY = layer.y;
}

// Add mouse event listeners to canvas wrapper for layer dragging
canvasWrapper.addEventListener('mousedown', (e) => {
    if (activeLayerIndex === null) return;
    
    // Don't start dragging if clicking on a resize handle 
    if (e.target.classList.contains('layer-resize-handle')) return;
    
    const layer = layers.find(l => l.index === activeLayerIndex);
    if (!layer || !layer.active) return;
    
    // Check if clicking on the active layer
    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
    if (!layerDiv) return;
    
    isDraggingLayer = true;
    layerDragStartX = e.clientX;
    layerDragStartY = e.clientY;
    layerStartX = layer.x;
    layerStartY = layer.y;
    
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    // Handle layer resizing
    if (isResizingLayer && resizeLayerIndex !== null) {
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
                layer.x = layerResizeStartPosX + deltaX;
                break;
            case 'ne': // Top-right
                layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                layer.y = layerResizeStartPosY + deltaY;
                break;
            case 'nw': // Top-left
                layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                layer.x = layerResizeStartPosX + deltaX;
                layer.y = layerResizeStartPosY + deltaY;
                break;
            case 'e': // Right edge
                layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                break;
            case 'w': // Left edge
                layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                layer.x = layerResizeStartPosX + deltaX;
                break;
            case 's': // Bottom edge
                layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                break;
            case 'n': // Top edge
                layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                layer.y = layerResizeStartPosY + deltaY;
                break;
        }
        
        updateLayerPosition(resizeLayerIndex);
        return;
    }
    
    // Handle layer dragging
    if (!isDraggingLayer || activeLayerIndex === null) return;
    
    const layer = layers.find(l => l.index === activeLayerIndex);
    if (!layer) return;
    
    const deltaX = e.clientX - layerDragStartX;
    const deltaY = e.clientY - layerDragStartY;
    
    layer.x = layerStartX + deltaX;
    layer.y = layerStartY + deltaY;
    
    updateLayerPosition(activeLayerIndex);
});

document.addEventListener('mouseup', () => {
    if (isDraggingLayer) {
        isDraggingLayer = false;
    }
    if (isResizingLayer) {
        isResizingLayer = false;
        layerResizeDirection = null;
        resizeLayerIndex = null;
    }
});

function updateLayerPosition(index) {
    const layer = layers.find(l => l.index === index);
    if (!layer) return;
    
    const layerDiv = document.getElementById(`layer${index}`);
    if (!layerDiv) return;
    
    layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) scale(${layer.scaleX}, ${layer.scaleY})`;
}

window.updateLayerTitle = (index, title) => {
    const layer = layers.find(l => l.index === index);
    if (layer) layer.title = title;
};

window.updateLayerThreshold = (index, threshold) => {
    const layer = layers.find(l => l.index === index);
    if (!layer) return;
    
    layer.threshold = parseInt(threshold);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        const thresholdValue = (threshold / 100) * 255;
        const featherRange = 50;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
            const originalAlpha = data[i + 3];
            
            if (brightness <= thresholdValue - featherRange) {
                data[i + 3] = 0;
            } else if (brightness >= thresholdValue) {
                data[i + 3] = originalAlpha;
            } else {
                const distance = brightness - (thresholdValue - featherRange);
                const fadePercent = distance / featherRange;
                data[i + 3] = Math.floor(originalAlpha * fadePercent);
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        const processedData = tempCanvas.toDataURL('image/png');
        
        layer.data = processedData;
        
        const layerDiv = document.getElementById(`layer${index}`);
        if (layerDiv) {
            layerDiv.style.backgroundImage = `url(${processedData})`;
        }
    };
    
    img.src = layer.originalData;
};

// Hotkeys modal + Undo/Redo implementation
const hotkeyOverlay = document.getElementById('hotkeyOverlay');
const hotkeyClose = document.getElementById('hotkeyClose');
function showHotkeys() { if (hotkeyOverlay) hotkeyOverlay.style.display = 'flex'; }
function hideHotkeys() { if (hotkeyOverlay) hotkeyOverlay.style.display = 'none'; }
function toggleHotkeys() { if (!hotkeyOverlay) return; hotkeyOverlay.style.display = (hotkeyOverlay.style.display === 'flex' ? 'none' : 'flex'); }
if (hotkeyClose) hotkeyClose.addEventListener('click', hideHotkeys);
if (hotkeyOverlay) hotkeyOverlay.addEventListener('click', (e) => { if (e.target === hotkeyOverlay) hideHotkeys(); });

let undoStack = [];
let redoStack = [];
let applyingState = false;

function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function getWrapperRectState() {
    const areaRect = canvasArea.getBoundingClientRect();
    const rect = canvasWrapper.getBoundingClientRect();
    return {
        left: rect.left - areaRect.left,
        top: rect.top - areaRect.top,
        width: rect.width,
        height: rect.height
    };
}
function setWrapperRectState(w) {
    if (!w) return;
    canvasWrapper.style.left = w.left + 'px';
    canvasWrapper.style.top = w.top + 'px';
    canvasWrapper.style.width = w.width + 'px';
    canvasWrapper.style.height = w.height + 'px';
    updateCanvasSize();
}

function getState() {
    const rect = getWrapperRectState();
    return {
        paletteIndex: (document.getElementById('paletteSelector')?.value) ? parseInt(document.getElementById('paletteSelector').value, 10) : 0,
        savedColors: Array.isArray(savedColors) ? savedColors.slice() : [],
        randomOn: !!document.getElementById('randomColor')?.checked,
        stepOn: !!document.getElementById('stepPalette')?.checked,
        colorPickerValue: document.getElementById('colorPicker')?.value || '#ffffff',
        brushSize: parseFloat(document.getElementById('brushSize')?.value || '11'),
        visualRes: parseInt(document.getElementById('visualResolution')?.value || String(config.DYE_RESOLUTION), 10),
        physicsRes: parseInt(document.getElementById('physicsResolution')?.value || String(config.SIM_RESOLUTION), 10),
        showTrail: !!document.getElementById('trailToggle')?.checked,
        showCursor: !!document.getElementById('cursorToggle')?.checked,
        showCanvasHandles: !!document.getElementById('showCanvasHandles')?.checked,
        lockCanvasBorders: !!document.getElementById('lockCanvasBorders')?.checked,
        wrapper: rect
    };
}

function applyState(s) {
    if (!s) return;
    applyingState = true;
    try {
        // Checkboxes and selectors
        const stepEl = document.getElementById('stepPalette');
        const rndEl = document.getElementById('randomColor');
        const trailEl = document.getElementById('trailToggle');
        const cursorEl = document.getElementById('cursorToggle');
        const handlesEl = document.getElementById('showCanvasHandles');
        const lockEl = document.getElementById('lockCanvasBorders');
        const visualSel = document.getElementById('visualResolution');
        const physSel = document.getElementById('physicsResolution');
        const paletteSel = document.getElementById('paletteSelector');
        const cp = document.getElementById('colorPicker');
        
        if (paletteSel && typeof applyPalette === 'function') {
            applyPalette(String(s.paletteIndex));
        }
        if (Array.isArray(s.savedColors) && typeof colorStorage?.save === 'function') {
            colorStorage.save(s.savedColors.slice());
        }
        
        if (rndEl) { rndEl.checked = !!s.randomOn; rndEl.dispatchEvent(new Event('change')); }
        if (stepEl) { stepEl.checked = !!s.stepOn; stepEl.dispatchEvent(new Event('change')); }
        
        if (cp) { cp.value = s.colorPickerValue || cp.value; }
        if (typeof updateColor === 'function') updateColor();
        
        const brushEl = document.getElementById('brushSize');
        if (brushEl) { brushEl.value = String(s.brushSize); config.SPLAT_RADIUS = s.brushSize / 1000; }
        
        if (visualSel) { visualSel.value = String(s.visualRes); visualSel.dispatchEvent(new Event('change')); }
        if (physSel) { physSel.value = String(s.physicsRes); physSel.dispatchEvent(new Event('change')); }
        
        if (trailEl) { trailEl.checked = !!s.showTrail; trailEl.dispatchEvent(new Event('change')); }
        if (cursorEl) { cursorEl.checked = !!s.showCursor; cursorEl.dispatchEvent(new Event('change')); }
        if (handlesEl) {
            handlesEl.checked = !!s.showCanvasHandles;
            if (typeof applyHandlesVisibility === 'function') applyHandlesVisibility(handlesEl.checked);
        }
        if (lockEl) { lockEl.checked = !!s.lockCanvasBorders; bordersLocked = lockEl.checked; }
        
        if (s.wrapper) setWrapperRectState(s.wrapper);
        if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
    } finally {
        applyingState = false;
    }
}

function pushUndo() {
    if (applyingState) return;
    try {
        const current = getState();
        const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
        if (last) {
            const lastStr = JSON.stringify(last);
            const currStr = JSON.stringify(current);
            if (lastStr === currStr) return; // skip duplicate snapshot
        }
        undoStack.push(current);
        redoStack.length = 0;
    } catch (e) { /* noop */ }
}
function doUndo() {
    if (!undoStack.length) return;
    const current = getState();
    // Skip no-op snapshots equal to current state
    while (undoStack.length) {
        const top = undoStack[undoStack.length - 1];
        if (JSON.stringify(top) === JSON.stringify(current)) { undoStack.pop(); } else { break; }
    }
    if (!undoStack.length) return;
    const st = undoStack.pop();
    redoStack.push(current);
    applyState(st);
}
function doRedo() {
    if (!redoStack.length) return;
    const current = getState();
    // Skip no-op snapshots equal to current state
    while (redoStack.length) {
        const top = redoStack[redoStack.length - 1];
        if (JSON.stringify(top) === JSON.stringify(current)) { redoStack.pop(); } else { break; }
    }
    if (!redoStack.length) return;
    const st = redoStack.pop();
    undoStack.push(current);
    applyState(st);
}

function toggleCheckbox(id) {
    const el = document.getElementById(id);
    if (!el) return;
    pushUndo();
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change'));
}
function adjustBrush(delta, coarse=false) {
    const el = document.getElementById('brushSize');
    if (!el) return;
    const step = coarse ? 5 : 1;
    let v = parseFloat(el.value || '11');
    const min = parseFloat(el.min || '1');
    const max = parseFloat(el.max || '30');
    v = Math.min(max, Math.max(min, v + delta * step));
    pushUndo();
    el.value = String(v);
    config.SPLAT_RADIUS = v / 1000;
}
function stepPaletteOnce(forward=true) {
    if (typeof getStepColorList !== 'function') return;
    const list = getStepColorList();
    if (!list || !list.length) return;
    const len = list.length;
    if (forward) {
        const hex = list[paletteStepIndex % len];
        paletteStepIndex = (paletteStepIndex + 1) % len;
        const cp = document.getElementById('colorPicker');
        if (cp) cp.value = hex;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        pointer.color = [r, g, b];
    } else {
        paletteStepIndex = (paletteStepIndex - 1 + len) % len;
        const hex = list[paletteStepIndex];
        const cp = document.getElementById('colorPicker');
        if (cp) cp.value = hex;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        pointer.color = [r, g, b];
    }
    if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
}
function cycleSelect(el, dir) {
    if (!el) return;
    const opts = el.options;
    if (!opts || !opts.length) return;
    let idx = el.selectedIndex;
    idx = Math.min(opts.length - 1, Math.max(0, idx + dir));
    if (idx !== el.selectedIndex) {
        pushUndo();
        el.selectedIndex = idx;
        el.dispatchEvent(new Event('change'));
    }
}

document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    
    // Hotkey modal
    if (key === 'F1' || (e.shiftKey && (key === '?' || key === '/'))) {
        e.preventDefault();
        toggleHotkeys();
        return;
    }
    if (key === 'Escape' && hotkeyOverlay && hotkeyOverlay.style.display === 'flex') {
        hideHotkeys();
        return;
    }
    
    // Undo/Redo
    if (ctrlOrMeta && lower === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
    }
    if (ctrlOrMeta && lower === 'y') {
        e.preventDefault();
        doRedo();
        return;
    }
    
    // Toggles
    if (!ctrlOrMeta && !e.altKey) {
        if (lower === 't') { toggleCheckbox('trailToggle'); return; }
        if (lower === 'c') { toggleCheckbox('cursorToggle'); return; }
        if (lower === 'h') { toggleCheckbox('showCanvasHandles'); return; }
        if (lower === 'l') { toggleCheckbox('lockCanvasBorders'); return; }
        if (lower === 'r') { toggleCheckbox('randomColor'); return; }
        if (lower === 'a') { toggleCheckbox('stepPalette'); return; }
        if (key === '[') { adjustBrush(-1, e.shiftKey); return; }
        if (key === ']') { adjustBrush(1, e.shiftKey); return; }
        if (lower === 'n') { stepPaletteOnce(!e.shiftKey); return; }
        if (e.shiftKey && lower === 's' && typeof window.saveColor === 'function') { e.preventDefault(); pushUndo(); window.saveColor(); return; }
        if (e.shiftKey && lower === 'x' && typeof window.clearColors === 'function') { e.preventDefault(); pushUndo(); window.clearColors(); return; }
    }
    
    // Palette cycling
    if (ctrlOrMeta && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        e.preventDefault();
        const sel = document.getElementById('paletteSelector');
        if (sel) {
            pushUndo();
            let idx = sel.selectedIndex;
            if (key === 'ArrowLeft') idx = Math.max(0, idx - 1); else idx = Math.min(sel.options.length - 1, idx + 1);
            if (idx !== sel.selectedIndex) {
                sel.selectedIndex = idx;
                sel.dispatchEvent(new Event('change'));
            }
        }
        return;
    }
    
    // Resolution cycling
    if (e.altKey && !ctrlOrMeta) {
        if (key === 'ArrowUp' || key === 'ArrowDown') {
            e.preventDefault();
            if (e.shiftKey) cycleSelect(document.getElementById('physicsResolution'), key === 'ArrowUp' ? 1 : -1);
            else cycleSelect(document.getElementById('visualResolution'), key === 'ArrowUp' ? 1 : -1);
            return;
        }
    }
});

// Seed initial undo state after UI init
try { pushUndo(); } catch (e) { /* noop */ }

// Initialize layer order with sim at the top
layerOrder = [{ type: 'sim' }];
renderLayers();

// Initialize Recorded Layers UI
setupRecUI();
recRenderUI();

update();
});
