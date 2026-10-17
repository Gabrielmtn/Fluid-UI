// ═══════════════════════════════════════════════════════════════════
// js/69-theme-fields.js — Walnut & Copper fields: the sidebar <select>s
// open their options INLINE, below their row, instead of the OS popup, and
// every field, checkbox pane and keycap moves as the study's do.
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
//
// Motion (study-lite 2023-2077 openSelect / closeSel, 2872-2894
// sidebarFrame), all through js/71's one frame (ThemeMotion.run), no loop of
// its own, nothing measured in the frame:
//   • a field's brightness rests at .5, rises to .75 under the pointer and to
//     1 with focus or open, on the local spring (600 / .70);
//   • opening turns the chevron (--open) and grows the list on the drawer
//     spring (180 / .85); closing runs both back, then the list is removed.
//     The list's height is known from its option count (32 px rows, 5 px
//     apart: css/37), so nothing is read from layout;
//   • the keyboard's active option surges a little (--wa, .55, local spring).
// The springs write inline only while they move; at rest css/37's states
// (:hover, :focus, .wc-open) are the truth.
//
// Also, presentation only:
//   • a sidebar checkbox's pane is registered with ThemeMotion.pane() the
//     first time it is touched (pointer, key or focus), so its cathode
//     strikes and fades on the study's timing (js/71 drives it from the
//     change event);
//   • Brush ghost's words are wrapped in a span (.wc-cb-txt), so the pane is
//     as wide as its words and the value stays outside it, as in the study;
//   • a bound hotkey's keycap is marked with its length (data-wc-keylen) so
//     a single key is set large and a combo still fits (css/37).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var root = document.documentElement;
    if (root.getAttribute('data-theme') !== 'walnut-copper') return;

    var open = null;      // { select, list, items, active, start }
    var uid = 0;

    function TM() { return window.ThemeMotion || null; }

    function eligible(sel) {
        if (!sel || sel.tagName !== 'SELECT') return false;
        if (sel.multiple || sel.size > 1 || sel.disabled) return false;
        if (root.getAttribute('data-theme') !== 'walnut-copper') return false;
        return !!sel.closest('#sidebar-left, #sidebar-right');
    }
    // A field css/37 draws (the material label-select and hidden mirrors are not).
    function isField(sel) {
        return !!(sel && sel.tagName === 'SELECT' && !sel.multiple && !sel.classList.contains('material-mode-select') &&
            sel.getAttribute('aria-hidden') !== 'true' && sel.closest('#sidebar-left, #sidebar-right'));
    }

    // ── Field motion: brightness (hi), chevron (open), list height (lb) ──
    // Rows are 32 px, 5 px apart, 5 + 2 px padding (css/37 .wc-lbx-in); a
    // long list shows MAXV rows and scrolls inside.
    var ROW = 32, GAP = 5, PADV = 7, MAXV = 8;
    var moving = new Set();
    function fieldRec(sel) {
        if (sel._wcf) return sel._wcf;
        var tm = TM();
        if (!tm) return null;
        var r = { sel: sel, hi: new tm.Spring(0, tm.PROF.local), op: new tm.Spring(0, tm.PROF.drawer),
            lb: new tm.Spring(0, tm.PROF.drawer), list: null, h: 0, hover: false, last: '', lastO: '', lastH: '' };
        sel._wcf = r;
        return r;
    }
    function hiTarget(r) {
        if (open && open.select === r.sel) return 1;
        if (document.activeElement === r.sel) return 1;
        return r.hover ? 0.5 : 0;
    }
    function retarget(sel) {
        if (!isField(sel)) return;
        var r = fieldRec(sel);
        if (!r) return;
        var tm = TM();
        var t = hiTarget(r);
        if (r.hi.t !== t) r.hi.to(t, tm.PROF.local);
        wakeFields(r);
    }
    function wakeFields(r) {
        moving.add(r);
        var tm = TM();
        if (tm) tm.run(stepFields);
    }
    function stepFields(dt) {
        moving.forEach(function (r) {
            r.hi.step(dt); r.op.step(dt); r.lb.step(dt);
            var s = r.sel.style;
            var settled = r.hi.settled() && r.op.settled() && r.lb.settled();
            if (settled) {
                // At rest css/37 says the same thing: drop the inline values.
                s.removeProperty('--ci'); s.removeProperty('--open'); r.last = r.lastO = '';
            } else {
                // Clamped: the spring overshoots, and a colour-mix past 100 %
                // would void the whole declaration for that frame.
                var ci = Math.max(0, Math.min(1, 0.5 + 0.5 * r.hi.x)).toFixed(3);
                if (ci !== r.last) { s.setProperty('--ci', ci); r.last = ci; }
                var o = Math.max(0, Math.min(1, r.op.x)).toFixed(3);
                if (o !== r.lastO) { s.setProperty('--open', o); r.lastO = o; }
            }
            if (r.list) {
                var h = Math.max(0, r.lb.x * r.h).toFixed(1);
                if (h !== r.lastH) { r.list.style.height = h + 'px'; r.lastH = h; }
                if (r.lb.t === 0 && (r.lb.x < 0.01 || settled)) dropList(r);
            }
            // Settled open (the list at full height) or closed: leave it be
            // until the next open, close, focus or hover wakes it.
            if (settled && (!r.list || r.lb.t === 1)) moving.delete(r);
        });
        stepSurges(dt);
        return moving.size === 0 && surging.size === 0;
    }
    function dropList(r) {
        var l = r.list;
        r.list = null; r.lastH = '';
        if (l && l.parentNode) l.parentNode.removeChild(l);
    }

    // The keyboard's active option surges (study setActive: .55, local).
    var surging = new Set();
    function surgeTo(o, v) {
        var tm = TM();
        if (!tm) { o.style.setProperty('--wa', String(v)); return; }
        if (!o._wa) o._wa = { el: o, sp: new tm.Spring(0, tm.PROF.local), last: '' };
        o._wa.sp.to(v, tm.PROF.local);
        surging.add(o._wa);
        tm.run(stepFields);
    }
    function stepSurges(dt) {
        surging.forEach(function (w) {
            w.sp.step(dt);
            var v = Math.max(0, Math.min(1, w.sp.x)).toFixed(3);
            if (v !== w.last) { w.el.style.setProperty('--wa', v); w.last = v; }
            if (w.sp.settled() || !w.el.isConnected) surging.delete(w);
        });
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
        var inner = document.createElement('div');
        inner.className = 'wc-lbx-in';
        inner.setAttribute('role', 'presentation');
        list.appendChild(inner);
        var items = [];
        Array.prototype.forEach.call(sel.options, function (opt, i) {
            if (opt.hidden) return;
            var o = document.createElement('div');
            o.className = 'wc-opt';
            o.setAttribute('role', 'option');
            o.id = list.id + '-o' + i;
            var ind = document.createElement('i');
            ind.className = 'wc-ind';
            ind.setAttribute('aria-hidden', 'true');
            o.appendChild(ind);
            o.appendChild(document.createTextNode(opt.textContent));
            o.dataset.index = String(i);
            if (opt.disabled) o.setAttribute('aria-disabled', 'true');
            if (i === sel.selectedIndex) o.setAttribute('aria-selected', 'true');
            o.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // keep focus on the select
            o.addEventListener('click', function () {
                if (opt.disabled) return;
                commit(i);
            });
            o.addEventListener('pointermove', function () { setActive(items.indexOf(o)); });
            inner.appendChild(o);
            items.push(o);
        });
        // Its full height, from the rows (no layout read).
        var n = Math.max(1, items.length), shown = Math.min(n, MAXV);
        var h = shown * ROW + (shown - 1) * GAP + PADV;
        if (n > MAXV) { inner.classList.add('wc-scroll'); inner.style.maxHeight = h + 'px'; }
        return { list: list, items: items, h: h };
    }

    function setActive(k) {
        if (!open) return;
        var n = open.items.length;
        if (!n) return;
        k = Math.max(0, Math.min(n - 1, k));
        if (open.active >= 0 && open.items[open.active] && open.active !== k) {
            open.items[open.active].classList.remove('wc-act');
            surgeTo(open.items[open.active], 0);
        }
        open.active = k;
        var it = open.items[k];
        it.classList.add('wc-act');   // not .active: js/71 lights a pane that has .active
        surgeTo(it, 0.55);
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
        // The list grows on the drawer spring as the chevron turns (study
        // openSelect: _open and _lbS to 1 on PROF.drawer).
        var r = isField(sel) ? fieldRec(sel) : null;
        if (r) {
            var tm = TM();
            if (r.list && r.list !== b.list) dropList(r);
            r.list = b.list; r.h = b.h; r.lastH = '';
            b.list.style.height = (Math.max(0, r.lb.x) * r.h).toFixed(1) + 'px';
            r.op.to(1, tm.PROF.drawer); r.lb.to(1, tm.PROF.drawer);
            r.hi.to(hiTarget(r), tm.PROF.local);
            wakeFields(r);
        } else {
            b.list.style.height = 'auto';
        }
    }

    function closeOpen(refocus) {
        if (!open) return;
        var o = open;
        open = null;
        o.select.removeAttribute('aria-activedescendant');
        o.select.setAttribute('aria-expanded', 'false');
        o.select.removeAttribute('aria-controls');
        o.select.classList.remove('wc-open');
        var r = o.select._wcf;
        if (r && r.list === o.list && TM()) {
            // Closing: the list stays only as decoration while it folds away
            // (no listbox role, hidden from assistive tech, inert), then goes.
            var l = o.list;
            l.className = 'wc-lbx-out';
            l.removeAttribute('role');
            l.removeAttribute('id');
            l.setAttribute('aria-hidden', 'true');
            l.inert = true;
            var tm = TM();
            r.op.to(0, tm.PROF.drawer); r.lb.to(0, tm.PROF.drawer);
            r.hi.to(hiTarget(r), tm.PROF.local);
            wakeFields(r);
        } else if (o.list.parentNode) {
            o.list.parentNode.removeChild(o.list);
        }
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

    // ── Checkbox panes: register on first touch (ThemeMotion.pane) ───────
    // The element that holds a sidebar checkbox's pane state (css/37 §3):
    // the row for <input> + <label for>, the label that wraps the input, or
    // the bare input.
    function inputOf(t) {
        if (!t || !t.closest || !t.closest('#sidebar-left, #sidebar-right')) return null;
        var inp = null;
        if (t.matches && t.matches('input[type="checkbox"], input[type="radio"]')) inp = t;
        else {
            var lab = t.closest('label');
            if (lab) inp = lab.control || lab.querySelector('input[type="checkbox"], input[type="radio"]');
        }
        return inp && (inp.type === 'checkbox' || inp.type === 'radio') ? inp : null;
    }
    function cbPaneOf(t) {
        var inp = inputOf(t);
        if (!inp) return null;
        var row = inp.parentElement;
        var next = inp.nextElementSibling;
        if (row && row.classList.contains('checkbox-group') && next && next.tagName === 'LABEL') return row;
        return inp.closest('label') || inp;
    }
    // A radio's group: every sidebar radio with its name. All of them are
    // registered before the change, so the one that goes dark fades too.
    function groupOf(inp) {
        if (!inp || inp.type !== 'radio' || !inp.name) return [];
        return Array.prototype.filter.call(document.getElementsByName(inp.name), function (r) {
            return r.type === 'radio' && r.closest('#sidebar-left, #sidebar-right');
        });
    }
    function touchPane(t) {
        var tm = TM();
        if (!tm) return;
        var inp = inputOf(t);
        if (!inp) return;
        (inp.type === 'radio' ? groupOf(inp) : [inp]).forEach(function (i) {
            var el = cbPaneOf(i);
            if (el && !el._wc) tm.pane(el);
        });
    }
    document.addEventListener('change', function (e) {
        var tm = TM();
        if (!tm || !e.target || e.target.type !== 'radio') return;
        groupOf(e.target).forEach(function (r) { var el = cbPaneOf(r); if (el && el._wc) tm.sync(el); });
    }, true);

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

    // Presentation listeners (capture, registered before js/71's, so a pane
    // exists before js/71 surges it). They change nothing but style.
    document.addEventListener('pointerdown', function (e) { touchPane(e.target); }, true);
    document.addEventListener('keydown', function (e) { touchPane(e.target); }, true);
    document.addEventListener('focusin', function (e) {
        touchPane(e.target);
        if (isField(e.target)) retarget(e.target);
    }, true);
    document.addEventListener('focusout', function (e) {
        if (isField(e.target)) { var s = e.target; setTimeout(function () { retarget(s); }, 0); }
    }, true);
    document.addEventListener('pointerover', function (e) {
        var s = e.target && e.target.closest ? e.target.closest('select') : null;
        if (!isField(s)) return;
        var r = fieldRec(s);
        if (r && !r.hover) { r.hover = true; retarget(s); }
    }, true);
    document.addEventListener('pointerout', function (e) {
        var s = e.target && e.target.closest ? e.target.closest('select') : null;
        if (!isField(s) || (e.relatedTarget && s.contains(e.relatedTarget))) return;
        var r = s._wcf;
        if (r && r.hover) { r.hover = false; retarget(s); }
    }, true);

    // ── Keycaps: how long the bound key's text is (css/37 sizes it) ──────
    function markKey(btn) {
        var t = (btn.textContent || '').trim();
        var v = t.length <= 2 ? '1' : (t.length > 6 ? 'l' : 'm');
        if (btn.getAttribute('data-wc-keylen') !== v) btn.setAttribute('data-wc-keylen', v);
    }
    // js/48 paint() writes aria-pressed on every state change of a picker.
    var keyMo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
            var el = list[i].target;
            if (el.nodeType === 1 && el.classList.contains('hk-picker-key')) markKey(el);
        }
    });

    // Brush ghost: its words in their own span, so the pane ends with them.
    function wrapGhostWords() {
        var lab = document.querySelector('.brush-ghost-head');
        if (!lab || lab.querySelector('.wc-cb-txt')) return;
        Array.prototype.slice.call(lab.childNodes).forEach(function (n) {
            if (n.nodeType !== 3 || !n.nodeValue.trim()) return;
            // The spaces stay as text either side, so the checkbox's name
            // ("Brush Ghost 100%") reads exactly as before.
            var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.nodeValue);
            var s = document.createElement('span');
            s.className = 'wc-cb-txt';
            s.textContent = m[2];
            var frag = document.createDocumentFragment();
            if (m[1]) frag.appendChild(document.createTextNode(m[1]));
            frag.appendChild(s);
            if (m[3]) frag.appendChild(document.createTextNode(m[3]));
            lab.replaceChild(frag, n);
        });
    }

    var tries = 0;
    (function attach() {
        wrapGhostWords();
        if (!document.getElementById('sidebar-right') || !document.querySelector('#sidebar-right .hk-block')) {
            if (tries++ < 80) setTimeout(attach, 250);
            return;
        }
        document.querySelectorAll('#sidebar-left .hk-picker-key, #sidebar-right .hk-picker-key').forEach(markKey);
        keyMo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    })();

    window.ThemeFields = { close: function () { closeOpen(false); }, isOpen: function () { return !!open; } };
})();
