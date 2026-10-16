// js/00b-dialog-focus.js — dialogs hold the keyboard.
//
// What every dialog owes a keyboard user, in one place: focus moves in when
// it opens, Tab and Shift+Tab go round its own controls and never out behind
// the scrim, Esc can close it, and focus goes back to what opened it when it
// closes. It also answers the question every app-wide hotkey asks first: is
// a dialog up? A key pressed at a question must not freeze, zoom or paste on
// the canvas behind it.
//
//   var hold = DialogFocus.hold(modal, { initial: okBtn, onEscape: cancel, fallback: trigger });
//   ...
//   hold.release();   // focus goes back (when the dialog was used from the keyboard)
//
// Dialogs can sit on dialogs (a confirm over Reset app): only the top one
// traps, and releasing it hands Tab back to the one under it.
//
// Popups (panels that drop from a trigger) get a lighter version, popup().
//
// window.DialogFocus = { hold(root, opts), popup(panel, trigger, opts), menu(m, trigger, close), hasKeyboard(), top(), lastInput() }
(function () {
    'use strict';

    var FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable=""], [contenteditable="true"]';
    var stack = [];
    var uid = 0;

    // ─── WHERE FOCUS HAS BEEN ───────────────────────────────────
    // The last few places focus went, with null for "the page" (focus left
    // to nothing). A dialog often takes focus in the same breath it opens,
    // so "what opened it" is the latest entry from before it, not
    // document.activeElement at hold time.
    var trail = [];
    function note(el) { trail.push(el); if (trail.length > 8) trail.shift(); }
    document.addEventListener('focusin', function (e) { note(e.target); }, true);
    document.addEventListener('focusout', function (e) { if (!e.relatedTarget) note(null); }, true);

    // Keyboard or pointer, whichever was used last. Focus goes back to the
    // opener only after a keyboard close: handed to a button after a mouse
    // click, it would take Space from Freeze (05n gives Space to a button
    // the pointer did not press).
    var lastInput = 'pointer';
    document.addEventListener('keydown', function () { lastInput = 'key'; }, true);
    document.addEventListener('pointerdown', function () { lastInput = 'pointer'; }, true);

    function usable(el) {
        return !!(el && el.isConnected && !el.disabled && el.getClientRects().length && el.focus
            && getComputedStyle(el).visibility !== 'hidden');   // a folded section's control can't take it
    }

    function focusables(root) {
        return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
            if (el.disabled || el.tabIndex < 0 || !el.getClientRects().length) return false;
            return getComputedStyle(el).visibility !== 'hidden';
        });
    }

    function top() { return stack.length ? stack[stack.length - 1] : null; }

    // ─── THE TRAP ───────────────────────────────────────────────
    function onKey(e) {
        var h = top();
        if (!h) return;
        if (e.key === 'Escape' && h.onEscape) {
            e.preventDefault();
            e.stopPropagation();
            h.onEscape(e);
            return;
        }
        if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
        // Ours: the skip menu (66) and the dialog's own handlers don't get it.
        e.preventDefault();
        e.stopPropagation();
        var list = focusables(h.root);
        if (!list.length) { try { h.root.focus({ preventScroll: true }); } catch (_) {} return; }
        var i = list.indexOf(document.activeElement), n = list.length;
        var next = i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + n) % n;
        try { list[next].focus({ preventScroll: true }); } catch (_) {}
    }

    // Focus that lands behind the top dialog by some other road (a script, a
    // click on the page through a scrim that lets it) comes back in. Another
    // modal shown over it that doesn't hold (the PhotoSafe warning) keeps it.
    function onFocusIn(e) {
        var h = top();
        if (!h || h.root.contains(e.target)) return;
        var other = e.target.closest && e.target.closest('[aria-modal="true"]');
        if (other && other !== h.root) return;
        var list = focusables(h.root);
        try { (list[0] || h.root).focus({ preventScroll: true }); } catch (_) {}
    }

    function listen(on) {
        var fn = on ? 'addEventListener' : 'removeEventListener';
        document[fn]('keydown', onKey, true);
        document[fn]('focusin', onFocusIn, true);
    }

    // ─── HOLD / RELEASE ─────────────────────────────────────────
    // opts: initial  — what takes focus (default: its first control)
    //       onEscape — Esc calls this (leave it out when the dialog has its own)
    //       fallback — focus goes here when the opener is gone (a popup that
    //                  closed to show the dialog)
    function hold(root, opts) {
        opts = opts || {};
        for (var k = 0; k < stack.length; k++) {
            if (stack[k].root === root) {          // shown again over itself: same hold, on top
                var again = stack.splice(k, 1)[0];
                if (opts.onEscape) again.onEscape = opts.onEscape;
                stack.push(again);
                focusIn(again, opts.initial);
                return again;
            }
        }
        if (!root.hasAttribute('role')) root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        if (!root.hasAttribute('aria-labelledby') && !root.hasAttribute('aria-label')) {
            var t = root.querySelector('.delete-modal-title, h1, h2, h3');
            if (t) {
                if (!t.id) t.id = 'dialogTitle' + (++uid);
                root.setAttribute('aria-labelledby', t.id);
            }
        }
        if (!root.hasAttribute('tabindex')) root.tabIndex = -1;

        var opener = null;
        for (var j = trail.length - 1; j >= 0; j--) {
            var el = trail[j];
            if (el && root.contains(el)) continue;
            opener = el;
            break;
        }
        var h = {
            root: root,
            opener: opener,
            fallback: opts.fallback || null,
            onEscape: opts.onEscape || null,
            released: false,
            release: function (restore) { release(h, restore); }
        };
        stack.push(h);
        if (stack.length === 1) listen(true);
        focusIn(h, opts.initial);
        return h;
    }

    function focusIn(h, initial) {
        var a = document.activeElement;
        if (!initial && a && h.root.contains(a) && a !== h.root) return;   // the dialog already chose
        var first = usable(initial) ? initial : (focusables(h.root)[0] || h.root);
        try { first.focus({ preventScroll: true }); } catch (_) {}
    }

    // restore === false: the answer moved focus on itself.
    function release(h, restore) {
        if (h.released) return;
        h.released = true;
        var i = stack.indexOf(h);
        if (i >= 0) stack.splice(i, 1);
        if (!stack.length) listen(false);
        var a = document.activeElement;
        var inside = a && h.root.contains(a);
        // Somewhere else already has focus (the answer opened a panel): leave it.
        if (a && a !== document.body && !inside) return;
        var back = null;
        if (restore !== false && lastInput === 'key') {
            back = usable(h.opener) ? h.opener : (usable(h.fallback) ? h.fallback : null);
        }
        var under = top();
        if (under && !(back && under.root.contains(back))) {
            back = focusables(under.root)[0] || under.root;    // a dialog still up under it
        }
        if (back) { try { back.focus({ preventScroll: true }); } catch (_) {} }
        else if (inside && a.blur) a.blur();
    }

    // ─── POPUPS ─────────────────────────────────────────────────
    // Lighter than a dialog: a panel that drops from a trigger (Presets,
    // More, a colour well's picker, the room menus) and lets you keep
    // painting. No trap. Opened from the keyboard, focus moves in (moved in
    // after a click, Space would press the first item instead of freezing).
    // Tab walking out of both the panel and its trigger closes it (opts.close);
    // focus going to nothing (a click on the canvas) is the panel's own
    // outside-press rule's to judge, and focus moving into a dialog the panel
    // opened (a delete confirm) doesn't count as leaving. Released with focus
    // inside, a keyboard user is handed back to the trigger.
    //
    //   var pop = DialogFocus.popup(panel, trigger, { initial, close, keep(el) });
    //   ...
    //   pop.release();
    function popup(panel, trigger, opts) {
        opts = opts || {};
        var p = { released: false };
        function stays(el) {
            if (!el) return true;
            if (panel.contains(el) || (trigger && trigger.contains(el))) return true;
            // A dialog it opened, yes; the skip menu (Ctrl+Shift+Tab) is a jump away.
            if (el.closest && el.closest('[aria-modal="true"]') && !el.closest('#skipMenu')) return true;
            return !!(opts.keep && opts.keep(el));
        }
        function onFocusOut(e) {
            if (p.released || stays(e.relatedTarget)) return;
            // Focus is on its way to relatedTarget: mid-move the page reads as
            // focused on nothing, and release must not pull it back.
            p.leaving = true;
            if (opts.close) opts.close();
        }
        panel.addEventListener('focusout', onFocusOut);
        if (lastInput === 'key') {
            var first = typeof opts.initial === 'function' ? opts.initial() : opts.initial;
            if (!usable(first)) first = focusables(panel)[0];
            if (first) { try { first.focus({ preventScroll: true }); } catch (_) {} }
        }
        p.release = function () {
            if (p.released) return;
            p.released = true;
            panel.removeEventListener('focusout', onFocusOut);
            if (p.leaving) return;
            var a = document.activeElement;
            var inside = !!(a && panel.contains(a));
            if (a && a !== document.body && !inside) return;   // Tab already took it on
            if (lastInput === 'key' && usable(trigger)) { try { trigger.focus({ preventScroll: true }); } catch (_) {} }
            else if (inside && a.blur) a.blur();
        };
        return p;
    }

    // ─── MENUS ──────────────────────────────────────────────────
    // A right-click menu (a palette chip's, a brush shape's) is a popup with
    // menu roles and the arrows. The menu key or Shift+F10 on a focused
    // control fires the same contextmenu event a right-click does, so a
    // control that can take focus already opens its menu from the keyboard;
    // this puts focus in it and back on the control afterwards.
    function menu(m, trigger, close) {
        m.setAttribute('role', 'menu');
        function items() {
            return Array.prototype.filter.call(m.querySelectorAll('button'), function (b) {
                return !b.disabled && b.getClientRects().length;
            });
        }
        items().forEach(function (b) { b.setAttribute('role', 'menuitem'); });
        m.addEventListener('keydown', function (e) {
            var k = e.key;
            if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
            e.preventDefault();
            e.stopPropagation();
            var list = items(), n = list.length;
            if (!n) return;
            var i = list.indexOf(document.activeElement);
            var next = k === 'Home' ? 0 : k === 'End' ? n - 1
                : i < 0 ? 0 : (i + (k === 'ArrowDown' ? 1 : -1) + n) % n;
            list[next].focus();
        });
        var t = (trigger && trigger !== document.body && trigger.focus) ? trigger : null;
        return popup(m, t, { close: close, initial: function () { return items()[0]; } });
    }

    // A held dialog hidden by some road that never released it would leave
    // every hotkey dead behind hasKeyboard(): drop it, quietly.
    function prune() {
        for (var i = stack.length - 1; i >= 0; i--) {
            var r = stack[i].root;
            if (r.isConnected && r.getClientRects().length) continue;
            stack[i].released = true;
            stack.splice(i, 1);
        }
        if (!stack.length) listen(false);
    }

    // Is the keyboard a dialog's? Every app-wide hotkey asks this first.
    // Also true for the dialogs that guard keys on their own (the startup
    // fork, PhotoSafe's warning).
    function hasKeyboard() {
        prune();
        if (stack.length) return true;
        if (document.querySelector('.delete-modal.show')) return true;
        var pw = document.getElementById('photoWarn');
        return !!(pw && !pw.hidden && pw.getClientRects().length);
    }

    window.DialogFocus = {
        hold: hold,
        popup: popup,
        menu: menu,
        hasKeyboard: hasKeyboard,
        top: function () { prune(); var h = top(); return h ? h.root : null; },
        lastInput: function () { return lastInput; }
    };
})();
