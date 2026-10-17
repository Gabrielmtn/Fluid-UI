// ===================================================================
// js/72-theme-tubes.js - Walnut & Copper tubes: presentation hooks for range inputs (e.g. --steps
// for detent ticks), written once at init / on change, never per frame.
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;
})();
