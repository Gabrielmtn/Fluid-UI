// ═══════════════════════════════════════════════════════════════════
// scripts/bake-trailer-scenes.js — PAGE code for scripts/bake-trailer.js.
// Needs scripts/bake-effect-previews.js injected first (its pen, setters,
// 60 Hz pacing and quality pin are reused through window.__fxBake).
//
// Needs scripts/test/harness.js injected too (its virtual clock).
//
//   __trailer.setup()      Focus mode, quality pinned high
//   __trailer.probe()      what the page looks like (ids, sizes)
//   __trailer.record(key)  one scene → clips/<key>.mp4, frame-locked
//
// A scene: its caption is a Text-tool line IN the canvas (optionally a
// collider, so the paint parts around the letters); pre() sets the look;
// pen(phase) is the stroke over the take (null = pen up); frame(phase)
// runs once per drawn frame for cues (light position, a look change).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    const B = window.__fxBake;
    if (!B) throw new Error('inject scripts/bake-effect-previews.js first');
    const $ = (id) => document.getElementById(id);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const TAU = Math.PI * 2;
    const set = B.set;

    // ── Caption: a Text-tool line in the canvas ───────────────────
    const CAPTION = {
        fontFamily: "Bahnschrift, 'DIN Alternate', sans-serif",
        fontWeight: '600', fontSize: 132, letterSpacing: 2, color: '#ffffff',
        shadow: true, align: 'center', textCase: 'none',
        collider: true, colliderMode: 'deflect'                // every caption: the paint parts around the words
    };
    function caption(opts) {
        return window.textOverlays.add(Object.assign({}, CAPTION, opts));
    }

    // ── Setup, once per page ──────────────────────────────────────
    let ROLE = 'recorder';
    async function setup(opts) {
        ROLE = (opts && opts.role) || 'recorder';
        B.pinQuality();
        // Frame-locked recording makes speed irrelevant, so the recorder's
        // quality goes up: Image Sharpness 4096 (dye) and Motion Detail 2048
        // (sim), the governor off (pinQuality), and a 60 fps cap so no
        // virtual frame is skipped. An artist only sends strokes; its own
        // picture is never recorded, so it stays light.
        set.select('visualResolution', ROLE === 'recorder' ? '4096' : '1024');
        set.select('physicsResolution', ROLE === 'recorder' ? '2048' : '512');
        set.select('fpsCap', '60');
        // No toasts, no Focus badge or hint over the take (they are DOM,
        // not in the export, but they would be in any screenshot).
        const css = document.createElement('style');
        css.textContent = '#focus-mode-badge,.focus-hint,#focus-hint,.toast,.toast-container,#toast-container{display:none !important}';
        document.head.appendChild(css);
        if (!document.body.classList.contains('focus-mode')) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', bubbles: true, cancelable: true }));
        }
        await sleep(1200);
        const c = $('canvas');
        return { canvas: [c.width, c.height], css: [c.clientWidth, c.clientHeight], focus: document.body.className,
                 dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION };
    }

    function probe() {
        const ids = Array.from(document.querySelectorAll('input[id],select[id],button[id]'))
            .map((e) => e.id).filter((id) => /mult|symm|kaleid|mandala|paint|type|arm|tip|collid|light|shad|scatter|glow|grav|rotat|spin|bg|background|color/i.test(id));
        const c = $('canvas');
        return { ids: ids, canvas: [c.width, c.height], css: [c.clientWidth, c.clientHeight],
                 ground: ($('backgroundColorPicker') || {}).value, body: document.body.className,
                 presets: Array.from(document.querySelectorAll('[data-preset]')).map((b) => b.dataset.preset) };
    }

    // ── Pen paths ─────────────────────────────────────────────────
    // A path is a list of pieces over the take's phase [0, 1): a Bezier
    // through canvas-fraction points ({pts}), or an arc round a centre
    // ({c, r, a0, a1}; r in canvas widths, so it stays round on 16:9).
    // Between pieces the pen is up.
    const ASPECT = 16 / 9;
    const rgb01 = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
    const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const bez = (pts, t) => { let p = pts.map((q) => q.slice()); for (let k = p.length - 1; k > 0; k--) for (let i = 0; i < k; i++) p[i] = [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]; return p[0]; };
    // A piece may also be {fn: t → {u, v}}, and may carry a color: the
    // brush colour is set as the pen enters that piece (a look's own
    // colour isn't put on the picker by applyPreset, so the first stroke
    // would otherwise be whatever colour the page had before).
    function path(list) {
        let current = null;
        return (ph) => {
            for (const s of list) {
                if (ph >= s.at && ph < s.at + s.len) {
                    if (current !== s) {
                        current = s;
                        if (s.color) {
                            set.color(s.color);
                            // Picking a colour turns arm 1 to Custom, and a peer's dab is
                            // drawn through the RECEIVER's arm colours (05g:627
                            // resolveArmColor), so in a room every peer's paint came out in
                            // ours. Arm 1 back on Main keeps their colours theirs.
                            if (window.__trailerArmMain) setArms([null]);
                        }
                    }
                    const t = (ph - s.at) / s.len;
                    if (s.fn) return s.fn(t);
                    if (s.pts) { const q = bez(s.pts, ease(t)); return { u: q[0], v: q[1] }; }
                    const a = s.a0 + (s.a1 - s.a0) * t;
                    return { u: s.c[0] + s.r * Math.cos(a), v: s.c[1] + s.r * ASPECT * Math.sin(a) };
                }
            }
            current = null;
            return null;
        };
    }
    // Kaleidoscope wedge (scripts/bake-kaleido-shot.js): with Wedge mode and
    // kAngle = 180/N the display shows texture angles [0, π/N] mirrored N
    // ways, in place. Texture y is flipped and radius is per axis, so
    // texture (θ, r) lands at screen u = .5 + r cos θ, v = .5 − r sin θ.
    const wedge = (th, r) => ({ u: 0.5 + r * Math.cos(th), v: 0.5 - r * Math.sin(th) });
    const radial = (th, r0, r1) => (t) => wedge(th, r0 + (r1 - r0) * ease(t));
    const ring = (r, th0, th1) => (t) => wedge(th0 + (th1 - th0) * t, r);
    const hold = (u, v) => () => ({ u: u, v: v });

    // Per-arm colours, set IN PLACE: 05g's resolveArmColor reads its own
    // reference to the array, so a new array on window would be ignored.
    function setArms(colors) {
        const arr = window.multiArmColors;
        if (!arr) return;
        arr.length = 0;
        colors.forEach((c) => arr.push(c ? { mode: 'fixed', color: c, stepIndex: 0, push: false } : { mode: 'main', color: '#ffffff', stepIndex: 0, push: false }));
    }

    // A text glyph as a brush shape (23 makeBrush renders it white at 940 px
    // and hands it to BrushShapes.add, which makes it the active tip).
    function glyphBrush(ch) {
        return new Promise((resolve) => {
            const ov = window.textOverlays.add({ content: ch, fontSize: 200, visible: false, collider: false });
            window.textOverlays.makeBrush(ov.id, (id) => { window.textOverlays.remove(ov.id); resolve(id); });
        });
    }
    // The stamp texture uploads on Image.onload (a real task); until then
    // multiSplat drops the dabs.
    async function stampReady() {
        for (let i = 0; i < 200 && window.BrushShapes.stampPending(); i++) await sleep(25);
    }
    // The names the driver gives the artist Chromes, in order.
    const NAMES = ['Mira', 'Jun', 'Sol', 'Kit'];

    // Everything a scene may have switched on goes back off before the next.
    function resetAll() {
        B.allOff();
        set.check('kaleidoToggle', false);
        set.check('kAnimateRot', false);
        set.check('mandalaToggle', false);
        set.slider('multiplier', 1);
        set.select('symmetryMode', 'radial');
        setArms([null]);
        if (window.BrushType) window.BrushType.set('fluid');
        if (window.config) window.config.BRUSH_VEL_MODE = 'smudge';
        set.slider('colorBlend', 0);
        set.select('materialMode', 'fluid');
        if (window.config) { window.config.AMBIENT_FORCE = false; window.config.AMBIENT_FORCE_X = 0; window.config.AMBIENT_FORCE_Y = 0; }
        if (window.BrushShapes && window.BrushShapes.activeId && window.BrushShapes.activeId()) window.BrushShapes.setActive(null);
        if (window.textOverlays.clearAll) window.textOverlays.clearAll();
        if (window.layers && typeof window.deleteLayer === 'function') {
            window.layers.slice().forEach((l) => { try { window.deleteLayer(l.index); } catch (_) {} });
        }
        if (window.clearCanvas) window.clearCanvas();
    }

    // ── Scenes ────────────────────────────────────────────────────
    // secs: take length. preset: a built-in look (physics, shading, ground).
    // text: the caption line. pre(): extra setup. pen: the stroke, each
    // piece with its own colour. frame(phase, line): per-frame cue.
    // warm/warmPen: painted before the take starts, so it opens on paint
    // already moving.
    const BR = { x: 0.73, y: 0.85, fontSize: 120 };          // bottom-right caption, Krita's corner
    const C = { coral: '#F18473', teal: '#35C4B5', cream: '#F2DBB4', opal: '#2AC9B7', lilac: '#E9E3F1',
                violet: '#8B72D9', gold: '#FFC857', rose: '#FF5E86', sky: '#7FC4FF' };
    const N = 12, HALF = Math.PI / N;                        // kaleidoscope wedges
    const SCENES = {
        // ── Opening and closing: four painters round the title ────────
        title: {
            secs: 7, preset: 'currents', size: 3, selfName: 'Ari', selfColor: C.coral,
            text: { content: 'Swirl Together', x: 0.5, y: 0.48, fontSize: 210, fontWeight: '700' },
            pen: path([
                { pts: [[0.00, 0.30], [0.22, 0.62], [0.42, 0.66]], at: 0.02, len: 0.30, color: C.coral },
                { pts: [[0.30, 0.80], [0.50, 0.70], [0.70, 0.82]], at: 0.56, len: 0.30, color: C.coral }
            ]),
            artists: [
                { size: 3, tag: C.teal, pen: path([
                    { pts: [[1.00, 0.70], [0.78, 0.36], [0.58, 0.30]], at: 0.08, len: 0.30, color: C.teal },
                    { pts: [[0.70, 0.18], [0.50, 0.28], [0.30, 0.16]], at: 0.60, len: 0.30, color: C.teal }
                ]) },
                { size: 3, tag: C.gold, pen: path([
                    { pts: [[0.00, 0.86], [0.20, 0.70], [0.34, 0.72]], at: 0.18, len: 0.28, color: C.gold }
                ]) },
                { size: 3, tag: C.violet, pen: path([
                    { pts: [[1.00, 0.12], [0.80, 0.26], [0.66, 0.24]], at: 0.26, len: 0.28, color: C.violet }
                ]) }
            ]
        },
        end: {
            secs: 7, preset: 'currents', size: 3, selfName: 'Ari', selfColor: C.coral,
            text: { content: 'Swirl Together', x: 0.5, y: 0.42, fontSize: 190, fontWeight: '700' },
            pre() { window.__trailer.caption({ content: 'Wishlist now on Steam', x: 0.5, y: 0.62, fontSize: 84, fontWeight: '400' }); },
            pen: path([{ pts: [[0.00, 0.20], [0.30, 0.10], [0.62, 0.22], [1.00, 0.12]], at: 0.04, len: 0.34, color: C.coral }]),
            artists: [
                { size: 3, tag: C.teal, pen: path([{ pts: [[1.00, 0.86], [0.66, 0.92], [0.34, 0.80], [0.00, 0.90]], at: 0.10, len: 0.34, color: C.teal }]) },
                { size: 3, tag: C.gold, pen: path([{ pts: [[0.02, 0.98], [0.10, 0.70], [0.04, 0.40]], at: 0.30, len: 0.24, color: C.gold }]) },
                { size: 3, tag: C.violet, pen: path([{ pts: [[0.98, 0.02], [0.90, 0.30], [0.96, 0.60]], at: 0.40, len: 0.24, color: C.violet }]) }
            ]
        },

        // ── Replay: draw a gesture, then hold right-click and it repeats ──
        // The real right-click replay (05d): isRightMouseDown + replayStroke,
        // looping while held. Its playhead runs on Date.now, which rides
        // the virtual clock here.
        replay: {
            secs: 8, preset: 'currents', size: 2.5,
            text: { content: 'Hold right-click to replay', x: 0.5, y: 0.12, fontSize: 130 },
            // Old loops fade, so each pass reads as the same gesture again.
            pre() { window.config.DENSITY_DISSIPATION = 0.985; },
            pen: path([
                { fn: (t) => { const a = t * TAU * 1.25; return { u: 0.30 + 0.30 * t + 0.07 * Math.cos(a * 2), v: 0.58 + 0.16 * Math.sin(a * 2) }; }, at: 0.02, len: 0.22, color: C.coral }
            ]),
            frame(ph) {
                if (ph > 0.27 && !this.__held) {
                    this.__held = true;
                    isRightMouseDown = true; isReplayActive = true;
                    replayStroke(false);                         // false: not sent to a room
                }
            },
            after() { isRightMouseDown = false; isReplayActive = false; delete this.__held; }
        },

        // ── Custom brush shapes: a glyph becomes the brush tip ─────────
        shapes: {
            secs: 8, preset: 'opal', size: 3,
            text: { content: 'Your own brush shapes', x: 0.5, y: 0.12, fontSize: 130 },
            async pre() {
                this.__shapes = [await glyphBrush('\u2605'), await glyphBrush('\u2665')];   // star, heart
                for (const id of this.__shapes.slice().reverse()) { window.BrushShapes.setActive(id); await stampReady(); }
            },
            // Each stamp goes through the app's own stamp path
            // (applyMultiSplatWith, not exact colour: the active shape
            // prints), placed every few frames along a curve the way a
            // spaced-out brush lays them. Then a stroke stirs them.
            frame(ph) {
                const runs = [
                    { from: 0.03, to: 0.33, shape: 0, color: C.gold, pts: [[0.08, 0.70], [0.30, 0.28], [0.55, 0.76], [0.84, 0.34]] },
                    { from: 0.36, to: 0.66, shape: 1, color: C.rose, pts: [[0.12, 0.42], [0.36, 0.84], [0.62, 0.40], [0.90, 0.70]] }
                ];
                const c = $('canvas');
                runs.forEach((r) => {
                    if (ph < r.from || ph > r.to || LIVE.i % 9) return;
                    // The stamp takes the brush colour, so the picker is set per run.
                    if (this.__on !== r.shape) { this.__on = r.shape; window.BrushShapes.setActive(this.__shapes[r.shape]); set.color(r.color); setArms([null]); }
                    const t = (ph - r.from) / (r.to - r.from), a = bez(r.pts, t), b = bez(r.pts, Math.min(1, t + 0.02));
                    window.applyMultiSplatWith(a[0] * c.width, a[1] * c.height, (b[0] - a[0]) * 120, (b[1] - a[1]) * 120, rgb01(r.color), 1, 0.0052, false);
                });
            },
            pen: path([
                { pts: [[0.00, 0.94], [0.40, 0.70], [0.70, 0.86], [1.00, 0.60]], at: 0.74, len: 0.22, color: C.teal }
            ]),
            after() { window.BrushShapes.setActive(null); }
        },

        // ── Text hotkeys: a key pours its word at the brush ───────────
        textkeys: {
            secs: 8, preset: 'currents', size: 2.5,
            text: { content: 'Text hotkeys', x: 0.5, y: 0.12, fontSize: 150 },
            pre() {
                this.__words = [['swirl', C.teal, 'KeyQ'], ['pour', C.gold, 'KeyW'], ['flow', C.coral, 'KeyE'], ['together', C.lilac, 'KeyR']]
                    .map(([w, col, key]) => window.textOverlays.add(Object.assign({}, CAPTION, {
                        content: w, color: col, fontSize: 250, collider: false, visible: false,
                        hotkey: key, hotkeyAction: 'pour', hotkeyAt: 'brush' })).id);
                this.__fired = 0;
            },
            // A word at each beat, poured where the brush is; a stroke runs
            // through between them so the words swirl.
            frame(ph) {
                const beats = [[0.04, 0.26, 0.38], [0.22, 0.72, 0.36], [0.40, 0.30, 0.64], [0.58, 0.70, 0.64]];
                const b = beats[this.__fired];
                if (b && ph >= b[0]) {
                    const c = $('canvas');
                    window.__cursorPos = { x: c.width * b[1], y: c.height * b[2], at: Date.now() };
                    window.textOverlays.triggerHotkey(this.__words[this.__fired]);
                    (this.__keycaps = this.__keycaps || []).push({ label: 'QWER'[this.__fired], u: b[1], v: b[2], i: LIVE.i });
                    this.__fired++;
                }
            },
            // A stroke along the bottom: the words above curl into its wake.
            pen: path([
                { pts: [[0.00, 0.90], [0.35, 0.84], [0.65, 0.92], [1.00, 0.86]], at: 0.80, len: 0.18, color: C.violet }
            ]),
            after() { (this.__words || []).forEach((id) => window.textOverlays.remove(id)); }
        },

        // ── Walls you draw: a spiral, paint poured in, then turned ─────
        walls: {
            secs: 9, preset: 'currents', size: 1.6,
            text: { content: 'Draw your own walls', x: 0.5, y: 0.10, fontSize: 130 },
            frame(ph, line) {
                const want = ph < 0.26 ? 'collider' : 'fluid';
                if (window.BrushType.get() !== want) {
                    window.BrushType.set(want);
                    if (want === 'fluid') {
                        set.slider('brushSize', 3.2);
                        const L = (window.layers || []).filter((l) => l.isCollision).pop();
                        if (L) { L.colliderColour = '#F2DBB4'; if (window.renderLayers) window.renderLayers(); }
                    }
                }
                // Then play with it: the wall goes from Block to Slow and the
                // paint seeps through.
                if (ph > 0.66 && !this.__slow) {
                    this.__slow = true;
                    const L = (window.layers || []).filter((l) => l.isCollision).pop();
                    if (L) { L.collisionMode = 'slow'; window.collisionLayers.updateObstacleFromLayers(); }
                    window.textOverlays.update(line.id, { content: 'Block \u2192 Slow' });
                }
            },
            pen: path([
                { fn: (t) => { const a = t * TAU * 2.1, r = 0.05 + 0.25 * t; return { u: 0.5 + r * Math.cos(a), v: 0.55 + r * ASPECT * 0.9 * Math.sin(a) }; }, at: 0.02, len: 0.22 },
                { pts: [[0.00, 0.40], [0.14, 0.46], [0.26, 0.52]], at: 0.30, len: 0.10, color: C.teal },
                { pts: [[1.00, 0.70], [0.86, 0.64], [0.74, 0.58]], at: 0.42, len: 0.10, color: C.coral },
                { pts: [[0.50, 1.00], [0.52, 0.94], [0.50, 0.88]], at: 0.54, len: 0.08, color: C.gold },
                { pts: [[0.00, 0.62], [0.16, 0.58], [0.28, 0.56]], at: 0.72, len: 0.10, color: C.teal },
                { pts: [[1.00, 0.44], [0.84, 0.50], [0.72, 0.52]], at: 0.84, len: 0.10, color: C.coral }
            ])
        },

        // ── Pressure iterations: one gesture, three feels ─────────────
        // Under 12 the solver is plain Jacobi and the paint is compressible
        // (soft, bulging); 24 and up is the full multigrid solve (crisp).
        pressure: {
            secs: 9, preset: 'currents', size: 3,
            text: { content: 'Pressure iterations: 1', x: 0.5, y: 0.12, fontSize: 130 },
            frame(ph, line) {
                const k = ph < 0.5 ? 0 : 1;
                if (this.__k === k) return;
                this.__k = k;
                const v = [1, 50][k];
                if (k > 0 && window.clearCanvas) window.clearCanvas();
                set.slider('pressureIteration', v);
                window.textOverlays.update(line.id, { content: 'Pressure iterations: ' + v });
            },
            pen: path([0, 1].flatMap((q) => [
                { pts: [[0.02, 0.58], [0.30, 0.52], [0.48, 0.56]], at: q / 2 + 0.02, len: 0.09, color: C.coral },
                { pts: [[0.98, 0.52], [0.70, 0.60], [0.52, 0.56]], at: q / 2 + 0.13, len: 0.09, color: C.teal },
                { pts: [[0.50, 0.98], [0.46, 0.78], [0.50, 0.62]], at: q / 2 + 0.26, len: 0.08, color: C.gold }
            ])),
            after() { set.slider('pressureIteration', 25); }
        },

        // ── Together: real people in one room (scripts/bake-trailer.js
        // starts a local relay and an artist Chrome per entry in artists[];
        // their strokes reach the recorder as remote dabs, tagged with
        // their names). selfName tags the recorder's own hand.
        together: {
            secs: 8, preset: 'currents', size: 3, selfName: 'Ari', selfColor: '#F18473',
            text: { content: 'Up to 8 in a room', x: 0.5, y: 0.12, fontSize: 130 },
            pen: path([
                { pts: [[0.02, 0.92], [0.30, 0.70], [0.56, 0.62], [0.62, 0.40]], at: 0.02, len: 0.36, color: '#F18473' },
                { pts: [[0.40, 0.66], [0.30, 0.44], [0.44, 0.30], [0.60, 0.36]], at: 0.56, len: 0.30, color: '#F18473' }
            ]),
            artists: [
                { size: 3, tag: '#35C4B5', pen: path([
                    { pts: [[0.98, 0.20], [0.72, 0.30], [0.44, 0.36], [0.38, 0.60]], at: 0.08, len: 0.36, color: '#35C4B5' },
                    { pts: [[0.62, 0.34], [0.72, 0.56], [0.58, 0.70], [0.42, 0.64]], at: 0.60, len: 0.30, color: '#35C4B5' }
                ]) },
                { size: 3, tag: '#FFC857', pen: path([
                    { pts: [[0.02, 0.24], [0.26, 0.38], [0.40, 0.62], [0.62, 0.66]], at: 0.14, len: 0.36, color: '#FFC857' },
                    { pts: [[0.30, 0.56], [0.40, 0.76], [0.62, 0.78], [0.74, 0.58]], at: 0.62, len: 0.28, color: '#FFC857' }
                ]) },
                { size: 3, tag: '#8B72D9', pen: path([
                    { pts: [[0.98, 0.88], [0.74, 0.70], [0.58, 0.46], [0.36, 0.40]], at: 0.20, len: 0.36, color: '#8B72D9' },
                    { pts: [[0.70, 0.40], [0.62, 0.22], [0.44, 0.24], [0.34, 0.42]], at: 0.66, len: 0.26, color: '#8B72D9' }
                ]) }
            ]
        },
        fluid: {
            secs: 7, preset: 'opal',
            text: Object.assign({ content: 'Paint is a fluid', collider: true, colliderMode: 'deflect' }, BR),
            // Two strokes, then hands off: it keeps moving after you let go.
            pen: path([
                { pts: [[0.06, 0.30], [0.30, 0.06], [0.50, 0.52], [0.72, 0.18]], at: 0.02, len: 0.24, color: C.opal },
                { pts: [[0.84, 0.44], [0.58, 0.72], [0.32, 0.40], [0.12, 0.62]], at: 0.29, len: 0.22, color: C.violet }
            ])
        },
        multibrush: {
            secs: 7, preset: 'bloom',                           // 8 radial arms, each its own colour
            text: Object.assign({}, BR, { content: 'Multi-Brush: 8 arms', x: 0.68 }),
            // Short petals off the pivot: eight copies make a flower, not a flood.
            pen: path([
                { pts: [[0.56, 0.50], [0.61, 0.34], [0.69, 0.40]], at: 0.04, len: 0.13, color: C.opal },
                { pts: [[0.60, 0.60], [0.66, 0.72], [0.74, 0.62]], at: 0.30, len: 0.12, color: C.opal },
                { pts: [[0.53, 0.47], [0.57, 0.42], [0.60, 0.46]], at: 0.56, len: 0.08, color: C.opal }
            ])
        },
        kaleidoscope: {
            secs: 7, preset: 'currents',
            text: Object.assign({ content: 'Kaleidoscope' }, BR),
            pre() {
                window._kaleidoBootstrapped = true;             // or the first enable forces 8 arms
                set.check('kaleidoToggle', true);
                set.select('kaleidoMode', '1');                 // Wedge
                set.slider('kaleidoSegments', N);
                set.slider('kTwist', 0); set.slider('kZoom', 1); set.slider('kBlend', 1);
                set.check('kAnimateRot', false);
                set.slider('multiplier', 1);
                set.slider('kAngle', 180 / N);                  // identity: the wedge shows in place
                window.kaleidoEnabled = true;
            },
            // Paint one wedge, get twelve. Radial strokes become spokes,
            // a sweep across the wedge closes into a ring.
            pen: path([
                { fn: radial(HALF * 0.5, 0.04, 0.40), at: 0.03, len: 0.14, color: C.gold },
                { fn: ring(0.30, HALF * 0.1, HALF * 0.95), at: 0.22, len: 0.08, color: C.teal },
                { fn: radial(HALF * 0.8, 0.40, 0.08), at: 0.36, len: 0.14, color: C.coral },
                { fn: ring(0.18, HALF * 0.95, HALF * 0.1), at: 0.56, len: 0.07, color: C.violet },
                { fn: radial(HALF * 0.25, 0.10, 0.40), at: 0.70, len: 0.12, color: C.cream }
            ])
        },
        collider: {
            secs: 7, preset: 'currents',
            text: { content: 'Collider', x: 0.2, y: 0.85, fontSize: 120 },
            // A wall drawn with the Collider brush, then paint pushed at it.
            // The switch at 0.2 falls in the gap between the wall stroke and
            // the first paint stroke, so the pen is up when it happens.
            frame(ph) {
                const want = ph < 0.2 ? 'collider' : 'fluid';
                if (window.BrushType && window.BrushType.get() !== want) window.BrushType.set(want);
            },
            pen: path([
                { pts: [[0.66, 0.10], [0.56, 0.50], [0.68, 0.90]], at: 0.02, len: 0.15 },
                { pts: [[0.04, 0.40], [0.30, 0.30], [0.58, 0.46]], at: 0.24, len: 0.22, color: C.coral },
                { pts: [[0.04, 0.70], [0.32, 0.76], [0.58, 0.60]], at: 0.52, len: 0.22, color: C.cream }
            ])
        },
        pour: {
            secs: 7, preset: 'currents',
            text: { content: 'Pour into fluid', x: 0.5, y: 0.48, fontSize: 190, fontWeight: '700', color: C.gold },
            // The caption itself becomes paint; strokes run past it, one
            // below and one above, and the letters curl into their wake.
            frame(ph, line) {
                if (ph > 0.2 && line && !line.__poured) {
                    line.__poured = true;
                    // The stand-in must not be a wall: its letters would erase the poured paint.
                    const twin = window.__trailer.caption(Object.assign({}, this.text, { collider: false }));
                    window.textOverlays.fluidize(line.id, () => window.textOverlays.remove(twin.id));
                }
            },
            pen: path([
                { pts: [[0.00, 0.70], [0.35, 0.62], [0.65, 0.74], [1.00, 0.64]], at: 0.34, len: 0.26, color: C.teal },
                { pts: [[1.00, 0.24], [0.62, 0.34], [0.36, 0.22], [0.00, 0.32]], at: 0.64, len: 0.26, color: C.coral }
            ])
        },
        gravity: {
            secs: 7, preset: 'currents',
            text: { content: 'Gravity Direction', x: 0.5, y: 0.13, fontSize: 120 },
            pre() {
                set.check('pressureConstant', true);
                window.config.AMBIENT_FORCE = true; window.config.AMBIENT_FORCE_X = 0; window.config.AMBIENT_FORCE_Y = 1;
                window.config.AMBIENT_FORCE_REF = 12;
                window.config.DENSITY_DISSIPATION = 0.99;      // old drips fade, new ones read
            },
            // Drops fall; halfway through, gravity turns and the paint pours sideways.
            frame(ph) {
                if (ph > 0.55 && window.config.AMBIENT_FORCE_X === 0) { window.config.AMBIENT_FORCE_X = 1; window.config.AMBIENT_FORCE_Y = 0.25; }
            },
            pen: path([
                { fn: hold(0.22, 0.30), at: 0.02, len: 0.025, color: C.coral },
                { fn: hold(0.50, 0.28), at: 0.12, len: 0.025, color: C.teal },
                { fn: hold(0.78, 0.30), at: 0.22, len: 0.025, color: C.gold },
                { fn: hold(0.36, 0.32), at: 0.33, len: 0.025, color: C.violet },
                { fn: hold(0.08, 0.36), at: 0.60, len: 0.03, color: C.cream },
                { fn: hold(0.08, 0.62), at: 0.72, len: 0.03, color: C.coral }
            ])
        },
        // Color Blend: two wet colours wound round each other mix where they
        // touch. A 2-arm Multi-Brush (one blue arm, one pink) draws one
        // spiral, so the colours arrive as equal interleaved arms; then a
        // Pressure brush on Swirl stirs them. Blend eases in over ~3 s of
        // sim time, hence settle.
        blend: {
            secs: 8, preset: 'currents', settle: 3.5, size: 2.5,
            text: { content: 'Color Blend', x: 0.5, y: 0.12, fontSize: 150 },
            pre() {
                set.slider('colorBlend', 1);
                set.select('symmetryMode', 'radial');
                set.slider('multiplier', 2);
                setArms(['#2F6BFF', '#FF3D8B']);
            },
            frame(ph) {
                const want = ph < 0.46 ? 'fluid' : 'pressure';
                if (window.BrushType.get() !== want) { window.config.BRUSH_VEL_MODE = 'swirl'; window.BrushType.set(want); }
            },
            pen: path([
                { fn: (t) => { const a = t * TAU * 1.6, r = 0.30 - 0.24 * t; return { u: 0.5 + r * Math.cos(a), v: 0.56 + r * ASPECT * Math.sin(a) }; }, at: 0.02, len: 0.40 },
                { fn: (t) => ({ u: 0.5 + 0.10 * Math.cos(t * TAU * 2), v: 0.56 + 0.18 * Math.sin(t * TAU * 2) }), at: 0.50, len: 0.42 }
            ])
        },
        // Laminar: colours stay apart when smudged and fold into finer and
        // finer bands, like marbling. Bands first, then a comb of smudges.
        laminar: {
            secs: 8, preset: 'marble', size: 1.1,            // a thin comb: the bands are laid by lay(), not by this brush
            text: { content: 'Laminar', x: 0.5, y: 0.12, fontSize: 150 },
            // Calm water (Slow marbling, little curl) so the bands lie flat
            // until the comb drags through them.
            pre() {
                set.slider('colorBlend', -1);
                window.config.CURL = 2;
                set.check('displayShadingToggle', true); set.check('colorGate', true);
            },
            // Bands laid as still paint (no stroke velocity): drawn as fast
            // strokes they sheared each other into turbulence before the take.
            lay() {
                [[0.30, C.teal], [0.42, C.gold], [0.54, C.coral], [0.66, C.violet], [0.78, C.cream]].forEach(([v, col]) => {
                    window.__test.stroke({ pts: [[0.0, v], [0.33, v], [0.66, v], [1.0, v]], steps: 220, color: rgb01(col), radius: 0.0022, speed: 2, exact: true });
                });
            },
            frame(ph) {
                if (window.BrushType.get() !== 'pressure') { window.config.BRUSH_VEL_MODE = 'smudge'; window.BrushType.set('pressure'); }
            },
            pen: path([
                { pts: [[0.12, 0.32], [0.14, 0.54], [0.12, 0.76]], at: 0.03, len: 0.13 },
                { pts: [[0.31, 0.76], [0.33, 0.54], [0.31, 0.32]], at: 0.19, len: 0.13 },
                { pts: [[0.50, 0.32], [0.52, 0.54], [0.50, 0.76]], at: 0.35, len: 0.13 },
                { pts: [[0.69, 0.76], [0.71, 0.54], [0.69, 0.32]], at: 0.51, len: 0.13 },
                { pts: [[0.88, 0.32], [0.90, 0.54], [0.88, 0.76]], at: 0.67, len: 0.13 }
            ])
        },
        scatter: {
            secs: 7, preset: 'currents',
            text: { content: 'Scatter', x: 0.56, y: 0.52, fontSize: 260, fontWeight: '700' },
            // Light shafts from the lamp in the corner; the caption is a
            // collider, so it casts its own shadow shafts across the paint.
            // No Glow: with additive paint it floods the frame to white in
            // ~2 s (measured: mean 222/255).
            pre() {
                set.check('enableLighting', true);
                if (window.lightSource) { window.lightSource.mode = 'manual'; window.lightSource.x = 0.08; window.lightSource.y = 0.12; }
                set.select('lightMode', 'manual');
                set.slider('lightIntensity', 0.9); set.slider('lightAmbient', 0.2);
                set.select('scatterSource', 'light');
                set.check('scatterBlockToggle', true);
                set.check('scatterToggle', true); set.slider('scatterAmount', 1); set.slider('scatterReach', 1);
            },
            pen: path([
                { pts: [[0.02, 0.30], [0.20, 0.10], [0.36, 0.40], [0.22, 0.62]], at: 0.03, len: 0.24, color: C.gold },
                { pts: [[0.40, 0.08], [0.62, 0.24], [0.90, 0.14]], at: 0.32, len: 0.20, color: C.coral },
                { pts: [[0.10, 0.80], [0.30, 0.66], [0.50, 0.86]], at: 0.58, len: 0.20, color: C.cream }
            ])
        },
        thick: {
            secs: 7, preset: 'currents',
            text: Object.assign({ content: 'Thick paint' }, BR),
            pre() { set.select('materialMode', 'clay'); },
            pen: path([
                { pts: [[0.06, 0.40], [0.28, 0.20], [0.50, 0.42], [0.66, 0.26]], at: 0.03, len: 0.24, color: C.coral },
                { pts: [[0.10, 0.62], [0.34, 0.52], [0.56, 0.66]], at: 0.32, len: 0.20, color: C.cream },
                { pts: [[0.70, 0.12], [0.58, 0.40], [0.80, 0.56]], at: 0.58, len: 0.20, color: C.teal }
            ])
        },
        swirl: {
            secs: 7, preset: 'opal',
            text: Object.assign({ content: 'Pressure: Swirl' }, BR),
            // Bands of paint first, then the Pressure brush on Swirl (moves
            // the fluid, adds no paint) turns them into whirlpools.
            warm: 2.6,
            warmPen: path([
                { pts: [[0.00, 0.28], [0.50, 0.22], [1.00, 0.30]], at: 0.00, len: 0.28, color: C.opal },
                { pts: [[1.00, 0.46], [0.50, 0.52], [0.00, 0.44]], at: 0.33, len: 0.28, color: C.violet },
                { pts: [[0.00, 0.64], [0.50, 0.70], [1.00, 0.62]], at: 0.66, len: 0.28, color: C.gold }
            ]),
            frame(ph) {
                if (window.BrushType && window.BrushType.get() !== 'pressure') { window.config.BRUSH_VEL_MODE = 'swirl'; window.BrushType.set('pressure'); }
            },
            pen: path([
                { fn: (t) => ({ u: 0.32 + 0.02 * Math.cos(t * TAU * 3), v: 0.45 + 0.035 * Math.sin(t * TAU * 3) }), at: 0.05, len: 0.30 },
                { fn: (t) => ({ u: 0.62 + 0.02 * Math.cos(-t * TAU * 3), v: 0.52 + 0.035 * Math.sin(-t * TAU * 3) }), at: 0.45, len: 0.30 }
            ])
        },
        light: {
            secs: 7, preset: 'currents',
            text: Object.assign({ content: 'Light Source', collider: true, colliderMode: 'deflect' }, BR),
            pre() {
                set.check('enableLighting', true);
                if (window.lightSource) window.lightSource.mode = 'manual';
                set.select('lightMode', 'manual');
                set.slider('lightIntensity', 0.8); set.slider('lightAmbient', 0.25);
                set.slider('shadingIntensity', 1.0); set.slider('shadeRelief', 1.3); set.slider('shadeGloss', 0.6);
                set.check('displayShadingToggle', true);
            },
            warm: 2.4,
            warmPen: path([
                { pts: [[0.05, 0.25], [0.40, 0.75], [0.70, 0.20]], at: 0.0, len: 0.4, color: C.coral },
                { pts: [[0.30, 0.15], [0.60, 0.60], [0.95, 0.40]], at: 0.5, len: 0.4, color: C.cream }
            ]),
            frame(ph) {
                if (!window.lightSource) return;
                const a = TAU * ph * 0.9 - Math.PI * 0.75;
                window.lightSource.x = 0.5 + 0.42 * Math.cos(a);
                window.lightSource.y = 0.5 + 0.42 * Math.sin(a);
            },
            pen: path([{ pts: [[0.10, 0.55], [0.35, 0.35], [0.55, 0.62]], at: 0.15, len: 0.30, color: C.teal }])
        },
        looks: {
            secs: 8, preset: 'opal',
            text: Object.assign({ content: 'Liquid opal' }, BR),
            // Four built-in looks, two seconds each, the same gesture in each.
            frame(ph, line) {
                const k = Math.min(3, Math.floor(ph * 4));
                if (this.__k === k) return;
                this.__k = k;
                if (k === 0) return;
                const look = [null, ['bloom', 'Electric bloom'], ['currents', 'Two currents'], ['marble', 'Slow marbling']][k];
                if (window.clearCanvas) window.clearCanvas();
                window.applyPreset(look[0]);
                set.check('stepPalette', false); set.check('randomColor', false);
                if (look[0] !== 'bloom') set.slider('multiplier', 1);
                if (look[0] === 'marble') { window.config.SPLAT_RADIUS = 0.009; set.check('colorGate', true); }
                window.textOverlays.update(line.id, { content: look[1] });
            },
            pen: path([[C.opal, C.violet], [C.opal, C.opal], [C.coral, C.teal], [C.gold, C.violet]].flatMap((cols, q) => [
                { pts: [[0.10, 0.62], [0.28, 0.18], [0.50, 0.66], [0.64, 0.28]], at: q * 0.25 + 0.01, len: 0.11, color: cols[0] },
                { pts: [[0.80, 0.20], [0.60, 0.50], [0.40, 0.30], [0.30, 0.56]], at: q * 0.25 + 0.13, len: 0.09, color: cols[1] }
            ]))
        },
    };
    // The teaser, in order. ORDER is what `clips` records with no keys;
    // other scenes (collider, scatter, thick, swirl, looks, gravity,
    // mandala) are kept for a retune and recorded by name.
    const CUT = ['title', 'fluid', 'together', 'multibrush', 'kaleidoscope', 'replay', 'shapes', 'textkeys',
                 'walls', 'pressure', 'blend', 'laminar', 'pour', 'light', 'end'];
    const ORDER = CUT.slice();
    const SPLITS = {};                                       // e.g. { 'a-b': ['a', 'b'] }: left of a | right of b

    // The scene's look, settings and caption, before any paint.
    async function prep(sc) {
        resetAll();
        Object.keys(sc).forEach((k) => { if (k.startsWith('__')) delete sc[k]; });
        if (sc.preset && window.applyPreset) window.applyPreset(sc.preset);
        await sleep(150);
        // Colours come from the pen pieces: no palette stepping or random hue.
        set.check('stepPalette', false); set.check('randomColor', false);
        if (sc.color) set.color(sc.color);
        if (sc.size) set.slider('brushSize', sc.size);
        if (sc.pre) await sc.pre();
        let line = null;
        if (sc.text) line = caption(sc.text);
        await sleep(400);
        return line;
    }
    // Mean brightness (0-255) of what an export would capture right now.
    async function meanLum() {
        const c = document.createElement('canvas');
        c.width = 192; c.height = 108;
        await window.fluidExport.captureFrame(c, { opaque: true });
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return Math.round(sum / (d.length / 4));
    }

    // ── Frame-locked recording ────────────────────────────────────
    // The harness's virtual clock holds the frame loop. Each output frame
    // is one exact 1/60 s step, composited the way the exporter does it
    // (fluidExport.captureFrame: sim, layers, text) and streamed raw to the
    // driver's ffmpeg. No frame can repeat, whatever the quality costs.
    //
    // Date.now rides the virtual clock too: right-click replay, peer dab
    // pacing, dab flushing and remote cursors all time themselves with it.
    // syncClock(epoch) lines it up across every page of a multi-artist
    // scene, so a dab stamped by an artist plays at the same virtual
    // moment on the recorder.
    const FPS = 60, W = 1920, H = 1080, SUB = 2;            // SUB pointer events per frame
    const T = () => window.__test;
    const realDateNow = window.__realDateNow || (window.__realDateNow = Date.now.bind(Date));
    const CLOCK = { base: 0, v0: 0 };
    async function lock() {
        if (!T()) throw new Error('inject scripts/test/harness.js first');
        const first = !CLOCK.v0;
        await T().freeze();                                  // idempotent: 'already' after the first scene
        if (first) { syncClock(realDateNow()); Date.now = () => Math.round(CLOCK.base + (performance.now() - CLOCK.v0)); }
    }
    function syncClock(epoch) { CLOCK.base = epoch; CLOCK.v0 = performance.now(); return true; }
    const steps = (n) => T().step(n);

    const PEN = { down: false, last: null };
    function firePen(type, p, buttons) {
        $('canvas').dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: buttons, clientX: p.x, clientY: p.y, pressure: buttons ? 0.5 : 0
        }));
    }
    function canvasPoint(q) {
        const r = $('canvas').getBoundingClientRect();
        return { x: r.left + q.u * r.width, y: r.top + q.v * r.height };
    }
    // The pen at this frame's phase, SUB events spread across the frame.
    function penAt(pen, ph, dph) {
        for (let k = 0; k < SUB; k++) {
            const q = pen ? pen(ph + dph * k / SUB) : null;
            if (q) {
                const p = canvasPoint(q);
                if (!PEN.down) { firePen('pointerdown', p, 1); PEN.down = true; }
                else firePen('pointermove', p, 1);
                PEN.last = p;
            } else if (PEN.down) { firePen('pointerup', PEN.last, 0); PEN.down = false; }
        }
    }
    function penUp() { if (PEN.down) { firePen('pointerup', PEN.last, 0); PEN.down = false; } }

    // ── Who is painting: name tags ────────────────────────────────
    // The app shows a peer as a 12 px dot with a name (06e .remote-cursor,
    // DOM, so not in an export). In a multi-artist scene the recorder draws
    // each peer's dot into the frame at video size, from the same element's
    // position, colour and name, eased between cursor messages (they come
    // every 50 ms). Its own hand gets a tag too.
    const TAGS = new Map();
    function drawTags(ctx, sc) {
        const cr = $('canvas').getBoundingClientRect();
        const seen = new Set();
        const marks = [];
        // Only in a scene with artists: a cursor left from an earlier room
        // scene stays in the DOM until its owner moves again.
        if (sc.artists) document.querySelectorAll('.remote-cursor').forEach((el) => {
            const r = el.getBoundingClientRect();
            const lab = el.querySelector('.remote-cursor-label');
            const name = lab ? lab.textContent.trim() : '';
            const who = (sc.artists || [])[NAMES.indexOf(name)];
            marks.push({ id: el.id, x: (r.left + r.width / 2 - cr.left) / cr.width * W, y: (r.top + r.height / 2 - cr.top) / cr.height * H,
                         color: (who && who.tag) || getComputedStyle(el).backgroundColor, name: name });
        });
        if (sc.selfName && PEN.last) {
            marks.push({ id: 'self', x: (PEN.last.x - cr.left) / cr.width * W, y: (PEN.last.y - cr.top) / cr.height * H,
                         color: sc.selfColor || '#ffffff', name: sc.selfName });
        }
        ctx.save();
        ctx.font = "600 44px Bahnschrift, 'DIN Alternate', sans-serif";                // readable at the 600 px store player
        ctx.textBaseline = 'middle';
        marks.forEach((m) => {
            seen.add(m.id);
            const t = TAGS.get(m.id) || { x: m.x, y: m.y };
            t.x += (m.x - t.x) * 0.35; t.y += (m.y - t.y) * 0.35;
            TAGS.set(m.id, t);
            ctx.lineWidth = 5; ctx.strokeStyle = m.color; ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.arc(t.x, t.y, 22, 0, TAU); ctx.fill(); ctx.stroke();
            if (m.name) {
                const tw = ctx.measureText(m.name).width;
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.beginPath(); ctx.roundRect(t.x + 28, t.y + 18, tw + 34, 60, 12); ctx.fill();
                ctx.fillStyle = m.color; ctx.fillRect(t.x + 28, t.y + 18, 8, 60);
                ctx.fillStyle = '#ffffff'; ctx.fillText(m.name, t.x + 48, t.y + 49);
            }
        });
        // Keycaps: a key pressed for a text hotkey, shown where its word lands.
        (sc.__keycaps || []).forEach((k) => {
            const age = LIVE.i - k.i;
            if (age < 0 || age > 54) return;
            const a = age < 6 ? age / 6 : Math.max(0, 1 - (age - 30) / 24);
            const x = k.u * W - 130, y = k.v * H - 150;
            ctx.globalAlpha = Math.min(1, a);
            ctx.fillStyle = 'rgba(20,22,30,0.85)'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.roundRect(x, y, 84, 84, 14); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.font = "700 52px Bahnschrift, 'DIN Alternate', sans-serif";
            ctx.textAlign = 'center'; ctx.fillText(k.label, x + 42, y + 44); ctx.textAlign = 'left';
            ctx.globalAlpha = 1;
        });
        ctx.restore();
        Array.from(TAGS.keys()).forEach((k) => { if (!seen.has(k)) TAGS.delete(k); });
    }

    const cap = document.createElement('canvas');
    cap.width = W; cap.height = H;
    const capCtx = cap.getContext('2d', { willReadFrequently: true });
    async function grab(key, sc) {
        await window.fluidExport.captureFrame(cap, { opaque: true });
        if (sc && (sc.artists || sc.selfName || sc.__keycaps)) drawTags(capCtx, sc);
        const px = capCtx.getImageData(0, 0, W, H).data;
        const r = await fetch('/__frame/' + key, { method: 'PUT', body: px });
        if (!r.ok) throw new Error('frame rejected: ' + r.status);
    }

    // ── One scene, recorder side ──────────────────────────────────
    // A single-page scene runs record(); a multi-artist scene is driven
    // frame by frame from the driver: recPrep, recBegin, recFrame × N,
    // recEnd here, with artistPrep / artistFrame on each artist page.
    const LIVE = { line: null, N: 0, t0: 0, i: 0 };
    async function recPrep(key) {
        const sc = SCENES[key];
        if (!sc) throw new Error('unknown scene ' + key);
        await lock();
        window.__trailerArmMain = !!sc.artists;
        LIVE.line = await prep(sc);
        await steps(6);                                      // settings, caption walls, colliders land
        if (sc.settle) await steps(Math.round(sc.settle * FPS));
        if (sc.lay) { sc.lay(); await steps(20); }
        if (sc.warm && sc.warmPen) {
            const n = Math.round(sc.warm * FPS);
            for (let i = 0; i < n; i++) { penAt(sc.warmPen, i / n, 1 / n); await steps(1); }
            penUp();
        }
        TAGS.clear();
        return true;
    }
    async function recBegin(key) {
        const sc = SCENES[key];
        LIVE.N = Math.round(sc.secs * FPS);
        LIVE.t0 = realDateNow();
        await fetch('/__clip/' + key + '/begin?w=' + W + '&h=' + H + '&fps=' + FPS, { method: 'POST' });
        return LIVE.N;
    }
    async function recFrame(key, i) {
        const sc = SCENES[key], ph = i / LIVE.N;
        LIVE.i = i;
        if (sc.pen) penAt(sc.pen, ph, 1 / LIVE.N);
        if (sc.frame) sc.frame(ph, LIVE.line);
        await steps(1);
        await grab(key, sc);
        return true;
    }
    async function recEnd(key) {
        penUp();
        const r = await fetch('/__clip/' + key + '/end', { method: 'POST' });
        if (SCENES[key].after) SCENES[key].after();
        return { key: key, frames: LIVE.N, ok: r.ok, wallSecs: +((realDateNow() - LIVE.t0) / 1000).toFixed(1),
                 dye: window.config.DYE_RESOLUTION, sim: window.config.SIM_RESOLUTION };
    }
    async function record(key) {
        await recPrep(key);
        const N = await recBegin(key);
        for (let i = 0; i < N; i++) await recFrame(key, i);
        return recEnd(key);
    }

    // ── Artist side ───────────────────────────────────────────────
    // An artist is another person in the room: their own brush (colour,
    // size, arms, which the room never shares) and their own pen.
    async function artistPrep(key, idx) {
        const a = SCENES[key].artists[idx];
        await lock();
        penUp();
        if (window.BrushType) window.BrushType.set('fluid');
        set.check('stepPalette', false); set.check('randomColor', false);
        set.slider('multiplier', a.arms || 1);
        set.select('symmetryMode', a.symmetry || 'radial');
        setArms(a.armColors || [null]);
        if (a.size) set.slider('brushSize', a.size);
        if (a.pre) await a.pre();
        await steps(2);
        return true;
    }
    async function artistFrame(key, idx, i, N) {
        const a = SCENES[key].artists[idx];
        penAt(a.pen, i / N, 1 / N);
        await steps(1);
        return true;
    }
    async function artistDone() { penUp(); await steps(2); return true; }

    window.__trailer = { setup: setup, probe: probe, record: record, prep: (k) => prep(SCENES[k]), meanLum: meanLum,
                         recPrep: recPrep, recBegin: recBegin, recFrame: recFrame, recEnd: recEnd,
                         artistPrep: artistPrep, artistFrame: artistFrame, artistDone: artistDone, syncClock: syncClock,
                         order: ORDER, splits: SPLITS, cut: CUT, scenes: SCENES, names: NAMES, caption: caption };
    return { installed: true, scenes: ORDER };
})();
