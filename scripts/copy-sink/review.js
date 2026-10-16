// The copy sink's review tour: an onboarding-style walk through the lines that
// need Gabriel's call, each one ringed where it lives in the app. Loaded into
// the APP page only when the sink serves it (scripts/copy-sink.js injects the
// tag beside locate.js), so nothing here ships. Open
// http://127.0.0.1:3998/?review (?review=5 jumps to stop 5). A query, not a
// hash: the app joins any #CODE as a room on load, and #review is six letters.
// Answers stay in this browser's localStorage; the list at the end is what
// gets pasted back.
(function () {
    'use strict';
    var KEY = 'copySink.review.2026-10-15.v1';
    var Z = 2147483647;

    function $(sel) { return document.querySelector(sel); }
    function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0; }
    // Visible matches first: the same title can sit on a hidden twin.
    function pick(list) {
        var arr = Array.prototype.slice.call(list), i;
        for (i = 0; i < arr.length; i++) if (visible(arr[i])) return arr[i];
        return arr[0] || null;
    }
    function byTitle(start) {
        return pick(Array.prototype.filter.call(document.querySelectorAll('[title]'), function (el) {
            return el.getAttribute('title').indexOf(start) === 0;
        }));
    }
    function byText(sel, text) {
        return pick(Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
            return el.textContent.replace(/\s+/g, ' ').trim() === text;
        }));
    }
    // Opens the folded sidebar and the collapsed section a control sits in.
    // The sidebar folds back when the tour moves on (sections stay open).
    function openSection(el) {
        if (!el || !el.closest) return;
        var S = window.Sidebars || {};
        ['left', 'right'].forEach(function (side) {
            var bar = S[side];
            if (bar && bar.el && bar.el.contains(el) && bar.isCollapsed()) {
                bar.fold(false);
                undo.push(function () { if (bar.restore) bar.restore(); else bar.fold(true); });
            }
        });
        var sec = el.closest('.sidebar-section');
        if (sec && sec.classList.contains('collapsed')) {
            if (window.openSidebarSection) window.openSidebarSection(sec);
            else { var h = sec.querySelector('.section-header'); if (h) h.click(); }
        }
        if (el && el.closest && el.closest('#mixer-more-panel') && window.StripMore) {
            try { window.StripMore.open(); } catch (_) {}
        }
    }
    // Shows a panel that is hidden because its feature is off, without turning
    // the feature on. Undone when the tour moves on.
    function peek(el) {
        var undo = [];
        for (var p = el; p && p !== document.body; p = p.parentElement) {
            if (p.hidden) {
                p.hidden = false;
                undo.push((function (n) { return function () { n.hidden = true; }; })(p));
            }
            if (getComputedStyle(p).display === 'none') {
                undo.push((function (n, was) { return function () { n.style.display = was; }; })(p, p.style.display));
                p.style.display = 'block';
            }
        }
        return function () { while (undo.length) undo.pop()(); };
    }
    function tipFold(open) {
        var head = $('[aria-controls="brushTipFoldBody"]');
        if (!head) return function () {};
        var was = head.getAttribute('aria-expanded') === 'true';
        if (was !== open) head.click();
        return function () { if ((head.getAttribute('aria-expanded') === 'true') !== was) head.click(); };
    }
    function brushSection() { openSection($('[aria-controls="brushTipFoldBody"]')); }
    function tile(glyph) {
        var body = document.getElementById('brushTipFoldBody');
        return body ? byText('#brushTipFoldBody button', glyph) : null;
    }
    function titleOf(el) { return el ? (el.getAttribute('title') || '(no tooltip)') : '(not built yet)'; }

    // ── The stops ──
    // find: the control to ring. live: what it says right now (re-read on every
    // visit, so a rewrite in the sink shows up after a reload). text: words
    // that are not on screen. prep: puts the app in the state that shows the
    // control and returns its undo.
    var STOPS = [
        {
            title: 'The Fluid slider’s tooltip names the wrong setting',
            where: 'Top bar › Fluid, with Material set to Fluid',
            files: 'js/29-material-modes.js:255 and :314 · top-bar tip: js/20-mixer-layout.js CHANNEL_TOOLTIPS ‘Fluid’',
            find: function () { return document.getElementById('curl'); },
            live: function (el) {
                var tip = byTitle('Material Types');
                return [['Slider tooltip', titleOf(el)], ['Top-bar tip', tip ? titleOf(tip) : 'Material Types: Fluid/Vorticity, Paint/Wetness, Paint/Thickness.']];
            },
            why: 'In Fluid mode this slider is Vorticity. Both lines you rewrote run in Fluid mode: one at startup (now “Thickness”), one after a preset loads (now “Wetness”). They aren’t one line per material. The Paint materials name the slider themselves: Paint (Wet) calls it “Flow” and Paint (Thick) “Thickness”. So the top-bar tip’s “Paint/Wetness” names a slider that is called Flow.',
            hover: true
        },
        {
            title: 'Two brush tips swap the name “Chisel”',
            where: 'Brush › Tip (the five tip tiles)',
            files: 'js/20-mixer-layout.js BRUSH_TIPS',
            prep: function () { brushSection(); return tipFold(true); },
            find: function () { return tile('▬') || byTitle('Chisel brush'); },
            live: function () {
                return [['■ on screen: Chisel. Tooltip', titleOf(tile('■'))], ['▬ on screen: Streak. Tooltip', titleOf(tile('▬'))]];
            },
            why: 'On screen the tips are named Soft, Blob, Chisel, Streak and Ring (the Tip header and the Multi-Brush arm rows show the name). Your tooltips call ■ (named Chisel) “Square brush” and ▬ (named Streak) “Chisel brush”. So “Chisel” points at two different tiles. Either change the tooltips or rename the tips.',
            hover: true
        },
        {
            title: 'Filter hint names a slider that isn’t there, and Instant Roto',
            where: 'Mask editor › Filter tab',
            files: 'js/15-layer-masking.js:383',
            find: function () { return $('#filterPanel .mask-filter-hint') || byText('button', 'From Image'); },
            live: function () {
                var h = $('#filterPanel .mask-filter-hint');
                return [['Text', h ? h.textContent.replace(/\s+/g, ' ').trim()
                    : 'Set the background color, then use the slider to raise filter value to cut everything out from that background color. For instant roto, left click to select the object you want it to mask (mixed results, but works for some objects)']];
            },
            why: 'The slider right under this text is labelled “Cut amount”, not “filter value”. And this text only shows while the Filter tab is picked, where a left click doesn’t run Instant Roto. Instant Roto is its own tab beside Filter.',
            away: 'The ring is on the way in: Layers › From Image, pick a picture, then the Filter tab.'
        },
        {
            title: 'The depth download says it is the Instant Roto model',
            where: 'The download box for the depth model',
            files: 'js/23-depth-collision.js:209',
            text: [['Text', 'First-time setup: Downloading Instant Roto Model Depth Anything V2...'], ['Heading above it', 'Downloading Depth Model']],
            why: 'Depth Anything is the model for depth colliders. Instant Roto uses a different model (EdgeTAM), and its own download box says so. This box is rare: it only opens when an old depth collider is refreshed, or an old preset with one loads.',
            away: 'Not on screen: nothing in a normal session opens this box.'
        },
        {
            title: 'Swirl says it pulls paint in',
            where: 'Brush › Pressure › Swirl',
            files: 'js/20-mixer-layout.js (Swirl button title)',
            prep: function () {
                var BT = window.BrushType;
                if (!BT) return null;
                var was = BT.get();
                if (was !== 'pressure') BT.set('pressure');
                brushSection();
                return function () { if (BT.get() !== was) BT.set(was); };
            },
            find: function () { return byTitle('Swirls paint'); },
            live: function (el) { return [['Tooltip', titleOf(el)]]; },
            why: 'Swirl only spins paint around the brush. It has no pull toward it; pulling paint toward the brush is Gather.',
            note: 'The tour switched the brush to Pressure to show this. It switches back when you move on.',
            hover: true
        },
        {
            title: 'One option’s words sit on the whole dropdown',
            where: 'Effects › Breathing › Color',
            files: 'index.html:1171',
            find: function () { return document.getElementById('breathColorMode'); },
            reveal: true,
            live: function (el) {
                var lab = $('label[for="breathColorMode"]');
                return [['Dropdown tooltip', titleOf(el)], ['Label tooltip', titleOf(lab)]];
            },
            why: 'This tooltip sits on the dropdown itself, so hovering it says “Color stays the same” even when “Changes each breath” is picked.',
            note: 'Breathing’s panel is shown without turning Breathing on. It hides again when you move on.',
            hover: true
        },
        {
            title: 'Mouse Buttons: the pen window doesn’t follow Left',
            where: 'Stroke and replay › Mouse Buttons',
            files: 'js/20-mixer-layout.js (Mouse Buttons title)',
            find: function () { return byTitle('Controls for left mouse'); },
            live: function (el) { return [['Tooltip', titleOf(el)]]; },
            why: 'The old line was about touchscreens: they have no buttons, so they use the Left Click setting. The pen window (the popout) passes real buttons: the pen tip is Left and the barrel button is Right.',
            hover: true
        },
        {
            title: 'The phone QR message ends on a colon',
            where: 'Swirl Together › Sync phone (the line under the QR code)',
            files: 'js/54-phone-pads.js:423',
            find: function () { return document.getElementById('phonePadBtn'); },
            text: [['Outside a room', 'Scan this with your phone’s camera. You can use this phone as a brush: '],
                   ['In a room', 'Scan this with your phone’s camera. You can use this phone as a brush:  In this room it paints as you, not as another artist.']],
            why: 'Outside a room nothing follows the colon. In a room the next sentence follows it, after a double space.',
            action: { label: 'Open it', run: function () { var b = document.getElementById('phonePadBtn'); if (b) b.click(); } }
        },
        {
            title: 'Ignite says click, but it runs only while held',
            where: 'Top bar › Color › Ignite',
            files: 'js/20-mixer-layout.js (Ignite title)',
            find: function () { return byText('button', 'Ignite'); },
            live: function (el) { return [['Tooltip', titleOf(el)], ['The dot beside it', titleOf($('.ch-ignite-lock'))]]; },
            why: 'Ignite runs while you hold it and stops when you let go, so a click is a blink. The small dot beside it is what keeps it on.',
            hover: true
        },
        {
            title: 'The photosensitivity tooltip lost its caveat',
            where: 'Display › Reduce flashing and rapid brightness changes',
            files: 'index.html:1054',
            find: function () { return byTitle('Photosensitivity protection'); },
            live: function (el) { return [['Tooltip', titleOf(el)]]; },
            why: 'The old text ended “It lowers the risk; it does not remove it.” The startup warning still says that, so this is lower stakes: your call whether the setting repeats it. Also, “slow rate of brightness change” reads oddly next to “reduces rapid flashes”.',
            hover: true
        },
        {
            title: '“Clear all local data?” undersells what it wipes',
            where: 'Desktop app, Ctrl+Shift+D',
            files: 'js/04f-canvas-actions.js:697',
            text: [['Now', 'This wipes settings, and reloads. (only presets saved to your Preset folder survive and come back on next launch)'],
                   ['Before', 'This wipes settings and the in-app preset list, and reloads. Presets saved to your Preset Vault folder survive and come back on next launch — anything not in the vault is lost.']],
            why: 'It clears all of the app’s local storage: settings, plus the in-app preset list, palettes, hotkeys and the rest. The new line only says “settings”. There’s no undo, so the question should name what goes.',
            away: 'Not shown here, and don’t press Ctrl+Shift+D to look: it really wipes.'
        },
        {
            title: '“From the settings menu”: the angle lives in Brush',
            where: 'Multi-Brush › Same angle on every arm',
            files: 'index.html:902',
            find: function () { return document.getElementById('symmetrySameAngleGroup'); },
            reveal: true,
            live: function (el) { return [['Tooltip', titleOf(el)]]; },
            why: 'The brush’s angle is the Angle slider in the Brush section, not anything in Settings.',
            hover: true
        },
        {
            title: 'Two places called by names the app never shows',
            where: 'Brush › Tip (ringed) is the place both lines mean',
            files: 'js/20-mixer-layout.js (‘Brush Tips panel’, ‘brush drawer’, ‘Click to hide Brush Tips’)',
            prep: function () { brushSection(); return null; },
            find: function () { return $('[aria-controls="brushTipFoldBody"]'); },
            live: function (el) {
                return [['Alternate brush shapes (Stroke and replay)', 'Shapes come from the Brush Tips panel'],
                        ['Pressure arm (Multi-Brush › an arm’s tip)', 'Convert to Pressure arm that pushes paint. Uses the mode and Strength set in the brush drawer.'],
                        ['This header’s tooltip', titleOf(el)]];
            },
            why: 'On screen this place is “Tip”, inside the Brush section. “Brush Tips panel” and “brush drawer” (the code’s name for the Brush section) are names a player never sees.'
        },
        {
            title: 'The gravity pad readout has two wordings',
            where: 'Effects › Gravity Direction, under the pad',
            files: 'index.html:1135 · js/20-mixer-layout.js (pad label)',
            find: function () { return document.getElementById('pressurePadRead'); },
            reveal: true,
            live: function (el) { return [['Showing now', el.textContent.trim()]]; },
            text: [['On load', 'Centered - no gravity'], ['Once the pad is touched', 'Centered - gravity off']],
            why: 'The page starts with one, and the code writes the other as soon as the pad moves. Pick one.'
        }
    ];

    // ── State ──
    var answers = {};
    var idx = 0;
    try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); answers = saved.answers || {}; idx = saved.idx || 0; } catch (_) {}
    function save() { try { localStorage.setItem(KEY, JSON.stringify({ answers: answers, idx: idx })); } catch (_) {} }
    function answer(i) { return answers[i] || (answers[i] = { choice: '', note: '' }); }
    function answered(i) { var a = answers[i]; return !!(a && (a.choice === 'keep' || (a.choice === 'change' && a.note.trim()) || a.choice === 'later')); }

    // ── Card + spotlight ──
    var card = null, spot = null, follow = null, undo = [];
    var CSS = '' +
        '#cs-review{position:fixed;bottom:16px;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;z-index:' + Z + ';' +
        'background:#17121c;color:#eee;border:1px solid #ff3bd4;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.6);' +
        'font:13px/1.45 system-ui,sans-serif;padding:14px 16px 12px}' +
        '#cs-review *{box-sizing:border-box}' +
        '#cs-review .rv-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#c9a6c4;font-size:12px}' +
        '#cs-review .rv-head span{flex:1}' +
        '#cs-review button{font:inherit;color:#eee;background:#2b2230;border:1px solid #4a3a50;border-radius:7px;padding:5px 10px;cursor:pointer}' +
        '#cs-review button:hover{border-color:#ff3bd4}' +
        '#cs-review button.on{background:#ff3bd4;border-color:#ff3bd4;color:#1a0d18;font-weight:600}' +
        '#cs-review .rv-icon{padding:2px 8px}' +
        '#cs-review .rv-dots{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}' +
        '#cs-review .rv-dots button{width:22px;height:22px;padding:0;border-radius:50%;font-size:10px;line-height:20px;text-align:center}' +
        '#cs-review .rv-dots button.done{background:#3d2a40;border-color:#ff3bd4}' +
        '#cs-review .rv-dots button.here{outline:2px solid #fff;outline-offset:1px}' +
        '#cs-review h3{margin:0 0 4px;font-size:15px;line-height:1.3;color:#fff}' +
        '#cs-review .rv-where{color:#c9a6c4;margin-bottom:8px}' +
        '#cs-review .rv-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a88aa3;margin:8px 0 3px}' +
        '#cs-review .rv-quote{background:#0f0b12;border-left:3px solid #ff3bd4;padding:6px 8px;border-radius:4px;margin-bottom:4px;white-space:pre-wrap;word-break:break-word}' +
        '#cs-review .rv-quote b{display:block;font-weight:600;color:#c9a6c4;font-size:11px}' +
        '#cs-review .rv-note{color:#e6c35c;margin-top:6px}' +
        '#cs-review .rv-files{font:11px ui-monospace,Consolas,monospace;color:#8f7f8c;margin-top:6px}' +
        '#cs-review .rv-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}' +
        '#cs-review textarea{width:100%;min-height:64px;margin-top:6px;resize:vertical;background:#0f0b12;color:#eee;border:1px solid #4a3a50;border-radius:7px;padding:6px 8px;font:inherit}' +
        '#cs-review textarea:focus{outline:none;border-color:#ff3bd4}' +
        '#cs-review .rv-nav{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:6px}' +
        '#cs-review .rv-nav .rv-mid{color:#a88aa3;font-size:12px}' +
        '#cs-review .rv-list{min-height:260px;font:12px ui-monospace,Consolas,monospace}' +
        '#cs-review-spot{position:fixed;pointer-events:none;z-index:' + (Z - 1) + ';border:3px solid #ff3bd4;border-radius:8px;' +
        'box-shadow:0 0 0 4px rgba(255,59,212,.3),0 0 0 9999px rgba(0,0,0,.38);transition:all .15s ease}';

    function h(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function leave() {
        if (follow) { clearInterval(follow); follow = null; }
        if (spot) { spot.remove(); spot = null; }
        while (undo.length) { try { undo.pop()(); } catch (_) {} }
    }
    function spotlight(el) {
        spot = h('div'); spot.id = 'cs-review-spot';
        document.body.appendChild(spot);
        function place() {
            if (!spot) return;
            var r = el.getBoundingClientRect();
            var shown = (r.width || r.height) && el.isConnected;
            spot.style.display = shown ? 'block' : 'none';
            if (!shown) return;
            spot.style.left = (r.left - 6) + 'px';
            spot.style.top = (r.top - 6) + 'px';
            spot.style.width = (r.width + 12) + 'px';
            spot.style.height = (r.height + 12) + 'px';
            // The card docks on the side away from the control.
            if (card) {
                var right = (r.left + r.width / 2) < window.innerWidth / 2;
                card.style.left = right ? 'auto' : '16px';
                card.style.right = right ? '16px' : 'auto';
            }
        }
        place();
        follow = setInterval(place, 120);
    }
    function quote(parent, label, text) {
        var q = h('div', 'rv-quote');
        if (label) q.appendChild(h('b', '', label));
        q.appendChild(document.createTextNode(text));
        parent.appendChild(q);
    }

    function show(i) {
        leave();
        idx = Math.max(0, Math.min(STOPS.length - 1, i));
        save();
        var s = STOPS[idx];
        if (s.prep) { var u = s.prep(); if (u) undo.push(u); }
        render(s, null, false);
        // Give a section that just opened (and a brush type that just
        // changed) time to lay out before measuring.
        setTimeout(function () {
            if (STOPS[idx] !== s) return;
            var el = s.find ? s.find() : null;
            if (el) openSection(el);
            setTimeout(function () {
                if (STOPS[idx] !== s) return;
                if (el && s.reveal && !visible(el)) undo.push(peek(el));
                if (el && visible(el)) {
                    try { el.scrollIntoView({ block: 'nearest' }); } catch (_) {}
                    spotlight(el);
                }
                render(s, el, true);
            }, 350);
        }, 150);
    }

    function liveOf(s, el) {
        if (!s.live) return null;
        try { return s.live(el); } catch (_) { return null; }
    }

    function render(s, el, measured) {
        var shown = !!(el && visible(el));
        card.innerHTML = '';
        var head = h('div', 'rv-head');
        head.appendChild(h('span', '', 'Copy review · stop ' + (idx + 1) + ' of ' + STOPS.length));
        var listBtn = h('button', 'rv-icon', 'List');
        listBtn.title = 'The list to paste back to Claude';
        listBtn.onclick = summary;
        var x = h('button', 'rv-icon', '×');
        x.title = 'Close the tour (your answers are kept)';
        x.onclick = close;
        head.appendChild(listBtn); head.appendChild(x);
        card.appendChild(head);

        var dots = h('div', 'rv-dots');
        STOPS.forEach(function (_, i) {
            var d = h('button', (answered(i) ? 'done' : '') + (i === idx ? ' here' : ''), String(i + 1));
            d.title = STOPS[i].title;
            d.onclick = function () { show(i); };
            dots.appendChild(d);
        });
        card.appendChild(dots);

        card.appendChild(h('h3', '', s.title));
        card.appendChild(h('div', 'rv-where', s.where));

        var words = h('div');
        var live = (measured || !s.find) ? liveOf(s, el) : null;
        if (live) {
            words.appendChild(h('div', 'rv-label', shown ? 'On screen now' : 'The words'));
            live.forEach(function (p) { quote(words, p[0], p[1]); });
        }
        if (s.text) {
            words.appendChild(h('div', 'rv-label', live ? 'In the code' : 'The words'));
            s.text.forEach(function (p) { quote(words, p[0], p[1]); });
        }
        if (!live && !s.text && s.live) {
            words.appendChild(h('div', 'rv-label', 'On screen now'));
            quote(words, '', measured ? 'Not found on screen.' : 'Finding it…');
        }
        card.appendChild(words);

        card.appendChild(h('div', 'rv-label', 'What’s off'));
        card.appendChild(h('div', '', s.why));
        if (s.hover && shown) card.appendChild(h('div', 'rv-note', 'Hover the ringed control to see its tooltip for real.'));
        if (s.note) card.appendChild(h('div', 'rv-note', s.note));
        if (s.away && !(shown && el.closest('#filterPanel'))) card.appendChild(h('div', 'rv-note', s.away));
        if (measured && s.find && !shown && !s.away) card.appendChild(h('div', 'rv-note', 'It is hidden right now (a closed popup or panel).'));
        card.appendChild(h('div', 'rv-files', s.files));
        if (s.action) {
            var row = h('div', 'rv-row');
            var act = h('button', '', s.action.label);
            act.onclick = function () { s.action.run(); };
            row.appendChild(act);
            card.appendChild(row);
        }

        card.appendChild(h('div', 'rv-label', 'Your call'));
        var a = answer(idx);
        var choices = h('div', 'rv-row');
        var ta = h('textarea');
        ta.placeholder = 'New wording, or a note for Claude';
        ta.value = a.note;
        [['keep', 'Keep as is'], ['change', 'Change it'], ['later', 'Not sure yet']].forEach(function (c) {
            var b = h('button', a.choice === c[0] ? 'on' : '', c[1]);
            b.onclick = function () {
                a.choice = c[0]; save();
                Array.prototype.forEach.call(choices.children, function (k) { k.classList.toggle('on', k === b); });
                if (c[0] === 'change') ta.focus();
                refreshDots();
            };
            choices.appendChild(b);
        });
        ta.addEventListener('input', function () {
            a.note = ta.value;
            if (!a.choice && ta.value.trim()) {
                a.choice = 'change';
                choices.children[1].classList.add('on');
            }
            save();
            refreshDots();
        });
        card.appendChild(choices);
        card.appendChild(ta);

        var nav = h('div', 'rv-nav');
        var back = h('button', '', '← Back');
        back.disabled = idx === 0;
        back.onclick = function () { show(idx - 1); };
        var done = STOPS.filter(function (_, i) { return answered(i); }).length;
        var mid = h('span', 'rv-mid', done + ' of ' + STOPS.length + ' answered');
        var last = idx === STOPS.length - 1;
        var next = h('button', 'on', last ? 'Finish' : 'Next →');
        next.onclick = function () { if (last) summary(); else show(idx + 1); };
        nav.appendChild(back); nav.appendChild(mid); nav.appendChild(next);
        card.appendChild(nav);

        function refreshDots() {
            Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('done', answered(i)); });
            mid.textContent = STOPS.filter(function (_, i) { return answered(i); }).length + ' of ' + STOPS.length + ' answered';
        }
    }

    function listText() {
        var out = ['Copy review, ' + STOPS.length + ' stops'];
        STOPS.forEach(function (s, i) {
            var a = answers[i] || { choice: '', note: '' };
            var el = null;
            try { el = s.find ? s.find() : null; } catch (_) {}
            var pairs = liveOf(s, el) || s.text;
            var now = pairs ? String(pairs[0][1]) : '';
            if (now.length > 160) now = now.slice(0, 157) + '...';
            out.push('');
            out.push((i + 1) + '. ' + s.title + ' [' + s.files + ']');
            if (now) out.push('   Now: "' + now.trim() + '"');
            var said = a.note.trim();
            if (a.choice === 'keep') out.push('   -> Keep as is' + (said ? ': ' + said : ''));
            else if (a.choice === 'later') out.push('   -> Not sure yet' + (said ? ': ' + said : ''));
            else if (said) out.push('   -> Change: ' + said);
            else out.push('   -> (no answer)');
        });
        return out.join('\n');
    }
    function summary() {
        leave();
        card.style.left = 'auto'; card.style.right = '16px';
        card.innerHTML = '';
        var head = h('div', 'rv-head');
        head.appendChild(h('span', '', 'Copy review · your list'));
        var x = h('button', 'rv-icon', '×');
        x.title = 'Close the tour (your answers are kept)';
        x.onclick = close;
        head.appendChild(x);
        card.appendChild(head);
        var done = STOPS.filter(function (_, i) { return answered(i); }).length;
        card.appendChild(h('h3', '', done + ' of ' + STOPS.length + ' answered'));
        card.appendChild(h('div', 'rv-where', 'Copy this and paste it into the chat with Claude.'));
        var ta = h('textarea', 'rv-list');
        ta.readOnly = true;
        ta.value = listText();
        card.appendChild(ta);
        var nav = h('div', 'rv-nav');
        var back = h('button', '', '← Back to the stops');
        back.onclick = function () { show(idx); };
        var copy = h('button', 'on', 'Copy list');
        copy.onclick = function () {
            function ok() { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy list'; }, 1500); }
            try {
                navigator.clipboard.writeText(ta.value).then(ok, function () { ta.select(); document.execCommand('copy'); ok(); });
            } catch (_) { ta.select(); document.execCommand('copy'); ok(); }
        };
        nav.appendChild(back); nav.appendChild(copy);
        card.appendChild(nav);
    }

    function close() {
        leave();
        if (card) { card.remove(); card = null; }
        var q = location.search.replace(/([?&])review(=\d*)?(&|$)/, '$1').replace(/[?&]$/, '');
        history.replaceState(null, '', location.pathname + q + location.hash);
    }

    function start() {
        var m = /[?&]review(?:=(\d+))?(?:&|$)/.exec(location.search);
        if (!m) return;
        var tries = 0;
        (function wait() {
            // Same settle rule as locate.js, plus the startup photosensitivity
            // warning: the tour waits until that is answered.
            var strip = document.getElementById('mixer-strip');
            var entering = !strip || (strip.classList.contains('ui-enter') && !strip.classList.contains('ui-settled'));
            var pw = document.getElementById('photoWarn');
            var warn = pw && !pw.hidden && visible(pw);
            if ((entering || warn) && tries++ < 240) { setTimeout(wait, 250); return; }
            if (!document.getElementById('cs-review-style')) {
                var st = h('style'); st.id = 'cs-review-style'; st.textContent = CSS;
                document.head.appendChild(st);
            }
            if (!card) {
                card = h('div'); card.id = 'cs-review';
                card.style.right = '16px';
                // Typing in the card must not reach the app's hotkeys.
                ['keydown', 'keyup', 'keypress'].forEach(function (t) {
                    card.addEventListener(t, function (e) { e.stopPropagation(); });
                });
                document.body.appendChild(card);
            }
            show(m[1] ? parseInt(m[1], 10) - 1 : idx);
        })();
    }
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
