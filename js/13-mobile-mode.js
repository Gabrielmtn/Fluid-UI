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

    // A single tap fires a pointer/touch event AND a synthetic click ~ms apart;
    // firing the toggle on both flips it twice (open→closed) so touch "does
    // nothing". Route every activation through one handler that swallows the
    // duplicate from the same tap. pointerup covers mouse + touch; click is the
    // keyboard/fallback path. (Each button gets its own debounce closure.)
    // stopPropagation also keeps the click from the document's
    // close-menu-on-outside-click handler, which would otherwise shut a
    // drawer the same tap just opened.
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

    // Open the drawer if it is shut, then run fn once it has slid in.
    function openDrawerThen(fn) {
        controls = getControls();
        if (!controls) return;
        var wasOpen = controls.classList.contains('visible');
        if (!wasOpen) toggleMenu();
        setTimeout(fn, wasOpen ? 0 : 350);
    }

    // The sidebar sections carry no ids; find one by its title the way
    // 44-recipes does, open it (43's wrapped opener un-hides it in Simple)
    // and scroll it into view.
    function openSectionByTitle(title) {
        var secs = document.querySelectorAll('#sidebar-right .sidebar-section');
        for (var i = 0; i < secs.length; i++) {
            var t = secs[i].querySelector('.section-title');
            if (!t || t.textContent.trim() !== title) continue;
            if (typeof window.openSidebarSection === 'function') window.openSidebarSection(secs[i]);
            else secs[i].classList.remove('collapsed');
            try { secs[i].scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {}
            return secs[i];
        }
        return null;
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

        // The '?' pill under the ☰ opens "How do I…" (js/44-recipes.js):
        // searchable tasks that open the drawer and point at the control.
        // It used to open the keyboard-shortcut sheet — a list of keys is
        // the wrong first answer on a touch screen (2026-09-14). The sheet
        // is still one tap away, from the modal's "Hotkeys (F1)" button.
        if (!document.getElementById('mobileHotkeysBtn')) {
            var hkBtn = document.createElement('button');
            hkBtn.id = 'mobileHotkeysBtn';
            hkBtn.type = 'button';
            hkBtn.setAttribute('aria-label', 'How do I… (help)');
            hkBtn.title = 'How do I…';
            hkBtn.textContent = '?';
            hkBtn.addEventListener('click', function () {
                if (window.Recipes && typeof window.Recipes.open === 'function') window.Recipes.open();
                else if (typeof window.toggleHotkeys === 'function') window.toggleHotkeys();
            });
            document.body.appendChild(hkBtn);
        }

        // Bottom action row (2026-09-14): the four things a first-time
        // painter reaches for, on screen without the drawer — Look (the
        // presets list), Color, Together (the room panel) and Save (a
        // picture). Each opens the drawer to its control except Save, which
        // saves at once. Undo is not here: fluid strokes have no undo
        // (05i's ring covers raster layers and masks only).
        if (!document.getElementById('mobileActionRow')) {
            var row = document.createElement('div');
            row.id = 'mobileActionRow';
            row.dataset.group = 'core';   // button tint (css/01-buttons.css)
            row.setAttribute('role', 'toolbar');
            row.setAttribute('aria-label', 'Quick actions');
            var addAction = function (id, label, title, action) {
                var b = document.createElement('button');
                b.type = 'button';
                b.id = id;
                b.textContent = label;
                b.title = title;
                var h = tapHandler(action);
                // Only a press that STARTED on this button counts: a replay
                // hold begun on the canvas takes no pointer capture (05d), so
                // its release can land here — that must neither fire the
                // action nor be swallowed before 05d's window pointerup.
                var downAt = 0;
                b.addEventListener('pointerdown', function () { downAt = Date.now(); });
                b.addEventListener('pointerup', function (e) {
                    var ok = downAt && (Date.now() - downAt) < 2000;
                    downAt = 0;
                    if (ok) h(e);
                });
                b.addEventListener('click', h);
                row.appendChild(b);
                return b;
            };
            // A strip cell hidden under Settings → Interface comes back first,
            // the way 44-recipes' reveal does — a hidden trigger has no box.
            var unhide = function (key) {
                var uv = window.UIVisibility;
                if (uv && typeof uv.isHidden === 'function' && uv.isHidden(key)) uv.show(key);
            };
            addAction('mobileLookBtn', 'Look', 'Pick a look — a complete set of colours, brush and finish', function () {
                openDrawerThen(function () {
                    unhide('strip:Presets');
                    var t = document.getElementById('mixerPresetsTrigger');
                    if (t && !t.classList.contains('active')) t.click();   // the trigger toggles: open, never shut
                });
            });
            addAction('mobileColorBtn', 'Color', 'Brush colour and palette', function () {
                openDrawerThen(function () {
                    unhide('strip:Color');
                    var cell = document.querySelector('#mixer-strip [data-ui-key="Color"]');
                    if (cell) { try { cell.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {} }
                });
            });
            addAction('mobileTogetherBtn', 'Together', 'Start a room or join one — paint on the same canvas as someone else', function () {
                openDrawerThen(function () { openSectionByTitle('Swirl Together'); });
            });
            addAction('mobileSaveBtn', 'Save', 'Save a picture of what you see — background, layers and text included', function () {
                if (window.fluidExport && typeof window.fluidExport.still === 'function') window.fluidExport.still();
            });
            document.body.appendChild(row);
        }

        // Boost colour vibrance for mobile displays (often washed out)
        try {
            if (window.config) {
                savedVibrance = config.VIBRANCE;
                // Only boost if the value is low — respect user settings if already high
                if (config.VIBRANCE < 0.4) config.VIBRANCE = 0.4;
                // Sync the UI slider if it exists
                var vSlider = document.getElementById('vibrance');
                if (vSlider) vSlider.value = config.VIBRANCE;
                var vVal = document.getElementById('vibranceValue');
                if (vVal) vVal.textContent = config.VIBRANCE.toFixed(2);
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

        // Restore the original vibrance value
        try {
            if (window.config && savedVibrance !== null) {
                config.VIBRANCE = savedVibrance;
                var vSlider = document.getElementById('vibrance');
                if (vSlider) vSlider.value = savedVibrance;
                var vVal = document.getElementById('vibranceValue');
                if (vVal) vVal.textContent = savedVibrance.toFixed(2);
                savedVibrance = null;
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
            if (t.closest && t.closest('#mobileActionRow')) return;        // the bottom row's own handlers decide
            // Strip popups (brush drawer, presets list, arm colors) are <body>
            // children, so they are NOT inside the relocated menu — without this
            // the first tap on a preset was eaten as a dismiss and the list
            // closed instead of loading anything.
            if (t.closest && t.closest('.arm-colors-panel, .brush-settings-panel, .brush-tip-menu, .mixer-presets-panel')) return;
            // The presets list opened from inside the drawer (Look) is a
            // <body> child: shut it with the drawer, or it floats on over
            // the canvas with its trigger gone (clicking the open trigger
            // closes it — 43's rule for strip popups).
            var openTrig = document.querySelector('#mixerPresetsTrigger.active');
            if (openTrig) openTrig.click();
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
