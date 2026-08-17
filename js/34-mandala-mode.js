// ═══════════════════════════════════════════════════════════════════
// js/34-mandala-mode.js — Mandala Studio
// LOAD ORDER: last (after 05f-kaleido-controls.js and 05g-arm-colors.js)
// PROVIDES: a radial-symmetry PAINTING rig — you paint one wedge, the
//   kaleido display mirrors it into a full mandala. Auto-rigs kaleido +
//   a painterly sim, draws a guide overlay marking the one paintable
//   wedge, constrains strokes to it, and captures a clean PNG.
// REQUIRES: kaleido controls (05f), global multiSplat (05g), sim sliders
//   (densityDissipation, velocityInfluence, wetInfluence, wetDrying),
//   multiplier slider (05e)
//
// GEOMETRY (verified against the running shader, not assumed):
//   kaleidoWedge() folds the TEXTURE-space angle of each screen point to
//       a_out = |mod(θ - kAngle, segAngle) - segAngle/2|   ∈ [0, segAngle/2]
//   and samples the dye there at the unchanged radius. Two consequences
//   drive this whole file:
//   1. Only dye lying at texture angles [0, segAngle/2] is ever displayed
//      — that wedge is the source, and it does NOT move with kAngle.
//      Everything painted outside it is invisible under the fold, which
//      is exactly what "Paint Only In Wedge" enforces.
//   2. What you paint appears under your cursor only where a_out == θ,
//      which holds across the whole wedge iff kAngle ≡ segAngle/2. At
//      kAngle = 0 the wedge instead renders its own mirror, so strokes
//      crawl away from the pen. So kAngle is PINNED to segAngle/2 (=
//      180/n degrees). Measured: dot painted at θ=10°, n=6 — at kAngle
//      30° it renders at 10° (identity); at kAngle 0° that spot goes
//      dark and the dot shows up at 20° and 40° instead.
//   Texture space is the y-flip of screen space (splat() maps y →
//   1 - y/H) and is normalised per-axis, so a texture-space angle θ
//   points along screen vector (W·cos θ, −H·sin θ). Guides use that
//   mapping, which is why spokes stay registered on a non-square canvas.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const toggleEl = document.getElementById('mandalaToggle');
    const panelEl = document.getElementById('mandalaPanel');
    const hideGuidesEl = document.getElementById('mandalaHideGuides');
    const constrainEl = document.getElementById('mandalaConstrain');
    const captureBtn = document.getElementById('mandalaCaptureBtn');
    const wedgesEl = document.getElementById('mandalaWedges');
    const wedgesValEl = document.getElementById('mandalaWedgesValue');
    const canvas = document.getElementById('canvas');
    const wrapper = document.getElementById('canvas-wrapper');
    if (!toggleEl || !canvas || !wrapper) return;

    // Controls this mode drives. Everything is driven through the real
    // inputs so their own listeners, labels and persistence stay in sync.
    const kToggle = document.getElementById('kaleidoToggle');
    const kMode = document.getElementById('kaleidoMode');
    const kSegments = document.getElementById('kaleidoSegments');
    const kAngleEl = document.getElementById('kAngle');
    const kTwistEl = document.getElementById('kTwist');
    const kZoomEl = document.getElementById('kZoom');
    const kBlendEl = document.getElementById('kBlend');
    const kAnimRotEl = document.getElementById('kAnimateRot');
    const multiplierEl = document.getElementById('multiplier');
    const brushSizeEl = document.getElementById('brushSize');

    function setRange(el, v) {
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function setCheck(el, v) {
        if (!el || el.checked === !!v) return;
        el.checked = !!v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function setSelect(el, v) {
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function active() { return !!toggleEl.checked; }

    // ── Panel sliders that proxy an existing control ─────────────────
    // Two-way: the panel drives the real slider, and a real slider moved
    // elsewhere (Simulation panel, mixer strip, preset load) writes back.
    function proxy(srcId, valId, targetEl, fmt) {
        const src = document.getElementById(srcId);
        const val = document.getElementById(valId);
        if (!src || !targetEl) return null;
        const paint = function (v) { if (val) val.textContent = fmt(v); };
        src.addEventListener('input', function (e) {
            paint(parseFloat(e.target.value));
            setRange(targetEl, e.target.value);
        });
        targetEl.addEventListener('input', function (e) {
            if (src.value !== e.target.value) {
                src.value = e.target.value;
                paint(parseFloat(e.target.value));
            }
        });
        paint(parseFloat(src.value));
        return src;
    }
    const densityEl = document.getElementById('densityDissipation');
    const isolationEl = document.getElementById('velocityInfluence');
    const wetInfEl = document.getElementById('wetInfluence');
    const wetDryEl = document.getElementById('wetDrying');
    proxy('mandalaDensity', 'mandalaDensityValue', densityEl, function (v) { return v.toFixed(4); });
    proxy('mandalaIsolation', 'mandalaIsolationValue', isolationEl, function (v) { return v.toFixed(3); });
    proxy('mandalaWet', 'mandalaWetValue', wetInfEl, function (v) { return v.toFixed(2); });
    proxy('mandalaDryTime', 'mandalaDryTimeValue', wetDryEl, function (v) { return v.toFixed(1) + 's'; });

    // ── Wedge geometry ───────────────────────────────────────────────
    function wedgeCount() {
        const n = kSegments ? parseInt(kSegments.value, 10) : NaN;
        if (n > 0) return n;
        return (typeof window.kaleidoSegments === 'number' && window.kaleidoSegments > 0)
            ? window.kaleidoSegments : 12;
    }
    function segAngleOf(n) { return 2 * Math.PI / n; }

    // Pin kAngle to segAngle/2 so the source wedge renders as itself.
    // The slider is step=1 and 180/n is often fractional, so the slider
    // carries the rounded value for display while window.kAngle takes the
    // exact one — a rounded 0.5° would visibly misregister at the rim.
    let pinning = false;

    // 05f's angle slider sticks to 0 for 1.5s after any near-zero write, and
    // rewrites the input's own value when it does — a nicety for dragging past
    // the detent, but it silently swallows a programmatic angle. The pin then
    // landed on the slider as 0 while window.kAngle held the real pin (so the
    // slider read a lie), and on the way out it could zero the very angle being
    // restored. Whether it bit depended on how recently the angle passed 0,
    // which is what made leaving the mode unreliable rather than broken.
    // So every angle write from this file lands on BOTH: dispatch first, so
    // 05f and the guides run, then say what we actually meant.
    function writeAngle(deg) {
        const d = Number(deg) || 0;
        setRange(kAngleEl, d);
        if (kAngleEl) {
            kAngleEl.value = String(d);
            try { kAngleEl.style.setProperty('--val', d); } catch (_) {}
        }
        const lbl = document.getElementById('kAngleValue');
        if (lbl) lbl.textContent = d + '°';
        window.kAngle = d * Math.PI / 180;
    }

    function pinAngle() {
        const exact = Math.PI / wedgeCount();          // segAngle/2 in radians
        pinning = true;
        try {
            writeAngle(Math.round(exact * 180 / Math.PI));
            window.kAngle = exact;                     // the exact pin, not the rounded slider
            const lbl = document.getElementById('kAngleValue');
            if (lbl) lbl.textContent = (exact * 180 / Math.PI).toFixed(1) + '°';
        } finally { pinning = false; }
    }

    // Is a point (canvas-buffer px, y-down — the space multiSplat uses)
    // inside the paintable source wedge?
    function insideWedge(x, y) {
        const segAngle = segAngleOf(wedgeCount());
        const u = x / canvas.width - 0.5;
        const v = (1 - y / canvas.height) - 0.5;       // screen y-down → texture y-up
        // Every wedge meets at the hub; below a few px the wedge is thinner
        // than the brush, so let the centre through rather than making the
        // middle of the mandala unreachable.
        if (Math.hypot(u, v) < 0.02) return true;
        let a = Math.atan2(v, u) % (2 * Math.PI);
        if (a < 0) a += 2 * Math.PI;
        const tol = 0.02;                              // don't stutter on the seam
        return a <= segAngle / 2 + tol || a >= 2 * Math.PI - tol;
    }

    // ── Constrain strokes to the wedge ───────────────────────────────
    // Every local dye source funnels through the global multiSplat (05g):
    // live pointer, brush-engine dabs, stroke replay, remote peers. Gate
    // only user strokes — programmatic sources (path layers, audio scenes,
    // animations) pass exactColor and are left alone.
    // multiSplat is defined by the deferred sim build, LONG after this file
    // parses, so wrapping eagerly would silently no-op (it did). Same
    // __scriptsReady poll the other late wrappers use, plus a call from
    // enterMandala so the gate can never be missing when the mode is on.
    let bypass = false;
    function ensureWrapped() {
        if (window.__mandalaSplatWrapped) return true;
        const orig = window.multiSplat;
        if (typeof orig !== 'function') return false;
        window.__mandalaSplatWrapped = true;
        window.multiSplat = function (x, y, dx, dy, color, shouldBroadcast, exactColor) {
            if (active() && !bypass && constrainEl && constrainEl.checked &&
                !exactColor && !insideWedge(x, y)) return;
            return orig.apply(this, arguments);
        };
        // Remote peers replay strokes through applyMultiSplatWith WITHOUT the
        // exactColor flag, so the gate above would read them as local paint and
        // silently drop a partner's work — desyncing the shared canvas against
        // a wedge only this client is using. Only the local pointer path calls
        // multiSplat directly, so anything arriving here is exempt.
        const origApply = window.applyMultiSplatWith;
        if (typeof origApply === 'function') {
            window.applyMultiSplatWith = function () {
                bypass = true;
                try { return origApply.apply(this, arguments); } finally { bypass = false; }
            };
        }
        return true;
    }
    if (!ensureWrapped()) {
        let tries = 0;
        const poll = setInterval(function () {
            if (ensureWrapped() || ++tries > 200) clearInterval(poll);
        }, 50);
    }

    // ── Guide overlay ────────────────────────────────────────────────
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let svg = null;

    function ensureOverlay() {
        if (svg) return svg;
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.id = 'mandalaGuides';
        svg.style.cssText = 'position:absolute; pointer-events:none; display:none;';
        wrapper.appendChild(svg);
        return svg;
    }

    // Screen-space ray for a texture-space angle, aspect corrected.
    function rayTo(theta, W, H, len) {
        const dx = W * Math.cos(theta), dy = -H * Math.sin(theta);
        const m = Math.hypot(dx, dy) || 1;
        return [W / 2 + dx / m * len, H / 2 + dy / m * len];
    }

    function drawGuides() {
        if (!svg) return;
        svg.style.left = canvas.offsetLeft + 'px';
        svg.style.top = canvas.offsetTop + 'px';
        svg.style.width = canvas.offsetWidth + 'px';
        svg.style.height = canvas.offsetHeight + 'px';
        svg.setAttribute('viewBox', '0 0 ' + canvas.offsetWidth + ' ' + canvas.offsetHeight);
        // Ride one step above the canvas rather than taking a fixed z: the
        // layer stack assigns the sim canvas a z-index at runtime (base
        // 1000, minus its position in the layer order) and the side panels
        // sit above it, so anything fixed would either hide behind the
        // canvas or punch through the UI.
        const cz = parseInt(getComputedStyle(canvas).zIndex, 10);
        svg.style.zIndex = (isFinite(cz) ? cz : 2) + 1;

        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        const cx = W / 2, cy = H / 2;
        const L = Math.hypot(W, H);            // past every corner
        const rMax = Math.min(cx, cy);
        const n = wedgeCount();
        const segAngle = segAngleOf(n);
        const constrained = !!(constrainEl && constrainEl.checked);
        // Seams follow the ACTUAL kAngle, so the guides stay truthful even
        // if someone drags the raw Kaleido Angle slider off the pin.
        const kA = (typeof window.kAngle === 'number') ? window.kAngle : Math.PI / n;

        // Source wedge as a triangle — its far edge is off-canvas, so the
        // straight chord is never visible and no elliptical arc is needed.
        const w0 = rayTo(0, W, H, L), w1 = rayTo(segAngle / 2, W, H, L);
        const wedgePath = 'M' + cx + ' ' + cy + ' L' + w0[0] + ' ' + w0[1] +
            ' L' + w1[0] + ' ' + w1[1] + ' Z';

        let parts = '';
        if (constrained) {
            // Dim everything you can't paint into, so the live wedge reads
            // instantly. evenodd punches the wedge out of a full veil. Kept
            // light — watching the mirrored pattern build is the whole point,
            // so this marks the working area without hiding the result.
            parts += '<path d="M0 0 H' + W + ' V' + H + ' H0 Z ' + wedgePath +
                '" fill="rgba(0,0,0,0.28)" fill-rule="evenodd"/>';
        } else {
            parts += '<path d="' + wedgePath + '" fill="rgba(120,200,255,0.09)"/>';
        }
        // Fold seams: the fold is non-smooth every half segment, so mirrors
        // land at kA + k·segAngle/2 — 2n of them.
        for (let i = 0; i < 2 * n; i++) {
            const p = rayTo(kA + i * segAngle / 2, W, H, L);
            parts += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] +
                '" stroke="rgba(255,255,255,0.13)" stroke-width="1"/>';
        }
        // Composition rings
        [0.25, 0.5, 0.75, 1].forEach(function (f) {
            parts += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rMax * f) + '" ry="' + (rMax * f) +
                '" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1" stroke-dasharray="2 6"/>';
        });
        // The paintable wedge's own edges, bright, drawn last so they win.
        parts += '<path d="M' + w0[0] + ' ' + w0[1] + ' L' + cx + ' ' + cy + ' L' + w1[0] + ' ' + w1[1] +
            '" fill="none" stroke="rgba(130,205,255,0.85)" stroke-width="1.5"/>';
        parts += '<circle cx="' + cx + '" cy="' + cy + '" r="2.5" fill="rgba(255,255,255,0.55)"/>';
        svg.innerHTML = parts;
    }

    // ── Fill: scale the view so the working wedge reads as the whole
    // canvas. Nothing about the art changes — it's the same slice at the
    // same coordinates, just magnified, so you can lay in fine detail at a
    // comfortable size and then drop back to Off to see it as tracery.
    const FILL_ZOOM = { off: 1, fit: 2.6, full: 4.2 };
    function applyFill() {
        if (!window.ZoomView) return;
        const picked = document.querySelector('input[name="mandalaFill"]:checked');
        const mode = (active() && picked) ? picked.value : 'off';
        if (mode === 'off') { window.ZoomView.reset(); return; }
        // Aim at the middle of the wedge: texture angle segAngle/4, mapped to
        // screen through the same aspect-correct vector the guides use.
        const segAngle = segAngleOf(wedgeCount());
        const th = segAngle / 4;
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        const dx = W * Math.cos(th), dy = -H * Math.sin(th);
        const m = Math.hypot(dx, dy) || 1;
        window.ZoomView.focus(dx / m, dy / m, 0.5, FILL_ZOOM[mode] || 1);
    }
    document.querySelectorAll('input[name="mandalaFill"]').forEach(function (r) {
        r.addEventListener('change', applyFill);
    });
    // Guides live inside the transformed wrapper, so they scale for free —
    // but line weights should not balloon, and the overlay re-reads the box.
    window.__onZoomViewChange = function () { refresh(); };
    // Zooming or panning by hand leaves the Fill radio describing a framing
    // that is no longer on screen (it kept reading "Full" at 5.9x). Fill is a
    // preset view, so once you move the view yourself it is simply no longer
    // the active one — say so rather than lying. Guarded so clearing the radio
    // cannot recurse back through applyFill.
    var _clearingFill = false;
    window.__onZoomViewUserChange = function () {
        if (_clearingFill) return;
        var picked = document.querySelector('input[name="mandalaFill"]:checked');
        if (!picked || picked.value === 'off') return;
        var off = document.querySelector('input[name="mandalaFill"][value="off"]');
        if (!off) return;
        _clearingFill = true;
        // checked only — dispatching change would run applyFill and reset the
        // very view the user just set.
        off.checked = true;
        _clearingFill = false;
    };

    function guidesVisible() { return active() && !(hideGuidesEl && hideGuidesEl.checked); }
    function syncGuides() {
        ensureOverlay();
        svg.style.display = guidesVisible() ? 'block' : 'none';
        if (guidesVisible()) drawGuides();
    }
    function refresh() { if (guidesVisible()) drawGuides(); }

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(canvas);
    // Reordering layers rewrites the canvas's inline z-index, which would
    // strand the overlay behind it — redraw so it re-reads the stack.
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(refresh).observe(canvas, { attributes: true, attributeFilter: ['style'] });
    }
    if (constrainEl) constrainEl.addEventListener('change', refresh);
    if (hideGuidesEl) hideGuidesEl.addEventListener('change', syncGuides);
    if (kAngleEl) kAngleEl.addEventListener('input', refresh);

    // Wedges: drives the kaleido segment count, then re-pins the angle so
    // identity survives a wedge-count change.
    if (wedgesEl) wedgesEl.addEventListener('input', function (e) {
        const v = parseInt(e.target.value, 10) || 12;
        if (wedgesValEl) wedgesValEl.textContent = String(v);
        setRange(kSegments, v);
        if (active()) pinAngle();
        refresh();
        applyFill();          // a narrower wedge needs re-framing
    });
    if (kSegments) kSegments.addEventListener('input', function (e) {
        if (wedgesEl && wedgesEl.value !== e.target.value) {
            wedgesEl.value = e.target.value;
            if (wedgesValEl) wedgesValEl.textContent = e.target.value;
            if (active() && !pinning) pinAngle();
        }
        refresh();
    });

    // ── Enter / exit ─────────────────────────────────────────────────
    let saved = null;

    function enterMandala() {
        ensureWrapped();
        // Only snapshot on the way IN. A second 'change' on an already-checked
        // toggle would otherwise record the rig's own settings as "before" —
        // and exit would then restore mandala over mandala, kaleido included,
        // so the mirroring never turned off. Re-applying the rig below is
        // harmless and keeps a repeat enable self-correcting.
        if (!saved) saved = {
            kaleidoOn: !!(kToggle && kToggle.checked),
            mode: kMode ? kMode.value : '1',
            segments: kSegments ? kSegments.value : '12',
            angle: kAngleEl ? kAngleEl.value : '0',
            twist: kTwistEl ? kTwistEl.value : '0',
            zoom: kZoomEl ? kZoomEl.value : '1',
            blend: kBlendEl ? kBlendEl.value : '1',
            animRot: !!(kAnimRotEl && kAnimRotEl.checked),
            multiplier: multiplierEl ? multiplierEl.value : null,
            brush: brushSizeEl ? brushSizeEl.value : null,
            density: densityEl ? densityEl.value : null,
            isolation: isolationEl ? isolationEl.value : null,
            wetInf: wetInfEl ? wetInfEl.value : null,
            wetDry: wetDryEl ? wetDryEl.value : null,
            // Restored on the way out too, so using this mode once doesn't
            // permanently suppress Kaleido's own first-enable behaviour.
            bootstrapped: window._kaleidoBootstrapped
        };
        // Suppress 05f's first-enable bootstrap — it forces 16 segments and
        // an 8× multiplier, both of which fight this rig.
        window._kaleidoBootstrapped = true;
        setCheck(kToggle, true);
        setSelect(kMode, 1);                                    // Wedge
        setRange(kSegments, wedgesEl ? parseInt(wedgesEl.value, 10) || 12 : 12);
        setRange(kTwistEl, 0);                                  // identity needs no twist
        setRange(kZoomEl, 1);                                   // ...and zoom exactly 1
        setRange(kBlendEl, 1);
        setCheck(kAnimRotEl, false);                            // a painting rig holds still
        setRange(multiplierEl, 1);                              // one brush, not 8 arms —
                                                                // the mirroring is the display's job
        // The default brush (11) paints a ~330px dab — wider than a whole
        // wedge at mid-radius, so the mode opens on a detail tip instead.
        // Restored on exit; the Size fader still goes anywhere from here.
        setRange(brushSizeEl, 0.05);
        pinAngle();
        // Painterly sim: pigment that stays where you put it.
        setRange(densityEl, 1);                                 // never fades
        setRange(isolationEl, 5);                               // strokes don't shove settled paint
        setRange(wetInfEl, 1);                                  // dry paint holds its edge
        setRange(wetDryEl, 0.5);                                // and sets almost at once
        syncGuides();
    }

    // Fill is a mandala-only framing; leaving the mode by ANY route must not
    // strand the canvas magnified into a wedge that no longer exists.
    function clearFill() {
        const off = document.querySelector('input[name="mandalaFill"][value="off"]');
        if (off) { off.checked = true; }
        if (window.ZoomView) window.ZoomView.reset();
    }

    function exitMandala() {
        clearFill();
        if (saved) {
            setSelect(kMode, saved.mode);
            setRange(kSegments, saved.segments);
            writeAngle(saved.angle);
            setRange(kTwistEl, saved.twist);
            setRange(kZoomEl, saved.zoom);
            setRange(kBlendEl, saved.blend);
            setCheck(kAnimRotEl, saved.animRot);
            if (saved.multiplier != null) setRange(multiplierEl, saved.multiplier);
            if (saved.brush != null) setRange(brushSizeEl, saved.brush);
            if (saved.density != null) setRange(densityEl, saved.density);
            if (saved.isolation != null) setRange(isolationEl, saved.isolation);
            if (saved.wetInf != null) setRange(wetInfEl, saved.wetInf);
            if (saved.wetDry != null) setRange(wetDryEl, saved.wetDry);
            setCheck(kToggle, saved.kaleidoOn);
            window._kaleidoBootstrapped = saved.bootstrapped;
            saved = null;
        }
        syncGuides();
    }

    // .collapsible carries no CSS in this build, so panel visibility is
    // driven explicitly — the same way microDetailPanel/multigridPanel do it.
    function showPanel(on) {
        if (!panelEl) return;
        panelEl.style.display = on ? '' : 'none';
        panelEl.classList.toggle('open', !!on);
    }

    toggleEl.addEventListener('change', function (e) {
        showPanel(e.target.checked);
        if (e.target.checked) enterMandala(); else exitMandala();
    });

    // Turning raw Kaleido off underneath the mode drops out of it cleanly
    // rather than leaving guides over an unmirrored canvas.
    //
    // This fires far more often than it looks: kaleidoToggle is preset-backed
    // (mandala's own toggle is not), and a preset apply re-dispatches 'change'
    // on every checkbox — so every preset that lands with Kaleido off kicks
    // the mode out from under the user. It used to drop the flag and nothing
    // else, leaving the canvas magnified into a wedge, the Fill radio lit, a
    // 0.05 detail brush and the painterly sim — and, because `saved` was gone,
    // the Mandala toggle could no longer restore any of it.
    if (kToggle) kToggle.addEventListener('change', function (e) {
        if (e.target.checked || !active() || !saved) return;
        saved.kaleidoOn = false;              // an explicit off stays off
        toggleEl.checked = false;
        showPanel(false);
        if (window._profileApplying) {
            // The preset owns the sliders now; restoring the pre-mandala ones
            // over the top would fight the thing the user just picked. Give
            // back only what belongs to this mode: the framing and the guides.
            window._kaleidoBootstrapped = saved.bootstrapped;
            saved = null;
            clearFill();
            syncGuides();
        } else {
            exitMandala();                    // a hand-thrown switch gets the full unwind
        }
    });

    // ── Capture ──────────────────────────────────────────────────────
    // Guides are a DOM overlay, never part of the drawing buffer, so the
    // PNG is clean whether or not they're showing.
    if (captureBtn) captureBtn.addEventListener('click', function () {
        canvas.toBlob(function (blob) {
            if (!blob) return;
            const a = document.createElement('a');
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = 'mandala-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        }, 'image/png');
    });
})();
