/* ================================================================
   37 - NAV IDLE GLOW (easter egg)

   The sidebar's three label runs each render as one continuous oklch ramp
   (see "Section group colours" in css/21-sidebar.css). After two minutes with
   nobody touching anything, those ramps start to drift; the first input eases
   them back to their exact resting colours.

   It carries no information. It is only there for the person who walks away
   mid-painting and looks back.

   MODEL - the thing that eases is the AMPLITUDE, not a target colour.
   A continuous oscillation runs at a fixed period; every offset it produces is
   multiplied by `amp`, which eases toward 1 while idle and 0 while active. So
   waking at ANY point in the cycle lands back on the resting values exactly,
   with no snap and nothing to store. Easing toward a target colour instead
   would need the rest state remembered and would snap whenever a wake landed
   mid-transit.

   COST - the loop does not run while awake. It stops once amp settles, and
   restarts on the idle transition, so an active session pays only the four
   passive listeners.

   WHY IT WRITES PER LABEL. The obvious shape is three writes per frame: set
   --g-core/--g-expressive/--g-system on #sidebar-right and let the cascade
   carry them to the labels. Measured here, that costs 14.7ms PER FRAME - a
   dropped frame every frame, next to the sim. #sidebar-right has ~1170
   descendants (every slider, layer row and button in the panel bodies), and a
   custom property is inherited, so writing one at the top invalidates the
   computed style of the entire subtree. Writing background-image straight onto
   the 16 .section-title elements - each a leaf with a single text node -
   invalidates 16 elements instead of 1170: 0.67ms. Same pixels, 22x cheaper.
   Re-measure before "simplifying" this back to three writes.
   ================================================================ */
