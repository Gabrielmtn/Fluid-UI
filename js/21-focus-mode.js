/**
 * Focus Mode & Social Format Presets
 * 
 * - Focus Mode: Hides all UI, fills viewport with canvas, shows FOCUS badge
 *   Toggle via hotkey 'F' (no modifiers) or checkbox in sidebar
 * - Format Presets: One-click aspect ratio switching for TikTok, Instagram, etc.
 */
(function () {
    'use strict';

    var isFocused = false;
    var badge = null;
    var activeFormat = null;
    var formatButtons = [];
    var formatInfo = null;
    var lockCheckbox = null;

    // ─── FORMAT DEFINITIONS ─────────────────────────────────────
    var FORMATS = [
        { id: 'tiktok',    label: '9:16 TikTok',   w: 1080, h: 1920, ratio: 9 / 16 },
        { id: 'square',    label: '1:1 Square',     w: 1080, h: 1080, ratio: 1 },
        { id: 'landscape', label: '16:9 YouTube',   w: 1920, h: 1080, ratio: 16 / 9 },
        { id: 'ultrawide', label: '21:9 Ultra',     w: 2560, h: 1080, ratio: 21 / 9 }
    ];

    document.addEventListener('DOMContentLoaded', function () {
        requestAnimationFrame(function () { requestAnimationFrame(init); });
    });

    function init() {
        createBadge();
        bindHotkey();
        loadSavedState();
    }

    // ─── LIVE BADGE ─────────────────────────────────────────────
    function createBadge() {
        badge = document.createElement('div');
        badge.id = 'focus-mode-badge';
        badge.textContent = '● FOCUS';
        badge.title = 'Click or press F to exit focus mode';
        badge.addEventListener('click', function () {
            toggleFocus();
        });
        document.body.appendChild(badge);
    }

    // ─── FOCUS MODE TOGGLE ──────────────────────────────────────
    function toggleFocus() {
        isFocused = !isFocused;
        applyFocus();
    }

    // Saved wrapper geometry so we can restore after exiting focus mode
    var savedWrapper = null;

    function applyFocus() {
        var canvasWrapper = document.getElementById('canvas-wrapper');

        if (isFocused && canvasWrapper) {
            // Save current wrapper geometry before CSS override
            savedWrapper = {
                width:  canvasWrapper.style.width,
                height: canvasWrapper.style.height,
                left:   canvasWrapper.style.left,
                top:    canvasWrapper.style.top
            };
        }

        document.body.classList.toggle('focus-mode', isFocused);

        if (badge) {
            badge.classList.toggle('visible', isFocused);
        }

        // Sync checkbox if it exists
        var cb = document.getElementById('focusModeToggle');
        if (cb && cb.checked !== isFocused) {
            cb.checked = isFocused;
        }

        // Auto-hide cursor in focus mode
        var cursorToggle = document.getElementById('cursorToggle');
        if (cursorToggle) {
            if (isFocused && cursorToggle.checked) {
                cursorToggle._preStreamState = true;
                cursorToggle.checked = false;
                cursorToggle.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (!isFocused && cursorToggle._preStreamState) {
                cursorToggle.checked = true;
                cursorToggle.dispatchEvent(new Event('change', { bubbles: true }));
                delete cursorToggle._preStreamState;
            }
        }

        if (!isFocused && canvasWrapper && savedWrapper) {
            // Exiting focus mode: restore saved wrapper geometry
            canvasWrapper.style.width  = savedWrapper.width;
            canvasWrapper.style.height = savedWrapper.height;
            canvasWrapper.style.left   = savedWrapper.left;
            canvasWrapper.style.top    = savedWrapper.top;
            savedWrapper = null;
        }

        // Wait for CSS to fully apply, then update canvas resolution + framebuffers
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (typeof window.updateCanvasSize === 'function') {
                    window.updateCanvasSize();
                }
            });
        });

        // Save state
        try {
            if (window.settingsManager) {
                window.settingsManager.set('focus.mode', isFocused);
            }
        } catch (_) {}
    }

    // ─── HOTKEY ─────────────────────────────────────────────────
    function bindHotkey() {
        document.addEventListener('keydown', function (e) {
            // Skip if typing in an input
            var tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
            // 'F' without any modifiers = focus mode (CapsLock-proof)
            if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleFocus();
            }
        });
    }

    // ─── FORMAT PRESETS ─────────────────────────────────────────
    function applyFormat(format) {
        if (lockCheckbox && lockCheckbox.checked && activeFormat) return;

        var canvasWrapper = document.getElementById('canvas-wrapper');
        var canvasArea = document.getElementById('canvas-area');
        if (!canvasWrapper || !canvasArea) return;

        activeFormat = format;

        // Calculate size that fits within the available area while maintaining ratio
        var areaRect = canvasArea.getBoundingClientRect();
        var maxW = areaRect.width - 20;
        var maxH = areaRect.height - 20;

        var w, h;
        if (format.ratio >= 1) {
            // Landscape or square
            w = Math.min(maxW, format.w);
            h = w / format.ratio;
            if (h > maxH) {
                h = maxH;
                w = h * format.ratio;
            }
        } else {
            // Portrait (e.g., 9:16)
            h = Math.min(maxH, format.h);
            w = h * format.ratio;
            if (w > maxW) {
                w = maxW;
                h = w / format.ratio;
            }
        }

        w = Math.round(w);
        h = Math.round(h);

        // Set wrapper size
        canvasWrapper.style.width = w + 'px';
        canvasWrapper.style.height = h + 'px';

        // Center the wrapper in the canvas area
        var centerLeft = Math.max(0, (areaRect.width - w) / 2);
        var centerTop = Math.max(20, (areaRect.height - h) / 2);
        canvasWrapper.style.left = centerLeft + 'px';
        canvasWrapper.style.top = centerTop + 'px';

        // Directly update canvas element resolution + reinit WebGL framebuffers
        if (typeof window.updateCanvasSize === 'function') {
            window.updateCanvasSize();
        }

        // Update active button state
        for (var i = 0; i < formatButtons.length; i++) {
            formatButtons[i].classList.toggle('active', formatButtons[i].dataset.formatId === format.id);
        }

        // Show info (read back actual canvas size for accuracy)
        var canvas = document.getElementById('canvas');
        var actualW = canvas ? canvas.width : w;
        var actualH = canvas ? canvas.height : h;
        if (formatInfo) {
            formatInfo.textContent = actualW + ' × ' + actualH + ' (' + format.label + ')';
        }

        // Save
        try {
            if (window.settingsManager) {
                window.settingsManager.set('stream.format', format.id);
            }
        } catch (_) {}
    }

    function clearFormat() {
        activeFormat = null;
        for (var i = 0; i < formatButtons.length; i++) {
            formatButtons[i].classList.remove('active');
        }
        if (formatInfo) {
            formatInfo.textContent = 'Freeform';
        }
        try {
            if (window.settingsManager) {
                window.settingsManager.set('stream.format', null);
            }
        } catch (_) {}
    }

    // ─── LOAD SAVED STATE ───────────────────────────────────────
    function loadSavedState() {
        try {
            if (window.settingsManager) {
                var savedMode = window.settingsManager.get('focus.mode');
                if (savedMode === true) {
                    isFocused = true;
                    applyFocus();
                }

                var savedFormat = window.settingsManager.get('stream.format');
                if (savedFormat) {
                    for (var i = 0; i < FORMATS.length; i++) {
                        if (FORMATS[i].id === savedFormat) {
                            // Delay to let layout settle
                            var fmt = FORMATS[i];
                            setTimeout(function () { applyFormat(fmt); }, 300);
                            break;
                        }
                    }
                }
            }
        } catch (_) {}
    }

    // ─── PUBLIC API (used by sidebar builder) ───────────────────
    window.focusMode = {
        toggle: toggleFocus,
        isActive: function () { return isFocused; },
        getActiveFormat: function () { return activeFormat; },
        applyFormat: applyFormat,
        clearFormat: clearFormat,
        FORMATS: FORMATS,
        registerFormatButtons: function (btns) { formatButtons = btns; },
        registerFormatInfo: function (el) { formatInfo = el; },
        registerLockCheckbox: function (el) { lockCheckbox = el; }
    };
})();
