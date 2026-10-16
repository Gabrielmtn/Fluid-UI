// js/66-skip-menu.js — the skip menu: the keyboard's way into the app.
//
// A skip link, four places wide: the first stop in the page's Tab order, out
// of sight until focus is in it. It shows at the top left while focus is on
// one of its buttons — the four places laid out where they sit on screen (the
// top bar, the two sidebars, the bottom bar) — and Space or Enter moves focus
// to the first thing you can see in the one picked. Tab walks its buttons
// and then on into the page; Tab round from the last control in the page
// comes back to it. Nothing has to open it.
//
// Two ways straight to it as well. Tab with nothing focused goes to it
// rather than to wherever Chrome would start from the last click — unless
// you were on a control before painting took focus off it: then Tab and
// Shift+Tab go back to that control (WHERE YOU WERE below), and Esc forgets
// it. Ctrl+Shift+Tab brings it from any control, a text
// field included — in the desktop app only: in a browser tab Chrome keeps
// that key for switching tabs and never sends it. Only a dialog keeps Tab.
//
// On its buttons its keys win over the app's: Space and Enter pick (Space
// does not freeze), the arrows go to the place they point at, Esc puts focus
// back where it came from, and other keys don't reach the hotkeys. Tab was
// the brush switch until 2026-10-15; that is ~ now (js/59).
//
// window.SkipMenu = { open(), close(), isOpen() }
(function () {
    'use strict';

    // Listed clockwise from the left, which is also the Tab order.
    var REGIONS = [
        { key: 'left',   sel: '#sidebar-left',     label: 'Left sidebar',  arrow: 'ArrowLeft' },
        { key: 'top',    sel: '#mixer-strip',      label: 'Top nav',       arrow: 'ArrowUp' },
        { key: 'right',  sel: '#sidebar-right',    label: 'Right sidebar', arrow: 'ArrowRight' },
        { key: 'bottom', sel: '#quality-underbar', label: 'Bottom nav',    arrow: 'ArrowDown' }
    ];
    var BY_KEY = {}, BY_ARROW = {};
    REGIONS.forEach(function (r) { BY_KEY[r.key] = r; BY_ARROW[r.arrow] = r.key; });

    var FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable=""], [contenteditable="true"]';
    var LANDED_MS = 1000;

    var menu = null, opts = {}, cameFrom = null, landedTimer = 0;

    // ─── WHERE FOCUS CAN GO ─────────────────────────────────────
    // Something a person can see and Tab to. Collapsed sidebar sections keep
    // their controls in the page at opacity 0 (css/21: the grid row folds to
    // 0fr), so having a box is not enough: walk up to the region and refuse
    // anything faded out, hidden or inert on the way.
    function shown(el, root) {
        if (el.disabled || el.tabIndex < 0) return false;
        if (el.closest('.sidebar-section.collapsed > .section-body')) return false;
        var r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        for (var n = el; n && n !== root.parentElement; n = n.parentElement) {
            if (n.hidden || n.inert) return false;
            var cs = getComputedStyle(n);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
        }
        return true;
    }

    function regionEl(r) {
        var el = document.querySelector(r.sel);
        if (!el || el.classList.contains('ui-hidden') || !el.getClientRects().length) return null;
        return el;
    }

    // The first control in a place, or null when it has none to offer (hidden
    // by Simple, folded away, not built yet).
    function targetOf(r) {
        var root = regionEl(r);
        if (!root) return null;
        var list = root.querySelectorAll(FOCUSABLE);
        for (var i = 0; i < list.length; i++) if (shown(list[i], root)) return list[i];
        return null;
    }

    function regionOf(el) {
        if (!el || !el.closest) return null;
        for (var i = 0; i < REGIONS.length; i++) if (el.closest(REGIONS[i].sel)) return REGIONS[i].key;
        return null;
    }

    // ─── THE MENU ───────────────────────────────────────────────
    // Built once, as the body's first child: the first stop in the Tab order.
    function build() {
        if (menu) return menu;
        var m = document.createElement('nav');
        m.id = 'skipMenu';
        m.className = 'skip-menu';
        // Buttons take their tint from the nearest [data-group] (01-buttons);
        // a body-mounted menu has none, so it names its own.
        m.dataset.group = 'system';
        m.setAttribute('aria-labelledby', 'skipMenuTitle');
        m.setAttribute('aria-describedby', 'skipMenuFoot');

        var title = document.createElement('div');
        title.id = 'skipMenuTitle';
        title.className = 'skip-menu-title';
        title.textContent = 'Move focus to';
        m.appendChild(title);

        // A small map of the window: the bars round a stand-in canvas.
        var map = document.createElement('div');
        map.className = 'skip-menu-map';
        REGIONS.forEach(function (r) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'skip-menu-option skip-menu-' + r.key;
            b.dataset.region = r.key;
            b.textContent = r.label;
            b.addEventListener('click', function () { choose(r.key); });
            map.appendChild(b);
            opts[r.key] = b;
        });
        var canvas = document.createElement('div');
        canvas.className = 'skip-menu-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        map.appendChild(canvas);
        m.appendChild(map);

        var foot = document.createElement('div');
        foot.id = 'skipMenuFoot';
        foot.className = 'skip-menu-foot';
        var cap = document.createElement('span');
        cap.className = 'hk-cap';
        cap.textContent = 'Ctrl+Shift+Tab';
        foot.appendChild(cap);
        foot.appendChild(document.createTextNode('brings this menu back from anywhere'));
        m.appendChild(foot);

        // Focus coming in from the page: note where from (Esc goes back
        // there, and that place's button is marked "you are here"), bring the
        // buttons up to date and put the menu where it can be seen.
        m.addEventListener('focusin', function (e) {
            var from = e.relatedTarget;
            if (from && m.contains(from)) return;
            cameFrom = (from && from !== document.body) ? from : null;
            refresh();
            place();
            var at = focused();
            if (at && !enabled(at)) step(1);
        });
        m.addEventListener('focusout', function (e) {
            if (!e.relatedTarget || !m.contains(e.relatedTarget)) cameFrom = null;
        });
        m.addEventListener('keydown', onKey);

        document.body.insertBefore(m, document.body.firstChild);
        menu = m;
        return m;
    }

    // A place with nothing to focus is off: marked, and out of the Tab order
    // so Tab steps over it.
    function refresh() {
        if (!menu) return;
        var here = regionOf(cameFrom);
        REGIONS.forEach(function (r) {
            var b = opts[r.key];
            var on = !!targetOf(r);
            b.setAttribute('aria-disabled', on ? 'false' : 'true');
            b.tabIndex = on ? 0 : -1;
            if (r.key === here) b.setAttribute('aria-current', 'location');
            else b.removeAttribute('aria-current');
        });
    }

    function enabled(key) {
        return !!(opts[key] && opts[key].getAttribute('aria-disabled') !== 'true');
    }

    function focused() {
        var a = document.activeElement;
        return a && a.classList && a.classList.contains('skip-menu-option') ? a.dataset.region : null;
    }

    // To the next place that has something in it, round from the focused one.
    function step(dir) {
        var at = focused();
        var i = at ? REGIONS.indexOf(BY_KEY[at]) : (dir > 0 ? -1 : 0);
        for (var n = 0; n < REGIONS.length; n++) {
            i = (i + dir + REGIONS.length) % REGIONS.length;
            if (enabled(REGIONS[i].key)) { opts[REGIONS[i].key].focus(); return; }
        }
    }

    // Under the desktop build's title bar when it shows, else the corner.
    function place() {
        var top = 12;
        var bar = document.getElementById('custom-titlebar');
        if (bar && bar.getClientRects().length) {
            var b = bar.getBoundingClientRect();
            if (b.height > 0) top = Math.round(b.bottom) + 8;
        }
        menu.style.top = top + 'px';
        menu.style.left = '12px';
    }

    // Straight to it (Tab with nothing focused, Ctrl+Shift+Tab): back in from
    // a place, start on that place, so one Tab moves on and Enter goes back
    // to its top.
    function open() {
        build();
        var a = document.activeElement;
        var here = regionOf(a && a !== document.body ? a : null);
        cameFrom = (a && a !== document.body && a !== document.documentElement) ? a : null;
        refresh();
        if (here && enabled(here)) opts[here].focus();
        else { step(1); if (!focused()) opts.left.focus(); }
    }

    // restore: Esc puts focus back where it came from; with nowhere to go,
    // focus leaves the menu, and it goes out of sight with it.
    function close(restore) {
        if (!menu || !menu.contains(document.activeElement)) return;
        var back = cameFrom;
        cameFrom = null;
        if (restore && back && back.isConnected && back.getClientRects().length && back.focus) back.focus();
        else document.activeElement.blur();
    }

    function choose(key) {
        if (!enabled(key)) return;
        var r = BY_KEY[key];
        var t = targetOf(r);
        if (!t) {                       // gone since focus came in
            refresh();
            return;
        }
        cameFrom = null;
        t.focus();
        if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest' });
        landed(regionEl(r));
    }

    // A short ring round the place focus went to, so the eye finds it even
    // when the first control is small.
    function landed(el) {
        if (!el) return;
        var prev = document.querySelector('.skip-landed');
        if (prev) prev.classList.remove('skip-landed');
        clearTimeout(landedTimer);
        void el.offsetWidth;            // restart the fade on a second pick
        el.classList.add('skip-landed');
        landedTimer = setTimeout(function () { el.classList.remove('skip-landed'); }, LANDED_MS);
    }

    // ─── KEYS ───────────────────────────────────────────────────
    function stop(e) { e.preventDefault(); e.stopPropagation(); }

    // On the menu's buttons. Tab is left to walk on natively.
    function onKey(e) {
        var k = e.key;
        if (k === 'Tab') return;
        if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return;   // 05n counts the right Shift
        if (k === 'Escape') { stop(e); close(true); return; }
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            if (BY_ARROW[k]) {
                stop(e);
                if (enabled(BY_ARROW[k])) opts[BY_ARROW[k]].focus();
                return;
            }
            if (k === 'Home' || k === 'End') {
                stop(e);
                var list = REGIONS.filter(function (r) { return enabled(r.key); });
                if (list.length) opts[(k === 'Home' ? list[0] : list[list.length - 1]).key].focus();
                return;
            }
            if (k === 'Enter' || k === ' ') {
                stop(e);
                if (!e.repeat && focused()) choose(focused());
                return;
            }
        }
        e.stopPropagation();            // no hotkey fires from the menu
    }

    function typing(t) {
        if (window.__isTypingTarget) return window.__isTypingTarget(t);
        var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(t && t.isContentEditable);
    }

    // A dialog, an overlay, or an editor that covers the canvas has the
    // keyboard: Tab stays its own there.
    function keyboardElsewhere() {
        if (window.DialogFocus.hasKeyboard()) return true;   // dialogs, the hotkey sheet, PhotoSafe (00b)
        if (window.Hotkeys && window.Hotkeys.isListening && window.Hotkeys.isListening()) return true;
        if (window.HotkeyBinds && window.HotkeyBinds.isActive()) return true;
        if (window.LayerTransform && window.LayerTransform.isOpen()) return true;
        if (window.RadialMenu && window.RadialMenu.isOpen()) return true;
        var me = document.getElementById('maskEditorOverlay');
        return !!(me && me.style.display !== 'none' && me.getClientRects().length);
    }

    // Nothing to walk on from: the page itself, or something that took focus
    // without being a stop (a click on a tabindex="-1" box).
    function nothingFocused() {
        var a = document.activeElement;
        if (!a || a === document.body || a === document.documentElement) return true;
        if (a.tabIndex >= 0 || typing(a)) return false;
        // An option or menu item the arrows moved to is tabindex="-1" too,
        // but it sits in a widget, and Tab walks on from there.
        return !a.getAttribute('role') &&
            !(a.closest && a.closest('[role="listbox"], [role="menu"], [role="dialog"], [role="grid"], [role="tree"], [role="radiogroup"], [role="tablist"]'));
    }

    // ─── WHERE YOU WERE ─────────────────────────────────────────
    // Painting takes focus off the control you were on (a press on the canvas
    // lands on nothing), and it should: Space then freezes, letters can't
    // type into a field, arrows don't nudge the last slider. But the next
    // Tab or Shift+Tab goes back to that control, as if focus had only
    // stepped aside, rather than starting over at this menu. Every Tab stop
    // focus lands on is remembered, by keyboard or by mouse, except in a
    // dialog (gone when it closes) and in this menu. Esc that nothing else
    // used forgets it and leaves the control: back to painting, and the next
    // Tab starts here.
    var lastControl = null;
    document.addEventListener('focusin', function (e) {
        var t = e.target;
        if (!t || t === document.body || !(t.tabIndex >= 0)) return;
        if (menu && menu.contains(t)) return;
        if (t.closest && t.closest('[aria-modal="true"], #photoWarn')) return;
        lastControl = t;
    }, true);

    // Still somewhere it can be seen and focused (not in a popup that closed,
    // a section that folded, a bar that was hidden).
    function stillThere(el) {
        if (!el || !el.isConnected || el.disabled || !el.getClientRects().length) return false;
        if (el.closest('.sidebar-section.collapsed > .section-body')) return false;
        return getComputedStyle(el).visibility !== 'hidden';
    }

    // Esc that nothing else used: a popup, a dialog, a menu, a stop of the
    // recorder or of focus mode all take it first (they stop it, or mark it
    // used). A text field keeps its own Esc; a dropdown, closed, doesn't
    // need one (open, its list has the keys).
    function textEntry(el) {
        if (!el || el === document.body) return false;
        if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
        return el.tagName === 'INPUT' && typing(el);
    }
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        if (keyboardElsewhere()) return;
        var a = document.activeElement;
        if (textEntry(a)) return;
        lastControl = null;
        if (a && a !== document.body && a.blur) a.blur();
    });

    // Before any Tab moves focus, the buttons' Tab stops have to be right, so
    // Tab coming round from the page steps over a place that has gone (capture,
    // ahead of the move).
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && menu) refresh();
    }, true);

    // Document, bubble, like the app's other keys: the dialogs' own capture
    // handlers and a listening hotkey picker (window capture, js/48) have
    // already had the press.
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || e.defaultPrevented) return;
        if (menu && menu.contains(document.activeElement)) return;   // walking its buttons
        if (e.metaKey || e.altKey) return;                 // the system's
        var call = e.ctrlKey && e.shiftKey;                // Ctrl+Shift+Tab: from anywhere
        if (e.ctrlKey && !call) return;                    // Ctrl+Tab: the browser's
        if (!document.getElementById('mixer-strip') || !window.__scriptsReady) return;
        if (keyboardElsewhere()) return;
        if (!call && !nothingFocused()) return;            // Tab / Shift+Tab walk on from a control
        e.preventDefault();
        if (!call && stillThere(lastControl)) {            // back where you were
            lastControl.focus();
            return;
        }
        open();
    });

    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);

    window.SkipMenu = {
        open: open,
        close: function () { close(true); },
        isOpen: function () { return !!(menu && menu.contains(document.activeElement)); }
    };
})();
