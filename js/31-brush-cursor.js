// ═══════════════════════════════════════════════════════════════════
// js/31-brush-cursor.js — the brush cursor: a ghost of the next dab + a dot
// LOAD ORDER: plain <script> after 20-mixer-layout.js. Self-contained and
//   lazy: reads window.config / DOM live, so it is safe to run before the
//   async sim chunks (04a etc.) have defined config/pointer.
// PROVIDES: #brushCursorGhost — a faint print of the selected tip at its real
//   size and angle, in the colour about to be painted (#brushGhostToggle, on
//   by default; #brushGhostOpacity) — and #brushCursor on top of it: a small
//   hotspot dot, or the P badge while the brush pushes paint instead of
//   laying it. The ghost replaced the old ring + angle line (2026-09-23): it
//   shows the size, the angle and the next colour by itself. With Multi-Brush
//   on, #brushCursorArms holds a ghost for every other arm's dab too, each
//   turned the way that arm prints (ghostSet, shared with js/47's popup).
//
// Why a DOM overlay (not a canvas draw): it must sit above the fluid canvas
// AND every layer/UI element and follow the OS pointer with zero sim
// coupling. position:fixed + clientX/clientY sidesteps the
// canvas-internal↔CSS coordinate mismatch entirely.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var canvas = document.getElementById('canvas');
    if (!canvas) return;

    // ── Hotspot (built once) ──────────────────────────────────────────
    // A fixed-size dot at the exact point a dab lands. The ghost around it
    // can be faint, soft-edged or the same colour as the paint under it, so
    // the dot is what the eye finds — and with the ghost switched off it is
    // the whole cursor.
    var el = document.getElementById('brushCursor');
    if (!el) {
        el = document.createElement('div');
        el.id = 'brushCursor';
        document.body.appendChild(el);
    }
    el.style.cssText = 'position:fixed;left:0;top:0;width:12px;height:12px;' +
        'pointer-events:none;z-index:10050;display:none;will-change:transform;';
    el.innerHTML =
        '<svg id="brushCursorDot" viewBox="-6 -6 12 12" width="12" height="12" style="display:block;">' +
        '<circle cx="0" cy="0" r="1.6" fill="#ffffff" stroke="rgba(0,0,0,0.6)" stroke-width="1"/>' +
        '</svg>' +
        // Pressure-mode badge: stands in for the dot while the brush moves
        // paint instead of depositing it.
        '<div id="brushCursorP" style="position:absolute;left:50%;top:50%;' +
        'transform:translate(-50%,-50%);display:none;' +
        'font:700 11px system-ui,sans-serif;color:#fff;line-height:1;' +
        'text-shadow:0 0 3px rgba(0,0,0,0.9),0 1px 1px rgba(0,0,0,0.85);' +
        'user-select:none;">P</div>';

    var dotEl = el.querySelector('#brushCursorDot');
    var pEl = el.querySelector('#brushCursorP');

    // ── Live inputs (read lazily; never captured at load) ─────────────
    function cursorEnabled() {
        var t = document.getElementById('cursorToggle');
        return !t || t.checked; // default on if the toggle isn't in the DOM
    }
    var HEX_RE = /^#[0-9a-fA-F]{6}$/;
    function rgbHex(c) {
        var to = function (v) {
            var h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16);
            return h.length === 1 ? '0' + h : h;
        };
        return '#' + to(c[0]) + to(c[1]) + to(c[2]);
    }
    function paintColorHex() {
        // The colour "about to be painted" — the main picker is the app's live
        // next-colour preview (step/random advance it on mouseup). Fall back to
        // pointer.color (what the in-progress stroke is depositing).
        var cp = document.getElementById('colorPicker');
        if (cp && HEX_RE.test(cp.value)) return cp.value;
        var p = window.pointer;
        if (p && p.color && p.color.length >= 3) return rgbHex(p.color);
        return '#ff0000';
    }
    // The colour Multi-Brush arm i's next dab takes: 05g resolveArmColor, read
    // without its side effect — it draws a Random arm's colour on first use,
    // and that draw belongs to the stroke, not to a hover. Arm 0 and 'main'
    // arms paint the picker's colour.
    function armColorHex(i) {
        var arr = window.multiArmColors, cfg = arr && arr[i];
        if (!i || !cfg || cfg.mode === 'main') return paintColorHex();
        if (cfg.mode === 'fixed') return HEX_RE.test(cfg.color || '') ? cfg.color : '#ffffff';
        if (cfg.cachedColor && cfg.cachedColor.length >= 3) return rgbHex(cfg.cachedColor);
        if (cfg.mode === 'step' && typeof getStepColorList === 'function') {
            var list = getStepColorList() || [];
            var h = list.length ? list[(cfg.stepIndex || 0) % list.length] : null;
            if (HEX_RE.test(h || '')) return h;
        }
        // A Random arm before its first stroke has no colour yet: neutral.
        return cfg.mode === 'random' ? '#ffffff' : paintColorHex();
    }
    function brushAngleDeg() {
        var c = window.config || {};
        return typeof c.BRUSH_ANGLE === 'number' ? c.BRUSH_ANGLE : 0;
    }
    // Arm i pushes paint instead of laying it: the velocity-only brush
    // (whole-brush toggle) or that arm marked as a push arm in the Multi-Brush
    // panel. Not pen pressure — the app deliberately has none.
    function armPushes(i) {
        var c = window.config || {};
        if (c.BRUSH_VELOCITY_ONLY) return true;
        var a = window.multiArmColors;
        return !!(a && a[i] && a[i].push);
    }
    // "Pressure" for the cursor = the active arm (arm 0, the one under the
    // pointer) pushes.
    function pressureActive() { return armPushes(0); }

    // ── Ghost: a faint print of the next dab (2026-09-22) ─────────────
    // What the brush will leave: the selected tip's own footprint at its real
    // size and angle, in the colour about to be painted, so a Chisel or a
    // custom shape can be aimed before any paint goes down. Hidden while a
    // button is held — by then the paint itself is the preview, and a tint
    // over it would misreport its colour.
    //
    // The footprints are the shaders' own, re-derived in their size-normalized
    // frame q = p / √radius (p = offset from the dab centre in canvas-height
    // units): 05b splatFrag for dye, rasterStampFrag for a collider or paint
    // layer. That is what makes the size the real one rather than an
    // eyeballed circle. Per-dab randomness (rim jitter, grain) is drawn at its
    // mean — the ghost is where a dab lands on average, not one roll of it.
    // Viewer-local (localStorage, like the old ring's settings): never
    // preset-carried, never mirrored to a room.
    var GHOST_KEY = 'ui.brushCursorGhost';
    var GHOST_OPACITY_KEY = 'ui.brushCursorGhostOpacity';
    var ghostOn = true;
    var ghostOpacity = 0.3;
    try { if (localStorage.getItem(GHOST_KEY) === '0') ghostOn = false; } catch (_) {}
    try {
        var savedGo = parseFloat(localStorage.getItem(GHOST_OPACITY_KEY));
        if (isFinite(savedGo)) ghostOpacity = clamp01(savedGo);
    } catch (_) {}
    var ghostEl = document.createElement('canvas');
    ghostEl.id = 'brushCursorGhost';
    ghostEl.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;' +
        'display:none;will-change:transform,width,height;';
    // Clipped to the canvas like the arms below: near an edge a big tip used
    // to spill over the sidebar and the strip (usertest 2026-10-03). One
    // layer under the dot (10050), so the hotspot always reads on top.
    var ghostClip = document.createElement('div');
    ghostClip.id = 'brushCursorGhostClip';
    ghostClip.style.cssText = 'position:fixed;left:0;top:0;overflow:hidden;pointer-events:none;' +
        'z-index:10049;display:none;';
    ghostClip.appendChild(ghostEl);
    document.body.appendChild(ghostClip);
    // The other Multi-Brush arms' ghosts (see renderGhost). Clipped to the
    // canvas — an arm that lands off the edge paints nothing — and before
    // the ghost's clip in the DOM, so the ghost under the pointer stays on top.
    var armWrap = document.createElement('div');
    armWrap.id = 'brushCursorArms';
    armWrap.style.cssText = 'position:fixed;left:0;top:0;overflow:hidden;pointer-events:none;' +
        'z-index:10049;display:none;';
    document.body.insertBefore(armWrap, ghostClip);
    var pressed = false;

    var ghostToggle = document.getElementById('brushGhostToggle');
    var ghostOpacityInput = document.getElementById('brushGhostOpacity');
    var ghostOpacityValueEl = document.getElementById('brushGhostOpacityValue');
    function applyGhostOpacity() {
        ghostEl.style.opacity = String(ghostOpacity);
        // On the wrapper, not per arm: overlapping arms read as one print.
        armWrap.style.opacity = String(ghostOpacity);
        if (ghostOpacityValueEl) ghostOpacityValueEl.textContent = Math.round(ghostOpacity * 100) + '%';
        // Greyed while the ghost is off (styles.css dims the row off :disabled).
        if (ghostOpacityInput) ghostOpacityInput.disabled = !ghostOn;
    }
    if (ghostToggle) {
        ghostToggle.checked = ghostOn;
        ghostToggle.addEventListener('change', function () {
            ghostOn = !!ghostToggle.checked;
            try { localStorage.setItem(GHOST_KEY, ghostOn ? '1' : '0'); } catch (_) {}
            if (!ghostOn) { ghostEl.style.display = 'none'; armWrap.style.display = 'none'; ghostClip.style.display = 'none'; }
            applyGhostOpacity();
            requestRender();
        });
    }
    if (ghostOpacityInput) {
        ghostOpacityInput.value = String(Math.round(ghostOpacity * 100));
        ghostOpacityInput.addEventListener('input', function () {
            ghostOpacity = clamp01((parseFloat(ghostOpacityInput.value) || 0) / 100);
            try { localStorage.setItem(GHOST_OPACITY_KEY, String(ghostOpacity)); } catch (_) {}
            applyGhostOpacity();
        });
    }
    applyGhostOpacity();

    function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
    function clamp01(v) { return Math.max(0, Math.min(1, v)); }
    function smoothstep(e0, e1, x) {
        var t = clamp01((x - e0) / (e1 - e0));
        return t * t * (3 - 2 * t);
    }
    // splatFrag's footprint metric per stamp shape (0 blob, 1 chisel,
    // 2 streak), and the half-extents of its rim at the jitter's mean (1.4).
    function tipMetric(shape, x, y) {
        if (shape === 1) { var b = Math.max(Math.abs(x), Math.abs(y)); return b * b; }
        if (shape === 2) { var u = 0.55 * x, v = 2.4 * y; return u * u + v * v; }
        return x * x + y * y;
    }
    function tipExtent(shape) {
        var r = Math.sqrt(1.4) * 1.04;
        return shape === 2 ? [r / 0.55, r / 2.4] : [r, r];
    }

    // The active custom shape's bitmap, decoded here for drawing. Until it
    // decodes the ghost shows nothing — splat() holds its dabs for that same
    // window rather than print the tip underneath, so neither guesses.
    var stampUrl = null, stampImg = null, stampGen = 0;
    function stampBitmap(url) {
        if (url !== stampUrl) {
            stampUrl = url; stampImg = null;
            var img = new Image();
            img.onload = function () {
                if (stampUrl !== url) return;
                stampImg = img; stampGen++;
                requestRender();
            };
            img.src = url;
        }
        return stampImg;
    }
    function activeShapeUrl() {
        var BS = window.BrushShapes;
        var id = BS && BS.activeId();
        if (!id) return null;
        var lst = BS.list() || [];
        for (var i = 0; i < lst.length; i++) if (lst[i].id === id) return lst[i].dataURL || null;
        return null;
    }

    // What the next dab prints: hx/hy = the footprint's half-extents in q,
    // a(x, y) = its coverage there (unrotated: the angle turns the element).
    // `neutral` footprints carry no colour of their own — a push, a collider
    // wall, an eraser — and draw white. null = nothing to show. `arm` is the
    // Multi-Brush arm whose dab this is (default 0, the one under the pointer):
    // only whether it pushes differs between arms.
    var PUSH_SPEC = { key: 'push', hx: 2.1, hy: 2.1, neutral: true,
                      a: function (x, y) { return Math.exp(-(x * x + y * y)); } };
    function ghostSpec(arm) {
        var c = window.config;
        if (!c) return null;
        var target = c.BRUSH_TARGET || 'fluid';
        var raster = target === 'mask' || target === 'sketch';
        var neutralRaster = target === 'mask' || !!c.BRUSH_ERASER;
        // Pressure lays no dye, and the tips are dye-only: its push is the
        // velocity pass's plain gaussian whatever tip is selected.
        if (!raster && armPushes(arm | 0)) return PUSH_SPEC;
        // A custom shape overrides the tips on every route (splat() and
        // bindRasterStamp share its mapping, at the full radius).
        var url = activeShapeUrl();
        if (url) {
            var img = stampBitmap(url);
            if (!img) return null;
            var asp = (img.naturalWidth || 1) / (img.naturalHeight || 1);
            return { key: 'stamp|' + stampGen, img: img, neutral: raster && neutralRaster,
                     hx: asp >= 1 ? 1.6 : 1.6 * asp, hy: asp >= 1 ? 1.6 / asp : 1.6 };
        }
        if (raster) {
            // rasterStampFrag's disc, at the halved radius that path uses:
            // r2 = |p|² / (0.5·radius) = 2|q|².
            var hard = clamp01(num(c.BRUSH_HARDNESS, 0.8));
            return { key: 'disc|' + hard.toFixed(2), hx: 0.9, hy: 0.9, neutral: neutralRaster,
                     a: function (x, y) {
                         var r2 = 2 * (x * x + y * y);
                         var soft = Math.exp(-3 * r2), h = 1 - smoothstep(0.72, 1, r2);
                         return soft + (h - soft) * hard;
                     } };
        }
        var tip = c.BRUSH_TIP | 0;
        if (tip >= 1 && tip <= 3) {
            // Blob / Chisel / Streak: Texture softens the rim, never the shape.
            var shape = tip - 1;
            var t = clamp01(num(c.BRUSH_TIP_TEXTURE, 0.7));
            var edge = 0.06 + 0.22 * t;
            var ext = tipExtent(shape);
            return { key: 'tip|' + shape + '|' + t.toFixed(2), hx: ext[0], hy: ext[1],
                     a: function (x, y) { return 1 - smoothstep(1.4 * (1 - edge), 1.4, tipMetric(shape, x, y)); } };
        }
        if (tip === 4) {
            // Ring: band² = 0.08·radius at 0.75·√radius.
            return { key: 'ring', hx: 1.35, hy: 1.35,
                     a: function (x, y) {
                         var rr = Math.sqrt(x * x + y * y) - 0.75;
                         return Math.exp(-(rr * rr) / 0.08);
                     } };
        }
        // Soft — unless a material mode is blending its clay stamp in.
        var sn = clamp01(num(c.STAMP_NOISE, 0));
        if (sn > 0) {
            var ss = Math.max(0, Math.min(2, c.STAMP_SHAPE | 0));
            var se = tipExtent(ss);
            return { key: 'clay|' + ss + '|' + sn.toFixed(2),
                     hx: Math.max(sn < 1 ? 2.1 : 0, se[0]), hy: Math.max(sn < 1 ? 2.1 : 0, se[1]),
                     a: function (x, y) {
                         var g = Math.exp(-(x * x + y * y));
                         var st = 1 - smoothstep(1.4 * 0.72, 1.4, tipMetric(ss, x, y));
                         return g + (st - g) * sn;
                     } };
        }
        return { key: 'soft', hx: 2.1, hy: 2.1,
                 a: function (x, y) { return Math.exp(-(x * x + y * y)); } };
    }

    // Rasterize the footprint at D px per q unit into a white mask canvas.
    function buildGhostMask(mask, spec, D) {
        var W = Math.max(2, Math.ceil(2 * spec.hx * D));
        var H = Math.max(2, Math.ceil(2 * spec.hy * D));
        mask.width = W; mask.height = H;
        var mctx = mask.getContext('2d');
        if (spec.img) {
            // Upright: the stamp is uploaded Y-flipped, which puts the
            // image's top row at the top of the dab.
            mctx.clearRect(0, 0, W, H);
            mctx.drawImage(spec.img, 0, 0, W, H);
            return;
        }
        var im = mctx.createImageData(W, H), d = im.data, a = spec.a;
        var sx = 2 * spec.hx / W, sy = 2 * spec.hy / H;
        for (var j = 0, o = 0; j < H; j++) {
            var y = (j + 0.5) * sy - spec.hy;
            for (var i = 0; i < W; i++, o += 4) {
                d[o] = d[o + 1] = d[o + 2] = 255;
                d[o + 3] = Math.round(255 * clamp01(a((i + 0.5) * sx - spec.hx, y)));
            }
        }
        mctx.putImageData(im, 0, 0);
    }

    // √radius in canvas-height units: × a surface's CSS height of the canvas
    // gives that surface's CSS px per q unit.
    function radiusRoot() {
        var c = window.config || {};
        return Math.sqrt(Math.max(0, num(c.SPLAT_RADIUS, 0.011) * num(c.STAMP_RADIUS_SCALE, 1)));
    }

    // Rasterized footprints (white, alpha = coverage), keyed by footprint and
    // density and holding the newest `cap`. One store serves every painter on
    // a surface, so eight arms cost one rasterize, not eight; a surface shows
    // at most two footprints at once (the paint and a push arm's).
    function maskStore(cap) {
        var masks = Object.create(null), order = [];
        return function (spec, D) {
            var key = spec.key + '|' + D;
            var m = masks[key];
            if (!m) {
                m = document.createElement('canvas');
                buildGhostMask(m, spec, D);
                m.ghostKey = key;
                masks[key] = m;
                order.push(key);
                while (order.length > cap) delete masks[order.shift()];
            }
            return m;
        };
    }

    // A painter owns one <canvas> — the main cursor's, one per Multi-Brush
    // arm, or the Pen Input Window's (js/47) — and tints it from a mask store:
    // `masks` when given (painters on one surface share one), else its own,
    // so two surfaces at different sizes never make each other re-rasterize.
    // The target may live in another same-origin document.
    //   paint(spec, k, dpr, x, y, opt): draw `spec` for a surface showing k
    //   CSS px per q unit at device ratio dpr, centred on (x, y) in the
    //   target's containing block. opt (all optional): color (default: the
    //   next paint colour; neutral specs are always white), angle in degrees
    //   (default: the brush's), flip (mirror the tip in its own frame first,
    //   as a mirrored Multi-Brush arm prints it).
    //   hide(): take it off screen.
    function ghostPainter(target, masks) {
        if (!masks) masks = maskStore(1);
        var shapeKey = '', tint = '';
        function hide() { if (target.style.display !== 'none') target.style.display = 'none'; }
        function paint(spec, k, dpr, x, y, opt) {
            opt = opt || {};
            if (!spec || !(k > 0)) { hide(); return; }
            // Mask resolution: the next power of two over the on-screen density
            // (so it only re-rasterizes when the size crosses an octave),
            // bounded so a huge brush can't make one rebuild expensive.
            var want = k * (dpr || 1), D = 16;
            while (D < want && D < 256) D *= 2;
            while (D > 16 && 4 * spec.hx * spec.hy * D * D > 600000) D /= 2;
            var mask = masks(spec, D);
            if (mask.ghostKey !== shapeKey) {
                shapeKey = mask.ghostKey;
                tint = '';
            }
            var col = spec.neutral ? '#ffffff' : (opt.color || paintColorHex());
            if (col !== tint) {
                var W = mask.width, H = mask.height;
                if (target.width !== W) target.width = W;
                if (target.height !== H) target.height = H;
                var g = target.getContext('2d');
                g.globalCompositeOperation = 'copy';
                g.drawImage(mask, 0, 0);
                g.globalCompositeOperation = 'source-in';
                g.fillStyle = col;
                g.fillRect(0, 0, W, H);
                g.globalCompositeOperation = 'source-over';
                tint = col;
            }
            target.style.width = (2 * spec.hx * k) + 'px';
            target.style.height = (2 * spec.hy * k) + 'px';
            // CSS rotate() is clockwise on screen — the same sense the shader's
            // stampAngle turns the stamp, so ghost and painted streak agree.
            // Transforms apply right to left: scaleX(-1) mirrors the tip in
            // its own frame before the turn, as splatFrag's stampFlip does.
            var ang = (typeof opt.angle === 'number') ? opt.angle : brushAngleDeg();
            target.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) ' +
                'rotate(' + ang + 'deg)' + (opt.flip ? ' scaleX(-1)' : '');
            if (target.style.display !== 'block') target.style.display = 'block';
        }
        return { paint: paint, hide: hide, tint: function () { return tint; } };
    }

    // ── Multi-Brush arms (2026-09-25) ─────────────────────────────────
    // A Multi-Brush stroke lays one dab per symmetry transform (05g
    // multiSplat), so the ghost shows every one: the footprint at each arm's
    // landing spot, turned (and on a mirrored arm, mirrored) the way that arm
    // prints it (05g armStampTurn), in that arm's colour — or the push
    // footprint on an arm marked Pressure. The transforms are 05g's own list,
    // so ghost and paint can't disagree about a layout; a rake's bristle line
    // is the heading the last stroke left, which is what the next press
    // inherits.

    // A left button bound to "mirror brushstroke" folds its mirror into the
    // stroke it starts (41 pins it at the press), so the preview folds it in.
    function hoverMirror() {
        var BM = window.ButtonModes;
        var s = (BM && typeof BM.side === 'function') ? BM.side('left') : null;
        if (!s || s.mode !== 'mirror' || typeof BM.mirrorCode !== 'function') return 0;
        return BM.mirrorCode(s.mirror) || 1;
    }
    // The transforms a stroke from here would paint through, or null when it
    // is one plain dab (mask and sketch strokes never fan out over the arms).
    function armTransforms() {
        var c = window.config;
        var st = window.symmetryTransforms;
        if (!c || typeof st !== 'function') return null;
        var target = c.BRUSH_TARGET || 'fluid';
        if (target === 'mask' || target === 'sketch') return null;
        var n = (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
        // No travel (dx = dy = 0), like a press: rake reads its carried
        // heading and nothing in 05g is advanced by the call.
        var list = st(c.SYMMETRY_MODE, n, 0, 0, hoverMirror());
        return (list && list.length) ? list : null;
    }
    function isIdentity(m) {
        return Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-6 &&
               Math.abs(m[3]) < 1e-9 && Math.abs(m[4] - 1) < 1e-9 && Math.abs(m[5]) < 1e-6;
    }
    // How arm `m` prints the tip: its angle in degrees and whether mirrored.
    // 05g armStampTurn gives the arm's rotation φ (null = every arm keeps the
    // brush's angle); the dab prints at φ + angle, or mirrored at φ − angle.
    // Same arithmetic as splat() (05i), so ghost and paint agree.
    function armPose(m, angleDeg) {
        var turn = (typeof window.armStampTurn === 'function') ? window.armStampTurn(m) : null;
        if (typeof turn !== 'number') return { angle: angleDeg, flip: false };
        var t = turn * 180 / Math.PI;
        var flip = (m[0] * m[4] - m[1] * m[3]) < 0;
        return { angle: flip ? t - angleDeg : t + angleDeg, flip: flip };
    }

    // Everything one surface needs to show the whole brush: the dab under the
    // pointer on `mainTarget`, every other arm's on canvases pooled in
    // `armHost` — a position:fixed box this lays over the canvas and that
    // clips to it (an arm landing off the edge paints nothing). The main
    // window and the Pen Input Window (js/47) each own one; the host may live
    // in another same-origin document.
    //   paint(on, k, dpr, x, y, box): the pointer at (x, y) in the surface's
    //   viewport, box = {left, top, width, height} where the canvas sits
    //   there, k = CSS px per q unit (radiusRoot() × box.height). on = false
    //   hides it all.
    //   hide()
    // mainClip (optional): a position:fixed box holding mainTarget that this
    // lays over the canvas and that clips to it, as armHost does for the arms,
    // so the dab under the pointer can't spill onto the UI around the canvas.
    function ghostSet(mainTarget, armHost, mainClip) {
        var masks = maskStore(2);
        var main = ghostPainter(mainTarget, masks);
        var arms = [];
        var hostBox = '', clipBox = '';
        // Where the main ghost is drawn: the pointer itself, or relative to
        // its clip once that sits over the canvas box.
        function mainPoint(x, y, box) {
            if (!mainClip) return { x: x, y: y };
            var bk = box.left + ',' + box.top + ',' + box.width + ',' + box.height;
            if (bk !== clipBox) {
                clipBox = bk;
                mainClip.style.transform = 'translate(' + box.left + 'px,' + box.top + 'px)';
                mainClip.style.width = box.width + 'px';
                mainClip.style.height = box.height + 'px';
            }
            if (mainClip.style.display !== 'block') mainClip.style.display = 'block';
            return { x: x - box.left, y: y - box.top };
        }
        function armPainter(i) {
            if (!arms[i]) {
                var cv = armHost.ownerDocument.createElement('canvas');
                cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;' +
                    'display:none;will-change:transform,width,height;';
                armHost.appendChild(cv);
                arms[i] = ghostPainter(cv, masks);
            }
            return arms[i];
        }
        function hideArms(from) {
            for (var i = from; i < arms.length; i++) arms[i].hide();
            if (!from && armHost.style.display !== 'none') armHost.style.display = 'none';
        }
        function hide() {
            main.hide(); hideArms(0);
            if (mainClip && mainClip.style.display !== 'none') mainClip.style.display = 'none';
        }
        function paint(on, k, dpr, x, y, box) {
            if (!on) { hide(); return; }
            var mp = mainPoint(x, y, box);
            // The pointer in multiSplat's frame: MAIN-canvas px relative to its
            // centre, through the box (as 02 getCanvasCoordinates maps a press;
            // the pen window's box is the same canvas, letterboxed).
            var W = canvas.width, H = canvas.height;
            var sx = box.width ? W / box.width : 1, sy = box.height ? H / box.height : 1;
            var rx = (x - box.left) * sx - W * 0.5;
            var ry = (y - box.top) * sy - H * 0.5;
            var list = armTransforms();
            // Stay oriented to the center: the pose the next dab would take
            // here, asked without moving the carried pose (05g
            // faceCenterTurn). Fluid strokes only, like the arms.
            var A = brushAngleDeg();
            if (list && typeof window.faceCenterTurn === 'function') {
                A += window.faceCenterTurn(rx + W * 0.5, ry + H * 0.5, false) * 180 / Math.PI;
            }
            if (!list || (list.length === 1 && isIdentity(list[0].m))) {
                main.paint(ghostSpec(0), k, dpr, mp.x, mp.y, { angle: A });
                hideArms(0);
                return;
            }
            var bk = box.left + ',' + box.top + ',' + box.width + ',' + box.height;
            if (bk !== hostBox) {
                hostBox = bk;
                armHost.style.transform = 'translate(' + box.left + 'px,' + box.top + 'px)';
                armHost.style.width = box.width + 'px';
                armHost.style.height = box.height + 'px';
            }
            var underPointer = false, used = 0;
            for (var i = 0; i < list.length; i++) {
                var m = list[i].m, arm = list[i].arm;
                var pose = armPose(m, A);
                var opt = { color: armColorHex(arm), angle: pose.angle, flip: pose.flip };
                // The unmoved dab is the one under the pointer: the main ghost.
                // (An even rake has none — its bristles straddle the pointer.)
                if (!underPointer && isIdentity(m)) {
                    underPointer = true;
                    main.paint(ghostSpec(arm), k, dpr, mp.x, mp.y, opt);
                    continue;
                }
                var fx = m[0] * rx + m[1] * ry + m[2] + W * 0.5;
                var fy = m[3] * rx + m[4] * ry + m[5] + H * 0.5;
                armPainter(used++).paint(ghostSpec(arm), k, dpr, fx / sx, fy / sy, opt);
            }
            if (!underPointer) main.hide();
            hideArms(used);
            if (used && armHost.style.display !== 'block') armHost.style.display = 'block';
        }
        return { paint: paint, hide: hide };
    }

    var mainGhost = ghostSet(ghostEl, armWrap, ghostClip);
    function renderGhost(x, y) {
        var r = canvas.getBoundingClientRect();
        mainGhost.paint(ghostOn && !pressed, radiusRoot() * r.height,
            window.devicePixelRatio || 1, x, y, r);
    }

    // A held stroke lock (js/56) keeps the brush on a circle or a spoke round
    // the canvas centre while the hand wanders: the cursor shows where the
    // paint goes, not where the hand is.
    function brushAt(x, y) {
        var L = window.StrokeLock;
        return (L && L.shaping()) ? L.clientPoint(x, y) : { x: x, y: y };
    }

    // ── Render loop (runs only while hovering) ────────────────────────
    var lastX = 0, lastY = 0, visible = false, rafId = 0;
    // The pointer the cursor follows, or null for "whatever moves". Set by the
    // Pen Input Window (js/47) and the phone mouse (js/55) while theirs is
    // over the surface: the cursor then tracks that pointer only — a mouse
    // crossing the main canvas neither moves it nor gets its own cursor
    // hidden (see show()).
    var owner = null;
    function ownedBy(e) { return owner == null || (e && e.pointerId === owner); }

    function render() {
        rafId = 0;
        if (!visible) return;
        if (!cursorEnabled()) { hide(); return; }

        var at = brushAt(lastX, lastY);
        el.style.transform = 'translate(' + at.x + 'px,' + at.y + 'px) translate(-50%,-50%)';

        // Pressure mode swaps the dot for the P badge — the brush moves paint
        // rather than depositing a colour.
        var pOn = pressureActive();
        if (pEl) pEl.style.display = pOn ? 'block' : 'none';
        // 'block', never '': an inline <svg> sits on the text baseline and
        // would drift off the hotspot by the font's descent.
        if (dotEl) dotEl.style.display = pOn ? 'none' : 'block';

        renderGhost(at.x, at.y);

        rafId = requestAnimationFrame(render);
    }
    function requestRender() {
        if (!rafId) rafId = requestAnimationFrame(render);
    }
    function show() {
        if (!cursorEnabled()) return;
        if (!visible) {
            visible = true;
            el.style.display = 'block';
            // Hide the OS arrow over the drawing surface so only the brush
            // cursor shows. Inline style beats the stylesheet default; when Show
            // Cursor is off the canvas already carries cursor:none via
            // .hide-cursor. Not when a remote pen owns the cursor: the arrow
            // over the canvas is then the MOUSE, which is still in use.
            if (owner == null) canvas.style.cursor = 'none';
            else if (canvas.style.cursor === 'none') canvas.style.cursor = '';
        }
        requestRender();
    }
    function hide() {
        visible = false;
        el.style.display = 'none';
        ghostEl.style.display = 'none';
        armWrap.style.display = 'none';
        ghostClip.style.display = 'none';
        if (canvas.style.cursor === 'none') canvas.style.cursor = '';
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    canvas.addEventListener('pointerenter', function (e) {
        if (!ownedBy(e)) return;
        lastX = e.clientX; lastY = e.clientY;
        show();
    });
    canvas.addEventListener('pointermove', function (e) {
        if (!ownedBy(e)) return;
        lastX = e.clientX; lastY = e.clientY;
        // A move with no button down means no stroke, whatever the up
        // listeners below missed — the ghost can never stay stuck hidden.
        if (!e.buttons) pressed = false;
        if (!visible) show(); else requestRender();
    });
    canvas.addEventListener('pointerleave', function (e) { if (ownedBy(e)) hide(); });
    // The ghost steps aside while a button is held (see renderGhost).
    canvas.addEventListener('pointerdown', function (e) {
        if (!ownedBy(e)) return;
        pressed = true;
        requestRender();
    });
    function release(e) {
        if (!ownedBy(e) || !pressed) return;
        pressed = false;
        requestRender();
    }
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    // Pointer capture during a stroke can suppress leave — a global up re-checks.
    // Not while a remote pen owns the cursor: this window losing focus says
    // nothing about a pen that is drawing through the Pen Input Window.
    window.addEventListener('blur', function () { if (owner == null) hide(); });

    // React live to the Show Cursor toggle without needing a mouse move.
    var toggle = document.getElementById('cursorToggle');
    if (toggle) {
        toggle.addEventListener('change', function () {
            if (!toggle.checked) hide();
        });
    }

    // Expose for other modules / debugging. setOwner(pointerId|null): the
    // Pen Input Window hands the cursor to its pen while the pen is over the
    // surface and gives it back (null) when it leaves. The ghost* members let
    // it draw the same ghost in its popup: ghostSet(main, armHost) is the
    // whole Multi-Brush ghost, ghostEnabled() is Show Brush Ghost, and
    // ghostSpec() is null while that is off.
    window.__brushCursor = {
        show: show, hide: hide, el: el, ghost: ghostEl,
        ghostSpec: function () { return ghostOn ? ghostSpec() : null; },
        ghostEnabled: function () { return ghostOn; },
        ghostPainter: ghostPainter,
        ghostSet: ghostSet,
        ghostOpacity: function () { return ghostOpacity; },
        radiusRoot: radiusRoot,
        setOwner: function (id) {
            owner = (id == null) ? null : id;
            if (owner != null && canvas.style.cursor === 'none') canvas.style.cursor = '';
            if (owner == null && visible && cursorEnabled()) canvas.style.cursor = 'none';
        },
        owner: function () { return owner; }
    };
})();
