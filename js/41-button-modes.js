// ═══════════════════════════════════════════════════════════════════
// js/41-button-modes.js — what each mouse button DOES (2026-08-28)
// LOAD ORDER: after 09-settings-manager.js, before 20-mixer-layout.js.
//   Read at RUNTIME by 05d (pointer/touch lifecycle), 05g (multiSplat's
//   mirror fold) and 05j (the idle release), all of which load earlier —
//   every one of them degrades to the historical left=paint / right=replay
//   behaviour if this file is missing.
// PROVIDES: window.ButtonModes, window.__strokeMirrorPin, window.__btnPinActive
// REQUIRES: config (04a), settingsManager (09); BrushShapes (33) runtime only
//
// WHY: art-therapy teachers set the exercise, not the patient. A session
// might want both buttons locked to Replay so a patient can re-trigger one
// safe rehearsed motion and cannot paint anything new; or the two buttons
// carrying two different brushes so a two-part exercise needs no menu trip
// mid-session. So the button→action binding is data, and each binding
// carries its own configuration.
//
// FOUR MODES, and the shape of each:
//   paint   — the ordinary brush. No pin at all.
//   replay  — hold to replay the last stroke (the historical right-click).
//   mirror  — paint, with every dab also stamped across an axis. Rides as
//             a PIN (window.__strokeMirrorPin) that 05g folds into the arm
//             transform list, so it composes with Multi-Brush instead of
//             fighting it, and 05d records it per dab so a replay of a
//             mirrored stroke comes back mirrored.
//   alt     — paint with a SECOND brush. Rides as a sparse config overlay
//             pinned for the stroke and restored once every dab has drained
//             (05j) — the same pin-then-restore idiom emitReplayDab and the
//             multiplayer receiver already use for a footprint that belongs
//             to the stroke rather than to the panel.
//
// The pin is deliberately NOT a "switch the live brush" — that would leave
// the Brush panel showing values that are not what the next left-click will
// paint with, and would re-persist the alternate brush over the primary one.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var MODES = ['paint', 'replay', 'mirror', 'alt'];
    var MODE_LABELS = {
        paint:  'Brushstroke',
        replay: 'Replay',
        mirror: 'Mirror brushstroke',
        alt:    'Alternate brush'
    };
    var MODE_HINTS = {
        paint:  'Paints normally with the brush in the Brush panel.',
        replay: 'Hold to replay the last stroke (or the last few seconds, in Time mode). Paints nothing new — set BOTH buttons to this to lock a rehearsed motion in.',
        // The caveat is in the hint rather than left to be discovered: the
        // mirror rides the fluid dab loop (05g multiSplat), and collider /
        // raster-layer strokes stamp through their own routes, so a mirror-
        // bound button paints an ordinary single stroke on those targets.
        mirror: 'Paints normally AND stamps a mirrored twin across the canvas — a bilateral stroke from one hand. Fluid strokes only; Collider painting is not mirrored.',
        alt:    'Paints with the separate brush configured below, leaving the main brush untouched.'
    };
    // Axis codes ride the wire and the recorded dab, so they are small ints,
    // not strings: 1 = across the vertical axis (a left/right mirror),
    // 2 = across the horizontal axis, 3 = both (four-up).
    var MIRROR_AXES = [
        { code: 1, id: 'x',    label: '↔',  title: 'Mirror left ↔ right (across the vertical centre line)' },
        { code: 2, id: 'y',    label: '↕',  title: 'Mirror up ↕ down (across the horizontal centre line)' },
        { code: 3, id: 'quad', label: '✛',  title: 'Mirror both ways — four copies of every stroke' }
    ];
    var MIRROR_CODE = { x: 1, y: 2, quad: 3 };
    var MIRROR_ID = { 1: 'x', 2: 'y', 3: 'quad' };

    // The config keys an alternate brush may carry. A slot stores only the
    // keys it actually overrides, so a tip-only alt brush inherits Flow,
    // Spacing, Size and the rest from whatever the main brush is set to —
    // change the main brush's feel and the alternate follows, which is what
    // "an alternate brush TIP" should mean. "Use current brush" fills in the
    // whole list when a teacher wants the slot frozen instead.
    var ALT_KEYS = {
        BRUSH_TIP: 'int', BRUSH_SHAPE_ID: 'idOrNull', SPLAT_RADIUS: 'num',
        BRUSH_TIP_TEXTURE: 'num', BRUSH_ANGLE: 'num', BRUSH_FLOW: 'num',
        BRUSH_HARDNESS: 'num', BRUSH_STABILIZER: 'num', BRUSH_SPACING: 'num',
        BRUSH_JITTER: 'num', BRUSH_CONTINUOUS: 'bool', BRUSH_ERASER: 'bool',
        BRUSH_VELOCITY_ONLY: 'bool', BRUSH_VEL_MODE: 'str', BRUSH_VEL_STRENGTH: 'num'
    };
    // "Everything a brush is", for the Use-current-brush button. Order is
    // irrelevant (the overlay is applied as a set), but keeping tip/shape
    // first makes a logged slot readable.
    var FULL_KEYS = ['BRUSH_TIP', 'BRUSH_SHAPE_ID', 'SPLAT_RADIUS', 'BRUSH_TIP_TEXTURE',
        'BRUSH_ANGLE', 'BRUSH_FLOW', 'BRUSH_HARDNESS', 'BRUSH_STABILIZER', 'BRUSH_SPACING',
        'BRUSH_JITTER', 'BRUSH_CONTINUOUS', 'BRUSH_ERASER', 'BRUSH_VELOCITY_ONLY',
        'BRUSH_VEL_MODE', 'BRUSH_VEL_STRENGTH'];

    var VEL_MODES = { smudge: 1, spread: 1, gather: 1, swirl: 1 };
    // Pre-release rename (2026-08-24), same coercion the Brush panel does.
    var VEL_LEGACY = { blow: 'spread', suck: 'gather', vortex: 'swirl' };

    var SETTINGS_KEY = 'input.buttonModes';
    var BUTTONS = { 0: 'left', 2: 'right' };

    function defaults() {
        return {
            // The historical binding, so a first boot after this ships feels
            // like every boot before it.
            left:  { mode: 'paint',  mirror: 'x', alt: {} },
            right: { mode: 'replay', mirror: 'x', alt: {} }
        };
    }

    var state = defaults();
    var listeners = [];
    var pinned = null;   // {prevs, mirrorPrev} while a stroke owns the pin

    function sm() { return window.settingsManager || null; }

    // ── Coercion ────────────────────────────────────────────────────
    // Everything here can arrive from localStorage, a .fluid import or a
    // hand-edited settings blob, and it lands in `config` — where the
    // multiplayer look mirror could re-persist and re-broadcast it. Same
    // rule the peer-splat receiver follows: coerce before it touches config.
    function coerceAltValue(key, v) {
        switch (ALT_KEYS[key]) {
            case 'int':
                if (typeof v !== 'number' || !isFinite(v)) return undefined;
                return Math.max(0, Math.min(4, v | 0));
            case 'num':
                if (typeof v !== 'number' || !isFinite(v)) return undefined;
                if (key === 'SPLAT_RADIUS') return Math.max(0.000001, Math.min(0.1, v));
                if (key === 'BRUSH_ANGLE') return Math.max(-180, Math.min(180, v));
                if (key === 'BRUSH_VEL_STRENGTH') return Math.max(0, Math.min(5, v));
                return Math.max(0, Math.min(10, v));
            case 'bool': return !!v;
            case 'str':
                if (typeof v !== 'string') return undefined;
                if (VEL_LEGACY[v]) v = VEL_LEGACY[v];
                return VEL_MODES[v] ? v : 'smudge';
            case 'idOrNull':
                return (typeof v === 'string' && v) ? v : null;
        }
        return undefined;
    }

    function coerceAlt(obj) {
        var out = {};
        if (!obj || typeof obj !== 'object') return out;
        Object.keys(ALT_KEYS).forEach(function (k) {
            if (!(k in obj)) return;
            var v = coerceAltValue(k, obj[k]);
            // BRUSH_SHAPE_ID is legitimately null (= "no stamp, use the tip"),
            // so it is stored on an explicit null too; every other key drops
            // out of the overlay when it cannot be coerced.
            if (v !== undefined) out[k] = v;
        });
        return out;
    }

    function coerceSide(side, def) {
        var s = (side && typeof side === 'object') ? side : {};
        return {
            mode: MODES.indexOf(s.mode) >= 0 ? s.mode : def.mode,
            mirror: MIRROR_CODE[s.mirror] ? s.mirror : 'x',
            alt: coerceAlt(s.alt)
        };
    }

    function load() {
        var raw = null;
        try { raw = sm() && sm().get(SETTINGS_KEY); } catch (_) {}
        var d = defaults();
        if (!raw || typeof raw !== 'object') { state = d; return; }
        state = { left: coerceSide(raw.left, d.left), right: coerceSide(raw.right, d.right) };
    }

    function save() {
        try { if (sm()) sm().set(SETTINGS_KEY, state); } catch (_) {}
    }

    function fire() {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](state); } catch (_) {}
        }
    }

    function sideKey(btn) {
        if (btn === 'left' || btn === 'right') return btn;
        return BUTTONS[btn] || null;
    }
    function sideFor(btn) {
        var k = sideKey(btn);
        return k ? state[k] : null;
    }

    // ── Pins ────────────────────────────────────────────────────────
    function releasePins() {
        if (!pinned) return;
        var cfg = window.config;
        if (cfg) {
            var prevs = pinned.prevs;
            for (var k in prevs) if (Object.prototype.hasOwnProperty.call(prevs, k)) cfg[k] = prevs[k];
        }
        window.__strokeMirrorPin = pinned.mirrorPrev | 0;
        pinned = null;
        window.__btnPinActive = false;
    }

    // Apply this button's pins for the stroke that is starting. Called from
    // 05d once the press has cleared every guard (paused, turn-blocked,
    // wrong target) — never before, or a rejected press would leave the pin
    // on with no stroke coming to release it.
    function beginStroke(btn) {
        releasePins();  // a stroke that never reached the idle gate must not leak
        var side = sideFor(btn);
        if (!side) return;
        var mirrorPrev = window.__strokeMirrorPin | 0;
        var prevs = {};
        var cfg = window.config;

        if (side.mode === 'mirror') {
            window.__strokeMirrorPin = MIRROR_CODE[side.mirror] || 1;
        } else {
            window.__strokeMirrorPin = 0;
        }

        if (side.mode === 'alt' && cfg) {
            var alt = side.alt || {};
            for (var k in alt) {
                if (!Object.prototype.hasOwnProperty.call(alt, k) || !ALT_KEYS[k]) continue;
                prevs[k] = cfg[k];
                cfg[k] = alt[k];
            }
            // Get the stamp onto the GPU now rather than on the first dab:
            // splat() holds dabs while a selected stamp is still decoding
            // (33 stampPending), so an un-warmed alt shape drops the opening
            // of every stroke it is used for.
            if (alt.BRUSH_SHAPE_ID && window.BrushShapes && window.BrushShapes.warm) {
                try { window.BrushShapes.warm(alt.BRUSH_SHAPE_ID); } catch (_) {}
            }
        }

        pinned = { prevs: prevs, mirrorPrev: mirrorPrev };
        window.__btnPinActive = true;
    }

    // Called once per frame from 05j, but only while a pin is up (the caller
    // gates on window.__btnPinActive). The caller owns the idle test — it is
    // the only scope that can see splatOutActive and the engine's queue — so
    // this is a plain release.
    function releaseIfIdle() { releasePins(); }

    // ── Live-brush capture ──────────────────────────────────────────
    function captureLiveBrush() {
        var cfg = window.config || {};
        var out = {};
        FULL_KEYS.forEach(function (k) {
            var v = coerceAltValue(k, cfg[k]);
            if (v !== undefined) out[k] = v;
        });
        // The Size fader is the authority on SPLAT_RADIUS (05h writes it from
        // the slider), so read it the way captureBrushPreset does rather than
        // trusting a config value some transient pin may be sitting on.
        var s = document.getElementById('brushSize');
        if (s) {
            var r = parseFloat(s.value) / 1000;
            if (isFinite(r) && r > 0) out.SPLAT_RADIUS = coerceAltValue('SPLAT_RADIUS', r);
        }
        return out;
    }

    // ── Public API ──────────────────────────────────────────────────
    var API = {
        MODES: MODES,
        MODE_LABELS: MODE_LABELS,
        MODE_HINTS: MODE_HINTS,
        MIRROR_AXES: MIRROR_AXES,
        ALT_KEYS: ALT_KEYS,

        state: function () { return state; },
        side: function (btn) { return sideFor(btn); },

        // The action a button press should take, or null if the button has no
        // role at all. 05d's paint path treats every non-'replay' answer as a
        // paint press, so a mode added later paints rather than doing nothing.
        modeFor: function (btn) {
            var side = sideFor(btn);
            return side ? side.mode : null;
        },
        isPaintMode: function (mode) { return !!mode && mode !== 'replay'; },
        // True when NO button can paint — every one of them is bound to
        // Replay. Used for the UI's warning line.
        isPaintLocked: function () {
            return state.left.mode === 'replay' && state.right.mode === 'replay';
        },

        setMode: function (btn, mode) {
            var side = sideFor(btn);
            if (!side || MODES.indexOf(mode) < 0) return;
            side.mode = mode;
            // Changing what a button does mid-stroke would strand the pin the
            // old mode put up, so drop it — the stroke finishes unpinned.
            releasePins();
            save(); fire();
        },
        setMirror: function (btn, axisId) {
            var side = sideFor(btn);
            if (!side || !MIRROR_CODE[axisId]) return;
            side.mirror = axisId;
            save(); fire();
        },
        // patch: {CONFIG_KEY: value}. `undefined` REMOVES a key from the
        // overlay (back to "inherit from the main brush"); null is a real
        // value for BRUSH_SHAPE_ID and is kept.
        setAlt: function (btn, patch) {
            var side = sideFor(btn);
            if (!side || !patch) return;
            Object.keys(patch).forEach(function (k) {
                if (!ALT_KEYS[k]) return;
                if (patch[k] === undefined) { delete side.alt[k]; return; }
                var v = coerceAltValue(k, patch[k]);
                if (v !== undefined) side.alt[k] = v;
            });
            save(); fire();
        },
        replaceAlt: function (btn, obj) {
            var side = sideFor(btn);
            if (!side) return;
            side.alt = coerceAlt(obj);
            save(); fire();
        },
        clearAlt: function (btn) {
            var side = sideFor(btn);
            if (!side) return;
            side.alt = {};
            save(); fire();
        },
        captureLiveBrush: captureLiveBrush,

        beginStroke: beginStroke,
        releaseIfIdle: releaseIfIdle,
        release: releasePins,
        isPinned: function () { return !!pinned; },

        mirrorCode: function (axisId) { return MIRROR_CODE[axisId] || 0; },
        mirrorId: function (code) { return MIRROR_ID[code] || null; },

        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        reset: function () { state = defaults(); save(); fire(); },
        // Test/console hook: re-read persisted state (a .fluid import, or a
        // second window writing the same localStorage).
        reload: function () { load(); fire(); }
    };

    // The mirror pin is read every dab by 05g, which loads BEFORE this file —
    // seed it so that read is never against an undefined global.
    if (typeof window.__strokeMirrorPin !== 'number') window.__strokeMirrorPin = 0;
    window.__btnPinActive = false;

    load();
    window.ButtonModes = API;
})();
