// ═══════════════════════════════════════════════════════════════════
// js/57-mutation-thumbs.js — the picture on a Mutate card (2026-09-29)
// PROVIDES: window.MutationThumbs { paint(canvasEl, snapshot), aspect() }
// READS (at paint time): symmetryTransforms (05g), getPaletteColorsForIndex
//   (01), config (04a) — so load order only has to beat the first Mutate.
//
// A card used to show two flat colours, the background and the brush
// picker, and nothing about how many arms the brush had or what the
// kaleidoscope was doing. It is now a diagram of the variant's brush:
//   · one circle for every dab a single press lays down. The Multi-Brush
//     count and symmetry are the variant's, and the positions come from the
//     transform list the brush itself uses (05g symmetryTransforms), so
//     radial, the mirrors and rake sit the way they paint. Each circle is
//     the colour that arm lays on your next stroke; a Pressure arm, which
//     moves the paint and lays none, is an empty dashed ring.
//   · with the kaleidoscope on, its fold laid over the card as lines, under
//     the circles: Wedge spokes (one per facet, turned by Angle, bent by
//     Twist), Mirror H and Mirror V stripes (one per layer), the Quad grid,
//     Spiral rings. Blend sets how strong the lines are; an arrow shows a
//     spin.
// What a diagram can't say (Rnd / Palette colours, the kaleido mode's name)
// the card's tags say (20-mixer-layout paintThumbs).
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var TAU = Math.PI * 2;
    var DEG = Math.PI / 180;

    // ── Colours ─────────────────────────────────────────────────────
    function hexOk(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }

    function hexRgb(hex) {
        return [parseInt(hex.substr(1, 2), 16) / 255, parseInt(hex.substr(3, 2), 16) / 255,
                parseInt(hex.substr(5, 2), 16) / 255];
    }

    function hexHue(hex) {
        var c = hexRgb(hex), r = c[0], g = c[1], b = c[2];
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (d === 0) return 0;
        var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    }

    function luma(hex) {
        var c = hexRgb(hex);
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    // h in degrees, s and l as fractions; returns 0-1 floats.
    function hsl(h, s, l) {
        h = ((h % 360) + 360) % 360;
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = l - c / 2, r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return [r + m, g + m, b + m];
    }

    // A stand-in for an arm's own Rnd draw: 05g generateVibrantColor's
    // recipe at its middle (saturation 0.92, lightness 0.57, lifted to the
    // same luma floor). Not random, so a card is painted the same every time
    // and every card of a deal agrees.
    function vibrant(hue) {
        var cfg = window.config || {};
        var floor = cfg.COLOR_GATE
            ? ((typeof cfg.RANDOM_LUMA_FLOOR_GATE === 'number') ? cfg.RANDOM_LUMA_FLOOR_GATE : 0.40)
            : ((typeof cfg.RANDOM_LUMA_FLOOR === 'number') ? cfg.RANDOM_LUMA_FLOOR : 0.22);
        var l = 0.57, rgb = hsl(hue, 0.92, l);
        while ((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) < floor && l < 0.82) {
            l += 0.04;
            rgb = hsl(hue, 0.92, l);
        }
        return '#' + rgb.map(function (v) {
            var x = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16);
            return x.length < 2 ? '0' + x : x;
        }).join('');
    }

    // The tray Palette mode walks after this variant is applied (01
    // getStepColorList): its saved tray, else its palette's colours.
    function stepList(snap) {
        var seen = {}, out = [];
        function add(h) {
            if (!hexOk(h)) return;
            var k = h.toUpperCase();
            if (!seen[k]) { seen[k] = 1; out.push(k); }
        }
        (Array.isArray(snap.savedColors) ? snap.savedColors : []).forEach(add);
        if (!out.length && typeof snap.paletteIndex === 'number'
            && typeof window.getPaletteColorsForIndex === 'function') {
            try { (window.getPaletteColorsForIndex(snap.paletteIndex) || []).forEach(add); } catch (_) {}
        }
        return out;
    }

    // Arm 0's colour mode once the variant is applied: the Rnd / Palette
    // switches win over the stored mode (25 armZeroMode, 05g handlers).
    function zeroMode(snap) {
        var cb = snap.checkboxes || {};
        var a0 = Array.isArray(snap.armColors) ? snap.armColors[0] : null;
        if (cb.randomColor) return 'random';
        if (cb.stepPalette) return 'step';
        if (cb.randomColor === undefined && cb.stepPalette === undefined && a0
            && (a0.mode === 'random' || a0.mode === 'step')) return a0.mode;
        return 'fixed';
    }

    var GOLDEN = 137.508;   // hue step that keeps the stand-ins apart

    // The colour each arm lays on the next stroke, as 05g resolveArmColor
    // resolves it. A stroke starts from the colour picker (05d
    // applyPickerColor) in every mode, so arm 0, 'main' arms and arms with
    // no settings of their own paint the picker the variant restores. Null
    // for a Pressure arm.
    function colourPlan(snap) {
        var arms = Array.isArray(snap.armColors) ? snap.armColors : [];
        var picker = (snap.colors && hexOk(snap.colors.brush)) ? snap.colors.brush
                   : (arms[0] && hexOk(arms[0].color) ? arms[0].color : '#ffffff');
        var list = stepList(snap);
        var hue0 = hexHue(picker);
        return {
            mode: zeroMode(snap),
            colourOf: function (arm) {
                var cfg = arms[arm];
                if (cfg && cfg.push) return null;
                if (arm === 0 || !cfg || cfg.mode === 'main') return picker;
                if (cfg.mode === 'fixed') return hexOk(cfg.color) ? cfg.color : '#ffffff';
                if (cfg.mode === 'random') return vibrant(hue0 + GOLDEN * arm);
                if (cfg.mode === 'step' && list.length) return list[(cfg.stepIndex | 0) % list.length];
                return picker;
            }
        };
    }

    // ── Multi-Brush layout ──────────────────────────────────────────
    function selectOf(snap, id, def) {
        var v = snap.selects ? snap.selects[id] : undefined;
        return v === undefined || v === null ? def : String(v);
    }
    function sliderOf(snap, id, def) {
        var v = snap.sliders ? snap.sliders[id] : undefined;
        return typeof v === 'number' && isFinite(v) ? v : def;
    }

    function armCount(snap) {
        return Math.max(1, Math.min(8, Math.round(sliderOf(snap, 'multiplier', 1))));
    }

    // Centre-based modes come straight from 05g (dx = dy = 0 is a press: it
    // reads nothing and advances nothing). Rake is laid out here: 05g builds
    // it from the live stroke's heading.
    function centreTransforms(mode, n) {
        if (typeof window.symmetryTransforms === 'function') {
            try { return window.symmetryTransforms(mode, n, 0, 0, 0); } catch (_) {}
        }
        var out = [];
        for (var a = 0; a < n; a++) {
            var c = Math.cos(TAU * a / n), s = Math.sin(TAU * a / n);
            out.push({ m: [c, -s, 0, s, c, 0], arm: a });
        }
        return out;
    }

    // Where one press lands every dab, in canvas px, with the circle radius.
    // The press sits on a ring round the centre. With mirrors it sits off
    // the mirror axis, so each dab and its reflection read as a pair: 55° /
    // (pairs) from the axis puts the two of a pair about half as far apart
    // as neighbouring pairs. A single brush sits in the middle.
    function dabLayout(snap, W, H) {
        var n = armCount(snap);
        var mode = selectOf(snap, 'symmetryMode', 'radial');
        var cx = W / 2, cy = H / 2, hs = Math.min(W, H) / 2;
        var dabs = [], r;
        if (mode === 'rake') {
            // Bristles side by side across the stroke, as 05g spaces them
            // (one brush width apart), for a stroke heading up the card.
            r = Math.min(hs * 0.24, W * 0.86 / (n * 2.3));
            for (var b = 0; b < n; b++) {
                dabs.push({ x: cx + (b - (n - 1) / 2) * r * 2.3, y: cy, arm: b });
            }
            return { dabs: dabs, r: r, mode: mode, arms: n };
        }
        var list = centreTransforms(mode, n);
        if (list.length === 1) {
            return { dabs: [{ x: cx, y: cy, arm: list[0].arm }], r: hs * 0.26, mode: mode, arms: n };
        }
        var mirrored = list.some(function (t) { return (t.m[0] * t.m[4] - t.m[1] * t.m[3]) < 0; });
        var off = mirrored ? (55 / Math.max(1, list.length / 2)) * DEG : 0;
        // clockwise from straight up; Mirror U↕D pairs across the horizontal
        var at = mode === 'mirrorY' ? 90 * DEG - off : off;
        var R = hs * 0.55;
        var sx = Math.sin(at) * R, sy = -Math.cos(at) * R;
        list.forEach(function (t) {
            var m = t.m;
            dabs.push({ x: cx + m[0] * sx + m[1] * sy + m[2], y: cy + m[3] * sx + m[4] * sy + m[5], arm: t.arm });
        });
        var dmin = Infinity;
        for (var i = 0; i < dabs.length; i++) {
            for (var j = i + 1; j < dabs.length; j++) {
                var d = Math.hypot(dabs[i].x - dabs[j].x, dabs[i].y - dabs[j].y);
                if (d > 0.5 && d < dmin) dmin = d;
            }
        }
        r = Math.max(hs * 0.06, Math.min(hs * 0.2, isFinite(dmin) ? dmin * 0.42 : hs * 0.2));
        return { dabs: dabs, r: r, mode: mode, arms: n };
    }

    function drawDabs(ctx, lay, plan, lightBg, px) {
        var r = lay.r;
        lay.dabs.forEach(function (d) {
            var col = plan.colourOf(d.arm);
            ctx.beginPath();
            ctx.arc(d.x, d.y, r, 0, TAU);
            if (!col) {
                ctx.setLineDash([Math.max(px, r * 0.45), Math.max(px, r * 0.32)]);
                ctx.lineWidth = Math.max(px, r * 0.16);
                ctx.strokeStyle = lightBg ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
                ctx.stroke();
                ctx.setLineDash([]);
                return;
            }
            ctx.fillStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = r * 0.8;
            ctx.fill();
            ctx.shadowBlur = 0;
            // A hairline rim, so a dark arm on a dark canvas (or a pale one
            // on a pale canvas) still shows where it is.
            ctx.lineWidth = px;
            ctx.strokeStyle = lightBg ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.22)';
            ctx.stroke();
        });
    }

    // ── Kaleidoscope ────────────────────────────────────────────────
    // The live values the display reads after an apply: snapshot.kaleido is
    // written after the sliders (12 applyPresetSnapshot) and wins; the
    // switch is kaleidoToggle, and mode 0 is Off (05a doK).
    function kaleidoOf(snap) {
        var cb = snap.checkboxes || {};
        if (!cb.kaleidoToggle) return null;
        var k = snap.kaleido || {};
        var mode = typeof k.mode === 'number' ? k.mode : parseInt(selectOf(snap, 'kaleidoMode', '1'), 10);
        if (!(mode >= 1 && mode <= 5)) return null;
        var spinSpeed = sliderOf(snap, 'kSpinSpeed', 0);
        var animate = typeof k.animate === 'boolean' ? k.animate : !!cb.kAnimateRot;
        return {
            mode: mode,
            segments: Math.max(1, Math.round(typeof k.segments === 'number' ? k.segments : sliderOf(snap, 'kaleidoSegments', 12))),
            angle: typeof k.angle === 'number' ? k.angle : sliderOf(snap, 'kAngle', 0) * DEG,
            twist: typeof k.twist === 'number' ? k.twist : sliderOf(snap, 'kTwist', 0),
            zoom: Math.max(0.0001, typeof k.zoom === 'number' ? k.zoom : sliderOf(snap, 'kZoom', 1)),
            blend: Math.max(0, Math.min(1, typeof k.blend === 'number' ? k.blend : sliderOf(snap, 'kBlend', 1))),
            spin: animate && spinSpeed !== 0 ? (spinSpeed > 0 ? 1 : -1) : 0,
            iso: !(window.config && window.config.KALEIDO_ISOTROPIC === false)
        };
    }

    // The fold's mirror lines, from 05a's maths. Its UV has y up, so a UV
    // point (x, y) measured from the centre lands at (cx + x·W, cy − y·H);
    // Wedge in screen proportions (KALEIDO_ISOTROPIC) measures in short
    // sides instead. Where 05a turns p by mat2(ca, −sa, sa, ca) the fold's
    // pattern turns counter-clockwise on screen by Angle.
    function drawKaleido(ctx, W, H, K, lightBg, px) {
        var cx = W / 2, cy = H / 2;
        var ca = Math.cos(K.angle), sa = Math.sin(K.angle);
        var ink = lightBg ? '0,0,0' : '255,255,255';
        var alpha = 0.25 + 0.45 * K.blend;
        var MIN_GAP = 3 * px;   // closer than this, only every n-th line is drawn
        ctx.save();
        ctx.lineWidth = px;
        ctx.strokeStyle = 'rgba(' + ink + ',' + alpha.toFixed(3) + ')';

        function uvPx(x, y) { return [cx + x * W, cy - y * H]; }
        // A straight line of UV points {q : n·q = c}, n a unit normal.
        function uvLine(nx, ny, c) {
            var a = uvPx(nx * c - ny * 2, ny * c + nx * 2);
            var b = uvPx(nx * c + ny * 2, ny * c - nx * 2);
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        // Past MIN_GAP the lines would merge into a grey sheet: keep every
        // n-th, so a fine fold still reads as a fine pattern (the card's tag
        // carries the real count).
        function stride(gapPx) { return gapPx >= MIN_GAP ? 1 : Math.ceil(MIN_GAP / gapPx); }

        if (K.mode === 1) {
            // Wedge: one spoke per facet. The fold adds r·Twist to the angle,
            // so a spoke sits where angle + facet − r·zoom·Twist lands.
            var S = Math.min(W, H);
            var reach = K.iso ? Math.hypot(W, H) / 2 / S : 0.75;
            for (var k = 0; k < K.segments; k++) {
                ctx.beginPath();
                for (var i = 0; i <= 32; i++) {
                    var t = reach * i / 32;
                    var a = K.angle + k * TAU / K.segments - t * K.zoom * K.twist;
                    var p = K.iso ? [cx + Math.cos(a) * t * S, cy - Math.sin(a) * t * S]
                                  : uvPx(Math.cos(a) * t, Math.sin(a) * t);
                    if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
                }
                ctx.stroke();
            }
        } else if (K.mode === 2 || K.mode === 3) {
            // Mirror H / V: 05a folds |x|·zoom + 0.5 into layers 1/segments
            // wide, so it mirrors at x = 0 and wherever |x|·zoom = m/segments − 0.5.
            var L = 1 / K.segments, reachC = 0.72 * K.zoom;
            var nx = K.mode === 2 ? ca : -sa, ny = K.mode === 2 ? sa : ca;
            var sm = stride(L / K.zoom * Math.min(W, H));
            var m0 = Math.ceil(0.5 / L);
            uvLine(nx, ny, 0);
            for (var m = m0; m * L - 0.5 <= reachC; m++) {
                var c = m * L - 0.5;
                if (c <= 1e-6 || (m - m0) % sm) continue;
                uvLine(nx, ny, c / K.zoom);
                uvLine(nx, ny, -c / K.zoom);
            }
        } else if (K.mode === 4) {
            // Quad: mirrors every 1 / (2^(segments−1)·zoom) along both turned axes.
            var gap = 1 / (Math.pow(2, K.segments - 1) * K.zoom);
            gap *= stride(gap * Math.min(W, H));
            for (var q = -Math.floor(0.72 / gap); q * gap <= 0.72; q++) {
                uvLine(ca, sa, q * gap);
                uvLine(-sa, ca, q * gap);
            }
        } else {
            // Spiral: bands 0.5/segments deep in r·zoom, UV r, so on a wide
            // canvas the rings are as wide as it is.
            var step = 0.5 / (K.segments * K.zoom);
            step *= stride(step * Math.min(W, H));
            for (var rho = step; rho <= 0.75; rho += step) {
                ctx.beginPath();
                ctx.ellipse(cx, cy, rho * W, rho * H, 0, 0, TAU);
                ctx.stroke();
            }
        }

        if (K.spin) {
            // Spin: an arc across the top right, its head the way the fold
            // turns (Spin Speed > 0 grows Angle: counter-clockwise).
            var hs = Math.min(W, H) / 2, rr = hs * 0.88;
            var a0 = -78 * DEG, a1 = -22 * DEG;       // canvas angles, y down
            var head = K.spin > 0 ? a0 : a1, dir = K.spin > 0 ? -1 : 1;
            ctx.strokeStyle = 'rgba(' + ink + ',0.85)';
            ctx.fillStyle = 'rgba(' + ink + ',0.85)';
            ctx.lineWidth = Math.max(px, hs * 0.035);
            ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke();
            var hx = cx + Math.cos(head) * rr, hy = cy + Math.sin(head) * rr;
            var tx = -Math.sin(head) * dir, ty = Math.cos(head) * dir;   // along the turn
            var nx2 = Math.cos(head), ny2 = Math.sin(head), sz = hs * 0.11;
            ctx.beginPath();
            ctx.moveTo(hx + tx * sz, hy + ty * sz);
            ctx.lineTo(hx - tx * sz * 0.2 + nx2 * sz * 0.6, hy - ty * sz * 0.2 + ny2 * sz * 0.6);
            ctx.lineTo(hx - tx * sz * 0.2 - nx2 * sz * 0.6, hy - ty * sz * 0.2 - ny2 * sz * 0.6);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    // ── Public ──────────────────────────────────────────────────────
    // Paints `snap` into `cnv` at its current pixel size and returns what it
    // drew, for the card's tags.
    function paint(cnv, snap) {
        if (!cnv || !snap) return null;
        var ctx = cnv.getContext('2d');
        var W = cnv.width, H = cnv.height;
        if (!ctx || W < 2 || H < 2) return null;
        var plan = colourPlan(snap);
        var bg = (snap.colors && hexOk(snap.colors.background)) ? snap.colors.background : '#000000';
        var lightBg = luma(bg) > 0.55;
        var px = Math.max(1, Math.round(Math.min(W, H) / 60));   // one screen pixel, near enough
        var lay = dabLayout(snap, W, H);
        var K = kaleidoOf(snap);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        // The fold's lines go down first: over the circles they sliced every
        // brush in two, and the brush layout is what the card is for.
        if (K) drawKaleido(ctx, W, H, K, lightBg, px);
        drawDabs(ctx, lay, plan, lightBg, px);
        ctx.restore();
        return {
            arms: lay.arms,
            dabs: lay.dabs.length,
            symmetry: lay.mode,
            colorMode: plan.mode,
            kaleido: K ? { mode: K.mode, segments: K.segments, blend: K.blend, spin: K.spin } : null
        };
    }

    // A diagram, not a preview, so it keeps one shape whatever the canvas
    // is: 3:2 leaves the ring room top to bottom and the corners free for
    // the card's tags. The fold lines are drawn in the card's own UV.
    function aspect() { return 1.5; }

    window.MutationThumbs = { paint: paint, aspect: aspect };
})();
