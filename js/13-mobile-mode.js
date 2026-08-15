/**
 * Mobile Mode Handler
 * Detects mobile devices and provides fullscreen mode with hidden menu
 */

(function() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenuClose = document.getElementById('mobileMenuClose');
    function getControls() { return document.getElementById('sidebar-right') || document.querySelector('.controls'); }
    let controls = getControls(); // initial ref, updated after layout
    let tapTimeout = null;
    let isMobileMode = false;
    let savedVibrance = null;
    let savedClarity = null;

    // ── Accidental page-zoom guard (all touch devices, not just mobile-mode:
    // an iPad in desktop-class layout has the same problem) ──────────────
    // The viewport meta already says user-scalable=no, but iOS Safari has
    // ignored that since iOS 10: any pinch or double-tap landing on the
    // drawer, strip, or buttons zooms the whole PAGE — fixed-position UI
    // then breaks and it's fiddly to pinch back. touch-action protects only
    // the canvas (styles.css), so guard the rest here:
    // - gesturestart/gesturechange are iOS's pinch events; preventDefault
    //   reliably blocks page pinch-zoom. The canvas never sees them anyway
    //   (its touch handlers preventDefault first).
    // - The touchmove guard is the belt-and-braces for multi-touch on UI
    //   chrome; anything inside #canvas-area is exempt so the canvas's own
    //   two-finger gestures (05d TouchGestures) keep working.
    // Double-tap zoom on UI is killed by touch-action:manipulation in CSS.
    ['gesturestart', 'gesturechange'].forEach(function (t) {
        document.addEventListener(t, function (e) {
            e.preventDefault();
        }, { passive: false });
    });
    document.addEventListener('touchmove', function (e) {
        if (e.touches && e.touches.length > 1 &&
            !(e.target && e.target.closest && e.target.closest('#canvas-area'))) {
            e.preventDefault();
        }
    }, { passive: false });

    // Detect if device is mobile/tablet
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || (window.innerWidth <= 768)
            || (window.innerHeight <= 500 && window.innerWidth <= 1200);
    }

    // Enable mobile mode
    function enableMobileMode() {
        isMobileMode = true;
        document.body.classList.add('mobile-mode');
        
        // Hide menu by default
        if (controls) {
            controls.classList.remove('visible');
        }
        
        // Show the menu toggle button immediately on mobile
        if (mobileMenuToggle) {
            mobileMenuToggle.classList.add('show');
        }

        // Boost color vibrance/clarity for mobile displays (often washed out)
        try {
            if (window.config) {
                savedVibrance = config.VIBRANCE;
                savedClarity = config.CLARITY;
                // Only boost if values are low — respect user settings if already high
                if (config.VIBRANCE < 0.4) config.VIBRANCE = 0.4;
                if (config.CLARITY < 0.3) config.CLARITY = 0.3;
                // Sync UI sliders if they exist
                var vSlider = document.getElementById('vibrance');
                var cSlider = document.getElementById('clarity');
                if (vSlider) vSlider.value = config.VIBRANCE;
                if (cSlider) cSlider.value = config.CLARITY;
                var vVal = document.getElementById('vibranceValue');
                var cVal = document.getElementById('clarityValue');
                if (vVal) vVal.textContent = config.VIBRANCE.toFixed(2);
                if (cVal) cVal.textContent = config.CLARITY.toFixed(2);
            }
        } catch(_) {}
        
        console.log('Mobile mode enabled');
    }

    // Disable mobile mode
    function disableMobileMode() {
        isMobileMode = false;
        document.body.classList.remove('mobile-mode');
        
        if (controls) {
            controls.classList.remove('visible');
        }
        
        if (mobileMenuToggle) {
            mobileMenuToggle.classList.remove('show');
        }

        // Restore original vibrance/clarity values
        try {
            if (window.config && savedVibrance !== null) {
                config.VIBRANCE = savedVibrance;
                config.CLARITY = savedClarity;
                var vSlider = document.getElementById('vibrance');
                var cSlider = document.getElementById('clarity');
                if (vSlider) vSlider.value = savedVibrance;
                if (cSlider) cSlider.value = savedClarity;
                var vVal = document.getElementById('vibranceValue');
                var cVal = document.getElementById('clarityValue');
                if (vVal) vVal.textContent = savedVibrance.toFixed(2);
                if (cVal) cVal.textContent = savedClarity.toFixed(2);
                savedVibrance = null;
                savedClarity = null;
            }
        } catch(_) {}

        restoreMixerStrip();
        console.log('Mobile mode disabled');
    }

    // The mixer strip (quick faders + style presets + action buttons) is
    // display:none in the top bar on mobile, so those controls are otherwise
    // unreachable. Relocate it into the top of the slide-out menu so mobile users
    // get everything. Reparenting preserves the wired handlers; CSS reflows it to
    // fit (flex-wrap). Done lazily on first menu-open (the layout exists by then).
    var mixerStripHome = null;
    function relocateMixerStripToMenu() {
        var strip = document.getElementById('mixer-strip');
        var menu = document.getElementById('sidebar-right');
        if (!strip || !menu || strip.parentElement === menu) return;
        mixerStripHome = { parent: strip.parentElement, next: strip.nextElementSibling };
        menu.insertBefore(strip, menu.firstChild);
    }
    function restoreMixerStrip() {
        var strip = document.getElementById('mixer-strip');
        if (!strip || !mixerStripHome || !mixerStripHome.parent) return;
        mixerStripHome.parent.insertBefore(strip, mixerStripHome.next);
        mixerStripHome = null;
    }

    // Toggle menu visibility
    function toggleMenu() {
        controls = getControls(); // re-fetch: the mixer layout builds #sidebar-right later
        if (!controls) return;
        if (isMobileMode) relocateMixerStripToMenu(); // bring faders + presets into the menu
        controls.classList.toggle('visible');
    }

    // Show menu button temporarily when tapping top-right
    function handleTap(e) {
        if (!isMobileMode || !mobileMenuToggle) return;
        
        const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        
        // Check if tap is in top-right corner (60x60 area)
        const isTopRight = x > window.innerWidth - 60 && y < 60;
        
        if (isTopRight) {
            mobileMenuToggle.classList.add('show');
            
            // Hide button after 3 seconds if menu isn't open
            if (tapTimeout) clearTimeout(tapTimeout);
            tapTimeout = setTimeout(() => {
                if (!controls.classList.contains('visible')) {
                    mobileMenuToggle.classList.remove('show');
                }
            }, 3000);
        }
    }

    // Initialize
    function init() {
        // Re-bind controls to pick up #sidebar-right if mixer layout has created it
        setTimeout(function() { controls = getControls(); }, 100);

        // Check if mobile on load
        if (isMobileDevice()) {
            enableMobileMode();
        }

        // A single tap fires a pointer/touch event AND a synthetic click ~ms apart;
        // firing the toggle on both flips it twice (open→closed) so touch "does
        // nothing". Route every activation through one handler that swallows the
        // duplicate from the same tap. pointerup covers mouse + touch; click is the
        // keyboard/fallback path. (Each button gets its own debounce closure.)
        function tapHandler(action) {
            var last = 0;
            return function (e) {
                e.stopPropagation();
                var now = Date.now();
                if (now - last < 500) return; // duplicate event from the same tap
                last = now;
                action();
            };
        }
        if (mobileMenuToggle) {
            var onToggle = tapHandler(toggleMenu);
            mobileMenuToggle.addEventListener('pointerup', onToggle);
            mobileMenuToggle.addEventListener('click', onToggle);
        }
        if (mobileMenuClose) {
            var onClose = tapHandler(function () {
                controls = getControls();
                if (controls) controls.classList.remove('visible');
            });
            mobileMenuClose.addEventListener('pointerup', onClose);
            mobileMenuClose.addEventListener('click', onClose);
        }

        // Tap detection for showing menu button
        document.addEventListener('touchstart', handleTap);
        document.addEventListener('click', handleTap);

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!isMobileMode || !controls) return;
            
            const isMenuVisible = controls.classList.contains('visible');
            const clickedInsideMenu = controls.contains(e.target);
            const clickedToggle = mobileMenuToggle && mobileMenuToggle.contains(e.target);
            
            if (isMenuVisible && !clickedInsideMenu && !clickedToggle) {
                controls.classList.remove('visible');
            }
        });

        // The canvas swallows synthetic clicks (it preventDefaults touch for
        // painting), so the click-outside handler above never fires for a canvas tap.
        // Catch the touch in the CAPTURE phase: if the menu is open and you tap
        // outside it, dismiss it and consume the tap so it doesn't also paint.
        document.addEventListener('touchstart', (e) => {
            if (!isMobileMode) return;
            var c = getControls();
            if (!c || !c.classList.contains('visible')) return;
            var t = e.target;
            if (c.contains(t)) return;                                    // inside the menu
            if (mobileMenuToggle && mobileMenuToggle.contains(t)) return; // the toggle
            // Strip popups (brush drawer, presets list, arm colors) are <body>
            // children, so they are NOT inside the relocated menu — without this
            // the first tap on a preset was eaten as a dismiss and the list
            // closed instead of loading anything.
            if (t.closest && t.closest('.arm-colors-panel, .brush-settings-panel, .mixer-presets-panel')) return;
            c.classList.remove('visible');
            e.stopPropagation();   // don't also paint this dismiss tap
            e.preventDefault();
        }, { capture: true, passive: false });

        // Handle window resize
        window.addEventListener('resize', () => {
            const shouldBeMobile = isMobileDevice();
            
            if (shouldBeMobile && !isMobileMode) {
                enableMobileMode();
            } else if (!shouldBeMobile && isMobileMode) {
                disableMobileMode();
            }
        });

        // Expose toggle function for manual control
        window.toggleMobileMode = () => {
            if (isMobileMode) {
                disableMobileMode();
            } else {
                enableMobileMode();
            }
        };
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
