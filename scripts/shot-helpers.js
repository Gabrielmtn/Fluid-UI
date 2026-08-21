// ═══════════════════════════════════════════════════════════════════
// scripts/shot-helpers.js — installs window.__shot, the staging kit for
// baking Steam screenshots out of the real app.
//
// PAGE code, injected through the CDP harness, same as bake-store-assets.js:
//   node_modules\electron\dist\electron.exe . --remote-debugging-port=9333
//   node tmp-cdp-driver.js @scripts/shot-helpers.js      ← once, installs
//   node tmp-cdp-driver.js "__shot.paint('warm')"        ← then drive it
//   node tmp-cdp-shot.js steam/screenshots/01-name.png
//
// Steam screenshots must be ACTUAL GAMEPLAY, so everything here drives the
// real solver and the real UI — nothing is drawn into a 2D canvas after the
// fact, and no marketing text is composited on top (Valve's asset rules ask
// for gameplay, not marketing material, and a store-page bounce before the
// registration deadline is not a risk worth taking for a caption).
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Photosensitivity modal: a clean bake profile boots into the warning,
    // which would otherwise sit inside every screenshot. Acknowledge and
    // dismiss it for this profile. Protection itself STAYS ON — on static
    // compositions the protected path is verified bit-identical, so shots
    // are unaffected; a bake that needs raw dynamics (bursts, strobes) can
    // call __shot.protection(false) first.
    try {
        localStorage.setItem('fluidui.photoWarn.ack.v1', '1');
        var _pw = document.getElementById('photoWarn');
        if (_pw) _pw.hidden = true;
    } catch (e) {}

    function raf(n) {
        return new Promise(function (res) {
            (function tick() { if (--n <= 0) return res(); requestAnimationFrame(tick); })();
        });
    }

    // Palettes as pairs of hands. Screenshots of a two-player game should read
    // as two people wherever possible, so most of these are deliberately split
    // into hues that stay distinct where they mix.
    var PAL = {
        cool: [[0.16, 0.62, 0.98], [0.20, 0.86, 0.88], [0.35, 0.45, 0.98]],
        warm: [[1.00, 0.42, 0.16], [1.00, 0.66, 0.18], [0.98, 0.28, 0.42]],
        rose: [[0.98, 0.22, 0.55], [0.86, 0.30, 0.92], [1.00, 0.45, 0.70]],
        mint: [[0.20, 0.92, 0.62], [0.45, 0.95, 0.80], [0.15, 0.75, 0.70]],
        gold: [[1.00, 0.78, 0.22], [0.98, 0.55, 0.12], [1.00, 0.90, 0.55]]
    };

    function bez(p, t) {
        var u = 1 - t;
        return [
            u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1]
        ];
    }

    // One dab at radius 0.008 covers ~12% of a 1080² canvas and coverage goes
    // as radius², so strokes live down near 0.003 or the frame floods and every
    // colour averages into one wash. Measured while baking the store capsules.
    function strokeAlong(pts, pal, opts) {
        opts = opts || {};
        var steps = opts.steps || 40,
            speed = opts.speed || 380,
            radius = opts.radius || 0.0028;
        var chain = Promise.resolve();
        for (var i = 0; i <= steps; i++) {
            (function (i) {
                chain = chain.then(function () {
                    var t = i / steps;
                    var a = bez(pts, t), b = bez(pts, Math.min(1, t + 0.02));
                    var dx = b[0] - a[0], dy = b[1] - a[1];
                    var len = Math.hypot(dx, dy) || 1;
                    var ease = 0.35 + 0.65 * (1 - t);
                    window.applyMultiSplatWith(
                        a[0], a[1],
                        (dx / len) * speed * ease, (dy / len) * speed * ease,
                        pal[i % pal.length], 1,
                        radius * (0.8 + 0.3 * Math.sin(t * Math.PI)), true
                    );
                    if (i % 3 === 0) return raf(1);
                });
            })(i);
        }
        return chain;
    }

    var API = {
        // Fill the canvas box into the available area. The default box is a
        // fixed square parked left of centre, which leaves a dead gap beside
        // the sidebar in a 16:9 frame.
        // initializeCanvasPosition({fill:true}) does NOT win when the user has a
        // pinned canvas size saved, so the box is set directly and re-centred.
        fill: function () {
            var a = document.getElementById('canvas-area').getBoundingClientRect();
            var w = document.getElementById('canvas-wrapper');
            w.style.width  = Math.floor(a.width  - 48) + 'px';
            w.style.height = Math.floor(a.height - 48) + 'px';
            window.initializeCanvasPosition();
            window.updateCanvasSize();
            return raf(12);
        },

        clear: function () { window.clearCanvas(); return raf(2); },

        // Paint through the REAL input pipeline by synthesising pointer events
        // on the canvas. applyMultiSplatWith paints but is invisible to the
        // recorder — recRecordInteraction hangs off the pointer handlers in
        // 05d, so a programmatically-splatted canvas records "0 interactions"
        // and the timeline stays empty. Anything that has to look recorded, or
        // has to travel over the multiplayer wire, must come through here.
        // Points are canvas fractions, 0..1.
        drag: function (pts, opts) {
            opts = opts || {};
            var steps = opts.steps || 44;
            var c = document.getElementById('canvas');
            var r = c.getBoundingClientRect();
            function fire(type, fx, fy, buttons) {
                c.dispatchEvent(new PointerEvent(type, {
                    bubbles: true, cancelable: true,
                    pointerId: 1, pointerType: 'mouse', isPrimary: true,
                    button: 0, buttons: buttons,
                    clientX: r.left + fx * r.width,
                    clientY: r.top + fy * r.height
                }));
            }
            var chain = Promise.resolve();
            chain = chain.then(function () {
                var p = bez(pts, 0);
                fire('pointerdown', p[0], p[1], 1);
                return raf(1);
            });
            for (var i = 1; i <= steps; i++) {
                (function (i) {
                    chain = chain.then(function () {
                        var p = bez(pts, i / steps);
                        fire('pointermove', p[0], p[1], 1);
                        return raf(1);
                    });
                })(i);
            }
            return chain.then(function () {
                var p = bez(pts, 1);
                fire('pointerup', p[0], p[1], 0);
                // Per-stroke carries only clear on frames where the pointer is
                // up, so leave idle frames before the next stroke starts.
                return raf(4);
            });
        },

        // Two hands painted through real input, for the shots that need the
        // strokes to be genuinely recorded or mirrored.
        duetLive: function () {
            window.clearCanvas();
            var self = this;
            return raf(2).then(function () {
                return self.drag([[0.02, 0.86], [0.24, 0.70], [0.40, 0.58], [0.54, 0.50]]);
            }).then(function () {
                return self.drag([[0.98, 0.14], [0.80, 0.24], [0.66, 0.38], [0.54, 0.50]]);
            }).then(function () { return raf(24); });
        },

        // A two-handed composition: two streams entering from opposite corners
        // and mingling — the same picture the store capsules tell.
        duet: function (aName, bName) {
            var c = document.getElementById('canvas');
            var W = c.width, H = c.height;
            var A = PAL[aName] || PAL.cool, B = PAL[bName] || PAL.warm;
            var M = [W * 0.52, H * 0.50];
            window.clearCanvas();
            return raf(2).then(function () {
                return strokeAlong([[-0.05*W, 0.88*H], [0.20*W, 0.70*H], [0.36*W, 0.58*H], M], A,
                                   { steps: 46, speed: 400 });
            }).then(function () {
                return strokeAlong([[1.05*W, 0.10*H], [0.86*W, 0.22*H], [0.68*W, 0.36*H], M], B,
                                   { steps: 46, speed: 400 });
            }).then(function () { return raf(26); });
        },

        // A busier canvas for the group shot: several hands, several directions.
        crowd: function () {
            var c = document.getElementById('canvas');
            var W = c.width, H = c.height;
            var names = ['cool', 'warm', 'rose', 'mint', 'gold'];
            var paths = [
                [[-0.05*W, 0.30*H], [0.18*W, 0.22*H], [0.34*W, 0.40*H], [0.48*W, 0.46*H]],
                [[1.05*W, 0.72*H], [0.82*W, 0.78*H], [0.64*W, 0.60*H], [0.52*W, 0.54*H]],
                [[0.20*W, 1.06*H], [0.28*W, 0.82*H], [0.40*W, 0.68*H], [0.50*W, 0.58*H]],
                [[0.78*W, -0.06*H], [0.72*W, 0.20*H], [0.60*W, 0.34*H], [0.52*W, 0.44*H]],
                [[-0.05*W, 0.62*H], [0.16*W, 0.58*H], [0.32*W, 0.52*H], [0.44*W, 0.50*H]]
            ];
            window.clearCanvas();
            var chain = raf(2);
            paths.forEach(function (p, i) {
                chain = chain.then(function () {
                    return strokeAlong(p, PAL[names[i]], { steps: 38, speed: 360, radius: 0.0026 });
                });
            });
            return chain.then(function () { return raf(28); });
        },

        // Open the sidebar section whose header contains `label`, and (by
        // default) collapse every other one so a screenshot has exactly one
        // thing to look at. Sections carry `.collapsed` when shut, so open-ness
        // is the ABSENCE of that class — not the presence of an `.open` one.
        section: function (label, keepOthers) {
            var want = String(label).toUpperCase();
            var opened = [];
            document.querySelectorAll('#sidebar-right .sidebar-section').forEach(function (sec) {
                var h = sec.querySelector('.section-header');
                if (!h) return;
                var txt = (h.textContent || '').trim().toUpperCase();
                var isWanted = txt.indexOf(want) !== -1;
                var isOpen = !sec.classList.contains('collapsed');
                if (isWanted && !isOpen) { h.click(); opened.push(txt); }
                else if (isWanted) { opened.push(txt + ' (already open)'); }
                if (!isWanted && isOpen && !keepOthers) h.click();
            });
            return raf(6).then(function () { return opened; });
        },

        // Every section shut — the clean starting point for a staged shot.
        collapseAll: function () {
            document.querySelectorAll('#sidebar-right .sidebar-section').forEach(function (sec) {
                if (!sec.classList.contains('collapsed')) {
                    var h = sec.querySelector('.section-header');
                    if (h) h.click();
                }
            });
            return raf(6);
        },

        // Screenshots must show the app at the quality it can actually render.
        // The QualityGovernor ascends after boot and descends under load, so a
        // staged shot pins the ceiling explicitly and then takes it out of the
        // loop. Options are authored best-first.
        maxQuality: function () {
            function top(id) {
                var el = document.getElementById(id);
                if (!el || !el.options.length) return null;
                el.value = el.options[0].value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return el.value;
            }
            var q = { dye: top('visualResolution'), sim: top('physicsResolution') };
            return raf(20).then(function () {
                if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
                    window.QualityGovernor.setEnabled(false);
                }
                return { selects: q, dye: config.DYE_RESOLUTION, sim: config.SIM_RESOLUTION };
            });
        },

        // Park the pointer somewhere harmless so no hover state or brush cursor
        // lands in the middle of the shot.
        rest: function () {
            var c = document.getElementById('canvas');
            c.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
            return raf(2);
        },

        settle: function (n) { return raf(n || 20); },
        palettes: Object.keys(PAL)
    };

    // Toggle photosensitivity protection for this bake session (runtime
    // only — never persisted; the checkbox change path is trust-gated).
    API.protection = function (on) {
        if (window.config) window.config.PHOTOSAFE = !!on;
        if (on && typeof window.__photoSafeEnsure === 'function') window.__photoSafeEnsure();
    };
    window.__shot = API;
    return { installed: true, palettes: API.palettes };
})()
