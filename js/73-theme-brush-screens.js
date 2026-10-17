// ===================================================================
// js/73-theme-brush-screens.js - Walnut & Copper brush screens: the Multi-brush tile screen and the Brush
// drawer stamp screen, built beside the existing controls (which stay the
// source of truth and keep every id, class and handler).
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;
})();
