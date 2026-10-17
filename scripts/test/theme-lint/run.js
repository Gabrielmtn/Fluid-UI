// Walnut & Copper theme consistency checker (headless Chrome, read-only).
//
//   node scripts/test/theme-lint/run.js                      # report only
//   node scripts/test/theme-lint/run.js --check              # exit 1 if a count went up
//   node scripts/test/theme-lint/run.js --update             # write the baseline
//
// Flags: --widths 1920,1440 (or WxH; "none" skips the drawer sweep)
//        --small 1000x480,760x700,1200x500 (compact sizes, overlap only; "none" skips)
//        --out DIR (default prep/work/theme-lint), --drawers REGEX (debug: only these)
//        --check [BASELINE.json] / --update [BASELINE.json] (default prep/baseline/theme-lint.json)
//
// Boots the app with the shared driver (own static server, scratch profile,
// reduced motion, --disable-gpu-compositing). At each width it scans the top
// bar (#mixer-strip) and the left sidebar head, then opens every drawer of
// both sidebars alone (a click on its .section-title, the others closed) and
// scans its front and open tray. At the compact sizes (js/13: body.compact-ui,
// the strip moves into #sidebar-right) it opens the right bar the way js/13
// does (Sidebars.right.fold(false), never persisted) and checks overlaps.
// Checks: clipped-text, wrapped-pane, native-control, off-theme-font,
// off-palette, inner-box, label-style, overlap.
// It never types, never persists, and clicks nothing but drawer titles.
// See README.md beside this file for what each check means.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { boot, sleep } = require('../radial-menu/driver');

const ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_OUT = path.join(ROOT, 'prep', 'work', 'theme-lint');
const DEFAULT_BASELINE = path.join(ROOT, 'prep', 'baseline', 'theme-lint.json');
const HEIGHTS = { 2560: 1440, 1920: 1080, 1680: 1050, 1600: 900, 1440: 900, 1366: 768, 1280: 800 };
const CHECKS = ['clipped-text', 'wrapped-pane', 'native-control', 'off-theme-font', 'off-palette', 'inner-box', 'label-style', 'overlap'];
const OUTLIER_SHARE = 0.10;   // label signatures used by fewer than this share of labels are outliers

function sizeList(v, dflt) {
    if (v == null) return dflt;
    if (v === 'none' || v === '') return [];
    return v.split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const m = /^(\d+)(?:x(\d+))?$/.exec(s);
        if (!m) throw new Error('bad size ' + s);
        const w = +m[1], h = m[2] ? +m[2] : (HEIGHTS[w] || Math.round(w * 9 / 16));
        return { w, h, label: w + 'x' + h };
    });
}

function parseArgs(argv) {
    const o = { widths: sizeList('1920,1440'), small: sizeList('1000x480,760x700,1200x500'), out: DEFAULT_OUT, check: null, update: null, only: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const val = () => (argv[i + 1] != null && !argv[i + 1].startsWith('--')) ? argv[++i] : null;
        if (a === '--widths') o.widths = sizeList(val() || '1920,1440');
        else if (a === '--small') o.small = sizeList(val() || 'none');
        else if (a === '--out') o.out = path.resolve(val() || DEFAULT_OUT);
        else if (a === '--check') o.check = path.resolve(val() || DEFAULT_BASELINE);
        else if (a === '--update') o.update = path.resolve(val() || DEFAULT_BASELINE);
        else if (a === '--drawers') o.only = new RegExp(val() || '.', 'i');
        else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 11).join('\n')); process.exit(0); }
        else throw new Error('unknown flag ' + a);
    }
    return o;
}

