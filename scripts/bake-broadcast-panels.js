// ═══════════════════════════════════════════════════════════════════
// scripts/bake-broadcast-panels.js — the two Steam Broadcast side panels,
// 199×433 each, baked FROM THE REAL SIM.
//
// PAGE code, same harness as the other bakers:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/bake-broadcast-panels.js
//
// THE BRIEF. These flank the live broadcast video on the store page. They are
// FRAMING, not content: the video is the thing being watched, and anything
// with colour or a focal point in the panels competes with it. So — many tiny
// dots, a little upward momentum, grey and white only. Embers or dust rising
// in a dark room, seen at the edge of vision.
//
// WHY SUPERSAMPLED. 199×433 is small, and the dots are 2–3px in the finished
// file. Painting at final size would land each dot on a couple of texels and
// alias into a hard square. The sim runs at whatever multiple of 199×433 fits
// the window, and the capture is scaled down — the downscale is the antialias.
//
// DAB SIZES are VISUAL extents (fraction of canvas HEIGHT) and are squared on
// the way in: the splat shader is exp(-dot(p,p) / radius) with p.x scaled by
// the aspect ratio, so `radius` is a squared length and a dab's visible extent
// is sqrt(radius), measured in units of canvas height. Passing an extent
// directly — as the other bakers in this folder do — gives a dab the square
// of the intended size.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    var DIR = 'steam/store-assets';
    var OUT_W = 199, OUT_H = 433;

    var fs = require('fs');
    var path = require('path');
    var canvas = document.getElementById('canvas');
    if (!canvas || !window.config || !window.applyMultiSplatWith) {
        return Promise.resolve({ error: 'app not ready' });
    }

    var OPT = window.__panelOpts || {};
    var GROUND = OPT.ground || '#12171f';   // sits under Steam's dark page
    var DOTS   = OPT.dots || 1700;
    var SETTLE = OPT.settle !== undefined ? OPT.settle : 11;
    var BIAS   = OPT.bias  !== undefined ? OPT.bias  : 1.4;    // bottom-weighting
    var EXT0   = OPT.ext0  !== undefined ? OPT.ext0  : 0.0026; // smallest dot
    var EXT1   = OPT.ext1  !== undefined ? OPT.ext1  : 0.0042; // size spread
    var LIFT0  = OPT.lift0 !== undefined ? OPT.lift0 : 6;      // base upward nudge
    var LIFT1  = OPT.lift1 !== undefined ? OPT.lift1 : 18;     // extra for the low ones
    var DRIFT  = OPT.drift !== undefined ? OPT.drift : 8;      // sideways jitter
    var LANES  = OPT.lanes !== undefined ? OPT.lanes : 4;      // stirring paths
    var CURRENT= OPT.current !== undefined ? OPT.current : 90; // their speed
    var VMIN   = OPT.vmin  !== undefined ? OPT.vmin  : 0.40;   // dimmest dot
    var VMAX   = OPT.vmax  !== undefined ? OPT.vmax  : 1.00;   // brightest dot

    // MOTION ISOLATION (index.html:583, config.VELOCITY_INFLUENCE, range 1–5).
    // High means an incoming dab does NOT shove paint that has already settled,
    // which is what the mandala rig wants and what the 2.5 default leans
    // toward. It is also why the first panels had no fluid in them: 1500 dots
    // each landed in its own little world, nothing stirred anything else, and
    // the field came out as scattered stamps. At 1 the dabs push each other
    // around and the wakes start showing.
    var ISO   = OPT.motionIsolation !== undefined ? OPT.motionIsolation : 1;

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }

    try {
        var win = require('@electron/remote').getCurrentWindow();
        if (win && !win.isMaximized()) win.maximize();
    } catch (e) {}

    function selectTop(id) {
        var el = document.getElementById(id);
        if (!el || !el.options.length) return null;
        el.value = el.options[0].value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
    }
    function forceMaxQuality() {
        selectTop('visualResolution');
        selectTop('physicsResolution');
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
            window.QualityGovernor.setEnabled(false);
        }
    }

    function setCheck(el, v) {
        if (!el || el.checked === !!v) return;
        el.checked = !!v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setBox(w, h) {
        var wrap = document.getElementById('canvas-wrapper');
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        window.initializeCanvasPosition();
        window.updateCanvasSize();
        return raf(12);
    }
    function stripCanvasContent() {
        try {
            if (Array.isArray(window.layers) && typeof window.deleteLayer === 'function') {
                window.layers.map(function (l) { return l.index; })
                    .forEach(function (id) { try { window.deleteLayer(id); } catch (_) {} });
            }
        } catch (_) {}
        try {
            if (window.Masks && window.Masks.list && window.Masks.remove) {
                (window.Masks.list() || []).slice().forEach(function (m) {
                    try { window.Masks.remove(m && m.id !== undefined ? m.id : m); } catch (_) {}
                });
            }
        } catch (_) {}
        try { if (window.rasterLayers && window.rasterLayers.clear) window.rasterLayers.clear(); } catch (_) {}
        try {
            if (window.brandingOverlays && window.brandingOverlays.clearAll) window.brandingOverlays.clearAll();
        } catch (_) {}
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
    }

    function grab() {
        var c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(canvas, 0, 0);
        return c;
    }
    var written = [];
    function write(name, c) {
        var d = path.join(process.cwd(), DIR);
        fs.mkdirSync(d, { recursive: true });
        var buf = Buffer.from(c.toDataURL('image/png').split(',')[1], 'base64');
        fs.writeFileSync(path.join(d, name), buf);
        written.push({ name: name, kb: Math.round(buf.length / 1024) });
    }

    var _realRandom = Math.random;
    var _rng = _realRandom;
    function seed(sv) {
        var x = sv >>> 0 || 1;
        _rng = function () {
            x ^= x << 13; x >>>= 0;
            x ^= x >> 17;
            x ^= x << 5;  x >>>= 0;
            return x / 4294967296;
        };
        Math.random = _rng;
    }
    function unseed() { Math.random = _realRandom; _rng = _realRandom; }
    function rnd() { return _rng(); }

    // Sim setup. Kaleido is a STICKY display state — it was left on by the
    // kaleidoscope bake, and a panel folded into twelve segments is not a
    // field of dots. Explicitly off, through the real control so the UI agrees.
    window.__exporting = true;
    setCheck(document.getElementById('kaleidoToggle'), false);
    window.kaleidoEnabled = false;
    var lightShiftWas = !!(window.lightShift && window.lightShift.enabled);
    if (window.lightShift) window.lightShift.enabled = false;   // grey must stay grey
    config.GLOW = false;                                        // bloom would fuse the dots

    function dabFor(visual) { return visual * visual; }

    var W, H;

    // ── The current ───────────────────────────────────────────────────
    // Swirls are a property of the VELOCITY FIELD, not of individual dabs.
    // Two passes proved that the hard way: 1500 dots each carrying its own
    // little upward push produced 1500 little upward plumes and no flow at
    // all, because nothing in the frame was moving at a scale larger than one
    // dot. Raising the push per dot only made the plumes longer.
    //
    // So the field is laid down FIRST, with splats whose colour is pure black.
    // The splat pass is additive, so a black dab contributes no dye whatsoever
    // while still injecting its full velocity — an invisible stirring stick.
    // The dots go in afterwards and are carried by what is already moving,
    // which is what makes them trace ribbons and eddies instead of standing in
    // place with tails.
    var BLACK = [0, 0, 0];
    function current(lanes) {
        var chain = Promise.resolve();
        for (var L = 0; L < lanes; L++) {
            (function (L) {
                // Meandering bottom-to-top paths, each with its own phase, so
                // neighbouring lanes shear against each other and roll up.
                var x0 = ((L + 0.5) / lanes) * W;
                var amp = W * (0.16 + 0.22 * rnd());
                var ph = rnd() * Math.PI * 2;
                var freq = 1.4 + 1.6 * rnd();
                var dir = rnd() < 0.5 ? 1 : -1;
                var steps = 26;
                for (var i = 0; i <= steps; i++) {
                    (function (i) {
                        chain = chain.then(function () {
                            var t = i / steps;
                            var y = (1.04 - 1.08 * t) * H;              // bottom to top
                            var x = x0 + Math.sin(ph + t * Math.PI * freq) * amp * dir;
                            var t2 = Math.min(1, t + 0.04);
                            var yn = (1.04 - 1.08 * t2) * H;
                            var xn = x0 + Math.sin(ph + t2 * Math.PI * freq) * amp * dir;
                            var dx = xn - x, dy = yn - y;
                            var len = Math.hypot(dx, dy) || 1;
                            var sp = CURRENT * (0.6 + 0.4 * Math.sin(t * Math.PI));
                            window.applyMultiSplatWith(
                                x, y, (dx / len) * sp, (dy / len) * sp,
                                BLACK, 1, dabFor(0.075), true
                            );
                            if (i % 3 === 0) return raf(1);
                        });
                    })(i);
                }
            })(L);
        }
        return chain;
    }

    // One panel: dust rising in a dark room.
    function panel(sv) {
        return setBox(BOX_W, BOX_H).then(function () {
            W = canvas.width; H = canvas.height;
            seed(sv);
            window.clearCanvas();
            return raf(3);
        }).then(function () {
            return current(LANES);
        }).then(function () {
            var chain = Promise.resolve();
            for (var i = 0; i < DOTS; i++) {
                (function () {
                    chain = chain.then(function () {
                        // Denser low, thinning upward: the density gradient is
                        // what reads as rising, more than the motion does — and
                        // it costs nothing in legibility, where motion does.
                        var ty = 1 - Math.pow(rnd(), BIAS);      // biased to the bottom
                        var x = rnd() * W;
                        var y = ty * H;

                        // Grey to white, never coloured. A hair cool so it sits
                        // against Steam's blue-grey page rather than glowing.
                        var v = VMIN + (VMAX - VMIN) * Math.pow(rnd(), 1.3);
                        var col = [v * 0.94, v * 0.97, v];

                        // Tiny: a fraction of canvas HEIGHT, so ~1–3px once the
                        // capture is scaled down to 433 tall.
                        var ext = EXT0 + EXT1 * Math.pow(rnd(), 2);

                        // "A LITTLE upward momentum" is the whole spec, and the
                        // first pass overshot it: at lift 38–158 with 20 frames
                        // to settle, every dot grew a tail and the field read as
                        // flames rather than dust. A nudge, and barely any time
                        // to act on it. Screen y runs DOWN, so up is negative.
                        // Only a whisper of its own now — the current supplies
                        // the motion, and a dot that fights it goes back to
                        // being a plume.
                        var lift = -(LIFT0 + LIFT1 * ty * rnd());
                        var drift = (rnd() - 0.5) * DRIFT;

                        window.applyMultiSplatWith(x, y, drift, lift, col, 1, dabFor(ext), true);
                        if (i % 6 === 0) return raf(1);
                    });
                })();
            }
            return chain;
        }).then(function () { return raf(SETTLE); }).then(function () {
            unseed();
            return grab();
        });
    }

    // Downscale is the antialias — see header. Two steps when the ratio is
    // large, because a single huge drawImage step drops detail between texels.
    function toPanel(src) {
        var cur = src;
        while (cur.width > OUT_W * 2) {
            var h = document.createElement('canvas');
            h.width = Math.max(OUT_W, Math.round(cur.width / 2));
            h.height = Math.max(OUT_H, Math.round(cur.height / 2));
            var hx = h.getContext('2d');
            hx.imageSmoothingQuality = 'high';
            hx.drawImage(cur, 0, 0, h.width, h.height);
            cur = h;
        }
        var c = document.createElement('canvas');
        c.width = OUT_W; c.height = OUT_H;
        var x = c.getContext('2d');
        x.fillStyle = GROUND;
        x.fillRect(0, 0, OUT_W, OUT_H);
        x.imageSmoothingQuality = 'high';
        x.drawImage(cur, 0, 0, OUT_W, OUT_H);
        return c;
    }

    // Paint as large as the window allows, capped at 3× — past that the sim is
    // just doing work the downscale throws away.
    var scale = Math.max(1.6, Math.min(3, (window.innerHeight - 140) / OUT_H));
    var BOX_W = Math.round(OUT_W * scale), BOX_H = Math.round(OUT_H * scale);

    function setRange(el, v) {
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    stripCanvasContent();
    if (window.applyPreset) { try { window.applyPreset('wispy'); } catch (_) {} }
    forceMaxQuality();          // a preset apply carries the resolution selects with it

    // Curl is vorticity confinement — it is the swirl. The first pass pinned it
    // to 6, which with 8 settle frames left the velocity field no chance to do
    // anything visible. 'wispy' ships 60; this sits under that so the dots stay
    // dots and only their wakes curl.
    config.CURL = OPT.curl !== undefined ? OPT.curl : 26;

    // Driven through the real slider so the Simulation panel agrees with what
    // was actually baked, then asserted on config in case the binding is not
    // wired for this id.
    setRange(document.getElementById('velocityInfluence'), ISO);
    config.VELOCITY_INFLUENCE = ISO;

    // Dry–Wet stays at 0 = pure fluid (index.html:606). Anything above 0 makes
    // dry regions set harder and hold their edges, which is the opposite of
    // the wetness being asked for here.
    setRange(document.getElementById('wetInfluence'), OPT.wet !== undefined ? OPT.wet : 0);

    return panel(0xB1A5).then(function (img) {
        write('broadcast_left_199x433.png', toPanel(img));
        return panel(0x7C3E);
    }).then(function (img) {
        write('broadcast_right_199x433.png', toPanel(img));
    }).then(function () {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { written: written, paintedAt: [BOX_W, BOX_H], scale: Math.round(scale * 100) / 100,
                 canvas: [W, H], dots: DOTS };
    }).catch(function (e) {
        window.__exporting = false;
        if (window.lightShift) window.lightShift.enabled = lightShiftWas;
        unseed();
        return { error: String(e && e.stack || e), written: written };
    });
})()
