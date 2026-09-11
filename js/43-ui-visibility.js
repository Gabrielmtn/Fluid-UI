// ═══════════════════════════════════════════════════════════════════
// js/43-ui-visibility.js — which parts of the interface are on screen.
// LOAD ORDER: after 20-mixer-layout.js (it works on the built strip and
//   sidebar, and mounts its own controls inside the Settings section).
// PROVIDES: window.UIVisibility
//   - per-section show/hide for every sidebar section, every mixer-strip
//     channel and the quality underbar, persisted per user;
//   - two named presets: Simple (Presets + Mutate, nothing else) and
//     Everything (the whole mixer);
//   - the Settings → Interface block: the Simple|Everything switch and the
//     "Visible sections" checkbox combo box that brings anything back;
//   - the one-time startup fork: on a profile that has never chosen, a
//     modal after the PhotoSafe warning asks Simple or Everything.
//
// Hiding is display:none on the built elements (class .ui-hidden, rule in
// css/22-overlays.css). Nothing is removed from the DOM, so every id, hotkey,
// preset, replay and multiplayer path keeps working underneath — a hidden
// section is a section you are not looking at, not a feature that is off.
//
// Persistence is settingsManager only (ui.hiddenSections, ui.layoutChoice):
// these are workspace preferences, not look parameters, so they are not in
// ParamRegistry and can never ride a preset, a vault file or the multiplayer
// look mirror.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var KEY_HIDDEN = 'ui.hiddenSections';   // array of item keys that are hidden
    var KEY_CHOICE = 'ui.layoutChoice';     // 'simple' | 'full' once the fork was answered
    var EVT_CHOSEN = 'fluidui:layout-chosen';
    var LS_SKIP_FORK = 'fluidui.uiFork.skip'; // harness/bake escape hatch: '1' = never show the fork
    // The once-flag lives OUTSIDE the settingsManager namespace on purpose:
    // Settings → Clear and the nuclear reset wipe every 'fluidUI:' key, and a
    // question answered once must not come back because the sliders were
    // reset. Same reasoning as the PhotoSafe ack (index.html). The chosen mode
    // itself stays a setting (ui.layoutChoice), so it resets with the rest.
    var LS_FORK_ACK = 'fluidui.uiFork.ack.v1';

    // What Simple keeps on screen. Everything else is hidden.
    var SIMPLE_KEEP = { 'section:Mutate shader': true, 'strip:Presets': true };
    // Never hideable: Settings is the way back, and the ? cell is how you
    // find what Simple hid.
    var PINNED = { 'section:Settings': true, 'strip:Help': true };

    var items = [];            // [{ key, kind, label, el }] in on-screen order
    var hidden = {};           // key -> true
    var ready = false;         // registry built and applied once
    var forkPending = false;   // true until the startup question is answered (or waived)
    var block = null;          // the Settings → Interface block
    var forkModal = null;

    var sm = function () { return window.settingsManager || null; };

    // ── Persistence ───────────────────────────────────────────────────
    function loadHidden() {
        hidden = {};
        var m = sm(); if (!m) return;
        var arr = m.get(KEY_HIDDEN, null);
        if (Array.isArray(arr)) arr.forEach(function (k) { if (typeof k === 'string') hidden[k] = true; });
    }
    function saveHidden() {
        var m = sm(); if (!m) return;
        m.set(KEY_HIDDEN, Object.keys(hidden).filter(function (k) { return hidden[k]; }));
    }
    function savedChoice() {
        var m = sm(); if (!m) return null;
        var c = m.get(KEY_CHOICE, null);
        return (c === 'simple' || c === 'full') ? c : null;
    }

    // ── Registry ──────────────────────────────────────────────────────
    // Keys are stable across boots because they are the labels the user
    // sees: 'strip:Brush Size', 'section:Simulation', 'chrome:Quality bar'.
    // A section that is renamed simply comes back visible — the safe default.
    function collect() {
        items = [];
        var strip = document.getElementById('mixer-strip');
        if (strip) {
            // A fader the bar could not fit at this width is parked in the
            // More panel (46-strip-more), not a strip child — take the
            // canonical list so it still shows up here, in its slot.
            var kids = (window.StripMore && typeof window.StripMore.stripChildren === 'function'
                        && window.StripMore.stripChildren())
                    || Array.prototype.slice.call(strip.children);
            kids.forEach(function (el) {
                if (el.classList.contains('mixer-divider')) return;
                var k = el.dataset && el.dataset.uiKey;
                if (!k) return;                         // unlabelled child: leave it alone
                items.push({ key: 'strip:' + k, kind: 'strip', label: k, el: el });
            });
        }
        var sidebar = document.getElementById('sidebar-right');
        if (sidebar) {
            Array.prototype.forEach.call(sidebar.children, function (sec) {
                if (!sec.classList || !sec.classList.contains('sidebar-section')) return;
                var t = sec.querySelector('.section-title');
                var title = t ? t.textContent.trim() : '';
                if (!title) return;
                items.push({ key: 'section:' + title, kind: 'section', label: title, el: sec });
            });
        }
        var ub = document.getElementById('quality-underbar');
        if (ub) items.push({ key: 'chrome:Quality bar', kind: 'chrome', label: 'Quality bar', el: ub });
    }

    function byKey(key) {
        for (var i = 0; i < items.length; i++) if (items[i].key === key) return items[i];
        return null;
    }

    // ── Applying ──────────────────────────────────────────────────────
    function apply() {
        var barFlipped = false, sectionCollapsed = false;
        items.forEach(function (it) {
            var hide = !!hidden[it.key] && !PINNED[it.key];
            if (it.el.classList.contains('ui-hidden') !== hide) {
                it.el.classList.toggle('ui-hidden', hide);
                if (it.kind === 'chrome') barFlipped = true;
                if (hide && onHidden(it)) sectionCollapsed = true;
            }
        });
        fixDividers();
        fixEmptyStrip();
        restampGroups();
        if (sectionCollapsed) persistCollapse();
        if (barFlipped) refitCanvas();
        syncBlock();
    }

    // The quality bar is position:fixed over the bottom of the canvas area,
    // and 01-config's fitter reserves that band only while the bar is shown
    // (canvasUsableBox). Nothing re-fits on its own when it goes — the only
    // observer watches #canvas-area, whose size never changed — so the canvas
    // would keep a dead strip at the bottom (or run under the bar when it
    // comes back). Same call, same pinned-size rule as the post-build fit in
    // 20-mixer-layout.
    function refitCanvas() {
        if (typeof window.fitCanvasIntoArea !== 'function') return;
        var pinned = typeof window.canvasHasPinnedSize === 'function' && window.canvasHasPinnedSize();
        try { window.fitCanvasIntoArea({ fill: !pinned }); } catch (_) {}
    }

    // Mirror of 20-mixer-layout's persistSectionState (same key, same shape:
    // title -> collapsed). Hiding collapses a section so the accordion sees it
    // closed; without writing that down, 12-save-load's boot restore would
    // re-expand it invisibly on the next launch.
    function persistCollapse() {
        var m = sm(); if (!m) return;
        try {
            var out = {};
            Array.prototype.forEach.call(document.querySelectorAll('#sidebar-right .sidebar-section'), function (sec) {
                var t = sec.querySelector('.section-title');
                if (t) out[t.textContent.trim()] = sec.classList.contains('collapsed');
            });
            m.set('sidebar.sections', out);
        } catch (_) {}
    }

    // A hidden strip channel must not leave its body-mounted popup behind:
    // the brush drawer, the tip menu, arm colours and the presets list all
    // open from triggers INSIDE a channel, and with the trigger gone there is
    // no visible way to close them — the next window resize would even
    // re-anchor them off a zero rect into the top-left corner. Each popup's
    // trigger toggles it and owns the .active class its gear mirrors, and a
    // click() lands on a display:none node, so the trigger IS the close path.
    // Same for a section: an expanded body that is now invisible still counts
    // as "open" to the accordion, so collapse it. Returns true when a section
    // was collapsed here (the caller persists that).
    var POPUP_TRIGGERS = '.ch-label.active, .ch-tip-swatch.active, #multiplierValue.active, #mixerPresetsTrigger.active';
    function onHidden(it) {
        if (it.kind === 'strip') {
            Array.prototype.forEach.call(it.el.querySelectorAll(POPUP_TRIGGERS), function (t) {
                try { t.click(); } catch (_) {}
            });
            return false;
        }
        if (it.kind === 'section' && !it.el.classList.contains('collapsed')) {
            it.el.classList.add('collapsed');
            return true;
        }
        return false;
    }

    // A divider earns its place only between two visible channels. Walk the
    // strip forward (hide any divider that has nothing visible before it, or
    // whose previous visible neighbour is another divider), then backward
    // for the trailing ones.
    function fixDividers() {
        var strip = document.getElementById('mixer-strip'); if (!strip) return;
        var kids = Array.prototype.slice.call(strip.children);
        var prevIsContent = false;
        kids.forEach(function (el) {
            if (el.classList.contains('mixer-divider')) {
                var hide = !prevIsContent;
                el.classList.toggle('ui-hidden', hide);
                if (!hide) prevIsContent = false;
            } else if (!el.classList.contains('ui-hidden')) {
                prevIsContent = true;
            }
        });
        for (var i = kids.length - 1; i >= 0; i--) {
            var k = kids[i];
            if (k.classList.contains('ui-hidden')) continue;
            if (k.classList.contains('mixer-divider')) { k.classList.add('ui-hidden'); continue; }
            break;
        }
    }

    // An empty top bar is a 1px line with a shadow — hide the bar itself.
    function fixEmptyStrip() {
        var strip = document.getElementById('mixer-strip'); if (!strip) return;
        var any = Array.prototype.some.call(strip.children, function (el) {
            return !el.classList.contains('ui-hidden') && !el.classList.contains('mixer-divider');
        });
        strip.classList.toggle('ui-hidden', !any);
    }

    // The sidebar paints one colour ramp per group across its section labels
    // (css/21-sidebar.css), sized by --rows and sliced by --i, which
    // 20-mixer-layout stamps at build for ALL sections. With some hidden the
    // visible labels would show non-contiguous slices of a ramp sized for
    // rows that are not there, so re-stamp over the visible ones only.
    function restampGroups() {
        var sidebar = document.getElementById('sidebar-right'); if (!sidebar) return;
        var byGroup = {};
        Array.prototype.forEach.call(sidebar.querySelectorAll('.sidebar-section[data-group]'), function (sec) {
            if (sec.classList.contains('ui-hidden')) return;
            (byGroup[sec.dataset.group] = byGroup[sec.dataset.group] || []).push(sec);
        });
        Object.keys(byGroup).forEach(function (g) {
            var run = byGroup[g];
            run.forEach(function (sec, i) {
                sec.style.setProperty('--rows', run.length);
                sec.style.setProperty('--i', i);
            });
        });
    }

    // ── Presets ───────────────────────────────────────────────────────
    function presetHidden(name) {
        var out = {};
        if (name === 'simple') {
            items.forEach(function (it) {
                if (!PINNED[it.key] && !SIMPLE_KEEP[it.key]) out[it.key] = true;
            });
        }
        return out;   // 'full' hides nothing
    }

    // 'simple' | 'full' | 'custom' — what the current hidden set amounts to.
    function currentPreset() {
        var want = presetHidden('simple');
        var isSimple = true, isFull = true;
        items.forEach(function (it) {
            if (PINNED[it.key]) return;
            var h = !!hidden[it.key];
            if (h) isFull = false;
            if (h !== !!want[it.key]) isSimple = false;
        });
        return isFull ? 'full' : (isSimple ? 'simple' : 'custom');
    }

    function applyPreset(name, opts) {
        opts = opts || {};
        if (name !== 'simple' && name !== 'full') return false;
        hidden = presetHidden(name);
        if (ready) apply();
        saveHidden();
        if (opts.persistChoice !== false) {
            var m = sm(); if (m) m.set(KEY_CHOICE, name);
            try { localStorage.setItem(LS_FORK_ACK, '1'); } catch (_) {}
        }
        return true;
    }

    function setHidden(key, hide) {
        var it = byKey(key);
        if (!it || PINNED[key]) return false;
        if (hide) hidden[key] = true; else delete hidden[key];
        apply();
        saveHidden();
        return true;
    }

    // ── Settings → Interface block ────────────────────────────────────
    function findSection(title) {
        var sidebar = document.getElementById('sidebar-right'); if (!sidebar) return null;
        var secs = sidebar.querySelectorAll('.sidebar-section');
        for (var i = 0; i < secs.length; i++) {
            var t = secs[i].querySelector('.section-title');
            if (t && t.textContent.trim() === title) return secs[i];
        }
        return null;
    }

    function mountBlock() {
        if (block && block.isConnected) return;
        var sec = findSection('Settings'); if (!sec) return;
        var body = sec.querySelector('.section-body'); if (!body) return;

        block = document.createElement('div');
        block.className = 'ui-vis-block';

        var lbl = document.createElement('label');
        lbl.className = 'brush-section-label';
        lbl.textContent = 'Interface';
        block.appendChild(lbl);

        // Simple | Everything — the same two-cell switch the Mutate scope uses.
        var seg = document.createElement('div');
        seg.className = 'ch-seg-switch ui-vis-presets';
        [['simple', 'Simple', 'Presets and Mutate only. Everything else waits here, in Settings.'],
         ['full',   'Everything', 'The whole mixer: every section, every fader.']
        ].forEach(function (p) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ch-text-toggle';
            b.dataset.preset = p[0];
            b.textContent = p[1];
            b.title = p[2];
            b.addEventListener('click', function () { applyPreset(p[0]); });
            seg.appendChild(b);
        });
        block.appendChild(seg);

        // The combo box: a trigger that folds a checkbox list open in place.
        // In place, not a floating popup — the section body clips overflow
        // for its collapse animation, and a list that scrolls with the
        // sidebar is easier to work through than one pinned over it.
        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-vis-trigger btn--block';
        trigger.setAttribute('aria-expanded', 'false');
        trigger.title = 'Choose which sections are on screen';
        trigger.innerHTML =
            '<span class="ui-vis-trigger-label">Visible sections</span>' +
            '<span class="ui-vis-trigger-count"></span>' +
            '<span class="ui-vis-trigger-chev">▾</span>';
        block.appendChild(trigger);

        var list = document.createElement('div');
        list.className = 'ui-vis-list';
        list.hidden = true;
        block.appendChild(list);

        trigger.addEventListener('click', function () {
            var open = list.hidden;
            list.hidden = !open;
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) renderList();
        });

        body.insertBefore(block, body.firstChild);
        renderList();
        syncBlock();
    }

    var GROUP_TITLES = { strip: 'Top bar', section: 'Sidebar', chrome: 'Corner' };

    function renderList() {
        if (!block) return;
        var list = block.querySelector('.ui-vis-list'); if (!list) return;
        list.innerHTML = '';
        var lastKind = null;
        items.forEach(function (it) {
            if (it.kind !== lastKind) {
                lastKind = it.kind;
                var h = document.createElement('div');
                h.className = 'ui-vis-group';
                h.textContent = GROUP_TITLES[it.kind] || it.kind;
                list.appendChild(h);
            }
            var row = document.createElement('label');
            row.className = 'ui-vis-row' + (PINNED[it.key] ? ' is-pinned' : '');
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            // No id on purpose: nothing in the app may sweep this into a
            // preset or a settings snapshot by id. The key rides a data attr.
            cb.dataset.uiKey = it.key;
            cb.checked = PINNED[it.key] ? true : !hidden[it.key];
            cb.disabled = !!PINNED[it.key];
            cb.addEventListener('change', function () { setHidden(it.key, !cb.checked); });
            row.appendChild(cb);
            var name = document.createElement('span');
            name.className = 'ui-vis-row-name';
            name.textContent = it.label;
            row.appendChild(name);
            if (PINNED[it.key]) {
                var hint = document.createElement('span');
                hint.className = 'ui-vis-row-hint';
                hint.textContent = 'always shown';
                row.appendChild(hint);
            }
            list.appendChild(row);
        });
    }

    function syncBlock() {
        if (!block) return;
        var preset = currentPreset();
        Array.prototype.forEach.call(block.querySelectorAll('.ui-vis-presets .ch-text-toggle'), function (b) {
            b.classList.toggle('active', b.dataset.preset === preset);
        });
        var total = 0, shown = 0;
        items.forEach(function (it) {
            total++;
            if (PINNED[it.key] || !hidden[it.key]) shown++;
        });
        var count = block.querySelector('.ui-vis-trigger-count');
        if (count) count.textContent = shown + ' / ' + total;
        var list = block.querySelector('.ui-vis-list');
        if (list && !list.hidden) {
            Array.prototype.forEach.call(list.querySelectorAll('input[data-ui-key]'), function (cb) {
                var k = cb.dataset.uiKey;
                var want = PINNED[k] ? true : !hidden[k];
                if (cb.checked !== want) cb.checked = want;
            });
        }
    }

    // ── The startup fork ──────────────────────────────────────────────
    function buildFork() {
        if (forkModal) return forkModal;
        var m = document.createElement('div');
        m.id = 'uiForkModal';
        m.className = 'delete-modal ui-fork-modal';
        // Buttons take their tint from the nearest [data-group] (01-buttons);
        // a body-mounted modal has none, so it names its own.
        m.dataset.group = 'system';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-labelledby', 'uiForkTitle');
        m.innerHTML =
            '<div class="delete-modal-content ui-fork-content">' +
                '<div class="delete-modal-title" id="uiForkTitle">How much of the mixer do you want to see?</div>' +
                '<div class="delete-modal-message">Two ways in. Pick one now; switch any time under Settings → Interface.</div>' +
                '<div class="ui-fork-cards">' +
                    '<button type="button" class="ui-fork-card" data-choice="simple">' +
                        '<span class="ui-fork-card-title">Simple</span>' +
                        '<span class="ui-fork-card-desc">Just the canvas, Presets and Mutate. Paint, pick a look, twist it. Everything else waits in Settings.</span>' +
                    '</button>' +
                    '<button type="button" class="ui-fork-card" data-choice="full">' +
                        '<span class="ui-fork-card-title">Everything</span>' +
                        '<span class="ui-fork-card-desc">The whole mixer: every section and every fader on screen from the start.</span>' +
                    '</button>' +
                '</div>' +
                '<div class="ui-fork-foot">← → to move · Enter to choose · Esc keeps Everything</div>' +
            '</div>';
        document.body.appendChild(m);
        forkModal = m;
        return m;
    }

    // Harness / bake lanes and the fatal-GPU screen never get the question.
    function forkWaived() {
        if (window.__fatalGpu || window.__skipUIFork || window.__shot || window.__test) return true;
        try { return localStorage.getItem(LS_SKIP_FORK) === '1'; } catch (_) { return false; }
    }

    function openFork() {
        if (!forkPending) return;
        if (forkWaived()) { chooseLayout(null); return; }
        var m = buildFork();
        var cards = m.querySelectorAll('.ui-fork-card');
        var done = function (choice) {
            document.removeEventListener('keydown', onKey, true);
            m.classList.remove('show');
            Array.prototype.forEach.call(cards, function (c) { c.onclick = null; });
            chooseLayout(choice);
        };
        var onKey = function (e) {
            // Document-level capture while the dialog is up: the app's hotkeys
            // also live on document, and F / Space / Esc all mean something
            // to the canvas underneath.
            var idx = Array.prototype.indexOf.call(cards, document.activeElement);
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done('full'); return; }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
                e.preventDefault(); e.stopPropagation();
                var dir = (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1;
                var n = cards.length;
                cards[((idx < 0 ? 0 : idx) + dir + n) % n].focus();
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                if (idx >= 0) done(cards[idx].dataset.choice);
                return;
            }
            e.stopPropagation();
        };
        Array.prototype.forEach.call(cards, function (c) {
            c.onclick = function () { done(c.dataset.choice); };
        });
        document.addEventListener('keydown', onKey, true);
        m.classList.add('show');
        // Simple is the recommended first path, so it takes focus; a stray
        // Enter therefore lands on the lighter interface, and Esc keeps
        // Everything, which is the interface that was there before this fork
        // existed. Both are one click away from each other in Settings.
        if (cards[0]) cards[0].focus();
    }

    // Answer the fork. choice: 'simple' | 'full' | null (waived: keep whatever
    // is on screen, persist nothing — used by bakes and test harnesses).
    function chooseLayout(choice, opts) {
        opts = opts || {};
        var wasPending = forkPending;
        forkPending = false;
        if (choice === 'simple' || choice === 'full') {
            applyPreset(choice, { persistChoice: opts.persist !== false });
            // Simple lands on two collapsed headers; open the one that does
            // something, so the first thing on screen is the Mutate button.
            if (choice === 'simple' && wasPending && typeof window.openSidebarSection === 'function') {
                window.openSidebarSection('#mutation-section');
            }
        }
        if (forkModal) forkModal.classList.remove('show');
        try { document.dispatchEvent(new CustomEvent(EVT_CHOSEN, { detail: { choice: choice, waived: choice == null } })); } catch (_) {}
    }

    // The fork waits for three things, in order: the PhotoSafe warning to be
    // answered (it owns the first frame and blocks keys app-wide until then),
    // the strip + sidebar to exist (they build ~800ms after DCL), and the
    // window to have finished fading in on the desktop build (Boot.afterReveal
    // — a dialog shown behind an invisible window burns its moment).
    function scheduleFork() {
        if (!forkPending) return;
        if (forkWaived()) { chooseLayout(null); return; }
        var tries = 0;
        (function wait() {
            if (!forkPending) return;
            if (forkWaived()) { chooseLayout(null); return; }
            var pw = document.getElementById('photoWarn');
            var built = !!document.getElementById('sidebar-right') && !!window.__scriptsReady;
            // The splash (z 99999) outlives the reveal by ~1s on the web build
            // and ~2s on the desktop title card; a dialog under it is unseen.
            var splashUp = !!document.getElementById('splash-screen');
            if ((pw && !pw.hidden) || !built || splashUp) {
                if (tries++ < 4800) setTimeout(wait, 250);   // up to 20 min: the warning can sit unanswered
                return;
            }
            var show = function () { if (forkPending) openFork(); };
            if (window.Boot && typeof window.Boot.afterReveal === 'function') window.Boot.afterReveal(show, 500);
            else setTimeout(show, 900);
        })();
    }

    // The app surfaces a section on its own in a few places — the paste path
    // opens Layers so a dropped image is seen landing. A section the user hid
    // must come back for that, not open invisibly: the intent was "look here".
    // Wrap the mixer's opener (20-mixer-layout defines it before this loads)
    // and un-hide first, persisted, so the checkbox agrees with the screen.
    function wrapOpener() {
        var orig = window.openSidebarSection;
        if (typeof orig !== 'function' || orig.__uiVisWrapped) return;
        var wrapped = function (sel) {
            var sec = (typeof sel === 'string') ? document.querySelector(sel) : sel;
            if (sec && sec.classList && sec.classList.contains('ui-hidden')) {
                var t = sec.querySelector('.section-title');
                var key = t ? 'section:' + t.textContent.trim() : null;
                if (key && hidden[key]) setHidden(key, false);
            }
            return orig.apply(this, arguments);
        };
        wrapped.__uiVisWrapped = true;
        window.openSidebarSection = wrapped;
    }

    // ── Boot ──────────────────────────────────────────────────────────
    function init() {
        if (ready) return;
        var strip = document.getElementById('mixer-strip');
        var sidebar = document.getElementById('sidebar-right');
        if (!strip || !sidebar) return;
        collect();
        loadHidden();
        ready = true;
        apply();
        mountBlock();
        wrapOpener();
        scheduleFork();
    }

    // Decided synchronously at load so anything that wants to sequence after
    // the fork (the first-run hint in 05n) can ask forkPending() right away.
    forkPending = savedChoice() === null && (function () {
        try { return localStorage.getItem(LS_FORK_ACK) !== '1'; } catch (_) { return true; }
    })();

    // The mixer layout builds on its own schedule (DCL → 800ms → rAF on the
    // web, one rAF on the desktop). Poll for it rather than hook its slot.
    (function waitForLayout() {
        var tries = 0;
        var t = setInterval(function () {
            if (document.getElementById('mixer-strip') && document.getElementById('sidebar-right')) {
                clearInterval(t);
                init();
            } else if (tries++ > 600) {  // 60s: layout never built (hidden pane etc.) — give up quietly
                clearInterval(t);
            }
        }, 100);
    })();

    window.UIVisibility = {
        // Registry + state
        list: function () {
            return items.map(function (it) {
                return { key: it.key, kind: it.kind, label: it.label, hidden: !!hidden[it.key] && !PINNED[it.key], pinned: !!PINNED[it.key] };
            });
        },
        isHidden: function (key) { return !!hidden[key] && !PINNED[key]; },
        setHidden: setHidden,
        show: function (key) { return setHidden(key, false); },
        hide: function (key) { return setHidden(key, true); },
        applyPreset: applyPreset,
        currentPreset: currentPreset,
        // The startup fork
        forkPending: function () { return forkPending; },
        showFork: function () { forkPending = true; openFork(); },
        chooseLayout: chooseLayout,
        // Re-sync after something rebuilds the strip or sidebar
        refresh: function () { if (!ready) { init(); return; } collect(); apply(); renderList(); },
        // Re-check the strip's dividers and its empty state after a
        // non-registered cell came or went (46-strip-more's More cell).
        relayout: function () { if (!ready) return; fixDividers(); fixEmptyStrip(); },
        SIMPLE_KEEP: SIMPLE_KEEP,
        EVENT: EVT_CHOSEN
    };
})();
