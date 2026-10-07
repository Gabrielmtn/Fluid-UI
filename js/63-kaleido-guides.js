// ═══════════════════════════════════════════════════════════════════
// js/63-kaleido-guides.js — Kaleidoscope → Show Guides
// LOAD ORDER: after 34-mandala-mode.js (reads window.MandalaStudio lazily)
// PROVIDES: the #kaleidoGuides overlay in #canvas-wrapper, one step above
//   the canvas like Mandala Studio's guides (34), so Zoom View carries it
//   and the side panels stay on top. Off unless Show Guides is ticked.
//   window.KaleidoGuides (shown / paint / onFrame), so the Pen Input
//   Window (47) draws the same marks over its own box.
// REQUIRES: #kaleidoShowGuides (index.html, inside #kaleidoPanel); the
//   kaleido globals 05f publishes. They are read every frame, so it does
//   not matter that 05f (a deferred chunk) runs after this file.
//
// Two kinds of mark, read off the display shader (05a kaleidoWedge,
// mirrorLayers, quadReflections, spiralRings), not assumed:
//   FOLD    where the picture mirrors. It turns with kAngle, so a spin,
//           the Angle slider or the audio mapping turns it too.
//   SOURCE  the part of the canvas the folded picture is copied from. It
//           sits in the paint's own frame and holds still while the fold
//           turns: paint there and it shows in every copy; at full
//           Opacity, paint anywhere else is never on screen.
// Each is drawn in the shader's own coordinates and put on screen by one
// SVG matrix, so a spin rewrites one attribute, not the marks. Frames:
//   paint  p = (uv - 0.5) · ks, y up. ks makes the short side 1 for Wedge
//          when it folds isotropically (config.KALEIDO_ISOTROPIC); the
//          other modes, and Wedge with that switch off, fold per-axis UV.
//   fold   q = R(-kAngle) · p, the shader's mat2(ca, -sa, sa, ca).
//   screen (W/2, H/2) + diag(sx, -sy) · R(kAngle) · q, with (sx, sy) the
//          px per unit: (S, S) isotropic (S = short side), else (W, H).
// Mandala Studio draws its own guides (the wedge, its seams, the rings),
// so these step aside while it is on. Captures never include them: the
// overlay is DOM, and neither the picture nor the video path reads it.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const cb = document.getElementById('kaleidoShowGuides');
    const canvas = document.getElementById('canvas');
    const wrapper = document.getElementById('canvas-wrapper');
    if (!cb || !canvas || !wrapper) return;

    const KEY = 'kaleido.showGuides';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    // Each mark twice, a dark halo under a light line (as 56 does), so it
    // reads on pale paint and on black alike. The source is Mandala's blue.
    const HALO = 'rgba(0,0,0,0.35)';
    const FOLD = 'rgba(255,255,255,0.5)';
    const SOURCE_FILL = 'rgba(120,200,255,0.10)';
    const SOURCE_EDGE = 'rgba(130,205,255,0.85)';
    // Fold lines closer than this are a hatch, not a guide (Mirror Quad
    // doubles them per step: 8 reflections at 1.0 zoom are 1/128 apart).
    const MIN_GAP_PX = 8;
    // A twisted seam is a spiral, drawn as a polyline this many radians a
    // step: under half a px off the curve at the rim of a 1000 px canvas.
    const TWIST_STEP = 0.06;
    const NS = ' fill="none" vector-effect="non-scaling-stroke"';

    function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
    function f(v) { return +v.toFixed(5); }

    // What the display pass is drawing, with 05j's fallbacks and the
    // shader's clamps.
    function readState() {
        return {
            mode: num(window.kaleidoMode, 1),
            n: Math.max(1, window.kaleidoSegments || 1),
            angle: window.kAngle || 0,
            twist: window.kTwist || 0,
            zoom: Math.max(0.0001, window.kZoom || 1),
            iso: !(window.config && window.config.KALEIDO_ISOTROPIC === false)
        };
    }

    function shows() {
        if (!cb.checked || !window.kaleidoEnabled) return false;
        if (num(window.kaleidoMode, 1) === 0) return false;      // Mode: Off
        if (num(window.kBlend, 1) <= 0) return false;            // nothing mirrored on screen
        return !(window.MandalaStudio && window.MandalaStudio.active());
    }

    // Px per paint unit and the fold-frame radius past every corner.
    function frameOf(s, W, H) {
        if (s.mode === 1 && s.iso) {
            const S = Math.min(W, H);
            return { sx: S, sy: S, reach: 1.02 * Math.hypot(W, H) / (2 * S) };
        }
        return { sx: W, sy: H, reach: 1.02 * Math.SQRT1_2 };
    }

    // The sector of angles 0..h out to radius Rs (paint units), folded into
    // the canvas (half-extents ax, ay) the way kMirrorWrap folds a texture
    // read: 1 - |mod(uv, 2) - 1| per axis, so image k along an axis is
    // x → (-1)^k · (x - 2k·ax). One path, every image a subpath, each wound
    // the same way so the default nonzero fill takes their union without
    // doubling the tint where they overlap.
    function wrappedSector(h, Rs, ax, ay) {
        const pts = [[0, 0]];
        const steps = Math.max(2, Math.ceil(h / 0.035));
        for (let i = 0; i <= steps; i++) {
            const t = h * i / steps;
            pts.push([Rs * Math.cos(t), Rs * Math.sin(t)]);
        }
        const kx = Math.ceil(Math.max(0, Rs - ax) / (2 * ax));
        const ky = Math.ceil(Math.max(0, Rs - ay) / (2 * ay));
        let d = '';
        for (let i = -kx; i <= kx; i++) {
            for (let j = -ky; j <= ky; j++) {
                const sx = (i % 2) ? -1 : 1, sy = (j % 2) ? -1 : 1;
                let img = pts.map(function (p) { return [sx * (p[0] - 2 * i * ax), sy * (p[1] - 2 * j * ay)]; });
                if (sx * sy < 0) img = img.reverse();      // a reflection flips the winding
                d += 'M' + img.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + 'Z';
            }
        }
        return d;
    }

    // ── The marks for one state over a W×H box ───────────────────────
    // { fold, source, edge }: markup in fold units (fold) and paint units
    // (source fill below the fold, its edge above it).
    function marks(s, W, H) {
        const fr = frameOf(s, W, H), R = fr.reach, n = s.n;
        const pxPerUnit = Math.min(fr.sx, fr.sy);
        let foldD = '', srcD = '', edgeD = '';

        if (s.mode === 1) {
            // Wedge: the fold turns back every half facet, h. With Twist the
            // angle gains r·kTwist first (r = |p|·kZoom), so seam j runs
            // along θ = j·h - |q|·kZoom·kTwist: a spiral, straight at 0.
            const h = Math.PI / n;
            const k = s.zoom * s.twist;
            const steps = Math.min(240, Math.max(1, Math.ceil(Math.abs(k) * R / TWIST_STEP)));
            for (let j = 0; j < 2 * n; j++) {
                foldD += 'M0 0';
                for (let i = 1; i <= steps; i++) {
                    const rho = R * i / steps, th = j * h - rho * k;
                    foldD += 'L' + f(rho * Math.cos(th)) + ' ' + f(rho * Math.sin(th));
                }
            }
            // Source: paint angles 0..h out to radius |p|·kZoom, whatever
            // kAngle is (34's header measures it). Where that slice runs off
            // the canvas the shader reads the canvas's mirror image instead
            // (05a kMirrorWrap), so the slice is folded back in the same way:
            // a far corner of the picture comes from just outside the slice,
            // near an edge. Measured on a tall canvas, 6 facets: a dot at
            // 0.3 of the short side made the 12 copies, and the corners past
            // half the short side held 8 more, read through the fold.
            // The radius is the farthest the canvas reaches (a corner) times
            // kZoom: past it nothing is read, which shows below 1.0 zoom.
            const ax = W / (2 * fr.sx), ay = H / (2 * fr.sy);
            srcD = wrappedSector(h, s.zoom * Math.hypot(ax, ay), ax, ay);
            edgeD = srcD;
        } else if (s.mode === 2 || s.mode === 3) {
            // Mirror H / V: u = q·kZoom folds back at 0 and wherever |u| + 0.5
            // is a whole number of layers (1/n each). The source is the middle
            // layer, across the whole canvas the other way.
            const L = 1 / n, horiz = s.mode === 2;
            const line = horiz
                ? function (x) { return 'M' + f(x) + ' ' + f(-R) + 'V' + f(R); }
                : function (y) { return 'M' + f(-R) + ' ' + f(y) + 'H' + f(R); };
            if (L / 2 / s.zoom * pxPerUnit >= MIN_GAP_PX) {
                foldD += line(0);
                for (let m = Math.ceil(n / 2); ; m++) {
                    const u = m * L - 0.5;
                    if (u / s.zoom > R) break;
                    if (u > 1e-9) foldD += line(u / s.zoom) + line(-u / s.zoom);
                }
            }
            const a = f(L / 2);
            srcD = horiz ? 'M-' + a + ' -0.51H' + a + 'V0.51H-' + a + 'Z'
                         : 'M-0.51 -' + a + 'V' + a + 'H0.51V-' + a + 'Z';
            edgeD = horiz ? 'M-' + a + ' -0.51V0.51M' + a + ' -0.51V0.51'
                          : 'M-0.51 -' + a + 'H0.51M-0.51 ' + a + 'H0.51';
        } else if (s.mode === 4) {
            // Mirror Quad: u = q·kZoom·2^(n-1)/2 folds back at every half
            // unit, both axes. The source is the bottom-left quarter, UV
            // [0, 0.5]², since the shader never adds the centre back.
            const gap = 1 / (s.zoom * Math.pow(2, n - 1));
            if (gap * pxPerUnit >= MIN_GAP_PX) {
                const J = Math.floor(R / gap);
                for (let j = -J; j <= J; j++) {
                    const c = f(j * gap);
                    foldD += 'M' + c + ' ' + f(-R) + 'V' + f(R) + 'M' + f(-R) + ' ' + c + 'H' + f(R);
                }
            }
            srcD = 'M-0.51 -0.51H0V0H-0.51Z';
            edgeD = 'M-0.51 0H0V-0.51';
        } else if (s.mode === 5) {
            // Spiral: r = |q|·kZoom folds back at every ring, 0.5/n apart.
            // Twist turns the bands but leaves their edges where they are.
            // The source is the first ring's disc.
            const ring = 0.5 / n, gap = ring / s.zoom;
            if (gap * pxPerUnit >= MIN_GAP_PX) {
                for (let r = gap; r <= R; r += gap) {
                    const rr = f(r);
                    foldD += 'M' + rr + ' 0A' + rr + ' ' + rr + ' 0 1 0 -' + rr + ' 0A' + rr + ' ' + rr + ' 0 1 0 ' + rr + ' 0';
                }
            }
            const rs = f(ring);
            srcD = 'M' + rs + ' 0A' + rs + ' ' + rs + ' 0 1 0 -' + rs + ' 0A' + rs + ' ' + rs + ' 0 1 0 ' + rs + ' 0Z';
            edgeD = srcD;
        }

        const pair = function (d, colour, width) {
            if (!d) return '';
            return '<path d="' + d + '" stroke="' + HALO + '" stroke-width="' + (width + 2) + '"' + NS + '/>' +
                   '<path d="' + d + '" stroke="' + colour + '" stroke-width="' + width + '"' + NS + '/>';
        };
        return {
            source: srcD ? '<path d="' + srcD + '" fill="' + SOURCE_FILL + '"/>' : '',
            fold: pair(foldD, FOLD, 1),
            edge: pair(edgeD, SOURCE_EDGE, 1.5)
        };
    }

    // Paint units → screen, and fold units → screen (the same turned by
    // kAngle). SVG matrix(a b c d e f): X = a·x + c·y + e, Y = b·x + d·y + f.
    function paintMatrix(fr, W, H) {
        return 'matrix(' + [fr.sx, 0, 0, -fr.sy, W / 2, H / 2].map(f).join(' ') + ')';
    }
    function foldMatrix(fr, angle, W, H) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return 'matrix(' + [fr.sx * c, -fr.sy * s, -fr.sx * s, -fr.sy * c, W / 2, H / 2].map(f).join(' ') + ')';
    }

    // ── Painting into a group ────────────────────────────────────────
    // The marks for a W×H box laid over the whole canvas, drawn into SVG
    // group `g` of any same-origin document: here the overlay below, and the
    // Pen Input Window (47) over its own box. The group keeps what it was
    // drawn for, so a spin rewrites one matrix and anything else rebuilds.
    // `angle` overrides kAngle: 47 passes the one its mirror last copied,
    // so the fold turns with the picture it is drawn over.
    function paintInto(g, W, H, angle) {
        let st = g.__kaleidoGuide;
        if (!st) {
            const doc = g.ownerDocument;
            const mk = function (tag) { const e = doc.createElementNS(SVG_NS, tag); g.appendChild(e); return e; };
            st = g.__kaleidoGuide = {
                source: mk('g'), fold: mk('g'), edge: mk('g'), dot: mk('circle'),
                built: '', turned: ''
            };
            st.dot.setAttribute('r', '2.5');
            st.dot.setAttribute('fill', 'rgba(255,255,255,0.55)');
            st.dot.setAttribute('stroke', HALO);
        }
        const s = readState();
        if (typeof angle === 'number' && isFinite(angle)) s.angle = angle;
        const fr = frameOf(s, W, H);
        const key = [s.mode, s.n, s.twist, s.zoom, s.iso, W, H].join(',');
        if (key !== st.built) {
            const m = marks(s, W, H);
            const pm = paintMatrix(fr, W, H);
            st.source.setAttribute('transform', pm);
            st.edge.setAttribute('transform', pm);
            st.source.innerHTML = m.source;
            st.fold.innerHTML = m.fold;
            st.edge.innerHTML = m.edge;
            st.dot.setAttribute('cx', W / 2);
            st.dot.setAttribute('cy', H / 2);
            st.built = key;
            st.turned = '';
        }
        const fm = foldMatrix(fr, s.angle, W, H);
        if (fm !== st.turned) { st.fold.setAttribute('transform', fm); st.turned = fm; }
    }

    // ── The overlay ──────────────────────────────────────────────────
    let svg = null, root = null;
    let box = null;          // the canvas's CSS box, re-read after a resize or restyle
    let pending = false;     // a frame is asked for
    const frameListeners = [];

    function ensure() {
        if (svg) return;
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.id = 'kaleidoGuides';
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;pointer-events:none;display:none;';
        root = document.createElementNS(SVG_NS, 'g');
        svg.appendChild(root);
        wrapper.appendChild(svg);
    }

    function readBox() {
        // Ride one step above the canvas rather than a fixed z: the layer
        // stack gives the sim canvas its z-index at runtime (see 34).
        const cz = parseInt(getComputedStyle(canvas).zIndex, 10);
        box = { W: canvas.offsetWidth, H: canvas.offsetHeight,
                L: canvas.offsetLeft, T: canvas.offsetTop, z: (isFinite(cz) ? cz : 2) + 1 };
        svg.style.left = box.L + 'px';
        svg.style.top = box.T + 'px';
        svg.style.width = box.W + 'px';
        svg.style.height = box.H + 'px';
        svg.style.zIndex = String(box.z);
        svg.setAttribute('viewBox', '0 0 ' + box.W + ' ' + box.H);
    }

    function hide() {
        if (svg && svg.style.display !== 'none') svg.style.display = 'none';
    }

    function draw() {
        ensure();
        if (!box) readBox();
        if (!(box.W > 0) || !(box.H > 0)) { hide(); return; }
        paintInto(root, box.W, box.H);
        if (svg.style.display !== 'block') svg.style.display = 'block';
    }

    function tellFrame() {
        for (let i = 0; i < frameListeners.length; i++) {
            try { frameListeners[i](); } catch (e) { console.warn('[KaleidoGuides] frame listener failed', e); }
        }
    }

    // Once a frame while the box is ticked: the fold follows kAngle however
    // it moves (spin, slider, audio, a preset, a room's look), and every
    // other input is one comparison. Unticked, the loop stops.
    function frame() {
        pending = false;
        if (!cb.checked) { hide(); tellFrame(); return; }
        if (shows()) draw(); else hide();
        tellFrame();
        schedule();
    }
    // The next frame is asked for from a task, not from inside this
    // callback, so it queues behind 05j's update(), which asks from inside
    // its own. The fold is then read after the frame's spin step and turns
    // with the picture under it; asked from here it ran first and trailed
    // a spin by a frame (3° at 180°/s on a 60 Hz screen).
    function schedule() {
        if (pending) return;
        pending = true;
        setTimeout(function () { requestAnimationFrame(frame); }, 0);
    }
    function kick() {
        if (cb.checked) schedule(); else hide();
    }

    const restyle = function () { box = null; };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(restyle).observe(canvas);
    // Reordering layers rewrites the canvas's inline z-index (see 34).
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(restyle).observe(canvas, { attributes: true, attributeFilter: ['style'] });
    }
    window.addEventListener('resize', restyle);

    // A viewer's choice for this window, never part of a look: it is not in
    // the param registry, so presets, Mutate and rooms leave it alone.
    try {
        const m = window.settingsManager;
        cb.checked = !!(m && m.get(KEY) === true);
    } catch (_) {}
    cb.addEventListener('change', function () {
        try { if (window.settingsManager) window.settingsManager.set(KEY, !!cb.checked); } catch (_) {}
        kick();
    });
    kick();

    // For other surfaces (the Pen Input Window, 47). Show Guides is the ask
    // for these guides anywhere; that window can still hide them for itself.
    //   shown()                whether they are up right now
    //   paint(g, W, H, angle?) draw them into group g for a W×H box over the
    //                          canvas; false (g untouched) while not shown
    //   onFrame(fn)            fn after each frame's guides, while ticked
    window.KaleidoGuides = {
        shown: shows,
        paint: function (g, W, H, angle) {
            if (!g || !(W > 0) || !(H > 0) || !shows()) return false;
            paintInto(g, W, H, angle);
            return true;
        },
        onFrame: function (fn) { if (typeof fn === 'function') frameListeners.push(fn); }
    };
})();
