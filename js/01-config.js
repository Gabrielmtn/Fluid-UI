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
        // The palette a fresh install starts on: "Forest Serenity" (index 1), the
        // swatch tray of the default look (2026-09-24). 12-save-load falls back to
        // it when no palette index was ever saved, and baselines presets on it.
        const DEFAULT_PALETTE_INDEX = 1;
        window.DEFAULT_PALETTE_INDEX = DEFAULT_PALETTE_INDEX;
        let currentPaletteIndex = DEFAULT_PALETTE_INDEX;
        let paletteStepIndex = 0;
        window.userPalettes = window.userPalettes || {};
        window.customPalettes = window.customPalettes || [];
        window.deletedDefaultPalettes = window.deletedDefaultPalettes || [];

        // ── User-authored palettes persist like CONTENT, not like settings ──
        // Named palettes (and per-palette colour edits) used to reach storage
        // only through the Save button's scanAppState(), and came back only when
        // autoload was on — so "make a palette → reload" simply lost it
        // (reported 2026-08-23). Creating, editing, importing or deleting one now
        // writes through immediately, and every boot restores them: the contract
        // brush shapes (33-brush-shapes) and brush presets (20-mixer-layout)
        // already honour. Settings are a session; a thing you named is yours.
        function persistPalettes() {
            const sm = window.settingsManager;
            if (!sm) return;
            try { sm.set('palettes.custom', window.customPalettes || []); } catch (_) {}
            try { sm.set('palettes.deletedDefaults', window.deletedDefaultPalettes || []); } catch (_) {}
            try { sm.set('palettes.user', window.userPalettes || {}); } catch (_) {}
            try { sm.set('palettes.order', curatedPalettes.map(p => p.name)); } catch (_) {}
        }
        window.persistPalettes = persistPalettes;

        // Runs from initPaletteUI(), i.e. before 12-save-load's autoload pass
        // re-runs the same restore. Re-applying there is harmless: the deleted
        // list splices by name and addCustomPalettes skips names already in the
        // carousel, so both halves are idempotent.
        function restorePersistedPalettes() {
            const sm = window.settingsManager;
            if (!sm) return;
            try { if (typeof window.loadDeletedPalettes === 'function') window.loadDeletedPalettes(); } catch (_) {}
            try {
                const cp = sm.get('palettes.custom');
                if (Array.isArray(cp) && cp.length && typeof window.addCustomPalettes === 'function') {
                    window.addCustomPalettes(cp);
                }
            } catch (_) {}
            try {
                const up = sm.get('palettes.user');
                if (up && typeof up === 'object') window.userPalettes = up;
            } catch (_) {}
            // Edits saved by POSITION ('0', '1'…, before 2026-10-04) move to
            // their palette's name now, while positions still mean what they
            // meant: after a reorder they would point at the wrong palette.
            const up2 = window.userPalettes || {};
            let moved = false;
            Object.keys(up2).filter(k => /^\d+$/.test(k)).forEach((k) => {
                const p = curatedPalettes[+k];
                if (p && !Array.isArray(up2['name:' + p.name])) up2['name:' + p.name] = up2[k];
                delete up2[k];
                moved = true;
            });
            try {
                const order = sm.get('palettes.order');
                if (Array.isArray(order) && order.length) {
                    const rank = new Map(order.map((n, i) => [n, i]));
                    const ranked = curatedPalettes.map((p, i) => ({ p, i, r: rank.has(p.name) ? rank.get(p.name) : order.length + i }));
                    ranked.sort((a, b) => a.r - b.r);
                    curatedPalettes.length = 0;
                    ranked.forEach(x => curatedPalettes.push(x.p));
                }
            } catch (_) {}
            if (moved) persistPalettes();
        }

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

        // A palette's edits are keyed by its NAME ('name:<palette name>').
        // They were keyed by position, so deleting a palette left every later
        // palette reading the edits of the one after it (user test 3). A
        // positional key from an older save is still read, moves to the name
        // key the next time that palette is edited, and moves down with its
        // palette when one before it is deleted.
        function userPaletteKey(index) {
            const p = curatedPalettes[index];
            return p ? 'name:' + p.name : String(index);
        }
        function userPaletteOverlay(index) {
            const up = window.userPalettes;
            if (!up) return null;
            const byName = up[userPaletteKey(index)];
            if (Array.isArray(byName)) return byName;
            const byIndex = up[String(index)];
            return Array.isArray(byIndex) ? byIndex : null;
        }

        function getPaletteColorsForIndex(index) {
            const overlay = userPaletteOverlay(index);
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

        // Delete lives on a right-click menu (user test 3: "we need the delete to
        // be from a right click menu"). A × appeared on hover, a misclick away
        // from the palette name, and its appearing pushed the tags onto new lines.
        // The menu is the brush-shape menu's (20 openShapeMenu): same look,
        // body-mounted, Escape or a click elsewhere closes it. Colours get one
        // too (Paint with it, Replace, Remove).
        let paletteMenuEl = null;
        function closePaletteMenu() {
            if (!paletteMenuEl) return;
            paletteMenuEl.remove();
            paletteMenuEl = null;
            document.removeEventListener('mousedown', onPaletteMenuOutside, true);
            document.removeEventListener('keydown', onPaletteMenuKey, true);
        }
        function onPaletteMenuOutside(e) { if (paletteMenuEl && !paletteMenuEl.contains(e.target)) closePaletteMenu(); }
        function onPaletteMenuKey(e) { if (e.key === 'Escape') closePaletteMenu(); }
        function openPalMenu(title, items, x, y, swatch) {
            closePaletteMenu();
            const m = document.createElement('div');
            m.className = 'brush-shape-menu palette-menu';
            const head = document.createElement('div');
            head.className = 'brush-shape-menu-head';
            head.textContent = title;
            head.title = title;
            if (swatch) {
                const sw = document.createElement('span');
                sw.className = 'palette-menu-swatch';
                sw.style.backgroundColor = swatch;
                head.prepend(sw);
            }
            m.appendChild(head);
            items.forEach((it) => {
                if (!it) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'brush-shape-menu-item' + (it.cls ? ' ' + it.cls : '');
                b.textContent = it.label;
                b.addEventListener('click', () => { closePaletteMenu(); it.fn(); });
                m.appendChild(b);
            });
            document.body.appendChild(m);
            const r = m.getBoundingClientRect();
            m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
            m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
            paletteMenuEl = m;
            setTimeout(() => {
                document.addEventListener('mousedown', onPaletteMenuOutside, true);
                document.addEventListener('keydown', onPaletteMenuKey, true);
            }, 0);
        }
        function hasColourEdits(idx) { return !!userPaletteOverlay(idx); }
        function openPaletteMenu(idx, name, x, y) {
            openPalMenu(name, [
                { label: 'Use this palette', fn: () => applyPalette(idx) },
                { label: 'Rename', fn: () => renameInline(idx) },
                { label: 'Duplicate', fn: () => duplicatePalette(idx) },
                hasColourEdits(idx) ? { label: 'Reset colours', fn: () => resetPaletteColors(idx) } : null,
                { label: 'Delete…', cls: 'danger', fn: () => showDeleteModal(idx, name) }
            ], x, y);
        }
        function openChipMenu(hex, x, y) {
            const pick = pickerHex();
            openPalMenu(hex, [
                { label: 'Paint with this colour', fn: () => window.setColor(hex) },
                window.ColourPicker ? { label: 'Change colour…', fn: () => window.ColourPicker.openInline({ mode: 'edit', hex }) } : null,
                pick !== hex ? { label: 'Replace with the brush colour', fn: () => replacePaletteColor(hex, pick) } : null,
                { label: 'Remove', cls: 'danger', fn: () => window.removeColorFromPalette(hex) }
            ], x, y, hex);
        }

        // ── Names ──
        function nameTaken(name, exceptIdx) {
            const n = String(name || '').trim().toLowerCase();
            return curatedPalettes.some((p, i) => i !== exceptIdx && p.name.toLowerCase() === n);
        }
        function freeName(base) {
            if (!nameTaken(base)) return base;
            for (let k = 2; k < 1000; k++) if (!nameTaken(base + ' ' + k)) return base + ' ' + k;
            return base + ' ' + Date.now();
        }
        // A palette of your own, appended and painted with at once.
        function addOwnPalette(name, colors) {
            const list = uniqueColors(colors.map(hexToFull));
            curatedPalettes.push({ name, colors: list });
            window.customPalettes.push({ name, colors: list.slice() });
            persistPalettes();
            applyPalette(curatedPalettes.length - 1);
            return curatedPalettes.length - 1;
        }
        // New palette → With the brush colour starts a palette with the brush
        // colour, named "Untitled", and puts its name up for editing.
        // Duplicate is in each palette's menu.
        function newPalette() {
            const idx = addOwnPalette(freeName('Untitled'), [pickerHex()]);
            renameInline(idx);
        }
        // Palette from an image or the canvas (65-palette-from-image) saves
        // through here: a palette of your own, painted with at once. The name
        // comes from the file, so it isn't put up for editing.
        window.addPaletteFromColours = function (name, colours) {
            const list = uniqueColors((colours || []).map(hexToFull)).filter(h => /^#[0-9A-F]{6}$/.test(h));
            if (!list.length) return -1;
            return addOwnPalette(freeName(String(name || 'From image').trim() || 'From image'), list);
        };
        function duplicatePalette(idx) {
            const colors = getPaletteColorsForIndex(idx);
            const i = addOwnPalette(freeName(getPaletteName(idx)), colors.length ? colors : [pickerHex()]);
            renameInline(i);
        }
        // Colours a look or preset brought, kept as a palette of their own.
        function keepUnsavedColors() {
            const colors = uniqueColors((savedColors || []).map(hexToFull));
            if (!colors.length) return;
            const idx = addOwnPalette(freeName('Look colours'), colors);
            renameInline(idx);
        }
        function renamePalette(idx, newName) {
            const p = curatedPalettes[idx];
            const name = String(newName || '').trim();
            if (!p || !name || name === p.name) return true;
            if (nameTaken(name, idx)) { flashPaletteStatus('That name is taken', true); return false; }
            const oldKey = userPaletteKey(idx);
            const colors = getPaletteColorsForIndex(idx);
            const custom = window.customPalettes.find(cp => cp.name === p.name);
            if (custom) {
                custom.name = name;
                p.name = name;
            } else {
                // A built-in renamed becomes your own palette; the original
                // name joins the deleted built-ins so it doesn't come back twice.
                if (!window.deletedDefaultPalettes.includes(p.name)) window.deletedDefaultPalettes.push(p.name);
                curatedPalettes[idx] = { name, colors: colors.slice() };
                window.customPalettes.push({ name, colors: colors.slice() });
            }
            const up = window.userPalettes || {};
            if (up[oldKey]) { up['name:' + name] = up[oldKey]; delete up[oldKey]; }
            persistPalettes();
            refreshPaletteCarousel();
            renderPalettePreview(currentPaletteIndex);
            return true;
        }
        // The palette's name becomes a text field where it shows: in the open
        // list, or in the dropdown when it is the palette in use. Enter keeps
        // it, Escape leaves the name as it was, a click elsewhere keeps it.
        function renameInline(idx) {
            const p = curatedPalettes[idx];
            if (!p) return;
            let nameEl = null;
            if (paletteListEl) {
                renderPaletteList();
                nameEl = paletteListEl.querySelector('.palette-option[data-index="' + idx + '"] .palette-option-name');
            }
            if (!nameEl && idx === currentPaletteIndex) {
                refreshPaletteCarousel();
                nameEl = document.querySelector('#paletteSelect .palette-select-name');
            }
            if (!nameEl) {
                openPaletteList();
                nameEl = paletteListEl && paletteListEl.querySelector('.palette-option[data-index="' + idx + '"] .palette-option-name');
            }
            if (!nameEl) return;
            const owner = nameEl.closest('.palette-option, .palette-select-trigger');
            if (owner) owner.classList.add('editing');
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'palette-name-input';
            input.value = p.name;
            input.setAttribute('aria-label', 'Palette name');
            nameEl.innerHTML = '';
            nameEl.appendChild(input);
            let done = false;
            const finish = (keep) => {
                if (done) return;
                done = true;
                if (keep) renamePalette(idx, input.value);   // a taken name says so and keeps the old one
                refreshPaletteCarousel();
            };
            input.addEventListener('pointerdown', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); finish(true); }
                else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
            });
            input.addEventListener('blur', () => finish(true));
            input.focus();
            input.select();
        }
        function resetPaletteColors(idx) {
            const up = window.userPalettes || {};
            delete up[userPaletteKey(idx)];
            delete up[String(idx)];
            persistPalettes();
            if (idx === currentPaletteIndex) applyPalette(idx);
            else renderPalettePreview(currentPaletteIndex);
        }

        // ── The palettes: one dropdown (2026-10-08) ──
        // They were a wrapping row of tags with "+ New" trailing after the
        // last one, every tag as heavy as the buttons around it. Now the
        // palette in use is a dropdown; its list shows each palette as its
        // name over its colours, with New palette at the top of the list.
        // Right-click a palette (or the dropdown) to rename, duplicate,
        // reset or delete it; drag one in the list to move it. The trigger
        // and the options are divs, not buttons: they look like a field and
        // a list, and the button system (01-buttons) owns button colours.
        let paletteListEl = null;
        function paletteTrigger() { return document.getElementById('paletteSelect'); }

        function refreshPaletteCarousel() {
            const carousel = document.getElementById('paletteCarousel');
            if (!carousel) return;
            carousel.innerHTML = '';
            const unsaved = trayIsUnsaved();
            const trig = document.createElement('div');
            trig.id = 'paletteSelect';
            trig.className = 'palette-select-trigger' + (paletteListEl ? ' open' : '');
            trig.tabIndex = 0;
            trig.setAttribute('role', 'combobox');
            trig.setAttribute('aria-haspopup', 'listbox');
            trig.setAttribute('aria-expanded', paletteListEl ? 'true' : 'false');
            trig.setAttribute('aria-label', 'Palette');
            const name = document.createElement('span');
            name.className = 'palette-select-name';
            name.textContent = unsaved ? 'Unsaved colours' : getPaletteName(currentPaletteIndex);
            const chev = document.createElement('span');
            chev.className = 'palette-select-chev';
            chev.setAttribute('aria-hidden', 'true');
            trig.appendChild(name);
            trig.appendChild(chev);
            trig.title = 'Your palettes, and New palette. Ctrl+Shift+← → switches palette; right-click to rename, duplicate or delete this one.';
            trig.addEventListener('click', () => {
                if (trig.classList.contains('editing')) return;
                if (paletteListEl) closePaletteList(); else openPaletteList();
            });
            trig.addEventListener('keydown', (e) => {
                if (trig.classList.contains('editing')) return;
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (!paletteListEl) openPaletteList();
                }
            });
            trig.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!unsaved) openPaletteMenu(currentPaletteIndex, getPaletteName(currentPaletteIndex), e.clientX, e.clientY);
            });
            carousel.appendChild(trig);
            if (paletteListEl) renderPaletteList();
        }

        function openPaletteList() {
            const trig = paletteTrigger();
            if (!trig || !trig.getBoundingClientRect().width) return;
            closePaletteMenu();
            if (paletteListEl) closePaletteList();
            const list = document.createElement('div');
            list.className = 'palette-list';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', 'Palettes');
            const grp = trig.closest('[data-group]');
            list.dataset.group = grp ? grp.dataset.group : 'core';
            // Hotkeys leave it alone (01a isTypingTarget): the arrows move here.
            list.setAttribute('data-owns-keys', '');
            document.body.appendChild(list);
            paletteListEl = list;
            trig.classList.add('open');
            trig.setAttribute('aria-expanded', 'true');
            renderPaletteList();
            placePaletteList();
            const act = list.querySelector('.palette-option.active') || list.querySelector('.palette-option');
            if (act) { act.focus({ preventScroll: true }); act.scrollIntoView({ block: 'nearest' }); }
            setTimeout(() => {
                if (paletteListEl !== list) return;
                document.addEventListener('pointerdown', onPaletteListOutside, true);
            }, 0);
            document.addEventListener('keydown', onPaletteListKey, true);
            window.addEventListener('resize', placePaletteList);
        }
        window.openPaletteList = openPaletteList;
        function closePaletteList(keepFocus) {
            const list = paletteListEl;
            if (!list) return;
            paletteListEl = null;
            document.removeEventListener('pointerdown', onPaletteListOutside, true);
            document.removeEventListener('keydown', onPaletteListKey, true);
            window.removeEventListener('resize', placePaletteList);
            const hadFocus = list.contains(document.activeElement);
            list.remove();
            const trig = paletteTrigger();
            if (trig) {
                trig.classList.remove('open');
                trig.setAttribute('aria-expanded', 'false');
                if (hadFocus && keepFocus !== false) trig.focus({ preventScroll: true });
            }
        }
        window.closePaletteList = closePaletteList;
        function placePaletteList() {
            const list = paletteListEl, trig = paletteTrigger();
            if (!list || !trig) return;
            const r = trig.getBoundingClientRect();
            if (!r.width) { closePaletteList(false); return; }
            const w = Math.max(r.width, 240);
            list.style.width = w + 'px';
            list.style.maxHeight = '';
            const want = list.scrollHeight;
            const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
            const down = below >= Math.min(want, 260) || below >= above;
            const room = Math.max(140, down ? below : above);
            const h = Math.min(want, room);
            list.style.maxHeight = room + 'px';
            list.style.top = (down ? r.bottom + 4 : r.top - 4 - h) + 'px';
            list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
        }
        function onPaletteListOutside(e) {
            const t = e.target;
            if (!paletteListEl) return;
            if (paletteListEl.contains(t)) return;
            const trig = paletteTrigger();
            if (trig && trig.contains(t)) return;
            // Its right-click menu, and the delete dialog it opens, belong to it.
            if (t.closest && t.closest('.palette-menu')) return;
            closePaletteList(false);
        }
        function onPaletteListKey(e) {
            const list = paletteListEl;
            if (!list) return;
            if (e.target && e.target.tagName === 'INPUT') return;   // renaming
            const items = Array.prototype.slice.call(list.querySelectorAll('.palette-new-btns button, .palette-option'));
            const at = items.indexOf(document.activeElement);
            const go = (i) => { const n = items[Math.max(0, Math.min(items.length - 1, i))]; if (n) { n.focus({ preventScroll: true }); n.scrollIntoView({ block: 'nearest' }); } };
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePaletteList(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); go(at < 0 ? 0 : at + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); go(at < 0 ? items.length - 1 : at - 1); }
            else if (e.key === 'Home') { e.preventDefault(); go(0); }
            else if (e.key === 'End') { e.preventDefault(); go(items.length - 1); }
            else if (e.key === 'Tab') { closePaletteList(false); }
        }
        function choosePalette(idx) {
            closePaletteList();
            applyPalette(idx);
        }
        function renderPaletteList() {
            const list = paletteListEl;
            if (!list) return;
            const keep = list.scrollTop;
            list.innerHTML = '';
            const unsaved = trayIsUnsaved();
            // New palette, first: where the colours come from (Procreate's
            // + offers Camera / File / Photos the same way).
            const PFI = window.PaletteFromImage;
            const newRow = document.createElement('div');
            newRow.className = 'palette-new-row';
            const cap = document.createElement('div');
            cap.className = 'palette-new-cap';
            cap.textContent = '+ New palette';
            newRow.appendChild(cap);
            const btns = document.createElement('div');
            btns.className = 'palette-new-btns btn-sm';
            [
                { id: 'paletteNewBtn', label: 'Brush colour', title: 'A new palette that starts with the brush colour', fn: newPalette },
                PFI ? { label: 'Image…', title: 'A new palette from a picture. You can also drop one on the Palettes section.', fn: () => PFI.pickFile() } : null,
                PFI ? { label: 'Canvas', title: 'A new palette from what you have painted', fn: () => PFI.openCanvas() } : null
            ].forEach((o) => {
                if (!o) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn--ghost';
                if (o.id) b.id = o.id;
                b.textContent = o.label;
                b.title = o.title;
                b.addEventListener('click', () => { closePaletteList(false); o.fn(); });
                btns.appendChild(b);
            });
            newRow.appendChild(btns);
            list.appendChild(newRow);
            curatedPalettes.forEach((p, idx) => {
                const on = idx === currentPaletteIndex && !unsaved;
                const opt = document.createElement('div');
                opt.className = 'palette-option' + (on ? ' active' : '');
                opt.dataset.index = String(idx);
                opt.tabIndex = -1;
                opt.setAttribute('role', 'option');
                opt.setAttribute('aria-selected', on ? 'true' : 'false');
                opt.title = p.name + '. Click to use it, drag to move it, right-click to rename, duplicate or delete it.';
                const nm = document.createElement('div');
                nm.className = 'palette-option-name';
                nm.textContent = p.name;
                const strip = document.createElement('div');
                strip.className = 'palette-option-strip';
                getPaletteColorsForIndex(idx).forEach((h) => {
                    const s = document.createElement('span');
                    s.style.background = h;
                    strip.appendChild(s);
                });
                opt.appendChild(nm);
                opt.appendChild(strip);
                opt.addEventListener('click', () => { if (!opt.classList.contains('editing')) choosePalette(idx); });
                opt.addEventListener('keydown', (e) => {
                    if (opt.classList.contains('editing')) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choosePalette(idx); }
                });
                opt.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openPaletteMenu(idx, p.name, e.clientX, e.clientY);
                });
                wireTagDrag(opt, idx);
                list.appendChild(opt);
            });
            list.scrollTop = keep;
        }

        function setPaletteColorsForIndex(index, colors) {
            const list = uniqueColors((colors || []).map(hexToFull));
            window.userPalettes[userPaletteKey(index)] = list;
            delete window.userPalettes[String(index)];   // a positional key moves to the name
            persistPalettes();
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

        // ── The palette you paint with: one row, edits save themselves ──
        // User test 3: "Save as New isn't intuitively positioned", "'Save
        // color' isn't good". There used to be two copies: a swatch tray (what
        // Palette mode painted) and the palette (what Update saved it into).
        // Now the row IS the palette: [+] adds the picker's colour (Shift+S),
        // right-click a colour to replace or remove it (Shift+X removes the
        // picker's), and every edit writes through. The tray stays only as the
        // internal mirror the colour readers use. Colours a look or preset
        // brought that match no palette show as "Unsaved colours · Keep".
        function pickerHex() {
            const cp = document.getElementById('colorPicker');
            return hexToFull(cp ? cp.value : '#FFFFFF');
        }
        function trayIsUnsaved() {
            const tray = Array.isArray(savedColors) ? savedColors : [];
            return tray.length > 0 && colorsKey(tray) !== colorsKey(getPaletteColorsForIndex(currentPaletteIndex));
        }
        window.paletteIsUnsaved = trayIsUnsaved;
        function flashPaletteStatus(text, bad) {
            const status = document.getElementById('paletteImportStatus');
            if (!status) return;
            status.textContent = text;
            status.style.color = bad ? '#ff6b6b' : '';
            status.classList.add('show');
            clearTimeout(status._t);
            status._t = setTimeout(() => { status.classList.remove('show'); status.style.color = ''; status.textContent = ''; }, 1600);
        }
        function editActiveColors(fn) {
            if (trayIsUnsaved()) {
                const next = fn(uniqueColors(savedColors.map(hexToFull)));
                if (next && typeof colorStorage !== 'undefined') colorStorage.save(next);
            } else {
                const next = fn(getPaletteColorsForIndex(currentPaletteIndex));
                if (next) setPaletteColorsForIndex(currentPaletteIndex, next);
            }
            if (typeof window.pinArmSteps === 'function') window.pinArmSteps();
        }
        // Feedback about the colour row goes UNDER the row, next to the
        // [+], and rings the colour it is about. It went to the status by the
        // "Palettes" heading, well away from the [+], and pushed the key
        // badges onto a second line. When the section isn't on screen
        // (Shift+S with the sidebar shut) it falls back to a toast.
        function activeColourList() {
            return trayIsUnsaved() ? uniqueColors(savedColors.map(hexToFull)) : getPaletteColorsForIndex(currentPaletteIndex);
        }
        window.paletteActiveColours = activeColourList;
        function ringPaletteChip(hex) {
            const h = hexToFull(hex);
            document.querySelectorAll('#palettePreview .palette-chip-wrap').forEach((w) => {
                const on = w.dataset.hex === h;
                w.classList.toggle('is-match', on);
            });
        }
        window.ringPaletteChip = ringPaletteChip;
        function paletteNote(text, hex) {
            const el = document.getElementById('paletteNote');
            const row = document.getElementById('palettePreview');
            ringPaletteChip(hex || '');
            if (!el || !row || !row.offsetParent) {
                if (typeof window.showToast === 'function') window.showToast(text);
                else flashPaletteStatus(text, true);
            } else {
                el.textContent = text;
                el.hidden = false;
            }
            clearTimeout(paletteNote._t);
            paletteNote._t = setTimeout(() => {
                if (el) { el.hidden = true; el.textContent = ''; }
                if (!window.ColourPicker || !window.ColourPicker.inlineOpen()) ringPaletteChip('');
            }, 2600);
        }
        window.paletteNote = paletteNote;
        window.addColorToPalette = function (hex) {
            const h = hexToFull(hex || pickerHex());
            let added = false;
            editActiveColors((list) => {
                if (list.includes(h)) { paletteNote('Already in this palette', h); return null; }
                added = true;
                return list.concat([h]);
            });
            if (added) {
                const w = document.querySelector('#palettePreview .palette-chip-wrap[data-hex="' + h + '"]');
                if (w) { w.classList.add('is-added'); setTimeout(() => w.classList.remove('is-added'), 900); }
            }
            return added;
        };
        window.removeColorFromPalette = function (hex) {
            const h = hexToFull(hex || pickerHex());
            editActiveColors((list) => {
                if (!list.includes(h)) { paletteNote('That colour isn\'t in this palette'); return null; }
                return list.filter(c => c !== h);
            });
        };
        window.replacePaletteColour = function (oldHex, newHex) { replacePaletteColor(oldHex, newHex); };
        function replacePaletteColor(oldHex, newHex) {
            const o = hexToFull(oldHex), n = hexToFull(newHex);
            editActiveColors((list) => list.includes(n) ? list.filter(c => c !== o) : list.map(c => c === o ? n : c));
        }
        function removePaletteColor(index, hex) {
            const list = getPaletteColorsForIndex(index);
            const next = list.filter(c => c.toUpperCase() !== hexToFull(hex).toUpperCase());
            setPaletteColorsForIndex(index, next);
        }

        // ── Drag to reorder (user test 3: "drag to reorder") ──
        // HTML5 drags with our own types: the file-drop guard (32) only acts
        // on drags carrying Files. A line shows where it will land.
        const COLOUR_DRAG = 'application/x-swirl-palette-colour';
        const PALETTE_DRAG = 'application/x-swirl-palette';
        function dropSide(e, el) {
            const r = el.getBoundingClientRect();
            // The palette list stacks its palettes: above or below.
            if (el.classList.contains('palette-option')) return (e.clientY - r.top) < r.height / 2 ? 'before' : 'after';
            return (e.clientX - r.left) < r.width / 2 ? 'before' : 'after';
        }
        function clearDropMarks(root) {
            if (!root) return;
            root.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(n => n.classList.remove('drop-before', 'drop-after', 'dragging'));
        }
        function hasType(e, t) {
            const ts = e.dataTransfer && e.dataTransfer.types;
            return !!ts && [].indexOf.call(ts, t) >= 0;
        }
        let dragHex = null;
        function wireChipDrag(wrap, hex) {
            wrap.draggable = true;
            wrap.addEventListener('dragstart', (e) => {
                dragHex = hex;
                e.dataTransfer.setData(COLOUR_DRAG, hex);
                e.dataTransfer.effectAllowed = 'move';
                wrap.classList.add('dragging');
            });
            wrap.addEventListener('dragend', () => { dragHex = null; clearDropMarks(wrap.parentElement); });
            wrap.addEventListener('dragover', (e) => {
                if (!hasType(e, COLOUR_DRAG)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const side = dropSide(e, wrap);
                wrap.classList.toggle('drop-before', side === 'before');
                wrap.classList.toggle('drop-after', side === 'after');
            });
            wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-before', 'drop-after'));
            wrap.addEventListener('drop', (e) => {
                if (!hasType(e, COLOUR_DRAG)) return;
                e.preventDefault();
                const from = e.dataTransfer.getData(COLOUR_DRAG) || dragHex;
                const side = dropSide(e, wrap);
                clearDropMarks(wrap.parentElement);
                moveColour(from, hex, side);
            });
        }
        // The colour in the picker keeps its place in the step order: the
        // next stroke paints what it would have painted.
        function moveColour(fromHex, toHex, side) {
            const f = hexToFull(fromHex), t = hexToFull(toHex);
            if (!f || f === t) return;
            const inPicker = pickerHex();
            editActiveColors((list) => {
                if (!list.includes(f) || !list.includes(t)) return null;
                const next = list.filter(c => c !== f);
                let at = next.indexOf(t) + (side === 'after' ? 1 : 0);
                next.splice(at, 0, f);
                const k = next.indexOf(inPicker);
                if (k >= 0) paletteStepIndex = k;
                return next;
            });
            updatePaletteStepIndicator();
        }
        let dragPaletteIdx = -1;
        function wireTagDrag(tag, idx) {
            tag.draggable = true;
            tag.addEventListener('dragstart', (e) => {
                dragPaletteIdx = idx;
                e.dataTransfer.setData(PALETTE_DRAG, String(idx));
                e.dataTransfer.effectAllowed = 'move';
                tag.classList.add('dragging');
            });
            tag.addEventListener('dragend', () => { dragPaletteIdx = -1; clearDropMarks(tag.parentElement); });
            tag.addEventListener('dragover', (e) => {
                if (!hasType(e, PALETTE_DRAG)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const side = dropSide(e, tag);
                tag.classList.toggle('drop-before', side === 'before');
                tag.classList.toggle('drop-after', side === 'after');
            });
            tag.addEventListener('dragleave', () => tag.classList.remove('drop-before', 'drop-after'));
            tag.addEventListener('drop', (e) => {
                if (!hasType(e, PALETTE_DRAG)) return;
                e.preventDefault();
                const raw = e.dataTransfer.getData(PALETTE_DRAG);
                const from = raw !== '' ? parseInt(raw, 10) : dragPaletteIdx;
                const side = dropSide(e, tag);
                clearDropMarks(tag.parentElement);
                movePalette(from, idx, side);
            });
        }
        // Edits are keyed by name, so moving a palette moves nothing else.
        function movePalette(from, to, side) {
            if (!(from >= 0) || from === to || !curatedPalettes[from] || !curatedPalettes[to]) return;
            const active = curatedPalettes[currentPaletteIndex];
            const target = curatedPalettes[to];
            const [p] = curatedPalettes.splice(from, 1);
            let at = curatedPalettes.indexOf(target) + (side === 'after' ? 1 : 0);
            curatedPalettes.splice(at, 0, p);
            currentPaletteIndex = Math.max(0, curatedPalettes.indexOf(active));
            try { localStorage.setItem('curatedPaletteIndex', String(currentPaletteIndex)); } catch (_) {}
            persistPalettes();
            refreshPaletteCarousel();
        }
        window.movePalette = movePalette;
        window.movePaletteColour = moveColour;

        // The dropdown names the palette now; this line only speaks up for
        // colours a look or preset brought that match none of your palettes.
        function renderActiveHead(unsaved) {
            const head = document.getElementById('paletteActiveHead');
            if (!head) return;
            head.innerHTML = '';
            if (unsaved) {
                const name = document.createElement('span');
                name.className = 'palette-active-name';
                name.textContent = 'These came with a look.';
                head.appendChild(name);
                name.title = 'These came with a look or preset and match none of your palettes';
                const keep = document.createElement('button');
                keep.type = 'button';
                keep.className = 'palette-keep btn--ghost';
                keep.textContent = 'Keep';
                keep.title = 'Keep these colours as a palette of your own';
                keep.addEventListener('click', keepUnsavedColors);
                head.appendChild(keep);
            }
        }

        function renderPalettePreview(index) {
            const el = document.getElementById('palettePreview');
            if (!el) return;
            const unsaved = trayIsUnsaved();
            const list = unsaved ? uniqueColors(savedColors.map(hexToFull)) : getPaletteColorsForIndex(currentPaletteIndex);
            renderActiveHead(unsaved);
            el.innerHTML = '';
            list.forEach(hex => {
                const wrap = document.createElement('div');
                wrap.className = 'palette-chip-wrap';
                wrap.dataset.hex = hexToFull(hex);
                const chip = document.createElement('div');
                chip.className = 'palette-chip';
                chip.style.backgroundColor = hex;
                chip.title = hex + '. Click to paint with it, double-click to change it, drag to move it, right-click for more.';
                chip.onclick = () => window.setColor(hex);
                chip.ondblclick = () => { if (window.ColourPicker) window.ColourPicker.openInline({ mode: 'edit', hex: hex }); };
                chip.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openChipMenu(hex, e.clientX, e.clientY);
                });
                wrap.appendChild(chip);
                wireChipDrag(wrap, hex);
                el.appendChild(wrap);
            });
            // [+] opens a picker right here, starting from the brush colour,
            // so the colour to add can be chosen on the spot (Shift+S still
            // adds the brush colour as it is).
            const add = document.createElement('button');
            add.type = 'button';
            add.id = 'paletteAddChip';
            add.className = 'palette-add';   // a dashed slot on the panel's plate
            add.textContent = '+';
            add.title = 'Add a colour to this palette. Shift+S adds the brush colour as it is.';
            add.addEventListener('click', () => {
                if (window.ColourPicker && window.ColourPicker.openInline({ mode: 'add' })) return;
                window.addColorToPalette();
            });
            el.appendChild(add);
            updatePaletteStepIndicator();
            if (window.ColourPicker) window.ColourPicker.onPaletteRender();
        }

        // The colour the next stroke paints is marked IN the row (it was a
        // separate "Next ■ 2/5" line under it): in Palette mode the next
        // palette colour, in One mode the brush colour when the palette has
        // it. Random's next colour is a surprise, so nothing is marked.
        // Everything that moves the brush colour calls this (05g, 05n, 12).
        function updatePaletteStepIndicator() {
            const el = document.getElementById('paletteStepIndicator');
            if (el) { el.style.display = 'none'; el.innerHTML = ''; }
            const cp = document.getElementById('colorPicker');
            const a0 = (window.multiArmColors || [])[0];
            const random = a0 ? a0.mode === 'random' : !!document.getElementById('randomColor')?.checked;
            const now = cp && !random ? hexToFull(cp.value) : '';
            document.querySelectorAll('#palettePreview .palette-chip-wrap').forEach((w) => {
                const on = !!now && w.dataset.hex === now;
                w.classList.toggle('is-active', on);
                if (w.firstChild) {
                    if (on) w.firstChild.setAttribute('aria-current', 'true');
                    else w.firstChild.removeAttribute('aria-current');
                }
            });
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

        // opts.boot: the palette the app starts on. It selects the palette and
        // nothing else: no Palette mode, no picker colour. Picking a palette
        // by hand turns Palette mode on, and doing that at boot made Palette
        // win over the default Rnd whenever autoload was off, and put a
        // half-booted state under Ctrl+Z.
        function applyPalette(index, opts) {
            const boot = !!(opts && opts.boot);
            const i = parseInt(index, 10);
            if (isNaN(i) || !curatedPalettes[i]) return;
            currentPaletteIndex = i;
            const list = getPaletteColorsForIndex(i);
            // paletteStepIndex is the colour IN the picker: the one the next
            // stroke paints (advance = increment, then load; 05g/05n).
            paletteStepIndex = 0;
            // A preset, look link, Mutate card or room restore has already
            // put the snapshot's colour in the picker, and in Palette mode
            // that is the NEXT colour. Keep the counter on it, or the first
            // stroke paints it and the second skips colour 0.
            if (window.__brushColorRestoring) {
                const cpNow = document.getElementById('colorPicker');
                const k = cpNow ? list.indexOf(hexToFull(cpNow.value)) : -1;
                if (k >= 0) paletteStepIndex = k;
            }
            // The tray first: the step switch below fires 'change', and what it
            // runs reads the tray (getStepColorList). Written after, a palette
            // picked with the nav toggle off painted the PREVIOUS palette
            // (user test 3: "the color ignores the palette being active").
            const swatches = getCurrentPaletteHexList();
            if (typeof colorStorage !== 'undefined') {
                savedColors = swatches.slice();
                // A look opened from a link (js/50-look-links.js) selects its
                // palette live and must not rewrite the saved tray.
                if (!window.__lookLinkApplying) colorStorage.save(savedColors);
            }
            const cp = document.getElementById('colorPicker');
            // During a snapshot/preset/multiplayer-lock restore the brush colour
            // and step mode come FROM the snapshot and are already applied — the
            // palette must not overwrite them. Picking a palette by hand still
            // behaves exactly as before.
            if (cp && !window.__brushColorRestoring && !boot) {
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
            if (typeof window.pinArmSteps === 'function') window.pinArmSteps();   // step arms show the new palette now
            renderPalettePreview(i);
            refreshPaletteCarousel();
            // Quota exhaustion here must not abort the rest of the selection.
            try { localStorage.setItem('curatedPaletteIndex', String(i)); } catch (e) {}
            updatePaletteStepIndicator();
        }

        let pendingDeleteIndex = -1;
        
        window.showDeleteModal = function(idx, name) {
            closePaletteList(false);   // the list sits above the dialog
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
            // Its edits go with it (by name, read BEFORE the splice); positional
            // keys after it move down with their palettes.
            const up = window.userPalettes || {};
            delete up[userPaletteKey(pendingDeleteIndex)];
            delete up[String(pendingDeleteIndex)];
            Object.keys(up).filter(k => /^\d+$/.test(k) && +k > pendingDeleteIndex)
                .sort((a, b) => a - b)
                .forEach(k => { up[String(+k - 1)] = up[k]; delete up[k]; });
            const isDefault = defaultPalettes.some(dp => dp.name === palette.name);
            if (isDefault && !window.deletedDefaultPalettes.includes(palette.name)) {
                window.deletedDefaultPalettes.push(palette.name);
            }
            curatedPalettes.splice(pendingDeleteIndex, 1);
            const customIdx = window.customPalettes.findIndex(cp => cp.name === palette.name);
            if (customIdx >= 0) window.customPalettes.splice(customIdx, 1);
            if (currentPaletteIndex === pendingDeleteIndex) {
                currentPaletteIndex = Math.max(0, Math.min(currentPaletteIndex, curatedPalettes.length - 1));
                applyPalette(currentPaletteIndex);
            } else if (currentPaletteIndex > pendingDeleteIndex) {
                currentPaletteIndex--;
            }
            persistPalettes();
            refreshPaletteCarousel();
            hideDeleteModal();
        };
        
        function initPaletteUI() {
            restorePersistedPalettes();
            refreshPaletteCarousel();
            // Apply first palette on load if autoload is not enabled
            const autoload = window.settingsManager?.get('settings.autoload');
            if (!autoload && curatedPalettes.length > 0) {
                applyPalette(currentPaletteIndex || 0, { boot: true });
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
            }
            persistPalettes();
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
            applyPalette(next, { boot: true });
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
            persistPalettes();
            refreshPaletteCarousel();
        };

        // ── Drawing buffer vs CSS box (RENDER_SCALE, perf-max-tiers) ──────
        // The canvas ELEMENT always occupies exactly the wrapper's CSS box.
        // The drawing buffer may be larger: at RENDER_SCALE 2 we render four
        // output samples per displayed pixel and let the compositor box-filter
        // them down on present — supersampling, and the only anti-aliasing the
        // display pass (kaleido seams, collider edges, shading relief) can get,
        // because that pass is the one stage that runs per OUTPUT pixel.
        //
        // Everything downstream that maps between the two spaces must go
        // through a ratio, never assume 1:1:
        //   • getCanvasCoordinates (02-palettes) already divides by the
        //     bounding rect, so pointer mapping is correct for free.
        //   • the FBO settle in 05j MUST compare canvas.width against the
        //     SCALED target, or it rebuilds every framebuffer every frame.
        //   • hover-capture's drawImage source rect is in buffer px (04g).
        //   • the saved canvas size is the CSS box, not the buffer (12).
        // Clamped to MAX_TEXTURE_SIZE-ish sanity and to what the GPU will
        // actually allocate; PerfTiers.estimateVRAM() reports the cost.
        const RENDER_SCALE_MAX_LONG_SIDE = 16384;
        function renderScale() {
            const s = window.config && window.config.RENDER_SCALE;
            return (typeof s === 'number' && isFinite(s) && s > 0) ? s : 1;
        }
        // The drawing-buffer size for a given CSS box. Exported so every other
        // module derives the same number instead of re-deriving the rule.
        function computeRenderSize(cssW, cssH) {
            const sc = renderScale();
            let w = Math.max(1, Math.round(cssW * sc));
            let h = Math.max(1, Math.round(cssH * sc));
            const long = Math.max(w, h);
            if (long > RENDER_SCALE_MAX_LONG_SIDE) {
                const k = RENDER_SCALE_MAX_LONG_SIDE / long;
                w = Math.max(1, Math.round(w * k));
                h = Math.max(1, Math.round(h * k));
            }
            return { w, h, scale: sc };
        }
        window.computeRenderSize = computeRenderSize;
        window.getRenderScale = renderScale;

        // Console/harness entry point: set the factor and force one rebuild.
        window.setRenderScale = function (v) {
            const n = Number(v);
            if (!isFinite(n) || n <= 0) return renderScale();
            window.config.RENDER_SCALE = Math.max(0.5, Math.min(4, n));
            updateCanvasSize();
            return window.config.RENDER_SCALE;
        };

        function updateCanvasSize() {
            const newWidth = canvasWrapper.clientWidth;
            const newHeight = canvasWrapper.clientHeight;
            const r = computeRenderSize(newWidth, newHeight);

            // Set canvas resolution (internal pixels) — the SUPERSAMPLED buffer
            canvas.width = r.w;
            canvas.height = r.h;

            // Also set CSS size explicitly (fixes scaling issues). This is what
            // keeps the element the same size on screen no matter the factor.
            canvas.style.width = newWidth + 'px';
            canvas.style.height = newHeight + 'px';

            // The ratio too (62-canvas-readout names it: 9:16, 3:2, 1.41:1),
            // so a handle drag can land on the shape the export needs.
            const ratio = window.CanvasReadout ? ' · ' + window.CanvasReadout.ratioLabel(newWidth, newHeight) : '';
            sizeDisplay.textContent = r.scale === 1
                ? `${newWidth} × ${newHeight}${ratio}`
                : `${newWidth} × ${newHeight} (${r.w}×${r.h})${ratio}`;

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
        window.canvasHasPinnedSize = hasPinnedCanvasSize;

        // Place the canvas-wrapper so it is ALWAYS fully inside the available
        // canvas area, at any window size. opts.initial = launch (restore saved
        // size or fill the area); opts.fill = force-fill the area; otherwise
        // keep the current size and just re-clamp + re-center.
        const CANVAS_MARGIN = 24;   // breathing room; also clears the -12px resize handles
        const CANVAS_MIN = 200;

        // The box the canvas is allowed to occupy, in canvas-area coordinates.
        // The bottom nav (quality underbar) is position:fixed OVER the bottom of
        // the area, so the usable height stops at its top edge — measured, never
        // assumed, because the nav's height moves with --ui-scale.
        function canvasUsableBox() {
            const areaRect = canvasArea.getBoundingClientRect();
            let height = areaRect.height;
            const underbar = document.getElementById('quality-underbar');
            if (underbar) {
                const ubcs = getComputedStyle(underbar);
                if (ubcs.display !== 'none' && ubcs.visibility !== 'hidden') {
                    const ubTop = underbar.getBoundingClientRect().top - areaRect.top;
                    if (ubTop > 0) height = Math.min(height, ubTop);
                }
            }
            return {
                width: areaRect.width,
                height: height,
                maxW: Math.max(CANVAS_MIN, areaRect.width - CANVAS_MARGIN * 2),
                maxH: Math.max(CANVAS_MIN, height - CANVAS_MARGIN * 2)
            };
        }
        window.canvasUsableBox = canvasUsableBox;

        function initializeCanvasPosition(opts) {
            opts = opts || {};
            const areaRect = canvasArea.getBoundingClientRect();

            // Area not laid out yet (pre-paint / mid-transition): retry next frame
            // so we never measure a zero-size area and shrink the canvas to nothing.
            if (areaRect.width < CANVAS_MIN || areaRect.height < CANVAS_MIN) {
                requestAnimationFrame(() => initializeCanvasPosition(opts));
                return;
            }

            const box = canvasUsableBox();
            const maxW = box.maxW;
            const maxH = box.maxH;

            // A stream format owns the ASPECT, not the pixel size — so fit its
            // ratio into the usable box here rather than trusting whatever
            // 21-focus-mode last wrote. Skipping the clamp for formats is what
            // let a box sized for one window keep hanging past the sidebar and
            // under the bottom nav on a smaller one, with nothing left to
            // correct it (measured 2026-08-22: 1:1 Square sat 16-20px under the
            // nav at 1366x768, 1600x900 and 1920x1080, and stayed there).
            const streamFormat = window.focusMode &&
                typeof window.focusMode.getActiveFormat === 'function' &&
                window.focusMode.getActiveFormat();

            let w = canvasWrapper.offsetWidth;
            let h = canvasWrapper.offsetHeight;

            if (streamFormat) {
                const ratio = streamFormat.ratio || (streamFormat.w / streamFormat.h) || 1;
                w = Math.min(maxW, streamFormat.w);
                h = w / ratio;
                if (h > maxH) { h = maxH; w = h * ratio; }
            } else if (opts.initial) {
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
            w = Math.round(Math.min(Math.max(w, CANVAS_MIN), maxW));
            h = Math.round(Math.min(Math.max(h, CANVAS_MIN), maxH));
            canvasWrapper.style.width  = w + 'px';
            canvasWrapper.style.height = h + 'px';

            // Center against what actually RENDERED, not against what we asked
            // for. A stylesheet max-width/max-height can shrink the box after
            // the write, and centering the REQUESTED size then pushes the frame
            // off to one side — the other half of the same bug.
            w = canvasWrapper.offsetWidth;
            h = canvasWrapper.offsetHeight;

            // Center, then clamp the position so the box stays fully inside the
            // area with at least CANVAS_MARGIN on every edge.
            const left = Math.max(CANVAS_MARGIN, Math.min((box.width  - w) / 2, box.width  - w - CANVAS_MARGIN));
            const top  = Math.max(CANVAS_MARGIN, Math.min((box.height - h) / 2, box.height - h - CANVAS_MARGIN));
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

        // The one place that decides whether the frame fits. Every other writer
        // of the wrapper's geometry — a restored session (12-save-load), undo
        // (05n), a stream format (21-focus-mode) — hands it back here when it is
        // done, so a rect saved under one window size cannot survive into a
        // smaller one.
        window.fitCanvasIntoArea = initializeCanvasPosition;

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
