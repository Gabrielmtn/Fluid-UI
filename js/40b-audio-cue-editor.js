// ═══════════════════════════════════════════════════════════════════
// js/40b-audio-cue-editor.js — the cue editor in Full Audio
// LOAD ORDER: after 40-audio-timing.js (reads window.AudioTiming.editor)
//   and 22-audio-reactive.js (the transport). 20-mixer-layout.js mounts it
//   into the studio drawer's Audio tab.
// PROVIDES: window.AudioCueEditor { mount(host) }
//
// User test 3: "drastically simplify audio to be built around the timing
// tool... events which can be deleted / individually nudged into place".
// The falling chart (40) shows what is coming; this shows the WHOLE track
// left to right: its spectrogram, one row of cue ticks per lane under it,
// and the playhead. A cue is selected by clicking it, moved by dragging
// it (or the arrow keys), removed with Delete, added by double-clicking a
// row or by tapping 1-8 while the track plays. A lane's first edit
// freezes it: its detected cues become its own list, saved with the
// track; Re-detect hands it back to the detector.
//
// The spectrogram is drawn ONCE per track into an offscreen strip and
// sliced per frame, so following the playhead costs a drawImage.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var RULER_H = 14, SPEC_H = 72, GAP = 6, LANE_H = 20, PAD_B = 4;
    var HIT_PX = 6;                 // how close a click must land to a tick
    var FOLLOW_IDLE_MS = 2500;      // hands off the view for this long after you touch it
    var STRIP_MAX_W = 16384;        // offscreen spectrogram width cap
    var RAMP = [[255, 90, 80], [80, 220, 120], [150, 120, 255]];   // 40's lane ramp

    var hostEl = null, wrap = null, cv = null, hint = null, statusEl = null;
    var btn = {};
    var raf = null, lastDraw = 0;
    var view = { t0: 0, span: 20 };
    var follow = true, lastTouchMs = 0;
    var sel = [];                   // [{ lane, t }]
    var drag = null;                // { x0, dt, moved }
    var undoStack = [], redoStack = [];
    var strip = null, stripKey = '';

    function AT() { return window.AudioTiming && window.AudioTiming.editor ? window.AudioTiming.editor : null; }
    function AR() { return window.audioReactive || null; }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function duration() {
        var e = AT(), ch = e && e.chart();
        if (ch && ch.duration) return ch.duration;
        var p = AR() && AR().position ? AR().position() : null;
        return p ? p.duration : 0;
    }
    function nowT() {
        var p = AR() && AR().position ? AR().position() : null;
        var e = AT();
        return p ? p.time + (e ? e.nudgeMs() : 0) / 1000 : 0;
    }

    // ─── LAYOUT ─────────────────────────────────────────────────────
    function nLanes() { var e = AT(); return e ? e.gates().length : 0; }
    function heightFor(n) { return RULER_H + SPEC_H + GAP + Math.max(1, n) * LANE_H + PAD_B; }
    function laneTop(i) { return RULER_H + SPEC_H + GAP + i * LANE_H; }
    function xOf(t, W) { return (t - view.t0) / view.span * W; }
    function tOf(x, W) { return view.t0 + x / W * view.span; }
    function clampView() {
        var d = duration();
        view.span = clamp(view.span, 1, Math.max(1, d || 20));
        view.t0 = clamp(view.t0, 0, Math.max(0, (d || view.span) - view.span));
    }
    function touch() { lastTouchMs = performance.now(); }

    // ─── THE SPECTROGRAM STRIP ──────────────────────────────────────
    function rampAt(u) {
        var k = clamp(u, 0, 1) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(k)), f = k - i;
        var a = RAMP[i], b = RAMP[i + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    function ensureStrip(dpr) {
        var e = AT(), c = e && e.cache();
        if (!c || !c.levels) { strip = null; stripKey = ''; return null; }
        var h = Math.round(SPEC_H * dpr);
        var key = (c.key || '') + '|' + c.frames + '|' + h;
        if (strip && stripKey === key) return strip;
        var w = Math.max(1, Math.min(c.frames, STRIP_MAX_W));
        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        var g = off.getContext('2d');
        var img = g.createImageData(w, h), px = img.data, cols = c.cols, lv = c.levels;
        var colOfRow = new Int32Array(h), tint = [];
        for (var y = 0; y < h; y++) {
            var u = 1 - (y + 0.5) / h;               // bottom = 20 Hz, top = 20 kHz
            colOfRow[y] = Math.min(cols - 1, Math.floor(u * cols));
            tint.push(rampAt(u));
        }
        for (var x = 0; x < w; x++) {
            var f0 = Math.floor(x / w * c.frames), f1 = Math.max(f0 + 1, Math.floor((x + 1) / w * c.frames));
            for (var y2 = 0; y2 < h; y2++) {
                var col = colOfRow[y2], mx = 0;
                for (var f = f0; f < f1 && f < c.frames; f++) { var v = lv[f * cols + col]; if (v > mx) mx = v; }
                var k = Math.pow(mx / 255, 1.6), t = tint[y2], o = (y2 * w + x) * 4;
                px[o] = t[0] * k; px[o + 1] = t[1] * k; px[o + 2] = t[2] * k; px[o + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        strip = off; stripKey = key;
        return strip;
    }

    // ─── DRAW ───────────────────────────────────────────────────────
    function draw() {
        raf = requestAnimationFrame(draw);
        if (!cv || !cv.isConnected || cv.offsetParent === null) return;
        var now = performance.now();
        if (now - lastDraw < 30) return;
        lastDraw = now;
        var e = AT();
        if (e && e.ensure) e.ensure();
        var n = nLanes();
        var cssW = cv.clientWidth, cssH = heightFor(n);
        if (cv.style.height !== cssH + 'px') cv.style.height = cssH + 'px';
        var dpr = window.devicePixelRatio || 1;
        var W = Math.max(1, Math.round(cssW * dpr)), H = Math.round(cssH * dpr);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        var g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = '#05070c';
        g.fillRect(0, 0, cssW, cssH);

        var ch = e && e.chart();
        var d = duration();
        var msg = !AR() || !AR().getFileBuffer || !AR().getFileBuffer() ? 'Load a track to see its cues'
                : e && e.analysing() ? 'Reading the track… ' + Math.round(e.progress() * 100) + '%'
                : !n ? 'Draw a band in Audio to make a lane'
                : !ch ? 'Getting the cues ready…' : '';
        paintButtons(!!(ch && d));
        if (msg) {
            g.fillStyle = 'rgba(255,255,255,0.45)';
            g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(msg, cssW / 2, cssH / 2);
            statusEl.textContent = '';
            return;
        }

        // Follow the playhead while it plays, unless you just moved the view.
        var t = nowT(), pos = AR().position();
        if (follow && pos && !pos.paused && now - lastTouchMs > FOLLOW_IDLE_MS) {
            if (t < view.t0 || t > view.t0 + view.span * 0.85) view.t0 = t - view.span * 0.15;
        }
        clampView();

        // Ruler
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fillRect(0, 0, cssW, RULER_H);
        var step = [0.5, 1, 2, 5, 10, 15, 30, 60].find(function (s) { return view.span / s <= 12; }) || 60;
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.font = '9px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
        for (var s = Math.ceil(view.t0 / step) * step; s <= view.t0 + view.span; s += step) {
            var rx = xOf(s, cssW);
            g.fillRect(Math.round(rx), RULER_H - 4, 1, 4);
            var mm = Math.floor(s / 60), ss = s - mm * 60;
            g.fillText(mm + ':' + (ss < 10 ? '0' : '') + (step < 1 ? ss.toFixed(1) : Math.round(ss)), rx + 3, RULER_H / 2);
        }

        // Spectrogram slice + each lane's band as a faint stripe
        var st = ensureStrip(dpr);
        if (st && d) {
            var sx = view.t0 / d * st.width, sw = view.span / d * st.width;
            g.imageSmoothingEnabled = sw < cssW;
            g.drawImage(st, sx, 0, Math.max(1, sw), st.height, 0, RULER_H, cssW, SPEC_H);
        }
        var gates = e.gates();
        for (var li = 0; li < gates.length; li++) {
            var col = e.color(li), y0 = RULER_H + SPEC_H * (1 - gates[li].hi), y1 = RULER_H + SPEC_H * (1 - gates[li].lo);
            g.fillStyle = rgba(col, 0.10);
            g.fillRect(0, y0, cssW, Math.max(1, y1 - y0));
            g.fillStyle = rgba(col, 0.55);
            g.fillRect(0, y0, 3, Math.max(1, y1 - y0));
        }

        // Lane rows with their ticks
        var notes = ch.notes, lanes = ch.lanes;
        for (var r = 0; r < gates.length; r++) {
            var ly = laneTop(r);
            g.fillStyle = r % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.045)';
            g.fillRect(0, ly, cssW, LANE_H);
        }
        var selSet = {};
        sel.forEach(function (q) { selSet[q.lane + ':' + q.t.toFixed(4)] = 1; });
        var shift = drag && drag.moved ? drag.dt : 0;
        for (var i = firstAtOrAfter(notes, view.t0 - 0.5); i < notes.length; i++) {
            var nt = notes[i];
            if (nt.t > view.t0 + view.span + 0.5) break;
            if (nt.lane >= gates.length) continue;
            var isSel = !!selSet[nt.lane + ':' + nt.t.toFixed(4)];
            var x = xOf(nt.t + (isSel ? shift : 0), cssW);
            if (x < -4 || x > cssW + 4) continue;
            var lc = e.color(nt.lane), ty = laneTop(nt.lane);
            var hh = (LANE_H - 6) * (0.45 + 0.55 * clamp(nt.e || 0.7, 0, 1));
            g.fillStyle = isSel ? '#ffffff' : rgba(lc, 0.9);
            g.fillRect(Math.round(x) - 1, ty + (LANE_H - hh) / 2, isSel ? 3 : 2, hh);
        }
        // Lane names on the left, with ✎ for a lane whose cues are its own
        g.font = '9px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
        for (var r2 = 0; r2 < gates.length; r2++) {
            var label = (gates[r2].edited ? '✎ ' : '') + e.label(r2) + ' Hz';
            var tw = g.measureText(label).width;
            g.fillStyle = 'rgba(5,7,12,0.78)';
            g.fillRect(4, laneTop(r2) + 3, tw + 8, LANE_H - 6);
            g.fillStyle = rgba(e.color(r2), 1);
            g.fillText(label, 8, laneTop(r2) + LANE_H / 2);
        }

        // Playhead
        var px = xOf(t, cssW);
        if (px >= 0 && px <= cssW) {
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.fillRect(Math.round(px), RULER_H, 1, cssH - RULER_H);
        }

        var nSel = sel.length;
        statusEl.textContent = nSel ? nSel + (nSel === 1 ? ' cue selected' : ' cues selected') : '';
    }

    function firstAtOrAfter(notes, t) {
        var lo = 0, hi = notes.length;
        while (lo < hi) { var m = (lo + hi) >> 1; if (notes[m].t < t) lo = m + 1; else hi = m; }
        return lo;
    }

    // ─── EDITS ──────────────────────────────────────────────────────
    function laneOfY(y) {
        var i = Math.floor((y - laneTop(0)) / LANE_H);
        return (y >= laneTop(0) && i >= 0 && i < nLanes()) ? i : -1;
    }
    function hitTick(lane, x, W) {
        var e = AT(), ch = e && e.chart();
        if (!ch) return null;
        var best = null, bd = HIT_PX + 1, notes = ch.notes;
        for (var i = firstAtOrAfter(notes, tOf(x - HIT_PX, W)); i < notes.length; i++) {
            var n = notes[i];
            var nx = xOf(n.t, W);
            if (nx > x + HIT_PX) break;
            if (n.lane !== lane) continue;
            var dd = Math.abs(nx - x);
            if (dd < bd) { bd = dd; best = { lane: lane, t: n.t }; }
        }
        return best;
    }
    function isSelected(q) { return sel.some(function (s) { return s.lane === q.lane && Math.abs(s.t - q.t) < 1e-4; }); }
    function snapshot(lanes) {
        var e = AT(), out = {};
        lanes.forEach(function (i) {
            var g = e.gates()[i];
            out[i] = { edited: !!g.edited, cues: g.edited && g.cues ? g.cues.map(function (c) { return c.slice(); }) : null };
        });
        return out;
    }
    function restore(snap) {
        var e = AT();
        Object.keys(snap).forEach(function (k) {
            var i = +k, s = snap[k];
            if (!s.edited) e.redetect(i); else e.setCues(i, s.cues.map(function (c) { return c.slice(); }));
        });
    }
    // Run an edit on some lanes: freeze them, let fn change their cue lists,
    // write them back, and remember how to undo it.
    function edit(lanes, fn) {
        var e = AT();
        lanes = lanes.filter(function (v, i, a) { return a.indexOf(v) === i; });
        var before = snapshot(lanes);
        var lists = {};
        lanes.forEach(function (i) { lists[i] = e.freeze(i).map(function (c) { return c.slice(); }); });
        fn(lists);
        lanes.forEach(function (i) { e.setCues(i, lists[i]); });
        undoStack.push({ before: before, after: snapshot(lanes) });
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
    }
    function indexIn(list, t) {
        for (var i = 0; i < list.length; i++) if (Math.abs(list[i][0] - t) < 1e-4) return i;
        return -1;
    }
    function moveSelected(dt) {
        if (!sel.length || !dt) return;
        var d = duration();
        var lanes = sel.map(function (q) { return q.lane; });
        edit(lanes, function (lists) {
            sel.forEach(function (q) {
                var L = lists[q.lane], k = indexIn(L, q.t);
                if (k < 0) return;
                L[k][0] = +clamp(q.t + dt, 0, d).toFixed(4);
                q.t = L[k][0];
            });
        });
    }
    function deleteSelected() {
        if (!sel.length) return;
        var lanes = sel.map(function (q) { return q.lane; });
        edit(lanes, function (lists) {
            sel.forEach(function (q) { var L = lists[q.lane], k = indexIn(L, q.t); if (k >= 0) L.splice(k, 1); });
        });
        sel = [];
    }
    function addCue(lane, t, e100) {
        var d = duration();
        t = +clamp(t, 0, d).toFixed(4);
        edit([lane], function (lists) { lists[lane].push([t, e100 == null ? 0.7 : e100]); });
        sel = [{ lane: lane, t: t }];
    }
    function undo() { var s = undoStack.pop(); if (!s) return; restore(s.before); redoStack.push(s); sel = []; }
    function redoEdit() { var s = redoStack.pop(); if (!s) return; restore(s.after); undoStack.push(s); sel = []; }

    // ─── POINTER / KEYS ─────────────────────────────────────────────
    // Pointer position in the canvas's own CSS px. The studio drawer is
    // zoomed by --ui-scale, so the box on screen is not the box we draw in.
    function local(ev) {
        var r = cv.getBoundingClientRect();
        var kx = cv.clientWidth / (r.width || 1), ky = cv.clientHeight / (r.height || 1);
        return { x: (ev.clientX - r.left) * kx, y: (ev.clientY - r.top) * ky, W: cv.clientWidth };
    }
    function onDown(ev) {
        if (ev.button !== 0) return;
        // No scroll: focusing a canvas half out of view scrolls the drawer,
        // and the row under the pointer moves before the click is read.
        cv.focus({ preventScroll: true });
        touch();
        var p = local(ev);
        if (p.y < RULER_H + SPEC_H) {
            // The ruler and the spectrogram are the scrub bar.
            var ar = AR();
            if (ar && ar.seek) ar.seek(clamp(tOf(p.x, p.W) - (AT().nudgeMs() / 1000), 0, duration()));
            return;
        }
        var lane = laneOfY(p.y);
        if (lane < 0) return;
        var hit = hitTick(lane, p.x, p.W);
        if (!hit) { if (!ev.shiftKey) sel = []; return; }
        if (ev.shiftKey) {
            if (isSelected(hit)) sel = sel.filter(function (s) { return !(s.lane === hit.lane && Math.abs(s.t - hit.t) < 1e-4); });
            else sel.push(hit);
            return;
        }
        if (!isSelected(hit)) sel = [hit];
        drag = { x0: p.x, W: p.W, dt: 0, moved: false };
        try { cv.setPointerCapture(ev.pointerId); } catch (_) {}
    }
    function onMove(ev) {
        if (!drag) return;
        var p = local(ev);
        var dx = p.x - drag.x0;
        if (Math.abs(dx) > 2) drag.moved = true;
        drag.dt = dx / drag.W * view.span;
        touch();
    }
    function onUp() {
        if (!drag) return;
        var d = drag; drag = null;
        if (d.moved) moveSelected(d.dt);
    }
    function onDbl(ev) {
        var p = local(ev), lane = laneOfY(p.y);
        if (lane < 0 || hitTick(lane, p.x, p.W)) return;
        addCue(lane, tOf(p.x, p.W));
    }
    function onWheel(ev) {
        ev.preventDefault();
        touch();
        var p = local(ev);
        if (ev.ctrlKey || ev.metaKey) {
            var at = tOf(p.x, p.W), k = ev.deltaY > 0 ? 1.25 : 0.8;
            view.span = view.span * k;
            clampView();
            view.t0 = at - p.x / p.W * view.span;
        } else {
            var dlt = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
            view.t0 += (dlt > 0 ? 1 : -1) * view.span * 0.12;
        }
        clampView();
    }
    function onKey(ev) {
        var k = ev.key, mod = ev.ctrlKey || ev.metaKey, handled = true;
        if (k === 'Delete' || k === 'Backspace') deleteSelected();
        else if (mod && (k === 'z' || k === 'Z') && !ev.shiftKey) undo();
        else if (mod && ((k === 'z' || k === 'Z') && ev.shiftKey || k === 'y' || k === 'Y')) redoEdit();
        else if (k === 'ArrowLeft' || k === 'ArrowRight') moveSelected((k === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 0.05 : 0.01));
        else if (k === 'Escape') sel = [];
        else if (k === ' ') { var ar = AR(); if (ar && ar.togglePlay) ar.togglePlay(); }
        else if (!mod && /^[1-8]$/.test(k)) {
            // Tap along: a cue on lane N where the track is NOW.
            var lane = parseInt(k, 10) - 1, pos = AR() && AR().position();
            if (lane < nLanes() && pos && !pos.paused) addCue(lane, nowT(), 0.8);
        } else handled = false;
        if (handled) { ev.preventDefault(); ev.stopPropagation(); }
    }

    // ─── TOOLBAR ────────────────────────────────────────────────────
    function mkBtn(label, title, fn) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ace-btn btn--ghost';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', function () { fn(); touch(); });
        return b;
    }
    function zoom(k) { var mid = view.t0 + view.span / 2; view.span *= k; clampView(); view.t0 = mid - view.span / 2; clampView(); }
    function selectedLanes() { return sel.map(function (q) { return q.lane; }).filter(function (v, i, a) { return a.indexOf(v) === i; }); }
    function paintButtons(ready) {
        var e = AT();
        btn.zoomIn.disabled = btn.zoomOut.disabled = btn.fit.disabled = !ready;
        btn.undo.disabled = !undoStack.length;
        btn.redo.disabled = !redoStack.length;
        var lanes = selectedLanes();
        btn.redetect.disabled = !(e && lanes.some(function (i) { var g = e.gates()[i]; return g && g.edited; }));
        btn.follow.classList.toggle('active', follow);
        btn.follow.setAttribute('aria-pressed', follow ? 'true' : 'false');
    }

    function mount(host) {
        if (!host) return;
        hostEl = host;
        host.innerHTML = '';
        wrap = document.createElement('div');
        wrap.className = 'ace-wrap';
        var bar = document.createElement('div');
        bar.className = 'ace-bar';
        var title = document.createElement('span');
        title.className = 'ace-title';
        title.textContent = 'Cues';
        bar.appendChild(title);
        btn.zoomOut = mkBtn('−', 'Show more of the track (Ctrl + wheel)', function () { zoom(1.5); });
        btn.zoomIn = mkBtn('+', 'Show less of the track, in more detail (Ctrl + wheel)', function () { zoom(1 / 1.5); });
        btn.fit = mkBtn('Fit', 'Show the whole track', function () { view.t0 = 0; view.span = duration() || 20; clampView(); });
        btn.follow = mkBtn('Follow', 'Keep the playhead in view while the track plays', function () { follow = !follow; lastTouchMs = 0; });
        btn.redetect = mkBtn('Re-detect', 'Give the selected cues\' lanes back to the detector: your edits on them go', function () {
            var e = AT(), lanes = selectedLanes().filter(function (i) { return e.gates()[i] && e.gates()[i].edited; });
            if (!lanes.length) return;
            var before = snapshot(lanes);
            lanes.forEach(function (i) { e.redetect(i); });
            undoStack.push({ before: before, after: snapshot(lanes) });
            redoStack = []; sel = [];
        });
        btn.undo = mkBtn('Undo', 'Undo the last cue edit (Ctrl+Z)', undo);
        btn.redo = mkBtn('Redo', 'Redo (Ctrl+Shift+Z)', redoEdit);
        [btn.zoomOut, btn.zoomIn, btn.fit, btn.follow].forEach(function (b) { bar.appendChild(b); });
        var sp = document.createElement('span'); sp.className = 'ace-sep'; bar.appendChild(sp);
        [btn.redetect, btn.undo, btn.redo].forEach(function (b) { bar.appendChild(b); });
        statusEl = document.createElement('span');
        statusEl.className = 'ace-status';
        bar.appendChild(statusEl);
        wrap.appendChild(bar);

        cv = document.createElement('canvas');
        cv.className = 'ace-canvas';
        cv.tabIndex = 0;
        // While it has focus the editor owns Delete, the arrows, Space and
        // 1-8 (01a's typing rule), so they never reach the app's hotkeys:
        // Delete there clears a recording take.
        cv.setAttribute('data-owns-keys', '');
        cv.setAttribute('aria-label', 'Cue editor: the track, its spectrogram and each lane\'s cues');
        cv.addEventListener('pointerdown', onDown);
        cv.addEventListener('pointermove', onMove);
        cv.addEventListener('pointerup', onUp);
        cv.addEventListener('pointercancel', function () { drag = null; });
        cv.addEventListener('lostpointercapture', onUp);
        cv.addEventListener('dblclick', onDbl);
        cv.addEventListener('wheel', onWheel, { passive: false });
        cv.addEventListener('keydown', onKey);
        wrap.appendChild(cv);

        hint = document.createElement('div');
        hint.className = 'ace-hint';
        hint.textContent = 'Click a cue to select it, drag to move it, Delete removes it, double-click a row to add one. While it plays, keys 1-8 tap cues onto lanes 1-8. Click the spectrogram to jump there.';
        wrap.appendChild(hint);
        host.appendChild(wrap);
        if (raf === null) raf = requestAnimationFrame(draw);
    }

    window.AudioCueEditor = {
        mount: mount,
        // Console / test handles
        view: function () { return { t0: view.t0, span: view.span }; },
        setView: function (t0, span) { view.t0 = t0; view.span = span; clampView(); touch(); },
        selection: function () { return sel.map(function (q) { return { lane: q.lane, t: q.t }; }); },
        select: function (lane, t) { sel = [{ lane: lane, t: t }]; },
        move: moveSelected, remove: deleteSelected, add: addCue, undo: undo, redo: redoEdit,
        _canvas: function () { return cv; },
        _hit: function (lane, x) { return hitTick(lane, x, cv.clientWidth); }
    };
})();
