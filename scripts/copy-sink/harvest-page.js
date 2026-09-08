// ═══════════════════════════════════════════════════════════════════
// scripts/copy-sink/harvest-page.js — evaluated INSIDE the running app by
// copy-sink.js harvest. Walks the DOM for every copy-bearing attribute,
// pops each effect card, reads the recipe registry, and returns one item
// per string with the context the sink needs to show the string next to
// the labeled control it belongs to:
//   { text, attr, el: {tag, type, id, cls, options}, label, control,
//     scope, path, order }
// Pure read (plus a transient focus/blur on the effect thumbnails). Must
// stay an expression: the last value is the result.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    var items = [];
    var order = 0;
    var txt = function (el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
    var labelText = function (lab) {
        if (!lab) return '';
        var c = lab.cloneNode(true);
        Array.prototype.forEach.call(c.querySelectorAll('.value-display, input, select, button'), function (x) { x.remove(); });
        return txt(c);
    };

    var SCOPES = [
        ['#photoWarn', 'Dialog › Photosensitivity warning'],
        ['.ui-fork-modal', 'Dialog › Interface fork'],
        ['.recipe-modal', 'Dialog › How do I…'],
        ['#hotkeyOverlay', 'Dialog › Hotkeys'],
        ['.app-confirm-modal', 'Dialog › Confirm'],
        ['#appCloseModal, .delete-modal', 'Dialog'],
        ['.brush-settings-panel', 'Popup › Brush settings'],
        ['.arm-colors-panel', 'Popup › Multi-brush arms'],
        ['.mixer-presets-panel', 'Popup › Presets'],
        ['.fx-tip', 'Effect card'],
        ['#mixer-strip', 'Top bar'],
        ['#sidebar-right, .sidebar-section', 'Sidebar'],
        ['#studioDrawer, .studio-drawer, .studio-tab-panel', 'Studio drawer'],
        ['#mask-editor, .mask-editor, #maskEditorModal', 'Mask editor'],
        ['#splash-screen', 'Splash'],
        ['#statsPanel, .stats-panel', 'Stats panel'],
        ['.quality-bar, #qualityBar, .underbar', 'Quality bar']
    ];
    function scopeOf(el) {
        var sec = el.closest && el.closest('.sidebar-section');
        if (sec) { var t = sec.querySelector('.section-title'); return 'Sidebar › ' + (txt(t) || 'section'); }
        var cell = el.closest && el.closest('[data-ui-key]');
        if (cell) return 'Top bar › ' + cell.getAttribute('data-ui-key');
        var tab = el.closest && el.closest('.studio-tab-panel');
        if (tab) return 'Studio drawer › ' + (tab.getAttribute('data-tab') || tab.id || '');
        for (var i = 0; i < SCOPES.length; i++) {
            try { if (el.closest && el.closest(SCOPES[i][0])) return SCOPES[i][1]; } catch (_) {}
        }
        var dlg = el.closest && el.closest('[role="dialog"]');
        if (dlg) {
            var lb = dlg.getAttribute('aria-labelledby');
            var h = lb ? document.getElementById(lb) : dlg.querySelector('h1,h2,h3');
            return 'Dialog › ' + (txt(h) || dlg.id || 'dialog');
        }
        var idp = el.closest && el.closest('[id]');
        return idp && idp !== el ? 'Other › #' + idp.id : 'Other';
    }
    function pathOf(el) {
        var parts = [];
        var cur = el;
        while (cur && cur !== document.body && parts.length < 4) {
            var s = cur.tagName.toLowerCase();
            if (cur.id) { parts.unshift(s + '#' + cur.id); break; }
            if (cur.classList && cur.classList.length) s += '.' + cur.classList[0];
            parts.unshift(s);
            cur = cur.parentElement;
        }
        return parts.join(' > ');
    }
    function controlOf(el) {
        var tag = el.tagName.toLowerCase();
        var type = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'input' && type === 'range') return 'slider';
        if (tag === 'input' && type === 'checkbox') return 'checkbox';
        if (tag === 'input' && type === 'radio') return 'radio';
        if (tag === 'input' && type === 'color') return 'color';
        if (tag === 'input' || tag === 'textarea') return 'text';
        if (tag === 'select') return 'select';
        if (tag === 'option') return 'option';
        if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
        if (tag === 'label') return 'label';
        if (tag === 'a') return 'link';
        if (tag === 'img' || el.getAttribute('role') === 'img') return 'image';
        if (/^h[1-6]$/.test(tag)) return 'heading';
        if (el.classList.contains('section-header')) return 'section header';
        return tag;
    }
    // The labeled control this string belongs to: the input for a label,
    // the label for an input, the button's own caption, the row's label.
    function labelFor(el) {
        var tag = el.tagName.toLowerCase();
        if (tag === 'label') return labelText(el);
        if (tag === 'option') return txt(el);
        if (el.id) { var lab = document.querySelector('label[for="' + el.id + '"]'); if (lab) return labelText(lab); }
        var inLab = el.closest && el.closest('label'); if (inLab) return labelText(inLab);
        if (tag === 'button' || tag === 'a') { var own = txt(el); if (own && own.length <= 48) return own; }
        var row = el.closest && el.closest('.control-group, .checkbox-group, .fx-row, .mixer-channel, .layer-item, .audio-mini-row, [data-ui-key]');
        if (row) {
            var l2 = row.querySelector('label, .channel-label, .mixer-label, .layer-name, .fx-label');
            var lt = labelText(l2); if (lt) return lt;
            if (row.getAttribute('data-ui-key')) return row.getAttribute('data-ui-key');
        }
        var al = el.getAttribute('aria-label'); if (al) return al;
        var own2 = txt(el); return own2.length <= 48 ? own2 : own2.slice(0, 45) + '…';
    }
    function elInfo(el) {
        var info = { tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', id: el.id || '', cls: el.classList && el.classList.length ? el.classList[0] : '' };
        if (info.tag === 'select') info.options = Array.prototype.slice.call(el.options, 0, 10).map(function (o) { return txt(o); });
        if (info.tag === 'input' && info.type === 'range') { info.min = el.min; info.max = el.max; info.value = el.value; }
        if (info.tag === 'input' && info.type === 'checkbox') info.checked = !!el.checked;
        if (info.tag === 'button') info.caption = txt(el).slice(0, 40);
        return info;
    }
    function push(el, attr, text, extra) {
        if (!text || !/[A-Za-z]/.test(text)) return;
        var it = { text: text, attr: attr, el: elInfo(el), label: labelFor(el), control: controlOf(el), scope: scopeOf(el), path: pathOf(el), order: order++ };
        if (extra) for (var k in extra) it[k] = extra[k];
        items.push(it);
    }

    // 1. attributes on every element (hidden ones included)
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.closest('.copy-sink')) continue;
        var t = el.getAttribute('title'); if (t) push(el, 'title', t);
        var p = el.getAttribute('placeholder'); if (p) push(el, 'placeholder', p);
        var a = el.getAttribute('aria-label'); if (a && a.length > 3) push(el, 'aria-label', a);
        var dt = el.getAttribute('data-tip'); if (dt) push(el, 'data-tip', dt);
    }
    // 2. hint-like text nodes
    var hints = document.querySelectorAll('[class*="hint"], [class*="help"], [class*="note"], [class*="desc"], [class*="caption"], [class*="empty"], [id*="Hint"], [id*="hint"], .pw-card p, .pw-card span > span, #hotkeyOverlay li, .ui-fork-card-desc, .recipe-pill-line');
    for (var h = 0; h < hints.length; h++) {
        var hel = hints[h];
        if (hel.children.length > 2 && !/^(p|li|span)$/i.test(hel.tagName)) continue;
        var ht = txt(hel);
        if (ht && ht.split(' ').length >= 3 && ht.length < 600) push(hel, 'text', ht);
    }
    // 3. effect cards: pop each one via its thumbnail's focus handler
    var rows = document.querySelectorAll('.fx-row');
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r]; var thumb = row.querySelector('.fx-thumb'); if (!thumb) continue;
        try { thumb.dispatchEvent(new Event('focus')); } catch (_) {}
        var card = document.querySelector('.fx-tip');
        if (card) {
            var key = row.getAttribute('data-fx');
            var lab = row.querySelector('label');
            var ct = txt(card.querySelector('.fx-tip-title')), cx = txt(card.querySelector('.fx-tip-text'));
            var base = { scope: 'Sidebar › Effects', label: labelText(lab) || key, control: 'effect card', fx: key };
            if (ct) push(row, 'fx-title', ct, base);
            if (cx) push(row, 'fx-text', cx, base);
        }
        try { thumb.dispatchEvent(new Event('blur')); } catch (_) {}
    }
    // 4. recipes registry
    var R = window.Recipes && (window.Recipes.RECIPES || window.Recipes.registry);
    if (R && R.length) {
        var host = document.getElementById('recipeHelpBtn') || document.body;
        for (var q = 0; q < R.length; q++) {
            var rc = R[q];
            var base2 = { scope: 'Dialog › How do I…', label: rc.title || rc.id, control: 'recipe', recipe: rc.id };
            if (rc.title) push(host, 'recipe-title', rc.title, base2);
            if (rc.answer) push(host, 'recipe-answer', rc.answer, base2);
            if (rc.note) push(host, 'recipe-note', rc.note, base2);
            if (rc.demo && rc.demo.label) push(host, 'recipe-demo', rc.demo.label, base2);
        }
    }
    return items;
})();