// ─────────────────────────────────────────────────────────────────────────
// Page side: installed as window.__themeLint. Reads layout and computed
// style only; writes nothing to the app.
// ─────────────────────────────────────────────────────────────────────────
function pageLib() {
    var THEME_FONTS = { 'michroma': 1, 'share tech mono': 1, 'libre franklin': 1 };
    // Classes that only say what state a node is in: left out of paths so a
    // path names the same node whatever its state.
    var STATE = /^(active|collapsed|expanded|open|opened|shut|checked|selected|focus|focused|hover|disabled|hidden|ui-hidden|locked|playing|on|off|lit|pressed|drag-over|dragging|mp-peer-touch|wc-open|is-[\w-]+|has-[\w-]+)$/;
    var NO_TEXT = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, OPTION: 1, OPTGROUP: 1, SELECT: 1, TEXTAREA: 1, TITLE: 1 };
    // Controls, and the theme's panes: they may draw their own frame.
    var CONTROL = 'button, input, select, textarea, canvas, svg, img, video, iframe, a[href], kbd, '
        + '[role=button], [role=radio], [role=checkbox], [role=switch], [role=option], [role=slider], [role=tab], '
        + '[role=listbox], [role=combobox], [role=spinbutton], [role=textbox], [role=menuitem], [role=menuitemradio], '
        + '[role=menuitemcheckbox], [contenteditable=""], [contenteditable="true"], .btn, .wc-opt';
    var PANE = 'button, .btn, [role=radio], [role=checkbox], [role=option], .wc-opt';
    var INTERACTIVE = 'button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=slider], [role=radio], '
        + '[role=checkbox], [role=switch], [role=combobox], [role=spinbutton], [role=tab], [role=option], [tabindex]:not([tabindex="-1"])';

    var cache = new Map();
    function cs(e) { var s = cache.get(e); if (!s) { s = getComputedStyle(e); cache.set(e, s); } return s; }
    function zoom(e) { return e.currentCSSZoom || 1; }
    function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    function r1(n) { return Math.round(n * 10) / 10; }
    function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function short(s, n) { s = squash(s); n = n || 60; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    // ── paths ──
    function segBase(e) {
        if (e.id) return '#' + e.id;
        var c = [].slice.call(e.classList).filter(function (x) { return !STATE.test(x); }).slice(0, 2);
        return e.tagName.toLowerCase() + (c.length ? '.' + c.join('.') : '');
    }
    function seg(e) {
        var s = segBase(e);
        if (e.id || !e.parentElement) return s;
        var sib = [].filter.call(e.parentElement.children, function (x) { return x.tagName === e.tagName; });
        if (sib.length > 1 && sib.some(function (x) { return x !== e && segBase(x) === s; })) s += ':nth-of-type(' + (sib.indexOf(e) + 1) + ')';
        return s;
    }
    function cssPath(e) {
        var parts = [];
        for (var x = e; x && x !== document.body && x !== document.documentElement && parts.length < 4; x = x.parentElement) {
            parts.unshift(seg(x));
            if (x.id) break;
        }
        return parts.join(' > ');
    }
    function label(e) {
        if (!e) return '';
        var t = e.getAttribute && (e.getAttribute('aria-label') || '');
        if (e.tagName === 'SELECT') return short(((e.options[e.selectedIndex] || {}).text || '') || t, 50);
        var txt = '', w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null);
        for (var n = w.nextNode(); n && txt.length < 80; n = w.nextNode()) if (!NO_TEXT[n.parentElement.tagName] && !n.parentElement.closest('select')) txt += ' ' + n.nodeValue;
        txt = squash(txt);
        if (!txt && e.tagName === 'INPUT') txt = e.type + (e.value && e.type !== 'range' ? ' ' + e.value : '');
        return short(txt || t || e.title || '', 50);
    }

    // ── geometry and visibility ──
    function padBox(a) {
        var r = a.getBoundingClientRect(), s = cs(a), z = zoom(a);
        var bl = px(s.borderLeftWidth), br = px(s.borderRightWidth), bt = px(s.borderTopWidth), bb = px(s.borderBottomWidth);
        var sbx = Math.max(0, a.offsetWidth - a.clientWidth - bl - br), sby = Math.max(0, a.offsetHeight - a.clientHeight - bt - bb);
        return { left: r.left + bl * z, right: r.right - (br + sbx) * z, top: r.top + bt * z, bottom: r.bottom - (bb + sby) * z };
    }
    // Ancestors (and optionally the node) that clip, per axis. Horizontally any
    // overflow but visible hides what sticks out (a sidebar never scrolls
    // sideways on purpose); vertically only hidden / clip does, and nothing
    // above a vertical scroller does, since scrolled content is not cut off.
    function clippers(e, self) {
        var out = [], scrolledY = false;
        for (var a = self ? e : e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            var s = cs(a), contain = /paint|strict|content/.test(s.contain || '');
            var x = contain || s.overflowX !== 'visible', y = !scrolledY && (contain || s.overflowY === 'hidden' || s.overflowY === 'clip');
            if (x || y) out.push({ el: a, x: x, y: y });
            if (s.overflowY === 'auto' || s.overflowY === 'scroll') scrolledY = true;
        }
        return out;
    }
    function hiddenBy(r, list) {
        for (var i = 0; i < list.length; i++) {
            var c = list[i], b = padBox(c.el);
            if (c.x && (r.right <= b.left + 1 || r.left >= b.right - 1)) return c.el;
            if (c.y && (r.bottom <= b.top + 1 || r.top >= b.bottom - 1)) return c.el;
        }
        return null;
    }
    function opacityOf(e) { var o = 1; for (var x = e; x && x.nodeType === 1; x = x.parentElement) { o *= px(cs(x).opacity); if (o < 0.1) break; } return o; }
    // Rendered for a viewer: has a box, not visibility hidden, not see-through,
    // not visually-hidden (sr-only), not cut away whole by an ancestor.
    function visible(e, keepTransparent) {
        if (!e || !e.isConnected) return false;
        var r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) return false;
        if (!keepTransparent && opacityOf(e) < 0.1) return false;
        var s = cs(e);
        if (s.clip && s.clip !== 'auto') return false;
        if (/inset\(50%\)/.test(s.clipPath || '')) return false;
        return !hiddenBy(r, clippers(e, false));
    }

    // ── text ──
    function lineRects(node) {
        var rg = document.createRange(); rg.selectNodeContents(node);
        return [].filter.call(rg.getClientRects(), function (r) { return r.width > 0.5 && r.height > 0.5; });
    }
    function union(rs) {
        var u = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        rs.forEach(function (r) { u.left = Math.min(u.left, r.left); u.top = Math.min(u.top, r.top); u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom); });
        u.width = u.right - u.left; u.height = u.bottom - u.top; return u;
    }
    function lineCount(rs) {
        var lines = [];
        rs.slice().sort(function (a, b) { return a.top - b.top; }).forEach(function (r) {
            var mid = (r.top + r.bottom) / 2;
            if (!lines.some(function (l) { return mid > l.top && mid < l.bottom; })) lines.push({ top: r.top, bottom: r.bottom });
        });
        return lines.length;
    }
    // Every visible text node under root: fn(node, parentElement, lineRects).
    function eachText(root, fn) {
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var vis = new Map();
        for (var t = w.nextNode(); t; t = w.nextNode()) {
            if (!/\S/.test(t.nodeValue)) continue;
            var el = t.parentElement;
            if (!el || NO_TEXT[el.tagName] || el.closest('select, template, [hidden]')) continue;
            if (!vis.has(el)) vis.set(el, visible(el));
            if (!vis.get(el)) continue;
            var rs = lineRects(t);
            if (!rs.length) continue;
            fn(t, el, rs);
        }
    }
    function directText(e) {
        var s = '';
        e.childNodes.forEach(function (n) { if (n.nodeType === 3) s += n.nodeValue; });
        return squash(s);
    }
    function firstFamily(f) { return String(f || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase(); }

    function issue(out, check, ctx, el, text, detail) {
        out.push({ check: check, width: ctx.width, drawer: ctx.drawer, path: el ? cssPath(el) : '', text: short(text, 60), detail: detail || '' });
    }

    // The glyphs' ink, not the font's line box: a range rect spans the font's
    // ascent and descent, which for Michroma is far taller than its capitals.
    var meter = document.createElement('canvas').getContext('2d');
    function inkRects(t, el, rs) {
        var s = cs(el), z = zoom(el), txt = squash(t.nodeValue);
        if (s.textTransform === 'uppercase') txt = txt.toUpperCase();
        meter.font = s.fontStyle + ' ' + s.fontWeight + ' ' + (px(s.fontSize) * z) + 'px ' + s.fontFamily;
        var m = meter.measureText(txt || 'X');
        if (!isFinite(m.fontBoundingBoxAscent) || !isFinite(m.actualBoundingBoxAscent)) return rs;
        return rs.map(function (r) {
            return { left: r.left, right: r.right, top: r.top + Math.max(0, m.fontBoundingBoxAscent - m.actualBoundingBoxAscent),
                bottom: r.top + m.fontBoundingBoxAscent + Math.max(0, m.actualBoundingBoxDescent), width: r.width };
        });
    }

    // clipped-text: text cut off by its own box or a clipping ancestor, or
    // shortened by text-overflow: ellipsis.
    function clippedText(root, ctx, out) {
        var done = new Set();
        eachText(root, function (t, el, rs) {
            if (done.has(el)) return;
            var u = union(rs), ink = union(inkRects(t, el, rs)), why = null;
            var list = clippers(el, true);
            for (var i = 0; i < list.length && !why; i++) {
                var c = list[i], b = padBox(c.el);
                var inX = u.right > b.left + 1 && u.left < b.right - 1, inY = ink.bottom > b.top + 1 && ink.top < b.bottom - 1;
                if (!inX || !inY) { if ((c.x && !inX) || (c.y && !inY)) return; continue; }   // cut away whole: hidden, not clipped
                var cuts = { left: c.x ? b.left - u.left : 0, right: c.x ? u.right - b.right : 0, top: c.y ? b.top - ink.top : 0, bottom: c.y ? ink.bottom - b.bottom : 0 };
                var side = Object.keys(cuts).sort(function (p, q) { return cuts[q] - cuts[p]; })[0];
                if (cuts[side] > 1.5) why = 'cut ' + r1(cuts[side]) + 'px at the ' + side + ' by ' + (c.el === el ? 'its own box' : seg(c.el));
            }
            var s = cs(el);
            if (!why && s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) why = 'ellipsis: scrollWidth ' + el.scrollWidth + ' > clientWidth ' + el.clientWidth;
            if (why) { done.add(el); issue(out, 'clipped-text', ctx, el, label(el) || t.nodeValue, why); }
        });
    }

    // wrapped-pane: a pane's label runs onto a second line.
    function wrappedPane(root, ctx, out) {
        var done = new Set();
        eachText(root, function (t, el, rs) {
            var pane = el.closest(PANE);
            if (!pane || !root.contains(pane) || done.has(pane)) return;
            var n = lineCount(rs);
            if (n > 1) { done.add(pane); issue(out, 'wrapped-pane', ctx, pane, label(pane), n + ' lines (' + Math.round(pane.getBoundingClientRect().width) + 'px wide)'); }
        });
    }

    // native-control: browser-drawn checkboxes, radios and colour wells, and
    // selects off the theme's field heights.
    function nativeControl(root, ctx, out) {
        root.querySelectorAll('input[type=checkbox], input[type=radio], input[type=color]').forEach(function (e) {
            var r = e.getBoundingClientRect();
            if (r.width < 4 || r.height < 4 || !visible(e)) return;
            var s = cs(e), ap = s.appearance || s.webkitAppearance;
            var name = label(e.closest('label') || e.labels && e.labels[0] || e.parentElement) || e.type;
            if (ap && ap !== 'none') issue(out, 'native-control', ctx, e, name,
                'input[type=' + e.type + '] appearance: ' + ap + (s.accentColor && s.accentColor !== 'auto' ? ', accent ' + s.accentColor : ''));
            // appearance: none only strips a colour input's frame: the swatch inside is still the browser's.
            else if (e.type === 'color') issue(out, 'native-control', ctx, e, name, 'input[type=color] shown as the browser\'s swatch (' + e.value + ', radius ' + s.borderRadius + ')');
        });
        root.querySelectorAll('select').forEach(function (e) {
            if (!visible(e)) return;
            var h = r1(e.getBoundingClientRect().height / zoom(e));
            var bar = !!e.closest('#mixer-strip');
            var want = bar ? [40] : (e.closest('#sidebar-left, #sidebar-right') ? [32, 48] : null);
            if (!want) return;
            if (!want.some(function (v) { return Math.abs(v - h) <= 0.6; }))
                issue(out, 'native-control', ctx, e, label(e), 'select ' + h + 'px tall (want ' + want.join(' or ') + ')');
        });
    }

    // off-theme-font: text not set in Michroma, Share Tech Mono or Libre Franklin.
    function offThemeFont(root, ctx, out) {
        var done = new Set();
        function test(el, text) {
            if (done.has(el) || el.closest('select.material-mode-select')) return;
            done.add(el);
            var f = cs(el).fontFamily, first = firstFamily(f);
            if (!THEME_FONTS[first]) issue(out, 'off-theme-font', ctx, el, text, 'font-family: ' + short(f, 70));
        }
        eachText(root, function (t, el) { test(el, label(el) || t.nodeValue); });
        root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=hidden]):not([type=file]), select, textarea').forEach(function (e) {
            if (!visible(e)) return;
            var text = e.tagName === 'SELECT' ? label(e) : (e.value || e.placeholder || '');
            if (squash(text)) test(e, text);
        });
    }

    // inner-box: a second container inside a tray. Controls, panes and their
    // frames may draw edges; the theme's bead-row divider (a one-sided dotted
    // copper rule opening a sub-group) is allowed once, not nested in another.
    function colour(c) {
        var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
        var p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function isCopper(c) { return c && Math.abs(c.r - 214) < 30 && Math.abs(c.g - 140) < 30 && Math.abs(c.b - 92) < 30; }
    function edges(e) {
        var s = cs(e), sides = [];
        ['Top', 'Right', 'Bottom', 'Left'].forEach(function (k) {
            var st = s['border' + k + 'Style'], w = px(s['border' + k + 'Width']), c = colour(s['border' + k + 'Color']);
            if (st === 'none' || st === 'hidden' || w <= 0 || !c) return;
            if (c.a >= 0.15 || ((st === 'dashed' || st === 'dotted') && c.a > 0.02)) sides.push({ side: k.toLowerCase(), style: st, w: w * zoom(e), c: c });
        });
        if (s.outlineStyle !== 'none' && px(s.outlineWidth) > 0) {
            var oc = colour(s.outlineColor);
            if (oc && oc.a >= 0.15) sides.push({ side: 'outline', style: s.outlineStyle, w: px(s.outlineWidth), c: oc });
        }
        // A hard ring drawn with box-shadow (no blur, some spread) reads as a border.
        String(s.boxShadow || '').split(/,(?![^(]*\))/).forEach(function (sh) {
            if (!sh || sh === 'none') return;
            var c = colour(sh), nums = (sh.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
            if (c && nums.length >= 4 && nums[2] === 0 && Math.abs(nums[3]) >= 1 && c.a >= 0.15) sides.push({ side: /inset/.test(sh) ? 'inset ring' : 'ring', style: 'box-shadow', w: Math.abs(nums[3]), c: c });
        });
        return sides;
    }
    function isDivider(sides) {
        return sides.length === 1 && (sides[0].side === 'top' || sides[0].side === 'bottom') && sides[0].style === 'dotted' && isCopper(sides[0].c);
    }
    // Small theme components that carry their own edge: keycaps, chips, lamps, swatches, screens.
    var COMPONENT = '.hk-cap, kbd, .hk-picker-key, .wc-chip, .wc-chips, .palette-chip, .lamp, .scr, .wc-tele, '
        + '[class*="swatch"], [class*="screen"], [class*="keycap"], [class*="nixie"], [class*="vfd"]';
    var CTL_ONLY = 'button, input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=checkbox], [role=switch], [role=slider], [role=combobox], [role=spinbutton], [role=textbox], .btn, .wc-opt';
    function framed(sides) {
        var s = {}; sides.forEach(function (x) { s[x.side] = 1; });
        return (s.top && s.right && s.bottom && s.left) || s.outline || s.ring || s['inset ring'];
    }
    // A full frame is a pane when it wraps one control (with its label), or a
    // joined strip when every child is a control (a segmented radio bank).
    function isPane(e, sides) {
        if (!framed(sides)) return false;
        if (/^(radiogroup|group|tablist|toolbar)$/.test(e.getAttribute('role') || '')) return true;
        var kids = [].filter.call(e.children, function (k) { return visible(k, true); });
        if (kids.length >= 2 && kids.every(function (k) { return k.matches(CTL_ONLY); })) return true;
        // Count a checkbox wrapped in its label once, even when the input itself is hidden.
        var labs = [].filter.call(e.querySelectorAll('label'), function (l) { return l.querySelector('input, select, textarea'); });
        var ctl = [].filter.call(e.querySelectorAll(CTL_ONLY), function (k) { return visible(k, true) && !labs.some(function (l) { return l.contains(k); }); });
        return ctl.length + labs.length === 1 && squash(e.textContent).length <= 60;
    }
    function innerBox(tray, ctx, out) {
        var dividers = [];
        tray.querySelectorAll('*').forEach(function (e) {
            if (e.closest(CONTROL) || e.closest(COMPONENT) || !visible(e)) return;
            var lab = e.closest('label');
            if (lab && lab.querySelector('input, select, textarea')) return;   // a checkbox or field pane and its parts
            var sides = edges(e);
            if (!sides.length) return;
            if (isDivider(sides)) { dividers.push(e); return; }
            if (isPane(e, sides)) return;
            var d = sides.map(function (x) { return x.side + ' ' + x.style + ' ' + r1(x.w) + 'px a=' + r1(x.c.a); });
            issue(out, 'inner-box', ctx, e, label(e), d.join('; '));
        });
        dividers.forEach(function (e) {
            var outer = dividers.filter(function (o) { return o !== e && o.contains(e); })[0];
            if (outer) issue(out, 'inner-box', ctx, e, label(e), 'dotted rule nested inside ' + seg(outer) + ', which already opens with one');
        });
    }

    // off-palette: a cool, saturated colour (blue, indigo, violet, magenta) in
    // the theme's chrome, the legacy palette's hues. The theme is walnut,
    // copper, cream and the VFD teal. User colour (swatches, palettes, chips,
    // colour wells, images, canvases) is content and left alone.
    var CONTENT = 'img, canvas, svg, video, picture, input[type=color], .palette-chip, .wc-chip, .wc-chips, '
        + '[class*="swatch"], [class*="palette"], [class*="preset-thumb"], [class*="color-well"], [class*="colour"], [class*="arm-color"]';
    function hsl(c) {
        var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        if (!d) return { h: 0, s: 0, l: l };
        var s = d / (1 - Math.abs(2 * l - 1)), h;
        if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        return { h: (h * 60 + 360) % 360, s: s, l: l };
    }
    function offHue(c, minA) {
        if (!c || c.a < minA) return null;
        var x = hsl(c);
        return x.s >= 0.3 && x.l >= 0.15 && x.l <= 0.9 && x.h >= 190 && x.h <= 330 ? Math.round(x.h) : null;
    }
    function hex(c) { return '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
    function offPalette(root, ctx, out) {
        root.querySelectorAll('*').forEach(function (e) {
            if (e.closest(CONTENT) || !visible(e)) return;
            var s = cs(e), hits = [], c, h;
            if ((h = offHue(c = colour(s.backgroundColor), 0.3)) != null) hits.push('background ' + hex(c) + ' (hue ' + h + ')');
            (String(s.backgroundImage || '').replace(/url\([^)]*\)/g, '').match(/rgba?\([^)]+\)/g) || []).some(function (m) {
                if ((h = offHue(c = colour(m), 0.3)) != null) { hits.push('gradient stop ' + hex(c) + ' (hue ' + h + ')'); return true; }
            });
            if (directText(e) && (h = offHue(c = colour(s.color), 0.5)) != null) hits.push('text ' + hex(c) + ' (hue ' + h + ')');
            ['Top', 'Right', 'Bottom', 'Left'].some(function (k) {
                if (s['border' + k + 'Style'] === 'none' || px(s['border' + k + 'Width']) <= 0) return false;
                if ((h = offHue(c = colour(s['border' + k + 'Color']), 0.3)) != null) { hits.push('border ' + hex(c) + ' (hue ' + h + ')'); return true; }
            });
            if (hits.length) issue(out, 'off-palette', ctx, e, label(e), hits.join('; '));
        });
    }

    // label-style: label-like text with its style signature (grouped in Node).
    function sigOf(el) {
        var s = cs(el), c = colour(s.color) || { r: 0, g: 0, b: 0, a: 1 };
        var hex = '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('') + (c.a < 1 ? '/' + r1(c.a) : '');
        var ls = s.letterSpacing === 'normal' ? '0' : r1(px(s.letterSpacing)) + 'px';
        return [firstFamily(s.fontFamily), r1(px(s.fontSize)) + 'px', s.fontWeight, 'ls ' + ls, s.textTransform, hex].join(' · ');
    }
    function rendersUpper(el, txt) { return cs(el).textTransform === 'uppercase' || (/[A-Z]/.test(txt) && txt === txt.toUpperCase()); }
    function controlNear(el) {   // a control below the text or beside it on its row
        var r = el.getBoundingClientRect();
        for (var x = el, k = 0; x && k < 3; x = x.parentElement, k++) {
            for (var n = x.nextElementSibling; n; n = n.nextElementSibling) {
                var c = n.matches(CONTROL) ? n : n.querySelector(CONTROL);
                if (!c || !visible(c, true)) continue;
                var b = c.getBoundingClientRect();
                if (b.top >= r.top - 4 && b.top - r.bottom < 40) return true;
                break;
            }
        }
        return false;
    }
    function collectLabels(tray, ctx) {
        var out = [], seen = new Set(), cands = [];
        tray.querySelectorAll('label, h1, h2, h3, h4, h5, h6, [role=heading], [class*="label"], [class*="Label"], [class*="title"], [class*="Title"], [class*="head"], [class*="Head"]').forEach(function (e) { cands.push(e); });
        eachText(tray, function (t, el) {
            var txt = directText(el);
            if (txt.length && txt.length <= 32 && /[A-Za-z]/.test(txt) && rendersUpper(el, txt) && !el.matches(CONTROL) && controlNear(el)) cands.push(el);
        });
        cands.forEach(function (c) {
            if (c.closest('button, select, .btn, [role=option], [role=listbox], [role=button], [role=radio], .wc-opt') || !visible(c)) return;
            var holder = directText(c) ? c : null;
            if (!holder) {
                if (squash(c.textContent).length > 40) return;
                var w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT, null);
                for (var t = w.nextNode(); t; t = w.nextNode()) if (/\S/.test(t.nodeValue) && t.parentElement && !t.parentElement.closest('button, select, .btn')) { holder = t.parentElement; break; }
            }
            if (!holder || seen.has(holder) || !visible(holder)) return;
            var txt = directText(holder);
            if (!/[A-Za-z]{2}/.test(txt) || txt.length > 40 || holder.matches('[class*="value"], [class*="Value"]')) return;
            // A disabled control's label is dimmed on purpose: its colour is a state, not a style.
            var lab = holder.closest('label') || c.closest('label'), grp = holder.closest('.checkbox-group');
            var ctl = (lab && lab.control) || (grp && grp.querySelector('input, select, textarea'));
            if (ctl && (ctl.disabled || ctl.getAttribute('aria-disabled') === 'true')) return;
            seen.add(holder);
            out.push({ width: ctx.width, drawer: ctx.drawer, path: cssPath(holder), text: short(label(holder) || txt, 40), sig: sigOf(holder) });
        });
        return out;
    }

    // overlap: interactive nodes whose boxes cross (not one inside the other's
    // subtree), and at compact sizes anything of the strip over #sidebar-left.
    function interactives(root) {
        return [].filter.call(root.querySelectorAll(INTERACTIVE), function (e) {
            var r = e.getBoundingClientRect();
            return r.width >= 2 && r.height >= 2 && visible(e, true) && cs(e).pointerEvents !== 'none';
        });
    }
    function cross(a, b) {
        var w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 2 && h > 2 ? { w: r1(w), h: r1(h) } : null;
    }
    function overlap(root, ctx, out, against) {
        var list = interactives(root), rects = list.map(function (e) { return e.getBoundingClientRect(); });
        for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
            if (list[i].contains(list[j]) || list[j].contains(list[i])) continue;
            var x = cross(rects[i], rects[j]);
            if (x) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: cssPath(list[i]) + '  ×  ' + cssPath(list[j]),
                text: short(label(list[i]) + ' × ' + label(list[j]), 60), detail: x.w + '×' + x.h + 'px' });
        }
        if (against && visible(against, true)) {
            var ar = against.getBoundingClientRect();
            list.forEach(function (e, k) {
                var x = cross(rects[k], ar);
                if (x) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: cssPath(e) + '  ×  ' + cssPath(against),
                    text: short(label(e), 60), detail: 'over ' + segBase(against) + ' by ' + x.w + '×' + x.h + 'px' });
            });
        }
        // In a compact window the strip lives in the right bar: its cells must
        // stay inside that column and the window, and the bars must not cross.
        var bar = root.parentElement;
        if (bar && bar.id === 'sidebar-right' && document.body.classList.contains('compact-ui')) {
            var bb = padBox(bar), vw = document.documentElement.clientWidth;
            [].forEach.call(root.children, function (c) {
                if (!visible(c, true)) return;
                var r = c.getBoundingClientRect(), past = Math.max(bb.left - r.left, r.right - bb.right, r.right - vw);
                if (past > 2) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: cssPath(c), text: short(label(c), 60),
                    detail: 'cell runs ' + r1(past) + 'px past ' + (r.right - vw >= past ? 'the window' : 'the right bar') });
            });
            if (against && visible(against, true)) {
                var x = cross(bar.getBoundingClientRect(), against.getBoundingClientRect());
                if (x) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: '#sidebar-right  ×  ' + cssPath(against), text: 'right bar over left bar', detail: x.w + '×' + x.h + 'px' });
            }
        }
    }

    function scan(o) {
        cache = new Map();
        var root = typeof o.root === 'string' ? document.querySelector(o.root) : o.root;
        var ctx = { width: o.width, drawer: o.drawer }, out = [], labels = [];
        if (!root) return { issues: out, labels: labels, missing: true };
        var tray = o.tray ? (typeof o.tray === 'string' ? root.querySelector(o.tray) : o.tray) : null;
        var ch = o.checks;
        if (ch.indexOf('clipped-text') >= 0) clippedText(root, ctx, out);
        if (ch.indexOf('wrapped-pane') >= 0) wrappedPane(root, ctx, out);
        if (ch.indexOf('native-control') >= 0) nativeControl(root, ctx, out);
        if (ch.indexOf('off-theme-font') >= 0) offThemeFont(root, ctx, out);
        if (ch.indexOf('off-palette') >= 0) offPalette(root, ctx, out);
        if (tray && ch.indexOf('inner-box') >= 0) innerBox(tray, ctx, out);
        if (tray && ch.indexOf('label-style') >= 0) labels = collectLabels(tray, ctx);
        if (ch.indexOf('overlap') >= 0) overlap(root, ctx, out, o.against ? document.querySelector(o.against) : null);
        return { issues: out, labels: labels };
    }

    window.__themeLint = { scan: scan, cssPath: cssPath };
    return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Node side
