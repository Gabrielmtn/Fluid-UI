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
    // Only a feature's name, as the app labels it (Gabriel 2026-10-18: no
    // copy or art made for the trailer). Set the way the splash sets its
    // title: the theme's label face (css/30 "WC Label"), capitals, tracked
    // out, warm cream (css/44).
    const CAPTION = {
        fontFamily: "'WC Label', 'Plus Jakarta Sans', sans-serif",
        fontWeight: '400', fontSize: 104, color: '#FBECD9',
        shadow: true, align: 'center', textCase: 'upper',
        collider: true, colliderMode: 'deflect'                // every caption: the paint parts around the words
    };
    const TRACK = 0.12;                                      // letter spacing, in ems
    const MARGIN = 80;                                       // px kept clear of the frame's edge
    // A caption too wide for its place breaks at the space nearest its
    // middle, and only if two lines still don't fit does the type shrink.
    // A second line grows away from the frame edge it sits by.
    const measure = (() => {
        const c = document.createElement('canvas').getContext('2d');
        return (o, s) => {
            c.font = o.fontWeight + ' ' + o.fontSize + 'px ' + o.fontFamily;
            c.letterSpacing = o.letterSpacing + 'px';
            return c.measureText(o.textCase === 'upper' ? s.toUpperCase() : s).width;
        };
    })();
    function fit(o) {
        const room = 2 * Math.min(o.x, 1 - o.x) * 1920 - 2 * MARGIN;
        const widest = () => Math.max(...o.content.split('\n').map((l) => measure(o, l)));
        if (widest() <= room) return o;
        const words = o.content.split(' ');
        if (words.length > 1 && o.content.indexOf('\n') < 0) {
            let best = null;
            for (let k = 1; k < words.length; k++) {
                const two = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
                const w = Math.max(measure(o, two[0]), measure(o, two[1]));
                if (!best || w < best.w) best = { w: w, s: two.join('\n') };
            }
            o.content = best.s;
            const half = o.fontSize * 1.2 / 2 / 1080;
            o.y += o.y < 0.5 ? half : -half;
        }
        while (widest() > room && o.fontSize > 56) { o.fontSize -= 4; o.letterSpacing = Math.round(o.fontSize * TRACK); }
        return o;
    }
    // Stills mode (store screenshots, 2026-10-18): the same takes with no
    // caption, no splash and no clip, saving lossless PNGs at chosen phases
    // instead. Steam wants the game in a screenshot, not trailer text.
    // With captions (Gabriel, same day: "the text makes it clear what feature
    // these are showing off") a still keeps its scene's caption.
    const STILL = { on: false, captions: false, at: [0.45, 0.6, 0.75, 0.9, 0.99] };
    function stillMode(on, at, captions) { STILL.on = !!on; STILL.captions = !!captions; if (at) STILL.at = at; return STILL; }
    function caption(opts) {
        if (STILL.on && !STILL.captions) return null;
        const o = Object.assign({}, CAPTION, opts);
        if (o.letterSpacing === undefined) o.letterSpacing = Math.round(o.fontSize * TRACK);
        if (o.x !== undefined) fit(o);
        return window.textOverlays.add(o);
    }

    // ── The splash, as the app draws it ───────────────────────────
    // The boot screen is gone by the time a scene runs (00a drops it), so
    // putting it back means the same markup index.html ships, styled by the
    // same stylesheets, every word at its resting opacity. The driver
    // screenshots it (`splash` mode) to notes/trailer-draft/splash.png; the
    // title and end scenes dissolve through that picture.
    function showSplash() {
        hideSplash();
        const s = document.createElement('div');
        s.id = 'splash-screen';
        s.className = 'ready';
        s.innerHTML = '<div class="splash-title">Swirl Together</div>' +
            '<div class="splash-subtitle">A fluid sim sandbox for one to eight</div>' +
            '<div class="splash-progress"><div class="splash-progress-bar" style="width:100%"></div></div>';
        s.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;opacity:1';
        document.body.appendChild(s);
        s.querySelectorAll('.splash-title,.splash-subtitle').forEach((el) => { el.style.opacity = '1'; });
        return true;
    }
    function hideSplash() { const s = $('splash-screen'); if (s) s.remove(); return true; }
    // Where the splash puts its title, so the canvas title can sit exactly
    // under it and stay when the picture dissolves.
    function splashTitle() {
        const el = document.querySelector('#splash-screen .splash-title');
        if (!el) return null;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight,
                 fontSize: parseFloat(cs.fontSize), letterSpacing: parseFloat(cs.letterSpacing) || 0,
                 fontWeight: cs.fontWeight, color: cs.color };
    }
    let SPLASH = null;                                       // { img, title }
    async function loadSplash() {
        if (SPLASH) return SPLASH;
        const img = new Image();
        img.src = '/notes/trailer-draft/splash.png?' + Date.now();
        await img.decode();
        const meta = await (await fetch('/notes/trailer-draft/splash.json?' + Date.now())).json();
        SPLASH = { img: img, title: meta.title };
        return SPLASH;
    }
    // A smooth 0 → 1 between two phases.
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
        // The caption face has to be in before any line is laid out: the Text
        // tool rasterises its collider wall from the same canvas text.
        await document.fonts.load("400 104px 'WC Label'");
        await document.fonts.load("800 104px 'WC Label'");
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
    // Where piece s puts the pen at t in [0, 1]. Pure: no colour change.
    function posOf(s, t) {
        if (s.fn) return s.fn(t);
        if (s.pts) { const q = bez(s.pts, ease(t)); return { u: q[0], v: q[1] }; }
        const a = s.a0 + (s.a1 - s.a0) * t;
        return { u: s.c[0] + s.r * Math.cos(a), v: s.c[1] + s.r * ASPECT * Math.sin(a) };
    }
    function path(list) {
        let current = null;
        const pen = (ph) => {
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
                    return posOf(s, (ph - s.at) / s.len);
                }
            }
            current = null;
            return null;
        };
        pen.pieces = list.slice().sort((a, b) => a.at - b.at);   // for human(): the hand between strokes
        return pen;
    }
    // Kaleidoscope wedge (scripts/bake-kaleido-shot.js): with Wedge mode and
    // kAngle = 180/N the display shows texture angles [0, π/N] mirrored N
    // ways, in place. Texture y is flipped and radius is per axis, so
    // texture (θ, r) lands at screen u = .5 + r cos θ, v = .5 − r sin θ.
    const wedge = (th, r) => ({ u: 0.5 + r * Math.cos(th), v: 0.5 - r * Math.sin(th) });
    const radial = (th, r0, r1) => (t) => wedge(th, r0 + (r1 - r0) * ease(t));
    const ring = (r, th0, th1) => (t) => wedge(th0 + (th1 - th0) * t, r);
    const hold = (u, v) => () => ({ u: u, v: v });
    // Round the splash title (its centre is at v .466): radius r in canvas
    // widths, starting angle a0, turns. Eased, so a hand settles in and out.
    const orbit = (r, a0, turns) => (t) => { const a = a0 + ease(t) * turns * TAU; return { u: 0.5 + r * Math.cos(a), v: 0.466 + r * ASPECT * Math.sin(a) }; };

    // ── A painter's hand ──────────────────────────────────────────
    // Gabriel 2026-10-18: the room's strokes read robotic, every pen at
    // one even speed on a perfect curve. Each painter now has a hand:
    //   tempo   how far their speed swells and sags along a stroke (a
    //           time warp, so the pen still visits every point, in order)
    //   pace    how often it swells, per second
    //   drift   the slow wander of the arm off the drawn line (canvas units)
    // Seeded by name and scene, so a re-bake paints the same hand.
    // Gabriel 2026-10-18, second pass: the first hands (8 Hz tremor, drift
    // and tempo swings up to ~2.5 Hz) read wiggly and jittery. A hand is
    // now only slow: no tremor, the arm sways under 0.25 Hz, and speed
    // swells under 0.4 Hz. Personality is pace and stroke shape, not shake.
    const PERSONA = {
        Gabe:  { tempo: 0.20, pace: 0.22, drift: 0.004, driftHz: 0.12 },   // steady, sure
        Vivi:  { tempo: 0.30, pace: 0.30, drift: 0.006, driftHz: 0.16 },   // quick, loopy, playful
        Sarah: { tempo: 0.12, pace: 0.15, drift: 0.003, driftHz: 0.10 },   // smooth, flowing
        Gary:  { tempo: 0.32, pace: 0.18, drift: 0.003, driftHz: 0.09 },   // slow, stops to think
        Hex:   { tempo: 0.28, pace: 0.35, drift: 0.005, driftHz: 0.20 }    // restless
    };
    function seeded(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
        return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    }
    function human(pen, name, key, secs) {
        const P = PERSONA[name];
        if (!pen || !P) return pen;
        const r = seeded(name + ':' + key);
        // Three sines each for the time warp and the two drift axes, at
        // incommensurate rates so no pattern repeats inside a take.
        const waves = (hz) => [1, 1.618].map((m) => ({ f: hz * m * (0.85 + 0.3 * r()), p: r() * TAU, a: 0.5 + 0.5 * r() }));
        const W = waves(P.pace), DU = waves(P.driftHz), DV = waves(P.driftHz);
        const norm = W.reduce((s, w) => s + w.a, 0) || 1;
        const g = (t) => W.reduce((s, w) => s + w.a * Math.sin(TAU * w.f * t + w.p) / (TAU * w.f), 0) / norm;
        const g0 = g(0), g1 = g(secs);
        // Speed = 1 + tempo·(Σ cos) ≥ 1 − tempo > 0, so time never runs back.
        const warp = (t) => t + P.tempo * (g(t) - g0 - (t / secs) * (g1 - g0));
        const wave = (ws, t) => ws.reduce((s, w) => s + w.a * Math.sin(TAU * w.f * t + w.p), 0) / ws.length;
        // The hand never jumps (Gabriel 2026-10-18: the cursors snapped back
        // to a spot between strokes). Between two strokes it lifts and
        // glides, a cubic Hermite from the last stroke's exit velocity to the
        // next one's entry velocity; before the first it drifts in to the
        // start, after the last it coasts to a stop.
        const ps = pen.pieces;
        const vel = (s, t) => {                              // d(pos)/d(phase) at t of piece s
            const d = 0.01, a = posOf(s, Math.max(0, t - d)), b = posOf(s, Math.min(1, t + d));
            const k = 1 / ((Math.min(1, t + d) - Math.max(0, t - d)) * s.len);
            return { u: (b.u - a.u) * k, v: (b.v - a.v) * k };
        };
        const into = { u: (r() - 0.5) * 0.10, v: (r() - 0.5) * 0.10 };
        const clampLen = (m, cap) => { const l = Math.hypot(m.u, m.v); return l > cap && l > 0 ? { u: m.u * cap / l, v: m.v * cap / l } : m; };
        function plan(w) {
            for (const s of ps) if (w >= s.at && w < s.at + s.len) return posOf(s, (w - s.at) / s.len);
            const prev = ps.filter((s) => s.at + s.len <= w).pop();
            const next = ps.find((s) => s.at > w);
            if (!prev) {                                     // before the first stroke
                const S = posOf(next, 0), x = next.at > 0 ? smooth(0, next.at, w) : 1;
                return { u: S.u + into.u * (1 - x), v: S.v + into.v * (1 - x) };
            }
            const A = posOf(prev, 1), vA = vel(prev, 1);
            const wA = prev.at + prev.len;
            if (!next) {                                     // after the last: coast, slowing
                const tau = 0.05, k = tau * (1 - Math.exp(-(w - wA) / tau));
                const v = clampLen(vA, 1.2);
                return { u: A.u + v.u * k, v: A.v + v.v * k };   // no clamp: a stroke that ends on the edge would jump back in
            }
            const B = posOf(next, 0), vB = vel(next, 0);
            const g = next.at - wA, x = (w - wA) / g;
            const cap = Math.hypot(B.u - A.u, B.v - A.v) * 1.2 + 0.02;
            const mA = clampLen({ u: vA.u * g, v: vA.v * g }, cap), mB = clampLen({ u: vB.u * g, v: vB.v * g }, cap);
            const h00 = 2 * x * x * x - 3 * x * x + 1, h10 = x * x * x - 2 * x * x + x, h01 = -2 * x * x * x + 3 * x * x, h11 = x * x * x - x * x;
            return { u: h00 * A.u + h10 * mA.u + h01 * B.u + h11 * mB.u, v: h00 * A.v + h10 * mA.v + h01 * B.v + h11 * mB.v };
        }
        const handAt = (ph) => {
            const t = ph * secs;
            const w = Math.min(1, Math.max(0, warp(t) / secs));
            const q = plan(w);
            return {
                w: w,
                u: q.u + P.drift * wave(DU, t),
                v: q.v + P.drift * ASPECT * wave(DV, t)
            };
        };
        return {
            // Where the hand is (pen up or down). Pure: the recorder draws tags from it.
            at: handAt,
            // The painting page's call: the pen state (which also sets the stroke's colour) and the hand.
            step(ph) { const h = handAt(ph); return { down: !!pen(h.w), u: h.u, v: h.v }; }
        };
    }

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
    // A picture as a layer, the way a paste lands (createLayerFromDataUrl).
    // cover: crop to the canvas's 16:9 first (anchor 0-1 picks the band:
    // 1 keeps the bottom), the way a user would crop before pasting, so a
    // 4:3 photo fills the frame instead of landing between bars.
    async function imageLayer(url, title, cover) {
        const blob = await (await fetch(url)).blob();
        let data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        if (cover !== undefined) {
            const img = new Image();
            img.src = data;
            await img.decode();
            const w = img.naturalWidth, h = Math.round(w * 9 / 16);
            const c = document.createElement('canvas');
            c.width = w; c.height = Math.min(h, img.naturalHeight);
            c.getContext('2d').drawImage(img, 0, Math.round((img.naturalHeight - c.height) * cover), w, c.height, 0, 0, w, c.height);
            data = c.toDataURL('image/jpeg', 0.95);
        }
        return new Promise((r) => window.createLayerFromDataUrl(data, title, r));
    }
    // A picture as a brush tip, the way an upload ends up: the mask editor
    // hands BrushShapes.add a canvas whose alpha is the shape. For black
    // line art on white, the ink is the shape: alpha = darkness, colour
    // white (the stamp takes the brush colour, as a Text brush does).
    async function imageBrush(url, name) {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d');
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
            const lum = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
            d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
            d.data[i + 3] = Math.max(0, Math.min(255, Math.round((255 - lum) * 1.4)));
        }
        x.putImageData(d, 0, 0);
        return window.BrushShapes.add(name, c);
    }
    // The stamp texture uploads on Image.onload (a real task); until then
    // multiSplat drops the dabs.
    async function stampReady() {
        for (let i = 0; i < 200 && window.BrushShapes.stampPending(); i++) await sleep(25);
    }
    // The artists' names, in order (Sarah, Gary, Hex: the driver sets them
    // and reads each back through the app's shortName after it joins).
    const NAMES = [];

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
        set.slider('timeScale', 1);
        set.slider('brushSteady', 0);
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
    // Captions sit top-centre, scene after scene, so the eye isn't sent up
    // and down (Gabriel 2026-10-19). Was BR, Krita's bottom-right corner.
    const TOP = { x: 0.5, y: 0.12 };
    const C = { coral: '#F18473', teal: '#35C4B5', cream: '#F2DBB4', opal: '#2AC9B7', lilac: '#E9E3F1',
                violet: '#8B72D9', gold: '#FFC857', rose: '#FF5E86', sky: '#7FC4FF' };
    const N = 24, HALF = Math.PI / N;                        // kaleidoscope wedges: the slider's maximum (Gabriel 2026-10-18: prettier)
    const SCENES = {
        // ── Opening and closing: four painters round the title ────────
        // The splash holds 1.5 s, then dissolves onto the room already
        // painting; the canvas title sits exactly under the splash's, so the
        // name stays put and the paint parts round it.
        title: {
            secs: 8, preset: 'currents', size: 3, selfName: true, selfColor: C.coral,
            splash: (ph, s) => 1 - smooth(1.5, 2.8, ph * s),
            text: 'splashTitle',
            pen: path([
                { pts: [[0.00, 0.30], [0.22, 0.62], [0.42, 0.66]], at: 0.02, len: 0.30, color: C.coral },
                { pts: [[0.30, 0.80], [0.50, 0.70], [0.70, 0.82]], at: 0.56, len: 0.30, color: C.coral }
            ]),
            artists: [
                // Vivi (Gabriel 2026-10-18): in from the bottom right in loops.
                { name: 'Vivi', size: 3, tag: C.rose, pen: path([
                    { fn: (t) => { const e = ease(t); return { u: 0.99 - 0.30 * e + 0.06 * Math.sin(e * TAU), v: 0.90 - 0.24 * e + 0.08 * (Math.cos(e * TAU) - 1) }; }, at: 0.14, len: 0.40, color: C.rose }   // one wide loop
                ]) },
                { name: 'Sarah', size: 3, tag: C.teal, pen: path([
                    { pts: [[1.00, 0.70], [0.78, 0.36], [0.58, 0.30]], at: 0.08, len: 0.30, color: C.teal },
                    { pts: [[0.70, 0.18], [0.50, 0.28], [0.30, 0.16]], at: 0.60, len: 0.30, color: C.teal }
                ]) },
                { name: 'Gary', size: 3, tag: C.gold, pen: path([
                    { pts: [[0.00, 0.86], [0.20, 0.70], [0.34, 0.72]], at: 0.18, len: 0.28, color: C.gold }
                ]) },
                { name: 'Hex', size: 3, tag: C.violet, pen: path([
                    { pts: [[1.00, 0.12], [0.80, 0.26], [0.66, 0.24]], at: 0.26, len: 0.28, color: C.violet }
                ]) }
            ]
        },
        // The room paints round the name, then the splash comes back over it:
        // the cut ends where it began.
        end: {
            secs: 8, preset: 'currents', size: 3, selfName: true, selfColor: C.coral,
            splash: (ph, s) => smooth(4.6, 6.2, ph * s),
            text: 'splashTitle',
            // All four stay in frame, swirling round the name together the
            // whole way, under the splash as it returns (Gabriel 2026-10-19:
            // they used to sweep off the edges). One centre, one direction,
            // four radii and starting angles: they chase each other round.
            pen: path([{ fn: orbit(0.21, 0.6, 0.75), at: 0.03, len: 0.92, color: C.coral }]),
            artists: [
                { name: 'Sarah', size: 3, tag: C.teal, pen: path([{ fn: orbit(0.17, 2.2, 0.8), at: 0.05, len: 0.90, color: C.teal }]) },
                { name: 'Gary', size: 3, tag: C.gold, pen: path([{ fn: orbit(0.235, 3.6, 0.6), at: 0.08, len: 0.86, color: C.gold }]) },
                { name: 'Hex', size: 3, tag: C.violet, pen: path([{ fn: orbit(0.19, 5.0, 0.85), at: 0.06, len: 0.88, color: C.violet }]) }
            ]
        },

        // ── Replay: draw a gesture, then hold right-click and it repeats ──
        // The real right-click replay (05d): isRightMouseDown + replayStroke,
        // looping while held. Its playhead runs on Date.now, which rides
        // the virtual clock here.
        replay: {
            secs: 8, preset: 'currents', size: 2.5,
            text: { content: 'Replay', x: 0.5, y: 0.12 },
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

        // ── Shared Settings: two painters in one room, one Blend ───────
        // The recorder hosts, so its Blend 1.0 is the room's. Gabe comes in
        // from the left and Vivi from the right; they meet in the middle,
        // then chase each other round one circle so the two colours wind
        // together and mix.
        shared: {
            secs: 8, preset: 'currents', settle: 3.5, size: 3.5, selfName: true, selfColor: '#2F6BFF',
            text: { content: 'Shared Settings', x: 0.5, y: 0.12 },
            pre() { set.slider('colorBlend', 1); set.slider('shadeGloss', 0); },   // gloss off on a few scenes, for variety (Gabriel 2026-10-19)
            pen: path([
                { pts: [[0.00, 0.60], [0.22, 0.50], [0.44, 0.54]], at: 0.03, len: 0.28, color: '#2F6BFF' },
                { fn: (t) => { const a = Math.PI + ease(t) * TAU * 1.25; return { u: 0.5 + 0.13 * Math.cos(a), v: 0.55 + 0.13 * ASPECT * Math.sin(a) }; }, at: 0.38, len: 0.56, color: '#2F6BFF' }
            ]),
            artists: [
                { name: 'Vivi', size: 3.5, tag: '#FF3D8B', pen: path([
                    { pts: [[1.00, 0.48], [0.78, 0.58], [0.56, 0.54]], at: 0.05, len: 0.28, color: '#FF3D8B' },
                    { fn: (t) => { const a = ease(t) * TAU * 1.25; return { u: 0.5 + 0.13 * Math.cos(a), v: 0.55 + 0.13 * ASPECT * Math.sin(a) }; }, at: 0.38, len: 0.56, color: '#FF3D8B' }
                ]) }
            ]
        },

        // ── Custom brush shapes: a glyph becomes the brush tip ─────────
        shapes: {
            secs: 8, preset: 'opal', size: 3,
            text: { content: 'Upload Brush Tips', x: 0.5, y: 0.12 },
            async pre() {
                // Gabriel's two line-art faces (notes/trailer-draft/assets), uploaded as brush tips.
                this.__shapes = [await imageBrush('/notes/trailer-draft/assets/face-satisfied.png', 'Satisfied'),
                                 await imageBrush('/notes/trailer-draft/assets/face-wince.webp', 'Wince')];
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
                    if (ph < r.from || ph > r.to || LIVE.i % 16) return;
                    // The stamp takes the brush colour, so the picker is set per run.
                    if (this.__on !== r.shape) { this.__on = r.shape; window.BrushShapes.setActive(this.__shapes[r.shape]); set.color(r.color); setArms([null]); }
                    const t = (ph - r.from) / (r.to - r.from), a = bez(r.pts, t), b = bez(r.pts, Math.min(1, t + 0.02));
                    window.applyMultiSplatWith(a[0] * c.width, a[1] * c.height, (b[0] - a[0]) * 120, (b[1] - a[1]) * 120, rgb01(r.color), 1, 0.012, false);   // faces: bigger and sparser than the old star/heart, so the line art reads
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
            text: { content: 'Bind Text to Hotkeys', x: 0.5, y: 0.12 },
            pre() {
                this.__words = [['swirl', C.teal, 'KeyQ'], ['together', C.gold, 'KeyW']]
                    .map(([w, col, key]) => window.textOverlays.add(Object.assign({}, CAPTION, {
                        content: w, color: col, fontSize: 180, collider: false, visible: false,
                        hotkey: key, hotkeyAction: 'pour', hotkeyAt: 'brush' })).id);
                this.__fired = 0;
            },
            // A word at each beat, poured where the brush is; a stroke runs
            // through between them so the words swirl.
            frame(ph) {
                // A clean canvas before the first word (Gabriel 2026-10-19).
                if (!this.__cleared) { this.__cleared = true; window.clearCanvas(); }
                const beats = [[0.06, 0.30, 0.40], [0.36, 0.55, 0.64]];
                const b = beats[this.__fired];
                if (b && ph >= b[0]) {
                    const c = $('canvas');
                    window.__cursorPos = { x: c.width * b[1], y: c.height * b[2], at: Date.now() };
                    window.textOverlays.triggerHotkey(this.__words[this.__fired]);
                    // No keycap drawn (Gabriel 2026-10-18): the word arriving is enough.
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
            text: { content: 'Collider', x: 0.5, y: 0.10 },
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

        // ── Draw Colliders: Gabriel's maze, and a small brush ─────────
        // The maze is his (notes/trailer-draft/assets/maze.svg, from his own
        // maze maker, 2026-10-19). It goes in the way a user's picture does:
        // pasted as a collider (32-file-drop's Ctrl+Shift+V path:
        // createLayerFromDataUrl, then collisionLayers.createFromLayerMask).
        // That path walls the LIGHT pixels, so the page swaps his dark-on-
        // white to light-on-dark first; the drawing is untouched. The wall
        // shows in the cream the other colliders use. A thin brush then
        // walks the way through, from his entrance, corners rounded.
        maze: {
            secs: 12, preset: 'currents', size: 0.4,           // thin, so the paint keeps to its lane
            // The one caption that is NOT a wall (Gabriel 2026-10-19): over the
            // top rows it would close the corridors. An overlay, no box, top.
            text: { content: 'Draw Colliders', x: 0.5, y: 0.09, collider: false },
            async pre() { await loadMaze(); },
            pen: path([{ fn: (t) => MAZE.walk(t), at: 0.02, len: 0.96, color: C.teal }]),
            // The second colour is a second painter in the room (a real
            // pointer: the app's own splats don't land while the harness
            // holds the clock). It leaves from the same entrance, a little
            // quicker than the brush, so it is ahead when it takes its wrong
            // turn, and it is still searching when the take ends. A solo
            // scene, so no name tag.
            tags: false,
            artists: [
                { name: 'Vivi', size: 0.4, tag: C.coral, pre: () => loadMaze(true),
                  pen: path([{ fn: (t) => MAZE.lost(t), at: 0.02, len: 0.97, color: C.coral }]) }
            ]
        },

        // ── Pressure iterations: one gesture, three feels ─────────────
        // Under 12 the solver is plain Jacobi and the paint is compressible
        // (soft, bulging); 24 and up is the full multigrid solve (crisp).
        // Gabriel 2026-10-19: 2 s longer, with Dither on for those last 2 s.
        // The 5-then-45 demo keeps its first 9 s exactly (K rescales it).
        pressure: {
            secs: 11, preset: 'currents', size: 3,
            text: { content: 'Control the Simulation', x: 0.5, y: 0.12 },
            frame(ph, line) {
                const K = 9 / 11;
                const k = ph < 0.5 * K ? 0 : 1;
                if (this.__k !== k) {
                    this.__k = k;
                    if (k > 0 && window.clearCanvas) window.clearCanvas();
                    set.slider('pressureIteration', [5, 45][k]);
                }
                // 2 s before Dither the caption pours into the paint (Gabriel
                // 2026-10-19). fluidize hides the line a beat before the pour
                // lands, so a non-wall twin covers that gap and leaves with it.
                if (ph >= 7 / 11 && line && !this.__poured) {
                    this.__poured = true;
                    const twin = window.__trailer.caption(Object.assign({}, this.text, { collider: false }));
                    window.textOverlays.fluidize(line.id, () => { if (twin) window.textOverlays.remove(twin.id); });
                }
                if (ph >= K && !this.__dither) { this.__dither = true; set.check('ditherToggle', true); }
            },
            pen: path([0, 1].flatMap((q) => [
                { pts: [[0.02, 0.58], [0.30, 0.52], [0.48, 0.56]], at: (q / 2 + 0.02) * 9 / 11, len: 0.09 * 9 / 11, color: C.coral },
                { pts: [[0.98, 0.52], [0.70, 0.60], [0.52, 0.56]], at: (q / 2 + 0.13) * 9 / 11, len: 0.09 * 9 / 11, color: C.teal },
                { pts: [[0.50, 0.98], [0.46, 0.78], [0.50, 0.62]], at: (q / 2 + 0.26) * 9 / 11, len: 0.08 * 9 / 11, color: C.gold }
            ])),
            after() { set.slider('pressureIteration', 25); set.check('ditherToggle', false); delete this.__dither; delete this.__k; }
        },

        // ── Together: real people in one room (scripts/bake-trailer.js
        // starts a local relay and an artist Chrome per entry in artists[];
        // their strokes reach the recorder as remote dabs, tagged with
        // their names). selfName tags the recorder's own hand.
        together: {
            // Gabriel 2026-10-18: the first take zipped about. Now each
            // painter keeps to their own patch, with short gestures at a
            // walking pace (~150 px/s), and their strokes only meet late.
            secs: 8, preset: 'currents', size: 3, selfName: true, selfColor: C.coral,
            text: { content: 'For one to eight', x: 0.5, y: 0.12 },
            pen: path([                                      // Gabe: one sure S, then a short answer
                { pts: [[0.10, 0.80], [0.20, 0.62], [0.30, 0.78], [0.40, 0.62]], at: 0.04, len: 0.40, color: C.coral },
                { pts: [[0.32, 0.72], [0.38, 0.62], [0.46, 0.58]], at: 0.60, len: 0.30, color: C.coral }
            ]),
            artists: [
                { name: 'Sarah', size: 3, tag: C.teal, pen: path([   // one long, gentle arc
                    { pts: [[0.88, 0.34], [0.78, 0.22], [0.66, 0.30], [0.58, 0.44]], at: 0.08, len: 0.62, color: C.teal }
                ]) },
                { name: 'Gary', size: 3, tag: C.gold, pen: path([     // two short, considered strokes
                    { pts: [[0.16, 0.32], [0.24, 0.28], [0.32, 0.36]], at: 0.12, len: 0.26, color: C.gold },
                    { pts: [[0.30, 0.44], [0.38, 0.38], [0.46, 0.42]], at: 0.58, len: 0.26, color: C.gold }
                ]) },
                { name: 'Hex', size: 3, tag: C.violet, pen: path([    // a loop and a bit, drifting left
                    { fn: (t) => { const e = ease(t); return { u: 0.80 - 0.14 * e + 0.05 * (Math.cos(e * TAU * 1.25) - 1), v: 0.72 - 0.05 * e + 0.08 * Math.sin(e * TAU * 1.25) }; }, at: 0.10, len: 0.66, color: C.violet }
                ]) }
            ]
        },
        fluid: {
            secs: 7, preset: 'opal', size: 1.8,
            // Gabriel's field photo behind the paint (a pasted layer lands
            // below the sim), so the low caption reads against the grass.
            // Captions are always colliders and never get a box (Gabriel
            // 2026-10-19: a box walled the paint into a broken border).
            text: { content: "Lovingly crafted upon Pavel Dobryakov's Fluid Sim", x: 0.5, y: 0.86 },
            async pre() {
                set.slider('shadeGloss', 0);   // gloss off on a few scenes, for variety (Gabriel 2026-10-19)
                await imageLayer('/notes/trailer-draft/assets/field.jpg', 'Field', 0.85);
            },
            // Two strokes, then hands off: it keeps moving after you let go.
            pen: path([
                { pts: [[0.06, 0.30], [0.30, 0.06], [0.50, 0.52], [0.72, 0.18]], at: 0.02, len: 0.24, color: C.opal },
                { pts: [[0.84, 0.44], [0.58, 0.72], [0.32, 0.40], [0.12, 0.62]], at: 0.29, len: 0.22, color: C.violet }
            ])
        },
        // Four arms, not eight, at Blend 1.0 (Gabriel 2026-10-18): the arms'
        // colours run into each other where the petals meet. Blend eases in
        // over ~3 s of sim time, hence settle.
        multibrush: {
            secs: 7, preset: 'bloom', settle: 3.5,
            text: Object.assign({}, TOP, { content: 'Trillions of brush possibilities' }),
            pre() {
                set.slider('shadeGloss', 0);   // gloss off on a few scenes, for variety (Gabriel 2026-10-19)
                set.slider('colorBlend', 1);
                set.select('symmetryMode', 'radial');
                set.slider('multiplier', 4);
                setArms([C.teal, C.gold, C.coral, C.violet]);
            },
            // Short petals off the pivot: eight copies make a flower, not a flood.
            pen: path([
                { pts: [[0.56, 0.50], [0.61, 0.34], [0.69, 0.40]], at: 0.04, len: 0.13, color: C.opal },
                { pts: [[0.60, 0.60], [0.66, 0.72], [0.74, 0.62]], at: 0.30, len: 0.12, color: C.opal },
                { pts: [[0.53, 0.47], [0.57, 0.42], [0.60, 0.46]], at: 0.56, len: 0.08, color: C.opal }
            ])
        },
        kaleidoscope: {
            secs: 7, preset: 'currents', size: 1.2,             // a thin brush, so each of 24 wedges reads
            text: Object.assign({ content: 'Create a Kaleidoscope' }, TOP),
            // Calmer than the first take (Gabriel 2026-10-18): Time down so
            // the wedges drift instead of churning, Stabilization up so the
            // pen's lines come out smooth.
            pre() {
                set.slider('timeScale', 0.45);
                set.slider('brushSteady', 0.6);
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
            text: { content: 'Fluidize', x: 0.5, y: 0.48, fontSize: 190, fontWeight: '800', color: C.gold },
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
        // ── Paste Layers: a picture becomes paint ─────────────────────
        // Starry Night (Gabriel's file, notes/trailer-draft/assets) goes in
        // through the app's own paste path, sits as a layer a beat, is
        // Fluidized (the layer row's button: splatLayerToSim), and then the
        // Pressure brush pushes through it at Laminar 1.0 (Laminar / Blend at
        // -1), so the strokes fold the picture instead of muddying it.
        paste: {
            // Gabriel 2026-10-19: clear first so no pressure is left over,
            // Density 1.0 so the picture doesn't fade, Fluidize, then let it
            // be seen as a painting for ~3 s before the Pressure brush pushes
            // through it at Laminar 1.0. Poured before the take, so the clip
            // opens on it (no picture-to-paint flicker).
            secs: 10, preset: 'marble', size: 3,
            text: { content: 'Paste Layers', x: 0.5, y: 0.09 },
            async pre() {
                set.slider('colorBlend', -1);
                set.slider('densityDissipation', 1);
                const layer = await imageLayer('/notes/trailer-draft/assets/starry-night.jpg', 'Starry Night');
                window.clearCanvas();                        // velocity and pressure too: nothing latent
                window.splatLayerToSim(layer.index);         // the layer row's Fluidize
            },
            frame(ph) {
                if (window.BrushType.get() !== 'pressure') {
                    set.slider('colorBlend', -1);            // Laminar on full while smudging
                    window.config.BRUSH_VEL_MODE = 'smudge';
                    window.BrushType.set('pressure');
                }
            },
            pen: path([
                { pts: [[0.00, 0.42], [0.30, 0.30], [0.60, 0.56], [1.00, 0.40]], at: 0.31, len: 0.21 },
                { pts: [[1.00, 0.70], [0.66, 0.82], [0.36, 0.60], [0.00, 0.76]], at: 0.55, len: 0.21 },
                { pts: [[0.20, 1.00], [0.34, 0.60], [0.56, 0.36], [0.62, 0.10]], at: 0.79, len: 0.18 }
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
            text: { content: 'Blend Colors', x: 0.5, y: 0.12 },
            pre() {
                set.slider('shadeGloss', 0);   // gloss off on a few scenes, for variety (Gabriel 2026-10-19)
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
            text: { content: 'Laminar Flow', x: 0.5, y: 0.12 },
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
            text: Object.assign({ content: 'Thick paint' }, TOP),
            pre() { set.select('materialMode', 'clay'); },
            pen: path([
                { pts: [[0.06, 0.40], [0.28, 0.20], [0.50, 0.42], [0.66, 0.26]], at: 0.03, len: 0.24, color: C.coral },
                { pts: [[0.10, 0.62], [0.34, 0.52], [0.56, 0.66]], at: 0.32, len: 0.20, color: C.cream },
                { pts: [[0.70, 0.12], [0.58, 0.40], [0.80, 0.56]], at: 0.58, len: 0.20, color: C.teal }
            ])
        },
        swirl: {
            secs: 7, preset: 'opal',
            text: Object.assign({ content: 'Pressure: Swirl' }, TOP),
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
        // ── Add Lighting: one blue brush under Glow + Scatter ──────────
        // Gabriel's numbers (2026-10-18): Glow Intensity 1.060, Threshold
        // 0.6; Scatter Amount 0.6, Reach 0.95. Scatter follows the brush.
        lighting: {
            secs: 8, preset: 'currents', size: 3,
            text: Object.assign({ content: 'Add Lighting' }, TOP),
            pre() {
                // A single brush, whatever ran before (a Kaleidoscope take
                // left a second arm painting coral opposite the blue).
                set.slider('multiplier', 1); setArms([null]);
                set.check('glowToggle', true);
                set.slider('glowIntensity', 1.06); set.slider('glowThreshold', 0.6);
                set.check('scatterToggle', true);
                set.slider('scatterAmount', 0.6); set.slider('scatterReach', 0.95);
                set.select('scatterSource', 'brush');
            },
            pen: path([
                { pts: [[0.04, 0.70], [0.24, 0.30], [0.48, 0.66], [0.70, 0.28]], at: 0.03, len: 0.40, color: '#2F6BFF' },
                { pts: [[0.70, 0.28], [0.88, 0.50], [0.66, 0.74], [0.40, 0.52]], at: 0.46, len: 0.44, color: '#2F6BFF' }
            ])
        },
        light: {
            secs: 7, preset: 'currents',
            text: Object.assign({ content: 'Light Source', collider: true, colliderMode: 'deflect' }, TOP),
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
            text: Object.assign({ content: 'Liquid opal' }, TOP),
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
    // Gabriel's maze. Its walls are read back out of the SVG (M/H/V runs on
    // a 32 × 18 grid) to find the way from his entrance to his exit by
    // breadth-first search: that route is the brush's path, so it never
    // touches a wall. Corners are rounded (Chaikin, twice) so the hand
    // glides, and the brush covers WALK_PX of it at a watchable pace (the
    // whole way is ~8,900 px, too long for one scene).
    // Gabriel 2026-10-19: slower, and a second colour that sets off from
    // the same entrance, dashes down a wrong turn and dies in a dead end.
    const WALK_PX = 2400;                                     // the brush, ~210 px/s (3800 was still too fast)
    const LOST_PX = 3000;                                     // the coral: ~260 px/s, cut off still moving
    const MAZE = { walk: () => ({ u: -0.1, v: 0.03 }), lost: () => ({ u: -0.1, v: 0.03 }), ready: false };
    // routesOnly: a painter in the room needs the routes, not the walls (the
    // room shares colliders, so a second copy landed in her colour).
    async function loadMaze(routesOnly) {
        if (MAZE.ready) return MAZE;
        const svg = await (await fetch('/notes/trailer-draft/assets/maze.svg')).text();
        const d = / d="([^"]+)"/.exec(svg)[1];
        const segs = [];
        let cx = 0, cy = 0;
        const tok = d.match(/[MHV]|[\d.]+/g);
        for (let k = 0; k < tok.length;) {
            const op = tok[k++];
            if (op === 'M') { cx = +tok[k++]; cy = +tok[k++]; }
            else if (op === 'H') { const x = +tok[k++]; segs.push([cx, cy, x, cy]); cx = x; }
            else { const y = +tok[k++]; segs.push([cx, cy, cx, y]); cy = y; }
        }
        const COLS = 32, ROWS = 18, X0 = 3, Y0 = 3, cw = (1917 - 3) / COLS, ch = (1077 - 3) / ROWS;
        const X = (c) => X0 + c * cw, Y = (r) => Y0 + r * ch, near = (a, b) => Math.abs(a - b) < 1;
        const wallH = (r, c) => segs.some((q) => q[1] === q[3] && near(q[1], Y(r)) && Math.min(q[0], q[2]) <= X(c) + 1 && Math.max(q[0], q[2]) >= X(c + 1) - 1);
        const wallV = (r, c) => segs.some((q) => q[0] === q[2] && near(q[0], X(c)) && Math.min(q[1], q[3]) <= Y(r) + 1 && Math.max(q[1], q[3]) >= Y(r + 1) - 1);
        let start = null, end = null;
        for (let r = 0; r < ROWS; r++) { if (!wallV(r, 0) && !start) start = [0, r]; if (!wallV(r, COLS)) end = [COLS - 1, r]; }
        const prev = { [start.join(',')]: null }, queue = [start];
        const nbrs = (c, r) => [[1, 0, !wallV(r, c + 1)], [-1, 0, !wallV(r, c)], [0, 1, !wallH(r + 1, c)], [0, -1, !wallH(r, c)]]
            .filter(([dc, dr, open]) => open && c + dc >= 0 && r + dr >= 0 && c + dc < COLS && r + dr < ROWS).map(([dc, dr]) => [c + dc, r + dr]);
        while (queue.length) {                               // the whole tree: the wrong turns are in it too
            const [c, r] = queue.shift();
            [[1, 0, !wallV(r, c + 1)], [-1, 0, !wallV(r, c)], [0, 1, !wallH(r + 1, c)], [0, -1, !wallH(r, c)]].forEach(([dc, dr, open]) => {
                const n = [c + dc, r + dr], k = n.join(',');
                if (!open || n[0] < 0 || n[1] < 0 || n[0] >= COLS || n[1] >= ROWS || k in prev) return;
                prev[k] = c + ',' + r; queue.push(n);
            });
        }
        const way = [];
        for (let k = end.join(','); k; k = prev[k]) way.unshift(k.split(',').map(Number));
        // The second guesser (Gabriel 2026-10-19, second pass: branch off
        // later, and don't just stop). His maze is mostly one corridor near
        // the entrance (side branches of 5, 1, 2 and 2 cells by cell 64), so
        // there is no single big late detour in reach. Instead the coral
        // walks the right way with the brush and turns into every side branch
        // it passes: in, to the dead end, back out, on. Its first wrong turn
        // (cell 15) comes a few seconds in, and it is still going at the end.
        const onWay = new Set(way.map((p) => p.join(',')));
        const kids = (cell) => nbrs(cell[0], cell[1]).filter((m) => prev[m.join(',')] === cell.join(','));
        const tour = (cell) => { let seq = [cell]; kids(cell).forEach((k) => { seq = seq.concat(tour(k), [cell]); }); return seq; };
        let lost = [];
        way.forEach((w) => {
            lost.push(w);
            nbrs(w[0], w[1]).forEach((n) => { if (!onWay.has(n.join(','))) lost = lost.concat(tour(n), [w]); });
        });
        const centre = ([c, r]) => [X(c) + cw / 2, Y(r) + ch / 2];
        const inDoor = [X(0) - cw * 0.8, Y(start[1]) + ch / 2];
        const route = (cells, out) => {
            let pts = [inDoor].concat(cells.map(centre), out ? [out] : []);
            for (let pass = 0; pass < 2; pass++) {
                const o = [pts[0]];
                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i], b = pts[i + 1];
                    o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
                }
                o.push(pts[pts.length - 1]);
                pts = o;
            }
            const cum = [0];
            for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            return { pts: pts, cum: cum, length: cum[cum.length - 1] };
        };
        const along = (R, dist) => {
            let i = 1;
            while (i < R.cum.length - 1 && R.cum[i] < dist) i++;
            const f = Math.min(1, (dist - R.cum[i - 1]) / ((R.cum[i] - R.cum[i - 1]) || 1));
            return { u: (R.pts[i - 1][0] + (R.pts[i][0] - R.pts[i - 1][0]) * f) / 1920, v: (R.pts[i - 1][1] + (R.pts[i][1] - R.pts[i - 1][1]) * f) / 1080 };
        };
        const main = route(way, [X(COLS) + cw * 0.8, Y(end[1]) + ch / 2]);
        const span = Math.min(WALK_PX, main.length);
        MAZE.walk = (t) => along(main, ease(t) * span);
        if (lost) {
            const L = route(lost, null);
            const span = Math.min(LOST_PX, L.length);
            MAZE.lost = (t) => along(L, ease(t) * span);
            MAZE.lostCells = lost.length;
        }
        if (routesOnly) return MAZE;
        // His walls, light on dark, through the paste-as-collider path.
        const light = svg.replace('fill="#ffffff"', 'fill="#000000"').replace('stroke="#141414"', 'stroke="#ffffff"');
        const url = 'data:image/svg+xml;base64,' + btoa(light);
        await new Promise((resolve) => window.createLayerFromDataUrl(url, 'Maze', (layer) => {
            layer.threshold = 10;
            layer.__maskDirty = true;
            window.collisionLayers.createFromLayerMask(layer.index, {
                visible: true,
                onCreated: (ci) => {
                    const L = (window.layers || []).find((l) => l.index === ci);
                    if (L) L.colliderColour = '#F2DBB4';
                    if (layer.visible && window.toggleLayer) window.toggleLayer(layer.index);
                    if (window.renderLayers) window.renderLayers();
                    resolve();
                }
            });
        }));
        MAZE.cells = way.length; MAZE.px = Math.round(main.length);
        return MAZE;
    }

    // The teaser, in order. ORDER is what `clips` records with no keys;
    // other scenes (collider, scatter, thick, swirl, looks, gravity,
    // mandala) are kept for a retune and recorded by name.
    // Gabriel's 16-beat list, 2026-10-18 (beat 16, the fade to the splash,
    // is the end scene's last seconds).
    const CUT = ['title', 'fluid', 'together', 'multibrush', 'kaleidoscope', 'shared', 'shapes', 'textkeys',
                 'maze', 'pressure', 'blend', 'laminar', 'paste', 'lighting', 'end'];
    const ORDER = CUT.slice();
    const SPLITS = {};                                       // e.g. { 'a-b': ['a', 'b'] }: left of a | right of b

    // The scene's look, settings and caption, before any paint.
    async function prep(sc) {
        // The last take's pen comes up and its queued dabs flush (the app
        // sends them on a short timer) BEFORE the clear: otherwise its final
        // dab landed on the next scene's clean canvas (a coral blob at the
        // Kaleidoscope's last point, there from the lighting take's frame 0).
        penUp();
        if (CLOCK.v0) await steps(4);
        resetAll();
        // Then once more: a Stabilization brush (Kaleidoscope's) still held a
        // dab of its stroke after the clear and dropped it on the next scene.
        if (CLOCK.v0) { await steps(4); if (window.clearCanvas) window.clearCanvas(); }
        Object.keys(sc).forEach((k) => { if (k.startsWith('__')) delete sc[k]; });
        if (sc.preset && window.applyPreset) window.applyPreset(sc.preset);
        await sleep(150);
        // Colours come from the pen pieces: no palette stepping or random hue.
        set.check('stepPalette', false); set.check('randomColor', false);
        if (sc.color) set.color(sc.color);
        if (sc.size) set.slider('brushSize', sc.size);
        if (sc.pre) await sc.pre();
        let line = null;
        if (sc.splash) await loadSplash();
        if (sc.text === 'splashTitle') {
            const t = SPLASH.title;
            line = caption({ content: 'Swirl Together', x: t.x, y: t.y, fontSize: t.fontSize,
                             letterSpacing: t.letterSpacing, fontWeight: t.fontWeight });   // colour: CAPTION's cream, the splash's own
        } else if (sc.text) line = caption(sc.text);
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
        // A painter's hand (human()): the pointer keeps moving with the
        // button up between strokes, the way a mouse does.
        if (pen && pen.step) {
            for (let k = 0; k < SUB; k++) {
                const h = pen.step(ph + dph * k / SUB);
                const p = canvasPoint(h);
                if (h.down) {
                    if (!PEN.down) { firePen('pointerdown', p, 1); PEN.down = true; }
                    else firePen('pointermove', p, 1);
                } else {
                    if (PEN.down) { firePen('pointerup', PEN.last, 0); PEN.down = false; }
                    firePen('pointermove', p, 0);
                }
                PEN.last = p;
            }
            return;
        }
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
        // Each painter's tag sits on their hand exactly, every frame: the
        // same seeded hand their page paints with (human() is deterministic),
        // not the room's cursor messages, which arrive 20 times a second and
        // stepped the tags (Gabriel 2026-10-18: "jerky").
        const ph = LIVE.i / LIVE.N;
        (sc.artists || []).forEach((a, j) => {
            if (!a.__tag) return;
            const h = a.__tag.at(ph);
            marks.push({ id: 'artist' + j, x: h.u * W, y: h.v * H, color: a.tag, name: a.name });
        });
        if (sc.selfName && sc.__hpen) {
            const h = sc.__hpen.at(ph);
            marks.push({ id: 'self', x: h.u * W, y: h.v * H,
                         color: sc.selfColor || '#ffffff', name: typeof sc.selfName === 'string' ? sc.selfName : shortName(clientId) });   // clientId is a top-level let: not on window
        }
        ctx.save();
        // Gabriel 2026-10-18: the first size (44 px names, 22 px rings) was too
        // big on screen; this is about two thirds of it.
        ctx.font = "600 30px Bahnschrift, 'DIN Alternate', sans-serif";
        ctx.textBaseline = 'middle';
        marks.forEach((m) => {
            seen.add(m.id);
            const t = { x: m.x, y: m.y };
            TAGS.set(m.id, t);
            ctx.lineWidth = 3; ctx.strokeStyle = m.color; ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, TAU); ctx.fill(); ctx.stroke();
            if (m.name) {
                const tw = ctx.measureText(m.name).width;
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.beginPath(); ctx.roundRect(t.x + 17, t.y + 11, tw + 24, 40, 8); ctx.fill();
                ctx.fillStyle = m.color; ctx.fillRect(t.x + 17, t.y + 11, 5, 40);
                ctx.fillStyle = '#ffffff'; ctx.fillText(m.name, t.x + 31, t.y + 32);
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
        if (STILL.on) {
            if (!LIVE.stills.has(LIVE.i)) return;
            await window.fluidExport.captureFrame(cap, { opaque: true });
            if (sc && sc.tags !== false && (sc.artists || sc.selfName)) drawTags(capCtx, sc);
            const png = await new Promise((r) => cap.toBlob(r, 'image/png'));
            const name = 'still-' + (STILL.captions ? 'cap-' : '') + key + '-' + String(Math.round(100 * LIVE.i / LIVE.N)).padStart(2, '0') + '.png';
            const res = await fetch('/__out/' + name, { method: 'PUT', body: png });
            if (!res.ok) throw new Error('still rejected: ' + res.status);
            return;
        }
        await window.fluidExport.captureFrame(cap, { opaque: true });
        if (sc && sc.tags !== false && (sc.artists || sc.selfName || sc.__keycaps)) drawTags(capCtx, sc);
        // The splash screenshot over the room, at the scene's own opacity.
        if (sc && sc.splash && SPLASH) {
            const a = sc.splash(LIVE.i / LIVE.N, sc.secs);
            if (a > 0.002) {
                capCtx.globalAlpha = Math.min(1, a);
                capCtx.drawImage(SPLASH.img, 0, 0, W, H);
                capCtx.globalAlpha = 1;
            }
        }
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
        // In a room the recorder paints as Gabe, with his hand.
        if (sc.selfName && sc.pen) sc.__hpen = human(sc.pen, 'Gabe', key, sc.secs);
        (sc.artists || []).forEach((a) => { a.__tag = human(a.pen, a.name, key, sc.secs); });
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
        LIVE.stills = STILL.on ? new Set(STILL.at.map((p) => Math.min(LIVE.N - 1, Math.round(p * LIVE.N)))) : null;
        if (!STILL.on) await fetch('/__clip/' + key + '/begin?w=' + W + '&h=' + H + '&fps=' + FPS, { method: 'POST' });
        return LIVE.N;
    }
    async function recFrame(key, i) {
        const sc = SCENES[key], ph = i / LIVE.N;
        LIVE.i = i;
        if (sc.pen) penAt(sc.__hpen || sc.pen, ph, 1 / LIVE.N);
        if (sc.frame) sc.frame(ph, LIVE.line);
        await steps(1);
        await grab(key, sc);
        return true;
    }
    async function recEnd(key) {
        penUp();
        const r = STILL.on ? { ok: true } : await fetch('/__clip/' + key + '/end', { method: 'POST' });
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
        if (!a.__hpen) a.__hpen = human(a.pen, a.name, key, SCENES[key].secs);   // their own hand
        penAt(a.__hpen, i / N, 1 / N);
        await steps(1);
        return true;
    }
    async function artistDone() { penUp(); await steps(2); return true; }

    window.__trailer = { maze: () => MAZE, human: human, stillMode: stillMode, setup: setup, probe: probe, showSplash: showSplash, hideSplash: hideSplash, splashTitle: splashTitle, record: record, prep: (k) => prep(SCENES[k]), meanLum: meanLum,
                         recPrep: recPrep, recBegin: recBegin, recFrame: recFrame, recEnd: recEnd,
                         artistPrep: artistPrep, artistFrame: artistFrame, artistDone: artistDone, syncClock: syncClock,
                         order: ORDER, splits: SPLITS, cut: CUT, scenes: SCENES, names: NAMES, caption: caption };
    return { installed: true, scenes: ORDER };
})();
