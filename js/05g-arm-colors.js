// ═══════════════════════════════════════════════════════════════════
// js/05g-arm-colors.js — part 7/14 of former 05-fluid-sim.js (lines 2194–2439)
// LOAD ORDER: after 05f-kaleido-controls.js, before 05h-slider-bindings.js
// PROVIDES: multiArmColors, resolveArmColor, advanceArmColors, multiSplat, applyMultiSplatWith, color pickers, generateVibrantColor, advanceColor; calls initPaletteUI/preseedPaletteOnLoad (01-config)
// REQUIRES: splatWithRadius (05d), config (04), palettes (01/02)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Per-arm color configuration: array of {mode, color, stepIndex}
        // mode: 'main' = use pointer color, 'fixed' = use .color hex, 'random', 'step'
        var multiArmColors = [];
        window.multiArmColors = multiArmColors;
        function resolveArmColor(armIndex, fallbackColor) {
            // Arm 0's color mode applies at EVERY multiplier (2026-07-13): the
            // brush-colors panel now renders arm 0 at 1x, and two-way sync with
            // the main #colorPicker keeps the solo brush coherent (the old
            // hijack this gate prevented — a stale non-'main' arm 0 from a
            // multi session overriding the picker — can't happen when the
            // panel and picker mirror each other).
            var cfg = multiArmColors[armIndex];
            if (!cfg || cfg.mode === 'main') return fallbackColor;
            // Arm 0's random/step DEFER to the legacy pointer.color pipeline:
            // advanceColor drives the single RNG and the picker "next" preview,
            // so the top-nav toggles and this per-arm path never draw two
            // different colours for the same stroke. Arms >0 keep their own
            // cache below.
            if (armIndex === 0 && (cfg.mode === 'random' || cfg.mode === 'step')) return fallbackColor;
            if (cfg.mode === 'fixed') {
                var hex = cfg.color || '#ffffff';
                return [
                    parseInt(hex.slice(1, 3), 16) / 255,
                    parseInt(hex.slice(3, 5), 16) / 255,
                    parseInt(hex.slice(5, 7), 16) / 255
                ];
            }
            // 'rainbow' (new random colour per splat) removed 2026-08-15 for
            // photosensitivity — a stale mode string falls through to
            // fallbackColor here, and every ingest path coerces it to 'fixed'.
            if (cfg.mode === 'random') {
                // Color set once on mouseup; held for the whole stroke
                if (!cfg.cachedColor) cfg.cachedColor = generateVibrantColor();
                return cfg.cachedColor;
            }
            if (cfg.mode === 'step') {
                // Color set once on mouseup; held for the whole stroke
                if (!cfg.cachedColor) {
                    var list0 = (typeof getStepColorList === 'function') ? getStepColorList() : [];
                    if (!list0.length) return fallbackColor;
                    var idx0 = (cfg.stepIndex || 0) % list0.length;
                    var h0 = list0[idx0];
                    cfg.cachedColor = [
                        parseInt(h0.slice(1, 3), 16) / 255,
                        parseInt(h0.slice(3, 5), 16) / 255,
                        parseInt(h0.slice(5, 7), 16) / 255
                    ];
                }
                return cfg.cachedColor;
            }
            return fallbackColor;
        }
        // Called on mouseup — advances random/step cached colors for next stroke
        function advanceArmColors() {
            var arr = window.multiArmColors;
            if (!arr) return;
            for (var i = 0; i < arr.length; i++) {
                var cfg = arr[i];
                if (!cfg) continue;
                // Arm 0's random/step ride the legacy pipeline (see
                // resolveArmColor) — its cache is never read, so don't advance
                // it (keeps the RNG draw count deterministic).
                if (i === 0 && (cfg.mode === 'random' || cfg.mode === 'step')) continue;
                if (cfg.mode === 'random') {
                    cfg.cachedColor = generateVibrantColor();
                }
                if (cfg.mode === 'step') {
                    var list = (typeof getStepColorList === 'function') ? getStepColorList() : [];
                    if (!list.length) { cfg.cachedColor = null; continue; }
                    cfg.stepIndex = ((cfg.stepIndex || 0) + 1) % list.length;
                    var hex = list[cfg.stepIndex];
                    cfg.cachedColor = [
                        parseInt(hex.slice(1, 3), 16) / 255,
                        parseInt(hex.slice(3, 5), 16) / 255,
                        parseInt(hex.slice(5, 7), 16) / 255
                    ];
                }
            }
        }
        window.advanceArmColors = advanceArmColors;

        // ── Multi-Brush symmetry (2026-08-11) ─────────────────────────────
        // The arm loop in multiSplat used to be hardcoded C_n: n copies of the
        // dab rotated about the canvas centre. Every mode is now that SAME
        // loop with a different transform list, so a new mode is data, not
        // code.
        //
        // A transform is a 2x3 affine [m00,m01,m02, m10,m11,m12] in
        // CENTRE-RELATIVE space. Position maps through the whole affine;
        // velocity through the LINEAR part only — velocity is a direction, not
        // a point, so a translation (rake) must leave it alone, while a
        // reflection has to flip it or the mirrored dye would swim the wrong
        // way. `arm` is the SOURCE arm index: a mirrored twin reuses its
        // source's colour, so a mirror reads as one brush folded over rather
        // than as two unrelated brushes.
        //
        // 'radial' deliberately keeps m02/m12 at exactly 0 and multiplies in
        // the same order as the pre-mode code, so it stays bit-identical to
        // what shipped before symmetry existed.
        var SYM_MIRROR_X  = [-1, 0, 0,  0,  1, 0];   // across the vertical axis
        var SYM_MIRROR_Y  = [ 1, 0, 0,  0, -1, 0];   // across the horizontal axis
        var SYM_MIRROR_XY = [-1, 0, 0,  0, -1, 0];   // both (= point reflection)

        function symCfg(key, def) {
            var c = window.config;
            return (c && typeof c[key] === 'number') ? c[key] : def;
        }
        function symRot(ang) {
            var c = Math.cos(ang), s = Math.sin(ang);
            return [c, -s, 0, s, c, 0];
        }
        function symCompose(A, B) {   // A applied after B
            return [
                A[0]*B[0] + A[1]*B[3], A[0]*B[1] + A[1]*B[4], A[0]*B[2] + A[1]*B[5] + A[2],
                A[3]*B[0] + A[4]*B[3], A[3]*B[1] + A[4]*B[4], A[3]*B[2] + A[4]*B[5] + A[5]
            ];
        }
        // Approximate brush DIAMETER in canvas px — the same estimate the dab
        // walker uses (05d0), so rake spacing opens and closes with the Size
        // fader instead of drifting out of scale.
        function symBrushDiameterPx() {
            var h = (typeof canvas !== 'undefined' && canvas && canvas.height) || 1080;
            return Math.max(4, 2 * Math.sqrt(symCfg('SPLAT_RADIUS', 0.011)) * h);
        }

        // Centre-based lists depend only on (mode, arms) and this runs per dab,
        // so build them once per change. Rake is travel-dependent and stays
        // uncached (it is a handful of adds).
        // Keyed rather than a single slot (2026-08-28): the per-stroke mirror
        // below is part of the key, and a mirror-bound stroke painting while an
        // audio scene or path layer splats unmirrored alternates between two
        // keys every dab — a single slot would rebuild the list on each one.
        // The key space is tiny (mode x arms x mirror), and the guard is
        // against a pathological session, not a real brush.
        var symCache = Object.create(null);
        var symCacheN = 0;

        // Smoothed rake heading. The bristle line used to be rebuilt from each
        // dab's raw instantaneous direction, and a dab is one pointer segment —
        // 1-2px, integer-quantized for a mouse, so its angle can swing ±45°
        // between consecutive dabs from quantization alone. With the outermost
        // bristle sitting hundreds of px off the tip, that swing threw it across
        // the canvas every dab: the "spastic" rake. Worst on slow, careful
        // strokes, where the segments are shortest and the angle noisiest.
        var rakeUx = 0, rakeUy = 1, rakeHas = false;

        // ── Per-stroke mirror (41-button-modes) ───────────────────────────
        // A single STROKE can carry a mirror of its own, on top of whatever
        // Multi-Brush is set to: it was painted by a button bound to "mirror
        // brushstroke", or it is a recorded/relayed dab that was. It rides as
        // a pin (window.__strokeMirrorPin, 1=X 2=Y 3=both) rather than as a
        // config value, because it belongs to the stroke and not to the panel
        // — the same rule as the tip, the push mode and the per-arm mask.
        //
        // It COMPOSES with the symmetry mode instead of replacing it, by the
        // same fold the dihedral modes already apply to the rotation family:
        // a mirrored stroke through an 8-arm radial brush is 16 dabs of one
        // brush folded over, not two unrelated brushes. Dedup is on the matrix
        // alone (not matrix+arm), because two arms landing the same transform
        // means two dabs on one spot — double-dosed dye — whichever arms they
        // are. Mirroring an already-mirrored mode is the loud case: mirrorX
        // folded across X lands every reflection back on a rotation.
        function foldStrokeMirror(list, mir) {
            var ms = mir === 1 ? [SYM_MIRROR_X]
                   : mir === 2 ? [SYM_MIRROR_Y]
                   : mir === 3 ? [SYM_MIRROR_X, SYM_MIRROR_Y, SYM_MIRROR_XY]
                   : null;
            if (!ms) return list;
            var seen = Object.create(null);
            var out = [];
            function push(t) {
                var dk = t.m.map(function (q) { return Math.round(q * 1e6); }).join(',');
                if (seen[dk]) return;
                seen[dk] = 1;
                out.push(t);
            }
            for (var i = 0; i < list.length; i++) {
                push(list[i]);
                for (var j = 0; j < ms.length; j++) {
                    // Source arm carried through: a mirrored twin reuses its
                    // source's colour, so the pair reads as one brush folded
                    // over rather than as two brushes in different colours.
                    push({ m: symCompose(ms[j], list[i].m), arm: list[i].arm });
                }
            }
            return out;
        }

        function symmetryTransforms(mode, n, dx, dy, mir) {
            n = Math.max(1, n | 0);
            mir = mir | 0;
            if (mir < 0 || mir > 3) mir = 0;
            if (mode === 'rake') {
                // Local, not centre-based: copies ride alongside the stroke like
                // the bristles of a rake. Pure translation, so every bristle
                // pushes the fluid exactly the way the real tip does.
                var gap = symCfg('SYM_RAKE_SPACING', 1) * symBrushDiameterPx();
                var sp = Math.hypot(dx, dy);
                if (sp > 1e-6) {
                    var ux = dx / sp, uy = dy / sp;
                    // Dragging back along the stroke shouldn't spin the rake 180°
                    // (which would also reverse arm order, and with it the colours).
                    // A real rake keeps its line through a reversal.
                    if (rakeHas && (ux * rakeUx + uy * rakeUy) < 0) { ux = -ux; uy = -uy; }
                    if (!rakeHas) {
                        rakeUx = ux; rakeUy = uy; rakeHas = true;
                    } else {
                        // Turn over a fixed distance of TRAVEL, not per dab, so the
                        // feel is identical at any Spacing setting or stroke speed.
                        // |v| is 10x the dab's travel in both the engine and legacy
                        // paths, hence sp/10.
                        var turnPx = symCfg('SYM_RAKE_SMOOTH', 2.5) * symBrushDiameterPx();
                        var k = turnPx > 0 ? Math.min(1, (sp / 10) / turnPx) : 1;
                        rakeUx += k * (ux - rakeUx);
                        rakeUy += k * (uy - rakeUy);
                        var rl = Math.hypot(rakeUx, rakeUy);
                        if (rl > 1e-6) { rakeUx /= rl; rakeUy /= rl; }
                        else { rakeUx = ux; rakeUy = uy; }
                    }
                }
                // A press has no travel of its own: inherit the carried heading
                // rather than snapping to vertical and then jumping on first move.
                var px = rakeHas ? -rakeUy : 0;
                var py = rakeHas ?  rakeUx : 1;
                var rk = [];
                for (var r = 0; r < n; r++) {
                    var off = (r - (n - 1) / 2) * gap;
                    rk.push({ m: [1, 0, px * off, 0, 1, py * off], arm: r });
                }
                // Rake is travel-dependent and rebuilt every dab, so the fold
                // happens here rather than in the cache below. A rake bristle
                // is a pure translation in centre-relative space, so composing
                // the mirror after it gives a properly mirrored rake line.
                return foldStrokeMirror(rk, mir);
            }
            var key = mode + '|' + n + '|' + mir;
            var hit = symCache[key];
            if (hit) return hit;

            var out = [];
            // Rotational family. Adding the mirrors to C_n generates the
            // dihedral group, so 'mirrorX' at 8 arms IS a proper D8
            // kaleidoscope rather than eight independent tips.
            var mirrors = mode === 'mirrorX' ? [SYM_MIRROR_X]
                        : mode === 'mirrorY' ? [SYM_MIRROR_Y]
                        : mode === 'mirrorQuad' ? [SYM_MIRROR_X, SYM_MIRROR_Y, SYM_MIRROR_XY]
                        : null;   // 'radial' and any unknown/stale mode (e.g. a
                                  // retired 'spiral' from an old preset or peer)
            var seen = mirrors ? Object.create(null) : null;
            for (var a = 0; a < n; a++) {
                var R = symRot((Math.PI * 2 * a) / n);
                var variants = [R];
                if (mirrors) {
                    for (var j = 0; j < mirrors.length; j++) variants.push(symCompose(mirrors[j], R));
                }
                for (var v = 0; v < variants.length; v++) {
                    if (seen) {
                        // A mirror can land back on a rotation already in the
                        // set — Quad at an even arm count is the loud case,
                        // since D_n has 2n elements, not 4n. Without this the
                        // duplicates double-dose dye on those arms.
                        var dk = variants[v].map(function (q) { return Math.round(q * 1e6); }).join(',');
                        if (seen[dk]) continue;
                        seen[dk] = 1;
                    }
                    out.push({ m: variants[v], arm: a });
                }
            }
            out = foldStrokeMirror(out, mir);
            if (symCacheN > 200) { symCache = Object.create(null); symCacheN = 0; }
            symCache[key] = out;
            symCacheN++;
            return out;
        }
        // Exposed for the dropdown's dab-count hint (and console poking)
        window.symmetryTransforms = symmetryTransforms;

        // The select lives in the Multi-Brush dropdown (20-mixer-layout moves it
        // there). config is the single source of truth, so presets, session
        // autoload and the multiplayer lock all land through this one 'change'
        // — no second restore path to keep in sync.
        (function initSymmetryMode() {
            var el = document.getElementById('symmetryMode');
            if (!el) return;
            function applySymmetryMode() { config.SYMMETRY_MODE = el.value || 'radial'; }
            el.addEventListener('change', applySymmetryMode);
            applySymmetryMode();
        })();
        // ── Per-arm Pressure (2026-08-26) ────────────────────────────────
        // An arm can be marked as a PUSH arm in the Multi-Brush panel: it runs
        // the velocity pass and lays no dye, while its siblings paint normally.
        // Resolved HERE and not in splat(), because the arm index only exists at
        // this level — splat() sees one dab and has no idea which arm it is.
        // The state rides as a BITMASK (bit i = arm i pushes) rather than as the
        // arm array itself, so replay, recordings and the wire can pin the
        // painter's layout in one small integer the same way they pin the tip.
        function currentArmPushMask() {
            var arr = window.multiArmColors;
            if (!arr) return 0;
            var m = 0;
            // 8 is the arm-count ceiling (#multiplier max); the guard is against
            // a longer array left behind by a bigger session, not a real 30-arm
            // brush.
            for (var i = 0; i < arr.length && i < 30; i++) {
                if (arr[i] && arr[i].push) m |= (1 << i);
            }
            return m;
        }
        window.armPushMask = currentArmPushMask;
        // Pinned by stroke replay (05d), recordings (03) and peer strokes (06),
        // exactly as BRUSH_VELOCITY_ONLY is: which arms deposited pigment is a
        // property of the stroke that was painted, not of whoever is watching.
        // null = no pin, read the live panel.
        window.__armPushPin = null;

        // exactColor: programmatic splat sources (path layers, audio scenes,
        // animations) pass true so their configured color is deposited as-is on
        // every arm. Pointer strokes, stroke replay, and remote-peer strokes
        // leave it false — they ARE user strokes, so arm color modes apply.
        // withFootprint: paint this dab with the user's TIP/SHAPE even though its
        // colour is exact. Those are independent questions, and bundling both
        // under exactColor is what made recorded playback come out gaussian — a
        // recording bakes its colours (so it needs exactColor) but WAS painted
        // with the user's brush, and should play back in it. The caller pins the
        // footprint into config first, exactly as stroke replay does.
        function multiSplat(x, y, dx, dy, color, shouldBroadcast, exactColor, withFootprint) {
            // Brush tip (D1) rides the exactColor split: user strokes (live
            // pointer, replay, remote peers — exactColor falsy) stamp with the
            // configured BRUSH_TIP; programmatic sources (path layers, audio
            // scenes, animations) stay classic gaussian. splat() reads the
            // flag; cleared in finally so direct splat() callers never
            // inherit it.
            // Same hold as splat()'s (05i), one level up: a dab whose shape
            // stamp is still uploading must reach neither the arms nor the
            // wire. Without the broadcast half, peers would paint a dab this
            // canvas deliberately skipped.
            if (!exactColor && !window.__remoteStroke && window.BrushShapes
                && typeof window.BrushShapes.stampPending === 'function'
                && window.BrushShapes.stampPending()) return;
            window.__unsavedWork = true; // every dye source funnels through here
            window.__brushTipOn = !exactColor || !!withFootprint;
            // Marks THIS call's dab train for the push accumulator in splat()
            // (05i): Spread/Gather publish one source per pushing arm, and the
            // list has to be rebuilt per multiSplat rather than accumulated
            // across a frame's worth of dabs — see the note there.
            window.__dabSeq = (window.__dabSeq | 0) + 1;
            try {
            // Per-arm Pressure rides the same gate as the tip and the shape:
            // user strokes only. A programmatic source (audio scene, path
            // layer, animation) is a dye SOURCE and must keep painting on
            // every arm whatever the panel says.
            const armPushMask = window.__brushTipOn
                ? ((typeof window.__armPushPin === 'number') ? window.__armPushPin : currentArmPushMask())
                : 0;
            // Multi-Brush arms: one dab per symmetry transform (see the
            // symmetryTransforms block above for what each mode builds).
            const centerX = canvas.width * 0.5;
            const centerY = canvas.height * 0.5;
            // Per-stroke mirror rides the same gate as the tip and the arm
            // mask: USER strokes only (live pointer, stroke replay, peer dabs,
            // recorded playback). A programmatic dye source — an audio scene,
            // a path layer, an animation — must keep painting where it was
            // told even while the painter holds a mirror-bound button.
            const strokeMir = window.__brushTipOn ? (window.__strokeMirrorPin | 0) : 0;
            const transforms = symmetryTransforms(config.SYMMETRY_MODE, animationMultiplier, dx, dy, strokeMir);
            const relX = x - centerX;
            const relY = y - centerY;
            for (let i = 0; i < transforms.length; i++) {
                const m = transforms[i].m;
                const finalX = (m[0] * relX + m[1] * relY + m[2]) + centerX;
                const finalY = (m[3] * relX + m[4] * relY + m[5]) + centerY;
                // Linear part only: velocity is a direction, so it must not
                // pick up the translation (rake) — but it MUST take the flip
                // (mirrors), or the reflected dye swims the wrong way.
                const armDx = m[0] * dx + m[1] * dy;
                const armDy = m[3] * dx + m[4] * dy;
                const armColor = exactColor ? color : resolveArmColor(transforms[i].arm, color);
                // Two things splat() cannot work out for itself, published for
                // the length of this one dab and cleared in the finally:
                //  · __armVelOnly — true forces the velocity-only path for a
                //    marked arm even while the brush as a whole paints. Never
                //    false: an unmarked arm still follows BRUSH_VELOCITY_ONLY,
                //    so the whole-brush Pressure mode keeps working unchanged.
                //  · __armFlip — this transform is a REFLECTION (negative
                //    determinant). Smudge is already handled by armDx/armDy
                //    above, but Swirl's handedness is a scalar the shader
                //    resolves per fragment, and chirality flips in a mirror:
                //    without this, a mirrored arm spun the same way round as
                //    its source and the pair read as two brushes, not one
                //    folded over. A point reflection (mirrorXY = 180° rotation)
                //    has determinant +1 and correctly does NOT flip.
                window.__armVelOnly = (armPushMask & (1 << transforms[i].arm)) ? true : null;
                window.__armFlip = (m[0] * m[4] - m[1] * m[3]) < 0;
                splat(finalX, finalY, armDx, armDy, armColor);
            }
            window.__armVelOnly = null;
            window.__armFlip = false;
            if (shouldBroadcast && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    x / canvas.width,
                    y / canvas.height,
                    dx / canvas.width,
                    dy / canvas.height,
                    color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
            }
            } finally {
                window.__brushTipOn = false;
                window.__armVelOnly = null;
                window.__armFlip = false;
            }
        }
        // Helper to apply a multiSplat with specific multiplier and radius, restoring after
        window.applyMultiSplatWith = function(x, y, dx, dy, color, mult, radius, exactColor, withFootprint) {
            const prevM = (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
            const prevR = config.SPLAT_RADIUS;
            animationMultiplier = Math.max(1, Math.round(mult || 1));
            config.SPLAT_RADIUS = (typeof radius === 'number') ? radius : prevR;
            try { multiSplat(x, y, dx, dy, color, false, exactColor, withFootprint); } finally {
                animationMultiplier = prevM;
                config.SPLAT_RADIUS = prevR;
            }
        };
        const cursorToggle = document.getElementById('cursorToggle');
        cursorToggle.addEventListener('change', (e) => {
            showCursor = e.target.checked;
            if (!showCursor && !isReplayActive) {
                customCursor.style.opacity = '0';
            }
            // Toggle cursor visibility on non-UI elements
            const nonUIElements = [
                document.getElementById('canvas-area'),
                document.getElementById('canvas-wrapper'),
                document.getElementById('canvas'),
                document.getElementById('canvas-size-display'),
                document.getElementById('layers-container'),
                ...document.querySelectorAll('.background-layer'),
                ...document.querySelectorAll('.resize-handle'),
                ...document.querySelectorAll('.corner-lock'),
                ...document.querySelectorAll('.layer-resize-handle')
            ];
            nonUIElements.forEach(element => {
                if (element) {
                    if (showCursor) {
                        element.classList.remove('hide-cursor');
                    } else {
                        element.classList.add('hide-cursor');
                    }
                }
            });
        });
        // Initialize cursor state on page load
        cursorToggle.dispatchEvent(new Event('change'));
        // Lift cursor hiding while a system save dialog is up (file exports):
        // the OS cursor must be visible over the page even with Show Cursor off.
        // Restore checks the LIVE checkbox (focus mode / undo / hotkey may have
        // flipped it while the dialog was open), and restores by direct class
        // writes — a synthetic 'change' on cursorToggle would trip the
        // document-capture settings mirror in multiplayer.
        let cursorLiftDepth = 0;
        let cursorLifted = [];
        window.withCursorVisible = async function (fn) {
            if (++cursorLiftDepth === 1) {
                cursorLifted = Array.from(document.querySelectorAll('.hide-cursor'));
                cursorLifted.forEach(el => el.classList.remove('hide-cursor'));
                // Only when Show Cursor is off — with it on, the brush ring is
                // the visible cursor and hiding it would be the very feature-off
                // behavior change this helper must not make.
                try { if (!cursorToggle.checked && window.__brushCursor) window.__brushCursor.hide(); } catch (_) { }
            }
            try {
                return await fn();
            } finally {
                if (--cursorLiftDepth === 0) {
                    if (!cursorToggle.checked) {
                        cursorLifted.forEach(el => el.classList.add('hide-cursor'));
                    }
                    cursorLifted = [];
                }
            }
        };
        colorStorage.load();
        initPaletteUI();
        preseedPaletteOnLoad();
        const colorPickerEl = document.getElementById('colorPicker');
        if (colorPickerEl) {
            colorPickerEl.addEventListener('input', () => {
                // The reflector is writing the value — don't re-enter.
                if (window.__brushColorSyncing) return;
                // Programmatic restore (save/load) writes color.brush directly;
                // read it into pointer.color but DON'T hijack arm0.mode — the
                // canonical armColors restore that follows owns the mode.
                if (window.__brushColorRestoring) {
                    applyPickerColor();
                    updatePaletteStepIndicator();
                    return;
                }
                // A user pick IS the active brush's new prevailing colour:
                // switch arm 0 to a fixed swatch (clearing Rnd/Step/Rainbow).
                // The controller sets arm0.color, applies pointer.color,
                // persists, and reflects into both colour UIs.
                if (typeof window.setActiveBrushColorMode === 'function') {
                    window.setActiveBrushColorMode('fixed', { color: colorPickerEl.value });
                } else {
                    const rnd = document.getElementById('randomColor');
                    if (rnd) rnd.checked = false;
                    const stepEl = document.getElementById('stepPalette');
                    if (stepEl) stepEl.checked = false;
                    applyPickerColor();
                    updatePaletteStepIndicator();
                }
            });
        }
        const randomColorCheckboxEl = document.getElementById('randomColor');
        if (randomColorCheckboxEl) {
            randomColorCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const stepEl = document.getElementById('stepPalette');
                    if (stepEl) stepEl.checked = false;
                    advanceColor();
                }
                updatePaletteStepIndicator();
                mirrorCheckboxToArm0('random', e.target.checked);
            });
        }
        const stepPaletteCheckboxEl = document.getElementById('stepPalette');
        if (stepPaletteCheckboxEl) {
            stepPaletteCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const rnd = document.getElementById('randomColor');
                    if (rnd) rnd.checked = false;
                    advanceColor();
                }
                updatePaletteStepIndicator();
                mirrorCheckboxToArm0('step', e.target.checked);
            });
        }
        // The single hub every LEGACY colour path funnels through: hotkeys
        // ('r'/'a' via toggleCheckbox), applyPalette's auto-step, and snapshot
        // restore all dispatch 'change' on these checkboxes and land here, so
        // arm0.mode (canonical for painting + recording) stays in step without
        // each caller knowing about it. Guarded so the reflector's own
        // property writes and programmatic restore don't re-enter.
        function mirrorCheckboxToArm0(mode, checked) {
            if (window.__brushColorSyncing || window.__brushColorRestoring) return;
            var a0 = ensureArm0();
            if (checked) a0.mode = mode;
            else if (a0.mode === mode) a0.mode = 'fixed';
            a0.cachedColor = null;
            if (typeof window.persistArmColors === 'function') window.persistArmColors();
            syncBrushColorUI();
        }
        // Generate vibrant random color (avoids washed out/pale/gloomy colors)
        function generateVibrantColor() {
            // Use HSL to control saturation and lightness
            const hue = Math.random() * 360; // Full spectrum
            const sat = 0.85 + Math.random() * 0.15; // 85-100% saturation (sharp, clear hues)
            let light = 0.5 + Math.random() * 0.15; // 50-65% lightness (luminous, never muddy)
            // h in DEGREES (0-360), s and l as fractions (0-1); returns floats 0-1.
            // Named for its contract because two other chunks define a function
            // called hslToRgb with different units on both ends — 14-light-shift
            // takes percent and returns 0-255, 25-mutation-engine takes all
            // fractions and returns 0-255. They are file-scoped so they never
            // collide at runtime, but moving a line between chunks silently
            // rescales the colour.
            function hslDeg01ToRgb01(h, s, l) {
                const c = (1 - Math.abs(2 * l - 1)) * s;
                const x = c * (1 - Math.abs((h / 60) % 2 - 1));
                const m = l - c / 2;
                let r, g, b;
                if (h < 60) { r = c; g = x; b = 0; }
                else if (h < 120) { r = x; g = c; b = 0; }
                else if (h < 180) { r = 0; g = c; b = x; }
                else if (h < 240) { r = 0; g = x; b = c; }
                else if (h < 300) { r = x; g = 0; b = c; }
                else { r = c; g = 0; b = x; }
                return [r + m, g + m, b + m];
            }
            let rgb = hslDeg01ToRgb01(hue, sat, light);
            // Equal HSL lightness is not equal perceived brightness: a deep blue at
            // L 0.5 reads near-black on the dark canvas while a yellow glows. Lift
            // lightness until the color clears a luma floor so every hue lands legible.
            //   Gate needs a HIGHER floor. Ungated, dye ACCUMULATES (additive) and
            // washes any hue bright, so a deep blue/red/purple rescues itself — the
            // 0.22 floor is fine. Gated, the colour is deposited AS PAINTED (the
            // splat CONVERGES to it, no build-up), so an intrinsically-dark hue
            // stays dark: measured Gate screen-luma of random hues spanned 53
            // (blue) … 194 (yellow), so a random stroke on top of a bright area
            // could HALVE its brightness — "the next ones on top look too dark".
            // A 0.40 floor lifts the dark end (blue/red/purple ~64→~93 screen-luma)
            // while barely moving saturation (only the dark hues get lightened;
            // bright hues already clear it — measured avg sat 0.81→0.76). Both
            // console-tunable; 0 disables. See [[fluid-ui-roadmap]] Gate notes.
            var lumaFloor = config.COLOR_GATE
                ? ((typeof config.RANDOM_LUMA_FLOOR_GATE === 'number') ? config.RANDOM_LUMA_FLOOR_GATE : 0.40)
                : ((typeof config.RANDOM_LUMA_FLOOR === 'number') ? config.RANDOM_LUMA_FLOOR : 0.22);
            while ((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) < lumaFloor && light < 0.82) {
                light += 0.04;
                rgb = hslDeg01ToRgb01(hue, sat, light);
            }
            return rgb;
        }
        function rgbToHex(r, g, b) {
            var hr = Math.round(r * 255).toString(16).padStart(2, '0');
            var hg = Math.round(g * 255).toString(16).padStart(2, '0');
            var hb = Math.round(b * 255).toString(16).padStart(2, '0');
            return '#' + hr + hg + hb;
        }
        function syncPickerIndicator(r, g, b) {
            var cp = document.getElementById('colorPicker');
            if (cp) cp.value = rgbToHex(r, g, b);
        }
        // Read whatever the picker currently shows into pointer.color
        var firstPaintColorFreshened = false;
        function applyPickerColor() {
            // The session's first stroke would otherwise paint whatever the picker
            // was left holding (palette preseed / restored state) — a color that
            // never went through generateVibrantColor, since advanceColor only runs
            // on mouseup. In random mode, advance once up front so the vibrancy
            // guarantee covers the very first paint too.
            if (!firstPaintColorFreshened) {
                firstPaintColorFreshened = true;
                const rndEl = document.getElementById('randomColor');
                if (rndEl && rndEl.checked) advanceColor();
            }
            const hex = document.getElementById('colorPicker').value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            pointer.color = [r, g, b];
        }
        // Advance step/random to the NEXT color and sync the picker
        // (called on mouseup so the picker shows what's coming next)
        function advanceColor() {
            const stepEl = document.getElementById('stepPalette');
            const rndEl = document.getElementById('randomColor');
            if (stepEl && stepEl.checked) {
                const list = getStepColorList();
                if (list.length > 0) {
                    const len = list.length;
                    const idx = paletteStepIndex % len;
                    const col = list[idx];
                    paletteStepIndex = (paletteStepIndex + 1) % len;
                    if (col) {
                        syncPickerIndicator(
                            parseInt(col.slice(1, 3), 16) / 255,
                            parseInt(col.slice(3, 5), 16) / 255,
                            parseInt(col.slice(5, 7), 16) / 255
                        );
                    }
                    if (typeof updatePaletteStepIndicator === 'function') {
                        updatePaletteStepIndicator();
                    }
                    return;
                }
            }
            if (rndEl && rndEl.checked) {
                var c = generateVibrantColor();
                syncPickerIndicator(c[0], c[1], c[2]);
                return;
            }
        }
        // Legacy wrapper — reads picker then advances (used by non-pointer callers)
        function updateColor() {
            applyPickerColor();
            advanceColor();
        }
        // ── Active-brush colour: one source of truth (arm 0) ──────────────
        // The top-nav Color channel and the Brush Colors panel's arm-0 row are
        // two VIEWS of multiArmColors[0].mode. setActiveBrushColorMode is the
        // single UI writer of that mode; syncBrushColorUI reflects it back into
        // every widget by PROPERTY (never dispatches events), so nothing loops.
        // Recording already treats arm0.mode as canonical (03-recording.js).
        function ensureArm0() {
            var arr = window.multiArmColors;
            if (!arr) { arr = []; window.multiArmColors = arr; }
            if (!arr[0]) arr[0] = { mode: 'main', color: '#ffffff', stepIndex: 0 };
            return arr[0];
        }
        window.ensureArm0 = ensureArm0;
        // Reflect arm0.mode into all colour widgets WITHOUT dispatching events.
        function syncBrushColorUI(opts) {
            if (window.__brushColorSyncing) return;
            window.__brushColorSyncing = true;
            try {
                opts = opts || {};
                var a0 = ensureArm0();
                var m = a0.mode;
                var rnd = document.getElementById('randomColor');
                var stepEl = document.getElementById('stepPalette');
                if (rnd) rnd.checked = (m === 'random');
                if (stepEl) stepEl.checked = (m === 'step');
                // Top-nav chips (built in 20-mixer with data-brush-mode).
                var chips = document.querySelectorAll('[data-brush-mode]');
                for (var i = 0; i < chips.length; i++) {
                    var bm = chips[i].getAttribute('data-brush-mode');
                    var on = (bm === 'rnd' && m === 'random')
                          || (bm === 'step' && m === 'step');
                    chips[i].classList.toggle('active', on);
                }
                // Picker shows the fixed swatch (no 'input' dispatch).
                if ((m === 'fixed' || m === 'main') && a0.color) {
                    var cp = document.getElementById('colorPicker');
                    if (cp && cp.value !== a0.color) cp.value = a0.color;
                }
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
                // Panel arm-0 row: rebuild only when open, and not when the
                // panel itself initiated the change (skipPanel).
                if (!opts.skipPanel && typeof window.rebuildArmColorRows === 'function') {
                    // Must match the ARM-COLORS popup specifically: the brush
                    // drawer and the presets popup also carry .arm-colors-panel
                    // (shared skin) and the drawer is now built FIRST, so a bare
                    // '.arm-colors-panel' query hit the drawer and rebuilt every
                    // arm row on each palette change even with the popup closed.
                    var panel = document.querySelector('.arm-colors-panel.arm-colors-rows');
                    if (panel && panel.style.display !== 'none') window.rebuildArmColorRows();
                }
            } finally {
                window.__brushColorSyncing = false;
            }
        }
        window.syncBrushColorUI = syncBrushColorUI;
        // The one action. mode ∈ 'fixed' | 'random' | 'step'.
        // ('rainbow' removed 2026-08-15 — this coercion is the sanitizer that
        // turns any stale saved/mirrored 'rainbow' into 'fixed'.)
        function setActiveBrushColorMode(mode, opts) {
            opts = opts || {};
            if (mode !== 'random' && mode !== 'step') mode = 'fixed';
            var a0 = ensureArm0();
            a0.mode = mode;
            a0.cachedColor = null;
            if (mode === 'fixed') {
                // Adopt the given swatch, or whatever the picker currently shows
                // (so toggling a generative mode OFF keeps the visible colour).
                if (opts.color) a0.color = opts.color;
                else {
                    var cp = document.getElementById('colorPicker');
                    if (cp && cp.value) a0.color = cp.value;
                }
            }
            if (typeof window.persistArmColors === 'function') window.persistArmColors();
            syncBrushColorUI(opts.skipPanel ? { skipPanel: true } : undefined);
            // Side effects AFTER the checkboxes reflect the new mode (advanceColor
            // reads them): seed the picker "next" preview for random/step, set
            // pointer.color for fixed.
            if (mode === 'random' || mode === 'step') {
                advanceColor();
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
            } else if (mode === 'fixed') {
                applyPickerColor();
            }
        }
        window.setActiveBrushColorMode = setActiveBrushColorMode;
        // Expose globally for other scripts
        window.generateVibrantColor = generateVibrantColor;
