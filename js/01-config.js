        const MAX_LAYERS = 10;
        let layers = []; // Array of layer objects
        let layerOrder = []; // Array of items in visual order: [{type: 'sim'} or {type: 'layer', id: layerIndex}]
        let currentLayerIndex = 0;
        let savedColors = [];
        
        // Expose layers for mask system via getter
        Object.defineProperty(window, 'layers', {
            get: function() { return layers; },
            set: function(val) { layers = val; }
        });
        
        // Initialize mask property for all layers
        function ensureLayerMasks() {
            layers.forEach(layer => {
                if (!layer.mask) {
                    layer.mask = {
                        enabled: false,
                        mode: 'show',
                        shapes: []
                    };
                }
            });
        }
        
        // Run initialization on page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ensureLayerMasks);
        } else {
            setTimeout(ensureLayerMasks, 100);
        }
        let isPaused = false;
        let animationMultiplier = 1;
        
        let mousePositions = [];
        let isRightMouseDown = false;
        let isReplayActive = false;
        const FADE_START = 333;
        const FADE_END = 555;
        
        let showCursor = true;
        
        let savedDensity = null;
        let savedVelocity = null;
        let activePreset = null;
        
        const canvas = document.getElementById('canvas');
        const canvasArea = document.getElementById('canvas-area');
        const canvasWrapper = document.getElementById('canvas-wrapper');
        const customCursor = document.getElementById('customCursor');
        const sizeDisplay = document.getElementById('canvas-size-display');
        const showCanvasHandles = document.getElementById('showCanvasHandles');
        const lockCanvasBorders = document.getElementById('lockCanvasBorders');
        let bordersLocked = false;
        if (lockCanvasBorders) bordersLocked = lockCanvasBorders.checked;
        
        const defaultPalettes = [
            { name: "Mountain Majesty", colors: { primary: "#4A90A4", secondary: "#E8E8D0", accent1: "#5F4E3B", accent2: "#2C5F2D", highlight: "#FFFACD" } },
            { name: "Forest Serenity", colors: { primary: "#2C5F2D", secondary: "#4A7856", accent1: "#8B4513", accent2: "#FFD700", highlight: "#F0EAD6" } },
            { name: "Sunset Dreams", colors: { primary: "#FF6347", secondary: "#FFD700", accent1: "#FF8C00", accent2: "#8B4789", highlight: "#FFF5EE" } },
            { name: "Ocean Waves", colors: { primary: "#4A90A4", secondary: "#5F9EA0", accent1: "#E8E8D0", accent2: "#2F4F4F", highlight: "#87CEEB" } }
        ];
        const curatedPalettes = [...defaultPalettes];
        let currentPaletteIndex = 0;
        let paletteStepIndex = 0;
        window.userPalettes = window.userPalettes || {};
        window.customPalettes = window.customPalettes || [];
        window.deletedDefaultPalettes = window.deletedDefaultPalettes || [];

        Object.defineProperty(window, 'savedColors', {
            get: function() { return savedColors; },
            set: function(val) { savedColors = Array.isArray(val) ? val : []; }
        });
        Object.defineProperty(window, 'currentPaletteIndex', {
            get: function() { return currentPaletteIndex; },
            set: function(val) { currentPaletteIndex = typeof val === 'number' ? val : 0; }
        });
        Object.defineProperty(window, 'curatedPalettes', {
            get: function() { return curatedPalettes; }
        });

        function uniqueColors(arr) { return [...new Set(arr.map(c => c.toUpperCase()))]; }

        window.setColor = function(hex) {
            const cp = document.getElementById('colorPicker');
            if (!cp) return;
            cp.value = hex;
            // A palette swatch/chip click IS the active brush's new colour:
            // switch to Solid via the 05g controller (clears Rnd/Step/Rainbow
            // and reflects into both colour UIs). Fall back to legacy if the
            // controller isn't present yet.
            if (typeof window.setActiveBrushColorMode === 'function') {
                window.setActiveBrushColorMode('fixed', { color: hex });
                return;
            }
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

        function hexToFull(hex) {
            const h = (hex || '').toString().trim();
            if (!h) return '#000000';
            let v = h.startsWith('#') ? h.slice(1) : h;
            if (v.length === 3) v = v.split('').map(c => c + c).join('');
            return ('#' + v).toUpperCase();
        }

        function getPaletteColorsForIndex(index) {
            const key = String(index);
            const overlay = window.userPalettes && Array.isArray(window.userPalettes[key]) ? window.userPalettes[key] : null;
            if (overlay && overlay.length) return uniqueColors(overlay.map(hexToFull));
            const p = curatedPalettes[index];
            if (!p) return [];
            if (Array.isArray(p.colors)) return uniqueColors(p.colors.map(hexToFull));
            return uniqueColors(Object.values(p.colors || {}).map(hexToFull));
        }

        function getPaletteName(index) {
            const p = curatedPalettes[index];
            return p ? p.name : `Palette ${index + 1}`;
        }

        function colorsKey(list) {
            return uniqueColors((list || []).map(hexToFull)).sort().join(',');
        }

        function refreshPaletteCarousel() {
            const carousel = document.getElementById('paletteCarousel');
            if (!carousel) return;
            carousel.innerHTML = '';
            curatedPalettes.forEach((p, idx) => {
                const tag = document.createElement('div');
                tag.className = 'palette-tag';
                if (idx === currentPaletteIndex) tag.classList.add('active');
                const nameSpan = document.createElement('span');
                nameSpan.textContent = p.name;
                tag.appendChild(nameSpan);
                const delBtn = document.createElement('span');
                delBtn.className = 'palette-tag-delete';
                delBtn.textContent = '×';
                delBtn.onclick = (e) => { e.stopPropagation(); showDeleteModal(idx, p.name); };
                tag.appendChild(delBtn);
                tag.onclick = () => applyPalette(idx);
                carousel.appendChild(tag);
            });
        }

        function canSaveNewPalette(name) {
            if (!name || !name.trim()) return { valid: false, reason: 'Name is required' };
            const nameTaken = curatedPalettes.some(p => p.name.toLowerCase() === name.toLowerCase());
            if (nameTaken) return { valid: false, reason: 'Name already exists' };
            const list = Array.isArray(savedColors) ? savedColors : [];
            if (list.length === 0) return { valid: false, reason: 'No colors saved' };
            return { valid: true };
        }

        function setPaletteColorsForIndex(index, colors) {
            const key = String(index);
            const list = uniqueColors((colors || []).map(hexToFull));
            window.userPalettes[key] = list;
            try { window.settingsManager?.set('palettes.user', window.userPalettes); } catch (_) {}
            renderPalettePreview(index);
            updatePaletteStepIndicator();
            try {
                const i = parseInt(index, 10);
                if (!isNaN(i) && i === currentPaletteIndex && typeof colorStorage?.save === 'function') {
                    savedColors = list.slice();
                    colorStorage.save(savedColors);
                }
            } catch (_) {}
        }

        function removePaletteColor(index, hex) {
            const list = getPaletteColorsForIndex(index);
            const next = list.filter(c => c.toUpperCase() !== hexToFull(hex).toUpperCase());
            setPaletteColorsForIndex(index, next);
        }

        function renderPalettePreview(index) {
            const el = document.getElementById('palettePreview');
            if (!el || !curatedPalettes[index]) return;
            const list = getPaletteColorsForIndex(index);
            el.innerHTML = '';
            list.forEach(hex => {
                const wrap = document.createElement('div');
                wrap.className = 'palette-chip-wrap';
                const chip = document.createElement('div');
                chip.className = 'palette-chip';
                chip.style.backgroundColor = hex;
                chip.onclick = () => window.setColor(hex);
                const rm = document.createElement('button');
                rm.className = 'palette-remove';
                rm.textContent = '×';
                rm.title = 'Remove from palette';
                rm.onclick = (e) => { e.stopPropagation(); removePaletteColor(index, hex); };
                wrap.appendChild(chip);
                wrap.appendChild(rm);
                el.appendChild(wrap);
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
            return getPaletteColorsForIndex(currentPaletteIndex);
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
            const list = getPaletteColorsForIndex(i);
            paletteStepIndex = 0;
            const cp = document.getElementById('colorPicker');
            if (cp) {
                cp.value = list[0] || '#FFFFFF';
                const stepEl = document.getElementById('stepPalette');
                
                // Auto-enable "Step through palette" when selecting a palette
                if (stepEl && !stepEl.checked) {
                    stepEl.checked = true;
                    stepEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                if (!(stepEl && stepEl.checked) && typeof updateColor === 'function') updateColor();
            }
            currentTrailColorCss = hexToRgbaCss(list[1] || list[0] || '#FFFFFF', 0.5);
            const swatches = getCurrentPaletteHexList();
            if (typeof colorStorage !== 'undefined') {
                savedColors = swatches.slice();
                colorStorage.save(savedColors);
            }
            renderPalettePreview(i);
            refreshPaletteCarousel();
            localStorage.setItem('curatedPaletteIndex', String(i));
            updatePaletteStepIndicator();
        }

        let pendingDeleteIndex = -1;
        
        window.showDeleteModal = function(idx, name) {
            pendingDeleteIndex = idx;
            const modal = document.getElementById('deletePaletteModal');
            const msg = document.getElementById('deleteModalMessage');
            if (msg) msg.textContent = `Are you sure you want to delete "${name}"?`;
            if (modal) modal.classList.add('show');
        };
        
        window.hideDeleteModal = function() {
            pendingDeleteIndex = -1;
            const modal = document.getElementById('deletePaletteModal');
            if (modal) modal.classList.remove('show');
        };
        
        window.confirmDeletePalette = function() {
            if (pendingDeleteIndex < 0 || pendingDeleteIndex >= curatedPalettes.length) return;
            const palette = curatedPalettes[pendingDeleteIndex];
            const isDefault = defaultPalettes.some(dp => dp.name === palette.name);
            if (isDefault && !window.deletedDefaultPalettes.includes(palette.name)) {
                window.deletedDefaultPalettes.push(palette.name);
            }
            curatedPalettes.splice(pendingDeleteIndex, 1);
            const customIdx = window.customPalettes.findIndex(cp => cp.name === palette.name);
            if (customIdx >= 0) window.customPalettes.splice(customIdx, 1);
            delete window.userPalettes[String(pendingDeleteIndex)];
            if (currentPaletteIndex === pendingDeleteIndex) {
                currentPaletteIndex = Math.max(0, Math.min(currentPaletteIndex, curatedPalettes.length - 1));
                applyPalette(currentPaletteIndex);
            } else if (currentPaletteIndex > pendingDeleteIndex) {
                currentPaletteIndex--;
            }
            refreshPaletteCarousel();
            hideDeleteModal();
        };
        
        function initPaletteUI() {
            refreshPaletteCarousel();
            // Apply first palette on load if autoload is not enabled
            const autoload = window.settingsManager?.get('settings.autoload');
            if (!autoload && curatedPalettes.length > 0) {
                applyPalette(currentPaletteIndex || 0);
            }
            const updateBtn = document.getElementById('updatePaletteBtn');
            const saveNewBtn = document.getElementById('saveNewPaletteBtn');
            const nameInputRow = document.getElementById('paletteNameInput');
            const nameInput = document.getElementById('newPaletteName');
            const confirmBtn = document.getElementById('confirmSaveBtn');
            const cancelBtn = document.getElementById('cancelSaveBtn');
            const splitRow = document.querySelector('.palette-row-split');
            const paletteLeft = document.querySelector('.palette-left');
            const paletteRight = document.querySelector('.palette-right');

            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    const list = Array.isArray(savedColors) ? savedColors.slice() : [];
                    if (list.length === 0) {
                        const status = document.getElementById('paletteImportStatus');
                        if (status) {
                            status.textContent = 'No colors to update';
                            status.style.color = '#ff6b6b';
                            status.classList.add('show');
                            setTimeout(() => { status.classList.remove('show'); status.style.color = '#3fb950'; status.textContent = ''; }, 2000);
                        }
                        return;
                    }
                    const normalized = uniqueColors(list.map(hexToFull));
                    setPaletteColorsForIndex(currentPaletteIndex, normalized);
                    // Also update the curatedPalettes array directly
                    if (curatedPalettes[currentPaletteIndex]) {
                        curatedPalettes[currentPaletteIndex].colors = normalized;
                    }
                    // Update customPalettes if this is a custom palette
                    const paletteName = getPaletteName(currentPaletteIndex);
                    const customIdx = window.customPalettes.findIndex(cp => cp.name === paletteName);
                    if (customIdx >= 0) {
                        window.customPalettes[customIdx].colors = list.slice();
                    }
                    refreshPaletteCarousel();
                    renderPalettePreview(currentPaletteIndex);
                    const status = document.getElementById('paletteImportStatus');
                    if (status) {
                        status.textContent = 'Updated';
                        status.classList.add('show');
                        setTimeout(() => { status.classList.remove('show'); status.textContent = ''; }, 1200);
                    }
                    // Flash the button for feedback
                    updateBtn.textContent = '✓ Updated';
                    setTimeout(() => { updateBtn.textContent = 'Update'; }, 1200);
                });
            }
            
            const btnRow = document.querySelector('.palette-btn-row');
            if (saveNewBtn) {
                saveNewBtn.addEventListener('click', () => {
                    if (btnRow) btnRow.style.display = 'none';
                    if (nameInputRow) nameInputRow.style.display = 'flex';
                    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
                    if (splitRow) splitRow.classList.add('full-width');
                    if (paletteLeft) paletteLeft.style.display = 'none';
                    if (paletteRight) paletteRight.classList.add('full-width');
                });
            }
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    if (nameInputRow) nameInputRow.style.display = 'none';
                    if (btnRow) btnRow.style.display = 'flex';
                    if (nameInput) nameInput.value = '';
                    if (splitRow) splitRow.classList.remove('full-width');
                    if (paletteLeft) paletteLeft.style.display = 'block';
                    if (paletteRight) paletteRight.classList.remove('full-width');
                });
            }
            
            if (confirmBtn && nameInput) {
                const doSave = () => {
                    const name = (nameInput.value || '').trim();
                    const validation = canSaveNewPalette(name);
                    if (!validation.valid) {
                        const status = document.getElementById('paletteImportStatus');
                        if (status) {
                            status.textContent = validation.reason;
                            status.style.color = '#ff6b6b';
                            status.classList.add('show');
                            setTimeout(() => {
                                status.classList.remove('show');
                                status.style.color = '#3fb950';
                                status.textContent = '';
                            }, 2000);
                        }
                        return;
                    }
                    const list = Array.isArray(savedColors) ? savedColors.slice() : [];
                    const normalized = uniqueColors(list.map(hexToFull));
                    curatedPalettes.push({ name, colors: normalized });
                    window.customPalettes.push({ name, colors: list.slice() });
                    refreshPaletteCarousel();
                    applyPalette(curatedPalettes.length - 1);
                    if (nameInputRow) nameInputRow.style.display = 'none';
                    if (btnRow) btnRow.style.display = 'flex';
                    nameInput.value = '';
                    if (splitRow) splitRow.classList.remove('full-width');
                    if (paletteLeft) paletteLeft.style.display = 'block';
                    if (paletteRight) paletteRight.classList.remove('full-width');
                    const status = document.getElementById('paletteImportStatus');
                    if (status) { status.textContent = 'Saved'; status.classList.add('show'); setTimeout(() => { status.classList.remove('show'); status.textContent=''; }, 1200); }
                };
                confirmBtn.addEventListener('click', doSave);
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); doSave(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
                });
            }
        }

        window.getPaletteIndexByName = function(name) {
            const n = String(name || '').trim().toLowerCase();
            if (!n) return -1;
            return curatedPalettes.findIndex(p => p.name.toLowerCase() === n);
        };

        window.applyPaletteByName = function(name) {
            const idx = window.getPaletteIndexByName(name);
            if (typeof idx === 'number' && idx >= 0) applyPalette(idx);
        };

        window.cyclePalette = function(dir) {
            const len = curatedPalettes.length;
            if (!len) return;
            const delta = dir < 0 ? -1 : 1;
            const next = Math.min(len - 1, Math.max(0, currentPaletteIndex + delta));
            if (next !== currentPaletteIndex) applyPalette(next);
        };

        function exportCurrentPaletteFluid() {
            const idx = currentPaletteIndex;
            const name = getPaletteName(idx);
            const colors = getPaletteColorsForIndex(idx);
            const text = `Palette: ${name}\n${colors.join(' ')}\n`;
            const blob = new Blob([text], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${name.replace(/\s+/g,'-').toLowerCase()}.fluid`;
            a.click();
            URL.revokeObjectURL(a.href);
        }

        function exportAllPalettesFluid() {
            const blocks = curatedPalettes.map((p, i) => {
                const name = getPaletteName(i);
                const colors = getPaletteColorsForIndex(i);
                return `Palette: ${name}\n${colors.join(' ')}\n`;
            });
            const text = blocks.join('\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `palettes.fluid`;
            a.click();
            URL.revokeObjectURL(a.href);
        }

        function parseFluidText(txt) {
            const lines = String(txt || '').split(/\r?\n/);
            const result = [];
            let current = null;
            function pushCurrent() {
                if (current && current.colors && current.colors.length) {
                    current.colors = uniqueColors(current.colors.map(hexToFull));
                    result.push(current);
                }
                current = null;
            }
            for (let raw of lines) {
                const line = raw.trim();
                if (!line) { pushCurrent(); continue; }
                const lower = line.toLowerCase();
                if (lower.startsWith('palette:') || line.startsWith('#')) {
                    pushCurrent();
                    const name = line.startsWith('#') ? line.replace(/^#+\s*/, '') : line.replace(/^[^:]*:/, '').trim();
                    current = { name: name || 'Imported', colors: [] };
                    continue;
                }
                const parts = line.split(/\s+/).filter(Boolean);
                parts.forEach(p => {
                    const m = p.match(/^#?[0-9a-fA-F]{3,6}$/);
                    if (m) {
                        if (!current) current = { name: 'Imported', colors: [] };
                        current.colors.push(hexToFull(p));
                    }
                });
            }
            pushCurrent();
            return result;
        }

        function importPalettesFluidText(txt) {
            const sets = parseFluidText(txt);
            if (!sets.length) return;
            const nameToIndex = new Map(curatedPalettes.map((p, i) => [p.name.toLowerCase(), i]));
            let applied = 0;
            let added = 0;
            const newlyAdded = [];
            sets.forEach(s => {
                const name = (s.name || 'Imported').trim();
                const key = name.toLowerCase();
                let idx = nameToIndex.get(key);
                if (typeof idx === 'number') {
                    setPaletteColorsForIndex(idx, s.colors);
                    applied++;
                } else {
                    curatedPalettes.push({ name, colors: s.colors.slice() });
                    idx = curatedPalettes.length - 1;
                    nameToIndex.set(key, idx);
                    added++;
                    newlyAdded.push({ name, colors: s.colors.slice() });
                }
            });
            if (newlyAdded.length) {
                window.customPalettes.push(...newlyAdded);
                try { window.settingsManager?.set('palettes.custom', window.customPalettes); } catch (_) {}
            }
            refreshPaletteCarousel();
            renderPalettePreview(currentPaletteIndex);
            const status = document.getElementById('paletteImportStatus');
            if (status) {
                status.textContent = 'Imported';
                status.classList.add('show');
                setTimeout(() => { status.classList.remove('show'); status.textContent = ''; }, 1500);
            }
        }

        window.refreshPaletteCarousel = refreshPaletteCarousel;
        window.applyPalette = applyPalette;
        window.exportCurrentPaletteFluid = exportCurrentPaletteFluid;
        window.exportAllPalettesFluid = exportAllPalettesFluid;
        window.importPalettesFluidFromFile = function(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => importPalettesFluidText(String(e.target.result || ''));
            reader.readAsText(file);
        };

        function preseedPaletteOnLoad() {
            const len = curatedPalettes.length;
            if (!len) return;
            const last = parseInt(localStorage.getItem('curatedPaletteIndex') || '-1', 10);
            const next = (isNaN(last) || last < 0) ? Math.floor(Math.random() * len) : (last + 1) % len;
            applyPalette(next);
        }

        window.addCustomPalettes = function(list) {
            try {
                const arr = Array.isArray(list) ? list : [];
                arr.forEach(it => {
                    const name = (it && it.name ? String(it.name) : '').trim();
                    const colors = Array.isArray(it && it.colors) ? it.colors : [];
                    if (!name || !colors.length) return;
                    if (curatedPalettes.some(p => p.name.toLowerCase() === name.toLowerCase())) return;
                    curatedPalettes.push({ name, colors: uniqueColors(colors.map(hexToFull)) });
                });
                window.customPalettes = arr;
                refreshPaletteCarousel();
            } catch (_) {}
        };
        
        window.loadDeletedPalettes = function() {
            try {
                const deleted = window.settingsManager?.get('palettes.deletedDefaults', []);
                if (Array.isArray(deleted)) {
                    window.deletedDefaultPalettes = deleted;
                    deleted.forEach(name => {
                        const idx = curatedPalettes.findIndex(p => p.name === name);
                        if (idx >= 0) curatedPalettes.splice(idx, 1);
                    });
                }
            } catch (_) {}
        };
        
        window.restoreDefaultPalettes = function() {
            window.deletedDefaultPalettes = [];
            try { window.settingsManager?.set('palettes.deletedDefaults', []); } catch (_) {}
            curatedPalettes.length = 0;
            curatedPalettes.push(...defaultPalettes);
            if (window.customPalettes && window.customPalettes.length) {
                window.addCustomPalettes(window.customPalettes);
            }
            refreshPaletteCarousel();
        };

        function updateCanvasSize() {
            const newWidth = canvasWrapper.clientWidth;
            const newHeight = canvasWrapper.clientHeight;
            
            // Set canvas resolution (internal pixels)
            canvas.width = newWidth;
            canvas.height = newHeight;
            
            // Also set CSS size explicitly to match (fixes scaling issues)
            canvas.style.width = newWidth + 'px';
            canvas.style.height = newHeight + 'px';
            
            sizeDisplay.textContent = `${newWidth} × ${newHeight}`;
            
            // Flag to reinitialize framebuffers after WebGL context is set up
            window.needsFramebufferReinit = true;
        }

        // Expose for other modules (e.g. save/load) to force a resize after restoring state
        window.updateCanvasSize = updateCanvasSize;
        
        // Whether the user has a pinned canvas size (saved only when they drag
        // a resize handle — see js/02-palettes.js pointerup). When false we keep
        // the canvas filled to the available area on every layout change.
        function hasPinnedCanvasSize() {
            if (!(window.Settings && typeof window.Settings.loadCanvasSize === 'function')) return false;
            const s = window.Settings.loadCanvasSize();
            return !!(s && s.width && s.height);
        }

        // Place the canvas-wrapper so it is ALWAYS fully inside the available
        // canvas area, at any window size. opts.initial = launch (restore saved
        // size or fill the area); opts.fill = force-fill the area; otherwise
        // keep the current size and just re-clamp + re-center.
        const CANVAS_MARGIN = 24;   // breathing room; also clears the -12px resize handles
        const CANVAS_MIN = 200;
        function initializeCanvasPosition(opts) {
            opts = opts || {};
            const areaRect = canvasArea.getBoundingClientRect();

            // Area not laid out yet (pre-paint / mid-transition): retry next frame
            // so we never measure a zero-size area and shrink the canvas to nothing.
            if (areaRect.width < CANVAS_MIN || areaRect.height < CANVAS_MIN) {
                requestAnimationFrame(() => initializeCanvasPosition(opts));
                return;
            }

            // The bottom nav (quality underbar) is position:fixed OVER the bottom
            // of the canvas area — measure the usable height up to its top edge,
            // matching the drag clamp in 02-palettes.js, so the frame never
            // initializes or re-fits underneath it.
            let areaH = areaRect.height;
            const _underbar = document.getElementById('quality-underbar');
            if (_underbar) {
                const _ubcs = getComputedStyle(_underbar);
                if (_ubcs.display !== 'none' && _ubcs.visibility !== 'hidden') {
                    const _ubTop = _underbar.getBoundingClientRect().top - areaRect.top;
                    if (_ubTop > 0) areaH = Math.min(areaH, _ubTop);
                }
            }

            const maxW = Math.max(CANVAS_MIN, areaRect.width  - CANVAS_MARGIN * 2);
            const maxH = Math.max(CANVAS_MIN, areaH - CANVAS_MARGIN * 2);

            // Stream format owns the wrapper dimensions — only re-center it.
            const hasStreamFormat = window.focusMode &&
                typeof window.focusMode.getActiveFormat === 'function' &&
                window.focusMode.getActiveFormat();

            let w = canvasWrapper.offsetWidth;
            let h = canvasWrapper.offsetHeight;

            if (!hasStreamFormat) {
                if (opts.initial) {
                    // Launch: restore a pinned size if present, else fill the area.
                    let saved = null;
                    if (window.Settings && typeof window.Settings.loadCanvasSize === 'function') {
                        saved = window.Settings.loadCanvasSize();
                    }
                    if (saved && saved.width && saved.height) {
                        w = saved.width; h = saved.height;
                    } else {
                        w = maxW; h = maxH;
                    }
                } else if (opts.fill) {
                    w = maxW; h = maxH;
                }
                // Always clamp the size so it can never exceed the area.
                w = Math.min(Math.max(w, CANVAS_MIN), maxW);
                h = Math.min(Math.max(h, CANVAS_MIN), maxH);
                canvasWrapper.style.width  = w + 'px';
                canvasWrapper.style.height = h + 'px';
            }

            // Center, then clamp the position so the box stays fully inside the
            // area with at least CANVAS_MARGIN on every edge.
            const left = Math.max(CANVAS_MARGIN, Math.min((areaRect.width  - w) / 2, areaRect.width  - w - CANVAS_MARGIN));
            const top  = Math.max(CANVAS_MARGIN, Math.min((areaH - h) / 2, areaH - h - CANVAS_MARGIN));
            canvasWrapper.style.left = Math.round(left) + 'px';
            canvasWrapper.style.top  = Math.round(top)  + 'px';

            // Sync the canvas AFTER the initial placement actually lands.
            // The old flow called updateCanvasSize() unconditionally right
            // after the initial initializeCanvasPosition() — but when the
            // area wasn't laid out yet (Electron boots small then maximizes),
            // placement deferred itself via rAF while the canvas synced to
            // the PRE-retry wrapper size, leaving the sim smaller than the
            // wrapper border (the "init size bug", 2026-07-09).
            if (opts.initial) updateCanvasSize();
        }

        // Exposed so the deferred UI can re-fit the canvas after inserting the
        // quality underbar — the initial placement above may run before the bar
        // exists, and its position:fixed insertion never fires the canvas-area
        // ResizeObserver, so the underbar clamp would silently never apply
        // (seen in Electron, whose boot order builds the UI late).
        window.initializeCanvasPosition = initializeCanvasPosition;

        // ── Airtight bottom-edge clamp ──
        // Too many independent writers size/position the wrapper (drag resize,
        // focus formats, undo restore, presets, hotkeys) and each grew its own
        // partial clamp. This watchdog fires on EVERY style write (microtask,
        // before paint) and pulls the bottom edge back above the quality
        // underbar / area bottom, whoever wrote it.
        (function () {
            let clamping = false;
            function clampWrapperBottom() {
                if (clamping) return;
                const areaRect = canvasArea.getBoundingClientRect();
                if (areaRect.height < CANVAS_MIN) return;
                let usableBottom = areaRect.bottom;
                const ub = document.getElementById('quality-underbar');
                if (ub) {
                    const cs = getComputedStyle(ub);
                    if (cs.display !== 'none' && cs.visibility !== 'hidden') {
                        const t = ub.getBoundingClientRect().top;
                        if (t > areaRect.top) usableBottom = Math.min(usableBottom, t);
                    }
                }
                const wr = canvasWrapper.getBoundingClientRect();
                const overflow = wr.bottom - usableBottom;
                if (overflow <= 0.5) return;
                clamping = true;
                const newH = Math.max(CANVAS_MIN, wr.height - overflow);
                canvasWrapper.style.height = newH + 'px';
                // Hit min height and still overflowing: pull the top up too.
                const stillOver = (wr.top + newH) - usableBottom;
                if (stillOver > 0.5) {
                    canvasWrapper.style.top = Math.max(0, wr.top - areaRect.top - stillOver) + 'px';
                }
                updateCanvasSize();
                clamping = false;
            }
            new MutationObserver(clampWrapperBottom)
                .observe(canvasWrapper, { attributes: true, attributeFilter: ['style'] });
            window.addEventListener('resize', clampWrapperBottom);
            window.clampWrapperBottom = clampWrapperBottom;
        })();

        initializeCanvasPosition({ initial: true });
        
        // Force a micro-resize cycle to lock in canvas/framebuffer sync.
        // This prevents a rendering glitch when the mouse leaves the canvas
        // before any manual resize has occurred.
        requestAnimationFrame(() => {
            const w = canvasWrapper.clientWidth;
            const h = canvasWrapper.clientHeight;
            canvasWrapper.style.width = (w + 1) + 'px';
            canvasWrapper.style.height = (h + 1) + 'px';
            updateCanvasSize();
            requestAnimationFrame(() => {
                canvasWrapper.style.width = w + 'px';
                canvasWrapper.style.height = h + 'px';
                updateCanvasSize();
            });
        });
        
        // Re-place whenever the AVAILABLE AREA changes size — not just on window
        // resize. The sidebar is inserted asynchronously after this script runs,
        // and the launch maximize / entrance animation settle later too, so the
        // area shrinks/grows after the first placement. A ResizeObserver on
        // canvas-area catches every such change (sidebar insert/drag, window
        // resize, maximize, fullscreen) and re-fits the canvas so it is always
        // fully inside. (Observing the area, not the wrapper, so no feedback.)
        function replaceCanvasForArea() {
            initializeCanvasPosition({ fill: !hasPinnedCanvasSize() });
        }
        if (typeof ResizeObserver !== 'undefined') {
            let _roTimer = null;
            const areaObserver = new ResizeObserver(() => {
                clearTimeout(_roTimer);
                _roTimer = setTimeout(replaceCanvasForArea, 80); // coalesce rapid changes
            });
            areaObserver.observe(canvasArea);
        } else {
            window.addEventListener('resize', () => { setTimeout(replaceCanvasForArea, 100); });
        }

        // ── Mobile viewport sizing (iOS Chrome / Safari) ──
        // 100vh/100dvh and getBoundingClientRect don't reliably exclude the browser's
        // top URL bar + bottom toolbar on iOS, so the canvas ran under the bottom bar.
        // The Visual Viewport API reports the exact area BETWEEN the bars; drive an
        // --app-height CSS var from it (consumed by the mobile/focus #canvas-area
        // height) and re-fit the canvas whenever the chrome shows/hides.
        var _appHeightTimer = null;
        function setAppHeight() {
            var vv = window.visualViewport;
            var h = (vv && vv.height) || window.innerHeight;
            document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
            clearTimeout(_appHeightTimer);
            _appHeightTimer = setTimeout(replaceCanvasForArea, 120); // settle, then re-fit
        }
        setAppHeight();
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', setAppHeight);
        }
        window.addEventListener('resize', setAppHeight);
        window.addEventListener('orientationchange', function () { setTimeout(setAppHeight, 250); });

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
