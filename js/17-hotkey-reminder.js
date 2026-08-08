/**
 * Hotkey caps + appended reminder row (design handoff Task 9)
 *
 * Replaces the old floating top-right panel. Three mechanisms:
 *  1. IN-PLACE CAPS: control rows/cells carry a small key cap in their
 *     right margin, always visible at rest. Holding a qualified modifier
 *     lights the caps that combo reaches (#fff on accent) and dims rows
 *     it doesn't reach to 0.35 — a binding appears beside its control.
 *     Rows with no binding reserve an EMPTY cap slot (transparent
 *     border) so nothing reflows or misaligns.
 *  2. APPENDED ROW: bindings with no visible control (undo/redo) get one
 *     38px row in strip chrome inserted into normal flow under the mixer
 *     strip — it pushes the canvas down rather than covering anything.
 *  3. RULES: Shift alone NEVER triggers anything (it is a live painting
 *     modifier); a combo must be held 250ms before anything shows; the
 *     16-chip default group is gone — F1 opens the full reference.
 *
 * Uses instant display toggling (no CSS transitions) to avoid
 * compositor layer disruption of the WebGL canvas in Electron.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        // The strip + sidebar build ~800ms after DCL (20-mixer-layout's
        // splash delay), and every cap target lives inside them. The bare
        // container ids appear BEFORE their content, so poll for actual
        // content (a strip header + sidebar rows) and require the row count
        // to hold steady across two ticks before binding. Give up after 15s
        // and bind whatever exists (degraded but functional).
        var waited = 0, lastCount = -1;
        var poll = setInterval(function () {
            // A hidden tab parks the rAF-gated UI build entirely — don't
            // burn the give-up budget while nothing can possibly build.
            if (!document.hidden) waited += 150;
            var header = document.querySelector('#mixer-strip .ch-header');
            var labels = document.querySelectorAll('#sidebar-right .control-group > label').length;
            var ready = header && labels > 0 && labels === lastCount;
            lastCount = labels;
            if (ready || waited >= 15000) {
                clearInterval(poll);
                init();
            }
        }, 150);
    });

    // ── Resolvers (run at init, after the strip is built) ──────────────
    function idEl(id) {
        return function () { return document.getElementById(id); };
    }
    function sel(s) {
        return function () { return document.querySelector(s); };
    }
    function stripHeader(sliderId) {
        return function () {
            var el = document.getElementById(sliderId);
            var ch = el && el.closest('.mixer-channel');
            return ch ? ch.querySelector('.ch-header') : null;
        };
    }
    function checkboxRow(id) {
        return function () {
            var el = document.getElementById(id);
            return el ? el.closest('.control-group') : null;
        };
    }
    function groupLabel(id) {
        return function () {
            var el = document.getElementById(id);
            if (!el) return null;
            // The quality underbar adopts some selects (Visual Quality /
            // Physics Detail) as hidden state-holders — the visible control
            // there is the custom dropdown button.
            var dd = el.closest('.qub-dd');
            if (dd) return dd.querySelector('.qub-dd-btn') || dd;
            var g = el.closest('.control-group');
            return g ? (g.querySelector('label') || g) : null;
        };
    }
    function colorActionBtn(index) {
        return function () {
            var btns = document.querySelectorAll('.color-actions button');
            return btns[index] || null;
        };
    }
    function paletteRow() {
        return function () {
            // NEVER return the carousel itself: refreshPaletteCarousel()
            // wipes its innerHTML on every palette change, which would
            // destroy the caps. The wrapper's "Palette" label is stable.
            var c = document.getElementById('paletteCarousel');
            if (!c) return null;
            var wrap = c.parentElement;
            var label = wrap ? wrap.querySelector(':scope > label') : null;
            if (label) return label;
            var g = c.closest('.control-group');
            return g ? (g.querySelector('label') || g) : null;
        };
    }

    // ── Single source of truth for in-place caps ───────────────────────
    // mod: '' = plain key; 'ctrl'/'alt'/'ctrlshift'/'altshift'/'ctrlalt'
    // light up when that exact combo is held ≥250ms.
    var CAPS = [
        { keys: '[ ]',    mod: '',           title: 'Brush size − / +  (Shift: coarse)', where: stripHeader('brushSize') },
        { keys: '⌃⌥Scr',  mod: 'ctrlalt',    title: 'Ctrl+Alt+Scroll — vorticity',       where: stripHeader('curl') },
        { keys: '1–8',    mod: '',           title: 'Multi-brush arms',                   where: stripHeader('multiplier') },
        { keys: '⌃Scr',   mod: 'ctrl',       title: 'Ctrl+Scroll — density sustain',      where: stripHeader('densityDissipation') },
        { keys: '⌥⇧Scr',  mod: 'altshift',   title: 'Alt+Shift+Scroll — velocity sustain', where: stripHeader('velocityDissipation') },
        { keys: '⌃⇧Scr',  mod: 'ctrlshift',  title: 'Ctrl+Shift+Scroll — motion isolation', where: stripHeader('velocityInfluence') },
        // R/A caps live on the Color channel head — the ~31px segment cells
        // cannot hold label + cap without bleeding into the neighbour.
        { keys: 'R',      mod: '',           title: 'R — toggle random colours',          where: sel('.ch-color-head') },
        { keys: 'A',      mod: '',           title: 'A — toggle palette stepping',        where: sel('.ch-color-head') },
        { keys: '⇧S',     mod: '',           title: 'Shift+S — save current colour',      where: colorActionBtn(0) },
        { keys: '⇧X',     mod: '',           title: 'Shift+X — clear saved colours',      where: colorActionBtn(1) },
        { keys: '⌃←→',    mod: 'ctrl',       title: 'Ctrl+← / → — cycle palette',         where: paletteRow() },
        { keys: 'N',      mod: '',           title: 'N — next colour (Shift: previous)',  where: paletteRow() },
        { keys: 'C',      mod: '',           title: 'Toggle brush cursor',                where: checkboxRow('cursorToggle') },
        { keys: 'H',      mod: '',           title: 'Toggle canvas border & handles',     where: checkboxRow('showCanvasHandles') },
        { keys: 'L',      mod: '',           title: 'Lock canvas borders',                where: checkboxRow('lockCanvasBorders') },
        { keys: 'F',      mod: '',           title: 'Toggle focus mode',                  where: checkboxRow('focusModeToggle') },
        { keys: '⌥↑↓',    mod: 'alt',        title: 'Alt+↑ / ↓ — visual quality',         where: groupLabel('visualResolution') },
        { keys: '⌥⇧↑↓',   mod: 'altshift',   title: 'Alt+Shift+↑ / ↓ — physics detail',   where: groupLabel('physicsResolution') },
        { keys: 'M',      mod: '',           title: 'M — mutate',                         where: idEl('mutationGenerate') }
    ];

    // Appended-row content: bindings with NO visible control, keyed by the
    // exact combo. (Shift alone never triggers, so plain-Shift extras live
    // in the F1 modal only. Empty combos show no row at all.)
    var ROW_GROUPS = {
        ctrl:      [['Z', 'Undo'], ['Y', 'Redo']],
        ctrlshift: [['Z', 'Redo'], ['N', 'New Layer']]
    };
    var MOD_LABEL = {
        ctrl: 'Ctrl', ctrlshift: 'Ctrl+Shift', alt: 'Alt',
        altshift: 'Alt+Shift', ctrlalt: 'Ctrl+Alt', ctrlaltshift: 'Ctrl+Alt+Shift'
    };

    function init() {
        if (window.__hkCapsInit) return; // idempotent: one cap set only
        window.__hkCapsInit = true;

        var placed = []; // {capEl, mod, rowEl}

        function rowFor(target) {
            return target.closest('.control-group, .ch-header, .color-actions') || target;
        }
        function dimTargetFor(target) {
            // Strip cells dim as whole channels; sidebar rows dim as rows.
            return target.closest('.mixer-channel') || rowFor(target);
        }
        function makeCap(entry) {
            var target = entry.where();
            if (!target) return;
            var cap = document.createElement('span');
            cap.className = 'hk-cap';
            cap.textContent = entry.keys;
            if (entry.mod) cap.dataset.hkMod = entry.mod;
            if (entry.title) cap.title = entry.title;
            target.appendChild(cap);
            placed.push({ cap: cap, mod: entry.mod, row: dimTargetFor(target) });
        }
        CAPS.forEach(makeCap);

        // Empty reserved slots: rows without a binding keep the same right
        // margin so columns align and nothing reflows when a modifier lands.
        var slotHosts = document.querySelectorAll(
            '#sidebar-right .control-group > label, #mixer-strip .ch-header');
        for (var i = 0; i < slotHosts.length; i++) {
            var host = slotHosts[i];
            var row = host.closest('.control-group, .ch-header') || host;
            if (row.querySelector('.hk-cap')) continue;
            // Checkbox rows are inline flex rows — the slot right-aligns on
            // the row itself, not inside the inline label.
            if (row.classList && row.classList.contains('checkbox-group')) host = row;
            var slot = document.createElement('span');
            slot.className = 'hk-cap hk-cap-empty';
            host.appendChild(slot);
            placed.push({ cap: slot, mod: null, row: (host.closest('.mixer-channel') || row) });
        }

        // ── Appended row (pushes the canvas down, never covers it) ─────
        var bar = document.createElement('div');
        bar.id = 'hotkeyReminder';
        bar.className = 'hotkey-reminder';
        var modBlock = document.createElement('span');
        modBlock.className = 'hk-row-mod';
        var chipWrap = document.createElement('span');
        chipWrap.className = 'hk-row-chips';
        var f1 = document.createElement('span');
        f1.className = 'hk-row-f1';
        f1.textContent = 'F1 — ALL HOTKEYS';
        f1.title = 'Open the full hotkey reference';
        f1.addEventListener('click', function () {
            var ov = document.getElementById('hotkeyOverlay');
            if (ov) ov.style.display = 'flex';
        });
        bar.appendChild(modBlock);
        bar.appendChild(chipWrap);
        bar.appendChild(f1);

        // Anchor to the stable #main-area (body flow), NOT the strip's
        // current parent — mobile mode relocates the strip into the drawer,
        // which would strand the row inside the sidebar.
        var mainArea = document.getElementById('main-area');
        var strip = document.getElementById('mixer-strip');
        if (mainArea && mainArea.parentElement) {
            mainArea.parentElement.insertBefore(bar, mainArea);
        } else if (strip && strip.parentElement) {
            strip.parentElement.insertBefore(bar, strip.nextSibling);
        } else {
            document.body.insertBefore(bar, document.body.firstChild);
        }

        function fillRow(combo) {
            var group = ROW_GROUPS[combo];
            if (!group || !group.length) return false;
            modBlock.textContent = MOD_LABEL[combo] || combo;
            chipWrap.textContent = '';
            for (var i = 0; i < group.length; i++) {
                var chip = document.createElement('span');
                chip.className = 'hk-row-chip';
                var kbd = document.createElement('kbd');
                kbd.textContent = group[i][0];
                chip.appendChild(kbd);
                chip.appendChild(document.createTextNode(' ' + group[i][1]));
                chipWrap.appendChild(chip);
            }
            return true;
        }

        // ── Modifier tracking: capture phase, blur-safe ────────────────
        var shift = false, ctrl = false, alt = false;
        var live = null, holdTimer = null;

        function comboNow() {
            // Shift alone is a live painting modifier — never a trigger.
            if (!ctrl && !alt) return null;
            return (ctrl ? 'ctrl' : '') + (alt ? 'alt' : '') + (shift ? 'shift' : '');
        }

        function applyState(combo) {
            live = combo;
            var anyRowShown = combo ? fillRow(combo) : false;
            bar.classList.toggle('visible', !!anyRowShown);
            var anyLit = false;
            for (var i = 0; i < placed.length; i++) {
                var p = placed[i];
                var lit = !!combo && p.mod === combo;
                if (lit) anyLit = true;
                p.cap.classList.toggle('lit', lit);
            }
            // Dim rows the combo doesn't reach (a row is "reached" if any of
            // its caps is lit) — but only when the combo lights SOMETHING:
            // an unmapped combo (e.g. Ctrl+Alt+Shift) must not dim the whole
            // surface with nothing highlighted to explain why.
            var dimming = !!combo && anyLit;
            var reached = null;
            if (dimming) {
                reached = new Set();
                for (var j = 0; j < placed.length; j++) {
                    if (placed[j].cap.classList.contains('lit')) reached.add(placed[j].row);
                }
            }
            for (var k = 0; k < placed.length; k++) {
                var row = placed[k].row;
                row.classList.toggle('hk-dim', dimming && !reached.has(row));
            }
        }

        function onModsChanged() {
            var combo = comboNow();
            if (!combo) {
                if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
                if (live) applyState(null);
                return;
            }
            if (live) {
                if (combo !== live) applyState(combo);
                return;
            }
            if (!holdTimer) {
                // 250ms hold: a modifier used in passing produces no flash.
                holdTimer = setTimeout(function () {
                    holdTimer = null;
                    var c = comboNow();
                    if (c) applyState(c);
                }, 250);
            }
        }

        function onKey(e) {
            var s = e.shiftKey, c = e.ctrlKey || e.metaKey, a = e.altKey;
            if (s !== shift || c !== ctrl || a !== alt) {
                shift = s; ctrl = c; alt = a;
                onModsChanged();
            }
        }

        document.addEventListener('keydown', onKey, true);
        document.addEventListener('keyup', onKey, true);
        window.addEventListener('blur', function () {
            shift = ctrl = alt = false;
            onModsChanged();
        });
    }
})();
