// The final polish tour (dev only, injected by scripts/polish-tour.js; nothing
// here ships). Walks every surface of the UI one stop at a time: rings it,
// puts the app in the state that shows it, lists what to look at, and takes a
// verdict (Love it / Polish / Kill it) plus notes. Inside a stop, "Walk the
// rows" steps through every row of controls with its own quick verdict, and
// "Pin a note" files a note against any element you click.
//
// The stop list is built from the live DOM when the tour starts (sections by
// their title, bar cells by data-ui-key), so a refactor that adds, moves or
// renames a drawer shows up here without editing this file.
//
// Answers go to the tour server (prep/polish/answers.json + answers.md) on
// every change, with localStorage as the fallback while it is offline.
// Claude's replies (prep/polish/replies.json) show on their stop.
(function () {
    'use strict';
    var LS = 'polishTour.2026-10-17.v1';
    var Z = 2147483000;

    // ── small helpers ──
    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function h(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function shown(el) {
        if (!el || !el.getBoundingClientRect || !el.isConnected) return false;
        var r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        var cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
    }
    function inTour(el) { return !!(el && el.closest && el.closest('#pt-card, #pt-ring, #pt-row-ring, #pt-pin-ring, #pt-pill')); }
    function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function labelOf(el) {
        if (!el) return '(nothing)';
        var t = el.getAttribute && (el.getAttribute('aria-label') || el.dataset && (el.dataset.uiLabel || el.dataset.uiKey));
        if (t) return clean(t).slice(0, 60);
        if (el.id) {
            var lab = document.querySelector('label[for="' + el.id + '"]');
            if (lab && clean(lab.textContent)) return clean(lab.textContent).slice(0, 60);
        }
        var own = el.querySelector && el.querySelector(':scope > label, .section-title, .ch-label, .brush-section-label');
        if (own && clean(own.textContent)) return clean(own.textContent).slice(0, 60);
        var txt = clean(el.textContent);
        if (txt) return txt.slice(0, 60);
        if (el.getAttribute && el.getAttribute('title')) return clean(el.getAttribute('title')).slice(0, 60);
        return el.id ? '#' + el.id : el.tagName.toLowerCase();
    }
    // A selector Claude can paste into querySelector: an id where there is
    // one, otherwise the path down from the nearest ancestor with an id.
    function selOf(el) {
        if (!el || el === document.body) return 'body';
        if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + el.id;
        var parts = [];
        for (var n = el; n && n !== document.body; n = n.parentElement) {
            if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1) { parts.unshift('#' + n.id); break; }
            var part = n.tagName.toLowerCase();
            var cls = Array.prototype.filter.call(n.classList, function (c) { return !/^(pt-|on$|active$|open$|show$|collapsed$|hover)/.test(c); }).slice(0, 2);
            if (cls.length) part += '.' + cls.map(CSS.escape).join('.');
            var p = n.parentElement;
            if (p) {
                var same = Array.prototype.filter.call(p.children, function (c) { return c.tagName === n.tagName; });
                if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
            }
            parts.unshift(part);
        }
        return parts.join(' > ');
    }
    function sec(title) { return window.Sidebars && window.Sidebars.find ? window.Sidebars.find(title) : null; }
    function sideOf(el) {
        var S = window.Sidebars || {};
        if (S.left && S.left.el && S.left.el.contains(el)) return S.left;
        if (S.right && S.right.el && S.right.el.contains(el)) return S.right;
        return null;
    }
    function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
    function escKey(target) {
        (target || document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    }
    function canvasMid() {
        var c = $('#canvas-area') || document.body, r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // ── putting the app in a state, and taking it back out ──
    // Every prep pushes its own undo; leaving a stop runs them in reverse.
    var undo = [];
    function onLeave(fn) { undo.push(fn); }
    function leaveAll() { while (undo.length) { try { undo.pop()(); } catch (e) { console.warn('[tour] undo', e); } } }

    function openBarFor(el) {
        var bar = sideOf(el);
        if (bar && bar.isCollapsed && bar.isCollapsed()) {
            if (bar.expand) bar.expand(); else bar.fold(false);
            onLeave(function () { if (bar.restore) bar.restore(); else bar.fold(true); });
        }
    }
    function openDrawer(s) {
        if (!s) return;
        openBarFor(s);
        if (s.classList.contains('collapsed')) {
            window.openSidebarSection(s);
            onLeave(function () { if (!s.classList.contains('collapsed')) { var t = s.querySelector('.section-title'); if (t) t.click(); } });
        }
    }
    function toggleDrawer(s) { var t = s && s.querySelector('.section-title'); if (t) t.click(); }

    // State lab: every visible slider in the stop to one end and back, and a
    // disabled preview. Values go in through the slider's own input event, so
    // the app reacts exactly as to a drag; the way back does the same.
    var saved = null;
    function rangesIn(root) {
        return $$('input[type=range]', root).filter(function (r) {
            return shown(r) || (r.closest('.ch-fader, .control-group, .fader-stack') && shown(r.closest('.ch-fader, .control-group, .fader-stack')) && !r.closest('.ch-canonical'));
        });
    }
    function slidersTo(root, where) {
        var list = rangesIn(root);
        if (!saved) {
            saved = list.map(function (r) { return [r, r.value]; });
            onLeave(slidersBack);
        }
        list.forEach(function (r) {
            r.value = where === 'min' ? r.min || 0 : where === 'max' ? r.max || 100 : (Number(r.min || 0) + Number(r.max || 100)) / 2;
            fire(r, 'input'); fire(r, 'change');
        });
        return list.length;
    }
    function slidersBack() {
        if (!saved) return;
        saved.forEach(function (p) { p[0].value = p[1]; fire(p[0], 'input'); fire(p[0], 'change'); });
        saved = null;
    }
    var disabledOn = null;
    function disabledLook(root) {
        if (disabledOn) { disabledOn.forEach(function (p) { p[0].disabled = p[1]; }); disabledOn = null; return false; }
        disabledOn = $$('input, select, button, textarea', root).filter(function (e) { return !inTour(e); }).map(function (e) { var was = e.disabled; e.disabled = true; return [e, was]; });
        onLeave(function () { if (disabledOn) disabledLook(root); });
        return true;
    }
    function focusFirst(root) {
        var f = $$('button, [role=button], input:not([type=hidden]), select, [tabindex="0"], a[href]', root).filter(shown)[0];
        if (f) { try { f.focus({ focusVisible: true }); } catch (_) { f.focus(); } }
        return f;
    }

    // ── rows inside a stop ──
    var ROW_SEL = '.control-group, .fx-row, .brush-mode-row, .brush-presets-chips, .brush-presets-save-row, .ui-vis-group, .hk-row, .mixer-channel, .mixer-actions, .qub-dd, .qub-size, .lsb-steady, .arm-row, [role=radiogroup], .ch-toggle-row, .layer-item, .anim-slot';
    var LOOSE_SEL = 'button, select, input:not([type=hidden]), [role=button], [role=switch], textarea, a[href], .section-header';
    function rowsOf(root) {
        if (!root) return [];
        var list = Array.isArray(root) ? root : [root];
        var cands = [];
        list.forEach(function (r) {
            if (r.matches && r.matches(ROW_SEL)) cands.push(r);
            cands = cands.concat($$(ROW_SEL, r));
        });
        cands = cands.filter(function (c) { return shown(c) && !inTour(c); });
        // Innermost rows only: a group that holds other rows is a frame.
        var rows = cands.filter(function (c) { return !cands.some(function (o) { return o !== c && c.contains(o); }); });
        list.forEach(function (r) {
            $$(LOOSE_SEL, r).forEach(function (el) {
                if (!shown(el) || inTour(el)) return;
                if (rows.some(function (row) { return row.contains(el); })) return;
                rows.push(el);
            });
        });
        rows.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
        return rows;
    }

    // ── what to look at, worked out from what the stop holds ──
    var ALWAYS = [
        'Open every dropdown and popup here; step through every mode (States below)',
        'Make the content that only exists after an action (cards, rows, slots, a playing take)',
        'Alignment: boxes, ticks and words on one line; nothing covers a word; rows even',
        'First look: does this read clearly to a first-time player?',
        'Nothing cut off, wrapped badly or overlapping; spacing even',
        'Kill check: is there anything here nobody needs?'
    ];
    function checksFor(root, extra) {
        var c = [], els = Array.isArray(root) ? root : (root ? [root] : []);
        function has(sel) { return els.some(function (r) { return (r.matches && r.matches(sel)) || r.querySelector(sel); }); }
        if (els.some(function (r) { return r.classList && r.classList.contains('sidebar-section'); }))
            c.push('Drawer opens and closes smoothly (click, Shift-click, keyboard Enter)');
        if (has('input[type=range]')) {
            c.push('Sliders at 0 and at max look right (State lab below)');
            c.push('Drag one: value, glow and the atom respond; feels the same as before');
            c.push('Keyboard: arrows, Page Up/Down, Home/End');
        }
        if (has('select, [role=listbox], [aria-haspopup=listbox]')) c.push('Fields open by mouse and by keyboard; the list eases in; long names fit');
        if (has('input[type=checkbox]')) c.push('Checkbox panes: lit when on, unlit when off, focus ring visible');
        if (has('button, [role=button]')) c.push('Buttons: hover, press, focus ring, disabled look (State lab)');
        if (has('input[type=color]')) c.push('Colour wells open the picker and show the colour truly');
        if (has('input[type=text], input[type=number], textarea')) c.push('Text and number fields: caret, selection, placeholder');
        return (extra || []).concat(c, ALWAYS);
    }

    // ── the stops ──
    // id: stable (answers key on it). find: element or list to ring. prep:
    // puts the app in state (pushes undos). rows: list to walk (defaults to
    // the found element(s)). actions: buttons on the card.
    // States a drawer can be in: each option of its short selects (mode
    // pickers), put back when the stop is left; plus known "make it" steps.
    var MAKE = {
        'Mutate shader': { label: 'Make variant cards', run: function () { var b = $('#mutationGenerate'); if (b) b.click(); } },
        'Animations': { label: 'Fill two slots (preview)', run: function () {
            if (!window.animSlots) return;
            var list = window.recListSavedAnimations, play = window.recIsSavedAnimationPlaying;
            window.recListSavedAnimations = function () { return ['Animation 1', 'Sunset swirl'].concat(list ? list() : []); };
            window.recIsSavedAnimationPlaying = function (n) { return n === 'Animation 1' || (play ? play(n) : false); };
            window.animSlots.assignFirstEmpty('Animation 1'); window.animSlots.assignFirstEmpty('Sunset swirl');
            onLeave(function () { window.recListSavedAnimations = list; window.recIsSavedAnimationPlaying = play; });
            flash('Preview only: hover a slot for its Clear cross');
        } }
    };
    var SKIP_STATE = ['windowMode', 'penWindowMirror', 'fpsCap', 'exportGround', 'exportVideoFPS', 'exportGifFPS'];
    function stateActions(title) {
        var out = [], s = sec(title);
        if (MAKE[title]) out.push(MAKE[title]);
        if (!s) return out;
        $$('select', s).forEach(function (el) {
            if (!el.id || el.options.length < 2 || el.options.length > 6 || SKIP_STATE.indexOf(el.id) >= 0) return;
            var lab = document.querySelector('label[for="' + el.id + '"]');
            var name = clean((lab && lab.textContent) || el.getAttribute('aria-label') || el.title || el.id).split(' ').slice(0, 3).join(' ');
            out.push({ label: name + ': next', run: function () {
                if (el._ptWas == null) { el._ptWas = el.selectedIndex; onLeave(function () { el.selectedIndex = el._ptWas; el._ptWas = null; fire(el, 'change'); }); }
                el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
                fire(el, 'input'); fire(el, 'change');
                flash(name + ' → ' + el.options[el.selectedIndex].textContent.trim());
            } });
        });
        return out;
    }
    function sectionStop(s, area) {
        var title = clean(s.querySelector('.section-title') && s.querySelector('.section-title').textContent);
        return {
            id: 'sec:' + title, area: area, title: title,
            where: area + ' › ' + title,
            find: function () { return sec(title); },
            prep: function () { openDrawer(sec(title)); },
            checks: function (el) { return checksFor(el); },
            actions: [{ label: 'Open / close drawer', run: function () { toggleDrawer(sec(title)); } }],
            states: function () { return stateActions(title); },
            lab: true
        };
    }
    function stripPrep() { openBarFor($('#mixer-strip')); }
    function stripCells(keys) {
        return keys.map(function (k) { return $('#mixer-strip [data-ui-key="' + k + '"]'); }).filter(Boolean);
    }
    function buildStops() {
        var S = [];
        S.push({
            id: 'intro', area: 'Start', title: 'How this tour works',
            where: 'One stop per surface, about 40 in all',
            text: 'Each stop rings a part of the UI and puts the app in the state that shows it. Look, poke at it, tick what you checked, and give it a verdict: Love it, Polish (say what), or Kill it. ' +
                '"Walk the rows" steps through every row inside the stop for a quicker verdict per row. "Pin a note" lets you click anything on screen and write about it. ' +
                'Everything saves to prep/polish/answers.md as you go, so Claude can start fixing while you keep walking. Claude’s replies show up on the stop.',
            checks: ['Keys: Alt+→ / Alt+← next and back, Alt+↓ / Alt+↑ rows, Alt+1 / 2 / 3 Love / Polish / Kill, Alt+P pin, Alt+H hide the card'],
            noVerdict: true
        });
        S.push({
            id: 'boot', area: 'Start', title: 'Boot: splash, PhotoSafe warning, startup question',
            where: 'The first ten seconds',
            checks: ['Reload: the splash and fade-in feel finished, no flash of unstyled UI',
                'PhotoSafe warning: reads well, buttons themed, focus lands on Continue',
                'The Simple / Everything question (first run only) looks like the rest of the theme',
                'Nothing jumps or re-lays out after the UI appears'],
            actions: [
                { label: 'Show PhotoSafe warning', run: function () { var b = $('#photoWarnShowBtn'); if (b) b.click(); } },
                { label: 'Reload app here', run: function () { location.href = location.pathname + '?tour=' + (idx + 1); } }
            ]
        });
        S.push({
            id: 'overview', area: 'Start', title: 'The whole screen at rest',
            where: 'Everything, nothing touched',
            checks: ['Walnut, copper and glass read as one object', 'The eye lands on the canvas first',
                'Left and right bars balance; the top bar is not too busy', 'Idle: nothing flickers, animates or glows that should be still',
                'Hide the card (Alt+H) and take it in for ten seconds'],
            actions: [{ label: 'Hide card 8 s', run: function () { peekAway(8000); } }]
        });

        // Top bar
        var dials = ['Fluid', 'Viscosity', 'Isolation', 'Color Blend', 'Time', 'Density', 'Velocity'];
        S.push({ id: 'top:dials', area: 'Top bar', prep: stripPrep, title: 'The dials', where: 'Top bar › ' + dials.join(', '),
            find: function () { return stripCells(dials); }, lab: true,
            checks: function (el) { return checksFor(el, ['Dial faces, dots and the yin-yang hub read crisply', 'Material select (on Fluid) opens and its label stays put', 'Readouts centred under each dial']); } });
        S.push({ id: 'top:color', area: 'Top bar', prep: stripPrep, title: 'Color cell', where: 'Top bar › Color',
            find: function () { return stripCells(['Color']); },
            checks: function (el) { return checksFor(el, ['One / Random / Palette switch reads as a joined strip', 'Ignite and its lock: on, off, hover']); } });
        S.push({ id: 'top:presets', area: 'Top bar', prep: stripPrep, title: 'Presets cell and panel', where: 'Top bar › Presets',
            find: function () { return stripCells(['Presets']); },
            actions: [{ label: 'Open / close Presets panel', run: function () { var t = $('#mixerPresetsTrigger'); if (t) t.click(); } }],
            checks: function (el) { return checksFor(el, ['Panel: thumbnails, groups, the ⋯ menu, Save, look links footer', 'Panel lines up with its trigger at this window size']); } });
        S.push({ id: 'top:transport', area: 'Top bar', prep: stripPrep, title: 'Clear, Pause, Freeze', where: 'Top bar › Transport',
            find: function () { return stripCells(['Transport']); },
            checks: function (el) { return checksFor(el, ['Pause and Freeze pressed states are unmistakable', 'Clear reads as destructive but not alarming']); } });
        S.push({ id: 'top:more', area: 'Top bar', prep: stripPrep, title: 'More (parked dials)', where: 'Top bar › More, only when the window is narrow',
            find: function () { var m = $('#mixer-more'); return m && shown(m) ? m : $('#mixer-strip'); },
            actions: [{ label: 'Open / close More', run: function () { if (window.StripMore) window.StripMore.toggle(); } }],
            note: 'If More is hidden the window is wide enough for every dial. Check it again in the small-window stop.',
            checks: ['More appears only when dials park, and the panel matches the bar'].concat(ALWAYS) });

        // Left bar
        S.push({ id: 'left:head', area: 'Left bar', title: 'Brush size and Steady', where: 'Left bar › head',
            find: function () { return [$('#sidebar-left [data-ui-key="Brush Size"]'), $('#sidebar-left .lsb-steady')].filter(Boolean); },
            prep: function () { openBarFor($('#sidebar-left .lsb-head') || $('#sidebar-left')); }, lab: true,
            checks: function (el) { return checksFor(el, ['Brush size readout matches the ghost on the canvas']); } });
        var lefts = window.Sidebars && window.Sidebars.sections ? window.Sidebars.sections().filter(function (s) { return s.closest('#sidebar-left'); }) : [];
        lefts.forEach(function (s) { S.push(sectionStop(s, 'Left bar')); });
        S.push({ id: 'left:fold', area: 'Left bar', title: 'Folding the left bar', where: 'Left bar › fold tab and rail',
            find: function () { return [$('#main-area .lsb-edge'), $('#sidebar-left')].filter(Boolean); },
            actions: [{ label: 'Fold / unfold', run: function () { var L = window.Sidebars && window.Sidebars.left; if (L) L.fold(!L.isCollapsed()); } }],
            checks: ['Fold tab is findable and its icon makes sense', 'Folded rail: size, label and section buttons read well and open the right drawer',
                'The canvas refits without a jolt'].concat(ALWAYS) });

        // Canvas
        S.push({ id: 'canvas', area: 'Canvas', title: 'The canvas and its edges', where: 'Centre',
            find: function () { return $('#canvas-area'); },
            checks: ['Brush ghost outline: crisp, right size, follows the pen', 'Paint a few strokes: nothing in the UI flickers or slows',
                'Resize handles and the size readout look themed', 'Canvas edge against the walnut: clean, no stray line or gap'].concat(ALWAYS) });

        // Right bar
        var rights = window.Sidebars && window.Sidebars.sections ? window.Sidebars.sections().filter(function (s) { return s.closest('#sidebar-right'); }) : [];
        rights.forEach(function (s) { S.push(sectionStop(s, 'Right bar')); });

        // Underbar
        S.push({ id: 'underbar', area: 'Bottom bar', title: 'Quality underbar', where: 'Bottom, under the canvas',
            find: function () { var q = $('#quality-underbar'); return q ? Array.prototype.slice.call(q.children).filter(shown) : null; },
            checks: function (el) { return checksFor(el, ['Pills open upward and fit the window', 'Reset app button and the playtest/demo label are right for this build']); } });

        // Overlays
        S.push({ id: 'ov:colour', area: 'Popups', title: 'Colour picker', where: 'Top bar › Color › the colour well',
            prep: function () { var i = $('#colorPicker'); if (i && window.ColourPicker) { window.ColourPicker.openFor(i); onLeave(function () { window.ColourPicker.close(); }); } },
            find: function () { return $('.cp-pop') || $('#colorPicker'); },
            actions: [{ label: 'Reopen picker', run: function () { var i = $('#colorPicker'); if (i && window.ColourPicker) window.ColourPicker.openFor(i); } }],
            checks: function (el) { return checksFor(el, ['Wheel/square, sliders, hex field, eyedropper, palette row', 'Opens beside its well and never off screen']); } });
        S.push({ id: 'ov:palette', area: 'Popups', title: 'Palette list', where: 'Right bar › Colors and palettes › palette field',
            prep: function () { openDrawer(sec('Colors and palettes')); var p = $('#paletteSelect'); if (p) setTimeout(function () { p.click(); }, 350); onLeave(function () { if ($('.palette-list')) escKey($('.palette-list')); }); },
            find: function () { return $('.palette-list') || $('#paletteSelect'); },
            checks: ['List rows: swatches, names, the selected one, keyboard'].concat(ALWAYS) });
        S.push({ id: 'ov:radial', area: 'Popups', title: 'Radial menu (E)', where: 'Over the canvas',
            prep: function () { if (window.RadialMenu) { var m = canvasMid(); window.RadialMenu.open({ x: m.x, y: m.y }); onLeave(function () { window.RadialMenu.close(); }); } },
            find: function () { return $('#radialMenu .radial-hit') || $('#radialMenu'); },
            actions: [{ label: 'Reopen menu', run: function () { if (window.RadialMenu) { var m = canvasMid(); window.RadialMenu.open({ x: m.x, y: m.y }); } } }],
            note: 'A click on this card can close the menu. Use Reopen, or press E over the canvas yourself.',
            checks: ['Wedges, labels, the hub and the hovered wedge', 'Opens without a frame hitch'].concat(ALWAYS) });
        S.push({ id: 'ov:hotkeys', area: 'Popups', title: 'Hotkey sheet (F1)', where: 'Full-screen sheet',
            prep: function () { if (window.showHotkeys) { window.showHotkeys(); onLeave(function () { var o = $('#hotkeyOverlay'); if (o && o.style.display === 'flex') escKey(o); }); } },
            find: function () { return $('#hotkeyOverlay .hotkey-modal') || $('#hotkeyOverlay'); },
            checks: ['Key caps, columns, headings; scrolls if long', 'Esc and the close cross both close it'].concat(ALWAYS) });
        S.push({ id: 'ov:skip', area: 'Popups', title: 'Skip menu (Tab from nothing)', where: 'Top left, keyboard only',
            prep: function () { if (window.SkipMenu) { window.SkipMenu.open(); onLeave(function () { if (window.SkipMenu.isOpen()) window.SkipMenu.close(); }); } },
            find: function () { return $('#skipMenu'); },
            checks: ['Map and four region buttons themed; focus ring clear'].concat(ALWAYS) });
        S.push({ id: 'ov:reset', area: 'Popups', title: 'Reset app dialog', where: 'Bottom bar › Reset app',
            prep: function () { if (window.ResetApp) { window.ResetApp.ask(); onLeave(function () { var m = $('#resetAppModal'); if (m && shown(m)) escKey(m); }); } },
            find: function () { return $('#resetAppModal .delete-modal-content') || $('#resetAppModal'); },
            note: 'Don’t press the dialog’s Reset: it really resets. Esc or Cancel closes it.',
            checks: ['Title, message, the two buttons: weight and order right', 'Focus lands on the safe button'].concat(ALWAYS) });
        S.push({ id: 'ov:confirm', area: 'Popups', title: 'App confirm (the generic dialog)', where: 'Used by delete, overwrite and leave asks',
            prep: function () {
                if (window.appConfirm) window.appConfirm({ title: 'Delete this preset?', message: 'A sample of the app’s confirm dialog, opened by the tour. Nothing happens whichever you press.', confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true });
                onLeave(function () { var m = $('#appConfirmModal'); if (m && shown(m)) escKey(m); });
            },
            find: function () { return $('#appConfirmModal .delete-modal-content') || $('#appConfirmModal'); },
            checks: ['Danger button reads as danger; Keep is the easy way out'].concat(ALWAYS) });
        S.push({ id: 'ov:invite', area: 'Popups', title: 'Swirl Together invite popover', where: 'Right bar › Swirl Together › Invite',
            prep: function () { openDrawer(sec('Swirl Together')); },
            find: function () { var p = $('#mpInvitePop'); return p && !p.hidden ? p : ($('#mpInviteBtn') && shown($('#mpInviteBtn')) ? $('#mpInviteBtn') : sec('Swirl Together')); },
            note: 'The Invite button shows once a room is open: start a room in the drawer, then press Invite.',
            checks: ['Nixie room code, QR, link, phone button', 'Leave and the ⋯ room menu'].concat(ALWAYS) });
        S.push({ id: 'ov:focus', area: 'Window states', title: 'Focus mode', where: 'Everything but the canvas hidden',
            prep: function () { if (window.focusMode && !window.focusMode.isActive()) { window.focusMode.toggle(); onLeave(function () { if (window.focusMode.isActive()) window.focusMode.toggle(); }); } },
            find: function () { return $('#focus-mode-hint') || $('#canvas-area'); },
            checks: ['The hint reads well and fades', 'Coming back restores both bars exactly'].concat(ALWAYS) });
        S.push({ id: 'ov:compact', area: 'Window states', title: 'Docked bar (two sidebars)', where: 'Below ~1800 px wide the top bar docks into the right sidebar',
            prep: function () { if (window.toggleCompactMode && !document.body.classList.contains('compact-ui')) { window.toggleCompactMode(true); onLeave(function () { window.toggleCompactMode(false); }); } openBarFor($('#sidebar-right .sidebar-section')); },
            find: function () { return $('#sidebar-right'); },
            note: 'This docks the bar at your current size. For the real thing, resize the window: it docks the moment the bar would wrap (try 1680 and 1366), and below 768 wide both bars fold to rails.',
            checks: ['Top bar laid out in the right sidebar; dial readouts centred', 'Right rail labels (Controls, Color, Presets, Together) open the right place', 'Nothing overlaps'].concat(ALWAYS) });
        S.push({ id: 'desktop', area: 'Window states', title: 'Desktop-only (check in the Electron build)', where: 'Not visible on the web',
            checks: ['Custom title bar: min, max, close; drag region', 'Close ask (X with unsaved work)', 'Transparent background on: drawers glide, overlays open cleanly',
                'Pen window (Display › Pop Out Pen Input)', 'Steam demo clock and wishlist dialog (demo build)', 'Steam overlay (Shift+Tab) over the app'] });
        S.push({ id: 'mask', area: 'Popups', title: 'Mask editor', where: 'Layers › From Image (pick a picture)',
            find: function () { return $('#maskEditorOverlay') || sec('Layers'); },
            prep: function () { if (!$('#maskEditorOverlay')) openDrawer(sec('Layers')); },
            note: 'Opening it needs a picture: Layers › From Image. The stop rings the editor once it is open (press Recheck).',
            checks: ['Tabs, tools, sliders, Apply / Cancel', 'Instant Roto wait reads as progress, not a hang'].concat(ALWAYS) });
        S.push({ id: 'finish', area: 'End', title: 'Your list', where: 'Everything you said, in one place', finish: true, noVerdict: true });
        return S;
    }

    // ── state ──
    var STOPS = [];
    var idx = 0, rowIdx = -1, rows = [];
    var state = { answers: {} };
    var replies = {};
    var card = null, ring = null, rowRing = null, pinRing = null, pill = null;
    var online = true;

    function answer(id) {
        var a = state.answers[id];
        if (!a) a = state.answers[id] = { verdict: '', note: '', checks: [], pins: [] };
        return a;
    }
    var saveT = 0;
    function save() {
        try { localStorage.setItem(LS, JSON.stringify({ answers: state.answers, idx: idx })); } catch (_) {}
        clearTimeout(saveT);
        saveT = setTimeout(push, 400);
    }
    function push() {
        var body = {
            savedAt: new Date().toISOString(),
            viewport: innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio + ' ui-scale ' + (getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || '1'),
            at: STOPS[idx] ? STOPS[idx].id : '',
            stops: STOPS.map(function (s) { return { id: s.id, area: s.area, title: s.title, checks: listChecks(s) }; }),
            answers: state.answers
        };
        fetch('/__tour/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (r) { setOnline(r.ok); }, function () { setOnline(false); });
    }
    function setOnline(ok) {
        if (online === ok) return;
        online = ok;
        if (card) card.classList.toggle('pt-offline', !ok);
    }
    function load() {
        var local = null;
        try { local = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (_) {}
        return fetch('/__tour/state', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (disk) {
            // The newer of disk and this browser wins per stop: disk carries
            // answers from another window, local carries what never reached
            // the server.
            var A = (disk && disk.answers) || {};
            if (local && local.answers) Object.keys(local.answers).forEach(function (k) { if (!A[k]) A[k] = local.answers[k]; });
            state.answers = A;
            if (local && typeof local.idx === 'number') idx = local.idx;
        }, function () { if (local) { state.answers = local.answers || {}; idx = local.idx || 0; } });
    }
    function pollReplies() {
        fetch('/__tour/replies', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (R) {
            var was = JSON.stringify(replies);
            replies = R || {};
            setOnline(true);
            if (JSON.stringify(replies) !== was && card && !card.classList.contains('pt-min')) render();
        }, function () { setOnline(false); });
    }

    function listChecks(s) {
        if (!s) return [];
        if (typeof s.checks === 'function') {
            var el = null;
            try { el = s.find ? s.find() : null; } catch (_) {}
            return s.checks(el);
        }
        return s.checks || ALWAYS;
    }
    function found(s) {
        var el = null;
        try { el = s.find ? s.find() : null; } catch (e) { console.warn('[tour] find', s.id, e); }
        if (Array.isArray(el)) { el = el.filter(Boolean); return el.length ? el : null; }
        return el;
    }

    // ── the rings ──
    function rectOf(el) {
        var list = Array.isArray(el) ? el : [el];
        var r = null;
        list.forEach(function (e) {
            if (!shown(e)) return;
            var b = e.getBoundingClientRect();
            if (!r) r = { l: b.left, t: b.top, r: b.right, b: b.bottom };
            else { r.l = Math.min(r.l, b.left); r.t = Math.min(r.t, b.top); r.r = Math.max(r.r, b.right); r.b = Math.max(r.b, b.bottom); }
        });
        return r;
    }
    function place(ringEl, el, pad) {
        var r = el ? rectOf(el) : null;
        if (!r) { ringEl.style.display = 'none'; return null; }
        ringEl.style.display = 'block';
        ringEl.style.left = (r.l - pad) + 'px';
        ringEl.style.top = (r.t - pad) + 'px';
        ringEl.style.width = (r.r - r.l + pad * 2) + 'px';
        ringEl.style.height = (r.b - r.t + pad * 2) + 'px';
        return r;
    }
    var target = null;
    function reposition() {
        if (!card) return;
        place(ring, target, 4);
        place(rowRing, rowIdx >= 0 ? rows[rowIdx] : null, 2);
    }
    // Card goes on the side away from what it rings, unless dragged.
    var dragged = false;
    function dock() {
        if (dragged || !card || card.classList.contains('pt-min')) return;
        var r = target ? rectOf(target) : null;
        var mid = r ? (r.l + r.r) / 2 : innerWidth;
        card.style.top = '64px';
        card.style.bottom = '';
        if (mid > innerWidth / 2) { card.style.left = '16px'; card.style.right = 'auto'; }
        else { card.style.right = '16px'; card.style.left = 'auto'; }
    }

    // ── showing a stop ──
    function show(i) {
        i = Math.max(0, Math.min(STOPS.length - 1, i));
        leaveAll();
        saved = null; disabledOn = null;
        idx = i; rowIdx = -1; rows = [];
        var s = STOPS[idx];
        try { if (s.prep) s.prep(); } catch (e) { console.warn('[tour] prep', s.id, e); }
        save();
        history.replaceState(null, '', location.pathname + '?tour=' + (idx + 1) + location.hash);
        render();
        // Drawers glide and popups build: find the target again once they settle.
        setTimeout(function () { if (STOPS[idx] === s) { target = found(s); reveal(target); dock(); reposition(); renderFoundNote(); renderFlags(); } }, 450);
        setTimeout(function () { if (STOPS[idx] === s) { target = found(s); reposition(); } }, 1100);
    }
    // A drawer low in a bar opens below the fold: bring its top into view.
    function reveal(t) {
        var el = Array.isArray(t) ? t[0] : t;
        if (!el || !shown(el)) return;
        var r = el.getBoundingClientRect();
        if (r.top < 0 || r.top > innerHeight - 120) { try { el.scrollIntoView({ block: 'start' }); } catch (_) {} }
    }
    var FLAG_WORD = { cut: 'word cut', overlap: 'covers a word', align: 'off its line', uneven: 'uneven row', empty: 'shows nothing', nested: 'frame in a frame', heavy: 'heavy border', emoji: 'colour emoji', native: 'OS dropdown', 'native-box': 'browser checkbox' };
    function renderFlags() {
        var box = card && card.querySelector('.pt-flags');
        if (!box || !window.__polishGeom) return;
        var t = found(STOPS[idx]), list = [];
        (Array.isArray(t) ? t : t ? [t] : []).forEach(function (el) { try { list = list.concat(window.__polishGeom(el)); } catch (_) {} });
        box.innerHTML = '';
        if (!list.length) { box.appendChild(h('div', 'pt-sub', 'Layout check: nothing flagged (it can’t see small-caps alignment; look).')); return; }
        box.appendChild(h('div', 'pt-label', 'Layout check: ' + list.length + ' flag' + (list.length > 1 ? 's' : '')));
        list.slice(0, 12).forEach(function (f) {
            var b = h('button', 'pt-link pt-flag', (FLAG_WORD[f.kind] || f.kind) + ': ' + f.label + (f.note ? ' (' + f.note + ')' : ''));
            b.type = 'button';
            b.onclick = function () { var el = null; try { el = document.querySelector(f.sel); } catch (_) {} if (el) { place(pinRing, el, 3); setTimeout(function () { pinRing.style.display = 'none'; }, 2200); } };
            box.appendChild(b);
        });
    }
    function renderFoundNote() {
        var n = card && card.querySelector('.pt-found');
        if (!n) return;
        var s = STOPS[idx];
        if (!s.find || s.finish) { n.textContent = ''; return; }
        var t = found(s);
        n.textContent = t && rectOf(t) ? '' : 'Not on screen right now' + (s.note ? '' : ' (a closed popup, or not built at this window size).');
    }

    function verdictRow(get, set, small) {
        var row = h('div', 'pt-verdicts' + (small ? ' pt-small' : ''));
        [['love', 'Love it'], ['polish', 'Polish'], ['kill', 'Kill it'], ['later', 'Not sure']].forEach(function (v) {
            var b = h('button', 'pt-v pt-v-' + v[0] + (get() === v[0] ? ' on' : ''), v[1]);
            b.type = 'button';
            b.onclick = function () { set(get() === v[0] ? '' : v[0]); Array.prototype.forEach.call(row.children, function (k) { k.classList.toggle('on', k === b && get() === v[0]); }); };
            row.appendChild(b);
        });
        return row;
    }

    function render() {
        if (!card) return;
        var s = STOPS[idx];
        target = found(s);
        card.innerHTML = '';
        card.classList.remove('pt-min');
        if (s.finish) { renderFinish(); return; }
        var a = answer(s.id);

        var head = h('div', 'pt-head');
        var area = h('span', 'pt-area', s.area + ' · ' + (idx + 1) + ' / ' + STOPS.length);
        head.appendChild(area);
        var jump = h('select', 'pt-jump');
        jump.title = 'Jump to a stop';
        var lastArea = '', og = null;
        STOPS.forEach(function (st, k) {
            if (st.area !== lastArea) { og = h('optgroup'); og.label = st.area; jump.appendChild(og); lastArea = st.area; }
            var an = state.answers[st.id];
            var mark = an && an.verdict ? { love: '♥ ', polish: '✎ ', kill: '✕ ', later: '? ' }[an.verdict] : '   ';
            var o = h('option', '', mark + (k + 1) + '. ' + st.title);
            o.value = k; if (k === idx) o.selected = true;
            og.appendChild(o);
        });
        jump.onchange = function () { show(parseInt(jump.value, 10)); };
        head.appendChild(jump);
        var min = h('button', 'pt-icon', '–'); min.title = 'Shrink the card (Alt+H)'; min.type = 'button'; min.onclick = minimise;
        var x = h('button', 'pt-icon', '×'); x.title = 'Close the tour (answers are kept)'; x.type = 'button'; x.onclick = close;
        head.appendChild(min); head.appendChild(x);
        card.appendChild(head);
        dragHandle(head);

        card.appendChild(h('h3', '', s.title));
        card.appendChild(h('div', 'pt-where', s.where || ''));
        card.appendChild(h('div', 'pt-found'));
        if (s.text) card.appendChild(h('div', 'pt-text', s.text));
        if (s.note) card.appendChild(h('div', 'pt-note', s.note));

        var rep = replies[s.id];
        if (rep && rep.text) {
            var rb = h('div', 'pt-reply pt-reply-' + (rep.status || 'note'));
            rb.appendChild(h('b', '', { fixed: 'Claude: fixed, please recheck', question: 'Claude asks', wontfix: 'Claude: leaving as is', working: 'Claude: on it' }[rep.status] || 'Claude'));
            rb.appendChild(h('div', '', rep.text));
            card.appendChild(rb);
        }

        // Checks
        var checks = listChecks(s);
        if (checks.length) {
            card.appendChild(h('div', 'pt-label', 'Look at'));
            var ul = h('div', 'pt-checks');
            checks.forEach(function (c, k) {
                var lab = h('label', 'pt-check');
                var cb = h('input'); cb.type = 'checkbox';
                cb.checked = a.checks.indexOf(k) >= 0;
                cb.onchange = function () {
                    var at = a.checks.indexOf(k);
                    if (cb.checked && at < 0) a.checks.push(k);
                    if (!cb.checked && at >= 0) a.checks.splice(at, 1);
                    save();
                };
                lab.appendChild(cb); lab.appendChild(h('span', '', c));
                ul.appendChild(lab);
            });
            card.appendChild(ul);
        }

        // Actions + state lab
        var acts = (s.actions || []).slice();
        if (s.lab) {
            acts.push({ label: 'Sliders → 0', run: function () { flash(slidersTo(found(s), 'min') + ' sliders at 0'); } });
            acts.push({ label: 'Sliders → max', run: function () { flash(slidersTo(found(s), 'max') + ' sliders at max'); } });
            acts.push({ label: 'Sliders back', run: function () { slidersBack(); flash('Back where they were'); } });
        }
        if (s.find) {
            acts.push({ label: 'Disabled look', run: function () { flash(disabledLook(found(s)) ? 'Showing disabled (press again to undo)' : 'Enabled again'); } });
            acts.push({ label: 'Keyboard focus', run: function () { var f = focusFirst(found(s)); flash(f ? 'Focused ' + labelOf(f) + ' (Tab on from here)' : 'Nothing focusable'); } });
            acts.push({ label: 'Recheck', run: function () { target = found(s); reposition(); renderFoundNote(); } });
        }
        if (acts.length) {
            card.appendChild(h('div', 'pt-label', 'Try'));
            var ar = h('div', 'pt-actions');
            acts.forEach(function (ac) {
                var b = h('button', 'pt-btn', ac.label); b.type = 'button';
                b.onclick = function () { try { ac.run(); } catch (e) { flash('Failed: ' + e.message); } setTimeout(function () { target = found(s); reposition(); }, 400); };
                ar.appendChild(b);
            });
            card.appendChild(ar);
            card.appendChild(h('div', 'pt-flash'));
        }

        // States
        var sts = s.states ? s.states() : [];
        if (sts.length) {
            card.appendChild(h('div', 'pt-label', 'States'));
            var sr = h('div', 'pt-actions');
            sts.forEach(function (ac) {
                var b = h('button', 'pt-btn', ac.label); b.type = 'button';
                b.onclick = function () { try { ac.run(); } catch (e) { flash('Failed: ' + e.message); } setTimeout(function () { target = found(s); reposition(); renderFlags(); }, 600); };
                sr.appendChild(b);
            });
            card.appendChild(sr);
        }
        // Layout flags (geometry.js), refreshed after each state change.
        if (s.find && window.__polishGeom) card.appendChild(h('div', 'pt-flags'));

        // Rows and pins
        if (!s.noVerdict) {
            var rw = h('div', 'pt-rows');
            var rb2 = h('button', 'pt-btn', rowIdx >= 0 ? 'Stop walking rows' : 'Walk the rows');
            rb2.type = 'button';
            rb2.onclick = function () { if (rowIdx >= 0) { rowIdx = -1; render(); reposition(); } else startRows(); };
            var pb = h('button', 'pt-btn', 'Pin a note'); pb.type = 'button'; pb.title = 'Then click anything on screen (Alt+P)'; pb.onclick = pinMode;
            if (s.find) rw.appendChild(rb2); rw.appendChild(pb);
            card.appendChild(rw);
            if (rowIdx >= 0) card.appendChild(rowPanel(s, a));
        }

        // Pins
        var pins = a.pins.filter(function (p) { return !p.row; });
        if (pins.length) {
            card.appendChild(h('div', 'pt-label', 'Pinned notes'));
            pins.forEach(function (p) { card.appendChild(pinEditor(p, a)); });
        }
        var rowPins = a.pins.filter(function (p) { return p.row && (p.verdict || p.note); });
        if (rowPins.length && rowIdx < 0) {
            card.appendChild(h('div', 'pt-sub', rowPins.length + ' row verdict' + (rowPins.length > 1 ? 's' : '') + ' saved (' +
                ['love', 'polish', 'kill'].map(function (v) { var n = rowPins.filter(function (p) { return p.verdict === v; }).length; return n ? n + ' ' + v : ''; }).filter(Boolean).join(', ') + ')'));
        }

        // Verdict
        if (!s.noVerdict) {
            card.appendChild(h('div', 'pt-label', 'Your verdict on this stop'));
            card.appendChild(verdictRow(function () { return a.verdict; }, function (v) { a.verdict = v; save(); if (v === 'polish' || v === 'kill') ta.focus(); }));
            var ta = h('textarea', 'pt-ta');
            ta.placeholder = 'What to change, what to kill, or what you love';
            ta.value = a.note;
            ta.oninput = function () { a.note = ta.value; if (!a.verdict && ta.value.trim()) a.verdict = 'polish'; save(); };
            card.appendChild(ta);
        }

        var nav = h('div', 'pt-nav');
        var back = h('button', 'pt-btn', '← Back'); back.type = 'button'; back.disabled = idx === 0; back.onclick = function () { show(idx - 1); };
        var done = STOPS.filter(function (st) { var an = state.answers[st.id]; return an && an.verdict; }).length;
        nav.appendChild(back);
        nav.appendChild(h('span', 'pt-mid', done + ' of ' + STOPS.filter(function (st) { return !st.noVerdict; }).length + ' judged'));
        var next = h('button', 'pt-btn pt-primary', 'Next →'); next.type = 'button'; next.onclick = function () { show(idx + 1); };
        nav.appendChild(next);
        card.appendChild(nav);
        card.appendChild(h('div', 'pt-offline-bar', 'Tour server offline: answers are kept in this browser and sent when it is back.'));

        reposition();
        renderFoundNote();
    }

    function rowPanel(s, a) {
        var box = h('div', 'pt-rowbox');
        var row = rows[rowIdx];
        if (!row) { box.appendChild(h('div', 'pt-sub', 'No rows here.')); return box; }
        var sel = selOf(row), lab = labelOf(row);
        var p = a.pins.filter(function (q) { return q.row && q.sel === sel; })[0];
        if (!p) { p = { row: true, sel: sel, label: lab, verdict: '', note: '' }; }
        var top = h('div', 'pt-rowtop');
        var pr = h('button', 'pt-icon', '‹'); pr.type = 'button'; pr.title = 'Previous row (Alt+↑)'; pr.onclick = function () { stepRow(-1); };
        var nx = h('button', 'pt-icon', '›'); nx.type = 'button'; nx.title = 'Next row (Alt+↓)'; nx.onclick = function () { stepRow(1); };
        top.appendChild(pr);
        top.appendChild(h('span', 'pt-rowname', 'Row ' + (rowIdx + 1) + ' of ' + rows.length + ': ' + lab));
        top.appendChild(nx);
        box.appendChild(top);
        function keep() { if (a.pins.indexOf(p) < 0 && (p.verdict || p.note)) a.pins.push(p); save(); }
        box.appendChild(verdictRow(function () { return p.verdict; }, function (v) { p.verdict = v; p.state = stateTag(); keep(); if (v === 'love') setTimeout(function () { stepRow(1); }, 150); }, true));
        var inp = h('input', 'pt-rownote'); inp.type = 'text'; inp.placeholder = 'Note for this row (Enter = next row)';
        inp.value = p.note || '';
        inp.oninput = function () { p.note = inp.value; if (!p.verdict && inp.value.trim()) p.verdict = 'polish'; p.state = stateTag(); keep(); };
        inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); stepRow(1); } };
        box.appendChild(inp);
        setTimeout(function () { try { row.scrollIntoView({ block: 'nearest' }); } catch (_) {} reposition(); }, 0);
        return box;
    }
    function startRows() {
        rows = rowsOf(found(STOPS[idx]));
        rowIdx = rows.length ? 0 : -1;
        if (!rows.length) flash('No rows found here');
        render();
    }
    function stepRow(d) {
        if (rowIdx < 0) { startRows(); return; }
        rows = rows.filter(function (r) { return r.isConnected; });
        rowIdx = Math.max(0, Math.min(rows.length - 1, rowIdx + d));
        render();
        var f = card.querySelector('.pt-rownote'); if (f) f.focus();
    }
    function stateTag() {
        var b = document.body.classList, t = [];
        if (b.contains('compact-ui')) t.push('compact');
        if (b.contains('focus-mode')) t.push('focus mode');
        t.push(innerWidth + 'x' + innerHeight);
        return t.join(', ');
    }

    function pinEditor(p, a) {
        var box = h('div', 'pt-pin');
        var t = h('div', 'pt-pin-head');
        var nm = h('button', 'pt-link', p.label); nm.type = 'button'; nm.title = 'Ring it again: ' + p.sel;
        nm.onclick = function () { var el = null; try { el = document.querySelector(p.sel); } catch (_) {} if (el) { place(pinRing, el, 3); setTimeout(function () { pinRing.style.display = 'none'; }, 1800); } else flash('Not on screen now'); };
        var del = h('button', 'pt-icon', '×'); del.type = 'button'; del.title = 'Remove this note';
        del.onclick = function () { a.pins.splice(a.pins.indexOf(p), 1); save(); render(); };
        t.appendChild(nm); t.appendChild(del);
        box.appendChild(t);
        var ta = h('textarea', 'pt-ta pt-ta-small'); ta.placeholder = 'What about it?'; ta.value = p.note || '';
        ta.oninput = function () { p.note = ta.value; save(); };
        box.appendChild(ta);
        return box;
    }

    // ── pin mode: hover rings what you'd pin, click files it ──
    var pinning = false;
    function pinMode() {
        if (pinning) return endPin();
        pinning = true;
        document.body.classList.add('pt-pinning');
        flash('Click anything to pin a note to it. Esc cancels.');
        document.addEventListener('pointermove', pinMove, true);
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) { document.addEventListener(t, pinClick, true); });
    }
    function endPin() {
        pinning = false;
        document.body.classList.remove('pt-pinning');
        pinRing.style.display = 'none';
        document.removeEventListener('pointermove', pinMove, true);
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) { document.removeEventListener(t, pinClick, true); });
    }
    function pinTarget(e) {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || inTour(el)) return null;
        // Pin to the control, not a span inside it.
        return (el.closest && el.closest('button, select, input, label, [role=button], .control-group, .mixer-channel, .section-header, .qub-dd')) || el;
    }
    function pinMove(e) { var el = pinTarget(e); if (el) place(pinRing, el, 2); else pinRing.style.display = 'none'; }
    function pinClick(e) {
        if (inTour(e.target)) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (e.type !== 'click') return;
        var el = pinTarget(e);
        endPin();
        if (!el) return;
        var s = STOPS[idx], a = answer(s.id);
        a.pins.push({ sel: selOf(el), label: labelOf(el), note: '', state: stateTag() });
        save();
        render();
        var tas = card.querySelectorAll('.pt-pin .pt-ta');
        if (tas.length) tas[tas.length - 1].focus();
    }

    // ── finish: the list ──
    function listText() {
        var out = ['Polish tour, ' + STOPS.length + ' stops (' + innerWidth + 'x' + innerHeight + ')'];
        STOPS.forEach(function (s, i) {
            var a = state.answers[s.id];
            if (!a || (!a.verdict && !a.note && !a.pins.length)) return;
            out.push('');
            out.push((i + 1) + '. ' + s.title + ' [' + s.id + ']: ' + ({ love: 'LOVE', polish: 'POLISH', kill: 'KILL', later: 'NOT SURE' }[a.verdict] || '-') + (a.note.trim() ? ': ' + a.note.trim() : ''));
            a.pins.forEach(function (p) { if (p.verdict || p.note) out.push('   - ' + p.label + ' (' + p.sel + ')' + (p.verdict ? ' ' + p.verdict.toUpperCase() : '') + (p.note ? ': ' + p.note : '')); });
        });
        return out.join('\n');
    }
    function renderFinish() {
        target = null; reposition();
        var head = h('div', 'pt-head');
        head.appendChild(h('span', 'pt-area', 'Polish tour · your list'));
        var x = h('button', 'pt-icon', '×'); x.type = 'button'; x.onclick = close;
        head.appendChild(x);
        card.appendChild(head);
        dragHandle(head);
        var counts = { love: 0, polish: 0, kill: 0, later: 0 };
        STOPS.forEach(function (s) { var a = state.answers[s.id]; if (a && a.verdict) counts[a.verdict]++; });
        card.appendChild(h('h3', '', counts.love + ' loved · ' + counts.polish + ' to polish · ' + counts.kill + ' to kill · ' + counts.later + ' unsure'));
        card.appendChild(h('div', 'pt-where', online ? 'Already saved to prep/polish/answers.md: just tell Claude you’re done.' : 'Server offline: copy this into the chat.'));
        var ta = h('textarea', 'pt-ta pt-list'); ta.readOnly = true; ta.value = listText();
        card.appendChild(ta);
        var nav = h('div', 'pt-nav');
        var back = h('button', 'pt-btn', '← Back'); back.type = 'button'; back.onclick = function () { show(idx - 1); };
        var copy = h('button', 'pt-btn pt-primary', 'Copy list'); copy.type = 'button';
        copy.onclick = function () { ta.select(); try { navigator.clipboard.writeText(ta.value); } catch (_) { document.execCommand('copy'); } copy.textContent = 'Copied'; };
        nav.appendChild(back); nav.appendChild(copy);
        card.appendChild(nav);
    }

    // ── card chrome ──
    var flashT = 0;
    function flash(msg) {
        var f = card && card.querySelector('.pt-flash');
        if (!f) return;
        f.textContent = msg;
        clearTimeout(flashT);
        flashT = setTimeout(function () { f.textContent = ''; }, 3500);
    }
    function minimise() {
        if (!card) return;
        card.style.display = 'none';
        ring.style.opacity = '0.35';
        pill.style.display = 'block';
        pill.textContent = 'Tour ' + (idx + 1) + ' / ' + STOPS.length + '  ▸';
    }
    function restore() {
        if (!card) return;
        card.style.display = '';
        ring.style.opacity = '';
        pill.style.display = 'none';
    }
    function peekAway(ms) {
        minimise(); ring.style.display = 'none'; pill.style.display = 'none';
        setTimeout(function () { restore(); reposition(); }, ms);
    }
    function dragHandle(head) {
        head.onpointerdown = function (e) {
            if (e.target.closest('button, select')) return;
            var r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
            head.setPointerCapture(e.pointerId);
            head.onpointermove = function (m) {
                dragged = true;
                card.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx)) + 'px';
                card.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy)) + 'px';
                card.style.right = 'auto';
            };
            head.onpointerup = function () { head.onpointermove = null; head.onpointerup = null; };
        };
        head.ondblclick = function () { dragged = false; dock(); };
    }
    function close() {
        leaveAll();
        if (pinning) endPin();
        [card, ring, rowRing, pinRing, pill].forEach(function (e) { if (e) e.remove(); });
        card = ring = rowRing = pinRing = pill = null;
        clearInterval(pollT); clearInterval(posT);
        history.replaceState(null, '', location.pathname + location.hash);
    }

    var CSS = [
        '#pt-card{position:fixed;z-index:' + Z + ';width:372px;max-height:calc(100vh - 80px);overflow:auto;background:#15171c;color:#e8e6e3;border:1px solid #3a3f4a;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.55);font:13px/1.45 system-ui,"Segoe UI",sans-serif;padding:10px 14px 12px;letter-spacing:0;text-transform:none;}',
        '#pt-card *{box-sizing:border-box;font-family:inherit;letter-spacing:inherit;text-transform:none;}',
        '#pt-card h3{margin:8px 0 2px;font-size:16px;font-weight:650;color:#fff;}',
        '#pt-card .pt-head{display:flex;gap:6px;align-items:center;cursor:move;user-select:none;}',
        '#pt-card .pt-area{font-size:11px;color:#9aa3b2;white-space:nowrap;}',
        '#pt-card .pt-jump{flex:1;min-width:0;background:#20242c;color:#e8e6e3;border:1px solid #3a3f4a;border-radius:6px;font-size:12px;padding:2px 4px;height:24px;}',
        '#pt-card .pt-where{color:#9aa3b2;font-size:12px;}',
        '#pt-card .pt-found{color:#f5b462;font-size:12px;}',
        '#pt-card .pt-found:empty{display:none;}',
        '#pt-card .pt-text{margin:8px 0;}',
        '#pt-card .pt-note{margin:6px 0;padding:6px 8px;background:#20242c;border-left:3px solid #6a8cff;border-radius:4px;font-size:12px;}',
        '#pt-card .pt-reply{margin:8px 0;padding:7px 9px;border-radius:6px;background:#1d2a22;border:1px solid #2f6b45;font-size:12.5px;}',
        '#pt-card .pt-reply-question{background:#2a2619;border-color:#7a6430;}',
        '#pt-card .pt-reply-wontfix{background:#22232a;border-color:#4a4d5a;}',
        '#pt-card .pt-label{margin:10px 0 4px;font-size:11px;font-weight:650;color:#9aa3b2;text-transform:uppercase;letter-spacing:.06em;}',
        '#pt-card .pt-checks{display:flex;flex-direction:column;gap:3px;}',
        '#pt-card .pt-check{display:flex;gap:7px;align-items:flex-start;cursor:pointer;font-size:12.5px;}',
        '#pt-card .pt-check input{margin:3px 0 0;accent-color:#ff4fa3;flex:none;}',
        '#pt-card .pt-check input:checked + span{color:#7d8696;text-decoration:line-through;}',
        '#pt-card .pt-actions,#pt-card .pt-rows,#pt-card .pt-verdicts{display:flex;flex-wrap:wrap;gap:5px;}',
        '#pt-card .pt-rows{margin-top:10px;}',
        '#pt-card button{all:unset;box-sizing:border-box;cursor:pointer;}',
        '#pt-card .pt-btn,#pt-card .pt-v{padding:4px 9px;border-radius:6px;background:#242933;border:1px solid #3a3f4a;color:#e8e6e3;font-size:12px;line-height:1.3;}',
        '#pt-card .pt-btn:hover,#pt-card .pt-v:hover{background:#2e3440;}',
        '#pt-card .pt-btn:focus-visible,#pt-card .pt-v:focus-visible,#pt-card .pt-icon:focus-visible,#pt-card .pt-link:focus-visible{outline:2px solid #ff4fa3;outline-offset:1px;}',
        '#pt-card .pt-btn[disabled]{opacity:.4;cursor:default;}',
        '#pt-card .pt-primary{background:#ff4fa3;border-color:#ff4fa3;color:#1a0b13;font-weight:650;}',
        '#pt-card .pt-primary:hover{background:#ff6db4;}',
        '#pt-card .pt-v-love.on{background:#1f5a3a;border-color:#3fb877;}',
        '#pt-card .pt-v-polish.on{background:#5a4a1a;border-color:#e0b23c;}',
        '#pt-card .pt-v-kill.on{background:#5a1f26;border-color:#e2525f;}',
        '#pt-card .pt-v-later.on{background:#2c3140;border-color:#7d8aa8;}',
        '#pt-card .pt-small .pt-v{padding:2px 7px;font-size:11.5px;}',
        '#pt-card .pt-icon{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;color:#9aa3b2;font-size:16px;flex:none;}',
        '#pt-card .pt-icon:hover{background:#2a2f3a;color:#fff;}',
        '#pt-card .pt-link{color:#8fb0ff;text-decoration:underline;font-size:12.5px;}',
        '#pt-card .pt-ta,#pt-card .pt-rownote{width:100%;margin-top:6px;background:#0f1115;color:#e8e6e3;border:1px solid #3a3f4a;border-radius:6px;padding:6px 8px;font-size:12.5px;}',
        '#pt-card .pt-ta{min-height:56px;resize:vertical;}',
        '#pt-card .pt-ta-small{min-height:38px;}',
        '#pt-card .pt-list{min-height:300px;font:12px/1.4 ui-monospace,Consolas,monospace;}',
        '#pt-card .pt-ta:focus,#pt-card .pt-rownote:focus{outline:2px solid #ff4fa3;outline-offset:0;}',
        '#pt-card .pt-rowbox{margin-top:8px;padding:8px;border:1px solid #39557a;border-radius:8px;background:#161c26;}',
        '#pt-card .pt-rowtop{display:flex;align-items:center;gap:4px;margin-bottom:6px;}',
        '#pt-card .pt-rowname{flex:1;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '#pt-card .pt-pin{margin-top:6px;padding:6px 8px;border:1px solid #3a3f4a;border-radius:6px;}',
        '#pt-card .pt-pin-head{display:flex;justify-content:space-between;align-items:center;gap:6px;}',
        '#pt-card .pt-flag{display:block;margin:2px 0;color:#f5b462;text-align:left;font-size:12px;}',
        '#pt-card .pt-sub{margin-top:6px;color:#9aa3b2;font-size:12px;}',
        '#pt-card .pt-flash{min-height:16px;margin-top:4px;color:#8fd1a8;font-size:12px;}',
        '#pt-card .pt-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;}',
        '#pt-card .pt-mid{color:#9aa3b2;font-size:12px;}',
        '#pt-card .pt-offline-bar{display:none;margin-top:8px;padding:5px 8px;border-radius:6px;background:#5a1f26;font-size:12px;}',
        '#pt-card.pt-offline .pt-offline-bar{display:block;}',
        '#pt-ring,#pt-row-ring,#pt-pin-ring{position:fixed;z-index:' + (Z - 2) + ';pointer-events:none;border-radius:8px;display:none;}',
        '#pt-ring{border:2px solid #ff4fa3;box-shadow:0 0 0 3px rgba(255,79,163,.25),0 0 22px rgba(255,79,163,.35);}',
        '#pt-row-ring{z-index:' + (Z - 1) + ';border:2px solid #57a6ff;box-shadow:0 0 0 2px rgba(87,166,255,.3);border-radius:5px;}',
        '#pt-pin-ring{z-index:' + (Z - 1) + ';border:2px dashed #ffd23f;background:rgba(255,210,63,.08);border-radius:4px;}',
        'body.pt-pinning,body.pt-pinning *{cursor:crosshair !important;}',
        '#pt-pill{position:fixed;z-index:' + Z + ';right:16px;bottom:56px;display:none;padding:6px 12px;border-radius:999px;background:#ff4fa3;color:#1a0b13;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.45);border:0;}',
        '@media (forced-colors: active){#pt-ring,#pt-row-ring,#pt-pin-ring{border-color:Highlight;}}'
    ].join('\n');

    // ── keys ──
    function onKey(e) {
        if (!card) return;
        if (pinning && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endPin(); return; }
        // Typing in the card never reaches the app's hotkeys or a dialog's
        // own Tab / Esc handling (js/00b listens on document, capturing).
        var inCard = card.contains(e.target);
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            var k = e.key, s = STOPS[idx], hit = true;
            if (k === 'ArrowRight') show(idx + 1);
            else if (k === 'ArrowLeft') show(idx - 1);
            else if (k === 'ArrowDown') stepRow(1);
            else if (k === 'ArrowUp') stepRow(-1);
            else if (k === 'p' || k === 'P') pinMode();
            else if (k === 'h' || k === 'H') { if (card.style.display === 'none') restore(); else minimise(); }
            else if ((k === '1' || k === '2' || k === '3' || k === '4') && s && !s.noVerdict) {
                var v = ['love', 'polish', 'kill', 'later'][parseInt(k, 10) - 1];
                if (rowIdx >= 0 && rows[rowIdx]) {
                    var a = answer(s.id), sel = selOf(rows[rowIdx]);
                    var p = a.pins.filter(function (q) { return q.row && q.sel === sel; })[0];
                    if (!p) { p = { row: true, sel: sel, label: labelOf(rows[rowIdx]), verdict: '', note: '' }; a.pins.push(p); }
                    p.verdict = v; p.state = stateTag(); save();
                    if (v === 'love') stepRow(1); else render();
                } else { answer(s.id).verdict = v; save(); render(); }
            } else hit = false;
            if (hit) { e.preventDefault(); e.stopPropagation(); return; }
        }
        if (inCard) e.stopPropagation();
    }

    // ── start ──
    var pollT = 0, posT = 0;
    function start() {
        var m = /[?&]tour(?:=(\d+))?(?:&|$)/.exec(location.search);
        if (!m) return;
        var tries = 0;
        (function wait() {
            // Wait for the built UI and for the PhotoSafe warning to be answered.
            var strip = document.getElementById('mixer-strip');
            var entering = !strip || !window.Sidebars || !window.Sidebars.sections || (strip.classList.contains('ui-enter') && !strip.classList.contains('ui-settled'));
            var pw = document.getElementById('photoWarn');
            var warn = pw && !pw.hidden && shown(pw);
            var fork = document.getElementById('uiForkModal');
            if ((entering || warn || (fork && shown(fork))) && tries++ < 480) { setTimeout(wait, 250); return; }
            load().then(function () {
                STOPS = buildStops();
                if (m[1]) idx = parseInt(m[1], 10) - 1;
                var st = h('style'); st.id = 'pt-style'; st.textContent = CSS; document.head.appendChild(st);
                ring = h('div'); ring.id = 'pt-ring'; document.body.appendChild(ring);
                rowRing = h('div'); rowRing.id = 'pt-row-ring'; document.body.appendChild(rowRing);
                pinRing = h('div'); pinRing.id = 'pt-pin-ring'; document.body.appendChild(pinRing);
                pill = h('button'); pill.id = 'pt-pill'; pill.type = 'button'; pill.onclick = restore; document.body.appendChild(pill);
                card = h('div'); card.id = 'pt-card';
                // A stop can open a dialog that holds the keyboard (js/00b): it
                // lets another aria-modal box keep focus, and the card is one.
                card.setAttribute('role', 'dialog');
                card.setAttribute('aria-modal', 'true');
                card.setAttribute('aria-label', 'Polish tour');
                card.style.top = '64px'; card.style.right = '16px';
                document.body.appendChild(card);
                ['keydown', 'keyup', 'keypress'].forEach(function (t) { window.addEventListener(t, function (e) { if (t === 'keydown') onKey(e); else if (card && card.contains(e.target)) e.stopPropagation(); }, true); });
                window.addEventListener('resize', reposition);
                document.addEventListener('scroll', reposition, true);
                // Drawers glide and bars fold under the ring: a slow re-place
                // keeps it honest without a frame loop.
                posT = setInterval(reposition, 300);
                pollT = setInterval(pollReplies, 4000);
                pollReplies();
                show(idx);
            });
        })();
    }
    window.PolishTour = { show: function (n) { show(n - 1); }, stops: function () { return STOPS.map(function (s) { return s.id; }); }, rows: function () { return rows.map(labelOf); } };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
