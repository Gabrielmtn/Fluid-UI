// ═══════════════════════════════════════════════════════════════════
// js/34-mandala-mode.js — Mandala Overlay
// LOAD ORDER: last (after 05g-arm-colors.js)
// PROVIDES: a radial-symmetry PAINTING rig — you paint one wedge and every
//   dab is folded into a full mandala as you lay it. Draws a guide overlay
//   marking the paintable wedge, constrains strokes to it, and captures a
//   clean PNG. Kaleido is its own switch and folds the DISPLAY on top
//   when it is on; this mode never touches it.
// REQUIRES: global multiSplat (05g)
//
// GEOMETRY: the mirroring is 05g's foldMandala, at the stroke, like the
//   Multi-Brush arms: window.__mandalaFold holds the wedge count n while
//   the mode is on, and multiSplat lays each user dab 2n times, n turns
//   of 360/n degrees about the canvas centre plus their mirror across the
//   fold line at angle 0. It rides the paint wire, the stroke replay and
//   the recorder as `md`, so peers and playback fold it the same way.
//   The source wedge is angles [0, 180/n] measured y-UP from the centre
//   (screen vector (cos θ, −sin θ)), in canvas px, so every wedge is the
//   same shape at any aspect. Until 2026-10-18 the Kaleido display fold
//   did the mirroring, so the mode switched Kaleido on, pinned its angle
//   to 180/n, and painted one unmirrored wedge with Kaleido off.
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
    const brushSizeEl = document.getElementById('brushSize');

    function setRange(el, v) {
        if (!el) return;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function active() { return !!toggleEl.checked; }

    // ── Wedge geometry ───────────────────────────────────────────────
    function wedgeCount() {
        const n = wedgesEl ? parseInt(wedgesEl.value, 10) : NaN;
        return (n >= 2) ? n : 12;
    }
    function segAngleOf(n) { return 2 * Math.PI / n; }

    // Screen direction (y-down) of the fold angle θ. The fold turns canvas
    // px about the centre, so it is the same at any aspect.
    function foldDir(theta) {
        return [Math.cos(theta), -Math.sin(theta)];
    }

    // The fold multiSplat lays every user dab with (05g foldMandala): the
    // wedge count while the mode is on, 0 while it is off.
    function publishFold() { window.__mandalaFold = active() ? wedgeCount() : 0; }

    // Is a point (canvas-buffer px, y-down — the space multiSplat uses)
    // inside the paintable source wedge?
    function insideWedge(x, y) {
        const segAngle = segAngleOf(wedgeCount());
        const W = canvas.width, H = canvas.height;
        let u = x / W - 0.5;
        let v = (1 - y / H) - 0.5;                     // screen y-down → texture y-up
        // Every wedge meets at the hub; below a few px the wedge is thinner
        // than the brush, so let the centre through rather than making the
        // middle of the mandala unreachable.
        if (Math.hypot(u, v) < 0.02) return true;
        u *= W; v *= H;                                // the angle the fold turns
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

    // Screen-space ray along a fold angle.
    function rayTo(theta, W, H, len) {
        const d = foldDir(theta), dx = d[0], dy = d[1];
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
        svg.innerHTML = guideMarkup(canvas.offsetWidth, canvas.offsetHeight);
    }

    // The guide marks for a W×H box laid over the whole canvas, in that
    // box's px: here the canvas's own CSS box; the Pen Input Window (47)
    // draws them over its box at its own size.
    function guideMarkup(W, H) {
        const cx = W / 2, cy = H / 2;
        const L = Math.hypot(W, H);            // past every corner
        const rMax = Math.min(cx, cy);
        const n = wedgeCount();
        const segAngle = segAngleOf(n);
        const constrained = !!(constrainEl && constrainEl.checked);

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
        // Fold seams: a turn every segment and a mirror line between, so a
        // seam every half segment from angle 0 — 2n of them.
        for (let i = 0; i < 2 * n; i++) {
            const p = rayTo(i * segAngle / 2, W, H, L);
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
        return parts;
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
        // Aim at the middle of the wedge: fold angle segAngle/4, mapped to
        // screen through the same vector the guides use.
        const segAngle = segAngleOf(wedgeCount());
        const th = segAngle / 4;
        const W = canvas.offsetWidth, H = canvas.offsetHeight;
        const d = foldDir(th), dx = d[0], dy = d[1];
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

    // For other surfaces (the Pen Input Window, 47): whether the mode is on,
    // and its guide marks for a W×H box over the canvas ('' while off).
    // Hide Guides is this window's choice; the other surface has its own.
    window.MandalaStudio = {
        active: active,
        guideMarkup: function (W, H) { return (active() && W > 0 && H > 0) ? guideMarkup(W, H) : ''; }
    };

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(canvas);
    // Reordering layers rewrites the canvas's inline z-index, which would
    // strand the overlay behind it — redraw so it re-reads the stack.
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(refresh).observe(canvas, { attributes: true, attributeFilter: ['style'] });
    }
    if (constrainEl) constrainEl.addEventListener('change', refresh);
    if (hideGuidesEl) hideGuidesEl.addEventListener('change', syncGuides);

    // Wedges: the fold's own count. Kaleido's Segments is its own.
    if (wedgesEl) wedgesEl.addEventListener('input', function () {
        if (wedgesValEl) wedgesValEl.textContent = String(wedgeCount());
        publishFold();
        refresh();
        applyFill();          // a narrower wedge needs re-framing
    });

    // ── Enter / exit ─────────────────────────────────────────────────
    let saved = null;

    function enterMandala() {
        ensureWrapped();
        publishFold();
        // Only snapshot on the way IN. A second 'change' on an already-checked
        // toggle would otherwise record the rig's own settings as "before",
        // and exit would then restore mandala over mandala.
        if (!saved) saved = {
            brush: brushSizeEl ? brushSizeEl.value : null,
            // 05f's arm count for its next Kaleido-off. 05f leaves it alone
            // while the mode is on, so the one from before is still right.
            prevMultiplier: window._prevMultiplier
        };
        // Your Multi-Brush count stays as it is (Gabriel's tour, 2026-10-18:
        // more to try): each arm folds into every wedge.
        // The default brush (11) paints a ~330px dab — wider than a whole
        // wedge at mid-radius, so the mode opens on a detail tip instead.
        // Restored on exit; the Size fader still goes anywhere from here.
        // The sim is left alone: Density, Isolation and Drying stay the
        // main controls' with the mode on (its own Paint feel copies went
        // 2026-10-18).
        setRange(brushSizeEl, 0.05);
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
        publishFold();
        if (saved) {
            if (saved.brush != null) setRange(brushSizeEl, saved.brush);
            window._prevMultiplier = saved.prevMultiplier;
            saved = null;
        }
        syncGuides();
    }

    // .collapsible carries no CSS in this build, so panel visibility is
    // driven explicitly — the same way multigridPanel does it.
    function showPanel(on) {
        if (!panelEl) return;
        panelEl.style.display = on ? '' : 'none';
        panelEl.classList.toggle('open', !!on);
    }

    toggleEl.addEventListener('change', function (e) {
        showPanel(e.target.checked);
        if (e.target.checked) enterMandala(); else exitMandala();
    });

    // Kaleido is independent of the mode: its display fold, with its own
    // segments and angle, goes over whatever the mandala has painted, and
    // neither switch moves the other.

    // ── Capture ──────────────────────────────────────────────────────
    // Same path as Export → Save picture (js/24-video-export.js) since
    // 2026-09-14: the PNG carries what is on screen — the ground colour,
    // image layers and text — and the collider film is held off for the
    // capture. A raw canvas.toBlob used to save the fluid alone over
    // transparent black. Guides are a DOM overlay, never part of the drawing
    // buffer, so they stay out either way; the raw path is only the fallback
    // for a build where the exporter failed to load.
    if (captureBtn) captureBtn.addEventListener('click', function () {
        if (window.fluidExport && typeof window.fluidExport.still === 'function') {
            window.fluidExport.still({ prefix: 'mandala-' });
            return;
        }
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