// ─────────────────────────────────────────────────────────────────────────
// An issue is known by where it is, not by its text (a select's text can
// differ between machines, e.g. the detected refresh rate).
const issueKey = i => [i.check, i.width, i.drawer, i.path].join(' | ');
const countKey = i => [i.width, i.drawer, i.check].join(' | ');

async function settle(d, expr, ms) {   // wait until expr's value holds for 3 reads (~200 ms)
    let last = null, same = 0;
    for (let t = 0; t < (ms || 1500); t += 100) {
        const v = JSON.stringify(await d.ev(expr).catch(() => null));
        same = v === last ? same + 1 : 0;
        if (same >= 2) return;
        last = v; await sleep(100);
    }
}

async function install(d) { await d.ev('(' + pageLib.toString() + ')()'); }

async function scan(d, opts) { return d.ev('window.__themeLint.scan(' + JSON.stringify(opts) + ')'); }

async function drawerTitles(d) {
    return d.ev(`[].slice.call(document.querySelectorAll('#sidebar-left .section-title, #sidebar-right .section-title')).map(function(t){
        return { side: t.closest('#sidebar-left') ? 'left' : 'right', title: t.textContent.trim().replace(/\\s+/g, ' ') }; })`);
}

// Opens one drawer alone: clicks the titles of the open ones, then its own.
async function openDrawer(d, title) {
    const ok = await d.ev(`(function(){
        var all = [].slice.call(document.querySelectorAll('#sidebar-left .section-title, #sidebar-right .section-title'));
        var t = all.find(function(x){ return x.textContent.trim().replace(/\\s+/g, ' ') === ${JSON.stringify(title)}; });
        if (!t) return false;
        all.forEach(function(o){ if (o !== t && o.getAttribute('aria-expanded') === 'true') o.click(); });
        if (t.getAttribute('aria-expanded') !== 'true') t.click();
        window.__tlSec = t.closest('.sidebar-section');
        return true; })()`);
    if (!ok) return false;
    await sleep(150);
    await settle(d, `(function(){ var s = window.__tlSec, b = s && s.querySelector('.section-body'); if (!b) return 0; var r = b.getBoundingClientRect();
        return [s.querySelector('.section-title').getAttribute('aria-expanded'), Math.round(r.height), b.querySelectorAll('*').length]; })()`, 2500);
    return d.ev(`window.__tlSec.querySelector('.section-title').getAttribute('aria-expanded') === 'true' && !window.__tlSec.classList.contains('collapsed')`);
}

