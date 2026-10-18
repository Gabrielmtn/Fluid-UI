// ===================================================================
// js/73-theme-brush-screens.js - Walnut & Copper brush screens: the Multi-brush tile screen and the Brush
// drawer stamp screen, built beside the existing controls (which stay the
// source of truth and keep every id, class and handler).
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
//
// Study (design/study-lite.html): Multi-brush markup 741-757, CSS 267-316,
// refreshTiles / syncEditor / bindRadio 1885-1923, stamps 2092-2157.
// Gabriel's calls: prep/DECISIONS.md, "Multi-brush and brush stamps".
//
// Multi-Brush drawer
//   The count slider sits right above a VFD screen of eight tiles, four to a
//   row. A tile shows its arm's tip as phosphor in the arm's colour, its
//   number and its colour source letter (M main, C custom, R random,
//   P palette). Arms beyond the count are dimmed: js/20 builds no controls
//   for them, so their tiles show what the app holds for them (or the
//   default arm) and can't be picked. The tiles pick which arm's row is shown
//   below as the editor; the other rows are hidden by a theme class. That
//   pick is local view state: not synced, not saved.
//   The editor IS the arm's own row (js/20 rebuildRows), restyled: "Brush N"
//   and the colour lamp (its colour well), the mode radios as one joined
//   strip, "Custom brush" with the arm's tip square as its caption (it still
//   opens the tip menu), the custom brush as a scrolling screen of stamps,
//   Pressure as a checkbox pane. A stamp picks through the square's
//   __wcPickTip hook: the code path the tip menu's entries run.
//
// Brush drawer
//   The custom shape tiles (js/20 renderShapeTiles) sit on a phosphor screen,
//   seven to a row, as one radio group: one Tab stop, arrows move around the
//   grid and pick (a pick is the tile's own click). Each tile's stamp is its
//   own image used as a CSS mask, the chosen one lit with copper brackets.
//
// Keys: Space is Freeze unless a keyboard-reached control takes it (js/05n):
// a screen leaves Space alone when the pointer put focus there or the press
// would change nothing. A held arrow moves focus only; the pick lands once,
// on key-up, so passing shapes uploads no stamps (js/33 warm).
//
// Everything is read from the DOM the app already writes (aria-checked,
// aria-label, the tip square's icon, the colour well's value) when it
// changes, with a write only where something moved: a MutationObserver per
// screen plus the colour well's input event. Nothing runs per frame here;
// js/71 eases the lit states (ThemeMotion.pane) and the tiles' power.
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
    // The custom brush screen: six to a row on a 36 px row + 3 px gap pitch
    // (css/38 .wcb-mstamps grid-auto-rows / gap), so a row is found by its
    // index, never measured.
    var MS_COLS = 6, MS_PITCH = 39;
    // The Brush drawer's screen: seven to a row (css/38).
    var ST_COLS = 7;
    var ARROWS = { ArrowRight: 1, ArrowLeft: 1, ArrowDown: 1, ArrowUp: 1, Home: 1, End: 1 };

    function TM() { return window.ThemeMotion || null; }
    function checkedOf(el) { return el.getAttribute('aria-checked') === 'true'; }
    // A screen cell is a cathode pane: lit while checked, struck and faded on
    // the study's timing by js/71.
    function pane(el, isOn) {
        var T = TM();
        if (T) T.pane(el, isOn || checkedOf, { transient: false });
    }
    function byPointer(el) { return typeof window.__pointerFocused === 'function' && window.__pointerFocused(el); }
    function rgbOf(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
        return m ? parseInt(m[1], 16) + ' ' + parseInt(m[2], 16) + ' ' + parseInt(m[3], 16) : null;
    }
    // Writes only where the value moved: an animated main colour repaints
    // js/20's rows every frame, and must cost nothing more here than the
    // colour itself.
    function setVar(el, name, v) {
        var k = '_wcb' + name;
        if (el[k] === v) return;
        el[k] = v;
        el.style.setProperty(name, v);
    }
    function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
    function setAttr(el, a, v) { if (el.getAttribute(a) !== v) el.setAttribute(a, v); }
    function dropAttr(el, a) { if (el.hasAttribute(a)) el.removeAttribute(a); }
    function setTab(el, v) { if (el.tabIndex !== v || !el.hasAttribute('tabindex')) el.tabIndex = v; }
    function setHidden(el, h) { if (el.hidden !== h) el.hidden = h; }
    function shapes() {
        var BS = window.BrushShapes;
        try { return (BS && BS.list()) || []; } catch (_) { return []; }
    }
    function shapeById(id) {
        var l = shapes();
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
    }
    function urlMask(dataURL) { return 'url("' + dataURL + '")'; }
    function tipMask(t) { return 'var(--wcb-tip-' + Math.max(0, Math.min(4, t | 0)) + ')'; }
    function tipVal(v) {
        if (typeof window.sanitizeArmTip === 'function') v = window.sanitizeArmTip(v);
        return (v === undefined) ? null : v;
    }
    // The grid step an arrow key makes (Home / End: to the ends).
    function step(key, k, n, cols) {
        var d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
        if (key === 'Home') return 0;
        if (key === 'End') return n - 1;
        return Math.max(0, Math.min(n - 1, k + d));
    }

    // The brush's own tip: its shape if one is picked, else its built-in tip.
    function brushKey() {
        var BS = window.BrushShapes, id = null;
        try { id = BS && BS.activeId(); } catch (_) {}
        var s = id ? shapeById(id) : null;
        return s ? 's:' + s.id + ':' + s.dataURL.length : 't:' + ((window.config && window.config.BRUSH_TIP) | 0);
    }
    function brushMask() {
        var BS = window.BrushShapes, id = null;
        try { id = BS && BS.activeId(); } catch (_) {}
        var s = id ? shapeById(id) : null;
        return s ? urlMask(s.dataURL) : tipMask((window.config && window.config.BRUSH_TIP) | 0);
    }
    function brushName() {
        var BS = window.BrushShapes, id = null;
        try { id = BS && BS.activeId(); } catch (_) {}
        var s = id ? shapeById(id) : null;
        return s ? (s.name || 'Shape') : TIP_NAMES[Math.max(0, Math.min(4, (window.config && window.config.BRUSH_TIP) | 0))];
    }
    // The stamp a tip value prints (js/20 tipLook: a missing shape prints Soft).
    function lookOf(t) {
        if (t === null) return brushMask();
        if (typeof t === 'number') return tipMask(t);
        var s = shapeById(t);
        return s ? urlMask(s.dataURL) : tipMask(0);
    }

    // ── Multi-Brush ────────────────────────────────────────────────────
    var MB = { panel: null, rows: null, chan: null, scr: null, tiles: null, mini: null, grid: null,
        sel: 0, mo: null, sig: null, choices: [], shownIdx: -1, scrollT: 0, pend: -1 };

    function armRows() {
        return MB.rows ? [].filter.call(MB.rows.children, function (r) { return r.classList.contains('arm-row'); }) : [];
    }

    // What an arm's row shows, read from the controls js/20 paints (paintRow).
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
            letter: MODE_LETTER[mode] || '',
            modeText: modeBtn ? modeBtn.textContent.trim() : '',
            rgb: (known && picker && rgbOf(picker.value)) || PHOSPHOR,
            push: !!(push && checkedOf(push)),
            mask: mask,
            tipName: label.replace(/^.*?\btip:\s*/, '')
        };
    }
    // An arm beyond the count: what the app holds for it (js/20 keeps every
    // arm config it has made), else the default arm (main colour, the
    // brush's tip). Shown as paintRow would show it, display only.
    function ghostInfo(i) {
        var cfg = (window.multiArmColors || [])[i] || null;
        var mode = (cfg && MODE_LETTER[cfg.mode]) ? cfg.mode : 'main';
        var rgb = null;
        if (mode === 'fixed') rgb = rgbOf(cfg.color);
        else if (mode === 'step') rgb = rgbOf(typeof window.nextStepHex === 'function' ? window.nextStepHex(i) : null);
        else if (mode === 'random') {
            var c = cfg && cfg.cachedColor;
            if (c && c.length >= 3) rgb = [0, 1, 2].map(function (k) { return Math.round(Math.max(0, Math.min(1, c[k])) * 255); }).join(' ');
        } else {
            var pk = document.getElementById('colorPicker');
            rgb = rgbOf(pk && pk.value);
        }
        return { letter: MODE_LETTER[mode], rgb: rgb || PHOSPHOR, mask: lookOf(cfg ? tipVal(cfg.tip) : null) };
    }

    function makeTile(i) {
        var t = document.createElement('div');
        t.className = 'wcb-st wcb-tile';
        t.setAttribute('role', 'radio');
        t.setAttribute('aria-checked', 'false');
        t.innerHTML = '<span class="wcb-n" aria-hidden="true">' + (i + 1) + '</span><span class="wcb-l" aria-hidden="true"></span><i aria-hidden="true"></i>';
        pane(t);
        return t;
    }

    // A tile's power (the study's --pw): on inside the count, dimmed beyond
    // it. The class holds the rest state; a change eases on the drawer
    // spring, stepped on js/71's frame, the inline value dropped once
    // settled. Reduced motion: it switches.
    var powering = [];
    function power(t, live) {
        if (t._wcbLive === live) return;
        var first = t._wcbLive === undefined;
        t._wcbLive = live;
        t.classList.toggle('wcb-off', !live);
        var T = TM();
        if (first || !T || T.reduced()) return;
        if (!t._wcbPw) t._wcbPw = new T.Spring(live ? 0 : 1, T.PROF.drawer);
        t._wcbPw.to(live ? 1 : 0, T.PROF.drawer);
        if (powering.indexOf(t) < 0) powering.push(t);
        T.run(stepPower);
    }
    function stepPower(dt) {
        for (var i = powering.length - 1; i >= 0; i--) {
            var t = powering[i], s = t._wcbPw;
            s.step(dt);
            if (!t.isConnected || s.settled()) { t._wcbPw = null; t.style.removeProperty('--pw'); powering.splice(i, 1); }
            else t.style.setProperty('--pw', Math.max(0, Math.min(1, s.x)).toFixed(3));
        }
        return !powering.length;
    }

    function paintTile(t, i, info, on, live) {
        setVar(t, '--sc', info.rgb);
        setVar(t, '--m', info.mask);
        setText(t.querySelector('.wcb-l'), info.letter);
        if (live) {
            setAttr(t, 'aria-label', 'Brush ' + (i + 1) + ': ' + (info.modeText ? info.modeText + ' color, ' : '') +
                info.tipName + ', pressure ' + (info.push ? 'on' : 'off'));
            setAttr(t, 'aria-checked', on ? 'true' : 'false');
            dropAttr(t, 'aria-disabled');
            setTab(t, on ? 0 : -1);
        } else {
            // Beyond the count: shown, not pickable, out of the Tab order.
            setAttr(t, 'aria-label', 'Brush ' + (i + 1) + ', off');
            setAttr(t, 'aria-checked', 'false');
            setAttr(t, 'aria-disabled', 'true');
            dropAttr(t, 'tabindex');
        }
        power(t, live);
    }

    var uid = 0;
    // Once per row js/20 builds: the head line for the custom brush screen
    // (the row's own tip square moves onto it as the caption), and the
    // Pressure pane's indicator. Nothing the row's handlers hold is replaced.
    function dressRow(row) {
        if (row._wcb) return row._wcb;
        var mid = row.querySelector('.arm-row-mid');
        var push = row.querySelector('.arm-push-btn');
        var tipBtn = row.querySelector('.arm-tip-btn');
        var d = { head: null, cap: null, tipBtn: tipBtn };
        if (mid && push && tipBtn) {
            var head = document.createElement('div');
            head.className = 'wcb-head';
            var lbl = document.createElement('span');
            lbl.className = 'wcb-lbl';
            lbl.textContent = 'Custom brush';
            head.appendChild(lbl);
            head.appendChild(tipBtn);
            var cap = document.createElement('span');
            cap.className = 'wcb-cap';
            cap.setAttribute('aria-hidden', 'true');
            tipBtn.appendChild(cap);
            // The square's name: js/20's own label, plus the brush's tip when
            // the arm follows it, since the caption shows that tip's name
            // (a visible label must be part of the name).
            var nm = document.createElement('span');
            nm.hidden = true;
            nm.id = 'wcb-tipname-' + (++uid);
            head.appendChild(nm);
            tipBtn.setAttribute('aria-labelledby', nm.id);
            mid.insertBefore(head, push);
            d.head = head; d.cap = cap; d.nm = nm;
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

    // The custom brush choices, in the order js/20's tip menu lists them: the
    // brush's own tip, the five built-ins, then the shape library.
    function choiceSig() {
        var s = brushKey(), l = shapes();
        for (var i = 0; i < l.length; i++) s += '|' + l[i].id + ':' + (l[i].name || '') + ':' + l[i].dataURL.length;
        return s;
    }
    function choiceList() {
        var out = [{ v: null, name: 'Same as the brush, ' + brushName(), mask: brushMask() }];
        for (var t = 0; t < 5; t++) out.push({ v: t, name: TIP_NAMES[t], mask: tipMask(t) });
        shapes().forEach(function (s) { out.push({ v: s.id, name: s.name || 'Shape', mask: urlMask(s.dataURL) }); });
        return out;
    }
    function armTip(i) {
        var cfg = (window.multiArmColors || [])[i];
        return tipVal(cfg ? cfg.tip : null);
    }

    function buildMini(choices) {
        var g = MB.grid;
        g.textContent = '';
        choices.forEach(function (c, k) {
            var b = document.createElement('div');
            b.className = 'wcb-st wcb-ms';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', 'false');
            b.setAttribute('aria-label', c.name);
            b.tabIndex = -1;
            b._wcbK = k;
            b.innerHTML = '<i aria-hidden="true"></i>';
            b.style.setProperty('--m', c.mask);
            pane(b);
            g.appendChild(b);
        });
    }

    function placeMini(row, i, info) {
        var d = row._wcb;
        if (!d || !d.head) return;
        // A row js/20 rebuilt takes the screen over (moving it drops its scroll).
        var moved = MB.mini.previousSibling !== d.head;
        if (moved) d.head.parentNode.insertBefore(MB.mini, d.head.nextSibling);
        setVar(MB.mini, '--sc', info.rgb);
        setAttr(MB.grid, 'aria-label', 'Brush ' + (i + 1) + ' custom brush');
        // The caption names the stamp the arm prints (study .scr-cap): for an
        // arm on the brush's tip, the brush's. The square's own name still
        // says "same as the brush".
        setText(d.cap, armTip(i) === null ? brushName() : info.tipName);
        var sig = choiceSig();
        if (sig !== MB.sig) { MB.sig = sig; MB.choices = choiceList(); buildMini(MB.choices); }
        var v = armTip(i), hit = -1;
        for (var k = 0; k < MB.choices.length; k++) if (MB.choices[k].v === v) { hit = k; break; }
        var cells = MB.grid.children;
        for (k = 0; k < cells.length; k++) {
            setAttr(cells[k], 'aria-checked', k === hit ? 'true' : 'false');
            // One Tab stop: the chosen stamp, or the first when none is (an
            // arm on a shape this machine doesn't have).
            setTab(cells[k], (k === hit || (hit < 0 && k === 0)) ? 0 : -1);
        }
        // Another arm in the editor: bring its stamp into view (study
        // syncEditor), its row found from its index; the scroll waits for
        // its own task, out of whatever frame this repaint rides.
        if (moved || MB.shownIdx !== i) {
            MB.shownIdx = i;
            var top = hit >= 0 ? Math.floor(hit / MS_COLS) * MS_PITCH : 0;
            clearTimeout(MB.scrollT);
            MB.scrollT = setTimeout(function () { MB.grid.scrollTop = top; }, 0);
        }
    }

    function refresh() {
        if (!MB.rows) return;
        MB.mo.disconnect();
        try { paintAll(); } finally { observe(); }
    }
    function paintAll() {
        var rows = armRows(), n = rows.length;
        setHidden(MB.scr, !n);
        if (!n) return;
        if (MB.sel >= n) MB.sel = n - 1;
        var tiles = MB.tiles.children, sel = null;
        for (var i = 0; i < Math.max(n, tiles.length); i++) {
            var row = rows[i];
            if (row) {
                var on = i === MB.sel;
                row.classList.toggle('wcb-arm-on', on);
                row.classList.toggle('wcb-arm-off', !on);
                var d = dressRow(row);
                if (d.nm) {
                    var lab = d.tipBtn.getAttribute('aria-label') || '';
                    // A comma, not brackets: label-in-name checks drop bracketed text.
                    setText(d.nm, armTip(i) === null ? lab + ', ' + brushName() : lab);
                }
                var info = rowInfo(row);
                var pk = row.querySelector('input.arm-picker');
                if (pk) setVar(pk, '--sc', info.rgb);
                if (tiles[i]) paintTile(tiles[i], i, info, on, true);
                if (on) sel = info;
            } else paintTile(tiles[i], i, ghostInfo(i), false, false);
        }
        placeMini(rows[MB.sel], MB.sel, sel);
    }
    function observe() {
        MB.mo.observe(MB.rows, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'aria-label', 'class', 'style'] });
    }
    // Only what js/20 paints: the custom brush screen is ours, and js/71
    // writes --ci into the style of every pane while it eases (the colour
    // well's style carries its "not known yet" dimming, so that one counts).
    function relevant(r) {
        var t = r.target;
        if (t.nodeType !== 1) return true;
        if (MB.mini.contains(t)) return false;
        if (r.type === 'attributes' && r.attributeName === 'style') return t.classList.contains('arm-picker');
        return true;
    }

    function liveCount() { return armRows().length; }
    function select(i, focus) {
        if (i < 0 || i >= liveCount()) return;
        var moved = i !== MB.sel;
        MB.sel = i;
        refresh();
        if (focus) MB.tiles.children[i].focus();
        // A pick spins the drawer's rosette, as the study's setLocal does.
        if (moved && TM()) TM().kick(MB.tiles);
    }

    // A custom brush pick: the arm's tip square's hook (js/20), the code path
    // its menu entries run. Returns whether anything changed.
    function pickCell(k) {
        var row = armRows()[MB.sel], ch = MB.choices[k];
        if (!row || !ch || ch.v === armTip(MB.sel)) return false;
        var tipBtn = row.querySelector('.arm-tip-btn');
        if (!tipBtn || typeof tipBtn.__wcPickTip !== 'function') return false;
        tipBtn.__wcPickTip(ch.v);
        if (TM()) TM().kick(MB.grid);
        return true;
    }
    function focusCell(k) {
        var cells = MB.grid.children;
        if (!cells[k]) return;
        for (var j = 0; j < cells.length; j++) setTab(cells[j], j === k ? 0 : -1);
        cells[k].focus();
    }
    function cellIndex(t) { return t && t._wcbK !== undefined ? t._wcbK : -1; }

    function bindTiles() {
        // The pointer: the press focused the tile already (Space stays Freeze).
        MB.tiles.addEventListener('click', function (e) {
            var t = e.target.closest('.wcb-tile');
            if (t && t.getAttribute('aria-disabled') !== 'true') select([].indexOf.call(MB.tiles.children, t), false);
        });
        // The study's radio group (bindRadio): arrows step and wrap through
        // the arms in the count, the selection follows.
        MB.tiles.addEventListener('keydown', function (e) {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            var a = document.activeElement, i = [].indexOf.call(MB.tiles.children, a), n = liveCount();
            if (i < 0 || i >= n) return;
            if (e.key === ' ' || e.key === 'Enter') {
                if (byPointer(a) || i === MB.sel) return;     // Freeze's, or nothing to press
                e.preventDefault();
                select(i, true);
                return;
            }
            var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            select((i + d + n) % n, true);
        });
    }

    function bindMini() {
        var g = MB.grid;
        g.addEventListener('click', function (e) {
            var c = e.target.closest('.wcb-ms');
            if (c) pickCell(cellIndex(c));
        });
        // Six to a row; arrows move through it as a grid (study bindRadio with
        // data-cols), clamped at the ends, the pick following. A held arrow
        // moves focus only and picks once, on key-up.
        g.addEventListener('keydown', function (e) {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            var a = document.activeElement, k = cellIndex(a);
            if (k < 0 || !g.contains(a)) return;
            if (e.key === ' ' || e.key === 'Enter') {
                if (byPointer(a) || MB.choices[k].v === armTip(MB.sel)) return;
                e.preventDefault();
                pickCell(k);
                return;
            }
            if (!ARROWS[e.key]) return;
            e.preventDefault();
            var j = step(e.key, k, g.children.length, MS_COLS);
            focusCell(j);
            if (e.repeat) { MB.pend = j; return; }
            MB.pend = -1;
            pickCell(j);
        });
        function settle() { if (MB.pend >= 0) { var j = MB.pend; MB.pend = -1; pickCell(j); } }
        g.addEventListener('keyup', function (e) { if (ARROWS[e.key]) settle(); });
        // Leaving the screen mid-hold lands the pick too (a move inside it
        // is a focusout as well, so only one that leaves counts).
        g.addEventListener('focusout', function (e) { if (!g.contains(e.relatedTarget)) settle(); });
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
        var mult = document.getElementById('multiplier');
        var max = Math.max(1, parseInt(mult && mult.max, 10) || 8);
        for (var i = 0; i < max; i++) tiles.appendChild(makeTile(i));
        scr.appendChild(tiles);
        panel.insertBefore(scr, rows);
        MB.scr = scr; MB.tiles = tiles;

        // The count slider moves to right above the screen it drives (study
        // 743-745). It is the same element: js/20 and the hotkeys find it by
        // id or closest('.mixer-channel'), never by where it sits.
        var chan = mult && mult.closest('.mixer-channel');
        if (chan && chan !== scr.previousElementSibling) {
            chan.classList.add('wcb-count');
            panel.insertBefore(chan, scr);
            MB.chan = chan;
        }

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

    // ── Brush drawer: the shape tiles as a phosphor radio grid ─────────
    var BR = { row: null, cap: null, mo: null, act: undefined, pend: -1, kIdx: -1, own: false };

    function shapeBtns() { return BR.row ? BR.row.querySelectorAll('.brush-shape-btn') : []; }
    function paintShapes() {
        var BS = window.BrushShapes, act = null;
        try { act = BS ? BS.activeId() : null; } catch (_) {}
        var changed = act !== BR.act;
        BR.act = act;
        var name = '';
        if (act) { var s = shapeById(act); if (s) name = s.name || ''; }
        var btns = shapeBtns(), hit = -1;
        for (var i = 0; i < btns.length; i++) if (btns[i].classList.contains('active')) hit = i;
        for (i = 0; i < btns.length; i++) {
            var b = btns[i];
            // Its own image, as the phosphor's mask (the inline background
            // js/20 pins stays where it is; the screen just doesn't paint it).
            var bg = b.style.backgroundImage;
            if (bg) setVar(b, '--m', bg);
            var on = i === hit;
            if (!b._wcbPane) {
                b._wcbPane = true;
                // A tile js/20 just rebuilt lights at once, unless it is the
                // newly chosen one: that one strikes like a cathode.
                b._wcbLit = !(on && changed);
                pane(b, function (x) { return x._wcbLit && x.classList.contains('active'); });
                if (!b._wcbLit) { b._wcbLit = true; if (TM()) TM().sync(b); }
            }
            setAttr(b, 'role', 'radio');
            setAttr(b, 'aria-checked', on ? 'true' : 'false');
            setTab(b, (on || (hit < 0 && i === 0)) ? 0 : -1);
        }
        setText(BR.cap, name);
    }
    function focusShape(j) {
        var btns = shapeBtns();
        if (!btns[j]) return;
        for (var i = 0; i < btns.length; i++) setTab(btns[i], i === j ? 0 : -1);
        btns[j].focus();
    }
    // A keyboard pick: the tile's own click (js/20 renderShapeTiles), which
    // rebuilds the row; focus goes on to the new tile in its place.
    function pickShape(j) {
        var b = shapeBtns()[j];
        if (!b) return;
        if (!b.classList.contains('active')) { BR.own = true; try { b.click(); } finally { BR.own = false; } }
        paintShapes();
        focusShape(j);
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
        row.setAttribute('role', 'radiogroup');
        row.setAttribute('aria-label', 'Custom brush');
        var cap = document.createElement('span');
        cap.className = 'wcb-cap wcb-scap';
        cap.setAttribute('aria-hidden', 'true');
        actions.insertBefore(cap, actions.firstChild);
        BR.row = row; BR.cap = cap;
        // What is chosen at boot shows lit, without a strike.
        try { BR.act = window.BrushShapes ? window.BrushShapes.activeId() : null; } catch (_) { BR.act = null; }
        BR.mo = new MutationObserver(paintShapes);
        BR.mo.observe(row, { childList: true });

        // Arrows: around the grid, seven to a row, the pick following; a held
        // arrow moves focus only and picks once, on key-up. Space and Enter
        // stay the tiles' own (a press toggles, as before); after a keyboard
        // press focus goes on to the rebuilt tile, after a pointer one it
        // stays where js/20 leaves it.
        row.addEventListener('keydown', function (e) {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            var btns = shapeBtns(), k = [].indexOf.call(btns, document.activeElement);
            if (k < 0) return;
            if (e.key === ' ' || e.key === 'Enter') { BR.kIdx = k; return; }
            if (!ARROWS[e.key]) return;
            e.preventDefault();
            var j = step(e.key, k, btns.length, ST_COLS);
            if (e.repeat) { focusShape(j); BR.pend = j; return; }
            BR.pend = -1;
            pickShape(j);
        });
        function settle() { if (BR.pend >= 0) { var j = BR.pend; BR.pend = -1; pickShape(j); } }
        row.addEventListener('keyup', function (e) { if (ARROWS[e.key]) settle(); });
        row.addEventListener('focusout', function (e) { if (!BR.own && !row.contains(e.relatedTarget)) settle(); });
        row.addEventListener('click', function (e) {
            if (BR.own || e.detail !== 0 || BR.kIdx < 0) { BR.kIdx = -1; return; }
            var k = BR.kIdx;
            BR.kIdx = -1;
            paintShapes();
            focusShape(Math.min(k, shapeBtns().length - 1));
        });
        paintShapes();
        return true;
    }

    // ── The arm tip menu (js/20 openArmTipMenu): its shapes as phosphor ─
    // The menu is built on open and body-mounted; its shape tiles carry
    // their image inline, which becomes their mask as on the screens.
    function dressMenu(m) {
        var b = m.querySelectorAll('.brush-shape-btn');
        for (var i = 0; i < b.length; i++) if (b[i].style.backgroundImage) b[i].style.setProperty('--m', b[i].style.backgroundImage);
    }
    new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
            var add = list[i].addedNodes;
            for (var j = 0; j < add.length; j++) if (add[j].nodeType === 1 && add[j].classList.contains('arm-tip-menu')) dressMenu(add[j]);
        }
    }).observe(document.body, { childList: true });

    var tries = 0, haveMulti = false, haveBrush = false;
    (function attach() {
        if (!haveMulti) haveMulti = setupMulti();
        if (!haveBrush) haveBrush = setupBrush();
        if ((!haveMulti || !haveBrush) && tries++ < 120) setTimeout(attach, 250);
    })();
})();
