// ═══════════════════════════════════════════════════════════════════
// scripts/test/pass-profiler.js — window.__passProf, per-pass GPU timing.
//
// PAGE code. Install after perf-harness.js (it reuses nothing, but the
// two are always used together). Needs the shader inventory injected as
// window.__shaderTable first — run-passprof.js does that.
//
// WHY
// perf-harness.js answers "does this tier fit". It cannot answer "what is
// the frame actually SPENDING its time on", and at the top tiers that is
// the only question left. This one attributes every GPU microsecond to a
// named pass, so an optimisation can be aimed instead of guessed.
//
// HOW, WITHOUT TOUCHING THE APP
// Every pass in the engine funnels through blit() -> gl.drawElements, and
// blit() is lexical to 05c so it cannot be wrapped from outside. But the
// GL context is window.gl, so the three calls that matter can be:
//
//   useProgram   -> remember which program is bound (and name it, once)
//   viewport     -> remember the resolution the next draw runs at
//   drawElements -> bracket the draw in a TIME_ELAPSED query
//
// Tracking program/viewport in JS rather than asking GL each draw matters:
// gl.getParameter round-trips the command buffer, and doing that twice per
// draw would change the frame we are trying to measure.
//
// Naming: the app never records which source built a program, so the name
// is recovered from the compiled source itself — gl.getAttachedShaders ->
// gl.getShaderSource -> the sorted set of uniform names, looked up in
// inventory/shaders.json. Resolved once per program and cached.
//
// COST AND ITS LIMITS
// One query object per draw call, pooled. The GPU work is unchanged, but
// the queries serialise it: a driver that would have overlapped two passes
// must now finish the first before the second's marker. So SUM(passes) can
// exceed the frame time perf-harness reports for the same tier — the
// breakdown is where the time goes, not a second opinion on how much there
// is. Percentages are the number to read.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var GL = window.gl;
    if (!GL) return { error: 'no GL context on window.gl' };

    var ext = null;
    try { ext = GL.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (_) {}
    if (!ext) return { error: 'EXT_disjoint_timer_query_webgl2 unavailable — cannot attribute GPU time' };

    var TABLE = (window.__shaderTable && window.__shaderTable.table) || {};

    // ── Patched entry points ─────────────────────────────────────────
    var realUseProgram = GL.useProgram.bind(GL);
    var realViewport = GL.viewport.bind(GL);
    var realDrawElements = GL.drawElements.bind(GL);
    var patched = false;

    var curName = '?';
    var curW = 0, curH = 0;
    var nameCache = new Map();   // WebGLProgram -> resolved pass name

    // Uniform names a source declares, including the `uniform T a, b;` form.
    function uniformsOf(src) {
        var out = [];
        var re = /uniform\s+\w+\s+([^;]+);/g, m;
        while ((m = re.exec(src)) !== null) {
            var parts = m[1].split(',');
            for (var i = 0; i < parts.length; i++) {
                var n = parts[i].replace(/\/\/.*$/, '').replace(/\[[^\]]*\]/, '').trim();
                if (/^\w+$/.test(n) && out.indexOf(n) === -1) out.push(n);
            }
        }
        return out;
    }

    function resolveName(prog) {
        if (!prog) return '?';
        if (nameCache.has(prog)) return nameCache.get(prog);
        var name = '?';
        try {
            var shaders = GL.getAttachedShaders(prog) || [];
            for (var i = 0; i < shaders.length; i++) {
                var src = GL.getShaderSource(shaders[i]) || '';
                if (src.indexOf('fragColor') === -1) continue; // vertex shader
                var have = uniformsOf(src);
                var entry = TABLE[have.slice().sort().join('|')];   // fast path: exact
                if (!entry) {
                    // Best SUBSET fit. Nine shaders splice in shared GLSL
                    // chunks that declare uniforms of their own, so what the
                    // template declares is contained in — not equal to — what
                    // the compiled program has. The largest declared set that
                    // still fits is the right answer; smaller ones (curl's
                    // lone uVelocity) fit almost everything and must lose to
                    // it on size.
                    var best = -1;
                    Object.keys(TABLE).forEach(function (k) {
                        var cand = TABLE[k], want = cand.uniforms || [];
                        if (!want.length || want.length <= best) return;
                        for (var w = 0; w < want.length; w++) {
                            if (have.indexOf(want[w]) === -1) return;
                        }
                        best = want.length;
                        entry = cand;
                    });
                }
                if (entry) {
                    name = entry.name;
                    // Collision group: pick the member whose tiebreaker
                    // substring is actually present in this source.
                    if (entry.alts) {
                        for (var a = 0; a < entry.alts.length; a++) {
                            if (entry.alts[a].token && src.indexOf(entry.alts[a].token) !== -1) {
                                name = entry.alts[a].name;
                                break;
                            }
                        }
                    }
                }
                break;
            }
        } catch (_) {}
        nameCache.set(prog, name);
        return name;
    }

    // ── Query pool ───────────────────────────────────────────────────
    // Draw counts run to hundreds per frame at the top tiers; allocating a
    // query object per draw and dropping it would churn GC and driver
    // objects inside the very frames being measured.
    var pool = [];
    var inflight = [];     // { q, name, w, h }
    var recording = false;
    var frames = 0;
    var stats = Object.create(null);   // name -> { ms, draws, texels, res:Set }
    var dropped = 0;

    function getQuery() { return pool.pop() || GL.createQuery(); }

    function bucket(name) {
        var b = stats[name];
        if (!b) { b = stats[name] = { ms: 0, draws: 0, texels: 0, res: Object.create(null) }; }
        return b;
    }

    function drain() {
        // A GPU context switch invalidates every query in flight.
        if (GL.getParameter(ext.GPU_DISJOINT_EXT)) {
            for (var d = 0; d < inflight.length; d++) pool.push(inflight[d].q);
            dropped += inflight.length;
            inflight.length = 0;
            return;
        }
        while (inflight.length) {
            var e = inflight[0];
            if (!GL.getQueryParameter(e.q, GL.QUERY_RESULT_AVAILABLE)) break;
            inflight.shift();
            var ms = GL.getQueryParameter(e.q, GL.QUERY_RESULT) / 1e6;
            var b = bucket(e.name);
            b.ms += ms;
            b.draws++;
            b.texels += e.w * e.h;
            var key = e.w + 'x' + e.h;
            b.res[key] = (b.res[key] || 0) + 1;
            pool.push(e.q);
        }
    }

    function patch() {
        if (patched) return;
        GL.useProgram = function (p) {
            curName = resolveName(p);
            return realUseProgram(p);
        };
        GL.viewport = function (x, y, w, h) {
            curW = w; curH = h;
            return realViewport(x, y, w, h);
        };
        GL.drawElements = function (mode, count, type, offset) {
            if (!recording) return realDrawElements(mode, count, type, offset);
            var q = getQuery();
            GL.beginQuery(ext.TIME_ELAPSED_EXT, q);
            var r = realDrawElements(mode, count, type, offset);
            GL.endQuery(ext.TIME_ELAPSED_EXT);
            inflight.push({ q: q, name: curName, w: curW, h: curH });
            return r;
        };
        patched = true;
    }

    function unpatch() {
        if (!patched) return;
        GL.useProgram = realUseProgram;
        GL.viewport = realViewport;
        GL.drawElements = realDrawElements;
        patched = false;
    }

    // ── The run ──────────────────────────────────────────────────────
    // opts: { frames, warmupMs }
    //
    // The warmup is a CLOCK warmup, not a shader warmup, and it is the
    // difference between a measurement and a coin flip. A discrete GPU
    // idles at a low power state and takes seconds of sustained load to
    // reach its boost clocks. MEASURED: six back-to-back profiles of an
    // unchanging empty canvas drifted 2.795 -> 2.225 ms (-20%) while the
    // app's fps climbed 125 -> 140, monotonically, as the card woke up.
    // A frame-counted warmup of 20 frames is ~0.15s and covers none of
    // that, which is how a density experiment came to report that
    // painting made the frame FASTER: its "active" samples ran straight
    // after five seconds of uncapped painting on a fully boosted GPU,
    // and its "settled" samples after six seconds of near-idle.
    // So: run uncapped for a fixed wall-clock stretch before recording,
    // every time, whatever the caller was doing beforehand.
    function profile(opts) {
        opts = opts || {};
        var want = opts.frames || 30;
        var warmMs = opts.warmupMs != null ? opts.warmupMs : 3000;
        var raf = window.requestAnimationFrame.bind(window);

        stats = Object.create(null);
        frames = 0; dropped = 0;
        var t0 = performance.now();
        var prevCap = window.fpsCap;
        window.fpsCap = 0;

        patch();
        return new Promise(function (resolve) {
            function tick() {
                if (!recording && performance.now() - t0 >= warmMs) recording = true;
                if (recording) { frames++; drain(); }
                if (frames >= want) {
                    recording = false;
                    // Let the tail of the queue land before reading.
                    setTimeout(function () {
                        drain();
                        unpatch();
                        window.fpsCap = prevCap;
                        resolve(report());
                    }, 250);
                    return;
                }
                raf(tick);
            }
            raf(tick);
        });
    }

    function report() {
        var rows = [];
        var total = 0;
        Object.keys(stats).forEach(function (n) { total += stats[n].ms; });
        Object.keys(stats).forEach(function (n) {
            var b = stats[n];
            // Resolutions this pass ran at, commonest first — the column that
            // tells you whether a pass is expensive because it is slow or
            // because it runs at dye resolution N times a frame.
            var res = Object.keys(b.res).sort(function (a, c) { return b.res[c] - b.res[a]; });
            rows.push({
                pass: n,
                msPerFrame: +(b.ms / frames).toFixed(4),
                pctOfGpu: +(100 * b.ms / (total || 1)).toFixed(1),
                drawsPerFrame: +(b.draws / frames).toFixed(2),
                mtexelsPerFrame: +(b.texels / frames / 1e6).toFixed(2),
                res: res.slice(0, 3).map(function (k) { return k + '×' + (b.res[k] / frames).toFixed(1); })
            });
        });
        rows.sort(function (a, b2) { return b2.msPerFrame - a.msPerFrame; });
        return {
            frames: frames,
            droppedQueries: dropped,
            totalMsPerFrame: +(total / frames).toFixed(3),
            unnamed: rows.filter(function (r) { return r.pass === '?'; }).length,
            rows: rows,
            state: window.PerfTiers ? window.PerfTiers.describe() : null
        };
    }

    window.__passProf = { profile: profile, installed: true };
    return { installed: true, signatures: Object.keys(TABLE).length };
})()
