// Walnut & Copper theme consistency checker (headless Chrome, read-only).
//
//   node scripts/test/theme-lint/run.js                      # report only
//   node scripts/test/theme-lint/run.js --check              # exit 1 if a count went up
//   node scripts/test/theme-lint/run.js --update             # write the baseline
//   node scripts/test/theme-lint/run.js --study              # calibrate: the study must pass
//
// Flags: --widths 1920,1440 (or WxH; "none" skips the drawer sweep)
//        --small 1000x480,760x700,1200x500,800x600,770x700,1280x720 (small windows:
//                top bar, underbar and folded bars only; "none" skips)
//        --out DIR (default prep/work/theme-lint), --drawers REGEX (debug: only these)
//        --check [BASELINE.json] / --update [BASELINE.json] (default prep/baseline/theme-lint.json)
//
// Boots the app with the shared driver (own static server, scratch profile,
// reduced motion, --disable-gpu-compositing). At each width it scans the top
// bar (#mixer-strip), the left sidebar head and the underbar, then opens every
// drawer of both sidebars alone (a click on its .section-title, the others
// closed) and scans its front and open tray. At each small size it scans the
// top bar and the underbar; in a compact window (js/13: body.compact-ui, the
// strip moves into #sidebar-right) it first measures the folded bars, then
// opens the right bar the way js/13 does (Sidebars.right.fold(false), never
// persisted) and scans the strip there.
// Checks: clipped-text, wrapped-pane, native-control, off-theme-font,
// off-palette, inner-box, label-style, overlap, fold-width.
// It never types, never persists, and clicks nothing but drawer titles.
// --study runs the same page code on design/walnut-copper-study.html: the
// study is the spec, so every check must come back empty there.
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
const CHECKS = ['clipped-text', 'wrapped-pane', 'native-control', 'off-theme-font', 'off-palette', 'inner-box', 'label-style', 'overlap', 'fold-width'];
const OUTLIER_SHARE = 0.10;   // label signatures used by fewer than this share of labels (of one role) are outliers
const DEFAULT_SMALL = '1000x480,760x700,1200x500,800x600,770x700,1280x720';

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
    const o = { widths: sizeList('1920,1440'), small: sizeList(DEFAULT_SMALL), out: DEFAULT_OUT, check: null, update: null, only: null, study: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const val = () => (argv[i + 1] != null && !argv[i + 1].startsWith('--')) ? argv[++i] : null;
        if (a === '--widths') o.widths = sizeList(val() || '1920,1440');
        else if (a === '--small') o.small = sizeList(val() || 'none');
        else if (a === '--out') o.out = path.resolve(val() || DEFAULT_OUT);
        else if (a === '--check') o.check = path.resolve(val() || DEFAULT_BASELINE);
        else if (a === '--update') o.update = path.resolve(val() || DEFAULT_BASELINE);
        else if (a === '--drawers') o.only = new RegExp(val() || '.', 'i');
        else if (a === '--study') o.study = true;
        else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 15).join('\n')); process.exit(0); }
        else throw new Error('unknown flag ' + a);
    }
    if (o.study && (o.check || o.update)) throw new Error('--study is a calibration run: it has no baseline');
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
    // The app's bars, and the study's (so --study measures the same rules).
    var TOPBAR = '#mixer-strip, .navbar', SIDEBARS = '#sidebar-left, #sidebar-right, .sidebars';
    var FIELD = 'input[type=text], input[type=number], input[type=search], input[type=email], input[type=url], input[type=tel], input[type=password], input:not([type])';
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
    // The pane a text belongs to: a button-like control, or the label of a
    // checkbox or radio (the theme draws those rows as panes too).
    function paneOf(el) {
        var p = el.closest(PANE);
        if (p) return p;
        var lab = el.closest('label');
        var c = lab && (lab.control || lab.querySelector('input'));
        return c && (c.type === 'checkbox' || c.type === 'radio') ? lab : null;
    }
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
            // A pane that does not clip must still hold its words: text past
            // its frame spills over the next pane (RANDOM over PALETTE in the
            // compact strip) and reads as cut where a neighbour paints over it.
            var pane = !why && paneOf(el);
            if (pane && root.contains(pane) && cs(pane).display !== 'contents') {
                var pb = pane.getBoundingClientRect();
                var sp = { left: pb.left - u.left, right: u.right - pb.right, top: pb.top - ink.top, bottom: ink.bottom - pb.bottom };
                var ss = Object.keys(sp).sort(function (p, q) { return sp[q] - sp[p]; })[0];
                if (sp[ss] > 1.5) why = 'spills ' + r1(sp[ss]) + 'px past its pane at the ' + ss + ' (' + r1(u.width) + 'px of text in a ' + r1(pb.width) + 'px pane)';
            }
            if (why) { done.add(el); issue(out, 'clipped-text', ctx, el, label(el) || t.nodeValue, why); }
        });
    }
    // A tray wider inside than out: overflow-x hidden hides the overhang, but
    // focusing or scrolling to a control there shifts the whole tray sideways
    // (Brush: focusing COLLIDER cut PRESSURE to URE).
    function trayOverflow(tray, ctx, out) {
        var s = cs(tray);
        if (s.overflowX === 'visible' || tray.scrollWidth <= tray.clientWidth + 1) return;
        var b = padBox(tray), worst = null, most = 1;
        tray.querySelectorAll('*').forEach(function (e) {
            if (!visible(e, true)) return;
            var r = e.getBoundingClientRect(), past = Math.max(r.right - b.right, b.left - r.left);
            if (past > most + 0.5) { most = past; worst = e; }
        });
        issue(out, 'clipped-text', ctx, tray, 'tray scrolls sideways', 'scrollWidth ' + tray.scrollWidth + ' > clientWidth ' + tray.clientWidth
            + ' (overflow-x ' + s.overflowX + ': focusing a control past the edge shifts the tray)' + (worst ? '; widest: ' + cssPath(worst) + ' "' + label(worst) + '", ' + r1(most) + 'px past the tray' : ''));
    }

    // wrapped-pane: a pane's label runs onto a second line.
    function wrappedPane(root, ctx, out) {
        var done = new Set();
        eachText(root, function (t, el, rs) {
            var pane = paneOf(el);
            if (!pane || !root.contains(pane) || done.has(pane)) return;
            var n = lineCount(rs);
            if (n > 1) { done.add(pane); issue(out, 'wrapped-pane', ctx, pane, label(pane), n + ' lines (' + Math.round(pane.getBoundingClientRect().width) + 'px wide)' + (pane.tagName === 'LABEL' ? ', a checkbox or radio label' : '')); }
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
            // appearance: none only strips a colour input's frame: the swatch
            // inside stays the browser's unless a theme rule draws it too.
            else if (e.type === 'color' && !themedSwatch(e)) issue(out, 'native-control', ctx, e, name, 'input[type=color] shown as the browser\'s swatch (' + e.value + ', radius ' + s.borderRadius + '; no theme rule styles its ::-webkit-color-swatch)');
        });
        // Fields: selects and typed-in boxes share the study's field heights.
        root.querySelectorAll('select, ' + FIELD).forEach(function (e) {
            if (!visible(e)) return;
            var h = r1(e.getBoundingClientRect().height / zoom(e));
            var bar = !!e.closest(TOPBAR);
            var want = bar ? (e.tagName === 'SELECT' ? [40] : null) : (e.closest(SIDEBARS) ? [32, 48] : null);
            if (!want) return;
            if (!want.some(function (v) { return Math.abs(v - h) <= 0.6; }))
                issue(out, 'native-control', ctx, e, label(e) || e.placeholder || e.type, (e.tagName === 'SELECT' ? 'select' : 'input[type=' + e.type + ']') + ' ' + h + 'px tall (want ' + want.join(' or ') + ')');
        });
    }
    // A theme rule (scoped to [data-theme] or in @layer theme) that draws this
    // colour input's ::-webkit-color-swatch: the well is the theme's lamp,
    // not the browser's swatch. Legacy swatch rules don't count.
    var swatchSel = null;
    function themedSwatch(e) {
        if (!swatchSel) {
            swatchSel = [];
            var SW = /::-webkit-color-swatch(?!-)/;
            var walk = function (list, inTheme) {
                for (var i = 0; i < list.length; i++) {
                    var r = list[i];
                    if (r.selectorText) {
                        if (SW.test(r.selectorText) && /border|box-shadow|background/.test(r.style.cssText))
                            r.selectorText.split(/,(?![^(]*\))/).forEach(function (p) {
                                if (SW.test(p) && (inTheme || p.indexOf('data-theme') >= 0)) swatchSel.push(p.replace(SW, '').trim());
                            });
                    } else if (r.cssRules) walk(r.cssRules, inTheme || r.name === 'theme');
                }
            };
            [].forEach.call(document.styleSheets, function (sh) { try { walk(sh.cssRules, false); } catch (_) {} });
        }
        return swatchSel.some(function (sel) { try { return e.matches(sel); } catch (_) { return false; } });
    }

    // off-theme-font: text not set in Michroma, Share Tech Mono or Libre Franklin.
    function offThemeFont(root, ctx, out) {
        var done = new Set();
        function test(el, text) {
            if (done.has(el) || el.closest('select.material-mode-select')) return;
            done.add(el);
            var f = cs(el).fontFamily, first = firstFamily(f);
            if (!THEME_FONTS[first]) issue(out, 'off-theme-font', ctx, el, text, 'font-family: ' + short(f, 70));
            // The body face is for prose only: the study sets every pane and
            // field value in the display face (VFD readouts in the mono face).
            else if (first === 'libre franklin' && /[A-Za-z0-9]/.test(text) && (el.tagName === 'SELECT' || el.closest(PANE + ', [role=combobox], [aria-haspopup=listbox]')))
                issue(out, 'off-theme-font', ctx, el, text, (el.tagName === 'SELECT' ? 'select value' : 'pane text') + ' in the body face (Libre Franklin): the study uses Michroma or Share Tech Mono');
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
            if (c.a >= EDGE_A || ((st === 'dashed' || st === 'dotted') && c.a > 0.02)) sides.push({ side: k.toLowerCase(), style: st, w: w * zoom(e), c: c });
        });
        if (s.outlineStyle !== 'none' && px(s.outlineWidth) > 0) {
            var oc = colour(s.outlineColor);
            if (oc && oc.a >= EDGE_A) sides.push({ side: 'outline', style: s.outlineStyle, w: px(s.outlineWidth), c: oc });
        }
        // A hard ring drawn with box-shadow (no blur, some spread) reads as a border.
        String(s.boxShadow || '').split(/,(?![^(]*\))/).forEach(function (sh) {
            if (!sh || sh === 'none') return;
            var c = colour(sh), nums = (sh.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
            if (c && nums.length >= 4 && nums[2] === 0 && Math.abs(nums[3]) >= 1 && c.a >= EDGE_A) sides.push({ side: /inset/.test(sh) ? 'inset ring' : 'ring', style: 'box-shadow', w: Math.abs(nums[3]), c: c });
        });
        return sides;
    }
    // A solid hairline at 4 % alpha still shows on the walnut (the line above
    // Settings' Saved Presets is 8 %); below that it is lost in the grain.
    var EDGE_A = 0.04;
    function isDivider(sides) {
        return sides.length === 1 && (sides[0].side === 'top' || sides[0].side === 'bottom') && sides[0].style === 'dotted' && isCopper(sides[0].c);
    }
    // Small theme components that carry their own edge: keycaps, chips, lamps,
    // swatches, screens, and thumbnails (the study frames its layer thumbs).
    var COMPONENT = '.hk-cap, kbd, .hk-picker-key, .wc-chip, .wc-chips, .palette-chip, .lamp, .scr, .wc-tele, '
        + '[class*="swatch"], [class*="screen"], [class*="keycap"], [class*="nixie"], [class*="vfd"], [class*="thumb"]';
    // The controls under a node, a checkbox wrapped in its label counted once
    // (even when the input itself is hidden); see-through inputs count, since
    // a widget may draw its own face over an invisible native control.
    function controlsIn(e) {
        var labs = [].filter.call(e.querySelectorAll('label'), function (l) { return l.querySelector('input, select, textarea'); });
        var ctl = [].filter.call(e.querySelectorAll(CTL_ONLY), function (k) { return visible(k, true) && !labs.some(function (l) { return l.contains(k); }); });
        return ctl.length + labs.length;
    }
    // A text-less part of a one-control widget (a slider's track drawn beside
    // its see-through range input, a knob's ring) is that control's drawing.
    function widgetPart(e, tray) {
        if (squash(e.textContent)) return false;
        for (var a = e.parentElement, k = 0; a && a !== tray && k < 3; a = a.parentElement, k++) {
            var n = controlsIn(a);
            if (n) return n === 1 && squash(a.textContent).length <= 60;
        }
        return false;
    }
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
        return controlsIn(e) === 1 && squash(e.textContent).length <= 60;
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
            if (isPane(e, sides) || widgetPart(e, tray)) return;
            var d = sides.map(function (x) { return x.side + ' ' + x.style + ' ' + r1(x.w) + 'px a=' + Math.round(x.c.a * 100) / 100; });
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
    // A colour a script feeds in per item through a custom property it writes
    // inline (a peer's tint, a brush tile's colour, the study's idle-egg
    // tints): content, not chrome. A colour written inline as a plain
    // property (the legacy SIM badge's gradient) is still chrome.
    function anyColour(v) {
        v = String(v || '').trim();
        var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
        if (m) { var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
        if (/^rgba?\(/.test(v)) return colour(v);
        m = /^(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})$/.exec(v);
        return m ? { r: +m[1], g: +m[2], b: +m[3], a: 1 } : null;
    }
    function fedColour(e, c) {
        for (var x = e; x && x.nodeType === 1 && x !== document.body; x = x.parentElement) {
            var st = x.style;
            for (var i = 0; st && i < st.length; i++) {
                if (st[i].indexOf('--') !== 0) continue;
                var v = anyColour(cs(e).getPropertyValue(st[i]));
                if (v && Math.abs(v.r - c.r) <= 2 && Math.abs(v.g - c.g) <= 2 && Math.abs(v.b - c.b) <= 2) return true;
            }
        }
        return false;
    }
    function offPalette(root, ctx, out) {
        root.querySelectorAll('*').forEach(function (e) {
            if (e.closest(CONTENT) || !visible(e)) return;
            var s = cs(e), hits = [], c, h;
            var off = function (col, minA) { var hue = offHue(col, minA); return hue != null && !fedColour(e, col) ? hue : null; };
            if ((h = off(c = colour(s.backgroundColor), 0.3)) != null) hits.push('background ' + hex(c) + ' (hue ' + h + ')');
            (String(s.backgroundImage || '').replace(/url\([^)]*\)/g, '').match(/rgba?\([^)]+\)/g) || []).some(function (m) {
                if ((h = off(c = colour(m), 0.3)) != null) { hits.push('gradient stop ' + hex(c) + ' (hue ' + h + ')'); return true; }
            });
            // The idle easter egg (js/37, #sidebar-right[data-idle-glow]) tints text on purpose.
            if (directText(e) && !e.closest('[data-idle-glow]') && (h = off(c = colour(s.color), 0.5)) != null) hits.push('text ' + hex(c) + ' (hue ' + h + ')');
            ['Top', 'Right', 'Bottom', 'Left'].some(function (k) {
                if (s['border' + k + 'Style'] === 'none' || px(s['border' + k + 'Width']) <= 0) return false;
                if ((h = off(c = colour(s['border' + k + 'Color']), 0.3)) != null) { hits.push('border ' + hex(c) + ' (hue ' + h + ')'); return true; }
            });
            if (hits.length) issue(out, 'off-palette', ctx, e, label(e), hits.join('; '));
        });
    }

    // label-style: label-like text with its style signature (grouped in Node).
    function sigOf(el) {
        var s = cs(el), c = colour(s.color) || { r: 0, g: 0, b: 0, a: 1 };
        var hex = '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('') + (c.a < 1 ? '/' + r1(c.a) : '');
        var lsn = s.letterSpacing === 'normal' ? 0 : r1(px(s.letterSpacing)), ls = lsn ? lsn + 'px' : '0';
        var parts = { family: firstFamily(s.fontFamily), size: r1(px(s.fontSize)), weight: s.fontWeight, ls: lsn, transform: s.textTransform, colour: hex };
        return { sig: [parts.family, parts.size + 'px', parts.weight, 'ls ' + ls, parts.transform, hex].join(' · '), parts: parts };
    }
    // A label names one control (its <label>, a checkbox row, an
    // aria-labelledby target, or the only control in its row); a heading
    // heads a group. The study has a few heading tiers (.sect, .subhd) beside
    // its one control-label style, so each role is judged on its own.
    function labelRole(holder) {
        var lab = holder.closest('label');
        if (lab && (lab.control || lab.querySelector('input, select, textarea'))) return 'label';
        if (holder.closest('.checkbox-group')) return 'label';
        if (holder.closest('h1, h2, h3, h4, h5, h6, [role=heading]')) return 'heading';
        var named = [holder, holder.parentElement].some(function (x) {
            return x && x.id && document.querySelector('[aria-labelledby~="' + CSS.escape(x.id) + '"]');
        });
        if (named) return 'label';
        for (var a = holder.parentElement, k = 0; a && k < 2; a = a.parentElement, k++) {
            var n = controlsIn(a);
            if (n === 1) return 'label';
            if (n > 1) break;
        }
        return 'heading';
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
    var NOT_LABEL = 'button, select, .btn, .wc-opt, [role=option], [role=listbox], [role=button], [role=radio], [role=checkbox], [role=switch], '
        + '[role=combobox], [role=slider], [role=spinbutton], [role=tab], [class*="thumb"], '
        + '.scr, .scr-cap, [class*="screen"], [class*="vfd"], [class*="readout"], [role=log], [role=status], [role=timer]';
    function collectLabels(tray, ctx) {
        var out = [], seen = new Set(), cands = [];
        tray.querySelectorAll('label, h1, h2, h3, h4, h5, h6, [role=heading], [class*="label"], [class*="Label"], [class*="title"], [class*="Title"], [class*="head"], [class*="Head"]').forEach(function (e) { cands.push(e); });
        eachText(tray, function (t, el) {
            var txt = directText(el);
            if (txt.length && txt.length <= 32 && /[A-Za-z]/.test(txt) && rendersUpper(el, txt) && !el.matches(CONTROL) && controlNear(el)) cands.push(el);
        });
        cands.forEach(function (c) {
            // Not labels: a control's own text (a field's value), a thumbnail's
            // badge (the layer list's SIM), a screen's readout (VFD captions,
            // the room feed).
            if (c.closest(NOT_LABEL) || !visible(c)) return;
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
            if (holder.closest(NOT_LABEL)) return;
            seen.add(holder);
            var sg = sigOf(holder);
            out.push({ width: ctx.width, drawer: ctx.drawer, path: cssPath(holder), text: short(label(holder) || txt, 40), sig: sg.sig, parts: sg.parts, role: labelRole(holder) });
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
        (against || []).forEach(function (bar) {
            if (!visible(bar, true) || bar.contains(root)) return;
            var ar = bar.getBoundingClientRect();
            list.forEach(function (e, k) {
                var x = cross(rects[k], ar);
                if (x) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: cssPath(e) + '  ×  ' + cssPath(bar),
                    text: short(label(e), 60), detail: 'over ' + segBase(bar) + ' by ' + x.w + '×' + x.h + 'px' });
            });
        });
        var against0 = (against || []).filter(function (b) { return b.id === 'sidebar-left'; })[0];
        // A control cut off sideways, by the window or by an ancestor that
        // hides overflow (not one you can scroll): the bar ran out of room
        // (770 px: Presets' field and Stop run past the strip's edge).
        var inBar = root.parentElement && root.parentElement.id === 'sidebar-right' && document.body.classList.contains('compact-ui');
        if (!inBar) {
            var vw0 = document.documentElement.clientWidth;
            list.forEach(function (e, k) {
                if (list.some(function (o) { return o !== e && o.contains(e); })) return;   // the outer control speaks for its parts
                var r = rects[k], past = r.right - vw0 > 2 ? r.right - vw0 : 0, by = past ? 'the window' : null;
                clippers(e, false).forEach(function (c) {
                    var s = cs(c.el);
                    if (!c.x || s.overflowX === 'auto' || s.overflowX === 'scroll') return;
                    var b = padBox(c.el), p = Math.max(r.right - b.right, b.left - r.left);
                    if (p > 2 && p > past) { past = p; by = seg(c.el); }
                });
                if (by) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: cssPath(e), text: short(label(e), 60), detail: 'control cut ' + r1(past) + 'px by ' + by });
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
            if (against0 && visible(against0, true)) {
                var x = cross(bar.getBoundingClientRect(), against0.getBoundingClientRect());
                if (x) out.push({ check: 'overlap', width: ctx.width, drawer: ctx.drawer, path: '#sidebar-right  ×  ' + cssPath(against0), text: 'right bar over left bar', detail: x.w + '×' + x.h + 'px' });
            }
        }
    }
    // The underbar and its floating labels (quality drop-downs, Reset app,
    // the demo clock, the playtest label) must keep off both sidebars.
    function underbarOverlap(ctx, out) {
        var bars = ['sidebar-left', 'sidebar-right'].map(function (id) { return document.getElementById(id); })
            .filter(function (b) { return b && visible(b, true); });
        var seen = [];
        [].forEach.call(document.querySelectorAll('#quality-underbar *, .playtest-label, .demo-clock, .demo-clock *'), function (e) {
            if (seen.some(function (s) { return s.contains(e); })) return;
            if (!(e.matches(INTERACTIVE) || directText(e)) || !visible(e, true)) return;
            seen.push(e);
            var r = e.getBoundingClientRect();
            bars.forEach(function (b) {
                if (b.contains(e)) return;
                var x = cross(r, b.getBoundingClientRect());
                if (x) issue(out, 'overlap', ctx, e, label(e), 'over #' + b.id + ' by ' + x.w + '×' + x.h + 'px');
            });
        });
    }
    // fold-width: a folded sidebar is a rail (stock 32 px), so a compact
    // window's canvas gets the room (js/13). A folded bar drawn at full width
    // squeezes the canvas while it shows nothing but the rail.
    var RAIL_MAX = 48;
    function foldWidth(ctx, out) {
        var vw = document.documentElement.clientWidth, area = document.getElementById('canvas-area');
        var aw = area ? Math.round(area.getBoundingClientRect().width) : null;
        [['left', 'sidebar-left'], ['right', 'sidebar-right']].forEach(function (p) {
            var S = window.Sidebars && window.Sidebars[p[0]], bar = document.getElementById(p[1]);
            if (!S || !bar || !S.isCollapsed || !S.isCollapsed()) return;
            var w = r1(bar.getBoundingClientRect().width);
            if (w > RAIL_MAX) issue(out, 'fold-width', ctx, bar, p[0] + ' bar (folded)', 'folded bar ' + w + 'px wide (a rail is at most ' + RAIL_MAX + 'px; stock 32px)'
                + (aw != null ? ': the canvas gets ' + aw + ' of ' + vw + 'px' : ''));
        });
    }

    // Controls in an open tray that are not rendered (inside a collapsed
    // sub-panel): no check sees them, so the report says how many.
    function hiddenControls(tray) {
        return [].filter.call(tray.querySelectorAll('input:not([type=hidden]), select, textarea, button'), function (e) {
            return !(e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : e.getClientRects().length);
        }).length;
    }
    function scan(o) {
        cache = new Map();
        var ctx = { width: o.width, drawer: o.drawer }, out = [], labels = [];
        var ch = o.checks;
        if (ch.indexOf('fold-width') >= 0) foldWidth(ctx, out);
        if (o.root === 'underbar') { underbarOverlap(ctx, out); return { issues: out, labels: labels }; }
        if (!o.root) return { issues: out, labels: labels };
        var root = typeof o.root === 'string' ? document.querySelector(o.root) : o.root;
        if (!root) return { issues: out, labels: labels, missing: !o.optional };
        var tray = o.tray ? (typeof o.tray === 'string' ? root.querySelector(o.tray) : o.tray) : null;
        if (ch.indexOf('clipped-text') >= 0) { clippedText(root, ctx, out); if (tray) trayOverflow(tray, ctx, out); }
        if (ch.indexOf('wrapped-pane') >= 0) wrappedPane(root, ctx, out);
        if (ch.indexOf('native-control') >= 0) nativeControl(root, ctx, out);
        if (ch.indexOf('off-theme-font') >= 0) offThemeFont(root, ctx, out);
        if (ch.indexOf('off-palette') >= 0) offPalette(root, ctx, out);
        if (tray && ch.indexOf('inner-box') >= 0) innerBox(tray, ctx, out);
        if (tray && ch.indexOf('label-style') >= 0) labels = collectLabels(tray, ctx);
        if (ch.indexOf('overlap') >= 0) overlap(root, ctx, out, (o.against || []).map(function (q) { return document.querySelector(q); }).filter(Boolean));
        return { issues: out, labels: labels, hidden: tray ? hiddenControls(tray) : 0 };
    }

    window.__themeLint = { scan: scan, cssPath: cssPath };
    return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Node side
// ─────────────────────────────────────────────────────────────────────────
// An issue is known by where it is, not by its text (a select's text can
// differ between machines, e.g. the detected refresh rate). A cell is one
// size x drawer: the unit a run covers and a baseline compares.
const issueKey = i => [i.check, i.width, i.drawer, i.path].join(' | ');
const countKey = i => [i.width, i.drawer, i.check].join(' | ');
const cellOf = i => i.width + ' | ' + i.drawer;
const cellOfKey = (k, at) => k.split(' | ').slice(at, at + 2).join(' | ');   // issue key: at 1; count key: at 0

async function settle(d, expr, ms) {   // wait until expr's value holds for 3 reads (~200 ms)
    let last = null, same = 0;
    for (let t = 0; t < (ms || 1500); t += 100) {
        const v = JSON.stringify(await d.ev(expr).catch(() => null));
        same = v === last ? same + 1 : 0;
        if (same >= 2) return;
        last = v; await sleep(100);
    }
}

// The shared driver waits on Chrome without a timeout; when Chrome dies
// under load (several workstreams run it at once) a run would hang for
// ever. Every CDP answer counts as progress; 90 s without one ends the run.
let lastBeat = Date.now();
const watchdog = setInterval(() => {
    if (Date.now() - lastBeat < 90000) return;
    console.error('theme-lint: Chrome has not answered for 90 s (it may have died under load); run it again');
    process.exit(3);
}, 5000);
watchdog.unref();
function watch(d) {
    const beat = p => p.finally(() => { lastBeat = Date.now(); });
    const send = d.send, ev = d.ev, load = d.load;
    d.send = (...a) => beat(send(...a));
    d.ev = (...a) => beat(ev(...a));
    d.load = (...a) => beat(load(...a));
    lastBeat = Date.now();
    return d;
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
        const k = cellOf(i);
        (byDrawer[k] = byDrawer[k] || {})[i.check] = (byDrawer[k][i.check] || 0) + 1;
    });
    const counts = {};
    issues.forEach(i => { counts[countKey(i)] = (counts[countKey(i)] || 0) + 1; });
    return { byCheck, byDrawer, counts, labelGroups };
}

