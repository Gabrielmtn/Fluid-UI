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
