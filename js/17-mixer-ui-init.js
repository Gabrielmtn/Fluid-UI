/**
 * Mixer UI Initialization
 * Converts key controls to mixer-style components
 */

(function() {
    'use strict';
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMixerUI);
    } else {
        initMixerUI();
    }
    
    function initMixerUI() {
        console.log('Initializing Mixer UI...');
        
        // Add mixer sections for key controls
        createMixerSections();
        
        // Initialize radial sliders for specific controls
        initRadialSliders();
        
        // Style existing controls with mixer theme
        styleMixerControls();
        
        // Add toggle switches
        convertToggles();
    }
    
    function createMixerSections() {
        // Group related controls into mixer sections
        const sections = [
            {
                title: 'Simulation',
                controls: ['densityDissipation', 'velocityDissipation', 'pressureDissipation', 'pressureIteration']
            },
            {
                title: 'Effects',
                controls: ['curl', 'sharpness', 'multiplier']
            },
            {
                title: 'Kaleidoscope',
                controls: ['kaleidoToggle', 'kaleidoSegments', 'kAngle', 'kZoom']
            }
        ];
        
        // Note: This is a template for future refactoring
        // For now, we'll apply styles to existing structure
    }
    
    function initRadialSliders() {
        // Check if RadialSlider class is available
        if (typeof RadialSlider === 'undefined') {
            console.warn('RadialSlider class not found');
            return;
        }
        
        // Example: Create radial slider for multiplier
        // This would replace the existing range input
        // Uncomment when ready to implement:
        /*
        const multiplierContainer = document.querySelector('#multiplier').parentElement;
        const radialContainer = document.createElement('div');
        radialContainer.className = 'radialSlider';
        
        const radial = new RadialSlider(radialContainer, {
            min: 1,
            max: 8,
            value: 1,
            step: 1,
            label: 'Multiplier',
            id: 'multiplier-radial',
            format: (val) => `${val}x`,
            onChange: (value) => {
                // Update config and UI
                if (window.config) {
                    window.config.SPLAT_RADIUS = value;
                }
            }
        });
        
        multiplierContainer.parentElement.insertBefore(radialContainer, multiplierContainer);
        */
    }
    
    function styleMixerControls() {
        // Add mixer-inset class to range inputs
        const rangeInputs = document.querySelectorAll('.mixer-style input[type="range"]');
        rangeInputs.forEach(input => {
            const wrapper = input.parentElement;
            if (!wrapper.classList.contains('progressSlider')) {
                // Wrap in progressSlider if not already
                const container = document.createElement('div');
                container.className = 'progressSlider';
                
                // Add min/max labels
                const minLabel = document.createElement('span');
                minLabel.textContent = input.min || '0';
                
                const maxLabel = document.createElement('span');
                maxLabel.textContent = input.max || '100';
                
                input.parentNode.insertBefore(container, input);
                container.appendChild(minLabel);
                container.appendChild(input);
                container.appendChild(maxLabel);
            }
        });
        
        // Style buttons with mixer gradient
        const buttons = document.querySelectorAll('.mixer-style button:not(.titlebar-button):not(.stats-close-btn)');
        buttons.forEach(button => {
            if (!button.classList.contains('mixer-styled')) {
                button.classList.add('mixer-styled');
            }
        });
    }
    
    function convertToggles() {
        // Convert checkboxes to mixer-style toggles
        const checkboxGroups = document.querySelectorAll('.mixer-style .checkbox-group');
        
        checkboxGroups.forEach(group => {
            const checkbox = group.querySelector('input[type="checkbox"]');
            const label = group.querySelector('label');
            
            if (checkbox && label && !checkbox.classList.contains('mixer-toggle')) {
                // Mark as converted
                checkbox.classList.add('mixer-toggle', 'toggle');
                
                // Wrap in toggle container
                const container = document.createElement('div');
                container.className = 'toggleContainer';
                
                const title = document.createElement('div');
                title.className = 'title';
                title.textContent = label.textContent;
                
                // Create new label for toggle switch
                const toggleLabel = document.createElement('label');
                toggleLabel.setAttribute('for', checkbox.id);
                
                // Replace structure
                group.parentNode.insertBefore(container, group);
                container.appendChild(title);
                container.appendChild(checkbox);
                container.appendChild(toggleLabel);
                group.remove();
            }
        });
    }
    
    // Add button container wrapper for action buttons
    function createButtonContainer(buttons) {
        const container = document.createElement('div');
        container.className = 'buttonContainer';
        
        buttons.forEach(btn => {
            container.appendChild(btn.cloneNode(true));
            btn.remove();
        });
        
        return container;
    }
    
    // Update progress slider values dynamically
    function updateProgressSliders() {
        const sliders = document.querySelectorAll('.progressSlider input[type="range"]');
        
        sliders.forEach(slider => {
            const updateProgress = () => {
                const value = slider.value;
                const min = slider.min || 0;
                const max = slider.max || 100;
                const percent = ((value - min) / (max - min)) * 100;
                slider.style.setProperty('--progress-percent', `${percent}%`);
            };
            
            slider.addEventListener('input', updateProgress);
            updateProgress(); // Initial update
        });
    }
    
    // Initialize progress slider updates
    updateProgressSliders();
    
    console.log('Mixer UI initialized');
})();
