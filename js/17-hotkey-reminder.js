/**
 * Hotkey caps (design handoff Task 9)
 *
 * Replaces the old floating top-right panel. Two mechanisms:
 *  1. IN-PLACE CAPS: control rows/cells carry a small key cap in their
 *     right margin, always visible at rest. Holding a qualified modifier
 *     lights the caps that combo reaches (#fff on accent) and dims rows
 *     it doesn't reach to 0.35 — a binding appears beside its control.
 *     Rows with no binding reserve an EMPTY cap slot (transparent
 *     border) so nothing reflows or misaligns.
 *  2. RULES: Shift alone NEVER triggers anything (it is a live painting
 *     modifier); a combo must be held 250ms before anything shows; the
 *     16-chip default group is gone — F1 opens the full reference.
 *
 * REMOVED 2026-08-17: the appended reminder row (#hotkeyReminder), a 38px
 * strip-chrome bar for bindings with no visible control (undo/redo). It sat
 * in normal flow, so every Ctrl hold pushed the canvas down and back up
 * again. Its "F1 — ALL HOTKEYS" pill was also the only VISIBLE way into the
 * hotkey reference on desktop — F1 and Shift+? are now keyboard-only there
 * (mobile keeps 13-mobile-mode's ? button). Worth replacing when the way
 * hotkeys are surfaced gets its rethink.
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
            // The quality underbar adopts some selects (Image Sharpness /
            // Motion Detail) as hidden state-holders — the visible control
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
    // NOTE: no caps in the mixer strip. At strip scale they render ~8px
    // ("⌃⌥Scr"), which is unreadable glyph soup, and they steal the width
    // the channel labels need. Strip bindings live in the appended row and
    // the F1 modal; in-place caps are a sidebar affordance.
    var CAPS = [
        { keys: '⇧S',     mod: '',           title: 'Shift+S — save current colour',      where: colorActionBtn(0) },
        { keys: '⇧X',     mod: '',           title: 'Shift+X — clear saved colours',      where: colorActionBtn(1) },
        { keys: '⌃←→',    mod: 'ctrl',       title: 'Ctrl+← / → — cycle palette',         where: paletteRow() },
        { keys: 'N',      mod: '',           title: 'N — next colour (Shift: previous)',  where: paletteRow() },
        { keys: 'C',      mod: '',           title: 'Toggle brush cursor',                where: checkboxRow('cursorToggle') },
        { keys: 'H',      mod: '',           title: 'Toggle canvas border & handles',     where: checkboxRow('showCanvasHandles') },
        { keys: 'L',      mod: '',           title: 'Lock canvas borders',                where: checkboxRow('lockCanvasBorders') },
        { keys: 'F',      mod: '',           title: 'Toggle focus mode',                  where: checkboxRow('focusModeToggle') },
        { keys: 'F11',    mod: '',           title: 'F11 — toggle borderless fullscreen', where: groupLabel('windowMode') },
        { keys: '⌥↑↓',    mod: 'alt',        title: 'Alt+↑ / ↓ — image sharpness',        where: groupLabel('visualResolution') },
        { keys: '⌥⇧↑↓',   mod: 'altshift',   title: 'Alt+Shift+↑ / ↓ — motion detail',    where: groupLabel('physicsResolution') },
        { keys: 'M',      mod: '',           title: 'M — mutate',                         where: idEl('mutationGenerate') }
    ];
    // The caps shipped with macOS modifier glyphs (⌃⌥⇧) on what is mostly a
    // Windows app — glyph soup to anyone who never used a Mac. Everywhere
    // else in this file already speaks words (the entry titles), so expand
    // the glyphs unless we're actually on a Mac.
    if (!/Mac/i.test(navigator.platform || '')) {
        CAPS.forEach(function (c) {
            c.keys = c.keys
                .replace(/⌃/g, 'Ctrl+')
                .replace(/⌥/g, 'Alt+')
                .replace(/⇧/g, 'Shift+');
        });
    }

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
            '#sidebar-right .control-group > label');
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
