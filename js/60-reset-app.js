// ═══════════════════════════════════════════════════════════════════
// js/60-reset-app.js — "Reset app": the canvas and every setting back to
//   how Swirl Together starts, in place, without a restart (user test
//   2026-10-03).
// LOAD ORDER: after 52-demo-clock.js (it sits beside the clock on the
//   quality underbar) and everything it resets: 04a (__CONFIG_DEFAULTS),
//   04b/04f (freeze, pause, clear), 12 (baselineLookSnapshot,
//   applyPresetSnapshotFull), 20 (the underbar, __brushSetters).
// PROVIDES: window.ResetApp = { reset, ask, showHint, saveLook }
//
// Gabriel: "Bottom right button for reset sim should reset the sim and ALL
// settings to default without requiring a full app restart." Before this,
// the nearest things were the transport Clear (dye and motion only, not
// pressure, no settings) and Settings → Clear (wipes the saved settings,
// which only show after a restart, and takes hotkeys and the layout with
// them).
//
// What a reset puts back: every registry slider, checkbox and select,
// colours, kaleidoscope, palette, arm colours, light, replay and splat
// settings, material and tip (12's full apply of the defaults look, at the
// current look generation so nothing is filled from an older one); the
// brush drawer's engine settings, which the registry keeps no default for
// (Spacing, Interval, Texture, Flow... from 04a's literal); Gravity
// Direction, which no look carries (2026-10-20); Replay Speed;
// running again (unfrozen, unpaused); the view (zoom back to 1:1, Zoom
// Mode off); Motion Detail (2026-10-13: Gabriel wants the shipped default
// after a reset, not whatever was left); and a clean canvas, pressure
// included. What it
// keeps: presets, palettes, hotkeys, mouse-button roles, the layout,
// PhotoSafe, image resolution, the fps cap and animations — the machine
// and the player's libraries.
//
// Saved settings (2026-10-14): Gabriel: Save settings saves the current
// settings "to be loaded by default upon reset", and they "can be reset to
// default". Settings → Save settings stores the look, the drawer, Motion
// Detail and Replay Speed under SAVED_KEY (12 calls saveLook); a reset
// lands on those instead of the shipped defaults, and fills what they lack
// the way a preset does. The question then has a tick for the shipped
// defaults, and Settings → Clear forgets them with the rest of the saved
// settings (SAVED_KEY is not on 09's keep list).
//
// The question asks about the player's work (2026-10-06): Keep layers
// leaves the Layers panel (images, paint layers, colliders, path layers,
// masks) and the Text panel's lines where they are; Reset all deletes
// them too, each through its own Delete.
//
// The button lives on the right of the quality underbar, before the demo
// clock (or the playtest label). The first time the app has finished its
// own first-run hints, a one-time note above it says what it is for, in
// Gabriel's words.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var HINT_KEY = 'swirlResetHint.v1';   // outside fluidUI:, so a reset or Settings → Clear never re-shows it
    var HINT_TEXT = 'Protip: Swirl Together gives you a lot of options, which means you can sometimes break it. Sometimes it’s best to just restart from the baseline and build from there.';
    var HINT_MS = 30000;
    var ARM_DELAY_MS = 400;

    var btn = null, modal = null, keyHandler = null, armedAt = 0, hold = null;
    var hint = null, hintTimer = null;

    function modalUp() { return !!(modal && modal.classList.contains('show')); }

    // ── The reset itself ─────────────────────────────────────────────
    function clearPressure() {
        try {
            if (typeof gl === 'undefined' || typeof pressure === 'undefined' || !pressure) return;
            gl.clearColor(0, 0, 0, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read.fbo);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } catch (_) {}
    }

    // The drawer's engine settings as its setters take them, read from a
    // config (the live one, or 04a's defaults).
    function drawerOf(c) {
        return {
            tipTexture: c.BRUSH_TIP_TEXTURE, flow: c.BRUSH_FLOW, hardness: c.BRUSH_HARDNESS,
            stabilizer: c.BRUSH_STABILIZER, spacing: c.BRUSH_SPACING, jitter: c.BRUSH_JITTER,
            dabInterval: c.BRUSH_DAB_INTERVAL_MS, splatMode: c.BRUSH_CONTINUOUS ? 'constant' : 'move',
            steady: c.BRUSH_STEADY, velMode: c.BRUSH_VEL_MODE || 'smudge', velStrength: c.BRUSH_VEL_STRENGTH
        };
    }

    // saved: the drawer from the saved settings, which overrides the
    // defaults. The brush type (paint, Pressure, eraser, sketch) is a tool,
    // not a setting: every reset hands back the fluid brush.
    function resetBrushDrawer(saved) {
        var S = window.__brushSetters, D = window.__CONFIG_DEFAULTS;
        if (!S || !D) return;
        var want = Object.assign({ target: 'fluid', eraser: false, velOnly: false, tip: 0, shape: null, angle: 0 },
            drawerOf(D), saved || {});
        Object.keys(want).forEach(function (k) {
            if (typeof S[k] !== 'function' || want[k] === undefined) return;
            try { S[k](want[k]); } catch (err) { console.warn('[ResetApp] brush setting', k, err); }
        });
    }

    // Gravity Direction (Effects) is not in the look either, so a reset left
    // it pulling. Through 20's setGravityField: config, pad, switch and the
    // saved setting together. saved: the saved settings' gravity.
    function resetGravity(saved) {
        var D = window.__CONFIG_DEFAULTS;
        if (typeof window.setGravityField !== 'function' || !D) return;
        var g = saved || { on: D.AMBIENT_FORCE, x: D.AMBIENT_FORCE_X, y: D.AMBIENT_FORCE_Y };
        window.setGravityField(!!g.on, +g.x || 0, +g.y || 0);
    }

    // Zoom is not a setting the look carries, so it outlived every reset:
    // the canvas came back clean at 4x, or still in Zoom Mode, where the
    // brush does not paint.
    function resetView() {
        if (typeof window.setZoomMode === 'function') window.setZoomMode(false);
        if (window.ZoomView) window.ZoomView.reset();
    }

    // Motion Detail through its own dropdown, as a pick: config, the
    // framebuffer rebuild, the governor pin and the saved select. Only when
    // it differs, so a reset at the default does not rebuild the grid.
    // saved: the saved settings' Motion Detail, in place of the default.
    function resetMotionDetail(saved) {
        var want = saved > 0 ? saved : window.__SIM_RESOLUTION_DEFAULT;
        var sel = document.getElementById('physicsResolution');
        if (!sel || typeof want !== 'number' || window.config.SIM_RESOLUTION === want) return;
        if (typeof window.setResolutionDropdown === 'function') window.setResolutionDropdown(sel, want);
        else sel.value = String(want);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Reset all: each kind goes through its own Delete, so GPU buffers,
    // clip bindings, collider walls and the room are freed the way a row's
    // × frees them. Layers before masks: a collider or a clip may be bound
    // to a mask, and unbinds as its layer goes.
    function clearLayers() {
        if (typeof window.deleteLayer === 'function' && Array.isArray(window.layers)) {
            window.layers.map(function (l) { return l.index; }).forEach(function (i) {
                try { window.deleteLayer(i); } catch (err) { console.warn('[ResetApp] layer', i, err); }
            });
        }
        // Each Delete above was recorded for Ctrl+Z; a reset is not undone
        // one layer at a time.
        if (window.__layerHistory) window.__layerHistory.clear();
        var P = window.pathLayers;
        if (P && typeof P.getLayers === 'function' && typeof P.delete === 'function') {
            P.getLayers().map(function (l) { return l.id; }).forEach(function (id) {
                try { P.delete(id); } catch (err) { console.warn('[ResetApp] path', id, err); }
            });
        }
        var M = window.Masks;
        if (M && typeof M.list === 'function' && typeof M.remove === 'function') {
            M.list().forEach(function (m) {
                try { M.remove(m.id); } catch (err) { console.warn('[ResetApp] mask', m.id, err); }
            });
        }
        if (window.textOverlays && typeof window.textOverlays.clearAll === 'function') {
            try { window.textOverlays.clearAll(); } catch (err) { console.warn('[ResetApp] text', err); }
        }
    }

    // ── Saved settings (see the header) ──────────────────────────────
    var SAVED_KEY = 'settings.resetLook';
    // Not settings a reset puts back, so not saved either: a look link or a
    // room never carries them.
    var NOT_SAVED = ['timestamp', 'savedColors', 'userPalettes', 'focusState', 'canvasWrapper', 'canvasBox',
        'sidebarSections', 'layers', 'layerOrder', 'masks', 'textOverlays', 'recordedLayers', 'pathLayers'];

    // Settings → Save settings (12). The look as a preset holds it, less
    // the machine (Image Detail, fps cap...), which every reset keeps;
    // Motion Detail rides beside it, since a reset sets it on its own.
    function saveLook() {
        var sm = window.settingsManager;
        if (!sm || typeof window.capturePresetSnapshot !== 'function') return false;
        var look = window.capturePresetSnapshot({ lookOnly: true });
        if (!look) return false;
        var motion = parseInt(look.selects && look.selects.physicsResolution, 10);
        var skip = Object.keys(window.LOOK_BASELINE_SKIP || {});
        ['sliders', 'checkboxes', 'selects'].forEach(function (sec) {
            if (look[sec]) skip.forEach(function (k) { delete look[sec][k]; });
        });
        NOT_SAVED.forEach(function (k) { delete look[k]; });
        var c = window.config || {};
        var shapes = window.BrushShapes;
        var rs = document.getElementById('replaySpeed');
        sm.set(SAVED_KEY, {
            look: look,
            drawer: Object.assign(drawerOf(c), {
                tip: c.BRUSH_TIP | 0, angle: c.BRUSH_ANGLE || 0,
                shape: (shapes && shapes.activeId && shapes.activeId()) || null
            }),
            gravity: { on: !!c.AMBIENT_FORCE, x: c.AMBIENT_FORCE_X || 0, y: c.AMBIENT_FORCE_Y || 0 },
            motionDetail: motion > 0 ? motion : null,
            replaySpeed: rs ? parseFloat(rs.value) : 1
        });
        return true;
    }

    // A copy, so applying it never edits the stored one.
    function savedLook() {
        try {
            var s = window.settingsManager && window.settingsManager.get(SAVED_KEY);
            return (s && s.look && typeof s.look === 'object') ? JSON.parse(JSON.stringify(s)) : null;
        } catch (_) { return null; }
    }

    // opts.layers: Reset all (the player's layers, paths, masks and text go
    // too). Without it, Keep layers. opts.defaults: the shipped defaults
    // even when there are saved settings. opts.settingsOnly (Settings ->
    // Load Defaults): the settings alone; the canvas, the view and the
    // running state stay as they are.
    function reset(opts) {
        var saved = (opts && opts.defaults) ? null : savedLook();
        // 0. Reset all: the player's layers first, so nothing below re-reads them.
        if (opts && opts.layers) clearLayers();
        // 1. The look: the saved one, or the defaults at today's generation
        //    (see the header).
        if (typeof window.baselineLookSnapshot === 'function' && typeof window.applyPresetSnapshotFull === 'function') {
            var snap = saved ? saved.look : window.baselineLookSnapshot();
            if (!saved && typeof window.LOOK_BASELINE_GEN === 'number') snap.baseline = window.LOOK_BASELINE_GEN;
            try { window.applyPresetSnapshotFull(snap); } catch (err) { console.warn('[ResetApp] look', err); }
            // No preset now: the Presets button stops naming the last one (20).
            if (typeof window.setCurrentPreset === 'function') window.setCurrentPreset(null);
            // Random Colors is on again: roll its first colour, or the next
            // stroke paints the defaults' white swatch.
            var a0 = window.multiArmColors && window.multiArmColors[0];
            if (a0 && a0.mode === 'random' && typeof window.setActiveBrushColorMode === 'function') {
                window.setActiveBrushColorMode('random');
            }
        }
        // 2. The brush drawer's engine settings, Gravity Direction and
        //    Motion Detail.
        resetBrushDrawer(saved && saved.drawer);
        resetGravity(saved && saved.gravity);
        resetMotionDetail(saved && saved.motionDetail);
        // 3. Replay Speed (kept per player, outside the look).
        var speed = (saved && saved.replaySpeed > 0) ? saved.replaySpeed : 1;
        var rs = document.getElementById('replaySpeed');
        if (rs && parseFloat(rs.value) !== speed) {
            rs.value = String(speed);
            rs.dispatchEvent(new Event('input', { bubbles: true }));
            rs.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (opts && opts.settingsOnly) {
            if (typeof window.updateSliderValues === 'function') { try { window.updateSliderValues(); } catch (_) {} }
            return true;
        }
        // 4. Running again.
        var fz = document.getElementById('freezeBtn');
        if (fz && fz.classList.contains('active') && typeof window.toggleFreeze === 'function') window.toggleFreeze();
        if (typeof isPaused !== 'undefined' && isPaused && typeof window.togglePause === 'function') window.togglePause();
        // 4b. The view: 1:1, Zoom Mode off. After the look, which may have
        //     stood Mandala's Fill framing down on its own way out.
        resetView();
        // 5. A clean canvas — the room sees the Clear — and pressure, which
        //    Clear leaves.
        if (typeof window.clearCanvas === 'function') window.clearCanvas();
        clearPressure();
        // 6. Same as a preset click: keep the quality tier, re-learn the load.
        if (window.QualityGovernor) {
            try { (window.QualityGovernor.softReset || window.QualityGovernor.reset)(); } catch (_) {}
        }
        if (typeof window.updateSliderValues === 'function') { try { window.updateSliderValues(); } catch (_) {} }
        return true;
    }

    // ── The question ─────────────────────────────────────────────────
    function buildModal() {
        if (modal) return;
        modal = document.createElement('div');
        modal.id = 'resetAppModal';
        modal.className = 'delete-modal reset-app-modal';
        modal.dataset.group = 'system';   // button tint (css/01-buttons.css)
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'resetAppTitle');
        modal.setAttribute('aria-describedby', 'resetAppMsg');
        modal.innerHTML =
            '<div class="delete-modal-content">' +
                '<div class="delete-modal-title" id="resetAppTitle">Reset Swirl Together?</div>' +
                '<div class="delete-modal-message" id="resetAppMsg"><span id="resetAppWhat"></span> ' +
                    'Presets, palettes, hotkeys and animations always stay.' +
                    '<br><br>Keep your layers, text and paths, or remove them too?</div>' +
                '<label class="reset-app-defaults" id="resetAppDefaultsRow" hidden>' +
                    '<input type="checkbox" id="resetAppDefaults"> ' +
                    'Use Swirl Together’s defaults, not my saved settings</label>' +
                '<div class="delete-modal-actions">' +
                    '<button type="button" class="delete-modal-cancel" id="resetAppCancel">Cancel</button>' +
                    '<button type="button" class="btn--emphasis" id="resetAppKeep">Keep layers</button>' +
                    '<button type="button" class="delete-modal-confirm btn--destructive" id="resetAppAll">Reset all</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.querySelector('#resetAppCancel').addEventListener('click', close);
        modal.querySelector('#resetAppDefaults').addEventListener('change', sayWhat);
        function answer(layers) {
            if (performance.now() < armedAt) return;
            var defaults = modal.querySelector('#resetAppDefaults').checked;
            close();
            reset({ layers: layers, defaults: defaults });
        }
        modal.querySelector('#resetAppKeep').addEventListener('click', function () { answer(false); });
        modal.querySelector('#resetAppAll').addEventListener('click', function () { answer(true); });
        // The scrim answers like Cancel; a stroke's tail must not reset anything.
        modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); });
    }

    // The first sentence says where the settings go: the saved ones, unless
    // there are none or the tick asks for the defaults.
    function sayWhat() {
        var row = modal.querySelector('#resetAppDefaultsRow');
        var toSaved = !row.hidden && !modal.querySelector('#resetAppDefaults').checked;
        modal.querySelector('#resetAppWhat').textContent = toSaved
            ? 'Clears the canvas and puts every setting back to the settings you saved.'
            : 'Clears the canvas and puts every setting back the way the app starts.';
    }

    function ask() {
        buildModal();
        dismissHint();
        modal.querySelector('#resetAppDefaultsRow').hidden = !savedLook();
        modal.querySelector('#resetAppDefaults').checked = false;
        sayWhat();
        modal.classList.add('show');
        armedAt = performance.now() + ARM_DELAY_MS;
        if (!keyHandler) {
            // Nothing typed at the question reaches the app's hotkeys (Space
            // would freeze); Escape is Cancel.
            keyHandler = function (e) {
                if (window.DialogFocus.top() !== modal) return;   // a dialog over this one has the keys
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
                if (e.key !== 'Tab' && e.key !== 'Enter') e.stopPropagation();
            };
            document.addEventListener('keydown', keyHandler, true);
        }
        // Focus in on Cancel, Tab kept to the question, focus back after (00b).
        hold = window.DialogFocus.hold(modal, { initial: modal.querySelector('#resetAppCancel'), fallback: btn });
    }

    function close() {
        if (!modal) return;
        modal.classList.remove('show');
        if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
        if (hold) { hold.release(); hold = null; }
    }

    // ── The button ───────────────────────────────────────────────────
    function placeButton() {
        var bar = document.getElementById('quality-underbar');
        if (!bar) return false;
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'resetAppBtn';
            btn.className = 'btn--ghost reset-app-btn';
            btn.textContent = 'Reset Settings';
            btn.title = 'Reset settings to either the default, or the baseline you saved in settings. Asks whether your layers stay.';
            btn.addEventListener('click', function () { if (!modalUp()) ask(); });
        }
        if (btn.parentElement !== bar) {
            // Before the clock or the playtest label, so 22-overlays can hand
            // the right edge to them (they take margin-left:auto).
            bar.insertBefore(btn, bar.querySelector('.demo-clock, .playtest-label'));
        }
        return true;
    }

    // ── The one-time note ────────────────────────────────────────────
    function hintSeen() { try { return !!localStorage.getItem(HINT_KEY); } catch (_) { return true; } }
    function markHintSeen() { try { localStorage.setItem(HINT_KEY, '1'); } catch (_) {} }

    function placeHint() {
        if (!hint || !btn) return;
        var r = btn.getBoundingClientRect();
        if (!r.width) { hint.hidden = true; return; }
        hint.hidden = false;
        hint.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
        hint.style.bottom = Math.round(window.innerHeight - r.top + 12) + 'px';
    }

    function showHint() {
        if (hint || !btn || !btn.offsetParent) return;
        hint = document.createElement('div');
        hint.id = 'resetAppHint';
        hint.className = 'reset-app-hint';
        hint.dataset.group = 'system';
        hint.setAttribute('role', 'note');
        var p = document.createElement('div');
        p.className = 'reset-app-hint-text';
        p.textContent = HINT_TEXT;
        var row = document.createElement('div');
        row.className = 'reset-app-hint-actions';
        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'btn--ghost';
        ok.textContent = 'Got it';
        ok.addEventListener('click', dismissHint);
        row.appendChild(ok);
        hint.appendChild(p);
        hint.appendChild(row);
        document.body.appendChild(hint);
        placeHint();
        window.addEventListener('resize', placeHint);
        hintTimer = setTimeout(dismissHint, HINT_MS);
    }

    function dismissHint() {
        if (!hint) return;
        markHintSeen();
        clearTimeout(hintTimer);
        window.removeEventListener('resize', placeHint);
        hint.remove();
        hint = null;
    }

    // After the app's own first-run toast (05n, flag fluidFirstRunDone) has
    // come and gone, with the button on screen and no question open. Checked
    // once a second; a few quiet seconds go by before it shows.
    function hintWhenQuiet() {
        if (hintSeen()) return;
        var quietSince = 0;
        var poll = setInterval(function () {
            if (hintSeen()) { clearInterval(poll); return; }
            var firstRunDone = false;
            try { firstRunDone = !!localStorage.getItem('fluidFirstRunDone'); } catch (_) {}
            var ok = firstRunDone && btn && btn.offsetParent && !document.hidden &&
                !document.querySelector('.delete-modal.show');
            if (!ok) { quietSince = 0; return; }
            if (!quietSince) { quietSince = Date.now(); return; }
            if (Date.now() - quietSince < 3000) return;
            clearInterval(poll);
            showHint();
        }, 1000);
    }

    // The same wait as 51 and 52: the PhotoSafe warning answered, the strip
    // and sidebar built, the splash gone, and the layout question answered.
    function whenReady(fn) {
        (function wait() {
            var pw = document.getElementById('photoWarn');
            var built = !!document.getElementById('sidebar-right') && !!window.__scriptsReady;
            var splashUp = !!document.getElementById('splash-screen');
            if ((pw && !pw.hidden) || !built || splashUp) { setTimeout(wait, 250); return; }
            var uv = window.UIVisibility;
            if (uv && typeof uv.forkPending === 'function' && uv.forkPending() && uv.EVENT) {
                document.addEventListener(uv.EVENT, fn, { once: true });
            } else {
                fn();
            }
        })();
    }

    (function mount() {
        if (!placeButton()) { setTimeout(mount, 300); return; }
        whenReady(hintWhenQuiet);
    })();

    window.ResetApp = { reset: reset, hasSaved: function () { return !!savedLook(); }, ask: function () { if (!modalUp()) ask(); }, showHint: showHint, saveLook: saveLook };
})();
