/**
 * Focus Mode & Social Format Presets
 *
 * - Focus Mode: Hides all UI including the title bar and the underbar, and
 *   takes the window fullscreen (js/36) so only the painting is on screen.
 *   Toggle via hotkey 'F' (no modifiers) or checkbox in sidebar; Esc leaves.
 *   Nothing marks it on screen except a short hint on the way in.
 * - Format Presets: One-click aspect ratio switching for TikTok, Instagram, etc.
 */
(function () {
    'use strict';

    var isFocused = false;
    var hint = null;
    var hintTimer = null;
    var HINT_MS = 2500;
    // The screen-filling Window Mode focus mode switched to, and the one to
    // go back to. Null when it was already fullscreen or borderless (then it
    // is left as it was).
    var fsBorrowed = null;
    var fsBorrowedFrom = null;
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
        createHint();
        bindHotkey();
        bindDisplayMode();
        loadSavedState();
    }

    // ─── WAY-OUT HINT ───────────────────────────────────────────
    // Shown for a moment on the way in, then gone: the only thing on screen
    // in focus mode is the painting. Static on purpose, no fade (see the
    // compositor note in css/22-overlays.css).
    function createHint() {
        hint = document.createElement('div');
        hint.id = 'focus-mode-hint';
        hint.setAttribute('role', 'status');
        hint.textContent = 'Press F or Esc to leave Focus';
        document.body.appendChild(hint);
    }

    function flashHint() {
        if (!hint) return;
        clearTimeout(hintTimer);
        hint.classList.add('visible');
        hintTimer = setTimeout(function () { hint.classList.remove('visible'); }, HINT_MS);
    }

    // ─── FULLSCREEN ─────────────────────────────────────────────
    // Desktop: Borderless, the window sized to the monitor. It looks the same
    // as OS fullscreen, switches instantly and behaves the same whether or
    // not the window is see-through. A browser has only real fullscreen.
    function borrowFullscreen() {
        var dm = window.displayMode;
        if (!dm || dm.get() !== 'windowed') return;
        var to = window.IS_ELECTRON ? 'borderless' : 'fullscreen';
        // A browser grants fullscreen only to a click or a key press. A
        // focus mode restored at boot has neither, so it stays in the window
        // rather than being refused.
        if (to === 'fullscreen' && !window.IS_ELECTRON
            && navigator.userActivation && !navigator.userActivation.isActive) return;
        fsBorrowed = to;
        fsBorrowedFrom = 'windowed';
        dm.set(to, { persist: false });
    }

    function returnFullscreen() {
        var dm = window.displayMode;
        var back = fsBorrowedFrom, borrowed = fsBorrowed;
        fsBorrowed = fsBorrowedFrom = null;
        if (dm && back && dm.get() === borrowed) dm.set(back, { persist: false });
    }

    // The OS or the browser dropped fullscreen (Esc in a browser eats the
    // key before the page sees it): that is leaving focus too.
    function bindDisplayMode() {
        document.addEventListener('displaymodechange', function (e) {
            var d = e.detail || {};
            if (!fsBorrowed || d.mode === fsBorrowed) return;
            fsBorrowed = fsBorrowedFrom = null;
            if (d.external && isFocused) toggleFocus();
        });
    }

    // ─── FOCUS MODE TOGGLE ──────────────────────────────────────
    // Keyboard focus in the UI that focus mode hides (display:none) drops to
    // the page; it comes back on the way out. Not for a control the mouse
    // pressed: handed back by script it would count as keyboard focus (05n)
    // and take Space from Freeze.
    var focusBefore = null;
    function giveFocusBack() {
        var el = focusBefore;
        focusBefore = null;
        if (!el || !el.isConnected) return;
        // After the UI's own fade back in has a frame to lay out.
        setTimeout(function () {
            var a = document.activeElement;
            if (a && a !== document.body) return;          // somewhere already
            if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return;
            try { el.focus({ preventScroll: true }); } catch (_) {}
        }, 60);
    }

    function toggleFocus() {
        isFocused = !isFocused;
        // The switch says the new state at once; the chrome then slides
        // (slideFocus), and applyFocus syncs it again when it lands.
        var cbNow = document.getElementById('focusModeToggle');
        if (cbNow && cbNow.checked !== isFocused) cbNow.checked = isFocused;
        if (isFocused) {
            var a = document.activeElement;
            var byPointer = window.__pointerFocused ? window.__pointerFocused(a) : false;
            focusBefore = (a && a !== document.body && !byPointer) ? a : null;
        }
        slideFocus();
        if (!isFocused) giveFocusBack();
        // Fullscreen is asked at once: browsers only grant it inside the
        // key press or click itself.
        if (isFocused) borrowFullscreen();
        else returnFullscreen();
    }

    // The chrome slides away and back (Gabriel's tour, 2026-10-18: the jump
    // felt janky): the top bar up, each sidebar out its own side, the
    // underbar down, by transform (css/22 .fm-out). The layout changes ONCE,
    // after the slide on the way in and before it on the way out, so the
    // canvas refits once each way. One-shot transitions, nothing that runs
    // on (the compositor note on #focus-mode-hint is about endless ones).
    var SLIDE_MS = 333, slideTimer = 0;
    var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function slideFocus() {
        var b = document.body;
        clearTimeout(slideTimer);
        if (RM.matches) { b.classList.remove('fm-out', 'fm-instant'); applyFocus(); return; }
        if (isFocused) {
            b.classList.remove('fm-instant');
            b.classList.add('fm-out');
            slideTimer = setTimeout(function () {
                if (!isFocused) return;
                applyFocus();
                b.classList.add('fm-instant');
                b.classList.remove('fm-out');
                void b.offsetWidth;
                b.classList.remove('fm-instant');
            }, SLIDE_MS);
        } else {
            b.classList.add('fm-instant', 'fm-out');
            applyFocus();
            void b.offsetWidth;
            b.classList.remove('fm-instant');
            requestAnimationFrame(function () { b.classList.remove('fm-out'); });
        }
    }

    // Saved wrapper geometry so we can restore after exiting focus mode
    var savedWrapper = null;

    function applyFocus() {
        var canvasWrapper = document.getElementById('canvas-wrapper');
        // The canvas eases to full screen and back (Gabriel's tour: the snap
        // felt janky), by the same FLIP as a format pick (flipTo below).
        var fromRect = (canvasWrapper && !RM.matches) ? flipFrom(canvasWrapper) : null;

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

        if (isFocused) flashHint();
        else if (hint) { clearTimeout(hintTimer); hint.classList.remove('visible'); }

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

        if (fromRect && typeof window.updateCanvasSize === 'function') {
            // The new box is laid out by the read inside updateCanvasSize, so
            // the size lands now, once, and the ease draws over it.
            window.updateCanvasSize();
            flipTo(canvasWrapper, fromRect, SLIDE_MS, 0);
        } else {
            // Wait for CSS to fully apply, then update canvas resolution + framebuffers
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    if (typeof window.updateCanvasSize === 'function') {
                        window.updateCanvasSize();
                    }
                });
            });
        }

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
            // Skip if typing — but a focused SLIDER is not typing, and focus
            // sits on one after every fader drag (this killed F silently).
            if (window.__isTypingTarget) { if (window.__isTypingTarget(e.target)) return; }
            else {
                var tag = e.target.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
            }
            if (window.DialogFocus.hasKeyboard()) return;   // a dialog has the keyboard (00b)
            // 'F' without any modifiers = focus mode (CapsLock-proof)
            if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleFocus();
                return;
            }
            // Esc leaves, unless something open on top took it first.
            if (e.key === 'Escape' && isFocused && !e.defaultPrevented
                && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggleFocus();
            }
        });
    }

    // ─── FORMAT CHANGE, SEEN ────────────────────────────────────
    // With the border off a format pick showed nothing happening (Gabriel's
    // tour, 2026-10-18). The canvas takes its new size ONCE (one reinit);
    // the wrapper is then drawn from the old rect to the new by translate +
    // scale (FLIP, compositor only), and a hidden border fades in for it and
    // back out after (css/22 .canvas-border-flash). A shown border stays.
    // The individual translate/scale properties leave Zoom View's own
    // transform (js/35) alone; while zoomed only the border flashes.
    var EASE_MS = 300, FLASH_IN_MS = 150, FLASH_HOLD_MS = 120, flashTimer = 0, easeTimer = 0;

    function flashBorder(holdMs) {
        var b = document.body;
        var cb = document.getElementById('showCanvasHandles');
        if (!cb || cb.checked) return;
        clearTimeout(flashTimer);
        if (!b.classList.contains('canvas-border-flash')) {
            b.classList.add('canvas-border-flash');
            void b.offsetWidth;   // start from opacity 0
        }
        b.classList.add('canvas-border-flash-on');
        flashTimer = setTimeout(function () {
            b.classList.remove('canvas-border-flash-on');
            flashTimer = setTimeout(function () { b.classList.remove('canvas-border-flash'); }, RM.matches ? 0 : 260);
        }, holdMs);
    }

    // The visual resize, in two halves round the one real size change (a
    // format pick here, focus mode in applyFocus). flipFrom: where the
    // wrapper is on screen now, a running ease included, then that ease's
    // offset dropped so the new layout measures clean. flipTo: draw the new
    // box over the old one and let it ease home. #canvas-area clips, and the
    // way out of focus starts the canvas bigger than the area, so the clip
    // is lifted for the ease (Zoom View owns it while zoomed; no ease then).
    var flipArea = null, flipToken = 0;
    function flipFrom(w) {
        flipToken++;
        clearTimeout(easeTimer);
        var r = w.getBoundingClientRect();
        w.style.transition = 'none';
        w.style.translate = '';
        w.style.scale = '';
        return r;
    }

    function flipTo(w, from, ms, delay) {
        clearTimeout(easeTimer);
        var to = w.getBoundingClientRect();
        if (RM.matches || w.style.transform || !from || !from.width || !to.width
            || (Math.abs(from.left - to.left) < 1 && Math.abs(from.top - to.top) < 1
                && Math.abs(from.width - to.width) < 1 && Math.abs(from.height - to.height) < 1)) {
            w.style.transition = '';
            if (flipArea && flipArea.style.overflow === 'visible') flipArea.style.overflow = '';
            flipArea = null;
            return 0;
        }
        w.style.translate = ((from.left + from.width / 2) - (to.left + to.width / 2)) + 'px '
            + ((from.top + from.height / 2) - (to.top + to.height / 2)) + 'px';
        w.style.scale = (from.width / to.width) + ' ' + (from.height / to.height);
        var area = w.parentElement;
        if (area && !area.style.overflow) { area.style.overflow = 'visible'; flipArea = area; }
        // The frame that lands the new size is the slow one (the new canvas
        // buffer; on the way out of focus, the whole chrome back on screen):
        // measured 50-70 ms headless. Started inside it, the ease lost a
        // fifth of its run and jumped; started two frames on, it runs whole.
        var token = ++flipToken;
        requestAnimationFrame(function () { requestAnimationFrame(function () {
            if (token !== flipToken) return;
            var t = ms + 'ms cubic-bezier(0.2, 0.7, 0.2, 1) ' + delay + 'ms';
            w.style.transition = 'translate ' + t + ', scale ' + t;
            w.style.translate = '';
            w.style.scale = '';
            easeTimer = setTimeout(function () {
                w.style.transition = '';
                if (flipArea && flipArea.style.overflow === 'visible') flipArea.style.overflow = '';
                flipArea = null;
            }, delay + ms + 50);
        }); });
        return delay + ms + 33;
    }

    // ─── FORMAT PRESETS ─────────────────────────────────────────
    // opts.ease: a pick by hand (the Format buttons) shows the change; a
    // restore at boot or from a snapshot just lands.
    function applyFormat(format, opts) {
        if (lockCheckbox && lockCheckbox.checked && activeFormat) return;

        var canvasWrapper = document.getElementById('canvas-wrapper');
        var canvasArea = document.getElementById('canvas-area');
        if (!canvasWrapper || !canvasArea) return;

        var ease = !!(opts && opts.ease) && !isFocused;
        var fromRect = ease ? flipFrom(canvasWrapper) : null;

        activeFormat = format;

        // 01-config's fitter owns the geometry: it fits this format's RATIO into
        // the same usable box every other placement uses — the one that stops at
        // the fixed bottom nav rather than at the bottom of #canvas-area. The
        // arithmetic that used to live here measured only the raw area rect and
        // left a 20px margin, so on any window shorter than about 1440px the
        // frame settled 16-20px underneath the nav and stayed there.
        if (typeof window.fitCanvasIntoArea === 'function') {
            window.fitCanvasIntoArea({ fill: true });
        } else {
            // Pre-chain fallback (a format restored before 01-config ran).
            var areaRect = canvasArea.getBoundingClientRect();
            var maxW = areaRect.width - 48;
            var maxH = areaRect.height - 48;
            var w = Math.min(maxW, format.w);
            var h = w / format.ratio;
            if (h > maxH) { h = maxH; w = h * format.ratio; }
            canvasWrapper.style.width = Math.round(w) + 'px';
            canvasWrapper.style.height = Math.round(h) + 'px';
            canvasWrapper.style.left = Math.round(Math.max(24, (areaRect.width - w) / 2)) + 'px';
            canvasWrapper.style.top = Math.round(Math.max(24, (areaRect.height - h) / 2)) + 'px';
        }

        // Directly update canvas element resolution + reinit WebGL framebuffers
        if (typeof window.updateCanvasSize === 'function') {
            window.updateCanvasSize();
        }

        if (ease) {
            flashBorder(RM.matches ? 600 : FLASH_IN_MS);
            var easeMs = flipTo(canvasWrapper, fromRect, EASE_MS,
                document.body.classList.contains('canvas-border-flash-on') ? FLASH_IN_MS : 0);
            if (!RM.matches) flashBorder(easeMs + FLASH_HOLD_MS);
        }

        // Update active button state
        for (var i = 0; i < formatButtons.length; i++) {
            formatButtons[i].classList.toggle('active', formatButtons[i].dataset.formatId === format.id);
            formatButtons[i].setAttribute('aria-checked', formatButtons[i].dataset.formatId === format.id ? 'true' : 'false');
        }

        // Show info (read back actual canvas size for accuracy)
        var canvas = document.getElementById('canvas');
        var actualW = canvas ? canvas.width : canvasWrapper.offsetWidth;
        var actualH = canvas ? canvas.height : canvasWrapper.offsetHeight;
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
            formatButtons[i].setAttribute('aria-checked', 'false');
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
                if (savedMode === true) toggleFocus();

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