function md(s) { return String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;'); }

function writeReport(dir, meta, issues, sum, coverage) {
    fs.mkdirSync(dir, { recursive: true });
    const L = [];
    L.push('# Theme lint report' + (meta.study ? ': the study (calibration)' : ''), '');
    L.push('Head `' + meta.head + '`, ' + meta.when + ', ' + meta.seconds + ' s. Sizes: ' + meta.widths.join(', ') + (meta.small.length ? '; small ' + meta.small.join(', ') : '') + '.', '');
    L.push('## Counts per check', '', '| Check | Issues |', '|---|---:|');
    CHECKS.forEach(c => L.push('| ' + c + ' | ' + (sum.byCheck[c] || 0) + ' |'));
    L.push('| **total** | **' + issues.length + '** |', '');
    L.push('## Counts per drawer', '', '| Size | Drawer | ' + CHECKS.join(' | ') + ' |', '|---|---|' + CHECKS.map(() => '---:').join('|') + '|');
    Object.keys(sum.byDrawer).forEach(k => {
        const [w, dr] = k.split(' | ');
        L.push('| ' + w + ' | ' + md(dr) + ' | ' + CHECKS.map(c => sum.byDrawer[k][c] || '').join(' | ') + ' |');
    });
    L.push('');
    const hid = (coverage || []).filter(c => c.hidden);
    if (hid.length) {
        L.push('## Not scanned', '', 'Controls in an open tray that are not rendered (inside a collapsed sub-panel). The run clicks nothing but drawer titles, so no check sees them; their faults are not in the counts above.', '', '| Size | Drawer | Hidden controls |', '|---|---|---:|');
        hid.forEach(c => L.push('| ' + c.width + ' | ' + md(c.drawer) + ' | ' + c.hidden + ' |'));
        L.push('');
    }
    L.push('## Label styles', '', 'Label-like text in the trays grouped by family · size · weight · letter-spacing · transform · colour, separately for control labels (text naming one control) and headings (text heading a group). Styles within 0.5 px of size and 0.15 px of letter-spacing of a bigger group join it (listed as variants). A group is flagged (each label in it is a `label-style` issue) when it holds under ' + (OUTLIER_SHARE * 100) + ' % of its role\'s labels at that size, or when it is set in another face than most labels (the study engraves every label in its display face).', '');
    Object.keys(sum.labelGroups).forEach(w => {
        const g = sum.labelGroups[w];
        L.push('### ' + w + ' (' + g.total + ' labels, face ' + g.face + ')', '');
        Object.keys(g.roles).forEach(role => {
            const r = g.roles[role];
            L.push('**' + (role === 'label' ? 'Control labels' : 'Headings') + '** (' + r.total + ')', '', '| Count | Signature | Examples | Flag |', '|---:|---|---|---|');
            r.groups.forEach(x => L.push('| ' + x.count + ' | `' + md(x.sig) + '`' + (x.variants.length ? ' (+ ' + x.variants.map(v => '`' + md(v) + '`').join(', ') + ')' : '') + ' | '
                + x.examples.map(e => md(e.drawer + ': ' + e.text)).join('; ') + ' | ' + md(x.outlier || '') + ' |'));
            L.push('');
        });
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
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, counts: sum.byCheck, perDrawer: sum.byDrawer, labelGroups: sum.labelGroups, coverage, issues }, null, 1));
}