function summarise(issues, labelGroups) {
    const byCheck = {}; CHECKS.forEach(c => byCheck[c] = 0);
    const byDrawer = {};
    issues.forEach(i => {
        byCheck[i.check] = (byCheck[i.check] || 0) + 1;
        const k = i.width + ' | ' + i.drawer;
        (byDrawer[k] = byDrawer[k] || {})[i.check] = (byDrawer[k][i.check] || 0) + 1;
    });
    const counts = {};
    issues.forEach(i => { counts[countKey(i)] = (counts[countKey(i)] || 0) + 1; });
    return { byCheck, byDrawer, counts, labelGroups };
}

function md(s) { return String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;'); }

function writeReport(dir, meta, issues, sum) {
    fs.mkdirSync(dir, { recursive: true });
    const L = [];
    L.push('# Theme lint report', '');
    L.push('Head `' + meta.head + '`, ' + meta.when + ', ' + meta.seconds + ' s. Sizes: ' + meta.widths.join(', ') + (meta.small.length ? '; compact ' + meta.small.join(', ') : '') + '.', '');
    L.push('## Counts per check', '', '| Check | Issues |', '|---|---:|');
    CHECKS.forEach(c => L.push('| ' + c + ' | ' + (sum.byCheck[c] || 0) + ' |'));
    L.push('| **total** | **' + issues.length + '** |', '');
    L.push('## Counts per drawer', '', '| Size | Drawer | ' + CHECKS.join(' | ') + ' |', '|---|---|' + CHECKS.map(() => '---:').join('|') + '|');
    Object.keys(sum.byDrawer).forEach(k => {
        const [w, dr] = k.split(' | ');
        L.push('| ' + w + ' | ' + md(dr) + ' | ' + CHECKS.map(c => sum.byDrawer[k][c] || '').join(' | ') + ' |');
    });
    L.push('');
    L.push('## Label styles', '', 'Label-like text in the trays grouped by family · size · weight · letter-spacing · transform · colour. A group is flagged (each label in it is a `label-style` issue) when it holds under ' + (OUTLIER_SHARE * 100) + ' % of a size\'s labels, or when it is set in another face than most labels (the study engraves every label in its display face).', '');
    Object.keys(sum.labelGroups).forEach(w => {
        const g = sum.labelGroups[w];
        L.push('### ' + w + ' (' + g.total + ' labels, face ' + g.face + ')', '', '| Count | Signature | Examples | Flag |', '|---:|---|---|---|');
        g.groups.forEach(x => L.push('| ' + x.count + ' | `' + md(x.sig) + '` | ' + x.examples.map(e => md(e.drawer + ': ' + e.text)).join('; ') + ' | ' + md(x.outlier || '') + ' |'));
        L.push('');
    });
    L.push('## Issues', '');
    CHECKS.forEach(c => {
        const list = issues.filter(i => i.check === c);
        if (!list.length) return;
        L.push('### ' + c + ' (' + list.length + ')', '', '| Size | Drawer | Text | Path | Detail |', '|---|---|---|---|---|');
        list.forEach(i => L.push('| ' + i.width + ' | ' + md(i.drawer) + ' | ' + md(i.text) + ' | `' + md(i.path) + '` | ' + md(i.detail) + ' |'));
        L.push('');
    });
    fs.writeFileSync(path.join(dir, 'report.md'), L.join('\n'));
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, counts: sum.byCheck, perDrawer: sum.byDrawer, labelGroups: sum.labelGroups, issues }, null, 1));
}

