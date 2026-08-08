(function () {
  'use strict';

  function toNumber(val, fallback) {
    var n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function setSliderVars(el) {
    var min = toNumber(el.getAttribute('min'), 0);
    var max = toNumber(el.getAttribute('max'), 100);
    var val = toNumber(el.value, (min + max) / 2);

    try { el.style.setProperty('--min', String(min)); } catch (_) {}
    try { el.style.setProperty('--max', String(max)); } catch (_) {}
    try { el.style.setProperty('--val', String(val)); } catch (_) {}
  }

  function onInput(e) {
    var el = e && e.target ? e.target : null;
    if (!el || el.type !== 'range') return;
    var v = toNumber(el.value, 0);
    try { el.style.setProperty('--val', String(v)); } catch (_) {}
  }

  /* ── Printed scale (design handoff Task 2) ─────────────────────────
     Three stops — min, midpoint, max — generated from the input's own
     attributes so ~57 controls need no hand markup and ranges stay
     correct if attributes change. Decimal precision comes from the
     step attribute; trailing zeros are trimmed for the scale only. */

  function stepDecimals(el) {
    var step = el.getAttribute('step');
    if (!step || step === 'any') return 2;
    var dot = step.indexOf('.');
    return dot === -1 ? 0 : (step.length - dot - 1);
  }

  function fmtStop(n, decimals) {
    var s = n.toFixed(Math.min(decimals, 6));
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function buildScale(el) {
    var min = toNumber(el.getAttribute('min'), 0);
    var max = toNumber(el.getAttribute('max'), 100);
    var d = stepDecimals(el);
    var scale = document.createElement('div');
    scale.className = 'fader-scale';
    scale.setAttribute('aria-hidden', 'true');
    var stops = [min, (min + max) / 2, max];
    for (var i = 0; i < stops.length; i++) {
      var span = document.createElement('span');
      span.textContent = fmtStop(stops[i], d);
      scale.appendChild(span);
    }
    return scale;
  }

  /* Wrap the input in a .fader-stack (scale row + input). Inputs get
     re-parented at runtime (mixer strip adoption, popups) — appendChild
     plucks the bare input out of its stack, so ensureStack() is called
     again from the MutationObserver and rebuilds at the new location,
     removing the orphaned stack it left behind. Opt out with
     data-no-scale="1" on the input. */
  function ensureStack(el) {
    if (el.dataset && el.dataset.noScale === '1') return;
    var parent = el.parentElement;
    if (!parent) return;
    if (parent.classList && parent.classList.contains('fader-stack')) return;

    var old = el._faderStack;
    if (old && old.parentElement && !old.querySelector('input[type="range"]')) {
      old.parentElement.removeChild(old);
    }

    var stack = document.createElement('div');
    stack.className = 'fader-stack';
    parent.insertBefore(stack, el);
    stack.appendChild(buildScale(el));
    stack.appendChild(el);
    el._faderStack = stack;
  }

  function refreshScale(el) {
    var stack = el._faderStack;
    if (!stack) return;
    var scale = stack.querySelector('.fader-scale');
    if (!scale) return;
    var fresh = buildScale(el);
    stack.replaceChild(fresh, scale);
  }

  function initRangeInput(el) {
    if (!el) return;
    if (!el._sliderVarsInit) {
      el._sliderVarsInit = true;
      setSliderVars(el);
      el.addEventListener('input', onInput, { passive: true });
      el.addEventListener('change', onInput, { passive: true });
    }
    ensureStack(el);
  }

  function initAll() {
    var sliders = document.querySelectorAll('input[type="range"]');
    for (var i = 0; i < sliders.length; i++) initRangeInput(sliders[i]);
  }

  var mo;
  function startObserver() {
    try {
      mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'childList') {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var node = m.addedNodes[j];
              if (!(node instanceof Element)) continue;
              if (node.matches && node.matches('input[type="range"]')) initRangeInput(node);
              var nested = node.querySelectorAll ? node.querySelectorAll('input[type="range"]') : [];
              for (var k = 0; k < nested.length; k++) initRangeInput(nested[k]);
            }
          } else if (m.type === 'attributes' && m.target && m.target.matches && m.target.matches('input[type="range"]')) {
            setSliderVars(m.target);
            refreshScale(m.target);
          }
        }
      });
      // Only watch for new elements, not attribute changes (causes perf issues)
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch (_) {}
  }

  /* ── Full-row hit target (design handoff Task 4, option 3) ──────────
     The input's own box is 44px tall, but the label line above it is a
     separate element in every row pattern, so pointerdown on the rest of
     a .control-group row is forwarded to its range input: compute the
     fraction from the track rect, write the value, dispatch 'input'
     (identical to a native drag), and track the drag via pointer capture.
     Scoped to .control-group rows only — strip headers carry their own
     click affordances (brush drawer trigger, material select). */

  var INTERACTIVE = 'input, select, button, a, textarea, [contenteditable], .fader-scale';

  function rowRange(row) {
    var inputs = row.querySelectorAll('input[type="range"]');
    return inputs.length === 1 ? inputs[0] : null;
  }

  function applyFraction(el, clientX) {
    var rect = el.getBoundingClientRect();
    if (!rect.width) return;
    var padX = 8, thumbW = 16;
    var usable = rect.width - 2 * padX - thumbW;
    if (usable <= 0) return;
    var frac = (clientX - rect.left - padX - thumbW / 2) / usable;
    frac = Math.max(0, Math.min(1, frac));
    var min = toNumber(el.getAttribute('min'), 0);
    var max = toNumber(el.getAttribute('max'), 100);
    var step = toNumber(el.getAttribute('step'), 0);
    var v = min + frac * (max - min);
    if (step > 0) v = Math.round((v - min) / step) * step + min;
    v = Math.max(min, Math.min(max, v));
    // trim float dust to the step's precision
    var d = stepDecimals(el);
    el.value = v.toFixed(Math.min(d, 6));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function startRowForwarding() {
    var dragEl = null;

    document.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      /* touch keeps native behavior: the 44px input is target enough, and
         intercepting row touches would break swipe-scrolling the panel */
      if (e.pointerType === 'touch') return;
      if (e.target.closest && e.target.closest(INTERACTIVE)) return;
      var row = e.target.closest ? e.target.closest('.control-group') : null;
      if (!row) return;
      if (row.querySelector('input[type="checkbox"]')) return;
      var el = rowRange(row);
      if (!el || el.disabled || !el.offsetParent) return;
      if (el.dataset && el.dataset.noScale === '1') return;
      dragEl = el;
      e.preventDefault();
      try { row.setPointerCapture(e.pointerId); } catch (_) {}
      applyFraction(el, e.clientX);
    }, true);

    document.addEventListener('pointermove', function (e) {
      if (dragEl) applyFraction(dragEl, e.clientX);
    }, true);

    function endDrag() {
      if (!dragEl) return;
      dragEl.dispatchEvent(new Event('change', { bubbles: true }));
      dragEl = null;
    }
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('pointercancel', endDrag, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAll();
      startObserver();
      startRowForwarding();
    });
  } else {
    initAll();
    startObserver();
    startRowForwarding();
  }
})();