// Styles this close are one style drifting (9.5 vs 10 px, 1.1 vs 1.2 px
// tracking), not a second style: the smaller group joins the bigger one.
function nearStyle(a, b) {
    return a.family === b.family && a.weight === b.weight && a.transform === b.transform && a.colour === b.colour
        && Math.abs(a.size - b.size) <= 0.5 && Math.abs(a.ls - b.ls) <= 0.15;
}

function groupLabels(labels) {
    const per = {};
    labels.forEach(l => { (per[l.width] = per[l.width] || []).push(l); });
    const out = {};
    Object.keys(per).forEach(w => {
        const list = per[w];
        // The face most labels use; the study engraves every label in it.
        const fam = {};
        list.forEach(l => { fam[l.parts.family] = (fam[l.parts.family] || 0) + 1; });
        const face = Object.keys(fam).sort((a, b) => fam[b] - fam[a])[0];
        const roles = {};
        ['label', 'heading'].forEach(role => {
            const mine = list.filter(l => l.role === role);
            if (!mine.length) return;
            const m = new Map();
            mine.forEach(l => { if (!m.has(l.sig)) m.set(l.sig, { sig: l.sig, parts: l.parts, members: [] }); m.get(l.sig).members.push(l); });
            const hosts = [];
            [...m.values()].sort((a, b) => b.members.length - a.members.length).forEach(g => {
                const host = hosts.find(h => nearStyle(h.parts, g.parts));
                if (host) { host.members.push(...g.members); host.variants.push(g.sig); }
                else hosts.push(Object.assign(g, { variants: [] }));
            });
            roles[role] = { total: mine.length, groups: hosts.map(g => ({ sig: g.sig, parts: g.parts, variants: g.variants, count: g.members.length,
                rare: g.members.length < mine.length * OUTLIER_SHARE, examples: g.members.slice(0, 3).map(l => ({ drawer: l.drawer, text: l.text })), members: g.members })) };
        });
        // A style that is common in either role is one of the theme's label
        // styles: a heading set like the control labels is not an outlier.
        const common = [].concat(...Object.values(roles).map(r => r.groups.filter(g => !g.rare)));
        Object.keys(roles).forEach(role => {
            const r = roles[role];
            r.groups.forEach(g => {
                const why = [];
                if (g.rare && !common.some(c => nearStyle(c.parts, g.parts))) why.push('outlier ' + role + ' style (' + g.count + ' of ' + r.total + ')');
                if (g.parts.family !== face) why.push('not the labels\' face (' + face + ')');
                g.outlier = why.join(', ');
            });
            r.groups.sort((a, b) => b.count - a.count);
        });
        Object.values(roles).forEach(r => r.groups.forEach(g => { delete g.rare; delete g.parts; }));
        out[w] = { total: list.length, face, roles };
    });
    return out;
}

