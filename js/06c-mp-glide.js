// ================================================================
// 06c-mp-glide.js — Swirl Together client: incoming slider glide.
// When someone else in the room moves a slider, it does not jump here. It
// glides to where they put it, the way a mixing desk smooths a fader move it
// receives over the wire: parameter smoothing, the one-pole "de-zipper"
// every audio plugin runs on its knobs. A drag arrives as ~10 updates a
// second (06b ROOM_LOOK_SEND_MS); without this each one would be a visible
// step in the fluid, and a big change (a preset, a Mutate) would be a cut.
//
// What it costs: nothing while nothing is gliding (no frame loop, no
// listener work). While a slider glides, one input event per frame through
// that slider's own handler — the same work a hand on the fader does.
//
// The multiplayer client is five classic scripts, loaded in this order by
// index.html's async chain. They share the global lexical scope: a function
// or top-level variable declared in an earlier file is visible to every
// later one, and every cross-file call happens at runtime (a socket message,
// a click, a frame), so only the load order matters — nothing here runs at
// load time except the init at the tail of 06e.
//   06a-mp-core.js        transport, lifecycle, lobby, message dispatch
//   06b-mp-look.js        the room's shared settings
//   06c-mp-glide.js       incoming slider glide
//   06d-mp-paint-wire.js  dabs, cursors, brush shapes, colliders, replay strokes
//   06e-mp-panel.js       the room panel, remote cursors, init (runs last)
// ================================================================

// One-pole time constant: a move covers 63% of the way in this long, 95%
// in three times it. Short enough that a drag feels live (the glide trails
// the far hand by about one update), long enough that each update lands as
// a curve, not a step.
var MP_GLIDE_TAU_MS = 140;
// Arrived: within this fraction of the slider's travel, the glide writes
// the exact value and stops.
var MP_GLIDE_SNAP = 0.002;
// A slider with fewer positions than this is a switch with a handle — arm
// counts, multigrid levels — and steps straight to its value. Gliding one
// through every position on the way would rebuild things (arm rows, grid
// levels) once per frame for nothing.
var MP_GLIDE_MIN_POSITIONS = 40;
var MP_NO_GLIDE = { multiplier: 1, kaleidoSegments: 1, mgCycles: 1, mgPre: 1, mgPost: 1, mgCoarse: 1 };

var _glides = new Map();   // slider id → { el, key, v, to, snap }
var _glideRaf = 0;
var _glideLast = 0;

function glideRange(el) {
    var min = parseFloat(el.min), max = parseFloat(el.max), step = parseFloat(el.step);
    return {
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 100,
        step: (isFinite(step) && step > 0) ? step : 0
    };
}

// The registry's config key for a slider that maps 1:1 (12 sliderValue).
// Curl is a material's macro while one is active (29), not CURL, so it has
// no key then and goes through its own handler like any scaled slider.
function glideConfigKey(id) {
    var R = window.ParamRegistry;
    var reg = R && R.SLIDERS ? R.SLIDERS[id] : null;
    if (!reg || !reg.configKey) return null;
    if (id === 'curl' && window.MaterialModes && window.MaterialModes.active && window.MaterialModes.active()) return null;
    return reg.configKey;
}

function canGlide(id, el) {
    if (!el || el.type !== 'range' || MP_NO_GLIDE[id]) return false;
    var r = glideRange(el);
    if (!(r.max > r.min)) return false;
    var positions = r.step ? (r.max - r.min) / r.step : Infinity;
    if (positions >= MP_GLIDE_MIN_POSITIONS) return true;
    // A coarse slider that maps straight onto config still glides: the
    // exact in-between values go to config (glideWrite), so a 0.1-step
    // fader moves the fluid smoothly while its thumb steps.
    var R = window.ParamRegistry;
    var reg = R && R.SLIDERS ? R.SLIDERS[id] : null;
    return !!(glideConfigKey(id) && reg && reg.decimals !== 0);
}

// Where a slider really is: config for a 1:1 slider (the thumb can be a
// step off — 12's "slider truth"), else the thumb.
function glideCurrent(id, el, key) {
    if (key && window.config) {
        var cv = window.config[key];
        if (typeof cv === 'number' && isFinite(cv)) return cv;
    }
    var v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
}

