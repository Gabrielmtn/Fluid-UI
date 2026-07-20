// ═══════════════════════════════════════════════════════════════════
// js/04f-canvas-actions.js — part 6/7 of former 04-ui-interactions.js (lines 2921–3320)
// LOAD ORDER: after 04e-anim-portal.js, before 04g-hover-capture.js
// PROVIDES: wipeSimulation, clearCanvas, togglePause, captureLayer, image upload
// REQUIRES: gl/config (04a); layers (05k, runtime)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        function wipeSimulation() {

            gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);

            gl.clearColor(0, 0, 0, 0);

            gl.clear(gl.COLOR_BUFFER_BIT);

            density.swap();

            

            gl.bindFramebuffer(gl.FRAMEBUFFER, density.read.fbo);

            gl.clear(gl.COLOR_BUFFER_BIT);

            

            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);

            gl.clear(gl.COLOR_BUFFER_BIT);

            velocity.swap();

            

            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.fbo);

            gl.clear(gl.COLOR_BUFFER_BIT);

        }

        

        window.clearCanvas = () => {

            wipeSimulation();

            // Broadcast to multiplayer clients

            if (typeof broadcastClear === 'function') {

                broadcastClear();

            }

        };

        

        window.togglePause = () => {

            isPaused = !isPaused;

            const btn = document.getElementById('pauseBtn');

            btn.textContent = isPaused ? '▶' : '⏸';

            btn.title = isPaused ? 'Resume simulation' : 'Pause simulation';

            btn.classList.toggle('active', isPaused);

        };

        

        // Respect reduced motion preferences

        (function setupReducedMotion(){

            try {

                const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

                function applyReducedMotion(on) {

                    if (!on) return;

                    // Disable kaleido, set multiplier=1, slightly reduce motion

                    window.kaleidoEnabled = false;

                    const kt = document.getElementById('kaleidoToggle');

                    if (kt) kt.checked = false;

                    animationMultiplier = 1;

                    window.animationMultiplier = 1;

                    const ms = document.getElementById('multiplier');

                    const mv = document.getElementById('multiplierValue');

                    if (ms) { ms.value = '1'; try { ms.style.setProperty('--val', 1); } catch(_){} }

                    if (mv) mv.textContent = '1x';

                    if (typeof config === 'object') {

                        // Nudge velocity influence to moderate motion

                        config.VELOCITY_INFLUENCE = Math.min(config.VELOCITY_INFLUENCE || 3.0, 4.0);

                    }

                }

                if (mq) {

                    applyReducedMotion(!!mq.matches);

                    if (mq.addEventListener) mq.addEventListener('change', (e) => applyReducedMotion(!!e.matches));

                    else if (mq.addListener) mq.addListener((e) => applyReducedMotion(!!e.matches));

                }

            } catch(_) {}

        })();

        

        // Page Visibility: auto-pause when hidden, resume if we paused it

        (function setupVisibilityPause(){

            try {

                let pausedByVisibility = false;

                document.addEventListener('visibilitychange', () => {

                    if (document.hidden) {

                        if (!isPaused) { pausedByVisibility = true; window.togglePause(); }

                    } else {

                        if (pausedByVisibility && isPaused) { window.togglePause(); }

                        pausedByVisibility = false;

                    }

                });

            } catch(_) {}

        })();

        

        // WebGL context loss handling: prevent default loss, reload on restore

        (function setupContextLossHandling(){

            try {

                if (!canvas) return;

                canvas.addEventListener('webglcontextlost', (e) => {

                    try { e.preventDefault(); } catch(_){}

                }, false);

                canvas.addEventListener('webglcontextrestored', () => {

                    // Simplest reliable recovery across modules

                    try { window.location.reload(); } catch(_){}

                }, false);

            } catch(_) {}

        })();

        

        window.captureLayer = () => {

            const ok = typeof doCaptureFromRegion === 'function' ? doCaptureFromRegion() : false;

            if (ok && typeof startCaptureDebounce === 'function') startCaptureDebounce();

        };

        

        // Hover capture functionality

        const captureBtn = document.getElementById('captureBtn');

        const hoverCaptureToggle = document.getElementById('hoverCaptureToggle');

        let hoverCaptureEnabled = false;

        

        hoverCaptureToggle.addEventListener('change', (e) => {

            hoverCaptureEnabled = e.target.checked;

        });

        

        captureBtn.addEventListener('click', () => {

            captureLayer();

        });

        

        captureBtn.addEventListener('mouseenter', () => {

            if (hoverCaptureEnabled && !hoverCaptureCooldown) {

                captureLayer();

            }

        });

        

        // Image upload functionality

        const uploadBtn = document.getElementById('uploadBtn');

        const imageUpload = document.getElementById('imageUpload');

        

        uploadBtn.addEventListener('click', () => {

            imageUpload.click();

        });

        

        imageUpload.addEventListener('change', (e) => {

            const file = e.target.files[0];

            if (!file) return;

            

            // Validate file type

            const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];

            if (!validTypes.includes(file.type)) {

                alert('Please upload a PNG or JPG image.');

                return;

            }

            

            if (layers.length >= MAX_LAYERS) {

                alert('Maximum 10 layers reached. Delete some layers to create new ones.');

                return;

            }

            

            // Find first available slot

            let availableIndex = -1;

            for (let i = 0; i < MAX_LAYERS; i++) {

                if (!layers.find(l => l.index === i)) {

                    availableIndex = i;

                    break;

                }

            }

            

            if (availableIndex === -1) {

                alert('No available layer slots.');

                return;

            }

            

            // Read the file and create layer

            const reader = new FileReader();

            reader.onload = (event) => {

                const dataUrl = event.target.result;

                const layerDiv = document.getElementById(`layer${availableIndex}`);

                layerDiv.style.backgroundImage = `url(${dataUrl})`;

                layerDiv.style.zIndex = availableIndex;

                layerDiv.style.display = 'block';

                

                const layer = {

                    index: availableIndex,

                    title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension

                    data: dataUrl,

                    originalData: dataUrl,

                    visible: true,

                    threshold: 0,

                    mask: {

                        enabled: false,

                        mode: 'show',

                        shapes: []

                    },

                    active: false,

                    x: 0,

                    y: 0,

                    scaleX: 1,

                    scaleY: 1,

                    rotation: 0,

                    // D3-3: clip this image layer by a unified Mask (CSS mask)
                    clipMaskId: null,

                    clipInvert: false

                };

                

                layers.push(layer);

                

                // Add new layer to layerOrder below the sim (furthest from viewer)

                const simIndex = layerOrder.findIndex(item => item.type === 'sim');

                if (simIndex !== -1) {

                    layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });

                } else {

                    layerOrder.push({ type: 'layer', id: availableIndex });

                }

                

                renderLayers();

            };

            

            reader.readAsDataURL(file);

            

            // Reset input so the same file can be uploaded again if needed

            e.target.value = '';

        });

        

