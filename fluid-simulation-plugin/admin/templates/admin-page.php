<?php
/**
 * Admin page template for Fluid Simulation
 *
 * @package Fluid_Simulation
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}
?>

<div class="wrap">
    <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

    <div style="margin-bottom: 20px;">
        <p><?php _e('Create stunning fluid simulations with this interactive WebGL2-based tool. Use the controls on the right to customize your simulation.', 'fluid-simulation'); ?></p>
        <p><strong><?php _e('Shortcode:', 'fluid-simulation'); ?></strong> <code>[fluid_simulation]</code></p>
        <p><?php _e('To display the fluid simulation on any page or post, simply add the shortcode above.', 'fluid-simulation'); ?></p>
    </div>

    <div class="fluid-simulation-wrapper">
    <div id="canvas-area">
        <div id="canvas-wrapper">
            <div id="canvas-size-display">800 × 600</div>

            <!-- Corner locks -->
            <div class="corner-lock lock-nw" data-corner="nw" title="Lock top-left corner">🔓</div>
            <div class="corner-lock lock-ne" data-corner="ne" title="Lock top-right corner">🔓</div>
            <div class="corner-lock lock-se" data-corner="se" title="Lock bottom-right corner">🔓</div>
            <div class="corner-lock lock-sw" data-corner="sw" title="Lock bottom-left corner">🔓</div>

            <!-- Resize handles -->
            <div class="resize-handle corner resize-nw"></div>
            <div class="resize-handle edge resize-n"></div>
            <div class="resize-handle corner resize-ne"></div>
            <div class="resize-handle edge resize-e"></div>
            <div class="resize-handle corner resize-se"></div>
            <div class="resize-handle edge resize-s"></div>
            <div class="resize-handle corner resize-sw"></div>
            <div class="resize-handle edge resize-w"></div>

            <div id="layers-container">
                <div class="background-layer" id="layer0"></div>
                <div class="background-layer" id="layer1"></div>
                <div class="background-layer" id="layer2"></div>
                <div class="background-layer" id="layer3"></div>
                <div class="background-layer" id="layer4"></div>
                <div class="background-layer" id="layer5"></div>
                <div class="background-layer" id="layer6"></div>
                <div class="background-layer" id="layer7"></div>
                <div class="background-layer" id="layer8"></div>
                <div class="background-layer" id="layer9"></div>
            </div>
            <canvas id="canvas"></canvas>
            <canvas id="trailCanvas"></canvas>
            <div id="customCursor"></div>
        </div>
    </div>

    <!-- Recorded Layers Drawer (full-width) -->
    <div id="recDrawer" class="rec-drawer">
        <div id="recResizeHandle" class="rec-resize-handle"><div class="rec-grabber"></div></div>
        <div class="rec-header">
            <div class="rec-left">
                <strong>Recorded Layers</strong>
                <span id="recStatus" style="font-size:12px; opacity:0.7; margin-left:8px;">Ready</span>
            </div>
            <div class="rec-right">
                <label style="font-size:12px; opacity:0.8;">Speed</label>
                <select id="recPlaybackSpeed">
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1x</option>
                    <option value="2">2x</option>
                    <option value="4">4x</option>
                </select>
                <label style="font-size:12px; opacity:0.8; margin-left:10px;">Max</label>
                <input type="text" id="recMaxDuration" class="time-input" value="00:10:000" placeholder="mm:ss:ms" style="width:110px;">
                <button id="recCloseBtn" class="rec-close">✕</button>
            </div>
        </div>
        <div class="rec-header" style="gap:6px;">
            <div class="rec-left" style="gap:6px;">
                <button id="recRecordBtn">⏺ Record</button>
                <button id="recPlayBtn">▶ Play Layer</button>
                <button id="recPlayAllBtn">▶▶ Play All</button>
                <button id="recStopBtn">⏹ Stop</button>
                <button id="recAddLayerBtn">➕ Add Layer</button>
                <button id="recDuplicateLayerBtn">📋 Duplicate</button>
                <button id="recDeleteLayerBtn">🗑 Delete</button>
                <button id="recClearBtn">🧹 Clear Active</button>
                <button id="recExportBtn">💾 Export</button>
                <button id="recImportBtn">📁 Import</button>
                <input type="file" id="recImportFile" accept=".json" style="display:none;" />
            </div>
        </div>
        <div class="rec-timeline-wrap">
            <canvas id="recTimelineCanvas" class="rec-timeline"></canvas>
            <div id="recPlayhead" class="rec-playhead" style="left:0;"></div>
            <div id="recRecordhead" class="rec-recordhead" style="left:0;"></div>
        </div>
        <div class="rec-body">
            <div id="recLayersList" class="layers-panel"></div>
        </div>
    </div>

    <div class="controls">
        <div class="control-group">
            <label>Brush Size</label>
            <input type="range" id="brushSize" min="1" max="30" value="11" step="0.1">
        </div>
        <div class="control-group">
            <label>Visual Quality</label>
            <select id="visualResolution">
                <option value="2048" selected>Ultra High (2048)</option>
                <option value="1536">Very High (1536)</option>
                <option value="1024">High (1024)</option>
                <option value="512">Medium (512)</option>
                <option value="256">Low (256)</option>
                <option value="128">Very Low (128)</option>
            </select>
        </div>
        <div class="control-group">
            <label>Physics Resolution</label>
            <select id="physicsResolution">
                <option value="512" selected>512 (Extreme precision)</option>
                <option value="384">384 (Very High)</option>
                <option value="256">256 (High quality)</option>
                <option value="128">128 (Balanced)</option>
                <option value="64">64 (Performance)</option>
                <option value="32">32 (Fast)</option>
                <option value="16">16 (Maximum speed)</option>
            </select>
        </div>

        <div class="control-group">
            <label>Density Sustain</label>
            <input type="range" id="densityDissipation" min="0.85" max="1.005" value="0.996" step="0.0001">
            <span id="densityValue" style="font-size: 10px; opacity: 0.7;">0.9960</span>
        </div>

        <div class="control-group">
            <label>Velocity Sustain</label>
            <input type="range" id="velocityDissipation" min="0.9" max="1.0009" value="0.999" step="0.0001">
            <span id="velocityValue" style="font-size: 10px; opacity: 0.7;">0.9990</span>
        </div>

        <div class="control-group">
            <label>Pressure Dissipation</label>
            <input type="range" id="pressureDissipation" min="0.9" max="1.0333" value="0.944" step="0.001">
            <span id="pressureValue" style="font-size: 10px; opacity: 0.7;">0.944</span>
        </div>

        <div class="control-group">
            <label>Pressure Iteration</label>
            <input type="range" id="pressureIteration" min="1" max="150" value="95" step="1">
            <span id="iterationValue" style="font-size: 10px; opacity: 0.7;">95</span>
        </div>

        <div class="control-group">
            <label>Curl</label>
            <input type="range" id="curl" min="0" max="60" value="40" step="1">
            <span id="curlValue" style="font-size: 10px; opacity: 0.7;">40</span>
        </div>

        <div class="control-group">
            <label>✨ Multiplier</label>
            <input type="range" id="multiplier" min="1" max="8" value="1" step="1">
            <span id="multiplierValue" style="font-size: 10px; opacity: 0.7;">1x</span>
        </div>

        <div class="control-group">
            <label>Fluid Color</label>
            <input type="color" id="colorPicker" value="#ff0000">
            <div class="color-actions">
                <button onclick="saveColor()">Save Color</button>
                <button onclick="clearColors()">Clear All</button>
            </div>
            <div class="saved-colors" id="savedColors"></div>
            <div style="margin-top: 10px;">
                <label>Palette</label>
                <div class="palette-row">
                    <select id="paletteSelector"></select>
                </div>
                <div class="palette-preview" id="palettePreview"></div>
                <div class="palette-step" id="paletteStepIndicator"></div>
            </div>
        </div>

        <div class="control-group checkbox-group">
            <input type="checkbox" id="randomColor" checked>
            <label for="randomColor" style="margin: 0">Random Colors</label>
        </div>

        <div class="control-group checkbox-group">
            <input type="checkbox" id="stepPalette">
            <label for="stepPalette" style="margin: 0">Step through palette</label>
        </div>

        <div class="control-group" style="margin-top: 10px;">
            <label>Background Color</label>
            <input type="color" id="backgroundColorPicker" value="#000000">
        </div>

        <div class="control-group" style="margin-top: 10px;">
            <label>Canvas Opacity (Sim Visibility)</label>
            <input type="range" id="canvasOpacity" min="0" max="100" value="100" step="1">
            <span id="opacityValue" style="font-size: 10px; opacity: 0.7;">100%</span>
        </div>

        <div class="control-group checkbox-group" style="margin-top: 5px; margin-left: 10px;">
            <input type="checkbox" id="preserveFluidOpacity">
            <label for="preserveFluidOpacity" style="margin: 0">Preserve Fluid Opacity</label>
        </div>

        <div class="control-group" style="margin-top: 10px;">
            <label>Background Transparency</label>
            <input type="range" id="captureDimming" min="0" max="100" value="80" step="1">
            <span id="dimmingValue" style="font-size: 10px; opacity: 0.7;">80%</span>
        </div>

        <div class="control-group checkbox-group">
            <input type="checkbox" id="trailToggle" checked>
            <label for="trailToggle" style="margin: 0">Show Trail</label>
        </div>

        <div class="control-group checkbox-group">
            <input type="checkbox" id="cursorToggle" checked>
            <label for="cursorToggle" style="margin: 0">Show Cursor</label>
        </div>

        <div class="control-group checkbox-group">
            <input type="checkbox" id="showCanvasHandles" checked>
            <label for="showCanvasHandles" style="margin: 0">Show Canvas Border & Handles</label>
        </div>

        <div class="control-group checkbox-group">
            <input type="checkbox" id="lockCanvasBorders">
            <label for="lockCanvasBorders" style="margin: 0">Lock Canvas Borders</label>
        </div>

        <div class="control-group">
            <label>Presets</label>
            <div class="presets">
                <button onclick="applyPreset('silky')">Silky</button>
                <button onclick="applyPreset('thick')">Thick</button>
                <button onclick="applyPreset('wispy')">Wispy</button>
                <button onclick="applyPreset('chaotic')">Chaotic</button>
                <button onclick="applyPreset('ethereal')">Ethereal</button>
                <button onclick="applyPreset('turbulent')">Turbulent</button>
                <button onclick="applyPreset('marble')">Marble</button>
                <button onclick="applyPreset('electric')">Electric</button>
            </div>
        </div>

        <button onclick="togglePause()" id="pauseBtn" style="width: 100%; margin-top: 10px">Pause</button>
        <button onclick="clearCanvas()" style="width: 100%; margin-top: 10px">Clear</button>
        <button onclick="toggleFreeze()" id="freezeBtn" style="width: 100%; margin-top: 10px">❄️ Freeze</button>
        <button id="smashBtn" style="width: 100%; margin-top: 10px; background: rgba(255, 100, 100, 0.2); padding: 8px; line-height: 1.3;">
            <div style="font-size: 1.1em; margin-bottom: 2px;">💥 Smash</div>
            <div style="font-size: 0.7em; opacity: 0.7;">Left: Collide | Right: Expand</div>
        </button>
        <button id="jellyfishBtn" style="width: 100%; margin-top: 10px; background: rgba(100, 150, 255, 0.2); padding: 8px; line-height: 1.3;">
            <div style="font-size: 1.1em; margin-bottom: 2px;">🪼 Jellyfish</div>
            <div style="font-size: 0.7em; opacity: 0.7;">Left: Single | Right: Swarm</div>
        </button>
        <button onclick="playPortraitAnimation()" style="width: 100%; margin-top: 10px; background: rgba(200, 150, 255, 0.2);">🎨 Portrait</button>

        <button id="vortexBtn" style="width: 100%; margin-top: 10px; background: rgba(255, 200, 100, 0.2); padding: 8px; line-height: 1.3;">
            <div style="font-size: 1.1em; margin-bottom: 2px;">🌀 Vortex</div>
            <div style="font-size: 0.7em; opacity: 0.7;">Left: Clockwise | Right: Counter</div>
        </button>

        <button id="ascendToggle" style="width: 100%; margin-top: 10px; background: rgba(150, 255, 200, 0.2);">⬆️ Ascend</button>

        <div class="control-group checkbox-group" style="margin-top: 5px; margin-left: 10px;">
            <input type="checkbox" id="ascendRandomness">
            <label for="ascendRandomness" style="margin: 0">Ascend Randomness</label>
        </div>

        <button id="portalBtn" style="width: 100%; margin-top: 10px; background: rgba(255, 100, 255, 0.2); padding: 8px; line-height: 1.3;">
            <div style="font-size: 1.1em; margin-bottom: 2px;">🌀 Portal</div>
            <div style="font-size: 0.7em; opacity: 0.7;">Left: Swoop | Right: Expand</div>
        </button>

        <button id="captureBtn" style="width: 100%; margin-top: 10px; background: rgba(100, 255, 100, 0.2);">Capture Layer</button>

        <div class="control-group checkbox-group" style="margin-top: 10px;">
            <input type="checkbox" id="hoverCaptureToggle">
            <label for="hoverCaptureToggle" style="margin: 0">Enable Capture on Hover</label>
        </div>

        <input type="file" id="imageUpload" accept="image/png,image/jpeg,image/jpg" style="display: none;">
        <button id="uploadBtn" style="width: 100%; margin-top: 10px; background: rgba(255, 200, 100, 0.2);">📁 Upload Image Layer</button>

        <div class="preview-toggle" id="previewToggle"
             onmouseenter="showPreview()"
             onmouseleave="hidePreview()">
            <div style="font-weight: bold; margin-bottom: 5px;">👁️ PREVIEW LAYERS</div>
            <div style="font-size: 11px;">Hover to view stacked PNGs</div>
        </div>

        <div class="control-group checkbox-group" id="recToggleGroup" style="margin-top: 10px;">
            <input type="checkbox" id="recToggle">
            <label for="recToggle" style="margin: 0">Enable Recorded Layers</label>
        </div>

        <div class="control-group" style="margin-top: 20px">
            <label>Layers</label>
            <div class="layers-panel" id="layersPanel"></div>
        </div>
    </div>

    <div id="hotkeyOverlay">
        <div class="hotkey-modal">
            <div class="hotkey-header">
                <h2>Hotkeys</h2>
                <button class="close-btn" id="hotkeyClose">×</button>
            </div>
            <div class="hotkey-body">
                <div>
                    <h3>Undo/Redo</h3>
                    <ul>
                        <li>Ctrl+Z — Undo</li>
                        <li>Ctrl+Y / Ctrl+Shift+Z — Redo</li>
                    </ul>
                </div>
                <div>
                    <h3>Canvas/Display</h3>
                    <ul>
                        <li>T — Toggle Trail</li>
                        <li>C — Toggle Cursor</li>
                        <li>H — Toggle Border & Handles</li>
                        <li>L — Lock/Unlock Borders</li>
                    </ul>
                </div>
                <div>
                    <h3>Brush</h3>
                    <ul>
                        <li>[ / ] — Brush Size − / +</li>
                        <li>Shift+[ / Shift+] — Coarse − / +</li>
                    </ul>
                </div>
                <div>
                    <h3>Colors & Palettes</h3>
                    <ul>
                        <li>R — Toggle Random Colors</li>
                        <li>A — Toggle Step Through Palette</li>
                        <li>N — Next Color</li>
                        <li>Shift+S — Save Color</li>
                        <li>Shift+X — Clear Colors</li>
                        <li>Ctrl+← / Ctrl+→ — Prev/Next Palette</li>
                    </ul>
                </div>
                <div>
                    <h3>Resolution</h3>
                    <ul>
                        <li>Alt+↑ / Alt+↓ — Visual Quality + / −</li>
                        <li>Alt+Shift+↑ / Alt+Shift+↓ — Physics + / −</li>
                    </ul>
                </div>
                <div>
                    <h3>Help</h3>
                    <ul>
                        <li>F1 or ? — Toggle Hotkeys</li>
                        <li>Esc — Close</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
    </div><!-- .fluid-simulation-wrapper -->
</div><!-- .wrap -->
