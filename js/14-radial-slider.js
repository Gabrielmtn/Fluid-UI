/**
 * Radial Slider (Jog/Knob) Component
 * Creates rotary controls inspired by audio mixer knobs
 */

class RadialSlider {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            min: options.min || 0,
            max: options.max || 100,
            value: options.value || 50,
            step: options.step || 1,
            label: options.label || '',
            onChange: options.onChange || (() => {}),
            ...options
        };
        
        this.value = this.options.value;
        this.isDragging = false;
        this.startAngle = 0;
        this.currentAngle = 0;
        
        this.init();
    }
    
    init() {
        // Create SVG structure
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100');
        svg.setAttribute('height', '100');
        svg.setAttribute('viewBox', '0 0 100 100');
        
        // Create gradients
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', `jogGradient-${Math.random().toString(36).substr(2, 9)}`);
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '0%');
        gradient.setAttribute('y2', '100%');
        
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('style', 'stop-color:#3a3a3a;stop-opacity:1');
        
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('style', 'stop-color:#1a1a1a;stop-opacity:1');
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        svg.appendChild(defs);
        
        // Background circle (jog)
        const jog = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        jog.setAttribute('class', 'jog');
        jog.setAttribute('cx', '50');
        jog.setAttribute('cy', '50');
        jog.setAttribute('r', '35');
        jog.setAttribute('fill', `url(#${gradient.id})`);
        
        // Background arc (track)
        const barBg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        barBg.setAttribute('class', 'bar');
        barBg.setAttribute('d', this.describeArc(50, 50, 40, -135, 135));
        
        // Active arc (progress)
        this.barActive = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.barActive.setAttribute('class', 'barActive');
        this.barActive.setAttribute('d', this.describeArc(50, 50, 40, -135, this.valueToAngle(this.value)));
        
        // Thumb indicator
        const thumbPos = this.angleToPosition(this.valueToAngle(this.value), 40);
        this.thumb = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.thumb.setAttribute('class', 'thumb');
        this.thumb.setAttribute('cx', thumbPos.x);
        this.thumb.setAttribute('cy', thumbPos.y);
        this.thumb.setAttribute('r', '4');
        
        // Container for interaction
        const jogContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        jogContainer.setAttribute('class', 'jogContainer');
        jogContainer.appendChild(jog);
        jogContainer.appendChild(barBg);
        jogContainer.appendChild(this.barActive);
        jogContainer.appendChild(this.thumb);
        
        svg.appendChild(jogContainer);
        
        // Label
        const label = document.createElement('label');
        label.textContent = this.options.label;
        
        // Value display
        this.display = document.createElement('div');
        this.display.className = 'dotDisplay';
        this.display.textContent = this.formatValue(this.value);
        
        // Hidden input for form compatibility
        this.input = document.createElement('input');
        this.input.type = 'hidden';
        this.input.value = this.value;
        if (this.options.id) {
            this.input.id = this.options.id;
            this.input.name = this.options.id;
        }
        
        // Assemble
        this.container.innerHTML = '';
        this.container.appendChild(label);
        this.container.appendChild(svg);
        this.container.appendChild(this.display);
        this.container.appendChild(this.input);
        
        // Event listeners
        this.bindEvents(jogContainer);
    }
    
    bindEvents(element) {
        const startDrag = (e) => {
            this.isDragging = true;
            const rect = this.container.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            this.startAngle = Math.atan2(clientY - centerY, clientX - centerX);
            e.preventDefault();
        };
        
        const drag = (e) => {
            if (!this.isDragging) return;
            
            const rect = this.container.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            const angle = Math.atan2(clientY - centerY, clientX - centerX);
            
            let delta = angle - this.startAngle;
            if (delta > Math.PI) delta -= 2 * Math.PI;
            if (delta < -Math.PI) delta += 2 * Math.PI;
            
            const sensitivity = 0.5;
            const range = this.options.max - this.options.min;
            const valueDelta = (delta / (2 * Math.PI)) * range * sensitivity;
            
            let newValue = this.value + valueDelta;
            newValue = Math.max(this.options.min, Math.min(this.options.max, newValue));
            
            // Apply step
            newValue = Math.round(newValue / this.options.step) * this.options.step;
            
            if (newValue !== this.value) {
                this.setValue(newValue);
                this.options.onChange(newValue);
            }
            
            this.startAngle = angle;
            e.preventDefault();
        };
        
        const endDrag = () => {
            this.isDragging = false;
        };
        
        element.addEventListener('mousedown', startDrag);
        element.addEventListener('touchstart', startDrag, { passive: false });
        
        window.addEventListener('mousemove', drag);
        window.addEventListener('touchmove', drag, { passive: false });
        
        window.addEventListener('mouseup', endDrag);
        window.addEventListener('touchend', endDrag);
    }
    
    setValue(value) {
        this.value = value;
        this.input.value = value;
        this.display.textContent = this.formatValue(value);
        
        const angle = this.valueToAngle(value);
        this.barActive.setAttribute('d', this.describeArc(50, 50, 40, -135, angle));
        
        const thumbPos = this.angleToPosition(angle, 40);
        this.thumb.setAttribute('cx', thumbPos.x);
        this.thumb.setAttribute('cy', thumbPos.y);
    }
    
    getValue() {
        return this.value;
    }
    
    valueToAngle(value) {
        const percent = (value - this.options.min) / (this.options.max - this.options.min);
        return -135 + (percent * 270);
    }
    
    angleToPosition(angle, radius) {
        const rad = (angle * Math.PI) / 180;
        return {
            x: 50 + radius * Math.cos(rad),
            y: 50 + radius * Math.sin(rad)
        };
    }
    
    describeArc(x, y, radius, startAngle, endAngle) {
        const start = this.angleToPosition(startAngle, radius);
        const end = this.angleToPosition(endAngle, radius);
        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
        
        return [
            'M', start.x, start.y,
            'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y
        ].join(' ');
    }
    
    formatValue(value) {
        if (this.options.format) {
            return this.options.format(value);
        }
        return value.toFixed(this.options.decimals || 0);
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.RadialSlider = RadialSlider;
}
