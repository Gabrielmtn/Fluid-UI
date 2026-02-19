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

    // Detect if device is mobile/tablet
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || (window.innerWidth <= 768);
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
        
        console.log('Mobile mode disabled');
    }

    // Toggle menu visibility
    function toggleMenu() {
        if (!controls) return;
        
        const isVisible = controls.classList.contains('visible');
        
        if (isVisible) {
            controls.classList.remove('visible');
        } else {
            controls.classList.add('visible');
        }
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

        // Menu toggle button click
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMenu();
            });
        }

        // Menu close button click
        if (mobileMenuClose) {
            mobileMenuClose.addEventListener('click', (e) => {
                e.stopPropagation();
                if (controls) {
                    controls.classList.remove('visible');
                }
            });
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
