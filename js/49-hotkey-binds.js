/**
 * Hotkey binds — any control on a key
 *
 * Ctrl+Shift+H, then click a button — a checkbox, a tab, a menu item — and
 * its key will click it; or set a slider, a dropdown or a colour and let
 * go, and its key will put it back to exactly that. The key is asked for on
 * the spot, with the same picker the Text panel uses (js/48-hotkeys.js).
 * Every hotkey anyone has made — these, and the Text lines' keys — is listed
 * in Settings → Hotkeys, where each can take a new key or be deleted.
 *
 * Bindings are user-made content: written through the moment they change
 * (settingsManager 'hotkeys.controls') and restored on every boot, never
 * riding the Save button. A binding finds its control again by id — nearly
 * every slider and checkbox here has one — or, failing that, by where it
 * lives and what it says (section, tag, text, title, position), so a list
 * that re-renders its buttons still resolves. A control that cannot be
 * found when its key is pressed says so, instead of doing nothing.
 *
 * Bind mode TAKES the first click on a button rather than letting it act —
 * choosing Delete must not delete — but lets a slider, a dropdown or a
 * colour well work as usual, because the value it ends on is the binding.
 *
 * window.HotkeyBinds = { start, stop, isActive, list, remove, fire }
 */
(function () {
    'use strict';

    var H = window.Hotkeys;
    if (!H) return;

    var KEY = 'hotkeys.controls';
    var binds = [];   // { id, combo, kind: 'click'|'value', role, target, value, name, where, valueText }

    // ─── STORE ──────────────────────────────────────────────────
    function sm() { return window.settingsManager || null; }

    function copy(o) {
        var c = {};
        for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k];
        return c;
    }

    function load() {
        var m = sm();
        var data = m ? m.get(KEY) : null;
        binds = Array.isArray(data) ? data.filter(function (b) {
            return b && typeof b.id === 'string' && b.target && (b.kind === 'click' || b.kind === 'value');
        }).map(function (b) {
            var c = copy(b);
            c.combo = H.normalize(c.combo || '');
            return c;
        }) : [];
    }

    // Written through on every change, and the views told.
    function save() {
        var m = sm();
        if (m) m.set(KEY, binds.map(copy));
        H.changed();
    }

    function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function byId(id) {
        for (var i = 0; i < binds.length; i++) if (binds[i].id === id) return binds[i];
        return null;
    }

    function setCombo(id, combo) {
        var b = byId(id);
        if (!b) return;
        b.combo = H.normalize(combo || '');
        save();
    }

    function remove(id) {
        binds = binds.filter(function (b) { return b.id !== id; });
        save();
    }

    // ─── FINDING A CONTROL AGAIN ────────────────────────────────
    function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

    function sectionTitle(el) {
        var sec = el.closest && el.closest('.sidebar-section');
        var t = sec ? sec.querySelector('.section-title') : null;
        return t ? norm(t.textContent) : '';
    }

    function findSection(title) {
        var secs = document.querySelectorAll('#sidebar-right .sidebar-section');
        for (var i = 0; i < secs.length; i++) {
            var t = secs[i].querySelector('.section-title');
            if (t && norm(t.textContent) === title) return secs[i];
        }
        return null;
    }

    function scopeOf(el) {
        var title = sectionTitle(el);
        if (title) return { section: title };
        var host = el.parentElement ? el.parentElement.closest('[id]') : null;
        return host ? { id: host.id } : {};
    }

    function scopeEl(scope) {
        if (scope && scope.section) return findSection(scope.section);
        if (scope && scope.id) return document.getElementById(scope.id);
        return document.body;
    }

    // A wordless control (a palette's colour chip) is told apart by its
    // colour, so the key still picks the same colour after the chips
    // re-render — and by its class, so a chip is never twinned with the
    // saved-colour swatch that happens to share it.
    function signature(c) {
        var text = norm(c.textContent);
        return {
            text: text, title: c.getAttribute('title') || '', aria: c.getAttribute('aria-label') || '',
            bg: (!text && c.style && c.style.backgroundColor) || '',
            cls: (!text && typeof c.className === 'string') ? c.className : ''
        };
    }

    // The same tag in the same place saying the same thing, by position
    // among its twins (a list's per-row buttons are identical but for where
    // they sit).
    function twins(root, loc) {
        if (!root) return [];
        return [].filter.call(root.querySelectorAll(loc.tag), function (c) {
            var s = signature(c);
            return s.text === loc.text && s.title === loc.title && s.aria === loc.aria
                && s.bg === (loc.bg || '') && s.cls === (loc.cls || '');
        });
    }

    function locate(el) {
        if (el.id) return { id: el.id };
        var s = signature(el);
        var loc = { scope: scopeOf(el), tag: el.tagName.toLowerCase(), text: s.text, title: s.title, aria: s.aria,
                    bg: s.bg, cls: s.cls, index: 0 };
        loc.index = Math.max(0, twins(scopeEl(loc.scope), loc).indexOf(el));
        return loc;
    }

    // Nothing found is an answer: a key that clicked the wrong control would
    // be worse than one that says its control is gone. So no looser matches
    // than these two — a twin missing from its position is gone, and a
    // renamed button counts only when its title still names exactly one.
    function resolve(loc) {
        if (!loc) return null;
        if (loc.id) return document.getElementById(loc.id);
        var root = scopeEl(loc.scope);
        if (!root) return null;
        var exact = twins(root, loc);
        if (exact.length) return exact[loc.index] || null;
        // Its words changed with its state (Arrange ↔ Done Arranging).
        if (loc.title) {
            var titled = [].filter.call(root.querySelectorAll(loc.tag), function (c) {
                return (c.getAttribute('title') || '') === loc.title;
            });
            if (titled.length === 1) return titled[0];
        }
        return null;
    }

    // ─── WHAT TO CALL IT ────────────────────────────────────────
    function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

    function labelText(el) {
        var l = (el.labels && el.labels.length) ? el.labels[0] : null;
        if (!l && el.id) l = document.querySelector('label[for="' + cssEsc(el.id) + '"]');
        if (!l) {
            var g = el.closest('.control-group');
            if (g) l = g.querySelector(':scope > label');
        }
        if (!l) return '';
        var c = l.cloneNode(true);
        [].forEach.call(c.querySelectorAll('.value-display, .hk-cap, input, select, button'), function (x) { x.remove(); });
        return norm(c.textContent);
    }

    function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    function nameOf(el, via) {
        var ch = (via || el).closest('.mixer-channel');
        if (ch && ch.dataset.uiKey && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) return ch.dataset.uiKey;
        var lab = labelText(el);
        if (lab) return clip(lab, 40);
        // A palette tag carries its own delete ×, an opener its chevron; the
        // name is the words.
        var raw = el.tagName === 'SELECT' ? '' : norm(norm(el.textContent).replace(/[×✕✖▾▴▸◂▼▲►◄]/g, ''));
        // Glyph-only buttons (✥ 👁 × 📂) say what they do in their title.
        var words = /[A-Za-z0-9]/.test(raw) ? raw : '';
        var bg = (!raw && el.style && el.style.backgroundColor) ? 'Colour ' + hexOf(el.style.backgroundColor) : '';
        return clip(words || norm(el.getAttribute('aria-label')) || norm(el.getAttribute('title')) || bg || raw || el.id || el.tagName.toLowerCase(), 40);
    }

    function hexOf(rgb) {
        var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
        if (!m) return rgb;
        return '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + (+v).toString(16)).slice(-2); }).join('').toUpperCase();
    }

    function whereOf(el) {
        var t = sectionTitle(el);
        if (t) return t;
        if (el.closest('#mixer-strip, #mixer-more-panel')) return 'Top bar';
        if (el.closest('.mixer-presets-panel')) return 'Presets';
        if (el.closest('.brush-settings-panel')) return 'Brush';
        if (el.closest('.arm-colors-rows')) return 'Multi-brush';
        return '';
    }

    // The value as people read it: the strip's figure, the sidebar's value
    // readout, the option's words — the raw value only when there is none.
    function valueTextOf(el) {
        if (el.tagName === 'SELECT') {
            var o = el.options[el.selectedIndex];
            return o ? clip(norm(o.textContent), 32) : el.value;
        }
        if (el.type === 'color') return String(el.value).toUpperCase();
        var ch = el.closest('.mixer-channel');
        var v = ch ? ch.querySelector('.ch-value') : null;
        if (!v && el.id) v = document.getElementById(el.id + 'Value');
        if (!v && el.labels && el.labels[0]) v = el.labels[0].querySelector('.value-display');
        var s = v ? norm(v.textContent) : '';
        return s || String(el.value);
    }

    function roleOf(el) {
        if (el.tagName === 'INPUT' && el.type === 'checkbox') return 'toggle';
        if (el.tagName === 'INPUT' && el.type === 'radio') return 'choose';
        return el.tagName === 'SELECT' || el.tagName === 'INPUT' ? 'set' : 'click';
    }

    function describe(b) {
        return b.kind === 'value' ? b.name + ' → ' + b.valueText : b.name;
    }

    // ─── PRESSING THE KEY ───────────────────────────────────────
    function fire(b) {
        var el = resolve(b.target);
        if (!el) { toast(describe(b) + ' isn’t on screen right now'); return false; }
        if (b.kind === 'click') { el.click(); return true; }
        el.value = b.value;
        if (el.type === 'range') { try { el.style.setProperty('--val', el.value); } catch (_) {} }
        // The events a hand on the control sends, so every listener that
        // owns it — config, readouts, presets, the multiplayer mirror, the
        // perceptual fader in front of it — hears the change the usual way.
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    H.addSource('controls', function () {
        return binds.filter(function (b) { return !!b.combo; }).map(function (b) {
            return {
                id: 'ctl:' + b.id,
                combo: b.combo,
                label: '“' + describe(b) + '”',
                does: b.role === 'toggle' ? 'toggles' : b.kind === 'value' ? 'sets' : 'clicks',
                run: function () { fire(b); },
                set: function (combo) { setCombo(b.id, combo); },
                // Moved to another binding: this one keeps its place in the
                // list, keyless, rather than vanishing with its choice.
                clear: function () { setCombo(b.id, ''); }
            };
        });
    });

    // ─── BIND MODE ──────────────────────────────────────────────
    // Three steps, and the bar always says which one this is and what to do:
    //   1 Choose a control — hovering outlines what a click would bind, with a
    //     tag that names it; a button is taken on click, a slider (dropdown,
    //     colour) by setting it and letting go
    //   2 Press a key — the chosen control stays outlined and named, and the
    //     key field listens. Clicking or setting a DIFFERENT control switches
    //     to it: a wrong pick costs a click, not a restart
    //   3 Done — the key cap and the control, side by side in the bar and
    //     pinned to the control itself in green. The key works at once. The
    //     bar stays until Done, Esc, a click elsewhere, or a few seconds;
    //     Bind another goes back to step 1
    var mode = null;        // null | 'pick' | 'key' | 'done'
    var offer = null;       // step 1's "Hotkey to …" control, while one is being set
    var pending = null;     // the binding being made
    var picker = null;
    var ui = null;          // the bar's parts
    var hoverBox = null, hoverTag = null, chosenBox = null, chosenTag = null, chosenEl = null;
    var lastHover = null;
    var swallowing = 0;     // deadline for the rest of a chosen click's press
    var valueTimer = 0;
    var doneTimer = 0;
    var DONE_MS = 8000;

    // Never bindable: this module's own bar and list, any hotkey picker,
    // dialogs, and the canvas itself.
    var NOT_BINDABLE = '#hkBindBar, .hk-block, .hk-picker, #hotkeyOverlay, .delete-modal, #recipePill, #canvas';

    // Controls that open or fold other UI — More ▾, Presets ▾, a ⚙ that opens
    // its channel's settings, a ⋯ menu, a list that folds open. They keep
    // working in bind mode, so what they reveal can be bound: taking them
    // would only put "open that menu" on a key, and strand everything
    // behind it (a fader parked in More, a preset). Recognised by ARIA, by
    // the app's own chevron-in-a-child convention (.mixer-more-chev,
    // .qub-dd-chev, .preset-group-chev …), or by name for the few that
    // carry neither.
    var OPENERS = '#mixerPresetsTrigger, .preset-more, .ch-gear, .ch-tip-swatch, .qub-dd-btn, ' +
                  '.layer-btn[data-action="collapse"], .brush-trigger, .arm-colors-trigger';

    function isOpener(el) {
        if (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup')) return true;
        if (el.matches(OPENERS)) return true;
        return !!el.querySelector('[class*="chev"]');
    }

    // What a press on `t` would bind — { el, kind, via, hl, offer } — or
    // { opener, el, hl } for a control that only opens something, or null.
    // `el` is the control the binding drives, `hl` what gets outlined (the
    // label or button under the pointer), `via` a perceptual fader proxy
    // standing in front of the real slider (20's FADER_CURVES). `offer`
    // marks the value controls that take more than one move to set, or
    // double as navigation — a colour, a dropdown, a number — which wait for
    // an explicit "Hotkey to …" instead of binding the moment they change.
    function bindableFrom(t) {
        if (!t || !t.closest || t.closest(NOT_BINDABLE)) return null;
        var hl = t.closest('input, select, button, textarea, label, [role="button"], .btn');
        if (!hl) {
            // The older controls are plain elements with an onclick — a
            // palette in the carousel, a colour chip, a saved swatch.
            var oc = clickableAncestor(t);
            if (!oc) return null;
            return isOpener(oc) ? { opener: true, el: oc, hl: oc } : { el: oc, kind: 'click', hl: oc };
        }
        var el = hl;
        if (el.tagName === 'LABEL') {
            el = el.control;
            if (!el || el.closest(NOT_BINDABLE)) return null;
        }
        if (el.tagName === 'TEXTAREA' || el.isContentEditable) return null;
        if (el.tagName === 'SELECT') return { el: el, kind: 'value', hl: hl, offer: true };
        if (el.tagName === 'INPUT') {
            var ty = (el.type || 'text').toLowerCase();
            if (ty === 'checkbox' || ty === 'radio' || ty === 'button' || ty === 'submit') return { el: el, kind: 'click', hl: hl };
            if (ty === 'range' && el.classList.contains('ch-perceptual')) {
                var real = document.getElementById(el.id.replace(/Perceptual$/, ''));
                if (real) return { el: real, kind: 'value', via: el, hl: el };
            }
            if (ty === 'range') return { el: el, kind: 'value', hl: hl };
            if (ty === 'color' || ty === 'number') return { el: el, kind: 'value', hl: hl, offer: true };
            return null;   // text fields: nothing a key could replay
        }
        // A custom dropdown in front of a hidden <select> (the quality
        // underbar's .qub-dd): its button opens it, and what gets bound is
        // the select's change once an option is picked — its menu items are
        // left alone to do exactly that.
        if (el.closest('.qub-dd')) return el.matches('.qub-dd-btn') ? { opener: true, el: el, hl: el } : null;
        if (isOpener(el)) return { opener: true, el: el, hl: hl };
        return { el: el, kind: 'click', hl: hl };
    }

    function isColour(b) { return !!(b && b.el && b.el.tagName === 'INPUT' && b.el.type === 'color'); }

    function clickableAncestor(t) {
        for (var n = t, depth = 0; n && n !== document.body && depth < 6; n = n.parentElement, depth++) {
            if (typeof n.onclick === 'function') return n;
        }
        return null;
    }

    function inBar(t) { return !!(ui && t && ui.bar.contains(t)); }

    function make(tag, cls, parent) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (parent) parent.appendChild(d);
        return d;
    }

    // An outline around `el`, and a tag pinned just above it (below, when
    // there is no room above). Fill the tag before placing it: its width is
    // its words.
    function place(box, tag, el) {
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) { box.hidden = true; tag.hidden = true; return; }
        box.style.left = (r.left - 3) + 'px';
        box.style.top = (r.top - 3) + 'px';
        box.style.width = (r.width + 6) + 'px';
        box.style.height = (r.height + 6) + 'px';
        box.hidden = false;
        tag.hidden = false;
        var th = tag.offsetHeight || 22, tw = tag.offsetWidth || 120;
        var top = r.top - th - 8;
        if (top < 4) top = r.bottom + 8;
        tag.style.top = Math.round(top) + 'px';
        tag.style.left = Math.round(Math.max(4, Math.min(r.left - 3, window.innerWidth - tw - 4))) + 'px';
    }

    // A tag's words: a key cap (or its empty slot), a verb, the control.
    function fillTag(tag, keyText, verb, name) {
        tag.textContent = '';
        if (keyText != null) make('span', 'hk-tag-key', tag).textContent = keyText;
        if (verb) make('span', 'hk-tag-verb', tag).textContent = verb;
        make('span', 'hk-tag-name', tag).textContent = name;
    }

    function chip(b) {
        var c = make('div', 'hk-chip');
        if (b.where) make('div', 'hk-chip-where', c).textContent = b.where;
        var n = make('div', 'hk-chip-name', c);
        n.textContent = describe(b);
        n.title = describe(b);
        return c;
    }

    function lines(el, texts) {
        el.textContent = '';
        texts.forEach(function (t) { make('div', '', el).textContent = t; });
    }

    var STEPS = ['Choose a control', 'Press a key', 'Done'];

    function buildBar() {
        var bar = make('div', '');
        bar.id = 'hkBindBar';
        bar.dataset.group = 'system';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'Bind a hotkey');
        var head = make('div', 'hk-steps', bar);
        var steps = STEPS.map(function (label, i) {
            if (i) make('span', 'hk-step-sep', head).textContent = '›';
            var s = make('span', 'hk-step', head);
            var n = make('span', 'hk-step-n', s);
            make('span', 'hk-step-label', s).textContent = label;
            return { el: s, n: n };
        });
        var say = make('div', 'hk-say', bar);
        var pair = make('div', 'hk-pair', bar);
        var note = make('div', '', bar);       // the key field's messages (taken keys, moves)
        note.hidden = true;
        var sub = make('div', 'hk-sub', bar);
        var actions = make('div', 'hk-actions', bar);
        var more = make('button', '', actions);
        more.type = 'button';
        var main = make('button', '', actions);
        main.type = 'button';
        document.body.appendChild(bar);
        ui = { bar: bar, steps: steps, say: say, pair: pair, note: note, sub: sub, more: more, main: main };
    }

    // ── Where the bar sits ──
    // Home is centred just inside the top of the canvas, never over the top
    // bar: its faders are what people come here to bind (Time and Density
    // sit right in the middle of it). It moves by a short rAF glide, never a
    // CSS transition — transitions on overlays above the canvas corrupt the
    // GL frame in the Electron build.
    var glideRaf = 0;

    // Open panels the bar must never sit on: letting menus open in bind mode
    // is for reaching what's inside them — and in a narrow window the More
    // panel opens exactly where the bar's home is.
    var PANELS = '.arm-colors-panel, .brush-shape-menu, .qub-dd.open';

    function openPanels() {
        var out = [];
        [].forEach.call(document.querySelectorAll(PANELS), function (p) {
            var cs = getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            var r = p.getBoundingClientRect();
            if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 ||
                r.left >= window.innerWidth || r.top >= window.innerHeight) return;
            out.push(r);
        });
        return out;
    }

    function clampSpot(s) {
        var w = ui.bar.offsetWidth, h = ui.bar.offsetHeight;
        return { left: Math.max(8, Math.min(s.left, window.innerWidth - w - 8)),
                 top: Math.max(8, Math.min(s.top, window.innerHeight - h - 8)) };
    }

    // The preferred spot if it's clear, else the first clear one of: top
    // centre of the canvas, bottom centre, then its four corners.
    function freeSpot(preferred) {
        var panels = openPanels();
        var w = ui.bar.offsetWidth, h = ui.bar.offsetHeight;
        var area = document.getElementById('canvas-area');
        var r = area ? area.getBoundingClientRect()
                     : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth };
        var mid = r.left + (r.width - w) / 2;
        var spots = [preferred,
            { left: mid, top: r.top + 10 }, { left: mid, top: r.bottom - h - 10 },
            { left: r.left + 10, top: r.top + 10 }, { left: r.right - w - 10, top: r.top + 10 },
            { left: r.left + 10, top: r.bottom - h - 10 }, { left: r.right - w - 10, top: r.bottom - h - 10 }];
        for (var i = 0; i < spots.length; i++) {
            if (!spots[i]) continue;
            var s = clampSpot(spots[i]);
            var clear = !panels.some(function (p) {
                return s.left < p.right && s.left + w > p.left && s.top < p.bottom && s.top + h > p.top;
            });
            if (clear) return s;
        }
        return clampSpot(preferred || spots[1]);
    }

    function barHome() {
        var area = document.getElementById('canvas-area');
        var r = area ? area.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth };
        return freeSpot({ left: r.left + (r.width - ui.bar.offsetWidth) / 2, top: r.top + 10 });
    }

    // What the bar is placed against: home, or the colour well whose
    // chooser it waits beside (an offer, and the steps after accepting one).
    var anchorColour = null;
    var overBar = false;
    var dodgeTimer = 0;

    function barSpot() {
        return anchorColour ? freeSpot(pastPicker(anchorColour)) : barHome();
    }

    // Panels open and close on their own schedule (and slide), so keep
    // checking while binding — but never move the bar out from under the
    // pointer that is reaching for it.
    function dodge() {
        if (!ui || overBar || glideRaf) return;
        var to = barSpot();
        var x = parseFloat(ui.bar.style.left), y = parseFloat(ui.bar.style.top);
        if (Math.abs(to.left - x) > 2 || Math.abs(to.top - y) > 2) moveBar(to, true);
    }

    function moveBar(to, animate) {
        var bar = ui.bar;
        var w = bar.offsetWidth, h = bar.offsetHeight;
        var x = Math.round(Math.max(8, Math.min(to.left, window.innerWidth - w - 8)));
        var y = Math.round(Math.max(8, Math.min(to.top, window.innerHeight - h - 8)));
        if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; }
        var x0 = parseFloat(bar.style.left), y0 = parseFloat(bar.style.top);
        if (!animate || isNaN(x0) || isNaN(y0) || (Math.abs(x - x0) < 1 && Math.abs(y - y0) < 1)) {
            bar.style.left = x + 'px';
            bar.style.top = y + 'px';
            return;
        }
        var t0 = performance.now(), D = 260;
        (function frame(now) {
            if (!ui || ui.bar !== bar) { glideRaf = 0; return; }
            var k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);   // ease-out
            bar.style.left = Math.round(x0 + (x - x0) * e) + 'px';
            bar.style.top = Math.round(y0 + (y - y0) * e) + 'px';
            glideRaf = k < 1 ? requestAnimationFrame(frame) : 0;
        })(t0);
    }

    function setAction(btn, label, fn, emphasis) {
        btn.hidden = !label;
        btn.textContent = label || '';
        btn.classList.toggle('btn--emphasis', !!emphasis);
        btn.onclick = fn || null;
    }

    function setStep(n, made) {
        ui.bar.dataset.step = String(n);
        ui.steps.forEach(function (s, i) {
            var k = i + 1, done = k < n || n === 3;
            s.el.classList.toggle('is-now', k === n);
            s.el.classList.toggle('is-done', done);
            s.n.textContent = done ? '✓' : String(k);
        });
        ui.pair.textContent = '';
        if (n === 1 && offer) {
            var col = isColour(offer);
            ui.say.textContent = col ? 'Pick the colour — take as many tries as you like' : 'Is this the one you want?';
            ui.pair.appendChild(offerButton(offer));
            lines(ui.sub, col
                ? ['The button follows your colour. Press it when it’s right.',
                   'Or click any other control to bind that instead. Esc cancels.']
                : ['Press it to put ' + describe(offerDraft(offer)) + ' on a key.',
                   'Or keep going: click another control to bind that instead. Esc cancels.']);
            setAction(ui.more, '');
            setAction(ui.main, 'Cancel', stop);
        } else if (n === 1) {
            ui.say.textContent = 'Choose the control you want on a key';
            lines(ui.sub, ['Click a button or a checkbox, or set a slider and let go.',
                           'Menus and lists still open, so you can reach what’s inside. Esc cancels.']);
            setAction(ui.more, '');
            setAction(ui.main, 'Cancel', stop);
        } else if (n === 2) {
            ui.say.textContent = 'Now press the key for it';
            ui.pair.appendChild(picker.el);
            make('span', 'hk-arrow', ui.pair).textContent = '→';
            ui.pair.appendChild(chip(pending));
            lines(ui.sub, ['Any key or combo, like Q or Shift+3.',
                           'Wrong control? Click or set another one to switch. Esc cancels.']);
            setAction(ui.more, '');
            setAction(ui.main, 'Cancel', stop);
        } else {
            var key = H.format(made.combo);
            ui.say.textContent = '✓ Hotkey saved';
            make('span', 'hk-keycap', ui.pair).textContent = key;
            make('span', 'hk-arrow', ui.pair).textContent = '→';
            ui.pair.appendChild(chip(made));
            lines(ui.sub, ['Press ' + key + ' anywhere to use it.',
                           'Change it or delete it in Settings → Hotkeys.']);
            setAction(ui.more, 'Bind another', toStep1);
            setAction(ui.main, 'Done', stop, true);
            // Enter or Space finishes; Esc does too (the keydown below).
            try { ui.main.focus({ preventScroll: true }); } catch (_) {}
        }
    }

    function dropPicker() {
        if (picker) { var p = picker; picker = null; p.destroy(); }
    }

    // ── The offer: a value that takes more than one move to set ──
    // A colour is picked in a native chooser that fires as you drag and may
    // be opened again and again before it is right; a dropdown is also how
    // parts of the app are revealed. So neither binds the moment it changes:
    // step 1 shows "Hotkey to <value>", live, and binds when that is pressed
    // — or whatever else is chosen instead.
    function offerDraft(b) {
        return { kind: 'value', name: nameOf(b.el, b.via), valueText: valueTextOf(b.el) };
    }

    function offerButton(b) {
        var btn = make('button', 'hk-offer btn--emphasis');
        btn.type = 'button';
        var colour = isColour(b) ? String(b.el.value) : '';
        if (colour) make('span', 'hk-offer-swatch', btn).style.background = colour;
        make('span', 'hk-offer-lead', btn).textContent = 'Hotkey to';
        var val = make('span', 'hk-offer-val', btn);
        val.textContent = valueTextOf(b.el);
        // The hex in its own colour — a dark one gets a light halo, or it
        // would vanish into the bar.
        if (colour) { val.style.color = colour; val.classList.toggle('is-dark', isDark(colour)); }
        btn.addEventListener('click', acceptOffer);
        return btn;
    }

    function isDark(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        if (!m) return false;
        var c = [m[1], m[2], m[3]].map(function (h) {
            var v = parseInt(h, 16) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 0.12;
    }

    // Chromium's colour chooser is a popup outside the page, so nothing can
    // measure it — but where it goes can be worked out, the same way
    // Chromium works it out (picker_common.js):
    //   size   234 × 252 CSS px at zoom 1 (measured), times the swatch's own
    //          CSS zoom — the strip and the sidebar carry zoom: var(--ui-scale),
    //          and the chooser grows with it (measured 318 × 340 at 1.36,
    //          which is what put it over the bar on a scaled display)
    //   across left edges together, unless that runs it off the SCREEN, then
    //          right edges together
    //   down   under the swatch, unless it doesn't fit there and there is
    //          more room above — then over it
    // The bar waits just past it, centred under it, kept over the canvas.
    var CHOOSER_W = 234, CHOOSER_H = 252, CHOOSER_GAP = 16;

    function cssZoom(el) {
        var z = 1;
        for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
            var v = parseFloat(getComputedStyle(n).zoom);
            if (v > 0 && isFinite(v)) z *= v;
        }
        return z;
    }

    function chooserBox(el) {
        var r = el.getBoundingClientRect(), z = cssZoom(el);
        var w = CHOOSER_W * z, h = CHOOSER_H * z;
        // The screen's usable area in page coordinates. The page sits at the
        // window's corner in the frameless desktop build; in a browser, past
        // its toolbars (outer − inner, near enough).
        var s = window.screen || {};
        var side = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
        var ox = (window.screenX || 0) + side;
        var oy = (window.screenY || 0) + Math.max(0, window.outerHeight - window.innerHeight - side);
        var ax = (typeof s.availLeft === 'number' ? s.availLeft : 0) - ox;
        var ay = (typeof s.availTop === 'number' ? s.availTop : 0) - oy;
        var aw = s.availWidth || window.innerWidth, ah = s.availHeight || window.innerHeight;
        var x = r.left;
        if (x + w > ax + aw && r.right - w >= ax) x = r.right - w;
        var roomBelow = Math.max(0, ay + ah - r.bottom), roomAbove = Math.max(0, r.top - ay);
        var up = h > roomBelow && roomBelow < roomAbove;
        h = Math.min(h, up ? roomAbove : roomBelow) || h;
        var y = up ? r.top - h : r.bottom;
        return { left: x, top: y, right: x + w, bottom: y + h, up: up };
    }

    function pastPicker(el) {
        var c = chooserBox(el);
        var bw = ui.bar.offsetWidth, bh = ui.bar.offsetHeight;
        var vw = window.innerWidth, vh = window.innerHeight;
        var area = document.getElementById('canvas-area');
        var a = area ? area.getBoundingClientRect() : { left: 0, right: vw };
        var left = (c.left + c.right) / 2 - bw / 2;
        if (a.right - a.left >= bw + 20) left = Math.max(a.left + 10, Math.min(left, a.right - bw - 10));
        var y = c.up ? c.top - CHOOSER_GAP - bh : c.bottom + CHOOSER_GAP;
        if (y >= 8 && y + bh <= vh - 8) return { left: left, top: y };
        // No room past it: beside it, level with its top, on whichever side fits.
        var x = c.right + CHOOSER_GAP;
        if (x + bw > vw - 8) x = c.left - CHOOSER_GAP - bw;
        return { left: x, top: Math.max(8, Math.min(c.top, vh - bh - 8)) };
    }

    function enterOffer(b) {
        var fresh = !offer || offer.el !== b.el;
        dropPicker();                       // from step 2, a colour or a dropdown switches too
        mode = 'pick';
        pending = null;
        offer = b;
        chosenEl = b.hl || b.via || b.el;
        lastHover = null;
        hoverBox.hidden = true;
        hoverTag.hidden = true;
        chosenBox.classList.remove('is-done');
        chosenTag.classList.remove('is-done');
        anchorColour = isColour(b) ? b.el : null;
        showOffer();
        if (fresh) moveBar(barSpot(), true);
    }

    function showOffer() {
        if (!offer || !ui) return;
        setStep(1);
        fillTag(chosenTag, '…', '', describe(offerDraft(offer)));
        place(chosenBox, chosenTag, chosenEl);
    }

    function acceptOffer() {
        if (!offer) return;
        var b = offer;
        offer = null;
        choose(b, { keepPlace: true });     // the bar stays by the swatch it was just used at
    }

    function start() {
        if (mode) return;
        buildBar();
        hoverBox = make('div', 'hk-outline', document.body);
        hoverTag = make('div', 'hk-tag', document.body);
        chosenBox = make('div', 'hk-outline is-chosen', document.body);
        chosenTag = make('div', 'hk-tag is-chosen', document.body);
        document.body.classList.add('hk-binding');
        LISTEN.forEach(function (l) { window.addEventListener(l[0], l[1], true); });
        document.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        anchorColour = null;
        overBar = false;
        toStep1();
        moveBar(barHome(), false);
        dodgeTimer = setInterval(dodge, 250);
    }

    function toStep1() {
        mode = 'pick';
        H.suspend(true);
        pending = null;
        offer = null;
        chosenEl = null;
        lastHover = null;
        dropPicker();
        if (doneTimer) { clearTimeout(doneTimer); doneTimer = 0; }
        [hoverBox, hoverTag, chosenBox, chosenTag].forEach(function (d) { d.hidden = true; });
        chosenBox.classList.remove('is-done');
        chosenTag.classList.remove('is-done');
        ui.note.hidden = true;
        anchorColour = null;
        setStep(1);
        moveBar(barHome(), true);
    }

    function stop() {
        if (!mode) return;
        mode = null;
        pending = null;
        offer = null;
        chosenEl = null;
        lastHover = null;
        if (valueTimer) { clearTimeout(valueTimer); valueTimer = 0; }
        if (doneTimer) { clearTimeout(doneTimer); doneTimer = 0; }
        if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; }
        if (dodgeTimer) { clearInterval(dodgeTimer); dodgeTimer = 0; }
        anchorColour = null;
        LISTEN.forEach(function (l) { window.removeEventListener(l[0], l[1], true); });
        document.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
        dropPicker();
        [ui && ui.bar, hoverBox, hoverTag, chosenBox, chosenTag].forEach(function (d) {
            if (d && d.parentNode) d.parentNode.removeChild(d);
        });
        ui = hoverBox = hoverTag = chosenBox = chosenTag = null;
        document.body.classList.remove('hk-binding');
        H.suspend(false);
        // A press still under way when the bar closed keeps its tail swallowed
        // until its click, so closing mid-press can't let the control act.
    }

    // From step 1, or from step 2 to switch to a different control.
    // opts.keepPlace: accepted from an offer — the bar stays where it was
    // used, instead of gliding back home.
    function choose(b, opts) {
        var el = b.el;
        dropPicker();
        offer = null;
        mode = 'key';
        pending = {
            id: newId(), combo: '', kind: b.kind, role: roleOf(el),
            target: locate(el),
            name: nameOf(el, b.via),
            where: whereOf(b.via || el)
        };
        if (b.kind === 'value') {
            pending.value = String(el.value);
            pending.valueText = valueTextOf(el);
        }
        chosenEl = b.hl || b.via || el;
        lastHover = null;
        hoverBox.hidden = true;
        hoverTag.hidden = true;
        fillTag(chosenTag, '…', '', describe(pending));
        place(chosenBox, chosenTag, chosenEl);
        ui.note.hidden = true;
        picker = H.picker({
            noteEl: ui.note,
            selfId: 'ctl:' + pending.id,
            emptyLabel: 'Press a key…',
            clearable: false,
            outsideCancels: false,           // clicking another control switches instead
            listenHint: false,               // the bar's own lines say what to do
            // Backspace has no key to remove yet: just keep listening.
            onChange: function (combo) { if (combo) commit(combo); else if (picker) picker.listen(); },
            onCancel: function () { stop(); }
        });
        setStep(2);
        picker.listen();
        if (!(opts && opts.keepPlace)) { anchorColour = null; moveBar(barHome(), true); }
    }

    function commit(combo) {
        if (!pending) return;
        pending.combo = combo;
        binds.push(pending);
        save();
        var made = pending;
        pending = null;
        mode = 'done';
        H.suspend(false);           // the new key works at once, bar or no bar
        dropPicker();               // its message about a moved key stays in the note
        fillTag(chosenTag, H.format(combo), '', describe(made));
        chosenTag.classList.add('is-done');
        chosenBox.classList.add('is-done');
        place(chosenBox, chosenTag, chosenEl);
        setStep(3, made);
        doneTimer = setTimeout(stop, DONE_MS);
    }

    // Buttons, checkboxes, radios: the press is TAKEN — pointerdown chooses,
    // and the rest of that press (mousedown, pointerup, mouseup, click) never
    // reaches the control, or choosing Delete would delete.
    function onPointerDown(e) {
        if (!mode || inBar(e.target)) return;
        // Done, and back to work: the bar has said its piece. The press goes
        // on to whatever it was for.
        if (mode === 'done') { stop(); return; }
        var b = bindableFrom(e.target);
        if (!b || b.opener) return;          // openers open: what they reveal is the point
        if (b.kind === 'value') {
            // A colour well opens its chooser on this very press: let it,
            // and start the offer now, so the bar is already waiting past it.
            if (isColour(b)) enterOffer(b);
            return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        swallowing = performance.now() + 1500;
        choose(b);
    }

    function choosing() { return mode === 'pick' || mode === 'key'; }

    // Always listening, and registered before bind mode's own listeners: a
    // press that bind mode took keeps its tail swallowed even when the bar
    // closes mid-press (Esc with the button still held), so the control can
    // never act on it.
    function swallow(e) {
        if (!swallowing) return;
        if (performance.now() > swallowing) { swallowing = 0; return; }
        if (inBar(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === 'click') swallowing = 0;
    }
    ['mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
        window.addEventListener(type, swallow, true);
    });

    // A click with no pointerdown before it — Enter or Space on a focused
    // button — chooses too.
    function onClick(e) {
        if (!choosing() || inBar(e.target)) return;
        var b = bindableFrom(e.target);
        // A colour well opened from the keyboard never had a pointerdown.
        if (isColour(b) && (!offer || offer.el !== b.el)) { enterOffer(b); return; }
        if (!b || b.opener || b.kind !== 'click') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(b);
    }

    // Sliders, dropdowns, colour wells, number fields: they work as usual,
    // and what they end on is the binding. A slider settles on pointerup (a
    // press that never moved the thumb binds the value it already has);
    // the rest on change. In step 2 this is also how a slider is re-set, or
    // another one taken instead.
    function onPointerUp(e) {
        if (!choosing() || inBar(e.target)) return;
        var b = bindableFrom(e.target);
        if (b && b.kind === 'value' && (b.via || b.el).type === 'range') chooseSoon(b);
    }

    function onChange(e) {
        if (!choosing() || inBar(e.target)) return;
        var b = bindableFrom(e.target);
        if (!b || b.kind !== 'value') return;
        if (b.offer) offerSoon(b); else chooseSoon(b);
    }

    // A colour chooser reports as it is dragged: the offer follows it live.
    function onInput(e) {
        if (!choosing() || inBar(e.target)) return;
        var b = bindableFrom(e.target);
        if (!isColour(b)) return;
        if (offer && offer.el === b.el) showOffer(); else enterOffer(b);
    }

    // Next tick: the control's own listeners have updated its readout by then.
    function chooseSoon(b) {
        if (valueTimer) return;
        valueTimer = setTimeout(function () {
            valueTimer = 0;
            if (choosing()) choose(b);
        }, 0);
    }

    function offerSoon(b) {
        setTimeout(function () {
            if (!choosing()) return;
            if (offer && offer.el === b.el) showOffer(); else enterOffer(b);
        }, 0);
    }

    // What a click would bind, outlined and named before anything is taken.
    function onPointerMove(e) {
        overBar = inBar(e.target);
        if (!choosing()) return;
        var b = inBar(e.target) ? null : bindableFrom(e.target);
        var hl = b ? (b.hl || b.via || b.el) : null;
        if (!hl || hl === chosenEl) {
            lastHover = null;
            hoverBox.hidden = true;
            hoverTag.hidden = true;
            return;
        }
        if (hl === lastHover && !hoverTag.hidden) return;
        lastHover = hl;
        // What a click on it will do — and an opener says it will only open.
        var verb = b.opener ? 'Opens'
            : b.kind === 'click' ? 'Click'
            : isColour(b) ? 'Pick a colour'
            : b.el.tagName === 'SELECT' ? 'Choose'
            : b.el.type === 'number' ? 'Type'
            : 'Set it, let go';
        hoverBox.classList.toggle('is-opener', !!b.opener);
        hoverTag.classList.toggle('is-opener', !!b.opener);
        fillTag(hoverTag, null, verb, nameOf(b.el, b.via));
        place(hoverBox, hoverTag, hl);
    }

    function onScroll(e) {
        if (chosenEl) place(chosenBox, chosenTag, chosenEl);
        lastHover = null;
        if (hoverBox) { hoverBox.hidden = true; hoverTag.hidden = true; }
        if (ui && e && e.type === 'resize') moveBar(barSpot(), false);
    }

    var LISTEN = [
        ['pointerdown', onPointerDown], ['pointerup', onPointerUp],
        ['click', onClick], ['change', onChange], ['input', onInput], ['pointermove', onPointerMove]
    ];

    // Ctrl+Shift+H opens bind mode and closes it; Esc closes it at step 1
    // and step 3 (at step 2 the key field owns Esc, and cancels). Capture,
    // so Esc here never also stops a recording (05n).
    window.addEventListener('keydown', function (e) {
        var ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.shiftKey && !e.altKey && (e.code === 'KeyH' || (e.key || '').toLowerCase() === 'h')) {
            if (H.isListening()) return;     // a picker has the keyboard, and says the key is taken
            if (document.querySelector('.delete-modal.show')) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.repeat) return;
            // After a save it means "and another"; mid-binding, "never mind".
            if (mode === 'done') toStep1();
            else if (mode) stop();
            else start();
            return;
        }
        if ((mode === 'pick' || mode === 'done') && e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            stop();
        }
    }, true);

    // ─── SETTINGS → HOTKEYS ─────────────────────────────────────
    var block = null, listEl = null, countEl = null, trigger = null, listNote = null;
    var renderDirty = false;

    function mountBlock() {
        if (block && block.isConnected) return true;
        var sec = findSection('Settings');
        var body = sec ? sec.querySelector('.section-body') : null;
        if (!body) return false;

        block = document.createElement('div');
        block.className = 'hk-block';

        var lbl = document.createElement('label');
        lbl.className = 'brush-section-label';
        lbl.textContent = 'Hotkeys';
        block.appendChild(lbl);

        var bindBtn = document.createElement('button');
        bindBtn.type = 'button';
        bindBtn.className = 'hk-bind-btn btn--block';
        var bl = document.createElement('span');
        bl.textContent = '+ Bind a control';
        var bk = document.createElement('span');
        bk.className = 'hk-cap';
        bk.textContent = H.format('Ctrl+Shift+KeyH');
        bindBtn.appendChild(bl);
        bindBtn.appendChild(bk);
        bindBtn.title = 'Then click a button, or set a slider and let go. The key you press next does exactly that, from anywhere.';
        bindBtn.addEventListener('click', function () { start(); });
        block.appendChild(bindBtn);

        // Folds open in place, like Interface's Visible sections above it.
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'hk-list-trigger btn--block';
        trigger.setAttribute('aria-expanded', 'false');
        trigger.title = 'Every hotkey you have made — give one a new key, or delete it';
        var tl = document.createElement('span');
        tl.className = 'hk-list-trigger-label';
        tl.textContent = 'Your hotkeys';
        countEl = document.createElement('span');
        countEl.className = 'hk-list-trigger-count';
        var chev = document.createElement('span');
        chev.className = 'hk-list-trigger-chev';
        chev.textContent = '▾';
        trigger.appendChild(tl);
        trigger.appendChild(countEl);
        trigger.appendChild(chev);
        block.appendChild(trigger);

        listEl = document.createElement('div');
        listEl.className = 'hk-list';
        listEl.hidden = true;
        block.appendChild(listEl);

        // One message line for every row's picker: only one listens at a time,
        // and a line outside the rows survives the list re-rendering.
        listNote = document.createElement('div');
        listNote.hidden = true;
        block.appendChild(listNote);

        trigger.addEventListener('click', function () { setOpen(listEl.hidden); });

        var vis = body.querySelector('.ui-vis-block');
        if (vis) vis.parentNode.insertBefore(block, vis.nextSibling);
        else body.insertBefore(block, body.firstChild);
        return true;
    }

    function setOpen(open) {
        if (!listEl) return;
        listEl.hidden = !open;
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) render();
    }

    function textBindings() {
        return H.list().filter(function (b) { return b.source === 'text'; });
    }

    function render() {
        if (!block || !block.isConnected) { if (!mountBlock()) return; }
        var texts = textBindings();
        var keyed = binds.filter(function (b) { return !!b.combo; }).length + texts.length;
        countEl.textContent = keyed ? String(keyed) : '';
        if (listEl.hidden) return;
        // Never pull a picker out from under a key being chosen.
        if (H.isListening() && listEl.contains(document.activeElement)) { renderDirty = true; return; }
        renderDirty = false;
        listEl.innerHTML = '';
        if (!binds.length && !texts.length) {
            var empty = document.createElement('div');
            empty.className = 'hk-empty';
            empty.textContent = 'No hotkeys yet. Press ' + H.format('Ctrl+Shift+KeyH') +
                ', then click a button or set a slider — or give a line in Text its own key.';
            listEl.appendChild(empty);
            return;
        }
        if (binds.length) {
            group('Controls');
            binds.forEach(function (b) {
                var found = !!resolve(b.target);
                listEl.appendChild(row({
                    combo: b.combo, selfId: 'ctl:' + b.id,
                    name: describe(b),
                    sub: [b.where, b.role].filter(Boolean).join(' · ') + (found ? '' : ' · not on screen'),
                    missing: !found,
                    onKey: function (combo) { setCombo(b.id, combo); },
                    delTitle: 'Delete this hotkey',
                    onDelete: function () { remove(b.id); }
                }));
            });
        }
        if (texts.length) {
            group('Text lines');
            texts.forEach(function (t) {
                listEl.appendChild(row({
                    combo: t.combo, selfId: t.id,
                    name: t.label, sub: 'Text · ' + t.does,
                    onKey: function (combo) { if (t.set) t.set(combo); },
                    delTitle: 'Take the key off this line — the text stays',
                    onDelete: function () { if (t.clear) t.clear(); }
                }));
            });
        }
    }

    function group(title) {
        var g = document.createElement('div');
        g.className = 'hk-group';
        g.textContent = title;
        listEl.appendChild(g);
    }

    function row(o) {
        var r = document.createElement('div');
        r.className = 'hk-row' + (o.missing ? ' is-missing' : '');
        var p = H.picker({
            value: o.combo, selfId: o.selfId, noteEl: listNote, clearable: false,
            onChange: function (combo) { o.onKey(combo); },
            onCancel: function () { if (renderDirty) render(); }
        });
        r.appendChild(p.el);
        var txt = document.createElement('div');
        txt.className = 'hk-row-text';
        var nm = document.createElement('div');
        nm.className = 'hk-row-name';
        nm.textContent = o.name;
        nm.title = o.name;
        var sub = document.createElement('div');
        sub.className = 'hk-row-sub';
        sub.textContent = o.sub;
        txt.appendChild(nm);
        txt.appendChild(sub);
        r.appendChild(txt);
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'hk-row-del btn--ghost';
        del.textContent = '×';
        del.title = o.delTitle;
        del.setAttribute('aria-label', o.delTitle);
        del.addEventListener('click', function () { o.onDelete(); });
        r.appendChild(del);
        return r;
    }

    H.onChange(render);

    // ─── A WORD WHEN A KEY CAN'T DO ITS JOB ─────────────────────
    var toastEl = null, toastTimer = 0;
    function toast(msg) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'hkToast';
            toastEl.setAttribute('role', 'status');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400);
    }

    // ─── BOOT ───────────────────────────────────────────────────
    load();
    // Settings is built on the mixer's own schedule (DCL → 800ms → rAF on the
    // web); poll for it the way 43 does rather than hook its slot.
    (function waitForSettings() {
        var tries = 0;
        var t = setInterval(function () {
            if (mountBlock()) { clearInterval(t); render(); }
            else if (++tries > 600) clearInterval(t);
        }, 100);
    })();

    window.HotkeyBinds = {
        start: start,
        stop: stop,
        isActive: function () { return !!mode; },
        list: function () { return binds.map(copy); },
        remove: remove,
        fire: function (id) { var b = byId(id); return b ? fire(b) : false; },
        // Settings → Hotkeys, opened (tours, tests)
        open: function () { mountBlock(); setOpen(true); }
    };
})();
