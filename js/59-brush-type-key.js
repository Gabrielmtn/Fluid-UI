// js/59-brush-type-key.js — the ~ key steps the brush through the drawer's
// Paint Into row: Fluid → Pressure → Collider → Fluid. The switch is the
// drawer's own (20-mixer-layout.js, window.BrushType: the function its three
// buttons call), so a press and a click can never differ. This file owns the
// key, and the pill that says where it landed.
//
// It was Tab until 2026-10-15; Tab went back to moving keyboard focus (the
// skip menu, js/66). The key is matched by its place on the keyboard
// (e.code Backquote), so ~ and ` both step, Shift or not, and a layout that
// prints something else there (² on AZERTY, ^ on QWERTZ) still has it. Three
// kinds means going back is two presses, so there is no back key.
(function () {
    'use strict';

    var ORDER = ['fluid', 'pressure', 'collider'];
    var NAMES = { fluid: 'Fluid', pressure: 'Pressure', collider: 'Collider' };
    var SHOW_MS = 1400;

    // A press made while a stroke is down waits for the lift. Switching under
    // a live stroke would finish a dye stroke as a wall (or the reverse): its
    // press went one way, its dabs another, its undo and recording a third.
    var pending = null;
    var waiting = false;

    function strokeDown() { return !!(window.pointer && window.pointer.down); }

    function current() {
        return pending || window.BrushType.get();
    }

    function step(dir) {
        var i = ORDER.indexOf(current());
        // Painting a raster layer (Layers' paint button) is none of the three;
        // either way out of it lands on Fluid.
        var next = i < 0 ? 'fluid' : ORDER[(i + dir + ORDER.length) % ORDER.length];
        if (strokeDown()) {
            pending = next;
            waitForLift();
        } else {
            window.BrushType.set(next);
        }
        show(next, !!pending);
    }

    function waitForLift() {
        if (waiting) return;
        waiting = true;
        (function poll() {
            if (strokeDown()) { requestAnimationFrame(poll); return; }
            waiting = false;
            var t = pending;
            pending = null;
            if (t) window.BrushType.set(t);
            if (pill && !pill.hidden) show(t, false);
        })();
    }

    // ─── THE PILL ───────────────────────────────────────────────
    // All three names, the one you are on lit: a second press is then aimed,
    // not guessed. Same spot and ground as the hotkey toast (js/49).
    var pill = null, cells = {}, hint = null, hideTimer = 0;
    function show(t, later) {
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'brushTypePill';
            pill.setAttribute('role', 'status');
            var cap = document.createElement('span');
            cap.className = 'hk-cap';
            cap.textContent = '~';
            pill.appendChild(cap);
            ORDER.forEach(function (k) {
                var s = document.createElement('span');
                s.className = 'bt-name';
                s.textContent = NAMES[k];
                pill.appendChild(s);
                cells[k] = s;
            });
            hint = document.createElement('span');
            hint.className = 'bt-hint';
            hint.textContent = 'when you lift';
            pill.appendChild(hint);
            document.body.appendChild(pill);
        }
        ORDER.forEach(function (k) { cells[k].classList.toggle('on', k === t); });
        hint.hidden = !later;
        pill.hidden = false;
        var toast = document.getElementById('hkToast');
        if (toast) toast.hidden = true;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { pill.hidden = true; }, SHOW_MS);
    }

    // ─── THE KEY ────────────────────────────────────────────────
    function isBrushKey(e) {
        return e.code === 'Backquote' || e.key === '~' || e.key === '`';
    }

    function typing(t) {
        if (window.__isTypingTarget) return window.__isTypingTarget(t);
        var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(t && t.isContentEditable);
    }

    // A dialog or an editor that has its own brush has the keyboard.
    function keyboardElsewhere() {
        if (window.SkipMenu && window.SkipMenu.isOpen()) return true;
        if (window.DialogFocus.hasKeyboard()) return true;
        if (window.HotkeyBinds && window.HotkeyBinds.isActive()) return true;
        if (window.LayerTransform && window.LayerTransform.isOpen()) return true;
        var me = document.getElementById('maskEditorOverlay');
        return !!(me && me.style.display !== 'none');
    }

    // Document, bubble, like the app's other keys (05n, 58): a listening hotkey
    // picker (window capture, js/48) has already had the press.
    document.addEventListener('keydown', function (e) {
        if (!isBrushKey(e) || e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;   // AltGr arrives as Ctrl+Alt: a character, not this
        if (!window.BrushType) return;                    // drawer not built yet
        if (typing(e.target) || keyboardElsewhere()) return;
        e.preventDefault();
        if (e.repeat) return;                             // a held key must not strobe the brush
        step(1);
    });
})();
