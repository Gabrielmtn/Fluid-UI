// Layout flags for the polish tour: the problems a colour/font audit cannot
// see. window.__polishGeom(root) returns [{ kind, label, sel, rect, note }]
// for everything visible inside root. Used by the tour card (live, per stop)
// and by shoot.js (headless captures, drawn onto an annotated PNG).
//
// kinds: overlap (text covered by another control), align (a checkbox row's
// text starts off its siblings' line), uneven (controls side by side with
// different heights), empty (a control showing no text or icon), nested (a
// framed box inside another framed box), heavy (a thick border on a small
// control), emoji (a colour emoji glyph, never themed), native (a select that
// opens the OS list, unstyled), native-box (a browser checkbox drawn).
(function () {
    'use strict';
    function shown(e) {
        if (!e || !e.getBoundingClientRect) return false;
        var r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        for (var n = e; n && n.nodeType === 1; n = n.parentElement) {
            var c = getComputedStyle(n);
            if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false;
        }
        return true;
    }
    function lab(e) { return (e.getAttribute('aria-label') || e.textContent || e.title || e.id || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40); }
    function sel(e) {
        if (e.id) return '#' + e.id;
        var parts = [];
        for (var n = e; n && n !== document.body; n = n.parentElement) {
            if (n.id) { parts.unshift('#' + n.id); break; }
            var p = n.tagName.toLowerCase(), cl = typeof n.className === 'string' ? n.className.split(/\s+/).filter(Boolean).slice(0, 2) : [];
            if (cl.length) p += '.' + cl.join('.');
            var par = n.parentElement;
            if (par) { var same = Array.prototype.filter.call(par.children, function (c) { return c.tagName === n.tagName; }); if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(n) + 1) + ')'; }
            parts.unshift(p);
        }
        return parts.join(' > ');
    }
    function box(r) { return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }
    function alpha(c) { var m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return /oklab|oklch|color\(/.test(c) ? 1 : 0; var p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; }
    function framed(e) {
        var c = getComputedStyle(e);
        var bw = parseFloat(c.borderTopWidth) + parseFloat(c.borderLeftWidth);
        if (bw >= 1 && c.borderTopStyle !== 'none' && alpha(c.borderTopColor) > 0.15) return true;
        // An inset or spread ring drawn with box-shadow reads as a border.
        return /(inset|0px 0px 0px [1-9])/.test(c.boxShadow) && c.boxShadow !== 'none';
    }
    function textRect(e) {
        var r = null;
        Array.prototype.forEach.call(e.childNodes, function (n) {
            if (n.nodeType !== 3 || !n.textContent.trim()) return;
            var rg = document.createRange(); rg.selectNodeContents(n);
            var b = rg.getBoundingClientRect();
            if (b.width < 1) return;
            if (!r) r = { l: b.left, t: b.top, r: b.right, b: b.bottom };
            else { r.l = Math.min(r.l, b.left); r.t = Math.min(r.t, b.top); r.r = Math.max(r.r, b.right); r.b = Math.max(r.b, b.bottom); }
        });
        return r;
    }
    var EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]️|[\u{1F300}-\u{1FAFF}]/u;
    var CTL = 'button, select, input:not([type=hidden]), [role=button], textarea';

    window.__polishGeom = function (root) {
        root = root || document.body;
        var out = [], seen = new Set();
        function flag(kind, e, note, r) {
            var k = kind + '|' + sel(e);
            if (seen.has(k)) return;
            seen.add(k);
            out.push({ kind: kind, label: lab(e), sel: sel(e), rect: box(r || e.getBoundingClientRect()), note: note || '' });
        }
        var all = Array.prototype.slice.call(root.querySelectorAll('*')).filter(function (e) { return !(e instanceof SVGElement) && !e.closest('#pt-card, #pt-ring, #pt-row-ring, #pt-pin-ring, #pt-pill, #pt-flags') && shown(e); });

        // overlap: text covered by a positioned control that isn't its own.
        var tops = all.filter(function (e) { var p = getComputedStyle(e).position; return (p === 'absolute' || p === 'fixed') && e.matches(CTL); });
        all.forEach(function (e) {
            var t = textRect(e); if (!t) return;
            var ta = (t.r - t.l) * (t.b - t.t); if (ta < 4) return;
            tops.forEach(function (o) {
                if (o === e || o.contains(e) || e.contains(o)) return;
                var b = o.getBoundingClientRect();
                var w = Math.min(t.r, b.right) - Math.max(t.l, b.left), h = Math.min(t.b, b.bottom) - Math.max(t.t, b.top);
                if (w > 2 && h > 2 && w * h > ta * 0.08) flag('overlap', o, '"' + lab(o) + '" covers "' + lab(e) + '"');
            });
        });

        // align: checkbox rows in one drawer should start their text on one line.
        var rows = all.filter(function (e) { return e.matches('label') && (e.querySelector('input[type=checkbox]') || (e.htmlFor && document.getElementById(e.htmlFor) && document.getElementById(e.htmlFor).type === 'checkbox')); });
        var groups = new Map();
        rows.forEach(function (l) {
            var g = l.closest('.sidebar-section, .lsb-head, #mixer-strip, [role=dialog]') || root;
            if (!groups.has(g)) groups.set(g, []);
            var t = textRect(l) || (l.querySelector('span') && textRect(l.querySelector('span')));
            if (t) groups.get(g).push({ l: l, off: Math.round(t.l - l.getBoundingClientRect().left), mid: (t.t + t.b) / 2 - (l.getBoundingClientRect().top + l.getBoundingClientRect().height / 2) });
        });
        groups.forEach(function (list) {
            if (list.length < 3) return;
            var counts = {}; list.forEach(function (x) { counts[x.off] = (counts[x.off] || 0) + 1; });
            var mode = +Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
            list.forEach(function (x) {
                if (Math.abs(x.off - mode) > 3) flag('align', x.l, 'text starts ' + x.off + ' px in, its siblings ' + mode + ' px');
                if (Math.abs(x.mid) > 3) flag('align', x.l, 'text sits ' + Math.round(x.mid) + ' px off its pane’s middle');
            });
        });

        // uneven: controls laid side by side in one row.
        all.forEach(function (e) {
            var c = getComputedStyle(e);
            if (!/flex|grid/.test(c.display) || (c.display.indexOf('flex') >= 0 && c.flexDirection.indexOf('column') === 0)) return;
            var kids = Array.prototype.filter.call(e.children, function (k) { return shown(k) && (k.matches(CTL) || k.querySelector(':scope > select, :scope > button')); });
            if (kids.length < 2) return;
            var rs = kids.map(function (k) { return k.getBoundingClientRect(); });
            var sameLine = rs.every(function (r) { return Math.abs(r.top - rs[0].top) < 12 || Math.abs(r.bottom - rs[0].bottom) < 12; });
            if (!sameLine) return;
            var hs = rs.map(function (r) { return Math.round(r.height); });
            if (Math.max.apply(null, hs) - Math.min.apply(null, hs) > 4) flag('uneven', e, 'heights ' + hs.join(' / ') + ' px');
        });

        // cut: a single word wider than the room its control gives it (a word
        // cannot wrap, so it is clipped or spills). Measured on a canvas in
        // the element's own face, tracking and case.
        var mctx = document.createElement('canvas').getContext('2d');
        function wordsFit(e, text) {
            var c = getComputedStyle(e);
            var room = e.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
            if (room < 8) return null;
            mctx.font = c.fontStyle + ' ' + c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily;
            try { mctx.letterSpacing = c.letterSpacing === 'normal' ? '0px' : c.letterSpacing; } catch (_) {}
            var up = c.textTransform === 'uppercase' || /small-caps/.test(c.fontVariantCaps);
            var worst = null;
            text.split(/\s+/).forEach(function (w) {
                if (!w) return;
                var wd = mctx.measureText(up ? w.toUpperCase() : w).width * (/small-caps/.test(c.fontVariantCaps) ? 0.8 : 1);
                if (wd > room + 2 && (!worst || wd > worst.w)) worst = { word: w, w: Math.round(wd), room: Math.round(room) };
            });
            return worst;
        }
        all.forEach(function (e) {
            var t = null;
            if (e.matches('select')) { var o = e.options[e.selectedIndex]; t = o && o.textContent.trim(); }
            else if (e.matches('button, label, [role=button]') || e.closest('button, label')) t = Array.prototype.filter.call(e.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join(' ').trim();
            if (!t) return;
            // An inline box is as wide as its words; only a box whose width
            // the layout sets (a block, a flex or grid item, a select) can be
            // too narrow for one.
            if (!e.matches('select') && getComputedStyle(e).display.indexOf('inline') === 0) return;
            // The measure is an estimate (small caps especially); a box that
            // reports no overflow is trusted. A select never reports one.
            if (!e.matches('select') && e.scrollWidth <= e.clientWidth + 1) return;
            var bad = wordsFit(e, t);
            if (bad) flag('cut', e, '"' + bad.word + '" needs ' + bad.w + ' px, has ' + bad.room);
        });

        all.forEach(function (e) {
            var c = getComputedStyle(e), r = e.getBoundingClientRect();
            // empty: a control showing nothing.
            if (e.matches('select') && r.width > 24) {
                var o = e.options[e.selectedIndex];
                if (!o || !o.textContent.trim()) flag('empty', e, 'select shows no text');
                if (e.closest('#sidebar-left, #sidebar-right') == null || e.classList.contains('material-mode-select')) flag('native', e, 'opens the OS list, unthemed');
            }
            if (e.matches('button, [role=button]') && r.width > 16 && !e.textContent.trim() && !e.querySelector('svg, img, canvas, i, span') && c.backgroundImage === 'none' && !e.getAttribute('aria-label') && getComputedStyle(e, '::before').content === 'none' && getComputedStyle(e, '::after').content === 'none') flag('empty', e, 'button shows no text or icon');
            // native-box: a browser checkbox still drawn.
            if (e.matches('input[type=checkbox], input[type=radio]') && c.appearance !== 'none' && r.width >= 6) flag('native-box', e, 'browser ' + e.type + ' drawn');
            // heavy: thick border on a small thing.
            var bw = Math.max(parseFloat(c.borderTopWidth), parseFloat(c.borderLeftWidth));
            if (bw >= 2.5 && c.borderTopStyle !== 'none' && alpha(c.borderTopColor) > 0.3 && r.width < 140 && r.height < 70) flag('heavy', e, bw + ' px border on ' + Math.round(r.width) + 'x' + Math.round(r.height));
            // emoji glyphs.
            Array.prototype.forEach.call(e.childNodes, function (n) { if (n.nodeType === 3 && EMOJI.test(n.textContent)) flag('emoji', e, 'colour emoji "' + n.textContent.trim().slice(0, 12) + '"'); });
            // nested: a framed box inside a framed box (controls excluded).
            if (!e.matches(CTL + ', label') && r.width > 60 && r.height > 24 && framed(e)) {
                for (var p = e.parentElement, d = 0; p && d < 4 && !p.matches('.sidebar-section, .section-body, body'); p = p.parentElement, d++) {
                    if (!p.matches(CTL + ', label') && framed(p)) { flag('nested', e, 'framed inside ' + lab(p).slice(0, 20)); break; }
                }
            }
        });
        return out;
    };
})();
