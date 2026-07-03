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

  function initRangeInput(el) {
    if (!el || el._sliderVarsInit) return;
    el._sliderVarsInit = true;
    setSliderVars(el);
    el.addEventListener('input', onInput, { passive: true });
    el.addEventListener('change', onInput, { passive: true });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAll();
      startObserver();
    });
  } else {
    initAll();
    startObserver();
  }
})();
