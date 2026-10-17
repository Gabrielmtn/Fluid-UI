// ===================================================================
// js/73-theme-brush-screens.js - Walnut & Copper brush screens: the Multi-brush tile screen and the Brush
// drawer stamp screen, built beside the existing controls (which stay the
// source of truth and keep every id, class and handler).
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
//
// Study (design/study-lite.html): Multi-brush markup 741-757, CSS 267-316,
// refreshTiles / syncEditor / bindRadio 1885-1923, stamps 2092-2157.
//
// Multi-Brush drawer
//   A VFD screen of one tile per arm, four to a row (the arm count decides
//   how many: js/20 builds a row only for arms inside the count, so arms
//   beyond it have no controls to edit and get no tile). Each tile shows the
//   arm's tip as phosphor in the arm's colour, its number and its colour
//   source letter (M main, C custom, R random, P palette). The tiles pick
//   which arm's row is shown below as the editor; the other rows are hidden
//   by a theme class. That pick is local view state: not synced, not saved.
//   The editor IS the arm's own row (js/20 rebuildRows), restyled: "Brush N"
//   and the colour lamp (its colour well), the mode radios as one joined
//   strip, the tip as a scrolling screen of stamps, Pressure as a checkbox
//   pane. The tip screen picks through the arm's own tip menu (js/20
//   openArmTipMenu), so its handler stays the only writer; the tip square
//   that opens that menu sits on the screen's head line as its caption.
//
// Brush drawer
//   The custom shape tiles (js/20 renderShapeTiles) sit on a phosphor screen,
//   seven to a row: each tile's stamp is its own image used as a CSS mask, the
//   chosen one lit with copper corner brackets. Their keyboard stays as it is
//   (each tile a Tab stop, Enter / Space picks).
//
// Everything is read from the DOM the app already writes (aria-checked,
// aria-label, the tip square's icon, the colour well's value) when it
// changes: a MutationObserver per screen plus the colour well's input event.
// Nothing runs per frame here; js/71 eases the lit states (ThemeMotion.pane).
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;

    var MODE_LETTER = { main: 'M', fixed: 'C', random: 'R', step: 'P' };
    // js/20 BRUSH_TIPS, in order: the glyph its tip square shows and the name
    // its tip menu gives each built-in tip.
    var TIP_GLYPHS = ['◌', '⬤', '■', '▬', '◯'];
    var TIP_NAMES = ['Soft', 'Blob', 'Chisel', 'Streak', 'Ring'];
    // The screen's own phosphor (study .st i #7ff5d9): a colour not known yet.
    var PHOSPHOR = '127 245 217';

    function TM() { return window.ThemeMotion || null; }
    function checkedOf(el) { return el.getAttribute('aria-checked') === 'true'; }
    // A screen cell is a cathode pane: lit while checked, struck and faded on
    // the study's timing by js/71.
    function pane(el, isOn) {
        var T = TM();
        if (T) T.pane(el, isOn || checkedOf, { transient: false });
    }
    function rgbOf(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
        return m ? parseInt(m[1], 16) + ' ' + parseInt(m[2], 16) + ' ' + parseInt(m[3], 16) : null;
    }
    function setVar(el, name, v) {
        var k = '_wcb' + name;
        if (el[k] === v) return;
        el[k] = v;
        el.style.setProperty(name, v);
    }
    function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
    function setAttr(el, a, v) { if (el.getAttribute(a) !== v) el.setAttribute(a, v); }
    function shapes() {
        var BS = window.BrushShapes;
        try { return (BS && BS.list()) || []; } catch (_) { return []; }
    }
    function urlMask(dataURL) { return 'url("' + dataURL + '")'; }
    function tipMask(t) { return 'var(--wcb-tip-' + Math.max(0, Math.min(4, t | 0)) + ')'; }

    // ── Multi-Brush ────────────────────────────────────────────────────
    var MB = { panel: null, rows: null, scr: null, tiles: null, mini: null, grid: null, sel: 0, mo: null, sig: '', choices: [] };

    function armRows() {
        return MB.rows ? [].filter.call(MB.rows.children, function (r) { return r.classList.contains('arm-row'); }) : [];
    }

    // What the row shows, read from the controls js/20 paints (paintRow).
    function rowInfo(row) {
        var modeBtn = row.querySelector('.arm-mode-btn[aria-checked="true"]');
        var picker = row.querySelector('input.arm-picker');
        var push = row.querySelector('.arm-push-btn');
        var tipBtn = row.querySelector('.arm-tip-btn');
        var icon = tipBtn && tipBtn.querySelector('.arm-tip-icon');
        // The well is dimmed while the colour is not known (a Random arm
        // before its first roll): the screen shows its own phosphor then.
        var known = picker && picker.style.opacity !== '0.35';
        var label = (tipBtn && tipBtn.getAttribute('aria-label')) || '';
        var mask = tipMask(0);
        if (icon) {
            var bg = icon.style.backgroundImage;
            if (bg && bg !== 'none') mask = bg;
            else {
                var g = TIP_GLYPHS.indexOf((icon.textContent || '').trim());
                mask = tipMask(g < 0 ? 0 : g);
            }
        }
        var mode = modeBtn ? modeBtn.getAttribute('data-mode') : '';
        return {
            mode: mode,
            letter: MODE_LETTER[mode] || '',
            modeText: modeBtn ? modeBtn.textContent.trim() : '',
            rgb: (known && picker && rgbOf(picker.value)) || PHOSPHOR,
            push: !!(push && checkedOf(push)),
            mask: mask,
            tipName: label.replace(/^.*?\btip:\s*/, '')
        };
    }

    function makeTile(i) {
        var t = document.createElement('div');
        t.className = 'wcb-st wcb-tile';
        t.setAttribute('role', 'radio');
        t.setAttribute('aria-checked', 'false');
        t.tabIndex = -1;
        t.innerHTML = '<span class="wcb-n" aria-hidden="true">' + (i + 1) + '</span><span class="wcb-l" aria-hidden="true"></span><i aria-hidden="true"></i>';
        pane(t);
        return t;
    }

    // Once per row js/20 builds: the head line for the tip screen (the
    // row's own tip square moves onto it as the caption), and the Pressure
    // pane's indicator. Nothing the row's handlers hold is replaced.
    function dressRow(row, i) {
        if (row._wcb) return row._wcb;
        var mid = row.querySelector('.arm-row-mid');
        var push = row.querySelector('.arm-push-btn');
        var tipBtn = row.querySelector('.arm-tip-btn');
        var d = { head: null, cap: null };
        if (mid && push && tipBtn) {
            var head = document.createElement('div');
            head.className = 'wcb-head';
            var lbl = document.createElement('span');
            lbl.className = 'wcb-lbl';
            lbl.textContent = 'Tip';
            head.appendChild(lbl);
            head.appendChild(tipBtn);
            var cap = document.createElement('span');
            cap.className = 'wcb-cap';
            cap.setAttribute('aria-hidden', 'true');
            tipBtn.appendChild(cap);
            mid.insertBefore(head, push);
            d.head = head; d.cap = cap;
        }
        if (push && !push.querySelector('.wcb-ind')) {
            var ind = document.createElement('i');
            ind.className = 'wcb-ind';
            ind.setAttribute('aria-hidden', 'true');
            push.insertBefore(ind, push.firstChild);
        }
        row._wcb = d;
        return d;
    }

    // The tip choices, in the order js/20's tip menu lists them: the brush's
    // own tip, the five built-ins, then the shape library.
    function brushLook() {
        var BS = window.BrushShapes, id = null;
        try { id = BS && BS.activeId(); } catch (_) {}
        if (id) {
            var lst = shapes();
            for (var i = 0; i < lst.length; i++) if (lst[i].id === id) return { key: 's:' + id + ':' + lst[i].dataURL.length, mask: urlMask(lst[i].dataURL) };
        }
        var t = (window.config && window.config.BRUSH_TIP) | 0;
        return { key: 't:' + t, mask: tipMask(t) };
    }
    function choiceList() {
        var b = brushLook(), lst = shapes();
        var out = [{ v: null, name: 'Same as the brush', mask: b.mask, same: true }];
        for (var t = 0; t < 5; t++) out.push({ v: t, name: TIP_NAMES[t], mask: tipMask(t) });
        lst.forEach(function (s) { out.push({ v: s.id, name: s.name || 'Shape', mask: urlMask(s.dataURL) }); });
        var sig = b.key + '|' + lst.map(function (s) { return s.id + ':' + (s.name || '') + ':' + s.dataURL.length; }).join(',');
        return { list: out, sig: sig };
    }
    function armTip(i) {
        var cfg = (window.multiArmColors || [])[i];
        var v = cfg ? cfg.tip : null;
        if (typeof window.sanitizeArmTip === 'function') v = window.sanitizeArmTip(v);
        return (v === undefined) ? null : v;
    }

    function buildMini(choices) {
        var g = MB.grid;
        g.textContent = '';
        choices.forEach(function (c, k) {
            var b = document.createElement('div');
            b.className = 'wcb-st wcb-ms' + (c.same ? ' wcb-same' : '');
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', 'false');
            b.setAttribute('aria-label', c.name);
            b.tabIndex = -1;
            b._wcbK = k;
            b.innerHTML = '<i aria-hidden="true"></i>' + (c.same ? '<span class="wcb-b" aria-hidden="true">brush</span>' : '');
            b.style.setProperty('--m', c.mask);
            pane(b);
            g.appendChild(b);
        });
    }

    function paintTile(t, i, info, on) {
        setVar(t, '--sc', info.rgb);
        setVar(t, '--m', info.mask);
        setText(t.querySelector('.wcb-l'), info.letter);
        setAttr(t, 'aria-label', 'Brush ' + (i + 1) + ': ' + (info.modeText ? info.modeText + ' color, ' : '') + 'tip ' + info.tipName + ', pressure ' + (info.push ? 'on' : 'off'));
        setAttr(t, 'aria-checked', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
    }

    function placeMini(row, i, info) {
        var d = row._wcb;
        if (!d || !d.head) return;
        if (MB.mini.previousSibling !== d.head) d.head.parentNode.insertBefore(MB.mini, d.head.nextSibling);
        setVar(MB.mini, '--sc', info.rgb);
        setAttr(MB.grid, 'aria-label', 'Brush ' + (i + 1) + ' tip');
        setText(d.cap, info.tipName);
        var tipBtn = d.head.querySelector('.arm-tip-btn');
        MB.mini.classList.toggle('wcb-inert', !!(tipBtn && tipBtn.style.opacity === '0.45'));
        var c = choiceList();
        if (c.sig !== MB.sig) { MB.sig = c.sig; MB.choices = c.list; buildMini(c.list); }
        var v = armTip(i), hit = -1;
        MB.choices.forEach(function (ch, k) { if (ch.v === v) hit = k; });
        var cells = MB.grid.children;
        for (var k = 0; k < cells.length; k++) {
            setAttr(cells[k], 'aria-checked', k === hit ? 'true' : 'false');
            // One Tab stop: the chosen stamp, or the first when none is (an
            // arm on a shape this machine doesn't have).
            cells[k].tabIndex = (k === hit || (hit < 0 && k === 0)) ? 0 : -1;
        }
        // Another arm in the editor: bring its stamp into view (study
        // syncEditor). One read, on the change only.
        if (MB.shown !== row) {
            MB.shown = row;
            var c = hit >= 0 ? cells[hit] : null;
            MB.grid.scrollTop = c ? Math.max(0, c.offsetTop - 6) : 0;
        }
    }

    function refresh() {
        if (!MB.rows) return;
        MB.mo.disconnect();
        try {
            var rows = armRows(), n = rows.length;
            MB.scr.hidden = !n;
            if (!n) return;
            if (MB.sel >= n) MB.sel = n - 1;
            var tiles = MB.tiles;
            while (tiles.children.length < n) tiles.appendChild(makeTile(tiles.children.length));
            while (tiles.children.length > n) tiles.removeChild(tiles.lastChild);
            var sel = null;
            rows.forEach(function (row, i) {
                var on = i === MB.sel;
                row.classList.toggle('wcb-arm-on', on);
                row.classList.toggle('wcb-arm-off', !on);
                dressRow(row, i);
                var info = rowInfo(row);
                var pk = row.querySelector('input.arm-picker');
                if (pk) setVar(pk, '--sc', info.rgb);
                paintTile(tiles.children[i], i, info, on);
                if (on) sel = info;
            });
            placeMini(rows[MB.sel], MB.sel, sel);
        } finally {
            observe();
        }
    }
    function observe() {
        MB.mo.observe(MB.rows, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'aria-label', 'class', 'style'] });
    }
    // Only what js/20 paints: the tip screen is ours, and js/71 writes --ci
    // into the style of every pane while it eases (the colour well's style
    // carries its "not known yet" dimming, so that one counts).
    function relevant(r) {
        var t = r.target;
        if (t.nodeType !== 1) return true;
        if (MB.mini.contains(t)) return false;
        if (r.type === 'attributes' && r.attributeName === 'style') return t.classList.contains('arm-picker');
        return true;
    }

    function select(i, focus) {
        var rows = armRows();
        if (i < 0 || i >= rows.length) return;
        var moved = i !== MB.sel;
        MB.sel = i;
        refresh();
        if (focus) MB.tiles.children[i].focus();
        // A pick spins the drawer's rosette, as the study's setLocal does.
        if (moved && TM()) TM().kick(MB.tiles);
    }

    // The tip menu js/20 opens on the arm's square (openArmTipMenu) is the
    // only writer of an arm's tip: open it on that arm and press the entry.
    function openMenu(tipBtn) {
        function cur() { var ms = document.querySelectorAll('body > .arm-tip-menu'); return ms[ms.length - 1] || null; }
        var m = cur();
        if (!(m && m.__anchor === tipBtn)) { tipBtn.click(); m = cur(); }
        return (m && m.__anchor === tipBtn) ? m : null;
    }
    function pickTip(k) {
        var row = armRows()[MB.sel], ch = MB.choices[k];
        if (!row || !ch) return;
        if (ch.v === armTip(MB.sel)) return;
        var tipBtn = row.querySelector('.arm-tip-btn');
        var m = tipBtn && openMenu(tipBtn);
        if (!m) return;
        var target = null;
        if (ch.v === null) target = m.querySelector('.arm-tip-same');
        else if (typeof ch.v === 'number') target = m.querySelectorAll('.arm-tip-grid .arm-tip-opt')[ch.v] || null;
        else {
            var ids = shapes().map(function (s) { return s.id; });
            target = m.querySelectorAll('.arm-tip-shapes .brush-shape-btn')[ids.indexOf(ch.v)] || null;
        }
        if (target) target.click();
        else tipBtn.click();          // not listed after all: a second press closes it
        if (TM()) TM().kick(MB.grid);
    }

    function cellIndex(t) { return t && t._wcbK !== undefined ? t._wcbK : -1; }

    function bindTiles() {
        MB.tiles.addEventListener('click', function (e) {
            var t = e.target.closest('.wcb-tile');
            if (t) select([].indexOf.call(MB.tiles.children, t), true);
        });
        // The study's radio group (bindRadio): arrows step and wrap, the
        // selection follows. Space and Enter pick the focused tile.
        MB.tiles.addEventListener('keydown', function (e) {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            var items = [].slice.call(MB.tiles.children);
            var i = items.indexOf(document.activeElement);
            if (i < 0) return;
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(i, true); return; }
            var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            select((i + d + items.length) % items.length, true);
        });
    }

    function bindMini() {
        var g = MB.grid;
        function pickAt(k, focus) {
            var had = g.contains(document.activeElement) || focus;
            pickTip(k);
            var c = g.children[k];
            if (had && c) c.focus({ preventScroll: false });
        }
        g.addEventListener('click', function (e) {
            var c = e.target.closest('.wcb-ms');
            if (c) pickAt(cellIndex(c), true);
        });
        // Six to a row; arrows move through it as a grid (study bindRadio
        // with data-cols), clamped at the ends, the pick following.
        g.addEventListener('keydown', function (e) {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            var k = cellIndex(document.activeElement);
            if (k < 0 || !g.contains(document.activeElement)) return;
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pickAt(k, true); return; }
            var d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[e.key];
            if (!d) return;
            e.preventDefault();
            pickAt(Math.max(0, Math.min(g.children.length - 1, k + d)), true);
        });
    }

    function setupMulti() {
        var panel = document.querySelector('#sidebar-left .arm-colors-panel.arm-colors-rows');
        var rows = panel && panel.querySelector(':scope > .arm-colors-rows');
        if (!rows) return false;
        MB.panel = panel; MB.rows = rows;
        panel.classList.add('wcb-mb');

        var scr = document.createElement('div');
        scr.className = 'wcb-scr wcb-tscr';
        scr.hidden = true;
        var tiles = document.createElement('div');
        tiles.className = 'wcb-tiles';
        tiles.setAttribute('role', 'radiogroup');
        tiles.setAttribute('aria-label', 'Brush to edit');
        scr.appendChild(tiles);
        panel.insertBefore(scr, rows);
        MB.scr = scr; MB.tiles = tiles;

        var mini = document.createElement('div');
        mini.className = 'wcb-scr wcb-mini';
        var grid = document.createElement('div');
        grid.className = 'wcb-mstamps';
        grid.setAttribute('role', 'radiogroup');
        mini.appendChild(grid);
        MB.mini = mini; MB.grid = grid;

        bindTiles();
        bindMini();
        // The colour well's own input (js/64 picker, a drag) repaints no row
        // when the arm is already Custom: follow it here.
        panel.addEventListener('input', function (e) {
            if (e.target && e.target.classList && e.target.classList.contains('arm-picker')) refresh();
        });
        MB.mo = new MutationObserver(function (list) {
            for (var i = 0; i < list.length; i++) if (relevant(list[i])) { refresh(); return; }
        });
        refresh();
        return true;
    }

    // ── Brush drawer: the shape tiles on a phosphor screen ─────────────
    var BR = { row: null, cap: null, mo: null, act: undefined };

    function paintShapes() {
        var BS = window.BrushShapes, act = null;
        try { act = BS ? BS.activeId() : null; } catch (_) {}
        var changed = act !== BR.act;
        BR.act = act;
        var name = '';
        shapes().forEach(function (s) { if (s.id === act) name = s.name || ''; });
        var btns = BR.row.querySelectorAll('.brush-shape-btn');
        for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            // Its own image, as the phosphor's mask (the inline background
            // js/20 pins stays where it is; the screen just doesn't paint it).
            var bg = b.style.backgroundImage;
            if (bg) setVar(b, '--m', bg);
            var on = b.classList.contains('active');
            if (!b._wcbPane) {
                b._wcbPane = true;
                // A tile js/20 just rebuilt lights at once, unless it is the
                // newly chosen one: that one strikes like a cathode.
                b._wcbLit = !(on && changed);
                pane(b, function (x) { return x._wcbLit && x.classList.contains('active'); });
                if (!b._wcbLit) { b._wcbLit = true; if (TM()) TM().sync(b); }
            }
            // The tile toggles its shape on and off, and says so.
            setAttr(b, 'aria-pressed', on ? 'true' : 'false');
        }
        setText(BR.cap, name);
    }

    function setupBrush() {
        var area = document.querySelector('#sidebar-left .brush-shapes-area');
        var row = area && area.querySelector(':scope > .brush-shapes-row');
        var actions = area && area.querySelector(':scope > .brush-shapes-actions');
        if (!row || !actions) return false;
        var scr = document.createElement('div');
        scr.className = 'wcb-scr wcb-sscr';
        area.insertBefore(scr, row);
        scr.appendChild(row);
        var cap = document.createElement('span');
        cap.className = 'wcb-cap wcb-scap';
        cap.setAttribute('aria-hidden', 'true');
        actions.insertBefore(cap, actions.firstChild);
        BR.row = row; BR.cap = cap;
        // What is chosen at boot shows lit, without a strike.
        try { BR.act = window.BrushShapes ? window.BrushShapes.activeId() : null; } catch (_) { BR.act = null; }
        BR.mo = new MutationObserver(paintShapes);
        BR.mo.observe(row, { childList: true });
        paintShapes();
        return true;
    }

    var tries = 0, haveMulti = false, haveBrush = false;
    (function attach() {
        if (!haveMulti) haveMulti = setupMulti();
        if (!haveBrush) haveBrush = setupBrush();
        if ((!haveMulti || !haveBrush) && tries++ < 120) setTimeout(attach, 250);
    })();
})();
