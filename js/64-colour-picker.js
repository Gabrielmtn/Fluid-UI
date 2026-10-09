// ═══════════════════════════════════════════════════════════════════
// 64-colour-picker.js — one colour picker for the whole app.
//
// Every colour well used to open the browser's own dialog: it can't be
// placed, has no recent colours, knows nothing about the palette, and
// closes the moment you click the canvas. That is also why the palette's
// [+] could only add whatever the brush dot held. This replaces it
// everywhere with one picker:
//   · OKLCH (default), HSL or RGB sliders; each track shows the colours
//     that slider would give, hatched where the screen can't show them
//   · hex field + copy, before/now swatch, recent colours
//   · an eyedropper with a loupe that samples a frozen copy of the frame
//     (the fluid keeps moving, so a live sample would flicker), committed
//     on release. Alt+click on the canvas does the same from anywhere.
//
// Where it shows up:
//   · as a popover from ANY input[type=color] (click is intercepted in the
//     capture phase, so the well's own input/change listeners keep working)
//   · inline under the palette's [+] (add a colour) and from a palette
//     colour's right-click menu (change it), with duplicates caught live
//
// PROVIDES: window.ColourPicker = { create, openFor, close, isOpen,
//   openInline, closeInline, inlineOpen, onPaletteRender, sample,
//   isSampling, recents, addRecent }
// Also window.showToast(text) when nothing else defined one.
// NEEDS: window.ColourMath (64a). Palette hooks from 01-config at call
// time: paletteActiveColours, addColorToPalette, replacePaletteColour.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var M = window.ColourMath;
    if (!M) { console.warn('[ColourPicker] 64a-colour-math.js is missing'); return; }

    var RECENT_KEY = 'palettes.recent';     // kept by Settings → Clear (09)
    var RECENT_MAX = 12;
    var SPACE_KEY = 'colourPicker.space';

    function el(tag, cls, parent, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }
    function smGet(k, d) {
        try {
            var sm = window.settingsManager;
            if (sm) { var v = sm.get(k, d); return (v === undefined || v === null) ? d : v; }
        } catch (_) {}
        return d;
    }
    function smSet(k, v) {
        try { if (window.settingsManager) window.settingsManager.set(k, v); } catch (_) {}
    }
    function brushInput() { return document.getElementById('colorPicker'); }

    // ── Toast (only if the app has none) ─────────────────────────────
    if (typeof window.showToast !== 'function') {
        var toastEl = null, toastTimer = null;
        window.showToast = function (text) {
            if (!toastEl) {
                toastEl = el('div', 'cp-toast', document.body);
                toastEl.setAttribute('role', 'status');
            }
            toastEl.textContent = text;
            toastEl.hidden = false;
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400);
        };
    }

    // ── Recent colours ───────────────────────────────────────────────
    // Colours you picked (a popover that changed something, a colour added
    // or changed in a palette, an eyedropper pick), newest first, no
    // repeats. Random rolls and palette steps are not picks.
    var recentListeners = [];
    function recents() {
        var r = smGet(RECENT_KEY, []);
        if (!Array.isArray(r)) return [];
        var out = [];
        r.forEach(function (h) { var n = M.normalizeHex(h); if (n && out.indexOf(n) < 0) out.push(n); });
        return out.slice(0, RECENT_MAX);
    }
    function addRecent(hex) {
        var h = M.normalizeHex(hex);
        if (!h) return;
        var r = recents().filter(function (x) { return x !== h; });
        r.unshift(h);
        smSet(RECENT_KEY, r.slice(0, RECENT_MAX));
        recentListeners.slice().forEach(function (fn) { try { fn(); } catch (_) {} });
    }

    // ── Colour spaces ────────────────────────────────────────────────
    // vals are the source of truth while you drag, so a hue survives
    // passing through grey and a chroma past the screen's reach is kept
    // (the hex is the nearest colour the screen can show).
    function wrap360(v) { return ((v % 360) + 360) % 360; }
    var SPACES = {
        oklch: {
            label: 'OKLCH',
            ch: [
                { key: 'L', name: 'Lightness', min: 0, max: 1, step: 0.01,
                  show: function (v) { return String(Math.round(v * 100)); },
                  read: function (s) { return parseFloat(s) / 100; } },
                { key: 'C', name: 'Chroma: how vivid', min: 0, max: 0.37, step: 0.005,
                  show: function (v) { return v.toFixed(3).replace(/^0\./, '.'); },
                  read: function (s) { return parseFloat(s); } },
                { key: 'H', name: 'Hue', min: 0, max: 360, step: 1, wrap: true,
                  show: function (v) { return String(Math.round(v) % 360); },
                  read: function (s) { return parseFloat(s); } }
            ],
            fromHex: function (hex, prev) {
                var l = M.hexToOklch(hex);
                if (!l) return prev ? prev.slice() : [1, 0, 0];
                if (l[1] < 0.002) { l[1] = 0; l[2] = prev ? prev[2] : 0; }
                l[1] = Math.min(l[1], 0.37);
                return l;
            },
            toHex: function (v) { return M.oklchToHex(v); },
            rgbAt: function (v) {
                var raw = M.oklchToRgbRaw(v);
                if (M.inGamut(raw)) return { rgb: raw.map(M.clamp01), ok: true };
                return { rgb: M.oklchToRgbRaw(M.gamutMapOklch(v)).map(M.clamp01), ok: false };
            },
            fits: function (v) { return M.oklchInGamut(v); }
        },
        hsl: {
            label: 'HSL',
            ch: [
                { key: 'H', name: 'Hue', min: 0, max: 360, step: 1, wrap: true,
                  show: function (v) { return String(Math.round(v) % 360); },
                  read: function (s) { return parseFloat(s); } },
                { key: 'S', name: 'Saturation', min: 0, max: 1, step: 0.01,
                  show: function (v) { return String(Math.round(v * 100)); },
                  read: function (s) { return parseFloat(s) / 100; } },
                { key: 'L', name: 'Lightness', min: 0, max: 1, step: 0.01,
                  show: function (v) { return String(Math.round(v * 100)); },
                  read: function (s) { return parseFloat(s) / 100; } }
            ],
            fromHex: function (hex, prev) {
                var rgb = M.hexToRgb(hex);
                if (!rgb) return prev ? prev.slice() : [0, 0, 1];
                var h = M.rgbToHsl(rgb);
                if (h[1] < 0.002 && prev) h[0] = prev[0];
                return h;
            },
            toHex: function (v) { return M.rgbToHex(M.hslToRgb(v)); },
            rgbAt: function (v) { return { rgb: M.hslToRgb(v), ok: true }; },
            fits: function () { return true; }
        },
        rgb: {
            label: 'RGB',
            ch: ['R', 'G', 'B'].map(function (k, i) {
                return { key: k, name: ['Red', 'Green', 'Blue'][i], min: 0, max: 1, step: 1 / 255,
                         show: function (v) { return String(Math.round(v * 255)); },
                         read: function (s) { return parseFloat(s) / 255; } };
            }),
            fromHex: function (hex, prev) { return M.hexToRgb(hex) || (prev ? prev.slice() : [1, 1, 1]); },
            toHex: function (v) { return M.rgbToHex(v); },
            rgbAt: function (v) { return { rgb: v.map(M.clamp01), ok: true }; },
            fits: function () { return true; }
        }
    };
    function savedSpace() { var s = smGet(SPACE_KEY, 'oklch'); return SPACES[s] ? s : 'oklch'; }

    var hatchCache = null;
    function hatch(ctx) {
        if (!hatchCache) {
            hatchCache = document.createElement('canvas');
            hatchCache.width = hatchCache.height = 6;
            var c = hatchCache.getContext('2d');
            c.strokeStyle = 'rgba(10, 11, 14, 0.6)';
            c.lineWidth = 2;
            c.beginPath(); c.moveTo(-1, 7); c.lineTo(7, -1); c.stroke();
        }
        return ctx.createPattern(hatchCache, 'repeat');
    }

    var PIPETTE_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
        '<path d="M10.2 2.6 13.4 5.8 11.9 7.3 11 6.4 5.4 12 2.6 13.4 4 10.6 9.6 5 8.7 4.1Z" fill="none" ' +
        'stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

    // ── The picker ───────────────────────────────────────────────────
    // opts: value, variant ('inline' | 'popover'), title, onInput(hex),
    // onCommit(hex), onEnter(hex), extra(api) → node, footer(api) → node
    function create(opts) {
        opts = opts || {};
        var spaceKey = savedSpace();
        var space = SPACES[spaceKey];
        var hex = M.normalizeHex(opts.value) || '#FFFFFF';
        var original = hex;
        var vals = space.fromHex(hex, null);
        var dragging = false;
        var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

        var root = el('div', 'cp');
        root.dataset.variant = opts.variant || 'inline';
        // Hotkeys leave anything inside alone (01a isTypingTarget): the
        // sliders take the arrow keys.
        root.setAttribute('data-owns-keys', '');

        if (opts.title) el('div', 'cp-title', root, opts.title);

        var head = el('div', 'cp-head', root);
        var sw = el('div', 'cp-swatch', head);
        sw.title = 'Before and now. Click the left half to go back.';
        var swOld = el('span', 'cp-swatch-old', sw);
        var swNew = el('span', 'cp-swatch-new', sw);
        var hexIn = el('input', 'cp-hex', head);
        hexIn.type = 'text';
        hexIn.maxLength = 7;
        hexIn.spellcheck = false;
        hexIn.setAttribute('aria-label', 'Hex code');
        var copyBtn = el('button', 'cp-copy btn--ghost btn--sm', head, 'Copy');
        copyBtn.type = 'button';
        copyBtn.title = 'Copy the hex code';
        var spaceSel = el('select', 'cp-space', head);
        spaceSel.setAttribute('aria-label', 'Colour space');
        spaceSel.title = 'OKLCH: equal steps look equal. HSL and RGB are here too.';
        Object.keys(SPACES).forEach(function (k) {
            var o = el('option', null, spaceSel, SPACES[k].label);
            o.value = k;
        });
        spaceSel.value = spaceKey;
        var dropBtn = el('button', 'cp-drop btn--ghost btn--icon', head);
        dropBtn.type = 'button';
        dropBtn.innerHTML = PIPETTE_SVG;
        dropBtn.title = 'Pick a colour from the canvas. Alt+click on the canvas does it too.';
        dropBtn.setAttribute('aria-label', 'Pick a colour from the canvas');

        var sliders = el('div', 'cp-sliders', root);
        var rows = [0, 1, 2].map(makeRow);
        var gamutNote = el('div', 'cp-gamut', root,
            'The screen can’t show this one, so the nearest colour is used.');
        gamutNote.hidden = true;

        var recHead = el('div', 'cp-recent-head', root, 'Recent');
        var recWrap = el('div', 'cp-recent', root);

        var api = {
            el: root,
            get: function () { return hex; },
            // From outside (the well changed, a sample, a recent): show it.
            set: function (h) {
                var n = M.normalizeHex(h);
                if (!n || n === hex) return;
                hex = n;
                vals = space.fromHex(n, vals);
                paint();
            },
            setOriginal: function (h) { var n = M.normalizeHex(h); if (n) { original = n; paint(); } },
            isBusy: function () {
                return dragging || root.contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName);
            },
            refresh: function () { paint(); },
            destroy: destroy
        };

        if (opts.extra) { var ex = opts.extra(api); if (ex) root.appendChild(ex); }
        if (opts.footer) { var ft = opts.footer(api); if (ft) root.appendChild(ft); }

        function makeRow(i) {
            var row = el('div', 'cp-row', sliders);
            var lab = el('span', 'cp-lab', row);
            var track = el('div', 'cp-track', row);
            track.tabIndex = 0;
            track.setAttribute('role', 'slider');
            var cv = el('canvas', 'cp-track-canvas', track);
            var thumb = el('span', 'cp-thumb', track);
            var num = el('input', 'cp-num', row);
            num.type = 'text';
            num.inputMode = 'decimal';
            num.spellcheck = false;
            var pid = null;
            function fromX(x) {
                var r = track.getBoundingClientRect();
                var t = r.width > 0 ? (x - r.left) / r.width : 0;
                t = Math.max(0, Math.min(1, t));
                var c = space.ch[i];
                return c.min + t * (c.max - c.min);
            }
            track.addEventListener('pointerdown', function (e) {
                if (e.button !== 0) return;
                e.preventDefault();
                try { track.focus({ preventScroll: true }); } catch (_) {}
                pid = e.pointerId;
                try { track.setPointerCapture(pid); } catch (_) {}
                dragging = true;
                root.classList.add('is-dragging');
                setChannel(i, fromX(e.clientX));
            });
            track.addEventListener('pointermove', function (e) {
                if (!dragging || e.pointerId !== pid) return;
                setChannel(i, fromX(e.clientX));
            });
            function end() {
                if (!dragging) return;
                dragging = false;
                root.classList.remove('is-dragging');
                try { track.releasePointerCapture(pid); } catch (_) {}
                pid = null;
                commit();
            }
            track.addEventListener('pointerup', end);
            track.addEventListener('pointercancel', end);
            track.addEventListener('keydown', function (e) {
                var c = space.ch[i], st = c.step * (e.shiftKey ? 10 : 1), v = vals[i], hit = true;
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += st;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= st;
                else if (e.key === 'Home') v = c.min;
                else if (e.key === 'End') v = c.max;
                else hit = false;
                if (hit) { e.preventDefault(); setChannel(i, v); }
            });
            track.addEventListener('keyup', function (e) {
                if (/^(Arrow|Home|End)/.test(e.key)) commit();
            });
            function applyNum() {
                var v = space.ch[i].read(num.value);
                if (!isFinite(v)) { paint(); return; }
                setChannel(i, v);
                commit();
            }
            num.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyNum(); num.blur(); }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); paint(); num.blur(); }
            });
            num.addEventListener('change', applyNum);
            return { row: row, lab: lab, track: track, cv: cv, thumb: thumb, num: num };
        }

        function setChannel(i, v) {
            var c = space.ch[i];
            if (!isFinite(v)) return;
            v = c.wrap ? wrap360(v) : Math.max(c.min, Math.min(c.max, v));
            vals[i] = v;
            hex = space.toHex(vals);
            paint();
            emitInput();
        }

        var inputRaf = 0;
        function emitInput() {
            if (!opts.onInput || inputRaf) return;
            inputRaf = requestAnimationFrame(function () {
                inputRaf = 0;
                opts.onInput(hex);
            });
            // A parked rAF (hidden window) must not swallow the change.
            setTimeout(function () {
                if (inputRaf) { cancelAnimationFrame(inputRaf); inputRaf = 0; opts.onInput(hex); }
            }, 120);
        }
        function commit() {
            if (inputRaf) { cancelAnimationFrame(inputRaf); inputRaf = 0; if (opts.onInput) opts.onInput(hex); }
            if (opts.onCommit) opts.onCommit(hex);
        }
        // A whole new colour at once (a recent, a sample, back to before).
        function pick(h) {
            var n = M.normalizeHex(h);
            if (!n) return;
            hex = n;
            vals = space.fromHex(n, vals);
            paint();
            if (opts.onInput) opts.onInput(hex);
            commit();
        }
        api.pick = pick;

        function drawTrack(i) {
            var r = rows[i];
            var w = Math.round(r.track.clientWidth * dpr), h = Math.round(r.track.clientHeight * dpr);
            if (w < 2 || h < 2) return;
            if (r.cv.width !== w) r.cv.width = w;
            if (r.cv.height !== h) r.cv.height = h;
            var ctx = r.cv.getContext('2d');
            var img = ctx.createImageData(w, h);
            var c = space.ch[i], tmp = vals.slice(), bad = new Array(w), any = false;
            for (var x = 0; x < w; x++) {
                tmp[i] = c.min + (x / (w - 1)) * (c.max - c.min);
                var res = space.rgbAt(tmp);
                var R = res.rgb[0] * 255, G = res.rgb[1] * 255, B = res.rgb[2] * 255;
                for (var y = 0; y < h; y++) {
                    var o = (y * w + x) * 4;
                    img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
                }
                bad[x] = !res.ok;
                if (!res.ok) any = true;
            }
            ctx.putImageData(img, 0, 0);
            if (any) {
                ctx.fillStyle = hatch(ctx);
                var x0 = -1;
                for (var xx = 0; xx <= w; xx++) {
                    var b = xx < w && bad[xx];
                    if (b && x0 < 0) x0 = xx;
                    if (!b && x0 >= 0) { ctx.fillRect(x0, 0, xx - x0, h); x0 = -1; }
                }
            }
        }

        function paint() {
            swOld.style.background = original;
            swNew.style.background = hex;
            if (document.activeElement !== hexIn) hexIn.value = hex;
            hexIn.classList.remove('is-bad');
            for (var i = 0; i < 3; i++) {
                var c = space.ch[i], r = rows[i];
                r.lab.textContent = c.key;
                r.lab.title = c.name;
                r.track.setAttribute('aria-label', c.name);
                r.track.setAttribute('aria-valuemin', String(c.min));
                r.track.setAttribute('aria-valuemax', String(c.max));
                r.track.setAttribute('aria-valuenow', String(+vals[i].toFixed(4)));
                r.track.setAttribute('aria-valuetext', c.key + ' ' + c.show(vals[i]));
                var t = (vals[i] - c.min) / (c.max - c.min);
                r.thumb.style.left = (Math.max(0, Math.min(1, t)) * 100) + '%';
                if (document.activeElement !== r.num) r.num.value = c.show(vals[i]);
                r.num.title = c.name;
                drawTrack(i);
            }
            gamutNote.hidden = space.fits(vals);
        }

        function renderRecents() {
            recWrap.innerHTML = '';
            var list = recents();
            if (!list.length) {
                el('span', 'cp-recent-empty', recWrap, 'Colours you pick show up here.');
                return;
            }
            list.forEach(function (h) {
                var chip = el('div', 'cp-chip', recWrap);
                chip.style.background = h;
                chip.title = h;
                chip.setAttribute('role', 'button');
                chip.tabIndex = 0;
                chip.addEventListener('click', function () { pick(h); });
                chip.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(h); }
                });
            });
        }
        recentListeners.push(renderRecents);

        swOld.addEventListener('click', function () { pick(original); });
        hexIn.addEventListener('input', function () {
            var v = hexIn.value.trim();
            if (v && v[0] !== '#') v = '#' + v;
            var n = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? M.normalizeHex(v) : null;
            hexIn.classList.toggle('is-bad', !n && v.length >= 4);
            if (!n || n === hex) return;
            hex = n;
            vals = space.fromHex(n, vals);
            var keep = hexIn.value;
            paint();
            hexIn.value = keep;
            emitInput();
        });
        hexIn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
                hexIn.value = hex;
                if (opts.onEnter) opts.onEnter(hex);
            } else if (e.key === 'Escape') {
                hexIn.value = hex;
                hexIn.blur();
            }
        });
        hexIn.addEventListener('blur', function () { hexIn.value = hex; hexIn.classList.remove('is-bad'); });
        hexIn.addEventListener('change', commit);
        copyBtn.addEventListener('click', function () {
            var done = function () {
                copyBtn.textContent = 'Copied';
                setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1200);
            };
            try {
                navigator.clipboard.writeText(hex).then(done, function () { hexIn.focus(); hexIn.select(); });
            } catch (_) { hexIn.focus(); hexIn.select(); }
        });
        spaceSel.addEventListener('change', function () {
            spaceKey = SPACES[spaceSel.value] ? spaceSel.value : 'oklch';
            space = SPACES[spaceKey];
            smSet(SPACE_KEY, spaceKey);
            vals = space.fromHex(hex, null);
            paint();
        });
        dropBtn.addEventListener('click', function () {
            if (sampling && sampling.owner === api) { cancelSampling(); return; }
            var on = sample({
                owner: api,
                current: hex,
                onPick: function (h) { pick(h); if (opts.onSample) opts.onSample(h); },
                onEnd: function () { dropBtn.classList.remove('active'); dropBtn.setAttribute('aria-pressed', 'false'); }
            });
            if (!on) return;
            dropBtn.classList.add('active');
            dropBtn.setAttribute('aria-pressed', 'true');
        });

        // Tracks have no width until the picker is in the page.
        var ro = null;
        if (typeof ResizeObserver === 'function') {
            ro = new ResizeObserver(function () { for (var i = 0; i < 3; i++) drawTrack(i); });
            ro.observe(sliders);
        }
        function destroy() {
            if (ro) { try { ro.disconnect(); } catch (_) {} ro = null; }
            var k = recentListeners.indexOf(renderRecents);
            if (k >= 0) recentListeners.splice(k, 1);
            if (sampling && sampling.owner === api) cancelSampling();
            if (root.parentNode) root.parentNode.removeChild(root);
        }

        renderRecents();
        paint();
        // Once laid out, the tracks can draw.
        setTimeout(paint, 0);
        return api;
    }

    // ── Popover for any colour well ─────────────────────────────────
    var pop = null;

    function titleFor(input) {
        if (input.id === 'colorPicker') return 'Brush colour';
        if (input.id === 'backgroundColorPicker') return 'Background';
        var t = input.getAttribute('aria-label') || input.title || '';
        t = t.split(/[.—(]/)[0].trim();
        return t || 'Colour';
    }
    function writeInput(input, hex, type) {
        var v = String(hex).toLowerCase();
        if (type === 'input' && input.value === v) return;
        input.value = v;
        if (pop && pop.input === input) pop.last = input.value;
        try { input.dispatchEvent(new Event(type, { bubbles: true })); } catch (_) {}
    }

    // The brush popover also carries the palette: in the Simple layout the
    // Palettes section is hidden, and this is where you see which palette
    // Palette mode steps through and switch it.
    function brushPaletteStrip(api) {
        var box = el('div', 'cp-pal');
        var headRow = el('div', 'cp-pal-head', box);
        el('span', 'cp-pal-label', headRow, 'Palette');
        var sel = el('select', 'cp-pal-select', headRow);
        sel.setAttribute('aria-label', 'Palette');
        sel.title = 'Choosing a palette turns Palette mode on: a new palette colour each stroke.';
        var row = el('div', 'cp-pal-row', box);
        var lastKey = '';
        function render(force) {
            var pals = window.curatedPalettes || [];
            var idx = window.currentPaletteIndex | 0;
            var cols = typeof window.paletteActiveColours === 'function' ? window.paletteActiveColours() : [];
            // The colour the next stroke paints is marked, as in the row:
            // any mode but Random, whose next colour is a surprise.
            var a0 = (window.multiArmColors || [])[0];
            var random = a0 ? a0.mode === 'random' : false;
            var now = M.normalizeHex((brushInput() || {}).value);
            var key = pals.map(function (p) { return p.name; }).join('|') + '#' + idx + '#' + cols.join(',') + '#' + random + now;
            if (!force && key === lastKey) return;
            lastKey = key;
            sel.innerHTML = '';
            pals.forEach(function (p, i) {
                var o = el('option', null, sel, p.name);
                o.value = String(i);
            });
            sel.value = String(idx);
            row.innerHTML = '';
            cols.forEach(function (h) {
                var chip = el('div', 'cp-chip', row);
                chip.style.background = h;
                chip.setAttribute('role', 'button');
                chip.tabIndex = 0;
                var on = !random && h === now;
                chip.classList.toggle('is-active', on);
                chip.title = h + (on ? '. The next stroke paints this one.' : '. Click to paint with it.');
                chip.addEventListener('click', function () { api.pick(h); });
                chip.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.pick(h); }
                });
            });
        }
        sel.addEventListener('change', function () {
            var i = parseInt(sel.value, 10);
            if (typeof window.applyPalette === 'function' && !isNaN(i)) window.applyPalette(i);
            render(true);
            var b = brushInput();
            if (b) { api.set(b.value); if (pop) pop.last = b.value; }
        });
        api.renderPalette = render;
        render(true);
        return box;
    }

    function placePopover(wrap, anchor) {
        var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        if (!r || (!r.width && !r.height)) r = { left: lastPointer.x, right: lastPointer.x, top: lastPointer.y, bottom: lastPointer.y };
        var w = wrap.offsetWidth, h = wrap.offsetHeight;
        var vw = window.innerWidth, vh = window.innerHeight;
        var x = r.left, y = r.bottom + 6;
        if (y + h > vh - 8) y = Math.max(8, r.top - h - 6);
        if (x + w > vw - 8) x = vw - w - 8;
        wrap.style.left = Math.max(8, x) + 'px';
        wrap.style.top = Math.max(8, Math.min(y, vh - h - 8)) + 'px';
    }

    function openFor(input) {
        if (!input) return;
        if (pop && pop.input === input) { close(); return; }
        close();
        var wrap = el('div', 'cp-pop');
        var grp = input.closest && input.closest('[data-group]');
        wrap.dataset.group = grp ? grp.dataset.group : 'core';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', titleFor(input));
        var bar = el('div', 'cp-pop-bar', wrap);
        el('span', 'cp-pop-title', bar, titleFor(input));
        var x = el('button', 'cp-pop-close btn--ghost btn--icon', bar, '×');
        x.type = 'button';
        x.title = 'Close (Esc)';
        x.setAttribute('aria-label', 'Close');
        var isBrush = input.id === 'colorPicker';
        var picker = create({
            value: input.value,
            variant: 'popover',
            onInput: function (h) { if (pop) pop.picked = true; writeInput(input, h, 'input'); },
            onCommit: function (h) { if (pop) pop.picked = true; writeInput(input, h, 'change'); },
            onSample: function (h) { addRecent(h); },
            extra: isBrush ? brushPaletteStrip : null
        });
        wrap.appendChild(picker.el);
        document.body.appendChild(wrap);
        pop = { wrap: wrap, picker: picker, input: input, original: M.normalizeHex(input.value), last: input.value, moved: false };
        placePopover(wrap, input);
        input.classList.add('cp-open');
        x.addEventListener('click', close);
        // Drag by the bar to move it off what you're painting.
        bar.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || e.target.closest('button')) return;
            e.preventDefault();
            var r0 = wrap.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, id = e.pointerId;
            try { bar.setPointerCapture(id); } catch (_) {}
            function mv(ev) {
                if (ev.pointerId !== id) return;
                pop && (pop.moved = true);
                wrap.style.left = Math.max(0, Math.min(window.innerWidth - 40, r0.left + ev.clientX - sx)) + 'px';
                wrap.style.top = Math.max(0, Math.min(window.innerHeight - 30, r0.top + ev.clientY - sy)) + 'px';
            }
            function up(ev) {
                if (ev.pointerId !== id) return;
                bar.removeEventListener('pointermove', mv);
                bar.removeEventListener('pointerup', up);
                bar.removeEventListener('pointercancel', up);
            }
            bar.addEventListener('pointermove', mv);
            bar.addEventListener('pointerup', up);
            bar.addEventListener('pointercancel', up);
        });
        // The well can change under us: Random and Palette mode load the
        // next colour after every stroke, presets and undo write it.
        pop.timer = setInterval(function () {
            if (!pop) return;
            if (!document.body.contains(input)) { close(); return; }
            if (pop.picker.renderPalette) pop.picker.renderPalette(false);
            if (pop.picker.isBusy() || input.value === pop.last) return;
            pop.last = input.value;
            pop.picker.set(input.value);
        }, 200);
        document.addEventListener('pointerdown', onPopOutside, true);
        document.addEventListener('keydown', onPopKey, true);
        window.addEventListener('resize', onPopResize);
    }
    function onPopOutside(e) {
        if (!pop || sampling) return;
        var t = e.target;
        if (pop.wrap.contains(t) || t === pop.input) return;
        // Painting doesn't close it: pick, paint, adjust, paint.
        if (t.closest && t.closest('#canvas-area')) return;
        // A menu this popover opened (a <select>'s list is native) is fine.
        close();
    }
    function onPopKey(e) {
        if (!pop || e.key !== 'Escape' || sampling) return;
        e.preventDefault();
        e.stopPropagation();
        close();
    }
    function onPopResize() { if (pop && !pop.moved) placePopover(pop.wrap, pop.input); }
    function close() {
        if (!pop) return;
        var p = pop;
        pop = null;
        clearInterval(p.timer);
        document.removeEventListener('pointerdown', onPopOutside, true);
        document.removeEventListener('keydown', onPopKey, true);
        window.removeEventListener('resize', onPopResize);
        p.input.classList.remove('cp-open');
        // Only what you picked here: in Random or Palette mode the well
        // moves on after every stroke, and those rolls aren't picks.
        var now = M.normalizeHex(p.input.value);
        if (p.picked && now && now !== p.original) addRecent(now);
        p.picker.destroy();
        if (p.wrap.parentNode) p.wrap.parentNode.removeChild(p.wrap);
    }

    // Every colour well opens this instead of the browser's dialog.
    // data-native-picker opts one out.
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || t.tagName !== 'INPUT' || t.type !== 'color' || t.disabled) return;
        if (t.hasAttribute('data-native-picker')) return;
        e.preventDefault();
        openFor(t);
    }, true);

    var lastPointer = { x: 100, y: 100 };
    window.addEventListener('pointerdown', function (e) { lastPointer.x = e.clientX; lastPointer.y = e.clientY; }, true);

    // ── Inline, under the palette's [+] ──────────────────────────────
    var inline = null;
    function chipWraps() { return document.querySelectorAll('#palettePreview .palette-chip-wrap'); }
    function markChips(matchHex, editHex) {
        var list = chipWraps();
        for (var i = 0; i < list.length; i++) {
            var w = list[i];
            w.classList.toggle('is-match', !!matchHex && w.dataset.hex === matchHex);
            w.classList.toggle('is-editing', !!editHex && w.dataset.hex === editHex);
        }
        var add = document.getElementById('paletteAddChip');
        if (add) {
            add.classList.toggle('active', !!inline && inline.mode === 'add');
            add.setAttribute('aria-expanded', inline && inline.mode === 'add' ? 'true' : 'false');
        }
    }
    function refreshInline() {
        if (!inline) { markChips('', ''); return; }
        var list = typeof window.paletteActiveColours === 'function' ? window.paletteActiveColours() : [];
        var h = inline.picker.get();
        var b = inline.primary;
        if (inline.mode === 'add') {
            var dup = list.indexOf(h) >= 0;
            b.disabled = dup;
            b.textContent = dup ? (h === inline.lastAdded ? 'Added' : 'Already in this palette') : 'Add to palette';
            markChips(dup ? h : '', '');
        } else {
            var same = h === inline.editHex;
            var other = !same && list.indexOf(h) >= 0;
            b.disabled = same || other;
            b.textContent = other ? 'Already in this palette' : 'Change it';
            markChips(other ? h : '', inline.editHex);
            // Its colour left the palette (removed, palette switched): stop.
            if (list.indexOf(inline.editHex) < 0) closeInline();
        }
    }
    function primaryInline() {
        if (!inline || inline.primary.disabled) return;
        var h = inline.picker.get();
        if (inline.mode === 'add') {
            if (typeof window.addColorToPalette === 'function' && window.addColorToPalette(h)) {
                inline.lastAdded = h;
                addRecent(h);
            }
            refreshInline();
        } else {
            if (typeof window.replacePaletteColour === 'function') window.replacePaletteColour(inline.editHex, h);
            addRecent(h);
            closeInline();
        }
    }
    // Where [+] starts: the brush colour, unless the palette has it already
    // (in Palette mode it always does: the dot holds the next palette
    // colour), which opened the picker on a disabled Add. Then your latest
    // pick it lacks, else its last colour turned a step round the hue
    // wheel, so Add is ready the moment the picker opens.
    function freshStart(brushHex) {
        var list = typeof window.paletteActiveColours === 'function' ? window.paletteActiveColours() : [];
        var b = M.normalizeHex(brushHex) || '#FFFFFF';
        if (list.indexOf(b) < 0) return b;
        var r = recents().filter(function (h) { return list.indexOf(h) < 0; });
        if (r.length) return r[0];
        var base = M.hexToOklch(list[list.length - 1] || b) || [0.7, 0.12, 0];
        if (base[1] < 0.04) base = [base[0], 0.12, base[2]];
        for (var k = 1; k < 12; k++) {
            var h = M.oklchToHex([base[0], base[1], wrap360(base[2] + 30 * k)]);
            if (list.indexOf(h) < 0) return h;
        }
        return b;
    }
    function openInline(o) {
        o = o || {};
        var host = document.getElementById('palettePickerHost');
        if (!host) return false;
        var mode = o.mode === 'edit' ? 'edit' : 'add';
        if (inline && mode === 'add' && inline.mode === 'add') { closeInline(); return true; }
        closeInline();
        var b = brushInput();
        var start = mode === 'edit' ? o.hex : freshStart(b ? b.value : '#FFFFFF');
        var state = { mode: mode, editHex: mode === 'edit' ? M.normalizeHex(o.hex) : null, lastAdded: null, host: host };
        inline = state;
        state.picker = create({
            value: start,
            variant: 'inline',
            title: mode === 'add' ? 'Add a colour' : 'Change this colour',
            onInput: refreshInline,
            onCommit: refreshInline,
            onEnter: primaryInline,
            footer: function () {
                var f = el('div', 'cp-foot');
                state.primary = el('button', 'cp-primary btn--emphasis btn--sm', f);
                state.primary.type = 'button';
                state.primary.addEventListener('click', primaryInline);
                var done = el('button', 'cp-secondary btn--ghost btn--sm', f, mode === 'add' ? 'Done' : 'Cancel');
                done.type = 'button';
                done.addEventListener('click', closeInline);
                return f;
            }
        });
        host.innerHTML = '';
        host.appendChild(state.picker.el);
        host.hidden = false;
        refreshInline();
        try { host.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        document.addEventListener('keydown', onInlineKey, true);
        return true;
    }
    function onInlineKey(e) {
        if (!inline || e.key !== 'Escape' || sampling || pop) return;
        var a = document.activeElement;
        // Escape in a field only leaves the field; from anywhere else it shuts.
        if (a && inline.host.contains(a) && /INPUT|SELECT/.test(a.tagName)) return;
        e.preventDefault();
        closeInline();
    }
    function closeInline() {
        if (!inline) return;
        var s = inline;
        inline = null;
        document.removeEventListener('keydown', onInlineKey, true);
        s.picker.destroy();
        s.host.hidden = true;
        s.host.innerHTML = '';
        markChips('', '');
    }

    // ── Eyedropper ───────────────────────────────────────────────────
    // A frozen copy of the frame is taken on press: the fluid keeps moving,
    // and a loupe over a live canvas flickers between colours. First the
    // GL canvas itself (instant), then the export compositor's frame with
    // picture layers and text, which replaces it and is shown over the
    // canvas so what you see is what you sample.
    var sampling = null;
    var LOUPE_N = 11, LOUPE_CELL = 12;

    function sample(o) {
        o = o || {};
        if (sampling) cancelSampling();
        var sim = document.getElementById('canvas');
        if (!sim || !sim.width || !sim.height) return false;
        var s = {
            owner: o.owner || null, onPick: o.onPick, onEnd: o.onEnd,
            pressing: !!o.press, current: M.normalizeHex(o.current) || M.normalizeHex((brushInput() || {}).value) || '#000000',
            sim: sim, snap: document.createElement('canvas'), data: null, w: 0, h: 0,
            hex: null, x: o.press ? o.press.clientX : lastPointer.x, y: o.press ? o.press.clientY : lastPointer.y,
            veil: null
        };
        sampling = s;
        grab(s, sim);
        if (window.fluidExport && typeof window.fluidExport.captureFrame === 'function') {
            try {
                window.fluidExport.captureFrame().then(function (comp) {
                    if (sampling !== s || !comp || !comp.width) return;
                    grab(s, comp);
                    showVeil(s);
                    update(s.x, s.y);
                }, function () {});
            } catch (_) {}
        }
        buildLoupe(s);
        document.body.classList.add('cp-sampling');
        window.addEventListener('pointermove', onSampleMove, true);
        window.addEventListener('pointerdown', onSampleDown, true);
        window.addEventListener('pointerup', onSampleUp, true);
        ['mousedown', 'mouseup', 'click', 'contextmenu', 'dblclick'].forEach(function (t) {
            window.addEventListener(t, swallowOnCanvas, true);
        });
        window.addEventListener('keydown', onSampleKey, true);
        window.addEventListener('blur', cancelSampling);
        update(s.x, s.y);
        return true;
    }
    function isSampling() { return !!sampling; }

    function grab(s, source) {
        s.w = source.width; s.h = source.height;
        s.snap.width = s.w; s.snap.height = s.h;
        var ctx = s.snap.getContext('2d', { willReadFrequently: true });
        try {
            ctx.drawImage(source, 0, 0);
            s.data = ctx.getImageData(0, 0, s.w, s.h).data;
        } catch (_) { s.data = null; }
    }
    function showVeil(s) {
        var area = document.getElementById('canvas-area');
        if (!area) return;
        if (!s.veil) {
            s.veil = el('div', 'cp-veil', document.body);
            s.veilCanvas = el('canvas', null, s.veil);
        }
        var a = area.getBoundingClientRect(), r = s.sim.getBoundingClientRect();
        s.veil.style.left = a.left + 'px';
        s.veil.style.top = a.top + 'px';
        s.veil.style.width = a.width + 'px';
        s.veil.style.height = a.height + 'px';
        var c = s.veilCanvas;
        c.width = s.w; c.height = s.h;
        c.getContext('2d').drawImage(s.snap, 0, 0);
        c.style.left = (r.left - a.left) + 'px';
        c.style.top = (r.top - a.top) + 'px';
        c.style.width = r.width + 'px';
        c.style.height = r.height + 'px';
    }
    function buildLoupe(s) {
        var lp = el('div', 'cp-loupe', document.body);
        lp.setAttribute('aria-hidden', 'true');
        var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        var size = LOUPE_N * LOUPE_CELL;
        var cv = el('canvas', 'cp-loupe-grid', lp);
        cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
        cv.style.width = size + 'px'; cv.style.height = size + 'px';
        var pill = el('div', 'cp-loupe-pill', lp);
        var old = el('span', 'cp-loupe-old', pill);
        old.style.background = s.current;
        old.title = 'Now';
        var nw = el('span', 'cp-loupe-new', pill);
        var txt = el('span', 'cp-loupe-hex', pill);
        el('div', 'cp-loupe-hint', lp, s.pressing ? 'Let go to pick' : 'Click to pick · Esc to stop');
        s.loupe = lp; s.loupeCanvas = cv; s.loupeNew = nw; s.loupeHex = txt; s.dpr = dpr;
        lp.hidden = true;
    }
    function pointToPixel(s, x, y) {
        var r = s.sim.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        var u = (x - r.left) / r.width, v = (y - r.top) / r.height;
        if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
        var area = document.getElementById('canvas-area');
        if (area) {
            var a = area.getBoundingClientRect();
            if (x < a.left || x >= a.right || y < a.top || y >= a.bottom) return null;
        }
        return { px: Math.floor(u * s.w), py: Math.floor(v * s.h) };
    }
    function pixelHex(s, px, py) {
        if (!s.data) return null;
        var o = (py * s.w + px) * 4, d = s.data, a = d[o + 3] / 255;
        // A transparent frame (transparent mode) reads over black.
        return M.rgbToHex([d[o] * a / 255, d[o + 1] * a / 255, d[o + 2] * a / 255]);
    }
    function update(x, y) {
        var s = sampling;
        if (!s) return;
        s.x = x; s.y = y;
        var p = pointToPixel(s, x, y);
        if (!p) { s.hex = null; s.loupe.hidden = true; return; }
        var h = pixelHex(s, p.px, p.py);
        s.hex = h;
        s.loupe.hidden = !h;
        if (!h) return;
        var ctx = s.loupeCanvas.getContext('2d');
        var W = s.loupeCanvas.width, cell = W / LOUPE_N, half = (LOUPE_N - 1) / 2;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0a0b0e';
        ctx.fillRect(0, 0, W, W);
        ctx.drawImage(s.snap, p.px - half, p.py - half, LOUPE_N, LOUPE_N, 0, 0, W, W);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var i = 1; i < LOUPE_N; i++) {
            var q = Math.round(i * cell) + 0.5;
            ctx.moveTo(q, 0); ctx.lineTo(q, W);
            ctx.moveTo(0, q); ctx.lineTo(W, q);
        }
        ctx.stroke();
        var c0 = Math.round(half * cell);
        ctx.lineWidth = 2 * s.dpr;
        ctx.strokeStyle = '#000';
        ctx.strokeRect(c0 - s.dpr, c0 - s.dpr, Math.round(cell) + 2 * s.dpr, Math.round(cell) + 2 * s.dpr);
        ctx.lineWidth = 1.5 * s.dpr;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(c0, c0, Math.round(cell), Math.round(cell));
        s.loupeCanvas.style.borderColor = h;
        s.loupeNew.style.background = h;
        s.loupeHex.textContent = h;
        // Up and to the right of the pointer, flipped near an edge.
        var lw = s.loupe.offsetWidth || 140, lh = s.loupe.offsetHeight || 180;
        var lx = x + 22, ly = y - lh - 22;
        if (lx + lw > window.innerWidth - 6) lx = x - lw - 22;
        if (ly < 6) ly = y + 22;
        s.loupe.style.left = lx + 'px';
        s.loupe.style.top = ly + 'px';
    }
    function overCanvas(e) {
        var area = document.getElementById('canvas-area');
        return !!(area && e.target && area.contains(e.target)) || !!(sampling && sampling.veil && sampling.veil.contains(e.target));
    }
    function stop(e) { e.preventDefault(); e.stopImmediatePropagation(); }
    function onSampleMove(e) {
        if (!sampling) return;
        update(e.clientX, e.clientY);
        if (overCanvas(e) || sampling.pressing) stop(e);
    }
    function onSampleDown(e) {
        var s = sampling;
        if (!s) return;
        if (e.button !== 0) { stop(e); cancelSampling(); return; }
        if (!overCanvas(e)) {
            // The eyedropper button toggles itself off in its own handler.
            if (s.owner && e.target.closest && e.target.closest('.cp-drop')) return;
            cancelSampling();
            return;
        }
        stop(e);
        s.pressing = true;
        update(e.clientX, e.clientY);
    }
    function onSampleUp(e) {
        var s = sampling;
        if (!s || !s.pressing) return;
        stop(e);
        update(e.clientX, e.clientY);
        var h = s.hex;
        endSampling();
        if (h && s.onPick) s.onPick(h);
    }
    function swallowOnCanvas(e) { if (sampling && overCanvas(e)) stop(e); }
    function onSampleKey(e) {
        if (!sampling) return;
        if (e.key === 'Escape') { stop(e); cancelSampling(); }
    }
    function endSampling() {
        var s = sampling;
        if (!s) return;
        sampling = null;
        window.removeEventListener('pointermove', onSampleMove, true);
        window.removeEventListener('pointerdown', onSampleDown, true);
        window.removeEventListener('pointerup', onSampleUp, true);
        ['mousedown', 'mouseup', 'click', 'contextmenu', 'dblclick'].forEach(function (t) {
            window.removeEventListener(t, swallowOnCanvas, true);
        });
        window.removeEventListener('keydown', onSampleKey, true);
        window.removeEventListener('blur', cancelSampling);
        document.body.classList.remove('cp-sampling');
        if (s.loupe && s.loupe.parentNode) s.loupe.parentNode.removeChild(s.loupe);
        if (s.veil && s.veil.parentNode) s.veil.parentNode.removeChild(s.veil);
        s.data = null;
        if (s.onEnd) s.onEnd();
    }
    function cancelSampling() { endSampling(); }

    // Where an Alt+click pick goes: the picker you have open, else the brush.
    function pickToTarget(h) {
        if (inline) { inline.picker.pick(h); addRecent(h); return; }
        if (pop) { pop.picker.pick(h); addRecent(h); return; }
        var b = brushInput();
        if (!b) return;
        writeInput(b, h, 'input');
        writeInput(b, h, 'change');
        addRecent(h);
    }
    // Alt+click (or Alt+drag, then let go) on the canvas: the eyedropper,
    // as in Photoshop. Alt alone does nothing in this window (no menu bar),
    // and nothing else uses Alt with a click on the canvas.
    window.addEventListener('pointerdown', function (e) {
        if (!e.altKey || e.button !== 0 || sampling || e.ctrlKey || e.metaKey || e.shiftKey) return;
        var area = document.getElementById('canvas-area');
        if (!area || !area.contains(e.target)) return;
        if (document.querySelector('.delete-modal.show')) return;
        stop(e);
        sample({ press: e, onPick: pickToTarget, current: inline ? inline.picker.get() : (pop ? pop.picker.get() : null) });
    }, true);

    // Called by 01-config after the colour row is rebuilt.
    function onPaletteRender() { if (inline) refreshInline(); else markChips('', ''); }

    window.ColourPicker = {
        create: create,
        openFor: openFor,
        close: close,
        isOpen: function () { return !!pop; },
        openInline: openInline,
        closeInline: closeInline,
        inlineOpen: function () { return !!inline; },
        onPaletteRender: onPaletteRender,
        sample: sample,
        isSampling: isSampling,
        cancelSampling: cancelSampling,
        recents: recents,
        addRecent: addRecent,
        SPACES: Object.keys(SPACES)
    };
})();
