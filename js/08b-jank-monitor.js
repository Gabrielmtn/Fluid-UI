// ═══════════════════════════════════════════════════════════════════
// js/08b-jank-monitor.js — Phase 2 Stage 0 instrumentation (TODO.md)
// LOAD ORDER: after 08a-quality-governor.js
// PROVIDES: window.JankMonitor — attributes dropped frames + long tasks
//   to the UI interaction that caused them (hover/click on mixer-strip
//   channels, sidebar sections, drawers), so every Stage 1/2 audit item
//   gets a before/after number instead of a feeling.
// Dev instrumentation: passive capture-phase listeners + one extra rAF
// callback; zero cost to the sim path and no behavior changes.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    var DROP_FACTOR = 1.6;   // frame gap > 1.6× the display's median = dropped frame(s)
    var WINDOW_MS = 600;     // how long after an interaction we attribute jank to it

    var lastT = 0;
    var expected = 16.7;     // adapts to actual display cadence (median of recent gaps)
    var deltas = [];
    var interactions = [];   // ring buffer of closed interaction windows
    var current = null;      // open interaction window
    var totals = { frames: 0, dropped: 0, longTasks: 0, worstTask: 0 };

    // ── Frame cadence observer ─────────────────────────────────────
    function tick(t) {
        if (lastT) {
            var d = t - lastT;
            totals.frames++;
            if (d < 100) { deltas.push(d); if (deltas.length > 120) deltas.shift(); }
            if (deltas.length >= 30) {
                var s = deltas.slice().sort(function (a, b) { return a - b; });
                expected = s[s.length >> 1];
            }
            var dropped = d > expected * DROP_FACTOR ? Math.round(d / expected) - 1 : 0;
            if (dropped > 0) {
                totals.dropped += dropped;
                if (current) {
                    current.dropped += dropped;
                    if (d > current.worstGap) current.worstGap = d;
                    // fine attribution: what was under the pointer when the
                    // frame actually dropped (merged hover windows span many
                    // targets; this pins the damage to the right one)
                    current.dropAt[hoverLabel] = (current.dropAt[hoverLabel] || 0) + dropped;
                }
            }
        }
        lastT = t;
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // ── Long-task observer (main-thread stalls ≥50ms) ──────────────
    try {
        var po = new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (e) {
                totals.longTasks++;
                if (e.duration > totals.worstTask) totals.worstTask = e.duration;
                if (current) {
                    current.longTasks++;
                    if (e.duration > current.worstTask) current.worstTask = e.duration;
                }
            });
        });
        po.observe({ entryTypes: ['longtask'] });
    } catch (_) { /* older engines: frame-gap detection still works */ }

    // ── Interaction windows ─────────────────────────────────────────
    function begin(label) {
        var t = performance.now();
        if (current && t < current.deadline) {
            // rapid-fire (hover storms): extend the window, merge labels
            current.deadline = t + WINDOW_MS;
            if (current.label.indexOf(label) === -1 && current.label.length < 80) {
                current.label += ' + ' + label;
            }
            return;
        }
        finish();
        current = { label: label, start: t, deadline: t + WINDOW_MS,
                    dropped: 0, longTasks: 0, worstTask: 0, worstGap: 0, dropAt: {} };
    }
    function finish() {
        if (!current) return;
        var rec = current;
        current = null;
        rec.end = performance.now();
        interactions.push(rec);
        if (interactions.length > 100) interactions.shift();
        if (rec.dropped || rec.longTasks) {
            console.debug('[Jank] ' + rec.label + ': ' + rec.dropped + ' dropped frame(s), '
                + rec.longTasks + ' long task(s)'
                + (rec.worstTask ? ' (worst ' + Math.round(rec.worstTask) + 'ms)' : ''));
        }
        renderStats();
    }
    setInterval(function () {
        if (current && performance.now() > current.deadline) finish();
    }, 250);

    // ── Delegated interaction hooks (capture phase, passive) ───────
    function labelFor(el) {
        var sec = el.closest && el.closest('.sidebar-section');
        if (sec) {
            var h = sec.querySelector('.section-header');
            return 'sidebar:' + (h && h.textContent ? h.textContent.trim().slice(0, 24) : 'section');
        }
        var ch = el.closest && el.closest('.mixer-channel');
        if (ch) {
            var l = ch.querySelector('.ch-label');
            return 'strip:' + (l && l.textContent ? l.textContent.trim().slice(0, 16) : 'channel');
        }
        if (el.id) return '#' + el.id;
        return (el.tagName || 'node').toLowerCase();
    }
    function inUI(el) {
        return !!(el.closest && (el.closest('#sidebar-right') || el.closest('#mixer-strip')
            || el.closest('.rec-drawer') || el.closest('#statsPanel')));
    }
    var hoverLabel = '(none)'; // whatever is under the pointer right now
    document.addEventListener('mouseover', function (e) {
        var t = e.target;
        if (!t || t.nodeType !== 1) return;
        hoverLabel = labelFor(t);
        if (inUI(t)) begin('hover ' + hoverLabel);
    }, { capture: true, passive: true });
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.nodeType === 1 && inUI(t)) begin('click ' + labelFor(t));
    }, { capture: true, passive: true });

    // ── Stats For Nerds section (lazy: panel exists at load, section
    //    appended once; cheap textContent updates only) ──────────────
    var rows = null;
    function ensureSection() {
        if (rows) return true;
        var content = document.querySelector('#statsPanel .stats-content');
        if (!content) return false;
        var sec = document.createElement('div');
        sec.className = 'stats-section';
        sec.innerHTML = '<div class="stats-title">UI Jank</div>'
            + '<div class="stat-row"><span class="stat-label">Dropped frames:</span> <span id="stat-jank-dropped">0</span></div>'
            + '<div class="stat-row"><span class="stat-label">Long tasks:</span> <span id="stat-jank-tasks">0</span></div>'
            + '<div class="stat-row"><span class="stat-label">Worst task:</span> <span id="stat-jank-worst">--</span></div>'
            + '<div class="stat-row"><span class="stat-label">Last interaction:</span> <span id="stat-jank-last">--</span></div>';
        content.appendChild(sec);
        rows = {
            dropped: sec.querySelector('#stat-jank-dropped'),
            tasks: sec.querySelector('#stat-jank-tasks'),
            worst: sec.querySelector('#stat-jank-worst'),
            last: sec.querySelector('#stat-jank-last')
        };
        return true;
    }
    function renderStats() {
        if (!ensureSection()) return;
        rows.dropped.textContent = totals.dropped;
        rows.tasks.textContent = totals.longTasks;
        rows.worst.textContent = totals.worstTask ? Math.round(totals.worstTask) + 'ms' : '--';
        var last = interactions[interactions.length - 1];
        rows.last.textContent = last
            ? last.label.slice(0, 30) + ' — ' + last.dropped + ' drop / ' + last.longTasks + ' task'
            : '--';
    }
    setInterval(renderStats, 1000);

    // ── Public API for the audit ────────────────────────────────────
    window.JankMonitor = {
        totals: totals,
        interactions: interactions,
        // last n interactions with their damage
        report: function (n) {
            return interactions.slice(-(n || 10)).map(function (r) {
                return { label: r.label, dropped: r.dropped, longTasks: r.longTasks,
                         worstTask: Math.round(r.worstTask), worstGap: Math.round(r.worstGap),
                         dropAt: r.dropAt };
            });
        },
        // the offenders, ranked — this list IS the Stage 1/2 work queue
        worst: function (n) {
            return interactions.slice()
                .sort(function (a, b) { return (b.dropped + b.longTasks) - (a.dropped + a.longTasks); })
                .slice(0, n || 10)
                .map(function (r) {
                    return { label: r.label, dropped: r.dropped, longTasks: r.longTasks,
                             worstTask: Math.round(r.worstTask), dropAt: r.dropAt };
                });
        },
        reset: function () {
            totals.frames = 0; totals.dropped = 0; totals.longTasks = 0; totals.worstTask = 0;
            interactions.length = 0;
            renderStats();
        }
    };
})();