function groupLabels(labels) {
    const per = {};
    labels.forEach(l => { (per[l.width] = per[l.width] || []).push(l); });
    const out = {};
    Object.keys(per).forEach(w => {
        const list = per[w], m = new Map();
        list.forEach(l => { if (!m.has(l.sig)) m.set(l.sig, []); m.get(l.sig).push(l); });
        // The face most labels use; the study engraves every label in it.
        const fam = {};
        list.forEach(l => { const f = l.sig.split(' · ')[0]; fam[f] = (fam[f] || 0) + 1; });
        const face = Object.keys(fam).sort((a, b) => fam[b] - fam[a])[0];
        const groups = [...m.entries()].map(([sig, ls]) => {
            const why = [];
            if (ls.length < list.length * OUTLIER_SHARE) why.push('outlier style (' + ls.length + ' of ' + list.length + ')');
            if (sig.split(' · ')[0] !== face) why.push('not the labels\' face (' + face + ')');
            return { sig, count: ls.length, outlier: why.join(', '), examples: ls.slice(0, 3).map(l => ({ drawer: l.drawer, text: l.text })), members: ls };
        }).sort((a, b) => b.count - a.count);
        out[w] = { total: list.length, face, groups };
    });
    return out;
}

(async () => {
    const opt = parseArgs(process.argv.slice(2));
    const t0 = Date.now();
    let head = '?';
    try { head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (_) {}
    const issues = [], labels = [];
    const d = await boot({ args: ['--disable-gpu-compositing'] });
    try {
        await d.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        const BASE = ['clipped-text', 'wrapped-pane', 'native-control', 'off-theme-font', 'off-palette'];
        for (const sz of opt.widths) {
            await d.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: false });
            await d.load();
            await sleep(400);
            await install(d);
            const W = sz.label;
            let r = await scan(d, { root: '#mixer-strip', width: W, drawer: 'top bar', checks: BASE.concat('overlap'), against: '#sidebar-left' });
            issues.push(...r.issues);
            r = await scan(d, { root: '#sidebar-left .lsb-head', width: W, drawer: 'left head', checks: BASE });
            issues.push(...r.issues);
            const titles = await drawerTitles(d);
            for (const { side, title } of titles) {
                if (opt.only && !opt.only.test(title)) continue;
                const ok = await openDrawer(d, title);
                if (!ok) { console.log('  ' + W + ' could not open ' + title); continue; }
                const res = await d.ev(`window.__themeLint.scan({ root: window.__tlSec, tray: window.__tlSec.querySelector('.section-body'), width: ${JSON.stringify(W)}, drawer: ${JSON.stringify(title)}, checks: ${JSON.stringify(CHECKS.filter(c => c !== 'overlap'))} })`);
                issues.push(...res.issues);
                labels.push(...res.labels);
                console.log('  ' + W + ' ' + side.padEnd(5) + ' ' + title.padEnd(22) + ' ' + res.issues.length + ' issues, ' + res.labels.length + ' labels');
            }
            console.log(W + ' done at ' + Math.round((Date.now() - t0) / 1000) + ' s');
        }
        // Compact sizes: resize (js/13 folds both bars and moves the strip into
        // the right one), open the right bar the way js/13 does, check overlaps.
        if (opt.small.length) {
            if (!opt.widths.length) { await d.load(); }
            await install(d);
            for (const sz of opt.small) {
                await d.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: false });
                await settle(d, `[document.body.className, innerWidth, innerHeight]`, 1500);
                const st = await d.ev(`(function(){ var c = document.body.classList.contains('compact-ui'); if (c && window.Sidebars && Sidebars.right && Sidebars.right.isCollapsed()) Sidebars.right.fold(false); return c; })()`);
                await settle(d, `(function(){ var s = document.getElementById('mixer-strip'); var r = s.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.height)]; })()`, 1500);
                const res = await scan(d, { root: '#mixer-strip', width: sz.label, drawer: st ? 'compact strip' : 'top bar', checks: ['overlap'], against: '#sidebar-left' });
                issues.push(...res.issues);
                console.log('  ' + sz.label + (st ? ' compact' : ' (not compact)') + ': ' + res.issues.length + ' overlaps');
            }
        }
    } finally { await d.close(); }

    // label-style outliers become issues
    const labelGroups = groupLabels(labels);
    Object.keys(labelGroups).forEach(w => labelGroups[w].groups.forEach(g => {
        if (g.outlier) g.members.forEach(l => issues.push({ check: 'label-style', width: l.width, drawer: l.drawer, path: l.path, text: l.text, detail: g.outlier + ': ' + g.sig }));
        delete g.members;
    }));
    // stable order: size, drawer order as met, check order
    const order = new Map(); issues.forEach((i, k) => { const key = i.width + '|' + i.drawer; if (!order.has(key)) order.set(key, k); });
    issues.sort((a, b) => (order.get(a.width + '|' + a.drawer) - order.get(b.width + '|' + b.drawer)) || (CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check)));

    const seconds = Math.round((Date.now() - t0) / 1000);
    const meta = { head, when: new Date().toISOString(), seconds, widths: opt.widths.map(s => s.label), small: opt.small.map(s => s.label) };
    const sum = summarise(issues, labelGroups);
    writeReport(opt.out, meta, issues, sum);
    console.log('\n' + CHECKS.map(c => c + ' ' + (sum.byCheck[c] || 0)).join(', ') + '  (total ' + issues.length + ', ' + seconds + ' s)');
    console.log('report: ' + path.join(opt.out, 'report.md'));

    if (opt.update) {
        // One issue per line so a baseline change reads as a plain diff.
        const rows = issues.map(i => '  ' + JSON.stringify({ key: issueKey(i), text: i.text })).sort();
        const counts = Object.keys(sum.counts).sort().map(k => '  ' + JSON.stringify(k) + ': ' + sum.counts[k]);
        fs.mkdirSync(path.dirname(opt.update), { recursive: true });
        fs.writeFileSync(opt.update, '{\n"meta": ' + JSON.stringify(meta) + ',\n"counts": {\n' + counts.join(',\n') + '\n},\n"issues": [\n' + rows.join(',\n') + '\n]\n}\n');
        console.log('baseline written: ' + path.relative(ROOT, opt.update));
    }
    if (opt.check) {
        if (!fs.existsSync(opt.check)) { console.error('no baseline at ' + opt.check + ' (write one with --update)'); process.exit(2); }
        const base = JSON.parse(fs.readFileSync(opt.check, 'utf8'));
        const known = new Set((base.issues || []).map(x => x.key));
        const baseSizes = new Set([].concat(base.meta.widths || [], base.meta.small || []));
        const ran = new Set([].concat(meta.widths, meta.small));
        const skipped = [...ran].filter(s => !baseSizes.has(s));
        if (skipped.length) console.log('\nnot in the baseline, not compared: ' + skipped.join(', '));
        const up = Object.keys(sum.counts).filter(k => baseSizes.has(k.split(' | ')[0]) && sum.counts[k] > ((base.counts || {})[k] || 0));
        const down = Object.keys(base.counts || {}).filter(k => ran.has(k.split(' | ')[0]) && (sum.counts[k] || 0) < base.counts[k]);
        if (down.length) console.log('\nwent down (good; --update to keep it):\n' + down.map(k => '  ' + k + ': ' + base.counts[k] + ' -> ' + (sum.counts[k] || 0)).join('\n'));
        if (up.length) {
            console.log('\nFAIL: counts went up against ' + path.relative(ROOT, opt.check) + ':');
            up.forEach(k => {
                console.log('  ' + k + ': ' + ((base.counts || {})[k] || 0) + ' -> ' + sum.counts[k]);
                issues.filter(i => countKey(i) === k && !known.has(issueKey(i))).forEach(i => console.log('    + ' + i.path + '  "' + i.text + '"  ' + i.detail));
            });
            process.exit(1);
        }
        console.log('\nPASS: no check went up against ' + path.relative(ROOT, opt.check));
    }
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
