// ═══════════════════════════════════════════════════════════════════
// js/68-dither.js — Dither (Effects → Dither).
// LOAD ORDER: anywhere after the markup and 09-settings-manager.js; binds
//   the controls in index.html by id like 05e and 45 do, and 20 moves them
//   into Effects.
// PROVIDES: window.Dither — params(), bindTile(gl, unit), getTile(),
//   setTile(hex), snapshotTile(), PATTERNS, TONES
//
// The paint drawn in a few shades and a pattern, like an old computer
// screen or a printed page. It is a look on the way out (05a displayFrag),
// so the paint underneath is untouched and switching it off gives the
// picture back. Patterns: Bayer (the ordered grid), Noise (fine grain),
// Halftone (dots), Lines, and Draw your own. Levels is how many shades
// each colour keeps, Size how big the pattern is in screen pixels, Color
// what the shades are: a retro palette (each channel stepped), the
// paint's own colours (brightness stepped, hue kept) or black and white.
// Beat pulse swells the pattern on each beat while Audio React listens.
//
// Draw your own: a 16 x 16 pad. A dither pattern is an ORDER, the order
// in which a tile's squares light up as the paint gets brighter, so the
// drawing is turned into one: the squares you drew light first, from the
// middle of the shape outward, then the empty squares nearest the shape,
// and so on until the tile is full. So dim paint shows the core of your
// shape, paint as bright as your drawing is full shows exactly your
// drawing, and brighter paint grows it until the shapes merge. The
// distances wrap round the tile's edges, as the tile does on screen.
// The drawing is yours: it is saved the moment you draw (persistence
// contract) and presets with this pattern carry it.
//
// Nothing is written to config: 05j asks params() every frame and it reads
// the controls live, so a preset, a look link or a room mirror that sets
// them is drawn at once. The controls are registry-backed, so presets,
// links and Reset app carry them.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    // Shader codes (05a ditherPattern / ditherTone).
    const PATTERNS = { bayer: 0, noise: 1, halftone: 2, lines: 3, custom: 4 };
    const TONES = { retro: 0, paint: 1, mono: 2 };
    const N = 16;                    // the pad and the tile are N x N
    const STORE_KEY = 'dither.tile';

    let el = null;
    // One object, refilled: params() runs every frame.
    const out = { pattern: 0, levels: 4, size: 2, tone: 0 };

    function num(input, def, lo, hi) {
        const v = input ? parseFloat(input.value) : NaN;
        return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
    }

    // ── Beat pulse ─────────────────────────────────────────────────────
    // 22's beat envelope kicks up at once on a hit; a pattern that jumps a
    // size in one frame reads as a jolt, so it is eased in here (~70 ms)
    // and eased out at 22's own release. Under PhotoSafe the swell is
    // halved: it keeps the screen's brightness (a dither always does) but
    // a whole-screen pattern change is still the kind of motion that
    // protection exists to soften.
    const PULSE_ATTACK_MS = 70;
    let pulse = 0, pulseAt = 0;
    function beatSwell(amount) {
        const now = performance.now();
        const dt = pulseAt ? Math.min(100, now - pulseAt) : 16;
        pulseAt = now;
        const ar = window.audioReactive;
        const target = (amount > 0 && ar && ar.getPulse) ? ar.getPulse() : 0;
        if (target > pulse) pulse += (target - pulse) * (1 - Math.exp(-dt / PULSE_ATTACK_MS));
        else pulse = target;
        const cap = (window.config && window.config.PHOTOSAFE) ? 0.5 : 1;
        return 1 + pulse * amount * cap;
    }

    // null while off; otherwise the values 05j uploads.
    function params() {
        if (!el) return null;
        syncDrawVisibility();
        if (!el.toggle || !el.toggle.checked) { pulse = 0; return null; }
        out.pattern = (el.pattern && PATTERNS[el.pattern.value]) || 0;
        out.tone = (el.tone && TONES[el.tone.value]) || 0;
        out.levels = Math.round(num(el.levels, 4, 2, 16));
        // Not rounded once it swells: the pattern grows smoothly from the
        // centre of the canvas (05j sets the origin there).
        out.size = Math.round(num(el.size, 2, 1, 8)) * beatSwell(num(el.pulse, 0, 0, 1));
        return out;
    }

    // ── The tile ───────────────────────────────────────────────────────
    let ink = new Uint8Array(N * N);   // the drawing: 1 = drawn
    let ranks = new Uint8Array(N * N); // the order squares light in, 0 first
    let tileVer = 0;                   // bumped on every change; 05j re-uploads on it

    // The Bayer order, for ties and for a pad that is empty or full.
    function bayer(x, y) {
        let v = 0;
        for (let b = 0; b < 4; b++) {
            v |= (((x ^ y) >> b) & 1) << (2 * (3 - b) + 1);
            v |= ((x >> b) & 1) << (2 * (3 - b));
        }
        return v;
    }

    // Drawn squares first, deepest inside the shape first; then empty
    // squares, nearest the shape first. Within a distance, squares with
    // more of the drawing round them go first (a shape's thick parts
    // before its tips, the pockets of a C before the open side); exact
    // ties fall back to Bayer, so a flat band still breaks up evenly.
    function rebuild() {
        let count = 0;
        for (let i = 0; i < N * N; i++) count += ink[i];
        const key = new Float64Array(N * N);
        for (let i = 0; i < N * N; i++) {
            const r = (i / N) | 0, c = i % N, tie = bayer(c, r) / 256;
            if (count === 0 || count === N * N) { key[i] = -tie; continue; }
            let d2 = Infinity, near = 0;
            for (let j = 0; j < N * N; j++) {
                let dx = Math.abs((j % N) - c), dy = Math.abs(((j / N) | 0) - r);
                dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
                if (ink[j] !== ink[i] && dx * dx + dy * dy < d2) d2 = dx * dx + dy * dy;
                if (dx <= 2 && dy <= 2) near += ink[j];
            }
            const d = Math.sqrt(d2);
            key[i] = (ink[i] ? 1e4 + d * 100 : -d * 100) + near / 25 * 10 - tie;
        }
        const order = Array.from({ length: N * N }, (_, i) => i).sort((a, b) => key[b] - key[a]);
        order.forEach((i, k) => { ranks[i] = k; });
        tileVer++;
    }

    // Starts as a heart, so the pad shows what it is for.
    function heart() {
        const h = new Uint8Array(N * N);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const x = (c + 0.5 - N / 2) / 5.2, y = -(r + 0.5 - N / 2 - 0.6) / 5.2;
            const a = x * x + y * y - 1;
            h[r * N + c] = (a * a * a - x * x * y * y * y <= 0) ? 1 : 0;
        }
        return h;
    }

    // 64 hex digits, one bit a square, rows top to bottom.
    function toHex(bits) {
        let s = '';
        for (let i = 0; i < N * N; i += 4) s += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
        return s;
    }
    function fromHex(s) {
        if (typeof s !== 'string' || !/^[0-9a-f]{64}$/i.test(s)) return null;
        const bits = new Uint8Array(N * N);
        for (let k = 0; k < 64; k++) {
            const v = parseInt(s[k], 16);
            for (let b = 0; b < 4; b++) bits[k * 4 + b] = (v >> (3 - b)) & 1;
        }
        return bits;
    }

    // Written through at once, never on the Save button. A look link or a
    // room mirror shows its drawing without keeping it (their flags), as
    // the Light Shift path does.
    function persist() {
        if (window.__mpApplyingRemote || window.__lookLinkApplying) return;
        try { if (window.settingsManager) window.settingsManager.set(STORE_KEY, toHex(ink)); } catch (_) {}
    }
    function restore() {
        let saved = null;
        try { saved = window.settingsManager ? fromHex(window.settingsManager.get(STORE_KEY)) : null; } catch (_) {}
        ink = saved || heart();
        rebuild();
    }

    function getTile() { return toHex(ink); }
    function setTile(hex) {
        const bits = fromHex(hex);
        if (!bits || toHex(bits) === toHex(ink)) return false;
        ink = bits;
        rebuild();
        persist();
        drawPad();
        return true;
    }
    // What a preset carries: the drawing, only while it is the pattern in
    // use. A preset saved on Bayer must not put back an old drawing.
    function snapshotTile() {
        return (el && el.pattern && el.pattern.value === 'custom') ? toHex(ink) : null;
    }

    // ── GL: the ranks as a 16 x 16 R8 texture (05a uDitherTile) ────────
    let tex = null, texVer = -1, texGl = null;
    function bindTile(gl, unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        if (!out || out.pattern !== PATTERNS.custom) { gl.bindTexture(gl.TEXTURE_2D, null); return; }
        if (!tex || texGl !== gl || !gl.isTexture(tex)) {
            tex = gl.createTexture();
            texGl = gl;
            texVer = -1;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, tex);
        }
        if (texVer !== tileVer) {
            // Row 0 is the drawing's top row; the shader flips it (GL y is up).
            const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
            const align = gl.getParameter(gl.UNPACK_ALIGNMENT);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, ranks);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, align);
            texVer = tileVer;
        }
    }

    // ── The pad ────────────────────────────────────────────────────────
    // Drawn squares bright; empty squares shaded by when they light, so
    // the pad shows the order it made from the drawing, not just the
    // drawing. The strip beside it is the pattern on a ramp, dark at the
    // bottom and bright at the top, at two shades: what the canvas will do
    // with it.
    const PAD_PX = 192;                 // drawing-buffer size (CSS sizes it)
    const CELL = PAD_PX / N;
    let cursor = -1;                    // keyboard square, -1 = none shown

    function drawPad() {
        if (!el || !el.pad) return;
        const ctx = el.pad.getContext('2d');
        ctx.fillStyle = '#0d0f14';
        ctx.fillRect(0, 0, PAD_PX, PAD_PX);
        for (let i = 0; i < N * N; i++) {
            const x = (i % N) * CELL, y = ((i / N) | 0) * CELL;
            if (ink[i]) ctx.fillStyle = '#f2f4f8';
            else {
                const g = Math.round(20 + 70 * (1 - ranks[i] / 255));
                ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + Math.round(g * 1.15) + ')';
            }
            ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
        }
        if (cursor >= 0) {
            ctx.strokeStyle = '#7fd0ff';
            ctx.lineWidth = 2;
            ctx.strokeRect((cursor % N) * CELL + 1, ((cursor / N) | 0) * CELL + 1, CELL - 1, CELL - 1);
        }
        drawRamp();
    }

    function drawRamp() {
        if (!el || !el.ramp) return;
        const W = el.ramp.width, H = el.ramp.height;
        const ctx = el.ramp.getContext('2d');
        const img = ctx.createImageData(W, H);
        const d = img.data;
        for (let y = 0; y < H; y++) {
            const v = 1 - y / (H - 1);   // bright at the top
            for (let x = 0; x < W; x++) {
                // A square lights once the paint passes its place in the order.
                const on = v >= (ranks[((y >> 1) % N) * N + ((x >> 1) % N)] + 0.5) / 256;
                const o = (y * W + x) * 4;
                d[o] = on ? 242 : 13; d[o + 1] = on ? 244 : 15; d[o + 2] = on ? 248 : 20; d[o + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    function changed(save) {
        rebuild();
        drawPad();
        if (save) persist();
    }

    function wirePad() {
        const pad = el.pad;
        if (!pad) return;
        pad.width = PAD_PX; pad.height = PAD_PX;
        let painting = false, value = 1, last = -1;
        const cellAt = (e) => {
            const r = pad.getBoundingClientRect();
            if (!r.width || !r.height) return -1;
            const c = Math.floor((e.clientX - r.left) / r.width * N);
            const w = Math.floor((e.clientY - r.top) / r.height * N);
            return (c < 0 || w < 0 || c >= N || w >= N) ? -1 : w * N + c;
        };
        // Every square on the way from the last one, so a fast stroke has no gaps.
        const lineTo = (to) => {
            if (to < 0) return false;
            const from = last < 0 ? to : last;
            const x0 = from % N, y0 = (from / N) | 0, x1 = to % N, y1 = (to / N) | 0;
            const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
            let any = false;
            for (let s = 0; s <= steps; s++) {
                const i = Math.round(y0 + (y1 - y0) * s / steps) * N + Math.round(x0 + (x1 - x0) * s / steps);
                if (ink[i] !== value) { ink[i] = value; any = true; }
            }
            last = to;
            return any;
        };
        pad.addEventListener('pointerdown', (e) => {
            const i = cellAt(e);
            if (i < 0) return;
            e.preventDefault();
            try { pad.setPointerCapture(e.pointerId); } catch (_) {}
            painting = true;
            last = -1;
            // Starting on a drawn square (or with the right button) erases,
            // as in a pixel editor: no mode to switch.
            value = (e.button === 2 || ink[i]) ? 0 : 1;
            if (lineTo(i)) changed(false);
        });
        pad.addEventListener('pointermove', (e) => {
            if (!painting) return;
            if (lineTo(cellAt(e))) changed(false);
        });
        const end = () => { if (!painting) return; painting = false; last = -1; persist(); };
        pad.addEventListener('pointerup', end);
        pad.addEventListener('pointercancel', end);
        pad.addEventListener('lostpointercapture', end);
        pad.addEventListener('contextmenu', (e) => e.preventDefault());
        // Keyboard: arrows move a square, Space or Enter flips it.
        pad.addEventListener('focus', () => { if (cursor < 0) cursor = (N / 2) * N + N / 2; drawPad(); });
        pad.addEventListener('blur', () => { cursor = -1; drawPad(); });
        pad.addEventListener('keydown', (e) => {
            const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if ((mv || e.key === ' ' || e.key === 'Enter') && cursor < 0) cursor = (N / 2) * N + N / 2;
            if (mv) {
                e.preventDefault(); e.stopPropagation();
                const x = (cursor % N + mv[0] + N) % N, y = (((cursor / N) | 0) + mv[1] + N) % N;
                cursor = y * N + x;
                drawPad();
            } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation();
                ink[cursor] = ink[cursor] ? 0 : 1;
                changed(true);
            }
        });
        if (el.clear) el.clear.addEventListener('click', () => { ink = new Uint8Array(N * N); changed(true); });
        if (el.invert) el.invert.addEventListener('click', () => { for (let i = 0; i < N * N; i++) ink[i] = ink[i] ? 0 : 1; changed(true); });
    }

    let shownCustom = null;
    function syncDrawVisibility() {
        const custom = !!(el.pattern && el.pattern.value === 'custom');
        if (custom === shownCustom || !el.draw) return;
        shownCustom = custom;
        el.draw.style.display = custom ? '' : 'none';
        if (custom) drawPad();
    }

    function wire() {
        el = {
            toggle: $('ditherToggle'), panel: $('ditherPanel'), pattern: $('ditherPattern'),
            levels: $('ditherLevels'), size: $('ditherSize'), tone: $('ditherTone'), pulse: $('ditherPulse'),
            draw: $('ditherDrawGroup'), pad: $('ditherPad'), ramp: $('ditherRamp'),
            clear: $('ditherPadClear'), invert: $('ditherPadInvert')
        };
        restore();
        wirePad();
        if (el.toggle) {
            const sync = () => { if (el.panel) el.panel.style.display = el.toggle.checked ? '' : 'none'; };
            el.toggle.addEventListener('change', sync);
            sync();
        }
        const readout = (input, spanId, fmt) => {
            if (!input) return;
            const span = $(spanId);
            const show = () => { if (span) span.textContent = fmt(parseFloat(input.value)); };
            input.addEventListener('input', show);
            show();
        };
        readout(el.levels, 'ditherLevelsValue', (v) => String(Math.round(v)));
        readout(el.size, 'ditherSizeValue', (v) => Math.round(v) + ' px');
        readout(el.pulse, 'ditherPulseValue', (v) => Math.round(v * 100) + '%');
        // A dropdown's tooltip is the picked option's own title (as 45's
        // Color does). A preset can set the value without an event, so
        // hovering re-reads it.
        [el.pattern, el.tone].forEach((sel) => {
            if (!sel) return;
            const tip = () => { const o = sel.options[sel.selectedIndex]; if (o && o.title) sel.title = o.title; };
            ['change', 'input', 'pointerenter', 'focus'].forEach((t) => sel.addEventListener(t, tip));
            tip();
        });
        if (el.pattern) el.pattern.addEventListener('change', syncDrawVisibility);
        syncDrawVisibility();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();

    window.Dither = {
        params: params, bindTile: bindTile,
        getTile: getTile, setTile: setTile, snapshotTile: snapshotTile,
        PATTERNS: PATTERNS, TONES: TONES
    };
})();