(function () {
    'use strict';

    var IDLE_MS  = 120000;   // how long the nav must be untouched
    var PERIOD   = 16;       // seconds per full oscillation
    var TAU_IN   = 2.6;      // easing-in time constant (slow, unnoticed)
    var TAU_OUT  = 0.55;     // easing-out (fast enough to feel like a response)
    var STAGGER  = 0.35 * Math.PI;  // phase lag per run, so colour travels DOWN
    var SETTLED  = 0.0005;   // amp below this while awake === at rest
    var L_TOP    = 84;       // resting lightness, top of every ramp
    var L_BASE   = 60;       // resting lightness, bottom of every ramp
    var BASE_C   = 0.82;     // base endpoint chroma, relative to the top
    var BASE_DRIFT = 1.35;   // base endpoint hue drift, relative to the top

    // Rotation is the RESTING spread between a run's two endpoints; drift is
    // what the oscillation adds on top of it.
    var RUNS = [
        { key: 'core',       hue: 242, chroma: 0.160, rot:  52, drift: 60 },
        { key: 'expressive', hue: 190, chroma: 0.150, rot: -35, drift: 60 },
        // The system run rests at chroma 0.080, where a hue rotation is
        // perceptually inert - it would animate a number and show nothing. So
        // chroma is its animated axis instead, and it blooms rather than swings.
        { key: 'system',     hue: 250, chroma: 0.080, rot:  18, drift: 18, bloom: true }
    ];
    var BLOOM_C_MAX = 0.200;
    var BLOOM_L     = 14;    // lightness headroom the bloom may borrow
    var BLOOM_L_TOP = 0.50;  // ...how much of it the top endpoint takes
    var BLOOM_L_BASE = 0.35; // ...and the base

    var nav = null;
    var phase = 0, amp = 0, idle = false, raf = 0, lastFrame = 0;
    var lastInput = 0, idleTimer = 0;
    var reduce = null;

    function gradient(lTop, cTop, hTop, lBase, cBase, hBase) {
        return 'linear-gradient(in oklch 180deg, oklch(' +
            lTop.toFixed(2) + '% ' + cTop.toFixed(4) + ' ' + hTop.toFixed(2) + ') 0%, oklch(' +
            lBase.toFixed(2) + '% ' + cBase.toFixed(4) + ' ' + hBase.toFixed(2) + ') 100%)';
    }

    function paint(run, ph) {
        var lTop = L_TOP, lBase = L_BASE, chroma = run.chroma;

        if (run.bloom) {
            // swell, not sin: it departs upward from rest and returns exactly to
            // rest. A raw sine drives chroma negative on the downswing, which
            // clamps at zero and shows a flat spot once per cycle.
            var swell = (1 - Math.cos(ph)) / 2;
            var s = amp * swell;
            chroma = run.chroma + (BLOOM_C_MAX - run.chroma) * s;
            lTop  = L_TOP  + BLOOM_L * BLOOM_L_TOP  * s;
            lBase = L_BASE + BLOOM_L * BLOOM_L_BASE * s;
        }

        // Lightness only ever rises. The nav sits on pure black at 12.5px
        // uppercase; dimming it is a contrast regression that would only ever
        // appear when nobody is looking at it.
        var d = amp * run.drift * Math.sin(ph);
        var g = gradient(
            lTop,  chroma,          run.hue + d,
            lBase, chroma * BASE_C, run.hue + run.rot + d * BASE_DRIFT
        );
        if (g === run.last) return;   // slow oscillation; identical frames happen
        run.last = g;
        for (var i = 0; i < run.labels.length; i++) run.labels[i].style.backgroundImage = g;
    }

    // Rest by REMOVING the inline override, not by writing computed resting
    // values back. The label then falls through to `background-image: var(--g)`
    // in the stylesheet, so "exactly the resting colours" is structural - the
    // cascade's own value - rather than arithmetic that has to round-trip
    // cleanly through a formatted oklch() string.
    function rest() {
        amp = 0;
        for (var i = 0; i < RUNS.length; i++) {
            var run = RUNS[i];
            run.last = null;
            for (var j = 0; j < run.labels.length; j++) run.labels[j].style.backgroundImage = '';
        }
    }

    function frame(now) {
        raf = 0;
        // Clamped: a stalled tab hands back a huge dt, which would jump the
        // phase and snap amp to its target in one step.
        var dt = Math.min((now - lastFrame) / 1000, 0.1);
        lastFrame = now;

        phase = (phase + dt * 2 * Math.PI / PERIOD) % (2 * Math.PI);
        var tau = idle ? TAU_IN : TAU_OUT;
        amp += ((idle ? 1 : 0) - amp) * (1 - Math.exp(-dt / tau));

        if (!idle && amp < SETTLED) {
            // Awake and settled: hand the labels back to the cascade and stop.
            rest();
            return;
        }

        for (var i = 0; i < RUNS.length; i++) paint(RUNS[i], phase - i * STAGGER);
        raf = requestAnimationFrame(frame);
    }

    function start() {
        // The single gate every path funnels through - idle timer, wake, and the
        // debug hooks alike. Under prefers-reduced-motion the loop is not slowed
        // down, it never starts: the effect carries no information, so there is
        // nothing to degrade gracefully to.
        if (raf || (reduce && reduce.matches)) return;
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    // One self-rearming timer rather than a clearTimeout/setTimeout pair on
    // every pointermove - input during a stroke fires this hundreds of times a
    // second and the churn would land on the paint path.
    function armIdleCheck() {
        clearTimeout(idleTimer);
        var due = IDLE_MS - (performance.now() - lastInput);
        idleTimer = setTimeout(function () {
            if (reduce.matches) { armIdleCheck(); return; }
            if (performance.now() - lastInput >= IDLE_MS - 4) { idle = true; start(); }
            else armIdleCheck();
        }, Math.max(due, 50));
    }

    function onInput() {
        lastInput = performance.now();
        if (idle) { idle = false; armIdleCheck(); start(); }
    }

    function init() {
        nav = document.getElementById('sidebar-right');
        if (!nav) return false;

        // Collect each run's labels once. If a run has no labels the sidebar is
        // not built yet (or the groups were renamed) - retry rather than
        // silently animating nothing.
        for (var i = 0; i < RUNS.length; i++) {
            RUNS[i].labels = [].slice.call(
                nav.querySelectorAll('.sidebar-section[data-group="' + RUNS[i].key + '"] .section-title'));
            RUNS[i].last = null;
            if (!RUNS[i].labels.length) return false;
        }

        // The stylesheet only clips the gradient to the text where oklch
        // interpolation is supported (see the @supports gate in
        // css/21-sidebar.css). Where it is not, the labels are painting a solid
        // colour and an inline background-image would render as a gradient BOX
        // behind the text instead of filling it.
        if (!(window.CSS && CSS.supports &&
              CSS.supports('background-image', 'linear-gradient(in oklch, red, blue)'))) return true;

        reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        // Not "run it slower" - the effect carries no information, so under
        // reduce it does not run at all.
        var onReduceChange = function () {
            if (!reduce.matches) return;
            idle = false;
            stop();
            rest();
        };
        if (reduce.addEventListener) reduce.addEventListener('change', onReduceChange);
        else if (reduce.addListener) reduce.addListener(onReduceChange);

        lastInput = performance.now();
        ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach(function (ev) {
            // Capture + passive: seen no matter who stops propagation downstream,
            // and never able to delay a scroll or a brush stroke.
            window.addEventListener(ev, onInput, { passive: true, capture: true });
        });
        armIdleCheck();

        window.navIdleGlow = {
            // Test/tuning surface. wake() and sleep() drive the same transitions
            // the timer does, so the eased paths are the real ones.
            wake:  function () { onInput(); },
            sleep: function () { lastInput = performance.now() - IDLE_MS; idle = true; start(); },
            state: function () { return { idle: idle, amp: amp, phase: phase, running: !!raf, reduced: !!(reduce && reduce.matches) }; }
        };
        return true;
    }

    // The sidebar is built ~800ms after DOMContentLoaded by 20-mixer-layout.js,
    // so there is nothing to attach to at script time.
    function boot(tries) {
        if (init()) return;
        if (tries < 60) setTimeout(function () { boot(tries + 1); }, 250);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { boot(0); });
    } else {
        boot(0);
    }
})();
