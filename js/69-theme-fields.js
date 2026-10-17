// ═══════════════════════════════════════════════════════════════════
// js/69-theme-fields.js — Walnut & Copper fields: the sidebar <select>s
// open their options INLINE, below their row, instead of the OS popup.
//
// The native <select> stays the control: same element, id, value, events,
// focus, and every script that reads or writes it is untouched. This only
// replaces the popup, and only when:
//   • the theme is walnut-copper (html[data-theme]),
//   • the select is in #sidebar-left or #sidebar-right (the top bar keeps
//     its native popups, per the theme doc),
//   • it is a single-choice, enabled select,
//   • the pointer is a mouse or pen (touch keeps the native picker, which is
//     the better control on a phone).
//
// Pattern: select-only combobox. Focus stays on the select, which carries
// aria-expanded / aria-controls / aria-activedescendant while open; the
// listbox is a sibling of the field's row, so it pushes later content down
// like the study's drawer field. Keys while open: arrows, Home/End,
// PageUp/PageDown (±10), Enter or Space commits, Escape cancels, Tab commits.
// Closed, the select behaves natively (arrows step the value, as before).
// Opening keys: Alt+ArrowDown, Space, Enter, F4.
//
// Committing sets .value and dispatches 'input' then 'change' (bubbling),
// the same pair a native pick fires. Nothing is persisted here; whatever a
// select's own change handler saves, it still saves.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var root = document.documentElement;
    if (root.getAttribute('data-theme') !== 'walnut-copper') return;

    var open = null;      // { select, list, items, active, start }
    var uid = 0;

    function eligible(sel) {
        if (!sel || sel.tagName !== 'SELECT') return false;
        if (sel.multiple || sel.size > 1 || sel.disabled) return false;
        if (root.getAttribute('data-theme') !== 'walnut-copper') return false;
        return !!sel.closest('#sidebar-left, #sidebar-right');
    }

    // The row the listbox goes under: the field's control group, else its
    // parent. A sibling there flows inline without joining a flex row.
    function anchorOf(sel) {
        return sel.closest('.control-group, .hk-picker, .qub-dd') || sel.parentElement;
    }

    function build(sel) {
        var list = document.createElement('div');
        list.className = 'wc-lbx';
        list.setAttribute('role', 'listbox');
        list.id = 'wc-lbx-' + (++uid);
        var label = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] && sel.labels[0].textContent.trim()) || '';
        if (label) list.setAttribute('aria-label', label);
        var items = [];
        Array.prototype.forEach.call(sel.options, function (opt, i) {
            if (opt.hidden) return;
            var o = document.createElement('div');
            o.className = 'wc-opt';
            o.setAttribute('role', 'option');
            o.id = list.id + '-o' + i;
            o.textContent = opt.textContent;
            o.dataset.index = String(i);
            if (opt.disabled) o.setAttribute('aria-disabled', 'true');
            if (i === sel.selectedIndex) o.setAttribute('aria-selected', 'true');
            o.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // keep focus on the select
            o.addEventListener('click', function () {
                if (opt.disabled) return;
                commit(i);
            });
            o.addEventListener('pointermove', function () { setActive(items.indexOf(o)); });
            list.appendChild(o);
            items.push(o);
        });
        return { list: list, items: items };
    }

    function setActive(k) {
        if (!open) return;
        var n = open.items.length;
        if (!n) return;
        k = Math.max(0, Math.min(n - 1, k));
        if (open.active >= 0 && open.items[open.active]) open.items[open.active].classList.remove('active');
        open.active = k;
        var it = open.items[k];
        it.classList.add('active');
        open.select.setAttribute('aria-activedescendant', it.id);
        try { it.scrollIntoView({ block: 'nearest' }); } catch (_) {}
    }

    function openFor(sel) {
        if (open && open.select === sel) return;
        closeOpen(false);
        var b = build(sel);
        var anchor = anchorOf(sel);
        anchor.parentNode.insertBefore(b.list, anchor.nextSibling);
        open = { select: sel, list: b.list, items: b.items, active: -1, start: sel.selectedIndex };
        sel.setAttribute('aria-expanded', 'true');
        sel.setAttribute('aria-controls', b.list.id);
        sel.classList.add('wc-open');
        var cur = 0;
        for (var i = 0; i < b.items.length; i++) if (+b.items[i].dataset.index === sel.selectedIndex) cur = i;
        setActive(cur);
        // Let the tray grow on the next frame so the height eases (CSS).
        requestAnimationFrame(function () { if (open && open.list === b.list) b.list.classList.add('in'); });
    }

    function closeOpen(refocus) {
        if (!open) return;
        var o = open;
        open = null;
        o.select.removeAttribute('aria-activedescendant');
        o.select.setAttribute('aria-expanded', 'false');
        o.select.removeAttribute('aria-controls');
        o.select.classList.remove('wc-open');
        if (o.list.parentNode) o.list.parentNode.removeChild(o.list);
        if (refocus) { try { o.select.focus({ preventScroll: true }); } catch (_) {} }
    }

    function commit(optionIndex) {
        if (!open) return;
        var sel = open.select;
        closeOpen(true);
        if (optionIndex == null || optionIndex < 0 || optionIndex === sel.selectedIndex) return;
        sel.selectedIndex = optionIndex;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function activeOptionIndex() {
        if (!open || open.active < 0) return -1;
        var it = open.items[open.active];
        if (it.getAttribute('aria-disabled') === 'true') return -1;
        return +it.dataset.index;
    }

    // Mouse / pen: take the press before the OS popup opens.
    document.addEventListener('mousedown', function (e) {
        var sel = e.target && e.target.closest ? e.target.closest('select') : null;
        if (!eligible(sel) || e.button !== 0) return;
        if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;   // touch: native picker
        e.preventDefault();
        try { sel.focus({ preventScroll: true }); } catch (_) {}
        if (open && open.select === sel) closeOpen(true);
        else openFor(sel);
    }, true);

    document.addEventListener('keydown', function (e) {
        var sel = e.target;
        if (!eligible(sel)) return;
        var k = e.key;
        if (!open || open.select !== sel) {
            if ((k === 'ArrowDown' && e.altKey) || k === ' ' || k === 'Enter' || k === 'F4') {
                e.preventDefault();
                e.stopPropagation();
                openFor(sel);
            }
            return;   // everything else: native behaviour
        }
        var handled = true;
        switch (k) {
            case 'ArrowDown': setActive(open.active + 1); break;
            case 'ArrowUp': if (e.altKey) commit(activeOptionIndex()); else setActive(open.active - 1); break;
            case 'Home': setActive(0); break;
            case 'End': setActive(open.items.length - 1); break;
            case 'PageDown': setActive(open.active + 10); break;
            case 'PageUp': setActive(open.active - 10); break;
            case 'Enter': case ' ': commit(activeOptionIndex()); break;
            case 'Escape': closeOpen(true); break;
            case 'Tab': commit(activeOptionIndex()); handled = false; break;   // commit, then let focus move
            default: handled = false;
        }
        if (handled) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    // Anything else taking focus or a press elsewhere closes it, unchanged.
    document.addEventListener('focusin', function (e) {
        if (open && e.target !== open.select) closeOpen(false);
    });
    document.addEventListener('pointerdown', function (e) {
        if (!open) return;
        if (e.target === open.select || open.list.contains(e.target)) return;
        closeOpen(false);
    }, true);
    // A select whose options or value change while open (an inbound room
    // change, a preset) is re-read on the next open; close now so the list
    // never shows stale options. Inbound changes do not move focus.
    document.addEventListener('change', function (e) {
        if (open && e.target === open.select) closeOpen(false);
    }, true);

    window.ThemeFields = { close: function () { closeOpen(false); }, isOpen: function () { return !!open; } };
})();
