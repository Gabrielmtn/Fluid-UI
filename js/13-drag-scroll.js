// Drag-to-scroll functionality for scrollable containers
(function() {
    'use strict';

    // Enable drag scrolling for elements with specific selectors
    const scrollableSelectors = ['.rec-body', '.layers-panel'];
    
    function enableDragScroll(element) {
        if (!element || element._dragScrollEnabled) return;
        
        let isDown = false;
        let startX, startY;
        let scrollLeft, scrollTop;
        let hasMoved = false;
        
        element.addEventListener('mousedown', (e) => {
            // Only enable drag-scroll on the container itself or non-interactive elements
            // Don't interfere with buttons, inputs, etc.
            if (e.target.closest('button, input, textarea, select, a, .layer-btn')) {
                return;
            }
            
            isDown = true;
            hasMoved = false;
            element.style.cursor = 'grabbing';
            element.style.userSelect = 'none';
            
            startX = e.pageX - element.offsetLeft;
            startY = e.pageY - element.offsetTop;
            scrollLeft = element.scrollLeft;
            scrollTop = element.scrollTop;
        });
        
        element.addEventListener('mouseleave', () => {
            isDown = false;
            element.style.cursor = '';
            element.style.userSelect = '';
        });
        
        element.addEventListener('mouseup', (e) => {
            isDown = false;
            element.style.cursor = '';
            element.style.userSelect = '';
            
            // If we dragged significantly, prevent click events from firing
            if (hasMoved) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        
        element.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            
            e.preventDefault();
            
            const x = e.pageX - element.offsetLeft;
            const y = e.pageY - element.offsetTop;
            const walkX = (x - startX) * 1.5; // Scroll speed multiplier
            const walkY = (y - startY) * 1.5;
            
            // Consider it "moved" if dragged more than 5 pixels
            if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
                hasMoved = true;
            }
            
            element.scrollLeft = scrollLeft - walkX;
            element.scrollTop = scrollTop - walkY;
        });
        
        // Touch support for mobile devices
        let touchStartX, touchStartY;
        
        element.addEventListener('touchstart', (e) => {
            if (e.target.closest('button, input, textarea, select, a, .layer-btn')) {
                return;
            }
            
            const touch = e.touches[0];
            touchStartX = touch.pageX;
            touchStartY = touch.pageY;
            scrollLeft = element.scrollLeft;
            scrollTop = element.scrollTop;
        }, { passive: true });
        
        element.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const walkX = (touch.pageX - touchStartX);
            const walkY = (touch.pageY - touchStartY);
            
            element.scrollLeft = scrollLeft - walkX;
            element.scrollTop = scrollTop - walkY;
        }, { passive: true });
        
        element._dragScrollEnabled = true;
    }
    
    // Initialize drag-scroll for existing elements
    function initDragScroll() {
        scrollableSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                enableDragScroll(element);
            });
        });
    }
    
    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDragScroll);
    } else {
        initDragScroll();
    }
    
    // Re-initialize when elements are added dynamically
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    scrollableSelectors.forEach(selector => {
                        if (node.matches && node.matches(selector)) {
                            enableDragScroll(node);
                        }
                        const children = node.querySelectorAll ? node.querySelectorAll(selector) : [];
                        children.forEach(child => enableDragScroll(child));
                    });
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Expose for manual initialization if needed
    window.enableDragScroll = enableDragScroll;
    window.initDragScroll = initDragScroll;
})();
