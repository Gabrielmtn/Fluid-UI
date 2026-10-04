// ═══════════════════════════════════════════════════════════════════
// js/58-radial-menu.js — the radial menu: the main sliders as a wheel round
//   the pointer, with room for hotkeys (2026-09-30)
// LOAD ORDER: plain <script> after 48-hotkeys.js and 49-hotkey-binds.js
//   (its Settings block mounts under 49's, and it names and reads a slider
//   through 49's helpers). Everything else is read at event time.
// PROVIDES: window.RadialMenu
// USED BY: 05d (a mouse button set to Radial menu opens it, js/41), 20
//   (Stroke and replay's "Edit the menu" door).
//
// WHAT IT IS. Press E, or a mouse button set to Radial menu (the middle
// one, Mouse 3, out of the box), and a wheel opens round the pointer. Out
// of the box its items are the top bar's faders — Brush Size, Fluid,
// Viscosity, Isolation, Color Blend, Multi-Brush, Time, Density, Velocity —
// so the main settings are under the hand wherever it is on the canvas.
//
// A SLIDER ITEM is the real slider, in radial form: it fills from the hub
// outward — a shade lighter than the wedge, nothing louder — and shows the
// fader's own readout.
//   drag    press on it and pull away from the middle for more, back toward
//           it for less. The whole range is one wedge long.
//   scroll  hover it and turn the wheel: one notch is a small step (1% of
//           the fader, never less than one step of it).
// Both write the slider the way a hand on it does — its value, then 'input'
// (and 'change' once it rests) — so config, the top bar, presets and the
// room all hear it. Density and Time move along the PERCEPTUAL fader people
// see (js/20), and Brush Size along a log scale, so a notch or a pixel is
// the same size of change at the fine end as at the broad one.
//
// THE OTHER ITEMS are hotkeys without the keyboard. A CONTROL item is any
// button, checkbox, dropdown choice or colour in the app, chosen the way
// Ctrl+Shift+H chooses one (js/49's bind mode, started from Settings →
// Radial Menu with the menu as its destination): choosing the item does
// what that control's key would. So the rules about what a click means
// while choosing are 49's, once — a control that only OPENS something (More,
// Presets, a section folding) is never taken; a slider moved there goes on
// the wheel as a slider. A KEY item is a label and a key: choosing it
// presses that key (Hotkeys.press), one of the app's own shortcuts or a
// hotkey the person made.
//
// E was Quick Export's key until this took it. Export → Video goes on the
// menu like any other button.
//
// OPENING AND CLOSING. The menu works out which is meant:
//   hold   keep the key or button down. Letting go over a control or a
//          key item runs it; letting go after working a slider, or after moving out and
//          back to the middle, closes the menu. Letting go over a slider
//          that was not touched leaves the menu open for it.
//   tap    let go within TAP_MS, or without having moved: the menu stays
//          open. A click on a control or a key item runs it; sliders are dragged and
//          scrolled for as long as it is up. A click on the middle, E
//          again, Esc, or the mouse button that opened it (when that is
//          not the left one) closes it.
// OFF THE WHEEL NOTHING IS BLOCKED. Only the wheel itself takes the
// pointer: a press anywhere else closes the menu AND goes on to what it
// landed on — a stroke starts, a button is clicked — so clearing the menu
// never costs a click of its own. (The one press that is swallowed is a
// button set to Radial menu: passed on, it would only open the menu again.)
// Moves and the mouse wheel off the wheel are the app's as usual.
// A tap never chooses, wherever the pointer is when it ends: E tapped with
// the hand still travelling across the canvas must not fire whatever lay
// in its path.
// An item is picked by DIRECTION, from just outside the hub to a little
// past the ring, so a fast flick that overshoots still lands.
//
// Items are user-made content: written through to settingsManager
// 'hotkeys.radialMenu' the moment they change, like every hotkey. Until the
// list is first edited nothing is stored and the starting items show.
//
// Nothing here animates: overlays above the canvas that transition corrupt
// the GL frame in the desktop build.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var H = window.Hotkeys;
    if (!H) return;

    var KEY = 'hotkeys.radialMenu';
    var MAX_ITEMS = 12;
    var LABEL_MAX = 32;
    // What RESERVED (js/48) says of this menu's own key.
    var OWN_KEY_SAYS = 'already opens the radial menu';

    // The top bar's faders, in its order (20-mixer-layout's strip): the
    // starting items, clockwise from the top.
    var STRIP_SLIDERS = ['brushSize', 'curl', 'viscosity', 'velocityInfluence', 'colorBlend',
                         'multiplier', 'timeScale', 'densityDissipation', 'velocityDissipation'];
    // Sliders whose useful range spans decades: the wheel works them on a
    // log scale. Brush Size runs 0.001 to 100, and the sizes people paint
    // with are all in the bottom few percent of a straight line.
    var LOG_SLIDERS = { brushSize: true };

    function defaults() {
        return STRIP_SLIDERS.map(function (id) { return { id: 'd-' + id, kind: 'slider', target: { id: id } }; });
    }

    // ─── STORE ──────────────────────────────────────────────────
    // An item is one of:
    //   { id, kind: 'slider', target, name }     the slider itself, on the wheel
    //   { id, kind: 'click' | 'value', target, value, valueText, role, name, where }
    //                                            a control, worked as its key would (js/49's record)
    //   { id, kind: 'key', combo, label }        a key, pressed
    // `target` is 49's locator: the control's id, or where it lives and
    // what it says.
    var items = [];
    var listeners = [];

    function sm() { return window.settingsManager || null; }
    function B() { return window.HotkeyBinds || {}; }

    function cleanLabel(s) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
    }

    function str(v) { return typeof v === 'string' ? v.slice(0, 200) : ''; }

    function cleanTarget(t) {
        if (!t || typeof t !== 'object') return null;
        if (typeof t.id === 'string') return /^[\w-]+$/.test(t.id) ? { id: t.id } : null;
        if (typeof t.tag !== 'string') return null;
        try { return JSON.parse(JSON.stringify(t)); } catch (_) { return null; }
    }

    // Everything here can arrive from localStorage or a hand-edited blob.
    function coerce(list) {
        var out = [], seen = {};
        if (!Array.isArray(list)) return out;
        for (var i = 0; i < list.length && out.length < MAX_ITEMS; i++) {
            var it = list[i];
            if (!it || typeof it !== 'object') continue;
            var id = (typeof it.id === 'string' && it.id && !seen[it.id]) ? it.id : newId();
            var made = null, target;
            if (it.kind === 'slider') {
                target = cleanTarget(it.target);
                if (target) made = { id: id, kind: 'slider', target: target, name: str(it.name) };
            } else if (it.kind === 'click' || it.kind === 'value') {
                target = cleanTarget(it.target);
                if (target) {
                    made = { id: id, kind: it.kind, target: target, role: str(it.role), name: str(it.name), where: str(it.where) };
                    if (it.kind === 'value') { made.value = str(it.value); made.valueText = str(it.valueText); }
                }
            } else if (it.kind === 'key') {
                var combo = H.normalize(typeof it.combo === 'string' ? it.combo : '');
                if (combo) made = { id: id, kind: 'key', combo: combo, label: cleanLabel(it.label) || H.format(combo) };
            }
            if (!made) continue;
            out.push(made);
            seen[id] = true;
        }
        return out;
    }

    function load() {
        var data = null;
        try { data = sm() ? sm().get(KEY) : null; } catch (_) {}
        items = Array.isArray(data) ? coerce(data) : defaults();
    }

    function save() {
        try { if (sm()) sm().set(KEY, items.map(copy)); } catch (_) {}
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](); } catch (_) {}
        }
    }

    function copy(o) { return JSON.parse(JSON.stringify(o)); }

    function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    // Why this key cannot go on the menu, or '' when it can.
    function refusal(combo) {
        if (H.reservedBy(combo) === OWN_KEY_SAYS) return H.format(combo) + ' opens this menu, so it cannot be an item on it. Try another key.';
        if (H.isNative(combo)) return H.format(combo) + ' belongs to the system, and only a real press works it. Try another key.';
        return '';
    }

    function full() { return items.length >= MAX_ITEMS; }

    function push(it) {
        items.push(it);
        save();
        return copy(it);
    }

    // o: { slider: '<input id>' } | { combo, label }
    function add(o) {
        if (!o || full()) return null;
        if (typeof o.slider === 'string') {
            var e = document.getElementById(o.slider);
            if (!isRange(e) || sliderOn(e)) return null;
            return push({ id: newId(), kind: 'slider', target: { id: e.id }, name: sliderName(e) });
        }
        var combo = H.normalize(o.combo || '');
        if (!combo || refusal(combo)) return null;
        return push({ id: newId(), kind: 'key', combo: combo, label: cleanLabel(o.label) || suggestLabel(combo) });
    }

    // A control chosen in bind mode (js/49): `draft` is the record 49 would
    // have put on a key, `e` the control. A slider goes on as a slider;
    // anything else as what its key would do. Returns the item, or the
    // reason it cannot go on.
    function addControl(draft, e) {
        if (full()) return 'The radial menu holds ' + MAX_ITEMS + ' items. Take one off first.';
        var target = cleanTarget(draft && draft.target);
        if (!target) return 'That control cannot go on the menu.';
        if (isRange(e)) {
            if (sliderOn(e)) return sliderName(e) + ' is already on the radial menu.';
            return push({ id: newId(), kind: 'slider', target: target, name: sliderName(e) });
        }
        var it = { id: newId(), kind: draft.kind === 'value' ? 'value' : 'click', target: target,
                   role: str(draft.role), name: str(draft.name), where: str(draft.where) };
        if (it.kind === 'value') { it.value = str(draft.value); it.valueText = str(draft.valueText); }
        return push(it);
    }

    function remove(id) {
        var n = items.length;
        items = items.filter(function (it) { return it.id !== id; });
        if (items.length !== n) save();
    }

    function reset() {
        items = defaults();
        save();
    }

    // ─── SLIDERS ────────────────────────────────────────────────
    function isRange(e) { return !!(e && e.tagName === 'INPUT' && e.type === 'range'); }

    // The control an item points at, found again the way 49 finds one.
    function controlOf(it) {
        var t = it.target;
        if (!t) return null;
        if (B().resolve) return B().resolve(t);
        return t.id ? document.getElementById(t.id) : null;
    }

    function sliderEl(it) {
        var e = it.kind === 'slider' ? controlOf(it) : null;
        return isRange(e) ? e : null;
    }

    function sliderOn(e) {
        return items.some(function (it) { return sliderEl(it) === e; });
    }

    // What the slider is called where people see it. The Fluid channel's
    // label is the material picker, so its name is whatever that says.
    function sliderName(e) {
        var ch = e.closest('.mixer-channel');
        var sel = ch ? ch.querySelector('.ch-label select') : null;
        var opt = sel ? sel.options[sel.selectedIndex] : null;
        if (opt && opt.textContent.trim()) return opt.textContent.replace(/\s+/g, ' ').trim();
        var n = B().nameOf ? B().nameOf(e) : '';
        return n || e.id;
    }

    function sliderText(e) {
        return B().valueTextOf ? B().valueTextOf(e) : String(e.value);
    }

    // The slider an item drives, ready to work: the fader people see in
    // front of it (Density and Time have one), or the slider on a log scale.
    function sliderOf(it) {
        var e = sliderEl(it);
        if (!e) return null;
        var face = B().faceOf ? B().faceOf(e) : e;
        return { el: e, face: face, log: face === e && !!LOG_SLIDERS[e.id] && parseFloat(e.min) > 0,
                 acc: 0, settle: 0, dirty: false };
    }

    function rangeOf(f) {
        var min = parseFloat(f.min), max = parseFloat(f.max);
        if (!isFinite(min)) min = 0;
        if (!isFinite(max)) max = 100;
        return { min: min, max: max };
    }

    function clamp01(p) { return p < 0 ? 0 : p > 1 ? 1 : p; }

    // Where the slider is along its travel, 0 to 1.
    function fracOf(sl) {
        var r = rangeOf(sl.face), v = parseFloat(sl.face.value);
        if (!(r.max > r.min) || !isFinite(v)) return 0;
        if (sl.log) return clamp01(Math.log(Math.max(v, r.min) / r.min) / Math.log(r.max / r.min));
        return clamp01((v - r.min) / (r.max - r.min));
    }

    function decimalsOf(step) {
        var s = String(step), dot = s.indexOf('.');
        return dot === -1 ? 0 : s.length - dot - 1;
    }

    // Put the slider at fraction p of its travel, as a hand on it would:
    // the value on its own grid, then 'input'. True if it moved.
    function setFrac(sl, p) {
        var f = sl.face, r = rangeOf(f);
        if (!(r.max > r.min) || sl.el.disabled || f.disabled) return false;
        p = clamp01(p);
        var v = sl.log ? r.min * Math.pow(r.max / r.min, p) : r.min + p * (r.max - r.min);
        // Three figures is all a log slider's readout shows.
        if (sl.log) v = parseFloat(v.toPrecision(3));
        var step = parseFloat(f.step);
        if (step > 0) {
            v = r.min + Math.round((v - r.min) / step) * step;
            v = parseFloat(v.toFixed(decimalsOf(f.step)));
        }
        v = Math.min(r.max, Math.max(r.min, v));
        if (v === parseFloat(f.value)) return false;
        f.value = String(v);
        try { f.style.setProperty('--val', f.value); } catch (_) {}
        f.dispatchEvent(new Event('input', { bubbles: true }));
        sl.dirty = true;
        return true;
    }

    // 'change', the way letting go of a fader sends it.
    function rest(sl) {
        clearTimeout(sl.settle);
        sl.settle = 0;
        if (!sl.dirty) return;
        sl.dirty = false;
        if (sl.face.isConnected) sl.face.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // One turn of the wheel. A mouse notch counts as one whatever the OS
    // makes of it (a fast spin folded into one big delta counts up to
    // three); a touchpad's small deltas add up to notches. Same counting as
    // a slider key's wheel (js/49), so the two feel alike.
    var NOTCHES = 100;        // notches from one end of a fader to the other
    var LOG_NOTCHES = 150;    // ...of a log one: about 8% a notch on Brush Size, the canvas wheel's own step
    var SETTLE_MS = 250;

    function nudge(sl, e) {
        var d = e.deltaY;
        if (!d && e.shiftKey) d = e.deltaX;      // Shift turns some wheels sideways
        if (!d) return false;
        var px = e.deltaMode === 1 ? d * 100 / 3 : e.deltaMode === 2 ? d * 100 : d;
        var mag = Math.abs(px);
        var notches = mag >= 50 ? Math.min(3, Math.max(1, Math.floor(mag / 100 + 0.4))) : mag / 100;
        var dir = px < 0 ? 1 : -1;               // wheel up = more, as everywhere on the canvas
        var r = rangeOf(sl.face), step = parseFloat(sl.face.step);
        var per = sl.log ? 1 / LOG_NOTCHES : 1 / NOTCHES;
        if (!sl.log && step > 0 && r.max > r.min) per = Math.max(per, step / (r.max - r.min));
        if (sl.acc && (sl.acc > 0) !== (dir > 0)) sl.acc = 0;   // turning back starts clean
        sl.acc += dir * notches * per;
        var cur = fracOf(sl), want = cur + sl.acc;
        var moved = setFrac(sl, want);
        // Carried on when the grid swallowed it, dropped at the end of the travel.
        if (moved || want <= 0 || want >= 1) sl.acc = 0;
        if (moved) {
            clearTimeout(sl.settle);
            sl.settle = setTimeout(function () { rest(sl); }, SETTLE_MS);
        }
        return moved;
    }

    // ─── WHAT A KEY DOES, IN WORDS ──────────────────────────────
    function sentence(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

    // A hotkey someone made, by its own name; else what the app does with
    // the key ('already freezes and pauses the fluid' → 'freezes and…').
    function whatItDoes(combo) {
        var mine = H.find(combo);
        if (mine.length) return String(mine[0].label || '').replace(/^[“"]|[”"]$/g, '');
        var says = H.reservedBy(combo);
        return says ? says.replace(/^already /, '') : '';
    }

    function suggestLabel(combo) {
        return cleanLabel(sentence(whatItDoes(combo))) || H.format(combo);
    }

    // What an item is called on the wheel and in the list: a slider by its
    // name where people see it, a control the way Settings → Hotkeys says it
    // ('Material → Oil'), a key by its label.
    function labelOf(it) {
        if (it.kind === 'slider') { var e = sliderEl(it); return e ? sliderName(e) : (it.name || 'Slider'); }
        if (it.kind === 'key') return it.label;
        return (B().describe ? B().describe(it) : it.name) || it.name || 'Control';
    }

    // ─── RUNNING AN ITEM THAT IS NOT A SLIDER ───────────────────
    function run(it) {
        if (it.kind === 'slider') return;
        if (it.kind === 'key') {
            if (!whatItDoes(it.combo)) note(H.format(it.combo) + ' is not set to anything right now');
            H.press(it.combo);
            return;
        }
        // Says so itself when its control is not on screen.
        if (B().run) B().run(it);
    }

    var noteEl = null, noteTimer = 0;
    function note(msg) {
        if (!noteEl) {
            noteEl = document.createElement('div');
            noteEl.id = 'radialNote';
            noteEl.setAttribute('role', 'status');
            document.body.appendChild(noteEl);
        }
        noteEl.textContent = msg;
        noteEl.hidden = false;
        clearTimeout(noteTimer);
        noteTimer = setTimeout(function () { noteEl.hidden = true; }, 2400);
    }

    // ─── THE WHEEL ──────────────────────────────────────────────
    // Sizes in CSS px at --ui-scale 1; the wheel grows with the interface.
    var R_HUB = 26;          // inside this nothing is picked: the way to cancel
    var R_IN = 34;
    var R_OUT = 124;         // ...and more per item past ROOMY
    var ROOMY = 6;
    var R_PER_ITEM = 10;
    var LABEL_AT = 0.66;     // where along a wedge its words sit: out where it is wide
    var REACH = 64;          // how far past the ring a direction still picks
    var MOVE_PX = 4;         // the pointer has to move before it picks anything
    var TAP_MS = 200;        // let go sooner than this and it was a tap, not a hold
    var REFRESH_MS = 200;    // sliders moved by something else while the wheel is up
    var SVG = 'http://www.w3.org/2000/svg';

    var root = null;         // the menu's layer; only the wheel in it takes the pointer
    var st = null;           // the open menu's state, or null

    var mouse = { x: NaN, y: NaN };
    window.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, true);

    function uiScale() {
        var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
        return (v > 0 && isFinite(v)) ? Math.max(0.8, Math.min(2, v)) : 1;
    }

    function el(tag, cls, parent) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (parent) parent.appendChild(d);
        return d;
    }

    function svgEl(tag, cls, parent) {
        var d = document.createElementNS(SVG, tag);
        if (cls) d.setAttribute('class', cls);
        if (parent) parent.appendChild(d);
        return d;
    }

    function pt(r, a) { return (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2); }

    // A ring segment from angle a0 to a1 (clockwise on screen).
    function sector(r0, r1, a0, a1) {
        var large = (a1 - a0) > Math.PI ? 1 : 0;
        return 'M' + pt(r1, a0) + 'A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + pt(r1, a1) +
               'L' + pt(r0, a1) + 'A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + pt(r0, a0) + 'Z';
    }

    function arc(r, a0, a1) {
        var large = (a1 - a0) > Math.PI ? 1 : 0;
        return 'M' + pt(r, a0) + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + pt(r, a1);
    }

    function build(cx, cy, list, sliders) {
        if (!root) {
            root = document.createElement('div');
            root.id = 'radialMenu';
            root.dataset.group = 'system';
            root.setAttribute('role', 'menu');
            root.setAttribute('aria-label', 'Radial menu');
            document.body.appendChild(root);
        }
        root.textContent = '';
        var s = uiScale(), n = list.length;
        var rHub = R_HUB * s, rIn = R_IN * s;
        var rOut = (R_OUT + Math.max(0, n - ROOMY) * R_PER_ITEM) * s;
        // Kept whole on screen: near an edge the wheel opens beside the
        // pointer rather than under it.
        var m = rOut + 8;
        if (window.innerWidth > 2 * m) cx = Math.max(m, Math.min(cx, window.innerWidth - m));
        if (window.innerHeight > 2 * m) cy = Math.max(m, Math.min(cy, window.innerHeight - m));

        var wheel = el('div', 'radial-wheel', root);
        wheel.style.left = cx + 'px';
        wheel.style.top = cy + 'px';
        // The disc that takes the pointer: the wheel and nothing round it.
        var hit = el('div', 'radial-hit', wheel);
        hit.style.left = hit.style.top = (-rOut) + 'px';
        hit.style.width = hit.style.height = (2 * rOut) + 'px';
        var svg = svgEl('svg', 'radial-svg', null);
        svg.setAttribute('width', String(2 * rOut + 4));
        svg.setAttribute('height', String(2 * rOut + 4));
        svg.setAttribute('viewBox', [-rOut - 2, -rOut - 2, 2 * rOut + 4, 2 * rOut + 4].join(' '));
        svg.style.left = (-rOut - 2) + 'px';
        svg.style.top = (-rOut - 2) + 'px';
        wheel.appendChild(svg);
        var step = n ? (2 * Math.PI / n) : 0;
        var rLab = rIn + (rOut - rIn) * (n > 2 ? LABEL_AT : 0.5);
        var pad = n > 1 ? 1.5 * s / ((rIn + rOut) / 2) : 0;   // a hairline between items
        var labelW = Math.max(50 * s, Math.min(104 * s, n > 2 ? step * rLab * 0.95 : 104 * s));
        var parts = [];
        for (var i = 0; i < n; i++) {
            var mid = -Math.PI / 2 + i * step;          // the first item sits at the top
            var a0 = mid - step / 2 + pad, a1 = mid + step / 2 - pad;
            var p = svgEl('path', 'radial-wedge' + (sliders[i] ? ' is-slider' : ''), svg);
            p.setAttribute('d', n === 1
                ? sector(rIn, rOut, mid - Math.PI, mid) + sector(rIn, rOut, mid, mid + Math.PI)
                : sector(rIn, rOut, a0, a1));
            var part = { mid: mid, a0: n === 1 ? mid - Math.PI : a0, a1: n === 1 ? mid + Math.PI - 1e-4 : a1,
                         wedge: p, fill: null, thumb: null, label: null, val: null };
            if (sliders[i]) {
                part.fill = svgEl('path', 'radial-fill', svg);
                part.thumb = svgEl('path', 'radial-thumb', svg);
            }
            var lab = el('div', 'radial-label' + (sliders[i] ? ' is-slider' : ''), wheel);
            lab.setAttribute('role', 'menuitem');
            lab.style.maxWidth = labelW + 'px';
            lab.style.left = (rLab * Math.cos(mid)) + 'px';
            lab.style.top = (rLab * Math.sin(mid)) + 'px';
            el('span', 'radial-label-text', lab).textContent = labelOf(list[i]);
            if (sliders[i]) part.val = el('span', 'radial-label-val', lab);
            else if (list[i].kind === 'key') el('span', 'radial-label-key', lab).textContent = H.format(list[i].combo);
            part.label = lab;
            parts.push(part);
        }
        svgEl('circle', 'radial-hub', svg).setAttribute('r', String(rHub));
        el('div', 'radial-hub-x', wheel).textContent = '×';
        if (!n) {
            var empty = el('div', 'radial-empty', wheel);
            empty.style.top = (rHub + 8) + 'px';
            empty.textContent = 'Nothing on the menu yet. Add items in Settings → Radial Menu.';
        }
        root.hidden = false;
        return { cx: cx, cy: cy, rHub: rHub, rIn: rIn, rOut: rOut, reach: rOut + REACH * s, step: step, parts: parts };
    }

    // A slider item as its slider stands now: the fill out to its value, a
    // quiet line on the fill's edge, and the fader's own readout.
    function paint(i) {
        var sl = st.sliders[i], p = st.g.parts[i];
        if (!sl) return;
        var f = fracOf(sl);
        var r = st.g.rIn + f * (st.g.rOut - st.g.rIn);
        p.fill.setAttribute('d', f > 0.002 ? sector(st.g.rIn, r, p.a0, p.a1) : '');
        p.thumb.setAttribute('d', arc(r, p.a0, p.a1));
        var txt = sliderText(sl.el);
        if (p.val.textContent !== txt) p.val.textContent = txt;
        var off = !!(sl.el.disabled || sl.face.disabled);
        p.wedge.classList.toggle('is-off', off);
        p.label.classList.toggle('is-off', off);
    }

    function paintAll() {
        if (!st) return;
        for (var i = 0; i < st.sliders.length; i++) paint(i);
    }

    // On the wheel itself (the hub included).
    function inWheel(x, y) {
        return Math.hypot(x - st.g.cx, y - st.g.cy) <= st.g.rOut + 1;
    }

    // The item in the direction of (x, y), or -1: the hub, or too far out.
    // `far` reaches a little past the ring, for a held flick that overshoots;
    // without it only the wheel itself counts, which is where a press lands.
    function hotAt(x, y, far) {
        var n = st.items.length;
        if (!n) return -1;
        var dx = x - st.g.cx, dy = y - st.g.cy, d = Math.hypot(dx, dy);
        if (d < st.g.rHub || d > (far ? st.g.reach : st.g.rOut + 1)) return -1;
        var a = Math.atan2(dy, dx) + Math.PI / 2;
        a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        return Math.round(a / st.g.step) % n;
    }

    function setHot(i) {
        if (i === st.hot) return;
        var ps = st.g.parts;
        if (st.hot >= 0) { ps[st.hot].wedge.classList.remove('is-hot'); ps[st.hot].label.classList.remove('is-hot'); }
        st.hot = i;
        if (i >= 0) { ps[i].wedge.classList.add('is-hot'); ps[i].label.classList.add('is-hot'); }
    }

    // Where the pointer is now. Nothing is picked until it has moved from
    // where the menu opened: a wheel pushed in from the screen's edge opens
    // with the pointer already over an item, and a tap must not take it.
    function track(x, y) {
        st.x = x; st.y = y;
        if (!st.moved && Math.hypot(x - st.ox, y - st.oy) < MOVE_PX) return;
        st.moved = true;
        var i = hotAt(x, y, !!st.hold || st.pressed);
        if (Math.hypot(x - st.g.cx, y - st.g.cy) >= st.g.rHub) st.left = true;
        setHot(i);
    }

    // ── Dragging a slider ──
    // How far out the pointer is along item i's own spoke.
    function along(i, x, y) {
        var m = st.g.parts[i].mid;
        return (x - st.g.cx) * Math.cos(m) + (y - st.g.cy) * Math.sin(m);
    }

    // From where the slider IS, by how far the hand moves: a press never
    // jumps the value to the spot it landed on.
    function dragStart(i, x, y) {
        st.drag = { i: i, f0: fracOf(st.sliders[i]), p0: along(i, x, y) };
        st.g.parts[i].wedge.classList.add('is-dragging');
    }

    function dragMove(x, y) {
        var d = st.drag, sl = st.sliders[d.i];
        var f = d.f0 + (along(d.i, x, y) - d.p0) / (st.g.rOut - st.g.rIn);
        if (setFrac(sl, f)) {
            st.adjusted = true;
            paint(d.i);
            requestAnimationFrame(paintAll);     // some readouts are written a frame late
        }
    }

    function dragEnd() {
        var d = st.drag;
        st.drag = null;
        st.g.parts[d.i].wedge.classList.remove('is-dragging');
        rest(st.sliders[d.i]);
    }

    // opts: { x, y: where (default: the pointer), key: the code of the key
    //         held to open it, pointerId + button: the mouse button held to
    //         open it (pointerId may be missing: a touch) }
    function open(opts) {
        opts = opts || {};
        // The touch whose pointerdown just closed the menu (below) reaches
        // 05d's touchstart too: that is not a second ask to open it.
        if (typeof opts.button === 'number' && performance.now() - shutAt < SHUT_MS) return false;
        if (st) close();
        var x = (typeof opts.x === 'number') ? opts.x : mouse.x;
        var y = (typeof opts.y === 'number') ? opts.y : mouse.y;
        if (!isFinite(x) || !isFinite(y)) {
            // The pointer has not moved since the page loaded: the middle of the canvas.
            var area = document.getElementById('canvas-area');
            var r = area ? area.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            x = r.left + r.width / 2;
            y = r.top + r.height / 2;
        }
        var hold = null;
        if (opts.key) hold = { key: opts.key };
        else if (typeof opts.button === 'number') hold = { button: opts.button, pointerId: (opts.pointerId != null ? opts.pointerId : null) };
        // A slider that is not in the page right now has no wedge.
        var list = [], sliders = [];
        items.forEach(function (it) {
            var sl = it.kind === 'slider' ? sliderOf(it) : null;
            if (it.kind === 'slider' && !sl) return;
            list.push(copy(it));
            sliders.push(sl);
        });
        st = { items: list, sliders: sliders, hold: hold, opener: (typeof opts.button === 'number' ? opts.button : null),
               hot: -1, moved: false, left: false, pressed: false, adjusted: false, drag: null, closeOnUp: false,
               ox: x, oy: y, x: x, y: y, t0: performance.now(), g: null, timer: 0 };
        st.g = build(x, y, list, sliders);
        paintAll();
        st.timer = setInterval(paintAll, REFRESH_MS);
        LISTEN.forEach(function (l) { window.addEventListener(l[0], l[1], true); });
        window.addEventListener('wheel', onWheel, { capture: true, passive: false });
        window.addEventListener('blur', close);
        return true;
    }

    function close() {
        if (!st) return;
        if (st.drag) dragEnd();
        clearInterval(st.timer);
        // A wheel's 'change' still owed goes out now rather than SETTLE_MS on.
        st.sliders.forEach(function (sl) { if (sl) rest(sl); });
        st = null;
        LISTEN.forEach(function (l) { window.removeEventListener(l[0], l[1], true); });
        window.removeEventListener('wheel', onWheel, { capture: true });
        window.removeEventListener('blur', close);
        if (root) { root.hidden = true; root.textContent = ''; }
    }

    function choose(i) {
        var it = st.items[i];
        close();
        if (it) run(it);
    }

    // The key or button that opened the menu came up.
    function letGo() {
        var held = (performance.now() - st.t0) >= TAP_MS;
        var it = st.hot >= 0 ? st.items[st.hot] : null;
        if (held && it && it.kind !== 'slider') { choose(st.hot); return; }
        // A slider was worked while it was down: the hold was the visit. And
        // out, then back to the middle: never mind.
        if (held && (st.adjusted || (st.left && !it))) { close(); return; }
        st.hold = null;                              // the menu stays
    }

    function buttonBit(btn) { return btn === 0 ? 1 : btn === 1 ? 4 : btn === 2 ? 2 : 0; }

    function eat(e) { e.preventDefault(); e.stopImmediatePropagation(); }

    // Presses and moves ON THE WHEEL stop here. A pointerUP is never
    // stopped: 05d ends a stroke on its window pointerup, and a stroke
    // still down when E opened the menu has to hear its button come up.
    var shutAt = 0, SHUT_MS = 120;

    function strokeLive() { var p = window.pointer; return !!(p && p.down); }

    // A right button let go would open the browser's menu on whatever is
    // under the pointer once the wheel is gone.
    var noMenuUntil = 0;
    document.addEventListener('contextmenu', function (e) {
        if (st || performance.now() < noMenuUntil) e.preventDefault();
    }, true);

    function holdsPointer(e) {
        return !!(st.hold && typeof st.hold.button === 'number'
            && (st.hold.pointerId == null || st.hold.pointerId === e.pointerId));
    }

    function onPointerMove(e) {
        if (st.drag) {
            st.x = e.clientX; st.y = e.clientY;
            dragMove(e.clientX, e.clientY);
            e.stopPropagation();
            return;
        }
        track(e.clientX, e.clientY);
        // The holding button came up somewhere its pointerup never reached
        // (off the window): a move with its bit clear says so.
        if (holdsPointer(e) && e.pointerType === 'mouse' && e.buttons !== undefined
            && !(e.buttons & buttonBit(st.hold.button))) letGo();
        // Off the wheel the pointer is the app's again (its brush cursor
        // follows it) — but not a stroke that was down when the menu
        // opened: that one waits where it was.
        if (st && (st.pressed || strokeLive() || inWheel(e.clientX, e.clientY))) e.stopPropagation();
    }

    function onPointerDown(e) {
        if (st.pressed) { eat(e); return; }          // a second button on top of a press
        if (!inWheel(e.clientX, e.clientY)) {
            // Off the wheel: the menu goes, and the press goes on to what it
            // landed on, as if the menu had not been there. A button set to
            // Radial menu is the exception — passed on, it would open the
            // menu again under itself — so that one only closes it.
            var opens = !!(window.ButtonModes && window.ButtonModes.modeFor(e.button) === 'radial');
            close();
            if (opens) { shutAt = performance.now(); eat(e); }
            return;
        }
        eat(e);
        track(e.clientX, e.clientY);
        st.moved = true;                 // a press is a choice, moved or not
        var i = hotAt(e.clientX, e.clientY);
        setHot(i);
        st.pressed = true;
        // The button that opened the menu closes it, wherever it lands —
        // unless it is the left one, which is the hand that works the wheel.
        st.closeOnUp = !st.hold && st.opener != null && st.opener !== 0 && e.button === st.opener;
        if (!st.closeOnUp && i >= 0 && st.sliders[i]) dragStart(i, e.clientX, e.clientY);
    }

    function onPointerUp(e) {
        e.preventDefault();
        if (e.button === 2) noMenuUntil = performance.now() + 400;
        if (holdsPointer(e) && !st.pressed) {
            track(e.clientX, e.clientY);
            letGo();
            return;
        }
        if (!st.pressed) return;
        st.pressed = false;
        if (st.closeOnUp) { close(); return; }
        if (st.drag) { dragEnd(); return; }          // the menu stays for the next slider
        var i = hotAt(e.clientX, e.clientY, true);
        if (i < 0) close();
        else if (st.items[i].kind !== 'slider') choose(i);
    }

    // Over a slider the mouse wheel is that slider's; elsewhere on the menu
    // it is nobody's (the brush must not change size under the hub). Off the
    // menu it is the app's as usual: the brush, a panel scrolling.
    function onWheel(e) {
        if (!st.drag && !inWheel(e.clientX, e.clientY)) return;
        eat(e);
        if (st.drag) return;
        var i = hotAt(e.clientX, e.clientY);
        if (i >= 0) { st.moved = true; setHot(i); }
        var sl = i >= 0 ? st.sliders[i] : null;
        if (!sl) return;
        if (nudge(sl, e)) {
            st.adjusted = true;
            paint(i);
            requestAnimationFrame(paintAll);
        }
    }

    function isOwnKey(e) {
        var k = e.key || '';
        return k.length === 1 && k.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    }

    function onKeyDown(e) {
        // The key held to open it, repeating.
        if (st.hold && st.hold.key && e.code === st.hold.key) { eat(e); return; }
        if (e.key === 'Escape' || isOwnKey(e)) { eat(e); if (!e.repeat) close(); return; }
        // A lone modifier changes nothing; any other key is meant for the
        // app, so the menu gets out of its way.
        if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
        close();
    }

    function onKeyUp(e) {
        if (st.hold && st.hold.key && e.code === st.hold.key) { eat(e); letGo(); }
    }

    var LISTEN = [
        ['pointermove', onPointerMove], ['pointerdown', onPointerDown], ['pointerup', onPointerUp],
        ['pointercancel', function () { close(); }],
        ['keydown', onKeyDown], ['keyup', onKeyUp]
    ];

    // ─── E ──────────────────────────────────────────────────────
    // The menu's own key, guarded the way 05n guards the app's other plain
    // letters. Document, bubble: a hotkey picker that is listening (window
    // capture, js/48) takes the press first, and says E is taken.
    function typing(t) {
        if (window.__isTypingTarget) return window.__isTypingTarget(t);
        var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(t && t.isContentEditable);
    }

    document.addEventListener('keydown', function (e) {
        if (st || e.defaultPrevented || !isOwnKey(e) || typing(e.target)) return;
        e.preventDefault();
        if (e.repeat) return;
        if (document.querySelector('.delete-modal.show')) return;          // a dialog has the keyboard
        if (window.HotkeyBinds && window.HotkeyBinds.isActive()) return;   // choosing a control to bind
        open({ key: e.code || 'KeyE' });
    });

    // ─── SETTINGS → RADIAL MENU ─────────────────────────────────
    var block = null, listEl = null, addLabel = null, addPicker = null, addNote = null, resetBtn = null;
    var autoLabel = '';      // the label the last key suggested, while it is still untouched

    function settingsSection() {
        var secs = document.querySelectorAll('#sidebar-right .sidebar-section, #sidebar-left .sidebar-section');
        for (var i = 0; i < secs.length; i++) {
            var t = secs[i].querySelector('.section-title');
            if (t && t.textContent.replace(/\s+/g, ' ').trim() === 'Settings') return secs[i];
        }
        return null;
    }

    function mountBlock() {
        if (block && block.isConnected) return true;
        var sec = settingsSection();
        var body = sec ? sec.querySelector('.section-body') : null;
        if (!body) return false;

        // .hk-block: Ctrl+Shift+H leaves everything in it alone (js/49).
        block = el('div', 'hk-block radial-block');
        el('label', 'brush-section-label', block).textContent = 'Radial Menu';
        var how = el('div', 'hk-empty radial-how', block);
        how.textContent = 'Press ' + H.format('KeyE') + ', or a mouse button set to Radial menu in Stroke and replay. '
            + 'Drag a slider away from the middle for more, or hover it and scroll for small steps.';

        listEl = el('div', 'radial-list', block);

        // Any control in the app, chosen by using it: 49's bind mode, with
        // this menu as where the choice goes.
        if (B().start) {
            var pickBtn = el('button', 'radial-pick-btn btn--block', block);
            pickBtn.type = 'button';
            pickBtn.textContent = '+ Add from the interface';
            pickBtn.title = 'Then move a slider, click a button or a checkbox, or choose in a dropdown: it goes on the menu. '
                + 'Menus, More and sections still open and close as usual, so you can reach what is inside.';
            pickBtn.addEventListener('click', function () {
                if (full()) { say('The menu holds ' + MAX_ITEMS + ' items. Take one off first.', true); return; }
                say('');
                B().start({ to: DEST });
            });
        }

        var addRow = el('div', 'radial-add', block);
        addLabel = el('input', 'radial-add-label', addRow);
        addLabel.type = 'text';
        addLabel.maxLength = LABEL_MAX;
        addLabel.placeholder = 'Or a key: label';
        addLabel.title = 'An item that presses a key for you: what it is called on the menu';
        addLabel.setAttribute('aria-label', 'Label for a new key item');
        addNote = document.createElement('div');
        addPicker = H.picker({
            press: true,
            refuse: refusal,
            noteEl: addNote,
            emptyLabel: 'Its key',
            hint: 'The key this item presses: one of the app’s shortcuts, or a hotkey you made.',
            onChange: function (combo) {
                // A label nobody typed follows the key.
                if (!combo) { if (addLabel.value === autoLabel) addLabel.value = ''; autoLabel = ''; return; }
                if (!addLabel.value || addLabel.value === autoLabel) {
                    autoLabel = suggestLabel(combo);
                    addLabel.value = autoLabel;
                }
            }
        });
        addRow.appendChild(addPicker.el);
        var addBtn = el('button', 'radial-add-btn', addRow);
        addBtn.type = 'button';
        addBtn.textContent = 'Add';
        addBtn.title = 'Put this label and key on the radial menu';
        addBtn.addEventListener('click', onAdd);
        addLabel.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } });
        block.appendChild(addNote);

        resetBtn = el('button', 'btn--ghost radial-reset', block);
        resetBtn.type = 'button';
        resetBtn.textContent = 'Back to the starting items';
        resetBtn.title = 'Replace the list with the top bar’s sliders, the items the menu came with';
        resetBtn.addEventListener('click', onReset);

        var after = body.querySelector('.hk-block:not(.radial-block)') || body.querySelector('.ui-vis-block');
        if (after) after.parentNode.insertBefore(block, after.nextSibling);
        else body.insertBefore(block, body.firstChild);
        return true;
    }

    function say(text, warn) {
        if (!addNote) return;
        addNote.textContent = text || '';
        addNote.hidden = !text;
        if (warn) addNote.dataset.tone = 'warn'; else delete addNote.dataset.tone;
    }

    // Where bind mode sends a chosen control when it was started from here.
    var DEST = {
        title: 'Add to the radial menu',
        what: 'the radial menu',
        pickLines: ['Move a slider and let go, click a button or a checkbox, or choose in a dropdown.',
                    'Menus and lists still open, so you can reach what’s inside. Esc cancels.'],
        doneSay: '✓ On the radial menu',
        doneLines: ['Press ' + H.format('KeyE') + ' to open the menu.',
                    'Take it off again in Settings → Radial Menu.'],
        add: function (draft, e) {
            var made = addControl(draft, e);
            if (typeof made === 'string') return made;
            say('“' + labelOf(made) + '” is on the menu.');
            return { shown: (made.kind === 'slider' ? 'Slider · ' : '') + labelOf(made) };
        }
    };

    // Where a slider lives, for its row: the top bar, or its section.
    function sliderHome(e) {
        if (e.closest('#sidebar-left')) return 'Brush bar';
        if (e.closest('.mixer-channel')) return 'Top bar';
        var sec = e.closest('#sidebar-right .sidebar-section, #sidebar-left .sidebar-section');
        var t = sec ? sec.querySelector('.section-title') : null;
        return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function onAdd() {
        var combo = addPicker.getValue();
        if (full()) { say('The menu holds ' + MAX_ITEMS + ' items. Take one off first.', true); return; }
        if (!combo) { addPicker.listen(); say('Press the key this item should press.'); return; }
        var made = add({ label: addLabel.value, combo: combo });
        if (!made) { say(refusal(combo) || 'That key cannot go on the menu.', true); return; }
        addLabel.value = '';
        autoLabel = '';
        addPicker.setValue('');
        say('“' + made.label + '” is on the menu.');
    }

    function sameAsDefaults() {
        var d = defaults();
        if (d.length !== items.length) return false;
        for (var i = 0; i < d.length; i++) {
            if (items[i].kind !== 'slider' || !items[i].target || items[i].target.id !== d[i].target.id) return false;
        }
        return true;
    }

    function onReset() {
        var go = function () { reset(); say('The starting items are back.'); };
        if (typeof window.appConfirm !== 'function') { go(); return; }
        window.appConfirm({
            title: 'Go back to the starting items?',
            message: 'The radial menu goes back to the top bar’s sliders. Items you added are taken off.',
            confirmLabel: 'Replace the list'
        }).then(function (yes) { if (yes) go(); });
    }

    function render() {
        if (!block || !block.isConnected) { if (!mountBlock()) return; }
        listEl.textContent = '';
        if (!items.length) {
            el('div', 'hk-empty', listEl).textContent = 'Nothing on the menu yet. Add a slider or a control below.';
        }
        items.forEach(function (it) {
            var r = el('div', 'hk-row radial-row', listEl);
            if (it.kind === 'key') el('span', 'hk-cap', r).textContent = H.format(it.combo);
            var txt = el('div', 'hk-row-text', r);
            var nm = el('div', 'hk-row-name', txt);
            nm.textContent = labelOf(it);
            nm.title = nm.textContent;
            var sub = el('div', 'hk-row-sub', txt);
            var ok = true;
            if (it.kind === 'slider') {
                var e = sliderEl(it);
                ok = !!e;
                sub.textContent = e ? ['Slider', sliderHome(e)].filter(Boolean).join(' · ') : 'Slider · not on screen';
            } else if (it.kind === 'key') {
                var what = sentence(whatItDoes(it.combo));
                ok = !!what;
                sub.textContent = what || 'Not set to anything right now';
            } else {
                ok = !!controlOf(it);
                var does = it.role === 'toggle' ? 'toggles' : it.kind === 'value' ? 'sets' : 'clicks';
                sub.textContent = [it.where, does].filter(Boolean).join(' · ') + (ok ? '' : ' · not on screen');
            }
            sub.title = sub.textContent;
            if (!ok) r.classList.add('is-missing');
            var del = el('button', 'hk-row-del btn--ghost', r);
            del.type = 'button';
            del.textContent = '×';
            del.title = 'Take “' + nm.textContent + '” off the menu';
            del.setAttribute('aria-label', del.title);
            del.addEventListener('click', function () { remove(it.id); say(''); });
        });
        resetBtn.hidden = sameAsDefaults();
    }

    listeners.push(render);
    // What a key does moves with the hotkeys people make and delete.
    if (typeof H.onChange === 'function') H.onChange(render);

    // Settings → Radial Menu, opened and on screen (Stroke and replay's
    // "Edit the menu", tours, tests).
    function openEditor() {
        if (!mountBlock()) return false;
        render();
        var sec = block.closest('.sidebar-section');
        if (sec && typeof window.openSidebarSection === 'function') window.openSidebarSection(sec);
        // The section opens over most of a second, and the sidebar scrolls
        // smoothly: aim once it has started to open, and again once it has.
        var aim = function () { try { block.scrollIntoView({ block: 'center' }); } catch (_) {} };
        setTimeout(aim, 80);
        setTimeout(aim, 1100);
        return true;
    }

    // ─── BOOT ───────────────────────────────────────────────────
    load();
    // Settings is built on the mixer's own schedule; poll for it the way 49
    // does, and let 49's block land first so this one sits under it.
    (function waitForSettings() {
        var tries = 0;
        var t = setInterval(function () {
            var ready = !!document.querySelector('#sidebar-right .hk-block:not(.radial-block)') || tries > 50;
            if (ready && mountBlock()) { clearInterval(t); say(''); render(); }
            else if (++tries > 600) clearInterval(t);
        }, 100);
    })();

    window.RadialMenu = {
        MAX_ITEMS: MAX_ITEMS,
        open: open,
        close: close,
        isOpen: function () { return !!st; },
        items: function () { return items.map(copy); },
        add: add,
        addControl: function (draft, e) { var r = addControl(draft, e); return typeof r === 'string' ? r : copy(r); },
        remove: remove,
        reset: reset,
        run: function (id) {
            for (var i = 0; i < items.length; i++) if (items[i].id === id) { run(items[i]); return true; }
            return false;
        },
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        openEditor: openEditor
    };
})();
