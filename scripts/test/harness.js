// ═══════════════════════════════════════════════════════════════════
// scripts/test/harness.js — window.__test, the deterministic test kit.
//
// PAGE code, injected over CDP (scripts/test/cdp.js) into the running
// app — Electron build or the web build in Chromium; the kit only
// touches web-standard surfaces.
//
// THE CORE IDEA — a virtual clock. The frame loop (js/05j update()) is
// wall-clock: dt comes from performance.now() deltas and the loop
// self-schedules on requestAnimationFrame. freeze() stubs BOTH, so the
// loop lands in a queue the harness pumps by hand:
//
//   await __test.freeze();      // capture the loop; time stops
//   __test.seed(0xC0FFEE);      // pin Math.random
//   __test.stroke(...);         // deposit deterministic input
//   await __test.step(120);     // 120 frames of exactly 16.667ms each
//   __test.hashState();         // FNV-1a over dye+velocity float bytes
//   __test.thaw();              // restore real time
//
// Two runs of the same recipe are bit-identical (same technique that
// verified P15-1 wetness and the splat-scissor as zero-mismatch), so a
// changed hash after a refactor means the sim genuinely changed.
//
// Determinism preconditions the recipe must pin (freeze() does NOT do
// these for you — they are scenario policy, see run-regression.js):
//   • Math.random seeded (mutations, palette picks, splat jitter)
//   • fpsCap 0 or 60 — other caps skip virtual frames by design
//   • audio-reactive off, multiplayer disconnected, oscillators off
//   • fixed canvas box + fixed resolution selects (FBO sizes)
//
// Readback: window.density/.velocity double-FBOs expose .read.fbo, and
// gl.readPixels(..., gl.FLOAT, ...) works on them — the same instrument
// js/08b's grain() uses. Full-res dye at 4096 is a ~140MB transfer, so
// scenarios pin LOW resolution selects for speed; hashes at test res
// answer "did it change", not "is it pretty".
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    if (window.__test) return Promise.resolve({ installed: 'already' });

    var canvas = document.getElementById('canvas');
    if (!canvas || !window.config || !window.applyMultiSplatWith) {
        return Promise.resolve({ error: 'app not ready' });
    }

    // gl is a top-level classic-script binding (04a); reachable from the
    // global lexical scope this injected code evaluates in.
    var GL = (typeof gl !== 'undefined') ? gl : window.gl;

    // ── Virtual clock ──────────────────────────────────────────────────
    // The REAL handles are stashed once per page under __testReal, so a
    // re-install can never mistake a previous instance's stubs for the
    // real thing (measured: doing so strands the frame loop in the old
    // instance's queue and freeze() times out; the only recovery is an
    // app restart — always thaw() before replacing the kit).
    var R = window.__testReal || (window.__testReal = {
        raf: window.requestAnimationFrame.bind(window),
        cancelRaf: window.cancelAnimationFrame.bind(window),
        now: performance.now.bind(performance),
        random: Math.random,
    });
    var realRaf = R.raf;
    var realCancelRaf = R.cancelRaf;
    var realNow = R.now;
    var realRandom = R.random;

    var frozen = false;
    var virtualNow = 0;
    var queue = [];          // [{id, cb}]
    var nextCbId = 1;
    var FRAME_MS = 1000 / 60;

    function vRaf(cb) {
        var id = nextCbId++;
        queue.push({ id: id, cb: cb });
        return id;
    }
    function vCancel(id) {
        queue = queue.filter(function (e) { return e.id !== id; });
    }

    // freeze(): install the stubs, then wait for the app's self-scheduled
    // loop to land in our queue. The currently-pending REAL rAF callback
    // still fires once (it was registered before the stub); that firing
    // re-schedules through the stub, and from then on time is ours.
    function freeze() {
        if (frozen) return Promise.resolve({ frozen: true, note: 'already' });
        // A CONSTANT epoch, not realNow(): any nowMs-keyed behaviour
        // (oscillator clocks, % period tasks, threshold timers) otherwise
        // fires at a different frame index per boot — the divergence
        // probe had frames 1-40 bit-identical cross-boot and frame-60
        // splitting. Must exceed any real uptime at freeze so the first
        // frame's wallDt is a forward jump (clamped to 16ms), never
        // negative: 10,000,000ms ≈ 2.8h > any boot-to-freeze gap.
        virtualNow = 10000000;
        performance.now = function () { return virtualNow; };
        window.requestAnimationFrame = vRaf;
        window.cancelAnimationFrame = vCancel;
        frozen = true;
        return new Promise(function (resolve, reject) {
            var t0 = Date.now();
            (function poll() {
                if (queue.length > 0) return resolve({ frozen: true, queued: queue.length });
                if (Date.now() - t0 > 2000) {
                    return reject(new Error('frame loop never landed in the virtual queue — is the sim paused?'));
                }
                setTimeout(poll, 10);
            })();
        });
    }

    // step(n): advance the virtual clock n frames. Each pump takes the
    // CURRENT queue (callbacks scheduled during a frame run on the NEXT
    // frame, exactly like real rAF) and yields to the macrotask queue
    // between frames so GPU work and promise chains interleave sanely.
    function step(n) {
        n = n || 1;
        return new Promise(function (resolve) {
            (function one() {
                if (n-- <= 0) return resolve({ now: virtualNow });
                virtualNow += FRAME_MS;
                var batch = queue;
                queue = [];
                for (var i = 0; i < batch.length; i++) {
                    try { batch[i].cb(virtualNow); } catch (e) { errors.push('rAF cb: ' + e.message); }
                }
                setTimeout(one, 0);
            })();
        });
    }

    function thaw() {
        if (!frozen) return { thawed: false };
        performance.now = realNow;
        window.requestAnimationFrame = realRaf;
        window.cancelAnimationFrame = realCancelRaf;
        frozen = false;
        // Hand the queued loop back to real time.
        var batch = queue;
        queue = [];
        batch.forEach(function (e) { realRaf(e.cb); });
        return { thawed: true };
    }

    // ── Seeded randomness ──────────────────────────────────────────────
    function seed(s) {
        var x = s >>> 0 || 1;
        Math.random = function () {
            x ^= x << 13; x >>>= 0;
            x ^= x >> 17;
            x ^= x << 5;  x >>>= 0;
            return x / 4294967296;
        };
        return { seeded: s >>> 0 };
    }
    function unseed() { Math.random = realRandom; return { seeded: false }; }

    // ── Error capture ──────────────────────────────────────────────────
    var errors = [];
    var realConsoleError = console.error;
    console.error = function () {
        errors.push(Array.prototype.slice.call(arguments).map(String).join(' '));
        return realConsoleError.apply(console, arguments);
    };
    window.addEventListener('error', function (e) {
        errors.push('window.onerror: ' + e.message);
    });

    // ── Readback, stats, hashes ────────────────────────────────────────
    function readFBO(target, w, h) {
        var buf = new Float32Array(w * h * 4);
        GL.bindFramebuffer(GL.FRAMEBUFFER, target.read.fbo);
        GL.readPixels(0, 0, w, h, GL.RGBA, GL.FLOAT, buf);
        GL.bindFramebuffer(GL.FRAMEBUFFER, null);
        return buf;
    }

    // FNV-1a over the float buffer's raw bytes: any bit anywhere flips
    // the hash — this is the bit-identity instrument.
    function fnv(buf) {
        var bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        var h = 0x811c9dc5;
        for (var i = 0; i < bytes.length; i++) {
            h ^= bytes[i];
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
    }

    // Scalar field metrics: the sweep instrument. Hashes answer "did
    // anything change"; these answer "how much, and is it broken".
    function fieldStats(buf, w, h) {
        var n = w * h, sum = 0, max = 0, nan = 0, covered = 0;
        for (var i = 0; i < n; i++) {
            var j = i * 4;
            var r = buf[j], g = buf[j + 1], b = buf[j + 2];
            if (r !== r || g !== g || b !== b) { nan++; continue; }
            var m = Math.max(Math.abs(r), Math.abs(g), Math.abs(b));
            sum += m;
            if (m > max) max = m;
            if (m > 0.01) covered++;
        }
        return {
            mean: sum / n,
            max: max,
            nan: nan,
            coverage: covered / n,
        };
    }

    function snapshotState(opts) {
        opts = opts || {};
        var out = { at: virtualNow };
        if (window.density && window.density.read) {
            var dw = window.dyeTexWidth, dh = window.dyeTexHeight;
            var d = readFBO(window.density, dw, dh);
            out.dye = fieldStats(d, dw, dh);
            out.dye.hash = fnv(d);
            out.dye.res = dw + 'x' + dh;
        }
        if (!opts.dyeOnly && window.velocity && window.velocity.read) {
            var sw = window.simTexWidth, sh = window.simTexHeight;
            var v = readFBO(window.velocity, sw, sh);
            out.vel = fieldStats(v, sw, sh);
            out.vel.hash = fnv(v);
            out.vel.res = sw + 'x' + sh;
        }
        if (opts.display) out.display = displaySnapshot();
        return out;
    }

    // Display-side instrument. The sim hashes are blind to the whole
    // post-FX/display chain (sharpen, micro detail, glow, kaleido,
    // shading render into scratch FBOs and the default framebuffer, never
    // back into density) — measured: the Ridges LOOK changes with amount
    // while the dye hash stays put. So look-response questions need the
    // rendered canvas. drawImage into 2D works regardless of
    // preserveDrawingBuffer (the bakers' proven grab() idiom); quarter
    // res keeps it cheap and still catches any visible change.
    function displaySnapshot() {
        var w = Math.max(1, canvas.width >> 2), h = Math.max(1, canvas.height >> 2);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(canvas, 0, 0, w, h);
        var img = x.getImageData(0, 0, w, h);
        var px = img.data, n = w * h;
        var sum = 0, max = 0;
        for (var i = 0; i < n; i++) {
            var j = i * 4;
            var lum = (px[j] * 0.2126 + px[j + 1] * 0.7152 + px[j + 2] * 0.0722) / 255;
            sum += lum;
            if (lum > max) max = lum;
        }
        var bytes = new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
        var hh = 0x811c9dc5;
        for (var k = 0; k < bytes.length; k++) {
            hh ^= bytes[k];
            hh = (hh + ((hh << 1) + (hh << 4) + (hh << 7) + (hh << 8) + (hh << 24))) >>> 0;
        }
        return {
            hash: ('00000000' + hh.toString(16)).slice(-8),
            meanLum: sum / n,
            maxLum: max,
            res: w + 'x' + h,
        };
    }

    // ── Canonical input ────────────────────────────────────────────────
    function bez(p, t) {
        var u = 1 - t;
        return [
            u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]
        ];
    }

    // Splat-path stroke: deterministic dye+velocity deposit through
    // applyMultiSplatWith (exact colour, explicit radius). All dabs land
    // between two step() frames — the sim advects them when you step.
    function stroke(opts) {
        opts = opts || {};
        var pts = opts.pts || [[0.10, 0.70], [0.38, 0.45], [0.62, 0.55], [0.90, 0.30]];
        var steps = opts.steps || 40;
        var color = opts.color || [0.2, 0.6, 1.0];
        var radius = opts.radius || 0.003;
        var speed = opts.speed || 400;
        var W = canvas.width, H = canvas.height;
        for (var i = 0; i <= steps; i++) {
            var t = i / steps;
            var a = bez(pts, t), b = bez(pts, Math.min(1, t + 0.02));
            var dx = b[0] - a[0], dy = b[1] - a[1];
            var len = Math.hypot(dx, dy) || 1;
            // exactColor defaults TRUE (deterministic colour, arm colours
            // bypassed). Pass exact:false to route through resolveArmColor
            // — required for anything that rides __brushTipOn, which
            // multiSplat sets only for non-exact calls (05g:259): brush
            // tips, custom stamps and per-arm colours are all invisible
            // to an exact-colour stroke.
            window.applyMultiSplatWith(
                a[0] * W, a[1] * H,
                (dx / len) * speed, (dy / len) * speed,
                color, opts.mult || 1, radius, opts.exact !== false);
        }
        return { dabs: steps + 1 };
    }

    // Pointer-path stroke: the REAL input pipeline (05d handlers), for
    // input tests and anything that must exercise brush-engine spacing,
    // pressure stamps, or recording. Interleaves pointermoves with
    // virtual frames, so it must be awaited while frozen.
    function pointerStroke(opts) {
        opts = opts || {};
        var pts = opts.pts || [[0.2, 0.6], [0.4, 0.4], [0.6, 0.6], [0.8, 0.4]];
        var steps = opts.steps || 30;
        var r = canvas.getBoundingClientRect();
        function fire(type, fx, fy, buttons) {
            canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true,
                pointerId: 1, pointerType: opts.pointerType || 'mouse', isPrimary: true,
                button: 0, buttons: buttons,
                clientX: r.left + fx * r.width,
                clientY: r.top + fy * r.height,
                pressure: buttons ? (opts.pressure != null ? opts.pressure : 0.5) : 0,
            }));
        }
        var p0 = bez(pts, 0);
        fire('pointerdown', p0[0], p0[1], 1);
        var chain = step(1);
        for (var i = 1; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var p = bez(pts, i / steps);
                    fire('pointermove', p[0], p[1], 1);
                    return step(1);
                });
            })(i);
        }
        return chain.then(function () {
            var p1 = bez(pts, 1);
            fire('pointerup', p1[0], p1[1], 0);
            return step(2);
        });
    }

    // Synthesized keyboard input for hotkey tests.
    function key(spec) {
        // spec: {key, code, ctrlKey, shiftKey, altKey, target}
        var t = spec.target ? document.querySelector(spec.target) : document.body;
        ['keydown', 'keyup'].forEach(function (type) {
            t.dispatchEvent(new KeyboardEvent(type, {
                bubbles: true, cancelable: true,
                key: spec.key, code: spec.code || undefined,
                ctrlKey: !!spec.ctrlKey, shiftKey: !!spec.shiftKey,
                altKey: !!spec.altKey, metaKey: !!spec.metaKey,
            }));
        });
        return { fired: spec.key };
    }

    // ── Param + scenario helpers ───────────────────────────────────────
    function setSlider(id, value) {
        var el = document.getElementById(id);
        if (!el) return { error: 'no #' + id };
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { id: id, value: el.value };
    }
    function setCheckbox(id, on) {
        var el = document.getElementById(id);
        if (!el) return { error: 'no #' + id };
        if (el.checked !== !!on) {
            el.checked = !!on;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return { id: id, checked: el.checked };
    }
    function setSelect(id, value) {
        var el = document.getElementById(id);
        if (!el) return { error: 'no #' + id };
        el.value = String(value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { id: id, value: el.value };
    }

    // clearCanvas wipes dye+velocity only; PRESSURE persists as solver
    // warm-start (and the wetness field persists too, when P15-1 is on).
    // Measured: back-to-back seeded runs differed in hash until these
    // were zeroed — run B was warm-starting from run A's pressure.
    function clearFBOPair(pair) {
        if (!pair) return;
        [pair.read, pair.write].forEach(function (f) {
            if (!f || !f.fbo) return;
            GL.bindFramebuffer(GL.FRAMEBUFFER, f.fbo);
            GL.clearColor(0, 0, 0, 0);
            GL.clear(GL.COLOR_BUFFER_BIT);
        });
        GL.bindFramebuffer(GL.FRAMEBUFFER, null);
    }
    function clear() {
        window.clearCanvas();
        clearFBOPair(window.pressure);
        clearFBOPair(window.wetness);
        return { cleared: true, pressure: !!window.pressure, wetness: !!window.wetness };
    }

    window.__test = {
        freeze: freeze, step: step, thaw: thaw,
        seed: seed, unseed: unseed,
        snapshotState: snapshotState, displaySnapshot: displaySnapshot,
        stroke: stroke, pointerStroke: pointerStroke, key: key,
        setSlider: setSlider, setCheckbox: setCheckbox, setSelect: setSelect,
        clear: clear,
        errors: function (reset) {
            var e = errors.slice();
            if (reset) errors.length = 0;
            return e;
        },
        frozen: function () { return frozen; },
    };

    return Promise.resolve({
        installed: true,
        gl: !!GL,
        dye: window.dyeTexWidth + 'x' + window.dyeTexHeight,
        sim: window.simTexWidth + 'x' + window.simTexHeight,
    });
})()
