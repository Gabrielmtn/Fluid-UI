// ===================================================================
// js/74-theme-room.js - Walnut & Copper room drawer: nixie room code, pilot lamp and the VFD
// change log, mirrored from the existing #mpActivity / room elements
// (which stay the source of truth and the live region).
// Presentation only: no behaviour, value, sync or selector change. Motion
// rides js/71's frame (window.ThemeMotion.run), never a loop of its own.
// ===================================================================
(function () {
    'use strict';
    if (document.documentElement.getAttribute('data-theme') !== 'walnut-copper') return;
})();
