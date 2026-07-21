// ═══════════════════════════════════════════════════════════════════
// js/31-brush-cursor.js — brush-ring cursor overlay
// LOAD ORDER: plain <script> after 20-mixer-layout.js. Self-contained and
//   lazy: reads window.config / DOM live, so it is safe to run before the
//   async sim chunks (04a etc.) have defined config/pointer.
// PROVIDES: #brushCursor overlay — a white ring sized to the brush with a
//   bisecting line at config.BRUSH_ANGLE. The line is coloured by the colour
//   about to be painted; the ring colour is overridable via #brushCursorColor.
//
// Why a DOM/SVG overlay (not a canvas draw): it must sit above the fluid
// canvas AND every layer/UI element, follow the OS pointer with zero sim
// coupling, and stay crisp at any brush size. position:fixed + clientX/clientY
// sidesteps the canvas-internal↔CSS coordinate mismatch entirely.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var canvas = document.getElementById('canvas');
    if (!canvas) return;

    // ── Overlay element (built once) ──────────────────────────────────
    // viewBox is a fixed 100u square; the host element is sized in CSS px to
    // the brush diameter, so the ring scales while non-scaling-stroke keeps
    // the outline a constant ~1.5 device px (Photoshop-style).
    var el = document.getElementById('brushCursor');
    if (!el) {
        el = document.createElement('div');
        el.id = 'brushCursor';
        document.body.appendChild(el);
    }
    el.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;' +
        'z-index:10050;display:none;transform:translate(-50%,-50%);' +
        'will-change:transform,width,height,opacity;';
    el.innerHTML =
        '<svg viewBox="-50 -50 100 100" width="100%" height="100%" ' +
        'style="overflow:visible;display:block;">' +
        // Soft dark halo under the ring so it reads on light artwork too.
        '<circle id="brushCursorRingShadow" cx="0" cy="0" r="47" fill="none" ' +
        'stroke="rgba(0,0,0,0.55)" stroke-width="3.2" vector-effect="non-scaling-stroke"/>' +
        '<circle id="brushCursorRing" cx="0" cy="0" r="47" fill="none" ' +
        'stroke="#ffffff" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
        // Orientation line: bisects the ring, rotated to the brush angle,
        // coloured by the paint colour (thin dark under-stroke for contrast).
        '<g id="brushCursorLineGroup">' +
        '<line x1="-47" y1="0" x2="47" y2="0" stroke="rgba(0,0,0,0.55)" ' +
        'stroke-width="3.4" vector-effect="non-scaling-stroke" stroke-linecap="round"/>' +
        '<line id="brushCursorLine" x1="-47" y1="0" x2="47" y2="0" stroke="#ff0000" ' +
        'stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linecap="round"/>' +
        '</g>' +
        // Center dot marks the exact hotspot.
        '<circle cx="0" cy="0" r="1.4" fill="#ffffff" stroke="rgba(0,0,0,0.55)" ' +
        'stroke-width="0.8" vector-effect="non-scaling-stroke"/>' +
        '</svg>';

    var ringEl = el.querySelector('#brushCursorRing');
    var lineEl = el.querySelector('#brushCursorLine');
    var lineGroupEl = el.querySelector('#brushCursorLineGroup');

    // ── Ring colour override (persisted) ──────────────────────────────
    var RING_KEY = 'ui.brushCursorColor';
    var ringColorInput = document.getElementById('brushCursorColor');
    var ringColor = '#ffffff';
    try {
        var savedRing = localStorage.getItem(RING_KEY);
        if (savedRing) ringColor = savedRing;
    } catch (_) {}
    if (ringColorInput) {
        ringColorInput.value = ringColor;
        ringColorInput.addEventListener('input', function () {
            ringColor = ringColorInput.value || '#ffffff';
            try { localStorage.setItem(RING_KEY, ringColor); } catch (_) {}
            if (ringEl) ringEl.setAttribute('stroke', ringColor);
        });
    }
    if (ringEl) ringEl.setAttribute('stroke', ringColor);

    // ── Size (fraction of the brush) + opacity (both persisted) ───────
    // The ring defaults to 25% of the brush footprint — a small aiming reticle
    // rather than a full outline — and the sliders let either be dialed.
    var SCALE_KEY = 'ui.brushCursorScale';
    var OPACITY_KEY = 'ui.brushCursorOpacity';
    var ringScale = 0.25;   // ring diameter ÷ brush diameter
    var ringOpacity = 0.5;
    try { var s = parseFloat(localStorage.getItem(SCALE_KEY)); if (isFinite(s)) ringScale = s; } catch (_) {}
    try { var o = parseFloat(localStorage.getItem(OPACITY_KEY)); if (isFinite(o)) ringOpacity = o; } catch (_) {}
    var scaleInput = document.getElementById('brushCursorScale');
    var scaleValueEl = document.getElementById('brushCursorScaleValue');
    var opacityInput = document.getElementById('brushCursorOpacity');
    var opacityValueEl = document.getElementById('brushCursorOpacityValue');
    function applyOpacity() { el.style.opacity = String(ringOpacity); }
    function syncSizeUI() { if (scaleValueEl) scaleValueEl.textContent = Math.round(ringScale * 100) + '%'; }
    function syncOpacityUI() { if (opacityValueEl) opacityValueEl.textContent = Math.round(ringOpacity * 100) + '%'; }
    if (scaleInput) {
        scaleInput.value = String(Math.round(ringScale * 100));
        scaleInput.addEventListener('input', function () {
            ringScale = Math.max(0.01, (parseFloat(scaleInput.value) || 25) / 100);
            try { localStorage.setItem(SCALE_KEY, String(ringScale)); } catch (_) {}
            syncSizeUI();
            requestRender();
        });
    }
    if (opacityInput) {
        opacityInput.value = String(Math.round(ringOpacity * 100));
        opacityInput.addEventListener('input', function () {
            ringOpacity = Math.max(0, Math.min(1, (parseFloat(opacityInput.value) || 0) / 100));
            try { localStorage.setItem(OPACITY_KEY, String(ringOpacity)); } catch (_) {}
            syncOpacityUI();
            applyOpacity();
        });
    }
    syncSizeUI();
    syncOpacityUI();
    applyOpacity();

    // ── Live inputs (read lazily; never captured at load) ─────────────
    function cursorEnabled() {
        var t = document.getElementById('cursorToggle');
        return !t || t.checked; // default on if the toggle isn't in the DOM
    }
    // Full 1:1 brush footprint diameter in CSS px (before the ring-size scale).
    function brushDiameterCssPx() {
        var c = window.config || {};
        var splatR = (typeof c.SPLAT_RADIUS === 'number' ? c.SPLAT_RADIUS : 0.011) *
                     (typeof c.STAMP_RADIUS_SCALE === 'number' ? c.STAMP_RADIUS_SCALE : 1);
        var rect = canvas.getBoundingClientRect();
        // Visible dab diameter ≈ 2·√SPLAT_RADIUS in canvas-height-normalized
        // units (see brush-engine's brushDiameterPx); ×CSS height → CSS px.
        return 2 * Math.sqrt(Math.max(0, splatR)) * rect.height;
    }
    function paintColorHex() {
        // The colour "about to be painted" — the main picker is the app's live
        // next-colour preview (step/random advance it on mouseup). Fall back to
        // pointer.color (what the in-progress stroke is depositing).
        var cp = document.getElementById('colorPicker');
        if (cp && /^#[0-9a-fA-F]{6}$/.test(cp.value)) return cp.value;
        var p = window.pointer;
        if (p && p.color && p.color.length >= 3) {
            var to = function (v) {
                var h = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16);
                return h.length === 1 ? '0' + h : h;
            };
            return '#' + to(p.color[0]) + to(p.color[1]) + to(p.color[2]);
        }
        return '#ff0000';
    }
    function brushAngleDeg() {
        var c = window.config || {};
        return typeof c.BRUSH_ANGLE === 'number' ? c.BRUSH_ANGLE : 0;
    }

    // ── Render loop (runs only while hovering) ────────────────────────
    var lastX = 0, lastY = 0, visible = false, rafId = 0;

    function render() {
        rafId = 0;
        if (!visible) return;
        if (!cursorEnabled()) { hide(); return; }

        // Ring size = brush footprint × the size fraction, floored so a tiny
        // brush still leaves an aimable reticle.
        var d = Math.max(6, brushDiameterCssPx() * ringScale);
        el.style.width = d + 'px';
        el.style.height = d + 'px';
        el.style.transform = 'translate(' + lastX + 'px,' + lastY + 'px) translate(-50%,-50%)';

        if (ringEl) ringEl.setAttribute('stroke', ringColor);

        var col = paintColorHex();
        if (lineEl) lineEl.setAttribute('stroke', col);
        // SVG rotate() is clockwise in screen space — same sense the shader's
        // stampAngle turns the stamp, so cursor line and painted streak agree.
        if (lineGroupEl) lineGroupEl.setAttribute('transform', 'rotate(' + brushAngleDeg() + ')');

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
            // Hide the OS arrow over the drawing surface so only the ring shows.
            // Inline style beats the stylesheet default; when Show Cursor is off
            // the canvas already carries cursor:none via .hide-cursor.
            canvas.style.cursor = 'none';
        }
        requestRender();
    }
    function hide() {
        visible = false;
        el.style.display = 'none';
        if (canvas.style.cursor === 'none') canvas.style.cursor = '';
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    canvas.addEventListener('pointerenter', function (e) {
        lastX = e.clientX; lastY = e.clientY;
        show();
    });
    canvas.addEventListener('pointermove', function (e) {
        lastX = e.clientX; lastY = e.clientY;
        if (!visible) show(); else requestRender();
    });
    canvas.addEventListener('pointerleave', hide);
    // Pointer capture during a stroke can suppress leave — a global up re-checks.
    window.addEventListener('blur', hide);

    // React live to the Show Cursor toggle without needing a mouse move.
    var toggle = document.getElementById('cursorToggle');
    if (toggle) {
        toggle.addEventListener('change', function () {
            if (!toggle.checked) hide();
        });
    }

    // Expose for other modules / debugging.
    window.__brushCursor = { show: show, hide: hide, el: el };
})();
