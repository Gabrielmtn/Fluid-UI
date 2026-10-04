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
//
// PATTERN MATCHER (user test 3: "a pattern matcher which uses a
// spectrograph... to decide what shapes you want to cause triggers").
// Drag a box across the spectrogram around one snare, one vocal stab, one
// riser: a worker slides it along the whole track (zero-mean normalised
// cross-correlation over the box's band, weighed by how close each place's
// loudness is to the shape's, so a faint bleed of it doesn't count), every
// repeat lights up, Similarity tunes how
// alike they must be, and Make a lane turns them into a lane of cues.
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
    // The matcher: the boxed shape, its scores along the track, the picks.
    var box = null;                 // { t0, t1, u0, u1 } seconds, 0-1 log frequency
    var boxDrag = null;             // { x0, y0, W, moved }
    var match = null;               // { scores, L, anchor, sim, mode, peaks, busy, key }
    var matchEl = null, matchInfo = null, simInput = null, simOut = null, modeBtns = {}, makeBtn = null;
    var MATCH_MAX_S = 1.5, MATCH_MAX_BINS = 24;

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

        // The boxed shape and every place it repeats
        if (box) {
            var by0 = RULER_H + SPEC_H * (1 - box.u1), by1 = RULER_H + SPEC_H * (1 - box.u0), bw = box.t1 - box.t0;
            if (match && match.peaks) {
                g.fillStyle = 'rgba(120, 220, 255, 0.22)';
                g.strokeStyle = 'rgba(120, 220, 255, 0.8)';
                g.lineWidth = 1;
                for (var mi = 0; mi < match.peaks.length; mi++) {
                    var ms = match.peaks[mi].start;
                    if (ms + bw < view.t0 || ms > view.t0 + view.span) continue;
                    var mx0 = xOf(ms, cssW), mx1 = xOf(ms + bw, cssW);
                    g.fillRect(mx0, by0, Math.max(2, mx1 - mx0), by1 - by0);
                    var ax = xOf(match.peaks[mi].t, cssW);
                    g.fillRect(Math.round(ax), RULER_H - 5, 1, 5);
                }
            }
            g.setLineDash([4, 3]);
            g.strokeStyle = 'rgba(255,255,255,0.95)';
            g.lineWidth = 1;
            g.strokeRect(xOf(box.t0, cssW) + 0.5, by0 + 0.5, Math.max(2, xOf(box.t1, cssW) - xOf(box.t0, cssW)), by1 - by0);
            g.setLineDash([]);
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
            // A click on the ruler or the spectrogram seeks; a DRAG on the
            // spectrogram boxes a shape for the matcher.
            boxDrag = { x0: p.x, y0: p.y, W: p.W, moved: false };
            try { cv.setPointerCapture(ev.pointerId); } catch (_) {}
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
    function uOfY(y) { return clamp(1 - (y - RULER_H) / SPEC_H, 0, 1); }
    function onMove(ev) {
        if (boxDrag) {
            var q = local(ev);
            if (Math.abs(q.x - boxDrag.x0) > 4 || Math.abs(q.y - boxDrag.y0) > 4) boxDrag.moved = true;
            if (boxDrag.moved && boxDrag.y0 >= RULER_H) {
                var ta = tOf(boxDrag.x0, q.W), tb = tOf(q.x, q.W);
                var ua = uOfY(boxDrag.y0), ub = uOfY(q.y);
                box = { t0: Math.min(ta, tb), t1: Math.max(ta, tb), u0: Math.min(ua, ub), u1: Math.max(ua, ub) };
                match = null;
                paintMatch();
            }
            touch();
            return;
        }
        if (!drag) return;
        var p = local(ev);
        var dx = p.x - drag.x0;
        if (Math.abs(dx) > 2) drag.moved = true;
        drag.dt = dx / drag.W * view.span;
        touch();
    }
    function onUp(ev) {
        if (boxDrag) {
            var bd = boxDrag; boxDrag = null;
            if (!bd.moved || bd.y0 < RULER_H) {
                var ar = AR();
                if (ar && ar.seek) ar.seek(clamp(tOf(bd.x0, bd.W) - (AT().nudgeMs() / 1000), 0, duration()));
                return;
            }
            if (box && box.t1 - box.t0 > MATCH_MAX_S) box.t1 = box.t0 + MATCH_MAX_S;
            if (!box || box.t1 - box.t0 < 0.03 || box.u1 - box.u0 < 0.01) { box = null; paintMatch(); return; }
            runMatch();
            return;
        }
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
        else if (k === 'Escape') { if (box) { box = null; match = null; paintMatch(); } else sel = []; }
        else if (k === ' ') { var ar = AR(); if (ar && ar.togglePlay) ar.togglePlay(); }
        else if (!mod && /^[1-8]$/.test(k)) {
            // Tap along: a cue on lane N where the track is NOW.
            var lane = parseInt(k, 10) - 1, pos = AR() && AR().position();
            if (lane < nLanes() && pos && !pos.paused) addCue(lane, nowT(), 0.8);
        } else handled = false;
        if (handled) { ev.preventDefault(); ev.stopPropagation(); }
    }

    // ─── THE MATCHER ────────────────────────────────────────────────
    // Runs in a worker: ~frames × template cells multiply-adds (a 4-minute
    // track and a 1 s box: about 60 M), never on the frame that paints.
    function nccJob(job) {
        var X = job.X, F = job.frames, B = job.B, f0 = job.f0, L = job.L;
        var Y = X, f, b, i;
        if (job.mode === 'attack') {
            Y = new Float32Array(F * B);
            for (f = 1; f < F; f++) for (b = 0; b < B; b++) {
                var dv = X[f * B + b] - X[(f - 1) * B + b];
                Y[f * B + b] = dv > 0 ? dv : 0;
            }
        }
        var n = L * B, T = new Float32Array(n), mu = 0;
        for (i = 0; i < n; i++) { T[i] = Y[f0 * B + i]; mu += T[i]; }
        mu /= n;
        var tLevel = mu;   // the shape's mean level, before it is centred
        var tss = 0;
        for (i = 0; i < n; i++) { T[i] -= mu; tss += T[i] * T[i]; }
        var tsd = Math.sqrt(tss) || 1e-9;
        var rs = new Float64Array(F + 1), rq = new Float64Array(F + 1);
        for (f = 0; f < F; f++) {
            var sm = 0, sq = 0;
            for (b = 0; b < B; b++) { var v = Y[f * B + b]; sm += v; sq += v * v; }
            rs[f + 1] = rs[f] + sm; rq[f + 1] = rq[f] + sq;
        }
        var P = Math.max(0, F - L + 1), out = new Float32Array(P);
        for (var p = 0; p < P; p++) {
            var num = 0, base = p * B;
            for (i = 0; i < n; i++) num += Y[base + i] * T[i];
            var s1 = rs[p + L] - rs[p], s2 = rq[p + L] - rq[p];
            var vw = s2 - s1 * s1 / n;
            // Correlation alone ignores loudness: a faint bleed of the same
            // shape (a kick's click in the snare band) scores like the real
            // thing. Weigh it by how close its level is to the shape's.
            var wl = s1 / n, lr = (wl > 0 && tLevel > 0) ? Math.min(wl, tLevel) / Math.max(wl, tLevel) : 0;
            out[p] = vw > 1e-9 ? (num / (Math.sqrt(vw) * tsd)) * lr * lr : 0;
        }
        // Anchor: the template frame with the strongest rise, so a match's
        // cue lands on its hit rather than where the box happened to start.
        var anchor = 0, best = -1;
        for (var a = 1; a < L; a++) {
            var rise = 0;
            for (b = 0; b < B; b++) { var d2 = X[(f0 + a) * B + b] - X[(f0 + a - 1) * B + b]; if (d2 > 0) rise += d2; }
            if (rise > best) { best = rise; anchor = a; }
        }
        return { scores: out, anchor: anchor };
    }
    var nccWorkerUrl = null;
    function runNcc(job, done) {
        try {
            if (nccWorkerUrl === null) {
                nccWorkerUrl = (window.Worker && window.Blob && window.URL) ? URL.createObjectURL(new Blob(
                    ['var J=' + nccJob.toString() + ';self.onmessage=function(e){var r=J(e.data);self.postMessage(r,[r.scores.buffer]);};'],
                    { type: 'text/javascript' })) : false;
            }
            if (nccWorkerUrl) {
                var w = new Worker(nccWorkerUrl);
                w.onmessage = function (e) { w.terminate(); done(e.data); };
                w.onerror = function () { w.terminate(); done(nccJob(job)); };
                w.postMessage(job, [job.X.buffer]);
                return;
            }
        } catch (_) {}
        done(nccJob(job));
    }
    function runMatch() {
        var e = AT(), c = e && e.cache();
        if (!c || !box) return;
        var mode = (match && match.mode) || 'texture';
        var c0 = clamp(Math.floor(box.u0 * c.cols), 0, c.cols - 1), c1 = clamp(Math.ceil(box.u1 * c.cols) - 1, c0, c.cols - 1);
        var span = c1 - c0 + 1, B = Math.min(MATCH_MAX_BINS, span);
        var F = c.frames, X = new Float32Array(F * B), lv = c.levels, cols = c.cols;
        for (var f = 0; f < F; f++) {
            for (var b = 0; b < B; b++) {
                var a0 = c0 + Math.floor(b * span / B), a1 = c0 + Math.floor((b + 1) * span / B), mx = 0;
                for (var col = a0; col < Math.max(a1, a0 + 1); col++) { var v = lv[f * cols + col]; if (v > mx) mx = v; }
                X[f * B + b] = mx / 255;
            }
        }
        var f0 = clamp(Math.round((box.t0 - c.t0) / c.dt), 0, F - 2);
        var L = clamp(Math.round((box.t1 - box.t0) / c.dt), 2, F - f0);
        var key = [f0, L, c0, c1, mode].join(':');
        // 0.65: on a test beat, every snare and no kick (texture, 0.6-0.8).
        var sim = match && match.sim ? match.sim : 0.65;
        match = { busy: true, mode: mode, sim: sim, key: key, L: L, peaks: [] };
        paintMatch();
        runNcc({ X: X, frames: F, B: B, f0: f0, L: L, mode: mode }, function (r) {
            if (!match || match.key !== key) return;   // a newer box took over
            match.busy = false;
            match.scores = r.scores;
            match.anchor = r.anchor;
            pickPeaks();
            paintMatch();
        });
    }
    // Every place at least sim alike, strongest first, no two closer than
    // half the shape: the pick is instant, so the slider redraws as you drag.
    function pickPeaks() {
        var e = AT(), c = e && e.cache();
        if (!match || !match.scores || !c) return;
        var sc = match.scores, P = sc.length, sim = match.sim, r = Math.max(1, Math.floor(match.L / 2));
        var cand = [];
        for (var p = 0; p < P; p++) if (sc[p] >= sim) cand.push(p);
        cand.sort(function (a, b) { return sc[b] - sc[a]; });
        var taken = new Uint8Array(P), peaks = [];
        for (var k = 0; k < cand.length && peaks.length < 2000; k++) {
            var q = cand[k];
            if (taken[q]) continue;
            for (var z = Math.max(0, q - r); z <= Math.min(P - 1, q + r); z++) taken[z] = 1;
            var start = c.t0 + q * c.dt;
            peaks.push({ start: start, t: start + match.anchor * c.dt + e.lagComp(), score: sc[q] });
        }
        peaks.sort(function (a, b) { return a.t - b.t; });
        match.peaks = peaks;
    }
    function hzText(u) {
        var hz = (window.AudioScenes && window.AudioScenes.x01ToHz) ? window.AudioScenes.x01ToHz(u) : 20 * Math.pow(1000, u);
        return hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 0 : 1) + 'k' : Math.round(hz) + '';
    }
    function paintMatch() {
        if (!matchEl) return;
        matchEl.hidden = !box;
        if (!box) return;
        var dur = box.t1 - box.t0;
        matchInfo.textContent = 'Shape ' + dur.toFixed(2) + ' s · ' + hzText(box.u0) + '–' + hzText(box.u1) + ' Hz · '
            + (!match || match.busy ? 'finding its repeats…' : match.peaks.length + (match.peaks.length === 1 ? ' match' : ' matches'));
        var mode = (match && match.mode) || 'texture';
        modeBtns.attack.classList.toggle('active', mode === 'attack');
        modeBtns.texture.classList.toggle('active', mode === 'texture');
        var sim = (match && match.sim) || 0.65;
        simInput.value = String(sim);
        simOut.textContent = sim.toFixed(2);
        makeBtn.disabled = !(match && !match.busy && match.peaks.length);
    }
    function makeLane() {
        var e = AT();
        if (!e || !box || !match || !match.peaks.length) return;
        var sim = match.sim;
        var cues = match.peaks.map(function (p) {
            return [+p.t.toFixed(4), +(0.5 + 0.5 * clamp((p.score - sim) / Math.max(0.05, 1 - sim), 0, 1)).toFixed(3)];
        });
        var i = e.addLane({ lo: +box.u0.toFixed(4), hi: +box.u1.toFixed(4), th: 0.5, method: 'pattern', act: 'burst', every: 1,
                            edited: true, cues: cues, pattern: { t0: +box.t0.toFixed(3), t1: +box.t1.toFixed(3), mode: match.mode, sim: sim } });
        box = null; match = null;
        paintMatch();
        sel = [];
        statusEl.textContent = i >= 0 ? 'Lane ' + (i + 1) + ': ' + cues.length + ' cues, doing Burst' : '';
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
        btn.redetect.disabled = !(e && lanes.some(function (i) { var g = e.gates()[i]; return g && g.edited && g.method !== 'pattern'; }));
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
            var e = AT(), lanes = selectedLanes().filter(function (i) { return e.gates()[i] && e.gates()[i].edited && e.gates()[i].method !== 'pattern'; });
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

        matchEl = document.createElement('div');
        matchEl.className = 'ace-match';
        matchEl.hidden = true;
        matchInfo = document.createElement('span');
        matchInfo.className = 'ace-match-info';
        matchEl.appendChild(matchInfo);
        modeBtns.attack = mkBtn('Attacks', 'Match the shape\'s hits: how it rises, not how loud it sits (drums, plucks)', function () { if (match) match.mode = 'attack'; else match = { mode: 'attack' }; runMatch(); });
        modeBtns.texture = mkBtn('Texture', 'Match the shape as it sounds, loudness and all (pads, vocals, risers)', function () { if (match) match.mode = 'texture'; else match = { mode: 'texture' }; runMatch(); });
        matchEl.appendChild(modeBtns.texture);
        matchEl.appendChild(modeBtns.attack);
        var simLbl = document.createElement('label');
        simLbl.className = 'ace-sim';
        simLbl.textContent = 'Similarity ';
        simLbl.title = 'How alike a place must be to count as a repeat';
        simInput = document.createElement('input');
        simInput.type = 'range'; simInput.min = '0.3'; simInput.max = '0.98'; simInput.step = '0.01'; simInput.value = '0.65';
        simInput.setAttribute('data-no-scale', '1');
        simInput.addEventListener('input', function () {
            if (!match) return;
            match.sim = parseFloat(simInput.value) || 0.65;
            pickPeaks();
            paintMatch();
        });
        simOut = document.createElement('span');
        simOut.className = 'ace-sim-val';
        simLbl.appendChild(simInput);
        simLbl.appendChild(simOut);
        matchEl.appendChild(simLbl);
        makeBtn = mkBtn('Make a lane', 'Turn every match into a cue on a new lane, set to Burst; pick what it does in its row', makeLane);
        makeBtn.classList.add('btn--emphasis');
        matchEl.appendChild(makeBtn);
        matchEl.appendChild(mkBtn('Cancel', 'Drop the box (Escape)', function () { box = null; match = null; paintMatch(); }));
        wrap.appendChild(matchEl);

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
        hint.textContent = 'Click a cue to select it, drag to move it, Delete removes it, double-click a row to add one. While it plays, keys 1-8 tap cues onto lanes 1-8. Click the spectrogram to jump there; drag across it to box a shape and find every repeat.';
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
        _box: function (t0, t1, u0, u1, mode) { box = { t0: t0, t1: t1, u0: u0, u1: u1 }; match = mode ? { mode: mode } : null; runMatch(); },
        _match: function () { return match ? { busy: !!match.busy, n: match.peaks ? match.peaks.length : 0, sim: match.sim, mode: match.mode, times: (match.peaks || []).map(function (p) { return +p.t.toFixed(3); }) } : null; },
        _setSim: function (v) { if (match) { match.sim = v; pickPeaks(); paintMatch(); } },
        _makeLane: makeLane,
        _hit: function (lane, x) { return hitTick(lane, x, cv.clientWidth); }
    };
})();
