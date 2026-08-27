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

            // Take-turns multiplayer: watchers can't wipe the shared canvas —
            // the relay would drop the broadcast, so a local wipe would
            // silently desync this client from the room. The painter's OWN
            // relayed clear arrives under __mpApplyingRemote and passes (same
            // exemption as every 13.5 settings-lock gate).

            if (window.__mpTurnBlocked && !window.__mpApplyingRemote) {

                if (typeof window.__mpTurnHint === 'function') window.__mpTurnHint();

                return;

            }

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

            btn.title = isPaused ? 'Resume simulation (Shift+Space)' : 'Pause simulation (Shift+Space)';

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

                    // GPU reset (driver TDR/crash). GL resources are gone, but the
                    // param/layer/brush state is CPU-side — snapshot it NOW so the
                    // post-reload offer (12-save-load) can restore the session
                    // instead of silently discarding it. GL-dependent pieces of the
                    // snapshot may fail mid-loss; keep whatever captures.

                    try {

                        if (window.settingsManager && typeof window.capturePresetSnapshot === 'function') {

                            const snap = window.capturePresetSnapshot();

                            // set() returns false on QuotaExceeded — a heavy
                            // multi-layer session (the TDR-prone profile) can
                            // blow the ~5MB origin quota with full-res layer
                            // dataURLs. Degrade via the shared saveUserPreset
                            // ladder: drop the big payloads, keep params/brush.

                            if (snap) {

                                const env = { at: Date.now(), snapshot: snap };

                                if (typeof window.__setSnapshotWithQuotaFallback === 'function') {

                                    window.__setSnapshotWithQuotaFallback('app.contextLossSnapshot', env);

                                } else {

                                    window.settingsManager.set('app.contextLossSnapshot', env);

                                }

                            }

                        }

                    } catch(_) {}

                }, false);

                canvas.addEventListener('webglcontextrestored', () => {

                    // Simplest reliable recovery across modules. Bypass the
                    // unsaved-work prompt — this reload IS the recovery path.

                    try { window.__unsavedWork = false; } catch(_){}

                    // Ask MAIN to restart rather than reloading from in here.
                    // A bare location.reload() leaves the window fully visible,
                    // so the recovery reads as the app freezing for ~800ms and
                    // then hard-cutting — and this is the one restart path that
                    // ships AND fires with no dialog in front of it. Main
                    // dissolves the window out first and brings it back up the
                    // same ramp as a cold launch. The reload stays as the
                    // fallback for the web build and any shell without ipc.

                    var _restarted = false;

                    try {

                        var _ipc = (typeof require === 'function') && require('electron').ipcRenderer;

                        if (_ipc) { _ipc.send('request-restart', 'webgl context restored'); _restarted = true; }

                    } catch(_){}

                    if (!_restarted) { try { window.location.reload(); } catch(_){} }

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

        

        // Shared image → layer factory (2026-08-09): the upload button and the
        // OS file-drop path (32-file-drop) both land here, so a dropped image
        // behaves exactly like an uploaded one. Capacity/slot checks run at
        // dataURL time so multi-file drops each re-check as they decode.
        // Slots reserved between the synchronous slot-find below and the async
        // probe.onload push — without this, two images dropped together both
        // grab the same index while the first is still decoding.
        const _pendingLayerSlots = new Set();

        // Free image-layer capacity (32-file-drop trims multi-file drops to
        // this so the user gets ONE aggregate message, not an alert per file)
        window.layerSlotsFree = () => Math.max(0, MAX_LAYERS - layers.length - _pendingLayerSlots.size);

        // `onCreated(layer)` fires once the image has decoded and the layer
        // object exists — the slot isn't known before that, and the decode is
        // what sets the aspect fit. Ctrl+Shift+V paste (32-file-drop) uses it
        // to key and collide the layer it just made.
        //
        // D6: a caller that supplies onCreated OWNS the undo record, because it
        // may go on to build more layers that belong to the same action (that
        // paste records the image and its collider as one). Without a callback
        // — the upload button, an OS drop, a plain Ctrl+V — the layer records
        // itself here, so Ctrl+Z takes it back.
        window.createLayerFromDataUrl = (dataUrl, title, onCreated) => {

            if (layers.length + _pendingLayerSlots.size >= MAX_LAYERS) {

                alert('Maximum 10 layers reached. Delete some layers to create new ones.');

                return false;

            }



            // Find first available slot

            let availableIndex = -1;

            for (let i = 0; i < MAX_LAYERS; i++) {

                if (!layers.find(l => l.index === i) && !_pendingLayerSlots.has(i)) {

                    availableIndex = i;

                    break;

                }

            }



            if (availableIndex === -1) {

                alert('No available layer slots.');

                return false;

            }

            {

                // Aspect-fit (2026-08-06): the layer div fills the wrapper and
                // stretches its background (100% 100%), so any image whose
                // aspect differs from the canvas used to upload distorted —
                // and everything derived from it (mask import, collider,
                // thumbnails) inherited the squash. Bake a contain-fit into
                // the layer transform instead: every downstream consumer
                // (renderLayers div transform, obstacle compositors, ⤓ Mask)
                // already honors scaleX/scaleY, and the user can still resize.
                const probe = new Image();

                _pendingLayerSlots.add(availableIndex);

                probe.onload = () => {

                _pendingLayerSlots.delete(availableIndex);

                const canvasEl = document.getElementById('canvas');

                let fitX = 1, fitY = 1;

                if (canvasEl && probe.naturalWidth > 0 && probe.naturalHeight > 0) {

                    const arImg = probe.naturalWidth / probe.naturalHeight;

                    const arCanvas = (canvasEl.width || 1) / (canvasEl.height || 1);

                    if (arImg < arCanvas) fitX = arImg / arCanvas;

                    else if (arImg > arCanvas) fitY = arCanvas / arImg;

                }

                const layerDiv = document.getElementById(`layer${availableIndex}`);

                layerDiv.style.backgroundImage = `url(${dataUrl})`;

                layerDiv.style.zIndex = availableIndex;

                layerDiv.style.display = 'block';

                

                const layer = {

                    index: availableIndex,

                    title: title,

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

                    scaleX: fitX,

                    scaleY: fitY,

                    rotation: 0,

                    skewX: 0,

                    skewY: 0,

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

                if (typeof onCreated === 'function') onCreated(layer);
                else if (typeof window.__recordLayerCreate === 'function') window.__recordLayerCreate([layer.index], 'add layer');

                };

                probe.onerror = probe.onload; // undecodable probe → keep fit 1:1

                probe.src = dataUrl;

            }

            return true;

        };



        window.createLayerFromFile = (file) => {

            if (!file) return;

            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

            if (!validTypes.includes(file.type)) {

                alert('Please upload a PNG, JPG, or WebP image.');

                return;

            }

            const reader = new FileReader();

            reader.onload = (event) => {

                window.createLayerFromDataUrl(event.target.result, file.name.replace(/\.[^/.]+$/, ''));

            };

            reader.readAsDataURL(file);

        };



        imageUpload.addEventListener('change', (e) => {

            const file = e.target.files[0];

            if (!file) return;

            window.createLayerFromFile(file);

            // Reset input so the same file can be uploaded again if needed

            e.target.value = '';

        });

        


        // ── Unsaved-work guard (Steam prep S2-2) ─────────────────────────────
        // Painting is not autosaved; a stray close/reload used to destroy the
        // canvas with no warning. Dirty = any paint gesture since launch;
        // cleared by .fluid save/load (12-save-load). Context-restore reload
        // above bypasses it deliberately.
        //
        // Electron asks through the main process (electron-main.js holds the
        // window's `close` open and pings us) and answers in an in-app modal.
        // The old renderer-side native dialog had two UX faults: it was
        // UNPARENTED, so on a frameless maximized window it could sit BEHIND
        // the app — every click then rang the Windows blocked-window beep and
        // nothing appeared to respond — and its `type: 'question'` rang the
        // message-box chime on open. A DOM modal has neither problem, and it
        // can offer "save first", which a two-button native box could not.
        (function setupUnsavedWorkGuard(){
            try {
                window.__unsavedWork = false;
                if (canvas) canvas.addEventListener('pointerdown', function () {
                    window.__unsavedWork = true;
                }, { passive: true });

                var ipc = null;
                if (window.IS_ELECTRON) {
                    try { ipc = require('electron').ipcRenderer; } catch (_) { ipc = null; }
                }

                var modal = null;      // lazily built DOM
                var onModalKey = null; // Esc handler while it is up
                var askKind = 'close'; // which question is currently on screen
                var pendingReply = null; // how to answer whatever main last asked

                function els() {
                    return {
                        title: modal.querySelector('#appCloseTitle'),
                        msg: modal.querySelector('#appCloseMessage'),
                        keep: modal.querySelector('#appCloseKeep'),
                        save: modal.querySelector('#appCloseSave'),
                        quit: modal.querySelector('#appCloseQuit')
                    };
                }

                function answer(go) {
                    hideModal();
                    var reply = pendingReply;
                    pendingReply = null;
                    if (reply) reply(go);              // answers the id main asked with
                    else if (go) window.__closeApproved = true;
                }

                function hideModal() {
                    if (!modal) return;
                    modal.classList.remove('show');
                    if (onModalKey) {
                        document.removeEventListener('keydown', onModalKey, true);
                        onModalKey = null;
                    }
                }

                function saveFromModal() {
                    var e = els();
                    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
                    var ok = false;
                    try { ok = !!(window.projectFile && window.projectFile.export('painting-' + stamp)); }
                    catch (_) { ok = false; }
                    if (ok) {
                        // Deliberately does NOT go through on its own: the save
                        // can still be settling (and on the web it is a download
                        // that has only just started), so the user gets an
                        // explicit "safe now" instead of a race. The save clears
                        // __unsavedWork, so the next attempt is silent anyway.
                        var reloading = (askKind === 'reload' || askKind === 'hard-reload');
                        e.title.textContent = 'Project saved';
                        e.msg.textContent = 'Saved as a .fluid project. It is safe to '
                            + (reloading ? 'reload' : 'close') + ' now.';
                        e.save.style.display = 'none';
                        e.quit.textContent = reloading ? 'Reload' : 'Close';
                        e.quit.classList.add('app-close-safe');
                        e.quit.focus();
                    } else if (window.__unsavedWork) {
                        // Cancelled the save dialog, or the write failed —
                        // either way the work is still unsaved, and saying so
                        // is the whole point of this prompt.
                        e.msg.textContent = 'Not saved — the save was cancelled or failed. '
                            + 'This painting still has unsaved work.';
                    }
                }

                function buildModal() {
                    var el = document.createElement('div');
                    el.id = 'appCloseModal';
                    el.className = 'delete-modal app-close-modal';
                    el.innerHTML =
                        '<div class="delete-modal-content">' +
                            '<div class="delete-modal-title" id="appCloseTitle">Close without saving?</div>' +
                            '<div class="delete-modal-message" id="appCloseMessage">' +
                                'This painting has unsaved work. Painting is not autosaved — closing now loses it.' +
                            '</div>' +
                            '<div class="delete-modal-actions">' +
                                '<button type="button" class="delete-modal-cancel" id="appCloseKeep">Keep painting</button>' +
                                '<button type="button" class="app-close-save" id="appCloseSave">Save project</button>' +
                                '<button type="button" class="delete-modal-confirm btn--destructive" id="appCloseQuit">Close anyway</button>' +
                            '</div>' +
                        '</div>';
                    document.body.appendChild(el);
                    el.querySelector('#appCloseKeep').addEventListener('click', function () { answer(false); });
                    el.querySelector('#appCloseQuit').addEventListener('click', function () { answer(true); });
                    el.querySelector('#appCloseSave').addEventListener('click', saveFromModal);
                    // Backdrop click = the safe answer, same as Esc
                    el.addEventListener('mousedown', function (ev) { if (ev.target === el) answer(false); });
                    return el;
                }

                // What each thing the main process can ask looks like. Reload
                // and close are the same question — "this painting is not
                // saved" — so they wear the same prompt with the right verb.
                var ASKS = {
                    close: {
                        title: 'Close without saving?',
                        msg: 'This painting has unsaved work. Painting is not autosaved — closing now loses it.',
                        go: 'Close anyway', offerSave: true
                    },
                    reload: {
                        title: 'Reload without saving?',
                        msg: 'This painting has unsaved work. Reloading starts from a blank canvas — '
                            + 'painting is not autosaved.',
                        go: 'Reload anyway', offerSave: true
                    },
                    'hard-reload': {
                        title: 'Hard reload without saving?',
                        msg: 'This painting has unsaved work. Reloading starts from a blank canvas — '
                            + 'painting is not autosaved.',
                        go: 'Reload anyway', offerSave: true
                    },
                    nuclear: {
                        title: 'Clear all local data?',
                        msg: 'This wipes settings and the in-app preset list, and reloads. Presets saved to '
                            + 'your Preset Vault folder survive and come back on next launch — anything not '
                            + 'in the vault is lost.',
                        go: 'Reset everything', offerSave: false
                    }
                };

                function showModal(kind) {
                    if (!modal) modal = buildModal();
                    var spec = ASKS[kind] || ASKS.close;
                    var e = els();
                    // Reset from a previous (possibly already-saved) session
                    e.title.textContent = spec.title;
                    e.msg.textContent = spec.msg;
                    e.save.style.display = spec.offerSave ? '' : 'none';
                    e.quit.textContent = spec.go;
                    e.quit.classList.remove('app-close-safe');
                    modal.classList.add('show');
                    e.keep.focus();
                    onModalKey = function (ev) {
                        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); answer(false); }
                    };
                    document.addEventListener('keydown', onModalKey, true);
                }

                // Quiet, PARENTED native fallback — used when the in-app modal
                // cannot be built, and for Electron reload paths (dev F5) that
                // unload without going through the main-process close protocol.
                // type:'none' is deliberate: 'question'/'info'/'warning' all ring
                // the Windows message-box chime.
                function askNatively() {
                    var remote = require('@electron/remote');
                    var choice = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
                        type: 'none',
                        buttons: ['Keep painting', 'Discard unsaved work'],
                        defaultId: 0,
                        cancelId: 0,
                        noLink: true,
                        title: 'Unsaved work',
                        message: 'Discard unsaved work?',
                        detail: 'This painting has not been saved. Save a project (.fluid) or export first '
                            + 'if you want to keep it.'
                    });
                    return choice === 1;
                }

                if (ipc) {
                    ipc.on('app-ask', function (evt, req) {
                        var id = req && req.id;
                        var kind = (req && req.kind) || 'close';
                        var reply = function (ok) {
                            if (ok) window.__closeApproved = true; // keep beforeunload quiet
                            try { ipc.send('app-ask-response', { id: id, ok: !!ok }); } catch (_) {}
                        };
                        askKind = kind;
                        pendingReply = reply;
                        // Losing an unsaved painting is the only thing worth
                        // interrupting for — a wipe always asks, but a close or
                        // reload with nothing at stake just goes through.
                        if (kind !== 'nuclear' && !window.__unsavedWork) { reply(true); return; }
                        try {
                            showModal(kind);
                            // Ack only once the question is actually on screen —
                            // main's watchdog goes ahead without an answer, and
                            // that must stay true if this throws.
                            ipc.send('app-ask-ack', id);
                        } catch (err) {
                            console.warn('[ask] in-app prompt failed, falling back to a dialog', err);
                            var go = true;
                            try { ipc.send('app-ask-ack', id); go = askNatively(); } catch (_) {}
                            reply(go);
                        }
                    });
                }

                window.onbeforeunload = function (e) {
                    // Nothing to lose, or the user already answered "close" above
                    if (!window.__unsavedWork || window.__closeApproved) return undefined;
                    if (window.IS_ELECTRON) {
                        // Only reachable for reloads now — the close path is
                        // answered over IPC before any unload starts.
                        try {
                            if (askNatively()) { window.__unsavedWork = false; return undefined; }
                            e.returnValue = false;
                            return false;
                        } catch (err) { /* remote unavailable — fall through to the generic prompt (fail closed) */ }
                    }
                    // Web (and Electron fallback): standard browser confirm
                    e.preventDefault();
                    e.returnValue = '';
                    return '';
                };
            } catch(_) {}
        })();
