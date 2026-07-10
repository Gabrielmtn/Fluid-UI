/**
 * Audio-Reactive Composer (foundation)
 *
 * A full-width, multi-lane, SECONDS-based timeline for arranging how the audio
 * reactivity evolves over a set duration. Each "segment" stores a snapshot of
 * the whole audio-react config (window.audioReactive.getConfig()) and re-applies
 * it (applyConfig) as the playhead sweeps across it. Multiple lanes play
 * together; for the shared single reactive engine the TOP-MOST active segment
 * wins (clean, predictable). Segments are drag-move / edge-resize.
 *
 * NEXT INCREMENT (designed-for, not yet built): a segment inspector with a
 * mini-player that previews the reactivity + plays paint inputs recorded
 * alongside the segment, plus per-segment input recording. The data model
 * already reserves `seg.inputs` for that.
 *
 * window.audioComposer = { mount, getState, isPlaying }
 */
(function () {
    'use strict';

    var DEFAULTS = { durationMs: 16000, segMs: 4000 };
    var TRACK_COLORS = ['#b48cff', '#4dd2ff', '#4dff7a', '#ffb24d', '#ff6fae'];

    var state = { durationMs: DEFAULTS.durationMs, tracks: [], activeTrackId: null };
    var nextId = 1;
    var selectedSegId = null;
    var playing = false, playheadMs = 0, rafId = null, lastFrameMs = 0;
    var appliedByTrack = {};          // trackId -> last-applied segment id (apply only on change)
    var baseConfig = null;            // config to restore when no segment is active
    var els = {};                     // cached DOM refs

    // ─── MODEL ──────────────────────────────────────────────────
    function makeTrack(name) {
        var t = { id: nextId++, name: name || ('Lane ' + state.tracks.length), kind: 'reactive', segments: [] };
        state.tracks.push(t);
        if (state.activeTrackId == null) state.activeTrackId = t.id;
        return t;
    }
    function findTrack(id) { for (var i = 0; i < state.tracks.length; i++) if (state.tracks[i].id === id) return state.tracks[i]; return null; }
    function findSeg(id) {
        for (var i = 0; i < state.tracks.length; i++) {
            var s = state.tracks[i].segments;
            for (var j = 0; j < s.length; j++) if (s[j].id === id) return { track: state.tracks[i], seg: s[j] };
        }
        return null;
    }
    function clampSeg(seg) {
        seg.durMs = Math.max(250, Math.min(state.durationMs, seg.durMs));
        seg.startMs = Math.max(0, Math.min(state.durationMs - seg.durMs, seg.startMs));
    }

    function captureSegment() {
        var track = findTrack(state.activeTrackId) || state.tracks[0];
        if (!track) track = makeTrack('Lane 1');
        var cfg = (window.audioReactive && window.audioReactive.getConfig) ? window.audioReactive.getConfig() : {};
        var seg = {
            id: nextId++,
            name: labelForConfig(cfg),
            startMs: snap(playheadMs),
            durMs: DEFAULTS.segMs,
            config: cfg,
            inputs: []   // reserved: paint motions recorded alongside (next increment)
        };
        clampSeg(seg);
        track.segments.push(seg);
        selectedSegId = seg.id;
        // Advance the playhead to the end of the new segment so repeated captures
        // lay out sequentially instead of stacking at the same spot.
        playheadMs = Math.min(state.durationMs, seg.startMs + seg.durMs);
        save(); render();
    }
    function labelForConfig(cfg) {
        if (!cfg) return 'Segment';
        var bits = [];
        if (cfg.autoSplatMode) bits.push(cfg.autoSplatMode);
        if (cfg.mappings) { if (cfg.mappings.overallToSize) bits.push('size'); if (cfg.mappings.trebleToColor) bits.push('color'); }
        return bits.length ? bits.join('·') : 'Segment';
    }
    function snap(ms) { return Math.round(ms / 250) * 250; }

    function deleteSeg(id) {
        var f = findSeg(id); if (!f) return;
        var s = f.track.segments; s.splice(s.indexOf(f.seg), 1);
        if (selectedSegId === id) selectedSegId = null;
        save(); render();
    }

    // ─── PLAYBACK ───────────────────────────────────────────────
    function segAt(track, ms) {
        for (var i = 0; i < track.segments.length; i++) {
            var s = track.segments[i];
            if (ms >= s.startMs && ms < s.startMs + s.durMs) return s;
        }
        return null;
    }
    // Apply the TOP-MOST active reactive segment (last track wins visually = top
    // lane). Only re-applies on change to avoid stomping every frame.
    function applyActive() {
        var winner = null, winnerTrackId = null;
        for (var i = state.tracks.length - 1; i >= 0; i--) {
            var s = segAt(state.tracks[i], playheadMs);
            if (s) { winner = s; winnerTrackId = state.tracks[i].id; break; }
        }
        var key = winner ? winner.id : 0;
        if (appliedByTrack._winner === key) return;
        appliedByTrack._winner = key;
        if (window.audioReactive && window.audioReactive.applyConfig) {
            window.audioReactive.applyConfig(winner ? winner.config : baseConfig);
        }
    }

    function play() {
        if (playing) return;
        if (!state.tracks.some(function (t) { return t.segments.length; })) return;
        // Snapshot the user's current config so we can restore it on stop / gaps.
        baseConfig = (window.audioReactive && window.audioReactive.getConfig) ? window.audioReactive.getConfig() : null;
        playing = true;
        appliedByTrack = {};
        lastFrameMs = 0;
        if (els.playBtn) els.playBtn.textContent = '⏸';
        rafId = requestAnimationFrame(frame);
    }
    function stop() {
        playing = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (els.playBtn) els.playBtn.textContent = '▶';
        // Restore the user's pre-play config.
        if (baseConfig && window.audioReactive && window.audioReactive.applyConfig) window.audioReactive.applyConfig(baseConfig);
        appliedByTrack = {};
        updatePlayhead();
    }
    function togglePlay() { playing ? stop() : play(); }

    function frame(now) {
        if (!playing) return;
        rafId = requestAnimationFrame(frame);
        // rAF is uncapped in the Electron build — ~60 Hz is plenty for segment
        // application + playhead DOM writes (dt-based, so timing stays exact)
        if (lastFrameMs && now - lastFrameMs < 15) return;
        if (!lastFrameMs) lastFrameMs = now;
        var dt = Math.min(100, now - lastFrameMs);
        lastFrameMs = now;
        playheadMs += dt;
        if (playheadMs >= state.durationMs) { playheadMs = 0; appliedByTrack = {}; } // loop
        applyActive();
        updatePlayhead();
    }

    // ─── RENDER ─────────────────────────────────────────────────
    function pct(ms) { return (ms / state.durationMs) * 100; }

    function mount(container) {
        container.innerHTML = '';
        injectStyles();

        var root = document.createElement('div');
        root.className = 'arc-root';

        // Transport row
        var bar = document.createElement('div');
        bar.className = 'arc-bar';
        var playBtn = btn('▶', 'arc-play', togglePlay);
        var capBtn = btn('＋ Capture Segment', 'arc-cap', captureSegment);
        capBtn.title = 'Snapshot the current Audio React settings as a segment at the playhead';
        var addTrackBtn = btn('＋ Lane', 'arc-addtrack', function () { makeTrack(); save(); render(); });
        els.timeReadout = document.createElement('span');
        els.timeReadout.className = 'arc-time';
        var durWrap = document.createElement('label');
        durWrap.className = 'arc-dur';
        durWrap.innerHTML = 'Length ';
        var durInput = document.createElement('input');
        durInput.type = 'number'; durInput.min = '2'; durInput.max = '600'; durInput.step = '1';
        durInput.value = String(Math.round(state.durationMs / 1000));
        durInput.addEventListener('change', function () {
            var sec = Math.max(2, Math.min(600, parseInt(durInput.value, 10) || 30));
            state.durationMs = sec * 1000;
            state.tracks.forEach(function (t) { t.segments.forEach(clampSeg); });
            save(); render();
        });
        durWrap.appendChild(durInput); durWrap.appendChild(document.createTextNode('s'));
        bar.appendChild(playBtn); bar.appendChild(els.timeReadout);
        bar.appendChild(capBtn); bar.appendChild(addTrackBtn); bar.appendChild(durWrap);
        els.playBtn = playBtn;
        root.appendChild(bar);

        var help = document.createElement('div');
        help.className = 'arc-help';
        help.textContent = '＋ Capture snapshots the current Audio React settings as a segment on the ● active lane. Drag a segment to move it · drag its edges to stretch · ▶ sweeps the playhead, applying each segment as it crosses.';
        root.appendChild(help);

        // Timeline (ruler + lanes + playhead)
        var tl = document.createElement('div');
        tl.className = 'arc-timeline';
        els.timeline = tl;

        var ruler = document.createElement('div');
        ruler.className = 'arc-ruler';
        els.ruler = ruler;
        tl.appendChild(ruler);

        var lanes = document.createElement('div');
        lanes.className = 'arc-lanes';
        els.lanes = lanes;
        tl.appendChild(lanes);

        var playhead = document.createElement('div');
        playhead.className = 'arc-playhead';
        els.playhead = playhead;
        tl.appendChild(playhead);

        // Click empty timeline to move the playhead
        lanes.addEventListener('pointerdown', function (e) {
            if (e.target !== lanes && !e.target.classList.contains('arc-lane')) return;
            var r = lanes.getBoundingClientRect();
            playheadMs = snap(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * state.durationMs);
            updatePlayhead();
        });

        root.appendChild(tl);

        // Inspector (selected segment)
        els.inspector = document.createElement('div');
        els.inspector.className = 'arc-inspector';
        root.appendChild(els.inspector);

        container.appendChild(root);
        render();
    }

    function render() {
        if (!els.lanes) return;
        // Ruler ticks (every ~5s, at least 4 ticks)
        els.ruler.innerHTML = '';
        var secTotal = state.durationMs / 1000;
        var step = secTotal <= 12 ? 2 : secTotal <= 40 ? 5 : 10;
        for (var sName = 0; sName <= secTotal + 0.001; sName += step) {
            var tick = document.createElement('div');
            tick.className = 'arc-tick';
            tick.style.left = pct(sName * 1000) + '%';
            tick.textContent = sName + 's';
            els.ruler.appendChild(tick);
        }

        // Lanes
        els.lanes.innerHTML = '';
        state.tracks.forEach(function (track, ti) {
            var lane = document.createElement('div');
            lane.className = 'arc-lane' + (track.id === state.activeTrackId ? ' active' : '');
            lane.dataset.trackId = track.id;
            lane.addEventListener('pointerdown', function (e) {
                if (e.target === lane) state.activeTrackId = track.id, render();
            });
            // Lane label
            var lbl = document.createElement('div');
            lbl.className = 'arc-lane-label';
            lbl.textContent = track.name;
            lbl.title = 'Click to make this the capture lane';
            lbl.addEventListener('pointerdown', function (e) { e.stopPropagation(); state.activeTrackId = track.id; render(); });
            lane.appendChild(lbl);

            var color = TRACK_COLORS[ti % TRACK_COLORS.length];
            track.segments.forEach(function (seg) {
                lane.appendChild(renderSeg(track, seg, color));
            });
            els.lanes.appendChild(lane);
        });

        renderInspector();
        updatePlayhead();
    }

    function renderSeg(track, seg, color) {
        var el = document.createElement('div');
        el.className = 'arc-seg' + (seg.id === selectedSegId ? ' sel' : '');
        el.style.left = pct(seg.startMs) + '%';
        el.style.width = pct(seg.durMs) + '%';
        el.style.background = hexA(color, 0.22);
        el.style.borderColor = hexA(color, 0.7);
        el.dataset.segId = seg.id;
        var gripL = document.createElement('div'); gripL.className = 'arc-grip arc-grip-l';
        var name = document.createElement('span'); name.className = 'arc-seg-name'; name.textContent = seg.name;
        var gripR = document.createElement('div'); gripR.className = 'arc-grip arc-grip-r';
        el.appendChild(gripL); el.appendChild(name); el.appendChild(gripR);

        el.addEventListener('pointerdown', function (e) {
            e.stopPropagation();
            // Lightweight select — do NOT full-render here: render() rebuilds the
            // lanes and destroys THIS element mid-gesture (losing pointer capture),
            // which is why drag/resize never tracked. We re-render on pointerup.
            selectSeg(seg.id, track.id, el);
            var mode = e.target === gripR ? 'resize-r' : e.target === gripL ? 'resize-l' : 'move';
            startDrag(e, seg, mode, el);
        });
        return el;
    }

    function selectSeg(segId, trackId, el) {
        selectedSegId = segId;
        state.activeTrackId = trackId;
        var prev = els.lanes.querySelectorAll('.arc-seg.sel');
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove('sel');
        if (el) el.classList.add('sel');
        renderInspector();
    }

    var drag = null;
    function startDrag(e, seg, mode, el) {
        var laneRect = els.lanes.getBoundingClientRect();
        drag = { seg: seg, mode: mode, startX: e.clientX, startMs0: seg.startMs, durMs0: seg.durMs, laneW: laneRect.width, el: el };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        el.addEventListener('pointermove', onDragMove);
        el.addEventListener('pointerup', onDragUp);
        el.addEventListener('pointercancel', onDragUp);
    }
    function onDragMove(e) {
        if (!drag) return;
        var dMs = ((e.clientX - drag.startX) / drag.laneW) * state.durationMs;
        var s = drag.seg;
        if (drag.mode === 'move') {
            s.startMs = snap(drag.startMs0 + dMs);
        } else if (drag.mode === 'resize-r') {
            s.durMs = snap(drag.durMs0 + dMs);
        } else { // resize-l: drag the left edge, keep the right edge fixed
            var right = drag.startMs0 + drag.durMs0;
            var ns = Math.max(0, Math.min(right - 250, snap(drag.startMs0 + dMs)));
            s.startMs = ns; s.durMs = right - ns;
        }
        clampSeg(s);
        if (drag.el) { drag.el.style.left = pct(s.startMs) + '%'; drag.el.style.width = pct(s.durMs) + '%'; }
        renderInspector();
    }
    function onDragUp(e) {
        if (!drag) return;
        try { drag.el.releasePointerCapture(e.pointerId); } catch (_) {}
        drag.el.removeEventListener('pointermove', onDragMove);
        drag.el.removeEventListener('pointerup', onDragUp);
        drag.el.removeEventListener('pointercancel', onDragUp);
        drag = null;
        save();
        render(); // now safe to fully re-sync (active-lane highlight, fresh handlers)
    }

    function renderInspector() {
        if (!els.inspector) return;
        var f = selectedSegId != null ? findSeg(selectedSegId) : null;
        if (!f) { els.inspector.innerHTML = '<span class="arc-hint">Select a segment to inspect · ＋ Capture Segment snapshots the current Audio React settings</span>'; return; }
        var seg = f.seg;
        var cfg = seg.config || {};
        var maps = cfg.mappings || {};
        var on = Object.keys(maps).filter(function (k) { return maps[k]; });
        els.inspector.innerHTML =
            '<div class="arc-insp-row"><b>' + esc(seg.name) + '</b>' +
            '<span class="arc-insp-meta">' + (seg.startMs / 1000).toFixed(2) + 's · ' + (seg.durMs / 1000).toFixed(2) + 's</span></div>' +
            '<div class="arc-insp-cfg">pattern: <b>' + esc(cfg.autoSplatMode || '—') + '</b> · sens ' + (cfg.sensitivity != null ? (+cfg.sensitivity).toFixed(1) : '—') +
            ' · maps: ' + (on.length ? on.join(', ') : 'none') + '</div>' +
            '<div class="arc-insp-actions">' +
            '<button class="arc-mini-play" disabled title="Mini-player preview — next increment">▶ preview</button>' +
            '<button class="arc-mini-rec" disabled title="Record paint inputs alongside — next increment">⏺ inputs</button>' +
            '<button class="arc-del">🗑 delete</button></div>';
        var del = els.inspector.querySelector('.arc-del');
        if (del) del.addEventListener('click', function () { deleteSeg(seg.id); });
    }

    function updatePlayhead() {
        if (els.playhead) els.playhead.style.left = pct(playheadMs) + '%';
        if (els.timeReadout) els.timeReadout.textContent = (playheadMs / 1000).toFixed(1) + ' / ' + (state.durationMs / 1000).toFixed(0) + 's';
    }

    // ─── helpers / persistence ──────────────────────────────────
    function btn(label, cls, fn) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.textContent = label;
        b.addEventListener('click', fn);
        return b;
    }
    function hexA(hex, a) {
        var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    function esc(s) { return String(s).replace(/[<>&]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]; }); }

    function save() {
        try {
            if (!window.settingsManager) return;
            window.settingsManager.set('audioComposer', { durationMs: state.durationMs, activeTrackId: state.activeTrackId, tracks: state.tracks });
        } catch (_) {}
    }
    function load() {
        try {
            if (!window.settingsManager) return;
            var d = window.settingsManager.get('audioComposer');
            if (d && Array.isArray(d.tracks)) {
                state.durationMs = d.durationMs || DEFAULTS.durationMs;
                state.tracks = d.tracks;
                state.activeTrackId = d.activeTrackId;
                var maxId = 0;
                state.tracks.forEach(function (t) { maxId = Math.max(maxId, t.id); t.segments.forEach(function (s) { maxId = Math.max(maxId, s.id); }); });
                nextId = maxId + 1;
            }
        } catch (_) {}
    }

    function injectStyles() {
        if (document.getElementById('arc-styles')) return;
        var css = '' +
            '.arc-root{font-size:11px;color:#cdd6e0;}' +
            '.arc-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;}' +
            '.arc-bar button{all:unset;box-sizing:border-box;cursor:pointer;padding:4px 8px;border-radius:4px;font-size:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#e6edf3;}' +
            '.arc-bar button.arc-play{min-width:30px;text-align:center;background:rgba(120,200,140,0.18);border-color:rgba(120,200,140,0.4);}' +
            '.arc-bar button.arc-cap{background:rgba(180,140,255,0.18);border-color:rgba(180,140,255,0.4);}' +
            '.arc-time{font-family:monospace;font-size:10px;opacity:0.7;margin-left:2px;}' +
            '.arc-dur{font-size:10px;opacity:0.7;display:flex;align-items:center;gap:2px;}' +
            '.arc-dur input{width:42px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#e6edf3;border-radius:3px;padding:2px 4px;font-size:10px;}' +
            '.arc-timeline{position:relative;background:#0a0d12;border:1px solid rgba(255,255,255,0.08);border-radius:5px;overflow:hidden;}' +
            '.arc-ruler{position:relative;height:14px;border-bottom:1px solid rgba(255,255,255,0.06);}' +
            '.arc-tick{position:absolute;top:0;font-size:8px;color:rgba(255,255,255,0.35);transform:translateX(-1px);padding-left:2px;border-left:1px solid rgba(255,255,255,0.1);height:100%;line-height:14px;}' +
            '.arc-lanes{position:relative;}' +
            '.arc-help{font-size:9px;color:rgba(255,255,255,0.42);margin-bottom:6px;line-height:1.4;}' +
            '.arc-lane{position:relative;height:34px;border-bottom:1px solid rgba(255,255,255,0.05);}' +
            '.arc-lane.active{background:rgba(180,140,255,0.06);}' +
            '.arc-lane-label{position:absolute;left:3px;top:2px;font-size:8px;color:rgba(255,255,255,0.4);z-index:1;pointer-events:auto;text-transform:uppercase;letter-spacing:0.3px;}' +
            '.arc-lane.active .arc-lane-label{color:rgba(255,150,180,0.95);}' +
            '.arc-lane.active .arc-lane-label::before{content:"\\25CF ";color:#ff5a5a;}' +
            '.arc-seg{position:absolute;top:13px;height:18px;border:1px solid;border-radius:3px;cursor:grab;overflow:hidden;display:flex;align-items:center;min-width:12px;}' +
            '.arc-seg:active{cursor:grabbing;}' +
            '.arc-seg.sel{outline:1.5px solid #fff;outline-offset:-1px;z-index:2;}' +
            '.arc-seg-name{font-size:8px;padding:0 9px;white-space:nowrap;color:#fff;opacity:0.92;pointer-events:none;flex:1;text-align:center;}' +
            '.arc-grip{position:absolute;top:0;height:100%;width:8px;cursor:ew-resize;z-index:2;background:rgba(255,255,255,0.05);}' +
            '.arc-grip-l{left:0;border-right:1px solid rgba(255,255,255,0.12);}' +
            '.arc-grip-r{right:0;border-left:1px solid rgba(255,255,255,0.12);}' +
            '.arc-seg:hover .arc-grip,.arc-seg.sel .arc-grip{background:rgba(255,255,255,0.4);}' +
            '.arc-playhead{position:absolute;top:0;bottom:0;width:2px;background:#ff5a5a;box-shadow:0 0 6px rgba(255,90,90,0.6);pointer-events:none;z-index:3;}' +
            '.arc-inspector{margin-top:6px;padding:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:4px;min-height:20px;}' +
            '.arc-hint{font-size:9px;color:rgba(255,255,255,0.4);}' +
            '.arc-insp-row{display:flex;justify-content:space-between;align-items:center;}' +
            '.arc-insp-meta{font-family:monospace;font-size:9px;opacity:0.6;}' +
            '.arc-insp-cfg{font-size:9px;opacity:0.7;margin-top:3px;}' +
            '.arc-insp-actions{display:flex;gap:4px;margin-top:6px;}' +
            '.arc-insp-actions button{all:unset;box-sizing:border-box;cursor:pointer;padding:3px 7px;border-radius:3px;font-size:9px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:#e6edf3;}' +
            '.arc-insp-actions button:disabled{opacity:0.4;cursor:default;}' +
            '.arc-insp-actions .arc-del{background:rgba(255,80,80,0.15);border-color:rgba(255,80,80,0.25);margin-left:auto;}';
        var st = document.createElement('style');
        st.id = 'arc-styles'; st.textContent = css;
        document.head.appendChild(st);
    }

    // ─── INIT ───────────────────────────────────────────────────
    load();
    if (!state.tracks.length) { makeTrack('Lane 1'); makeTrack('Lane 2'); }

    window.audioComposer = {
        mount: mount,
        getState: function () { return state; },
        isPlaying: function () { return playing; },
        // Read-only accessors for the sidebar mini segments timeline
        getPlayheadMs: function () { return playheadMs; },
        getDurationMs: function () { return state.durationMs; },
        palette: TRACK_COLORS.slice(),
        // exposed for tests / programmatic use
        _capture: captureSegment,
        _play: play, _stop: stop, _applyActive: applyActive,
        _setPlayhead: function (ms) { playheadMs = ms; updatePlayhead(); }
    };
})();
