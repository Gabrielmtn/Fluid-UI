/**
 * Slider Value Updater
 * Updates CSS custom properties for slider position tracking
 */

(function initSliderValueTracking() {
    // Update slider CSS variables on input
    function updateSliderValue(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        
        slider.style.setProperty('--min', min);
        slider.style.setProperty('--max', max);
        slider.style.setProperty('--val', val);
    }
    
    // Initialize all range sliders
    function initSliders() {
        const sliders = document.querySelectorAll('input[type="range"]');
        
        sliders.forEach(slider => {
            // Set initial value
            updateSliderValue(slider);
            
            // Update on input
            slider.addEventListener('input', () => {
                updateSliderValue(slider);
            });
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSliders);
    } else {
        initSliders();
    }
})();