// label-style outliers become issues (only for the drawers a run reports on)
function labelIssues(labelGroups, keep) {
    const out = [];
    Object.keys(labelGroups).forEach(w => Object.keys(labelGroups[w].roles).forEach(role => labelGroups[w].roles[role].groups.forEach(g => {
        if (g.outlier) g.members.forEach(l => { if (!keep || keep(l)) out.push({ check: 'label-style', width: l.width, drawer: l.drawer, path: l.path, text: l.text, detail: g.outlier + ': ' + g.sig }); });
        delete g.members;
    })));
    return out;
}

function sortIssues(issues) {   // stable order: cell as met, then check order
    const order = new Map(); issues.forEach((i, k) => { const key = cellOf(i); if (!order.has(key)) order.set(key, k); });
    issues.sort((a, b) => (order.get(cellOf(a)) - order.get(cellOf(b))) || (CHECKS.indexOf(a.check) - CHECKS.indexOf(b.check)));
}

function headOf() { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { return '?'; } }

const BASE = ['clipped-text', 'wrapped-pane', 'native-control', 'off-theme-font', 'off-palette'];
const TRAY = CHECKS.filter(c => c !== 'overlap' && c !== 'fold-width');

// ── --study: the same page code on the study, which must come back clean ──
async function studyMain(opt) {
    const t0 = Date.now();
    const sz = opt.widths[0] || { w: 1920, h: 1080, label: '1920x1080' };
    const W = 'study ' + sz.label;
    const issues = [], labels = [];
    const d = watch(await boot({ args: ['--disable-gpu-compositing'] }));
    try {
        await d.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await d.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: false });
        await d.send('Page.navigate', { url: d.url.replace(/index\.html$/, 'design/walnut-copper-study.html') });
        for (let i = 0; i < 80; i++) {
            await sleep(250);
            if (await d.ev(`document.readyState === 'complete' && document.querySelectorAll('.drw .dfront').length > 5`).catch(() => false)) break;
        }
        await d.ev('document.fonts.ready.then(function(){ return 1; })');
        await sleep(800);
        await install(d);
        let r = await scan(d, { root: '.navbar', width: W, drawer: 'top bar', checks: BASE, optional: true });
        issues.push(...r.issues);
        const n = await d.ev(`document.querySelectorAll('.drw').length`);
        for (let k = 0; k < n; k++) {
            const title = await d.ev(`(function(){ var all = [].slice.call(document.querySelectorAll('.drw'));
                all.forEach(function(s, i){ var f = s.querySelector('.dfront'); if (i !== ${k} && f.getAttribute('aria-expanded') === 'true') f.click(); });
                var s = all[${k}], f = s.querySelector('.dfront'); if (f.getAttribute('aria-expanded') !== 'true') f.click();
                window.__tlSec = s; var t = s.querySelector('.dtitle'); return (t || f).textContent.trim().replace(/\\s+/g, ' '); })()`);
            await sleep(150);
            await settle(d, `(function(){ var t = window.__tlSec.querySelector('.dtray'); if (!t) return 0; var r = t.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; })()`, 2500);
            r = await d.ev(`window.__themeLint.scan({ root: window.__tlSec, tray: window.__tlSec.querySelector('.dtray'), width: ${JSON.stringify(W)}, drawer: ${JSON.stringify(title)}, checks: ${JSON.stringify(TRAY)} })`);
            issues.push(...r.issues); labels.push(...r.labels);
            console.log('  ' + title.padEnd(26) + ' ' + r.issues.length + ' issues, ' + r.labels.length + ' labels');
        }
        // The idle easter egg (20 s untouched) tints the right cabinet's
        // titles: show it (a class on the study's own page) and judge it too.
        if (await d.ev(`(function(){ var c = document.querySelector('.cabR'); if (!c) return false; c.classList.add('idle'); return true; })()`)) {
            await sleep(300);
            r = await scan(d, { root: '.cabR', width: W, drawer: 'idle egg', checks: ['off-palette', 'off-theme-font'] });
            issues.push(...r.issues);
            console.log('  ' + 'idle egg (.cabR.idle)'.padEnd(26) + ' ' + r.issues.length + ' issues');
        }
    } finally { await d.close(); }
    const labelGroups = groupLabels(labels);
    issues.push(...labelIssues(labelGroups));
    sortIssues(issues);
    const seconds = Math.round((Date.now() - t0) / 1000);
    const meta = { head: headOf(), when: new Date().toISOString(), seconds, widths: [W], small: [], study: true };
    const sum = summarise(issues, labelGroups);
    const dir = path.join(opt.out, 'study');
    writeReport(dir, meta, issues, sum, []);
    console.log('\nstudy: ' + CHECKS.map(c => c + ' ' + (sum.byCheck[c] || 0)).join(', ') + '  (total ' + issues.length + ', ' + seconds + ' s)');
    console.log('report: ' + path.join(dir, 'report.md'));
    const own = issues.filter(i => STUDY_FAULTS.some(f => f.check === i.check && f.path.test(i.path)));
    const bad = issues.filter(i => own.indexOf(i) < 0);
    if (own.length) {
        console.log('\nthe study\'s own faults (real, seen in its shots; not held against the checker):');
        own.forEach(i => console.log('  ' + i.check + ' | ' + i.drawer + ' | ' + i.path + '  "' + i.text + '"  ' + i.detail));
    }
    if (bad.length) {
        console.log('\nFAIL: the study is the spec, yet these checks flag it (an exemption or a threshold is off):');
        bad.forEach(i => console.log('  ' + i.check + ' | ' + i.drawer + ' | ' + i.path + '  "' + i.text + '"  ' + i.detail));
        process.exit(1);
    }
    console.log('PASS: the study comes back clean');
}
// Faults the study itself has. Its right cabinet's "Colors and palettes"
// front is cut to "COLORS AND PALETT" at 1920 (its title ellipsis plus the
// drawer's lamp): a real cut, so the check is right to see it.
const STUDY_FAULTS = [
    { check: 'clipped-text', path: /^#sp-light > button\.dfront > span\.dtitle$/ },
];

(async () => {
    const opt = parseArgs(process.argv.slice(2));
    if (opt.study) return studyMain(opt);
    const t0 = Date.now();
    const issues = [], labels = [], cells = new Set(), coverage = [];
    const take = (res, cell) => { issues.push(...res.issues); cells.add(cell); return res; };
    const d = watch(await boot({ args: ['--disable-gpu-compositing'] }));
    try {
        await d.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        for (const sz of opt.widths) {
            await d.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: false });
            await d.load();
            await sleep(400);
            await install(d);
            const W = sz.label;
            take(await scan(d, { root: '#mixer-strip', width: W, drawer: 'top bar', checks: BASE.concat('overlap'), against: ['#sidebar-left', '#sidebar-right'] }), W + ' | top bar');
            take(await scan(d, { root: '#sidebar-left .lsb-head', width: W, drawer: 'left head', checks: BASE }), W + ' | left head');
            take(await scan(d, { root: 'underbar', width: W, drawer: 'underbar', checks: ['overlap'] }), W + ' | underbar');
            const titles = await drawerTitles(d);
            for (const { side, title } of titles) {
                const ok = await openDrawer(d, title);
                if (!ok) { console.log('  ' + W + ' could not open ' + title); continue; }
                // label-style judges a label against all the others, so a
                // --drawers run still collects every drawer's labels.
                const sel = !opt.only || opt.only.test(title);
                const res = await d.ev(`window.__themeLint.scan({ root: window.__tlSec, tray: window.__tlSec.querySelector('.section-body'), width: ${JSON.stringify(W)}, drawer: ${JSON.stringify(title)}, checks: ${JSON.stringify(sel ? TRAY : ['label-style'])} })`);
                labels.push(...res.labels.map(l => Object.assign(l, { selected: sel })));
                if (!sel) continue;
                take(res, W + ' | ' + title);
                coverage.push({ width: W, drawer: title, hidden: res.hidden });
                console.log('  ' + W + ' ' + side.padEnd(5) + ' ' + title.padEnd(22) + ' ' + res.issues.length + ' issues, ' + res.labels.length + ' labels' + (res.hidden ? ', ' + res.hidden + ' controls not shown' : ''));
            }
            console.log(W + ' done at ' + Math.round((Date.now() - t0) / 1000) + ' s');
        }
        // Small windows, resized in place. A compact one (js/13) folds both
        // bars and moves the strip into the right one: measure the folded
        // bars, then open the right bar the way js/13 does (never persisted)
        // and scan the strip there. Otherwise scan the top bar. Both: the
        // underbar must keep off the bars.
        if (opt.small.length) {
            if (!opt.widths.length) await d.load();
            await install(d);
            const SMALL = ['clipped-text', 'wrapped-pane', 'overlap'];
            for (const sz of opt.small) {
                const W = sz.label;
                await d.send('Emulation.setDeviceMetricsOverride', { width: sz.w, height: sz.h, deviceScaleFactor: 1, mobile: false });
                await settle(d, `[document.body.className, innerWidth, innerHeight]`, 1500);
                const compact = await d.ev(`document.body.classList.contains('compact-ui')`);
                const bars = `(function(){ return ['sidebar-left', 'sidebar-right', 'mixer-strip'].map(function(id){ var r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width), Math.round(r.height)]; }); })()`;
                let res;
                if (compact) {
                    await d.ev(`(function(){ if (window.Sidebars) { Sidebars.right.fold(true); Sidebars.left.fold(true); } return 1; })()`);
                    await settle(d, bars, 1500);
                    res = take(await scan(d, { root: null, width: W, drawer: 'folded bars', checks: ['fold-width'] }), W + ' | folded bars');
                    const n = res.issues.length;
                    await d.ev(`(function(){ if (window.Sidebars && Sidebars.right.isCollapsed()) Sidebars.right.fold(false); return 1; })()`);
                    await settle(d, bars, 1500);
                    res = take(await scan(d, { root: '#mixer-strip', width: W, drawer: 'compact strip', checks: SMALL, against: ['#sidebar-left'] }), W + ' | compact strip');
                    console.log('  ' + W + ' compact: ' + n + ' folded-bar issues, ' + res.issues.length + ' strip issues');
                } else {
                    await settle(d, bars, 1500);
                    res = take(await scan(d, { root: '#mixer-strip', width: W, drawer: 'top bar', checks: SMALL, against: ['#sidebar-left', '#sidebar-right'] }), W + ' | top bar');
                    console.log('  ' + W + ': ' + res.issues.length + ' top-bar issues');
                }
                res = take(await scan(d, { root: 'underbar', width: W, drawer: 'underbar', checks: ['overlap'] }), W + ' | underbar');
                if (res.issues.length) console.log('  ' + W + ': ' + res.issues.length + ' underbar overlaps');
            }
        }
    } finally { await d.close(); }

    const labelGroups = groupLabels(labels);
    issues.push(...labelIssues(labelGroups, l => l.selected));
    sortIssues(issues);

    const seconds = Math.round((Date.now() - t0) / 1000);
    const meta = { head: headOf(), when: new Date().toISOString(), seconds, widths: opt.widths.map(s => s.label), small: opt.small.map(s => s.label) };
    if (opt.only) meta.drawers = String(opt.only);
    const sum = summarise(issues, labelGroups);
    writeReport(opt.out, meta, issues, sum, coverage);
    console.log('\n' + CHECKS.map(c => c + ' ' + (sum.byCheck[c] || 0)).join(', ') + '  (total ' + issues.length + ', ' + seconds + ' s)');
    console.log('report: ' + path.join(opt.out, 'report.md'));

    if (opt.update) writeBaseline(opt, meta, issues, cells);
    if (opt.check) checkBaseline(opt, issues, cells);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });

