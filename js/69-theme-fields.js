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
//     1 with focus or open, on the local spring (600 / .70); the inline
//     disclosures (Visible sections, Your hotkeys, Saved animations) take the
//     same field look and motion, their level in --fl (js/71 owns a button's
//     --ci) and their chevron following aria-expanded;
//   • opening turns the chevron (--open) and grows the list on the drawer
//     spring (180 / .85); closing runs both back, then the list is removed.
//     The list's rows are measured once, when it opens;
//   • the keyboard's active option surges a little (--wa, .55, local spring).
// The springs write inline only while they move; at rest css/37's states
// (:hover, :focus, .wc-open, aria-expanded) are the truth.
//
// Also, presentation only:
//   • a sidebar checkbox's or radio's pane is registered with
//     ThemeMotion.pane() the first time it is touched (pointer, key or
//     focus), so its cathode strikes and fades on the study's timing (js/71
//     drives it from the change event); a radio's whole group is registered
//     and synced, so the choice that goes dark fades too; for a few seconds
//     after a change the panes are re-read every frame, so a change no event
//     announces (a preset, a room) lands even while a fade is running;
//   • app words are never cut: a pane's label, a field's value, a
//     disclosure's label or an option that would not fit at the study's
//     .12em takes .06em (data-wc-fit="tight"; css/37), then wraps. Words are
//     measured on a canvas in the display face against the room the element
//     has when it first comes on screen (an IntersectionObserver hands over
//     its width), never in a frame;
//   • Brush ghost's words are wrapped in a span (.wc-cb-txt), so the pane is
//     as wide as its words and the value stays outside it, as in the study;
//   • a hotkey's keycap is marked with its length (data-wc-keylen) so a
//     single key is set large and a combo still fits (css/37), including
//     pickers built after boot.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var root = document.documentElement;
    if (root.getAttribute('data-theme') !== 'walnut-copper') return;

    var open = null;      // { select, list, items, active, start }
    var uid = 0;

    function TM() { return window.ThemeMotion || null; }
    function inBars(el) { return !!(el && el.closest && el.closest('#sidebar-left, #sidebar-right')); }

    function eligible(sel) {
        if (!sel || sel.tagName !== 'SELECT') return false;
        if (sel.multiple || sel.size > 1 || sel.disabled) return false;
        if (root.getAttribute('data-theme') !== 'walnut-copper') return false;
        return !!sel.closest('#sidebar-left, #sidebar-right');
    }
    // A field css/37 draws (the material label-select and hidden mirrors are not).
    function isSelectField(el) {
        return !!(el && el.tagName === 'SELECT' && !el.multiple && !el.classList.contains('material-mode-select') &&
            el.getAttribute('aria-hidden') !== 'true' && inBars(el));
    }
    // The inline disclosures that take the field look (css/37 §1).
    var DISC = '.ui-vis-trigger, .hk-list-trigger, .anim-lib-head';
    function isDisc(el) { return !!(el && el.matches && el.matches(DISC) && inBars(el)); }
    function isField(el) { return isSelectField(el) || isDisc(el); }
    function fieldOf(t) {
        if (!t || !t.closest) return null;
        var el = t.closest('select, ' + DISC);
        return isField(el) ? el : null;
    }

    // ── Field motion: brightness (hi), chevron (op), list height (lb) ────
    var MAXV = 8;          // a longer list shows about this many rows and scrolls
    var moving = new Set();
    function expanded(r) { return r.disc && r.el.getAttribute('aria-expanded') === 'true'; }
    function fieldRec(el) {
        if (el._wcf) return el._wcf;
        var tm = TM();
        if (!tm) return null;
        var r = { el: el, disc: isDisc(el), hi: new tm.Spring(0, tm.PROF.local), op: new tm.Spring(0, tm.PROF.drawer),
            lb: new tm.Spring(0, tm.PROF.drawer), list: null, h: 0, hover: false, last: '', lastO: '', lastH: '' };
        // A disclosure may already be open (its list survives in the page).
        if (expanded(r)) { r.op.x = r.op.t = 1; }
        el._wcf = r;
        return r;
    }
    function hiTarget(r) {
        if (open && open.select === r.el) return 1;
        if (expanded(r)) return 1;
        if (document.activeElement === r.el) return 1;
        return r.hover ? 0.5 : 0;
    }
    function retarget(el) {
        if (!isField(el)) return;
        var r = fieldRec(el);
        if (!r) return;
        var tm = TM();
        var t = hiTarget(r);
        if (r.hi.t !== t) r.hi.to(t, tm.PROF.local);
        if (r.disc) { var o = expanded(r) ? 1 : 0; if (r.op.t !== o) r.op.to(o, tm.PROF.drawer); }
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
            var s = r.el.style, prop = r.disc ? '--fl' : '--ci';
            var settled = r.hi.settled() && r.op.settled() && r.lb.settled();
            if (settled) {
                // At rest css/37 says the same thing: drop the inline values.
                s.removeProperty(prop); s.removeProperty('--open'); r.last = r.lastO = '';
            } else {
                // Clamped: the spring overshoots, and a colour-mix past 100 %
                // would void the whole declaration for that frame.
                var ci = Math.max(0, Math.min(1, 0.5 + 0.5 * r.hi.x)).toFixed(3);
                if (ci !== r.last) { s.setProperty(prop, ci); r.last = ci; }
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

    // ── Words that fit: the study's tracking, or a tighter one, then wrap ─
    var ctx = null;
    function textWidth(text, px) {
        if (!ctx) ctx = document.createElement('canvas').getContext('2d');
        ctx.font = '400 ' + px + 'px Michroma, Eurostile, "Arial Black", sans-serif';
        return ctx.measureText(text).width;
    }
    // Wider than the room at .12em (letter-spacing follows every letter)?
    function tooLong(text, px, room) {
        var t = String(text || '').replace(/\s+/g, ' ').trim().toUpperCase();
        if (!t || !(room > 0)) return false;
        return textWidth(t, px) + t.length * 0.12 * px > room;
    }
    function setFit(el, tight) {
        if (tight) { if (el.getAttribute('data-wc-fit') !== 'tight') el.setAttribute('data-wc-fit', 'tight'); }
        else if (el.hasAttribute('data-wc-fit')) el.removeAttribute('data-wc-fit');
    }
    // el._wcW: the element's width in CSS px when it came on screen.
    function fitEl(el) {
        var w = el._wcW;
        if (!w) return;
        if (el.tagName === 'SELECT') {
            if (!isSelectField(el)) return;
            var sm = !!el.closest('.layer-item');
            var o = el.options[el.selectedIndex];
            setFit(el, !!o && tooLong(o.textContent, sm ? 9 : 10.5, w - (sm ? 39 : 66)));
            return;
        }
        if (el.matches(DISC)) {
            var lab = el.querySelector('.ui-vis-trigger-label, .hk-list-trigger-label, .anim-lib-head-label');
            var cnt = el.querySelector('.ui-vis-trigger-count, .hk-list-trigger-count');
            var c = cnt ? cnt.textContent.trim() : '';
            setFit(el, tooLong(lab ? lab.textContent : el.textContent, 10.5, w - 66 - (c ? c.length * 7 + 10 : 0)));
            return;
        }
        var name = el.matches('.ui-vis-row') ? (el.querySelector('.ui-vis-row-name') || el) : el;
        setFit(el, tooLong(name.textContent, 9, w - 35));
    }
    var FIT = '.checkbox-group > input[type="checkbox"] + label, .brush-ghost-head > .wc-cb-txt, .checkbox-group > label, ' +
        '.mutation-lock-chip, .ui-vis-row, .audio-mini-enable, .layer-check, ' +
        '.brush-radio-row:not(.arm-mode-wrap) > button, .brush-mode-row > button, .stream-format-grid > button, select, ' + DISC;
    var io = null;
    function uiScale() { return parseFloat(getComputedStyle(root).getPropertyValue('--ui-scale')) || 1; }
    function watchFit(scope) {
        if (!io) return;
        if (scope.matches && scope.matches(FIT) && inBars(scope)) io.observe(scope);
        if (scope.querySelectorAll) Array.prototype.forEach.call(scope.querySelectorAll(FIT), function (el) { if (inBars(el)) io.observe(el); });
    }
    function startFit() {
        if (io || typeof IntersectionObserver !== 'function') return;
        io = new IntersectionObserver(function (entries) {
            var z = 0;
            entries.forEach(function (en) {
                var w = en.boundingClientRect.width;
                if (!(w > 0)) return;          // not displayed yet (a shut drawer): wait
                if (!z) z = uiScale();
                var el = en.target;
                el._wcW = w / z;
                io.unobserve(el);
                fitEl(el);
            });
        }, { rootMargin: '4000px 0px' });
        ['sidebar-left', 'sidebar-right'].forEach(function (id) { var b = document.getElementById(id); if (b) watchFit(b); });
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
        if (items.length > MAXV) inner.classList.add('wc-scroll');
        return { list: list, inner: inner, items: items };
    }
    // Once, when the list opens (never in a frame): the options' tracking
    // against the list's width, then the list's full height from its rows.
    function measureList(b) {
        var room = b.list.clientWidth - 35 - (b.items.length > MAXV ? 4 : 0);
        b.items.forEach(function (o) { setFit(o, tooLong(o.textContent, 9, room)); });
        var full = b.inner.offsetHeight;
        if (b.items.length > MAXV) {
            var cap = MAXV * 37 + 7;
            b.inner.style.maxHeight = cap + 'px';
            full = Math.min(full, cap);
        }
        return full;
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
        var r = isSelectField(sel) ? fieldRec(sel) : null;
        if (r) {
            var tm = TM();
            if (r.list && r.list !== b.list) dropList(r);
            r.list = b.list; r.lastH = '';
            b.list.style.height = '0px';
            r.h = measureList(b);
            b.list.style.height = (Math.max(0, r.lb.x) * r.h).toFixed(1) + 'px';
            // The list grows on the drawer spring as the chevron turns (study
            // openSelect: _open and _lbS to 1 on PROF.drawer).
            r.op.to(1, tm.PROF.drawer); r.lb.to(1, tm.PROF.drawer);
            r.hi.to(hiTarget(r), tm.PROF.local);
            wakeFields(r);
        } else {
            b.list.style.height = 'auto';
        }
        var cur = 0;
        for (var i = 0; i < b.items.length; i++) if (+b.items[i].dataset.index === sel.selectedIndex) cur = i;
        setActive(cur);
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
    // After a change the panes of that control are re-read every frame for
    // a few seconds (ThemeMotion.sync acts only when the state differs), so
    // a programmatic change made while the fade runs is not lost to it.
    var watched = new Map(), WATCH_MS = 2600;
    function watchStep() {
        var tm = TM(), now = performance.now();
        watched.forEach(function (until, el) {
            if (!el.isConnected || now > until) { watched.delete(el); return; }
            tm.sync(el);
        });
        return watched.size === 0;
    }
    document.addEventListener('change', function (e) {
        var tm = TM(), t = e.target;
        if (!tm || !t || (t.type !== 'radio' && t.type !== 'checkbox') || !inBars(t)) return;
        var until = performance.now() + WATCH_MS;
        (t.type === 'radio' ? groupOf(t) : [t]).forEach(function (r) {
            var el = cbPaneOf(r);
            if (el && el._wc) { tm.sync(el); watched.set(el, until); }
        });
        if (watched.size) tm.run(watchStep);
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
        if (isSelectField(e.target)) fitEl(e.target);
    }, true);
    document.addEventListener('focusout', function (e) {
        if (isField(e.target)) { var s = e.target; setTimeout(function () { retarget(s); }, 0); }
    }, true);
    document.addEventListener('pointerover', function (e) {
        var s = fieldOf(e.target);
        if (!s) return;
        var r = fieldRec(s);
        if (r && !r.hover) { r.hover = true; retarget(s); }
    }, true);
    document.addEventListener('pointerout', function (e) {
        var s = fieldOf(e.target);
        if (!s || (e.relatedTarget && s.contains(e.relatedTarget))) return;
        var r = s._wcf;
        if (r && r.hover) { r.hover = false; retarget(s); }
    }, true);
    // A disclosure's own handler flips aria-expanded on click; follow it.
    document.addEventListener('click', function (e) {
        var d = fieldOf(e.target);
        if (d && isDisc(d)) setTimeout(function () { retarget(d); }, 0);
    }, true);
    // A field's value changed (a pick, a key, the app): its words re-fit.
    ['input', 'change'].forEach(function (t) {
        document.addEventListener(t, function (e) { if (isSelectField(e.target)) fitEl(e.target); }, true);
    });

    // ── Keycaps: how long the key's text is (css/37 sizes it) ────────────
    function markKey(btn) {
        var t = (btn.textContent || '').trim();
        var v = t.length <= 2 ? '1' : (t.length > 6 ? 'l' : 'm');
        if (btn.getAttribute('data-wc-keylen') !== v) btn.setAttribute('data-wc-keylen', v);
    }
    function markKeysIn(node) {
        if (node.matches && node.matches('.hk-picker-key')) markKey(node);
        if (node.querySelectorAll) Array.prototype.forEach.call(node.querySelectorAll('.hk-picker-key'), markKey);
    }
    // js/48 paint() writes aria-pressed on every state change of a picker.
    var keyMo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
            var el = list[i].target;
            if (el.nodeType === 1 && el.classList.contains('hk-picker-key')) markKey(el);
        }
    });
    // Rows built after boot (js/48 pickers paint before they are inserted,
    // js/49's hotkey rows, a layer's card): keycaps and words that fit.
    var addMo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
            var added = list[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var n = added[j];
                if (n.nodeType !== 1 || n.classList.contains('wc-lbx')) continue;
                markKeysIn(n);
                watchFit(n);
            }
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
        markKeysIn(document.getElementById('sidebar-left') || document.body);
        markKeysIn(document.getElementById('sidebar-right'));
        keyMo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
        ['sidebar-left', 'sidebar-right'].forEach(function (id) {
            var b = document.getElementById(id);
            if (b) addMo.observe(b, { childList: true, subtree: true });
        });
        // Words are measured in the display face, so wait for it.
        var fonts = document.fonts && document.fonts.ready;
        if (fonts && fonts.then) fonts.then(startFit, startFit); else startFit();
    })();

    window.ThemeFields = { close: function () { closeOpen(false); }, isOpen: function () { return !!open; } };
})();
