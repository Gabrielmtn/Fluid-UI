/**
 * LayersGroup - Layer management controls
 * Includes capture, upload, hover, detach toggles
 */

class LayersGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Layer states
        this.state = {
            hoverCapture: false,
            detachCapture: false,
            ...this.state
        };
    }
    
    /**
     * Render layers group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <button id="${this.id}-capture" 
                        style="width: 100%; margin-top: 10px; background: rgba(100, 255, 100, 0.2);"
                        data-action="capture">
                    Capture Layer
                </button>
                
                <button id="${this.id}-upload" 
                        style="width: 100%; margin-top: 10px; background: rgba(255, 200, 100, 0.2);"
                        data-action="upload">
                    📁 Upload Image Layer
                </button>
                
                <div class="control-group checkbox-group" style="margin-top: 10px;">
                    <input type="checkbox" 
                           id="${this.id}-hoverCapture"
                           ${this.state.hoverCapture ? 'checked' : ''}>
                    <label for="${this.id}-hoverCapture" style="margin: 0">Enable Capture on Hover</label>
                </div>
                
                <div class="control-group checkbox-group" style="margin-top: 6px;">
                    <input type="checkbox" 
                           id="${this.id}-detachCapture"
                           ${this.state.detachCapture ? 'checked' : ''}>
                    <label for="${this.id}-detachCapture" style="margin: 0">Detach Capture Area</label>
                </div>
                
                <div class="preview-toggle" 
                     id="${this.id}-preview"
                     style="margin-top: 10px; padding: 10px; background: rgba(100, 150, 255, 0.2); border-radius: 4px; cursor: pointer; text-align: center;">
                    <div style="font-weight: bold; margin-bottom: 5px;">👁️ PREVIEW LAYERS</div>
                    <div style="font-size: 11px;">Hover to view stacked PNGs</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Capture button
        const captureBtn = this.find('[data-action="capture"]');
        if (captureBtn) {
            this._captureHandler = () => {
                this.emit('capture');
            };
            captureBtn.addEventListener('click', this._captureHandler);
        }
        
        // Upload button
        const uploadBtn = this.find('[data-action="upload"]');
        if (uploadBtn) {
            this._uploadHandler = () => {
                this.emit('upload');
            };
            uploadBtn.addEventListener('click', this._uploadHandler);
        }
        
        // Hover capture toggle
        const hoverToggle = this.find(`#${this.id}-hoverCapture`);
        if (hoverToggle) {
            this._hoverHandler = (e) => {
                this.setState({ hoverCapture: e.target.checked }, false);
                this.emit('hoverCaptureChange', e.target.checked);
            };
            hoverToggle.addEventListener('change', this._hoverHandler);
        }
        
        // Detach capture toggle
        const detachToggle = this.find(`#${this.id}-detachCapture`);
        if (detachToggle) {
            this._detachHandler = (e) => {
                this.setState({ detachCapture: e.target.checked }, false);
                this.emit('detachCaptureChange', e.target.checked);
            };
            detachToggle.addEventListener('change', this._detachHandler);
        }
        
        // Preview hover
        const previewEl = this.find(`#${this.id}-preview`);
        if (previewEl) {
            this._previewEnterHandler = () => {
                if (typeof showPreview === 'function') showPreview();
            };
            this._previewLeaveHandler = () => {
                if (typeof hidePreview === 'function') hidePreview();
            };
            previewEl.addEventListener('mouseenter', this._previewEnterHandler);
            previewEl.addEventListener('mouseleave', this._previewLeaveHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const captureBtn = this.find('[data-action="capture"]');
        if (captureBtn && this._captureHandler) {
            captureBtn.removeEventListener('click', this._captureHandler);
        }
        
        const uploadBtn = this.find('[data-action="upload"]');
        if (uploadBtn && this._uploadHandler) {
            uploadBtn.removeEventListener('click', this._uploadHandler);
        }
        
        const hoverToggle = this.find(`#${this.id}-hoverCapture`);
        if (hoverToggle && this._hoverHandler) {
            hoverToggle.removeEventListener('change', this._hoverHandler);
        }
        
        const detachToggle = this.find(`#${this.id}-detachCapture`);
        if (detachToggle && this._detachHandler) {
            detachToggle.removeEventListener('change', this._detachHandler);
        }
        
        const previewEl = this.find(`#${this.id}-preview`);
        if (previewEl) {
            if (this._previewEnterHandler) {
                previewEl.removeEventListener('mouseenter', this._previewEnterHandler);
            }
            if (this._previewLeaveHandler) {
                previewEl.removeEventListener('mouseleave', this._previewLeaveHandler);
            }
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.LayersGroup = LayersGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LayersGroup;
}
