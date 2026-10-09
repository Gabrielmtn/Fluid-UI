// ═══════════════════════════════════════════════════════════════════
// js/60-reset-app.js — "Reset app": the canvas and every setting back to
//   how Swirl Together starts, in place, without a restart (user test
//   2026-10-03).
// LOAD ORDER: after 52-demo-clock.js (it sits beside the clock on the
//   quality underbar) and everything it resets: 04a (__CONFIG_DEFAULTS),
//   04b/04f (freeze, pause, clear), 12 (baselineLookSnapshot,
//   applyPresetSnapshotFull), 20 (the underbar, __brushSetters).
// PROVIDES: window.ResetApp = { reset, ask, showHint }
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
// (Spacing, Interval, Texture, Flow... from 04a's literal); Replay Speed;
// running again (unfrozen, unpaused); the view (zoom back to 1:1, Zoom
// Mode off); and a clean canvas, pressure included. What it keeps:
// presets, palettes, hotkeys, mouse-button roles, the layout, PhotoSafe,
// image and motion resolution, the fps cap and animations — the machine
// and the player's libraries.
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
    var HINT_TEXT = 'Dear user, Swirl Together gives you a lot of options, which means you can ' +
        'sometimes break it. Sometimes it’s best to just restart from the baseline and build from there.';
    var HINT_MS = 30000;
    var ARM_DELAY_MS = 400;

    var btn = null, modal = null, keyHandler = null, armedAt = 0;
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

    function resetBrushDrawer() {
        var S = window.__brushSetters, D = window.__CONFIG_DEFAULTS;
        if (!S || !D) return;
        var want = {
            target: 'fluid', eraser: false, tip: 0, shape: null, angle: 0,
            tipTexture: D.BRUSH_TIP_TEXTURE, flow: D.BRUSH_FLOW, hardness: D.BRUSH_HARDNESS,
            stabilizer: D.BRUSH_STABILIZER, spacing: D.BRUSH_SPACING, jitter: D.BRUSH_JITTER,
            dabInterval: D.BRUSH_DAB_INTERVAL_MS, splatMode: D.BRUSH_CONTINUOUS ? 'constant' : 'move',
            steady: D.BRUSH_STEADY,
            velOnly: false, velMode: D.BRUSH_VEL_MODE || 'smudge', velStrength: D.BRUSH_VEL_STRENGTH
        };
        Object.keys(want).forEach(function (k) {
            if (typeof S[k] !== 'function' || want[k] === undefined) return;
            try { S[k](want[k]); } catch (err) { console.warn('[ResetApp] brush setting', k, err); }
        });
    }

    // Zoom is not a setting the look carries, so it outlived every reset:
    // the canvas came back clean at 4x, or still in Zoom Mode, where the
    // brush does not paint.
    function resetView() {
        if (typeof window.setZoomMode === 'function') window.setZoomMode(false);
        if (window.ZoomView) window.ZoomView.reset();
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

    // opts.layers: Reset all (the player's layers, paths, masks and text go
    // too). Without it, Keep layers.
    function reset(opts) {
        // 0. Reset all: the player's layers first, so nothing below re-reads them.
        if (opts && opts.layers) clearLayers();
        // 1. The look, at today's generation (see the header).
        if (typeof window.baselineLookSnapshot === 'function' && typeof window.applyPresetSnapshotFull === 'function') {
            var snap = window.baselineLookSnapshot();
            if (typeof window.LOOK_BASELINE_GEN === 'number') snap.baseline = window.LOOK_BASELINE_GEN;
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
        // 2. The brush drawer's engine settings.
        resetBrushDrawer();
        // 3. Replay Speed (kept per player, outside the look).
        var rs = document.getElementById('replaySpeed');
        if (rs && parseFloat(rs.value) !== 1) {
            rs.value = '1';
            rs.dispatchEvent(new Event('input', { bubbles: true }));
            rs.dispatchEvent(new Event('change', { bubbles: true }));
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
                '<div class="delete-modal-message" id="resetAppMsg">Clears the canvas and puts every setting ' +
                    'back the way the app starts. Presets, palettes, hotkeys and animations always stay.' +
                    '<br><br>Keep your layers, text and paths, or remove them too?</div>' +
                '<div class="delete-modal-actions">' +
                    '<button type="button" class="delete-modal-cancel" id="resetAppCancel">Cancel</button>' +
                    '<button type="button" class="btn--emphasis" id="resetAppKeep">Keep layers</button>' +
                    '<button type="button" class="delete-modal-confirm btn--destructive" id="resetAppAll">Reset all</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.querySelector('#resetAppCancel').addEventListener('click', close);
        function answer(layers) {
            if (performance.now() < armedAt) return;
            close();
            reset({ layers: layers });
        }
        modal.querySelector('#resetAppKeep').addEventListener('click', function () { answer(false); });
        modal.querySelector('#resetAppAll').addEventListener('click', function () { answer(true); });
        // The scrim answers like Cancel; a stroke's tail must not reset anything.
        modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); });
    }

    function ask() {
        buildModal();
        dismissHint();
        modal.classList.add('show');
        armedAt = performance.now() + ARM_DELAY_MS;
        if (!keyHandler) {
            // Nothing typed at the question reaches the app's hotkeys (Space
            // would freeze); Escape is Cancel.
            keyHandler = function (e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
                if (e.key !== 'Tab' && e.key !== 'Enter') e.stopPropagation();
            };
            document.addEventListener('keydown', keyHandler, true);
        }
        try { modal.querySelector('#resetAppCancel').focus({ preventScroll: true }); } catch (_) {}
    }

    function close() {
        if (!modal) return;
        modal.classList.remove('show');
        if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
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
            btn.textContent = 'Reset app';
            btn.title = 'Reset app: a clean canvas and every setting back to how Swirl Together starts. ' +
                'Asks whether your layers stay.';
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

    window.ResetApp = { reset: reset, ask: function () { if (!modalUp()) ask(); }, showHint: showHint };
})();
