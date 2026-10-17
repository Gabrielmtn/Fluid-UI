// ===================================================================
// js/75-theme-overlays.js - Walnut & Copper overlays: presentation hooks
// for modals, menus and floating panels (for example registering their
// panes with ThemeMotion.pane so they strike and surge like the sidebars').
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;
})();