function readBaseline(file) {
    const base = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Older baselines carry no cell list: a cell is known if it had an issue.
    if (!base.cells) base.cells = [...new Set(Object.keys(base.counts || {}).map(k => cellOfKey(k, 0)))];
    return base;
}

// A run that covered less than the defaults (--drawers, other --widths or
// --small) only replaces its own cells, so it never drops the rest.
function writeBaseline(opt, meta, issues, cells) {
    const full = !opt.only && meta.widths.join() === sizeList('1920,1440').map(s => s.label).join() && meta.small.join() === sizeList(DEFAULT_SMALL).map(s => s.label).join();
    let rows = issues.map(i => ({ key: issueKey(i), text: i.text })), allCells = [...cells];
    if (!full && fs.existsSync(opt.update)) {
        const base = readBaseline(opt.update);
        rows = rows.concat((base.issues || []).filter(x => !cells.has(cellOfKey(x.key, 1))));
        allCells = [...new Set(allCells.concat(base.cells))];
        meta = Object.assign({}, meta, { merged: 'replaced ' + cells.size + ' of ' + allCells.length + ' cells' });
        console.log('partial run: merged into the baseline (' + cells.size + ' cells replaced, the rest kept)');
    }
    const counts = {};
    rows.forEach(r => { const p = r.key.split(' | '), k = [p[1], p[2], p[0]].join(' | '); counts[k] = (counts[k] || 0) + 1; });
    // One issue per line so a baseline change reads as a plain diff.
    const lines = rows.map(r => '  ' + JSON.stringify(r)).sort();
    const cl = Object.keys(counts).sort().map(k => '  ' + JSON.stringify(k) + ': ' + counts[k]);
    fs.mkdirSync(path.dirname(opt.update), { recursive: true });
    fs.writeFileSync(opt.update, '{\n"meta": ' + JSON.stringify(meta) + ',\n"cells": ' + JSON.stringify(allCells.sort()) + ',\n"counts": {\n' + cl.join(',\n') + '\n},\n"issues": [\n' + lines.join(',\n') + '\n]\n}\n');
    console.log('baseline written: ' + path.relative(ROOT, opt.update));
}