// One write, through the slider's own handler — the same path a hand on the
// fader takes, so the value readout, the strip fader and anything else
// listening all follow. Marked as a remote apply so the room look (06b) does
// not send it back, and as a programmatic one (_profileApplying, as 12's
// preset apply does) so drag aids stay out of it: the Kaleido angle's
// sticky zero snapped a glide passing through 0° and held it there, and the
// slider never reached the value it was sent. `final` also fires change
// (some controls save on change) and lands the exact value in config when
// the thumb could not hold it (between steps, or outside the fader's travel
// — 12 applySliderValue does the same for presets).
function glideWrite(id, el, key, v, final) {
    var wasA = window.__mpApplyingRemote, wasP = isProcessingRemoteEvent, wasProfile = window._profileApplying;
    window.__mpApplyingRemote = true;
    window._profileApplying = true;
    isProcessingRemoteEvent = true;
    try {
        el.value = String(v);
        el.style.setProperty('--val', el.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (final) el.dispatchEvent(new Event('change', { bubbles: true }));
        if (key && window.config && Math.abs(parseFloat(el.value) - v) > 1e-9) window.config[key] = v;
    } catch (e) {
        console.warn('[mp] glide write failed for ' + id, e);
    } finally {
        window.__mpApplyingRemote = wasA;
        window._profileApplying = wasProfile;
        isProcessingRemoteEvent = wasP;
    }
}

function glideFrame(now) {
    _glideRaf = 0;
    var dt = Math.max(0, Math.min(100, now - (_glideLast || now)));
    _glideLast = now;
    var k = 1 - Math.exp(-dt / MP_GLIDE_TAU_MS);
    _glides.forEach(function (g, id) {
        if (!g.el.isConnected) { g.el = document.getElementById(id) || g.el; }
        g.v += (g.to - g.v) * k;
        var done = Math.abs(g.to - g.v) <= g.snap;
        if (done) _glides.delete(id);
        glideWrite(id, g.el, g.key, done ? g.to : g.v, done);
    });
    if (_glides.size) _glideRaf = requestAnimationFrame(glideFrame);
    else _glideLast = 0;
}

// Set a slider from the room right away: no glide (a hidden tab, a stepped
// slider, nothing to travel), or the end of one. A slider whose panel has
// not been built yet has no element; its config key takes the value.
function mpSetSliderNow(id, v) {
    var g = _glides.get(id);
    if (g) _glides.delete(id);
    var el = document.getElementById(id);
    var key = glideConfigKey(id);
    if (!el) {
        if (key && window.config) window.config[key] = v;
        return;
    }
    glideWrite(id, el, key, v, true);
}

// Glide a slider to a value from the room. A new value for a slider that
// is already gliding re-aims it from where it is — the next update of a
// drag bends the curve instead of restarting it. Falls back to an instant
// set where a glide would not help.
function mpGlideTo(id, target) {
    var el = document.getElementById(id);
    if (!isFinite(target)) return;
    // A hidden tab runs no frames (rAF parks), so a glide would sit
    // half-way until it came back: land the value now instead.
    if (!canGlide(id, el) || document.hidden) { mpSetSliderNow(id, target); return; }
    var key = glideConfigKey(id);
    var r = glideRange(el);
    var snap = (r.max - r.min) * MP_GLIDE_SNAP;
    var g = _glides.get(id);
    var from = g ? g.v : glideCurrent(id, el, key);
    if (Math.abs(target - from) <= snap) { mpSetSliderNow(id, target); return; }
    if (g) { g.to = target; g.snap = snap; g.key = key; g.el = el; }
    else _glides.set(id, { el: el, key: key, v: from, to: target, snap: snap });
    if (!_glideRaf) {
        if (!_glideLast) _glideLast = performance.now();
        _glideRaf = requestAnimationFrame(glideFrame);
    }
}

// Where a gliding slider is headed (the room's value), or undefined. The
// room look reads this instead of the moving thumb, so a glide in progress
// is never mistaken for an edit made here.
function mpGlideTarget(id) {
    var g = _glides.get(id);
    return g ? g.to : undefined;
}

// Someone here took hold of a slider that was gliding: their hand wins and
// the glide lets go where it is.
function mpGlideRelease(id) {
    _glides.delete(id);
}

// Land every glide on its value now (leaving the room, a hidden tab).
function mpGlideFinishAll() {
    if (_glideRaf) { cancelAnimationFrame(_glideRaf); _glideRaf = 0; }
    _glideLast = 0;
    var all = Array.from(_glides.entries());
    _glides.clear();
    all.forEach(function (pair) { glideWrite(pair[0], pair[1].el, pair[1].key, pair[1].to, true); });
}

function installGlideRelease() {
    if (installGlideRelease.done) return;
    installGlideRelease.done = true;
    // Window capture: before the slider's own listeners. Any input on a
    // gliding slider that is not ours is a person (a drag, a key, a bound
    // hotkey, the radial menu) and lets go of the glide.
    var release = function (e) {
        var t = e.target;
        if (!_glides.size || !t || !t.id || window.__mpApplyingRemote) return;
        if (_glides.has(t.id)) mpGlideRelease(t.id);
    };
    window.addEventListener('pointerdown', release, true);
    window.addEventListener('input', release, true);
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && _glides.size) mpGlideFinishAll();
    });
}
