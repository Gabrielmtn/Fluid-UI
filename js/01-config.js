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
            const saveNewBtn = document.getElementById('saveNewPaletteBtn');
            const nameInputRow = document.getElementById('paletteNameInput');
            const nameInput = document.getElementById('newPaletteName');
            const confirmBtn = document.getElementById('confirmSaveBtn');
            const cancelBtn = document.getElementById('cancelSaveBtn');
            const splitRow = document.querySelector('.palette-row-split');
            const paletteLeft = document.querySelector('.palette-left');
            const paletteRight = document.querySelector('.palette-right');
            
            if (saveNewBtn) {
                saveNewBtn.addEventListener('click', () => {
                    saveNewBtn.style.display = 'none';
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
                    if (saveNewBtn) saveNewBtn.style.display = 'block';
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
                    if (saveNewBtn) saveNewBtn.style.display = 'block';
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
            trailCanvas.width = newWidth;
            trailCanvas.height = newHeight;
            
            // Also set CSS size explicitly to match (fixes scaling issues)
            canvas.style.width = newWidth + 'px';
            canvas.style.height = newHeight + 'px';
            trailCanvas.style.width = newWidth + 'px';
            trailCanvas.style.height = newHeight + 'px';
            
            sizeDisplay.textContent = `${newWidth} × ${newHeight}`;
            
            // Flag to reinitialize framebuffers after WebGL context is set up
            window.needsFramebufferReinit = true;
        }

        // Expose for other modules (e.g. save/load) to force a resize after restoring state
        window.updateCanvasSize = updateCanvasSize;
        
        // Initialize canvas wrapper position (centered and constrained)
        function initializeCanvasPosition() {
            // Load saved canvas size if available
            if (window.Settings && typeof window.Settings.loadCanvasSize === 'function') {
                const saved = window.Settings.loadCanvasSize();
                if (saved && saved.width && saved.height) {
                    canvasWrapper.style.width = saved.width + 'px';
                    canvasWrapper.style.height = saved.height + 'px';
                }
            }
            
            const areaRect = canvasArea.getBoundingClientRect();
            let wrapperWidth = canvasWrapper.offsetWidth;
            let wrapperHeight = canvasWrapper.offsetHeight;
            
            // Constrain canvas to fit within window (Electron fix)
            const maxWidth = areaRect.width - 40; // Leave margin
            const maxHeight = areaRect.height - 40;
            
            if (wrapperWidth > maxWidth) {
                wrapperWidth = maxWidth;
                canvasWrapper.style.width = maxWidth + 'px';
            }
            if (wrapperHeight > maxHeight) {
                wrapperHeight = maxHeight;
                canvasWrapper.style.height = maxHeight + 'px';
            }
            
            const centerLeft = Math.max(0, (areaRect.width - wrapperWidth) / 2);
            const centerTop = Math.max(20, (areaRect.height - wrapperHeight) / 2);
            
            canvasWrapper.style.left = centerLeft + 'px';
            canvasWrapper.style.top = centerTop + 'px';
        }
        
        initializeCanvasPosition();
        updateCanvasSize();
        
        // Re-center on window resize (Electron)
        window.addEventListener('resize', () => {
            setTimeout(initializeCanvasPosition, 100);
        });
        
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