// Compares issue by issue (check, size, drawer, path), in the cells both
// this run and the baseline cover: a fix and a new fault in the same drawer
// can't cancel out.
function checkBaseline(opt, issues, cells) {
    if (!fs.existsSync(opt.check)) { console.error('no baseline at ' + opt.check + ' (write one with --update)'); process.exit(2); }
    const base = readBaseline(opt.check);
    const known = new Set(base.cells);
    const common = new Set([...cells].filter(c => known.has(c)));
    const fresh = [...cells].filter(c => !known.has(c));
    if (fresh.length) console.log('\nnot in the baseline, not compared: ' + fresh.join(', '));
    const tally = new Map();
    (base.issues || []).forEach(x => { if (common.has(cellOfKey(x.key, 1))) tally.set(x.key, (tally.get(x.key) || 0) + 1); });
    const added = [];
    issues.forEach(i => {
        if (!common.has(cellOf(i))) return;
        const k = issueKey(i), n = tally.get(k) || 0;
        if (n > 0) tally.set(k, n - 1); else added.push(i);
    });
    const gone = [...tally.entries()].filter(([, n]) => n > 0);
    if (gone.length) {
        console.log('\ngone since the baseline (good; --update to keep it): ' + gone.reduce((s, [, n]) => s + n, 0));
        gone.slice(0, 40).forEach(([k, n]) => console.log('  - ' + k + (n > 1 ? ' (x' + n + ')' : '')));
        if (gone.length > 40) console.log('  ... and ' + (gone.length - 40) + ' more');
    }
    if (added.length) {
        console.log('\nFAIL: ' + added.length + ' issue(s) not in ' + path.relative(ROOT, opt.check) + ':');
        added.forEach(i => console.log('  + ' + i.check + ' | ' + cellOf(i) + ' | ' + i.path + '  "' + i.text + '"  ' + i.detail));
        process.exit(1);
    }
    console.log('\nPASS: no new issue against ' + path.relative(ROOT, opt.check));
}
